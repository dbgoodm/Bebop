import React, { useState, useEffect } from 'react';
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
  RefreshCw,
} from 'lucide-react';
import { ArtistItem, ArtistTopTrack, ArtistDiscographyAlbum, TrackItem } from '@/types';
import { UniversalTracklist } from '@/components/molecules/UniversalTracklist';
import { refreshArtistDiscography } from '@/services/catalogService';
import { useTheme } from '@/services/themeService';

interface ArtistDetailPageProps {
  artist: ArtistItem;
  onBack: () => void;
  onPlayTrack?: (track: TrackItem) => void;
  onEditTrack?: (track: TrackItem) => void;
  onPlayArtist?: (artist: ArtistItem) => void;
  onSelectAlbum?: (albumTitleOrId: string) => void;
  onContextMenu?: (track: TrackItem, event: React.MouseEvent) => void;
}

export const ArtistDetailPage: React.FC<ArtistDetailPageProps> = ({
  artist,
  onBack,
  onPlayTrack,
  onEditTrack,
  onPlayArtist,
  onSelectAlbum,
  onContextMenu,
}) => {
  const { currentTheme } = useTheme();
  const [currentArtist, setCurrentArtist] = useState<ArtistItem>(artist);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  // Cover Art Archive URLs are generated optimistically for every release group, so
  // releases without artwork 404. Track those and render the placeholder instead of
  // letting the browser show a broken-image icon.
  const [artworkFailed, setArtworkFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCurrentArtist(artist);
    setBioExpanded(false);
    setArtworkFailed({});
    const rawAlbums = artist.discography || [];
    const otherDiscography = rawAlbums.filter((a) => a.availability !== 'in-library' && !a.isLocal);
    if (otherDiscography.length === 0) {
      void (async () => {
        try {
          setIsRefreshing(true);
          const updated = await refreshArtistDiscography(artist.id);
          setCurrentArtist(updated);
        } catch (e) {
          console.warn('Auto-refresh discography:', e);
        } finally {
          setIsRefreshing(false);
        }
      })();
    }
  }, [artist.id]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const updated = await refreshArtistDiscography(currentArtist.id);
      setCurrentArtist(updated);
    } catch (error) {
      console.error('Failed to refresh artist discography:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const displayName = currentArtist.displayName || currentArtist.name;
  const rawAlbums = currentArtist.discography || [];
  const topTracks = currentArtist.topTracks || [];

  // Separate into Local Albums and Remote Discography releases
  const localAlbums = rawAlbums.filter((a) => a.availability === 'in-library' || a.isLocal);
  const otherDiscographyAlbums = rawAlbums.filter(
    (a) => a.availability !== 'in-library' && !a.isLocal,
  );

  return (
    <div id="artist-detail-page" className="w-full flex flex-col gap-6 font-sans text-neutral-200">
      {/* Navigation Breadcrumb / Back button & Refresh Discography */}
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
          <span>Back to Library</span>
        </button>

        <div className="flex items-center gap-3">
          {currentArtist.lastRefreshedAt && (
            <span className="text-[11px] font-mono text-neutral-500">
              Refreshed {new Date(currentArtist.lastRefreshedAt).toLocaleDateString()}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 t-control text-xs font-mono text-neutral-300 hover:text-white border transition-colors cursor-pointer hover:brightness-125 disabled:opacity-50"
            title="Refresh MusicBrainz discography"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`}
            />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh Discography'}</span>
          </button>
        </div>
      </div>

      {/* Top Banner Area matching screenshot with full panoramic background effect */}
      <div
        id="artist-hero-banner"
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
          background: currentTheme.cardGradient || currentTheme.bgCard,
        }}
        className="relative w-full t-card t-stroke overflow-hidden border min-h-[260px] md:min-h-[290px] flex flex-col justify-between p-6 sm:p-7 shadow-2xl"
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
            <div className="flex-shrink-0 relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 t-card t-stroke overflow-hidden bg-neutral-900 border border-neutral-700/80 shadow-2xl group">
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
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                aria-label={`Play ${displayName}`}
              >
                <div className="w-12 h-12 t-btn bg-amber-500 text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 fill-black ml-0.5" />
                </div>
              </button>
            </div>

            {/* Artist Titles, Bio, and Genre Pills */}
            <div className="flex flex-col gap-2.5 max-w-xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight drop-shadow-sm">
                {displayName}
              </h1>

              {artist.bioSummary && (
                <div className="flex flex-col gap-1">
                  <p
                    className={`text-xs sm:text-sm text-neutral-300/90 leading-relaxed drop-shadow-xs ${
                      bioExpanded ? '' : 'line-clamp-4'
                    }`}
                  >
                    {artist.bioSummary}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setBioExpanded((expanded) => !expanded)}
                      className="w-fit text-[11px] font-medium text-amber-400/90 hover:text-amber-300 cursor-pointer"
                    >
                      {bioExpanded ? 'Show less' : 'Read more'}
                    </button>
                    {artist.bioSourceUrl && (
                      <a
                        href={artist.bioSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-fit text-[11px] text-neutral-400 underline hover:text-white"
                      >
                        Source: {artist.bioAttribution || 'Wikipedia'}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {(artist.country ||
                artist.activeFrom ||
                artist.activeTo ||
                artist.aliases?.length) && (
                <p className="text-xs text-neutral-400">
                  {[
                    artist.country,
                    [artist.activeFrom, artist.activeTo].filter(Boolean).join(' – '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {artist.aliases?.length ? ` · Also known as ${artist.aliases.join(', ')}` : ''}
                </p>
              )}

              {/* Genre Pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {artist.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-3 py-1 t-sm text-xs font-medium bg-neutral-900/90 text-neutral-200 border border-neutral-700/60 shadow-xs"
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
              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {localAlbums.length}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Albums
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {artist.trackCount}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Tracks
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[68px] sm:min-w-[80px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {artist.losslessPercentage || '—'}
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 font-sans mt-1">
                  Lossless
                </span>
              </div>

              <div className="bg-[#121620]/80 backdrop-blur-md border border-neutral-700/60 t-card t-stroke py-2.5 px-3 sm:px-4 flex flex-col items-center justify-center text-center shadow-lg min-w-[74px] sm:min-w-[88px]">
                <span className="text-base sm:text-lg font-bold text-white font-mono leading-none">
                  {artist.localStorageSize || '—'}
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
        <div id="discography-column" className="lg:col-span-8 flex flex-col gap-7">
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
                  onClick={() => onSelectAlbum?.(album.id)}
                  className="group flex flex-col cursor-pointer"
                >
                  {/* Album Cover */}
                  <div className="relative aspect-square w-full t-sm overflow-hidden bg-neutral-900 border border-neutral-800 group-hover:border-amber-500/50 transition-colors shadow-sm">
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
                      <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 t-sm bg-black/80 text-[9px] font-mono text-amber-400 font-semibold border border-amber-500/30">
                        {album.formatBadge}
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5 t-sm border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">
                      {album.availability === 'not-local' ? 'Not Local' : 'In Library'}
                    </div>

                    {/* Play hover button */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 t-btn bg-amber-500 text-black flex items-center justify-center shadow">
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
                {otherDiscographyAlbums.map((album) => (
                  <div
                    key={album.id}
                    id={`discography-card-${album.id}`}
                    onClick={() => onSelectAlbum?.(album.id)}
                    className="group flex flex-col t-sm p-1.5 transition-all bg-[#0e121a]/60 border border-neutral-800/80 hover:border-neutral-700 cursor-pointer"
                  >
                    {/* Album Cover */}
                    <div className="relative aspect-square w-full t-sm overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-neutral-600 transition-colors shadow-xs">
                      {album.isNoDisc || !album.coverUrl || artworkFailed[album.id] ? (
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
                          loading="lazy"
                          onError={() =>
                            setArtworkFailed((failed) => ({ ...failed, [album.id]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 filter brightness-90"
                        />
                      )}

                      {/* "Not Local" already states the provenance, so the format badge
                          is redundant here and would collide with it on narrow cards. */}
                      <div className="absolute top-1.5 left-1.5 t-sm border border-neutral-600/50 bg-neutral-900/80 px-1.5 py-0.5 text-[9px] font-mono text-neutral-400">
                        Not Local
                      </div>
                    </div>

                    {/* Album Title and Year */}
                    <div className="mt-1.5 flex flex-col">
                      <span
                        className="text-xs font-semibold text-neutral-300 group-hover:text-amber-400 transition-colors line-clamp-1"
                        title={album.title}
                      >
                        {album.title}
                      </span>
                      <span className="text-[11px] text-neutral-500 font-mono mt-0.5">
                        {album.year}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Top Local Tracks */}
        <div id="top-local-tracks-section" className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
            <h2 className="text-base font-bold text-white tracking-tight">Top Local Tracks</h2>
            <span className="text-xs text-neutral-500 font-mono">By Local Plays</span>
          </div>

          <UniversalTracklist
            idPrefix={`artist-${artist.id}-top-tracks`}
            tracks={topTracks.map((topTrack) => {
              const match = artist.tracks?.find(
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
                duration: topTrack.duration || '—',
                durationSeconds: topTrack.durationSeconds || 210,
                coverUrl: artist.featuredCoverUrl || artist.avatarUrl,
              } as TrackItem;
            })}
            isPlaying={true}
            onPlayTrack={onPlayTrack}
            onEditTrack={onEditTrack}
            onSelectArtist={(art) => {
              // Same artist or other
            }}
            onSelectAlbum={(alb) => {
              onSelectAlbum?.(alb);
            }}
            onContextMenu={onContextMenu}
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
