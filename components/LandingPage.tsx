import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { loginWithGoogle, loginWithTwitter, loginWithFacebook, loginWithMicrosoft, fetchRandomActiveUser, fetchLandingBgConfig, auth } from '../services/backendService';
import { ArrowRight, Sparkles, Mail, GraduationCap, User as UserIcon, Rocket, Loader2, AlertCircle, LogIn, Church, HeartHandshake, KeyRound, Search, Briefcase, BadgeCheck, Clapperboard, Wand2, X } from 'lucide-react';
import { type PortalEntry, PORTALS, beginPortalSignIn, consumePortalSignIn } from '../services/portalEntry';
import { GoogleIcon, FacebookIcon, MicrosoftIcon, XIcon } from './ui/ProviderIcons';
import { LandingBgAsset, LandingBgConfig, UserProfile } from '../types';
import ThreeDImage from './ThreeDImage';
// Lazy: EarthGlobe pulls three + @react-three/fiber/drei into whatever chunk imports it.
const EarthGlobe = lazy(() => import('./EarthGlobe'));
import Logo from './Logo';
import SignInPrompt from './SignInPrompt';
import AuthExperience from './AuthExperience';
// Lazy: the Elevate door pulls org services; only loaded when someone opens it.
const ElevateGateway = lazy(() => import('./elevate/ElevateGateway'));

interface LandingPageProps {
  onEnter: () => void;
  onVisitUser?: (uid: string) => void;
  /** A door (Academia / Elevate / Business & Work / Productions) for someone signed in → its hub. */
  onEnterPortal?: (entry: PortalEntry) => void;
  /** Signed-in visit: show the 5-second door chooser, then onEnter (their regular home). */
  chooser?: boolean;
  onDismissChooser?: () => void;
  /** Where the chooser goes if nothing is picked ("Elevate" for Elevate people). */
  homeLabel?: string;
}

const CHOOSER_SECONDS = 5;

