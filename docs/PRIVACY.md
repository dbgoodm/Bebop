# Privacy

Bebop is local-first. Library indexing, metadata edits, playback, playlists, favorites, history,
statistics, and spectrum analysis run on the device. A new installation has every network
integration disabled, and local playback does not require an account or internet connection.

## Data that stays local

- Music paths, embedded tags, metadata overrides, listening sessions, collections, and settings are stored in the local SQLite catalog.
- Extracted and approved artwork is stored in the local hash-addressed cache.
- Last.fm session credentials use the operating-system credential store.
  They are never returned to frontend state, stored in SQLite, or intentionally logged.
- Discord and Last.fm application identifiers are injected into release builds; application
  secrets are not committed to the repository.

## Optional network activity

| Feature               | Default    | Data sent when enabled                                                              |
| --------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Update checks         | once daily | Bebop version and ordinary HTTPS request metadata to GitHub Releases                |
| MusicBrainz           | off        | reviewed title, artist, album, duration, and numbering search terms                 |
| Cover Art Archive     | off        | approved MusicBrainz release identifier                                             |
| Last.fm               | off        | tagged playback metadata and qualifying scrobbles                                   |
| Discord Rich Presence | off        | full track detail or private `Listening locally`, according to the selected setting |

Update checks never download or install automatically. MusicBrainz enrichment updates only local
database overrides.

See [online integrations](INTEGRATIONS.md), [acquisition policy](ACQUISITION.md), and
[data locations](DATA_LOCATIONS.md) for the corresponding boundaries.
