import { useEffect, useState, type CSSProperties } from 'react';
import { Minus, X } from 'lucide-react';
import { useTheme } from '@/services/themeService';
import {
  closeWindow,
  isNativeWindow,
  isWindowMaximized,
  minimizeWindow,
  subscribeWindowMaximized,
  toggleMaximizeWindow,
} from '@/services/windowChrome';

/**
 * Caption buttons for the frameless window.
 *
 * Pinned above every overlay (`z-[200]` clears the metadata editor's `z-[100]`)
 * because closing the window must never be something a modal or the fullscreen
 * player can take away. The cluster is transparent, so it reads as part of the
 * nav rail it sits on rather than as a bar of its own.
 *
 * Space is reserved for it by `--wc-gutter`, published on the document root
 * while the controls are mounted. Rails that run to the right edge pad
 * themselves by that width; outside Tauri it stays unset and nothing shifts.
 */
export function WindowControls() {
  const { currentTheme } = useTheme();
  const [maximized, setMaximized] = useState(false);
  const native = isNativeWindow();

  useEffect(() => {
    if (!native) return;
    // The subscription can report before the initial read resolves — a window
    // restored straight out of a maximised session does exactly that. Once it
    // has spoken it is authoritative, so the stale read is dropped.
    let reported = false;
    const stop = subscribeWindowMaximized((value) => {
      reported = true;
      setMaximized(value);
    });
    void isWindowMaximized().then((value) => {
      if (!reported) setMaximized(value);
    });
    return stop;
  }, [native]);

  // Frameless window metrics, published only while the app really is the window.
  // The browser demo keeps the fallbacks: no reserved gutter, square corners.
  useEffect(() => {
    if (!native) return;
    const root = document.documentElement;
    root.style.setProperty('--wc-gutter', `${CLUSTER_WIDTH}px`);
    root.style.setProperty('--win-r', WINDOW_RADIUS);
    return () => {
      root.style.removeProperty('--wc-gutter');
      root.style.removeProperty('--win-r');
    };
  }, [native]);

  if (!native) return null;

  // Hover treatments are theme colours, so they arrive as custom properties
  // rather than as Tailwind classes. Close is the destructive one and takes the
  // theme's warning accent as a full fill, the way every platform draws it.
  const idle: CSSProperties = {
    color: currentTheme.textMuted,
    '--wc-hover-fg': currentTheme.textPrimary,
    '--wc-hover-bg': `${currentTheme.primary}2e`,
  } as CSSProperties;

  const close: CSSProperties = {
    color: currentTheme.textMuted,
    '--wc-hover-fg': '#ffffff',
    '--wc-hover-bg': currentTheme.accentTertiary ?? currentTheme.secondary,
  } as CSSProperties;

  return (
    <div
      id="window-controls"
      className="win-round-tr fixed right-0 top-0 z-[200] flex items-stretch overflow-hidden"
    >
      <button
        id="window-minimize"
        type="button"
        onClick={() => void minimizeWindow()}
        className={BUTTON_CLASS}
        style={idle}
        title="Minimize"
        aria-label="Minimize window"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <button
        id="window-maximize"
        type="button"
        onClick={() => void toggleMaximizeWindow()}
        className={BUTTON_CLASS}
        style={idle}
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
      >
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </button>

      <button
        id="window-close"
        type="button"
        onClick={() => void closeWindow()}
        className={BUTTON_CLASS}
        style={close}
        title="Close"
        aria-label="Close window"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Kept in sync with `w-11` / `h-[38px]` below; `--wc-gutter` is derived from it. */
const BUTTON_WIDTH = 44;
const CLUSTER_WIDTH = BUTTON_WIDTH * 3 + 8;

/** Corner radius of the window itself, consumed through the `win-round*` utilities. */
const WINDOW_RADIUS = '10px';

const BUTTON_CLASS =
  'flex h-[38px] w-11 items-center justify-center transition-colors duration-150 ' +
  'hover:bg-[var(--wc-hover-bg)] hover:text-[var(--wc-hover-fg)] ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset ' +
  'focus-visible:ring-[var(--wc-hover-fg)]';

/** Drawn rather than borrowed from lucide so both glyphs share one stroke weight. */
function MaximizeGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="1.5" y="3.5" width="7" height="7" rx="1" />
      <path d="M3.9 3.3V2.4a1 1 0 0 1 1-1h4.7a1 1 0 0 1 1 1v4.7a1 1 0 0 1-1 1h-.9" />
    </svg>
  );
}
