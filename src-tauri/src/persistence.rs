use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::mpsc::{self, Receiver, Sender},
    thread,
};

use chrono::Utc;
use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, params};
use uuid::Uuid;

use crate::{
    AppError,
    catalog::{
        AlbumDetail, AlbumSummary, ArtistDetail, ArtistSummary, AudioExtension, CatalogQuery,
        DiscoveryCatalog, DiscoveryQuery, GenreSummary, LibraryRoot, RootAvailability,
        ScannedLibrary, SortDirection, TrackPage, TrackSort, TrackSummary, WatchMode,
    },
    metadata::{CachedArtwork, MetadataPatch},
    user_state::{
        FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary,
    },
};

const SCHEMA_VERSION: i64 = 3;
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("migrations/0001_catalog.sql")),
    (2, include_str!("migrations/0002_live_indexing.sql")),
    (3, include_str!("migrations/0003_player_state.sql")),
];
type CatalogSignatures = HashMap<String, (String, u64, Option<i64>, bool)>;

#[derive(Clone)]
pub(crate) struct DatabaseWorker {
    sender: Sender<Request>,
}

pub(crate) struct Reconciliation {
    pub tracks: Vec<TrackSummary>,
    pub changed_track_ids: Vec<String>,
}

enum Request {
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
    GetArtistDetail {
        id: String,
        reply: Sender<Result<ArtistDetail, AppError>>,
    },
    GetAlbumDetail {
        id: String,
        reply: Sender<Result<AlbumDetail, AppError>>,
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
    GetEnrichmentCache {
        query_key: String,
        reply: Sender<Result<Option<String>, AppError>>,
    },
    SaveEnrichmentCache {
        track_id: String,
        query_key: String,
        result_json: String,
        reply: Sender<Result<(), AppError>>,
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
    GetPlaylistTracks {
        playlist_id: String,
        reply: Sender<Result<Vec<TrackSummary>, AppError>>,
    },
    SetPlaylistTracks {
        playlist_id: String,
        track_ids: Vec<String>,
        reply: Sender<Result<(), AppError>>,
    },
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
}

impl DatabaseWorker {
    pub(crate) fn start(database_path: PathBuf) -> Result<Self, AppError> {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::persistence("create-app-data-directory", error.to_string())
            })?;
        }
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

    pub(crate) fn get_artist_detail(&self, id: String) -> Result<ArtistDetail, AppError> {
        self.request(|reply| Request::GetArtistDetail { id, reply })
    }

    pub(crate) fn get_album_detail(&self, id: String) -> Result<AlbumDetail, AppError> {
        self.request(|reply| Request::GetAlbumDetail { id, reply })
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

    pub(crate) fn get_enrichment_cache(
        &self,
        query_key: String,
    ) -> Result<Option<String>, AppError> {
        self.request(|reply| Request::GetEnrichmentCache { query_key, reply })
    }

    pub(crate) fn save_enrichment_cache(
        &self,
        track_id: String,
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
    let backup_path = backup_directory.join(format!("bebop-v{version}-{timestamp}.sqlite3"));
    fs::copy(database_path, backup_path)
        .map_err(|error| AppError::persistence("backup-database", error.to_string()))?;
    Ok(())
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
            Request::GetArtistDetail { id, reply } => {
                send(reply, get_artist_detail(&connection, &id));
            }
            Request::GetAlbumDetail { id, reply } => {
                send(reply, get_album_detail(&connection, &id));
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
                    save_enrichment_cache(&connection, &track_id, &query_key, &result_json),
                );
            }
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
        available: row.get(25)?,
    })
}

const TRACK_COLUMNS: &str = "id, root_id, canonical_path, relative_path, title, sort_title,
    album_id, extension, file_size, duration_ms, sample_rate, channels, bit_depth,
    track_number, track_total, disc_number, disc_total, year, date, composer, label,
    catalog_number, isrc, musicbrainz_recording_id, artwork_id, available";

