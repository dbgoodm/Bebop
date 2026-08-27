import type { AlbumItem, ArtistItem, AudioFormat, GenreItem, TrackItem } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  commands,
  type AlbumSummary,
  type ArtistInformation,
  type ArtistSummary,
  type AudioSpecs,
  type DiscographySyncProgress,
  type UnifiedTrackSummary,
} from './tauri-bindings';
import { toArtworkUrl, toTrackItem } from './libraryService';

export interface CatalogDiscovery {
  artists: ArtistItem[];
  albums: AlbumItem[];
  genres: GenreItem[];
}

export interface ArtistCatalogPage {
  items: ArtistItem[];
  nextCursor: string | null;
  pageSize: number;
}

function durationLabel(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatTrackDuration(durationMs: number | null): string {
  if (!durationMs) return '—';
  const seconds = Math.floor(durationMs / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatAudioSpecs(specs: AudioSpecs | null): string {
  if (!specs) return '—';
  const rate = specs.sampleRate ? `${specs.sampleRate / 1_000}kHz` : '';
  const bit = specs.bitDepth ? `${specs.bitDepth}-bit` : '';
  if (bit && rate) return `${bit}/${rate}`;
  return bit || rate || specs.extension.toUpperCase();
}

function fileSizeLabel(bytes: number) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1_024)), units.length - 1);
  return `${(bytes / 1_024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

export function toUnifiedTrackItem(
  track: UnifiedTrackSummary,
  album: AlbumSummary,
  index: number,
): TrackItem {
  const artistNames =
    track.artists.map((a) => a.name).join(', ') ||
    album.artists.map((a) => a.name).join(', ') ||
    'Unknown Artist';

  const codec = track.audioSpecs?.extension
    ? (track.audioSpecs.extension.toUpperCase() as TrackItem['codec'])
    : track.isLocal
      ? 'FLAC'
      : '—';

  return {
    id: track.id ?? track.remoteId,
    trackNumber: track.trackNumber || index + 1,
    title: track.title,
    artist: artistNames,
    album: album.title,
    codec,
    sampleRate: track.audioSpecs
      ? formatAudioSpecs(track.audioSpecs)
      : track.isLocal
        ? 'Lossless'
        : 'Remote Track',
    dynamicRange: '—',
    bitrate: '—',
    replayGain: '—',
    year: album.year ?? 0,
    catalogNumber: album.catalogNumber ?? '—',
    duration: formatTrackDuration(track.durationMs),
    durationSeconds: Math.floor((track.durationMs ?? 0) / 1_000),
    coverUrl: toArtworkUrl(album.artworkPath),
    audioUrl: undefined,
    artistIds: track.artists.map((a) => a.id),
    albumId: album.id,
    isLocal: track.isLocal,
    remoteId: track.remoteId,
    isrc: track.isrc ?? undefined,
    acquisitionStatus: track.acquisitionStatus,
    musicbrainzRecordingId: track.musicbrainzRecordingId ?? undefined,
    spotifyTrackId: track.spotifyTrackId ?? undefined,
  };
}

function artistItem(artist: ArtistSummary): ArtistItem {
  const artworkUrl = toArtworkUrl(artist.artworkPath);
  return {
    id: artist.id,
    name: artist.name,
    musicbrainzArtistId: artist.musicbrainzArtistId ?? undefined,
    genres: artist.genres,
    albumCount: artist.albumCount,
    trackCount: artist.trackCount,
    totalDuration: durationLabel(artist.totalDurationMs),
    avatarUrl: artworkUrl,
    bannerUrl: artworkUrl,
    featuredCoverUrl: artworkUrl,
    losslessPlaytime: durationLabel(artist.totalDurationMs),
    losslessPercentage: artist.provenance === 'remote' ? 'Remote catalog' : 'Local files',
    localStorageSize: fileSizeLabel(artist.totalFileSize),
    provenance: artist.provenance,
    availability: artist.availability,
    providerIds: artist.providerIds,
    lastRefreshedAt: artist.lastRefreshedAt ?? undefined,
  };
}

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: unknown }) {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function loadArtistInformation(artistId: string): Promise<Partial<ArtistItem>> {
  const information: ArtistInformation = unwrap(await commands.getArtistInformation(artistId));
  return {
    musicbrainzArtistId: information.musicbrainzArtistId ?? undefined,
    aliases: information.aliases,
    country: information.country ?? undefined,
    activeFrom: information.activeFrom ?? undefined,
    activeTo: information.activeTo ?? undefined,
    genres: information.genres,
    bioSummary: information.biography ?? undefined,
    bioSourceUrl: information.canonicalSourceUrl ?? undefined,
    bioAttribution: information.imageAttribution ?? undefined,
    avatarUrl: information.imageUrl ?? undefined,
    bannerUrl: information.imageUrl ?? undefined,
  };
}

function albumItem(album: AlbumSummary): AlbumItem {
  return {
    id: album.id,
    title: album.title,
    artist: album.artists.map((artist) => artist.name).join(', ') || 'Unknown Artist',
    year: album.year ?? 0,
    trackCount: album.trackCount,
    totalDuration: durationLabel(album.totalDurationMs),
    format: 'ALAC' as AudioFormat,
    codec: 'Local audio',
    catalogNumber: album.catalogNumber ?? '—',
    coverUrl: toArtworkUrl(album.artworkPath),
    dynamicRange: '—',
    label: album.label ?? undefined,
    fileSize: fileSizeLabel(album.totalFileSize),
    tracks: [],
    availability: album.availability,
    provenance: album.provenance,
    providerIds: album.providerIds,
    lastRefreshedAt: album.lastRefreshedAt ?? undefined,
  };
}

export async function loadDiscovery(search: string): Promise<CatalogDiscovery> {
  const result = await commands.queryDiscovery({
    search: search.trim() || null,
    offset: 0,
    limit: 100,
  });
  if (result.status === 'error') throw result.error;
  return {
    artists: result.data.artists.map(artistItem),
    albums: result.data.albums.map(albumItem),
    genres: result.data.genres.map((genre) => ({
      id: genre.id,
      name: genre.name,
      albumCount: genre.albumCount,
      trackCount: genre.trackCount,
      artists: genre.artists.map((artist) => artist.name),
    })),
  };
}

/** Loads only the visible-sized artist page. The native cursor is keyset based
 * so a large library never causes the Artist grid to hydrate wholesale. */
export async function loadArtistPage(
  search: string,
  cursor: string | null = null,
): Promise<ArtistCatalogPage> {
  const page = await invoke<{
    items: ArtistSummary[];
    nextCursor: string | null;
    pageSize: number;
  }>('query_artists_page', {
    query: { search: search.trim() || null, cursor, pageSize: 72, available: true },
  });
  return {
    items: page.items.map(artistItem),
    nextCursor: page.nextCursor,
    pageSize: page.pageSize,
  };
}

export async function loadArtistDetail(artistId: string): Promise<ArtistItem> {
  const result = await commands.getArtistDetail(artistId);
  if (result.status === 'error') throw result.error;
  const tracks = result.data.tracks.map((t, idx) => ({ ...toTrackItem(t, idx), isLocal: true }));
  return {
    ...artistItem(result.data.artist),
    tracks,
    topTracks: tracks.map((track, index) => ({
      id: track.id,
      rank: index + 1,
      title: track.title,
      artist: track.artist,
      album: track.album,
      dynamicRange: track.dynamicRange,
      format: track.sampleRate,
      playCount: track.playCount ?? 0,
      duration: track.duration,
      durationSeconds: track.durationSeconds,
    })),
    discography: result.data.albums.map((album) => ({
      id: album.id,
      title: album.title,
      year: album.year ?? 0,
      formatBadge: album.availability === 'in-library' ? 'Local audio' : 'Remote release',
      trackCount: album.trackCount,
      coverUrl: toArtworkUrl(album.artworkPath),
      isLocal: album.availability === 'in-library',
      availability: album.availability,
      provenance: album.provenance,
      providerIds: album.providerIds,
      lastRefreshedAt: album.lastRefreshedAt ?? undefined,
      catalogNumber: album.catalogNumber ?? undefined,
    })),
  };
}

/**
 * Cache MusicBrainz discographies for every artist in the library.
 *
 * Returns as soon as the background sync starts; progress arrives on the
 * `catalog://discography-sync` event. Artists refreshed within `staleAfterDays`
 * are skipped, so calling this after each scan is cheap.
 */
