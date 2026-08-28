# Graph Report - Bebop  (2026-08-28)

## Corpus Check
- 166 files · ~150,659 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2151 nodes · 6144 edges · 106 communities (83 shown, 23 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e6666dd5`
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
- AGENTS.md
- README.md
- extraction-spec.md
- Connection
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
- esbuild
- eslint-plugin-react-hooks
- Result
- jsdom
- useNativePlayback.ts
- @testing-library/user-event
- vitest
- resolver.rs
- .in_memory
- enrichment.rs
- tauri-bindings.ts
- DesktopLibraryPage.tsx
- metadataService.ts
- Vec
- user_state.rs
- Stage 7: Acquisition Removal and Repository Cleanup
- Online integrations
- reconcile
- README.md
- song_dna.rs
- AcquisitionQueue
- @testing-library/react
- updates.rs
- eslint
- autoprefixer
- Releases and signed updates
- install-bebop
- build-linux-release-docker
- reset-local-data script
- test-reset-local-data
- Troubleshooting
- PeakHoldVisualizer.tsx
- Bebop
- Backup and recovery
- Span
- String
- Implementation Stages
- persistence.rs
- lyrics.rs
- lib.rs
- globals
- DeezerProvider
- PlaylistsView.tsx
- types.ts
- .state_unavailable
- QobuzProvider
- acquisitionService.ts
- TidalProvider
- Bebop — Design
- themeService.tsx
- download_with_fallback
- Request
- FullscreenNowPlaying.tsx
- create_metadata_job
- Vec
- resolve_playback_track
- Bebop Implementation Plan V4
- Implementation Stages
- create_generated_playlist

## God Nodes (most connected - your core abstractions)
1. `AppState` - 110 edges
2. `DatabaseWorker` - 109 edges
3. `AppError` - 103 edges
4. `database_error()` - 87 edges
5. `database_loop()` - 74 edges
6. `TrackItem` - 47 edges
7. `Request` - 44 edges
8. `useTheme()` - 35 edges
9. `PlaybackEngine` - 33 edges
10. `MusicBrainzClient` - 32 edges

## Surprising Connections (you probably didn't know these)
- `maybe_queue_scrobble()` --calls--> `qualifies_for_scrobble()`  [INFERRED]
  src-tauri/src/lib.rs → src-tauri/src/integrations.rs
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `NowPlayingQueueModalProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingQueueModal.tsx → apps/frontend/src/types.ts
- `toPlaylistSummary()` --indirect_call--> `toArtworkUrl()`  [INFERRED]
  apps/frontend/src/services/playlistService.ts → apps/frontend/src/services/libraryService.ts
- `loadPersistentPlayerState()` --indirect_call--> `toTrackItem()`  [INFERRED]
  apps/frontend/src/services/playerStateService.ts → apps/frontend/src/services/libraryService.ts

## Import Cycles
- None detected.

## Communities (106 total, 23 thin omitted)

### Community 0 - "PlaybackEngine"
Cohesion: 0.07
Nodes (41): AudioOutputDevice, AudioOutputState, Device, OutputStream, PlaybackState, SampleFormat, Sink, AudioBackend (+33 more)

### Community 1 - "metadata_jobs.rs"
Cohesion: 0.16
Nodes (19): diff_metadata_patches(), diff_only_contains_changed_fields_and_retains_provenance(), diff_patch(), display(), embedded_only_fields_are_included_in_a_full_review(), join(), MetadataDiff, MetadataJob (+11 more)

### Community 2 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, @eslint/js, eslint-plugin-react-refresh, prettier, tailwindcss, @tauri-apps/cli, @testing-library/jest-dom, tsx (+13 more)

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
Cohesion: 0.09
Nodes (69): IntegrationSettings, LyricsDocument, acquire_album(), acquire_track(), AppError, AppState, cancel_acquisition(), cancel_metadata_job() (+61 more)

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

### Community 34 - "Connection"
Cohesion: 0.12
Nodes (52): Connection, RootAvailability, apply_metadata_override(), artist_references(), artwork_path(), cleanup_missing_tracks(), complete_integration_job(), create_playlist() (+44 more)

### Community 35 - "catalog.rs"
Cohesion: 0.09
Nodes (51): DirEntry, F, SortDirection, AlbumDetail, AlbumSummary, ArtistCatalogQuery, ArtistDetail, ArtistReference (+43 more)

### Community 36 - "libraryService.ts"
Cohesion: 0.18
Nodes (23): startDiscographySync(), useLibraryScan(), syncLibraryDiscographies(), chooseLibraryFolder(), defaultCatalogQuery, errorSnapshot(), formatBitrate(), formatDuration() (+15 more)

### Community 37 - "catalogService.ts"
Cohesion: 0.16
Nodes (22): DemoMusicPlayer(), albumItem(), artistItem(), durationLabel(), fileSizeLabel(), formatAudioSpecs(), formatTrackDuration(), loadAlbumDetail() (+14 more)

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
Cohesion: 0.08
Nodes (39): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps (+31 more)

### Community 48 - "Result"
Cohesion: 0.12
Nodes (9): DatabaseWorker, decode_artist_cursor(), get_embedded_lyrics(), get_enrichment_cache(), get_lyrics_cache(), AppError, Option, Result (+1 more)

### Community 50 - "useNativePlayback.ts"
Cohesion: 0.17
Nodes (26): asAppError(), EMPTY_BINS, PlaybackEventName, mocks, playingState, track, useNativePlayback(), getPlaybackState() (+18 more)

### Community 53 - "resolver.rs"
Cohesion: 0.09
Nodes (46): extract_deezer_album_id(), extract_deezer_id(), extract_qobuz_album_id(), extract_qobuz_id(), extract_spotify_id(), extract_tidal_id(), is_deezer_url(), is_qobuz_url() (+38 more)

### Community 54 - ".in_memory"
Cohesion: 0.12
Nodes (22): backup_before_upgrade(), corrupt_databases_are_preserved_and_replaced_with_a_clean_catalog(), database_files(), existing_databases_are_backed_up_before_a_schema_upgrade(), is_corruption_error(), open_database(), player_state_restores_without_a_current_track(), recover_corrupt_database() (+14 more)

### Community 55 - "enrichment.rs"
Cohesion: 0.07
Nodes (69): MetadataDiff, AcoustIdRecording, AcoustIdResponse, AcoustIdResult, ArtistRecord, candidates_for_track(), candidates_from_recording(), credential_error() (+61 more)

### Community 56 - "tauri-bindings.ts"
Cohesion: 0.04
Nodes (55): errorMessage(), UpdatePanel(), AcquisitionAlbumRequest, AcquisitionJobDto, AcquisitionJobStatus, AcquisitionProgressPayload, AcquisitionSettings, AcquisitionTrackRequest (+47 more)

### Community 57 - "DesktopLibraryPage.tsx"
Cohesion: 0.16
Nodes (22): EmptyState(), EmptyStateProps, emptyArtistPage, emptyDiscovery, useArtistCatalog(), useCatalogDiscovery(), DesktopLibraryPage(), formatBytes() (+14 more)

### Community 58 - "metadataService.ts"
Cohesion: 0.13
Nodes (30): MetadataEditor(), splitValues(), mocks, track, MetadataJobsPanel(), describeError(), applyMusicBrainzCandidate(), cancelMetadataJob() (+22 more)

### Community 59 - "Vec"
Cohesion: 0.14
Nodes (24): AlbumSummary, ArtistSummary, album_artists(), get_artist_detail(), get_remote_artist_summary(), get_remote_releases_by_artist_name(), get_remote_releases_for_mbid(), get_remote_tracks_for_release() (+16 more)

### Community 60 - "user_state.rs"
Cohesion: 0.29
Nodes (11): FavoriteReference, HomeSnapshot, PersistentPlayerState, PlayerPreferences, PlaylistSummary, Default, Option, Self (+3 more)

### Community 61 - "Stage 7: Acquisition Removal and Repository Cleanup"
Cohesion: 0.14
Nodes (14): Bebop Stage 5 and Stage 7 Continuation Handoff, Current State, Existing Entry Points, Goal, Implement in This Order, Required Migration Behavior, Safe Removal Sequence, Shared-File and Verification Guidance (+6 more)

### Community 62 - "Online integrations"
Cohesion: 0.50
Nodes (4): Discord privacy, Last.fm privacy and reliability, Online integrations, Release configuration

### Community 63 - "reconcile"
Cohesion: 0.31
Nodes (10): CatalogSignatures, catalog_signatures(), reconcile(), reconcile_paths(), Reconciliation, relink_moved_track(), upsert_album(), upsert_artists() (+2 more)

### Community 64 - "README.md"
Cohesion: 0.22
Nodes (6): Acquisition Policy (V3), Future Clean-Room Design Guidelines, Data locations, Data that stays local, Optional network activity, Privacy

### Community 65 - "song_dna.rs"
Cohesion: 0.12
Nodes (41): analyze_file(), analyze_spectral_frame(), AudioAnalysisProgress, AudioFeatures, candidate(), clamp_request(), duration_and_energy_constraints_are_enforced(), energy() (+33 more)

### Community 66 - "AcquisitionQueue"
Cohesion: 0.10
Nodes (43): AcquisitionJobStatus, AcquisitionAlbumRequest, AcquisitionJobDto, AcquisitionJobStatus, AcquisitionProgressPayload, AcquisitionSettings, AcquisitionTrackRequest, Default (+35 more)

### Community 68 - "updates.rs"
Cohesion: 0.25
Nodes (14): Display, check(), check_due(), emit_status(), failed(), install(), AppError, AppHandle (+6 more)

### Community 71 - "Releases and signed updates"
Cohesion: 0.40
Nodes (4): Client behavior, Omarchy and Arch-family install, Protected release configuration, Releases and signed updates

### Community 77 - "Troubleshooting"
Cohesion: 0.25
Nodes (8): A file plays but its metadata is missing, A library root is offline or empty, An integration is unavailable, An update fails, Development and packaging, Playback reports resampling or a missing output device, The catalog database is damaged, Troubleshooting

### Community 78 - "PeakHoldVisualizer.tsx"
Cohesion: 0.06
Nodes (44): flightFor(), RIBBONS, seeded(), SMOKE_STRANDS, smokeStrand(), ThemeAmbience(), chrome, WindowControls() (+36 more)

### Community 79 - "Bebop"
Cohesion: 0.33
Nodes (6): Bebop, Demo mode, Documentation, Optional online features, Playback and hi-fi behavior, Quick start

### Community 80 - "Backup and recovery"
Cohesion: 0.50
Nodes (4): Backup and recovery, Catalog backups, Metadata file backups, Recoverable reset

### Community 81 - "Span"
Cohesion: 0.33
Nodes (4): Drop, Instant, Self, Span

### Community 82 - "String"
Cohesion: 0.17
Nodes (35): EnrichmentCandidate, EnrichmentJob, LibraryScan, MetadataReview, MetadataWriteResult, add_and_scan_root(), add_library_root(), analyze_audio_features() (+27 more)

### Community 83 - "Implementation Stages"
Cohesion: 0.14
Nodes (13): 1. Performance and catalog foundation — `gpt-5.6-sol`, high, 2. Responsive shell and Library cleanup — `gpt-5.6-terra`, medium, 3. Artwork, lyrics, and artist information — `gpt-5.6-terra`, high, 4. Metadata editor and MusicBrainz jobs — `gpt-5.6-sol`, high, 5. Unified local/remote catalog — `gpt-5.6-terra`, high, 6. Playlists and Song DNA — `gpt-5.6-sol` high for analysis, `gpt-5.6-terra` medium for UI, 7. Acquisition removal and repository cleanup — `gpt-5.6-luna`, medium, Assumptions (+5 more)

### Community 84 - "persistence.rs"
Cohesion: 0.10
Nodes (39): Row, add_root(), album_release_groups_resolve_directly_by_artist_title_and_through_reviewed_merges(), artist_pages_use_album_artists_and_keyset_cursors(), ArtistSyncRow, audio_features_from_row(), discography_sync_covers_every_artist_and_skips_recently_checked_ones(), encode_artist_cursor() (+31 more)

### Community 85 - "lyrics.rs"
Cohesion: 0.19
Nodes (23): cache_key(), fetch_lrclib(), LrclibResponse, LyricLine, LyricsDocument, LyricsSource, normalized(), parse_lrc() (+15 more)

### Community 86 - "lib.rs"
Cohesion: 0.14
Nodes (25): ArtistInformation, Builder, export_typescript_bindings(), exports_typescript_ipc_contracts(), get_artist_detail(), get_artist_information(), get_home_snapshot(), ipc_bindings() (+17 more)

### Community 88 - "DeezerProvider"
Cohesion: 0.14
Nodes (13): DeezerProvider, AcquisitionSettings, AppError, Client, Default, Fn, Option, Result (+5 more)

### Community 89 - "PlaylistsView.tsx"
Cohesion: 0.15
Nodes (28): DEFAULT_REQUEST, durationLabel(), LENGTH_OPTIONS, MOOD_OPTIONS, PlaylistsView(), mocks, track, analyzeAudioFeatures() (+20 more)

### Community 90 - "types.ts"
Cohesion: 0.07
Nodes (45): App(), ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, DEFAULT_STATS, ListeningStats(), ListeningStatsProps, RecentlyAddedRail(), RediscoverRail() (+37 more)

### Community 91 - ".state_unavailable"
Cohesion: 0.13
Nodes (34): ActiveListeningSession, AudioOutputDevice, emit_playback_error(), emit_playback_state(), get_playback_state(), list_audio_output_devices(), maybe_queue_scrobble(), merge_catalog_entities() (+26 more)

### Community 93 - "QobuzProvider"
Cohesion: 0.17
Nodes (12): QobuzProvider, QobuzStreamInfo, AcquisitionSettings, AppError, Client, Default, Fn, Option (+4 more)

### Community 94 - "acquisitionService.ts"
Cohesion: 0.08
Nodes (45): AcquisitionQueueDrawer(), AcquisitionQueueDrawerProps, formatSpeed(), AlbumDetailPage(), mockLocalAlbum, mockPartialAlbum, mockRemoteAlbum, CATEGORIES (+37 more)

### Community 95 - "TidalProvider"
Cohesion: 0.18
Nodes (10): AcquisitionSettings, AppError, Client, Default, Fn, Option, Result, Self (+2 more)

### Community 96 - "Bebop — Design"
Cohesion: 0.11
Nodes (17): A theme is more than colour, Bebop — Design, Colour, Community authoring, Copy, Density, Local vs. remote, Motion (+9 more)

### Community 97 - "themeService.tsx"
Cohesion: 0.13
Nodes (24): createPlaylistFromQueue(), loadFavoriteTrackIds(), loadHomeSnapshot(), loadPersistentPlayerState(), loadPlaylists(), loadPlaylistTracks(), loadUiPreference(), saveLibraryViewPreference() (+16 more)

### Community 98 - "download_with_fallback"
Cohesion: 0.15
Nodes (16): AudioExtension, all_providers(), download_with_fallback(), DownloadedAudio, Provider, AcquisitionSettings, AppError, Box (+8 more)

### Community 99 - "Request"
Cohesion: 0.15
Nodes (15): GenreSummary, list_favorites(), query_discovery(), query_genres(), query_tracks(), Request, Box, CatalogQuery (+7 more)

### Community 102 - "FullscreenNowPlaying.tsx"
Cohesion: 0.24
Nodes (6): FullscreenNowPlaying(), FullscreenNowPlayingProps, mockTrack, loadTrackLyrics(), unwrap(), LyricsDocument

### Community 103 - "create_metadata_job"
Cohesion: 0.26
Nodes (12): MetadataJobStatus, create_metadata_job(), every_metadata_job_scope_resolves_its_tracks(), get_metadata_job(), list_metadata_jobs(), metadata_jobs_checkpoint_scopes_and_retry_only_unfinished_tracks(), open_connection(), record_metadata_job_track() (+4 more)

### Community 105 - "Vec"
Cohesion: 0.24
Nodes (11): IntegrationStatus, configure_lastfm_session(), DesktopState, disconnect_lastfm(), get_desktop_state(), get_integration_statuses(), list_library_roots(), LibraryRoot (+3 more)

### Community 106 - "resolve_playback_track"
Cohesion: 0.24
Nodes (6): resolve_playback_track(), Error, Into, PathBuf, Self, ToString

### Community 107 - "Bebop Implementation Plan V4"
Cohesion: 0.22
Nodes (7): Bebop Implementation Plan V4, Generated Bindings & Tauri Commands, Interface and Data Changes, New Data Structures, New Database Tables, Summary, Verification and Acceptance Criteria

### Community 108 - "Implementation Stages"
Cohesion: 0.25
Nodes (8): Implementation Stages, Stage 1: Remote Tracklist Ingestion & Unified Schema, Stage 2: Unified Album Page & Tracklist UX, Stage 3: Metadata & Cross-Service Resolver (Rust), Stage 4: Lossless Stream Providers (Rust), Stage 5: Audio Post-Processing, Tagging & Lyrics, Stage 6: Download Queue Manager & IPC Events, Stage 7: UI Surfaces & Settings Integration

### Community 109 - "create_generated_playlist"
Cohesion: 0.48
Nodes (7): GeneratedPlaylist, PlaylistGenerationRequest, create_generated_playlist(), generate_playlist(), generate_playlist_from_database(), get_playlist(), Playlist

## Knowledge Gaps
- **390 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+385 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DatabaseWorker` connect `Result` to `AcquisitionQueue`, `Request`, `updates.rs`, `SpectrumAnalyzer`, `integrations.rs`, `create_generated_playlist`, `AppState`, `String`, `persistence.rs`, `lyrics.rs`, `lib.rs`, `enrichment.rs`, `.in_memory`, `LibraryWatcher`, `.state_unavailable`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Why does `AppState` connect `AppState` to `PlaybackEngine`, `AcquisitionQueue`, `integrations.rs`, `Vec`, `resolve_playback_track`, `create_generated_playlist`, `Result`, `String`, `LibraryWatcher`, `lib.rs`, `enrichment.rs`, `.state_unavailable`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `process_job()` connect `AcquisitionQueue` to `Result`, `download_with_fallback`, `catalog.rs`, `String`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _390 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PlaybackEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.07023214810461358 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._