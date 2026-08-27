use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    picture::PictureType,
    prelude::Accessor,
    probe::Probe,
    tag::{ItemKey, Tag},
};
use rodio::Decoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use tempfile::NamedTempFile;

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPatch {
    pub title: Option<String>,
    pub artists: Option<Vec<String>>,
    pub album: Option<String>,
    pub album_artists: Option<Vec<String>>,
    pub genres: Option<Vec<String>>,
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
    pub musicbrainz_release_id: Option<String>,
    pub musicbrainz_artist_ids: Option<Vec<String>>,
    pub musicbrainz_album_artist_ids: Option<Vec<String>>,
    pub artwork_id: Option<String>,
    pub lyrics: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MetadataWriteResult {
    pub track_id: String,
    pub path: String,
    pub backup_path: String,
}

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
    pub source_id: Option<String>,
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

pub(crate) fn read_metadata_patch(path: &Path) -> Result<MetadataPatch, String> {
    let probe = Probe::open(path).map_err(|error| error.to_string())?;
    let probe = probe.guess_file_type().map_err(|error| error.to_string())?;
    let tagged = probe.read().map_err(|error| error.to_string())?;
    let metadata = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .map(metadata_from_tag)
        .unwrap_or_default();
    Ok(MetadataPatch {
        title: metadata.title,
        artists: Some(metadata.artists),
        album: metadata.album,
        album_artists: Some(metadata.album_artists),
        genres: Some(metadata.genres),
        track_number: metadata.track_number,
        track_total: metadata.track_total,
        disc_number: metadata.disc_number,
        disc_total: metadata.disc_total,
        year: metadata.year,
        date: metadata.date,
        composer: metadata.composer,
        label: metadata.label,
        catalog_number: metadata.catalog_number,
        isrc: metadata.isrc,
        musicbrainz_recording_id: metadata.musicbrainz_recording_id,
        musicbrainz_release_id: metadata.musicbrainz_release_id,
        musicbrainz_artist_ids: Some(metadata.musicbrainz_artist_ids),
        musicbrainz_album_artist_ids: Some(metadata.musicbrainz_album_artist_ids),
        artwork_id: None,
        lyrics: metadata.lyrics,
    })
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
            return cache_bytes(picture.data(), mime, "embedded", None, artwork_cache).map(Some);
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
                return cache_bytes(&fs::read(candidate)?, mime, "sidecar", None, artwork_cache)
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
    source_id: Option<&str>,
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
        source_id: source_id.map(str::to_owned),
    })
}

pub(crate) fn cache_external_artwork(
    bytes: &[u8],
    mime: &str,
    source: &str,
    source_id: &str,
    artwork_cache: &Path,
) -> Result<CachedArtwork, String> {
    cache_bytes(bytes, mime, source, Some(source_id), artwork_cache)
        .map_err(|error| error.to_string())
}

pub(crate) fn write_patch_atomically(
    path: &Path,
    patch: &MetadataPatch,
) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("The track has no parent directory.")?;
    let file_name = path.file_name().ok_or("The track has no file name.")?;
    let backup_directory = parent.join(".bebop-backups");
    fs::create_dir_all(&backup_directory).map_err(|error| error.to_string())?;
    let backup_path = backup_directory.join(file_name);
    if !backup_path.exists() {
        fs::copy(path, &backup_path).map_err(|error| error.to_string())?;
    }

    let original_digest = decoded_audio_digest(path)?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    let mut original = File::open(path).map_err(|error| error.to_string())?;
    std::io::copy(&mut original, temporary.as_file_mut()).map_err(|error| error.to_string())?;
    temporary.flush().map_err(|error| error.to_string())?;
    apply_patch_to_path(temporary.path(), patch)?;

    let updated_digest = decoded_audio_digest(temporary.path())?;
    if original_digest != updated_digest {
        return Err(
            "Decoded audio changed while writing metadata; the original was preserved.".into(),
        );
    }
    let probe = Probe::open(temporary.path()).map_err(|error| error.to_string())?;
    let probe = probe.guess_file_type().map_err(|error| error.to_string())?;
    let reread = probe.read().map_err(|error| error.to_string())?;
    let reread_tag = reread
        .primary_tag()
        .or_else(|| reread.first_tag())
        .ok_or("The temporary file did not retain a readable primary tag.")?;
    validate_patch(reread_tag, patch)?;
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(backup_path)
}

