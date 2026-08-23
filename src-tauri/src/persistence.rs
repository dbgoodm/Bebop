use std::{
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
        AudioExtension, CatalogQuery, LibraryRoot, RootAvailability, ScannedLibrary, SortDirection,
        TrackPage, TrackSort, TrackSummary, WatchMode,
    },
};

const SCHEMA_VERSION: i64 = 1;
const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!("migrations/0001_catalog.sql"))];

#[derive(Clone)]
pub(crate) struct DatabaseWorker {
    sender: Sender<Request>,
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
        reply: Sender<Result<Vec<TrackSummary>, AppError>>,
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
    ) -> Result<Vec<TrackSummary>, AppError> {
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
            "INSERT INTO library_roots (id, canonical_path, label, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
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
) -> Result<Vec<TrackSummary>, AppError> {
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
    query_tracks(
        connection,
        CatalogQuery {
            root_id: Some(root_id.to_owned()),
            limit: u32::MAX,
            ..CatalogQuery::default()
        },
    )
    .map(|page| page.items)
}

fn upsert_track(
    transaction: &Transaction<'_>,
    root_id: &str,
    track: &crate::catalog::ScannedTrack,
    now: &str,
) -> Result<(), AppError> {
    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO tracks (
                id, root_id, canonical_path, relative_path, title, extension, file_size,
                duration_ms, sample_rate, channels, bit_depth, available, modified_at_ms, added_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13, ?13)
             ON CONFLICT(root_id, relative_path) DO UPDATE SET
                canonical_path = excluded.canonical_path, title = excluded.title,
                extension = excluded.extension, file_size = excluded.file_size,
                duration_ms = excluded.duration_ms, sample_rate = excluded.sample_rate,
                channels = excluded.channels, bit_depth = excluded.bit_depth,
                available = 1, modified_at_ms = excluded.modified_at_ms, updated_at = excluded.updated_at",
            params![
                id,
                root_id,
                track.canonical_path,
                track.relative_path,
                track.title,
                track.extension.as_str(),
                track.file_size,
                track.duration_ms,
                track.sample_rate,
                track.channels,
                track.bit_depth,
                track.modified_at_ms,
                now,
            ],
        )
        .map_err(database_error("upsert-library-track"))?;
    Ok(())
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
    let extension: String = row.get(5)?;
    let extension = AudioExtension::from_database(&extension).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(5, "extension".into(), rusqlite::types::Type::Text)
    })?;
    Ok(TrackSummary {
        id: row.get(0)?,
        root_id: row.get(1)?,
        path: row.get(2)?,
        relative_path: row.get(3)?,
        title: row.get(4)?,
        extension,
        file_size: row.get(6)?,
        duration_ms: row.get(7)?,
        sample_rate: row.get(8)?,
        channels: row.get(9)?,
        bit_depth: row.get(10)?,
        available: row.get(11)?,
    })
}

const TRACK_COLUMNS: &str = "id, root_id, canonical_path, relative_path, title, extension, file_size, duration_ms, sample_rate, channels, bit_depth, available";

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
        AND (?3 IS NULL OR title LIKE ?3 ESCAPE '\\' COLLATE NOCASE OR relative_path LIKE ?3 ESCAPE '\\' COLLATE NOCASE)";
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
    let items = statement
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
    Ok(TrackPage {
        items,
        total,
        offset: query.offset,
        limit,
    })
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
