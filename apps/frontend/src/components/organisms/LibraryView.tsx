import React, { useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { AlbumsGridView } from './AlbumsGridView';
import { ArtistsGridView } from './ArtistsGridView';
import { GenresGridView, LOCAL_GENRES, type GenreCategory } from './GenresGridView';
import { TracksTableView } from './TracksTableView';
import { PlaylistsView } from './PlaylistsView';
import type { PlaylistSummary } from '@/services/playlistService';
import { AlbumItem, ArtistItem, LibrarySubTab, TrackItem } from '@/types';

interface LibraryViewProps {
  tracks: TrackItem[];
  artists?: ArtistItem[];
  albums?: AlbumItem[];
  genres?: GenreCategory[];
  currentTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (track: TrackItem) => void;
  onPlayAlbum?: (album: AlbumItem) => void;
  onPlayArtist?: (artist: ArtistItem) => void;
  onSelectArtist?: (artist: ArtistItem | string) => void;
  onSelectAlbum?: (album: AlbumItem | string) => void;
  onEditTrack?: (track: TrackItem) => void;
  favoriteTrackIds?: ReadonlySet<string>;
  onFavoriteChange?: (trackId: string, favorite: boolean) => void;
  selectedSubTab?: LibrarySubTab;
  onSubTabChange?: (tab: LibrarySubTab) => void;
  showDemoDiscovery?: boolean;
  artistHasMore?: boolean;
  artistLoading?: boolean;
  onLoadMoreArtists?: () => void;
  queue?: TrackItem[];
  onReplaceQueue?: (tracks: TrackItem[]) => void;
  onAppendQueue?: (tracks: TrackItem[]) => void;
  onPlayAll?: () => void;
  initialSeedTrackId?: string | null;
  onClearInitialSeedTrackId?: () => void;
  /** Bumped to pop the Playlists page open with the Liked Songs card expanded. */
  openLikedSongsSignal?: number;
  onContextMenu?: (track: TrackItem, event: React.MouseEvent) => void;
  onAlbumContextMenu?: (album: AlbumItem, event: React.MouseEvent) => void;
  onArtistContextMenu?: (artist: ArtistItem, event: React.MouseEvent) => void;
  onPlaylistContextMenu?: (playlist: PlaylistSummary, event: React.MouseEvent) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  tracks,
  showDemoDiscovery = false,
  artists = [],
  albums = [],
  genres = showDemoDiscovery ? LOCAL_GENRES : [],
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onPlayAlbum,
  onPlayArtist,
  onSelectArtist,
  onSelectAlbum,
  onEditTrack,
  favoriteTrackIds,
  onFavoriteChange,
  selectedSubTab,
  onSubTabChange,
  artistHasMore,
  artistLoading,
  onLoadMoreArtists,
  queue = [],
  onReplaceQueue,
  onAppendQueue,
  onPlayAll,
  initialSeedTrackId,
  onClearInitialSeedTrackId,
  openLikedSongsSignal,
  onContextMenu,
  onAlbumContextMenu,
  onArtistContextMenu,
  onPlaylistContextMenu,
}) => {
  const [localSubTab, setLocalSubTab] = useState<LibrarySubTab>('playlists');
  const activeSubTab = selectedSubTab ?? localSubTab;
  const setActiveSubTab = (tab: LibrarySubTab) => {
    setLocalSubTab(tab);
    onSubTabChange?.(tab);
  };

  const showDiscoveryEmptyState = () => (
    <div className="t-sm border border-neutral-800 bg-neutral-950/50 p-6 text-sm text-neutral-400">
      No matching tagged entities were found. Untagged files remain available under Tracks with
      explicit Unknown Artist and Unknown Album fallbacks.
    </div>
  );

  const handlePlayAllCurrentSubTab = () => {
    if (onPlayAll) {
      onPlayAll();
    } else if (tracks.length > 0) {
      onReplaceQueue?.(tracks);
      onPlayTrack(tracks[0]);
    }
  };

  return (
    <div id="library-view-container" className="flex w-full flex-col gap-4 font-sans">
      <div
        id="library-subnav"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-2"
      >
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {(['artists', 'albums', 'genres', 'tracks', 'playlists'] as LibrarySubTab[]).map(
            (tab) => (
              <button
                key={tab}
                id={`subtab-${tab}`}
                type="button"
                onClick={() => setActiveSubTab(tab)}
                className={`t-control border px-3 py-1 capitalize transition-colors flex items-center gap-1.5 ${
                  activeSubTab === tab
                    ? 'border-amber-500/60 bg-amber-500/20 font-bold text-amber-400'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span>
                  [
                  {tab === 'albums'
                    ? 'Album'
                    : tab === 'artists'
                      ? 'Artist'
                      : tab === 'genres'
                        ? 'Genre'
                        : tab === 'playlists'
                          ? 'Playlists'
                          : 'Tracks'}
                  ]
                </span>
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-neutral-500 hidden sm:inline">
            {activeSubTab === 'tracks' &&
              `${tracks.length} indexed track${tracks.length === 1 ? '' : 's'}`}
            {activeSubTab === 'artists' &&
              `${artists.length} indexed artist${artists.length === 1 ? '' : 's'}`}
            {activeSubTab === 'albums' &&
              `${albums.length} indexed album${albums.length === 1 ? '' : 's'}`}
            {activeSubTab === 'genres' &&
              `${genres.length} indexed genre${genres.length === 1 ? '' : 's'}`}
          </span>
          {tracks.length > 0 && (
            <button
              id="btn-library-play-all"
              type="button"
              onClick={handlePlayAllCurrentSubTab}
              style={{
                backgroundColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 16%, transparent)',
                borderColor: 'var(--c-p, #f59e0b)',
                color: 'var(--c-p, #f59e0b)',
              }}
              className="flex items-center gap-1.5 px-3 py-1 t-control border text-xs font-bold hover:brightness-125 transition-all cursor-pointer shadow-sm"
              title="Play all tracks in library"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play All</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'tracks' && (
        <TracksTableView
          tracks={tracks}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          onPlayTrack={onPlayTrack}
          onSelectArtist={onSelectArtist as ((artist: string) => void) | undefined}
          onSelectAlbum={onSelectAlbum as ((album: string) => void) | undefined}
          onEditTrack={onEditTrack}
          favoriteTrackIds={favoriteTrackIds}
          onFavoriteChange={onFavoriteChange}
          onContextMenu={onContextMenu}
        />
      )}
      {activeSubTab === 'artists' &&
        (artists.length > 0 ? (
          <ArtistsGridView
            artists={artists}
            onPlayArtist={onPlayArtist}
            onSelectArtist={onSelectArtist}
            onContextMenu={onArtistContextMenu}
            hasMore={artistHasMore}
            isLoading={artistLoading}
            onLoadMore={onLoadMoreArtists}
          />
        ) : (
          showDiscoveryEmptyState()
        ))}
      {activeSubTab === 'albums' &&
        (albums.length > 0 ? (
          <AlbumsGridView
            albums={albums}
            onPlayAlbum={onPlayAlbum}
            onSelectAlbum={onSelectAlbum || onPlayAlbum}
            onSelectArtist={onSelectArtist}
            onContextMenu={onAlbumContextMenu}
          />
        ) : (
          showDiscoveryEmptyState()
        ))}
      {activeSubTab === 'genres' &&
        (genres.length > 0 ? (
          <GenresGridView
            genres={genres}
            tracks={tracks}
            onPlayTrack={onPlayTrack}
            onSelectArtist={onSelectArtist as ((artist: string) => void) | undefined}
          />
        ) : (
          showDiscoveryEmptyState()
        ))}
      {activeSubTab === 'playlists' ? (
        <PlaylistsView
          tracks={tracks}
          queue={queue}
          onPlayTrack={onPlayTrack}
          onReplaceQueue={onReplaceQueue ?? (() => undefined)}
          onAppendQueue={onAppendQueue ?? (() => undefined)}
          initialSeedTrackId={initialSeedTrackId}
          onClearInitialSeedTrackId={onClearInitialSeedTrackId}
          favoriteTrackIds={favoriteTrackIds}
          onFavoriteChange={onFavoriteChange}
          openLikedSongsSignal={openLikedSongsSignal}
          onTrackContextMenu={onContextMenu}
          onPlaylistContextMenu={onPlaylistContextMenu}
        />
      ) : null}
    </div>
  );
};
