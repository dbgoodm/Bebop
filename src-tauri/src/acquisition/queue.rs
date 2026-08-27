use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Sender},
    },
    thread,
    time::Duration,
};

use chrono::Utc;
use reqwest::blocking::Client;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    AppError,
    acquisition::{
        AcquisitionAlbumRequest, AcquisitionJobDto, AcquisitionJobStatus,
        AcquisitionProgressPayload, AcquisitionSettings, AcquisitionTrackRequest,
        providers::download_with_fallback, resolver::MetadataResolver, tagger::Tagger,
    },
    catalog::scan_track_at,
    emit_library_changed,
    persistence::DatabaseWorker,
};

pub const SETTINGS_KEY: &str = "acquisition.settings";

pub struct AcquisitionQueue {
    app: Option<AppHandle>,
    database: DatabaseWorker,
    _artwork_cache: PathBuf,
    jobs: Arc<Mutex<Vec<AcquisitionJobDto>>>,
    settings: Arc<Mutex<AcquisitionSettings>>,
    sender: Sender<String>,
    cancelled_jobs: Arc<Mutex<HashSet<String>>>,
    paused: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

impl AcquisitionQueue {
    pub(crate) fn new(
        app: Option<AppHandle>,
        database: DatabaseWorker,
        artwork_cache: PathBuf,
        initial_settings: Option<AcquisitionSettings>,
    ) -> Self {
        let loaded_settings = initial_settings
            .or_else(|| Self::load_settings_from_db(&database))
            .unwrap_or_default();

        let (sender, receiver) = mpsc::channel::<String>();
        let receiver = Arc::new(Mutex::new(receiver));

        let jobs = Arc::new(Mutex::new(Vec::new()));
        let settings = Arc::new(Mutex::new(loaded_settings));
        let cancelled_jobs = Arc::new(Mutex::new(HashSet::new()));
        let paused = Arc::new(AtomicBool::new(false));
        let running = Arc::new(AtomicBool::new(true));

        let queue = Self {
            app: app.clone(),
            database: database.clone(),
            _artwork_cache: artwork_cache.clone(),
            jobs: Arc::clone(&jobs),
            settings: Arc::clone(&settings),
            sender,
            cancelled_jobs: Arc::clone(&cancelled_jobs),
            paused: Arc::clone(&paused),
            running: Arc::clone(&running),
        };

        // Spawn bounded worker threads (e.g. 2 workers)
        let concurrency = 2;
        for worker_id in 0..concurrency {
            let worker_app = app.clone();
            let worker_db = database.clone();
            let worker_artwork = artwork_cache.clone();
            let worker_jobs = Arc::clone(&jobs);
            let worker_settings = Arc::clone(&settings);
            let worker_cancelled = Arc::clone(&cancelled_jobs);
            let worker_paused = Arc::clone(&paused);
            let worker_running = Arc::clone(&running);
            let worker_receiver = Arc::clone(&receiver);

            let thread_name = format!("bebop-acquisition-worker-{worker_id}");
            let _ = thread::Builder::new().name(thread_name).spawn(move || {
                let client = Client::builder()
                    .user_agent(format!(
                        "Bebop/{} (https://github.com/dbgoodm/Bebop)",
                        env!("CARGO_PKG_VERSION")
                    ))
                    .timeout(Duration::from_secs(30))
                    .build()
                    .unwrap_or_else(|_| Client::new());

                while worker_running.load(Ordering::Acquire) {
                    let job_id = {
                        let rx = match worker_receiver.lock() {
                            Ok(guard) => guard,
                            Err(_) => break,
                        };
                        match rx.recv_timeout(Duration::from_millis(500)) {
                            Ok(id) => id,
                            Err(mpsc::RecvTimeoutError::Timeout) => continue,
                            Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        }
                    };

                    while worker_paused.load(Ordering::Acquire)
                        && worker_running.load(Ordering::Acquire)
                    {
                        thread::sleep(Duration::from_millis(200));
                    }

                    if !worker_running.load(Ordering::Acquire) {
                        break;
                    }

                    if is_cancelled(&worker_cancelled, &job_id) {
                        update_job_status(
                            &worker_jobs,
                            &job_id,
                            AcquisitionJobStatus::Cancelled,
                            None,
                            None,
                        );
                        continue;
                    }

                    process_job(
                        &client,
                        &job_id,
                        &worker_app,
                        &worker_db,
                        &worker_artwork,
                        &worker_jobs,
                        &worker_settings,
                        &worker_cancelled,
                    );
                }
            });
        }

        queue
    }

