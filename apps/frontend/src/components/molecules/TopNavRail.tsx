import React, { useRef } from 'react';
import { Disc, Search, Settings, Upload, X } from 'lucide-react';
import { NavTab, TopNavRailProps } from '@/types';
import { useTheme } from '@/services/themeService';

const MAIN_NAV_ITEMS: NavTab[] = ['HOME', 'LIBRARY', 'DISCOVER'];

export const TopNavRail: React.FC<TopNavRailProps> = ({
  activeTab,
  onTabChange,
  searchQuery = '',
  onSearchChange,
  onImportAudioFile,
  showPrototypeActions = true,
}) => {
  const { currentTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImportAudioFile?.(file);
    event.target.value = '';
  };

  return (
    // The rail doubles as the frameless window's title bar. Tauri starts a drag
    // only when the mousedown target itself carries `data-tauri-drag-region`, so
    // the attribute goes on the rail and on its layout wrappers — the gaps drag,
    // while every button and the search field keep their own clicks.
    <header
      id="top-nav-rail"
      data-tauri-drag-region
      style={{
        backgroundColor: currentTheme.bgSurface,
        borderBottomColor: currentTheme.borderColor,
      }}
      className="sticky top-0 z-30 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b px-4 py-3 shadow-md transition-colors sm:px-8 md:grid-cols-[auto_minmax(12rem,1fr)_auto] lg:px-12 2xl:px-16"
    >
      <div
        id="nav-left-section"
        data-tauri-drag-region
        className="flex min-w-0 items-center gap-4 lg:gap-7"
      >
        <button
          id="nav-brand"
          type="button"
          onClick={() => onTabChange('HOME')}
          className="flex shrink-0 items-center gap-2 text-left"
          aria-label="Bebop home"
        >
          <span
            className="flex h-7 w-7 items-center justify-center t-sm border"
            style={{
              backgroundColor: `${currentTheme.primary}15`,
              borderColor: `${currentTheme.primary}60`,
            }}
          >
            <Disc className="h-4 w-4" style={{ color: currentTheme.primary }} />
          </span>
          <span className="font-bold tracking-wider text-white">BEBOP</span>
          <span className="hidden font-mono text-xs tracking-[0.2em] text-neutral-400 sm:inline">
            AUDIO
          </span>
        </button>

        <nav
          id="main-navigation"
          className="hidden min-w-0 items-center gap-3 font-mono text-xs sm:flex md:gap-5"
        >
          {MAIN_NAV_ITEMS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                id={`nav-tab-${tab.toLowerCase()}`}
                type="button"
                onClick={() => onTabChange(tab)}
                style={{ color: isActive ? currentTheme.primary : undefined }}
                className={`whitespace-nowrap font-semibold tracking-wider transition-colors ${
                  isActive ? '' : 'text-neutral-400 hover:text-neutral-100'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        id="nav-center-section"
        className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1"
      >
        <label id="nav-search-container" className="relative block">
          <span className="sr-only">Search library</span>
          <input
            id="nav-library-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Search tracks, albums, artists…"
            style={{ backgroundColor: currentTheme.bgCard, borderColor: currentTheme.borderColor }}
            className="w-full t-sm border py-2 pl-3 pr-9 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
          />
          {searchQuery ? (
            <button
              id="nav-search-clear"
              type="button"
              onClick={() => onSearchChange?.('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 t-control p-1 text-neutral-400 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Search
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: currentTheme.primary }}
            />
          )}
        </label>
      </div>

      <div
        id="nav-right-section"
        data-tauri-drag-region
        className="flex items-center justify-end gap-1"
      >
        {showPrototypeActions ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              id="nav-import-audio-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="t-control p-2 text-neutral-400 transition hover:bg-neutral-800/60 hover:text-neutral-100"
              title="Play an audio file"
              aria-label="Play an audio file"
            >
              <Upload className="h-4 w-4" style={{ color: currentTheme.primary }} />
            </button>
          </>
        ) : null}
        <button
          id="nav-tab-settings"
          type="button"
          onClick={() => onTabChange('SETTINGS')}
          style={{ color: activeTab === 'SETTINGS' ? currentTheme.primary : undefined }}
          className="t-control p-2 text-neutral-400 transition hover:bg-neutral-800/60 hover:text-neutral-100"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        {/* Keeps the settings button clear of the floating window controls.
            Collapses to zero outside Tauri, where `--wc-gutter` is never set. */}
        <div aria-hidden="true" className="shrink-0" style={{ width: 'var(--wc-gutter, 0px)' }} />
      </div>
    </header>
  );
};
