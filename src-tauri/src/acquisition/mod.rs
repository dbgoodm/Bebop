use serde::{Deserialize, Serialize};
use specta::Type;

pub mod providers;
pub mod queue;
pub mod resolver;
pub mod tagger;

pub use queue::AcquisitionQueue;
pub use resolver::ResolvedTrack;

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionTrackRequest {
    pub url: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub isrc: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub artwork_url: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
    pub preferred_provider: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionAlbumRequest {
    pub url: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub release_id: Option<String>,
    pub artwork_url: Option<String>,
    pub preferred_provider: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AcquisitionJobStatus {
    Queued,
    Resolving,
    Downloading,
    Tagging,
    Reconciling,
    Completed,
    Failed,
    Cancelled,
    Paused,
}

impl AcquisitionJobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Resolving => "resolving",
            Self::Downloading => "downloading",
            Self::Tagging => "tagging",
            Self::Reconciling => "reconciling",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Paused => "paused",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionJobDto {
    pub id: String,
    pub status: AcquisitionJobStatus,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub isrc: Option<String>,
    pub artwork_url: Option<String>,
    pub progress: f32,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: Option<u64>,
    pub provider: Option<String>,
    pub quality: Option<String>,
    pub destination_path: Option<String>,
    pub current_step: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionSettings {
    pub provider_priority: Vec<String>,
    pub max_parallel_downloads: u32,
    pub target_root_id: Option<String>,
    pub path_template: String,
    pub deezer_arl: Option<String>,
    pub qobuz_user_auth_token: Option<String>,
    pub qobuz_app_id: Option<String>,
    pub qobuz_app_secret: Option<String>,
    pub tidal_access_token: Option<String>,
    pub tidal_quality: Option<String>,
    pub embed_artwork: bool,
    pub fetch_lyrics: bool,
    pub compute_replaygain: bool,
}

impl Default for AcquisitionSettings {
    fn default() -> Self {
        Self {
            provider_priority: vec!["qobuz".into(), "tidal".into(), "deezer".into()],
            max_parallel_downloads: 2,
            target_root_id: None,
            path_template: "{Artist}/{Album}/{TrackNumber} - {Title}.flac".into(),
            deezer_arl: None,
            qobuz_user_auth_token: None,
            qobuz_app_id: None,
            qobuz_app_secret: None,
            tidal_access_token: None,
            tidal_quality: Some("LOSSLESS".into()),
            embed_artwork: true,
            fetch_lyrics: true,
            compute_replaygain: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcquisitionProgressPayload {
    pub job_id: String,
    pub status: AcquisitionJobStatus,
    pub progress: f32,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub current_step: String,
    pub error: Option<String>,
}
