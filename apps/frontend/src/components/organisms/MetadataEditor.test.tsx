import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetadataPatch } from '@/services/tauri-bindings';
import type { TrackItem } from '@/types';
import { MetadataEditor } from './MetadataEditor';

const mocks = vi.hoisted(() => ({
  previewMetadataChanges: vi.fn(),
  saveMetadataDraft: vi.fn(),
  patch: {
    title: 'Before',
    artists: ['Artist'],
    album: 'Album',
    albumArtists: ['Artist'],
    genres: ['Jazz'],
    trackNumber: 1,
    trackTotal: 1,
    discNumber: 1,
    discTotal: 1,
    year: 2026,
    date: '2026',
    composer: null,
    label: null,
    catalogNumber: null,
    isrc: null,
    musicbrainzRecordingId: null,
    musicbrainzReleaseId: null,
    musicbrainzArtistIds: null,
    musicbrainzAlbumArtistIds: null,
    artworkId: null,
    lyrics: null,
  },
}));

const patch: MetadataPatch = mocks.patch;

vi.mock('@/services/metadataService', () => ({
  applyMusicBrainzCandidate: vi.fn(),
  configureAcoustIdClientKey: vi.fn(),
  getAcoustIdConfigured: vi.fn().mockResolvedValue(false),
  getMusicBrainzEnabled: vi.fn().mockResolvedValue(false),
  loadTrackMetadata: vi.fn().mockResolvedValue(mocks.patch),
  patchFromTrack: vi.fn(() => mocks.patch),
  previewMetadataChanges: mocks.previewMetadataChanges,
  rollbackMetadataFile: vi.fn(),
  runMusicBrainzEnrichment: vi.fn(),
  saveMetadataDraft: mocks.saveMetadataDraft,
  setMusicBrainzEnabled: vi.fn(),
  writeMetadataToFile: vi.fn(),
}));

const track: TrackItem = {
  id: 'track-1',
  trackNumber: 1,
  title: 'Before',
  artist: 'Artist',
  album: 'Album',
  codec: 'FLAC',
  sampleRate: '16/44.1',
  dynamicRange: '—',
  bitrate: '—',
  replayGain: '—',
  year: 2026,
  catalogNumber: '—',
  duration: '1:00',
  durationSeconds: 60,
  audioUrl: '/music/track.flac',
};

describe('MetadataEditor', () => {
  beforeEach(() => {
    mocks.previewMetadataChanges.mockReset();
    mocks.saveMetadataDraft.mockReset();
  });

  it('requires and displays a field-level review before saving a manual draft', async () => {
    mocks.previewMetadataChanges.mockResolvedValue({
      affectedFiles: ['/music/track.flac'],
      diffs: [
        {
          trackId: 'track-1',
          field: 'title',
          before: 'Before',
          after: 'After',
          source: 'manual',
          confidence: 1,
        },
      ],
    });
    render(<MetadataEditor track={track} onClose={vi.fn()} />);

    const save = screen.getByRole('button', { name: 'Save to Bebop' });
    expect(save).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Before'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'After' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    await screen.findByText('/music/track.flac');
    expect(screen.getAllByText('Before')).toHaveLength(2);
    expect(screen.getAllByText('After')).toHaveLength(2);
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.saveMetadataDraft).toHaveBeenCalledOnce());
  });
});
