# Bebop V2 architecture

## Scope

Bebop remains local-first. Rust owns the persistent SQLite catalog in Tauri's application-data
directory, indexes multiple user-selected roots, validates all paths, and owns decoding/playback.
Music folders contain only user media and explicit tag-write backups; Bebop never places its
database inside a library root.

```text
React pages/hooks
  ├─ root commands → Rust scanner → reconciliation transaction → SQLite worker
  ├─ bounded catalog queries ← pagination/search/sort/filter ← SQLite worker
  ├─ notify watcher → 750ms coalescing → per-path reconciliation → compact library deltas
  ├─ tag draft/review → metadata overrides + audit → optional atomic Lofty file write
  ├─ opt-in enrichment → rate-limited MusicBrainz worker → persistent result cache
  ├─ queue/collections/Home ← settings + listening sessions ← Rust playback monitor
  ├─ opt-in integrations → credential store + persistent outbox → Last.fm / Discord
  ├─ signed update check → GitHub latest.json → verified artifact → confirmed install
  └─ generated IPC → playback commands → Rust PlaybackEngine → Rodio / CPAL → output device
                         ↑                                      │
                         └──── Tauri events: state, position, spectrum, ended, error ────┘
```

React never runs an elapsed-time clock for native playback. Command results and the
`playback://state`, `playback://position`, `playback://ended`, and `playback://error` events are
the UI's source of truth.

## Library boundaries

Root paths are canonicalized before storage. Scans walk recursively without following symlink
loops and skip hidden, unreadable, and unsupported files. Reconciliation upserts by root and
relative path while public track identities remain database UUIDs. Before playback, Rust
canonicalizes the opaque frontend path and resolves it against an available track in an enabled
root. Temporarily unavailable roots and their identities remain in the catalog.

SQLite is bundled through `rusqlite` and owned by one worker thread/connection. Foreign keys and
WAL mode are enabled on startup. Schema changes use ordered migrations; tests upgrade every
historical version, and SQLite's online backup API creates a consistent application-data snapshot
before an upgrade. Startup runs `quick_check`; corrupt database and WAL/SHM files are moved into a
timestamped recovery directory before a clean catalog is created. Catalog queries are limited to
500 rows and use stable identity tie-breakers; React restores a bounded first page on startup.

Artist, album, and genre summaries are derived from normalized catalog relationships rather than
prototype entities. Global search runs in SQLite across track title, artist, album, genre,
composer, label, and catalog number. Artist and album detail commands return ordered real tracks;
React fetches those details on navigation and keeps demo data behind `VITE_BEBOP_DEMO=true`.

Playback-tested extensions are `flac`, `wav`, `mp3`, `ogg`, `aac`, `aif`/`aiff`, and
`m4a`/`mp4` (AAC or ALAC). Lofty reads embedded titles, artists, album artists, albums, genres,
numbering, dates, credits, identifiers, ReplayGain, lyrics, and artwork. Missing tags explicitly
fall back to the filename, `Unknown Artist`, and `Unknown Album`. Embedded or neighboring cover art
is copied into a hash-addressed application-data cache.

Lofty can parse Opus and WavPack tags, but those extensions are not advertised or indexed yet:
the current cross-platform Rodio/Symphonia backend has no production decoder for either format.
They remain behind the V2 rule that metadata probing and real Rust playback fixtures must both pass.

Database metadata overrides take precedence over embedded tags, which take precedence over the
explicit filename/unknown-value fallbacks. Saving an editor draft updates SQLite and appends an
audit row; it does not touch the media file. A separate confirmed write is rejected for active,
read-only, unavailable, disabled-root, and unsupported tracks. Before writing, Bebop retains one
full-file copy in a neighboring ignored `.bebop-backups/` directory, edits an adjacent temporary
file, decodes and hashes the audio before and after, re-reads the requested tag, and atomically
replaces the original. Rollback uses the same validated temporary-replacement path.

Single-track and batch draft commands share the same audited override model. MusicBrainz is
explicitly opt-in and runs on a blocking worker rather than the UI thread. A single
client enforces at most one request per second, retries temporary HTTP 503 responses, sends a
meaningful Bebop user agent, and caches JSON candidates in SQLite. An embedded recording ID, or one
unambiguous exact album/album-artist match with complete matching numbering and duration within two
seconds, may update the SQLite override. Every other candidate requires a user review. Enrichment
never writes tags to files. When a reviewed release has an approved front image, its 500px Cover
Art Archive representation is stored in the same hash-addressed cache, with its provider and
release ID retained in SQLite.

