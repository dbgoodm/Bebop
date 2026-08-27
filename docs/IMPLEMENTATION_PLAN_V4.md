# Bebop Implementation Plan V4

## Summary

V4 introduces a native, lossless **Acquisition Engine** to Bebop and completes the **Unified Local/Remote Catalog Experience**:

- **Remote & Missing Album Pages**: Clicking on any missing album or remote discography release opens a dedicated `AlbumDetailPage` displaying the full remote tracklist.
- **Dimmed vs. Lit-Up Visual Hierarchy**: Tracks present in the local library are highlighted/lit up with full playback, queueing, and audiophile badges; missing tracks are visually dimmed with one-click "Get Track" actions.
- **Batch Acquisition Controls**: Album headers support "Acquire Missing Tracks" or "Get Full Album" to seamlessly enqueue missing audio files.
- **Rust-Native Lossless Acquisition Engine**: A multi-threaded background downloader built into `src-tauri/src/acquisition/`, utilizing clean-room protocol implementations:
  - **Metadata & ISRC Resolution**: Spotify Web/Embed metadata + Soundplate / Soundcharts / MusicBrainz ISRC lookup.
  - **Cross-Service Resolution**: Odesli (Songlink) and direct ISRC queries to resolve matching lossless tracks across streaming services.
  - **Lossless Stream Providers**: Hi-Res/Lossless FLAC retrieval via Qobuz (up to 24-bit/192kHz), Deezer (16-bit FLAC with ARL + Blowfish-CBC stream decryptor), and Tidal fallback.
- **Enrichment, Tagging & Lyrics**: Automatic tag writing with `lofty` (Vorbis comments, ISRC, disc/track numbers), high-resolution cover art embedding, and synchronized `.lrc` lyrics via LRCLIB.
- **Atomic Ingestion & Live UI Transition**: Finished downloads are verified, moved atomically into the active library folder, and indexed in SQLite. Real-time Tauri events instantly transition track rows from dimmed to lit up and immediately playable without a page refresh.
- **Global Queue & Settings**: Dedicated download queue panel, speed/concurrency throttling, custom file naming templates (`{Artist}/{Album}/{TrackNumber} - {Title}.flac`), and quality preferences.

---

## Implementation Stages

### Stage 1: Remote Tracklist Ingestion & Unified Schema
**Focus: Database migrations, remote track storage, and unified DTOs**

- Add migration `0011_remote_tracklists.sql`:
  - Create table `remote_tracks` linked to `remote_releases` with columns `id`, `release_id`, `track_number`, `disc_number`, `title`, `duration_ms`, `isrc`, `musicbrainz_recording_id`, `spotify_track_id`, and `last_updated_at`.
- Implement MusicBrainz release tracklist fetching in `src-tauri/src/enrichment.rs` with caching in SQLite.
- Extend `src-tauri/src/catalog.rs` and `persistence.rs` to expose a unified `UnifiedAlbumDetail`:
  ```rust
  pub struct UnifiedAlbumDetail {
      pub album: AlbumSummary,
      pub tracks: Vec<UnifiedTrackSummary>,
  }

  pub struct UnifiedTrackSummary {
      pub id: Option<String>,              // Local track ID (if in library)
      pub remote_id: String,               // MBID / Spotify ID / Remote ID
      pub track_number: u32,
      pub disc_number: u32,
      pub title: String,
      pub duration_ms: Option<u64>,
      pub is_local: bool,                  // true = in library, false = not local
      pub audio_specs: Option<AudioSpecs>, // Format, sample rate, bit depth (if local)
      pub isrc: Option<String>,
      pub acquisition_status: Option<AcquisitionStatus>, // idle, queued, downloading, completed, failed
  }
  ```
- Map local files to remote tracks using MusicBrainz Recording ID, ISRC, or normalized `(disc_number, track_number, title)` pairs.

---

### Stage 2: Unified Album Page & Tracklist UX
**Focus: Frontend navigation, dimmed/lit-up rendering, and download actions**

- **Remote Navigation**:
  - Update `ArtistDetailPage.tsx` and `ArtistsGridView.tsx` so clicking any album card (local, partial, or remote discography) routes to `AlbumDetailPage.tsx` using either the local album ID or the remote release ID.
- **Tracklist Visual Hierarchy (`UniversalTracklist.tsx` & `AlbumDetailPage.tsx`)**:
  - **Local Tracks**: Full contrast text, playable row hover (`Play`, `Queue`, `Favorite`), and technical spec badges (e.g. `24-bit / 96kHz FLAC`).
  - **Missing / Non-Local Tracks**: Styled with dimmed opacity (`opacity-50 hover:opacity-80 transition-opacity`), subdued text color, and "Not in Library" indicator.
  - Hovering a missing track displays a subtle **"Get Track"** action button (`<DownloadCloud className="w-4 h-4" />`).
