-- Migration 0011: Remote tracklists for full discography inspection and acquisition.
CREATE TABLE remote_tracks (
  id TEXT PRIMARY KEY NOT NULL,
  release_id TEXT NOT NULL REFERENCES remote_releases(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL,
  disc_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  duration_ms INTEGER,
  isrc TEXT,
  musicbrainz_recording_id TEXT,
  spotify_track_id TEXT,
  last_updated_at TEXT NOT NULL
);

CREATE INDEX idx_remote_tracks_release ON remote_tracks(release_id);
