# Bebop vertical-slice architecture

## Scope

This milestone is deliberately local-first. A user selects a folder, Rust scans supported audio
files, React renders the returned summaries, and Rust owns decoding/playback. There is no media
upload, database, watcher, tag editor, cloud catalog, or acquisition service.

```text
React pages/hooks
  ├─ Tauri dialog → scan_library(root) → Rust scanner → TrackSummary[]
  └─ generated IPC → playback commands → Rust PlaybackEngine → Rodio / CPAL → output device
                         ↑                                      │
                         └──── Tauri events: state, position, ended, error ────┘
```

React never runs an elapsed-time clock for native playback. Command results and the
`playback://state`, `playback://position`, `playback://ended`, and `playback://error` events are
the UI's source of truth.

## Library boundaries

`scan_library` canonicalizes the selected root before storing it. It walks recursively without
following symlink loops and skips hidden, unreadable, and unsupported files. Each track ID is
derived from its canonical path. Before playback, Rust canonicalizes the requested path again and
rejects anything outside the active root.

Supported extensions are `flac`, `wav`, `mp3`, and `ogg`. Scans return filename-derived titles,
path, extension, file size, and available duration/sample-rate/channel/bit-depth data.

## IPC contracts

Rust is authoritative; [generated TypeScript bindings](../apps/frontend/src/services/tauri-bindings.ts)
are a consumer of those contracts.

| Contract           | Purpose                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `AppError`         | Stable code, message, and optional string context.                                                     |
| `TrackSummary`     | A scanned local audio file. Paths remain opaque to TypeScript.                                         |
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
volume** in the output-path notice; this switches out of hi-fi mode and stops the active track so
the next selection uses the new policy. The UI reports whether Rodio is resampling and never
labels a shared PipeWire/PulseAudio or Windows shared-mode path as bit-perfect.

The visualizer is intentionally passive for native playback. Spectrum transport is deferred;
Web Audio FFT and synthesized fallback audio are isolated to explicit browser demo mode.

## Hardware-audio smoke tests

CI compiles and packages the desktop app but cannot prove physical output, DAC sample-rate
switching, or bit-perfect delivery. Run these manual checks before a release.

### Omarchy Linux / PipeWire

1. Connect the intended DAC and select it as the system default output device.
2. Run `npm run tauri:dev`, select a folder containing a known FLAC (for example, 44.1 kHz/24-bit), and play it.
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

SQLite persistence, embedded tag editing, MusicBrainz, file watching, native spectrum samples,
Last.fm, Discord presence, acquisition, installers beyond CI bundles, code signing, and
auto-updates remain deferred.