export async function syncLibraryDiscographies(staleAfterDays: number | null = null) {
  const result = await commands.syncLibraryDiscographies(staleAfterDays);
  if (result.status === 'error') throw result.error;
}

export function subscribeDiscographySync(
  handler: (progress: DiscographySyncProgress) => void,
): Promise<UnlistenFn> {
  return listen<DiscographySyncProgress>('catalog://discography-sync', (event) =>
    handler(event.payload),
  );
}

export async function refreshArtistDiscography(artistId: string): Promise<ArtistItem> {
  const result = await commands.refreshArtistDiscography(artistId);
  if (result.status === 'error') throw result.error;
  const tracks = result.data.tracks.map((t, idx) => ({ ...toTrackItem(t, idx), isLocal: true }));
  return {
    ...artistItem(result.data.artist),
    tracks,
    topTracks: tracks.map((track, index) => ({
      id: track.id,
      rank: index + 1,
      title: track.title,
      artist: track.artist,
      album: track.album,
      dynamicRange: track.dynamicRange,
      format: track.sampleRate,
      playCount: track.playCount ?? 0,
      duration: track.duration,
      durationSeconds: track.durationSeconds,
    })),
    discography: result.data.albums.map((album) => ({
      id: album.id,
      title: album.title,
      year: album.year ?? 0,
      formatBadge: album.availability === 'in-library' ? 'Local audio' : 'Remote release',
      trackCount: album.trackCount,
      coverUrl: toArtworkUrl(album.artworkPath),
      isLocal: album.availability === 'in-library',
      availability: album.availability,
      provenance: album.provenance,
      providerIds: album.providerIds,
      lastRefreshedAt: album.lastRefreshedAt ?? undefined,
      catalogNumber: album.catalogNumber ?? undefined,
    })),
  };
}

