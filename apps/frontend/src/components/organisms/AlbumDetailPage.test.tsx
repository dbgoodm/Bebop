import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlbumDetailPage } from './AlbumDetailPage';
import type { AlbumItem } from '@/types';
import * as acquisitionService from '@/services/acquisitionService';

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: {
      bgCard: '#111',
      borderColor: '#222',
      primary: '#f59e0b',
      secondary: '#38bdf8',
    },
  }),
}));

vi.mock('@/services/catalogService', () => ({
  loadAlbumDetail: (id: string) => Promise.resolve({ id, tracks: [] }),
}));

const mockRemoteAlbum: AlbumItem = {
  id: 'remote:rg-alive-2007',
  title: 'Alive 2007',
  artist: 'Daft Punk',
  year: 2007,
  trackCount: 2,
  totalDuration: '1h 14m',
  format: 'FLAC 24/96',
  codec: 'Remote Stream',
  catalogNumber: 'CAT-001',
  dynamicRange: 'DR12',
  availability: 'not-local',
  provenance: 'remote',
  tracks: [
    {
      id: 'rec-robot-rock',
      remoteId: 'rec-robot-rock',
      trackNumber: 1,
      title: 'Robot Rock / Oh Yeah',
      artist: 'Daft Punk',
      album: 'Alive 2007',
      codec: '—',
      sampleRate: 'Remote Track',
      dynamicRange: '—',
      bitrate: '—',
      replayGain: '—',
      year: 2007,
      catalogNumber: 'CAT-001',
      duration: '6:28',
      durationSeconds: 388,
      isLocal: false,
      isrc: 'GBAYE0701001',
    },
    {
      id: 'rec-touch-it',
      remoteId: 'rec-touch-it',
      trackNumber: 2,
      title: 'Touch It / Technologic',
      artist: 'Daft Punk',
      album: 'Alive 2007',
      codec: '—',
      sampleRate: 'Remote Track',
      dynamicRange: '—',
      bitrate: '—',
      replayGain: '—',
      year: 2007,
      catalogNumber: 'CAT-001',
      duration: '5:30',
      durationSeconds: 330,
      isLocal: false,
      isrc: 'GBAYE0701002',
    },
  ],
};

const mockPartialAlbum: AlbumItem = {
  ...mockRemoteAlbum,
  id: 'album-partial',
  tracks: [
    {
      ...mockRemoteAlbum.tracks[0],
      id: 'local-track-1',
      isLocal: true,
      codec: 'FLAC',
      sampleRate: '24-bit/96kHz',
    },
    {
      ...mockRemoteAlbum.tracks[1],
      isLocal: false,
    },
  ],
};

const mockLocalAlbum: AlbumItem = {
  ...mockRemoteAlbum,
  id: 'album-local',
  availability: 'in-library',
  provenance: 'local',
  tracks: mockRemoteAlbum.tracks.map((t, idx) => ({
    ...t,
    id: `local-t-${idx}`,
    isLocal: true,
    codec: 'FLAC',
    sampleRate: '24-bit/96kHz',
  })),
};

describe('AlbumDetailPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders "Get Full Album" button for a fully remote / missing album', () => {
    const acquireSpy = vi.spyOn(acquisitionService, 'acquireAlbum').mockResolvedValue([]);
    render(<AlbumDetailPage album={mockRemoteAlbum} onBack={vi.fn()} />);

    const getFullAlbumBtn = screen.getByRole('button', { name: /get full album/i });
    expect(getFullAlbumBtn).toBeInTheDocument();

    fireEvent.click(getFullAlbumBtn);
    expect(acquireSpy).toHaveBeenCalled();
  });

  it('renders "Play Available" and "Acquire Missing Tracks" for partial albums', () => {
    const onPlayAlbum = vi.fn();
    const acquireSpy = vi.spyOn(acquisitionService, 'acquireAlbum').mockResolvedValue([]);

    render(<AlbumDetailPage album={mockPartialAlbum} onBack={vi.fn()} onPlayAlbum={onPlayAlbum} />);

    const playAvailableBtn = screen.getByRole('button', { name: /play available \(1\)/i });
    const acquireMissingBtn = screen.getByRole('button', { name: /acquire missing tracks \(1\)/i });

    expect(playAvailableBtn).toBeInTheDocument();
    expect(acquireMissingBtn).toBeInTheDocument();

    fireEvent.click(playAvailableBtn);
    expect(onPlayAlbum).toHaveBeenCalled();

    fireEvent.click(acquireMissingBtn);
    expect(acquireSpy).toHaveBeenCalled();
  });

  it('renders "Play Album" and "Shuffle" for 100% local albums', () => {
    const onPlayAlbum = vi.fn();

    render(<AlbumDetailPage album={mockLocalAlbum} onBack={vi.fn()} onPlayAlbum={onPlayAlbum} />);

    const playAlbumBtns = screen.getAllByRole('button', { name: /play album/i });
    const shuffleBtn = screen.getByRole('button', { name: /shuffle/i });

    expect(playAlbumBtns.length).toBeGreaterThan(0);
    expect(shuffleBtn).toBeInTheDocument();

    fireEvent.click(playAlbumBtns[0]);
    expect(onPlayAlbum).toHaveBeenCalled();
  });

  it('triggers single track acquisition when clicking "Get" on a missing track row', () => {
    const acquireTrackSpy = vi.spyOn(acquisitionService, 'acquireTrack').mockResolvedValue({
      id: 'job-1',
      trackTitle: 'Touch It / Technologic',
      artistName: 'Daft Punk',
      albumTitle: 'Alive 2007',
      status: 'queued',
      percent: 0,
      speedBytesPerSec: 0,
      createdAt: new Date().toISOString(),
    });

    render(<AlbumDetailPage album={mockPartialAlbum} onBack={vi.fn()} />);

    const getTrackBtns = screen.getAllByTitle('Get Track');
    expect(getTrackBtns.length).toBeGreaterThan(0);

    fireEvent.click(getTrackBtns[0]);
    expect(acquireTrackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        trackTitle: 'Touch It / Technologic',
      }),
    );
  });
});