fn query_tracks(connection: &Connection, query: CatalogQuery) -> Result<TrackPage, AppError> {
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
    let limit = query.limit.clamp(1, 100);
    let pattern = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value.replace('%', "\\%").replace('_', "\\_")));
    Ok(DiscoveryCatalog {
        artists: query_artists(connection, pattern.as_deref(), query.offset, limit)?,
        albums: query_albums(connection, pattern.as_deref(), query.offset, limit)?,
        genres: query_genres(connection, pattern.as_deref(), query.offset, limit)?,
    })
}

fn query_artists(
    connection: &Connection,
    pattern: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<Vec<ArtistSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.name,
                (SELECT COUNT(DISTINCT t.album_id) FROM track_artists ta JOIN tracks t ON t.id = ta.track_id
                 WHERE ta.artist_id = a.id AND ta.role = 'artist'),
                (SELECT COUNT(*) FROM track_artists ta JOIN tracks t ON t.id = ta.track_id
                 WHERE ta.artist_id = a.id AND ta.role = 'artist'),
                (SELECT COALESCE(SUM(t.duration_ms), 0) FROM track_artists ta JOIN tracks t ON t.id = ta.track_id
                 WHERE ta.artist_id = a.id AND ta.role = 'artist'),
                (SELECT al.artwork_id FROM track_artists ta JOIN tracks t ON t.id = ta.track_id
                 JOIN albums al ON al.id = t.album_id WHERE ta.artist_id = a.id AND al.artwork_id IS NOT NULL LIMIT 1)
             FROM artists a
             WHERE ?1 IS NULL OR a.name LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR EXISTS (
                SELECT 1 FROM track_artists ta JOIN tracks t ON t.id = ta.track_id
                LEFT JOIN albums al ON al.id = t.album_id
                WHERE ta.artist_id = a.id AND (
                  t.title LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR t.composer LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR
                  t.label LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR t.catalog_number LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR
                  al.title LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR EXISTS (
                    SELECT 1 FROM track_genres tg JOIN genres g ON g.id = tg.genre_id
                    WHERE tg.track_id = t.id AND g.name LIKE ?1 ESCAPE '\\' COLLATE NOCASE
                  )
                )
             )
             ORDER BY a.name COLLATE NOCASE, a.id LIMIT ?2 OFFSET ?3",
        )
        .map_err(database_error("prepare-artists-query"))?;
    let mut artists = statement
        .query_map(params![pattern, limit, offset], |row| {
            Ok(ArtistSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                genres: Vec::new(),
                album_count: row.get(2)?,
                track_count: row.get(3)?,
                total_duration_ms: row.get(4)?,
                artwork_id: row.get(5)?,
            })
        })
        .map_err(database_error("query-artists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-artists"))?;
    drop(statement);
    for artist in &mut artists {
        let mut genres = connection
            .prepare(
                "SELECT DISTINCT g.name FROM track_artists ta
                 JOIN track_genres tg ON tg.track_id = ta.track_id JOIN genres g ON g.id = tg.genre_id
                 WHERE ta.artist_id = ?1 ORDER BY g.name COLLATE NOCASE",
            )
            .map_err(database_error("prepare-artist-genres"))?;
        artist.genres = genres
            .query_map([&artist.id], |row| row.get(0))
            .map_err(database_error("query-artist-genres"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error("read-artist-genres"))?;
    }
    Ok(artists)
}

