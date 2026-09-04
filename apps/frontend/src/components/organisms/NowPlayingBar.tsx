import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
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
import { visualizerStyleFromVars } from '@/services/visualizerStyle';
import { useTheme } from '@/services/themeService';
import {
  listPlaylists,
  addTrackToPlaylist,
  createPlaylistWithTrack,
  type PlaylistSummary,
} from '@/services/playlistService';

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
  isFavorite?: boolean;
  onToggleFavorite?: (trackId: string, favorite: boolean) => void;
  onCreatePlaylistWithSeed?: (track: TrackItem) => void;
  onAddTrackToPlaylist?: (playlistId: string, trackId: string) => Promise<boolean | void>;
  onContextMenu?: (track: TrackItem, event: React.MouseEvent) => void;
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
  isFavorite = false,
  onToggleFavorite,
  onCreatePlaylistWithSeed,
  onAddTrackToPlaylist: customAddTrackToPlaylist,
  onContextMenu,
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

  // Playlist Popover Menu state
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

  // Click outside to close playlist menu
  useEffect(() => {
    if (!isPlaylistMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setIsPlaylistMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPlaylistMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
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
    onCreatePlaylistWithSeed?.(currentTrack);
  };

  // SoundCloud Mini-Waveform scrubber hover state
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const [isHoveringSeek, setIsHoveringSeek] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);

  const committedVolume =
    controlledVolume === undefined ? localVolume : Math.round(controlledVolume * 100);
  // Dragging the slider fires onChange continuously — often well over 60
  // times a second on a fast trackpad — and each commit is an async IPC round
  // trip that lands as a playback-state update, re-rendering everything
  // downstream of it (this bar's parent owns that state, so it's the whole
  // page). Coalescing to once per animation frame still isn't coarse enough:
  // that's up to 60 full-tree re-renders a second, which is plenty to steal
  // enough main-thread time to visibly stutter the app's CSS ambience
  // animations even though nothing about them changed. The position updates
  // that already happen during ordinary playback land far less often than
  // that and aren't a problem, so throttling commits to roughly that same
  // cadence — instead of display refresh rate — is what actually fixes it.
  // The slider's own visual position is still local state, so it never
  // waits on any of this.
  const VOLUME_COMMIT_INTERVAL_MS = 120;
  const [draggingVolume, setDraggingVolume] = useState<number | null>(null);
  const pendingVolumeRef = useRef<number | null>(null);
  const volumeThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volume = draggingVolume ?? committedVolume;
  const isMuted = controlledMuted ?? localMuted;
  const changeVolume = async (nextVolume: number) => {
    if (volumeLocked && nextVolume !== 100) await onUnlockVolume?.();
    if (onVolumeChange) await onVolumeChange(nextVolume / 100);
    else setLocalVolume(nextVolume);
    if (onVolumeChange && isMuted) onToggleMute?.();
    else if (!onVolumeChange && isMuted) setLocalMuted(false);
  };
  const handleVolumeInput = (nextVolume: number) => {
    setDraggingVolume(nextVolume);
    pendingVolumeRef.current = nextVolume;
    if (volumeThrottleRef.current == null) {
      volumeThrottleRef.current = setTimeout(() => {
        volumeThrottleRef.current = null;
        const value = pendingVolumeRef.current;
        pendingVolumeRef.current = null;
        if (value != null) void changeVolume(value);
      }, VOLUME_COMMIT_INTERVAL_MS);
    }
  };
  const commitVolumeImmediately = async () => {
    if (volumeThrottleRef.current != null) {
      clearTimeout(volumeThrottleRef.current);
      volumeThrottleRef.current = null;
    }
    const value = pendingVolumeRef.current;
    pendingVolumeRef.current = null;
    if (value != null) await changeVolume(value);
    setDraggingVolume(null);
  };
  useEffect(() => {
    if (draggingVolume != null && committedVolume === draggingVolume) setDraggingVolume(null);
  }, [committedVolume, draggingVolume]);
  useEffect(() => {
    return () => {
      if (volumeThrottleRef.current != null) clearTimeout(volumeThrottleRef.current);
    };
  }, []);
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

      {/* Left: Track Artwork with Hover Up Chevron & Info & Song Actions */}
      <div
        className="relative z-10 flex items-center gap-3 min-w-[200px] sm:min-w-[280px] max-w-[32%]"
        onContextMenu={(e) => {
          if (currentTrack) {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu?.(currentTrack, e);
          }
        }}
      >
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

        <div className="flex flex-col truncate min-w-0 flex-1">
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

        {/* Action Cluster: Favorite (Heart) & Add to Playlist (+) */}
        <div className="flex items-center gap-1 shrink-0 ml-0.5">
          <button
            id="now-playing-like-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(currentTrack.id, !isFavorite);
            }}
            className={`p-1.5 t-control transition-all cursor-pointer rounded hover:bg-neutral-800/80 ${
              isFavorite
                ? 'text-red-500 hover:text-red-400 scale-105'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title={isFavorite ? 'Remove from Liked Songs' : 'Save to Liked Songs (Favorites)'}
            aria-label={isFavorite ? 'Remove from Liked Songs' : 'Save to Liked Songs (Favorites)'}
          >
            <Heart
              className={`w-4 h-4 transition-all ${
                isFavorite ? 'fill-red-500 text-red-500' : 'text-neutral-400 hover:text-white'
              }`}
            />
          </button>

          <div className="relative" ref={playlistMenuRef}>
            <button
              id="now-playing-add-playlist-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaylistMenuOpen((prev) => !prev);
              }}
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
                id="now-playing-playlist-popover"
                className="absolute bottom-full left-0 mb-3 w-80 sm:w-88 t-card t-stroke border border-neutral-700 bg-[#0d121c] p-4 text-xs font-sans text-neutral-200 shadow-[0_16px_40px_rgba(0,0,0,0.95)] z-50 animate-fadeIn"
                style={{
                  borderColor: currentTheme.borderColor || '#26334d',
                }}
              >
                {/* Popover Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-neutral-800">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <ListPlus className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-white block truncate text-[11px] uppercase tracking-wider">
                        Add to Playlist
                      </span>
                      <span className="text-[10px] text-neutral-400 truncate block">
                        {currentTrack.title}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPlaylistMenuOpen(false)}
                    className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 t-control cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Status Message / Notification inside popover */}
                {statusMessage && (
                  <div
                    role="status"
                    className={`p-2 mb-2.5 text-[11px] font-medium flex items-center gap-1.5 t-sm animate-fadeIn ${
                      statusMessage.type === 'success'
                        ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                        : statusMessage.type === 'info'
                          ? 'bg-sky-950/80 border border-sky-500/50 text-sky-300'
                          : 'bg-red-950/80 border border-red-500/50 text-red-300'
                    }`}
                  >
                    {statusMessage.type === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    <span>{statusMessage.text}</span>
                  </div>
                )}

                {/* 1. Song DNA Generator Quick Action */}
                <button
                  type="button"
                  onClick={handleCreateWithGenerator}
                  className="w-full text-left p-2.5 mb-3 t-control border border-violet-500/40 bg-violet-950/30 hover:bg-violet-900/50 text-violet-200 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 t-sm bg-violet-500/20 border border-violet-500/40 flex items-center justify-center shrink-0">
                      <Dna className="w-3.5 h-3.5 text-violet-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-[11px] flex items-center gap-1">
                        <span>Generate with Song DNA</span>
                        <Sparkles className="w-3 h-3 text-violet-400" />
                      </div>
                      <p className="text-[10px] text-neutral-400 truncate">
                        Seed generator with this track
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-violet-400 opacity-80 group-hover:opacity-100">
                    Open →
                  </span>
                </button>

                {/* 2. Create New Playlist Inline Form */}
                <form onSubmit={handleCreateNewPlaylist} className="mb-3">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                    New Playlist
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      placeholder="Playlist name..."
                      disabled={isCreatingPlaylist}
                      className="min-w-0 flex-1 px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-700 text-white t-sm placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newPlaylistName.trim() || isCreatingPlaylist}
                      aria-label="Create playlist"
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-400 text-black t-control hover:brightness-110 disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {isCreatingPlaylist ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      <span>Add</span>
                    </button>
                  </div>
                </form>

                {/* 3. Add to Existing Playlists */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                    <span>Your Playlists</span>
                    {isLoadingPlaylists && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1 select-none">
                    {isLoadingPlaylists && playlists.length === 0 ? (
                      <div className="py-4 text-center text-neutral-500 text-[11px]">
                        Loading playlists…
                      </div>
                    ) : playlists.length === 0 ? (
                      <div className="py-3 text-center text-neutral-500 text-[11px]">
                        No playlists found. Type a name above to create one!
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
                            className="w-full text-left p-2 t-control border border-neutral-800/80 bg-neutral-950/60 hover:bg-neutral-900 hover:border-neutral-700 text-neutral-200 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-neutral-200 truncate text-[11px] group-hover:text-white">
                                {playlist.name}
                              </p>
                              <p className="text-[10px] text-neutral-500">
                                {playlist.trackCount} track{playlist.trackCount === 1 ? '' : 's'}
                              </p>
                            </div>
                            <div className="shrink-0 text-neutral-400">
                              {isAdding ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                              ) : wasAdded ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                                  <Check className="w-3 h-3" />
                                  <span>Added</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-neutral-400 group-hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  + Add
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
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
            onChange={(e) => handleVolumeInput(Number(e.target.value))}
            onMouseUp={() => void commitVolumeImmediately()}
            onTouchEnd={() => void commitVolumeImmediately()}
            onBlur={() => void commitVolumeImmediately()}
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
