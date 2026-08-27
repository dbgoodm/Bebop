import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  acquireTrack,
  acquireAlbum,
  getAcquisitionQueue,
  cancelAcquisition,
  retryAcquisition,
  getAcquisitionSettings,
  saveAcquisitionSettings,
  onAcquisitionProgress,
  onAcquisitionCompleted,
  clearCompletedAcquisitions,
} from './acquisitionService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'get_acquisition_settings') {
      return {
        preferredQuality: 'hi-res-24',
        destinationFolder: '/music',
        namingPattern: '{Artist}/{Album}/{TrackNumber} - {Title}',
        concurrencyLimit: 2,
      };
    }
    if (cmd === 'save_acquisition_settings') {
      return args.settings;
    }
    throw new Error('Not handled');
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
}));

describe('acquisitionService', () => {
  beforeEach(async () => {
    await clearCompletedAcquisitions();
  });

  it('manages settings retrieval and saving', async () => {
    const settings = await getAcquisitionSettings();
    expect(settings.preferredQuality).toBe('hi-res-24');

    const updated = await saveAcquisitionSettings({
      ...settings,
      preferredQuality: 'lossless-16',
      concurrencyLimit: 4,
    });
    expect(updated.preferredQuality).toBe('lossless-16');
    expect(updated.concurrencyLimit).toBe(4);
  });

  it('enqueues track and album acquisitions and tracks progress', async () => {
    const progressSpy = vi.fn();
    const completedSpy = vi.fn();
    const unlistenProgress = await onAcquisitionProgress(progressSpy);
    const unlistenCompleted = await onAcquisitionCompleted(completedSpy);

    const job = await acquireTrack({
      trackTitle: 'Digital Love',
      artistName: 'Daft Punk',
      albumTitle: 'Discovery',
      remoteTrackId: 'rec-digital-love',
    });

    expect(job.trackTitle).toBe('Digital Love');
    expect(job.status).toBe('queued');

    const queue = await getAcquisitionQueue();
    expect(queue.some((j) => j.trackTitle === 'Digital Love')).toBe(true);

    const albumJobs = await acquireAlbum({
      albumTitle: 'Discovery',
      artistName: 'Daft Punk',
      tracks: [
        { trackTitle: 'Harder, Better, Faster, Stronger', artistName: 'Daft Punk' },
        { trackTitle: 'Crescendolls', artistName: 'Daft Punk' },
      ],
    });

    expect(albumJobs).toHaveLength(2);

    unlistenProgress();
    unlistenCompleted();
  });

  it('allows cancelling an acquisition job', async () => {
    const job = await acquireTrack({
      trackTitle: 'Nightcall',
      artistName: 'Kavinsky',
    });

    const cancelled = await cancelAcquisition(job.id);
    expect(cancelled).toBe(true);
  });
});
