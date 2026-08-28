import { describe, expect, it } from 'vitest';
import { POSTER_THEMES } from './posterThemes';

const poster = POSTER_THEMES[0];
const vars = poster.vars ?? {};

describe('Space Cowboy — Poster', () => {
  it('uses the ascending Swordfish, not the horizontal fly-past', () => {
    expect(vars['--op-ascent']).toBe('1');
    expect(vars['--op-ship']).toBe('0');
  });

  it('opts into the poster scenery', () => {
    for (const token of ['--op-planet', '--op-ribbons', '--op-stars', '--op-smoke']) {
      expect(Number.parseFloat(vars[token]), token).toBeGreaterThan(0);
    }
  });

  it('keeps red as the only saturated colour', () => {
    // Cream, slate and sage carry the design; the accent stands alone.
    expect(poster.primary).toBe('#cf3a2b');
    expect(poster.textPrimary).toBe('#ece4cf');
    expect(poster.secondary).toBe('#ece4cf');
  });

  it('reads as flat print — square corners and no glow', () => {
    expect(vars['--viz-glow']).toBe('none');
    expect(vars['--cap-glow']).toBe('none');
    expect(poster.waveformGlow).toBe(false);
    expect(Number.parseFloat(vars['--r'])).toBeLessThanOrEqual(2);
  });

  it('recolours the smoke to cream rather than the default cool grey', () => {
    // Warm, not blue: assert the relationship rather than an exact triple, so
    // tuning the tint does not break the test.
    const [r, , b] = (vars['--smoke-1'].match(/[\d.]+/g) ?? []).map(Number);
    expect(r).toBeGreaterThan(b);
  });

  it('flies the Swordfish on a diagonal from the lower left', () => {
    expect(Number.parseFloat(vars['--ascent-angle'])).toBeGreaterThan(15);
    expect(Number.parseFloat(vars['--ascent-x'])).toBeLessThan(20);
  });
});
