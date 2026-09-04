import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  ImagePlus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { ThemeSpecimenCard } from '@/components/molecules/ThemeSpecimenCard';
import {
  ALL_THEMES,
  useTheme,
  type StatCardColorConfig,
  type ThemeConfig,
} from '@/services/themeService';
import {
  THEME_FALLBACK_ID,
  THEME_TOKEN_REGISTRY,
  numberRangeFor,
  parseNumberToken,
  serializeThemeDocument,
  toThemeDocument,
  type ThemeDocumentV1,
  type ThemeImageLayer,
} from '@/services/themeModel';
import { commands } from '@/services/tauri-bindings';
import { isDemoMode } from '@/demo/mode';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { createPortal } from 'react-dom';

type Section =
  | 'templates'
  | 'identity'
  | 'palette'
  | 'geometry'
  | 'typography'
  | 'ambience'
  | 'visualizer'
  | 'waveform'
  | 'stats'
  | 'images'
  | 'advanced';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'templates', label: 'Starting point' },
  { id: 'identity', label: 'Identity' },
  { id: 'palette', label: 'Palette & surfaces' },
  { id: 'geometry', label: 'Geometry & controls' },
  { id: 'typography', label: 'Typography' },
  { id: 'ambience', label: 'Texture & ambience' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'stats', label: 'Stat cards' },
  { id: 'images', label: 'Managed images' },
  { id: 'advanced', label: 'Advanced tokens' },
];
const TEMPLATE_IDS = [
  'space-cowboy-v2',
  'queen-of-hearts-v2',
  'black-dog-v2',
  'radical-prodigy-v2',
];
const STAT_KEYS = ['timeListened', 'totalTracks', 'artists', 'albums', 'duration'] as const;
const COLOR_FIELDS: { key: keyof ThemeDocumentV1; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'primaryHover', label: 'Primary hover' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accentGlow', label: 'Glow' },
  { key: 'bgCanvas', label: 'Canvas' },
  { key: 'bgCard', label: 'Card' },
  { key: 'bgSurface', label: 'Surface' },
  { key: 'borderColor', label: 'Border' },
  { key: 'textPrimary', label: 'Primary text' },
  { key: 'textSecondary', label: 'Secondary text' },
  { key: 'textMuted', label: 'Muted text' },
];

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'custom-theme'
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const Field: FC<{ label: string; children: ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => {
  return (
    <label className="theme-builder__field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
};

// Font-family tokens get a curated dropdown (pulled from what every built-in
// theme already uses for that slot) instead of a bare text box, with an
// escape hatch to type an arbitrary stack.
const FONT_TOKEN_KEYS = new Set(['--f-d', '--f-b', '--f-m', '--f-h', '--f-q', '--f-stamp']);
const CUSTOM_OPTION_VALUE = '__custom__';
// Computed lazily (not at module scope) so importing this file never depends
// on ALL_THEMES being populated — it's only needed once someone actually
// opens the typography section of an open Theme Builder.
let curatedFontsByKey: ReadonlyMap<string, readonly string[]> | null = null;
function curatedFontsFor(key: string): readonly string[] {
  if (!curatedFontsByKey) {
    curatedFontsByKey = new Map(
      Array.from(FONT_TOKEN_KEYS, (fontKey) => {
        const values = new Set<string>();
        for (const theme of ALL_THEMES) {
          const value = theme.vars?.[fontKey];
          if (value) values.add(value);
        }
        return [fontKey, Array.from(values).sort()] as const;
      }),
    );
  }
  return curatedFontsByKey.get(key) ?? [];
}

// Every other free-form CSS token — clip-path cuts, corner treatments, hover
// motion, texture tiling, gradients, shadows — is exactly the kind of raw-CSS
// field a "by default, more buttons/dropdowns" editor shouldn't hand someone
// a bare text box for. Same curated-dropdown treatment as fonts above: offer
// what every built-in theme already uses for that slot, labeled by the theme
// that uses it, with a "Custom…" escape hatch (i.e. the advanced/raw-CSS
// path, still one click away) for anything else. Computed lazily per key
// (rather than for a fixed key list) since it now covers every text/gradient/
// shadow token in the registry, not just a handful.
const curatedCssByKey = new Map<string, readonly { value: string; label: string }[]>();
/** `cacheKey` just needs to be unique per distinct `getValue` — for a `vars`
 * token that's the token key itself; for a top-level field (e.g.
 * `bgCanvasGradient`, which isn't in `vars` at all) it's the field name. */
function curatedValuesFor(
  cacheKey: string,
  getValue: (theme: ThemeConfig) => string | undefined,
): readonly { value: string; label: string }[] {
  let cached = curatedCssByKey.get(cacheKey);
  if (!cached) {
    const byValue = new Map<string, string[]>();
    for (const theme of ALL_THEMES) {
      const value = getValue(theme);
      if (!value) continue;
      const names = byValue.get(value) ?? [];
      names.push(theme.name);
      byValue.set(value, names);
    }
    cached = Array.from(byValue, ([value, names]) => ({ value, label: names.join(' / ') }));
    curatedCssByKey.set(cacheKey, cached);
  }
  return cached;
}
function curatedCssFor(key: string): readonly { value: string; label: string }[] {
  return curatedValuesFor(key, (theme) => theme.vars?.[key]);
}

/** The curated-dropdown-plus-"Custom…"-escape-hatch control shared by every
 * free-form CSS field (registry tokens via TokenInput, and the two top-level
 * gradient fields in the palette section which aren't registry tokens). */
const CuratedField: FC<{
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  preview?: ReactNode;
}> = ({ value, onChange, options, placeholder, preview }) => {
  const isCustom = !options.some((option) => option.value === value);
  return (
    <div className="theme-builder__curated-field">
      <select
        value={isCustom ? CUSTOM_OPTION_VALUE : value}
        onChange={(event) => {
          if (event.target.value !== CUSTOM_OPTION_VALUE) onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={CUSTOM_OPTION_VALUE}>Custom…</option>
      </select>
      {isCustom && (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
      {preview}
    </div>
  );
};

/** A live, at-a-glance rendering of what a token's current value actually
 * looks like — the "Live specimen" card in the aside shows the aggregate
 * result, but a single ambience/geometry token's effect there can be subtle
 * enough to miss entirely. */
function TokenPreview({
  tokenKey,
  value,
  controlType,
}: {
  tokenKey?: string;
  value: string;
  controlType?: string;
}) {
  if (controlType === 'gradient') {
    return <div className="theme-builder__preview-swatch" style={{ background: value }} />;
  }
  if (controlType === 'shadow') {
    return (
      <div
        className="theme-builder__preview-swatch theme-builder__preview-swatch--shadow"
        style={{ boxShadow: value === 'none' ? 'none' : value }}
      />
    );
  }
  if (!tokenKey) return null;
  if (tokenKey === '--clip' || tokenKey === '--clip-btn') {
    return (
      <div
        className="theme-builder__preview-swatch theme-builder__preview-swatch--clip"
        style={{ clipPath: value === 'none' ? undefined : value }}
      />
    );
  }
  if (tokenKey === '--corner') {
    return (
      <div
        className="theme-builder__preview-swatch"
        style={{ background: value === 'none' ? undefined : value }}
      />
    );
  }
  if (tokenKey === '--tex-size') {
    return (
      <div
        className="theme-builder__preview-swatch theme-builder__preview-swatch--tex"
        style={{ backgroundSize: value }}
      />
    );
  }
  if (tokenKey.startsWith('--fs-')) {
    return (
      <span className="theme-builder__preview-text" style={{ fontSize: value }}>
        Ag
      </span>
    );
  }
  if (tokenKey.startsWith('--ls-')) {
    return (
      <span className="theme-builder__preview-text" style={{ letterSpacing: value }}>
        ABC
      </span>
    );
  }
  if (['--r', '--r-sm', '--btn-r', '--rule-r', '--bar-r'].includes(tokenKey)) {
    return <div className="theme-builder__preview-swatch" style={{ borderRadius: value }} />;
  }
  if (tokenKey === '--stamp-rot') {
    return (
      <div
        className="theme-builder__preview-swatch theme-builder__preview-swatch--chip"
        style={{ transform: `rotate(${value})` }}
      />
    );
  }
  if (tokenKey.startsWith('--op-') || tokenKey.endsWith('-op')) {
    return <div className="theme-builder__preview-swatch" style={{ opacity: value }} />;
  }
  if (['--bar-w', '--bar-gap', '--bar-cap-h', '--sw'].includes(tokenKey)) {
    return (
      <div
        className="theme-builder__preview-swatch theme-builder__preview-swatch--bar"
        style={{ width: value }}
      />
    );
  }
  return null;
}

function TokenInput({
  value,
  onChange,
  type = 'text',
  options,
  tokenKey,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  options?: readonly string[];
  tokenKey?: string;
}) {
  if (type === 'text' && tokenKey && FONT_TOKEN_KEYS.has(tokenKey)) {
    const curated = curatedFontsFor(tokenKey);
    const isCustom = !curated.includes(value);
    return (
      <div className="theme-builder__curated-field">
        <select
          value={isCustom ? CUSTOM_OPTION_VALUE : value}
          onChange={(event) => {
            if (event.target.value !== CUSTOM_OPTION_VALUE) onChange(event.target.value);
          }}
        >
          {curated.map((font) => (
            <option key={font} value={font}>
              {font.split(',')[0].replace(/^['"]|['"]$/g, '')}
            </option>
          ))}
          <option value={CUSTOM_OPTION_VALUE}>Custom…</option>
        </select>
        {isCustom && (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Custom font stack"
          />
        )}
        <span className="theme-builder__preview-text" style={{ fontFamily: value }}>
          The quick fox
        </span>
      </div>
    );
  }
  if ((type === 'text' || type === 'gradient' || type === 'shadow') && tokenKey) {
    return (
      <CuratedField
        value={value}
        onChange={onChange}
        options={curatedCssFor(tokenKey)}
        placeholder="Custom CSS value"
        preview={<TokenPreview tokenKey={tokenKey} value={value} controlType={type} />}
      />
    );
  }
  if (options)
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  if (type === 'color') {
    const safeColor = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
    return (
      <div className="theme-builder__color">
        <input type="color" value={safeColor} onChange={(event) => onChange(event.target.value)} />
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    );
  }
  if (type === 'number' && tokenKey) {
    const range = numberRangeFor(tokenKey);
    const numeric = parseNumberToken(value || `${range.min}${range.unit}`);
    const commit = (next: number) => onChange(`${next}${range.unit}`);
    return (
      <div className="theme-builder__number">
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={Math.min(range.max, Math.max(range.min, numeric))}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <input
          type="number"
          step={range.step}
          value={numeric}
          onChange={(event) => commit(Number(event.target.value))}
          className="theme-builder__number-input"
          aria-label="Exact value"
          title="Type an exact value — the slider's range is just a sane default, this isn't capped to it"
        />
        {range.unit && <span className="theme-builder__number-unit">{range.unit}</span>}
        <TokenPreview tokenKey={tokenKey} value={value} />
      </div>
    );
  }
  return <input value={value} onChange={(event) => onChange(event.target.value)} />;
}

export function ThemeBuilder() {
  const theme = useTheme();
  const [section, setSection] = useState<Section>('templates');
  const [history, setHistory] = useState<ThemeDocumentV1[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [baseline, setBaseline] = useState<ThemeDocumentV1 | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stagingKeyRef = useRef(`theme-draft-${Date.now().toString(36)}`);
  const draft = history[historyIndex] ?? null;
  const dirty = !!draft && !!baseline && JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!theme.isThemeModalOpen) return;
    const initial = theme.beginThemePreview(theme.activeTheme);
    setHistory([initial]);
    setHistoryIndex(0);
    setBaseline(clone(initial));
    setErrors([]);
    setSection('templates');
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    // Opening is the lifecycle boundary; activeTheme changes are intentionally ignored here.
  }, [theme.isThemeModalOpen]);

  const update = (key: string, mutate: (next: ThemeDocumentV1) => void) => {
    if (!draft) return;
    const next = clone(draft);
    mutate(next);
    next.updatedAt = new Date().toISOString();
    setHistory((current) => {
      if (historyKey === key && historyIndex > 0) {
        const replaced = current.slice(0, historyIndex + 1);
        replaced[historyIndex] = next;
        return replaced;
      }
      const appended = [...current.slice(0, historyIndex + 1), next];
      setHistoryIndex(appended.length - 1);
      return appended;
    });
    setHistoryKey(key);
    theme.updateThemePreview(next);
    setErrors([]);
  };

  const travel = (index: number) => {
    const next = history[index];
    if (!next) return;
    setHistoryIndex(index);
    setHistoryKey(null);
    theme.updateThemePreview(next);
  };

  const chooseTemplate = (source: ThemeConfig, blank = false) => {
    let next = toThemeDocument(source, blank ? undefined : source.id);
    next = {
      ...next,
      id: `custom-${blank ? 'blank' : source.id}-${Date.now().toString(36)}`,
      name: blank ? 'Untitled Theme' : `${source.name} Remix`,
      description: blank ? 'A custom Bebop theme.' : source.description,
    };
    setHistory([next]);
    setHistoryIndex(0);
    setBaseline(clone(next));
    setHistoryKey(null);
    theme.updateThemePreview(next);
    setSection('identity');
  };

  const close = (force = false) => {
    if (!force && dirty && !window.confirm('Discard your unsaved theme changes?')) return;
    if (!isDemoMode) void commands.cancelThemeAssetStaging(stagingKeyRef.current);
    theme.cancelThemePreview();
    theme.setIsThemeModalOpen(false);
  };

  const save = async () => {
    if (
      !isDemoMode &&
      [draft.images?.background, draft.images?.overlay].some((layer) => layer?.asset.stagedPath)
    ) {
      const promotion = await commands.promoteThemeAssets(
        stagingKeyRef.current,
        draft.id,
        !theme.isBuiltInTheme(draft.id),
      );
      if (promotion.status === 'error') {
        setErrors([promotion.error.message]);
        return;
      }
    }
    const result = theme.saveThemePreview();
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    theme.setIsThemeModalOpen(false);
  };

  const chooseNativeImage = async (slot: 'background' | 'overlay') => {
    const source = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Theme images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (typeof source !== 'string') return;
    const result = await commands.stageThemeAsset(stagingKeyRef.current, source);
    if (result.status === 'error') {
      setErrors([result.error.message]);
      return;
    }
    const asset = result.data;
    update(`image-${slot}`, (next) => {
      next.images = {
        ...next.images,
        [slot]: {
          asset: {
            path: asset.path,
            mimeType: asset.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
            width: asset.width,
            height: asset.height,
            bytes: asset.bytes,
            stagedPath: asset.stagedPath ?? undefined,
            previewUrl: asset.stagedPath ? convertFileSrc(asset.stagedPath) : undefined,
          },
          fit: 'cover',
          position: 'center',
          repeat: 'no-repeat',
          opacity: 1,
          blendMode: 'normal',
          blur: 0,
        },
      };
    });
  };

  const importBundle = async () => {
    const source = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Bebop theme bundle', extensions: ['bebop-theme'] }],
    });
    if (typeof source !== 'string') return;
    const result = await commands.importThemeBundle(source);
    if (result.status === 'error') {
      setErrors([result.error.message]);
      return;
    }
    if (theme.allThemes.some((candidate) => candidate.id === result.data.themeId)) {
      setErrors(['A theme with this ID already exists. Rename or delete it before importing.']);
      void commands.cancelThemeAssetStaging(result.data.stagingKey);
      return;
    }
    try {
      const next = toThemeDocument(JSON.parse(result.data.manifestJson) as ThemeConfig);
      stagingKeyRef.current = result.data.stagingKey;
      for (const layer of Object.values(next.images ?? {})) {
        if (!layer) continue;
        const imported = result.data.assets.find((asset) => asset.path === layer.asset.path);
        if (!imported?.stagedPath) throw new Error(`Missing bundle asset: ${layer.asset.path}`);
        layer.asset.stagedPath = imported.stagedPath;
        layer.asset.previewUrl = convertFileSrc(imported.stagedPath);
      }
      setHistory([next]);
      setHistoryIndex(0);
      setBaseline(clone(next));
      theme.updateThemePreview(next);
      setSection('identity');
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Invalid theme manifest']);
      void commands.cancelThemeAssetStaging(result.data.stagingKey);
    }
  };

  const exportBundle = async () => {
    const destination = await saveDialog({
      defaultPath: `${draft.id}.bebop-theme`,
      filters: [{ name: 'Bebop theme bundle', extensions: ['bebop-theme'] }],
    });
    if (!destination) return;
    const result = await commands.exportThemeBundle(
      draft.id,
      serializeThemeDocument(draft),
      destination,
    );
    if (result.status === 'error') setErrors([result.error.message]);
  };

  useEffect(() => {
    if (!theme.isThemeModalOpen) return;
    const appRoot = document.getElementById('root');
    if (appRoot) appRoot.inert = true;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const focusable = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ];
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        travel(event.shiftKey ? historyIndex + 1 : historyIndex - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (appRoot) appRoot.inert = false;
    };
  });

  const readImage = (slot: 'background' | 'overlay', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrors(['Only PNG, JPEG, and WebP images are supported.']);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrors(['Theme images must be 8 MiB or smaller.']);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      if (image.naturalWidth * image.naturalHeight > 40_000_000) {
        URL.revokeObjectURL(url);
        setErrors(['Theme images may not exceed 40 megapixels.']);
        return;
      }
      update(`image-${slot}`, (next) => {
        const layer: ThemeImageLayer = {
          asset: {
            path: file.name,
            mimeType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
            width: image.naturalWidth,
            height: image.naturalHeight,
            bytes: file.size,
            previewUrl: url,
          },
          fit: 'cover',
          position: 'center',
          repeat: 'no-repeat',
          opacity: 1,
          blendMode: 'normal',
          blur: 0,
        };
        next.images = { ...next.images, [slot]: layer };
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setErrors(['The selected image is malformed or unreadable.']);
    };
    image.src = url;
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText) as ThemeConfig;
      const next = toThemeDocument(parsed, parsed.id);
      if (theme.allThemes.some((candidate) => candidate.id === next.id))
        next.id = `${slugify(next.id)}-import-${Date.now().toString(36)}`;
      setHistory([next]);
      setHistoryIndex(0);
      setBaseline(clone(next));
      theme.updateThemePreview(next);
      setShowImport(false);
      setErrors([]);
      setSection('identity');
    } catch {
      setErrors(['That is not a valid Bebop theme JSON document.']);
    }
  };

  const advancedTokens = useMemo(
    () =>
      THEME_TOKEN_REGISTRY.filter((token) =>
        `${token.key} ${token.label} ${token.section}`.includes(search.toLowerCase()),
      ),
    [search],
  );
  if (!theme.isThemeModalOpen || !draft) return null;

  const setCore = (key: keyof ThemeDocumentV1, value: string | boolean) =>
    update(`core-${String(key)}`, (next) => {
      (next as unknown as Record<string, unknown>)[key] = value;
    });
  const setVar = (key: string, value: string) =>
    update(`token-${key}`, (next) => {
      next.vars = { ...next.vars, [key]: value };
    });

  return createPortal(
    <div
      className="theme-builder"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-builder-title"
      ref={dialogRef}
      tabIndex={-1}
    >
      <header className="theme-builder__toolbar">
        <button type="button" onClick={() => close()}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <h1 id="theme-builder-title">Theme Builder</h1>
          <span className={dirty ? 'is-dirty' : ''}>
            {dirty ? 'Unsaved changes' : 'Draft matches saved state'}
          </span>
        </div>
        <div className="theme-builder__toolbar-actions">
          <button
            type="button"
            disabled={historyIndex <= 0}
            onClick={() => travel(historyIndex - 1)}
          >
            <Undo2 size={16} /> Undo
          </button>
          <button
            type="button"
            disabled={historyIndex >= history.length - 1}
            onClick={() => travel(historyIndex + 1)}
          >
            <Redo2 size={16} /> Redo
          </button>
          <button
            type="button"
            disabled={!baseline}
            onClick={() => {
              if (baseline) {
                setHistory([clone(baseline)]);
                setHistoryIndex(0);
                theme.updateThemePreview(clone(baseline));
              }
            }}
          >
            <RotateCcw size={16} /> Reset
          </button>
          <button type="button" onClick={() => close()}>
            <X size={16} /> Cancel
          </button>
          <button type="button" className="is-primary" onClick={save}>
            <Save size={16} /> Save
          </button>
        </div>
      </header>
      <div className="theme-builder__layout">
        <nav aria-label="Theme sections">
          {SECTIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? 'active' : ''}
              onClick={() => setSection(item.id)}
            >
              {item.label}
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        <main>
          {errors.length > 0 && (
            <div className="theme-builder__errors" role="alert">
              <strong>Please fix the following:</strong>
              {errors.map((error) => (
                <span key={error}>{error}</span>
              ))}
            </div>
          )}
          {section === 'templates' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Choose a starting point</h2>
                  <p>Built-ins stay immutable. Choosing one creates an editable custom fork.</p>
                </div>
                <div className="theme-builder__section-actions">
                  <button type="button" onClick={() => setShowImport(!showImport)}>
                    <Upload size={15} /> Import JSON
                  </button>
                  {!isDemoMode && (
                    <button type="button" onClick={() => void importBundle()}>
                      <Upload size={15} /> Import bundle
                    </button>
                  )}
                </div>
              </div>
              {showImport && (
                <div className="theme-builder__import">
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder="Paste ThemeDocumentV1 JSON"
                  />
                  <button type="button" onClick={importJson}>
                    Preview import
                  </button>
                </div>
              )}
              <div className="theme-builder__templates">
                <button
                  className="theme-builder__blank"
                  type="button"
                  onClick={() =>
                    chooseTemplate(
                      ALL_THEMES.find((item) => item.id === THEME_FALLBACK_ID)!,
                      true,
                    )
                  }
                >
                  <Sparkles />
                  <strong>Blank Theme</strong>
                  <span>Neutral structure with every supported token</span>
                </button>
                {TEMPLATE_IDS.map((id) => {
                  const preset = ALL_THEMES.find((item) => item.id === id)!;
                  return (
                    <ThemeSpecimenCard
                      key={id}
                      theme={preset}
                      compact
                      onClick={() => chooseTemplate(preset)}
                    />
                  );
                })}
              </div>
            </>
          )}
          {section === 'identity' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Identity & description</h2>
                  <p>Name the theme and document its visual intent.</p>
                </div>
              </div>
              <div className="theme-builder__form">
                <Field label="Theme name">
                  <input
                    value={draft.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      update('identity-name', (next) => {
                        next.name = name;
                        if (next.id.startsWith('custom-blank-'))
                          next.id = `custom-${slugify(name)}`;
                      });
                    }}
                  />
                </Field>
                <Field label="Theme ID" hint="Stable lowercase identifier">
                  <input
                    value={draft.id}
                    onChange={(event) => setCore('id', slugify(event.target.value))}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={draft.description}
                    onChange={(event) => setCore('description', event.target.value)}
                  />
                </Field>
                <Field label="Tag">
                  <input
                    value={draft.tag ?? ''}
                    onChange={(event) => setCore('tag', event.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
          {section === 'palette' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Palette, text & surfaces</h2>
                  <p>Core colors update the entire application immediately.</p>
                </div>
              </div>
              <div className="theme-builder__form theme-builder__form--colors">
                {COLOR_FIELDS.map(({ key, label }) => (
                  <Field key={String(key)} label={label}>
                    <TokenInput
                      type="color"
                      value={String(draft[key] ?? '')}
                      onChange={(value) => setCore(key, value)}
                    />
                  </Field>
                ))}
              </div>
              <div className="theme-builder__form">
                <Field label="Canvas gradient">
                  <CuratedField
                    value={draft.bgCanvasGradient}
                    onChange={(value) => setCore('bgCanvasGradient', value)}
                    options={curatedValuesFor('core:bgCanvasGradient', (t) => t.bgCanvasGradient)}
                    placeholder="Custom CSS gradient"
                    preview={<TokenPreview value={draft.bgCanvasGradient} controlType="gradient" />}
                  />
                </Field>
                <Field label="Card gradient">
                  <CuratedField
                    value={draft.cardGradient}
                    onChange={(value) => setCore('cardGradient', value)}
                    options={curatedValuesFor('core:cardGradient', (t) => t.cardGradient)}
                    placeholder="Custom CSS gradient"
                    preview={<TokenPreview value={draft.cardGradient} controlType="gradient" />}
                  />
                </Field>
              </div>
            </>
          )}
          {section === 'geometry' && (
            <TokenSection
              title="Borders, radii & controls"
              description="Shape cards, buttons, clipping, cursor, bevels and hover movement."
              keys={[
                '--r',
                '--r-sm',
                '--btn-r',
                '--rule-r',
                '--sw',
                '--cap',
                '--clip',
                '--clip-btn',
                '--corner',
                '--corner-shadow',
                '--cursor',
                '--hover-t',
              ]}
              draft={draft}
              setVar={setVar}
            />
          )}
          {section === 'typography' && (
            <TokenSection
              title="Typography"
              description="Display, body, heading, quote, stamp, and monospace families."
              keys={[
                '--f-d',
                '--f-b',
                '--f-m',
                '--f-h',
                '--f-q',
                '--f-stamp',
                '--w-d',
                '--ls-d',
                '--ls-h',
                '--tt-l',
                '--tt-title',
                '--fs-hero',
                '--fs-card',
                '--fs-stat',
              ]}
              draft={draft}
              setVar={setVar}
            />
          )}
          {section === 'ambience' && (
            <TokenSection
              title="Texture, ambience & motion"
              description="Pattern density plus supported stars, smoke, ship, scanlines, glitch, ribbons, stamps and pips."
              keys={[
                '--tex',
                '--tex-size',
                '--tex-op',
                '--orb-g',
                '--orb-dur',
                '--op-stars',
                '--op-smoke',
                '--op-ship',
                '--op-ascent',
                '--ascent-col',
                '--ascent-dur',
                '--op-scan',
                '--op-glitch',
                '--op-scrawl',
                '--op-stamp',
                '--op-pip',
                '--trans',
              ]}
              draft={draft}
              setVar={setVar}
            />
          )}
          {section === 'visualizer' && (
            <TokenSection
              title="Visualizer geometry"
              description="Bar fill, size, spacing, caps, rounding and glow."
              keys={[
                '--bar-bg',
                '--bar-w',
                '--bar-gap',
                '--bar-r',
                '--bar-cap',
                '--bar-cap-h',
                '--viz-glow',
              ]}
              draft={draft}
              setVar={setVar}
            />
          )}
          {section === 'waveform' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Waveform styling</h2>
                  <p>Played and unplayed gradients with optional glow.</p>
                </div>
              </div>
              <div className="theme-builder__form theme-builder__form--colors">
                {(
                  [
                    'waveformPlayedTop',
                    'waveformPlayedBot',
                    'waveformUnplayedTop',
                    'waveformUnplayedBot',
                  ] as const
                ).map((key) => (
                  <Field key={key} label={key.replace('waveform', '').replace(/([A-Z])/g, ' $1')}>
                    <TokenInput
                      type="color"
                      value={draft[key]}
                      onChange={(value) => setCore(key, value)}
                    />
                  </Field>
                ))}
                <Field label="Glow">
                  <input
                    type="checkbox"
                    checked={draft.waveformGlow}
                    onChange={(event) => setCore('waveformGlow', event.target.checked)}
                  />
                </Field>
              </div>
            </>
          )}
          {section === 'stats' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Five stat-card mappings</h2>
                  <p>Give every metric its own accent and badge hierarchy.</p>
                </div>
              </div>
              <div className="theme-builder__stats">
                {STAT_KEYS.map((key) => (
                  <div key={key}>
                    <h3>{key.replace(/([A-Z])/g, ' $1')}</h3>
                    {(
                      [
                        'borderTop',
                        'badgeBg',
                        'badgeText',
                        'glow',
                        'accentBar',
                      ] as (keyof StatCardColorConfig)[]
                    ).map((field) => (
                      <Field key={field} label={field.replace(/([A-Z])/g, ' $1')}>
                        <TokenInput
                          type="color"
                          value={draft.statsColors[key][field]}
                          onChange={(value) =>
                            update(`stat-${key}-${field}`, (next) => {
                              next.statsColors[key][field] = value;
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          {section === 'images' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Background & overlay images</h2>
                  <p>PNG, JPEG or WebP · 8 MiB each · 40 megapixels maximum.</p>
                </div>
              </div>
              <div className="theme-builder__images">
                {(['background', 'overlay'] as const).map((slot) => {
                  const layer = draft.images?.[slot];
                  return (
                    <div key={slot}>
                      <h3>{slot === 'background' ? 'Background image' : 'Texture / overlay'}</h3>
                      {layer?.asset.previewUrl ? (
                        <img src={layer.asset.previewUrl} alt={`${slot} preview`} />
                      ) : (
                        <div className="theme-builder__image-empty">
                          <ImagePlus />
                          <span>No image selected</span>
                        </div>
                      )}
                      {isDemoMode ? (
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => readImage(slot, event)}
                        />
                      ) : (
                        <button type="button" onClick={() => void chooseNativeImage(slot)}>
                          <ImagePlus size={14} /> Choose image
                        </button>
                      )}
                      {layer && (
                        <>
                          <div className="theme-builder__form">
                            <Field label="Fit">
                              <select
                                value={layer.fit}
                                onChange={(event) =>
                                  update(`image-${slot}-fit`, (next) => {
                                    next.images![slot]!.fit = event.target
                                      .value as ThemeImageLayer['fit'];
                                  })
                                }
                              >
                                {['cover', 'contain', 'fill', 'none'].map((value) => (
                                  <option key={value}>{value}</option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Position">
                              <input
                                value={layer.position}
                                onChange={(event) =>
                                  update(`image-${slot}-position`, (next) => {
                                    next.images![slot]!.position = event.target.value;
                                  })
                                }
                              />
                            </Field>
                            <Field label="Opacity">
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={layer.opacity}
                                onChange={(event) =>
                                  update(`image-${slot}-opacity`, (next) => {
                                    next.images![slot]!.opacity = Number(event.target.value);
                                  })
                                }
                              />
                            </Field>
                            <Field label="Blur">
                              <input
                                type="range"
                                min="0"
                                max="40"
                                value={layer.blur}
                                onChange={(event) =>
                                  update(`image-${slot}-blur`, (next) => {
                                    next.images![slot]!.blur = Number(event.target.value);
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              update(`image-${slot}-remove`, (next) => {
                                if (next.images) delete next.images[slot];
                              })
                            }
                          >
                            <Trash2 size={14} /> Remove image
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {section === 'advanced' && (
            <>
              <div className="theme-builder__section-title">
                <div>
                  <h2>Advanced tokens</h2>
                  <p>
                    Search and edit every supported V2 token. Arbitrary CSS is intentionally
                    excluded.
                  </p>
                </div>
                <label className="theme-builder__search">
                  <Search size={14} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search ${THEME_TOKEN_REGISTRY.length} tokens`}
                  />
                </label>
              </div>
              <div className="theme-builder__token-table">
                {advancedTokens.map((token) => (
                  <div key={token.key}>
                    <code>{token.key}</code>
                    <span>{token.section}</span>
                    <TokenInput
                      value={draft.vars?.[token.key] ?? token.defaultValue}
                      type={token.control}
                      options={token.options}
                      tokenKey={token.key}
                      onChange={(value) => setVar(token.key, value)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
        <aside>
          <div className="theme-builder__sticky">
            <p className="theme-builder__preview-label">Live specimen · app-wide preview</p>
            <ThemeSpecimenCard theme={draft} />
            <div className="theme-builder__share">
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(serializeThemeDocument(draft, !draft.images))
                }
              >
                <Clipboard size={14} />{' '}
                {draft.images ? 'Copy settings without images' : 'Copy JSON'}
              </button>
              {draft.images && !isDemoMode ? (
                <button type="button" onClick={() => void exportBundle()}>
                  <Copy size={14} /> Export bundle
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(serializeThemeDocument(draft))}
                >
                  <Copy size={14} /> Share settings
                </button>
              )}
            </div>
            {draft.images && (
              <small>Image-backed themes should be shared as a .bebop-theme bundle.</small>
            )}
            <GalleryPreview draft={draft} />
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

// Real component instances, styled from the live draft, so changes read as
// "this is what your app will look like" rather than a swatch abstraction —
// and the primary button doubles as the live preview for --hover-t/--trans,
// which are motion (only visible on interaction) and so can't get a static
// TokenPreview swatch like the other tokens.
const GalleryPreview: FC<{ draft: ThemeDocumentV1 }> = ({ draft }) => {
  const [hovering, setHovering] = useState(false);
  return (
    <div className="theme-builder__gallery">
      <h3>Component gallery</h3>
      <button
        type="button"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          background: draft.primary,
          color: draft.vars?.['--c-on-p'] ?? '#000',
          borderRadius: draft.vars?.['--btn-r'],
          transition: `transform ${draft.vars?.['--trans'] ?? '200ms ease'}`,
          transform: hovering ? (draft.vars?.['--hover-t'] ?? 'none') : 'none',
        }}
      >
        Primary action
      </button>
      <input placeholder="Search your library" />
      <span>Hi-res · 24-bit / 96 kHz</span>
      <small className="theme-builder__gallery-hint">Hover the button to preview its motion</small>
    </div>
  );
};

const TokenSection: FC<{
  title: string;
  description: string;
  keys: string[];
  draft: ThemeDocumentV1;
  setVar: (key: string, value: string) => void;
}> = ({ title, description, keys, draft, setVar }) => {
  return (
    <>
      <div className="theme-builder__section-title">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="theme-builder__form">
        {keys.map((key) => {
          const token = THEME_TOKEN_REGISTRY.find((item) => item.key === key)!;
          return (
            <Field key={key} label={token.label}>
              <TokenInput
                value={draft.vars?.[key] ?? token.defaultValue}
                type={token.control}
                options={token.options}
                tokenKey={token.key}
                onChange={(value) => setVar(key, value)}
              />
            </Field>
          );
        })}
      </div>
    </>
  );
};
