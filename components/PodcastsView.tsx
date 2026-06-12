import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchAllPublicAlbums } from '../services/backendService';
import { Search, Rss, Mic, Play, Pause, Plus, Check, ChevronLeft, Calendar, Clock, Globe, TrendingUp, Grid, List, Radio } from 'lucide-react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { Album, Track } from '../types';

interface ITunesPodcast {
  id: string;
  title: string;
  artist: string;
  coverImage: string;
  feedUrl: string;
  genres: string[];
}

interface ITunesEpisode {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  duration: number;
  releaseDate: string;
  imageUrl?: string;
}

const CATEGORIES = [
    { id: '1303', name: 'Comedy', icon: '🎭' },
    { id: '1318', name: 'Technology', icon: '💻' },
    { id: '1321', name: 'True Crime', icon: '🕵️' },
    { id: '1324', name: 'Business', icon: '📈' },
    { id: '1315', name: 'Science', icon: '🔬' },
    { id: '1317', name: 'Sports', icon: '⚽' },
    { id: '1323', name: 'Music', icon: '🎵' },
];

// Defined at module scope so React never unmounts/remounts it on parent re-renders
const PodcastGrid = React.memo(({ title, podcasts, icon: Icon, onOpen }: {
    title: string;
    podcasts: ITunesPodcast[];
    icon?: any;
    onOpen: (p: ITunesPodcast) => void;
}) => (
    <section className="space-y-8">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                {Icon && <Icon className="text-small-orange" size={24} />}
                <h3 className="text-2xl font-black uppercase tracking-tighter">{title}</h3>
            </div>
            <div className="h-px flex-1 bg-white/5 mx-8 hidden lg:block" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30 whitespace-nowrap">Global Top 10</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-4 md:gap-6 xl:gap-8">
            {podcasts.slice(0, 10).map((p, idx) => (
                <div
                    key={p.id}
                    onClick={() => onOpen(p)}
                    className="group cursor-pointer"
                >
                    <div className="relative aspect-square rounded-[2.5rem] overflow-hidden mb-6 shadow-2xl border border-white/5 group-hover:border-small-orange/40 transition-all duration-500">
                        <img
                            src={p.coverImage || undefined}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                            alt={p.title}
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                            <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-500"><Play size={24} className="ml-1" fill="currentColor" /></div>
                        </div>
                        <div className="absolute top-4 left-4 w-8 h-8 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center text-xs font-black text-white/40">
                            {idx + 1}
                        </div>
                    </div>
                    <h4 className="font-black text-sm uppercase tracking-tight truncate mb-1 group-hover:text-small-orange transition-colors">{p.title}</h4>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] truncate">{p.artist}</p>
                </div>
            ))}
        </div>
    </section>
));

