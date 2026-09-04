import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  listMatchingTracks: vi.fn(),
  analyzeAudioFeatures: vi.fn(),
  listAvailableTags: vi.fn().mockResolvedValue([]),
  listStarterPlaylists: vi.fn().mockResolvedValue([]),
  onAudioAnalysisProgress: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock('@/services/playlistService', () => ({
  ...mocks,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPlaylists.mockResolvedValue([]);
    mocks.listStarterPlaylists.mockResolvedValue([]);
    mocks.listAvailableTags.mockResolvedValue([]);
    mocks.onAudioAnalysisProgress.mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  it('renders Liked Songs card and opens the liked songs list inline when clicked', async () => {
    mocks.listPlaylists.mockResolvedValue([]);

    render(
      <PlaylistsView
        tracks={[track]}
        queue={[]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
        favoriteTrackIds={new Set(['track-1'])}
      />,
    );

    const likedCard = await screen.findByRole('button', { name: /liked songs/i });
    expect(likedCard).toBeInTheDocument();
    expect(screen.getByText(/1 favorited track/i)).toBeInTheDocument();

    fireEvent.click(likedCard);
    expect(await screen.findByRole('heading', { name: /liked songs/i })).toBeInTheDocument();
    expect(screen.getByText('So What')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /all playlists/i }));
    expect(await screen.findByRole('button', { name: /liked songs/i })).toBeInTheDocument();
  });

  it('pre-selects seed track when initialSeedTrackId is passed', async () => {
    mocks.listPlaylists.mockResolvedValue([]);
    const onClear = vi.fn();

    render(
      <PlaylistsView
        tracks={[track]}
        queue={[]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
        initialSeedTrackId="track-1"
        onClearInitialSeedTrackId={onClear}
      />,
    );

    // The seed track select should have the track id selected
    const seedSelect = (await screen.findByLabelText('Seed track')) as HTMLSelectElement;
    expect(seedSelect.value).toBe('track-1');
    expect(onClear).toHaveBeenCalled();
  });

  it('renders available tags as toggle chips and includes a selected tag in the generation request', async () => {
    mocks.listPlaylists.mockResolvedValue([]);
    mocks.listStarterPlaylists.mockResolvedValue([]);
    mocks.listAvailableTags.mockResolvedValue([
      { name: 'piano', category: 'genre', trackCount: 42 },
      { name: 'somber', category: 'mood', trackCount: 7 },
    ]);
    mocks.generatePlaylist.mockResolvedValue({
      selections: [],
      totalDurationMs: 0,
      analyzedTrackCount: 0,
    });

    render(
      <PlaylistsView
        tracks={[track]}
        queue={[]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
      />,
    );

    const pianoChip = await screen.findByRole('button', { name: /piano/i });
    expect(pianoChip).toHaveTextContent('42');
    expect(pianoChip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pianoChip);
    expect(pianoChip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(mocks.generatePlaylist).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['piano'] }),
      ),
    );
  });

  it('excludes a tag on a second click, then clears it on a third', async () => {
    mocks.listPlaylists.mockResolvedValue([]);
    mocks.listStarterPlaylists.mockResolvedValue([]);
    mocks.listAvailableTags.mockResolvedValue([{ name: 'lo-fi', category: 'mood', trackCount: 5 }]);
    mocks.generatePlaylist.mockResolvedValue({
      selections: [],
      totalDurationMs: 0,
      analyzedTrackCount: 0,
    });

    render(
      <PlaylistsView
        tracks={[track]}
        queue={[]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
      />,
    );

    const chip = await screen.findByRole('button', { name: /lo-fi/i });
    fireEvent.click(chip); // include
    fireEvent.click(chip); // exclude
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(mocks.generatePlaylist).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [], excludedTags: ['lo-fi'] }),
      ),
    );

    fireEvent.click(chip); // back to neutral
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() =>
      expect(mocks.generatePlaylist).toHaveBeenLastCalledWith(
        expect.objectContaining({ tags: [], excludedTags: [] }),
      ),
    );
  });

  it('browses the full matching pool and saves only the hand-picked tracks', async () => {
    mocks.listPlaylists.mockResolvedValue([]);
    mocks.listStarterPlaylists.mockResolvedValue([]);
    mocks.listAvailableTags.mockResolvedValue([]);
    const second: TrackItem = { ...track, id: 'track-2', title: 'Blue in Green' };
    mocks.listMatchingTracks.mockResolvedValue([
      { track, score: 0.9, explanation: 'a favorite' },
      { track: second, score: 0.5, explanation: 'fits the mood' },
    ]);
    mocks.createPlaylist.mockResolvedValue({ id: 'built', name: 'Hand-picked', trackCount: 1 });
    mocks.getPlaylist.mockResolvedValue({
      id: 'built',
      name: 'Hand-picked',
      description: null,
      tracks: [track],
      totalDurationMs: track.durationSeconds * 1_000,
      generated: false,
      generationRequest: null,
      createdAt: 'now',
      updatedAt: 'now',
    });

    render(
      <PlaylistsView
        tracks={[track, second]}
        queue={[]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /browse matches/i }));
    expect(await screen.findByText('Blue in Green')).toBeInTheDocument();
    expect(screen.getByText('So What')).toBeInTheDocument();

    // Both matches are pre-checked (within the default target track count).
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[1]); // uncheck "Blue in Green"

    fireEvent.change(screen.getByPlaceholderText('Name this playlist'), {
      target: { value: 'Hand-picked' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save 1 selected/i }));

    await waitFor(() =>
      expect(mocks.createPlaylist).toHaveBeenCalledWith('Hand-picked', ['track-1']),
    );
  });

  it('shows an analyze prompt for a thin starter vibe and a working save button for a full one', async () => {
    mocks.listPlaylists.mockResolvedValue([]);
    mocks.listAvailableTags.mockResolvedValue([]);
    const thinSelections = Array.from({ length: 3 }, (_, index) => ({
      track: { ...track, id: `thin-${index}` },
      score: 1,
      explanation: '',
    }));
    const fullSelections = Array.from({ length: 10 }, (_, index) => ({
      track: { ...track, id: `full-${index}` },
      score: 1,
      explanation: '',
    }));
    mocks.listStarterPlaylists.mockResolvedValue([
      {
        key: 'nighttime',
        name: 'Nighttime',
        description: 'Low-energy, slow-tempo tracks for winding down.',
        playlist: { selections: thinSelections, totalDurationMs: 0, analyzedTrackCount: 0 },
        request: { targetTrackCount: 25 },
      },
      {
        key: 'workout',
        name: 'Workout',
        description: 'High-energy tracks to move to.',
        playlist: { selections: fullSelections, totalDurationMs: 0, analyzedTrackCount: 0 },
        request: { targetTrackCount: 25 },
      },
    ]);
    mocks.createGeneratedPlaylist.mockResolvedValue({
      id: 'playlist-3',
      name: 'Workout',
      trackCount: 10,
    });
    mocks.getPlaylist.mockResolvedValue({
      id: 'playlist-3',
      name: 'Workout',
      description: null,
      tracks: [],
      totalDurationMs: 0,
      generated: true,
      generationRequest: null,
      createdAt: 'now',
      updatedAt: 'now',
    });

    render(
      <PlaylistsView
        tracks={[track]}
        queue={[]}
        onPlayTrack={vi.fn()}
        onReplaceQueue={vi.fn()}
        onAppendQueue={vi.fn()}
      />,
    );

    expect(await screen.findByText('Analyze your library to fill this in')).toBeInTheDocument();

    const saveButton = await screen.findByRole('button', { name: 'Save as playlist' });
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(mocks.createGeneratedPlaylist).toHaveBeenCalledWith(
        'Workout',
        expect.objectContaining({ targetTrackCount: 25 }),
      ),
    );
  });
});
