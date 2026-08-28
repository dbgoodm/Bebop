import { useEffect, useState } from 'react';
import type { TrackItem } from '@/types';
import type {
  AppError,
  EnrichmentCandidate,
  EnrichmentJob,
  MetadataReview,
} from '@/services/tauri-bindings';
import {
  applyMusicBrainzCandidate,
  configureAcoustIdClientKey,
  getAcoustIdConfigured,
  getMusicBrainzEnabled,
  loadTrackMetadata,
  patchFromTrack,
  previewMetadataChanges,
  rollbackMetadataFile,
  runMusicBrainzEnrichment,
  saveMetadataDraft,
  setMusicBrainzEnabled,
  writeMetadataToFile,
} from '@/services/metadataService';

interface MetadataEditorProps {
  track: TrackItem;
  onClose: () => void;
}

export function MetadataEditor({ track, onClose }: MetadataEditorProps) {
  const [patch, setPatch] = useState(() => patchFromTrack(track));
  const [draftSaved, setDraftSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [musicBrainzEnabled, setMusicBrainzEnabledState] = useState(false);
  const [enrichment, setEnrichment] = useState<EnrichmentJob | null>(null);
  const [reviewingCandidate, setReviewingCandidate] = useState<EnrichmentCandidate | null>(null);
  const [manualReview, setManualReview] = useState<MetadataReview | null>(null);
  const [acoustIdConfigured, setAcoustIdConfigured] = useState(false);
  const [acoustIdKey, setAcoustIdKey] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getMusicBrainzEnabled(),
      getAcoustIdConfigured(),
      loadTrackMetadata(track.id),
    ])
      .then(([enabled, configured, metadata]) => {
        if (!cancelled) {
          setMusicBrainzEnabledState(enabled);
          setAcoustIdConfigured(configured);
          setPatch(metadata);
          setMetadataLoaded(true);
        }
      })
      .catch((cause: AppError) => {
        if (!cancelled) setMessage(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [track.id]);

  const update = (
    field:
      | 'title'
      | 'album'
      | 'date'
      | 'composer'
      | 'label'
      | 'catalogNumber'
      | 'isrc'
      | 'musicbrainzRecordingId'
      | 'musicbrainzReleaseId'
      | 'lyrics',
    value: string,
  ) => changePatch((current) => ({ ...current, [field]: value }));

  const changePatch = (change: (current: typeof patch) => typeof patch) => {
    setPatch(change);
    setManualReview(null);
    setDraftSaved(false);
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setMessage((cause as AppError).message ?? 'Metadata update failed.');
    } finally {
      setBusy(false);
    }
  };

  const applyCandidate = (candidate: EnrichmentCandidate) =>
    run(async () => {
      const saved = await applyMusicBrainzCandidate(track.id, candidate);
      setPatch(saved);
      setDraftSaved(true);
      setReviewingCandidate(null);
    }, 'Applied the reviewed match to Bebop. The audio file was not changed.');

  const updateNumber = (
    field: 'trackNumber' | 'trackTotal' | 'discNumber' | 'discTotal' | 'year',
    value: string,
  ) =>
    changePatch((current) => ({
      ...current,
      [field]: value === '' ? null : Number(value),
    }));

  return (
    <div className="win-round fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-editor-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto t-card t-stroke border border-neutral-700 bg-neutral-950 p-6"
      >
        <h2 id="metadata-editor-title" className="text-xl font-bold text-white">
          Edit metadata
        </h2>
        <p className="mt-1 text-xs text-neutral-500">{track.audioUrl}</p>
        <div className="mt-5 grid gap-4">
          <label className="text-xs text-neutral-400">
            Title
            <input
              value={patch.title ?? ''}
              onChange={(event) => update('title', event.target.value)}
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Artists (comma separated)
            <input
              value={patch.artists?.join(', ') ?? ''}
              onChange={(event) =>
                changePatch((current) => ({
                  ...current,
                  artists: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Album
            <input
              value={patch.album ?? ''}
              onChange={(event) => update('album', event.target.value)}
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Album artists (comma separated)
            <input
              value={patch.albumArtists?.join(', ') ?? ''}
              onChange={(event) =>
                changePatch((current) => ({
                  ...current,
                  albumArtists: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Genres (comma separated)
            <input
              value={patch.genres?.join(', ') ?? ''}
              onChange={(event) =>
                changePatch((current) => ({
                  ...current,
                  genres: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ['trackNumber', 'Track'],
                ['trackTotal', 'Track total'],
                ['discNumber', 'Disc'],
                ['discTotal', 'Disc total'],
                ['year', 'Year'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="text-xs text-neutral-400">
                {label}
                <input
                  type="number"
                  min="0"
                  value={patch[field] ?? ''}
                  onChange={(event) => updateNumber(field, event.target.value)}
                  className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['date', 'Date'],
                ['composer', 'Composer'],
                ['label', 'Label'],
                ['catalogNumber', 'Catalog number'],
                ['isrc', 'ISRC'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="text-xs text-neutral-400">
                {label}
                <input
                  value={patch[field] ?? ''}
                  onChange={(event) => update(field, event.target.value)}
                  className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ['musicbrainzRecordingId', 'Recording MBID'],
                ['musicbrainzReleaseId', 'Release MBID'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="text-xs text-neutral-400">
                {label}
                <input
                  value={patch[field] ?? ''}
                  onChange={(event) => update(field, event.target.value)}
                  className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs text-white"
                />
              </label>
            ))}
          </div>
          <label className="text-xs text-neutral-400">
            Artist MBIDs (comma separated)
            <input
              value={patch.musicbrainzArtistIds?.join(', ') ?? ''}
              onChange={(event) =>
                changePatch((current) => ({
                  ...current,
                  musicbrainzArtistIds: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Album artist MBIDs (comma separated)
            <input
              value={patch.musicbrainzAlbumArtistIds?.join(', ') ?? ''}
              onChange={(event) =>
                changePatch((current) => ({
                  ...current,
                  musicbrainzAlbumArtistIds: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Lyrics
            <textarea
              value={patch.lyrics ?? ''}
              onChange={(event) => update('lyrics', event.target.value)}
              rows={5}
              className="mt-1 w-full resize-y t-sm border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <section className="mt-5 t-card t-stroke border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">MusicBrainz enrichment</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Online lookup is off by default. Matches never write tags to audio files.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              aria-pressed={musicBrainzEnabled}
              onClick={() => {
                const enabled = !musicBrainzEnabled;
                void setMusicBrainzEnabled(enabled).then(setMusicBrainzEnabledState);
              }}
              className="t-control border border-neutral-700 px-3 py-1 text-xs text-neutral-200 disabled:opacity-40"
            >
              {musicBrainzEnabled ? 'Enabled' : 'Enable'}
            </button>
          </div>
          {musicBrainzEnabled ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  aria-label="AcoustID client key"
                  value={acoustIdKey}
                  placeholder={
                    acoustIdConfigured ? 'AcoustID key configured' : 'AcoustID client key'
                  }
                  onChange={(event) => setAcoustIdKey(event.target.value)}
                  className="min-w-48 flex-1 t-sm border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  disabled={busy || acoustIdKey.trim() === ''}
                  onClick={() =>
                    void run(async () => {
                      const configured = await configureAcoustIdClientKey(acoustIdKey);
                      setAcoustIdConfigured(configured);
                      setAcoustIdKey('');
                    }, 'AcoustID client key saved securely.')
                  }
                  className="t-control border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-40"
                >
                  Save key
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const job = await runMusicBrainzEnrichment(track.id);
                    setEnrichment(job);
                    setReviewingCandidate(null);
                    if (job.autoApplied) {
                      setDraftSaved(true);
                    }
                  }, 'Metadata lookup complete.')
                }
                className="t-control border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-40"
              >
                {acoustIdConfigured ? 'Fingerprint & match' : 'Search MusicBrainz'}
              </button>
            </div>
          ) : null}
          {enrichment ? (
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {enrichment.candidates.length === 0 ? (
                <p className="text-xs text-neutral-500">No candidates found.</p>
              ) : (
                enrichment.candidates.map((candidate) => (
                  <div
                    key={`${candidate.recordingId}:${candidate.releaseId ?? ''}`}
                    className="flex items-center justify-between gap-3 t-sm border border-neutral-800 p-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-neutral-200">
                        {candidate.title} — {candidate.artists.join(', ')}
                      </p>
                      <p className="truncate text-neutral-500">
                        {candidate.release ?? 'Unknown release'} · score {candidate.score}
                      </p>
                    </div>
                    {candidate.requiresReview ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setReviewingCandidate(candidate)}
                        className="shrink-0 text-amber-300 underline disabled:opacity-40"
                      >
                        Review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReviewingCandidate(candidate)}
                        className="shrink-0 text-emerald-400 underline"
                      >
                        View exact match
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : null}
          {reviewingCandidate ? (
            <div className="mt-3 t-sm border border-amber-700/50 bg-black/30 p-3 text-xs">
              <p className="font-semibold text-amber-200">
                {reviewingCandidate.source} · {Math.round(reviewingCandidate.confidence * 100)}%
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-neutral-400">
                {reviewingCandidate.confidenceReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <MetadataDiffTable diffs={reviewingCandidate.diffs} />
              {reviewingCandidate.requiresReview ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applyCandidate(reviewingCandidate)}
                  className="mt-3 t-control bg-amber-500 px-3 py-2 font-semibold text-black disabled:opacity-40"
                >
                  Apply reviewed candidate
                </button>
              ) : (
                <p className="mt-3 font-semibold text-emerald-400">Exact match saved to Bebop.</p>
              )}
            </div>
          ) : null}
        </section>
        <section className="mt-5 t-card t-stroke border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Review manual changes</h3>
              <p className="mt-1 text-xs text-neutral-500">
                File writes stay locked until the current field diff has been reviewed and saved.
              </p>
            </div>
            <button
              type="button"
              disabled={!metadataLoaded || busy}
              onClick={() =>
                void run(async () => {
                  setManualReview(await previewMetadataChanges([track.id], patch));
                }, 'Change preview ready.')
              }
              className="t-control border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-40"
            >
              Review changes
            </button>
          </div>
          {manualReview ? (
            <div className="mt-3 text-xs">
              <p className="break-all text-neutral-500">
                Affected file: {manualReview.affectedFiles[0]}
              </p>
              <MetadataDiffTable diffs={manualReview.diffs} />
            </div>
          ) : null}
        </section>
        {message && <p className="mt-4 text-sm text-amber-200">{message}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3 text-sm font-semibold">
          <button type="button" onClick={onClose} className="px-3 py-2 text-neutral-400">
            Close
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() => rollbackMetadataFile(track.id), 'Restored the retained backup.')
            }
            className="px-3 py-2 text-neutral-300 underline"
          >
            Rollback file
          </button>
          <button
            type="button"
            disabled={!metadataLoaded || !manualReview || manualReview.diffs.length === 0 || busy}
            onClick={() =>
              void run(async () => {
                await saveMetadataDraft(track.id, patch);
                setDraftSaved(true);
              }, 'Saved to Bebop. The audio file was not changed.')
            }
            className="t-control border border-amber-500/50 px-3 py-2 text-amber-300 disabled:opacity-40"
          >
            Save to Bebop
          </button>
          <button
            type="button"
            disabled={!draftSaved || busy}
            onClick={() => {
              if (
                window.confirm(
                  'Write these tags to the audio file? Bebop will retain one full-file backup.',
                )
              )
                void run(() => writeMetadataToFile(track.id), 'Tags written and validated.');
            }}
            className="t-control bg-amber-500 px-3 py-2 text-black disabled:opacity-40"
          >
            Write tags to files
          </button>
        </div>
      </div>
    </div>
  );
}

function MetadataDiffTable({ diffs }: { diffs: MetadataReview['diffs'] }) {
  if (diffs.length === 0) {
    return <p className="mt-2 text-neutral-500">No field changes.</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto t-sm border border-neutral-800">
      <table className="w-full text-left text-xs">
        <thead className="bg-neutral-900 text-neutral-500">
          <tr>
            <th className="px-2 py-1">Field</th>
            <th className="px-2 py-1">Before</th>
            <th className="px-2 py-1">After</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={`${diff.trackId}:${diff.field}`} className="border-t border-neutral-800">
              <td className="px-2 py-1 text-neutral-300">{diff.field}</td>
              <td className="max-w-40 truncate px-2 py-1 text-neutral-500">{diff.before ?? '—'}</td>
              <td className="max-w-40 truncate px-2 py-1 text-amber-200">{diff.after ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