Enabled online roots use Notify's platform-recommended recursive watcher. A dedicated worker
coalesces bursts after 750ms and incrementally reconciles ordinary audio-file creates, changes,
renames, and removals in one SQLite transaction. Ambiguous directory and sidecar-artwork events
fall back to a full root reconciliation, as do startup and explicit rescans because OS and network
filesystem watchers can miss events. Deletes first mark tracks unavailable. Only the confirmed
`cleanup_missing_tracks` command removes those catalog rows.

Each file stores a size plus sampled-content SHA-256 fingerprint. When a former path is gone and
exactly one unavailable fingerprint matches a new path, reconciliation updates the existing row
instead of creating a new track UUID, preserving favorites and listening history. Paths touched by
Bebop's own atomic tag writer are suppressed briefly, and `.bebop-backups`/temporary files are
ignored. `library://changed` contains only changed track IDs; React patches a small delta directly
and falls back to a bounded catalog refresh for root-wide changes.

## Player state and collections

Queue order, the selected track, resume position, volume, hi-fi mode, output-device preference,
theme, and library view are stored by the SQLite worker. Startup restores those values into the UI
and audio engine, but it never starts a stream: resuming playback always requires an explicit user
action. Production theme, table, and library-view preferences use typed IPC rather than browser
storage; browser storage remains confined to demo mode.

Playlists and favorites are relational catalog data, so root reconciliation and track moves retain
their stable UUID references. The playback monitor owns listening sessions and measures wall-clock
time only while audio is actually playing. It periodically checkpoints played duration and resume
position, and records completion or skips independently of React. Play counts are completed session
counts, not generated display values.

The production Home page is a bounded SQLite projection: continue-listening, recently indexed,
rediscovery, top artist/genre/era, storage, catalog duration, and actual listening duration all
come from catalog and listening-session rows. Demo rails and acquisition simulations remain behind
`VITE_BEBOP_DEMO=true` and are not mounted by the production player page.

## IPC contracts

Rust is authoritative; [generated TypeScript bindings](../apps/frontend/src/services/tauri-bindings.ts)
are a consumer of those contracts.

| Contract                | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `AppError`              | Stable code, message, and optional string context.                                                     |
| `TrackSummary`          | A scanned local audio file. Paths remain opaque to TypeScript.                                         |
| `MetadataPatch`         | Nullable SQLite override and the reviewed payload for an explicit file-tag write.                      |
| `EnrichmentJob`         | MusicBrainz job status, cached/review candidates, and conservative auto-apply outcome.                 |
| `ScanProgress`          | Scanned-file and discovered-track counts during a scan.                                                |
| `PlaybackState`         | Track identity, state, position, duration, volume/mute, hi-fi mode, and optional output path.          |
| `AudioOutputState`      | Source/device formats plus native-rate, resampling, gain, exclusive-mode, and bit-perfect disclosures. |
| `PersistentPlayerState` | Restorable queue/checkpoint plus persisted output, theme, and library preferences.                     |
| `HomeSnapshot`          | SQLite-derived collections and aggregate listening/catalog statistics for Home.                        |
| `PlaylistSummary`       | Stable manual playlist identity, name, and current track count.                                        |
| `IntegrationStatus`     | Opt-in Last.fm/Discord configuration, connection, outbox, and error state without secrets.             |
| `UpdateStatus`          | Daily/manual signed-update availability and non-sensitive release metadata.                            |

The playback commands are `play_track`, `pause_playback`, `resume_playback`, `stop_playback`,
`seek_playback`, `set_volume`, and `get_playback_state`. Output-device and hi-fi commands are
available through typed IPC for future settings UI work.

## Audio signal path

The Rust engine creates one stream per track. In hi-fi mode it first seeks a CPAL configuration
matching the decoded track's rate and channel count; it falls back to the device's usable default
when necessary. Switching tracks or stopping releases the previous decoder, sink, and stream.

Hi-fi mode locks Bebop software gain to unity. To change volume or mute, choose **Allow software
volume** in the output-path notice; this switches the running stream to adjustable software gain
without interrupting the active track. The UI reports whether Rodio is resampling and never
labels a shared PipeWire/PulseAudio or Windows shared-mode path as bit-perfect.

Decoded interleaved PCM passes through a transparent source adapter before Rodio consumes it. The
adapter downmixes each frame and performs only a non-blocking write into a fixed-capacity lock-free
queue; a full queue replaces stale samples instead of delaying audio. A separate Rust worker applies
a 2,048-sample Hann window and FFT, groups the result into 64 logarithmic `u8` bands, and replaces a
single latest-frame slot at about 30 Hz. The Tauri emitter takes that slot rather than accumulating
events. Analysis and emission stop while paused, stopped, visualization-disabled, or window-hidden.
Production visualizers consume only `playback://spectrum`; Web Audio and idle animation remain
confined to explicit browser demo mode.

