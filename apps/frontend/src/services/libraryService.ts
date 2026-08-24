import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { TrackItem } from '@/types';
import {
  commands,
  type AppError,
  type CatalogQuery,
  type LibraryRoot,
  type LibraryScan,
  type ScanProgress,
  type TrackSummary,
} from './tauri-bindings';

export type LibraryScanPhase =
  'idle' | 'scanning' | 'empty' | 'complete' | 'partial-error' | 'permission-error' | 'error';

export interface LibraryScanSnapshot {
  phase: LibraryScanPhase;
  root: string | null;
  roots: LibraryRoot[];
  tracks: TrackItem[];
  totalTracks: number;
  warnings: string[];
  progress: ScanProgress | null;
  error: AppError | null;
}

export const initialLibraryScan: LibraryScanSnapshot = {
  phase: 'idle',
  root: null,
  roots: [],
  tracks: [],
  totalTracks: 0,
  warnings: [],
  progress: null,
  error: null,
};

export async function chooseLibraryFolder(): Promise<string | null> {
  const selection = await open({
    directory: true,
    multiple: false,
    title: 'Select your music library',
  });
  return typeof selection === 'string' ? selection : null;
}

export async function scanLibrary(root: string): Promise<LibraryScan> {
  const result = await commands.addLibraryRoot(root, null);
  if (result.status === 'error') {
    throw result.error;
  }
  return result.data;
}

const defaultCatalogQuery: CatalogQuery = {
  rootId: null,
  search: null,
  available: null,
  sort: 'title',
  direction: 'ascending',
  offset: 0,
  limit: 200,
};

export async function loadLibraryCatalog(search = ''): Promise<LibraryScanSnapshot> {
  const [rootsResult, tracksResult] = await Promise.all([
    commands.listLibraryRoots(),
    commands.queryCatalogTracks({
      ...defaultCatalogQuery,
      search: search.trim() || null,
    }),
  ]);
  if (rootsResult.status === 'error') throw rootsResult.error;
  if (tracksResult.status === 'error') throw tracksResult.error;
  const roots = rootsResult.data;
  const tracks = tracksResult.data.items.map(toTrackItem);
  const offlineRoots = roots.filter((root) => root.availability !== 'online');
  return {
    phase: roots.length === 0 ? 'idle' : tracks.length === 0 ? 'empty' : 'complete',
    root:
      roots.length === 1
        ? roots[0].path
        : roots.length > 1
          ? `${roots.length} library roots`
          : null,
    roots,
    tracks,
    totalTracks: tracksResult.data.total,
    warnings: offlineRoots.map((root) => `${root.label} is ${root.availability}.`),
    progress: null,
    error: null,
  };
}

export async function loadLibraryDelta(trackIds: string[]) {
  const [rootsResult, trackResults] = await Promise.all([
    commands.listLibraryRoots(),
    Promise.all(trackIds.map((trackId) => commands.getTrackMetadata(trackId))),
  ]);
  if (rootsResult.status === 'error') throw rootsResult.error;
  return {
    roots: rootsResult.data,
    tracks: trackResults.flatMap((result) => (result.status === 'ok' ? [result.data] : [])),
  };
}

export async function setLibraryRootEnabled(rootId: string, enabled: boolean) {
  const result = await commands.setLibraryRootEnabled(rootId, enabled);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function rescanLibraryRoot(rootId: string) {
  const result = await commands.rescanLibraryRoot(rootId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function removeLibraryRoot(rootId: string) {
  const result = await commands.removeLibraryRoot(rootId, true);
  if (result.status === 'error') throw result.error;
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return '—';
  const seconds = Math.floor(durationMs / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatSampleRate(track: TrackSummary): string {
  const rate = track.sampleRate ? `${track.sampleRate / 1_000}kHz` : 'Unknown rate';
  return track.bitDepth ? `${track.bitDepth}-bit/${rate}` : rate;
}

function formatBitrate(track: TrackSummary): string {
  if (!track.durationMs) return '—';
  return `${Math.round((track.fileSize * 8) / (track.durationMs / 1_000) / 1_000)} kbps`;
}

export function toArtworkUrl(path: string | null): string | undefined {
  return path ? convertFileSrc(path) : undefined;
}

/** Adapts the existing presentation model without manufacturing music metadata. */
export function toTrackItem(track: TrackSummary, index: number): TrackItem {
  return {
    id: track.id,
    trackNumber: track.trackNumber ?? index + 1,
    title: track.title,
    artist: track.artists.map((artist) => artist.name).join(', ') || 'Unknown Artist',
    album: track.album || 'Unknown Album',
    codec: track.extension.toUpperCase() as TrackItem['codec'],
    sampleRate: formatSampleRate(track),
    dynamicRange: '—',
    bitrate: formatBitrate(track),
    replayGain: '—',
    year: track.year ?? 0,
    catalogNumber: track.catalogNumber ?? '—',
    duration: formatDuration(track.durationMs),
    durationSeconds: Math.floor((track.durationMs ?? 0) / 1_000),
    coverUrl: toArtworkUrl(track.artworkPath),
    audioUrl: track.path,
    artistIds: track.artists.map((artist) => artist.id),
    albumId: track.albumId ?? undefined,
    genres: track.genres,
    playCount: track.playCount,
  };
}

export function toLibrarySnapshot(
  scan: LibraryScan,
  progress: ScanProgress | null,
  roots: LibraryRoot[] = [],
): LibraryScanSnapshot {
  const tracks = scan.tracks.map(toTrackItem);
  return {
    phase: scan.warnings.length > 0 ? 'partial-error' : tracks.length === 0 ? 'empty' : 'complete',
    root: scan.root,
    roots,
    tracks,
    totalTracks: tracks.length,
    warnings: scan.warnings,
    progress,
    error: null,
  };
}

export function errorSnapshot(error: AppError): LibraryScanSnapshot {
  return {
    ...initialLibraryScan,
    phase: error.code.includes('unavailable') ? 'permission-error' : 'error',
    error,
  };
}
