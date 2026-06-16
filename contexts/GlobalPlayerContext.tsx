import React, { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Track, Album, Video } from '../types';
import { doc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/backendService';
import { diagnoseAudioUrl, createDecodeAudioPlayer, type DecodedAudioPlayer } from '../services/audioFormatService';

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
  playTrack: (track: Track, album: Album | null, source: 'LIBRARY' | 'RADIO' | 'VIDEO') => void;
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
  analyser: AnalyserNode | null;
  isFrequencyVisualizerEnabled: boolean;
  setIsFrequencyVisualizerEnabled: (val: boolean) => void;
  visualizerType: 'FLOW' | 'PAINT';
  setVisualizerType: (t: 'FLOW' | 'PAINT') => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  isNanoView: boolean;
  setIsNanoView: (val: boolean) => void;
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
  isThreeDEnabled: boolean;
  setIsThreeDEnabled: (val: boolean) => void;
  isSpatialAudioEnabled: boolean;
  setSpatialAudioEnabled: (val: boolean) => void;
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
  const [isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled] = useState(true);
  const [visualizerType, setVisualizerType] = useState<'FLOW' | 'PAINT'>('FLOW');
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [isNanoView, setIsNanoView] = useState(true);
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
  const [isTVMode, setIsTVMode] = useState(false);
  const [isMiniPlayerActive, setIsMiniPlayerActive] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [isShrunk, setIsShrunk] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isThreeDEnabled, setIsThreeDEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playCountedTrackRef = useRef<string | null>(null);
  const ytPlayerRef = useRef<any | null>(null);
  const stateRef = useRef({ repeatMode, currentAlbum, currentTrack, currentVideo, isPlaying, audioSource, currentTime, ytPlayer: null as any });
  const audioRef = useRef<HTMLAudioElement>(audioElement);
  const preloaderAudioRef = useRef<HTMLAudioElement>(new Audio());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  // Fallback decode player for formats the <audio> element can't handle (24-bit WAV, AIFF, etc.)
  const decodedPlayerRef = useRef<DecodedAudioPlayer | null>(null);
  const usingDecodeFallbackRef = useRef(false);
  const pannerRef = useRef<PannerNode | null>(null);
  const bypassGainRef = useRef<GainNode | null>(null);
  const pannerInputGainRef = useRef<GainNode | null>(null);
  const spatialAnimRef = useRef<number>(0);
  const [isSpatialAudioEnabled, setIsSpatialAudioEnabledState] = useState(false);
  const contextRef = useRef<GlobalPlayerContextType | null>(null);
  const wakeLockRef = useRef<any>(null);

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

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
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

  const connectAudioSource = useCallback(() => {
    // Disable Web Audio API connections on mobile to allow background playback
    // (Mobile browsers often block or suspend Web Audio API in background)
    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isMobile) return;

    const audio = audioRef.current;
    if (audioContextRef.current && analyserRef.current && !sourceRef.current) {
      try {
        const source = audioContextRef.current.createMediaElementSource(audio);
        if (pannerRef.current && bypassGainRef.current && pannerInputGainRef.current) {
          // Dual-path graph — only the active path carries audio:
          // Bypass path (default, no HRTF coloring): source → bypassGain → analyser → destination
          // Spatial path (Eclipsa only):              source → pannerInputGain → panner → analyser → destination
          source.connect(bypassGainRef.current);
          source.connect(pannerInputGainRef.current);
          bypassGainRef.current.connect(analyserRef.current);
          pannerInputGainRef.current.connect(pannerRef.current);
          pannerRef.current.connect(analyserRef.current);
        } else {
          source.connect(analyserRef.current);
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
    stateRef.current = { repeatMode, currentAlbum, currentTrack, currentVideo, isPlaying, audioSource, currentTime, ytPlayer: ytPlayerRef.current };
  }, [repeatMode, currentAlbum, currentTrack, currentVideo, isPlaying, audioSource, currentTime]);

  const setYtPlayer = useCallback((player: any | null) => {
    ytPlayerRef.current = player;
    stateRef.current.ytPlayer = player;
  }, []);

  const pause = useCallback(() => {
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

  const playTrack = React.useCallback((track: Track, album: Album | null, source: 'LIBRARY' | 'RADIO' | 'VIDEO') => {
    let audio = audioRef.current;
    const isNewTrack = stateRef.current.currentTrack?.id !== track.id || stateRef.current.audioSource === 'VIDEO';

    initAudioContext();

    stateRef.current.currentTrack = track;
    stateRef.current.currentAlbum = album;
    stateRef.current.audioSource = source;
    stateRef.current.isPlaying = true;

    if (isNewTrack) {
      setSpatialAudioEnabled(!!track.isEclipsa);
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
        if (isExternal) {
          audio.crossOrigin = "anonymous";
        } else {
          audio.removeAttribute('crossorigin');
        }
        try {
          if (audio.src !== track.url) {
            audio.src = track.url;
            // DO NOT call audio.load() — breaks iOS background sequential playback
          }
        } catch (e) {
          console.error("Audio src assignment failed:", e);
        }
      }

      /**
       * Fallback: fetch + AudioContext.decodeAudioData for formats the
       * <audio> element can't handle (24/32-bit WAV, AIFF, ALAC, etc.)
       */
      const tryDecodeFallback = async (url: string) => {
        const ctx = audioContextRef.current;
        if (!ctx) return;
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

              // Tier 2: try AudioContext.decodeAudioData (handles 24-bit WAV, AIFF, etc.)
              if (track.url) {
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
        diagnoseAudioUrl(track.url).catch(() => {});
        // Attempt decode fallback on load error too
        if (!usingDecodeFallbackRef.current) {
          await tryDecodeFallback(track.url);
        }
      };

      attemptPlay();
      connectAudioSource();
      
      // Initialize preloader to implicitly fetch the next track's bytes
      if (album && source === 'LIBRARY') {
        const idx = album.tracks.findIndex(t => t.id === track.id);
        let nextSrc = null;
        if (idx !== -1 && idx < album.tracks.length - 1) {
          nextSrc = album.tracks[idx + 1].url;
        } else if (stateRef.current.repeatMode === 'ALL' && album.tracks.length > 0) {
          nextSrc = album.tracks[0].url;
        }
        if (nextSrc) {
          preloaderAudioRef.current.src = nextSrc;
          preloaderAudioRef.current.preload = 'auto';
          preloaderAudioRef.current.load();
        }
      }
      
      if ('mediaSession' in navigator) {
        const imageUrl = track.images?.[0] || track.albumCover || album?.coverImage;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: album?.artist || track.artist || 'Unknown Artist',
          album: album?.title || track.albumTitle || 'Unknown Album',
          ...(imageUrl ? {
            artwork: [{ src: imageUrl, sizes: '512x512', type: 'image/jpeg' }]
          } : {})
        });
      }
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
        const albumId = stateRef.current.currentAlbum?.id;
        setDoc(doc(db, 'track_stats', trackId), {
          trackId,
          albumId: albumId || null,
          playCount: increment(1),
          lastPlayed: Date.now(),
        }, { merge: true }).catch(() => {});
        if (albumId) {
          updateDoc(doc(db, 'albums', albumId), { playCount: increment(1) }).catch(() => {});
        }
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
    }
  }, []);

  const next = React.useCallback(() => {
    if (stateRef.current.audioSource === 'VIDEO') return;
    if (stateRef.current.currentAlbum && stateRef.current.currentTrack) {
      const idx = stateRef.current.currentAlbum.tracks.findIndex(t => t.id === stateRef.current.currentTrack?.id);
      if (idx !== -1) {
        if (idx < stateRef.current.currentAlbum.tracks.length - 1) {
          playTrack(stateRef.current.currentAlbum.tracks[idx + 1], stateRef.current.currentAlbum, 'LIBRARY');
        } else if (stateRef.current.repeatMode === 'ALL') {
          playTrack(stateRef.current.currentAlbum.tracks[0], stateRef.current.currentAlbum, 'LIBRARY');
        } else {
          pause();
        }
      }
    }
  }, [playTrack, pause]);

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

  const onEnded = useCallback(() => {
    const state = stateRef.current;
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

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', resume);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
         if (details.seekTime !== undefined) seek(details.seekTime);
      });
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [resume, pause, prev, next, seek]);

  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      const time = audio.currentTime;
      stateRef.current.currentTime = time;
      
      setCurrentTime(prev => {
        if (Math.abs(prev - time) >= 0.05 || time === 0) {
          return time;
        }
        return prev;
      });
    };
    const onDurationChange = () => setDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
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
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioElement, onEnded]);

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

  const setSpatialAudioEnabled = useCallback((val: boolean) => {
    setIsSpatialAudioEnabledState(val);
    const panner = pannerRef.current;
    const bypassGain = bypassGainRef.current;
    const pannerInputGain = pannerInputGainRef.current;
    cancelAnimationFrame(spatialAnimRef.current);
    if (val) {
      // Route audio through HRTF panner, mute transparent bypass
      if (bypassGain) bypassGain.gain.value = 0;
      if (pannerInputGain) pannerInputGain.gain.value = 1;
      if (panner) {
        // Slowly orbit the audio source in the horizontal plane
        let angle = 0;
        const animate = () => {
          angle += 0.008;
          const radius = 3;
          panner.positionX.value = Math.sin(angle) * radius;
          panner.positionY.value = Math.sin(angle * 0.5) * 0.5;
          panner.positionZ.value = Math.cos(angle) * radius;
          spatialAnimRef.current = requestAnimationFrame(animate);
        };
        animate();
      }
    } else {
      // Route audio through transparent bypass — panner receives no signal, zero HRTF coloring
      if (bypassGain) bypassGain.gain.value = 1;
      if (pannerInputGain) pannerInputGain.gain.value = 0;
      if (panner) {
        panner.positionX.value = 0;
        panner.positionY.value = 0;
        panner.positionZ.value = -1;
      }
    }
  }, []);

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

  const contextValue: GlobalPlayerContextType = useMemo(() => ({
    currentTrack, currentAlbum, currentVideo, isPlaying, volume, audioSource, repeatMode, setRepeatMode,
    playTrack, playVideo, setVideoElement, setYtPlayer, setCurrentVideo, setCurrentTrack, pause, resume, togglePlay, setVolume, next, prev,
    analyser: analyserRef.current, isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled, visualizerType, setVisualizerType, isSlideshowActive, setIsSlideshowActive,
    isNanoView, setIsNanoView, isUserActive, setIsUserActive, nanoPosition, setNanoPosition, snapReset, theme, setTheme, isBigScreen: theme === 'BIG_SCREEN',
    isTVMode, setIsTVMode, isPhoneMode, isShrunk, setIsShrunk, isMinimized, setIsMinimized, isThreeDEnabled, setIsThreeDEnabled,
    isSpatialAudioEnabled, setSpatialAudioEnabled,
    toggleFullScreen, toggleAppFullScreen, view, setView, isMiniPlayerActive, setIsMiniPlayerActive, incrementPlayCount, clearMedia, activateVideoSource,
    isPlayerExpanded, setIsPlayerExpanded,
  }), [
    currentTrack, currentAlbum, currentVideo, isPlaying, volume, audioSource, repeatMode, setRepeatMode,
    playTrack, playVideo, setVideoElement, setYtPlayer, setCurrentVideo, setCurrentTrack, pause, resume, togglePlay, setVolume, next, prev,
    isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled, visualizerType, setVisualizerType, isSlideshowActive, setIsSlideshowActive,
    isNanoView, setIsNanoView, isUserActive, setIsUserActive, nanoPosition, setNanoPosition, snapReset, theme, setTheme,
    isTVMode, setIsTVMode, isPhoneMode, isShrunk, setIsShrunk, isMinimized, setIsMinimized, isThreeDEnabled, setIsThreeDEnabled,
    isSpatialAudioEnabled, setSpatialAudioEnabled,
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
