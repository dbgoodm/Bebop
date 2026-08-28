import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Disc3, Play, Square, TriangleAlert } from 'lucide-react';
import { EmptyState } from '@/components/atoms/EmptyState';
import { ContinueListeningRail } from '@/components/molecules/ContinueListeningRail';
import { ListeningStats } from '@/components/molecules/ListeningStats';
import { RecentlyAddedRail } from '@/components/molecules/RecentlyAddedRail';
import { RediscoverRail } from '@/components/molecules/RediscoverRail';
import { TopNavRail } from '@/components/molecules/TopNavRail';
import { LibraryView } from '@/components/organisms/LibraryView';
import { ArtistDetailPage } from '@/components/organisms/ArtistDetailPage';
import { AlbumDetailPage } from '@/components/organisms/AlbumDetailPage';
import { MetadataEditor } from '@/components/organisms/MetadataEditor';
import { UpdatePanel } from '@/components/organisms/UpdatePanel';
import { FullscreenNowPlaying } from '@/components/organisms/FullscreenNowPlaying';
import { NowPlayingBar } from '@/components/organisms/NowPlayingBar';
import { NowPlayingQueueModal } from '@/components/organisms/NowPlayingQueueModal';
import { AcquisitionQueueDrawer } from '@/components/organisms/AcquisitionQueueDrawer';
import { AppShell } from '@/components/templates/AppShell';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import { useArtistCatalog, useCatalogDiscovery } from '@/hooks/useCatalogDiscovery';
import { useNativePlayback } from '@/hooks/useNativePlayback';
import { useTheme } from '@/services/themeService';
import { SettingsView } from '@/components/organisms/SettingsView';
import {
  loadAlbumDetail,
  loadArtistDetail,
  loadArtistInformation,
} from '@/services/catalogService';
import { toTrackItem } from '@/services/libraryService';
import { markPerformance, measurePerformance } from '@/services/performance';
import {
  loadFavoriteTrackIds,
  loadHomeSnapshot,
  loadPersistentPlayerState,
  savePlayerQueue,
  saveLibraryViewPreference,
  setTrackFavorite,
} from '@/services/playerStateService';
import type { HomeSnapshot } from '@/services/tauri-bindings';
import type { IntegrationSettings, IntegrationStatus } from '@/services/tauri-bindings';
import {
  connectLastFm,
  disconnectLastFm,
  loadIntegrations,
  saveIntegrationSettings,
  subscribeIntegrationStatus,
} from '@/services/integrationService';
import type {
  AlbumItem,
  ArtistItem,
  ContinueListeningItem,
  ListeningStatsData,
  NavTab,
  RecentlyAddedItem,
  RediscoverItem,
  LibrarySubTab,
  TrackItem,
} from '@/types';

