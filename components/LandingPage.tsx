import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { loginWithGoogle, loginWithTwitter, loginWithFacebook, loginWithMicrosoft, fetchRandomActiveUser, fetchLandingBgConfig } from '../services/backendService';
import { ArrowRight, Sparkles, LogIn, X as XIcon, Facebook, Minimize2, Mail, GraduationCap, User as UserIcon, Rocket } from 'lucide-react';
import { LandingBgAsset, LandingBgConfig, UserProfile } from '../types';
import ThreeDImage from './ThreeDImage';
import EarthGlobe from './EarthGlobe';
import Logo from './Logo';
import SignInPrompt from './SignInPrompt';
import AuthExperience from './AuthExperience';

interface LandingPageProps {
  onEnter: () => void;
  onVisitUser?: (uid: string) => void;
}

// ── Dynamic Background ──────────────────────────────────────────────────────────

const LandingBackground: React.FC<{ config: LandingBgConfig }> = ({ config }) => {
  const selected = config.assets.filter(a => a.isSelected);
  const [slideIdx, setSlideIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (config.mode !== 'SLIDESHOW' || selected.length < 2) return;
    const id = setInterval(
      () => setSlideIdx(i => (i + 1) % selected.length),
      config.slideshowIntervalMs
    );
    return () => clearInterval(id);
  }, [config.mode, config.slideshowIntervalMs, selected.length]);

  const overlayStyle: React.CSSProperties = {
    background: `linear-gradient(to bottom, rgba(0,0,0,${config.overlayOpacity / 100 * 0.3}) 0%, rgba(2,2,2,${config.overlayOpacity / 100}) 100%)`
  };

  if (config.mode === 'EARTH' || selected.length === 0) {
    return (
      <>
        <EarthGlobe />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#1a0026]/30 to-[#020202]" />
      </>
    );
  }

  if (config.mode === 'PHOTO') {
    const asset = selected.find(a => a.type === 'photo') ?? selected[0];
    return (
      <>
        <img src={asset.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={overlayStyle} />
      </>
    );
  }

  if (config.mode === 'VIDEO') {
    const asset = selected.find(a => a.type === 'video') ?? selected[0];
    return (
      <>
        <video
          ref={videoRef}
          src={asset.url}
          autoPlay muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover"
          onCanPlay={e => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
        />
        <div className="absolute inset-0" style={overlayStyle} />
      </>
    );
  }

  // SLIDESHOW
  const current = selected[slideIdx] ?? selected[0];
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        >
          {current.type === 'video' ? (
            <video
              src={current.url}
              autoPlay muted loop playsInline
              className="absolute inset-0 w-full h-full object-cover"
              onCanPlay={e => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
            />
          ) : (
            <img src={current.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0" style={overlayStyle} />

      {/* Slide dots */}
      {selected.length > 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {selected.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlideIdx(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === slideIdx ? 'bg-white w-4' : 'bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </>
  );
};

// ── Landing Page ────────────────────────────────────────────────────────────────

const LandingPage: React.FC<LandingPageProps> = ({ onEnter, onVisitUser }) => {
  const [leftAdUser, setLeftAdUser] = useState<UserProfile | null>(null);
  const [rightAdUser, setRightAdUser] = useState<UserProfile | null>(null);
  const [showStudent, setShowStudent] = useState(false);
  const [authMode, setAuthMode] = useState<'REGISTER' | 'SIGN_IN' | null>(null);
  const [bgConfig, setBgConfig] = useState<LandingBgConfig>({
    mode: 'EARTH', slideshowIntervalMs: 5000, overlayOpacity: 40, assets: []
  });

  useEffect(() => {
    const load = async () => {
      const [u1, u2, bg] = await Promise.all([
        fetchRandomActiveUser(),
        fetchRandomActiveUser(),
        fetchLandingBgConfig(),
      ]);
      setLeftAdUser(u1);
      setRightAdUser(u2);
      if (bg) setBgConfig(bg);
    };
    load();
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
    <div className="relative min-h-screen w-full overflow-hidden bg-transparent flex flex-col items-center justify-center p-6">
      {/* Ad Squares */}
      <AdSquare user={leftAdUser} side="left" />
      <AdSquare user={rightAdUser} side="right" />
      {/* Dynamic background */}
      <div className="absolute inset-0 z-0" style={{ width: '100%', height: '100%' }}>
        <LandingBackground config={bgConfig} />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center gap-12">
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="flex flex-col items-center gap-6"
        >
          {/* Pulsing Plajah Logo */}
          <motion.div
            animate={{ scale: [1, 1.07, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] blur-2xl opacity-60 scale-125" />
            <div className="relative w-24 h-24 md:w-32 md:h-32 bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(107,0,153,0.5)]">
              <Logo size={56} fluid />
            </div>
          </motion.div>

          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
            Plajah
          </h1>
          <p className="text-center text-sm lg:text-base font-light tracking-widest uppercase text-white/50 max-w-2xl px-4 group-hover:font-black transition-all duration-500">
            The Best Platform For You To Grow And Build Your IP and Creative Worlds.<br/>Discover The Playground.
          </p>
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-small-orange to-transparent" />
        </motion.div>

        {/* Landing-page value copy removed per product direction. */}

        {/* Primary CTA — create an account with email */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          className="w-full max-w-md flex flex-col items-center gap-3"
        >
          <button
            onClick={() => setAuthMode('REGISTER')}
            className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white font-black text-sm uppercase tracking-[0.15em] shadow-[0_10px_40px_rgba(212,0,85,0.4)] hover:scale-[1.03] active:scale-95 transition-all duration-300"
          >
            <Mail size={17} /> Create your free account <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => setAuthMode('SIGN_IN')} className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50 hover:text-white transition-colors">
            Already have an account? Sign in
          </button>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mt-1">Or continue with a social account</p>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-4xl"
        >
          <button
            onClick={() => loginWithGoogle()}
            className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-white text-black rounded-2xl font-display font-light group-hover:font-black text-sm uppercase tracking-[0.1em] shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <LogIn size={16} className="transition-transform group-hover:scale-110" />
            <span className="transition-all duration-300">Google</span>
            <div className="absolute inset-0 rounded-2xl bg-white/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={loginWithFacebook}
            className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-[#1877F2] text-white rounded-2xl font-display font-light group-hover:font-black text-sm uppercase tracking-[0.1em] shadow-[0_10px_30px_rgba(24,119,242,0.3)] hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Facebook size={16} className="transition-transform group-hover:scale-110" />
            <span className="transition-all duration-300">Facebook</span>
            <div className="absolute inset-0 rounded-2xl bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={loginWithMicrosoft}
            className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-[#0078D4] text-white rounded-2xl font-display font-light group-hover:font-black text-sm uppercase tracking-[0.1em] shadow-[0_10px_30px_rgba(0,120,212,0.3)] hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Minimize2 size={16} className="transition-transform group-hover:scale-110" />
            <span className="transition-all duration-300">Microsoft</span>
            <div className="absolute inset-0 rounded-2xl bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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

        {/* Plajah Academia — education sign-in as a first-class path, not a footnote */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.85 }}
          className="mt-8 w-full max-w-2xl rounded-3xl border border-[#3FB98E]/30 bg-gradient-to-br from-[#0f1a16]/80 to-black/40 backdrop-blur-md p-5 sm:p-6"
        >
          <div className="flex items-center gap-2 text-[#3FB98E] mb-1">
            <GraduationCap size={18} /><span className="text-[10px] font-black uppercase tracking-[0.3em]">Plajah Academia · For Schools</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white leading-tight">Teachers, students &amp; families</h3>
          <p className="text-[12px] text-white/55 leading-snug mt-1">Class points, courses, and the portable learner record — <span className="text-green-300 font-bold">safe, ad-free, and family-visible</span>.</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={() => setShowStudent(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-[#3FB98E] text-black font-black text-[12px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
            >
              <UserIcon size={16} /> Student sign-in
            </button>
            <button
              onClick={() => setAuthMode('SIGN_IN')}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-white/10 border border-white/20 text-white font-black text-[12px] uppercase tracking-widest hover:bg-white/15 active:scale-95 transition-all"
            >
              <Mail size={16} /> Teacher / school sign-in
            </button>
          </div>
          <button
            onClick={() => { onEnter(); setTimeout(() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ACADEMIA_DEMOS' } })), 500); }}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#3FB98E]/80 hover:text-[#3FB98E] transition-colors"
          >
            <Sparkles size={13} /> Tour Academia — no signup →
          </button>
        </motion.div>

      </div>

      <AnimatePresence>
        {showStudent && <SignInPrompt action="learn" initialMode="STUDENT" onClose={() => setShowStudent(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {authMode && <AuthExperience initialMode={authMode} onClose={() => setAuthMode(null)} />}
      </AnimatePresence>

    </div>
  );
};

export default LandingPage;
