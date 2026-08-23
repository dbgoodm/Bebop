use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Mutex, RwLock},
};

use serde::{Deserialize, Serialize};
use specta::Type;
#[cfg(any(debug_assertions, test))]
use specta_typescript::Typescript;
use tauri::State;
use tauri_specta::{Builder, collect_commands};

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<BTreeMap<String, String>>,
}

impl AppError {
    fn state_unavailable(resource: &str) -> Self {
        Self {
            code: "state-unavailable".into(),
            message: "The desktop application state is unavailable.".into(),
            context: Some(BTreeMap::from([("resource".into(), resource.into())])),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AudioExtension {
    Flac,
    Wav,
    Mp3,
    Ogg,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    pub id: String,
    pub path: String,
    pub title: String,
    pub extension: AudioExtension,
    pub file_size: u64,
    pub duration_ms: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bit_depth: Option<u16>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Stopped,
    Loading,
    Playing,
    Paused,
    Ended,
    Error,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub track_id: Option<String>,
    pub path: Option<String>,
    pub status: PlaybackStatus,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f32,
    pub muted: bool,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            track_id: None,
            path: None,
            status: PlaybackStatus::Stopped,
            position_ms: 0,
            duration_ms: 0,
            volume: 1.0,
            muted: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scanned_files: u64,
    pub discovered_tracks: u64,
    pub current_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    pub library_root: Option<String>,
    pub playback: PlaybackState,
}

#[derive(Default)]
pub struct PlaybackEngine {
    state: PlaybackState,
}

/// Shared state is deliberately small at this milestone. Stage 4 owns canonical library-root
/// assignment and Stage 5 replaces this placeholder engine with the native audio backend.
#[derive(Default)]
pub struct AppState {
    library_root: RwLock<Option<PathBuf>>,
    playback: Mutex<PlaybackEngine>,
}

#[tauri::command]
#[specta::specta]
fn get_desktop_state(state: State<'_, AppState>) -> Result<DesktopState, AppError> {
    let library_root = state
        .library_root
        .read()
        .map_err(|_| AppError::state_unavailable("library-root"))?
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());
    let playback = state
        .playback
        .lock()
        .map_err(|_| AppError::state_unavailable("playback-engine"))?
        .state
        .clone();

    Ok(DesktopState {
        library_root,
        playback,
    })
}

fn ipc_bindings() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![get_desktop_state])
        .typ::<AppError>()
        .typ::<TrackSummary>()
        .typ::<PlaybackState>()
        .typ::<ScanProgress>()
        .dangerously_cast_bigints_to_number()
}

#[cfg(any(debug_assertions, test))]
fn export_typescript_bindings(bindings: &mut Builder<tauri::Wry>) {
    bindings
        .export(
            Typescript::default(),
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../apps/frontend/src/services/tauri-bindings.ts"),
        )
        .expect("failed to export TypeScript IPC bindings");
}

pub fn run() {
    #[allow(unused_mut)]
    let mut bindings = ipc_bindings();

    #[cfg(debug_assertions)]
    export_typescript_bindings(&mut bindings);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .invoke_handler(bindings.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running Bebop desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_state_starts_without_a_library_or_active_track() {
        let state = AppState::default();
        assert!(state.library_root.read().expect("library state").is_none());
        assert!(matches!(
            state.playback.lock().expect("playback state").state.status,
            PlaybackStatus::Stopped
        ));
    }

    #[test]
    fn exports_typescript_ipc_contracts() {
        let mut bindings = ipc_bindings();
        export_typescript_bindings(&mut bindings);
    }
}
