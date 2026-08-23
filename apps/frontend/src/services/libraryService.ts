import { open } from '@tauri-apps/plugin-dialog';
import type { TrackItem } from '@/types';
import {
  commands,
  type AppError,
  type LibraryScan,
  type ScanProgress,
  type TrackSummary,
} from './tauri-bindings';

export type LibraryScanPhase =
  'idle' | 'scanning' | 'empty' | 'complete' | 'partial-error' | 'permission-error' | 'error';

export interface LibraryScanSnapshot {
  phase: LibraryScanPhase;
  root: string | null;
  tracks: TrackItem[];
  warnings: string[];
  progress: ScanProgress | null;
  error: AppError | null;
}

export const initialLibraryScan: LibraryScanSnapshot = {
  phase: 'idle',
  root: null,
  tracks: [],
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
  const result = await commands.scanLibrary(root);
  if (result.status === 'error') {
    throw result.error;
  }
  return result.data;
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

/** Adapts the existing presentation model without manufacturing music metadata. */
export function toTrackItem(track: TrackSummary, index: number): TrackItem {
  return {
    id: track.id,
    trackNumber: index + 1,
    title: track.title,
    artist: 'Unknown artist',
    album: 'Local library',
    codec: track.extension.toUpperCase() as TrackItem['codec'],
    sampleRate: formatSampleRate(track),
    dynamicRange: '—',
    bitrate: formatBitrate(track),
    replayGain: '—',
    year: 0,
    catalogNumber: '—',
    duration: formatDuration(track.durationMs),
    durationSeconds: Math.floor((track.durationMs ?? 0) / 1_000),
    audioUrl: track.path,
  };
}

export function toLibrarySnapshot(
  scan: LibraryScan,
  progress: ScanProgress | null,
): LibraryScanSnapshot {
  const tracks = scan.tracks.map(toTrackItem);
  return {
    phase: scan.warnings.length > 0 ? 'partial-error' : tracks.length === 0 ? 'empty' : 'complete',
    root: scan.root,
    tracks,
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
