import type { AlbumItem, ArtistItem, AudioFormat, GenreItem } from '@/types';
import { commands, type AlbumSummary, type ArtistSummary } from './tauri-bindings';
import { toArtworkUrl, toTrackItem } from './libraryService';

export interface CatalogDiscovery {
  artists: ArtistItem[];
  albums: AlbumItem[];
  genres: GenreItem[];
}

function durationLabel(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function fileSizeLabel(bytes: number) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1_024)), units.length - 1);
  return `${(bytes / 1_024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

function artistItem(artist: ArtistSummary): ArtistItem {
  const artworkUrl = toArtworkUrl(artist.artworkPath);
  return {
    id: artist.id,
    name: artist.name,
    genres: artist.genres,
    albumCount: artist.albumCount,
    trackCount: artist.trackCount,
    totalDuration: durationLabel(artist.totalDurationMs),
    avatarUrl: artworkUrl,
    bannerUrl: artworkUrl,
    featuredCoverUrl: artworkUrl,
    bioSummary: `${artist.trackCount.toLocaleString()} local tracks across ${artist.albumCount.toLocaleString()} albums, totaling ${durationLabel(artist.totalDurationMs)}.`,
    losslessPlaytime: durationLabel(artist.totalDurationMs),
    losslessPercentage: 'Local files',
    localStorageSize: fileSizeLabel(artist.totalFileSize),
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
  };
}

export async function loadDiscovery(search: string): Promise<CatalogDiscovery> {
  const result = await commands.queryDiscovery({
    search: search.trim() || null,
    offset: 0,
    limit: 5_000,
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

export async function loadArtistDetail(artistId: string): Promise<ArtistItem> {
  const result = await commands.getArtistDetail(artistId);
  if (result.status === 'error') throw result.error;
  const tracks = result.data.tracks.map(toTrackItem);
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
      formatBadge: 'Local audio',
      trackCount: album.trackCount,
      coverUrl: toArtworkUrl(album.artworkPath),
      isLocal: true,
      catalogNumber: album.catalogNumber ?? undefined,
    })),
  };
}

export async function loadAlbumDetail(albumId: string): Promise<AlbumItem> {
  const result = await commands.getAlbumDetail(albumId);
  if (result.status === 'error') throw result.error;
  const tracks = result.data.tracks.map(toTrackItem);
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
