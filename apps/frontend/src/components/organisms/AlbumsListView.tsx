import React, { useState } from 'react';
import { Play, Disc3, Clock, ChevronDown, ChevronUp, Music } from 'lucide-react';
import { AlbumItem, TrackItem } from '@/types';
import { LOCAL_ALBUMS } from '@/demo/catalog';

interface AlbumsListViewProps {
  albums?: AlbumItem[];
  onPlayAlbum?: (album: AlbumItem) => void;
  onPlayTrack?: (track: TrackItem) => void;
}

export const AlbumsListView: React.FC<AlbumsListViewProps> = ({
  albums = LOCAL_ALBUMS,
  onPlayAlbum,
  onPlayTrack,
}) => {
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedAlbumId((prev) => (prev === id ? null : id));
  };

  return (
    <div id="albums-list-container" className="w-full flex flex-col gap-3 font-sans">
      {albums.map((album) => {
        const isExpanded = expandedAlbumId === album.id;

        return (
          <div
            key={album.id}
            id={`album-item-${album.id}`}
            className="bg-[#0c1017] border border-neutral-800 hover:border-neutral-700 t-card t-stroke overflow-hidden transition-all duration-200"
          >
            {/* Header row */}
            <div
              onClick={() => toggleExpand(album.id)}
              className="p-3 sm:p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#101622] transition-colors"
            >
              {/* Left: Artwork + Title + Artist */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 t-sm overflow-hidden bg-neutral-900 shrink-0 shadow-sm">
                  {album.coverUrl ? (
                    <img
                      src={album.coverUrl}
                      alt={album.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <Disc3 className="w-8 h-8" />
                    </div>
                  )}

                  {/* Quick Play Album Overlay */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayAlbum?.(album);
                    }}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label={`Play ${album.title}`}
                  >
                    <div className="w-8 h-8 t-btn bg-amber-500 text-black flex items-center justify-center shadow-md">
                      <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
                    </div>
                  </button>
                </div>

                <div className="truncate">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate hover:text-amber-400">
                    {album.title}
                  </h3>
                  <p className="text-xs text-neutral-400 font-medium truncate">
                    {album.artist} • <span className="text-neutral-500">{album.year}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-1.5 py-0.2 t-sm text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-600/40">
                      {album.format}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {album.trackCount} tracks • {album.totalDuration}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: DR, Catalog Number & Expand toggle */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="hidden md:flex flex-col items-end text-xs">
                  <span className="text-amber-400 font-mono font-bold text-[11px]">
                    {album.dynamicRange}
                  </span>
                  <span className="text-neutral-500 font-mono text-[10px]">
                    Cat: {album.catalogNumber}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(album.id);
                  }}
                  className="w-8 h-8 t-control border border-neutral-800 bg-[#080b10] text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Expand Album Tracks"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Expanded Tracklist */}
            {isExpanded && (
              <div className="border-t border-neutral-800 bg-[#07090e] p-3 sm:p-4 animate-fadeIn">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 font-mono">
                  Album Tracklist ({album.tracks.length} tracks)
                </div>
                <div className="divide-y divide-neutral-900/60">
                  {album.tracks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onPlayTrack?.(t)}
                      className="py-2 px-2 flex items-center justify-between text-xs text-neutral-300 hover:bg-[#111722] hover:text-white t-sm transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <span className="w-5 text-neutral-500 font-mono text-center">
                          {t.trackNumber}
                        </span>
                        <span className="font-medium truncate group-hover:text-amber-400">
                          {t.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px] text-neutral-500 shrink-0">
                        <span>{t.sampleRate}</span>
                        <span className="text-neutral-400">{t.duration}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayTrack?.(t);
                          }}
                          className="w-6 h-6 t-btn bg-neutral-800 text-neutral-300 group-hover:bg-amber-500 group-hover:text-black flex items-center justify-center transition-colors"
                          aria-label={`Play ${t.title}`}
                        >
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
