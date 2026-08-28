import React, { useMemo, useState, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  ListMusic,
  Disc3,
  ChevronUp,
  Maximize2,
} from 'lucide-react';
import { TrackItem } from '@/types';
import { PeakHoldVisualizer } from '@/components/organisms/PeakHoldVisualizer';
import { visualizerStyleFromVars } from '@/services/visualizerStyle';
import { useTheme } from '@/services/themeService';

interface NowPlayingBarProps {
  currentTrack?: TrackItem | null;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  onPlayPause?: () => void;
  onPrev: () => void;
  onNext: () => void;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  repeatMode?: 'off' | 'all' | 'one';
  onToggleRepeat?: () => void;
  currentTimeSeconds?: number;
  onSeek?: (seconds: number) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
  onExpandFullscreen?: () => void;
  onToggleQueue?: () => void;
  queueCount?: number;
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (volume: number) => void | Promise<void>;
  onToggleMute?: () => void | Promise<void>;
  volumeLocked?: boolean;
  onUnlockVolume?: () => void | Promise<unknown>;
  spectrumAvailable?: boolean;
  frequencyDataProvider?: (outputArray: Uint8Array) => Uint8Array;
  getSpectrumBins?: () => readonly number[];
}

export const NowPlayingBar: React.FC<NowPlayingBarProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onPlayPause,
  onPrev,
  onNext,
  isShuffle: controlledShuffle,
  onToggleShuffle,
  repeatMode: controlledRepeat,
  onToggleRepeat,
  currentTimeSeconds = 0,
  onSeek,
  onSelectArtist,
  onSelectAlbum,
  onExpandFullscreen,
  onToggleQueue,
  queueCount = 0,
  volume: controlledVolume,
  muted: controlledMuted,
  onVolumeChange,
  onToggleMute,
  volumeLocked = false,
  onUnlockVolume,
  spectrumAvailable = true,
  frequencyDataProvider,
  getSpectrumBins,
}) => {
  const { currentTheme } = useTheme();
  // Bar width, gap, radius, fill, cap and glow all come from the theme's
  // visualizer tokens. Memoised on the theme so the canvas can cache the
  // pattern it builds for a repeating fill.
  const visualizerStyle = useMemo(
    () => visualizerStyleFromVars(currentTheme.vars, currentTheme.visualizerPrimary),
    [currentTheme],
  );
  const handleToggle = onTogglePlay || onPlayPause || (() => {});
  const [localVolume, setLocalVolume] = useState(85);
  const [localMuted, setLocalMuted] = useState(false);
  const [localShuffle, setLocalShuffle] = useState(false);
  const [localRepeat, setLocalRepeat] = useState<'off' | 'all' | 'one'>('off');

  const isShuffle = controlledShuffle ?? localShuffle;
  const repeatMode = controlledRepeat ?? localRepeat;

  const toggleShuffle = () => {
    if (onToggleShuffle) onToggleShuffle();
    else setLocalShuffle((prev) => !prev);
  };

  const toggleRepeat = () => {
    if (onToggleRepeat) onToggleRepeat();
    else setLocalRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  };

  // SoundCloud Mini-Waveform scrubber hover state
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const [isHoveringSeek, setIsHoveringSeek] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);

  const volume = controlledVolume === undefined ? localVolume : Math.round(controlledVolume * 100);
  const isMuted = controlledMuted ?? localMuted;
  const changeVolume = async (nextVolume: number) => {
    if (volumeLocked && nextVolume !== 100) await onUnlockVolume?.();
    if (onVolumeChange) await onVolumeChange(nextVolume / 100);
    else setLocalVolume(nextVolume);
    if (onVolumeChange && isMuted) onToggleMute?.();
    else if (!onVolumeChange && isMuted) setLocalMuted(false);
  };
  const toggleMute = async () => {
    if (volumeLocked && !isMuted) await onUnlockVolume?.();
    if (onToggleMute) await onToggleMute();
    else setLocalMuted((muted) => !muted);
  };

  if (!currentTrack) {
    return (
      <footer
        id="now-playing-bar"
        style={{
          backgroundColor: `${currentTheme.bgCard}fa`,
          borderColor: currentTheme.borderColor,
        }}
        className="win-round-b fixed bottom-0 left-0 right-0 z-40 flex min-h-[5.5rem] items-center justify-between border-t px-4 font-sans shadow-[0_-10px_30px_rgba(0,0,0,0.8)] sm:px-6 lg:px-10 2xl:px-14"
      >
        <div className="flex min-w-[200px] items-center gap-3 text-neutral-400">
          <span className="flex h-12 w-12 items-center justify-center t-sm border border-neutral-700 bg-neutral-900">
            <Disc3 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-200">Nothing playing</p>
            <p className="mt-0.5 text-xs">Choose a scanned track to begin.</p>
          </div>
        </div>
        <div
          className="hidden items-center gap-4 text-neutral-600 sm:flex"
          aria-label="Playback inactive"
        >
          <SkipBack className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center t-control border border-neutral-700">
            <Play className="ml-0.5 h-4 w-4" />
          </span>
          <SkipForward className="h-4 w-4" />
        </div>
        <span className="text-right text-xs text-neutral-500">Native playback ready</span>
      </footer>
    );
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const safeDuration = currentTrack.durationSeconds > 0 ? currentTrack.durationSeconds : 240;
  const progressRatio = Math.max(0, Math.min(1, currentTimeSeconds / safeDuration));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setIsDraggingSeek(true);
    onSeek?.(ratio * safeDuration);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverRatio(ratio);
    if (isDraggingSeek) {
      onSeek?.(ratio * safeDuration);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingSeek(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <footer
      id="now-playing-bar"
      style={{
        backgroundColor: `${currentTheme.bgCard}fa`,
        borderColor: currentTheme.borderColor,
      }}
      className="win-round-b fixed bottom-0 left-0 right-0 z-40 flex min-h-[5.5rem] select-none items-center justify-between border-t px-4 font-sans shadow-[0_-10px_30px_rgba(0,0,0,0.8)] transition-colors duration-300 sm:px-6 lg:px-10 2xl:px-14"
    >
      {/* Peak-hold spectrum as a full-height bed behind the bar's contents. */}
      <div className="win-round-b absolute inset-0 overflow-hidden pointer-events-none opacity-30 z-0 flex items-end">
        <PeakHoldVisualizer
          isPlaying={spectrumAvailable && isPlaying}
          height={88}
          style={visualizerStyle}
          autoFillWidth={true}
          frequencyDataProvider={frequencyDataProvider}
          getSpectrumBins={getSpectrumBins}
        />
      </div>

      {/* Scrubber pinned to the bar's top edge, spanning the full width. Sits
          above the spectrum bed and is the only thing at this depth, so the
          whole edge of the bar is a hit target. */}
      <div
        id="now-playing-seek"
        ref={scrubberRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setIsHoveringSeek(true)}
        onMouseLeave={() => {
          setIsHoveringSeek(false);
          setHoverRatio(null);
          setIsDraggingSeek(false);
        }}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeDuration)}
        aria-valuenow={Math.round(currentTimeSeconds)}
        tabIndex={0}
        className="group absolute inset-x-0 top-0 z-30 flex h-4 -translate-y-1/2 cursor-pointer items-center"
      >
        <div
          className="relative w-full transition-all duration-150"
          style={{
            height: isHoveringSeek ? '6px' : '3px',
            backgroundColor: currentTheme.waveformUnplayedBot,
          }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${progressRatio * 100}%`,
              background: `linear-gradient(90deg, ${currentTheme.waveformPlayedBot} 0%, ${currentTheme.primary} 100%)`,
            }}
          />

          {/* Where a click would land */}
          {isHoveringSeek && hoverRatio !== null && hoverRatio > progressRatio && (
            <div
              className="absolute inset-y-0 opacity-40"
              style={{
                left: `${progressRatio * 100}%`,
                width: `${(hoverRatio - progressRatio) * 100}%`,
                backgroundColor: currentTheme.secondary,
              }}
            />
          )}

          {/* Handle appears on hover so the resting state stays a clean line */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 t-btn transition-all duration-150"
            style={{
              left: `${progressRatio * 100}%`,
              width: isHoveringSeek ? '13px' : '0px',
              height: isHoveringSeek ? '13px' : '0px',
              backgroundColor: currentTheme.primary,
              boxShadow: currentTheme.waveformGlow
                ? `0 0 12px ${currentTheme.accentGlow}`
                : undefined,
            }}
          />
        </div>

        {isHoveringSeek && hoverRatio !== null && (
          <div
            className="pointer-events-none absolute -top-8 z-40 -translate-x-1/2"
            style={{ left: `${hoverRatio * 100}%` }}
          >
            <div
              className="whitespace-nowrap t-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-xl"
              style={{
                backgroundColor: currentTheme.bgCanvas,
                borderColor: currentTheme.primary,
                color: currentTheme.primary,
              }}
            >
              {formatTime(hoverRatio * safeDuration)}
            </div>
          </div>
        )}
      </div>

      {/* Left: Track Artwork with Hover Up Chevron & Info */}
      <div className="relative z-10 flex items-center gap-3.5 min-w-[200px] sm:min-w-[260px] max-w-[28%]">
        {/* Album Artwork Container with Hover Up Chevron */}
        <div
          id="now-playing-artwork-container"
          onClick={onExpandFullscreen}
          className="relative w-12 h-12 t-sm overflow-hidden bg-neutral-900 shrink-0 border border-neutral-600 shadow-md group cursor-pointer"
          title="Expand Fullscreen View (Click Artwork)"
        >
          {currentTrack.coverUrl ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600">
              <Disc3 className="w-6 h-6" />
            </div>
          )}

          {/* Up Chevron / Arrow on Hover */}
          <div
            id="artwork-expand-overlay"
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200"
          >
            <div
              className="w-7 h-7 t-btn text-black flex items-center justify-center shadow-lg transform -translate-y-1 group-hover:translate-y-0 transition-transform duration-200"
              style={{ backgroundColor: currentTheme.primary }}
            >
              <ChevronUp className="w-4 h-4 stroke-[3]" />
            </div>
          </div>

          <div
            className="absolute top-0.5 left-0.5 px-1 py-0.2 t-sm bg-black/80 text-[8px] font-mono group-hover:opacity-0 transition-opacity"
            style={{ color: currentTheme.primary }}
          >
            {currentTrack.codec}
          </div>
        </div>

        <div className="flex flex-col truncate min-w-0">
          <h4
            className="text-sm font-bold text-white tracking-tight truncate hover:opacity-80 transition-colors cursor-pointer"
            onClick={onExpandFullscreen}
            title={`${currentTrack.title} (Click to expand fullscreen)`}
          >
            {currentTrack.title}
          </h4>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 truncate mt-0.5">
            <button
              type="button"
              onClick={() => onSelectArtist?.(currentTrack.artist)}
              className="text-neutral-300 hover:text-white hover:underline font-medium truncate cursor-pointer transition-colors text-left"
              title={`View artist: ${currentTrack.artist}`}
            >
              {currentTrack.artist}
            </button>
            {currentTrack.album && (
              <>
                <span className="text-neutral-600 shrink-0 select-none">•</span>
                <button
                  type="button"
                  onClick={() => onSelectAlbum?.(currentTrack.album)}
                  className="text-neutral-400 hover:text-white hover:underline truncate cursor-pointer transition-colors text-left"
                  title={`View album: ${currentTrack.album}`}
                >
                  {currentTrack.album}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Center: Transport Controls & Scrubber */}
      <div className="relative z-10 flex-1 max-w-2xl px-3 sm:px-6 flex flex-col items-center gap-1.5">
        {/* Playback Buttons */}
        <div className="relative w-full flex items-center justify-center">
          <div className="flex items-center gap-4 text-neutral-300">
            <button
              type="button"
              onClick={toggleShuffle}
              className="transition-colors cursor-pointer"
              style={{ color: isShuffle ? currentTheme.primary : undefined }}
              aria-label="Shuffle"
              title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Previous Track"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={handleToggle}
              style={{
                backgroundColor: currentTheme.primary,
                boxShadow: `0 0 14px ${currentTheme.accentGlow}`,
              }}
              className="w-9 h-9 t-btn text-black flex items-center justify-center transition-all cursor-pointer hover:scale-105 hover:brightness-110"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-black" />
              ) : (
                <Play className="w-4 h-4 fill-black ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Next Track"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={toggleRepeat}
              className="transition-colors cursor-pointer relative"
              style={{ color: repeatMode !== 'off' ? currentTheme.primary : undefined }}
              aria-label="Repeat Mode"
              title={`Repeat: ${repeatMode === 'one' ? 'Repeat One' : repeatMode === 'all' ? 'Repeat All' : 'Off'}`}
            >
              <Repeat className="w-3.5 h-3.5" />
              {repeatMode === 'one' && (
                <span
                  className="absolute -top-1 -right-1 text-[8px] font-bold font-mono px-0.5 rounded-full"
                  style={{
                    backgroundColor: currentTheme.primary,
                    color: 'var(--c-on-p, #000000)',
                  }}
                >
                  1
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Elapsed / total. The scrubber itself spans the bar's top edge. */}
        <div className="flex w-full items-center justify-center gap-2 font-mono text-[11px] text-neutral-400">
          <span className="font-bold" style={{ color: currentTheme.primary }}>
            {formatTime(currentTimeSeconds)}
          </span>
          <span className="text-neutral-600">/</span>
          <span>{currentTrack.duration || formatTime(safeDuration)}</span>
        </div>
      </div>

      {/* Right: DAC Output Engine, Queue Icon (to the left of volume), Volume Adjuster */}
      <div className="relative z-10 flex items-center gap-3 sm:gap-4 text-xs text-neutral-400 min-w-[190px] justify-end">
        {/* WASAPI / Audio Sink Status Badge */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-[#101622] border border-neutral-800 t-sm text-neutral-300 font-mono text-[11px]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-amber-300 font-semibold">
            {!spectrumAvailable
              ? 'Spectrum disabled'
              : getSpectrumBins
                ? 'Native PCM FFT · 64 bands'
                : 'Web Audio FFT'}
          </span>
        </div>

        {/* Queue Icon Button (to the left of the volume adjuster) */}
        <button
          id="now-playing-queue-toggle-btn"
          type="button"
          onClick={onToggleQueue}
          className="relative p-2 t-control text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/70 transition-colors cursor-pointer flex items-center justify-center"
          title={`Now Playing Queue (${queueCount} tracks)`}
          aria-label="Now Playing Queue"
        >
          <ListMusic className="w-4 h-4" />
          {queueCount > 0 && (
            <span
              id="now-playing-queue-badge"
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold font-mono flex items-center justify-center leading-none"
            >
              {queueCount}
            </span>
          )}
        </button>

        {/* Volume Slider */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleMute()}
            className="hover:text-white cursor-pointer"
            aria-label="Toggle Mute"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-neutral-500" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            id="now-playing-volume-slider"
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              void changeVolume(Number(e.target.value));
            }}
            title={
              volumeLocked
                ? 'Adjusting volume switches from hi-fi unity gain to adjustable-volume mode.'
                : 'Playback volume'
            }
            className="w-16 sm:w-20 h-1.5 bg-neutral-700 t-sm appearance-none cursor-pointer accent-amber-500"
          />
          {volumeLocked && (
            <span className="hidden text-[10px] font-medium text-amber-300 xl:inline">
              unity gain
            </span>
          )}
        </div>

        {/* Fullscreen Expand Icon Button */}
        <button
          id="now-playing-fullscreen-btn"
          type="button"
          onClick={onExpandFullscreen}
          className="p-2 t-control text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/70 transition-colors cursor-pointer flex items-center justify-center"
          title="Expand Fullscreen View"
          aria-label="Expand Fullscreen View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </footer>
  );
};
