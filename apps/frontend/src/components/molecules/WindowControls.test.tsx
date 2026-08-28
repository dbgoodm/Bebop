import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowControls } from './WindowControls';

const chrome = vi.hoisted(() => ({
  native: true,
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  isWindowMaximized: vi.fn(() => Promise.resolve(false)),
  onMaximizedChange: undefined as ((maximized: boolean) => void) | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock('@/services/windowChrome', () => ({
  isNativeWindow: () => chrome.native,
  minimizeWindow: chrome.minimizeWindow,
  toggleMaximizeWindow: chrome.toggleMaximizeWindow,
  closeWindow: chrome.closeWindow,
  isWindowMaximized: chrome.isWindowMaximized,
  subscribeWindowMaximized: (onChange: (maximized: boolean) => void) => {
    chrome.onMaximizedChange = onChange;
    return chrome.unsubscribe;
  },
}));

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: {
      primary: '#38bdf8',
      secondary: '#f59e0b',
      accentTertiary: '#ef4444',
      textPrimary: '#ffffff',
      textMuted: '#7c8ba1',
    },
  }),
}));

beforeEach(() => {
  chrome.native = true;
  chrome.onMaximizedChange = undefined;
  vi.clearAllMocks();
  chrome.isWindowMaximized.mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--wc-gutter');
  document.documentElement.style.removeProperty('--win-r');
});

describe('WindowControls', () => {
  it('renders nothing outside the Tauri webview', () => {
    chrome.native = false;
    const { container } = render(<WindowControls />);

    expect(container).toBeEmptyDOMElement();
    expect(document.documentElement.style.getPropertyValue('--wc-gutter')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--win-r')).toBe('');
  });

  it('drives the window commands from its three buttons', () => {
    render(<WindowControls />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

    expect(chrome.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(chrome.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(chrome.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('follows maximise changes made outside its own button', async () => {
    render(<WindowControls />);
    expect(screen.getByRole('button', { name: 'Maximize window' })).toBeInTheDocument();

    await act(async () => {
      chrome.onMaximizedChange?.(true);
    });

    expect(screen.getByRole('button', { name: 'Restore window' })).toBeInTheDocument();
  });

  it('publishes and releases the frameless window metrics', () => {
    const { unmount } = render(<WindowControls />);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--wc-gutter')).toBe('140px');
    expect(root.style.getPropertyValue('--win-r')).toBe('10px');

    unmount();
    expect(root.style.getPropertyValue('--wc-gutter')).toBe('');
    expect(root.style.getPropertyValue('--win-r')).toBe('');
  });
});
