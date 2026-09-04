import type { ThemeConfig } from './themeService';

export const THEME_DOCUMENT_VERSION = 1 as const;
export const THEME_FALLBACK_ID = 'space-cowboy-v2';

export type ThemeImageFit = 'cover' | 'contain' | 'fill' | 'none';
export type ThemeImageRepeat = 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
export type ThemeBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'color-dodge';

export interface ThemeAssetReference {
  /** Stable filename within a saved theme's asset directory. */
  path: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  bytes: number;
  /** Preview-only object/data URL. Never serialized to persisted settings. */
  previewUrl?: string;
  stagedPath?: string;
}

export interface ThemeImageLayer {
  asset: ThemeAssetReference;
  fit: ThemeImageFit;
  position: string;
  repeat: ThemeImageRepeat;
  opacity: number;
  blendMode: ThemeBlendMode;
  blur: number;
}

export interface ThemeDocumentV1 extends ThemeConfig {
  version: typeof THEME_DOCUMENT_VERSION;
  baseThemeId?: string;
  createdAt: string;
  updatedAt: string;
  images?: {
    background?: ThemeImageLayer;
    overlay?: ThemeImageLayer;
  };
}

export type ThemeTokenControl = 'color' | 'number' | 'select' | 'text' | 'shadow' | 'gradient';
export type ThemeTokenSection =
  | 'palette'
  | 'geometry'
  | 'typography'
  | 'texture'
  | 'ambience'
  | 'motion'
  | 'visualizer'
  | 'waveform';

export interface ThemeTokenDefinition {
  key: string;
  label: string;
  section: ThemeTokenSection;
  control: ThemeTokenControl;
  defaultValue: string;
  options?: readonly string[];
  validate(value: string): string | null;
}

const TOKEN_KEYS = [
  '--ascent-col', '--ascent-dur', '--ascent-x', '--ascent-y',
  '--bar-bg', '--bar-cap', '--bar-cap-h', '--bar-gap', '--bar-r', '--bar-w', '--btn-r',
  '--c-border', '--c-border-a', '--c-canvas', '--c-canvas-g', '--c-card', '--c-card-g',
  '--c-fg', '--c-fg2', '--c-fg3', '--c-glow', '--c-on-p', '--c-p', '--c-ph', '--c-s',
  '--c-surface', '--c-t', '--c-wave-lo', '--c-wave-un', '--cap', '--clip', '--clip-btn',
  '--corner', '--corner-op', '--corner-shadow', '--cover-a', '--cursor', '--f-b', '--f-d',
  '--f-h', '--f-m', '--f-q', '--f-stamp', '--fi-q', '--fs-aff', '--fs-card', '--fs-hero',
  '--fs-q', '--fs-sec', '--fs-stat', '--hover-t', '--ls-d', '--ls-h', '--ls-q',
  '--nav-shadow', '--op-ascent', '--op-glitch', '--op-pip', '--op-scan', '--op-scrawl', '--op-ship',
  '--op-smoke', '--op-stamp', '--op-stars', '--orb-dur', '--orb-g', '--pip-col', '--r',
  '--r-sm', '--rule', '--rule-r', '--shadow', '--stamp-col', '--stamp-rot', '--sw', '--tex',
  '--tex-op', '--tex-size', '--trans', '--tt-brand', '--tt-l', '--tt-title', '--viz-glow',
  '--w-d', '--smoke-stroke', '--trail-col', '--ember-col',
] as const;

export type ThemeTokenKey = (typeof TOKEN_KEYS)[number];

const COLOR_TOKENS = new Set([
  '--ascent-col', '--bar-cap', '--c-border', '--c-border-a', '--c-canvas', '--c-card', '--c-fg', '--c-fg2',
  '--c-fg3', '--c-on-p', '--c-p', '--c-ph', '--c-s', '--c-surface', '--c-t', '--c-wave-lo',
  '--c-wave-un', '--ember-col', '--pip-col', '--rule', '--smoke-stroke', '--stamp-col', '--trail-col',
]);
const GRADIENT_TOKENS = new Set(['--bar-bg', '--c-canvas-g', '--c-card-g', '--cover-a', '--orb-g', '--tex']);
const SHADOW_TOKENS = new Set(['--c-glow', '--corner-shadow', '--nav-shadow', '--shadow', '--viz-glow']);
const NUMBER_TOKENS = new Set([
  '--ascent-dur', '--ascent-x', '--ascent-y', '--bar-cap-h', '--bar-gap', '--bar-r', '--bar-w', '--btn-r', '--corner-op', '--fs-aff',
  '--fs-card', '--fs-hero', '--fs-q', '--fs-sec', '--fs-stat', '--ls-d', '--ls-h', '--ls-q',
  '--op-ascent', '--op-glitch', '--op-pip', '--op-scan', '--op-scrawl', '--op-ship', '--op-smoke',
  '--op-stamp', '--op-stars', '--orb-dur', '--r', '--r-sm', '--rule-r', '--stamp-rot',
  '--sw', '--tex-op', '--w-d',
]);

