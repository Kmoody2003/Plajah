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
  primeDJAudio, extractPeaks, estimateBPM, pitchToRate, formatTime,
  createReverb, EQKnob, WaveformCanvas, toCamelot,
  SAMPLE_COLORS, BEAT_LOOPS, beatLoopLabel, DEFAULT_BPM
} from '../DJModeView';
import { getCachedAnalysis, getOrComputeAnalysis, loadTrackTheory } from '../../services/djAnalysis';
import { platformAudio } from '../../services/mediaEngine/audioRuntime';

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
}

interface AmboDJTrackPlayerProps {
  track: AmboDJTrack;
  onClose: () => void;
  isLiveOnProgram?: boolean;
  onTakeToProgram?: () => void;
  isCuedInPreview?: boolean;
  onCueToPreview?: () => void;
  autoPlay?: boolean;
}

export const AmboDJTrackPlayer: React.FC<AmboDJTrackPlayerProps> = ({
  track,
  onClose,
  isLiveOnProgram = false,
  onTakeToProgram,
  isCuedInPreview = false,
  onCueToPreview,
  autoPlay = true,
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
  const [fx, setFx] = useState({ filter: 0.5, delay: 0, reverb: 0 });
  const [fxOn, setFxOn] = useState({ filter: false, delay: false, reverb: false });

  // 8 Hot Cues (seconds or null)
  const [hotCues, setHotCues] = useState<(number | null)[]>([null, null, null, null, null, null, null, null]);

  // Beat Looping
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [activeBeatLoop, setActiveBeatLoop] = useState<number | null>(null);

  // Audio nodes and refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayWetRef = useRef<GainNode | null>(null);
  const reverbWetRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // Parse duration if provided as string "m:ss"
  const parsedDuration = typeof track.duration === 'string'
    ? (track.duration.includes(':') ? Number(track.duration.split(':')[0]) * 60 + Number(track.duration.split(':')[1]) : 0)
    : (track.duration || 0);

  // ── 1. Init Audio Graph ──
  const initAudioGraph = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = primeDJAudio();
    audioCtxRef.current = ctx;

    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    gainNodeRef.current = gainNode;

    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 320;
    eqLowRef.current = eqLow;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    eqMidRef.current = eqMid;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 3200;
    eqHighRef.current = eqHigh;

    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 20000;
    filterNodeRef.current = filterNode;

    const delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.value = 0.375;
    delayNodeRef.current = delayNode;

    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.3;

    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;
    delayWetRef.current = delayWet;

    const reverbBuf = createReverb(ctx);
    const reverbNode = ctx.createConvolver();
    reverbNode.buffer = reverbBuf;

    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;
    reverbWetRef.current = reverbWet;

    // Connect node graph:
    // Source -> gainNode -> eqLow -> eqMid -> eqHigh -> filterNode -> (dry + wet delay + wet reverb) -> output
    gainNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(filterNode);

    // Delay loop
    filterNode.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWet);

    // Reverb
    filterNode.connect(reverbNode);
    reverbNode.connect(reverbWet);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;
    masterGainRef.current = masterGain;

    filterNode.connect(masterGain);
    delayWet.connect(masterGain);
    reverbWet.connect(masterGain);

    // Connect masterGain to the AudioContext destination directly so playback works immediately
    // without cross-context DOMExceptions across different audio instances.
    try {
      masterGain.connect(ctx.destination);
    } catch {}

    try {
      const bus = isLiveOnProgram ? platformAudio.mainBus('dj') : null;
      if (bus && (bus as any).context === ctx) {
        masterGain.connect(bus);
      }
    } catch {}

    return ctx;
  }, [volume, isLiveOnProgram]);

  // ── 2. Load Track Audio Data & Precomputed Peaks ──
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    const load = async () => {
      const ctx = initAudioGraph();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      let audioBuf: AudioBuffer | null = null;
      let calculatedPeaks: Float32Array | null = null;

      // Try cached analysis if track has an ID
      if (track.id) {
        try {
          const cached = getCachedAnalysis(track.id);
          if (cached && cached.peaks) {
            calculatedPeaks = new Float32Array(cached.peaks);
            if (cached.bpm) setBpm(cached.bpm);
          }
          const theory = await loadTrackTheory(track.id).catch(() => null);
          if (theory?.camelotKey) setCamelotKey(theory.camelotKey);
        } catch {}
      }

      if (track.url) {
        try {
          const res = await fetch(track.url);
          const arrayBuf = await res.arrayBuffer();
          audioBuf = await ctx.decodeAudioData(arrayBuf);
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
            // Warm worship chord: fundamental + fifth + octave with gentle swell
            const swell = Math.sin(t * 0.2) * 0.2 + 0.8;
            data[i] = (Math.sin(2 * Math.PI * 130.81 * t) * 0.2 +
                       Math.sin(2 * Math.PI * 196.00 * t) * 0.15 +
                       Math.sin(2 * Math.PI * 261.63 * t) * 0.1) * swell;
          }
        }
      }

      if (!active) return;

      setBuffer(audioBuf);
      const totalDur = audioBuf.duration;
      setDuration(totalDur);

      if (!calculatedPeaks) {
        calculatedPeaks = extractPeaks(audioBuf);
        setPeaks(calculatedPeaks);
      } else {
        setPeaks(calculatedPeaks);
      }

      const detectedBpm = estimateBPM(audioBuf);
      if (detectedBpm && detectedBpm > 0) setBpm(detectedBpm);

      setIsLoading(false);

      if (autoPlay) {
        startPlayback(0, audioBuf);
      }
    };

    load();

    return () => {
      active = false;
      stopPlayback();
    };
  }, [track.url, track.id]);

  // ── 3. Playback Controls ──
  const startPlayback = (offsetSec = 0, buf = buffer) => {
    const ctx = audioCtxRef.current || initAudioGraph();
    if (!buf) return;

    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current.disconnect();
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitchToRate(pitch);

    if (gainNodeRef.current) {
      src.connect(gainNodeRef.current);
    }

    const clampedOffset = Math.max(0, Math.min(buf.duration, offsetSec));
    src.start(0, clampedOffset);
    startTimeRef.current = ctx.currentTime;
    startOffsetRef.current = clampedOffset;
    sourceNodeRef.current = src;
    setIsPlaying(true);

    src.onended = () => {
      // Loop region check
      if (loopActive && loopIn !== null && loopOut !== null && loopOut > loopIn) {
        startPlayback(loopIn, buf);
      } else {
        setIsPlaying(false);
      }
    };
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback(currentTime);
    }
  };

  const handleCue = () => {
    stopPlayback();
    // Return to first hot cue or 0
    const target = hotCues[0] !== null ? hotCues[0]! : 0;
    setCurrentTime(target);
    startOffsetRef.current = target;
  };

  const handleSeek = (timeSec: number) => {
    const clamped = Math.max(0, Math.min(duration, timeSec));
    setCurrentTime(clamped);
    if (isPlaying) {
      startPlayback(clamped);
    } else {
      startOffsetRef.current = clamped;
    }
  };

  // ── 4. Animation Frame Playhead Tracking ──
  useEffect(() => {
    const tick = () => {
      if (isPlaying && audioCtxRef.current && buffer) {
        const rate = pitchToRate(pitch);
        const elapsed = (audioCtxRef.current.currentTime - startTimeRef.current) * rate;
        const now = startOffsetRef.current + elapsed;

        // Loop check
        if (loopActive && loopIn !== null && loopOut !== null && now >= loopOut) {
          startPlayback(loopIn);
          return;
        }

        if (now >= buffer.duration) {
          setCurrentTime(buffer.duration);
          setIsPlaying(false);
        } else {
          setCurrentTime(now);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, pitch, buffer, loopActive, loopIn, loopOut]);

  // ── 5. EQ Updates ──
  const handleEqChange = (band: 'low' | 'mid' | 'high', val: number) => {
    setEq(prev => ({ ...prev, [band]: val }));
    const gainDb = val * 12; // -12dB to +12dB
    if (band === 'low' && eqLowRef.current) eqLowRef.current.gain.value = gainDb;
    if (band === 'mid' && eqMidRef.current) eqMidRef.current.gain.value = gainDb;
    if (band === 'high' && eqHighRef.current) eqHighRef.current.gain.value = gainDb;
  };

  // ── 6. Filter & FX Updates ──
  const handleFilterChange = (val: number) => {
    setFx(prev => ({ ...prev, filter: val }));
    if (!filterNodeRef.current) return;
    if (!fxOn.filter) {
      filterNodeRef.current.frequency.value = 20000;
      filterNodeRef.current.type = 'lowpass';
      return;
    }
    // Neutral = 0.5; < 0.5 = lowpass; > 0.5 = highpass
    if (val < 0.48) {
      filterNodeRef.current.type = 'lowpass';
      const f = 200 + (val / 0.48) * 19800;
      filterNodeRef.current.frequency.value = f;
    } else if (val > 0.52) {
      filterNodeRef.current.type = 'highpass';
      const f = 20 + ((val - 0.52) / 0.48) * 4000;
      filterNodeRef.current.frequency.value = f;
    } else {
      filterNodeRef.current.type = 'lowpass';
      filterNodeRef.current.frequency.value = 20000;
    }
  };

  const handleToggleFx = (key: 'filter' | 'delay' | 'reverb') => {
    setFxOn(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'delay' && delayWetRef.current) {
        delayWetRef.current.gain.value = next.delay ? fx.delay * 0.8 : 0;
      }
      if (key === 'reverb' && reverbWetRef.current) {
        reverbWetRef.current.gain.value = next.reverb ? fx.reverb * 0.8 : 0;
      }
      if (key === 'filter') {
        if (!next.filter && filterNodeRef.current) {
          filterNodeRef.current.frequency.value = 20000;
        } else {
          handleFilterChange(fx.filter);
        }
      }
      return next;
    });
  };

  // ── 7. Hot Cue Handler ──
  const handleHotCue = (index: number, e?: React.MouseEvent) => {
    if (e && (e.shiftKey || e.altKey)) {
      // Clear cue
      setHotCues(prev => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
      return;
    }

    const existing = hotCues[index];
    if (existing === null) {
      // Set cue at current position
      setHotCues(prev => {
        const next = [...prev];
        next[index] = currentTime;
        return next;
      });
    } else {
      // Jump and play
      handleSeek(existing);
      if (!isPlaying) startPlayback(existing);
    }
  };

  // ── 8. Beat Loop Handler ──
  const handleBeatLoop = (beats: number) => {
    if (activeBeatLoop === beats && loopActive) {
      // Turn off
      setLoopActive(false);
      setActiveBeatLoop(null);
      setLoopIn(null);
      setLoopOut(null);
      return;
    }

    const secPerBeat = 60 / (bpm || DEFAULT_BPM);
    const loopSec = beats * secPerBeat;
    const inTime = currentTime;
    const outTime = Math.min(duration, inTime + loopSec);

    setLoopIn(inTime);
    setLoopOut(outTime);
    setLoopActive(true);
    setActiveBeatLoop(beats);
  };

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
            className="p-1 text-white/50 hover:text-red-400 rounded hover:bg-white/10 transition-all"
            title="Close Player"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Waveform & Controls Body ── */}
      {isExpanded && (
        <div className="p-3 flex flex-col gap-3">
          {/* 1. Full-Width Horizontal Waveform Canvas */}
          <div className="relative w-full h-16 rounded-xl overflow-hidden border border-white/10 bg-black/60 shadow-inner">
            <WaveformCanvas
              peaks={peaks}
              progress={progress}
              color={isLiveOnProgram ? '#FF8C00' : '#00DAF3'}
              hotCues={hotCues}
              loopIn={loopIn}
              loopOut={loopOut}
              duration={duration}
              onSeek={handleSeek}
            />

            {/* Time Stamp HUD */}
            <div className="absolute top-1 left-2 font-mono text-[10px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none">
              {formatTime(currentTime)}
            </div>
            <div className="absolute top-1 right-2 font-mono text-[10px] text-white/50 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none">
              -{formatTime(Math.max(0, duration - currentTime))}
            </div>

            {loopActive && (
              <div className="absolute bottom-1 right-2 px-1.5 py-0.5 rounded bg-purple-500/80 text-white font-mono text-[8px] font-bold uppercase tracking-wider pointer-events-none">
                Loop Active ({activeBeatLoop ? beatLoopLabel(activeBeatLoop) : 'Manual'})
              </div>
            )}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmboDJTrackPlayer;
