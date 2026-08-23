import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, FolderOpen, Play, RefreshCw, Square, TriangleAlert } from 'lucide-react';
import { EmptyState } from '@/components/atoms/EmptyState';
import { ContinueListeningRail } from '@/components/molecules/ContinueListeningRail';
import { ListeningStats } from '@/components/molecules/ListeningStats';
import { TopNavRail } from '@/components/molecules/TopNavRail';
import { LibraryView } from '@/components/organisms/LibraryView';
import { FullscreenNowPlaying } from '@/components/organisms/FullscreenNowPlaying';
import { NowPlayingBar } from '@/components/organisms/NowPlayingBar';
import { NowPlayingQueueModal } from '@/components/organisms/NowPlayingQueueModal';
import { AppShell } from '@/components/templates/AppShell';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import { useNativePlayback } from '@/hooks/useNativePlayback';
import { useTheme } from '@/services/themeService';
import { ThemeSelectorModal } from '@/components/organisms/ThemeSelectorModal';
import type { ContinueListeningItem, ListeningStatsData, NavTab, TrackItem } from '@/types';

function formatDuration(seconds: number, zeroLabel = '0m') {
  if (!Number.isFinite(seconds)) return 'Unknown';
  if (seconds <= 0) return zeroLabel;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`;
}

export function DesktopLibraryPage() {
  const { currentTheme } = useTheme();
  const { library, selectAndScan } = useLibraryScan();
  const nativePlayback = useNativePlayback();
  const [activeTab, setActiveTab] = useState<NavTab>('HOME');
  const [searchQuery, setSearchQuery] = useState('');
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
  const visibleTracks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return library.tracks;
    return library.tracks.filter((track) =>
      [track.title, track.artist, track.album, track.codec, track.sampleRate].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
    );
  }, [library.tracks, searchQuery]);
  const libraryStats = useMemo<Partial<ListeningStatsData>>(() => {
    const knownDurationTracks = library.tracks.filter((track) => track.durationSeconds > 0).length;
    const totalDurationSeconds = library.tracks.reduce(
      (total, track) => total + track.durationSeconds,
      0,
    );
    const sessionSeconds = nativePlayback.playback.positionMs / 1_000;

    return {
      timeListened: formatDuration(sessionSeconds),
      timeListenedGrowth: currentTrack ? 'Current session' : 'No session yet',
      totalTracks: library.tracks.length.toLocaleString(),
      verifiedLocal: library.root ? 'Scanned local files' : 'Select a folder',
      totalArtists: '—',
      artistsCachedStatus: 'Tags not indexed',
      totalAlbums: '—',
      albumsMastering: 'Tags not indexed',
      libraryDuration: formatDuration(totalDurationSeconds, 'No duration yet'),
      libraryDurationSub:
        knownDurationTracks > 0
          ? `${knownDurationTracks.toLocaleString()} file durations read`
          : 'Duration unavailable',
      mostListenedArtist: 'History not saved yet',
      artistLosslessHours: 'Native playback session only',
      topGenre: 'Metadata pending',
      topGenrePercentage: 'Genre indexing is deferred',
      favoriteEra: 'Metadata pending',
      dynamicRange: 'Analysis is deferred',
      libraryDiskSize: 'Not reported',
      losslessPercentage: 'Inspect individual tracks',
    };
  }, [currentTrack, library.root, library.tracks, nativePlayback.playback.positionMs]);
  const sessionItems = useMemo<ContinueListeningItem[]>(() => {
    if (!currentTrack) return [];
    const status = nativePlayback.playback.status;
    return [
      {
        id: `session-${currentTrack.id}`,
        type: 'playlist',
        title: currentTrack.title,
        subtitle: `Local track • ${currentTrack.codec} · ${currentTrack.sampleRate}`,
        accentGradient: 'from-amber-500/35 to-neutral-950',
        lastPlayedText: status === 'playing' ? 'Playing now' : 'Current session',
        lastPlayedTrackName: currentTrack.title,
        totalTracksCount: Math.max(queue.length, 1),
      },
    ];
  }, [currentTrack, nativePlayback.playback.status, queue.length]);
  const previewTracks = useMemo(() => library.tracks.slice(0, 6), [library.tracks]);

  const selectLibrary = useCallback(async () => {
    setActiveTab('LIBRARY');
    await selectAndScan();
  }, [selectAndScan]);

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

  const resumeCurrentSession = useCallback(() => {
    if (!currentTrack) {
      setActiveTab('LIBRARY');
      return;
    }
    if (nativePlayback.playback.status === 'paused') {
      void nativePlayback.togglePlayback();
      return;
    }
    if (nativePlayback.playback.status !== 'playing') void playTrack(currentTrack);
  }, [currentTrack, nativePlayback, playTrack]);

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
      <TopNavRail
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        audioStatusLabel="Native Rust output"
        showPrototypeActions={false}
      />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-28">
        {activeTab === 'HOME' && (
          <div className="flex flex-col gap-6 py-8 animate-fadeIn">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-5">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
                  Bebop local-first
                </p>
                <h1 className="mt-2 text-3xl font-bold text-white">Your music, on this device.</h1>
                <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                  Scan your library, then play it through the native Rust audio engine. No mock
                  catalog or browser-audio fallback is used here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void selectLibrary()}
                className="flex items-center gap-2 rounded border border-amber-500/60 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/25"
              >
                <FolderOpen className="h-4 w-4" />
                {library.root ? 'Choose another folder' : 'Select music folder'}
              </button>
            </div>

            <ListeningStats
              stats={libraryStats}
              onCardClick={() => setActiveTab('LIBRARY')}
              showAffinityMetrics={false}
            />

            <ContinueListeningRail
              items={sessionItems}
              onResumeItem={resumeCurrentSession}
              onItemClick={resumeCurrentSession}
              emptyMessage="Playback history is not persisted yet. Start a scanned local track to create this session."
              emptyActionLabel={library.root ? 'Browse indexed tracks' : 'Select a music folder'}
              onEmptyAction={() => {
                if (library.root) setActiveTab('LIBRARY');
                else void selectLibrary();
              }}
            />

            {previewTracks.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1.5 rounded-sm bg-amber-400" />
                    <h2 className="font-serif text-sm font-bold uppercase tracking-wider text-neutral-200">
                      Library preview
                    </h2>
                    <span className="text-xs text-neutral-500">First indexed files</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('LIBRARY')}
                    className="text-xs font-semibold text-amber-300 underline"
                  >
                    View all {library.tracks.length.toLocaleString()} tracks
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {previewTracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => void playTrack(track)}
                      className="group flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 text-left transition hover:-translate-y-0.5 hover:border-amber-400/50 hover:bg-neutral-900"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-500/10 text-amber-300">
                        {currentTrack?.id === track.id && isPlaying ? (
                          <Play className="h-4 w-4 fill-current" />
                        ) : (
                          <Disc3 className="h-5 w-5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">
                          {track.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-neutral-400">
                          {track.codec} · {track.sampleRate} · {track.duration}
                        </span>
                      </span>
                      <Play className="h-4 w-4 shrink-0 text-neutral-500 opacity-0 transition group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {library.root ? (
              <button
                type="button"
                onClick={() => setActiveTab('LIBRARY')}
                className="self-start text-sm font-semibold text-amber-300 underline"
              >
                Browse indexed tracks
              </button>
            ) : (
              <EmptyState title="Start with a local music folder.">
                Bebop will recognize FLAC, WAV, MP3, and OGG files without uploading them.
              </EmptyState>
            )}
          </div>
        )}

        {activeTab === 'DISCOVER' && (
          <div className="py-8 animate-fadeIn">
            <EmptyState title="Discovery is not indexed yet.">
              Artist, album, and genre discovery needs embedded metadata support. Your scanned local
              tracks remain available in Library.
            </EmptyState>
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="flex max-w-3xl flex-col gap-5 py-8 animate-fadeIn">
            <EmptyState title="Native audio settings">
              Bebop currently reports the real output signal path. Device selection and persisted
              audio preferences are planned for a later milestone.
            </EmptyState>
            <div className="rounded border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-300">
              {nativePlayback.playback.output ? (
                <>
                  <p className="font-semibold text-white">
                    {nativePlayback.playback.output.deviceName}
                  </p>
                  <p className="mt-2">{nativePlayback.playback.output.disclosure}</p>
                </>
              ) : (
                <p>Play a scanned track to inspect the active output stream.</p>
              )}
              <button
                type="button"
                onClick={() => void nativePlayback.setHifi(!nativePlayback.playback.hifiMode)}
                className="mt-4 text-sm font-semibold text-amber-300 underline"
              >
                {nativePlayback.playback.hifiMode
                  ? 'Allow software volume'
                  : 'Enable hi-fi unity gain'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'LIBRARY' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
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
                onClick={() => void selectLibrary()}
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
                    {nativePlayback.playback.hifiMode
                      ? 'Allow software volume'
                      : 'Enable hi-fi mode'}
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

            {(library.phase === 'permission-error' || library.phase === 'error') &&
              library.error && (
                <div
                  role="alert"
                  className="flex gap-3 rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
                >
                  <TriangleAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">{library.error.message}</p>
                    <p className="mt-1 text-red-200/80">
                      Choose a folder Bebop is permitted to read.
                    </p>
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
                tracks={visibleTracks}
                currentTrackId={currentTrack?.id}
                isPlaying={isPlaying}
                onPlayTrack={(track) => void playTrack(track)}
              />
            )}
          </div>
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
      <ThemeSelectorModal />
    </AppShell>
  );
}
