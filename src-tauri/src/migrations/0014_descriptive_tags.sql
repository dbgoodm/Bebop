-- Descriptive tags for the playlist tag picker and starter "vibe" playlists.
-- Sourced from MusicBrainz genres/tags, Last.fm top tags, and locally-computed
-- Song DNA descriptors — layered alongside (not replacing) the existing
-- ID3-derived genres/track_genres tables, which still back genre browsing.
CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  category TEXT NOT NULL CHECK (category IN ('genre', 'mood', 'instrument', 'scene')),
  UNIQUE(name, category)
);

CREATE TABLE track_tags (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('musicbrainz', 'lastfm', 'song-dna')),
  weight REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY(track_id, tag_id, source)
);

CREATE INDEX track_tags_tag_idx ON track_tags(tag_id, track_id);
