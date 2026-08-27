import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AcquisitionAlbumRequest,
  AcquisitionCompletedPayload,
  AcquisitionFailedPayload,
  AcquisitionJobDto,
  AcquisitionProgressPayload,
  AcquisitionSettings,
  AcquisitionTrackRequest,
} from '@/types';
import { isDemoMode } from '@/demo/mode';

const DEFAULT_ACQUISITION_SETTINGS: AcquisitionSettings = {
  preferredQuality: 'hi-res-24',
  destinationFolder: null,
  namingPattern: '{Artist}/{Album}/{TrackNumber} - {Title}',
  concurrencyLimit: 2,
  deezerArl: '',
  qobuzUserAuthToken: '',
  qobuzAppId: '',
};

const SETTINGS_STORAGE_KEY = 'bebop_acquisition_settings';

function safeGetStorage(key: string): string | null {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return null;
}

function safeSetStorage(key: string, value: string): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }
}

// In-memory queue state for demo/fallback mode
let mockQueue: AcquisitionJobDto[] = [];
let mockJobCounter = 1;
const progressListeners = new Set<(payload: AcquisitionProgressPayload) => void>();
const completedListeners = new Set<(payload: AcquisitionCompletedPayload) => void>();
const failedListeners = new Set<(payload: AcquisitionFailedPayload) => void>();
const jobAddedListeners = new Set<(payload: AcquisitionJobDto) => void>();

function notifyProgress(payload: AcquisitionProgressPayload) {
  progressListeners.forEach((cb) => cb(payload));
}

function notifyCompleted(payload: AcquisitionCompletedPayload) {
  completedListeners.forEach((cb) => cb(payload));
}

function notifyFailed(payload: AcquisitionFailedPayload) {
  failedListeners.forEach((cb) => cb(payload));
}

function notifyJobAdded(payload: AcquisitionJobDto) {
  jobAddedListeners.forEach((cb) => cb(payload));
}

let activeSimulations: ReturnType<typeof setInterval>[] = [];

export function clearSimulatedAcquisitions(): void {
  activeSimulations.forEach((timer) => clearInterval(timer));
  activeSimulations = [];
  mockQueue = [];
}

function simulateJob(job: AcquisitionJobDto) {
  let percent = 0;
  const interval = setInterval(() => {
    percent += 20;
    if (percent < 100) {
      job.percent = percent;
      job.status = percent < 80 ? 'downloading' : 'tagging';
      job.speedBytesPerSec = 4_500_000 + Math.floor(Math.random() * 500_000);
      notifyProgress({
        jobId: job.id,
        trackId: job.trackId,
        remoteTrackId: job.remoteTrackId,
        percent: job.percent,
        speedBytesPerSec: job.speedBytesPerSec,
        stage: job.status,
      });
    } else {
      clearInterval(interval);
      activeSimulations = activeSimulations.filter((t) => t !== interval);
      job.percent = 100;
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.speedBytesPerSec = 0;
      notifyProgress({
        jobId: job.id,
        trackId: job.trackId,
        remoteTrackId: job.remoteTrackId,
        percent: 100,
        speedBytesPerSec: 0,
        stage: 'completed',
      });
      notifyCompleted({
        jobId: job.id,
        trackId: job.trackId,
        remoteTrackId: job.remoteTrackId,
        localTrackId: job.trackId || `local-${job.id}`,
        filePath: `/music/${job.artistName}/${job.albumTitle}/${job.trackTitle}.flac`,
      });
    }
  }, 400);

  activeSimulations.push(interval);
}

export async function getAcquisitionSettings(): Promise<AcquisitionSettings> {
  if (isDemoMode) {
    const saved = safeGetStorage(SETTINGS_STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_ACQUISITION_SETTINGS, ...JSON.parse(saved) };
      } catch {
        // use default
      }
    }
    return DEFAULT_ACQUISITION_SETTINGS;
  }

  try {
    const result = await invoke<AcquisitionSettings>('get_acquisition_settings');
    return result;
  } catch {
    const saved = safeGetStorage(SETTINGS_STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_ACQUISITION_SETTINGS, ...JSON.parse(saved) };
      } catch {
        // use default
      }
    }
    return DEFAULT_ACQUISITION_SETTINGS;
  }
}

