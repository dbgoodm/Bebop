use std::{
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{AppError, MetadataPatch, TrackSummary, persistence::DatabaseWorker};

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
    pub duration_ms: Option<u64>,
    pub score: u16,
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

pub(crate) struct MusicBrainzClient {
    enabled: AtomicBool,
    client: Client,
    last_request: Mutex<Option<Instant>>,
}

impl Default for MusicBrainzClient {
    fn default() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            client: Client::builder()
                .user_agent(format!(
                    "Bebop/{} (https://github.com/dbgoodm/Bebop)",
                    env!("CARGO_PKG_VERSION")
                ))
                .build()
                .expect("valid MusicBrainz HTTP client"),
            last_request: Mutex::new(None),
        }
    }
}

impl MusicBrainzClient {
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
            return Ok(body
                .recordings
                .into_iter()
                .flat_map(|recording| candidates_from_recording(track, recording))
                .collect());
        }
        Err(AppError::new(
            "musicbrainz-unavailable",
            "MusicBrainz remained unavailable after retrying.",
        ))
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
    let query_key = format!(
        "{}\u{1f}{}\u{1f}{}",
        track.title.to_lowercase(),
        track
            .artists
            .first()
            .map(|artist| artist.name.to_lowercase())
            .unwrap_or_default(),
        track.album.to_lowercase()
    );
    let (mut candidates, from_cache) = if let Some(json) =
        database.get_enrichment_cache(query_key.clone())?
    {
        let candidates = serde_json::from_str(&json)
            .map_err(|error| AppError::persistence("read-enrichment-cache", error.to_string()))?;
        (candidates, true)
    } else {
        let candidates = client.search(&track)?;
        database.save_enrichment_cache(
            track_id.clone(),
            query_key,
            serde_json::to_string(&candidates)
                .map_err(|error| AppError::persistence("cache-enrichment", error.to_string()))?,
        )?;
        (candidates, false)
    };
    for candidate in &mut candidates {
        candidate.requires_review = !candidate_is_confident(&track, candidate);
    }
    let confident: Vec<_> = candidates
        .iter()
        .filter(|candidate| !candidate.requires_review)
        .collect();
    let auto_applied = confident.len() == 1;
    if let [candidate] = confident.as_slice() {
        database.save_metadata_draft(
            track_id.clone(),
            patch_from_candidate(&track, candidate),
            "musicbrainz-auto".into(),
        )?;
    }
    Ok(EnrichmentJob {
        track_id,
        status: if auto_applied { "complete" } else { "review" }.into(),
        candidates,
        auto_applied,
        from_cache,
    })
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
        let mut candidate = EnrichmentCandidate {
            recording_id: id.clone(),
            title: title.clone(),
            artists: artists.clone(),
            release_id: Some(release.id),
            release: Some(release.title),
            album_artists,
            track_number,
            track_total,
            duration_ms: length,
            score,
            requires_review: true,
        };
        candidate.requires_review = !candidate_is_confident(track, &candidate);
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
            duration_ms: length,
            score,
            requires_review: !embedded_id_match,
        });
    }
    candidates
}

fn candidate_is_confident(track: &TrackSummary, candidate: &EnrichmentCandidate) -> bool {
    if track.musicbrainz_recording_id.as_deref() == Some(candidate.recording_id.as_str()) {
        return true;
    }
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
        && match (track.duration_ms, candidate.duration_ms) {
            (Some(local), Some(remote)) => local.abs_diff(remote) <= 2_000,
            _ => false,
        }
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
        disc_number: track.disc_number,
        disc_total: track.disc_total,
        year: track.year,
        date: track.date.clone(),
        composer: track.composer.clone(),
        label: track.label.clone(),
        catalog_number: track.catalog_number.clone(),
        isrc: track.isrc.clone(),
        artwork_id: track.artwork_id.clone(),
    }
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
    #[serde(rename = "track-count")]
    track_count: Option<u32>,
    #[serde(rename = "track-offset")]
    track_offset: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track() -> TrackSummary {
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
        let candidate = candidates_from_recording(
            &track(),
            SearchRecording {
                id: "recording".into(),
                title: "Track".into(),
                score: 100,
                length: Some(101_500),
                artist_credit: Vec::new(),
                releases: vec![SearchRelease {
                    id: "release".into(),
                    title: "Kind of Blue".into(),
                    artist_credit: vec![SearchArtist {
                        name: "Miles Davis".into(),
                    }],
                    track_count: Some(5),
                    media: vec![SearchMedium {
                        track_count: Some(5),
                        track_offset: Some(0),
                    }],
                }],
            },
        );
        assert!(!candidate[0].requires_review);

        let mut incomplete = track();
        incomplete.track_total = None;
        let candidate = candidates_from_recording(
            &incomplete,
            SearchRecording {
                id: "recording".into(),
                title: "Track".into(),
                score: 100,
                length: Some(100_000),
                artist_credit: Vec::new(),
                releases: vec![SearchRelease {
                    id: "release".into(),
                    title: "Kind of Blue".into(),
                    artist_credit: vec![SearchArtist {
                        name: "Miles Davis".into(),
                    }],
                    track_count: Some(5),
                    media: vec![SearchMedium {
                        track_count: Some(5),
                        track_offset: Some(0),
                    }],
                }],
            },
        );
        assert!(candidate[0].requires_review);
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
