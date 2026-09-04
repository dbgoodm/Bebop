import { describe, expect, it } from 'vitest';
import { CREW_THEMES } from './crewThemes';
import { ALL_THEMES, migrateThemeId } from './themeService';
import {
  THEME_FALLBACK_ID,
  THEME_TOKEN_REGISTRY,
  serializeThemeDocument,
  toThemeDocument,
  validateThemeDocument,
} from './themeModel';

describe('ThemeDocumentV1', () => {
  it('covers every advanced token used by all four canonical V2 templates', () => {
    const registered = new Set(THEME_TOKEN_REGISTRY.map((token) => token.key));
    const used = new Set(ALL_THEMES.filter((theme) => theme.id.endsWith('-v2')).flatMap((theme) => Object.keys(theme.vars ?? {})));
    expect([...used].filter((token) => !registered.has(token))).toEqual([]);
    expect(THEME_TOKEN_REGISTRY).toHaveLength(87);
    for (const token of THEME_TOKEN_REGISTRY) {
      expect(token.label).toBeTruthy();
      expect(token.section).toBeTruthy();
      expect(token.control).toBeTruthy();
      expect(token.validate(token.defaultValue)).toBeNull();
    }
  });

  it('migrates every retired crew ID to V2 and uses Space Cowboy V2 as fallback', () => {
    expect(migrateThemeId('space-cowboy')).toBe('space-cowboy-v2');
    expect(migrateThemeId('space-cowboy-poster')).toBe('space-cowboy-v2');
    expect(migrateThemeId('queen-of-hearts')).toBe('queen-of-hearts-v2');
    expect(migrateThemeId('black-dog')).toBe('black-dog-v2');
    expect(migrateThemeId('radical-prodigy')).toBe('radical-prodigy-v2');
    expect(migrateThemeId(null)).toBe(THEME_FALLBACK_ID);
  });

  it('migrates legacy custom themes into complete versioned documents', () => {
    const legacy = { ...CREW_THEMES[0], id: 'custom-legacy', vars: { '--r': '12px' } };
    const document = toThemeDocument(legacy);
    expect(document.version).toBe(1);
    expect(document.vars?.['--r']).toBe('12px');
    expect(document.vars?.['--bar-w']).toBeTruthy();
    expect(validateThemeDocument(document)).toEqual([]);
  });

  it('strips transient and image data for clipboard-safe settings exports', () => {
    const document = toThemeDocument({ ...CREW_THEMES[0], id: 'custom-image' });
    document.images = {
      background: {
        asset: { path: 'background.png', mimeType: 'image/png', width: 1, height: 1, bytes: 68, previewUrl: 'blob:test', stagedPath: '/tmp/test' },
        fit: 'cover', position: 'center', repeat: 'no-repeat', opacity: 1, blendMode: 'normal', blur: 0,
      },
    };
    expect(JSON.parse(serializeThemeDocument(document, false)).images).toBeUndefined();
    const serialized = serializeThemeDocument(document);
    expect(serialized).not.toContain('blob:test');
    expect(serialized).not.toContain('/tmp/test');
  });
});
