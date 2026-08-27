use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{AppError, acquisition::AcquisitionTrackRequest};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_QOBUZ_APP_ID: &str = "712109809";

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTrack {
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub album_artists: Vec<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub date: Option<String>,
    pub isrc: Option<String>,
    pub duration_ms: Option<u64>,
    pub artwork_url: Option<String>,
    pub genres: Vec<String>,
    pub label: Option<String>,
    pub catalog_number: Option<String>,
    pub composer: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
    pub qobuz_id: Option<String>,
    pub deezer_id: Option<String>,
    pub tidal_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAlbum {
    pub id: Option<String>,
    pub title: String,
    pub artists: Vec<String>,
    pub year: Option<u32>,
    pub date: Option<String>,
    pub artwork_url: Option<String>,
    pub label: Option<String>,
    pub total_tracks: Option<u32>,
    pub tracks: Vec<ResolvedTrack>,
}

pub struct MetadataResolver {
    client: Client,
    qobuz_app_id: String,
}

impl Default for MetadataResolver {
    fn default() -> Self {
        Self::new(None)
    }
}

impl MetadataResolver {
    pub fn new(qobuz_app_id: Option<String>) -> Self {
        let client = Client::builder()
            .user_agent(format!(
                "Bebop/{} (https://github.com/dbgoodm/Bebop)",
                env!("CARGO_PKG_VERSION")
            ))
            .timeout(DEFAULT_TIMEOUT)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            qobuz_app_id: qobuz_app_id.unwrap_or_else(|| DEFAULT_QOBUZ_APP_ID.to_string()),
        }
    }

    pub fn resolve_track(
        &self,
        request: &AcquisitionTrackRequest,
    ) -> Result<ResolvedTrack, AppError> {
        let mut track = ResolvedTrack {
            title: request.title.clone().unwrap_or_default(),
            artists: request
                .artist
                .as_ref()
                .map(|a| vec![a.clone()])
                .unwrap_or_default(),
            album: request.album.clone().unwrap_or_default(),
            album_artists: request
                .artist
                .as_ref()
                .map(|a| vec![a.clone()])
                .unwrap_or_default(),
            track_number: request.track_number,
            disc_number: request.disc_number,
            year: request.year,
            isrc: request.isrc.clone(),
            artwork_url: request.artwork_url.clone(),
            musicbrainz_recording_id: request.musicbrainz_recording_id.clone(),
            ..Default::default()
        };

        if let Some(url) = &request.url {
            let url_trimmed = url.trim();
            if is_spotify_url(url_trimmed) {
                if let Ok(spotify_track) = self.resolve_spotify_track(url_trimmed) {
                    merge_resolved_track(&mut track, spotify_track);
                }
            } else if is_deezer_url(url_trimmed) {
                if let Some(id) = extract_deezer_id(url_trimmed) {
                    track.deezer_id = Some(id.clone());
                    if let Ok(deezer_track) = self.fetch_deezer_track_by_id(&id) {
                        merge_resolved_track(&mut track, deezer_track);
                    }
                }
            } else if is_qobuz_url(url_trimmed) {
                if let Some(id) = extract_qobuz_id(url_trimmed) {
                    track.qobuz_id = Some(id.clone());
                    if let Ok(qobuz_track) = self.fetch_qobuz_track_by_id(&id) {
                        merge_resolved_track(&mut track, qobuz_track);
                    }
                }
            } else if is_tidal_url(url_trimmed) {
                if let Some(id) = extract_tidal_id(url_trimmed) {
                    track.tidal_id = Some(id);
                }
            }

            // Cross-service link mapping via Odesli
            if let Ok(odesli_data) = self.resolve_odesli_links(url_trimmed) {
                merge_odesli_data(&mut track, &odesli_data);
            }
        }

        // Direct ISRC lookup if missing provider IDs or ISRC is known
        if let Some(isrc) = &track.isrc {
            let clean_isrc = isrc.trim().to_uppercase();
            if track.deezer_id.is_none() {
                if let Ok(deezer_track) = self.search_deezer_isrc(&clean_isrc) {
                    merge_resolved_track(&mut track, deezer_track);
                }
            }
            if track.qobuz_id.is_none() {
                if let Ok(qobuz_track) = self.search_qobuz_isrc(&clean_isrc) {
                    merge_resolved_track(&mut track, qobuz_track);
                }
            }
        }

        // ISRC fallback via MusicBrainz / Soundcharts if ISRC is missing but we have title + artist
        if track.isrc.is_none() && !track.title.is_empty() && !track.artists.is_empty() {
            if let Ok(found_isrc) =
                self.find_isrc_fallback(&track.title, &track.artists[0], track.album.as_str())
            {
                track.isrc = Some(found_isrc.clone());
                if track.deezer_id.is_none() {
                    if let Ok(deezer_track) = self.search_deezer_isrc(&found_isrc) {
                        merge_resolved_track(&mut track, deezer_track);
                    }
                }
                if track.qobuz_id.is_none() {
                    if let Ok(qobuz_track) = self.search_qobuz_isrc(&found_isrc) {
                        merge_resolved_track(&mut track, qobuz_track);
                    }
                }
            }
        }

        // If Deezer ID is still missing, fallback search by title & artist on Deezer
        if track.deezer_id.is_none() && !track.title.is_empty() && !track.artists.is_empty() {
            if let Ok(deezer_track) =
                self.search_deezer_by_metadata(&track.title, &track.artists[0])
            {
                merge_resolved_track(&mut track, deezer_track);
            }
        }

        // If Qobuz ID is still missing, fallback search by title & artist on Qobuz
        if track.qobuz_id.is_none() && !track.title.is_empty() && !track.artists.is_empty() {
            if let Ok(qobuz_track) = self.search_qobuz_by_metadata(&track.title, &track.artists[0])
            {
                merge_resolved_track(&mut track, qobuz_track);
            }
        }

        if track.title.is_empty() {
            return Err(AppError::new(
                "acquisition-resolver-failed",
                "Could not resolve title or metadata for the requested track.",
            ));
        }

        Ok(track)
    }

    pub fn resolve_album_tracks(&self, url_or_query: &str) -> Result<ResolvedAlbum, AppError> {
        let trimmed = url_or_query.trim();
        if is_spotify_url(trimmed) {
            return self.resolve_spotify_album(trimmed);
        }
        if is_deezer_url(trimmed) {
            if let Some(id) = extract_deezer_album_id(trimmed) {
                return self.fetch_deezer_album_by_id(&id);
            }
        }
        if is_qobuz_url(trimmed) {
            if let Some(id) = extract_qobuz_album_id(trimmed) {
                return self.fetch_qobuz_album_by_id(&id);
            }
        }

        Err(AppError::new(
            "acquisition-album-unsupported",
            format!("Unsupported album URL or format: {url_or_query}"),
        ))
    }

    // Spotify metadata extraction (Embed API + Web metadata)
    pub fn resolve_spotify_track(&self, url: &str) -> Result<ResolvedTrack, AppError> {
        let spotify_id = extract_spotify_id(url, "track").ok_or_else(|| {
            AppError::new("invalid-spotify-url", "Not a valid Spotify track URL.")
        })?;

        let embed_url = format!("https://open.spotify.com/embed/track/{spotify_id}");
        let response = self
            .client
            .get(&embed_url)
            .send()
            .map_err(|e| AppError::new("spotify-fetch-failed", e.to_string()))?;

        if !response.status().is_success() {
            // Try oEmbed fallback
            return self.resolve_spotify_oembed(&spotify_id);
        }

        let html = response
            .text()
            .map_err(|e| AppError::new("spotify-html-failed", e.to_string()))?;

        parse_spotify_embed_html(&html)
    }

    fn resolve_spotify_oembed(&self, spotify_id: &str) -> Result<ResolvedTrack, AppError> {
        let oembed_url = format!(
            "https://open.spotify.com/oembed?url=https://open.spotify.com/track/{spotify_id}"
        );
        let resp = self
            .client
            .get(&oembed_url)
            .send()
            .map_err(|e| AppError::new("spotify-oembed-failed", e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                "spotify-oembed-failed",
                "Spotify oEmbed request failed.",
            ));
        }

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("spotify-oembed-json", e.to_string()))?;

        let title = json["title"].as_str().unwrap_or_default().to_string();
        let artist = json["author_name"].as_str().unwrap_or_default().to_string();
        let artwork_url = json["thumbnail_url"].as_str().map(str::to_string);

        Ok(ResolvedTrack {
            title,
            artists: if artist.is_empty() {
                Vec::new()
            } else {
                vec![artist]
            },
            artwork_url,
            ..Default::default()
        })
    }

    pub fn resolve_spotify_album(&self, url: &str) -> Result<ResolvedAlbum, AppError> {
        let spotify_id = extract_spotify_id(url, "album").ok_or_else(|| {
            AppError::new("invalid-spotify-url", "Not a valid Spotify album URL.")
        })?;

        let embed_url = format!("https://open.spotify.com/embed/album/{spotify_id}");
        let response = self
            .client
            .get(&embed_url)
            .send()
            .map_err(|e| AppError::new("spotify-album-fetch-failed", e.to_string()))?;

        if !response.status().is_success() {
            return Err(AppError::new(
                "spotify-album-failed",
                format!(
                    "Failed to fetch Spotify album embed (HTTP {})",
                    response.status()
                ),
            ));
        }

        let html = response
            .text()
            .map_err(|e| AppError::new("spotify-album-html-failed", e.to_string()))?;

        parse_spotify_album_embed_html(&html)
    }

    // Cross-service link mapping via Odesli (Songlink) API
    pub fn resolve_odesli_links(&self, url: &str) -> Result<Value, AppError> {
        let endpoint = format!(
            "https://api.song.link/v1-alpha.1/links?url={}",
            urlencoding::encode(url)
        );
        let resp = self
            .client
            .get(&endpoint)
            .send()
            .map_err(|e| AppError::new("odesli-failed", e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                "odesli-error",
                format!("Odesli API returned status {}", resp.status()),
            ));
        }

        resp.json::<Value>()
            .map_err(|e| AppError::new("odesli-json-parse", e.to_string()))
    }

    // Direct ISRC search on Deezer
    pub fn search_deezer_isrc(&self, isrc: &str) -> Result<ResolvedTrack, AppError> {
        let url = format!("https://api.deezer.com/track/isrc:{isrc}");
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("deezer-isrc-failed", e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                "deezer-isrc-failed",
                format!("Deezer returned HTTP {}", resp.status()),
            ));
        }

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("deezer-json-failed", e.to_string()))?;

        if json.get("error").is_some() || json["id"].is_null() {
            return Err(AppError::new(
                "deezer-track-not-found",
                "Track not found on Deezer",
            ));
        }

        parse_deezer_track_json(&json)
    }

    pub fn fetch_deezer_track_by_id(&self, id: &str) -> Result<ResolvedTrack, AppError> {
        let url = format!("https://api.deezer.com/track/{id}");
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("deezer-track-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("deezer-json-failed", e.to_string()))?;

        parse_deezer_track_json(&json)
    }

    pub fn search_deezer_by_metadata(
        &self,
        title: &str,
        artist: &str,
    ) -> Result<ResolvedTrack, AppError> {
        let query = format!("track:\"{}\" artist:\"{}\"", title, artist);
        let url = format!(
            "https://api.deezer.com/search/track?q={}&limit=5",
            urlencoding::encode(&query)
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("deezer-search-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("deezer-json-failed", e.to_string()))?;

        if let Some(items) = json["data"].as_array() {
            if let Some(first) = items.first() {
                return parse_deezer_track_json(first);
            }
        }

        Err(AppError::new(
            "deezer-not-found",
            "Track not found via Deezer search",
        ))
    }

    pub fn fetch_deezer_album_by_id(&self, album_id: &str) -> Result<ResolvedAlbum, AppError> {
        let url = format!("https://api.deezer.com/album/{album_id}");
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("deezer-album-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("deezer-album-json-failed", e.to_string()))?;

        let title = json["title"].as_str().unwrap_or_default().to_string();
        let artist = json["artist"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let artwork_url = json["cover_xl"]
            .as_str()
            .or_else(|| json["cover_big"].as_str())
            .map(str::to_string);
        let release_date = json["release_date"].as_str().map(str::to_string);
        let year = release_date
            .as_ref()
            .and_then(|d| d.split('-').next())
            .and_then(|y| y.parse::<u32>().ok());

        let mut tracks = Vec::new();
        if let Some(track_list) = json["tracks"]["data"].as_array() {
            for (idx, item) in track_list.iter().enumerate() {
                if let Ok(mut resolved) = parse_deezer_track_json(item) {
                    if resolved.track_number.is_none() || resolved.track_number == Some(0) {
                        resolved.track_number = Some((idx + 1) as u32);
                    }
                    if resolved.disc_number.is_none() || resolved.disc_number == Some(0) {
                        resolved.disc_number = Some(1);
                    }
                    if resolved.album.is_empty() {
                        resolved.album = title.clone();
                    }
                    if resolved.artwork_url.is_none() {
                        resolved.artwork_url = artwork_url.clone();
                    }
                    tracks.push(resolved);
                }
            }
        }

        Ok(ResolvedAlbum {
            id: Some(album_id.to_string()),
            title,
            artists: if artist.is_empty() {
                Vec::new()
            } else {
                vec![artist]
            },
            year,
            date: release_date,
            artwork_url,
            label: json["label"].as_str().map(str::to_string),
            total_tracks: Some(tracks.len() as u32),
            tracks,
        })
    }

fn clean_search_title(album_title: &str, artist: &str) -> String {
    let mut t = album_title.trim();
    // 1. Remove leading "Artist - " or "Artist : "
    if !artist.is_empty() && t.to_lowercase().starts_with(&artist.to_lowercase()) {
        t = t[artist.len()..].trim_start_matches(|c: char| c == ' ' || c == '-' || c == ':' || c == '_');
    }
    // 2. Remove leading year pattern: 19xx or 20xx e.g. "2008 - " or "[2008] - " or "(2008) - "
    if let Some(pos) = t.find(|c: char| c == '-' || c == ':' || c == '_') {
        let prefix = t[..pos]
            .trim()
            .trim_matches(|c: char| c == '[' || c == ']' || c == '(' || c == ')');
        if prefix.len() == 4 && prefix.chars().all(|c| c.is_ascii_digit()) {
            t = t[pos + 1..].trim();
        }
    }
    // 3. Remove repeating artist if after year
    if !artist.is_empty() && t.to_lowercase().starts_with(&artist.to_lowercase()) {
        t = t[artist.len()..].trim_start_matches(|c: char| c == ' ' || c == '-' || c == ':' || c == '_');
    }
    // 4. Split off parenthesis/brackets
    let clean = t
        .split('(')
        .next()
        .unwrap_or(t)
        .split('[')
        .next()
        .unwrap_or(t)
        .trim();
    if !clean.is_empty() {
        clean.to_string()
    } else {
        t.to_string()
    }
}

    pub fn search_deezer_album(
        &self,
        artist: &str,
        album_title: &str,
    ) -> Result<ResolvedAlbum, AppError> {
        let primary_artist = artist
            .split(',')
            .next()
            .unwrap_or(artist)
            .split('&')
            .next()
            .unwrap_or(artist)
            .split(" feat")
            .next()
            .unwrap_or(artist)
            .trim();

        let clean_title = Self::clean_search_title(album_title, primary_artist);

        let queries = vec![
            if !primary_artist.is_empty() {
                format!("artist:\"{}\" album:\"{}\"", primary_artist, clean_title)
            } else {
                format!("album:\"{}\"", clean_title)
            },
            if !primary_artist.is_empty() {
                format!("{} {}", primary_artist, clean_title)
            } else {
                clean_title.clone()
            },
            if !primary_artist.is_empty() && clean_title != album_title {
                format!("artist:\"{}\" album:\"{}\"", primary_artist, album_title)
            } else {
                String::new()
            },
            if !primary_artist.is_empty() && clean_title != album_title {
                format!("{} {}", primary_artist, album_title)
            } else {
                String::new()
            },
            clean_title.clone(),
            album_title.to_string(),
        ];

        for query in &queries {
            if query.trim().is_empty() {
                continue;
            }
            let url = format!(
                "https://api.deezer.com/search/album?q={}",
                urlencoding::encode(query)
            );
            if let Ok(resp) = self.client.get(&url).send() {
                if let Ok(json) = resp.json::<Value>() {
                    if let Some(items) = json["data"].as_array() {
                        if let Some(first) = items.first() {
                            if let Some(album_id) = first["id"].as_i64() {
                                if let Ok(res) =
                                    self.fetch_deezer_album_by_id(&album_id.to_string())
                                {
                                    return Ok(res);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback: search tracks to locate album
        let track_query = if !primary_artist.is_empty() {
            format!("{} {}", primary_artist, clean_title)
        } else {
            clean_title
        };
        let track_url = format!(
            "https://api.deezer.com/search/track?q={}",
            urlencoding::encode(&track_query)
        );
        if let Ok(resp) = self.client.get(&track_url).send() {
            if let Ok(json) = resp.json::<Value>() {
                if let Some(items) = json["data"].as_array() {
                    if let Some(first) = items.first() {
                        if let Some(album_id) = first["album"]["id"].as_i64() {
                            if let Ok(res) =
                                self.fetch_deezer_album_by_id(&album_id.to_string())
                            {
                                return Ok(res);
                            }
                        }
                    }
                }
            }
        }

        Err(AppError::new(
            "deezer-album-not-found",
            "Album not found via Deezer search",
        ))
    }

    pub fn search_deezer_artist_discography(
        &self,
        artist_name: &str,
    ) -> Result<Vec<crate::persistence::RemoteReleasePayload>, AppError> {
        let search_url = format!(
            "https://api.deezer.com/search/artist?q={}",
            urlencoding::encode(artist_name)
        );
        let resp = self
            .client
            .get(&search_url)
            .send()
            .map_err(|e| AppError::new("deezer-search-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("deezer-json-failed", e.to_string()))?;

        let mut artist_id_opt = None;
        let norm_target = artist_name.trim().to_lowercase();

        if let Some(items) = json["data"].as_array() {
            for item in items {
                let name = item["name"]
                    .as_str()
                    .unwrap_or_default()
                    .trim()
                    .to_lowercase();
                if name == norm_target || name.contains(&norm_target) || norm_target.contains(&name)
                {
                    if let Some(id) = item["id"].as_i64() {
                        artist_id_opt = Some(id);
                        break;
                    }
                }
            }
            if artist_id_opt.is_none() && !items.is_empty() {
                artist_id_opt = items[0]["id"].as_i64();
            }
        }

        let Some(artist_id) = artist_id_opt else {
            return Ok(Vec::new());
        };

        let albums_url = format!("https://api.deezer.com/artist/{artist_id}/albums?limit=100");
        let resp = self
            .client
            .get(&albums_url)
            .send()
            .map_err(|e| AppError::new("deezer-albums-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("deezer-json-failed", e.to_string()))?;

        let mut releases = Vec::new();
        if let Some(items) = json["data"].as_array() {
            for item in items {
                let album_id = item["id"].to_string();
                let title = item["title"].as_str().unwrap_or_default().to_string();
                if title.is_empty() {
                    continue;
                }
                let release_date = item["release_date"].as_str().map(str::to_string);
                let year = release_date
                    .as_ref()
                    .and_then(|d| d.split('-').next())
                    .and_then(|y| y.parse::<u32>().ok());
                let artwork_url = item["cover_xl"]
                    .as_str()
                    .or_else(|| item["cover_big"].as_str())
                    .or_else(|| item["cover_medium"].as_str())
                    .map(str::to_string);
                let record_type = item["record_type"].as_str().unwrap_or("album").to_string();

                releases.push(crate::persistence::RemoteReleasePayload {
                    id: format!("remote:deezer-{}", album_id),
                    musicbrainz_release_group_id: format!("deezer-{}", album_id),
                    title,
                    year,
                    date: release_date,
                    primary_type: Some(record_type),
                    secondary_types: Vec::new(),
                    disambiguation: None,
                    catalog_number: None,
                    label: None,
                    artwork_url,
                    artwork_attribution: Some("Deezer".into()),
                    artwork_source: Some("deezer.com".into()),
                    artists: vec![crate::ArtistReference {
                        id: format!("deezer-{}", artist_id),
                        name: artist_name.to_string(),
                    }],
                    raw_json: serde_json::to_string(item).unwrap_or_default(),
                });
            }
        }

        Ok(releases)
    }

    // Direct ISRC search on Qobuz
    pub fn search_qobuz_isrc(&self, isrc: &str) -> Result<ResolvedTrack, AppError> {
        let url = format!(
            "https://www.qobuz.com/api.json/0.2/track/search?query={}&app_id={}&limit=5",
            urlencoding::encode(isrc),
            self.qobuz_app_id
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("qobuz-isrc-failed", e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                "qobuz-isrc-failed",
                format!("Qobuz returned HTTP {}", resp.status()),
            ));
        }

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("qobuz-json-failed", e.to_string()))?;

        if let Some(items) = json["tracks"]["items"].as_array() {
            for item in items {
                if let Some(item_isrc) = item["isrc"].as_str() {
                    if item_isrc.eq_ignore_ascii_case(isrc) {
                        return parse_qobuz_track_json(item);
                    }
                }
            }
            if let Some(first) = items.first() {
                return parse_qobuz_track_json(first);
            }
        }

        Err(AppError::new("qobuz-not-found", "Track not found on Qobuz"))
    }

    pub fn fetch_qobuz_track_by_id(&self, id: &str) -> Result<ResolvedTrack, AppError> {
        let url = format!(
            "https://www.qobuz.com/api.json/0.2/track/get?track_id={id}&app_id={}",
            self.qobuz_app_id
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("qobuz-track-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("qobuz-json-failed", e.to_string()))?;

        parse_qobuz_track_json(&json)
    }

    pub fn search_qobuz_by_metadata(
        &self,
        title: &str,
        artist: &str,
    ) -> Result<ResolvedTrack, AppError> {
        let query = format!("{} {}", title, artist);
        let url = format!(
            "https://www.qobuz.com/api.json/0.2/track/search?query={}&app_id={}&limit=5",
            urlencoding::encode(&query),
            self.qobuz_app_id
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("qobuz-search-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("qobuz-json-failed", e.to_string()))?;

        if let Some(items) = json["tracks"]["items"].as_array() {
            if let Some(first) = items.first() {
                return parse_qobuz_track_json(first);
            }
        }

        Err(AppError::new(
            "qobuz-not-found",
            "Track not found via Qobuz search",
        ))
    }

    pub fn fetch_qobuz_album_by_id(&self, album_id: &str) -> Result<ResolvedAlbum, AppError> {
        let url = format!(
            "https://www.qobuz.com/api.json/0.2/album/get?album_id={album_id}&app_id={}",
            self.qobuz_app_id
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| AppError::new("qobuz-album-failed", e.to_string()))?;

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("qobuz-album-json-failed", e.to_string()))?;

        let title = json["title"].as_str().unwrap_or_default().to_string();
        let artist = json["artist"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let artwork_url = json["image"]["large"]
            .as_str()
            .or_else(|| json["image"]["extralarge"].as_str())
            .map(str::to_string);
        let release_date = json["release_date_original"].as_str().map(str::to_string);
        let year = release_date
            .as_ref()
            .and_then(|d| d.split('-').next())
            .and_then(|y| y.parse::<u32>().ok());

        let mut tracks = Vec::new();
        if let Some(track_list) = json["tracks"]["items"].as_array() {
            for item in track_list {
                if let Ok(mut resolved) = parse_qobuz_track_json(item) {
                    if resolved.album.is_empty() {
                        resolved.album = title.clone();
                    }
                    if resolved.artwork_url.is_none() {
                        resolved.artwork_url = artwork_url.clone();
                    }
                    tracks.push(resolved);
                }
            }
        }

        Ok(ResolvedAlbum {
            id: Some(album_id.to_string()),
            title,
            artists: if artist.is_empty() {
                Vec::new()
            } else {
                vec![artist]
            },
            year,
            date: release_date,
            artwork_url,
            label: json["label"]["name"].as_str().map(str::to_string),
            total_tracks: Some(tracks.len() as u32),
            tracks,
        })
    }

    // MusicBrainz / Soundcharts / Soundplate fallback lookup
    pub fn find_isrc_fallback(
        &self,
        title: &str,
        artist: &str,
        album: &str,
    ) -> Result<String, AppError> {
        let query = if !album.is_empty() {
            format!(
                "recording:\"{}\" AND artist:\"{}\" AND release:\"{}\"",
                title, artist, album
            )
        } else {
            format!("recording:\"{}\" AND artist:\"{}\"", title, artist)
        };

        let mb_url = format!(
            "https://musicbrainz.org/ws/2/recording?query={}&fmt=json&limit=5",
            urlencoding::encode(&query)
        );

        let resp = self
            .client
            .get(&mb_url)
            .header(
                "User-Agent",
                format!(
                    "Bebop/{} (https://github.com/dbgoodm/Bebop)",
                    env!("CARGO_PKG_VERSION")
                ),
            )
            .send()
            .map_err(|e| AppError::new("mb-isrc-failed", e.to_string()))?;

        if resp.status().is_success() {
            if let Ok(json) = resp.json::<Value>() {
                if let Some(recordings) = json["recordings"].as_array() {
                    for rec in recordings {
                        if let Some(isrcs) = rec["isrcs"].as_array() {
                            if let Some(first_isrc) = isrcs.first().and_then(|v| v.as_str()) {
                                if !first_isrc.trim().is_empty() {
                                    return Ok(first_isrc.trim().to_uppercase());
                                }
                            }
                        }
                    }
                }
            }
        }

        Err(AppError::new(
            "isrc-fallback-failed",
            "Could not find ISRC through MusicBrainz fallback.",
        ))
    }
}

pub fn is_spotify_url(url: &str) -> bool {
    url.contains("spotify.com/") || url.starts_with("spotify:")
}

pub fn is_deezer_url(url: &str) -> bool {
    url.contains("deezer.com/") || url.contains("deezer.page.link")
}

pub fn is_qobuz_url(url: &str) -> bool {
    url.contains("qobuz.com/")
}

pub fn is_tidal_url(url: &str) -> bool {
    url.contains("tidal.com/")
}

pub fn extract_spotify_id(url: &str, entity_type: &str) -> Option<String> {
    if let Some(stripped) = url.strip_prefix("spotify:") {
        let parts: Vec<&str> = stripped.split(':').collect();
        if parts.len() == 2 && parts[0] == entity_type {
            return Some(parts[1].to_string());
        }
    }

    let pattern = format!("/{entity_type}/");
    if let Some(idx) = url.find(&pattern) {
        let after = &url[idx + pattern.len()..];
        let id = after.split(['?', '/', '&', '#']).next()?;
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

pub fn extract_deezer_id(url: &str) -> Option<String> {
    if let Some(idx) = url.find("/track/") {
        let after = &url[idx + 7..];
        let id = after.split(['?', '/', '&', '#']).next()?;
        if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
            return Some(id.to_string());
        }
    }
    None
}

pub fn extract_deezer_album_id(url: &str) -> Option<String> {
    if let Some(idx) = url.find("/album/") {
        let after = &url[idx + 7..];
        let id = after.split(['?', '/', '&', '#']).next()?;
        if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
            return Some(id.to_string());
        }
    }
    None
}

pub fn extract_qobuz_id(url: &str) -> Option<String> {
    if let Some(idx) = url.find("/track/") {
        let after = &url[idx + 7..];
        let id = after.split(['?', '/', '&', '#']).next()?;
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

pub fn extract_qobuz_album_id(url: &str) -> Option<String> {
    if let Some(idx) = url.find("/album/") {
        let after = &url[idx + 7..];
        let id = after.split(['?', '/', '&', '#']).next()?;
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

pub fn extract_tidal_id(url: &str) -> Option<String> {
    if let Some(idx) = url.find("/track/") {
        let after = &url[idx + 7..];
        let id = after.split(['?', '/', '&', '#']).next()?;
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

pub fn parse_spotify_embed_html(html: &str) -> Result<ResolvedTrack, AppError> {
    let script_start = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let Some(start_pos) = html.find(script_start) else {
        return Err(AppError::new(
            "spotify-embed-parse",
            "Could not find __NEXT_DATA__ script block in Spotify embed HTML.",
        ));
    };

    let content_start = start_pos + script_start.len();
    let Some(end_pos) = html[content_start..].find("</script>") else {
        return Err(AppError::new(
            "spotify-embed-parse",
            "Unclosed __NEXT_DATA__ script block.",
        ));
    };

    let json_str = &html[content_start..content_start + end_pos];
    let json: Value = serde_json::from_str(json_str)
        .map_err(|e| AppError::new("spotify-embed-json-error", e.to_string()))?;

    let entity = &json["props"]["pageProps"]["state"]["data"]["entity"];
    if entity.is_null() {
        return Err(AppError::new(
            "spotify-embed-empty",
            "Entity data missing in Spotify embed JSON.",
        ));
    }

    let title = entity["name"].as_str().unwrap_or_default().to_string();
    let mut artists = Vec::new();
    if let Some(artist_arr) = entity["artists"].as_array() {
        for a in artist_arr {
            if let Some(name) = a["name"].as_str() {
                artists.push(name.to_string());
            }
        }
    }

    let album = entity["album"]["name"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let artwork_url = entity["album"]["images"]
        .as_array()
        .and_then(|images| images.first())
        .and_then(|img| img["url"].as_str())
        .map(str::to_string);

    let release_date = entity["releaseDate"]["isoString"]
        .as_str()
        .map(str::to_string);
    let year = release_date
        .as_ref()
        .and_then(|d| d.split('-').next())
        .and_then(|y| y.parse::<u32>().ok());

    let duration_ms = entity["duration"].as_u64();
    let track_number = entity["trackNumber"].as_u64().map(|n| n as u32);
    let disc_number = entity["discNumber"].as_u64().map(|n| n as u32);
    let isrc = entity["external_ids"]["isrc"]
        .as_str()
        .or_else(|| entity["isrc"].as_str())
        .map(str::to_string);

    Ok(ResolvedTrack {
        title,
        artists: if artists.is_empty() {
            vec!["Unknown Artist".to_string()]
        } else {
            artists.clone()
        },
        album,
        album_artists: artists,
        track_number,
        disc_number,
        year,
        date: release_date,
        isrc,
        duration_ms,
        artwork_url,
        ..Default::default()
    })
}

pub fn parse_spotify_album_embed_html(html: &str) -> Result<ResolvedAlbum, AppError> {
    let script_start = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let Some(start_pos) = html.find(script_start) else {
        return Err(AppError::new(
            "spotify-album-embed-parse",
            "Could not find __NEXT_DATA__ in Spotify album embed HTML.",
        ));
    };

    let content_start = start_pos + script_start.len();
    let Some(end_pos) = html[content_start..].find("</script>") else {
        return Err(AppError::new(
            "spotify-album-embed-parse",
            "Unclosed __NEXT_DATA__ script block in album embed.",
        ));
    };

    let json_str = &html[content_start..content_start + end_pos];
    let json: Value = serde_json::from_str(json_str)
        .map_err(|e| AppError::new("spotify-album-embed-json", e.to_string()))?;

    let entity = &json["props"]["pageProps"]["state"]["data"]["entity"];
    let album_title = entity["name"].as_str().unwrap_or_default().to_string();
    let mut album_artists = Vec::new();
    if let Some(arr) = entity["artists"].as_array() {
        for a in arr {
            if let Some(name) = a["name"].as_str() {
                album_artists.push(name.to_string());
            }
        }
    }

    let artwork_url = entity["images"]
        .as_array()
        .and_then(|images| images.first())
        .and_then(|img| img["url"].as_str())
        .map(str::to_string);

    let release_date = entity["releaseDate"]["isoString"]
        .as_str()
        .map(str::to_string);
    let year = release_date
        .as_ref()
        .and_then(|d| d.split('-').next())
        .and_then(|y| y.parse::<u32>().ok());

    let mut tracks = Vec::new();
    if let Some(track_list) = entity["trackList"].as_array() {
        for item in track_list {
            let track_title = item["title"].as_str().unwrap_or_default().to_string();
            let mut artists = Vec::new();
            if let Some(subtitle) = item["subtitle"].as_str() {
                artists.push(subtitle.to_string());
            }
            if artists.is_empty() {
                artists = album_artists.clone();
            }
            let duration_ms = item["duration"].as_u64();
            let track_number = item["trackNumber"].as_u64().map(|n| n as u32);
            let isrc = item["isrc"].as_str().map(str::to_string);

            tracks.push(ResolvedTrack {
                title: track_title,
                artists: artists.clone(),
                album: album_title.clone(),
                album_artists: album_artists.clone(),
                track_number,
                disc_number: Some(1),
                year,
                date: release_date.clone(),
                isrc,
                duration_ms,
                artwork_url: artwork_url.clone(),
                ..Default::default()
            });
        }
    }

    Ok(ResolvedAlbum {
        id: None,
        title: album_title,
        artists: album_artists,
        year,
        date: release_date,
        artwork_url,
        label: None,
        total_tracks: Some(tracks.len() as u32),
        tracks,
    })
}

pub fn parse_deezer_track_json(json: &Value) -> Result<ResolvedTrack, AppError> {
    let id = json["id"].to_string();
    let title = json["title"].as_str().unwrap_or_default().to_string();
    let artist = json["artist"]["name"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let album = json["album"]["title"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let isrc = json["isrc"].as_str().map(str::to_string);
    let duration_ms = json["duration"].as_u64().map(|s| s * 1000);
    let track_number = json["track_position"]
        .as_u64()
        .or_else(|| json["position"].as_u64())
        .or_else(|| json["track_number"].as_u64())
        .map(|n| n as u32);
    let disc_number = json["disk_number"]
        .as_u64()
        .or_else(|| json["disc_number"].as_u64())
        .map(|n| n as u32);
    let release_date = json["release_date"].as_str().map(str::to_string);
    let year = release_date
        .as_ref()
        .and_then(|d| d.split('-').next())
        .and_then(|y| y.parse::<u32>().ok());
    let artwork_url = json["album"]["cover_xl"]
        .as_str()
        .or_else(|| json["album"]["cover_big"].as_str())
        .or_else(|| json["album"]["cover_medium"].as_str())
        .map(str::to_string);

    Ok(ResolvedTrack {
        title,
        artists: if artist.is_empty() {
            Vec::new()
        } else {
            vec![artist.clone()]
        },
        album,
        album_artists: if artist.is_empty() {
            Vec::new()
        } else {
            vec![artist]
        },
        track_number,
        disc_number,
        year,
        date: release_date,
        isrc,
        duration_ms,
        artwork_url,
        deezer_id: Some(id),
        ..Default::default()
    })
}

pub fn parse_qobuz_track_json(json: &Value) -> Result<ResolvedTrack, AppError> {
    let id = json["id"].to_string();
    let title = json["title"].as_str().unwrap_or_default().to_string();
    let artist = json["performer"]["name"]
        .as_str()
        .or_else(|| json["artist"]["name"].as_str())
        .unwrap_or_default()
        .to_string();
    let album = json["album"]["title"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let isrc = json["isrc"].as_str().map(str::to_string);
    let duration_ms = json["duration"].as_u64().map(|s| s * 1000);
    let track_number = json["track_number"].as_u64().map(|n| n as u32);
    let disc_number = json["media_number"].as_u64().map(|n| n as u32);
    let artwork_url = json["album"]["image"]["large"]
        .as_str()
        .or_else(|| json["album"]["image"]["extralarge"].as_str())
        .or_else(|| json["album"]["image"]["small"].as_str())
        .map(str::to_string);

    Ok(ResolvedTrack {
        title,
        artists: if artist.is_empty() {
            Vec::new()
        } else {
            vec![artist.clone()]
        },
        album,
        album_artists: if artist.is_empty() {
            Vec::new()
        } else {
            vec![artist]
        },
        track_number,
        disc_number,
        isrc,
        duration_ms,
        artwork_url,
        qobuz_id: Some(id),
        ..Default::default()
    })
}

fn merge_odesli_data(target: &mut ResolvedTrack, odesli: &Value) {
    if let Some(entities) = odesli["entitiesByUniqueId"].as_object() {
        for (key, entity) in entities {
            if key.starts_with("DEEZER_SONG::") && target.deezer_id.is_none() {
                if let Some(id) = entity["id"].as_str() {
                    target.deezer_id = Some(id.to_string());
                }
            } else if key.starts_with("TIDAL_SONG::") && target.tidal_id.is_none() {
                if let Some(id) = entity["id"].as_str() {
                    target.tidal_id = Some(id.to_string());
                }
            } else if key.starts_with("QOBUZ_SONG::") && target.qobuz_id.is_none() {
                if let Some(id) = entity["id"].as_str() {
                    target.qobuz_id = Some(id.to_string());
                }
            }

            if target.title.is_empty() {
                if let Some(title) = entity["title"].as_str() {
                    target.title = title.to_string();
                }
            }
            if target.artists.is_empty() {
                if let Some(artist) = entity["artistName"].as_str() {
                    target.artists = vec![artist.to_string()];
                }
            }
            if target.artwork_url.is_none() {
                if let Some(thumbnail) = entity["thumbnailUrl"].as_str() {
                    target.artwork_url = Some(thumbnail.to_string());
                }
            }
        }
    }
}

fn merge_resolved_track(target: &mut ResolvedTrack, source: ResolvedTrack) {
    if target.title.is_empty() {
        target.title = source.title;
    }
    if target.artists.is_empty() {
        target.artists = source.artists;
    }
    if target.album.is_empty() {
        target.album = source.album;
    }
    if target.album_artists.is_empty() {
        target.album_artists = source.album_artists;
    }
    if target.track_number.is_none() {
        target.track_number = source.track_number;
    }
    if target.track_total.is_none() {
        target.track_total = source.track_total;
    }
    if target.disc_number.is_none() {
        target.disc_number = source.disc_number;
    }
    if target.disc_total.is_none() {
        target.disc_total = source.disc_total;
    }
    if target.year.is_none() {
        target.year = source.year;
    }
    if target.date.is_none() {
        target.date = source.date;
    }
    if target.isrc.is_none() {
        target.isrc = source.isrc;
    }
    if target.duration_ms.is_none() {
        target.duration_ms = source.duration_ms;
    }
    if target.artwork_url.is_none() {
        target.artwork_url = source.artwork_url;
    }
    if target.genres.is_empty() {
        target.genres = source.genres;
    }
    if target.label.is_none() {
        target.label = source.label;
    }
    if target.catalog_number.is_none() {
        target.catalog_number = source.catalog_number;
    }
    if target.composer.is_none() {
        target.composer = source.composer;
    }
    if target.musicbrainz_recording_id.is_none() {
        target.musicbrainz_recording_id = source.musicbrainz_recording_id;
    }
    if target.qobuz_id.is_none() {
        target.qobuz_id = source.qobuz_id;
    }
    if target.deezer_id.is_none() {
        target.deezer_id = source.deezer_id;
    }
    if target.tidal_id.is_none() {
        target.tidal_id = source.tidal_id;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_spotify_id() {
        assert_eq!(
            extract_spotify_id(
                "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=123",
                "track"
            ),
            Some("4cOdK2wGLETKBW3PvgPWqT".to_string())
        );
        assert_eq!(
            extract_spotify_id("spotify:track:4cOdK2wGLETKBW3PvgPWqT", "track"),
            Some("4cOdK2wGLETKBW3PvgPWqT".to_string())
        );
        assert_eq!(
            extract_spotify_id(
                "https://open.spotify.com/intl-fr/album/1DFixLWuPkv3KT3TnV35m3",
                "album"
            ),
            Some("1DFixLWuPkv3KT3TnV35m3".to_string())
        );
    }

    #[test]
    fn test_extract_deezer_and_qobuz_ids() {
        assert_eq!(
            extract_deezer_id("https://www.deezer.com/track/3135556?utm_source=..."),
            Some("3135556".to_string())
        );
        assert_eq!(
            extract_deezer_album_id("https://www.deezer.com/album/302127"),
            Some("302127".to_string())
        );
        assert_eq!(
            extract_qobuz_id("https://open.qobuz.com/track/12345678"),
            Some("12345678".to_string())
        );
    }

    #[test]
    fn test_parse_spotify_embed_html() {
        let fixture_html = r#"
        <!DOCTYPE html>
        <html>
        <head>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "props": {
                "pageProps": {
                    "state": {
                        "data": {
                            "entity": {
                                "name": "Never Gonna Give You Up",
                                "artists": [{"name": "Rick Astley"}],
                                "album": {
                                    "name": "Whenever You Need Somebody",
                                    "images": [{"url": "https://i.scdn.co/image/ab67616d0000b2735755e164993798e0c9ef7d7a"}]
                                },
                                "releaseDate": {"isoString": "1987-11-12T00:00:00.000Z"},
                                "duration": 213000,
                                "trackNumber": 1,
                                "discNumber": 1,
                                "isrc": "GBARL9300134"
                            }
                        }
                    }
                }
            }
        }
        </script>
        </head>
        <body></body>
        </html>
        "#;

        let resolved = parse_spotify_embed_html(fixture_html).expect("parsed spotify embed");
        assert_eq!(resolved.title, "Never Gonna Give You Up");
        assert_eq!(resolved.artists, vec!["Rick Astley"]);
        assert_eq!(resolved.album, "Whenever You Need Somebody");
        assert_eq!(resolved.isrc.as_deref(), Some("GBARL9300134"));
        assert_eq!(resolved.year, Some(1987));
        assert_eq!(resolved.duration_ms, Some(213000));
        assert_eq!(
            resolved.artwork_url.as_deref(),
            Some("https://i.scdn.co/image/ab67616d0000b2735755e164993798e0c9ef7d7a")
        );
    }

    #[test]
    fn test_parse_deezer_track_json() {
        let json: Value = serde_json::json!({
            "id": 3135556,
            "title": "Harder, Better, Faster, Stronger",
            "duration": 224,
            "track_position": 4,
            "disk_number": 1,
            "release_date": "2001-03-07",
            "isrc": "FRZ030100200",
            "artist": {
                "id": 27,
                "name": "Daft Punk"
            },
            "album": {
                "id": 302127,
                "title": "Discovery",
                "cover_xl": "https://e-cdns-images.dzcdn.net/images/cover/xl.jpg"
            }
        });

        let track = parse_deezer_track_json(&json).expect("parsed deezer json");
        assert_eq!(track.title, "Harder, Better, Faster, Stronger");
        assert_eq!(track.artists, vec!["Daft Punk"]);
        assert_eq!(track.album, "Discovery");
        assert_eq!(track.isrc.as_deref(), Some("FRZ030100200"));
        assert_eq!(track.year, Some(2001));
        assert_eq!(track.track_number, Some(4));
        assert_eq!(track.deezer_id.as_deref(), Some("3135556"));
    }

    #[test]
    fn test_parse_spotify_album_embed_html() {
        let fixture_html = r#"
        <!DOCTYPE html>
        <html>
        <head>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "props": {
                "pageProps": {
                    "state": {
                        "data": {
                            "entity": {
                                "name": "Discovery",
                                "artists": [{"name": "Daft Punk"}],
                                "images": [{"url": "https://i.scdn.co/image/discovery.jpg"}],
                                "releaseDate": {"isoString": "2001-03-12T00:00:00.000Z"},
                                "trackList": [
                                    {
                                        "title": "One More Time",
                                        "subtitle": "Daft Punk",
                                        "duration": 320000,
                                        "trackNumber": 1,
                                        "isrc": "FRZ030100100"
                                    },
                                    {
                                        "title": "Aerodynamic",
                                        "subtitle": "Daft Punk",
                                        "duration": 207000,
                                        "trackNumber": 2,
                                        "isrc": "FRZ030100110"
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        }
        </script>
        </head>
        <body></body>
        </html>
        "#;

        let album = parse_spotify_album_embed_html(fixture_html).expect("parsed album");
        assert_eq!(album.title, "Discovery");
        assert_eq!(album.artists, vec!["Daft Punk"]);
        assert_eq!(album.year, Some(2001));
        assert_eq!(album.tracks.len(), 2);
        assert_eq!(album.tracks[0].title, "One More Time");
        assert_eq!(album.tracks[0].track_number, Some(1));
        assert_eq!(album.tracks[1].title, "Aerodynamic");
        assert_eq!(album.tracks[1].track_number, Some(2));
    }

    #[test]
    fn test_parse_qobuz_track_json() {
        let json: Value = serde_json::json!({
            "id": 1234567,
            "title": "Get Lucky",
            "duration": 248,
            "track_number": 8,
            "media_number": 1,
            "isrc": "USX123456789",
            "performer": {
                "name": "Daft Punk feat. Pharrell Williams"
            },
            "album": {
                "title": "Random Access Memories",
                "image": {
                    "large": "https://static.qobuz.com/images/covers/ram.jpg"
                }
            }
        });

        let track = parse_qobuz_track_json(&json).expect("parsed qobuz json");
        assert_eq!(track.title, "Get Lucky");
        assert_eq!(track.artists, vec!["Daft Punk feat. Pharrell Williams"]);
        assert_eq!(track.album, "Random Access Memories");
        assert_eq!(track.isrc.as_deref(), Some("USX123456789"));
        assert_eq!(track.track_number, Some(8));
        assert_eq!(track.qobuz_id.as_deref(), Some("1234567"));
    }

    #[test]
    fn test_merge_odesli_data() {
        let mut track = ResolvedTrack {
            title: "Song Title".to_string(),
            ..Default::default()
        };

        let odesli_json = serde_json::json!({
            "entitiesByUniqueId": {
                "DEEZER_SONG::98765": {
                    "id": "98765",
                    "title": "Song Title",
                    "artistName": "Artist Name",
                    "thumbnailUrl": "https://artwork.jpg"
                },
                "QOBUZ_SONG::54321": {
                    "id": "54321",
                    "title": "Song Title",
                    "artistName": "Artist Name"
                },
                "TIDAL_SONG::11223": {
                    "id": "11223",
                    "title": "Song Title",
                    "artistName": "Artist Name"
                }
            }
        });

        merge_odesli_data(&mut track, &odesli_json);
        assert_eq!(track.deezer_id.as_deref(), Some("98765"));
        assert_eq!(track.qobuz_id.as_deref(), Some("54321"));
        assert_eq!(track.tidal_id.as_deref(), Some("11223"));
        assert_eq!(track.artists, vec!["Artist Name"]);
        assert_eq!(track.artwork_url.as_deref(), Some("https://artwork.jpg"));
    }

    #[test]
    fn test_deezer_search_10_years() {
        let resolver = MetadataResolver::default();
        let res = resolver
            .search_deezer_album("10 Years", "Feeding The Wolves (Deluxe Version)")
            .expect("resolved");
        println!(
            "Resolved album: title={}, id={:?}, tracks={}",
            res.title,
            res.id,
            res.tracks.len()
        );
        assert!(!res.tracks.is_empty());
    }
}