pub(crate) fn restore_backup(path: &Path) -> Result<PathBuf, String> {
    let backup_path = path
        .parent()
        .ok_or("The track has no parent directory.")?
        .join(".bebop-backups")
        .join(path.file_name().ok_or("The track has no file name.")?);
    if !backup_path.is_file() {
        return Err("No retained Bebop backup exists for this track.".into());
    }
    let parent = path.parent().expect("validated track parent");
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    let mut backup = File::open(&backup_path).map_err(|error| error.to_string())?;
    std::io::copy(&mut backup, temporary.as_file_mut()).map_err(|error| error.to_string())?;
    temporary.flush().map_err(|error| error.to_string())?;
    decoded_audio_digest(temporary.path())?;
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(backup_path)
}

fn apply_patch_to_path(path: &Path, patch: &MetadataPatch) -> Result<(), String> {
    let probe = Probe::open(path).map_err(|error| error.to_string())?;
    let probe = probe.guess_file_type().map_err(|error| error.to_string())?;
    let mut tagged = probe.read().map_err(|error| error.to_string())?;
    if tagged.primary_tag().is_none() {
        tagged.insert_tag(Tag::new(tagged.primary_tag_type()));
    }
    let tag = tagged
        .primary_tag_mut()
        .ok_or("This audio container does not expose a writable primary tag.")?;
    tag.remove_key(&ItemKey::TrackTitle);
    if let Some(value) = clean(patch.title.clone()) {
        tag.set_title(value);
    }
    tag.remove_key(&ItemKey::TrackArtist);
    tag.remove_key(&ItemKey::TrackArtists);
    if let Some(value) = patch
        .artists
        .as_ref()
        .map(|values| clean_values(values).join("; "))
        && !value.is_empty()
    {
        tag.set_artist(value);
    }
    tag.remove_key(&ItemKey::AlbumTitle);
    if let Some(value) = clean(patch.album.clone()) {
        tag.set_album(value);
    }
    set_multi_item(tag, ItemKey::AlbumArtist, patch.album_artists.as_ref());
    set_multi_item(tag, ItemKey::Genre, patch.genres.as_ref());
    set_number(tag, ItemKey::TrackNumber, patch.track_number);
    set_number(tag, ItemKey::TrackTotal, patch.track_total);
    set_number(tag, ItemKey::DiscNumber, patch.disc_number);
    set_number(tag, ItemKey::DiscTotal, patch.disc_total);
    set_number(tag, ItemKey::Year, patch.year);
    set_text(tag, ItemKey::RecordingDate, patch.date.as_deref());
    set_text(tag, ItemKey::Composer, patch.composer.as_deref());
    set_text(tag, ItemKey::Label, patch.label.as_deref());
    set_text(tag, ItemKey::CatalogNumber, patch.catalog_number.as_deref());
    set_text(tag, ItemKey::Isrc, patch.isrc.as_deref());
    set_text(
        tag,
        ItemKey::MusicBrainzRecordingId,
        patch.musicbrainz_recording_id.as_deref(),
    );
    set_text(
        tag,
        ItemKey::MusicBrainzReleaseId,
        patch.musicbrainz_release_id.as_deref(),
    );
    set_multi_item(
        tag,
        ItemKey::MusicBrainzArtistId,
        patch.musicbrainz_artist_ids.as_ref(),
    );
    set_multi_item(
        tag,
        ItemKey::MusicBrainzReleaseArtistId,
        patch.musicbrainz_album_artist_ids.as_ref(),
    );
    set_text(tag, ItemKey::Lyrics, patch.lyrics.as_deref());
    tagged
        .save_to_path(path, WriteOptions::default())
        .map_err(|error| error.to_string())
}

