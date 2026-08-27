use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs::File,
    path::Path,
};

use chrono::Utc;
use rodio::{Decoder, Source};
use rustfft::{FftPlanner, num_complex::Complex32};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{AppError, TrackSummary};

pub const AUDIO_FEATURE_VERSION: u32 = 1;
const FFT_SIZE: usize = 2_048;
const MAX_SPECTRAL_FRAMES: usize = 480;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioFeatures {
    pub track_id: String,
    pub analysis_version: u32,
    pub bpm: Option<f32>,
    pub musical_key: Option<String>,
    pub loudness_db: f32,
    pub energy: f32,
    pub spectral_centroid_hz: f32,
    pub spectral_rolloff_hz: f32,
    pub dynamic_range_db: f32,
    pub analyzed_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum PlaylistMood {
    Calm,
    Bright,
    Dark,
    Intense,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct PlaylistGenerationRequest {
    pub seed_track_ids: Vec<String>,
    pub target_duration_ms: Option<u64>,
    pub target_track_count: Option<u32>,
    pub mood: Option<PlaylistMood>,
    pub minimum_energy: Option<f32>,
    pub maximum_energy: Option<f32>,
    pub familiarity: f32,
    pub start_year: Option<u32>,
    pub end_year: Option<u32>,
    pub genres: Vec<String>,
    pub excluded_track_ids: Vec<String>,
    pub exclude_explicit: bool,
    pub max_tracks_per_artist: u32,
    pub max_tracks_per_album: u32,
}

impl Default for PlaylistGenerationRequest {
    fn default() -> Self {
        Self {
            seed_track_ids: Vec::new(),
            target_duration_ms: None,
            target_track_count: Some(25),
            mood: None,
            minimum_energy: None,
            maximum_energy: None,
            familiarity: 0.5,
            start_year: None,
            end_year: None,
            genres: Vec::new(),
            excluded_track_ids: Vec::new(),
            exclude_explicit: false,
            max_tracks_per_artist: 2,
            max_tracks_per_album: 2,
        }
    }
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSelection {
    pub track: TrackSummary,
    pub score: f32,
    pub explanation: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub tracks: Vec<TrackSummary>,
    pub total_duration_ms: u64,
    pub generated: bool,
    pub generation_request: Option<PlaylistGenerationRequest>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPlaylist {
    pub selections: Vec<PlaylistSelection>,
    pub total_duration_ms: u64,
    pub analyzed_track_count: u32,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysisProgress {
    pub completed: u32,
    pub total: u32,
    pub current_track_id: Option<String>,
    pub failed_track_ids: Vec<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct GenerationCandidate {
    pub id: String,
    pub title: String,
    pub artist_ids: Vec<String>,
    pub artist_names: Vec<String>,
    pub album_id: Option<String>,
    pub album: String,
    pub genres: Vec<String>,
    pub year: Option<u32>,
    pub duration_ms: u64,
    pub play_count: u64,
    pub skip_count: u64,
    pub favorite: bool,
    pub last_played_at: Option<i64>,
    pub features: Option<AudioFeatures>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct RankedSelection {
    pub track_id: String,
    pub score: f32,
    pub explanation: String,
}

fn clamp_request(request: &PlaylistGenerationRequest) -> PlaylistGenerationRequest {
    let mut request = request.clone();
    request.familiarity = request.familiarity.clamp(0.0, 1.0);
    request.minimum_energy = request.minimum_energy.map(|value| value.clamp(0.0, 1.0));
    request.maximum_energy = request.maximum_energy.map(|value| value.clamp(0.0, 1.0));
    request.target_track_count = Some(request.target_track_count.unwrap_or(25).clamp(1, 500));
    request.max_tracks_per_artist = request.max_tracks_per_artist.clamp(1, 20);
    request.max_tracks_per_album = request.max_tracks_per_album.clamp(1, 20);
    request
}

fn normalized(value: &str) -> String {
    value.trim().to_lowercase()
}

fn genre_overlap(left: &[String], right: &[String]) -> f32 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let left = left
        .iter()
        .map(|value| normalized(value))
        .collect::<BTreeSet<_>>();
    let right = right
        .iter()
        .map(|value| normalized(value))
        .collect::<BTreeSet<_>>();
    let union = left.union(&right).count();
    if union == 0 {
        0.0
    } else {
        left.intersection(&right).count() as f32 / union as f32
    }
}

fn energy(candidate: &GenerationCandidate) -> f32 {
    candidate
        .features
        .as_ref()
        .map_or(0.5, |features| features.energy)
}

fn mood_score(candidate: &GenerationCandidate, mood: &Option<PlaylistMood>) -> f32 {
    let energy = energy(candidate);
    let centroid = candidate.features.as_ref().map_or(0.5, |features| {
        (features.spectral_centroid_hz / 6_000.0).clamp(0.0, 1.0)
    });
    match mood {
        Some(PlaylistMood::Calm) => 1.0 - (energy * 0.75 + centroid * 0.25),
        Some(PlaylistMood::Bright) => centroid * 0.65 + (1.0 - (energy - 0.65).abs()) * 0.35,
        Some(PlaylistMood::Dark) => (1.0 - centroid) * 0.7 + (1.0 - (energy - 0.45).abs()) * 0.3,
        Some(PlaylistMood::Intense) => energy,
        None => 0.5,
    }
}

fn seed_similarity(candidate: &GenerationCandidate, seeds: &[&GenerationCandidate]) -> f32 {
    if seeds.is_empty() {
        return 0.5;
    }
    seeds
        .iter()
        .map(|seed| {
            let genres = genre_overlap(&candidate.genres, &seed.genres);
            let energy = 1.0 - (energy(candidate) - energy(seed)).abs();
            let tempo = match (
                candidate
                    .features
                    .as_ref()
                    .and_then(|features| features.bpm),
                seed.features.as_ref().and_then(|features| features.bpm),
            ) {
                (Some(left), Some(right)) => 1.0 - ((left - right).abs() / 100.0).min(1.0),
                _ => 0.5,
            };
            let era = match (candidate.year, seed.year) {
                (Some(left), Some(right)) => 1.0 - (left.abs_diff(right) as f32 / 30.0).min(1.0),
                _ => 0.5,
            };
            genres * 0.4 + energy * 0.3 + tempo * 0.2 + era * 0.1
        })
        .sum::<f32>()
        / seeds.len() as f32
}

fn familiarity_score(candidate: &GenerationCandidate, requested: f32, max_plays: u64) -> f32 {
    let plays = if max_plays == 0 {
        0.0
    } else {
        (candidate.play_count as f32 / max_plays as f32).sqrt()
    };
    let known = (plays * 0.7 + if candidate.favorite { 0.3 } else { 0.0 }).clamp(0.0, 1.0);
    1.0 - (known - requested).abs()
}

fn explanation(
    candidate: &GenerationCandidate,
    seeds: &[&GenerationCandidate],
    score: f32,
) -> String {
    let mut reasons = Vec::<String>::new();
    if candidate.favorite {
        reasons.push("a favorite".into());
    }
    if seeds
        .iter()
        .any(|seed| genre_overlap(&candidate.genres, &seed.genres) >= 0.5)
    {
        reasons.push("shares the seed's genre".into());
    }
    if seeds.iter().any(|seed| {
        candidate
            .artist_ids
            .iter()
            .any(|artist| seed.artist_ids.contains(artist))
    }) && let Some(artist) = candidate.artist_names.first()
    {
        reasons.push(format!("connects through {artist}"));
    } else if seeds
        .iter()
        .any(|seed| candidate.album_id.is_some() && candidate.album_id == seed.album_id)
    {
        reasons.push(format!("continues the flow of {}", candidate.album));
    }
    if candidate.features.is_some() {
        reasons.push("matches the requested sound profile".into());
    }
    if candidate.play_count == 0 {
        reasons.push("adds something unfamiliar".into());
    }
    if reasons.is_empty() {
        reasons.push(format!("{} fits the playlist constraints", candidate.title));
    }
    let confidence = (score.clamp(0.0, 1.0) * 100.0).round() as u32;
    format!("{} ({confidence}% fit)", reasons.join(" and "))
}

#[allow(clippy::too_many_arguments)]
fn push_selection(
    candidate: &GenerationCandidate,
    score: f32,
    explanation: String,
    target_count: usize,
    target_duration: u64,
    max_tracks_per_artist: u32,
    max_tracks_per_album: u32,
    selected: &mut Vec<RankedSelection>,
    selected_ids: &mut HashSet<String>,
    artist_counts: &mut HashMap<String, u32>,
    album_counts: &mut HashMap<String, u32>,
    duration: &mut u64,
) -> bool {
    if selected_ids.contains(&candidate.id) || selected.len() >= target_count {
        return false;
    }
    if !selected.is_empty() && duration.saturating_add(candidate.duration_ms) > target_duration {
        return false;
    }
    if candidate
        .artist_ids
        .iter()
        .any(|id| artist_counts.get(id).copied().unwrap_or(0) >= max_tracks_per_artist)
    {
        return false;
    }
    if candidate
        .album_id
        .as_ref()
        .is_some_and(|id| album_counts.get(id).copied().unwrap_or(0) >= max_tracks_per_album)
    {
        return false;
    }
    *duration = duration.saturating_add(candidate.duration_ms);
    selected_ids.insert(candidate.id.clone());
    for artist in &candidate.artist_ids {
        *artist_counts.entry(artist.clone()).or_default() += 1;
    }
    if let Some(album) = &candidate.album_id {
        *album_counts.entry(album.clone()).or_default() += 1;
    }
    selected.push(RankedSelection {
        track_id: candidate.id.clone(),
        score,
        explanation,
    });
    true
}

pub(crate) fn rank_candidates(
    candidates: &[GenerationCandidate],
    request: &PlaylistGenerationRequest,
) -> Vec<RankedSelection> {
    let request = clamp_request(request);
    let excluded = request
        .excluded_track_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let requested_genres = request
        .genres
        .iter()
        .map(|genre| normalized(genre))
        .collect::<HashSet<_>>();
    let seeds = request
        .seed_track_ids
        .iter()
        .filter_map(|id| candidates.iter().find(|candidate| candidate.id == *id))
        .collect::<Vec<_>>();
    let max_plays = candidates
        .iter()
        .map(|candidate| candidate.play_count)
        .max()
        .unwrap_or(0);
    let recency_reference = candidates
        .iter()
        .filter_map(|candidate| candidate.last_played_at)
        .max()
        .unwrap_or(0);

    let mut ranked = candidates
        .iter()
        .filter(|candidate| !excluded.contains(&candidate.id))
        .filter(|candidate| {
            request
                .start_year
                .is_none_or(|year| candidate.year.is_some_and(|value| value >= year))
        })
        .filter(|candidate| {
            request
                .end_year
                .is_none_or(|year| candidate.year.is_some_and(|value| value <= year))
        })
        .filter(|candidate| {
            request
                .minimum_energy
                .is_none_or(|minimum| energy(candidate) >= minimum)
        })
        .filter(|candidate| {
            request
                .maximum_energy
                .is_none_or(|maximum| energy(candidate) <= maximum)
        })
        .filter(|candidate| {
            requested_genres.is_empty()
                || candidate
                    .genres
                    .iter()
                    .any(|genre| requested_genres.contains(&normalized(genre)))
        })
        .map(|candidate| {
            let similarity = seed_similarity(candidate, &seeds);
            let familiar = familiarity_score(candidate, request.familiarity, max_plays);
            let mood = mood_score(candidate, &request.mood);
            let skip_quality = 1.0
                - candidate.skip_count as f32
                    / (candidate.play_count + candidate.skip_count + 1) as f32;
            let recency = candidate.last_played_at.map_or(1.0, |last_played| {
                ((recency_reference - last_played).max(0) as f32 / (90.0 * 86_400.0))
                    .clamp(0.0, 1.0)
            });
            let score = similarity * 0.4
                + familiar * 0.22
                + mood * 0.18
                + skip_quality * 0.12
                + recency * 0.08;
            (candidate, score)
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|(left, left_score), (right, right_score)| {
        right_score
            .total_cmp(left_score)
            .then_with(|| left.id.cmp(&right.id))
    });

    let target_count = request.target_track_count.unwrap_or(25) as usize;
    let target_duration = request.target_duration_ms.unwrap_or(u64::MAX);
    let mut selected = Vec::with_capacity(target_count);
    let mut selected_ids = HashSet::new();
    let mut artist_counts = HashMap::<String, u32>::new();
    let mut album_counts = HashMap::<String, u32>::new();
    let mut duration = 0_u64;

    for seed_id in &request.seed_track_ids {
        if let Some(seed) = candidates.iter().find(|candidate| &candidate.id == seed_id) {
            push_selection(
                seed,
                1.0,
                "Selected as a seed track (100% fit)".into(),
                target_count,
                target_duration,
                request.max_tracks_per_artist,
                request.max_tracks_per_album,
                &mut selected,
                &mut selected_ids,
                &mut artist_counts,
                &mut album_counts,
                &mut duration,
            );
        }
    }

    while selected.len() < target_count {
        let recent_ids = selected
            .iter()
            .rev()
            .take(4)
            .map(|selection| selection.track_id.as_str())
            .collect::<Vec<_>>();
        let best = ranked
            .iter()
            .filter(|(candidate, _)| !selected_ids.contains(&candidate.id))
            .filter_map(|(candidate, score)| {
                let spread_penalty = recent_ids
                    .iter()
                    .filter_map(|id| candidates.iter().find(|item| item.id == **id))
                    .map(|recent| {
                        let same_artist = candidate
                            .artist_ids
                            .iter()
                            .any(|id| recent.artist_ids.contains(id));
                        let same_album =
                            candidate.album_id.is_some() && candidate.album_id == recent.album_id;
                        genre_overlap(&candidate.genres, &recent.genres) * 0.08
                            + if same_artist { 0.22 } else { 0.0 }
                            + if same_album { 0.28 } else { 0.0 }
                    })
                    .fold(0.0_f32, f32::max);
                let adjusted = score - spread_penalty;
                if candidate.artist_ids.iter().any(|id| {
                    artist_counts.get(id).copied().unwrap_or(0) >= request.max_tracks_per_artist
                }) || candidate.album_id.as_ref().is_some_and(|id| {
                    album_counts.get(id).copied().unwrap_or(0) >= request.max_tracks_per_album
                }) || (!selected.is_empty()
                    && duration.saturating_add(candidate.duration_ms) > target_duration)
                {
                    None
                } else {
                    Some((candidate, *score, adjusted))
                }
            })
            .max_by(|(left, _, left_adjusted), (right, _, right_adjusted)| {
                left_adjusted
                    .total_cmp(right_adjusted)
                    .then_with(|| right.id.cmp(&left.id))
            });
        let Some((candidate, score, _)) = best else {
            break;
        };
        let why = explanation(candidate, &seeds, score);
        if !push_selection(
            candidate,
            score,
            why,
            target_count,
            target_duration,
            request.max_tracks_per_artist,
            request.max_tracks_per_album,
            &mut selected,
            &mut selected_ids,
            &mut artist_counts,
            &mut album_counts,
            &mut duration,
        ) {
            break;
        }
    }
    selected
}

pub(crate) fn analyze_file(track_id: &str, path: &Path) -> Result<AudioFeatures, AppError> {
    let file = File::open(path).map_err(|error| {
        AppError::new(
            "audio-analysis-open-failed",
            "The track could not be opened for Song DNA analysis.",
        )
        .with_context("reason", error)
    })?;
    let decoder = Decoder::try_from(file).map_err(|error| {
        AppError::new(
            "audio-analysis-decode-failed",
            "The track could not be decoded for Song DNA analysis.",
        )
        .with_context("reason", error)
    })?;
    let sample_rate = decoder.sample_rate().max(1);
    let channels = usize::from(decoder.channels()).max(1);
    let mut mono = Vec::with_capacity(FFT_SIZE);
    let mut channel_sum = 0.0_f32;
    let mut channel_index = 0_usize;
    let mut squared_sum = 0.0_f64;
    let mut peak = 0.0_f32;
    let mut sample_count = 0_u64;
    let mut envelope = Vec::new();
    let envelope_window = (sample_rate / 100).max(1) as usize;
    let mut envelope_sum = 0.0_f32;
    let mut envelope_count = 0_usize;
    let mut centroid_sum = 0.0_f64;
    let mut rolloff_sum = 0.0_f64;
    let mut spectral_frames = 0_u64;
    let mut chroma = [0.0_f64; 12];
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let mut buffer = vec![Complex32::new(0.0, 0.0); FFT_SIZE];
    let spectral_stride = ((sample_rate as usize * 300) / (MAX_SPECTRAL_FRAMES * FFT_SIZE)).max(1);
    let mut completed_frames = 0_usize;

    for sample in decoder {
        channel_sum += sample;
        channel_index += 1;
        if channel_index != channels {
            continue;
        }
        let sample = channel_sum / channels as f32;
        channel_sum = 0.0;
        channel_index = 0;
        squared_sum += f64::from(sample * sample);
        peak = peak.max(sample.abs());
        sample_count += 1;
        envelope_sum += sample.abs();
        envelope_count += 1;
        if envelope_count == envelope_window {
            envelope.push(envelope_sum / envelope_count as f32);
            envelope_sum = 0.0;
            envelope_count = 0;
        }
        mono.push(sample);
        if mono.len() == FFT_SIZE {
            if completed_frames % spectral_stride == 0
                && spectral_frames < MAX_SPECTRAL_FRAMES as u64
            {
                analyze_spectral_frame(
                    &mono,
                    sample_rate,
                    &fft,
                    &mut buffer,
                    &mut centroid_sum,
                    &mut rolloff_sum,
                    &mut chroma,
                );
                spectral_frames += 1;
            }
            completed_frames += 1;
            mono.clear();
        }
    }
    if sample_count == 0 {
        return Err(AppError::new(
            "audio-analysis-empty",
            "The decoded track contained no audio samples.",
        ));
    }
    let rms = (squared_sum / sample_count as f64).sqrt() as f32;
    let loudness_db = 20.0 * rms.max(0.000_000_1).log10();
    let peak_db = 20.0 * peak.max(0.000_000_1).log10();
    let dynamic_range_db = (peak_db - loudness_db).clamp(0.0, 60.0);
    let energy = (rms * 3.0).clamp(0.0, 1.0);
    Ok(AudioFeatures {
        track_id: track_id.into(),
        analysis_version: AUDIO_FEATURE_VERSION,
        bpm: estimate_bpm(&envelope),
        musical_key: estimate_key(&chroma),
        loudness_db,
        energy,
        spectral_centroid_hz: if spectral_frames == 0 {
            0.0
        } else {
            (centroid_sum / spectral_frames as f64) as f32
        },
        spectral_rolloff_hz: if spectral_frames == 0 {
            0.0
        } else {
            (rolloff_sum / spectral_frames as f64) as f32
        },
        dynamic_range_db,
        analyzed_at: Utc::now().to_rfc3339(),
    })
}

fn analyze_spectral_frame(
    samples: &[f32],
    sample_rate: u32,
    fft: &std::sync::Arc<dyn rustfft::Fft<f32>>,
    buffer: &mut [Complex32],
    centroid_sum: &mut f64,
    rolloff_sum: &mut f64,
    chroma: &mut [f64; 12],
) {
    for (index, (target, sample)) in buffer.iter_mut().zip(samples).enumerate() {
        let window =
            0.5 * (1.0 - (std::f32::consts::TAU * index as f32 / (FFT_SIZE - 1) as f32).cos());
        *target = Complex32::new(sample * window, 0.0);
    }
    fft.process(buffer);
    let bins = &buffer[1..FFT_SIZE / 2];
    let total = bins
        .iter()
        .map(|bin| f64::from(bin.norm()))
        .sum::<f64>()
        .max(f64::EPSILON);
    let centroid = bins
        .iter()
        .enumerate()
        .map(|(index, bin)| {
            let frequency = (index + 1) as f64 * sample_rate as f64 / FFT_SIZE as f64;
            frequency * f64::from(bin.norm())
        })
        .sum::<f64>()
        / total;
    *centroid_sum += centroid;
    let mut accumulated = 0.0;
    let threshold = total * 0.85;
    let mut rolloff = 0.0;
    for (index, bin) in bins.iter().enumerate() {
        let magnitude = f64::from(bin.norm());
        accumulated += magnitude;
        let frequency = (index + 1) as f64 * sample_rate as f64 / FFT_SIZE as f64;
        if frequency >= 55.0 {
            let midi = (69.0 + 12.0 * (frequency / 440.0).log2()).round() as i32;
            chroma[midi.rem_euclid(12) as usize] += magnitude;
        }
        if rolloff == 0.0 && accumulated >= threshold {
            rolloff = frequency;
        }
    }
    *rolloff_sum += rolloff;
}

fn estimate_bpm(envelope: &[f32]) -> Option<f32> {
    if envelope.len() < 400 {
        return None;
    }
    let mean = envelope.iter().copied().sum::<f32>() / envelope.len() as f32;
    let centered = envelope
        .iter()
        .map(|value| value - mean)
        .collect::<Vec<_>>();
    let mut best = (0_usize, f32::MIN);
    for lag in 30..=100 {
        let correlation = centered
            .iter()
            .zip(centered.iter().skip(lag))
            .map(|(left, right)| left * right)
            .sum::<f32>();
        if correlation > best.1 {
            best = (lag, correlation);
        }
    }
    (best.1.is_finite() && best.1 > 0.0).then(|| 6_000.0 / best.0 as f32)
}

fn estimate_key(chroma: &[f64; 12]) -> Option<String> {
    const NAMES: [&str; 12] = [
        "C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B",
    ];
    const MAJOR: [f64; 12] = [
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const MINOR: [f64; 12] = [
        6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];
    if chroma.iter().sum::<f64>() <= f64::EPSILON {
        return None;
    }
    let mut best = (0_usize, true, f64::MIN);
    for root in 0..12 {
        for (major, profile) in [(true, &MAJOR), (false, &MINOR)] {
            let score = (0..12)
                .map(|index| chroma[(index + root) % 12] * profile[index])
                .sum::<f64>();
            if score > best.2 {
                best = (root, major, score);
            }
        }
    }
    Some(format!(
        "{} {}",
        NAMES[best.0],
        if best.1 { "major" } else { "minor" }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn candidate(id: &str, artist: &str, album: &str, energy: f32) -> GenerationCandidate {
        GenerationCandidate {
            id: id.into(),
            title: id.into(),
            artist_ids: vec![artist.into()],
            artist_names: vec![artist.into()],
            album_id: Some(album.into()),
            album: album.into(),
            genres: vec!["Jazz".into()],
            year: Some(1961),
            duration_ms: 180_000,
            play_count: 1,
            skip_count: 0,
            favorite: false,
            last_played_at: None,
            features: Some(AudioFeatures {
                track_id: id.into(),
                analysis_version: 1,
                bpm: Some(120.0),
                musical_key: Some("C major".into()),
                loudness_db: -12.0,
                energy,
                spectral_centroid_hz: 2_000.0,
                spectral_rolloff_hz: 5_000.0,
                dynamic_range_db: 10.0,
                analyzed_at: "now".into(),
            }),
        }
    }

    #[test]
    fn generation_is_deterministic_and_caps_repeated_relationships() {
        let candidates = vec![
            candidate("a", "artist-1", "album-1", 0.6),
            candidate("b", "artist-1", "album-1", 0.62),
            candidate("c", "artist-2", "album-2", 0.58),
            candidate("d", "artist-3", "album-3", 0.61),
        ];
        let request = PlaylistGenerationRequest {
            seed_track_ids: vec!["a".into()],
            target_track_count: Some(3),
            max_tracks_per_artist: 1,
            max_tracks_per_album: 1,
            ..Default::default()
        };
        let first = rank_candidates(&candidates, &request);
        let second = rank_candidates(&candidates, &request);
        assert_eq!(first, second);
        assert_eq!(first.len(), 3);
        assert!(!first.iter().any(|selection| selection.track_id == "b"));
    }

    #[test]
    fn duration_and_energy_constraints_are_enforced() {
        let candidates = vec![
            candidate("low", "a", "x", 0.2),
            candidate("high", "b", "y", 0.8),
            candidate("more", "c", "z", 0.9),
        ];
        let request = PlaylistGenerationRequest {
            target_track_count: Some(10),
            target_duration_ms: Some(200_000),
            minimum_energy: Some(0.7),
            ..Default::default()
        };
        let generated = rank_candidates(&candidates, &request);
        assert_eq!(generated.len(), 1);
        assert_ne!(generated[0].track_id, "low");
    }

    #[test]
    fn extraction_produces_versioned_bounded_features() {
        let sample_rate = 8_000_u32;
        let sample_count = sample_rate;
        let data_size = sample_count * 2;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_size).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16_u32.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        wav.extend_from_slice(&2_u16.to_le_bytes());
        wav.extend_from_slice(&16_u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        for index in 0..sample_count {
            let sample = (0.5
                * (std::f32::consts::TAU * 440.0 * index as f32 / sample_rate as f32).sin()
                * i16::MAX as f32) as i16;
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        let directory = tempfile::tempdir().expect("temporary audio directory");
        let path = directory.path().join("tone.wav");
        fs::write(&path, wav).expect("write synthetic wav");

        let features = analyze_file("tone", &path).expect("analyze wav");
        assert_eq!(features.analysis_version, AUDIO_FEATURE_VERSION);
        assert!((0.0..=1.0).contains(&features.energy));
        assert!(features.spectral_centroid_hz > 0.0);
        assert!(features.spectral_rolloff_hz > 0.0);
        assert!((0.0..=60.0).contains(&features.dynamic_range_db));
        assert!(features.musical_key.is_some());
    }
}
