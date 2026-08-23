use std::{fs::File, path::Path, time::Duration};

use rodio::{
    Decoder, Device, DeviceTrait, OutputStream, OutputStreamBuilder, Sink, Source,
    cpal::{SampleFormat, SampleRate, traits::HostTrait},
};
use sha2::{Digest, Sha256};

use crate::{AudioOutputDevice, AudioOutputState, PlaybackState, PlaybackStatus};

const MAX_VOLUME: f32 = 1.0;

#[derive(Debug)]
pub(crate) struct AudioBackendError {
    pub code: &'static str,
    pub message: String,
}

impl AudioBackendError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub(crate) struct AudioLoadRequest<'a> {
    pub path: &'a Path,
    pub volume: f32,
    pub hifi_mode: bool,
    pub selected_device_id: Option<&'a str>,
    pub source_bit_depth: Option<u16>,
}

pub(crate) struct LoadedAudio {
    pub duration_ms: u64,
    pub output: AudioOutputState,
}

pub(crate) trait AudioBackend: Send {
    fn load(&mut self, request: AudioLoadRequest<'_>) -> Result<LoadedAudio, AudioBackendError>;
    fn output_devices(&self) -> Result<Vec<AudioOutputDevice>, AudioBackendError>;
    fn pause(&mut self);
    fn resume(&mut self);
    fn stop(&mut self);
    fn seek(&mut self, position_ms: u64) -> Result<(), AudioBackendError>;
    fn set_volume(&mut self, volume: f32);
    fn position_ms(&self) -> u64;
    fn is_finished(&self) -> bool;
    fn shutdown(&mut self) {
        self.stop();
    }
}

#[derive(Default)]
pub(crate) struct RodioBackend {
    stream: Option<OutputStream>,
    sink: Option<Sink>,
}

fn output_device_id(name: &str, index: usize) -> String {
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    hasher.update(index.to_le_bytes());
    format!("output-{:x}", hasher.finalize())
}

fn available_device_handles() -> Result<Vec<(Device, AudioOutputDevice)>, AudioBackendError> {
    let host = rodio::cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|device| device.name().ok());
    let devices = host.output_devices().map_err(|error| {
        AudioBackendError::new(
            "audio-device-enumeration-failed",
            format!("Audio output devices could not be enumerated: {error}"),
        )
    })?;
    let mut default_assigned = false;
    let result = devices
        .enumerate()
        .map(|(index, device)| {
            let name = device
                .name()
                .unwrap_or_else(|_| format!("Audio output {}", index + 1));
            let is_default = !default_assigned && default_name.as_deref() == Some(name.as_str());
            default_assigned |= is_default;
            let descriptor = AudioOutputDevice {
                id: output_device_id(&name, index),
                name,
                is_default,
                is_selected: false,
            };
            (device, descriptor)
        })
        .collect::<Vec<_>>();
    if result.is_empty() {
        return Err(AudioBackendError::new(
            "audio-device-unavailable",
            "No audio output devices are available.",
        ));
    }
    Ok(result)
}

fn resolve_output_device(
    selected_device_id: Option<&str>,
) -> Result<(Device, AudioOutputDevice), AudioBackendError> {
    let devices = available_device_handles()?;
    if let Some(selected) = selected_device_id {
        return devices
            .into_iter()
            .find(|(_, descriptor)| descriptor.id == selected)
            .ok_or_else(|| {
                AudioBackendError::new(
                    "audio-device-not-found",
                    "The selected audio output device is no longer available.",
                )
            });
    }
    let selected_index = devices
        .iter()
        .position(|(_, descriptor)| descriptor.is_default)
        .unwrap_or(0);
    Ok(devices
        .into_iter()
        .nth(selected_index)
        .expect("available device index exists"))
}

fn sample_format_priority(format: SampleFormat, default: SampleFormat) -> u8 {
    if format == default {
        0
    } else if matches!(format, SampleFormat::F32) {
        1
    } else if matches!(format, SampleFormat::I32) {
        2
    } else {
        3
    }
}

