import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AcquisitionJob,
  AcquisitionSearch,
  AcquisitionSettings,
  AcquisitionStatus,
  AppError,
  LibraryRoot,
} from '@/services/tauri-bindings';
import {
  cancelAcquisition,
  disconnectSlskd,
  enqueueSlskdFile,
  importAcquisition,
  listAcquisitionJobs,
  loadAcquisition,
  pauseAcquisition,
  refreshSlskdSearch,
  resumeAcquisition,
  saveAcquisitionSettings,
  searchSlskd,
  storeSlskdApiKey,
  subscribeAcquisitionProgress,
  testSlskd,
} from '@/services/acquisitionService';

const DEFAULT_SETTINGS: AcquisitionSettings = {
  serverUrl: 'http://127.0.0.1:5030',
  inboxPath: null,
  confirmedRemote: false,
  importMode: 'copy',
};

function message(error: unknown) {
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as AppError).message);
  }
  return 'The acquisition request failed.';
}

function bytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 ** 2) return `${(value / 1_024).toFixed(1)} KB`;
  if (value < 1_024 ** 3) return `${(value / 1_024 ** 2).toFixed(1)} MB`;
  return `${(value / 1_024 ** 3).toFixed(2)} GB`;
}

interface AcquisitionPanelProps {
  roots: LibraryRoot[];
}

