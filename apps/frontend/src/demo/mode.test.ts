import { describe, expect, it } from 'vitest';
import { LOCAL_ALBUMS, LOCAL_ARTISTS, LOCAL_TRACKS } from './catalog';
import { LOCAL_RECENTLY_ADDED, LOCAL_REDISCOVER_ITEMS } from './library';
import { isDemoMode } from './mode';

describe('demo mode isolation', () => {
  it('does not expose mock media without the explicit build flag', () => {
    if (isDemoMode) return;

    expect(LOCAL_TRACKS).toEqual([]);
    expect(LOCAL_ARTISTS).toEqual([]);
    expect(LOCAL_ALBUMS).toEqual([]);
    expect(LOCAL_RECENTLY_ADDED).toEqual([]);
    expect(LOCAL_REDISCOVER_ITEMS).toEqual([]);
  });
});
