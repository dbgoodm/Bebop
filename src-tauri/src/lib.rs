use std::{
    collections::BTreeMap,
    fs::File,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

mod audio;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
#[cfg(any(debug_assertions, test))]
use specta_typescript::Typescript;
use symphonia::core::{
    formats::FormatOptions, io::MediaSourceStream, meta::MetadataOptions, probe::Hint,
};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_specta::{Builder, collect_commands};
use walkdir::{DirEntry, WalkDir};

use audio::{AudioBackendError, PlaybackEngine};

const SCAN_PROGRESS_EVENT: &str = "library://scan-progress";
const PLAYBACK_STATE_EVENT: &str = "playback://state";
const PLAYBACK_POSITION_EVENT: &str = "playback://position";
const PLAYBACK_ENDED_EVENT: &str = "playback://ended";
const PLAYBACK_ERROR_EVENT: &str = "playback://error";
const POSITION_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<BTreeMap<String, String>>,
}

impl AppError {
    fn state_unavailable(resource: &str) -> Self {
        Self {
            code: "state-unavailable".into(),
            message: "The desktop application state is unavailable.".into(),
            context: Some(BTreeMap::from([("resource".into(), resource.into())])),
        }
    }

    fn invalid_library_root(root: &str, error: std::io::Error) -> Self {
        Self {
            code: "library-root-unavailable".into(),
            message: "The selected library folder could not be accessed.".into(),
            context: Some(BTreeMap::from([
                ("root".into(), root.into()),
                ("reason".into(), error.to_string()),
            ])),
        }
    }

    fn library_not_selected() -> Self {
        Self {
            code: "library-not-selected".into(),
            message: "Select and scan a music library before starting playback.".into(),
            context: None,
        }
    }

    fn from_audio(error: AudioBackendError, path: Option<&Path>) -> Self {
        Self {
            code: error.code.into(),
            message: error.message,
            context: path
                .map(|path| BTreeMap::from([("path".into(), path.to_string_lossy().into_owned())])),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AudioExtension {
    Flac,
    Wav,
    Mp3,
    Ogg,
}

impl AudioExtension {
    fn from_path(path: &Path) -> Option<Self> {
        match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "flac" => Some(Self::Flac),
            "wav" => Some(Self::Wav),
            "mp3" => Some(Self::Mp3),
            "ogg" => Some(Self::Ogg),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    pub id: String,
    pub path: String,
    pub title: String,
    pub extension: AudioExtension,
    pub file_size: u64,
    pub duration_ms: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bit_depth: Option<u16>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScan {
    pub root: String,
    pub tracks: Vec<TrackSummary>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Stopped,
    Loading,
    Playing,
    Paused,
    Ended,
    Error,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub track_id: Option<String>,
    pub path: Option<String>,
    pub status: PlaybackStatus,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f32,
    pub muted: bool,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            track_id: None,
            path: None,
            status: PlaybackStatus::Stopped,
            position_ms: 0,
            duration_ms: 0,
            volume: 1.0,
            muted: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scanned_files: u64,
    pub discovered_tracks: u64,
    pub current_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    pub library_root: Option<String>,
    pub playback: PlaybackState,
}

/// Shared state owns the canonical library root and the sole native playback engine.
pub struct AppState {
    library_root: Arc<RwLock<Option<PathBuf>>>,
    playback: Arc<Mutex<PlaybackEngine>>,
    running: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            library_root: Arc::new(RwLock::new(None)),
            playback: Arc::new(Mutex::new(PlaybackEngine::default())),
            running: Arc::new(AtomicBool::new(true)),
        }
    }
}

#[derive(Default)]
struct AudioMetadata {
    duration_ms: Option<u64>,
    sample_rate: Option<u32>,
    channels: Option<u16>,
    bit_depth: Option<u16>,
}

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .is_some_and(|name| name.starts_with('.'))
}

fn track_id(path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_os_str().as_encoded_bytes());
    format!("track-{:x}", hasher.finalize())
}

fn display_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Untitled track")
        .to_owned()
}

