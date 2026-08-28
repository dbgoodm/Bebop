use std::{
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use keyring::Entry;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    AppError, MetadataDiff, MetadataPatch, TrackSummary,
    fingerprint::{AudioFingerprint, fingerprint_path},
    metadata::read_metadata_patch,
    metadata_jobs::diff_patch,
    persistence::DatabaseWorker,
};

const ACOUSTID_CREDENTIAL_USER: &str = "acoustid-client-key";

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentCandidate {
    pub recording_id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub release_id: Option<String>,
    pub release: Option<String>,
    pub album_artists: Vec<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub isrcs: Vec<String>,
    pub duration_ms: Option<u64>,
    pub score: u16,
    pub source: String,
    pub confidence: f64,
    pub confidence_reasons: Vec<String>,
    pub diffs: Vec<MetadataDiff>,
    pub requires_review: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentJob {
    pub track_id: String,
    pub status: String,
    pub candidates: Vec<EnrichmentCandidate>,
    pub auto_applied: bool,
    pub from_cache: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[allow(dead_code)] // Stage 3 consumes this seam when artist profiles are wired.
pub(crate) struct ArtistRecord {
    pub raw_json: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbReleaseGroupResponse {
    #[serde(rename = "release-group-count")]
    pub count: Option<usize>,
    #[serde(rename = "release-group-offset")]
    pub offset: Option<usize>,
    #[serde(rename = "release-groups")]
    pub release_groups: Vec<MbReleaseGroup>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbReleaseGroup {
    pub id: String,
    pub title: String,
    #[serde(rename = "primary-type")]
    pub primary_type: Option<String>,
    #[serde(rename = "secondary-types")]
    pub secondary_types: Option<Vec<String>>,
    #[serde(rename = "first-release-date")]
    pub first_release_date: Option<String>,
    pub disambiguation: Option<String>,
    #[serde(rename = "artist-credit")]
    pub artist_credit: Option<Vec<MbArtistCredit>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbArtistCredit {
    pub name: Option<String>,
    pub artist: Option<MbArtistReference>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbArtistReference {
    pub id: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "sort-name")]
    pub sort_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbArtistSearchResponse {
    #[serde(default)]
    pub artists: Vec<MbArtistSearchItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscographySyncProgress {
    pub total: u32,
    pub processed: u32,
    pub refreshed: u32,
    pub skipped: u32,
    pub failed: u32,
    pub current_artist: Option<String>,
    pub complete: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbReleaseBrowseResponse {
    #[serde(default)]
    pub releases: Vec<MbRelease>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbRelease {
    pub id: String,
    pub title: String,
    pub date: Option<String>,
    pub country: Option<String>,
    #[serde(default)]
    pub media: Vec<MbMedium>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbMedium {
    pub position: Option<u32>,
    #[serde(default)]
    pub tracks: Vec<MbTrack>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbTrack {
    pub position: Option<u32>,
    pub title: String,
    pub length: Option<u64>,
    pub recording: Option<MbRecordingRef>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbRecordingRef {
    pub id: String,
    pub length: Option<u64>,
    #[serde(default)]
    pub isrcs: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct MbArtistSearchItem {
    pub id: String,
    pub name: String,
    pub score: Option<u32>,
}

pub(crate) struct MusicBrainzClient {
    enabled: AtomicBool,
    client: Client,
    last_request: Mutex<Option<Instant>>,
    database: Mutex<Option<DatabaseWorker>>,
}

impl Default for MusicBrainzClient {
    fn default() -> Self {
        Self {
            // Album pages depend on MusicBrainz tracklists to show tracks that
            // are not in the local library. Keep catalog enrichment available
            // from startup so opening a remote release can populate and cache
            // its tracklist without a separate, unreachable opt-in step.
            enabled: AtomicBool::new(true),
            client: Client::builder()
                .user_agent(format!(
                    "Bebop/{} (https://github.com/dbgoodm/Bebop)",
                    env!("CARGO_PKG_VERSION")
                ))
                .build()
                .expect("valid MusicBrainz HTTP client"),
            last_request: Mutex::new(None),
            database: Mutex::new(None),
        }
    }
}

impl MusicBrainzClient {
    pub(crate) fn attach_database(&self, database: DatabaseWorker) {
        if let Ok(mut attached) = self.database.lock() {
            *attached = Some(database);
        }
    }

    pub(crate) fn fetch_artist_discography(
        &self,
        mbid: &str,
        artist_name: &str,
    ) -> Result<Vec<crate::persistence::RemoteReleasePayload>, AppError> {
        let mut offset = 0;
        let limit = 100;
        let mut all_releases = Vec::new();
        loop {
            let cache_key = format!("discography:{mbid}:{offset}");
            let database = self
                .database
                .lock()
                .map_err(|_| AppError::state_unavailable("musicbrainz-database"))?
                .clone();
            let raw_json = if let Some(database) = database.as_ref()
                && let Some(cached) = database.get_enrichment_cache(cache_key.clone())?
            {
                cached
            } else {
                self.wait_for_rate_limit()?;
                let response = self
                    .client
                    .get("https://musicbrainz.org/ws/2/release-group")
                    .query(&[
                        ("artist", mbid),
                        ("limit", &limit.to_string()),
                        ("offset", &offset.to_string()),
                        ("fmt", "json"),
                    ])
                    .send()
                    .map_err(|error| {
                        AppError::new("musicbrainz-request-failed", error.to_string())
                    })?;
                if !response.status().is_success() {
                    return Err(AppError::new(
                        "musicbrainz-request-failed",
                        format!("MusicBrainz returned HTTP {}.", response.status()),
                    ));
                }
                let text = response.text().map_err(|error| {
                    AppError::new("musicbrainz-response-invalid", error.to_string())
                })?;
                if let Some(database) = database {
                    let _ = database.save_enrichment_cache(None, cache_key, text.clone());
                }
                text
            };
            let body: MbReleaseGroupResponse =
                serde_json::from_str(&raw_json).map_err(|error| {
                    AppError::new("musicbrainz-response-invalid", error.to_string())
                })?;
            let total_count = body.count.unwrap_or(0);
            let batch_len = body.release_groups.len();
            for rg in body.release_groups {
                let raw_json = serde_json::to_string(&rg).unwrap_or_default();
                let year = rg
                    .first_release_date
                    .as_deref()
                    .and_then(|d| d.get(0..4))
                    .and_then(|y| y.parse::<u32>().ok());
                let artists: Vec<crate::ArtistReference> =
                    rg.artist_credit
                        .as_ref()
                        .map(|credits| {
                            credits
                                .iter()
                                .filter_map(|c| {
                                    let name = c.name.clone().or_else(|| {
                                        c.artist.as_ref().and_then(|a| a.name.clone())
                                    })?;
                                    let id = c
                                        .artist
                                        .as_ref()
                                        .and_then(|a| a.id.clone())
                                        .unwrap_or_default();
                                    Some(crate::ArtistReference { id, name })
                                })
                                .collect()
                        })
                        .unwrap_or_else(|| {
                            vec![crate::ArtistReference {
                                id: mbid.to_string(),
                                name: artist_name.to_string(),
                            }]
                        });
                let artwork_url = format!(
                    "https://coverartarchive.org/release-group/{}/front-250",
                    rg.id
                );
                all_releases.push(crate::persistence::RemoteReleasePayload {
                    id: format!("remote:{}", rg.id),
                    musicbrainz_release_group_id: rg.id,
                    title: rg.title,
                    year,
                    date: rg.first_release_date,
                    primary_type: rg.primary_type,
                    secondary_types: rg.secondary_types.unwrap_or_default(),
                    disambiguation: rg.disambiguation,
                    catalog_number: None,
                    label: None,
                    artwork_url: Some(artwork_url),
                    artwork_attribution: Some("Cover Art Archive".into()),
                    artwork_source: Some("coverartarchive.org".into()),
                    artists,
                    raw_json,
                });
            }
            offset += batch_len;
            if offset >= total_count || batch_len == 0 || offset >= 500 {
                break;
            }
        }
        Ok(all_releases)
    }

    pub(crate) fn search_artist_mbid(&self, artist_name: &str) -> Result<Option<String>, AppError> {
        self.wait_for_rate_limit()?;
        let query = format!("artist:\"{}\"", artist_name);
        let response = self
            .client
            .get("https://musicbrainz.org/ws/2/artist")
            .query(&[("query", query.as_str()), ("fmt", "json"), ("limit", "5")])
            .send()
            .map_err(|error| AppError::new("musicbrainz-request-failed", error.to_string()))?;
        if !response.status().is_success() {
            return Err(AppError::new(
                "musicbrainz-request-failed",
                format!("MusicBrainz returned HTTP {}.", response.status()),
            ));
        }
        let body: MbArtistSearchResponse = response
            .json()
            .map_err(|error| AppError::new("musicbrainz-response-invalid", error.to_string()))?;
        let normalized = artist_name.trim().to_lowercase();
        for artist in body.artists {
            if artist.name.trim().to_lowercase() == normalized {
                return Ok(Some(artist.id));
            }
        }
        Ok(None)
    }

    #[allow(dead_code)] // Shared, cached provider access for the pending artist-profile follow-up.
    pub(crate) fn fetch_artist_record(&self, mbid: &str) -> Result<ArtistRecord, AppError> {
        let cache_key = format!("artist:{mbid}");
        let database = self
            .database
            .lock()
            .map_err(|_| AppError::state_unavailable("musicbrainz-database"))?
            .clone();
        if let Some(database) = database.as_ref()
            && let Some(raw_json) = database.get_enrichment_cache(cache_key.clone())?
        {
            return Ok(ArtistRecord { raw_json });
        }
        self.wait_for_rate_limit()?;
        let response = self
            .client
            .get(format!("https://musicbrainz.org/ws/2/artist/{mbid}"))
            .query(&[("inc", "aliases+tags+url-rels"), ("fmt", "json")])
            .send()
            .map_err(|error| AppError::new("musicbrainz-request-failed", error.to_string()))?;
        if !response.status().is_success() {
            return Err(AppError::new(
                "musicbrainz-request-failed",
                format!("MusicBrainz returned HTTP {}.", response.status()),
            ));
        }
        let raw_json = response
            .text()
            .map_err(|error| AppError::new("musicbrainz-response-invalid", error.to_string()))?;
        serde_json::from_str::<serde_json::Value>(&raw_json)
            .map_err(|error| AppError::new("musicbrainz-response-invalid", error.to_string()))?;
        if let Some(database) = database {
            database.save_enrichment_cache(None, cache_key, raw_json.clone())?;
        }
        Ok(ArtistRecord { raw_json })
    }

    pub(crate) fn set_acoustid_key(&self, value: &str) -> Result<(), AppError> {
        if value.trim().is_empty() {
            let entry = Entry::new("Bebop", ACOUSTID_CREDENTIAL_USER)
                .map_err(credential_error("open-acoustid-credential"))?;
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(error) => Err(AppError::new(
                    "acoustid-credential-failed",
                    error.to_string(),
                )),
            }
        } else {
            Entry::new("Bebop", ACOUSTID_CREDENTIAL_USER)
                .and_then(|entry| entry.set_password(value.trim()))
                .map_err(credential_error("save-acoustid-credential"))
        }
    }

    pub(crate) fn acoustid_configured(&self) -> bool {
        self.acoustid_key().is_ok_and(|value| !value.is_empty())
    }

    fn acoustid_key(&self) -> Result<String, AppError> {
        Entry::new("Bebop", ACOUSTID_CREDENTIAL_USER)
            .and_then(|entry| entry.get_password())
            .map_err(credential_error("read-acoustid-credential"))
    }

    pub(crate) fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Release);
    }

    pub(crate) fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    fn search(&self, track: &TrackSummary) -> Result<Vec<EnrichmentCandidate>, AppError> {
        if !self.enabled() {
            return Err(AppError::new(
                "musicbrainz-disabled",
                "MusicBrainz enrichment is disabled. Enable it explicitly in Settings.",
            ));
        }
        let artist = track
            .artists
            .first()
            .map(|artist| artist.name.as_str())
            .unwrap_or("");
        let query = format!(
            "recording:\"{}\" AND artist:\"{}\" AND release:\"{}\"",
            track.title, artist, track.album
        );
        for attempt in 0..3 {
            self.wait_for_rate_limit()?;
            let response = self
                .client
                .get("https://musicbrainz.org/ws/2/recording")
                .query(&[("query", query.as_str()), ("fmt", "json"), ("limit", "10")])
                .send()
                .map_err(|error| AppError::new("musicbrainz-request-failed", error.to_string()))?;
            if response.status().as_u16() == 503 && attempt < 2 {
                thread::sleep(Duration::from_secs(1_u64 << attempt));
                continue;
            }
            if !response.status().is_success() {
                return Err(AppError::new(
                    "musicbrainz-request-failed",
                    format!("MusicBrainz returned HTTP {}.", response.status()),
                ));
            }
            let body: SearchResponse = response.json().map_err(|error| {
                AppError::new("musicbrainz-response-invalid", error.to_string())
            })?;
            let mut candidates: Vec<_> = body
                .recordings
                .into_iter()
                .flat_map(|recording| candidates_from_recording(track, recording))
                .collect();
            set_candidate_source(&mut candidates, "text-search", 0.0);
            return Ok(candidates);
        }
        Err(AppError::new(
            "musicbrainz-unavailable",
            "MusicBrainz remained unavailable after retrying.",
        ))
    }

    fn recording(&self, recording_id: &str) -> Result<SearchRecording, AppError> {
        self.wait_for_rate_limit()?;
        let response = self
            .client
            .get(format!(
                "https://musicbrainz.org/ws/2/recording/{recording_id}"
            ))
            .query(&[
                ("inc", "artist-credits+releases+release-groups+media+isrcs"),
                ("fmt", "json"),
            ])
            .send()
            .map_err(|error| AppError::new("musicbrainz-request-failed", error.to_string()))?;
        if response.status().as_u16() == 404 {
            return Err(AppError::new(
                "musicbrainz-recording-not-found",
                "The embedded or AcoustID recording MBID no longer resolves.",
            ));
        }
        if !response.status().is_success() {
            return Err(AppError::new(
                "musicbrainz-request-failed",
                format!("MusicBrainz returned HTTP {}.", response.status()),
            ));
        }
        response
            .json()
            .map_err(|error| AppError::new("musicbrainz-response-invalid", error.to_string()))
    }

    fn acoustid_recordings(
        &self,
        fingerprint: &AudioFingerprint,
    ) -> Result<Vec<(String, f64)>, AppError> {
        let key = self.acoustid_key()?;
        let duration = fingerprint.duration_seconds.to_string();
        let response = self
            .client
            .post("https://api.acoustid.org/v2/lookup")
            .form(&[
                ("client", key.as_str()),
                ("meta", "recordings"),
                ("duration", duration.as_str()),
                ("fingerprint", fingerprint.encoded.as_str()),
            ])
            .send()
            .map_err(|error| AppError::new("acoustid-request-failed", error.to_string()))?;
        if !response.status().is_success() {
            return Err(AppError::new(
                "acoustid-request-failed",
                format!("AcoustID returned HTTP {}.", response.status()),
            ));
        }
        let body: AcoustIdResponse = response
            .json()
            .map_err(|error| AppError::new("acoustid-response-invalid", error.to_string()))?;
        if body.status != "ok" {
            return Err(AppError::new(
                "acoustid-response-invalid",
                "AcoustID did not accept the fingerprint lookup.",
            ));
        }
        let mut recordings = Vec::new();
        for result in body.results {
            for recording in result.recordings {
                if !recordings.iter().any(|(known, _)| known == &recording.id) {
                    recordings.push((recording.id, result.score));
                }
            }
        }
        Ok(recordings)
    }

    /// Fetch the tracklist for a release group, preferring the earliest official
    /// release with the most complete media. Results are cached so a release is
    /// only ever fetched from MusicBrainz once.
    pub(crate) fn fetch_release_tracklist(
        &self,
        release_group_mbid: &str,
    ) -> Result<Vec<crate::catalog::RemoteTrackPayload>, AppError> {
        let cache_key = format!("tracklist:{release_group_mbid}");
        let database = self
            .database
            .lock()
            .map_err(|_| AppError::state_unavailable("musicbrainz-database"))?
            .clone();

        let raw_json = if let Some(database) = database.as_ref()
            && let Some(cached) = database.get_enrichment_cache(cache_key.clone())?
        {
            cached
        } else {
            self.wait_for_rate_limit()?;
            let response = self
                .client
                .get("https://musicbrainz.org/ws/2/release")
                .query(&[
                    ("release-group", release_group_mbid),
                    ("inc", "recordings+isrcs"),
                    ("limit", "25"),
                    ("fmt", "json"),
                ])
                .send()
                .map_err(|error| AppError::new("musicbrainz-request-failed", error.to_string()))?;
            if !response.status().is_success() {
                return Err(AppError::new(
                    "musicbrainz-request-failed",
                    format!("MusicBrainz returned HTTP {}.", response.status()),
                ));
            }
            let text = response.text().map_err(|error| {
                AppError::new("musicbrainz-response-invalid", error.to_string())
            })?;
            if let Some(database) = database {
                let _ = database.save_enrichment_cache(None, cache_key, text.clone());
            }
            text
        };

        let body: MbReleaseBrowseResponse = serde_json::from_str(&raw_json)
            .map_err(|error| AppError::new("musicbrainz-response-invalid", error.to_string()))?;

        // Prefer the release carrying the most tracks; ties break on earliest date
        // so a standard edition wins over a later deluxe reissue.
        let best = body
            .releases
            .into_iter()
            .filter(|release| !release.media.is_empty())
            .max_by(|a, b| {
                let a_tracks: usize = a.media.iter().map(|m| m.tracks.len()).sum();
                let b_tracks: usize = b.media.iter().map(|m| m.tracks.len()).sum();
                a_tracks.cmp(&b_tracks).then_with(|| {
                    b.date
                        .as_deref()
                        .unwrap_or("9999")
                        .cmp(a.date.as_deref().unwrap_or("9999"))
                })
            });

        let Some(release) = best else {
            return Ok(Vec::new());
        };

        let mut payloads = Vec::new();
        for medium in &release.media {
            let disc_number = medium.position.unwrap_or(1);
            for (index, track) in medium.tracks.iter().enumerate() {
                let track_number = track.position.unwrap_or((index + 1) as u32);
                let recording = track.recording.as_ref();
                payloads.push(crate::catalog::RemoteTrackPayload {
                    id: format!("rtrack-mb-{release_group_mbid}-{disc_number}-{track_number}"),
                    release_id: String::new(), // assigned by the caller
                    track_number,
                    disc_number,
                    title: track.title.clone(),
                    duration_ms: track.length.or_else(|| recording.and_then(|r| r.length)),
                    isrc: recording.and_then(|r| r.isrcs.first().cloned()),
                    musicbrainz_recording_id: recording.map(|r| r.id.clone()),
                    spotify_track_id: None,
                });
            }
        }
        Ok(payloads)
    }

    fn wait_for_rate_limit(&self) -> Result<(), AppError> {
        let mut last = self
            .last_request
            .lock()
            .map_err(|_| AppError::state_unavailable("musicbrainz-rate-limit"))?;
        if let Some(previous) = *last {
            let elapsed = previous.elapsed();
            if elapsed < Duration::from_secs(1) {
                thread::sleep(Duration::from_secs(1) - elapsed);
            }
        }
        *last = Some(Instant::now());
        Ok(())
    }

    pub(crate) fn cover_art(
        &self,
        release_id: &str,
    ) -> Result<Option<(Vec<u8>, String)>, AppError> {
        if !self.enabled() {
            return Err(AppError::new(
                "musicbrainz-disabled",
                "MusicBrainz enrichment is disabled. Enable it explicitly in Settings.",
            ));
        }
        let response = self
            .client
            .get(format!(
                "https://coverartarchive.org/release/{release_id}/front-500"
            ))
            .send()
            .map_err(|error| AppError::new("cover-art-request-failed", error.to_string()))?;
        if response.status().as_u16() == 404 {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(AppError::new(
                "cover-art-request-failed",
                format!("Cover Art Archive returned HTTP {}.", response.status()),
            ));
        }
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/jpeg")
            .split(';')
            .next()
            .unwrap_or("image/jpeg")
            .to_owned();
        let bytes = response
            .bytes()
            .map_err(|error| AppError::new("cover-art-response-invalid", error.to_string()))?;
        Ok(Some((bytes.to_vec(), mime)))
    }
}

pub(crate) fn refresh_artist_discography(
    database: &DatabaseWorker,
    musicbrainz: &MusicBrainzClient,
    artist_id: &str,
) -> Result<crate::catalog::ArtistDetail, AppError> {
    let detail = database.get_artist_detail(artist_id.to_string())?;
    let mut all_releases = Vec::new();
    let mut mbid = detail.artist.musicbrainz_artist_id.clone();

    if mbid.is_none() {
        if let Ok(Some(found)) = musicbrainz.search_artist_mbid(&detail.artist.name) {
            let _ = database.set_artist_musicbrainz_id(detail.artist.id.clone(), found.clone());
            mbid = Some(found);
        }
    }

    if let Some(artist_mbid) = mbid.as_deref() {
        if let Ok(releases) = musicbrainz.fetch_artist_discography(artist_mbid, &detail.artist.name)
        {
            all_releases.extend(releases);
        }
    }

    // A discography is only ever stored under a real MusicBrainz artist ID. Without
    // one there is nothing to key a merge on, and inventing an identifier would
    // corrupt the merge key for every later refresh.
    let Some(save_mbid) = mbid else {
        return Err(AppError::new(
            "artist-discography-unavailable",
            format!("No MusicBrainz artist match for '{}'.", detail.artist.name),
        ));
    };

    if all_releases.is_empty() {
        return Err(AppError::new(
            "artist-discography-unavailable",
            format!("No online discography found for '{}'.", detail.artist.name),
        ));
    }

    database.save_remote_discography(save_mbid, detail.artist.name.clone(), all_releases)?;
    database.get_artist_detail(artist_id.to_string())
}

/// Fetch and cache the MusicBrainz tracklist for one remote release, so the album
/// page can render a full tracklist offline afterwards. Returns the track count.
pub(crate) fn sync_release_tracklist(
    database: &DatabaseWorker,
    musicbrainz: &MusicBrainzClient,
    release_id: &str,
    release_group_mbid: &str,
) -> Result<usize, AppError> {
    let mut payloads = musicbrainz.fetch_release_tracklist(release_group_mbid)?;
    if payloads.is_empty() {
        return Ok(0);
    }
    for payload in &mut payloads {
        payload.release_id = release_id.to_string();
    }
    let count = payloads.len();
    database.save_remote_tracks(release_id.to_string(), payloads)?;
    Ok(count)
}

/// Walk every local artist and cache their full MusicBrainz discography.
///
/// This is the library-wide counterpart to `refresh_artist_discography`, which only
/// ever covers the single artist whose page is open. Artists already refreshed
/// within `stale_after_days` are skipped, so repeat runs are cheap and resumable.
/// MusicBrainz's one-request-per-second limit is enforced by the shared client.
pub(crate) fn sync_library_discographies(
    database: &DatabaseWorker,
    musicbrainz: &MusicBrainzClient,
    stale_after_days: i64,
    should_continue: &dyn Fn() -> bool,
    progress: &dyn Fn(DiscographySyncProgress),
) -> Result<DiscographySyncProgress, AppError> {
    let artists = database.list_artists_for_discography_sync(stale_after_days)?;
    let total = artists.len() as u32;
    let mut state = DiscographySyncProgress {
        total,
        processed: 0,
        refreshed: 0,
        skipped: 0,
        failed: 0,
        current_artist: None,
        complete: false,
    };
    progress(state.clone());

    for artist in artists {
        if !should_continue() {
            break;
        }
        state.current_artist = Some(artist.name.clone());
        progress(state.clone());

        match refresh_artist_discography(database, musicbrainz, &artist.id) {
            Ok(_) => {
                let _ = database.mark_artist_discography_checked(artist.id.clone());
                state.refreshed += 1;
            }
            Err(error) if error.code == "artist-discography-unavailable" => {
                // No MusicBrainz match for this artist; record it and move on rather
                // than retrying the same lookup on every future sync.
                let _ = database.mark_artist_discography_checked(artist.id.clone());
                state.skipped += 1;
            }
            Err(_) => state.failed += 1,
        }

        state.processed += 1;
        progress(state.clone());
    }

    state.current_artist = None;
    state.complete = true;
    progress(state.clone());
    Ok(state)
}

pub(crate) fn enrich_track(
    database: &DatabaseWorker,
    client: &MusicBrainzClient,
    track_id: String,
) -> Result<EnrichmentJob, AppError> {
    if !client.enabled() {
        return Err(AppError::new(
            "musicbrainz-disabled",
            "MusicBrainz enrichment is disabled. Enable it explicitly in Settings.",
        ));
    }
    let track = database.get_track(track_id.clone())?;
    let query_key = format!("track:{}:v2", track.id);
    let (mut candidates, from_cache) = if let Some(json) =
        database.get_enrichment_cache(query_key.clone())?
    {
        let candidates = serde_json::from_str(&json)
            .map_err(|error| AppError::persistence("read-enrichment-cache", error.to_string()))?;
        (candidates, true)
    } else {
        let mut candidates = candidates_for_track(client, &track)?;
        evaluate_candidates(&track, &mut candidates);
        database.save_enrichment_cache(
            Some(track_id.clone()),
            query_key,
            serde_json::to_string(&candidates)
                .map_err(|error| AppError::persistence("cache-enrichment", error.to_string()))?,
        )?;
        (candidates, false)
    };
    evaluate_candidates(&track, &mut candidates);
    let confident: Vec<_> = candidates
        .iter()
        .filter(|candidate| !candidate.requires_review)
        .collect();
    let auto_applied = confident.len() == 1;
    if let [candidate] = confident.as_slice() {
        let mut patch = patch_from_candidate(&track, candidate);
        preserve_local_only_fields(&track, &mut patch);
        database.save_metadata_draft(track_id.clone(), patch, "musicbrainz-auto".into())?;
    }
    Ok(EnrichmentJob {
        track_id,
        status: if auto_applied { "complete" } else { "review" }.into(),
        candidates,
        auto_applied,
        from_cache,
    })
}

pub(crate) fn preserve_local_only_fields(track: &TrackSummary, patch: &mut MetadataPatch) {
    if let Ok(local) = read_metadata_patch(std::path::Path::new(&track.path)) {
        patch.musicbrainz_artist_ids = local.musicbrainz_artist_ids;
        patch.musicbrainz_album_artist_ids = local.musicbrainz_album_artist_ids;
        patch.lyrics = local.lyrics;
    }
}

fn candidates_for_track(
    client: &MusicBrainzClient,
    track: &TrackSummary,
) -> Result<Vec<EnrichmentCandidate>, AppError> {
    if let Some(recording_id) = track.musicbrainz_recording_id.as_deref()
        && let Ok(recording) = client.recording(recording_id)
    {
        let mut candidates = candidates_from_recording(track, recording);
        set_candidate_source(&mut candidates, "embedded-mbid", 1.0);
        return Ok(candidates);
    }

    if client.acoustid_configured()
        && let Ok(fingerprint) = fingerprint_path(std::path::Path::new(&track.path))
        && let Ok(recordings) = client.acoustid_recordings(&fingerprint)
        && !recordings.is_empty()
    {
        let mut candidates = Vec::new();
        for (recording_id, score) in recordings {
            if let Ok(recording) = client.recording(&recording_id) {
                let start = candidates.len();
                candidates.extend(candidates_from_recording(track, recording));
                set_candidate_source(&mut candidates[start..], "acoustid", score);
            }
        }
        if !candidates.is_empty() {
            return Ok(candidates);
        }
    }

    client.search(track)
}

fn set_candidate_source(candidates: &mut [EnrichmentCandidate], source: &str, confidence: f64) {
    for candidate in candidates {
        candidate.source = source.into();
        candidate.confidence = confidence;
    }
}

fn evaluate_candidates(track: &TrackSummary, candidates: &mut [EnrichmentCandidate]) {
    let mut recording_ids: Vec<_> = candidates
        .iter()
        .map(|candidate| candidate.recording_id.as_str())
        .collect();
    recording_ids.sort_unstable();
    recording_ids.dedup();
    let unique_recording = recording_ids.len() == 1;
    let release_matches = candidates
        .iter()
        .filter(|candidate| release_agrees(track, candidate))
        .count();
    for candidate in candidates {
        let mut reasons = Vec::new();
        let trusted_source = match candidate.source.as_str() {
            "embedded-mbid" => true,
            "acoustid" => candidate.confidence >= 0.90,
            _ => false,
        };
        if !trusted_source {
            reasons.push(if candidate.source == "text-search" {
                "Text search candidates always require review.".into()
            } else {
                "The fingerprint confidence is below 90%.".into()
            });
        }
        if !unique_recording {
            reasons.push("The fingerprint did not resolve to one recording.".into());
        }
        if !release_agrees(track, candidate) || release_matches != 1 {
            reasons.push("The recording did not resolve to one agreeing release.".into());
        }
        if let Some(existing) = track.musicbrainz_recording_id.as_deref()
            && existing != candidate.recording_id
        {
            reasons.push("The candidate conflicts with the embedded recording MBID.".into());
        }
        if !isrc_agrees(track, candidate) {
            reasons.push("The candidate conflicts with the embedded ISRC.".into());
        }
        candidate.requires_review = !reasons.is_empty();
        candidate.confidence_reasons = if reasons.is_empty() {
            vec![
                "Unique fingerprint or validated MBID recording.".into(),
                "Unique release agrees within the two-second duration tolerance.".into(),
                "No existing recording identifier conflicts.".into(),
            ]
        } else {
            reasons
        };
        let mut patch = patch_from_candidate(track, candidate);
        preserve_local_only_fields(track, &mut patch);
        candidate.diffs = read_metadata_patch(std::path::Path::new(&track.path)).map_or_else(
            |_| diff_patch(track, &patch, &candidate.source, candidate.confidence),
            |before| {
                crate::metadata_jobs::diff_metadata_patches(
                    &track.id,
                    &before,
                    &patch,
                    &candidate.source,
                    candidate.confidence,
                )
            },
        );
    }
}

fn candidates_from_recording(
    track: &TrackSummary,
    recording: SearchRecording,
) -> Vec<EnrichmentCandidate> {
    let SearchRecording {
        id,
        title,
        score,
        length,
        artist_credit,
        releases,
        isrcs,
    } = recording;
    let artists: Vec<_> = artist_credit
        .into_iter()
        .map(|artist| artist.name)
        .collect();
    let embedded_id_match = track.musicbrainz_recording_id.as_deref() == Some(id.as_str());
    let mut candidates = Vec::new();
    for release in releases {
        let album_artists: Vec<_> = release
            .artist_credit
            .into_iter()
            .map(|artist| artist.name)
            .collect();
        let media = release.media.first();
        let track_number = media
            .and_then(|medium| medium.track_offset)
            .map(|offset| offset.saturating_add(1));
        let track_total = release
            .track_count
            .or_else(|| media.and_then(|medium| medium.track_count));
        let disc_number = media.and_then(|medium| medium.position);
        let disc_total = u32::try_from(release.media.len()).ok();
        let candidate = EnrichmentCandidate {
            recording_id: id.clone(),
            title: title.clone(),
            artists: artists.clone(),
            release_id: Some(release.id),
            release: Some(release.title),
            album_artists,
            track_number,
            track_total,
            disc_number,
            disc_total,
            isrcs: isrcs.clone(),
            duration_ms: length,
            score,
            source: "text-search".into(),
            confidence: f64::from(score) / 100.0,
            confidence_reasons: Vec::new(),
            diffs: Vec::new(),
            requires_review: true,
        };
        candidates.push(candidate);
    }
    if candidates.is_empty() {
        candidates.push(EnrichmentCandidate {
            recording_id: id,
            title,
            artists,
            release_id: None,
            release: None,
            album_artists: Vec::new(),
            track_number: None,
            track_total: None,
            disc_number: None,
            disc_total: None,
            isrcs,
            duration_ms: length,
            score,
            source: "text-search".into(),
            confidence: f64::from(score) / 100.0,
            confidence_reasons: Vec::new(),
            diffs: Vec::new(),
            requires_review: !embedded_id_match,
        });
    }
    candidates
}

fn release_agrees(track: &TrackSummary, candidate: &EnrichmentCandidate) -> bool {
    let local_album_artists: Vec<_> = track
        .album_artists
        .iter()
        .map(|artist| artist.name.clone())
        .collect();
    candidate
        .release
        .as_deref()
        .is_some_and(|release| normalized(release) == normalized(&track.album))
        && normalized_values(&candidate.album_artists) == normalized_values(&local_album_artists)
        && track.track_number == candidate.track_number
        && track.track_total == candidate.track_total
        && track.track_number.is_some()
        && track.track_total.is_some()
        && track
            .disc_number
            .is_none_or(|number| candidate.disc_number == Some(number))
        && track
            .disc_total
            .is_none_or(|total| candidate.disc_total == Some(total))
        && isrc_agrees(track, candidate)
        && match (track.duration_ms, candidate.duration_ms) {
            (Some(local), Some(remote)) => local.abs_diff(remote) <= 2_000,
            _ => false,
        }
}

fn isrc_agrees(track: &TrackSummary, candidate: &EnrichmentCandidate) -> bool {
    track.isrc.as_deref().is_none_or(|local| {
        candidate
            .isrcs
            .iter()
            .any(|remote| remote.eq_ignore_ascii_case(local))
    })
}

pub(crate) fn patch_from_candidate(
    track: &TrackSummary,
    candidate: &EnrichmentCandidate,
) -> MetadataPatch {
    MetadataPatch {
        title: Some(candidate.title.clone()),
        artists: Some(candidate.artists.clone()),
        album: candidate
            .release
            .clone()
            .or_else(|| Some(track.album.clone())),
        album_artists: Some(candidate.album_artists.clone()),
        genres: Some(track.genres.clone()),
        track_number: candidate.track_number.or(track.track_number),
        track_total: candidate.track_total.or(track.track_total),
        disc_number: candidate.disc_number.or(track.disc_number),
        disc_total: candidate.disc_total.or(track.disc_total),
        year: track.year,
        date: track.date.clone(),
        composer: track.composer.clone(),
        label: track.label.clone(),
        catalog_number: track.catalog_number.clone(),
        isrc: track
            .isrc
            .clone()
            .or_else(|| candidate.isrcs.first().cloned()),
        musicbrainz_recording_id: Some(candidate.recording_id.clone()),
        musicbrainz_release_id: candidate.release_id.clone(),
        musicbrainz_artist_ids: None,
        musicbrainz_album_artist_ids: None,
        artwork_id: track.artwork_id.clone(),
        lyrics: None,
    }
}

fn credential_error(operation: &'static str) -> impl FnOnce(keyring::Error) -> AppError {
    move |error| AppError::new(operation, error.to_string())
}

fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn normalized_values(values: &[String]) -> Vec<String> {
    let mut values: Vec<_> = values.iter().map(|value| normalized(value)).collect();
    values.sort();
    values
}

#[derive(Deserialize)]
struct SearchResponse {
    #[serde(default)]
    recordings: Vec<SearchRecording>,
}

#[derive(Deserialize)]
struct SearchRecording {
    id: String,
    title: String,
    #[serde(default)]
    score: u16,
    length: Option<u64>,
    #[serde(rename = "artist-credit", default)]
    artist_credit: Vec<SearchArtist>,
    #[serde(default)]
    releases: Vec<SearchRelease>,
    #[serde(default)]
    isrcs: Vec<String>,
}

#[derive(Deserialize)]
struct AcoustIdResponse {
    status: String,
    #[serde(default)]
    results: Vec<AcoustIdResult>,
}

#[derive(Deserialize)]
struct AcoustIdResult {
    #[serde(default)]
    score: f64,
    #[serde(default)]
    recordings: Vec<AcoustIdRecording>,
}

#[derive(Deserialize)]
struct AcoustIdRecording {
    id: String,
}

#[derive(Deserialize)]
struct SearchArtist {
    name: String,
}

#[derive(Deserialize)]
struct SearchRelease {
    id: String,
    title: String,
    #[serde(rename = "artist-credit", default)]
    artist_credit: Vec<SearchArtist>,
    #[serde(rename = "track-count")]
    track_count: Option<u32>,
    #[serde(default)]
    media: Vec<SearchMedium>,
}

#[derive(Deserialize)]
struct SearchMedium {
    position: Option<u32>,
    #[serde(rename = "track-count")]
    track_count: Option<u32>,
    #[serde(rename = "track-offset")]
    track_offset: Option<u32>,
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn track_fixture() -> TrackSummary {
        TrackSummary {
            id: "track".into(),
            root_id: "root".into(),
            path: "/music/track.flac".into(),
            relative_path: "track.flac".into(),
            title: "Track".into(),
            sort_title: None,
            artists: Vec::new(),
            album_artists: vec![crate::ArtistReference {
                id: "artist".into(),
                name: "Miles Davis".into(),
            }],
            album_id: None,
            album: "Kind of Blue".into(),
            genres: Vec::new(),
            track_number: Some(1),
            track_total: Some(5),
            disc_number: None,
            disc_total: None,
            year: None,
            date: None,
            composer: None,
            label: None,
            catalog_number: None,
            isrc: None,
            musicbrainz_recording_id: None,
            artwork_id: None,
            artwork_path: None,
            extension: crate::AudioExtension::Flac,
            file_size: 1,
            duration_ms: Some(100_000),
            sample_rate: Some(44_100),
            channels: Some(2),
            bit_depth: Some(16),
            play_count: 0,
            available: true,
        }
    }

    #[test]
    fn only_complete_exact_matches_can_bypass_review() {
        let mut track = track_fixture();
        track.isrc = Some("US-S1Z-99-00001".into());
        let mut candidate = candidates_from_recording(
            &track,
            SearchRecording {
                id: "recording".into(),
                title: "Track".into(),
                score: 100,
                length: Some(101_500),
                artist_credit: Vec::new(),
                isrcs: vec!["US-S1Z-99-00001".into()],
                releases: vec![SearchRelease {
                    id: "release".into(),
                    title: "Kind of Blue".into(),
                    artist_credit: vec![SearchArtist {
                        name: "Miles Davis".into(),
                    }],
                    track_count: Some(5),
                    media: vec![SearchMedium {
                        position: Some(1),
                        track_count: Some(5),
                        track_offset: Some(0),
                    }],
                }],
            },
        );
        set_candidate_source(&mut candidate, "acoustid", 0.99);
        evaluate_candidates(&track, &mut candidate);
        assert!(!candidate[0].requires_review);

        let mut conflicting_isrc = track.clone();
        conflicting_isrc.isrc = Some("US-S1Z-99-99999".into());
        evaluate_candidates(&conflicting_isrc, &mut candidate);
        assert!(candidate[0].requires_review);
        assert!(
            candidate[0]
                .confidence_reasons
                .iter()
                .any(|reason| reason.contains("ISRC"))
        );

        let mut incomplete = track_fixture();
        incomplete.track_total = None;
        let mut candidate = candidates_from_recording(
            &incomplete,
            SearchRecording {
                id: "recording".into(),
                title: "Track".into(),
                score: 100,
                length: Some(100_000),
                artist_credit: Vec::new(),
                isrcs: Vec::new(),
                releases: vec![SearchRelease {
                    id: "release".into(),
                    title: "Kind of Blue".into(),
                    artist_credit: vec![SearchArtist {
                        name: "Miles Davis".into(),
                    }],
                    track_count: Some(5),
                    media: vec![SearchMedium {
                        position: Some(1),
                        track_count: Some(5),
                        track_offset: Some(0),
                    }],
                }],
            },
        );
        set_candidate_source(&mut candidate, "acoustid", 0.99);
        evaluate_candidates(&incomplete, &mut candidate);
        assert!(candidate[0].requires_review);
    }

    #[test]
    fn text_search_never_bypasses_review() {
        let track = track_fixture();
        let mut candidate = candidates_from_recording(
            &track,
            SearchRecording {
                id: "recording".into(),
                title: "Track".into(),
                score: 100,
                length: Some(100_000),
                artist_credit: Vec::new(),
                isrcs: Vec::new(),
                releases: vec![SearchRelease {
                    id: "release".into(),
                    title: "Kind of Blue".into(),
                    artist_credit: vec![SearchArtist {
                        name: "Miles Davis".into(),
                    }],
                    track_count: Some(5),
                    media: vec![SearchMedium {
                        position: Some(1),
                        track_count: Some(5),
                        track_offset: Some(0),
                    }],
                }],
            },
        );
        evaluate_candidates(&track, &mut candidate);
        assert!(candidate[0].requires_review);
        assert!(candidate[0].confidence_reasons[0].contains("Text search"));
    }

    #[test]
    fn recorded_provider_fixtures_deserialize_without_live_http() {
        let acoustid: AcoustIdResponse = serde_json::from_str(
            r#"{"status":"ok","results":[{"score":0.97,"recordings":[{"id":"recording"}]}]}"#,
        )
        .expect("AcoustID fixture");
        assert_eq!(acoustid.results[0].recordings[0].id, "recording");

        let musicbrainz: SearchRecording = serde_json::from_str(
            r#"{
              "id":"recording","title":"Track","length":100000,
              "artist-credit":[{"name":"Miles Davis"}],
              "releases":[{
                "id":"release","title":"Kind of Blue","track-count":5,
                "artist-credit":[{"name":"Miles Davis"}],
                "media":[{"track-count":5,"track-offset":0}]
              }]
            }"#,
        )
        .expect("MusicBrainz fixture");
        assert_eq!(musicbrainz.releases[0].id, "release");
        assert_eq!(musicbrainz.artist_credit[0].name, "Miles Davis");
    }

    #[test]
    fn musicbrainz_catalog_enrichment_is_enabled_by_default() {
        assert!(MusicBrainzClient::default().enabled());
    }

    #[test]
    fn musicbrainz_requests_are_globally_spaced_by_at_least_one_second() {
        let client = MusicBrainzClient::default();
        client.wait_for_rate_limit().expect("first request slot");
        let started = Instant::now();
        client.wait_for_rate_limit().expect("second request slot");
        assert!(started.elapsed() >= Duration::from_millis(950));
    }
}
