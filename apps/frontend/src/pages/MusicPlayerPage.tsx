/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { TopNavRail } from '@/components/molecules/TopNavRail';
import { ListeningStats } from '@/components/molecules/ListeningStats';
import { ContinueListeningRail } from '@/components/molecules/ContinueListeningRail';
import { RecentlyAddedRail } from '@/components/molecules/RecentlyAddedRail';
import { RediscoverRail } from '@/components/molecules/RediscoverRail';
import { LibraryView } from '@/components/organisms/LibraryView';
import { ArtistDetailPage } from '@/components/organisms/ArtistDetailPage';
import { AlbumDetailPage } from '@/components/organisms/AlbumDetailPage';
import { NowPlayingBar } from '@/components/organisms/NowPlayingBar';
import { FullscreenNowPlaying } from '@/components/organisms/FullscreenNowPlaying';
import { NowPlayingQueueModal } from '@/components/organisms/NowPlayingQueueModal';
import { AntraEngineProvider } from '@/services/antraEngineService';
import { AntraQueueDrawer } from '@/components/organisms/AntraQueueDrawer';
import {
  NavTab,
  ContinueListeningItem,
  RecentlyAddedItem,
  RediscoverItem,
  TrackItem,
  AlbumItem,
  ArtistItem,
} from '@/types';
import { LOCAL_TRACKS, LOCAL_ALBUMS, LOCAL_ARTISTS } from '@/demo/catalog';

import { ThemeProvider, useTheme } from '@/services/themeService';
import { ThemeSelectorModal } from '@/components/organisms/ThemeSelectorModal';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DesktopLibraryPage } from './DesktopLibraryPage';

type DemoAudioEngine = (typeof import('@/services/realAudioEngine'))['realAudioEngine'];

export default function MusicPlayerPage() {
  const demoMode = useDemoMode();

  return (
    <ThemeProvider>
      <AntraEngineProvider>
        {demoMode ? <DemoMusicPlayer /> : <DesktopLibraryPage />}
      </AntraEngineProvider>
    </ThemeProvider>
  );
}