export const PodcastsView: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ITunesPodcast[]>([]);
    const [myPodcasts, setMyPodcasts] = useState<ITunesPodcast[]>([]);
    const [topPodcasts, setTopPodcasts] = useState<ITunesPodcast[]>([]);
    const [nativePodcasts, setNativePodcasts] = useState<Album[]>([]);
    const [categoryPodcasts, setCategoryPodcasts] = useState<Record<string, ITunesPodcast[]>>({});
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingTop, setIsLoadingTop] = useState(false);
    
    const [selectedPodcast, setSelectedPodcast] = useState<ITunesPodcast | null>(null);
    const [episodes, setEpisodes] = useState<ITunesEpisode[]>([]);
    const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

    const { playTrack, togglePlay, currentTrack, isPlaying, theme } = useGlobalPlayerState();

    useEffect(() => {
        const saved = localStorage.getItem('vibe_my_podcasts');
        if (saved) {
            try {
                setMyPodcasts(JSON.parse(saved));
            } catch (e) {
                console.error(e);
            }
        }
        fetchTop10();
        fetchCategoryData();
        fetchNativePodcasts();
    }, []);

    const fetchNativePodcasts = async () => {
        try {
            const albums = await fetchAllPublicAlbums();
            setNativePodcasts(albums.filter(a => a.subType === 'PODCAST'));
        } catch (err) {
            console.error("Failed to fetch native podcasts:", err);
        }
    };

    const fetchTop10 = async () => {
        setIsLoadingTop(true);
        try {
            const res = await fetch('https://itunes.apple.com/us/rss/toppodcasts/limit=10/json');
            const data = await res.json();
            const entries: any[] = data?.feed?.entry || [];
            const pods = entries.map((e: any) => ({
                id: e.id?.attributes?.['im:id'] ?? '',
                title: e['im:name']?.label ?? '',
                artist: e['im:artist']?.label ?? '',
                coverImage: e['im:image']?.[2]?.label || e['im:image']?.[0]?.label || '',
                feedUrl: '',
                genres: e.category?.attributes?.label ? [e.category.attributes.label] : []
            })).filter(p => p.id);
            setTopPodcasts(pods);
        } catch (err) {
            console.error("Top 10 fetch failed:", err);
        } finally {
            setIsLoadingTop(false);
        }
    };

    const fetchCategoryData = async () => {
        const data: Record<string, ITunesPodcast[]> = {};
        for (const cat of CATEGORIES.slice(0, 4)) {
            try {
                const res = await fetch(`https://itunes.apple.com/us/rss/toppodcasts/limit=10/genre=${cat.id}/json`);
                const json = await res.json();
                const entries: any[] = json?.feed?.entry || [];
                data[cat.name] = entries.map((e: any) => ({
                    id: e.id?.attributes?.['im:id'] ?? '',
                    title: e['im:name']?.label ?? '',
                    artist: e['im:artist']?.label ?? '',
                    coverImage: e['im:image']?.[2]?.label || e['im:image']?.[0]?.label || '',
                    feedUrl: '',
                    genres: [cat.name]
                })).filter((p: any) => p.id);
            } catch (e) {
                console.error(`Failed to fetch category ${cat.name}:`, e);
            }
        }
        setCategoryPodcasts(data);
    };

    const savePodcast = (pod: ITunesPodcast) => {
        const updated = [...myPodcasts, pod];
        setMyPodcasts(updated);
        localStorage.setItem('vibe_my_podcasts', JSON.stringify(updated));
    };

    const removePodcast = (id: string) => {
        const updated = myPodcasts.filter(p => p.id !== id);
        setMyPodcasts(updated);
        localStorage.setItem('vibe_my_podcasts', JSON.stringify(updated));
    };

    const isFollowing = (id: string) => myPodcasts.some(p => p.id === id);

    const searchApi = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(searchQuery)}&limit=20`);
            const data = await res.json();
            setSearchResults((data.results || []).filter((p: any) => p.collectionId).map((p: any) => ({
                id: String(p.collectionId),
                title: p.collectionName || '',
                artist: p.artistName || '',
                coverImage: p.artworkUrl600 || p.artworkUrl100 || '',
                feedUrl: p.feedUrl || '',
                genres: p.genres || []
            })));
        } catch (err) {
            console.error("iTunes search failed:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const openPodcast = async (pod: ITunesPodcast) => {
        setSelectedPodcast(pod);
        setEpisodes([]);
        setIsLoadingEpisodes(true);
        try {
            const res = await fetch(`https://itunes.apple.com/lookup?id=${pod.id}&media=podcast&entity=podcastEpisode&limit=50`);
            const data = await res.json();
            const eps = (data.results || []).slice(1)
                .filter((ep: any) => ep.episodeUrl)   // skip episodes with no streamable audio
                .map((ep: any) => ({
                    id: String(ep.trackId),
                    title: ep.trackName || 'Untitled Episode',
                    description: ep.description || '',
                    audioUrl: ep.episodeUrl as string,
                    duration: Math.floor((ep.trackTimeMillis || 0) / 1000),
                    releaseDate: ep.releaseDate || '',
                    imageUrl: ep.artworkUrl600 || ep.artworkUrl160 || pod.coverImage
                }));
            setEpisodes(eps);
        } catch (err) {
            console.error("Failed to load episodes:", err);
        } finally {
            setIsLoadingEpisodes(false);
        }
    };

    const formatDuration = (seconds: number) => {
        if (!seconds) return '--:--';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handlePlayEpisode = (ep: ITunesEpisode) => {
        if (!selectedPodcast) return;

        // Toggle pause/resume when tapping an already-playing episode
        if (currentTrack?.id === ep.id) {
            togglePlay();
            return;
        }

        // Build the full episode list so next/prev navigation works in the global player
        const allTracks: Track[] = episodes.map(e => ({
            id: e.id,
            title: e.title,
            url: e.audioUrl,
            artist: selectedPodcast.artist,
            duration: e.duration,
            images: e.imageUrl ? [e.imageUrl] : [selectedPodcast.coverImage],
        }));

        const album: Album = {
            id: selectedPodcast.id,
            title: selectedPodcast.title,
            description: selectedPodcast.artist,
            artist: selectedPodcast.artist,
            coverImage: selectedPodcast.coverImage,
            tracks: allTracks,
            createdAt: Date.now(),
            type: 'MUSIC',
            subType: 'PODCAST',
            themeColor: '#FF8C00',
        };

        const track = allTracks.find(t => t.id === ep.id) ?? allTracks[0];
        playTrack(track, album, 'LIBRARY');
    };

    if (selectedPodcast) {
        return (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
                <button onClick={() => setSelectedPodcast(null)} className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                    <ChevronLeft size={16} /> Back to Directory
                </button>
                
                <div className="flex flex-col md:flex-row gap-6 sm:gap-8 bg-white/5 backdrop-blur-xl p-6 sm:p-8 lg:p-12 rounded-[3.5rem] border border-white/10 items-center md:items-start text-center md:text-left">
                    <img
                        src={selectedPodcast.coverImage || undefined}
                        className="w-48 md:w-64 aspect-square rounded-[3rem] shadow-2xl border border-white/10"
                        alt={selectedPodcast.title}
                        referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 space-y-6">
                        <div>
                            <h2 className="text-3xl lg:text-6xl font-black uppercase tracking-tightest leading-none mb-4">{selectedPodcast.title}</h2>
                            <p className="text-xl font-bold text-small-orange uppercase tracking-widest leading-relaxed">{selectedPodcast.artist}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                            {selectedPodcast.genres.map(g => (
                                <span key={g} className="px-4 py-1.5 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest opacity-60">{g}</span>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 pt-4 justify-center md:justify-start">
                            {isFollowing(selectedPodcast.id) ? (
                                <button onClick={() => removePodcast(selectedPodcast.id)} className="flex items-center gap-3 px-8 py-4 bg-white/10 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 hover:text-red-500 transition-all">
                                    <Check size={16} /> Following
                                </button>
                            ) : (
                                <button onClick={() => savePodcast(selectedPodcast)} className="flex items-center gap-3 px-8 py-4 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-110 active:scale-95 transition-all shadow-xl">
                                    <Plus size={16} /> Follow Broadcast
                                </button>
                            )}
                            {selectedPodcast.feedUrl && (
                                <a href={selectedPodcast.feedUrl} target="_blank" rel="noreferrer" className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-2xl hover:bg-white/10 transition-all opacity-40 hover:opacity-100" title="RSS Feed">
                                    <Rss size={18} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="h-px flex-1 bg-white/5" />
                        <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-40">Recent Transmissions</h3>
                        <div className="h-px flex-1 bg-white/5" />
                    </div>
                    {isLoadingEpisodes ? (
                        <div className="py-20 text-center">
                            <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                            <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-20">Scanning Frequencies...</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {episodes.map((ep, idx) => (
                                <motion.div 
                                    key={ep.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="p-4 sm:p-6 bg-white/5 hover:bg-white/[0.08] border border-white/5 rounded-[2rem] transition-all group relative overflow-hidden"
                                >
                                    <div className="flex gap-4 sm:gap-8 items-center relative z-10">
                                        <button 
                                            onClick={() => handlePlayEpisode(ep)}
                                            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shrink-0 hover:scale-110 active:scale-90 transition-all shadow-2xl"
                                        >
                                            {currentTrack?.id === ep.id && isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} className="ml-1" fill="currentColor" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-lg font-black uppercase tracking-tight mb-2 truncate ${currentTrack?.id === ep.id ? 'text-small-orange' : ''}`}>{ep.title}</h4>
                                            <p className="text-xs opacity-40 font-medium line-clamp-1 mb-4 leading-relaxed">{ep.description?.replace(/<[^>]+>/g, '').trim() || 'No description available for this episode.'}</p>
                                            <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest opacity-20">
                                                {ep.releaseDate && !isNaN(new Date(ep.releaseDate).getTime()) && (
                                              <span className="flex items-center gap-2"><Calendar size={12} className="text-small-orange" /> {new Date(ep.releaseDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                            )}
                                                <span className="flex items-center gap-2"><Clock size={12} className="text-small-orange" /> {formatDuration(ep.duration)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {currentTrack?.id === ep.id && (
                                        <div className="absolute inset-0 bg-small-orange/5 pointer-events-none" />
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        );
    }


    return (
        <div className="flex flex-col xl:flex-row h-full relative overflow-hidden bg-transparent">
            {/* Main Content Area - Independent Scroll */}
            <div className={`flex-1 min-h-0 xl:h-full overflow-y-auto ${theme === 'LIGHT' ? 'scrollbar-light' : 'no-scrollbar'} scroll-smooth relative`}>
                <div className="space-y-12 sm:space-y-24 pb-32 min-w-0">
                    {/* Sticky Search Header */}
                    <header className="sticky top-0 z-[60] p-4 lg:p-8 bg-transparent pointer-events-none">
                        <div className="max-w-4xl mx-auto pointer-events-auto">
                            <form onSubmit={searchApi} className="flex flex-col sm:flex-row gap-4 bg-black/40 backdrop-blur-3xl p-3 lg:p-4 rounded-full border border-white/10 shadow-2xl">
                                <div className="relative flex-1 group">
                                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 group-focus-within:text-small-orange transition-all" size={20} />
                                    <input 
                                        type="text" 
                                        value={searchQuery} 
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search Frequencies..."
                                        className="w-full bg-white/[0.05] border border-white/10 rounded-full py-3 lg:py-4 pl-14 pr-8 text-sm font-bold text-inherit placeholder:opacity-20 focus:outline-none focus:border-small-orange/50 transition-all font-display"
                                    />
                                </div>
                                <button 
                                    type="submit"
                                    disabled={isSearching || !searchQuery.trim()}
                                    className="px-8 py-3 lg:py-4 bg-white text-black disabled:opacity-50 rounded-full text-[10px] font-black uppercase tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-3xl shrink-0"
                                >
                                    {isSearching ? 'Syncing...' : 'Broadcast Search'}
                                </button>
                            </form>
                        </div>
                    </header>

                    {/* Hero section with fade effect on scroll boundary */}
                    <motion.section 
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="relative p-6 sm:p-8 lg:p-20 rounded-[4rem] overflow-hidden border border-white/5 shadow-3xl bg-black/20 backdrop-blur-3xl m-4 -mt-20"
                    >
                        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-small-orange/10 blur-[150px] rounded-full -mr-20 -mt-20 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full -ml-20 -mb-20 pointer-events-none" />
                        
                        <div className="relative z-10 max-w-4xl space-y-8">
                            <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-1 bg-small-orange" />
                                    <span className="text-xs font-black uppercase tracking-[0.4em] text-small-orange">Archive Discover</span>
                                </div>
                                <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl xl:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Podcast Universe</h1>
                                <p className="text-xs sm:text-sm lg:text-base opacity-40 font-medium uppercase tracking-widest leading-relaxed max-w-2xl mt-4">Access millions of frequencies, voices, and stories directly from the archive.</p>
                            </div>
                        </div>
                    </motion.section>

                    <div className="px-4 sm:px-8 lg:px-12 space-y-16 sm:space-y-32">
                        {/* Podcast Categories */}
                        <section className="space-y-8">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <List className="text-small-orange" size={24} />
                                    <h3 className="text-2xl font-black uppercase tracking-tighter">Categories</h3>
                                </div>
                                <div className="h-px flex-1 bg-white/5 mx-8 hidden lg:block" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map((cat, idx) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => {
                                            setSearchQuery(cat.name);
                                            searchApi({ preventDefault: () => {} } as any);
                                        }}
                                        className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-white/5 hover:bg-white/10 active:bg-small-orange/20 border border-white/5 hover:border-small-orange/30 rounded-full transition-all"
                                    >
                                        <span className="text-base leading-none">{cat.icon}</span>
                                        <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Results Section */}
                        <AnimatePresence>
                            {searchResults.length > 0 && (
                                <PodcastGrid title="Search Results" podcasts={searchResults} icon={Globe} onOpen={openPodcast} />
                            )}
                        </AnimatePresence>

                        {/* Top 10 Charts */}
                        {isLoadingTop ? (
                             <div className="py-20 text-center">
                                <div className="w-20 h-20 border-8 border-white/5 border-t-small-orange rounded-full animate-spin mx-auto mb-8 shadow-2xl" />
                                <p className="text-[10px] font-black uppercase tracking-[0.6em] opacity-20">Establishing Connection...</p>
                             </div>
                        ) : (
                            <PodcastGrid title="Top Frequencies" podcasts={topPodcasts} icon={TrendingUp} onOpen={openPodcast} />
                        )}
                        
                        {nativePodcasts.length > 0 && (
                            <section className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <Radio className="text-small-orange" size={24} />
                                        <h3 className="text-2xl font-black uppercase tracking-tighter">Platform Originals</h3>
                                    </div>
                                    <div className="h-px flex-1 bg-white/5 mx-8 hidden lg:block" />
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-30 whitespace-nowrap">Community Voice</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-4 md:gap-6 xl:gap-8">
                                    {nativePodcasts.map((p) => (
                                        <div
                                            key={p.id}
                                            onClick={() => {
                                                const event = new CustomEvent('NAVIGATE', {
                                                    detail: { target: 'SANCTUARY', params: { artistId: p.id } }
                                                });
                                                window.dispatchEvent(event);
                                            }}
                                            className="group cursor-pointer"
                                        >
                                            <div className="relative aspect-square rounded-[2.5rem] overflow-hidden mb-6 shadow-2xl border border-white/5 group-hover:border-small-orange/40 transition-all duration-500">
                                                <img
                                                    src={p.coverImage || undefined}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                                                    alt={p.title}
                                                    loading="lazy"
                                                />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                                                    <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-500"><Play size={24} className="ml-1" fill="currentColor" /></div>
                                                </div>
                                            </div>
                                            <h4 className="font-black text-sm uppercase tracking-tight truncate mb-1 group-hover:text-small-orange transition-colors">{p.title}</h4>
                                            <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] truncate">{p.artist}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Category Discovery Categories List */}
                        <div className="space-y-16 sm:space-y-32">
                            {Object.entries(categoryPodcasts).map(([catName, pods]) => (
                                <PodcastGrid key={catName} title={catName} podcasts={pods} icon={Grid} onOpen={openPodcast} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Independent Sidebar Scroll */}
            <aside className={`w-full xl:w-[280px] xl:h-full overflow-y-auto no-scrollbar xl:border-l border-t xl:border-t-0 border-white/5 flex flex-col shrink-0 ${theme === 'LIGHT' ? 'bg-white' : 'bg-transparent'}`}>
                <div className="p-6 lg:p-8 space-y-12 pb-40">
                    {/* Your Archive Section shifted to Sidebar */}
                    <section className="p-6 bg-white/[0.03] border border-white/10 rounded-[2rem] relative overflow-hidden group hover:border-small-orange/30 transition-colors shadow-lg">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                            <Mic size={48} />
                        </div>
                        <div className="relative z-10 space-y-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-small-orange/20 flex items-center justify-center text-small-orange shadow-inner">
                                    <Mic size={24} />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tightest">Your Archive</h3>
                            </div>

                            {myPodcasts.length === 0 ? (
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 leading-loose">Start exploring the directory to follow your first frequencies.</p>
                            ) : (
                                <div className="flex flex-col gap-6">
                                    {myPodcasts.map(p => (
                                        <div key={p.id} onClick={() => openPodcast(p)} className="group cursor-pointer flex items-center gap-4">
                                            <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-xl shrink-0 border border-white/5">
                                                <img src={p.coverImage || null} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" alt={p.title} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-black text-[10px] uppercase tracking-tight truncate group-hover:text-small-orange transition-colors">{p.title}</h4>
                                                <p className="text-[8px] font-bold opacity-30 uppercase truncate">{p.artist}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Trending Topics / Categories sidebar */}
                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-2 text-inherit mb-4">
                             <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Frequency Channels</h3>
                             <Grid size={14} className="opacity-20" />
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {CATEGORIES.map(cat => (
                                <button key={cat.id} className="flex items-center justify-between w-full p-6 bg-white/[0.02] hover:bg-white/5 border border-white/5 rounded-[2rem] transition-all group shadow-sm hover:shadow-xl hover:border-small-orange/20">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">{cat.icon}</div>
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100">{cat.name}</span>
                                    </div>
                                    <TrendingUp size={12} className="opacity-0 group-hover:opacity-100 text-small-orange transition-all" />
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Signal Status */}
                    <section className="p-6 sm:p-8 border border-white/5 rounded-[3rem] bg-black/40 shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-small-orange/5 blur-3xl rounded-full" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">System Status</span>
                            </div>
                            <div className="space-y-4">
                                <p className="text-[9px] font-bold text-white/20 uppercase leading-relaxed">Broadcast uplink established. Universal archive accessible via multi-spectral scan.</p>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-small-orange shadow-[0_0_15px_rgba(255,140,0,0.5)]"
                                        animate={{ width: ['20%', '90%', '40%', '75%'] }}
                                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </aside>
        </div>
    );
};

