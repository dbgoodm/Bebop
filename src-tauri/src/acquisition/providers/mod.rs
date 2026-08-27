use reqwest::blocking::Client;

use crate::{
    AppError, AudioExtension,
    acquisition::{AcquisitionSettings, resolver::ResolvedTrack},
};

pub mod deezer;
pub mod qobuz;
pub mod tidal;

pub use deezer::DeezerProvider;
pub use qobuz::QobuzProvider;
pub use tidal::TidalProvider;

#[derive(Clone, Debug)]
pub struct DownloadedAudio {
    pub audio_bytes: Vec<u8>,
    pub extension: AudioExtension,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u16>,
    pub channels: Option<u16>,
    pub quality_label: String,
    pub provider_name: String,
}

pub trait Provider: Send + Sync {
    fn name(&self) -> &'static str;
    fn is_configured(&self, settings: &AcquisitionSettings) -> bool;
    fn can_handle(&self, track: &ResolvedTrack) -> bool;
    fn download_track(
        &self,
        client: &Client,
        track: &ResolvedTrack,
        settings: &AcquisitionSettings,
        progress: &dyn Fn(u64, u64, u64), // (downloaded_bytes, total_bytes, speed_bps)
    ) -> Result<DownloadedAudio, AppError>;
}

pub fn all_providers() -> Vec<Box<dyn Provider>> {
    vec![
        Box::new(QobuzProvider::default()),
        Box::new(TidalProvider::default()),
        Box::new(DeezerProvider),
    ]
}

pub fn download_with_fallback(
    client: &Client,
    track: &ResolvedTrack,
    settings: &AcquisitionSettings,
    progress: &dyn Fn(u64, u64, u64),
) -> Result<DownloadedAudio, AppError> {
    let providers = all_providers();
    let priority_list = if !settings.provider_priority.is_empty() {
        &settings.provider_priority
    } else {
        &vec!["qobuz".into(), "tidal".into(), "deezer".into()]
    };

    let mut errors = Vec::new();

    for provider_name in priority_list {
        let name_lower = provider_name.to_lowercase();
        if let Some(provider) = providers
            .iter()
            .find(|p| p.name().eq_ignore_ascii_case(&name_lower))
        {
            if !provider.is_configured(settings) {
                errors.push(format!(
                    "{}: Not configured with valid credentials/tokens",
                    provider.name()
                ));
                continue;
            }

            if !provider.can_handle(track) {
                errors.push(format!(
                    "{}: No matching track ID or search result for track",
                    provider.name()
                ));
                continue;
            }

            match provider.download_track(client, track, settings, progress) {
                Ok(downloaded) => return Ok(downloaded),
                Err(err) => {
                    errors.push(format!(
                        "{}: Download failed: {}",
                        provider.name(),
                        err.message
                    ));
                }
            }
        }
    }

    Err(AppError::new(
        "acquisition-download-failed",
        format!(
            "All providers failed to download '{}' by '{}': {}",
            track.title,
            track.artists.join(", "),
            errors.join("; ")
        ),
    ))
}
