# Online integrations

Bebop is fully functional offline. Last.fm and Discord Rich Presence are separate opt-in settings
and are disabled on a new installation.

## Release configuration

Official application registrations must be created outside the repository. Release builds accept:

- `BEBOP_LASTFM_API_KEY` and `BEBOP_LASTFM_API_SECRET`
- `BEBOP_DISCORD_APPLICATION_ID`

Do not commit the Last.fm secret. The identifiers may be supplied at compile time by CI; runtime
environment variables are supported for local integration testing.

## Last.fm privacy and reliability

The user supplies a Last.fm session key after completing Last.fm's authentication flow. Bebop puts
that key in the native operating-system credential store under service `Bebop`; SQLite and frontend
state contain only enabled/status flags. Disconnect removes the credential.

While enabled, Bebop sends tagged title, artist, album, duration, numbering, and MusicBrainz ID when
available. Unknown-artist/filename-only catalog entries are not submitted. Qualifying scrobbles are
stored in SQLite under their listening-session UUID before delivery. Successful UUIDs remain marked
complete for idempotency, while offline, temporary, and reauthentication failures retry without
blocking playback.

## Discord privacy

Full detail shares title, artist, album, and the playback start timestamp. Private detail shares
only `Listening locally`. Presence is cleared when playback is paused or stopped, the track ends,
the integration is disabled, or Bebop exits. If Discord is absent, local playback continues and the
settings status reports that presence is unavailable.
