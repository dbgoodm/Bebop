-- Normalized persistent storage for remote artists and releases discovered via MusicBrainz.
CREATE TABLE remote_artists (
  id TEXT PRIMARY KEY NOT NULL,
  musicbrainz_artist_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_name TEXT,
  disambiguation TEXT,
  type TEXT,
  country TEXT,
  raw_json TEXT,
  last_refreshed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE remote_releases (
  id TEXT PRIMARY KEY NOT NULL,
  musicbrainz_release_group_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sort_title TEXT,
  year INTEGER,
  date TEXT,
  primary_type TEXT,
  secondary_types TEXT,
  disambiguation TEXT,
  catalog_number TEXT,
  label TEXT,
  artwork_url TEXT,
  artwork_attribution TEXT,
  artwork_source TEXT,
  raw_json TEXT,
  last_refreshed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE remote_release_artists (
  remote_release_id TEXT NOT NULL REFERENCES remote_releases(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  musicbrainz_artist_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(remote_release_id, position)
);

CREATE TABLE entity_merges (
  id TEXT PRIMARY KEY NOT NULL,
  local_entity_type TEXT NOT NULL CHECK (local_entity_type IN ('artist', 'album')),
  local_id TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 1 CHECK (reviewed IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(local_entity_type, local_id, remote_id)
);

CREATE INDEX remote_artists_mbid_idx ON remote_artists(musicbrainz_artist_id);
CREATE INDEX remote_releases_title_idx ON remote_releases(title COLLATE NOCASE, id);
CREATE INDEX remote_release_artists_mbid_idx ON remote_release_artists(musicbrainz_artist_id, remote_release_id);
CREATE INDEX entity_merges_lookup_idx ON entity_merges(local_entity_type, local_id);
CREATE INDEX entity_merges_remote_idx ON entity_merges(local_entity_type, remote_id);
