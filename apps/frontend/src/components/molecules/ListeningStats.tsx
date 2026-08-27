import React from 'react';
import {
  Clock,
  Music,
  Users,
  Disc3,
  Hourglass,
  Sparkles,
  Radio,
  History,
  HardDrive,
  Award,
  Quote,
} from 'lucide-react';
import { ListeningStatsData } from '@/types';
import { useTheme } from '@/services/themeService';

const DEFAULT_STATS: ListeningStatsData = {
  timeListened: '348h 12m',
  timeListenedGrowth: '14% this month',
  totalTracks: '4,812',
  verifiedLocal: '100% Bit-Perfect Local',
  totalArtists: '342',
  artistsCachedStatus: 'All Bios Cached',
  totalAlbums: '618',
  albumsMastering: 'FLAC / DSD Mastered',
  libraryDuration: '312h 45m',
  libraryDurationSub: '18 seconds total',
  mostListenedArtist: 'The Seatbelts',
  artistLosslessHours: '142 Lossless Hours Played',
  topGenre: 'Bebop & Jazz Fusion',
  topGenrePercentage: '46% of Total Playtime',
  favoriteEra: '1958 — 1968 Hard Bop',
  dynamicRange: 'Avg Dynamic Range DR15.2',
  libraryDiskSize: '1.42 TB Local',
  losslessPercentage: '98.4% Hi-Res Lossless',
};

export interface ListeningStatsProps {
  stats?: Partial<ListeningStatsData>;
  onCardClick?: (statKey: string) => void;
  showAffinityMetrics?: boolean;
}

