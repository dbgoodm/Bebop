import React from 'react';
import {
  X,
  ListMusic,
  Play,
  Trash2,
  Shuffle,
  Volume2,
  Disc3,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Music2,
} from 'lucide-react';
import { TrackItem } from '@/types';

interface NowPlayingQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: TrackItem[];
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackItem) => void;
  onRemoveTrack: (index: number) => void;
  onMoveTrack?: (fromIndex: number, toIndex: number) => void;
  onClearQueue?: () => void;
  onShuffleQueue?: () => void;
  onSelectArtist?: (artistName: string) => void;
  onSelectAlbum?: (albumName: string) => void;
}

export const NowPlayingQueueModal: React.FC<NowPlayingQueueModalProps> = ({
  isOpen,
  onClose,
  queue,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onRemoveTrack,
  onMoveTrack,
  onClearQueue,
  onShuffleQueue,
  onSelectArtist,
  onSelectAlbum,
}) => {
  if (!isOpen) return null;

  // Calculate total duration in queue
  const totalQueueSeconds = queue.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
  const totalMinutes = Math.floor(totalQueueSeconds / 60);

  return (
    <div
      id="now-playing-queue-backdrop"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end transition-opacity font-sans"
      onClick={onClose}
    >
      <div
        id="now-playing-queue-drawer"
        className="w-full max-w-md bg-[#090d15] border-l border-neutral-800 h-full flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 bg-[#0c1019] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                  Playback Queue
                </h3>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-400 font-semibold">
                  {queue.length} Tracks
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                {totalMinutes} min total • Native Rust playback
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close Queue"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2.5 bg-[#0e131e] border-b border-neutral-800/80 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            {onShuffleQueue && (
              <button
                type="button"
                onClick={onShuffleQueue}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#151c2a] border border-neutral-800 hover:border-amber-500/40 text-neutral-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                <Shuffle className="w-3 h-3 text-amber-400" />
                <span>Shuffle</span>
              </button>
            )}
            {onClearQueue && queue.length > 1 && (
              <button
                type="button"
                onClick={onClearQueue}
                className="flex items-center gap-1 px-2 py-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Up Next</span>
              </button>
            )}
          </div>
          <span className="text-neutral-400">OS signal path reported</span>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Currently Playing Card */}
          {currentTrack && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                Now Playing
              </span>

              <div className="bg-[#131926] border border-amber-500/40 rounded-xl p-3.5 flex items-center gap-3 shadow-lg relative overflow-hidden">
                {/* Visualizer glow background */}
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent pointer-events-none" />

                <div className="w-12 h-12 rounded-lg bg-neutral-900 overflow-hidden shrink-0 border border-amber-500/40 relative group">
                  {currentTrack.coverUrl ? (
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-amber-400">
                      <Disc3 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                  {isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex items-end gap-0.5 h-4">
                        <span className="w-1 bg-amber-400 animate-pulse h-full rounded-full" />
                        <span className="w-1 bg-amber-400 animate-pulse h-2/3 rounded-full" />
                        <span className="w-1 bg-amber-400 animate-pulse h-4/5 rounded-full" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{currentTrack.title}</h4>
                  <p className="text-[11px] text-neutral-300 truncate mt-0.5">
                    {currentTrack.artist} • {currentTrack.album}
                  </p>
                  <div className="flex items-center gap-2 mt-1 font-mono text-[10px]">
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {currentTrack.codec} {currentTrack.sampleRate}
                    </span>
                    <span className="text-neutral-400">{currentTrack.duration}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Up Next List */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-mono flex items-center justify-between">
              <span>Up Next</span>
              <span className="text-[10px] text-neutral-400">{queue.length} in queue</span>
            </span>

            {queue.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 flex flex-col items-center justify-center">
                <Music2 className="w-8 h-8 opacity-40 mb-2" />
                <p className="text-xs">Your queue is empty.</p>
                <p className="text-[11px] text-neutral-600 mt-1">
                  Play an album or track to fill the queue.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {queue.map((track, idx) => {
                  const isCurrent = track.id === currentTrack?.id;
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      className={`group rounded-lg p-2.5 flex items-center gap-3 transition-colors border ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : 'bg-[#0e131d] border-neutral-800/80 hover:bg-[#131a27] hover:border-neutral-700 text-neutral-300'
                      }`}
                    >
                      {/* Index / Play action */}
                      <div className="w-6 text-center shrink-0">
                        <span className="text-xs font-mono text-neutral-500 group-hover:hidden">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPlayTrack(track)}
                          className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-black hover:scale-105 cursor-pointer mx-auto transition-transform"
                          title="Play Track"
                        >
                          <Play className="w-3 h-3 fill-black ml-0.5" />
                        </button>
                      </div>

                      {/* Cover art */}
                      <div className="w-9 h-9 rounded bg-neutral-900 overflow-hidden shrink-0 border border-neutral-800">
                        {track.coverUrl ? (
                          <img
                            src={track.coverUrl}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-600">
                            <Disc3 className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Track Details */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => onPlayTrack(track)}
                      >
                        <h5 className="text-xs font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                          {track.title}
                        </h5>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {track.artist} • {track.album}
                        </p>
                      </div>

                      {/* Actions & Duration */}
                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs text-neutral-400">
                        <span className="text-[11px]">{track.duration}</span>

                        {onMoveTrack && idx > 0 && (
                          <button
                            type="button"
                            onClick={() => onMoveTrack(idx, idx - 1)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-opacity cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {onMoveTrack && idx < queue.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onMoveTrack(idx, idx + 1)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-opacity cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onRemoveTrack(idx)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-opacity cursor-pointer"
                          title="Remove from Queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3.5 bg-[#080b11] border-t border-neutral-800 text-[11px] text-neutral-400 font-mono flex items-center justify-between">
          <span>Engine: Bit-Perfect ASIO/WASAPI</span>
          <span className="text-amber-400/90">Direct DAC Feed</span>
        </div>
      </div>
    </div>
  );
};
