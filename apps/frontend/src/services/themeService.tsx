import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CREW_THEMES } from './crewThemes';
import { POSTER_THEMES } from './posterThemes';
import { THEME_VAR_OVERRIDES } from './themeOverrides';
import { isDemoMode } from '@/demo/mode';
import {
  THEME_FALLBACK_ID,
  toThemeDocument,
  validateThemeDocument,
  type ThemeDocumentV1,
} from './themeModel';
import {
  loadPersistentPlayerState,
  loadUiPreference,
  saveThemePreference,
  saveUiPreference,
} from './playerStateService';
import { commands } from './tauri-bindings';

export interface StatCardColorConfig {
  borderTop: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
  accentBar: string;
}

export interface AmbientOrbConfig {
  color: string;
  position: string; // e.g. 'top -10% left -5%'
  size: string; // e.g. '500px'
  opacity: number;
}

export interface ThemeConfig {
  id: string;
  name: string;
  character?: string;
  tagline?: string;
  description: string;
  isDark: boolean;
  tag?: string;

  // Core colors
  primary: string; // e.g. #38bdf8
  primaryHover: string; // e.g. #7dd3fc
  secondary: string; // e.g. #eab308
  accentTertiary?: string; // e.g. #ef4444
  accentGlow: string; // rgba(56, 189, 248, 0.4)

  // Backgrounds & Rich Surfaces (NOT plain black)
  bgCanvas: string; // e.g. #091326
  bgCanvasGradient: string; // Rich multi-stop ambient canvas gradient
  bgCard: string; // e.g. #0e1f3d
  bgSurface: string; // Surface e.g. #162a52
  borderColor: string; // e.g. #1e3a6c
  borderAccent?: string;
  cardGradient: string; // Rich multi-stop card gradient

  // Ambient lighting for canvas depth
  ambientOrbs: AmbientOrbConfig[];

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Styling traits & Personality
  fontVibe:
    | 'retro-noir'
    | 'cyber-terminal'
    | 'casino-luxury'
    | 'industrial-heavy'
    | 'modern-clean'
    | 'synth-neon'
    | 'oled-minimal'
    | 'arctic-glacier';
  borderStyleType?: 'solid' | 'cyber-bracket' | 'neon-glow' | 'industrial-groove' | 'double';
  patternOverlay?: 'none' | 'scanlines' | 'cyber-grid' | 'dots' | 'starfield' | 'subtle-grain';

  // Stats Card Rich Color Mapping (5 top metrics)
  statsColors: {
    timeListened: StatCardColorConfig;
    totalTracks: StatCardColorConfig;
    artists: StatCardColorConfig;
    albums: StatCardColorConfig;
    duration: StatCardColorConfig;
  };

  // Visualizer / Waveform specific
  visualizerPrimary: string;
  visualizerSecondary: string;
  visualizerTertiary?: string;
  waveformPlayedTop: string;
  waveformPlayedBot: string;
  waveformUnplayedTop: string;
  waveformUnplayedBot: string;
  waveformGlow: boolean;

  /**
   * Full design token set, applied verbatim as CSS custom properties on the
   * document root. This is what lets a theme change geometry, typography,
   * texture and motion rather than only colour — components read the vars they
   * care about instead of hardcoding values.
   */
  vars?: Record<string, string>;
}

export type { ThemeAssetReference, ThemeDocumentV1, ThemeImageLayer } from './themeModel';

