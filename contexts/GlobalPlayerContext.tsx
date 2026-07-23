import React, { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Track, Album, Video } from '../types';
import { doc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { db, fetchAllPublicAlbums } from '../services/backendService';
import { diagnoseAudioUrl, createDecodeAudioPlayer, type DecodedAudioPlayer } from '../services/audioFormatService';
import { detectDolbySupport, isLikelyAtmosUrl } from '../services/dolbyDetection';
import { saveProgress } from '../services/episodeProgressService';
import { getCachedMedia } from '../services/offlineStorageService';
import { getOrComputeAnalysis, getCachedAnalysis } from '../services/djAnalysis';
import { hasRealSlides } from '../services/slideshow';
import { getPlatformInfo } from '../hooks/usePlatform';
import { trackStart, trackProgress, trackComplete } from '../services/contentMetrics';
import { skipOnTV } from '../services/tvCapabilities';
import Hls from 'hls.js';
import { peekTrackStream, prefetchTrackStreams, pickStreamUrl, getQuality as getAudioQuality, enqueueTranscode, enqueueAlbumTranscodes, getTrackStream } from '../services/choraStreamService';

interface GlobalPlayerProgressContextType {
  currentTime: number;
  duration: number;
  seek: (time: number) => void;
}

interface GlobalPlayerContextType {
  currentTrack: Track | null;
  currentAlbum: Album | null;
  currentVideo: Video | null;
  isPlaying: boolean;
  volume: number;
  audioSource: 'LIBRARY' | 'RADIO' | 'VIDEO' | null;
  repeatMode: 'OFF' | 'ONE' | 'ALL';
  setRepeatMode: (mode: 'OFF' | 'ONE' | 'ALL') => void;
  isShuffle: boolean;
  setIsShuffle: (val: boolean) => void;
  /** Pre-selected next track (respects shuffle / repeat) so the UI can highlight it. */
  nextTrackId: string | null;
  playTrack: (track: Track, album: Album | null, source: 'LIBRARY' | 'RADIO' | 'VIDEO', startAt?: number, forceReload?: boolean) => void;
  playVideo: (video: Video) => void;
  setVideoElement: (el: HTMLVideoElement | null) => void;
  setYtPlayer: (player: any | null) => void;
  setCurrentVideo: (video: Video | null) => void;
  setCurrentTrack: (track: Track | null) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  next: () => void;
  prev: () => void;
  /** DJ scratch on the streaming audio: begin on pointer-down, feed time deltas (s) on move, end on up. */
  beginScratch: () => void;
  scratchBy: (deltaSeconds: number) => void;
  endScratch: () => void;
  analyser: AnalyserNode | null;
  /** The shared, always-unlocked AudioContext. DJ mode + FX build their nodes on THIS
   *  (never a separate context) so audio can't get stuck suspended. Ensures + resumes it. */
  getAudioContext: () => AudioContext | null;
  /** Drive the DJ carry-over filter on the streaming path (0.5 = dry). Persists after DJ exit. */
  setDjFilter: (value: number) => void;
  /** Kill switch — reset the track to its natural dry state (no DJ FX). */
  resetAudioFx: () => void;
  /** Whether DJ FX are currently coloring the stream (for the Kill button's active state). */
  isFxActive: boolean;
  isFrequencyVisualizerEnabled: boolean;
  setIsFrequencyVisualizerEnabled: (val: boolean) => void;
  visualizerType: 'FLOW' | 'PAINT';
  setVisualizerType: (t: 'FLOW' | 'PAINT') => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  /** True when the slideshow was started by the creator's toggle rather than by the listener.
   *  Ambient surfaces (nano back face, album backdrop) honor it; the full-screen takeover
   *  does not — nobody asked for that, so it stays an explicit choice. */
  isSlideshowAuto: boolean;
  isNanoView: boolean;
  setIsNanoView: (val: boolean) => void;
  isNanoDocked: boolean;
  setIsNanoDocked: (val: boolean) => void;
  isUserActive: boolean;
  setIsUserActive: (val: boolean) => void;
  nanoPosition: { x: number; y: number };
  setNanoPosition: (pos: { x: number; y: number }) => void;
  snapReset: () => void;
  theme: 'LIGHT' | 'DARK' | 'PASTEL' | 'PLAJAH' | 'BIG_SCREEN' | 'PHONE' | 'ETHEREAL' | 'NEBULA' | 'CITRUS';
  setTheme: (theme: 'LIGHT' | 'DARK' | 'PASTEL' | 'PLAJAH' | 'BIG_SCREEN' | 'PHONE' | 'ETHEREAL' | 'NEBULA' | 'CITRUS') => void;
  isBigScreen: boolean;
  isTVMode: boolean;
  setIsTVMode: (val: boolean) => void;
  isPhoneMode: boolean;
  isShrunk: boolean;
  setIsShrunk: (val: boolean) => void;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
  transportForced: boolean;
  setTransportForced: (val: boolean) => void;
  isThreeDEnabled: boolean;
  setIsThreeDEnabled: (val: boolean) => void;
  isSpatialAudioEnabled: boolean;
  setSpatialAudioEnabled: (val: boolean) => void;
  spatialMode: 'off' | 'orbit' | 'reactive';
  setSpatialMode: (mode: 'off' | 'orbit' | 'reactive') => void;
  dolbySupport: { ec3: boolean; ac4: boolean; atmos: boolean };
  isAtmosActive: boolean;
  toggleFullScreen: () => void;
  toggleAppFullScreen: () => void;
  view: string;
  setView: (view: string) => void;
  isMiniPlayerActive: boolean;
  setIsMiniPlayerActive: (val: boolean) => void;
  incrementPlayCount: (id: string, type: 'TRACK' | 'VIDEO') => Promise<void>;
  clearMedia: () => void;
  activateVideoSource: (video: Video) => void;
  isPlayerExpanded: boolean;
  setIsPlayerExpanded: (val: boolean) => void;
}

const GlobalPlayerContext = createContext<GlobalPlayerContextType | undefined>(undefined);
const GlobalPlayerProgressContext = createContext<GlobalPlayerProgressContextType | undefined>(undefined);

// ── Media Session (lock screen + Android Auto / CarPlay / Bluetooth AVRCP) ──
// Cars read the OS media session for title/artist/artwork/progress. It has to be
// populated with an ABSOLUTE artwork URL and multiple sizes, and the position +
// playback state kept in sync, or head units show nothing or a frozen scrubber.
const toAbsoluteUrl = (u?: string | null): string | undefined => {
  if (!u) return undefined;
  try { return new URL(u, window.location.origin).href; } catch { return u || undefined; }
};
const artworkMimeType = (u?: string): string => {
  const m = (u || '').split('?')[0].toLowerCase();
  if (m.endsWith('.png')) return 'image/png';
  if (m.endsWith('.webp')) return 'image/webp';
  if (m.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
};
const updateMediaMetadata = (track: Track, album: Album | null) => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const src = toAbsoluteUrl(track.images?.[0] || (track as any).albumCover || album?.coverImage);
  const type = artworkMimeType(src);
  const artwork = src
    ? ['96x96', '128x128', '256x256', '384x384', '512x512'].map(sizes => ({ src, sizes, type }))
    : [];
  const base = {
    title: track.title || 'Unknown Title',
    artist: album?.artist || track.artist || 'Unknown Artist',
    album: album?.title || (track as any).albumTitle || '',
  };
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ ...base, artwork });
  } catch {
    // Some head units reject unreachable artwork and drop the whole payload — retry without it.
    try { navigator.mediaSession.metadata = new MediaMetadata(base); } catch { /* unsupported */ }
  }
};
const setSessionPlaybackState = (state: 'playing' | 'paused' | 'none') => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = state; } catch { /* */ }
};
const setSessionPosition = (audio: HTMLAudioElement | null) => {
  if (!audio || typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = audio.duration, p = audio.currentTime, rate = audio.playbackRate || 1;
  if (!isFinite(d) || d <= 0 || !isFinite(p) || p < 0 || p > d) return;
  try { navigator.mediaSession.setPositionState({ duration: d, position: p, playbackRate: rate }); } catch { /* */ }
};

export const GlobalPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioSource, setAudioSource] = useState<'LIBRARY' | 'RADIO' | 'VIDEO' | null>(null);
  const [repeatMode, setRepeatMode] = useState<'OFF' | 'ONE' | 'ALL'>('OFF');
  const [isShuffle, setIsShuffle] = useState(false);
  const [isFxActive, setIsFxActive] = useState(false);   // DJ FX (filter) currently coloring the stream
  const [nextTrackId, setNextTrackId] = useState<string | null>(null);
  const shuffleOrderRef = useRef<string[]>([]); // stable shuffled id order so the "next" pick doesn't jitter
  const [isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled] = useState(true);
  const [visualizerType, setVisualizerType] = useState<'FLOW' | 'PAINT'>('FLOW');
  const [isSlideshowActive, setSlideshowActiveRaw] = useState(false);
  const [isSlideshowAuto, setIsSlideshowAuto] = useState(false);
  // Every explicit listener toggle drops the auto marker — once they've chosen, the choice is
  // theirs and the creator's default stops speaking for them.
  const setIsSlideshowActive = useCallback((val: boolean) => {
    setIsSlideshowAuto(false);
    setSlideshowActiveRaw(val);
  }, []);
  const [isNanoView, setIsNanoView] = useState(true);
  const [isNanoDocked, setIsNanoDocked] = useState(true);
  const [isUserActive, setIsUserActive] = useState(true);
  const [nanoPosition, setNanoPosition] = useState({ x: 20, y: window.innerHeight - 300 });
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'PASTEL' | 'PLAJAH' | 'BIG_SCREEN' | 'PHONE' | 'ETHEREAL' | 'NEBULA' | 'CITRUS'>('DARK');
  const [view, setView] = useState('DASHBOARD');
  const [audioElement, setAudioElement] = useState(() => {
    const a = new Audio();
    a.setAttribute('x-webkit-airplay', 'allow');
    a.setAttribute('playsinline', '');
    a.preload = 'auto';
    return a;
  });
  // A television starts in TV mode.
  //
  // This was a manual toggle defaulting to false, so on a real TV it stayed OFF and the player
  // fell through to the phone/desktop layouts — which is why album views arrived as phone UI on
  // a 4K panel. The dedicated big-screen layout has existed all along (PlayerView branches on
  // isTVMode); nothing was driving it. A viewer can still turn it off, but the DEFAULT should
  // follow the hardware.
  const [isTVMode, setIsTVMode] = useState(() => getPlatformInfo().isTV);
  const [isMiniPlayerActive, setIsMiniPlayerActive] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [isShrunk, setIsShrunk] = useState(true);
  // The nano controller LOADS COLLAPSED. It only wakes when there's actually something to
  // control (playback starting, or the user loading an asset) — an empty player shouldn't
  // occupy the screen on arrival.
  const [isMinimized, setIsMinimized] = useState(true);
  // When true, the mobile transport bar is shown even on non-music views (revealed by a
  // double-tap of the Chora nav icon or a swipe-up on the persistent now-playing pill).
  const [transportForced, setTransportForced] = useState(false);
  const [isThreeDEnabled, setIsThreeDEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playCountedTrackRef = useRef<string | null>(null);
  const lastProgressSaveRef = useRef(0);
  const ytPlayerRef = useRef<any | null>(null);
  const stateRef = useRef({ repeatMode, isShuffle, currentAlbum, currentTrack, currentVideo, isPlaying, audioSource, currentTime, ytPlayer: null as any });
  const audioRef = useRef<HTMLAudioElement>(audioElement);
  const choraHistoryRef = useRef(0);
  const preloaderAudioRef = useRef<HTMLAudioElement>(new Audio());
  const hlsRef = useRef<Hls | null>(null); // active hls.js instance (transcoded HLS streams)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  // DJ filter carried over into the streaming path (transparent by default). Lets DJ FX keep
  // running after you exit DJ mode, and the Kill button resets it to a dry/natural sound.
  const djFilterRef = useRef<BiquadFilterNode | null>(null);
  // Fallback decode player for formats the <audio> element can't handle (24-bit WAV, AIFF, etc.)
  const decodedPlayerRef = useRef<DecodedAudioPlayer | null>(null);
  const usingDecodeFallbackRef = useRef(false);
  // Blob: URL currently assigned to the audio element from the offline cache (revoked on track change).
  const playbackBlobRef = useRef<string | null>(null);
  const revokePlaybackBlob = () => {
    if (playbackBlobRef.current) {
      try { URL.revokeObjectURL(playbackBlobRef.current); } catch { /* */ }
      playbackBlobRef.current = null;
    }
  };
  // Gapless prewarm: near the end of a track we fetch the NEXT track's bytes into a blob so the
  // hand-off is instant instead of a cold network fetch (the cause of the inter-track gap/stutter,
  // especially in the Android WebView). Bounded + connection-aware so it never starves the playing
  // stream — the reason an earlier eager preloader was removed. `warmingRef` is the in-flight fetch.
  const prewarmRef = useRef<{ url: string; blob: string } | null>(null);
  const warmingRef = useRef<{ url: string; ctrl: AbortController } | null>(null);
  const discardPrewarm = () => {
    if (warmingRef.current) { try { warmingRef.current.ctrl.abort(); } catch { /* */ } warmingRef.current = null; }
    if (prewarmRef.current) { try { URL.revokeObjectURL(prewarmRef.current.blob); } catch { /* */ } prewarmRef.current = null; }
  };
  const pannerRef = useRef<PannerNode | null>(null);
  const bypassGainRef = useRef<GainNode | null>(null);
  const pannerInputGainRef = useRef<GainNode | null>(null);
  const spatialAnimRef = useRef<number>(0);
  const [isSpatialAudioEnabled, setIsSpatialAudioEnabledState] = useState(false);
  const [spatialMode, setSpatialModeState] = useState<'off' | 'orbit' | 'reactive'>('off');
  const dolbySupport = useMemo(() => detectDolbySupport(), []);
  const [isAtmosActive, setIsAtmosActive] = useState(false);
  const contextRef = useRef<GlobalPlayerContextType | null>(null);
  const wakeLockRef = useRef<any>(null);
  // Playback resilience: our INTENDED state vs. what the element actually did. A pause
  // that fires while we still intend to play = an interruption (audio-focus loss, device
  // handoff, AudioContext suspend) → we recover it. A user/OS pause clears the intent
  // first, so it's respected.
  const intendedPlayingRef = useRef(false);
  const resumeRecoveryRef = useRef<{ tries: number; timer: any }>({ tries: 0, timer: null });

  useEffect(() => {
    audioRef.current = audioElement;
    // Keep audio element in the DOM so mobile browsers don't garbage-collect it
    if (!document.getElementById('__plajah_audio__')) {
      audioElement.id = '__plajah_audio__';
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);
    }
  }, [audioElement]);

  // Request wake lock while playing so the OS doesn't suspend the tab
  useEffect(() => {
    const acquireWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (_) {}
    };
    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    // Re-acquire on visibility change (lock screen releases wake lock)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        acquireWakeLock();
      }
    };
    if (isPlaying) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseWakeLock();
    };
  }, [isPlaying]);

  // Backfill precomputed audio analysis (waveform peaks + beat grid) for the playing track.
  // Deferred + guarded so it never touches the playback hot path: it decodes on an OFFLINE
  // context (no effect on live output) and persists once per track, so the waveform + DJ decks
  // populate instantly on subsequent plays. Universal — covers older tracks with no analysis.
  useEffect(() => {
    const t = currentTrack;
    if (!t?.url || getCachedAnalysis(t)) return;
    // Never on a TV: the DJ decks and waveform this feeds do not exist at ten feet, and computing
    // it means decoding the whole master — which on a 2 GB box is pure memory pressure that gets
    // the audio decoder evicted mid-song. This is the biggest single lever for smooth TV playback.
    if (getPlatformInfo().isTV) return;
    let cancelled = false;
    const id = setTimeout(() => { if (!cancelled) getOrComputeAnalysis(t).catch(() => {}); }, 4000);
    return () => { cancelled = true; clearTimeout(id); };
  }, [currentTrack?.id]);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        // Auto-resume: the OS can suspend the context on a device change / audio-route
        // switch (headphones, Bluetooth) mid-song. Without this the audio goes silent
        // even though the element is "playing". Bring it back whenever we intend to play.
        ctx.addEventListener?.('statechange', () => {
          if (ctx.state === 'suspended' && intendedPlayingRef.current) ctx.resume().catch(() => {});
        });
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        // DJ carry-over filter — starts transparent (lowpass wide open), so it's inert until
        // DJ mode or setDjFilter drives it. Sits first in the bypass path.
        const djFilter = ctx.createBiquadFilter();
        djFilter.type = 'lowpass';
        djFilter.frequency.value = 20000;
        djFilterRef.current = djFilter;
        // Panner for Eclipsa spatial audio — only active when an Eclipsa track is playing
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 0;
        panner.coneOuterGain = 0;
        panner.positionX.value = 0;
        panner.positionY.value = 0;
        panner.positionZ.value = -1;
        pannerRef.current = panner;
        // Gain nodes to route audio around the panner for non-Eclipsa files
        const bypassGain = ctx.createGain();
        bypassGain.gain.value = 1; // default: bypass active (transparent path)
        bypassGainRef.current = bypassGain;
        const pannerInputGain = ctx.createGain();
        pannerInputGain.gain.value = 0; // default: panner path muted
        pannerInputGainRef.current = pannerInputGain;
      }
    }
    // Always attempt to resume if called (usually in response to user interaction)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  // Shared audio engine accessor for DJ mode / FX: ensure the ONE context exists + is
  // resumed, and return it. Building deck/FX nodes on this (never a fresh AudioContext)
  // is what keeps DJ audio from getting stuck suspended.
  const getAudioContext = useCallback((): AudioContext | null => {
    initAudioContext();
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume().catch(() => {});
    return audioContextRef.current;
  }, [initAudioContext]);

  // Drive the carry-over filter on the streaming path (DJ convention: 0.5 = off/dry,
  // <0.5 = low-pass sweep, >0.5 = high-pass sweep). Persists after DJ mode closes.
  const setDjFilter = useCallback((value: number) => {
    const f = djFilterRef.current;
    const active = Math.abs(value - 0.5) > 0.02;
    if (f) {
      if (!active) { f.type = 'lowpass'; f.frequency.value = 20000; }
      else if (value < 0.5) { f.type = 'lowpass'; f.frequency.value = 180 + value * 2 * 3600; }
      else { f.type = 'highpass'; f.frequency.value = (value - 0.5) * 2 * 7200; }
    }
    setIsFxActive(active);
  }, []);

  // Kill switch — return the track to its natural, dry state (no DJ FX). Safe on all platforms.
  const resetAudioFx = useCallback(() => {
    const f = djFilterRef.current;
    if (f) { f.type = 'lowpass'; f.frequency.value = 20000; }
    setIsFxActive(false);
  }, []);

  // Recover from a spurious pause (interruption / device handoff) while we still intend
  // to play. Backs off and gives up after a handful of tries so a real, persistent
  // interruption (a phone call, headphones unplugged and left out) doesn't loop forever.
  const scheduleResumeRecovery = useCallback(() => {
    const rr = resumeRecoveryRef.current;
    if (rr.timer) return;
    if (stateRef.current.audioSource === 'VIDEO' || usingDecodeFallbackRef.current) return;
    // 6 tries capped at 2s spent the whole budget in ~7 seconds, so any outage longer than a
    // brief hiccup — a tunnel, a Wi-Fi handover, a laptop waking — left the track silently
    // stopped with nothing left to restart it. Longer ceiling, more attempts, and the 'online'
    // listener below re-arms this the moment connectivity actually returns.
    if (rr.tries >= 12) { rr.tries = 0; return; }
    const delay = Math.min(10000, 300 * (rr.tries + 1));
    rr.timer = setTimeout(() => {
      rr.timer = null;
      const audio = audioRef.current;
      if (!intendedPlayingRef.current || !audio || audio.ended) { rr.tries = 0; return; }
      if (!audio.paused) { rr.tries = 0; return; } // already recovered
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume().catch(() => {});
      rr.tries += 1;
      audio.play().then(() => { rr.tries = 0; }).catch(() => { scheduleResumeRecovery(); });
    }, delay);
  }, []);

  const connectAudioSource = useCallback(() => {
    // Disable Web Audio API connections on mobile to allow background playback
    // (Mobile browsers often block or suspend Web Audio API in background)
    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isMobile) return;

    const audio = audioRef.current;
    if (audioContextRef.current && analyserRef.current && !sourceRef.current) {
      try {
        const source = audioContextRef.current.createMediaElementSource(audio);
        // The DJ carry-over filter sits first in the (default) bypass path; transparent by
        // default so it changes nothing until driven. The spatial path is left untouched.
        const head: AudioNode = djFilterRef.current ?? source;
        if (djFilterRef.current) source.connect(djFilterRef.current);
        if (pannerRef.current && bypassGainRef.current && pannerInputGainRef.current) {
          // Dual-path graph — only the active path carries audio:
          // Bypass path (default): source → [djFilter] → bypassGain → analyser → destination
          // Spatial path (Eclipsa): source → pannerInputGain → panner → analyser → destination
          head.connect(bypassGainRef.current);
          source.connect(pannerInputGainRef.current);
          bypassGainRef.current.connect(analyserRef.current);
          pannerInputGainRef.current.connect(pannerRef.current);
          pannerRef.current.connect(analyserRef.current);
        } else {
          head.connect(analyserRef.current);
        }
        analyserRef.current.connect(audioContextRef.current.destination);
        sourceRef.current = source;
      } catch (e) {
        console.warn('Audio Context source connection failed (likely already connected):', e);
      }
    }
  }, []);

  // Global click listener to resume AudioContext (critical for mobile browsers)
  useEffect(() => {
    const handleGlobalInteraction = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    window.addEventListener('click', handleGlobalInteraction);
    window.addEventListener('touchstart', handleGlobalInteraction);
    return () => {
      window.removeEventListener('click', handleGlobalInteraction);
      window.removeEventListener('touchstart', handleGlobalInteraction);
    };
  }, []);

  useEffect(() => {
    stateRef.current = { repeatMode, isShuffle, currentAlbum, currentTrack, currentVideo, isPlaying, audioSource, currentTime, ytPlayer: ytPlayerRef.current };
  }, [repeatMode, isShuffle, currentAlbum, currentTrack, currentVideo, isPlaying, audioSource, currentTime]);

  // ── Next-track selection (shuffle / repeat aware) ──────────────────────────
  // Pre-selects the upcoming track so both auto-advance AND the UI (green glow)
  // agree on what plays next — even in shuffle, the "next" is stable, not re-rolled.
  const pickNextId = React.useCallback((): string | null => {
    const st = stateRef.current;
    const album = st.currentAlbum, cur = st.currentTrack;
    if (!album || !cur || !album.tracks?.length) return null;
    const tracks = album.tracks;
    if (st.repeatMode === 'ONE') return cur.id;
    if (st.isShuffle) {
      let order = shuffleOrderRef.current;
      if (order.indexOf(cur.id) === -1) {
        const rest = tracks.map(t => t.id).filter(id => id !== cur.id);
        for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
        order = shuffleOrderRef.current = [cur.id, ...rest];
      }
      const i = order.indexOf(cur.id);
      if (i !== -1 && i < order.length - 1) return order[i + 1];
      // Exhausted the bag → reshuffle the rest (never repeat current back-to-back).
      const rest = tracks.map(t => t.id).filter(id => id !== cur.id);
      if (!rest.length) return st.repeatMode === 'ALL' ? cur.id : null;
      for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
      shuffleOrderRef.current = [cur.id, ...rest];
      return rest[0];
    }
    const idx = tracks.findIndex(t => t.id === cur.id);
    if (idx !== -1 && idx < tracks.length - 1) return tracks[idx + 1].id;
    if (st.repeatMode === 'ALL') return tracks[0].id;
    return null;
  }, []);

  // Refresh the exposed nextTrackId whenever the pick could change.
  useEffect(() => {
    if (!isShuffle) shuffleOrderRef.current = [];
    setNextTrackId(pickNextId());
  }, [currentTrack?.id, currentAlbum?.id, repeatMode, isShuffle, pickNextId]);

  const setYtPlayer = useCallback((player: any | null) => {
    ytPlayerRef.current = player;
    stateRef.current.ytPlayer = player;
  }, []);

  const pause = useCallback(() => {
    // Explicit user/OS pause — clear intent FIRST so the pause event isn't treated as an
    // interruption and auto-recovered.
    intendedPlayingRef.current = false;
    if (resumeRecoveryRef.current.timer) { clearTimeout(resumeRecoveryRef.current.timer); resumeRecoveryRef.current.timer = null; }
    if (stateRef.current.audioSource === 'VIDEO') {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        ytPlayerRef.current.pauseVideo();
      } else if (videoRef.current) {
        videoRef.current.pause();
      }
    } else if (usingDecodeFallbackRef.current && decodedPlayerRef.current) {
      decodedPlayerRef.current.pause();
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    initAudioContext();
    intendedPlayingRef.current = true;
    resumeRecoveryRef.current.tries = 0;
    const audio = audioRef.current;
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
    if (stateRef.current.audioSource === 'VIDEO') {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      } else if (videoRef.current && videoRef.current.isConnected && videoRef.current.src) {
        videoRef.current.play().catch(e => {
          if (e.name === 'AbortError' || e.message?.includes('interrupted')) return;
          console.error("Video resume failed:", e);
        });
        setIsPlaying(true);
      }
    } else if (usingDecodeFallbackRef.current && decodedPlayerRef.current) {
      decodedPlayerRef.current.play().then(() => setIsPlaying(true)).catch(e => console.error("Decode fallback resume failed:", e));
    } else {
      audio.play().catch(e => {
        if (e.name === 'AbortError' || e.message?.includes('interrupted')) return;
        console.error("Audio resume failed:", e);
      });
      setIsPlaying(true);
      connectAudioSource();
    }
  }, [initAudioContext, connectAudioSource]);

  const setVideoElement = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);

  const fadeOutAudio = React.useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const startVolume = audio.volume;
    const steps = 10;
    for (let i = 0; i <= steps; i += 1) {
      audio.volume = startVolume * (1 - i / steps);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    audio.pause();
    audio.volume = startVolume;
  }, []);

  // Prewarm the NEXT track's bytes into a blob near the end of the current one, so the hand-off is
  // instant. Bounded (skips >60MB originals — those are what the transcode pipeline fixes) and
  // connection-aware (skips Save-Data / 2G) so it never starves the playing stream. Self-dedupes, so
  // it's safe to call every animation frame in the last few seconds.
  const warmNextTrack = React.useCallback(async () => {
    const st = stateRef.current;
    if (st.audioSource !== 'LIBRARY' || !st.currentAlbum || !st.currentTrack) return;
    if (typeof navigator === 'undefined' || navigator.onLine === false) return;
    const conn: any = (navigator as any).connection;
    if (conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType || ''))) return; // don't burn a metered/slow link
    const tracks = st.currentAlbum.tracks;
    const idx = tracks.findIndex(t => t.id === st.currentTrack!.id);
    let nextTrack: Track | null = null;
    if (idx !== -1 && idx < tracks.length - 1) nextTrack = tracks[idx + 1];
    else if (st.repeatMode === 'ALL' && tracks.length) nextTrack = tracks[0];
    if (!nextTrack?.url) return;
    // If the next track has a ready transcoded stream, hls.js/native HLS buffers it ahead on its own —
    // no need to prewarm the (unused) original file.
    if (peekTrackStream(nextTrack.id)?.status === 'ready') return;
    const nextUrl = nextTrack.url;
    if (prewarmRef.current?.url === nextUrl || warmingRef.current?.url === nextUrl) return; // already warm/warming
    discardPrewarm();
    const ctrl = new AbortController();
    warmingRef.current = { url: nextUrl, ctrl }; // synchronous re-entry guard (set before any await)
    try {
      // Already downloaded for offline → use that blob directly, no network.
      const cached = await getCachedMedia(nextUrl).catch(() => null);
      if (cached) { prewarmRef.current = { url: nextUrl, blob: cached }; return; }
      // Skip huge originals (hi-res WAV) — warming them would starve the stream + blow memory.
      let bytes = 0;
      try { const head = await fetch(nextUrl, { method: 'HEAD', signal: ctrl.signal }); bytes = parseInt(head.headers.get('content-length') || '0', 10) || 0; } catch { /* HEAD may be blocked */ }
      if (bytes > 60 * 1024 * 1024) return;
      const res = await fetch(nextUrl, { signal: ctrl.signal });
      if (!res.ok || ctrl.signal.aborted) return;
      const blob = await res.blob();
      if (ctrl.signal.aborted) return;
      prewarmRef.current = { url: nextUrl, blob: URL.createObjectURL(blob) };
    } catch { /* aborted or failed — the cold path still works */ }
    finally { if (warmingRef.current?.ctrl === ctrl) warmingRef.current = null; }
  }, []);

  const playTrack = React.useCallback(async (track: Track, album: Album | null, source: 'LIBRARY' | 'RADIO' | 'VIDEO', startAt?: number, forceReload?: boolean) => {
    let audio = audioRef.current;
    const isNewTrack = forceReload || stateRef.current.currentTrack?.id !== track.id || stateRef.current.audioSource === 'VIDEO';

    initAudioContext();
    intendedPlayingRef.current = true;
    resumeRecoveryRef.current.tries = 0;

    stateRef.current.currentTrack = track;
    stateRef.current.currentAlbum = album;
    stateRef.current.audioSource = source;
    stateRef.current.isPlaying = true;

    if (isNewTrack) {
      setSpatialAudioEnabled(!!track.isEclipsa);
      // Detect Atmos: explicit flag on track, or URL pattern suggests EC-3
      const trackIsAtmos = !!(track.isAtmos || isLikelyAtmosUrl(track.url ?? ''));
      setIsAtmosActive(trackIsAtmos && dolbySupport.atmos);
    }

    if (source !== 'VIDEO') {
      // Tear down any previous decode fallback player
      if (decodedPlayerRef.current) {
        try { decodedPlayerRef.current.stop(); } catch (_) {}
        decodedPlayerRef.current = null;
        usingDecodeFallbackRef.current = false;
      }

      if (isNewTrack) {
        // Catch missing/empty URLs immediately — never assign '' to audio.src
        if (!track.url) {
          console.error(`[Plajah Audio] Track "${track.title}" has no URL. Nothing to play.`);
          diagnoseAudioUrl('').catch(() => {});
          setCurrentTrack(track); setCurrentAlbum(album); setAudioSource(source);
          setIsPlaying(false);
          return;
        }

        const isExternal = track.url.startsWith('http') && !track.url.includes(window.location.host);
        // Prefer a READY transcoded stream (AAC HLS / progressive / FLAC) over the original when
        // online — the fix for the stutter. Falls back to track.url for anything not yet transcoded,
        // so this is dormant + safe until the pipeline has produced streams. Synchronous cache peek
        // keeps the first play inside the autoplay gesture.
        const stream = (typeof navigator === 'undefined' || navigator.onLine !== false) ? peekTrackStream(track.id) : null;
        const streamPick = pickStreamUrl(stream, getAudioQuality());
        // Always tear down a prior hls.js instance when the track changes.
        if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; }
        try {
          revokePlaybackBlob();
          if (streamPick) {
            discardPrewarm();
            audio.crossOrigin = 'anonymous'; // served with permissive CORS
            if (streamPick.isHls) {
              if (audio.canPlayType('application/vnd.apple.mpegurl')) {
                if (audio.src !== streamPick.url) audio.src = streamPick.url;   // native HLS (Safari/iOS)
              } else if (Hls.isSupported()) {
                audio.removeAttribute('src');
                const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
                // A "fatal" hls.js error is usually NOT terminal. A dropped segment request or a
                // buffer-append hiccup — a lift, a Wi-Fi roam, a moment of congestion — arrives
                // here as fatal, and tearing the player down on the first one is why music
                // stopped mid-song at random. Try what hls.js is built to recover from first,
                // and only fall back to the original master once recovery is genuinely spent.
                let netRetries = 0, mediaRetries = 0;
                const bailToOriginal = () => {
                  try { hls.destroy(); } catch { /* */ }
                  hlsRef.current = null;
                  const at = audio.currentTime || 0;
                  try {
                    audio.src = track.url!;
                    // Resume where the stream died rather than restarting the song.
                    const seek = () => { try { if (at > 0.5) audio.currentTime = at; } catch { /* */ } audio.removeEventListener('loadedmetadata', seek); };
                    audio.addEventListener('loadedmetadata', seek);
                    audio.play().catch(() => {});
                  } catch { /* */ }
                };
                hls.on(Hls.Events.ERROR, (_evt, data) => {
                  if (!data?.fatal) return;
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 3) {
                    netRetries++;
                    try { hls.startLoad(); return; } catch { /* fall through to bail */ }
                  }
                  if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
                    mediaRetries++;
                    try {
                      // First a plain recover; a second failure usually means a codec swap is needed.
                      if (mediaRetries === 1) hls.recoverMediaError();
                      else { hls.swapAudioCodec(); hls.recoverMediaError(); }
                      return;
                    } catch { /* fall through to bail */ }
                  }
                  bailToOriginal();
                });
                hls.loadSource(streamPick.url);
                hls.attachMedia(audio);
                hlsRef.current = hls;
              } else if (audio.src !== streamPick.url) { audio.src = streamPick.url; }
            } else if (audio.src !== streamPick.url) {
              audio.src = streamPick.url; // progressive low/flac rendition
            }
          } else if (/\.m3u8(\?|$)/i.test(track.url)) {
            // ── raw HLS source (live radio stations, external streams) ──
            // Same treatment the transcode pipeline gets, for URLs that arrive already-HLS.
            // NOTE: canPlayType('application/vnd.apple.mpegurl') is NOT a reliable native-HLS
            // test — Chromium answers "maybe" and then fails with DEMUXER_ERROR_COULD_NOT_PARSE.
            // So try hls.js FIRST wherever it's supported, and only fall back to a native src.
            discardPrewarm();
            audio.crossOrigin = 'anonymous';
            if (Hls.isSupported()) {
              audio.removeAttribute('src');
              const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
              // Same reasoning as the transcoded path above, but a live stream has no original
              // file to fall back to — recovery is the only option, so it retries harder and
              // keeps trying on network errors rather than giving the listener silence.
              let liveNet = 0, liveMedia = 0;
              hls.on(Hls.Events.ERROR, (_evt, data) => {
                if (!data?.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && liveNet < 6) {
                  liveNet++;
                  // Back off a little — a station that dropped out needs a moment, and hammering
                  // startLoad() in a tight loop just burns battery on a phone or a TV.
                  setTimeout(() => { try { hls.startLoad(); } catch { /* */ } }, Math.min(4000, 400 * liveNet));
                  return;
                }
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && liveMedia < 2) {
                  liveMedia++;
                  try {
                    if (liveMedia === 1) hls.recoverMediaError();
                    else { hls.swapAudioCodec(); hls.recoverMediaError(); }
                    return;
                  } catch { /* fall through */ }
                }
                try { hls.destroy(); } catch { /* */ }
                hlsRef.current = null;
              });
              hls.loadSource(track.url);
              hls.attachMedia(audio);
              hlsRef.current = hls;
            } else if (audio.src !== track.url) {
              audio.src = track.url;   // Safari/iOS play HLS natively
            }
          } else {
            // ── original-file path (no transcode yet) ──
            if (isExternal) audio.crossOrigin = 'anonymous'; else audio.removeAttribute('crossorigin');
            let playbackUrl = track.url;
            // Gapless: if we prewarmed exactly this track, play the ready blob instantly (no cold fetch).
            if (prewarmRef.current?.url === track.url) {
              playbackBlobRef.current = prewarmRef.current.blob;
              playbackUrl = prewarmRef.current.blob;
              prewarmRef.current = null;
            } else {
              discardPrewarm();
              if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                try { const cached = await getCachedMedia(track.url); if (cached) { playbackBlobRef.current = cached; playbackUrl = cached; } }
                catch { /* fall back to network URL */ }
              }
            }
            if (audio.src !== playbackUrl) {
              audio.src = playbackUrl;
              // DO NOT call audio.load() — breaks iOS background sequential playback
            }
          }
        } catch (e) {
          console.error("Audio src assignment failed:", e);
        }

        // Resume: seek to the requested start position once metadata is available.
        if (startAt && startAt > 1) {
          const applySeek = () => { try { audio.currentTime = startAt; } catch { /* */ } };
          if (audio.readyState >= 1) applySeek();
          else audio.addEventListener('loadedmetadata', applySeek, { once: true });
        }
      }

      /**
       * Fallback: fetch + AudioContext.decodeAudioData for formats the
       * <audio> element can't handle (24/32-bit WAV, AIFF, ALAC, etc.)
       */
      const tryDecodeFallback = async (url: string) => {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        // Prefer an already-resolved offline blob so decode-fallback formats play offline too.
        if (playbackBlobRef.current) url = playbackBlobRef.current;
        else {
          try { const cached = await getCachedMedia(track.url); if (cached) { playbackBlobRef.current = cached; url = cached; } } catch { /* */ }
        }
        console.warn(`[Plajah Audio] Attempting AudioContext.decodeAudioData() fallback for "${track.title}"`);
        try {
          const destination = analyserRef.current ?? ctx.destination;
          const player = await createDecodeAudioPlayer(url, ctx, destination);
          decodedPlayerRef.current = player;
          usingDecodeFallbackRef.current = true;
          player.onEnded(() => {
            setIsPlaying(false);
            // Auto-advance — fire next() via stateRef so it doesn't need to be in deps
            if (stateRef.current.repeatMode !== 'ONE') {
              const albumTracks = stateRef.current.currentAlbum?.tracks ?? [];
              const idx = albumTracks.findIndex(t => t.id === stateRef.current.currentTrack?.id);
              if (idx !== -1 && idx < albumTracks.length - 1) {
                const nextTrack = albumTracks[idx + 1];
                setTimeout(() => playTrack(nextTrack, stateRef.current.currentAlbum, 'LIBRARY'), 0);
              }
            } else if (stateRef.current.repeatMode === 'ONE') {
              player.play(0).catch(() => {});
            }
          });
          await player.play(0);
          setIsPlaying(true);
          console.info(`[Plajah Audio] Decode fallback playing "${track.title}" (${player.duration.toFixed(1)}s)`);
        } catch (decodeErr) {
          console.error(`[Plajah Audio] Decode fallback also failed for "${track.title}":`, decodeErr);
          diagnoseAudioUrl(url).catch(() => {});
        }
      };

      const attemptPlay = () => {
        // Resume AudioContext first so it doesn't silently swallow playback
        const ctx = audioContextRef.current;
        const doPlay = () => {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(async (e) => {
              if (e.name === 'AbortError' || e.message?.includes('interrupted')) return;
              console.error('[Plajah Audio] Native play failed:', e.name, e.message, 'URL:', track.url);

              // Run diagnostics to explain the failure
              diagnoseAudioUrl(track.url || '').catch(() => {});

              // Tier 2: try AudioContext.decodeAudioData (handles 24-bit WAV, AIFF, etc.).
              // NOT on a TV: decoding a whole master is ~250 MB of live heap on a 2 GB box, which
              // OOM-evicts the very decoder we are trying to feed. A TV goes straight to a fresh,
              // bare element — the path that plays smoothly there.
              if (track.url && !getPlatformInfo().isTV) {
                await tryDecodeFallback(track.url);
                return;
              }

              // Tier 3: fresh <audio> element without Web Audio wrapping (strips CORS/context lock)
              if (sourceRef.current) {
                try { sourceRef.current.disconnect(); } catch (_) {}
                sourceRef.current = null;
              }
              const newAud = new Audio();
              newAud.volume = audio.volume;
              newAud.src = track.url || '';
              setAudioElement(newAud);
              newAud.play().catch(pErr => {
                if (pErr.name === 'AbortError' || pErr.message?.includes('interrupted')) return;
                console.error("[Plajah Audio] All playback attempts failed:", pErr.message || pErr);
              });
            });
          }
        };

        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(doPlay).catch(doPlay);
        } else {
          doPlay();
        }
      };

      // Also attach onerror for cases where the element loads but errors out
      audio.onerror = async () => {
        if (!track.url) return;
        const err = audio.error;
        console.error(`[Plajah Audio] HTMLAudioElement error for "${track.title}": code=${err?.code} msg=${err?.message}`);
        // Offline safety net: if the network URL failed but we have a cached copy, swap it in.
        // Covers the "falsely online" case (navigator.onLine true but the fetch actually failed).
        if (!playbackBlobRef.current) {
          try {
            const cached = await getCachedMedia(track.url);
            if (cached && audio.src !== cached) {
              playbackBlobRef.current = cached;
              audio.src = cached;
              audio.play().catch(() => {});
              return;
            }
          } catch { /* */ }
        }
        diagnoseAudioUrl(track.url).catch(() => {});
        // Attempt decode fallback on load error too
        if (!usingDecodeFallbackRef.current) {
          await tryDecodeFallback(track.url);
        }
      };

      attemptPlay();
      connectAudioSource();
      
      // Initialize preloader to implicitly fetch the next track's bytes.
      // Desktop only — on mobile a second <audio> contends for the single audio-focus
      // slot and can interrupt the playing track, so we let the browser buffer natively.
      const isMobileDevice = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (!isMobileDevice && album && source === 'LIBRARY') {
        const idx = album.tracks.findIndex(t => t.id === track.id);
        let nextSrc = null;
        if (idx !== -1 && idx < album.tracks.length - 1) {
          nextSrc = album.tracks[idx + 1].url;
        } else if (stateRef.current.repeatMode === 'ALL' && album.tracks.length > 0) {
          nextSrc = album.tracks[0].url;
        }
        if (nextSrc) {
          // Warm the next track's connection + metadata only — NOT a full 'auto' download.
          // Eagerly downloading the whole next file competed with the playing stream on
          // cellular/in-car and starved it, causing the track to stall at random points.
          preloaderAudioRef.current.src = nextSrc;
          preloaderAudioRef.current.preload = 'metadata';
          preloaderAudioRef.current.load();
        }
      }
      
      updateMediaMetadata(track, album);
      setSessionPlaybackState('playing');
    } else if (source === 'VIDEO') {
      audio.pause();
    }
    
    setCurrentTrack(track);
    setCurrentAlbum(album);
    setCurrentVideo(null);
    setAudioSource(source);
    setIsPlaying(true);
  }, []);

  const playVideo = React.useCallback((video: Video) => {
    initAudioContext();
    const startVideo = async () => {
      // Always stop every audio/video source before switching — do not rely on
      // audioSource state because clearMedia() may have already nulled it out.
      if (stateRef.current.audioSource !== 'VIDEO' && stateRef.current.isPlaying) {
        await fadeOutAudio().catch(console.error);
      } else {
        audioRef.current.pause();
      }
      // Stop YouTube player unconditionally
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.stopVideo?.(); } catch (_) {}
      }
      // Pause and release the current video element unconditionally so its
      // audio track is terminated before the new element starts.
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        try { videoRef.current.load(); } catch (_) {}
      }
      setCurrentVideo(video);
      setCurrentTrack(null);
      setCurrentAlbum(null);
      setAudioSource('VIDEO');
      setIsPlaying(true);
    };
    startVideo();
  }, [fadeOutAudio, initAudioContext]);

  const snapReset = () => {};
  
  const toggleFullScreen = useCallback(() => {
    if (videoRef.current) {
      const el = videoRef.current as any;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(err => console.error(err));
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  }, []);

  const toggleAppFullScreen = useCallback(() => {
    const el = document.documentElement as any;
    
    // Check if native fullscreen is supported
    const isFullscreenSupported = document.fullscreenEnabled || (document as any).webkitFullscreenEnabled;
    
    if (!isFullscreenSupported) {
      // Fallback for iOS Safari which doesn't support document fullscreen
      if (document.body.classList.contains('mobile-fullscreen')) {
        document.body.classList.remove('mobile-fullscreen');
      } else {
        document.body.classList.add('mobile-fullscreen');
      }
      return;
    }

    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => console.log(err));
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  }, []);

  // Count a play after 15 s of continuous listening to avoid inflating skips
  useEffect(() => {
    if (!currentTrack || audioSource === 'VIDEO') return;
    const trackId = currentTrack.id;
    if (playCountedTrackRef.current === trackId) return;

    const timer = setTimeout(() => {
      if (stateRef.current.currentTrack?.id === trackId && stateRef.current.isPlaying) {
        playCountedTrackRef.current = trackId;
        const album = stateRef.current.currentAlbum;
        // Counted server-side. The direct writes that used to live here were BOTH being denied:
        // the track_stats rule permits only ['playCount'] to change and this also sent
        // lastPlayed, while the albums rule requires the document owner — so a listener who
        // wasn't the artist could never increment it. Both failures were swallowed by
        // .catch(() => {}), which is why play counts looked real but were near zero.
        trackStart(trackId, 'track', (album as any)?.ownerId);
        if (album?.id) trackStart(album.id, 'album', (album as any)?.ownerId);
      }
    }, 15000);

    return () => clearTimeout(timer);
  }, [currentTrack?.id, audioSource]);

  const incrementPlayCount = async (id: string, type: 'TRACK' | 'VIDEO') => {
    // Delegated to the 15-second effect above; kept for API compatibility
  };

  const seek = useCallback((time: number) => {
    if (stateRef.current.audioSource === 'VIDEO') {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        ytPlayerRef.current.seekTo(time, true);
        setCurrentTime(time);
      } else if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    } else {
      audioRef.current.currentTime = time;
      setSessionPosition(audioRef.current);
    }
  }, []);

  const next = React.useCallback(() => {
    if (stateRef.current.audioSource === 'VIDEO') return;
    const album = stateRef.current.currentAlbum;
    if (album && stateRef.current.currentTrack) {
      const nid = pickNextId();                       // shuffle / repeat aware
      const t = nid ? album.tracks.find(x => x.id === nid) : null;
      if (t) playTrack(t, album, 'LIBRARY');
      else pause();
    }
  }, [playTrack, pause, pickNextId]);

  const prev = React.useCallback(() => {
    if (stateRef.current.audioSource === 'VIDEO') return;
    if (stateRef.current.currentTime > 3) {
      seek(0);
      return;
    }
    if (stateRef.current.currentAlbum && stateRef.current.currentTrack) {
      const idx = stateRef.current.currentAlbum.tracks.findIndex(t => t.id === stateRef.current.currentTrack?.id);
      if (idx > 0) {
        playTrack(stateRef.current.currentAlbum.tracks[idx - 1], stateRef.current.currentAlbum, 'LIBRARY');
      } else {
        seek(0);
      }
    }
  }, [playTrack, seek]);

  // ── Scratch (DJ) — drive the streaming <audio> like a jog wheel. Drag maps to a
  //    time delta (scrub) + a playback-rate pitch bend, so you hear the record move.
  const scratchRef = useRef({ active: false, wasPlaying: false });
  const beginScratch = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio || stateRef.current.audioSource === 'VIDEO') return;
    scratchRef.current.active = true;
    scratchRef.current.wasPlaying = !audio.paused;
    try { audio.playbackRate = 1; } catch { /* */ }
  }, []);
  const scratchBy = React.useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !scratchRef.current.active) return;
    const dur = audio.duration || 0;
    const next = Math.max(0, Math.min(dur ? dur - 0.06 : 0, (audio.currentTime || 0) + deltaSeconds));
    try {
      audio.currentTime = next;
      audio.playbackRate = Math.min(4, Math.max(0.25, 0.3 + Math.abs(deltaSeconds) * 26)); // faster drag = higher pitch
      if (audio.paused) audio.play().catch(() => {});
    } catch { /* */ }
  }, []);
  const endScratch = React.useCallback(() => {
    const audio = audioRef.current;
    scratchRef.current.active = false;
    if (!audio) return;
    try { audio.playbackRate = 1; } catch { /* */ }
    if (scratchRef.current.wasPlaying) { intendedPlayingRef.current = true; audio.play().catch(() => {}); }
    else audio.pause();
  }, []);

  const onEnded = useCallback(() => {
    const state = stateRef.current;
    // Reaching the end is the clearest completion signal there is — record it before any
    // repeat/advance logic changes the current track out from under us.
    if (state.currentTrack?.id && state.audioSource !== 'VIDEO') {
      trackComplete(state.currentTrack.id, 'track', undefined, (state.currentAlbum as any)?.ownerId);
    }
    if (state.repeatMode === 'ONE') {
      if (state.audioSource === 'VIDEO') {
        seek(0);
        resume();
      } else {
        const audio = audioRef.current;
        audio.currentTime = 0;
        audio.play().catch(e => {
          if (e.name === 'AbortError' || e.message?.includes('interrupted')) return;
          console.error("End-of-track replay failed:", e);
        });
      }
    } else {
      next();
    }
  }, [next, seek, resume]);

  const togglePlay = useCallback(() => {
    if (stateRef.current.isPlaying) pause();
    else resume();
  }, [pause, resume]);

  const setVolume = (v: number) => {
    setVolumeState(v);
    audioRef.current.volume = v;
    if (videoRef.current) videoRef.current.volume = v;
  };

  // Track YouTube Player Progress
  useEffect(() => {
    let interval: any;
    if (isPlaying && (audioSource === 'VIDEO' || audioSource === 'RADIO')) {
      interval = setInterval(() => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
          try {
            const time = ytPlayerRef.current.getCurrentTime();
            const dur = ytPlayerRef.current.getDuration();
            if (dur > 0) setDuration(dur);
            
            setCurrentTime(time);
            stateRef.current.currentTime = time;

            // Check if ended (state 0)
            if (typeof ytPlayerRef.current.getPlayerState === 'function' && ytPlayerRef.current.getPlayerState() === 0) {
              onEnded();
            }
          } catch (e) {
            // Silently fail to avoid "Script error" in global handler
            if (process.env.NODE_ENV === 'development') {
              console.warn("YouTube poll error:", e);
            }
          }
        } else if (videoRef.current && audioSource === 'VIDEO') {
          const time = videoRef.current.currentTime;
          setCurrentTime(time);
          stateRef.current.currentTime = time;
          if (videoRef.current.duration) setDuration(videoRef.current.duration);
          
          if (videoRef.current.ended) {
            onEnded();
          }
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, audioSource, currentVideo, onEnded]);

  // Smooth, stall-proof clock for AUDIO playback (music/podcasts).
  // The browser's `timeupdate` event fires irregularly and can stall for seconds
  // under main-thread load (this player runs several rAF audio visualizers), which
  // froze synced lyrics mid-song and then jumped them out of sync. Driving the
  // clock from requestAnimationFrame against audio.currentTime keeps the lyrics and
  // scrubber progressing continuously. (Video/Radio use the YouTube poll above.)
  useEffect(() => {
    if (!isPlaying || audioSource === 'VIDEO' || audioSource === 'RADIO') return;
    let raf = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended) {
        const t = audio.currentTime;
        stateRef.current.currentTime = t;              // exact, every frame
        if (now - lastUpdate >= 60) {                  // ~16fps state updates: smooth + cheap
          lastUpdate = now;
          setCurrentTime(prev => (Math.abs(prev - t) >= 0.03 ? t : prev));
          // Gapless: once we're within ~20s of the end, prewarm the next track's bytes so the
          // hand-off is instant. Self-dedupes + bounded, so this cheap call is safe here.
          const dur = audio.duration;
          if (dur && isFinite(dur) && dur - t <= 20 && dur - t > 0.3) warmNextTrack();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, audioSource]);

  // Release any prewarmed next-track blob + in-flight warm on unmount (no leaks).
  useEffect(() => () => { discardPrewarm(); if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; } }, []);

  // When an album loads, warm the transcoded-stream cache for its tracks so the FIRST play is
  // already HLS (not the cold original). Cheap Firestore reads, cached + deduped.
  useEffect(() => {
    // Prefetching a whole album's stream manifests is cheap on a laptop and not on a TV SoC,
    // where the same cores are decoding video. Playback resolves per-track instead.
    if (skipOnTV('transcode')) return;
    const ids = currentAlbum?.tracks?.map(t => t.id).filter(Boolean) as string[] | undefined;
    if (ids?.length) prefetchTrackStreams(ids);
  }, [currentAlbum?.id]); // eslint-disable-line

  // Honor the creator's "Slideshow" toggle. `isSlideshowEnabled` is set in the uploader but was
  // read by nothing, so turning it on had no effect anywhere — the nano player stayed on its cover
  // face and the album view kept the plain backdrop. Now it opens the album ON the slideshow.
  //
  // Keyed on album id so this fires once per release: the listener can still flip back to the
  // cover/visualizer, and that choice sticks until they move to a different album.
  useEffect(() => {
    if (!currentAlbum) return;
    // Only auto-start when there are real images to show — falling back to a lone cover image
    // would be a "slideshow" of one frame, which just hides the cover art behind a worse version.
    const on = !!currentAlbum.isSlideshowEnabled && hasRealSlides(currentAlbum, currentAlbum.tracks);
    setSlideshowActiveRaw(on);
    setIsSlideshowAuto(on);
  }, [currentAlbum?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a TV, music with nothing on screen is a black rectangle. After 20 seconds of continuous
  // playback the album's slideshow takes over on its own — the lean-back equivalent of the
  // creator toggle above, but for every album rather than only opted-in ones.
  //
  // Marked as an AUTO start, so it drives the ambient surfaces and never the full-screen
  // takeover, and so any deliberate flip by the viewer permanently wins over it.
  useEffect(() => {
    const platform = getPlatformInfo();
    if (!platform.isTV) return;                       // lean-back behaviour only
    if (!isPlaying || audioSource !== 'LIBRARY') return;
    if (isSlideshowActive) return;                    // already showing
    if (!currentAlbum || !hasRealSlides(currentAlbum, currentAlbum.tracks)) return;
    const t = setTimeout(() => {
      // Re-check on fire: 20s is long enough for the listener to have paused, skipped, or
      // turned the slideshow on themselves.
      setSlideshowActiveRaw(true);
      setIsSlideshowAuto(true);
    }, 20_000);
    return () => clearTimeout(t);
  }, [isPlaying, audioSource, currentAlbum?.id, isSlideshowActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live quality switch: when the listener changes their audio-quality tier (data/high/lossless),
  // re-resolve the CURRENTLY-playing track at the new tier and seek back to where they were — but
  // only when a ready transcoded stream exists (otherwise quality is moot, it's the original file)
  // and only while actually playing, so a paused track just picks up the new tier on next play.
  useEffect(() => {
    const onQualityChanged = () => {
      const s = stateRef.current;
      if (!s.currentTrack || s.audioSource === 'VIDEO' || !s.isPlaying) return;
      const ready = peekTrackStream(s.currentTrack.id);
      if (!ready || ready.status !== 'ready') return;
      const at = Math.max(0, s.currentTime || 0);
      playTrack(s.currentTrack, s.currentAlbum, s.audioSource as 'LIBRARY' | 'RADIO', at, true);
    };
    window.addEventListener('chora:quality-changed', onQualityChanged);
    return () => window.removeEventListener('chora:quality-changed', onQualityChanged);
  }, [playTrack]);

  // Feed the retention curve. Only newly-covered ground is ever reported (contentMetrics
  // dedupes by decile), so this is safe to run on the normal progress tick and a listener
  // scrubbing back and forth cannot inflate anything.
  useEffect(() => {
    const t = stateRef.current.currentTrack;
    if (!t?.id || audioSource === 'VIDEO') return;
    const dur = duration || (t as any)?.duration || 0;
    if (!(dur > 0) || !isPlaying) return;
    trackProgress(t.id, 'track', currentTime, dur, (stateRef.current.currentAlbum as any)?.ownerId);
  }, [currentTime, isPlaying, duration, audioSource]);

  // Connectivity returning is the single best moment to retry: the retry ladder may already have
  // given up, and without this the track stays stopped until the listener notices and presses
  // play. Also covers a laptop waking or a phone leaving a dead zone.
  useEffect(() => {
    const onOnline = () => {
      const audio = audioRef.current;
      if (!intendedPlayingRef.current || !audio || audio.ended || !audio.paused) return;
      resumeRecoveryRef.current.tries = 0;   // fresh budget: the cause of the failure is gone
      scheduleResumeRecovery();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [scheduleResumeRecovery]);

  // Console helper for triggering + backfilling transcodes on production (source .ts files aren't
  // served in a prod build, so `import()` fails — use these instead). Reuses the app's auth token.
  //   await __chora.transcodeCurrentAlbum()        // the album playing now
  //   await __chora.transcode('<trackId>','<masterUrl>')
  //   await __chora.getStream('<trackId>')          // inspect status
  //   await __chora.backfillEverything()            // the WHOLE public catalog (leave tab open)
  useEffect(() => {
    (window as any).__chora = {
      transcode: (trackId: string, srcUrl: string) => enqueueTranscode(trackId, srcUrl),
      transcodeCurrentAlbum: () => enqueueAlbumTranscodes((stateRef.current.currentAlbum?.tracks as any) || []),
      backfillAlbum: (tracks: any[]) => enqueueAlbumTranscodes(tracks),
      getStream: (trackId: string) => getTrackStream(trackId),
      // Backfill the entire public catalogue. Each track transcodes fully before the next
      // (the endpoint is synchronous), so this is slow but safe — it won't stampede the server.
      // Re-runnable: already-ready/processing tracks are skipped, so you can stop and resume.
      backfillEverything: async () => {
        const albums = await fetchAllPublicAlbums();
        const music = (albums || []).filter((a: any) =>
          a && a.type !== 'BOOK' && Array.isArray(a.tracks) && a.tracks.length);
        const totalTracks = music.reduce((n: number, a: any) => n + a.tracks.length, 0);
        console.log(`%c[chora backfill] ${music.length} albums · ~${totalTracks} tracks. Keep this tab open — each track transcodes fully before the next, so this can take a while.`, 'color:#FF8C00;font-weight:bold');
        let processed = 0;
        for (let i = 0; i < music.length; i++) {
          const a = music[i];
          const n = await enqueueAlbumTranscodes(a.tracks);
          processed += n;
          console.log(`[chora backfill] (${i + 1}/${music.length}) "${a.title || a.id}" — +${n} · running total ${processed}`);
        }
        console.log(`%c[chora backfill] DONE — ${processed} tracks transcoded across ${music.length} albums.`, 'color:#22c55e;font-weight:bold');
        return processed;
      },
    };
    return () => { try { delete (window as any).__chora; } catch { /* */ } };
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', resume);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
         if (details.seekTime !== undefined) seek(details.seekTime);
      });
      try {
        navigator.mediaSession.setActionHandler('seekbackward', (d) => { const a = audioRef.current; seek(Math.max(0, a.currentTime - (d.seekOffset || 10))); });
        navigator.mediaSession.setActionHandler('seekforward', (d) => { const a = audioRef.current; seek(Math.min(a.duration || Infinity, a.currentTime + (d.seekOffset || 10))); });
      } catch { /* some browsers don't support these actions */ }
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        try {
          navigator.mediaSession.setActionHandler('seekbackward', null);
          navigator.mediaSession.setActionHandler('seekforward', null);
        } catch { /* */ }
      }
    };
  }, [resume, pause, prev, next, seek]);

  useEffect(() => {
    const audio = audioRef.current;

    const isPodcastNow = () => {
      const tr = stateRef.current.currentTrack, al = stateRef.current.currentAlbum;
      return !!tr && (al?.subType === 'PODCAST' || !!tr.podcastMetadata);
    };
    const persistProgress = () => {
      const tr = stateRef.current.currentTrack;
      if (tr && isPodcastNow() && audio.currentTime > 0) saveProgress(tr.id, audio.currentTime, audio.duration || 0);
    };

    const onTimeUpdate = () => {
      const time = audio.currentTime;
      stateRef.current.currentTime = time;

      setCurrentTime(prev => {
        if (Math.abs(prev - time) >= 0.05 || time === 0) {
          return time;
        }
        return prev;
      });

      // Persist podcast-episode progress (throttled ~5s) so listeners can resume where they left off.
      if (isPodcastNow() && time > 0) {
        const now = Date.now();
        if (now - lastProgressSaveRef.current > 5000) { lastProgressSaveRef.current = now; persistProgress(); }
      }
    };
    const onDurationChange = () => { setDuration(audio.duration); setSessionPosition(audio); };
    const onPlay = () => { setIsPlaying(true); setSessionPlaybackState('playing'); setSessionPosition(audio); resumeRecoveryRef.current.tries = 0; };
    const onPause = () => {
      setIsPlaying(false); persistProgress(); setSessionPlaybackState('paused'); // capture latest position on pause
      // If we didn't ask to pause and the track isn't over, this is an interruption — recover.
      if (intendedPlayingRef.current && !audio.ended) scheduleResumeRecovery();
    };
    const onStalled = () => { if (intendedPlayingRef.current && audio.paused && !audio.ended) scheduleResumeRecovery(); };
    const onError = (e: any) => {
      if (!audio.src || audio.src === window.location.href) return;

      const errorMsg = audio.error ? 
        `Code: ${audio.error.code}, Message: ${audio.error.message}` : 
        (e.message || "Unknown Audio Error");

      console.error("Global Audio Error Event:", errorMsg, "Source:", audio.src);

      if (stateRef.current.currentTrack && (audio.crossOrigin === "anonymous" || audio.src.includes('/api/proxy'))) {
        const newAudio = new Audio();
        newAudio.volume = audio.volume;
        newAudio.src = audio.src;
        newAudio.currentTime = audio.currentTime;
        
        audio.pause();
        audio.src = "";
        audio.load();

        setAudioElement(newAudio);
        
        newAudio.play().catch(pErr => {
          if (pErr.name === 'AbortError' || pErr.message?.includes('interrupted')) return;
          console.error("Recovery playback failed:", pErr.message || pErr);
        });
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioElement, onEnded, scheduleResumeRecovery]);

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack && currentAlbum) {
      const imageUrl = currentTrack.images?.[0] || currentTrack.albumCover || currentAlbum.coverImage;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentAlbum.artist || currentTrack.artist || 'Unknown Artist',
        album: currentAlbum.title || currentTrack.albumTitle || 'Unknown Album',
        artwork: imageUrl ? [
          { src: imageUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: imageUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: imageUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: imageUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: imageUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: imageUrl, sizes: '512x512', type: 'image/jpeg' },
        ] : []
      });
    }
  }, [currentTrack, currentAlbum]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        resume();
        navigator.mediaSession.playbackState = 'playing';
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        pause();
        navigator.mediaSession.playbackState = 'paused';
      });
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
    }
  }, [resume, pause, prev, next, seek]);

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack && duration > 0 && currentTime >= 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1.0,
          position: currentTime
        });
      } catch (e) {
        // Some browsers might throw if data is inconsistent
      }
    }
  }, [currentTrack, duration, currentTime]);

  const setSpatialMode = useCallback((mode: 'off' | 'orbit' | 'reactive') => {
    setSpatialModeState(mode);
    setIsSpatialAudioEnabledState(mode !== 'off');

    const panner = pannerRef.current;
    const bypassGain = bypassGainRef.current;
    const pannerInputGain = pannerInputGainRef.current;
    cancelAnimationFrame(spatialAnimRef.current);

    if (mode === 'off') {
      if (bypassGain) bypassGain.gain.value = 1;
      if (pannerInputGain) pannerInputGain.gain.value = 0;
      if (panner) { panner.positionX.value = 0; panner.positionY.value = 0; panner.positionZ.value = -1; }
      return;
    }

    // Activate panner path
    if (bypassGain) bypassGain.gain.value = 0;
    if (pannerInputGain) pannerInputGain.gain.value = 1;

    if (!panner) return;

    if (mode === 'orbit') {
      let angle = 0;
      const tick = () => {
        angle += 0.008;
        panner.positionX.value = Math.sin(angle) * 3;
        panner.positionY.value = Math.sin(angle * 0.5) * 0.5;
        panner.positionZ.value = Math.cos(angle) * 3;
        spatialAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    } else if (mode === 'reactive') {
      // Music-reactive HRTF: bass controls depth, treble drives rotation speed,
      // mid lifts/lowers the source, beat pulses the source toward the listener.
      let angle = 0;
      let beatDecay = 0;
      let lastBass = 0;
      const data = new Uint8Array(2048);
      const tick = () => {
        const analyser = analyserRef.current;
        if (analyser) {
          analyser.getByteFrequencyData(data);
          let bass = 0, mid = 0, treble = 0;
          for (let i = 0; i < 5; i++) bass += data[i];
          for (let i = 8; i < 24; i++) mid += data[i];
          for (let i = 40; i < 80; i++) treble += data[i];
          bass = (bass / 5) / 255;
          mid = (mid / 16) / 255;
          treble = (treble / 40) / 255;

          // Beat onset — pulse source toward listener
          if (bass > lastBass * 1.3 && bass > 0.25) beatDecay = 1.0;
          else beatDecay = Math.max(0, beatDecay - 0.05);
          lastBass = bass;

          // Rotation speed proportional to treble energy
          angle += 0.004 + treble * 0.014;
          const dist = 1.2 + (1 - bass) * 2;    // bass energy pulls closer
          const height = mid * 1.5 - 0.5;         // mid lifts the source
          const beatPush = beatDecay * -1.8;       // beat kicks source forward

          panner.positionX.value = Math.sin(angle) * dist;
          panner.positionZ.value = Math.cos(angle) * dist + beatPush;
          panner.positionY.value = height;
        }
        spatialAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    }
  }, []);

  // Backward-compat shim — existing code calls setSpatialAudioEnabled(bool)
  const setSpatialAudioEnabled = useCallback((val: boolean) => {
    setSpatialMode(val ? 'orbit' : 'off');
  }, [setSpatialMode]);

  // Registers a video as the active source without touching videoRef.current.
  // Safe to call from VideoPlayer's mount effect — doesn't clear the video element's src.
  const activateVideoSource = useCallback((video: Video) => {
    audioRef.current.pause();
    audioRef.current.src = '';
    try { ytPlayerRef.current?.stopVideo?.(); } catch (_) {}
    setCurrentVideo(video);
    setCurrentTrack(null);
    setCurrentAlbum(null);
    setAudioSource('VIDEO');
    setIsPlaying(true);
  }, []);

  const clearMedia = useCallback(() => {
    intendedPlayingRef.current = false;
    if (resumeRecoveryRef.current.timer) { clearTimeout(resumeRecoveryRef.current.timer); resumeRecoveryRef.current.timer = null; }
    // Stop YouTube player
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.stopVideo?.(); } catch (_) {}
    }
    // Stop and release the HTML video element so its audio track is fully terminated
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      try { videoRef.current.load(); } catch (_) {}
    }
    // Stop music audio element
    audioRef.current.pause();
    setCurrentTrack(null);
    setCurrentAlbum(null);
    setCurrentVideo(null);
    setAudioSource(null);
    setIsPlaying(false);
  }, []);

  // Blueprint Thread 3: ONE watch/listen-history model serves Reello, Taleo AND Chora.
  // Record listening progress (throttled) so "Continue listening" works like Continue Watching.
  useEffect(() => {
    if (!isPlaying || !currentTrack || audioSource === 'VIDEO' || audioSource === 'RADIO') return;
    const save = async () => {
      const audio = audioRef.current;
      const positionSec = audio?.currentTime || 0;
      const durationSec = audio?.duration || 0;
      if (!(positionSec > 5 && durationSec > 0)) return;
      choraHistoryRef.current = Date.now();
      try {
        const { recordProgress } = await import('../services/watchHistoryService');
        await recordProgress({
          id: currentTrack.id,
          kind: 'CHORA',
          title: currentTrack.title,
          thumbnailUrl: (currentAlbum as any)?.coverArt || (currentTrack as any)?.coverArt || undefined,
          ownerName: (currentAlbum as any)?.artistName || (currentTrack as any)?.artist || undefined,
          positionSec, durationSec,
        });
      } catch { /* best-effort */ }
    };
    const iv = setInterval(save, 15000);
    return () => { clearInterval(iv); void save(); };   // also save on pause / track change
  }, [isPlaying, currentTrack?.id, audioSource]); // eslint-disable-line react-hooks/exhaustive-deps

  const contextValue: GlobalPlayerContextType = useMemo(() => ({
    currentTrack, currentAlbum, currentVideo, isPlaying, volume, audioSource, repeatMode, setRepeatMode,
    isShuffle, setIsShuffle, nextTrackId,
    playTrack, playVideo, setVideoElement, setYtPlayer, setCurrentVideo, setCurrentTrack, pause, resume, togglePlay, setVolume, next, prev, beginScratch, scratchBy, endScratch,
    analyser: analyserRef.current, getAudioContext, setDjFilter, resetAudioFx, isFxActive, isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled, visualizerType, setVisualizerType, isSlideshowActive, setIsSlideshowActive, isSlideshowAuto,
    isNanoView, setIsNanoView, isNanoDocked, setIsNanoDocked, isUserActive, setIsUserActive, nanoPosition, setNanoPosition, snapReset, theme, setTheme, isBigScreen: theme === 'BIG_SCREEN',
    isTVMode, setIsTVMode, isPhoneMode, isShrunk, setIsShrunk, isMinimized, setIsMinimized, transportForced, setTransportForced, isThreeDEnabled, setIsThreeDEnabled,
    isSpatialAudioEnabled, setSpatialAudioEnabled,
    spatialMode, setSpatialMode, dolbySupport, isAtmosActive,
    toggleFullScreen, toggleAppFullScreen, view, setView, isMiniPlayerActive, setIsMiniPlayerActive, incrementPlayCount, clearMedia, activateVideoSource,
    isPlayerExpanded, setIsPlayerExpanded,
  }), [
    currentTrack, currentAlbum, currentVideo, isPlaying, volume, audioSource, repeatMode, setRepeatMode,
    isShuffle, setIsShuffle, nextTrackId,
    playTrack, playVideo, setVideoElement, setYtPlayer, setCurrentVideo, setCurrentTrack, pause, resume, togglePlay, setVolume, next, prev, beginScratch, scratchBy, endScratch,
    getAudioContext, setDjFilter, resetAudioFx, isFxActive, isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled, visualizerType, setVisualizerType, isSlideshowActive, setIsSlideshowActive, isSlideshowAuto,
    isNanoView, setIsNanoView, isNanoDocked, setIsNanoDocked, isUserActive, setIsUserActive, nanoPosition, setNanoPosition, snapReset, theme, setTheme,
    isTVMode, setIsTVMode, isPhoneMode, isShrunk, setIsShrunk, isMinimized, setIsMinimized, transportForced, setTransportForced, isThreeDEnabled, setIsThreeDEnabled,
    isSpatialAudioEnabled, setSpatialAudioEnabled,
    spatialMode, setSpatialMode, dolbySupport, isAtmosActive,
    view, setView, isMiniPlayerActive, setIsMiniPlayerActive, incrementPlayCount, clearMedia, activateVideoSource,
    isPlayerExpanded, setIsPlayerExpanded,
  ]);

  const progressValue: GlobalPlayerProgressContextType = useMemo(() => ({
    currentTime,
    duration,
    seek
  }), [currentTime, duration, seek]);

  return (
    <GlobalPlayerContext.Provider value={contextValue}>
      <GlobalPlayerProgressContext.Provider value={progressValue}>
        {children}
      </GlobalPlayerProgressContext.Provider>
    </GlobalPlayerContext.Provider>
  );
};

export const useGlobalPlayer = () => {
  const context = useContext(GlobalPlayerContext);
  const progress = useContext(GlobalPlayerProgressContext);
  if (context === undefined || progress === undefined) {
    throw new Error('useGlobalPlayer must be used within a GlobalPlayerProvider');
  }
  // To prevent breaking existing consumers, we return the combined object.
  // BUT: components that only need static data should use useGlobalPlayerState()
  // and components that only need progress should use useGlobalPlayerProgress()
  return { ...context, ...progress };
};

export const useGlobalPlayerState = () => {
  const context = useContext(GlobalPlayerContext);
  if (context === undefined) {
    throw new Error('useGlobalPlayerState must be used within a GlobalPlayerProvider');
  }
  return context;
};

export const useGlobalPlayerProgress = () => {
  const context = useContext(GlobalPlayerProgressContext);
  if (context === undefined) {
    throw new Error('useGlobalPlayerProgress must be used within a GlobalPlayerProvider');
  }
  return context;
};
