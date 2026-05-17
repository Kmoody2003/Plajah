import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Album } from '../types';
import { ArchiveVideo, getArchiveItemFiles, getBestVideoUrl } from '../services/archiveContentService';
import { Play, ChevronLeft, Loader2, Info, TrendingUp, Star, Zap, Eye } from 'lucide-react';
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
      whileHover={{ y: -6 }}
      onClick={() => onClick(item)}
      className={`group relative cursor-pointer flex-shrink-0 ${width}`}
    >
      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 relative border border-white/5 group-hover:border-white/20 transition-all duration-300">
        <img src={cover} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={item.title} />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
            <Play className="text-white ml-0.5" size={20} fill="white" />
          </div>
        </div>
      </div>
      <h4 className="font-black text-[10px] uppercase tracking-tight truncate mt-2.5 text-white/80 group-hover:text-white transition-colors">{item.title}</h4>
    </motion.div>
  );
};

const TVRow: React.FC<{ title: string; subtitle: string; Icon: React.FC<{ size?: number; className?: string }>; items: any[]; onSelect: (i: any) => void }> = ({ title, subtitle, Icon, items, onSelect }) => (
  <section>
    <div className="mb-5 flex items-end justify-between">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={13} className="text-primary" />
          <span className="text-[8px] font-black uppercase tracking-[0.35em] text-primary">{subtitle}</span>
        </div>
        <h3 className="font-bebas text-3xl md:text-4xl uppercase tracking-tighter">{title}</h3>
      </div>
      <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
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

  // All useMemo hooks must be BEFORE any early return so React sees a consistent hook count
  const genreFiltered = useMemo(() =>
    series.filter(s => tvMatchesChip(s, selectedGenre)),
  [selectedGenre, series]);

  const newShows = useMemo(() => series.slice(0, 20), [series]);
  const recommended = useMemo(() => series.filter((_, i) => i % 3 === 2).slice(0, 20), [series]);
  const popular = useMemo(() => [...series].reverse().slice(0, 20), [series]);

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
    if (initialSelectedSeries) {
      handleItemClick(initialSelectedSeries);
    }
  }, [initialSelectedSeries]);

  const getCover = (s: any) => s.thumbnailUrl || s.coverImage || null;
  const getTitle = (s: any) => s.title || '';
  const getDesc = (s: any) => s.description || '';
  const getId = (s: any) => s.identifier || s.id;

  const handleItemClick = async (item: any) => {
    setSelectedSeries(item);
    setIsLoadingEpisodes(true);
    setEpisodes([]);

    try {
    if (item.identifier) {
        const files = await getArchiveItemFiles(item.identifier);

        // Group files into seasons and episodes
        const episodesList: any[] = [];
        const foundSeasons = new Set<number>();
        
        files
            .filter((f: any) => {
                const lower = f.name.toLowerCase();
                return lower.endsWith('.mp4') || lower.endsWith('.ogv') || lower.endsWith('.mov') || lower.endsWith('.m4v');
            })
            .forEach((f: any) => {
                const name = f.name.replace(/_/g, " ");
                // Enhanced regex for SxxExx, 1x01, Season x Episode y, or Just numbers
                const sMatch = name.match(/S(\d+)/i) || name.match(/Season\s*(\d+)/i) || name.match(/(\d+)x\d+/);
                const eMatch = name.match(/E(\d+)/i) || name.match(/Episode\s*(\d+)/i) || name.match(/\d+x(\d+)/) || name.match(/[-_\s](\d{1,3})[-_\s]/) || name.match(/(\d+)\./);
                
                let sNum = sMatch ? parseInt(sMatch[1]) : 1;
                let eNum = eMatch ? parseInt(eMatch[1]) : null;

                // Fallback for names like "Show Name 101.mp4" (Season 1 Episode 1)
                if (!sMatch && !eMatch) {
                    const numMatch = name.match(/(\d{1,4})/);
                    if (numMatch) {
                        const val = numMatch[1];
                        if (val.length >= 3) {
                            sNum = parseInt(val.slice(0, val.length - 2));
                            eNum = parseInt(val.slice(val.length - 2));
                        } else {
                            eNum = parseInt(val);
                        }
                    }
                }
                
                foundSeasons.add(sNum);
                
                const episodeUrl = `https://archive.org/download/${item.identifier}/${f.name}`;
                
                episodesList.push({
                    id: f.name,
                    title: f.title || name.replace(/\.[^/.]+$/, "").replace(/^\d+\s*-\s*/, ""),
                    description: f.description || `Digital archival transmission of ${item.title} signal. Signal strength within parameters.`,
                    url: episodeUrl,
                    thumbnailUrl: item.thumbnailUrl,
                    season: sNum,
                    episode: eNum,
                    rawName: f.name
                });
            });
        
        // Sort by season then episode
        episodesList.sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return (a.episode || 0) - (b.episode || 0);
        });
        
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
            artist: `${getTitle(selectedSeries)} - S${episode.season}${episode.episode ? 'E' + episode.episode : ''}`,
            coverImage: episode.thumbnailUrl || getCover(selectedSeries),
            headerImage: getCover(selectedSeries),
            description: episode.description,
            type: 'VIDEO',
            subType: 'TV_SERIES',
            ownerId: 'internet-archive',
            createdAt: Date.now(),
            themeColor: '#000000',
            tracks: [],
            customVideoUrl: episode.url
        };
        onSelect(transformed);
    }
  };

  if (selectedSeries) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="pt-24 px-4 md:px-8 pb-32 max-w-7xl mx-auto"
        >
            <button 
                onClick={() => setSelectedSeries(null)} 
                className="mb-8 text-primary font-bebas tracking-widest flex items-center gap-2 hover:translate-x-[-4px] transition-transform uppercase group"
            >
                <ChevronLeft className="group-hover:text-primary-variant transition-colors" /> BACK TO DISCOVERY
            </button>
            <div className="flex flex-col lg:flex-row gap-16">
                <div className="w-full lg:w-1/3 space-y-8">
                    <div className="aspect-[2/3] relative rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 group aurora-glow">
                        {getCover(selectedSeries) && (
                          <img src={getCover(selectedSeries)!} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={getTitle(selectedSeries)} />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                        <div className="absolute bottom-8 left-8 right-8">
                             <div className="p-4 glass rounded-2xl flex items-center gap-4 border border-white/5">
                                <span className="bg-primary/20 text-primary p-2 rounded-lg">
                                    <Info size={20} />
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Series Archive Synced</span>
                             </div>
                        </div>
                    </div>
                    <div className="p-8 glass rounded-[2.5rem] border border-white/5 space-y-6">
                        <h3 className="font-bebas text-2xl uppercase tracking-widest">Broadcast Data</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-[10px] uppercase tracking-widest opacity-40">Seasons</span>
                                <span className="text-[10px] uppercase tracking-widest font-bold">{seasonsList.length}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-[10px] uppercase tracking-widest opacity-40">Episodes</span>
                                <span className="text-[10px] uppercase tracking-widest font-bold">{episodes.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex-1 space-y-12">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <span className="h-px w-12 bg-primary"></span>
                            <span className="text-xs font-black uppercase tracking-[0.4em] text-primary">Quantum Broadcast</span>
                        </div>
                        <h1 className="text-6xl lg:text-9xl font-bebas tracking-tighter uppercase mb-6 leading-[0.8] drop-shadow-2xl">{getTitle(selectedSeries)}</h1>
                        <p className="text-on-surface-variant text-lg font-light leading-relaxed max-w-2xl bg-white/5 p-8 rounded-3xl border border-white/5">
                            {getDesc(selectedSeries).replace(/<[^>]*>?/gm, '').slice(0, 500)}...
                        </p>
                    </div>
                    
                    <div className="space-y-12">
                        {seasonsList.length > 1 && (
                            <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide">
                                {seasonsList.map(s => (
                                    <button 
                                        key={s}
                                        onClick={() => setSelectedSeason(s)}
                                        className={`px-8 py-4 rounded-full font-bebas text-lg tracking-widest transition-all ${selectedSeason === s ? 'aurora-bg text-on-primary shadow-xl scale-105' : 'glass border border-white/10 opacity-40 hover:opacity-100'}`}
                                    >
                                        SEASON {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <h3 className="text-3xl font-bebas uppercase tracking-widest">Episode Listing</h3>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{currentEpisodes.length} Signals Captured</span>
                        </div>

                        {isLoadingEpisodes ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-4">
                                <Loader2 className="animate-spin text-primary" size={48} />
                                <p className="font-bebas text-xl tracking-[0.3em] uppercase opacity-40">Decrypting archive...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                {currentEpisodes.map((ep, idx) => (
                                    <motion.div 
                                        key={ep.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex flex-col md:flex-row gap-8 p-8 bg-white/[0.02] rounded-[2.5rem] border border-white/5 hover:border-primary/40 group cursor-pointer transition-all hover:bg-white/[0.05]"
                                        onClick={() => handlePlayEpisode(ep)}
                                    >
                                        <div className="w-full md:w-64 aspect-video shrink-0 relative rounded-2xl overflow-hidden shadow-2xl">
                                             <img src={ep.thumbnailUrl || 'https://images.unsplash.com/photo-1598897652140-6b6c0f065851?auto=format&fit=crop&q=80'} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 opacity-80" />
                                             <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                                                <div className="w-16 h-16 rounded-full glass border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform aurora-bg-hover">
                                                    <Play fill="currentColor" size={28} className="text-white ml-1" />
                                                </div>
                                             </div>
                                        </div>
                                        <div className="flex-1 flex flex-col justify-center">
                                            <div className="flex items-center gap-4 mb-3">
                                                <span className="text-primary font-black text-[10px] uppercase tracking-widest">E{ep.episode ?? idx + 1}</span>
                                                <span className="h-px w-8 bg-white/10"></span>
                                                <span className="text-on-surface-variant font-label text-[10px] uppercase tracking-widest">Digital Signal Found</span>
                                            </div>
                                            <h4 className="font-bebas text-4xl tracking-tight uppercase group-hover:text-primary transition-colors">{ep.title}</h4>
                                            <p className="text-sm text-on-surface-variant mt-4 line-clamp-2 leading-relaxed font-light italic">{ep.description}</p>
                                        </div>
                                    </motion.div>
                                ))}
                                {episodes.length === 0 && !isLoadingEpisodes && (
                                    <div className="py-20 text-center glass rounded-[2.5rem] border border-white/5">
                                        <p className="font-bebas text-2xl uppercase tracking-widest opacity-20">No playable frequencies found for this mission.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
  }

  return (
    <div className="pt-8 px-6 md:px-12 pb-32 max-w-screen-2xl mx-auto space-y-14">
      {/* Header */}
      <div>
        <span className="font-bebas text-[10px] uppercase tracking-[0.4em] text-tertiary mb-2 block">Broadcast Archive</span>
        <h2 className="font-bebas text-5xl md:text-7xl font-black leading-[0.85] uppercase tracking-tighter">Television</h2>
      </div>

      {/* Genre Filter Chips */}
      <ScrollableTabRow innerClassName="gap-2.5 pb-1">
        {TV_GENRE_CHIPS.map(g => (
          <button
            key={g}
            onClick={() => setSelectedGenre(g)}
            className={`flex-shrink-0 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
              selectedGenre === g
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 border border-white/5'
            }`}
          >
            {g}
          </button>
        ))}
      </ScrollableTabRow>

      {selectedGenre === 'All' ? (
        <>
          {/* New Shows */}
          {newShows.length > 0 && (
            <TVRow title="New Releases" subtitle="Just Added" Icon={Zap} items={newShows} onSelect={handleItemClick} />
          )}

          {/* Recommended */}
          {recommended.length > 0 && (
            <TVRow title="Recommended For You" subtitle="Curated Picks" Icon={Star} items={recommended} onSelect={handleItemClick} />
          )}

          {/* What People Are Watching */}
          {popular.length > 0 && (
            <TVRow title="What People Are Watching" subtitle="Trending Now" Icon={TrendingUp} items={popular} onSelect={handleItemClick} />
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
            <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 block mb-1">Genre</span>
            <h3 className="font-bebas text-4xl uppercase tracking-tighter">{selectedGenre}</h3>
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
