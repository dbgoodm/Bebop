import {
  commands,
  type AppError,
  type AudioOutputDevice,
  type PlaybackState,
  type PlayerPreferences,
} from './tauri-bindings';

export const initialPlaybackState: PlaybackState = {
  trackId: null,
  path: null,
  status: 'stopped',
  positionMs: 0,
  durationMs: 0,
  volume: 1,
  muted: false,
  hifiMode: true,
  output: null,
};

type PlaybackCommandResult =
  { status: 'ok'; data: PlaybackState } | { status: 'error'; error: AppError };

async function unwrapPlayback(result: Promise<PlaybackCommandResult>): Promise<PlaybackState> {
  const resolved = await result;
  if (resolved.status === 'error') throw resolved.error;
  return resolved.data;
}

export function getPlaybackState() {
  return unwrapPlayback(commands.getPlaybackState());
}

export function playTrack(path: string) {
  return unwrapPlayback(commands.playTrack(path));
}

export function pausePlayback() {
  return unwrapPlayback(commands.pausePlayback());
}

export function resumePlayback() {
  return unwrapPlayback(commands.resumePlayback());
}

export function stopPlayback() {
  return unwrapPlayback(commands.stopPlayback());
}

export function seekPlayback(positionMs: number) {
  return unwrapPlayback(commands.seekPlayback(Math.max(0, Math.round(positionMs))));
}

export function setPlaybackVolume(volume: number) {
  return unwrapPlayback(commands.setVolume(Math.max(0, Math.min(1, volume))));
}

export function setHifiMode(enabled: boolean) {
  return unwrapPlayback(commands.setHifiMode(enabled));
}

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: AppError }): T {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  return unwrap(await commands.listAudioOutputDevices());
}

export async function selectAudioOutputDevice(deviceId: string | null) {
  return unwrap(await commands.selectAudioOutputDevice(deviceId));
}

export async function setVisualizationEnabled(enabled: boolean): Promise<PlayerPreferences> {
  return unwrap(await commands.setVisualizationEnabled(enabled));
}

export async function setSpectrumActive(active: boolean) {
  return unwrap(await commands.setSpectrumActive(active));
}
