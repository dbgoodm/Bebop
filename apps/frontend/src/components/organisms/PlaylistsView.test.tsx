import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackItem } from '@/types';
import { PlaylistsView } from './PlaylistsView';

const mocks = vi.hoisted(() => ({
  listPlaylists: vi.fn(),
  createPlaylist: vi.fn(),
  getPlaylist: vi.fn(),
  renamePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  duplicatePlaylist: vi.fn(),
  setPlaylistTracks: vi.fn(),
  generatePlaylist: vi.fn(),
  createGeneratedPlaylist: vi.fn(),
  analyzeAudioFeatures: vi.fn(),
}));

vi.mock('@/services/playlistService', () => ({
  ...mocks,
  onAudioAnalysisProgress: vi.fn().mockResolvedValue(() => undefined),
}));

const track: TrackItem = {
  id: 'track-1',
  trackNumber: 1,
  title: 'So What',
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  codec: 'FLAC',
  sampleRate: '16-bit/44.1kHz',
  dynamicRange: '—',
  bitrate: '—',
  replayGain: '—',
  year: 1959,
  catalogNumber: '',
  duration: '9:22',
  durationSeconds: 562,
};

describe('PlaylistsView', () => {
  it('opens, plays, and queues a saved playlist', async () => {
    mocks.listPlaylists.mockResolvedValue([
      { id: 'playlist-1', name: 'Late night', trackCount: 1 },
    ]);
    mocks.getPlaylist.mockResolvedValue({
      id: 'playlist-1',
      name: 'Late night',
      description: null,
      tracks: [track],
      totalDurationMs: 562_000,
      generated: false,
      generationRequest: null,
      createdAt: 'now',
      updatedAt: 'now',
    });
    const onPlayTrack = vi.fn();
    const onReplaceQueue = vi.fn();
    const onAppendQueue = vi.fn();
    render(
      <PlaylistsView
        tracks={[track]}
        queue={[]}
        onPlayTrack={onPlayTrack}
        onReplaceQueue={onReplaceQueue}
        onAppendQueue={onAppendQueue}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /late night/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));

    expect(onReplaceQueue).toHaveBeenCalledWith([track]);
    expect(onPlayTrack).toHaveBeenCalledWith(track);
    expect(onAppendQueue).toHaveBeenCalledWith([track]);
  });

  it('moves queue saving into the playlist library surface', async () => {
    mocks.listPlaylists.mockResolvedValue([]);
    mocks.createPlaylist.mockResolvedValue({
      id: 'playlist-2',
      name: 'Current queue',
      trackCount: 1,
    });
    mocks.getPlaylist.mockResolvedValue({
      id: 'playlist-2',
      name: 'Current queue',
      description: null,
      tracks: [track],
      totalDurationMs: 562_000,
      generated: false,
      generationRequest: null,
      createdAt: 'now',
      updatedAt: 'now',
    });
    render(
      <PlaylistsView
        tracks={[track]}
        queue={[track]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Playlist name'), {
      target: { value: 'Current queue' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save queue/i }));

    await waitFor(() =>
      expect(mocks.createPlaylist).toHaveBeenCalledWith('Current queue', ['track-1']),
    );
    expect(await screen.findByRole('heading', { name: 'Current queue' })).toBeInTheDocument();
  });
});
