# Bebop Stage 5 and Stage 7 Continuation Handoff

> **SUPERSEDED — historical reference only.**
>
> This handoff was written to hand V3 work from one agent to another. It has been
> replaced by [`IMPLEMENTATION_PLAN_V4.md`](IMPLEMENTATION_PLAN_V4.md), which is the
> authoritative plan.
>
> Most importantly, **its "no acquisition feature belongs in V3" constraint no longer
> applies** — V4 deliberately introduces an acquisition engine. Do not treat the
> Stage 7 "Acquisition Removal" section below as current direction.
>
> Sections that remain useful: the completed-foundations summary, the entry-point
> file map, and the verification commands at the end.

This document is for an AI agent continuing V3 after Stages 1–4, Stage 6, and the first compact Stage 5 slice. Work in the existing dirty worktree; do not discard or overwrite unrelated changes.

## Current State

Completed foundations:

- Stage 1: cursor-paginated album-artist catalog, indexed queries, incremental Artist rendering, and timing spans.
- Stage 2: responsive rail, Settings-based folder/theme controls, Artist-default Library navigation, and playlist subtab.
- Stage 3: real lyrics pipeline, LRCLIB cache, sidecar LRC support, artwork propagation, and cached MusicBrainz/Wikidata/Wikipedia artist profiles.
- Stage 4: metadata editor, safe tag backups/writes, MusicBrainz/AcoustID job infrastructure, confidence gates, and rate-limited provider cache.
- Stage 6: playlists, Song DNA persistence/analysis, deterministic playlist generation, and Playlist UI.
- Stage 5 compact slice: `EntityProvenance` (`local`, `remote`, `both`) and `EntityAvailability` (`in-library`, `not-local`) are exposed on artist and album contracts. Local entities report `local` + `in-library`; artist provider IDs retain MusicBrainz IDs. Artist discography cards render availability badges.

Important constraints:

- No acquisition feature belongs in V3. Do not add a download, search, transfer, provider, or “get album” action for remote albums.
- Do not fabricate lyrics, biographies, remote releases, provider IDs, or availability.
- Preserve local catalog IDs, playlist IDs, favorites, history, metadata backups, and playback preferences.
- Do not rewrite an actively playing file; use the existing metadata write reservation/defer path.
- Existing changes are uncommitted. Inspect `git status`, migration numbering, `SCHEMA_VERSION`, and generated bindings before editing.

## Stage 5: Remaining Unified Local/Remote Catalog Work

### Goal

Persist and display real cached MusicBrainz discographies alongside local entities. The user must be able to distinguish what is in the library from metadata-only remote releases. Remote releases are informational only and cannot play.

### Existing Entry Points

- `src-tauri/src/catalog.rs`: catalog DTOs, including provenance/availability contracts.
- `src-tauri/src/persistence.rs`: SQLite migrations, catalog query assembly, artist/album details, enrichment cache helpers.
- `src-tauri/src/enrichment.rs`: rate-limited/cached MusicBrainz client; `fetch_artist_record` is available for artist information.
- `src-tauri/src/lib.rs`: Tauri commands and Specta type exports.
- `apps/frontend/src/services/catalogService.ts`: native DTO → UI adapters.
- `apps/frontend/src/components/organisms/ArtistDetailPage.tsx` and `AlbumDetailPage.tsx`: local/remote discography presentation.
- `apps/frontend/src/components/organisms/DiscoverView.tsx`: curated navigation surface.

### Implement in This Order

1. Add a new migration after the current highest migration version.

   Create normalized persistent storage for remote artists, remote releases, release artists, provider IDs, canonical normalized identity, artwork attribution/source, `last_refresh_at`, and cached payload metadata. Keep local `artists`, `albums`, and `tracks` intact.

2. Add persistence APIs for remote upsert/query and reviewed merge records.

   - Primary merge key: matching MusicBrainz ID.
   - Fallback: reviewed normalized artist + release identity only. Never silently merge on text similarity.
   - Model provenance as `local`, `remote`, or `both`.
   - Derive availability from actual local tracks/albums, not from provider data.

3. Add a resumable, cached MusicBrainz artist-discography refresh.

   - Use the shared MusicBrainz limiter and enrichment cache.
   - Cache raw provider responses and record refresh timestamps.
   - Request only the data needed for artist release groups/releases; paginate provider responses if needed.
   - Cover Art Archive artwork is optional but, if used, retain its source/attribution and do not block a discography result on missing art.
   - Surface errors as an honest stale/failed refresh state; do not erase prior cached discography.

4. Expose refresh/query commands and generated bindings.

   Return local and remote albums in a single artist-detail response or a dedicated paged remote-discography response. Keep large remote release lists paged/on-demand.

