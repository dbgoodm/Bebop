import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NowPlayingBar } from './NowPlayingBar';
import type { TrackItem } from '@/types';

const playlistMocks = vi.hoisted(() => ({
  listPlaylists: vi.fn(),
  addTrackToPlaylist: vi.fn(),
  createPlaylistWithTrack: vi.fn(),
}));

vi.mock('@/services/playlistService', () => ({
  listPlaylists: playlistMocks.listPlaylists,
  addTrackToPlaylist: playlistMocks.addTrackToPlaylist,
  createPlaylistWithTrack: playlistMocks.createPlaylistWithTrack,
}));

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: {
      id: 'space-cowboy',
      primary: '#f59e0b',
      accentGlow: 'rgba(245,158,11,0.4)',
      bgCard: '#0d1524',
      bgCanvas: '#0a1020',
      borderColor: '#1f2d47',
      waveformPlayedBot: '#8a6a1c',
      waveformUnplayedBot: '#1b2740',
      waveformGlow: true,
      vars: {},
    },
  }),
}));

const mockTrack: TrackItem = {
  id: 'track-1',
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

describe('NowPlayingBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    playlistMocks.listPlaylists.mockResolvedValue([
      { id: 'pl-1', name: 'Chill Vibes', trackCount: 4, coverUrls: [] },
      { id: 'pl-2', name: 'Jazz Classics', trackCount: 12, coverUrls: [] },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders track info and handles favorite heart toggle', () => {
    const onToggleFavorite = vi.fn();
    render(
      <NowPlayingBar
        currentTrack={mockTrack}
        isPlaying={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        isFavorite={false}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    expect(screen.getByText('Space Lion')).toBeInTheDocument();
    expect(screen.getByText('The Seatbelts')).toBeInTheDocument();

    const likeBtn = screen.getByRole('button', { name: /save to liked songs/i });
    fireEvent.click(likeBtn);

    expect(onToggleFavorite).toHaveBeenCalledWith('track-1', true);
  });

  it('opens playlist popover on plus button click and displays user playlists', async () => {
    render(
      <NowPlayingBar
        currentTrack={mockTrack}
        isPlaying={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    const plusBtn = screen.getByRole('button', { name: /^add to playlist or create playlist$/i });
    fireEvent.click(plusBtn);

    expect(await screen.findByText(/Chill Vibes/i)).toBeInTheDocument();
    expect(screen.getByText(/Jazz Classics/i)).toBeInTheDocument();
    expect(screen.getByText(/Generate with Song DNA/i)).toBeInTheDocument();
  });

  it('adds track to existing playlist automatically without taking user anywhere', async () => {
    playlistMocks.addTrackToPlaylist.mockResolvedValue({
      added: true,
      alreadyExists: false,
      playlistName: 'Chill Vibes',
      trackCount: 5,
    });

    render(
      <NowPlayingBar
        currentTrack={mockTrack}
        isPlaying={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^add to playlist or create playlist$/i }));

    const playlistRow = await screen.findByRole('button', { name: /chill vibes/i });
    fireEvent.click(playlistRow);

    await waitFor(() => {
      expect(playlistMocks.addTrackToPlaylist).toHaveBeenCalledWith('pl-1', 'track-1');
    });

    expect(await screen.findByText(/Added to "Chill Vibes" ✓/i)).toBeInTheDocument();
  });

  it('creates new playlist and adds track without navigation', async () => {
    playlistMocks.createPlaylistWithTrack.mockResolvedValue({
      id: 'pl-3',
      name: 'Late Night Bebop',
      trackCount: 1,
      coverUrls: [],
    });

    render(
      <NowPlayingBar
        currentTrack={mockTrack}
        isPlaying={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^add to playlist or create playlist$/i }));

    const input = await screen.findByPlaceholderText('Playlist name...');
    fireEvent.change(input, { target: { value: 'Late Night Bebop' } });

    const createBtn = screen.getByRole('button', { name: /^create playlist$/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(playlistMocks.createPlaylistWithTrack).toHaveBeenCalledWith('Late Night Bebop', 'track-1');
    });

    expect(await screen.findByText(/Created "Late Night Bebop" & added track ✓/i)).toBeInTheDocument();
  });

  it('launches Song DNA generator with current track as seed', async () => {
    const onCreatePlaylistWithSeed = vi.fn();

    render(
      <NowPlayingBar
        currentTrack={mockTrack}
        isPlaying={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onCreatePlaylistWithSeed={onCreatePlaylistWithSeed}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^add to playlist or create playlist$/i }));

    const dnaBtn = await screen.findByRole('button', { name: /generate with song dna/i });
    fireEvent.click(dnaBtn);

    expect(onCreatePlaylistWithSeed).toHaveBeenCalledWith(mockTrack);
  });
});
