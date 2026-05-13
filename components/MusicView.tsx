import React, { useState, useEffect, useRef } from 'react';
import { Album, Track, UserProfile, Playlist } from '../types';
import PageHeader from './PageHeader';
import { 
  Play, Pause, SkipForward, SkipBack, Heart, Share2, 
  Radio, Music2, Mic2, Disc, Star, TrendingUp, 
  ChevronLeft, ChevronRight, PlayCircle, User,
  ListMusic, Sparkles, Clock, Zap, BookOpen, Headphones, VideoIcon, LayoutGrid,
  Filter, ArrowUpDown, Archive, History, Library, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchAllPublicAlbums, fetchUserProfile, searchUsers, fetchSystemSettingsConfig, fetchPlaylistsByIds, syncPublicDomainAsset } from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import MyLibraryView from './MyLibraryView';
import FeaturedCarousel from './FeaturedCarousel';
import ThreeDImage from './ThreeDImage';
import { PodcastsView } from './PodcastsView';
import { fetchArchiveMusic, fetchWikimediaAudio, fetchJamendoMusic, fetchArchiveAudiobooks, fetchArchivePodcasts, ArchiveTrack } from '../services/archiveContentService';

type TabType = 'NEW' | 'FOR_YOU' | 'ARTISTS' | 'ALBUMS' | 'GENRES' | 'VAULT' | 'PODCASTS' | 'AUDIO_BOOKS' | 'MY_LIBRARY' | 'PLAYLISTS';

interface MusicViewProps {
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onVisitUser: (uid: string, initialTab?: string) => void;
  userProfile: UserProfile | null;
  initialTab?: TabType;
}

