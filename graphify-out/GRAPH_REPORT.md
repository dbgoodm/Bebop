# Graph Report - Bebop  (2026-08-23)

## Corpus Check
- 99 files · ~87,207 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1235 nodes · 3500 edges · 65 communities (48 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f4ea57cf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PlaybackEngine
- FullscreenNowPlaying.tsx
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
- integrations.rs
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
- MusicPlayerPage.tsx
- catalog.ts
- enrichment.rs
- tauri-bindings.ts
- DesktopLibraryPage.tsx
- MetadataEditor.tsx
- library.ts
- user_state.rs
- catalogService.ts
- Online integrations
- esbuild
- autoprefixer

## God Nodes (most connected - your core abstractions)
1. `AppState` - 75 edges
2. `AppError` - 69 edges
3. `DatabaseWorker` - 62 edges
4. `database_error()` - 53 edges
5. `database_loop()` - 47 edges
6. `TrackItem` - 41 edges
7. `Request` - 32 edges
8. `useTheme()` - 31 edges
9. `PlaybackEngine` - 29 edges
10. `DesktopLibraryPage()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `maybe_queue_scrobble()` --calls--> `qualifies_for_scrobble()`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/integrations.rs
- `DiscoverView()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/organisms/DiscoverView.tsx → apps/frontend/src/services/themeService.tsx
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `MetadataEditorProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/MetadataEditor.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts

## Import Cycles
- None detected.

## Communities (65 total, 17 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.07
Nodes (41): AudioOutputDevice, AudioOutputState, Device, OutputStream, PlaybackState, SampleFormat, Send, Sink (+33 more)

### Community 1 - "FullscreenNowPlaying.tsx"
Cohesion: 0.15
Nodes (14): FullscreenNowPlaying(), FullscreenNowPlayingProps, MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform(), NowPlayingBar(), NowPlayingBarProps, generateSoundcloudWaveform() (+6 more)

### Community 2 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, eslint-plugin-react-refresh, prettier, tailwindcss, @tauri-apps/cli, @testing-library/jest-dom, @testing-library/react, tsx (+13 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "TrackItem"
Cohesion: 0.11
Nodes (28): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPage(), AlbumDetailPageProps, AlbumsGridView() (+20 more)

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
Nodes (130): Builder, EnrichmentCandidate, EnrichmentJob, IntegrationSettings, IntegrationStatus, LibraryScan, MetadataWriteResult, ActiveListeningSession (+122 more)

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
Cohesion: 0.06
Nodes (110): AlbumSummary, ArtistSummary, CatalogSignatures, Connection, GenreSummary, RootAvailability, Row, add_root() (+102 more)

### Community 35 - "catalog.rs"
Cohesion: 0.10
Nodes (42): DirEntry, F, SortDirection, AlbumDetail, AlbumSummary, ArtistDetail, ArtistReference, ArtistSummary (+34 more)

### Community 36 - "libraryService.ts"
Cohesion: 0.19
Nodes (22): useLibraryScan(), chooseLibraryFolder(), defaultCatalogQuery, errorSnapshot(), formatBitrate(), formatDuration(), formatSampleRate(), initialLibraryScan (+14 more)

### Community 37 - "types.ts"
Cohesion: 0.11
Nodes (27): ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, DEFAULT_STATS, ListeningStats(), ListeningStatsProps, MAIN_NAV_ITEMS, TopNavRail(), AntraQueueDrawer() (+19 more)

### Community 38 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, format, format:check, lint, preview (+3 more)

### Community 39 - "integrations.rs"
Cohesion: 0.11
Nodes (41): DiscordClient, clear_discord(), clear_lastfm_session(), discord_application_id(), eligible_for_online_metadata(), flush_lastfm_outbox(), get_lastfm_session(), initial_statuses() (+33 more)

### Community 41 - "Bebop persistent-catalog architecture"
Cohesion: 0.11
Nodes (16): Audio signal path, Bebop persistent-catalog architecture, Deferred work, Hardware-audio smoke tests, IPC contracts, Library boundaries, Omarchy Linux / PipeWire, Optional integrations (+8 more)

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

### Community 53 - "MusicPlayerPage.tsx"
Cohesion: 0.17
Nodes (11): App(), LibraryView(), NowPlayingQueueModal(), NowPlayingQueueModalProps, ThemeSelectorModal(), useDemoMode(), DemoAudioEngine, MusicPlayerPage() (+3 more)

### Community 54 - "catalog.ts"
Cohesion: 0.24
Nodes (9): DiscoverView(), DEMO_ALBUMS, DEMO_ARTISTS, DEMO_TRACKS, LOCAL_ALBUMS, LOCAL_ARTISTS, LOCAL_TRACKS, isDemoMode (+1 more)

### Community 55 - "enrichment.rs"
Cohesion: 0.15
Nodes (29): candidate_is_confident(), candidates_from_recording(), enrich_track(), EnrichmentCandidate, EnrichmentJob, MusicBrainzClient, normalized(), normalized_values() (+21 more)

### Community 56 - "tauri-bindings.ts"
Cohesion: 0.06
Nodes (30): AlbumDetail, AppError_Deserialize, AppError_Serialize, ArtistDetail, ArtistReference, AudioExtension, AudioOutputState, CatalogQuery (+22 more)

### Community 57 - "DesktopLibraryPage.tsx"
Cohesion: 0.10
Nodes (40): EmptyState(), EmptyStateProps, AppShell(), AppShellProps, useCatalogDiscovery(), DesktopLibraryPage(), EMPTY_SPECTRUM_BINS, formatBytes() (+32 more)

### Community 58 - "MetadataEditor.tsx"
Cohesion: 0.30
Nodes (14): MetadataEditor(), MetadataEditorProps, splitValues(), applyMusicBrainzCandidate(), getMusicBrainzEnabled(), loadTrackMetadata(), patchFromTrack(), patchFromTrackSummary() (+6 more)

### Community 59 - "library.ts"
Cohesion: 0.20
Nodes (11): RecentlyAddedRail(), RediscoverRail(), DEMO_RECENTLY_ADDED, DEMO_REDISCOVER_ITEMS, LOCAL_RECENTLY_ADDED, LOCAL_REDISCOVER_ITEMS, AudioFormat, RecentlyAddedItem (+3 more)

### Community 60 - "user_state.rs"
Cohesion: 0.28
Nodes (11): FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary, Default, Option, Self (+3 more)

### Community 61 - "catalogService.ts"
Cohesion: 0.29
Nodes (10): emptyDiscovery, albumItem(), artistItem(), CatalogDiscovery, durationLabel(), loadAlbumDetail(), loadArtistDetail(), loadDiscovery() (+2 more)

### Community 62 - "Online integrations"
Cohesion: 0.40
Nodes (4): Discord privacy, Last.fm privacy and reliability, Online integrations, Release configuration

## Knowledge Gaps
- **250 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+245 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DatabaseWorker` connect `Result` to `lib.rs`, `LibraryWatcher`, `integrations.rs`, `enrichment.rs`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `autoprefixer`, `frontend/package.json`, `vite`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals`, `jsdom`, `@testing-library/user-event`, `vitest`, `esbuild`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `AppState` connect `lib.rs` to `PlaybackEngine`, `Result`, `integrations.rs`, `LibraryWatcher`, `enrichment.rs`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _250 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.06913367756741251 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._