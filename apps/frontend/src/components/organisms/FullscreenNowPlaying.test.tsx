import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenNowPlaying } from './FullscreenNowPlaying';
import type { TrackItem } from '@/types';

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: {
      id: 'space-cowboy-v2',
      name: 'Space Cowboy',
      character: 'The Drifter',
      primary: '#e2b23c',
      primaryHover: '#f2c95c',
      secondary: '#d33a2c',
      accentGlow: 'rgba(226,178,60,.45)',
      bgCanvas: '#0a1020',
      bgCanvasGradient: 'radial-gradient(#16243f, #06090f)',
      bgCard: '#0d1524',
      bgSurface: '#111b2e',
      borderColor: '#1f2d47',
      textPrimary: '#f4f1e8',
      textSecondary: '#c3c9d4',
      textMuted: '#7b879b',
      visualizerPrimary: '#ffffff',
      waveformPlayedTop: '#e2b23c',
      waveformPlayedBot: '#8a6a1c',
      waveformUnplayedTop: '#1b2740',
      waveformUnplayedBot: '#1b2740',
      waveformGlow: true,
      vars: {
        '--op-stars': '1',
        '--op-smoke': '1',
        '--op-ship': '1',
      },
    },
  }),
}));

vi.mock('@/services/lyricsService', () => ({
  loadTrackLyrics: () =>
    Promise.resolve({
      lines: [
        { timeMs: 0, text: 'Tank! Opening theme' },
        { timeMs: 5000, text: '3, 2, 1, let’s jam' },
      ],
      source: 'lrclib',
      sourceUrl: 'https://lrclib.net',
      synchronized: true,
    }),
}));

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

describe('FullscreenNowPlaying', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders track details, format tags, and vinyl deck in fullscreen mode', () => {
    render(
      <FullscreenNowPlaying
        isOpen={true}
        onClose={vi.fn()}
        currentTrack={mockTrack}
        isPlaying={true}
        currentTimeSeconds={10}
        onPlayPause={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSeek={vi.fn()}
        queue={[mockTrack]}
        onPlayQueueTrack={vi.fn()}
      />,
    );

    // Track Title and Artist
    expect(screen.getAllByText('Tank!').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SEATBELTS').length).toBeGreaterThan(0);
    expect(screen.getByText(/Cowboy Bebop OST 1/)).toBeDefined();

    // Hi-Res format badge
    expect(screen.getAllByText('FLAC 24-bit/96kHz').length).toBeGreaterThan(0);
    expect(screen.getByText('HI-RES')).toBeDefined();
    expect(screen.getByText('DR14')).toBeDefined();

    // Theme Watermark Stamp
    expect(screen.getByText('SEE YOU SPACE COWBOY...')).toBeDefined();
  });

  it('toggles turntable RPM speed between 33⅓ and 45 RPM', () => {
    render(
      <FullscreenNowPlaying
        isOpen={true}
        onClose={vi.fn()}
        currentTrack={mockTrack}
        isPlaying={true}
        currentTimeSeconds={10}
        onPlayPause={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSeek={vi.fn()}
        queue={[mockTrack]}
        onPlayQueueTrack={vi.fn()}
      />,
    );

    const rpmBtn = screen.getByTitle('Toggle Turntable Speed (33⅓ vs 45 RPM)');
    expect(rpmBtn).toBeDefined();

    fireEvent.click(rpmBtn);
    expect(screen.getByTitle('Toggle Turntable Speed (33⅓ vs 45 RPM)').textContent).toBe('45 RPM');

    fireEvent.click(rpmBtn);
    expect(screen.getByTitle('Toggle Turntable Speed (33⅓ vs 45 RPM)').textContent).toBe('33⅓ RPM');
  });

  it('handles shuffle and repeat button clicks with callbacks and indicators', () => {
    const handleToggleShuffle = vi.fn();
    const handleToggleRepeat = vi.fn();

    const { rerender } = render(
      <FullscreenNowPlaying
        isOpen={true}
        onClose={vi.fn()}
        currentTrack={mockTrack}
        isPlaying={true}
        currentTimeSeconds={10}
        onPlayPause={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSeek={vi.fn()}
        queue={[mockTrack]}
        onPlayQueueTrack={vi.fn()}
        isShuffle={false}
        onToggleShuffle={handleToggleShuffle}
        repeatMode="off"
        onToggleRepeat={handleToggleRepeat}
      />,
    );

    const shuffleBtn = screen.getByLabelText('Shuffle');
    fireEvent.click(shuffleBtn);
    expect(handleToggleShuffle).toHaveBeenCalledTimes(1);

    const repeatBtn = screen.getByLabelText('Repeat Mode');
    fireEvent.click(repeatBtn);
    expect(handleToggleRepeat).toHaveBeenCalledTimes(1);

    // Rerender with repeatMode="one" to verify badge
    rerender(
      <FullscreenNowPlaying
        isOpen={true}
        onClose={vi.fn()}
        currentTrack={mockTrack}
        isPlaying={true}
        currentTimeSeconds={10}
        onPlayPause={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSeek={vi.fn()}
        queue={[mockTrack]}
        onPlayQueueTrack={vi.fn()}
        isShuffle={true}
        onToggleShuffle={handleToggleShuffle}
        repeatMode="one"
        onToggleRepeat={handleToggleRepeat}
      />,
    );

    expect(screen.getByText('1')).toBeDefined();
  });

  it('handles play/pause, next, prev, exit button, and keyboard escape', () => {
    const handleClose = vi.fn();
    const handlePlayPause = vi.fn();
    const handleNext = vi.fn();
    const handlePrev = vi.fn();

    render(
      <FullscreenNowPlaying
        isOpen={true}
        onClose={handleClose}
        currentTrack={mockTrack}
        isPlaying={false}
        currentTimeSeconds={0}
        onPlayPause={handlePlayPause}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={vi.fn()}
        queue={[mockTrack]}
        onPlayQueueTrack={vi.fn()}
      />,
    );

    // Click Play button
    const playBtn = screen.getByLabelText('Play');
    fireEvent.click(playBtn);
    expect(handlePlayPause).toHaveBeenCalled();

    // Click Next button
    const nextBtn = screen.getByLabelText('Next Track');
    fireEvent.click(nextBtn);
    expect(handleNext).toHaveBeenCalled();

    // Click Prev button
    const prevBtn = screen.getByLabelText('Previous Track');
    fireEvent.click(prevBtn);
    expect(handlePrev).toHaveBeenCalled();

    // Click Exit button
    const exitBtn = screen.getByTitle('Exit Fullscreen (Esc)');
    fireEvent.click(exitBtn);
    expect(handleClose).toHaveBeenCalled();

    // Trigger Esc key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
