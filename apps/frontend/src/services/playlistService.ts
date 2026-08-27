import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  commands,
  type AudioAnalysisProgress,
  type GeneratedPlaylist,
  type Playlist,
  type PlaylistGenerationRequest,
  type PlaylistSummary as NativePlaylistSummary,
} from './tauri-bindings';
import { toArtworkUrl, toTrackItem } from './libraryService';

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: unknown }) {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export type PlaylistDetail = Omit<Playlist, 'tracks'> & {
  tracks: ReturnType<typeof toTrackItem>[];
};

export type GeneratedPlaylistPreview = Omit<GeneratedPlaylist, 'selections'> & {
  selections: Array<
    Omit<GeneratedPlaylist['selections'][number], 'track'> & {
      track: ReturnType<typeof toTrackItem>;
    }
  >;
};

export type PlaylistSummary = NativePlaylistSummary & { coverUrls: string[] };

function toPlaylistSummary(playlist: NativePlaylistSummary): PlaylistSummary {
  return {
    ...playlist,
    coverUrls: playlist.coverArtworkPaths
      .map(toArtworkUrl)
      .filter((url): url is string => Boolean(url)),
  };
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  return unwrap(await commands.listPlaylists()).map(toPlaylistSummary);
}

export async function createPlaylist(name: string, trackIds: string[] = []) {
  const playlist = unwrap(await commands.createPlaylist(name));
  if (trackIds.length > 0) unwrap(await commands.setPlaylistTracks(playlist.id, trackIds));
  return toPlaylistSummary({ ...playlist, trackCount: trackIds.length });
}

export async function getPlaylist(playlistId: string): Promise<PlaylistDetail> {
  const playlist = unwrap(await commands.getPlaylist(playlistId));
  return { ...playlist, tracks: playlist.tracks.map(toTrackItem) };
}

export async function renamePlaylist(playlistId: string, name: string) {
  return toPlaylistSummary(unwrap(await commands.renamePlaylist(playlistId, name)));
}

export async function deletePlaylist(playlistId: string) {
  unwrap(await commands.deletePlaylist(playlistId));
}

export async function duplicatePlaylist(playlistId: string, name: string) {
  return toPlaylistSummary(unwrap(await commands.duplicatePlaylist(playlistId, name)));
}

export async function setPlaylistTracks(playlistId: string, trackIds: string[]) {
  unwrap(await commands.setPlaylistTracks(playlistId, trackIds));
}

export async function generatePlaylist(
  request: PlaylistGenerationRequest,
): Promise<GeneratedPlaylistPreview> {
  const generated = unwrap(await commands.generatePlaylist(request));
  return {
    ...generated,
    selections: generated.selections.map((selection, index) => ({
      ...selection,
      track: toTrackItem(selection.track, index),
    })),
  };
}

export async function createGeneratedPlaylist(name: string, request: PlaylistGenerationRequest) {
  const playlist = unwrap(await commands.createGeneratedPlaylist(name, request));
  return { ...playlist, tracks: playlist.tracks.map(toTrackItem) };
}

export async function analyzeAudioFeatures(trackIds: string[], force = false) {
  return unwrap(await commands.analyzeAudioFeatures(trackIds, force));
}

export function onAudioAnalysisProgress(
  listener: (progress: AudioAnalysisProgress) => void,
): Promise<UnlistenFn> {
  return listen<AudioAnalysisProgress>('analysis://progress', (event) => listener(event.payload));
}

export type { PlaylistGenerationRequest };
