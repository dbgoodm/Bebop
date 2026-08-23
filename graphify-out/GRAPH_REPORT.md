# Graph Report - Bebop  (2026-08-23)

## Corpus Check
- 80 files · ~59,754 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 626 nodes · 1289 edges · 42 communities (34 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `88a0178c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PlaybackEngine
- useTheme
- devDependencies
- What You Must Do When Invoked
- TrackItem
- types.ts
- compilerOptions
- RealAudioEngine
- Bebop clean rebuild and vertical-slice plan
- scripts
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
- MusicPlayerPage.tsx
- FullscreenNowPlaying.tsx
- DesktopLibraryPage.tsx
- antraEngineService.tsx
- NowPlayingBar.tsx
- ListeningStats.tsx
- tauri-dev.mjs
- Bebop vertical-slice architecture

## God Nodes (most connected - your core abstractions)
1. `TrackItem` - 38 edges
2. `useTheme()` - 31 edges
3. `AppState` - 25 edges
4. `PlaybackEngine` - 24 edges
5. `AppError` - 24 edges
6. `AudioBackendError` - 18 edges
7. `RealAudioEngine` - 17 edges
8. `PlaybackState` - 17 edges
9. `play_track()` - 17 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `DiscoverView()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/organisms/DiscoverView.tsx → apps/frontend/src/services/themeService.tsx
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `WaveformScrubberProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/WaveformScrubber.tsx → apps/frontend/src/types.ts
- `ContinueListeningRail()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/molecules/ContinueListeningRail.tsx → apps/frontend/src/services/themeService.tsx
- `ListeningStats()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/molecules/ListeningStats.tsx → apps/frontend/src/services/themeService.tsx

## Import Cycles
- None detected.

## Communities (42 total, 8 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.08
Nodes (41): AudioOutputDevice, AudioOutputState, Box, Device, Into, OutputStream, PlaybackState, SampleFormat (+33 more)

### Community 1 - "useTheme"
Cohesion: 0.22
Nodes (11): AlbumDetailPage(), SettingsView(), ThemeSelectorModal(), AmbientOrbConfig, StatCardColorConfig, THEME_PRESETS, ThemeConfig, ThemeContext (+3 more)

### Community 2 - "devDependencies"
Cohesion: 0.05
Nodes (39): devDependencies, autoprefixer, esbuild, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+31 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "TrackItem"
Cohesion: 0.10
Nodes (35): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps (+27 more)

### Community 5 - "types.ts"
Cohesion: 0.19
Nodes (14): RecentlyAddedRail(), RediscoverRail(), DEMO_RECENTLY_ADDED, DEMO_REDISCOVER_ITEMS, LOCAL_RECENTLY_ADDED, LOCAL_REDISCOVER_ITEMS, AudioFormat, ContinueListeningType (+6 more)

### Community 6 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, baseUrl, experimentalDecorators, isolatedModules, jsx, lib (+11 more)

### Community 8 - "Bebop clean rebuild and vertical-slice plan"
Cohesion: 0.14
Nodes (13): Bebop clean rebuild and vertical-slice plan, Deferred work, Goal, IPC contracts, Stage 0 — Archive and initialize, Stage 1 — Import and clean the frontend, Stage 2 — Install Graphify and create the baseline map, Stage 3 — Tauri foundation and typed IPC (+5 more)

### Community 9 - "scripts"
Cohesion: 0.06
Nodes (35): dependencies, lucide-react, motion, react, react-dom, @tailwindcss/vite, @tauri-apps/api, @tauri-apps/plugin-dialog (+27 more)

### Community 10 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 16 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 17 - "lib.rs"
Cohesion: 0.11
Nodes (62): AppHandle, AtomicBool, BTreeMap, Builder, DirEntry, Error, F, PathBuf (+54 more)

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
Cohesion: 0.08
Nodes (43): useLibraryScan(), asAppError(), PlaybackEventName, mocks, playingState, track, useNativePlayback(), chooseLibraryFolder() (+35 more)

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

### Community 34 - "MusicPlayerPage.tsx"
Cohesion: 0.29
Nodes (6): App(), isDemoMode, useDemoMode(), DemoAudioEngine, DemoMusicPlayer(), MusicPlayerPage()

### Community 35 - "FullscreenNowPlaying.tsx"
Cohesion: 0.24
Nodes (9): FullscreenNowPlaying(), FullscreenNowPlayingProps, generateSoundcloudWaveform(), pseudoRandom(), WaveformScrubber(), WaveformScrubberProps, getLyricsForTrack(), LyricLine (+1 more)

### Community 36 - "DesktopLibraryPage.tsx"
Cohesion: 0.15
Nodes (13): EmptyState(), EmptyStateProps, ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, LibraryView(), NowPlayingQueueModal(), AppShell(), AppShellProps (+5 more)

### Community 37 - "antraEngineService.tsx"
Cohesion: 0.17
Nodes (14): MAIN_NAV_ITEMS, TopNavRail(), AntraQueueDrawer(), AntraQueueDrawerProps, ArtistDetailPage(), AntraEngineContext, AntraEngineContextType, AntraEngineProvider() (+6 more)

### Community 38 - "NowPlayingBar.tsx"
Cohesion: 0.47
Nodes (4): MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform(), NowPlayingBar()

### Community 39 - "ListeningStats.tsx"
Cohesion: 0.50
Nodes (4): DEFAULT_STATS, ListeningStats(), ListeningStatsProps, ListeningStatsData

### Community 41 - "Bebop vertical-slice architecture"
Cohesion: 0.12
Nodes (14): Audio signal path, Bebop vertical-slice architecture, Deferred work, Hardware-audio smoke tests, IPC contracts, Library boundaries, Omarchy Linux / PipeWire, Scope (+6 more)

## Knowledge Gaps
- **211 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+206 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `scripts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `typescript` connect `devDependencies` to `lib.rs`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _211 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.07826384142173616 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `TrackItem` be split into smaller, more focused modules?**
  _Cohesion score 0.10283687943262411 - nodes in this community are weakly interconnected._