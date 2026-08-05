import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Album } from '../types';
import { ArchiveVideo, getArchiveItemFiles, getBestVideoUrl } from '../services/archiveContentService';
import { Play, ChevronLeft, Loader2, Info, TrendingUp, Star, Zap, Eye, Film } from 'lucide-react';
import ScrollableTabRow from './ScrollableTabRow';

const TV_GENRE_CHIPS = ['All', 'Trailers', 'Comedy', 'Drama', 'Action', 'Sci-Fi', 'Crime', 'Horror', 'Reality', 'Documentary', 'Animation', 'Classic'];

const tvMatchesChip = (item: any, chip: string): boolean => {
  if (chip === 'All') return true;
  const lc = chip.toLowerCase();
  const genre = (('genre' in item ? item.genre : '') || '').toLowerCase();
  const subType = (item.subType || '').toLowerCase();
  const tags: string[] = item.tags || [];
  const tagMatch = tags.some((t: string) => t.toLowerCase().includes(lc));
  if (chip === 'Trailers') return subType === 'trailer' || tagMatch || genre.includes('trailer');
  return genre.includes(lc) || subType === lc || tagMatch;
};

const SeriesCard: React.FC<{ item: any; onClick: (i: any) => void; width?: string }> = ({ item, onClick, width = 'min-w-[140px] md:min-w-[160px]' }) => {
  const cover = item.thumbnailUrl || item.coverImage || null;
  return (
    <motion.div
      whileHover={{ y: -5 }}
      onClick={() => onClick(item)}
      className={`group relative cursor-pointer flex-shrink-0 ${width}`}
    >
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative border border-white/8 group-hover:border-white/20 transition-all duration-300">
        {cover ? (
          <img src={cover} className="w-full h-full object-cover transition-transform duration-600 group-hover:scale-105" alt={item.title} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={28} className="text-white/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
            <Play className="text-white ml-0.5" size={18} fill="white" />
          </div>
        </div>
      </div>
      <h4 className="font-black text-[10px] uppercase tracking-tight truncate mt-2 text-white/70 group-hover:text-white transition-colors">{item.title}</h4>
    </motion.div>
  );
};

const TVRow: React.FC<{
  title: string;
  subtitle: string;
  accent?: string;
  items: any[];
  onSelect: (i: any) => void;
}> = ({ title, subtitle, accent = '#D0BCFF', items, onSelect }) => (
  <section>
    <div className="mb-5 flex items-end justify-between">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1.5" style={{ color: accent }}>{subtitle}</p>
        <h3 className="text-2xl font-black uppercase tracking-tight text-white">{title}</h3>
      </div>
      <button className="text-white/25 hover:text-white/55 text-[9px] font-black uppercase tracking-widest transition-colors">See All</button>
    </div>
    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
      {items.slice(0, 16).map((s, i) => (
        <SeriesCard key={s.identifier || s.id || i} item={s} onClick={onSelect} />
      ))}
    </div>
  </section>
);

interface TelevisionViewProps {
  series: (Album | ArchiveVideo)[];
  onSelect?: (item: any) => void;
  initialSelectedSeries?: any;
}

export const TelevisionView: React.FC<TelevisionViewProps> = ({ series, onSelect, initialSelectedSeries }) => {
  const [selectedSeries, setSelectedSeries] = useState<any | null>(initialSelectedSeries || null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('All');

  const genreFiltered = useMemo(() =>
    series.filter(s => tvMatchesChip(s, selectedGenre)),
  [selectedGenre, series]);

  const newShows    = useMemo(() => series.slice(0, 20), [series]);
  const recommended = useMemo(() => series.filter((_, i) => i % 3 === 2).slice(0, 20), [series]);
  const popular     = useMemo(() => [...series].reverse().slice(0, 20), [series]);

  const genreCategories = useMemo(() => {
    const genres = Array.from(new Set<string>(
      series.flatMap(s => {
        const g = 'genre' in s ? (s as any).genre : null;
        const tags: string[] = (s as any).tags || [];
        return [g || 'Classic TV', ...tags].filter(Boolean);
      })
    )).filter(g => !['trailer', 'Trailer'].includes(g));
    return genres.map(genre => ({
      genre,
      items: series.filter(s => tvMatchesChip(s, genre)).slice(0, 16)
    })).filter(g => g.items.length >= 2).slice(0, 5);
  }, [series]);

  useEffect(() => {
    if (initialSelectedSeries) handleItemClick(initialSelectedSeries);
  }, [initialSelectedSeries]);

  const getCover = (s: any) => s.thumbnailUrl || s.coverImage || null;
  const getTitle = (s: any) => s.title || '';
  const getDesc  = (s: any) => s.description || '';
  const getId    = (s: any) => s.identifier || s.id;

  const handleItemClick = async (item: any) => {
    setSelectedSeries(item);
    setIsLoadingEpisodes(true);
    setEpisodes([]);

    try {
      if (item.identifier) {
        const files = await getArchiveItemFiles(item.identifier);
        const episodesList: any[] = [];
        const foundSeasons = new Set<number>();

        files
          .filter((f: any) => {
            const lower = f.name.toLowerCase();
            return lower.endsWith('.mp4') || lower.endsWith('.ogv') || lower.endsWith('.mov') || lower.endsWith('.m4v');
          })
          .forEach((f: any) => {
            const name = f.name.replace(/_/g, ' ');
            const sMatch = name.match(/S(\d+)/i) || name.match(/Season\s*(\d+)/i) || name.match(/(\d+)x\d+/);
            const eMatch = name.match(/E(\d+)/i) || name.match(/Episode\s*(\d+)/i) || name.match(/\d+x(\d+)/) || name.match(/[-_\s](\d{1,3})[-_\s]/) || name.match(/(\d+)\./);
            let sNum = sMatch ? parseInt(sMatch[1]) : 1;
            let eNum = eMatch ? parseInt(eMatch[1]) : null;

            if (!sMatch && !eMatch) {
              const numMatch = name.match(/(\d{1,4})/);
              if (numMatch) {
                const val = numMatch[1];
                if (val.length >= 3) { sNum = parseInt(val.slice(0, val.length - 2)); eNum = parseInt(val.slice(val.length - 2)); }
                else { eNum = parseInt(val); }
              }
            }

            foundSeasons.add(sNum);
            episodesList.push({
              id: f.name,
              title: f.title || name.replace(/\.[^/.]+$/, '').replace(/^\d+\s*-\s*/, ''),
              description: f.description || `${item.title} — Season ${sNum}${eNum ? `, Episode ${eNum}` : ''}`,
              url: `https://archive.org/download/${item.identifier}/${f.name}`,
              thumbnailUrl: item.thumbnailUrl,
              season: sNum,
              episode: eNum,
              rawName: f.name,
            });
          });

        episodesList.sort((a, b) => a.season !== b.season ? a.season - b.season : (a.episode || 0) - (b.episode || 0));
        setEpisodes(episodesList);
        const sortedSeasons = Array.from(foundSeasons).sort((a, b) => a - b);
        if (sortedSeasons.length > 0) setSelectedSeason(sortedSeasons[0]);
      } else if (item.seasons) {
        setSelectedSeason(item.seasons[0]?.number ?? 1);
        const allEpisodes = item.seasons.flatMap((s: any) =>
          (s.episodes || []).map((e: any) => ({ ...e, season: s.number }))
        );
        setEpisodes(allEpisodes);
      }
    } catch (err) {
      console.error('TelevisionView: failed to load episodes:', err);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const currentEpisodes = episodes.filter(ep => ep.season === selectedSeason);
  const seasonsList = Array.from(new Set(episodes.map(ep => ep.season))).sort((a, b) => a - b);

  const handlePlayEpisode = (episode: any) => {
    if (onSelect) {
      const transformed: Album = {
        id: episode.id,
        title: episode.title,
        artist: `${getTitle(selectedSeries)} — S${episode.season}${episode.episode ? 'E' + episode.episode : ''}`,
        coverImage: episode.thumbnailUrl || getCover(selectedSeries),
        headerImage: getCover(selectedSeries),
        description: episode.description,
        type: 'VIDEO', subType: 'TV_SERIES',
        ownerId: 'internet-archive',
        createdAt: Date.now(),
        themeColor: '#000000',
        tracks: [],
        customVideoUrl: episode.url,
      };
      onSelect(transformed);
    }
  };

  // ── Series detail view ─────────────────────────────────────────────────────
  if (selectedSeries) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-24 px-5 md:px-10 pb-32 max-w-6xl mx-auto"
      >
        <button
          onClick={() => setSelectedSeries(null)}
          className="mb-8 flex items-center gap-2 text-[#D0BCFF] font-black text-[10px] uppercase tracking-widest hover:-translate-x-1 transition-transform"
        >
          <ChevronLeft size={16} /> Back to Television
        </button>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Poster */}
          <div className="w-full lg:w-72 shrink-0 space-y-5">
            <div className="aspect-[2/3] relative rounded-2xl overflow-hidden shadow-2xl border border-white/8">
              {getCover(selectedSeries) && (
                <img src={getCover(selectedSeries)!} className="w-full h-full object-cover" alt={getTitle(selectedSeries)} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
            <div className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Series Info</h3>
              <div className="space-y-2.5">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/40">Seasons</span>
                  <span className="text-[10px] uppercase tracking-widest font-black text-white">{seasonsList.length}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/40">Episodes</span>
                  <span className="text-[10px] uppercase tracking-widest font-black text-white">{episodes.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Episodes */}
          <div className="flex-1 space-y-10">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-3">Now Streaming</p>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tight uppercase leading-[0.88] text-white mb-5">
                {getTitle(selectedSeries)}
              </h1>
              <p className="text-white/50 text-sm leading-relaxed max-w-2xl bg-white/4 border border-white/8 rounded-2xl p-5">
                {getDesc(selectedSeries).replace(/<[^>]*>?/gm, '').slice(0, 500)}
              </p>
            </div>

            {/* Season selector */}
            {seasonsList.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
                {seasonsList.map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedSeason(s)}
                    className={`px-6 py-2.5 rounded-full font-black text-sm uppercase tracking-widest transition-all flex-shrink-0 ${
                      selectedSeason === s
                        ? 'bg-[#D0BCFF] text-[#1C1B1F] shadow-lg'
                        : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Season {s}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-wider text-white">Episodes</h3>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{currentEpisodes.length} Available</span>
            </div>

            {isLoadingEpisodes ? (
              <div className="py-16 flex flex-col items-center justify-center gap-4">
                <Loader2 className="animate-spin text-[#D0BCFF]" size={36} />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Loading episodes…</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentEpisodes.map((ep, idx) => (
                  <motion.div
                    key={ep.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex flex-col md:flex-row gap-5 p-5 bg-white/4 border border-white/8 hover:border-[#D0BCFF]/30 rounded-2xl group cursor-pointer transition-all hover:bg-white/6"
                    onClick={() => handlePlayEpisode(ep)}
                  >
                    <div className="w-full md:w-56 aspect-video shrink-0 relative rounded-xl overflow-hidden">
                      <img
                        src={ep.thumbnailUrl || ''}
                        className="w-full h-full object-cover transition-transform duration-600 group-hover:scale-105 opacity-80"
                        alt={ep.title}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play fill="currentColor" size={22} className="text-white ml-1" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[#D0BCFF] font-black text-[10px] uppercase tracking-widest">
                          E{ep.episode ?? idx + 1}
                        </span>
                        <span className="h-px w-6 bg-white/10" />
                        <span className="text-white/30 text-[9px] font-black uppercase tracking-widest">
                          Season {ep.season}
                        </span>
                      </div>
                      <h4 className="font-black text-xl uppercase tracking-tight text-white group-hover:text-[#D0BCFF] transition-colors truncate">{ep.title}</h4>
                      <p className="text-sm text-white/40 mt-2 line-clamp-2 leading-relaxed">{ep.description}</p>
                    </div>
                  </motion.div>
                ))}
                {episodes.length === 0 && !isLoadingEpisodes && (
                  <div className="py-16 text-center bg-white/3 border border-white/8 rounded-2xl">
                    <Film size={36} className="text-white/10 mx-auto mb-3" />
                    <p className="font-black text-lg uppercase tracking-widest text-white/20">No episodes found for this series.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Series browser ──────────────────────────────────────────────────────────
  return (
    <div className="pt-8 px-6 md:px-12 pb-32 max-w-screen-2xl mx-auto space-y-14">
      {/* Header */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-3">Browse</p>
        <h2 className="text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">Television</h2>
      </div>

      {/* Genre Filter Chips */}
      <ScrollableTabRow innerClassName="gap-2 pb-1">
        {TV_GENRE_CHIPS.map(g => (
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
          {newShows.length > 0 && (
            <TVRow title="New Releases" subtitle="Just Added" accent="#D0BCFF" items={newShows} onSelect={handleItemClick} />
          )}
          {recommended.length > 0 && (
            <TVRow title="Recommended For You" subtitle="Curated Picks" accent="#FFB68D" items={recommended} onSelect={handleItemClick} />
          )}
          {popular.length > 0 && (
            <TVRow title="What People Are Watching" subtitle="Trending Now" accent="#D0BCFF" items={popular} onSelect={handleItemClick} />
          )}
          {genreCategories.map(({ genre, items }) => (
            <section key={genre}>
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Category</p>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white">{genre}</h3>
                </div>
                <button className="text-white/25 hover:text-white/55 text-[9px] font-black uppercase tracking-widest transition-colors">See All</button>
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {items.map((s, i) => (
                  <SeriesCard key={getId(s) || i} item={s} onClick={handleItemClick} />
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        <section>
          <div className="mb-5">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">Genre</p>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">{selectedGenre}</h3>
          </div>
          {genreFiltered.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
              {genreFiltered.map((s, i) => (
                <SeriesCard key={getId(s) || i} item={s} onClick={handleItemClick} width="" />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
              <Eye size={40} className="text-white/10 mx-auto mb-4" />
              <p className="text-white/20 font-black uppercase tracking-widest text-sm">No shows found for "{selectedGenre}"</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
