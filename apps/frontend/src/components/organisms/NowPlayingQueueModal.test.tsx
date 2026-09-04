import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NowPlayingQueueModal } from './NowPlayingQueueModal';
import type { TrackItem } from '@/types';

const mockTrack: TrackItem = {
  id: 'track-tank',
  trackNumber: 1,
  title: 'Tank!',
  artist: 'SEATBELTS',
  album: 'Cowboy Bebop OST 1',
  codec: 'FLAC',
  sampleRate: '24-bit/96kHz',
  dynamicRange: 'DR14',
  bitrate: '2840 kbps',
  year: 1998,
  catalogNumber: 'VICL-60201',
  duration: '3:30',
  durationSeconds: 210,
  coverUrl: '/covers/tank.jpg',
  audioUrl: '/audio/tank.flac',
  replayGain: '—',
};

describe('NowPlayingQueueModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders without a current track and a large queue, even while closed', () => {
    // Regression: this component is always mounted (isOpen just hides it),
    // and displayQueue's useMemo used to run only after `if (!isOpen) return
    // null`, so opening/closing changed the hook count between renders and
    // React threw — blanking the whole app since nothing wraps it in an
    // error boundary.
    const bigQueue = Array.from({ length: 200 }, (_, index) => ({
      ...mockTrack,
      id: `track-${index}`,
    }));

    expect(() =>
      render(
        <NowPlayingQueueModal
          isOpen={false}
          onClose={vi.fn()}
          queue={bigQueue}
          currentTrack={null}
          isPlaying={false}
          onPlayTrack={vi.fn()}
          onRemoveTrack={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });

  it('renders the drawer with queue tracks when open', () => {
    const { getAllByText } = render(
      <NowPlayingQueueModal
        isOpen={true}
        onClose={vi.fn()}
        queue={[mockTrack]}
        currentTrack={mockTrack}
        isPlaying={true}
        onPlayTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
      />,
    );

    expect(getAllByText('Tank!').length).toBeGreaterThan(0);
  });
});
