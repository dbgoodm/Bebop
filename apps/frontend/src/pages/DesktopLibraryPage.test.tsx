import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackItem } from '@/types';

const mocks = vi.hoisted(() => ({
  track: {
    id: 'track-1',
    trackNumber: 1,
    title: 'Scanned track',
    artist: 'Unknown artist',
    album: 'Local library',
    codec: 'FLAC',
    sampleRate: '24-bit/44.1kHz',
    dynamicRange: '—',
    bitrate: '—',
    replayGain: '—',
    year: 0,
    catalogNumber: '—',
    duration: '2:00',
    durationSeconds: 120,
    audioUrl: '/music/scanned.flac',
  } as TrackItem,
  selectAndScan: vi.fn(),
  playTrack: vi.fn(),
  togglePlayback: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  toggleMute: vi.fn(),
  setHifi: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@/hooks/useLibraryScan', () => ({
  useLibraryScan: () => ({
    library: {
      phase: 'complete',
      root: '/music',
      roots: [],
      tracks: [mocks.track],
      totalTracks: 1,
      warnings: [],
      progress: null,
      error: null,
    },
    selectAndScan: mocks.selectAndScan,
  }),
}));

vi.mock('@/hooks/useNativePlayback', () => ({
  useNativePlayback: () => ({
    playback: {
      trackId: 'track-1',
      path: '/music/scanned.flac',
      status: 'playing',
      positionMs: 30_000,
      durationMs: 120_000,
      volume: 0.8,
      muted: false,
      hifiMode: false,
      output: {
        deviceId: 'default',
        deviceName: 'Default output',
        sourceSampleRate: 44_100,
        sourceChannels: 2,
        sourceBitDepth: 24,
        outputSampleRate: 48_000,
        outputChannels: 2,
        outputSampleFormat: 'f32',
        nativeSampleRate: false,
        resampling: true,
        softwareGain: true,
        exclusiveMode: false,
        bitPerfect: false,
        disclosure: 'Rodio is resampling to the active output rate.',
      },
    },
    error: null,
    endedCount: 0,
    playTrack: mocks.playTrack,
    togglePlayback: mocks.togglePlayback,
    seek: mocks.seek,
    setVolume: mocks.setVolume,
    toggleMute: mocks.toggleMute,
    setHifi: mocks.setHifi,
    stop: mocks.stop,
  }),
}));

vi.mock('@/hooks/useCatalogDiscovery', () => ({
  useCatalogDiscovery: () => ({ artists: [], albums: [], genres: [] }),
}));

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({ currentTheme: { bgCanvas: '#000' } }),
}));

vi.mock('@/components/molecules/TopNavRail', () => ({
  TopNavRail: ({
    onTabChange,
    audioStatusLabel,
    showPrototypeActions,
  }: {
    onTabChange: (tab: 'LIBRARY') => void;
    audioStatusLabel: string;
    showPrototypeActions: boolean;
  }) => (
    <div>
      <button type="button" onClick={() => onTabChange('LIBRARY')}>
        Open library
      </button>
      <span>{audioStatusLabel}</span>
      <span>{showPrototypeActions ? 'Prototype actions' : 'Native-only actions'}</span>
    </div>
  ),
}));

vi.mock('@/components/organisms/ThemeSelectorModal', () => ({
  ThemeSelectorModal: () => null,
}));

vi.mock('@/components/organisms/LibraryView', () => ({
  LibraryView: ({ onPlayTrack }: { onPlayTrack: (track: TrackItem) => void }) => (
    <button type="button" onClick={() => onPlayTrack(mocks.track)}>
      Play scanned track
    </button>
  ),
}));

vi.mock('@/components/organisms/NowPlayingBar', () => ({
  NowPlayingBar: (props: {
    onPlayPause: () => void;
    onSeek: (seconds: number) => void;
    onVolumeChange: (volume: number) => void;
    onToggleMute: () => void;
    spectrumAvailable: boolean;
  }) => (
    <div>
      <button type="button" onClick={props.onPlayPause}>
        Toggle playback
      </button>
      <button type="button" onClick={() => props.onSeek(45)}>
        Seek playback
      </button>
      <button type="button" onClick={() => props.onVolumeChange(0.5)}>
        Set volume
      </button>
      <button type="button" onClick={props.onToggleMute}>
        Toggle mute
      </button>
      <span>{props.spectrumAvailable ? 'Spectrum active' : 'Spectrum unavailable'}</span>
    </div>
  ),
}));

vi.mock('@/components/organisms/NowPlayingQueueModal', () => ({
  NowPlayingQueueModal: () => null,
}));
vi.mock('@/components/organisms/FullscreenNowPlaying', () => ({
  FullscreenNowPlaying: () => null,
}));

import { DesktopLibraryPage } from './DesktopLibraryPage';

describe('DesktopLibraryPage', () => {
  beforeEach(() => {
    [
      mocks.selectAndScan,
      mocks.playTrack,
      mocks.togglePlayback,
      mocks.seek,
      mocks.setVolume,
      mocks.toggleMute,
      mocks.setHifi,
      mocks.stop,
    ].forEach((mock) => mock.mockReset());
  });

  it('connects scanned tracks and transport controls to native playback', () => {
    render(<DesktopLibraryPage />);

    expect(screen.getByText(/Bebop local-first/i)).toBeInTheDocument();
    expect(screen.getByText('Native Rust output')).toBeInTheDocument();
    expect(screen.getByText('Native-only actions')).toBeInTheDocument();
    expect(screen.getByText(/Continue Listening/i)).toBeInTheDocument();
    expect(screen.getAllByText('Scanned track')).toHaveLength(2);
    expect(screen.getByText(/Library preview/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play scanned track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle playback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seek playback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set volume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle mute' }));

    expect(mocks.playTrack).toHaveBeenCalledWith(mocks.track);
    expect(mocks.togglePlayback).toHaveBeenCalledOnce();
    expect(mocks.seek).toHaveBeenCalledWith(45);
    expect(mocks.setVolume).toHaveBeenCalledWith(0.5);
    expect(mocks.toggleMute).toHaveBeenCalledOnce();
    expect(screen.getByText(/spectrum unavailable/i)).toBeInTheDocument();
  });
});
