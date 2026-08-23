import { describe, expect, it } from 'vitest';
import { toLibrarySnapshot, toTrackItem } from './libraryService';

const scannedTrack = {
  id: 'track-abc',
  rootId: 'root-abc',
  path: '/music/Artist/Example.flac',
  relativePath: 'Artist/Example.flac',
  title: 'Example',
  extension: 'flac' as const,
  fileSize: 9_600_000,
  durationMs: 240_000,
  sampleRate: 96_000,
  channels: 2,
  bitDepth: 24,
  available: true,
};

describe('library scan adapter', () => {
  it('maps opaque Rust track summaries without inventing artist or album metadata', () => {
    expect(toTrackItem(scannedTrack, 0)).toMatchObject({
      id: 'track-abc',
      title: 'Example',
      artist: 'Unknown artist',
      album: 'Local library',
      codec: 'FLAC',
      sampleRate: '24-bit/96kHz',
      duration: '4:00',
      audioUrl: '/music/Artist/Example.flac',
    });
  });

  it('reports a partial result when Rust skips inaccessible paths', () => {
    const snapshot = toLibrarySnapshot(
      {
        rootId: 'root-abc',
        root: '/music',
        tracks: [scannedTrack],
        warnings: ['Skipped unreadable file'],
      },
      null,
    );
    expect(snapshot.phase).toBe('partial-error');
    expect(snapshot.tracks).toHaveLength(1);
  });
});
