import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: {
      id: 'space-cowboy',
      primary: '#f59e0b',
      borderColor: '#1f2d47',
      bgCard: '#0d1524',
    },
  }),
}));

describe('ContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders menu items and calls onClick when an item is selected', () => {
    const onItemClick = vi.fn();
    const onClose = vi.fn();

    const items: ContextMenuItem[] = [
      { id: 'play-now', label: 'Play Now', onClick: onItemClick },
      { id: 'div-1', label: '', divider: true },
      { id: 'save-fav', label: 'Save to Liked Songs', onClick: vi.fn() },
    ];

    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={150}
        onClose={onClose}
        header={{ title: 'Tank!', subtitle: 'The Seatbelts', badge: 'FLAC' }}
        items={items}
      />,
    );

    expect(screen.getByText('Tank!')).toBeInTheDocument();
    expect(screen.getByText('The Seatbelts')).toBeInTheDocument();
    expect(screen.getByText('FLAC')).toBeInTheDocument();
    expect(screen.getByText('Play Now')).toBeInTheDocument();
    expect(screen.getByText('Save to Liked Songs')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Play Now'));

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key and does not render when isOpen is false', () => {
    const onClose = vi.fn();

    const { rerender } = render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={150}
        onClose={onClose}
        items={[{ id: 'item-1', label: 'Item One' }]}
      />,
    );

    expect(screen.getByText('Item One')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    rerender(
      <ContextMenu
        isOpen={false}
        x={100}
        y={150}
        onClose={onClose}
        items={[{ id: 'item-1', label: 'Item One' }]}
      />,
    );

    expect(screen.queryByText('Item One')).not.toBeInTheDocument();
  });

  it('displays submenus on hover for items with children', () => {
    const onSubmenuClick = vi.fn();
    const onClose = vi.fn();

    const items: ContextMenuItem[] = [
      {
        id: 'add-to-pl',
        label: 'Add to Playlist',
        children: [
          { id: 'pl-1', label: 'Chill Sessions', onClick: onSubmenuClick },
          { id: 'pl-2', label: 'Jazz Bebop' },
        ],
      },
    ];

    render(<ContextMenu isOpen={true} x={100} y={150} onClose={onClose} items={items} />);

    const parentItem = screen.getByText('Add to Playlist');
    fireEvent.mouseEnter(parentItem);

    expect(screen.getByText('Chill Sessions')).toBeInTheDocument();
    expect(screen.getByText('Jazz Bebop')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Chill Sessions'));
    expect(onSubmenuClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
