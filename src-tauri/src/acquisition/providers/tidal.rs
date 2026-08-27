use std::{
    io::Read,
    time::{Duration, Instant},
};

use base64::Engine;
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

pub const DEFAULT_TIDAL_CLIENT_TOKEN: &str = "zU4XHVVk3x5XnoAL";

pub struct TidalProvider {
    pub default_client_token: String,
}

impl Default for TidalProvider {
    fn default() -> Self {
        Self {
            default_client_token: DEFAULT_TIDAL_CLIENT_TOKEN.to_string(),
        }
    }
}

impl TidalProvider {
    pub fn new(default_client_token: Option<String>) -> Self {
        Self {
            default_client_token: default_client_token
                .unwrap_or_else(|| DEFAULT_TIDAL_CLIENT_TOKEN.to_string()),
        }
    }

    pub fn get_stream_url_from_manifest(
        &self,
        client: &Client,
        track_id: &str,
        quality: &str,
        token: Option<&str>,
    ) -> Result<(String, Option<u32>, Option<u16>, String), AppError> {
        let endpoint = format!(
            "https://api.tidal.com/v1/tracks/{track_id}/playbackinfopostpaywall?audioquality={quality}&playbackmode=STREAM&assetpresentation=FULL"
        );

        let auth_token = token.unwrap_or(&self.default_client_token);

        let mut req = client.get(&endpoint);
        if auth_token.len() > 30 {
            // Bearer user oauth access token
            req = req.header("Authorization", format!("Bearer {auth_token}"));
        } else {
            // Client token
            req = req.header("x-tidal-token", auth_token);
        }

        let resp = req
            .send()
            .map_err(|e| AppError::new("tidal-playbackinfo-error", e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AppError::new(
                "tidal-playbackinfo-failed",
                format!("Tidal playbackinfo API returned status {}", resp.status()),
            ));
        }

        let json: Value = resp
            .json()
            .map_err(|e| AppError::new("tidal-playbackinfo-json", e.to_string()))?;

        let manifest_mime = json["manifestMimeType"].as_str().unwrap_or_default();
        let manifest_raw = json["manifest"].as_str().unwrap_or_default();

        let (stream_url, sample_rate, bit_depth) = if manifest_mime == "application/vnd.tidal.bts"
            || manifest_raw.starts_with('{')
            || !manifest_raw.is_empty()
        {
            // Decoded base64 manifest
            let decoded_bytes = base64::engine::general_purpose::STANDARD
                .decode(manifest_raw)
                .unwrap_or_else(|_| manifest_raw.as_bytes().to_vec());

            let manifest_json: Value = serde_json::from_slice(&decoded_bytes)
                .map_err(|e| AppError::new("tidal-manifest-json-error", e.to_string()))?;

            let url = manifest_json["urls"]
                .as_array()
                .and_then(|u| u.first())
                .and_then(|v| v.as_str())
                .or_else(|| manifest_json["url"].as_str())
                .ok_or_else(|| {
                    AppError::new("tidal-no-url", "No stream URL found in Tidal manifest")
                })?
                .to_string();

            let sample_rate = manifest_json["sampleRate"].as_u64().map(|s| s as u32);
            let bit_depth = manifest_json["bitDepth"].as_u64().map(|b| b as u16);

            (url, sample_rate, bit_depth)
        } else if let Some(urls) = json["urls"]
            .as_array()
            .and_then(|u| u.first())
            .and_then(|v| v.as_str())
        {
            (urls.to_string(), None, None)
        } else {
            return Err(AppError::new(
                "tidal-manifest-unknown",
                "Unsupported Tidal manifest format",
            ));
        };

        let quality_label = match (bit_depth, sample_rate) {
            (Some(b), Some(s)) if b > 16 || s > 44100 => {
                format!("{}-bit/{:.1}kHz Hi-Res FLAC", b, s as f64 / 1000.0)
            }
            (Some(16), Some(44100)) => "16-bit/44.1kHz FLAC".to_string(),
            _ => "Lossless FLAC".to_string(),
        };

        Ok((stream_url, sample_rate, bit_depth, quality_label))
    }
}

impl Provider for TidalProvider {
    fn name(&self) -> &'static str {
        "tidal"
    }

    fn is_configured(&self, settings: &AcquisitionSettings) -> bool {
        settings.tidal_access_token.is_some() || !self.default_client_token.is_empty()
    }

    fn can_handle(&self, track: &ResolvedTrack) -> bool {
        track.tidal_id.is_some() || !track.title.is_empty()
    }

    fn download_track(
        &self,
        client: &Client,
        track: &ResolvedTrack,
        settings: &AcquisitionSettings,
        progress: &dyn Fn(u64, u64, u64),
    ) -> Result<DownloadedAudio, AppError> {
        let tidal_track_id = track
            .tidal_id
            .as_ref()
            .ok_or_else(|| AppError::new("tidal-no-id", "No Tidal track ID resolved"))?;

        let quality = settings.tidal_quality.as_deref().unwrap_or("LOSSLESS");

        let (stream_url, sample_rate, bit_depth, quality_label) = self
            .get_stream_url_from_manifest(
                client,
                tidal_track_id,
                quality,
                settings.tidal_access_token.as_deref(),
            )?;

        let mut response = client
            .get(&stream_url)
            .send()
            .map_err(|e| AppError::new("tidal-download-error", e.to_string()))?;

        if !response.status().is_success() {
            return Err(AppError::new(
                "tidal-download-failed",
                format!("Tidal audio download returned HTTP {}", response.status()),
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
                .map_err(|e| AppError::new("tidal-read-error", e.to_string()))?;

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

        Ok(DownloadedAudio {
            audio_bytes,
            extension: AudioExtension::Flac,
            sample_rate,
            bit_depth,
            channels: Some(2),
            quality_label,
            provider_name: "Tidal".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tidal_manifest_decoding() {
        let manifest_json = serde_json::json!({
            "mimeType": "audio/flac",
            "codecs": "flac",
            "encryptionType": "NONE",
            "urls": ["https://audio.tidal.com/stream/sample.flac"],
            "sampleRate": 96000,
            "bitDepth": 24
        });
        let manifest_str = manifest_json.to_string();
        let b64 = base64::engine::general_purpose::STANDARD.encode(manifest_str.as_bytes());

        let decoded = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .expect("decode");
        let parsed: Value = serde_json::from_slice(&decoded).expect("parse json");
        assert_eq!(
            parsed["urls"][0].as_str(),
            Some("https://audio.tidal.com/stream/sample.flac")
        );
        assert_eq!(parsed["sampleRate"].as_u64(), Some(96000));
        assert_eq!(parsed["bitDepth"].as_u64(), Some(24));
    }
}
