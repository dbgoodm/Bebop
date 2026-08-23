import React from 'react';
import { TrackItem, ColumnVisibility } from '@/types';
import { UniversalTracklist, ColumnKey } from '@/components/molecules/UniversalTracklist';

interface TracksTableViewProps {
  tracks: TrackItem[];
  currentTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (track: TrackItem) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
  onEditTrack?: (track: TrackItem) => void;
  favoriteTrackIds?: ReadonlySet<string>;
  onFavoriteChange?: (trackId: string, favorite: boolean) => void;
  columnVisibility?: ColumnVisibility;
  onToggleColumn?: (column: keyof ColumnVisibility) => void;
}

export const TracksTableView: React.FC<TracksTableViewProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onSelectArtist,
  onSelectAlbum,
  onEditTrack,
  favoriteTrackIds,
  onFavoriteChange,
}) => {
  return (
    <UniversalTracklist
      idPrefix="library-tracks"
      tracks={tracks}
      currentTrackId={currentTrackId}
      isPlaying={isPlaying}
      onPlayTrack={onPlayTrack}
      onSelectArtist={onSelectArtist}
      onSelectAlbum={onSelectAlbum}
      onEditTrack={onEditTrack}
      favoriteTrackIds={favoriteTrackIds}
      onFavoriteChange={onFavoriteChange}
      storageKey="library_tracks_columns"
      defaultVisibleColumns={[
        'trackNumber',
        'title',
        'artist',
        'album',
        'dynamicRange',
        'sampleRate',
        'codec',
        'bitrate',
        'duration',
        'actions',
      ]}
      showCustomizerButton={true}
    />
  );
};