export function AcquisitionPanel({ roots }: AcquisitionPanelProps) {
  const [settings, setSettings] = useState<AcquisitionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<AcquisitionStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<AcquisitionSearch | null>(null);
  const [jobs, setJobs] = useState<AcquisitionJob[]>([]);
  const [rootId, setRootId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergeJob = useCallback((job: AcquisitionJob) => {
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void Promise.all([loadAcquisition(), testSlskd()])
      .then(([loaded, nextStatus]) => {
        if (!active) return;
        setSettings(loaded.settings);
        setJobs(loaded.jobs);
        setStatus(nextStatus);
      })
      .catch(() => undefined);
    void subscribeAcquisitionProgress(mergeJob).then((cleanup) => {
      if (active) unlisten = cleanup;
      else cleanup();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [mergeJob]);

  useEffect(() => {
    if (!rootId) {
      setRootId(roots.find((root) => root.enabled && root.availability === 'online')?.id ?? '');
    }
  }, [rootId, roots]);

  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (nextError) {
      setError(message(nextError));
    } finally {
      setBusy(false);
    }
  }, []);

  const saveSettings = () =>
    run(async () => {
      const saved = await saveAcquisitionSettings(settings);
      setSettings(saved);
      setStatus(await testSlskd());
    });

  const updateJob = (operation: () => Promise<AcquisitionJob>) =>
    run(async () => mergeJob(await operation()));

  return (
    <section className="rounded border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-300">
      <h2 className="text-sm font-semibold text-white">Optional slskd acquisition</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Explicit searches only. slskd owns Soulseek networking and downloads; Bebop imports only
        completed, decodable files from your configured inbox.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="text-xs text-neutral-500">
          slskd server
          <input
            value={settings.serverUrl}
            onChange={(event) =>
              setSettings((current) => ({ ...current, serverUrl: event.target.value }))
            }
            className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-200"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Completed-download inbox
          <span className="mt-1 flex gap-2">
            <input
              value={settings.inboxPath ?? ''}
              readOnly
              placeholder="Choose slskd downloads folder"
              className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-200"
            />
            <button
              type="button"
              onClick={() =>
                void open({ directory: true, multiple: false }).then((path) => {
                  if (typeof path === 'string') {
                    setSettings((current) => ({ ...current, inboxPath: path }));
                  }
                })
              }
              className="rounded border border-neutral-700 px-3 py-2 text-neutral-200"
            >
              Choose
            </button>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={settings.confirmedRemote}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                confirmedRemote: event.target.checked,
              }))
            }
          />
          I confirm this non-loopback HTTPS server
        </label>
        <label className="text-xs text-neutral-500">
          Import behavior
          <select
            value={settings.importMode}
            onChange={(event) =>
              setSettings((current) => ({ ...current, importMode: event.target.value }))
            }
            className="ml-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
          >
            <option value="copy">Copy from inbox</option>
            <option value="move">Move from inbox</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSettings()}
          className="rounded border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-40"
        >
          Save and test
        </button>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="slskd API key (optional locally)"
          autoComplete="off"
          className="min-w-56 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"
        />
        <button
          type="button"
          disabled={busy || !apiKey.trim()}
          onClick={() => {
            const key = apiKey;
            setApiKey('');
            void run(async () => setStatus(await storeSlskdApiKey(key)));
          }}
          className="rounded border border-neutral-700 px-3 py-2 text-xs disabled:opacity-40"
        >
          Store in OS credentials
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(async () => setStatus(await disconnectSlskd()))}
          className="rounded border border-neutral-700 px-3 py-2 text-xs disabled:opacity-40"
        >
          Remove key
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {status?.connected
          ? `Connected${status.version ? ` · slskd ${status.version}` : ''}`
          : (status?.error?.message ?? 'Not tested')}
      </p>

      <div className="mt-5 border-t border-neutral-800 pt-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Artist, album, or track"
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={busy || query.trim().length < 2}
            onClick={() => void run(async () => setSearch(await searchSlskd(query)))}
            className="rounded border border-amber-500/50 px-4 py-2 text-xs font-semibold text-amber-300 disabled:opacity-40"
          >
            Search explicitly
          </button>
          {search && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => setSearch(await refreshSlskdSearch(search.id)))}
              className="rounded border border-neutral-700 px-3 py-2 text-xs disabled:opacity-40"
            >
              Refresh
            </button>
          )}
        </div>
        {search && (
          <div className="mt-3 max-h-80 space-y-3 overflow-auto pr-1">
            {search.groups.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No responses yet. Refresh while the search completes.
              </p>
            ) : (
              search.groups.map((group) => (
                <div key={group.sourceUser} className="rounded border border-neutral-800 p-3">
                  <p className="text-xs font-semibold text-white">
                    {group.sourceUser} · {group.freeUploadSlot ? 'free slot' : 'queued'}
                  </p>
                  <div className="mt-2 space-y-1">
                    {group.files.slice(0, 25).map((file) => (
                      <div
                        key={`${file.filename}-${file.size}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-neutral-300">
                          {file.filename} · {bytes(file.size)}
                        </span>
                        <button
                          type="button"
                          disabled={busy || file.isLocked}
                          onClick={() =>
                            void updateJob(() =>
                              enqueueSlskdFile(search.id, group.sourceUser, file),
                            )
                          }
                          className="shrink-0 text-amber-300 underline disabled:opacity-40"
                        >
                          {file.isLocked ? 'Locked' : 'Queue'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-neutral-800 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Acquisition jobs
          </h3>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => setJobs(await listAcquisitionJobs()))}
            className="text-xs text-neutral-300 underline disabled:opacity-40"
          >
            Refresh jobs
          </button>
        </div>
        <label className="mt-2 block text-xs text-neutral-500">
          Import into
          <select
            value={rootId}
            onChange={(event) => setRootId(event.target.value)}
            className="ml-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
          >
            <option value="">Choose a root</option>
            {roots
              .filter((root) => root.enabled && root.availability === 'online')
              .map((root) => (
                <option key={root.id} value={root.id}>
                  {root.label}
                </option>
              ))}
          </select>
        </label>
        <div className="mt-3 space-y-2">
          {jobs.length === 0 ? (
            <p className="text-xs text-neutral-500">No acquisition jobs.</p>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="rounded border border-neutral-800 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">
                    {job.sourceUser ?? 'slskd'} · {job.status}
                  </span>
                  <span className="font-mono text-neutral-400">
                    {Math.round((job.progress ?? 0) * 100)}%
                  </span>
                </div>
                {job.error && <p className="mt-1 text-red-300">{job.error.message}</p>}
                {job.targetPath && (
                  <p className="mt-1 truncate font-mono text-neutral-500">{job.targetPath}</p>
                )}
                <div className="mt-2 flex gap-3 text-amber-300">
                  {job.status === 'downloading' && (
                    <button
                      type="button"
                      onClick={() => void updateJob(() => pauseAcquisition(job.id))}
                      className="underline"
                    >
                      Pause
                    </button>
                  )}
                  {(job.status === 'paused' || job.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => void updateJob(() => resumeAcquisition(job.id))}
                      className="underline"
                    >
                      Resume
                    </button>
                  )}
                  {['queued', 'downloading', 'paused'].includes(job.status) && (
                    <button
                      type="button"
                      onClick={() => void updateJob(() => cancelAcquisition(job.id))}
                      className="underline"
                    >
                      Cancel
                    </button>
                  )}
                  {job.status === 'verifying' && (
                    <button
                      type="button"
                      disabled={!rootId}
                      onClick={() => void updateJob(() => importAcquisition(job.id, rootId))}
                      className="underline disabled:opacity-40"
                    >
                      Verify and import
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded border border-red-900/60 p-2 text-xs text-red-300">{error}</p>
      )}
    </section>
  );
}
