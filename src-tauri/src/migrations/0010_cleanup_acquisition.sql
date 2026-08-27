-- Migration 0010: Cleanup acquisition and slskd state.
-- Removes historical acquisition tables and settings safely without touching
-- library roots, tracks, albums, artists, artwork, playlists, or music files.

DROP TABLE IF EXISTS acquisition_jobs;
DROP TABLE IF EXISTS acquisition_settings;
