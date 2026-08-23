import React, { useState } from 'react';
import {
  ArrowLeft,
  Play,
  Heart,
  Disc,
  Volume2,
  Sparkles,
  DownloadCloud,
  CheckCircle2,
  HardDrive,
  Activity,
  ArrowDownToLine,
} from 'lucide-react';
import { ArtistItem, ArtistTopTrack, ArtistDiscographyAlbum, TrackItem } from '@/types';
import { LOCAL_TRACKS } from '@/demo/catalog';
import { UniversalTracklist } from '@/components/molecules/UniversalTracklist';
import { useAntraEngine } from '@/services/antraEngineService';
import { useTheme } from '@/services/themeService';

interface ArtistDetailPageProps {
  artist: ArtistItem;
  onBack: () => void;
  onPlayTrack?: (track: TrackItem) => void;
  onPlayArtist?: (artist: ArtistItem) => void;
  onSelectAlbum?: (albumTitleOrId: string) => void;
}

export const ArtistDetailPage: React.FC<ArtistDetailPageProps> = ({
  artist,
  onBack,
  onPlayTrack,
  onPlayArtist,
  onSelectAlbum,
}) => {
  const { currentTheme } = useTheme();
  const { queueAlbum, getAlbumQueueStatus, isAlbumIngested } = useAntraEngine();

  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (artist.topTracks) {
      artist.topTracks.forEach((t) => {
        init[t.id] = !t.isFavorite;
      });
    }
    return init;
  });

  const toggleFavorite = (trackId: string) => {
    setFavoriteMap((prev) => ({
      ...prev,
      [trackId]: !prev[trackId],
    }));
  };

  const displayName = artist.displayName || artist.name;
  const rawAlbums = artist.discography || [];
  const topTracks = artist.topTracks || [];

  // Determine local status considering dynamically downloaded state
  const albumsWithDynamicStatus = rawAlbums.map((album) => {
    const isNowLocal = album.isLocal || isAlbumIngested(album.id);
    return {
      ...album,
      isLocal: isNowLocal,
    };
  });

  // Separate into Local Albums and Full Discography releases
  const localAlbums = albumsWithDynamicStatus.filter((a) => a.isLocal);
  const otherDiscographyAlbums = albumsWithDynamicStatus.filter((a) => !a.isLocal);

  const handleDownloadAlbum = (e: React.MouseEvent, album: ArtistDiscographyAlbum) => {
    e.stopPropagation();
    queueAlbum(album, displayName);
  };

  return (
    <div id="artist-detail-page" className="w-full flex flex-col gap-6 font-sans text-neutral-200">
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
          <span>Back to Artists</span>
        </button>
      </div>

      {/* Top Banner Area matching screenshot with full panoramic background effect */}
      <div
        id="artist-hero-banner"
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
          background: currentTheme.cardGradient || currentTheme.bgCard,
        }}
        className="relative w-full rounded-xl overflow-hidden border min-h-[260px] md:min-h-[290px] flex flex-col justify-between p-6 sm:p-7 shadow-2xl"
      >
        {/* Full-bleed background band photo on right with seamless gradient fade */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
          {artist.bannerUrl && (
            <img
              src={artist.bannerUrl}
              alt={`${displayName} Band`}
              referrerPolicy="no-referrer"
              className="absolute right-0 top-0 w-full md:w-[65%] lg:w-[58%] h-full object-cover object-top filter grayscale brightness-90 contrast-110"
            />
          )}
          {/* Seamless horizontal gradient blend from left theme background into right image */}
          <div
            style={{
              background: `linear-gradient(to right, ${currentTheme.bgCard} 0%, ${currentTheme.bgCard}f0 40%, transparent 100%)`,
            }}
            className="absolute inset-0"
          />
          {/* Subtle bottom and top vignetting for contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        </div>

        {/* Banner Content (Foreground) */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Left: Featured Album Cover & Artist Details */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6 flex-1">
            {/* Featured Album Cover Artwork */}
            <div className="flex-shrink-0 relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700/80 shadow-2xl group">
              {artist.featuredCoverUrl ? (
                <img
                  src={artist.featuredCoverUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-neutral-800">
                  <Disc className="w-16 h-16" />
                </div>
              )}
              {/* Play overlay on album artwork */}
              <button
                type="button"
                onClick={() => onPlayArtist?.(artist)}
                className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                aria-label={`Play ${displayName}`}
              >
                <div className="w-12 h-12 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 fill-black ml-0.5" />
                </div>
              </button>
            </div>

            {/* Artist Titles, Bio, and Genre Pills */}
            <div className="flex flex-col gap-2.5 max-w-xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight drop-shadow-sm">
                {displayName}
              </h1>

              <p className="text-xs sm:text-sm text-neutral-300/90 leading-relaxed drop-shadow-xs">
                {artist.bioSummary ||
                  'High-resolution local audiophile artist discography with bit-perfect studio master playback.'}
              </p>

              {/* Genre Pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {artist.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-900/90 text-neutral-200 border border-neutral-700/60 backdrop-blur-xs shadow-xs"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Bottom: 4 Translucent Stat Cards */}
          <div className="w-full md:w-auto self-end md:self-end mt-4 md:mt-0 flex justify-end">
            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {localAlbums.length}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Albums
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {artist.trackCount}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Tracks
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {artist.losslessPercentage || '100%'}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Lossless
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 rounded-lg py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[74px] sm:min-w-[88px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {artist.localStorageSize || '8.4 GB'}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1 truncate max-w-[74px]">
                  Local Storage
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Split: Local Discography & Full Discography (Left) and Top Local Tracks (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Local Discography and Discography below it */}
        <div id="discography-column" className="lg:col-span-6 flex flex-col gap-7">
          {/* Section 1: Local Discography */}
          <div id="local-discography-section" className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
              <h2 className="text-base font-bold text-white tracking-tight">Local Discography</h2>
              <span className="text-xs text-neutral-500 font-mono">
                {localAlbums.length} {localAlbums.length === 1 ? 'Album' : 'Albums'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {localAlbums.map((album) => (
                <div
                  key={album.id}
                  id={`local-album-card-${album.id}`}
                  onClick={() => onSelectAlbum?.(album.title)}
                  className="group flex flex-col cursor-pointer"
                >
                  {/* Album Cover */}
                  <div className="relative aspect-square w-full rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 group-hover:border-amber-500/50 transition-colors shadow-sm">
                    {album.isNoDisc || !album.coverUrl ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#151921] text-neutral-500 p-2 text-center">
                        <Disc className="w-8 h-8 opacity-40 mb-1" />
                        <span className="text-[11px] font-medium text-neutral-400">No Disc</span>
                      </div>
                    ) : (
                      <img
                        src={album.coverUrl}
                        alt={album.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}

                    {/* Format tag badge */}
                    {album.formatBadge && (
                      <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono text-amber-400 font-semibold border border-amber-500/30">
                        {album.formatBadge}
                      </div>
                    )}

                    {/* Play hover button */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-black flex items-center justify-center shadow">
                        <Play className="w-4 h-4 fill-black ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Album Title and Year */}
                  <div className="mt-1.5 flex flex-col">
                    <span
                      className="text-xs font-semibold text-neutral-200 group-hover:text-amber-400 transition-colors line-clamp-1"
                      title={album.title}
                    >
                      {album.title}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-mono">{album.year}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Discography (All other releases below local albums) */}
          {otherDiscographyAlbums.length > 0 && (
            <div id="full-discography-section" className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                <h2 className="text-base font-bold text-white tracking-tight">Discography</h2>
                <span className="text-xs text-neutral-500 font-mono">
                  {otherDiscographyAlbums.length}{' '}
                  {otherDiscographyAlbums.length === 1 ? 'Release' : 'Releases'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                {otherDiscographyAlbums.map((album) => {
                  const queueStatus = getAlbumQueueStatus(album.id);
                  const isDownloading =
                    queueStatus?.status === 'downloading' || queueStatus?.status === 'verifying';
                  const isQueued = queueStatus?.status === 'queued';

                  return (
                    <div
                      key={album.id}
                      id={`discography-card-${album.id}`}
                      className="group flex flex-col rounded-md p-1.5 transition-all bg-[#0e121a]/60 border border-neutral-800/80 hover:border-neutral-700"
                    >
                      {/* Album Cover */}
                      <div className="relative aspect-square w-full rounded overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-neutral-600 transition-colors shadow-xs">
                        {album.isNoDisc || !album.coverUrl ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#141720] text-neutral-500 p-2 text-center">
                            <Disc className="w-8 h-8 opacity-40 mb-1" />
                            <span className="text-[10px] font-medium text-neutral-400 line-clamp-2">
                              {album.title}
                            </span>
                          </div>
                        ) : (
                          <img
                            src={album.coverUrl}
                            alt={album.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 filter brightness-90"
                          />
                        )}

                        {/* Format tag badge */}
                        {album.formatBadge && (
                          <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/85 backdrop-blur-xs text-[9px] font-mono text-amber-400/90 font-semibold border border-amber-500/20">
                            {album.formatBadge}
                          </div>
                        )}

                        {/* Download button on artwork hover */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          {!isDownloading && !isQueued && (
                            <button
                              type="button"
                              onClick={(e) => handleDownloadAlbum(e, album)}
                              className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-amber-500 text-white hover:text-black border border-neutral-600 flex items-center justify-center shadow transition-colors cursor-pointer"
                              title="Download to library"
                              aria-label={`Download ${album.title}`}
                            >
                              <ArrowDownToLine className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Download Progress Bar if downloading */}
                      {isDownloading && queueStatus && (
                        <div className="mt-1.5 flex flex-col gap-0.5">
                          <div className="flex items-center justify-between text-[9px] font-mono text-amber-300">
                            <span>Downloading {queueStatus.progress}%</span>
                          </div>
                          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 transition-all duration-200"
                              style={{ width: `${queueStatus.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Album Title, Year & Quick Action */}
                      <div className="mt-1.5 flex flex-col">
                        <span
                          className="text-xs font-semibold text-neutral-300 line-clamp-1"
                          title={album.title}
                        >
                          {album.title}
                        </span>
                        <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono mt-0.5">
                          <span>{album.year}</span>
                          {isDownloading ? (
                            <span className="text-[10px] text-amber-400">Downloading...</span>
                          ) : isQueued ? (
                            <span className="text-[10px] text-neutral-400">Queued</span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleDownloadAlbum(e, album)}
                              className="text-[10px] text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-1"
                              title="Download to library"
                            >
                              <ArrowDownToLine className="w-3 h-3" />
                              <span>Get</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Top Local Tracks */}
        <div id="top-local-tracks-section" className="lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
            <h2 className="text-base font-bold text-white tracking-tight">Top Local Tracks</h2>
            <span className="text-xs text-neutral-500 font-mono">By Local Plays</span>
          </div>

          <UniversalTracklist
            idPrefix={`artist-${artist.id}-top-tracks`}
            tracks={topTracks.map((topTrack) => {
              const match = LOCAL_TRACKS.find(
                (t) => t.title.toLowerCase() === topTrack.title.toLowerCase(),
              );
              if (match) return match;
              return {
                id: topTrack.id,
                trackNumber: topTrack.rank,
                title: topTrack.title,
                artist: topTrack.artist || artist.name,
                album: topTrack.album || 'Local Discography',
                codec: 'FLAC',
                sampleRate: topTrack.format,
                dynamicRange: topTrack.dynamicRange,
                bitrate: '3072 kbps',
                replayGain: '-1.5dB',
                year: 2023,
                catalogNumber: 'CAT-LOCAL',
                duration: topTrack.duration || '3:30',
                durationSeconds: topTrack.durationSeconds || 210,
                coverUrl: artist.featuredCoverUrl || artist.avatarUrl,
              } as TrackItem;
            })}
            isPlaying={true}
            onPlayTrack={onPlayTrack}
            onSelectArtist={(art) => {
              // Same artist or other
            }}
            onSelectAlbum={(alb) => {
              onSelectAlbum?.(alb);
            }}
            storageKey={`artist_${artist.id}_columns`}
            defaultVisibleColumns={[
              'trackNumber',
              'title',
              'dynamicRange',
              'sampleRate',
              'playCount',
              'actions',
            ]}
            showCustomizerButton={true}
            compact={true}
          />
        </div>
      </div>
    </div>
  );
};
