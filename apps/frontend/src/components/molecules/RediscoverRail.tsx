import React, { useRef } from 'react';
import {
  Play,
  ChevronLeft,
  ChevronRight,
  History,
  Disc3,
  ListMusic,
  User,
  Sparkles,
} from 'lucide-react';
import { RediscoverItem, RediscoverRailProps } from '@/types';
import { LOCAL_REDISCOVER_ITEMS } from '@/demo/library';
import { useTheme } from '@/services/themeService';

export const RediscoverRail: React.FC<RediscoverRailProps> = ({
  items = LOCAL_REDISCOVER_ITEMS,
  onPlayItem,
  onItemClick,
  onSelectArtist,
  onSelectAlbum,
  onContextMenu,
}) => {
  const { currentTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 340;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const getTypeBadge = (type: RediscoverItem['type']) => {
    switch (type) {
      case 'album':
        return (
          <span
            style={{
              backgroundColor: `${currentTheme.primary}20`,
              color: currentTheme.primary,
              borderColor: `${currentTheme.primary}60`,
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 t-sm text-[10px] font-bold uppercase tracking-wider border"
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
            className="inline-flex items-center gap-1 px-2 py-0.5 t-sm text-[10px] font-bold uppercase tracking-wider border"
          >
            <User className="w-3 h-3" />
            Artist
          </span>
        );
      case 'playlist':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 t-sm text-[10px] font-bold uppercase tracking-wider bg-blue-950/90 text-blue-300 border border-blue-800/60">
            <ListMusic className="w-3 h-3" />
            Playlist
          </span>
        );
    }
  };

  return (
    <section id="rediscover-section" className="w-full flex flex-col gap-3 font-sans">
      {/* Section Header */}
      <div id="rediscover-header" className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 t-sm" style={{ backgroundColor: currentTheme.primary }} />
          <h2 className="text-sm text-neutral-200 t-heading">Rediscover</h2>
          <span className="text-xs text-neutral-500 font-normal">
            (Unplayed Local Favorites & Deep Cuts)
          </span>
        </div>

        {/* Scroll Controls */}
        <div className="flex items-center gap-1.5">
          <button
            id="rediscover-scroll-left"
            type="button"
            onClick={() => handleScroll('left')}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="w-8 h-8 t-control border text-neutral-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer hover:brightness-125"
            aria-label="Scroll Left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            id="rediscover-scroll-right"
            type="button"
            onClick={() => handleScroll('right')}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="w-8 h-8 t-control border text-neutral-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer hover:brightness-125"
            aria-label="Scroll Right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Rail without scrollbars */}
      <div
        ref={scrollContainerRef}
        id="rediscover-carousel"
        className="flex items-stretch gap-4 overflow-x-auto pb-1 pt-1 no-scrollbar snap-x"
      >
        {items.map((item) => (
          <div
            key={item.id}
            id={`rediscover-card-${item.id}`}
            onClick={() => onItemClick?.(item)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu?.(item, e);
            }}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="group relative flex-none w-72 sm:w-80 border t-card t-stroke overflow-hidden flex flex-col justify-between transition-all duration-200 t-lift hover:shadow-xl cursor-pointer snap-start"
          >
            {/* Media Cover Image Banner */}
            <div className="relative h-36 w-full overflow-hidden bg-neutral-900">
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                  <Disc3 className="w-12 h-12" />
                </div>
              )}

              {/* Gradient Scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c1017] via-black/20 to-black/50" />

              {/* Top Badges: Type & Time since last heard */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                {getTypeBadge(item.type)}
                <span
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    color: currentTheme.primary,
                    borderColor: `${currentTheme.primary}60`,
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold backdrop-blur-sm px-2 py-0.5 t-sm border"
                >
                  <History className="w-3 h-3" style={{ color: currentTheme.primary }} />
                  {item.lastPlayedText}
                </span>
              </div>

              {/* Play Button Overlay */}
              <button
                id={`play-rediscover-${item.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayItem?.(item);
                }}
                style={{
                  backgroundColor: currentTheme.primary,
                  boxShadow: `0 4px 16px ${currentTheme.accentGlow}`,
                }}
                className="absolute right-3 bottom-3 w-11 h-11 t-btn text-black flex items-center justify-center shadow-lg transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer hover:scale-105 hover:brightness-110"
                aria-label={`Rediscover ${item.title}`}
              >
                <Play className="w-5 h-5 fill-black ml-0.5" />
              </button>
            </div>

            {/* Content Details & Local Highlight Insight */}
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
                            className="hover:underline cursor-pointer transition-colors text-left"
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
                      className="hover:underline cursor-pointer transition-colors text-left"
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

              {/* Local Insight Tag (e.g. #1 played in 2024, High completion rate) */}
              <div
                className="mt-3 pt-2.5 border-t flex items-center justify-between gap-2"
                style={{ borderColor: currentTheme.borderColor }}
              >
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium truncate"
                  style={{ color: currentTheme.primary }}
                >
                  <Sparkles
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: currentTheme.primary }}
                  />
                  <span className="truncate">{item.highlightReason}</span>
                </div>
                <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                  {item.totalPlayCount} plays
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
