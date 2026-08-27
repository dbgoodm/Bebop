import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  loadArtistPage,
  loadDiscovery,
  type ArtistCatalogPage,
  type CatalogDiscovery,
} from '@/services/catalogService';
import { markPerformance, measurePerformance } from '@/services/performance';

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

const emptyArtistPage: ArtistCatalogPage = { items: [], nextCursor: null, pageSize: 72 };

export function useArtistCatalog(search: string) {
  const [page, setPage] = useState(emptyArtistPage);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    markPerformance('artist-navigation-start');
    try {
      const next = await loadArtistPage(search);
      if (id === requestId.current) {
        setPage(next);
        markPerformance('artist-first-visible');
        measurePerformance('artist-first-visible', 'artist-navigation-start', 'artist-first-visible');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loading || !page.nextCursor) return;
    const id = requestId.current;
    setLoading(true);
    try {
      const next = await loadArtistPage(search, page.nextCursor);
      if (id === requestId.current) {
        setPage((current) => ({ ...next, items: [...current.items, ...next.items] }));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [loading, page.nextCursor, search]);

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    void listen('library://changed', () => void refresh()).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      requestId.current += 1;
      unlisten?.();
    };
  }, [refresh]);

  return { ...page, loading, refresh, loadMore };
}
