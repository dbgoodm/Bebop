import React, { useState, useEffect, useRef } from 'react';
import {
  Minimize2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Disc3,
  ListMusic,
  ChevronDown,
} from 'lucide-react';
import { TrackItem } from '@/types';
import { MonstercatVisualizer } from '@/components/organisms/MonstercatVisualizer';
import { WaveformScrubber } from '@/components/organisms/WaveformScrubber';
import { getLyricsForTrack } from '@/services/lyricsData';
import { useTheme } from '@/services/themeService';

interface FullscreenNowPlayingProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  currentTimeSeconds: number;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  queue: TrackItem[];
  onPlayQueueTrack: (track: TrackItem) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (volume: number) => void | Promise<void>;
  onToggleMute?: () => void | Promise<void>;
  volumeLocked?: boolean;
  onUnlockVolume?: () => void | Promise<unknown>;
  spectrumAvailable?: boolean;
  frequencyDataProvider?: (outputArray: Uint8Array) => Uint8Array;
}

export const FullscreenNowPlaying: React.FC<FullscreenNowPlayingProps> = ({
  isOpen,
  onClose,
  currentTrack,
  isPlaying,
  currentTimeSeconds,
  onPlayPause,
  onPrev,
  onNext,
  onSeek,
  queue,
  onPlayQueueTrack,
  onSelectArtist,
  onSelectAlbum,
  volume: controlledVolume,
  muted: controlledMuted,
  onVolumeChange,
  onToggleMute,
  volumeLocked = false,
  onUnlockVolume,
  spectrumAvailable = true,
  frequencyDataProvider,
}) => {
  const { currentTheme } = useTheme();
  const [localVolume, setLocalVolume] = useState(85);
  const [localMuted, setLocalMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const lyrics = currentTrack ? getLyricsForTrack(currentTrack.title) : [];

  // Find active lyric line based on currentTimeSeconds
  let activeLyricIndex = 0;
  if (lyrics.length > 0) {
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTimeSeconds >= lyrics[i].time) {
        activeLyricIndex = i;
      }
    }
  }

  // Auto-scroll lyrics to keep active line centered
  useEffect(() => {
    if (!isOpen || !lyricsContainerRef.current) return;
    const activeEl = lyricsContainerRef.current.querySelector(
      `[data-lyric-index="${activeLyricIndex}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isOpen, activeLyricIndex]);

  if (!isOpen || !currentTrack) return null;

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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTimeSeconds / (currentTrack.durationSeconds || 1)) * 100),
  );

  return (
    <div
      id="fullscreen-now-playing-container"
      className="fixed inset-0 z-50 bg-[#06080d] text-white flex flex-col font-sans select-none overflow-y-auto overflow-x-hidden animate-fadeIn"
    >
      {/* Dynamic Blown Up and Blurred Album Art Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {currentTrack.coverUrl ? (
          <img
            key={currentTrack.id}
            src={currentTrack.coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-35 brightness-75 transition-all duration-1000 ease-in-out"
          />
        ) : (
          <div className="absolute inset-0 bg-[#0c1018]" />
        )}
        {/* Dark Vignette and Ambient Gradient Overlays for High Contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080d] via-[#06080d]/80 to-[#06080d]/85" />
        <div className="absolute inset-0 bg-radial from-transparent via-[#06080d]/50 to-[#06080d]/90" />
      </div>

      {/* Top Header Rail - Full Window Width */}
      <header className="relative z-10 w-full px-6 sm:px-10 lg:px-14 xl:px-18 2xl:px-24 py-4 flex items-center justify-between border-b border-neutral-800/60 bg-[#090b10]/60 backdrop-blur-md">
        {/* Left Branding */}
        <div className="flex items-center gap-2.5 text-sm tracking-wide">
          <span className="text-[#f59e0b] font-bold tracking-wider">BEBOP</span>
          <span className="text-neutral-500 font-light">//</span>
          <span className="text-neutral-200 tracking-wider text-xs font-semibold uppercase">
            Now Playing
          </span>
        </div>

        {/* Center: Clean Format Tag */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-neutral-400">
          <span className="text-neutral-500">FORMAT:</span>
          <span className="text-amber-400 font-semibold">
            {currentTrack.codec} {currentTrack.sampleRate}
          </span>
        </div>

        {/* Right: Exit Fullscreen Button */}
        <button
          id="btn-exit-fullscreen"
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-300 hover:text-white transition-all cursor-pointer text-xs font-sans shadow-sm"
          title="Exit Fullscreen (Esc)"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Exit Fullscreen</span>
        </button>
      </header>

      {/* Main 3-Column Content Layout */}
      <main className="relative z-10 flex-1 w-full px-6 sm:px-10 lg:px-14 xl:px-18 2xl:px-24 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-center">
        {/* Left Section: Vinyl Jacket, Extended Sliding Vinyl Record & Track Metadata (cols 1..5) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center gap-6">
          {/* Vinyl Composition Container with ample width to show ~60% of vinyl */}
          <div className="relative w-full max-w-[420px] sm:max-w-[480px] lg:max-w-[520px] aspect-[1.35/1] flex items-center justify-start pl-2">
            {/* Spinning Vinyl Record (Sliding out significantly to reveal grooves and center label) */}
            <div
              className={`absolute top-0 left-0 w-[72%] aspect-square rounded-full shadow-[0_25px_60px_rgba(0,0,0,0.95)] transition-all duration-700 ${
                isPlaying
                  ? 'translate-x-28 sm:translate-x-36 md:translate-x-44 lg:translate-x-52 xl:translate-x-56 rotate-12 scale-100'
                  : 'translate-x-20 sm:translate-x-28 md:translate-x-36 scale-95 opacity-90'
              }`}
              style={{
                background:
                  'radial-gradient(circle, #080808 0%, #171717 18%, #060606 36%, #1c1c1c 50%, #080808 65%, #1f1f1f 80%, #050505 100%)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.95), inset 0 0 15px rgba(255,255,255,0.08)',
              }}
            >
              {/* Spinning container */}
              <div
                className={`w-full h-full rounded-full relative flex items-center justify-center ${
                  isPlaying ? 'animate-[spin_7s_linear_infinite]' : ''
                }`}
              >
                {/* Authentic Vinyl Grooves Rings */}
                <div className="absolute inset-2 sm:inset-3 rounded-full border border-neutral-800/80 pointer-events-none" />
                <div className="absolute inset-5 sm:inset-7 rounded-full border border-neutral-800/50 pointer-events-none" />
                <div className="absolute inset-8 sm:inset-11 rounded-full border border-neutral-800/60 pointer-events-none" />
                <div className="absolute inset-12 sm:inset-16 rounded-full border border-neutral-800/40 pointer-events-none" />
                <div className="absolute inset-16 sm:inset-20 rounded-full border border-neutral-800/50 pointer-events-none" />
                <div className="absolute inset-20 sm:inset-26 rounded-full border border-neutral-800/40 pointer-events-none" />

                {/* Vinyl Light Sheen (Conic Specular Reflections) */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none opacity-30"
                  style={{
                    background:
                      'conic-gradient(from 30deg, transparent 0deg, rgba(255,255,255,0.4) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.4) 225deg, transparent 270deg)',
                  }}
                />

                {/* Center Vinyl Label */}
                <div className="w-24 sm:w-28 md:w-32 h-24 sm:h-28 md:h-32 rounded-full overflow-hidden border-2 border-neutral-900 shadow-inner relative flex items-center justify-center bg-neutral-950">
                  {currentTrack.coverUrl ? (
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover scale-125"
                    />
                  ) : (
                    <Disc3 className="w-12 h-12 text-amber-500" />
                  )}
                  {/* Spindle hole */}
                  <div className="absolute w-3.5 h-3.5 rounded-full bg-black border border-neutral-600 shadow-inner z-10" />
                </div>
              </div>
            </div>

            {/* Album Cover Jacket (Front Square) */}
            <div
              id="album-jacket"
              className="relative z-10 w-[72%] aspect-square rounded-sm overflow-hidden bg-neutral-900 border border-neutral-700/60 shadow-[0_20px_50px_rgba(0,0,0,0.95)] cursor-pointer group"
              onClick={() => {
                if (currentTrack.album) onSelectAlbum?.(currentTrack.album);
              }}
              title={`View Album: ${currentTrack.album}`}
            >
              {currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.album}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-neutral-950">
                  <Disc3 className="w-16 h-16" />
                </div>
              )}
              {/* Vinyl spine reflection highlight */}
              <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-white/20 to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Track Title, Artist and Album listed side by side */}
          <div className="w-full text-center lg:text-left flex flex-col gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
              {currentTrack.title}
            </h2>

            {/* Artist and Album listed together with dot separator */}
            <div className="flex items-center justify-center lg:justify-start gap-2 text-sm sm:text-base text-neutral-300 font-medium flex-wrap">
              <button
                type="button"
                onClick={() => onSelectArtist?.(currentTrack.artist)}
                className="text-neutral-200 hover:text-[#f59e0b] hover:underline transition-colors cursor-pointer"
              >
                {currentTrack.artist}
              </button>
              {currentTrack.album && (
                <>
                  <span className="text-neutral-500 select-none">•</span>
                  <button
                    type="button"
                    onClick={() => onSelectAlbum?.(currentTrack.album)}
                    className="text-neutral-400 hover:text-[#f59e0b] hover:underline transition-colors cursor-pointer"
                  >
                    {currentTrack.album} {currentTrack.year ? `(${currentTrack.year})` : ''}
                  </button>
                </>
              )}
            </div>

            {/* Audiophile format badges */}
            <div className="flex items-center justify-center lg:justify-start gap-2 mt-1 flex-wrap">
              <span className="px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-mono font-semibold">
                {currentTrack.codec} {currentTrack.sampleRate}
              </span>
              {currentTrack.dynamicRange && (
                <span className="px-2.5 py-0.5 rounded bg-neutral-900/90 text-neutral-300 border border-neutral-800 text-xs font-mono">
                  {currentTrack.dynamicRange}
                </span>
              )}
              {currentTrack.bitrate && (
                <span className="px-2.5 py-0.5 rounded bg-neutral-900/90 text-neutral-400 border border-neutral-800 text-xs font-mono hidden sm:inline">
                  {currentTrack.bitrate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Middle Section: Lyrics Card (cols 6..8 / span 4) */}
        <div className="lg:col-span-4 h-[480px] lg:h-[540px] xl:h-[580px] 2xl:h-[620px] bg-[#11131a]/85 border border-[#222634] rounded-2xl p-6 lg:p-7 flex flex-col shadow-2xl relative overflow-hidden backdrop-blur-md">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-neutral-800/80">
            <h3 className="text-base font-medium text-white tracking-wide">Lyrics</h3>
            <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
              Synchronized
            </span>
          </div>

          {/* Lyrics Stream */}
          <div
            ref={lyricsContainerRef}
            className="flex-1 overflow-y-auto pr-2 space-y-3.5 text-left scroll-smooth pt-3"
          >
            {lyrics.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              const isPast = idx < activeLyricIndex;
              return (
                <p
                  key={idx}
                  data-lyric-index={idx}
                  onClick={() => onSeek(line.time)}
                  className={`text-sm sm:text-base leading-relaxed transition-all duration-300 cursor-pointer select-none ${
                    isActive
                      ? 'text-[#f59e0b] font-semibold text-base sm:text-lg'
                      : isPast
                        ? 'text-neutral-400 font-normal opacity-70 hover:opacity-100'
                        : 'text-neutral-400 font-normal opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    textShadow: isActive ? '0 0 12px rgba(245, 158, 11, 0.45)' : 'none',
                  }}
                >
                  {line.text}
                </p>
              );
            })}
          </div>

          {/* Bottom Down Chevron Scroll Hint */}
          <div className="pt-2 flex justify-center text-neutral-500">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>

        {/* Right Section: Up Next Queue Card (cols 9..12 / span 3) */}
        <div className="lg:col-span-3 h-[480px] lg:h-[540px] xl:h-[580px] 2xl:h-[620px] bg-[#11131a]/85 border border-[#222634] rounded-2xl p-6 lg:p-7 flex flex-col shadow-2xl relative overflow-hidden backdrop-blur-md">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-neutral-800/80">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-amber-400" />
              <h3 className="text-base font-medium text-white tracking-wide">Queue</h3>
            </div>
            <span className="text-xs text-neutral-400 font-mono">{queue.length} tracks</span>
          </div>

          {/* Queue List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 pt-3">
            {queue.map((track, idx) => {
              const isCurrent = track.id === currentTrack.id;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  onClick={() => onPlayQueueTrack(track)}
                  className={`p-2.5 rounded-lg flex items-center gap-3 transition-colors cursor-pointer border ${
                    isCurrent
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-[#0b0e14]/90 border-neutral-800/70 hover:bg-[#121622] hover:border-neutral-700 text-neutral-300'
                  }`}
                >
                  <div className="w-9 h-9 rounded bg-neutral-900 shrink-0 overflow-hidden border border-neutral-800">
                    {track.coverUrl ? (
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600">
                        <Disc3 className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-semibold text-white truncate">{track.title}</h5>
                    <p className="text-[11px] text-neutral-400 truncate">{track.artist}</p>
                  </div>

                  <span className="text-[11px] font-mono text-neutral-500 shrink-0">
                    {track.duration}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Bottom Section: Monstercat Visualizer & Full Waveform Controls - Full Window Width */}
      <footer className="relative z-10 w-full px-6 sm:px-10 lg:px-14 xl:px-18 2xl:px-24 pb-8 flex flex-col gap-4">
        {/* Monstercat Audio Visualizer Canvas below record, lyrics, and queue */}
        <div
          id="monstercat-visualizer-container"
          className="w-full flex flex-col gap-1 items-center"
        >
          <MonstercatVisualizer
            isPlaying={spectrumAvailable && isPlaying}
            height={56}
            barWidth={4}
            barGap={3}
            color={currentTheme.visualizerPrimary}
            secondaryColor={currentTheme.visualizerSecondary}
            glowEffect={currentTheme.waveformGlow}
            autoFillWidth={true}
            frequencyDataProvider={frequencyDataProvider}
          />
        </div>

        {/* Full Waveform Scrubber Status Bar */}
        <div className="w-full">
          <WaveformScrubber
            currentTrack={currentTrack}
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={currentTrack.durationSeconds || 240}
            onSeek={onSeek}
            isPlaying={isPlaying}
            height={54}
          />
        </div>

        {/* Bottom Transport Controls Bar */}
        <div className="flex items-center justify-between text-neutral-400 pt-2">
          {/* Left spacer / format badges */}
          <div className="w-1/4 hidden sm:flex items-center gap-3 text-xs font-mono text-neutral-500">
            <span>DR: {currentTrack.dynamicRange || '14'}</span>
            <span>•</span>
            <span>{currentTrack.catalogNumber || 'BEBOP-HRA-001'}</span>
          </div>

          {/* Center Playback Buttons */}
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => setIsShuffle(!isShuffle)}
              className="transition-colors cursor-pointer"
              style={{ color: isShuffle ? currentTheme.primary : undefined }}
              aria-label="Shuffle"
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Previous Track"
              title="Previous"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={onPlayPause}
              style={{
                backgroundColor: currentTheme.primary,
                boxShadow: `0 0 16px ${currentTheme.accentGlow}`,
              }}
              className="w-12 h-12 rounded-full text-black flex items-center justify-center transition-transform hover:scale-105 cursor-pointer hover:brightness-110"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-black" />
              ) : (
                <Play className="w-5 h-5 fill-black ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Next Track"
              title="Next"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={() =>
                setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
              }
              className={`transition-colors cursor-pointer ${
                repeatMode !== 'off' ? 'text-amber-400' : 'hover:text-white'
              }`}
              aria-label="Repeat Mode"
              title="Repeat"
            >
              <Repeat className="w-4 h-4" />
            </button>
          </div>

          {/* Right Volume Controls */}
          <div className="w-1/4 flex items-center justify-end gap-3">
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
              className="w-20 sm:w-28 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>
      </footer>
    </div>
  );
};
