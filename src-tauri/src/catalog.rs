use std::{fs::File, path::Path};

use serde::{Deserialize, Serialize};
use specta::Type;
use symphonia::core::{
    formats::FormatOptions, io::MediaSourceStream, meta::MetadataOptions, probe::Hint,
};
use walkdir::{DirEntry, WalkDir};

use crate::AppError;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AudioExtension {
    Flac,
    Wav,
    Mp3,
    Ogg,
}

impl AudioExtension {
    pub(crate) fn from_path(path: &Path) -> Option<Self> {
        match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "flac" => Some(Self::Flac),
            "wav" => Some(Self::Wav),
            "mp3" => Some(Self::Mp3),
            "ogg" => Some(Self::Ogg),
            _ => None,
        }
    }

    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Flac => "flac",
            Self::Wav => "wav",
            Self::Mp3 => "mp3",
            Self::Ogg => "ogg",
        }
    }

    pub(crate) fn from_database(value: &str) -> Option<Self> {
        match value {
            "flac" => Some(Self::Flac),
            "wav" => Some(Self::Wav),
            "mp3" => Some(Self::Mp3),
            "ogg" => Some(Self::Ogg),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum RootAvailability {
    Online,
    Offline,
    PermissionError,
}

impl RootAvailability {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Online => "online",
            Self::Offline => "offline",
            Self::PermissionError => "permission-error",
        }
    }

    pub(crate) fn from_database(value: &str) -> Self {
        match value {
            "online" => Self::Online,
            "permission-error" => Self::PermissionError,
            _ => Self::Offline,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum WatchMode {
    Native,
    Poll,
    Manual,
}

impl WatchMode {
    pub(crate) fn from_database(value: &str) -> Self {
        match value {
            "native" => Self::Native,
            "poll" => Self::Poll,
            _ => Self::Manual,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub id: String,
    pub path: String,
    pub label: String,
    pub enabled: bool,
    pub availability: RootAvailability,
    pub watch_mode: WatchMode,
    pub track_count: u64,
    pub last_scan_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    pub id: String,
    pub root_id: String,
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub extension: AudioExtension,
    pub file_size: u64,
    pub duration_ms: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bit_depth: Option<u16>,
    pub available: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScan {
    pub root_id: String,
    pub root: String,
    pub tracks: Vec<TrackSummary>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scanned_files: u64,
    pub discovered_tracks: u64,
    pub current_path: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogQuery {
    pub root_id: Option<String>,
    pub search: Option<String>,
    pub available: Option<bool>,
    pub sort: TrackSort,
    pub direction: SortDirection,
    pub offset: u32,
    pub limit: u32,
}

impl Default for CatalogQuery {
    fn default() -> Self {
        Self {
            root_id: None,
            search: None,
            available: Some(true),
            sort: TrackSort::Title,
            direction: SortDirection::Ascending,
            offset: 0,
            limit: 100,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum TrackSort {
    Title,
    Path,
    DateAdded,
    LastModified,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Ascending,
    Descending,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackPage {
    pub items: Vec<TrackSummary>,
    pub total: u64,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Clone, Debug)]
pub(crate) struct ScannedTrack {
    pub canonical_path: String,
    pub relative_path: String,
    pub title: String,
    pub extension: AudioExtension,
    pub file_size: u64,
    pub duration_ms: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bit_depth: Option<u16>,
    pub modified_at_ms: Option<i64>,
}

#[derive(Debug)]
pub(crate) struct ScannedLibrary {
    pub canonical_root: String,
    pub tracks: Vec<ScannedTrack>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
pub(crate) struct AudioMetadata {
    pub duration_ms: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bit_depth: Option<u16>,
}

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .is_some_and(|name| name.starts_with('.'))
}

fn display_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Untitled track")
        .to_owned()
}

pub(crate) fn probe_audio_metadata(path: &Path, extension: &AudioExtension) -> AudioMetadata {
    let Ok(file) = File::open(path) else {
        return AudioMetadata::default();
    };
    let mut hint = Hint::new();
    hint.with_extension(extension.as_str());
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let Ok(probed) = symphonia::default::get_probe().format(
        &hint,
        source,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    ) else {
        return AudioMetadata::default();
    };
    let Some(track) = probed.format.default_track() else {
        return AudioMetadata::default();
    };
    let params = &track.codec_params;
    let duration_ms = params.time_base.zip(params.n_frames).map(|(base, frames)| {
        let time = base.calc_time(frames);
        time.seconds.saturating_mul(1_000) + (time.frac * 1_000.0) as u64
    });
    AudioMetadata {
        duration_ms,
        sample_rate: params.sample_rate,
        channels: params.channels.map(|channels| channels.count() as u16),
        bit_depth: params.bits_per_sample.map(|bits| bits as u16),
    }
}

pub(crate) fn scan_library_at<F>(
    requested_root: &Path,
    mut emit_progress: F,
) -> Result<ScannedLibrary, AppError>
where
    F: FnMut(&ScanProgress),
{
    let root = requested_root.canonicalize().map_err(|error| {
        AppError::invalid_library_root(&requested_root.to_string_lossy(), error)
    })?;
    if !root.is_dir() {
        return Err(AppError::new(
            "library-root-not-directory",
            "Please select a folder containing your music files.",
        )
        .with_context("root", root.to_string_lossy()));
    }

    let mut tracks = Vec::new();
    let mut warnings = Vec::new();
    let mut scanned_files = 0;
    let walker = WalkDir::new(&root)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| entry.path() == root || !is_hidden(entry));
    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!("Skipped unreadable path: {error}"));
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        scanned_files += 1;
        let current_path = entry.path().to_string_lossy().into_owned();
        let Some(extension) = AudioExtension::from_path(entry.path()) else {
            emit_progress(&ScanProgress {
                scanned_files,
                discovered_tracks: tracks.len() as u64,
                current_path: Some(current_path),
            });
            continue;
        };
        let canonical_path = match entry.path().canonicalize() {
            Ok(path) if path.starts_with(&root) => path,
            Ok(_) => {
                warnings.push(format!(
                    "Skipped path outside the selected root: {current_path}"
                ));
                continue;
            }
            Err(error) => {
                warnings.push(format!("Skipped unreadable file {current_path}: {error}"));
                continue;
            }
        };
        let metadata = match canonical_path.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                warnings.push(format!("Skipped unreadable file {current_path}: {error}"));
                continue;
            }
        };
        let relative_path = canonical_path
            .strip_prefix(&root)
            .expect("canonical track remains under canonical root")
            .to_string_lossy()
            .into_owned();
        let audio = probe_audio_metadata(&canonical_path, &extension);
        let modified_at_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64);
        tracks.push(ScannedTrack {
            canonical_path: canonical_path.to_string_lossy().into_owned(),
            relative_path,
            title: display_title(&canonical_path),
            extension,
            file_size: metadata.len(),
            duration_ms: audio.duration_ms,
            sample_rate: audio.sample_rate,
            channels: audio.channels,
            bit_depth: audio.bit_depth,
            modified_at_ms,
        });
        emit_progress(&ScanProgress {
            scanned_files,
            discovered_tracks: tracks.len() as u64,
            current_path: Some(current_path),
        });
    }
    tracks.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    emit_progress(&ScanProgress {
        scanned_files,
        discovered_tracks: tracks.len() as u64,
        current_path: None,
    });
    Ok(ScannedLibrary {
        canonical_root: root.to_string_lossy().into_owned(),
        tracks,
        warnings,
    })
}