/** Signed-in visit to plajah.com: pick a door within five seconds, or go to your regular home. */
const DoorChooser: React.FC<{ name: string; homeLabel: string; onPick: (entry: PortalEntry) => void; onHome: () => void; onStay: () => void }> = ({ name, homeLabel, onPick, onHome, onStay }) => {
  const [left, setLeft] = useState(CHOOSER_SECONDS);
  const homeRef = useRef(onHome);
  homeRef.current = onHome;
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = CHOOSER_SECONDS - Math.floor((Date.now() - started) / 1000);
      if (remaining <= 0) { clearInterval(id); homeRef.current(); return; }
      setLeft(remaining);
    }, 200);
    return () => clearInterval(id);
  }, []);
  const icons = { personal: UserIcon, academia: GraduationCap, elevate: HeartHandshake, business: Briefcase, productions: Clapperboard } as const;
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed inset-x-0 bottom-0 z-[120] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none"
      role="dialog"
      aria-label="Where to?"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-xl rounded-[28px] border border-white/15 bg-[#0d0612]/95 backdrop-blur-xl shadow-[0_-20px_60px_rgba(0,0,0,0.7)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-left">
            <p className="text-[12px] font-semibold text-white/55">Welcome back</p>
            <h2 className="text-lg font-black text-white truncate">Where to, {name.split(' ')[0]}?</h2>
          </div>
          <button onClick={onStay} className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white" aria-label="Stay on this page"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mt-3">
          {PORTALS.map(d => {
            const Icon = icons[d.key];
            return (
              <button
                key={d.key}
                onClick={() => (d.key === 'personal' ? onPick({ portal: 'personal' }) : onPick({ portal: d.key, intent: 'hub' }))}
                className="flex flex-col items-center gap-1.5 rounded-2xl border p-2 sm:p-2.5 min-h-[76px] active:scale-95 transition-all hover:bg-white/[0.06]"
                style={{ borderColor: `${d.color}55`, background: `${d.color}14` }}
              >
                <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `${d.color}2a`, color: d.color }}><Icon size={18} /></span>
                <span className="text-[11px] font-bold leading-tight text-white text-center">{d.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00]" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: CHOOSER_SECONDS, ease: 'linear' }} />
          </div>
          <button onClick={onHome} className="shrink-0 text-[12px] font-semibold text-white/75 hover:text-white">
            {homeLabel === 'Elevate' ? 'Elevate' : 'Home'} in {left}s →
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ── Dynamic Background ──────────────────────────────────────────────────────────

// The background config is cached so a returning visitor's video starts before Firebase has even
// booted; index.html reads the same key to preload the poster. First visits wait on one doc read.
const BG_CACHE_KEY = 'plajah.landingBg.v1';

const readCachedBg = (): LandingBgConfig | null => {
  try {
    const raw = localStorage.getItem(BG_CACHE_KEY);
    return raw ? JSON.parse(raw) as LandingBgConfig : null;
  } catch { return null; }
};

const writeCachedBg = (config: LandingBgConfig) => {
  try { localStorage.setItem(BG_CACHE_KEY, JSON.stringify(config)); } catch { /* private mode */ }
};

const posterFor = (asset: LandingBgAsset) =>
  asset.thumbnailUrl || (asset.muxPlaybackId ? `https://image.mux.com/${asset.muxPlaybackId}/thumbnail.webp?time=0&width=1920` : undefined);

/** Mux HLS when the asset has a playback id (native on Safari, hls.js elsewhere — loaded only
 *  then), the Storage MP4 otherwise or if the stream fails. Starts on the lowest rendition so the
 *  first frame is quick, then climbs. The poster covers the gap. */
const BgVideo: React.FC<{ asset: LandingBgAsset }> = ({ asset }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useMp4, setUseMp4] = useState(!asset.muxPlaybackId);

  useEffect(() => { setUseMp4(!asset.muxPlaybackId); }, [asset.muxPlaybackId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || useMp4 || !asset.muxPlaybackId) return;
    const src = `https://stream.mux.com/${asset.muxPlaybackId}.m3u8`;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }
    let hls: any;
    let cancelled = false;
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) { setUseMp4(true); return; }
      hls = new Hls({ startLevel: 0, capLevelToPlayerSize: true, maxBufferLength: 10 });
      hls.on(Hls.Events.ERROR, (_e: unknown, data: any) => { if (data?.fatal) setUseMp4(true); });
      hls.loadSource(src);
      hls.attachMedia(video);
    }).catch(() => setUseMp4(true));
    return () => { cancelled = true; hls?.destroy(); };
  }, [asset.muxPlaybackId, useMp4]);

  return (
    <video
      ref={videoRef}
      key={useMp4 ? 'mp4' : 'hls'}
      src={useMp4 ? asset.url : undefined}
      poster={posterFor(asset)}
      autoPlay muted loop playsInline
      preload="auto"
      className="absolute inset-0 w-full h-full object-cover"
      onCanPlay={e => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
      onError={() => { if (!useMp4) setUseMp4(true); }}
    />
  );
};

