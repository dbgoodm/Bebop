ALTER TABLE acquisition_jobs ADD COLUMN remote_filename TEXT;
ALTER TABLE acquisition_jobs ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE acquisition_jobs ADD COLUMN search_id TEXT;

CREATE INDEX acquisition_jobs_updated_idx
  ON acquisition_jobs(updated_at DESC);
