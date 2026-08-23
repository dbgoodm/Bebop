import { useState } from 'react';
import { Play, Radio } from 'lucide-react';
import type { GenreItem, TrackItem } from '@/types';

export interface GenreCategory extends GenreItem {
  description?: string;
  coverUrl?: string;
  sampleRate?: string;
  dynamicRange?: string;
  gradient?: string;
}

export const LOCAL_GENRES: GenreCategory[] = [
  {
    id: 'gen-1',
    name: 'Big Band Jazz & Bebop',
    description: 'High-energy brass, acoustic bass, and complex swing rhythms.',
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600',
    albumCount: 3,
    trackCount: 38,
    sampleRate: '24/192 & DSD64',
    dynamicRange: 'DR15',
    artists: ['The Seatbelts', 'Yoko Kanno', 'Miles Davis'],
    gradient: 'from-amber-950/40',
  },
  {
    id: 'gen-2',
    name: 'Progressive & Art Rock',
    description: 'Expansive suites, analog synthesizers, and spacious mastering.',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600',
    albumCount: 4,
    trackCount: 42,
    sampleRate: '24-bit/192kHz',
    dynamicRange: 'DR15',
    artists: ['Pink Floyd', 'King Crimson', 'Genesis'],
    gradient: 'from-indigo-950/40',
  },
  {
    id: 'gen-3',
    name: 'Hard Rock & Blues',
    description: 'Analog drums, valve guitar amplifiers, and uncompressed transients.',
    coverUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600',
    albumCount: 3,
    trackCount: 29,
    sampleRate: '24-bit/96kHz',
    dynamicRange: 'DR14',
    artists: ['Led Zeppelin', 'Deep Purple', 'Cream'],
    gradient: 'from-orange-950/40',
  },
  {
    id: 'gen-4',
    name: 'Modal Jazz & Hard Bop',
    description: 'Warm valve preamplification, natural room reverb, and acoustic ensembles.',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600',
    albumCount: 2,
    trackCount: 18,
    sampleRate: 'DSD256 / 11.2MHz',
    dynamicRange: 'DR15',
    artists: ['Miles Davis', 'John Coltrane', 'Bill Evans'],
    gradient: 'from-blue-950/40',
  },
];

interface GenresGridViewProps {
  genres?: GenreCategory[];
  tracks?: TrackItem[];
  onPlayTrack?: (track: TrackItem) => void;
  onSelectArtist?: (artist: string) => void;
}

export function GenresGridView({
  genres = LOCAL_GENRES,
  tracks = [],
  onPlayTrack,
  onSelectArtist,
}: GenresGridViewProps) {
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);
  const activeGenre = genres.find((genre) => genre.id === selectedGenreId);
  const matchesGenre = (track: TrackItem, genre: GenreCategory) =>
    track.genres?.includes(genre.name) ||
    genre.artists.some((artist) => track.artist.toLowerCase().includes(artist.toLowerCase()));
  const filteredTracks = activeGenre
    ? tracks.filter((track) => matchesGenre(track, activeGenre))
    : [];

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {genres.map((genre) => {
          const selected = selectedGenreId === genre.id;
          const firstTrack = tracks.find((track) => matchesGenre(track, genre));
          return (
            <article
              key={genre.id}
              className={`rounded-xl border p-5 transition ${
                selected
                  ? 'border-amber-500/80 bg-neutral-900'
                  : 'border-neutral-800 bg-neutral-950/60'
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setSelectedGenreId(selected ? null : genre.id)}
              >
                <Radio className="mb-4 h-5 w-5 text-amber-400" />
                <h3 className="font-bold text-white">{genre.name}</h3>
                <p className="mt-2 text-xs text-neutral-400">
                  {genre.albumCount} albums · {genre.trackCount} tracks
                </p>
              </button>
              <div className="mt-3 flex flex-wrap gap-1">
                {genre.artists.slice(0, 4).map((artist) => (
                  <button
                    type="button"
                    key={artist}
                    onClick={() => onSelectArtist?.(artist)}
                    className="rounded border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300"
                  >
                    {artist}
                  </button>
                ))}
              </div>
              {firstTrack && (
                <button
                  type="button"
                  onClick={() => onPlayTrack?.(firstTrack)}
                  className="mt-4 flex items-center gap-2 text-xs font-semibold text-amber-300"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Play genre
                </button>
              )}
            </article>
          );
        })}
      </div>
      {activeGenre && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
          <h3 className="font-semibold text-white">{activeGenre.name}</h3>
          <div className="mt-3 grid gap-2">
            {filteredTracks.map((track) => (
              <button
                type="button"
                key={track.id}
                onClick={() => onPlayTrack?.(track)}
                className="text-left text-sm text-neutral-300 hover:text-amber-300"
              >
                {track.title} · {track.artist}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