fn open_output_stream(
    device: &Device,
    source_sample_rate: u32,
    source_channels: u16,
    hifi_mode: bool,
) -> Result<OutputStream, AudioBackendError> {
    if hifi_mode {
        let default_format = device
            .default_output_config()
            .map(|config| config.sample_format())
            .unwrap_or(SampleFormat::F32);
        if let Ok(configs) = device.supported_output_configs() {
            let mut native_configs = configs
                .filter(|config| {
                    config.channels() == source_channels
                        && config.min_sample_rate().0 <= source_sample_rate
                        && config.max_sample_rate().0 >= source_sample_rate
                })
                .collect::<Vec<_>>();
            native_configs.sort_by_key(|config| {
                sample_format_priority(config.sample_format(), default_format)
            });
            for range in native_configs {
                let config = range.with_sample_rate(SampleRate(source_sample_rate));
                let stream = OutputStreamBuilder::from_device(device.clone())
                    .map(|builder| builder.with_supported_config(&config))
                    .and_then(OutputStreamBuilder::open_stream);
                if let Ok(mut stream) = stream {
                    stream.log_on_drop(false);
                    return Ok(stream);
                }
            }
        }
    }

    let mut stream = OutputStreamBuilder::from_device(device.clone())
        .and_then(|builder| builder.open_stream_or_fallback())
        .map_err(|error| {
            AudioBackendError::new(
                "audio-device-unavailable",
                format!("The selected audio output could not be opened: {error}"),
            )
        })?;
    stream.log_on_drop(false);
    Ok(stream)
}

fn signal_path_disclosure(
    hifi_mode: bool,
    native_sample_rate: bool,
    software_gain: bool,
) -> String {
    if !native_sample_rate {
        "The device rejected the source rate, so Rodio is resampling to the active output rate."
            .into()
    } else if software_gain {
        "Native-rate playback is active, but software volume changes the decoded samples.".into()
    } else if hifi_mode {
        "Native-rate unity-gain playback is active. The operating system path is shared, so bit-perfect output is not asserted."
            .into()
    } else {
        "Native-rate playback is active. Shared-mode processing may still alter the signal.".into()
    }
}

impl AudioBackend for RodioBackend {
    fn load(&mut self, request: AudioLoadRequest<'_>) -> Result<LoadedAudio, AudioBackendError> {
        self.stop();
        self.stream = None;
        let file = File::open(request.path).map_err(|error| {
            AudioBackendError::new(
                "audio-file-unavailable",
                format!("The track could not be opened: {error}"),
            )
        })?;
        let decoder = Decoder::try_from(file).map_err(|error| {
            AudioBackendError::new(
                "audio-decode-failed",
                format!("The track could not be decoded: {error}"),
            )
        })?;
        let duration_ms = decoder
            .total_duration()
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        let source_sample_rate = decoder.sample_rate();
        let source_channels = decoder.channels();
        let (device, descriptor) = resolve_output_device(request.selected_device_id)?;
        let stream = open_output_stream(
            &device,
            source_sample_rate,
            source_channels,
            request.hifi_mode,
        )?;
        let config = stream.config();
        let native_sample_rate = config.sample_rate() == source_sample_rate;
        let software_gain = request.volume != 1.0;
        let output = AudioOutputState {
            device_id: descriptor.id,
            device_name: descriptor.name,
            source_sample_rate,
            source_channels,
            source_bit_depth: request.source_bit_depth,
            output_sample_rate: config.sample_rate(),
            output_channels: config.channel_count(),
            output_sample_format: format!("{:?}", config.sample_format()).to_lowercase(),
            native_sample_rate,
            resampling: !native_sample_rate,
            software_gain,
            exclusive_mode: false,
            bit_perfect: false,
            disclosure: signal_path_disclosure(
                request.hifi_mode,
                native_sample_rate,
                software_gain,
            ),
        };
        let sink = Sink::connect_new(stream.mixer());
        sink.set_volume(request.volume);
        sink.append(decoder);
        self.stream = Some(stream);
        self.sink = Some(sink);
        Ok(LoadedAudio {
            duration_ms,
            output,
        })
    }

