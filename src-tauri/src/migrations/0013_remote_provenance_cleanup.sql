-- Remove remote catalog rows that did not come from MusicBrainz.
--
-- Two earlier paths wrote non-MusicBrainz data into these tables:
--   1. `refresh_artist_discography` synthesized `artist-<local id>` values for the
--      `musicbrainz_artist_id` column when an artist had no MusicBrainz match, which
--      broke the MBID merge key and fabricated a provider ID.
--   2. A Deezer resolver populated releases keyed as `deezer-<id>`, which can never
--      resolve a MusicBrainz tracklist.
--
-- Deleting these rows only discards re-fetchable cache: local artists, albums,
-- tracks, playlists, favorites, and history are untouched. Anything still wanted is
-- refetched from MusicBrainz on the next discography sync.

DELETE FROM entity_merges
WHERE remote_id IN (
  SELECT id FROM remote_releases WHERE musicbrainz_release_group_id LIKE 'deezer-%'
);

DELETE FROM remote_tracks
WHERE release_id IN (
  SELECT id FROM remote_releases WHERE musicbrainz_release_group_id LIKE 'deezer-%'
);

DELETE FROM remote_release_artists
WHERE remote_release_id IN (
  SELECT id FROM remote_releases WHERE musicbrainz_release_group_id LIKE 'deezer-%'
);

DELETE FROM remote_releases WHERE musicbrainz_release_group_id LIKE 'deezer-%';

DELETE FROM remote_artists WHERE musicbrainz_artist_id LIKE 'artist-%';

-- Force a fresh discography pass for every artist so the cleared cache is rebuilt
-- from MusicBrainz rather than left looking permanently empty.
UPDATE artists SET discography_checked_at = NULL;
