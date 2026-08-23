import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppError, ScanProgress } from '@/services/tauri-bindings';
import {
  chooseLibraryFolder,
  errorSnapshot,
  initialLibraryScan,
  loadLibraryCatalog,
  removeLibraryRoot,
  rescanLibraryRoot,
  scanLibrary,
  setLibraryRootEnabled,
  toLibrarySnapshot,
} from '@/services/libraryService';

export function useLibraryScan() {
  const [library, setLibrary] = useState(initialLibraryScan);

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenChanged: (() => void) | undefined;
    let active = true;
    const reload = async () => {
      try {
        const catalog = await loadLibraryCatalog();
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
    void listen('library://changed', () => void reload()).then((dispose) => {
      unlistenChanged = dispose;
    });
    return () => {
      active = false;
      unlistenProgress?.();
      unlistenChanged?.();
    };
  }, []);

  const selectAndScan = useCallback(async () => {
    try {
      const root = await chooseLibraryFolder();
      if (!root) return;
      setLibrary({ ...initialLibraryScan, phase: 'scanning', root });
      const scan = await scanLibrary(root);
      const catalog = await loadLibraryCatalog();
      setLibrary((current) => ({
        ...catalog,
        warnings: [...toLibrarySnapshot(scan, current.progress).warnings, ...catalog.warnings],
        progress: current.progress,
      }));
    } catch (cause) {
      setLibrary(errorSnapshot(cause as AppError));
    }
  }, []);

  const setRootEnabled = useCallback(async (rootId: string, enabled: boolean) => {
    await setLibraryRootEnabled(rootId, enabled);
    setLibrary(await loadLibraryCatalog());
  }, []);

  const rescanRoot = useCallback(async (rootId: string) => {
    setLibrary((current) => ({ ...current, phase: 'scanning' }));
    await rescanLibraryRoot(rootId);
    setLibrary(await loadLibraryCatalog());
  }, []);

  const removeRoot = useCallback(async (rootId: string) => {
    await removeLibraryRoot(rootId);
    setLibrary(await loadLibraryCatalog());
  }, []);

  return { library, selectAndScan, setRootEnabled, rescanRoot, removeRoot };
}
