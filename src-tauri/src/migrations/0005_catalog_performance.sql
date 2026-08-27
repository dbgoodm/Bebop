-- The artist grid is intentionally album-artist based. These indexes support
-- its keyset pages and avoid scanning featured/track-only performer rows.
CREATE INDEX IF NOT EXISTS album_artists_artist_album_idx
  ON album_artists(artist_id, album_id);
CREATE INDEX IF NOT EXISTS album_artists_album_artist_idx
  ON album_artists(album_id, artist_id);
CREATE INDEX IF NOT EXISTS artists_name_id_idx
  ON artists(name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS tracks_album_available_idx
  ON tracks(album_id, available, id);
CREATE INDEX IF NOT EXISTS track_artists_role_artist_track_idx
  ON track_artists(role, artist_id, track_id);
