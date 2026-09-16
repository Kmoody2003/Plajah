// LiveAudioFxAuditionLab.tsx — Dedicated Test & Audition Environment for Chora Live Real-Time FX
//
// Allows listeners and creators to audition:
//   1. Lo-Fi Tape & Vinyl Warmth (wow, flutter, rolloff, vinyl crackle, tape saturation)
//   2. Chipmunk Vocal Spectrum Shifter (high cartoon pitch shift + formant squeak)
//   3. Ham / AM Radio & Shortwave Transmitter (telephony bandpass, diode grit, static, heterodyne whistle)
//   4. Boost Mode Sound Maximizer (low punch, air exciter, soft-knee limiter)
//
// Supports:
//   - Drag-and-drop or file upload of ANY local audio file (MP3, WAV, FLAC, AAC, etc.)
//   - 4 built-in procedurally-synthesized demo stems (Funk Beat, Vocal Soul, Guitar, Synth Groove)
//   - Instant A/B bypass comparison toggle
//   - Real-time dual FFT spectrum analyzer (Dry vs Wet overlay) & live oscilloscope
//   - Factory presets dropdown for each effect

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Upload,
  ArrowLeft, Activity, Disc, Music, Zap, RefreshCw
} from 'lucide-react';
import {
  deviceByType, FxChainHost,
  type FxInstance
} from '../../services/melos/beats/fx/devices';
import { presetsForFx, type FxPreset } from '../../services/melos/beats/fx/presets';

interface Props {
  onBack?: () => void;
}

type FxType = 'lofi' | 'chipmunk' | 'radio' | 'boost';

