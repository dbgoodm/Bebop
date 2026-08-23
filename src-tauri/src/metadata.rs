use std::{fs, path::Path};

use lofty::{
    file::TaggedFileExt,
    picture::PictureType,
    prelude::Accessor,
    probe::Probe,
    tag::{ItemKey, Tag},
};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Default)]
pub(crate) struct EmbeddedMetadata {
    pub title: Option<String>,
    pub sort_title: Option<String>,
    pub artists: Vec<String>,
    pub musicbrainz_artist_ids: Vec<String>,
    pub album_artists: Vec<String>,
    pub musicbrainz_album_artist_ids: Vec<String>,
    pub album: Option<String>,
    pub musicbrainz_release_id: Option<String>,
    pub genres: Vec<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub date: Option<String>,
    pub composer: Option<String>,
    pub label: Option<String>,
    pub catalog_number: Option<String>,
    pub isrc: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
    pub replaygain_track_gain: Option<f64>,
    pub replaygain_track_peak: Option<f64>,
    pub replaygain_album_gain: Option<f64>,
    pub replaygain_album_peak: Option<f64>,
    pub lyrics: Option<String>,
    pub artwork: Option<CachedArtwork>,
}

#[derive(Clone, Debug)]
pub(crate) struct CachedArtwork {
    pub id: String,
    pub content_hash: String,
    pub cache_path: String,
    pub mime_type: String,
    pub source: String,
}

pub(crate) fn read_embedded_metadata(
    path: &Path,
    artwork_cache: &Path,
) -> Result<EmbeddedMetadata, String> {
    let probe = Probe::open(path).map_err(|error| error.to_string())?;
    let probe = probe.guess_file_type().map_err(|error| error.to_string())?;
    let tagged = probe.read().map_err(|error| error.to_string())?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let mut metadata = tag.map(metadata_from_tag).unwrap_or_default();
    metadata.artwork =
        cache_artwork(path, tag, artwork_cache).map_err(|error| error.to_string())?;
    Ok(metadata)
}

fn metadata_from_tag(tag: &Tag) -> EmbeddedMetadata {
    EmbeddedMetadata {
        title: clean(tag.title().map(|value| value.into_owned())),
        sort_title: item(tag, ItemKey::TrackTitleSortOrder),
        artists: multi_items(tag, &[ItemKey::TrackArtists, ItemKey::TrackArtist]),
        musicbrainz_artist_ids: multi_items(tag, &[ItemKey::MusicBrainzArtistId]),
        album_artists: multi_items(tag, &[ItemKey::AlbumArtist]),
        musicbrainz_album_artist_ids: multi_items(tag, &[ItemKey::MusicBrainzReleaseArtistId]),
        album: clean(tag.album().map(|value| value.into_owned())),
        musicbrainz_release_id: item(tag, ItemKey::MusicBrainzReleaseId),
        genres: multi_items(tag, &[ItemKey::Genre]),
        track_number: tag.track(),
        track_total: tag.track_total(),
        disc_number: tag.disk(),
        disc_total: tag.disk_total(),
        year: tag.year().or_else(|| numeric_item(tag, ItemKey::Year)),
        date: item(tag, ItemKey::RecordingDate).or_else(|| item(tag, ItemKey::ReleaseDate)),
        composer: item(tag, ItemKey::Composer),
        label: item(tag, ItemKey::Label),
        catalog_number: item(tag, ItemKey::CatalogNumber),
        isrc: item(tag, ItemKey::Isrc),
        musicbrainz_recording_id: item(tag, ItemKey::MusicBrainzRecordingId),
        replaygain_track_gain: float_item(tag, ItemKey::ReplayGainTrackGain),
        replaygain_track_peak: float_item(tag, ItemKey::ReplayGainTrackPeak),
        replaygain_album_gain: float_item(tag, ItemKey::ReplayGainAlbumGain),
        replaygain_album_peak: float_item(tag, ItemKey::ReplayGainAlbumPeak),
        lyrics: item(tag, ItemKey::Lyrics),
        artwork: None,
    }
}

fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn item(tag: &Tag, key: ItemKey) -> Option<String> {
    clean(tag.get_string(&key).map(str::to_owned))
}

fn numeric_item(tag: &Tag, key: ItemKey) -> Option<u32> {
    tag.get_string(&key)?.trim().parse().ok()
}

fn float_item(tag: &Tag, key: ItemKey) -> Option<f64> {
    let value = tag.get_string(&key)?.trim();
    value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic())
        .trim()
        .parse()
        .ok()
}

