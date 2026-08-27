-- Local lyric tags remain authoritative. Remote LRCLIB responses are cached by
-- a stable recording identity so opening Now Playing never needs to repeat a
-- successful lookup.
CREATE TABLE lyrics_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  document_json TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
