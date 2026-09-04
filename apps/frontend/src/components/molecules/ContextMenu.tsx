import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTheme } from '@/services/themeService';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  shortcut?: string;
  badge?: string;
  children?: ContextMenuItem[];
}

export interface ContextMenuHeader {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: React.ReactNode;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  header?: ContextMenuHeader;
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  header?: ContextMenuHeader;
  items: ContextMenuItem[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  x,
  y,
  onClose,
  header,
  items,
}) => {
  const { currentTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x, y });
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const [submenuCoords, setSubmenuCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate clamped viewport positions
  useLayoutEffect(() => {
    if (!isOpen) return;

    const calculatePosition = () => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 10;
      const maxX = window.innerWidth - rect.width - padding;
      const maxY = window.innerHeight - rect.height - padding;

      let clampedX = Math.max(padding, Math.min(x, maxX));
      let clampedY = Math.max(padding, Math.min(y, maxY));

      // If opening off the bottom edge, position it upwards from click point
      if (y + rect.height > window.innerHeight - padding) {
        clampedY = Math.max(padding, y - rect.height);
      }

      // If opening off the right edge, position it leftwards from click point
      if (x + rect.width > window.innerWidth - padding) {
        clampedX = Math.max(padding, x - rect.width);
      }

      setCoords({ x: clampedX, y: clampedY });
    };

    calculatePosition();
  }, [isOpen, x, y, items]);

  // Handle dismissals (click outside, escape key, blur, window resize)
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        (!submenuRef.current || !submenuRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleWindowChange = () => {
      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isOpen, onClose]);

  // Position submenu relative to active hovered item
  const handleItemHover = (item: ContextMenuItem, element: HTMLElement) => {
    if (!item.children || item.children.length === 0) {
      setActiveSubmenuId(null);
      return;
    }

    const itemRect = element.getBoundingClientRect();
    const submenuWidth = 220; // Estimated submenu width
    const padding = 10;

    let subX = itemRect.right + 4;
    let subY = itemRect.top - 4;

    // Flip to left if overflowing right
    if (subX + submenuWidth > window.innerWidth - padding) {
      subX = itemRect.left - submenuWidth - 4;
    }

    // Flip upwards if overflowing bottom
    if (subY + 200 > window.innerHeight - padding) {
      subY = Math.max(padding, window.innerHeight - 220);
    }

    setSubmenuCoords({ x: Math.max(padding, subX), y: Math.max(padding, subY) });
    setActiveSubmenuId(item.id);
  };

  if (!isOpen) return null;

  const activeSubmenuItem = items.find((item) => item.id === activeSubmenuId);

  return (
    <div
      ref={menuRef}
      id="bebop-context-menu"
      role="menu"
      aria-label="Context Menu"
      style={{
        position: 'fixed',
        left: `${coords.x}px`,
        top: `${coords.y}px`,
        zIndex: 9999,
        backgroundColor: 'color-mix(in oklab, #0b101b 94%, transparent)',
        borderColor: currentTheme.borderColor || '#1f2d47',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255,255,255,0.06)',
      }}
      className="min-w-[210px] max-w-[280px] t-card t-stroke border backdrop-blur-md rounded-md p-1 font-sans text-xs select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Optional Header */}
      {header && (
        <div
          className="px-3 py-2 border-b mb-1 flex items-center justify-between gap-2"
          style={{ borderColor: 'color-mix(in oklab, #1f2d47 80%, transparent)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-bold text-white truncate text-[11px] leading-snug">
              {header.icon && <span className="shrink-0 text-amber-400">{header.icon}</span>}
              <span className="truncate">{header.title}</span>
            </div>
            {header.subtitle && (
              <p className="text-[10px] text-neutral-400 truncate mt-0.5">{header.subtitle}</p>
            )}
          </div>
          {header.badge && (
            <span
              className="text-[9px] font-mono font-semibold px-1.5 py-0.5 t-sm border shrink-0"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 12%, transparent)',
                borderColor: 'color-mix(in oklab, var(--c-p, #f59e0b) 30%, transparent)',
                color: currentTheme.primary || '#f59e0b',
              }}
            >
              {header.badge}
            </span>
          )}
        </div>
      )}

      {/* Menu Items */}
      <div className="flex flex-col gap-0.5">
        {items.map((item) => {
          if (item.divider) {
            return (
              <div
                key={item.id}
                role="separator"
                className="my-1 border-t"
                style={{ borderColor: 'color-mix(in oklab, #1f2d47 70%, transparent)' }}
              />
            );
          }

          const isSubmenuOpen = activeSubmenuId === item.id;
          const hasChildren = Boolean(item.children && item.children.length > 0);

          return (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) return;
                if (!item.disabled && item.onClick) {
                  item.onClick();
                  onClose();
                }
              }}
              onMouseEnter={(e) => handleItemHover(item, e.currentTarget)}
              className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer group ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed text-neutral-500'
                  : item.danger
                    ? 'text-red-400 hover:bg-red-950/60 hover:text-red-300'
                    : isSubmenuOpen
                      ? 'bg-neutral-800/90 text-white'
                      : 'text-neutral-300 hover:bg-neutral-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {item.icon && (
                  <span
                    className={`w-4 h-4 shrink-0 flex items-center justify-center ${
                      item.danger
                        ? 'text-red-400'
                        : isSubmenuOpen
                          ? 'text-amber-400'
                          : 'text-neutral-400 group-hover:text-amber-400 transition-colors'
                    }`}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate font-medium text-[11px]">{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.badge && (
                  <span className="text-[9px] font-mono text-neutral-400 bg-neutral-900 px-1 py-0.2 rounded border border-neutral-800">
                    {item.badge}
                  </span>
                )}
                {item.shortcut && (
                  <span className="text-[10px] font-mono text-neutral-500">{item.shortcut}</span>
                )}
                {hasChildren && (
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Nested Submenu (if any item with children is active) */}
      {activeSubmenuItem && activeSubmenuItem.children && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label={`${activeSubmenuItem.label} Submenu`}
          style={{
            position: 'fixed',
            left: `${submenuCoords.x}px`,
            top: `${submenuCoords.y}px`,
            zIndex: 10000,
            backgroundColor: 'color-mix(in oklab, #0b101b 96%, transparent)',
            borderColor: currentTheme.borderColor || '#1f2d47',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255,255,255,0.06)',
          }}
          className="min-w-[190px] max-w-[260px] max-h-[280px] overflow-y-auto t-card t-stroke border backdrop-blur-md rounded-md p-1 font-sans text-xs select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex flex-col gap-0.5">
            {activeSubmenuItem.children.map((subItem) => {
              if (subItem.divider) {
                return (
                  <div
                    key={subItem.id}
                    role="separator"
                    className="my-1 border-t"
                    style={{ borderColor: 'color-mix(in oklab, #1f2d47 70%, transparent)' }}
                  />
                );
              }

              return (
                <button
                  key={subItem.id}
                  role="menuitem"
                  disabled={subItem.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!subItem.disabled && subItem.onClick) {
                      subItem.onClick();
                      onClose();
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer group ${
                    subItem.disabled
                      ? 'opacity-40 cursor-not-allowed text-neutral-500'
                      : subItem.danger
                        ? 'text-red-400 hover:bg-red-950/60 hover:text-red-300'
                        : 'text-neutral-300 hover:bg-neutral-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {subItem.icon && (
                      <span className="w-4 h-4 shrink-0 flex items-center justify-center text-neutral-400 group-hover:text-amber-400 transition-colors">
                        {subItem.icon}
                      </span>
                    )}
                    <span className="truncate font-medium text-[11px]">{subItem.label}</span>
                  </div>

                  {subItem.badge && (
                    <span className="text-[9px] font-mono text-neutral-400 bg-neutral-900 px-1 py-0.2 rounded border border-neutral-800">
                      {subItem.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
