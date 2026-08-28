/**
 * Turns a theme's visualizer tokens into something the canvas analyser can draw.
 *
 * The design project styles its spectrum with plain CSS on DOM nodes:
 *
 *   .bar     { min-width: var(--bar-w); background: var(--bar-bg);
 *              border-radius: var(--bar-r); box-shadow: var(--viz-glow); }
 *   .bar-cap { height: var(--bar-cap-h); background: var(--bar-cap); }
 *
 * Bebop draws the same thing on a canvas, which understands none of that, so
 * the gradient and shadow strings are parsed here into stops, bands and blur
 * radii. Keeping the parsing in one place means a theme stays a JSON document
 * and never has to know a canvas is involved.
 */

export interface GradientStop {
  /** 0 at the bar's bottom, 1 at its top. */
  offset: number;
  color: string;
}

/** A band of a repeating fill, measured in pixels up from the bar's bottom. */
export interface FillBand {
  from: number;
  to: number;
  color: string;
}

export type FillSpec =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; stops: GradientStop[] }
  | { kind: 'repeating'; bands: FillBand[]; period: number };

export interface VisualizerStyle {
  barWidth: number;
  barGap: number;
  barRadius: number;
  fill: FillSpec;
  /** null when the theme asks for no cap. */
  capColor: string | null;
  capHeight: number;
  /** null when the theme asks for no glow. */
  glowColor: string | null;
  glowBlur: number;
}

export const DEFAULT_VISUALIZER_STYLE: VisualizerStyle = {
  barWidth: 3,
  barGap: 3,
  barRadius: 0,
  fill: { kind: 'solid', color: '#ffffff' },
  capColor: null,
  capHeight: 0,
  glowColor: null,
  glowBlur: 0,
};

/** Splits on top-level commas, so `rgba(0,0,0,.5) 4px` survives intact. */
export function splitTopLevel(input: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Pulls the colour off the front of a stop, leaving its positions behind. */
function splitStop(stop: string): { color: string; positions: string[] } {
  const tokens = splitTopLevel(stop, ' ').filter(Boolean);
  const color = tokens.shift() ?? 'transparent';
  return { color, positions: tokens };
}

export function parsePx(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parses `--bar-bg`.
 *
 * Two shapes appear in the design project, and they are drawn differently:
 * `linear-gradient(180deg, …)` runs over each bar's own height, while
 * `repeating-linear-gradient(0deg, …)` is a fixed-period pattern measured from
 * the bar's foot — that is what gives Black Dog its segmented meter.
 */
export function parseFill(value: string | undefined): FillSpec {
  const input = (value ?? '').trim();
  if (!input) return { kind: 'solid', color: '#ffffff' };

  const match = /^(repeating-)?linear-gradient\((.*)\)$/is.exec(input);
  if (!match) return { kind: 'solid', color: input };

  const repeating = Boolean(match[1]);
  const args = splitTopLevel(match[2]);
  // An explicit angle is optional; without one CSS defaults to `to bottom`.
  let angle = 180;
  if (args.length > 0 && /deg\s*$/i.test(args[0])) {
    angle = Number.parseFloat(args[0]);
    args.shift();
  }
  // 0deg points up, 180deg points down. Offsets below are measured from the
  // bar's bottom, so a downward gradient has to be read back to front.
  const downward = Math.abs((((angle % 360) + 360) % 360) - 180) < 90;

  if (args.length === 0) return { kind: 'solid', color: '#ffffff' };

  if (repeating) {
    const bands: FillBand[] = [];
    let cursor = 0;
    for (const arg of args) {
      const { color, positions } = splitStop(arg);
      const from = positions.length > 0 ? parsePx(positions[0], cursor) : cursor;
      const to = positions.length > 1 ? parsePx(positions[1], from) : from;
      bands.push({ from, to, color });
      cursor = to;
    }
    const period = bands.length > 0 ? bands[bands.length - 1].to : 0;
    if (period <= 0) return { kind: 'solid', color: bands[0]?.color ?? '#ffffff' };
    return {
      kind: 'repeating',
      period,
      bands: downward
        ? bands.map(({ from, to, color }) => ({ from: period - to, to: period - from, color }))
        : bands,
    };
  }

  const stops: GradientStop[] = args.map((arg, index) => {
    const { color, positions } = splitStop(arg);
    const percent = positions.length > 0 ? Number.parseFloat(positions[0]) : NaN;
    const fraction = Number.isFinite(percent)
      ? percent / 100
      : args.length > 1
        ? index / (args.length - 1)
        : 0;
    return { offset: downward ? 1 - fraction : fraction, color };
  });
  stops.sort((a, b) => a.offset - b.offset);
  return { kind: 'linear', stops };
}

/**
 * Parses `--viz-glow`, a box-shadow. Only the blur radius and the colour reach
 * the canvas — its shadows have no spread, and offsetting a glow would read as
 * a drop shadow rather than light.
 */
export function parseGlow(value: string | undefined): { color: string | null; blur: number } {
  const input = (value ?? '').trim();
  if (!input || input === 'none') return { color: null, blur: 0 };
  const parts = splitTopLevel(input, ' ').filter(Boolean);
  const lengths = parts.filter((part) => /^-?[\d.]+(px)?$/.test(part));
  const color = parts.find((part) => !/^-?[\d.]+(px)?$/.test(part));
  // `0 0 8px rgba(...)`: offset-x, offset-y, blur.
  const blur = lengths.length >= 3 ? parsePx(lengths[2], 0) : parsePx(lengths.at(-1), 0);
  if (!color || blur <= 0) return { color: null, blur: 0 };
  return { color, blur };
}

/**
 * Reads the visualizer half of a theme's token set. `fallbackColor` covers the
 * legacy presets, which predate these tokens and carry no `vars` at all — they
 * keep the flat single-colour meter they have always had.
 */
export function visualizerStyleFromVars(
  vars: Record<string, string> | undefined,
  fallbackColor = '#ffffff',
): VisualizerStyle {
  const v = vars ?? {};
  const capColor = (v['--bar-cap'] ?? '').trim();
  const capHeight = parsePx(v['--bar-cap-h'], 0);
  const glow = parseGlow(v['--viz-glow']);
  return {
    barWidth: Math.max(1, parsePx(v['--bar-w'], DEFAULT_VISUALIZER_STYLE.barWidth)),
    barGap: Math.max(0, parsePx(v['--bar-gap'], DEFAULT_VISUALIZER_STYLE.barGap)),
    // 9999px is CSS shorthand for "fully round"; the canvas wants half the width.
    barRadius: Math.min(parsePx(v['--bar-r'], 0), Math.max(1, parsePx(v['--bar-w'], 3)) / 2),
    fill: v['--bar-bg'] ? parseFill(v['--bar-bg']) : { kind: 'solid', color: fallbackColor },
    capColor: !capColor || capColor === 'transparent' || capHeight <= 0 ? null : capColor,
    capHeight: capHeight > 0 ? capHeight : 0,
    glowColor: glow.color,
    glowBlur: glow.blur,
  };
}
