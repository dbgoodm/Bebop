# Graph Report - Bebop  (2026-09-01)

## Corpus Check
- 178 files · ~167,262 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2301 nodes · 6621 edges · 114 communities (92 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e6c4d6b7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PlaybackEngine
- metadata_jobs.rs
- devDependencies
- What You Must Do When Invoked
- MonstercatVisualizer.tsx
- SpectrumAnalyzer
- compilerOptions
- RealAudioEngine
- Bebop clean rebuild and vertical-slice plan
- dependencies
- .prettierrc.json
- graphify reference: extra exports and benchmark
- AppState
- bundle
- scripts
- permissions
- LibraryWatcher
- main.rs
- bebop-desktop
- graphify reference: query, path, explain
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- Desktop & Webview Runtime Invariants
- README.md
- extraction-spec.md
- AppError
- catalog.rs
- libraryService.ts
- acquisition/mod.rs
- scripts
- integrations.rs
- tauri-dev.mjs
- Bebop V2 architecture
- frontend/package.json
- vite
- metadata.rs
- MusicPlayerPage.tsx
- WindowControls.tsx
- eslint-plugin-react-hooks
- Result
- jsdom
- useNativePlayback.ts
- @testing-library/user-event
- vitest
- resolver.rs
- ArtistDetailPage.tsx
- enrichment.rs
- tauri-bindings.ts
- DesktopLibraryPage.tsx
- metadataService.ts
- TrackSummary
- user_state.rs
- Stage 7: Acquisition Removal and Repository Cleanup
- Online integrations
- themeModel.test.ts
- README.md
- song_dna.rs
- AcquisitionQueue
- @testing-library/react
- updates.rs
- eslint
- themeModel.ts
- Releases and signed updates
- install-bebop
- build-linux-release-docker
- reset-local-data script
- test-reset-local-data
- Troubleshooting
- lib.rs
- Bebop
- Backup and recovery
- Span
- catalogService.ts
- Implementation Stages
- AppHandle
- lyrics.rs
- esbuild
- DeezerProvider
- playlistService.ts
- useTheme
- .new
- UpdatePanel.tsx
- QobuzProvider
- types.ts
- TidalProvider
- Bebop — Design
- spawn_metadata_job
- download_with_fallback
- ThemeAmbience.tsx
- create_generated_playlist
- AppError
- theme_bundles.rs
- emit_library_changed
- @eslint/js
- ThemeBuilder.tsx
- .start
- Bebop Implementation Plan V4
- Implementation Stages
- PeakHoldVisualizer.tsx
- globals
- Connection
- ThemeConfig
- visualizerStyle.ts
- persistence.rs

## God Nodes (most connected - your core abstractions)
1. `AppState` - 112 edges
2. `DatabaseWorker` - 112 edges
3. `AppError` - 111 edges
4. `database_error()` - 89 edges
5. `database_loop()` - 76 edges
6. `TrackItem` - 52 edges
7. `Request` - 45 edges
8. `useTheme()` - 37 edges
9. `DesktopLibraryPage()` - 34 edges
10. `PlaybackEngine` - 33 edges

## Surprising Connections (you probably didn't know these)
- `maybe_queue_scrobble()` --calls--> `qualifies_for_scrobble()`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/integrations.rs
- `UniversalTracklistProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/molecules/UniversalTracklist.tsx → apps/frontend/src/types.ts
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `MetadataEditorProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/MetadataEditor.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts

## Import Cycles
- None detected.

## Communities (114 total, 22 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.07
Nodes (41): AudioOutputDevice, AudioOutputState, Device, OutputStream, PlaybackState, SampleFormat, Sink, AudioBackend (+33 more)

### Community 1 - "metadata_jobs.rs"
Cohesion: 0.16
Nodes (19): diff_metadata_patches(), diff_only_contains_changed_fields_and_retains_provenance(), diff_patch(), display(), embedded_only_fields_are_included_in_a_full_review(), join(), MetadataDiff, MetadataJob (+11 more)

### Community 2 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, autoprefixer, eslint-plugin-react-refresh, prettier, tailwindcss, @tauri-apps/cli, @testing-library/jest-dom, tsx (+13 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

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

### Community 17 - "AppState"
Cohesion: 0.07
Nodes (55): IntegrationSettings, IntegrationStatus, acquire_album(), acquire_track(), analyze_audio_features(), AppState, cancel_acquisition(), check_for_updates() (+47 more)

### Community 18 - "bundle"
Cohesion: 0.04
Nodes (46): $APPDATA/artwork/**, https://github.com/dbgoodm/Bebop/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.ico, icons/icon.png, app (+38 more)

### Community 19 - "scripts"
Cohesion: 0.11
Nodes (17): name, private, scripts, build, dev, format, format:check, lint (+9 more)

### Community 20 - "permissions"
Cohesion: 0.11
Nodes (18): core:default, core:window:allow-close, core:window:allow-minimize, core:window:allow-start-dragging, core:window:allow-toggle-maximize, dialog:allow-open, fs:allow-read, fs:allow-read-dir (+10 more)

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

### Community 31 - "Desktop & Webview Runtime Invariants"
Cohesion: 0.40
Nodes (4): 1. Linux Display & Window Rendering, 2. Desktop UI & Context Menus, Desktop & Webview Runtime Invariants, graphify

### Community 34 - "AppError"
Cohesion: 0.09
Nodes (32): GenreSummary, MetadataJobStatus, RootAvailability, create_metadata_job(), get_audio_features(), get_metadata_job(), list_available_tags(), list_favorites() (+24 more)

### Community 35 - "catalog.rs"
Cohesion: 0.09
Nodes (51): DirEntry, F, SortDirection, AlbumDetail, AlbumSummary, ArtistCatalogQuery, ArtistDetail, ArtistReference (+43 more)

### Community 36 - "libraryService.ts"
Cohesion: 0.16
Nodes (26): SettingsViewProps, startDiscographySync(), useLibraryScan(), syncLibraryDiscographies(), chooseLibraryFolder(), defaultCatalogQuery, errorSnapshot(), fetchAllLibraryTracks() (+18 more)

### Community 37 - "acquisition/mod.rs"
Cohesion: 0.25
Nodes (11): AcquisitionAlbumRequest, AcquisitionJobDto, AcquisitionJobStatus, AcquisitionProgressPayload, AcquisitionSettings, AcquisitionTrackRequest, Default, Option (+3 more)

### Community 38 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, format, format:check, lint, preview (+3 more)

### Community 39 - "integrations.rs"
Cohesion: 0.11
Nodes (42): DiscordClient, clear_discord(), clear_lastfm_session(), discord_application_id(), eligible_for_online_metadata(), fetch_lastfm_top_tags(), flush_lastfm_outbox(), get_lastfm_session() (+34 more)

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

### Community 45 - "MusicPlayerPage.tsx"
Cohesion: 0.08
Nodes (43): App(), AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps, AlbumsListViewProps, ArtistDetailPageProps, ArtistsGridView(), ArtistsGridViewProps (+35 more)

### Community 46 - "WindowControls.tsx"
Cohesion: 0.29
Nodes (10): chrome, WindowControls(), closeWindow(), command(), isNativeWindow(), isWindowMaximized(), minimizeWindow(), nativeWindow() (+2 more)

### Community 48 - "Result"
Cohesion: 0.09
Nodes (30): IntegrationJob, artwork_path(), DatabaseWorker, decode_artist_cursor(), get_embedded_lyrics(), get_enrichment_cache(), get_lyrics_cache(), list_generation_candidates() (+22 more)

### Community 50 - "useNativePlayback.ts"
Cohesion: 0.17
Nodes (26): asAppError(), EMPTY_BINS, PlaybackEventName, mocks, playingState, track, useNativePlayback(), getPlaybackState() (+18 more)

### Community 53 - "resolver.rs"
Cohesion: 0.09
Nodes (46): extract_deezer_album_id(), extract_deezer_id(), extract_qobuz_album_id(), extract_qobuz_id(), extract_spotify_id(), extract_tidal_id(), is_deezer_url(), is_qobuz_url() (+38 more)

### Community 54 - "ArtistDetailPage.tsx"
Cohesion: 0.19
Nodes (11): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, ArtistDetailPage(), TracksTableViewProps, commands (+3 more)

### Community 55 - "enrichment.rs"
Cohesion: 0.06
Nodes (77): MetadataDiff, AcoustIdRecording, AcoustIdResponse, AcoustIdResult, ArtistRecord, built_in_acoustid_key(), candidates_for_track(), candidates_from_recording() (+69 more)

### Community 56 - "tauri-bindings.ts"
Cohesion: 0.04
Nodes (56): mockUnifiedDetail, AcquisitionAlbumRequest, AcquisitionJobDto, AcquisitionJobStatus, AcquisitionProgressPayload, AcquisitionSettings, AcquisitionTrackRequest, AlbumDetail (+48 more)

### Community 57 - "DesktopLibraryPage.tsx"
Cohesion: 0.08
Nodes (43): EmptyState(), EmptyStateProps, MAIN_NAV_ITEMS, TopNavRail(), DesktopLibraryPage(), formatBytes(), formatDuration(), matchesActivePlayback() (+35 more)

### Community 58 - "metadataService.ts"
Cohesion: 0.12
Nodes (31): MetadataEditor(), MetadataEditorProps, splitValues(), mocks, track, MetadataJobsPanel(), describeError(), applyMusicBrainzCandidate() (+23 more)

### Community 59 - "TrackSummary"
Cohesion: 0.14
Nodes (15): apply_metadata_override(), get_home_snapshot(), get_metadata_draft(), get_playlist(), get_playlist_tracks(), get_track(), hydrate_track(), hydrate_track_ids() (+7 more)

### Community 60 - "user_state.rs"
Cohesion: 0.29
Nodes (11): FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary, Default, Option, Self (+3 more)

### Community 61 - "Stage 7: Acquisition Removal and Repository Cleanup"
Cohesion: 0.14
Nodes (14): Bebop Stage 5 and Stage 7 Continuation Handoff, Current State, Existing Entry Points, Goal, Implement in This Order, Required Migration Behavior, Safe Removal Sequence, Shared-File and Verification Guidance (+6 more)

### Community 62 - "Online integrations"
Cohesion: 0.50
Nodes (4): Discord privacy, Last.fm privacy and reliability, Online integrations, Release configuration

### Community 63 - "themeModel.test.ts"
Cohesion: 0.22
Nodes (6): CREW_THEMES, GEOMETRY_TOKENS, NOTE: this deliberately does not assert design.md's "bars are thin (2-4px),, THEME_FALLBACK_ID, ALL_THEMES, migrateThemeId()

### Community 64 - "README.md"
Cohesion: 0.22
Nodes (6): Acquisition Policy (V3), Future Clean-Room Design Guidelines, Data locations, Data that stays local, Optional network activity, Privacy

### Community 65 - "song_dna.rs"
Cohesion: 0.10
Nodes (50): analyze_file(), analyze_spectral_frame(), AudioAnalysisProgress, AudioFeatures, AvailableTag, candidate(), clamp_request(), descriptor_tags_bucket_tempo_brightness_and_dynamics() (+42 more)

### Community 66 - "AcquisitionQueue"
Cohesion: 0.14
Nodes (32): AcquisitionJobStatus, AcquisitionQueue, emit_progress(), fail_job(), get_job_by_id(), get_target_library_root(), is_cancelled(), process_job() (+24 more)

### Community 68 - "updates.rs"
Cohesion: 0.25
Nodes (14): Display, check(), check_due(), emit_status(), failed(), install(), AppError, AppHandle (+6 more)

### Community 70 - "themeModel.ts"
Cohesion: 0.11
Nodes (22): COLOR_TOKENS, controlFor(), defaultFor(), GRADIENT_TOKENS, NUMBER_TOKENS, optionsFor(), SHADOW_TOKENS, THEME_DOCUMENT_VERSION (+14 more)

### Community 71 - "Releases and signed updates"
Cohesion: 0.40
Nodes (4): Client behavior, Omarchy and Arch-family install, Protected release configuration, Releases and signed updates

### Community 77 - "Troubleshooting"
Cohesion: 0.25
Nodes (8): A file plays but its metadata is missing, A library root is offline or empty, An integration is unavailable, An update fails, Development and packaging, Playback reports resampling or a missing output device, The catalog database is damaged, Troubleshooting

### Community 78 - "lib.rs"
Cohesion: 0.14
Nodes (24): ArtistInformation, Builder, export_typescript_bindings(), exports_typescript_ipc_contracts(), get_artist_information(), get_home_snapshot(), ipc_bindings(), PlaybackStatus (+16 more)

### Community 79 - "Bebop"
Cohesion: 0.33
Nodes (6): Bebop, Demo mode, Documentation, Optional online features, Playback and hi-fi behavior, Quick start

### Community 80 - "Backup and recovery"
Cohesion: 0.50
Nodes (4): Backup and recovery, Catalog backups, Metadata file backups, Recoverable reset

### Community 81 - "Span"
Cohesion: 0.33
Nodes (4): Drop, Instant, Self, Span

### Community 82 - "catalogService.ts"
Cohesion: 0.13
Nodes (25): emptyArtistPage, emptyDiscovery, useArtistCatalog(), useCatalogDiscovery(), albumItem(), ArtistCatalogPage, artistItem(), durationLabel() (+17 more)

### Community 83 - "Implementation Stages"
Cohesion: 0.14
Nodes (13): 1. Performance and catalog foundation — `gpt-5.6-sol`, high, 2. Responsive shell and Library cleanup — `gpt-5.6-terra`, medium, 3. Artwork, lyrics, and artist information — `gpt-5.6-terra`, high, 4. Metadata editor and MusicBrainz jobs — `gpt-5.6-sol`, high, 5. Unified local/remote catalog — `gpt-5.6-terra`, high, 6. Playlists and Song DNA — `gpt-5.6-sol` high for analysis, `gpt-5.6-terra` medium for UI, 7. Acquisition removal and repository cleanup — `gpt-5.6-luna`, medium, Assumptions (+5 more)

### Community 84 - "AppHandle"
Cohesion: 0.18
Nodes (28): ActiveListeningSession, AudioOutputDevice, AudioOutputState, cleanup_missing_tracks(), emit_playback_error(), emit_playback_state(), get_playback_state(), LibraryChanged (+20 more)

### Community 85 - "lyrics.rs"
Cohesion: 0.19
Nodes (23): cache_key(), fetch_lrclib(), LrclibResponse, LyricLine, LyricsDocument, LyricsSource, normalized(), parse_lrc() (+15 more)

### Community 88 - "DeezerProvider"
Cohesion: 0.14
Nodes (13): DeezerProvider, AcquisitionSettings, AppError, Client, Default, Fn, Option, Result (+5 more)

### Community 89 - "playlistService.ts"
Cohesion: 0.08
Nodes (40): FullscreenNowPlaying(), FullscreenNowPlayingProps, mockTrack, NowPlayingBar(), NowPlayingBarProps, mockTrack, playlistMocks, DEFAULT_REQUEST (+32 more)

### Community 90 - "useTheme"
Cohesion: 0.08
Nodes (30): ContextMenu(), ContextMenuHeader, ContextMenuItem, ContextMenuProps, ContextMenuState, ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, DEFAULT_STATS (+22 more)

### Community 91 - ".new"
Cohesion: 0.20
Nodes (14): LibraryScan, add_and_scan_root(), add_library_root(), rescan_library_root(), resolve_playback_track(), restore_library_root(), Error, Into (+6 more)

### Community 92 - "UpdatePanel.tsx"
Cohesion: 0.42
Nodes (9): errorMessage(), UpdatePanel(), UpdateProgress, UpdateStatus, checkForUpdates(), installUpdate(), subscribeUpdateProgress(), subscribeUpdateStatus() (+1 more)

### Community 93 - "QobuzProvider"
Cohesion: 0.17
Nodes (12): QobuzProvider, QobuzStreamInfo, AcquisitionSettings, AppError, Client, Default, Fn, Option (+4 more)

### Community 94 - "types.ts"
Cohesion: 0.07
Nodes (48): AcquisitionQueueDrawer(), AcquisitionQueueDrawerProps, formatSpeed(), AlbumDetailPage(), mockLocalAlbum, mockPartialAlbum, mockRemoteAlbum, CATEGORIES (+40 more)

### Community 95 - "TidalProvider"
Cohesion: 0.18
Nodes (10): AcquisitionSettings, AppError, Client, Default, Fn, Option, Result, Self (+2 more)

### Community 96 - "Bebop — Design"
Cohesion: 0.11
Nodes (17): A theme is more than colour, Bebop — Design, Colour, Community authoring, Copy, Density, Local vs. remote, Motion (+9 more)

### Community 97 - "spawn_metadata_job"
Cohesion: 0.27
Nodes (15): MetadataWriteResult, get_metadata_draft(), get_metadata_job(), MetadataWriteReservation, resume_metadata_job(), rollback_metadata_file(), Arc, Drop (+7 more)

### Community 98 - "download_with_fallback"
Cohesion: 0.15
Nodes (16): AudioExtension, all_providers(), download_with_fallback(), DownloadedAudio, Provider, AcquisitionSettings, AppError, Box (+8 more)

### Community 99 - "ThemeAmbience.tsx"
Cohesion: 0.29
Nodes (8): flightFor(), RIBBONS, seeded(), SMOKE_STRANDS, smokeStrand(), ThemeAmbience(), AppShell(), AppShellProps

### Community 100 - "create_generated_playlist"
Cohesion: 0.33
Nodes (9): GeneratedPlaylist, PlaylistGenerationRequest, create_generated_playlist(), generate_playlist(), generate_playlist_from_database(), get_playlist(), list_starter_playlists(), Playlist (+1 more)

### Community 101 - "AppError"
Cohesion: 0.11
Nodes (44): EnrichmentJob, ImportedThemeBundle, LyricsDocument, AppError, cancel_metadata_job(), cancel_theme_asset_staging(), configure_acoustid_client_key(), create_playlist() (+36 more)

### Community 102 - "theme_bundles.rs"
Cohesion: 0.30
Nodes (22): cancel_theme_asset_staging(), delete_theme_assets(), export_theme_bundle(), import_theme_bundle(), ImportedThemeBundle, promote_theme_assets(), AppError, AppHandle (+14 more)

### Community 103 - "emit_library_changed"
Cohesion: 0.29
Nodes (10): EnrichmentCandidate, MetadataReview, apply_musicbrainz_candidate(), emit_library_changed(), get_metadata_patch(), preview_metadata_changes(), remove_library_root(), MetadataPatch (+2 more)

### Community 105 - "ThemeBuilder.tsx"
Cohesion: 0.15
Nodes (12): clone(), COLOR_FIELDS, Section, SECTIONS, slugify(), STAT_KEYS, TEMPLATE_IDS, ThemeBuilder() (+4 more)

### Community 106 - ".start"
Cohesion: 0.20
Nodes (12): backup_before_upgrade(), corrupt_databases_are_preserved_and_replaced_with_a_clean_catalog(), database_files(), existing_databases_are_backed_up_before_a_schema_upgrade(), is_corruption_error(), recover_corrupt_database(), resolve_track(), resolve_track_id() (+4 more)

### Community 107 - "Bebop Implementation Plan V4"
Cohesion: 0.22
Nodes (7): Bebop Implementation Plan V4, Generated Bindings & Tauri Commands, Interface and Data Changes, New Data Structures, New Database Tables, Summary, Verification and Acceptance Criteria

### Community 108 - "Implementation Stages"
Cohesion: 0.25
Nodes (8): Implementation Stages, Stage 1: Remote Tracklist Ingestion & Unified Schema, Stage 2: Unified Album Page & Tracklist UX, Stage 3: Metadata & Cross-Service Resolver (Rust), Stage 4: Lossless Stream Providers (Rust), Stage 5: Audio Post-Processing, Tagging & Lyrics, Stage 6: Download Queue Manager & IPC Events, Stage 7: UI Surfaces & Settings Integration

### Community 109 - "PeakHoldVisualizer.tsx"
Cohesion: 0.21
Nodes (13): clamp01(), drawParticles(), Particle, particleColor(), particlePool, patternCache, patternFor(), PeakHoldVisualizer() (+5 more)

### Community 111 - "Connection"
Cohesion: 0.10
Nodes (52): CatalogSignatures, Connection, add_root(), catalog_signatures(), cleanup_missing_tracks(), complete_integration_job(), create_playlist(), database_error() (+44 more)

### Community 112 - "ThemeConfig"
Cohesion: 0.22
Nodes (7): BAR_HEIGHTS, ThemeSpecimenCard(), ThemeSpecimenCardProps, POSTER_THEMES, ThemeDocumentV1, ThemeConfig, ThemeContextType

### Community 113 - "visualizerStyle.ts"
Cohesion: 0.49
Nodes (8): FillBand, GradientStop, parseFill(), parseGlow(), parsePx(), splitStop(), splitTopLevel(), visualizerStyleFromVars()

### Community 114 - "persistence.rs"
Cohesion: 0.09
Nodes (48): AlbumSummary, ArtistSummary, Row, album_artists(), album_release_groups_resolve_directly_by_artist_title_and_through_reviewed_merges(), album_title_match_rank(), artist_pages_use_album_artists_and_keyset_cursors(), artist_references() (+40 more)

## Knowledge Gaps
- **422 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+417 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DatabaseWorker` connect `Result` to `spawn_metadata_job`, `AcquisitionQueue`, `AppError`, `create_generated_playlist`, `SpectrumAnalyzer`, `updates.rs`, `integrations.rs`, `TrackSummary`, `.start`, `lib.rs`, `Connection`, `AppState`, `persistence.rs`, `AppHandle`, `lyrics.rs`, `LibraryWatcher`, `enrichment.rs`, `.new`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `process_job()` connect `AcquisitionQueue` to `Result`, `download_with_fallback`, `catalog.rs`, `emit_library_changed`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `ResolvedTrack` connect `resolver.rs` to `DeezerProvider`, `download_with_fallback`, `QobuzProvider`, `TidalProvider`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _422 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.07023214810461358 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._