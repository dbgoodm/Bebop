use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

pub mod acquisition;
mod artist_info;
mod audio;
mod catalog;
mod enrichment;
mod fingerprint;
mod integrations;
mod lyrics;
mod metadata;
mod metadata_jobs;
mod metrics;
mod persistence;
mod song_dna;
mod spectrum;
mod theme_bundles;
mod updates;
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

pub use acquisition::{
    AcquisitionAlbumRequest, AcquisitionJobDto, AcquisitionJobStatus, AcquisitionProgressPayload,
    AcquisitionQueue, AcquisitionSettings, AcquisitionTrackRequest,
};
pub use artist_info::ArtistInformation;
use artist_info::load_artist_information;
use audio::{AudioBackendError, PlaybackEngine};
pub use catalog::{
    AlbumDetail, AlbumSummary, ArtistCatalogPage, ArtistCatalogQuery, ArtistDetail,
    ArtistReference, ArtistSummary, AudioExtension, AudioSpecs, CatalogQuery, DiscoveryCatalog,
    DiscoveryQuery, EntityAvailability, EntityProvenance, GenreSummary, LibraryRoot, LibraryScan,
    RemoteTrackPayload, RootAvailability, ScanProgress, SortDirection, TrackPage, TrackSort,
    TrackSummary, UnifiedAlbumDetail, UnifiedTrackSummary, WatchMode,
};
use catalog::{probe_audio_metadata, scan_library_at};
pub use enrichment::{EnrichmentCandidate, EnrichmentJob};
use enrichment::{
    MusicBrainzClient, enrich_track, patch_from_candidate, preserve_local_only_fields,
};
use integrations::{
    IntegrationManager, clear_lastfm_session, qualifies_for_scrobble, set_lastfm_session,
};
pub use integrations::{IntegrationSettings, IntegrationStatus};
use lyrics::resolve_lyrics;
pub use lyrics::{LyricLine, LyricsDocument, LyricsSource};
pub use metadata::{MetadataPatch, MetadataWriteResult};
use metadata::{
    cache_external_artwork, read_metadata_patch, restore_backup, write_patch_atomically,
};
use metadata_jobs::diff_metadata_patches;
pub use metadata_jobs::{
    MetadataDiff, MetadataJob, MetadataJobScope, MetadataJobStatus, MetadataReview,
};
use persistence::DatabaseWorker;
pub use song_dna::{
    AudioAnalysisProgress, AudioFeatures, AvailableTag, GeneratedPlaylist, Playlist,
    PlaylistGenerationRequest, PlaylistMood, PlaylistSelection, StarterPlaylistPreview,
};
pub use theme_bundles::{ImportedThemeBundle, ThemeAssetReference};
pub use updates::{UpdateProgress, UpdateStatus};
pub use user_state::{
    FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary,
};
use watcher::LibraryWatcher;

