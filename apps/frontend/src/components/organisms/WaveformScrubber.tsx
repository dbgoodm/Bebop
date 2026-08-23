import React, { useMemo, useRef, useState } from 'react';
import { TrackItem } from '@/types';
import { useTheme } from '@/services/themeService';

interface WaveformScrubberProps {
  currentTrack: TrackItem;
  currentTimeSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
  isPlaying: boolean;
  height?: number;
  className?: string;
}

// Pseudo-random generator with seed for deterministic, realistic track waveform profiles
function pseudoRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// Generate authentic SoundCloud-style audio amplitude data
function generateSoundcloudWaveform(track: TrackItem, count: number = 160): number[] {
  let seed = 42;
  const str = `${track.title}-${track.artist}-${track.durationSeconds || 240}`;
  for (let i = 0; i < str.length; i++) {
    seed += str.charCodeAt(i) * (i + 1);
  }

  const data: number[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / count; // 0..1

    // Song structural dynamics (Intro -> Verse -> Build-up -> Drop/Chorus -> Bridge -> Outro)
    let structure = 0.4;
    if (progress < 0.08) {
      // Intro
      structure = 0.25 + (progress / 0.08) * 0.35;
    } else if (progress < 0.32) {
      // Verse 1
      structure = 0.55 + Math.sin(progress * 22) * 0.15;
    } else if (progress < 0.58) {
      // Chorus 1 / Energy peak
      structure = 0.88 + Math.sin(progress * 28) * 0.1;
    } else if (progress < 0.72) {
      // Breakdown / Bridge
      structure = 0.42 + Math.sin(progress * 14) * 0.12;
    } else if (progress < 0.92) {
      // Climax Drop / Final Chorus
      structure = 0.95 + Math.sin(progress * 32) * 0.05;
    } else {
      // Outro fade
      structure = Math.max(0.15, (1 - (progress - 0.92) / 0.08) * 0.65);
    }

    // Micro rhythmic spikes & audio transients
    const noise1 = pseudoRandom(seed + i * 4.3);
    const noise2 = pseudoRandom(seed + i * 8.7);
    const beatSnap = i % 4 === 0 ? 0.22 : i % 2 === 0 ? 0.1 : 0;

    const raw = structure * 0.65 + noise1 * 0.2 + noise2 * 0.15 + beatSnap;
    // Clamp between 0.15 and 1.0
    data.push(Math.max(0.15, Math.min(1.0, raw)));
  }

  return data;
}

