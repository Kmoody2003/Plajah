import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArchiveVideo } from '../services/archiveContentService';
import { Album } from '../types';
import { Play, TrendingUp, Sparkles, Eye, Star, Zap, Film, ArrowLeft, Users } from 'lucide-react';
import ScrollableTabRow from './ScrollableTabRow';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { getDirectorProfile } from '../data/classicDirectors';
import { getHalloweenStoryIntelBundle } from '../data/halloweenStoryIntel';
import { ClassicDirectorsShowcaseSection, EnrichedPortrait } from './taleo/ClassicCinemaDossier';

interface MoviesSpecificViewProps {
  movies: ArchiveVideo[];
  localContent: Album[];
  onSelect: (item: any) => void;
  onBack?: () => void;
}

const GENRE_CHIPS = ['All', 'Anime', 'Animation', 'Film Noir', 'World Cinema', 'Horror', 'Sci-Fi', 'Thriller', 'Drama', 'Comedy', 'Action', 'Documentary', 'Classic', 'Trailers'];

const matchesChip = (item: any, chip: string): boolean => {
  if (chip === 'All') return true;
  const lc = chip.toLowerCase();
  const genre = (item.genre || '').toLowerCase();
  const subType = (item.subType || '').toLowerCase();
  const tags: string[] = item.tags || [];
  const tagMatch = tags.some(t => t.toLowerCase().includes(lc));
  if (chip === 'Trailers') return subType === 'trailer' || tagMatch || genre.includes('trailer');
  if (chip === 'Anime') return genre.includes('anime') || String(item.movement || '').toLowerCase().includes('anime') || (String(item.country || '').toLowerCase().includes('japan') && genre.includes('animation')) || tagMatch;
  if (chip === 'World Cinema') return Boolean(item.country && !String(item.country).toLowerCase().includes('united states') && !String(item.country).toLowerCase().includes('usa')) || genre.includes('world');
  return genre.includes(lc) || subType === lc || String(item.movement || '').toLowerCase().includes(lc) || tagMatch;
};