fn probe_audio_metadata(path: &Path, extension: &AudioExtension) -> AudioMetadata {
    let Ok(file) = File::open(path) else {
        return AudioMetadata::default();
    };
    let mut hint = Hint::new();
    hint.with_extension(match extension {
        AudioExtension::Flac => "flac",
        AudioExtension::Wav => "wav",
        AudioExtension::Mp3 => "mp3",
        AudioExtension::Ogg => "ogg",
    });
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let Ok(probed) = symphonia::default::get_probe().format(
        &hint,
        source,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    ) else {
        return AudioMetadata::default();
    };
    let Some(track) = probed.format.default_track() else {
        return AudioMetadata::default();
    };
    let params = &track.codec_params;
    let duration_ms = params.time_base.zip(params.n_frames).map(|(base, frames)| {
        let time = base.calc_time(frames);
        time.seconds.saturating_mul(1_000) + (time.frac * 1_000.0) as u64
    });
    AudioMetadata {
        duration_ms,
        sample_rate: params.sample_rate,
        channels: params.channels.map(|channels| channels.count() as u16),
        bit_depth: params.bits_per_sample.map(|bits| bits as u16),
    }
}

fn canonical_track_path(root: &Path, requested_path: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(requested_path)
        .canonicalize()
        .map_err(|error| AppError {
            code: "track-unavailable".into(),
            message: "The requested track could not be accessed.".into(),
            context: Some(BTreeMap::from([("reason".into(), error.to_string())])),
        })?;
    if !path.starts_with(root) {
        return Err(AppError {
            code: "track-outside-library".into(),
            message: "The requested track is outside the active music library.".into(),
            context: None,
        });
    }
    Ok(path)
}

fn scan_library_at<F>(root: &Path, mut emit_progress: F) -> Result<LibraryScan, AppError>
where
    F: FnMut(&ScanProgress),
{
    let root = root
        .canonicalize()
        .map_err(|error| AppError::invalid_library_root(&root.to_string_lossy(), error))?;
    if !root.is_dir() {
        return Err(AppError {
            code: "library-root-not-directory".into(),
            message: "Please select a folder containing your music files.".into(),
            context: Some(BTreeMap::from([(
                "root".into(),
                root.to_string_lossy().into_owned(),
            )])),
        });
    }
    let mut tracks = Vec::new();
    let mut warnings = Vec::new();
    let mut scanned_files = 0;
    let walker = WalkDir::new(&root)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| entry.path() == root || !is_hidden(entry));
    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!("Skipped unreadable path: {error}"));
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        scanned_files += 1;
        let current_path = entry.path().to_string_lossy().into_owned();
        let Some(extension) = AudioExtension::from_path(entry.path()) else {
            emit_progress(&ScanProgress {
                scanned_files,
                discovered_tracks: tracks.len() as u64,
                current_path: Some(current_path),
            });
            continue;
        };
        let canonical_path = match canonical_track_path(&root, &current_path) {
            Ok(path) => path,
            Err(error) => {
                warnings.push(format!("Skipped file {current_path}: {}", error.message));
                continue;
            }
        };
        let metadata = match canonical_path.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                warnings.push(format!("Skipped unreadable file {current_path}: {error}"));
                continue;
            }
        };
        let audio = probe_audio_metadata(&canonical_path, &extension);
        tracks.push(TrackSummary {
            id: track_id(&canonical_path),
            path: canonical_path.to_string_lossy().into_owned(),
            title: display_title(&canonical_path),
            extension,
            file_size: metadata.len(),
            duration_ms: audio.duration_ms,
            sample_rate: audio.sample_rate,
            channels: audio.channels,
            bit_depth: audio.bit_depth,
        });
        emit_progress(&ScanProgress {
            scanned_files,
            discovered_tracks: tracks.len() as u64,
            current_path: Some(current_path),
        });
    }
    tracks.sort_by(|left, right| left.path.cmp(&right.path));
    emit_progress(&ScanProgress {
        scanned_files,
        discovered_tracks: tracks.len() as u64,
        current_path: None,
    });
    Ok(LibraryScan {
        root: root.to_string_lossy().into_owned(),
        tracks,
        warnings,
    })
}

