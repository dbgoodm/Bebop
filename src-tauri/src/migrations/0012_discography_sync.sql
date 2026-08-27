-- Track library-wide MusicBrainz discography synchronization per artist so the
-- background sync is resumable and does not re-query artists on every run.
-- A NULL value means the artist has never been checked.
ALTER TABLE artists ADD COLUMN discography_checked_at TEXT;

CREATE INDEX artists_discography_checked_idx ON artists(discography_checked_at);
