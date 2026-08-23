import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppError, ScanProgress } from '@/services/tauri-bindings';
import {
  chooseLibraryFolder,
  errorSnapshot,
  initialLibraryScan,
  scanLibrary,
  toLibrarySnapshot,
} from '@/services/libraryService';

export function useLibraryScan() {
  const [library, setLibrary] = useState(initialLibraryScan);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<ScanProgress>('library://scan-progress', ({ payload }) => {
      setLibrary((current) => ({ ...current, progress: payload }));
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, []);

  const selectAndScan = useCallback(async () => {
    try {
      const root = await chooseLibraryFolder();
      if (!root) return;
      setLibrary({ ...initialLibraryScan, phase: 'scanning', root });
      const scan = await scanLibrary(root);
      setLibrary((current) => toLibrarySnapshot(scan, current.progress));
    } catch (cause) {
      setLibrary(errorSnapshot(cause as AppError));
    }
  }, []);

  return { library, selectAndScan };
}