export const ListeningStats: React.FC<ListeningStatsProps> = ({
  stats: userStats,
  onCardClick,
  showAffinityMetrics = true,
}) => {
  const { currentTheme } = useTheme();
  const stats = { ...DEFAULT_STATS, ...userStats };
  const { statsColors } = currentTheme;

  const topRowMetrics = [
    {
      id: 'time-listened',
      label: 'TIME LISTENED',
      value: stats.timeListened,
      icon: Clock,
      colorConfig: statsColors?.timeListened || {
        borderTop: currentTheme.primary,
        badgeBg: `${currentTheme.primary}20`,
        badgeText: currentTheme.primary,
        glow: currentTheme.accentGlow,
        accentBar: currentTheme.primary,
      },
    },
    {
      id: 'total-tracks',
      label: 'TOTAL TRACKS',
      value: stats.totalTracks,
      icon: Music,
      colorConfig: statsColors?.totalTracks || {
        borderTop: currentTheme.secondary,
        badgeBg: `${currentTheme.secondary}20`,
        badgeText: currentTheme.secondary,
        glow: `${currentTheme.secondary}40`,
        accentBar: currentTheme.secondary,
      },
    },
    {
      id: 'artists-in-library',
      label: 'ARTISTS IN LIBRARY',
      value: stats.totalArtists,
      icon: Users,
      colorConfig: statsColors?.artists || {
        borderTop: '#818cf8',
        badgeBg: 'rgba(129, 140, 248, 0.2)',
        badgeText: '#a5b4fc',
        glow: 'rgba(129, 140, 248, 0.4)',
        accentBar: '#818cf8',
      },
    },
    {
      id: 'albums',
      label: 'ALBUMS',
      value: stats.totalAlbums,
      icon: Disc3,
      colorConfig: statsColors?.albums || {
        borderTop: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.2)',
        badgeText: '#fca5a5',
        glow: 'rgba(239, 68, 68, 0.4)',
        accentBar: '#ef4444',
      },
    },
    {
      id: 'library-duration',
      label: 'LIBRARY DURATION',
      value: stats.libraryDuration,
      icon: Hourglass,
      colorConfig: statsColors?.duration || {
        borderTop: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.2)',
        badgeText: '#6ee7b7',
        glow: 'rgba(16, 185, 129, 0.4)',
        accentBar: '#10b981',
      },
    },
  ];

  const bottomRowMetrics = [
    {
      id: 'most-listened-artist',
      label: 'TOP ARTIST AFFINITY',
      value: stats.mostListenedArtist,
      icon: Award,
      badgeColor: currentTheme.primary,
    },
    {
      id: 'top-genre-affinity',
      label: 'ACOUSTIC SPECTRUM',
      value: stats.topGenre,
      icon: Radio,
      badgeColor: currentTheme.secondary,
    },
    {
      id: 'favorite-acoustic-era',
      label: 'FAVORITE MASTERS ERA',
      value: stats.favoriteEra,
      icon: History,
      badgeColor: currentTheme.accentTertiary || '#c084fc',
    },
    {
      id: 'library-size-disk',
      label: 'STORAGE ON DISK',
      value: stats.libraryDiskSize,
      icon: HardDrive,
      badgeColor: '#10b981',
    },
  ];

  return (
    <section id="listening-stats-section" className="w-full flex flex-col gap-3 font-sans">
      {/* Theme Persona & Character Banner (if available) */}
      {currentTheme.character && currentTheme.tagline && (
        <div
          id="theme-persona-banner"
          style={{
            backgroundColor: currentTheme.bgCard,
            borderColor: currentTheme.borderColor,
            background: currentTheme.cardGradient || currentTheme.bgCard,
          }}
          className={`w-full px-4 py-2.5 border ${currentTheme.cardRadius} flex flex-wrap items-center justify-between gap-3 shadow-md transition-all duration-300`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="px-2.5 py-1 rounded text-xs font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 border"
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                color: currentTheme.primary,
                borderColor: `${currentTheme.primary}60`,
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{currentTheme.character}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs italic text-neutral-300">
              <Quote className="w-3 h-3 text-neutral-400 shrink-0" />
              <span className="font-serif tracking-wide">&ldquo;{currentTheme.tagline}&rdquo;</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <span className="hidden sm:inline">THEME ACTIVE:</span>
            <span
              className="font-bold px-2 py-0.5 rounded border"
              style={{
                backgroundColor: `${currentTheme.secondary}15`,
                color: currentTheme.secondary,
                borderColor: `${currentTheme.secondary}40`,
              }}
            >
              {currentTheme.name}
            </span>
          </div>
        </div>
      )}

      {/* Top Row: 5 Core Library Metric Cards with Rich Colors & Borders */}
      <div
        id="stats-top-row"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        {topRowMetrics.map((item) => {
          const IconComponent = item.icon;
          return (
            <div
              key={item.id}
              id={`metric-card-${item.id}`}
              onClick={() => onCardClick?.(item.id)}
              style={{
                backgroundColor: currentTheme.bgCard,
                borderColor: currentTheme.borderColor,
                borderTopColor: item.colorConfig.borderTop,
                borderTopWidth: '3px',
                background: currentTheme.cardGradient || currentTheme.bgCard,
              }}
              className={`group border ${currentTheme.cardRadius} p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer select-none`}
            >
              {/* Card Header: Label & Themed Icon */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase truncate"
                  style={{ color: currentTheme.textMuted }}
                >
                  {item.label}
                </span>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 transition-transform group-hover:scale-110"
                  style={{
                    backgroundColor: item.colorConfig.badgeBg,
                    borderColor: `${item.colorConfig.borderTop}50`,
                    color: item.colorConfig.badgeText,
                  }}
                >
                  <IconComponent className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Card Body: Big Value */}
              <div className="my-2 flex items-baseline gap-1.5">
                <span
                  className="text-2xl lg:text-3xl font-extrabold tracking-tight"
                  style={{
                    color: currentTheme.textPrimary,
                    textShadow: `0 0 20px ${item.colorConfig.glow}`,
                  }}
                >
                  {item.value}
                </span>
              </div>

            </div>
          );
        })}
      </div>

      {/* Bottom Row: 4 Affinity & System Metrics with Custom Badges */}
      {showAffinityMetrics && (
        <div id="stats-bottom-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {bottomRowMetrics.map((item) => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.id}
                id={`metric-card-${item.id}`}
                onClick={() => onCardClick?.(item.id)}
                style={{
                  backgroundColor: currentTheme.bgCard,
                  borderColor: currentTheme.borderColor,
                  background: currentTheme.cardGradient || currentTheme.bgCard,
                }}
                className={`group border ${currentTheme.cardRadius} p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer select-none`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase truncate"
                    style={{ color: currentTheme.textMuted }}
                  >
                    {item.label}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.badgeColor }}
                    aria-hidden="true"
                  />
                </div>

                <div className="my-2.5 flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-110"
                    style={{
                      backgroundColor: `${item.badgeColor}18`,
                      borderColor: `${item.badgeColor}60`,
                      color: item.badgeColor,
                    }}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <span
                    className="text-lg lg:text-xl font-extrabold tracking-tight line-clamp-1"
                    style={{ color: currentTheme.textPrimary }}
                  >
                    {item.value}
                  </span>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
