CREATE TABLE metadata_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('track', 'album', 'artist', 'library')),
  scope_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'paused', 'review', 'complete', 'cancelled', 'error')),
  total_tracks INTEGER NOT NULL DEFAULT 0,
  processed_tracks INTEGER NOT NULL DEFAULT 0,
  matched_tracks INTEGER NOT NULL DEFAULT 0,
  auto_written_tracks INTEGER NOT NULL DEFAULT 0,
  review_tracks INTEGER NOT NULL DEFAULT 0,
  failed_tracks INTEGER NOT NULL DEFAULT 0,
  deferred_tracks INTEGER NOT NULL DEFAULT 0,
  current_track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  last_error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE metadata_job_tracks (
  job_id TEXT NOT NULL REFERENCES metadata_jobs(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'review', 'written', 'deferred', 'complete', 'error', 'cancelled')),
  source TEXT,
  fingerprint TEXT,
  error_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(job_id, track_id)
);

CREATE TABLE metadata_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES metadata_jobs(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  recording_mbid TEXT,
  release_mbid TEXT,
  confidence REAL NOT NULL,
  requires_review INTEGER NOT NULL CHECK (requires_review IN (0, 1)),
  candidate_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX metadata_jobs_status_idx ON metadata_jobs(status, updated_at);
CREATE INDEX metadata_job_tracks_pending_idx ON metadata_job_tracks(job_id, status, updated_at);
CREATE INDEX metadata_candidates_review_idx ON metadata_candidates(job_id, requires_review, track_id);
