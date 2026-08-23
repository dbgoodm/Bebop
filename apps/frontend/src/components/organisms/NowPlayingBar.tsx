import React, { useState, useMemo, useRef } from 'react';
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
import { MonstercatVisualizer } from '@/components/organisms/MonstercatVisualizer';
import { useTheme } from '@/services/themeService';

interface NowPlayingBarProps {
  currentTrack?: TrackItem | null;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  onPlayPause?: () => void;
  onPrev: () => void;
  onNext: () => void;
  currentTimeSeconds?: number;
  onSeek?: (seconds: number) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
  onExpandFullscreen?: () => void;
  onToggleQueue?: () => void;
  queueCount?: number;
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (volume: number) => void;
  onToggleMute?: () => void;
  spectrumAvailable?: boolean;
  frequencyDataProvider?: (outputArray: Uint8Array) => Uint8Array;
}

// Deterministic SoundCloud waveform bars generator
function generateCompactWaveform(track: TrackItem, count: number = 75): number[] {
  let seed = 7;
  const str = `${track.title}-${track.artist}-${track.durationSeconds || 240}`;
  for (let i = 0; i < str.length; i++) {
    seed += str.charCodeAt(i) * (i + 1);
  }

  const data: number[] = [];
  for (let i = 0; i < count; i++) {
    const progress = i / count;
    let structure = 0.4;
    if (progress < 0.1) {
      structure = 0.3 + (progress / 0.1) * 0.35;
    } else if (progress < 0.4) {
      structure = 0.6 + Math.sin(progress * 20) * 0.2;
    } else if (progress < 0.65) {
      structure = 0.9 + Math.sin(progress * 25) * 0.1;
    } else if (progress < 0.78) {
      structure = 0.45 + Math.sin(progress * 12) * 0.15;
    } else if (progress < 0.92) {
      structure = 0.95 + Math.sin(progress * 30) * 0.05;
    } else {
      structure = Math.max(0.2, (1 - (progress - 0.92) / 0.08) * 0.6);
    }
    const noise = Math.abs(Math.sin((seed + i * 5.3) * 1000) % 1);
    const snap = i % 4 === 0 ? 0.25 : i % 2 === 0 ? 0.1 : 0;
    data.push(Math.max(0.2, Math.min(1.0, structure * 0.65 + noise * 0.25 + snap)));
  }
  return data;
}

