import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CREW_THEMES } from './crewThemes';
import { POSTER_THEMES } from './posterThemes';
import { THEME_VAR_OVERRIDES } from './themeOverrides';
import { isDemoMode } from '@/demo/mode';
import {
  loadPersistentPlayerState,
  loadUiPreference,
  saveThemePreference,
  saveUiPreference,
} from './playerStateService';

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

export const THEME_PRESETS: ThemeConfig[] = [
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
    secondary: '#86efac',
    accentGlow: 'rgba(29, 185, 84, 0.45)',
    bgCanvas: '#081c10',
    bgCanvasGradient: 'radial-gradient(ellipse at 30% 0%, #113821 0%, #081c10 55%, #041009 100%)',
    bgCard: '#102e1c',
    bgSurface: '#174027',
    borderColor: '#245a38',
    textPrimary: '#ffffff',
    textSecondary: '#d1fae5',
    textMuted: '#6ee7b7',
    fontVibe: 'modern-clean',
    cardGradient:
      'linear-gradient(145deg, rgba(29, 185, 84, 0.14) 0%, rgba(16, 46, 28, 0.95) 100%)',
    ambientOrbs: [
      {
        color: 'rgba(29, 185, 84, 0.22)',
        position: 'top -5% left 10%',
        size: '600px',
        opacity: 0.8,
      },
      {
        color: 'rgba(134, 239, 172, 0.15)',
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
    visualizerSecondary: '#86efac',
    waveformPlayedTop: '#1db954',
    waveformPlayedBot: '#15803d',
    waveformUnplayedTop: '#255e3b',
    waveformUnplayedBot: '#143c24',
    waveformGlow: true,
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
  },
];

const THEME_STORAGE_KEY = 'audiophile_active_theme_id_v3';
const CUSTOM_THEMES_STORAGE_KEY = 'audiophile_custom_themes_v3';

interface ThemeContextType {
  currentTheme: ThemeConfig;
  allThemes: ThemeConfig[];
  setThemeById: (id: string) => void;
  saveCustomTheme: (theme: ThemeConfig) => void;
  deleteCustomTheme: (id: string) => void;
  isThemeModalOpen: boolean;
  setIsThemeModalOpen: (open: boolean) => void;
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
  ...POSTER_THEMES.map(withOverrides),
  ...THEME_PRESETS.map(withOverrides),
];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customThemes, setCustomThemes] = useState<ThemeConfig[]>(() => {
    if (!isDemoMode) return [];
    try {
      const saved = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const allThemes = [...ALL_THEMES, ...customThemes];
  // Tracks which design-token properties the last theme set, so they can be
  // cleared before the next theme applies its own.
  const appliedVarsRef = useRef<string[]>([]);

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    if (!isDemoMode) return 'space-cowboy';
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'space-cowboy';
    } catch {
      return 'space-cowboy';
    }
  });

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(isDemoMode);

  const currentTheme = allThemes.find((t) => t.id === activeThemeId) || ALL_THEMES[0];

  useEffect(() => {
    if (isDemoMode) return;
    void Promise.all([loadPersistentPlayerState(), loadUiPreference(CUSTOM_THEMES_STORAGE_KEY)])
      .then(([state, savedCustomThemes]) => {
        setActiveThemeId(state.preferences.themeId);
        if (!savedCustomThemes) return;
        try {
          const parsed: unknown = JSON.parse(savedCustomThemes);
          if (Array.isArray(parsed)) setCustomThemes(parsed as ThemeConfig[]);
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

    if (isDemoMode) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, currentTheme.id);
      } catch {
        // ignore
      }
    } else if (preferencesLoaded) {
      void saveThemePreference(currentTheme.id).catch(() => undefined);
    }
  }, [currentTheme, preferencesLoaded]);

  const setThemeById = (id: string) => {
    setActiveThemeId(id);
  };

  const saveCustomTheme = (newTheme: ThemeConfig) => {
    setCustomThemes((prev) => {
      const filtered = prev.filter((t) => t.id !== newTheme.id);
      const next = [...filtered, newTheme];
      if (isDemoMode) {
        try {
          localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      } else {
        void saveUiPreference(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
    setActiveThemeId(newTheme.id);
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (isDemoMode) {
        try {
          localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      } else {
        void saveUiPreference(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
    if (activeThemeId === id) {
      setActiveThemeId('space-cowboy');
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        allThemes,
        setThemeById,
        saveCustomTheme,
        deleteCustomTheme,
        isThemeModalOpen,
        setIsThemeModalOpen,
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
