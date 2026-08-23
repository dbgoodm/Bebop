use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use crossbeam_queue::ArrayQueue;
use rodio::{ChannelCount, SampleRate, Source, source::SeekError};
use rustfft::{FftPlanner, num_complex::Complex32};

const FFT_SIZE: usize = 2_048;
const SPECTRUM_BINS: usize = 64;
const SAMPLE_QUEUE_CAPACITY: usize = 16_384;
const FRAME_INTERVAL: Duration = Duration::from_millis(33);

#[derive(Clone, Debug)]
pub(crate) struct AnalyzedSpectrum {
    pub sequence: u64,
    pub bins: Vec<u8>,
    pub peak: u8,
}

pub(crate) struct SpectrumAnalyzer {
    samples: Arc<ArrayQueue<f32>>,
    enabled: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    sample_rate: Arc<AtomicU32>,
    latest: Arc<Mutex<Option<AnalyzedSpectrum>>>,
}

impl Default for SpectrumAnalyzer {
    fn default() -> Self {
        let samples = Arc::new(ArrayQueue::new(SAMPLE_QUEUE_CAPACITY));
        let enabled = Arc::new(AtomicBool::new(true));
        let running = Arc::new(AtomicBool::new(true));
        let sample_rate = Arc::new(AtomicU32::new(44_100));
        let latest = Arc::new(Mutex::new(None));
        spawn_fft_worker(
            Arc::clone(&samples),
            Arc::clone(&enabled),
            Arc::clone(&running),
            Arc::clone(&sample_rate),
            Arc::clone(&latest),
        );
        Self {
            samples,
            enabled,
            running,
            sample_rate,
            latest,
        }
    }
}

impl SpectrumAnalyzer {
    pub(crate) fn tap<S: Source>(&self, source: S) -> SpectrumTap<S> {
        self.sample_rate
            .store(source.sample_rate(), Ordering::Release);
        while self.samples.pop().is_some() {}
        if let Ok(mut latest) = self.latest.lock() {
            *latest = None;
        }
        SpectrumTap {
            channels: usize::from(source.channels()).max(1),
            inner: source,
            samples: Arc::clone(&self.samples),
            enabled: Arc::clone(&self.enabled),
            channel_index: 0,
            frame_sum: 0.0,
        }
    }

    pub(crate) fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Release);
        if !enabled {
            while self.samples.pop().is_some() {}
            if let Ok(mut latest) = self.latest.lock() {
                *latest = None;
            }
        }
    }

    pub(crate) fn take_latest(&self) -> Option<AnalyzedSpectrum> {
        self.latest.lock().ok()?.take()
    }
}

impl Drop for SpectrumAnalyzer {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
    }
}

pub(crate) struct SpectrumTap<S> {
    inner: S,
    samples: Arc<ArrayQueue<f32>>,
    enabled: Arc<AtomicBool>,
    channels: usize,
    channel_index: usize,
    frame_sum: f32,
}

impl<S: Source> Iterator for SpectrumTap<S> {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.inner.next()?;
        if self.enabled.load(Ordering::Relaxed) {
            self.frame_sum += sample;
            self.channel_index += 1;
            if self.channel_index == self.channels {
                let mono = self.frame_sum / self.channels as f32;
                let _ = self.samples.force_push(mono);
                self.channel_index = 0;
                self.frame_sum = 0.0;
            }
        } else {
            self.channel_index = 0;
            self.frame_sum = 0.0;
        }
        Some(sample)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

impl<S: Source> Source for SpectrumTap<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> ChannelCount {
        self.inner.channels()
    }

    fn sample_rate(&self) -> SampleRate {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, position: Duration) -> Result<(), SeekError> {
        self.channel_index = 0;
        self.frame_sum = 0.0;
        while self.samples.pop().is_some() {}
        self.inner.try_seek(position)
    }
}

