use std::{fs::File, path::Path, time::Duration};

use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};

use crate::{PlaybackState, PlaybackStatus};

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

pub(crate) trait AudioBackend: Send {
    fn load(&mut self, path: &Path, volume: f32) -> Result<u64, AudioBackendError>;
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

impl RodioBackend {
    fn ensure_stream(&mut self) -> Result<(), AudioBackendError> {
        if self.stream.is_none() {
            let mut stream = OutputStreamBuilder::open_default_stream().map_err(|error| {
                AudioBackendError::new(
                    "audio-device-unavailable",
                    format!("No usable audio output device is available: {error}"),
                )
            })?;
            stream.log_on_drop(false);
            self.stream = Some(stream);
        }
        Ok(())
    }
}

impl AudioBackend for RodioBackend {
    fn load(&mut self, path: &Path, volume: f32) -> Result<u64, AudioBackendError> {
        self.stop();
        let file = File::open(path).map_err(|error| {
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
        self.ensure_stream()?;
        let stream = self.stream.as_ref().expect("stream initialized");
        let sink = Sink::connect_new(stream.mixer());
        sink.set_volume(volume);
        sink.append(decoder);
        self.sink = Some(sink);
        Ok(duration_ms)
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
        }
    }

    pub(crate) fn prepare_track(&mut self, path: &Path, id: String) {
        self.backend.stop();
        self.state.track_id = Some(id);
        self.state.path = Some(path.to_string_lossy().into_owned());
        self.state.status = PlaybackStatus::Loading;
        self.state.position_ms = 0;
        self.state.duration_ms = 0;
    }

    pub(crate) fn start_prepared_track(&mut self, path: &Path) -> Result<(), AudioBackendError> {
        let effective_volume = if self.state.muted {
            0.0
        } else {
            self.state.volume
        };
        match self.backend.load(path, effective_volume) {
            Ok(duration_ms) => {
                self.state.duration_ms = duration_ms;
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
        self.state = PlaybackState {
            volume,
            muted,
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

    pub(crate) fn set_volume(&mut self, requested: f32) {
        let volume = if requested.is_finite() {
            requested.clamp(0.0, MAX_VOLUME)
        } else {
            0.0
        };
        self.state.volume = volume;
        self.state.muted = volume == 0.0;
        self.backend.set_volume(volume);
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
        loaded: bool,
        paused: bool,
        stopped: bool,
        finished: bool,
        position_ms: u64,
        volume: f32,
        fail_load: bool,
    }

    struct FakeBackend {
        shared: Arc<Mutex<FakeState>>,
        duration_ms: u64,
    }

    impl AudioBackend for FakeBackend {
        fn load(&mut self, _path: &Path, volume: f32) -> Result<u64, AudioBackendError> {
            let mut state = self.shared.lock().expect("fake backend");
            if state.fail_load {
                return Err(AudioBackendError::new(
                    "audio-device-unavailable",
                    "No fake device",
                ));
            }
            state.loaded = true;
            state.stopped = false;
            state.volume = volume;
            Ok(self.duration_ms)
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
        let shared = Arc::new(Mutex::new(FakeState::default()));
        let backend = FakeBackend {
            shared: Arc::clone(&shared),
            duration_ms,
        };
        (PlaybackEngine::new(Box::new(backend)), shared)
    }

    #[test]
    fn fake_backend_drives_play_pause_seek_volume_and_stop() {
        let (mut engine, shared) = engine(120_000);
        let path = Path::new("/music/example.flac");
        engine.prepare_track(path, "track-one".into());
        assert!(matches!(engine.state.status, PlaybackStatus::Loading));
        engine.start_prepared_track(path).expect("starts playback");
        assert!(matches!(engine.state.status, PlaybackStatus::Playing));
        assert_eq!(engine.state.duration_ms, 120_000);

        engine.pause();
        assert!(matches!(engine.state.status, PlaybackStatus::Paused));
        engine.resume();
        assert!(matches!(engine.state.status, PlaybackStatus::Playing));
        engine.seek(999_000).expect("seek is clamped");
        assert_eq!(engine.state.position_ms, 120_000);
        engine.set_volume(2.0);
        assert_eq!(engine.state.volume, 1.0);
        engine.set_volume(-0.5);
        assert!(engine.state.muted);
        engine.set_volume(f32::NAN);
        assert_eq!(engine.state.volume, 0.0);

        engine.stop();
        assert!(matches!(engine.state.status, PlaybackStatus::Stopped));
        assert!(shared.lock().expect("fake backend").stopped);
    }

    #[test]
    fn fake_backend_reports_ended_and_device_errors() {
        let (mut engine, shared) = engine(60_000);
        let path = Path::new("/music/example.mp3");
        engine.prepare_track(path, "track-two".into());
        engine.start_prepared_track(path).expect("starts playback");
        {
            let mut backend = shared.lock().expect("fake backend");
            backend.position_ms = 59_500;
            backend.finished = true;
        }
        assert!(engine.synchronize());
        assert!(matches!(engine.state.status, PlaybackStatus::Ended));
        assert_eq!(engine.state.position_ms, 60_000);

        shared.lock().expect("fake backend").fail_load = true;
        engine.prepare_track(path, "track-three".into());
        let error = engine
            .start_prepared_track(path)
            .expect_err("device error propagates");
        assert_eq!(error.code, "audio-device-unavailable");
        assert!(matches!(engine.state.status, PlaybackStatus::Error));
    }
}
