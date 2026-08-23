import { commands, type HomeSnapshot, type PlayerPreferences } from './tauri-bindings';
import { toTrackItem } from './libraryService';

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: unknown }) {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function loadPersistentPlayerState() {
  const state = unwrap(await commands.getPersistentPlayerState());
  return {
    ...state,
    queue: state.queue.map(toTrackItem),
  };
}

export async function savePlayerQueue(trackIds: string[]) {
  unwrap(await commands.savePlayerQueue(trackIds));
}

export async function savePlayerPreferences(preferences: PlayerPreferences) {
  return unwrap(await commands.savePlayerPreferences(preferences));
}

export async function loadHomeSnapshot(): Promise<HomeSnapshot> {
  return unwrap(await commands.getHomeSnapshot());
}

export async function loadFavoriteTrackIds() {
  const favorites = unwrap(await commands.listFavorites());
  return new Set(
    favorites
      .filter((favorite) => favorite.entityType === 'track')
      .map((favorite) => favorite.entityId),
  );
}

export async function setTrackFavorite(trackId: string, favorite: boolean) {
  return unwrap(await commands.setFavorite('track', trackId, favorite));
}

export async function saveThemePreference(themeId: string) {
  return unwrap(await commands.setThemePreference(themeId));
}

export async function saveLibraryViewPreference(libraryView: string) {
  return unwrap(await commands.setLibraryViewPreference(libraryView));
}

export async function loadPlaylists() {
  return unwrap(await commands.listPlaylists());
}

export async function loadPlaylistTracks(playlistId: string) {
  return unwrap(await commands.getPlaylistTracks(playlistId)).map(toTrackItem);
}

export async function createPlaylistFromQueue(name: string, trackIds: string[]) {
  const playlist = unwrap(await commands.createPlaylist(name));
  unwrap(await commands.setPlaylistTracks(playlist.id, trackIds));
  return { ...playlist, trackCount: trackIds.length };
}

export async function loadUiPreference(key: string) {
  return unwrap(await commands.getUiPreference(key));
}

export async function saveUiPreference(key: string, value: string) {
  unwrap(await commands.setUiPreference(key, value));
}