const SCAN_PROGRESS_EVENT: &str = "library://scan-progress";
const LIBRARY_CHANGED_EVENT: &str = "library://changed";
const METADATA_JOB_PROGRESS_EVENT: &str = "metadata://job-progress";
const DISCOGRAPHY_SYNC_EVENT: &str = "catalog://discography-sync";
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
    metadata_writes: Arc<Mutex<HashSet<String>>>,
    integrations: IntegrationManager,
    acquisition: Arc<AcquisitionQueue>,
    watcher: LibraryWatcher,
    listening: Arc<Mutex<Option<ActiveListeningSession>>>,
    playback: Arc<Mutex<PlaybackEngine>>,
    visualization_enabled: Arc<AtomicBool>,
    spectrum_active: Arc<AtomicBool>,
    audio_analysis_running: Arc<AtomicBool>,
    discography_sync_running: Arc<AtomicBool>,
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
        let musicbrainz = Arc::new(MusicBrainzClient::default());
        musicbrainz.attach_database(database.clone());
        let acquisition = Arc::new(AcquisitionQueue::new(
            Some(app.clone()),
            database.clone(),
            artwork_cache.clone(),
            None,
        ));
        Self {
            integrations: IntegrationManager::start(app, database.clone()),
            database,
            artwork_cache,
            musicbrainz,
            metadata_writes: Arc::new(Mutex::new(HashSet::new())),
            acquisition,
            watcher,
            listening: Arc::new(Mutex::new(None)),
            playback: Arc::new(Mutex::new(playback)),
            visualization_enabled: Arc::new(AtomicBool::new(preferences.visualization_enabled)),
            spectrum_active: Arc::new(AtomicBool::new(true)),
            audio_analysis_running: Arc::new(AtomicBool::new(false)),
            discography_sync_running: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(true)),
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn check_for_updates(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UpdateStatus, AppError> {
    let status = updates::check(app.clone(), state.database.clone(), true).await;
    updates::emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
#[specta::specta]
async fn install_update(app: AppHandle, confirmed: bool) -> Result<(), AppError> {
    updates::install(app, confirmed).await
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
        "artists" | "albums" | "genres" | "tracks" | "playlists"
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
fn acquire_track(
    state: State<'_, AppState>,
    request: AcquisitionTrackRequest,
) -> Result<AcquisitionJobDto, AppError> {
    state.acquisition.enqueue_track(request)
}

#[tauri::command]
#[specta::specta]
fn acquire_album(
    state: State<'_, AppState>,
    request: AcquisitionAlbumRequest,
) -> Result<Vec<AcquisitionJobDto>, AppError> {
    state.acquisition.enqueue_album(request)
}

#[tauri::command]
#[specta::specta]
fn get_acquisition_queue(state: State<'_, AppState>) -> Result<Vec<AcquisitionJobDto>, AppError> {
    state.acquisition.get_queue()
}

#[tauri::command]
#[specta::specta]
fn cancel_acquisition(state: State<'_, AppState>, job_id: String) -> Result<(), AppError> {
    state.acquisition.cancel(&job_id)
}

#[tauri::command]
#[specta::specta]
fn retry_acquisition(state: State<'_, AppState>, job_id: String) -> Result<(), AppError> {
    state.acquisition.retry(&job_id)
}

#[tauri::command]
#[specta::specta]
fn get_acquisition_settings(state: State<'_, AppState>) -> Result<AcquisitionSettings, AppError> {
    state.acquisition.get_settings()
}

#[tauri::command]
#[specta::specta]
fn save_acquisition_settings(
    state: State<'_, AppState>,
    settings: AcquisitionSettings,
) -> Result<AcquisitionSettings, AppError> {
    state.acquisition.save_settings(settings)
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
fn get_playlist(state: State<'_, AppState>, playlist_id: String) -> Result<Playlist, AppError> {
    state.database.get_playlist(playlist_id)
}

#[tauri::command]
#[specta::specta]
fn rename_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: String,
) -> Result<PlaylistSummary, AppError> {
    state.database.rename_playlist(playlist_id, name)
}

#[tauri::command]
#[specta::specta]
fn delete_playlist(state: State<'_, AppState>, playlist_id: String) -> Result<(), AppError> {
    state.database.delete_playlist(playlist_id)
}

#[tauri::command]
#[specta::specta]
fn duplicate_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: String,
) -> Result<PlaylistSummary, AppError> {
    state.database.duplicate_playlist(playlist_id, name)
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

fn generate_playlist_from_database(
    database: &DatabaseWorker,
    request: &PlaylistGenerationRequest,
) -> Result<GeneratedPlaylist, AppError> {
    let candidates = database.list_generation_candidates()?;
    let analyzed_track_count = candidates
        .iter()
        .filter(|candidate| candidate.features.is_some())
        .count() as u32;
    let ranked = song_dna::rank_candidates(&candidates, request);
    let mut selections = Vec::with_capacity(ranked.len());
    let mut total_duration_ms = 0_u64;
    for selection in ranked {
        let track = database.get_track(selection.track_id)?;
        total_duration_ms = total_duration_ms.saturating_add(track.duration_ms.unwrap_or(0));
        selections.push(PlaylistSelection {
            track,
            score: selection.score,
            explanation: selection.explanation,
        });
    }
    Ok(GeneratedPlaylist {
        selections,
        total_duration_ms,
        analyzed_track_count,
    })
}

#[tauri::command]
#[specta::specta]
async fn generate_playlist(
    state: State<'_, AppState>,
    request: PlaylistGenerationRequest,
) -> Result<GeneratedPlaylist, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        generate_playlist_from_database(&database, &request)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

fn list_matching_tracks_from_database(
    database: &DatabaseWorker,
    request: &PlaylistGenerationRequest,
) -> Result<Vec<PlaylistSelection>, AppError> {
    let candidates = database.list_generation_candidates()?;
    let matches = song_dna::matching_candidates(&candidates, request);
    let mut selections = Vec::with_capacity(matches.len());
    for selection in matches {
        let track = database.get_track(selection.track_id)?;
        selections.push(PlaylistSelection {
            track,
            score: selection.score,
            explanation: selection.explanation,
        });
    }
    Ok(selections)
}

/// The full pool of tracks matching a Song DNA filter set, scored and sorted
/// best-first with no diversity/count/duration capping — backs the playlist
/// creator's "browse matches" view, where a person hand-picks tracks rather
/// than accepting `generate_playlist`'s auto-curated selection.
#[tauri::command]
#[specta::specta]
async fn list_matching_tracks(
    state: State<'_, AppState>,
    request: PlaylistGenerationRequest,
) -> Result<Vec<PlaylistSelection>, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        list_matching_tracks_from_database(&database, &request)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

#[tauri::command]
#[specta::specta]
async fn create_generated_playlist(
    state: State<'_, AppState>,
    name: String,
    request: PlaylistGenerationRequest,
) -> Result<Playlist, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let generated = generate_playlist_from_database(&database, &request)?;
        let request_json = serde_json::to_string(&request)
            .map_err(|error| AppError::new("playlist-request-invalid", error.to_string()))?;
        let summary = database.save_generated_playlist(
            name,
            request_json,
            generated
                .selections
                .iter()
                .map(|selection| selection.track.id.clone())
                .collect(),
        )?;
        database.get_playlist(summary.id)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

#[tauri::command]
#[specta::specta]
fn list_available_tags(state: State<'_, AppState>) -> Result<Vec<AvailableTag>, AppError> {
    state.database.list_available_tags()
}

#[tauri::command]
#[specta::specta]
async fn list_starter_playlists(
    state: State<'_, AppState>,
) -> Result<Vec<StarterPlaylistPreview>, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        song_dna::starter_vibes()
            .into_iter()
            .map(|(vibe, request)| {
                let playlist = generate_playlist_from_database(&database, &request)?;
                Ok(StarterPlaylistPreview {
                    key: vibe.key.to_string(),
                    name: vibe.name.to_string(),
                    description: vibe.description.to_string(),
                    playlist,
                    request,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

#[tauri::command]
#[specta::specta]
async fn analyze_audio_features(
    app: AppHandle,
    state: State<'_, AppState>,
    track_ids: Vec<String>,
    force: bool,
) -> Result<Vec<AudioFeatures>, AppError> {
    if state
        .audio_analysis_running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err(AppError::new(
            "audio-analysis-running",
            "Song DNA analysis is already running.",
        ));
    }
    let database = state.database.clone();
    let running = Arc::clone(&state.audio_analysis_running);
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let mut analyzed = Vec::new();
            let mut failed_track_ids = Vec::new();
            let total = track_ids.len() as u32;
            for (index, track_id) in track_ids.into_iter().enumerate() {
                let result = if !force {
                    database.get_audio_features(track_id.clone())?
                } else {
                    None
                };
                let result = if let Some(features) = result {
                    Ok(features)
                } else {
                    database
                        .resolve_track_id(track_id.clone())
                        .and_then(|path| song_dna::analyze_file(&track_id, &path))
                        .and_then(|features| {
                            database.save_audio_features(features.clone())?;
                            Ok(features)
                        })
                };
                match result {
                    Ok(features) => {
                        // Best-effort — descriptor tags aren't required for
                        // analysis itself to be considered successful, and
                        // this also backfills tags for tracks analyzed
                        // before this existed (cached features included).
                        let names = song_dna::song_dna_descriptor_tags(&features);
                        let tags = names
                            .into_iter()
                            .map(|name| {
                                (
                                    name.to_string(),
                                    song_dna::TAG_CATEGORY_MOOD.to_string(),
                                    1.0,
                                )
                            })
                            .collect();
                        let _ = database.upsert_track_tags(
                            track_id.clone(),
                            song_dna::TAG_SOURCE_SONG_DNA.to_string(),
                            tags,
                        );
                        analyzed.push(features);
                    }
                    Err(_) => failed_track_ids.push(track_id.clone()),
                }
                let _ = app.emit(
                    "analysis://progress",
                    AudioAnalysisProgress {
                        completed: index as u32 + 1,
                        total,
                        current_track_id: Some(track_id),
                        failed_track_ids: failed_track_ids.clone(),
                    },
                );
                // Keep background analysis deliberately low-priority beside playback and scanning.
                thread::sleep(Duration::from_millis(12));
            }
            Ok(analyzed)
        })();
        running.store(false, Ordering::Release);
        result
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
}

#[tauri::command]
#[specta::specta]
fn get_home_snapshot(state: State<'_, AppState>) -> Result<HomeSnapshot, AppError> {
    state.database.get_home_snapshot()
}

#[tauri::command]
#[specta::specta]
async fn get_track_lyrics(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<LyricsDocument, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || resolve_lyrics(&database, track_id))
        .await
        .map_err(|error| AppError::state_unavailable(&format!("lyrics-worker:{error}")))?
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
    let _span = metrics::Span::new("tauri.query_catalog_tracks");
    state.database.query_tracks(query)
}

#[tauri::command]
#[specta::specta]
fn query_discovery(
    state: State<'_, AppState>,
    query: DiscoveryQuery,
) -> Result<DiscoveryCatalog, AppError> {
    let _span = metrics::Span::new("tauri.query_discovery");
    state.database.query_discovery(query)
}

#[tauri::command]
#[specta::specta]
fn query_artists_page(
    state: State<'_, AppState>,
    query: ArtistCatalogQuery,
) -> Result<ArtistCatalogPage, AppError> {
    let _span = metrics::Span::new("tauri.query_artists_page");
    state.database.query_artists_page(query)
}

#[tauri::command]
#[specta::specta]
async fn get_artist_detail(
    state: State<'_, AppState>,
    artist_id: String,
) -> Result<ArtistDetail, AppError> {
    let database = state.database.clone();
    let detail = database.get_artist_detail(artist_id.clone())?;
    let has_remote = detail
        .albums
        .iter()
        .any(|a| a.availability != crate::catalog::EntityAvailability::InLibrary);

    if !has_remote {
        let musicbrainz = Arc::clone(&state.musicbrainz);
        let artist_id_clone = artist_id.clone();
        let enriched_opt = tauri::async_runtime::spawn_blocking(move || {
            enrichment::refresh_artist_discography(
                &database,
                musicbrainz.as_ref(),
                &artist_id_clone,
            )
        })
        .await;

        if let Ok(Ok(enriched)) = enriched_opt {
            return Ok(enriched);
        }
    }

    Ok(detail)
}

#[tauri::command]
#[specta::specta]
async fn refresh_artist_discography(
    state: State<'_, AppState>,
    artist_id: String,
) -> Result<ArtistDetail, AppError> {
    let database = state.database.clone();
    let musicbrainz = Arc::clone(&state.musicbrainz);
    tauri::async_runtime::spawn_blocking(move || {
        enrichment::refresh_artist_discography(&database, musicbrainz.as_ref(), &artist_id)
    })
    .await
    .map_err(|error| AppError::state_unavailable(&format!("refresh-discography-worker:{error}")))?
}

/// Cache the MusicBrainz discography for every artist in the library.
///
/// Runs on a background thread and reports progress over `DISCOGRAPHY_SYNC_EVENT`.
/// Artists refreshed within `stale_after_days` are skipped, so this is safe to
/// call after every scan. MusicBrainz rate limiting means a large library takes a
/// while, but results are cached locally and the sync resumes where it left off.
#[tauri::command]
#[specta::specta]
async fn sync_library_discographies(
    app: AppHandle,
    state: State<'_, AppState>,
    stale_after_days: Option<u32>,
) -> Result<(), AppError> {
    if !state.musicbrainz.enabled() {
        return Err(AppError::new(
            "musicbrainz-disabled",
            "MusicBrainz enrichment is disabled. Enable it explicitly in Settings.",
        ));
    }
    if state.discography_sync_running.swap(true, Ordering::SeqCst) {
        return Err(AppError::new(
            "discography-sync-running",
            "A library discography sync is already running.",
        ));
    }

    let database = state.database.clone();
    let musicbrainz = Arc::clone(&state.musicbrainz);
    let running = Arc::clone(&state.running);
    let sync_running = Arc::clone(&state.discography_sync_running);
    let stale_after_days = stale_after_days.unwrap_or(30) as i64;

    thread::spawn(move || {
        let result = enrichment::sync_library_discographies(
            &database,
            musicbrainz.as_ref(),
            stale_after_days,
            &|| running.load(Ordering::SeqCst),
            &|progress| {
                let _ = app.emit(DISCOGRAPHY_SYNC_EVENT, &progress);
            },
        );
        if let Err(error) = result {
            let _ = app.emit(DISCOGRAPHY_SYNC_EVENT, &error);
        }
        sync_running.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn merge_catalog_entities(
    state: State<'_, AppState>,
    local_type: String,
    local_id: String,
    remote_id: String,
) -> Result<(), AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        database.record_entity_merge(local_type, local_id, remote_id, true)
    })
    .await
    .map_err(|error| AppError::state_unavailable(&format!("merge-entities-worker:{error}")))?
}

#[tauri::command]
#[specta::specta]
async fn unmerge_catalog_entities(
    state: State<'_, AppState>,
    local_type: String,
    local_id: String,
    remote_id: String,
) -> Result<(), AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        database.remove_entity_merge(local_type, local_id, remote_id)
    })
    .await
    .map_err(|error| AppError::state_unavailable(&format!("unmerge-entities-worker:{error}")))?
}

