use std::{
    io::Read,
    time::{Duration, Instant},
};

use reqwest::blocking::Client;
use serde_json::Value;

use crate::{
    AppError, AudioExtension,
    acquisition::{
        AcquisitionSettings,
        providers::{DownloadedAudio, Provider},
        resolver::ResolvedTrack,
    },
};

pub const DEFAULT_QOBUZ_APP_ID: &str = "712109809";
pub const DEFAULT_QOBUZ_APP_SECRET: &str = "2e584fdf56f2f01f0fa23e5a40995c64";

#[derive(Clone, Debug)]
pub struct QobuzStreamInfo {
    pub url: String,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u16>,
    pub format_id: Option<u32>,
}

pub struct QobuzProvider {
    pub default_app_id: String,
    pub default_app_secret: String,
}

impl Default for QobuzProvider {
    fn default() -> Self {
        Self {
            default_app_id: DEFAULT_QOBUZ_APP_ID.to_string(),
            default_app_secret: DEFAULT_QOBUZ_APP_SECRET.to_string(),
        }
    }
}

impl QobuzProvider {
    pub fn new(app_id: Option<String>, app_secret: Option<String>) -> Self {
        Self {
            default_app_id: app_id.unwrap_or_else(|| DEFAULT_QOBUZ_APP_ID.to_string()),
            default_app_secret: app_secret.unwrap_or_else(|| DEFAULT_QOBUZ_APP_SECRET.to_string()),
        }
    }

    pub fn get_file_url(
        &self,
        client: &Client,
        track_id: &str,
        format_id: u32,
        app_id: &str,
        app_secret: &str,
        user_auth_token: Option<&str>,
    ) -> Result<QobuzStreamInfo, AppError> {
        let ts = chrono::Utc::now().timestamp().to_string();
        let sig_raw =
            format!("trackgetFileUrlformat_id{format_id}track_id{track_id}{ts}{app_secret}");
        let sig = format!("{:x}", md5::compute(sig_raw.as_bytes()));

        let mut req = client
            .get("https://www.qobuz.com/api.json/0.2/track/getFileUrl")
            .query(&[
                ("track_id", track_id),
                ("format_id", &format_id.to_string()),
                ("request_ts", &ts),
                ("request_sig", &sig),
                ("app_id", app_id),
            ]);

        if let Some(token) = user_auth_token {
            if !token.is_empty() {
                req = req.header("X-User-Auth-Token", token);
            }
        }

        let resp = req
            .send()
            .map_err(|e| AppError::new("qobuz-stream-request-failed", e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                "qobuz-stream-failed",
                format!("Qobuz getFileUrl returned status {}", resp.status()),
            ));
        }

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("qobuz-stream-json", e.to_string()))?;

        if let Some(err) = json.get("error") {
            return Err(AppError::new(
                "qobuz-api-error",
                format!(
                    "Qobuz error: {}",
                    err["message"].as_str().unwrap_or("Unknown")
                ),
            ));
        }

        let stream_url = json["url"]
            .as_str()
            .ok_or_else(|| {
                AppError::new("qobuz-no-url", "Qobuz response did not contain stream URL")
            })?
            .to_string();

        let sample_rate = json["sampling_rate"].as_f64().map(|r| (r * 1000.0) as u32);
        let bit_depth = json["bit_depth"].as_u64().map(|b| b as u16);
        let returned_format_id = json["format_id"].as_u64().map(|f| f as u32);

        Ok(QobuzStreamInfo {
            url: stream_url,
            sample_rate,
            bit_depth,
            format_id: returned_format_id,
        })
    }
}

