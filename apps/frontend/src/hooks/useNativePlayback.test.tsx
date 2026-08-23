import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackState } from '@/services/tauri-bindings';
import type { TrackItem } from '@/types';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  getPlaybackState: vi.fn(),
  playTrack: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  stopPlayback: vi.fn(),
  seekPlayback: vi.fn(),
  setPlaybackVolume: vi.fn(),
  setHifiMode: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, callback: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(event, callback);
    return () => mocks.listeners.delete(event);
  }),
}));

vi.mock('@/services/playbackService', () => ({
  initialPlaybackState: {
    trackId: null,
    path: null,
    status: 'stopped',
    positionMs: 0,
    durationMs: 0,
    volume: 1,
    muted: false,
    hifiMode: true,
    output: null,
  },
  getPlaybackState: mocks.getPlaybackState,
  playTrack: mocks.playTrack,
  pausePlayback: mocks.pausePlayback,
  resumePlayback: mocks.resumePlayback,
  stopPlayback: mocks.stopPlayback,
  seekPlayback: mocks.seekPlayback,
  setPlaybackVolume: mocks.setPlaybackVolume,
  setHifiMode: mocks.setHifiMode,
}));

import { useNativePlayback } from './useNativePlayback';

const playingState: PlaybackState = {
  trackId: 'track-1',
  path: '/music/one.flac',
  status: 'playing',
  positionMs: 1_250,
  durationMs: 120_000,
  volume: 1,
  muted: false,
  hifiMode: true,
  output: null,
};

const track: TrackItem = {
  id: 'track-1',
  trackNumber: 1,
  title: 'One',
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
  audioUrl: '/music/one.flac',
};

describe('useNativePlayback', () => {
  beforeEach(() => {
    mocks.listeners.clear();
    [
      mocks.getPlaybackState,
      mocks.playTrack,
      mocks.pausePlayback,
      mocks.resumePlayback,
      mocks.stopPlayback,
      mocks.seekPlayback,
      mocks.setPlaybackVolume,
      mocks.setHifiMode,
    ].forEach((mock) => mock.mockReset());
    mocks.getPlaybackState.mockResolvedValue({ ...playingState, status: 'paused' });
    mocks.playTrack.mockResolvedValue(playingState);
    mocks.pausePlayback.mockResolvedValue({ ...playingState, status: 'paused' });
    mocks.resumePlayback.mockResolvedValue(playingState);
    mocks.stopPlayback.mockResolvedValue({ ...playingState, status: 'stopped' });
    mocks.seekPlayback.mockResolvedValue(playingState);
    mocks.setPlaybackVolume.mockResolvedValue(playingState);
    mocks.setHifiMode.mockResolvedValue(playingState);
  });

  it('uses Rust command results and playback events instead of a frontend elapsed-time timer', async () => {
    const { result } = renderHook(() => useNativePlayback());
    await waitFor(() => expect(result.current.playback.status).toBe('paused'));

    await act(async () => {
      mocks.listeners.get('playback://position')?.({ payload: playingState });
    });
    expect(result.current.playback.positionMs).toBe(1_250);

    await act(async () => {
      await result.current.playTrack(track);
    });
    expect(mocks.playTrack).toHaveBeenCalledWith('/music/one.flac');

    await act(async () => {
      mocks.listeners.get('playback://ended')?.({ payload: { ...playingState, status: 'ended' } });
    });
    expect(result.current.endedCount).toBe(1);
  });

  it('surfaces Rust playback errors to the page', async () => {
    const { result } = renderHook(() => useNativePlayback());
    await waitFor(() => expect(mocks.listeners.has('playback://error')).toBe(true));

    await act(async () => {
      mocks.listeners.get('playback://error')?.({
        payload: { code: 'audio-device-unavailable', message: 'No output device is available.' },
      });
    });
    expect(result.current.error).toMatchObject({ code: 'audio-device-unavailable' });
  });
});
