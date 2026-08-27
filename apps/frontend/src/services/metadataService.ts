import type { TrackItem } from '@/types';
import {
  commands,
  type EnrichmentCandidate,
  type MetadataPatch,
  type MetadataJobScope,
  type TrackSummary,
} from './tauri-bindings';

export function patchFromTrack(track: TrackItem): MetadataPatch {
  return {
    title: track.title,
    artists:
      track.artist === 'Unknown Artist' ? [] : track.artist.split(',').map((item) => item.trim()),
    album: track.album,
    albumArtists: null,
    genres: track.genres ?? [],
    trackNumber: track.trackNumber,
    trackTotal: null,
    discNumber: null,
    discTotal: null,
    year: track.year || null,
    date: null,
    composer: null,
    label: null,
    catalogNumber: track.catalogNumber === '—' ? null : track.catalogNumber,
    isrc: null,
    musicbrainzRecordingId: null,
    musicbrainzReleaseId: null,
    musicbrainzArtistIds: null,
    musicbrainzAlbumArtistIds: null,
    artworkId: null,
    lyrics: null,
  };
}

export function patchFromTrackSummary(track: TrackSummary): MetadataPatch {
  return {
    title: track.title,
    artists: track.artists.map((artist) => artist.name),
    album: track.album,
    albumArtists: track.albumArtists.map((artist) => artist.name),
    genres: track.genres,
    trackNumber: track.trackNumber,
    trackTotal: track.trackTotal,
    discNumber: track.discNumber,
    discTotal: track.discTotal,
    year: track.year,
    date: track.date,
    composer: track.composer,
    label: track.label,
    catalogNumber: track.catalogNumber,
    isrc: track.isrc,
    musicbrainzRecordingId: track.musicbrainzRecordingId,
    musicbrainzReleaseId: null,
    musicbrainzArtistIds: null,
    musicbrainzAlbumArtistIds: null,
    artworkId: track.artworkId,
    lyrics: null,
  };
}

export async function loadTrackMetadata(trackId: string) {
  const result = await commands.getMetadataPatch(trackId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function saveMetadataDraft(trackId: string, patch: MetadataPatch) {
  const result = await commands.saveMetadataDraft(trackId, patch);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function previewMetadataChanges(
  trackIds: string[],
  patch: MetadataPatch,
  source = 'manual',
  confidence = 1,
) {
  const result = await commands.previewMetadataChanges(trackIds, patch, source, confidence);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function writeMetadataToFile(trackId: string) {
  const result = await commands.writeMetadataToFile(trackId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function rollbackMetadataFile(trackId: string) {
  const result = await commands.rollbackMetadataFile(trackId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export function getMusicBrainzEnabled() {
  return commands.getMusicbrainzEnabled();
}

export function setMusicBrainzEnabled(enabled: boolean) {
  return commands.setMusicbrainzEnabled(enabled);
}

export function getAcoustIdConfigured() {
  return commands.getAcoustidConfigured();
}

export async function configureAcoustIdClientKey(clientKey: string) {
  const result = await commands.configureAcoustidClientKey(clientKey);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function startMetadataJob(scope: MetadataJobScope, scopeId?: string) {
  const result = await commands.startMetadataJob(scope, scopeId ?? null);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function listMetadataJobs() {
  const result = await commands.listMetadataJobs();
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function pauseMetadataJob(jobId: string) {
  const result = await commands.pauseMetadataJob(jobId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function resumeMetadataJob(jobId: string, retryFailed = false) {
  const result = await commands.resumeMetadataJob(jobId, retryFailed);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function cancelMetadataJob(jobId: string) {
  const result = await commands.cancelMetadataJob(jobId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function runMusicBrainzEnrichment(trackId: string) {
  const result = await commands.runMusicbrainzEnrichment(trackId);
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function applyMusicBrainzCandidate(trackId: string, candidate: EnrichmentCandidate) {
  const result = await commands.applyMusicbrainzCandidate(trackId, candidate);
  if (result.status === 'error') throw result.error;
  return result.data;
}