function DemoMusicPlayer() {
  const { currentTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<NavTab>('HOME');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<ArtistItem | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumItem | null>(null);

  // Audio Playback state
  // Default to Bebop's iconic track "Tank!" by The Seatbelts or Pink Floyd's "Time"
  const defaultTrack = LOCAL_TRACKS.find((t) => t.title === 'Tank!') || LOCAL_TRACKS[5];
  const [currentTrack, setCurrentTrack] = useState<TrackItem>(defaultTrack);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [nowResuming, setNowResuming] = useState<string | null>(null);
  const [audioEngine, setAudioEngine] = useState<DemoAudioEngine | null>(null);

  // Fullscreen view & Queue modal states
  const [isFullscreenNowPlaying, setIsFullscreenNowPlaying] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);

  // Playback Queue state
  const [playQueue, setPlayQueue] = useState<TrackItem[]>([
    defaultTrack,
    ...LOCAL_TRACKS.filter((t) => t.id !== defaultTrack.id).slice(0, 12),
  ]);

  useEffect(() => {
    let cancelled = false;
    void import('@/services/realAudioEngine').then(({ realAudioEngine }) => {
      if (!cancelled) setAudioEngine(realAudioEngine);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNextTrack = useCallback(() => {
    if (playQueue.length > 0) {
      const currentIndex = playQueue.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % playQueue.length;
      handlePlayTrack(playQueue[nextIndex]);
    } else {
      const currentIndex = LOCAL_TRACKS.findIndex((t) => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % LOCAL_TRACKS.length;
      handlePlayTrack(LOCAL_TRACKS[nextIndex]);
    }
  }, [playQueue, currentTrack]);

  const handlePrevTrack = useCallback(() => {
    if (playQueue.length > 0) {
      const currentIndex = playQueue.findIndex((t) => t.id === currentTrack?.id);
      const prevIndex = (currentIndex - 1 + playQueue.length) % playQueue.length;
      handlePlayTrack(playQueue[prevIndex]);
    } else {
      const currentIndex = LOCAL_TRACKS.findIndex((t) => t.id === currentTrack?.id);
      const prevIndex = (currentIndex - 1 + LOCAL_TRACKS.length) % LOCAL_TRACKS.length;
      handlePlayTrack(LOCAL_TRACKS[prevIndex]);
    }
  }, [playQueue, currentTrack]);

  // Hook real audio engine events
  useEffect(() => {
    if (!audioEngine) return;
    audioEngine.onTimeUpdate((current) => {
      setCurrentTimeSeconds(Math.floor(current));
    });

    audioEngine.onStateChange((playing) => {
      setIsPlaying(playing);
    });

    audioEngine.onTrackEnd(() => {
      handleNextTrack();
    });
  }, [audioEngine, handleNextTrack]);

  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);
    setSelectedArtist(null); // Reset detail view when switching top tabs
    setSelectedAlbum(null);
  };

  const handlePlayTrack = (track: TrackItem) => {
    setCurrentTrack(track);
    setCurrentTimeSeconds(0);
    setNowResuming(`Track: "${track.title}" by ${track.artist}`);

    // Start real playback & FFT stream
    void audioEngine?.playTrack(track);

    // Ensure track is present in queue
    setPlayQueue((prev) => {
      if (!prev.some((t) => t.id === track.id)) {
        return [track, ...prev];
      }
      return prev;
    });
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      audioEngine?.pause();
    } else {
      if (currentTrack) {
        audioEngine?.resume();
      }
    }
  };

  const handleSeek = (seconds: number) => {
    setCurrentTimeSeconds(Math.floor(seconds));
    audioEngine?.seek(seconds);
  };

  const handleImportAudioFile = async (file: File) => {
    if (!audioEngine) return;
    const importedTrack = await audioEngine.loadLocalAudioFile(file);
    handlePlayTrack(importedTrack);
    setNowResuming(`Imported File: "${importedTrack.title}"`);
  };

  const handlePlayAlbum = (album: AlbumItem) => {
    if (album.tracks && album.tracks.length > 0) {
      handlePlayTrack(album.tracks[0]);
      setPlayQueue(album.tracks);
    }
    setNowResuming(`Album: "${album.title}" by ${album.artist}`);
  };

  const handlePlayArtist = (artist: ArtistItem) => {
    const artistTracks = LOCAL_TRACKS.filter(
      (t) => t.artist.toLowerCase() === artist.name.toLowerCase(),
    );
    if (artistTracks.length > 0) {
      handlePlayTrack(artistTracks[0]);
      setPlayQueue(artistTracks);
    }
    setNowResuming(`Artist: ${artist.displayName || artist.name} Discography`);
  };

  const handleRemoveQueueTrack = (index: number) => {
    setPlayQueue((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMoveQueueTrack = (fromIndex: number, toIndex: number) => {
    setPlayQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleClearQueue = () => {
    setPlayQueue((prev) => (currentTrack ? [currentTrack] : prev.slice(0, 1)));
  };

  const handleShuffleQueue = () => {
    setPlayQueue((prev) => {
      const current = prev.find((t) => t.id === currentTrack?.id);
      const others = prev.filter((t) => t.id !== currentTrack?.id);
      const shuffled = [...others].sort(() => Math.random() - 0.5);
      return current ? [current, ...shuffled] : shuffled;
    });
  };

  const handleSelectArtist = (artistOrName: ArtistItem | string) => {
    setSelectedAlbum(null);
    if (typeof artistOrName === 'string') {
      const match = LOCAL_ARTISTS.find(
        (a) =>
          a.name.toLowerCase() === artistOrName.toLowerCase() ||
          a.displayName?.toLowerCase().includes(artistOrName.toLowerCase()) ||
          artistOrName.toLowerCase().includes(a.name.toLowerCase()),
      );
      if (match) {
        setSelectedArtist(match);
      } else {
        const artistTracks = LOCAL_TRACKS.filter(
          (t) =>
            t.artist.toLowerCase().includes(artistOrName.toLowerCase()) ||
            artistOrName.toLowerCase().includes(t.artist.toLowerCase()),
        );
        setSelectedArtist({
          id: `artist-${artistOrName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: artistOrName,
          genres: ['Lossless Audiophile'],
          albumCount: 1,
          trackCount: artistTracks.length || 1,
          totalDuration: '45m 12s',
          avatarUrl:
            artistTracks[0]?.coverUrl ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          featuredCoverUrl:
            artistTracks[0]?.coverUrl ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          losslessPlaytime: '12.4 hrs',
          losslessPercentage: '100% Lossless',
          topTracks: artistTracks.map((t, idx) => ({
            id: t.id,
            rank: idx + 1,
            title: t.title,
            artist: t.artist,
            album: t.album,
            dynamicRange: t.dynamicRange,
            format: t.sampleRate,
            playCount: 42 - idx * 2,
            duration: t.duration,
            durationSeconds: t.durationSeconds,
          })),
        });
      }
    } else {
      setSelectedArtist(artistOrName);
    }
  };

  const handleSelectAlbum = (albumOrTitle: AlbumItem | string) => {
    setSelectedArtist(null);
    if (typeof albumOrTitle === 'string') {
      const match = LOCAL_ALBUMS.find(
        (a) =>
          a.title.toLowerCase().includes(albumOrTitle.toLowerCase()) ||
          albumOrTitle.toLowerCase().includes(a.title.toLowerCase()),
      );
      if (match) {
        setSelectedAlbum(match);
      } else {
        const albumTracks = LOCAL_TRACKS.filter(
          (t) =>
            t.album.toLowerCase().includes(albumOrTitle.toLowerCase()) ||
            albumOrTitle.toLowerCase().includes(t.album.toLowerCase()),
        );
        if (albumTracks.length > 0) {
          const first = albumTracks[0];
          setSelectedAlbum({
            id: `album-${albumOrTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            title: first.album || albumOrTitle,
            artist: first.artist,
            year: first.year || 2023,
            trackCount: albumTracks.length,
            totalDuration: '42m 18s',
            format: (first.sampleRate?.includes('24/192') ? 'FLAC 24/192' : 'FLAC 24/96') as any,
            codec: first.codec || 'FLAC',
            catalogNumber: first.catalogNumber || 'CAT-MASTER',
            dynamicRange: first.dynamicRange || 'DR14',
            coverUrl: first.coverUrl || '',
            tracks: albumTracks,
          });
        }
      }
    } else {
      setSelectedAlbum(albumOrTitle);
    }
  };

  const handleResumeItem = (item: ContinueListeningItem) => {
    if (item.type === 'artist') {
      const matchArtist = LOCAL_ARTISTS.find(
        (a) => a.name.toLowerCase() === item.title.toLowerCase(),
      );
      if (matchArtist) {
        setSelectedAlbum(null);
        setSelectedArtist(matchArtist);
        return;
      }
    } else if (item.type === 'album') {
      const matchAlbum = LOCAL_ALBUMS.find(
        (a) =>
          a.title.toLowerCase().includes(item.title.toLowerCase()) ||
          item.title.toLowerCase().includes(a.title.toLowerCase()),
      );
      if (matchAlbum) {
        setSelectedArtist(null);
        setSelectedAlbum(matchAlbum);
        return;
      }
    }
    const match = LOCAL_TRACKS.find(
      (t) => t.title.toLowerCase() === item.lastPlayedTrackName?.toLowerCase(),
    );
    if (match) {
      handlePlayTrack(match);
    } else {
      setIsPlaying(true);
    }
    setNowResuming(`${item.type.toUpperCase()}: ${item.title}`);
  };

  const handlePlayRecent = (item: RecentlyAddedItem) => {
    const match = LOCAL_TRACKS.find((t) => t.album.toLowerCase() === item.title.toLowerCase());
    if (match) {
      handlePlayTrack(match);
    } else {
      setIsPlaying(true);
    }
    setNowResuming(`RECENT: ${item.title} by ${item.artist} (${item.format})`);
  };

  const handlePlayRediscover = (item: RediscoverItem) => {
    const match = LOCAL_TRACKS.find((t) => t.album.toLowerCase() === item.title.toLowerCase());
    if (match) {
      handlePlayTrack(match);
    } else {
      setIsPlaying(true);
    }
    setNowResuming(`REDISCOVER ${item.type.toUpperCase()}: ${item.title}`);
  };

  return (
    <div
      id="app-root"
      style={{
        backgroundColor: currentTheme.bgCanvas,
        background: currentTheme.bgCanvasGradient || currentTheme.bgCanvas,
      }}
      className="min-h-screen text-neutral-100 flex flex-col font-sans pb-28 transition-colors duration-500 relative overflow-x-hidden"
    >
      {/* Dynamic Ambient Background Glow Orbs for Optical Depth */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        {currentTheme.ambientOrbs?.map((orb, index) => (
          <div
            key={index}
            style={{
              background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
              width: orb.size,
              height: orb.size,
              opacity: orb.opacity,
            }}
            className={`absolute ${orb.position.includes('top') ? 'top-0' : 'bottom-0'} ${
              orb.position.includes('left') ? 'left-0' : 'right-0'
            } blur-3xl transition-all duration-700 pointer-events-none`}
          />
        ))}

        {/* Thematic Ambient Pattern Textures */}
        {currentTheme.patternOverlay === 'starfield' && (
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff22_1px,transparent_1px),radial-gradient(#38bdf825_1.5px,transparent_1.5px)] bg-[size:48px_48px,96px_96px] opacity-40 pointer-events-none" />
        )}
        {currentTheme.patternOverlay === 'cyber-grid' && (
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:36px_36px] opacity-35 pointer-events-none" />
        )}
        {currentTheme.patternOverlay === 'scanlines' && (
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.3)_50%)] bg-[size:100%_4px] opacity-30 pointer-events-none" />
        )}
        {currentTheme.patternOverlay === 'dots' && (
          <div className="absolute inset-0 bg-[radial-gradient(#f43f5e20_1px,transparent_1px)] bg-[size:28px_28px] opacity-35 pointer-events-none" />
        )}
      </div>

      {/* Top Navigation Rail */}
      <TopNavRail
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onImportAudioFile={handleImportAudioFile}
      />

      {/* Main Content Area - Full Window Width */}
      <main
        id="main-content"
        className="relative z-10 flex-1 w-full px-4 sm:px-8 lg:px-12 2xl:px-16 py-6 flex flex-col gap-8"
      >
        {/* If an album is currently selected, show the AlbumDetailPage */}
        {selectedAlbum ? (
          <div id="album-page-container" className="animate-fadeIn">
            <AlbumDetailPage
              album={selectedAlbum}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onBack={() => setSelectedAlbum(null)}
              onPlayTrack={handlePlayTrack}
              onPlayAlbum={handlePlayAlbum}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
            />
          </div>
        ) : selectedArtist ? (
          /* If an artist is currently selected, show the ArtistDetailPage */
          <div id="artist-page-container" className="animate-fadeIn">
            <ArtistDetailPage
              artist={selectedArtist}
              onBack={() => setSelectedArtist(null)}
              onPlayTrack={handlePlayTrack}
              onPlayArtist={handlePlayArtist}
              onSelectAlbum={handleSelectAlbum}
            />
          </div>
        ) : (
          <>
            {/* 1. HOME VIEW */}
            {activeTab === 'HOME' && (
              <div id="home-view-container" className="flex flex-col gap-8 animate-fadeIn">
                {/* Listening Stats Component */}
                <ListeningStats />

                {/* Continue Listening Rail (Albums, Artists, Playlists) */}
                <ContinueListeningRail
                  onResumeItem={handleResumeItem}
                  onSelectArtist={handleSelectArtist}
                  onSelectAlbum={handleSelectAlbum}
                  onItemClick={(item) => {
                    if (item.type === 'artist') {
                      handleSelectArtist(item.title);
                    } else if (item.type === 'album') {
                      handleSelectAlbum(item.title);
                    }
                  }}
                />

                {/* Recently Added Rail (Local Library Ingests) */}
                <RecentlyAddedRail
                  onPlayItem={handlePlayRecent}
                  onSelectArtist={handleSelectArtist}
                  onSelectAlbum={handleSelectAlbum}
                  onItemClick={(item) => {
                    handleSelectAlbum(item.title);
                  }}
                />

                {/* Rediscover Rail (Unplayed Local Gems & Deep Cuts) */}
                <RediscoverRail
                  onPlayItem={handlePlayRediscover}
                  onSelectArtist={handleSelectArtist}
                  onSelectAlbum={handleSelectAlbum}
                  onItemClick={(item) => {
                    if (item.type === 'artist') {
                      handleSelectArtist(item.title);
                    } else if (item.type === 'album') {
                      handleSelectAlbum(item.title);
                    }
                  }}
                />
              </div>
            )}

            {/* 2. LIBRARY VIEW */}
            {activeTab === 'LIBRARY' && (
              <div id="library-view-section" className="flex flex-col gap-4 animate-fadeIn">
                <LibraryView
                  tracks={LOCAL_TRACKS}
                  artists={LOCAL_ARTISTS}
                  albums={LOCAL_ALBUMS}
                  showDemoDiscovery={true}
                  currentTrackId={currentTrack?.id}
                  isPlaying={isPlaying}
                  onPlayTrack={handlePlayTrack}
                  onPlayAlbum={handlePlayAlbum}
                  onPlayArtist={handlePlayArtist}
                  onSelectArtist={handleSelectArtist}
                  onSelectAlbum={handleSelectAlbum}
                />
              </div>
            )}

            {/* 3. DISCOVER & SETTINGS TABS */}
            {['DISCOVER', 'SETTINGS'].includes(activeTab) && (
              <div
                id="other-view-container"
                className="p-6 bg-[#0c1017] border border-neutral-800 rounded-md"
              >
                <h1 className="text-xl font-bold text-white mb-2">{activeTab}</h1>
                <p className="text-sm text-neutral-400">
                  {activeTab === 'DISCOVER'
                    ? 'Discover lossless recommendations and high-res local community favorites.'
                    : 'Configure audio drivers, bit-perfect WASAPI output, and library directory paths.'}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Status Toast when triggered */}
      {nowResuming && (
        <div
          id="resume-toast"
          className="fixed bottom-24 right-6 p-3 px-4 bg-[#0e131d] border border-amber-500/50 text-white text-xs rounded-lg shadow-2xl flex items-center justify-between gap-4 z-50 animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>
              Now Loaded: <strong className="text-amber-400">{nowResuming}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setNowResuming(null)}
            className="text-neutral-400 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Antra Library Engine Download Drawer */}
      <AntraQueueDrawer onSelectAlbum={handleSelectAlbum} />

      {/* Persistent Bottom Audiophile Now-Playing Bar */}
      <NowPlayingBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeSeconds={currentTimeSeconds}
        onPlayPause={handleTogglePlay}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onSeek={handleSeek}
        onSelectArtist={handleSelectArtist}
        onSelectAlbum={handleSelectAlbum}
        onExpandFullscreen={() => setIsFullscreenNowPlaying(true)}
        onToggleQueue={() => setIsQueueModalOpen((prev) => !prev)}
        queueCount={playQueue.length}
        frequencyDataProvider={audioEngine?.getFrequencyData.bind(audioEngine)}
      />

      {/* Now Playing Queue Modal */}
      <NowPlayingQueueModal
        isOpen={isQueueModalOpen}
        onClose={() => setIsQueueModalOpen(false)}
        queue={playQueue}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayTrack={handlePlayTrack}
        onRemoveTrack={handleRemoveQueueTrack}
        onMoveTrack={handleMoveQueueTrack}
        onClearQueue={handleClearQueue}
        onShuffleQueue={handleShuffleQueue}
        onSelectArtist={handleSelectArtist}
        onSelectAlbum={handleSelectAlbum}
      />

      {/* Fullscreen Now Playing Overlay View */}
      <FullscreenNowPlaying
        isOpen={isFullscreenNowPlaying}
        onClose={() => setIsFullscreenNowPlaying(false)}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeSeconds={currentTimeSeconds}
        onPlayPause={handleTogglePlay}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onSeek={handleSeek}
        queue={playQueue}
        onPlayQueueTrack={handlePlayTrack}
        onSelectArtist={handleSelectArtist}
        onSelectAlbum={handleSelectAlbum}
        frequencyDataProvider={audioEngine?.getFrequencyData.bind(audioEngine)}
      />

      {/* Theme Studio Palette Customizer Modal */}
      <ThemeSelectorModal />
    </div>
  );
}
