# Bebop Implementation Plan V2 — Complete Local Music Platform

## Summary

V2 turns the working vertical slice into a persistent, metadata-aware music library while preserving Bebop’s local-first and hi-fi principles.

The roadmap continues at Stage 8. Each stage is independently committed and must pass Linux and Windows CI before advancing.

Core decisions:

- Support multiple persistent library roots.
- Store catalog data, user state, and metadata overrides in SQLite.
- Precedence: database override → embedded tag → filename fallback.
- MusicBrainz enrichment is opt-in; high-confidence matches apply to the database automatically, while uncertain matches require review.
- Writing tags to files is always explicit, atomic, and backed up.
- Online integrations are disabled by default.
- Acquisition connects to a user-managed slskd instance.
- Releases are published from a new `dbgoodm/Bebop` repository.
- V2 adds common PCM formats; native DSD/DoP remains a later audio milestone.

## Architecture and Public Interfaces

- Keep one Rust crate, reorganized into internal catalog, metadata, playback, integrations, acquisition, and persistence modules.
- Use bundled SQLite through `rusqlite`, one database worker/connection, foreign keys, WAL mode, migration tests, and startup backups before schema upgrades.
- Store the database and caches in Tauri’s application-data directory. Never place database files inside music folders.
- Replace canonical-path hashes as public track identities with persistent database UUIDs. Store canonical and relative paths separately; Rust remains solely responsible for path validation.
- Perform scanning, metadata extraction, MusicBrainz work, and reconciliation off the UI thread.

Principal generated Rust/TypeScript contracts:

```ts
type LibraryRoot = {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
  availability: "online" | "offline" | "permission-error";
  watchMode: "native" | "poll" | "manual";
  trackCount: number;
  lastScanAt?: string;
};

type Track = {
  id: string;
  rootId: string;
  path: string;
  relativePath: string;
  title: string;
  sortTitle?: string;
  artists: ArtistReference[];
  albumArtists: ArtistReference[];
  albumId?: string;
  genres: string[];
  trackNumber?: number;
  trackTotal?: number;
  discNumber?: number;
  discTotal?: number;
  year?: number;
  date?: string;
  composer?: string;
  label?: string;
  catalogNumber?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
  artworkId?: string;
  technical: AudioProperties;
  available: boolean;
};

type MetadataPatch = {
  title?: string | null;
  artists?: string[] | null;
  album?: string | null;
  albumArtists?: string[] | null;
  genres?: string[] | null;
  trackNumber?: number | null;
  trackTotal?: number | null;
  discNumber?: number | null;
  discTotal?: number | null;
  year?: number | null;
  date?: string | null;
  composer?: string | null;
  label?: string | null;
  catalogNumber?: string | null;
  isrc?: string | null;
  artworkId?: string | null;
};

type SpectrumFrame = {
  sequence: number;
  positionMs: number;
  bins: number[];
  peak: number;
};

type AcquisitionJob = {
  id: string;
  status:
    | "queued"
    | "downloading"
    | "paused"
    | "verifying"
    | "importing"
    | "complete"
    | "error";
  progress: number;
  sourceUser?: string;
  targetPath?: string;
  error?: AppError;
};
```

Add typed commands for root management, paginated catalog queries, artist/album details, metadata drafts and writes, enrichment jobs, playlists, favorites, history, settings, integrations, and acquisition. Add `library://changed`, `metadata://job-progress`, `playback://spectrum`, `integration://status`, and `acquisition://progress` events.

## Staged Implementation

### Stage 8 — Persistent catalog and multiple roots

**Commit:** `feat(catalog): add persistent multi-root library`

- Add versioned SQLite migrations for roots, tracks, artists, albums, genres, artwork, metadata overrides, settings, playlists, favorites, listening sessions, enrichment results, and integration/acquisition jobs.
- Add, disable, remove, rescan, and restore multiple roots. Removing a root requires confirmation and removes catalog rows—not music files.
- Preserve entries for temporarily unavailable drives and NAS paths; mark them offline instead of deleting them.
- Convert scanning into upsert/reconciliation transactions and restore the catalog immediately on startup.
- Add pagination, search, filtering, and stable sorting so the frontend never needs the entire catalog in memory.
- Reconcile the architecture documentation with the current non-interrupting adjustable-volume behavior.

### Stage 9 — Embedded metadata, artwork, and common formats

**Commit:** `feat(metadata): index embedded tags and artwork`