function formatDuration(seconds: number, zeroLabel = '0m') {
  if (!Number.isFinite(seconds)) return 'Unknown';
  if (seconds <= 0) return zeroLabel;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`;
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1_024)), units.length - 1);
  return `${(bytes / 1_024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

export function DesktopLibraryPage() {
  const { currentTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<NavTab>('HOME');
  const [searchQuery, setSearchQuery] = useState('');
  const { library, selectAndScan, setRootEnabled, rescanRoot, removeRoot } =
    useLibraryScan(searchQuery);
  const discovery = useCatalogDiscovery(searchQuery);
  const artistCatalog = useArtistCatalog(searchQuery);
  const nativePlayback = useNativePlayback();
  const [queue, setQueue] = useState<TrackItem[]>([]);
  const [playerStateLoaded, setPlayerStateLoaded] = useState(false);
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<ReadonlySet<string>>(new Set());
  const [visualizationEnabled, setVisualizationEnabled] = useState(true);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>({
    lastfmEnabled: false,
    discordEnabled: false,
    discordDetail: 'full',
  });
  const [integrationStatuses, setIntegrationStatuses] = useState<IntegrationStatus[]>([]);
  const [lastFmSessionKey, setLastFmSessionKey] = useState('');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('artists');
  const resumeRef = useRef<{ trackId: string | null; positionMs: number }>({
    trackId: null,
    positionMs: 0,
  });
  const [selectedTrack, setSelectedTrack] = useState<TrackItem | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<ArtistItem | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumItem | null>(null);
  const [editingTrack, setEditingTrack] = useState<TrackItem | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
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
  const libraryStats = useMemo<Partial<ListeningStatsData>>(
    () => ({
      timeListened: formatDuration((home?.totalListenedMs ?? 0) / 1_000),
      timeListenedGrowth: 'Recorded by the native player',
      totalTracks: (home?.totalTracks ?? 0).toLocaleString(),
      verifiedLocal: `${library.roots.filter((root) => root.availability === 'online').length} roots online`,
      totalArtists: (home?.totalArtists ?? 0).toLocaleString(),
      artistsCachedStatus: 'Indexed from local metadata',
      totalAlbums: (home?.totalAlbums ?? 0).toLocaleString(),
      albumsMastering: 'SQLite catalog entities',
      libraryDuration: formatDuration((home?.totalDurationMs ?? 0) / 1_000, '0m'),
      libraryDurationSub: `${formatBytes(home?.totalFileSize ?? 0)} indexed`,
      mostListenedArtist: home?.topArtist ?? 'No listening history',
      artistLosslessHours: formatDuration((home?.totalListenedMs ?? 0) / 1_000),
      topGenre: home?.topGenre ?? 'No listening history',
      topGenrePercentage: 'Ranked by played duration',
      favoriteEra: home?.favoriteEra ? `${home.favoriteEra}s` : 'No listening history',
      dynamicRange: 'Ranked by played duration',
      libraryDiskSize: formatBytes(home?.totalFileSize ?? 0),
      losslessPercentage: `${(home?.totalTracks ?? 0).toLocaleString()} local tracks`,
    }),
    [home, library.roots],
  );
  const sessionItems = useMemo<ContinueListeningItem[]>(
    () =>
      (home?.continueListening ?? []).map((track, index) => {
        const item = toTrackItem(track, index);
        return {
          id: item.id,
          type: 'playlist',
          title: item.title,
          subtitle: `${item.artist} • ${item.album}`,
          accentGradient: 'from-amber-500/35 to-neutral-950',
          lastPlayedText: 'Saved listening session',
          lastPlayedTrackName: item.title,
          totalTracksCount: 1,
          coverUrl: item.coverUrl,
        };
      }),
    [home],
  );
  const recentlyAddedItems = useMemo<RecentlyAddedItem[]>(
    () =>
      (home?.recentlyAdded ?? []).map((track, index) => {
        const item = toTrackItem(track, index);
        const format =
          item.codec === 'FLAC' ? 'FLAC 16/44.1' : item.codec === 'MP3' ? 'MP3 320' : item.codec;
        return {
          id: item.id,
          title: item.title,
          artist: item.artist,
          format,
          dateAddedText: 'Recently indexed',
          addedTimestamp: 0,
          trackCount: 1,
          genre: item.genres?.[0] ?? 'Unknown Genre',
          year: item.year || undefined,
          coverUrl: item.coverUrl,
        };
      }),
    [home],
  );
  const rediscoverItems = useMemo<RediscoverItem[]>(
    () =>
      (home?.rediscover ?? []).map((track, index) => {
        const item = toTrackItem(track, index);
        return {
          id: item.id,
          type: 'playlist',
          title: item.title,
          subtitle: `${item.artist} • ${item.album}`,
          lastPlayedText: item.playCount ? `${item.playCount} completed plays` : 'Not played yet',
          lastPlayedTimestamp: 0,
          totalPlayCount: item.playCount ?? 0,
          highlightReason: item.playCount ? 'Least recently heard' : 'Unplayed local track',
          trackCount: 1,
          format: item.codec,
          coverUrl: item.coverUrl,
        };
      }),
    [home],
  );
  const previewTracks = useMemo(() => library.tracks.slice(0, 6), [library.tracks]);
  const listeningRefreshBucket = Math.floor(nativePlayback.playback.positionMs / 5_000);

  useEffect(() => {
    const artistId = selectedArtist?.id;
    if (!artistId) return;
    let active = true;
    void loadArtistInformation(artistId)
      .then((information) => {
        if (!active) return;
        setSelectedArtist((current) =>
          current?.id === artistId
            ? {
                ...current,
                ...information,
                genres: information.genres?.length ? information.genres : current.genres,
                // Local artwork remains the preferred representation of an artist.
                avatarUrl: current.avatarUrl ?? information.avatarUrl,
                bannerUrl: current.bannerUrl ?? information.bannerUrl,
              }
            : current,
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedArtist?.id]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadPersistentPlayerState(), loadHomeSnapshot(), loadFavoriteTrackIds()])
      .then(([player, snapshot, favorites]) => {
        if (!active) return;
        setQueue(player.queue);
        setSelectedTrack(player.queue.find((track) => track.id === player.currentTrackId) ?? null);
        resumeRef.current = {
          trackId: player.currentTrackId,
          positionMs: player.resumePositionMs,
        };
        setHome(snapshot);
        setFavoriteTrackIds(favorites);
        if (
          ['artists', 'albums', 'genres', 'tracks', 'playlists'].includes(
            player.preferences.libraryView,
          )
        ) {
          setLibrarySubTab(player.preferences.libraryView as LibrarySubTab);
        }
        setVisualizationEnabled(player.preferences.visualizationEnabled ?? true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setPlayerStateLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void subscribeIntegrationStatus((next) => {
      setIntegrationStatuses((current) => [
        ...current.filter((status) => status.service !== next.service),
        next,
      ]);
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadIntegrations()
      .then(({ settings, statuses }) => {
        if (!active) return;
        setIntegrationSettings(settings);
        setIntegrationStatuses(statuses);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const updateIntegrations = useCallback(async (next: IntegrationSettings) => {
    setIntegrationSettings(next);
    try {
      setIntegrationSettings(await saveIntegrationSettings(next));
      const refreshed = await loadIntegrations();
      setIntegrationStatuses(refreshed.statuses);
    } catch {
      const restored = await loadIntegrations().catch(() => null);
      if (restored) {
        setIntegrationSettings(restored.settings);
        setIntegrationStatuses(restored.statuses);
      }
    }
  }, []);

  const lastFmStatus = integrationStatuses.find((status) => status.service === 'lastfm');
  const discordStatus = integrationStatuses.find((status) => status.service === 'discord');

  useEffect(() => {
    if (!playerStateLoaded) return;
    void savePlayerQueue(queue.map((track) => track.id));
  }, [playerStateLoaded, queue]);

  useEffect(() => {
    if (!playerStateLoaded) return;
    void loadHomeSnapshot().then(setHome);
  }, [library.totalTracks, listeningRefreshBucket, nativePlayback.endedCount, playerStateLoaded]);

  const changeTrackFavorite = useCallback((trackId: string, favorite: boolean) => {
    setFavoriteTrackIds((current) => {
      const next = new Set(current);
      if (favorite) next.add(trackId);
      else next.delete(trackId);
      return next;
    });
    void setTrackFavorite(trackId, favorite).catch(() => {
      void loadFavoriteTrackIds().then(setFavoriteTrackIds);
    });
  }, []);

  const changeLibrarySubTab = useCallback((tab: LibrarySubTab) => {
    markPerformance(`library-${tab}-navigation-start`);
    setLibrarySubTab(tab);
    void saveLibraryViewPreference(tab);
  }, []);

  useEffect(() => {
    markPerformance(`library-${librarySubTab}-visible`);
    measurePerformance(
      `library-${librarySubTab}-visible`,
      `library-${librarySubTab}-navigation-start`,
      `library-${librarySubTab}-visible`,
    );
  }, [librarySubTab]);

  const selectLibrary = useCallback(async () => {
    setActiveTab('LIBRARY');
    await selectAndScan();
  }, [selectAndScan]);

  const selectArtist = useCallback(
    async (artist: ArtistItem | string) => {
      const summary =
        typeof artist === 'string'
          ? discovery.artists.find(
              (candidate) => candidate.name.toLocaleLowerCase() === artist.toLocaleLowerCase(),
            )
          : artist;
      if (!summary) return;
      setSelectedAlbum(null);
      setSelectedArtist(await loadArtistDetail(summary.id));
      setActiveTab('LIBRARY');
    },
    [discovery.artists],
  );

  const selectAlbum = useCallback(
    async (album: AlbumItem | string) => {
      let albumId: string;
      if (typeof album === 'string') {
        const found = discovery.albums.find(
          (candidate) =>
            candidate.id === album ||
            candidate.title.toLocaleLowerCase() === album.toLocaleLowerCase(),
        );
        albumId = found ? found.id : album;
      } else {
        albumId = album.id;
      }
      // Keep any artist already open so "back" from the album returns to that
      // artist page instead of dropping the user out to the library root.
      setSelectedAlbum(await loadAlbumDetail(albumId));
      setActiveTab('LIBRARY');
    },
    [discovery.albums],
  );

  const playTrack = useCallback(
    async (track: TrackItem) => {
      setSelectedTrack(track);
      setQueue((current) =>
        current.some((item) => item.id === track.id) ? current : [...current, track],
      );
      const started = await nativePlayback.playTrack(track);
      if (started && resumeRef.current.trackId === track.id && resumeRef.current.positionMs > 0) {
        await nativePlayback.seek(resumeRef.current.positionMs / 1_000);
        resumeRef.current = { trackId: null, positionMs: 0 };
      }
    },
    [nativePlayback],
  );

  const playAlbum = useCallback(
    async (album: AlbumItem) => {
      const detail = album.tracks.length > 0 ? album : await loadAlbumDetail(album.id);
      if (detail.tracks[0]) {
        setQueue(detail.tracks);
        await playTrack(detail.tracks[0]);
      }
    },
    [playTrack],
  );

  const playArtist = useCallback(
    async (artist: ArtistItem) => {
      const detail = artist.tracks ? artist : await loadArtistDetail(artist.id);
      if (detail.tracks?.[0]) {
        setQueue(detail.tracks);
        await playTrack(detail.tracks[0]);
      }
    },
    [playTrack],
  );

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

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => {
      const next = !prev;
      if (next) {
        shuffleQueue();
      }
      return next;
    });
  }, [shuffleQueue]);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const playRelativeTrack = useCallback(
    (offset: number) => {
      if (queue.length === 0) return;
      if (repeatMode === 'one' && offset === 0 && currentTrack) {
        void playTrack(currentTrack);
        return;
      }
      const currentIndex = queue.findIndex((track) => track.id === currentTrack?.id);
      if (isShuffle && offset > 0 && queue.length > 1) {
        const candidates = queue.filter((track) => track.id !== currentTrack?.id);
        const randomTrack = candidates[Math.floor(Math.random() * candidates.length)];
        void playTrack(randomTrack);
        return;
      }
      const startIndex = currentIndex < 0 ? 0 : currentIndex;
      if (repeatMode === 'off' && offset > 0 && startIndex >= queue.length - 1) {
        return;
      }
      const nextIndex = (startIndex + offset + queue.length) % queue.length;
      void playTrack(queue[nextIndex]);
    },
    [currentTrack, isShuffle, playTrack, queue, repeatMode],
  );

  const playHomeTrack = useCallback(
    (trackId: string) => {
      const tracks = [
        ...(home?.continueListening ?? []),
        ...(home?.recentlyAdded ?? []),
        ...(home?.rediscover ?? []),
      ];
      const track = tracks.find((candidate) => candidate.id === trackId);
      if (track) void playTrack(toTrackItem(track, 0));
    },
    [home, playTrack],
  );

  useEffect(() => {
    if (nativePlayback.endedCount === completedEnds.current) return;
    completedEnds.current = nativePlayback.endedCount;
    if (repeatMode === 'one' && currentTrack) {
      void playTrack(currentTrack);
    } else {
      playRelativeTrack(1);
    }
  }, [currentTrack, nativePlayback.endedCount, playRelativeTrack, playTrack, repeatMode]);

  const toggleCurrentPlayback = useCallback(() => {
    if (currentTrack && !matchesActivePlayback(nativePlayback.playback.status)) {
      void playTrack(currentTrack);
      return;
    }
    void nativePlayback.togglePlayback();
  }, [currentTrack, nativePlayback, playTrack]);

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

  return (
    <AppShell background={currentTheme.bgCanvasGradient || currentTheme.bgCanvas}>
      <TopNavRail
        activeTab={activeTab}
        onTabChange={(tab) => {
          markPerformance(`navigation-${tab.toLowerCase()}-start`);
          if (tab === 'LIBRARY') setLibrarySubTab('artists');
          setActiveTab(tab);
          markPerformance(`navigation-${tab.toLowerCase()}-visible`);
          measurePerformance(
            `navigation-${tab.toLowerCase()}`,
            `navigation-${tab.toLowerCase()}-start`,
            `navigation-${tab.toLowerCase()}-visible`,
          );
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showPrototypeActions={false}
      />
      <section className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-6 pb-28">
        {activeTab === 'HOME' && (
          <div className="flex flex-col gap-6 py-8 animate-fadeIn">
            <ListeningStats
              stats={libraryStats}
              onCardClick={() => setActiveTab('LIBRARY')}
              showAffinityMetrics={false}
            />

            <ContinueListeningRail
              items={sessionItems}
              onResumeItem={(item) => playHomeTrack(item.id)}
              onItemClick={(item) => playHomeTrack(item.id)}
              emptyMessage="Start a local track and Bebop will retain its real listening session here."
              emptyActionLabel={library.root ? 'Browse indexed tracks' : 'Manage library folders'}
              onEmptyAction={() => {
                if (library.root) setActiveTab('LIBRARY');
                else setActiveTab('SETTINGS');
              }}
            />

            {recentlyAddedItems.length > 0 && (
              <RecentlyAddedRail
                items={recentlyAddedItems}
                onPlayItem={(item) => playHomeTrack(item.id)}
                onItemClick={(item) => playHomeTrack(item.id)}
                onSelectArtist={(artist) => void selectArtist(artist)}
                onSelectAlbum={(album) => void selectAlbum(album)}
              />
            )}

            {rediscoverItems.length > 0 && (
              <RediscoverRail
                items={rediscoverItems}
                onPlayItem={(item) => playHomeTrack(item.id)}
                onItemClick={(item) => playHomeTrack(item.id)}
                onSelectArtist={(artist) => void selectArtist(artist)}
                onSelectAlbum={(album) => void selectAlbum(album)}
              />
            )}

            {previewTracks.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1.5 t-sm bg-amber-400" />
                    <h2 className="text-sm text-neutral-200 t-heading">Library preview</h2>
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
                      className="group flex items-center gap-3 t-control border border-neutral-800 bg-neutral-950/50 p-3 text-left transition hover:-translate-y-0.5 hover:border-amber-400/50 hover:bg-neutral-900"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center t-sm border border-amber-400/25 bg-amber-500/10 text-amber-300">
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
                Bebop recognizes FLAC, WAV, MP3, Ogg Vorbis, AAC, AIFF, and M4A/ALAC without
                uploading them.
              </EmptyState>
            )}
          </div>
        )}

        {activeTab === 'DISCOVER' && (
          <div className="py-8 animate-fadeIn">
            <div className="flex flex-col items-center justify-center gap-3 t-card t-stroke border border-dashed border-neutral-800 bg-neutral-950/40 px-6 py-20 text-center">
              <Compass className="h-10 w-10 text-neutral-700" />
              <h2 className="text-lg font-semibold text-neutral-200">Discover is not built yet</h2>
              <p className="max-w-md text-sm text-neutral-500">
                This will become a dedicated browsing surface. Artist and album pages live under
                Library.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('LIBRARY')}
                className="mt-2 t-control border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:border-neutral-500 hover:text-white"
              >
                Go to Library
              </button>
            </div>
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <SettingsView
            roots={library.roots}
            isScanning={isScanning}
            onAddRoot={() => void selectLibrary()}
            onRescanRoot={(rootId) => void rescanRoot(rootId)}
            onSetRootEnabled={(rootId, enabled) => void setRootEnabled(rootId, enabled)}
            onRemoveRoot={(root) => {
              if (
                window.confirm(`Remove ${root.label} from Bebop? Music files will not be deleted.`)
              ) {
                void removeRoot(root.id);
              }
            }}
            audioSlot={
              <>
                <div className="t-sm border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-300">
                  <label className="mb-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Output device
                    <select
                      value={
                        nativePlayback.outputDevices.find((device) => device.isSelected)?.id ?? ''
                      }
                      onChange={(event) =>
                        void nativePlayback.selectOutput(event.target.value || null)
                      }
                      className="mt-2 block w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm normal-case tracking-normal text-white"
                    >
                      <option value="">System default</option>
                      {nativePlayback.outputDevices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                          {device.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {nativePlayback.playback.output ? (
                    <>
                      <p className="font-semibold text-white">
                        {nativePlayback.playback.output.deviceName}
                      </p>
                      <p className="mt-2">{nativePlayback.playback.output.disclosure}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-neutral-400">
                        <div>
                          <dt>Source</dt>
                          <dd className="text-neutral-200">
                            {nativePlayback.playback.output.sourceBitDepth ?? '—'}-bit ·{' '}
                            {nativePlayback.playback.output.sourceSampleRate} Hz ·{' '}
                            {nativePlayback.playback.output.sourceChannels} ch
                          </dd>
                        </div>
                        <div>
                          <dt>Output</dt>
                          <dd className="text-neutral-200">
                            {nativePlayback.playback.output.outputSampleFormat} ·{' '}
                            {nativePlayback.playback.output.outputSampleRate} Hz ·{' '}
                            {nativePlayback.playback.output.outputChannels} ch
                          </dd>
                        </div>
                      </dl>
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
                  <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={visualizationEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setVisualizationEnabled(enabled);
                        void nativePlayback.setVisualization(enabled);
                      }}
                    />
                    Native 64-band spectrum visualization
                  </label>
                </div>
              </>
            }
            onlineSlot={
              <>
                <div className="t-sm border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-300">
                  <h2 className="text-sm font-semibold text-white">Optional online integrations</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Disabled by default. Integration failures never interrupt local playback.
                  </p>
                  <div className="mt-4 space-y-4">
                    <div className="t-sm border border-neutral-800 p-3">
                      <label className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block font-semibold text-white">Last.fm scrobbling</span>
                          <span className="text-xs text-neutral-500">
                            {lastFmStatus?.configured
                              ? `${lastFmStatus.pendingJobs} queued scrobbles`
                              : 'Requires a release API key and account session'}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={integrationSettings.lastfmEnabled ?? false}
                          onChange={(event) =>
                            void updateIntegrations({
                              ...integrationSettings,
                              lastfmEnabled: event.target.checked,
                            })
                          }
                        />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <input
                          type="password"
                          value={lastFmSessionKey}
                          onChange={(event) => setLastFmSessionKey(event.target.value)}
                          placeholder="Last.fm session key"
                          autoComplete="off"
                          className="min-w-0 flex-1 t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"
                        />
                        <button
                          type="button"
                          disabled={!lastFmSessionKey.trim()}
                          onClick={() => {
                            const key = lastFmSessionKey;
                            setLastFmSessionKey('');
                            void connectLastFm(key).then(setIntegrationStatuses);
                          }}
                          className="t-control border border-neutral-700 px-3 py-2 text-xs disabled:opacity-40"
                        >
                          Store in OS credentials
                        </button>
                        <button
                          type="button"
                          onClick={() => void disconnectLastFm().then(setIntegrationStatuses)}
                          className="t-control border border-neutral-700 px-3 py-2 text-xs"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                    <div className="t-sm border border-neutral-800 p-3">
                      <label className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block font-semibold text-white">
                            Discord Rich Presence
                          </span>
                          <span className="text-xs text-neutral-500">
                            {discordStatus?.configured
                              ? discordStatus.connected
                                ? 'Connected'
                                : 'Ready when Discord is running'
                              : 'Requires a release application ID'}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={integrationSettings.discordEnabled ?? false}
                          onChange={(event) =>
                            void updateIntegrations({
                              ...integrationSettings,
                              discordEnabled: event.target.checked,
                            })
                          }
                        />
                      </label>
                      <label className="mt-3 block text-xs text-neutral-500">
                        Shared detail
                        <select
                          value={integrationSettings.discordDetail ?? 'full'}
                          onChange={(event) =>
                            void updateIntegrations({
                              ...integrationSettings,
                              discordDetail: event.target.value,
                            })
                          }
                          className="mt-1 block t-sm border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
                        >
                          <option value="full">Title, artist, album, and time</option>
                          <option value="private">Only “Listening locally”</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </>
            }
            updatesSlot={<UpdatePanel />}
          />
        )}

        {activeTab === 'LIBRARY' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {isScanning && (
              <div
                role="status"
                className="t-sm border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
              >
                {progressLabel}
              </div>
            )}

            {nativePlayback.error && (
              <div
                role="alert"
                className="flex gap-3 t-sm border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
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
              <div className="flex flex-wrap items-center justify-between gap-3 t-sm border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-xs text-neutral-300">
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
              <div className="t-sm border border-neutral-800 bg-neutral-950/50 p-6 text-neutral-400">
                No folder has been selected yet.
              </div>
            )}

            {library.phase === 'empty' && (
              <div className="t-sm border border-neutral-800 bg-neutral-950/50 p-6 text-neutral-400">
                No supported audio files were found in{' '}
                <span className="text-neutral-200">{library.root}</span>.
              </div>
            )}

            {(library.phase === 'permission-error' || library.phase === 'error') &&
              library.error && (
                <div
                  role="alert"
                  className="flex gap-3 t-sm border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
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
                className="t-sm border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100"
              >
                Indexed {library.tracks.length} track{library.tracks.length === 1 ? '' : 's'}, but
                skipped {library.warnings.length} unreadable or unsafe path
                {library.warnings.length === 1 ? '' : 's'}.
              </div>
            )}

            {selectedAlbum ? (
              <AlbumDetailPage
                album={selectedAlbum}
                currentTrackId={currentTrack?.id}
                isPlaying={isPlaying}
                backLabel={selectedArtist ? 'Back to Artist' : 'Back to Library'}
                onBack={() => setSelectedAlbum(null)}
                onPlayTrack={(track) => void playTrack(track)}
                onEditTrack={setEditingTrack}
                onPlayAlbum={(album) => void playAlbum(album)}
                onSelectArtist={(artist) => void selectArtist(artist)}
                onSelectAlbum={(album) => void selectAlbum(album)}
              />
            ) : selectedArtist ? (
              <ArtistDetailPage
                artist={selectedArtist}
                onBack={() => setSelectedArtist(null)}
                onPlayTrack={(track) => void playTrack(track)}
                onEditTrack={setEditingTrack}
                onPlayArtist={(artist) => void playArtist(artist)}
                onSelectAlbum={(album) => void selectAlbum(album)}
              />
            ) : (
              (library.phase === 'complete' || library.phase === 'partial-error') && (
                <LibraryView
                  tracks={visibleTracks}
                  artists={artistCatalog.items}
                  albums={discovery.albums}
                  genres={discovery.genres}
                  currentTrackId={currentTrack?.id}
                  isPlaying={isPlaying}
                  onPlayTrack={(track) => void playTrack(track)}
                  onPlayAlbum={(album) => void playAlbum(album)}
                  onPlayArtist={(artist) => void playArtist(artist)}
                  onSelectArtist={(artist) => void selectArtist(artist)}
                  onSelectAlbum={(album) => void selectAlbum(album)}
                  onEditTrack={setEditingTrack}
                  favoriteTrackIds={favoriteTrackIds}
                  onFavoriteChange={changeTrackFavorite}
                  selectedSubTab={librarySubTab}
                  onSubTabChange={changeLibrarySubTab}
                  artistHasMore={Boolean(artistCatalog.nextCursor)}
                  artistLoading={artistCatalog.loading}
                  onLoadMoreArtists={() => void artistCatalog.loadMore()}
                  queue={queue}
                  onReplaceQueue={setQueue}
                  onAppendQueue={(tracks) =>
                    setQueue((current) => [
                      ...current,
                      ...tracks.filter((track) => !current.some((item) => item.id === track.id)),
                    ])
                  }
                />
              )
            )}
          </div>
        )}
      </section>

      <NowPlayingBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeSeconds={nativePlayback.playback.positionMs / 1_000}
        onPlayPause={toggleCurrentPlayback}
        onNext={() => playRelativeTrack(1)}
        onPrev={() => playRelativeTrack(-1)}
        onSeek={(seconds) => void nativePlayback.seek(seconds)}
        onExpandFullscreen={() => setIsFullscreenOpen(true)}
        onToggleQueue={() => setIsQueueOpen((open) => !open)}
        queueCount={queue.length}
        isShuffle={isShuffle}
        onToggleShuffle={toggleShuffle}
        repeatMode={repeatMode}
        onToggleRepeat={toggleRepeat}
        volume={nativePlayback.playback.volume ?? 1}
        muted={nativePlayback.playback.muted}
        onVolumeChange={(volume) => void nativePlayback.setVolume(volume)}
        onToggleMute={() => void nativePlayback.toggleMute()}
        volumeLocked={nativePlayback.playback.hifiMode}
        onUnlockVolume={() => nativePlayback.setHifi(false)}
        spectrumAvailable={visualizationEnabled}
        getSpectrumBins={nativePlayback.getSpectrumBins}
        onSelectArtist={(artist) => void selectArtist(artist)}
        onSelectAlbum={(album) => void selectAlbum(album)}
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
        onSelectArtist={(artist) => void selectArtist(artist)}
        onSelectAlbum={(album) => void selectAlbum(album)}
      />

      <FullscreenNowPlaying
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeSeconds={nativePlayback.playback.positionMs / 1_000}
        onPlayPause={toggleCurrentPlayback}
        onNext={() => playRelativeTrack(1)}
        onPrev={() => playRelativeTrack(-1)}
        onSeek={(seconds) => void nativePlayback.seek(seconds)}
        queue={queue}
        onPlayQueueTrack={(track) => void playTrack(track)}
        isShuffle={isShuffle}
        onToggleShuffle={toggleShuffle}
        repeatMode={repeatMode}
        onToggleRepeat={toggleRepeat}
        volume={nativePlayback.playback.volume ?? 1}
        muted={nativePlayback.playback.muted}
        onVolumeChange={(volume) => void nativePlayback.setVolume(volume)}
        onToggleMute={() => void nativePlayback.toggleMute()}
        volumeLocked={nativePlayback.playback.hifiMode}
        onUnlockVolume={() => nativePlayback.setHifi(false)}
        spectrumAvailable={visualizationEnabled}
        getSpectrumBins={nativePlayback.getSpectrumBins}
        onSelectArtist={(artist) => void selectArtist(artist)}
        onSelectAlbum={(album) => void selectAlbum(album)}
      />
      {editingTrack && (
        <MetadataEditor track={editingTrack} onClose={() => setEditingTrack(null)} />
      )}
      <AcquisitionQueueDrawer />
    </AppShell>
  );
}

function matchesActivePlayback(status: string) {
  return status === 'playing' || status === 'paused';
}
