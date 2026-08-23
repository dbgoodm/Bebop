use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

mod audio;
mod catalog;
mod persistence;

use serde::{Deserialize, Serialize};
use specta::Type;
#[cfg(any(debug_assertions, test))]
use specta_typescript::Typescript;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_specta::{Builder, collect_commands};

use audio::{AudioBackendError, PlaybackEngine};
pub use catalog::{
    AudioExtension, CatalogQuery, LibraryRoot, LibraryScan, RootAvailability, ScanProgress,
    SortDirection, TrackPage, TrackSort, TrackSummary, WatchMode,
};
use catalog::{probe_audio_metadata, scan_library_at};
use persistence::DatabaseWorker;

const SCAN_PROGRESS_EVENT: &str = "library://scan-progress";
const LIBRARY_CHANGED_EVENT: &str = "library://changed";
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
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            context: None,
        }
    }

    fn with_context(mut self, key: impl Into<String>, value: impl ToString) -> Self {
        self.context
            .get_or_insert_with(BTreeMap::new)
            .insert(key.into(), value.to_string());
        self
    }

    fn persistence(action: &'static str, reason: String) -> Self {
        Self::new(
            "database-error",
            "Bebop could not update its local catalog database.",
        )
        .with_context("action", action)
        .with_context("reason", reason)
    }

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
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_selected: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputState {
    pub device_id: String,
    pub device_name: String,
    pub source_sample_rate: u32,
    pub source_channels: u16,
    pub source_bit_depth: Option<u16>,
    pub output_sample_rate: u32,
    pub output_channels: u16,
    pub output_sample_format: String,
    pub native_sample_rate: bool,
    pub resampling: bool,
    pub software_gain: bool,
    pub exclusive_mode: bool,
    pub bit_perfect: bool,
    pub disclosure: String,
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
    pub hifi_mode: bool,
    pub output: Option<AudioOutputState>,
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
            hifi_mode: true,
            output: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    pub library_root: Option<String>,
    pub library_roots: Vec<LibraryRoot>,
    pub playback: PlaybackState,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChanged {
    pub kind: String,
    pub root_id: Option<String>,
    pub track_ids: Vec<String>,
}

/// Shared state owns the database worker and the sole native playback engine.
pub struct AppState {
    database: DatabaseWorker,
    playback: Arc<Mutex<PlaybackEngine>>,
    running: Arc<AtomicBool>,
}

impl AppState {
    fn new(database: DatabaseWorker) -> Self {
        Self {
            database,
            playback: Arc::new(Mutex::new(PlaybackEngine::default())),
            running: Arc::new(AtomicBool::new(true)),
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn scan_library(
    app: AppHandle,
    state: State<'_, AppState>,
    root: String,
) -> Result<LibraryScan, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || add_and_scan_root(&app, &database, root, None))
        .await
        .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

#[tauri::command]
#[specta::specta]
fn list_library_roots(state: State<'_, AppState>) -> Result<Vec<LibraryRoot>, AppError> {
    state.database.list_roots()
}

#[tauri::command]
#[specta::specta]
async fn add_library_root(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    label: Option<String>,
) -> Result<LibraryScan, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || add_and_scan_root(&app, &database, path, label))
        .await
        .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

fn add_and_scan_root(
    app: &AppHandle,
    database: &DatabaseWorker,
    path: String,
    label: Option<String>,
) -> Result<LibraryScan, AppError> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|error| AppError::invalid_library_root(&path, error))?;
    if !canonical.is_dir() {
        return Err(AppError::new(
            "library-root-not-directory",
            "Please select a folder containing your music files.",
        ));
    }
    let label = label
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            canonical
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Music")
                .to_owned()
        });
    let root = database.add_root(canonical.to_string_lossy().into_owned(), label)?;
    scan_root(app, database, root)
}

