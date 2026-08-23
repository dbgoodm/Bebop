import React, { useRef } from 'react';
import { Play, ChevronLeft, ChevronRight, Disc, HardDrive, Sparkles } from 'lucide-react';
import { RecentlyAddedItem, RecentlyAddedRailProps, AudioFormat } from '@/types';
import { LOCAL_RECENTLY_ADDED } from '@/demo/library';
import { useTheme } from '@/services/themeService';

export const RecentlyAddedRail: React.FC<RecentlyAddedRailProps> = ({
  items = LOCAL_RECENTLY_ADDED,
  onPlayItem,
  onItemClick,
  onSelectArtist,
  onSelectAlbum,
}) => {
  const { currentTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 320;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const getFormatBadge = (format: AudioFormat) => {
    if (format.startsWith('DSD')) {
      return (
        <span
          style={{
            backgroundColor: `${currentTheme.primary}20`,
            color: currentTheme.primary,
            borderColor: `${currentTheme.primary}60`,
          }}
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider"
        >
          {format}
        </span>
      );
    }
    if (format.includes('24/')) {
      return (
        <span
          style={{
            backgroundColor: `${currentTheme.secondary}20`,
            color: currentTheme.secondary,
            borderColor: `${currentTheme.secondary}60`,
          }}
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider"
        >
          {format}
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700 tracking-wider">
        {format}
      </span>
    );
  };

  return (
    <section id="recently-added-section" className="w-full flex flex-col gap-3 font-sans">
      {/* Section Header */}
      <div id="recently-added-header" className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-sm" style={{ backgroundColor: currentTheme.primary }} />
          <h2 className="text-sm font-bold tracking-wider text-neutral-200 uppercase font-serif">
            Recently Added
          </h2>
          <span className="text-xs text-neutral-500 font-normal">(Local Library Scans)</span>
        </div>

        {/* Scroll Controls */}
        <div className="flex items-center gap-1.5">
          <button
            id="recent-scroll-left"
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
            id="recent-scroll-right"
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

      {/* Horizontal Scrollable Rail without scrollbars */}
      <div
        ref={scrollContainerRef}
        id="recently-added-carousel"
        className="flex items-stretch gap-4 overflow-x-auto pb-1 pt-1 no-scrollbar snap-x"
      >
        {items.map((item) => (
          <div
            key={item.id}
            id={`recent-card-${item.id}`}
            onClick={() => onItemClick?.(item)}
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="group relative flex-none w-52 sm:w-56 border rounded-xl p-3 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer snap-start"
          >
            {/* Album Cover Art */}
            <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-neutral-900 mb-3 shadow-inner">
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                  <Disc className="w-12 h-12" />
                </div>
              )}

              {/* Format Badge Top Left */}
              <div className="absolute top-2 left-2">{getFormatBadge(item.format)}</div>

              {/* Quick Play Action Overlay Button */}
              <button
                id={`play-recent-${item.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayItem?.(item);
                }}
                style={{
                  backgroundColor: currentTheme.primary,
                  boxShadow: `0 4px 16px ${currentTheme.accentGlow}`,
                }}
                className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full text-black flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 cursor-pointer hover:scale-105 hover:brightness-110"
                aria-label={`Play ${item.title}`}
              >
                <Play className="w-4 h-4 fill-black ml-0.5" />
              </button>
            </div>

            {/* Item Metadata */}
            <div className="flex flex-col flex-1 justify-between">
              <div>
                <h3
                  className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover:opacity-90 transition-colors"
                  title={item.title}
                >
                  {item.title}
                </h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectArtist?.(item.artist);
                  }}
                  className="text-xs text-neutral-400 hover:underline mt-0.5 line-clamp-1 font-medium text-left cursor-pointer transition-colors"
                  style={{ color: currentTheme.textMuted }}
                  title={`View artist: ${item.artist}`}
                >
                  {item.artist}
                </button>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mt-1">
                  <span>{item.genre}</span>
                  {item.year && <span>• {item.year}</span>}
                </div>
              </div>

              {/* Local File Ingest Status */}
              <div
                className="mt-3 pt-2 border-t flex items-center justify-between text-[11px]"
                style={{ borderColor: currentTheme.borderColor }}
              >
                <span
                  className="font-semibold flex items-center gap-1"
                  style={{ color: currentTheme.primary }}
                >
                  <HardDrive className="w-3 h-3" style={{ color: currentTheme.primary }} />
                  {item.dateAddedText}
                </span>
                <span className="text-neutral-500">{item.trackCount} tracks</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
