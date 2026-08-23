import React, { useRef } from 'react';
import { Search, X, Volume2, Disc, Settings, Download, Upload, Palette } from 'lucide-react';
import { NavTab, TopNavRailProps } from '@/types';
import { useAntraEngine } from '@/services/antraEngineService';
import { useTheme } from '@/services/themeService';

const MAIN_NAV_ITEMS: NavTab[] = ['HOME', 'LIBRARY', 'DISCOVER'];

export const TopNavRail: React.FC<TopNavRailProps> = ({
  activeTab,
  onTabChange,
  searchQuery = '',
  onSearchChange,
  onImportAudioFile,
  audioStatusLabel = 'Web Audio FFT',
  showPrototypeActions = true,
}) => {
  const { queue, activeDownloadsCount, setIsDrawerOpen, isDrawerOpen } = useAntraEngine();
  const { setIsThemeModalOpen, currentTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportAudioFile?.(e.target.files[0]);
    }
  };

  const downloadingItems = queue.filter(
    (item) => item.status === 'downloading' || item.status === 'verifying',
  );
  const queuedItems = queue.filter((item) => item.status === 'queued' || item.status === 'paused');
  const totalPending = downloadingItems.length + queuedItems.length;
  const currentProgress = downloadingItems.length > 0 ? downloadingItems[0].progress : 0;

  return (
    <header
      id="top-nav-rail"
      style={{
        backgroundColor: currentTheme.bgSurface,
        borderBottomColor: currentTheme.borderColor,
      }}
      className="w-full border-b px-4 sm:px-8 lg:px-12 2xl:px-16 py-3 relative flex items-center justify-between gap-4 select-none sticky top-0 z-30 shadow-md font-sans transition-colors duration-200"
    >
      {/* Left Section: Logo, Brand & Main Navigation Links */}
      <div id="nav-left-section" className="flex items-center gap-6 lg:gap-8 shrink-0 z-10">
        {/* Brand Logo & Title */}
        <div
          id="nav-brand"
          onClick={() => onTabChange('HOME')}
          className="flex items-center gap-2 shrink-0 cursor-pointer group"
        >
          {/* Bebop Geometric Icon */}
          <div
            className="w-7 h-7 rounded border flex items-center justify-center transition-colors"
            style={{
              backgroundColor: `${currentTheme.primary}15`,
              borderColor: `${currentTheme.primary}60`,
              color: currentTheme.primary,
            }}
          >
            <Disc className="w-4 h-4" style={{ color: currentTheme.primary }} />
          </div>

          <div className="flex items-center gap-1.5 font-bold tracking-wider text-sm sm:text-base">
            <span className="text-white font-extrabold tracking-wide">BEBOP</span>
            <span className="font-mono tracking-tighter" style={{ color: currentTheme.primary }}>
              //
            </span>
            <span className="text-neutral-400 text-xs tracking-widest uppercase font-mono">
              AUDIO
            </span>
          </div>
        </div>

        {/* Navigation Items (HOME, LIBRARY, DISCOVER) */}
        <nav
          id="main-navigation"
          className="hidden sm:flex items-center gap-4 md:gap-6 font-mono text-xs sm:text-sm"
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
                className={`relative py-1 font-semibold tracking-wider transition-colors cursor-pointer ${
                  isActive ? '' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span>{tab}</span>
                {isActive && (
                  <span
                    id={`nav-active-indicator-${tab.toLowerCase()}`}
                    className="absolute left-0 right-0 -bottom-3.5 h-0.5 rounded-full"
                    style={{ backgroundColor: currentTheme.primary }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center Section: True Mathematically Centered Search Bar */}
      <div
        id="nav-center-section"
        className="static sm:absolute sm:left-1/2 sm:-translate-x-1/2 w-full max-w-[180px] sm:max-w-xs md:max-w-sm lg:max-w-md z-20 flex items-center justify-center"
      >
        <div id="nav-search-container" className="relative w-full flex items-center">
          <input
            id="nav-library-search"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search tracks, albums, artists..."
            style={{
              backgroundColor: currentTheme.bgCard,
              borderColor: currentTheme.borderColor,
            }}
            className="w-full pl-4 pr-9 py-1.5 text-xs border rounded-lg text-neutral-200 placeholder-neutral-500 focus:outline-none transition-all font-sans"
          />
          {searchQuery ? (
            <button
              id="nav-search-clear"
              type="button"
              onClick={() => onSearchChange?.('')}
              className="absolute right-2.5 text-neutral-400 hover:text-white p-0.5 rounded cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search
              className="w-3.5 h-3.5 absolute right-3 pointer-events-none"
              style={{ color: currentTheme.primary }}
            />
          )}
        </div>
      </div>

      {/* Right Section: Audio Output, Download Queue Icon & Settings Cog */}
      <div id="nav-right-section" className="flex items-center gap-2 sm:gap-2.5 shrink-0 z-10">
        {/* Audio Engine Direct Output Pill */}
        <div
          id="nav-dac-status"
          style={{
            backgroundColor: currentTheme.bgCard,
            borderColor: currentTheme.borderColor,
            color: currentTheme.primary,
          }}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono select-none"
        >
          <Volume2 className="w-3.5 h-3.5" style={{ color: currentTheme.primary }} />
          <span>{audioStatusLabel}</span>
        </div>

        {showPrototypeActions && (
          <>
            {/* Hidden File Input for Custom Audio Files */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Import Audio File Button */}
            <button
              id="nav-import-audio-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-neutral-400 hover:bg-neutral-800/60"
              title="Import Local Audio (.mp3, .flac, .wav) to play & visualize"
              aria-label="Import Audio File"
            >
              <Upload className="w-4 h-4" style={{ color: currentTheme.primary }} />
              <span className="hidden lg:inline text-xs font-mono text-neutral-300">
                Import Audio
              </span>
            </button>

            {/* Download Queue Icon Button (No Border, Click to Open Queue Pop-up) */}
            <button
              id="nav-download-queue-btn"
              type="button"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              style={{
                color:
                  isDrawerOpen || downloadingItems.length > 0 ? currentTheme.primary : undefined,
                backgroundColor: isDrawerOpen ? `${currentTheme.primary}18` : undefined,
              }}
              className="relative p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
              title={
                downloadingItems.length > 0
                  ? `Downloading: ${currentProgress}% (${downloadingItems.length} active)`
                  : queuedItems.length > 0
                    ? `Download Queue: ${queuedItems.length} queued`
                    : 'Download Queue'
              }
              aria-label="Download Queue"
            >
              <Download
                className={`w-4 h-4 transition-transform ${
                  downloadingItems.length > 0 ? 'animate-bounce' : ''
                }`}
                style={{ color: downloadingItems.length > 0 ? currentTheme.primary : undefined }}
              />
              {downloadingItems.length > 0 ? (
                <span
                  id="nav-download-progress-pill"
                  className="text-[10px] font-mono font-bold"
                  style={{ color: currentTheme.primary }}
                >
                  {currentProgress}%
                </span>
              ) : queuedItems.length > 0 ? (
                <span
                  id="nav-queued-count-pill"
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: currentTheme.primary }}
                />
              ) : null}
            </button>
          </>
        )}

        {/* Theme Studio Palette Button */}
        <button
          id="nav-theme-studio-btn"
          type="button"
          onClick={() => setIsThemeModalOpen(true)}
          className="relative p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-neutral-400 hover:bg-neutral-800/60"
          title={`Theme Studio: ${currentTheme.name} (Click to change)`}
          aria-label="Theme Studio"
        >
          <Palette className="w-4 h-4" style={{ color: currentTheme.primary }} />
          <span
            className="w-2.5 h-2.5 rounded-full border border-white/30"
            style={{ backgroundColor: currentTheme.primary }}
          />
        </button>

        {/* Settings Cog Icon Button (No Border) */}
        <button
          id="nav-tab-settings"
          type="button"
          onClick={() => onTabChange('SETTINGS')}
          style={{
            color: activeTab === 'SETTINGS' ? currentTheme.primary : undefined,
            backgroundColor: activeTab === 'SETTINGS' ? `${currentTheme.primary}18` : undefined,
          }}
          className="relative p-2 rounded-lg transition-all cursor-pointer flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
          title="Settings"
          aria-label="Settings"
        >
          <Settings
            className={`w-4 h-4 transition-transform duration-300 ${
              activeTab === 'SETTINGS' ? 'rotate-45' : 'hover:rotate-45'
            }`}
          />
          {activeTab === 'SETTINGS' && (
            <span
              id="nav-active-indicator-settings"
              className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
              style={{ backgroundColor: currentTheme.primary }}
            />
          )}
        </button>
      </div>
    </header>
  );
};
