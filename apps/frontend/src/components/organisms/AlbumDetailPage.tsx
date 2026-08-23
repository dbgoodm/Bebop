import React, { useState } from 'react';
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
} from 'lucide-react';
import { AlbumItem, TrackItem, ArtistItem } from '@/types';
import { LOCAL_ARTISTS } from '@/demo/catalog';
import { UniversalTracklist } from '@/components/molecules/UniversalTracklist';
import { useTheme } from '@/services/themeService';

interface AlbumDetailPageProps {
  album: AlbumItem;
  currentTrackId?: string;
  isPlaying?: boolean;
  onBack: () => void;
  onPlayTrack?: (track: TrackItem) => void;
  onPlayAlbum?: (album: AlbumItem) => void;
  onSelectArtist?: (artist: any) => void;
  onSelectAlbum?: (album: any) => void;
}

export const AlbumDetailPage: React.FC<AlbumDetailPageProps> = ({
  album,
  currentTrackId,
  isPlaying,
  onBack,
  onPlayTrack,
  onPlayAlbum,
  onSelectArtist,
  onSelectAlbum,
}) => {
  const { currentTheme } = useTheme();
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});

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
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono text-neutral-300 hover:text-white border transition-colors cursor-pointer hover:brightness-125"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Library</span>
        </button>

        <div className="flex items-center gap-2">
          <span
            style={{
              backgroundColor: `${currentTheme.primary}20`,
              color: currentTheme.primary,
              borderColor: `${currentTheme.primary}50`,
            }}
            className="text-xs font-mono border px-2 py-0.5 rounded"
          >
            {album.format}
          </span>
          <span
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="text-xs font-mono text-neutral-400 border px-2 py-0.5 rounded"
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
        className="relative w-full rounded-xl overflow-hidden border min-h-[260px] md:min-h-[290px] flex flex-col justify-between p-6 sm:p-7 shadow-2xl"
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
            <div className="flex-shrink-0 relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700/80 shadow-2xl group">
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
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-xs text-[10px] font-mono text-amber-400 border border-amber-500/40">
                {album.format}
              </div>

              {/* Play All Album Button Overlay */}
              <button
                type="button"
                onClick={() => onPlayAlbum?.(album)}
                className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                aria-label={`Play album ${album.title}`}
              >
                <div className="w-12 h-12 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 fill-black ml-0.5" />
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
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-900/90 text-neutral-200 border border-neutral-700/60 backdrop-blur-xs shadow-xs">
                    {album.genre}
                  </span>
                )}
                {album.label && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono text-neutral-400 bg-[#121620]/90 border border-neutral-800 backdrop-blur-xs">
                    {album.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Bottom: 4 Translucent Stat Cards */}
          <div className="w-full md:w-auto self-end md:self-end mt-4 md:mt-0 flex justify-end">
            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.trackCount}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Tracks
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.totalDuration}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Duration
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.dynamicRange}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Dynamics
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[74px] sm:min-w-[88px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {album.fileSize || '1.8 GB'}
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
                ({album.tracks.length} tracks)
              </span>
            </h2>

            <button
              type="button"
              onClick={() => onPlayAlbum?.(album)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Play All</span>
            </button>
          </div>

          {/* Tracks Table using UniversalTracklist with draggable columns */}
          <UniversalTracklist
            idPrefix={`album-${album.id}`}
            tracks={album.tracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            onPlayTrack={onPlayTrack}
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
            className="border rounded-lg p-4 flex flex-col gap-3 font-mono text-xs shadow-md"
          >
            <div className="flex justify-between items-center py-1.5 border-b border-neutral-800/50">
              <span className="text-neutral-500">Master Source</span>
              <span className="text-neutral-200">{album.sampleRate || '192 kHz / 24-bit'}</span>
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
            className="group border rounded-lg p-3.5 flex items-center justify-between transition-all cursor-pointer shadow-md hover:brightness-110"
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