export default function LiveAudioFxAuditionLab({ onBack }: Props) {
  // Audio graph refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chainHostRef = useRef<FxChainHost | null>(null);
  const preAnalyserRef = useRef<AnalyserNode | null>(null);
  const postAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(8);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const startTimeRef = useRef(0);
  const pauseOffsetRef = useRef(0);

  // Active FX state
  const [activeFx, setActiveFx] = useState<FxType>('lofi');
  const [isBypassed, setIsBypassed] = useState(false);
  const [fxParams, setFxParams] = useState<Record<FxType, Record<string, number>>>({
    lofi: { filter: 3500, wow: 0.35, flutter: 0.25, crackle: 0.25, drive: 0.35, mix: 1.0 },
    chipmunk: { shift: 460, formant: 3200, resonance: 2.4, mix: 1.0 },
    radio: { bandwidth: 3100, grit: 0.35, static: 0.30, whistle: 0.15, mix: 1.0 },
    boost: { punch: 0.60, air: 0.50, drive: 0.50, ceiling: -0.3, mix: 1.0 },
  });

  // Source audio state
  const [sourceName, setSourceName] = useState<string>('808 Funk Beat & Percussion');
  const [isCustomFile, setIsCustomFile] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Canvas visualizer refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visualizerMode, setVisualizerMode] = useState<'SPECTRUM' | 'SCOPE'>('SPECTRUM');

  // ── Procedural Demo Tracks Generation ──────────────────────────────────────
  const createDemoBuffer = useCallback((type: 'beat' | 'vocal' | 'guitar' | 'synth', ctx: BaseAudioContext): AudioBuffer => {
    const sr = ctx.sampleRate || 44100;
    const dur = 8; // 8 second seamless loop at 120 BPM (4 bars)
    const buf = ctx.createBuffer(2, sr * dur, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    const bpm = 120;
    const beatSec = 60 / bpm; // 0.5s per beat
    const barSec = beatSec * 4; // 2.0s per bar

    if (type === 'beat') {
      // 808 Kick, Snare, Hi-Hats
      for (let i = 0; i < L.length; i++) {
        const t = i / sr;
        let sample = 0;

        // Kick on beats 0 and 2.5
        const isKick1 = (t % barSec) < 0.35;
        const isKick2 = ((t + beatSec * 1.5) % barSec) < 0.35;
        if (isKick1 || isKick2) {
          const kt = isKick1 ? (t % barSec) : ((t + beatSec * 1.5) % barSec);
          const f = 140 * Math.exp(-kt * 24) + 42;
          sample += Math.sin(2 * Math.PI * f * kt) * Math.exp(-kt * 6) * 0.75;
        }

        // Snare on beats 1 and 3 (clap / noise + tone)
        const isSnare = ((t + beatSec * 3) % (beatSec * 2)) < 0.28;
        if (isSnare) {
          const st = (t + beatSec * 3) % (beatSec * 2);
          const noise = (Math.random() * 2 - 1) * Math.exp(-st * 14);
          const tone = Math.sin(2 * Math.PI * 185 * st) * Math.exp(-st * 18);
          sample += (noise * 0.5 + tone * 0.35) * 0.65;
        }

        // 16th-note Hi-Hats
        const ht = (t % (beatSec / 4));
        if (ht < 0.06) {
          const hNoise = (Math.random() * 2 - 1) * Math.exp(-ht * 45);
          sample += hNoise * 0.15;
        }

        L[i] = sample;
        R[i] = sample;
      }
    } else if (type === 'vocal') {
      // Soulful vocal chant melody with rich harmonics (ideal for Chipmunk testing)
      const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66];
      for (let i = 0; i < L.length; i++) {
        const t = i / sr;
        const noteIdx = Math.floor((t / beatSec) % notes.length);
        const baseFreq = notes[noteIdx];
        const noteT = t % beatSec;
        const vib = Math.sin(2 * Math.PI * 5.2 * t) * (baseFreq * 0.025);
        const f = baseFreq + vib;

        const h1 = Math.sin(2 * Math.PI * f * t) * 0.5;
        const h2 = Math.sin(2 * Math.PI * f * 2 * t) * 0.35;
        const h3 = Math.sin(2 * Math.PI * f * 3 * t) * 0.25;
        const h4 = Math.sin(2 * Math.PI * f * 4 * t) * 0.15;
        const h5 = Math.sin(2 * Math.PI * f * 5 * t) * 0.08;

        const env = Math.sin((noteT / beatSec) * Math.PI);
        const voice = (h1 + h2 + h3 + h4 + h5) * env * 0.55;

        L[i] = voice;
        R[i] = voice;
      }
    } else if (type === 'guitar') {
      // Warm acoustic guitar chords & arpeggios (great for Lo-Fi & Radio)
      const chordRoots = [130.81, 164.81, 146.83, 174.61];
      for (let i = 0; i < L.length; i++) {
        const t = i / sr;
        const chordIdx = Math.floor((t / barSec) % chordRoots.length);
        const root = chordRoots[chordIdx];
        const arpStep = Math.floor((t % (beatSec / 2)) / (beatSec / 2) * 3);
        const ratios = [1.0, 1.25, 1.5];
        const f = root * ratios[arpStep];
        const arpT = t % (beatSec / 2);

        const stringDecay = Math.exp(-arpT * 4.5);
        const s1 = Math.sin(2 * Math.PI * f * t) * 0.45;
        const s2 = Math.sin(2 * Math.PI * f * 2 * t) * 0.25;
        const s3 = Math.sin(2 * Math.PI * f * 3 * t) * 0.12;
        const g = (s1 + s2 + s3) * stringDecay * 0.6;

        L[i] = g * 0.85;
        R[i] = g * 0.85;
      }
    } else {
      // Modern Synth Groove & Slap Bass (ideal for Boost Mode punch)
      for (let i = 0; i < L.length; i++) {
        const t = i / sr;
        const beatPos = (t % beatSec) / beatSec;

        const bassFreq = 55 + (Math.floor(t / beatSec) % 4) * 12;
        const bassEnv = Math.exp(-(beatPos * beatSec) * 7);
        const bass = (Math.sin(2 * Math.PI * bassFreq * t) + 0.5 * Math.sin(2 * Math.PI * bassFreq * 2 * t)) * bassEnv;

        const isStab = (t % (beatSec * 2)) < 0.22;
        let stab = 0;
        if (isStab) {
          const st = t % (beatSec * 2);
          const sf = 440;
          stab = (Math.sin(2 * Math.PI * sf * t) + Math.sin(2 * Math.PI * (sf * 1.5) * t)) * Math.exp(-st * 8) * 0.4;
        }

        const sample = bass * 0.6 + stab * 0.4;
        L[i] = sample;
        R[i] = sample;
      }
    }

    return buf;
  }, []);

  // ── Initialize Audio Context and Nodes ─────────────────────────────────────
  const ensureAudioGraph = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const pre = ctx.createAnalyser();
      pre.fftSize = 1024;
      pre.smoothingTimeConstant = 0.8;
      preAnalyserRef.current = pre;

      const chain = new FxChainHost(ctx);
      chainHostRef.current = chain;

      const post = ctx.createAnalyser();
      post.fftSize = 1024;
      post.smoothingTimeConstant = 0.8;
      postAnalyserRef.current = post;

      const master = ctx.createGain();
      master.gain.value = volume;
      masterGainRef.current = master;

      // Routing: source -> pre -> chain.input / chain.output -> post -> master -> destination
      pre.connect(chain.input);
      chain.output.connect(post);
      post.connect(master);
      master.connect(ctx.destination);

      // Seed with initial demo buffer
      const initialBuf = createDemoBuffer('beat', ctx);
      currentBufferRef.current = initialBuf;
      setTotalDuration(initialBuf.duration);
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, [createDemoBuffer, volume]);

  // ── Apply FX to ChainHost ──────────────────────────────────────────────────
  const updateActiveFxChain = useCallback(() => {
    const chain = chainHostRef.current;
    if (!chain) return;

    if (isBypassed) {
      chain.setChain([]);
      return;
    }

    const inst: FxInstance = {
      id: `live_${activeFx}`,
      type: activeFx,
      on: true,
      params: fxParams[activeFx],
    };
    chain.setChain([inst]);
  }, [activeFx, isBypassed, fxParams]);

  useEffect(() => {
    updateActiveFxChain();
  }, [updateActiveFxChain]);

  // ── Stop Audio Helper ──────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch { /* */ }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // ── Start Audio Helper ─────────────────────────────────────────────────────
  const startAudio = useCallback((offset = 0) => {
    ensureAudioGraph();
    const ctx = audioCtxRef.current;
    const buf = currentBufferRef.current;
    const pre = preAnalyserRef.current;
    if (!ctx || !buf || !pre) return;

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch { /* */ }
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = isLooping;
    src.connect(pre);

    const boundedOffset = Math.max(0, Math.min(buf.duration, offset));
    src.start(0, boundedOffset);
    startTimeRef.current = ctx.currentTime - boundedOffset;
    sourceNodeRef.current = src;

    src.onended = () => {
      if (!isLooping) {
        setIsPlaying(false);
        setPlaybackTime(0);
        pauseOffsetRef.current = 0;
      }
    };

    setIsPlaying(true);
  }, [ensureAudioGraph, isLooping]);

  // ── Source Selection ───────────────────────────────────────────────────────
  const selectDemoTrack = useCallback((trackKey: 'beat' | 'vocal' | 'guitar' | 'synth', name: string) => {
    ensureAudioGraph();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const wasPlaying = isPlaying;
    stopAudio();

    const buf = createDemoBuffer(trackKey, ctx);
    currentBufferRef.current = buf;
    setTotalDuration(buf.duration);
    setSourceName(name);
    setIsCustomFile(false);
    pauseOffsetRef.current = 0;
    setPlaybackTime(0);

    if (wasPlaying) {
      setTimeout(() => startAudio(0), 50);
    }
  }, [createDemoBuffer, ensureAudioGraph, isPlaying, startAudio, stopAudio]);

  // ── Custom File Loader ─────────────────────────────────────────────────────
  const handleFileUpload = useCallback((file: File) => {
    ensureAudioGraph();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    setIsLoadingFile(true);
    const wasPlaying = isPlaying;
    stopAudio();

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuf = e.target?.result as ArrayBuffer;
        const decoded = await ctx.decodeAudioData(arrayBuf);
        currentBufferRef.current = decoded;
        setTotalDuration(decoded.duration);
        setSourceName(file.name.replace(/\.[^/.]+$/, ''));
        setIsCustomFile(true);
        pauseOffsetRef.current = 0;
        setPlaybackTime(0);
        setIsLoadingFile(false);

        if (wasPlaying) {
          startAudio(0);
        }
      } catch (err) {
        console.error('Failed to decode audio file:', err);
        setIsLoadingFile(false);
        alert('Could not decode this audio file. Please try a standard MP3, WAV, or AAC file.');
      }
    };
    reader.onerror = () => {
      setIsLoadingFile(false);
      alert('Error reading local file.');
    };
    reader.readAsArrayBuffer(file);
  }, [ensureAudioGraph, isPlaying, startAudio, stopAudio]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, [handleFileUpload]);

  const togglePlay = () => {
    if (isPlaying) {
      const ctx = audioCtxRef.current;
      if (ctx) {
        pauseOffsetRef.current = (ctx.currentTime - startTimeRef.current) % totalDuration;
      }
      stopAudio();
    } else {
      startAudio(pauseOffsetRef.current);
    }
  };

  const handleSeek = (time: number) => {
    pauseOffsetRef.current = time;
    setPlaybackTime(time);
    if (isPlaying) {
      startAudio(time);
    }
  };

  // Keep playback time updated
  useEffect(() => {
    let animId: number;
    const tick = () => {
      if (isPlaying && audioCtxRef.current) {
        const elapsed = (audioCtxRef.current.currentTime - startTimeRef.current);
        const cur = isLooping ? (elapsed % totalDuration) : Math.min(totalDuration, elapsed);
        setPlaybackTime(cur);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isLooping, totalDuration]);

  // Handle volume changes
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // ── Canvas Dual FFT & Oscilloscope Visualization ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const preArr = new Uint8Array(512);
    const postArr = new Uint8Array(512);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background grid
      ctx.fillStyle = '#06060c';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 35) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const pre = preAnalyserRef.current;
      const post = postAnalyserRef.current;

      if (visualizerMode === 'SPECTRUM') {
        if (pre) pre.getByteFrequencyData(preArr);
        if (post) post.getByteFrequencyData(postArr);

        // Pre (Dry) Spectrum — cyan ghost
        ctx.strokeStyle = 'rgba(0, 218, 243, 0.35)';
        ctx.fillStyle = 'rgba(0, 218, 243, 0.05)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < preArr.length; i++) {
          const x = (i / preArr.length) * w;
          const y = h - (preArr[i] / 255) * h * 0.92;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.stroke();
        ctx.fill();

        // Post (Processed) Spectrum — vibrant accent curve
        const colorMap: Record<FxType, string> = {
          lofi: '#F59E0B',
          chipmunk: '#10B981',
          radio: '#F97316',
          boost: '#00DAF3',
        };
        const activeColor = isBypassed ? '#8899aa' : colorMap[activeFx];

        ctx.strokeStyle = activeColor;
        ctx.fillStyle = activeColor + '18';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = isPlaying ? 10 : 0;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < postArr.length; i++) {
          const x = (i / postArr.length) * w;
          const y = h - (postArr[i] / 255) * h * 0.94;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.stroke();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Frequency Legend
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px monospace';
        ctx.fillText('100 Hz', w * 0.08, h - 8);
        ctx.fillText('1 kHz', w * 0.35, h - 8);
        ctx.fillText('5 kHz', w * 0.65, h - 8);
        ctx.fillText('15 kHz', w * 0.88, h - 8);
      } else {
        // Oscilloscope Waveform Mode
        if (post) post.getByteTimeDomainData(postArr);
        const activeColor = isBypassed ? '#8899aa' : (activeFx === 'boost' ? '#00DAF3' : '#F97316');

        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let i = 0; i < postArr.length; i++) {
          const x = (i / postArr.length) * w;
          const v = postArr[i] / 128.0;
          const y = (v * h) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [visualizerMode, activeFx, isBypassed, isPlaying]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      try {
        audioCtxRef.current?.close();
      } catch { /* */ }
    };
  }, [stopAudio]);

  const handleParamChange = (key: string, val: number) => {
    setFxParams(prev => ({
      ...prev,
      [activeFx]: {
        ...prev[activeFx],
        [key]: val,
      },
    }));
  };

  const applyPreset = (preset: FxPreset) => {
    setFxParams(prev => ({
      ...prev,
      [activeFx]: {
        ...prev[activeFx],
        ...preset.params,
      },
    }));
  };

  const currentDescriptor = deviceByType(activeFx);
  const currentPresets = presetsForFx(activeFx);

  return (
    <div className="flex flex-col h-full w-full bg-[#05060a] text-white select-none overflow-y-auto">
      {/* ── Top Header & Return Bar ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#090b14]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack || (() => window.history.back())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold transition-all text-white/80 hover:text-white"
          >
            <ArrowLeft size={14} />
            <span>Back to Chora</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00DAF3]" />
            <h1 className="text-base font-black tracking-wide uppercase font-display">
              Live Audio FX Audition Studio
            </h1>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Web Audio Real-Time
            </span>
          </div>
        </div>

        {/* Instant A/B Bypass Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsBypassed(prev => !prev)}
            title="A/B toggle: compare affected audio vs pure original"
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider transition-all shadow-lg ${
              isBypassed
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isBypassed ? 'bg-red-400' : 'bg-emerald-400 animate-ping'}`} />
            <span>{isBypassed ? 'Bypass (Dry Original)' : 'Effect Engaged (Wet)'}</span>
          </button>
        </div>
      </header>

      <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        {/* ── Audio Source & File Upload Deck ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* File Drop & Upload Zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="group relative p-5 rounded-2xl border border-dashed border-white/20 hover:border-cyan-400/60 bg-[#0c0e1a]/70 hover:bg-[#0c0e1a] transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2.5"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <div className="w-11 h-11 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <Upload size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-white/90">Drop any audio file here</p>
              <p className="text-[10px] text-white/40">MP3, WAV, FLAC, AAC, OGG from your computer</p>
            </div>
            {isLoadingFile && (
              <div className="absolute inset-0 bg-black/80 rounded-2xl flex items-center justify-center gap-2 text-xs text-cyan-300">
                <RefreshCw size={14} className="animate-spin" />
                <span>Decoding audio file...</span>
              </div>
            )}
          </div>

          {/* Built-in Test Loops */}
          <div className="lg:col-span-2 p-5 rounded-2xl border border-white/10 bg-[#0c0e1a]/80 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
                Instant Built-In Audition Loops
              </span>
              <span className="text-[10px] font-mono text-cyan-400/80">
                Current: <strong className="text-white">{sourceName}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'beat' as const, label: '808 Funk Beat', desc: 'Punch & Drums', icon: Disc, color: '#F59E0B' },
                { key: 'vocal' as const, label: 'Vocal Soul Riff', desc: 'High harmonics for Chipmunk', icon: Music, color: '#10B981' },
                { key: 'guitar' as const, label: 'Acoustic Guitar', desc: 'Chords for Lo-Fi / Radio', icon: Activity, color: '#F97316' },
                { key: 'synth' as const, label: 'Disco Slap Groove', desc: 'Slap Bass for Boost', icon: Zap, color: '#00DAF3' },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => selectDemoTrack(item.key, item.label)}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    sourceName.includes(item.label) && !isCustomFile
                      ? 'bg-white/10 border-cyan-400 shadow-[0_0_12px_rgba(0,218,243,0.2)]'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <item.icon size={15} style={{ color: item.color }} />
                    <span className="text-[8px] font-mono uppercase text-white/40">Demo</span>
                  </div>
                  <span className="text-xs font-bold leading-tight">{item.label}</span>
                  <span className="text-[9px] text-white/40 truncate">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Transport Controls Bar ── */}
        <section className="p-4 rounded-2xl border border-white/10 bg-[#0c0e1a]/90 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-cyan-400 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_16px_rgba(0,218,243,0.4)]"
            >
              {isPlaying ? <Pause size={20} className="fill-black" /> : <Play size={20} className="fill-black ml-0.5" />}
            </button>

            {/* Loop toggle */}
            <button
              onClick={() => setIsLooping(l => !l)}
              title="Loop playback"
              className={`p-2.5 rounded-full border transition-all ${
                isLooping
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-white/5 text-white/40 border-white/10 hover:text-white'
              }`}
            >
              <RotateCcw size={16} />
            </button>

            {/* Time display */}
            <div className="font-mono text-xs text-white/70 min-w-[90px]">
              <span>{Math.floor(playbackTime / 60)}:{String(Math.floor(playbackTime % 60)).padStart(2, '0')}</span>
              <span className="text-white/30"> / </span>
              <span>{Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}</span>
            </div>
          </div>

          {/* Scrubber Slider */}
          <div className="w-full flex-1 px-2">
            <input
              type="range"
              min={0}
              max={totalDuration || 1}
              step={0.05}
              value={playbackTime}
              onChange={e => handleSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Master Volume */}
          <div className="flex items-center gap-2.5 min-w-[150px]">
            <button
              onClick={() => setIsMuted(m => !m)}
              className="text-white/60 hover:text-white"
            >
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={e => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-24 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </section>

        {/* ── Real-Time Visualizer (Dual FFT / Waveform Oscilloscope) ── */}
        <section className="relative rounded-2xl border border-white/10 bg-[#06060c] overflow-hidden shadow-2xl">
          <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 text-[9px] font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00DAF3]" />
                <span className="text-white/60">Dry Input</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <span className="text-white/60">Wet Output</span>
              </div>
            </div>

            <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10 text-[10px] font-bold">
              <button
                onClick={() => setVisualizerMode('SPECTRUM')}
                className={`px-2.5 py-1 rounded ${visualizerMode === 'SPECTRUM' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/50'}`}
              >
                Spectrum
              </button>
              <button
                onClick={() => setVisualizerMode('SCOPE')}
                className={`px-2.5 py-1 rounded ${visualizerMode === 'SCOPE' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/50'}`}
              >
                Oscilloscope
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={1000}
            height={200}
            className="w-full h-48 block"
          />
        </section>

        {/* ── Effect Selection Tabs ── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-white/50">
              Select Real-Time Audio Effect
            </h2>
            <div className="text-[10px] font-mono text-white/40">
              Active: <strong className="text-white uppercase">{activeFx}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'lofi' as const,
                title: 'Lo-Fi Tape & Vinyl',
                icon: '📻',
                blurb: 'Vintage tape wow & flutter, bandwidth rolloff, needle crackle',
                color: 'from-amber-500/30 to-amber-900/20',
                border: 'border-amber-400',
                text: 'text-amber-300',
              },
              {
                id: 'chipmunk' as const,
                title: 'Chipmunk Vocal',
                icon: '🐿️',
                blurb: 'Cartoon pitch shift (+10 st) with formant squeak character',
                color: 'from-emerald-500/30 to-emerald-900/20',
                border: 'border-emerald-400',
                text: 'text-emerald-300',
              },
              {
                id: 'radio' as const,
                title: 'Ham / AM Radio',
                icon: '🎙️',
                blurb: 'Old-time transmitter, 3kHz bandpass, heterodyne whistle, static',
                color: 'from-orange-500/30 to-orange-900/20',
                border: 'border-orange-400',
                text: 'text-orange-300',
              },
              {
                id: 'boost' as const,
                title: 'Boost Maximizer',
                icon: '⚡',
                blurb: 'Punch & air exciter, glue compression, soft-knee loudness',
                color: 'from-cyan-500/30 to-cyan-900/20',
                border: 'border-cyan-400',
                text: 'text-cyan-300',
              },
            ].map(item => {
              const selected = activeFx === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveFx(item.id)}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all relative overflow-hidden ${
                    selected
                      ? `bg-gradient-to-b ${item.color} ${item.border} shadow-lg shadow-black/40`
                      : 'bg-[#0c0e1a]/70 border-white/10 hover:bg-[#0c0e1a]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{item.icon}</span>
                    {selected && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/15 text-white">
                        Auditioning
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className={`text-sm font-black ${selected ? item.text : 'text-white'}`}>
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-white/50 leading-relaxed mt-1">
                      {item.blurb}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Active Effect Parameter Controls & Presets ── */}
        <section className="p-6 rounded-2xl border border-white/10 bg-[#0c0e1a]/90 backdrop-blur-md flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {activeFx === 'lofi' ? '📻' : activeFx === 'chipmunk' ? '🐿️' : activeFx === 'radio' ? '🎙️' : '⚡'}
                </span>
                <h3 className="text-base font-black tracking-tight">{currentDescriptor?.label} Parameters</h3>
              </div>
              <p className="text-xs text-white/40 mt-0.5">{currentDescriptor?.blurb}</p>
            </div>

            {/* Presets Quick Picker */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase text-white/50">Factory Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {currentPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] font-bold text-white/80 hover:text-white transition-all"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Knobs & Sliders Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentDescriptor?.params.map(param => {
              const currentVal = fxParams[activeFx][param.key] ?? param.default;
              return (
                <div key={param.key} className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white/80">{param.label}</span>
                    <span className="font-mono text-cyan-300 text-[11px]">
                      {param.format ? param.format(currentVal) : `${Math.round(currentVal * 10) / 10} ${param.unit || ''}`}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step || (param.max - param.min) / 100}
                    value={currentVal}
                    onChange={e => handleParamChange(param.key, parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />

                  <div className="flex justify-between text-[8px] font-mono text-white/30">
                    <span>{param.min} {param.unit || ''}</span>
                    <span>{param.max} {param.unit || ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
