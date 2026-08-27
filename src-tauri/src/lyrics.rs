use std::{fs, path::Path};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{AppError, TrackSummary, persistence::DatabaseWorker};

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    pub time_ms: Option<u64>,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LyricsSource {
    EmbeddedSynced,
    SidecarLrc,
    EmbeddedPlain,
    Lrclib,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsDocument {
    pub lines: Vec<LyricLine>,
    pub source: LyricsSource,
    pub source_url: Option<String>,
    pub synchronized: bool,
}

impl LyricsDocument {
    fn unavailable() -> Self {
        Self {
            lines: Vec::new(),
            source: LyricsSource::Unavailable,
            source_url: None,
            synchronized: false,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibResponse {
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
    id: Option<u64>,
}

/// Resolves lyrics in local-first order. A network failure deliberately
/// resolves to the explicit unavailable state: playback must never be held up
/// by a convenience panel.
pub(crate) fn resolve_lyrics(
    database: &DatabaseWorker,
    track_id: String,
) -> Result<LyricsDocument, AppError> {
    let track = database.get_track(track_id.clone())?;
    let embedded = database.get_embedded_lyrics(track_id)?;
    if let Some(document) = embedded.as_deref().and_then(parse_lrc) {
        if document.synchronized {
            return Ok(with_source(document, LyricsSource::EmbeddedSynced, None));
        }
    }
    if let Some(document) = sidecar_lrc(&track.path) {
        return Ok(with_source(document, LyricsSource::SidecarLrc, None));
    }
    if let Some(document) = embedded.as_deref().and_then(parse_plain) {
        return Ok(with_source(document, LyricsSource::EmbeddedPlain, None));
    }

    let cache_key = cache_key(&track);
    if let Some(json) = database.get_lyrics_cache(cache_key.clone())? {
        return serde_json::from_str(&json)
            .map_err(|error| AppError::persistence("read-lyrics-cache", error.to_string()));
    }
    let document = fetch_lrclib(&track).unwrap_or_else(LyricsDocument::unavailable);
    if !matches!(document.source, LyricsSource::Unavailable) {
        let json = serde_json::to_string(&document)
            .map_err(|error| AppError::persistence("serialize-lyrics-cache", error.to_string()))?;
        database.save_lyrics_cache(cache_key, json, document.source_url.clone())?;
    }
    Ok(document)
}

fn with_source(
    mut document: LyricsDocument,
    source: LyricsSource,
    source_url: Option<String>,
) -> LyricsDocument {
    document.source = source;
    document.source_url = source_url;
    document
}

fn sidecar_lrc(audio_path: &str) -> Option<LyricsDocument> {
    let path = Path::new(audio_path).with_extension("lrc");
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| parse_lrc(&raw))
}

fn cache_key(track: &TrackSummary) -> String {
    track.musicbrainz_recording_id.clone().unwrap_or_else(|| {
        format!(
            "{}\u{1f}{}\u{1f}{}\u{1f}",
            normalized(
                &track
                    .artists
                    .iter()
                    .map(|artist| artist.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            normalized(&track.title),
            normalized(&track.album),
        ) + &track.duration_ms.unwrap_or_default().to_string()
    })
}

fn normalized(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn fetch_lrclib(track: &TrackSummary) -> Option<LyricsDocument> {
    let artist_name = track.artists.first()?.name.as_str();
    let response = Client::builder()
        .user_agent(format!(
            "Bebop/{} (https://github.com/dbgoodm/Bebop)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?
        .get("https://lrclib.net/api/get")
        .query(&[
            ("artist_name", artist_name),
            ("track_name", track.title.as_str()),
            ("album_name", track.album.as_str()),
            (
                "duration",
                &(track.duration_ms.unwrap_or_default() / 1_000).to_string(),
            ),
        ])
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let payload: LrclibResponse = response.json().ok()?;
    let source_url = payload
        .id
        .map(|id| format!("https://lrclib.net/api/get/{id}"));
    if let Some(document) = payload.synced_lyrics.as_deref().and_then(parse_lrc) {
        return Some(with_source(document, LyricsSource::Lrclib, source_url));
    }
    payload
        .plain_lyrics
        .as_deref()
        .and_then(parse_plain)
        .map(|document| with_source(document, LyricsSource::Lrclib, source_url))
}

pub(crate) fn parse_lrc(raw: &str) -> Option<LyricsDocument> {
    let mut lines = Vec::new();
    for raw_line in raw.lines() {
        let mut rest = raw_line.trim();
        let mut timestamps = Vec::new();
        while let Some(after_open) = rest.strip_prefix('[') {
            let end = after_open.find(']')?;
            let timestamp = &after_open[..end];
            let Some(time_ms) = parse_timestamp(timestamp) else {
                break;
            };
            timestamps.push(time_ms);
            rest = &after_open[end + 1..];
        }
        if !timestamps.is_empty() {
            let text = rest.trim();
            for time_ms in timestamps {
                lines.push(LyricLine {
                    time_ms: Some(time_ms),
                    text: text.to_owned(),
                });
            }
        }
    }
    lines.sort_by_key(|line| line.time_ms);
    (!lines.is_empty()).then_some(LyricsDocument {
        lines,
        source: LyricsSource::Unavailable,
        source_url: None,
        synchronized: true,
    })
}

fn parse_plain(raw: &str) -> Option<LyricsDocument> {
    let lines = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|text| LyricLine {
            time_ms: None,
            text: text.to_owned(),
        })
        .collect::<Vec<_>>();
    (!lines.is_empty()).then_some(LyricsDocument {
        lines,
        source: LyricsSource::Unavailable,
        source_url: None,
        synchronized: false,
    })
}

fn parse_timestamp(value: &str) -> Option<u64> {
    let (minutes, seconds) = value.split_once(':')?;
    let minutes = minutes.parse::<u64>().ok()?;
    let (seconds, fraction) = seconds.split_once('.').unwrap_or((seconds, ""));
    let seconds = seconds.parse::<u64>().ok()?;
    if seconds >= 60 {
        return None;
    }
    let millis = match fraction.len() {
        0 => 0,
        1 => fraction.parse::<u64>().ok()? * 100,
        2 => fraction.parse::<u64>().ok()? * 10,
        _ => fraction[..3].parse::<u64>().ok()?,
    };
    Some((minutes * 60 + seconds) * 1_000 + millis)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiple_lrc_timestamps_and_ignores_metadata() {
        let document =
            parse_lrc("[ar:Artist]\n[00:01.20][00:03.40]Hello\n[01:00]World").expect("lyrics");
        assert!(document.synchronized);
        assert_eq!(document.lines.len(), 3);
        assert_eq!(document.lines[0].time_ms, Some(1_200));
        assert_eq!(document.lines[1].time_ms, Some(3_400));
        assert_eq!(document.lines[2].text, "World");
    }

    #[test]
    fn plain_lyrics_do_not_become_fake_timestamps() {
        let document = parse_plain("First line\n\nSecond line").expect("lyrics");
        assert!(!document.synchronized);
        assert!(document.lines.iter().all(|line| line.time_ms.is_none()));
    }

    #[test]
    fn sidecar_lrc_is_read_next_to_the_audio_file() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let audio = directory.path().join("track.flac");
        std::fs::write(&audio, []).expect("audio placeholder");
        std::fs::write(
            directory.path().join("track.lrc"),
            "[00:02.50]Sidecar lyric",
        )
        .expect("sidecar lyrics");

        let document = sidecar_lrc(audio.to_str().expect("utf-8 path")).expect("sidecar document");
        assert_eq!(document.lines[0].time_ms, Some(2_500));
    }
}
