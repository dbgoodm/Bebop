import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { TrackItem } from '@/types';
import type {
  AppError,
  AudioOutputDevice,
  PlaybackState,
  SpectrumFrame,
} from '@/services/tauri-bindings';
import {
  getPlaybackState,
  initialPlaybackState,
  listAudioOutputDevices,
  pausePlayback,
  playTrack as requestTrackPlayback,
  resumePlayback,
  seekPlayback,
  selectAudioOutputDevice,
  setHifiMode as requestHifiMode,
  setPlaybackVolume,
  setSpectrumActive,
  setVisualizationEnabled,
  stopPlayback,
} from '@/services/playbackService';

type PlaybackEventName =
  'playback://state' | 'playback://position' | 'playback://ended' | 'playback://error';

function asAppError(cause: unknown): AppError {
  if (typeof cause === 'object' && cause !== null && 'code' in cause && 'message' in cause) {
    return cause as AppError;
  }
  return {
    code: 'playback-command-failed',
    message: cause instanceof Error ? cause.message : 'The playback command failed.',
  };
}

/** Rust events and command results are the sole source of playback timing and state. */
export function useNativePlayback() {
  const [playback, setPlayback] = useState<PlaybackState>(initialPlaybackState);
  const [error, setError] = useState<AppError | null>(null);
  const [endedCount, setEndedCount] = useState(0);
  const [spectrum, setSpectrum] = useState<SpectrumFrame | null>(null);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[]>([]);
  const lastAudibleVolume = useRef(1);

  const applyPlayback = useCallback((next: PlaybackState) => {
    setPlayback(next);
    if (next.status !== 'playing') setSpectrum(null);
    if (!next.muted && (next.volume ?? 0) > 0) lastAudibleVolume.current = next.volume ?? 1;
  }, []);

  const request = useCallback(
    async (operation: () => Promise<PlaybackState>) => {
      try {
        const next = await operation();
        setError(null);
        applyPlayback(next);
        return next;
      } catch (cause) {
        const nextError = asAppError(cause);
        setError(nextError);
        return null;
      }
    },
    [applyPlayback],
  );

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const subscribe = async <T>(event: PlaybackEventName, callback: (payload: T) => void) => {
      const unlisten = await listen<T>(event, ({ payload }) => callback(payload));
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };

    void Promise.all([
      subscribe<PlaybackState>('playback://state', applyPlayback),
      subscribe<PlaybackState>('playback://position', applyPlayback),
      subscribe<PlaybackState>('playback://ended', (next) => {
        applyPlayback(next);
        setEndedCount((count) => count + 1);
      }),
      subscribe<AppError>('playback://error', setError),
      listen<SpectrumFrame>('playback://spectrum', ({ payload }) => setSpectrum(payload)).then(
        (unlisten) => {
          if (disposed) unlisten();
          else unlisteners.push(unlisten);
        },
      ),
      listAudioOutputDevices()
        .then(setOutputDevices)
        .catch(() => undefined),
      getPlaybackState()
        .then(applyPlayback)
        .catch((cause) => setError(asAppError(cause))),
    ]);

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [applyPlayback]);

  useEffect(() => {
    const updateActivity = () => void setSpectrumActive(!document.hidden).catch(() => undefined);
    updateActivity();
    document.addEventListener('visibilitychange', updateActivity);
    return () => {
      document.removeEventListener('visibilitychange', updateActivity);
      void setSpectrumActive(false).catch(() => undefined);
    };
  }, []);

  const playTrack = useCallback(
    (track: TrackItem) => request(() => requestTrackPlayback(track.audioUrl ?? '')),
    [request],
  );
  const togglePlayback = useCallback(
    () => request(() => (playback.status === 'playing' ? pausePlayback() : resumePlayback())),
    [playback.status, request],
  );
  const seek = useCallback(
    (seconds: number) => request(() => seekPlayback(seconds * 1_000)),
    [request],
  );
  const setVolume = useCallback(
    (volume: number) => request(() => setPlaybackVolume(volume)),
    [request],
  );
  const toggleMute = useCallback(() => {
    const target = playback.muted ? lastAudibleVolume.current : 0;
    return request(() => setPlaybackVolume(target));
  }, [playback.muted, request]);
  const setHifi = useCallback(
    (enabled: boolean) => request(() => requestHifiMode(enabled)),
    [request],
  );
  const stop = useCallback(() => request(stopPlayback), [request]);
  const selectOutput = useCallback(async (deviceId: string | null) => {
    try {
      const devices = await selectAudioOutputDevice(deviceId);
      setOutputDevices(devices);
      setError(null);
      return devices;
    } catch (cause) {
      setError(asAppError(cause));
      return null;
    }
  }, []);
  const setVisualization = useCallback(async (enabled: boolean) => {
    try {
      return await setVisualizationEnabled(enabled);
    } catch (cause) {
      setError(asAppError(cause));
      return null;
    }
  }, []);

  return {
    playback,
    error,
    endedCount,
    spectrum,
    outputDevices,
    playTrack,
    togglePlayback,
    seek,
    setVolume,
    toggleMute,
    setHifi,
    selectOutput,
    setVisualization,
    stop,
  };
}
