use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{MetadataPatch, TrackSummary};

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MetadataJobScope {
    Track,
    Album,
    Artist,
    Library,
}

impl MetadataJobScope {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Track => "track",
            Self::Album => "album",
            Self::Artist => "artist",
            Self::Library => "library",
        }
    }

    pub(crate) fn from_database(value: &str) -> Self {
        match value {
            "track" => Self::Track,
            "album" => Self::Album,
            "artist" => Self::Artist,
            _ => Self::Library,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum MetadataJobStatus {
    Queued,
    Running,
    Paused,
    Review,
    Complete,
    Cancelled,
    Error,
}

impl MetadataJobStatus {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Paused => "paused",
            Self::Review => "review",
            Self::Complete => "complete",
            Self::Cancelled => "cancelled",
            Self::Error => "error",
        }
    }

    pub(crate) fn from_database(value: &str) -> Self {
        match value {
            "running" => Self::Running,
            "paused" => Self::Paused,
            "review" => Self::Review,
            "complete" => Self::Complete,
            "cancelled" => Self::Cancelled,
            "error" => Self::Error,
            _ => Self::Queued,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MetadataJob {
    pub id: String,
    pub scope: MetadataJobScope,
    pub scope_id: Option<String>,
    pub status: MetadataJobStatus,
    pub total_tracks: u32,
    pub processed_tracks: u32,
    pub matched_tracks: u32,
    pub auto_written_tracks: u32,
    pub review_tracks: u32,
    pub failed_tracks: u32,
    pub deferred_tracks: u32,
    pub current_track_id: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataDiff {
    pub track_id: String,
    pub field: String,
    pub before: Option<String>,
    pub after: Option<String>,
    pub source: String,
    pub confidence: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MetadataReview {
    pub affected_files: Vec<String>,
    pub diffs: Vec<MetadataDiff>,
}

pub(crate) fn diff_patch(
    track: &TrackSummary,
    patch: &MetadataPatch,
    source: &str,
    confidence: f64,
) -> Vec<MetadataDiff> {
    let before = MetadataPatch {
        title: Some(track.title.clone()),
        artists: Some(
            track
                .artists
                .iter()
                .map(|artist| artist.name.clone())
                .collect(),
        ),
        album: Some(track.album.clone()),
        album_artists: Some(
            track
                .album_artists
                .iter()
                .map(|artist| artist.name.clone())
                .collect(),
        ),
        genres: Some(track.genres.clone()),
        track_number: track.track_number,
        track_total: track.track_total,
        disc_number: track.disc_number,
        disc_total: track.disc_total,
        year: track.year,
        date: track.date.clone(),
        composer: track.composer.clone(),
        label: track.label.clone(),
        catalog_number: track.catalog_number.clone(),
        isrc: track.isrc.clone(),
        musicbrainz_recording_id: track.musicbrainz_recording_id.clone(),
        artwork_id: track.artwork_id.clone(),
        ..MetadataPatch::default()
    };
    diff_metadata_patches(&track.id, &before, patch, source, confidence)
}

pub(crate) fn diff_metadata_patches(
    track_id: &str,
    before: &MetadataPatch,
    after: &MetadataPatch,
    source: &str,
    confidence: f64,
) -> Vec<MetadataDiff> {
    let mut differences = Vec::new();
    let mut push = |field: &str, before: Option<String>, after: Option<String>| {
        if before != after {
            differences.push(MetadataDiff {
                track_id: track_id.into(),
                field: field.into(),
                before,
                after,
                source: source.into(),
                confidence,
            });
        }
    };
    push("title", before.title.clone(), after.title.clone());
    push(
        "artists",
        before
            .artists
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
        after
            .artists
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
    );
    push("album", before.album.clone(), after.album.clone());
    push(
        "albumArtists",
        before
            .album_artists
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
        after
            .album_artists
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
    );
    push(
        "genres",
        before.genres.as_ref().map(|values| values.join(", ")),
        after.genres.as_ref().map(|values| values.join(", ")),
    );
    push(
        "trackNumber",
        display(before.track_number),
        display(after.track_number),
    );
    push(
        "trackTotal",
        display(before.track_total),
        display(after.track_total),
    );
    push(
        "discNumber",
        display(before.disc_number),
        display(after.disc_number),
    );
    push(
        "discTotal",
        display(before.disc_total),
        display(after.disc_total),
    );
    push("year", display(before.year), display(after.year));
    push("date", before.date.clone(), after.date.clone());
    push("composer", before.composer.clone(), after.composer.clone());
    push("label", before.label.clone(), after.label.clone());
    push(
        "catalogNumber",
        before.catalog_number.clone(),
        after.catalog_number.clone(),
    );
    push("isrc", before.isrc.clone(), after.isrc.clone());
    push(
        "recordingMbid",
        before.musicbrainz_recording_id.clone(),
        after.musicbrainz_recording_id.clone(),
    );
    push(
        "releaseMbid",
        before.musicbrainz_release_id.clone(),
        after.musicbrainz_release_id.clone(),
    );
    push(
        "artistMbids",
        before
            .musicbrainz_artist_ids
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
        after
            .musicbrainz_artist_ids
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
    );
    push(
        "albumArtistMbids",
        before
            .musicbrainz_album_artist_ids
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
        after
            .musicbrainz_album_artist_ids
            .as_ref()
            .map(|values| join(values.iter().map(String::as_str))),
    );
    push(
        "artwork",
        before.artwork_id.clone(),
        after.artwork_id.clone(),
    );
    push("lyrics", before.lyrics.clone(), after.lyrics.clone());
    differences
}

fn join<'a>(values: impl Iterator<Item = &'a str>) -> String {
    values.collect::<Vec<_>>().join(", ")
}

fn display(value: Option<u32>) -> Option<String> {
    value.map(|value| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_only_contains_changed_fields_and_retains_provenance() {
        let track = crate::enrichment::tests::track_fixture();
        let patch = MetadataPatch {
            title: Some("Corrected".into()),
            album: Some(track.album.clone()),
            musicbrainz_recording_id: Some("recording".into()),
            ..MetadataPatch::default()
        };
        let diff = diff_patch(&track, &patch, "musicbrainz", 0.98);
        assert!(
            diff.iter()
                .any(|item| item.field == "title" && item.source == "musicbrainz")
        );
        assert!(diff.iter().any(|item| item.field == "recordingMbid"));
    }

    #[test]
    fn embedded_only_fields_are_included_in_a_full_review() {
        let before = MetadataPatch {
            musicbrainz_release_id: Some("old-release".into()),
            musicbrainz_artist_ids: Some(vec!["old-artist".into()]),
            lyrics: Some("Old lyrics".into()),
            ..MetadataPatch::default()
        };
        let after = MetadataPatch {
            musicbrainz_release_id: Some("new-release".into()),
            musicbrainz_artist_ids: Some(vec!["new-artist".into()]),
            lyrics: Some("New lyrics".into()),
            ..MetadataPatch::default()
        };
        let fields: Vec<_> = diff_metadata_patches("track", &before, &after, "user", 1.0)
            .into_iter()
            .map(|diff| diff.field)
            .collect();
        assert_eq!(fields, ["releaseMbid", "artistMbids", "lyrics"]);
    }
}
