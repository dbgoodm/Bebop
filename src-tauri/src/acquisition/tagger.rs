use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    picture::{MimeType, Picture, PictureType},
    prelude::Accessor,
    probe::Probe,
    tag::{ItemKey, Tag},
};
use reqwest::blocking::Client;
use rodio::Decoder;
use serde_json::Value;
use tempfile::NamedTempFile;

use crate::{
    AppError,
    acquisition::{AcquisitionSettings, resolver::ResolvedTrack},
    metadata::cache_external_artwork,
};

pub struct Tagger;

impl Tagger {
    pub fn tag_and_place_track(
        audio_bytes: &[u8],
        track: &ResolvedTrack,
        settings: &AcquisitionSettings,
        library_root: &Path,
        artwork_cache_dir: &Path,
    ) -> Result<PathBuf, AppError> {
        let dest_rel_path = render_path_template(&settings.path_template, track);
        let dest_path = library_root.join(&dest_rel_path);

        let parent_dir = dest_path.parent().ok_or_else(|| {
            AppError::new(
                "invalid-dest-path",
                "Destination path has no parent directory",
            )
        })?;

        fs::create_dir_all(parent_dir).map_err(|e| {
            AppError::new(
                "create-dir-failed",
                format!("Failed to create directory {}: {}", parent_dir.display(), e),
            )
        })?;

        // Write audio bytes to temporary file in the destination parent directory for atomic persistence
        let mut temp_file = NamedTempFile::new_in(parent_dir)
            .map_err(|e| AppError::new("temp-file-create-failed", e.to_string()))?;

        temp_file
            .write_all(audio_bytes)
            .map_err(|e| AppError::new("temp-file-write-failed", e.to_string()))?;

        temp_file
            .flush()
            .map_err(|e| AppError::new("temp-file-flush-failed", e.to_string()))?;

        let temp_path = temp_file.path().to_path_buf();

        // Tag audio file with lofty
        Self::apply_tags(&temp_path, track, settings, artwork_cache_dir, parent_dir)?;

        // Fetch & write LRCLIB sidecar and embedded lyrics
        if settings.fetch_lyrics {
            let _ = Self::apply_lyrics(&temp_path, &dest_path, track);
        }

        // Compute ReplayGain tags
        if settings.compute_replaygain {
            let _ = Self::apply_replaygain(&temp_path);
        }

        // Atomically persist to destination path
        temp_file.persist(&dest_path).map_err(|e| {
            AppError::new(
                "atomic-persist-failed",
                format!("Failed to persist to {}: {}", dest_path.display(), e.error),
            )
        })?;

        Ok(dest_path)
    }

    fn apply_tags(
        file_path: &Path,
        track: &ResolvedTrack,
        settings: &AcquisitionSettings,
        artwork_cache_dir: &Path,
        album_dir: &Path,
    ) -> Result<(), AppError> {
        let probe = Probe::open(file_path)
            .map_err(|e| AppError::new("lofty-probe-failed", e.to_string()))?;
        let probe = probe
            .guess_file_type()
            .map_err(|e| AppError::new("lofty-guess-failed", e.to_string()))?;
        let mut tagged_file = probe
            .read()
            .map_err(|e| AppError::new("lofty-read-failed", e.to_string()))?;

        if tagged_file.primary_tag().is_none() {
            let tag_type = tagged_file.primary_tag_type();
            tagged_file.insert_tag(Tag::new(tag_type));
        }

        let tag = tagged_file.primary_tag_mut().ok_or_else(|| {
            AppError::new(
                "lofty-tag-unavailable",
                "Writable primary tag is unavailable",
            )
        })?;

        if !track.title.is_empty() {
            tag.set_title(track.title.clone());
        }

        if !track.artists.is_empty() {
            tag.set_artist(track.artists.join("; "));
            tag.insert_text(ItemKey::TrackArtists, track.artists.join("; "));
        }

        if !track.album.is_empty() {
            tag.set_album(track.album.clone());
        }

        if !track.album_artists.is_empty() {
            tag.insert_text(ItemKey::AlbumArtist, track.album_artists.join("; "));
        }

        if let Some(t_num) = track.track_number {
            tag.set_track(t_num);
        }
        if let Some(t_tot) = track.track_total {
            tag.set_track_total(t_tot);
        }
        if let Some(d_num) = track.disc_number {
            tag.set_disk(d_num);
        }
        if let Some(d_tot) = track.disc_total {
            tag.set_disk_total(d_tot);
        }
        if let Some(year) = track.year {
            tag.set_year(year);
        }
        if let Some(date) = &track.date {
            tag.insert_text(ItemKey::RecordingDate, date.clone());
        }
        if let Some(isrc) = &track.isrc {
            tag.insert_text(ItemKey::Isrc, isrc.clone());
        }
        if let Some(mb_id) = &track.musicbrainz_recording_id {
            tag.insert_text(ItemKey::MusicBrainzRecordingId, mb_id.clone());
        }
        if let Some(label) = &track.label {
            tag.insert_text(ItemKey::Label, label.clone());
        }
        if let Some(cat) = &track.catalog_number {
            tag.insert_text(ItemKey::CatalogNumber, cat.clone());
        }
        if let Some(comp) = &track.composer {
            tag.insert_text(ItemKey::Composer, comp.clone());
        }
        if !track.genres.is_empty() {
            tag.set_genre(track.genres.join("; "));
        }

        // Embed high-res front cover artwork
        if settings.embed_artwork {
            if let Some(art_url) = &track.artwork_url {
                if let Ok(client) = Client::builder()
                    .timeout(std::time::Duration::from_secs(8))
                    .build()
                {
                    if let Ok(resp) = client.get(art_url).send() {
                        if resp.status().is_success() {
                            let content_type = resp
                                .headers()
                                .get("content-type")
                                .and_then(|v| v.to_str().ok())
                                .unwrap_or("image/jpeg")
                                .to_string();

                            if let Ok(image_bytes) = resp.bytes() {
                                let mime = if content_type.contains("png") {
                                    MimeType::Png
                                } else {
                                    MimeType::Jpeg
                                };

                                let mime_str = if content_type.contains("png") {
                                    "image/png"
                                } else {
                                    "image/jpeg"
                                };

                                let picture = Picture::new_unchecked(
                                    PictureType::CoverFront,
                                    Some(mime),
                                    None,
                                    image_bytes.to_vec(),
                                );
                                tag.push_picture(picture);

                                // Also cache into Bebop artwork cache
                                let _ = cache_external_artwork(
                                    &image_bytes,
                                    mime_str,
                                    "acquisition",
                                    art_url,
                                    artwork_cache_dir,
                                );

                                // Also write sidecar cover.jpg if not present in album dir
                                let cover_path = album_dir.join("cover.jpg");
                                if !cover_path.exists() {
                                    let _ = fs::write(cover_path, &image_bytes);
                                }
                            }
                        }
                    }
                }
            }
        }

        tagged_file
            .save_to_path(file_path, WriteOptions::default())
            .map_err(|e| AppError::new("lofty-save-failed", e.to_string()))?;

        Ok(())
    }

