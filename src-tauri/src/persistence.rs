use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::mpsc::{self, Receiver, Sender},
    thread,
    time::Duration,
};

use chrono::Utc;
use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppError,
    catalog::{
        AlbumDetail, AlbumSummary, ArtistCatalogPage, ArtistCatalogQuery, ArtistDetail,
        ArtistSummary, AudioExtension, AudioSpecs, CatalogQuery, DiscoveryCatalog, DiscoveryQuery,
        EntityAvailability, EntityProvenance, GenreSummary, LibraryRoot, RemoteTrackPayload,
        RootAvailability, ScannedLibrary, SortDirection, TrackPage, TrackSort, TrackSummary,
        UnifiedAlbumDetail, UnifiedTrackSummary, WatchMode,
    },
    integrations::IntegrationJob,
    metadata::{CachedArtwork, MetadataPatch},
    metadata_jobs::{MetadataJob, MetadataJobScope, MetadataJobStatus},
    song_dna::{
        AUDIO_FEATURE_VERSION, AudioFeatures, GenerationCandidate, Playlist,
        PlaylistGenerationRequest,
    },
    user_state::{
        FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary,
    },
};

const SCHEMA_VERSION: i64 = 13;
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("migrations/0001_catalog.sql")),
    (2, include_str!("migrations/0002_live_indexing.sql")),
    (3, include_str!("migrations/0003_player_state.sql")),
    (4, include_str!("migrations/0004_acquisition.sql")),
    (5, include_str!("migrations/0005_catalog_performance.sql")),
    (6, include_str!("migrations/0006_lyrics_cache.sql")),
    (7, include_str!("migrations/0007_metadata_jobs.sql")),
    (8, include_str!("migrations/0008_song_dna.sql")),
    (9, include_str!("migrations/0009_remote_catalog.sql")),
    (10, include_str!("migrations/0010_cleanup_acquisition.sql")),
    (11, include_str!("migrations/0011_remote_tracklists.sql")),
    (12, include_str!("migrations/0012_discography_sync.sql")),
    (
        13,
        include_str!("migrations/0013_remote_provenance_cleanup.sql"),
    ),
];
type CatalogSignatures = HashMap<String, (String, u64, Option<i64>, bool)>;

/// Minimal artist row used by the library-wide discography sync.
#[derive(Clone, Debug)]
pub(crate) struct ArtistSyncRow {
    pub id: String,
    pub name: String,
}

/// Remote release awaiting a cached tracklist.
#[derive(Clone, Debug)]
pub(crate) struct ReleaseSyncRow {
    pub id: String,
    pub musicbrainz_release_group_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteReleasePayload {
    pub id: String,
    pub musicbrainz_release_group_id: String,
    pub title: String,
    pub year: Option<u32>,
    pub date: Option<String>,
    pub primary_type: Option<String>,
    pub secondary_types: Vec<String>,
    pub disambiguation: Option<String>,
    pub catalog_number: Option<String>,
    pub label: Option<String>,
    pub artwork_url: Option<String>,
    pub artwork_attribution: Option<String>,
    pub artwork_source: Option<String>,
    pub artists: Vec<crate::ArtistReference>,
    pub raw_json: String,
}

#[derive(Clone)]
pub(crate) struct DatabaseWorker {
    sender: Sender<Request>,
}

pub(crate) struct Reconciliation {
    pub tracks: Vec<TrackSummary>,
    pub changed_track_ids: Vec<String>,
}

enum Request {
    SaveRemoteDiscography {
        artist_mbid: String,
        artist_name: String,
        releases: Vec<RemoteReleasePayload>,
        reply: Sender<Result<(), AppError>>,
    },
    #[allow(dead_code)]
    SaveRemoteTracks {
        release_id: String,
        tracks: Vec<RemoteTrackPayload>,
        reply: Sender<Result<(), AppError>>,
    },
    RecordEntityMerge {
        local_type: String,
        local_id: String,
        remote_id: String,
        reviewed: bool,
        reply: Sender<Result<(), AppError>>,
    },
    RemoveEntityMerge {
        local_type: String,
        local_id: String,
        remote_id: String,
        reply: Sender<Result<(), AppError>>,
    },
    SetArtistMusicbrainzId {
        artist_id: String,
        mbid: String,
        reply: Sender<Result<(), AppError>>,
    },
    ListArtistsForDiscographySync {
        stale_after_days: i64,
        reply: Sender<Result<Vec<ArtistSyncRow>, AppError>>,
    },
    MarkArtistDiscographyChecked {
        artist_id: String,
        reply: Sender<Result<(), AppError>>,
    },
    ResolveAlbumReleaseGroup {
        album_id: String,
        reply: Sender<Result<Option<ReleaseSyncRow>, AppError>>,
    },
    ListRoots(Sender<Result<Vec<LibraryRoot>, AppError>>),
    AddRoot {
        canonical_path: String,
        label: String,
        reply: Sender<Result<LibraryRoot, AppError>>,
    },
    GetRoot {
        id: String,
        reply: Sender<Result<LibraryRoot, AppError>>,
    },
    SetRootEnabled {
        id: String,
        enabled: bool,
        reply: Sender<Result<LibraryRoot, AppError>>,
    },
    RemoveRoot {
        id: String,
        reply: Sender<Result<(), AppError>>,
    },
    Reconcile {
        root_id: String,
        scan: ScannedLibrary,
        reply: Sender<Result<Reconciliation, AppError>>,
    },
    MarkRootUnavailable {
        root_id: String,
        availability: RootAvailability,
        reply: Sender<Result<(), AppError>>,
    },
    QueryTracks {
        query: CatalogQuery,
        reply: Sender<Result<TrackPage, AppError>>,
    },
    ResolveTrack {
        canonical_path: String,
        reply: Sender<Result<(String, PathBuf), AppError>>,
    },
    QueryDiscovery {
        query: DiscoveryQuery,
        reply: Sender<Result<DiscoveryCatalog, AppError>>,
    },
    QueryArtistsPage {
        query: ArtistCatalogQuery,
        reply: Sender<Result<ArtistCatalogPage, AppError>>,
    },
    GetArtistDetail {
        id: String,
        reply: Sender<Result<ArtistDetail, AppError>>,
    },
    GetAlbumDetail {
        id: String,
        reply: Sender<Result<AlbumDetail, AppError>>,
    },
    GetUnifiedAlbumDetail {
        id: String,
        reply: Sender<Result<UnifiedAlbumDetail, AppError>>,
    },
    SaveMetadataDraft {
        track_id: String,
        patch: Box<MetadataPatch>,
        source: String,
        reply: Sender<Result<MetadataPatch, AppError>>,
    },
    GetMetadataDraft {
        track_id: String,
        reply: Sender<Result<Option<MetadataPatch>, AppError>>,
    },
    ResolveTrackId {
        track_id: String,
        reply: Sender<Result<PathBuf, AppError>>,
    },
    GetTrack {
        track_id: String,
        reply: Sender<Result<TrackSummary, AppError>>,
    },
    GetEmbeddedLyrics {
        track_id: String,
        reply: Sender<Result<Option<String>, AppError>>,
    },
    GetLyricsCache {
        cache_key: String,
        reply: Sender<Result<Option<String>, AppError>>,
    },
    SaveLyricsCache {
        cache_key: String,
        document_json: String,
        source_url: Option<String>,
        reply: Sender<Result<(), AppError>>,
    },
    GetEnrichmentCache {
        query_key: String,
        reply: Sender<Result<Option<String>, AppError>>,
    },
    SaveEnrichmentCache {
        track_id: Option<String>,
        query_key: String,
        result_json: String,
        reply: Sender<Result<(), AppError>>,
    },
    CreateMetadataJob {
        scope: MetadataJobScope,
        scope_id: Option<String>,
        reply: Sender<Result<MetadataJob, AppError>>,
    },
    GetMetadataJob {
        job_id: String,
        reply: Sender<Result<MetadataJob, AppError>>,
    },
    ListMetadataJobs(Sender<Result<Vec<MetadataJob>, AppError>>),
    PendingMetadataJobTracks {
        job_id: String,
        retry_errors: bool,
        reply: Sender<Result<Vec<String>, AppError>>,
    },
    RecordMetadataJobTrack {
        job_id: String,
        track_id: String,
        status: String,
        source: Option<String>,
        fingerprint: Option<String>,
        error_json: Option<String>,
        candidates_json: Option<String>,
        reply: Sender<Result<MetadataJob, AppError>>,
    },
    SetMetadataJobStatus {
        job_id: String,
        status: MetadataJobStatus,
        current_track_id: Option<String>,
        last_error: Option<String>,
        reply: Sender<Result<MetadataJob, AppError>>,
    },
    SaveArtwork {
        artwork: CachedArtwork,
        reply: Sender<Result<(), AppError>>,
    },
    CleanupMissingTracks {
        root_id: Option<String>,
        reply: Sender<Result<u64, AppError>>,
    },
    ReconcilePaths {
        root_id: String,
        scanned: Vec<crate::catalog::ScannedTrack>,
        missing_relative_paths: Vec<String>,
        reply: Sender<Result<Vec<String>, AppError>>,
    },
    LoadPlayerState(Sender<Result<PersistentPlayerState, AppError>>),
    SaveQueue {
        track_ids: Vec<String>,
        reply: Sender<Result<(), AppError>>,
    },
    SavePreferences {
        preferences: PlayerPreferences,
        reply: Sender<Result<PlayerPreferences, AppError>>,
    },
    SavePlaybackCheckpoint {
        track_id: Option<String>,
        position_ms: u64,
        reply: Sender<Result<(), AppError>>,
    },
    SetFavorite {
        entity_type: String,
        entity_id: String,
        favorite: bool,
        reply: Sender<Result<bool, AppError>>,
    },
    ListFavorites(Sender<Result<Vec<FavoriteReference>, AppError>>),
    CreatePlaylist {
        name: String,
        reply: Sender<Result<PlaylistSummary, AppError>>,
    },
    ListPlaylists(Sender<Result<Vec<PlaylistSummary>, AppError>>),
    GetPlaylist {
        playlist_id: String,
        reply: Sender<Result<Playlist, AppError>>,
    },
    RenamePlaylist {
        playlist_id: String,
        name: String,
        reply: Sender<Result<PlaylistSummary, AppError>>,
    },
    DeletePlaylist {
        playlist_id: String,
        reply: Sender<Result<(), AppError>>,
    },
    DuplicatePlaylist {
        playlist_id: String,
        name: String,
        reply: Sender<Result<PlaylistSummary, AppError>>,
    },
    GetPlaylistTracks {
        playlist_id: String,
        reply: Sender<Result<Vec<TrackSummary>, AppError>>,
    },
    SetPlaylistTracks {
        playlist_id: String,
        track_ids: Vec<String>,
        reply: Sender<Result<(), AppError>>,
    },
    SaveGeneratedPlaylist {
        name: String,
        request_json: String,
        track_ids: Vec<String>,
        reply: Sender<Result<PlaylistSummary, AppError>>,
    },
    GetAudioFeatures {
        track_id: String,
        reply: Sender<Result<Option<AudioFeatures>, AppError>>,
    },
    SaveAudioFeatures {
        features: AudioFeatures,
        reply: Sender<Result<(), AppError>>,
    },
    ListGenerationCandidates(Sender<Result<Vec<GenerationCandidate>, AppError>>),
    StartListeningSession {
        id: String,
        track_id: String,
        reply: Sender<Result<(), AppError>>,
    },
    UpdateListeningSession {
        id: String,
        played_ms: u64,
        completed: bool,
        skipped: bool,
        ended: bool,
        reply: Sender<Result<(), AppError>>,
    },
    GetHomeSnapshot(Sender<Result<HomeSnapshot, AppError>>),
    GetUiPreference {
        key: String,
        reply: Sender<Result<Option<String>, AppError>>,
    },
    SetUiPreference {
        key: String,
        value: String,
        reply: Sender<Result<(), AppError>>,
    },
    EnqueueIntegrationJob {
        id: String,
        integration: String,
        kind: String,
        payload_json: String,
        reply: Sender<Result<(), AppError>>,
    },
    PendingIntegrationJobs {
        integration: String,
        limit: u32,
        reply: Sender<Result<Vec<IntegrationJob>, AppError>>,
    },
    CompleteIntegrationJob {
        id: String,
        reply: Sender<Result<(), AppError>>,
    },
    FailIntegrationJob {
        id: String,
        attempts: u32,
        error: AppError,
        retry: bool,
        reply: Sender<Result<(), AppError>>,
    },
}

impl DatabaseWorker {
    pub(crate) fn start(database_path: PathBuf) -> Result<Self, AppError> {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::persistence("create-app-data-directory", error.to_string())
            })?;
        }
        recover_corrupt_database(&database_path)?;
        backup_before_upgrade(&database_path)?;
        let (sender, receiver) = mpsc::channel();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        thread::Builder::new()
            .name("bebop-database".into())
            .spawn(move || {
                let connection = open_database(&database_path);
                let ready = connection.as_ref().map(|_| ()).map_err(Clone::clone);
                let _ = ready_sender.send(ready);
                if let Ok(connection) = connection {
                    database_loop(connection, receiver);
                }
            })
            .map_err(|error| AppError::persistence("start-database-worker", error.to_string()))?;
        ready_receiver
            .recv()
            .map_err(|error| AppError::persistence("start-database-worker", error.to_string()))??;
        Ok(Self { sender })
    }

    #[cfg(test)]
    pub(crate) fn in_memory() -> Result<Self, AppError> {
        let (sender, receiver) = mpsc::channel();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let connection = open_connection(Connection::open_in_memory());
            let ready = connection.as_ref().map(|_| ()).map_err(Clone::clone);
            let _ = ready_sender.send(ready);
            if let Ok(connection) = connection {
                database_loop(connection, receiver);
            }
        });
        ready_receiver
            .recv()
            .map_err(|error| AppError::persistence("start-database-worker", error.to_string()))??;
        Ok(Self { sender })
    }

    fn request<T>(
        &self,
        build: impl FnOnce(Sender<Result<T, AppError>>) -> Request,
    ) -> Result<T, AppError> {
        let (reply, receive) = mpsc::channel();
        self.sender
            .send(build(reply))
            .map_err(|error| AppError::persistence("database-worker-send", error.to_string()))?;
        receive
            .recv()
            .map_err(|error| AppError::persistence("database-worker-receive", error.to_string()))?
    }

    pub(crate) fn list_roots(&self) -> Result<Vec<LibraryRoot>, AppError> {
        self.request(Request::ListRoots)
    }

    pub(crate) fn add_root(
        &self,
        canonical_path: String,
        label: String,
    ) -> Result<LibraryRoot, AppError> {
        self.request(|reply| Request::AddRoot {
            canonical_path,
            label,
            reply,
        })
    }

    pub(crate) fn get_root(&self, id: String) -> Result<LibraryRoot, AppError> {
        self.request(|reply| Request::GetRoot { id, reply })
    }

    pub(crate) fn set_root_enabled(
        &self,
        id: String,
        enabled: bool,
    ) -> Result<LibraryRoot, AppError> {
        self.request(|reply| Request::SetRootEnabled { id, enabled, reply })
    }

    pub(crate) fn remove_root(&self, id: String) -> Result<(), AppError> {
        self.request(|reply| Request::RemoveRoot { id, reply })
    }

    pub(crate) fn reconcile(
        &self,
        root_id: String,
        scan: ScannedLibrary,
    ) -> Result<Reconciliation, AppError> {
        self.request(|reply| Request::Reconcile {
            root_id,
            scan,
            reply,
        })
    }

    pub(crate) fn mark_root_unavailable(
        &self,
        root_id: String,
        availability: RootAvailability,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::MarkRootUnavailable {
            root_id,
            availability,
            reply,
        })
    }

    pub(crate) fn query_tracks(&self, query: CatalogQuery) -> Result<TrackPage, AppError> {
        self.request(|reply| Request::QueryTracks { query, reply })
    }

    pub(crate) fn resolve_track(
        &self,
        canonical_path: String,
    ) -> Result<(String, PathBuf), AppError> {
        self.request(|reply| Request::ResolveTrack {
            canonical_path,
            reply,
        })
    }

    pub(crate) fn query_discovery(
        &self,
        query: DiscoveryQuery,
    ) -> Result<DiscoveryCatalog, AppError> {
        self.request(|reply| Request::QueryDiscovery { query, reply })
    }

    pub(crate) fn query_artists_page(
        &self,
        query: ArtistCatalogQuery,
    ) -> Result<ArtistCatalogPage, AppError> {
        self.request(|reply| Request::QueryArtistsPage { query, reply })
    }

    pub(crate) fn get_artist_detail(&self, id: String) -> Result<ArtistDetail, AppError> {
        self.request(|reply| Request::GetArtistDetail { id, reply })
    }

    pub(crate) fn save_remote_discography(
        &self,
        artist_mbid: String,
        artist_name: String,
        releases: Vec<RemoteReleasePayload>,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SaveRemoteDiscography {
            artist_mbid,
            artist_name,
            releases,
            reply,
        })
    }

    #[allow(dead_code)]
    pub(crate) fn save_remote_tracks(
        &self,
        release_id: String,
        tracks: Vec<RemoteTrackPayload>,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SaveRemoteTracks {
            release_id,
            tracks,
            reply,
        })
    }

    pub(crate) fn record_entity_merge(
        &self,
        local_type: String,
        local_id: String,
        remote_id: String,
        reviewed: bool,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::RecordEntityMerge {
            local_type,
            local_id,
            remote_id,
            reviewed,
            reply,
        })
    }

    pub(crate) fn remove_entity_merge(
        &self,
        local_type: String,
        local_id: String,
        remote_id: String,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::RemoveEntityMerge {
            local_type,
            local_id,
            remote_id,
            reply,
        })
    }

    pub(crate) fn set_artist_musicbrainz_id(
        &self,
        artist_id: String,
        mbid: String,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SetArtistMusicbrainzId {
            artist_id,
            mbid,
            reply,
        })
    }

    pub(crate) fn list_artists_for_discography_sync(
        &self,
        stale_after_days: i64,
    ) -> Result<Vec<ArtistSyncRow>, AppError> {
        self.request(|reply| Request::ListArtistsForDiscographySync {
            stale_after_days,
            reply,
        })
    }

    pub(crate) fn mark_artist_discography_checked(
        &self,
        artist_id: String,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::MarkArtistDiscographyChecked { artist_id, reply })
    }

    pub(crate) fn resolve_album_release_group(
        &self,
        album_id: String,
    ) -> Result<Option<ReleaseSyncRow>, AppError> {
        self.request(|reply| Request::ResolveAlbumReleaseGroup { album_id, reply })
    }

    pub(crate) fn get_album_detail(&self, id: String) -> Result<AlbumDetail, AppError> {
        self.request(|reply| Request::GetAlbumDetail { id, reply })
    }

    pub(crate) fn get_unified_album_detail(
        &self,
        id: String,
    ) -> Result<UnifiedAlbumDetail, AppError> {
        self.request(|reply| Request::GetUnifiedAlbumDetail { id, reply })
    }

    pub(crate) fn save_metadata_draft(
        &self,
        track_id: String,
        patch: MetadataPatch,
        source: String,
    ) -> Result<MetadataPatch, AppError> {
        self.request(|reply| Request::SaveMetadataDraft {
            track_id,
            patch: Box::new(patch),
            source,
            reply,
        })
    }

    pub(crate) fn get_metadata_draft(
        &self,
        track_id: String,
    ) -> Result<Option<MetadataPatch>, AppError> {
        self.request(|reply| Request::GetMetadataDraft { track_id, reply })
    }

    pub(crate) fn resolve_track_id(&self, track_id: String) -> Result<PathBuf, AppError> {
        self.request(|reply| Request::ResolveTrackId { track_id, reply })
    }

    pub(crate) fn get_track(&self, track_id: String) -> Result<TrackSummary, AppError> {
        self.request(|reply| Request::GetTrack { track_id, reply })
    }

    pub(crate) fn get_embedded_lyrics(&self, track_id: String) -> Result<Option<String>, AppError> {
        self.request(|reply| Request::GetEmbeddedLyrics { track_id, reply })
    }

    pub(crate) fn get_lyrics_cache(&self, cache_key: String) -> Result<Option<String>, AppError> {
        self.request(|reply| Request::GetLyricsCache { cache_key, reply })
    }

    pub(crate) fn save_lyrics_cache(
        &self,
        cache_key: String,
        document_json: String,
        source_url: Option<String>,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SaveLyricsCache {
            cache_key,
            document_json,
            source_url,
            reply,
        })
    }

    pub(crate) fn get_enrichment_cache(
        &self,
        query_key: String,
    ) -> Result<Option<String>, AppError> {
        self.request(|reply| Request::GetEnrichmentCache { query_key, reply })
    }

    pub(crate) fn save_enrichment_cache(
        &self,
        track_id: Option<String>,
        query_key: String,
        result_json: String,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SaveEnrichmentCache {
            track_id,
            query_key,
            result_json,
            reply,
        })
    }

    pub(crate) fn create_metadata_job(
        &self,
        scope: MetadataJobScope,
        scope_id: Option<String>,
    ) -> Result<MetadataJob, AppError> {
        self.request(|reply| Request::CreateMetadataJob {
            scope,
            scope_id,
            reply,
        })
    }

    pub(crate) fn get_metadata_job(&self, job_id: String) -> Result<MetadataJob, AppError> {
        self.request(|reply| Request::GetMetadataJob { job_id, reply })
    }

    pub(crate) fn list_metadata_jobs(&self) -> Result<Vec<MetadataJob>, AppError> {
        self.request(Request::ListMetadataJobs)
    }

    pub(crate) fn pending_metadata_job_tracks(
        &self,
        job_id: String,
        retry_errors: bool,
    ) -> Result<Vec<String>, AppError> {
        self.request(|reply| Request::PendingMetadataJobTracks {
            job_id,
            retry_errors,
            reply,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn record_metadata_job_track(
        &self,
        job_id: String,
        track_id: String,
        status: String,
        source: Option<String>,
        fingerprint: Option<String>,
        error_json: Option<String>,
        candidates_json: Option<String>,
    ) -> Result<MetadataJob, AppError> {
        self.request(|reply| Request::RecordMetadataJobTrack {
            job_id,
            track_id,
            status,
            source,
            fingerprint,
            error_json,
            candidates_json,
            reply,
        })
    }

    pub(crate) fn set_metadata_job_status(
        &self,
        job_id: String,
        status: MetadataJobStatus,
        current_track_id: Option<String>,
        last_error: Option<String>,
    ) -> Result<MetadataJob, AppError> {
        self.request(|reply| Request::SetMetadataJobStatus {
            job_id,
            status,
            current_track_id,
            last_error,
            reply,
        })
    }

    pub(crate) fn save_artwork(&self, artwork: CachedArtwork) -> Result<(), AppError> {
        self.request(|reply| Request::SaveArtwork { artwork, reply })
    }

    pub(crate) fn cleanup_missing_tracks(&self, root_id: Option<String>) -> Result<u64, AppError> {
        self.request(|reply| Request::CleanupMissingTracks { root_id, reply })
    }

    pub(crate) fn reconcile_paths(
        &self,
        root_id: String,
        scanned: Vec<crate::catalog::ScannedTrack>,
        missing_relative_paths: Vec<String>,
    ) -> Result<Vec<String>, AppError> {
        self.request(|reply| Request::ReconcilePaths {
            root_id,
            scanned,
            missing_relative_paths,
            reply,
        })
    }

    pub(crate) fn load_player_state(&self) -> Result<PersistentPlayerState, AppError> {
        self.request(Request::LoadPlayerState)
    }

    pub(crate) fn save_queue(&self, track_ids: Vec<String>) -> Result<(), AppError> {
        self.request(|reply| Request::SaveQueue { track_ids, reply })
    }

    pub(crate) fn save_preferences(
        &self,
        preferences: PlayerPreferences,
    ) -> Result<PlayerPreferences, AppError> {
        self.request(|reply| Request::SavePreferences { preferences, reply })
    }

    pub(crate) fn save_playback_checkpoint(
        &self,
        track_id: Option<String>,
        position_ms: u64,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SavePlaybackCheckpoint {
            track_id,
            position_ms,
            reply,
        })
    }

    pub(crate) fn set_favorite(
        &self,
        entity_type: String,
        entity_id: String,
        favorite: bool,
    ) -> Result<bool, AppError> {
        self.request(|reply| Request::SetFavorite {
            entity_type,
            entity_id,
            favorite,
            reply,
        })
    }

    pub(crate) fn list_favorites(&self) -> Result<Vec<FavoriteReference>, AppError> {
        self.request(Request::ListFavorites)
    }

    pub(crate) fn create_playlist(&self, name: String) -> Result<PlaylistSummary, AppError> {
        self.request(|reply| Request::CreatePlaylist { name, reply })
    }

    pub(crate) fn list_playlists(&self) -> Result<Vec<PlaylistSummary>, AppError> {
        self.request(Request::ListPlaylists)
    }

    pub(crate) fn get_playlist(&self, playlist_id: String) -> Result<Playlist, AppError> {
        self.request(|reply| Request::GetPlaylist { playlist_id, reply })
    }

    pub(crate) fn rename_playlist(
        &self,
        playlist_id: String,
        name: String,
    ) -> Result<PlaylistSummary, AppError> {
        self.request(|reply| Request::RenamePlaylist {
            playlist_id,
            name,
            reply,
        })
    }

    pub(crate) fn delete_playlist(&self, playlist_id: String) -> Result<(), AppError> {
        self.request(|reply| Request::DeletePlaylist { playlist_id, reply })
    }

    pub(crate) fn duplicate_playlist(
        &self,
        playlist_id: String,
        name: String,
    ) -> Result<PlaylistSummary, AppError> {
        self.request(|reply| Request::DuplicatePlaylist {
            playlist_id,
            name,
            reply,
        })
    }

    pub(crate) fn get_playlist_tracks(
        &self,
        playlist_id: String,
    ) -> Result<Vec<TrackSummary>, AppError> {
        self.request(|reply| Request::GetPlaylistTracks { playlist_id, reply })
    }

    pub(crate) fn set_playlist_tracks(
        &self,
        playlist_id: String,
        track_ids: Vec<String>,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::SetPlaylistTracks {
            playlist_id,
            track_ids,
            reply,
        })
    }

    pub(crate) fn save_generated_playlist(
        &self,
        name: String,
        request_json: String,
        track_ids: Vec<String>,
    ) -> Result<PlaylistSummary, AppError> {
        self.request(|reply| Request::SaveGeneratedPlaylist {
            name,
            request_json,
            track_ids,
            reply,
        })
    }

    pub(crate) fn get_audio_features(
        &self,
        track_id: String,
    ) -> Result<Option<AudioFeatures>, AppError> {
        self.request(|reply| Request::GetAudioFeatures { track_id, reply })
    }

    pub(crate) fn save_audio_features(&self, features: AudioFeatures) -> Result<(), AppError> {
        self.request(|reply| Request::SaveAudioFeatures { features, reply })
    }

    pub(crate) fn list_generation_candidates(&self) -> Result<Vec<GenerationCandidate>, AppError> {
        self.request(Request::ListGenerationCandidates)
    }

    pub(crate) fn start_listening_session(
        &self,
        id: String,
        track_id: String,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::StartListeningSession {
            id,
            track_id,
            reply,
        })
    }

    pub(crate) fn update_listening_session(
        &self,
        id: String,
        played_ms: u64,
        completed: bool,
        skipped: bool,
        ended: bool,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::UpdateListeningSession {
            id,
            played_ms,
            completed,
            skipped,
            ended,
            reply,
        })
    }

    pub(crate) fn get_home_snapshot(&self) -> Result<HomeSnapshot, AppError> {
        self.request(Request::GetHomeSnapshot)
    }

    pub(crate) fn get_ui_preference(&self, key: String) -> Result<Option<String>, AppError> {
        self.request(|reply| Request::GetUiPreference { key, reply })
    }

    pub(crate) fn set_ui_preference(&self, key: String, value: String) -> Result<(), AppError> {
        self.request(|reply| Request::SetUiPreference { key, value, reply })
    }

    pub(crate) fn enqueue_integration_job(
        &self,
        id: String,
        integration: String,
        kind: String,
        payload_json: String,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::EnqueueIntegrationJob {
            id,
            integration,
            kind,
            payload_json,
            reply,
        })
    }

    pub(crate) fn pending_integration_jobs(
        &self,
        integration: String,
        limit: u32,
    ) -> Result<Vec<IntegrationJob>, AppError> {
        self.request(|reply| Request::PendingIntegrationJobs {
            integration,
            limit,
            reply,
        })
    }

    pub(crate) fn complete_integration_job(&self, id: String) -> Result<(), AppError> {
        self.request(|reply| Request::CompleteIntegrationJob { id, reply })
    }

    pub(crate) fn fail_integration_job(
        &self,
        id: String,
        attempts: u32,
        error: AppError,
        retry: bool,
    ) -> Result<(), AppError> {
        self.request(|reply| Request::FailIntegrationJob {
            id,
            attempts,
            error,
            retry,
            reply,
        })
    }
}