#[tauri::command]
#[specta::specta]
async fn get_artist_information(
    state: State<'_, AppState>,
    artist_id: String,
) -> Result<ArtistInformation, AppError> {
    let database = state.database.clone();
    let musicbrainz = Arc::clone(&state.musicbrainz);
    tauri::async_runtime::spawn_blocking(move || {
        load_artist_information(&database, musicbrainz.as_ref(), artist_id)
    })
    .await
    .map_err(|error| AppError::state_unavailable(&format!("artist-information-worker:{error}")))?
}

#[tauri::command]
#[specta::specta]
fn get_album_detail(state: State<'_, AppState>, album_id: String) -> Result<AlbumDetail, AppError> {
    state.database.get_album_detail(album_id)
}

#[tauri::command]
#[specta::specta]
async fn get_unified_album_detail(
    state: State<'_, AppState>,
    album_id: String,
) -> Result<UnifiedAlbumDetail, AppError> {
    let database = state.database.clone();
    let detail = database.get_unified_album_detail(album_id.clone())?;

    // No cached remote tracks yet: fetch this release's tracklist from MusicBrainz
    // once, store it, and serve every later visit from the local cache.
    if detail.tracks.iter().all(|t| t.is_local) || detail.tracks.is_empty() {
        if !state.musicbrainz.enabled() {
            return Ok(detail);
        }

        let musicbrainz = Arc::clone(&state.musicbrainz);
        let album_id_clone = album_id.clone();
        let album_artists = detail.album.artists.clone();

        let updated_detail = tauri::async_runtime::spawn_blocking(move || {
            let mut release = database.resolve_album_release_group(album_id_clone.clone())?;

            // A scanned album may have neither embedded MusicBrainz IDs nor a
            // cached remote release yet. Resolve each local album artist through
            // MusicBrainz and cache their discography, then retry the album match.
            // This makes opening an incomplete album sufficient to discover its
            // full tracklist without requiring a prior artist-page refresh.
            if release.is_none() && !album_id_clone.starts_with("remote:") {
                for artist in &album_artists {
                    if let Err(error) = enrichment::refresh_artist_discography(
                        &database,
                        musicbrainz.as_ref(),
                        &artist.id,
                    ) {
                        eprintln!(
                            "bebop.catalog album_id={} artist={} discography_error={:?}",
                            album_id_clone, artist.name, error
                        );
                    }
                    release = database.resolve_album_release_group(album_id_clone.clone())?;
                    if release.is_some() {
                        break;
                    }
                }
            }

            let Some(release) = release else {
                return database.get_unified_album_detail(album_id_clone);
            };

            if let Err(error) = enrichment::sync_release_tracklist(
                &database,
                musicbrainz.as_ref(),
                &release.id,
                &release.musicbrainz_release_group_id,
            ) {
                eprintln!(
                    "bebop.catalog album_id={} release_id={} tracklist_error={:?}",
                    album_id_clone, release.id, error
                );
                return Err(error);
            }
            if !album_id_clone.starts_with("remote:") {
                database.record_entity_merge(
                    "album".into(),
                    album_id_clone.clone(),
                    release.id,
                    true,
                )?;
            }
            database.get_unified_album_detail(album_id_clone)
        })
        .await
        .map_err(|e| AppError::new("resolve-tracks-failed", e.to_string()))??;

        return Ok(updated_detail);
    }

    Ok(detail)
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
async fn get_metadata_patch(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<MetadataPatch, AppError> {
    let database = state.database.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let track = database.get_track(track_id.clone())?;
        let path = database.resolve_track_id(track_id)?;
        let mut patch = read_metadata_patch(&path)
            .map_err(|error| AppError::new("metadata-read-failed", error))?;
        patch.artwork_id = track.artwork_id;
        Ok(patch)
    })
    .await
    .map_err(|error| AppError::new("background-task-failed", error.to_string()))?
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
fn preview_metadata_changes(
    state: State<'_, AppState>,
    track_ids: Vec<String>,
    patch: MetadataPatch,
    source: String,
    confidence: f64,
) -> Result<MetadataReview, AppError> {
    if track_ids.is_empty() {
        return Err(AppError::new(
            "metadata-review-empty",
            "Select at least one track to preview metadata changes.",
        ));
    }
    let mut affected_files = Vec::with_capacity(track_ids.len());
    let mut diffs = Vec::new();
    for track_id in track_ids {
        let track = state.database.get_track(track_id)?;
        affected_files.push(track.path.clone());
        let before = read_metadata_patch(std::path::Path::new(&track.path))
            .map_err(|error| AppError::new("metadata-read-failed", error))?;
        diffs.extend(diff_metadata_patches(
            &track.id,
            &before,
            &patch,
            &source,
            confidence.clamp(0.0, 1.0),
        ));
    }
    Ok(MetadataReview {
        affected_files,
        diffs,
    })
}

#[tauri::command]
#[specta::specta]
async fn write_metadata_to_file(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: String,
) -> Result<MetadataWriteResult, AppError> {
    let database = state.database.clone();
    let playback = Arc::clone(&state.playback);
    let metadata_writes = Arc::clone(&state.metadata_writes);
    let task_track_id = track_id.clone();
    let path = state.database.resolve_track_id(track_id.clone())?;
    state.watcher.suppress_path(path.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _reservation =
            wait_for_metadata_write_reservation(&playback, &metadata_writes, &task_track_id)?;
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
    let playback = Arc::clone(&state.playback);
    let metadata_writes = Arc::clone(&state.metadata_writes);
    let task_track_id = track_id.clone();
    let path = state.database.resolve_track_id(track_id.clone())?;
    state.watcher.suppress_path(path.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _reservation =
            wait_for_metadata_write_reservation(&playback, &metadata_writes, &task_track_id)?;
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
fn configure_acoustid_client_key(
    state: State<'_, AppState>,
    client_key: String,
) -> Result<bool, AppError> {
    state.musicbrainz.set_acoustid_key(&client_key)?;
    Ok(state.musicbrainz.acoustid_configured())
}

#[tauri::command]
#[specta::specta]
fn get_acoustid_configured(state: State<'_, AppState>) -> bool {
    state.musicbrainz.acoustid_configured()
}

#[tauri::command]
#[specta::specta]
fn list_metadata_jobs(state: State<'_, AppState>) -> Result<Vec<MetadataJob>, AppError> {
    state.database.list_metadata_jobs()
}

#[tauri::command]
#[specta::specta]
fn get_metadata_job(state: State<'_, AppState>, job_id: String) -> Result<MetadataJob, AppError> {
    state.database.get_metadata_job(job_id)
}

#[tauri::command]
#[specta::specta]
fn start_metadata_job(
    app: AppHandle,
    state: State<'_, AppState>,
    scope: MetadataJobScope,
    scope_id: Option<String>,
) -> Result<MetadataJob, AppError> {
    if !state.musicbrainz.enabled() {
        return Err(AppError::new(
            "musicbrainz-disabled",
            "Enable MusicBrainz before starting a metadata job.",
        ));
    }
    let job = state.database.create_metadata_job(scope, scope_id)?;
    spawn_metadata_job(
        app,
        state.database.clone(),
        Arc::clone(&state.musicbrainz),
        Arc::clone(&state.playback),
        Arc::clone(&state.metadata_writes),
        job.id.clone(),
        false,
    );
    Ok(job)
}

#[tauri::command]
#[specta::specta]
fn pause_metadata_job(state: State<'_, AppState>, job_id: String) -> Result<MetadataJob, AppError> {
    state
        .database
        .set_metadata_job_status(job_id, MetadataJobStatus::Paused, None, None)
}

#[tauri::command]
#[specta::specta]
fn cancel_metadata_job(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<MetadataJob, AppError> {
    state
        .database
        .set_metadata_job_status(job_id, MetadataJobStatus::Cancelled, None, None)
}

#[tauri::command]
#[specta::specta]
fn resume_metadata_job(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    retry_failed: bool,
) -> Result<MetadataJob, AppError> {
    let current = state.database.get_metadata_job(job_id.clone())?;
    if matches!(
        current.status,
        MetadataJobStatus::Complete | MetadataJobStatus::Cancelled
    ) {
        return Err(AppError::new(
            "metadata-job-terminal",
            "Completed or cancelled metadata jobs cannot be resumed.",
        ));
    }
    let job = state.database.set_metadata_job_status(
        job_id.clone(),
        MetadataJobStatus::Queued,
        None,
        None,
    )?;
    spawn_metadata_job(
        app,
        state.database.clone(),
        Arc::clone(&state.musicbrainz),
        Arc::clone(&state.playback),
        Arc::clone(&state.metadata_writes),
        job_id,
        retry_failed,
    );
    Ok(job)
}

fn spawn_metadata_job(
    app: AppHandle,
    database: DatabaseWorker,
    client: Arc<MusicBrainzClient>,
    playback: Arc<Mutex<PlaybackEngine>>,
    metadata_writes: Arc<Mutex<HashSet<String>>>,
    job_id: String,
    retry_errors: bool,
) {
    tauri::async_runtime::spawn_blocking(move || {
        let track_ids = match database.pending_metadata_job_tracks(job_id.clone(), retry_errors) {
            Ok(track_ids) => track_ids,
            Err(error) => {
                let _ = database.set_metadata_job_status(
                    job_id,
                    MetadataJobStatus::Error,
                    None,
                    Some(error.message),
                );
                return;
            }
        };
        for track_id in track_ids {
            let Ok(current_job) = database.get_metadata_job(job_id.clone()) else {
                return;
            };
            if matches!(
                current_job.status,
                MetadataJobStatus::Paused | MetadataJobStatus::Cancelled
            ) {
                return;
            }
            let _ = database.set_metadata_job_status(
                job_id.clone(),
                MetadataJobStatus::Running,
                Some(track_id.clone()),
                None,
            );

            if !wait_for_track_release(&app, &database, &playback, &job_id, &track_id) {
                return;
            }

            // Independent of MusicBrainz matching below — Last.fm's
            // track.getTopTags needs only artist/title text, so it runs
            // even for tracks with no confirmed recording match.
            if integrations::lastfm_tag_lookup_enabled(&database)
                && let Ok(track) = database.get_track(track_id.clone())
                && let Ok(names) = integrations::fetch_lastfm_top_tags(&track)
                && !names.is_empty()
            {
                let tags = names
                    .into_iter()
                    .map(|name| (name, song_dna::TAG_CATEGORY_MOOD.to_string(), 1.0))
                    .collect();
                let _ = database.upsert_track_tags(
                    track_id.clone(),
                    song_dna::TAG_SOURCE_LASTFM.to_string(),
                    tags,
                );
            }

            let result = enrich_track(&database, &client, track_id.clone());
            let job = match result {
                Ok(enrichment) => {
                    let candidates_json = serde_json::to_string(&enrichment.candidates).ok();
                    let source = enrichment
                        .candidates
                        .first()
                        .map(|candidate| candidate.source.clone());
                    if enrichment.auto_applied {
                        if !wait_for_track_release(&app, &database, &playback, &job_id, &track_id) {
                            return;
                        }
                        let reservation = wait_for_metadata_write_reservation(
                            &playback,
                            &metadata_writes,
                            &track_id,
                        );
                        let written =
                            database
                                .resolve_track_id(track_id.clone())
                                .and_then(|path| {
                                    let _reservation = reservation?;
                                    let patch = database
                                        .get_metadata_draft(track_id.clone())?
                                        .ok_or_else(|| {
                                            AppError::new(
                                                "metadata-draft-not-found",
                                                "The automatic match did not create a draft.",
                                            )
                                        })?;
                                    write_patch_atomically(&path, &patch).map_err(|error| {
                                        AppError::new("metadata-write-failed", error)
                                    })?;
                                    Ok(())
                                });
                        match written {
                            Ok(()) => database.record_metadata_job_track(
                                job_id.clone(),
                                track_id.clone(),
                                "written".into(),
                                source,
                                None,
                                None,
                                candidates_json,
                            ),
                            Err(error) => database.record_metadata_job_track(
                                job_id.clone(),
                                track_id.clone(),
                                "error".into(),
                                source,
                                None,
                                serde_json::to_string(&error).ok(),
                                candidates_json,
                            ),
                        }
                    } else {
                        database.record_metadata_job_track(
                            job_id.clone(),
                            track_id.clone(),
                            "review".into(),
                            source,
                            None,
                            None,
                            candidates_json,
                        )
                    }
                }
                Err(error) => database.record_metadata_job_track(
                    job_id.clone(),
                    track_id.clone(),
                    "error".into(),
                    None,
                    None,
                    serde_json::to_string(&error).ok(),
                    None,
                ),
            };
            if let Ok(job) = job {
                let _ = app.emit(METADATA_JOB_PROGRESS_EVENT, &job);
            }
        }
        if let Ok(job) = database.get_metadata_job(job_id.clone()) {
            let status = if job.review_tracks > 0 {
                MetadataJobStatus::Review
            } else if job.failed_tracks > 0 || job.deferred_tracks > 0 {
                MetadataJobStatus::Error
            } else {
                MetadataJobStatus::Complete
            };
            if let Ok(job) = database.set_metadata_job_status(job_id, status, None, None) {
                let _ = app.emit(METADATA_JOB_PROGRESS_EVENT, &job);
            }
        }
    });
}

fn wait_for_track_release(
    app: &AppHandle,
    database: &DatabaseWorker,
    playback: &Arc<Mutex<PlaybackEngine>>,
    job_id: &str,
    track_id: &str,
) -> bool {
    while track_is_active(playback, track_id) {
        if let Ok(job) = database.record_metadata_job_track(
            job_id.into(),
            track_id.into(),
            "deferred".into(),
            None,
            None,
            None,
            None,
        ) {
            let _ = app.emit(METADATA_JOB_PROGRESS_EVENT, &job);
        }
        thread::sleep(Duration::from_millis(250));
        let Ok(job) = database.get_metadata_job(job_id.into()) else {
            return false;
        };
        if matches!(
            job.status,
            MetadataJobStatus::Paused | MetadataJobStatus::Cancelled
        ) {
            return false;
        }
    }
    true
}

fn track_is_active(playback: &Arc<Mutex<PlaybackEngine>>, track_id: &str) -> bool {
    playback.lock().is_ok_and(|playback| {
        playback.state.track_id.as_deref() == Some(track_id)
            && matches!(
                playback.state.status,
                PlaybackStatus::Loading | PlaybackStatus::Playing | PlaybackStatus::Paused
            )
    })
}

struct MetadataWriteReservation {
    track_id: String,
    writes: Arc<Mutex<HashSet<String>>>,
}

impl Drop for MetadataWriteReservation {
    fn drop(&mut self) {
        if let Ok(mut writes) = self.writes.lock() {
            writes.remove(&self.track_id);
        }
    }
}

fn wait_for_metadata_write_reservation(
    playback: &Arc<Mutex<PlaybackEngine>>,
    writes: &Arc<Mutex<HashSet<String>>>,
    track_id: &str,
) -> Result<MetadataWriteReservation, AppError> {
    loop {
        let mut active_writes = writes
            .lock()
            .map_err(|_| AppError::state_unavailable("metadata-write-coordinator"))?;
        let active = playback
            .lock()
            .map_err(|_| AppError::state_unavailable("playback-engine"))
            .map(|playback| {
                playback.state.track_id.as_deref() == Some(track_id)
                    && matches!(
                        playback.state.status,
                        PlaybackStatus::Loading | PlaybackStatus::Playing | PlaybackStatus::Paused
                    )
            })?;
        if !active && !active_writes.contains(track_id) {
            active_writes.insert(track_id.into());
            return Ok(MetadataWriteReservation {
                track_id: track_id.into(),
                writes: Arc::clone(writes),
            });
        }
        drop(active_writes);
        thread::sleep(Duration::from_millis(250));
    }
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
        preserve_local_only_fields(&track, &mut patch);
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
    let metadata_writes = state
        .metadata_writes
        .lock()
        .map_err(|_| AppError::state_unavailable("metadata-write-coordinator"))?;
    if metadata_writes.contains(&track_id) {
        return Err(AppError::new(
            "metadata-write-active",
            "This track is being verified and tagged. Try playback again when the metadata write finishes.",
        ));
    }
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
    drop(metadata_writes);
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
    state.acquisition.shutdown();
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

#[tauri::command]
#[specta::specta]
fn stage_theme_asset(
    app: AppHandle,
    staging_key: String,
    source_path: String,
) -> Result<ThemeAssetReference, AppError> {
    theme_bundles::stage_theme_asset(app, staging_key, source_path)
}

#[tauri::command]
#[specta::specta]
fn cancel_theme_asset_staging(app: AppHandle, staging_key: String) -> Result<(), AppError> {
    theme_bundles::cancel_theme_asset_staging(app, staging_key)
}

#[tauri::command]
#[specta::specta]
fn promote_theme_assets(
    app: AppHandle,
    staging_key: String,
    theme_id: String,
    overwrite: bool,
) -> Result<(), AppError> {
    theme_bundles::promote_theme_assets(app, staging_key, theme_id, overwrite)
}

#[tauri::command]
#[specta::specta]
fn delete_theme_assets(app: AppHandle, theme_id: String) -> Result<(), AppError> {
    theme_bundles::delete_theme_assets(app, theme_id)
}

#[tauri::command]
#[specta::specta]
fn export_theme_bundle(
    app: AppHandle,
    theme_id: String,
    manifest_json: String,
    destination_path: String,
) -> Result<(), AppError> {
    theme_bundles::export_theme_bundle(app, theme_id, manifest_json, destination_path)
}

#[tauri::command]
#[specta::specta]
fn import_theme_bundle(
    app: AppHandle,
    bundle_path: String,
) -> Result<ImportedThemeBundle, AppError> {
    theme_bundles::import_theme_bundle(app, bundle_path)
}

fn ipc_bindings() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            acquire_track,
            acquire_album,
            add_library_root,
            analyze_audio_features,
            apply_musicbrainz_candidate,
            cancel_acquisition,
            cancel_metadata_job,
            cancel_theme_asset_staging,
            check_for_updates,
            cleanup_missing_tracks,
            configure_lastfm_session,
            configure_acoustid_client_key,
            create_playlist,
            create_generated_playlist,
            delete_playlist,
            delete_theme_assets,
            disconnect_lastfm,
            get_acquisition_queue,
            get_acquisition_settings,
            get_album_detail,
            get_unified_album_detail,
            get_artist_detail,
            get_artist_information,
            get_desktop_state,
            get_metadata_draft,
            get_metadata_patch,
            get_metadata_job,
            get_home_snapshot,
            get_integration_settings,
            get_integration_statuses,
            get_persistent_player_state,
            get_playlist,
            get_playlist_tracks,
            get_musicbrainz_enabled,
            get_acoustid_configured,
            get_playback_state,
            get_track_metadata,
            get_track_lyrics,
            get_ui_preference,
            export_theme_bundle,
            import_theme_bundle,
            install_update,
            list_metadata_jobs,
            list_library_roots,
            list_favorites,
            list_playlists,
            list_audio_output_devices,
            list_available_tags,
            list_starter_playlists,
            list_matching_tracks,
            generate_playlist,
            pause_metadata_job,
            pause_playback,
            play_track,
            query_catalog_tracks,
            query_discovery,
            query_artists_page,
            preview_metadata_changes,
            rename_playlist,
            remove_library_root,
            rescan_library_root,
            resume_metadata_job,
            resume_playback,
            restore_library_root,
            refresh_artist_discography,
            sync_library_discographies,
            retry_acquisition,
            merge_catalog_entities,
            unmerge_catalog_entities,
            rollback_metadata_file,
            run_musicbrainz_enrichment,
            save_acquisition_settings,
            save_metadata_draft,
            save_metadata_drafts,
            save_player_preferences,
            save_player_queue,
            stage_theme_asset,
            promote_theme_assets,
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
            duplicate_playlist,
            stop_playback,
            start_metadata_job,
            write_metadata_to_file
        ])
        .typ::<AppError>()
        .typ::<AcquisitionTrackRequest>()
        .typ::<AcquisitionAlbumRequest>()
        .typ::<AcquisitionJobDto>()
        .typ::<AcquisitionJobStatus>()
        .typ::<AcquisitionSettings>()
        .typ::<AcquisitionProgressPayload>()
        .typ::<AlbumDetail>()
        .typ::<AlbumSummary>()
        .typ::<ArtistDetail>()
        .typ::<ArtistInformation>()
        .typ::<ArtistSummary>()
        .typ::<EntityAvailability>()
        .typ::<EntityProvenance>()
        .typ::<ArtistCatalogQuery>()
        .typ::<ArtistCatalogPage>()
        .typ::<AudioOutputDevice>()
        .typ::<AudioOutputState>()
        .typ::<AudioAnalysisProgress>()
        .typ::<AudioFeatures>()
        .typ::<AudioSpecs>()
        .typ::<CatalogQuery>()
        .typ::<DiscoveryCatalog>()
        .typ::<DiscoveryQuery>()
        .typ::<EnrichmentCandidate>()
        .typ::<EnrichmentJob>()
        .typ::<FavoriteReference>()
        .typ::<enrichment::DiscographySyncProgress>()
        .typ::<GenreSummary>()
        .typ::<LibraryChanged>()
        .typ::<LibraryRoot>()
        .typ::<LibraryScan>()
        .typ::<LyricLine>()
        .typ::<LyricsDocument>()
        .typ::<LyricsSource>()
        .typ::<HomeSnapshot>()
        .typ::<IntegrationSettings>()
        .typ::<IntegrationStatus>()
        .typ::<MetadataPatch>()
        .typ::<MetadataDiff>()
        .typ::<MetadataJob>()
        .typ::<MetadataJobScope>()
        .typ::<MetadataJobStatus>()
        .typ::<MetadataReview>()
        .typ::<MetadataWriteResult>()
        .typ::<PersistentPlayerState>()
        .typ::<Playlist>()
        .typ::<GeneratedPlaylist>()
        .typ::<PlaylistGenerationRequest>()
        .typ::<PlaylistMood>()
        .typ::<PlaylistSelection>()
        .typ::<PlaybackState>()
        .typ::<PlayerPreferences>()
        .typ::<PlaylistSummary>()
        .typ::<RemoteTrackPayload>()
        .typ::<SpectrumFrame>()
        .typ::<ScanProgress>()
        .typ::<SortDirection>()
        .typ::<TrackPage>()
        .typ::<TrackSort>()
        .typ::<TrackSummary>()
        .typ::<ThemeAssetReference>()
        .typ::<ImportedThemeBundle>()
        .typ::<UnifiedAlbumDetail>()
        .typ::<UnifiedTrackSummary>()
        .typ::<UpdateProgress>()
        .typ::<UpdateStatus>()
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            let database = DatabaseWorker::start(app_data.join("bebop.sqlite3"))
                .map_err(|error| std::io::Error::other(format!("{error:?}")))?;
            let artwork_cache = app_data.join("artwork");
            let watcher = LibraryWatcher::start(
                app.handle().clone(),
                database.clone(),
                artwork_cache.clone(),
            )
            .map_err(|error| std::io::Error::other(format!("{error:?}")))?;
            let roots = database
                .list_roots()
                .map_err(|error| std::io::Error::other(format!("{error:?}")))?;
            let restored_player = database
                .load_player_state()
                .map_err(|error| std::io::Error::other(format!("{error:?}")))?;
            for root in &roots {
                watcher
                    .watch_root(root)
                    .map_err(|error| std::io::Error::other(format!("{error:?}")))?;
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
            let update_app = app.handle().clone();
            let update_database = database.clone();
            tauri::async_runtime::spawn(async move {
                let status = updates::check(update_app.clone(), update_database, false).await;
                if status.checked {
                    updates::emit_status(&update_app, &status);
                }
            });
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
        fs::write(root.join("cover.jpg"), b"fixture-artwork").expect("write cover fixture");
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
        let artwork_path = tracks[0]
            .artwork_path
            .as_deref()
            .expect("track artwork path is hydrated");
        assert!(Path::new(artwork_path).is_file());
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
        assert_eq!(
            discovery.artists[0].artwork_path.as_deref(),
            Some(artwork_path)
        );
        assert_eq!(
            discovery.albums[0].artwork_path.as_deref(),
            Some(artwork_path)
        );
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
