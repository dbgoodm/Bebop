ALTER TABLE tracks ADD COLUMN content_fingerprint TEXT;
CREATE INDEX tracks_move_fingerprint_idx
  ON tracks(root_id, file_size, content_fingerprint, available);
UPDATE library_roots SET watch_mode = 'native' WHERE watch_mode = 'manual';