export async function saveAcquisitionSettings(
  settings: AcquisitionSettings,
): Promise<AcquisitionSettings> {
  safeSetStorage(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  if (!isDemoMode) {
    try {
      await invoke('save_acquisition_settings', { settings });
    } catch {
      // ignore backend error if not implemented yet
    }
  }
  return settings;
}

export async function getAcquisitionQueue(): Promise<AcquisitionJobDto[]> {
  if (isDemoMode) {
    return [...mockQueue];
  }
  try {
    const jobs = await invoke<AcquisitionJobDto[]>('get_acquisition_queue');
    return jobs;
  } catch {
    return [...mockQueue];
  }
}

export async function acquireTrack(request: AcquisitionTrackRequest): Promise<AcquisitionJobDto> {
  if (!isDemoMode) {
    try {
      const job = await invoke<AcquisitionJobDto>('acquire_track', { request });
      notifyJobAdded(job);
      return job;
    } catch {
      // Fall back to simulated job
    }
  }

  const job: AcquisitionJobDto = {
    id: `job-${mockJobCounter++}`,
    trackTitle: request.trackTitle,
    artistName: request.artistName,
    albumTitle: request.albumTitle || 'Unknown Album',
    status: 'queued',
    percent: 0,
    speedBytesPerSec: 0,
    createdAt: new Date().toISOString(),
    trackId: request.remoteTrackId,
    remoteTrackId: request.remoteTrackId,
  };

  mockQueue.unshift(job);
  notifyJobAdded(job);
  setTimeout(() => simulateJob(job), 100);
  return job;
}

export async function acquireAlbum(request: AcquisitionAlbumRequest): Promise<AcquisitionJobDto[]> {
  if (!isDemoMode) {
    try {
      const jobs = await invoke<AcquisitionJobDto[]>('acquire_album', { request });
      jobs.forEach(notifyJobAdded);
      return jobs;
    } catch {
      // Fall back to acquiring each track
    }
  }

  const tracks = request.tracks || [];
  if (tracks.length === 0) {
    const singleJob = await acquireTrack({
      trackTitle: `Full Album: ${request.albumTitle}`,
      artistName: request.artistName,
      albumTitle: request.albumTitle,
      remoteReleaseId: request.remoteReleaseId,
    });
    return [singleJob];
  }

  const createdJobs: AcquisitionJobDto[] = [];
  for (const trackReq of tracks) {
    const job = await acquireTrack({
      ...trackReq,
      artistName: trackReq.artistName || request.artistName,
      albumTitle: trackReq.albumTitle || request.albumTitle,
      remoteReleaseId: trackReq.remoteReleaseId || request.remoteReleaseId,
    });
    createdJobs.push(job);
  }
  return createdJobs;
}

export async function cancelAcquisition(jobId: string): Promise<boolean> {
  if (!isDemoMode) {
    try {
      await invoke('cancel_acquisition', { jobId });
      return true;
    } catch {
      // continue to mock fallback
    }
  }

  const job = mockQueue.find((j) => j.id === jobId);
  if (job) {
    job.status = 'cancelled';
    notifyProgress({
      jobId: job.id,
      trackId: job.trackId,
      remoteTrackId: job.remoteTrackId,
      percent: job.percent,
      speedBytesPerSec: 0,
      stage: 'cancelled',
    });
    return true;
  }
  return false;
}

export async function retryAcquisition(jobId: string): Promise<boolean> {
  if (!isDemoMode) {
    try {
      await invoke('retry_acquisition', { jobId });
      return true;
    } catch {
      // continue to mock fallback
    }
  }

  const job = mockQueue.find((j) => j.id === jobId);
  if (job) {
    job.status = 'queued';
    job.percent = 0;
    job.errorMessage = null;
    setTimeout(() => simulateJob(job), 100);
    return true;
  }
  return false;
}

export async function clearCompletedAcquisitions(): Promise<void> {
  mockQueue = mockQueue.filter((j) => j.status !== 'completed' && j.status !== 'cancelled');
}

/** Subscribe to live download progress */
export async function onAcquisitionProgress(
  callback: (payload: AcquisitionProgressPayload) => void,
): Promise<UnlistenFn> {
  progressListeners.add(callback);
  let tauriUnlisten: UnlistenFn | undefined;
  try {
    tauriUnlisten = await listen<AcquisitionProgressPayload>('acquisition://progress', (event) => {
      callback(event.payload);
    });
  } catch {
    // Tauri event listener not available in web mode
  }

  return () => {
    progressListeners.delete(callback);
    tauriUnlisten?.();
  };
}

/** Subscribe to download completed events */
export async function onAcquisitionCompleted(
  callback: (payload: AcquisitionCompletedPayload) => void,
): Promise<UnlistenFn> {
  completedListeners.add(callback);
  let tauriUnlisten: UnlistenFn | undefined;
  try {
    tauriUnlisten = await listen<AcquisitionCompletedPayload>(
      'acquisition://completed',
      (event) => {
        callback(event.payload);
      },
    );
  } catch {
    // Tauri event listener not available in web mode
  }

  return () => {
    completedListeners.delete(callback);
    tauriUnlisten?.();
  };
}

/** Subscribe to download failed events */
export async function onAcquisitionFailed(
  callback: (payload: AcquisitionFailedPayload) => void,
): Promise<UnlistenFn> {
  failedListeners.add(callback);
  let tauriUnlisten: UnlistenFn | undefined;
  try {
    tauriUnlisten = await listen<AcquisitionFailedPayload>('acquisition://failed', (event) => {
      callback(event.payload);
    });
  } catch {
    // Tauri event listener not available in web mode
  }

  return () => {
    failedListeners.delete(callback);
    tauriUnlisten?.();
  };
}

/** Subscribe to new job added events */
export async function onAcquisitionJobAdded(
  callback: (payload: AcquisitionJobDto) => void,
): Promise<UnlistenFn> {
  jobAddedListeners.add(callback);
  let tauriUnlisten: UnlistenFn | undefined;
  try {
    tauriUnlisten = await listen<AcquisitionJobDto>('acquisition://job-added', (event) => {
      callback(event.payload);
    });
  } catch {
    // Tauri event listener not available in web mode
  }

  return () => {
    jobAddedListeners.delete(callback);
    tauriUnlisten?.();
  };
}
