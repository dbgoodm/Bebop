# Graph Report - Bebop  (2026-08-23)

## Corpus Check
- 84 files · ~66,183 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 757 nodes · 1696 edges · 53 communities (36 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ee95484e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PlaybackEngine
- useTheme
- devDependencies
- What You Must Do When Invoked
- TrackItem
- MusicPlayerPage.tsx
- compilerOptions
- RealAudioEngine
- Bebop clean rebuild and vertical-slice plan
- dependencies
- .prettierrc.json
- graphify reference: extra exports and benchmark
- lib.rs
- tauri.conf.json
- scripts
- main.json
- libraryService.ts
- bebop-desktop
- graphify reference: query, path, explain
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- AGENTS.md
- README.md
- extraction-spec.md
- Result
- catalog.rs
- DesktopLibraryPage.tsx
- types.ts
- scripts
- UniversalTracklist.tsx
- tauri-dev.mjs
- Bebop persistent-catalog architecture
- frontend/package.json
- vite
- autoprefixer
- eslint
- @eslint/js
- eslint-plugin-react-hooks
- globals
- jsdom
- @testing-library/react
- @testing-library/user-event
- vitest

## God Nodes (most connected - your core abstractions)
1. `TrackItem` - 38 edges
2. `AppError` - 33 edges
3. `useTheme()` - 31 edges
4. `AppState` - 29 edges
5. `PlaybackEngine` - 24 edges
6. `DatabaseWorker` - 20 edges
7. `AudioBackendError` - 18 edges
8. `RealAudioEngine` - 17 edges
9. `PlaybackState` - 17 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `UniversalTracklistProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/molecules/UniversalTracklist.tsx → apps/frontend/src/types.ts
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts
- `NowPlayingQueueModalProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingQueueModal.tsx → apps/frontend/src/types.ts
- `WaveformScrubberProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/WaveformScrubber.tsx → apps/frontend/src/types.ts

## Import Cycles
- None detected.

## Communities (53 total, 17 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.08
Nodes (41): AudioOutputDevice, AudioOutputState, Box, Device, OutputStream, PlaybackState, SampleFormat, Send (+33 more)

### Community 1 - "useTheme"
Cohesion: 0.10
Nodes (25): AlbumDetailPage(), DiscoverView(), FullscreenNowPlaying(), FullscreenNowPlayingProps, MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform(), NowPlayingBar() (+17 more)

### Community 2 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, esbuild, eslint-plugin-react-refresh, prettier, tailwindcss, @tauri-apps/cli, @testing-library/jest-dom, tsx (+13 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "TrackItem"
Cohesion: 0.15
Nodes (24): AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps, AlbumsListViewProps, ArtistDetailPageProps, ArtistsGridView(), ArtistsGridViewProps, DiscoverViewProps (+16 more)

### Community 5 - "MusicPlayerPage.tsx"
Cohesion: 0.14
Nodes (17): App(), RecentlyAddedRail(), RediscoverRail(), DEMO_RECENTLY_ADDED, DEMO_REDISCOVER_ITEMS, LOCAL_RECENTLY_ADDED, LOCAL_REDISCOVER_ITEMS, isDemoMode (+9 more)

### Community 6 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, baseUrl, experimentalDecorators, isolatedModules, jsx, lib (+11 more)

### Community 8 - "Bebop clean rebuild and vertical-slice plan"
Cohesion: 0.06
Nodes (30): Bebop clean rebuild and vertical-slice plan, Deferred work, Goal, IPC contracts, Stage 0 — Archive and initialize, Stage 1 — Import and clean the frontend, Stage 2 — Install Graphify and create the baseline map, Stage 3 — Tauri foundation and typed IPC (+22 more)

### Community 9 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, lucide-react, motion, react, react-dom, @tailwindcss/vite, @tauri-apps/api, @tauri-apps/plugin-dialog (+9 more)

### Community 10 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 16 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 17 - "lib.rs"
Cohesion: 0.12
Nodes (61): AppHandle, AtomicBool, BTreeMap, Builder, LibraryScan, add_and_scan_root(), add_library_root(), AppError (+53 more)

### Community 18 - "tauri.conf.json"
Cohesion: 0.09
Nodes (21): deb, icons/icon.png, rpm, app, security, windows, withGlobalTauri, build (+13 more)

### Community 19 - "scripts"
Cohesion: 0.11
Nodes (17): name, private, scripts, build, dev, format, format:check, lint (+9 more)

### Community 20 - "main.json"
Cohesion: 0.13
Nodes (14): core:default, dialog:allow-open, fs:allow-read, fs:allow-read-dir, fs:allow-stat, linux, main, windows (+6 more)

### Community 21 - "libraryService.ts"
Cohesion: 0.07
Nodes (56): useLibraryScan(), asAppError(), PlaybackEventName, mocks, playingState, track, useNativePlayback(), chooseLibraryFolder() (+48 more)

### Community 25 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 26 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 27 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 28 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 34 - "Result"
Cohesion: 0.13
Nodes (47): Connection, FnOnce, Receiver, RootAvailability, Row, Sender, ScannedLibrary, ScannedTrack (+39 more)

### Community 35 - "catalog.rs"
Cohesion: 0.09
Nodes (32): DirEntry, F, SortDirection, AudioExtension, AudioMetadata, CatalogQuery, display_title(), is_hidden() (+24 more)

### Community 36 - "DesktopLibraryPage.tsx"
Cohesion: 0.11
Nodes (18): EmptyState(), EmptyStateProps, ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, DEFAULT_STATS, ListeningStats(), ListeningStatsProps, NowPlayingQueueModal() (+10 more)

### Community 37 - "types.ts"
Cohesion: 0.16
Nodes (18): MAIN_NAV_ITEMS, TopNavRail(), AntraQueueDrawer(), AntraQueueDrawerProps, ArtistDetailPage(), AntraEngineContext, AntraEngineContextType, AntraEngineProvider() (+10 more)

### Community 38 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, format, format:check, lint, preview (+3 more)

### Community 39 - "UniversalTracklist.tsx"
Cohesion: 0.27
Nodes (8): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, TracksTableView(), TracksTableViewProps, ColumnVisibility

### Community 41 - "Bebop persistent-catalog architecture"
Cohesion: 0.12
Nodes (14): Audio signal path, Bebop persistent-catalog architecture, Deferred work, Hardware-audio smoke tests, IPC contracts, Library boundaries, Omarchy Linux / PipeWire, Scope (+6 more)

### Community 42 - "frontend/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 43 - "vite"
Cohesion: 0.67
Nodes (3): vite, vite, vite

## Knowledge Gaps
- **235 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+230 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `frontend/package.json`, `vite`, `autoprefixer`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `vitest`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `typescript` connect `devDependencies` to `lib.rs`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _235 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.07826384142173616 - nodes in this community are weakly interconnected._
- **Should `useTheme` be split into smaller, more focused modules?**
  _Cohesion score 0.10227272727272728 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._