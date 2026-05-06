import React from 'react';
import { motion } from 'motion/react';
import { loginWithGoogle, loginWithTwitter, fetchRandomActiveUser } from '../services/backendService';
import Logo from './Logo';
import { ArrowRight, Globe, Sparkles, LogIn, X as XIcon } from 'lucide-react';
import { UserProfile } from '../types';
import ThreeDImage from './ThreeDImage';

interface LandingPageProps {
  onEnter: () => void;
  onVisitUser?: (uid: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter, onVisitUser }) => {
  const [leftAdUser, setLeftAdUser] = React.useState<UserProfile | null>(null);
  const [rightAdUser, setRightAdUser] = React.useState<UserProfile | null>(null);

  React.useEffect(() => {
    const loadAds = async () => {
      const u1 = await fetchRandomActiveUser();
      const u2 = await fetchRandomActiveUser();
      setLeftAdUser(u1);
      setRightAdUser(u2);
    };
    loadAds();
  }, []);

  const handleAdClick = (user: UserProfile) => {
    if (user.liveStreamConfig?.isActive) {
      const streamUrl = user.liveStreamConfig.activeStreamType === 'FAST' 
        ? user.liveStreamConfig.fastChannelUrl 
        : user.liveStreamConfig.streamUrl;
      if (streamUrl) {
        window.open(streamUrl, '_blank');
        return;
      }
    }
    if (onVisitUser) {
      onVisitUser(user.uid);
    } else {
      onEnter(); // Fallback
    }
  };

  const AdSquare = ({ user, side }: { user: UserProfile | null, side: 'left' | 'right' }) => {
    if (!user) return null;
    return (
      <motion.div 
        initial={{ x: side === 'left' ? -100 : 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className={`fixed top-1/2 -translate-y-1/2 z-50 hidden xl:block ${side === 'left' ? 'left-8' : 'right-8'}`}
      >
        <button 
          onClick={() => handleAdClick(user)}
          className="group relative w-48 h-48 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl hover:scale-105 transition-all"
        >
          <ThreeDImage 
            src={user.coverArt || user.featuredArtistPhoto || user.photoURL || `https://picsum.photos/seed/${user.uid}/400/400`} 
            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
            alt="Ad"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 text-left">
            <p className="text-[8px] font-black uppercase tracking-widest text-small-orange mb-1">Featured Artist</p>
            <h4 className="text-xs font-black uppercase tracking-tight text-white truncate">Discover and Join {user.displayName}'s playground</h4>
            {user.liveStreamConfig?.isActive && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
                <span className="text-[7px] font-black uppercase tracking-widest text-red-500">Live Now</span>
              </div>
            )}
          </div>
          <div className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
            <Sparkles size={12} className="text-small-orange" />
          </div>
        </button>
      </motion.div>
    );
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020202] flex flex-col items-center justify-center p-6">
      {/* Ad Squares */}
      <AdSquare user={leftAdUser} side="left" />
      <AdSquare user={rightAdUser} side="right" />
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop" 
          alt="Space Earth" 
          className="w-full h-full object-cover opacity-40 scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1a0026]/40 to-[#020202]" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center gap-12">
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="flex flex-col items-center gap-6"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-[2.5rem] flex items-center justify-center shadow-[0_0_50px_rgba(107,0,153,0.5)] rotate-3">
            <Logo size={48} />
          </div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
            Plajah
          </h1>
          <p className="text-center text-sm lg:text-base font-light tracking-widest uppercase text-white/50 max-w-2xl px-4 group-hover:font-black transition-all duration-500">
            The Best Platform For You To Grow And Build Your IP and Creative Worlds.<br/>Discover The Playground.
          </p>
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-small-orange to-transparent" />
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
          className="space-y-8 group"
        >
          <p className="text-xl lg:text-2xl font-light group-hover:font-bold transition-all duration-500 text-white/80 leading-relaxed tracking-tight max-w-3xl mx-auto">
            The most comprehensive content ecosystem on the planet for <span className="text-small-orange">Creators and Artists</span> to connect with fans and their audience.
          </p>
          <p className="text-lg lg:text-xl font-light group-hover:font-black transition-all duration-500 text-white/60 tracking-widest uppercase">
            This is the best place to play, welcome to the playground that is the <span className="text-white">Global Archive</span>.
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-2xl"
        >
          <button
            onClick={loginWithGoogle}
            className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-white text-black rounded-2xl font-display font-light group-hover:font-black text-sm uppercase tracking-[0.1em] shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <LogIn size={16} className="transition-transform group-hover:scale-110" />
            <span className="transition-all duration-300">Google</span>
            <div className="absolute inset-0 rounded-2xl bg-white/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={loginWithTwitter}
            className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-black border border-white/20 text-white rounded-2xl font-display font-light group-hover:font-black text-sm uppercase tracking-[0.1em] shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <XIcon size={16} className="transition-transform group-hover:scale-110" />
            <span className="transition-all duration-300">Twitter / X</span>
            <div className="absolute inset-0 rounded-2xl bg-white/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={onEnter}
            className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-display font-light group-hover:font-black text-sm uppercase tracking-[0.1em] hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <span className="transition-all duration-300">Enter As Guest</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* Floating Equipment Icons (Abstract Continents) */}
        <div className="absolute -left-20 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none hidden xl:block">
          <Globe size={400} className="text-white animate-spin-slow" />
        </div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-12 left-0 right-0 z-10 flex justify-center gap-12 text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-small-orange" />
          <span>Music</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-small-orange" />
          <span>Film</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-small-orange" />
          <span>Art</span>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
