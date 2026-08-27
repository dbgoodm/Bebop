-- Versioned analysis is separate from catalog scanning: changing an extractor
-- invalidates only these rows, never tags, history, or saved playlist snapshots.
CREATE TABLE audio_features (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  analysis_version INTEGER NOT NULL,
  bpm REAL,
  musical_key TEXT,
  loudness_db REAL NOT NULL,
  energy REAL NOT NULL,
  spectral_centroid_hz REAL NOT NULL,
  spectral_rolloff_hz REAL NOT NULL,
  dynamic_range_db REAL NOT NULL,
  analyzed_at TEXT NOT NULL,
  PRIMARY KEY(track_id, analysis_version)
);

CREATE INDEX audio_features_version_idx
  ON audio_features(analysis_version, analyzed_at);

ALTER TABLE playlists ADD COLUMN description TEXT;
ALTER TABLE playlists ADD COLUMN generated INTEGER NOT NULL DEFAULT 0 CHECK (generated IN (0, 1));
ALTER TABLE playlists ADD COLUMN generation_request_json TEXT;

CREATE INDEX playlist_tracks_track_idx ON playlist_tracks(track_id, playlist_id);
