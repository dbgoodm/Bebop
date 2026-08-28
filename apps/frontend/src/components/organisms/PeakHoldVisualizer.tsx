import React, { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_VISUALIZER_STYLE,
  type FillSpec,
  type VisualizerStyle,
} from '@/services/visualizerStyle';

interface PeakHoldVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  height?: number;
  /**
   * Bar width, gap, corner radius, fill, cap and glow, read from the active
   * theme's visualizer tokens. Appearance belongs to the theme; only the motion
   * below is Bebop's own.
   */
  style?: VisualizerStyle;
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
  style = DEFAULT_VISUALIZER_STYLE,
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
  const { barWidth, barGap } = style;

  // Values the animation loop reads but must not restart for. Rebuilding the loop
  // on every prop identity change was itself a source of stutter.
  const liveRef = useRef({
    isPlaying,
    frequencyDataProvider,
    getSpectrumBins,
    spectrumBins,
    style,
  });
  liveRef.current = { isPlaying, frequencyDataProvider, getSpectrumBins, spectrumBins, style };
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

      const step =
        autoFillWidth && numBars > 1 ? (w - barWidth) / (numBars - 1) : barWidth + barGap;
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
          const binLow = Math.max(
            0,
            Math.min(fftBinCount - 1, Math.floor((fLow * 2048) / sampleRate)),
          );
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

      const drawStyle = live.style;
      const drawWidth = Math.max(1, drawStyle.barWidth);
      const radius = Math.min(drawStyle.barRadius, drawWidth / 2);

      // In the design source each bar's gradient runs over that bar's own
      // height, so a short bar still shows its bright top stop. Creating one
      // gradient per bar would mean one fill per bar; instead the bars are
      // bucketed by height and each bucket fills in a single pass.
      const addBar = (i: number, top: number, barH: number) => {
        const x = startX + i * step;
        if (radius > 0) roundedTop(ctx, x, top, drawWidth, barH, radius);
        else ctx.rect(x, top, drawWidth, barH);
      };

      if (drawStyle.fill.kind === 'linear') {
        const stops = drawStyle.fill.stops;
        const buckets: number[][] = [];
        for (let i = 0; i < numBars; i++) {
          const b = Math.min(
            HEIGHT_BUCKETS - 1,
            Math.max(0, Math.floor((state.heights[i] / h) * HEIGHT_BUCKETS)),
          );
          (buckets[b] ??= []).push(i);
        }
        for (let b = 0; b < buckets.length; b++) {
          const members = buckets[b];
          if (!members || members.length === 0) continue;
          const bucketH = Math.max(1, ((b + 0.5) / HEIGHT_BUCKETS) * h);
          const gradient = ctx.createLinearGradient(0, h, 0, h - bucketH);
          for (const stop of stops) gradient.addColorStop(clamp01(stop.offset), stop.color);
          ctx.beginPath();
          for (const i of members) addBar(i, h - state.heights[i], state.heights[i]);
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      } else {
        // Solid and repeating fills are height-independent, so every bar goes
        // into one path — the repeating pattern is anchored to the bars' feet.
        ctx.beginPath();
        for (let i = 0; i < numBars; i++) addBar(i, h - state.heights[i], state.heights[i]);
        ctx.fillStyle =
          drawStyle.fill.kind === 'solid'
            ? drawStyle.fill.color
            : (patternFor(ctx, drawStyle.fill, h) ?? drawStyle.fill.bands[0].color);
        ctx.fill();
      }

      if (drawStyle.capColor && drawStyle.capHeight > 0) {
        const capHeight = drawStyle.capHeight;
        ctx.beginPath();
        for (let i = 0; i < numBars; i++) {
          const capY = Math.max(0, h - state.peaks[i] - capHeight - 1);
          if (radius > 0) roundedTop(ctx, startX + i * step, capY, drawWidth, capHeight, radius);
          else ctx.rect(startX + i * step, capY, drawWidth, capHeight);
        }
        ctx.fillStyle = drawStyle.capColor;
        // One shadowed fill for every cap. Per-element shadows are the single
        // most expensive thing this canvas can do on WebKitGTK.
        if (drawStyle.glowColor) {
          ctx.shadowColor = drawStyle.glowColor;
          ctx.shadowBlur = drawStyle.glowBlur;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (particles) {
        drawParticles(ctx, state, w, h, numBars, step, particleColor(drawStyle), deltaSeconds);
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

/** Height buckets used to share one gradient between bars of similar height. */
const HEIGHT_BUCKETS = 12;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A bar with its top corners rounded and its feet square, which is how a CSS
 * `border-radius` reads once the bar is clipped to the meter's floor.
 */
function roundedTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, Math.max(0, height));
  ctx.moveTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height);
  ctx.closePath();
}

/**
 * Builds the tile for a repeating fill — Black Dog's segmented meter. The bands
 * are measured up from the bar's foot, so the tile is drawn upside down and the
 * pattern is then shifted to put a band boundary exactly on the meter's floor.
 */
const patternCache = new WeakMap<FillSpec & { kind: 'repeating' }, CanvasPattern | null>();

function patternFor(
  ctx: CanvasRenderingContext2D,
  fill: FillSpec & { kind: 'repeating' },
  floorY: number,
): CanvasPattern | null {
  let pattern = patternCache.get(fill);
  if (pattern === undefined) {
    const period = Math.max(1, Math.round(fill.period));
    const tile = document.createElement('canvas');
    tile.width = 1;
    tile.height = period;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) {
      patternCache.set(fill, null);
      return null;
    }
    for (const band of fill.bands) {
      tileCtx.fillStyle = band.color;
      tileCtx.fillRect(0, period - band.to, 1, Math.max(0, band.to - band.from));
    }
    pattern = ctx.createPattern(tile, 'repeat');
    patternCache.set(fill, pattern);
  }
  if (pattern && typeof pattern.setTransform === 'function' && typeof DOMMatrix === 'function') {
    const period = Math.max(1, Math.round(fill.period));
    pattern.setTransform(new DOMMatrix().translateSelf(0, floorY % period));
  }
  return pattern;
}

/** Sparks take the cap colour, or the fill's brightest stop when there is no cap. */
function particleColor(style: VisualizerStyle): string {
  if (style.capColor) return style.capColor;
  if (style.fill.kind === 'solid') return style.fill.color;
  if (style.fill.kind === 'linear') return style.fill.stops.at(-1)?.color ?? '#ffffff';
  return style.fill.bands[0]?.color ?? '#ffffff';
}

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