5. Complete the UI.

   - Artist pages: show combined local tracks and cached remote discography.
   - Every album must display `In Library` or `Not Local`.
   - Remote albums must not expose Play, Queue, metadata-write, or acquisition controls.
   - Show refresh status/time and a non-blocking refresh action.
   - Discover should link to the unified local/remote artist or album entity, rather than a duplicate Discover-only model.

### Stage 5 Acceptance Checks

- A local artist with a MusicBrainz ID can refresh a real remote discography into cache.
- A matching local release becomes `both` + `in-library` without changing its local ID.
- A cached-only release is `remote` + `not-local`, is visible, and cannot play.
- Repeated refreshes respect MusicBrainz rate limiting and do not duplicate rows.
- Refresh failure retains and marks the last successful cached discography.
- Tests cover MBID merge, reviewed normalized fallback, no silent text merge, availability derivation, and pagination.

## Stage 7: Acquisition Removal and Repository Cleanup

### Start Only After Stage 5 Is Stable

Stage 5 uses provider metadata but must not depend on acquisition. Finish its migrations, bindings, and tests before removing acquisition code so shared catalog/enrichment work is not confused with slskd/Antra behavior.

### Targets to Remove

Search first with:

```sh
rg -n -i 'antra|acquisition|slskd|download queue|available through antra' . -g '!node_modules' -g '!target'
```

Expected areas include:

- Frontend: `AcquisitionPanel`, `AntraQueueDrawer`, `antraEngineService`, `acquisitionService`, acquisition copy, and their tests.
- Rust: `src-tauri/src/acquisition.rs`, its Tauri commands/types, manager startup/shutdown, credentials/keyring helpers, and acquisition persistence requests/tests.
- Database: acquisition settings/jobs and obsolete migration behavior.
- Generated bindings: all acquisition/slskd commands and types.
- Documentation: acquisition and integration copy that claims a provider can obtain music.

### Required Migration Behavior

Add a forward-only cleanup migration that:

- Deletes or ignores stored acquisition settings/jobs and the `slskd` key reference.
- Does **not** delete music files, selected library roots, or catalog tracks.
- Leaves an upgrade safe when historical acquisition tables are present.
- Does not attempt to delete OS-keyring secrets if that cannot be done deterministically; instead ensure the application no longer reads or displays them and document any manual cleanup.

### Safe Removal Sequence

1. Remove UI entry points and user-facing copy.
2. Remove frontend services/context and tests; typecheck.
3. Remove Rust commands from `lib.rs`, Specta exports, and generated bindings.
4. Remove acquisition manager/module and persistence request variants.
5. Add/validate cleanup migration and historical-schema upgrade tests.
6. Remove obsolete docs and replace them with a short V3 design note: any future clean-room workflow must resolve metadata/ISRC, provider-match, choose quality fallback, transfer, verify, tag, and import—without using private SpotiFLAC Next code.

### Stage 7 Acceptance Checks

- `rg` finds no Antra/slskd/acquisition UI labels, command names, or provider credentials in shipped source/bindings/docs, except an intentional migration/history note if needed.
- Existing local music, library roots, playlists, favorites, history, and playback settings survive upgrade.
- Rust tests cover upgrade from every historical schema version.
- Frontend tests, typecheck, lint, Rust tests, production build, and Tauri build pass.

## Shared-File and Verification Guidance

Files likely to overlap:

- `src-tauri/src/lib.rs`
- `src-tauri/src/persistence.rs`
- `src-tauri/src/catalog.rs`
- `src-tauri/src/migrations/*`
- `apps/frontend/src/services/tauri-bindings.ts`
- `apps/frontend/src/pages/DesktopLibraryPage.tsx`
- `apps/frontend/src/components/organisms/ArtistDetailPage.tsx`

Before and after work, run:

```sh
cargo test --lib
```

From `apps/frontend` (the repository’s Node shim can be unavailable; use the installed Node binary if necessary):

```sh
/home/nerd/.local/share/mise/installs/node/26.7.0/bin/node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts
/home/nerd/.local/share/mise/installs/node/26.7.0/bin/node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
/home/nerd/.local/share/mise/installs/node/26.7.0/bin/node ../../node_modules/vite/bin/vite.js build
```

Also run `git diff --check`, `cargo fmt --check`, and `graphify update .` from the project root after code changes.

Known test note: a prior `DesktopLibraryPage.test.tsx` run exposed a scheduled React update after JSDOM teardown (`window is not defined`) despite all assertions passing. Reproduce it before treating it as current; fix the test lifecycle if it remains.
