import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, RefreshCw, Square, TriangleAlert } from 'lucide-react';
import { LibraryView } from '@/components/organisms/LibraryView';
import { FullscreenNowPlaying } from '@/components/organisms/FullscreenNowPlaying';
import { NowPlayingBar } from '@/components/organisms/NowPlayingBar';
import { NowPlayingQueueModal } from '@/components/organisms/NowPlayingQueueModal';
import { AppShell } from '@/components/templates/AppShell';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import { useNativePlayback } from '@/hooks/useNativePlayback';
import { useTheme } from '@/services/themeService';
import type { TrackItem } from '@/types';

export function DesktopLibraryPage() {
  const { currentTheme } = useTheme();
  const { library, selectAndScan } = useLibraryScan();
  const nativePlayback = useNativePlayback();
  const [queue, setQueue] = useState<TrackItem[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackItem | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const completedEnds = useRef(0);
  const isScanning = library.phase === 'scanning';
  const currentTrack =
    library.tracks.find((track) => track.id === nativePlayback.playback.trackId) ?? selectedTrack;
  const isPlaying = nativePlayback.playback.status === 'playing';
  const progressLabel = library.progress
    ? `${library.progress.scannedFiles} files checked · ${library.progress.discoveredTracks} tracks found`
    : 'Preparing scan…';

  const playTrack = useCallback(
    async (track: TrackItem) => {
      setSelectedTrack(track);
      setQueue((current) =>
        current.some((item) => item.id === track.id) ? current : [...current, track],
      );
      await nativePlayback.playTrack(track);
    },
    [nativePlayback],
  );

  const playRelativeTrack = useCallback(
    (offset: number) => {
      if (queue.length === 0) return;
      const currentIndex = queue.findIndex((track) => track.id === currentTrack?.id);
      const startIndex = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex = (startIndex + offset + queue.length) % queue.length;
      void playTrack(queue[nextIndex]);
    },
    [currentTrack?.id, playTrack, queue],
  );

  useEffect(() => {
    if (nativePlayback.endedCount === completedEnds.current) return;
    completedEnds.current = nativePlayback.endedCount;
    playRelativeTrack(1);
  }, [nativePlayback.endedCount, playRelativeTrack]);

  const removeQueueTrack = useCallback((index: number) => {
    setQueue((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const moveQueueTrack = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      if (moved) next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((current) => current.filter((track) => track.id === currentTrack?.id));
  }, [currentTrack?.id]);

  const shuffleQueue = useCallback(() => {
    setQueue((current) => {
      const active = current.filter((track) => track.id === currentTrack?.id);
      const remaining = current.filter((track) => track.id !== currentTrack?.id);
      for (let index = remaining.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
      }
      return [...active, ...remaining];
    });
  }, [currentTrack?.id]);

  return (
    <AppShell background={currentTheme.bgCanvasGradient || currentTheme.bgCanvas}>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-28">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
              Local library
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">Your music, on this device.</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Select a folder to index FLAC, WAV, MP3, and OGG files. Bebop never uploads it.
            </p>
          </div>
          <button
            id="select-library-folder"
            type="button"
            onClick={() => void selectAndScan()}
            disabled={isScanning}
            className="flex items-center gap-2 rounded border border-amber-500/60 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60"
          >
            {isScanning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            {library.root ? 'Choose another folder' : 'Select music folder'}
          </button>
        </header>

        {isScanning && (
          <div
            role="status"
            className="rounded border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
          >
            {progressLabel}
          </div>
        )}

        {nativePlayback.error && (
          <div
            role="alert"
            className="flex gap-3 rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
          >
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{nativePlayback.error.message}</p>
              {nativePlayback.error.code === 'hifi-volume-locked' && (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-amber-300 underline"
                  onClick={() => void nativePlayback.setHifi(false)}
                >
                  Switch to adjustable-volume mode
                </button>
              )}
            </div>
          </div>
        )}

        {nativePlayback.playback.output && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-xs text-neutral-300">
            <p>
              {nativePlayback.playback.output.deviceName} ·{' '}
              {nativePlayback.playback.output.disclosure}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-amber-300 underline"
                onClick={() => void nativePlayback.setHifi(!nativePlayback.playback.hifiMode)}
              >
                {nativePlayback.playback.hifiMode ? 'Allow software volume' : 'Enable hi-fi mode'}
              </button>
              <button
                type="button"
                className="flex items-center gap-1 text-neutral-300 underline"
                onClick={() => void nativePlayback.stop()}
              >
                <Square className="h-3 w-3 fill-current" /> Stop
              </button>
            </div>
          </div>
        )}

        {library.phase === 'idle' && (
          <div className="rounded border border-neutral-800 bg-neutral-950/50 p-6 text-neutral-400">
            No folder has been selected yet.
          </div>
        )}

        {library.phase === 'empty' && (
          <div className="rounded border border-neutral-800 bg-neutral-950/50 p-6 text-neutral-400">
            No supported audio files were found in{' '}
            <span className="text-neutral-200">{library.root}</span>.
          </div>
        )}

        {(library.phase === 'permission-error' || library.phase === 'error') && library.error && (
          <div
            role="alert"
            className="flex gap-3 rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
          >
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{library.error.message}</p>
              <p className="mt-1 text-red-200/80">Choose a folder Bebop is permitted to read.</p>
            </div>
          </div>
        )}

        {library.phase === 'partial-error' && (
          <div
            role="alert"
            className="rounded border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100"
          >
            Indexed {library.tracks.length} track{library.tracks.length === 1 ? '' : 's'}, but
            skipped {library.warnings.length} unreadable or unsafe path
            {library.warnings.length === 1 ? '' : 's'}.
          </div>
        )}

        {(library.phase === 'complete' || library.phase === 'partial-error') && (
          <LibraryView
            tracks={library.tracks}
            currentTrackId={currentTrack?.id}
            isPlaying={isPlaying}
            onPlayTrack={(track) => void playTrack(track)}
          />
        )}
      </section>

      <NowPlayingBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeSeconds={nativePlayback.playback.positionMs / 1_000}
        onPlayPause={() => void nativePlayback.togglePlayback()}
        onNext={() => playRelativeTrack(1)}
        onPrev={() => playRelativeTrack(-1)}
        onSeek={(seconds) => void nativePlayback.seek(seconds)}
        onExpandFullscreen={() => setIsFullscreenOpen(true)}
        onToggleQueue={() => setIsQueueOpen((open) => !open)}
        queueCount={queue.length}
        volume={nativePlayback.playback.volume ?? 1}
        muted={nativePlayback.playback.muted}
        onVolumeChange={(volume) => void nativePlayback.setVolume(volume)}
        onToggleMute={() => void nativePlayback.toggleMute()}
        spectrumAvailable={false}
      />

      <NowPlayingQueueModal
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        queue={queue}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayTrack={(track) => void playTrack(track)}
        onRemoveTrack={removeQueueTrack}
        onMoveTrack={moveQueueTrack}
        onClearQueue={clearQueue}
        onShuffleQueue={shuffleQueue}
      />

      <FullscreenNowPlaying
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeSeconds={nativePlayback.playback.positionMs / 1_000}
        onPlayPause={() => void nativePlayback.togglePlayback()}
        onNext={() => playRelativeTrack(1)}
        onPrev={() => playRelativeTrack(-1)}
        onSeek={(seconds) => void nativePlayback.seek(seconds)}
        queue={queue}
        onPlayQueueTrack={(track) => void playTrack(track)}
        volume={nativePlayback.playback.volume ?? 1}
        muted={nativePlayback.playback.muted}
        onVolumeChange={(volume) => void nativePlayback.setVolume(volume)}
        onToggleMute={() => void nativePlayback.toggleMute()}
        spectrumAvailable={false}
      />
    </AppShell>
  );
}