function tokenSection(key: ThemeTokenKey): ThemeTokenSection {
  if (key.startsWith('--f-') || key.startsWith('--fs-') || key.startsWith('--ls-') || key.startsWith('--tt-') || key === '--w-d' || key === '--fi-q') return 'typography';
  if (key.startsWith('--bar-') || key === '--viz-glow') return 'visualizer';
  if (key.startsWith('--c-wave')) return 'waveform';
  if (key.startsWith('--op-') || key.startsWith('--ascent-') || key === '--smoke-stroke' || key === '--ember-col' || key === '--trail-col' || key === '--orb-g' || key === '--pip-col' || key.startsWith('--stamp-')) return 'ambience';
  if (key === '--tex' || key === '--tex-size' || key === '--tex-op' || key === '--corner') return 'texture';
  if (key === '--hover-t' || key === '--trans' || key === '--orb-dur') return 'motion';
  if (key.startsWith('--c-') || key === '--rule') return 'palette';
  return 'geometry';
}

function defaultFor(key: ThemeTokenKey): string {
  if (key.startsWith('--op-') || key.endsWith('-op')) return '0';
  if (key.startsWith('--f-')) return 'sans-serif';
  if (key.startsWith('--tt-')) return 'none';
  if (key.startsWith('--c-') || COLOR_TOKENS.has(key)) return '#ffffff';
  if (key === '--cap') return 'round';
  if (key === '--cursor') return 'auto';
  if (key.includes('shadow') || key === '--viz-glow') return 'none';
  return '0px';
}

function controlFor(key: ThemeTokenKey): ThemeTokenControl {
  if (COLOR_TOKENS.has(key)) return 'color';
  if (GRADIENT_TOKENS.has(key)) return 'gradient';
  if (SHADOW_TOKENS.has(key)) return 'shadow';
  if (NUMBER_TOKENS.has(key)) return 'number';
  if (key === '--cap' || key === '--cursor' || key.startsWith('--tt-') || key === '--fi-q') return 'select';
  return 'text';
}

function optionsFor(key: ThemeTokenKey): readonly string[] | undefined {
  if (key === '--cap') return ['round', 'square', 'butt'];
  if (key === '--cursor') return ['auto', 'default', 'pointer', 'crosshair'];
  if (key.startsWith('--tt-')) return ['none', 'uppercase', 'lowercase', 'capitalize'];
  if (key === '--fi-q') return ['normal', 'italic'];
  return undefined;
}

