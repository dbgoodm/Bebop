import { useEffect, useState } from 'react';
import type { TrackItem } from '@/types';
import type { AppError, EnrichmentCandidate, EnrichmentJob } from '@/services/tauri-bindings';
import {
  applyMusicBrainzCandidate,
  getMusicBrainzEnabled,
  loadTrackMetadata,
  patchFromTrack,
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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getMusicBrainzEnabled(), loadTrackMetadata(track.id)])
      .then(([enabled, metadata]) => {
        if (!cancelled) {
          setMusicBrainzEnabledState(enabled);
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
    field: 'title' | 'album' | 'date' | 'composer' | 'label' | 'catalogNumber' | 'isrc',
    value: string,
  ) => setPatch((current) => ({ ...current, [field]: value }));

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

  const reviewCandidate = (candidate: EnrichmentCandidate) =>
    run(async () => {
      const saved = await applyMusicBrainzCandidate(track.id, candidate);
      setPatch(saved);
      setDraftSaved(true);
    }, 'Applied the reviewed match to Bebop. The audio file was not changed.');

  const updateNumber = (
    field: 'trackNumber' | 'trackTotal' | 'discNumber' | 'discTotal' | 'year',
    value: string,
  ) =>
    setPatch((current) => ({
      ...current,
      [field]: value === '' ? null : Number(value),
    }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-editor-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 p-6"
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
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Artists (comma separated)
            <input
              value={patch.artists?.join(', ') ?? ''}
              onChange={(event) =>
                setPatch((current) => ({
                  ...current,
                  artists: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Album
            <input
              value={patch.album ?? ''}
              onChange={(event) => update('album', event.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Album artists (comma separated)
            <input
              value={patch.albumArtists?.join(', ') ?? ''}
              onChange={(event) =>
                setPatch((current) => ({
                  ...current,
                  albumArtists: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Genres (comma separated)
            <input
              value={patch.genres?.join(', ') ?? ''}
              onChange={(event) =>
                setPatch((current) => ({
                  ...current,
                  genres: splitValues(event.target.value),
                }))
              }
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
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
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white"
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
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ))}
          </div>
        </div>
        <section className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
              className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-200 disabled:opacity-40"
            >
              {musicBrainzEnabled ? 'Enabled' : 'Enable'}
            </button>
          </div>
          {musicBrainzEnabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const job = await runMusicBrainzEnrichment(track.id);
                  setEnrichment(job);
                  if (job.autoApplied) {
                    setDraftSaved(true);
                  }
                }, 'MusicBrainz lookup complete.')
              }
              className="mt-3 rounded border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-40"
            >
              Search MusicBrainz
            </button>
          ) : null}
          {enrichment ? (
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {enrichment.candidates.length === 0 ? (
                <p className="text-xs text-neutral-500">No candidates found.</p>
              ) : (
                enrichment.candidates.map((candidate) => (
                  <div
                    key={`${candidate.recordingId}:${candidate.releaseId ?? ''}`}
                    className="flex items-center justify-between gap-3 rounded border border-neutral-800 p-2 text-xs"
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
                        onClick={() => void reviewCandidate(candidate)}
                        className="shrink-0 text-amber-300 underline disabled:opacity-40"
                      >
                        Review &amp; apply
                      </button>
                    ) : (
                      <span className="shrink-0 text-emerald-400">Exact match</span>
                    )}
                  </div>
                ))
              )}
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
            disabled={!metadataLoaded || busy}
            onClick={() =>
              void run(async () => {
                await saveMetadataDraft(track.id, patch);
                setDraftSaved(true);
              }, 'Saved to Bebop. The audio file was not changed.')
            }
            className="rounded border border-amber-500/50 px-3 py-2 text-amber-300 disabled:opacity-40"
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
            className="rounded bg-amber-500 px-3 py-2 text-black disabled:opacity-40"
          >
            Write tags to files
          </button>
        </div>
      </div>
    </div>
  );
}

function splitValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
