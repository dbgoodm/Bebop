import { describe, expect, it, vi } from 'vitest';
import { loadAlbumDetail, toUnifiedTrackItem } from './catalogService';
import type { AlbumSummary, UnifiedAlbumDetail, UnifiedTrackSummary } from './tauri-bindings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const mockUnifiedDetail: UnifiedAlbumDetail = {
  album: {
    id: 'remote:rg-daft-punk',
    title: 'Discovery',
    artists: [{ id: 'artist-dp', name: 'Daft Punk' }],
    year: 2001,
    label: 'Virgin',
    catalogNumber: 'CDP 7243 8 49606 2 6',
    artworkId: null,
    trackCount: 2,
    totalDurationMs: 600000,
    totalFileSize: 0,
    artworkPath: null,
    provenance: 'remote',
    availability: 'not-local',
    providerIds: ['mb:rg-123'],
    lastRefreshedAt: '2026-08-25T00:00:00Z',
  },
  tracks: [
    {
      id: 'local-track-1',
      remoteId: 'remote:rec-one-more-time',
      trackNumber: 1,
      discNumber: 1,
      title: 'One More Time',
      artists: [{ id: 'artist-dp', name: 'Daft Punk' }],
      durationMs: 320000,
      isLocal: true,
      audioSpecs: {
        extension: 'flac',
        sampleRate: 96000,
        bitDepth: 24,
        channels: 2,
      },
      isrc: 'GBAYE0000624',
      musicbrainzRecordingId: 'rec-123',
      spotifyTrackId: 'spot-123',
      acquisitionStatus: 'completed',
    },
    {
      id: null,
      remoteId: 'remote:rec-aerodynamic',
      trackNumber: 2,
      discNumber: 1,
      title: 'Aerodynamic',
      artists: [{ id: 'artist-dp', name: 'Daft Punk' }],
      durationMs: 212000,
      isLocal: false,
      audioSpecs: null,
      isrc: 'GBAYE0000625',
      musicbrainzRecordingId: 'rec-456',
      spotifyTrackId: 'spot-456',
      acquisitionStatus: null,
    },
  ],
};

vi.mock('./tauri-bindings', () => ({
  commands: {
    getUnifiedAlbumDetail: vi.fn(async (albumId: string) => ({
      status: 'ok',
      data: mockUnifiedDetail,
    })),
    getAlbumDetail: vi.fn(),
  },
}));

describe('catalogService - unified album details', () => {
  it('correctly adapts unified tracks into TrackItems with local vs missing flags', () => {
    const localTrack = toUnifiedTrackItem(mockUnifiedDetail.tracks[0], mockUnifiedDetail.album, 0);
    expect(localTrack.isLocal).toBe(true);
    expect(localTrack.title).toBe('One More Time');
    expect(localTrack.sampleRate).toBe('24-bit/96kHz');
    expect(localTrack.codec).toBe('FLAC');
    expect(localTrack.isrc).toBe('GBAYE0000624');

    const remoteTrack = toUnifiedTrackItem(mockUnifiedDetail.tracks[1], mockUnifiedDetail.album, 1);
    expect(remoteTrack.isLocal).toBe(false);
    expect(remoteTrack.title).toBe('Aerodynamic');
    expect(remoteTrack.sampleRate).toBe('Remote Track');
    expect(remoteTrack.codec).toBe('—');
    expect(remoteTrack.remoteId).toBe('remote:rec-aerodynamic');
  });

  it('loads unified album detail and exposes local vs remote track status', async () => {
    const album = await loadAlbumDetail('remote:rg-daft-punk');
    expect(album.title).toBe('Discovery');
    expect(album.tracks).toHaveLength(2);
    expect(album.tracks[0].isLocal).toBe(true);
    expect(album.tracks[1].isLocal).toBe(false);
  });
});
