import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Album } from '../types';
import { ArchiveVideo, getArchiveItemFiles, getBestVideoUrl } from '../services/archiveContentService';
import { Play, ChevronLeft, Loader2, Info } from 'lucide-react';

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
    // If it's already a transformed album or local content without explicit show structure,
    // we might want to just play it. But the user wants "show pages".
    // We'll fetching files first to see if it's episodic.
    
    setSelectedSeries(item);
    setIsLoadingEpisodes(true);
    setEpisodes([]);

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
        setSelectedSeason(item.seasons[0].number);
        const allEpisodes = item.seasons.flatMap((s: any) => 
            s.episodes.map((e: any) => ({ ...e, season: s.number }))
        );
        setEpisodes(allEpisodes);
    }
    setIsLoadingEpisodes(false);
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
                        <img src={getCover(selectedSeries) || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
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
                                                <span className="text-primary font-black text-[10px] uppercase tracking-widest">E{idx + 1}</span>
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
    <div className="pt-24 px-4 md:px-8 pb-32 max-w-7xl mx-auto">
      <section className="mb-20">
        <div className="mb-10">
            <span className="text-primary font-bebas text-xs uppercase tracking-[0.4em] mb-1 block">The Front Page</span>
            <h2 className="text-5xl md:text-8xl font-bebas uppercase tracking-tighter leading-none">Featured Series</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {series.slice(0, 2).map(s => (
                <div key={getId(s)} onClick={() => handleItemClick(s)} className="relative aspect-video rounded-[2.5rem] overflow-hidden glass border border-white/10 group cursor-pointer shadow-2xl">
                    <img src={getCover(s) || null} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-10">
                        <h3 className="text-4xl lg:text-5xl font-bebas tracking-tighter uppercase leading-none">{getTitle(s)}</h3>
                        <p className="text-sm text-white/40 line-clamp-2 mt-4 font-light leading-relaxed max-w-sm">{getDesc(s).replace(/<[^>]*>?/gm, '')}</p>
                    </div>
                </div>
            ))}
        </div>
      </section>

      <section className="space-y-20">
        {Array.from(new Set<string>(series.map(s => {
            if ('genre' in s && s.genre) return s.genre as string;
            if (('artist' in s ? s.artist : ('creator' in s ? s.creator : '')) && typeof ('artist' in s ? s.artist : ('creator' in s ? s.creator : '')) === 'string') return ('artist' in s ? s.artist : ('creator' in s ? s.creator : '')) as string;
            return 'Classic TV';
        }))).filter(Boolean).map(genre => {
            const categorySeries = series.filter(s => {
                const g = 'genre' in s ? s.genre : ('artist' in s ? s.artist : ('creator' in s ? s.creator : ''));
                return g === genre || (!g && genre === 'Classic TV');
            });

            if (categorySeries.length < 2) return null;

            return (
                <div key={genre}>
                    <div className="mb-10 flex items-end justify-between">
                        <h2 className="text-4xl font-bebas uppercase tracking-tighter leading-none">{genre}</h2>
                        <button className="text-[10px] font-black tracking-widest uppercase text-white/20 hover:text-white transition-colors">Explore All</button>
                    </div>
                    <div className="flex gap-8 overflow-x-auto no-scrollbar mask-fade-edges pb-8">
                        {categorySeries.map(s => (
                            <motion.div 
                                key={getId(s)}
                                onClick={() => handleItemClick(s)}
                                whileHover={{ y: -8 }}
                                className="group cursor-pointer space-y-4 min-w-[160px] md:min-w-[200px]"
                            >
                                <div className="relative aspect-[2/3] rounded-3xl overflow-hidden glass border border-white/10 shadow-xl group-hover:ring-2 ring-primary/40 transition-all duration-500">
                                    <img src={getCover(s) || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center p-4 backdrop-blur-[2px] transition-all">
                                         <div className="w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center bg-primary/20 bg-small-orange">
                                            <span className="text-white">▶</span>
                                         </div>
                                    </div>
                                </div>
                                <div className="px-2">
                                    <h4 className="font-bebas text-lg tracking-tight uppercase line-clamp-1 group-hover:text-primary transition-colors">{getTitle(s)}</h4>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            );
        })}
      </section>
    </div>
  );
};