const LandingBackground: React.FC<{ config: LandingBgConfig }> = ({ config }) => {
  const selected = config.assets.filter(a => a.isSelected);
  const [slideIdx, setSlideIdx] = useState(0);

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
        <Suspense fallback={null}><EarthGlobe /></Suspense>
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
        <BgVideo asset={asset} />
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
            <BgVideo asset={current} />
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

// ── Identity providers ────────────────────────────────────────────────────────
// Keyed by Firebase providerId so a button can tell whether the CURRENT session already
// belongs to it — that's what turns "sign in with Google" into "you're in, come on through".

const PROVIDERS = [
  { id: 'google.com',    label: 'Google',      Icon: GoogleIcon,    bg: 'bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.1)]' },
  { id: 'facebook.com',  label: 'Facebook',    Icon: FacebookIcon,  bg: 'bg-[#1877F2] text-white shadow-[0_10px_30px_rgba(24,119,242,0.3)]' },
  { id: 'microsoft.com', label: 'Microsoft',   Icon: MicrosoftIcon, bg: 'bg-[#2f2f2f] border border-white/15 text-white shadow-[0_10px_30px_rgba(0,0,0,0.4)]' },
  { id: 'twitter.com',   label: 'X (Twitter)', Icon: XIcon,         bg: 'bg-black border border-white/20 text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)]' },
] as const;

const PROVIDER_FN: Record<string, () => Promise<any>> = {
  'google.com': () => loginWithGoogle(),
  'facebook.com': loginWithFacebook,
  'microsoft.com': loginWithMicrosoft,
  'twitter.com': loginWithTwitter,
};

// ── Landing Page ────────────────────────────────────────────────────────────────

const LandingPage: React.FC<LandingPageProps> = ({ onEnter, onVisitUser, onEnterPortal, chooser, onDismissChooser, homeLabel = 'your home' }) => {
  const [leftAdUser, setLeftAdUser] = useState<UserProfile | null>(null);
  const [rightAdUser, setRightAdUser] = useState<UserProfile | null>(null);
  const [showStudent, setShowStudent] = useState(false);
  // Plajah Elevate door: claim a pre-provisioned church/ministry account, find & join one, or set one up.
  // A join link / QR (?elevateJoin=<org>[&claim=1&member=ID]) opens the door straight away, targeted at that org.
  const [elevateLink] = useState(() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);
    const key = q.get('elevateJoin');
    return key ? { orgKey: key, mode: (q.get('claim') ? 'claim' : 'join') as 'claim' | 'join', memberNumber: q.get('member') || undefined } : null;
  });
  const [elevate, setElevate] = useState<null | 'home' | 'claim' | 'join' | 'create'>(() => elevateLink?.mode || null);
  // App.tsx also parsed the link; tell it the landing page handled it so it does not open a second door after Enter.
  const settleElevate = () => { setElevate(null); try { window.dispatchEvent(new CustomEvent('plajah:elevate-gateway-handled')); const u = new URL(window.location.href); ['elevateJoin', 'claim', 'member'].forEach(k => u.searchParams.delete(k)); window.history.replaceState({}, '', u.toString()); } catch { /* */ } };
  const openElevateOrg = (orgId: string) => { settleElevate(); onEnter(); setTimeout(() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ORG_HUB', params: { orgId, fromElevate: true } } })), 400); };
  const createElevateOrg = () => { settleElevate(); onEnter(); setTimeout(() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ORG_HUB', params: { create: true, fromElevate: true } } })), 400); };
  const [authMode, setAuthMode] = useState<'REGISTER' | 'SIGN_IN' | null>(null);
  // The door whose sign-in is open, so a successful sign-in lands in that door's hub.
  const [authPortal, setAuthPortal] = useState<PortalEntry | null>(null);
  // Someone can legitimately be looking at this page while already signed in — the Back
  // button walks history down to the first entry, which is LANDING. Signing in AGAIN as the
  // same account is a no-op for Firebase's auth listener, so the old page just sat there.
  // Knowing about the live session lets us offer "Continue as …" and enter directly.
  const [signedIn, setSignedIn] = useState<{ name: string; photo: string; providers: string[] } | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  // null = not known yet (first visit, doc still loading): render the plain backdrop rather than
  // booting the globe only to swap it out for a video a moment later.
  const [bgConfig, setBgConfig] = useState<LandingBgConfig | null>(readCachedBg);

  useEffect(() => {
    // The background doesn't wait on the featured-user queries.
    fetchLandingBgConfig().then(bg => {
      const next = bg ?? { mode: 'EARTH' as const, slideshowIntervalMs: 5000, overlayOpacity: 40, assets: [] };
      writeCachedBg(next);
      setBgConfig(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    });
    Promise.all([fetchRandomActiveUser(), fetchRandomActiveUser()]).then(([u1, u2]) => {
      setLeftAdUser(u1);
      setRightAdUser(u2);
    });
  }, []);

  // auth.onAuthStateChanged, not the app's onAuthUpdate wrapper: the wrapper re-syncs the
  // user's Firestore profile on every subscription, and this component only wants to LOOK.
  useEffect(() => auth.onAuthStateChanged(u => setSignedIn(u && !u.isAnonymous ? {
    name: u.displayName || u.email || 'your account',
    photo: u.photoURL || '',
    providers: (u.providerData || []).map(p => p?.providerId).filter(Boolean) as string[],
  } : null)), []);

  // Every provider button routes through here. Two things it guarantees that the raw
  // login helpers do not:
  //   1. If a session already exists, we never open a popup at all — clicking Google when
  //      you're already signed in with Google just takes you back in.
  //   2. After a successful popup we call onEnter() ourselves. Firebase only fires
  //      onAuthStateChanged when the USER changes, so re-authenticating the account you're
  //      already in resolves silently — which is exactly why the page used to sit there.
  const runProvider = (id: string, fn: () => Promise<any>) => async () => {
    setAuthError('');
    onDismissChooser?.();
    consumePortalSignIn(); // a provider button is the general way in, not a door
    if (signedIn) {
      // Already signed in with this exact provider → there is nothing to do but go in.
      if (signedIn.providers.includes(id)) { onEnter(); return; }
      // A different provider means "switch account", which is a real sign-in — fall through.
    }
    setBusyProvider(id);
    try {
      await fn();
      if (auth.currentUser) onEnter();
    } catch (e: any) {
      setAuthError(e?.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusyProvider(null);
    }
  };

  // A door tap: already signed in → that hub now; otherwise sign in first, then the hub.
  const openDoor = (entry: PortalEntry, mode: 'SIGN_IN' | 'REGISTER' = 'SIGN_IN') => {
    onDismissChooser?.();
    if (signedIn && onEnterPortal) { onEnterPortal(entry); return; }
    beginPortalSignIn(entry);
    setAuthPortal(entry);
    setAuthMode(mode);
  };
  // Elevate's claim / join / set-up flows run in the gateway (it signs people in along the way).
  const openElevateFlow = (mode: 'home' | 'claim' | 'join' | 'create') => {
    onDismissChooser?.();
    if (signedIn && onEnterPortal && mode !== 'home') { onEnterPortal({ portal: 'elevate', intent: mode }); return; }
    if (!signedIn && mode !== 'home') beginPortalSignIn({ portal: 'elevate', intent: mode, orgKey: elevateLink?.orgKey, memberNumber: elevateLink?.memberNumber });
    setElevate(mode);
  };

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
        {bgConfig
          ? <LandingBackground config={bgConfig} />
          : <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#1a0026]/30 to-[#020202]" />}
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
          <p className="text-center text-lg lg:text-2xl font-bold tracking-wide uppercase text-white max-w-2xl px-4 [text-shadow:0_2px_14px_rgba(0,0,0,0.65)]">
            Everything creators make — music, film, books, live &amp; more.<br/>One profile to build it. One place to find it.
          </p>
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-small-orange to-transparent" />
        </motion.div>

        {/* A one-line tease of the two directions. The "Create your free account" and
            "Enter" buttons below are the actual answer — this just plants the fork in the
            visitor's head. The full Explore/Create fork lives on the Front Row page after
            sign-in. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.35 }}
          className="text-base lg:text-lg font-black uppercase tracking-[0.3em] text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.65)] -mt-2"
        >
          What do you want to make — or discover?
        </motion.p>

        {/* Primary CTA — "continue" for a live session, otherwise create an account */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          className="w-full max-w-md flex flex-col items-center gap-3"
        >
          {signedIn ? (
            <>
              <button
                onClick={onEnter}
                className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white font-black text-sm uppercase tracking-[0.15em] shadow-[0_10px_40px_rgba(212,0,85,0.4)] hover:scale-[1.03] active:scale-95 transition-all duration-300"
              >
                {signedIn.photo
                  ? <img src={signedIn.photo} alt="" className="w-6 h-6 rounded-full object-cover ring-1 ring-white/40" />
                  : <LogIn size={17} />}
                <span className="truncate">Continue as {signedIn.name}</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mt-1">
                You’re already signed in — or switch accounts below
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setAuthPortal(null); consumePortalSignIn(); setAuthMode('REGISTER'); }}
                className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white font-black text-sm uppercase tracking-[0.15em] shadow-[0_10px_40px_rgba(212,0,85,0.4)] hover:scale-[1.03] active:scale-95 transition-all duration-300"
              >
                <Mail size={17} /> Create your free account <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={() => { setAuthPortal(null); consumePortalSignIn(); setAuthMode('SIGN_IN'); }} className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50 hover:text-white transition-colors">
                Sign in with email &amp; password
              </button>
              {/* Said plainly, because getting this wrong is the #1 way people lock themselves
                  out: the email form only serves accounts that were CREATED with an email. */}
              <p className="text-[9px] font-bold normal-case tracking-normal text-white/35 text-center leading-relaxed max-w-sm">
                Email &amp; password is only for accounts made with an email address. If you joined
                with Google, Facebook, Microsoft or X, use that button below.
              </p>
            </>
          )}
          {authError && (
            <div className="w-full flex items-start gap-2 text-[11px] text-red-200 bg-red-500/12 border border-red-500/30 rounded-xl px-3 py-2.5 text-left">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /><span>{authError}</span>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-4xl"
        >
          {PROVIDERS.map(({ id, label, Icon, bg }) => {
            const isCurrent = !!signedIn?.providers.includes(id);
            return (
              <button
                key={id}
                onClick={runProvider(id, () => PROVIDER_FN[id]())}
                disabled={!!busyProvider}
                title={isCurrent ? `Continue with ${label} — you’re already signed in` : `Sign in with ${label}`}
                className={`flex-1 group relative flex items-center justify-center gap-2.5 px-3 py-4 rounded-2xl font-display font-light group-hover:font-black text-[13px] uppercase tracking-[0.06em] hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-60 disabled:hover:scale-100 ${bg} ${isCurrent ? 'ring-2 ring-small-orange ring-offset-2 ring-offset-black/60' : ''}`}
              >
                {busyProvider === id
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Icon size={16} className="transition-transform group-hover:scale-110" />}
                <span className="transition-all duration-300 whitespace-nowrap">{label}</span>
                {/* A signed-in provider says so, so the button never looks like a dead end. */}
                {isCurrent && <span className="absolute -top-2 right-3 px-1.5 py-0.5 rounded-full bg-small-orange text-black text-[7px] font-black uppercase tracking-widest">Signed in</span>}
                <div className="absolute inset-0 rounded-2xl bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            );
          })}

          {/* Plain "Enter": browsing without an account is a first-class door, not a
              consolation prize, and calling it "guest" made people think it was lesser. */}
          <button
            onClick={onEnter}
            className="flex-1 group relative flex items-center justify-center gap-2.5 px-3 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-display font-light group-hover:font-black text-[13px] uppercase tracking-[0.06em] hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <span className="transition-all duration-300">Enter</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* The doors: Academia, Elevate, Business & Work and Productions — each signs you in to its own hub */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 w-full max-w-4xl items-stretch text-left">
          {/* Plajah Academia — education sign-in as a first-class path, not a footnote */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.85 }}
            className="h-full flex flex-col justify-between rounded-3xl border border-[#3FB98E]/30 bg-gradient-to-br from-[#0f1a16]/80 to-black/40 backdrop-blur-md p-5 sm:p-6"
          >
            <div>
              <div className="flex items-center gap-2 text-[#3FB98E] mb-1.5">
                <GraduationCap size={18} className="shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Plajah Academia · For Schools</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">Teachers, students &amp; families</h3>
              <p className="text-[12px] text-white/55 leading-snug mt-1.5">
                Class points, courses, and the portable learner record — <span className="text-green-300 font-bold">safe, ad-free, and family-visible</span>.
              </p>
            </div>
            <div className="mt-4">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => { if (signedIn && onEnterPortal) { onDismissChooser?.(); onEnterPortal({ portal: 'academia', intent: 'student' }); return; } beginPortalSignIn({ portal: 'academia', intent: 'student' }); setShowStudent(true); }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-[#3FB98E] text-black font-black text-[11px] uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all"
                >
                  <UserIcon size={15} className="shrink-0" /> <span>Student sign-in</span>
                </button>
                <button
                  onClick={() => openDoor({ portal: 'academia', intent: 'teacher' })}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-white/10 border border-white/20 text-white font-black text-[11px] uppercase tracking-wider hover:bg-white/15 active:scale-95 transition-all"
                >
                  <Mail size={15} className="shrink-0" /> <span>Teacher / school sign-in</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                <button
                  onClick={() => { onEnter(); setTimeout(() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ACADEMIA_DEMOS' } })), 500); }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#3FB98E]/80 hover:text-[#3FB98E] transition-colors"
                >
                  <Sparkles size={13} /> Tour Academia — no signup →
                </button>
              </div>
            </div>
          </motion.div>

          {/* Plajah Elevate — churches, religious communities, charities, cultural institutions & nonprofits: for staff, leaders, volunteers & participants */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.95 }}
            className="h-full flex flex-col justify-between rounded-3xl border border-[#8B5CF6]/40 bg-gradient-to-br from-[#160a26]/85 to-black/40 backdrop-blur-md p-5 sm:p-6 shadow-[0_0_40px_rgba(139,92,246,0.12)]"
          >
            <div>
              <div className="flex items-center gap-2 text-[#C4B5FD] mb-1.5">
                <HeartHandshake size={18} className="shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em]">Plajah Elevate · Churches, Charities, Cultural &amp; Nonprofits</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">Staff, leaders &amp; participants making a difference</h3>
              <p className="text-[12px] text-white/55 leading-snug mt-1.5">
                For <span className="text-white/85 font-semibold">churches, religious orgs, charities, cultural institutions &amp; nonprofits</span> — <span className="text-[#C4B5FD] font-bold">claim your pre-set account</span> with your ID or email, or join your organization as staff, volunteer, or participant.
              </p>
            </div>
            <div className="mt-4">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => openElevateFlow('claim')}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-gradient-to-r from-[#6B0099] to-[#8B5CF6] text-white font-black text-[11px] uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-[0_10px_30px_rgba(139,92,246,0.3)]"
                >
                  <KeyRound size={15} className="shrink-0" /> <span>Claim your account</span>
                </button>
                <button
                  onClick={() => openElevateFlow('join')}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-white/10 border border-[#8B5CF6]/40 text-white font-black text-[11px] uppercase tracking-wider hover:bg-white/15 active:scale-95 transition-all"
                >
                  <Search size={15} className="shrink-0" /> <span>Find &amp; join your org</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                <button onClick={() => openDoor({ portal: 'elevate', intent: 'hub' })} className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#C4B5FD]/80 hover:text-[#C4B5FD] transition-colors">
                  <LogIn size={13} /> {signedIn ? 'Open my Elevate hub' : 'Elevate sign in'}
                </button>
                <button onClick={() => openElevateFlow('create')} className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#C4B5FD]/80 hover:text-[#C4B5FD] transition-colors">
                  <Sparkles size={13} /> Set up an organization (staff) →
                </button>
              </div>
            </div>
          </motion.div>

          {/* Business & Work — business owners and their employees */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.05 }}
            className="h-full flex flex-col justify-between rounded-3xl border border-[#22D3EE]/35 bg-gradient-to-br from-[#06181d]/85 to-black/40 backdrop-blur-md p-5 sm:p-6 shadow-[0_0_40px_rgba(34,211,238,0.10)]"
          >
            <div>
              <div className="flex items-center gap-2 text-[#67E8F9] mb-1.5">
                <Briefcase size={18} className="shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em]">Plajah Business · Work</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">Business owners &amp; employees</h3>
              <p className="text-[12px] text-white/55 leading-snug mt-1.5">
                Run your storefront, staff and sales — or <span className="text-[#67E8F9] font-bold">clock in to your workplace</span> with the seat your employer set up.
              </p>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => openDoor({ portal: 'business', intent: 'owner' })}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-gradient-to-r from-[#0891B2] to-[#22D3EE] text-black font-black text-[11px] uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-[0_10px_30px_rgba(34,211,238,0.25)]"
              >
                <Briefcase size={15} className="shrink-0" /> <span>{signedIn ? 'Open my business' : 'Owner sign-in'}</span>
              </button>
              <button
                onClick={() => openDoor({ portal: 'business', intent: 'employee' })}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-white/10 border border-[#22D3EE]/40 text-white font-black text-[11px] uppercase tracking-wider hover:bg-white/15 active:scale-95 transition-all"
              >
                <BadgeCheck size={15} className="shrink-0" /> <span>{signedIn ? 'My workplace' : 'Employee sign-in'}</span>
              </button>
            </div>
          </motion.div>

          {/* Productions — the Creators hub or the film Production hub */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.15 }}
            className="h-full flex flex-col justify-between rounded-3xl border border-[#E11D8F]/40 bg-gradient-to-br from-[#1f0616]/85 to-black/40 backdrop-blur-md p-5 sm:p-6 shadow-[0_0_40px_rgba(225,29,143,0.12)]"
          >
            <div>
              <div className="flex items-center gap-2 text-[#F9A8D4] mb-1.5">
                <Clapperboard size={18} className="shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em]">Plajah Productions</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">Creators, crews &amp; studios</h3>
              <p className="text-[12px] text-white/55 leading-snug mt-1.5">
                Music, video and live in the <span className="text-white/85 font-semibold">Creators hub</span> — or take a film from script to screen in <span className="text-[#F9A8D4] font-bold">Film Production</span>.
              </p>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => openDoor({ portal: 'productions', intent: 'creators' })}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-gradient-to-r from-[#9D174D] to-[#E11D8F] text-white font-black text-[11px] uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-[0_10px_30px_rgba(225,29,143,0.3)]"
              >
                <Wand2 size={15} className="shrink-0" /> <span>Creators hub</span>
              </button>
              <button
                onClick={() => openDoor({ portal: 'productions', intent: 'film' })}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-2xl bg-white/10 border border-[#E11D8F]/40 text-white font-black text-[11px] uppercase tracking-wider hover:bg-white/15 active:scale-95 transition-all"
              >
                <Clapperboard size={15} className="shrink-0" /> <span>Film production</span>
              </button>
            </div>
          </motion.div>
        </div>

      </div>

      <AnimatePresence>
        {chooser && signedIn && !authMode && !elevate && (
          <DoorChooser
            name={signedIn.name}
            homeLabel={homeLabel}
            onPick={(entry) => openDoor(entry)}
            onHome={onEnter}
            onStay={() => onDismissChooser?.()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStudent && <SignInPrompt action="learn" initialMode="STUDENT" onClose={() => { setShowStudent(false); if (!auth.currentUser) consumePortalSignIn(); }} />}
      </AnimatePresence>

      {elevate && (
        <Suspense fallback={null}>
          <ElevateGateway initialMode={elevate} orgKey={elevateLink?.orgKey} initialMemberNumber={elevateLink?.memberNumber} signedIn={!!signedIn} onClose={settleElevate} onOpenOrg={openElevateOrg} onCreate={createElevateOrg} />
        </Suspense>
      )}

      <AnimatePresence>
        {authMode && <AuthExperience initialMode={authMode} onClose={() => { setAuthMode(null); setAuthPortal(null); consumePortalSignIn(); }} onAuthenticated={() => { if (authPortal && onEnterPortal) onEnterPortal(authPortal); else onEnter(); }} />}
      </AnimatePresence>

    </div>
  );
};

export default LandingPage;
