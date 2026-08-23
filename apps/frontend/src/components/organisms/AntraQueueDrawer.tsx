import React from 'react';
import {
  X,
  DownloadCloud,
  CheckCircle2,
  Pause,
  Play,
  Trash2,
  Disc3,
  HardDrive,
  Activity,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAntraEngine } from '@/services/antraEngineService';
import { AntraQueueItem } from '@/types';

interface AntraQueueDrawerProps {
  onSelectAlbum?: (albumTitle: string) => void;
}

export const AntraQueueDrawer: React.FC<AntraQueueDrawerProps> = ({ onSelectAlbum }) => {
  const {
    queue,
    isDrawerOpen,
    setIsDrawerOpen,
    activeDownloadsCount,
    totalSpeed,
    pauseQueueItem,
    resumeQueueItem,
    cancelQueueItem,
    clearCompleted,
  } = useAntraEngine();

  if (!isDrawerOpen) return null;

  const downloadingItems = queue.filter(
    (item) => item.status === 'downloading' || item.status === 'verifying',
  );
  const queuedItems = queue.filter((item) => item.status === 'queued' || item.status === 'paused');
  const completedItems = queue.filter((item) => item.status === 'completed');

  return (
    <div
      id="antra-engine-drawer-overlay"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end transition-opacity duration-300 font-sans"
      onClick={() => setIsDrawerOpen(false)}
    >
      <div
        id="antra-engine-drawer-content"
        className="w-full max-w-lg bg-[#0a0d14] border-l border-neutral-800 h-full flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 bg-[#0c1018] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">DOWNLOAD QUEUE</h3>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
                  READY
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Bit-Perfect Remote Ingestion & Direct Local Storage
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close Download Queue"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real-time Telemetry Bar */}
        <div className="px-5 py-2.5 bg-[#0e131e] border-b border-neutral-800/80 flex items-center justify-between text-xs font-mono text-neutral-300">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-neutral-400">Speed:</span>
            <span className="text-amber-400 font-semibold">{totalSpeed}</span>
          </div>

          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400">Queue Tasks:</span>
            <span className="text-white font-semibold">{activeDownloadsCount} Active</span>
          </div>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {queue.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-500">
              <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 text-neutral-600">
                <HardDrive className="w-8 h-8 opacity-40" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-300">Download Queue Is Empty</h4>
              <p className="text-xs text-neutral-500 max-w-xs mt-1 leading-relaxed">
                Navigate to any artist discography to queue studio master releases for local
                storage.
              </p>
            </div>
          ) : (
            <>
              {/* Active Downloads Section */}
              {downloadingItems.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      Active Downloads ({downloadingItems.length})
                    </span>
                  </div>

                  {downloadingItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[#121722] border border-amber-500/30 rounded-xl p-4 flex flex-col gap-3.5 shadow-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 shrink-0 border border-neutral-700">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.albumTitle}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-500">
                              <Disc3 className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">
                            {item.albumTitle}
                          </h4>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {item.artistName} • {item.year}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-semibold border border-amber-500/30">
                              {item.formatBadge}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {item.fileSize}
                            </span>
                          </div>
                        </div>

                        {/* Prominent % to completion & cancel button */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <div className="text-sm sm:text-base font-extrabold font-mono text-amber-400 leading-tight">
                              {item.progress}%
                            </div>
                            <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-400">
                              {item.status === 'verifying' ? 'Verifying' : 'Complete'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => cancelQueueItem(item.id)}
                            className="p-1.5 rounded bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-300 transition-colors cursor-pointer"
                            title="Cancel Download"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar & Status */}
                      <div className="flex flex-col gap-1.5">
                        <div className="w-full h-2.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              item.status === 'verifying'
                                ? 'bg-gradient-to-r from-amber-400 to-emerald-400 animate-pulse'
                                : 'bg-gradient-to-r from-amber-500 to-amber-300 shadow-sm shadow-amber-500/50'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono mt-0.5">
                          <span className="text-amber-300 font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {item.status === 'verifying'
                              ? 'Verifying Bit-Perfect Checksum...'
                              : `${item.bytesDownloaded} (${item.progress}%)`}
                          </span>
                          <span className="text-neutral-400">
                            {item.downloadSpeed} • {item.estimatedTime}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Queued Items Section */}
              {queuedItems.length > 0 && (
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-mono">
                    Queued ({queuedItems.length})
                  </span>

                  {queuedItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="bg-[#0f141f] border border-neutral-800/80 rounded-lg p-3 flex items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-neutral-500 w-4 text-center">
                          #{idx + 1}
                        </span>

                        <div className="w-9 h-9 rounded bg-neutral-900 shrink-0 overflow-hidden border border-neutral-800">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.albumTitle}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-600">
                              <Disc3 className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h5 className="text-xs font-semibold text-neutral-200 truncate">
                            {item.albumTitle}
                          </h5>
                          <p className="text-[10px] text-neutral-400 font-mono truncate">
                            {item.artistName} • {item.formatBadge} • {item.fileSize}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {item.status === 'paused' ? (
                          <button
                            type="button"
                            onClick={() => resumeQueueItem(item.id)}
                            className="p-1 rounded text-neutral-400 hover:text-emerald-400 transition-colors cursor-pointer"
                            title="Resume"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => pauseQueueItem(item.id)}
                            className="p-1 rounded text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer"
                            title="Pause"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => cancelQueueItem(item.id)}
                          className="p-1 rounded text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Completed Ingests Section */}
              {completedItems.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Downloaded to Local Storage ({completedItems.length})
                    </span>

                    <button
                      type="button"
                      onClick={clearCompleted}
                      className="text-[11px] text-neutral-400 hover:text-neutral-200 font-mono cursor-pointer transition-colors"
                    >
                      Clear Completed
                    </button>
                  </div>

                  {completedItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[#0c1417]/80 border border-emerald-500/20 rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded bg-neutral-900 shrink-0 overflow-hidden border border-emerald-500/40">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.albumTitle}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-emerald-500">
                              <Disc3 className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h5 className="text-xs font-semibold text-neutral-200 truncate">
                            {item.albumTitle}
                          </h5>
                          <p className="text-[10px] text-emerald-400/90 font-mono truncate">
                            Downloaded ({item.fileSize}) • Ready for Bit-Perfect Playback
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawerOpen(false);
                          onSelectAlbum?.(item.albumTitle);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-mono border border-emerald-500/30 transition-colors cursor-pointer shrink-0"
                      >
                        <span>View</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-[#080b11] border-t border-neutral-800 text-[11px] text-neutral-400 font-mono flex items-center justify-between">
          <span>Target Directory: /Volumes/Lossless-Drive/Library</span>
          <span className="text-amber-400/80">Bit-Perfect Storage Sink</span>
        </div>
      </div>
    </div>
  );
};
