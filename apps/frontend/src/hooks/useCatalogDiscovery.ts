import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { loadDiscovery, type CatalogDiscovery } from '@/services/catalogService';

const emptyDiscovery: CatalogDiscovery = { artists: [], albums: [], genres: [] };

export function useCatalogDiscovery(search: string) {
  const [discovery, setDiscovery] = useState(emptyDiscovery);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    const refresh = () =>
      loadDiscovery(search).then((result) => {
        if (active) setDiscovery(result);
      });
    const timer = window.setTimeout(() => {
      void refresh();
    }, 150);
    void listen('library://changed', () => void refresh()).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, [search]);

  return discovery;
}
