use std::{
    fs::{self, File},
    io::{BufReader, Write},
    net::IpAddr,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use keyring::Entry;
use reqwest::{StatusCode, Url, blocking::Client};
use rodio::Decoder;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tempfile::NamedTempFile;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{AppError, AudioExtension, RootAvailability, persistence::DatabaseWorker};

const SETTINGS_KEY: &str = "acquisition.settings";
const CREDENTIAL_USER: &str = "slskd-api-key";
pub(crate) const PROGRESS_EVENT: &str = "acquisition://progress";

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct AcquisitionSettings {
    pub server_url: String,
    pub inbox_path: Option<String>,
    pub confirmed_remote: bool,
    pub import_mode: String,
}

impl Default for AcquisitionSettings {
    fn default() -> Self {
        Self {
            server_url: "http://127.0.0.1:5030".into(),
            inbox_path: None,
            confirmed_remote: false,
            import_mode: "copy".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionStatus {
    pub configured: bool,
    pub connected: bool,
    pub server_url: String,
    pub version: Option<String>,
    pub error: Option<AppError>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionSearchFile {
    pub filename: String,
    pub size: u64,
    pub bit_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub sample_rate: Option<u32>,
    #[serde(rename = "length")]
    pub length_seconds: Option<u64>,
    #[serde(rename = "isLocked")]
    pub locked: bool,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionSearchGroup {
    pub search_id: String,
    pub source_user: String,
    pub upload_speed: u64,
    pub queue_length: u64,
    pub free_upload_slot: bool,
    pub files: Vec<AcquisitionSearchFile>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionSearch {
    pub id: String,
    pub query: String,
    pub complete: bool,
    pub groups: Vec<AcquisitionSearchGroup>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AcquisitionJobStatus {
    Queued,
    Downloading,
    Paused,
    Verifying,
    Importing,
    Complete,
    Error,
}

impl AcquisitionJobStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Downloading => "downloading",
            Self::Paused => "paused",
            Self::Verifying => "verifying",
            Self::Importing => "importing",
            Self::Complete => "complete",
            Self::Error => "error",
        }
    }

    fn from_database(value: &str) -> Self {
        match value {
            "downloading" => Self::Downloading,
            "paused" => Self::Paused,
            "verifying" => Self::Verifying,
            "importing" => Self::Importing,
            "complete" => Self::Complete,
            "error" => Self::Error,
            _ => Self::Queued,
        }
    }
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionJob {
    pub id: String,
    pub status: AcquisitionJobStatus,
    pub progress: f64,
    pub source_user: Option<String>,
    pub target_path: Option<String>,
    pub error: Option<AppError>,
}

#[derive(Clone, Debug)]
pub(crate) struct AcquisitionRecord {
    pub id: String,
    pub status: String,
    pub progress: f64,
    pub source_user: Option<String>,
    pub target_path: Option<String>,
    pub provider_job_id: Option<String>,
    pub error: Option<AppError>,
    pub remote_filename: Option<String>,
    pub file_size: u64,
    pub search_id: Option<String>,
}

impl AcquisitionRecord {
    fn public(&self) -> AcquisitionJob {
        AcquisitionJob {
            id: self.id.clone(),
            status: AcquisitionJobStatus::from_database(&self.status),
            progress: self.progress.clamp(0.0, 1.0),
            source_user: self.source_user.clone(),
            target_path: self.target_path.clone(),
            error: self.error.clone(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdSearch {
    id: String,
    search_text: String,
    state: u32,
    #[serde(default)]
    responses: Vec<SlskdResponse>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdResponse {
    username: String,
    upload_speed: u64,
    queue_length: u64,
    has_free_upload_slot: bool,
    #[serde(default)]
    files: Vec<AcquisitionSearchFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdBatchResponse {
    batch: SlskdBatch,
    #[serde(default)]
    failures: Vec<SlskdFailure>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdFailure {
    filename: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdBatch {
    id: String,
    #[serde(default)]
    transfers: Vec<SlskdTransfer>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdTransfer {
    id: String,
    state: u32,
    size: u64,
    bytes_transferred: u64,
    exception: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlskdApplication {
    version: Option<String>,
}

pub(crate) struct AcquisitionManager {
    running: Arc<AtomicBool>,
}

impl AcquisitionManager {
    pub(crate) fn start(app: AppHandle, database: DatabaseWorker) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let worker_running = Arc::clone(&running);
        thread::Builder::new()
            .name("bebop-acquisition".into())
            .spawn(move || {
                while worker_running.load(Ordering::Acquire) {
                    if let Ok(client) = SlskdClient::load(&database) {
                        let _ = refresh_jobs(&app, &database, &client);
                    }
                    for _ in 0..10 {
                        if !worker_running.load(Ordering::Acquire) {
                            return;
                        }
                        thread::sleep(Duration::from_millis(250));
                    }
                }
            })
            .expect("spawn acquisition worker");
        Self { running }
    }

    pub(crate) fn shutdown(&self) {
        self.running.store(false, Ordering::Release);
    }
}

struct SlskdClient {
    client: Client,
    base: String,
    api_key: Option<String>,
}

impl SlskdClient {
    fn load(database: &DatabaseWorker) -> Result<Self, AppError> {
        let settings = load_settings(database)?;
        validate_settings(&settings)?;
        let api_key = get_api_key();
        let client = Client::builder()
            .user_agent("Bebop/0.1 (local-first music player)")
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|error| AppError::new("slskd-client-error", error.to_string()))?;
        Ok(Self {
            client,
            base: settings.server_url.trim_end_matches('/').into(),
            api_key,
        })
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::blocking::RequestBuilder {
        let request = self.client.request(method, format!("{}{path}", self.base));
        if let Some(key) = &self.api_key {
            request.header("X-API-Key", key)
        } else {
            request
        }
    }

    fn json<T: DeserializeOwned>(
        &self,
        request: reqwest::blocking::RequestBuilder,
    ) -> Result<T, AppError> {
        let response = request.send().map_err(slskd_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            let message = response
                .text()
                .unwrap_or_else(|_| "slskd rejected the request.".into());
            return Err(slskd_response_error(status, message));
        }
        response
            .json()
            .map_err(|error| AppError::new("slskd-response-invalid", error.to_string()))
    }

    fn empty(&self, request: reqwest::blocking::RequestBuilder) -> Result<(), AppError> {
        let response = request.send().map_err(slskd_transport_error)?;
        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let message = response.text().unwrap_or_default();
            Err(slskd_response_error(status, message))
        }
    }

    fn application(&self) -> Result<SlskdApplication, AppError> {
        self.json(self.request(reqwest::Method::GET, "/api/v0/application"))
    }

    fn search(&self, query: &str) -> Result<SlskdSearch, AppError> {
        let id = Uuid::new_v4().to_string();
        self.json(
            self.request(reqwest::Method::POST, "/api/v0/searches")
                .json(&serde_json::json!({
                    "id": id,
                    "searchText": query,
                    "searchTimeout": 15000,
                    "responseLimit": 100,
                    "fileLimit": 2000
                })),
        )
    }

    fn search_results(&self, id: &str) -> Result<SlskdSearch, AppError> {
        self.json(self.request(
            reqwest::Method::GET,
            &format!("/api/v0/searches/{id}?includeResponses=true"),
        ))
    }

    fn enqueue(&self, record: &AcquisitionRecord) -> Result<SlskdBatch, AppError> {
        let id = record
            .provider_job_id
            .clone()
            .unwrap_or_else(|| record.id.clone());
        let response: SlskdBatchResponse = self.json(
            self.request(reqwest::Method::POST, "/api/v0/transfers/downloads/batches")
                .json(&serde_json::json!({
                    "id": id,
                    "searchId": record.search_id,
                    "username": record.source_user,
                    "files": [{
                        "filename": record.remote_filename,
                        "size": record.file_size
                    }],
                    "options": { "externalId": format!("bebop:{}", record.id) }
                })),
        )?;
        if let Some(failure) = response.failures.first() {
            return Err(
                AppError::new("slskd-enqueue-failed", failure.message.clone())
                    .with_context("filename", &failure.filename),
            );
        }
        Ok(response.batch)
    }

    fn batch(&self, id: &str) -> Result<SlskdBatch, AppError> {
        self.json(self.request(
            reqwest::Method::GET,
            &format!("/api/v0/transfers/downloads/batches/{id}"),
        ))
    }

    fn cancel(&self, username: &str, transfer_id: &str, remove: bool) -> Result<(), AppError> {
        self.empty(self.request(
            reqwest::Method::DELETE,
            &format!(
                "/api/v0/transfers/downloads/{}/{transfer_id}?remove={remove}",
                urlencoding::encode(username)
            ),
        ))
    }
}

pub fn load_settings(database: &DatabaseWorker) -> Result<AcquisitionSettings, AppError> {
    Ok(database
        .get_ui_preference(SETTINGS_KEY.into())?
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default())
}

pub fn save_settings(
    database: &DatabaseWorker,
    settings: AcquisitionSettings,
) -> Result<AcquisitionSettings, AppError> {
    validate_settings(&settings)?;
    if !matches!(settings.import_mode.as_str(), "copy" | "move") {
        return Err(AppError::new(
            "acquisition-import-mode-invalid",
            "The acquisition import mode must be copy or move.",
        ));
    }
    database.set_ui_preference(
        SETTINGS_KEY.into(),
        serde_json::to_string(&settings)
            .map_err(|error| AppError::new("acquisition-settings-invalid", error.to_string()))?,
    )?;
    Ok(settings)
}

pub fn set_api_key(value: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        return clear_api_key();
    }
    Entry::new("Bebop", CREDENTIAL_USER)
        .and_then(|entry| entry.set_password(value.trim()))
        .map_err(|error| AppError::new("credential-store-unavailable", error.to_string()))
}

pub fn clear_api_key() -> Result<(), AppError> {
    let entry = Entry::new("Bebop", CREDENTIAL_USER)
        .map_err(|error| AppError::new("credential-store-unavailable", error.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(AppError::new(
            "credential-store-unavailable",
            error.to_string(),
        )),
    }
}

fn get_api_key() -> Option<String> {
    Entry::new("Bebop", CREDENTIAL_USER)
        .and_then(|entry| entry.get_password())
        .ok()
}

fn validate_settings(settings: &AcquisitionSettings) -> Result<Url, AppError> {
    let url = Url::parse(&settings.server_url).map_err(|_| {
        AppError::new(
            "slskd-url-invalid",
            "Enter a complete slskd HTTP or HTTPS server URL.",
        )
    })?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err(AppError::new(
            "slskd-url-invalid",
            "Enter a complete slskd HTTP or HTTPS server URL.",
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::new(
            "slskd-url-credentials-forbidden",
            "Store the slskd API key in OS credentials instead of embedding credentials in the URL.",
        ));
    }
    let loopback = url
        .host_str()
        .map(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .trim_matches(['[', ']'])
                    .parse::<IpAddr>()
                    .is_ok_and(|address| address.is_loopback())
        })
        .unwrap_or(false);
    if !loopback && url.scheme() != "https" {
        return Err(AppError::new(
            "slskd-remote-requires-https",
            "Non-loopback slskd servers must use HTTPS.",
        ));
    }
    if !loopback && !settings.confirmed_remote {
        return Err(AppError::new(
            "slskd-remote-not-confirmed",
            "Confirm that you intend to send searches and credentials to this remote server.",
        ));
    }
    Ok(url)
}

pub fn test_connection(database: &DatabaseWorker) -> AcquisitionStatus {
    let settings = load_settings(database).unwrap_or_default();
    match SlskdClient::load(database).and_then(|client| client.application()) {
        Ok(application) => AcquisitionStatus {
            configured: get_api_key().is_some(),
            connected: true,
            server_url: settings.server_url,
            version: application.version,
            error: None,
        },
        Err(error) => AcquisitionStatus {
            configured: get_api_key().is_some(),
            connected: false,
            server_url: settings.server_url,
            version: None,
            error: Some(error),
        },
    }
}

pub fn start_search(
    database: &DatabaseWorker,
    query: String,
) -> Result<AcquisitionSearch, AppError> {
    let query = query.trim();
    if query.len() < 2 {
        return Err(AppError::new(
            "acquisition-search-too-short",
            "Enter at least two characters before searching.",
        ));
    }
    let search = SlskdClient::load(database)?.search(query)?;
    Ok(map_search(search))
}

pub fn get_search(database: &DatabaseWorker, id: String) -> Result<AcquisitionSearch, AppError> {
    let search = SlskdClient::load(database)?.search_results(&id)?;
    Ok(map_search(search))
}

fn map_search(search: SlskdSearch) -> AcquisitionSearch {
    let id = search.id.clone();
    AcquisitionSearch {
        id: search.id,
        query: search.search_text,
        complete: search.state & 16 != 0,
        groups: search
            .responses
            .into_iter()
            .map(|response| AcquisitionSearchGroup {
                search_id: id.clone(),
                source_user: response.username,
                upload_speed: response.upload_speed,
                queue_length: response.queue_length,
                free_upload_slot: response.has_free_upload_slot,
                files: response.files,
            })
            .collect(),
    }
}

pub fn enqueue(
    app: &AppHandle,
    database: &DatabaseWorker,
    search_id: String,
    source_user: String,
    file: AcquisitionSearchFile,
) -> Result<AcquisitionJob, AppError> {
    if AudioExtension::from_path(Path::new(&file.filename)).is_none() {
        return Err(AppError::new(
            "acquisition-format-unsupported",
            "Bebop only queues audio formats it can validate and play.",
        ));
    }
    let mut record = AcquisitionRecord {
        id: Uuid::new_v4().to_string(),
        status: AcquisitionJobStatus::Queued.as_str().into(),
        progress: 0.0,
        source_user: Some(source_user),
        target_path: None,
        provider_job_id: None,
        error: None,
        remote_filename: Some(file.filename),
        file_size: file.size,
        search_id: Some(search_id),
    };
    record.provider_job_id = Some(record.id.clone());
    database.save_acquisition_job(record.clone())?;
    match SlskdClient::load(database)?.enqueue(&record) {
        Ok(_batch) => {
            record.status = AcquisitionJobStatus::Downloading.as_str().into();
        }
        Err(error) => {
            record.status = AcquisitionJobStatus::Error.as_str().into();
            record.error = Some(error.clone());
            database.save_acquisition_job(record.clone())?;
            emit(app, &record);
            return Err(error);
        }
    }
    database.save_acquisition_job(record.clone())?;
    emit(app, &record);
    Ok(record.public())
}

pub fn list_jobs(
    app: &AppHandle,
    database: &DatabaseWorker,
) -> Result<Vec<AcquisitionJob>, AppError> {
    if let Ok(client) = SlskdClient::load(database) {
        let _ = refresh_jobs(app, database, &client);
    }
    Ok(database
        .list_acquisition_jobs()?
        .into_iter()
        .map(|record| record.public())
        .collect())
}

fn refresh_jobs(
    app: &AppHandle,
    database: &DatabaseWorker,
    client: &SlskdClient,
) -> Result<(), AppError> {
    for mut record in database
        .list_acquisition_jobs()?
        .into_iter()
        .filter(|record| matches!(record.status.as_str(), "queued" | "downloading"))
    {
        let batch_id = record.provider_job_id.as_deref().unwrap_or(&record.id);
        let Ok(batch) = client.batch(batch_id) else {
            continue;
        };
        let Some(transfer) = batch.transfers.first() else {
            continue;
        };
        record.progress = if transfer.size == 0 {
            0.0
        } else {
            transfer.bytes_transferred as f64 / transfer.size as f64
        };
        if transfer.state & 16 != 0 {
            if transfer.state & 32 != 0 {
                record.status = AcquisitionJobStatus::Verifying.as_str().into();
                record.progress = 1.0;
                record.error = None;
            } else {
                record.status = AcquisitionJobStatus::Error.as_str().into();
                record.error = Some(AppError::new(
                    "slskd-download-failed",
                    transfer
                        .exception
                        .clone()
                        .unwrap_or_else(|| "slskd could not complete the download.".into()),
                ));
            }
        } else {
            record.status = AcquisitionJobStatus::Downloading.as_str().into();
        }
        database.save_acquisition_job(record.clone())?;
        emit(app, &record);
    }
    Ok(())
}

pub fn pause(
    app: &AppHandle,
    database: &DatabaseWorker,
    id: String,
) -> Result<AcquisitionJob, AppError> {
    let mut record = database.get_acquisition_job(id)?;
    let username = required(&record.source_user, "source user")?;
    let client = SlskdClient::load(database)?;
    let transfer_id = resolve_transfer_id(&client, &record)?;
    client.cancel(username, &transfer_id, false)?;
    record.status = AcquisitionJobStatus::Paused.as_str().into();
    database.save_acquisition_job(record.clone())?;
    emit(app, &record);
    Ok(record.public())
}

pub fn resume(
    app: &AppHandle,
    database: &DatabaseWorker,
    id: String,
) -> Result<AcquisitionJob, AppError> {
    let mut record = database.get_acquisition_job(id)?;
    if record.status != "paused" && record.status != "error" {
        return Err(AppError::new(
            "acquisition-job-not-paused",
            "Only paused or failed jobs can be resumed.",
        ));
    }
    record.provider_job_id = Some(Uuid::new_v4().to_string());
    record.status = AcquisitionJobStatus::Queued.as_str().into();
    record.error = None;
    let batch = SlskdClient::load(database)?.enqueue(&record)?;
    record.provider_job_id = Some(batch.id);
    record.status = AcquisitionJobStatus::Downloading.as_str().into();
    database.save_acquisition_job(record.clone())?;
    emit(app, &record);
    Ok(record.public())
}

pub fn cancel(
    app: &AppHandle,
    database: &DatabaseWorker,
    id: String,
) -> Result<AcquisitionJob, AppError> {
    let mut record = database.get_acquisition_job(id)?;
    if matches!(record.status.as_str(), "queued" | "downloading" | "paused") {
        let client = SlskdClient::load(database)?;
        let username = required(&record.source_user, "source user")?;
        let transfer_id = resolve_transfer_id(&client, &record)?;
        client.cancel(username, &transfer_id, true)?;
    }
    record.status = AcquisitionJobStatus::Error.as_str().into();
    record.error = Some(AppError::new(
        "acquisition-cancelled",
        "The download was cancelled by the user.",
    ));
    database.save_acquisition_job(record.clone())?;
    emit(app, &record);
    Ok(record.public())
}

fn resolve_transfer_id(
    client: &SlskdClient,
    record: &AcquisitionRecord,
) -> Result<String, AppError> {
    let batch_id = record.provider_job_id.as_deref().unwrap_or(&record.id);
    let batch = client.batch(batch_id)?;
    batch
        .transfers
        .first()
        .map(|transfer| transfer.id.clone())
        .ok_or_else(|| {
            AppError::new(
                "slskd-transfer-not-found",
                "slskd has not created the transfer yet. Try again shortly.",
            )
        })
}

fn required<'a>(value: &'a Option<String>, name: &str) -> Result<&'a str, AppError> {
    value.as_deref().ok_or_else(|| {
        AppError::new(
            "acquisition-job-invalid",
            format!("The acquisition job is missing its {name}."),
        )
    })
}

pub fn import(
    app: &AppHandle,
    database: &DatabaseWorker,
    id: String,
    root_id: String,
) -> Result<(AcquisitionJob, PathBuf), AppError> {
    let settings = load_settings(database)?;
    let inbox = settings.inbox_path.as_deref().ok_or_else(|| {
        AppError::new(
            "acquisition-inbox-not-configured",
            "Choose the completed-download inbox managed by slskd before importing.",
        )
    })?;
    let inbox = Path::new(inbox)
        .canonicalize()
        .map_err(|error| AppError::new("acquisition-inbox-unavailable", error.to_string()))?;
    let mut record = database.get_acquisition_job(id)?;
    if record.status != "verifying" {
        return Err(AppError::new(
            "acquisition-download-incomplete",
            "Only completed slskd downloads can be imported.",
        ));
    }
    let remote = required(&record.remote_filename, "remote filename")?;
    let normalized_remote = remote.replace('\\', "/");
    let basename = normalized_remote
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::new(
                "acquisition-filename-invalid",
                "The downloaded filename is invalid.",
            )
        })?;
    let source = find_inbox_file(&inbox, basename, record.file_size)?;
    ensure_decodable(&source)?;
    let root = database.get_root(root_id)?;
    if !root.enabled || !matches!(root.availability, RootAvailability::Online) {
        return Err(AppError::new(
            "acquisition-root-unavailable",
            "Choose an enabled, online library root for the import.",
        ));
    }
    let canonical_root = Path::new(&root.path)
        .canonicalize()
        .map_err(|error| AppError::invalid_library_root(&root.path, error))?;
    let destination = available_destination(&canonical_root, basename)?;
    record.status = AcquisitionJobStatus::Importing.as_str().into();
    database.save_acquisition_job(record.clone())?;
    emit(app, &record);
    atomic_copy(&source, &destination)?;
    if let Err(error) = ensure_decodable(&destination) {
        let _ = fs::remove_file(&destination);
        return Err(error);
    }
    if settings.import_mode == "move" {
        fs::remove_file(&source).map_err(|error| {
            AppError::new(
                "acquisition-source-cleanup-failed",
                "The file was imported, but the slskd inbox copy could not be removed.",
            )
            .with_context("reason", error)
        })?;
    }
    record.status = AcquisitionJobStatus::Complete.as_str().into();
    record.progress = 1.0;
    record.target_path = Some(destination.to_string_lossy().into_owned());
    record.error = None;
    database.save_acquisition_job(record.clone())?;
    emit(app, &record);
    Ok((record.public(), destination))
}

fn find_inbox_file(inbox: &Path, basename: &str, size: u64) -> Result<PathBuf, AppError> {
    let mut matches = Vec::new();
    for entry in WalkDir::new(inbox)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() || entry.file_name().to_string_lossy() != basename {
            continue;
        }
        if size > 0 && entry.metadata().map(|value| value.len()).unwrap_or(0) != size {
            continue;
        }
        let canonical = entry
            .path()
            .canonicalize()
            .map_err(|error| AppError::new("acquisition-source-unavailable", error.to_string()))?;
        if canonical.starts_with(inbox) {
            matches.push(canonical);
        }
    }
    match matches.as_slice() {
        [path] => Ok(path.clone()),
        [] => Err(AppError::new(
            "acquisition-download-not-found",
            "The completed file was not found inside the configured slskd inbox.",
        )),
        _ => Err(AppError::new(
            "acquisition-download-ambiguous",
            "More than one matching file exists in the slskd inbox.",
        )),
    }
}

fn ensure_decodable(path: &Path) -> Result<(), AppError> {
    if AudioExtension::from_path(path).is_none() {
        return Err(AppError::new(
            "acquisition-format-unsupported",
            "The downloaded file has an unsupported extension.",
        ));
    }
    let file = File::open(path)
        .map_err(|error| AppError::new("acquisition-source-unavailable", error.to_string()))?;
    Decoder::try_from(BufReader::new(file)).map_err(|error| {
        AppError::new(
            "acquisition-audio-invalid",
            "The downloaded file could not be decoded as audio.",
        )
        .with_context("reason", error)
    })?;
    Ok(())
}

fn available_destination(root: &Path, basename: &str) -> Result<PathBuf, AppError> {
    let relative = Path::new(basename);
    if relative.components().count() != 1 || relative.file_name().is_none() {
        return Err(AppError::new(
            "acquisition-destination-invalid",
            "The destination filename is not a single safe path component.",
        ));
    }
    let candidate = root.join(basename);
    if !candidate.starts_with(root) {
        return Err(AppError::new(
            "acquisition-destination-invalid",
            "The destination path escaped its library root.",
        ));
    }
    if candidate.exists() {
        return Err(AppError::new(
            "acquisition-destination-exists",
            "A file with the same name already exists in the selected library root.",
        ));
    }
    Ok(candidate)
}

fn atomic_copy(source: &Path, destination: &Path) -> Result<(), AppError> {
    let parent = destination.parent().ok_or_else(|| {
        AppError::new(
            "acquisition-destination-invalid",
            "The selected import destination has no parent directory.",
        )
    })?;
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut input = File::open(source)?;
        let mut output = NamedTempFile::new_in(parent)?;
        std::io::copy(&mut input, &mut output)?;
        output.flush()?;
        output.as_file().sync_all()?;
        output.persist_noclobber(destination)?;
        Ok(())
    })();
    if let Err(error) = result {
        return Err(AppError::new(
            "acquisition-import-failed",
            "Bebop could not atomically import the completed download.",
        )
        .with_context("reason", error));
    }
    Ok(())
}

fn slskd_transport_error(error: reqwest::Error) -> AppError {
    AppError::new(
        "slskd-unreachable",
        "Bebop could not reach the configured slskd server.",
    )
    .with_context("reason", error)
}

fn slskd_response_error(status: StatusCode, message: String) -> AppError {
    let code = if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        "slskd-authentication-failed"
    } else if status == StatusCode::TOO_MANY_REQUESTS {
        "slskd-busy"
    } else {
        "slskd-request-failed"
    };
    AppError::new(code, "slskd rejected Bebop's request.")
        .with_context("status", status.as_u16())
        .with_context("reason", message)
}

fn emit(app: &AppHandle, record: &AcquisitionRecord) {
    let _ = app.emit(PROGRESS_EVENT, record.public());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_loopback_and_off_device_requires_https_and_confirmation() {
        assert!(validate_settings(&AcquisitionSettings::default()).is_ok());
        let mut remote = AcquisitionSettings {
            server_url: "http://music.example.test:5030".into(),
            ..Default::default()
        };
        assert_eq!(
            validate_settings(&remote)
                .expect_err("plain remote HTTP rejected")
                .code,
            "slskd-remote-requires-https"
        );
        remote.server_url = "https://music.example.test".into();
        assert_eq!(
            validate_settings(&remote)
                .expect_err("confirmation required")
                .code,
            "slskd-remote-not-confirmed"
        );
        remote.confirmed_remote = true;
        assert!(validate_settings(&remote).is_ok());
    }

    #[test]
    fn inbox_search_rejects_ambiguous_matches() {
        let temp = tempfile::tempdir().expect("temp directory");
        fs::create_dir_all(temp.path().join("a")).expect("first directory");
        fs::create_dir_all(temp.path().join("b")).expect("second directory");
        fs::write(temp.path().join("a/song.flac"), b"same").expect("first file");
        fs::write(temp.path().join("b/song.flac"), b"same").expect("second file");
        assert_eq!(
            find_inbox_file(temp.path(), "song.flac", 4)
                .expect_err("ambiguous files rejected")
                .code,
            "acquisition-download-ambiguous"
        );
    }

    #[test]
    fn import_guards_reject_invalid_audio_and_escaped_destinations() {
        let temp = tempfile::tempdir().expect("temp directory");
        let invalid_audio = temp.path().join("download.flac");
        fs::write(&invalid_audio, b"not audio").expect("invalid audio fixture");
        assert_eq!(
            ensure_decodable(&invalid_audio)
                .expect_err("malformed download rejected")
                .code,
            "acquisition-audio-invalid"
        );
        assert_eq!(
            available_destination(temp.path(), "../escaped.flac")
                .expect_err("escaped path rejected")
                .code,
            "acquisition-destination-invalid"
        );
    }
}
