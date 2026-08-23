import React from 'react';
import { Compass, Sparkles, Flame, Radio, Disc3, Play, Award, Layers, Zap } from 'lucide-react';
import { useTheme } from '@/services/themeService';
import { LOCAL_ALBUMS, LOCAL_ARTISTS, LOCAL_TRACKS } from '@/demo/catalog';
import { AlbumItem, TrackItem, ArtistItem } from '@/types';

interface DiscoverViewProps {
  onPlayTrack: (track: TrackItem) => void;
  onPlayAlbum: (album: AlbumItem) => void;
  onSelectArtist: (artistName: string) => void;
  onSelectAlbum: (albumTitle: string) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  onPlayTrack,
  onPlayAlbum,
  onSelectArtist,
  onSelectAlbum,
}) => {
  const { currentTheme } = useTheme();

  const featuredCurations = [
    {
      title: 'Studio Master DR15+ Showcase',
      description: 'Master recordings with exceptional dynamic range and spatial separation',
      tag: 'HI-RES MASTER',
      album: LOCAL_ALBUMS[0], // Cowboy Bebop OST
    },
    {
      title: 'Analog Warmth & Tokyo Nights',
      description: 'Late 1970s and 1980s city pop remastered in 24-bit / 96kHz uncompressed PCM',
      tag: 'ANALOG REMASTER',
      album: LOCAL_ALBUMS[2] || LOCAL_ALBUMS[0],
    },
    {
      title: 'Monstercat Electronic Legends',
      description: 'Pioneering basslines and synthwave anthems with full dynamic headroom',
      tag: 'ELECTRONIC LOSSLESS',
      album: LOCAL_ALBUMS[3] || LOCAL_ALBUMS[1],
    },
  ];

  return (
    <div
      id="discover-view-container"
      className="w-full flex flex-col gap-8 pb-12 font-sans animate-fadeIn"
    >
      {/* Hero Header */}
      <div
        style={{
          backgroundColor: currentTheme.bgCard,
          borderColor: currentTheme.borderColor,
          background: currentTheme.cardGradient || currentTheme.bgCard,
        }}
        className="p-6 sm:p-8 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden shadow-xl"
      >
        <div className="flex flex-col gap-2 max-w-2xl relative z-10">
          <div className="flex items-center gap-2">
            <span
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                color: currentTheme.primary,
                borderColor: `${currentTheme.primary}50`,
              }}
              className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border"
            >
              DISCOVER LOSSLESS
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              100% Bit-Perfect Local Masterings
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Curated High-Res Audiophile Gems
          </h1>

          <p className="text-sm text-neutral-300 leading-relaxed">
            Explore studio master releases, wide dynamic range jazz recordings, and pristine synth
            masterpieces across your library.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <button
            type="button"
            onClick={() => onPlayAlbum(LOCAL_ALBUMS[0])}
            style={{
              backgroundColor: currentTheme.primary,
              boxShadow: `0 0 16px ${currentTheme.accentGlow}`,
            }}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-black flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all hover:scale-105"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>Play Featured Master</span>
          </button>
        </div>

        {/* Ambient Glow Orb */}
        <div
          className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30"
          style={{ backgroundColor: currentTheme.primary }}
        />
      </div>

      {/* Featured Curations 3-Column Bento */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: currentTheme.primary }} />
          <span>Curated Sonic Masterings</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {featuredCurations.map((curation, index) => (
            <div
              key={index}
              style={{
                backgroundColor: currentTheme.bgCard,
                borderColor: currentTheme.borderColor,
              }}
              className="p-5 rounded-xl border flex flex-col justify-between gap-4 group hover:-translate-y-1 transition-all duration-200 shadow-md cursor-pointer"
              onClick={() => onSelectAlbum(curation.album.title)}
            >
              <div className="flex flex-col gap-3">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800">
                  <img
                    src={curation.album.coverUrl}
                    alt={curation.album.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono font-bold text-white border border-white/20">
                    {curation.tag}
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayAlbum(curation.album);
                    }}
                    style={{ backgroundColor: currentTheme.primary }}
                    className="absolute bottom-2 right-2 w-9 h-9 rounded-full text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Play className="w-4 h-4 fill-black ml-0.5" />
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition-colors">
                    {curation.title}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    {curation.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-neutral-800 text-xs font-mono text-neutral-400">
                <span>{curation.album.title}</span>
                <span style={{ color: currentTheme.primary }}>
                  {curation.album.dynamicRange || 'DR15'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recommended Albums Grid */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Disc3 className="w-4 h-4" style={{ color: currentTheme.primary }} />
          <span>Recommended Lossless Albums</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {LOCAL_ALBUMS.map((album) => (
            <div
              key={album.id}
              onClick={() => onSelectAlbum(album.title)}
              style={{
                backgroundColor: currentTheme.bgCard,
                borderColor: currentTheme.borderColor,
              }}
              className="p-3 rounded-xl border flex flex-col gap-2.5 group hover:-translate-y-1 transition-all duration-200 cursor-pointer shadow-md"
            >
              <div className="relative aspect-square rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800">
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayAlbum(album);
                  }}
                  style={{ backgroundColor: currentTheme.primary }}
                  className="absolute bottom-2 right-2 w-8 h-8 rounded-full text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
                </div>
              </div>

              <div className="flex flex-col">
                <h4 className="font-bold text-xs text-white truncate group-hover:text-amber-400 transition-colors">
                  {album.title}
                </h4>
                <p className="text-[11px] text-neutral-400 truncate mt-0.5">{album.artist}</p>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 mt-1">
                  <span style={{ color: currentTheme.primary }}>{album.format}</span>
                  <span>•</span>
                  <span>{album.year}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
