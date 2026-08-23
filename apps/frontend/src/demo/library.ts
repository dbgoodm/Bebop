import { RecentlyAddedItem, RediscoverItem, AudioFormat } from '../types';
import { isDemoMode } from './mode';

/**
 * Local Library Data Store
 * All metrics, recent additions, and rediscover items are derived from local metadata
 * (e.g. filesystem watcher scan timestamps, ID3 tag cache, local playback count registry).
 */

export const DEMO_RECENTLY_ADDED: RecentlyAddedItem[] = [
  {
    id: 'ra-1',
    title: "Somethin' Else",
    artist: 'Cannonball Adderley & Miles Davis',
    coverUrl:
      'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80',
    format: 'DSD256',
    dateAddedText: 'Added today',
    addedTimestamp: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
    trackCount: 6,
    genre: 'Hard Bop',
    year: 1958,
    fileSizeMb: 1420,
  },
  {
    id: 'ra-2',
    title: "Moanin'",
    artist: 'Art Blakey & The Jazz Messengers',
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    format: 'FLAC 24/192',
    dateAddedText: 'Added yesterday',
    addedTimestamp: Date.now() - 1000 * 60 * 60 * 24,
    trackCount: 8,
    genre: 'Hard Bop',
    year: 1959,
    fileSizeMb: 940,
  },
  {
    id: 'ra-3',
    title: 'Seatbelts - Ask DNA (EP)',
    artist: 'The Seatbelts',
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    format: 'FLAC 24/96',
    dateAddedText: 'Added 3 days ago',
    addedTimestamp: Date.now() - 1000 * 60 * 60 * 72,
    trackCount: 5,
    genre: 'Anime / Jazz Rock',
    year: 2001,
    fileSizeMb: 420,
  },
  {
    id: 'ra-4',
    title: 'A Love Supreme (Deluxe)',
    artist: 'John Coltrane',
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    format: 'DSD256',
    dateAddedText: 'Added 5 days ago',
    addedTimestamp: Date.now() - 1000 * 60 * 60 * 120,
    trackCount: 10,
    genre: 'Avant-Garde Jazz',
    year: 1965,
    fileSizeMb: 1850,
  },
  {
    id: 'ra-5',
    title: 'Head Hunters',
    artist: 'Herbie Hancock',
    coverUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    format: 'FLAC 24/96',
    dateAddedText: 'Added 1 week ago',
    addedTimestamp: Date.now() - 1000 * 60 * 60 * 168,
    trackCount: 4,
    genre: 'Jazz-Funk',
    year: 1973,
    fileSizeMb: 610,
  },
  {
    id: 'ra-6',
    title: 'Time Out',
    artist: 'The Dave Brubeck Quartet',
    coverUrl:
      'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&auto=format&fit=crop&q=80',
    format: 'FLAC 16/44.1',
    dateAddedText: 'Added 2 weeks ago',
    addedTimestamp: Date.now() - 1000 * 60 * 60 * 336,
    trackCount: 7,
    genre: 'Cool Jazz',
    year: 1959,
    fileSizeMb: 320,
  },
];

export const DEMO_REDISCOVER_ITEMS: RediscoverItem[] = [
  {
    id: 'rd-1',
    type: 'album',
    title: 'Mingus Ah Um',
    subtitle: 'Charles Mingus • 1959',
    coverUrl:
      'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80',
    lastPlayedText: 'Unplayed for 7 months',
    lastPlayedTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 210,
    totalPlayCount: 64,
    highlightReason: 'Your #1 played album in 2024 (64 plays)',
    trackCount: 9,
    format: 'FLAC 24/96',
  },
  {
    id: 'rd-2',
    type: 'playlist',
    title: 'Rainy Night Hard Bop Session',
    subtitle: 'Local Smart Playlist • 24 Tracks',
    coverUrl:
      'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&auto=format&fit=crop&q=80',
    lastPlayedText: 'Last heard 5 months ago',
    lastPlayedTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 150,
    totalPlayCount: 38,
    highlightReason: 'High completion rate (94% finish)',
    trackCount: 24,
  },
  {
    id: 'rd-3',
    type: 'artist',
    title: 'Thelonious Monk',
    subtitle: '6 Albums • 48 Tracks in Local Library',
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    lastPlayedText: 'Unplayed for 1 year',
    lastPlayedTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 365,
    totalPlayCount: 112,
    highlightReason: 'Top 5 all-time artist in your local library',
    trackCount: 48,
  },
  {
    id: 'rd-4',
    type: 'album',
    title: 'Chet Baker Sings',
    subtitle: 'Chet Baker • 1954 (Mono Remaster)',
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    lastPlayedText: 'Last heard 9 months ago',
    lastPlayedTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 270,
    totalPlayCount: 41,
    highlightReason: 'Forgotten favorite with 5★ local rating',
    trackCount: 14,
    format: 'DSD256',
  },
  {
    id: 'rd-5',
    type: 'playlist',
    title: 'Acid Jazz & Shibuya-kei Groove',
    subtitle: 'Auto-grouped by local BPM & Key',
    coverUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    lastPlayedText: 'Unplayed for 6 months',
    lastPlayedTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 180,
    totalPlayCount: 29,
    highlightReason: 'Zero skips recorded on first 10 tracks',
    trackCount: 19,
  },
];

export const LOCAL_RECENTLY_ADDED: RecentlyAddedItem[] = isDemoMode ? DEMO_RECENTLY_ADDED : [];
export const LOCAL_REDISCOVER_ITEMS: RediscoverItem[] = isDemoMode ? DEMO_REDISCOVER_ITEMS : [];
