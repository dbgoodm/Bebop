import { describe, expect, it } from 'vitest';
import { CREW_THEMES } from './crewThemes';

/** The shape vocabulary. Colour alone is not a theme. */
const GEOMETRY_TOKENS = ['--r', '--r-sm', '--btn-r', '--clip', '--f-d', '--f-m'];

describe('crew themes', () => {
  it('ships the four Cowboy Bebop crew themes', () => {
    expect(CREW_THEMES.map((theme) => theme.id)).toEqual([
      'space-cowboy-v2',
      'queen-of-hearts-v2',
      'black-dog-v2',
      'radical-prodigy-v2',
    ]);
  });

  it('carries design tokens beyond colour so themes can change geometry', () => {
    for (const theme of CREW_THEMES) {
      const vars = theme.vars ?? {};
      // Geometry, typography and motion are what make a theme more than a recolour.
      for (const token of GEOMETRY_TOKENS) {
        expect(vars[token], `${theme.id} is missing ${token}`).toBeTruthy();
      }
      for (const token of ['--bar-w', '--trans', '--tex']) {
        expect(vars[token], `${theme.id} is missing ${token}`).toBeTruthy();
      }
    }
  });

  // The failure this guards against: an import that keeps the palette but
  // flattens every theme onto one silhouette, so the four read as recolours.
  it('gives the themes genuinely different silhouettes, not one shape recoloured', () => {
    for (const token of GEOMETRY_TOKENS) {
      const values = new Set(CREW_THEMES.map((theme) => theme.vars?.[token]));
      expect(values.size, `every theme shares ${token} = ${[...values][0]}`).toBeGreaterThan(1);
    }
  });

  it('wires every geometry token to a consumer in the stylesheet', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    // A token nothing reads is a token that does nothing, which is how the
    // shape half of these themes went missing the first time.
    for (const token of [...GEOMETRY_TOKENS, '--clip-btn', '--bar-r', '--sw']) {
      expect(css, `nothing reads ${token}`).toContain(`var(${token}`);
    }
  });

  // NOTE: this deliberately does not assert design.md's "bars are thin (2-4px),
  // every theme has a cap" rule. The design project specifies 3/7/9/4px bars and
  // leaves Space Cowboy's cap transparent, and these values are a verbatim copy
  // of that source. Reconcile in the design project, then re-import — never here.
  it('gives every theme its own visualizer bar treatment', () => {
    for (const theme of CREW_THEMES) {
      const vars = theme.vars ?? {};
      for (const token of ['--bar-w', '--bar-gap', '--bar-r', '--bar-bg']) {
        expect(vars[token], `${theme.id} is missing ${token}`).toBeTruthy();
      }
      expect(Number.parseFloat(vars['--bar-w']), `${theme.id} bar width`).toBeGreaterThan(0);
    }
    const widths = new Set(CREW_THEMES.map((theme) => theme.vars?.['--bar-w']));
    expect(widths.size, 'every theme shares one bar width').toBeGreaterThan(1);
  });

  it('opts each theme into its own ambience rather than sharing one texture', () => {
    const signature = (id: string) => {
      const vars = CREW_THEMES.find((theme) => theme.id === id)?.vars ?? {};
      return ['--op-stars', '--op-smoke', '--op-ship', '--op-scan', '--op-glitch']
        .map((token) => vars[token] ?? '0')
        .join(',');
    };
    // Spike gets smoke and a ship; Ed gets the CRT. They must not be identical.
    expect(signature('space-cowboy-v2')).not.toBe(signature('radical-prodigy-v2'));
    expect(signature('space-cowboy-v2')).toContain('.9');
  });
});

describe('local overrides folded into Space Cowboy', () => {
  it('flies the Swordfish in front of content instead of the old fly-past', async () => {
    const { ALL_THEMES } = await import('./themeService');
    const spike = ALL_THEMES.find((theme) => theme.id === 'space-cowboy-v2');
    const vars = spike?.vars ?? {};
    expect(vars['--op-ascent']).toBe('1');
    expect(vars['--op-ship']).toBe('0');
  });

  it('squares the meter off and gives it a Swordfish-red peak cap', async () => {
    const { ALL_THEMES } = await import('./themeService');
    const { visualizerStyleFromVars } = await import('./visualizerStyle');
    const spike = ALL_THEMES.find((theme) => theme.id === 'space-cowboy-v2');
    const style = visualizerStyleFromVars(spike?.vars);
    // The design project asks for 9999px here; flat fills suit the theme better.
    expect(style.barRadius).toBe(0);
    expect(style.capColor).toBe('#d33a2c');
    expect(style.capHeight).toBe(2);
  });

  it('leaves the generated theme file untouched by the override', async () => {
    const { CREW_THEMES } = await import('./crewThemes');
    const generated = CREW_THEMES.find((theme) => theme.id === 'space-cowboy-v2');
    expect(generated?.vars?.['--op-ascent']).toBeUndefined();
  });

  it('rakes the flight path to the viewport diagonal so it truly reaches the corner', async () => {
    const { flightFor } = await import('@/components/atoms/ThemeAmbience');
    for (const [w, h] of [
      [1440, 900],
      [2560, 1440],
      [1200, 1600],
      [3440, 1440],
    ]) {
      const { angle, travel } = flightFor(w, h);
      // Angle from vertical must match the diagonal, or the craft exits through
      // the top (too shallow) or the side (too steep).
      const expected = (Math.atan2(w, h) * 180) / Math.PI;
      expect(Math.abs(angle - expected)).toBeLessThan(0.2);
      // And it has to travel at least the diagonal to clear both corners.
      expect(travel).toBeGreaterThan(Math.hypot(w, h));
    }
  });
});
