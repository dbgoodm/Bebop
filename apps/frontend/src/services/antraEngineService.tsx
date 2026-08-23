import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AntraQueueItem, ArtistDiscographyAlbum, AntraIngestStatus } from '../types';

interface AntraEngineContextType {
  queue: AntraQueueItem[];
  ingestedAlbumIds: string[];
  activeDownloadsCount: number;
  totalSpeed: string;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  queueAlbum: (album: ArtistDiscographyAlbum, artistName: string) => void;
  queueAllMissingAlbums: (albums: ArtistDiscographyAlbum[], artistName: string) => void;
  pauseQueueItem: (id: string) => void;
  resumeQueueItem: (id: string) => void;
  cancelQueueItem: (id: string) => void;
  clearCompleted: () => void;
  getAlbumQueueStatus: (albumId: string) => AntraQueueItem | undefined;
  isAlbumIngested: (albumId: string) => boolean;
}

const AntraEngineContext = createContext<AntraEngineContextType | undefined>(undefined);

const STORAGE_KEY_INGESTED = 'antra_ingested_albums_v1';

export const AntraEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<AntraQueueItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [ingestedAlbumIds, setIngestedAlbumIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_INGESTED);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save ingested albums to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_INGESTED, JSON.stringify(ingestedAlbumIds));
    } catch {
      // ignore
    }
  }, [ingestedAlbumIds]);

  // Queue a single album
  const queueAlbum = useCallback((album: ArtistDiscographyAlbum, artistName: string) => {
    setQueue((prev) => {
      // Check if already in queue
      if (prev.some((item) => item.albumId === album.id)) {
        return prev;
      }

      const newItem: AntraQueueItem = {
        id: `antra-q-${album.id}-${Date.now()}`,
        albumId: album.id,
        albumTitle: album.title,
        artistName: artistName,
        coverUrl: album.coverUrl,
        formatBadge: album.formatBadge || 'FLAC 24/192',
        fileSize: album.fileSize || '1.24 GB',
        trackCount: album.trackCount || 10,
        year: album.year,
        status: 'queued',
        progress: 0,
        downloadSpeed: '0 MB/s',
        bytesDownloaded: '0 MB',
        estimatedTime: 'Calculating...',
        addedAt: Date.now(),
      };

      return [...prev, newItem];
    });
  }, []);

  // Queue all missing albums for an artist
  const queueAllMissingAlbums = useCallback(
    (albums: ArtistDiscographyAlbum[], artistName: string) => {
      const uningested = albums.filter((a) => !a.isLocal && !ingestedAlbumIds.includes(a.id));

      uningested.forEach((alb) => {
        queueAlbum(alb, artistName);
      });
    },
    [ingestedAlbumIds, queueAlbum],
  );

  const pauseQueueItem = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'paused', downloadSpeed: '0 MB/s' } : item,
      ),
    );
  }, []);

  const resumeQueueItem = useCallback((id: string) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'queued' } : item)));
  }, []);

  const cancelQueueItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== 'completed'));
  }, []);

  const getAlbumQueueStatus = useCallback(
    (albumId: string) => {
      return queue.find((item) => item.albumId === albumId);
    },
    [queue],
  );

  const isAlbumIngested = useCallback(
    (albumId: string) => {
      return ingestedAlbumIds.includes(albumId);
    },
    [ingestedAlbumIds],
  );

  // Background download processor simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setQueue((prev) => {
        if (prev.length === 0) return prev;

        // Find current actively downloading item or first queued item
        let activeIndex = prev.findIndex(
          (item) => item.status === 'downloading' || item.status === 'verifying',
        );

        if (activeIndex === -1) {
          activeIndex = prev.findIndex((item) => item.status === 'queued');
          if (activeIndex !== -1) {
            // Start downloading this item
            const updated = [...prev];
            updated[activeIndex] = {
              ...updated[activeIndex],
              status: 'downloading',
              downloadSpeed: `${(65 + Math.random() * 35).toFixed(1)} MB/s`,
            };
            return updated;
          }
          return prev;
        }

        const activeItem = prev[activeIndex];
        if (activeItem.status === 'paused' || activeItem.status === 'completed') {
          return prev;
        }

        const nextProgress = Math.min(100, activeItem.progress + (4 + Math.random() * 6));
        const totalMb =
          parseFloat(activeItem.fileSize) * (activeItem.fileSize.includes('GB') ? 1024 : 1);
        const downloadedMb = (totalMb * (nextProgress / 100)).toFixed(0);
        const currentSpeed = (78 + Math.random() * 24).toFixed(1);
        const remainingMb = totalMb - parseFloat(downloadedMb);
        const secondsRemaining = Math.max(1, Math.round(remainingMb / parseFloat(currentSpeed)));

        const updated = [...prev];

        if (nextProgress >= 100) {
          if (activeItem.status === 'downloading') {
            // Move to verifying state for 1 tick
            updated[activeIndex] = {
              ...activeItem,
              progress: 100,
              status: 'verifying',
              downloadSpeed: 'Checking CRC32...',
              bytesDownloaded: `${activeItem.fileSize} / ${activeItem.fileSize}`,
              estimatedTime: 'Verifying FLAC integrity',
            };
          } else if (activeItem.status === 'verifying') {
            // Completed! Ingest to local
            updated[activeIndex] = {
              ...activeItem,
              status: 'completed',
              progress: 100,
              downloadSpeed: 'Ingested',
              bytesDownloaded: `${activeItem.fileSize} / ${activeItem.fileSize}`,
              estimatedTime: 'Complete',
              completedAt: Date.now(),
            };

            // Add to ingestedAlbumIds
            setIngestedAlbumIds((old) => {
              if (!old.includes(activeItem.albumId)) {
                return [...old, activeItem.albumId];
              }
              return old;
            });
          }
        } else {
          updated[activeIndex] = {
            ...activeItem,
            progress: parseFloat(nextProgress.toFixed(1)),
            status: 'downloading',
            downloadSpeed: `${currentSpeed} MB/s`,
            bytesDownloaded: `${downloadedMb} MB / ${activeItem.fileSize}`,
            estimatedTime: `${secondsRemaining}s left`,
          };
        }

        return updated;
      });
    }, 600);

    return () => clearInterval(interval);
  }, []);

  const activeDownloads = queue.filter(
    (item) =>
      item.status === 'downloading' || item.status === 'verifying' || item.status === 'queued',
  );
  const activeDownloadsCount = activeDownloads.length;

  const currentDownloading = queue.find((item) => item.status === 'downloading');
  const totalSpeed = currentDownloading ? currentDownloading.downloadSpeed : '0.0 MB/s';

  return (
    <AntraEngineContext.Provider
      value={{
        queue,
        ingestedAlbumIds,
        activeDownloadsCount,
        totalSpeed,
        isDrawerOpen,
        setIsDrawerOpen,
        queueAlbum,
        queueAllMissingAlbums,
        pauseQueueItem,
        resumeQueueItem,
        cancelQueueItem,
        clearCompleted,
        getAlbumQueueStatus,
        isAlbumIngested,
      }}
    >
      {children}
    </AntraEngineContext.Provider>
  );
};

export const useAntraEngine = () => {
  const context = useContext(AntraEngineContext);
  if (!context) {
    throw new Error('useAntraEngine must be used within an AntraEngineProvider');
  }
  return context;
};
