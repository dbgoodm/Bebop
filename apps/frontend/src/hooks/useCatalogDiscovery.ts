import { useEffect, useState } from 'react';
import { loadDiscovery, type CatalogDiscovery } from '@/services/catalogService';

const emptyDiscovery: CatalogDiscovery = { artists: [], albums: [], genres: [] };

export function useCatalogDiscovery(search: string) {
  const [discovery, setDiscovery] = useState(emptyDiscovery);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadDiscovery(search).then((result) => {
        if (active) setDiscovery(result);
      });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return discovery;
}
