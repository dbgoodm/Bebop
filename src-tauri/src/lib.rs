use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

mod audio;
mod catalog;
mod enrichment;
mod integrations;
mod metadata;
mod persistence;
mod spectrum;
mod user_state;
mod watcher;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use specta::Type;
#[cfg(any(debug_assertions, test))]
use specta_typescript::Typescript;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_specta::{Builder, collect_commands};
use uuid::Uuid;

use audio::{AudioBackendError, PlaybackEngine};
pub use catalog::{
    AlbumDetail, AlbumSummary, ArtistDetail, ArtistReference, ArtistSummary, AudioExtension,
    CatalogQuery, DiscoveryCatalog, DiscoveryQuery, GenreSummary, LibraryRoot, LibraryScan,
    RootAvailability, ScanProgress, SortDirection, TrackPage, TrackSort, TrackSummary, WatchMode,
};
use catalog::{probe_audio_metadata, scan_library_at};
pub use enrichment::{EnrichmentCandidate, EnrichmentJob};
use enrichment::{MusicBrainzClient, enrich_track, patch_from_candidate};
use integrations::{
    IntegrationManager, clear_lastfm_session, qualifies_for_scrobble, set_lastfm_session,
};
pub use integrations::{IntegrationSettings, IntegrationStatus};
pub use metadata::{MetadataPatch, MetadataWriteResult};
use metadata::{cache_external_artwork, restore_backup, write_patch_atomically};
use persistence::DatabaseWorker;
pub use user_state::{
    FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary,
};
use watcher::LibraryWatcher;

const SCAN_PROGRESS_EVENT: &str = "library://scan-progress";
const LIBRARY_CHANGED_EVENT: &str = "library://changed";
const METADATA_JOB_PROGRESS_EVENT: &str = "metadata://job-progress";
const PLAYBACK_STATE_EVENT: &str = "playback://state";
const PLAYBACK_POSITION_EVENT: &str = "playback://position";
const PLAYBACK_ENDED_EVENT: &str = "playback://ended";
const PLAYBACK_ERROR_EVENT: &str = "playback://error";
const PLAYBACK_SPECTRUM_EVENT: &str = "playback://spectrum";
const POSITION_INTERVAL: Duration = Duration::from_millis(250);
const SPECTRUM_INTERVAL: Duration = Duration::from_millis(33);

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

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumFrame {
    pub sequence: u64,
    pub position_ms: u64,
    pub bins: Vec<u8>,
    pub peak: u8,
}

