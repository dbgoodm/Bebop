use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::AppHandle;

use crate::{
    AppError, AudioExtension, LibraryRoot, catalog::scan_track_at, emit_library_changed,
    persistence::DatabaseWorker, scan_root,
};

const DEBOUNCE_WINDOW: Duration = Duration::from_millis(750);
const WRITE_SUPPRESSION_WINDOW: Duration = Duration::from_secs(3);

pub(crate) struct LibraryWatcher {
    watcher: Mutex<RecommendedWatcher>,
    watched: Mutex<HashSet<PathBuf>>,
    suppressed: Arc<Mutex<HashMap<PathBuf, Instant>>>,
}

impl LibraryWatcher {
    pub(crate) fn start(
        app: AppHandle,
        database: DatabaseWorker,
        artwork_cache: PathBuf,
    ) -> Result<Self, AppError> {
        let (sender, receiver) = mpsc::channel();
        let watcher = notify::recommended_watcher(move |result| {
            let _ = sender.send(result);
        })
        .map_err(watcher_error("start-library-watcher"))?;
        let suppressed = Arc::new(Mutex::new(HashMap::new()));
        let worker_suppressed = Arc::clone(&suppressed);
        thread::Builder::new()
            .name("bebop-library-watcher".into())
            .spawn(move || {
                while let Ok(first) = receiver.recv() {
                    let mut events = Vec::new();
                    if let Ok(event) = first {
                        events.push(event);
                    }
                    loop {
                        match receiver.recv_timeout(DEBOUNCE_WINDOW) {
                            Ok(Ok(event)) => events.push(event),
                            Ok(Err(_)) => {}
                            Err(mpsc::RecvTimeoutError::Timeout) => break,
                            Err(mpsc::RecvTimeoutError::Disconnected) => return,
                        }
                    }
                    reconcile_events(&app, &database, &artwork_cache, &worker_suppressed, events);
                }
            })
            .map_err(|error| AppError::new("watcher-worker-failed", error.to_string()))?;
        Ok(Self {
            watcher: Mutex::new(watcher),
            watched: Mutex::new(HashSet::new()),
            suppressed,
        })
    }

    pub(crate) fn watch_root(&self, root: &LibraryRoot) -> Result<(), AppError> {
        if !root.enabled || !Path::new(&root.path).is_dir() {
            return Ok(());
        }
        let path = PathBuf::from(&root.path);
        let mut watched = self
            .watched
            .lock()
            .map_err(|_| AppError::state_unavailable("library-watcher-paths"))?;
        if watched.contains(&path) {
            return Ok(());
        }
        self.watcher
            .lock()
            .map_err(|_| AppError::state_unavailable("library-watcher"))?
            .watch(&path, RecursiveMode::Recursive)
            .map_err(watcher_error("watch-library-root"))?;
        watched.insert(path);
        Ok(())
    }

    pub(crate) fn unwatch_root(&self, path: &Path) -> Result<(), AppError> {
        let mut watched = self
            .watched
            .lock()
            .map_err(|_| AppError::state_unavailable("library-watcher-paths"))?;
        if !watched.remove(path) {
            return Ok(());
        }
        self.watcher
            .lock()
            .map_err(|_| AppError::state_unavailable("library-watcher"))?
            .unwatch(path)
            .map_err(watcher_error("unwatch-library-root"))
    }

    pub(crate) fn suppress_path(&self, path: PathBuf) {
        if let Ok(mut suppressed) = self.suppressed.lock() {
            suppressed.insert(path, Instant::now());
        }
    }
}

fn reconcile_events(
    app: &AppHandle,
    database: &DatabaseWorker,
    artwork_cache: &Path,
    suppressed: &Mutex<HashMap<PathBuf, Instant>>,
    events: Vec<Event>,
) {
    let Ok(roots) = database.list_roots() else {
        return;
    };
    let paths: HashSet<_> = events
        .into_iter()
        .flat_map(|event| event.paths)
        .filter(|path| !ignored_path(path))
        .filter(|path| !is_suppressed(path, suppressed))
        .collect();
    let affected: Vec<_> = roots
        .into_iter()
        .filter(|root| {
            root.enabled
                && paths
                    .iter()
                    .any(|path| path.starts_with(Path::new(&root.path)))
        })
        .collect();
    for root in affected {
        reconcile_root_paths(app, database, artwork_cache, root, &paths);
    }
}

fn reconcile_root_paths(
    app: &AppHandle,
    database: &DatabaseWorker,
    artwork_cache: &Path,
    root: LibraryRoot,
    paths: &HashSet<PathBuf>,
) {
    let root_path = Path::new(&root.path);
    let mut scanned = Vec::new();
    let mut missing = Vec::new();
    let mut needs_full_scan = false;
    for path in paths.iter().filter(|path| path.starts_with(root_path)) {
        if AudioExtension::from_path(path).is_some() {
            if path.is_file() {
                match scan_track_at(root_path, path, artwork_cache) {
                    Ok(Some(track)) => scanned.push(track),
                    Ok(None) => {}
                    Err(_) => needs_full_scan = true,
                }
            } else if let Ok(relative) = path.strip_prefix(root_path) {
                missing.push(relative.to_string_lossy().into_owned());
            }
        } else if path.is_dir() || is_cover_candidate(path) || path.extension().is_none() {
            needs_full_scan = true;
        }
    }
    if needs_full_scan {
        let _ = scan_root(app, database, artwork_cache, root);
        return;
    }
    if scanned.is_empty() && missing.is_empty() {
        return;
    }
    if let Ok(changed) = database.reconcile_paths(root.id.clone(), scanned, missing) {
        emit_library_changed(app, "paths-reconciled", Some(root.id), changed);
    }
}

fn is_cover_candidate(path: &Path) -> bool {
    matches!(
        path.file_stem()
            .and_then(|name| name.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("cover" | "folder" | "front")
    )
}

fn ignored_path(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == ".bebop-backups")
        || path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with('.'))
}

fn is_suppressed(path: &Path, suppressed: &Mutex<HashMap<PathBuf, Instant>>) -> bool {
    let Ok(mut suppressed) = suppressed.lock() else {
        return false;
    };
    suppressed.retain(|_, created| created.elapsed() < WRITE_SUPPRESSION_WINDOW);
    suppressed.contains_key(path)
}

fn watcher_error(action: &'static str) -> impl FnOnce(notify::Error) -> AppError {
    move |error| {
        AppError::new(
            "library-watcher-error",
            "Bebop could not watch a library root.",
        )
        .with_context("action", action)
        .with_context("reason", error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_and_temporary_paths_are_ignored() {
        assert!(ignored_path(Path::new("/music/.bebop-backups/song.flac")));
        assert!(ignored_path(Path::new("/music/.tmp-file")));
        assert!(!ignored_path(Path::new("/music/album/song.flac")));
    }
}
