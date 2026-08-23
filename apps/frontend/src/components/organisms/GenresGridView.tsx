import React, { useState } from 'react';
import { Play, Radio, Music, Disc, Layers, Sparkles, Filter } from 'lucide-react';
import { TrackItem, AlbumItem, ArtistItem } from '@/types';
import { LOCAL_TRACKS, LOCAL_ALBUMS, LOCAL_ARTISTS } from '@/demo/catalog';
import { UniversalTracklist } from '@/components/molecules/UniversalTracklist';

export interface GenreCategory {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  albumCount: number;
  trackCount: number;
  sampleRate: string;
  dynamicRange: string;
  artists: string[];
  gradient: string;
}

export const LOCAL_GENRES: GenreCategory[] = [
  {
    id: 'gen-1',
    name: 'Big Band Jazz & Bebop',
    description:
      'High-energy brass sections, acoustic upright bass, and complex swing rhythms mastered in studio dynamic range.',
    coverUrl:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    albumCount: 3,
    trackCount: 38,
    sampleRate: '24/192 & DSD64',
    dynamicRange: 'DR15',
    artists: ['The Seatbelts', 'Yoko Kanno', 'Miles Davis'],
    gradient: 'from-amber-950/40 to-neutral-900/80',
  },
  {
    id: 'gen-2',
    name: 'Progressive & Art Rock',
    description:
      'Expansive multi-part suites, analog VCS3 synthesizers, and pristine quadraphonic spatial separation.',
    coverUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    albumCount: 4,
    trackCount: 42,
    sampleRate: '24-bit/192kHz',
    dynamicRange: 'DR15',
    artists: ['Pink Floyd', 'King Crimson', 'Genesis'],
    gradient: 'from-indigo-950/40 to-neutral-900/80',
  },
  {
    id: 'gen-3',
    name: 'Hard Rock & Blues',
    description:
      'Massive analog drum acoustics, roaring valve guitar amplifiers, and uncompressed transient dynamics.',
    coverUrl:
      'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80',
    albumCount: 3,
    trackCount: 29,
    sampleRate: '24-bit/96kHz',
    dynamicRange: 'DR14',
    artists: ['Led Zeppelin', 'Deep Purple', 'Cream'],
    gradient: 'from-orange-950/40 to-neutral-900/80',
  },
  {
    id: 'gen-4',
    name: 'Modal Jazz & Hard Bop',
    description:
      'Iconic 3-track analog session master recordings with warm valve preamplification and natural room reverb.',
    coverUrl:
      'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    albumCount: 2,
    trackCount: 18,
    sampleRate: 'DSD256 / 11.2MHz',
    dynamicRange: 'DR15',
    artists: ['Miles Davis', 'John Coltrane', 'Bill Evans'],
    gradient: 'from-blue-950/40 to-neutral-900/80',
  },
];

interface GenresGridViewProps {
  onPlayTrack?: (track: TrackItem) => void;
  onSelectArtist?: (artist: any) => void;
  onSelectAlbum?: (album: any) => void;
}

