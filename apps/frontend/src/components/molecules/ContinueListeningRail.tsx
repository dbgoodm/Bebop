import React, { useRef } from 'react';
import {
  Play,
  ChevronLeft,
  ChevronRight,
  Disc3,
  ListMusic,
  User,
  Clock,
  Music2,
} from 'lucide-react';
import { ContinueListeningItem, ContinueListeningRailProps } from '@/types';
import { useTheme } from '@/services/themeService';

const SAMPLE_CONTINUE_ITEMS: ContinueListeningItem[] = [
  {
    id: 'cl-1',
    type: 'album',
    title: 'Cowboy Bebop (Original Soundtrack)',
    subtitle: 'The Seatbelts • 1998',
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    accentGradient: 'from-amber-600/40 to-neutral-900',
    lastPlayedText: '25m ago',
    lastPlayedTrackName: 'Too Good Too Bad',
    totalTracksCount: 22,
  },
  {
    id: 'cl-2',
    type: 'playlist',
    title: 'Late Night Hard Bop Essentials',
    subtitle: 'Curated by You • 48 Tracks',
    coverUrl:
      'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&auto=format&fit=crop&q=80',
    accentGradient: 'from-blue-600/40 to-neutral-900',
    lastPlayedText: '2h ago',
    lastPlayedTrackName: 'Autumn Leaves (Live)',
    totalTracksCount: 48,
  },
  {
    id: 'cl-3',
    type: 'artist',
    title: 'Miles Davis',
    subtitle: 'Complete Columbia Sessions • 14 Albums',
    coverUrl:
      'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80',
    accentGradient: 'from-emerald-600/40 to-neutral-900',
    lastPlayedText: 'Yesterday',
    lastPlayedTrackName: 'So What',
    totalTracksCount: 86,
  },
  {
    id: 'cl-4',
    type: 'album',
    title: 'Blue Train',
    subtitle: 'John Coltrane • 1957 (DSD256 Master)',
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    accentGradient: 'from-rose-600/40 to-neutral-900',
    lastPlayedText: '3 days ago',
    lastPlayedTrackName: 'Lazy Bird',
    totalTracksCount: 5,
  },
  {
    id: 'cl-5',
    type: 'playlist',
    title: 'Tokyo Cyber Jazz & Fusion 2026',
    subtitle: 'Automated Smart Mix • 32 Tracks',
    coverUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    accentGradient: 'from-purple-600/40 to-neutral-900',
    lastPlayedText: '5 days ago',
    lastPlayedTrackName: 'Cat Blues',
    totalTracksCount: 32,
  },
  {
    id: 'cl-6',
    type: 'album',
    title: 'Future Sounds of Bebop Vol. 2',
    subtitle: 'Yoko Kanno & Various • 2001',
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    accentGradient: 'from-amber-600/40 to-neutral-900',
    lastPlayedText: '1 week ago',
    lastPlayedTrackName: 'Space Lion',
    totalTracksCount: 15,
  },
];