fn spawn_fft_worker(
    samples: Arc<ArrayQueue<f32>>,
    enabled: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    sample_rate: Arc<AtomicU32>,
    latest: Arc<Mutex<Option<AnalyzedSpectrum>>>,
) {
    thread::spawn(move || {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let mut rolling = VecDeque::with_capacity(FFT_SIZE);
        let mut buffer = vec![Complex32::new(0.0, 0.0); FFT_SIZE];
        let sequence = AtomicU64::new(0);
        let mut last_frame = Instant::now() - FRAME_INTERVAL;
        let mut configured_rate = sample_rate.load(Ordering::Acquire);

        while running.load(Ordering::Acquire) {
            if !enabled.load(Ordering::Acquire) {
                rolling.clear();
                while samples.pop().is_some() {}
                thread::sleep(Duration::from_millis(20));
                continue;
            }
            let current_rate = sample_rate.load(Ordering::Acquire);
            if current_rate != configured_rate {
                configured_rate = current_rate;
                rolling.clear();
            }
            let mut received_samples = false;
            while let Some(sample) = samples.pop() {
                received_samples = true;
                if rolling.len() == FFT_SIZE {
                    rolling.pop_front();
                }
                rolling.push_back(sample);
            }
            if received_samples
                && rolling.len() == FFT_SIZE
                && last_frame.elapsed() >= FRAME_INTERVAL
            {
                let analyzed = analyze(
                    &rolling,
                    configured_rate,
                    &fft,
                    &mut buffer,
                    sequence.fetch_add(1, Ordering::Relaxed),
                );
                if let Ok(mut slot) = latest.lock() {
                    *slot = Some(analyzed);
                }
                last_frame = Instant::now();
            }
            thread::sleep(Duration::from_millis(4));
        }
    });
}

fn analyze(
    samples: &VecDeque<f32>,
    sample_rate: u32,
    fft: &Arc<dyn rustfft::Fft<f32>>,
    buffer: &mut [Complex32],
    sequence: u64,
) -> AnalyzedSpectrum {
    let mut peak = 0.0_f32;
    for (index, (target, sample)) in buffer.iter_mut().zip(samples).enumerate() {
        peak = peak.max(sample.abs());
        let hann =
            0.5 * (1.0 - (std::f32::consts::TAU * index as f32 / (FFT_SIZE - 1) as f32).cos());
        *target = Complex32::new(sample * hann, 0.0);
    }
    fft.process(buffer);

    let nyquist = sample_rate as f32 / 2.0;
    let maximum_frequency = nyquist.min(20_000.0);
    let mut bins = Vec::with_capacity(SPECTRUM_BINS);
    for index in 0..SPECTRUM_BINS {
        let low = 20.0 * (maximum_frequency / 20.0).powf(index as f32 / SPECTRUM_BINS as f32);
        let high =
            20.0 * (maximum_frequency / 20.0).powf((index + 1) as f32 / SPECTRUM_BINS as f32);
        let start = ((low * FFT_SIZE as f32 / sample_rate as f32).floor() as usize)
            .clamp(1, FFT_SIZE / 2 - 1);
        let end = ((high * FFT_SIZE as f32 / sample_rate as f32).ceil() as usize)
            .clamp(start + 1, FFT_SIZE / 2);
        let magnitude = buffer[start..end]
            .iter()
            .map(|value| value.norm())
            .fold(0.0_f32, f32::max)
            / FFT_SIZE as f32;
        let decibels = 20.0 * magnitude.max(0.000_000_1).log10();
        bins.push((((decibels + 80.0) / 80.0).clamp(0.0, 1.0) * 255.0) as u8);
    }

    AnalyzedSpectrum {
        sequence,
        bins,
        peak: (peak.clamp(0.0, 1.0) * 255.0) as u8,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustfft::FftPlanner;

    #[test]
    fn fft_produces_bounded_logarithmic_bins() {
        let sample_rate = 48_000;
        let samples = (0..FFT_SIZE)
            .map(|index| {
                (std::f32::consts::TAU * 1_000.0 * index as f32 / sample_rate as f32).sin()
            })
            .collect::<VecDeque<_>>();
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let mut buffer = vec![Complex32::new(0.0, 0.0); FFT_SIZE];
        let frame = analyze(&samples, sample_rate, &fft, &mut buffer, 7);
        assert_eq!(frame.sequence, 7);
        assert_eq!(frame.bins.len(), SPECTRUM_BINS);
        assert!(frame.peak > 200);
        assert!(frame.bins.iter().any(|bin| *bin > 100));
    }
}