export const WaveformScrubber: React.FC<WaveformScrubberProps> = ({
  currentTrack,
  currentTimeSeconds,
  durationSeconds,
  onSeek,
  isPlaying,
  height = 64,
  className = '',
}) => {
  const { currentTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Generate waveform array
  const bars = useMemo(() => {
    return generateSoundcloudWaveform(currentTrack, 150);
  }, [currentTrack.id, currentTrack.title, currentTrack.artist, currentTrack.durationSeconds]);

  const safeDuration = durationSeconds > 0 ? durationSeconds : 1;
  const progressRatio = Math.max(0, Math.min(1, currentTimeSeconds / safeDuration));

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setIsDragging(true);
    onSeek(ratio * safeDuration);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverRatio(ratio);
    if (isDragging) {
      onSeek(ratio * safeDuration);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // SoundCloud layout metrics
  // Top main wave: 68% height
  // Baseline gap: 2px
  // Bottom reflection wave: 28% height
  const topHeightMax = height * 0.68;
  const bottomHeightMax = height * 0.28;

  return (
    <div
      id="soundcloud-waveform-scrubber"
      className={`w-full relative select-none flex flex-col gap-2 ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setHoverRatio(null);
        setIsDragging(false);
      }}
    >
      {/* SoundCloud Waveform Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full relative cursor-pointer group rounded-xl px-3 py-2 flex flex-col justify-center shadow-lg transition-colors border overflow-visible"
        style={{
          height: `${height + 16}px`,
          backgroundColor: currentTheme.bgSurface,
          borderColor: currentTheme.borderColor,
        }}
      >
        {/* Upper Top Bars (Main Waveform) */}
        <div
          className="w-full flex items-end justify-between gap-[2px]"
          style={{ height: `${topHeightMax}px` }}
        >
          {bars.map((amp, idx) => {
            const barRatio = (idx + 0.5) / bars.length;
            const isPlayed = barRatio <= progressRatio;
            const isHoverSeek =
              hoverRatio !== null &&
              ((hoverRatio >= progressRatio &&
                barRatio > progressRatio &&
                barRatio <= hoverRatio) ||
                (hoverRatio < progressRatio &&
                  barRatio >= hoverRatio &&
                  barRatio <= progressRatio));

            const barHeight = Math.max(3, amp * topHeightMax);

            let barBg = currentTheme.waveformUnplayedTop;
            let boxShadow = undefined;
            if (isPlayed) {
              barBg = currentTheme.waveformPlayedTop;
              if (currentTheme.waveformGlow) {
                boxShadow = `0 0 6px ${currentTheme.accentGlow}`;
              }
            } else if (isHoverSeek) {
              barBg = currentTheme.secondary;
            }

            return (
              <div
                key={`top-${idx}`}
                className="flex-1 max-w-[3px] rounded-t-sm transition-colors duration-75"
                style={{
                  height: `${barHeight}px`,
                  backgroundColor: barBg,
                  boxShadow: boxShadow,
                }}
              />
            );
          })}
        </div>

        {/* 2px Baseline Divider Separator */}
        <div className="w-full h-[2px] bg-neutral-800/80 my-[1px] relative">
          {/* Played portion of baseline */}
          <div
            className="h-full transition-all duration-75"
            style={{
              width: `${progressRatio * 100}%`,
              backgroundColor: currentTheme.primary,
            }}
          />
        </div>

        {/* Lower Bottom Bars (SoundCloud Reflection / Inverted Waveform) */}
        <div
          className="w-full flex items-start justify-between gap-[2px]"
          style={{ height: `${bottomHeightMax}px` }}
        >
          {bars.map((amp, idx) => {
            const barRatio = (idx + 0.5) / bars.length;
            const isPlayed = barRatio <= progressRatio;
            const isHoverSeek =
              hoverRatio !== null &&
              ((hoverRatio >= progressRatio &&
                barRatio > progressRatio &&
                barRatio <= hoverRatio) ||
                (hoverRatio < progressRatio &&
                  barRatio >= hoverRatio &&
                  barRatio <= progressRatio));

            const barHeight = Math.max(2, amp * bottomHeightMax);

            let barBg = currentTheme.waveformUnplayedBot;
            if (isPlayed) {
              barBg = currentTheme.waveformPlayedBot;
            } else if (isHoverSeek) {
              barBg = currentTheme.waveformPlayedTop;
            }

            return (
              <div
                key={`bot-${idx}`}
                className="flex-1 max-w-[3px] rounded-b-sm transition-colors duration-75"
                style={{
                  height: `${barHeight}px`,
                  backgroundColor: barBg,
                }}
              />
            );
          })}
        </div>

        {/* SoundCloud Hover Cursor & Floating Time Flag */}
        {isHovering && hoverRatio !== null && (
          <div
            className="absolute top-1 bottom-1 w-[1.5px] bg-white pointer-events-none z-30 shadow-[0_0_8px_rgba(255,255,255,0.9)]"
            style={{ left: `calc(12px + ${hoverRatio} * (100% - 24px))` }}
          >
            {/* SoundCloud-style floating time tag badge */}
            <div
              className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-2xl whitespace-nowrap border"
              style={{
                backgroundColor: currentTheme.bgCanvas,
                borderColor: currentTheme.primary,
                color: currentTheme.primary,
              }}
            >
              {formatTime(hoverRatio * safeDuration)}
            </div>
          </div>
        )}

        {/* SoundCloud Playhead Marker Line */}
        <div
          className="absolute top-1 bottom-1 w-[2px] bg-white pointer-events-none z-20"
          style={{
            left: `calc(12px + ${progressRatio} * (100% - 24px))`,
            boxShadow: `0 0 10px ${currentTheme.primary}`,
          }}
        >
          {/* Top handle pill */}
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white shadow-md"
            style={{ backgroundColor: currentTheme.primary }}
          />
        </div>
      </div>

      {/* Time & Format Legend */}
      <div className="w-full flex items-center justify-between text-xs font-mono px-1">
        <span className="font-bold text-sm" style={{ color: currentTheme.primary }}>
          {formatTime(currentTimeSeconds)}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
          <span>SoundCloud Style Waveform</span>
        </div>
        <span className="text-neutral-300 font-medium text-sm">
          {currentTrack.duration || formatTime(safeDuration)}
        </span>
      </div>
    </div>
  );
};