fn backup_before_upgrade(database_path: &Path) -> Result<(), AppError> {
    if !database_path.is_file() {
        return Ok(());
    }
    let read_only = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| AppError::persistence("inspect-database-version", error.to_string()))?;
    let version: i64 = read_only
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| AppError::persistence("inspect-database-version", error.to_string()))?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }
    let backup_directory = database_path
        .parent()
        .expect("database path has application-data parent")
        .join("database-backups");
    fs::create_dir_all(&backup_directory).map_err(|error| {
        AppError::persistence("create-database-backup-directory", error.to_string())
    })?;
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let backup_path = backup_directory.join(format!(
        "bebop-v{version}-{timestamp}-{}.sqlite3",
        Uuid::new_v4()
    ));
    let mut destination = Connection::open(&backup_path)
        .map_err(|error| AppError::persistence("create-database-backup", error.to_string()))?;
    let backup = rusqlite::backup::Backup::new(&read_only, &mut destination)
        .map_err(|error| AppError::persistence("start-database-backup", error.to_string()))?;
    backup
        .run_to_completion(32, Duration::from_millis(25), None)
        .map_err(|error| AppError::persistence("backup-database", error.to_string()))?;
    Ok(())
}

fn recover_corrupt_database(database_path: &Path) -> Result<Option<PathBuf>, AppError> {
    if !database_path.is_file() {
        return Ok(None);
    }
    let inspection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .and_then(|connection| {
            connection.query_row("PRAGMA quick_check(1)", [], |row| row.get::<_, String>(0))
        });
    match inspection {
        Ok(result) if result.eq_ignore_ascii_case("ok") => return Ok(None),
        Ok(_) => {}
        Err(error) if is_corruption_error(&error) => {}
        Err(error) => {
            return Err(AppError::persistence(
                "inspect-database-integrity",
                error.to_string(),
            ));
        }
    }

    let recovery_directory = database_path
        .parent()
        .expect("database path has application-data parent")
        .join("database-recovery")
        .join(format!(
            "{}-{}",
            Utc::now().format("%Y%m%dT%H%M%SZ"),
            Uuid::new_v4()
        ));
    fs::create_dir_all(&recovery_directory)
        .map_err(|error| AppError::persistence("create-database-recovery", error.to_string()))?;
    for source in database_files(database_path) {
        if source.exists() {
            let destination = recovery_directory.join(
                source
                    .file_name()
                    .expect("database and sidecar paths have file names"),
            );
            fs::rename(&source, destination).map_err(|error| {
                AppError::persistence("preserve-corrupt-database", error.to_string())
            })?;
        }
    }
    Ok(Some(recovery_directory))
}

fn database_files(database_path: &Path) -> [PathBuf; 3] {
    let base = database_path.to_string_lossy();
    [
        database_path.to_path_buf(),
        PathBuf::from(format!("{base}-wal")),
        PathBuf::from(format!("{base}-shm")),
    ]
}

fn is_corruption_error(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(sqlite, _)
            if matches!(
                sqlite.code,
                rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
            )
    )
}

fn open_database(path: &Path) -> Result<Connection, AppError> {
    open_connection(Connection::open(path))
}

fn open_connection(connection: rusqlite::Result<Connection>) -> Result<Connection, AppError> {
    let mut connection =
        connection.map_err(|error| AppError::persistence("open-database", error.to_string()))?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
        )
        .map_err(|error| AppError::persistence("configure-database", error.to_string()))?;
    migrate(&mut connection)?;
    Ok(connection)
}

fn migrate(connection: &mut Connection) -> Result<(), AppError> {
    let current: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| AppError::persistence("read-schema-version", error.to_string()))?;
    if current > SCHEMA_VERSION {
        return Err(AppError::new(
            "database-version-newer",
            "This Bebop database was created by a newer application version.",
        ));
    }
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version > current) {
        let transaction = connection
            .transaction()
            .map_err(|error| AppError::persistence("begin-migration", error.to_string()))?;
        transaction
            .execute_batch(sql)
            .map_err(|error| AppError::persistence("apply-migration", error.to_string()))?;
        transaction
            .pragma_update(None, "user_version", version)
            .map_err(|error| AppError::persistence("record-schema-version", error.to_string()))?;
        transaction
            .commit()
            .map_err(|error| AppError::persistence("commit-migration", error.to_string()))?;
    }
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| AppError::persistence("enable-foreign-keys", error.to_string()))?;
    Ok(())
}

fn database_loop(mut connection: Connection, receiver: Receiver<Request>) {
    while let Ok(request) = receiver.recv() {
        match request {
            Request::SaveRemoteDiscography {
                artist_mbid,
                artist_name,
                releases,
                reply,
            } => {
                send(
                    reply,
                    save_remote_discography(&mut connection, &artist_mbid, &artist_name, &releases),
                );
            }
            Request::SaveRemoteTracks {
                release_id,
                tracks,
                reply,
            } => {
                send(
                    reply,
                    save_remote_tracks(&mut connection, &release_id, &tracks),
                );
            }
            Request::RecordEntityMerge {
                local_type,
                local_id,
                remote_id,
                reviewed,
                reply,
            } => {
                send(
                    reply,
                    record_entity_merge(&connection, &local_type, &local_id, &remote_id, reviewed),
                );
            }
            Request::RemoveEntityMerge {
                local_type,
                local_id,
                remote_id,
                reply,
            } => {
                send(
                    reply,
                    remove_entity_merge(&connection, &local_type, &local_id, &remote_id),
                );
            }
            Request::SetArtistMusicbrainzId {
                artist_id,
                mbid,
                reply,
            } => {
                send(
                    reply,
                    set_artist_musicbrainz_id(&connection, &artist_id, &mbid),
                );
            }
            Request::ListArtistsForDiscographySync {
                stale_after_days,
                reply,
            } => {
                send(
                    reply,
                    list_artists_for_discography_sync(&connection, stale_after_days),
                );
            }
            Request::MarkArtistDiscographyChecked { artist_id, reply } => {
                send(
                    reply,
                    mark_artist_discography_checked(&connection, &artist_id),
                );
            }
            Request::ResolveAlbumReleaseGroup { album_id, reply } => {
                send(reply, resolve_album_release_group(&connection, &album_id));
            }
            Request::ListRoots(reply) => send(reply, list_roots(&connection)),
            Request::AddRoot {
                canonical_path,
                label,
                reply,
            } => {
                send(reply, add_root(&connection, &canonical_path, &label));
            }
            Request::GetRoot { id, reply } => send(reply, get_root(&connection, &id)),
            Request::SetRootEnabled { id, enabled, reply } => {
                send(reply, set_root_enabled(&connection, &id, enabled));
            }
            Request::RemoveRoot { id, reply } => send(reply, remove_root(&connection, &id)),
            Request::Reconcile {
                root_id,
                scan,
                reply,
            } => {
                send(reply, reconcile(&mut connection, &root_id, scan));
            }
            Request::MarkRootUnavailable {
                root_id,
                availability,
                reply,
            } => {
                send(
                    reply,
                    mark_root_unavailable(&mut connection, &root_id, availability),
                );
            }
            Request::QueryTracks { query, reply } => send(reply, query_tracks(&connection, query)),
            Request::ResolveTrack {
                canonical_path,
                reply,
            } => {
                send(reply, resolve_track(&connection, &canonical_path));
            }
            Request::QueryDiscovery { query, reply } => {
                send(reply, query_discovery(&connection, query));
            }
            Request::QueryArtistsPage { query, reply } => {
                send(reply, query_artists_page(&connection, query));
            }
            Request::GetArtistDetail { id, reply } => {
                send(reply, get_artist_detail(&connection, &id));
            }
            Request::GetAlbumDetail { id, reply } => {
                send(reply, get_album_detail(&connection, &id));
            }
            Request::GetUnifiedAlbumDetail { id, reply } => {
                send(reply, get_unified_album_detail(&connection, &id));
            }
            Request::SaveMetadataDraft {
                track_id,
                patch,
                source,
                reply,
            } => {
                send(
                    reply,
                    save_metadata_draft(&connection, &track_id, &patch, &source),
                );
            }
            Request::GetMetadataDraft { track_id, reply } => {
                send(reply, get_metadata_draft(&connection, &track_id));
            }
            Request::ResolveTrackId { track_id, reply } => {
                send(reply, resolve_track_id(&connection, &track_id));
            }
            Request::GetTrack { track_id, reply } => {
                send(reply, get_track(&connection, &track_id));
            }
            Request::GetEmbeddedLyrics { track_id, reply } => {
                send(reply, get_embedded_lyrics(&connection, &track_id));
            }
            Request::GetLyricsCache { cache_key, reply } => {
                send(reply, get_lyrics_cache(&connection, &cache_key));
            }
            Request::SaveLyricsCache {
                cache_key,
                document_json,
                source_url,
                reply,
            } => {
                send(
                    reply,
                    save_lyrics_cache(
                        &connection,
                        &cache_key,
                        &document_json,
                        source_url.as_deref(),
                    ),
                );
            }
            Request::GetEnrichmentCache { query_key, reply } => {
                send(reply, get_enrichment_cache(&connection, &query_key));
            }
            Request::SaveEnrichmentCache {
                track_id,
                query_key,
                result_json,
                reply,
            } => {
                send(
                    reply,
                    save_enrichment_cache(
                        &connection,
                        track_id.as_deref(),
                        &query_key,
                        &result_json,
                    ),
                );
            }
            Request::CreateMetadataJob {
                scope,
                scope_id,
                reply,
            } => {
                send(
                    reply,
                    create_metadata_job(&mut connection, scope, scope_id.as_deref()),
                );
            }
            Request::GetMetadataJob { job_id, reply } => {
                send(reply, get_metadata_job(&connection, &job_id));
            }
            Request::ListMetadataJobs(reply) => send(reply, list_metadata_jobs(&connection)),
            Request::PendingMetadataJobTracks {
                job_id,
                retry_errors,
                reply,
            } => {
                send(
                    reply,
                    pending_metadata_job_tracks(&connection, &job_id, retry_errors),
                );
            }
            Request::RecordMetadataJobTrack {
                job_id,
                track_id,
                status,
                source,
                fingerprint,
                error_json,
                candidates_json,
                reply,
            } => send(
                reply,
                record_metadata_job_track(
                    &mut connection,
                    &job_id,
                    &track_id,
                    &status,
                    source.as_deref(),
                    fingerprint.as_deref(),
                    error_json.as_deref(),
                    candidates_json.as_deref(),
                ),
            ),
            Request::SetMetadataJobStatus {
                job_id,
                status,
                current_track_id,
                last_error,
                reply,
            } => send(
                reply,
                set_metadata_job_status(
                    &connection,
                    &job_id,
                    status,
                    current_track_id.as_deref(),
                    last_error.as_deref(),
                ),
            ),
            Request::SaveArtwork { artwork, reply } => {
                send(reply, save_artwork(&connection, &artwork));
            }
            Request::CleanupMissingTracks { root_id, reply } => {
                send(
                    reply,
                    cleanup_missing_tracks(&connection, root_id.as_deref()),
                );
            }
            Request::ReconcilePaths {
                root_id,
                scanned,
                missing_relative_paths,
                reply,
            } => send(
                reply,
                reconcile_paths(&mut connection, &root_id, scanned, missing_relative_paths),
            ),
            Request::LoadPlayerState(reply) => send(reply, load_player_state(&connection)),
            Request::SaveQueue { track_ids, reply } => {
                send(reply, save_queue(&mut connection, &track_ids));
            }
            Request::SavePreferences { preferences, reply } => {
                send(reply, save_preferences(&connection, preferences));
            }
            Request::SavePlaybackCheckpoint {
                track_id,
                position_ms,
                reply,
            } => send(
                reply,
                save_playback_checkpoint(&connection, track_id.as_deref(), position_ms),
            ),
            Request::SetFavorite {
                entity_type,
                entity_id,
                favorite,
                reply,
            } => send(
                reply,
                set_favorite(&connection, &entity_type, &entity_id, favorite),
            ),
            Request::ListFavorites(reply) => send(reply, list_favorites(&connection)),
            Request::CreatePlaylist { name, reply } => {
                send(reply, create_playlist(&connection, &name));
            }
            Request::ListPlaylists(reply) => send(reply, list_playlists(&connection)),
            Request::GetPlaylist { playlist_id, reply } => {
                send(reply, get_playlist(&connection, &playlist_id));
            }
            Request::RenamePlaylist {
                playlist_id,
                name,
                reply,
            } => {
                send(reply, rename_playlist(&connection, &playlist_id, &name));
            }
            Request::DeletePlaylist { playlist_id, reply } => {
                send(reply, delete_playlist(&connection, &playlist_id));
            }
            Request::DuplicatePlaylist {
                playlist_id,
                name,
                reply,
            } => {
                send(
                    reply,
                    duplicate_playlist(&mut connection, &playlist_id, &name),
                );
            }
            Request::GetPlaylistTracks { playlist_id, reply } => {
                send(reply, get_playlist_tracks(&connection, &playlist_id));
            }
            Request::SetPlaylistTracks {
                playlist_id,
                track_ids,
                reply,
            } => send(
                reply,
                set_playlist_tracks(&mut connection, &playlist_id, &track_ids),
            ),
            Request::SaveGeneratedPlaylist {
                name,
                request_json,
                track_ids,
                reply,
            } => send(
                reply,
                save_generated_playlist(&mut connection, &name, &request_json, &track_ids),
            ),
            Request::GetAudioFeatures { track_id, reply } => {
                send(reply, get_audio_features(&connection, &track_id));
            }
            Request::SaveAudioFeatures { features, reply } => {
                send(reply, save_audio_features(&connection, &features));
            }
            Request::ListGenerationCandidates(reply) => {
                send(reply, list_generation_candidates(&connection));
            }
            Request::StartListeningSession {
                id,
                track_id,
                reply,
            } => send(reply, start_listening_session(&connection, &id, &track_id)),
            Request::UpdateListeningSession {
                id,
                played_ms,
                completed,
                skipped,
                ended,
                reply,
            } => send(
                reply,
                update_listening_session(&connection, &id, played_ms, completed, skipped, ended),
            ),
            Request::GetHomeSnapshot(reply) => send(reply, get_home_snapshot(&connection)),
            Request::GetUiPreference { key, reply } => {
                send(reply, read_setting(&connection, &format!("ui.{key}")));
            }
            Request::SetUiPreference { key, value, reply } => send(
                reply,
                write_setting(&connection, &format!("ui.{key}"), &value),
            ),
            Request::EnqueueIntegrationJob {
                id,
                integration,
                kind,
                payload_json,
                reply,
            } => send(
                reply,
                enqueue_integration_job(&connection, &id, &integration, &kind, &payload_json),
            ),
            Request::PendingIntegrationJobs {
                integration,
                limit,
                reply,
            } => send(
                reply,
                pending_integration_jobs(&connection, &integration, limit),
            ),
            Request::CompleteIntegrationJob { id, reply } => {
                send(reply, complete_integration_job(&connection, &id));
            }
            Request::FailIntegrationJob {
                id,
                attempts,
                error,
                retry,
                reply,
            } => send(
                reply,
                fail_integration_job(&connection, &id, attempts, &error, retry),
            ),
        }
    }
}

fn send<T>(reply: Sender<Result<T, AppError>>, result: Result<T, AppError>) {
    let _ = reply.send(result);
}

fn database_error(action: &'static str) -> impl FnOnce(rusqlite::Error) -> AppError {
    move |error| AppError::persistence(action, error.to_string())
}

fn root_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryRoot> {
    Ok(LibraryRoot {
        id: row.get(0)?,
        path: row.get(1)?,
        label: row.get(2)?,
        enabled: row.get(3)?,
        availability: RootAvailability::from_database(&row.get::<_, String>(4)?),
        watch_mode: WatchMode::from_database(&row.get::<_, String>(5)?),
        track_count: row.get(6)?,
        last_scan_at: row.get(7)?,
    })
}

const ROOT_COLUMNS: &str =
    "id, canonical_path, label, enabled, availability, watch_mode, track_count, last_scan_at";

fn list_roots(connection: &Connection) -> Result<Vec<LibraryRoot>, AppError> {
    let mut statement = connection
        .prepare(&format!(
            "SELECT {ROOT_COLUMNS} FROM library_roots ORDER BY label COLLATE NOCASE, id"
        ))
        .map_err(database_error("prepare-list-roots"))?;
    statement
        .query_map([], root_from_row)
        .map_err(database_error("query-list-roots"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-list-roots"))
}

fn add_root(
    connection: &Connection,
    canonical_path: &str,
    label: &str,
) -> Result<LibraryRoot, AppError> {
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO library_roots
             (id, canonical_path, label, watch_mode, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'native', ?4, ?4)
             ON CONFLICT(canonical_path) DO UPDATE SET enabled = 1, label = excluded.label, updated_at = excluded.updated_at",
            params![id, canonical_path, label, now],
        )
        .map_err(database_error("add-library-root"))?;
    connection
        .query_row(
            &format!("SELECT {ROOT_COLUMNS} FROM library_roots WHERE canonical_path = ?1"),
            [canonical_path],
            root_from_row,
        )
        .map_err(database_error("read-added-library-root"))
}

fn get_root(connection: &Connection, id: &str) -> Result<LibraryRoot, AppError> {
    connection
        .query_row(
            &format!("SELECT {ROOT_COLUMNS} FROM library_roots WHERE id = ?1"),
            [id],
            root_from_row,
        )
        .optional()
        .map_err(database_error("read-library-root"))?
        .ok_or_else(|| {
            AppError::new(
                "library-root-not-found",
                "The selected library root no longer exists.",
            )
        })
}

fn set_root_enabled(
    connection: &Connection,
    id: &str,
    enabled: bool,
) -> Result<LibraryRoot, AppError> {
    let changed = connection
        .execute(
            "UPDATE library_roots SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, enabled, Utc::now().to_rfc3339()],
        )
        .map_err(database_error("update-library-root"))?;
    if changed == 0 {
        return Err(AppError::new(
            "library-root-not-found",
            "The selected library root no longer exists.",
        ));
    }
    get_root(connection, id)
}

fn remove_root(connection: &Connection, id: &str) -> Result<(), AppError> {
    let changed = connection
        .execute("DELETE FROM library_roots WHERE id = ?1", [id])
        .map_err(database_error("remove-library-root"))?;
    if changed == 0 {
        return Err(AppError::new(
            "library-root-not-found",
            "The selected library root no longer exists.",
        ));
    }
    Ok(())
}

fn reconcile(
    connection: &mut Connection,
    root_id: &str,
    scan: ScannedLibrary,
) -> Result<Reconciliation, AppError> {
    let before = catalog_signatures(connection, root_id)?;
    let now = Utc::now().to_rfc3339();
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-library-reconciliation"))?;
    transaction
        .execute(
            "UPDATE tracks SET available = 0, updated_at = ?2 WHERE root_id = ?1",
            params![root_id, now],
        )
        .map_err(database_error("mark-library-tracks-missing"))?;
    for track in scan.tracks {
        relink_moved_track(&transaction, root_id, &track, &now)?;
        upsert_track(&transaction, root_id, &track, &now)?;
    }
    let track_count: u64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE root_id = ?1 AND available = 1",
            [root_id],
            |row| row.get(0),
        )
        .map_err(database_error("count-library-tracks"))?;
    transaction
        .execute(
            "UPDATE library_roots SET canonical_path = ?2, availability = 'online', track_count = ?3,
             last_scan_at = ?4, updated_at = ?4 WHERE id = ?1",
            params![root_id, scan.canonical_root, track_count, now],
        )
        .map_err(database_error("finish-library-reconciliation"))?;
    transaction
        .commit()
        .map_err(database_error("commit-library-reconciliation"))?;
    let tracks = query_tracks(
        connection,
        CatalogQuery {
            root_id: Some(root_id.to_owned()),
            limit: u32::MAX,
            ..CatalogQuery::default()
        },
    )?
    .items;
    let after = catalog_signatures(connection, root_id)?;
    let mut changed_track_ids: Vec<_> = before
        .keys()
        .chain(after.keys())
        .filter(|id| before.get(*id) != after.get(*id))
        .cloned()
        .collect();
    changed_track_ids.sort();
    changed_track_ids.dedup();
    Ok(Reconciliation {
        tracks,
        changed_track_ids,
    })
}

fn catalog_signatures(
    connection: &Connection,
    root_id: &str,
) -> Result<CatalogSignatures, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT id, canonical_path, file_size, modified_at_ms, available
             FROM tracks WHERE root_id = ?1",
        )
        .map_err(database_error("prepare-catalog-signatures"))?;
    statement
        .query_map([root_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?),
            ))
        })
        .map_err(database_error("query-catalog-signatures"))?
        .collect::<rusqlite::Result<HashMap<_, _>>>()
        .map_err(database_error("read-catalog-signatures"))
}

fn reconcile_paths(
    connection: &mut Connection,
    root_id: &str,
    scanned: Vec<crate::catalog::ScannedTrack>,
    missing_relative_paths: Vec<String>,
) -> Result<Vec<String>, AppError> {
    let before = catalog_signatures(connection, root_id)?;
    let now = Utc::now().to_rfc3339();
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-path-reconciliation"))?;
    for relative_path in missing_relative_paths {
        transaction
            .execute(
                "UPDATE tracks SET available = 0, updated_at = ?3
                 WHERE root_id = ?1 AND relative_path = ?2",
                params![root_id, relative_path, now],
            )
            .map_err(database_error("mark-path-missing"))?;
    }
    for track in scanned {
        relink_moved_track(&transaction, root_id, &track, &now)?;
        upsert_track(&transaction, root_id, &track, &now)?;
    }
    let track_count: u64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE root_id = ?1 AND available = 1",
            [root_id],
            |row| row.get(0),
        )
        .map_err(database_error("count-reconciled-paths"))?;
    transaction
        .execute(
            "UPDATE library_roots SET track_count = ?2, availability = 'online',
             updated_at = ?3 WHERE id = ?1",
            params![root_id, track_count, now],
        )
        .map_err(database_error("finish-path-reconciliation"))?;
    transaction
        .commit()
        .map_err(database_error("commit-path-reconciliation"))?;
    let after = catalog_signatures(connection, root_id)?;
    let mut changed: Vec<_> = before
        .keys()
        .chain(after.keys())
        .filter(|id| before.get(*id) != after.get(*id))
        .cloned()
        .collect();
    changed.sort();
    changed.dedup();
    Ok(changed)
}

