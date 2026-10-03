// AmboDJTrackPlayer.tsx — Broadcast-grade per-track DJ audio engine & horizontal waveform
// Reuses the platform DJ mode infrastructure from components/DJModeView.tsx and services/djAnalysis.ts
// Provides live waveform playback, 3-band EQ, dual-mode filter, delay, reverb, 8 hot cues, beat loops,
// and tempo/pitch control for any audio played locally, from Chora, or from presentation audio slides.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Square, SkipBack, Volume2, VolumeX, Sparkles,
  Sliders, Repeat, Radio, Disc, X, ChevronDown, ChevronUp, Zap,
  Music, Check
} from 'lucide-react';
import {
  createDeck, extractPeaks, estimateBPM, pitchToRate, formatTime,
  toCamelot, loadAnalysisForDeck,
  SAMPLE_COLORS, BEAT_LOOPS, beatLoopLabel, DEFAULT_BPM,
  type DeckInstance,
} from '../../services/djAudioCore';
import { primeDJAudio, EQKnob } from '../DJModeView';
import SpectralWaveform from '../dj/SpectralWaveform';
import { analyzeSpectrum, type SpectralAnalysis } from '../../services/djWaveformAnalysis';
import { getCachedAnalysis, getOrComputeAnalysis, loadTrackTheory } from '../../services/djAnalysis';
import { platformAudio } from '../../services/mediaEngine/audioRuntime';
import { otherAudioFactor, subscribeAudioPriority } from '../../services/ambo/audioPriority';
import { lyricsFor, registerLyricClock } from '../../services/ambo/lyricFeed';
import { amboAudio } from '../../services/ambo/amboAudioEngine';
import { bus as audioBus, type DeckTransport } from '../../services/ambo/audioBus';

/** Decoded songs, so compact ⇄ deck toggling doesn't re-download/re-decode. */
const decodeCache = new Map<string, AudioBuffer>();
function rememberDecoded(url: string, buf: AudioBuffer) {
  decodeCache.delete(url); decodeCache.set(url, buf);
  while (decodeCache.size > 4) decodeCache.delete(decodeCache.keys().next().value as string);
}

export interface AmboDJTrack {
  id?: string;
  title: string;
  artist?: string;
  url?: string;
  duration?: number | string;
  coverImage?: string;
  key?: string;
  bpm?: number;
  category?: string;
  /** Chora synced lyrics ({time, text}; sometimes milliseconds). */
  timeCodedLyrics?: Array<{ time: number; text: string }>;
}

interface AmboDJTrackPlayerProps {
  track: AmboDJTrack;
  onClose: () => void;
  isLiveOnProgram?: boolean;
  onTakeToProgram?: () => void;
  isCuedInPreview?: boolean;
  onCueToPreview?: () => void;
  autoPlay?: boolean;
  /**
   * The deck is the EXPANDED VIEW of the audio playlist's current song: it
   * takes the song over at the playlist's position (no restart), plays through
   * the Playlist channel, and hands it back on close. See audioBus handover.
   */
  attachedToBus?: boolean;
  onSendLyricsToOutput?: (lyric: string) => void;
}

