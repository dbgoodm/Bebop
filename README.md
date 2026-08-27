# Bebop

Bebop is a local-first Tauri 2 music platform. It persists multiple library roots, indexes real
metadata and artwork, provides artist/album/genre discovery, and plays common PCM formats through
a Rust-owned Rodio/CPAL engine. Playlists, favorites, queue state, listening history, metadata
drafts, live indexing, and native spectrum analysis remain on the device.

## Quick start

Prerequisites: Node.js 22+, npm, and Rust 1.85+. On Omarchy/Arch, install the Tauri WebKitGTK
prerequisites before running the app; the Tauri Linux prerequisites are the source of truth for
your distribution.

```bash
npm ci
npm run tauri:dev
```

On Linux, `tauri:dev` automatically applies WebKitGTK's DMABUF workaround for the Omarchy
Wayland protocol issue. `npm run tauri:dev:x11` remains an XWayland fallback. Add one or more music
folders in Bebop, then browse or search the indexed catalog.

Useful commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
npm run tauri:build
```

Signed release builds publish Linux AppImage, DEB, RPM, and Windows NSIS artifacts. Arch/Omarchy
maintainers should use `scripts/build-linux-release-docker` for the Debian-baseline AppImage build.

## Demo mode

Browser-only visual development is opt-in:

```bash
VITE_BEBOP_DEMO=true npm run dev
```

Demo mode is the only place mock catalog data and Web Audio/synth playback are used. It is off by
default and does not activate in the production Tauri flow.

## Playback and hi-fi behavior

Bebop recognizes FLAC, WAV, MP3, Ogg Vorbis, AAC, AIFF, and M4A/ALAC. For each track it requests a
device stream matching the decoded sample rate and channel count, then falls back safely when that
stream is unavailable. The player reports source/output formats, resampling, software gain, and
device-loss fallback. A bounded Rust FFT path drives the production spectrum without blocking the
audio callback.

Hi-fi mode requests native-rate output and locks Bebop's software gain at unity. A native-rate
stream is not automatically bit-perfect: PipeWire/PulseAudio shared mode and Windows shared mode
can still process or resample audio. Bebop therefore never claims bit-perfect playback unless a
future platform-specific verification path can prove it.

## Optional online features

MusicBrainz enrichment, Last.fm, and Discord Rich Presence are disabled by default. Update checks run at most once daily, but downloads and installation always require confirmation. Bebop remains fully usable offline.

## Documentation

- [Architecture and IPC](docs/ARCHITECTURE.md)
- [Privacy](docs/PRIVACY.md) and [data locations](docs/DATA_LOCATIONS.md)
- [Backup and recovery](docs/BACKUP_AND_RECOVERY.md)
- [Online integrations](docs/INTEGRATIONS.md) and [Acquisition policy](docs/ACQUISITION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [V3 implementation plan](docs/IMPLEMENTATION_PLAN_V3.md)
- [V4 implementation plan](docs/IMPLEMENTATION_PLAN_V4.md)