export const GenresGridView: React.FC<GenresGridViewProps> = ({
  onPlayTrack,
  onSelectArtist,
  onSelectAlbum,
}) => {
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);

  const activeGenre = LOCAL_GENRES.find((g) => g.id === selectedGenreId);

  const filteredTracks = selectedGenreId
    ? LOCAL_TRACKS.filter((t) => {
        if (selectedGenreId === 'gen-1')
          return t.artist.includes('Seatbelts') || t.artist.includes('Kanno');
        if (selectedGenreId === 'gen-2') return t.artist.includes('Pink Floyd');
        if (selectedGenreId === 'gen-3') return t.artist.includes('Led Zeppelin');
        if (selectedGenreId === 'gen-4') return t.artist.includes('Miles Davis');
        return true;
      })
    : [];

  const handlePlayGenre = (genre: GenreCategory) => {
    const tracks = LOCAL_TRACKS.filter((t) =>
      genre.artists.some((a) => t.artist.toLowerCase().includes(a.toLowerCase())),
    );
    if (tracks.length > 0 && onPlayTrack) {
      onPlayTrack(tracks[0]);
    }
  };

  return (
    <div id="genres-grid-container" className="w-full flex flex-col gap-6 font-sans">
      {/* Genre Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {LOCAL_GENRES.map((genre) => {
          const isSelected = selectedGenreId === genre.id;

          return (
            <div
              key={genre.id}
              id={`genre-card-${genre.id}`}
              onClick={() => setSelectedGenreId(isSelected ? null : genre.id)}
              className={`group relative rounded-xl overflow-hidden border p-5 flex flex-col justify-between transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-amber-500/80 bg-[#121824] shadow-xl shadow-amber-950/20'
                  : 'border-neutral-800/90 hover:border-neutral-700 bg-[#0c1017] hover:bg-[#10141e]'
              }`}
            >
              {/* Background ambient artwork fade */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 group-hover:opacity-30 transition-opacity">
                <img
                  src={genre.coverUrl}
                  alt={genre.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover filter grayscale contrast-125 scale-105 group-hover:scale-110 transition-transform duration-700"
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-b ${genre.gradient} to-[#0c1017]`}
                />
              </div>

              {/* Card Header: Icon + DR badge */}
              <div className="relative z-10 flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-neutral-900/90 border border-neutral-700/60 flex items-center justify-center text-amber-400">
                  <Radio className="w-5 h-5" />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded">
                    {genre.dynamicRange}
                  </span>
                </div>
              </div>

              {/* Card Body: Title, Description, Artists */}
              <div className="relative z-10 flex flex-col gap-2">
                <h3 className="text-base font-bold text-white tracking-tight group-hover:text-amber-400 transition-colors">
                  {genre.name}
                </h3>
                <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                  {genre.description}
                </p>

                {/* Artists tags */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {genre.artists.map((art) => (
                    <button
                      key={art}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectArtist?.(art);
                      }}
                      className="text-[10px] font-mono text-neutral-300 hover:text-amber-300 hover:border-amber-500/50 bg-neutral-900/80 px-2 py-0.5 rounded border border-neutral-800 transition-colors cursor-pointer"
                      title={`View artist: ${art}`}
                    >
                      {art}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card Footer: Metrics & Instant Play */}
              <div className="relative z-10 mt-5 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400">
                  <span>{genre.albumCount} albums</span>
                  <span>•</span>
                  <span>{genre.trackCount} tracks</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayGenre(genre);
                  }}
                  className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-transform hover:scale-105 shadow-md cursor-pointer"
                  aria-label={`Play ${genre.name}`}
                >
                  <Play className="w-4 h-4 fill-black ml-0.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Genre Detail Filter View */}
      {activeGenre && (
        <div
          id="genre-filtered-view"
          className="mt-2 bg-[#0a0d14] border border-neutral-800 rounded-xl p-5 flex flex-col gap-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                {activeGenre.name} Tracks in Local Archive
              </h3>
              <span className="text-xs font-mono text-neutral-500">
                ({filteredTracks.length} verified tracks)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedGenreId(null)}
              className="text-xs font-mono text-neutral-400 hover:text-white px-2 py-1 rounded bg-neutral-900 border border-neutral-800 transition-colors cursor-pointer"
            >
              [Clear Filter]
            </button>
          </div>

          {/* Filtered Tracklist Table using UniversalTracklist with real-time draggable columns */}
          <UniversalTracklist
            idPrefix={`genre-${activeGenre.id}`}
            tracks={filteredTracks}
            isPlaying={true}
            onPlayTrack={onPlayTrack}
            onSelectArtist={onSelectArtist}
            onSelectAlbum={onSelectAlbum}
            storageKey={`genre_${activeGenre.id}_columns`}
            defaultVisibleColumns={[
              'trackNumber',
              'title',
              'artist',
              'album',
              'dynamicRange',
              'sampleRate',
              'duration',
              'actions',
            ]}
            showCustomizerButton={true}
          />
        </div>
      )}
    </div>
  );
};