export const NowPlayingBar: React.FC<NowPlayingBarProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onPlayPause,
  onPrev,
  onNext,
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
  spectrumAvailable = true,
  frequencyDataProvider,
}) => {
  const { currentTheme } = useTheme();
  const handleToggle = onTogglePlay || onPlayPause || (() => {});
  const [localVolume, setLocalVolume] = useState(85);
  const [localMuted, setLocalMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  // SoundCloud Mini-Waveform scrubber hover state
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const [isHoveringSeek, setIsHoveringSeek] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);

  const waveformBars = useMemo(() => {
    if (!currentTrack) return [];
    return generateCompactWaveform(currentTrack, 75);
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist]);

  if (!currentTrack) return null;

  const volume = controlledVolume === undefined ? localVolume : Math.round(controlledVolume * 100);
  const isMuted = controlledMuted ?? localMuted;
  const changeVolume = (nextVolume: number) => {
    if (onVolumeChange) onVolumeChange(nextVolume / 100);
    else setLocalVolume(nextVolume);
    if (onVolumeChange && isMuted) onToggleMute?.();
    else if (!onVolumeChange && isMuted) setLocalMuted(false);
  };
  const toggleMute = () => {
    if (onToggleMute) onToggleMute();
    else setLocalMuted((muted) => !muted);
  };

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
      className="fixed bottom-0 left-0 right-0 h-22 backdrop-blur-xl border-t px-4 sm:px-6 lg:px-10 2xl:px-14 flex items-center justify-between z-40 select-none shadow-[0_-10px_30px_rgba(0,0,0,0.8)] font-sans overflow-hidden transition-colors duration-300"
    >
      {/* Full-Width Monstercat Visualizer expanding across the entire Now Playing Bar */}
      <div className="absolute inset-0 pointer-events-none opacity-25 z-0 flex items-end">
        <MonstercatVisualizer
          isPlaying={spectrumAvailable && isPlaying}
          height={42}
          barWidth={3}
          barGap={2}
          color={currentTheme.visualizerPrimary}
          secondaryColor={currentTheme.visualizerSecondary}
          glowEffect={currentTheme.waveformGlow}
          autoFillWidth={true}
          frequencyDataProvider={frequencyDataProvider}
        />
      </div>

      {/* Left: Track Artwork with Hover Up Chevron & Info */}
      <div className="relative z-10 flex items-center gap-3.5 min-w-[200px] sm:min-w-[260px] max-w-[28%]">
        {/* Album Artwork Container with Hover Up Chevron */}
        <div
          id="now-playing-artwork-container"
          onClick={onExpandFullscreen}
          className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 shrink-0 border border-neutral-600 shadow-md group cursor-pointer"
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
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200 backdrop-blur-[1px]"
          >
            <div
              className="w-7 h-7 rounded-full text-black flex items-center justify-center shadow-lg transform -translate-y-1 group-hover:translate-y-0 transition-transform duration-200"
              style={{ backgroundColor: currentTheme.primary }}
            >
              <ChevronUp className="w-4 h-4 stroke-[3]" />
            </div>
          </div>

          <div
            className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono group-hover:opacity-0 transition-opacity"
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
              onClick={() => setIsShuffle(!isShuffle)}
              className="transition-colors cursor-pointer"
              style={{ color: isShuffle ? currentTheme.primary : undefined }}
              aria-label="Shuffle"
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
              className="w-9 h-9 rounded-full text-black flex items-center justify-center transition-all cursor-pointer hover:scale-105 hover:brightness-110"
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
              onClick={() =>
                setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
              }
              className="transition-colors cursor-pointer"
              style={{ color: repeatMode !== 'off' ? currentTheme.primary : undefined }}
              aria-label="Repeat Mode"
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* SoundCloud-Style Mini Waveform Seek Bar (High-Contrast, Visible & Interactive) */}
        <div className="w-full flex items-center gap-2.5 text-xs font-mono text-neutral-300">
          <span
            className="w-10 text-right font-bold text-xs"
            style={{ color: currentTheme.primary }}
          >
            {formatTime(currentTimeSeconds)}
          </span>

          {/* SoundCloud Waveform Container */}
          <div
            id="now-playing-soundcloud-track"
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
            style={{
              backgroundColor: currentTheme.bgSurface,
              borderColor: currentTheme.borderColor,
            }}
            className="relative flex-1 h-7 rounded-md px-1.5 py-0.5 cursor-pointer group flex flex-col justify-center shadow-inner border transition-colors overflow-visible"
          >
            {/* Top Upper Bars (70% height) */}
            <div className="w-full h-3.5 flex items-end justify-between gap-[1.5px]">
              {waveformBars.map((amp, idx) => {
                const barRatio = (idx + 0.5) / waveformBars.length;
                const isPlayed = barRatio <= progressRatio;
                const isHoverSeek =
                  hoverRatio !== null &&
                  ((hoverRatio >= progressRatio &&
                    barRatio > progressRatio &&
                    barRatio <= hoverRatio) ||
                    (hoverRatio < progressRatio &&
                      barRatio >= hoverRatio &&
                      barRatio <= progressRatio));

                const barHeight = Math.max(2, amp * 14);

                let barBg = currentTheme.waveformUnplayedTop;
                let boxShadow = undefined;
                if (isPlayed) {
                  barBg = currentTheme.waveformPlayedTop;
                  if (currentTheme.waveformGlow) {
                    boxShadow = `0 0 4px ${currentTheme.accentGlow}`;
                  }
                } else if (isHoverSeek) {
                  barBg = currentTheme.secondary;
                }

                return (
                  <div
                    key={`np-top-${idx}`}
                    className="flex-1 max-w-[2.5px] rounded-t-xs transition-colors duration-75"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: barBg,
                      boxShadow: boxShadow,
                    }}
                  />
                );
              })}
            </div>

            {/* 1px Baseline Divider */}
            <div className="w-full h-[1px] bg-neutral-700/80 my-[0.5px] relative">
              <div
                className="h-full"
                style={{
                  width: `${progressRatio * 100}%`,
                  backgroundColor: currentTheme.primary,
                }}
              />
            </div>

            {/* Bottom Reflection Bars (30% height) */}
            <div className="w-full h-1.5 flex items-start justify-between gap-[1.5px]">
              {waveformBars.map((amp, idx) => {
                const barRatio = (idx + 0.5) / waveformBars.length;
                const isPlayed = barRatio <= progressRatio;
                const isHoverSeek =
                  hoverRatio !== null &&
                  ((hoverRatio >= progressRatio &&
                    barRatio > progressRatio &&
                    barRatio <= hoverRatio) ||
                    (hoverRatio < progressRatio &&
                      barRatio >= hoverRatio &&
                      barRatio <= progressRatio));

                const barHeight = Math.max(1, amp * 6);

                let barBg = currentTheme.waveformUnplayedBot;
                if (isPlayed) {
                  barBg = currentTheme.waveformPlayedBot;
                } else if (isHoverSeek) {
                  barBg = currentTheme.waveformPlayedTop;
                }

                return (
                  <div
                    key={`np-bot-${idx}`}
                    className="flex-1 max-w-[2.5px] rounded-b-xs transition-colors duration-75"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: barBg,
                    }}
                  />
                );
              })}
            </div>

            {/* Hover Tooltip Timestamp */}
            {isHoveringSeek && hoverRatio !== null && (
              <div
                className="absolute -top-7 pointer-events-none z-30 transform -translate-x-1/2"
                style={{ left: `${hoverRatio * 100}%` }}
              >
                <div
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-xl whitespace-nowrap border"
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

            {/* Vertical White/Amber Playhead Indicator */}
            <div
              className="absolute top-0 bottom-0 w-[1.5px] bg-white pointer-events-none z-20"
              style={{
                left: `${progressRatio * 100}%`,
                boxShadow: `0 0 6px ${currentTheme.primary}`,
              }}
            >
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: currentTheme.primary }}
              />
            </div>
          </div>

          <span className="w-10 text-neutral-400 font-medium text-xs">
            {currentTrack.duration || formatTime(safeDuration)}
          </span>
        </div>
      </div>

      {/* Right: DAC Output Engine, Queue Icon (to the left of volume), Volume Adjuster */}
      <div className="relative z-10 flex items-center gap-3 sm:gap-4 text-xs text-neutral-400 min-w-[190px] justify-end">
        {/* WASAPI / Audio Sink Status Badge */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-[#101622] border border-neutral-800 rounded text-neutral-300 font-mono text-[11px]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-amber-300 font-semibold">
            {spectrumAvailable ? 'Web Audio FFT' : 'Native output · spectrum unavailable'}
          </span>
        </div>

        {/* Queue Icon Button (to the left of the volume adjuster) */}
        <button
          id="now-playing-queue-toggle-btn"
          type="button"
          onClick={onToggleQueue}
          className="relative p-2 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/70 transition-colors cursor-pointer flex items-center justify-center"
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
            onClick={toggleMute}
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
              changeVolume(Number(e.target.value));
            }}
            className="w-16 sm:w-20 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* Fullscreen Expand Icon Button */}
        <button
          id="now-playing-fullscreen-btn"
          type="button"
          onClick={onExpandFullscreen}
          className="p-2 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/70 transition-colors cursor-pointer flex items-center justify-center"
          title="Expand Fullscreen View"
          aria-label="Expand Fullscreen View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </footer>
  );
};
