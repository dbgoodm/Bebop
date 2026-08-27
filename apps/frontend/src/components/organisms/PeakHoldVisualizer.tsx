import React, { useEffect, useRef, useState } from 'react';

interface PeakHoldVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  height?: number;
  barWidth?: number;
  barGap?: number;
  /** Bar and cap colour. Defaults to white; themes override it. */
  color?: string;
  /** Optional second stop for the bar gradient. Defaults to a fade of `color`. */
  secondaryColor?: string;
  glowEffect?: boolean;
  className?: string;
  intensity?: number;
  autoFillWidth?: boolean;
  /** Milliseconds a cap stays at its peak before it starts falling. */
  holdMs?: number;
  /** Fraction of the full height a cap falls per second once it releases. */
  fallRate?: number;
  frequencyDataProvider?: (outputArray: Uint8Array) => Uint8Array;
  /**
   * Pulls the latest native spectrum inside the animation loop. Preferred over
   * `spectrumBins`, which would require a React render per audio frame.
   */
  getSpectrumBins?: () => readonly number[];
  spectrumBins?: readonly number[];
  /** Draws drifting particles above the bars. Fullscreen only — it costs frame time. */
  particles?: boolean;
}

/**
 * Peak-hold spectrum analyser.
 *
 * Each bar tracks the current band level with a fast attack and a gravity-driven
 * decay. A cap rides above it holding the recent maximum: a new peak moves the cap
 * up instantly, it then sits still for `holdMs` before falling at a constant rate.
 * The cap never eases upward, which is what gives the meter its snap.
 */
