use serde::{Deserialize, Serialize};
use specta::Type;

use crate::TrackSummary;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct PlayerPreferences {
    pub volume: f32,
    pub hifi_mode: bool,
    pub selected_output_device_id: Option<String>,
    pub theme_id: String,
    pub visualization_enabled: bool,
    pub library_view: String,
}

impl Default for PlayerPreferences {
    fn default() -> Self {
        Self {
            volume: 1.0,
            hifi_mode: true,
            selected_output_device_id: None,
            theme_id: "space-cowboy".into(),
            visualization_enabled: true,
            library_view: "tracks".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PersistentPlayerState {
    pub queue: Vec<TrackSummary>,
    pub current_track_id: Option<String>,
    pub resume_position_ms: u64,
    pub preferences: PlayerPreferences,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteReference {
    pub entity_type: String,
    pub entity_id: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSummary {
    pub id: String,
    pub name: String,
    pub track_count: u64,
    pub total_duration_ms: u64,
    pub generated: bool,
    pub cover_artwork_paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HomeSnapshot {
    pub total_tracks: u64,
    pub total_artists: u64,
    pub total_albums: u64,
    pub total_duration_ms: u64,
    pub total_file_size: u64,
    pub total_listened_ms: u64,
    pub top_artist: Option<String>,
    pub top_genre: Option<String>,
    pub favorite_era: Option<u32>,
    pub continue_listening: Vec<TrackSummary>,
    pub recently_added: Vec<TrackSummary>,
    pub rediscover: Vec<TrackSummary>,
}
