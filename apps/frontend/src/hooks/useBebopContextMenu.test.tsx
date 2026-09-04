import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useBebopContextMenu } from './useBebopContextMenu';
import type { TrackItem, AlbumItem, ArtistItem } from '@/types';

const mockTrack: TrackItem = {
  id: 't-101',
  trackNumber: 1,
  title: 'Space Lion',
  artist: 'The Seatbelts',
  album: 'Cowboy Bebop OST 1',
  codec: 'FLAC',
  sampleRate: '24-bit/96kHz',
  dynamicRange: 'DR14',
  bitrate: '2840 kbps',
  year: 1998,
  catalogNumber: 'VICL-60201',
  duration: '7:11',
  durationSeconds: 431,
  replayGain: '-1.2dB',
};

const mockAlbum: AlbumItem = {
  id: 'alb-1',
  title: 'Cowboy Bebop OST 1',
  artist: 'The Seatbelts',
  year: 1998,
  trackCount: 12,
  totalDuration: '54m 32s',
  format: 'FLAC 24/96',
  codec: 'FLAC',
  catalogNumber: 'VICL-60201',
  dynamicRange: 'DR14',
  tracks: [mockTrack],
};

const mockArtist: ArtistItem = {
  id: 'art-1',
  name: 'The Seatbelts',
  genres: ['Jazz', 'Blues'],
  albumCount: 8,
  trackCount: 96,
  totalDuration: '6h 45m',
  losslessPlaytime: '6h 45m',
};

describe('useBebopContextMenu', () => {
  it('opens and closes track context menu with complete action list', async () => {
    const onPlayTrack = vi.fn();
    const onPlayNext = vi.fn();
    const onToggleFavorite = vi.fn();

    const { result } = renderHook(() =>
      useBebopContextMenu({
        onPlayTrack,
        onPlayNext,
        onToggleFavorite,
        isFavoriteTrack: () => false,
      }),
    );

    const dummyEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 250,
      clientY: 350,
    } as unknown as React.MouseEvent;

    await act(async () => {
      await result.current.openTrackContextMenu(mockTrack, dummyEvent);
    });

    expect(result.current.contextMenu.isOpen).toBe(true);
    expect(result.current.contextMenu.x).toBe(250);
    expect(result.current.contextMenu.y).toBe(350);
    expect(result.current.contextMenu.header?.title).toBe('Space Lion');

    const playNowItem = result.current.contextMenu.items.find((i) => i.id === 'play-now');
    expect(playNowItem).toBeDefined();
    playNowItem?.onClick?.();
    expect(onPlayTrack).toHaveBeenCalledWith(mockTrack);

    const playNextItem = result.current.contextMenu.items.find((i) => i.id === 'play-next');
    expect(playNextItem).toBeDefined();
    playNextItem?.onClick?.();
    expect(onPlayNext).toHaveBeenCalledWith(mockTrack);

    act(() => {
      result.current.closeContextMenu();
    });

    expect(result.current.contextMenu.isOpen).toBe(false);
  });

  it('opens album and artist context menus with entity details', () => {
    const onPlayAlbum = vi.fn();
    const onPlayArtist = vi.fn();

    const { result } = renderHook(() =>
      useBebopContextMenu({
        onPlayAlbum,
        onPlayArtist,
      }),
    );

    const dummyEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.openAlbumContextMenu(mockAlbum, dummyEvent);
    });

    expect(result.current.contextMenu.isOpen).toBe(true);
    expect(result.current.contextMenu.header?.title).toBe('Cowboy Bebop OST 1');

    const playAlbumItem = result.current.contextMenu.items.find((i) => i.id === 'play-album');
    playAlbumItem?.onClick?.();
    expect(onPlayAlbum).toHaveBeenCalledWith(mockAlbum);

    act(() => {
      result.current.openArtistContextMenu(mockArtist, dummyEvent);
    });

    expect(result.current.contextMenu.isOpen).toBe(true);
    expect(result.current.contextMenu.header?.title).toBe('The Seatbelts');

    const playArtistItem = result.current.contextMenu.items.find((i) => i.id === 'play-artist');
    playArtistItem?.onClick?.();
    expect(onPlayArtist).toHaveBeenCalledWith(mockArtist);
  });
});
