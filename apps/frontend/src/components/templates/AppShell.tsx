import type { ReactNode } from 'react';
import { ThemeAmbience } from '@/components/atoms/ThemeAmbience';

interface AppShellProps {
  background: string;
  children: ReactNode;
}

/**
 * Layout-only template shared by route-level pages.
 *
 * Owns the theme's ambient texture layers and the body typography token, so a
 * theme can change the app's font and atmosphere without any page knowing.
 */
export function AppShell({ background, children }: AppShellProps) {
  return (
    <main
      className="win-round relative min-h-screen px-8 py-12 text-neutral-100"
      style={{
        background,
        fontFamily: 'var(--f-b, inherit)',
        cursor: 'var(--cursor, auto)',
      }}
    >
      <ThemeAmbience />
      <div className="relative z-10">{children}</div>
    </main>
  );
}