fn upsert_track(
    transaction: &Transaction<'_>,
    root_id: &str,
    track: &crate::catalog::ScannedTrack,
    now: &str,
) -> Result<(), AppError> {
    let id = Uuid::new_v4().to_string();
    let metadata = &track.metadata;
    if let Some(artwork) = &metadata.artwork {
        transaction
            .execute(
                "INSERT INTO artwork
                 (id, content_hash, cache_path, mime_type, source, source_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(content_hash) DO UPDATE SET cache_path = excluded.cache_path,
                 source = excluded.source, source_id = excluded.source_id",
                params![
                    artwork.id,
                    artwork.content_hash,
                    artwork.cache_path,
                    artwork.mime_type,
                    artwork.source,
                    artwork.source_id,
                    now
                ],
            )
            .map_err(database_error("upsert-artwork"))?;
    }
    let artist_names = if metadata.artists.is_empty() {
        vec!["Unknown Artist".to_owned()]
    } else {
        metadata.artists.clone()
    };
    let album_artist_names = if metadata.album_artists.is_empty() {
        artist_names.clone()
    } else {
        metadata.album_artists.clone()
    };
    let artist_ids = upsert_artists(
        transaction,
        &artist_names,
        &metadata.musicbrainz_artist_ids,
        now,
    )?;
    let album_artist_ids = upsert_artists(
        transaction,
        &album_artist_names,
        &metadata.musicbrainz_album_artist_ids,
        now,
    )?;
    let album_title = metadata.album.as_deref().unwrap_or("Unknown Album");
    let album_id = upsert_album(
        transaction,
        album_title,
        &album_artist_ids,
        metadata.year,
        metadata.date.as_deref(),
        metadata.label.as_deref(),
        metadata.catalog_number.as_deref(),
        metadata.musicbrainz_release_id.as_deref(),
        metadata.artwork.as_ref().map(|artwork| artwork.id.as_str()),
        now,
    )?;
    transaction
        .execute(
            "INSERT INTO tracks (
                id, root_id, canonical_path, relative_path, title, sort_title, album_id,
                extension, file_size, duration_ms, sample_rate, channels, bit_depth,
                track_number, track_total, disc_number, disc_total, year, date, composer,
                label, catalog_number, isrc, musicbrainz_recording_id, artwork_id,
                replaygain_track_gain, replaygain_track_peak, replaygain_album_gain,
                replaygain_album_peak, lyrics, available, modified_at_ms, added_at, updated_at
                , content_fingerprint
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25,
                ?26, ?27, ?28, ?29, ?30, 1, ?31, ?32, ?32, ?33
             )
             ON CONFLICT(root_id, relative_path) DO UPDATE SET
                canonical_path = excluded.canonical_path, title = excluded.title,
                sort_title = excluded.sort_title, album_id = excluded.album_id,
                extension = excluded.extension, file_size = excluded.file_size,
                duration_ms = excluded.duration_ms, sample_rate = excluded.sample_rate,
                channels = excluded.channels, bit_depth = excluded.bit_depth,
                track_number = excluded.track_number, track_total = excluded.track_total,
                disc_number = excluded.disc_number, disc_total = excluded.disc_total,
                year = excluded.year, date = excluded.date, composer = excluded.composer,
                label = excluded.label, catalog_number = excluded.catalog_number,
                isrc = excluded.isrc, musicbrainz_recording_id = excluded.musicbrainz_recording_id,
                artwork_id = excluded.artwork_id, replaygain_track_gain = excluded.replaygain_track_gain,
                replaygain_track_peak = excluded.replaygain_track_peak,
                replaygain_album_gain = excluded.replaygain_album_gain,
                replaygain_album_peak = excluded.replaygain_album_peak, lyrics = excluded.lyrics,
                available = 1, modified_at_ms = excluded.modified_at_ms,
                content_fingerprint = excluded.content_fingerprint,
                updated_at = excluded.updated_at",
            params![
                id,
                root_id,
                track.canonical_path,
                track.relative_path,
                track.title,
                metadata.sort_title,
                album_id,
                track.extension.as_str(),
                track.file_size,
                track.duration_ms,
                track.sample_rate,
                track.channels,
                track.bit_depth,
                metadata.track_number,
                metadata.track_total,
                metadata.disc_number,
                metadata.disc_total,
                metadata.year,
                metadata.date,
                metadata.composer,
                metadata.label,
                metadata.catalog_number,
                metadata.isrc,
                metadata.musicbrainz_recording_id,
                metadata.artwork.as_ref().map(|artwork| &artwork.id),
                metadata.replaygain_track_gain,
                metadata.replaygain_track_peak,
                metadata.replaygain_album_gain,
                metadata.replaygain_album_peak,
                metadata.lyrics,
                track.modified_at_ms,
                now,
                track.content_fingerprint,
            ],
        )
        .map_err(database_error("upsert-library-track"))?;
    let track_id: String = transaction
        .query_row(
            "SELECT id FROM tracks WHERE root_id = ?1 AND relative_path = ?2",
            params![root_id, track.relative_path],
            |row| row.get(0),
        )
        .map_err(database_error("read-upserted-track"))?;
    transaction
        .execute("DELETE FROM track_artists WHERE track_id = ?1", [&track_id])
        .map_err(database_error("clear-track-artists"))?;
    for (position, artist_id) in artist_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO track_artists (track_id, artist_id, role, position) VALUES (?1, ?2, 'artist', ?3)",
                params![track_id, artist_id, position],
            )
            .map_err(database_error("attach-track-artist"))?;
    }
    for (position, artist_id) in album_artist_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO track_artists (track_id, artist_id, role, position) VALUES (?1, ?2, 'album-artist', ?3)",
                params![track_id, artist_id, position],
            )
            .map_err(database_error("attach-track-album-artist"))?;
    }
    transaction
        .execute("DELETE FROM track_genres WHERE track_id = ?1", [&track_id])
        .map_err(database_error("clear-track-genres"))?;
    for genre in &metadata.genres {
        let genre_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO genres (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING",
                params![genre_id, genre],
            )
            .map_err(database_error("upsert-genre"))?;
        let genre_id: String = transaction
            .query_row(
                "SELECT id FROM genres WHERE name = ?1 COLLATE NOCASE",
                [genre],
                |row| row.get(0),
            )
            .map_err(database_error("read-genre"))?;
        transaction
            .execute(
                "INSERT INTO track_genres (track_id, genre_id) VALUES (?1, ?2)",
                params![track_id, genre_id],
            )
            .map_err(database_error("attach-track-genre"))?;
    }
    Ok(())
}

fn relink_moved_track(
    transaction: &Transaction<'_>,
    root_id: &str,
    track: &crate::catalog::ScannedTrack,
    now: &str,
) -> Result<(), AppError> {
    let target_exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM tracks WHERE root_id = ?1 AND relative_path = ?2)",
            params![root_id, track.relative_path],
            |row| row.get(0),
        )
        .map_err(database_error("find-move-target"))?;
    if target_exists {
        return Ok(());
    }
    let mut statement = transaction
        .prepare(
            "SELECT id, canonical_path FROM tracks
             WHERE root_id = ?1 AND available = 0 AND file_size = ?2
             AND content_fingerprint = ?3 LIMIT 2",
        )
        .map_err(database_error("prepare-move-candidates"))?;
    let candidates = statement
        .query_map(
            params![root_id, track.file_size, track.content_fingerprint],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(database_error("query-move-candidates"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-move-candidates"))?;
    if let [(id, previous_path)] = candidates.as_slice()
        && !Path::new(previous_path).exists()
    {
        transaction
            .execute(
                "UPDATE tracks SET canonical_path = ?2, relative_path = ?3, updated_at = ?4
                 WHERE id = ?1",
                params![id, track.canonical_path, track.relative_path, now],
            )
            .map_err(database_error("relink-moved-track"))?;
    }
    Ok(())
}

fn upsert_artists(
    transaction: &Transaction<'_>,
    names: &[String],
    musicbrainz_ids: &[String],
    now: &str,
) -> Result<Vec<String>, AppError> {
    let mut ids = Vec::new();
    for name in names {
        let existing = transaction
            .query_row(
                "SELECT id FROM artists WHERE name = ?1 COLLATE NOCASE LIMIT 1",
                [name],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error("find-artist"))?;
        let id = if let Some(id) = existing {
            id
        } else {
            let id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO artists (id, name, musicbrainz_artist_id, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?4)",
                    params![id, name, musicbrainz_ids.get(ids.len()), now],
                )
                .map_err(database_error("insert-artist"))?;
            id
        };
        if let Some(musicbrainz_id) = musicbrainz_ids.get(ids.len()) {
            transaction
                .execute(
                    "UPDATE artists SET musicbrainz_artist_id = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, musicbrainz_id, now],
                )
                .map_err(database_error("update-artist-musicbrainz-id"))?;
        }
        ids.push(id);
    }
    Ok(ids)
}

#[allow(clippy::too_many_arguments)]
fn upsert_album(
    transaction: &Transaction<'_>,
    title: &str,
    artist_ids: &[String],
    year: Option<u32>,
    date: Option<&str>,
    label: Option<&str>,
    catalog_number: Option<&str>,
    musicbrainz_release_id: Option<&str>,
    artwork_id: Option<&str>,
    now: &str,
) -> Result<String, AppError> {
    let existing = transaction
        .query_row(
            "SELECT albums.id FROM albums
             LEFT JOIN album_artists ON album_artists.album_id = albums.id AND album_artists.position = 0
             WHERE albums.title = ?1 COLLATE NOCASE AND (?2 IS NULL OR album_artists.artist_id = ?2)
             LIMIT 1",
            params![title, artist_ids.first()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("find-album"))?;
    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    transaction
        .execute(
            "INSERT INTO albums (id, title, year, date, label, catalog_number, musicbrainz_release_id, artwork_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
             ON CONFLICT(id) DO UPDATE SET year = excluded.year, date = excluded.date,
             label = excluded.label, catalog_number = excluded.catalog_number,
             musicbrainz_release_id = excluded.musicbrainz_release_id,
             artwork_id = COALESCE(excluded.artwork_id, albums.artwork_id), updated_at = excluded.updated_at",
            params![id, title, year, date, label, catalog_number, musicbrainz_release_id, artwork_id, now],
        )
        .map_err(database_error("upsert-album"))?;
    transaction
        .execute("DELETE FROM album_artists WHERE album_id = ?1", [&id])
        .map_err(database_error("clear-album-artists"))?;
    for (position, artist_id) in artist_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO album_artists (album_id, artist_id, position) VALUES (?1, ?2, ?3)",
                params![id, artist_id, position],
            )
            .map_err(database_error("attach-album-artist"))?;
    }
    Ok(id)
}

fn mark_root_unavailable(
    connection: &mut Connection,
    root_id: &str,
    availability: RootAvailability,
) -> Result<(), AppError> {
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-root-unavailable"))?;
    transaction
        .execute(
            "UPDATE library_roots SET availability = ?2, updated_at = ?3 WHERE id = ?1",
            params![root_id, availability.as_str(), Utc::now().to_rfc3339()],
        )
        .map_err(database_error("mark-root-unavailable"))?;
    transaction
        .execute(
            "UPDATE tracks SET available = 0 WHERE root_id = ?1",
            [root_id],
        )
        .map_err(database_error("mark-root-tracks-unavailable"))?;
    transaction
        .commit()
        .map_err(database_error("commit-root-unavailable"))
}

fn track_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TrackSummary> {
    let extension: String = row.get(7)?;
    let extension = AudioExtension::from_database(&extension).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(7, "extension".into(), rusqlite::types::Type::Text)
    })?;
    Ok(TrackSummary {
        id: row.get(0)?,
        root_id: row.get(1)?,
        path: row.get(2)?,
        relative_path: row.get(3)?,
        title: row.get(4)?,
        sort_title: row.get(5)?,
        artists: Vec::new(),
        album_artists: Vec::new(),
        album_id: row.get(6)?,
        album: "Unknown Album".into(),
        genres: Vec::new(),
        extension,
        file_size: row.get(8)?,
        duration_ms: row.get(9)?,
        sample_rate: row.get(10)?,
        channels: row.get(11)?,
        bit_depth: row.get(12)?,
        play_count: 0,
        track_number: row.get(13)?,
        track_total: row.get(14)?,
        disc_number: row.get(15)?,
        disc_total: row.get(16)?,
        year: row.get(17)?,
        date: row.get(18)?,
        composer: row.get(19)?,
        label: row.get(20)?,
        catalog_number: row.get(21)?,
        isrc: row.get(22)?,
        musicbrainz_recording_id: row.get(23)?,
        artwork_id: row.get(24)?,
        artwork_path: None,
        available: row.get(25)?,
    })
}

const TRACK_COLUMNS: &str = "id, root_id, canonical_path, relative_path, title, sort_title,
    album_id, extension, file_size, duration_ms, sample_rate, channels, bit_depth,
    track_number, track_total, disc_number, disc_total, year, date, composer, label,
    catalog_number, isrc, musicbrainz_recording_id, artwork_id, available";

