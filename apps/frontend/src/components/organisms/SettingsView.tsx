import { useState, useEffect, type MouseEvent, type ReactNode } from 'react';
import {
  FolderPlus,
  Palette,
  RefreshCw,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  DownloadCloud,
  HardDrive,
  KeyRound,
  Sliders,
  Music,
} from 'lucide-react';
import type { LibraryRoot } from '@/services/tauri-bindings';
import { ALL_THEMES, useTheme } from '@/services/themeService';
import { MetadataJobsPanel } from './MetadataJobsPanel';
import type { AcquisitionSettings } from '@/types';
import { getAcquisitionSettings, saveAcquisitionSettings } from '@/services/acquisitionService';

type SettingsCategory = 'audio' | 'appearance' | 'library' | 'metadata' | 'online' | 'updates';

const CATEGORIES: { id: SettingsCategory; label: string; icon: typeof Sliders }[] = [
  { id: 'audio', label: 'Audio', icon: Sliders },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'library', label: 'Library', icon: HardDrive },
  { id: 'metadata', label: 'Metadata & Tags', icon: Music },
  { id: 'online', label: 'Online Presence', icon: KeyRound },
  { id: 'updates', label: 'Updates', icon: DownloadCloud },
];

interface SettingsViewProps {
  roots: LibraryRoot[];
  isScanning: boolean;
  onAddRoot: () => void;
  onRescanRoot: (rootId: string) => void;
  onSetRootEnabled: (rootId: string, enabled: boolean) => void;
  onRemoveRoot: (root: LibraryRoot) => void;
  /** Output-device controls supplied by the page that owns playback state. */
  audioSlot?: ReactNode;
  /** Last.fm and Discord integration controls. */
  onlineSlot?: ReactNode;
  /** Update checker panel. */
  updatesSlot?: ReactNode;
  children?: ReactNode;
}