export const PeakHoldVisualizer: React.FC<PeakHoldVisualizerProps> = ({
  isPlaying,
  barCount = 63,
  height = 56,
  barWidth = 4,
  barGap = 3,
  color = '#ffffff',
  secondaryColor,
  glowEffect = true,
  className = '',
  intensity = 1.0,
  autoFillWidth = true,
  holdMs = 420,
  fallRate = 0.7,
  frequencyDataProvider,
  getSpectrumBins,
  spectrumBins,
  particles = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [computedBarCount, setComputedBarCount] = useState<number>(barCount);

  // Values the animation loop reads but must not restart for. Rebuilding the loop
  // on every prop identity change was itself a source of stutter.
  const liveRef = useRef({ isPlaying, frequencyDataProvider, getSpectrumBins, spectrumBins, color });
  liveRef.current = { isPlaying, frequencyDataProvider, getSpectrumBins, spectrumBins, color };
  const usesNativeSpectrum = getSpectrumBins !== undefined || spectrumBins !== undefined;

  useEffect(() => {
    const updateBarCount = () => {
      if (!containerRef.current || !autoFillWidth) {
        setComputedBarCount(barCount);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const slot = barWidth + barGap;
      const fits = Math.max(8, Math.floor((rect.width + barGap) / slot));
      setComputedBarCount(fits);
    };
    updateBarCount();
    const observer = new ResizeObserver(updateBarCount);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [autoFillWidth, barCount, barWidth, barGap]);

  const physicsRef = useRef({
    heights: new Float32Array(computedBarCount),
    velocities: new Float32Array(computedBarCount),
    peaks: new Float32Array(computedBarCount),
    /** Timestamp until which each cap stays pinned at its peak. */
    holdUntil: new Float64Array(computedBarCount),
    rawFftBuffer: new Uint8Array(1024),
    targets: new Float32Array(computedBarCount),
  });

  useEffect(() => {
    physicsRef.current.heights = new Float32Array(computedBarCount).fill(2);
    physicsRef.current.velocities = new Float32Array(computedBarCount).fill(0);
    physicsRef.current.peaks = new Float32Array(computedBarCount).fill(2);
    physicsRef.current.holdUntil = new Float64Array(computedBarCount).fill(0);
  }, [computedBarCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let restingPhase = 0;
    let lastFrame = performance.now();

    const render = () => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, (now - lastFrame) / 1_000);
      lastFrame = now;
      restingPhase += 0.04;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width || 800;
      const h = height;

      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const numBars = computedBarCount;
      if (numBars <= 0) {
        ctx.restore();
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const step = autoFillWidth && numBars > 1 ? (w - barWidth) / (numBars - 1) : barWidth + barGap;
      const startX = autoFillWidth
        ? 0
        : Math.max(0, (w - (numBars * (barWidth + barGap) - barGap)) / 2);

      const live = liveRef.current;
      const state = physicsRef.current;
      if (live.frequencyDataProvider) live.frequencyDataProvider(state.rawFftBuffer);
      else state.rawFftBuffer.fill(0);

      // Reused between frames — allocating per frame produced steady GC churn.
      if (state.targets.length !== numBars) state.targets = new Float32Array(numBars);
      const targets = state.targets;
      const sampleRate = 44_100;
      const fftBinCount = 1024;
      const minFreq = 20;
      const maxFreq = 18_000;
      let totalLiveEnergy = 0;

      for (let i = 0; i < numBars; i++) {
        let avgMagnitude = 0;
        const nativeBins = live.getSpectrumBins ? live.getSpectrumBins() : live.spectrumBins;
        if (nativeBins && nativeBins.length > 0) {
          const sourcePosition = (i / Math.max(1, numBars - 1)) * (nativeBins.length - 1);
          const lowIndex = Math.max(0, Math.floor(sourcePosition));
          const highIndex = Math.min(nativeBins.length - 1, Math.ceil(sourcePosition));
          const mix = sourcePosition - lowIndex;
          avgMagnitude =
            (nativeBins[lowIndex] ?? 0) * (1 - mix) + (nativeBins[highIndex] ?? 0) * mix;
        } else {
          const fLow = minFreq * Math.pow(maxFreq / minFreq, i / numBars);
          const fHigh = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / numBars);
          const binLow = Math.max(0, Math.min(fftBinCount - 1, Math.floor((fLow * 2048) / sampleRate)));
          const binHigh = Math.max(
            binLow + 1,
            Math.min(fftBinCount, Math.ceil((fHigh * 2048) / sampleRate)),
          );
          let sum = 0;
          for (let b = binLow; b < binHigh; b++) sum += state.rawFftBuffer[b];
          avgMagnitude = sum / Math.max(1, binHigh - binLow);
        }
        totalLiveEnergy += avgMagnitude;

        // Mild bass weighting so the low end reads without swamping the display.
        const normPos = i / numBars;
        const weight = normPos < 0.2 ? 1.5 - normPos * 1.2 : normPos < 0.6 ? 1.25 : 1.1;
        const normalizedAmp = (avgMagnitude / 255) * weight;
        targets[i] = Math.max(2, Math.min(h - 2, normalizedAmp * (h * 0.95) * intensity));
      }

      // Idle breath when there is nothing to show.
      if (!live.isPlaying || totalLiveEnergy < 5) {
        for (let i = 0; i < numBars; i++) {
          targets[i] = Math.max(2, Math.sin(restingPhase + i * 0.18) * 1.5 + 2.5);
        }
      }

      // Bar physics: fast attack, gravity decay. Cap physics: snap up, hold, fall.
      const gravity = 0.7;
      const attackFactor = 0.8;
      const capFallPerFrame = h * fallRate * deltaSeconds;

      for (let i = 0; i < numBars; i++) {
        const target = targets[i];
        let currentH = state.heights[i] || 2;
        let currentV = state.velocities[i] || 0;

        if (target > currentH) {
          currentH += (target - currentH) * attackFactor;
          currentV = 0;
        } else {
          currentV += gravity;
          currentH = Math.max(2, currentH - currentV);
        }
        state.heights[i] = currentH;
        state.velocities[i] = currentV;

        // A new high teleports the cap up and restarts its hold window.
        if (currentH >= state.peaks[i]) {
          state.peaks[i] = currentH;
          state.holdUntil[i] = now + holdMs;
        } else if (now >= state.holdUntil[i]) {
          state.peaks[i] = Math.max(currentH, state.peaks[i] - capFallPerFrame);
        }
      }

      const drawColor = live.color;
      const gradient = ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, secondaryColor ?? withAlpha(drawColor, 0.08));
      gradient.addColorStop(0.55, withAlpha(drawColor, 0.55));
      gradient.addColorStop(1, drawColor);

      const drawWidth = Math.max(2, barWidth);
      const capHeight = Math.max(2, Math.round(barWidth * 0.75));

      // One path for every bar and one for every cap. Filling per bar — especially
      // with a shadow set — was costing more than the physics and the audio combined.
      ctx.beginPath();
      for (let i = 0; i < numBars; i++) {
        const barH = state.heights[i];
        ctx.rect(startX + i * step, h - barH, drawWidth, barH);
      }
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < numBars; i++) {
        const capY = Math.max(0, h - state.peaks[i] - capHeight - 1);
        ctx.rect(startX + i * step, capY, drawWidth, capHeight);
      }
      ctx.fillStyle = drawColor;
      if (glowEffect) {
        ctx.shadowColor = withAlpha(drawColor, 0.55);
        ctx.shadowBlur = 6;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (particles) {
        drawParticles(ctx, state, w, h, numBars, step, drawColor, deltaSeconds);
      }

      ctx.restore();
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [
    computedBarCount,
    height,
    barWidth,
    barGap,
    color,
    secondaryColor,
    glowEffect,
    intensity,
    autoFillWidth,
    holdMs,
    fallRate,
    particles,
  ]);

  return (
    <div ref={containerRef} className={`w-full ${className}`} style={{ height }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

interface Particle {
  x: number;
  y: number;
  vy: number;
  life: number;
  size: number;
}

const particlePool: Particle[] = [];

/**
 * Emits a spark whenever a band pushes a new peak, then drifts it upward as it
 * fades. Capped and pooled so a loud passage cannot grow the array without bound.
 */
function drawParticles(
  ctx: CanvasRenderingContext2D,
  state: { heights: Float32Array; peaks: Float32Array },
  _width: number,
  h: number,
  numBars: number,
  step: number,
  color: string,
  deltaSeconds: number,
) {
  const MAX = 90;
  for (let i = 0; i < numBars; i += 2) {
    if (particlePool.length >= MAX) break;
    // Only spawn where the bar has just reached its own cap — a genuine transient.
    if (state.heights[i] > h * 0.45 && state.heights[i] >= state.peaks[i] - 1) {
      if (Math.random() > 0.82) {
        particlePool.push({
          x: i * step + step * 0.5,
          y: h - state.heights[i] - 4,
          vy: -14 - Math.random() * 26,
          life: 1,
          size: 1 + Math.random() * 1.6,
        });
      }
    }
  }

  for (let i = particlePool.length - 1; i >= 0; i--) {
    const p = particlePool[i];
    p.y += p.vy * deltaSeconds;
    p.vy *= 0.985;
    p.life -= deltaSeconds * 0.62;
    if (p.life <= 0 || p.y < -10) {
      particlePool.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.max(0, p.life) * 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Accepts #rgb, #rrggbb, or any CSS colour; falls back to a plain rgba mix. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return color;
  let value = match[1];
  if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
