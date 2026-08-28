import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Heart,
  Disc3,
  Sparkles,
  Disc,
  Clock,
  Music,
  Info,
  FileAudio,
  DownloadCloud,
  ArrowDownToLine,
  Shuffle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { AlbumItem, TrackItem, ArtistItem } from '@/types';
import { UniversalTracklist } from '@/components/molecules/UniversalTracklist';
import { useTheme } from '@/services/themeService';
import {
  acquireTrack,
  acquireAlbum,
  onAcquisitionProgress,
  onAcquisitionCompleted,
  onAcquisitionFailed,
} from '@/services/acquisitionService';
import { loadAlbumDetail } from '@/services/catalogService';

interface AlbumDetailPageProps {
  album: AlbumItem;
  currentTrackId?: string;
  isPlaying?: boolean;
  onBack: () => void;
  /** Where back returns to, so the label matches how the page was reached. */
  backLabel?: string;
  onPlayTrack?: (track: TrackItem) => void;
  onEditTrack?: (track: TrackItem) => void;
  onPlayAlbum?: (album: AlbumItem) => void;
  onSelectArtist?: (artist: any) => void;
  onSelectAlbum?: (album: any) => void;
}

export const AlbumDetailPage: React.FC<AlbumDetailPageProps> = ({
  album,
  currentTrackId,
  isPlaying,
  onBack,
  backLabel = 'Back to Library',
  onPlayTrack,
  onEditTrack,
  onPlayAlbum,
  onSelectArtist,
  onSelectAlbum,
}) => {
  const { currentTheme } = useTheme();
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [tracks, setTracks] = useState<TrackItem[]>(album.tracks || []);
  const [isAcquiringAll, setIsAcquiringAll] = useState(false);

  useEffect(() => {
    setTracks(album.tracks || []);
    if (!album.tracks || album.tracks.length === 0 || album.tracks.every((t) => t.isLocal)) {
      void (async () => {
        try {
          const detailed = await loadAlbumDetail(album.id);
          if (detailed.tracks && detailed.tracks.length > 0) {
            setTracks(detailed.tracks);
          }
        } catch (e) {
          console.warn('Failed to load unified album tracks:', e);
        }
      })();
    }
  }, [album.id]);

  // Subscribe to real-time acquisition progress and completion events
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenCompleted: (() => void) | undefined;
    let unlistenFailed: (() => void) | undefined;

    void onAcquisitionProgress((payload) => {
      setTracks((prevTracks) =>
        prevTracks.map((t) => {
          if (
            (payload.remoteTrackId && t.remoteId === payload.remoteTrackId) ||
            (payload.trackId && (t.id === payload.trackId || t.remoteId === payload.trackId))
          ) {
            const speedMb = payload.speedBytesPerSec
              ? `${(payload.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
              : undefined;
            return {
              ...t,
              acquisitionStatus: (payload.stage as any) || 'downloading',
              acquisitionProgress: payload.percent,
              acquisitionSpeed: speedMb,
            };
          }
          return t;
        }),
      );
    }).then((un) => {
      unlistenProgress = un;
    });

    void onAcquisitionCompleted((payload) => {
      setTracks((prevTracks) =>
        prevTracks.map((t) => {
          if (
            (payload.remoteTrackId && t.remoteId === payload.remoteTrackId) ||
            (payload.trackId && (t.id === payload.trackId || t.remoteId === payload.trackId))
          ) {
            return {
              ...t,
              id: payload.localTrackId || t.id,
              isLocal: true,
              acquisitionStatus: 'completed',
              acquisitionProgress: 100,
              audioUrl: payload.filePath || t.audioUrl,
            };
          }
          return t;
        }),
      );
    }).then((un) => {
      unlistenCompleted = un;
    });

    void onAcquisitionFailed((payload) => {
      setTracks((prevTracks) =>
        prevTracks.map((t) => {
          if (
            (payload.remoteTrackId && t.remoteId === payload.remoteTrackId) ||
            (payload.trackId && (t.id === payload.trackId || t.remoteId === payload.trackId))
          ) {
            return {
              ...t,
              acquisitionStatus: 'failed',
            };
          }
          return t;
        }),
      );
    }).then((un) => {
      unlistenFailed = un;
    });

    return () => {
      unlistenProgress?.();
      unlistenCompleted?.();
      unlistenFailed?.();
    };
  }, []);

  const localTracks = useMemo(() => tracks.filter((t) => t.isLocal !== false), [tracks]);
  const missingTracks = useMemo(() => tracks.filter((t) => t.isLocal === false), [tracks]);

  const allMissing = tracks.length > 0 && localTracks.length === 0;
  const isPartial = localTracks.length > 0 && missingTracks.length > 0;
  const allLocal = tracks.length > 0 && missingTracks.length === 0;

  const handleAcquireTrack = useCallback(
    async (track: TrackItem) => {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id || t.remoteId === track.remoteId
            ? { ...t, acquisitionStatus: 'queued', acquisitionProgress: 0 }
            : t,
        ),
      );

      try {
        await acquireTrack({
          trackTitle: track.title,
          artistName: track.artist || album.artist,
          albumTitle: album.title,
          remoteTrackId: track.remoteId || track.id,
          remoteReleaseId: album.id,
          isrc: track.isrc,
          trackNumber: track.trackNumber,
          durationMs: track.durationSeconds ? track.durationSeconds * 1000 : undefined,
          musicbrainzRecordingId: track.musicbrainzRecordingId,
          spotifyTrackId: track.spotifyTrackId,
        });
      } catch (err) {
        console.error('Failed to acquire track:', err);
        setTracks((prev) =>
          prev.map((t) =>
            t.id === track.id || t.remoteId === track.remoteId
              ? { ...t, acquisitionStatus: 'failed' }
              : t,
          ),
        );
      }
    },
    [album],
  );

  const handleAcquireMissing = useCallback(async () => {
    if (missingTracks.length === 0 || isAcquiringAll) return;
    setIsAcquiringAll(true);

    setTracks((prev) =>
      prev.map((t) =>
        t.isLocal === false ? { ...t, acquisitionStatus: 'queued', acquisitionProgress: 0 } : t,
      ),
    );

    try {
      await acquireAlbum({
        albumTitle: album.title,
        artistName: album.artist,
        remoteReleaseId: album.id,
        tracks: missingTracks.map((t) => ({
          trackTitle: t.title,
          artistName: t.artist || album.artist,
          albumTitle: album.title,
          remoteTrackId: t.remoteId || t.id,
          remoteReleaseId: album.id,
          isrc: t.isrc,
          trackNumber: t.trackNumber,
          durationMs: t.durationSeconds ? t.durationSeconds * 1000 : undefined,
          musicbrainzRecordingId: t.musicbrainzRecordingId,
          spotifyTrackId: t.spotifyTrackId,
        })),
      });
    } catch (err) {
      console.error('Failed to acquire missing tracks:', err);
    } finally {
      setIsAcquiringAll(false);
    }
  }, [album, missingTracks, isAcquiringAll]);

  const handlePlayAvailable = useCallback(() => {
    if (localTracks.length > 0) {
      onPlayAlbum?.({
        ...album,
        tracks: localTracks,
      });
    }
  }, [album, localTracks, onPlayAlbum]);

  const handleShuffleAlbum = useCallback(() => {
    if (localTracks.length > 0) {
      const shuffled = [...localTracks].sort(() => Math.random() - 0.5);
      onPlayAlbum?.({
        ...album,
        tracks: shuffled,
      });
    }
  }, [album, localTracks, onPlayAlbum]);

  const toggleFavorite = (trackId: string) => {
    setFavoriteMap((prev) => ({
      ...prev,
      [trackId]: !prev[trackId],
    }));
  };

  const handleArtistClick = () => {
    if (!onSelectArtist) return;
    onSelectArtist(album.artist);
  };

  return (
    <div id="album-detail-page" className="w-full flex flex-col gap-6 font-sans text-neutral-200">
      {/* Navigation Breadcrumb / Back button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          style={{
            backgroundColor: currentTheme.bgCard,
            borderColor: currentTheme.borderColor,
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 t-control text-xs font-mono text-neutral-300 hover:text-white border transition-colors cursor-pointer hover:brightness-125"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{backLabel}</span>
        </button>

        <div className="flex items-center gap-2">
          <span
            style={{
              backgroundColor: `${currentTheme.primary}20`,
              color: currentTheme.primary,
              borderColor: `${currentTheme.primary}50`,
            }}
            className="text-xs font-mono border px-2 py-0.5 t-sm"
          >
            {album.format}
          </span>
          <span
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="text-xs font-mono text-neutral-400 border px-2 py-0.5 t-sm"
          >
            {album.dynamicRange}
          </span>
        </div>
      </div>

      {/* Top Panoramic Hero Banner */}
      <div
        id="album-hero-banner"
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
          background: currentTheme.cardGradient || currentTheme.bgCard,
        }}
        className="relative w-full t-card t-stroke overflow-hidden border min-h-[260px] md:min-h-[290px] flex flex-col justify-between p-6 sm:p-7 shadow-2xl"
      >
        {/* Full-bleed ambient background artwork on right with seamless gradient fade */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
          {(album.bannerUrl || album.coverUrl) && (
            <img
              src={album.bannerUrl || album.coverUrl}
              alt={album.title}
              referrerPolicy="no-referrer"
              className="absolute right-0 top-0 w-full md:w-[65%] lg:w-[58%] h-full object-cover object-center filter grayscale brightness-75 contrast-125"
            />
          )}
          {/* Seamless horizontal gradient blend from left theme background into right image */}
          <div
            style={{
              background: `linear-gradient(to right, ${currentTheme.bgCard} 0%, ${currentTheme.bgCard}f0 40%, transparent 100%)`,
            }}
            className="absolute inset-0"
          />
          {/* Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        </div>

        {/* Banner Content (Foreground) */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Left: Album Cover & Metadata */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6 flex-1">
            {/* Album Cover Artwork */}
            <div className="flex-shrink-0 relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 t-card t-stroke overflow-hidden bg-neutral-900 border border-neutral-700/80 shadow-2xl group">
              {album.coverUrl ? (
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-neutral-800">
                  <Disc3 className="w-16 h-16" />
                </div>
              )}

              {/* Format tag badge on cover */}
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 t-sm bg-black/85 text-[10px] font-mono text-amber-400 border border-amber-500/40">
                {album.format}
              </div>

              {/* Play All / Acquire Album Button Overlay */}
              <button
                type="button"
                onClick={() => {
                  if (allMissing) {
                    void handleAcquireMissing();
                  } else {
                    handlePlayAvailable();
                  }
                }}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                aria-label={
                  allMissing ? `Acquire album ${album.title}` : `Play album ${album.title}`
                }
              >
                <div className="w-12 h-12 t-btn bg-amber-500 text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  {allMissing ? (
                    <DownloadCloud className="w-6 h-6 stroke-black stroke-2" />
                  ) : (
                    <Play className="w-6 h-6 fill-black ml-0.5" />
                  )}
                </div>
              </button>
            </div>

            {/* Album Titles, Artist Link, Bio, and Genre Badges */}
            <div className="flex flex-col gap-2.5 max-w-xl">
              <div className="flex flex-col">
                <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-semibold mb-1">
                  Master Studio Recording • {album.year}
                </span>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight drop-shadow-sm">
                  {album.title}
                </h1>
                <button
                  type="button"
                  onClick={handleArtistClick}
                  className="text-sm sm:text-base font-semibold text-neutral-300 hover:text-amber-400 transition-colors text-left mt-0.5 w-fit cursor-pointer flex items-center gap-1.5"
                >
                  <span>{album.artist}</span>
                </button>
              </div>

              <p className="text-xs sm:text-sm text-neutral-300/90 leading-relaxed drop-shadow-xs">
                {album.description ||
                  `High-resolution audiophile release of ${album.title} by ${album.artist}, featuring bit-perfect uncompressed dynamics.`}
              </p>

              {/* Genre / Label Badges */}
              <div className="flex flex-wrap gap-2 pt-1">
                {album.genre && (
                  <span className="px-3 py-1 t-sm text-xs font-medium bg-neutral-900/90 text-neutral-200 border border-neutral-700/60 shadow-xs">
                    {album.genre}
                  </span>
                )}
                {album.label && (
                  <span className="px-3 py-1 t-sm text-xs font-mono text-neutral-400 bg-[#121620]/90 border border-neutral-800">
                    {album.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Bottom: 4 Translucent Stat Cards */}
          <div className="w-full md:w-auto self-end md:self-end mt-4 md:mt-0 flex justify-end">
            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {tracks.length || album.trackCount}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Tracks
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.totalDuration}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Duration
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.dynamicRange}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Dynamics
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[74px] sm:min-w-[88px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.fileSize || '—'}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1 truncate max-w-[74px]">
                  Storage Size
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Split: Album Tracklist (Left 8 cols) and Audiophile Technical Breakdown (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Full Tracklist with Hi-Res details */}
        <div id="album-tracklist-section" className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Track Listing</span>
              <span className="text-xs font-mono text-neutral-500 font-normal">
                ({tracks.length} tracks
                {localTracks.length < tracks.length ? ` · ${localTracks.length} local` : ''})
              </span>
            </h2>

            <div className="flex items-center gap-2">
              {allMissing ? (
                <button
                  type="button"
                  onClick={handleAcquireMissing}
                  disabled={isAcquiringAll}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 t-control bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {isAcquiringAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="w-3.5 h-3.5" />
                  )}
                  <span>{isAcquiringAll ? 'Acquiring Album…' : 'Get Full Album'}</span>
                </button>
              ) : isPartial ? (
                <>
                  <button
                    type="button"
                    onClick={handlePlayAvailable}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 t-control bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Play Available ({localTracks.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAcquireMissing}
                    disabled={isAcquiringAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 t-control bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isAcquiringAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                    )}
                    <span>Acquire Missing Tracks ({missingTracks.length})</span>
                  </button>
                </>
              ) : allLocal ? (
                <>
                  <button
                    type="button"
                    onClick={handlePlayAvailable}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 t-control bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Play Album</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShuffleAlbum}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 t-control bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Shuffle</span>
                  </button>
                </>
              ) : tracks.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onPlayAlbum?.(album)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 t-control bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>Play All</span>
                </button>
              ) : (
                <span className="text-xs font-mono text-neutral-500">Not in local library</span>
              )}
            </div>
          </div>

          {tracks.length > 0 ? (
            <UniversalTracklist
              idPrefix={`album-${album.id}`}
              tracks={tracks}
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              onPlayTrack={onPlayTrack}
              onEditTrack={onEditTrack}
              onAcquireTrack={handleAcquireTrack}
              onSelectArtist={onSelectArtist}
              onSelectAlbum={onSelectAlbum}
              storageKey={`album_${album.id}_columns`}
              defaultVisibleColumns={[
                'trackNumber',
                'title',
                'dynamicRange',
                'sampleRate',
                'bitrate',
                'duration',
                'actions',
              ]}
              showCustomizerButton={true}
            />
          ) : (
            <div
              style={{
                backgroundColor: currentTheme.bgCard,
                borderColor: currentTheme.borderColor,
              }}
              className="t-card t-stroke border p-8 flex flex-col items-center justify-center text-center gap-3 text-neutral-400"
            >
              <Disc className="w-12 h-12 text-neutral-600" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-neutral-200">
                  Remote Discography Release
                </span>
                <span className="text-xs text-neutral-400 max-w-sm">
                  This release was cataloged from MusicBrainz. Audio tracks will be available when
                  local audio files for this album are added to your library.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Audiophile Studio Specs & Technical Inspection */}
        <div id="album-specs-section" className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-amber-400" />
              <span>Studio Master Specs</span>
            </h2>
            <span className="text-xs text-neutral-500 font-mono">Bit-Perfect</span>
          </div>

          {/* Technical Specs Card */}
          <div
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
              background: currentTheme.cardGradient || currentTheme.bgCard,
            }}
            className="border t-card t-stroke p-4 flex flex-col gap-3 font-mono text-xs shadow-md"
          >
            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">Master Source</span>
              <span className="text-neutral-200">{album.sampleRate || '—'}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">Audio Codec</span>
              <span className="font-bold" style={{ color: currentTheme.primary }}>
                {album.codec} (Uncompressed)
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">Dynamic Score</span>
              <span style={{ color: currentTheme.secondary }}>
                {album.dynamicRange} (Studio Master)
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">ReplayGain Target</span>
              <span className="text-neutral-200">{album.replayGain || '-2.0 dB'}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">Catalog #</span>
              <span className="text-neutral-300">{album.catalogNumber}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">Record Label</span>
              <span className="text-neutral-300 font-sans text-[11px]">
                {album.label || 'Studio Master Archive'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-1.5">
              <span className="text-neutral-500">Lossless Integrity</span>
              <span className="text-emerald-400 font-bold">100% Bit-Perfect Match</span>
            </div>
          </div>

          {/* Artist Quick Link Tile */}
          <div
            id="album-artist-card"
            onClick={handleArtistClick}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="group border t-card t-stroke p-3.5 flex items-center justify-between transition-all cursor-pointer shadow-md hover:brightness-110"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-900 border border-neutral-700 flex-shrink-0">
                {album.coverUrl ? (
                  <img
                    src={album.coverUrl}
                    alt={album.artist}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc className="w-5 h-5 m-auto text-neutral-500" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-neutral-400">Album Artist</span>
                <span className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                  {album.artist}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="text-xs font-mono text-neutral-400 group-hover:text-amber-400 flex items-center gap-1"
            >
              <span>View Artist</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