export function SettingsView({
  roots,
  isScanning,
  onAddRoot,
  onRescanRoot,
  onSetRootEnabled,
  onRemoveRoot,
  audioSlot,
  onlineSlot,
  updatesSlot,
  children,
}: SettingsViewProps) {
  const { allThemes, currentTheme, setThemeById, deleteCustomTheme } = useTheme();
  const [copiedThemeId, setCopiedThemeId] = useState<string | null>(null);
  const [category, setCategory] = useState<SettingsCategory>('audio');

  const [acquisitionSettings, setAcquisitionSettings] = useState<AcquisitionSettings>({
    preferredQuality: 'hi-res-24',
    destinationFolder: null,
    namingPattern: '{Artist}/{Album}/{TrackNumber} - {Title}',
    concurrencyLimit: 2,
    deezerArl: '',
    qobuzUserAuthToken: '',
    qobuzAppId: '',
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    void getAcquisitionSettings().then((s) => {
      setAcquisitionSettings(s);
    });
  }, []);

  const handleUpdateSetting = async <K extends keyof AcquisitionSettings>(
    key: K,
    value: AcquisitionSettings[K],
  ) => {
    const updated = { ...acquisitionSettings, [key]: value };
    setAcquisitionSettings(updated);
    await saveAcquisitionSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div
      id="settings-view-container"
      className="flex w-full flex-col gap-6 py-8 animate-fadeIn font-sans text-neutral-200"
    >
      <header className="border-b border-neutral-800 pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
          Configuration
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Settings</h1>
      </header>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Category rail */}
        <nav aria-label="Settings categories" className="flex flex-col gap-1">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                aria-current={active ? 'page' : undefined}
                style={
                  active
                    ? {
                        borderColor: currentTheme.primary,
                        background: currentTheme.cardGradient || currentTheme.bgCard,
                      }
                    : undefined
                }
                className={`flex items-center gap-3 t-control border px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                  active
                    ? 'font-semibold text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={active ? { color: currentTheme.primary } : undefined}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active category */}
        <div className="flex min-w-0 flex-col gap-5">
          {category === 'library' && (
            <>
              {/* Library Roots Section */}
              <section
                aria-labelledby="library-roots-heading"
                className="t-card t-stroke border border-neutral-800 bg-neutral-950/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="library-roots-heading" className="text-sm font-semibold text-white">
                      Library folders
                    </h2>
                    <p className="mt-1 text-xs text-neutral-500">
                      Adding, rescanning, disabling, restoring, and removing folders never changes
                      your music files.
                    </p>
                  </div>
                  <button
                    id="settings-add-library-root"
                    type="button"
                    onClick={onAddRoot}
                    disabled={isScanning}
                    className="flex items-center gap-2 t-control border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-50 hover:bg-amber-500/25 transition-colors cursor-pointer"
                  >
                    {isScanning ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderPlus className="h-3.5 w-3.5" />
                    )}
                    Add folder
                  </button>
                </div>
                {roots.length ? (
                  <div className="mt-4 space-y-3">
                    {roots.map((root) => (
                      <article
                        key={root.id}
                        className="t-sm border border-neutral-800 bg-black/20 p-3"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {root.label}
                            </p>
                            <p className="mt-1 truncate font-mono text-xs text-neutral-500">
                              {root.path}
                            </p>
                            <p className="mt-2 text-xs text-neutral-400">
                              {root.trackCount.toLocaleString()} tracks · {root.availability}
                            </p>
                          </div>
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${root.availability === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                            aria-label={root.availability}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => onRescanRoot(root.id)}
                            className="text-amber-300 underline cursor-pointer"
                          >
                            Rescan
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetRootEnabled(root.id, !root.enabled)}
                            className="flex items-center gap-1 text-neutral-300 underline cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" /> {root.enabled ? 'Disable' : 'Restore'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveRoot(root)}
                            className="flex items-center gap-1 text-red-300 underline cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" /> Remove from catalog
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-400">No folders are indexed yet.</p>
                )}
              </section>

              {/* Acquisition Engine Settings Section */}
            </>
          )}

          {category === 'audio' && (
            <>
              {audioSlot}
              <section
                aria-labelledby="acquisition-settings-heading"
                className="t-card t-stroke border border-neutral-800 bg-neutral-950/50 p-5 space-y-5"
              >
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <DownloadCloud className="h-5 w-5 text-amber-400" />
                    <div>
                      <h2
                        id="acquisition-settings-heading"
                        className="text-sm font-semibold text-white"
                      >
                        Lossless Acquisition Settings
                      </h2>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        Configure lossless audio stream quality, download location, and file naming
                        format.
                      </p>
                    </div>
                  </div>
                  {savedSuccess && (
                    <span className="flex items-center gap-1 text-xs font-mono text-emerald-400 animate-fadeIn">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Preferred Quality */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-neutral-300 block">
                      Preferred Audio Quality
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateSetting('preferredQuality', 'hi-res-24')}
                        className={`p-3 t-control border text-left transition-all cursor-pointer ${
                          acquisitionSettings.preferredQuality === 'hi-res-24'
                            ? 'border-amber-500/80 bg-amber-500/10 text-white'
                            : 'border-neutral-800 bg-black/20 text-neutral-400 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold font-mono text-amber-300">
                            Hi-Res 24-bit
                          </span>
                          {acquisitionSettings.preferredQuality === 'hi-res-24' && (
                            <Check className="w-3.5 h-3.5 text-amber-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          Up to 192kHz studio master FLAC when available
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateSetting('preferredQuality', 'lossless-16')}
                        className={`p-3 t-control border text-left transition-all cursor-pointer ${
                          acquisitionSettings.preferredQuality === 'lossless-16'
                            ? 'border-amber-500/80 bg-amber-500/10 text-white'
                            : 'border-neutral-800 bg-black/20 text-neutral-400 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold font-mono text-amber-300">
                            CD Quality 16-bit
                          </span>
                          {acquisitionSettings.preferredQuality === 'lossless-16' && (
                            <Check className="w-3.5 h-3.5 text-amber-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          16-bit / 44.1kHz standard lossless FLAC
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Concurrency Limit */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-neutral-300">
                        Download Concurrency Limit
                      </label>
                      <span className="text-xs font-mono text-amber-400 font-bold">
                        {acquisitionSettings.concurrencyLimit} simultaneous
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={acquisitionSettings.concurrencyLimit}
                      onChange={(e) =>
                        handleUpdateSetting('concurrencyLimit', parseInt(e.target.value, 10))
                      }
                      className="w-full h-2 bg-neutral-800 t-sm appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[11px] text-neutral-500">
                      Limits concurrent network downloads to prevent stream throttling.
                    </p>
                  </div>
                </div>

                {/* Destination Path and Naming Pattern */}
                <div className="space-y-4 pt-2 border-t border-neutral-800/60">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300 block">
                      File Naming Template
                    </label>
                    <input
                      type="text"
                      value={acquisitionSettings.namingPattern}
                      onChange={(e) => handleUpdateSetting('namingPattern', e.target.value)}
                      placeholder="{Artist}/{Album}/{TrackNumber} - {Title}"
                      className="w-full px-3 py-2 t-sm border border-neutral-800 bg-black/30 font-mono text-xs text-neutral-200 focus:outline-hidden focus:border-amber-500/80"
                    />
                    <p className="text-[11px] text-neutral-500">
                      Supported placeholders:{' '}
                      <code className="text-amber-400 font-mono">{'{Artist}'}</code>,{' '}
                      <code className="text-amber-400 font-mono">{'{Album}'}</code>,{' '}
                      <code className="text-amber-400 font-mono">{'{TrackNumber}'}</code>,{' '}
                      <code className="text-amber-400 font-mono">{'{Title}'}</code>,{' '}
                      <code className="text-amber-400 font-mono">{'{Year}'}</code>
                    </p>
                  </div>

                  {/* Optional Provider Tokens */}
                  <div className="space-y-3 pt-2 border-t border-neutral-800/60">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-xs font-semibold text-neutral-300">
                        Optional Provider Credentials
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] text-neutral-400 block font-mono">
                          Deezer ARL Cookie Token
                        </label>
                        <input
                          type="password"
                          value={acquisitionSettings.deezerArl || ''}
                          onChange={(e) => handleUpdateSetting('deezerArl', e.target.value)}
                          placeholder="Paste ARL token for 16-bit FLAC"
                          className="w-full px-3 py-1.5 t-sm border border-neutral-800 bg-black/30 font-mono text-xs text-neutral-200 focus:outline-hidden focus:border-amber-500/80"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-neutral-400 block font-mono">
                          Qobuz User Auth Token
                        </label>
                        <input
                          type="password"
                          value={acquisitionSettings.qobuzUserAuthToken || ''}
                          onChange={(e) =>
                            handleUpdateSetting('qobuzUserAuthToken', e.target.value)
                          }
                          placeholder="Paste Qobuz user token for 24-bit FLAC"
                          className="w-full px-3 py-1.5 t-sm border border-neutral-800 bg-black/30 font-mono text-xs text-neutral-200 focus:outline-hidden focus:border-amber-500/80"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {category === 'appearance' && (
            <section
              aria-labelledby="appearance-heading"
              className="t-card t-stroke border border-neutral-800 bg-neutral-950/50 p-5"
            >
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-amber-300" />
                <div>
                  <h2 id="appearance-heading" className="text-sm font-semibold text-white">
                    Appearance
                  </h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Choose the theme used throughout Bebop.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allThemes.map((theme) => {
                  const selected = currentTheme.id === theme.id;
                  const isCustom = !ALL_THEMES.some((preset) => preset.id === theme.id);

                  const copyThemeJson = (event: MouseEvent) => {
                    event.stopPropagation();
                    void navigator.clipboard.writeText(JSON.stringify(theme, null, 2));
                    setCopiedThemeId(theme.id);
                    window.setTimeout(
                      () => setCopiedThemeId((id) => (id === theme.id ? null : id)),
                      1800,
                    );
                  };

                  const selectTheme = () => setThemeById(theme.id);

                  return (
                    <div
                      key={theme.id}
                      role="button"
                      tabIndex={0}
                      onClick={selectTheme}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectTheme();
                        }
                      }}
                      style={{
                        borderColor: selected ? theme.primary : theme.borderColor,
                        background: theme.cardGradient || theme.bgCard,
                      }}
                      className="group relative t-control border p-3 text-left transition hover:brightness-110 cursor-pointer"
                      aria-pressed={selected}
                    >
                      <div
                        className={`absolute right-2 top-2 flex items-center gap-1 transition-opacity ${
                          isCustom
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={copyThemeJson}
                          className="rounded p-1 text-neutral-400 hover:bg-black/30 hover:text-white"
                          aria-label={`Copy ${theme.name} theme JSON`}
                          title="Copy theme JSON to clipboard"
                        >
                          {copiedThemeId === theme.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteCustomTheme(theme.id);
                            }}
                            className="rounded p-1 text-red-300/80 hover:bg-black/30 hover:text-red-300"
                            aria-label={`Delete ${theme.name} theme`}
                            title="Delete custom theme"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="block text-sm font-semibold text-white">{theme.name}</span>
                      <span className="mt-1 block text-xs text-neutral-400">
                        {theme.description}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {category === 'metadata' && <MetadataJobsPanel />}

          {category === 'online' && onlineSlot}

          {category === 'updates' && updatesSlot}

          {children}
        </div>
      </div>
    </div>
  );
}
