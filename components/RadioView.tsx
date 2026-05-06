import React, { useState, useEffect, useRef } from 'react';
import { Radio, Play, Pause, SkipForward, Heart, Plus, HeartHandshake, Volume2, Info, Share2, ChevronLeft, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Track, UserProfile, Album } from '../types';
import { fetchRadioTracks, likeTrack, addToLibrary, auth, processDonation, fetchUserProfile } from '../services/backendService';
import DonationModal from './DonationModal';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface RadioViewProps {
  onBack?: () => void;
  artistId?: string;
}

const RadioView: React.FC<RadioViewProps> = ({ onBack, artistId }) => {
  const { 
    currentTrack: globalTrack, 
    isPlaying: globalIsPlaying, 
    playTrack, 
    pause, 
    resume,
    audioSource
  } = useGlobalPlayerState();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [songCount, setSongCount] = useState(0);
  const [exclusiveTracks, setExclusiveTracks] = useState<Track[]>([]);
  const [isInterventionPlaying, setIsInterventionPlaying] = useState<boolean>(false);
  const [artistProfile, setArtistProfile] = useState<UserProfile | null>(null);
  const [artistStations, setArtistStations] = useState<UserProfile[]>([]);
  const [activeStationId, setActiveStationId] = useState<string | null>(artistId || null);

  useEffect(() => {
    const loadRadioContent = async () => {
      setLoading(true);
      try {
        if (activeStationId) {
          const profile = await fetchUserProfile(activeStationId);
          setArtistProfile(profile);
          
          const allTracks = await fetchRadioTracks();
          
          // Filter: Artist tracks first, then mix with otherCreators
          const artistTracks = allTracks.filter(t => t.artistId === activeStationId);
          
          // Add other creators' tracks if configured
          const otherCreatorIds = profile.radioSettings?.otherCreators || [];
          const collaboratorsTracks = allTracks.filter(t => otherCreatorIds.includes(t.artistId || ''));
          
          const exclusiveIds = profile.radioSettings?.exclusiveContentIds || [];
          const exclusive = allTracks.filter(t => exclusiveIds.includes(t.id));
          setExclusiveTracks(exclusive);
          
          const poolTracks = allTracks.filter(t => t.artistId !== activeStationId && !otherCreatorIds.includes(t.artistId || ''));
          
          const mixed = [...artistTracks, ...collaboratorsTracks, ...poolTracks.sort(() => Math.random() - 0.5)];
          setTracks(mixed);
          
          // Initial track
          const index = Math.floor(Date.now() / (3 * 60 * 1000)) % mixed.length;
          setCurrentTrack(mixed[index]);
        } else {
          const allTracks = await fetchRadioTracks();
          setTracks(allTracks);
          const index = Math.floor(Date.now() / (3 * 60 * 1000)) % allTracks.length;
          setCurrentTrack(allTracks[index]);
          setArtistProfile(null);
          setExclusiveTracks([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const loadDirectory = async () => {
      try {
        // In a real scenario, this would be a dedicated endpoint
        const tracks = await fetchRadioTracks();
        const artistIds = Array.from(new Set(tracks.map(t => t.artistId).filter(Boolean)));
        const profiles = await Promise.all(artistIds.map(id => fetchUserProfile(id!)));
        setArtistStations(profiles.filter(p => p.radioSettings?.enabled));
      } catch (err) {
        console.error(err);
      }
    };

    loadRadioContent();
    loadDirectory();
  }, [activeStationId]);

  const handlePlayPause = () => {
    if (currentTrack) {
      if (globalTrack?.id === currentTrack.id) {
        if (globalIsPlaying) pause();
        else resume();
      } else {
        const radioAlbum: Album = {
          id: activeStationId ? `artist_radio_${activeStationId}` : 'radio_station',
          title: artistProfile?.radioSettings?.stationName || (activeStationId ? `${artistProfile?.displayName}'s Radio` : 'Global Radio'),
          artist: artistProfile?.displayName || 'Public Station',
          coverImage: currentTrack.albumCover || 'https://images.unsplash.com/photo-1548502669-e09bd2363ee0?auto=format&fit=crop&q=80',
          tracks: tracks,
          description: activeStationId ? `Personalized broadcast for ${artistProfile?.displayName}` : 'Global Radio Station stream',
          themeColor: artistProfile?.radioSettings?.enabled ? '#00DAF3' : '#ff8c00',
          createdAt: Date.now()
        };
        playTrack(currentTrack, radioAlbum, 'RADIO');
      }
    }
  };

  const handleLike = async () => {
    if (currentTrack) {
      try {
        await likeTrack(currentTrack.albumId || 'radio_station', currentTrack.id);
        alert('Added to your likes!');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAddToLibrary = async () => {
    if (currentTrack) {
      try {
        await addToLibrary(currentTrack.id);
        alert('Track added to your library!');
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-theme text-white">
        <div className="relative">
          <div className="w-24 h-24 border-2 border-[#00DAF3]/20 rounded-full animate-ping absolute inset-0" />
          <div className="w-24 h-24 border-4 border-small-orange border-t-transparent rounded-full animate-spin relative z-10" />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.5em] animate-pulse">Tuning Frequency...</p>
      </div>
    );
  }

  const isCurrentTrackRadio = audioSource === 'RADIO' && globalTrack?.id === currentTrack?.id;

  return (
    <div className="h-full bg-transparent text-white overflow-hidden flex flex-col lg:flex-row">
      {/* Station Directory Sidebar */}
      <aside className="w-full lg:w-80 border-r border-white/5 bg-theme-card/30 flex flex-col h-1/3 lg:h-full">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-4">Radio Directory</h3>
          <button 
            onClick={() => setActiveStationId(null)}
            className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${!activeStationId ? 'bg-small-orange text-black' : 'hover:bg-white/5'}`}
          >
            <div className={`p-2 rounded-xl ${!activeStationId ? 'bg-theme-card/30' : 'bg-small-orange/20'}`}>
              <Radio size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-tight">Plajah FM</p>
              <p className={`text-[8px] font-bold uppercase tracking-widest ${!activeStationId ? 'text-black/60' : 'text-white/40'}`}>Global Stream</p>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {artistStations.map(station => (
            <button 
              key={station.uid}
              onClick={() => setActiveStationId(station.uid)}
              className={`w-full p-3 rounded-2xl flex items-center gap-4 transition-all ${activeStationId === station.uid ? 'bg-[#00DAF3] text-black' : 'hover:bg-white/5'}`}
            >
              <img src={station.photoURL || null} className="w-10 h-10 rounded-xl object-cover shrink-0" />
              <div className="text-left truncate">
                <p className="text-[11px] font-black uppercase tracking-tight truncate">{station.radioSettings?.stationName || `${station.displayName} Radio`}</p>
                <p className={`text-[8px] font-bold uppercase tracking-widest truncate ${activeStationId === station.uid ? 'text-black/60' : 'text-white/40'}`}>Artist Station</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Player */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Radio Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-theme-card/40 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="lg:hidden p-3 bg-white/5 rounded-2xl mr-2">
                <ChevronLeft size={20} />
              </button>
            )}
            <div className={`p-3 rounded-2xl ${activeStationId ? 'bg-[#00DAF3]/20 shadow-[0_0_20px_rgba(0,218,243,0.3)]' : 'bg-small-orange/20 shadow-[0_0_20px_rgba(255,140,0,0.3)]'}`}>
              <Radio className={activeStationId ? 'text-[#00DAF3]' : 'text-small-orange'} size={24} />
            </div>
            <div>
              <h1 className="text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
                {artistProfile?.radioSettings?.stationName || (activeStationId ? `${artistProfile?.displayName} Radio` : 'Plajah FM')}
              </h1>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-4">
                {activeStationId ? `Personalized artist broadcast` : 'Live Site-Wide Broadcast'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all ${activeStationId ? 'bg-[#00DAF3]/10 border-[#00DAF3]/20 text-[#00DAF3]' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${activeStationId ? 'bg-[#00DAF3]' : 'bg-red-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">On Air</span>
            </div>
            <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
              {tracks.length} Rotation
            </div>
          </div>
        </div>

        {/* Player Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-y-auto">
          <div className={`absolute inset-0 bg-gradient-to-b ${activeStationId ? 'from-[#00DAF3]/5' : 'from-small-orange/5'} to-transparent pointer-events-none`} />
          
          <AnimatePresence mode="wait">
            {currentTrack && (
              <motion.div 
                key={currentTrack.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="flex flex-col items-center text-center max-w-2xl w-full"
              >
                <div className="relative group mb-8 lg:mb-12">
                  <div className={`absolute -inset-4 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-700 ${activeStationId ? 'bg-[#00DAF3]/20' : 'bg-small-orange/20'}`} />
                    <div className="w-48 h-48 sm:w-64 sm:h-64 lg:w-80 lg:h-80 rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-3xl relative">
                    <img 
                      src={currentTrack.albumCover || currentTrack.images?.[0] || 'https://picsum.photos/seed/radio/800/800'} 
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                    {globalIsPlaying && isCurrentTrackRadio && (
                      <div className="absolute inset-0 bg-theme-card/60 flex items-center justify-center backdrop-blur-sm">
                        <div className="flex gap-1 items-end h-12">
                          {[1,2,3,4,5].map(i => (
                            <motion.div 
                              key={i}
                              animate={{ height: [10, 40, 20, 40, 10] }}
                              transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                              className={`w-1.5 rounded-full ${activeStationId ? 'bg-[#00DAF3]' : 'bg-small-orange'}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-3xl sm:text-4xl lg:text-6xl font-black uppercase tracking-tightest mb-4 leading-none break-words w-full">
                  {currentTrack.title}
                </h3>
                <p className={`text-lg sm:text-xl font-bold uppercase tracking-widest mb-8 lg:mb-12 ${activeStationId ? 'text-[#00DAF3]' : 'text-small-orange'}`}>
                  {currentTrack.artist}
                </p>

                <div className="flex items-center gap-6 lg:gap-8">
                  <button 
                    onClick={handleLike}
                    className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:scale-110 active:scale-95 transition-all text-white/40 hover:text-red-500"
                  >
                    <Heart size={24} />
                  </button>
                  
                  <button 
                    onClick={handlePlayPause}
                    className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl ${activeStationId ? 'bg-[#00DAF3] text-black' : 'bg-white text-black'}`}
                  >
                    {globalIsPlaying && isCurrentTrackRadio ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
                  </button>

                  <button 
                    onClick={handleAddToLibrary}
                    className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:scale-110 active:scale-95 transition-all text-white/40 hover:text-small-orange"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Radio Footer / Interaction Bar */}
        <div className="p-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex -space-x-3">
              {[1,2,3,4].map(i => (
                <img 
                  key={i} 
                  src={`https://picsum.photos/seed/user${i}/100/100`} 
                  className="w-10 h-10 rounded-full border-2 border-theme" 
                  alt="Listener"
                />
              ))}
              <div className="w-10 h-10 rounded-full bg-white/5 border-2 border-theme flex items-center justify-center text-[10px] font-black">
                +42
              </div>
            </div>
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Listening Now</span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDonationModalOpen(true)}
              className="px-8 py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              <HeartHandshake size={18} /> Gifts & tips
            </button>
            <button className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all">
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Exclusive Content Sidebar (Right) */}
      {exclusiveTracks.length > 0 && (
        <aside className="hidden xl:flex w-80 border-l border-white/5 bg-theme-card/40 flex-col overflow-hidden">
          <div className="p-8 border-b border-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400 mb-2 flex items-center gap-2">
              <Sparkles size={14} /> Exclusive Archive
            </h3>
            <p className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em]">Interviews & Exclusive Segments</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {exclusiveTracks.map(track => (
              <button 
                key={track.id}
                onClick={() => {
                   const radioAlbum: Album = {
                    id: `exclusive_${track.id}`,
                    title: 'Exclusive Segment',
                    artist: artistProfile?.displayName || 'Archive',
                    coverImage: track.albumCover || 'https://picsum.photos/seed/exclusive/800/800',
                    tracks: [track],
                    description: 'Exclusive station content',
                    themeColor: '#A855F7',
                    createdAt: Date.now()
                  };
                  playTrack(track, radioAlbum, 'RADIO');
                }}
                className="w-full p-4 rounded-[1.5rem] bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 grayscale group-hover:grayscale-0 transition-all">
                  <img src={track.albumCover || 'https://picsum.photos/seed/exclusive/300/300'} className="w-full h-full object-cover" />
                </div>
                <div className="truncate">
                  <p className="text-[10px] font-black uppercase tracking-tight truncate group-hover:text-purple-400 transition-colors">{track.title}</p>
                  <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{track.artist}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

      {currentTrack && currentTrack.artistId && (
        <DonationModal 
          isOpen={isDonationModalOpen}
          onClose={() => setIsDonationModalOpen(false)}
          toId={currentTrack.artistId}
          toName={currentTrack.artist}
        />
      )}
    </div>
  );
};

export default RadioView;
