// Hand-authored, unlike crewThemes.ts which is generated from the Claude Design
// project. This variant is drawn from the "See You Space Cowboy" screen-print
// poster: flat mid-century travel-poster graphics rather than film noir.
//
// The whole look is slate + cream with a single red accent, so the Swordfish
// climbing the frame is the only saturated thing on screen.
import type { ThemeConfig } from './themeService';

const CREAM = '#ece4cf';
const CREAM_DIM = '#c4bda8';
const CREAM_FAINT = '#8b8676';
const RED = '#cf3a2b';
const SLATE = '#2f3640';
const SLATE_DEEP = '#232930';
const SAGE = '#93ac96';

const stat = (color: string) => ({
  borderTop: color,
  badgeBg: `color-mix(in oklab, ${color} 16%, transparent)`,
  badgeText: color,
  glow: 'rgba(207, 58, 43, 0.35)',
  accentBar: color,
});

export const POSTER_THEMES: ThemeConfig[] = [
  {
    id: 'space-cowboy-poster',
    name: 'Space Cowboy — Poster',
    character: 'The Drifter',
    description:
      'Screen-printed travel poster: slate sky, cream lettering, a ringed planet and the Swordfish climbing on a hairline trail. One red accent, nothing else saturated.',
    isDark: true,
    tag: 'screen-print',

    primary: RED,
    primaryHover: '#e4523f',
    secondary: CREAM,
    accentTertiary: SAGE,
    accentGlow: 'rgba(207, 58, 43, 0.4)',

    bgCanvas: SLATE,
    bgCanvasGradient:
      'radial-gradient(ellipse at 72% -16%, #46505e 0%, #343d49 34%, #272e37 66%, #171c22 100%)',
    bgCard: SLATE_DEEP,
    bgSurface: '#2a313a',
    borderColor: '#3d4753',
    borderAccent: RED,
    cardGradient: 'linear-gradient(158deg, rgba(236,228,207,.05) 0%, rgba(35,41,48,.96) 62%)',

    ambientOrbs: [],

    textPrimary: CREAM,
    textSecondary: CREAM_DIM,
    textMuted: CREAM_FAINT,

    fontVibe: 'retro-noir',
    patternOverlay: 'starfield',

    statsColors: {
      timeListened: stat(RED),
      totalTracks: stat(CREAM),
      artists: stat(SAGE),
      albums: stat('#7fa3ad'),
      duration: stat(CREAM_DIM),
    },

    visualizerPrimary: CREAM,
    visualizerSecondary: RED,
    visualizerTertiary: SAGE,
    waveformPlayedTop: RED,
    waveformPlayedBot: '#8f2a20',
    waveformUnplayedTop: '#3d4753',
    waveformUnplayedBot: '#333b45',
    waveformGlow: false,

    vars: {
      // Surfaces
      '--c-canvas': SLATE,
      '--c-canvas-g':
        'radial-gradient(ellipse at 72% -16%, #46505e 0%, #343d49 34%, #272e37 66%, #171c22 100%)',
      '--c-card': SLATE_DEEP,
      '--c-card-g': 'linear-gradient(158deg, rgba(236,228,207,.05) 0%, rgba(35,41,48,.96) 62%)',
      '--c-surface': '#2a313a',
      '--c-border': '#3d4753',
      '--c-border-a': '#55616f',

      // One accent, deliberately alone
      '--c-p': RED,
      '--c-ph': '#e4523f',
      '--c-s': CREAM,
      '--c-t': SAGE,
      '--c-glow': 'rgba(207,58,43,.4)',
      '--c-fg': CREAM,
      '--c-fg2': CREAM_DIM,
      '--c-fg3': CREAM_FAINT,

      // Poster lettering: heavy condensed display, plain body, mono for data
      '--f-d': "'Big Shoulders Display', 'Oswald', sans-serif",
      '--f-b': "'Barlow', system-ui, sans-serif",
      '--f-m': "'Space Mono', ui-monospace, monospace",
      '--f-h': "'Big Shoulders Display', sans-serif",
      '--f-q': "'Barlow', sans-serif",
      '--f-stamp': "'Big Shoulders Display', sans-serif",
      '--w-d': '900',
      '--ls-d': '.06em',
      '--ls-h': '.08em',
      '--tt-l': 'uppercase',

      // Flat print: square corners, hairline rules, no glow anywhere
      '--r': '2px',
      '--r-sm': '2px',
      '--rule': RED,
      '--rule-r': '0px',
      '--sw': '1.6',
      '--shadow': '0 10px 26px rgba(0,0,0,.45)',
      '--trans': '420ms cubic-bezier(.2,.7,.3,1)',
      '--hover-t': 'translateY(-3px)',
      '--cursor': 'crosshair',

      // Linen weave, the way a print sits on paper stock
      '--tex':
        'repeating-linear-gradient(90deg, rgba(236,228,207,.045) 0 1px, transparent 1px 3px), repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0 1px, transparent 1px 3px)',
      '--tex-size': '3px 3px',
      '--tex-op': '.9',
      '--orb-g':
        'radial-gradient(760px circle at 74% 2%, rgba(147,172,150,.10), transparent 68%), radial-gradient(620px circle at 8% 88%, rgba(236,228,207,.06), transparent 70%)',

      // Ambience: stars, cream smoke, ringed planet, contrails, the ascent.
      // The horizontal fly-past is off; this ship climbs bottom-left to top-right.
      '--op-stars': '1',
      '--op-smoke': '.85',
      '--op-ship': '0',
      '--op-planet': '.9',
      '--op-ribbons': '1',
      '--op-ascent': '1',
      '--op-scan': '0',
      '--op-glitch': '0',

      '--smoke-1': 'rgba(240,232,212,.42)',
      '--smoke-2': 'rgba(206,198,176,.16)',
      '--planet-col': SAGE,
      '--planet-hi': '#b9cdb4',
      '--planet-lo': '#6d8878',
      '--ring-col': '#7fa3ad',
      '--planet-size': '420px',
      '--planet-x': '-6%',
      '--planet-y': '-10%',
      '--ribbon-col': 'rgba(214,206,182,.55)',
      '--ascent-col': RED,
      '--trail-col': 'rgba(236,228,207,.5)',
      '--ascent-x': '4%',
      '--ascent-y': '-4%',
      '--ascent-angle': '34deg',
      '--ascent-dur': '19s',

      // Visualizer: cream bars, red caps, thin and flat
      '--bar-w': '2px',
      '--bar-gap': '3px',
      '--bar-r': '0px',
      '--bar-bg': `linear-gradient(180deg, ${CREAM} 0%, rgba(236,228,207,.25) 100%)`,
      '--bar-cap': RED,
      '--bar-cap-h': '2px',
      '--viz-glow': 'none',
      '--cap-glow': 'none',
      '--c-wave-un': '#3d4753',
      '--c-wave-lo': '#8f2a20',
      '--cover-a': 'linear-gradient(150deg, #3b434f 0%, #262c34 60%, #3a221f 100%)',
    },
  },
];
