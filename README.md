# Bebop

Bebop is a local-first Tauri 2 music player. The current vertical slice selects a folder,
scans tagged common PCM music formats, displays the real tracks, and plays one through a Rust-owned
Rodio/CPAL engine.

## Quick start

Prerequisites: Node.js 22+, npm, and Rust 1.85+. On Omarchy/Arch, install the Tauri WebKitGTK
prerequisites before running the app; the Tauri Linux prerequisites are the source of truth for
your distribution.

```bash
npm ci
npm run tauri:dev
```

On Linux, `tauri:dev` automatically applies WebKitGTK's DMABUF workaround for the Omarchy
Wayland protocol issue. `npm run tauri:dev:x11` remains an XWayland fallback. Select a music
folder in Bebop, then choose a scanned track to play it.

Useful commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
cargo fmt --check
cargo clippy -- -D warnings
cargo test
npm run tauri:build
```

The local Linux package is produced at `target/release/bundle/deb/`.

## Demo mode

Browser-only visual development is opt-in:

```bash
VITE_BEBOP_DEMO=true npm run dev
```

Demo mode is the only place mock catalog data and Web Audio/synth playback are used. It is off by
default and does not activate in the production Tauri flow.

## Playback and hi-fi behavior

Bebop recognizes FLAC, WAV, MP3, Ogg Vorbis, AAC, AIFF, and M4A/ALAC. For each track it requests a device stream matching
the decoded sample rate and channel count, then falls back safely when that stream is unavailable.
The player reports the active source and output format, resampling, and software-gain status.

Hi-fi mode requests native-rate output and locks Bebop's software gain at unity. A native-rate
stream is not automatically bit-perfect: PipeWire/PulseAudio shared mode and Windows shared mode
can still process or resample audio. Bebop therefore never claims bit-perfect playback unless a
future platform-specific verification path can prove it.

See [architecture documentation](docs/ARCHITECTURE.md) for IPC contracts, security boundaries,
and hardware smoke tests.
