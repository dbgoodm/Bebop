import {
  commands,
  type AppError,
  type IntegrationSettings,
  type IntegrationStatus,
} from './tauri-bindings';
import { listen } from '@tauri-apps/api/event';

function unwrap<T>(result: { status: 'ok'; data: T } | { status: 'error'; error: AppError }): T {
  if (result.status === 'error') throw result.error;
  return result.data;
}

export async function loadIntegrations() {
  const [settings, statuses] = await Promise.all([
    commands.getIntegrationSettings(),
    commands.getIntegrationStatuses(),
  ]);
  return { settings: unwrap(settings), statuses: unwrap(statuses) };
}

export async function saveIntegrationSettings(settings: IntegrationSettings) {
  return unwrap(await commands.setIntegrationSettings(settings));
}

export async function connectLastFm(sessionKey: string): Promise<IntegrationStatus[]> {
  return unwrap(await commands.configureLastfmSession(sessionKey));
}

export async function disconnectLastFm(): Promise<IntegrationStatus[]> {
  return unwrap(await commands.disconnectLastfm());
}

export function subscribeIntegrationStatus(
  callback: (status: IntegrationStatus) => void,
): Promise<() => void> {
  return listen<IntegrationStatus>('integration://status', ({ payload }) => callback(payload));
}