const MovieCard: React.FC<{ item: any; onSelect: (i: any) => void; width?: string }> = ({ item, onSelect, width = 'w-36 flex-shrink-0' }) => {
  const isArchive = 'identifier' in item;
  const cover = isArchive ? item.thumbnailUrl : (item.coverImage || item.coverImageUrl || item.thumbnailUrl);
  const itemId = item.identifier || item.archiveIdentifier || item.id || '';
  const directorProfile = item.directorProfile || getDirectorProfile(item.creator || item.artist || item.director, itemId);
  const storyBundle = getHalloweenStoryIntelBundle(itemId);

  return (
    <motion.div
      whileHover={{ y: -5 }}
      onClick={() => onSelect(item)}
      className={`group relative cursor-pointer ${width}`}
    >
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative border border-white/8 group-hover:border-white/20 transition-all duration-300">
        {cover ? (
          <img src={thumb(cover, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(cover)} className="w-full h-full object-cover transition-transform duration-600 group-hover:scale-105" alt={item.title} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={28} className="text-white/10" />
          </div>
        )}
        {storyBundle && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-[#D0BCFF]/35 flex items-center gap-1">
            <Sparkles size={9} className="text-[#D0BCFF]" />
            <span className="text-[7px] font-black uppercase tracking-wider text-[#D0BCFF]">Intel</span>
          </div>
        )}
        {directorProfile && (
          <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 flex items-center gap-1.5">
            <EnrichedPortrait
              name={directorProfile.name}
              fallbackUrl={directorProfile.portraitUrl}
              wikiPageTitle={directorProfile.wikiPageTitle}
              alt={directorProfile.name}
              className="w-4 h-4 rounded-full object-cover border border-[#FFB68D]/40 shrink-0"
            />
            <span className="text-[8px] font-bold text-white/85 truncate">{directorProfile.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
            <Play className="text-white ml-0.5" size={18} fill="white" />
          </div>
        </div>
      </div>
      <h4 className="font-black text-[10px] uppercase tracking-tight truncate mt-2 text-white/70 group-hover:text-white transition-colors">{item.title}</h4>
      <div className="flex items-center justify-between gap-1 mt-0.5">
        {item.year && <p className="text-[8px] text-white/30 font-black uppercase tracking-widest">{item.year}</p>}
        {storyBundle && (
          <span className="text-[8px] text-[#FFB68D]/70 font-bold flex items-center gap-0.5">
            <Users size={8} /> {storyBundle.characters.length} Cast
          </span>
        )}
      </div>
    </motion.div>
  );
};

const HorizontalRow: React.FC<{
  title: string;
  subtitle: string;
  accent?: string;
  items: any[];
  onSelect: (i: any) => void;
}> = ({ title, subtitle, accent = '#D0BCFF', items, onSelect }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1.5" style={{ color: accent }}>{subtitle}</p>
          <h3 className="text-2xl font-black uppercase tracking-tight text-white">{title}</h3>
        </div>
        {items.length > 6 && (
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="text-white/25 hover:text-white/65 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer"
          >
            {expanded ? 'Show Less' : 'See All'}
          </button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4 pb-2">
          {items.map((item, i) => (
            <MovieCard key={item.identifier || item.id || i} item={item} onSelect={onSelect} width="" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {items.slice(0, 16).map((item, i) => (
            <MovieCard key={item.identifier || item.id || i} item={item} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
};

export const MoviesSpecificView: React.FC<MoviesSpecificViewProps> = ({ movies, localContent, onSelect, onBack }) => {
  const [selectedGenre, setSelectedGenre] = useState('All');

  const localMovies = localContent.filter(c => c.subType === 'MOVIE' || c.tags?.includes('movie'));
  const allMovies = [...localMovies, ...movies];

  const genreFiltered = useMemo(() =>
    allMovies.filter(m => matchesChip(m, selectedGenre)),
  [selectedGenre, allMovies]);

  const newReleases = useMemo(() => [...allMovies].sort((a, b) => {
    const ya = parseInt(('year' in a ? (a as any).year : '0') || '0');
    const yb = parseInt(('year' in b ? (b as any).year : '0') || '0');
    return yb - ya;
  }).slice(0, 20), [allMovies]);

  const recommended   = useMemo(() => [...allMovies].filter((_, i) => i % 3 === 1).slice(0, 20), [allMovies]);
  const nowWatching   = useMemo(() => [...allMovies].reverse().slice(0, 20), [allMovies]);

  const genreCategories = useMemo(() => {
    const genres = Array.from(new Set(
      allMovies.flatMap(m => {
        const g = (m as any).genre;
        const tags: string[] = (m as any).tags || [];
        return [g, ...tags].filter(Boolean);
      })
    )).filter(g => !['trailer', 'Trailer'].includes(g));
    return genres.map(genre => ({
      genre,
      items: allMovies.filter(m => matchesChip(m, genre)).slice(0, 16)
    })).filter(g => g.items.length >= 2).slice(0, 6);
  }, [allMovies]);

  return (
    <main className="pt-8 pb-40 px-6 lg:px-12 max-w-screen-2xl mx-auto space-y-14">
      {/* Header */}
      <div className="flex items-start gap-5">
        {onBack && (
          <button
            onClick={onBack}
            className="mt-2 w-10 h-10 rounded-full bg-white/[0.07] backdrop-blur-md border border-white/[0.10] flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.12] transition-all shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-3">Browse</p>
          <h2 className="text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">Movies</h2>
        </div>
      </div>

      {/* Genre Filter Chips */}
      <ScrollableTabRow innerClassName="gap-2 pb-1">
        {GENRE_CHIPS.map(g => (
          <button
            key={g}
            onClick={() => setSelectedGenre(g)}
            className={`flex-shrink-0 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
              selectedGenre === g
                ? 'bg-[#D0BCFF] text-[#1C1B1F] shadow-lg'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 border border-white/8'
            }`}
          >
            {g}
          </button>
        ))}
      </ScrollableTabRow>

      {selectedGenre === 'All' ? (
        <>
          {newReleases.length > 0 && (
            <HorizontalRow title="New Releases" subtitle="Just Arrived" accent="#D0BCFF" items={newReleases} onSelect={onSelect} />
          )}
          {recommended.length > 0 && (
            <HorizontalRow title="Recommended" subtitle="Picked For You" accent="#FFB68D" items={recommended} onSelect={onSelect} />
          )}
          {nowWatching.length > 0 && (
            <HorizontalRow title="What People Are Watching" subtitle="Trending Now" accent="#D0BCFF" items={nowWatching} onSelect={onSelect} />
          )}
          {genreCategories.map(({ genre, items }) => (
            <section key={genre}>
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Category</p>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white">{genre}</h3>
                </div>
                <button
                  onClick={() => setSelectedGenre(genre)}
                  className="text-white/25 hover:text-white/65 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                >
                  See All
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {items.map((item, i) => (
                  <MovieCard key={(item as any).identifier || (item as any).id || i} item={item} onSelect={onSelect} />
                ))}
              </div>
            </section>
          ))}
          {genreCategories.length === 0 && allMovies.length > 0 && (
            <section>
              <div className="mb-5">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Browse</p>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white">All Movies</h3>
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
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Genre</p>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">{selectedGenre}</h3>
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

      {/* Classic Cinema Auteurs — Director Portraits, Biographies & Filmographies */}
      <ClassicDirectorsShowcaseSection
        title="The Auteurs of Classic Cinema"
        subtitle="Director Portraits · Biographies · Complete Career Filmographies"
        onSelectFilmByIdentifier={(id) => {
          const found = allMovies.find(
            (m: any) =>
              m.identifier === id ||
              m.archiveIdentifier === id ||
              m.id === id ||
              m.id === `public_domain_${id}`
          );
          if (found) onSelect(found);
        }}
      />
    </main>
  );
};
