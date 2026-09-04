use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::Duration,
};

use discord_presence::Client as DiscordClient;
use keyring::Entry;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};

use crate::{AppError, TrackSummary, persistence::DatabaseWorker};

const SETTINGS_KEY: &str = "integrations.settings";
const LASTFM_CREDENTIAL_USER: &str = "lastfm-session";
const INTEGRATION_STATUS_EVENT: &str = "integration://status";

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct IntegrationSettings {
    pub lastfm_enabled: bool,
    /// Separate from `lastfm_enabled`: a user may want top-tag lookups for
    /// the playlist tag picker without scrobbling, or vice versa. Needs only
    /// the app's Last.fm API key (`track.getTopTags` is unauthenticated),
    /// not a connected session, so it works independently of scrobbling too.
    pub lastfm_tag_lookup_enabled: bool,
    pub discord_enabled: bool,
    pub discord_detail: String,
}

impl Default for IntegrationSettings {
    fn default() -> Self {
        Self {
            lastfm_enabled: false,
            lastfm_tag_lookup_enabled: false,
            discord_enabled: false,
            discord_detail: "full".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    pub service: String,
    pub enabled: bool,
    pub configured: bool,
    pub connected: bool,
    pub pending_jobs: u64,
    pub last_error: Option<AppError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct LastFmScrobble {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub musicbrainz_id: Option<String>,
    pub track_number: Option<u32>,
    pub duration_seconds: u64,
    pub started_at: i64,
}

#[derive(Clone, Debug)]
pub(crate) struct IntegrationJob {
    pub id: String,
    pub payload_json: String,
    pub attempts: u32,
}

enum Message {
    NowPlaying(TrackSummary, i64),
    QueueScrobble(String, TrackSummary, i64),
    ClearPresence,
    SettingsChanged,
    Shutdown,
}

#[derive(Clone)]
pub(crate) struct IntegrationManager {
    settings: Arc<Mutex<IntegrationSettings>>,
    statuses: Arc<Mutex<Vec<IntegrationStatus>>>,
    sender: mpsc::Sender<Message>,
}

impl IntegrationManager {
    pub(crate) fn start(app: AppHandle, database: DatabaseWorker) -> Self {
        let settings = database
            .get_ui_preference(SETTINGS_KEY.into())
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();
        let settings = Arc::new(Mutex::new(settings));
        let statuses = Arc::new(Mutex::new(initial_statuses(&settings)));
        let (sender, receiver) = mpsc::channel();
        spawn_worker(
            app,
            database,
            Arc::clone(&settings),
            Arc::clone(&statuses),
            receiver,
        );
        Self {
            settings,
            statuses,
            sender,
        }
    }

    pub(crate) fn settings(&self) -> Result<IntegrationSettings, AppError> {
        self.settings
            .lock()
            .map(|settings| settings.clone())
            .map_err(|_| AppError::state_unavailable("integration-settings"))
    }

    pub(crate) fn update_settings(
        &self,
        database: &DatabaseWorker,
        settings: IntegrationSettings,
    ) -> Result<IntegrationSettings, AppError> {
        if !matches!(settings.discord_detail.as_str(), "full" | "private") {
            return Err(AppError::new(
                "discord-detail-invalid",
                "Discord sharing must be full or private.",
            ));
        }
        database.set_ui_preference(
            SETTINGS_KEY.into(),
            serde_json::to_string(&settings).map_err(|error| {
                AppError::new("integration-settings-invalid", error.to_string())
            })?,
        )?;
        *self
            .settings
            .lock()
            .map_err(|_| AppError::state_unavailable("integration-settings"))? = settings.clone();
        let _ = self.sender.send(Message::SettingsChanged);
        Ok(settings)
    }

    pub(crate) fn statuses(&self) -> Result<Vec<IntegrationStatus>, AppError> {
        self.statuses
            .lock()
            .map(|statuses| statuses.clone())
            .map_err(|_| AppError::state_unavailable("integration-status"))
    }

    pub(crate) fn now_playing(&self, track: TrackSummary, started_at: i64) {
        let _ = self.sender.send(Message::NowPlaying(track, started_at));
    }

    pub(crate) fn queue_scrobble(&self, session_id: String, track: TrackSummary, started_at: i64) {
        let _ = self
            .sender
            .send(Message::QueueScrobble(session_id, track, started_at));
    }

    pub(crate) fn clear_presence(&self) {
        let _ = self.sender.send(Message::ClearPresence);
    }

    pub(crate) fn refresh(&self) {
        let _ = self.sender.send(Message::SettingsChanged);
    }

    pub(crate) fn shutdown(&self) {
        let _ = self.sender.send(Message::Shutdown);
    }
}

pub(crate) fn set_lastfm_session(session_key: &str) -> Result<(), AppError> {
    if session_key.trim().is_empty() {
        return Err(AppError::new(
            "lastfm-session-empty",
            "A Last.fm session key is required.",
        ));
    }
    Entry::new("Bebop", LASTFM_CREDENTIAL_USER)
        .and_then(|entry| entry.set_password(session_key.trim()))
        .map_err(|error| AppError::new("credential-store-unavailable", error.to_string()))
}

pub(crate) fn clear_lastfm_session() -> Result<(), AppError> {
    let entry = Entry::new("Bebop", LASTFM_CREDENTIAL_USER)
        .map_err(|error| AppError::new("credential-store-unavailable", error.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(AppError::new(
            "credential-store-unavailable",
            error.to_string(),
        )),
    }
}

fn get_lastfm_session() -> Option<String> {
    Entry::new("Bebop", LASTFM_CREDENTIAL_USER)
        .and_then(|entry| entry.get_password())
        .ok()
}

fn initial_statuses(settings: &Arc<Mutex<IntegrationSettings>>) -> Vec<IntegrationStatus> {
    let settings = settings
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    vec![
        IntegrationStatus {
            service: "lastfm".into(),
            enabled: settings.lastfm_enabled,
            configured: settings.lastfm_enabled
                && lastfm_api_credentials().is_some()
                && get_lastfm_session().is_some(),
            connected: false,
            pending_jobs: 0,
            last_error: None,
        },
        IntegrationStatus {
            service: "discord".into(),
            enabled: settings.discord_enabled,
            configured: discord_application_id().is_some(),
            connected: false,
            pending_jobs: 0,
            last_error: None,
        },
    ]
}

fn spawn_worker(
    app: AppHandle,
    database: DatabaseWorker,
    settings: Arc<Mutex<IntegrationSettings>>,
    statuses: Arc<Mutex<Vec<IntegrationStatus>>>,
    receiver: mpsc::Receiver<Message>,
) {
    thread::Builder::new()
        .name("bebop-integrations".into())
        .spawn(move || {
            let client = Client::builder()
                .user_agent("Bebop/0.1 (local music player)")
                .timeout(Duration::from_secs(10))
                .build()
                .expect("integration HTTP client");
            let mut discord: Option<DiscordClient> = None;
            loop {
                match receiver.recv_timeout(Duration::from_secs(10)) {
                    Ok(Message::NowPlaying(track, started_at)) => {
                        let current = settings
                            .lock()
                            .map(|value| value.clone())
                            .unwrap_or_default();
                        if current.lastfm_enabled && eligible_for_online_metadata(&track) {
                            let result = send_now_playing(&client, &track);
                            update_status(&app, &statuses, "lastfm", result, 0);
                        }
                        if current.discord_enabled {
                            let result = set_discord_presence(
                                &mut discord,
                                &track,
                                started_at,
                                &current.discord_detail,
                            );
                            update_status(&app, &statuses, "discord", result, 0);
                        }
                    }
                    Ok(Message::QueueScrobble(id, track, started_at)) => {
                        let current = settings
                            .lock()
                            .map(|value| value.clone())
                            .unwrap_or_default();
                        if current.lastfm_enabled && eligible_for_online_metadata(&track) {
                            let payload = LastFmScrobble::from_track(&track, started_at);
                            if let Ok(json) = serde_json::to_string(&payload) {
                                let _ = database.enqueue_integration_job(
                                    id,
                                    "lastfm".into(),
                                    "scrobble".into(),
                                    json,
                                );
                            }
                        }
                    }
                    Ok(Message::ClearPresence) => clear_discord(&mut discord),
                    Ok(Message::SettingsChanged) => {
                        let current = settings
                            .lock()
                            .map(|value| value.clone())
                            .unwrap_or_default();
                        if !current.discord_enabled {
                            clear_discord(&mut discord);
                        }
                        refresh_status_configuration(&app, &database, &settings, &statuses);
                    }
                    Ok(Message::Shutdown) => {
                        clear_discord(&mut discord);
                        if let Some(client) = discord.take() {
                            let _ = client.shutdown();
                        }
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                flush_lastfm_outbox(&app, &client, &database, &settings, &statuses);
            }
        })
        .expect("spawn integration worker");
}

impl LastFmScrobble {
    fn from_track(track: &TrackSummary, started_at: i64) -> Self {
        Self {
            track_id: track.id.clone(),
            title: track.title.clone(),
            artist: track
                .artists
                .first()
                .map(|artist| artist.name.clone())
                .unwrap_or_else(|| "Unknown Artist".into()),
            album: track.album.clone(),
            album_artist: track
                .album_artists
                .first()
                .map(|artist| artist.name.clone()),
            musicbrainz_id: track.musicbrainz_recording_id.clone(),
            track_number: track.track_number,
            duration_seconds: track.duration_ms.unwrap_or(0) / 1_000,
            started_at,
        }
    }
}

pub(crate) fn qualifies_for_scrobble(duration_ms: u64, played_ms: u64) -> bool {
    duration_ms > 30_000 && played_ms >= (duration_ms / 2).min(240_000)
}

fn flush_lastfm_outbox(
    app: &AppHandle,
    client: &Client,
    database: &DatabaseWorker,
    settings: &Arc<Mutex<IntegrationSettings>>,
    statuses: &Arc<Mutex<Vec<IntegrationStatus>>>,
) {
    if !settings
        .lock()
        .map(|value| value.lastfm_enabled)
        .unwrap_or(false)
    {
        return;
    }
    let jobs = match database.pending_integration_jobs("lastfm".into(), 50) {
        Ok(jobs) => jobs,
        Err(_) => return,
    };
    let pending = jobs.len() as u64;
    for job in jobs {
        let result = serde_json::from_str::<LastFmScrobble>(&job.payload_json)
            .map_err(|error| AppError::new("lastfm-payload-invalid", error.to_string()))
            .and_then(|payload| send_scrobble(client, &payload));
        match &result {
            Ok(()) => {
                let _ = database.complete_integration_job(job.id.clone());
            }
            Err(error) => {
                let retry = matches!(
                    error.code.as_str(),
                    "lastfm-offline" | "lastfm-temporary" | "lastfm-session-invalid"
                );
                let _ = database.fail_integration_job(
                    job.id.clone(),
                    job.attempts,
                    error.clone(),
                    retry,
                );
                if !retry {
                    update_status(app, statuses, "lastfm", result, pending);
                    break;
                }
            }
        }
    }
    if pending > 0 {
        update_status(app, statuses, "lastfm", Ok(()), pending);
    }
}

fn send_now_playing(client: &Client, track: &TrackSummary) -> Result<(), AppError> {
    let mut params = track_params(track);
    params.insert("method".into(), "track.updateNowPlaying".into());
    send_lastfm(client, params)
}

fn send_scrobble(client: &Client, scrobble: &LastFmScrobble) -> Result<(), AppError> {
    let mut params = BTreeMap::from([
        ("method".into(), "track.scrobble".into()),
        ("artist".into(), scrobble.artist.clone()),
        ("track".into(), scrobble.title.clone()),
        ("album".into(), scrobble.album.clone()),
        ("timestamp".into(), scrobble.started_at.to_string()),
        ("duration".into(), scrobble.duration_seconds.to_string()),
    ]);
    if let Some(value) = &scrobble.album_artist {
        params.insert("albumArtist".into(), value.clone());
    }
    if let Some(value) = &scrobble.musicbrainz_id {
        params.insert("mbid".into(), value.clone());
    }
    if let Some(value) = scrobble.track_number {
        params.insert("trackNumber".into(), value.to_string());
    }
    send_lastfm(client, params)
}

fn track_params(track: &TrackSummary) -> BTreeMap<String, String> {
    let mut params = BTreeMap::from([
        (
            "artist".into(),
            track
                .artists
                .first()
                .map(|artist| artist.name.clone())
                .unwrap_or_else(|| "Unknown Artist".into()),
        ),
        ("track".into(), track.title.clone()),
        ("album".into(), track.album.clone()),
    ]);
    if let Some(duration_ms) = track.duration_ms {
        params.insert("duration".into(), (duration_ms / 1_000).to_string());
    }
    if let Some(value) = track.album_artists.first() {
        params.insert("albumArtist".into(), value.name.clone());
    }
    if let Some(value) = &track.musicbrainz_recording_id {
        params.insert("mbid".into(), value.clone());
    }
    if let Some(value) = track.track_number {
        params.insert("trackNumber".into(), value.to_string());
    }
    params
}

fn send_lastfm(client: &Client, mut params: BTreeMap<String, String>) -> Result<(), AppError> {
    let (api_key, secret) = lastfm_api_credentials().ok_or_else(|| {
        AppError::new(
            "lastfm-not-configured",
            "This build does not include a Last.fm application key.",
        )
    })?;
    let session = get_lastfm_session().ok_or_else(|| {
        AppError::new(
            "lastfm-not-authenticated",
            "Connect a Last.fm account before enabling scrobbling.",
        )
    })?;
    params.insert("api_key".into(), api_key);
    params.insert("sk".into(), session);
    let signature_input = params
        .iter()
        .map(|(key, value)| format!("{key}{value}"))
        .collect::<String>();
    let signature = format!("{:x}", md5::compute(format!("{signature_input}{secret}")));
    params.insert("api_sig".into(), signature);
    params.insert("format".into(), "json".into());
    let response = client
        .post("https://ws.audioscrobbler.com/2.0/")
        .form(&params)
        .send()
        .map_err(|error| AppError::new("lastfm-offline", error.to_string()))?;
    let status = response.status();
    let body: serde_json::Value = response.json().map_err(|error| {
        AppError::new(
            if status.is_server_error() {
                "lastfm-temporary"
            } else {
                "lastfm-response-invalid"
            },
            error.to_string(),
        )
    })?;
    if let Some(code) = body.get("error").and_then(serde_json::Value::as_i64) {
        let error_code = if matches!(code, 11 | 16 | 29) {
            "lastfm-temporary"
        } else if code == 9 {
            "lastfm-session-invalid"
        } else {
            "lastfm-request-rejected"
        };
        return Err(AppError::new(
            error_code,
            body.get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Last.fm rejected the request."),
        ));
    }
    Ok(())
}

/// Reads the persisted integration settings directly, without needing a live
/// `IntegrationManager` — the metadata job loop only needs this one flag and
/// shouldn't have to thread the whole manager through its call chain.
pub(crate) fn lastfm_tag_lookup_enabled(database: &DatabaseWorker) -> bool {
    database
        .get_ui_preference(SETTINGS_KEY.into())
        .ok()
        .flatten()
        .and_then(|json| serde_json::from_str::<IntegrationSettings>(&json).ok())
        .is_some_and(|settings| settings.lastfm_tag_lookup_enabled)
}

/// `track.getTopTags` needs only the app's API key — no session, no
/// signature — so this stays a stateless free function independent of
/// whether scrobbling is connected.
pub(crate) fn fetch_lastfm_top_tags(track: &TrackSummary) -> Result<Vec<String>, AppError> {
    if !eligible_for_online_metadata(track) {
        return Ok(Vec::new());
    }
    let (api_key, _) = lastfm_api_credentials().ok_or_else(|| {
        AppError::new(
            "lastfm-not-configured",
            "This build does not include a Last.fm application key.",
        )
    })?;
    let artist = track
        .artists
        .first()
        .map(|artist| artist.name.as_str())
        .unwrap_or("Unknown Artist");
    let client = Client::new();
    let response = client
        .get("https://ws.audioscrobbler.com/2.0/")
        .query(&[
            ("method", "track.gettoptags"),
            ("artist", artist),
            ("track", track.title.as_str()),
            ("api_key", api_key.as_str()),
            ("format", "json"),
        ])
        .send()
        .map_err(|error| AppError::new("lastfm-offline", error.to_string()))?;
    if !response.status().is_success() {
        return Err(AppError::new(
            "lastfm-request-failed",
            format!("Last.fm returned HTTP {}.", response.status()),
        ));
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|error| AppError::new("lastfm-response-invalid", error.to_string()))?;
    let tags = body
        .get("toptags")
        .and_then(|value| value.get("tag"))
        .and_then(serde_json::Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.get("name").and_then(serde_json::Value::as_str))
                .map(str::to_string)
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    Ok(tags)
}

fn eligible_for_online_metadata(track: &TrackSummary) -> bool {
    !track.title.trim().is_empty()
        && track
            .artists
            .first()
            .is_some_and(|artist| !artist.name.eq_ignore_ascii_case("Unknown Artist"))
}

fn set_discord_presence(
    client: &mut Option<DiscordClient>,
    track: &TrackSummary,
    started_at: i64,
    detail: &str,
) -> Result<(), AppError> {
    if client.is_none() {
        let application_id = discord_application_id().ok_or_else(|| {
            AppError::new(
                "discord-not-configured",
                "This build does not include a Discord application ID.",
            )
        })?;
        let mut new_client =
            DiscordClient::with_error_config(application_id, Duration::from_secs(5), Some(1));
        new_client.start();
        *client = Some(new_client);
    }
    let artist = track
        .artists
        .first()
        .map(|artist| artist.name.as_str())
        .unwrap_or("Unknown Artist");
    client
        .as_mut()
        .expect("discord client initialized")
        .set_activity(|activity| {
            if detail == "private" {
                activity.details("Listening locally")
            } else {
                activity
                    .details(track.title.clone())
                    .state(format!("{artist} — {}", track.album))
                    .timestamps(|timestamps| timestamps.start(started_at.max(0) as u64))
            }
        })
        .map(|_| ())
        .map_err(|error| AppError::new("discord-unavailable", error.to_string()))
}

fn clear_discord(client: &mut Option<DiscordClient>) {
    if let Some(client) = client {
        let _ = client.clear_activity();
    }
}

fn update_status(
    app: &AppHandle,
    statuses: &Arc<Mutex<Vec<IntegrationStatus>>>,
    service: &str,
    result: Result<(), AppError>,
    pending_jobs: u64,
) {
    let Ok(mut statuses) = statuses.lock() else {
        return;
    };
    let Some(status) = statuses.iter_mut().find(|status| status.service == service) else {
        return;
    };
    status.connected = result.is_ok();
    status.pending_jobs = pending_jobs;
    status.last_error = result.err();
    let _ = app.emit(INTEGRATION_STATUS_EVENT, status.clone());
}

fn refresh_status_configuration(
    app: &AppHandle,
    database: &DatabaseWorker,
    settings: &Arc<Mutex<IntegrationSettings>>,
    statuses: &Arc<Mutex<Vec<IntegrationStatus>>>,
) {
    let current = settings
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    let pending = database
        .pending_integration_jobs("lastfm".into(), 50)
        .map(|jobs| jobs.len() as u64)
        .unwrap_or(0);
    let Ok(mut values) = statuses.lock() else {
        return;
    };
    for status in values.iter_mut() {
        match status.service.as_str() {
            "lastfm" => {
                status.enabled = current.lastfm_enabled;
                status.configured = current.lastfm_enabled
                    && lastfm_api_credentials().is_some()
                    && get_lastfm_session().is_some();
                status.pending_jobs = pending;
            }
            "discord" => {
                status.enabled = current.discord_enabled;
                status.configured = discord_application_id().is_some();
            }
            _ => {}
        }
        let _ = app.emit(INTEGRATION_STATUS_EVENT, status.clone());
    }
}

fn lastfm_api_credentials() -> Option<(String, String)> {
    let key = option_env!("BEBOP_LASTFM_API_KEY")
        .map(str::to_owned)
        .or_else(|| std::env::var("BEBOP_LASTFM_API_KEY").ok())?;
    let secret = option_env!("BEBOP_LASTFM_API_SECRET")
        .map(str::to_owned)
        .or_else(|| std::env::var("BEBOP_LASTFM_API_SECRET").ok())?;
    Some((key, secret))
}

fn discord_application_id() -> Option<u64> {
    option_env!("BEBOP_DISCORD_APPLICATION_ID")
        .map(str::to_owned)
        .or_else(|| std::env::var("BEBOP_DISCORD_APPLICATION_ID").ok())
        .and_then(|value| value.parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lastfm_threshold_uses_half_or_four_minutes_and_rejects_short_tracks() {
        assert!(!qualifies_for_scrobble(30_000, 30_000));
        assert!(!qualifies_for_scrobble(180_000, 89_999));
        assert!(qualifies_for_scrobble(180_000, 90_000));
        assert!(!qualifies_for_scrobble(600_000, 239_999));
        assert!(qualifies_for_scrobble(600_000, 240_000));
    }

    #[test]
    fn integrations_are_private_and_disabled_by_default() {
        let settings = IntegrationSettings::default();
        assert!(!settings.lastfm_enabled);
        assert!(!settings.discord_enabled);
    }
}
