import React, { useState } from 'react';
import {
  X,
  Palette,
  Check,
  Plus,
  Sparkles,
  Copy,
  Upload,
  Trash2,
  Sliders,
  Quote,
  Flame,
  Radio,
} from 'lucide-react';
import { useTheme, THEME_PRESETS, ThemeConfig } from '@/services/themeService';

export const ThemeSelectorModal: React.FC = () => {
  const {
    currentTheme,
    allThemes,
    setThemeById,
    saveCustomTheme,
    deleteCustomTheme,
    isThemeModalOpen,
    setIsThemeModalOpen,
  } = useTheme();

  const [activeCategory, setActiveCategory] = useState<'all' | 'bebop' | 'studio'>('all');
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);

  // Custom theme editor state
  const [customForm, setCustomForm] = useState<ThemeConfig>({
    id: `custom-${Date.now()}`,
    name: 'My Custom Theme',
    description: 'Custom user defined color scheme',
    isDark: true,
    primary: '#38bdf8',
    primaryHover: '#7dd3fc',
    secondary: '#eab308',
    accentGlow: 'rgba(56, 189, 248, 0.4)',
    bgCanvas: '#06080d',
    bgCard: '#0d121c',
    bgSurface: '#121824',
    borderColor: '#1e293b',
    textPrimary: '#ffffff',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
    fontVibe: 'modern-clean',
    cardRadius: 'rounded-xl',
    badgeRadius: 'rounded-full',
    statsColors: {
      timeListened: {
        borderTop: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.15)',
        badgeText: '#7dd3fc',
        glow: 'rgba(56, 189, 248, 0.35)',
        accentBar: '#38bdf8',
      },
      totalTracks: {
        borderTop: '#eab308',
        badgeBg: 'rgba(234, 179, 8, 0.15)',
        badgeText: '#fde047',
        glow: 'rgba(234, 179, 8, 0.35)',
        accentBar: '#eab308',
      },
      artists: {
        borderTop: '#818cf8',
        badgeBg: 'rgba(129, 140, 248, 0.15)',
        badgeText: '#a5b4fc',
        glow: 'rgba(129, 140, 248, 0.35)',
        accentBar: '#818cf8',
      },
      albums: {
        borderTop: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeText: '#fca5a5',
        glow: 'rgba(239, 68, 68, 0.35)',
        accentBar: '#ef4444',
      },
      duration: {
        borderTop: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeText: '#6ee7b7',
        glow: 'rgba(16, 185, 129, 0.35)',
        accentBar: '#10b981',
      },
    },
    visualizerPrimary: '#38bdf8',
    visualizerSecondary: '#eab308',
    waveformPlayedTop: '#38bdf8',
    waveformPlayedBot: '#0284c7',
    waveformUnplayedTop: '#475569',
    waveformUnplayedBot: '#334155',
    waveformGlow: true,
  });

  if (!isThemeModalOpen) return null;

  const handleStartCustom = () => {
    setCustomForm({
      ...currentTheme,
      id: `custom-${Date.now()}`,
      name: `${currentTheme.name} (Custom)`,
      description: 'Personalized theme tuning',
    });
    setIsCreatingCustom(true);
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    saveCustomTheme(customForm);
    setIsCreatingCustom(false);
  };

  const handleExportTheme = () => {
    const json = JSON.stringify(currentTheme, null, 2);
    navigator.clipboard.writeText(json);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (parsed.primary && parsed.name) {
        parsed.id = parsed.id || `imported-${Date.now()}`;
        saveCustomTheme(parsed);
        setShowImportBox(false);
        setImportJsonText('');
      } else {
        alert('Invalid theme format. Missing required fields like primary and name.');
      }
    } catch {
      alert('Could not parse JSON. Please check formatting.');
    }
  };

  const bebopThemes = allThemes.filter((t) =>
    ['space-cowboy', 'queen-of-hearts', 'radical-prodigy', 'black-dog'].includes(t.id),
  );

  const displayedThemes =
    activeCategory === 'bebop'
      ? bebopThemes
      : activeCategory === 'studio'
        ? allThemes.filter((t) => !bebopThemes.some((bt) => bt.id === t.id))
        : allThemes;

  return (
    <div
      id="theme-selector-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsThemeModalOpen(false);
      }}
    >
      <div
        id="theme-selector-modal-panel"
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
        }}
        className="w-full max-w-3xl border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            backgroundColor: currentTheme.bgSurface,
            borderColor: currentTheme.borderColor,
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                borderColor: `${currentTheme.primary}50`,
                color: currentTheme.primary,
              }}
            >
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                <span>Theme Studio & Visual Styling</span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border"
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    color: currentTheme.primary,
                    borderColor: `${currentTheme.primary}60`,
                  }}
                >
                  {currentTheme.name}
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Transform player physics, waveform aesthetics, stat card colors, and atmospheric
                styling
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportTheme}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-xs font-mono text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy current theme JSON to clipboard"
            >
              {copiedNotification ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsThemeModalOpen(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        {!isCreatingCustom && (
          <div
            className="flex items-center justify-between px-6 py-2.5 border-b"
            style={{
              backgroundColor: currentTheme.bgCanvas,
              borderColor: currentTheme.borderColor,
            }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                style={{
                  backgroundColor:
                    activeCategory === 'all' ? `${currentTheme.primary}25` : 'transparent',
                  color: activeCategory === 'all' ? currentTheme.primary : currentTheme.textMuted,
                  borderColor:
                    activeCategory === 'all' ? `${currentTheme.primary}60` : 'transparent',
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
              >
                All Themes ({allThemes.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('bebop')}
                style={{
                  backgroundColor:
                    activeCategory === 'bebop' ? `${currentTheme.primary}25` : 'transparent',
                  color: activeCategory === 'bebop' ? currentTheme.primary : currentTheme.textMuted,
                  borderColor:
                    activeCategory === 'bebop' ? `${currentTheme.primary}60` : 'transparent',
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Flame className="w-3 h-3 text-rose-400" />
                <span>Bebop Crew Edition (4)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('studio')}
                style={{
                  backgroundColor:
                    activeCategory === 'studio' ? `${currentTheme.primary}25` : 'transparent',
                  color:
                    activeCategory === 'studio' ? currentTheme.primary : currentTheme.textMuted,
                  borderColor:
                    activeCategory === 'studio' ? `${currentTheme.primary}60` : 'transparent',
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Radio className="w-3 h-3 text-sky-400" />
                <span>Studio & EDM ({allThemes.length - bebopThemes.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImportBox(!showImportBox)}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>{showImportBox ? 'Hide Import' : 'Import'}</span>
              </button>
              <button
                type="button"
                onClick={handleStartCustom}
                style={{
                  backgroundColor: currentTheme.primary,
                }}
                className="px-2.5 py-1 rounded text-xs font-bold text-black flex items-center gap-1 shadow cursor-pointer hover:brightness-110"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Theme</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {!isCreatingCustom ? (
            <>
              {/* Import Box */}
              {showImportBox && (
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: currentTheme.bgSurface,
                    borderColor: currentTheme.borderColor,
                  }}
                >
                  <label className="text-xs text-neutral-300 font-mono block">
                    Paste Theme JSON:
                  </label>
                  <textarea
                    rows={3}
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder='{"id":"my-theme","name":"Cyber Red","primary":"#ef4444",...}'
                    className="w-full p-2.5 bg-black text-xs font-mono text-neutral-200 border border-neutral-700 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleImportJson}
                    style={{ backgroundColor: currentTheme.primary }}
                    className="px-3 py-1.5 rounded text-black font-semibold text-xs cursor-pointer hover:brightness-110"
                  >
                    Apply & Save Theme
                  </button>
                </div>
              )}

              {/* Theme Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {displayedThemes.map((theme) => {
                  const isSelected = currentTheme.id === theme.id;
                  const isCustom = !THEME_PRESETS.some((p) => p.id === theme.id);

                  return (
                    <div
                      key={theme.id}
                      onClick={() => setThemeById(theme.id)}
                      style={{
                        backgroundColor: theme.bgCard,
                        background: theme.bgCanvasGradient || theme.cardGradient || theme.bgCard,
                        borderColor: isSelected ? theme.primary : theme.borderColor,
                        boxShadow: isSelected ? `0 0 24px ${theme.accentGlow}` : 'none',
                        borderWidth: isSelected ? '2px' : '1px',
                      }}
                      className={`relative p-4 ${theme.cardRadius || 'rounded-xl'} transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 hover:-translate-y-1 hover:shadow-xl group overflow-hidden`}
                    >
                      {/* Subtle Ambient Orb Preview inside card */}
                      <div
                        className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-70"
                        style={{ backgroundColor: theme.primary }}
                      />
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* Color Swatch Ring */}
                            <div
                              className="w-4 h-4 rounded-full border border-white/20 shadow-sm shrink-0"
                              style={{ backgroundColor: theme.primary }}
                            />
                            <span className="font-bold text-sm text-white">{theme.name}</span>
                            {theme.tag && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase font-bold border"
                                style={{
                                  backgroundColor: `${theme.primary}20`,
                                  borderColor: `${theme.primary}60`,
                                  color: theme.primary,
                                }}
                              >
                                {theme.tag}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isCustom && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCustomTheme(theme.id);
                                }}
                                className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                                title="Delete custom theme"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isSelected && (
                              <span
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                                style={{
                                  backgroundColor: `${theme.primary}25`,
                                  borderColor: `${theme.primary}60`,
                                  color: theme.primary,
                                }}
                              >
                                <Check className="w-3 h-3" /> ACTIVE
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Character Tagline / Quote if available */}
                        {theme.tagline && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] italic text-neutral-300">
                            <Quote className="w-2.5 h-2.5 shrink-0 opacity-70" />
                            <span className="truncate">&ldquo;{theme.tagline}&rdquo;</span>
                          </div>
                        )}

                        <p className="mt-1 text-xs text-neutral-400 line-clamp-2">
                          {theme.description}
                        </p>
                      </div>

                      {/* Theme Visual Preview Palette Bars with Stats Swatches */}
                      <div className="space-y-1.5 pt-2 border-t border-neutral-800/80">
                        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                          <span>PALETTE & STATS METER</span>
                          <span style={{ color: theme.primary }}>{theme.fontVibe}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="h-3 flex-1 rounded-sm border border-white/10"
                            style={{ backgroundColor: theme.bgCanvas }}
                            title="Canvas"
                          />
                          <div
                            className="h-3 flex-1 rounded-sm border border-white/10"
                            style={{ backgroundColor: theme.bgCard }}
                            title="Card"
                          />
                          <div
                            className="h-3 flex-1 rounded-sm border border-white/10"
                            style={{ backgroundColor: theme.primary }}
                            title="Primary Accent"
                          />
                          <div
                            className="h-3 flex-1 rounded-sm border border-white/10"
                            style={{ backgroundColor: theme.secondary }}
                            title="Secondary Accent"
                          />
                          {theme.accentTertiary && (
                            <div
                              className="h-3 flex-1 rounded-sm border border-white/10"
                              style={{ backgroundColor: theme.accentTertiary }}
                              title="Tertiary Accent"
                            />
                          )}
                          <div
                            className="h-3 flex-1 rounded-sm border border-white/10"
                            style={{ backgroundColor: theme.waveformPlayedTop }}
                            title="Waveform Played"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Custom Theme Editor Form */
            <form onSubmit={handleSaveCustom} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Custom Theme Designer</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreatingCustom(false)}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1">
                    Theme Name
                  </label>
                  <input
                    type="text"
                    value={customForm.name}
                    onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-black border border-neutral-700 rounded-lg text-sm text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={customForm.description}
                    onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                    className="w-full px-3 py-2 bg-black border border-neutral-700 rounded-lg text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Color Pickers Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 space-y-1.5">
                  <label className="block text-[11px] font-mono text-neutral-400">
                    Primary Accent
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customForm.primary}
                      onChange={(e) =>
                        setCustomForm({
                          ...customForm,
                          primary: e.target.value,
                          visualizerPrimary: e.target.value,
                          waveformPlayedTop: e.target.value,
                        })
                      }
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-white">{customForm.primary}</span>
                  </div>
                </div>

                <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 space-y-1.5">
                  <label className="block text-[11px] font-mono text-neutral-400">
                    Secondary Accent
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customForm.secondary}
                      onChange={(e) =>
                        setCustomForm({
                          ...customForm,
                          secondary: e.target.value,
                          visualizerSecondary: e.target.value,
                        })
                      }
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-white">{customForm.secondary}</span>
                  </div>
                </div>

                <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 space-y-1.5">
                  <label className="block text-[11px] font-mono text-neutral-400">
                    Background Canvas
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customForm.bgCanvas}
                      onChange={(e) => setCustomForm({ ...customForm, bgCanvas: e.target.value })}
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-white">{customForm.bgCanvas}</span>
                  </div>
                </div>

                <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 space-y-1.5">
                  <label className="block text-[11px] font-mono text-neutral-400">
                    Card Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customForm.bgCard}
                      onChange={(e) => setCustomForm({ ...customForm, bgCard: e.target.value })}
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-white">{customForm.bgCard}</span>
                  </div>
                </div>

                <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 space-y-1.5">
                  <label className="block text-[11px] font-mono text-neutral-400">
                    Waveform Played
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customForm.waveformPlayedTop}
                      onChange={(e) =>
                        setCustomForm({ ...customForm, waveformPlayedTop: e.target.value })
                      }
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-white">
                      {customForm.waveformPlayedTop}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-neutral-900/90 rounded-lg border border-neutral-800 space-y-1.5">
                  <label className="block text-[11px] font-mono text-neutral-400">
                    Waveform Unplayed
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customForm.waveformUnplayedTop}
                      onChange={(e) =>
                        setCustomForm({ ...customForm, waveformUnplayedTop: e.target.value })
                      }
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-white">
                      {customForm.waveformUnplayedTop}
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingCustom(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm text-neutral-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: currentTheme.primary }}
                  className="px-5 py-2 rounded-lg text-black text-sm font-semibold shadow-md cursor-pointer hover:brightness-110"
                >
                  Save & Apply Theme
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
