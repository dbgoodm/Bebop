import { describe, expect, it } from 'vitest';
import { CREW_THEMES } from './crewThemes';
import { parseFill, parseGlow, splitTopLevel, visualizerStyleFromVars } from './visualizerStyle';

describe('splitTopLevel', () => {
  it('keeps a colour function together', () => {
    expect(splitTopLevel('#e08b1e 0 4px, rgba(0,0,0,.55) 4px 6px')).toEqual([
      '#e08b1e 0 4px',
      'rgba(0,0,0,.55) 4px 6px',
    ]);
  });
});

describe('parseFill', () => {
  it('reads a downward gradient bottom-up, because bar offsets start at the foot', () => {
    // 180deg puts the first stop at the top of the bar, which is offset 1 here.
    const fill = parseFill('linear-gradient(180deg, #e2b23c 0%, #8a5f18 100%)');
    expect(fill).toEqual({
      kind: 'linear',
      stops: [
        { offset: 0, color: '#8a5f18' },
        { offset: 1, color: '#e2b23c' },
      ],
    });
  });

  it('keeps a three-stop gradient in order', () => {
    const fill = parseFill('linear-gradient(180deg, #f0d27a 0%, #e0344e 45%, #6b1224 100%)');
    expect(fill.kind).toBe('linear');
    if (fill.kind !== 'linear') return;
    expect(fill.stops.map((s) => s.color)).toEqual(['#6b1224', '#e0344e', '#f0d27a']);
    expect(fill.stops.map((s) => s.offset)).toEqual([0, 0.55, 1]);
  });

  it('turns a repeating gradient into bands with a period', () => {
    // Black Dog's segmented meter: 4px of amber, 2px of near-black, repeating.
    const fill = parseFill(
      'repeating-linear-gradient(0deg, #e08b1e 0 4px, rgba(0,0,0,.55) 4px 6px)',
    );
    expect(fill).toEqual({
      kind: 'repeating',
      period: 6,
      bands: [
        { from: 0, to: 4, color: '#e08b1e' },
        { from: 4, to: 6, color: 'rgba(0,0,0,.55)' },
      ],
    });
  });

  it('falls back to a solid colour for anything it cannot parse', () => {
    expect(parseFill('#ffffff')).toEqual({ kind: 'solid', color: '#ffffff' });
    expect(parseFill(undefined)).toEqual({ kind: 'solid', color: '#ffffff' });
  });
});

describe('parseGlow', () => {
  it('takes the blur radius and colour off a box-shadow', () => {
    expect(parseGlow('0 0 8px rgba(226,178,60,.3)')).toEqual({
      color: 'rgba(226,178,60,.3)',
      blur: 8,
    });
  });

  it('treats none as no glow', () => {
    expect(parseGlow('none')).toEqual({ color: null, blur: 0 });
    expect(parseGlow(undefined)).toEqual({ color: null, blur: 0 });
  });
});

describe('visualizerStyleFromVars', () => {
  it('gives each crew theme the bar treatment its tokens describe', () => {
    const styleFor = (id: string) =>
      visualizerStyleFromVars(CREW_THEMES.find((theme) => theme.id === id)?.vars);

    const jet = styleFor('black-dog-v2');
    expect(jet.barWidth).toBe(9);
    expect(jet.barRadius).toBe(0);
    expect(jet.fill.kind).toBe('repeating');
    expect(jet.capColor).toBe('#eef1f2');
    expect(jet.glowColor).toBeNull();

    const faye = styleFor('queen-of-hearts-v2');
    expect(faye.barWidth).toBe(7);
    expect(faye.barRadius).toBe(2);
    expect(faye.capHeight).toBe(3);
    expect(faye.glowBlur).toBe(10);

    const ed = styleFor('radical-prodigy-v2');
    expect(ed.barGap).toBe(5);
    expect(ed.capColor).toBe('#3fd8e8');

    // No two crew themes may collapse onto the same bar geometry.
    const widths = CREW_THEMES.map((t) => visualizerStyleFromVars(t.vars).barWidth);
    expect(new Set(widths).size).toBeGreaterThan(1);
  });

  it('clamps a fully-round radius to half the bar width', () => {
    const style = visualizerStyleFromVars({ '--bar-w': '6px', '--bar-r': '9999px' });
    expect(style.barRadius).toBe(3);
  });

  it('reports no cap when the theme asks for none', () => {
    expect(
      visualizerStyleFromVars({ '--bar-cap': 'transparent', '--bar-cap-h': '0px' }).capColor,
    ).toBeNull();
  });
});
