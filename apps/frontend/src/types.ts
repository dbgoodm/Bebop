export type NavTab = 'HOME' | 'LIBRARY' | 'DISCOVER' | 'SETTINGS';

export interface TopNavRailProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onMailClick?: () => void;
  unreadCount?: number;
  onImportAudioFile?: (file: File) => void;
  audioStatusLabel?: string;
  showPrototypeActions?: boolean;
}

export interface MetricCardData {
  id: string;
  label: string;
  value: string;
  subtext: string;
  accentColor?: 'yellow' | 'blue' | 'green' | 'red';
  subtextAccent?: boolean;
}

export interface ListeningStatsData {
  timeListened: string;
  timeListenedGrowth: string;
  totalTracks: string;
  verifiedLocal: string;
  totalArtists: string;
  artistsCachedStatus: string;
  totalAlbums: string;
  albumsMastering: string;
  libraryDuration: string;
  libraryDurationSub: string;
  mostListenedArtist: string;
  artistLosslessHours: string;
  topGenre: string;
  topGenrePercentage: string;
  favoriteEra: string;
  dynamicRange: string;
  libraryDiskSize: string;
  losslessPercentage: string;
}

export type ContinueListeningType = 'album' | 'artist' | 'playlist';

export interface ContinueListeningItem {
  id: string;
  type: ContinueListeningType;
  title: string;
  subtitle: string; // e.g. Artist name for album, "Discography" for artist, "Created by you" for playlist
  coverUrl?: string;
  accentGradient?: string;
  lastPlayedText: string; // e.g. "2h ago", "Yesterday"
  lastPlayedTrackName?: string; // e.g. "Too Good Too Bad" or "Track 6 of 22"
  totalTracksCount?: number;
}

export interface ContinueListeningRailProps {
  items?: ContinueListeningItem[];
  onResumeItem?: (item: ContinueListeningItem) => void;
  onItemClick?: (item: ContinueListeningItem) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export type AudioFormat =
  'FLAC 24/96' | 'FLAC 24/192' | 'DSD256' | 'FLAC 16/44.1' | 'ALAC' | 'WAV' | 'MP3 320';

export interface RecentlyAddedItem {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  format: AudioFormat;
  dateAddedText: string; // e.g. "Added today", "Added 2 days ago"
  addedTimestamp: number;
  trackCount: number;
  genre: string;
  year?: number;
  fileSizeMb?: number;
}

export interface RecentlyAddedRailProps {
  items?: RecentlyAddedItem[];
  onPlayItem?: (item: RecentlyAddedItem) => void;
  onItemClick?: (item: RecentlyAddedItem) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
}

export type RediscoverType = 'album' | 'artist' | 'playlist';

export interface RediscoverItem {
  id: string;
  type: RediscoverType;
  title: string;
  subtitle: string;
  coverUrl?: string;
  lastPlayedText: string; // e.g. "Unplayed for 8 months", "Last heard March 2025"
  lastPlayedTimestamp: number;
  totalPlayCount: number;
  highlightReason: string; // e.g. "Your #2 top played album in 2024", "Rediscover 60s Bebop", "Forgotten favorite"
  trackCount?: number;
  format?: AudioFormat;
}

export interface RediscoverRailProps {
  items?: RediscoverItem[];
  onPlayItem?: (item: RediscoverItem) => void;
  onItemClick?: (item: RediscoverItem) => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
}

export type LibrarySubTab = 'artists' | 'albums' | 'genres' | 'tracks';

export interface TrackItem {
  id: string;
  trackNumber: number;
  title: string;
  artist: string;
  album: string;
  codec: 'FLAC' | 'DSD64' | 'DSD256' | 'WAV' | 'ALAC' | 'MP3' | 'OGG' | 'AAC' | 'AIFF' | 'M4A';
  sampleRate: string; // e.g. "24-bit/192kHz", "24/96", "DSD256"
  dynamicRange: string; // e.g. "DR15", "DR13", "DR14"
  bitrate: string; // e.g. "4608 kbps", "2906 kbps"
  replayGain: string; // e.g. "-1.8dB", "-1.2dB"
  year: number;
  catalogNumber: string; // e.g. "PC-33453"
  duration: string; // e.g. "5:42"
  durationSeconds: number;
  coverUrl?: string;
  audioUrl?: string;
  artistIds?: string[];
  albumId?: string;
  genres?: string[];
}

export interface ArtistTopTrack {
  id: string;
  rank: number;
  title: string;
  artist: string;
  album: string;
  dynamicRange: string;
  format: string;
  playCount: number;
  isFavorite?: boolean;
  duration?: string;
  durationSeconds?: number;
}

export interface ArtistDiscographyAlbum {
  id: string;
  title: string;
  year: number;
  formatBadge: string; // e.g. "DSD64", "FLAC 24/192", "FLAC 24/96"
  coverUrl?: string;
  trackCount?: number;
  isNoDisc?: boolean;
  isLocal?: boolean; // True if downloaded/present in local library, false if available in Antra Engine
  fileSize?: string; // e.g. "1.45 GB", "980 MB"
  releaseType?: 'Studio Album' | 'Soundtrack' | 'Live' | 'EP' | 'Compilation' | 'Remixes';
  catalogNumber?: string;
  losslessTier?: string;
}

export type AntraIngestStatus =
  'idle' | 'queued' | 'downloading' | 'verifying' | 'completed' | 'paused' | 'error';

export interface AntraQueueItem {
  id: string;
  albumId: string;
  albumTitle: string;
  artistName: string;
  coverUrl?: string;
  formatBadge: string;
  fileSize: string;
  trackCount: number;
  year: number;
  status: AntraIngestStatus;
  progress: number; // 0 to 100
  downloadSpeed: string; // e.g. "84.5 MB/s"
  bytesDownloaded: string; // e.g. "980 MB / 1.45 GB"
  estimatedTime: string; // e.g. "14s"
  addedAt: number;
  completedAt?: number;
}

export interface ArtistItem {
  id: string;
  name: string;
  displayName?: string;
  genres: string[];
  albumCount: number;
  trackCount: number;
  totalDuration: string;
  avatarUrl?: string;
  bannerUrl?: string;
  featuredCoverUrl?: string;
  bioSummary?: string;
  losslessPlaytime: string;
  losslessPercentage?: string; // e.g. "100% Lossless"
  localStorageSize?: string; // e.g. "8.4 GB"
  discography?: ArtistDiscographyAlbum[];
  topTracks?: ArtistTopTrack[];
  tracks?: TrackItem[];
}

export interface GenreItem {
  id: string;
  name: string;
  albumCount: number;
  trackCount: number;
  artists: string[];
}

export interface AlbumItem {
  id: string;
  title: string;
  artist: string;
  year: number;
  trackCount: number;
  totalDuration: string;
  format: AudioFormat;
  codec: string;
  catalogNumber: string;
  coverUrl?: string;
  bannerUrl?: string;
  dynamicRange: string;
  genre?: string;
  label?: string;
  fileSize?: string;
  sampleRate?: string;
  bitDepth?: string;
  replayGain?: string;
  losslessPercentage?: string;
  description?: string;
  tracks: TrackItem[];
}

export interface ColumnVisibility {
  trackNumber: boolean;
  title: boolean;
  artist: boolean;
  album: boolean;
  codec: boolean;
  sampleRate: boolean;
  dynamicRange: boolean;
  bitrate: boolean;
  replayGain: boolean;
  year: boolean;
  catalogNumber: boolean;
  duration: boolean;
}
