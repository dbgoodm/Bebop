import React from 'react';
import { Play, Disc, Music, Clock, Sparkles } from 'lucide-react';
import { ArtistItem } from '@/types';

interface ArtistsGridViewProps {
  artists?: ArtistItem[];
  onSelectArtist?: (artist: ArtistItem) => void;
  onPlayArtist?: (artist: ArtistItem) => void;
}

export const ArtistsGridView: React.FC<ArtistsGridViewProps> = ({
  artists = [],
  onSelectArtist,
  onPlayArtist,
}) => {
  return (
    <div id="artists-grid-container" className="w-full flex flex-col gap-4 font-sans">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 lg:gap-5">
        {artists.map((artist) => (
          <div
            key={artist.id}
            id={`artist-card-${artist.id}`}
            onClick={() => onSelectArtist?.(artist)}
            className="group bg-[#0c1017] border border-neutral-800 hover:border-amber-600/50 rounded-lg p-4 flex flex-col items-center text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer relative"
          >
            {/* Circular Artist Avatar with hover play overlay */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden mb-3 border-2 border-neutral-700/60 shadow-md bg-neutral-900 group-hover:border-amber-500 transition-colors">
              {artist.avatarUrl ? (
                <img
                  src={artist.avatarUrl}
                  alt={artist.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-500">
                  <Music className="w-10 h-10" />
                </div>
              )}

              {/* Play Button Overlay */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayArtist?.(artist);
                }}
                className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                aria-label={`Play ${artist.name}`}
              >
                <div className="w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <Play className="w-5 h-5 fill-black ml-0.5" />
                </div>
              </button>
            </div>

            {/* Artist Info */}
            <h3 className="text-base font-bold text-white tracking-tight group-hover:text-amber-400 transition-colors">
              {artist.name}
            </h3>

            {/* Genres */}
            <div className="flex flex-wrap justify-center gap-1 my-2">
              {artist.genres.slice(0, 2).map((genre) => (
                <span
                  key={genre}
                  className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300 font-medium"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* Stats row */}
            <div className="w-full mt-2 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1 text-[11px]">
                <Disc className="w-3 h-3 text-neutral-500" />
                {artist.albumCount} albums
              </span>
              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                <Sparkles className="w-3 h-3 text-amber-500" />
                {artist.losslessPlaytime}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
