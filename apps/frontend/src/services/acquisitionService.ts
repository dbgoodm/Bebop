import { listen } from '@tauri-apps/api/event';
import {
  commands,
  type AcquisitionJob,
  type AcquisitionSearchFile,
  type AcquisitionSettings,
  type AppError,
} from './tauri-bindings';

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: AppError }): T {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function loadAcquisition() {
  const [settings, jobs] = await Promise.all([
    commands.getAcquisitionSettings(),
    commands.listAcquisitionJobs(),
  ]);
  return { settings: unwrap(settings), jobs: unwrap(jobs) };
}

export async function saveAcquisitionSettings(settings: AcquisitionSettings) {
  return unwrap(await commands.setAcquisitionSettings(settings));
}

export async function storeSlskdApiKey(apiKey: string) {
  return unwrap(await commands.configureSlskdApiKey(apiKey));
}

export async function disconnectSlskd() {
  return unwrap(await commands.disconnectSlskd());
}

export async function testSlskd() {
  return unwrap(await commands.testSlskdConnection());
}

export async function searchSlskd(query: string) {
  return unwrap(await commands.searchAcquisition(query));
}

export async function refreshSlskdSearch(searchId: string) {
  return unwrap(await commands.getAcquisitionSearch(searchId));
}

export async function enqueueSlskdFile(
  searchId: string,
  sourceUser: string,
  file: AcquisitionSearchFile,
) {
  return unwrap(await commands.enqueueAcquisition(searchId, sourceUser, file));
}

export async function listAcquisitionJobs() {
  return unwrap(await commands.listAcquisitionJobs());
}

export async function pauseAcquisition(jobId: string) {
  return unwrap(await commands.pauseAcquisition(jobId));
}

export async function resumeAcquisition(jobId: string) {
  return unwrap(await commands.resumeAcquisition(jobId));
}

export async function cancelAcquisition(jobId: string) {
  return unwrap(await commands.cancelAcquisition(jobId));
}

export async function importAcquisition(jobId: string, rootId: string) {
  return unwrap(await commands.importAcquisition(jobId, rootId));
}

export function subscribeAcquisitionProgress(
  callback: (job: AcquisitionJob) => void,
): Promise<() => void> {
  return listen<AcquisitionJob>('acquisition://progress', ({ payload }) => callback(payload));
}