/// Shared state owns the database worker and the sole native playback engine.
pub struct AppState {
    database: DatabaseWorker,
    artwork_cache: PathBuf,
    musicbrainz: Arc<MusicBrainzClient>,
    integrations: IntegrationManager,
    watcher: LibraryWatcher,
    listening: Arc<Mutex<Option<ActiveListeningSession>>>,
    playback: Arc<Mutex<PlaybackEngine>>,
    visualization_enabled: Arc<AtomicBool>,
    spectrum_active: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

struct ActiveListeningSession {
    id: String,
    track_id: String,
    started_at: i64,
    played_ms: u64,
    scrobble_queued: bool,
    last_tick: Instant,
    last_persisted: Instant,
}

impl AppState {
    fn new(
        app: AppHandle,
        database: DatabaseWorker,
        artwork_cache: PathBuf,
        watcher: LibraryWatcher,
        preferences: &PlayerPreferences,
    ) -> Self {
        let mut playback = PlaybackEngine::default();
        playback.restore_preferences(
            preferences.volume,
            preferences.hifi_mode,
            preferences.selected_output_device_id.clone(),
        );
        playback.set_spectrum_enabled(preferences.visualization_enabled);
        Self {
            integrations: IntegrationManager::start(app, database.clone()),
            database,
            artwork_cache,
            musicbrainz: Arc::new(MusicBrainzClient::default()),
            watcher,
            listening: Arc::new(Mutex::new(None)),
            playback: Arc::new(Mutex::new(playback)),
            visualization_enabled: Arc::new(AtomicBool::new(preferences.visualization_enabled)),
            spectrum_active: Arc::new(AtomicBool::new(true)),
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
    let artwork_cache = state.artwork_cache.clone();
    let scan = tauri::async_runtime::spawn_blocking(move || {
        add_and_scan_root(&app, &database, &artwork_cache, root, None)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    let root = state.database.get_root(scan.root_id.clone())?;
    state.watcher.watch_root(&root)?;
    Ok(scan)
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
    let artwork_cache = state.artwork_cache.clone();
    let scan = tauri::async_runtime::spawn_blocking(move || {
        add_and_scan_root(&app, &database, &artwork_cache, path, label)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    let root = state.database.get_root(scan.root_id.clone())?;
    state.watcher.watch_root(&root)?;
    Ok(scan)
}

fn add_and_scan_root(
    app: &AppHandle,
    database: &DatabaseWorker,
    artwork_cache: &Path,
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
    scan_root(app, database, artwork_cache, root)
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
    if enabled {
        state.watcher.watch_root(&root)?;
    } else {
        state.watcher.unwatch_root(Path::new(&root.path))?;
    }
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
    let root = state.database.get_root(root_id.clone())?;
    state.watcher.unwatch_root(Path::new(&root.path))?;
    state.database.remove_root(root_id.clone())?;
    emit_library_changed(&app, "root-removed", Some(root_id), Vec::new());
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn cleanup_missing_tracks(
    app: AppHandle,
    state: State<'_, AppState>,
    root_id: Option<String>,
    confirmed: bool,
) -> Result<u64, AppError> {
    if !confirmed {
        return Err(AppError::new(
            "library-cleanup-not-confirmed",
            "Permanent catalog cleanup requires confirmation. Music files are never deleted.",
        ));
    }
    let removed = state.database.cleanup_missing_tracks(root_id.clone())?;
    emit_library_changed(&app, "missing-tracks-cleaned", root_id, Vec::new());
    Ok(removed)
}

#[tauri::command]
#[specta::specta]
fn get_persistent_player_state(
    state: State<'_, AppState>,
) -> Result<PersistentPlayerState, AppError> {
    state.database.load_player_state()
}

#[tauri::command]
#[specta::specta]
fn save_player_queue(state: State<'_, AppState>, track_ids: Vec<String>) -> Result<(), AppError> {
    state.database.save_queue(track_ids)
}

#[tauri::command]
#[specta::specta]
fn save_player_preferences(
    state: State<'_, AppState>,
    preferences: PlayerPreferences,
) -> Result<PlayerPreferences, AppError> {
    state.database.save_preferences(preferences)
}

#[tauri::command]
#[specta::specta]
fn set_theme_preference(
    state: State<'_, AppState>,
    theme_id: String,
) -> Result<PlayerPreferences, AppError> {
    let mut preferences = state.database.load_player_state()?.preferences;
    preferences.theme_id = theme_id;
    state.database.save_preferences(preferences)
}

#[tauri::command]
#[specta::specta]
fn set_library_view_preference(
    state: State<'_, AppState>,
    library_view: String,
) -> Result<PlayerPreferences, AppError> {
    if !matches!(
        library_view.as_str(),
        "artists" | "albums" | "genres" | "tracks"
    ) {
        return Err(AppError::new(
            "library-view-invalid",
            "The selected library view is not supported.",
        ));
    }
    let mut preferences = state.database.load_player_state()?.preferences;
    preferences.library_view = library_view;
    state.database.save_preferences(preferences)
}

#[tauri::command]
#[specta::specta]
fn set_visualization_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<PlayerPreferences, AppError> {
    state
        .visualization_enabled
        .store(enabled, Ordering::Release);
    update_spectrum_enabled(&state)?;
    let mut preferences = state.database.load_player_state()?.preferences;
    preferences.visualization_enabled = enabled;
    state.database.save_preferences(preferences)
}

#[tauri::command]
#[specta::specta]
fn set_spectrum_active(state: State<'_, AppState>, active: bool) -> Result<bool, AppError> {
    state.spectrum_active.store(active, Ordering::Release);
    update_spectrum_enabled(&state)?;
    Ok(active)
}

fn update_spectrum_enabled(state: &AppState) -> Result<(), AppError> {
    let enabled = state.visualization_enabled.load(Ordering::Acquire)
        && state.spectrum_active.load(Ordering::Acquire);
    state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?
        .set_spectrum_enabled(enabled);
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn get_integration_settings(state: State<'_, AppState>) -> Result<IntegrationSettings, AppError> {
    state.integrations.settings()
}

#[tauri::command]
#[specta::specta]
fn set_integration_settings(
    state: State<'_, AppState>,
    settings: IntegrationSettings,
) -> Result<IntegrationSettings, AppError> {
    state
        .integrations
        .update_settings(&state.database, settings)
}

#[tauri::command]
#[specta::specta]
fn get_integration_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<IntegrationStatus>, AppError> {
    state.integrations.statuses()
}

#[tauri::command]
#[specta::specta]
fn configure_lastfm_session(
    state: State<'_, AppState>,
    session_key: String,
) -> Result<Vec<IntegrationStatus>, AppError> {
    set_lastfm_session(&session_key)?;
    state.integrations.refresh();
    state.integrations.statuses()
}

#[tauri::command]
#[specta::specta]
fn disconnect_lastfm(state: State<'_, AppState>) -> Result<Vec<IntegrationStatus>, AppError> {
    clear_lastfm_session()?;
    state.integrations.refresh();
    state.integrations.statuses()
}

#[tauri::command]
#[specta::specta]
fn set_favorite(
    app: AppHandle,
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
    favorite: bool,
) -> Result<bool, AppError> {
    let result = state
        .database
        .set_favorite(entity_type, entity_id, favorite)?;
    emit_library_changed(&app, "favorites-changed", None, Vec::new());
    Ok(result)
}

#[tauri::command]
#[specta::specta]
fn list_favorites(state: State<'_, AppState>) -> Result<Vec<FavoriteReference>, AppError> {
    state.database.list_favorites()
}

#[tauri::command]
#[specta::specta]
fn create_playlist(state: State<'_, AppState>, name: String) -> Result<PlaylistSummary, AppError> {
    state.database.create_playlist(name)
}

#[tauri::command]
#[specta::specta]
fn list_playlists(state: State<'_, AppState>) -> Result<Vec<PlaylistSummary>, AppError> {
    state.database.list_playlists()
}

#[tauri::command]
#[specta::specta]
fn get_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<TrackSummary>, AppError> {
    state.database.get_playlist_tracks(playlist_id)
}

#[tauri::command]
#[specta::specta]
fn set_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
    track_ids: Vec<String>,
) -> Result<(), AppError> {
    state.database.set_playlist_tracks(playlist_id, track_ids)
}

#[tauri::command]
#[specta::specta]
fn get_home_snapshot(state: State<'_, AppState>) -> Result<HomeSnapshot, AppError> {
    state.database.get_home_snapshot()
}

fn validate_ui_preference_key(key: &str) -> Result<(), AppError> {
    if key.is_empty()
        || key.len() > 120
        || !key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(AppError::new(
            "ui-preference-key-invalid",
            "The UI preference key is invalid.",
        ));
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn get_ui_preference(state: State<'_, AppState>, key: String) -> Result<Option<String>, AppError> {
    validate_ui_preference_key(&key)?;
    state.database.get_ui_preference(key)
}

#[tauri::command]
#[specta::specta]
fn set_ui_preference(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    validate_ui_preference_key(&key)?;
    if value.len() > 64 * 1_024 {
        return Err(AppError::new(
            "ui-preference-value-too-large",
            "The UI preference value is too large.",
        ));
    }
    state.database.set_ui_preference(key, value)
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_root(
    app: AppHandle,
    state: State<'_, AppState>,
    root_id: String,
) -> Result<LibraryScan, AppError> {
    let database = state.database.clone();
    let artwork_cache = state.artwork_cache.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = database.get_root(root_id)?;
        scan_root(&app, &database, &artwork_cache, root)
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
    let artwork_cache = state.artwork_cache.clone();
    let scan = tauri::async_runtime::spawn_blocking(move || {
        let root = database.set_root_enabled(root_id, true)?;
        scan_root(&app, &database, &artwork_cache, root)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    let root = state.database.get_root(scan.root_id.clone())?;
    state.watcher.watch_root(&root)?;
    Ok(scan)
}

fn scan_root(
    app: &AppHandle,
    database: &DatabaseWorker,
    artwork_cache: &Path,
    root: LibraryRoot,
) -> Result<LibraryScan, AppError> {
    let scanned = match scan_library_at(Path::new(&root.path), artwork_cache, |progress| {
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
    let reconciliation = database.reconcile(root.id.clone(), scanned)?;
    emit_library_changed(
        app,
        "root-reconciled",
        Some(root.id.clone()),
        reconciliation.changed_track_ids,
    );
    Ok(LibraryScan {
        root_id: root.id,
        root: canonical_root,
        tracks: reconciliation.tracks,
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

#[tauri::command]
#[specta::specta]
fn query_discovery(
    state: State<'_, AppState>,
    query: DiscoveryQuery,
) -> Result<DiscoveryCatalog, AppError> {
    state.database.query_discovery(query)
}

#[tauri::command]
#[specta::specta]
fn get_artist_detail(
    state: State<'_, AppState>,
    artist_id: String,
) -> Result<ArtistDetail, AppError> {
    state.database.get_artist_detail(artist_id)
}

#[tauri::command]
#[specta::specta]
fn get_album_detail(state: State<'_, AppState>, album_id: String) -> Result<AlbumDetail, AppError> {
    state.database.get_album_detail(album_id)
}

#[tauri::command]
#[specta::specta]
fn get_metadata_draft(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<MetadataPatch>, AppError> {
    state.database.get_metadata_draft(track_id)
}

#[tauri::command]
#[specta::specta]
fn get_track_metadata(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<TrackSummary, AppError> {
    state.database.get_track(track_id)
}

#[tauri::command]
#[specta::specta]
fn save_metadata_draft(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: String,
    patch: MetadataPatch,
) -> Result<MetadataPatch, AppError> {
    let saved = state
        .database
        .save_metadata_draft(track_id.clone(), patch, "user".into())?;
    emit_library_changed(&app, "metadata-override", None, vec![track_id]);
    Ok(saved)
}

#[tauri::command]
#[specta::specta]
fn save_metadata_drafts(
    app: AppHandle,
    state: State<'_, AppState>,
    track_ids: Vec<String>,
    patch: MetadataPatch,
) -> Result<u32, AppError> {
    if track_ids.is_empty() {
        return Err(AppError::new(
            "metadata-batch-empty",
            "Select at least one track for batch editing.",
        ));
    }
    for track_id in &track_ids {
        state
            .database
            .save_metadata_draft(track_id.clone(), patch.clone(), "user-batch".into())?;
    }
    emit_library_changed(&app, "metadata-override", None, track_ids.clone());
    Ok(track_ids.len().try_into().unwrap_or(u32::MAX))
}

#[tauri::command]
#[specta::specta]
async fn write_metadata_to_file(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: String,
) -> Result<MetadataWriteResult, AppError> {
    ensure_track_not_playing(&state, &track_id)?;
    let database = state.database.clone();
    let task_track_id = track_id.clone();
    let path = state.database.resolve_track_id(track_id.clone())?;
    state.watcher.suppress_path(path.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        if path
            .metadata()
            .map_err(|error| AppError::new("track-unavailable", error.to_string()))?
            .permissions()
            .readonly()
        {
            return Err(AppError::new(
                "metadata-root-read-only",
                "Metadata cannot be written because this track is read-only.",
            ));
        }
        let patch = database
            .get_metadata_draft(task_track_id.clone())?
            .ok_or_else(|| {
                AppError::new(
                    "metadata-draft-not-found",
                    "Save a metadata draft before writing tags to the file.",
                )
            })?;
        let backup = write_patch_atomically(&path, &patch)
            .map_err(|error| AppError::new("metadata-write-failed", error))?;
        Ok(MetadataWriteResult {
            track_id: task_track_id,
            path: path.to_string_lossy().into_owned(),
            backup_path: backup.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    emit_library_changed(&app, "metadata-file-written", None, vec![track_id]);
    Ok(result)
}

#[tauri::command]
#[specta::specta]
async fn rollback_metadata_file(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: String,
) -> Result<MetadataWriteResult, AppError> {
    ensure_track_not_playing(&state, &track_id)?;
    let task_track_id = track_id.clone();
    let path = state.database.resolve_track_id(track_id.clone())?;
    state.watcher.suppress_path(path.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        let backup = restore_backup(&path)
            .map_err(|error| AppError::new("metadata-rollback-failed", error))?;
        Ok(MetadataWriteResult {
            track_id: task_track_id,
            path: path.to_string_lossy().into_owned(),
            backup_path: backup.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    emit_library_changed(&app, "metadata-file-rolled-back", None, vec![track_id]);
    Ok(result)
}

fn ensure_track_not_playing(state: &AppState, track_id: &str) -> Result<(), AppError> {
    let playback = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    if playback.state.track_id.as_deref() == Some(track_id)
        && matches!(
            playback.state.status,
            PlaybackStatus::Loading | PlaybackStatus::Playing | PlaybackStatus::Paused
        )
    {
        return Err(AppError::new(
            "metadata-track-active",
            "Stop this track before writing or restoring its file tags.",
        ));
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn set_musicbrainz_enabled(state: State<'_, AppState>, enabled: bool) -> bool {
    state.musicbrainz.set_enabled(enabled);
    enabled
}

#[tauri::command]
#[specta::specta]
fn get_musicbrainz_enabled(state: State<'_, AppState>) -> bool {
    state.musicbrainz.enabled()
}

#[tauri::command]
#[specta::specta]
async fn run_musicbrainz_enrichment(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: String,
) -> Result<EnrichmentJob, AppError> {
    let database = state.database.clone();
    let client = Arc::clone(&state.musicbrainz);
    let pending = EnrichmentJob {
        track_id: track_id.clone(),
        status: "searching".into(),
        candidates: Vec::new(),
        auto_applied: false,
        from_cache: false,
    };
    let _ = app.emit(METADATA_JOB_PROGRESS_EVENT, &pending);
    let job =
        tauri::async_runtime::spawn_blocking(move || enrich_track(&database, &client, track_id))
            .await
            .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    let _ = app.emit(METADATA_JOB_PROGRESS_EVENT, &job);
    Ok(job)
}

#[tauri::command]
#[specta::specta]
async fn apply_musicbrainz_candidate(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: String,
    candidate: EnrichmentCandidate,
) -> Result<MetadataPatch, AppError> {
    if !candidate.requires_review {
        return Err(AppError::new(
            "musicbrainz-review-not-required",
            "This exact match was already applied automatically.",
        ));
    }
    let database = state.database.clone();
    let client = Arc::clone(&state.musicbrainz);
    let artwork_cache = state.artwork_cache.clone();
    let task_track_id = track_id.clone();
    let saved = tauri::async_runtime::spawn_blocking(move || {
        let track = database.get_track(task_track_id.clone())?;
        let mut patch = patch_from_candidate(&track, &candidate);
        if let Some(release_id) = candidate.release_id.as_deref()
            && let Ok(Some((bytes, mime))) = client.cover_art(release_id)
            && let Ok(artwork) = cache_external_artwork(
                &bytes,
                &mime,
                "cover-art-archive",
                release_id,
                &artwork_cache,
            )
        {
            let artwork_id = artwork.id.clone();
            if database.save_artwork(artwork).is_ok() {
                patch.artwork_id = Some(artwork_id);
            }
        }
        database.save_metadata_draft(task_track_id, patch, "musicbrainz-review".into())
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))??;
    emit_library_changed(&app, "metadata-enriched", None, vec![track_id]);
    Ok(saved)
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

fn update_active_session(
    listening: &Mutex<Option<ActiveListeningSession>>,
    database: &DatabaseWorker,
    was_playing: bool,
    finish: Option<(bool, bool)>,
) {
    let Ok(mut active) = listening.lock() else {
        return;
    };
    let Some(session) = active.as_mut() else {
        return;
    };
    let now = Instant::now();
    if was_playing {
        session.played_ms = session
            .played_ms
            .saturating_add(now.duration_since(session.last_tick).as_millis() as u64);
    }
    session.last_tick = now;
    let should_persist =
        finish.is_some() || now.duration_since(session.last_persisted) >= Duration::from_secs(5);
    if should_persist {
        let (completed, skipped) = finish.unwrap_or((false, false));
        let _ = database.update_listening_session(
            session.id.clone(),
            session.played_ms,
            completed,
            skipped,
            finish.is_some(),
        );
        session.last_persisted = now;
    }
    if finish.is_some() {
        *active = None;
    }
}

fn start_active_session(state: &AppState, track_id: String, previous_was_playing: bool) {
    update_active_session(
        &state.listening,
        &state.database,
        previous_was_playing,
        Some((false, true)),
    );
    let id = Uuid::new_v4().to_string();
    if state
        .database
        .start_listening_session(id.clone(), track_id.clone())
        .is_ok()
    {
        let now = Instant::now();
        if let Ok(mut active) = state.listening.lock() {
            *active = Some(ActiveListeningSession {
                id,
                track_id,
                started_at: Utc::now().timestamp(),
                played_ms: 0,
                scrobble_queued: false,
                last_tick: now,
                last_persisted: now,
            });
        }
    }
}

fn maybe_queue_scrobble(
    listening: &Mutex<Option<ActiveListeningSession>>,
    database: &DatabaseWorker,
    integrations: &IntegrationManager,
) {
    let candidate = listening.lock().ok().and_then(|mut active| {
        let session = active.as_mut()?;
        if session.scrobble_queued {
            return None;
        }
        let track = database.get_track(session.track_id.clone()).ok()?;
        if !qualifies_for_scrobble(track.duration_ms.unwrap_or(0), session.played_ms) {
            return None;
        }
        session.scrobble_queued = true;
        Some((session.id.clone(), track, session.started_at))
    });
    if let Some((session_id, track, started_at)) = candidate {
        integrations.queue_scrobble(session_id, track, started_at);
    }
}

fn persist_audio_preferences(state: &AppState, engine: &PlaybackEngine) {
    let (volume, hifi_mode, selected_output_device_id) = engine.preferences();
    if let Ok(mut preferences) = state
        .database
        .load_player_state()
        .map(|value| value.preferences)
    {
        preferences.volume = volume;
        preferences.hifi_mode = hifi_mode;
        preferences.selected_output_device_id = selected_output_device_id;
        let _ = state.database.save_preferences(preferences);
    }
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
                message:
                    "Bebop supports FLAC, WAV, MP3, Ogg Vorbis, AAC, AIFF, and M4A/ALAC playback."
                        .into(),
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
    let previous_was_playing = matches!(engine.state.status, PlaybackStatus::Playing);
    engine.prepare_track(&path, track_id.clone());
    emit_playback_state(&app, &engine.state);
    if let Err(error) = engine.start_prepared_track(&path, source_bit_depth) {
        let error = AppError::from_audio(error, Some(&path));
        emit_playback_state(&app, &engine.state);
        emit_playback_error(&app, &error);
        drop(engine);
        update_active_session(
            &state.listening,
            &state.database,
            previous_was_playing,
            Some((false, true)),
        );
        return Err(error);
    }
    emit_playback_state(&app, &engine.state);
    let snapshot = engine.state.clone();
    drop(engine);
    start_active_session(&state, track_id.clone(), previous_was_playing);
    if let Ok(track) = state.database.get_track(track_id.clone()) {
        state
            .integrations
            .now_playing(track, Utc::now().timestamp());
    }
    let _ = state
        .database
        .save_playback_checkpoint(Some(track_id), snapshot.position_ms);
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
fn pause_playback(app: AppHandle, state: State<'_, AppState>) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    let was_playing = matches!(engine.state.status, PlaybackStatus::Playing);
    engine.pause();
    emit_playback_state(&app, &engine.state);
    let snapshot = engine.state.clone();
    drop(engine);
    update_active_session(&state.listening, &state.database, was_playing, None);
    state.integrations.clear_presence();
    let _ = state
        .database
        .save_playback_checkpoint(snapshot.track_id.clone(), snapshot.position_ms);
    Ok(snapshot)
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
    let snapshot = engine.state.clone();
    drop(engine);
    update_active_session(&state.listening, &state.database, false, None);
    if let Some(track_id) = &snapshot.track_id
        && let Ok(track) = state.database.get_track(track_id.clone())
    {
        state
            .integrations
            .now_playing(track, Utc::now().timestamp());
    }
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
fn stop_playback(app: AppHandle, state: State<'_, AppState>) -> Result<PlaybackState, AppError> {
    let mut engine = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?;
    let was_playing = matches!(engine.state.status, PlaybackStatus::Playing);
    let checkpoint_track = engine.state.track_id.clone();
    let checkpoint_position = engine.state.position_ms;
    engine.stop();
    emit_playback_state(&app, &engine.state);
    let snapshot = engine.state.clone();
    drop(engine);
    update_active_session(
        &state.listening,
        &state.database,
        was_playing,
        Some((false, true)),
    );
    state.integrations.clear_presence();
    let _ = state
        .database
        .save_playback_checkpoint(checkpoint_track, checkpoint_position);
    Ok(snapshot)
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
    let snapshot = engine.state.clone();
    drop(engine);
    let _ = state
        .database
        .save_playback_checkpoint(snapshot.track_id.clone(), snapshot.position_ms);
    Ok(snapshot)
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
    let snapshot = engine.state.clone();
    persist_audio_preferences(&state, &engine);
    Ok(snapshot)
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
    let was_playing = matches!(engine.state.status, PlaybackStatus::Playing);
    let checkpoint_track = engine.state.track_id.clone();
    let checkpoint_position = engine.state.position_ms;
    if let Err(error) = engine.select_output_device(device_id) {
        let error = AppError::from_audio(error, None);
        emit_playback_error(&app, &error);
        return Err(error);
    }
    emit_playback_state(&app, &engine.state);
    persist_audio_preferences(&state, &engine);
    let devices = engine
        .output_devices()
        .map_err(|error| AppError::from_audio(error, None))?;
    drop(engine);
    if checkpoint_track.is_some() {
        update_active_session(
            &state.listening,
            &state.database,
            was_playing,
            Some((false, true)),
        );
        let _ = state
            .database
            .save_playback_checkpoint(checkpoint_track, checkpoint_position);
    }
    Ok(devices)
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
    let snapshot = engine.state.clone();
    persist_audio_preferences(&state, &engine);
    Ok(snapshot)
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
    let listening = Arc::clone(&state.listening);
    let database = state.database.clone();
    let integrations = state.integrations.clone();
    thread::spawn(move || {
        let mut last_checkpoint = Instant::now();
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
            if ended {
                update_active_session(&listening, &database, true, Some((true, false)));
                integrations.clear_presence();
            } else {
                update_active_session(
                    &listening,
                    &database,
                    matches!(snapshot.status, PlaybackStatus::Playing),
                    None,
                );
                maybe_queue_scrobble(&listening, &database, &integrations);
            }
            if last_checkpoint.elapsed() >= Duration::from_secs(5) {
                let _ = database
                    .save_playback_checkpoint(snapshot.track_id.clone(), snapshot.position_ms);
                last_checkpoint = Instant::now();
            }
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

fn spawn_spectrum_emitter(app: AppHandle, state: &AppState) {
    let playback = Arc::clone(&state.playback);
    let running = Arc::clone(&state.running);
    let visualization_enabled = Arc::clone(&state.visualization_enabled);
    let spectrum_active = Arc::clone(&state.spectrum_active);
    thread::spawn(move || {
        while running.load(Ordering::Acquire) {
            thread::sleep(SPECTRUM_INTERVAL);
            if !visualization_enabled.load(Ordering::Acquire)
                || !spectrum_active.load(Ordering::Acquire)
            {
                continue;
            }
            let Some((analyzed, position_ms)) = playback.lock().ok().and_then(|mut engine| {
                let position_ms = engine.state.position_ms;
                engine.take_spectrum().map(|frame| (frame, position_ms))
            }) else {
                continue;
            };
            let _ = app.emit(
                PLAYBACK_SPECTRUM_EVENT,
                SpectrumFrame {
                    sequence: analyzed.sequence,
                    position_ms,
                    bins: analyzed.bins,
                    peak: analyzed.peak,
                },
            );
        }
    });
}

fn shutdown_playback(state: &AppState) {
    state.running.store(false, Ordering::Release);
    state.integrations.shutdown();
    if let Ok(mut engine) = state.playback.lock() {
        let was_playing = matches!(engine.state.status, PlaybackStatus::Playing);
        let _ = state
            .database
            .save_playback_checkpoint(engine.state.track_id.clone(), engine.state.position_ms);
        update_active_session(
            &state.listening,
            &state.database,
            was_playing,
            Some((false, false)),
        );
        engine.shutdown();
    }
}

fn ipc_bindings() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            add_library_root,
            apply_musicbrainz_candidate,
            cleanup_missing_tracks,
            configure_lastfm_session,
            create_playlist,
            disconnect_lastfm,
            get_album_detail,
            get_artist_detail,
            get_desktop_state,
            get_metadata_draft,
            get_home_snapshot,
            get_integration_settings,
            get_integration_statuses,
            get_persistent_player_state,
            get_playlist_tracks,
            get_musicbrainz_enabled,
            get_playback_state,
            get_track_metadata,
            get_ui_preference,
            list_library_roots,
            list_favorites,
            list_playlists,
            list_audio_output_devices,
            pause_playback,
            play_track,
            query_catalog_tracks,
            query_discovery,
            remove_library_root,
            rescan_library_root,
            resume_playback,
            restore_library_root,
            rollback_metadata_file,
            run_musicbrainz_enrichment,
            save_metadata_draft,
            save_metadata_drafts,
            save_player_preferences,
            save_player_queue,
            scan_library,
            select_audio_output_device,
            seek_playback,
            set_hifi_mode,
            set_integration_settings,
            set_library_root_enabled,
            set_library_view_preference,
            set_musicbrainz_enabled,
            set_favorite,
            set_playlist_tracks,
            set_spectrum_active,
            set_theme_preference,
            set_ui_preference,
            set_volume,
            set_visualization_enabled,
            stop_playback,
            write_metadata_to_file
        ])
        .typ::<AppError>()
        .typ::<AlbumDetail>()
        .typ::<AlbumSummary>()
        .typ::<ArtistDetail>()
        .typ::<ArtistSummary>()
        .typ::<AudioOutputDevice>()
        .typ::<AudioOutputState>()
        .typ::<CatalogQuery>()
        .typ::<DiscoveryCatalog>()
        .typ::<DiscoveryQuery>()
        .typ::<EnrichmentCandidate>()
        .typ::<EnrichmentJob>()
        .typ::<FavoriteReference>()
        .typ::<GenreSummary>()
        .typ::<LibraryChanged>()
        .typ::<LibraryRoot>()
        .typ::<LibraryScan>()
        .typ::<HomeSnapshot>()
        .typ::<IntegrationSettings>()
        .typ::<IntegrationStatus>()
        .typ::<MetadataPatch>()
        .typ::<MetadataWriteResult>()
        .typ::<PersistentPlayerState>()
        .typ::<PlaybackState>()
        .typ::<PlayerPreferences>()
        .typ::<PlaylistSummary>()
        .typ::<SpectrumFrame>()
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
            let artwork_cache = app_data.join("artwork");
            let watcher = LibraryWatcher::start(
                app.handle().clone(),
                database.clone(),
                artwork_cache.clone(),
            )
            .map_err(|error| std::io::Error::other(error.message))?;
            let roots = database
                .list_roots()
                .map_err(|error| std::io::Error::other(error.message))?;
            let restored_player = database
                .load_player_state()
                .map_err(|error| std::io::Error::other(error.message))?;
            for root in &roots {
                watcher
                    .watch_root(root)
                    .map_err(|error| std::io::Error::other(error.message))?;
            }
            app.manage(AppState::new(
                app.handle().clone(),
                database.clone(),
                artwork_cache.clone(),
                watcher,
                &restored_player.preferences,
            ));
            let state = app.state::<AppState>();
            spawn_playback_monitor(app.handle().clone(), &state);
            spawn_spectrum_emitter(app.handle().clone(), &state);
            let startup_app = app.handle().clone();
            thread::Builder::new()
                .name("bebop-startup-reconciliation".into())
                .spawn(move || {
                    for root in roots.into_iter().filter(|root| root.enabled) {
                        let _ = scan_root(&startup_app, &database, &artwork_cache, root);
                    }
                })?;
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
        let scan =
            scan_library_at(&root, &root.join(".artwork-cache"), |_| {}).expect("scan succeeds");
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
                scan_library_at(&root, &root.join(".artwork-cache"), |_| {}).expect("first scan"),
            )
            .expect("first reconciliation")
            .tracks;
        let second = database
            .reconcile(
                library_root.id,
                scan_library_at(&root, &root.join(".artwork-cache"), |_| {}).expect("second scan"),
            )
            .expect("second reconciliation")
            .tracks;
        assert_eq!(first[0].id, second[0].id);
        fs::remove_dir_all(root).expect("remove root fixture");
    }

    #[test]
    fn reconciliation_preserves_track_identity_after_a_move() {
        let root = temporary_directory("moved-track-id");
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.flac");
        fs::copy(&fixture, root.join("before.flac")).expect("copy fixture");
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
                scan_library_at(&root, &root.join(".artwork-cache"), |_| {}).expect("first scan"),
            )
            .expect("first reconciliation")
            .tracks;
        fs::rename(root.join("before.flac"), root.join("after.flac")).expect("move fixture");
        let moved = catalog::scan_track_at(
            &root,
            &root.join("after.flac"),
            &root.join(".artwork-cache"),
        )
        .expect("probe moved track")
        .expect("supported moved track");
        database
            .reconcile_paths(library_root.id, vec![moved], vec!["before.flac".into()])
            .expect("move reconciliation");
        let second = database
            .query_tracks(CatalogQuery::default())
            .expect("query moved track")
            .items;
        assert_eq!(first[0].id, second[0].id);
        assert_eq!(second[0].relative_path, "after.flac");
        fs::remove_dir_all(root).expect("remove root fixture");
    }

    #[test]
    fn tagged_fixture_populates_catalog_entities() {
        let root = temporary_directory("tagged-catalog");
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.flac");
        fs::copy(fixture, root.join("tagged.flac")).expect("copy tagged fixture");
        let database = DatabaseWorker::in_memory().expect("database starts");
        let library_root = database
            .add_root(
                root.canonicalize()
                    .expect("canonical root")
                    .to_string_lossy()
                    .into_owned(),
                "Tagged".into(),
            )
            .expect("root added");
        let tracks = database
            .reconcile(
                library_root.id,
                scan_library_at(&root, &root.join(".artwork-cache"), |_| {}).expect("fixture scan"),
            )
            .expect("fixture reconciliation")
            .tracks;
        assert_eq!(tracks[0].title, "Fixture FLAC");
        assert_eq!(tracks[0].artists[0].name, "Fixture Artist");
        assert_eq!(tracks[0].album, "Fixture Album");
        assert_eq!(tracks[0].genres, ["Jazz"]);
        let discovery = database
            .query_discovery(DiscoveryQuery {
                search: Some("Fixture".into()),
                offset: 0,
                limit: 20,
            })
            .expect("query discovery");
        assert_eq!(discovery.artists[0].name, "Fixture Artist");
        assert_eq!(discovery.albums[0].title, "Fixture Album");
        assert_eq!(discovery.genres[0].name, "Jazz");
        let detail = database
            .get_artist_detail(discovery.artists[0].id.clone())
            .expect("artist detail");
        assert_eq!(detail.tracks[0].id, tracks[0].id);
        database
            .save_metadata_draft(
                tracks[0].id.clone(),
                MetadataPatch {
                    title: Some("Database override".into()),
                    ..MetadataPatch::default()
                },
                "test".into(),
            )
            .expect("save override");
        let overridden = database
            .query_tracks(CatalogQuery::default())
            .expect("query override");
        assert_eq!(overridden.items[0].title, "Database override");
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn player_collections_and_home_statistics_are_sqlite_backed() {
        let root = temporary_directory("player-state");
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.flac");
        fs::copy(fixture, root.join("track.flac")).expect("copy fixture");
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
        let track = database
            .reconcile(
                library_root.id,
                scan_library_at(&root, &root.join(".artwork-cache"), |_| {}).expect("scan"),
            )
            .expect("reconcile")
            .tracks
            .remove(0);
        database
            .save_queue(vec![track.id.clone()])
            .expect("save queue");
        database
            .save_preferences(PlayerPreferences {
                volume: 0.4,
                hifi_mode: false,
                theme_id: "oled".into(),
                ..PlayerPreferences::default()
            })
            .expect("save preferences");
        database
            .set_favorite("track".into(), track.id.clone(), true)
            .expect("favorite track");
        let playlist = database
            .create_playlist("Fixture playlist".into())
            .expect("create playlist");
        database
            .set_playlist_tracks(playlist.id.clone(), vec![track.id.clone()])
            .expect("save playlist tracks");
        database
            .start_listening_session("session".into(), track.id.clone())
            .expect("start session");
        database
            .update_listening_session("session".into(), 30_000, true, false, true)
            .expect("finish session");

        let restored = database.load_player_state().expect("restore player state");
        assert_eq!(restored.queue[0].id, track.id);
        assert_eq!(restored.preferences.volume, 0.4);
        assert_eq!(database.list_favorites().expect("favorites").len(), 1);
        assert_eq!(
            database.list_playlists().expect("playlists")[0].track_count,
            1
        );
        assert_eq!(
            database
                .get_playlist_tracks(playlist.id)
                .expect("playlist tracks")[0]
                .id,
            track.id
        );
        let home = database.get_home_snapshot().expect("home snapshot");
        assert_eq!(home.total_tracks, 1);
        assert_eq!(home.total_listened_ms, 30_000);
        assert_eq!(home.top_artist.as_deref(), Some("Fixture Artist"));
        fs::remove_dir_all(root).expect("remove player fixture");
    }

    #[test]
    fn exports_typescript_ipc_contracts() {
        let mut bindings = ipc_bindings();
        export_typescript_bindings(&mut bindings);
    }
}
