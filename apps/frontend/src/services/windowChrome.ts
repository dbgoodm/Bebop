import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Window } from '@tauri-apps/api/window';

/**
 * Native window chrome.
 *
 * The main window is created with `decorations: false`, so Bebop draws its own
 * minimise / maximise / close controls and its own drag region. Resize borders
 * are *not* drawn here: `tauri-runtime-wry` attaches a hit-test handler to
 * undecorated windows on both Windows and GTK, so the 5px edge inset already
 * resizes natively. Adding webview handles on top of that would only steal the
 * scrollbar's hit area.
 *
 * Every call is a no-op outside the Tauri webview so the browser demo build and
 * jsdom tests can mount the controls without a shim.
 */

/** True only inside the Tauri webview; false in the browser demo and in tests. */
export function isNativeWindow(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let handle: Promise<Window> | null = null;

function nativeWindow(): Promise<Window> | null {
  if (!isNativeWindow()) return null;
  handle ??= import('@tauri-apps/api/window').then((api) => api.getCurrentWindow());
  return handle;
}

/**
 * Window commands are fire-and-forget: a rejected `close` or `minimize` leaves
 * nothing for the UI to recover, and throwing would surface as an unhandled
 * rejection in the webview console.
 */
async function command(run: (win: Window) => Promise<void>): Promise<void> {
  const win = nativeWindow();
  if (!win) return;
  try {
    await run(await win);
  } catch {
    // Window is already gone, or the command is not permitted on this platform.
  }
}

export function minimizeWindow(): Promise<void> {
  return command((win) => win.minimize());
}

export function toggleMaximizeWindow(): Promise<void> {
  return command((win) => win.toggleMaximize());
}

export function closeWindow(): Promise<void> {
  return command((win) => win.close());
}

export async function isWindowMaximized(): Promise<boolean> {
  const win = nativeWindow();
  if (!win) return false;
  try {
    return await (await win).isMaximized();
  } catch {
    return false;
  }
}

/**
 * Reports the maximised state on every resize, which covers the paths that do
 * not go through our own button: a double-clicked drag region, Windows snap,
 * and the window manager's own keybindings.
 *
 * Returns a synchronous unsubscribe so callers can use it directly as an effect
 * cleanup, even if the listener has not finished registering yet.
 */
export function subscribeWindowMaximized(onChange: (maximized: boolean) => void): () => void {
  const win = nativeWindow();
  if (!win) return () => undefined;

  let cancelled = false;
  let unlisten: UnlistenFn | undefined;

  void win
    .then((w) =>
      w.onResized(() => {
        void w
          .isMaximized()
          .then((maximized) => {
            if (!cancelled) onChange(maximized);
          })
          .catch(() => undefined);
      }),
    )
    .then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    })
    .catch(() => undefined);

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
