# Bebop clean rebuild and vertical-slice plan

## Goal

Rebuild Bebop as a local-first Tauri 2 music player. `Bebop-Qwen/` is an immutable,
ignored historical archive. The first product milestone supports selecting a music folder,
scanning real files, displaying them in the frontend, and playing a local track through a
native Rust audio engine.

Each stage is performed and committed independently. Start a new Codex conversation for each
stage and commit only after its acceptance checks pass.

## Stage 0 — Archive and initialize

**Suggested model:** GPT-5.6 Luna, medium reasoning

- Preserve `Bebop-Qwen/`, including its nested Git repository, remote, tracked, and untracked
  files.
- Initialize the parent repository at `/home/nerd/Projects/Bebop`.
- Ignore `Bebop-Qwen/` in `.gitignore` and `.graphifyignore`.
- Copy the prototype to `apps/frontend`; never move or delete archive source.
- Use npm workspaces and a root `package-lock.json`.

**Commit:** `chore: initialize clean Bebop workspace`

## Stage 1 — Import and clean the frontend

**Suggested model:** GPT-5.6 Terra, medium reasoning

- Treat `bebop-music-player` as the authoritative product UI.
- Rename the package to `@bebop/frontend` and remove Google AI Studio, Gemini, Express,
  dotenv, metadata, and obsolete documentation.
- Use practical one-way Atomic Design:

  ```text
  src/
  ├── components/{atoms,molecules,organisms,templates}/
  ├── pages/
  ├── hooks/
  ├── services/
  ├── types/
  └── demo/
  ```

- Keep demo catalog data exclusively under `src/demo/`, enabled only by
  `VITE_BEBOP_DEMO=true`.
- Add ESLint, Prettier, Vitest, and React Testing Library.

**Acceptance:** `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.

**Commit:** `refactor(frontend): import prototype into atomic application`

## Stage 2 — Install Graphify and create the baseline map

**Suggested model:** GPT-5.6 Luna, low reasoning

- Install `uv`, then `graphifyy` with `uv tool install graphifyy`.
- Register the project Codex skill with `graphify install --project --platform codex`.
- Enable Codex multi-agent mode only where Graphify requires it.
- In a fresh turn, run `$graphify .` at the repository root.
- Confirm the graph has no `Bebop-Qwen/` path, node, or reference.
- Commit `graphify-out/graph.html`, `graphify-out/GRAPH_REPORT.md`, and
  `graphify-out/graph.json`; ignore Graphify cache and cost artifacts.

**Commit:** `docs: add Graphify project map`

## Stage 3 — Tauri foundation and typed IPC

**Suggested model:** GPT-5.6 Terra, high reasoning

- Create only the `src-tauri` Rust workspace member; do not add speculative subcrates.
- Configure Tauri 2 for `apps/frontend`, Vite port 1420, Linux bundles, and Windows bundles.
- Make Rust authoritative for IPC contracts and generate TypeScript bindings with
  Specta/Tauri Specta.
- Add `AppError`, `TrackSummary`, `PlaybackState`, and `ScanProgress` contracts.
- Manage canonical active-library root and playback engine state in Rust.
- Restrict Tauri capabilities to the dialog/filesystem needs of this vertical slice.

**Commit:** `feat(desktop): add Tauri shell and typed IPC foundation`

## Stage 4 — Real library scanning

**Suggested model:** GPT-5.6 Terra, medium reasoning

- Select a library folder using the Tauri dialog plugin.
- Implement `scan_library(root)` in Rust: canonicalize root; recurse without following symlink
  loops; skip hidden, unreadable, and unsupported files; recognize FLAC, WAV, MP3, and OGG;
  produce stable canonical-path IDs and available audio metadata.
- Emit `library://scan-progress` events.
- Reject playback paths outside the active canonical root.
- Wire the Library page to real scan, loading, empty, permission, partial-error, and completed
  states. Keep album/artist mock discovery behind explicit demo mode only.

**Commit:** `feat(library): scan local audio directories`

## Stage 5 — Native playback

**Suggested model:** GPT-5.6 Sol, high reasoning

- Build one Rust-owned Rodio/CPAL audio engine behind an `AudioBackend` abstraction.
- Implement `play_track`, `pause_playback`, `resume_playback`, `stop_playback`,
  `seek_playback`, `set_volume`, and `get_playback_state`.
- Emit `playback://state`, `playback://position`, `playback://ended`, and `playback://error`.
- Keep Rust as the single playback-state authority; React must not simulate elapsed time.
- Permit synthesized fallback audio only in explicit demo mode.
- Clamp seeking/volume, handle no-device errors, release resources on track changes/shutdown,
  and unit-test transitions with a fake backend.

**Commit:** `feat(player): add native Rust playback engine`

## Stage 6 — Frontend vertical slice

**Suggested model:** GPT-5.6 Terra, medium reasoning

- Replace the production browser audio service with generated Tauri commands and events.
- Connect scanned tracks to the existing queue and now-playing UI.
- Route play, pause, resume, seek, volume, mute, stop, next, ended, error, and state updates
  through Rust.
- Keep the visualizer passive until native spectrum data exists.
- Keep browser preview on mock data/Web Audio only when explicit demo mode is enabled.
- Add component/integration tests for scan, selection, playback state/errors, and demo isolation.

**Commit:** `feat(frontend): connect real library and native playback`

## Stage 7 — Cross-platform validation and final map

**Suggested model:** GPT-5.6 Terra, high reasoning

- Add Linux and Windows GitHub Actions validation: npm checks, Rust formatting, Clippy with
  warnings denied, Rust tests, and Tauri builds.
- Document Linux and Windows hardware-audio smoke checks; CI does not validate physical output.
- Verify the complete Omarchy flow: folder selection → scan → display → playback.
- Run `$graphify . --update`; verify the archive remains absent; update README and architecture
  documentation.

**Commits:** `ci: validate Bebop on Linux and Windows` and
`docs: finalize vertical-slice architecture map`

## IPC contracts

```ts
type AppError = {
  code: string;
  message: string;
  context?: Record<string, string>;
};

type TrackSummary = {
  id: string;
  path: string;
  title: string;
  extension: 'flac' | 'wav' | 'mp3' | 'ogg';
  fileSize: number;
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
};

type PlaybackState = {
  trackId?: string;
  path?: string;
  status: 'stopped' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
};

type ScanProgress = {
  scannedFiles: number;
  discoveredTracks: number;
  currentPath?: string;
};
```

Rust commands return typed values or `AppError`. TypeScript receives paths as opaque strings;
Rust alone canonicalizes them.

## Deferred work

SQLite persistence, tag editing, MusicBrainz, file watching, spectrum transport, Last.fm,
Discord presence, acquisition, installers, and auto-updates are deferred until this vertical
slice is stable.