const THEME_PRESETS_ALL: ThemeConfig[] = [
  // 1. SPACE COWBOY - Deep Galactic Space Navy, Plasma Cyan & Saxophone Brass Gold
  {
    id: 'space-cowboy',
    name: 'Space Cowboy',
    description: 'Galactic deep space navy, steel plasma cyan, and saxophone brass gold',
    isDark: true,
    primary: '#38bdf8', // Plasma Cyan
    primaryHover: '#7dd3fc',
    secondary: '#f59e0b', // Saxophone Brass Gold
    accentTertiary: '#ef4444', // Crimson Accent
    accentGlow: 'rgba(56, 189, 248, 0.45)',
    bgCanvas: '#071022',
    bgCanvasGradient: 'radial-gradient(ellipse at 20% 0%, #0d234a 0%, #071022 55%, #050b18 100%)',
    bgCard: '#0c1b38',
    bgSurface: '#12254d',
    borderColor: '#1e3c73',
    borderAccent: '#38bdf8',
    cardGradient:
      'linear-gradient(145deg, rgba(56, 189, 248, 0.12) 0%, rgba(12, 27, 56, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(56, 189, 248, 0.18)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(245, 158, 11, 0.12)',
        position: 'top 30% right -5%',
        size: '550px',
        opacity: 0.7,
      },
      {
        color: 'rgba(239, 68, 68, 0.10)',
        position: 'bottom 10% left 35%',
        size: '500px',
        opacity: 0.6,
      },
    ],
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#7c94b8',
    fontVibe: 'retro-noir',
    borderStyleType: 'neon-glow',
    patternOverlay: 'starfield',
    statsColors: {
      timeListened: {
        borderTop: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.22)',
        badgeText: '#7dd3fc',
        glow: 'rgba(56, 189, 248, 0.45)',
        accentBar: '#38bdf8',
      },
      totalTracks: {
        borderTop: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.22)',
        badgeText: '#fde047',
        glow: 'rgba(245, 158, 11, 0.45)',
        accentBar: '#f59e0b',
      },
      artists: {
        borderTop: '#818cf8',
        badgeBg: 'rgba(129, 140, 248, 0.22)',
        badgeText: '#a5b4fc',
        glow: 'rgba(129, 140, 248, 0.45)',
        accentBar: '#818cf8',
      },
      albums: {
        borderTop: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.22)',
        badgeText: '#fca5a5',
        glow: 'rgba(239, 68, 68, 0.45)',
        accentBar: '#ef4444',
      },
      duration: {
        borderTop: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.22)',
        badgeText: '#6ee7b7',
        glow: 'rgba(16, 185, 129, 0.45)',
        accentBar: '#10b981',
      },
    },
    visualizerPrimary: '#38bdf8',
    visualizerSecondary: '#f59e0b',
    visualizerTertiary: '#ef4444',
    waveformPlayedTop: '#38bdf8',
    waveformPlayedBot: '#0284c7',
    waveformUnplayedTop: '#334e77',
    waveformUnplayedBot: '#1b2d49',
    waveformGlow: true,
  },

  // 2. QUEEN OF HEARTS - Velvet Burgundy, Crimson Rose & 24K Gold
  {
    id: 'queen-of-hearts',
    name: 'Queen of Hearts',
    description: 'High-stakes velvet burgundy, crimson rose fuselage, and casino gold',
    isDark: true,
    primary: '#f43f5e', // Crimson Rose
    primaryHover: '#fb7185',
    secondary: '#facc15', // 24K Gold
    accentTertiary: '#c084fc', // Lavender Silk
    accentGlow: 'rgba(244, 63, 94, 0.55)',
    bgCanvas: '#1c0520',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #360b3e 0%, #1c0520 55%, #120215 100%)',
    bgCard: '#2b0933',
    bgSurface: '#3a0f44',
    borderColor: '#591668',
    borderAccent: '#f43f5e',
    cardGradient: 'linear-gradient(145deg, rgba(244, 63, 94, 0.15) 0%, rgba(43, 9, 51, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(244, 63, 94, 0.22)',
        position: 'top -5% left 5%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(250, 204, 21, 0.16)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
      {
        color: 'rgba(192, 132, 252, 0.16)',
        position: 'bottom 10% left 40%',
        size: '500px',
        opacity: 0.6,
      },
    ],
    textPrimary: '#ffffff',
    textSecondary: '#fed7aa',
    textMuted: '#c084fc',
    fontVibe: 'casino-luxury',
    borderStyleType: 'double',
    patternOverlay: 'dots',
    statsColors: {
      timeListened: {
        borderTop: '#f43f5e',
        badgeBg: 'rgba(244, 63, 94, 0.25)',
        badgeText: '#fda4af',
        glow: 'rgba(244, 63, 94, 0.5)',
        accentBar: '#f43f5e',
      },
      totalTracks: {
        borderTop: '#facc15',
        badgeBg: 'rgba(250, 204, 21, 0.25)',
        badgeText: '#fef08a',
        glow: 'rgba(250, 204, 21, 0.5)',
        accentBar: '#facc15',
      },
      artists: {
        borderTop: '#c084fc',
        badgeBg: 'rgba(192, 132, 252, 0.25)',
        badgeText: '#e9d5ff',
        glow: 'rgba(192, 132, 252, 0.5)',
        accentBar: '#c084fc',
      },
      albums: {
        borderTop: '#fb7185',
        badgeBg: 'rgba(251, 113, 133, 0.25)',
        badgeText: '#ffe4e6',
        glow: 'rgba(251, 113, 133, 0.5)',
        accentBar: '#fb7185',
      },
      duration: {
        borderTop: '#fb923c',
        badgeBg: 'rgba(251, 146, 60, 0.25)',
        badgeText: '#ffedd5',
        glow: 'rgba(251, 146, 60, 0.5)',
        accentBar: '#fb923c',
      },
    },
    visualizerPrimary: '#f43f5e',
    visualizerSecondary: '#facc15',
    visualizerTertiary: '#c084fc',
    waveformPlayedTop: '#f43f5e',
    waveformPlayedBot: '#be123c',
    waveformUnplayedTop: '#701a75',
    waveformUnplayedBot: '#430d47',
    waveformGlow: true,
  },

  // 3. RADICAL PRODIGY - Matrix Phosphor Slate, Cyber Orange & Acid Lime
  {
    id: 'radical-prodigy',
    name: 'Radical Prodigy',
    description: 'Hacker matrix phosphor slate, cyber orange, and terminal green luminescence',
    isDark: true,
    primary: '#f97316', // Cyber Orange
    primaryHover: '#fb923c',
    secondary: '#84cc16', // Terminal Green
    accentTertiary: '#06b6d4', // Cyan
    accentGlow: 'rgba(249, 115, 22, 0.55)',
    bgCanvas: '#071b14',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #0d3629 0%, #071b14 55%, #04100c 100%)',
    bgCard: '#0d2c21',
    bgSurface: '#143d2f',
    borderColor: '#1d5a44',
    borderAccent: '#84cc16',
    cardGradient:
      'linear-gradient(145deg, rgba(132, 204, 22, 0.15) 0%, rgba(13, 44, 33, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(132, 204, 22, 0.20)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(249, 115, 22, 0.18)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.75,
      },
      {
        color: 'rgba(6, 182, 212, 0.15)',
        position: 'bottom 10% left 35%',
        size: '500px',
        opacity: 0.65,
      },
    ],
    textPrimary: '#ecfdf5',
    textSecondary: '#d1fae5',
    textMuted: '#6ee7b7',
    fontVibe: 'cyber-terminal',
    borderStyleType: 'cyber-bracket',
    patternOverlay: 'scanlines',
    statsColors: {
      timeListened: {
        borderTop: '#f97316',
        badgeBg: 'rgba(249, 115, 22, 0.25)',
        badgeText: '#fdba74',
        glow: 'rgba(249, 115, 22, 0.5)',
        accentBar: '#f97316',
      },
      totalTracks: {
        borderTop: '#84cc16',
        badgeBg: 'rgba(132, 204, 22, 0.25)',
        badgeText: '#bef264',
        glow: 'rgba(132, 204, 22, 0.5)',
        accentBar: '#84cc16',
      },
      artists: {
        borderTop: '#06b6d4',
        badgeBg: 'rgba(6, 182, 212, 0.25)',
        badgeText: '#67e8f9',
        glow: 'rgba(6, 182, 212, 0.5)',
        accentBar: '#06b6d4',
      },
      albums: {
        borderTop: '#eab308',
        badgeBg: 'rgba(234, 179, 8, 0.25)',
        badgeText: '#fde047',
        glow: 'rgba(234, 179, 8, 0.5)',
        accentBar: '#eab308',
      },
      duration: {
        borderTop: '#d946ef',
        badgeBg: 'rgba(217, 70, 239, 0.25)',
        badgeText: '#f0abfc',
        glow: 'rgba(217, 70, 239, 0.5)',
        accentBar: '#d946ef',
      },
    },
    visualizerPrimary: '#f97316',
    visualizerSecondary: '#84cc16',
    visualizerTertiary: '#06b6d4',
    waveformPlayedTop: '#f97316',
    waveformPlayedBot: '#c2410c',
    waveformUnplayedTop: '#1b6348',
    waveformUnplayedBot: '#103d2c',
    waveformGlow: true,
  },

  // 4. BLACK DOG - Industrial Titanium Bronze & Heavy Workshop Amber
  {
    id: 'black-dog',
    name: 'Black Dog',
    description: 'Industrial workshop amber, cybernetic titanium slate, and heavy bronze',
    isDark: true,
    primary: '#f59e0b', // Industrial Amber
    primaryHover: '#fbbf24',
    secondary: '#94a3b8', // Titanium Slate
    accentTertiary: '#ea580c', // Heavy Rust
    accentGlow: 'rgba(245, 158, 11, 0.45)',
    bgCanvas: '#19140f',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #302418 0%, #19140f 55%, #100d0a 100%)',
    bgCard: '#251e16',
    bgSurface: '#33291f',
    borderColor: '#4d3d2c',
    borderAccent: '#f59e0b',
    cardGradient:
      'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(37, 30, 22, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(245, 158, 11, 0.20)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(234, 88, 12, 0.16)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
      {
        color: 'rgba(148, 163, 184, 0.15)',
        position: 'bottom 10% left 35%',
        size: '500px',
        opacity: 0.6,
      },
    ],
    textPrimary: '#f8fafc',
    textSecondary: '#e2e8f0',
    textMuted: '#94a3b8',
    fontVibe: 'industrial-heavy',
    borderStyleType: 'industrial-groove',
    patternOverlay: 'cyber-grid',
    statsColors: {
      timeListened: {
        borderTop: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.22)',
        badgeText: '#fcd34d',
        glow: 'rgba(245, 158, 11, 0.45)',
        accentBar: '#f59e0b',
      },
      totalTracks: {
        borderTop: '#94a3b8',
        badgeBg: 'rgba(148, 163, 184, 0.22)',
        badgeText: '#e2e8f0',
        glow: 'rgba(148, 163, 184, 0.45)',
        accentBar: '#94a3b8',
      },
      artists: {
        borderTop: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.22)',
        badgeText: '#7dd3fc',
        glow: 'rgba(56, 189, 248, 0.45)',
        accentBar: '#38bdf8',
      },
      albums: {
        borderTop: '#ea580c',
        badgeBg: 'rgba(234, 88, 12, 0.22)',
        badgeText: '#fdba74',
        glow: 'rgba(234, 88, 12, 0.45)',
        accentBar: '#ea580c',
      },
      duration: {
        borderTop: '#84cc16',
        badgeBg: 'rgba(132, 204, 22, 0.22)',
        badgeText: '#bef264',
        glow: 'rgba(132, 204, 22, 0.45)',
        accentBar: '#84cc16',
      },
    },
    visualizerPrimary: '#f59e0b',
    visualizerSecondary: '#94a3b8',
    visualizerTertiary: '#ea580c',
    waveformPlayedTop: '#f59e0b',
    waveformPlayedBot: '#b45309',
    waveformUnplayedTop: '#5a4632',
    waveformUnplayedBot: '#322619',
    waveformGlow: true,
  },

  // 5. MONSTERCAT EDM GOLD - Electronic Warm Amber Obsidian
  {
    id: 'monstercat-amber',
    name: 'Monstercat EDM Gold',
    description: 'Classic electronic warm amber gold & bass-heavy espresso dusk',
    tag: 'EDM CLASSIC',
    isDark: true,
    primary: '#f59e0b',
    primaryHover: '#fbbf24',
    secondary: '#fde047',
    accentGlow: 'rgba(245, 158, 11, 0.45)',
    bgCanvas: '#1a1206',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #332009 0%, #1a1206 55%, #100b04 100%)',
    bgCard: '#291b09',
    bgSurface: '#38250c',
    borderColor: '#543712',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    fontVibe: 'modern-clean',
    cardGradient:
      'linear-gradient(145deg, rgba(245, 158, 11, 0.14) 0%, rgba(41, 27, 9, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(245, 158, 11, 0.22)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(253, 224, 71, 0.15)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
    ],
    statsColors: {
      timeListened: {
        borderTop: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.22)',
        badgeText: '#fcd34d',
        glow: 'rgba(245, 158, 11, 0.45)',
        accentBar: '#f59e0b',
      },
      totalTracks: {
        borderTop: '#3b82f6',
        badgeBg: 'rgba(59, 130, 246, 0.22)',
        badgeText: '#93c5fd',
        glow: 'rgba(59, 130, 246, 0.45)',
        accentBar: '#3b82f6',
      },
      artists: {
        borderTop: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.22)',
        badgeText: '#6ee7b7',
        glow: 'rgba(16, 185, 129, 0.45)',
        accentBar: '#10b981',
      },
      albums: {
        borderTop: '#ec4899',
        badgeBg: 'rgba(236, 72, 153, 0.22)',
        badgeText: '#f472b6',
        glow: 'rgba(236, 72, 153, 0.45)',
        accentBar: '#ec4899',
      },
      duration: {
        borderTop: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.22)',
        badgeText: '#fcd34d',
        glow: 'rgba(245, 158, 11, 0.45)',
        accentBar: '#f59e0b',
      },
    },
    visualizerPrimary: '#f59e0b',
    visualizerSecondary: '#fde047',
    waveformPlayedTop: '#f59e0b',
    waveformPlayedBot: '#d97706',
    waveformUnplayedTop: '#63441a',
    waveformUnplayedBot: '#3d280c',
    waveformGlow: true,
    vars: {
      '--f-d': "'Space Grotesk', sans-serif",
      '--f-b': "'Barlow', sans-serif",
      '--f-m': "'Space Mono', monospace",
      '--w-d': '700',
      '--ls-h': '.02em',
      '--tt-l': 'uppercase',
      '--r': '10px',
      '--r-sm': '6px',
      '--btn-r': '9999px',
      '--clip': 'none',
      '--clip-btn': 'none',
      '--sw': '1',
      '--bar-r': '2px',
      '--bar-bg': 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)',
      '--bar-cap': '#ffffff',
      '--bar-cap-h': '2px',
      '--bar-w': '4px',
      '--bar-gap': '3px',
      // A faceted bass-burst gem — an original shape evoking EDM/bass
      // energy, not a trace of the actual Monstercat mark.
      '--tex':
        'url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27360%27%20height%3D%27360%27%3E%3Cpath%20d%3D%27M180%20180%20L180.0%2010.0%20L225.7%2085.0%20Z%27%20fill%3D%27%2523f59e0b%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L225.7%2085.0%20L312.9%2074.0%20Z%27%20fill%3D%27%2523fbbf24%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L312.9%2074.0%20L282.8%20156.5%20Z%27%20fill%3D%27%2523fde047%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L282.8%20156.5%20L345.7%20217.8%20Z%27%20fill%3D%27%2523f59e0b%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L345.7%20217.8%20L262.4%20245.7%20Z%27%20fill%3D%27%2523fbbf24%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L262.4%20245.7%20L253.8%20333.2%20Z%27%20fill%3D%27%2523fde047%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L253.8%20333.2%20L180.0%20285.4%20Z%27%20fill%3D%27%2523f59e0b%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L180.0%20285.4%20L106.2%20333.2%20Z%27%20fill%3D%27%2523fbbf24%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L106.2%20333.2%20L97.6%20245.7%20Z%27%20fill%3D%27%2523fde047%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L97.6%20245.7%20L14.3%20217.8%20Z%27%20fill%3D%27%2523f59e0b%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L14.3%20217.8%20L77.2%20156.5%20Z%27%20fill%3D%27%2523fbbf24%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L77.2%20156.5%20L47.1%2074.0%20Z%27%20fill%3D%27%2523fde047%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L47.1%2074.0%20L134.3%2085.0%20Z%27%20fill%3D%27%2523f59e0b%27%20fill-opacity%3D%270.9%27%2F%3E%3Cpath%20d%3D%27M180%20180%20L134.3%2085.0%20L180.0%2010.0%20Z%27%20fill%3D%27%2523fbbf24%27%20fill-opacity%3D%270.9%27%2F%3E%3C%2Fsvg%3E")',
      '--tex-size': '360px 360px',
      '--tex-repeat': 'no-repeat',
      '--tex-position': 'right -60px bottom 60px',
      '--tex-op': '.9',
      '--cursor': 'auto',
    },
  },

  // 6. SOUNDCLOUD SUNSET - Studio Dusk Warm Charcoal & Fire Orange
  {
    id: 'soundcloud-orange',
    name: 'SoundCloud Sunset',
    description: 'Iconic SoundCloud studio warm ember dusk with fire orange highlights',
    tag: 'CREATOR',
    isDark: true,
    primary: '#ff5500',
    primaryHover: '#ff6e26',
    secondary: '#ffaa00',
    accentGlow: 'rgba(255, 85, 0, 0.5)',
    bgCanvas: '#1a0c06',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #36170a 0%, #1a0c06 55%, #100603 100%)',
    bgCard: '#291209',
    bgSurface: '#381a0d',
    borderColor: '#542614',
    textPrimary: '#ffffff',
    textSecondary: '#fed7aa',
    textMuted: '#a8a29e',
    fontVibe: 'modern-clean',
    cardGradient: 'linear-gradient(145deg, rgba(255, 85, 0, 0.15) 0%, rgba(41, 18, 9, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(255, 85, 0, 0.22)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(255, 170, 0, 0.16)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
    ],
    statsColors: {
      timeListened: {
        borderTop: '#ff5500',
        badgeBg: 'rgba(255, 85, 0, 0.22)',
        badgeText: '#ff884d',
        glow: 'rgba(255, 85, 0, 0.5)',
        accentBar: '#ff5500',
      },
      totalTracks: {
        borderTop: '#ffaa00',
        badgeBg: 'rgba(255, 170, 0, 0.22)',
        badgeText: '#ffc04d',
        glow: 'rgba(255, 170, 0, 0.45)',
        accentBar: '#ffaa00',
      },
      artists: {
        borderTop: '#3b82f6',
        badgeBg: 'rgba(59, 130, 246, 0.22)',
        badgeText: '#93c5fd',
        glow: 'rgba(59, 130, 246, 0.45)',
        accentBar: '#3b82f6',
      },
      albums: {
        borderTop: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.22)',
        badgeText: '#fca5a5',
        glow: 'rgba(239, 68, 68, 0.45)',
        accentBar: '#ef4444',
      },
      duration: {
        borderTop: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.22)',
        badgeText: '#6ee7b7',
        glow: 'rgba(16, 185, 129, 0.45)',
        accentBar: '#10b981',
      },
    },
    visualizerPrimary: '#ff5500',
    visualizerSecondary: '#ffb300',
    waveformPlayedTop: '#ff5500',
    waveformPlayedBot: '#cc4400',
    waveformUnplayedTop: '#663219',
    waveformUnplayedBot: '#3d1c0e',
    waveformGlow: true,
    vars: {
      '--f-d': "'Barlow', sans-serif",
      '--f-b': "'Barlow', sans-serif",
      '--f-m': "'Courier Prime', monospace",
      '--w-d': '700',
      '--ls-h': '0em',
      '--tt-l': 'none',
      '--r': '8px',
      '--r-sm': '5px',
      '--btn-r': '9999px',
      '--clip': 'none',
      '--clip-btn': 'none',
      '--sw': '1',
      '--bar-r': '1px',
      '--bar-bg': 'linear-gradient(180deg, #ffaa00 0%, #ff5500 100%)',
      '--bar-cap': '#ffffff',
      '--bar-cap-h': '2px',
      '--bar-w': '3px',
      '--bar-gap': '2px',
      // A waveform-bar texture, evoking the scrubber SoundCloud is known
      // for, rather than their literal cloud mark.
      '--tex':
        'url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27598%27%20height%3D%27140%27%3E%3Cg%20fill%3D%27%2523ff5500%27%3E%3Crect%20x%3D%270%27%20y%3D%27118%27%20width%3D%279%27%20height%3D%2722%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2713%27%20y%3D%2785%27%20width%3D%279%27%20height%3D%2755%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2726%27%20y%3D%2752%27%20width%3D%279%27%20height%3D%2788%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2739%27%20y%3D%27100%27%20width%3D%279%27%20height%3D%2740%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2752%27%20y%3D%2730%27%20width%3D%279%27%20height%3D%27110%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2765%27%20y%3D%2770%27%20width%3D%279%27%20height%3D%2770%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2778%27%20y%3D%27110%27%20width%3D%279%27%20height%3D%2730%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%2791%27%20y%3D%2745%27%20width%3D%279%27%20height%3D%2795%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27104%27%20y%3D%2790%27%20width%3D%279%27%20height%3D%2750%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27117%27%20y%3D%2720%27%20width%3D%279%27%20height%3D%27120%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27130%27%20y%3D%2775%27%20width%3D%279%27%20height%3D%2765%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27143%27%20y%3D%27122%27%20width%3D%279%27%20height%3D%2718%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27156%27%20y%3D%2765%27%20width%3D%279%27%20height%3D%2775%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27169%27%20y%3D%2740%27%20width%3D%279%27%20height%3D%27100%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27182%27%20y%3D%2795%27%20width%3D%279%27%20height%3D%2745%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27195%27%20y%3D%2780%27%20width%3D%279%27%20height%3D%2760%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27208%27%20y%3D%2710%27%20width%3D%279%27%20height%3D%27130%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27221%27%20y%3D%27105%27%20width%3D%279%27%20height%3D%2735%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27234%27%20y%3D%2755%27%20width%3D%279%27%20height%3D%2785%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27247%27%20y%3D%2782%27%20width%3D%279%27%20height%3D%2758%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27260%27%20y%3D%27118%27%20width%3D%279%27%20height%3D%2722%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27273%27%20y%3D%2785%27%20width%3D%279%27%20height%3D%2755%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27286%27%20y%3D%2752%27%20width%3D%279%27%20height%3D%2788%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27299%27%20y%3D%27100%27%20width%3D%279%27%20height%3D%2740%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27312%27%20y%3D%2730%27%20width%3D%279%27%20height%3D%27110%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27325%27%20y%3D%2770%27%20width%3D%279%27%20height%3D%2770%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27338%27%20y%3D%27110%27%20width%3D%279%27%20height%3D%2730%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27351%27%20y%3D%2745%27%20width%3D%279%27%20height%3D%2795%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27364%27%20y%3D%2790%27%20width%3D%279%27%20height%3D%2750%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27377%27%20y%3D%2720%27%20width%3D%279%27%20height%3D%27120%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27390%27%20y%3D%2775%27%20width%3D%279%27%20height%3D%2765%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27403%27%20y%3D%27122%27%20width%3D%279%27%20height%3D%2718%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27416%27%20y%3D%2765%27%20width%3D%279%27%20height%3D%2775%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27429%27%20y%3D%2740%27%20width%3D%279%27%20height%3D%27100%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27442%27%20y%3D%2795%27%20width%3D%279%27%20height%3D%2745%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27455%27%20y%3D%2780%27%20width%3D%279%27%20height%3D%2760%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27468%27%20y%3D%2710%27%20width%3D%279%27%20height%3D%27130%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27481%27%20y%3D%27105%27%20width%3D%279%27%20height%3D%2735%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27494%27%20y%3D%2755%27%20width%3D%279%27%20height%3D%2785%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27507%27%20y%3D%2782%27%20width%3D%279%27%20height%3D%2758%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27520%27%20y%3D%27118%27%20width%3D%279%27%20height%3D%2722%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27533%27%20y%3D%2785%27%20width%3D%279%27%20height%3D%2755%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27546%27%20y%3D%2752%27%20width%3D%279%27%20height%3D%2788%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27559%27%20y%3D%27100%27%20width%3D%279%27%20height%3D%2740%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27572%27%20y%3D%2730%27%20width%3D%279%27%20height%3D%27110%27%20rx%3D%271.5%27%2F%3E%3Crect%20x%3D%27585%27%20y%3D%2770%27%20width%3D%279%27%20height%3D%2770%27%20rx%3D%271.5%27%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")',
      '--tex-size': '598px 140px',
      '--tex-repeat': 'repeat-x',
      '--tex-position': 'left 0px bottom 100px',
      '--tex-op': '.55',
      '--cursor': 'auto',
    },
  },

  // 7. CYBERPUNK NEON MATRIX - Electric Neo-Tokyo Cyber Purple & Holographic Cyan
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon Matrix',
    description: 'Electric laser magenta and holographic cyan night city with glowing violet depth',
    tag: 'CYBERPUNK',
    isDark: true,
    primary: '#ff007f',
    primaryHover: '#ff3399',
    secondary: '#00f0ff',
    accentGlow: 'rgba(255, 0, 127, 0.55)',
    bgCanvas: '#160527',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #2e094f 0%, #160527 55%, #0d0218 100%)',
    bgCard: '#25083f',
    bgSurface: '#340c57',
    borderColor: '#54178a',
    textPrimary: '#ffffff',
    textSecondary: '#e0e7ff',
    textMuted: '#a5b4fc',
    fontVibe: 'synth-neon',
    patternOverlay: 'cyber-grid',
    cardGradient: 'linear-gradient(145deg, rgba(255, 0, 127, 0.16) 0%, rgba(37, 8, 63, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(255, 0, 127, 0.24)',
        position: 'top -5% left 5%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(0, 240, 255, 0.20)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.75,
      },
    ],
    statsColors: {
      timeListened: {
        borderTop: '#ff007f',
        badgeBg: 'rgba(255, 0, 127, 0.25)',
        badgeText: '#ff66b2',
        glow: 'rgba(255, 0, 127, 0.5)',
        accentBar: '#ff007f',
      },
      totalTracks: {
        borderTop: '#00f0ff',
        badgeBg: 'rgba(0, 240, 255, 0.25)',
        badgeText: '#66f6ff',
        glow: 'rgba(0, 240, 255, 0.5)',
        accentBar: '#00f0ff',
      },
      artists: {
        borderTop: '#a855f7',
        badgeBg: 'rgba(168, 85, 247, 0.25)',
        badgeText: '#c084fc',
        glow: 'rgba(168, 85, 247, 0.5)',
        accentBar: '#a855f7',
      },
      albums: {
        borderTop: '#facc15',
        badgeBg: 'rgba(250, 204, 21, 0.25)',
        badgeText: '#fef08a',
        glow: 'rgba(250, 204, 21, 0.5)',
        accentBar: '#facc15',
      },
      duration: {
        borderTop: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.25)',
        badgeText: '#7dd3fc',
        glow: 'rgba(56, 189, 248, 0.5)',
        accentBar: '#38bdf8',
      },
    },
    visualizerPrimary: '#ff007f',
    visualizerSecondary: '#00f0ff',
    waveformPlayedTop: '#ff007f',
    waveformPlayedBot: '#a200ff',
    waveformUnplayedTop: '#6820a4',
    waveformUnplayedBot: '#3c1061',
    waveformGlow: true,
    vars: {
      '--f-d': "'Rubik Mono One', sans-serif",
      '--f-b': "'Space Grotesk', sans-serif",
      '--f-m': "'VT323', monospace",
      '--w-d': '400',
      '--ls-h': '.03em',
      '--tt-l': 'uppercase',
      '--r': '0px',
      '--r-sm': '0px',
      '--btn-r': '2px',
      '--clip': 'none',
      '--clip-btn': 'none',
      '--sw': '1.5',
      '--bar-r': '0px',
      '--bar-bg': 'linear-gradient(180deg, #00f0ff 0%, #ff007f 100%)',
      '--bar-cap': '#ffffff',
      '--bar-cap-h': '2px',
      '--bar-w': '3px',
      '--bar-gap': '3px',
      '--tex':
        'linear-gradient(rgba(0,240,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,.05) 1px, transparent 1px), url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27220%27%20height%3D%27140%27%3E%3Crect%20x%3D%270%27%20y%3D%2760%27%20width%3D%2740%27%20height%3D%2780%27%20fill%3D%27%2523ff007f%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%2740%27%20y%3D%2790%27%20width%3D%2730%27%20height%3D%2750%27%20fill%3D%27%252300f0ff%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%2770%27%20y%3D%2740%27%20width%3D%2726%27%20height%3D%27100%27%20fill%3D%27%2523ff007f%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%2796%27%20y%3D%27110%27%20width%3D%2734%27%20height%3D%2730%27%20fill%3D%27%252300f0ff%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%27130%27%20y%3D%2770%27%20width%3D%2724%27%20height%3D%2770%27%20fill%3D%27%2523ff007f%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%27154%27%20y%3D%2795%27%20width%3D%2730%27%20height%3D%2745%27%20fill%3D%27%252300f0ff%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%27184%27%20y%3D%2750%27%20width%3D%2728%27%20height%3D%2790%27%20fill%3D%27%2523ff007f%27%20fill-opacity%3D%270.5%27%2F%3E%3Crect%20x%3D%27212%27%20y%3D%2785%27%20width%3D%2736%27%20height%3D%2755%27%20fill%3D%27%252300f0ff%27%20fill-opacity%3D%270.5%27%2F%3E%3C%2Fsvg%3E")',
      '--tex-size': '32px 32px, 32px 32px, 220px 140px',
      '--tex-repeat': 'repeat, repeat, repeat-x',
      '--tex-position': '0 0, 0 0, left 0px bottom 100px',
      '--tex-op': '.8',
      '--cursor': 'crosshair',
    },
  },

  // 8. SPOTIFY ACOUSTIC EMERALD - Deep Forest Pine & Acoustic Sage
  {
    id: 'spotify-emerald',
    name: 'Spotify Acoustic Emerald',
    description: 'Clean acoustic deep pine forest and vibrant emerald green energy',
    tag: 'STREAMING',
    isDark: true,
    primary: '#1db954',
    primaryHover: '#1ed760',
    secondary: '#1ed760',
    accentGlow: 'rgba(29, 185, 84, 0.45)',
    // Real Spotify is a neutral near-black, not a green-tinted wash — the
    // green is a sharp, isolated accent (buttons, highlights) against it,
    // not a diffuse background tone.
    bgCanvas: '#0a0a0a',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #0f1f14 0%, #0a0a0a 55%, #050505 100%)',
    bgCard: '#181818',
    bgSurface: '#202020',
    borderColor: '#2a2a2a',
    textPrimary: '#ffffff',
    textSecondary: '#b3b3b3',
    textMuted: '#727272',
    fontVibe: 'modern-clean',
    cardGradient:
      'linear-gradient(145deg, rgba(29, 185, 84, 0.16) 0%, rgba(24, 24, 24, 0.97) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(29, 185, 84, 0.22)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(30, 215, 96, 0.14)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
    ],
    statsColors: {
      timeListened: {
        borderTop: '#1db954',
        badgeBg: 'rgba(29, 185, 84, 0.22)',
        badgeText: '#4ade80',
        glow: 'rgba(29, 185, 84, 0.45)',
        accentBar: '#1db954',
      },
      totalTracks: {
        borderTop: '#3b82f6',
        badgeBg: 'rgba(59, 130, 246, 0.22)',
        badgeText: '#93c5fd',
        glow: 'rgba(59, 130, 246, 0.45)',
        accentBar: '#3b82f6',
      },
      artists: {
        borderTop: '#eab308',
        badgeBg: 'rgba(234, 179, 8, 0.22)',
        badgeText: '#fde047',
        glow: 'rgba(234, 179, 8, 0.45)',
        accentBar: '#eab308',
      },
      albums: {
        borderTop: '#ec4899',
        badgeBg: 'rgba(236, 72, 153, 0.22)',
        badgeText: '#f472b6',
        glow: 'rgba(236, 72, 153, 0.45)',
        accentBar: '#ec4899',
      },
      duration: {
        borderTop: '#1db954',
        badgeBg: 'rgba(29, 185, 84, 0.22)',
        badgeText: '#4ade80',
        glow: 'rgba(29, 185, 84, 0.45)',
        accentBar: '#1db954',
      },
    },
    visualizerPrimary: '#1db954',
    visualizerSecondary: '#1ed760',
    waveformPlayedTop: '#1db954',
    waveformPlayedBot: '#15803d',
    waveformUnplayedTop: '#2a2a2a',
    waveformUnplayedBot: '#181818',
    waveformGlow: true,
    vars: {
      '--f-d': "'Jost', sans-serif",
      '--f-b': "'Jost', sans-serif",
      '--f-m': "'Space Mono', monospace",
      '--w-d': '700',
      '--ls-h': '-.01em',
      '--tt-l': 'none',
      '--r': '8px',
      '--r-sm': '6px',
      '--btn-r': '9999px',
      '--clip': 'none',
      '--clip-btn': 'none',
      '--sw': '1',
      '--bar-r': '9999px',
      '--bar-bg': 'linear-gradient(180deg, #1ed760 0%, #0f8a3c 100%)',
      '--bar-cap': '#ffffff',
      '--bar-cap-h': '2px',
      '--bar-w': '4px',
      '--bar-gap': '3px',
      // Radiating soundwave arcs from a corner — evokes broadcast/sound
      // energy without tracing Spotify's actual glyph.
      '--tex':
        'url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27320%27%20height%3D%27320%27%3E%3Cpath%20d%3D%27M0%20260%20A60%2060%200%200%201%2060%20320%27%20fill%3D%27none%27%20stroke%3D%27%25231db954%27%20stroke-width%3D%276%27%20stroke-opacity%3D%270.55%27%2F%3E%3Cpath%20d%3D%27M0%20210%20A110%20110%200%200%201%20110%20320%27%20fill%3D%27none%27%20stroke%3D%27%25231db954%27%20stroke-width%3D%276%27%20stroke-opacity%3D%270.47%27%2F%3E%3Cpath%20d%3D%27M0%20160%20A160%20160%200%200%201%20160%20320%27%20fill%3D%27none%27%20stroke%3D%27%25231db954%27%20stroke-width%3D%276%27%20stroke-opacity%3D%270.39%27%2F%3E%3Cpath%20d%3D%27M0%20110%20A210%20210%200%200%201%20210%20320%27%20fill%3D%27none%27%20stroke%3D%27%25231db954%27%20stroke-width%3D%276%27%20stroke-opacity%3D%270.31%27%2F%3E%3Cpath%20d%3D%27M0%2060%20A260%20260%200%200%201%20260%20320%27%20fill%3D%27none%27%20stroke%3D%27%25231db954%27%20stroke-width%3D%276%27%20stroke-opacity%3D%270.23%27%2F%3E%3C%2Fsvg%3E")',
      '--tex-size': '320px 320px',
      '--tex-repeat': 'no-repeat',
      '--tex-position': 'left -40px bottom 60px',
      '--tex-op': '.9',
      '--cursor': 'auto',
    },
  },

  // 9. AUDIOPHILE SAPPHIRE DAC - High-End Hi-Fi Cobalt Studio
  {
    id: 'audiophile-sapphire',
    name: 'Audiophile Sapphire DAC',
    description:
      'Mastering studio cobalt navy with ice cyan VU meters and anodized aluminum finish',
    tag: 'HI-RES',
    isDark: true,
    primary: '#38bdf8',
    primaryHover: '#7dd3fc',
    secondary: '#818cf8',
    accentGlow: 'rgba(56, 189, 248, 0.45)',
    bgCanvas: '#081730',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #102d5c 0%, #081730 55%, #050e1f 100%)',
    bgCard: '#0f274f',
    bgSurface: '#163569',
    borderColor: '#244e94',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    fontVibe: 'retro-noir',
    cardGradient:
      'linear-gradient(145deg, rgba(56, 189, 248, 0.14) 0%, rgba(15, 39, 79, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(56, 189, 248, 0.22)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(129, 140, 248, 0.18)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
    ],
    statsColors: {
      timeListened: {
        borderTop: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.22)',
        badgeText: '#7dd3fc',
        glow: 'rgba(56, 189, 248, 0.45)',
        accentBar: '#38bdf8',
      },
      totalTracks: {
        borderTop: '#818cf8',
        badgeBg: 'rgba(129, 140, 248, 0.22)',
        badgeText: '#a5b4fc',
        glow: 'rgba(129, 140, 248, 0.45)',
        accentBar: '#818cf8',
      },
      artists: {
        borderTop: '#2dd4bf',
        badgeBg: 'rgba(45, 212, 191, 0.22)',
        badgeText: '#5eead4',
        glow: 'rgba(45, 212, 191, 0.45)',
        accentBar: '#2dd4bf',
      },
      albums: {
        borderTop: '#f43f5e',
        badgeBg: 'rgba(244, 63, 94, 0.22)',
        badgeText: '#fb7185',
        glow: 'rgba(244, 63, 94, 0.45)',
        accentBar: '#f43f5e',
      },
      duration: {
        borderTop: '#eab308',
        badgeBg: 'rgba(234, 179, 8, 0.22)',
        badgeText: '#fde047',
        glow: 'rgba(234, 179, 8, 0.45)',
        accentBar: '#eab308',
      },
    },
    visualizerPrimary: '#38bdf8',
    visualizerSecondary: '#818cf8',
    waveformPlayedTop: '#38bdf8',
    waveformPlayedBot: '#0284c7',
    waveformUnplayedTop: '#284b7a',
    waveformUnplayedBot: '#152c4c',
    waveformGlow: true,
    vars: {
      '--f-d': "'IBM Plex Sans', sans-serif",
      '--f-b': "'IBM Plex Sans', sans-serif",
      '--f-m': "'IBM Plex Mono', monospace",
      '--w-d': '600',
      '--ls-h': '.02em',
      '--tt-l': 'uppercase',
      '--r': '4px',
      '--r-sm': '3px',
      '--btn-r': '4px',
      '--clip': 'none',
      '--clip-btn': 'none',
      '--sw': '1.5',
      '--bar-r': '1px',
      '--bar-bg': 'linear-gradient(180deg, #38bdf8 0%, #818cf8 100%)',
      '--bar-cap': '#ffffff',
      '--bar-cap-h': '2px',
      '--bar-w': '3px',
      '--bar-gap': '2px',
      // Graph-paper grid plus a running oscilloscope trace — technical,
      // measurement-console imagery.
      '--tex':
        'linear-gradient(rgba(56,189,248,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.04) 1px, transparent 1px), url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27240%27%20height%3D%27120%27%3E%3Cpath%20d%3D%27M0%2C60.0%20L4%2C68.7%20L8%2C77.1%20L12%2C84.7%20L16%2C91.2%20L20%2C96.4%20L24%2C99.9%20L28%2C101.8%20L32%2C101.8%20L36%2C99.9%20L40%2C96.4%20L44%2C91.2%20L48%2C84.7%20L52%2C77.1%20L56%2C68.7%20L60%2C60.0%20L64%2C51.3%20L68%2C42.9%20L72%2C35.3%20L76%2C28.8%20L80%2C23.6%20L84%2C20.1%20L88%2C18.2%20L92%2C18.2%20L96%2C20.1%20L100%2C23.6%20L104%2C28.8%20L108%2C35.3%20L112%2C42.9%20L116%2C51.3%20L120%2C60.0%20L124%2C68.7%20L128%2C77.1%20L132%2C84.7%20L136%2C91.2%20L140%2C96.4%20L144%2C99.9%20L148%2C101.8%20L152%2C101.8%20L156%2C99.9%20L160%2C96.4%20L164%2C91.2%20L168%2C84.7%20L172%2C77.1%20L176%2C68.7%20L180%2C60.0%20L184%2C51.3%20L188%2C42.9%20L192%2C35.3%20L196%2C28.8%20L200%2C23.6%20L204%2C20.1%20L208%2C18.2%20L212%2C18.2%20L216%2C20.1%20L220%2C23.6%20L224%2C28.8%20L228%2C35.3%20L232%2C42.9%20L236%2C51.3%20L240%2C60.0%27%20fill%3D%27none%27%20stroke%3D%27%252338bdf8%27%20stroke-width%3D%273%27%2F%3E%3C%2Fsvg%3E")',
      '--tex-size': '24px 24px, 24px 24px, 240px 120px',
      '--tex-repeat': 'repeat, repeat, repeat-x',
      '--tex-position': '0 0, 0 0, left 30%',
      '--tex-op': '.6',
      '--cursor': 'auto',
    },
  },

  // 10. STUDIO REFERENCE SLATE - Studio Mastering Slate & Surgical White
  {
    id: 'monochrome-studio',
    name: 'Studio Reference Slate',
    description: 'Precision slate studio mastering console with pure surgical white meters',
    tag: 'STUDIO SLATE',
    isDark: true,
    primary: '#38bdf8',
    primaryHover: '#7dd3fc',
    secondary: '#a1a1aa',
    accentGlow: 'rgba(56, 189, 248, 0.35)',
    bgCanvas: '#141822',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #222938 0%, #141822 55%, #0d1017 100%)',
    bgCard: '#1d2331',
    bgSurface: '#272f42',
    borderColor: '#38435d',
    textPrimary: '#ffffff',
    textSecondary: '#d4d4d8',
    textMuted: '#94a3b8',
    fontVibe: 'oled-minimal',
    cardGradient:
      'linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(29, 35, 49, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(56, 189, 248, 0.15)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(161, 161, 170, 0.12)',
        position: 'top 35% right -5%',
        size: '550px',
        opacity: 0.7,
      },
    ],
    statsColors: {
      timeListened: {
        borderTop: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.20)',
        badgeText: '#7dd3fc',
        glow: 'rgba(56, 189, 248, 0.35)',
        accentBar: '#38bdf8',
      },
      totalTracks: {
        borderTop: '#a1a1aa',
        badgeBg: 'rgba(161, 161, 170, 0.20)',
        badgeText: '#e4e4e7',
        glow: 'rgba(161, 161, 170, 0.35)',
        accentBar: '#a1a1aa',
      },
      artists: {
        borderTop: '#818cf8',
        badgeBg: 'rgba(129, 140, 248, 0.20)',
        badgeText: '#a5b4fc',
        glow: 'rgba(129, 140, 248, 0.35)',
        accentBar: '#818cf8',
      },
      albums: {
        borderTop: '#f43f5e',
        badgeBg: 'rgba(244, 63, 94, 0.20)',
        badgeText: '#fda4af',
        glow: 'rgba(244, 63, 94, 0.35)',
        accentBar: '#f43f5e',
      },
      duration: {
        borderTop: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.20)',
        badgeText: '#6ee7b7',
        glow: 'rgba(16, 185, 129, 0.35)',
        accentBar: '#10b981',
      },
    },
    visualizerPrimary: '#38bdf8',
    visualizerSecondary: '#a1a1aa',
    waveformPlayedTop: '#38bdf8',
    waveformPlayedBot: '#0284c7',
    waveformUnplayedTop: '#4a5770',
    waveformUnplayedBot: '#2b3342',
    waveformGlow: true,
    vars: {
      '--f-d': "'Oswald', sans-serif",
      '--f-b': "'IBM Plex Sans', sans-serif",
      '--f-m': "'IBM Plex Mono', monospace",
      '--w-d': '600',
      '--ls-h': '.06em',
      '--tt-l': 'uppercase',
      '--r': '3px',
      '--r-sm': '2px',
      '--btn-r': '3px',
      '--clip': 'none',
      '--clip-btn': 'none',
      '--sw': '1.5',
      '--bar-r': '0px',
      '--bar-bg': 'linear-gradient(180deg, #e4e4e7 0%, #71717a 100%)',
      '--bar-cap': '#38bdf8',
      '--bar-cap-h': '2px',
      '--bar-w': '3px',
      '--bar-gap': '2px',
      // Concentric vinyl grooves in the corner, over the fine grain.
      '--tex':
        'radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px), url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27400%27%20height%3D%27400%27%3E%3Ccircle%20cx%3D%27200%27%20cy%3D%27200%27%20r%3D%2740%27%20fill%3D%27none%27%20stroke%3D%27%252394a3b8%27%20stroke-width%3D%272%27%20stroke-opacity%3D%270.50%27%2F%3E%3Ccircle%20cx%3D%27200%27%20cy%3D%27200%27%20r%3D%2770%27%20fill%3D%27none%27%20stroke%3D%27%252394a3b8%27%20stroke-width%3D%272%27%20stroke-opacity%3D%270.43%27%2F%3E%3Ccircle%20cx%3D%27200%27%20cy%3D%27200%27%20r%3D%27100%27%20fill%3D%27none%27%20stroke%3D%27%252394a3b8%27%20stroke-width%3D%272%27%20stroke-opacity%3D%270.36%27%2F%3E%3Ccircle%20cx%3D%27200%27%20cy%3D%27200%27%20r%3D%27130%27%20fill%3D%27none%27%20stroke%3D%27%252394a3b8%27%20stroke-width%3D%272%27%20stroke-opacity%3D%270.29%27%2F%3E%3Ccircle%20cx%3D%27200%27%20cy%3D%27200%27%20r%3D%27160%27%20fill%3D%27none%27%20stroke%3D%27%252394a3b8%27%20stroke-width%3D%272%27%20stroke-opacity%3D%270.22%27%2F%3E%3Ccircle%20cx%3D%27200%27%20cy%3D%27200%27%20r%3D%2714%27%20fill%3D%27%252338bdf8%27%20fill-opacity%3D%270.5%27%2F%3E%3C%2Fsvg%3E")',
      '--tex-size': '4px 4px, 400px 400px',
      '--tex-repeat': 'repeat, no-repeat',
      '--tex-position': '0 0, right -80px top 60px',
      '--tex-op': '.8',
      '--cursor': 'auto',
    },
  },
];