#[tauri::command]
#[specta::specta]
fn scan_library(
    app: AppHandle,
    state: State<'_, AppState>,
    root: String,
) -> Result<LibraryScan, AppError> {
    let scan = scan_library_at(Path::new(&root), |progress| {
        let _ = app.emit(SCAN_PROGRESS_EVENT, progress);
    })?;
    *state
        .library_root
        .write()
        .map_err(|_| AppError::state_unavailable("library-root"))? =
        Some(PathBuf::from(&scan.root));
    Ok(scan)
}

fn active_library_root(state: &AppState) -> Result<PathBuf, AppError> {
    state
        .library_root
        .read()
        .map_err(|_| AppError::state_unavailable("library-root"))?
        .clone()
        .ok_or_else(AppError::library_not_selected)
}

fn emit_playback_state(app: &AppHandle, state: &PlaybackState) {
    let _ = app.emit(PLAYBACK_STATE_EVENT, state);
}

fn emit_playback_error(app: &AppHandle, error: &AppError) {
    let _ = app.emit(PLAYBACK_ERROR_EVENT, error);
}

#[tauri::command]
#[specta::specta]
fn play_track(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<PlaybackState, AppError> {
    let root = match active_library_root(&state) {
        Ok(root) => root,
        Err(error) => {
            emit_playback_error(&app, &error);
            return Err(error);
        }
    };
    let path = match canonical_track_path(&root, &path) {
        Ok(path) => path,
        Err(error) => {
            emit_playback_error(&app, &error);
            return Err(error);
        }
    };
    if AudioExtension::from_path(&path).is_none() {
        let error = AppError {
            code: "audio-format-unsupported".into(),
            message: "Bebop currently supports FLAC, WAV, MP3, and OGG playback.".into(),
            context: Some(BTreeMap::from([(
                "path".into(),
                path.to_string_lossy().into_owned(),
            )])),
        };
        emit_playback_error(&app, &error);
        return Err(error);
    }

    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.prepare_track(&path, track_id(&path));
    emit_playback_state(&app, &engine.state);
    if let Err(error) = engine.start_prepared_track(&path) {
        let error = AppError::from_audio(error, Some(&path));
        emit_playback_state(&app, &engine.state);
        emit_playback_error(&app, &error);
        return Err(error);
    }
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn pause_playback(app: AppHandle, state: State<'_, AppState>) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.pause();
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn resume_playback(app: AppHandle, state: State<'_, AppState>) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.resume();
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn stop_playback(app: AppHandle, state: State<'_, AppState>) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.stop();
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn seek_playback(
    app: AppHandle,
    state: State<'_, AppState>,
    position_ms: u64,
) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    if let Err(error) = engine.seek(position_ms) {
        let error = AppError::from_audio(error, engine.state.path.as_deref().map(Path::new));
        emit_playback_error(&app, &error);
        return Err(error);
    }
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn set_volume(
    app: AppHandle,
    state: State<'_, AppState>,
    volume: f32,
) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.set_volume(volume);
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn get_playback_state(state: State<'_, AppState>) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.synchronize();
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn get_desktop_state(state: State<'_, AppState>) -> Result<DesktopState, AppError> {
    let library_root = state
        .library_root
        .read()
        .map_err(|_| AppError::state_unavailable("library-root"))?
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.synchronize();
    let playback = engine.state.clone();
    Ok(DesktopState {
        library_root,
        playback,
    })
}

fn spawn_playback_monitor(app: AppHandle, state: &AppState) {
    let playback = Arc::clone(&state.playback);
    let running = Arc::clone(&state.running);
    thread::spawn(move || {
        while running.load(Ordering::Acquire) {
            thread::sleep(POSITION_INTERVAL);
            let Ok(mut engine) = playback.lock() else {
                break;
            };
            let active = matches!(
                engine.state.status,
                PlaybackStatus::Playing | PlaybackStatus::Paused
            );
            let ended = engine.synchronize();
            let snapshot = engine.state.clone();
            drop(engine);
            if active {
                let _ = app.emit(PLAYBACK_POSITION_EVENT, &snapshot);
            }
            if ended {
                emit_playback_state(&app, &snapshot);
                let _ = app.emit(PLAYBACK_ENDED_EVENT, &snapshot);
            }
        }
    });
}

fn shutdown_playback(state: &AppState) {
    state.running.store(false, Ordering::Release);
    if let Ok(mut engine) = state.playback.lock() {
        engine.shutdown();
    }
}

fn ipc_bindings() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            get_desktop_state,
            get_playback_state,
            pause_playback,
            play_track,
            resume_playback,
            scan_library,
            seek_playback,
            set_volume,
            stop_playback
        ])
        .typ::<AppError>()
        .typ::<LibraryScan>()
        .typ::<TrackSummary>()
        .typ::<PlaybackState>()
        .typ::<ScanProgress>()
        .dangerously_cast_bigints_to_number()
}

#[cfg(any(debug_assertions, test))]
fn export_typescript_bindings(bindings: &mut Builder<tauri::Wry>) {
    bindings
        .export(
            Typescript::default(),
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../apps/frontend/src/services/tauri-bindings.ts"),
        )
        .expect("failed to export TypeScript IPC bindings");
}

pub fn run() {
    #[allow(unused_mut)]
    let mut bindings = ipc_bindings();
    #[cfg(debug_assertions)]
    export_typescript_bindings(&mut bindings);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .setup(|app| {
            let state = app.state::<AppState>();
            spawn_playback_monitor(app.handle().clone(), &state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                shutdown_playback(&window.state::<AppState>());
            }
        })
        .invoke_handler(bindings.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running Bebop desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_directory(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("bebop-{name}-{unique}"));
        fs::create_dir_all(&path).expect("create temporary directory");
        path
    }

    #[test]
    fn scan_recognizes_supported_files_and_ignores_hidden_or_other_files() {
        let root = temporary_directory("scan");
        fs::create_dir_all(root.join("nested")).expect("create nested folder");
        fs::create_dir_all(root.join(".hidden")).expect("create hidden folder");
        for file in [
            "alpha.mp3",
            "nested/beta.FLAC",
            "nested/gamma.wav",
            "delta.ogg",
            ".hidden/skip.mp3",
            "notes.txt",
        ] {
            fs::write(root.join(file), b"not decoded in this test").expect("write fixture");
        }
        let scan = scan_library_at(&root, |_| {}).expect("scan succeeds");
        assert_eq!(scan.tracks.len(), 4);
        assert!(
            scan.tracks
                .iter()
                .all(|track| track.id.starts_with("track-"))
        );
        assert!(
            scan.tracks
                .iter()
                .all(|track| Path::new(&track.path).is_absolute())
        );
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn canonical_track_paths_cannot_escape_the_active_library() {
        let root = temporary_directory("root");
        let outside_root = temporary_directory("outside");
        let inside = root.join("inside.mp3");
        let outside = outside_root.join("outside.mp3");
        fs::write(&inside, b"inside").expect("write inside fixture");
        fs::write(&outside, b"outside").expect("write outside fixture");
        let canonical_root = root.canonicalize().expect("canonical root");
        assert!(canonical_track_path(&canonical_root, &inside.to_string_lossy()).is_ok());
        assert!(matches!(
            canonical_track_path(&canonical_root, &outside.to_string_lossy()),
            Err(AppError { code, .. }) if code == "track-outside-library"
        ));
        fs::remove_dir_all(root).expect("remove root fixture");
        fs::remove_dir_all(outside_root).expect("remove outside fixture");
    }

    #[test]
    fn exports_typescript_ipc_contracts() {
        let mut bindings = ipc_bindings();
        export_typescript_bindings(&mut bindings);
    }
}
