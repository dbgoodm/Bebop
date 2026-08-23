import React from 'react';
import { Play, Disc3, Sparkles } from 'lucide-react';
import { AlbumItem, TrackItem, ArtistItem } from '@/types';
import { LOCAL_ALBUMS } from '@/demo/catalog';

interface AlbumsGridViewProps {
  albums?: AlbumItem[];
  onPlayAlbum?: (album: AlbumItem) => void;
  onSelectAlbum?: (album: AlbumItem) => void;
  onSelectArtist?: (artist: string | ArtistItem) => void;
}

export const AlbumsGridView: React.FC<AlbumsGridViewProps> = ({
  albums = LOCAL_ALBUMS,
  onPlayAlbum,
  onSelectAlbum,
  onSelectArtist,
}) => {
  return (
    <div id="albums-grid-container" className="w-full flex flex-col gap-4 font-sans">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 lg:gap-5">
        {albums.map((album) => (
          <div
            key={album.id}
            id={`album-card-${album.id}`}
            onClick={() => onSelectAlbum?.(album)}
            className="group bg-[#0c1017] border border-neutral-800 hover:border-amber-600/50 rounded-lg p-3 flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer relative"
          >
            {/* Album Cover with format badge & hover play button */}
            <div className="relative aspect-square w-full rounded-md overflow-hidden mb-3 bg-neutral-900 shadow-md">
              {album.coverUrl ? (
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-500">
                  <Disc3 className="w-12 h-12" />
                </div>
              )}

              {/* Format Badge */}
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[10px] font-mono text-amber-400 border border-amber-500/30">
                {album.format}
              </div>

              {/* Play Button Overlay */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayAlbum?.(album);
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                aria-label={`Play ${album.title}`}
              >
                <div className="w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <Play className="w-5 h-5 fill-black ml-0.5" />
                </div>
              </button>
            </div>

            {/* Album Info */}
            <div className="flex flex-col flex-1 justify-between">
              <div>
                <h3
                  className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover:text-amber-400 transition-colors"
                  title={album.title}
                >
                  {album.title}
                </h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectArtist?.(album.artist);
                  }}
                  className="text-xs text-neutral-400 hover:text-amber-400 hover:underline line-clamp-1 mt-0.5 text-left cursor-pointer transition-colors"
                  title={`View artist: ${album.artist}`}
                >
                  {album.artist}
                </button>
              </div>

              {/* Year & DR & Tracks count */}
              <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                <span>{album.year}</span>
                <span className="text-amber-400/90 font-bold">{album.dynamicRange}</span>
                <span>{album.trackCount} tracks</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
