import { isDemoMode } from '@/demo/mode';

/** Keeps feature gating at the page boundary instead of inside presentation components. */
export function useDemoMode() {
  return isDemoMode;
}