// Retired V1 themes remain in source history for reference, but are no longer
// offered to users. The generated V2 crew themes are the maintained versions.
const RETIRED_THEME_IDS = new Set([
  'space-cowboy',
  'queen-of-hearts',
  'radical-prodigy',
  'black-dog',
  'space-cowboy-poster',
]);

const RETIRED_THEME_MIGRATIONS: Record<string, string> = {
  'space-cowboy': 'space-cowboy-v2',
  'space-cowboy-poster': 'space-cowboy-v2',
  'queen-of-hearts': 'queen-of-hearts-v2',
  'black-dog': 'black-dog-v2',
  'radical-prodigy': 'radical-prodigy-v2',
};

export function migrateThemeId(id: string | null | undefined): string {
  if (!id) return THEME_FALLBACK_ID;
  return RETIRED_THEME_MIGRATIONS[id] ?? id;
}

export const THEME_PRESETS = THEME_PRESETS_ALL.filter((theme) => !RETIRED_THEME_IDS.has(theme.id));

const THEME_STORAGE_KEY = 'audiophile_active_theme_id_v3';
const CUSTOM_THEMES_STORAGE_KEY = 'audiophile_custom_themes_v3';
const UI_SCALE_STORAGE_KEY = 'audiophile_ui_scale_v1';
export const UI_SCALE_MIN = 0.85;
export const UI_SCALE_MAX = 1.3;

