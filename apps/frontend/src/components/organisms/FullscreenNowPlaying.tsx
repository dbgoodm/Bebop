import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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
  Lock,
  Heart,
  Plus,
  Dna,
  Check,
  ListPlus,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { TrackItem } from '@/types';
import { PeakHoldVisualizer } from '@/components/organisms/PeakHoldVisualizer';
import { ThemeAmbience } from '@/components/atoms/ThemeAmbience';
import { visualizerStyleFromVars } from '@/services/visualizerStyle';
import { loadTrackLyrics } from '@/services/lyricsService';
import type { LyricsDocument } from '@/services/tauri-bindings';
import { useTheme } from '@/services/themeService';
import {
  listPlaylists,
  addTrackToPlaylist,
  createPlaylistWithTrack,
  type PlaylistSummary,
} from '@/services/playlistService';

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
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  repeatMode?: 'off' | 'all' | 'one';
  onToggleRepeat?: () => void;
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
  getSpectrumBins?: () => readonly number[];
  isFavorite?: boolean;
  onToggleFavorite?: (trackId: string, favorite: boolean) => void;
  onCreatePlaylistWithSeed?: (track: TrackItem) => void;
  onAddTrackToPlaylist?: (playlistId: string, trackId: string) => Promise<boolean | void>;
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
  isShuffle: controlledShuffle,
  onToggleShuffle,
  repeatMode: controlledRepeat,
  onToggleRepeat,
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
  getSpectrumBins,
  isFavorite = false,
  onToggleFavorite,
  onCreatePlaylistWithSeed,
  onAddTrackToPlaylist: customAddTrackToPlaylist,
}) => {
  const { currentTheme } = useTheme();

  // Bar width, gap, radius, fill, cap and glow from the theme's visualizer tokens.
  const visualizerStyle = useMemo(
    () => visualizerStyleFromVars(currentTheme.vars, currentTheme.visualizerPrimary),
    [currentTheme],
  );

  const [localVolume, setLocalVolume] = useState(85);
  const [localMuted, setLocalMuted] = useState(false);
  const [localShuffle, setLocalShuffle] = useState(false);
  const [localRepeat, setLocalRepeat] = useState<'off' | 'all' | 'one'>('off');
  const [lyricsDocument, setLyricsDocument] = useState<LyricsDocument | null>(null);
  const seekRef = useRef<HTMLDivElement | null>(null);
  const [isHoveringSeek, setIsHoveringSeek] = useState(false);
  const [seekHoverRatio, setSeekHoverRatio] = useState<number | null>(null);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [visualizerHeight, setVisualizerHeight] = useState(300);
  const [rpmSpeed, setRpmSpeed] = useState<33 | 45>(33);
  const [tonearmEngagement, setTonearmEngagement] = useState(0);
  const [smoothedTonearmProgress, setSmoothedTonearmProgress] = useState(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const tonearmEngagementRef = useRef(0);

  // Playlist menu in fullscreen
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [addingPlaylistId, setAddingPlaylistId] = useState<string | null>(null);
  const [addedPlaylistIds, setAddedPlaylistIds] = useState<ReadonlySet<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const playlistMenuRef = useRef<HTMLDivElement | null>(null);

  const loadUserPlaylists = useCallback(async () => {
    setIsLoadingPlaylists(true);
    try {
      const list = await listPlaylists();
      setPlaylists(list);
    } catch {
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    if (isPlaylistMenuOpen) {
      void loadUserPlaylists();
      setStatusMessage(null);
    }
  }, [isPlaylistMenuOpen, loadUserPlaylists]);

  useEffect(() => {
    if (!isPlaylistMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setIsPlaylistMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPlaylistMenuOpen]);

  const handleAddTrackToExisting = async (playlist: PlaylistSummary) => {
    if (!currentTrack) return;
    setAddingPlaylistId(playlist.id);
    try {
      if (customAddTrackToPlaylist) {
        await customAddTrackToPlaylist(playlist.id, currentTrack.id);
      } else {
        const result = await addTrackToPlaylist(playlist.id, currentTrack.id);
        if (result.alreadyExists) {
          setStatusMessage({
            text: `Already in "${playlist.name}"`,
            type: 'info',
          });
        } else {
          setStatusMessage({
            text: `Added to "${playlist.name}" ✓`,
            type: 'success',
          });
        }
      }
      setAddedPlaylistIds((prev) => new Set([...prev, playlist.id]));
      await loadUserPlaylists();
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'Failed to add to playlist',
        type: 'error',
      });
    } finally {
      setAddingPlaylistId(null);
    }
  };

  const handleCreateNewPlaylist = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentTrack || !newPlaylistName.trim() || isCreatingPlaylist) return;
    const trimmed = newPlaylistName.trim();
    setIsCreatingPlaylist(true);
    try {
      const created = await createPlaylistWithTrack(trimmed, currentTrack.id);
      setNewPlaylistName('');
      setStatusMessage({
        text: `Created "${created.name}" & added track ✓`,
        type: 'success',
      });
      setAddedPlaylistIds((prev) => new Set([...prev, created.id]));
      await loadUserPlaylists();
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'Failed to create playlist',
        type: 'error',
      });
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const handleCreateWithGenerator = () => {
    if (!currentTrack) return;
    setIsPlaylistMenuOpen(false);
    onClose();
    onCreatePlaylistWithSeed?.(currentTrack);
  };

  const isShuffle = controlledShuffle ?? localShuffle;
  const repeatMode = controlledRepeat ?? localRepeat;

  const displayQueue = useMemo(() => {
    if (queue.length <= 60) return queue;
    const currentIndex = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const start = Math.max(0, safeCurrentIndex - 10);
    const end = Math.min(queue.length, safeCurrentIndex + 50);
    return queue.slice(start, end);
  }, [queue, currentTrack?.id]);

  const toggleShuffle = () => {
    if (onToggleShuffle) onToggleShuffle();
    else setLocalShuffle((prev) => !prev);
  };

  const toggleRepeat = () => {
    if (onToggleRepeat) onToggleRepeat();
    else setLocalRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  };

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

  // Load lyrics for the active track
  useEffect(() => {
    if (!isOpen || !currentTrack) return;
    let active = true;
    setLyricsDocument(null);
    void loadTrackLyrics(currentTrack.id)
      .then((document) => {
        if (active) setLyricsDocument(document);
      })
      .catch(() => {
        if (active) {
          setLyricsDocument({
            lines: [],
            source: 'unavailable',
            sourceUrl: null,
            synchronized: false,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [currentTrack?.id, isOpen]);

  const lyrics = lyricsDocument?.lines ?? [];

  // Find active lyric line based on currentTimeSeconds
  let activeLyricIndex = 0;
  if (lyrics.length > 0) {
    for (let i = 0; i < lyrics.length; i++) {
      const timeMs = lyrics[i].timeMs;
      if (timeMs !== null && currentTimeSeconds >= timeMs / 1_000) {
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

  // Sizes the spectrum bed to the viewport
  useEffect(() => {
    if (!isOpen) return;
    const measure = () => setVisualizerHeight(Math.round(Math.min(window.innerHeight * 0.32, 320)));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isOpen]);

  // Lower/lift the arm with a brief mechanical motion instead of snapping.
  useEffect(() => {
    const target = isOpen && currentTrack && isPlaying ? 1 : 0;
    const start = tonearmEngagementRef.current;
    const startTime = performance.now();
    const duration = 650;
    let frameId = 0;

    const animate = (now: number) => {
      const elapsed = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - elapsed) ** 3;
      const next = start + (target - start) * eased;
      tonearmEngagementRef.current = next;
      setTonearmEngagement(next);
      if (elapsed < 1) frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [currentTrack?.id, isOpen, isPlaying]);

  // Native progress updates arrive in discrete steps. Interpolate between them
  // so the stylus has a continuous, slow sweep across the record.
  useEffect(() => {
    if (!isOpen || !currentTrack) {
      setSmoothedTonearmProgress(0);
      return;
    }

    const duration = currentTrack.durationSeconds || 240;
    const startingProgress = Math.max(0, Math.min(1, currentTimeSeconds / duration));
    if (!isPlaying) {
      setSmoothedTonearmProgress(startingProgress);
      return;
    }

    const startTime = performance.now();
    let frameId = 0;
    const animate = (now: number) => {
      const next = Math.min(1, startingProgress + (now - startTime) / (duration * 1_000));
      setSmoothedTonearmProgress(next);
      if (next < 1) frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [currentTrack?.durationSeconds, currentTrack?.id, currentTimeSeconds, isOpen, isPlaying]);

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

  const seekRatio = Math.max(
    0,
    Math.min(1, currentTimeSeconds / (currentTrack?.durationSeconds || 240)),
  );

  // Park the arm off the platter while idle. During playback the stylus starts
  // at the outer right groove and travels toward the label, like a real record.
  const tonearmAngle = -55 + tonearmEngagement * 55;
  const tonearmProgress = smoothedTonearmProgress * tonearmEngagement;
  const tonearmHeadX = 89 - tonearmProgress * 14;
  const tonearmHeadY = 92 + tonearmProgress * 43;

  const seekRatioFrom = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!seekRef.current) return 0;
    const rect = seekRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };

  const handleSeekPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const ratio = seekRatioFrom(event);
    setIsDraggingSeek(true);
    onSeek?.(ratio * (currentTrack?.durationSeconds || 240));
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleSeekPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const ratio = seekRatioFrom(event);
    setSeekHoverRatio(ratio);
    if (isDraggingSeek) onSeek?.(ratio * (currentTrack?.durationSeconds || 240));
  };

  const handleSeekPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingSeek(false);
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released.
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Determine theme signature stamp quote
  const themeStampText = currentTheme.id.includes('space-cowboy')
    ? 'SEE YOU SPACE COWBOY...'
    : currentTheme.id.includes('queen-of-hearts')
      ? 'DEBT: 6,000,000 W // ♠ ♥ ♦ ♣'
      : currentTheme.id.includes('radical')
        ? 'ED-NET // ( ^ _ ^ ) // TERMINAL-01'
        : currentTheme.id.includes('black-dog')
          ? 'ISSP BOUNTY ARCHIVE // BEBOP-02'
          : currentTheme.id.includes('poster')
            ? 'SEE YOU SPACE COWBOY'
            : `${currentTheme.name} // HIGH-FIDELITY SESSION`;

  const isHiRes =
    (currentTrack.sampleRate &&
      (currentTrack.sampleRate.includes('96') ||
        currentTrack.sampleRate.includes('192') ||
        currentTrack.sampleRate.includes('88') ||
        currentTrack.sampleRate.includes('176') ||
        currentTrack.sampleRate.includes('24-bit') ||
        currentTrack.sampleRate.includes('24/'))) ||
    currentTrack.codec?.toUpperCase().includes('DSD') ||
    currentTrack.codec?.toUpperCase().includes('FLAC');

  return (
    <div
      id="fullscreen-now-playing-container"
      style={{
        background: currentTheme.bgCanvasGradient || currentTheme.bgCanvas,
        backgroundColor: currentTheme.bgCanvas,
        color: currentTheme.textPrimary,
        fontFamily: 'var(--f-b, inherit)',
        cursor: 'var(--cursor, auto)',
      }}
      className="win-round fixed inset-0 z-50 flex flex-col justify-between select-none overflow-hidden h-screen max-h-screen animate-fadeIn"
    >
      {/* 1. Theme Ambience Layer: Starfield, Smoke, Ship, Planet, Contrails, Scanlines, Glitch */}
      <ThemeAmbience />

      {/* 2. Dynamic Blown Up Album Art with Soft Natural Vignette */}
      {currentTrack.coverUrl ? (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <img
            key={currentTrack.id}
            src={currentTrack.coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-20 brightness-75 transition-all duration-1000 ease-in-out"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 45%, transparent 20%, rgba(0,0,0,0.6) 100%)',
            }}
          />
        </div>
      ) : null}

      {/* 3. Thematic Character Stamp / Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-24 right-6 lg:right-14 z-0 select-none hidden md:block"
        style={{
          opacity: 'var(--op-stamp, 0.08)',
          transform: 'rotate(var(--stamp-rot, -3deg))',
          fontFamily: "var(--f-stamp, var(--f-d, 'Big Shoulders Display', sans-serif))",
          color: 'var(--stamp-col, var(--c-p, currentColor))',
          letterSpacing: '0.12em',
        }}
      >
        <div
          className="border-2 px-4 py-2 text-xl lg:text-2xl font-black uppercase tracking-widest leading-none shadow-sm"
          style={{ borderColor: 'currentColor' }}
        >
          {themeStampText}
        </div>
      </div>

      {/* 4. Thematic Floating Card Suit Pips for Faye / Casino themes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        style={{ opacity: 'var(--op-pip, 0)' }}
      >
        <span className="absolute top-[16%] left-[6%] text-6xl text-[var(--pip-col,#e0344e)] opacity-25 select-none font-serif">
          ♠
        </span>
        <span className="absolute top-[68%] left-[20%] text-5xl text-[var(--pip-col,#e0344e)] opacity-20 select-none font-serif">
          ♥
        </span>
        <span className="absolute top-[26%] right-[12%] text-6xl text-[var(--pip-col,#e0344e)] opacity-20 select-none font-serif">
          ♦
        </span>
        <span className="absolute bottom-[22%] right-[28%] text-5xl text-[var(--pip-col,#e0344e)] opacity-25 select-none font-serif">
          ♣
        </span>
      </div>

      {/* 5. Thematic Hacker Scrawl / ASCII for Radical Edward themes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-18 left-8 z-0 font-mono text-xs tracking-widest select-none hidden xl:block"
        style={{
          opacity: 'var(--op-scrawl, 0)',
          color: currentTheme.primary,
        }}
      >
        <pre className="opacity-40 leading-tight font-mono">
          {`  /\\_/\\   ED-NET
 ( o.o )  ONLINE
  > ^ <   [ACTIVE]`}
        </pre>
      </div>

      {/* Top Header Rail */}
      <header
        data-tauri-drag-region
        className="relative z-20 w-full px-6 sm:px-10 lg:px-14 xl:px-18 2xl:px-24 py-3 sm:py-3.5 flex items-center justify-between border-b backdrop-blur-md transition-colors shrink-0"
        style={{
          backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 80%, transparent)`,
          borderColor: currentTheme.borderColor,
        }}
      >
        {/* Left Branding */}
        <div className="flex items-center gap-2.5 text-sm tracking-wide">
          <span
            className="font-bold tracking-wider t-heading text-base sm:text-lg"
            style={{
              color: currentTheme.primary,
              textShadow: `0 0 16px ${currentTheme.accentGlow}`,
            }}
          >
            BEBOP
          </span>
          <span className="text-neutral-500 font-light">//</span>
          <span
            className="tracking-wider text-xs font-semibold uppercase opacity-85"
            style={{ color: currentTheme.textSecondary }}
          >
            Now Playing
          </span>
        </div>

        {/* Center: Audio Format Tag with Hi-Res Badge */}
        <div
          className="flex items-center gap-2 text-xs font-mono px-3 py-1 t-sm border transition-colors"
          style={{
            backgroundColor: `color-mix(in oklab, ${currentTheme.bgSurface} 60%, transparent)`,
            borderColor: currentTheme.borderColor,
            color: currentTheme.textSecondary,
          }}
        >
          <span className="opacity-60">FORMAT:</span>
          <span className="font-semibold" style={{ color: currentTheme.primary }}>
            {currentTrack.codec} {currentTrack.sampleRate}
          </span>
          {isHiRes && (
            <span
              className="px-1.5 py-0.2 t-sm text-[10px] font-bold tracking-wider uppercase ml-1"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 22%, transparent)',
                color: currentTheme.primary,
                border: `1px solid color-mix(in oklab, var(--c-p, #f59e0b) 45%, transparent)`,
              }}
            >
              HI-RES
            </span>
          )}
        </div>

        {/* Right: Exit Fullscreen Button */}
        <div className="flex items-center">
          <button
            id="btn-exit-fullscreen"
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 90%, transparent)`,
              borderColor: currentTheme.borderColor,
              color: currentTheme.textSecondary,
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 t-control border hover:text-white transition-all cursor-pointer text-xs font-sans shadow-sm hover:border-[var(--c-p)]"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5" style={{ color: currentTheme.primary }} />
            <span>Exit Fullscreen</span>
          </button>
          <div aria-hidden="true" className="shrink-0" style={{ width: 'var(--wc-gutter, 0px)' }} />
        </div>
      </header>

      {/* Main 3-Column Content Layout (Vertically Centered in Viewport, Balanced Width & Height) */}
      <main className="relative z-10 flex-1 min-h-0 w-full px-6 sm:px-10 lg:px-12 xl:px-16 2xl:px-20 flex items-center justify-center overflow-hidden py-2">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 xl:gap-10 items-center max-w-[1720px] mx-auto">
          {/* Left Section: Vinyl Deck, Animated Tonearm, Album Jacket & Track Metadata (cols 1..5) */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start justify-center gap-3 min-h-0">
            {/* Turntable Deck Container */}
            <div className="relative w-full max-w-[340px] sm:max-w-[390px] lg:max-w-[425px] xl:max-w-[460px] aspect-[1.32/1] flex items-center justify-start pl-1">
              {/* Spinning Vinyl Record */}
              <div
                onClick={onPlayPause}
                className={`absolute top-0 left-0 w-[78%] aspect-square rounded-full translate-x-28 sm:translate-x-36 lg:translate-x-48 xl:translate-x-60 transition-all duration-700 cursor-pointer ${
                  isPlaying ? 'rotate-12 scale-100' : 'opacity-90'
                }`}
                style={{
                  background:
                    'radial-gradient(circle, #080808 0%, #171717 18%, #060606 36%, #1c1c1c 50%, #080808 65%, #1f1f1f 80%, #050505 100%)',
                  boxShadow: isPlaying
                    ? `0 25px 60px rgba(0,0,0,0.95), 0 0 35px ${currentTheme.accentGlow}, inset 0 0 15px rgba(255,255,255,0.08)`
                    : '0 25px 60px rgba(0,0,0,0.95), inset 0 0 15px rgba(255,255,255,0.08)',
                }}
                title={isPlaying ? 'Click vinyl to pause' : 'Click vinyl to play'}
              >
                {/* Spinning container with selectable RPM speed */}
                <div
                  className="w-full h-full rounded-full relative flex items-center justify-center"
                  style={{
                    animation: isPlaying
                      ? `spin ${rpmSpeed === 33 ? '7s' : '4.5s'} linear infinite`
                      : 'none',
                  }}
                >
                  {/* Vinyl Grooves Rings */}
                  <div className="absolute inset-2 sm:inset-2.5 rounded-full border border-neutral-800/80 pointer-events-none" />
                  <div className="absolute inset-4 sm:inset-5 rounded-full border border-neutral-800/50 pointer-events-none" />
                  <div className="absolute inset-7 sm:inset-8 rounded-full border border-neutral-800/60 pointer-events-none" />
                  <div className="absolute inset-10 sm:inset-12 rounded-full border border-neutral-800/40 pointer-events-none" />
                  <div className="absolute inset-13 sm:inset-16 rounded-full border border-neutral-800/50 pointer-events-none" />

                  {/* Vinyl Light Sheen (Conic Specular Reflections) */}
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none opacity-30"
                    style={{
                      background:
                        'conic-gradient(from 30deg, transparent 0deg, rgba(255,255,255,0.4) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.4) 225deg, transparent 270deg)',
                    }}
                  />

                  {/* Center Vintage Audiophile Vinyl Label */}
                  <div
                    className="w-20 sm:w-24 md:w-26 h-20 sm:h-24 md:h-26 rounded-full overflow-hidden border-2 shadow-inner relative flex flex-col items-center justify-center p-1.5 text-center select-none"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 90%, black)`,
                      borderColor: currentTheme.primary,
                    }}
                  >
                    {/* Outer accent ring */}
                    <div
                      className="absolute inset-1 rounded-full border border-dashed opacity-50 pointer-events-none"
                      style={{ borderColor: currentTheme.primary }}
                    />

                    {currentTrack.coverUrl ? (
                      <img
                        src={currentTrack.coverUrl}
                        alt={currentTrack.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover scale-125 opacity-85"
                      />
                    ) : (
                      <Disc3 className="w-8 h-8" style={{ color: currentTheme.primary }} />
                    )}

                    {/* Label overlay branding */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-between py-1 px-1 text-[7px] sm:text-[8px] font-mono pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.85) 100%)',
                        color: currentTheme.primary,
                      }}
                    >
                      <span className="font-bold tracking-widest uppercase text-[6.5px] sm:text-[7.5px]">
                        BEBOP STEREO
                      </span>
                      <span className="truncate max-w-[85%] font-semibold text-white text-[8px] sm:text-[9px]">
                        {currentTrack.title}
                      </span>
                      <span className="opacity-75 text-[6.5px]">
                        {rpmSpeed === 33 ? '33⅓ RPM' : '45 RPM'}
                      </span>
                    </div>

                    {/* Spindle hole with metallic inner ring */}
                    <div
                      className="absolute w-3.5 h-3.5 rounded-full bg-black border-2 shadow-inner z-10"
                      style={{ borderColor: currentTheme.primary }}
                    />
                  </div>
                </div>
              </div>

              {/* Realistic Animated Turntable Tonearm */}
              <div
                aria-hidden="true"
                data-testid="turntable-tonearm"
                className="absolute -top-[4%] -right-[20%] w-[30%] aspect-[2/3] pointer-events-none z-20 hidden sm:block"
              >
                <svg
                  viewBox="0 0 120 180"
                  className="w-full h-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
                >
                  {/* Tonearm Base & Pivot */}
                  <circle cx="95" cy="25" r="14" fill="#1b1d24" stroke="#383d4c" strokeWidth="2" />
                  <circle
                    cx="95"
                    cy="25"
                    r="9"
                    fill="#2a2e3d"
                    stroke={currentTheme.primary}
                    strokeWidth="1.5"
                  />
                  <circle cx="95" cy="25" r="3.5" fill="#0c0e14" />

                  <g
                    data-testid="turntable-tonearm-arm"
                    data-tonearm-target={isPlaying ? 'playing' : 'parked'}
                    transform={`rotate(${tonearmAngle} 95 25)`}
                    style={{ transition: 'transform 700ms ease-out' }}
                  >
                    {/* Counterweight */}
                    <rect
                      x="87"
                      y="4"
                      width="16"
                      height="10"
                      rx="2.5"
                      fill="#444b5e"
                      stroke="#202430"
                      strokeWidth="1"
                    />

                    {/* Curved Metallic Arm */}
                    <path
                      d={`M 95 35 Q 91 64 ${tonearmHeadX + 5} ${tonearmHeadY + 5}`}
                      fill="none"
                      stroke="url(#tonearm-metal-grad)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />

                    {/* Cartridge & Headshell */}
                    <g
                      data-testid="turntable-tonearm-headshell"
                      transform={`translate(${tonearmHeadX}, ${tonearmHeadY})`}
                    >
                      <rect
                        x="-5"
                        y="0"
                        width="10"
                        height="18"
                        rx="1.5"
                        fill="#151821"
                        stroke={currentTheme.primary}
                        strokeWidth="1.5"
                      />
                      {/* Stylus needle tip with active theme accent */}
                      <polygon
                        points="0,18 -2,24 2,24"
                        fill={isPlaying ? currentTheme.primary : '#888888'}
                      />
                    </g>
                  </g>

                  <defs>
                    <linearGradient id="tonearm-metal-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#f3f4f6" />
                      <stop offset="50%" stopColor="#9ca3af" />
                      <stop offset="100%" stopColor="#4b5563" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Album Cover Jacket (Front Square) */}
              <div
                id="album-jacket"
                className="relative z-10 w-[78%] aspect-square t-card t-stroke overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.95)] cursor-pointer group transition-all"
                style={{
                  backgroundColor: currentTheme.bgCard,
                  borderColor: currentTheme.borderColor,
                }}
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
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: currentTheme.bgSurface }}
                  >
                    <Disc3 className="w-14 h-14" style={{ color: currentTheme.primary }} />
                  </div>
                )}
                {/* Vinyl spine reflection highlight */}
                <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-white/20 to-transparent pointer-events-none" />
              </div>
            </div>

            {/* Turntable Speed / RPM & Hi-Fi Controls Bar */}
            <div className="flex items-center justify-between w-full max-w-[340px] sm:max-w-[390px] lg:max-w-[425px] xl:max-w-[460px] px-1 text-xs font-mono">
              {/* RPM Speed Selector */}
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 t-sm border text-[11px]"
                style={{
                  backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 85%, transparent)`,
                  borderColor: currentTheme.borderColor,
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    isPlaying ? 'animate-pulse' : 'opacity-40'
                  }`}
                  style={{
                    backgroundColor: currentTheme.primary,
                    boxShadow: isPlaying ? `0 0 8px ${currentTheme.accentGlow}` : 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setRpmSpeed((prev) => (prev === 33 ? 45 : 33))}
                  className="hover:underline transition-colors cursor-pointer font-bold"
                  style={{ color: currentTheme.primary }}
                  title="Toggle Turntable Speed (33⅓ vs 45 RPM)"
                >
                  {rpmSpeed === 33 ? '33⅓ RPM' : '45 RPM'}
                </button>
              </div>

              {/* Audiophile Hi-Fi Status */}
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 t-sm border text-[10px]"
                style={{
                  backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 85%, transparent)`,
                  borderColor: currentTheme.borderColor,
                  color: currentTheme.textSecondary,
                }}
              >
                <span className="opacity-60">DECK:</span>
                <span className="font-semibold" style={{ color: currentTheme.primary }}>
                  {isPlaying ? 'ROTATING' : 'IDLE'}
                </span>
              </div>
            </div>

            {/* Track Title, Artist and Album */}
            <div className="w-full text-center lg:text-left flex flex-col gap-1 max-w-[340px] sm:max-w-[390px] lg:max-w-[425px] xl:max-w-[460px]">
              <div className="flex items-center justify-between gap-2">
                <h2
                  className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight leading-tight t-heading truncate max-w-full flex-1"
                  style={{
                    color: currentTheme.textPrimary,
                    fontFamily: "var(--f-d, 'Big Shoulders Display', sans-serif)",
                    letterSpacing: 'var(--ls-d, 0.03em)',
                    fontWeight: 'var(--w-d, 800)',
                  }}
                >
                  {currentTrack.title}
                </h2>

                {/* Song Actions: Like & Add to Playlist */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    id="fullscreen-like-btn"
                    type="button"
                    onClick={() => onToggleFavorite?.(currentTrack.id, !isFavorite)}
                    className={`p-1.5 t-control transition-all cursor-pointer rounded hover:bg-neutral-800/80 ${
                      isFavorite
                        ? 'text-red-500 hover:text-red-400 scale-105'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                    title={
                      isFavorite ? 'Remove from Liked Songs' : 'Save to Liked Songs (Favorites)'
                    }
                    aria-label={
                      isFavorite ? 'Remove from Liked Songs' : 'Save to Liked Songs (Favorites)'
                    }
                  >
                    <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                  </button>

                  <div className="relative" ref={playlistMenuRef}>
                    <button
                      id="fullscreen-add-playlist-btn"
                      type="button"
                      onClick={() => setIsPlaylistMenuOpen((prev) => !prev)}
                      className={`p-1.5 t-control transition-all cursor-pointer rounded hover:bg-neutral-800/80 ${
                        isPlaylistMenuOpen
                          ? 'text-amber-400 bg-neutral-800 ring-1 ring-amber-400/40'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                      title="Add to playlist or create playlist"
                      aria-label="Add to playlist or create playlist"
                    >
                      <Plus className="w-4 h-4" />
                    </button>

                    {/* Playlist Popover Menu */}
                    {isPlaylistMenuOpen && (
                      <div
                        id="fullscreen-playlist-popover"
                        className="absolute top-full right-0 lg:left-0 lg:right-auto mt-2 w-72 sm:w-80 t-card t-stroke border border-neutral-700 bg-[#0d121c] p-3 text-xs font-sans text-neutral-200 shadow-[0_16px_40px_rgba(0,0,0,0.95)] z-50 animate-fadeIn"
                        style={{ borderColor: currentTheme.borderColor }}
                      >
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            <ListPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-bold text-white truncate text-[11px] uppercase tracking-wider">
                              Add to Playlist
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsPlaylistMenuOpen(false)}
                            className="p-1 text-neutral-400 hover:text-white t-control cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        {statusMessage && (
                          <div
                            role="status"
                            className={`p-1.5 mb-2 text-[10px] font-medium flex items-center gap-1.5 t-sm animate-fadeIn ${
                              statusMessage.type === 'success'
                                ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                                : statusMessage.type === 'info'
                                  ? 'bg-sky-950/80 border border-sky-500/50 text-sky-300'
                                  : 'bg-red-950/80 border border-red-500/50 text-red-300'
                            }`}
                          >
                            {statusMessage.type === 'success' && (
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                            <span>{statusMessage.text}</span>
                          </div>
                        )}

                        {/* Song DNA Generator Action */}
                        <button
                          type="button"
                          onClick={handleCreateWithGenerator}
                          className="w-full text-left p-2 mb-2 t-control border border-violet-500/40 bg-violet-950/30 hover:bg-violet-900/50 text-violet-200 transition-all cursor-pointer flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Dna className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                            <span className="font-semibold text-white text-[11px] truncate">
                              Generate with Song DNA
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-violet-400">Open →</span>
                        </button>

                        {/* Create Playlist Form */}
                        <form onSubmit={handleCreateNewPlaylist} className="mb-2">
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={newPlaylistName}
                              onChange={(e) => setNewPlaylistName(e.target.value)}
                              placeholder="New playlist..."
                              disabled={isCreatingPlaylist}
                              className="min-w-0 flex-1 px-2 py-1 text-xs bg-neutral-950 border border-neutral-700 text-white t-sm placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!newPlaylistName.trim() || isCreatingPlaylist}
                              className="px-2.5 py-1 text-xs font-semibold bg-amber-400 text-black t-control hover:brightness-110 disabled:opacity-40 cursor-pointer"
                            >
                              {isCreatingPlaylist ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Create'
                              )}
                            </button>
                          </div>
                        </form>

                        {/* Playlists List */}
                        <div className="max-h-32 overflow-y-auto space-y-1 pr-0.5 select-none">
                          {isLoadingPlaylists && playlists.length === 0 ? (
                            <div className="py-2 text-center text-neutral-500 text-[10px]">
                              Loading playlists…
                            </div>
                          ) : playlists.length === 0 ? (
                            <div className="py-2 text-center text-neutral-500 text-[10px]">
                              No playlists yet
                            </div>
                          ) : (
                            playlists.map((playlist) => {
                              const isAdding = addingPlaylistId === playlist.id;
                              const wasAdded = addedPlaylistIds.has(playlist.id);

                              return (
                                <button
                                  key={playlist.id}
                                  type="button"
                                  disabled={isAdding}
                                  onClick={() => void handleAddTrackToExisting(playlist)}
                                  className="w-full text-left p-1.5 t-control border border-neutral-800/80 bg-neutral-950/60 hover:bg-neutral-900 text-neutral-200 transition-colors flex items-center justify-between group cursor-pointer"
                                >
                                  <span className="font-semibold text-neutral-200 truncate text-[11px] group-hover:text-white">
                                    {playlist.name}
                                  </span>
                                  <span className="shrink-0 text-neutral-400 text-[10px]">
                                    {isAdding ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                                    ) : wasAdded ? (
                                      <span className="text-emerald-400 font-mono">✓</span>
                                    ) : (
                                      <span className="group-hover:text-amber-400">+ Add</span>
                                    )}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Artist and Album listed together with dot separator */}
              <div className="flex items-center justify-center lg:justify-start gap-1.5 text-xs sm:text-sm font-medium flex-wrap">
                <button
                  type="button"
                  onClick={() => onSelectArtist?.(currentTrack.artist)}
                  className="hover:underline transition-colors cursor-pointer truncate max-w-[170px]"
                  style={{ color: currentTheme.textPrimary }}
                >
                  {currentTrack.artist}
                </button>
                {currentTrack.album && (
                  <>
                    <span className="opacity-50 select-none">•</span>
                    <button
                      type="button"
                      onClick={() => onSelectAlbum?.(currentTrack.album)}
                      className="hover:underline transition-colors cursor-pointer truncate max-w-[170px]"
                      style={{ color: currentTheme.textSecondary }}
                    >
                      {currentTrack.album} {currentTrack.year ? `(${currentTrack.year})` : ''}
                    </button>
                  </>
                )}
              </div>

              {/* Audiophile format badges */}
              <div className="flex items-center justify-center lg:justify-start gap-1.5 mt-0.5 flex-wrap font-mono text-[10px]">
                <span
                  className="px-1.5 py-0.5 t-sm border font-semibold"
                  style={{
                    backgroundColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 15%, transparent)',
                    borderColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 35%, transparent)',
                    color: currentTheme.primary,
                  }}
                >
                  {currentTrack.codec} {currentTrack.sampleRate}
                </span>
                {currentTrack.dynamicRange && (
                  <span
                    className="px-1.5 py-0.5 t-sm border"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${currentTheme.bgSurface} 80%, transparent)`,
                      borderColor: currentTheme.borderColor,
                      color: currentTheme.textSecondary,
                    }}
                  >
                    {currentTrack.dynamicRange}
                  </span>
                )}
                {currentTrack.bitrate && (
                  <span
                    className="px-1.5 py-0.5 t-sm border hidden sm:inline"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${currentTheme.bgSurface} 80%, transparent)`,
                      borderColor: currentTheme.borderColor,
                      color: currentTheme.textMuted,
                    }}
                  >
                    {currentTrack.bitrate}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Middle Section: Lyrics Card (Expanded width & length) */}
          <div
            className="lg:col-span-4 h-[374px] sm:h-[407px] lg:h-[440px] xl:h-[473px] t-card t-stroke p-5 sm:p-6 flex flex-col relative overflow-hidden backdrop-blur-md transition-colors"
            style={{
              backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 90%, transparent)`,
              borderColor: currentTheme.borderColor,
              boxShadow: 'var(--shadow, 0 8px 26px rgba(0,0,0,0.45))',
            }}
          >
            {/* Card Header */}
            <div
              className="flex items-center justify-between pb-2.5 border-b shrink-0"
              style={{ borderColor: currentTheme.borderColor }}
            >
              <h3
                className="text-sm sm:text-base font-bold tracking-wide t-heading"
                style={{
                  color: currentTheme.textPrimary,
                  fontFamily: "var(--f-h, var(--f-d, 'Big Shoulders Display', sans-serif))",
                }}
              >
                Lyrics
              </h3>
              <span
                className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 t-sm border"
                style={{
                  backgroundColor: `color-mix(in oklab, ${currentTheme.bgSurface} 70%, transparent)`,
                  borderColor: currentTheme.borderColor,
                  color: lyricsDocument?.synchronized
                    ? currentTheme.primary
                    : currentTheme.textMuted,
                }}
              >
                {lyricsDocument
                  ? lyricsDocument.synchronized
                    ? 'Synchronized'
                    : lyricsDocument.source === 'unavailable'
                      ? 'Unavailable'
                      : 'Plain text'
                  : 'Loading'}
              </span>
            </div>

            {/* Lyrics Stream */}
            <div
              ref={lyricsContainerRef}
              className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-3 text-left scroll-smooth pt-2"
            >
              {lyricsDocument?.source === 'unavailable' ? (
                <p
                  className="pt-6 text-sm leading-relaxed"
                  style={{ color: currentTheme.textMuted }}
                >
                  Lyrics unavailable for this track.
                </p>
              ) : (
                lyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const isPast = idx < activeLyricIndex;
                  return (
                    <p
                      key={idx}
                      data-lyric-index={idx}
                      onClick={() => line.timeMs !== null && onSeek(line.timeMs / 1_000)}
                      className={`leading-relaxed transition-all duration-300 select-none cursor-pointer ${
                        isActive
                          ? 'font-bold text-base sm:text-lg lg:text-xl scale-[1.02] origin-left'
                          : isPast
                            ? 'text-xs sm:text-sm lg:text-base font-normal opacity-50 hover:opacity-100'
                            : 'text-xs sm:text-sm lg:text-base font-normal opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        color: isActive
                          ? currentTheme.primary
                          : isPast
                            ? currentTheme.textMuted
                            : currentTheme.textSecondary,
                        textShadow: isActive ? `0 0 16px ${currentTheme.accentGlow}` : 'none',
                      }}
                    >
                      {line.text}
                    </p>
                  );
                })
              )}
            </div>

            {lyricsDocument && lyricsDocument.source !== 'unavailable' && (
              <p
                className="pt-2 text-[10px] border-t flex items-center justify-between shrink-0"
                style={{
                  borderColor: currentTheme.borderColor,
                  color: currentTheme.textMuted,
                }}
              >
                <span>
                  Source:{' '}
                  {lyricsDocument.source === 'lrclib'
                    ? 'LRCLIB'
                    : lyricsDocument.source.replace('-', ' ')}
                </span>
                {lyricsDocument.sourceUrl && (
                  <a
                    className="underline hover:opacity-100"
                    style={{ color: currentTheme.primary }}
                    href={lyricsDocument.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Attribution
                  </a>
                )}
              </p>
            )}

            {/* Bottom Down Chevron Scroll Hint */}
            <div
              className="pt-1.5 flex justify-center opacity-40 shrink-0"
              style={{ color: currentTheme.textMuted }}
            >
              <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            </div>
          </div>

          {/* Right Section: Up Next Queue Card (Expanded width & length) */}
          <div
            className="lg:col-span-3 h-[374px] sm:h-[407px] lg:h-[440px] xl:h-[473px] t-card t-stroke p-4 sm:p-5 flex flex-col relative overflow-hidden backdrop-blur-md transition-colors"
            style={{
              backgroundColor: `color-mix(in oklab, ${currentTheme.bgCard} 90%, transparent)`,
              borderColor: currentTheme.borderColor,
              boxShadow: 'var(--shadow, 0 8px 26px rgba(0,0,0,0.45))',
            }}
          >
            {/* Card Header */}
            <div
              className="flex items-center justify-between pb-2.5 border-b shrink-0"
              style={{ borderColor: currentTheme.borderColor }}
            >
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4" style={{ color: currentTheme.primary }} />
                <h3
                  className="text-xs sm:text-sm font-bold tracking-wide t-heading"
                  style={{
                    color: currentTheme.textPrimary,
                    fontFamily: "var(--f-h, var(--f-d, 'Big Shoulders Display', sans-serif))",
                  }}
                >
                  Queue
                </h3>
              </div>
              <span
                className="text-[11px] font-mono px-2 py-0.5 t-sm border"
                style={{
                  backgroundColor: `color-mix(in oklab, ${currentTheme.bgSurface} 70%, transparent)`,
                  borderColor: currentTheme.borderColor,
                  color: currentTheme.textSecondary,
                }}
              >
                {queue.length} tracks
              </span>
            </div>

            {/* Queue List */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2 pt-2">
              {displayQueue.map((track, idx) => {
                const isCurrent = track.id === currentTrack.id;
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    onClick={() => onPlayQueueTrack(track)}
                    className={`p-2 t-card t-stroke flex items-center gap-2.5 transition-all cursor-pointer border ${
                      isCurrent ? 'shadow-md' : 'hover:border-[var(--c-p)]'
                    }`}
                    style={{
                      backgroundColor: isCurrent
                        ? 'color-mix(in oklab, var(--c-p, #f59e0b) 14%, transparent)'
                        : `color-mix(in oklab, ${currentTheme.bgSurface} 80%, transparent)`,
                      borderColor: isCurrent
                        ? 'color-mix(in oklab, var(--c-p, #f59e0b) 40%, transparent)'
                        : currentTheme.borderColor,
                      color: isCurrent ? currentTheme.textPrimary : currentTheme.textSecondary,
                    }}
                  >
                    <div
                      className="w-8 h-8 t-sm shrink-0 overflow-hidden border"
                      style={{
                        backgroundColor: currentTheme.bgCanvas,
                        borderColor: currentTheme.borderColor,
                      }}
                    >
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center opacity-60"
                          style={{ color: currentTheme.primary }}
                        >
                          <Disc3 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h5
                          className="text-xs font-semibold truncate"
                          style={{
                            color: isCurrent ? currentTheme.primary : currentTheme.textPrimary,
                          }}
                        >
                          {track.title}
                        </h5>
                        {/* Equalizer animation bars for the currently playing track */}
                        {isCurrent && isPlaying && (
                          <div className="flex items-end gap-0.5 h-2.5 shrink-0">
                            <span
                              className="w-0.5 h-full rounded-full animate-[pulse_0.6s_ease-in-out_infinite]"
                              style={{ backgroundColor: currentTheme.primary }}
                            />
                            <span
                              className="w-0.5 h-2/3 rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s]"
                              style={{ backgroundColor: currentTheme.primary }}
                            />
                            <span
                              className="w-0.5 h-4/5 rounded-full animate-[pulse_0.5s_ease-in-out_infinite_0.4s]"
                              style={{ backgroundColor: currentTheme.primary }}
                            />
                          </div>
                        )}
                      </div>
                      <p
                        className="text-[10px] truncate opacity-75"
                        style={{ color: currentTheme.textSecondary }}
                      >
                        {track.artist}
                      </p>
                    </div>

                    <span
                      className="text-[10px] font-mono shrink-0"
                      style={{ color: currentTheme.textMuted }}
                    >
                      {track.duration}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Peak-hold spectrum floor bed */}
      <div
        id="fullscreen-visualizer-bed"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex items-end"
        style={{ height: 'min(30vh, 280px)' }}
      >
        <PeakHoldVisualizer
          isPlaying={spectrumAvailable && isPlaying}
          height={visualizerHeight}
          style={visualizerStyle}
          autoFillWidth={true}
          particles={true}
          frequencyDataProvider={frequencyDataProvider}
          getSpectrumBins={getSpectrumBins}
        />
      </div>

      {/* Footer / Transport Controls & Seek Bar */}
      <footer className="relative z-10 w-full px-6 sm:px-10 lg:px-14 xl:px-18 2xl:px-24 pb-4 sm:pb-5 flex flex-col gap-1.5 shrink-0">
        {/* Scrubber Progress Bar */}
        <div className="flex w-full items-center gap-3 font-mono text-xs">
          <span
            className="w-11 text-right font-bold text-[11px]"
            style={{ color: currentTheme.primary }}
          >
            {formatTime(currentTimeSeconds)}
          </span>
          <div
            ref={seekRef}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onMouseEnter={() => setIsHoveringSeek(true)}
            onMouseLeave={() => {
              setIsHoveringSeek(false);
              setSeekHoverRatio(null);
            }}
            className="group relative flex h-4 flex-1 cursor-pointer items-center"
          >
            <div
              className="relative w-full t-bar transition-all"
              style={{
                height: isHoveringSeek ? '6px' : '4px',
                backgroundColor: currentTheme.waveformUnplayedBot,
              }}
            >
              <div
                className="absolute inset-y-0 left-0 t-bar"
                style={{
                  width: `${seekRatio * 100}%`,
                  background: `linear-gradient(90deg, ${currentTheme.waveformPlayedBot} 0%, ${currentTheme.primary} 100%)`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 t-btn transition-all"
                style={{
                  left: `${seekRatio * 100}%`,
                  width: isHoveringSeek ? '14px' : '10px',
                  height: isHoveringSeek ? '14px' : '10px',
                  backgroundColor: currentTheme.primary,
                  boxShadow: currentTheme.waveformGlow
                    ? `0 0 16px ${currentTheme.accentGlow}`
                    : undefined,
                }}
              />
            </div>
            {isHoveringSeek && seekHoverRatio !== null && (
              <div
                className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2"
                style={{ left: `${seekHoverRatio * 100}%` }}
              >
                <div
                  className="whitespace-nowrap t-sm border px-1.5 py-0.5 text-[10px] font-bold shadow-xl"
                  style={{
                    backgroundColor: currentTheme.bgCanvas,
                    borderColor: currentTheme.primary,
                    color: currentTheme.primary,
                  }}
                >
                  {formatTime(seekHoverRatio * (currentTrack.durationSeconds || 240))}
                </div>
              </div>
            )}
          </div>
          <span className="w-11 text-[11px]" style={{ color: currentTheme.textMuted }}>
            {formatTime(currentTrack.durationSeconds || 240)}
          </span>
        </div>

        {/* Bottom Transport Controls Bar */}
        <div
          className="flex items-center justify-between pt-0.5"
          style={{ color: currentTheme.textSecondary }}
        >
          {/* Left spacer / format badges */}
          <div className="w-1/4 hidden sm:flex items-center gap-3 text-[11px] font-mono opacity-80">
            <span>DR: {currentTrack.dynamicRange || '—'}</span>
            <span>•</span>
            <span>{currentTrack.catalogNumber || 'BEBOP-HRA-001'}</span>
          </div>

          {/* Center Playback Buttons */}
          <div className="flex items-center justify-center gap-5 sm:gap-6">
            <button
              type="button"
              onClick={toggleShuffle}
              className="transition-colors cursor-pointer hover:opacity-100"
              style={{
                color: isShuffle ? currentTheme.primary : currentTheme.textSecondary,
                opacity: isShuffle ? 1 : 0.7,
              }}
              aria-label="Shuffle"
              title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              className="hover:text-white transition-colors cursor-pointer opacity-80 hover:opacity-100"
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
                color: 'var(--c-on-p, #000000)',
                boxShadow: `0 0 22px ${currentTheme.accentGlow}`,
              }}
              className="w-11 h-11 sm:w-12 sm:h-12 t-btn flex items-center justify-center transition-transform hover:scale-108 cursor-pointer hover:brightness-110"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="hover:text-white transition-colors cursor-pointer opacity-80 hover:opacity-100"
              aria-label="Next Track"
              title="Next"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={toggleRepeat}
              className="transition-colors cursor-pointer relative hover:opacity-100"
              style={{
                color: repeatMode !== 'off' ? currentTheme.primary : currentTheme.textSecondary,
                opacity: repeatMode !== 'off' ? 1 : 0.7,
              }}
              aria-label="Repeat Mode"
              title={`Repeat: ${repeatMode === 'one' ? 'Repeat One' : repeatMode === 'all' ? 'Repeat All' : 'Off'}`}
            >
              <Repeat className="w-4 h-4" />
              {repeatMode === 'one' && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[8px] font-bold font-mono px-0.5 rounded-full"
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

          {/* Right Volume Controls */}
          <div className="w-1/4 flex items-center justify-end gap-3">
            {volumeLocked && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 t-sm border flex items-center gap-1"
                style={{
                  backgroundColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 12%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 30%, transparent)',
                  color: currentTheme.primary,
                }}
                title="Hi-Fi Bit-Perfect Output (Adjusting volume switches to variable mode)"
              >
                <Lock className="w-3 h-3" />
                <span className="hidden xl:inline">HI-FI</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => void toggleMute()}
              className="hover:text-white cursor-pointer transition-colors opacity-80 hover:opacity-100"
              aria-label="Toggle Mute"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 opacity-60" />
              ) : (
                <Volume2 className="w-4 h-4" style={{ color: currentTheme.primary }} />
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
              style={{
                accentColor: currentTheme.primary,
              }}
              className="w-20 sm:w-28 h-1.5 bg-neutral-800 t-sm appearance-none cursor-pointer"
            />
          </div>
        </div>
      </footer>
    </div>
  );
};
