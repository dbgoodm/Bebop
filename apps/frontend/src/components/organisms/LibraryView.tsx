import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { TracksTableView } from './TracksTableView';
import { ArtistsGridView } from './ArtistsGridView';
import { AlbumsGridView } from './AlbumsGridView';
import { GenresGridView, LOCAL_GENRES } from './GenresGridView';
import { LibrarySubTab, TrackItem, AlbumItem, ArtistItem, ColumnVisibility } from '@/types';
import { LOCAL_TRACKS, LOCAL_ALBUMS, LOCAL_ARTISTS } from '@/demo/catalog';

interface LibraryViewProps {
  currentTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (track: TrackItem) => void;
  onPlayAlbum?: (album: AlbumItem) => void;
  onPlayArtist?: (artist: ArtistItem) => void;
  onSelectArtist?: (artist: any) => void;
  onSelectAlbum?: (album: any) => void;
}

const DEFAULT_COLUMNS: ColumnVisibility = {
  trackNumber: true,
  title: true,
  artist: true,
  album: true,
  codec: true,
  sampleRate: true,
  dynamicRange: true,
  bitrate: true,
  replayGain: true,
  year: true,
  catalogNumber: true,
  duration: true,
};

export const LibraryView: React.FC<LibraryViewProps> = ({
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onPlayAlbum,
  onPlayArtist,
  onSelectArtist,
  onSelectAlbum,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<LibrarySubTab>('artists');
  const [columns, setColumns] = useState<ColumnVisibility>(DEFAULT_COLUMNS);
  const [showCustomize, setShowCustomize] = useState(false);

  const toggleColumn = (col: keyof ColumnVisibility) => {
    setColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  return (
    <div id="library-view-container" className="w-full flex flex-col gap-4 font-sans">
      {/* Sub-navigation bar: [Artist] [Album] [Genre] [Tracks] [+ Customize Columns] */}
      <div
        id="library-subnav"
        className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral-800"
      >
        <div className="flex items-center gap-2 text-xs font-mono">
          <button
            id="subtab-artists"
            type="button"
            onClick={() => setActiveSubTab('artists')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeSubTab === 'artists'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/60 font-bold'
                : 'text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800'
            }`}
          >
            [Artist{activeSubTab === 'artists' ? ' (Selected)' : ''}]
          </button>

          <button
            id="subtab-albums"
            type="button"
            onClick={() => setActiveSubTab('albums')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeSubTab === 'albums'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/60 font-bold'
                : 'text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800'
            }`}
          >
            [Album{activeSubTab === 'albums' ? ' (Selected)' : ''}]
          </button>

          <button
            id="subtab-genres"
            type="button"
            onClick={() => setActiveSubTab('genres')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeSubTab === 'genres'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/60 font-bold'
                : 'text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800'
            }`}
          >
            [Genre{activeSubTab === 'genres' ? ' (Selected)' : ''}]
          </button>

          <button
            id="subtab-tracks"
            type="button"
            onClick={() => setActiveSubTab('tracks')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeSubTab === 'tracks'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/60 font-bold'
                : 'text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800'
            }`}
          >
            [Tracks{activeSubTab === 'tracks' ? ' (Selected)' : ''}]
          </button>
        </div>

        {/* Total library count indicator */}
        <div className="text-xs text-neutral-500 font-mono">
          {activeSubTab === 'artists' && `${LOCAL_ARTISTS.length} indexed artists`}
          {activeSubTab === 'albums' && `${LOCAL_ALBUMS.length} complete albums`}
          {activeSubTab === 'genres' && `${LOCAL_GENRES.length} curated audiophile genres`}
          {activeSubTab === 'tracks' && `${LOCAL_TRACKS.length} verified tracks in database`}
        </div>
      </div>

      {/* Active Sub-View */}
      {activeSubTab === 'artists' && (
        <ArtistsGridView
          artists={LOCAL_ARTISTS}
          onPlayArtist={onPlayArtist}
          onSelectArtist={onSelectArtist}
        />
      )}

      {activeSubTab === 'albums' && (
        <AlbumsGridView
          albums={LOCAL_ALBUMS}
          onPlayAlbum={onPlayAlbum}
          onSelectAlbum={onSelectAlbum || onPlayAlbum}
          onSelectArtist={onSelectArtist}
        />
      )}

      {activeSubTab === 'genres' && (
        <GenresGridView
          onPlayTrack={onPlayTrack}
          onSelectArtist={onSelectArtist}
          onSelectAlbum={onSelectAlbum}
        />
      )}

      {activeSubTab === 'tracks' && (
        <TracksTableView
          tracks={LOCAL_TRACKS}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          onPlayTrack={onPlayTrack}
          onSelectArtist={onSelectArtist}
          onSelectAlbum={onSelectAlbum}
          columnVisibility={columns}
          onToggleColumn={toggleColumn}
        />
      )}
    </div>
  );
};
