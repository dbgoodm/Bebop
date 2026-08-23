# Graph Report - Bebop  (2026-08-23)

## Corpus Check
- 96 files · ~83,916 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1147 nodes · 3195 edges · 64 communities (47 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44a7e7ff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PlaybackEngine
- useTheme
- devDependencies
- What You Must Do When Invoked
- TrackItem
- SpectrumAnalyzer
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
- LibraryWatcher
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
- libraryService.ts
- types.ts
- scripts
- themeService.tsx
- tauri-dev.mjs
- Bebop persistent-catalog architecture
- frontend/package.json
- vite
- metadata.rs
- eslint
- @eslint/js
- eslint-plugin-react-hooks
- globals
- jsdom
- useNativePlayback.ts
- @testing-library/user-event
- vitest
- App.tsx
- catalog.ts
- enrichment.rs
- tauri-bindings.ts
- DesktopLibraryPage.tsx
- MetadataEditor.tsx
- @testing-library/react
- user_state.rs
- catalogService.ts
- ListeningStats.tsx
- esbuild

## God Nodes (most connected - your core abstractions)
1. `AppState` - 69 edges
2. `AppError` - 64 edges
3. `DatabaseWorker` - 52 edges
4. `database_error()` - 49 edges
5. `database_loop()` - 43 edges
6. `TrackItem` - 41 edges
7. `useTheme()` - 31 edges
8. `Request` - 31 edges
9. `PlaybackEngine` - 29 edges
10. `DesktopLibraryPage()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `MetadataEditorProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/MetadataEditor.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts
- `SettingsView()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/organisms/SettingsView.tsx → apps/frontend/src/services/themeService.tsx
- `WaveformScrubberProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/WaveformScrubber.tsx → apps/frontend/src/types.ts

## Import Cycles
- None detected.

## Communities (64 total, 17 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.07
Nodes (41): AudioOutputDevice, AudioOutputState, Device, OutputStream, PlaybackState, SampleFormat, Send, Sink (+33 more)

### Community 1 - "useTheme"
Cohesion: 0.13
Nodes (19): RecentlyAddedRail(), AlbumDetailPage(), DiscoverView(), FullscreenNowPlaying(), FullscreenNowPlayingProps, MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform() (+11 more)

### Community 2 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, autoprefixer, eslint-plugin-react-refresh, prettier, tailwindcss, @tauri-apps/cli, @testing-library/jest-dom, tsx (+13 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "TrackItem"
Cohesion: 0.11
Nodes (29): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps (+21 more)

### Community 5 - "SpectrumAnalyzer"
Cohesion: 0.08
Nodes (29): ArrayQueue, AtomicU32, ChannelCount, Complex32, Drop, Duration, Fft, Item (+21 more)

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
Cohesion: 0.07
Nodes (122): BTreeMap, Builder, EnrichmentCandidate, EnrichmentJob, LibraryScan, MetadataWriteResult, ActiveListeningSession, add_and_scan_root() (+114 more)

### Community 18 - "tauri.conf.json"
Cohesion: 0.09
Nodes (21): deb, icons/icon.png, rpm, app, security, windows, withGlobalTauri, build (+13 more)

### Community 19 - "scripts"
Cohesion: 0.11
Nodes (17): name, private, scripts, build, dev, format, format:check, lint (+9 more)

### Community 20 - "main.json"
Cohesion: 0.13
Nodes (14): core:default, dialog:allow-open, fs:allow-read, fs:allow-read-dir, fs:allow-stat, linux, main, windows (+6 more)

### Community 21 - "LibraryWatcher"
Cohesion: 0.14
Nodes (24): Event, HashMap, HashSet, RecommendedWatcher, ignored_path(), is_cover_candidate(), is_suppressed(), LibraryWatcher (+16 more)

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
Cohesion: 0.07
Nodes (105): AlbumSummary, ArtistSummary, CatalogSignatures, Connection, GenreSummary, Receiver, RootAvailability, Row (+97 more)

### Community 35 - "catalog.rs"
Cohesion: 0.10
Nodes (42): DirEntry, F, SortDirection, AlbumDetail, AlbumSummary, ArtistDetail, ArtistReference, ArtistSummary (+34 more)

### Community 36 - "libraryService.ts"
Cohesion: 0.19
Nodes (22): useLibraryScan(), chooseLibraryFolder(), defaultCatalogQuery, errorSnapshot(), formatBitrate(), formatDuration(), formatSampleRate(), initialLibraryScan (+14 more)

### Community 37 - "types.ts"
Cohesion: 0.11
Nodes (29): ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, RediscoverRail(), MAIN_NAV_ITEMS, TopNavRail(), AntraQueueDrawer(), AntraQueueDrawerProps, ArtistDetailPage() (+21 more)

### Community 38 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, format, format:check, lint, preview (+3 more)

### Community 39 - "themeService.tsx"
Cohesion: 0.19
Nodes (12): SettingsView(), ThemeSelectorModal(), loadUiPreference(), saveThemePreference(), saveUiPreference(), AmbientOrbConfig, StatCardColorConfig, THEME_PRESETS (+4 more)

### Community 41 - "Bebop persistent-catalog architecture"
Cohesion: 0.12
Nodes (15): Audio signal path, Bebop persistent-catalog architecture, Deferred work, Hardware-audio smoke tests, IPC contracts, Library boundaries, Omarchy Linux / PipeWire, Player state and collections (+7 more)

### Community 42 - "frontend/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 43 - "vite"
Cohesion: 0.67
Nodes (3): vite, vite, vite

### Community 44 - "metadata.rs"
Cohesion: 0.21
Nodes (35): ItemKey, apply_patch_to_path(), cache_artwork(), cache_bytes(), cache_external_artwork(), CachedArtwork, clean(), clean_values() (+27 more)

### Community 50 - "useNativePlayback.ts"
Cohesion: 0.19
Nodes (24): asAppError(), PlaybackEventName, mocks, playingState, track, useNativePlayback(), getPlaybackState(), initialPlaybackState (+16 more)

### Community 53 - "App.tsx"
Cohesion: 0.50
Nodes (3): App(), useDemoMode(), MusicPlayerPage()

### Community 54 - "catalog.ts"
Cohesion: 0.21
Nodes (11): DEMO_ALBUMS, DEMO_ARTISTS, DEMO_TRACKS, LOCAL_ALBUMS, LOCAL_ARTISTS, LOCAL_TRACKS, DEMO_RECENTLY_ADDED, DEMO_REDISCOVER_ITEMS (+3 more)

### Community 55 - "enrichment.rs"
Cohesion: 0.15
Nodes (29): Client, candidate_is_confident(), candidates_from_recording(), enrich_track(), EnrichmentCandidate, EnrichmentJob, MusicBrainzClient, normalized() (+21 more)

### Community 56 - "tauri-bindings.ts"
Cohesion: 0.07
Nodes (28): AlbumDetail, AppError_Deserialize, AppError_Serialize, ArtistDetail, ArtistReference, AudioExtension, AudioOutputState, CatalogQuery (+20 more)

### Community 57 - "DesktopLibraryPage.tsx"
Cohesion: 0.17
Nodes (22): EmptyState(), EmptyStateProps, AppShell(), AppShellProps, DesktopLibraryPage(), EMPTY_SPECTRUM_BINS, formatBytes(), formatDuration() (+14 more)

### Community 58 - "MetadataEditor.tsx"
Cohesion: 0.27
Nodes (15): MetadataEditor(), MetadataEditorProps, splitValues(), applyMusicBrainzCandidate(), getMusicBrainzEnabled(), loadTrackMetadata(), patchFromTrack(), patchFromTrackSummary() (+7 more)

### Community 60 - "user_state.rs"
Cohesion: 0.28
Nodes (11): FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary, Default, Option, Self (+3 more)

### Community 61 - "catalogService.ts"
Cohesion: 0.24
Nodes (12): emptyDiscovery, useCatalogDiscovery(), albumItem(), artistItem(), CatalogDiscovery, durationLabel(), loadAlbumDetail(), loadArtistDetail() (+4 more)

### Community 62 - "ListeningStats.tsx"
Cohesion: 0.50
Nodes (4): DEFAULT_STATS, ListeningStats(), ListeningStatsProps, ListeningStatsData

## Knowledge Gaps
- **244 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+239 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DatabaseWorker` connect `Result` to `lib.rs`, `LibraryWatcher`, `enrichment.rs`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `frontend/package.json`, `vite`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals`, `jsdom`, `@testing-library/user-event`, `vitest`, `@testing-library/react`, `esbuild`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `typescript` connect `devDependencies` to `lib.rs`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _244 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.07023214810461358 - nodes in this community are weakly interconnected._
- **Should `useTheme` be split into smaller, more focused modules?**
  _Cohesion score 0.13043478260869565 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._