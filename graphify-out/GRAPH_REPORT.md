# Graph Report - Bebop  (2026-08-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 275 nodes · 525 edges · 16 communities (15 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `84d198bf`
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

## God Nodes (most connected - your core abstractions)
1. `TrackItem` - 32 edges
2. `useTheme()` - 30 edges
3. `RealAudioEngine` - 19 edges
4. `compilerOptions` - 16 edges
5. `ArtistItem` - 14 edges
6. `AlbumItem` - 14 edges
7. `scripts` - 11 edges
8. `LOCAL_ARTISTS` - 8 edges
9. `LOCAL_ALBUMS` - 8 edges
10. `scripts` - 8 edges

## Surprising Connections (you probably didn't know these)
- `FullscreenNowPlayingProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/FullscreenNowPlaying.tsx → apps/frontend/src/types.ts
- `NowPlayingBarProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingBar.tsx → apps/frontend/src/types.ts
- `NowPlayingQueueModalProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/NowPlayingQueueModal.tsx → apps/frontend/src/types.ts
- `WaveformScrubberProps` --references--> `TrackItem`  [EXTRACTED]
  apps/frontend/src/components/organisms/WaveformScrubber.tsx → apps/frontend/src/types.ts
- `RecentlyAddedRail()` --calls--> `useTheme()`  [EXTRACTED]
  apps/frontend/src/components/molecules/RecentlyAddedRail.tsx → apps/frontend/src/services/themeService.tsx

## Import Cycles
- None detected.

## Communities (16 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (31): ALL_AVAILABLE_COLUMNS, ColumnDefinition, ColumnKey, UniversalTracklist(), UniversalTracklistProps, AlbumDetailPageProps, AlbumsGridView(), AlbumsGridViewProps (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (31): ContinueListeningRail(), SAMPLE_CONTINUE_ITEMS, DEFAULT_STATS, ListeningStats(), ListeningStatsProps, AlbumDetailPage(), DiscoverView(), FullscreenNowPlaying() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (37): devDependencies, autoprefixer, esbuild, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (31): dependencies, lucide-react, motion, react, react-dom, @tailwindcss/vite, vite, @vitejs/plugin-react (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (21): App(), EmptyState(), EmptyStateProps, TopNavRail(), AntraQueueDrawer(), AntraQueueDrawerProps, ArtistDetailPage(), LibraryView() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (19): RecentlyAddedRail(), RediscoverRail(), MAIN_NAV_ITEMS, DEMO_RECENTLY_ADDED, DEMO_REDISCOVER_ITEMS, LOCAL_RECENTLY_ADDED, LOCAL_REDISCOVER_ITEMS, ArtistTopTrack (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, baseUrl, experimentalDecorators, isolatedModules, jsx, lib (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (13): name, private, scripts, build, dev, format, format:check, lint (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (6): MonstercatVisualizer(), MonstercatVisualizerProps, generateCompactWaveform(), NowPlayingBar(), NowPlayingBarProps, isDemoMode

### Community 10 - "Community 10"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Knowledge Gaps
- **95 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `name`, `private` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TrackItem` connect `Community 0` to `Community 1`, `Community 4`, `Community 5`, `Community 7`, `Community 9`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `RealAudioEngine` connect `Community 7` to `Community 0`, `Community 9`, `Community 4`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 2` to `Community 3`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _95 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.12181616832779624 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08097165991902834 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._