fn query_albums(
    connection: &Connection,
    pattern: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<Vec<AlbumSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT al.id, al.title, al.year, al.label, al.catalog_number, al.artwork_id,
                COUNT(t.id), COALESCE(SUM(t.duration_ms), 0)
             FROM albums al LEFT JOIN tracks t ON t.album_id = al.id
             WHERE ?1 IS NULL OR al.title LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR
                al.label LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR al.catalog_number LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR
                EXISTS (SELECT 1 FROM album_artists aa JOIN artists a ON a.id = aa.artist_id
                        WHERE aa.album_id = al.id AND a.name LIKE ?1 ESCAPE '\\' COLLATE NOCASE) OR
                EXISTS (SELECT 1 FROM tracks st WHERE st.album_id = al.id AND
                        (st.title LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR st.composer LIKE ?1 ESCAPE '\\' COLLATE NOCASE))
             GROUP BY al.id ORDER BY al.title COLLATE NOCASE, al.id LIMIT ?2 OFFSET ?3",
        )
        .map_err(database_error("prepare-albums-query"))?;
    let mut albums = statement
        .query_map(params![pattern, limit, offset], |row| {
            Ok(AlbumSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                artists: Vec::new(),
                year: row.get(2)?,
                label: row.get(3)?,
                catalog_number: row.get(4)?,
                artwork_id: row.get(5)?,
                track_count: row.get(6)?,
                total_duration_ms: row.get(7)?,
            })
        })
        .map_err(database_error("query-albums"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-albums"))?;
    drop(statement);
    for album in &mut albums {
        album.artists = album_artists(connection, &album.id)?;
    }
    Ok(albums)
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
    let artist = query_artists(connection, None, 0, u32::MAX)?
        .into_iter()
        .find(|artist| artist.id == id)
        .ok_or_else(|| {
            AppError::new("artist-not-found", "The requested artist no longer exists.")
        })?;
    let mut album_statement = connection
        .prepare(
            "SELECT DISTINCT t.album_id FROM track_artists ta JOIN tracks t ON t.id = ta.track_id
             WHERE ta.artist_id = ?1 AND t.album_id IS NOT NULL ORDER BY t.album_id",
        )
        .map_err(database_error("prepare-artist-albums"))?;
    let album_ids = album_statement
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(database_error("query-artist-albums"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-artist-albums"))?;
    drop(album_statement);
    let all_albums = query_albums(connection, None, 0, u32::MAX)?;
    let albums = all_albums
        .into_iter()
        .filter(|album| album_ids.contains(&album.id))
        .collect();
    let tracks = tracks_for_entity(
        connection,
        "SELECT DISTINCT track_id FROM track_artists WHERE artist_id = ?1",
        id,
    )?;
    Ok(ArtistDetail {
        artist,
        albums,
        tracks,
    })
}

fn get_album_detail(connection: &Connection, id: &str) -> Result<AlbumDetail, AppError> {
    let album = query_albums(connection, None, 0, u32::MAX)?
        .into_iter()
        .find(|album| album.id == id)
        .ok_or_else(|| AppError::new("album-not-found", "The requested album no longer exists."))?;
    let tracks = tracks_for_entity(connection, "SELECT id FROM tracks WHERE album_id = ?1", id)?;
    Ok(AlbumDetail { album, tracks })
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
    track_id: &str,
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
    let current_track_id = read_setting(connection, "player.current-track")?;
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
    Ok(PlaylistSummary {
        id,
        name: name.into(),
        track_count: 0,
    })
}

fn list_playlists(connection: &Connection) -> Result<Vec<PlaylistSummary>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT p.id, p.name, COUNT(pt.track_id) FROM playlists p
             LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
             GROUP BY p.id ORDER BY p.name COLLATE NOCASE, p.id",
        )
        .map_err(database_error("prepare-playlists"))?;
    statement
        .query_map([], |row| {
            Ok(PlaylistSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                track_count: row.get(2)?,
            })
        })
        .map_err(database_error("query-playlists"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error("read-playlists"))
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
        .query_row("SELECT COUNT(*) FROM artists", [], |row| row.get(0))
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
    fn version_one_catalogs_upgrade_through_current_schema() {
        let mut connection = Connection::open_in_memory().expect("open old database");
        connection
            .execute_batch(include_str!("migrations/0001_catalog.sql"))
            .expect("install version one schema");
        connection
            .pragma_update(None, "user_version", 1)
            .expect("set old schema version");
        migrate(&mut connection).expect("upgrade schema");
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read upgraded version");
        let fingerprint_exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM pragma_table_info('tracks') WHERE name = 'content_fingerprint'
                 )",
                [],
                |row| row.get(0),
            )
            .expect("inspect upgraded tracks");
        assert_eq!(version, 3);
        assert!(fingerprint_exists);
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
}