export const ContinueListeningRail: React.FC<ContinueListeningRailProps> = ({
  items = SAMPLE_CONTINUE_ITEMS,
  onResumeItem,
  onItemClick,
  onSelectArtist,
  onSelectAlbum,
  emptyMessage = 'Start a track from your local library and its current session will appear here.',
  emptyActionLabel,
  onEmptyAction,
}) => {
  const { currentTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 360;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const getTypeBadge = (type: ContinueListeningItem['type']) => {
    switch (type) {
      case 'album':
        return (
          <span
            style={{
              backgroundColor: `${currentTheme.primary}20`,
              color: currentTheme.primary,
              borderColor: `${currentTheme.primary}60`,
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
          >
            <Disc3 className="w-3 h-3" />
            Album
          </span>
        );
      case 'artist':
        return (
          <span
            style={{
              backgroundColor: `${currentTheme.secondary}20`,
              color: currentTheme.secondary,
              borderColor: `${currentTheme.secondary}60`,
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
          >
            <User className="w-3 h-3" />
            Artist Session
          </span>
        );
      case 'playlist':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-950/80 text-blue-300 border border-blue-800/60">
            <ListMusic className="w-3 h-3" />
            Playlist
          </span>
        );
    }
  };

  return (
    <section id="continue-listening-section" className="w-full flex flex-col gap-3 font-sans">
      {/* Section Header */}
      <div id="continue-listening-header" className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-4 rounded-sm"
            style={{ backgroundColor: currentTheme.secondary }}
          />
          <h2 className="text-sm font-bold tracking-wider text-neutral-200 uppercase font-serif">
            Continue Listening
          </h2>
          <span className="text-xs text-neutral-500 font-normal">
            (Playlists, Artists & Albums)
          </span>
        </div>

        {/* Scroll Controls */}
        <div className="flex items-center gap-1.5">
          <button
            id="continue-scroll-left"
            type="button"
            onClick={() => handleScroll('left')}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="w-8 h-8 rounded border text-neutral-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer hover:brightness-125"
            aria-label="Scroll Left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            id="continue-scroll-right"
            type="button"
            onClick={() => handleScroll('right')}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="w-8 h-8 rounded border text-neutral-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer hover:brightness-125"
            aria-label="Scroll Right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Rail (No Scrollbar) */}
      <div
        ref={scrollContainerRef}
        id="continue-listening-carousel"
        className="flex items-stretch gap-4 overflow-x-auto pb-1 pt-1 no-scrollbar snap-x"
      >
        {items.length === 0 ? (
          <div
            className="flex min-h-48 w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center"
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
          >
            <Music2 className="h-6 w-6" style={{ color: currentTheme.primary }} />
            <h3 className="mt-3 text-sm font-semibold text-white">No listening session yet</h3>
            <p className="mt-1 max-w-md text-xs text-neutral-400">{emptyMessage}</p>
            {emptyActionLabel && onEmptyAction && (
              <button
                type="button"
                onClick={onEmptyAction}
                className="mt-4 text-xs font-semibold underline"
                style={{ color: currentTheme.primary }}
              >
                {emptyActionLabel}
              </button>
            )}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              id={`continue-card-${item.id}`}
              onClick={() => onItemClick?.(item)}
              style={{
                backgroundColor: currentTheme.bgCard,
                borderColor: currentTheme.borderColor,
              }}
              className="group relative flex-none w-72 sm:w-80 border rounded-xl overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer snap-start"
            >
              {/* Top Media Banner / Cover Art & Resume Play Trigger */}
              <div className="relative h-36 w-full overflow-hidden bg-neutral-900">
                {item.coverUrl ? (
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-br ${item.accentGradient || 'from-neutral-800 to-neutral-950'} flex items-center justify-center`}
                  >
                    <Disc3 className="w-12 h-12 text-neutral-600" />
                  </div>
                )}

                {/* Gradient Overlay for Text Legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c1017] via-transparent to-black/40" />

                {/* Top Bar Badges on Image */}
                <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                  {getTypeBadge(item.type)}
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-300 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded border border-white/10">
                    <Clock className="w-3 h-3 text-neutral-400" />
                    {item.lastPlayedText}
                  </span>
                </div>

                {/* Netflix-style Floating Resume Play Button */}
                <button
                  id={`resume-play-${item.id}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResumeItem?.(item);
                  }}
                  style={{
                    backgroundColor: currentTheme.primary,
                    boxShadow: `0 4px 16px ${currentTheme.accentGlow}`,
                  }}
                  className="absolute right-3 bottom-3 w-11 h-11 rounded-full text-black flex items-center justify-center shadow-lg transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer hover:scale-105 hover:brightness-110"
                  aria-label={`Resume ${item.title}`}
                >
                  <Play className="w-5 h-5 fill-black ml-0.5" />
                </button>
              </div>

              {/* Bottom Info Section */}
              <div className="p-3.5 flex flex-col justify-between flex-1">
                <div>
                  <h3
                    className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover:opacity-90 transition-colors"
                    title={item.title}
                  >
                    {item.title}
                  </h3>
                  <div className="text-xs text-neutral-400 mt-0.5 line-clamp-1">
                    {item.type === 'album' && item.subtitle.includes('•') ? (
                      (() => {
                        const artistPart = item.subtitle.split('•')[0].trim();
                        const rest = item.subtitle.substring(item.subtitle.indexOf('•'));
                        return (
                          <span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectArtist?.(artistPart);
                              }}
                              className="hover:underline cursor-pointer transition-colors"
                              style={{ color: currentTheme.textSecondary }}
                              title={`View artist: ${artistPart}`}
                            >
                              {artistPart}
                            </button>
                            <span className="text-neutral-500"> {rest}</span>
                          </span>
                        );
                      })()
                    ) : item.type === 'artist' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectArtist?.(item.title);
                        }}
                        className="hover:underline cursor-pointer transition-colors"
                        style={{ color: currentTheme.textSecondary }}
                        title={`View artist: ${item.title}`}
                      >
                        {item.subtitle}
                      </button>
                    ) : (
                      <span>{item.subtitle}</span>
                    )}
                  </div>
                </div>

                {/* Last active track note (no progress bar or time remaining) */}
                {item.lastPlayedTrackName && (
                  <div
                    className="mt-3 pt-2 border-t flex items-center justify-between text-[11px] text-neutral-400"
                    style={{ borderColor: currentTheme.borderColor }}
                  >
                    <span className="flex items-center gap-1.5 truncate text-neutral-300">
                      <Music2
                        className="w-3 h-3 shrink-0"
                        style={{ color: currentTheme.primary }}
                      />
                      <span className="truncate">
                        Last: &ldquo;{item.lastPlayedTrackName}&rdquo;
                      </span>
                    </span>
                    {item.totalTracksCount && (
                      <span className="text-[10px] text-neutral-500 shrink-0 ml-2">
                        {item.totalTracksCount} tracks
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
