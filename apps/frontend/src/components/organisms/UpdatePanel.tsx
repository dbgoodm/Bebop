import { useEffect, useState } from 'react';
import type { AppError, UpdateProgress, UpdateStatus } from '@/services/tauri-bindings';
import {
  checkForUpdates,
  installUpdate,
  subscribeUpdateProgress,
  subscribeUpdateStatus,
} from '@/services/updateService';

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as AppError).message);
  }
  return 'The secure update request failed.';
}

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];
    void Promise.all([
      subscribeUpdateStatus((next) => setStatus(next)),
      subscribeUpdateProgress((next) => setProgress(next)),
    ]).then((nextCleanups) => {
      if (active) cleanups.push(...nextCleanups);
      else nextCleanups.forEach((cleanup) => cleanup());
    });
    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await checkForUpdates());
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    if (!status?.version) return;
    const confirmed = window.confirm(
      `Download, verify, and install Bebop ${status.version}? Playback will stop only when installation begins.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await installUpdate();
    } catch (nextError) {
      setError(errorMessage(nextError));
      setBusy(false);
    }
  };

  return (
    <section className="t-sm border border-neutral-800 bg-neutral-950/50 p-5 text-sm text-neutral-300">
      <h2 className="text-sm font-semibold text-white">Signed application updates</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Bebop checks the stable channel at most once daily. Downloads require confirmation and a
        valid release signature.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void check()}
          className="t-control border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-200 disabled:opacity-40"
        >
          Check for updates
        </button>
        {status?.available && status.version && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void install()}
            className="t-control border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-40"
          >
            Install {status.version}
          </button>
        )}
        <span className="text-xs text-neutral-500">
          {status?.error?.message ??
            (status?.checked
              ? status.available
                ? `Bebop ${status.version} is available.`
                : `Bebop ${status.currentVersion} is current.`
              : 'Stable channel')}
        </span>
      </div>
      {status?.notes && <p className="mt-3 whitespace-pre-line text-xs">{status.notes}</p>}
      {progress && busy && (
        <p className="mt-3 font-mono text-xs text-neutral-400">
          {progress.finished
            ? 'Signature verified. Installing…'
            : `${(progress.downloadedBytes / 1_048_576).toFixed(1)} MB downloaded${
                progress.totalBytes ? ` of ${(progress.totalBytes / 1_048_576).toFixed(1)} MB` : ''
              }`}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}