    fn output_devices(&self) -> Result<Vec<AudioOutputDevice>, AudioBackendError> {
        Ok(available_device_handles()?
            .into_iter()
            .map(|(_, descriptor)| descriptor)
            .collect())
    }

    fn pause(&mut self) {
        if let Some(sink) = &self.sink {
            sink.pause();
        }
    }

    fn resume(&mut self) {
        if let Some(sink) = &self.sink {
            sink.play();
        }
    }

    fn stop(&mut self) {
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
    }

    fn seek(&mut self, position_ms: u64) -> Result<(), AudioBackendError> {
        let Some(sink) = &self.sink else {
            return Err(AudioBackendError::new(
                "playback-not-active",
                "There is no active track to seek.",
            ));
        };
        sink.try_seek(Duration::from_millis(position_ms))
            .map_err(|error| {
                AudioBackendError::new(
                    "audio-seek-failed",
                    format!("The decoder could not seek to that position: {error}"),
                )
            })
    }

    fn set_volume(&mut self, volume: f32) {
        if let Some(sink) = &self.sink {
            sink.set_volume(volume);
        }
    }

    fn position_ms(&self) -> u64 {
        self.sink
            .as_ref()
            .map(|sink| sink.get_pos().as_millis() as u64)
            .unwrap_or(0)
    }

    fn is_finished(&self) -> bool {
        self.sink.as_ref().is_some_and(Sink::empty)
    }

    fn shutdown(&mut self) {
        self.stop();
        self.stream = None;
    }
}

pub(crate) struct PlaybackEngine {
    pub state: PlaybackState,
    backend: Box<dyn AudioBackend>,
    selected_device_id: Option<String>,
}

impl Default for PlaybackEngine {
    fn default() -> Self {
        Self::new(Box::<RodioBackend>::default())
    }
}

impl PlaybackEngine {
    pub(crate) fn new(backend: Box<dyn AudioBackend>) -> Self {
        Self {
            state: PlaybackState::default(),
            backend,
            selected_device_id: None,
        }
    }

    pub(crate) fn prepare_track(&mut self, path: &Path, id: String) {
        self.backend.stop();
        self.state.track_id = Some(id);
        self.state.path = Some(path.to_string_lossy().into_owned());
        self.state.status = PlaybackStatus::Loading;
        self.state.position_ms = 0;
        self.state.duration_ms = 0;
        self.state.output = None;
    }

    pub(crate) fn start_prepared_track(
        &mut self,
        path: &Path,
        source_bit_depth: Option<u16>,
    ) -> Result<(), AudioBackendError> {
        let effective_volume = if self.state.muted {
            0.0
        } else {
            self.state.volume
        };
        let request = AudioLoadRequest {
            path,
            volume: effective_volume,
            hifi_mode: self.state.hifi_mode,
            selected_device_id: self.selected_device_id.as_deref(),
            source_bit_depth,
        };
        match self.backend.load(request) {
            Ok(loaded) => {
                self.state.duration_ms = loaded.duration_ms;
                self.state.output = Some(loaded.output);
                self.state.status = PlaybackStatus::Playing;
                Ok(())
            }
            Err(error) => {
                self.backend.stop();
                self.state.status = PlaybackStatus::Error;
                Err(error)
            }
        }
    }

    pub(crate) fn output_devices(&self) -> Result<Vec<AudioOutputDevice>, AudioBackendError> {
        let mut devices = self.backend.output_devices()?;
        for device in &mut devices {
            device.is_selected = self
                .selected_device_id
                .as_ref()
                .map_or(device.is_default, |selected| selected == &device.id);
        }
        Ok(devices)
    }

    pub(crate) fn select_output_device(
        &mut self,
        device_id: Option<String>,
    ) -> Result<(), AudioBackendError> {
        if let Some(selected) = &device_id {
            let devices = self.backend.output_devices()?;
            if !devices.iter().any(|device| &device.id == selected) {
                return Err(AudioBackendError::new(
                    "audio-device-not-found",
                    "The selected audio output device is no longer available.",
                ));
            }
        }
        self.stop();
        self.selected_device_id = device_id;
        Ok(())
    }