function validateToken(value: string): string | null {
  if (value.length > 2048) return 'Value is too long';
  if (/url\s*\(|expression\s*\(|javascript:/i.test(value)) return 'External URLs and executable CSS are not supported';
  return value.trim() ? null : 'Value is required';
}

export const THEME_TOKEN_REGISTRY: readonly ThemeTokenDefinition[] = TOKEN_KEYS.map((key) => ({
  key,
  label: key.slice(2).replaceAll('-', ' '),
  section: tokenSection(key),
  control: controlFor(key),
  defaultValue: defaultFor(key),
  options: optionsFor(key),
  validate: validateToken,
}));

export const THEME_TOKEN_BY_KEY = new Map(THEME_TOKEN_REGISTRY.map((token) => [token.key, token]));

export interface NumberTokenRange {
  min: number;
  max: number;
  step: number;
  /** Unit appended when the slider/number field commits a new value. */
  unit: string;
}

// Explicit ranges for tokens whose semantics (and canonical unit) aren't
// inferable from the value alone — e.g. a radius token is always px, a
// letter-spacing token is always em. Opacity tokens (`--op-*`/`*-op`) don't
// need an entry here; numberRangeFor falls back to a 0–1 ratio for those.
const NUMBER_TOKEN_RANGES: Record<string, NumberTokenRange> = {
  '--ascent-dur': { min: 200, max: 4_000, step: 50, unit: 'ms' },
  '--ascent-x': { min: -300, max: 300, step: 1, unit: 'px' },
  '--ascent-y': { min: -300, max: 300, step: 1, unit: 'px' },
  '--bar-cap-h': { min: 0, max: 12, step: 1, unit: 'px' },
  '--bar-gap': { min: 0, max: 12, step: 1, unit: 'px' },
  '--bar-r': { min: 0, max: 20, step: 1, unit: 'px' },
  '--bar-w': { min: 1, max: 24, step: 1, unit: 'px' },
  '--btn-r': { min: 0, max: 48, step: 1, unit: 'px' },
  '--fs-aff': { min: 8, max: 72, step: 1, unit: 'px' },
  '--fs-card': { min: 8, max: 72, step: 1, unit: 'px' },
  '--fs-hero': { min: 8, max: 120, step: 1, unit: 'px' },
  '--fs-q': { min: 8, max: 72, step: 1, unit: 'px' },
  '--fs-sec': { min: 8, max: 72, step: 1, unit: 'px' },
  '--fs-stat': { min: 8, max: 96, step: 1, unit: 'px' },
  '--ls-d': { min: -0.05, max: 0.3, step: 0.005, unit: 'em' },
  '--ls-h': { min: -0.05, max: 0.3, step: 0.005, unit: 'em' },
  '--ls-q': { min: -0.05, max: 0.3, step: 0.005, unit: 'em' },
  '--orb-dur': { min: 2, max: 40, step: 0.5, unit: 's' },
  '--r': { min: 0, max: 40, step: 1, unit: 'px' },
  '--r-sm': { min: 0, max: 24, step: 1, unit: 'px' },
  '--rule-r': { min: 0, max: 20, step: 1, unit: 'px' },
  '--stamp-rot': { min: -45, max: 45, step: 1, unit: 'deg' },
  '--sw': { min: 0, max: 8, step: 0.5, unit: 'px' },
  '--w-d': { min: 100, max: 900, step: 100, unit: '' },
};

/** A slider range + canonical unit for a `number`-controlled token. Tokens
 * not listed explicitly fall back to a 0–1 ratio (for opacity-shaped keys) or
 * a generic 0–100px range, so every `number` token still gets a usable slider
 * even if it's missing a bespoke entry above. */
export function numberRangeFor(key: string): NumberTokenRange {
  const explicit = NUMBER_TOKEN_RANGES[key];
  if (explicit) return explicit;
  if (key.startsWith('--op-') || key.endsWith('-op')) {
    return { min: 0, max: 1, step: 0.01, unit: '' };
  }
  return { min: 0, max: 100, step: 1, unit: 'px' };
}

/** Pulls the leading numeric magnitude out of a CSS value string like "12px",
 * "0.04em", "45deg", or "600" — the unit is tracked separately via the
 * token's range, since a bare number field shouldn't have to parse it back. */
export function parseNumberToken(value: string): number {
  const match = value.match(/-?[\d.]+/);
  return match ? Number(match[0]) : 0;
}

export function toThemeDocument(theme: ThemeConfig, baseThemeId = theme.id): ThemeDocumentV1 {
  const now = new Date().toISOString();
  const candidate = theme as Partial<ThemeDocumentV1>;
  return {
    ...theme,
    version: THEME_DOCUMENT_VERSION,
    baseThemeId: candidate.baseThemeId ?? baseThemeId,
    createdAt: candidate.createdAt ?? now,
    updatedAt: candidate.updatedAt ?? now,
    images: candidate.images,
    vars: Object.fromEntries(THEME_TOKEN_REGISTRY.map((token) => [token.key, theme.vars?.[token.key] ?? token.defaultValue])),
  };
}

export function validateThemeDocument(document: ThemeDocumentV1): string[] {
  const errors: string[] = [];
  if (document.version !== 1) errors.push('Unsupported theme document version');
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(document.id)) errors.push('Theme ID must be 2–64 lowercase letters, numbers, or hyphens');
  if (!document.name.trim()) errors.push('Theme name is required');
  if (document.name.length > 80) errors.push('Theme name must be 80 characters or fewer');
  if (document.description.length > 500) errors.push('Description must be 500 characters or fewer');
  for (const token of THEME_TOKEN_REGISTRY) {
    const error = token.validate(document.vars?.[token.key] ?? token.defaultValue);
    if (error) errors.push(`${token.label}: ${error}`);
  }
  for (const layer of Object.values(document.images ?? {})) {
    if (!layer) continue;
    if (layer.asset.bytes > 8 * 1024 * 1024) errors.push('Theme images must be 8 MiB or smaller');
    if (layer.asset.width * layer.asset.height > 40_000_000) errors.push('Theme images may not exceed 40 megapixels');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(layer.asset.mimeType)) errors.push('Only PNG, JPEG, and WebP images are supported');
  }
  return errors;
}

export function serializeThemeDocument(document: ThemeDocumentV1, includeImages = true): string {
  const clean = structuredClone(document);
  if (!includeImages) delete clean.images;
  for (const layer of Object.values(clean.images ?? {})) {
    if (!layer) continue;
    delete layer.asset.previewUrl;
    delete layer.asset.stagedPath;
  }
  return JSON.stringify(clean, null, 2);
}
