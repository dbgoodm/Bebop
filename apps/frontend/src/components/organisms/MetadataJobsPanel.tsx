import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppError, MetadataJob } from '@/services/tauri-bindings';
import { describeError } from '@/services/libraryService';
import {
  cancelMetadataJob,
  configureAcoustIdClientKey,
  getAcoustIdConfigured,
  getMusicBrainzEnabled,
  listMetadataJobs,
  pauseMetadataJob,
  resumeMetadataJob,
  setMusicBrainzEnabled,
  startMetadataJob,
} from '@/services/metadataService';

export function MetadataJobsPanel() {
  const [jobs, setJobs] = useState<MetadataJob[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [acoustIdConfigured, setAcoustIdConfigured] = useState(false);
  const [clientKey, setClientKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [musicBrainz, acoustId, currentJobs] = await Promise.all([
      getMusicBrainzEnabled(),
      getAcoustIdConfigured(),
      listMetadataJobs(),
    ]);
    setEnabled(musicBrainz);
    setAcoustIdConfigured(acoustId);
    setJobs(currentJobs);
  }, []);

  useEffect(() => {
    let active = true;
    void refresh().catch(() => undefined);
    let stop: (() => void) | undefined;
    void listen<MetadataJob>('metadata://job-progress', ({ payload }) => {
      if (!active) return;
      setJobs((current) => [payload, ...current.filter((job) => job.id !== payload.id)]);
    })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop?.();
    };
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (cause) {
      setMessage(describeError(cause as AppError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="metadata-tools-heading"
      className="t-sm border border-neutral-800 bg-neutral-950/50 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="metadata-tools-heading" className="text-sm font-semibold text-white">
            Metadata tools
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-neutral-500">
            Fingerprint and enrich the library in a resumable background job. Exact unique matches
            are backed up, written, reread, and audio-verified; ambiguous matches wait for review.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          disabled={busy}
          onClick={() =>
            void run(
              async () => {
                const next = !enabled;
                await setMusicBrainzEnabled(next);
                setEnabled(next);
              },
              enabled ? 'MusicBrainz disabled.' : 'MusicBrainz enabled.',
            )
          }
          className="t-control border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-200 disabled:opacity-40"
        >
          MusicBrainz {enabled ? 'on' : 'off'}
        </button>
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        MusicBrainz needs no account or key. An{' '}
        <a
          href="https://acoustid.org/new-application"
          target="_blank"
          rel="noreferrer"
          className="text-amber-400/90 underline hover:text-amber-300"
        >
          AcoustID client key
        </a>{' '}
        is free and only required to identify untagged files by their audio fingerprint.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="password"
          aria-label="Library AcoustID client key"
          value={clientKey}
          onChange={(event) => setClientKey(event.target.value)}
          placeholder={acoustIdConfigured ? 'AcoustID key configured' : 'AcoustID client key'}
          className="min-w-56 flex-1 t-sm border border-neutral-700 bg-black/30 px-3 py-2 text-xs text-white"
        />
        <button
          type="button"
          disabled={busy || clientKey.trim() === ''}
          onClick={() =>
            void run(async () => {
              setAcoustIdConfigured(await configureAcoustIdClientKey(clientKey));
              setClientKey('');
            }, 'AcoustID client key saved securely.')
          }
          className="t-control border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-40"
        >
          Save key
        </button>
        <button
          type="button"
          disabled={busy || !enabled}
          onClick={() =>
            void run(() => startMetadataJob('library'), 'Library metadata job started.')
          }
          className="t-control border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-40"
        >
          Enrich library
        </button>
      </div>

      {message ? <p className="mt-3 text-xs text-amber-200">{message}</p> : null}
      {jobs.length ? (
        <div className="mt-4 space-y-2">
          {jobs.map((job) => {
            const percent = job.totalTracks
              ? Math.round((job.processedTracks / job.totalTracks) * 100)
              : 0;
            return (
              <article key={job.id} className="t-sm border border-neutral-800 bg-black/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-white">
                      {job.scope} · {job.status}
                    </p>
                    <p className="mt-1 text-neutral-500">
                      {job.processedTracks}/{job.totalTracks} · {percent}% · {job.reviewTracks}{' '}
                      review · {job.autoWrittenTracks} written · {job.failedTracks} failed
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 font-semibold">
                    {job.status === 'running' || job.status === 'queued' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => pauseMetadataJob(job.id), 'Job paused.')}
                        className="text-neutral-300 underline"
                      >
                        Pause
                      </button>
                    ) : null}
                    {job.status === 'paused' ||
                    job.status === 'review' ||
                    job.status === 'error' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => resumeMetadataJob(job.id, job.status === 'error'),
                            job.status === 'error'
                              ? 'Failed tracks queued for retry.'
                              : 'Job resumed.',
                          )
                        }
                        className="text-amber-300 underline"
                      >
                        {job.status === 'error' ? 'Retry failed' : 'Resume'}
                      </button>
                    ) : null}
                    {job.status !== 'complete' && job.status !== 'cancelled' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => cancelMetadataJob(job.id), 'Job cancelled.')}
                        className="text-red-300 underline"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden t-sm bg-neutral-800">
                  <div className="h-full bg-amber-400" style={{ width: `${percent}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-neutral-500">No metadata jobs have run yet.</p>
      )}
    </section>
  );
}
