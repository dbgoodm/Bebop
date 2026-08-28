import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

const mocks = vi.hoisted(() => ({ setThemeById: vi.fn() }));

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: { id: 'night' },
    allThemes: [
      {
        id: 'night',
        name: 'Night',
        description: 'Dark',
        primary: '#fff',
        borderColor: '#111',
        bgCard: '#000',
      },
      {
        id: 'day',
        name: 'Day',
        description: 'Light',
        primary: '#000',
        borderColor: '#ddd',
        bgCard: '#fff',
      },
    ],
    setThemeById: mocks.setThemeById,
  }),
}));

describe('SettingsView', () => {
  afterEach(() => {
    cleanup();
  });
  it('keeps folder management and theme selection in Settings', () => {
    const onAddRoot = vi.fn();
    const onRescanRoot = vi.fn();
    const onSetRootEnabled = vi.fn();
    const onRemoveRoot = vi.fn();
    render(
      <SettingsView
        roots={[
          {
            id: 'root-1',
            path: '/music',
            label: 'Music',
            enabled: true,
            availability: 'online',
            watchMode: 'manual',
            trackCount: 1,
            lastScanAt: null,
          },
        ]}
        isScanning={false}
        onAddRoot={onAddRoot}
        onRescanRoot={onRescanRoot}
        onSetRootEnabled={onSetRootEnabled}
        onRemoveRoot={onRemoveRoot}
      />,
    );

    // Folder management lives under the Library category, themes under Appearance.
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    fireEvent.click(screen.getByRole('button', { name: /add folder/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));
    fireEvent.click(screen.getByRole('button', { name: /disable/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove from catalog/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    fireEvent.click(screen.getByRole('button', { name: /day light/i }));

    expect(onAddRoot).toHaveBeenCalledOnce();
    expect(onRescanRoot).toHaveBeenCalledWith('root-1');
    expect(onSetRootEnabled).toHaveBeenCalledWith('root-1', false);
    expect(onRemoveRoot).toHaveBeenCalledWith(expect.objectContaining({ id: 'root-1' }));
    expect(mocks.setThemeById).toHaveBeenCalledWith('day');
  });

  it('shows one category at a time and routes slots to their category', () => {
    render(
      <SettingsView
        roots={[]}
        isScanning={false}
        onAddRoot={vi.fn()}
        onRescanRoot={vi.fn()}
        onSetRootEnabled={vi.fn()}
        onRemoveRoot={vi.fn()}
        audioSlot={<p>output device controls</p>}
        onlineSlot={<p>scrobbling controls</p>}
        updatesSlot={<p>update checker</p>}
      />,
    );

    // Audio is the landing category; other categories stay unmounted.
    expect(screen.getByText('output device controls')).toBeInTheDocument();
    expect(screen.queryByText('scrobbling controls')).not.toBeInTheDocument();
    expect(screen.queryByText('update checker')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /library folders/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Online Presence' }));
    expect(screen.getByText('scrobbling controls')).toBeInTheDocument();
    expect(screen.queryByText('output device controls')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Updates' }));
    expect(screen.getByText('update checker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(screen.getByRole('heading', { name: /library folders/i })).toBeInTheDocument();
  });

  it('renders and allows configuring Lossless Acquisition Settings', () => {
    render(
      <SettingsView
        roots={[]}
        isScanning={false}
        onAddRoot={vi.fn()}
        onRescanRoot={vi.fn()}
        onSetRootEnabled={vi.fn()}
        onRemoveRoot={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole('heading', { name: /lossless acquisition settings/i })[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText(/hi-res 24-bit/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/cd quality 16-bit/i)[0]).toBeInTheDocument();

    const cdQualityBtn = screen.getAllByRole('button', { name: /cd quality 16-bit/i })[0];
    fireEvent.click(cdQualityBtn);

    expect(
      screen.getByPlaceholderText('{Artist}/{Album}/{TrackNumber} - {Title}'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/paste arl token/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/paste qobuz user token/i)).toBeInTheDocument();
  });
});
