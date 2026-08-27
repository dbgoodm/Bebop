use std::time::Duration;

use chrono::Utc;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use crate::{AppError, enrichment::MusicBrainzClient, persistence::DatabaseWorker};

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistInformation {
    pub musicbrainz_artist_id: Option<String>,
    pub aliases: Vec<String>,
    pub country: Option<String>,
    pub active_from: Option<String>,
    pub active_to: Option<String>,
    pub genres: Vec<String>,
    pub biography: Option<String>,
    pub canonical_source_url: Option<String>,
    pub image_url: Option<String>,
    pub image_attribution: Option<String>,
    pub refreshed_at: String,
}

impl ArtistInformation {
    fn unavailable() -> Self {
        Self {
            musicbrainz_artist_id: None,
            aliases: Vec::new(),
            country: None,
            active_from: None,
            active_to: None,
            genres: Vec::new(),
            biography: None,
            canonical_source_url: None,
            image_url: None,
            image_attribution: None,
            refreshed_at: Utc::now().to_rfc3339(),
        }
    }
}

pub(crate) fn load_artist_information(
    database: &DatabaseWorker,
    musicbrainz: &MusicBrainzClient,
    artist_id: String,
) -> Result<ArtistInformation, AppError> {
    let artist = database.get_artist_detail(artist_id)?.artist;
    let Some(mbid) = artist.musicbrainz_artist_id else {
        return Ok(ArtistInformation::unavailable());
    };
    let raw = musicbrainz.fetch_artist_record(&mbid)?.raw_json;
    let record: Value = serde_json::from_str(&raw)
        .map_err(|error| AppError::new("musicbrainz-response-invalid", error.to_string()))?;
    let mut information = ArtistInformation {
        musicbrainz_artist_id: Some(mbid.clone()),
        aliases: string_values(record.get("aliases"), "name"),
        country: record
            .get("country")
            .and_then(Value::as_str)
            .map(str::to_owned),
        active_from: record
            .get("life-span")
            .and_then(|life_span| life_span.get("begin"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        active_to: record
            .get("life-span")
            .and_then(|life_span| life_span.get("end"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        genres: string_values(record.get("tags"), "name"),
        biography: None,
        canonical_source_url: None,
        image_url: None,
        image_attribution: None,
        refreshed_at: Utc::now().to_rfc3339(),
    };
    let (wikipedia_url, wikidata_url) = source_relationships(&record);
    let wikipedia_title = wikipedia_url
        .as_deref()
        .and_then(wikipedia_title_from_url)
        .or_else(|| {
            wikidata_url
                .as_deref()
                .and_then(wikidata_id_from_url)
                .and_then(|id| wikipedia_title_from_wikidata(database, &id).ok().flatten())
        });
    if let Some(title) = wikipedia_title {
        if let Some(page) = wikipedia_page(database, &mbid, &title)? {
            information.biography = page.extract;
            information.image_url = page.thumbnail;
            information.canonical_source_url = Some(page.canonical_url);
            information.image_attribution = Some("Wikipedia".into());
        }
    }
    Ok(information)
}

fn string_values(value: Option<&Value>, key: &str) -> Vec<String> {
    let mut values = value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get(key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    values.sort_unstable();
    values.dedup();
    values
}

fn source_relationships(record: &Value) -> (Option<String>, Option<String>) {
    let mut wikipedia = None;
    let mut wikidata = None;
    for relation in record
        .get("relations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let relation_type = relation
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let resource = relation
            .get("url")
            .and_then(|url| url.get("resource"))
            .and_then(Value::as_str);
        match (relation_type.to_ascii_lowercase().as_str(), resource) {
            ("wikipedia", Some(url)) => wikipedia = Some(url.to_owned()),
            ("wikidata", Some(url)) => wikidata = Some(url.to_owned()),
            _ => {}
        }
    }
    (wikipedia, wikidata)
}

fn wikipedia_title_from_url(url: &str) -> Option<String> {
    let (_, title) = url.split_once("/wiki/")?;
    urlencoding::decode(title)
        .ok()
        .map(|title| title.replace('_', " "))
}

fn wikidata_id_from_url(url: &str) -> Option<String> {
    let id = url.rsplit('/').next()?;
    (id.starts_with('Q') && id[1..].chars().all(|character| character.is_ascii_digit()))
        .then(|| id.to_owned())
}

fn wikipedia_title_from_wikidata(
    database: &DatabaseWorker,
    wikidata_id: &str,
) -> Result<Option<String>, AppError> {
    let key = format!("artist-wikidata:{wikidata_id}");
    let raw = cached_json(
        database,
        key,
        format!("https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json"),
        &[],
    )?;
    let json: Value = serde_json::from_str(&raw)
        .map_err(|error| AppError::new("wikidata-response-invalid", error.to_string()))?;
    Ok(json
        .get("entities")
        .and_then(|entities| entities.get(wikidata_id))
        .and_then(|entity| entity.get("sitelinks"))
        .and_then(|sitelinks| sitelinks.get("enwiki"))
        .and_then(|site| site.get("title"))
        .and_then(Value::as_str)
        .map(str::to_owned))
}

struct WikipediaPage {
    extract: Option<String>,
    thumbnail: Option<String>,
    canonical_url: String,
}

fn wikipedia_page(
    database: &DatabaseWorker,
    mbid: &str,
    title: &str,
) -> Result<Option<WikipediaPage>, AppError> {
    let key = format!("artist-wikipedia:{mbid}");
    let raw = cached_json(
        database,
        key,
        "https://en.wikipedia.org/w/api.php".into(),
        &[
            ("action", "query"),
            ("format", "json"),
            ("prop", "extracts|pageimages"),
            ("exintro", "1"),
            ("explaintext", "1"),
            ("redirects", "1"),
            ("pithumbsize", "1000"),
            ("titles", title),
        ],
    )?;
    let json: Value = serde_json::from_str(&raw)
        .map_err(|error| AppError::new("wikipedia-response-invalid", error.to_string()))?;
    let Some(page) = json
        .get("query")
        .and_then(|query| query.get("pages"))
        .and_then(Value::as_object)
        .and_then(|pages| pages.values().next())
    else {
        return Ok(None);
    };
    let Some(resolved_title) = page.get("title").and_then(Value::as_str) else {
        return Ok(None);
    };
    Ok(Some(WikipediaPage {
        extract: page
            .get("extract")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|extract| !extract.is_empty())
            .map(str::to_owned),
        thumbnail: page
            .get("thumbnail")
            .and_then(|thumbnail| thumbnail.get("source"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        canonical_url: format!(
            "https://en.wikipedia.org/wiki/{}",
            urlencoding::encode(&resolved_title.replace(' ', "_"))
        ),
    }))
}

fn cached_json(
    database: &DatabaseWorker,
    cache_key: String,
    url: String,
    query: &[(&str, &str)],
) -> Result<String, AppError> {
    if let Some(raw) = database.get_enrichment_cache(cache_key.clone())? {
        return Ok(raw);
    }
    let response = Client::builder()
        .user_agent(format!(
            "Bebop/{} (https://github.com/dbgoodm/Bebop)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| AppError::new("artist-source-client-failed", error.to_string()))?
        .get(url)
        .query(query)
        .send()
        .map_err(|error| AppError::new("artist-source-request-failed", error.to_string()))?;
    if !response.status().is_success() {
        return Err(AppError::new(
            "artist-source-request-failed",
            format!("Artist source returned HTTP {}.", response.status()),
        ));
    }
    let raw = response
        .text()
        .map_err(|error| AppError::new("artist-source-response-invalid", error.to_string()))?;
    database.save_enrichment_cache(None, cache_key, raw.clone())?;
    Ok(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_wikipedia_and_wikidata_relationships() {
        let record = serde_json::json!({"relations": [
            {"type": "wikidata", "url": {"resource": "https://www.wikidata.org/wiki/Q123"}},
            {"type": "wikipedia", "url": {"resource": "https://en.wikipedia.org/wiki/Artist_Name"}}
        ]});
        let (wikipedia, wikidata) = source_relationships(&record);
        assert_eq!(
            wikipedia.as_deref(),
            Some("https://en.wikipedia.org/wiki/Artist_Name")
        );
        assert_eq!(
            wikidata.as_deref(),
            Some("https://www.wikidata.org/wiki/Q123")
        );
        assert_eq!(
            wikipedia_title_from_url(wikipedia.as_deref().unwrap()),
            Some("Artist Name".into())
        );
    }
}