const MusicView: React.FC<MusicViewProps> = ({ onBack, onSelectAlbum, onVisitUser, userProfile, initialTab }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<UserProfile[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>([]);
  const [vaultTracks, setVaultTracks] = useState<ArchiveTrack[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'NEW');
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'RECENT' | 'ALPHA'>('RECENT');
  const [vaultSource, setVaultSource] = useState<'ALL' | 'INTERNET_ARCHIVE' | 'WIKIMEDIA' | 'JAMENDO'>('ALL');
  const [vaultCategory, setVaultCategory] = useState<'ALL' | 'JAZZ' | 'CLASSICAL' | 'AUDIOBOOKS' | 'PODCASTS'>('ALL');
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [selectedArchiveArtist, setSelectedArchiveArtist] = useState<string | null>(null);
  const { playTrack, isPlaying, currentTrack, theme } = useGlobalPlayerState();

  useEffect(() => {
    const loadVault = async () => {
      try {
        let tracks: ArchiveTrack[] = [];
        if (vaultCategory === 'JAZZ') {
          tracks = await fetchArchiveMusic('Jazz', 40);
        } else if (vaultCategory === 'CLASSICAL') {
          tracks = await fetchArchiveMusic('Classical', 40);
        } else if (vaultCategory === 'AUDIOBOOKS') {
          tracks = await fetchArchiveAudiobooks(40);
        } else if (vaultCategory === 'PODCASTS') {
          tracks = await fetchArchivePodcasts(40);
        } else {
          const [ia, wiki, jam] = await Promise.all([
            fetchArchiveMusic('All', 20),
            fetchWikimediaAudio('Classical', 20),
            fetchJamendoMusic(20)
          ]);
          tracks = [...ia, ...wiki, ...jam];
        }
        setVaultTracks(tracks.sort(() => Math.random() - 0.5));
      } catch (err) {
        console.error("Vault load error:", err);
      }
    };
    if (activeTab === 'VAULT') loadVault();
  }, [activeTab, vaultCategory]);

  const getThemeStyles = () => {
    switch (theme) {
      case 'LIGHT':
        return { nav: 'bg-white/80 border-black/5 text-black', tabActive: 'text-small-orange border-small-orange', tabInactive: 'text-black/30 hover:text-black/60', heading: 'text-black', subtext: 'text-black/40' };
      case 'PASTEL':
        return { nav: 'bg-[#eee8d5]/80 border-black/5 text-[#073642]', tabActive: 'text-[#2aa198] border-[#2aa198]', tabInactive: 'text-[#073642]/30 hover:text-[#073642]/60', heading: 'text-[#073642]', subtext: 'text-[#073642]/40' };
      case 'PLAJAH':
        return { nav: 'bg-[#1a0026]/80 border-white/5 text-white', tabActive: 'text-small-orange border-small-orange', tabInactive: 'text-white/20 hover:text-white/40', heading: 'text-white', subtext: 'text-white/40' };
      case 'ETHEREAL':
        return { nav: 'bg-[#131314]/80 border-purple-500/20 text-white', tabActive: 'text-[#d0bcff] border-[#d0bcff]', tabInactive: 'text-white/20 hover:text-white/40', heading: 'text-white', subtext: 'text-white/40' };
      case 'CITRUS':
        return { nav: 'bg-black/90 border-[#FF3B00]/20 text-white', tabActive: 'text-[#FF3B00] border-[#FF3B00]', tabInactive: 'text-white/40 hover:text-[#FF3B00]', heading: 'text-white', subtext: 'text-white/40' };
      default:
        return { nav: 'bg-[#050505]/80 border-white/5 text-white', tabActive: 'text-small-orange border-small-orange', tabInactive: 'text-white/20 hover:text-white/40', heading: 'text-white', subtext: 'text-white/40' };
    }
  };

  const s = getThemeStyles();
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [publicAlbums, allUsers, settings] = await Promise.all([
          fetchAllPublicAlbums(),
          searchUsers(''),
          fetchSystemSettingsConfig()
        ]);
        setAlbums(publicAlbums.filter(a => (a.type || 'MUSIC') === 'MUSIC'));
        setArtists(allUsers.filter(u => u.isArtist));

        if (settings.curatedMusicPlaylists && settings.curatedMusicPlaylists.length > 0) {
          const playlists = await fetchPlaylistsByIds(settings.curatedMusicPlaylists);
          setCuratedPlaylists(playlists);
        }
      } catch (error) {
        console.error("Failed to load music data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const genres = ['Hip Hop', 'R&B', 'Electronic', 'Jazz', 'Rock', 'Pop', 'Lo-Fi', 'Ambient', 'Classical', 'Folk', 'World'];

  const getSortedAlbums = () => {
    let sorted = [...albums];
    if (sortOrder === 'ALPHA') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return sorted;
  };

  const getSortedArtists = () => {
    let sorted = [...artists];
    if (sortOrder === 'ALPHA') {
      sorted.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    } else {
      sorted.sort((a, b) => ((b.createdAt || b.joinedAt || 0) as number) - ((a.createdAt || a.joinedAt || 0) as number));
    }
    return sorted;
  };

  const handlePlayVaultTrack = (track: ArchiveTrack) => {
    // Automagically clone it to platform
    syncPublicDomainAsset(track, track.url, 'AUDIO');

    const vaultTrack: Track = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      url: track.url,
      albumCover: track.thumbnailUrl,
      images: [track.thumbnailUrl],
      genre: track.genre,
      isGlobalArchive: true
    };
    const vaultAlbum: Album = {
      id: `vault_${track.source}_${track.id}`,
      title: 'The Vault Archive',
      artist: track.artist,
      coverImage: track.thumbnailUrl,
      tracks: [vaultTrack],
      createdAt: Date.now(),
      themeColor: '#ff8c00',
      description: `Public domain recording from ${track.source}.`
    };
    playTrack(vaultTrack, vaultAlbum, 'RADIO');
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">Accessing Archives...</p>
        </div>
      </div>
    );
  }

  const renderVault = () => {
    let filteredVault = vaultSource === 'ALL' ? vaultTracks : vaultTracks.filter(t => t.source === vaultSource);
    if (vaultSearchQuery) {
      const query = vaultSearchQuery.toLowerCase();
      filteredVault = filteredVault.filter(t => 
        t.title.toLowerCase().includes(query) || 
        t.artist.toLowerCase().includes(query)
      );
    }
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="shrink-0">
            <PageHeader wrapperClassName="mb-12">The Vault</PageHeader>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2 px-1">Public Domain & Historical Archives</p>
          </div>

          <div className="flex-1 max-w-sm">
            <div className="flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl">
              <Search size={16} className="text-white/20" />
              <input 
                type="text" 
                placeholder="Search Archive Artists & Tracks..." 
                value={vaultSearchQuery}
                onChange={(e) => setVaultSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs font-bold w-full placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['ALL', 'JAZZ', 'CLASSICAL', 'AUDIOBOOKS', 'PODCASTS'] as const).map(cat => (
                <button 
                  key={cat}
                  onClick={() => setVaultCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${vaultCategory === cat ? 'bg-small-orange border-small-orange text-black' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['ALL', 'INTERNET_ARCHIVE', 'WIKIMEDIA', 'JAMENDO'] as const).map(source => (
                <button 
                  key={source}
                  onClick={() => setVaultSource(source)}
                  className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${vaultSource === source ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  {source.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredVault.map(track => (
            <motion.div 
              key={track.id}
              whileHover={{ y: -5 }}
              className="group bg-white/[0.03] border border-white/5 rounded-3xl p-4 transition-all hover:bg-white/[0.08]"
            >
              <div className="aspect-square rounded-2xl overflow-hidden mb-4 relative" onClick={() => handlePlayVaultTrack(track)}>
                <img src={track.thumbnailUrl || null} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <div className="w-12 h-12 rounded-full bg-small-orange flex items-center justify-center text-black">
                    <Play size={24} fill="currentColor" className="ml-1" />
                  </div>
                </div>
                <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[7px] font-black uppercase tracking-widest">
                  {track.source.split('_')[0]}
                </div>
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest truncate mb-1">{track.title}</h4>
              <button 
                onClick={() => setSelectedArchiveArtist(track.artist)}
                className="text-[9px] font-bold text-white/40 uppercase tracking-widest hover:text-small-orange transition-colors"
              >
                {track.artist}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  const renderArchiveArtistInfo = () => {
    const artistTracks = vaultTracks.filter(t => t.artist === selectedArchiveArtist);
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        <button 
          onClick={() => setSelectedArchiveArtist(null)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} /> Back to Vault
        </button>

        <div className="flex flex-col md:flex-row gap-12 items-center md:items-end p-12 bg-white/[0.03] rounded-[3rem] border border-white/5">
          <div className="w-64 h-64 rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-3xl shrink-0 bg-black">
            <img src={artistTracks[0]?.thumbnailUrl || null} className="w-full h-full object-cover opacity-50" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
              <Archive className="text-small-orange" size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-small-orange">Archive Artist</span>
            </div>
            <PageHeader>{selectedArchiveArtist}</PageHeader>
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest max-w-xl">
              This is a historical archive artist. Their works are part of the public domain or Creative Commons, preserved in the global vault.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-8">Works in Archive ({artistTracks.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {artistTracks.map(track => (
              <div key={track.id} className="group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/5 bg-black">
                  <img src={track.thumbnailUrl || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h4>
                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Public Domain</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex-1 bg-transparent text-white overflow-y-auto custom-scrollbar pb-40 relative">
      <div className="flex flex-col h-full">
        <div className="flex-1 min-w-0">
          <div className="px-6 lg:px-12 pt-8 mb-6">
            <PageHeader>Music</PageHeader>
          </div>
          <nav className={`px-6 lg:px-12 mb-12 sticky top-0 backdrop-blur-2xl bg-black/40 border-b border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] z-40 py-4 ${s.nav} transition-all duration-500`}>
            <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
              {(['NEW', 'FOR_YOU', 'ARTISTS', 'ALBUMS', 'GENRES', 'VAULT', 'PODCASTS', 'AUDIO_BOOKS', 'MY_LIBRARY', 'PLAYLISTS'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setSelectedArchiveArtist(null); }}
                  className={`text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap transition-all pb-2 border-b-2 ${activeTab === tab ? 'text-small-orange border-small-orange' : s.tabInactive}`}
                >
                  {tab === 'VAULT' ? 'The Vault' : tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </nav>
          {activeTab === 'NEW' && !selectedArchiveArtist && (
            <div className="px-6 lg:px-12 pt-8 mb-6">
              <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">New</h1>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-12">
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Recent Releases</h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                    {albums.slice(0, 8).map((album) => (
                      <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-3 border border-white/5 shadow-2xl relative">
                          <ThreeDImage src={album.coverImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <PlayCircle size={48} className="text-small-orange" />
                          </div>
                        </div>
                        <h4 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h4>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Discover Artists</h2>
                  </div>
                  <FeaturedCarousel items={artists.slice(0, 5).map(artist => ({ id: artist.uid, title: artist.displayName, subtitle: "Featured Artist", imageUrl: artist.coverArt || artist.featuredArtistPhoto || artist.photoURL || `https://picsum.photos/seed/${artist.uid}/1280/720`, onClick: () => onVisitUser(artist.uid, 'CONTENT') }))} />
                </section>
                
                {curatedPlaylists.length > 0 && (
                  <section className="animate-in fade-in duration-700">
                    <div className="flex items-center gap-3 mb-6">
                      <Sparkles className="text-small-orange" size={20} />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Staff Pick Playlists</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {curatedPlaylists.map(pl => (
                        <button 
                          key={pl.id} 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectAlbum({
                              id: pl.id,
                              ownerId: pl.ownerId,
                              title: pl.title,
                              artist: pl.authorName || 'Curator',
                              coverImage: pl.coverImage || '',
                              tracks: pl.tracks || [],
                              type: 'MUSIC',
                              subType: 'PLAYLIST',
                              createdAt: pl.timestamp,
                              isPublic: true
                            } as any);
                          }}
                          className="group text-left cursor-pointer p-3 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all"
                        >
                           <div className="aspect-square rounded-2xl overflow-hidden mb-4 bg-black/40 flex items-center justify-center p-4 group-hover:scale-[1.02] transition-transform">
                              {pl.coverImage ? (
                                  <img src={pl.coverImage || null} className="w-full h-full object-cover rounded-xl pointer-events-none" />
                              ) : (
                                  <ListMusic size={32} className="text-white/10 group-hover:text-small-orange transition-colors" />
                              )}
                           </div>
                           <h4 className="text-xs font-black uppercase tracking-widest truncate mb-1">{pl.title}</h4>
                           <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">by {pl.authorName}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-8 flex flex-col">
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[2rem]">
                  <div className="flex items-center gap-2 mb-6">
                    <Zap className="text-small-orange" size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">New on Platform</h3>
                  </div>
                  <div className="space-y-4">
                    {artists.slice(5, 10).map((artist) => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="flex items-center gap-4 group cursor-pointer">
                        <img src={artist.photoURL || `https://picsum.photos/seed/${artist.uid}/200/200`} className="w-12 h-12 rounded-full object-cover group-hover:ring-2 ring-small-orange/50 transition-all" />
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest group-hover:text-small-orange transition-colors">{artist.displayName}</h4>
                          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">New Artist</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[2rem] flex-1">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-6 text-white/40">Trending / Top Charts</h3>
                  
                  <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-4">Top Creators</h4>
                  <div className="space-y-4 mb-8">
                    {getSortedArtists().slice(0, 3).map((artist, idx) => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="flex items-center gap-4 group cursor-pointer">
                        <span className="text-lg font-black text-white/20">{idx + 1}</span>
                        <img src={artist.photoURL || null} className="w-10 h-10 rounded-full object-cover" />
                        <div className="flex-1 truncate">
                          <h5 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{artist.displayName}</h5>
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{artist.followerCount} Fans</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-4">Top Songs</h4>
                  <div className="space-y-4">
                    {albums.flatMap(a => a.tracks || []).slice(0, 5).map((track, idx) => (
                       <div key={track.id} onClick={() => playTrack(track, albums.find(a => a.tracks?.some(t => t.id === track.id)) || null, 'LIBRARY')} className="flex items-center gap-4 group cursor-pointer">
                         <span className="text-lg font-black text-white/20">{idx + 1}</span>
                         <img src={track.images?.[0] || track.albumCover || null} className="w-10 h-10 rounded-xl object-cover" />
                         <div className="flex-1 truncate">
                           <h5 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{track.title}</h5>
                           <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{track.artist}</span>
                         </div>
                       </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}

          {activeTab === 'FOR_YOU' && !selectedArchiveArtist && userProfile && (
             <div className="px-6 lg:px-12 pt-8 mb-6 space-y-12 animate-in fade-in">
               <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">For You</h1>
               <section>
                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">From Authors You Follow</h2>
                 <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                   {albums.filter(a => userProfile.following?.includes(a.ownerId || '')).map((album) => (
                     <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-3 border border-white/5 shadow-xl relative">
                          <ThreeDImage src={album.coverImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{album.title}</h4>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
                     </div>
                   ))}
                 </div>
               </section>

               <section>
                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-6">Suggested Creators</h2>
                 <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 mask-fade-edges">
                    {artists.filter(a => !userProfile.following?.includes(a.uid)).slice(0, 10).map(artist => (
                      <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="min-w-[140px] text-center group cursor-pointer flex-shrink-0">
                         <div className="aspect-square rounded-full overflow-hidden mb-4 border-2 border-white/5 p-1 relative">
                            <img src={artist.photoURL || null} className="w-full h-full object-cover rounded-full group-hover:scale-110 transition-transform" />
                         </div>
                         <h4 className="text-[10px] font-black uppercase tracking-widest truncate">{artist.displayName}</h4>
                         <span className="text-[8px] font-bold text-small-orange uppercase tracking-widest bg-small-orange/10 px-2 py-1 rounded-full mt-2 inline-block">Recommended</span>
                      </div>
                    ))}
                 </div>
               </section>
             </div>
          )}

          <div className="px-6 lg:px-12 space-y-16">
            {selectedArchiveArtist ? renderArchiveArtistInfo() : (
              <>
                {activeTab === 'PODCASTS' && <PodcastsView />}
                {activeTab === 'VAULT' && renderVault()}
                
                {activeTab === 'PLAYLISTS' && (
                  <section className="animate-in fade-in duration-500">
                     <div className="flex items-center justify-between mb-12">
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Curated Playlists</h1>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                      {curatedPlaylists.map(pl => (
                        <div 
                          key={pl.id} 
                          onClick={() => {
                            onSelectAlbum({
                              id: pl.id,
                              ownerId: pl.ownerId,
                              title: pl.title,
                              artist: pl.authorName || 'Curator',
                              coverImage: pl.coverImage || '',
                              tracks: pl.tracks || [],
                              type: 'MUSIC',
                              subType: 'PLAYLIST',
                              createdAt: pl.timestamp,
                              isPublic: true
                            } as any);
                          }}
                          className="group cursor-pointer p-4 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all text-center"
                        >
                           <div className="aspect-square rounded-2xl overflow-hidden mb-4 bg-black/40 flex items-center justify-center p-4 group-hover:scale-[1.02] transition-transform">
                              {pl.coverImage ? (
                                  <img src={pl.coverImage || null} className="w-full h-full object-cover rounded-xl" />
                              ) : (
                                  <ListMusic size={48} className="text-white/10 group-hover:text-small-orange transition-colors" />
                              )}
                           </div>
                           <h4 className="text-sm font-black uppercase tracking-widest truncate mb-2">{pl.title}</h4>
                           <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">by {pl.authorName}</p>
                           <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-2">{pl.tracks?.length || 0} Tracks</p>
                        </div>
                      ))}
                    </div>
                    {curatedPlaylists.length === 0 && (
                      <div className="p-12 text-center border-dashed border border-white/10 rounded-[2rem] bg-white/5">
                        <Sparkles size={32} className="mx-auto text-white/20 mb-4" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/40">No curated playlists yet</h3>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'ARTISTS' && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center justify-between mb-12">
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Artists</h1>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setSortOrder(sortOrder === 'RECENT' ? 'ALPHA' : 'RECENT')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                          <ArrowUpDown size={16} />
                          <span className="text-[9px] font-black uppercase tracking-widest">{sortOrder === 'RECENT' ? 'Recently Joined' : 'Alphabetical'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                      {getSortedArtists().map(artist => (
                        <div key={artist.uid} onClick={() => onVisitUser(artist.uid, 'CONTENT')} className="group cursor-pointer text-center">
                          <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 border border-white/5 relative">
                            <img src={artist.photoURL || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <User size={32} className="text-white" />
                            </div>
                          </div>
                          <h4 className="text-xs font-black uppercase tracking-widest truncate">{artist.displayName}</h4>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{artist.followerCount} Fans</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activeTab === 'ALBUMS' && (
                  <section className="animate-in fade-in duration-500">
                     <div className="flex items-center justify-between mb-12">
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Albums</h1>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setSortOrder(sortOrder === 'RECENT' ? 'ALPHA' : 'RECENT')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                          <ArrowUpDown size={16} />
                          <span className="text-[9px] font-black uppercase tracking-widest">{sortOrder === 'RECENT' ? 'Newest First' : 'Alphabetical'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                      {getSortedAlbums().map(album => (
                        <div key={album.id} onClick={() => onSelectAlbum(album)} className="group cursor-pointer">
                          <div className="aspect-square rounded-3xl overflow-hidden mb-4 shadow-2xl border border-white/5">
                            <ThreeDImage src={album.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          </div>
                          <h4 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h4>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{album.artist}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activeTab === 'GENRES' && (
                  <section className="animate-in fade-in duration-500">
                    <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Genres</h1>
                    <div className="space-y-16">
                      {genres.map(genre => {
                        const genreAlbums = albums.filter(a => a.genre?.toLowerCase() === genre.toLowerCase()).sort((a,b) => b.createdAt - a.createdAt);
                        const vaultGenre = vaultTracks.filter(t => t.genre?.toLowerCase().includes(genre.toLowerCase())).slice(0, 5);
                        
                        return (
                          <div key={genre}>
                            <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                              <h3 className="text-xl font-black uppercase tracking-tightest">{genre}</h3>
                              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{genreAlbums.length + vaultGenre.length} Items</span>
                            </div>
                            
                            {(genreAlbums.length > 0 || vaultGenre.length > 0) ? (
                              <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 -mx-6 px-6">
                                {genreAlbums.map(album => (
                                  <div key={album.id} onClick={() => onSelectAlbum(album)} className="min-w-[150px] group cursor-pointer">
                                    <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/10 shadow-xl">
                                      <img src={album.coverImage || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                    </div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{album.title}</h5>
                                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Platform</p>
                                  </div>
                                ))}
                                {vaultGenre.map(track => (
                                  <div key={track.id} className="min-w-[150px] group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                                    <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-white/10 shadow-xl opacity-60">
                                      <img src={track.thumbnailUrl || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                    </div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</h5>
                                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Vault</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-8 bg-white/[0.02] rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                                <Sparkles className="text-white/10 mb-4" size={32} />
                                <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-2">be the first here in that genre</p>
                                <button className="text-[9px] font-black uppercase tracking-widest text-small-orange hover:underline">Upload your project</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {activeTab === 'AUDIO_BOOKS' && (
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center justify-between mb-12">
                      <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">Audiobooks</h1>
                      <div className="p-2 px-4 bg-white/5 rounded-xl border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40">
                        Historical Archive
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                      {vaultTracks.filter(t => t.genre === 'Audiobook').map(track => (
                        <div key={track.id} className="group cursor-pointer" onClick={() => handlePlayVaultTrack(track)}>
                          <div className="aspect-[2/3] rounded-2xl overflow-hidden mb-4 shadow-2xl border border-white/5 relative">
                            <img src={track.thumbnailUrl || null} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                              <PlayCircle size={48} className="text-small-orange" />
                            </div>
                          </div>
                          <h4 className="text-xs font-black uppercase tracking-widest truncate">{track.title}</h4>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activeTab === 'MY_LIBRARY' && userProfile && <MyLibraryView profile={userProfile} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default MusicView;