- **Header Actions**:
  - If all tracks are missing: Render primary **"Get Full Album"** button.
  - If partially available: Render **"Play Available"** + secondary **"Acquire Missing (N Tracks)"** button.
  - If 100% available: Standard **"Play Album"** + **"Shuffle"**.
- **Real-Time Reactive Updates**:
  - Subscribe to Tauri event `acquisition://progress` to show inline progress bars on active rows.
  - Subscribe to `acquisition://completed` to trigger a smooth animated transition where the track row lights up and immediately gains full playback controls.

---

### Stage 3: Metadata & Cross-Service Resolver (Rust)
**Focus: Entity resolution, ISRC discovery, and multi-service link mapping**

- Create module `src-tauri/src/acquisition/`:
  - `resolver.rs`: Central metadata and stream link resolver.
- **Spotify Metadata Ingestion**:
  - Fetch rich metadata (Title, Artist, Album, Release Date, Track/Disc Count, Artwork URL, ISRC) via Spotify Web/Embed APIs without requiring user premium login.
  - Parse Spotify URLs: `open.spotify.com/track/{id}`, `open.spotify.com/album/{id}`, `open.spotify.com/playlist/{id}`.
- **ISRC Resolution & Fallbacks**:
  - Primary: Extract embedded ISRC from Spotify/MusicBrainz response.
  - Fallbacks: Soundplate ISRC resolver, Soundcharts API, and Songstats search.
- **Cross-Service Mapping**:
  - Query Odesli (Songlink) API (`https://api.song.link/v1-alpha.1/links?url=...`) with Spotify/ISRC identifiers to retrieve provider track IDs for Qobuz, Tidal, Deezer, and Amazon Music.
  - Query direct provider search endpoints using ISRC:
    - Deezer: `https://api.deezer.com/track/isrc:{isrc}`
    - Qobuz: `https://www.qobuz.com/api.json/0.2/track/search?query={isrc}`

---

### Stage 4: Lossless Stream Providers (Rust)
**Focus: Audio stream downloading and on-the-fly decryption**

- Implement provider trait `src-tauri/src/acquisition/providers/mod.rs`:
  ```rust
  #[async_trait]
  pub trait AcquisitionProvider: Send + Sync {
      fn name(&self) -> &'static str;
      async fn resolve_stream(&self, target: &ResolvedTrackTarget) -> Result<StreamUrlInfo, AppError>;
  }
  ```
- **Qobuz Provider (`providers/qobuz.rs`)**:
  - Supports Hi-Res FLAC (24-bit/192kHz, 24-bit/96kHz) and 16-bit/44.1kHz FLAC.
  - Requests stream URLs via `https://www.qobuz.com/api.json/0.2/track/getFileUrl`.
  - Supports rotating app tokens / client secrets as well as user credentials.
- **Deezer Provider (`providers/deezer.rs`)**:
  - Supports 16-bit/44.1kHz FLAC streams.
  - Authenticates via user ARL cookie.
  - Implements on-the-fly Blowfish-CBC (`BF-CBC`) chunk decryption for encrypted FLAC media streams.
- **Tidal Provider (`providers/tidal.rs`)**:
  - Supports Lossless / Hi-Res FLAC via Tidal playback manifest requests (`/playbackinfopostpaywall`).
- **Quality Fallback Strategy**:
  - Default Priority: `Qobuz Hi-Res (24-bit)` → `Tidal Hi-Res` → `Qobuz Standard (16-bit)` → `Deezer FLAC (16-bit)`.

---

### Stage 5: Audio Post-Processing, Tagging & Lyrics
**Focus: Metadata embedding, cover art, ReplayGain, and library placement**

- Create `src-tauri/src/acquisition/tagger.rs`:
  - Tag writer using `lofty` for FLAC Vorbis comments:
    - `TITLE`, `ARTIST`, `ALBUM`, `ALBUMARTIST`, `TRACKNUMBER`, `TRACKTOTAL`, `DISCNUMBER`, `DISCTOTAL`, `DATE` / `YEAR`, `ISRC`, `GENRE`, `BARCODE`, `MUSICBRAINZ_*_ID`.
- **Artwork Ingestion**:
  - Download high-resolution front cover from Spotify CDN (`https://i.scdn.co/image/...`) or Cover Art Archive.
  - Embed cover directly into the FLAC container (`PictureType::CoverFront`) with proper MIME type.
- **Synchronized Lyrics**:
  - Fetch synced `.lrc` timestamps via LRCLIB (`https://lrclib.net/api/get`) using Bebop's existing `src-tauri/src/lyrics.rs`.
  - Save as sidecar `.lrc` file and embed `UNSYNCEDLYRICS` / `LYRICS` tags.
- **Audio Verification & ReplayGain**:
  - Verify audio stream integrity using Symphonia probe.
  - Compute ReplayGain (EBU R128 track/album gain and peak) and write standard tags.
- **Atomic File Placement**:
  - Format target filename according to template: `{LibraryRoot}/{Artist}/{Album}/{TrackNumber} - {Title}.flac`.
  - Write initially to a temporary file (`.tmp`), verify stream/tag integrity, and atomically rename to the destination path.

