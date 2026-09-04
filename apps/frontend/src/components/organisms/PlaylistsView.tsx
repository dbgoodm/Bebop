import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Dna,
  Heart,
  ListPlus,
  ListChecks,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { TrackItem } from '@/types';
import type { AvailableTag } from '@/services/tauri-bindings';
import { TracksTableView } from './TracksTableView';
import {
  analyzeAudioFeatures,
  createGeneratedPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  generatePlaylist,
  getPlaylist,
  listAvailableTags,
  listMatchingTracks,
  listPlaylists,
  listStarterPlaylists,
  onAudioAnalysisProgress,
  renamePlaylist,
  setPlaylistTracks,
  type GeneratedPlaylistPreview,
  type PlaylistDetail,
  type PlaylistGenerationRequest,
  type PlaylistMatch,
  type PlaylistSummary,
  type StarterPlaylistSummary,
} from '@/services/playlistService';

interface PlaylistsViewProps {
  tracks: TrackItem[];
  queue: TrackItem[];
  onPlayTrack: (track: TrackItem) => void;
  onReplaceQueue: (tracks: TrackItem[]) => void;
  onAppendQueue: (tracks: TrackItem[]) => void;
  initialSeedTrackId?: string | null;
  onClearInitialSeedTrackId?: () => void;
  favoriteTrackIds?: ReadonlySet<string>;
  onFavoriteChange?: (trackId: string, favorite: boolean) => void;
  /** Bumped by a parent to pop the Liked Songs card open (e.g. a "View all" link elsewhere). */
  openLikedSongsSignal?: number;
  onTrackContextMenu?: (track: TrackItem, event: React.MouseEvent) => void;
  onPlaylistContextMenu?: (playlist: PlaylistSummary, event: React.MouseEvent) => void;
}

const DEFAULT_REQUEST: PlaylistGenerationRequest = {
  seedTrackIds: [],
  targetDurationMs: null,
  targetTrackCount: 25,
  mood: null,
  minimumEnergy: null,
  maximumEnergy: null,
  minimumBpm: null,
  maximumBpm: null,
  maximumDynamicRangeDb: null,
  familiarity: 0.5,
  startYear: null,
  endYear: null,
  genres: [],
  excludedTags: [],
  excludedTrackIds: [],
  excludeExplicit: false,
  maxTracksPerArtist: 2,
  maxTracksPerAlbum: 2,
};

// 0 = fully steady (a low dynamic-range cap), 60 = fully dynamic (no cap at
// all) — matches the 0..60dB clamp `AudioFeatures.dynamicRangeDb` is bounded
// to on the backend.
const DYNAMIC_RANGE_MAX = 60;
const STEADY_DYNAMIC_RANGE_CAP = 10;

const MOOD_OPTIONS: { label: string; value: string }[] = [
  { label: 'Any', value: '' },
  { label: 'Calm', value: 'calm' },
  { label: 'Bright', value: 'bright' },
  { label: 'Dark', value: 'dark' },
  { label: 'Intense', value: 'intense' },
];

const LENGTH_OPTIONS = [30, 60, 90, 120];

// A starter "vibe" card below this many tracks is likely thin because Song
// DNA analysis hasn't run yet, rather than a genuinely small result.
const MIN_STARTER_TRACKS = 8;