- Use Lofty for embedded tag and artwork extraction. It supports the current formats and their relevant tag containers, including FLAC Vorbis comments, MP3 ID3, Ogg comments, and WAV tags. [Lofty format support](https://docs.rs/lofty/latest/lofty/)
- Index titles, multi-value artists, album artists, albums, genres, numbering, dates, composer, label, catalog number, ISRC, MusicBrainz IDs, ReplayGain tags, and embedded lyrics when available.
- Extract embedded artwork into a hash-addressed application cache; otherwise check `cover`, `folder`, and `front` images beside the album before using cached Cover Art Archive artwork.
- Add Opus, ALAC/M4A, AAC, AIFF, and WavPack. A format is advertised only after both metadata probing and real Rust playback pass fixture tests.
- Preserve filename-derived titles and `Unknown Artist`/`Unknown Album` only as explicit fallbacks.

### Stage 10 — Real artist, album, and genre navigation

**Commit:** `feat(library): connect metadata-driven discovery`

- Replace production prototype entities with database-backed artist, album, genre, and track queries.
- Wire artist and album grids, detail pages, discographies, track actions, artwork, and breadcrumbs to real entities.
- Make clicks from tracks, Home, queue, search, and Now Playing navigate to the correct entity.
- Add global search across title, artist, album, genre, composer, label, and catalog number.
- Virtualize large lists and preserve search, sort, subtab, and scroll state.
- Keep demo catalog behavior unchanged behind `VITE_BEBOP_DEMO=true`.

### Stage 11 — Tag editor and MusicBrainz enrichment

**Commit:** `feat(metadata): add safe editing and MusicBrainz enrichment`

- Add single-track and batch tag-editing drafts. Saves update SQLite immediately; files change only through an explicit “Write tags to files” review.
- Before each file write, create one retained full-file backup under an ignored `.bebop-backups/` directory beside the source, write through an adjacent temporary file, re-read and validate it, then atomically replace the original.
- Refuse writes to active playback files, read-only roots, unsupported tag containers, or paths outside enabled roots. Provide rollback from the retained backup.
- Add queued MusicBrainz JSON searches with a meaningful Bebop user agent, a global maximum of one request per second, retries for 503 responses, and persistent caching. [MusicBrainz API requirements](https://musicbrainz.org/doc/MusicBrainz_API)
- Auto-apply only an embedded MusicBrainz ID or an exact normalized album/album-artist match with matching track count/numbers and durations within two seconds. Filename-only and ambiguous matches always enter review.
- Enrichment updates SQLite overrides and audit history; it never writes files automatically.
- Cache approved 500px Cover Art Archive fronts and retain attribution/source IDs. [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API)

### Stage 12 — Live incremental indexing

**Commit:** `feat(library): add live filesystem reconciliation`

- Use the cross-platform `notify` recommended watcher with 750ms debouncing and event coalescing. [Notify documentation](https://docs.rs/notify/latest/notify/)
- Incrementally handle create, modify, rename, and delete events; suppress duplicate events caused by Bebop tag writes.
- Match moves using watcher rename data and a size plus sampled-content fingerprint so track identity, favorites, and history survive relocations.
- Run full reconciliation at startup and on demand because network filesystems and OS watchers can miss events.
- Mark missing tracks unavailable first; remove catalog records only through an explicit cleanup action.
- Emit compact library deltas so React updates affected entities without reloading the catalog.

### Stage 13 — Persistent player state and a fully real Home page

**Commit:** `feat(player): persist listening activity and collections`

- Persist queue order, current session, resume position, volume, hi-fi preference, selected output device, theme, library view state, and user settings.
- Add manual playlists and favorites for tracks, albums, and artists.
- Record Rust-authoritative listening sessions, actual played duration, completion, skips, and play counts.
- Populate Continue Listening, Recently Added, Rediscover, top artists/genres/eras, storage totals, duration totals, and listening statistics exclusively from SQLite.
- Restore a previous queue after restart but require an explicit play action; never begin audio automatically.
- Replace remaining production-local state and placeholder statistics with services backed by generated IPC.

### Stage 14 — Native spectrum and complete audio settings

**Commit:** `feat(audio): add native spectrum and output settings`

- Tap decoded PCM without blocking the output callback, send it through a bounded ring buffer, and perform FFT work on a separate Rust worker.
- Produce 64 logarithmically grouped `u8` bins at approximately 30 Hz using a Hann-windowed FFT. Drop stale frames instead of building latency.
- Emit spectrum only while playing; stop work when paused, stopped, hidden, or when visualization is disabled.
- Wire the existing visualizer to `playback://spectrum`; production must never synthesize replacement bins.
- Complete output-device selection, device-loss handling, hi-fi/adjustable-gain disclosure, persisted settings, and per-track source/output format displays.

### Stage 15 — Opt-in Last.fm and Discord integrations

**Commit:** `feat(integrations): add scrobbling and rich presence`

- Register official Bebop Last.fm and Discord applications. Inject application identifiers through release configuration; store user session credentials in the OS credential store.
- Keep both integrations disabled by default with clear privacy controls.
- Send Last.fm “now playing” on playback and scrobble once a qualifying track reaches the service threshold. Persist an idempotent outbox and retry safely after offline periods. [Last.fm scrobbling API](https://www.last.fm/api/scrobbling)
- Update Discord Rich Presence from Rust with listening state, title, artist, album, and timestamps according to the user’s detail-sharing preference. Clear presence on stop, exit, or disable. [Discord RPC](https://docs.discord.com/developers/topics/rpc)
- Integration failures must never interrupt local playback.

### Stage 16 — Optional slskd acquisition connector

**Commit:** `feat(acquisition): connect user-managed slskd`

- Replace the production Antra simulation with a typed Rust HTTP client for a separately installed slskd instance.
- Default to `http://127.0.0.1:5030`; store its API key in the OS credential store. Require HTTPS and explicit confirmation for non-loopback servers.
- Support connection testing, explicit searches, grouped results, enqueue, progress, pause, resume, cancel, verification, and import.
- Let slskd own networking and temporary downloads. Bebop only imports completed files from a configured acquisition inbox.
- Validate extension, decodeability, canonical path, and file accessibility before moving or copying into a selected writable library root.
- Never initiate searches or downloads automatically. Keep the simulated queue available only in demo mode. [slskd configuration/API](https://github.com/slskd/slskd/blob/master/docs/config.md)

### Stage 17 — Signed installers and automatic updates

**Commit:** `release: publish signed Bebop desktop updates`

- Create the new `dbgoodm/Bebop` remote without altering the archived repository or its remote.
- Produce Linux AppImage, DEB, RPM, checksums, and an Omarchy/Arch installation recipe; produce a signed Windows NSIS installer.
- Repair and validate AppImage packaging because Tauri’s Linux updater consumes AppImage artifacts.
- Add tag-triggered GitHub Release workflows, changelog generation, artifact retention, updater manifests, and stable-channel release promotion.
- Configure Tauri’s updater plugin with a committed public key and CI-held private signing key. Update verification remains mandatory. [Tauri updater signing](https://v2.tauri.app/plugin/updater/)
- Check for updates at startup no more than once daily and through “Check for updates.” Download/install only after user confirmation.
- Require protected GitHub environments for release secrets. Final Windows releases require an Authenticode certificate; unsigned builds may be marked prerelease only.

### Stage 18 — V2 hardening and final architecture map

**Commits:** `test: harden Bebop V2 workflows` and `docs: finalize Bebop V2 architecture`

- Add upgrade tests from every database schema version, corruption recovery, backup/restore instructions, and safe reset tooling.
- Run end-to-end Linux and Windows tests for indexing, navigation, editing, watching, persistence, spectrum, integrations, acquisition mocks, packaging, and updater verification.
- Add offline, unavailable-root, read-only-root, malformed-tag, interrupted-write, unavailable-DAC, rate-limit, missing-Discord, unreachable-slskd, and failed-update scenarios.
- Perform physical Linux and Windows smoke tests with 16/24-bit and 44.1/48/96/192kHz material.
- Update README, architecture, privacy, data-location, backup, release, and troubleshooting documentation.
- Refresh Graphify and confirm zero historical-prototype references.

## Test and Acceptance Criteria

- Production mode contains no mock artists, albums, history, acquisition progress, artwork, or spectrum data.
- A tagged multi-format fixture library produces correct tracks, artists, albums, genres, artwork, and technical properties.
- Untagged and malformed files remain playable with clear fallbacks.
- Metadata writes preserve decoded audio, survive simulated interruption, and can be restored from backup.
- MusicBrainz never exceeds one request per second and never auto-applies an ambiguous match.
- Multiple roots survive restart, removable/offline roots retain identity, and moves preserve history when reconcilable.
- Queue, playlists, favorites, resume state, settings, and Home statistics survive restart.
- Spectrum transport remains bounded and cannot stall playback.
- Last.fm retries do not duplicate scrobbles; Discord and all online services remain opt-in.
- slskd credentials never reach frontend state or logs, and acquisition cannot write outside configured roots.
- Linux and Windows pass formatting, linting, typechecking, frontend tests, Rust formatting, Clippy with warnings denied, Rust tests, and signed release builds.
- The folder-select → index → browse artist/album → play → edit → restart flow works with real files on Omarchy and Windows.

## Assumptions and Deferred Beyond V2

- Bebop remains local-first; all network features are visibly opt-in and playback works fully offline.
- `dbgoodm/Bebop` becomes the new release repository; the historical prototype remains immutable and ignored.
- Last.fm/Discord application registrations, Tauri signing keys, GitHub release secrets, and a Windows signing certificate are external prerequisites for Stage 17.
- MusicBrainz use is assumed non-commercial; licensing must be revisited before commercial distribution.
- File organization/automatic renaming, acoustic fingerprinting, online lyrics, gapless transitions, crossfade, EQ/DSP, native DSD/DoP, macOS packaging, mobile clients, and cloud library sync remain post-V2 work.
