CREATE INDEX listening_sessions_track_started_idx
  ON listening_sessions(track_id, started_at DESC);
CREATE INDEX listening_sessions_recent_idx
  ON listening_sessions(started_at DESC);
CREATE UNIQUE INDEX playlists_name_idx ON playlists(name COLLATE NOCASE);
