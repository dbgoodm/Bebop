# Bebop Implementation Plan V3

## Summary

V3 turns Bebop’s prototype surfaces into a responsive, metadata-rich local music manager:

- Library always opens on Artists and lists album artists only.
- Local and MusicBrainz-discovered artists/albums share unified views with clear availability badges.
- Manual and batch tag editing become first-class features.
- MusicBrainz enrichment supports track, album, artist, and whole-library jobs using AcoustID fingerprints.
- High-confidence matches write automatically; every write creates a backup and verifies audio integrity.
- Real embedded/sidecar lyrics and LRCLIB replace fabricated lyrics.
- Playlists gain full Library UI plus locally computed “Song DNA” generation.
- Database queries, rendering, and WebKit behavior are optimized for Omarchy.
- Antra, slskd, their credentials, UI, jobs, and backend code are removed. No replacement acquisition engine is included in V3.
- SpotiFLAC-style acquisition is deferred because Next is closed-source and no acceptable provider boundary was selected. ([SpotiFLAC-Next README](https://github.com/spotbye/SpotiFLAC-Next/blob/main/README.md))

Model assignments follow OpenAI’s current guidance: Sol for complex architecture/debugging, Terra for balanced implementation work, and Luna for repetitive high-volume edits and fixtures. ([OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model))

## Implementation Stages

### 1. Performance and catalog foundation — `gpt-5.6-sol`, high

- Add timing spans for Tauri commands, SQLite queries, React navigation, long tasks, image decoding, and first visible render.
- Replace the current 5,000-entity discovery load and per-entity N+1 queries with joined/batched SQL, indexed filtering, and cursor-based pages.
- Query artists exclusively through `album_artists`; track-only featured performers remain visible on tracks but not in the Artist grid.
- Virtualize or incrementally render Artist, Album, Track, and Playlist collections.
- Load detail records, artwork, bios, lyrics, and remote discographies on demand with cancellation and stale-request protection.
- Retain the stable NVIDIA/Wayland CPU/SHM renderer fallback until an instrumented GPU path passes a navigation/playback soak test without WebKit crashes.

### 2. Responsive shell and Library cleanup — `gpt-5.6-terra`, medium

- Rebuild the top rail as responsive grid regions so branding, navigation, search, and actions cannot overlap.
- At narrower widths, shorten branding, collapse secondary actions into overflow, and move search to a second row when required.
- Remove the “Native Rust output” pill and theme button from the rail.
- Consolidate the currently duplicated/dead Settings implementations into one routed Settings view.
- Put theme selection and all library-root actions—add, rescan, disable, restore, and remove—inside Settings.
- Remove the Library hero, “Local Library,” “Your music,” folder button, and root cards.
- Every explicit top-level Library click opens the Artist grid.
- Add `Playlists` to the Library subtabs.
- Remove stat-card bottom taglines while retaining labels, values, and icons.

### 3. Artwork, lyrics, and artist information — `gpt-5.6-terra`, high

- Preserve `coverUrl` when mapping Home snapshot tracks into Continue Listening, Recently Added, and Rediscover cards.
- Replace hardcoded lyrics with a `LyricsDocument` pipeline:
  1. synchronized embedded lyrics;
  2. sidecar `.lrc`;
  3. unsynchronized embedded lyrics;
  4. cached LRCLIB result;
  5. honest “Lyrics unavailable” state.
- Cache lyrics by recording MBID or normalized artist/title/album/duration and display source attribution.
- Resolve MusicBrainz artist relationships to Wikidata/Wikipedia, cache biography, canonical source URL, image attribution, aliases, country, active years, and genres.
- Never synthesize biography or lyric text.

### 4. Metadata editor and MusicBrainz jobs — `gpt-5.6-sol`, high

- Expose Edit Metadata from track rows, album pages, artist pages, multi-selection actions, and a Library-wide metadata tools page.
- Support editable title, recording artists, album, album artists, track/disc numbers and totals, date/year, genres, composer, label, catalog number, ISRC, MBIDs, artwork, and lyrics.
- Show a field-level before/after diff, source, confidence, and affected files before manual or ambiguous batch writes.
- Bundle a Chromaprint-compatible fingerprint worker and support a user-configured AcoustID client key.
- Run resumable jobs with scopes `track`, `album`, `artist`, and `library`; expose progress, pause, resume, cancel, retry, and review counts.
- Match in this order:
  1. validate embedded MBIDs;
  2. fingerprint through AcoustID;
  3. resolve MusicBrainz recording;
  4. disambiguate release using duration, album artist, track/disc position, release count, and ISRC;
  5. use text search only as a review candidate.
- Auto-write only when a unique fingerprint/MBID recording and unique release agree, duration differs by no more than two seconds, and no existing identifier conflicts. All other results enter review.
- Rate-limit and cache MusicBrainz requests, use Cover Art Archive for release art, and resume interrupted library jobs without repeating completed lookups.
- Before every automatic or manual file write, retain the original tag backup; afterward, reread tags and verify the decoded audio fingerprint is unchanged.
- Never rewrite a playing file; queue it until playback releases the path.

### 5. Unified local/remote catalog — `gpt-5.6-terra`, high

- Add entity provenance and availability: `local`, `remote`, or `both`, with provider IDs and last-refresh timestamps.
- Merge entities primarily by MBID and secondarily by reviewed normalized artist/album identity.
- Display MusicBrainz-discovered albums and album artists alongside local entities with visible “In Library” or “Not Local” badges.
- Artist details combine local tracks with cached remote discography; remote albums cannot be played and have no acquisition action in V3.
- Keep Discover for curated recommendations that link to these unified entities, rather than maintaining a duplicate catalog.

### 6. Playlists and Song DNA — `gpt-5.6-sol` high for analysis, `gpt-5.6-terra` medium for UI

- Build Playlist grid/detail views with create, rename, delete, add/remove tracks, reorder, duplicate, play, queue, and cover mosaic behavior.
- Move the existing “save queue” capability out of Settings and into Playlists.
- Analyze tracks in a throttled background worker for BPM, musical key/chroma, loudness, energy, spectral centroid/rolloff, and dynamic range.
- Combine normalized audio features with genre, year, favorites, skips, play counts, recency, and artist/album relationships.
- Provide a playlist generator with seed tracks, target duration/track count, mood/energy controls, familiarity, era, genre constraints, and explicit-track exclusions.
- Rank deterministically, cap repeated artists/albums, spread similar tracks through the sequence, and show a short explanation for each selection.
- Save results as editable snapshots; generated playlists never change automatically after saving.
- Version analysis data so feature extraction can be recomputed without rescanning tags or invalidating playlists.

### 7. Acquisition removal and repository cleanup — `gpt-5.6-luna`, medium

- Remove Antra contexts, queue drawer, mock acquisition state, slskd settings/panel, Tauri commands, Rust acquisition manager, credentials, generated bindings, tests, and copy.
- Migrate away stored acquisition settings, jobs, and the slskd key without deleting downloaded music or library files.
- Leave no dormant acquisition buttons or “available through Antra” labels.
- Record the deferred clean-room workflow as a future design note: metadata/ISRC resolution, provider matching, quality fallback, transfer, verification, tagging, and import—without private Next code.

## Interface and Data Changes

- Extend `LibrarySubTab` with `playlists`.
- Replace bulk discovery responses with paged `CatalogPage<T>` requests containing cursor, page size, filter, sort, and availability.
- Extend artist and album summaries with provenance, availability, MBIDs, biography/artwork attribution, and refresh status.
- Add `LyricsDocument`, `LyricLine`, `MetadataJob`, `MetadataCandidate`, `MetadataDiff`, `AudioFeatures`, `Playlist`, and `PlaylistGenerationRequest`.
- Add database migrations for remote entities, enrichment jobs/candidates, lyrics cache, artist information, audio features, playlist metadata, and provenance.
- Remove all public acquisition/slskd commands and types.
- Preserve existing playlist IDs, favorites, listening history, local catalog IDs, metadata backups, and playback preferences.

## Verification and Acceptance

- Rust tests cover album-artist filtering, pagination, entity merging, fingerprint confidence rules, resumable jobs, request throttling, tag backup/rollback, lyric parsing, feature extraction, and playlist determinism.
- HTTP integration tests use recorded fixtures or mock servers for MusicBrainz, AcoustID, Cover Art Archive, Wikipedia/Wikidata, and LRCLIB; CI performs no live metadata writes.
- React tests cover Artist-default navigation, responsive rail layouts, Settings folder/theme controls, remote badges, metadata review, playlist CRUD/generation, artwork mapping, and lyric empty states.
- Validate the rail without overlap at 640, 768, 1024, 1280, and 1920-pixel widths.
- On the current 2,215-track library, warm Library navigation must paint visible content within 200 ms, produce no navigation task longer than 100 ms, and remain responsive while enrichment or analysis runs.
- Benchmark a synthetic 25,000-track catalog to ensure UI rendering stays bounded by the visible page rather than total entity count.
- Run `cargo test`, frontend tests, typecheck, lint, production build, and Tauri build.
- Install the release build over the current local Bebop installation, launch through the desktop entry on Omarchy, verify Home/Library/Settings/Now Playing end-to-end, inspect logs, then commit and push the verified V3 stages.

## Assumptions

- MusicBrainz and AcoustID are native Bebop integrations; Picard is not installed or invoked.
- The user supplies an AcoustID client key before fingerprint lookups are enabled.
- High-confidence enrichment writes automatically, while ambiguous/conflicting results require review.
- Lyrics prefer local data and fall back only to LRCLIB.
- Artist biographies come from attributed Wikidata/Wikipedia results connected through MusicBrainz.
- Acquisition is completely removed and intentionally deferred from V3.