    pub(crate) fn set_hifi_mode(&mut self, enabled: bool) {
        self.state.hifi_mode = enabled;
        if enabled {
            self.state.volume = 1.0;
            self.state.muted = false;
            self.backend.set_volume(1.0);
        }
        if let Some(output) = &mut self.state.output {
            output.software_gain = self.state.volume != 1.0;
            output.bit_perfect = false;
            output.disclosure = signal_path_disclosure(
                self.state.hifi_mode,
                output.native_sample_rate,
                output.software_gain,
            );
        }
    }

    pub(crate) fn pause(&mut self) {
        if matches!(self.state.status, PlaybackStatus::Playing) {
            self.backend.pause();
            self.synchronize_position();
            self.state.status = PlaybackStatus::Paused;
        }
    }

    pub(crate) fn resume(&mut self) {
        if matches!(self.state.status, PlaybackStatus::Paused) {
            self.backend.resume();
            self.state.status = PlaybackStatus::Playing;
        }
    }

    pub(crate) fn stop(&mut self) {
        self.backend.stop();
        let volume = self.state.volume;
        let muted = self.state.muted;
        let hifi_mode = self.state.hifi_mode;
        self.state = PlaybackState {
            volume,
            muted,
            hifi_mode,
            ..PlaybackState::default()
        };
    }

    pub(crate) fn shutdown(&mut self) {
        self.backend.shutdown();
        self.stop();
    }

    pub(crate) fn seek(&mut self, requested_ms: u64) -> Result<(), AudioBackendError> {
        if matches!(
            self.state.status,
            PlaybackStatus::Stopped | PlaybackStatus::Loading | PlaybackStatus::Error
        ) {
            return Err(AudioBackendError::new(
                "playback-not-active",
                "There is no active track to seek.",
            ));
        }
        let position_ms = if self.state.duration_ms > 0 {
            requested_ms.min(self.state.duration_ms)
        } else {
            requested_ms
        };
        self.backend.seek(position_ms)?;
        self.state.position_ms = position_ms;
        Ok(())
    }

    pub(crate) fn set_volume(&mut self, requested: f32) -> Result<(), AudioBackendError> {
        let volume = if requested.is_finite() {
            requested.clamp(0.0, MAX_VOLUME)
        } else {
            0.0
        };
        if self.state.hifi_mode && volume != 1.0 {
            return Err(AudioBackendError::new(
                "hifi-volume-locked",
                "Hi-fi mode locks software volume at unity. Disable hi-fi mode to change volume.",
            ));
        }
        self.state.volume = volume;
        self.state.muted = volume == 0.0;
        self.backend.set_volume(volume);
        if let Some(output) = &mut self.state.output {
            output.software_gain = volume != 1.0;
            output.bit_perfect = false;
            output.disclosure = signal_path_disclosure(
                self.state.hifi_mode,
                output.native_sample_rate,
                output.software_gain,
            );
        }
        Ok(())
    }

    pub(crate) fn synchronize(&mut self) -> bool {
        if matches!(
            self.state.status,
            PlaybackStatus::Playing | PlaybackStatus::Paused
        ) {
            self.synchronize_position();
        }
        if matches!(self.state.status, PlaybackStatus::Playing) && self.backend.is_finished() {
            self.state.status = PlaybackStatus::Ended;
            if self.state.duration_ms > 0 {
                self.state.position_ms = self.state.duration_ms;
            }
            return true;
        }
        false
    }

