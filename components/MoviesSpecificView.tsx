import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArchiveVideo } from '../services/archiveContentService';
import { Album } from '../types';
import { Play, TrendingUp, Sparkles, Eye, Star, Zap } from 'lucide-react';
import ScrollableTabRow from './ScrollableTabRow';

interface MoviesSpecificViewProps {
  movies: ArchiveVideo[];
  localContent: Album[];
  onSelect: (item: any) => void;
}

const GENRE_CHIPS = ['All', 'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Documentary', 'Thriller', 'Animation', 'Classic'];

const MovieCard: React.FC<{ item: any; onSelect: (i: any) => void; width?: string }> = ({ item, onSelect, width = 'min-w-[140px] md:min-w-[160px]' }) => {
  const isArchive = 'identifier' in item;
  const cover = isArchive ? item.thumbnailUrl : item.coverImage;
  return (
    <motion.div
      whileHover={{ y: -6 }}
      onClick={() => onSelect(item)}
      className={`group relative cursor-pointer flex-shrink-0 ${width}`}
    >
      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 relative border border-white/5 group-hover:border-white/20 transition-all duration-300">
        <img src={cover || null} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={item.title} />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
            <Play className="text-white ml-0.5" size={20} fill="white" />
          </div>
        </div>
      </div>
      <h4 className="font-black text-[10px] uppercase tracking-tight truncate mt-2.5 text-white/80 group-hover:text-white transition-colors">{item.title}</h4>
      {item.year && <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mt-0.5">{item.year}</p>}
    </motion.div>
  );
};

const HorizontalRow: React.FC<{
  title: string; subtitle: string; Icon: React.FC<{ size?: number; className?: string }>; items: any[]; onSelect: (i: any) => void;
}> = ({ title, subtitle, Icon, items, onSelect }) => (
  <section>
    <div className="mb-5 flex items-end justify-between">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={13} className="text-small-orange" />
          <span className="text-[8px] font-black uppercase tracking-[0.35em] text-small-orange">{subtitle}</span>
        </div>
        <h3 className="font-bebas text-3xl md:text-4xl uppercase tracking-tighter">{title}</h3>
      </div>
      <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
    </div>
    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
      {items.slice(0, 16).map((item, i) => (
        <MovieCard key={item.identifier || item.id || i} item={item} onSelect={onSelect} />
      ))}
    </div>
  </section>
);

export const MoviesSpecificView: React.FC<MoviesSpecificViewProps> = ({ movies, localContent, onSelect }) => {
  const [selectedGenre, setSelectedGenre] = useState('All');

  const localMovies = localContent.filter(c => c.subType === 'MOVIE' || c.tags?.includes('movie'));
  const allMovies = [...localMovies, ...movies];

  const genreFiltered = useMemo(() => {
    if (selectedGenre === 'All') return allMovies;
    return allMovies.filter(m => {
      const g = ('genre' in m ? m.genre : '') || '';
      return g.toLowerCase().includes(selectedGenre.toLowerCase());
    });
  }, [selectedGenre, allMovies]);

  // Simulate sections from available data
  const newReleases = useMemo(() => [...allMovies].sort((a, b) => {
    const ya = parseInt(('year' in a ? a.year : '0') || '0');
    const yb = parseInt(('year' in b ? b.year : '0') || '0');
    return yb - ya;
  }).slice(0, 20), [allMovies]);

  const recommended = useMemo(() => [...allMovies].filter((_, i) => i % 3 === 1).slice(0, 20), [allMovies]);
  const whatPeopleAreWatching = useMemo(() => [...allMovies].reverse().slice(0, 20), [allMovies]);

  // Genre category sections (only if genre filter is All)
  const genreCategories = useMemo(() => {
    const genres = Array.from(new Set(movies.map(m => m.genre).filter(Boolean)));
    return genres.map(genre => ({
      genre,
      items: movies.filter(m => m.genre === genre).slice(0, 16)
    })).filter(g => g.items.length >= 2).slice(0, 6);
  }, [movies]);

  return (
    <main className="pt-8 pb-40 px-6 lg:px-12 max-w-screen-2xl mx-auto space-y-14">
      {/* Header */}
      <div>
        <span className="font-bebas text-[10px] uppercase tracking-[0.4em] text-tertiary mb-2 block">Cinematic Archives</span>
        <h2 className="font-bebas text-5xl md:text-7xl font-black leading-[0.85] uppercase tracking-tighter">
          Movies
        </h2>
      </div>

      {/* Genre Filter Chips */}
      <ScrollableTabRow innerClassName="gap-2.5 pb-1">
        {GENRE_CHIPS.map(g => (
          <button
            key={g}
            onClick={() => setSelectedGenre(g)}
            className={`flex-shrink-0 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
              selectedGenre === g
                ? 'bg-small-orange text-white shadow-lg shadow-small-orange/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 border border-white/5'
            }`}
          >
            {g}
          </button>
        ))}
      </ScrollableTabRow>

      {selectedGenre === 'All' ? (
        <>
          {/* New Releases */}
          {newReleases.length > 0 && (
            <HorizontalRow title="New Releases" subtitle="Just Arrived" Icon={Zap} items={newReleases} onSelect={onSelect} />
          )}

          {/* Recommended */}
          {recommended.length > 0 && (
            <HorizontalRow title="Recommended" subtitle="Picked For You" Icon={Star} items={recommended} onSelect={onSelect} />
          )}

          {/* What People Are Watching */}
          {whatPeopleAreWatching.length > 0 && (
            <HorizontalRow title="What People Are Watching" subtitle="Trending Now" Icon={TrendingUp} items={whatPeopleAreWatching} onSelect={onSelect} />
          )}

          {/* Genre Sections */}
          {genreCategories.map(({ genre, items }) => (
            <section key={genre}>
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 block mb-1">Category</span>
                  <h3 className="font-bebas text-3xl md:text-4xl uppercase tracking-tighter">{genre}</h3>
                </div>
                <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {items.map((item, i) => (
                  <MovieCard key={item.identifier || i} item={item} onSelect={onSelect} />
                ))}
              </div>
            </section>
          ))}

          {genreCategories.length === 0 && allMovies.length > 0 && (
            <section>
              <div className="mb-5">
                <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 block mb-1">Browse</span>
                <h3 className="font-bebas text-4xl uppercase tracking-tighter">All Movies</h3>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
                {allMovies.map((item, i) => (
                  <MovieCard key={('identifier' in item ? item.identifier : item.id) || i} item={item} onSelect={onSelect} width="" />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section>
          <div className="mb-5">
            <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 block mb-1">Genre</span>
            <h3 className="font-bebas text-4xl uppercase tracking-tighter">{selectedGenre}</h3>
          </div>
          {genreFiltered.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
              {genreFiltered.map((item, i) => (
                <MovieCard key={('identifier' in item ? item.identifier : item.id) || i} item={item} onSelect={onSelect} width="" />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
              <Eye size={40} className="text-white/10 mx-auto mb-4" />
              <p className="text-white/20 font-black uppercase tracking-widest text-sm">No movies found for "{selectedGenre}"</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
};