export const AmboDJTrackPlayer: React.FC<AmboDJTrackPlayerProps> = ({
  track,
  onClose,
  isLiveOnProgram = false,
  onTakeToProgram,
  isCuedInPreview = false,
  onCueToPreview,
  autoPlay = true,
  attachedToBus = false,
  onSendLyricsToOutput,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [bpm, setBpm] = useState<number>(track.bpm || DEFAULT_BPM);
  const [camelotKey, setCamelotKey] = useState<string | null>(toCamelot(track.key) || null);
  const [pitch, setPitch] = useState<number>(0); // -6 to +6 semitones
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  // 3-band EQ (-1 to +1)
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });

  // FX Strip
  const [fx, setFx] = useState({ filter: 0.5, delay: 0.5, reverb: 0.4 });
  const [fxOn, setFxOn] = useState({ filter: true, delay: false, reverb: false });

  // 8 Hot Cues (seconds or null)
  const [hotCues, setHotCues] = useState<(number | null)[]>([null, null, null, null, null, null, null, null]);

  // Beat Looping
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [activeBeatLoop, setActiveBeatLoop] = useState<number | null>(null);

  // Synced Lyrics
  const [syncedLyrics, setSyncedLyrics] = useState<Array<{text: string; startTime: number; endTime: number}>>([]);
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const [lyricsScrollOffset, setLyricsScrollOffset] = useState(0);

  // Soundboard Pads
  interface SoundPad {
    id: number;
    label: string;
    sampleUrl?: string;
    sampleName?: string;
    color: string;
    shortcut?: string;
    cueOnly: boolean;
    volume: number;
  }

  const DEFAULT_PADS: SoundPad[] = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    label: `Pad ${i + 1}`,
    color: SAMPLE_COLORS[i],
    cueOnly: false,
    volume: 1,
    shortcut: String(i + 1), // keys 1-8
  }));

  const [soundPads, setSoundPads] = useState<SoundPad[]>(DEFAULT_PADS);
  const [activePadId, setActivePadId] = useState<number | null>(null);
  const padNodesRef = useRef<Map<number, { source: AudioBufferSourceNode | null; buffer: AudioBuffer | null; gain: GainNode }>>(new Map());

  // Colour waveform analysis + beat grid (phased from detected kicks)
  const [spectral, setSpectral] = useState<SpectralAnalysis | null>(null);
  const [beatGridState, setBeatGridState] = useState<{ firstDownbeat: number; interval: number } | null>(null);
  const analysisCancelRef = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => { setSpectral(null); setBeatGridState(null); }, [track.url, track.id]);

  // Audio nodes and refs — unified via createDeck()
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deckRef = useRef<DeckInstance | null>(null);
  const rafRef = useRef<number>(0);

  // Parse duration if provided as string "m:ss"
  const parsedDuration = typeof track.duration === 'string'
    ? (track.duration.includes(':') ? Number(track.duration.split(':')[0]) * 60 + Number(track.duration.split(':')[1]) : 0)
    : (track.duration || 0);

  // ── 1. Init Audio Graph via shared DJ engine ──
  const initAudioGraph = useCallback(() => {
    if (audioCtxRef.current && deckRef.current) return audioCtxRef.current;
    const ctx = primeDJAudio();
    audioCtxRef.current = ctx;

    const deck = createDeck(ctx, {
      bpm: track.bpm || DEFAULT_BPM,
      key: track.key,
      camelotKey: toCamelot(track.key) || undefined,
    });

    // Into the Ambo mixer's DJ channel (same platform AudioContext) — metered,
    // limited and feeding the visualizers. Straight to the speakers only if
    // the mixer can't be built.
    try {
      const input = amboAudio.channelInput(attachedToBus ? 'playlist' : 'dj');
      if (input && input.context === ctx) deck.connect(input);
      else deck.connect(ctx.destination);
    } catch { try { deck.connect(ctx.destination); } catch {} }

    deckRef.current = deck;
    try { deck.setVolume(otherAudioFactor()); } catch {}
    return ctx;
  }, [track.bpm, track.key, isLiveOnProgram]);

  // ── 1b. Video priority — with scope 'all', a video with sound on Program
  // ducks or silences the deck too (services/ambo/audioPriority.ts).
  useEffect(() => {
    const apply = () => { try { deckRef.current?.setVolume(otherAudioFactor()); } catch {} };
    apply();
    return subscribeAudioPriority(apply);
  }, [track.id]);

  // ── 2. Load Track Audio Data & Precomputed Peaks ──
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    const load = async () => {
      const ctx = initAudioGraph();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      let audioBuf: AudioBuffer | null = null;
      let calculatedPeaks: Float32Array | null = null;

      // Try cached analysis if track has an ID — auto-load waveforms from Chora
      if (track.id && deckRef.current) {
        try {
          await loadAnalysisForDeck(deckRef.current, track.id);
          if (deckRef.current.bpm) setBpm(deckRef.current.bpm);
          if (deckRef.current.camelotKey) setCamelotKey(deckRef.current.camelotKey);
          if (deckRef.current.peaks) calculatedPeaks = new Float32Array(deckRef.current.peaks as any);
        } catch {}
        // Fallback to direct cache check
        if (!calculatedPeaks) {
          try {
            const cached = getCachedAnalysis({ id: track.id, url: track.url || '' } as any);
            if (cached && cached.peaks) {
              calculatedPeaks = new Float32Array(cached.peaks);
              if (cached.bpm) setBpm(cached.bpm);
            }
          } catch {}
        }
      }

      if (track.url && decodeCache.has(track.url)) audioBuf = decodeCache.get(track.url)!;
      else if (track.url) {
        try {
          const res = await fetch(track.url);
          const arrayBuf = await res.arrayBuffer();
          audioBuf = await ctx.decodeAudioData(arrayBuf);
          rememberDecoded(track.url, audioBuf);
        } catch (e) {
          console.warn('[AmboDJTrackPlayer] Audio fetch/decode fallback', e);
        }
      }

      // If no valid URL, synthesise a clean ambient test tone buffer
      if (!audioBuf) {
        const sr = ctx.sampleRate;
        const dur = parsedDuration > 0 ? parsedDuration : 180;
        audioBuf = ctx.createBuffer(2, sr * dur, sr);
        for (let ch = 0; ch < 2; ch++) {
          const data = audioBuf.getChannelData(ch);
          for (let i = 0; i < data.length; i++) {
            const t = i / sr;
            const swell = Math.sin(t * 0.2) * 0.2 + 0.8;
            data[i] = (Math.sin(2 * Math.PI * 130.81 * t) * 0.2 +
                       Math.sin(2 * Math.PI * 196.00 * t) * 0.15 +
                       Math.sin(2 * Math.PI * 261.63 * t) * 0.1) * swell;
          }
        }
      }

      if (!active) return;

      // Load buffer into the shared deck engine
      const deck = deckRef.current;
      if (deck) {
        deck.load(audioBuf);
        setDuration(deck.duration);
      } else {
        setDuration(audioBuf.duration);
      }
      setBuffer(audioBuf);

      if (!calculatedPeaks) {
        calculatedPeaks = extractPeaks(audioBuf);
      }
      setPeaks(calculatedPeaks);

      const detectedBpm = estimateBPM(audioBuf);
      if (detectedBpm && detectedBpm > 0) setBpm(detectedBpm);

      setIsLoading(false);

      // Colour-waveform analysis in the background (bands, kick/snare/hat
      // onsets, vocal lane). The beat grid is phased from the detected kicks
      // at the whole-track BPM, so loops and cues land on real beats.
      if (deck) {
        const sig = { cancelled: false };
        analysisCancelRef.current = sig;
        void analyzeSpectrum(audioBuf, sig).then(a => {
          if (!active || sig.cancelled || !a) return;
          setSpectral(a);
          const gridBpm = (detectedBpm && detectedBpm > 0) ? detectedBpm : (track.bpm || DEFAULT_BPM);
          const interval = 60 / gridBpm;
          const kicks = a.onsets.filter(o => o.kind === 'kick' && o.strength > 0.4).map(o => o.time);
          let first = 0, best = -1;
          // Try each early kick as the grid phase; keep the one most kicks agree with.
          for (const cand of kicks.slice(0, 48)) {
            let score = 0;
            for (const k of kicks) {
              const ph = ((k - cand) / interval) % 1;
              const d = Math.min(Math.abs(ph), 1 - Math.abs(ph)) * interval;
              if (d < 0.03) score++;
            }
            if (score > best) { best = score; first = cand % interval; }
          }
          if (deckRef.current === deck) {
            deck.setBeatGrid(gridBpm, first);
            setBeatGridState({ firstDownbeat: first, interval });
            setBpm(gridBpm);
          }
        });
      }

      if (attachedToBus && deck && track.id) {
        // Take the playlist's song over where it is — the bar kept playing
        // while we decoded, so there's no restart, just a 60 ms crossfade.
        const transport: DeckTransport = {
          toggle: () => togglePlayRef.current(),
          seek: (sec: number) => seekRef.current(sec),
          time: () => deckRef.current?.currentTime ?? 0,
          duration: () => deckRef.current?.duration ?? 0,
          playing: () => !!deckRef.current?.isPlaying,
        };
        const h = audioBus.beginDeckHandoff(track.id, transport);
        handedOverRef.current = !!h;
        if (h) {
          deck.seek(Math.min(h.time, Math.max(0, deck.duration - 0.05)));
          setCurrentTime(h.time);
          if (h.playing) {
            deck.setVolume(0);
            deck.play();
            setIsPlaying(true);
            for (let i = 1; i <= 6; i++) setTimeout(() => { try { deckRef.current?.setVolume(otherAudioFactor() * (i / 6)); } catch { /* */ } }, i * 10);
          }
        }
      } else if (autoPlay && deck) {
        deck.play();
        setIsPlaying(true);
      }
    };

    load();

    return () => {
      active = false;
      if (analysisCancelRef.current) analysisCancelRef.current.cancelled = true;
      // Collapse to compact: give the song back to the bar where the deck is.
      if (attachedToBus && handedOverRef.current && deckRef.current && track.id) {
        const d = deckRef.current;
        audioBus.endDeckHandoff(track.id, d.currentTime, d.isPlaying);
        handedOverRef.current = false;
        // Fade the deck out across the bar's 60 ms fade-in, then stop — an
        // equal crossfade rather than a dip.
        for (let i = 1; i <= 6; i++) setTimeout(() => { try { d.setVolume(otherAudioFactor() * (1 - i / 6)); } catch { /* */ } }, i * 10);
        setTimeout(() => { try { d.stop(); } catch { /* */ } }, 75);
        return;
      }
      if (deckRef.current) deckRef.current.stop();
    };
  }, [track.url, track.id]);

  // ── Lyrics & Pads Logic ──
  // Chora synced lyrics. (This used to import a fetchTimedLyrics that doesn't
  // exist in lyricSync, so the strip never loaded.)
  useEffect(() => {
    const lines = lyricsFor(track);
    setSyncedLyrics(lines.map((l, i) => ({ text: l.text, startTime: l.time, endTime: lines[i + 1]?.time ?? l.time + 6 })));
    setActiveLyricIndex(0);
  }, [track?.id, track?.timeCodedLyrics]);

  // The deck is a lyric clock: the lyrics layer can follow it (lyricFeed.ts).
  const pitchRef = useRef(0);
  pitchRef.current = pitch;
  const gridRef = useRef<{ firstDownbeat: number; interval: number } | null>(null);
  gridRef.current = beatGridState;
  const trackRef = useRef(track);
  trackRef.current = track;
  useEffect(() => {
    registerLyricClock('dj', {
      getTime: () => deckRef.current?.currentTime ?? 0,
      isPlaying: () => !!deckRef.current?.isPlaying,
      rate: () => pitchToRate(pitchRef.current),
      track: () => trackRef.current,
      grid: () => gridRef.current ? { bpm: 60 / gridRef.current.interval, firstBeat: gridRef.current.firstDownbeat } : null,
    });
    return () => registerLyricClock('dj', null);
  }, []);

  useEffect(() => {
    if (!syncedLyrics.length || !isPlaying) return; // use isPlaying instead of deckRef.current?.isPlaying to ensure re-evaluation
    const interval = setInterval(() => {
      const t = deckRef.current?.currentTime ?? 0;
      const idx = syncedLyrics.findIndex((l, i) => {
        const next = syncedLyrics[i + 1];
        return t >= l.startTime && (!next || t < next.startTime);
      });
      if (idx >= 0 && idx !== activeLyricIndex) {
        setActiveLyricIndex(idx);
        // Scroll to center the active lyric
        setLyricsScrollOffset(-idx * 180 + 200);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [syncedLyrics, activeLyricIndex, isPlaying]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Default shortcuts: keys 1-8
      const padIndex = soundPads.findIndex(p => p.shortcut === e.key);
      if (padIndex >= 0) {
        e.preventDefault();
        triggerPad(padIndex);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [soundPads]);

  const triggerPad = React.useCallback((index: number) => {
    const pad = soundPads[index];
    if (!pad?.sampleUrl) {
      // For now, visual feedback only if no sample
      setActivePadId(index);
      setTimeout(() => setActivePadId(null), 200);
      return;
    }
    
    setActivePadId(index);
    setTimeout(() => setActivePadId(null), 200);
    
    // Play through Web Audio
    // If pad.cueOnly, route to cue bus; otherwise route to main output
    // Use platformAudio for routing
  }, [soundPads]);

  // Latest handlers for the playlist bar's remote control while attached.
  const togglePlayRef = useRef<() => void>(() => {});
  const seekRef = useRef<(sec: number) => void>(() => {});
  const handedOverRef = useRef(false);
  const endedSentRef = useRef(false);

  // ── 3. Playback Controls — delegated to deck engine ──
  const togglePlay = () => {
    const deck = deckRef.current;
    if (!deck) return;
    if (deck.isPlaying) {
      deck.pause();
      setIsPlaying(false);
    } else {
      deck.play();
      setIsPlaying(true);
    }
  };

  // The Stop button called an undefined stopPlayback() and threw on click.
  const stopPlayback = () => {
    const deck = deckRef.current;
    if (!deck) return;
    deck.stop();
    deck.seek(0);
    setIsPlaying(false);
  };

  const handleCue = () => {
    const deck = deckRef.current;
    if (!deck) return;
    deck.stop();
    setIsPlaying(false);
    const target = hotCues[0] !== null ? hotCues[0]! : 0;
    deck.seek(target);
    setCurrentTime(target);
  };

  const getDeckTime = useCallback(() => deckRef.current?.currentTime ?? 0, []);
  togglePlayRef.current = () => togglePlay();
  seekRef.current = (sec: number) => handleSeek(sec);

  const handleSeek = (timeSec: number) => {
    const deck = deckRef.current;
    if (!deck) return;
    const clamped = Math.max(0, Math.min(duration, timeSec));
    deck.seek(clamped);
    setCurrentTime(clamped);
  };

  // ── 4. Animation Frame Playhead Tracking (reads from deck) ──
  useEffect(() => {
    const tick = () => {
      const deck = deckRef.current;
      if (deck && deck.isPlaying) {
        setCurrentTime(deck.currentTime);
        if (deck.currentTime >= deck.duration && !deck.activeLoop) {
          setIsPlaying(false);
        }
        endedSentRef.current = false;
      }
      syncLoopFromDeck();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // ── 4b. Attached to the playlist: report progress + advance at song end.
  // A timer, not rAF — rAF stops in background tabs, and the playlist must
  // still move on to the next song when nobody is looking at this window.
  useEffect(() => {
    if (!attachedToBus || !track.id) return;
    const id = setInterval(() => {
      const deck = deckRef.current;
      if (!deck || !handedOverRef.current) return;
      audioBus.reportDeck(track.id!, deck.currentTime, deck.duration, deck.isPlaying);
      if (deck.isPlaying) { endedSentRef.current = false; return; }
      if (deck.duration > 0 && deck.currentTime >= deck.duration - 0.05 && !deck.activeLoop && !endedSentRef.current) {
        endedSentRef.current = true;
        handedOverRef.current = false;
        audioBus.deckEnded(track.id!);
      }
    }, 200);
    return () => clearInterval(id);
  }, [attachedToBus, track.id]);

  // ── 5. EQ Updates — uses shared deck engine (matches DJ Mode: -24dB to +6dB) ──
  const handleEqChange = (band: 'low' | 'mid' | 'high', val: number) => {
    setEq(prev => ({ ...prev, [band]: val }));
    const deck = deckRef.current;
    if (!deck) return;
    const newEq = { ...eq, [band]: val };
    deck.setEQ(newEq.low, newEq.mid, newEq.high);
  };

  // ── 6. Filter & FX — state is the truth; one effect drives the deck ──
  // Before: the delay knob only set React state (never reached the deck),
  // switching delay/reverb on used an amount that defaulted to 0 (silent), and
  // reverb had no control at all.
  const handleFilterChange = (val: number) => setFx(prev => ({ ...prev, filter: val }));
  const handleToggleFx = (key: 'filter' | 'delay' | 'reverb') => setFxOn(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    deck.setFilter(fxOn.filter ? fx.filter : 0.5);
    // Beat-synced delay: a dotted eighth (¾ beat), the classic DJ echo.
    const beat = 60 / (bpm || DEFAULT_BPM);
    deck.setDelay(Math.min(1.9, beat * 0.75), 0.25 + fx.delay * 0.4, fxOn.delay ? 0.15 + fx.delay * 0.65 : 0);
    deck.setReverb(fxOn.reverb ? 0.1 + fx.reverb * 0.8 : 0);
  }, [fx, fxOn, bpm, buffer]);

  // ── 7. Hot Cue Handler — uses deck engine ──
  const handleHotCue = (index: number, e?: React.MouseEvent) => {
    const deck = deckRef.current;
    if (!deck) return;

    if (e && (e.shiftKey || e.altKey)) {
      deck.clearCue(index);
      setHotCues(prev => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
      return;
    }

    const existing = hotCues[index];
    if (existing === null) {
      deck.setCue(index, currentTime);
      setHotCues(prev => {
        const next = [...prev];
        next[index] = currentTime;
        return next;
      });
    } else {
      deck.jumpToCue(index);
      setCurrentTime(existing);
      if (!isPlaying) {
        deck.play();
        setIsPlaying(true);
      }
    }
  };

  // ── 8. Loops — Traktor model; the DECK owns the loop, the UI mirrors it ──
  // (The UI used to compute the region from its own clock, so the highlighted
  // region and the audible loop could disagree.)
  const loopKeyRef = useRef('');
  function syncLoopFromDeck() {
    const L = deckRef.current?.activeLoop ?? null;
    const key = L ? `${L.in}|${L.out}|${L.beats ?? ''}` : '';
    if (key === loopKeyRef.current) return;
    loopKeyRef.current = key;
    setLoopActive(!!L);
    setLoopIn(L ? L.in : null);
    setLoopOut(L ? L.out : null);
    setActiveBeatLoop(L?.beats ?? null);
  }

  /** Size button: set a loop · same size again exits · other size resizes. */
  const handleBeatLoop = (beats: number) => {
    const deck = deckRef.current;
    if (!deck) return;
    if (deck.activeLoop && deck.activeLoop.beats === beats) deck.clearLoop();
    else deck.setLoop(beats, bpm || DEFAULT_BPM);
    syncLoopFromDeck();
  };
  const loopAction = (fn: (d: DeckInstance) => void) => {
    const deck = deckRef.current;
    if (!deck) return;
    fn(deck);
    syncLoopFromDeck();
    setCurrentTime(deck.currentTime);
  };
  const [loopInArmed, setLoopInArmed] = useState(false);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="w-full bg-[#0E0B16] border-y border-white/10 shadow-2xl relative select-none flex flex-col">
      {/* ── Compact Top Bar ── */}
      <div className="px-3 py-1.5 bg-black/40 border-b border-white/5 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-[#D0BCFF]/15 text-[#D0BCFF] flex items-center justify-center flex-none">
            <Music size={13} />
          </div>
          <span className="font-bold text-white truncate">{track.title}</span>
          {track.artist && <span className="text-white/40 truncate">· {track.artist}</span>}
          {camelotKey && (
            <span className="px-1.5 py-0.2 rounded bg-[#00DAF3]/15 text-[#00DAF3] font-mono text-[9px] font-bold">
              {camelotKey}
            </span>
          )}
          <span className="font-mono text-[9px] text-[#FFB020] font-bold">{Math.round(bpm)} BPM</span>
        </div>

        <div className="flex items-center gap-2 flex-none">
          {/* Output Routing Badges */}
          {isLiveOnProgram ? (
            <span className="px-2 py-0.5 rounded bg-[#FF8C00] text-black font-mono text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
              Live on Program
            </span>
          ) : (
            onTakeToProgram && (
              <button
                onClick={onTakeToProgram}
                className="px-2 py-0.5 rounded bg-[#FF8C00]/15 hover:bg-[#FF8C00]/25 text-[#FF8C00] border border-[#FF8C00]/30 font-bold text-[9px] uppercase tracking-wider transition-all"
                title="Route live to Program Out"
              >
                Take Live (PGM)
              </button>
            )
          )}

          {isCuedInPreview ? (
            <span className="px-2 py-0.5 rounded bg-[#00DAF3] text-black font-mono text-[9px] font-black uppercase tracking-wider">
              Preview Cue
            </span>
          ) : (
            onCueToPreview && (
              <button
                onClick={onCueToPreview}
                className="px-2 py-0.5 rounded bg-[#00DAF3]/15 hover:bg-[#00DAF3]/25 text-[#00DAF3] border border-[#00DAF3]/30 font-bold text-[9px] uppercase tracking-wider transition-all"
                title="Cue in Preview"
              >
                Cue (PRV)
              </button>
            )
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-white/50 hover:text-white rounded hover:bg-white/10 transition-all"
            title={isExpanded ? 'Collapse DJ Deck' : 'Expand DJ Deck'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            onClick={onClose}
            className={attachedToBus
              ? 'px-2 py-0.5 text-[10px] font-bold text-white/70 hover:text-white rounded bg-white/5 hover:bg-white/15 border border-white/10 transition-all flex items-center gap-1'
              : 'p-1 text-white/50 hover:text-red-400 rounded hover:bg-white/10 transition-all'}
            title={attachedToBus ? 'Back to the compact player — the song keeps playing' : 'Close Player'}
          >
            {attachedToBus ? <><ChevronDown size={12} /> Compact</> : <X size={14} />}
          </button>
        </div>
      </div>

      {/* ── Waveform & Controls Body ── */}
      {isExpanded && (
        <div className="p-3 flex flex-col gap-3">
          {/* 1. Full-Width Horizontal Waveform Canvas */}
          <div className="relative w-full">
            <SpectralWaveform
              analysis={spectral}
              peaks={peaks}
              duration={duration}
              getTime={getDeckTime}
              isPlaying={isPlaying}
              beatGrid={beatGridState}
              loop={loopActive && loopIn != null && loopOut != null ? { in: loopIn, out: loopOut } : null}
              hotCues={hotCues}
              onSeek={handleSeek}
              accent={isLiveOnProgram ? '#FF8C00' : '#00DAF3'}
            />

            {/* Time Stamp HUD */}
            <div className="absolute top-1 left-2 font-mono text-[10px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none">
              {formatTime(currentTime)}
            </div>
            <div className="absolute top-1 right-2 font-mono text-[10px] text-white/50 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none">
              -{formatTime(Math.max(0, duration - currentTime))}
            </div>

            {loopActive && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-purple-500/80 text-white font-mono text-[8px] font-bold uppercase tracking-wider pointer-events-none">
                Loop Active ({activeBeatLoop ? beatLoopLabel(activeBeatLoop) : 'Manual'})
              </div>
            )}
          </div>

          {/* Synced Lyrics Strip */}
          {syncedLyrics && syncedLyrics.length > 0 && (
            <div className="relative h-8 overflow-hidden bg-black/30 border-t border-white/5">
              <div 
                className="flex items-center gap-6 h-full transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${lyricsScrollOffset}px)` }}
              >
                {syncedLyrics.map((line, i) => (
                  <span
                    key={i}
                    className={`whitespace-nowrap text-[11px] font-medium transition-all duration-200 flex-none ${
                      i === activeLyricIndex
                        ? 'text-[#00DAF3] scale-105 font-bold'
                        : i < activeLyricIndex
                          ? 'text-white/25'
                          : 'text-white/50'
                    }`}
                  >
                    {line.text}
                  </span>
                ))}
              </div>
              {/* Send to output button */}
              <button
                onClick={() => onSendLyricsToOutput?.(syncedLyrics[activeLyricIndex]?.text || '')}
                className="absolute right-1 top-1 px-1.5 py-0.5 rounded bg-white/10 text-[8px] text-white/40 hover:bg-[#00DAF3]/20 hover:text-[#00DAF3] transition-all"
                title="Send current lyric to output displays"
              >
                → Output
              </button>
            </div>
          )}

          {/* Soundboard Pads */}
          <div className="flex items-stretch gap-1 px-2 py-1.5 bg-black/20 border-t border-white/5">
            {soundPads.map((pad, i) => (
              // A div, not a <button>: the pad contains its own CUE button, and a
              // button inside a button is invalid and fired the pad on CUE clicks.
              <div
                key={pad.id}
                role="button"
                tabIndex={0}
                onClick={() => triggerPad(i)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerPad(i); } }}
                className={`cursor-pointer flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg border transition-all duration-100 ${
                  activePadId === i
                    ? 'scale-95 brightness-150'
                    : 'hover:brightness-110'
                }`}
                style={{
                  backgroundColor: `${pad.color}15`,
                  borderColor: `${pad.color}40`,
                  boxShadow: activePadId === i ? `0 0 12px ${pad.color}60` : 'none',
                }}
                title={`${pad.label}${pad.shortcut ? ` [${pad.shortcut}]` : ''}`}
              >
                <span className="text-[9px] font-bold" style={{ color: pad.color }}>
                  {pad.sampleName || pad.label}
                </span>
                {pad.shortcut && (
                  <span className="text-[7px] text-white/30 font-mono">{pad.shortcut}</span>
                )}
                {/* Cue toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSoundPads(prev => prev.map((p, j) => j === i ? { ...p, cueOnly: !p.cueOnly } : p));
                  }}
                  className={`mt-0.5 px-1.5 py-0.5 rounded text-[7px] font-bold transition-all ${
                    pad.cueOnly
                      ? 'bg-amber-500/30 text-amber-400 border border-amber-500/40'
                      : 'bg-white/5 text-white/30 border border-white/10'
                  }`}
                >
                  CUE
                </button>
              </div>
            ))}
          </div>

          {/* 2. Interactive Performance Row */}
          <div className="grid grid-cols-12 gap-3 items-center">
            {/* Left Col: Transport & Pitch (Cols 1-4) */}
            <div className="col-span-4 flex items-center gap-3">
              <button
                onClick={togglePlay}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all shadow-lg ${
                  isPlaying
                    ? 'bg-[#FF8C00] text-black hover:bg-[#FF8C00]/90'
                    : 'bg-white text-black hover:bg-white/90'
                }`}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>

              <button
                onClick={handleCue}
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[10px] font-extrabold transition-all"
                title="Cue back to start or cue point"
              >
                CUE
              </button>

              <button
                onClick={() => { stopPlayback(); setCurrentTime(0); }}
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-all"
                title="Stop"
              >
                <Square size={13} />
              </button>

              {/* Pitch / Tempo */}
              <div className="flex-1 flex flex-col gap-0.5 pl-2 border-l border-white/10">
                <div className="flex items-center justify-between text-[8.5px] font-mono text-white/50">
                  <span>TEMPO</span>
                  <span className={pitch !== 0 ? 'text-[#00DAF3] font-bold' : ''}>
                    {pitch > 0 ? `+${pitch}` : pitch} st
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.1}
                  value={pitch}
                  onChange={e => setPitch(Number(e.target.value))}
                  onDoubleClick={() => setPitch(0)}
                  className="w-full accent-[#00DAF3] h-1.5 rounded bg-white/10 cursor-pointer"
                  title="Double click to reset tempo"
                />
              </div>
            </div>

            {/* Center Col: 8 Hot Cue Pads & Beat Loops (Cols 5-8) */}
            <div className="col-span-5 flex flex-col gap-1.5 px-2 border-x border-white/10">
              {/* Hot Cues 1-8 */}
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-extrabold uppercase tracking-wider text-white/40">Hot Cues (1–8)</span>
                <span className="text-[7.5px] text-white/30">Shift+Click to Clear</span>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {hotCues.map((cue, i) => {
                  const isSet = cue !== null;
                  const padColor = SAMPLE_COLORS[i];
                  return (
                    <button
                      key={i}
                      onClick={e => handleHotCue(i, e)}
                      className={`h-7 rounded text-[9px] font-black font-mono transition-all flex flex-col items-center justify-center border ${
                        isSet
                          ? 'border-white/30 text-black shadow'
                          : 'border-white/10 text-white/30 hover:border-white/25 hover:text-white/60 bg-white/[0.03]'
                      }`}
                      style={{
                        backgroundColor: isSet ? padColor : undefined,
                        boxShadow: isSet ? `0 0 10px ${padColor}44` : undefined,
                      }}
                      title={isSet ? `Hot Cue ${i + 1}: ${formatTime(cue!)} (Click to jump · Shift+click to clear)` : `Set Hot Cue ${i + 1} at current playhead`}
                    >
                      <span>{i + 1}</span>
                    </button>
                  );
                })}
              </div>

              {/* Beat Loops */}
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[8px] font-extrabold uppercase tracking-wider text-white/40 flex-none mr-1">Loop:</span>
                {BEAT_LOOPS.map(b => (
                  <button
                    key={b}
                    title={activeBeatLoop === b && loopActive ? 'Exit loop' : loopActive ? `Resize loop to ${beatLoopLabel(b)}` : `Loop ${beatLoopLabel(b)} from the current beat`}
                    onClick={() => handleBeatLoop(b)}
                    className={`flex-1 py-0.5 rounded text-[8px] font-mono font-bold transition-all border ${
                      activeBeatLoop === b && loopActive
                        ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_8px_rgba(147,51,234,0.5)]'
                        : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {beatLoopLabel(b)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <button
                  onClick={() => loopAction(d => { d.setLoopIn(); setLoopInArmed(true); })}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border transition-all ${loopInArmed ? 'bg-purple-600/40 border-purple-400 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
                  title="Loop in — then press OUT"
                >IN</button>
                <button
                  onClick={() => loopAction(d => { d.setLoopOut(); setLoopInArmed(false); })}
                  disabled={!loopInArmed}
                  className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border bg-white/5 border-white/10 text-white/60 hover:text-white disabled:opacity-30"
                  title="Loop out — starts the manual loop"
                >OUT</button>
                <button onClick={() => loopAction(d => d.halveLoop())} disabled={!loopActive} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border bg-white/5 border-white/10 text-white/60 hover:text-white disabled:opacity-30" title="Halve loop">½</button>
                <button onClick={() => loopAction(d => d.doubleLoop())} disabled={!loopActive} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border bg-white/5 border-white/10 text-white/60 hover:text-white disabled:opacity-30" title="Double loop">×2</button>
                <button onClick={() => loopAction(d => d.moveLoop(-1))} disabled={!loopActive} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border bg-white/5 border-white/10 text-white/60 hover:text-white disabled:opacity-30" title="Move loop back one length">◀</button>
                <button onClick={() => loopAction(d => d.moveLoop(1))} disabled={!loopActive} className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border bg-white/5 border-white/10 text-white/60 hover:text-white disabled:opacity-30" title="Move loop forward one length">▶</button>
                <button
                  onClick={() => loopAction(d => { d.clearLoop(); setLoopInArmed(false); })}
                  disabled={!loopActive}
                  className={`flex-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border transition-all disabled:opacity-30 ${loopActive ? 'bg-purple-600 border-purple-400 text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                  title="Exit loop and play on"
                >{loopActive ? 'EXIT LOOP' : 'LOOP OFF'}</button>
              </div>
            </div>

            {/* Right Col: 3-Band EQ & FX (Cols 9-12) */}
            <div className="col-span-3 flex items-center justify-around pl-1">
              {/* EQ Knobs */}
              <EQKnob label="LOW" value={eq.low} onChange={v => handleEqChange('low', v)} color="#00DAF3" />
              <EQKnob label="MID" value={eq.mid} onChange={v => handleEqChange('mid', v)} color="#00DAF3" />
              <EQKnob label="HIGH" value={eq.high} onChange={v => handleEqChange('high', v)} color="#00DAF3" />

              {/* FX Knobs */}
              <div className="flex flex-col items-center gap-0.5">
                <EQKnob
                  label="FILTER"
                  value={(fx.filter - 0.5) * 2}
                  onChange={v => handleFilterChange(v * 0.5 + 0.5)}
                  color="#FF8C00"
                />
                <button
                  onClick={() => handleToggleFx('filter')}
                  className={`px-1.5 py-0.2 rounded text-[7px] font-black uppercase tracking-widest border transition-all ${
                    fxOn.filter ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'border-white/10 text-white/30'
                  }`}
                >
                  {fxOn.filter ? 'ON' : 'BYP'}
                </button>
              </div>

              <div className="flex flex-col items-center gap-0.5">
                <EQKnob
                  label="DELAY"
                  value={fx.delay * 2 - 1}
                  onChange={v => setFx(prev => ({ ...prev, delay: (v + 1) / 2 }))}
                  color="#D0BCFF"
                />
                <button
                  onClick={() => handleToggleFx('delay')}
                  className={`px-1.5 py-0.2 rounded text-[7px] font-black uppercase tracking-widest border transition-all ${
                    fxOn.delay ? 'bg-[#D0BCFF] text-black border-[#D0BCFF]' : 'border-white/10 text-white/30'
                  }`}
                >
                  {fxOn.delay ? 'ON' : 'BYP'}
                </button>
              </div>

              <div className="flex flex-col items-center gap-0.5">
                <EQKnob
                  label="REVERB"
                  value={fx.reverb * 2 - 1}
                  onChange={v => setFx(prev => ({ ...prev, reverb: (v + 1) / 2 }))}
                  color="#2BE0A8"
                />
                <button
                  onClick={() => handleToggleFx('reverb')}
                  className={`px-1.5 py-0.2 rounded text-[7px] font-black uppercase tracking-widest border transition-all ${
                    fxOn.reverb ? 'bg-[#2BE0A8] text-black border-[#2BE0A8]' : 'border-white/10 text-white/30'
                  }`}
                >
                  {fxOn.reverb ? 'ON' : 'BYP'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmboDJTrackPlayer;