    fn synchronize_position(&mut self) {
        let position = self.backend.position_ms();
        self.state.position_ms = if self.state.duration_ms > 0 {
            position.min(self.state.duration_ms)
        } else {
            position
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct FakeState {
        paused: bool,
        stopped: bool,
        finished: bool,
        position_ms: u64,
        volume: f32,
        fail_load: bool,
        hifi_requested: bool,
        native_rate_supported: bool,
        selected_device_id: Option<String>,
    }

    struct FakeBackend {
        shared: Arc<Mutex<FakeState>>,
        duration_ms: u64,
    }

    fn fake_devices() -> Vec<AudioOutputDevice> {
        vec![
            AudioOutputDevice {
                id: "default-output".into(),
                name: "Default DAC".into(),
                is_default: true,
                is_selected: false,
            },
            AudioOutputDevice {
                id: "usb-dac".into(),
                name: "USB DAC".into(),
                is_default: false,
                is_selected: false,
            },
        ]
    }

    impl AudioBackend for FakeBackend {
        fn load(
            &mut self,
            request: AudioLoadRequest<'_>,
        ) -> Result<LoadedAudio, AudioBackendError> {
            let mut state = self.shared.lock().expect("fake backend");
            if state.fail_load {
                return Err(AudioBackendError::new(
                    "audio-device-unavailable",
                    "No fake device",
                ));
            }
            state.stopped = false;
            state.volume = request.volume;
            state.hifi_requested = request.hifi_mode;
            state.selected_device_id = request.selected_device_id.map(str::to_owned);
            let native = request.hifi_mode && state.native_rate_supported;
            Ok(LoadedAudio {
                duration_ms: self.duration_ms,
                output: AudioOutputState {
                    device_id: request
                        .selected_device_id
                        .unwrap_or("default-output")
                        .into(),
                    device_name: if request.selected_device_id == Some("usb-dac") {
                        "USB DAC".into()
                    } else {
                        "Default DAC".into()
                    },
                    source_sample_rate: 44_100,
                    source_channels: 2,
                    source_bit_depth: request.source_bit_depth,
                    output_sample_rate: if native { 44_100 } else { 48_000 },
                    output_channels: 2,
                    output_sample_format: "i32".into(),
                    native_sample_rate: native,
                    resampling: !native,
                    software_gain: request.volume != 1.0,
                    exclusive_mode: false,
                    bit_perfect: false,
                    disclosure: signal_path_disclosure(
                        request.hifi_mode,
                        native,
                        request.volume != 1.0,
                    ),
                },
            })
        }

        fn output_devices(&self) -> Result<Vec<AudioOutputDevice>, AudioBackendError> {
            Ok(fake_devices())
        }

        fn pause(&mut self) {
            self.shared.lock().expect("fake backend").paused = true;
        }

        fn resume(&mut self) {
            self.shared.lock().expect("fake backend").paused = false;
        }

        fn stop(&mut self) {
            self.shared.lock().expect("fake backend").stopped = true;
        }

        fn seek(&mut self, position_ms: u64) -> Result<(), AudioBackendError> {
            self.shared.lock().expect("fake backend").position_ms = position_ms;
            Ok(())
        }

        fn set_volume(&mut self, volume: f32) {
            self.shared.lock().expect("fake backend").volume = volume;
        }

        fn position_ms(&self) -> u64 {
            self.shared.lock().expect("fake backend").position_ms
        }

        fn is_finished(&self) -> bool {
            self.shared.lock().expect("fake backend").finished
        }
    }

    fn engine(duration_ms: u64) -> (PlaybackEngine, Arc<Mutex<FakeState>>) {
        let shared = Arc::new(Mutex::new(FakeState {
            native_rate_supported: true,
            ..FakeState::default()
        }));
        let backend = FakeBackend {
            shared: Arc::clone(&shared),
            duration_ms,
        };
        (PlaybackEngine::new(Box::new(backend)), shared)
    }

    #[test]
    fn hifi_mode_requests_native_rate_and_locks_software_gain() {
        let (mut engine, shared) = engine(120_000);
        let path = Path::new("/music/example.flac");
        engine.prepare_track(path, "track-one".into());
        engine
            .start_prepared_track(path, Some(24))
            .expect("starts playback");
        let output = engine.state.output.as_ref().expect("output state");
        assert!(output.native_sample_rate);
        assert_eq!(output.source_bit_depth, Some(24));
        assert!(!output.bit_perfect);
        assert!(shared.lock().expect("fake backend").hifi_requested);
        let error = engine.set_volume(0.5).expect_err("unity gain is locked");
        assert_eq!(error.code, "hifi-volume-locked");
    }

    #[test]
    fn shared_mode_reports_resampling_and_allows_volume() {
        let (mut engine, _) = engine(120_000);
        let path = Path::new("/music/example.flac");
        engine.set_hifi_mode(false);
        engine.prepare_track(path, "track-one".into());
        engine
            .start_prepared_track(path, Some(24))
            .expect("starts playback");
        engine.set_volume(0.5).expect("shared volume changes");
        let output = engine.state.output.as_ref().expect("output state");
        assert!(output.resampling);
        assert!(output.software_gain);
        assert!(!output.bit_perfect);
    }

    #[test]
    fn leaving_hifi_mode_keeps_the_current_track_running_for_volume_changes() {
        let (mut engine, shared) = engine(120_000);
        let path = Path::new("/music/example.flac");
        engine.prepare_track(path, "track-one".into());
        engine
            .start_prepared_track(path, Some(24))
            .expect("starts playback");

        engine.set_hifi_mode(false);
        engine
            .set_volume(0.5)
            .expect("adjustable volume is enabled without stopping playback");

        assert!(matches!(engine.state.status, PlaybackStatus::Playing));
        assert_eq!(engine.state.volume, 0.5);
        assert!(!engine.state.hifi_mode);
        assert_eq!(shared.lock().expect("fake backend").volume, 0.5);
    }

    #[test]
    fn hifi_mode_falls_back_when_the_source_rate_is_unavailable() {
        let (mut engine, shared) = engine(120_000);
        shared.lock().expect("fake backend").native_rate_supported = false;
        let path = Path::new("/music/example.flac");
        engine.prepare_track(path, "track-one".into());
        engine
            .start_prepared_track(path, Some(24))
            .expect("fallback starts playback");
        let output = engine.state.output.as_ref().expect("output state");
        assert!(shared.lock().expect("fake backend").hifi_requested);
        assert_eq!(output.output_sample_rate, 48_000);
        assert!(output.resampling);
        assert!(!output.native_sample_rate);
        assert!(output.disclosure.contains("resampling"));
    }

    #[test]
    fn output_device_selection_is_validated_and_used() {
        let (mut engine, shared) = engine(120_000);
        let devices = engine.output_devices().expect("devices");
        assert!(devices[0].is_selected);
        engine
            .select_output_device(Some("usb-dac".into()))
            .expect("selects USB DAC");
        assert!(
            engine
                .output_devices()
                .expect("devices")
                .iter()
                .any(|device| device.id == "usb-dac" && device.is_selected)
        );
        let path = Path::new("/music/example.flac");
        engine.prepare_track(path, "track-one".into());
        engine
            .start_prepared_track(path, Some(24))
            .expect("starts playback");
        assert_eq!(
            shared
                .lock()
                .expect("fake backend")
                .selected_device_id
                .as_deref(),
            Some("usb-dac")
        );
        assert_eq!(
            engine
                .select_output_device(Some("missing".into()))
                .expect_err("rejects stale device")
                .code,
            "audio-device-not-found"
        );
    }

    #[test]
    fn fake_backend_drives_transport_and_error_states() {
        let (mut engine, shared) = engine(60_000);
        let path = Path::new("/music/example.mp3");
        engine.prepare_track(path, "track-two".into());
        engine
            .start_prepared_track(path, None)
            .expect("starts playback");
        engine.pause();
        assert!(matches!(engine.state.status, PlaybackStatus::Paused));
        engine.resume();
        engine.seek(999_000).expect("seek is clamped");
        assert_eq!(engine.state.position_ms, 60_000);
        {
            let mut backend = shared.lock().expect("fake backend");
            backend.finished = true;
        }
        assert!(engine.synchronize());
        assert!(matches!(engine.state.status, PlaybackStatus::Ended));

        shared.lock().expect("fake backend").fail_load = true;
        engine.prepare_track(path, "track-three".into());
        let error = engine
            .start_prepared_track(path, None)
            .expect_err("device error propagates");
        assert_eq!(error.code, "audio-device-unavailable");
        assert!(matches!(engine.state.status, PlaybackStatus::Error));
    }
}
