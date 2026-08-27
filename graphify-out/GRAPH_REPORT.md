# Graph Report - Bebop  (2026-08-25)

## Corpus Check
- 134 files · ~111,559 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1708 nodes · 4971 edges · 93 communities (71 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b75d399e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PlaybackEngine
- metadata_jobs.rs
- devDependencies
- What You Must Do When Invoked
- FullscreenNowPlaying.tsx
- SpectrumAnalyzer
- compilerOptions
- RealAudioEngine
- Bebop clean rebuild and vertical-slice plan
- dependencies
- .prettierrc.json
- graphify reference: extra exports and benchmark
- lib.rs
- bundle
- scripts
- main.json
- LibraryWatcher
- main.rs
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
- persistence.rs
- catalog.rs
- libraryService.ts
- catalogService.ts
- scripts
- integrations.rs
- tauri-dev.mjs
- Bebop V2 architecture
- frontend/package.json
- vite
- metadata.rs
- TrackItem
- @eslint/js
- eslint-plugin-react-hooks
- Result
- jsdom
- useNativePlayback.ts
- @testing-library/user-event
- vitest
- types.ts
- .in_memory
- enrichment.rs
- tauri-bindings.ts
- DesktopLibraryPage.tsx
- metadataService.ts
- AppError
- user_state.rs
- Stage 7: Acquisition Removal and Repository Cleanup
- Online integrations
- reconcile
- README.md
- song_dna.rs
- Bebop Implementation Plan V3
- @testing-library/react
- updates.rs
- UpdatePanel.tsx
- MetadataEditor.test.tsx
- Releases and signed updates
- install-bebop
- build-linux-release-docker
- reset-local-data script
- test-reset-local-data
- Troubleshooting
- Privacy
- Bebop
- Backup and recovery
- Span
- esbuild
- Implementation Stages
- get_album_detail
- lyrics.rs
- globals
- hydrate_track
- playlistService.ts
- MusicPlayerPage.tsx
- LibraryView.tsx
- eslint
- SettingsView.tsx

## God Nodes (most connected - your core abstractions)
1. `AppState` - 100 edges
2. `DatabaseWorker` - 97 edges
3. `AppError` - 94 edges
4. `database_error()` - 81 edges
5. `database_loop()` - 69 edges
6. `TrackItem` - 45 edges
7. `Request` - 40 edges
8. `PlaybackEngine` - 33 edges
9. `useTheme()` - 31 edges
10. `MusicBrainzClient` - 29 edges

## Surprising Connections (you probably didn't know these)
- `maybe_queue_scrobble()` --calls--> `qualifies_for_scrobble()`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/integrations.rs
- `DiscoverView()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/organisms/DiscoverView.tsx → apps/frontend/src/services/themeService.tsx
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `GenresGridViewProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/GenresGridView.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts

## Import Cycles
- None detected.

## Communities (93 total, 22 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.07
Nodes (41): AudioOutputDevice, AudioOutputState, Device, OutputStream, PlaybackState, SampleFormat, Send, Sink (+33 more)

### Community 1 - "metadata_jobs.rs"
Cohesion: 0.16
Nodes (19): diff_metadata_patches(), diff_only_contains_changed_fields_and_retains_provenance(), diff_patch(), display(), embedded_only_fields_are_included_in_a_full_review(), join(), MetadataDiff, MetadataJob (+11 more)

### Community 2 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, autoprefixer, eslint-plugin-react-refresh, prettier, tailwindcss, @tauri-apps/cli, @testing-library/jest-dom, tsx (+13 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "FullscreenNowPlaying.tsx"
Cohesion: 0.16
Nodes (14): FullscreenNowPlaying(), FullscreenNowPlayingProps, MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform(), NowPlayingBar(), NowPlayingBarProps, generateSoundcloudWaveform() (+6 more)

### Community 5 - "SpectrumAnalyzer"
Cohesion: 0.06
Nodes (47): ArrayQueue, AtomicU32, ChannelCount, Duration, S, SampleRate, SeekError, Source (+39 more)

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
Cohesion: 0.05
Nodes (173): ArtistInformation, Builder, EnrichmentCandidate, EnrichmentJob, GeneratedPlaylist, IntegrationSettings, IntegrationStatus, LibraryScan (+165 more)

### Community 18 - "bundle"
Cohesion: 0.04
Nodes (46): $APPDATA/artwork/**, https://github.com/dbgoodm/Bebop/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.ico, icons/icon.png, app (+38 more)

### Community 19 - "scripts"
Cohesion: 0.11
Nodes (17): name, private, scripts, build, dev, format, format:check, lint (+9 more)

### Community 20 - "main.json"
Cohesion: 0.13
Nodes (14): core:default, dialog:allow-open, fs:allow-read, fs:allow-read-dir, fs:allow-stat, linux, main, windows (+6 more)

### Community 21 - "LibraryWatcher"
Cohesion: 0.14
Nodes (24): Event, RecommendedWatcher, ignored_path(), is_cover_candidate(), is_suppressed(), LibraryWatcher, reconcile_events(), reconcile_root_paths() (+16 more)

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

### Community 34 - "persistence.rs"
Cohesion: 0.10
Nodes (77): AlbumSummary, ArtistSummary, Connection, GenreSummary, add_root(), album_artists(), artist_pages_use_album_artists_and_keyset_cursors(), artwork_path() (+69 more)

### Community 35 - "catalog.rs"
Cohesion: 0.10
Nodes (47): DirEntry, F, SortDirection, AlbumDetail, AlbumSummary, ArtistCatalogQuery, ArtistDetail, ArtistReference (+39 more)

### Community 36 - "libraryService.ts"
Cohesion: 0.20
Nodes (21): useLibraryScan(), chooseLibraryFolder(), defaultCatalogQuery, errorSnapshot(), formatBitrate(), formatDuration(), formatSampleRate(), initialLibraryScan (+13 more)

### Community 37 - "catalogService.ts"
Cohesion: 0.18
Nodes (20): emptyArtistPage, emptyDiscovery, useCatalogDiscovery(), albumItem(), ArtistCatalogPage, artistItem(), CatalogDiscovery, durationLabel() (+12 more)

### Community 38 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, format, format:check, lint, preview (+3 more)

### Community 39 - "integrations.rs"
Cohesion: 0.11
Nodes (41): DiscordClient, clear_discord(), clear_lastfm_session(), discord_application_id(), eligible_for_online_metadata(), flush_lastfm_outbox(), get_lastfm_session(), initial_statuses() (+33 more)

### Community 41 - "Bebop V2 architecture"
Cohesion: 0.14
Nodes (13): Audio signal path, Bebop V2 architecture, Deferred beyond V2, Hardware-audio smoke tests, IPC contracts, Library boundaries, Omarchy Linux / PipeWire, Optional integrations (+5 more)

### Community 42 - "frontend/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 43 - "vite"
Cohesion: 0.67
Nodes (3): vite, vite, vite

### Community 44 - "metadata.rs"
Cohesion: 0.21
Nodes (36): ItemKey, apply_patch_to_path(), cache_artwork(), cache_bytes(), cache_external_artwork(), CachedArtwork, clean(), clean_values() (+28 more)

### Community 45 - "TrackItem"
Cohesion: 0.09
Nodes (29): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPageProps, AlbumsListViewProps, ArtistDetailPageProps (+21 more)

### Community 48 - "Result"
Cohesion: 0.07
Nodes (36): MetadataJobStatus, RootAvailability, Row, audio_features_from_row(), DatabaseWorker, list_generation_candidates(), metadata_job_from_row(), playlist_summary_from_row() (+28 more)

### Community 50 - "useNativePlayback.ts"
Cohesion: 0.18
Nodes (25): asAppError(), PlaybackEventName, mocks, playingState, track, useNativePlayback(), getPlaybackState(), initialPlaybackState (+17 more)

### Community 53 - "types.ts"
Cohesion: 0.17
Nodes (15): SAMPLE_CONTINUE_ITEMS, DEMO_RECENTLY_ADDED, DEMO_REDISCOVER_ITEMS, LOCAL_RECENTLY_ADDED, LOCAL_REDISCOVER_ITEMS, AudioFormat, ContinueListeningItem, ContinueListeningRailProps (+7 more)

### Community 54 - ".in_memory"
Cohesion: 0.14
Nodes (16): backup_before_upgrade(), corrupt_databases_are_preserved_and_replaced_with_a_clean_catalog(), database_files(), existing_databases_are_backed_up_before_a_schema_upgrade(), is_corruption_error(), list_roots(), migrations_create_the_complete_v2_schema(), recover_corrupt_database() (+8 more)

### Community 55 - "enrichment.rs"
Cohesion: 0.08
Nodes (59): MetadataDiff, AcoustIdRecording, AcoustIdResponse, AcoustIdResult, ArtistRecord, candidates_for_track(), candidates_from_recording(), credential_error() (+51 more)

### Community 56 - "tauri-bindings.ts"
Cohesion: 0.05
Nodes (42): AlbumDetail, AppError_Deserialize, AppError_Serialize, ArtistCatalogQuery, ArtistDetail, ArtistReference, AudioExtension, AudioFeatures (+34 more)

### Community 57 - "DesktopLibraryPage.tsx"
Cohesion: 0.11
Nodes (34): EmptyState(), EmptyStateProps, AppShell(), AppShellProps, useArtistCatalog(), DesktopLibraryPage(), EMPTY_SPECTRUM_BINS, formatBytes() (+26 more)

### Community 58 - "metadataService.ts"
Cohesion: 0.20
Nodes (22): MetadataEditor(), splitValues(), MetadataJobsPanel(), applyMusicBrainzCandidate(), cancelMetadataJob(), configureAcoustIdClientKey(), getAcoustIdConfigured(), getMusicBrainzEnabled() (+14 more)

### Community 59 - "AppError"
Cohesion: 0.27
Nodes (12): create_playlist(), duplicate_playlist(), list_playlists(), open_connection(), open_database(), playlist_summary(), rename_playlist(), AppError (+4 more)

### Community 60 - "user_state.rs"
Cohesion: 0.29
Nodes (11): FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary, Default, Option, Self (+3 more)

### Community 61 - "Stage 7: Acquisition Removal and Repository Cleanup"
Cohesion: 0.13
Nodes (14): Bebop Stage 5 and Stage 7 Continuation Handoff, Current State, Existing Entry Points, Goal, Implement in This Order, Required Migration Behavior, Safe Removal Sequence, Shared-File and Verification Guidance (+6 more)

### Community 62 - "Online integrations"
Cohesion: 0.50
Nodes (4): Discord privacy, Last.fm privacy and reliability, Online integrations, Release configuration

### Community 63 - "reconcile"
Cohesion: 0.36
Nodes (9): CatalogSignatures, catalog_signatures(), reconcile(), reconcile_paths(), relink_moved_track(), upsert_album(), upsert_artists(), upsert_track() (+1 more)

### Community 64 - "README.md"
Cohesion: 0.31
Nodes (3): Acquisition Policy (V3), Future Clean-Room Design Guidelines, Data locations

### Community 65 - "song_dna.rs"
Cohesion: 0.12
Nodes (41): analyze_file(), analyze_spectral_frame(), AudioAnalysisProgress, AudioFeatures, candidate(), clamp_request(), duration_and_energy_constraints_are_enforced(), energy() (+33 more)

### Community 66 - "Bebop Implementation Plan V3"
Cohesion: 0.33
Nodes (5): Assumptions, Bebop Implementation Plan V3, Interface and Data Changes, Summary, Verification and Acceptance

### Community 68 - "updates.rs"
Cohesion: 0.25
Nodes (14): Display, check(), check_due(), emit_status(), failed(), install(), AppError, AppHandle (+6 more)

### Community 69 - "UpdatePanel.tsx"
Cohesion: 0.42
Nodes (9): errorMessage(), UpdatePanel(), UpdateProgress, UpdateStatus, checkForUpdates(), installUpdate(), subscribeUpdateProgress(), subscribeUpdateStatus() (+1 more)

### Community 70 - "MetadataEditor.test.tsx"
Cohesion: 0.50
Nodes (3): mocks, track, MetadataPatch

### Community 71 - "Releases and signed updates"
Cohesion: 0.40
Nodes (4): Client behavior, Omarchy and Arch-family install, Protected release configuration, Releases and signed updates

### Community 77 - "Troubleshooting"
Cohesion: 0.25
Nodes (8): A file plays but its metadata is missing, A library root is offline or empty, An integration is unavailable, An update fails, Development and packaging, Playback reports resampling or a missing output device, The catalog database is damaged, Troubleshooting

### Community 78 - "Privacy"
Cohesion: 0.67
Nodes (3): Data that stays local, Optional network activity, Privacy

### Community 79 - "Bebop"
Cohesion: 0.33
Nodes (6): Bebop, Demo mode, Documentation, Optional online features, Playback and hi-fi behavior, Quick start

### Community 80 - "Backup and recovery"
Cohesion: 0.50
Nodes (4): Backup and recovery, Catalog backups, Metadata file backups, Recoverable reset

### Community 81 - "Span"
Cohesion: 0.33
Nodes (4): Drop, Instant, Self, Span

### Community 83 - "Implementation Stages"
Cohesion: 0.25
Nodes (8): 1. Performance and catalog foundation — `gpt-5.6-sol`, high, 2. Responsive shell and Library cleanup — `gpt-5.6-terra`, medium, 3. Artwork, lyrics, and artist information — `gpt-5.6-terra`, high, 4. Metadata editor and MusicBrainz jobs — `gpt-5.6-sol`, high, 5. Unified local/remote catalog — `gpt-5.6-terra`, high, 6. Playlists and Song DNA — `gpt-5.6-sol` high for analysis, `gpt-5.6-terra` medium for UI, 7. Acquisition removal and repository cleanup — `gpt-5.6-luna`, medium, Implementation Stages

### Community 84 - "get_album_detail"
Cohesion: 0.67
Nodes (3): get_album_detail(), get_remote_album_detail(), AlbumDetail

### Community 85 - "lyrics.rs"
Cohesion: 0.19
Nodes (23): cache_key(), fetch_lrclib(), LrclibResponse, LyricLine, LyricsDocument, LyricsSource, normalized(), parse_lrc() (+15 more)

### Community 88 - "hydrate_track"
Cohesion: 0.26
Nodes (10): apply_metadata_override(), artist_references(), get_playlist_tracks(), get_track(), hydrate_track(), hydrate_track_ids(), ArtistReference, TrackSummary (+2 more)

### Community 89 - "playlistService.ts"
Cohesion: 0.17
Nodes (26): DEFAULT_REQUEST, durationLabel(), PlaylistsView(), mocks, track, analyzeAudioFeatures(), createGeneratedPlaylist(), createPlaylist() (+18 more)

### Community 90 - "MusicPlayerPage.tsx"
Cohesion: 0.10
Nodes (30): App(), ContinueListeningRail(), DEFAULT_STATS, ListeningStats(), ListeningStatsProps, RecentlyAddedRail(), RediscoverRail(), MAIN_NAV_ITEMS (+22 more)

### Community 91 - "LibraryView.tsx"
Cohesion: 0.21
Nodes (13): AlbumsGridView(), AlbumsGridViewProps, ArtistsGridView(), ArtistsGridViewProps, GenreCategory, GenresGridView(), GenresGridViewProps, LOCAL_GENRES (+5 more)

### Community 94 - "SettingsView.tsx"
Cohesion: 0.47
Nodes (4): SettingsView(), SettingsViewProps, mocks, LibraryRoot

## Knowledge Gaps
- **326 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+321 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DatabaseWorker` connect `Result` to `persistence.rs`, `updates.rs`, `SpectrumAnalyzer`, `integrations.rs`, `lib.rs`, `get_album_detail`, `lyrics.rs`, `.in_memory`, `enrichment.rs`, `hydrate_track`, `LibraryWatcher`, `AppError`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `@testing-library/react`, `frontend/package.json`, `vite`, `@eslint/js`, `eslint-plugin-react-hooks`, `jsdom`, `esbuild`, `@testing-library/user-event`, `vitest`, `globals`, `eslint`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `typescript` connect `devDependencies` to `lib.rs`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _326 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.07023214810461358 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._