fn clean_values(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn set_multi_item(tag: &mut Tag, key: ItemKey, values: Option<&Vec<String>>) {
    tag.remove_key(&key);
    if let Some(values) = values {
        let value = clean_values(values).join("; ");
        if !value.is_empty() {
            tag.insert_text(key, value);
        }
    }
}

fn set_text(tag: &mut Tag, key: ItemKey, value: Option<&str>) {
    tag.remove_key(&key);
    if let Some(value) = value {
        let value = value.trim();
        if !value.is_empty() {
            tag.insert_text(key, value.to_owned());
        }
    }
}

fn set_number(tag: &mut Tag, key: ItemKey, value: Option<u32>) {
    tag.remove_key(&key);
    if let Some(value) = value {
        tag.insert_text(key, value.to_string());
    }
}

fn validate_patch(tag: &Tag, patch: &MetadataPatch) -> Result<(), String> {
    let actual = metadata_from_tag(tag);
    let expected_artists = patch
        .artists
        .as_deref()
        .map(clean_values)
        .unwrap_or_default();
    let expected_album_artists = patch
        .album_artists
        .as_deref()
        .map(clean_values)
        .unwrap_or_default();
    let expected_genres = patch
        .genres
        .as_deref()
        .map(clean_values)
        .unwrap_or_default();
    let valid = actual.title == clean(patch.title.clone())
        && actual.artists == expected_artists
        && actual.album == clean(patch.album.clone())
        && actual.album_artists == expected_album_artists
        && actual.genres == expected_genres
        && actual.track_number == patch.track_number
        && actual.track_total == patch.track_total
        && actual.disc_number == patch.disc_number
        && actual.disc_total == patch.disc_total
        && actual.year == patch.year
        && actual.date == clean(patch.date.clone())
        && actual.composer == clean(patch.composer.clone())
        && actual.label == clean(patch.label.clone())
        && actual.catalog_number == clean(patch.catalog_number.clone())
        && actual.isrc == clean(patch.isrc.clone())
        && actual.musicbrainz_recording_id == clean(patch.musicbrainz_recording_id.clone())
        && actual.musicbrainz_release_id == clean(patch.musicbrainz_release_id.clone())
        && actual.musicbrainz_artist_ids
            == patch
                .musicbrainz_artist_ids
                .as_deref()
                .map(clean_values)
                .unwrap_or_default()
        && actual.musicbrainz_album_artist_ids
            == patch
                .musicbrainz_album_artist_ids
                .as_deref()
                .map(clean_values)
                .unwrap_or_default()
        && actual.lyrics == clean(patch.lyrics.clone());
    if valid {
        Ok(())
    } else {
        Err("The temporary file did not retain every requested metadata field.".into())
    }
}

fn decoded_audio_digest(path: &Path) -> Result<[u8; 32], String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let decoder = Decoder::try_from(file).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    for sample in decoder {
        hasher.update(sample.to_le_bytes());
    }
    Ok(hasher.finalize().into())
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

    #[test]
    fn metadata_writes_are_atomic_validated_and_recoverable() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("bebop-tag-write-{unique}"));
        fs::create_dir_all(&directory).expect("create write fixture");
        let path = directory.join("tone.flac");
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.flac"),
            &path,
        )
        .expect("copy audio fixture");
        let before = decoded_audio_digest(&path).expect("decode before write");
        let backup = write_patch_atomically(
            &path,
            &MetadataPatch {
                title: Some("Edited fixture".into()),
                artists: Some(vec!["Edited Artist".into()]),
                musicbrainz_recording_id: Some("recording-mbid".into()),
                musicbrainz_release_id: Some("release-mbid".into()),
                musicbrainz_artist_ids: Some(vec!["artist-mbid".into()]),
                musicbrainz_album_artist_ids: Some(vec!["album-artist-mbid".into()]),
                lyrics: Some("Honest local lyrics".into()),
                ..MetadataPatch::default()
            },
        )
        .expect("write tags");
        assert!(backup.is_file());
        assert_eq!(
            decoded_audio_digest(&path).expect("decode after write"),
            before
        );
        let edited = read_embedded_metadata(&path, &directory.join("cache")).expect("read edit");
        assert_eq!(edited.title.as_deref(), Some("Edited fixture"));
        assert_eq!(edited.artists, ["Edited Artist"]);
        assert_eq!(
            edited.musicbrainz_recording_id.as_deref(),
            Some("recording-mbid")
        );
        assert_eq!(
            edited.musicbrainz_release_id.as_deref(),
            Some("release-mbid")
        );
        assert_eq!(edited.lyrics.as_deref(), Some("Honest local lyrics"));
        restore_backup(&path).expect("restore backup");
        let restored =
            read_embedded_metadata(&path, &directory.join("cache")).expect("read restore");
        assert_eq!(restored.title.as_deref(), Some("Fixture FLAC"));
        assert_eq!(decoded_audio_digest(&path).expect("decode restore"), before);
        fs::remove_dir_all(directory).expect("remove write fixture");
    }
}