function titleCase(value: string) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function durationLabel(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function CoverMosaic({
  tracks = [],
  coverUrls = [],
}: {
  tracks?: TrackItem[];
  coverUrls?: string[];
}) {
  const covers = [
    ...coverUrls,
    ...tracks.flatMap((track) => (track.coverUrl ? [track.coverUrl] : [])),
  ].slice(0, 4);
  return (
    <div className="grid aspect-square grid-cols-2 overflow-hidden t-sm border border-neutral-800 bg-neutral-900">
      {covers.length > 0 ? (
        Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-neutral-900">
            {covers[index] ? (
              <img src={covers[index]} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
        ))
      ) : (
        <div className="col-span-2 flex items-center justify-center text-neutral-700">
          <ListPlus className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

const PlaylistsViewImpl: React.FC<PlaylistsViewProps> = ({
  tracks,
  queue,
  onPlayTrack,
  onReplaceQueue,
  onAppendQueue,
  initialSeedTrackId,
  onClearInitialSeedTrackId,
  favoriteTrackIds,
  onFavoriteChange,
  openLikedSongsSignal,
  onTrackContextMenu,
  onPlaylistContextMenu,
}) => {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selected, setSelected] = useState<PlaylistDetail | null>(null);
  const [showLiked, setShowLiked] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<PlaylistGenerationRequest>(DEFAULT_REQUEST);
  const [genres, setGenres] = useState('');
  // Energy is expressed as a target plus a tolerance rather than a raw min/max
  // pair — two sliders that could cross each other were the confusing part.
  const [energyTarget, setEnergyTarget] = useState(0.6);
  const [spread, setSpread] = useState(0.4);
  const [preview, setPreview] = useState<GeneratedPlaylistPreview | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [minimumBpm, setMinimumBpm] = useState('');
  const [maximumBpm, setMaximumBpm] = useState('');
  const [dynamicRangeCap, setDynamicRangeCap] = useState(DYNAMIC_RANGE_MAX);
  const [starterPlaylists, setStarterPlaylists] = useState<StarterPlaylistSummary[]>([]);
  // "Browse matches": the full filtered+scored pool a person can hand-pick
  // from, as an alternative to accepting the auto-generated `preview` above.
  const [matches, setMatches] = useState<PlaylistMatch[] | null>(null);
  const [checkedMatchIds, setCheckedMatchIds] = useState<ReadonlySet<string>>(new Set());
  const generatorRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPlaylists(await listPlaylists());
    } catch {
      setPlaylists([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listAvailableTags()
      .then(setAvailableTags)
      .catch(() => setAvailableTags([]));
  }, []);

  useEffect(() => {
    listStarterPlaylists()
      .then(setStarterPlaylists)
      .catch(() => setStarterPlaylists([]));
  }, []);

  useEffect(() => {
    if (openLikedSongsSignal) setShowLiked(true);
  }, [openLikedSongsSignal]);

  useEffect(() => {
    if (initialSeedTrackId) {
      setSelected(null);
      setRequest((prev) => ({
        ...prev,
        seedTrackIds: [initialSeedTrackId],
      }));
      setTimeout(() => {
        generatorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }, 100);
      onClearInitialSeedTrackId?.();
    }
  }, [initialSeedTrackId, onClearInitialSeedTrackId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onAudioAnalysisProgress((progress) => {
      setAnalysisProgress(`${progress.completed}/${progress.total}`);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);

  const availableTracks = useMemo(() => {
    const included = new Set(selected?.tracks.map((track) => track.id) ?? []);
    return tracks.filter((track) => !included.has(track.id));
  }, [selected?.tracks, tracks]);

  const favoriteTracks = useMemo(
    () => tracks.filter((track) => favoriteTrackIds?.has(track.id)),
    [tracks, favoriteTrackIds],
  );

  const tagsByCategory = useMemo(() => {
    const grouped = new Map<string, AvailableTag[]>();
    for (const tag of availableTags) {
      const bucket = grouped.get(tag.category) ?? [];
      bucket.push(tag);
      grouped.set(tag.category, bucket);
    }
    return Array.from(grouped.entries());
  }, [availableTags]);

  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The playlist operation failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openPlaylist = useCallback(
    (playlistId: string) => run(async () => setSelected(await getPlaylist(playlistId))),
    [run],
  );

  // Each tag chip cycles neutral → included → excluded → neutral, so one
  // control does double duty as both a soft "more like this" filter and a
  // hard "none of this" exclusion (e.g. ruling out "lo-fi" entirely).
  const cycleTag = (name: string) => {
    if (selectedTags.includes(name)) {
      setSelectedTags((current) => current.filter((tag) => tag !== name));
      setExcludedTags((current) => [...current, name]);
    } else if (excludedTags.includes(name)) {
      setExcludedTags((current) => current.filter((tag) => tag !== name));
    } else {
      setSelectedTags((current) => [...current, name]);
    }
  };

  // Loads a starter "vibe" card's criteria into the Song DNA generator and runs
  // it there, so the user lands on the full, editable, scrollable preview
  // instead of committing straight to a save from a 4-track card summary.
  const loadStarterIntoGenerator = useCallback(
    (starter: StarterPlaylistSummary) => {
      const { minimumEnergy, maximumEnergy } = starter.request;
      if (minimumEnergy != null || maximumEnergy != null) {
        const lo = minimumEnergy ?? Math.max(0, (maximumEnergy ?? 0.6) - 0.4);
        const hi = maximumEnergy ?? Math.min(1, (minimumEnergy ?? 0.6) + 0.4);
        setEnergyTarget((lo + hi) / 2);
        setSpread(Math.max(0.1, hi - lo));
      }
      setRequest({ ...DEFAULT_REQUEST, ...starter.request });
      setGenres(starter.request.genres.join(', '));
      setSelectedTags(starter.request.tags ?? []);
      setName(starter.name);
      setSelected(null);
      setShowLiked(false);
      generatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      void run(async () => setPreview(await generatePlaylist(starter.request)));
    },
    [run],
  );

  const create = useCallback(
    (trackIds: string[]) =>
      run(async () => {
        if (!name.trim()) return;
        const playlist = await createPlaylist(name, trackIds);
        setName('');
        await refresh();
        await openPlaylist(playlist.id);
      }),
    [name, openPlaylist, refresh, run],
  );

  const saveTracks = useCallback(
    (next: TrackItem[]) =>
      run(async () => {
        if (!selected) return;
        await setPlaylistTracks(
          selected.id,
          next.map((track) => track.id),
        );
        setSelected({
          ...selected,
          tracks: next,
          totalDurationMs: next.reduce((total, track) => total + track.durationSeconds * 1_000, 0),
        });
        await refresh();
      }),
    [refresh, run, selected],
  );

  if (selected) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> All playlists
        </button>
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <CoverMosaic tracks={selected.tracks} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold text-white">{selected.name}</h2>
                  {selected.generated ? (
                    <span className="t-sm bg-violet-500/15 px-2 py-1 text-[10px] font-bold uppercase text-violet-300">
                      Song DNA snapshot
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {selected.tracks.length} tracks · {durationLabel(selected.totalDurationMs)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selected.tracks.length === 0}
                  onClick={() => {
                    onReplaceQueue(selected.tracks);
                    if (selected.tracks[0]) onPlayTrack(selected.tracks[0]);
                  }}
                  className="flex items-center gap-2 t-control bg-amber-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Play
                </button>
                <button
                  type="button"
                  onClick={() => onAppendQueue(selected.tracks)}
                  className="t-control border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
                >
                  Add to queue
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const copy = await duplicatePlaylist(selected.id, `${selected.name} copy`);
                      await refresh();
                      await openPlaylist(copy.id);
                    })
                  }
                  className="t-control border border-neutral-700 p-2 text-neutral-300"
                  aria-label="Duplicate playlist"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      if (!window.confirm(`Delete “${selected.name}”?`)) return;
                      await deletePlaylist(selected.id);
                      setSelected(null);
                      await refresh();
                    })
                  }
                  className="t-control border border-red-500/30 p-2 text-red-300"
                  aria-label="Delete playlist"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <form
              className="mt-4 flex max-w-md gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const nextName = new FormData(event.currentTarget).get('name')?.toString() ?? '';
                void run(async () => {
                  const renamed = await renamePlaylist(selected.id, nextName);
                  setSelected({ ...selected, name: renamed.name });
                  await refresh();
                });
              }}
            >
              <input
                name="name"
                defaultValue={selected.name}
                aria-label="Playlist name"
                className="min-w-0 flex-1 t-sm border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              />
              <button
                type="submit"
                className="t-control border border-neutral-700 px-3 text-xs text-neutral-200"
              >
                Rename
              </button>
            </form>
          </div>
        </div>

        <div className="t-sm border border-neutral-800">
          {selected.tracks.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500">This playlist is empty.</p>
          ) : (
            selected.tracks.map((track, index) => (
              <div
                key={`${track.id}-${index}`}
                onContextMenu={(e) => {
                  if (onTrackContextMenu) {
                    e.preventDefault();
                    onTrackContextMenu(track, e);
                  }
                }}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-neutral-800 px-3 py-2 [contain-intrinsic-size:48px] [content-visibility:auto] last:border-0"
              >
                <span className="font-mono text-xs text-neutral-600">{index + 1}</span>
                <button
                  type="button"
                  onClick={() => onPlayTrack(track)}
                  className="min-w-0 text-left"
                >
                  <span className="block truncate text-sm text-neutral-100">{track.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {track.artist} · {track.album}
                  </span>
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move ${track.title} up`}
                    onClick={() => {
                      const next = [...selected.tracks];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      void saveTracks(next);
                    }}
                    className="p-1 text-neutral-500 disabled:opacity-20"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === selected.tracks.length - 1}
                    aria-label={`Move ${track.title} down`}
                    onClick={() => {
                      const next = [...selected.tracks];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      void saveTracks(next);
                    }}
                    className="p-1 text-neutral-500 disabled:opacity-20"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${track.title}`}
                    onClick={() =>
                      void saveTracks(selected.tracks.filter((_, item) => item !== index))
                    }
                    className="p-1 text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        {availableTracks.length > 0 ? (
          <label className="flex max-w-lg items-center gap-2 text-xs text-neutral-400">
            Add track
            <select
              defaultValue=""
              onChange={(event) => {
                const track = tracks.find((item) => item.id === event.target.value);
                if (track) void saveTracks([...selected.tracks, track]);
                event.currentTarget.value = '';
              }}
              className="min-w-0 flex-1 t-sm border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-200"
            >
              <option value="" disabled>
                Choose a library track…
              </option>
              {availableTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.artist} — {track.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (showLiked) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setShowLiked(false)}
          className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> All playlists
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border border-red-500/20 bg-gradient-to-r from-red-950/30 to-neutral-950/40 t-card t-stroke">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 t-sm border border-red-500/40 bg-red-500/20 flex items-center justify-center text-red-400">
              <Heart className="w-5 h-5 fill-red-500 text-red-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Liked Songs</span>
                <span className="text-xs font-mono font-normal text-red-300 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30">
                  {favoriteTracks.length} tracks
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Your favorite collection for quick playback and top-tier listening.
              </p>
            </div>
          </div>

          {favoriteTracks.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onReplaceQueue(favoriteTracks);
                  onPlayTrack(favoriteTracks[0]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 t-control bg-red-500 hover:bg-red-400 text-black font-bold text-xs transition-all cursor-pointer shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Play Liked Songs</span>
              </button>
              <button
                type="button"
                onClick={() => onAppendQueue(favoriteTracks)}
                className="flex items-center gap-1.5 px-3 py-1.5 t-control border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs transition-all cursor-pointer"
              >
                <span>Add to Queue</span>
              </button>
            </div>
          )}
        </div>

        {favoriteTracks.length === 0 ? (
          <div className="t-sm border border-dashed border-neutral-800 bg-neutral-950/40 p-8 text-center">
            <Heart className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-neutral-300">No liked songs yet</h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
              Click the heart icon on any song row in your library or in the now playing bar to save
              your top tracks here.
            </p>
          </div>
        ) : (
          <TracksTableView
            tracks={favoriteTracks}
            onPlayTrack={onPlayTrack}
            favoriteTrackIds={favoriteTrackIds}
            onFavoriteChange={onFavoriteChange}
            onContextMenu={onTrackContextMenu}
          />
        )}
      </div>
    );
  }

  const seedTrack = tracks.find((track) => track.id === request.seedTrackIds?.[0]) ?? null;
  const spreadLabel = spread < 0.35 ? 'Close' : spread > 0.7 ? 'Wide' : 'Balanced';

  // Target energy plus tolerance becomes the min/max window the backend expects,
  // and a wider spread means the generator is allowed to stray further.
  const halfWindow = Math.max(0.05, spread * 0.5);
  const generationRequest: PlaylistGenerationRequest = {
    ...request,
    minimumEnergy: Math.max(0, energyTarget - halfWindow),
    maximumEnergy: Math.min(1, energyTarget + halfWindow),
    minimumBpm: minimumBpm.trim() ? Number(minimumBpm) : null,
    maximumBpm: maximumBpm.trim() ? Number(maximumBpm) : null,
    maximumDynamicRangeDb: dynamicRangeCap >= DYNAMIC_RANGE_MAX ? null : dynamicRangeCap,
    familiarity: 1 - spread,
    genres: genres
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean),
    tags: selectedTags,
    excludedTags,
  };

  return (
    <div className="space-y-6">
      <section className="t-sm border border-neutral-800 bg-neutral-950/50 p-4">
        <h2 className="text-sm font-semibold text-white">Create a playlist</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Playlist name"
            className="min-w-[14rem] flex-1 t-sm border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => void create([])}
            className="flex items-center gap-2 t-control border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Empty
          </button>
          <button
            type="button"
            disabled={!name.trim() || queue.length === 0 || busy}
            onClick={() => void create(queue.map((track) => track.id))}
            className="flex items-center gap-2 t-control border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> Save queue ({queue.length})
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Your playlists</h2>
            <p className="mt-1 text-xs text-neutral-500">Saved snapshots stay editable.</p>
          </div>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin text-amber-300" /> : null}
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
          {/* Pinned Liked Songs Card */}
          <button
            type="button"
            id="btn-open-liked-songs-card"
            onClick={() => setShowLiked(true)}
            className="t-control border border-red-500/30 bg-gradient-to-br from-red-950/40 via-neutral-950 to-neutral-950 p-2 text-left transition hover:border-red-500/70 hover:from-red-950/60 group cursor-pointer"
          >
            <div className="grid aspect-square w-full place-items-center t-sm border border-red-500/40 bg-gradient-to-br from-red-600/30 to-neutral-900 text-red-400 group-hover:scale-102 transition-transform">
              <Heart className="h-6 w-6 fill-red-500/60 text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
            </div>
            <span className="mt-2 flex items-center gap-1 truncate text-xs font-semibold text-white group-hover:text-red-300">
              <Heart className="h-3 w-3 fill-red-500 text-red-500 shrink-0" />
              <span className="truncate">Liked Songs</span>
            </span>
            <span className="text-[10px] text-neutral-500">
              {favoriteTrackIds?.size ?? 0} favorited track
              {(favoriteTrackIds?.size ?? 0) === 1 ? '' : 's'}
            </span>
          </button>

          {playlists.length === 0 ? (
            <p className="col-span-full t-sm border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
              No playlists yet. Save the queue or build one with Song DNA.
            </p>
          ) : null}

          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => void openPlaylist(playlist.id)}
              onContextMenu={(e) => {
                if (onPlaylistContextMenu) {
                  e.preventDefault();
                  onPlaylistContextMenu(playlist, e);
                }
              }}
              className="t-control border border-neutral-800 bg-neutral-950 p-2 text-left transition hover:border-amber-500/40"
            >
              <CoverMosaic coverUrls={playlist.coverUrls} />
              <span className="mt-2 block truncate text-xs font-semibold text-white">
                {playlist.name}
              </span>
              <span className="text-[10px] text-neutral-500">{playlist.trackCount} tracks</span>
            </button>
          ))}
        </div>
      </section>

      {starterPlaylists.length > 0 ? (
        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">Made for your library</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Deterministic vibes built from your own tracks — no AI involved.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {starterPlaylists.map((starter) => {
              const trackCount = starter.playlist.selections.length;
              const thin = trackCount < MIN_STARTER_TRACKS;
              return thin ? (
                <button
                  key={starter.key}
                  type="button"
                  onClick={() => loadStarterIntoGenerator(starter)}
                  className="t-control border border-emerald-500/20 bg-emerald-500/5 p-3 text-left transition hover:border-emerald-500/40 cursor-pointer"
                >
                  <span className="block truncate text-sm font-semibold text-white">
                    {starter.name}
                  </span>
                  <p className="mt-1 text-xs text-neutral-500">{starter.description}</p>
                  <p className="mt-3 text-[11px] font-semibold text-emerald-300">
                    Analyze your library to fill this in
                  </p>
                </button>
              ) : (
                <div
                  key={starter.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => loadStarterIntoGenerator(starter)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      loadStarterIntoGenerator(starter);
                    }
                  }}
                  title="Open the full list in Song DNA to preview or tweak before saving"
                  className="t-control border border-emerald-500/20 bg-emerald-500/5 p-3 text-left transition hover:border-emerald-500/40 cursor-pointer"
                >
                  <span className="block truncate text-sm font-semibold text-white">
                    {starter.name}
                  </span>
                  <p className="mt-1 text-xs text-neutral-500">{starter.description}</p>
                  <ul className="mt-2 space-y-0.5">
                    {starter.playlist.selections.slice(0, 4).map((selection) => (
                      <li
                        key={selection.track.id}
                        className="truncate text-[11px] text-neutral-400"
                      >
                        {selection.track.title}{' '}
                        <span className="text-neutral-600">· {selection.track.artist}</span>
                      </li>
                    ))}
                  </ul>
                  {trackCount > 4 ? (
                    <p className="mt-1 text-[10px] text-neutral-600">+{trackCount - 4} more</p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-500">{trackCount} tracks</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void run(async () => {
                          const saved = await createGeneratedPlaylist(
                            starter.name,
                            starter.request,
                          );
                          await refresh();
                          await openPlaylist(saved.id);
                        });
                      }}
                      className="t-control border border-emerald-400/50 px-2 py-1 text-[11px] font-semibold text-emerald-200 disabled:opacity-40 cursor-pointer"
                    >
                      Save as playlist
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section
        id="song-dna-generator"
        ref={generatorRef}
        className="t-sm border border-violet-500/20 bg-violet-500/5 p-4 scroll-mt-20"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-200">
              <Dna className="h-4 w-4" /> Song DNA
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Deterministic local ranking using audio character, tags, favorites, and listening
              history.
            </p>
          </div>
          <button
            type="button"
            disabled={tracks.length === 0 || busy}
            onClick={() =>
              void run(async () => {
                setAnalysisProgress(`0/${tracks.length}`);
                await analyzeAudioFeatures(
                  tracks.map((track) => track.id),
                  false,
                );
                setAnalysisProgress(null);
              })
            }
            className="t-control border border-violet-500/30 px-3 py-2 text-xs text-violet-200 disabled:opacity-40"
          >
            {analysisProgress ? `Analyzing ${analysisProgress}` : 'Analyze library'}
          </button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* Controls */}
          <div className="flex flex-col gap-3">
            {/* Seed */}
            <div className="t-card t-stroke border border-neutral-800 bg-neutral-950/60 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                Seed
              </p>
              <select
                aria-label="Seed track"
                value={request.seedTrackIds?.[0] ?? ''}
                onChange={(event) =>
                  setRequest({
                    ...request,
                    seedTrackIds: event.target.value ? [event.target.value] : [],
                  })
                }
                className="mt-2 w-full t-sm border border-neutral-700 bg-black/40 px-3 py-2 text-sm text-neutral-100"
              >
                <option value="">Start from my whole library</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.artist} — {track.title}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                {seedTrack
                  ? 'Matches are scored against this track\u2019s Song DNA.'
                  : 'Without a seed, the shape controls alone decide what is picked.'}
              </p>
            </div>

            {/* Shape */}
            <div className="t-card t-stroke border border-neutral-800 bg-neutral-950/60 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                Shape
              </p>

              <label className="mt-3 block text-xs text-neutral-300">
                <span className="flex items-baseline justify-between">
                  <span>Energy</span>
                  <span className="font-mono text-[11px] text-violet-300">
                    {energyTarget.toFixed(2)}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(energyTarget * 100)}
                  onChange={(event) => setEnergyTarget(Number(event.target.value) / 100)}
                  className="mt-1.5 w-full accent-violet-400"
                />
              </label>

              <label className="mt-3 block text-xs text-neutral-300">
                <span className="flex items-baseline justify-between">
                  <span>Adventurousness</span>
                  <span className="font-mono text-[11px] text-violet-300">{spreadLabel}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(spread * 100)}
                  onChange={(event) => setSpread(Number(event.target.value) / 100)}
                  className="mt-1.5 w-full accent-violet-400"
                />
                <span className="mt-1 block text-[10px] text-neutral-500">
                  How far a track may drift from the target energy
                </span>
              </label>

              <div className="mt-4">
                <p className="text-xs text-neutral-300">Mood</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {MOOD_OPTIONS.map((option) => {
                    const active = (request.mood ?? '') === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setRequest({
                            ...request,
                            mood: (option.value || null) as PlaylistGenerationRequest['mood'],
                          })
                        }
                        className={`t-control border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                          active
                            ? 'border-violet-400 bg-violet-400/15 text-violet-200'
                            : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block text-xs text-neutral-300">
                  Tempo (BPM)
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={300}
                      placeholder="Min"
                      value={minimumBpm}
                      onChange={(event) => setMinimumBpm(event.target.value)}
                      className="w-full min-w-0 t-sm border border-neutral-700 bg-black/40 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600"
                    />
                    <span className="text-neutral-600">–</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={300}
                      placeholder="Max"
                      value={maximumBpm}
                      onChange={(event) => setMaximumBpm(event.target.value)}
                      className="w-full min-w-0 t-sm border border-neutral-700 bg-black/40 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600"
                    />
                  </div>
                </label>

                <label className="block text-xs text-neutral-300">
                  <span className="flex items-baseline justify-between">
                    <span>Steady ↔ Dynamic</span>
                    <span className="font-mono text-[11px] text-violet-300">
                      {dynamicRangeCap >= DYNAMIC_RANGE_MAX ? 'Any' : `≤${dynamicRangeCap}dB`}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={DYNAMIC_RANGE_MAX}
                    value={dynamicRangeCap}
                    onChange={(event) => setDynamicRangeCap(Number(event.target.value))}
                    className="mt-2.5 w-full accent-violet-400"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-[10px] text-neutral-500">
                "Steady" caps how far a track's loudness swings — a rough stand-in for avoiding a
                big build or crescendo mid-track.
              </p>

              {tagsByCategory.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs text-neutral-300">Tags</p>
                  <p className="mt-1 text-[10px] text-neutral-500">
                    Click once to favor a tag, again to exclude it entirely, again to clear.
                  </p>
                  <div className="mt-1.5 space-y-2">
                    {tagsByCategory.map(([category, tags]) => (
                      <div key={category}>
                        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600">
                          {titleCase(category)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {tags.map((tag) => {
                            const included = selectedTags.includes(tag.name);
                            const excluded = excludedTags.includes(tag.name);
                            return (
                              <button
                                key={tag.name}
                                type="button"
                                aria-pressed={included || excluded}
                                title={
                                  excluded
                                    ? `Excluding "${tag.name}"`
                                    : included
                                      ? `Favoring "${tag.name}"`
                                      : `Favor or exclude "${tag.name}"`
                                }
                                onClick={() => cycleTag(tag.name)}
                                className={`t-control flex items-center gap-1 border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                                  excluded
                                    ? 'border-red-500/60 bg-red-500/15 text-red-300'
                                    : included
                                      ? 'border-violet-400 bg-violet-400/15 text-violet-200'
                                      : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
                                }`}
                              >
                                {excluded && <X className="h-2.5 w-2.5" />}
                                {included && <Check className="h-2.5 w-2.5" />}
                                {tag.name}{' '}
                                <span className="text-neutral-500">· {tag.trackCount}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-xs text-neutral-300">Tags</p>
                  <p className="mt-1.5 t-sm border border-dashed border-neutral-800 p-2.5 text-[11px] leading-relaxed text-neutral-500">
                    No descriptive tags yet. Analyze library above adds tempo/brightness tags from
                    every track's Song DNA; enabling MusicBrainz or Last.fm tag lookup in Settings →
                    Metadata &amp; Tags adds genre and mood tags too.
                  </p>
                </div>
              )}
            </div>

            {/* Limits */}
            <div className="t-card t-stroke border border-neutral-800 bg-neutral-950/60 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                Limits
              </p>

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-300">Length</span>
                <div className="flex flex-wrap gap-1.5">
                  {LENGTH_OPTIONS.map((minutes) => {
                    const active = request.targetDurationMs === minutes * 60_000;
                    return (
                      <button
                        key={minutes}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setRequest({
                            ...request,
                            targetDurationMs: active ? null : minutes * 60_000,
                            targetTrackCount: active ? 25 : null,
                          })
                        }
                        className={`t-control border px-2.5 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
                          active
                            ? 'border-violet-400 bg-violet-400/15 text-violet-200'
                            : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {minutes}m
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-300">Max per artist</p>
                  <p className="text-[10px] text-neutral-500">Keeps one act from dominating</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Fewer tracks per artist"
                    onClick={() =>
                      setRequest({
                        ...request,
                        maxTracksPerArtist: Math.max(1, (request.maxTracksPerArtist ?? 2) - 1),
                      })
                    }
                    className="h-6 w-6 t-control border border-neutral-700 text-neutral-300 cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-4 text-center font-mono text-xs text-neutral-200">
                    {request.maxTracksPerArtist ?? 2}
                  </span>
                  <button
                    type="button"
                    aria-label="More tracks per artist"
                    onClick={() =>
                      setRequest({
                        ...request,
                        maxTracksPerArtist: Math.min(9, (request.maxTracksPerArtist ?? 2) + 1),
                      })
                    }
                    className="h-6 w-6 t-control border border-neutral-700 text-neutral-300 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <label className="mt-3 block text-xs text-neutral-300">
                Genres
                <input
                  value={genres}
                  onChange={(event) => setGenres(event.target.value)}
                  placeholder="jazz, ambient"
                  className="mt-1.5 w-full t-sm border border-neutral-700 bg-black/40 px-3 py-2 text-neutral-100 placeholder:text-neutral-600"
                />
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="flex min-h-[420px] flex-col overflow-hidden t-card t-stroke border border-neutral-800 bg-neutral-950/60">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name this playlist"
                aria-label="Playlist name"
                className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-white outline-none placeholder:text-neutral-600"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={tracks.length === 0 || busy}
                  onClick={() =>
                    void run(async () => {
                      setMatches(null);
                      setPreview(await generatePlaylist(generationRequest));
                    })
                  }
                  className="t-control bg-violet-300 px-3 py-1.5 text-xs font-bold text-violet-950 disabled:opacity-40 cursor-pointer"
                >
                  {preview ? 'Regenerate' : 'Generate'}
                </button>
                <button
                  type="button"
                  disabled={tracks.length === 0 || busy}
                  title="See every track that matches your filters and hand-pick which to include"
                  onClick={() =>
                    void run(async () => {
                      const found = await listMatchingTracks(generationRequest);
                      setPreview(null);
                      setMatches(found);
                      setCheckedMatchIds(
                        new Set(
                          found
                            .slice(0, generationRequest.targetTrackCount ?? 25)
                            .map((match) => match.track.id),
                        ),
                      );
                    })
                  }
                  className="t-control flex items-center gap-1.5 border border-violet-400/50 px-3 py-1.5 text-xs font-bold text-violet-200 disabled:opacity-40 cursor-pointer"
                >
                  <ListChecks className="h-3.5 w-3.5" /> Browse matches
                </button>
                <button
                  type="button"
                  disabled={
                    busy || !name.trim() || (matches ? checkedMatchIds.size === 0 : !preview)
                  }
                  onClick={() =>
                    void run(async () => {
                      const saved = matches
                        ? await createPlaylist(name, Array.from(checkedMatchIds))
                        : await createGeneratedPlaylist(name, generationRequest);
                      setName('');
                      setPreview(null);
                      setMatches(null);
                      await refresh();
                      await openPlaylist(saved.id);
                    })
                  }
                  className="t-control border border-violet-400/50 px-3 py-1.5 text-xs font-bold text-violet-200 disabled:opacity-40 cursor-pointer"
                >
                  {matches ? `Save ${checkedMatchIds.size} selected` : 'Save'}
                </button>
              </div>
            </div>

            {matches ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/70 bg-black/20 px-4 py-2.5">
                  <div className="flex flex-wrap gap-5">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                        Matches
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-violet-300">{matches.length}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                        Selected
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-violet-300">
                        {checkedMatchIds.size}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() =>
                        setCheckedMatchIds(new Set(matches.map((match) => match.track.id)))
                      }
                      className="text-violet-300 hover:text-violet-200 cursor-pointer"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckedMatchIds(new Set())}
                      className="text-neutral-400 hover:text-neutral-200 cursor-pointer"
                    >
                      Select none
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {matches.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                      <p className="text-sm text-neutral-300">No tracks match these filters</p>
                      <p className="max-w-xs text-xs text-neutral-500">
                        Loosen a filter above — an exclusion, a tempo bound, or the energy range —
                        and try again.
                      </p>
                    </div>
                  ) : (
                    matches.map((match, index) => {
                      const checked = checkedMatchIds.has(match.track.id);
                      return (
                        <label
                          key={match.track.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-neutral-800/60 px-4 py-2 last:border-0 hover:bg-black/20"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCheckedMatchIds((current) => {
                                const next = new Set(current);
                                if (checked) next.delete(match.track.id);
                                else next.add(match.track.id);
                                return next;
                              })
                            }
                            className="shrink-0 accent-violet-400"
                          />
                          <span className="w-6 shrink-0 font-mono text-[11px] text-neutral-600">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-neutral-100">{match.track.title}</p>
                            <p className="truncate text-[11px] text-neutral-500">
                              {match.track.artist}
                            </p>
                          </div>
                          <span className="hidden max-w-[40%] shrink-0 truncate text-[11px] text-neutral-500 sm:block">
                            {match.explanation}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </>
            ) : preview ? (
              <>
                <div className="flex flex-wrap gap-5 border-b border-neutral-800/70 bg-black/20 px-4 py-2.5">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                      Tracks
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-violet-300">
                      {preview.selections.length}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                      Runtime
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-violet-300">
                      {durationLabel(preview.totalDurationMs)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                      With Song DNA
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-neutral-200">
                      {preview.analyzedTrackCount}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {preview.selections.map((selection, index) => (
                    <div
                      key={selection.track.id}
                      className="flex items-center gap-3 border-b border-neutral-800/60 px-4 py-2 last:border-0"
                    >
                      <span className="w-6 shrink-0 font-mono text-[11px] text-neutral-600">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-neutral-100">{selection.track.title}</p>
                        <p className="truncate text-[11px] text-neutral-500">
                          {selection.track.artist}
                        </p>
                      </div>
                      <span className="hidden max-w-[46%] shrink-0 truncate text-[11px] text-neutral-500 sm:block">
                        {selection.explanation}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <p className="text-sm text-neutral-300">Nothing generated yet</p>
                <p className="max-w-xs text-xs text-neutral-500">
                  Pick a seed and shape the result, then generate for a ready-made playlist, or
                  browse matches to hand-pick tracks yourself.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
};

// See TracksTableView: keeps this (potentially large) view from re-rendering on unrelated playback-state changes.
export const PlaylistsView = React.memo(PlaylistsViewImpl);
