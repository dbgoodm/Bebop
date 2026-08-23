import React, { useState } from 'react';
import { AlbumsGridView } from './AlbumsGridView';
import { ArtistsGridView } from './ArtistsGridView';
import { GenresGridView, LOCAL_GENRES, type GenreCategory } from './GenresGridView';
import { TracksTableView } from './TracksTableView';
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
}) => {
  const [localSubTab, setLocalSubTab] = useState<LibrarySubTab>(
    showDemoDiscovery ? 'artists' : 'tracks',
  );
  const activeSubTab = selectedSubTab ?? localSubTab;
  const setActiveSubTab = (tab: LibrarySubTab) => {
    setLocalSubTab(tab);
    onSubTabChange?.(tab);
  };

  const showDiscoveryEmptyState = () => (
    <div className="rounded border border-neutral-800 bg-neutral-950/50 p-6 text-sm text-neutral-400">
      No matching tagged entities were found. Untagged files remain available under Tracks with
      explicit Unknown Artist and Unknown Album fallbacks.
    </div>
  );

  return (
    <div id="library-view-container" className="flex w-full flex-col gap-4 font-sans">
      <div
        id="library-subnav"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-2"
      >
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {(['artists', 'albums', 'genres', 'tracks'] as LibrarySubTab[]).map((tab) => (
            <button
              key={tab}
              id={`subtab-${tab}`}
              type="button"
              onClick={() => setActiveSubTab(tab)}
              className={`rounded border px-3 py-1 capitalize transition-colors ${
                activeSubTab === tab
                  ? 'border-amber-500/60 bg-amber-500/20 font-bold text-amber-400'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              [
              {tab === 'albums'
                ? 'Album'
                : tab === 'artists'
                  ? 'Artist'
                  : tab === 'genres'
                    ? 'Genre'
                    : 'Tracks'}
              ]
            </button>
          ))}
        </div>
        <div className="font-mono text-xs text-neutral-500">
          {activeSubTab === 'tracks' &&
            `${tracks.length} indexed track${tracks.length === 1 ? '' : 's'}`}
          {activeSubTab === 'artists' &&
            `${artists.length} indexed artist${artists.length === 1 ? '' : 's'}`}
          {activeSubTab === 'albums' &&
            `${albums.length} indexed album${albums.length === 1 ? '' : 's'}`}
          {activeSubTab === 'genres' &&
            `${genres.length} indexed genre${genres.length === 1 ? '' : 's'}`}
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
        />
      )}
      {activeSubTab === 'artists' &&
        (artists.length > 0 ? (
          <ArtistsGridView
            artists={artists}
            onPlayArtist={onPlayArtist}
            onSelectArtist={onSelectArtist}
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
    </div>
  );
};