---

### Stage 6: Download Queue Manager & IPC Events
**Focus: Background worker, queue scheduling, and real-time state synchronization**

- Implement `src-tauri/src/acquisition/queue.rs`:
  - Bounded concurrency queue (default: 2 simultaneous downloads to respect network/rate limits).
  - State tracking for each queue item: `Pending`, `Resolving`, `Downloading { percent, speed_bps }`, `Tagging`, `Completed`, `Failed { error }`, `Cancelled`.
  - Supports queue actions: `cancel_job`, `pause_queue`, `resume_queue`, `retry_job`, `clear_completed`.
- **Tauri IPC Commands**:
  - `acquire_track(request: AcquisitionTrackRequest)`
  - `acquire_album(request: AcquisitionAlbumRequest)`
  - `get_acquisition_queue() -> Vec<AcquisitionJobDto>`
  - `cancel_acquisition(job_id: String)`
  - `retry_acquisition(job_id: String)`
- **Event Broadcasting**:
  - Emit `acquisition://job-added`
  - Emit `acquisition://progress` with payload `{ job_id, track_id, percent, speed_bytes_per_sec, stage }`
  - Emit `acquisition://completed` with payload `{ job_id, track_id, local_track_id, file_path }`
  - Emit `acquisition://failed` with payload `{ job_id, track_id, error }`
- **Automatic Catalog Ingestion**:
  - Upon job completion, trigger instant incremental catalog indexation in `persistence.rs`.
  - Notify active frontend views to switch track status to local immediately.

---

### Stage 7: UI Surfaces & Settings Integration
**Focus: Acquisition queue drawer, toast notifications, and configuration**

- **Global Acquisition Status**:
  - Floating status pill in the bottom corner or top nav rail showing active downloads (e.g. `Downloading 2 tracks • 4.2 MB/s`).
  - Expandable **Acquisition Drawer / Modal** listing all pending, active, and completed downloads with speed, progress bar, cancel, and open-folder buttons.
- **Settings View Updates (`SettingsView.tsx`)**:
  - **Acquisition Settings section**:
    - Preferred format / maximum quality: `Hi-Res 24-bit (192kHz)`, `Lossless 16-bit (44.1kHz)`.
    - Destination library root selection.
    - Path naming pattern selector (e.g. `{Artist}/{Album}/{TrackNumber} - {Title}`).
    - Provider credentials / account keys (Deezer ARL token, Qobuz tokens).
    - Concurrency limit slider (1–4 downloads).
- **Toast Notifications**:
  - Subtle toast when album acquisition begins and finishes (e.g. `"Album 'Discovery' acquired (14 tracks) and added to library"`).

---

## Interface and Data Changes

### New Data Structures
- `UnifiedAlbumDetail`, `UnifiedTrackSummary`, `AcquisitionStatus`.
- `AcquisitionJobDto`, `AcquisitionTrackRequest`, `AcquisitionAlbumRequest`.
- `AcquisitionConfig` (max quality, concurrency, file naming pattern).

### New Database Tables
- `remote_tracks` (`id`, `release_id`, `track_number`, `disc_number`, `title`, `duration_ms`, `isrc`, `mbid`, `spotify_id`).
- `acquisition_jobs` (`id`, `track_title`, `artist_name`, `album_title`, `status`, `target_path`, `error_message`, `created_at`, `completed_at`).

### Generated Bindings & Tauri Commands
- Commands: `acquire_track`, `acquire_album`, `get_acquisition_queue`, `cancel_acquisition`, `retry_acquisition`, `get_acquisition_settings`, `save_acquisition_settings`.
- Specta auto-generated TypeScript types synced in `apps/frontend/src/services/tauri-bindings.ts`.

---

## Verification and Acceptance Criteria

1. **Remote Navigation**:
   - Clicking a "Not Local" album from an Artist page opens `AlbumDetailPage` showing the full album artwork and remote tracklist.
2. **Visual Differentiation**:
   - Local tracks render in full contrast with playback controls.
   - Missing tracks render dimmed (`opacity-50`) with a "Get Track" button.
3. **Acquisition Execution**:
   - Clicking "Get Track" triggers a background download without blocking UI or audio playback.
   - Audio file is retrieved in FLAC format, tagged with Vorbis comments, embedded cover art, and LRCLIB lyrics.
   - Finished file is placed into the designated music library root.
4. **Seamless Transition**:
   - The UI automatically catches `acquisition://completed` and transitions the row from dimmed to lit up and playable.
5. **Quality & Fallback**:
   - Hi-Res is downloaded when available on Qobuz/Tidal; cleanly falls back to 16-bit FLAC.
6. **Tests & Build**:
   - `cargo test --all-features` passes with mocks for external network requests.
   - Frontend vitest suite passes.
   - `cargo clippy` and `npm run typecheck` succeed with zero errors.