fn query_tracks(connection: &Connection, query: CatalogQuery) -> Result<TrackPage, AppError> {
    let _span = crate::metrics::Span::new("sqlite.query_tracks");
    let limit = query.limit.clamp(1, 500);
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let search_pattern =
        search.map(|value| format!("%{}%", value.replace('%', "\\%").replace('_', "\\_")));
    let available = query.available.map(i64::from);
    let where_clause = "(?1 IS NULL OR root_id = ?1) AND (?2 IS NULL OR available = ?2)
        AND (?3 IS NULL OR title LIKE ?3 ESCAPE '\\' COLLATE NOCASE OR relative_path LIKE ?3 ESCAPE '\\' COLLATE NOCASE
          OR composer LIKE ?3 ESCAPE '\\' COLLATE NOCASE OR label LIKE ?3 ESCAPE '\\' COLLATE NOCASE
          OR catalog_number LIKE ?3 ESCAPE '\\' COLLATE NOCASE
          OR EXISTS (SELECT 1 FROM albums sal WHERE sal.id = tracks.album_id AND sal.title LIKE ?3 ESCAPE '\\' COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM track_artists sta JOIN artists sa ON sa.id = sta.artist_id
                     WHERE sta.track_id = tracks.id AND sa.name LIKE ?3 ESCAPE '\\' COLLATE NOCASE)
          OR EXISTS (SELECT 1 FROM track_genres stg JOIN genres sg ON sg.id = stg.genre_id
                     WHERE stg.track_id = tracks.id AND sg.name LIKE ?3 ESCAPE '\\' COLLATE NOCASE))";
    let total: u64 = connection
        .query_row(
            &format!("SELECT COUNT(*) FROM tracks WHERE {where_clause}"),
            params![query.root_id, available, search_pattern],
            |row| row.get(0),
        )
        .map_err(database_error("count-catalog-tracks"))?;
    let order_column = match query.sort {
        TrackSort::Title => "title COLLATE NOCASE",
        TrackSort::Path => "relative_path COLLATE NOCASE",
        TrackSort::DateAdded => "added_at",
        TrackSort::LastModified => "modified_at_ms",
    };
    let direction = match query.direction {
        SortDirection::Ascending => "ASC",
        SortDirection::Descending => "DESC",
    };
    let sql = format!(
        "SELECT {TRACK_COLUMNS} FROM tracks WHERE {where_clause}
         ORDER BY {order_column} {direction}, id ASC LIMIT ?4 OFFSET ?5"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(database_error("prepare-catalog-query"))?;
    let mut items = statement
        .query_map(
            params![
                query.root_id,
                available,
                search_pattern,
                limit,
                query.offset
            ],
            track_from_row,
        )
        .map_err(database_error("query-catalog-tracks"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-catalog-tracks"))?;
    drop(statement);
    for track in &mut items {
        hydrate_track(connection, track)?;
    }
    Ok(TrackPage {
        items,
        total,
        offset: query.offset,
        limit,
    })
}

fn hydrate_track(connection: &Connection, track: &mut TrackSummary) -> Result<(), AppError> {
    track.play_count = connection
        .query_row(
            "SELECT COUNT(*) FROM listening_sessions WHERE track_id = ?1 AND completed = 1",
            [&track.id],
            |row| row.get(0),
        )
        .map_err(database_error("read-track-play-count"))?;
    track.artists = artist_references(connection, &track.id, "artist")?;
    track.album_artists = artist_references(connection, &track.id, "album-artist")?;
    track.artwork_path = artwork_path(connection, track.artwork_id.as_deref())?;
    if let Some(album_id) = &track.album_id {
        track.album = connection
            .query_row(
                "SELECT title FROM albums WHERE id = ?1",
                [album_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error("read-track-album"))?
            .unwrap_or_else(|| "Unknown Album".into());
    }
    let mut statement = connection
        .prepare(
            "SELECT genres.name FROM track_genres
             JOIN genres ON genres.id = track_genres.genre_id
             WHERE track_genres.track_id = ?1 ORDER BY genres.name COLLATE NOCASE",
        )
        .map_err(database_error("prepare-track-genres"))?;
    track.genres = statement
        .query_map([&track.id], |row| row.get(0))
        .map_err(database_error("query-track-genres"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-track-genres"))?;
    if let Some(patch) = get_metadata_draft(connection, &track.id)? {
        apply_metadata_override(track, patch);
    }
    Ok(())
}

fn artwork_path(
    connection: &Connection,
    artwork_id: Option<&str>,
) -> Result<Option<String>, AppError> {
    let Some(artwork_id) = artwork_id else {
        return Ok(None);
    };
    connection
        .query_row(
            "SELECT cache_path FROM artwork WHERE id = ?1",
            [artwork_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-artwork-path"))
}

fn apply_metadata_override(track: &mut TrackSummary, patch: MetadataPatch) {
    if let Some(title) = patch.title {
        track.title = title;
    }
    if let Some(artists) = patch.artists {
        track.artists = artists
            .into_iter()
            .enumerate()
            .map(|(index, name)| crate::ArtistReference {
                id: format!("override-artist-{index}"),
                name,
            })
            .collect();
    }
    if let Some(album) = patch.album {
        track.album = album;
    }
    if let Some(album_artists) = patch.album_artists {
        track.album_artists = album_artists
            .into_iter()
            .enumerate()
            .map(|(index, name)| crate::ArtistReference {
                id: format!("override-album-artist-{index}"),
                name,
            })
            .collect();
    }
    if let Some(genres) = patch.genres {
        track.genres = genres;
    }
    track.track_number = patch.track_number.or(track.track_number);
    track.track_total = patch.track_total.or(track.track_total);
    track.disc_number = patch.disc_number.or(track.disc_number);
    track.disc_total = patch.disc_total.or(track.disc_total);
    track.year = patch.year.or(track.year);
    track.date = patch.date.or(track.date.take());
    track.composer = patch.composer.or(track.composer.take());
    track.label = patch.label.or(track.label.take());
    track.catalog_number = patch.catalog_number.or(track.catalog_number.take());
    track.isrc = patch.isrc.or(track.isrc.take());
    track.artwork_id = patch.artwork_id.or(track.artwork_id.take());
}

fn artist_references(
    connection: &Connection,
    track_id: &str,
    role: &str,
) -> Result<Vec<crate::ArtistReference>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT artists.id, artists.name FROM track_artists
             JOIN artists ON artists.id = track_artists.artist_id
             WHERE track_artists.track_id = ?1 AND track_artists.role = ?2
             ORDER BY track_artists.position",
        )
        .map_err(database_error("prepare-track-artists"))?;
    statement
        .query_map(params![track_id, role], |row| {
            Ok(crate::ArtistReference {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(database_error("query-track-artists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-track-artists"))
}

fn query_discovery(
    connection: &Connection,
    query: DiscoveryQuery,
) -> Result<DiscoveryCatalog, AppError> {
    let limit = query.limit.clamp(1, 5_000);
    let pattern = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value.replace('%', "\\%").replace('_', "\\_")));
    Ok(DiscoveryCatalog {
        artists: query_artists(connection, None, pattern.as_deref(), query.offset, limit)?,
        albums: query_albums(connection, None, pattern.as_deref(), query.offset, limit)?,
        genres: query_genres(connection, pattern.as_deref(), query.offset, limit)?,
    })
}

fn query_artists(
    connection: &Connection,
    exact_id: Option<&str>,
    pattern: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<Vec<ArtistSummary>, AppError> {
    let _span = crate::metrics::Span::new("sqlite.query_artists");
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.name, a.musicbrainz_artist_id, COUNT(DISTINCT aa.album_id), COUNT(t.id),
                    COALESCE(SUM(t.duration_ms), 0), COALESCE(SUM(t.file_size), 0),
                    MIN(ar.cache_path), GROUP_CONCAT(DISTINCT g.name),
                    ra.last_refreshed_at,
                    (SELECT COUNT(1) FROM remote_release_artists rra WHERE rra.musicbrainz_artist_id = a.musicbrainz_artist_id)
             FROM artists a
             JOIN album_artists aa ON aa.artist_id = a.id
             LEFT JOIN albums al ON al.id = aa.album_id
             LEFT JOIN tracks t ON t.album_id = al.id AND t.available = 1
             LEFT JOIN artwork ar ON ar.id = al.artwork_id
             LEFT JOIN track_genres tg ON tg.track_id = t.id
             LEFT JOIN genres g ON g.id = tg.genre_id
             LEFT JOIN remote_artists ra ON ra.musicbrainz_artist_id = a.musicbrainz_artist_id
             WHERE (?1 IS NULL OR a.id = ?1) AND (?2 IS NULL OR a.name LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR
                    al.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR t.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR
                    t.composer LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR t.label LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR
                    t.catalog_number LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR g.name LIKE ?2 ESCAPE '\\' COLLATE NOCASE)
             GROUP BY a.id, a.name
             ORDER BY a.name COLLATE NOCASE, a.id LIMIT ?3 OFFSET ?4",
        )
        .map_err(database_error("prepare-artists-query"))?;
    let artists = statement
        .query_map(params![exact_id, pattern, limit, offset], |row| {
            let last_refreshed_at: Option<String> = row.get(9)?;
            let remote_count: i64 = row.get::<_, Option<i64>>(10)?.unwrap_or(0);
            let provenance = if remote_count > 0 || last_refreshed_at.is_some() {
                EntityProvenance::Both
            } else {
                EntityProvenance::Local
            };
            Ok(ArtistSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                musicbrainz_artist_id: row.get(2)?,
                provenance,
                availability: EntityAvailability::InLibrary,
                provider_ids: row.get::<_, Option<String>>(2)?.into_iter().collect(),
                last_refreshed_at,
                genres: row
                    .get::<_, Option<String>>(8)?
                    .unwrap_or_default()
                    .split(',')
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned)
                    .collect(),
                album_count: row.get(3)?,
                track_count: row.get(4)?,
                total_duration_ms: row.get(5)?,
                total_file_size: row.get(6)?,
                artwork_id: None,
                artwork_path: row.get(7)?,
            })
        })
        .map_err(database_error("query-artists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-artists"))?;
    Ok(artists)
}

fn query_artists_page(
    connection: &Connection,
    query: ArtistCatalogQuery,
) -> Result<ArtistCatalogPage, AppError> {
    let _span = crate::metrics::Span::new("sqlite.query_artists_page");
    let page_size = query.page_size.clamp(1, 200);
    let pattern = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value.replace('%', "\\%").replace('_', "\\_")));
    let cursor = query.cursor.as_deref().and_then(decode_artist_cursor);
    let (cursor_name, cursor_id) = cursor
        .map(|(name, id)| (Some(name), Some(id)))
        .unwrap_or((None, None));
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.name, a.musicbrainz_artist_id, COUNT(DISTINCT aa.album_id), COUNT(t.id),
                    COALESCE(SUM(t.duration_ms), 0), COALESCE(SUM(t.file_size), 0),
                    MIN(ar.cache_path), GROUP_CONCAT(DISTINCT g.name),
                    ra.last_refreshed_at,
                    (SELECT COUNT(1) FROM remote_release_artists rra WHERE rra.musicbrainz_artist_id = a.musicbrainz_artist_id)
             FROM artists a
             JOIN album_artists aa ON aa.artist_id = a.id
             LEFT JOIN albums al ON al.id = aa.album_id
             LEFT JOIN tracks t ON t.album_id = al.id AND t.available = COALESCE(?1, 1)
             LEFT JOIN artwork ar ON ar.id = al.artwork_id
             LEFT JOIN track_genres tg ON tg.track_id = t.id
             LEFT JOIN genres g ON g.id = tg.genre_id
             LEFT JOIN remote_artists ra ON ra.musicbrainz_artist_id = a.musicbrainz_artist_id
             WHERE (?2 IS NULL OR a.name LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR al.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR t.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR g.name LIKE ?2 ESCAPE '\\' COLLATE NOCASE)
               AND (?3 IS NULL OR a.name COLLATE NOCASE > ?3 COLLATE NOCASE OR (a.name COLLATE NOCASE = ?3 COLLATE NOCASE AND a.id > ?4))
             GROUP BY a.id, a.name
             ORDER BY a.name COLLATE NOCASE, a.id LIMIT ?5",
        )
        .map_err(database_error("prepare-artists-page"))?;
    let available = query.available.map(i64::from);
    let mut items = statement
        .query_map(
            params![available, pattern, cursor_name, cursor_id, page_size + 1],
            |row| {
                let last_refreshed_at: Option<String> = row.get(9)?;
                let remote_count: i64 = row.get::<_, Option<i64>>(10)?.unwrap_or(0);
                let provenance = if remote_count > 0 || last_refreshed_at.is_some() {
                    EntityProvenance::Both
                } else {
                    EntityProvenance::Local
                };
                Ok(ArtistSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    musicbrainz_artist_id: row.get(2)?,
                    provenance,
                    availability: EntityAvailability::InLibrary,
                    provider_ids: row.get::<_, Option<String>>(2)?.into_iter().collect(),
                    last_refreshed_at,
                    album_count: row.get(3)?,
                    track_count: row.get(4)?,
                    total_duration_ms: row.get(5)?,
                    total_file_size: row.get(6)?,
                    artwork_id: None,
                    artwork_path: row.get(7)?,
                    genres: row
                        .get::<_, Option<String>>(8)?
                        .unwrap_or_default()
                        .split(',')
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned)
                        .collect(),
                })
            },
        )
        .map_err(database_error("query-artists-page"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-artists-page"))?;
    let has_next = items.len() > page_size as usize;
    if has_next {
        items.pop();
    }
    let next_cursor = has_next.then(|| {
        let last = items.last().expect("page with next cursor has an item");
        encode_artist_cursor(&last.name, &last.id)
    });
    Ok(ArtistCatalogPage {
        items,
        next_cursor,
        page_size,
    })
}

fn encode_artist_cursor(name: &str, id: &str) -> String {
    format!("{}|{}", urlencoding::encode(name), id)
}

fn decode_artist_cursor(cursor: &str) -> Option<(String, String)> {
    let (name, id) = cursor.rsplit_once('|')?;
    let name = urlencoding::decode(name).ok()?.into_owned();
    (!id.is_empty()).then(|| (name, id.to_owned()))
}

fn query_albums(
    connection: &Connection,
    exact_id: Option<&str>,
    pattern: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<Vec<AlbumSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT al.id, al.title, al.year, al.label, al.catalog_number, al.artwork_id,
                COUNT(t.id), COALESCE(SUM(t.duration_ms), 0), COALESCE(SUM(t.file_size), 0),
                al.musicbrainz_release_id, rr.last_refreshed_at, rr.artwork_url
             FROM albums al
             LEFT JOIN tracks t ON t.album_id = al.id
             LEFT JOIN remote_releases rr ON rr.musicbrainz_release_group_id = al.musicbrainz_release_id
             WHERE (?1 IS NULL OR al.id = ?1) AND (?2 IS NULL OR al.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR
                al.label LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR al.catalog_number LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR
                EXISTS (SELECT 1 FROM album_artists aa JOIN artists a ON a.id = aa.artist_id
                        WHERE aa.album_id = al.id AND a.name LIKE ?2 ESCAPE '\\' COLLATE NOCASE) OR
                EXISTS (SELECT 1 FROM tracks st WHERE st.album_id = al.id AND
                        (st.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE OR st.composer LIKE ?2 ESCAPE '\\' COLLATE NOCASE)))
             GROUP BY al.id ORDER BY al.title COLLATE NOCASE, al.id LIMIT ?3 OFFSET ?4",
        )
        .map_err(database_error("prepare-albums-query"))?;
    let albums = statement
        .query_map(params![exact_id, pattern, limit, offset], |row| {
            let mb_id: Option<String> = row.get(9)?;
            let last_refreshed_at: Option<String> = row.get(10)?;
            let remote_artwork_url: Option<String> = row.get(11)?;
            let has_remote = mb_id.is_some() && last_refreshed_at.is_some();
            let provenance = if has_remote {
                EntityProvenance::Both
            } else {
                EntityProvenance::Local
            };
            Ok((
                AlbumSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artists: Vec::new(),
                    year: row.get(2)?,
                    label: row.get(3)?,
                    catalog_number: row.get(4)?,
                    artwork_id: row.get(5)?,
                    track_count: row.get(6)?,
                    total_duration_ms: row.get(7)?,
                    total_file_size: row.get(8)?,
                    artwork_path: None,
                    provenance,
                    availability: EntityAvailability::InLibrary,
                    provider_ids: mb_id.into_iter().collect(),
                    last_refreshed_at,
                },
                remote_artwork_url,
            ))
        })
        .map_err(database_error("query-albums"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-albums"))?;
    drop(statement);
    let mut result = Vec::with_capacity(albums.len());
    for (mut album, remote_art) in albums {
        album.artwork_path = artwork_path(connection, album.artwork_id.as_deref())?.or(remote_art);
        album.artists = album_artists(connection, &album.id)?;
        result.push(album);
    }
    Ok(result)
}

fn album_artists(
    connection: &Connection,
    album_id: &str,
) -> Result<Vec<crate::ArtistReference>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.name FROM album_artists aa JOIN artists a ON a.id = aa.artist_id
             WHERE aa.album_id = ?1 ORDER BY aa.position",
        )
        .map_err(database_error("prepare-album-artists"))?;
    statement
        .query_map([album_id], |row| {
            Ok(crate::ArtistReference {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(database_error("query-album-artists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-album-artists"))
}

fn query_genres(
    connection: &Connection,
    pattern: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<Vec<GenreSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT g.id, g.name, COUNT(DISTINCT t.album_id), COUNT(DISTINCT t.id)
             FROM genres g JOIN track_genres tg ON tg.genre_id = g.id JOIN tracks t ON t.id = tg.track_id
             WHERE ?1 IS NULL OR g.name LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR
               t.title LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR EXISTS (
                 SELECT 1 FROM track_artists ta JOIN artists a ON a.id = ta.artist_id
                 WHERE ta.track_id = t.id AND a.name LIKE ?1 ESCAPE '\\' COLLATE NOCASE)
             GROUP BY g.id ORDER BY g.name COLLATE NOCASE, g.id LIMIT ?2 OFFSET ?3",
        )
        .map_err(database_error("prepare-genres-query"))?;
    let mut genres = statement
        .query_map(params![pattern, limit, offset], |row| {
            Ok(GenreSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
                artists: Vec::new(),
            })
        })
        .map_err(database_error("query-genres"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-genres"))?;
    drop(statement);
    for genre in &mut genres {
        let mut artists = connection
            .prepare(
                "SELECT DISTINCT a.id, a.name FROM track_genres tg
                 JOIN track_artists ta ON ta.track_id = tg.track_id AND ta.role = 'artist'
                 JOIN artists a ON a.id = ta.artist_id WHERE tg.genre_id = ?1
                 ORDER BY a.name COLLATE NOCASE",
            )
            .map_err(database_error("prepare-genre-artists"))?;
        genre.artists = artists
            .query_map([&genre.id], |row| {
                Ok(crate::ArtistReference {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(database_error("query-genre-artists"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-genre-artists"))?;
    }
    Ok(genres)
}

fn get_artist_detail(connection: &Connection, id: &str) -> Result<ArtistDetail, AppError> {
    let artist_opt = query_artists(connection, Some(id), None, 0, 1)?
        .into_iter()
        .next();

    if artist_opt.is_none() {
        if let Some(remote_artist) = get_remote_artist_summary(connection, id)? {
            let mbid = remote_artist
                .musicbrainz_artist_id
                .clone()
                .unwrap_or_default();
            let albums = if !mbid.is_empty() {
                get_remote_releases_for_mbid(connection, &mbid)?
            } else {
                Vec::new()
            };
            return Ok(ArtistDetail {
                artist: remote_artist,
                albums,
                tracks: Vec::new(),
            });
        }
        return Err(AppError::new(
            "artist-not-found",
            "The requested artist no longer exists.",
        ));
    }
    let mut artist = artist_opt.unwrap();

    let mut album_statement = connection
        .prepare(
            "SELECT aa.album_id FROM album_artists aa
             JOIN tracks t ON t.album_id = aa.album_id AND t.available = 1
             WHERE aa.artist_id = ?1 GROUP BY aa.album_id ORDER BY aa.album_id",
        )
        .map_err(database_error("prepare-artist-albums"))?;
    let album_ids = album_statement
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(database_error("query-artist-albums"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-artist-albums"))?;
    drop(album_statement);
    let mut albums = Vec::with_capacity(album_ids.len());
    for album_id in album_ids {
        if let Some(album) = query_albums(connection, Some(&album_id), None, 0, 1)?
            .into_iter()
            .next()
        {
            albums.push(album);
        }
    }

    let mut remote_releases = Vec::new();
    if let Some(mbid) = artist.musicbrainz_artist_id.as_deref() {
        if let Ok(rels) = get_remote_releases_for_mbid(connection, mbid) {
            remote_releases.extend(rels);
        }
    }
    let fallback_artist_id = format!("artist-{}", artist.id);
    if let Ok(rels) = get_remote_releases_for_mbid(connection, &fallback_artist_id) {
        for r in rels {
            if !remote_releases.iter().any(|existing| existing.id == r.id) {
                remote_releases.push(r);
            }
        }
    }
    if let Ok(rels) = get_remote_releases_by_artist_name(connection, &artist.name) {
        for r in rels {
            if !remote_releases.iter().any(|existing| existing.id == r.id) {
                remote_releases.push(r);
            }
        }
    }

    if !remote_releases.is_empty() {
        artist.provenance = EntityProvenance::Both;
        let latest_refresh = remote_releases
            .iter()
            .filter_map(|r| r.last_refreshed_at.as_deref())
            .max();
        if let Some(refreshed) = latest_refresh {
            artist.last_refreshed_at = Some(refreshed.to_string());
        }

        let mut merge_stmt = connection
            .prepare(
                "SELECT local_id, remote_id FROM entity_merges WHERE local_entity_type = 'album' AND reviewed = 1",
            )
            .map_err(database_error("prepare-merges"))?;
        let merges: Vec<(String, String)> = merge_stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(database_error("query-merges"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-merges"))?;
        drop(merge_stmt);

        let mut matched_remote_ids = HashSet::new();

        for album in &mut albums {
            let mb_rel_id: Option<String> = connection
                .query_row(
                    "SELECT musicbrainz_release_id FROM albums WHERE id = ?1",
                    [&album.id],
                    |row| row.get(0),
                )
                .optional()
                .unwrap_or(None);

            let matching_remote = remote_releases.iter().find(|rr| {
                if let Some(ref mb_id) = mb_rel_id {
                    if !mb_id.is_empty() && rr.provider_ids.iter().any(|p| p == mb_id) {
                        return true;
                    }
                }
                merges
                    .iter()
                    .any(|(local, remote)| local == &album.id && remote == &rr.id)
            });

            if let Some(remote) = matching_remote {
                matched_remote_ids.insert(remote.id.clone());
                album.provenance = EntityProvenance::Both;
                album.availability = EntityAvailability::InLibrary;
                album.provider_ids = remote.provider_ids.clone();
                album.last_refreshed_at = remote.last_refreshed_at.clone();
                if album.artwork_path.is_none() {
                    album.artwork_path = remote.artwork_path.clone();
                }
            }
        }

        for remote in remote_releases {
            if !matched_remote_ids.contains(&remote.id) {
                albums.push(remote);
            }
        }
    }

    let tracks = tracks_for_entity(
        connection,
        "SELECT DISTINCT t.id FROM tracks t JOIN album_artists aa ON aa.album_id = t.album_id
         WHERE aa.artist_id = ?1 AND t.available = 1",
        id,
    )?;
    Ok(ArtistDetail {
        artist,
        albums,
        tracks,
    })
}

fn get_remote_artist_summary(
    connection: &Connection,
    id: &str,
) -> Result<Option<ArtistSummary>, AppError> {
    let row = connection
        .query_row(
            "SELECT id, name, musicbrainz_artist_id, last_refreshed_at FROM remote_artists
             WHERE id = ?1 OR musicbrainz_artist_id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()
        .map_err(database_error("query-remote-artist"))?;

    let Some((actual_id, name, mbid, last_refreshed_at)) = row else {
        return Ok(None);
    };

    let album_count: u64 = connection
        .query_row(
            "SELECT COUNT(DISTINCT remote_release_id) FROM remote_release_artists WHERE musicbrainz_artist_id = ?1",
            [&mbid],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(Some(ArtistSummary {
        id: actual_id,
        name,
        musicbrainz_artist_id: Some(mbid.clone()),
        provenance: EntityProvenance::Remote,
        availability: EntityAvailability::NotLocal,
        provider_ids: vec![mbid],
        last_refreshed_at,
        genres: Vec::new(),
        album_count,
        track_count: 0,
        total_duration_ms: 0,
        total_file_size: 0,
        artwork_id: None,
        artwork_path: None,
    }))
}

fn get_remote_releases_for_mbid(
    connection: &Connection,
    mbid: &str,
) -> Result<Vec<AlbumSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT r.id, r.musicbrainz_release_group_id, r.title, r.year, r.label,
                    r.catalog_number, r.artwork_url, r.last_refreshed_at
             FROM remote_releases r
             JOIN remote_release_artists ra ON ra.remote_release_id = r.id
             WHERE ra.musicbrainz_artist_id = ?1
             ORDER BY COALESCE(r.year, 0) DESC, r.title COLLATE NOCASE",
        )
        .map_err(database_error("prepare-remote-releases"))?;
    let rows = statement
        .query_map([mbid], |row| {
            let id: String = row.get(0)?;
            let mb_rg_id: String = row.get(1)?;
            let title: String = row.get(2)?;
            let year: Option<u32> = row.get(3)?;
            let label: Option<String> = row.get(4)?;
            let catalog_number: Option<String> = row.get(5)?;
            let artwork_url: Option<String> = row.get(6)?;
            let last_refreshed_at: Option<String> = row.get(7)?;
            Ok((
                id,
                mb_rg_id,
                title,
                year,
                label,
                catalog_number,
                artwork_url,
                last_refreshed_at,
            ))
        })
        .map_err(database_error("query-remote-releases"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-remote-releases"))?;
    drop(statement);

    let mut summaries = Vec::with_capacity(rows.len());
    for (id, mb_rg_id, title, year, label, catalog_number, artwork_url, last_refreshed_at) in rows {
        let mut artist_statement = connection
            .prepare(
                "SELECT musicbrainz_artist_id, artist_name FROM remote_release_artists
                 WHERE remote_release_id = ?1 ORDER BY position",
            )
            .map_err(database_error("prepare-remote-artists"))?;
        let artists = artist_statement
            .query_map([&id], |row| {
                Ok(crate::ArtistReference {
                    id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    name: row.get(1)?,
                })
            })
            .map_err(database_error("query-remote-artists"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-remote-artists"))?;
        drop(artist_statement);

        summaries.push(AlbumSummary {
            id,
            title,
            artists,
            year,
            label,
            catalog_number,
            artwork_id: None,
            track_count: 0,
            total_duration_ms: 0,
            total_file_size: 0,
            artwork_path: artwork_url,
            provenance: EntityProvenance::Remote,
            availability: EntityAvailability::NotLocal,
            provider_ids: vec![mb_rg_id],
            last_refreshed_at,
        });
    }
    Ok(summaries)
}

fn get_remote_releases_by_artist_name(
    connection: &Connection,
    artist_name: &str,
) -> Result<Vec<AlbumSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT r.id, r.musicbrainz_release_group_id, r.title, r.year, r.label,
                    r.catalog_number, r.artwork_url, r.last_refreshed_at
             FROM remote_releases r
             JOIN remote_release_artists ra ON ra.remote_release_id = r.id
             WHERE ra.artist_name = ?1 COLLATE NOCASE
             ORDER BY COALESCE(r.year, 0) DESC, r.title COLLATE NOCASE",
        )
        .map_err(database_error("prepare-remote-releases-by-name"))?;
    let rows = statement
        .query_map([artist_name], |row| {
            let id: String = row.get(0)?;
            let mb_rg_id: String = row.get(1)?;
            let title: String = row.get(2)?;
            let year: Option<u32> = row.get(3)?;
            let label: Option<String> = row.get(4)?;
            let catalog_number: Option<String> = row.get(5)?;
            let artwork_url: Option<String> = row.get(6)?;
            let last_refreshed_at: Option<String> = row.get(7)?;
            Ok((
                id,
                mb_rg_id,
                title,
                year,
                label,
                catalog_number,
                artwork_url,
                last_refreshed_at,
            ))
        })
        .map_err(database_error("query-remote-releases-by-name"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-remote-releases-by-name"))?;
    drop(statement);

    let mut summaries = Vec::with_capacity(rows.len());
    for (id, mb_rg_id, title, year, label, catalog_number, artwork_url, last_refreshed_at) in rows {
        let mut artist_statement = connection
            .prepare(
                "SELECT musicbrainz_artist_id, artist_name FROM remote_release_artists
                 WHERE remote_release_id = ?1 ORDER BY position",
            )
            .map_err(database_error("prepare-remote-artists"))?;
        let artists = artist_statement
            .query_map([&id], |row| {
                Ok(crate::ArtistReference {
                    id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    name: row.get(1)?,
                })
            })
            .map_err(database_error("query-remote-artists"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-remote-artists"))?;
        drop(artist_statement);

        summaries.push(AlbumSummary {
            id,
            title,
            artists,
            year,
            label,
            catalog_number,
            artwork_id: None,
            track_count: 0,
            total_duration_ms: 0,
            total_file_size: 0,
            artwork_path: artwork_url,
            provenance: EntityProvenance::Remote,
            availability: EntityAvailability::NotLocal,
            provider_ids: vec![mb_rg_id],
            last_refreshed_at,
        });
    }
    Ok(summaries)
}

fn normalize_title(title: &str) -> String {
    title
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn match_and_unify_tracks(
    local_tracks: Vec<TrackSummary>,
    remote_tracks: Vec<RemoteTrackPayload>,
    album: &AlbumSummary,
) -> (Vec<TrackSummary>, Vec<UnifiedTrackSummary>) {
    if remote_tracks.is_empty() {
        let unified = local_tracks
            .iter()
            .map(|t| UnifiedTrackSummary {
                id: Some(t.id.clone()),
                remote_id: t
                    .musicbrainz_recording_id
                    .clone()
                    .unwrap_or_else(|| format!("local:{}", t.id)),
                track_number: t.track_number.unwrap_or(1),
                disc_number: t.disc_number.unwrap_or(1),
                title: t.title.clone(),
                artists: if !t.artists.is_empty() {
                    t.artists.clone()
                } else {
                    album.artists.clone()
                },
                duration_ms: t.duration_ms,
                is_local: true,
                audio_specs: Some(AudioSpecs {
                    extension: t.extension,
                    sample_rate: t.sample_rate,
                    bit_depth: t.bit_depth,
                    channels: t.channels,
                }),
                isrc: t.isrc.clone(),
                musicbrainz_recording_id: t.musicbrainz_recording_id.clone(),
                spotify_track_id: None,
                acquisition_status: None,
            })
            .collect();
        return (local_tracks, unified);
    }

    let mut matched_local = vec![false; local_tracks.len()];
    let mut remote_match: Vec<Option<usize>> = vec![None; remote_tracks.len()];

    // Pass 1: MusicBrainz Recording ID match
    for (r_idx, r) in remote_tracks.iter().enumerate() {
        if remote_match[r_idx].is_none() {
            if let Some(ref r_mbid) = r.musicbrainz_recording_id {
                if !r_mbid.trim().is_empty() {
                    for (l_idx, l) in local_tracks.iter().enumerate() {
                        if !matched_local[l_idx]
                            && l.musicbrainz_recording_id.as_deref() == Some(r_mbid.as_str())
                        {
                            matched_local[l_idx] = true;
                            remote_match[r_idx] = Some(l_idx);
                            break;
                        }
                    }
                }
            }
        }
    }

    // Pass 2: ISRC match
    for (r_idx, r) in remote_tracks.iter().enumerate() {
        if remote_match[r_idx].is_none() {
            if let Some(ref r_isrc) = r.isrc {
                if !r_isrc.trim().is_empty() {
                    for (l_idx, l) in local_tracks.iter().enumerate() {
                        if !matched_local[l_idx] {
                            if let Some(ref l_isrc) = l.isrc {
                                if l_isrc.trim().eq_ignore_ascii_case(r_isrc.trim()) {
                                    matched_local[l_idx] = true;
                                    remote_match[r_idx] = Some(l_idx);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Pass 3: (disc_number, track_number, title) match
    for (r_idx, r) in remote_tracks.iter().enumerate() {
        if remote_match[r_idx].is_none() {
            for (l_idx, l) in local_tracks.iter().enumerate() {
                if !matched_local[l_idx] {
                    let l_disc = l.disc_number.unwrap_or(1);
                    let l_track = l.track_number.unwrap_or(0);
                    if l_disc == r.disc_number && l_track == r.track_number {
                        let norm_l = normalize_title(&l.title);
                        let norm_r = normalize_title(&r.title);
                        if norm_l == norm_r || norm_l.is_empty() || norm_r.is_empty() {
                            matched_local[l_idx] = true;
                            remote_match[r_idx] = Some(l_idx);
                            break;
                        }
                    }
                }
            }
        }
    }

    // Pass 4: (disc_number, track_number) match fallback
    for (r_idx, r) in remote_tracks.iter().enumerate() {
        if remote_match[r_idx].is_none() {
            for (l_idx, l) in local_tracks.iter().enumerate() {
                if !matched_local[l_idx] {
                    let l_disc = l.disc_number.unwrap_or(1);
                    let l_track = l.track_number.unwrap_or(0);
                    if l_disc == r.disc_number && l_track == r.track_number {
                        matched_local[l_idx] = true;
                        remote_match[r_idx] = Some(l_idx);
                        break;
                    }
                }
            }
        }
    }

    // Pass 5: Title match (ignoring case, whitespace, and punctuation)
    for (r_idx, r) in remote_tracks.iter().enumerate() {
        if remote_match[r_idx].is_none() {
            let norm_r = normalize_title(&r.title);
            if !norm_r.is_empty() {
                for (l_idx, l) in local_tracks.iter().enumerate() {
                    if !matched_local[l_idx] {
                        let norm_l = normalize_title(&l.title);
                        if norm_l == norm_r {
                            matched_local[l_idx] = true;
                            remote_match[r_idx] = Some(l_idx);
                            break;
                        }
                    }
                }
            }
        }
    }

    let mut combined_tracks: Vec<TrackSummary> = Vec::new();
    let mut unified_tracks: Vec<UnifiedTrackSummary> = Vec::new();

    for (r_idx, r) in remote_tracks.iter().enumerate() {
        if let Some(l_idx) = remote_match[r_idx] {
            let l = &local_tracks[l_idx];
            let mut track_summary = l.clone();
            track_summary.available = true;
            if track_summary.track_number.is_none() {
                track_summary.track_number = Some(r.track_number);
            }
            if track_summary.disc_number.is_none() {
                track_summary.disc_number = Some(r.disc_number);
            }
            if track_summary.isrc.is_none() {
                track_summary.isrc = r.isrc.clone();
            }
            if track_summary.musicbrainz_recording_id.is_none() {
                track_summary.musicbrainz_recording_id = r.musicbrainz_recording_id.clone();
            }
            combined_tracks.push(track_summary);

            unified_tracks.push(UnifiedTrackSummary {
                id: Some(l.id.clone()),
                remote_id: r.id.clone(),
                track_number: r.track_number,
                disc_number: r.disc_number,
                title: if !l.title.is_empty() {
                    l.title.clone()
                } else {
                    r.title.clone()
                },
                artists: if !l.artists.is_empty() {
                    l.artists.clone()
                } else {
                    album.artists.clone()
                },
                duration_ms: l.duration_ms.or(r.duration_ms),
                is_local: true,
                audio_specs: Some(AudioSpecs {
                    extension: l.extension,
                    sample_rate: l.sample_rate,
                    bit_depth: l.bit_depth,
                    channels: l.channels,
                }),
                isrc: l.isrc.clone().or_else(|| r.isrc.clone()),
                musicbrainz_recording_id: l
                    .musicbrainz_recording_id
                    .clone()
                    .or_else(|| r.musicbrainz_recording_id.clone()),
                spotify_track_id: r.spotify_track_id.clone(),
                acquisition_status: None,
            });
        } else {
            combined_tracks.push(TrackSummary {
                id: r.id.clone(),
                root_id: String::new(),
                path: String::new(),
                relative_path: String::new(),
                title: r.title.clone(),
                sort_title: None,
                artists: album.artists.clone(),
                album_artists: album.artists.clone(),
                album_id: Some(album.id.clone()),
                album: album.title.clone(),
                genres: Vec::new(),
                track_number: Some(r.track_number),
                track_total: None,
                disc_number: Some(r.disc_number),
                disc_total: None,
                year: album.year,
                date: None,
                composer: None,
                label: album.label.clone(),
                catalog_number: album.catalog_number.clone(),
                isrc: r.isrc.clone(),
                musicbrainz_recording_id: r.musicbrainz_recording_id.clone(),
                artwork_id: album.artwork_id.clone(),
                artwork_path: album.artwork_path.clone(),
                extension: AudioExtension::Flac,
                file_size: 0,
                duration_ms: r.duration_ms,
                sample_rate: None,
                channels: None,
                bit_depth: None,
                play_count: 0,
                available: false,
            });

            unified_tracks.push(UnifiedTrackSummary {
                id: None,
                remote_id: r.id.clone(),
                track_number: r.track_number,
                disc_number: r.disc_number,
                title: r.title.clone(),
                artists: album.artists.clone(),
                duration_ms: r.duration_ms,
                is_local: false,
                audio_specs: None,
                isrc: r.isrc.clone(),
                musicbrainz_recording_id: r.musicbrainz_recording_id.clone(),
                spotify_track_id: r.spotify_track_id.clone(),
                acquisition_status: None,
            });
        }
    }

    // Include any local tracks that weren't matched in the remote tracklist
    for (l_idx, l) in local_tracks.into_iter().enumerate() {
        if !matched_local[l_idx] {
            combined_tracks.push(l.clone());
            unified_tracks.push(UnifiedTrackSummary {
                id: Some(l.id.clone()),
                remote_id: l
                    .musicbrainz_recording_id
                    .clone()
                    .unwrap_or_else(|| format!("local:{}", l.id)),
                track_number: l.track_number.unwrap_or(0),
                disc_number: l.disc_number.unwrap_or(1),
                title: l.title.clone(),
                artists: if !l.artists.is_empty() {
                    l.artists.clone()
                } else {
                    album.artists.clone()
                },
                duration_ms: l.duration_ms,
                is_local: true,
                audio_specs: Some(AudioSpecs {
                    extension: l.extension,
                    sample_rate: l.sample_rate,
                    bit_depth: l.bit_depth,
                    channels: l.channels,
                }),
                isrc: l.isrc.clone(),
                musicbrainz_recording_id: l.musicbrainz_recording_id.clone(),
                spotify_track_id: None,
                acquisition_status: None,
            });
        }
    }

    (combined_tracks, unified_tracks)
}

struct ResolvedAlbumData {
    album: AlbumSummary,
    combined_tracks: Vec<TrackSummary>,
    unified_tracks: Vec<UnifiedTrackSummary>,
}

fn resolve_album_data(
    connection: &Connection,
    id: &str,
) -> Result<Option<ResolvedAlbumData>, AppError> {
    if let Some(mut album) = query_albums(connection, Some(id), None, 0, 1)?
        .into_iter()
        .next()
    {
        let mb_rel_id: Option<String> = connection
            .query_row(
                "SELECT musicbrainz_release_id FROM albums WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);
        let merge_remote_ids: Vec<String> = connection
            .prepare(
                "SELECT remote_id FROM entity_merges WHERE local_entity_type = 'album' AND local_id = ?1 AND reviewed = 1 ORDER BY updated_at DESC",
            )
            .and_then(|mut stmt| {
                let rows = stmt.query_map([id], |row| row.get(0))?;
                rows.collect::<rusqlite::Result<Vec<_>>>()
            })
            .unwrap_or_default();

        let mut remote_release_id: Option<String> = None;
        if let Some(ref mb_id) = mb_rel_id {
            if let Some((rg_pk, rg_id, refreshed, art)) = connection
                .query_row(
                    "SELECT id, musicbrainz_release_group_id, last_refreshed_at, artwork_url FROM remote_releases WHERE musicbrainz_release_group_id = ?1",
                    [mb_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, Option<String>>(3)?)),
                )
                .optional()
                .unwrap_or(None)
            {
                album.provenance = EntityProvenance::Both;
                album.availability = EntityAvailability::InLibrary;
                album.provider_ids = vec![rg_id];
                album.last_refreshed_at = refreshed;
                if album.artwork_path.is_none() {
                    album.artwork_path = art;
                }
                remote_release_id = Some(rg_pk);
            }
        }

        for remote_id in &merge_remote_ids {
            if let Some((rg_pk, rg_id, refreshed, art)) = connection
                .query_row(
                    "SELECT id, musicbrainz_release_group_id, last_refreshed_at, artwork_url FROM remote_releases WHERE id = ?1 OR musicbrainz_release_group_id = ?1",
                    [remote_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, Option<String>>(3)?)),
                )
                .optional()
                .unwrap_or(None)
            {
                album.provenance = EntityProvenance::Both;
                album.availability = EntityAvailability::InLibrary;
                if !album.provider_ids.contains(&rg_id) {
                    album.provider_ids.push(rg_id);
                }
                if album.last_refreshed_at.is_none() {
                    album.last_refreshed_at = refreshed;
                }
                if album.artwork_path.is_none() {
                    album.artwork_path = art;
                }
                if remote_release_id.is_none() {
                    remote_release_id = Some(rg_pk);
                }
            } else if remote_release_id.is_none() {
                remote_release_id = Some(remote_id.clone());
            }
        }

        let local_tracks =
            tracks_for_entity(connection, "SELECT id FROM tracks WHERE album_id = ?1", id)?;
        let mut remote_tracks = Vec::new();

        // 1. Check direct remote_release_id
        if let Some(ref rel_id) = remote_release_id {
            remote_tracks = get_remote_tracks_for_release(connection, rel_id)?;
        }

        // 2. Check all merge_remote_ids if still empty
        if remote_tracks.is_empty() {
            for remote_id in &merge_remote_ids {
                let trs = get_remote_tracks_for_release(connection, remote_id)?;
                if !trs.is_empty() {
                    remote_tracks = trs;
                    break;
                }
            }
        }

        // 3. Check title matching in remote_releases
        if remote_tracks.is_empty() {
            let clean_prefix = album
                .title
                .split('(')
                .next()
                .unwrap_or(&album.title)
                .split('[')
                .next()
                .unwrap_or(&album.title)
                .trim();
            let clean_pattern = format!("%{clean_prefix}%");

            let possible_rel_ids: Vec<String> = connection
                .prepare(
                    "SELECT DISTINCT r.id FROM remote_releases r
                     WHERE r.title = ?1 COLLATE NOCASE
                        OR r.title LIKE ?2 ESCAPE '\\' COLLATE NOCASE
                     LIMIT 5",
                )
                .and_then(|mut stmt| {
                    let rows =
                        stmt.query_map(params![&album.title, clean_pattern], |row| row.get(0))?;
                    rows.collect::<rusqlite::Result<Vec<_>>>()
                })
                .unwrap_or_default();

            for rel_id in possible_rel_ids {
                let trs = get_remote_tracks_for_release(connection, &rel_id).unwrap_or_default();
                if !trs.is_empty() {
                    remote_tracks = trs;
                    break;
                }
            }
        }

        // 4. Fallbacks
        if remote_tracks.is_empty() {
            let fallback_id = format!("remote:{}", id);
            let ftrs = get_remote_tracks_for_release(connection, &fallback_id)?;
            if !ftrs.is_empty() {
                remote_tracks = ftrs;
            } else {
                remote_tracks = get_remote_tracks_for_release(connection, id)?;
            }
        }

        let (combined_tracks, unified_tracks) =
            match_and_unify_tracks(local_tracks, remote_tracks, &album);

        if album.track_count == 0 && !combined_tracks.is_empty() {
            album.track_count = combined_tracks.len() as u64;
        }
        if album.total_duration_ms == 0 && !combined_tracks.is_empty() {
            album.total_duration_ms = combined_tracks.iter().filter_map(|t| t.duration_ms).sum();
        }

        return Ok(Some(ResolvedAlbumData {
            album,
            combined_tracks,
            unified_tracks,
        }));
    }

    let row = connection
        .query_row(
            "SELECT id, musicbrainz_release_group_id, title, year, label, catalog_number, artwork_url, last_refreshed_at
             FROM remote_releases WHERE id = ?1 OR musicbrainz_release_group_id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<u32>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            },
        )
        .optional()
        .map_err(database_error("query-remote-album-detail"))?;

    let Some((
        actual_id,
        mb_rg_id,
        title,
        year,
        label,
        catalog_number,
        artwork_url,
        last_refreshed_at,
    )) = row
    else {
        return Ok(None);
    };

    let mut artist_stmt = connection
        .prepare(
            "SELECT musicbrainz_artist_id, artist_name FROM remote_release_artists WHERE remote_release_id = ?1 ORDER BY position",
        )
        .map_err(database_error("prepare-remote-artists"))?;
    let artists = artist_stmt
        .query_map([&actual_id], |row| {
            Ok(crate::ArtistReference {
                id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                name: row.get(1)?,
            })
        })
        .map_err(database_error("query-remote-artists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-remote-artists"))?;

    let linked_local_id: Option<String> = connection
        .query_row(
            "SELECT id FROM albums WHERE musicbrainz_release_id = ?1",
            [&mb_rg_id],
            |row| row.get(0),
        )
        .optional()
        .unwrap_or(None)
        .or_else(|| {
            connection
                .query_row(
                    "SELECT local_id FROM entity_merges WHERE local_entity_type = 'album' AND (remote_id = ?1 OR remote_id = ?2) AND reviewed = 1",
                    params![actual_id, mb_rg_id],
                    |row| row.get(0),
                )
                .optional()
                .unwrap_or(None)
        });

    let (provenance, availability, local_tracks) = if let Some(ref local_id) = linked_local_id {
        let tracks = tracks_for_entity(
            connection,
            "SELECT id FROM tracks WHERE album_id = ?1",
            local_id,
        )?;
        (
            EntityProvenance::Both,
            EntityAvailability::InLibrary,
            tracks,
        )
    } else {
        (
            EntityProvenance::Remote,
            EntityAvailability::NotLocal,
            Vec::new(),
        )
    };

    let remote_tracks = get_remote_tracks_for_release(connection, &actual_id)?;

    let mut album = AlbumSummary {
        id: actual_id,
        title,
        artists,
        year,
        label,
        catalog_number,
        artwork_id: None,
        track_count: 0,
        total_duration_ms: 0,
        total_file_size: 0,
        artwork_path: artwork_url,
        provenance,
        availability,
        provider_ids: vec![mb_rg_id],
        last_refreshed_at,
    };

    let (combined_tracks, unified_tracks) =
        match_and_unify_tracks(local_tracks, remote_tracks, &album);

    album.track_count = combined_tracks.len() as u64;
    album.total_duration_ms = combined_tracks.iter().filter_map(|t| t.duration_ms).sum();

    Ok(Some(ResolvedAlbumData {
        album,
        combined_tracks,
        unified_tracks,
    }))
}

fn get_album_detail(connection: &Connection, id: &str) -> Result<AlbumDetail, AppError> {
    let resolved = resolve_album_data(connection, id)?
        .ok_or_else(|| AppError::new("album-not-found", "The requested album no longer exists."))?;
    Ok(AlbumDetail {
        album: resolved.album,
        tracks: resolved.combined_tracks,
    })
}

fn get_unified_album_detail(
    connection: &Connection,
    id: &str,
) -> Result<UnifiedAlbumDetail, AppError> {
    let resolved = resolve_album_data(connection, id)?
        .ok_or_else(|| AppError::new("album-not-found", "The requested album no longer exists."))?;
    Ok(UnifiedAlbumDetail {
        album: resolved.album,
        tracks: resolved.unified_tracks,
    })
}

pub(crate) fn save_remote_tracks(
    connection: &mut Connection,
    release_id: &str,
    tracks: &[RemoteTrackPayload],
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let tx = connection
        .transaction()
        .map_err(database_error("begin-save-remote-tracks"))?;

    tx.execute(
        "DELETE FROM remote_tracks WHERE release_id = ?1",
        [release_id],
    )
    .map_err(database_error("delete-remote-tracks"))?;

    for track in tracks {
        let track_id = if track.id.is_empty() {
            format!(
                "rtrack-{}-{}-{}",
                release_id, track.disc_number, track.track_number
            )
        } else {
            track.id.clone()
        };
        tx.execute(
            "INSERT INTO remote_tracks
             (id, release_id, track_number, disc_number, title, duration_ms, isrc, musicbrainz_recording_id, spotify_track_id, last_updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               release_id = excluded.release_id,
               track_number = excluded.track_number,
               disc_number = excluded.disc_number,
               title = excluded.title,
               duration_ms = excluded.duration_ms,
               isrc = excluded.isrc,
               musicbrainz_recording_id = excluded.musicbrainz_recording_id,
               spotify_track_id = excluded.spotify_track_id,
               last_updated_at = excluded.last_updated_at",
            params![
                track_id,
                release_id,
                track.track_number as i64,
                track.disc_number as i64,
                track.title,
                track.duration_ms.map(|d| d as i64),
                track.isrc,
                track.musicbrainz_recording_id,
                track.spotify_track_id,
                now,
            ],
        )
        .map_err(database_error("insert-remote-track"))?;
    }

    tx.commit()
        .map_err(database_error("commit-save-remote-tracks"))?;
    Ok(())
}

pub(crate) fn get_remote_tracks_for_release(
    connection: &Connection,
    release_id: &str,
) -> Result<Vec<RemoteTrackPayload>, AppError> {
    let mut stmt = connection
        .prepare(
            "SELECT id, release_id, track_number, disc_number, title, duration_ms, isrc, musicbrainz_recording_id, spotify_track_id
             FROM remote_tracks
             WHERE release_id = ?1
             ORDER BY disc_number ASC, track_number ASC",
        )
        .map_err(database_error("prepare-query-remote-tracks"))?;

    let rows = stmt
        .query_map([release_id], |row| {
            let duration_i64: Option<i64> = row.get(5)?;
            Ok(RemoteTrackPayload {
                id: row.get(0)?,
                release_id: row.get(1)?,
                track_number: row.get::<_, i64>(2)? as u32,
                disc_number: row.get::<_, i64>(3)? as u32,
                title: row.get(4)?,
                duration_ms: duration_i64.map(|d| d as u64),
                isrc: row.get(6)?,
                musicbrainz_recording_id: row.get(7)?,
                spotify_track_id: row.get(8)?,
            })
        })
        .map_err(database_error("query-remote-tracks"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-remote-tracks"))?;

    Ok(rows)
}

fn save_remote_discography(
    connection: &mut Connection,
    artist_mbid: &str,
    artist_name: &str,
    releases: &[RemoteReleasePayload],
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let tx = connection
        .transaction()
        .map_err(database_error("begin-save-discography"))?;

    let remote_artist_id = format!("remote:{artist_mbid}");
    tx.execute(
        "INSERT INTO remote_artists (id, musicbrainz_artist_id, name, last_refreshed_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4, ?4)
         ON CONFLICT(musicbrainz_artist_id) DO UPDATE SET
           name = excluded.name,
           last_refreshed_at = excluded.last_refreshed_at,
           updated_at = excluded.updated_at",
        params![remote_artist_id, artist_mbid, artist_name, now],
    )
    .map_err(database_error("save-remote-artist"))?;

    for release in releases {
        let sec_types = release.secondary_types.join(",");
        tx.execute(
            "INSERT INTO remote_releases
               (id, musicbrainz_release_group_id, title, sort_title, year, date, primary_type,
                secondary_types, disambiguation, catalog_number, label, artwork_url,
                artwork_attribution, artwork_source, raw_json, last_refreshed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?15)
             ON CONFLICT(musicbrainz_release_group_id) DO UPDATE SET
               title = excluded.title,
               sort_title = excluded.sort_title,
               year = excluded.year,
               date = excluded.date,
               primary_type = excluded.primary_type,
               secondary_types = excluded.secondary_types,
               disambiguation = excluded.disambiguation,
               artwork_url = excluded.artwork_url,
               artwork_attribution = excluded.artwork_attribution,
               artwork_source = excluded.artwork_source,
               raw_json = excluded.raw_json,
               last_refreshed_at = excluded.last_refreshed_at,
               updated_at = excluded.updated_at",
            params![
                release.id,
                release.musicbrainz_release_group_id,
                release.title,
                release.year,
                release.date,
                release.primary_type,
                sec_types,
                release.disambiguation,
                release.catalog_number,
                release.label,
                release.artwork_url,
                release.artwork_attribution,
                release.artwork_source,
                release.raw_json,
                now,
            ],
        )
        .map_err(database_error("save-remote-release"))?;

        tx.execute(
            "DELETE FROM remote_release_artists WHERE remote_release_id = ?1",
            [&release.id],
        )
        .map_err(database_error("clear-remote-release-artists"))?;

        for (position, artist) in release.artists.iter().enumerate() {
            tx.execute(
                "INSERT INTO remote_release_artists (remote_release_id, artist_name, musicbrainz_artist_id, position)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    release.id,
                    artist.name,
                    if artist.id.is_empty() {
                        None
                    } else {
                        Some(&artist.id)
                    },
                    position as i64
                ],
            )
            .map_err(database_error("save-remote-release-artist"))?;
        }
    }

    tx.commit()
        .map_err(database_error("commit-save-discography"))?;
    Ok(())
}

fn set_artist_musicbrainz_id(
    connection: &Connection,
    artist_id: &str,
    mbid: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "UPDATE artists SET musicbrainz_artist_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![mbid, now, artist_id],
        )
        .map_err(database_error("update-artist-mbid"))?;
    Ok(())
}

/// Artists that have never had a discography sync, or whose last sync is older
/// than `stale_after_days`. Ordered so never-checked artists are covered first.
fn list_artists_for_discography_sync(
    connection: &Connection,
    stale_after_days: i64,
) -> Result<Vec<ArtistSyncRow>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT id, name FROM artists
             WHERE discography_checked_at IS NULL
                OR julianday('now') - julianday(discography_checked_at) >= ?1
             ORDER BY discography_checked_at IS NOT NULL, name COLLATE NOCASE",
        )
        .map_err(database_error("list-discography-sync-artists"))?;
    let rows = statement
        .query_map(params![stale_after_days], |row| {
            Ok(ArtistSyncRow {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(database_error("list-discography-sync-artists"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error("list-discography-sync-artists"))?;
    Ok(rows)
}

fn mark_artist_discography_checked(
    connection: &Connection,
    artist_id: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "UPDATE artists SET discography_checked_at = ?1 WHERE id = ?2",
            params![now, artist_id],
        )
        .map_err(database_error("mark-artist-discography-checked"))?;
    Ok(())
}

/// Resolve an album to the remote release carrying its MusicBrainz release-group
/// id, whether the album is itself a remote entity or a local album that has been
/// merged with one.
fn resolve_album_release_group(
    connection: &Connection,
    album_id: &str,
) -> Result<Option<ReleaseSyncRow>, AppError> {
    let direct = connection
        .query_row(
            "SELECT id, musicbrainz_release_group_id FROM remote_releases WHERE id = ?1",
            params![album_id],
            |row| {
                Ok(ReleaseSyncRow {
                    id: row.get(0)?,
                    musicbrainz_release_group_id: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(database_error("resolve-album-release-group"))?;
    if direct.is_some() {
        return Ok(direct);
    }

    let merged = connection
        .query_row(
            "SELECT r.id, r.musicbrainz_release_group_id
             FROM entity_merges m
             JOIN remote_releases r ON r.id = m.remote_id
             WHERE m.local_entity_type = 'album' AND m.local_id = ?1
             ORDER BY m.updated_at DESC
             LIMIT 1",
            params![album_id],
            |row| {
                Ok(ReleaseSyncRow {
                    id: row.get(0)?,
                    musicbrainz_release_group_id: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(database_error("resolve-album-release-group"))?;
    if merged.is_some() {
        return Ok(merged);
    }

    // Files often lack a MusicBrainz release ID even though their artist's
    // discography has already been cached. Match the exact release title through
    // a shared MusicBrainz artist ID so opening that local album can fetch its
    // remote tracklist. The artist constraint avoids guessing between same-titled
    // releases from unrelated artists.
    connection
        .query_row(
            "SELECT r.id, r.musicbrainz_release_group_id
             FROM albums a
             JOIN album_artists aa ON aa.album_id = a.id
             JOIN artists la ON la.id = aa.artist_id
             JOIN remote_release_artists rra
               ON rra.musicbrainz_artist_id = la.musicbrainz_artist_id
             JOIN remote_releases r ON r.id = rra.remote_release_id
             WHERE a.id = ?1
               AND r.title = a.title COLLATE NOCASE
             ORDER BY r.last_refreshed_at DESC
             LIMIT 1",
            params![album_id],
            |row| {
                Ok(ReleaseSyncRow {
                    id: row.get(0)?,
                    musicbrainz_release_group_id: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(database_error("resolve-album-release-group"))
}

fn record_entity_merge(
    connection: &Connection,
    local_type: &str,
    local_id: &str,
    remote_id: &str,
    reviewed: bool,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT INTO entity_merges (id, local_entity_type, local_id, remote_id, reviewed, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(local_entity_type, local_id, remote_id) DO UPDATE SET
               reviewed = excluded.reviewed,
               updated_at = excluded.updated_at",
            params![
                Uuid::new_v4().to_string(),
                local_type,
                local_id,
                remote_id,
                if reviewed { 1 } else { 0 },
                now
            ],
        )
        .map_err(database_error("record-entity-merge"))?;
    Ok(())
}

fn remove_entity_merge(
    connection: &Connection,
    local_type: &str,
    local_id: &str,
    remote_id: &str,
) -> Result<(), AppError> {
    connection
        .execute(
            "DELETE FROM entity_merges WHERE local_entity_type = ?1 AND local_id = ?2 AND remote_id = ?3",
            params![local_type, local_id, remote_id],
        )
        .map_err(database_error("remove-entity-merge"))?;
    Ok(())
}

fn tracks_for_entity(
    connection: &Connection,
    id_query: &str,
    id: &str,
) -> Result<Vec<TrackSummary>, AppError> {
    let sql = format!(
        "SELECT {TRACK_COLUMNS} FROM tracks WHERE id IN ({id_query})
         ORDER BY COALESCE(disc_number, 0), COALESCE(track_number, 0), title COLLATE NOCASE, id"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(database_error("prepare-entity-tracks"))?;
    let mut tracks = statement
        .query_map([id], track_from_row)
        .map_err(database_error("query-entity-tracks"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-entity-tracks"))?;
    drop(statement);
    for track in &mut tracks {
        hydrate_track(connection, track)?;
    }
    Ok(tracks)
}

fn save_metadata_draft(
    connection: &Connection,
    track_id: &str,
    patch: &MetadataPatch,
    source: &str,
) -> Result<MetadataPatch, AppError> {
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
            [track_id],
            |row| row.get(0),
        )
        .map_err(database_error("find-metadata-track"))?;
    if !exists {
        return Err(AppError::new(
            "track-not-found",
            "The track selected for metadata editing no longer exists.",
        ));
    }
    let before: Option<String> = connection
        .query_row(
            "SELECT patch_json FROM metadata_overrides WHERE track_id = ?1",
            [track_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-previous-metadata-draft"))?;
    let json = serde_json::to_string(patch)
        .map_err(|error| AppError::persistence("serialize-metadata-draft", error.to_string()))?;
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT INTO metadata_overrides (track_id, patch_json, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(track_id) DO UPDATE SET patch_json = excluded.patch_json,
             source = excluded.source, updated_at = excluded.updated_at",
            params![track_id, json, source, now],
        )
        .map_err(database_error("save-metadata-draft"))?;
    connection
        .execute(
            "INSERT INTO metadata_audit (id, track_id, source, before_json, after_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                track_id,
                source,
                before,
                json,
                now
            ],
        )
        .map_err(database_error("audit-metadata-draft"))?;
    Ok(patch.clone())
}

fn get_metadata_draft(
    connection: &Connection,
    track_id: &str,
) -> Result<Option<MetadataPatch>, AppError> {
    let json: Option<String> = connection
        .query_row(
            "SELECT patch_json FROM metadata_overrides WHERE track_id = ?1",
            [track_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-metadata-draft"))?;
    json.map(|json| {
        serde_json::from_str(&json)
            .map_err(|error| AppError::persistence("deserialize-metadata-draft", error.to_string()))
    })
    .transpose()
}

fn resolve_track_id(connection: &Connection, track_id: &str) -> Result<PathBuf, AppError> {
    connection
        .query_row(
            "SELECT tracks.canonical_path FROM tracks
             JOIN library_roots ON library_roots.id = tracks.root_id
             WHERE tracks.id = ?1 AND tracks.available = 1 AND library_roots.enabled = 1",
            [track_id],
            |row| row.get::<_, String>(0).map(PathBuf::from),
        )
        .optional()
        .map_err(database_error("resolve-track-id"))?
        .ok_or_else(|| {
            AppError::new(
                "track-outside-library",
                "The track is not available inside an enabled library root.",
            )
        })
}

fn get_track(connection: &Connection, track_id: &str) -> Result<TrackSummary, AppError> {
    let mut track = connection
        .query_row(
            &format!("SELECT {TRACK_COLUMNS} FROM tracks WHERE id = ?1"),
            [track_id],
            track_from_row,
        )
        .optional()
        .map_err(database_error("read-track"))?
        .ok_or_else(|| AppError::new("track-not-found", "The requested track no longer exists."))?;
    hydrate_track(connection, &mut track)?;
    Ok(track)
}

fn get_embedded_lyrics(
    connection: &Connection,
    track_id: &str,
) -> Result<Option<String>, AppError> {
    connection
        .query_row(
            "SELECT lyrics FROM tracks WHERE id = ?1",
            [track_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-embedded-lyrics"))
        .map(|value: Option<Option<String>>| value.flatten())
}

fn get_lyrics_cache(connection: &Connection, cache_key: &str) -> Result<Option<String>, AppError> {
    connection
        .query_row(
            "SELECT document_json FROM lyrics_cache WHERE cache_key = ?1",
            [cache_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-lyrics-cache"))
}

fn save_lyrics_cache(
    connection: &Connection,
    cache_key: &str,
    document_json: &str,
    source_url: Option<&str>,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT INTO lyrics_cache (cache_key, document_json, source_url, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(cache_key) DO UPDATE SET document_json = excluded.document_json,
             source_url = excluded.source_url, updated_at = excluded.updated_at",
            params![cache_key, document_json, source_url, now],
        )
        .map_err(database_error("save-lyrics-cache"))?;
    Ok(())
}

fn get_enrichment_cache(
    connection: &Connection,
    query_key: &str,
) -> Result<Option<String>, AppError> {
    connection
        .query_row(
            "SELECT result_json FROM enrichment_results
             WHERE provider = 'musicbrainz' AND query_key = ?1 AND status = 'cached'
             ORDER BY updated_at DESC LIMIT 1",
            [query_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-enrichment-cache"))
}

fn save_enrichment_cache(
    connection: &Connection,
    track_id: Option<&str>,
    query_key: &str,
    result_json: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT INTO enrichment_results
             (id, track_id, provider, query_key, result_json, status, created_at, updated_at)
             VALUES (?1, ?2, 'musicbrainz', ?3, ?4, 'cached', ?5, ?5)",
            params![
                Uuid::new_v4().to_string(),
                track_id,
                query_key,
                result_json,
                now
            ],
        )
        .map_err(database_error("save-enrichment-cache"))?;
    Ok(())
}

fn create_metadata_job(
    connection: &mut Connection,
    scope: MetadataJobScope,
    scope_id: Option<&str>,
) -> Result<MetadataJob, AppError> {
    if !matches!(scope, MetadataJobScope::Library) && scope_id.is_none() {
        return Err(AppError::new(
            "metadata-scope-id-required",
            "Track, album, and artist metadata jobs require a scope identifier.",
        ));
    }
    let sql = match scope {
        MetadataJobScope::Track => "SELECT id FROM tracks WHERE id = ?1 AND available = 1",
        MetadataJobScope::Album => {
            "SELECT id FROM tracks WHERE album_id = ?1 AND available = 1 ORDER BY id"
        }
        MetadataJobScope::Artist => {
            "SELECT DISTINCT t.id FROM tracks t JOIN album_artists aa ON aa.album_id = t.album_id WHERE aa.artist_id = ?1 AND t.available = 1 ORDER BY t.id"
        }
        MetadataJobScope::Library => "SELECT id FROM tracks WHERE available = 1 ORDER BY id",
    };
    let mut statement = connection
        .prepare(sql)
        .map_err(database_error("prepare-metadata-job-scope"))?;
    // The library-wide query takes no bind parameter; passing one anyway made every
    // "enrich library" run fail with a parameter-count error.
    let track_ids: Vec<String> = match scope {
        MetadataJobScope::Library => statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(database_error("query-metadata-job-scope"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-metadata-job-scope"))?,
        _ => statement
            .query_map([scope_id], |row| row.get::<_, String>(0))
            .map_err(database_error("query-metadata-job-scope"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-metadata-job-scope"))?,
    };
    drop(statement);
    if track_ids.is_empty() {
        return Err(AppError::new(
            "metadata-scope-empty",
            "No available tracks matched this metadata job scope.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-metadata-job"))?;
    transaction
        .execute(
            "INSERT INTO metadata_jobs
             (id, scope, scope_id, status, total_tracks, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'queued', ?4, ?5, ?5)",
            params![id, scope.as_str(), scope_id, track_ids.len(), now],
        )
        .map_err(database_error("create-metadata-job"))?;
    for track_id in track_ids {
        transaction
            .execute(
                "INSERT INTO metadata_job_tracks (job_id, track_id, status, updated_at)
                 VALUES (?1, ?2, 'pending', ?3)",
                params![id, track_id, now],
            )
            .map_err(database_error("create-metadata-job-track"))?;
    }
    transaction
        .commit()
        .map_err(database_error("commit-metadata-job"))?;
    get_metadata_job(connection, &id)
}

fn get_metadata_job(connection: &Connection, job_id: &str) -> Result<MetadataJob, AppError> {
    connection
        .query_row(
            "SELECT id, scope, scope_id, status, total_tracks, processed_tracks,
                    matched_tracks, auto_written_tracks, review_tracks, failed_tracks,
                    deferred_tracks, current_track_id, last_error_json, created_at, updated_at
             FROM metadata_jobs WHERE id = ?1",
            [job_id],
            metadata_job_from_row,
        )
        .optional()
        .map_err(database_error("read-metadata-job"))?
        .ok_or_else(|| {
            AppError::new(
                "metadata-job-not-found",
                "The metadata job no longer exists.",
            )
        })
}

fn list_metadata_jobs(connection: &Connection) -> Result<Vec<MetadataJob>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT id, scope, scope_id, status, total_tracks, processed_tracks,
                    matched_tracks, auto_written_tracks, review_tracks, failed_tracks,
                    deferred_tracks, current_track_id, last_error_json, created_at, updated_at
             FROM metadata_jobs ORDER BY created_at DESC",
        )
        .map_err(database_error("prepare-metadata-jobs"))?;
    statement
        .query_map([], metadata_job_from_row)
        .map_err(database_error("query-metadata-jobs"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-metadata-jobs"))
}

fn metadata_job_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MetadataJob> {
    Ok(MetadataJob {
        id: row.get(0)?,
        scope: MetadataJobScope::from_database(&row.get::<_, String>(1)?),
        scope_id: row.get(2)?,
        status: MetadataJobStatus::from_database(&row.get::<_, String>(3)?),
        total_tracks: row.get(4)?,
        processed_tracks: row.get(5)?,
        matched_tracks: row.get(6)?,
        auto_written_tracks: row.get(7)?,
        review_tracks: row.get(8)?,
        failed_tracks: row.get(9)?,
        deferred_tracks: row.get(10)?,
        current_track_id: row.get(11)?,
        last_error: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn pending_metadata_job_tracks(
    connection: &Connection,
    job_id: &str,
    retry_errors: bool,
) -> Result<Vec<String>, AppError> {
    let statuses = if retry_errors {
        "('pending', 'deferred', 'error', 'running')"
    } else {
        "('pending', 'deferred', 'running')"
    };
    let mut statement = connection
        .prepare(&format!(
            "SELECT track_id FROM metadata_job_tracks WHERE job_id = ?1 AND status IN {statuses} ORDER BY rowid"
        ))
        .map_err(database_error("prepare-pending-metadata-tracks"))?;
    statement
        .query_map([job_id], |row| row.get::<_, String>(0))
        .map_err(database_error("query-pending-metadata-tracks"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-pending-metadata-tracks"))
}

#[allow(clippy::too_many_arguments)]
fn record_metadata_job_track(
    connection: &mut Connection,
    job_id: &str,
    track_id: &str,
    status: &str,
    source: Option<&str>,
    fingerprint: Option<&str>,
    error_json: Option<&str>,
    candidates_json: Option<&str>,
) -> Result<MetadataJob, AppError> {
    const VALID_STATUSES: &[&str] = &[
        "pending",
        "running",
        "review",
        "written",
        "deferred",
        "complete",
        "error",
        "cancelled",
    ];
    if !VALID_STATUSES.contains(&status) {
        return Err(AppError::new(
            "metadata-track-status-invalid",
            "Invalid metadata track status.",
        ));
    }
    let now = Utc::now().to_rfc3339();
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-record-metadata-track"))?;
    let changed = transaction
        .execute(
            "UPDATE metadata_job_tracks SET status = ?3, source = ?4, fingerprint = COALESCE(?5, fingerprint),
                    error_json = ?6, updated_at = ?7 WHERE job_id = ?1 AND track_id = ?2",
            params![job_id, track_id, status, source, fingerprint, error_json, now],
        )
        .map_err(database_error("record-metadata-track"))?;
    if changed == 0 {
        return Err(AppError::new(
            "metadata-job-track-not-found",
            "The track is not part of this metadata job.",
        ));
    }
    if let Some(json) = candidates_json {
        transaction
            .execute(
                "DELETE FROM metadata_candidates WHERE job_id = ?1 AND track_id = ?2",
                params![job_id, track_id],
            )
            .map_err(database_error("clear-metadata-candidates"))?;
        let candidates: Vec<serde_json::Value> = serde_json::from_str(json).map_err(|error| {
            AppError::persistence("parse-metadata-candidates", error.to_string())
        })?;
        for candidate in candidates {
            let provider = candidate
                .get("source")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown");
            let recording = candidate
                .get("recordingId")
                .and_then(serde_json::Value::as_str);
            let release = candidate
                .get("releaseId")
                .and_then(serde_json::Value::as_str);
            let confidence = candidate
                .get("confidence")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0);
            let review = candidate
                .get("requiresReview")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true);
            transaction
                .execute(
                    "INSERT INTO metadata_candidates
                     (id, job_id, track_id, provider, recording_mbid, release_mbid, confidence,
                      requires_review, candidate_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                    params![
                        Uuid::new_v4().to_string(),
                        job_id,
                        track_id,
                        provider,
                        recording,
                        release,
                        confidence,
                        review,
                        candidate.to_string(),
                        now
                    ],
                )
                .map_err(database_error("save-metadata-candidate"))?;
        }
    }
    refresh_metadata_job_counts(&transaction, job_id, &now)?;
    transaction
        .commit()
        .map_err(database_error("commit-record-metadata-track"))?;
    get_metadata_job(connection, job_id)
}

fn refresh_metadata_job_counts(
    connection: &Connection,
    job_id: &str,
    now: &str,
) -> Result<(), AppError> {
    connection
        .execute(
            "UPDATE metadata_jobs SET
               processed_tracks = (SELECT COUNT(*) FROM metadata_job_tracks WHERE job_id = ?1 AND status IN ('review', 'written', 'complete', 'error', 'cancelled')),
               matched_tracks = (SELECT COUNT(*) FROM metadata_job_tracks WHERE job_id = ?1 AND source IS NOT NULL),
               auto_written_tracks = (SELECT COUNT(*) FROM metadata_job_tracks WHERE job_id = ?1 AND status = 'written'),
               review_tracks = (SELECT COUNT(*) FROM metadata_job_tracks WHERE job_id = ?1 AND status = 'review'),
               failed_tracks = (SELECT COUNT(*) FROM metadata_job_tracks WHERE job_id = ?1 AND status = 'error'),
               deferred_tracks = (SELECT COUNT(*) FROM metadata_job_tracks WHERE job_id = ?1 AND status = 'deferred'),
               updated_at = ?2
             WHERE id = ?1",
            params![job_id, now],
        )
        .map_err(database_error("refresh-metadata-job-counts"))?;
    Ok(())
}

fn set_metadata_job_status(
    connection: &Connection,
    job_id: &str,
    status: MetadataJobStatus,
    current_track_id: Option<&str>,
    last_error: Option<&str>,
) -> Result<MetadataJob, AppError> {
    let changed = connection
        .execute(
            "UPDATE metadata_jobs SET status = ?2, current_track_id = ?3,
                    last_error_json = ?4, updated_at = ?5 WHERE id = ?1",
            params![
                job_id,
                status.as_str(),
                current_track_id,
                last_error,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(database_error("set-metadata-job-status"))?;
    if changed == 0 {
        return Err(AppError::new(
            "metadata-job-not-found",
            "The metadata job no longer exists.",
        ));
    }
    get_metadata_job(connection, job_id)
}

fn save_artwork(connection: &Connection, artwork: &CachedArtwork) -> Result<(), AppError> {
    connection
        .execute(
            "INSERT INTO artwork
             (id, content_hash, cache_path, mime_type, source, source_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(content_hash) DO UPDATE SET cache_path = excluded.cache_path,
             source = excluded.source, source_id = excluded.source_id",
            params![
                artwork.id,
                artwork.content_hash,
                artwork.cache_path,
                artwork.mime_type,
                artwork.source,
                artwork.source_id,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(database_error("save-artwork"))?;
    Ok(())
}

fn cleanup_missing_tracks(connection: &Connection, root_id: Option<&str>) -> Result<u64, AppError> {
    let removed = if let Some(root_id) = root_id {
        connection.execute(
            "DELETE FROM tracks WHERE available = 0 AND root_id = ?1",
            [root_id],
        )
    } else {
        connection.execute("DELETE FROM tracks WHERE available = 0", [])
    }
    .map_err(database_error("cleanup-missing-tracks"))?;
    Ok(removed.try_into().unwrap_or(u64::MAX))
}

fn read_setting<T: serde::de::DeserializeOwned>(
    connection: &Connection,
    key: &str,
) -> Result<Option<T>, AppError> {
    let json: Option<String> = connection
        .query_row(
            "SELECT value_json FROM settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("read-setting"))?;
    json.map(|json| {
        serde_json::from_str(&json)
            .map_err(|error| AppError::persistence("deserialize-setting", error.to_string()))
    })
    .transpose()
}

fn write_setting<T: serde::Serialize>(
    connection: &Connection,
    key: &str,
    value: &T,
) -> Result<(), AppError> {
    let json = serde_json::to_string(value)
        .map_err(|error| AppError::persistence("serialize-setting", error.to_string()))?;
    connection
        .execute(
            "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
             updated_at = excluded.updated_at",
            params![key, json, Utc::now().to_rfc3339()],
        )
        .map_err(database_error("save-setting"))?;
    Ok(())
}

fn load_player_state(connection: &Connection) -> Result<PersistentPlayerState, AppError> {
    let preferences = read_setting(connection, "player.preferences")?.unwrap_or_default();
    let current_track_id =
        read_setting::<Option<String>>(connection, "player.current-track")?.flatten();
    let resume_position_ms = read_setting(connection, "player.resume-position-ms")?.unwrap_or(0);
    let mut statement = connection
        .prepare("SELECT track_id FROM queue_entries ORDER BY position")
        .map_err(database_error("prepare-restored-queue"))?;
    let track_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(database_error("query-restored-queue"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-restored-queue"))?;
    Ok(PersistentPlayerState {
        queue: hydrate_track_ids(connection, track_ids)?,
        current_track_id,
        resume_position_ms,
        preferences,
    })
}

fn save_queue(connection: &mut Connection, track_ids: &[String]) -> Result<(), AppError> {
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-save-queue"))?;
    transaction
        .execute("DELETE FROM queue_entries", [])
        .map_err(database_error("clear-saved-queue"))?;
    let now = Utc::now().to_rfc3339();
    for (position, track_id) in track_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO queue_entries (position, track_id, created_at)
                 SELECT ?1, id, ?3 FROM tracks WHERE id = ?2 AND available = 1",
                params![position, track_id, now],
            )
            .map_err(database_error("insert-saved-queue-track"))?;
    }
    transaction
        .commit()
        .map_err(database_error("commit-save-queue"))
}

fn save_preferences(
    connection: &Connection,
    mut preferences: PlayerPreferences,
) -> Result<PlayerPreferences, AppError> {
    preferences.volume = if preferences.volume.is_finite() {
        preferences.volume.clamp(0.0, 1.0)
    } else {
        1.0
    };
    if preferences.hifi_mode {
        preferences.volume = 1.0;
    }
    write_setting(connection, "player.preferences", &preferences)?;
    Ok(preferences)
}

fn save_playback_checkpoint(
    connection: &Connection,
    track_id: Option<&str>,
    position_ms: u64,
) -> Result<(), AppError> {
    write_setting(connection, "player.current-track", &track_id)?;
    write_setting(connection, "player.resume-position-ms", &position_ms)
}

fn set_favorite(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    favorite: bool,
) -> Result<bool, AppError> {
    if !matches!(entity_type, "track" | "album" | "artist") {
        return Err(AppError::new(
            "favorite-entity-invalid",
            "Favorites support tracks, albums, and artists.",
        ));
    }
    if favorite {
        connection
            .execute(
                "INSERT OR IGNORE INTO favorites (entity_type, entity_id, created_at)
                 VALUES (?1, ?2, ?3)",
                params![entity_type, entity_id, Utc::now().to_rfc3339()],
            )
            .map_err(database_error("add-favorite"))?;
    } else {
        connection
            .execute(
                "DELETE FROM favorites WHERE entity_type = ?1 AND entity_id = ?2",
                params![entity_type, entity_id],
            )
            .map_err(database_error("remove-favorite"))?;
    }
    Ok(favorite)
}

fn list_favorites(connection: &Connection) -> Result<Vec<FavoriteReference>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT entity_type, entity_id FROM favorites
             ORDER BY created_at DESC, entity_type, entity_id",
        )
        .map_err(database_error("prepare-favorites"))?;
    statement
        .query_map([], |row| {
            Ok(FavoriteReference {
                entity_type: row.get(0)?,
                entity_id: row.get(1)?,
            })
        })
        .map_err(database_error("query-favorites"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-favorites"))
}

fn create_playlist(connection: &Connection, name: &str) -> Result<PlaylistSummary, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new(
            "playlist-name-empty",
            "A playlist name is required.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params![id, name, now],
        )
        .map_err(database_error("create-playlist"))?;
    playlist_summary(connection, &id)
}

fn list_playlists(connection: &Connection) -> Result<Vec<PlaylistSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT p.id, p.name,
                    (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id),
                    (SELECT COALESCE(SUM(t.duration_ms), 0) FROM playlist_tracks pt
                     JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = p.id),
                    p.generated,
                    (SELECT GROUP_CONCAT(cache_path, char(31)) FROM (
                       SELECT DISTINCT ar.cache_path AS cache_path FROM playlist_tracks covers
                       JOIN tracks ct ON ct.id = covers.track_id JOIN artwork ar ON ar.id = ct.artwork_id
                       WHERE covers.playlist_id = p.id AND ar.cache_path IS NOT NULL
                       ORDER BY covers.position LIMIT 4
                    ))
             FROM playlists p ORDER BY p.name COLLATE NOCASE, p.id",
        )
        .map_err(database_error("prepare-playlists"))?;
    statement
        .query_map([], playlist_summary_from_row)
        .map_err(database_error("query-playlists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-playlists"))
}

fn playlist_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PlaylistSummary> {
    Ok(PlaylistSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        track_count: row.get(2)?,
        total_duration_ms: row.get(3)?,
        generated: row.get(4)?,
        cover_artwork_paths: split_group(row.get(5)?),
    })
}

fn playlist_summary(
    connection: &Connection,
    playlist_id: &str,
) -> Result<PlaylistSummary, AppError> {
    connection
        .query_row(
            "SELECT p.id, p.name,
                    (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id),
                    (SELECT COALESCE(SUM(t.duration_ms), 0) FROM playlist_tracks pt
                     JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = p.id),
                    p.generated,
                    (SELECT GROUP_CONCAT(cache_path, char(31)) FROM (
                       SELECT DISTINCT ar.cache_path AS cache_path FROM playlist_tracks covers
                       JOIN tracks ct ON ct.id = covers.track_id JOIN artwork ar ON ar.id = ct.artwork_id
                       WHERE covers.playlist_id = p.id AND ar.cache_path IS NOT NULL
                       ORDER BY covers.position LIMIT 4
                    ))
             FROM playlists p WHERE p.id = ?1",
            [playlist_id],
            playlist_summary_from_row,
        )
        .optional()
        .map_err(database_error("read-playlist-summary"))?
        .ok_or_else(|| AppError::new("playlist-not-found", "The requested playlist no longer exists."))
}

fn get_playlist(connection: &Connection, playlist_id: &str) -> Result<Playlist, AppError> {
    let (id, name, description, generated, request_json, created_at, updated_at) = connection
        .query_row(
            "SELECT id, name, description, generated, generation_request_json, created_at, updated_at
             FROM playlists WHERE id = ?1",
            [playlist_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(database_error("read-playlist"))?
        .ok_or_else(|| AppError::new("playlist-not-found", "The requested playlist no longer exists."))?;
    let tracks = get_playlist_tracks(connection, playlist_id)?;
    let total_duration_ms = tracks.iter().filter_map(|track| track.duration_ms).sum();
    let generation_request = request_json
        .as_deref()
        .map(serde_json::from_str::<PlaylistGenerationRequest>)
        .transpose()
        .map_err(|error| {
            AppError::persistence("decode-playlist-generation-request", error.to_string())
        })?;
    Ok(Playlist {
        id,
        name,
        description,
        tracks,
        total_duration_ms,
        generated,
        generation_request,
        created_at,
        updated_at,
    })
}

fn validate_playlist_name(name: &str) -> Result<&str, AppError> {
    let name = name.trim();
    if name.is_empty() {
        Err(AppError::new(
            "playlist-name-empty",
            "A playlist name is required.",
        ))
    } else {
        Ok(name)
    }
}

fn rename_playlist(
    connection: &Connection,
    playlist_id: &str,
    name: &str,
) -> Result<PlaylistSummary, AppError> {
    let name = validate_playlist_name(name)?;
    let changed = connection
        .execute(
            "UPDATE playlists SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![playlist_id, name, Utc::now().to_rfc3339()],
        )
        .map_err(database_error("rename-playlist"))?;
    if changed == 0 {
        return Err(AppError::new(
            "playlist-not-found",
            "The requested playlist no longer exists.",
        ));
    }
    playlist_summary(connection, playlist_id)
}

fn delete_playlist(connection: &Connection, playlist_id: &str) -> Result<(), AppError> {
    let changed = connection
        .execute("DELETE FROM playlists WHERE id = ?1", [playlist_id])
        .map_err(database_error("delete-playlist"))?;
    if changed == 0 {
        return Err(AppError::new(
            "playlist-not-found",
            "The requested playlist no longer exists.",
        ));
    }
    Ok(())
}

fn duplicate_playlist(
    connection: &mut Connection,
    playlist_id: &str,
    name: &str,
) -> Result<PlaylistSummary, AppError> {
    let name = validate_playlist_name(name)?;
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-duplicate-playlist"))?;
    let source_exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM playlists WHERE id = ?1)",
            [playlist_id],
            |row| row.get(0),
        )
        .map_err(database_error("find-duplicate-playlist-source"))?;
    if !source_exists {
        return Err(AppError::new(
            "playlist-not-found",
            "The requested playlist no longer exists.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO playlists (id, name, description, generated, generation_request_json, created_at, updated_at)
             SELECT ?2, ?3, description, generated, generation_request_json, ?4, ?4 FROM playlists WHERE id = ?1",
            params![playlist_id, id, name, now],
        )
        .map_err(database_error("duplicate-playlist"))?;
    transaction
        .execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
             SELECT ?2, track_id, position, ?3 FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position",
            params![playlist_id, id, now],
        )
        .map_err(database_error("duplicate-playlist-tracks"))?;
    transaction
        .commit()
        .map_err(database_error("commit-duplicate-playlist"))?;
    playlist_summary(connection, &id)
}

fn get_playlist_tracks(
    connection: &Connection,
    playlist_id: &str,
) -> Result<Vec<TrackSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT pt.track_id FROM playlist_tracks pt
             JOIN tracks t ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1 AND t.available = 1
             ORDER BY pt.position",
        )
        .map_err(database_error("prepare-playlist-tracks"))?;
    let ids = statement
        .query_map([playlist_id], |row| row.get::<_, String>(0))
        .map_err(database_error("query-playlist-tracks"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-playlist-tracks"))?;
    hydrate_track_ids(connection, ids)
}

fn set_playlist_tracks(
    connection: &mut Connection,
    playlist_id: &str,
    track_ids: &[String],
) -> Result<(), AppError> {
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-save-playlist"))?;
    transaction
        .execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            [playlist_id],
        )
        .map_err(database_error("clear-playlist-tracks"))?;
    let now = Utc::now().to_rfc3339();
    for (position, track_id) in track_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![playlist_id, track_id, position, now],
            )
            .map_err(database_error("save-playlist-track"))?;
    }
    transaction
        .execute(
            "UPDATE playlists SET updated_at = ?2 WHERE id = ?1",
            params![playlist_id, now],
        )
        .map_err(database_error("touch-playlist"))?;
    transaction
        .commit()
        .map_err(database_error("commit-save-playlist"))
}

fn save_generated_playlist(
    connection: &mut Connection,
    name: &str,
    request_json: &str,
    track_ids: &[String],
) -> Result<PlaylistSummary, AppError> {
    let name = validate_playlist_name(name)?;
    serde_json::from_str::<PlaylistGenerationRequest>(request_json).map_err(|error| {
        AppError::new(
            "playlist-request-invalid",
            "The Song DNA request was invalid.",
        )
        .with_context("reason", error)
    })?;
    let transaction = connection
        .transaction()
        .map_err(database_error("begin-generated-playlist"))?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO playlists (id, name, generated, generation_request_json, created_at, updated_at)
             VALUES (?1, ?2, 1, ?3, ?4, ?4)",
            params![id, name, request_json, now],
        )
        .map_err(database_error("create-generated-playlist"))?;
    for (position, track_id) in track_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?1, ?2, ?3, ?4)",
                params![id, track_id, position, now],
            )
            .map_err(database_error("save-generated-playlist-track"))?;
    }
    transaction
        .commit()
        .map_err(database_error("commit-generated-playlist"))?;
    playlist_summary(connection, &id)
}

fn get_audio_features(
    connection: &Connection,
    track_id: &str,
) -> Result<Option<AudioFeatures>, AppError> {
    connection
        .query_row(
            "SELECT track_id, analysis_version, bpm, musical_key, loudness_db, energy,
                    spectral_centroid_hz, spectral_rolloff_hz, dynamic_range_db, analyzed_at
             FROM audio_features WHERE track_id = ?1 AND analysis_version = ?2",
            params![track_id, AUDIO_FEATURE_VERSION],
            audio_features_from_row,
        )
        .optional()
        .map_err(database_error("read-audio-features"))
}

fn audio_features_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AudioFeatures> {
    Ok(AudioFeatures {
        track_id: row.get(0)?,
        analysis_version: row.get(1)?,
        bpm: row.get(2)?,
        musical_key: row.get(3)?,
        loudness_db: row.get(4)?,
        energy: row.get(5)?,
        spectral_centroid_hz: row.get(6)?,
        spectral_rolloff_hz: row.get(7)?,
        dynamic_range_db: row.get(8)?,
        analyzed_at: row.get(9)?,
    })
}

fn save_audio_features(connection: &Connection, features: &AudioFeatures) -> Result<(), AppError> {
    connection
        .execute(
            "INSERT INTO audio_features
             (track_id, analysis_version, bpm, musical_key, loudness_db, energy, spectral_centroid_hz,
              spectral_rolloff_hz, dynamic_range_db, analyzed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(track_id, analysis_version) DO UPDATE SET
               bpm = excluded.bpm, musical_key = excluded.musical_key,
               loudness_db = excluded.loudness_db, energy = excluded.energy,
               spectral_centroid_hz = excluded.spectral_centroid_hz,
               spectral_rolloff_hz = excluded.spectral_rolloff_hz,
               dynamic_range_db = excluded.dynamic_range_db, analyzed_at = excluded.analyzed_at",
            params![
                features.track_id,
                features.analysis_version,
                features.bpm,
                features.musical_key,
                features.loudness_db,
                features.energy,
                features.spectral_centroid_hz,
                features.spectral_rolloff_hz,
                features.dynamic_range_db,
                features.analyzed_at,
            ],
        )
        .map_err(database_error("save-audio-features"))?;
    Ok(())
}

fn split_group(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split('\u{1f}')
        .filter(|part| !part.is_empty())
        .map(str::to_owned)
        .collect()
}

fn list_generation_candidates(
    connection: &Connection,
) -> Result<Vec<GenerationCandidate>, AppError> {
    let _span = crate::metrics::Span::new("sqlite.list_generation_candidates");
    let mut statement = connection
        .prepare(
            "WITH listening AS (
               SELECT track_id, SUM(completed) AS play_count, SUM(skipped) AS skip_count,
                      unixepoch(MAX(started_at)) AS last_played
               FROM listening_sessions GROUP BY track_id
             )
             SELECT t.id, t.title, t.album_id, COALESCE(al.title, 'Unknown Album'), t.year,
                    COALESCE(t.duration_ms, 0), COALESCE(ls.play_count, 0), COALESCE(ls.skip_count, 0),
                    EXISTS(SELECT 1 FROM favorites f WHERE f.entity_type = 'track' AND f.entity_id = t.id),
                    ls.last_played,
                    (SELECT GROUP_CONCAT(a.id, char(31)) FROM track_artists ta JOIN artists a ON a.id = ta.artist_id WHERE ta.track_id = t.id AND ta.role = 'artist' ORDER BY ta.position),
                    (SELECT GROUP_CONCAT(a.name, char(31)) FROM track_artists ta JOIN artists a ON a.id = ta.artist_id WHERE ta.track_id = t.id AND ta.role = 'artist' ORDER BY ta.position),
                    (SELECT GROUP_CONCAT(g.name, char(31)) FROM track_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.track_id = t.id ORDER BY g.name COLLATE NOCASE),
                    af.track_id, af.analysis_version, af.bpm, af.musical_key, af.loudness_db, af.energy,
                    af.spectral_centroid_hz, af.spectral_rolloff_hz, af.dynamic_range_db, af.analyzed_at
             FROM tracks t
             LEFT JOIN albums al ON al.id = t.album_id
             LEFT JOIN listening ls ON ls.track_id = t.id
             LEFT JOIN audio_features af ON af.track_id = t.id AND af.analysis_version = ?1
             WHERE t.available = 1 ORDER BY t.id",
        )
        .map_err(database_error("prepare-generation-candidates"))?;
    statement
        .query_map([AUDIO_FEATURE_VERSION], |row| {
            let features = row
                .get::<_, Option<String>>(13)?
                .map(|track_id| AudioFeatures {
                    track_id,
                    analysis_version: row.get(14).unwrap_or(AUDIO_FEATURE_VERSION),
                    bpm: row.get(15).unwrap_or(None),
                    musical_key: row.get(16).unwrap_or(None),
                    loudness_db: row.get(17).unwrap_or(-60.0),
                    energy: row.get(18).unwrap_or(0.0),
                    spectral_centroid_hz: row.get(19).unwrap_or(0.0),
                    spectral_rolloff_hz: row.get(20).unwrap_or(0.0),
                    dynamic_range_db: row.get(21).unwrap_or(0.0),
                    analyzed_at: row.get(22).unwrap_or_default(),
                });
            Ok(GenerationCandidate {
                id: row.get(0)?,
                title: row.get(1)?,
                album_id: row.get(2)?,
                album: row.get(3)?,
                year: row.get(4)?,
                duration_ms: row.get(5)?,
                play_count: row.get(6)?,
                skip_count: row.get(7)?,
                favorite: row.get(8)?,
                last_played_at: row.get(9)?,
                artist_ids: split_group(row.get(10)?),
                artist_names: split_group(row.get(11)?),
                genres: split_group(row.get(12)?),
                features,
            })
        })
        .map_err(database_error("query-generation-candidates"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-generation-candidates"))
}

fn start_listening_session(
    connection: &Connection,
    id: &str,
    track_id: &str,
) -> Result<(), AppError> {
    connection
        .execute(
            "INSERT INTO listening_sessions
             (id, track_id, started_at, played_ms, completed, skipped)
             VALUES (?1, ?2, ?3, 0, 0, 0)",
            params![id, track_id, Utc::now().to_rfc3339()],
        )
        .map_err(database_error("start-listening-session"))?;
    Ok(())
}

fn update_listening_session(
    connection: &Connection,
    id: &str,
    played_ms: u64,
    completed: bool,
    skipped: bool,
    ended: bool,
) -> Result<(), AppError> {
    connection
        .execute(
            "UPDATE listening_sessions SET played_ms = ?2, completed = ?3, skipped = ?4,
             ended_at = CASE WHEN ?5 THEN ?6 ELSE ended_at END WHERE id = ?1",
            params![
                id,
                played_ms,
                completed,
                skipped,
                ended,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(database_error("update-listening-session"))?;
    Ok(())
}

fn get_home_snapshot(connection: &Connection) -> Result<HomeSnapshot, AppError> {
    let (total_tracks, total_duration_ms, total_file_size): (u64, u64, u64) = connection
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(duration_ms), 0), COALESCE(SUM(file_size), 0)
             FROM tracks WHERE available = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(database_error("home-library-totals"))?;
    let total_artists = connection
        .query_row(
            "SELECT COUNT(DISTINCT aa.artist_id) FROM album_artists aa
             JOIN tracks t ON t.album_id = aa.album_id AND t.available = 1",
            [],
            |row| row.get(0),
        )
        .map_err(database_error("home-artist-total"))?;
    let total_albums = connection
        .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
        .map_err(database_error("home-album-total"))?;
    let total_listened_ms = connection
        .query_row(
            "SELECT COALESCE(SUM(played_ms), 0) FROM listening_sessions",
            [],
            |row| row.get(0),
        )
        .map_err(database_error("home-listened-total"))?;
    let top_artist = connection
        .query_row(
            "SELECT a.name FROM listening_sessions ls
             JOIN track_artists ta ON ta.track_id = ls.track_id AND ta.role = 'artist'
             JOIN artists a ON a.id = ta.artist_id
             GROUP BY a.id ORDER BY SUM(ls.played_ms) DESC, a.name COLLATE NOCASE LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("home-top-artist"))?;
    let top_genre = connection
        .query_row(
            "SELECT g.name FROM listening_sessions ls
             JOIN track_genres tg ON tg.track_id = ls.track_id
             JOIN genres g ON g.id = tg.genre_id
             GROUP BY g.id ORDER BY SUM(ls.played_ms) DESC, g.name COLLATE NOCASE LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("home-top-genre"))?;
    let favorite_era = connection
        .query_row(
            "SELECT (t.year / 10) * 10 FROM listening_sessions ls
             JOIN tracks t ON t.id = ls.track_id WHERE t.year IS NOT NULL
             GROUP BY (t.year / 10) ORDER BY SUM(ls.played_ms) DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error("home-favorite-era"))?;
    let continue_listening = tracks_from_id_query(
        connection,
        "SELECT track_id FROM listening_sessions WHERE completed = 0 AND played_ms > 0
         GROUP BY track_id ORDER BY MAX(started_at) DESC LIMIT 12",
    )?;
    let recently_added = tracks_from_id_query(
        connection,
        "SELECT id FROM tracks WHERE available = 1 ORDER BY added_at DESC, id LIMIT 12",
    )?;
    let rediscover = tracks_from_id_query(
        connection,
        "SELECT t.id FROM tracks t LEFT JOIN listening_sessions ls ON ls.track_id = t.id
         WHERE t.available = 1 GROUP BY t.id
         ORDER BY COALESCE(MAX(ls.started_at), '0000') ASC, t.added_at ASC LIMIT 12",
    )?;
    Ok(HomeSnapshot {
        total_tracks,
        total_artists,
        total_albums,
        total_duration_ms,
        total_file_size,
        total_listened_ms,
        top_artist,
        top_genre,
        favorite_era,
        continue_listening,
        recently_added,
        rediscover,
    })
}

fn tracks_from_id_query(connection: &Connection, sql: &str) -> Result<Vec<TrackSummary>, AppError> {
    let mut statement = connection
        .prepare(sql)
        .map_err(database_error("prepare-home-tracks"))?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(database_error("query-home-tracks"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-home-track-ids"))?;
    hydrate_track_ids(connection, ids)
}

fn hydrate_track_ids(
    connection: &Connection,
    ids: Vec<String>,
) -> Result<Vec<TrackSummary>, AppError> {
    ids.into_iter()
        .filter_map(|id| match get_track(connection, &id) {
            Ok(track) if track.available => Some(Ok(track)),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect()
}

fn enqueue_integration_job(
    connection: &Connection,
    id: &str,
    integration: &str,
    kind: &str,
    payload_json: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT OR IGNORE INTO integration_jobs
             (id, integration, kind, payload_json, status, attempts, available_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'queued', 0, ?5, ?5, ?5)",
            params![id, integration, kind, payload_json, now],
        )
        .map_err(database_error("enqueue-integration-job"))?;
    Ok(())
}

fn pending_integration_jobs(
    connection: &Connection,
    integration: &str,
    limit: u32,
) -> Result<Vec<IntegrationJob>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT id, payload_json, attempts FROM integration_jobs
             WHERE integration = ?1 AND status IN ('queued', 'error') AND available_at <= ?2
             ORDER BY created_at, id LIMIT ?3",
        )
        .map_err(database_error("prepare-integration-jobs"))?;
    statement
        .query_map(
            params![integration, Utc::now().to_rfc3339(), limit],
            |row| {
                Ok(IntegrationJob {
                    id: row.get(0)?,
                    payload_json: row.get(1)?,
                    attempts: row.get(2)?,
                })
            },
        )
        .map_err(database_error("query-integration-jobs"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-integration-jobs"))
}

fn complete_integration_job(connection: &Connection, id: &str) -> Result<(), AppError> {
    connection
        .execute(
            "UPDATE integration_jobs SET status = 'complete', last_error_json = NULL,
             updated_at = ?2 WHERE id = ?1",
            params![id, Utc::now().to_rfc3339()],
        )
        .map_err(database_error("complete-integration-job"))?;
    Ok(())
}

fn fail_integration_job(
    connection: &Connection,
    id: &str,
    attempts: u32,
    error: &AppError,
    retry: bool,
) -> Result<(), AppError> {
    let next_attempt = attempts.saturating_add(1);
    let delay_seconds = 30_i64.saturating_mul(2_i64.pow(next_attempt.min(10)));
    let available_at = (Utc::now() + chrono::Duration::seconds(delay_seconds)).to_rfc3339();
    connection
        .execute(
            "UPDATE integration_jobs SET status = ?2, attempts = ?3, available_at = ?4,
             last_error_json = ?5, updated_at = ?6 WHERE id = ?1",
            params![
                id,
                if retry { "error" } else { "failed" },
                next_attempt,
                available_at,
                serde_json::to_string(error).unwrap_or_else(|_| "{}".into()),
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(database_error("fail-integration-job"))?;
    Ok(())
}

fn resolve_track(
    connection: &Connection,
    canonical_path: &str,
) -> Result<(String, PathBuf), AppError> {
    connection
        .query_row(
            "SELECT tracks.id, tracks.canonical_path FROM tracks
             JOIN library_roots ON library_roots.id = tracks.root_id
             WHERE tracks.canonical_path = ?1 AND tracks.available = 1 AND library_roots.enabled = 1",
            [canonical_path],
            |row| Ok((row.get(0)?, PathBuf::from(row.get::<_, String>(1)?))),
        )
        .optional()
        .map_err(database_error("resolve-catalog-track"))?
        .ok_or_else(|| AppError::new("track-outside-library", "The requested track is not available inside an enabled library root."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("bebop-database-{name}-{unique}"));
        fs::create_dir_all(&path).expect("create temporary directory");
        path
    }

    #[test]
    fn migrations_create_the_complete_v2_schema() {
        let worker = DatabaseWorker::in_memory().expect("database starts");
        let roots = worker.list_roots().expect("roots query");
        assert!(roots.is_empty());
    }

    #[test]
    fn song_dna_and_playlist_snapshots_round_trip() {
        let mut connection =
            open_connection(Connection::open_in_memory()).expect("open song dna database");
        connection
            .execute(
                "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at)
                 VALUES ('root', '/music', 'Music', 'now', 'now')",
                [],
            )
            .expect("insert root");
        connection
            .execute(
                "INSERT INTO tracks
                 (id, root_id, canonical_path, relative_path, title, extension, file_size, available, added_at, updated_at)
                 VALUES ('track', 'root', '/music/track.wav', 'track.wav', 'Track', 'wav', 1, 1, 'now', 'now')",
                [],
            )
            .expect("insert track");
        let features = AudioFeatures {
            track_id: "track".into(),
            analysis_version: AUDIO_FEATURE_VERSION,
            bpm: Some(120.0),
            musical_key: Some("C major".into()),
            loudness_db: -12.0,
            energy: 0.6,
            spectral_centroid_hz: 2_000.0,
            spectral_rolloff_hz: 5_000.0,
            dynamic_range_db: 9.0,
            analyzed_at: "now".into(),
        };
        save_audio_features(&connection, &features).expect("save features");
        assert_eq!(
            get_audio_features(&connection, "track")
                .expect("load features")
                .expect("features exist")
                .analysis_version,
            AUDIO_FEATURE_VERSION
        );

        let playlist = create_playlist(&connection, "Snapshot").expect("create playlist");
        set_playlist_tracks(&mut connection, &playlist.id, &["track".into()])
            .expect("add playlist track");
        let duplicate = duplicate_playlist(&mut connection, &playlist.id, "Snapshot copy")
            .expect("duplicate playlist");
        assert_eq!(duplicate.track_count, 1);
        assert_eq!(
            get_playlist(&connection, &duplicate.id)
                .expect("playlist detail")
                .tracks
                .len(),
            1
        );
        let renamed =
            rename_playlist(&connection, &duplicate.id, "Renamed").expect("rename playlist");
        assert_eq!(renamed.name, "Renamed");
        delete_playlist(&connection, &duplicate.id).expect("delete playlist");
        assert!(get_playlist(&connection, &duplicate.id).is_err());
    }

    #[test]
    fn artist_pages_use_album_artists_and_keyset_cursors() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");
        connection.execute(
            "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at) VALUES ('root', '/music', 'Music', 'now', 'now')",
            [],
        ).expect("root");
        for (id, name) in [
            ("album-artist", "Album Artist"),
            ("featured", "Featured Guest"),
            ("z", "Zebra"),
        ] {
            connection.execute(
                "INSERT INTO artists (id, name, created_at, updated_at) VALUES (?1, ?2, 'now', 'now')",
                params![id, name],
            ).expect("artist");
        }
        for (id, title, artist) in [
            ("album-a", "Alpha", "album-artist"),
            ("album-z", "Zulu", "z"),
        ] {
            connection.execute(
                "INSERT INTO albums (id, title, created_at, updated_at) VALUES (?1, ?2, 'now', 'now')",
                params![id, title],
            ).expect("album");
            connection
                .execute(
                    "INSERT INTO album_artists (album_id, artist_id, position) VALUES (?1, ?2, 0)",
                    params![id, artist],
                )
                .expect("album artist");
        }
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, extension, file_size, available, added_at, updated_at) VALUES ('track-a', 'root', '/music/a.flac', 'a.flac', 'A', 'flac', 1, 1, 'now', 'now')",
            [],
        ).expect("track");
        connection.execute(
            "INSERT INTO track_artists (track_id, artist_id, role, position) VALUES ('track-a', 'featured', 'artist', 0)",
            [],
        ).expect("featured track artist");

        let first = query_artists_page(
            &connection,
            ArtistCatalogQuery {
                search: None,
                cursor: None,
                page_size: 1,
                available: Some(true),
            },
        )
        .expect("first page");
        assert_eq!(first.items[0].name, "Album Artist");
        assert_ne!(first.items[0].name, "Featured Guest");
        let second = query_artists_page(
            &connection,
            ArtistCatalogQuery {
                search: None,
                cursor: first.next_cursor,
                page_size: 1,
                available: Some(true),
            },
        )
        .expect("second page");
        assert_eq!(second.items[0].name, "Zebra");
    }

    #[test]
    fn integration_outbox_is_persistent_and_idempotent() {
        let worker = DatabaseWorker::in_memory().expect("database starts");
        worker
            .enqueue_integration_job(
                "session-1".into(),
                "lastfm".into(),
                "scrobble".into(),
                "{\"track_id\":\"track-1\"}".into(),
            )
            .expect("enqueue scrobble");
        worker
            .enqueue_integration_job(
                "session-1".into(),
                "lastfm".into(),
                "scrobble".into(),
                "{\"track_id\":\"track-1\"}".into(),
            )
            .expect("duplicate is ignored");
        let pending = worker
            .pending_integration_jobs("lastfm".into(), 50)
            .expect("pending jobs");
        assert_eq!(pending.len(), 1);
        worker
            .complete_integration_job("session-1".into())
            .expect("complete job");
        worker
            .enqueue_integration_job(
                "session-1".into(),
                "lastfm".into(),
                "scrobble".into(),
                "{\"track_id\":\"track-1\"}".into(),
            )
            .expect("completed duplicate remains ignored");
        assert!(
            worker
                .pending_integration_jobs("lastfm".into(), 50)
                .expect("no pending jobs")
                .is_empty()
        );
    }

    #[test]
    fn every_historical_schema_version_upgrades_to_the_complete_current_schema() {
        for starting_version in 0..=SCHEMA_VERSION {
            let mut connection = Connection::open_in_memory().expect("open historical database");
            connection
                .execute_batch("PRAGMA foreign_keys = ON")
                .expect("configure historical database");
            for (version, sql) in MIGRATIONS
                .iter()
                .filter(|(version, _)| *version <= starting_version)
            {
                connection
                    .execute_batch(sql)
                    .unwrap_or_else(|error| panic!("install migration {version}: {error}"));
                connection
                    .pragma_update(None, "user_version", version)
                    .expect("record historical version");
            }

            migrate(&mut connection).expect("upgrade historical schema");
            let version: i64 = connection
                .pragma_query_value(None, "user_version", |row| row.get(0))
                .expect("read upgraded version");
            assert_eq!(version, SCHEMA_VERSION, "upgrade from v{starting_version}");
            for table in [
                "library_roots",
                "tracks",
                "metadata_overrides",
                "listening_sessions",
                "integration_jobs",
                "remote_artists",
                "remote_releases",
                "remote_release_artists",
                "entity_merges",
                "remote_tracks",
            ] {
                let exists: bool = connection
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                        [table],
                        |row| row.get(0),
                    )
                    .expect("inspect upgraded schema");
                assert!(
                    exists,
                    "{table} missing after upgrade from v{starting_version}"
                );
            }
            for obsolete_table in ["acquisition_jobs", "acquisition_settings"] {
                let exists: bool = connection
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                        [obsolete_table],
                        |row| row.get(0),
                    )
                    .expect("inspect obsolete schema table");
                assert!(
                    !exists,
                    "{obsolete_table} should be dropped after upgrade to v{SCHEMA_VERSION}"
                );
            }
            let violations: i64 = connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })
                .expect("check upgraded foreign keys");
            assert_eq!(
                violations, 0,
                "foreign-key violations from v{starting_version}"
            );
        }
    }

    #[test]
    fn provenance_cleanup_drops_non_musicbrainz_rows_and_keeps_local_data() {
        let connection = Connection::open_in_memory().expect("open catalog");
        // Migrate to the schema just before the cleanup so the bad rows can be seeded.
        connection
            .execute_batch("PRAGMA journal_mode = WAL;")
            .expect("pragma");
        for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version < 13) {
            connection.execute_batch(sql).expect("migrate");
            let _ = version;
        }

        connection.execute(
            "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at) VALUES ('root-1', '/music', 'Music', 'now', 'now')",
            [],
        ).expect("root");
        connection.execute(
            "INSERT INTO artists (id, name, created_at, updated_at, discography_checked_at) VALUES ('artist-1', 'The Seatbelts', 'now', 'now', 'now')",
            [],
        ).expect("artist");
        connection.execute(
            "INSERT INTO albums (id, title, created_at, updated_at) VALUES ('album-1', 'Cowboy Bebop', 'now', 'now')",
            [],
        ).expect("album");
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, extension, file_size, available, added_at, updated_at) VALUES ('track-1', 'root-1', '/music/tank.flac', 'tank.flac', 'Tank!', 'album-1', 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track");

        // One fabricated artist id and one Deezer-sourced release, plus clean rows.
        for (id, mbid) in [
            ("remote-artist-fake", "artist-The Neighbourhood"),
            ("remote-artist-real", "mb-artist-real"),
        ] {
            connection.execute(
                "INSERT INTO remote_artists (id, musicbrainz_artist_id, name, last_refreshed_at, created_at, updated_at) VALUES (?1, ?2, 'Name', 'now', 'now', 'now')",
                params![id, mbid],
            ).expect("remote artist");
        }
        for (id, rgid) in [("remote:deezer-1", "deezer-1"), ("remote:rg-1", "rg-1")] {
            connection.execute(
                "INSERT INTO remote_releases (id, musicbrainz_release_group_id, title, last_refreshed_at, created_at, updated_at) VALUES (?1, ?2, 'Title', 'now', 'now', 'now')",
                params![id, rgid],
            ).expect("remote release");
            connection.execute(
                "INSERT INTO remote_tracks (id, release_id, track_number, disc_number, title, last_updated_at) VALUES (?1, ?2, 1, 1, 'Track', 'now')",
                params![format!("rtrack-{id}"), id],
            ).expect("remote track");
            connection.execute(
                "INSERT INTO remote_release_artists (remote_release_id, artist_name, position) VALUES (?1, 'Name', 0)",
                params![id],
            ).expect("remote release artist");
            connection.execute(
                "INSERT INTO entity_merges (id, local_entity_type, local_id, remote_id, created_at, updated_at) VALUES (?1, 'album', 'album-1', ?2, 'now', 'now')",
                params![format!("merge-{id}"), id],
            ).expect("merge");
        }

        connection
            .execute_batch(MIGRATIONS[12].1)
            .expect("cleanup migration");

        let count = |sql: &str| -> i64 {
            connection
                .query_row(sql, [], |row| row.get(0))
                .expect("count")
        };

        // Fabricated and Deezer-sourced rows are gone, MusicBrainz rows survive.
        assert_eq!(
            count(
                "SELECT COUNT(*) FROM remote_artists WHERE musicbrainz_artist_id LIKE 'artist-%'"
            ),
            0,
            "fabricated artist ids are removed"
        );
        assert_eq!(count("SELECT COUNT(*) FROM remote_artists"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM remote_releases"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM remote_tracks"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM remote_release_artists"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM entity_merges"), 1);

        // Local catalog is untouched and every artist is re-queued for a sync.
        assert_eq!(count("SELECT COUNT(*) FROM tracks"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM albums"), 1);
        assert_eq!(count("SELECT COUNT(*) FROM artists"), 1);
        assert_eq!(
            count("SELECT COUNT(*) FROM artists WHERE discography_checked_at IS NULL"),
            1,
            "artists are re-queued so the cleared cache is rebuilt"
        );
    }

    #[test]
    fn discography_sync_covers_every_artist_and_skips_recently_checked_ones() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");

        for (id, name) in [
            ("artist-1", "The Seatbelts"),
            ("artist-2", "Yoko Kanno"),
            ("artist-3", "Mai Yamane"),
        ] {
            connection
                .execute(
                    "INSERT INTO artists (id, name, created_at, updated_at) VALUES (?1, ?2, 'now', 'now')",
                    params![id, name],
                )
                .expect("artist");
        }

        // Every artist is pending before any sync has run.
        let pending = list_artists_for_discography_sync(&connection, 30).expect("list pending");
        assert_eq!(pending.len(), 3, "all artists start unchecked");

        // A checked artist drops out of the pending set until it goes stale.
        mark_artist_discography_checked(&connection, "artist-2").expect("mark checked");
        let pending = list_artists_for_discography_sync(&connection, 30).expect("list pending");
        assert_eq!(pending.len(), 2);
        assert!(
            pending.iter().all(|artist| artist.id != "artist-2"),
            "recently checked artists are skipped"
        );

        // Backdating past the staleness window brings it back for a refresh.
        connection
            .execute(
                "UPDATE artists SET discography_checked_at = ?1 WHERE id = 'artist-2'",
                params![(Utc::now() - chrono::Duration::days(60)).to_rfc3339()],
            )
            .expect("backdate");
        let pending = list_artists_for_discography_sync(&connection, 30).expect("list pending");
        assert_eq!(pending.len(), 3, "stale artists are re-queued");
    }

    #[test]
    fn album_release_groups_resolve_directly_by_artist_title_and_through_reviewed_merges() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");

        connection.execute(
            "INSERT INTO artists (id, name, musicbrainz_artist_id, created_at, updated_at) VALUES ('artist-1', 'The Seatbelts', 'mb-artist-1', 'now', 'now')",
            [],
        ).expect("artist");
        connection.execute(
            "INSERT INTO albums (id, title, created_at, updated_at) VALUES ('album-local-1', 'Cowboy Bebop', 'now', 'now')",
            [],
        ).expect("album");
        connection.execute(
            "INSERT INTO album_artists (album_id, artist_id, position) VALUES ('album-local-1', 'artist-1', 0)",
            [],
        ).expect("album artist");

        save_remote_discography(
            &mut connection,
            "mb-artist-1",
            "The Seatbelts",
            &[RemoteReleasePayload {
                id: "remote:rg-1".into(),
                musicbrainz_release_group_id: "rg-1".into(),
                title: "Cowboy Bebop".into(),
                year: Some(1998),
                date: None,
                primary_type: Some("Album".into()),
                secondary_types: Vec::new(),
                disambiguation: None,
                catalog_number: None,
                label: None,
                artwork_url: None,
                artwork_attribution: None,
                artwork_source: None,
                artists: vec![crate::ArtistReference {
                    id: "mb-artist-1".into(),
                    name: "The Seatbelts".into(),
                }],
                raw_json: String::new(),
            }],
        )
        .expect("save discography");

        // A remote album resolves to its own release group.
        let direct = resolve_album_release_group(&connection, "remote:rg-1")
            .expect("resolve")
            .expect("release group");
        assert_eq!(direct.musicbrainz_release_group_id, "rg-1");

        // A local album with no embedded release ID can resolve through the
        // exact cached release title and shared MusicBrainz artist ID.
        let title_matched = resolve_album_release_group(&connection, "album-local-1")
            .expect("resolve")
            .expect("artist/title release group");
        assert_eq!(title_matched.musicbrainz_release_group_id, "rg-1");

        // A reviewed merge remains a valid, preferred resolution path.
        record_entity_merge(&connection, "album", "album-local-1", "remote:rg-1", true)
            .expect("merge");
        let merged = resolve_album_release_group(&connection, "album-local-1")
            .expect("resolve")
            .expect("release group");
        assert_eq!(merged.musicbrainz_release_group_id, "rg-1");
    }

    #[test]
    fn remote_discography_persists_and_merges_with_local_albums_by_mbid() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");

        connection.execute(
            "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at) VALUES ('root-1', '/music', 'Music', 'now', 'now')",
            [],
        ).expect("root");
        connection.execute(
            "INSERT INTO artists (id, name, musicbrainz_artist_id, created_at, updated_at) VALUES ('artist-1', 'The Seatbelts', 'mb-artist-1', 'now', 'now')",
            [],
        ).expect("artist");
        connection.execute(
            "INSERT INTO albums (id, title, musicbrainz_release_id, created_at, updated_at) VALUES ('album-local-1', 'Cowboy Bebop', 'rg-1', 'now', 'now')",
            [],
        ).expect("album");
        connection.execute(
            "INSERT INTO album_artists (album_id, artist_id, position) VALUES ('album-local-1', 'artist-1', 0)",
            [],
        ).expect("album artist");
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, extension, file_size, available, added_at, updated_at) VALUES ('track-1', 'root-1', '/music/tank.flac', 'tank.flac', 'Tank!', 'album-local-1', 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track");

        let remote_releases = vec![
            RemoteReleasePayload {
                id: "remote:rg-1".into(),
                musicbrainz_release_group_id: "rg-1".into(),
                title: "Cowboy Bebop".into(),
                year: Some(1998),
                date: Some("1998-05-21".into()),
                primary_type: Some("Album".into()),
                secondary_types: vec!["Soundtrack".into()],
                disambiguation: None,
                catalog_number: None,
                label: Some("Victor".into()),
                artwork_url: Some(
                    "https://coverartarchive.org/release-group/rg-1/front-250".into(),
                ),
                artwork_attribution: Some("Cover Art Archive".into()),
                artwork_source: Some("coverartarchive.org".into()),
                artists: vec![crate::ArtistReference {
                    id: "mb-artist-1".into(),
                    name: "The Seatbelts".into(),
                }],
                raw_json: "{}".into(),
            },
            RemoteReleasePayload {
                id: "remote:rg-2".into(),
                musicbrainz_release_group_id: "rg-2".into(),
                title: "No Disc".into(),
                year: Some(1998),
                date: Some("1998-10-21".into()),
                primary_type: Some("Album".into()),
                secondary_types: vec!["Soundtrack".into()],
                disambiguation: None,
                catalog_number: None,
                label: Some("Victor".into()),
                artwork_url: Some(
                    "https://coverartarchive.org/release-group/rg-2/front-250".into(),
                ),
                artwork_attribution: Some("Cover Art Archive".into()),
                artwork_source: Some("coverartarchive.org".into()),
                artists: vec![crate::ArtistReference {
                    id: "mb-artist-1".into(),
                    name: "The Seatbelts".into(),
                }],
                raw_json: "{}".into(),
            },
        ];

        save_remote_discography(
            &mut connection,
            "mb-artist-1",
            "The Seatbelts",
            &remote_releases,
        )
        .expect("save discography");

        let detail = get_artist_detail(&connection, "artist-1").expect("artist detail");
        assert_eq!(detail.artist.provenance, EntityProvenance::Both);
        assert_eq!(detail.artist.availability, EntityAvailability::InLibrary);
        assert_eq!(detail.albums.len(), 2);

        let local_merged = detail
            .albums
            .iter()
            .find(|a| a.id == "album-local-1")
            .expect("local album");
        assert_eq!(local_merged.provenance, EntityProvenance::Both);
        assert_eq!(local_merged.availability, EntityAvailability::InLibrary);
        assert_eq!(local_merged.provider_ids, vec!["rg-1"]);
        assert_eq!(
            local_merged.artwork_path.as_deref(),
            Some("https://coverartarchive.org/release-group/rg-1/front-250")
        );

        let remote_only = detail
            .albums
            .iter()
            .find(|a| a.id == "remote:rg-2")
            .expect("remote album");
        assert_eq!(remote_only.provenance, EntityProvenance::Remote);
        assert_eq!(remote_only.availability, EntityAvailability::NotLocal);
        assert_eq!(remote_only.provider_ids, vec!["rg-2"]);
    }

    #[test]
    fn reviewed_fallback_merges_without_mbid_and_never_merges_silently_on_text() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");

        connection.execute(
            "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at) VALUES ('root-1', '/music', 'Music', 'now', 'now')",
            [],
        ).expect("root");
        connection.execute(
            "INSERT INTO artists (id, name, musicbrainz_artist_id, created_at, updated_at) VALUES ('artist-beatles', 'The Beatles', 'mb-beatles', 'now', 'now')",
            [],
        ).expect("artist");
        connection.execute(
            "INSERT INTO albums (id, title, created_at, updated_at) VALUES ('album-abbey-local', 'Abbey Road', 'now', 'now')",
            [],
        ).expect("album without MBID");
        connection.execute(
            "INSERT INTO album_artists (album_id, artist_id, position) VALUES ('album-abbey-local', 'artist-beatles', 0)",
            [],
        ).expect("album artist");
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, extension, file_size, available, added_at, updated_at) VALUES ('track-come-together', 'root-1', '/music/ct.flac', 'ct.flac', 'Come Together', 'album-abbey-local', 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track");

        let remote_releases = vec![RemoteReleasePayload {
            id: "remote:rg-abbey".into(),
            musicbrainz_release_group_id: "rg-abbey".into(),
            title: "Abbey Road".into(),
            year: Some(1969),
            date: Some("1969-09-26".into()),
            primary_type: Some("Album".into()),
            secondary_types: vec![],
            disambiguation: None,
            catalog_number: None,
            label: Some("Apple Records".into()),
            artwork_url: Some(
                "https://coverartarchive.org/release-group/rg-abbey/front-250".into(),
            ),
            artwork_attribution: Some("Cover Art Archive".into()),
            artwork_source: Some("coverartarchive.org".into()),
            artists: vec![crate::ArtistReference {
                id: "mb-beatles".into(),
                name: "The Beatles".into(),
            }],
            raw_json: "{}".into(),
        }];

        save_remote_discography(
            &mut connection,
            "mb-beatles",
            "The Beatles",
            &remote_releases,
        )
        .expect("save remote discography");

        // Before reviewed merge: no silent merge despite identical title "Abbey Road"
        let unmerged_detail = get_artist_detail(&connection, "artist-beatles").expect("detail");
        assert_eq!(
            unmerged_detail.albums.len(),
            2,
            "must not silently merge on text similarity alone"
        );
        let local_item = unmerged_detail
            .albums
            .iter()
            .find(|a| a.id == "album-abbey-local")
            .unwrap();
        assert_eq!(local_item.provenance, EntityProvenance::Local);
        let remote_item = unmerged_detail
            .albums
            .iter()
            .find(|a| a.id == "remote:rg-abbey")
            .unwrap();
        assert_eq!(remote_item.provenance, EntityProvenance::Remote);

        // Record a reviewed entity merge
        record_entity_merge(
            &connection,
            "album",
            "album-abbey-local",
            "remote:rg-abbey",
            true,
        )
        .expect("record reviewed merge");

        let merged_detail = get_artist_detail(&connection, "artist-beatles").expect("detail");
        assert_eq!(
            merged_detail.albums.len(),
            1,
            "reviewed merge unifies the album entry"
        );
        let merged_item = &merged_detail.albums[0];
        assert_eq!(merged_item.id, "album-abbey-local");
        assert_eq!(merged_item.provenance, EntityProvenance::Both);
        assert_eq!(merged_item.availability, EntityAvailability::InLibrary);
    }

    #[test]
    fn repeated_discography_refreshes_are_idempotent_and_do_not_duplicate_rows() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");

        let remote_releases = vec![RemoteReleasePayload {
            id: "remote:rg-100".into(),
            musicbrainz_release_group_id: "rg-100".into(),
            title: "Live in Tokyo".into(),
            year: Some(2001),
            date: Some("2001-01-01".into()),
            primary_type: Some("Album".into()),
            secondary_types: vec!["Live".into()],
            disambiguation: None,
            catalog_number: None,
            label: None,
            artwork_url: None,
            artwork_attribution: None,
            artwork_source: None,
            artists: vec![crate::ArtistReference {
                id: "mb-artist-dup".into(),
                name: "Dup Artist".into(),
            }],
            raw_json: "{}".into(),
        }];

        save_remote_discography(
            &mut connection,
            "mb-artist-dup",
            "Dup Artist",
            &remote_releases,
        )
        .expect("first save");
        save_remote_discography(
            &mut connection,
            "mb-artist-dup",
            "Dup Artist",
            &remote_releases,
        )
        .expect("second save");

        let release_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM remote_releases", [], |row| row.get(0))
            .expect("count releases");
        assert_eq!(
            release_count, 1,
            "repeated refresh must not duplicate release rows"
        );

        let artist_rel_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM remote_release_artists", [], |row| {
                row.get(0)
            })
            .expect("count release artists");
        assert_eq!(
            artist_rel_count, 1,
            "repeated refresh must not duplicate artist credit rows"
        );
    }

    #[test]
    fn roots_are_persistent_entities_and_removal_cascades_catalog_rows() {
        let worker = DatabaseWorker::in_memory().expect("database starts");
        let root = worker
            .add_root("/music".into(), "Music".into())
            .expect("root added");
        assert_eq!(worker.list_roots().expect("list roots").len(), 1);
        let disabled = worker
            .set_root_enabled(root.id.clone(), false)
            .expect("root disabled");
        assert!(!disabled.enabled);
        worker.remove_root(root.id).expect("root removed");
        assert!(worker.list_roots().expect("list roots").is_empty());
    }

    #[test]
    fn every_metadata_job_scope_resolves_its_tracks() {
        let mut connection =
            open_connection(Connection::open_in_memory()).expect("open metadata job database");
        connection
            .execute_batch(
                "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at)
                 VALUES ('root', '/music', 'Music', 'now', 'now');
                 INSERT INTO artists (id, name, sort_name, created_at, updated_at)
                 VALUES ('artist', 'Artist', 'Artist', 'now', 'now');
                 INSERT INTO albums (id, title, created_at, updated_at)
                 VALUES ('album', 'Album', 'now', 'now');
                 INSERT INTO album_artists (album_id, artist_id, position)
                 VALUES ('album', 'artist', 0);
                 INSERT INTO tracks
                   (id, root_id, canonical_path, relative_path, title, album_id, extension,
                    file_size, available, added_at, updated_at)
                 VALUES
                   ('track-1', 'root', '/music/1.flac', '1.flac', 'One', 'album', 'flac', 1, 1, 'now', 'now'),
                   ('track-2', 'root', '/music/2.flac', '2.flac', 'Two', 'album', 'flac', 1, 1, 'now', 'now');",
            )
            .expect("seed catalog");

        // Library scope binds no parameter; the others bind exactly one. Passing a
        // parameter to the library query previously failed every enrich run.
        let library = create_metadata_job(&mut connection, MetadataJobScope::Library, None)
            .expect("library scope job");
        assert_eq!(library.total_tracks, 2);

        let album = create_metadata_job(&mut connection, MetadataJobScope::Album, Some("album"))
            .expect("album scope job");
        assert_eq!(album.total_tracks, 2);

        let artist = create_metadata_job(&mut connection, MetadataJobScope::Artist, Some("artist"))
            .expect("artist scope job");
        assert_eq!(artist.total_tracks, 2);

        let track = create_metadata_job(&mut connection, MetadataJobScope::Track, Some("track-1"))
            .expect("track scope job");
        assert_eq!(track.total_tracks, 1);
    }

    #[test]
    fn metadata_jobs_checkpoint_scopes_and_retry_only_unfinished_tracks() {
        let mut connection =
            open_connection(Connection::open_in_memory()).expect("open metadata job database");
        connection
            .execute_batch(
                "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at)
                 VALUES ('root', '/music', 'Music', 'now', 'now');
                 INSERT INTO artists (id, name, sort_name, created_at, updated_at)
                 VALUES ('artist', 'Artist', 'Artist', 'now', 'now');
                 INSERT INTO albums (id, title, created_at, updated_at)
                 VALUES ('album', 'Album', 'now', 'now');
                 INSERT INTO album_artists (album_id, artist_id, position)
                 VALUES ('album', 'artist', 0);
                 INSERT INTO tracks
                   (id, root_id, canonical_path, relative_path, title, album_id, extension,
                    file_size, available, added_at, updated_at)
                 VALUES
                   ('track-1', 'root', '/music/1.flac', '1.flac', 'One', 'album', 'flac', 1, 1, 'now', 'now'),
                   ('track-2', 'root', '/music/2.flac', '2.flac', 'Two', 'album', 'flac', 1, 1, 'now', 'now');",
            )
            .expect("seed catalog");

        let job = create_metadata_job(&mut connection, MetadataJobScope::Artist, Some("artist"))
            .expect("create artist job");
        assert_eq!(job.total_tracks, 2);
        assert_eq!(
            pending_metadata_job_tracks(&connection, &job.id, false)
                .unwrap()
                .len(),
            2
        );

        record_metadata_job_track(
            &mut connection,
            &job.id,
            "track-1",
            "complete",
            None,
            None,
            None,
            None,
        )
        .expect("checkpoint completed track");
        record_metadata_job_track(
            &mut connection,
            &job.id,
            "track-2",
            "error",
            None,
            None,
            Some("fixture failure"),
            None,
        )
        .expect("checkpoint failed track");

        assert!(
            pending_metadata_job_tracks(&connection, &job.id, false)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            pending_metadata_job_tracks(&connection, &job.id, true).unwrap(),
            ["track-2"]
        );
        let paused =
            set_metadata_job_status(&connection, &job.id, MetadataJobStatus::Paused, None, None)
                .expect("pause job");
        assert!(matches!(paused.status, MetadataJobStatus::Paused));
        assert_eq!(paused.processed_tracks, 2);
        assert_eq!(paused.failed_tracks, 1);
    }

    #[test]
    fn player_state_restores_without_a_current_track() {
        let worker = DatabaseWorker::in_memory().expect("database starts");
        worker
            .save_playback_checkpoint(None, 0)
            .expect("empty playback checkpoint saved");

        let restored = worker.load_player_state().expect("player state restored");

        assert_eq!(restored.current_track_id, None);
        assert_eq!(restored.resume_position_ms, 0);
    }

    #[test]
    fn existing_databases_are_backed_up_before_a_schema_upgrade() {
        let directory = temporary_directory("upgrade-backup");
        let database_path = directory.join("bebop.sqlite3");
        let connection = Connection::open(&database_path).expect("create old database");
        connection
            .execute_batch("CREATE TABLE legacy_marker (id INTEGER); PRAGMA user_version = 0;")
            .expect("create old schema");
        drop(connection);

        backup_before_upgrade(&database_path).expect("backup succeeds");

        let backups = fs::read_dir(directory.join("database-backups"))
            .expect("backup directory")
            .collect::<Result<Vec<_>, _>>()
            .expect("backup entries");
        assert_eq!(backups.len(), 1);
        let backup = Connection::open(backups[0].path()).expect("open backup");
        let marker_exists: bool = backup
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'legacy_marker')",
                [],
                |row| row.get(0),
            )
            .expect("query backup");
        assert!(marker_exists);
        drop(backup);
        fs::remove_dir_all(directory).expect("remove fixture");
    }

    #[test]
    fn corrupt_databases_are_preserved_and_replaced_with_a_clean_catalog() {
        let directory = temporary_directory("corruption-recovery");
        let database_path = directory.join("bebop.sqlite3");
        fs::write(&database_path, b"not a sqlite database").expect("write corrupt database");

        let recovery = recover_corrupt_database(&database_path)
            .expect("corruption recovery succeeds")
            .expect("recovery directory reported");
        assert!(!database_path.exists());
        assert_eq!(
            fs::read(recovery.join("bebop.sqlite3")).expect("read preserved database"),
            b"not a sqlite database"
        );

        let worker = DatabaseWorker::start(database_path.clone()).expect("clean database starts");
        assert!(worker.list_roots().expect("query clean catalog").is_empty());
        assert!(database_path.is_file());
        drop(worker);
        fs::remove_dir_all(directory).expect("remove fixture");
    }

    #[test]
    fn remote_tracks_persist_and_match_with_local_tracks_by_mbid_isrc_and_metadata() {
        let mut connection = Connection::open_in_memory().expect("open catalog");
        migrate(&mut connection).expect("migrate");

        connection.execute(
            "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at) VALUES ('root-1', '/music', 'Music', 'now', 'now')",
            [],
        ).expect("root");
        connection.execute(
            "INSERT INTO artists (id, name, musicbrainz_artist_id, created_at, updated_at) VALUES ('artist-1', 'The Seatbelts', 'mb-artist-1', 'now', 'now')",
            [],
        ).expect("artist");
        connection.execute(
            "INSERT INTO albums (id, title, musicbrainz_release_id, created_at, updated_at) VALUES ('album-local-1', 'Cowboy Bebop', 'rg-1', 'now', 'now')",
            [],
        ).expect("album");
        connection.execute(
            "INSERT INTO album_artists (album_id, artist_id, position) VALUES ('album-local-1', 'artist-1', 0)",
            [],
        ).expect("album artist");

        // Local tracks:
        // 1: matched by MBID
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, musicbrainz_recording_id, track_number, disc_number, extension, file_size, available, added_at, updated_at)
             VALUES ('track-1', 'root-1', '/music/tank.flac', 'tank.flac', 'Tank!', 'album-local-1', 'rec-1', 1, 1, 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track 1");
        // 2: matched by ISRC
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, isrc, track_number, disc_number, extension, file_size, available, added_at, updated_at)
             VALUES ('track-2', 'root-1', '/music/rush.flac', 'rush.flac', 'Rush', 'album-local-1', 'US1234567890', 2, 1, 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track 2");
        // 3: matched by (disc_number, track_number, title)
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, track_number, disc_number, extension, file_size, available, added_at, updated_at)
             VALUES ('track-3', 'root-1', '/music/spokey.flac', 'spokey.flac', 'Spokey Dokey', 'album-local-1', 3, 1, 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track 3");
        // 4: local bonus track not in remote list
        connection.execute(
            "INSERT INTO tracks (id, root_id, canonical_path, relative_path, title, album_id, track_number, disc_number, extension, file_size, available, added_at, updated_at)
             VALUES ('track-4', 'root-1', '/music/bonus.flac', 'bonus.flac', 'Bonus Jam', 'album-local-1', 4, 1, 'flac', 1000, 1, 'now', 'now')",
            [],
        ).expect("track 4");

        let remote_releases = vec![RemoteReleasePayload {
            id: "remote:rg-1".into(),
            musicbrainz_release_group_id: "rg-1".into(),
            title: "Cowboy Bebop".into(),
            year: Some(1998),
            date: Some("1998-05-21".into()),
            primary_type: Some("Album".into()),
            secondary_types: vec!["Soundtrack".into()],
            disambiguation: None,
            catalog_number: None,
            label: Some("Victor".into()),
            artwork_url: Some("https://coverartarchive.org/release-group/rg-1/front-250".into()),
            artwork_attribution: Some("Cover Art Archive".into()),
            artwork_source: Some("coverartarchive.org".into()),
            artists: vec![crate::ArtistReference {
                id: "mb-artist-1".into(),
                name: "The Seatbelts".into(),
            }],
            raw_json: "{}".into(),
        }];

        save_remote_discography(
            &mut connection,
            "mb-artist-1",
            "The Seatbelts",
            &remote_releases,
        )
        .expect("save discography");

        let remote_tracks = vec![
            RemoteTrackPayload {
                id: "rtrack-1".into(),
                release_id: "remote:rg-1".into(),
                track_number: 1,
                disc_number: 1,
                title: "Tank! (Full Version)".into(),
                duration_ms: Some(210000),
                isrc: None,
                musicbrainz_recording_id: Some("rec-1".into()),
                spotify_track_id: Some("spotify-1".into()),
            },
            RemoteTrackPayload {
                id: "rtrack-2".into(),
                release_id: "remote:rg-1".into(),
                track_number: 2,
                disc_number: 1,
                title: "Rush".into(),
                duration_ms: Some(220000),
                isrc: Some("US1234567890".into()),
                musicbrainz_recording_id: None,
                spotify_track_id: Some("spotify-2".into()),
            },
            RemoteTrackPayload {
                id: "rtrack-3".into(),
                release_id: "remote:rg-1".into(),
                track_number: 3,
                disc_number: 1,
                title: "Spokey Dokey".into(),
                duration_ms: Some(240000),
                isrc: None,
                musicbrainz_recording_id: None,
                spotify_track_id: None,
            },
            RemoteTrackPayload {
                id: "rtrack-5".into(),
                release_id: "remote:rg-1".into(),
                track_number: 5,
                disc_number: 1,
                title: "Bad Dog No Biscuits".into(),
                duration_ms: Some(250000),
                isrc: None,
                musicbrainz_recording_id: Some("rec-5".into()),
                spotify_track_id: Some("spotify-5".into()),
            },
        ];

        save_remote_tracks(&mut connection, "remote:rg-1", &remote_tracks)
            .expect("save remote tracks");

        // Verify AlbumDetail
        let detail = get_album_detail(&connection, "album-local-1").expect("local album detail");
        assert_eq!(detail.album.provenance, EntityProvenance::Both);
        assert_eq!(detail.album.availability, EntityAvailability::InLibrary);
        assert_eq!(detail.tracks.len(), 5);

        let t1 = detail
            .tracks
            .iter()
            .find(|t| t.title.starts_with("Tank"))
            .unwrap();
        assert!(t1.available);
        assert_eq!(t1.id, "track-1");

        let t2 = detail.tracks.iter().find(|t| t.title == "Rush").unwrap();
        assert!(t2.available);
        assert_eq!(t2.id, "track-2");

        let t3 = detail
            .tracks
            .iter()
            .find(|t| t.title == "Spokey Dokey")
            .unwrap();
        assert!(t3.available);
        assert_eq!(t3.id, "track-3");

        let t5 = detail
            .tracks
            .iter()
            .find(|t| t.title == "Bad Dog No Biscuits")
            .unwrap();
        assert!(!t5.available);
        assert_eq!(t5.id, "rtrack-5");

        let t4 = detail
            .tracks
            .iter()
            .find(|t| t.title == "Bonus Jam")
            .unwrap();
        assert!(t4.available);
        assert_eq!(t4.id, "track-4");

        // Verify UnifiedAlbumDetail
        let unified =
            get_unified_album_detail(&connection, "album-local-1").expect("unified detail");
        assert_eq!(unified.album.provenance, EntityProvenance::Both);
        assert_eq!(unified.tracks.len(), 5);

        let u1 = unified
            .tracks
            .iter()
            .find(|t| t.title.starts_with("Tank"))
            .unwrap();
        assert!(u1.is_local);
        assert_eq!(u1.id, Some("track-1".into()));
        assert_eq!(u1.remote_id, "rtrack-1");
        assert!(u1.audio_specs.is_some());

        let u5 = unified
            .tracks
            .iter()
            .find(|t| t.title == "Bad Dog No Biscuits")
            .unwrap();
        assert!(!u5.is_local);
        assert_eq!(u5.id, None);
        assert_eq!(u5.remote_id, "rtrack-5");
        assert!(u5.audio_specs.is_none());

        // Query by remote ID
        let unified_remote =
            get_unified_album_detail(&connection, "remote:rg-1").expect("query by remote id");
        assert_eq!(unified_remote.album.provenance, EntityProvenance::Both);
        assert_eq!(unified_remote.tracks.len(), 5);

        // Verify cascade on delete of remote release
        connection
            .execute("DELETE FROM remote_releases WHERE id = 'remote:rg-1'", [])
            .expect("delete release");
        let remaining_remote_tracks =
            get_remote_tracks_for_release(&connection, "remote:rg-1").expect("get tracks");
        assert!(
            remaining_remote_tracks.is_empty(),
            "remote_tracks should cascade delete"
        );
    }

    #[test]
    fn worker_saves_remote_tracks_and_fetches_unified_album_detail() {
        let worker = DatabaseWorker::in_memory().expect("worker");
        let remote_releases = vec![RemoteReleasePayload {
            id: "remote:rg-worker".into(),
            musicbrainz_release_group_id: "rg-worker".into(),
            title: "Worker Album".into(),
            year: Some(2020),
            date: Some("2020-01-01".into()),
            primary_type: Some("Album".into()),
            secondary_types: vec![],
            disambiguation: None,
            catalog_number: None,
            label: None,
            artwork_url: None,
            artwork_attribution: None,
            artwork_source: None,
            artists: vec![crate::ArtistReference {
                id: "mb-w".into(),
                name: "Worker Artist".into(),
            }],
            raw_json: "{}".into(),
        }];

        worker
            .save_remote_discography("mb-w".into(), "Worker Artist".into(), remote_releases)
            .expect("save disco");

        let remote_tracks = vec![RemoteTrackPayload {
            id: "rtrack-w1".into(),
            release_id: "remote:rg-worker".into(),
            track_number: 1,
            disc_number: 1,
            title: "Worker Track 1".into(),
            duration_ms: Some(180000),
            isrc: None,
            musicbrainz_recording_id: None,
            spotify_track_id: None,
        }];

        worker
            .save_remote_tracks("remote:rg-worker".into(), remote_tracks)
            .expect("save tracks");

        let detail = worker
            .get_unified_album_detail("remote:rg-worker".into())
            .expect("unified detail");
        assert_eq!(detail.album.id, "remote:rg-worker");
        assert_eq!(detail.tracks.len(), 1);
        assert!(!detail.tracks[0].is_local);
    }
}
