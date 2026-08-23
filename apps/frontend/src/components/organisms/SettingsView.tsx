import React, { useState } from 'react';
import {
  Palette,
  Check,
  Volume2,
  Sliders,
  Sparkles,
  HardDrive,
  Copy,
  Upload,
  RefreshCw,
  Zap,
  Music,
  ShieldCheck,
  Disc3,
  SlidersHorizontal,
} from 'lucide-react';
import { useTheme, ThemeConfig } from '@/services/themeService';

export const SettingsView: React.FC = () => {
  const { currentTheme, allThemes, setThemeById, saveCustomTheme } = useTheme();

  // Settings State
  const [audioDriver, setAudioDriver] = useState<'wasapi' | 'asio' | 'webaudio'>('wasapi');
  const [sampleRate, setSampleRate] = useState('192khz-32bit');
  const [replayGain, setReplayGain] = useState(true);
  const [bufferSize, setBufferSize] = useState('128');
  const [exclusiveMode, setExclusiveMode] = useState(true);
  const [visualizerDensity, setVisualizerDensity] = useState<'dense' | 'standard' | 'minimal'>(
    'standard',
  );
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [showImportJson, setShowImportJson] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  const handleCopyJson = () => {
    const json = JSON.stringify(currentTheme, null, 2);
    navigator.clipboard.writeText(json);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const handleImportTheme = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (parsed.name && parsed.primary) {
        parsed.id = parsed.id || `custom-${Date.now()}`;
        saveCustomTheme(parsed);
        setShowImportJson(false);
        setImportJsonText('');
      } else {
        alert('Invalid theme format. Missing required properties.');
      }
    } catch {
      alert('Could not parse JSON. Please check syntax.');
    }
  };

  const handleRescanLibrary = () => {
    setIsScanning(true);
    setScanSuccess(false);
    setTimeout(() => {
      setIsScanning(false);
      setScanSuccess(true);
      setTimeout(() => setScanSuccess(false), 3000);
    }, 1200);
  };

  return (
    <div
      id="settings-view-container"
      className="w-full max-w-6xl mx-auto flex flex-col gap-8 pb-12 font-sans animate-fadeIn"
    >
      {/* Top Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b"
        style={{ borderColor: currentTheme.borderColor }}
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span>Settings & Preferences</span>
            <span
              className="text-xs font-mono px-2.5 py-1 rounded-full border font-bold uppercase"
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                color: currentTheme.primary,
                borderColor: `${currentTheme.primary}50`,
              }}
            >
              {currentTheme.name}
            </span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Configure visual themes, bit-perfect audio drivers, DSP engine, and lossless library
            scanning
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyJson}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="px-3 py-1.5 rounded-lg border text-xs font-mono text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer hover:brightness-110"
          >
            {copiedNotification ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Export Theme JSON</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowImportJson(!showImportJson)}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="px-3 py-1.5 rounded-lg border text-xs font-mono text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer hover:brightness-110"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
          </button>
        </div>
      </div>

      {/* JSON Import Section (if opened) */}
      {showImportJson && (
        <div
          style={{
            backgroundColor: currentTheme.bgCard,
            borderColor: currentTheme.borderColor,
          }}
          className="p-5 border rounded-xl flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Import Custom Theme JSON</h3>
            <button
              type="button"
              onClick={() => setShowImportJson(false)}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            placeholder="Paste your theme JSON here..."
            className="w-full h-32 p-3 text-xs font-mono rounded-lg bg-black/60 border border-neutral-800 text-neutral-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleImportTheme}
            style={{ backgroundColor: currentTheme.primary }}
            className="self-end px-4 py-1.5 rounded-lg text-xs font-bold text-black cursor-pointer hover:brightness-110"
          >
            Apply Imported Theme
          </button>
        </div>
      )}

      {/* 1. THEMES & APPEARANCE SECTION */}
      <section id="settings-theming-section" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: `${currentTheme.primary}18`,
                borderColor: `${currentTheme.primary}50`,
                color: currentTheme.primary,
              }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Theming & Visual Appearance
              </h2>
              <p className="text-xs text-neutral-400">
                Select your preferred visual atmosphere. Each theme includes tailored color
                palettes, waveform dynamics, and ambient lighting.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-neutral-400">
            {allThemes.length} Available Themes
          </span>
        </div>

        {/* Flat Grid of All Themes - NO Grouping, Subtle & Classy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {allThemes.map((theme) => {
            const isSelected = currentTheme.id === theme.id;
            return (
              <div
                key={theme.id}
                id={`theme-card-${theme.id}`}
                onClick={() => setThemeById(theme.id)}
                style={{
                  backgroundColor: theme.bgCard,
                  background: theme.bgCanvasGradient || theme.cardGradient || theme.bgCard,
                  borderColor: isSelected ? theme.primary : theme.borderColor,
                  boxShadow: isSelected ? `0 0 20px ${theme.accentGlow}` : 'none',
                  borderWidth: isSelected ? '2px' : '1px',
                }}
                className={`relative p-4 ${theme.cardRadius || 'rounded-xl'} transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 hover:-translate-y-1 hover:shadow-xl group overflow-hidden select-none`}
              >
                {/* Subtle Ambient Orb Preview inside card */}
                <div
                  className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-70"
                  style={{ backgroundColor: theme.primary }}
                />

                <div className="flex flex-col gap-1.5 relative z-10">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm text-white flex items-center gap-1.5 truncate">
                      <span>{theme.name}</span>
                    </h3>
                    {isSelected ? (
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-black shrink-0 shadow"
                        style={{ backgroundColor: theme.primary }}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: theme.primary }}
                      />
                    )}
                  </div>

                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                    {theme.description}
                  </p>
                </div>

                {/* Color Swatches & Waveform Preview */}
                <div
                  className="flex flex-col gap-2 relative z-10 pt-2 border-t"
                  style={{ borderColor: `${theme.borderColor}80` }}
                >
                  {/* Swatches */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: theme.primary }}
                        title={`Primary: ${theme.primary}`}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: theme.secondary }}
                        title={`Secondary: ${theme.secondary}`}
                      />
                      {theme.accentTertiary && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: theme.accentTertiary }}
                          title={`Accent: ${theme.accentTertiary}`}
                        />
                      )}
                    </div>

                    <span className="text-[10px] font-mono text-neutral-400 uppercase">
                      {theme.fontVibe || 'audiophile'}
                    </span>
                  </div>

                  {/* Mini Waveform Preview */}
                  <div className="h-4 flex items-end gap-[2px] opacity-70 group-hover:opacity-100 transition-opacity">
                    {[
                      0.3, 0.6, 0.9, 0.4, 0.75, 1.0, 0.5, 0.85, 0.35, 0.7, 0.95, 0.45, 0.8, 0.55,
                    ].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-xs"
                        style={{
                          height: `${h * 100}%`,
                          backgroundColor:
                            i < 8 ? theme.waveformPlayedTop : theme.waveformUnplayedTop,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. AUDIO ENGINE & BIT-PERFECT SINK */}
      <section
        id="settings-audio-engine-section"
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
        }}
        className="p-6 border rounded-xl flex flex-col gap-6"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg border flex items-center justify-center"
            style={{
              backgroundColor: `${currentTheme.primary}18`,
              borderColor: `${currentTheme.primary}50`,
              color: currentTheme.primary,
            }}
          >
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Audio Output Engine & Hardware Sink
            </h2>
            <p className="text-xs text-neutral-400">
              Configure DAC streaming protocols, sample rate mastering, and bit-perfect playback
              modes
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Driver Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono font-bold text-neutral-300">
              OUTPUT DRIVER / PROTOCOL
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'wasapi', label: 'WASAPI Exclusive', sub: 'Bit-Perfect' },
                { id: 'asio', label: 'ASIO Direct', sub: 'Low-Latency' },
                { id: 'webaudio', label: 'Web Audio Float', sub: '32-Bit DSP' },
              ].map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => setAudioDriver(driver.id as any)}
                  style={{
                    backgroundColor:
                      audioDriver === driver.id
                        ? `${currentTheme.primary}20`
                        : currentTheme.bgSurface,
                    borderColor:
                      audioDriver === driver.id ? currentTheme.primary : currentTheme.borderColor,
                    color: audioDriver === driver.id ? currentTheme.primary : undefined,
                  }}
                  className="p-3 border rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                >
                  <span className="text-xs font-bold text-white">{driver.label}</span>
                  <span className="text-[10px] font-mono text-neutral-400">{driver.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sample Rate Resolution */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono font-bold text-neutral-300">
              STUDIO MASTER RESOLUTION
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '192khz-32bit', label: '192 kHz / 32-Bit', sub: 'FLAC Master' },
                { id: '96khz-24bit', label: '96 kHz / 24-Bit', sub: 'Studio HD' },
                { id: '44khz-16bit', label: '44.1 kHz / 16-Bit', sub: 'Redbook CD' },
              ].map((rate) => (
                <button
                  key={rate.id}
                  type="button"
                  onClick={() => setSampleRate(rate.id)}
                  style={{
                    backgroundColor:
                      sampleRate === rate.id ? `${currentTheme.primary}20` : currentTheme.bgSurface,
                    borderColor:
                      sampleRate === rate.id ? currentTheme.primary : currentTheme.borderColor,
                    color: sampleRate === rate.id ? currentTheme.primary : undefined,
                  }}
                  className="p-3 border rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                >
                  <span className="text-xs font-bold text-white">{rate.label}</span>
                  <span className="text-[10px] font-mono text-neutral-400">{rate.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Audio Toggles */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t"
          style={{ borderColor: currentTheme.borderColor }}
        >
          <div
            onClick={() => setExclusiveMode(!exclusiveMode)}
            className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-neutral-800 cursor-pointer hover:border-neutral-700"
          >
            <div>
              <div className="text-xs font-bold text-white">Hardware Exclusive Mode</div>
              <div className="text-[10px] text-neutral-400">
                Bypasses OS mixer for bit-perfect stream
              </div>
            </div>
            <div
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                exclusiveMode ? 'bg-emerald-500' : 'bg-neutral-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  exclusiveMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          <div
            onClick={() => setReplayGain(!replayGain)}
            className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-neutral-800 cursor-pointer hover:border-neutral-700"
          >
            <div>
              <div className="text-xs font-bold text-white">ReplayGain Dynamic Normalization</div>
              <div className="text-[10px] text-neutral-400">
                Maintains target -18 LUFS dynamic range
              </div>
            </div>
            <div
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                replayGain ? 'bg-emerald-500' : 'bg-neutral-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  replayGain ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-neutral-800">
            <div>
              <div className="text-xs font-bold text-white">ASIO Buffer Size</div>
              <div className="text-[10px] text-neutral-400">Latency: 2.9ms @ 192 kHz</div>
            </div>
            <select
              value={bufferSize}
              onChange={(e) => setBufferSize(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs font-mono text-neutral-200 rounded px-2 py-1 focus:outline-none"
            >
              <option value="64">64 samples</option>
              <option value="128">128 samples</option>
              <option value="256">256 samples</option>
              <option value="512">512 samples</option>
            </select>
          </div>
        </div>
      </section>

      {/* 3. LOCAL STORAGE & DIRECTORY MANAGEMENT */}
      <section
        id="settings-library-paths-section"
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
        }}
        className="p-6 border rounded-xl flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: `${currentTheme.primary}18`,
                borderColor: `${currentTheme.primary}50`,
                color: currentTheme.primary,
              }}
            >
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Local Storage & Lossless Library
              </h2>
              <p className="text-xs text-neutral-400">
                1.42 TB local music database with 4,812 FLAC, DSD & ALAC lossless tracks
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRescanLibrary}
            disabled={isScanning}
            style={{
              backgroundColor: currentTheme.primary,
            }}
            className="px-4 py-2 rounded-lg text-xs font-bold text-black flex items-center gap-2 cursor-pointer hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning Directory...' : 'Rescan Library'}</span>
          </button>
        </div>

        {scanSuccess && (
          <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/50 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Scan Complete: All 4,812 tracks verified bit-perfect. No corrupted checksums found.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-lg bg-black/30 border border-neutral-800 flex flex-col gap-1">
            <span className="text-[10px] font-mono text-neutral-400">WATCHED FOLDER PATH</span>
            <span className="text-xs font-mono font-bold text-neutral-200 truncate">
              /Volumes/Audio/Lossless-Master/
            </span>
          </div>

          <div className="p-3 rounded-lg bg-black/30 border border-neutral-800 flex flex-col gap-1">
            <span className="text-[10px] font-mono text-neutral-400">METADATA CACHE</span>
            <span className="text-xs font-mono font-bold text-neutral-200">
              100% Embedded Cover & Bios Cached
            </span>
          </div>

          <div className="p-3 rounded-lg bg-black/30 border border-neutral-800 flex flex-col gap-1">
            <span className="text-[10px] font-mono text-neutral-400">CHECKSUM VERIFICATION</span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              MD5 Lossless Verified
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