fn multi_items(tag: &Tag, keys: &[ItemKey]) -> Vec<String> {
    let mut values = Vec::new();
    for key in keys {
        for raw in tag.get_strings(key) {
            for value in raw.split(['\0', ';']) {
                let value = value.trim();
                if !value.is_empty() && !values.iter().any(|known| known == value) {
                    values.push(value.to_owned());
                }
            }
        }
    }
    values
}

fn cache_artwork(
    audio_path: &Path,
    tag: Option<&Tag>,
    artwork_cache: &Path,
) -> std::io::Result<Option<CachedArtwork>> {
    if let Some(tag) = tag {
        let picture = tag
            .pictures()
            .iter()
            .find(|picture| picture.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first());
        if let Some(picture) = picture {
            let mime = picture
                .mime_type()
                .map(|value| value.as_str())
                .unwrap_or("application/octet-stream");
            return cache_bytes(picture.data(), mime, "embedded", artwork_cache).map(Some);
        }
    }

    let Some(directory) = audio_path.parent() else {
        return Ok(None);
    };
    for stem in ["cover", "folder", "front"] {
        for (extension, mime) in [
            ("jpg", "image/jpeg"),
            ("jpeg", "image/jpeg"),
            ("png", "image/png"),
            ("webp", "image/webp"),
        ] {
            let candidate = directory.join(format!("{stem}.{extension}"));
            if candidate.is_file() {
                return cache_bytes(&fs::read(candidate)?, mime, "sidecar", artwork_cache)
                    .map(Some);
            }
        }
    }
    Ok(None)
}

fn cache_bytes(
    bytes: &[u8],
    mime: &str,
    source: &str,
    artwork_cache: &Path,
) -> std::io::Result<CachedArtwork> {
    let content_hash = format!("{:x}", Sha256::digest(bytes));
    let extension = match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    };
    fs::create_dir_all(artwork_cache)?;
    let cache_path = artwork_cache.join(format!("{content_hash}.{extension}"));
    if !cache_path.exists() {
        let temporary_path = artwork_cache.join(format!(".{content_hash}.tmp"));
        fs::write(&temporary_path, bytes)?;
        fs::rename(temporary_path, &cache_path)?;
    }
    Ok(CachedArtwork {
        id: content_hash.clone(),
        content_hash,
        cache_path: cache_path.to_string_lossy().into_owned(),
        mime_type: mime.to_owned(),
        source: source.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use lofty::tag::{ItemValue, TagItem, TagType};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn tag_values_are_normalized_without_inventing_metadata() {
        let mut tag = Tag::new(TagType::VorbisComments);
        tag.set_title(" Tagged title ".into());
        tag.push(TagItem::new(
            ItemKey::TrackArtists,
            ItemValue::Text("First; Second".into()),
        ));
        tag.insert_text(ItemKey::ReplayGainTrackGain, "-7.25 dB".into());
        let metadata = metadata_from_tag(&tag);
        assert_eq!(metadata.title.as_deref(), Some("Tagged title"));
        assert_eq!(metadata.artists, ["First", "Second"]);
        assert_eq!(metadata.replaygain_track_gain, Some(-7.25));
        assert!(metadata.album.is_none());
    }

    #[test]
    fn lofty_reads_real_embedded_fixture_metadata() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.flac");
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let cache = std::env::temp_dir().join(format!("bebop-artwork-{unique}"));
        let metadata = read_embedded_metadata(&fixture, &cache).expect("read fixture tags");
        assert_eq!(metadata.title.as_deref(), Some("Fixture FLAC"));
        assert_eq!(metadata.artists, ["Fixture Artist"]);
        assert_eq!(metadata.album.as_deref(), Some("Fixture Album"));
        assert_eq!(metadata.genres, ["Jazz"]);
    }

    #[test]
    fn sidecar_artwork_is_copied_to_the_hash_addressed_cache() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("bebop-sidecar-{unique}"));
        let cache = std::env::temp_dir().join(format!("bebop-sidecar-cache-{unique}"));
        fs::create_dir_all(&directory).expect("create album directory");
        fs::write(directory.join("cover.jpg"), b"fixture-artwork").expect("write artwork");
        let artwork = cache_artwork(&directory.join("song.flac"), None, &cache)
            .expect("cache artwork")
            .expect("sidecar exists");
        assert_eq!(artwork.source, "sidecar");
        assert!(Path::new(&artwork.cache_path).is_file());
        fs::remove_dir_all(directory).expect("remove album fixture");
        fs::remove_dir_all(cache).expect("remove cache fixture");
    }
}