function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value));
}

export interface ThemeContextType {
  currentTheme: ThemeConfig;
  activeTheme: ThemeConfig;
  previewTheme: ThemeDocumentV1 | null;
  allThemes: ThemeConfig[];
  setThemeById: (id: string) => void;
  saveCustomTheme: (theme: ThemeConfig) => void;
  deleteCustomTheme: (id: string) => void;
  isBuiltInTheme: (id: string) => boolean;
  beginThemePreview: (theme: ThemeConfig) => ThemeDocumentV1;
  updateThemePreview: (theme: ThemeDocumentV1) => void;
  cancelThemePreview: () => void;
  saveThemePreview: () => { ok: true; theme: ThemeDocumentV1 } | { ok: false; errors: string[] };
  isThemeModalOpen: boolean;
  setIsThemeModalOpen: (open: boolean) => void;
  /** Multiplier on the app's rem baseline (index.css `html`). 1 = default. */
  uiScale: number;
  setUiScale: (scale: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Stock presets plus the four crew themes imported from the design project. */
/** Applies local token deltas to imported themes without editing generated files. */
function withOverrides(theme: ThemeConfig): ThemeConfig {
  const overrides = THEME_VAR_OVERRIDES[theme.id];
  if (!overrides) return theme;
  return { ...theme, vars: { ...(theme.vars ?? {}), ...overrides } };
}

export const ALL_THEMES: ThemeConfig[] = [
  ...CREW_THEMES.map(withOverrides),
  ...POSTER_THEMES.filter((theme) => !RETIRED_THEME_IDS.has(theme.id)).map(withOverrides),
  ...THEME_PRESETS.map(withOverrides),
];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customThemes, setCustomThemes] = useState<ThemeConfig[]>(() => {
    if (!isDemoMode) return [];
    try {
      const saved = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed)
        ? parsed.map((theme) => toThemeDocument(theme as ThemeConfig, (theme as ThemeConfig).id))
        : [];
    } catch {
      return [];
    }
  });

  const allThemes = [...ALL_THEMES, ...customThemes];
  // Tracks which design-token properties the last theme set, so they can be
  // cleared before the next theme applies its own.
  const appliedVarsRef = useRef<string[]>([]);

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    if (!isDemoMode) return THEME_FALLBACK_ID;
    try {
      return migrateThemeId(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return THEME_FALLBACK_ID;
    }
  });
  const [previewTheme, setPreviewTheme] = useState<ThemeDocumentV1 | null>(null);

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(isDemoMode);

  const [uiScale, setUiScaleState] = useState<number>(() => {
    if (!isDemoMode) return 1;
    try {
      const saved = localStorage.getItem(UI_SCALE_STORAGE_KEY);
      return saved ? clampUiScale(Number(saved)) : 1;
    } catch {
      return 1;
    }
  });

  const activeTheme = allThemes.find((t) => t.id === activeThemeId) || ALL_THEMES[0];
  const currentTheme: ThemeConfig = previewTheme ?? activeTheme;

  useEffect(() => {
    if (isDemoMode) return;
    void Promise.all([
      loadPersistentPlayerState(),
      loadUiPreference(CUSTOM_THEMES_STORAGE_KEY),
      loadUiPreference(UI_SCALE_STORAGE_KEY),
    ])
      .then(([state, savedCustomThemes, savedUiScale]) => {
        setActiveThemeId(migrateThemeId(state.preferences.themeId));
        if (savedUiScale) setUiScaleState(clampUiScale(Number(savedUiScale)));
        if (!savedCustomThemes) return;
        try {
          const parsed: unknown = JSON.parse(savedCustomThemes);
          if (Array.isArray(parsed)) {
            setCustomThemes(parsed.map((theme) => toThemeDocument(theme as ThemeConfig, (theme as ThemeConfig).id)));
          }
        } catch {
          // Ignore malformed persisted customization and retain the built-in themes.
        }
      })
      .catch(() => undefined)
      .finally(() => setPreferencesLoaded(true));
  }, []);

  // Apply CSS custom properties to document root for seamless, instant theming
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', currentTheme.primary);
    root.style.setProperty('--theme-primary-hover', currentTheme.primaryHover);
    root.style.setProperty('--theme-secondary', currentTheme.secondary);
    root.style.setProperty('--theme-glow', currentTheme.accentGlow);
    root.style.setProperty('--theme-bg-canvas', currentTheme.bgCanvas);
    root.style.setProperty(
      '--theme-bg-canvas-gradient',
      currentTheme.bgCanvasGradient || currentTheme.bgCanvas,
    );
    root.style.setProperty('--theme-bg-card', currentTheme.bgCard);
    root.style.setProperty('--theme-bg-surface', currentTheme.bgSurface);
    root.style.setProperty('--theme-border', currentTheme.borderColor);
    root.style.setProperty('--theme-text-primary', currentTheme.textPrimary);
    root.style.setProperty('--theme-text-secondary', currentTheme.textSecondary);
    root.style.setProperty('--theme-text-muted', currentTheme.textMuted);

    // Design tokens from the theme file. Tracked so switching to a theme that
    // omits a token clears the previous theme's value instead of inheriting it.
    for (const name of appliedVarsRef.current) root.style.removeProperty(name);
    const applied: string[] = [];
    const vars: Record<string, string> = currentTheme.vars ?? {};
    for (const name of Object.keys(vars)) {
      root.style.setProperty(name, vars[name]);
      applied.push(name);
    }
    appliedVarsRef.current = applied;

    // Preview documents deliberately affect the app but never persistence.
    if (previewTheme) return;
    if (isDemoMode) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, currentTheme.id);
      } catch {
        // ignore
      }
    } else if (preferencesLoaded) {
      void saveThemePreference(currentTheme.id).catch(() => undefined);
    }
  }, [currentTheme, preferencesLoaded, previewTheme]);

  // Applied separately from the theme-color effect above: it doesn't depend on
  // the active theme, and shouldn't be cleared/reapplied when that switches.
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);

  const setThemeById = (id: string) => {
    setPreviewTheme(null);
    setActiveThemeId(migrateThemeId(id));
  };

  const setUiScale = (scale: number) => {
    const clamped = clampUiScale(scale);
    setUiScaleState(clamped);
    if (isDemoMode) {
      try {
        localStorage.setItem(UI_SCALE_STORAGE_KEY, String(clamped));
      } catch {
        // ignore storage quota errors
      }
    } else {
      void saveUiPreference(UI_SCALE_STORAGE_KEY, String(clamped));
    }
  };

  const persistCustomThemes = (themes: ThemeConfig[]) => {
    if (isDemoMode) {
      try {
        localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
      } catch {
        // ignore storage quota errors
      }
    } else {
      void saveUiPreference(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
    }
  };

  const saveCustomTheme = (newTheme: ThemeConfig) => {
    const document = toThemeDocument(newTheme, (newTheme as Partial<ThemeDocumentV1>).baseThemeId ?? newTheme.id);
    setCustomThemes((prev) => {
      const filtered = prev.filter((t) => t.id !== document.id);
      const next = [...filtered, document];
      persistCustomThemes(next);
      return next;
    });
    setPreviewTheme(null);
    setActiveThemeId(document.id);
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persistCustomThemes(next);
      return next;
    });
    if (activeThemeId === id) {
      setActiveThemeId(THEME_FALLBACK_ID);
    }
    if (!isDemoMode) void commands.deleteThemeAssets(id);
  };

  const isBuiltInTheme = (id: string) => ALL_THEMES.some((theme) => theme.id === id);

  const beginThemePreview = (theme: ThemeConfig) => {
    const builtIn = isBuiltInTheme(theme.id);
    const document = toThemeDocument(theme, theme.id);
    const next = builtIn
      ? {
          ...document,
          id: `custom-${theme.id}-${Date.now().toString(36)}`,
          name: `${theme.name} Remix`,
        }
      : document;
    setPreviewTheme(next);
    return next;
  };

  const updateThemePreview = (theme: ThemeDocumentV1) => setPreviewTheme(theme);
  const cancelThemePreview = () => setPreviewTheme(null);
  const saveThemePreview = () => {
    if (!previewTheme) return { ok: false as const, errors: ['No theme draft is open'] };
    const saved = { ...previewTheme, updatedAt: new Date().toISOString() };
    const errors = validateThemeDocument(saved);
    if (errors.length) return { ok: false as const, errors };
    saveCustomTheme(saved);
    return { ok: true as const, theme: saved };
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        activeTheme,
        previewTheme,
        allThemes,
        setThemeById,
        saveCustomTheme,
        deleteCustomTheme,
        isBuiltInTheme,
        beginThemePreview,
        updateThemePreview,
        cancelThemePreview,
        saveThemePreview,
        isThemeModalOpen,
        setIsThemeModalOpen,
        uiScale,
        setUiScale,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
