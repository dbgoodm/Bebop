import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  children: ReactNode;
}

/** A small, reusable content primitive for intentionally empty product states. */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <section aria-labelledby="empty-state-title" className="max-w-xl">
      <h1 id="empty-state-title" className="text-3xl font-bold">
        {title}
      </h1>
      <div className="mt-3 text-neutral-400">{children}</div>
    </section>
  );
}