impl Provider for QobuzProvider {
    fn name(&self) -> &'static str {
        "qobuz"
    }

    fn is_configured(&self, settings: &AcquisitionSettings) -> bool {
        // Qobuz works with bundled default app_id/secret or user tokens
        settings.qobuz_app_id.is_some() || !self.default_app_id.is_empty()
    }

    fn can_handle(&self, track: &ResolvedTrack) -> bool {
        track.qobuz_id.is_some() || !track.title.is_empty()
    }

    fn download_track(
        &self,
        client: &Client,
        track: &ResolvedTrack,
        settings: &AcquisitionSettings,
        progress: &dyn Fn(u64, u64, u64),
    ) -> Result<DownloadedAudio, AppError> {
        let qobuz_track_id = track
            .qobuz_id
            .as_ref()
            .ok_or_else(|| AppError::new("qobuz-no-id", "No Qobuz track ID resolved"))?;

        let app_id = settings
            .qobuz_app_id
            .as_deref()
            .unwrap_or(&self.default_app_id);
        let app_secret = settings
            .qobuz_app_secret
            .as_deref()
            .unwrap_or(&self.default_app_secret);
        let user_token = settings.qobuz_user_auth_token.as_deref();

        // Try Hi-Res formats in descending quality (27 -> 7 -> 6)
        let preferred_formats = [27, 7, 6];
        let mut stream_info = None;
        let mut last_error = None;

        for format_id in preferred_formats {
            match self.get_file_url(
                client,
                qobuz_track_id,
                format_id,
                app_id,
                app_secret,
                user_token,
            ) {
                Ok(info) => {
                    stream_info = Some(info);
                    break;
                }
                Err(err) => {
                    last_error = Some(err);
                }
            }
        }

        let stream_info = match stream_info {
            Some(info) => info,
            None => {
                return Err(last_error.unwrap_or_else(|| {
                    AppError::new("qobuz-stream-failed", "Could not obtain Qobuz stream URL")
                }));
            }
        };

        let stream_url = stream_info.url;
        let sample_rate = stream_info.sample_rate;
        let bit_depth = stream_info.bit_depth;
        let returned_format = stream_info.format_id;

        // Stream download with progress tracking
        let mut response = client
            .get(&stream_url)
            .send()
            .map_err(|e| AppError::new("qobuz-download-error", e.to_string()))?;

        if !response.status().is_success() {
            return Err(AppError::new(
                "qobuz-download-failed",
                format!("Qobuz stream download returned HTTP {}", response.status()),
            ));
        }

        let total_bytes = response.content_length().unwrap_or(0);
        let mut audio_bytes = Vec::with_capacity(total_bytes as usize);
        let mut buffer = [0u8; 64 * 1024];
        let mut downloaded_bytes = 0u64;

        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        loop {
            let read = response
                .read(&mut buffer)
                .map_err(|e| AppError::new("qobuz-read-error", e.to_string()))?;

            if read == 0 {
                break;
            }

            audio_bytes.extend_from_slice(&buffer[..read]);
            downloaded_bytes += read as u64;

            if last_emit.elapsed() >= Duration::from_millis(150) || downloaded_bytes == total_bytes
            {
                let elapsed_sec = start_time.elapsed().as_secs_f64();
                let speed_bps = if elapsed_sec > 0.0 {
                    (downloaded_bytes as f64 / elapsed_sec) as u64
                } else {
                    0
                };
                progress(downloaded_bytes, total_bytes, speed_bps);
                last_emit = Instant::now();
            }
        }

        let quality_label = match (bit_depth, sample_rate, returned_format) {
            (Some(b), Some(s), _) if b > 16 || s > 44100 => {
                format!("{}-bit/{:.1}kHz Hi-Res FLAC", b, s as f64 / 1000.0)
            }
            (Some(16), Some(44100), _) | (_, _, Some(6)) => "16-bit/44.1kHz FLAC".to_string(),
            _ => "FLAC Audio".to_string(),
        };

        Ok(DownloadedAudio {
            audio_bytes,
            extension: AudioExtension::Flac,
            sample_rate,
            bit_depth,
            channels: Some(2),
            quality_label,
            provider_name: "Qobuz".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qobuz_signature_computation() {
        let ts = "1620000000";
        let sig_raw =
            format!("trackgetFileUrlformat_id27track_id12345678{ts}{DEFAULT_QOBUZ_APP_SECRET}");
        let sig = format!("{:x}", md5::compute(sig_raw.as_bytes()));
        assert_eq!(sig.len(), 32);
    }

    #[test]
    fn test_qobuz_provider_is_configured() {
        let provider = QobuzProvider::default();
        let settings = AcquisitionSettings::default();
        assert!(provider.is_configured(&settings));
    }
}
