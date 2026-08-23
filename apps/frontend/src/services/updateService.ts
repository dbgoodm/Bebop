import { listen } from '@tauri-apps/api/event';
import { commands, type AppError, type UpdateProgress, type UpdateStatus } from './tauri-bindings';

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: AppError }): T {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function checkForUpdates() {
  return unwrap(await commands.checkForUpdates());
}

export async function installUpdate() {
  return unwrap(await commands.installUpdate(true));
}

export function subscribeUpdateStatus(
  callback: (status: UpdateStatus) => void,
): Promise<() => void> {
  return listen<UpdateStatus>('update://status', ({ payload }) => callback(payload));
}

export function subscribeUpdateProgress(
  callback: (progress: UpdateProgress) => void,
): Promise<() => void> {
  return listen<UpdateProgress>('update://progress', ({ payload }) => callback(payload));
}
