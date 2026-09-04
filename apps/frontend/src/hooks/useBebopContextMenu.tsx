import React, { useCallback, useState } from 'react';
import {
  Play,
  ListPlus,
  Heart,
  Dna,
  Edit3,
  User,
  Disc,
  Copy,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ListMusic,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import type { AlbumItem, ArtistItem, TrackItem } from '@/types';
import type { ContextMenuItem, ContextMenuState } from '@/components/molecules/ContextMenu';
import { listPlaylists, type PlaylistSummary } from '@/services/playlistService';

export interface UseBebopContextMenuOptions {
  onPlayTrack?: (track: TrackItem) => void;
  onPlayNext?: (track: TrackItem) => void;
  onAppendQueue?: (tracks: TrackItem[]) => void;
  onRemoveQueueTrack?: (trackId: string) => void;
  onMoveQueueTrack?: (index: number, direction: 'up' | 'down') => void;
  onMoveQueueTrackToEnds?: (index: number, to: 'top' | 'bottom') => void;
  isFavoriteTrack?: (trackId: string) => boolean;
  onToggleFavorite?: (trackId: string, favorite: boolean) => void;
  onAddTrackToPlaylist?: (playlistId: string, trackId: string) => Promise<boolean | void>;
  onCreatePlaylistWithTrack?: (name: string, trackId: string) => Promise<void>;
  onCreatePlaylistWithSeed?: (track: TrackItem) => void;
  onEditTrack?: (track: TrackItem) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
  onPlayAlbum?: (album: AlbumItem | string) => void;
  onPlayArtist?: (artist: ArtistItem | string) => void;
  onRenamePlaylist?: (playlist: PlaylistSummary) => void;
  onDuplicatePlaylist?: (playlist: PlaylistSummary) => void;
  onDeletePlaylist?: (playlist: PlaylistSummary) => void;
  playlists?: PlaylistSummary[];
  onRefreshPlaylists?: () => Promise<void>;
}

export function useBebopContextMenu(options: UseBebopContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openTrackContextMenu = useCallback(
    async (track: TrackItem, event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const isFav = options.isFavoriteTrack ? options.isFavoriteTrack(track.id) : false;

      // Fetch fresh playlists if not provided
      let currentPlaylists = options.playlists;
      if (!currentPlaylists) {
        try {
          currentPlaylists = await listPlaylists();
        } catch {
          currentPlaylists = [];
        }
      }

      // Build playlist submenu items
      const playlistSubmenu: ContextMenuItem[] = [
        ...currentPlaylists.map((pl) => ({
          id: `add-to-pl-${pl.id}`,
          label: pl.name,
          badge: `${pl.trackCount}`,
          icon: <ListMusic className="w-3.5 h-3.5" />,
          onClick: () => {
            void options.onAddTrackToPlaylist?.(pl.id, track.id);
          },
        })),
        ...(currentPlaylists.length > 0 ? [{ id: 'pl-div', label: '', divider: true }] : []),
        {
          id: 'create-new-pl-with-track',
          label: 'New Playlist with Track...',
          icon: <Plus className="w-3.5 h-3.5 text-amber-400" />,
          onClick: () => {
            const name = window.prompt('Enter new playlist name:');
            if (name && name.trim()) {
              void options.onCreatePlaylistWithTrack?.(name.trim(), track.id);
            }
          },
        },
      ];

      const items: ContextMenuItem[] = [
        {
          id: 'play-now',
          label: 'Play Now',
          icon: <Play className="w-3.5 h-3.5 fill-current" />,
          onClick: () => options.onPlayTrack?.(track),
        },
        {
          id: 'play-next',
          label: 'Play Next',
          icon: <ListPlus className="w-3.5 h-3.5" />,
          onClick: () => options.onPlayNext?.(track),
        },
        {
          id: 'add-to-queue',
          label: 'Add to Queue',
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => options.onAppendQueue?.([track]),
        },
        { id: 'div-1', label: '', divider: true },
        {
          id: 'toggle-favorite',
          label: isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs',
          icon: (
            <Heart
              className={`w-3.5 h-3.5 ${isFav ? 'fill-red-500 text-red-500' : 'text-neutral-400'}`}
            />
          ),
          onClick: () => options.onToggleFavorite?.(track.id, !isFav),
        },
        {
          id: 'add-to-playlist',
          label: 'Add to Playlist',
          icon: <ListPlus className="w-3.5 h-3.5" />,
          children: playlistSubmenu,
        },
        {
          id: 'generate-song-dna',
          label: 'Generate with Song DNA',
          icon: <Dna className="w-3.5 h-3.5 text-violet-300" />,
          onClick: () => options.onCreatePlaylistWithSeed?.(track),
        },
        { id: 'div-2', label: '', divider: true },
        ...(track.artist
          ? [
              {
                id: 'go-to-artist',
                label: `Go to Artist (${track.artist})`,
                icon: <User className="w-3.5 h-3.5" />,
                onClick: () => options.onSelectArtist?.(track.artist),
              },
            ]
          : []),
        ...(track.album
          ? [
              {
                id: 'go-to-album',
                label: `Go to Album (${track.album})`,
                icon: <Disc className="w-3.5 h-3.5" />,
                onClick: () => options.onSelectAlbum?.(track.album),
              },
            ]
          : []),
        ...(options.onEditTrack
          ? [
              {
                id: 'edit-metadata',
                label: 'Edit Metadata & Tags',
                icon: <Edit3 className="w-3.5 h-3.5 text-amber-300" />,
                onClick: () => options.onEditTrack?.(track),
              },
            ]
          : []),
        { id: 'div-3', label: '', divider: true },
        {
          id: 'copy-info',
          label: 'Copy Title & Artist',
          icon: <Copy className="w-3.5 h-3.5" />,
          onClick: () => {
            void navigator.clipboard.writeText(`${track.artist} - ${track.title}`);
          },
        },
      ];

      setContextMenu({
        isOpen: true,
        x: event.clientX,
        y: event.clientY,
        header: {
          title: track.title,
          subtitle: `${track.artist}${track.album ? ` • ${track.album}` : ''}`,
          badge: `${track.codec} ${track.sampleRate || ''}`.trim(),
        },
        items,
      });
    },
    [options],
  );

  const openQueueTrackContextMenu = useCallback(
    async (track: TrackItem, index: number, totalQueue: number, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const isFav = options.isFavoriteTrack ? options.isFavoriteTrack(track.id) : false;

      let currentPlaylists = options.playlists;
      if (!currentPlaylists) {
        try {
          currentPlaylists = await listPlaylists();
        } catch {
          currentPlaylists = [];
        }
      }

      const playlistSubmenu: ContextMenuItem[] = [
        ...currentPlaylists.map((pl) => ({
          id: `add-to-pl-${pl.id}`,
          label: pl.name,
          badge: `${pl.trackCount}`,
          icon: <ListMusic className="w-3.5 h-3.5" />,
          onClick: () => {
            void options.onAddTrackToPlaylist?.(pl.id, track.id);
          },
        })),
        ...(currentPlaylists.length > 0 ? [{ id: 'pl-div', label: '', divider: true }] : []),
        {
          id: 'create-new-pl-with-track',
          label: 'New Playlist with Track...',
          icon: <Plus className="w-3.5 h-3.5 text-amber-400" />,
          onClick: () => {
            const name = window.prompt('Enter new playlist name:');
            if (name && name.trim()) {
              void options.onCreatePlaylistWithTrack?.(name.trim(), track.id);
            }
          },
        },
      ];

      const items: ContextMenuItem[] = [
        {
          id: 'play-now',
          label: 'Play Now',
          icon: <Play className="w-3.5 h-3.5 fill-current" />,
          onClick: () => options.onPlayTrack?.(track),
        },
        {
          id: 'remove-from-queue',
          label: 'Remove from Queue',
          icon: <Trash2 className="w-3.5 h-3.5 text-red-400" />,
          danger: true,
          onClick: () => options.onRemoveQueueTrack?.(track.id),
        },
        { id: 'div-1', label: '', divider: true },
        ...(index > 0
          ? [
              {
                id: 'move-up',
                label: 'Move Up in Queue',
                icon: <ArrowUp className="w-3.5 h-3.5" />,
                onClick: () => options.onMoveQueueTrack?.(index, 'up'),
              },
              {
                id: 'move-top',
                label: 'Play Next (Move to Top)',
                icon: <ArrowUp className="w-3.5 h-3.5 text-amber-400" />,
                onClick: () => options.onMoveQueueTrackToEnds?.(index, 'top'),
              },
            ]
          : []),
        ...(index < totalQueue - 1
          ? [
              {
                id: 'move-down',
                label: 'Move Down in Queue',
                icon: <ArrowDown className="w-3.5 h-3.5" />,
                onClick: () => options.onMoveQueueTrack?.(index, 'down'),
              },
              {
                id: 'move-bottom',
                label: 'Move to End of Queue',
                icon: <ArrowDown className="w-3.5 h-3.5" />,
                onClick: () => options.onMoveQueueTrackToEnds?.(index, 'bottom'),
              },
            ]
          : []),
        { id: 'div-2', label: '', divider: true },
        {
          id: 'toggle-favorite',
          label: isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs',
          icon: (
            <Heart
              className={`w-3.5 h-3.5 ${isFav ? 'fill-red-500 text-red-500' : 'text-neutral-400'}`}
            />
          ),
          onClick: () => options.onToggleFavorite?.(track.id, !isFav),
        },
        {
          id: 'add-to-playlist',
          label: 'Add to Playlist',
          icon: <ListPlus className="w-3.5 h-3.5" />,
          children: playlistSubmenu,
        },
        {
          id: 'generate-song-dna',
          label: 'Generate with Song DNA',
          icon: <Dna className="w-3.5 h-3.5 text-violet-300" />,
          onClick: () => options.onCreatePlaylistWithSeed?.(track),
        },
        { id: 'div-3', label: '', divider: true },
        ...(options.onEditTrack
          ? [
              {
                id: 'edit-metadata',
                label: 'Edit Metadata & Tags',
                icon: <Edit3 className="w-3.5 h-3.5 text-amber-300" />,
                onClick: () => options.onEditTrack?.(track),
              },
            ]
          : []),
        {
          id: 'copy-info',
          label: 'Copy Title & Artist',
          icon: <Copy className="w-3.5 h-3.5" />,
          onClick: () => {
            void navigator.clipboard.writeText(`${track.artist} - ${track.title}`);
          },
        },
      ];

      setContextMenu({
        isOpen: true,
        x: event.clientX,
        y: event.clientY,
        header: {
          title: track.title,
          subtitle: `${track.artist} (Queue position: #${index + 1})`,
          badge: `${track.codec} ${track.sampleRate || ''}`.trim(),
        },
        items,
      });
    },
    [options],
  );

  const openAlbumContextMenu = useCallback(
    (album: AlbumItem, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const items: ContextMenuItem[] = [
        {
          id: 'play-album',
          label: 'Play Album',
          icon: <Play className="w-3.5 h-3.5 fill-current" />,
          onClick: () => options.onPlayAlbum?.(album),
        },
        {
          id: 'view-album',
          label: 'View Album Tracks',
          icon: <Disc className="w-3.5 h-3.5" />,
          onClick: () => options.onSelectAlbum?.(album.title),
        },
        ...(album.artist
          ? [
              {
                id: 'view-artist',
                label: `Go to Artist (${album.artist})`,
                icon: <User className="w-3.5 h-3.5" />,
                onClick: () => options.onSelectArtist?.(album.artist),
              },
            ]
          : []),
        { id: 'div-1', label: '', divider: true },
        {
          id: 'copy-album-info',
          label: 'Copy Album Title',
          icon: <Copy className="w-3.5 h-3.5" />,
          onClick: () => {
            void navigator.clipboard.writeText(`${album.artist} - ${album.title}`);
          },
        },
      ];

      setContextMenu({
        isOpen: true,
        x: event.clientX,
        y: event.clientY,
        header: {
          title: album.title,
          subtitle: album.artist,
          badge: album.year ? `${album.year}` : undefined,
        },
        items,
      });
    },
    [options],
  );

  const openArtistContextMenu = useCallback(
    (artist: ArtistItem, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const items: ContextMenuItem[] = [
        {
          id: 'play-artist',
          label: 'Play Artist',
          icon: <Play className="w-3.5 h-3.5 fill-current" />,
          onClick: () => options.onPlayArtist?.(artist),
        },
        {
          id: 'view-artist',
          label: 'View Artist Page',
          icon: <User className="w-3.5 h-3.5" />,
          onClick: () => options.onSelectArtist?.(artist.name),
        },
        { id: 'div-1', label: '', divider: true },
        {
          id: 'copy-artist-name',
          label: 'Copy Artist Name',
          icon: <Copy className="w-3.5 h-3.5" />,
          onClick: () => {
            void navigator.clipboard.writeText(artist.name);
          },
        },
      ];

      setContextMenu({
        isOpen: true,
        x: event.clientX,
        y: event.clientY,
        header: {
          title: artist.name,
          subtitle: artist.albumCount ? `${artist.albumCount} albums` : undefined,
        },
        items,
      });
    },
    [options],
  );

  const openPlaylistContextMenu = useCallback(
    (playlist: PlaylistSummary, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const items: ContextMenuItem[] = [
        ...(options.onRenamePlaylist
          ? [
              {
                id: 'rename-playlist',
                label: 'Rename Playlist',
                icon: <Edit3 className="w-3.5 h-3.5" />,
                onClick: () => options.onRenamePlaylist?.(playlist),
              },
            ]
          : []),
        ...(options.onDuplicatePlaylist
          ? [
              {
                id: 'duplicate-playlist',
                label: 'Duplicate Playlist',
                icon: <Copy className="w-3.5 h-3.5" />,
                onClick: () => options.onDuplicatePlaylist?.(playlist),
              },
            ]
          : []),
        { id: 'div-1', label: '', divider: true },
        ...(options.onDeletePlaylist
          ? [
              {
                id: 'delete-playlist',
                label: 'Delete Playlist',
                icon: <Trash2 className="w-3.5 h-3.5 text-red-400" />,
                danger: true,
                onClick: () => options.onDeletePlaylist?.(playlist),
              },
            ]
          : []),
      ];

      setContextMenu({
        isOpen: true,
        x: event.clientX,
        y: event.clientY,
        header: {
          title: playlist.name,
          subtitle: `${playlist.trackCount} tracks`,
        },
        items,
      });
    },
    [options],
  );

  return {
    contextMenu,
    closeContextMenu,
    openTrackContextMenu,
    openQueueTrackContextMenu,
    openAlbumContextMenu,
    openArtistContextMenu,
    openPlaylistContextMenu,
  };
}
