import { commands, type AppError, type PlaybackState } from './tauri-bindings';

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