#[tauri::command]
#[specta::specta]
fn set_library_root_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    root_id: String,
    enabled: bool,
) -> Result<LibraryRoot, AppError> {
    let root = state.database.set_root_enabled(root_id.clone(), enabled)?;
    emit_library_changed(&app, "root-updated", Some(root_id), Vec::new());
    Ok(root)
}

#[tauri::command]
#[specta::specta]
fn remove_library_root(
    app: AppHandle,
    state: State<'_, AppState>,
    root_id: String,
    confirmed: bool,
) -> Result<(), AppError> {
    if !confirmed {
        return Err(AppError::new(
            "library-root-removal-not-confirmed",
            "Removing a library root requires confirmation. Music files are never deleted.",
        ));
    }
    state.database.remove_root(root_id.clone())?;
    emit_library_changed(&app, "root-removed", Some(root_id), Vec::new());
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_root(
    app: AppHandle,
    state: State<'_, AppState>,
    root_id: String,
) -> Result<LibraryScan, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = database.get_root(root_id)?;
        scan_root(&app, &database, root)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

#[tauri::command]
#[specta::specta]
async fn restore_library_root(
    app: AppHandle,
    state: State<'_, AppState>,
    root_id: String,
) -> Result<LibraryScan, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = database.set_root_enabled(root_id, true)?;
        scan_root(&app, &database, root)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

fn scan_root(
    app: &AppHandle,
    database: &DatabaseWorker,
    root: LibraryRoot,
) -> Result<LibraryScan, AppError> {
    let scanned = match scan_library_at(Path::new(&root.path), |progress| {
        let _ = app.emit(SCAN_PROGRESS_EVENT, progress);
    }) {
        Ok(scanned) => scanned,
        Err(error) => {
            let availability = if Path::new(&root.path).exists() {
                RootAvailability::PermissionError
            } else {
                RootAvailability::Offline
            };
            let _ = database.mark_root_unavailable(root.id.clone(), availability);
            emit_library_changed(app, "root-unavailable", Some(root.id), Vec::new());
            return Err(error);
        }
    };
    let warnings = scanned.warnings.clone();
    let canonical_root = scanned.canonical_root.clone();
    let tracks = database.reconcile(root.id.clone(), scanned)?;
    let track_ids = tracks.iter().map(|track| track.id.clone()).collect();
    emit_library_changed(app, "root-reconciled", Some(root.id.clone()), track_ids);
    Ok(LibraryScan {
        root_id: root.id,
        root: canonical_root,
        tracks,
        warnings,
    })
}

#[tauri::command]
#[specta::specta]
fn query_catalog_tracks(
    state: State<'_, AppState>,
    query: CatalogQuery,
) -> Result<TrackPage, AppError> {
    state.database.query_tracks(query)
}

fn emit_library_changed(
    app: &AppHandle,
    kind: &str,
    root_id: Option<String>,
    track_ids: Vec<String>,
) {
    let _ = app.emit(
        LIBRARY_CHANGED_EVENT,
        LibraryChanged {
            kind: kind.to_owned(),
            root_id,
            track_ids,
        },
    );
}

fn resolve_playback_track(
    state: &AppState,
    requested_path: &str,
) -> Result<(String, PathBuf), AppError> {
    let canonical = Path::new(requested_path).canonicalize().map_err(|error| {
        AppError::new(
            "track-unavailable",
            "The requested track could not be accessed.",
        )
        .with_context("reason", error)
    })?;
    state
        .database
        .resolve_track(canonical.to_string_lossy().into_owned())
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
    let (track_id, path) = match resolve_playback_track(&state, &path) {
        Ok(track) => track,
        Err(error) => {
            emit_playback_error(&app, &error);
            return Err(error);
        }
    };
    let extension = match AudioExtension::from_path(&path) {
        Some(extension) => extension,
        None => {
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
    };
    let source_bit_depth = probe_audio_metadata(&path, &extension).bit_depth;

    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.prepare_track(&path, track_id);
    emit_playback_state(&app, &engine.state);
    if let Err(error) = engine.start_prepared_track(&path, source_bit_depth) {
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
    if let Err(error) = engine.set_volume(volume) {
        let error = AppError::from_audio(error, engine.state.path.as_deref().map(Path::new));
        emit_playback_error(&app, &error);
        return Err(error);
    }
    emit_playback_state(&app, &engine.state);
    Ok(engine.state.clone())
}

#[tauri::command]
#[specta::specta]
fn list_audio_output_devices(
    state: State<'_, AppState>,
) -> Result<Vec<AudioOutputDevice>, AppError> {
    state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?
        .output_devices()
        .map_err(|error| AppError::from_audio(error, None))
}

#[tauri::command]
#[specta::specta]
fn select_audio_output_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: Option<String>,
) -> Result<Vec<AudioOutputDevice>, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    if let Err(error) = engine.select_output_device(device_id) {
        let error = AppError::from_audio(error, None);
        emit_playback_error(&app, &error);
        return Err(error);
    }
    emit_playback_state(&app, &engine.state);
    engine
        .output_devices()
        .map_err(|error| AppError::from_audio(error, None))
}

#[tauri::command]
#[specta::specta]
fn set_hifi_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.set_hifi_mode(enabled);
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
    let library_roots = state.database.list_roots()?;
    let library_root = library_roots
        .iter()
        .find(|root| root.enabled)
        .map(|root| root.path.clone());
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    engine.synchronize();
    let playback = engine.state.clone();
    Ok(DesktopState {
        library_root,
        library_roots,
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
            add_library_root,
            get_desktop_state,
            get_playback_state,
            list_library_roots,
            list_audio_output_devices,
            pause_playback,
            play_track,
            query_catalog_tracks,
            remove_library_root,
            rescan_library_root,
            resume_playback,
            restore_library_root,
            scan_library,
            select_audio_output_device,
            seek_playback,
            set_hifi_mode,
            set_library_root_enabled,
            set_volume,
            stop_playback
        ])
        .typ::<AppError>()
        .typ::<AudioOutputDevice>()
        .typ::<AudioOutputState>()
        .typ::<CatalogQuery>()
        .typ::<LibraryChanged>()
        .typ::<LibraryRoot>()
        .typ::<LibraryScan>()
        .typ::<PlaybackState>()
        .typ::<ScanProgress>()
        .typ::<SortDirection>()
        .typ::<TrackPage>()
        .typ::<TrackSort>()
        .typ::<TrackSummary>()
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
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            let database = DatabaseWorker::start(app_data.join("bebop.sqlite3"))
                .map_err(|error| std::io::Error::other(error.message))?;
            app.manage(AppState::new(database));
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
                .all(|track| !track.relative_path.starts_with('.'))
        );
        assert!(
            scan.tracks
                .iter()
                .all(|track| Path::new(&track.canonical_path).is_absolute())
        );
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn reconciliation_preserves_database_track_ids_across_rescans() {
        let root = temporary_directory("persistent-ids");
        fs::write(root.join("inside.mp3"), b"inside").expect("write fixture");
        let database = DatabaseWorker::in_memory().expect("database starts");
        let library_root = database
            .add_root(
                root.canonicalize()
                    .expect("canonical root")
                    .to_string_lossy()
                    .into_owned(),
                "Music".into(),
            )
            .expect("root added");
        let first = database
            .reconcile(
                library_root.id.clone(),
                scan_library_at(&root, |_| {}).expect("first scan"),
            )
            .expect("first reconciliation");
        let second = database
            .reconcile(
                library_root.id,
                scan_library_at(&root, |_| {}).expect("second scan"),
            )
            .expect("second reconciliation");
        assert_eq!(first[0].id, second[0].id);
        fs::remove_dir_all(root).expect("remove root fixture");
    }

    #[test]
    fn exports_typescript_ipc_contracts() {
        let mut bindings = ipc_bindings();
        export_typescript_bindings(&mut bindings);
    }
}