    fn load_settings_from_db(database: &DatabaseWorker) -> Option<AcquisitionSettings> {
        database
            .get_ui_preference(SETTINGS_KEY.to_string())
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str(&json).ok())
    }

    pub fn enqueue_track(
        &self,
        request: AcquisitionTrackRequest,
    ) -> Result<AcquisitionJobDto, AppError> {
        let job_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let title = request
            .title
            .clone()
            .unwrap_or_else(|| "Resolving track...".to_string());
        let artist = request.artist.clone().unwrap_or_default();
        let album = request.album.clone().unwrap_or_default();

        let job_dto = AcquisitionJobDto {
            id: job_id.clone(),
            status: AcquisitionJobStatus::Queued,
            title,
            artist,
            album,
            track_number: request.track_number,
            disc_number: request.disc_number,
            year: request.year,
            isrc: request.isrc.clone(),
            artwork_url: request.artwork_url.clone(),
            progress: 0.0,
            bytes_downloaded: 0,
            total_bytes: 0,
            speed_bytes_per_sec: None,
            provider: request.preferred_provider.clone(),
            quality: None,
            destination_path: None,
            current_step: Some("Queued in download engine...".to_string()),
            error: None,
            created_at: now.clone(),
            updated_at: now,
        };

        {
            let mut jobs = self
                .jobs
                .lock()
                .map_err(|_| AppError::state_unavailable("acquisition-jobs"))?;
            jobs.push(job_dto.clone());
        }

        // Store request in internal metadata for processing if needed
        STORED_REQUESTS
            .lock()
            .unwrap()
            .insert(job_id.clone(), request);

        if let Some(app) = &self.app {
            let _ = app.emit("acquisition://job-added", &job_dto);
        }

        let _ = self.sender.send(job_id);

        Ok(job_dto)
    }

    pub fn enqueue_album(
        &self,
        request: AcquisitionAlbumRequest,
    ) -> Result<Vec<AcquisitionJobDto>, AppError> {
        let resolver = MetadataResolver::default();
        let url_or_query = request
            .url
            .clone()
            .or_else(|| {
                if let (Some(t), Some(a)) = (&request.title, &request.artist) {
                    Some(format!("{t} {a}"))
                } else {
                    request.title.clone()
                }
            })
            .ok_or_else(|| {
                AppError::new(
                    "acquisition-album-missing-query",
                    "No album URL or title provided.",
                )
            })?;

        let resolved_album = resolver.resolve_album_tracks(&url_or_query)?;
        let mut enqueued = Vec::new();

        for track in resolved_album.tracks {
            let track_req = AcquisitionTrackRequest {
                title: Some(track.title),
                artist: track.artists.first().cloned(),
                album: Some(resolved_album.title.clone()),
                isrc: track.isrc,
                track_number: track.track_number,
                disc_number: track.disc_number,
                year: resolved_album.year,
                artwork_url: resolved_album.artwork_url.clone(),
                preferred_provider: request.preferred_provider.clone(),
                ..Default::default()
            };

            let dto = self.enqueue_track(track_req)?;
            enqueued.push(dto);
        }

        Ok(enqueued)
    }