    fn apply_lyrics(
        temp_path: &Path,
        dest_path: &Path,
        track: &ResolvedTrack,
    ) -> Result<(), AppError> {
        let artist = track
            .artists
            .first()
            .map(String::as_str)
            .unwrap_or_default();
        if artist.is_empty() || track.title.is_empty() {
            return Ok(());
        }

        let client = Client::builder()
            .user_agent(format!(
                "Bebop/{} (https://github.com/dbgoodm/Bebop)",
                env!("CARGO_PKG_VERSION")
            ))
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| AppError::new("lyrics-client-error", e.to_string()))?;

        let mut req = client.get("https://lrclib.net/api/get").query(&[
            ("artist_name", artist),
            ("track_name", track.title.as_str()),
            ("album_name", track.album.as_str()),
        ]);

        if let Some(dur_ms) = track.duration_ms {
            let dur_sec = (dur_ms / 1000).to_string();
            req = req.query(&[("duration", dur_sec.as_str())]);
        }

        let resp = match req.send() {
            Ok(r) if r.status().is_success() => r,
            _ => return Ok(()),
        };

        let json: Value = match resp.json() {
            Ok(j) => j,
            _ => return Ok(()),
        };

        let synced_lyrics = json["syncedLyrics"].as_str();
        let plain_lyrics = json["plainLyrics"].as_str();

