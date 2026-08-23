# Bebop persistent-catalog architecture

## Scope

This milestone remains local-first. Rust owns a persistent SQLite catalog in Tauri's application
data directory, indexes multiple user-selected roots, and owns decoding/playback. Music folders
contain only the user's media; Bebop never places its database inside a library root.

```text
React pages/hooks
  ├─ root commands → Rust scanner → reconciliation transaction → SQLite worker
  ├─ bounded catalog queries ← pagination/search/sort/filter ← SQLite worker
  ├─ tag draft/review → metadata overrides + audit → optional atomic Lofty file write
  ├─ opt-in enrichment → rate-limited MusicBrainz worker → persistent result cache
  └─ generated IPC → playback commands → Rust PlaybackEngine → Rodio / CPAL → output device
                         ↑                                      │
                         └──── Tauri events: state, position, ended, error ────┘
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
WAL mode are enabled on startup. Schema changes use ordered migrations, and an existing database is
backed up in the application-data directory before an upgrade. Catalog queries are limited to 500
rows and use stable identity tie-breakers; React restores a bounded first page on startup.

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

## IPC contracts

Rust is authoritative; [generated TypeScript bindings](../apps/frontend/src/services/tauri-bindings.ts)
are a consumer of those contracts.

| Contract           | Purpose                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `AppError`         | Stable code, message, and optional string context.                                                     |
| `TrackSummary`     | A scanned local audio file. Paths remain opaque to TypeScript.                                         |
| `MetadataPatch`    | Nullable SQLite override and the reviewed payload for an explicit file-tag write.                     |
| `EnrichmentJob`    | MusicBrainz job status, cached/review candidates, and conservative auto-apply outcome.                 |
| `ScanProgress`     | Scanned-file and discovered-track counts during a scan.                                                |
| `PlaybackState`    | Track identity, state, position, duration, volume/mute, hi-fi mode, and optional output path.          |
| `AudioOutputState` | Source/device formats plus native-rate, resampling, gain, exclusive-mode, and bit-perfect disclosures. |

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

The visualizer is intentionally passive for native playback. Spectrum transport is deferred;
Web Audio FFT and synthesized fallback audio are isolated to explicit browser demo mode.

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

GitHub Actions runs the same frontend format/lint/typecheck/test gates and Rust
format/Clippy-with-warnings-denied/test gates on Linux and Windows. It packages a Linux `.deb`
and Windows NSIS bundle. Hardware audio is intentionally outside CI coverage.

## Deferred work

File watching, native spectrum samples, Last.fm, Discord presence, acquisition, installers beyond
CI bundles, code signing, and auto-updates remain deferred to later stages in the V2 plan.
