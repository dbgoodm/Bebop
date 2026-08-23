import type { ReactNode } from 'react';

interface AppShellProps {
  background: string;
  children: ReactNode;
}

/** Layout-only template shared by route-level pages. */
export function AppShell({ background, children }: AppShellProps) {
  return (
    <main className="min-h-screen px-8 py-12 text-neutral-100" style={{ background }}>
      {children}
    </main>
  );
}