export async function loadAlbumDetail(albumId: string): Promise<AlbumItem> {
  try {
    const unifiedResult = await commands.getUnifiedAlbumDetail(albumId);
    if (unifiedResult.status === 'ok') {
      const data = unifiedResult.data;
      const tracks = data.tracks.map((track, idx) => toUnifiedTrackItem(track, data.album, idx));
      const item = albumItem(data.album);
      const localTrack = tracks.find((t) => t.isLocal);
      return {
        ...item,
        format: (localTrack?.codec ?? item.format) as AudioFormat,
        codec: localTrack?.codec ?? (data.album.availability === 'not-local' ? 'Remote Stream' : item.codec),
        sampleRate: localTrack?.sampleRate ?? (data.album.availability === 'not-local' ? 'Lossless Stream' : item.sampleRate),
        tracks,
      };
    }
  } catch {
    // Fall back to getAlbumDetail
  }

  const result = await commands.getAlbumDetail(albumId);
  if (result.status === 'error') throw result.error;
  const tracks = result.data.tracks.map((t, idx) => ({ ...toTrackItem(t, idx), isLocal: true }));
  const item = albumItem(result.data.album);
  return {
    ...item,
    format: (tracks[0]?.codec ?? item.format) as AudioFormat,
    codec: tracks[0]?.codec ?? item.codec,
    sampleRate: tracks[0]?.sampleRate,
    genre: tracks[0]?.genres?.join(', '),
    tracks,
  };
}

