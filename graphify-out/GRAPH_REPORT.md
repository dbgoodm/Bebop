# Graph Report - Bebop  (2026-08-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 505 nodes · 784 edges · 25 communities (23 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c3027f5f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 24

## God Nodes (most connected - your core abstractions)
1. `TrackItem` - 32 edges
2. `useTheme()` - 30 edges
3. `RealAudioEngine` - 19 edges
4. `compilerOptions` - 16 edges
5. `AlbumItem` - 14 edges
6. `ArtistItem` - 14 edges
7. `scripts` - 11 edges
8. `scripts` - 10 edges
9. `LOCAL_ALBUMS` - 8 edges
10. `LOCAL_ARTISTS` - 8 edges

## Surprising Connections (you probably didn't know these)
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts
- `NowPlayingQueueModalProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingQueueModal.tsx → apps/frontend/src/types.ts
- `WaveformScrubberProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/WaveformScrubber.tsx → apps/frontend/src/types.ts
- `UniversalTracklistProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/molecules/UniversalTracklist.tsx → apps/frontend/src/types.ts

## Import Cycles
- None detected.

## Communities (25 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (32): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps (+24 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (14): FullscreenNowPlaying(), FullscreenNowPlayingProps, MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform(), NowPlayingBar(), NowPlayingBarProps, generateSoundcloudWaveform() (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (39): devDependencies, autoprefixer, esbuild, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (39): properties, Identifier, default, description, type, description, oneOf, type (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (62): App(), EmptyState(), EmptyStateProps, ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, DEFAULT_STATS, ListeningStats(), ListeningStatsProps (+54 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (35): anyOf, description, required, type, description, properties, required, type (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, baseUrl, experimentalDecorators, isolatedModules, jsx, lib (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (36): properties, default, description, type, description, type, $ref, type (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (33): dependencies, lucide-react, motion, react, react-dom, @tailwindcss/vite, @tauri-apps/api, vite (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (32): anyOf, description, required, type, description, properties, required, type (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (27): BTreeMap, Builder, Default, Mutex, Option, PathBuf, Result, RwLock (+19 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (17): app, security, windows, withGlobalTauri, build, beforeBuildCommand, beforeDevCommand, devUrl (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (15): name, private, scripts, build, dev, format, format:check, lint (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (14): core:default, dialog:allow-open, fs:allow-read, fs:allow-read-dir, fs:allow-stat, linux, main, windows (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (10): AppError, AppError_Deserialize, AppError_Serialize, AudioExtension, commands, DesktopState, PlaybackState, PlaybackStatus (+2 more)

## Knowledge Gaps
- **215 isolated node(s):** `ColumnDefinition`, `GenreCategory`, `LyricLine`, `AmbientOrbConfig`, `StatCardColorConfig` (+210 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 2` to `Community 9`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `TrackItem` connect `Community 0` to `Community 1`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `ColumnDefinition`, `GenreCategory`, `LyricLine` to the rest of the system?**
  _215 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11100832562442182 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05398110661268556 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.053703703703703705 - nodes in this community are weakly interconnected._