    pub fn get_queue(&self) -> Result<Vec<AcquisitionJobDto>, AppError> {
        self.jobs
            .lock()
            .map(|jobs| jobs.clone())
            .map_err(|_| AppError::state_unavailable("acquisition-jobs"))
    }

    pub fn cancel(&self, job_id: &str) -> Result<(), AppError> {
        {
            let mut cancelled = self
                .cancelled_jobs
                .lock()
                .map_err(|_| AppError::state_unavailable("cancelled-jobs"))?;
            cancelled.insert(job_id.to_string());
        }

        update_job_status(
            &self.jobs,
            job_id,
            AcquisitionJobStatus::Cancelled,
            None,
            Some("Job was cancelled by user.".to_string()),
        );

        if let Some(app) = &self.app {
            if let Some(job) = get_job_by_id(&self.jobs, job_id) {
                let _ = app.emit("acquisition://failed", &job);
            }
        }

        Ok(())
    }

    pub fn retry(&self, job_id: &str) -> Result<(), AppError> {
        {
            let mut cancelled = self
                .cancelled_jobs
                .lock()
                .map_err(|_| AppError::state_unavailable("cancelled-jobs"))?;
            cancelled.remove(job_id);
        }

        update_job_status(
            &self.jobs,
            job_id,
            AcquisitionJobStatus::Queued,
            Some("Retrying acquisition...".to_string()),
            None,
        );

        let _ = self.sender.send(job_id.to_string());
        Ok(())
    }

    pub fn pause(&self) -> Result<(), AppError> {
        self.paused.store(true, Ordering::Release);
        Ok(())
    }

    pub fn resume(&self) -> Result<(), AppError> {
        self.paused.store(false, Ordering::Release);
        Ok(())
    }

    pub fn get_settings(&self) -> Result<AcquisitionSettings, AppError> {
        self.settings
            .lock()
            .map(|s| s.clone())
            .map_err(|_| AppError::state_unavailable("acquisition-settings"))
    }

    pub fn save_settings(
        &self,
        new_settings: AcquisitionSettings,
    ) -> Result<AcquisitionSettings, AppError> {
        let json = serde_json::to_string(&new_settings)
            .map_err(|e| AppError::new("serialize-settings-failed", e.to_string()))?;

        self.database
            .set_ui_preference(SETTINGS_KEY.to_string(), json)?;

        let mut current = self
            .settings
            .lock()
            .map_err(|_| AppError::state_unavailable("acquisition-settings"))?;
        *current = new_settings.clone();

        Ok(new_settings)
    }

    pub fn shutdown(&self) {
        self.running.store(false, Ordering::Release);
    }
}

