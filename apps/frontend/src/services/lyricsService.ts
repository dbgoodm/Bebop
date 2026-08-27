import { commands, type LyricsDocument } from './tauri-bindings';

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: unknown }) {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export function loadTrackLyrics(trackId: string): Promise<LyricsDocument> {
  return commands.getTrackLyrics(trackId).then(unwrap);
}