Output selection, unity-gain hi-fi mode, adjustable software gain, and visualization preference are
persisted in SQLite. Settings list real devices and show per-track source bit depth/rate/channels
beside the active output sample format/rate/channels. If a previously selected device disappears,
playback falls back to the system default and discloses that fallback rather than failing the track.

## Optional integrations

Last.fm and Discord are disabled by default and run on a dedicated integration worker. Release
builds inject `BEBOP_LASTFM_API_KEY`, `BEBOP_LASTFM_API_SECRET`, and
`BEBOP_DISCORD_APPLICATION_ID`; these identifiers are absent from ordinary development builds.
The Last.fm session key is stored under the Bebop service in the operating system credential store
and is never returned through IPC or written to SQLite.

Starting or resuming a tagged track queues a non-blocking now-playing message. Rust-authoritative
played time applies Last.fm's half-the-track-or-four-minutes threshold only to tracks longer than 30
seconds. A listening-session UUID is also the persistent outbox key, so a retry or restart cannot
create a duplicate scrobble. Offline and temporary failures use bounded exponential backoff; invalid
payloads are retained as failed instead of retried forever. Filename-only tracks with an Unknown
Artist are not sent online.

Discord presence is created and cleared by Rust, not React. Full sharing includes title, artist,
album, and a playback timestamp; private sharing reports only that local listening is active.
Presence is cleared on pause, stop, disable, exit, and track end. Last.fm, Discord, credential-store,
and IPC errors update `integration://status` but never propagate into the audio engine.

## Releases and updates

Version tags build AppImage, DEB, RPM, and NSIS artifacts in GitHub Actions. The release environment
holds the Tauri updater private key, integration identifiers, and Windows certificate; only the
public updater key is committed. Stable promotion separately verifies checksums, updater
signatures, required assets, and Windows Authenticode before publishing `latest.json`.

Rust checks the stable channel at startup at most once per 24 hours and on explicit request. It
never downloads automatically. Installation requires confirmation, uses Tauri's mandatory updater
signature verification, and stops playback only after the download verifies. Integration,
acquisition, and update failures are isolated from local playback.

## Hardware-audio smoke tests

CI compiles and packages the desktop app but cannot prove physical output, DAC sample-rate
switching, or bit-perfect delivery. Run these manual checks before a release.

### Omarchy Linux / PipeWire

1. Connect the intended DAC and select it as the system default output device.
2. Run `npm run tauri:dev`, which applies the WebKitGTK DMABUF workaround on Linux, select a folder containing a known FLAC (for example, 44.1 kHz/24-bit), and play it.
3. Confirm audible output, pause/resume, seek, volume/mute after switching out of hi-fi mode, stop, and next-track behavior.
4. Check Bebop's output-path notice. It must accurately show native-rate delivery or resampling;
   do not treat native rate alone as bit-perfect proof.
5. Inspect the DAC/receiver indicator and PipeWire routing independently if bit-perfect delivery
   is a requirement. Shared PipeWire routing may remain at a mix rate.

### Windows

1. Select the intended DAC as the Windows default output and confirm WebView2 is available.
2. Run the built executable or `npm run tauri:dev`, select the same known FLAC, and repeat the transport checks.
3. Compare Bebop's reported source/output rate with the device control panel or DAC indicator.
4. Treat Windows shared-mode output as processed unless independently verified. Bebop does not
   assert WASAPI exclusive mode or bit-perfect playback in this milestone.

## Validation

GitHub Actions runs frontend format/lint/typecheck/tests and Rust format, all-target/all-feature
Clippy with warnings denied, and all-feature tests on Linux and Windows. Separate matrix entries
package AppImage, DEB, RPM, and NSIS. Tests cover real tagged and malformed fixtures, every database
upgrade path, corruption recovery, atomic metadata rollback, watcher identity preservation,
bounded spectrum, integration idempotency, acquisition import boundaries, and updater throttling.
Hardware audio, Authenticode trust on a physical Windows installation, and DAC indicators remain
release smoke-test responsibilities because CI cannot observe them.

## Deferred beyond V2

Automatic file organization, acoustic fingerprinting, online lyrics, gapless transitions,
crossfade, EQ/DSP, native DSD/DoP, macOS packaging, mobile clients, and cloud library sync remain
future work. Opus and WavPack are not advertised until the production playback backend passes real
decoder fixtures for them.
