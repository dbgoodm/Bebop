use std::{fs::File, path::Path, time::Duration};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rodio::{Decoder, Source};
use rusty_chromaprint::{Configuration, FingerprintCompressor, Fingerprinter};

const MAX_FINGERPRINT_DURATION: Duration = Duration::from_secs(120);

#[derive(Clone, Debug)]
pub(crate) struct AudioFingerprint {
    pub encoded: String,
    pub duration_seconds: u64,
}

/// Produce the compressed algorithm-2 Chromaprint payload accepted by AcoustID.
/// Decoding happens off the UI thread in the metadata worker.
pub(crate) fn fingerprint_path(path: &Path) -> Result<AudioFingerprint, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let decoder = Decoder::try_from(file).map_err(|error| error.to_string())?;
    let sample_rate = decoder.sample_rate();
    let channels = u32::from(decoder.channels());
    let duration_seconds = decoder
        .total_duration()
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let maximum_samples = usize::try_from(
        u64::from(sample_rate)
            .saturating_mul(u64::from(channels))
            .saturating_mul(MAX_FINGERPRINT_DURATION.as_secs()),
    )
    .unwrap_or(usize::MAX);
    let samples: Vec<i16> = decoder
        .take(maximum_samples)
        .map(|sample| {
            (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX))
                .round()
                .clamp(f32::from(i16::MIN), f32::from(i16::MAX)) as i16
        })
        .collect();
    if samples.is_empty() {
        return Err("The audio decoder produced no samples for fingerprinting.".into());
    }

    let configuration = Configuration::default();
    let mut fingerprinter = Fingerprinter::new(&configuration);
    fingerprinter
        .start(sample_rate, channels)
        .map_err(|error| error.to_string())?;
    fingerprinter.consume(&samples);
    fingerprinter.finish();
    let compressed =
        FingerprintCompressor::from(&configuration).compress(fingerprinter.fingerprint());
    if compressed.len() <= 4 {
        return Err("The audio was too short to produce a Chromaprint fingerprint.".into());
    }
    Ok(AudioFingerprint {
        encoded: URL_SAFE_NO_PAD.encode(compressed),
        duration_seconds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;

    #[test]
    fn fixture_produces_an_acoustid_compatible_fingerprint() {
        let path =
            std::env::temp_dir().join(format!("bebop-chromaprint-{}.wav", std::process::id()));
        write_tone_wav(&path, 12);
        let fingerprint = fingerprint_path(&path).expect("fingerprint fixture");
        assert!(!fingerprint.encoded.is_empty());
        assert!(!fingerprint.encoded.contains('='));
        std::fs::remove_file(path).expect("remove fingerprint fixture");
    }

    fn write_tone_wav(path: &Path, seconds: u32) {
        let sample_rate = 44_100_u32;
        let sample_count = sample_rate * seconds;
        let data_size = sample_count * 2;
        let mut bytes = Vec::with_capacity((44 + data_size) as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        for index in 0..sample_count {
            let time = index as f32 / sample_rate as f32;
            let frequency = if index / sample_rate % 2 == 0 {
                440.0
            } else {
                659.25
            };
            let sample = ((time * frequency * TAU).sin() * 12_000.0) as i16;
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        std::fs::write(path, bytes).expect("write fingerprint fixture");
    }
}
