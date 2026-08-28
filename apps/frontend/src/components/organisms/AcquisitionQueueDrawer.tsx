import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DownloadCloud,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Music,
} from 'lucide-react';
import type { AcquisitionJobDto } from '@/types';
import {
  getAcquisitionQueue,
  cancelAcquisition,
  retryAcquisition,
  clearCompletedAcquisitions,
  onAcquisitionProgress,
  onAcquisitionCompleted,
  onAcquisitionFailed,
  onAcquisitionJobAdded,
} from '@/services/acquisitionService';
import { useTheme } from '@/services/themeService';

interface AcquisitionQueueDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  floatingPill?: boolean;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  const kb = bytesPerSec / 1024;
  return `${Math.round(kb)} KB/s`;
}

export const AcquisitionQueueDrawer: React.FC<AcquisitionQueueDrawerProps> = ({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  floatingPill = true,
}) => {
  const { currentTheme } = useTheme();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [jobs, setJobs] = useState<AcquisitionJobDto[]>([]);

  const isDrawerOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const toggleDrawer = () => {
    if (controlledOnClose && isDrawerOpen) {
      controlledOnClose();
    } else {
      setInternalIsOpen((prev) => !prev);
    }
  };

  const loadQueue = useCallback(async () => {
    try {
      const currentJobs = await getAcquisitionQueue();
      setJobs(currentJobs);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getAcquisitionQueue()
      .then((currentJobs) => {
        if (active) setJobs(currentJobs);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenCompleted: (() => void) | undefined;
    let unlistenFailed: (() => void) | undefined;
    let unlistenAdded: (() => void) | undefined;
    let active = true;

    void onAcquisitionJobAdded((job) => {
      if (!active) return;
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === job.id);
        return exists ? prev : [job, ...prev];
      });
    }).then((un) => {
      if (active) unlistenAdded = un;
      else un();
    });

    void onAcquisitionProgress((payload) => {
      if (!active) return;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === payload.jobId
            ? {
                ...j,
                percent: payload.percent,
                speedBytesPerSec: payload.speedBytesPerSec,
                status: (payload.stage as any) || 'downloading',
              }
            : j,
        ),
      );
    }).then((un) => {
      if (active) unlistenProgress = un;
      else un();
    });

    void onAcquisitionCompleted((payload) => {
      if (!active) return;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === payload.jobId
            ? {
                ...j,
                percent: 100,
                status: 'completed',
                completedAt: new Date().toISOString(),
                speedBytesPerSec: 0,
              }
            : j,
        ),
      );
    }).then((un) => {
      if (active) unlistenCompleted = un;
      else un();
    });

    void onAcquisitionFailed((payload) => {
      if (!active) return;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === payload.jobId
            ? {
                ...j,
                status: 'failed',
                errorMessage: payload.error,
                speedBytesPerSec: 0,
              }
            : j,
        ),
      );
    }).then((un) => {
      if (active) unlistenFailed = un;
      else un();
    });

    return () => {
      active = false;
      unlistenAdded?.();
      unlistenProgress?.();
      unlistenCompleted?.();
      unlistenFailed?.();
    };
  }, []);

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status === 'downloading' ||
          j.status === 'queued' ||
          j.status === 'resolving' ||
          j.status === 'tagging',
      ),
    [jobs],
  );

  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'completed'), [jobs]);
  const failedJobs = useMemo(() => jobs.filter((j) => j.status === 'failed'), [jobs]);

  const totalSpeed = useMemo(
    () => activeJobs.reduce((acc, j) => acc + (j.speedBytesPerSec || 0), 0),
    [activeJobs],
  );

  const handleCancel = async (jobId: string) => {
    await cancelAcquisition(jobId);
    void loadQueue();
  };

  const handleRetry = async (jobId: string) => {
    await retryAcquisition(jobId);
    void loadQueue();
  };

  const handleClearCompleted = async () => {
    await clearCompletedAcquisitions();
    void loadQueue();
  };

  return (
    <>
      {/* Floating Status Pill */}
      {floatingPill && !isDrawerOpen && (activeJobs.length > 0 || jobs.length > 0) && (
        <button
          type="button"
          onClick={toggleDrawer}
          style={{
            backgroundColor: '#0c1017ee',
            borderColor: activeJobs.length > 0 ? '#f59e0b' : '#334155',
          }}
          className="fixed bottom-24 right-6 z-40 flex items-center gap-2.5 px-3.5 py-2 t-control border shadow-2xl text-xs font-mono text-white hover:brightness-125 cursor-pointer backdrop-blur-md transition-all animate-fadeIn"
          title="Open Acquisition Queue"
        >
          {activeJobs.length > 0 ? (
            <>
              <DownloadCloud className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>
                Downloading {activeJobs.length} {activeJobs.length === 1 ? 'track' : 'tracks'}
              </span>
              <span className="text-neutral-400">•</span>
              <span className="text-amber-300 font-semibold">{formatSpeed(totalSpeed)}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{completedJobs.length} Acquired</span>
            </>
          )}
          <ChevronUp className="w-3.5 h-3.5 text-neutral-400 ml-1" />
        </button>
      )}

      {/* Expandable Acquisition Drawer Modal */}
      {isDrawerOpen && (
        <div
          id="acquisition-queue-drawer"
          className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] t-panel t-stroke border border-neutral-700/80 bg-[#0c1017]/95 backdrop-blur-xl shadow-2xl flex flex-col max-h-[500px] overflow-hidden font-sans text-neutral-200 animate-fadeIn"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-neutral-800 bg-[#080b10]">
            <div className="flex items-center gap-2">
              <DownloadCloud className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-white">
                Acquisition Queue
              </h3>
              {activeJobs.length > 0 && (
                <span className="px-1.5 py-0.2 t-sm bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/40">
                  {activeJobs.length} active
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {completedJobs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCompleted}
                  className="text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                  title="Clear finished downloads"
                >
                  Clear Completed
                </button>
              )}
              <button
                type="button"
                onClick={toggleDrawer}
                className="p-1 t-control text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
                title="Close queue"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Speed Header */}
          {activeJobs.length > 0 && (
            <div className="flex items-center justify-between px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs font-mono">
              <span className="text-neutral-300">Total Speed:</span>
              <span className="text-amber-400 font-bold">{formatSpeed(totalSpeed)}</span>
            </div>
          )}

          {/* Job List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/60 p-2 space-y-1">
            {jobs.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center text-neutral-500 gap-2">
                <DownloadCloud className="w-8 h-8 opacity-40" />
                <p className="text-xs">No active acquisitions.</p>
                <p className="text-[11px] text-neutral-600 max-w-[220px]">
                  Click "Get Track" or "Get Full Album" to download lossless audio.
                </p>
              </div>
            ) : (
              jobs.map((job) => {
                const isDownloading = job.status === 'downloading' || job.status === 'resolving';
                const isTagging = job.status === 'tagging';
                const isCompleted = job.status === 'completed';
                const isFailed = job.status === 'failed';
                const isQueued = job.status === 'queued';

                return (
                  <div
                    key={job.id}
                    className="p-2.5 t-card t-stroke bg-[#121620]/60 hover:bg-[#121620] border border-neutral-800/50 flex flex-col gap-1.5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className="text-xs font-semibold text-white truncate"
                          title={job.trackTitle}
                        >
                          {job.trackTitle}
                        </span>
                        <span className="text-[11px] text-neutral-400 truncate">
                          {job.artistName} {job.albumTitle ? `• ${job.albumTitle}` : ''}
                        </span>
                      </div>

                      {/* Status / Action Button */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isCompleted && (
                          <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </span>
                        )}

                        {isFailed && (
                          <button
                            type="button"
                            onClick={() => handleRetry(job.id)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 t-control bg-red-500/20 text-red-400 hover:text-red-300 text-[10px] font-mono border border-red-500/40 cursor-pointer"
                            title="Retry download"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}

                        {(isDownloading || isQueued || isTagging) && (
                          <button
                            type="button"
                            onClick={() => handleCancel(job.id)}
                            className="p-1 t-control text-neutral-400 hover:text-red-400 hover:bg-neutral-800 cursor-pointer"
                            title="Cancel download"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar and Status */}
                    {(isDownloading || isTagging || isQueued) && (
                      <div className="flex flex-col gap-1">
                        <div className="w-full bg-neutral-800 t-bar h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-400 h-full transition-all duration-300 t-bar"
                            style={{
                              width: `${Math.max(isQueued ? 5 : isTagging ? 90 : job.percent || 10, 5)}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                          <span>
                            {isQueued
                              ? 'Queued'
                              : isTagging
                                ? 'Embedding Tags & Lyrics…'
                                : `Downloading ${job.percent || 0}%`}
                          </span>
                          {isDownloading && job.speedBytesPerSec > 0 && (
                            <span className="text-amber-400">
                              {formatSpeed(job.speedBytesPerSec)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {isFailed && job.errorMessage && (
                      <span
                        className="text-[10px] font-mono text-red-400 truncate"
                        title={job.errorMessage}
                      >
                        {job.errorMessage}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
};