        let lyrics_text = synced_lyrics.or(plain_lyrics);
        if let Some(lyrics) = lyrics_text {
            // Write sidecar .lrc file if synced lyrics
            if let Some(synced) = synced_lyrics {
                let lrc_path = dest_path.with_extension("lrc");
                let _ = fs::write(lrc_path, synced);
            }

            // Embed into FLAC Vorbis comments
            if let Ok(probe) = Probe::open(temp_path) {
                if let Ok(probe) = probe.guess_file_type() {
                    if let Ok(mut tagged_file) = probe.read() {
                        if let Some(tag) = tagged_file.primary_tag_mut() {
                            tag.insert_text(ItemKey::Lyrics, lyrics.to_string());
                            let _ = tagged_file.save_to_path(temp_path, WriteOptions::default());
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn apply_replaygain(file_path: &Path) -> Result<(), AppError> {
        let Ok(file) = File::open(file_path) else {
            return Ok(());
        };

        let Ok(decoder) = Decoder::try_from(file) else {
            return Ok(());
        };

        let mut peak = 0.0f32;
        let mut sum_sq = 0.0f64;
        let mut count = 0u64;

        for sample in decoder {
            let s = sample;
            let abs_s = s.abs();
            if abs_s > peak {
                peak = abs_s;
            }
            sum_sq += (s as f64) * (s as f64);
            count += 1;
        }

        if count == 0 {
            return Ok(());
        }

        let rms = (sum_sq / count as f64).sqrt();
        let gain_db = if rms > 1e-6 {
            // Standard -18 dBFS reference level
            -18.0 - (20.0 * (rms / 0.1).log10())
        } else {
            0.0
        };

        if let Ok(probe) = Probe::open(file_path) {
            if let Ok(probe) = probe.guess_file_type() {
                if let Ok(mut tagged_file) = probe.read() {
                    if let Some(tag) = tagged_file.primary_tag_mut() {
                        tag.insert_text(ItemKey::ReplayGainTrackGain, format!("{:.2} dB", gain_db));
                        tag.insert_text(ItemKey::ReplayGainTrackPeak, format!("{:.6}", peak));
                        let _ = tagged_file.save_to_path(file_path, WriteOptions::default());
                    }
                }
            }
        }

        Ok(())
    }
}

pub fn sanitize_filename_component(component: &str) -> String {
    let sanitized: String = component
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Unknown".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn render_path_template(template: &str, track: &ResolvedTrack) -> PathBuf {
    let artist = sanitize_filename_component(
        track
            .artists
            .first()
            .map(String::as_str)
            .unwrap_or("Unknown Artist"),
    );

    let album = sanitize_filename_component(if track.album.is_empty() {
        "Unknown Album"
    } else {
        &track.album
    });

    let title = sanitize_filename_component(if track.title.is_empty() {
        "Untitled"
    } else {
        &track.title
    });

    let track_num = match track.track_number {
        Some(num) => format!("{:02}", num),
        None => "01".to_string(),
    };

    let disc_num = match track.disc_number {
        Some(num) => format!("{}", num),
        None => "1".to_string(),
    };

    let year = match track.year {
        Some(y) => format!("{}", y),
        None => "".to_string(),
    };

    let rendered = template
        .replace("{Artist}", &artist)
        .replace("{Album}", &album)
        .replace("{Title}", &title)
        .replace("{TrackNumber}", &track_num)
        .replace("{DiscNumber}", &disc_num)
        .replace("{Year}", &year);

    // Normalize slashes
    let mut path = PathBuf::new();
    for part in rendered.split(['/', '\\']) {
        let trimmed = part.trim();
        if !trimmed.is_empty() {
            path.push(trimmed);
        }
    }

    if path.extension().is_none() {
        path.set_extension("flac");
    }

    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename_component() {
        assert_eq!(sanitize_filename_component("AC/DC"), "AC_DC");
        assert_eq!(sanitize_filename_component("What: Ever?"), "What_ Ever_");
        assert_eq!(sanitize_filename_component("...Hello..."), "Hello");
        assert_eq!(sanitize_filename_component(""), "Unknown");
    }

    #[test]
    fn test_render_path_template() {
        let track = ResolvedTrack {
            title: "Around the World".to_string(),
            artists: vec!["Daft Punk".to_string()],
            album: "Homework".to_string(),
            track_number: Some(7),
            disc_number: Some(1),
            year: Some(1997),
            ..Default::default()
        };

        let rendered =
            render_path_template("{Artist}/{Album}/{TrackNumber} - {Title}.flac", &track);
        assert_eq!(
            rendered,
            PathBuf::from("Daft Punk/Homework/07 - Around the World.flac")
        );
    }

    #[test]
    fn test_tagger_places_and_tags_fixture() {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.flac");
        let audio_bytes = fs::read(&fixture_path).expect("read fixture");

        let temp_dir = tempfile::tempdir().expect("tempdir");
        let library_root = temp_dir.path().join("Music");
        let artwork_cache = temp_dir.path().join("Artwork");
        fs::create_dir_all(&library_root).expect("create library root");
        fs::create_dir_all(&artwork_cache).expect("create artwork cache");

        let track = ResolvedTrack {
            title: "Test Output".to_string(),
            artists: vec!["Test Artist".to_string()],
            album: "Test Album".to_string(),
            track_number: Some(1),
            disc_number: Some(1),
            year: Some(2024),
            isrc: Some("US1234567890".to_string()),
            ..Default::default()
        };

        let settings = AcquisitionSettings {
            embed_artwork: false,
            fetch_lyrics: false,
            compute_replaygain: true,
            ..Default::default()
        };

        let placed_path = Tagger::tag_and_place_track(
            &audio_bytes,
            &track,
            &settings,
            &library_root,
            &artwork_cache,
        )
        .expect("tagged and placed");

        assert!(placed_path.is_file());
        assert_eq!(
            placed_path,
            library_root.join("Test Artist/Test Album/01 - Test Output.flac")
        );

        let probe = Probe::open(&placed_path)
            .unwrap()
            .guess_file_type()
            .unwrap()
            .read()
            .unwrap();
        let tag = probe.primary_tag().expect("primary tag");
        assert_eq!(tag.title().as_deref(), Some("Test Output"));
        assert_eq!(tag.artist().as_deref(), Some("Test Artist"));
        assert_eq!(tag.album().as_deref(), Some("Test Album"));
    }
}
