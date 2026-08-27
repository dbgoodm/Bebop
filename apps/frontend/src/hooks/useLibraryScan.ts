import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppError, LibraryChanged, ScanProgress } from '@/services/tauri-bindings';
import {
  chooseLibraryFolder,
  errorSnapshot,
  initialLibraryScan,
  loadLibraryDelta,
  loadLibraryCatalog,
  removeLibraryRoot,
  rescanLibraryRoot,
  scanLibrary,
  setLibraryRootEnabled,
  toLibrarySnapshot,
  toTrackItem,
} from '@/services/libraryService';
import { syncLibraryDiscographies } from '@/services/catalogService';

/**
 * Kick off the library-wide MusicBrainz discography sync after a scan.
 *
 * Failures here must never surface as scan failures: the sync is best-effort
 * background enrichment, and it is rejected outright when one is already running
 * or MusicBrainz is disabled.
 */
async function startDiscographySync() {
  try {
    await syncLibraryDiscographies();
  } catch (cause) {
    console.warn('Discography sync unavailable:', cause);
  }
}

export function useLibraryScan(search = '') {
  const [library, setLibrary] = useState(initialLibraryScan);

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenChanged: (() => void) | undefined;
    let active = true;
    const reload = async () => {
      try {
        const catalog = await loadLibraryCatalog(search);
        if (active) setLibrary(catalog);
      } catch (cause) {
        if (active) setLibrary(errorSnapshot(cause as AppError));
      }
    };
    void reload();
    void listen<ScanProgress>('library://scan-progress', ({ payload }) => {
      setLibrary((current) => ({ ...current, progress: payload }));
    }).then((dispose) => {
      unlistenProgress = dispose;
    });
    void listen<LibraryChanged>('library://changed', ({ payload }) => {
      if (payload.trackIds.length === 0 || payload.trackIds.length > 100) {
        void reload();
        return;
      }
      void loadLibraryDelta(payload.trackIds)
        .then(({ roots, tracks }) => {
          if (!active) return;
          const changed = new Map(tracks.map((track) => [track.id, track]));
          setLibrary((current) => {
            const retained = current.tracks.filter((track) => {
              const update = changed.get(track.id);
              return !update || update.available;
            });
            const retainedIds = new Set(retained.map((track) => track.id));
            const updated = retained.map((track, index) => {
              const replacement = changed.get(track.id);
              return replacement ? toTrackItem(replacement, index) : track;
            });
            for (const track of tracks) {
              if (track.available && !retainedIds.has(track.id)) {
                updated.push(toTrackItem(track, updated.length));
              }
            }
            updated.sort((left, right) => left.title.localeCompare(right.title));
            return {
              ...current,
              roots,
              tracks: updated,
              totalTracks: roots.reduce((total, root) => total + root.trackCount, 0),
            };
          });
        })
        .catch(() => void reload());
    }).then((dispose) => {
      unlistenChanged = dispose;
    });
    return () => {
      active = false;
      unlistenProgress?.();
      unlistenChanged?.();
    };
  }, [search]);

  const selectAndScan = useCallback(async () => {
    try {
      const root = await chooseLibraryFolder();
      if (!root) return;
      setLibrary({ ...initialLibraryScan, phase: 'scanning', root });
      const scan = await scanLibrary(root);
      const catalog = await loadLibraryCatalog(search);
      setLibrary((current) => ({
        ...catalog,
        warnings: [...toLibrarySnapshot(scan, current.progress).warnings, ...catalog.warnings],
        progress: current.progress,
      }));
      void startDiscographySync();
    } catch (cause) {
      setLibrary(errorSnapshot(cause as AppError));
    }
  }, [search]);

  const setRootEnabled = useCallback(
    async (rootId: string, enabled: boolean) => {
      await setLibraryRootEnabled(rootId, enabled);
      setLibrary(await loadLibraryCatalog(search));
    },
    [search],
  );

  const rescanRoot = useCallback(
    async (rootId: string) => {
      setLibrary((current) => ({ ...current, phase: 'scanning' }));
      await rescanLibraryRoot(rootId);
      setLibrary(await loadLibraryCatalog(search));
      void startDiscographySync();
    },
    [search],
  );

  const removeRoot = useCallback(
    async (rootId: string) => {
      await removeLibraryRoot(rootId);
      setLibrary(await loadLibraryCatalog(search));
    },
    [search],
  );

  return { library, selectAndScan, setRootEnabled, rescanRoot, removeRoot };
}