static STORED_REQUESTS: std::sync::LazyLock<Mutex<HashMap<String, AcquisitionTrackRequest>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn is_cancelled(cancelled: &Mutex<HashSet<String>>, job_id: &str) -> bool {
    cancelled
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

fn get_job_by_id(jobs: &Mutex<Vec<AcquisitionJobDto>>, job_id: &str) -> Option<AcquisitionJobDto> {
    jobs.lock().ok()?.iter().find(|j| j.id == job_id).cloned()
}

fn update_job_status(
    jobs: &Mutex<Vec<AcquisitionJobDto>>,
    job_id: &str,
    status: AcquisitionJobStatus,
    step: Option<String>,
    error: Option<String>,
) {
    if let Ok(mut list) = jobs.lock() {
        if let Some(job) = list.iter_mut().find(|j| j.id == job_id) {
            job.status = status;
            job.updated_at = Utc::now().to_rfc3339();
            if let Some(s) = step {
                job.current_step = Some(s);
            }
            if let Some(e) = error {
                job.error = Some(e);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn process_job(
    client: &Client,
    job_id: &str,
    app: &Option<AppHandle>,
    database: &DatabaseWorker,
    artwork_cache: &Path,
    jobs: &Arc<Mutex<Vec<AcquisitionJobDto>>>,
    settings: &Arc<Mutex<AcquisitionSettings>>,
    cancelled: &Arc<Mutex<HashSet<String>>>,
) {
    let stored_request = STORED_REQUESTS.lock().unwrap().remove(job_id);
    let request = match stored_request {
        Some(r) => r,
        None => {
            update_job_status(
                jobs,
                job_id,
                AcquisitionJobStatus::Failed,
                None,
                Some("Missing stored acquisition request".to_string()),
            );
            return;
        }
    };

    let queue_settings = match settings.lock() {
        Ok(s) => s.clone(),
        Err(_) => AcquisitionSettings::default(),
    };

    // Step 1: Resolving metadata
    update_job_status(
        jobs,
        job_id,
        AcquisitionJobStatus::Resolving,
        Some("Resolving metadata from Spotify / ISRC / Odesli...".to_string()),
        None,
    );
    emit_progress(
        app,
        jobs,
        job_id,
        AcquisitionJobStatus::Resolving,
        0.05,
        0,
        0,
        0,
        "Resolving metadata...",
    );

    let resolver = MetadataResolver::new(queue_settings.qobuz_app_id.clone());
    let resolved_track = match resolver.resolve_track(&request) {
        Ok(t) => t,
        Err(err) => {
            fail_job(
                app,
                jobs,
                job_id,
                format!("Resolution failed: {}", err.message),
            );
            return;
        }
    };

    if is_cancelled(cancelled, job_id) {
        update_job_status(jobs, job_id, AcquisitionJobStatus::Cancelled, None, None);
        return;
    }

    // Update job metadata in queue DTO
    if let Ok(mut list) = jobs.lock() {
        if let Some(job) = list.iter_mut().find(|j| j.id == job_id) {
            job.title = resolved_track.title.clone();
            job.artist = resolved_track.artists.join(", ");
            job.album = resolved_track.album.clone();
            job.track_number = resolved_track.track_number;
            job.disc_number = resolved_track.disc_number;
            job.year = resolved_track.year;
            job.isrc = resolved_track.isrc.clone();
            job.artwork_url = resolved_track.artwork_url.clone();
        }
    }

    // Step 2: Downloading audio stream
    update_job_status(
        jobs,
        job_id,
        AcquisitionJobStatus::Downloading,
        Some("Downloading lossless audio stream...".to_string()),
        None,
    );

    let progress_app = app.clone();
    let progress_jobs = Arc::clone(jobs);
    let progress_job_id = job_id.to_string();

    let progress_callback = move |downloaded: u64, total: u64, speed_bps: u64| {
        let frac = if total > 0 {
            0.1 + (downloaded as f32 / total as f32) * 0.7
        } else {
            0.5
        };
        emit_progress(
            &progress_app,
            &progress_jobs,
            &progress_job_id,
            AcquisitionJobStatus::Downloading,
            frac,
            downloaded,
            total,
            speed_bps,
            "Downloading audio stream...",
        );
    };

    let downloaded_audio = match download_with_fallback(
        client,
        &resolved_track,
        &queue_settings,
        &progress_callback,
    ) {
        Ok(audio) => audio,
        Err(err) => {
            fail_job(
                app,
                jobs,
                job_id,
                format!("Download failed: {}", err.message),
            );
            return;
        }
    };

    if is_cancelled(cancelled, job_id) {
        update_job_status(jobs, job_id, AcquisitionJobStatus::Cancelled, None, None);
        return;
    }

    // Step 3: Tagging & Placement
    update_job_status(
        jobs,
        job_id,
        AcquisitionJobStatus::Tagging,
        Some("Writing Vorbis tags, artwork, and lyrics...".to_string()),
        None,
    );
    emit_progress(
        app,
        jobs,
        job_id,
        AcquisitionJobStatus::Tagging,
        0.85,
        0,
        0,
        0,
        "Tagging audio file...",
    );

    let target_root = match get_target_library_root(database, &queue_settings) {
        Ok(root) => root,
        Err(err) => {
            fail_job(
                app,
                jobs,
                job_id,
                format!("Library root error: {}", err.message),
            );
            return;
        }
    };

    let root_path = PathBuf::from(&target_root.path);
    let placed_path = match Tagger::tag_and_place_track(
        &downloaded_audio.audio_bytes,
        &resolved_track,
        &queue_settings,
        &root_path,
        artwork_cache,
    ) {
        Ok(p) => p,
        Err(err) => {
            fail_job(
                app,
                jobs,
                job_id,
                format!("Tagging/Placement failed: {}", err.message),
            );
            return;
        }
    };

    // Step 4: Reconciling into catalog database
    update_job_status(
        jobs,
        job_id,
        AcquisitionJobStatus::Reconciling,
        Some("Indexing track into library catalog...".to_string()),
        None,
    );
    emit_progress(
        app,
        jobs,
        job_id,
        AcquisitionJobStatus::Reconciling,
        0.95,
        0,
        0,
        0,
        "Indexing into library...",
    );

    let scanned_opt = scan_track_at(&root_path, &placed_path, artwork_cache);
    if let Ok(Some(scanned_track)) = scanned_opt {
        if let Ok(changed_ids) =
            database.reconcile_paths(target_root.id.clone(), vec![scanned_track], vec![])
        {
            if let Some(a) = app {
                emit_library_changed(a, "track-acquired", Some(target_root.id), changed_ids);
            }
        }
    }

    // Step 5: Completed!
    if let Ok(mut list) = jobs.lock() {
        if let Some(job) = list.iter_mut().find(|j| j.id == job_id) {
            job.status = AcquisitionJobStatus::Completed;
            job.progress = 1.0;
            job.provider = Some(downloaded_audio.provider_name.clone());
            job.quality = Some(downloaded_audio.quality_label.clone());
            job.destination_path = Some(placed_path.to_string_lossy().into_owned());
            job.current_step = Some("Download and indexing completed successfully.".to_string());
            job.updated_at = Utc::now().to_rfc3339();

            if let Some(a) = app {
                let _ = a.emit("acquisition://completed", &job.clone());
            }
        }
    }
}

fn get_target_library_root(
    database: &DatabaseWorker,
    settings: &AcquisitionSettings,
) -> Result<crate::catalog::LibraryRoot, AppError> {
    let roots = database.list_roots()?;
    if roots.is_empty() {
        return Err(AppError::new(
            "no-library-roots",
            "No library roots configured in Bebop. Please add a library folder first.",
        ));
    }

    if let Some(target_id) = &settings.target_root_id {
        if let Some(root) = roots.iter().find(|r| r.id == *target_id && r.enabled) {
            return Ok(root.clone());
        }
    }

    // Default to first enabled root
    roots
        .into_iter()
        .find(|r| r.enabled)
        .ok_or_else(|| AppError::new("no-enabled-root", "No active enabled library folder found."))
}

#[allow(clippy::too_many_arguments)]
fn emit_progress(
    app: &Option<AppHandle>,
    jobs: &Mutex<Vec<AcquisitionJobDto>>,
    job_id: &str,
    status: AcquisitionJobStatus,
    progress: f32,
    bytes_downloaded: u64,
    total_bytes: u64,
    speed_bps: u64,
    step: &str,
) {
    if let Ok(mut list) = jobs.lock() {
        if let Some(job) = list.iter_mut().find(|j| j.id == job_id) {
            job.status = status;
            job.progress = progress;
            job.bytes_downloaded = bytes_downloaded;
            job.total_bytes = total_bytes;
            job.speed_bytes_per_sec = Some(speed_bps);
            job.current_step = Some(step.to_string());
            job.updated_at = Utc::now().to_rfc3339();
        }
    }

    if let Some(a) = app {
        let payload = AcquisitionProgressPayload {
            job_id: job_id.to_string(),
            status,
            progress,
            bytes_downloaded,
            total_bytes,
            speed_bytes_per_sec: speed_bps,
            current_step: step.to_string(),
            error: None,
        };
        let _ = a.emit("acquisition://progress", &payload);
    }
}

fn fail_job(
    app: &Option<AppHandle>,
    jobs: &Mutex<Vec<AcquisitionJobDto>>,
    job_id: &str,
    error_msg: String,
) {
    update_job_status(
        jobs,
        job_id,
        AcquisitionJobStatus::Failed,
        Some("Acquisition failed.".to_string()),
        Some(error_msg.clone()),
    );

    if let Some(a) = app {
        if let Some(job) = get_job_by_id(jobs, job_id) {
            let _ = a.emit("acquisition://failed", &job);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_queue_enqueue_and_cancellation() {
        let db = DatabaseWorker::in_memory().expect("db starts");
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let queue = AcquisitionQueue::new(None, db, temp_dir.path().to_path_buf(), None);

        let req = AcquisitionTrackRequest {
            title: Some("Test Track".to_string()),
            artist: Some("Test Artist".to_string()),
            album: Some("Test Album".to_string()),
            ..Default::default()
        };

        let job = queue.enqueue_track(req).expect("enqueued");
        assert_eq!(job.status, AcquisitionJobStatus::Queued);
        assert_eq!(job.title, "Test Track");

        queue.cancel(&job.id).expect("cancelled");
        let list = queue.get_queue().expect("queue list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].status, AcquisitionJobStatus::Cancelled);
    }

    #[test]
    fn test_queue_pause_resume_and_retry() {
        let db = DatabaseWorker::in_memory().expect("db starts");
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let queue = AcquisitionQueue::new(None, db, temp_dir.path().to_path_buf(), None);

        queue.pause().expect("paused");
        assert!(queue.paused.load(Ordering::Acquire));

        queue.resume().expect("resumed");
        assert!(!queue.paused.load(Ordering::Acquire));

        let req = AcquisitionTrackRequest {
            title: Some("Retry Song".to_string()),
            ..Default::default()
        };
        let job = queue.enqueue_track(req).expect("enqueued");
        queue.cancel(&job.id).expect("cancelled");
        assert_eq!(
            queue.get_queue().unwrap()[0].status,
            AcquisitionJobStatus::Cancelled
        );

        queue.retry(&job.id).expect("retry");
        assert_eq!(
            queue.get_queue().unwrap()[0].status,
            AcquisitionJobStatus::Queued
        );
    }

    #[test]
    fn test_queue_settings_persistence() {
        let db = DatabaseWorker::in_memory().expect("db starts");
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let queue = AcquisitionQueue::new(None, db, temp_dir.path().to_path_buf(), None);

        let initial = queue.get_settings().expect("settings");
        assert_eq!(initial.max_parallel_downloads, 2);
        assert!(initial.embed_artwork);
        assert!(initial.fetch_lyrics);

        let mut modified = initial;
        modified.max_parallel_downloads = 4;
        modified.deezer_arl = Some("test_arl_token_1234".to_string());
        modified.qobuz_user_auth_token = Some("qobuz_user_token_abc".to_string());

        let saved = queue.save_settings(modified).expect("saved");
        assert_eq!(saved.max_parallel_downloads, 4);
        assert_eq!(saved.deezer_arl.as_deref(), Some("test_arl_token_1234"));
        assert_eq!(
            saved.qobuz_user_auth_token.as_deref(),
            Some("qobuz_user_token_abc")
        );

        let retrieved = queue.get_settings().expect("retrieved");
        assert_eq!(retrieved.max_parallel_downloads, 4);
        assert_eq!(retrieved.deezer_arl.as_deref(), Some("test_arl_token_1234"));
    }
}
