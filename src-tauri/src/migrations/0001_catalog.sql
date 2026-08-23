CREATE TABLE library_roots (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  availability TEXT NOT NULL DEFAULT 'online'
    CHECK (availability IN ('online', 'offline', 'permission-error')),
  watch_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (watch_mode IN ('native', 'poll', 'manual')),
  track_count INTEGER NOT NULL DEFAULT 0,
  last_scan_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE artists (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  sort_name TEXT,
  musicbrainz_artist_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE albums (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  sort_title TEXT,
  year INTEGER,
  date TEXT,
  label TEXT,
  catalog_number TEXT,
  musicbrainz_release_id TEXT,
  artwork_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE genres (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE artwork (
  id TEXT PRIMARY KEY NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  cache_path TEXT NOT NULL,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  source TEXT NOT NULL DEFAULT 'embedded',
  source_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY NOT NULL,
  root_id TEXT NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
  canonical_path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_title TEXT,
  album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
  extension TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration_ms INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  bit_depth INTEGER,
  track_number INTEGER,
  track_total INTEGER,
  disc_number INTEGER,
  disc_total INTEGER,
  year INTEGER,
  date TEXT,
  composer TEXT,
  label TEXT,
  catalog_number TEXT,
  isrc TEXT,
  musicbrainz_recording_id TEXT,
  artwork_id TEXT REFERENCES artwork(id) ON DELETE SET NULL,
  replaygain_track_gain REAL,
  replaygain_track_peak REAL,
  replaygain_album_gain REAL,
  replaygain_album_peak REAL,
  lyrics TEXT,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  modified_at_ms INTEGER,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(root_id, relative_path)
);

CREATE INDEX tracks_root_available_idx ON tracks(root_id, available);
CREATE INDEX tracks_title_idx ON tracks(title COLLATE NOCASE, id);
CREATE INDEX tracks_relative_path_idx ON tracks(relative_path COLLATE NOCASE, id);

CREATE TABLE track_artists (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('artist', 'album-artist')),
  position INTEGER NOT NULL,
  PRIMARY KEY(track_id, artist_id, role, position)
);

CREATE TABLE album_artists (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY(album_id, artist_id, position)
);

CREATE TABLE track_genres (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  genre_id TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY(track_id, genre_id)
);

CREATE TABLE metadata_overrides (
  track_id TEXT PRIMARY KEY NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  patch_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE metadata_audit (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE playlists (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY(playlist_id, position)
);

CREATE TABLE favorites (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('track', 'album', 'artist')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(entity_type, entity_id)
);

CREATE TABLE listening_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  played_ms INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1))
);

CREATE TABLE enrichment_results (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  query_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  confidence REAL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX enrichment_query_idx ON enrichment_results(provider, query_key);

CREATE TABLE integration_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  integration TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  last_error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE acquisition_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  source_user TEXT,
  target_path TEXT,
  provider_job_id TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE queue_entries (
  position INTEGER PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

