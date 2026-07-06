import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Album, Track } from '../types';
import {
  X, Play, Pause, SkipBack, SkipForward, Repeat, ZapOff,
  Zap, Headphones, Radio, Music2, Upload, Folder, ChevronLeft,
  ChevronRight, RotateCcw, Activity, Volume2, Shuffle, List,
  Disc, Mic2, Monitor, Usb, AlertCircle, CheckCircle, Lightbulb
} from 'lucide-react';
import SmartLightingPanel from './SmartLightingPanel';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { fetchPersonalTracks } from '../services/backendService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SamplePad {
  id: string;
  title: string;
  url: string | null;
  buffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  isPlaying: boolean;
  color: string;
}

interface DeckState {
  track: Track | null;
  buffer: AudioBuffer | null;
  peaks: Float32Array | null;
  isPlaying: boolean;
  isCued: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  pitch: number;       // semitones -6 to +6
  bpm: number;
  loopIn: number | null;
  loopOut: number | null;
  loopActive: boolean;
  hotCues: (number | null)[];
  samples: SamplePad[];
  fx: { filter: number; delay: number; reverb: number };
  jogAngle: number;
  isScratch: boolean;
}

interface DeckAudioNodes {
  gainNode: GainNode;
  xfadeGain: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  filterNode: BiquadFilterNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  reverbWet: GainNode;
  analyser: AnalyserNode;
  sourceNode: AudioBufferSourceNode | null;
  startTime: number;
  startOffset: number;
}

interface Props {
  album: Album;
  onClose: () => void;
  initialTrack?: Track | null;      // Currently playing track → auto-load Deck A
  initialTime?: number;             // Current playback position for Deck A
  initialTrackIndex?: number;       // Index in album.tracks for the current track
  onPauseGlobal?: () => void;       // Called immediately to hand off audio control
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_COLORS = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF'];
const DEFAULT_BPM = 128;
const PITCH_RANGE = 6;
const WAVEFORM_POINTS = 800;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractPeaks(buffer: AudioBuffer): Float32Array {
  const ch = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / WAVEFORM_POINTS));
  const peaks = new Float32Array(WAVEFORM_POINTS);
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const start = i * step;
    let max = 0;
    for (let j = 0; j < step && start + j < ch.length; j++) {
      const v = Math.abs(ch[start + j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

function estimateBPM(buffer: AudioBuffer): number {
  try {
    const ch = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const windowSize = Math.floor(sr * 0.01); // 10ms windows
    const energies: number[] = [];
    for (let i = 0; i < Math.min(ch.length, sr * 30); i += windowSize) {
      let e = 0;
      for (let j = i; j < Math.min(i + windowSize, ch.length); j++) e += ch[j] * ch[j];
      energies.push(e / windowSize);
    }
    const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
    const beats: number[] = [];
    let lastBeat = -100;
    for (let i = 1; i < energies.length - 1; i++) {
      if (energies[i] > avg * 1.8 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1] && i - lastBeat > 20) {
        beats.push(i);
        lastBeat = i;
      }
    }
    if (beats.length < 2) return DEFAULT_BPM;
    const intervals = beats.slice(1).map((b, i) => b - beats[i]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60 / (avgInterval * 0.01));
    return Math.max(60, Math.min(200, bpm));
  } catch {
    return DEFAULT_BPM;
  }
}

function pitchToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

// Generate simple reverb impulse response
function createReverb(ctx: AudioContext, duration = 2.0): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return buf;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Drag knob: vertical drag maps to value change
const EQKnob: React.FC<{
  label: string;
  value: number;   // -1 to +1
  onChange: (v: number) => void;
  color?: string;
}> = ({ label, value, onChange, color = '#00D4AA' }) => {
  const startRef = useRef<{ y: number; v: number } | null>(null);
  const angle = value * 135; // -135° to +135°

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        className="w-10 h-10 rounded-full cursor-ns-resize relative"
        style={{ background: 'radial-gradient(circle at 35% 35%, #3A3A3A, #111)' }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startRef.current = { y: e.clientY, v: value };
        }}
        onPointerMove={e => {
          if (!startRef.current) return;
          const delta = (startRef.current.y - e.clientY) / 80;
          onChange(Math.max(-1, Math.min(1, startRef.current.v + delta)));
        }}
        onPointerUp={() => { startRef.current = null; }}
      >
        {/* Knob indicator dot */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
            style={{ background: value === 0 ? '#444' : color }}
          />
        </div>
        {/* Center ring */}
        <div className="absolute inset-2 rounded-full border border-white/10" />
      </div>
      <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: Math.abs(value) > 0.05 ? color : '#444' }}>
        {label}
      </span>
    </div>
  );
};

const WaveformCanvas: React.FC<{
  peaks: Float32Array | null;
  progress: number;
  color: string;
  hotCues: (number | null)[];
  loopIn: number | null;
  loopOut: number | null;
  duration: number;
  onSeek: (t: number) => void;
}> = ({ peaks, progress, color, hotCues, loopIn, loopOut, duration, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width = canvas.clientWidth * devicePixelRatio || 1;
    const h = canvas.height = canvas.clientHeight * devicePixelRatio || 1;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    if (peaks && peaks.length > 0) {
      const barW = w / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const barH = peaks[i] * mid * 0.9;
        const x = i * barW;
        const played = i / peaks.length < progress;
        ctx.fillStyle = played ? color : '#2A2A2A';
        ctx.fillRect(x, mid - barH, Math.max(barW - 0.5, 0.5), barH * 2);
      }
    } else {
      ctx.fillStyle = '#1A1A1A';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#333';
      ctx.fillRect(0, mid - 1, w, 2);
    }

    // Loop region
    if (loopIn !== null && loopOut !== null && duration > 0) {
      const lx = (loopIn / duration) * w;
      const lw = ((loopOut - loopIn) / duration) * w;
      ctx.fillStyle = `${color}22`;
      ctx.fillRect(lx, 0, lw, h);
      ctx.fillStyle = color;
      ctx.fillRect(lx, 0, 2, h);
      ctx.fillRect(lx + lw - 2, 0, 2, h);
    }

    // Hot cues
    hotCues.forEach((cue, i) => {
      if (cue === null || duration <= 0) return;
      const cx = (cue / duration) * w;
      ctx.fillStyle = SAMPLE_COLORS[i];
      ctx.fillRect(cx - 1, 0, 2, h);
      ctx.fillStyle = SAMPLE_COLORS[i];
      ctx.fillRect(cx, 0, 6, 8);
    });

    // Playhead
    const px = progress * w;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px - 1, 0, 2, h);

    // Center line
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, mid - 1, w, 1);
  }, [peaks, progress, color, hotCues, loopIn, loopOut, duration]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-pointer"
      onClick={e => {
        if (!duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        onSeek(pct * duration);
      }}
    />
  );
};

const JogWheel: React.FC<{
  deckId: 'A' | 'B';
  angle: number;
  isScratch: boolean;
  isPlaying: boolean;
  coverImage: string | null;
  onScratchStart: () => void;
  onScratchMove: (deltaDeg: number) => void;
  onScratchEnd: () => void;
  onToggleScratch: () => void;
}> = ({ deckId, angle, isScratch, isPlaying, coverImage, onScratchStart, onScratchMove, onScratchEnd, onToggleScratch }) => {
  const jogRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef(0);
  const isDraggingRef = useRef(false);
  const color = deckId === 'A' ? '#00D4AA' : '#FF6B6B';

  const getAngleFromEvent = (e: React.PointerEvent) => {
    if (!jogRef.current) return 0;
    const rect = jogRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={jogRef}
        className="relative w-44 h-44 rounded-full cursor-pointer select-none"
        style={{
          background: 'radial-gradient(circle at 40% 35%, #2A2A2A, #111 60%, #0A0A0A)',
          boxShadow: `0 0 0 2px #222, 0 0 0 4px #111, 0 8px 32px rgba(0,0,0,0.8), ${isPlaying ? `0 0 20px ${color}44` : ''}`,
        }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          isDraggingRef.current = true;
          lastAngleRef.current = getAngleFromEvent(e);
          onScratchStart();
        }}
        onPointerMove={e => {
          if (!isDraggingRef.current) return;
          const newAngle = getAngleFromEvent(e);
          let delta = newAngle - lastAngleRef.current;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          lastAngleRef.current = newAngle;
          onScratchMove(delta);
        }}
        onPointerUp={() => {
          isDraggingRef.current = false;
          onScratchEnd();
        }}
      >
        {/* Platter rotation */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Grip ridges */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 left-1/2 w-0.5 h-4 -ml-[1px] origin-bottom"
              style={{
                transformOrigin: '50% 88px',
                transform: `rotate(${i * 30}deg)`,
                background: '#333',
              }}
            />
          ))}
          {/* Album art center disc */}
          <div className="absolute inset-[30%] rounded-full overflow-hidden border-2 border-black">
            {coverImage ? (
              <img src={thumb(coverImage, THUMB.small) || undefined} alt="" loading="lazy" decoding="async" onError={onThumbError(coverImage)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#1A1A1A] flex items-center justify-center">
                <Disc size={20} className="text-white/20" />
              </div>
            )}
          </div>
          {/* Center hole */}
          <div className="absolute inset-[45%] rounded-full bg-black border border-white/10" />
        </div>
        {/* Static position indicator */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ background: color }} />
      </div>
      {/* Scratch toggle */}
      <button
        onClick={onToggleScratch}
        className={`px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
          isScratch
            ? 'bg-white/10 border-white/30 text-white'
            : 'border-white/10 text-white/30'
        }`}
      >
        {isScratch ? 'Scratch On' : 'Scratch Off'}
      </button>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DJModeView: React.FC<Props> = ({ album, onClose, initialTrack, initialTime = 0, initialTrackIndex = 0, onPauseGlobal }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const nodesA = useRef<DeckAudioNodes | null>(null);
  const nodesB = useRef<DeckAudioNodes | null>(null);
  const rafRef = useRef<number>(0);
  const midiRef = useRef<MIDIAccess | null>(null);

  const emptyDeck = (id: 'A' | 'B'): DeckState => ({
    track: null, buffer: null, peaks: null,
    isPlaying: false, isCued: false,
    currentTime: 0, duration: 0,
    volume: 0.8, pitch: 0, bpm: DEFAULT_BPM,
    loopIn: null, loopOut: null, loopActive: false,
    hotCues: [null, null, null, null],
    samples: SAMPLE_COLORS.map((color, i) => ({
      id: `${id}-sample-${i}`, title: '', url: null, buffer: null,
      sourceNode: null, gainNode: null, isPlaying: false, color,
    })),
    fx: { filter: 0.5, delay: 0, reverb: 0 },
    jogAngle: 0, isScratch: true,
  });

  const [deckA, setDeckA] = useState<DeckState>(() => emptyDeck('A'));
  const [deckB, setDeckB] = useState<DeckState>(() => emptyDeck('B'));
  const [crossfader, setCrossfader] = useState(0.5);
  const [eqA, setEqA] = useState({ low: 0, mid: 0, high: 0 });
  const [eqB, setEqB] = useState({ low: 0, mid: 0, high: 0 });
  const [libraryTracks, setLibraryTracks] = useState<Track[]>(album.tracks);
  const [libSearch, setLibSearch] = useState('');
  const [lockerLoaded, setLockerLoaded] = useState(false);
  const [loadingLocker, setLoadingLocker] = useState(false);
  const [midiStatus, setMidiStatus] = useState<'idle' | 'ok' | 'denied'>('idle');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [loadingDeck, setLoadingDeck] = useState<'A' | 'B' | null>(null);
  const [isLightingOpen, setIsLightingOpen] = useState(false);

  // ─── Audio init ─────────────────────────────────────────────────────────────

  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const reverbBuf = createReverb(ctx);

    const buildDeckNodes = (): DeckAudioNodes => {
      const gainNode  = ctx.createGain();
      const xfadeGain = ctx.createGain();
      const eqLow  = ctx.createBiquadFilter(); eqLow.type  = 'lowshelf';  eqLow.frequency.value  = 320;
      const eqMid  = ctx.createBiquadFilter(); eqMid.type  = 'peaking';   eqMid.frequency.value  = 1000; eqMid.Q.value = 1;
      const eqHigh = ctx.createBiquadFilter(); eqHigh.type = 'highshelf'; eqHigh.frequency.value = 3200;
      const filterNode = ctx.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = 20000;
      const delayNode  = ctx.createDelay(2.0); delayNode.delayTime.value = 0.375;
      const delayFeedback = ctx.createGain(); delayFeedback.gain.value = 0.3;
      const delayWet   = ctx.createGain(); delayWet.gain.value = 0;
      const reverb     = ctx.createConvolver(); reverb.buffer = reverbBuf;
      const reverbWet  = ctx.createGain(); reverbWet.gain.value = 0;
      const analyser   = ctx.createAnalyser(); analyser.fftSize = 256;

      // Chain: gain → eq → filter → analyser → delay → reverb → xfadeGain → master
      gainNode.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(filterNode);
      filterNode.connect(analyser);

      // Delay: wet only
      filterNode.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayWet);
      delayWet.connect(xfadeGain);

      // Reverb
      filterNode.connect(reverb);
      reverb.connect(reverbWet);
      reverbWet.connect(xfadeGain);

      // Dry
      analyser.connect(xfadeGain);
      xfadeGain.connect(master);

      return {
        gainNode, xfadeGain, eqLow, eqMid, eqHigh,
        filterNode, delayNode, delayFeedback, delayWet,
        reverbWet, analyser,
        sourceNode: null, startTime: 0, startOffset: 0,
      };
    };

    nodesA.current = buildDeckNodes();
    nodesB.current = buildDeckNodes();
    updateCrossfader(crossfader);

    return ctx;
  }, []);

  const updateCrossfader = (value: number) => {
    if (!nodesA.current || !nodesB.current) return;
    const angle = value * Math.PI / 2;
    nodesA.current.xfadeGain.gain.value = Math.cos(angle);
    nodesB.current.xfadeGain.gain.value = Math.sin(angle);
  };

  // ─── Track loading ──────────────────────────────────────────────────────────

  const loadTrack = useCallback(async (
    track: Track,
    deckId: 'A' | 'B',
    opts?: { autoPlay?: boolean; startOffset?: number }
  ) => {
    const ctx = initAudio();
    if (ctx.state === 'suspended') await ctx.resume();
    setLoadingDeck(deckId);
    try {
      const response = await fetch(track.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer  = await ctx.decodeAudioData(arrayBuffer);
      const peaks = extractPeaks(audioBuffer);
      const bpm   = estimateBPM(audioBuffer);
      const offset = Math.max(0, Math.min(opts?.startOffset ?? 0, audioBuffer.duration - 0.1));
      const setState = deckId === 'A' ? setDeckA : setDeckB;
      setState(prev => ({
        ...prev, track, buffer: audioBuffer, peaks,
        bpm, duration: audioBuffer.duration,
        currentTime: offset, isPlaying: false, isCued: false,
        loopIn: null, loopOut: null, loopActive: false,
        hotCues: [null, null, null, null],
      }));
      // Auto-start directly using the decoded buffer (bypasses React state timing)
      if (opts?.autoPlay) {
        const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
        if (nodes) {
          if (nodes.sourceNode) { try { nodes.sourceNode.stop(); } catch {} nodes.sourceNode = null; }
          const src = ctx.createBufferSource();
          src.buffer = audioBuffer;
          src.playbackRate.value = 1;
          src.connect(nodes.gainNode);
          src.start(0, offset);
          nodes.sourceNode = src;
          nodes.startTime = ctx.currentTime;
          nodes.startOffset = offset;
          src.onended = () => { if (nodes.sourceNode === src) nodes.sourceNode = null; };
          setState(prev => ({ ...prev, isPlaying: true }));
        }
      }
    } catch (err) {
      console.error('[DJ] Track load error:', err);
    } finally {
      setLoadingDeck(null);
    }
  }, [initAudio]);

  // ─── Playback control ───────────────────────────────────────────────────────

  const startSource = useCallback((deckId: 'A' | 'B', offset: number, rate = 1) => {
    const ctx = audioCtxRef.current;
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    const state = deckId === 'A' ? deckA : deckB;
    if (!ctx || !nodes || !state.buffer) return;

    if (nodes.sourceNode) {
      try { nodes.sourceNode.stop(); } catch {}
      nodes.sourceNode.disconnect();
    }

    const source = ctx.createBufferSource();
    source.buffer = state.buffer;
    source.playbackRate.value = rate * pitchToRate(state.pitch);
    source.connect(nodes.gainNode);
    source.start(0, Math.max(0, Math.min(offset, state.buffer.duration - 0.001)));

    // Loop
    if (state.loopActive && state.loopIn !== null && state.loopOut !== null) {
      source.loop = true;
      source.loopStart = state.loopIn;
      source.loopEnd = state.loopOut;
    }

    nodes.sourceNode = source;
    nodes.startTime = ctx.currentTime;
    nodes.startOffset = offset;

    source.onended = () => {
      if (nodes.sourceNode === source) nodes.sourceNode = null;
    };
  }, [deckA, deckB]);

  const togglePlay = useCallback((deckId: 'A' | 'B') => {
    const ctx = audioCtxRef.current;
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    const state = deckId === 'A' ? deckA : deckB;
    const setState = deckId === 'A' ? setDeckA : setDeckB;
    if (!state.buffer) return;
    if (!ctx) { initAudio(); return; }
    if (ctx.state === 'suspended') ctx.resume();

    if (state.isPlaying) {
      // Pause
      if (nodes?.sourceNode) {
        const elapsed = ctx.currentTime - (nodes.startTime || 0);
        const newOffset = (nodes.startOffset || 0) + elapsed;
        setState(prev => ({ ...prev, isPlaying: false, currentTime: newOffset }));
        try { nodes.sourceNode.stop(); } catch {}
        nodes.sourceNode = null;
      } else {
        setState(prev => ({ ...prev, isPlaying: false }));
      }
    } else {
      // Play
      const offset = state.currentTime;
      startSource(deckId, offset);
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [deckA, deckB, startSource, initAudio]);

  const setCue = useCallback((deckId: 'A' | 'B') => {
    const ctx = audioCtxRef.current;
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    const state = deckId === 'A' ? deckA : deckB;
    const setState = deckId === 'A' ? setDeckA : setDeckB;
    if (!state.buffer) return;

    if (state.isPlaying) {
      // Stop and return to cue point
      if (nodes?.sourceNode) {
        try { nodes.sourceNode.stop(); } catch {}
        if (nodes) nodes.sourceNode = null;
      }
      setState(prev => ({ ...prev, isPlaying: false, currentTime: prev.isCued ? 0 : prev.currentTime }));
    } else {
      // Preview (hold CUE to hear)
      if (!ctx) return;
      startSource(deckId, state.currentTime);
      setState(prev => ({ ...prev, isPlaying: true, isCued: true }));
    }
  }, [deckA, deckB, startSource]);

  const seekTo = useCallback((deckId: 'A' | 'B', time: number) => {
    const ctx = audioCtxRef.current;
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    const state = deckId === 'A' ? deckA : deckB;
    const setState = deckId === 'A' ? setDeckA : setDeckB;
    if (!state.buffer || !ctx) return;

    const clampedTime = Math.max(0, Math.min(time, state.buffer.duration));
    setState(prev => ({ ...prev, currentTime: clampedTime }));

    if (state.isPlaying) startSource(deckId, clampedTime, pitchToRate(state.pitch));
  }, [deckA, deckB, startSource]);

  // ─── Sync BPM ───────────────────────────────────────────────────────────────

  const syncBPM = useCallback((targetId: 'A' | 'B') => {
    const sourceId = targetId === 'A' ? 'B' : 'A';
    const source = sourceId === 'A' ? deckA : deckB;
    const setState = targetId === 'A' ? setDeckA : setDeckB;
    const nodes = targetId === 'A' ? nodesA.current : nodesB.current;
    if (!source.bpm || !nodes?.sourceNode) return;
    const targetState = targetId === 'A' ? deckA : deckB;
    const ratio = source.bpm / (targetState.bpm || DEFAULT_BPM);
    if (nodes.sourceNode) nodes.sourceNode.playbackRate.value = ratio * pitchToRate(targetState.pitch);
    setState(prev => ({ ...prev, bpm: source.bpm }));
  }, [deckA, deckB]);

  // ─── Jog wheel ──────────────────────────────────────────────────────────────

  const onJogMove = useCallback((deckId: 'A' | 'B', deltaDeg: number) => {
    const ctx = audioCtxRef.current;
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    const state = deckId === 'A' ? deckA : deckB;
    const setState = deckId === 'A' ? setDeckA : setDeckB;

    // Update visual angle
    setState(prev => ({ ...prev, jogAngle: prev.jogAngle + deltaDeg * 2 }));

    if (state.isScratch) {
      // Scratch: move playhead proportionally (~0.3s per full rotation)
      const timeDelta = (deltaDeg / 360) * 0.3;
      const newTime = Math.max(0, (state.currentTime) + timeDelta);
      if (state.isPlaying && nodes?.sourceNode) {
        nodes.sourceNode.playbackRate.value = (deltaDeg > 0 ? 2 : -0.5);
        setTimeout(() => {
          if (nodes.sourceNode) nodes.sourceNode.playbackRate.value = pitchToRate(state.pitch);
        }, 50);
      }
      setState(prev => ({ ...prev, currentTime: Math.max(0, Math.min(prev.currentTime + timeDelta, prev.duration)) }));
    } else {
      // Nudge: temporarily adjust pitch
      if (nodes?.sourceNode) {
        const nudgeRate = (deltaDeg > 0 ? 1.05 : 0.95) * pitchToRate(state.pitch);
        nodes.sourceNode.playbackRate.value = nudgeRate;
        setTimeout(() => {
          if (nodes.sourceNode) nodes.sourceNode.playbackRate.value = pitchToRate(state.pitch);
        }, 80);
      }
    }
  }, [deckA, deckB]);

  // ─── Loop controls ──────────────────────────────────────────────────────────

  const setLoopIn = (deckId: 'A' | 'B') => {
    const state = deckId === 'A' ? deckA : deckB;
    (deckId === 'A' ? setDeckA : setDeckB)(prev => ({ ...prev, loopIn: state.currentTime }));
  };
  const setLoopOut = (deckId: 'A' | 'B') => {
    const state = deckId === 'A' ? deckA : deckB;
    (deckId === 'A' ? setDeckA : setDeckB)(prev => ({ ...prev, loopOut: state.currentTime }));
  };
  const toggleLoop = (deckId: 'A' | 'B') => {
    const state = deckId === 'A' ? deckA : deckB;
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    if (!state.loopIn || !state.loopOut || !nodes?.sourceNode) return;
    nodes.sourceNode.loop = !state.loopActive;
    nodes.sourceNode.loopStart = state.loopIn;
    nodes.sourceNode.loopEnd = state.loopOut;
    (deckId === 'A' ? setDeckA : setDeckB)(prev => ({ ...prev, loopActive: !prev.loopActive }));
  };

  // ─── Hot cues ───────────────────────────────────────────────────────────────

  const setHotCue = (deckId: 'A' | 'B', idx: number) => {
    const state = deckId === 'A' ? deckA : deckB;
    const setState = deckId === 'A' ? setDeckA : setDeckB;
    if (state.hotCues[idx] !== null) {
      seekTo(deckId, state.hotCues[idx]!);
    } else {
      setState(prev => {
        const cues = [...prev.hotCues];
        cues[idx] = prev.currentTime;
        return { ...prev, hotCues: cues };
      });
    }
  };

  // ─── EQ update ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!nodesA.current) return;
    const MAX_DB = 12;
    nodesA.current.eqLow.gain.value  = eqA.low  * MAX_DB;
    nodesA.current.eqMid.gain.value  = eqA.mid  * MAX_DB;
    nodesA.current.eqHigh.gain.value = eqA.high * MAX_DB;
  }, [eqA]);

  useEffect(() => {
    if (!nodesB.current) return;
    const MAX_DB = 12;
    nodesB.current.eqLow.gain.value  = eqB.low  * MAX_DB;
    nodesB.current.eqMid.gain.value  = eqB.mid  * MAX_DB;
    nodesB.current.eqHigh.gain.value = eqB.high * MAX_DB;
  }, [eqB]);

  // ─── Volume + FX sync ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!nodesA.current) return;
    nodesA.current.gainNode.gain.value = deckA.volume;
    // Filter sweep: 0=200Hz, 0.5=off, 1=8kHz → kill at extremes
    const fA = deckA.fx.filter;
    if (Math.abs(fA - 0.5) < 0.05) {
      nodesA.current.filterNode.frequency.value = 20000;
    } else if (fA < 0.5) {
      nodesA.current.filterNode.type = 'lowpass';
      nodesA.current.filterNode.frequency.value = 200 + fA * 2 * 3800;
    } else {
      nodesA.current.filterNode.type = 'highpass';
      nodesA.current.filterNode.frequency.value = (fA - 0.5) * 2 * 8000;
    }
    nodesA.current.delayWet.gain.value = deckA.fx.delay * 0.7;
    nodesA.current.reverbWet.gain.value = deckA.fx.reverb * 0.6;
  }, [deckA.volume, deckA.fx]);

  useEffect(() => {
    if (!nodesB.current) return;
    nodesB.current.gainNode.gain.value = deckB.volume;
    const fB = deckB.fx.filter;
    if (Math.abs(fB - 0.5) < 0.05) {
      nodesB.current.filterNode.frequency.value = 20000;
    } else if (fB < 0.5) {
      nodesB.current.filterNode.type = 'lowpass';
      nodesB.current.filterNode.frequency.value = 200 + fB * 2 * 3800;
    } else {
      nodesB.current.filterNode.type = 'highpass';
      nodesB.current.filterNode.frequency.value = (fB - 0.5) * 2 * 8000;
    }
    nodesB.current.delayWet.gain.value = deckB.fx.delay * 0.7;
    nodesB.current.reverbWet.gain.value = deckB.fx.reverb * 0.6;
  }, [deckB.volume, deckB.fx]);

  useEffect(() => { updateCrossfader(crossfader); }, [crossfader]);

  // ─── Pitch change ───────────────────────────────────────────────────────────

  const changePitch = (deckId: 'A' | 'B', semitones: number) => {
    const nodes = deckId === 'A' ? nodesA.current : nodesB.current;
    const setState = deckId === 'A' ? setDeckA : setDeckB;
    if (nodes?.sourceNode) nodes.sourceNode.playbackRate.value = pitchToRate(semitones);
    setState(prev => ({ ...prev, pitch: semitones }));
  };

  // ─── RAF time update ────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const updateDeckTime = (nodes: DeckAudioNodes | null, state: DeckState, setState: React.Dispatch<React.SetStateAction<DeckState>>) => {
        if (!nodes || !state.isPlaying || !state.buffer) return;
        const elapsed = ctx.currentTime - nodes.startTime;
        const newTime = Math.min(nodes.startOffset + elapsed, state.buffer.duration);
        setState(prev => ({
          ...prev,
          currentTime: newTime,
          jogAngle: prev.isPlaying ? (prev.jogAngle + 0.4) % 360 : prev.jogAngle,
        }));
        if (newTime >= state.buffer.duration && !state.loopActive) {
          setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        }
      };

      updateDeckTime(nodesA.current, deckA, setDeckA);
      updateDeckTime(nodesB.current, deckB, setDeckB);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckA.isPlaying, deckB.isPlaying]);

  // ─── MIDI ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiStatus('denied'); return; }
    navigator.requestMIDIAccess().then(access => {
      midiRef.current = access;
      setMidiStatus('ok');
      const handleMsg = (e: MIDIMessageEvent) => {
        const [status, data1, data2] = e.data;
        const type = status & 0xF0;
        const ch   = status & 0x0F;
        // CC
        if (type === 0xB0) {
          const norm = data2 / 127;
          if (data1 === 14)  setCrossfader(norm);       // CC 14: crossfader
          if (data1 === 0  && ch === 0) setDeckA(p => ({ ...p, volume: norm }));
          if (data1 === 0  && ch === 1) setDeckB(p => ({ ...p, volume: norm }));
          if (data1 === 16 && ch === 0) changePitch('A', (norm - 0.5) * PITCH_RANGE * 2);
          if (data1 === 16 && ch === 1) changePitch('B', (norm - 0.5) * PITCH_RANGE * 2);
          if (data1 === 20 && ch === 0) setEqA(p => ({ ...p, low: norm * 2 - 1 }));
          if (data1 === 21 && ch === 0) setEqA(p => ({ ...p, mid: norm * 2 - 1 }));
          if (data1 === 22 && ch === 0) setEqA(p => ({ ...p, high: norm * 2 - 1 }));
          if (data1 === 20 && ch === 1) setEqB(p => ({ ...p, low: norm * 2 - 1 }));
          if (data1 === 21 && ch === 1) setEqB(p => ({ ...p, mid: norm * 2 - 1 }));
          if (data1 === 22 && ch === 1) setEqB(p => ({ ...p, high: norm * 2 - 1 }));
        }
        // Note on (play buttons)
        if (type === 0x90) {
          if (data1 === 0 && ch === 0) togglePlay('A');
          if (data1 === 0 && ch === 1) togglePlay('B');
          if (data1 === 1 && ch === 0) setCue('A');
          if (data1 === 1 && ch === 1) setCue('B');
          if (data1 === 2 && ch === 0) syncBPM('A');
          if (data1 === 2 && ch === 1) syncBPM('B');
        }
      };
      for (const input of access.inputs.values()) input.onmidimessage = handleMsg;
    }).catch(() => setMidiStatus('denied'));
  }, []);

  // ─── Sample pad playback ─────────────────────────────────────────────────────

  const loadSample = async (deckId: 'A' | 'B', padIdx: number, file: File) => {
    const ctx = initAudio();
    const ab = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    const setState = deckId === 'A' ? setDeckA : setDeckB;
    setState(prev => {
      const samples = [...prev.samples];
      samples[padIdx] = { ...samples[padIdx], title: file.name.replace(/\.[^.]+$/, ''), buffer: buf, url: URL.createObjectURL(file) };
      return { ...prev, samples };
    });
  };

  const triggerSample = (deckId: 'A' | 'B', padIdx: number) => {
    const ctx = audioCtxRef.current || initAudio();
    if (ctx.state === 'suspended') ctx.resume();
    const state = deckId === 'A' ? deckA : deckB;
    const pad = state.samples[padIdx];
    if (!pad.buffer || !masterGainRef.current) return;

    if (pad.isPlaying && pad.sourceNode) {
      try { pad.sourceNode.stop(); } catch {}
    }
    const source = ctx.createBufferSource();
    source.buffer = pad.buffer;
    source.connect(masterGainRef.current);
    source.start();

    const setState = deckId === 'A' ? setDeckA : setDeckB;
    setState(prev => {
      const samples = [...prev.samples];
      samples[padIdx] = { ...samples[padIdx], sourceNode: source, isPlaying: true };
      return { ...prev, samples };
    });

    source.onended = () => {
      setState(prev => {
        const samples = [...prev.samples];
        samples[padIdx] = { ...samples[padIdx], sourceNode: null, isPlaying: false };
        return { ...prev, samples };
      });
    };
  };

  // ─── Local file import ──────────────────────────────────────────────────────

  const importLocalFile = async (file: File, deckId?: 'A' | 'B') => {
    const track: Track = {
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'Local File',
      url: URL.createObjectURL(file),
    };
    if (deckId) {
      loadTrack(track, deckId);
    } else {
      setLibraryTracks(prev => [track, ...prev]);
    }
  };

  // ─── Auto-load on mount ───────────────────────────────────────────────────────
  // Takes control of the currently playing global track and loads next track into Deck B.

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Hand off from global player immediately
    onPauseGlobal?.();

    if (initialTrack?.url) {
      // Load current track into Deck A, start from current playback position
      loadTrack(initialTrack, 'A', { autoPlay: true, startOffset: initialTime });
    }

    // Load next track in album into Deck B
    const nextIdx = ((initialTrackIndex ?? 0) + 1) % album.tracks.length;
    const nextTrack = album.tracks[nextIdx];
    if (nextTrack && nextTrack.id !== initialTrack?.id) {
      loadTrack(nextTrack, 'B');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  // ─── Deck panel render helper ────────────────────────────────────────────────

  const renderDeck = (deckId: 'A' | 'B') => {
    const deck  = deckId === 'A' ? deckA : deckB;
    const setDeck = deckId === 'A' ? setDeckA : setDeckB;
    const eq    = deckId === 'A' ? eqA : eqB;
    const setEq = deckId === 'A' ? setEqA : setEqB;
    const color = deckId === 'A' ? '#00D4AA' : '#FF6B6B';
    const isRight = deckId === 'B';

    return (
      <div className={`flex flex-col gap-3 flex-1 min-w-0 ${isRight ? 'flex-row-reverse flex-col' : ''}`}>
        {/* Track info */}
        <div className="h-12 px-3 bg-[#111] rounded-xl border border-white/5 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg overflow-hidden shrink-0 cursor-pointer"
            onClick={() => { /* open library */ }}
          >
            {deck.track?.albumCover || album.coverImage ? (
              <img src={thumb(deck.track?.albumCover || album.coverImage, THUMB.micro) || undefined} alt="" loading="lazy" decoding="async" onError={onThumbError(deck.track?.albumCover || album.coverImage)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#1A1A1A] flex items-center justify-center">
                <Music2 size={12} className="text-white/20" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-white truncate">
              {deck.track?.title || '— No Track Loaded —'}
            </p>
            <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: color + '99' }}>
              {deck.track?.artist || 'Drag track from library'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-[10px] font-bold" style={{ color }}>
              {formatTime(deck.currentTime)}
            </p>
            <p className="text-[7px] font-black text-white/20 font-mono">
              -{formatTime(Math.max(0, deck.duration - deck.currentTime))}
            </p>
          </div>
        </div>

        {/* Waveform */}
        <div className="h-16 bg-[#0D0D0D] rounded-xl overflow-hidden border border-white/5">
          <WaveformCanvas
            peaks={deck.peaks}
            progress={deck.duration > 0 ? deck.currentTime / deck.duration : 0}
            color={color}
            hotCues={deck.hotCues}
            loopIn={deck.loopIn}
            loopOut={deck.loopOut}
            duration={deck.duration}
            onSeek={t => seekTo(deckId, t)}
          />
        </div>

        {/* Jog wheel + pitch */}
        <div className="flex gap-3 items-center justify-center">
          <div className="flex flex-col gap-1 items-center">
            <span className="text-[7px] font-black uppercase tracking-widest text-white/30">PITCH</span>
            <input
              type="range" min={-PITCH_RANGE} max={PITCH_RANGE} step={0.1}
              value={deck.pitch}
              onChange={e => changePitch(deckId, parseFloat(e.target.value))}
              className="h-28 cursor-pointer accent-current"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: color }}
            />
            <span className="font-mono text-[8px] font-bold" style={{ color }}>
              {deck.pitch > 0 ? '+' : ''}{deck.pitch.toFixed(1)}
            </span>
          </div>

          <JogWheel
            deckId={deckId}
            angle={deck.jogAngle}
            isScratch={deck.isScratch}
            isPlaying={deck.isPlaying}
            coverImage={deck.track?.albumCover || album.coverImage}
            onScratchStart={() => {}}
            onScratchMove={d => onJogMove(deckId, d)}
            onScratchEnd={() => {}}
            onToggleScratch={() => setDeck(p => ({ ...p, isScratch: !p.isScratch }))}
          />

          <div className="flex flex-col gap-2 items-center">
            <div className="bg-[#111] rounded-lg border border-white/5 p-2 text-center min-w-[52px]">
              <p className="text-[7px] font-black uppercase tracking-widest text-white/30">BPM</p>
              <p className="font-mono text-sm font-black" style={{ color }}>{deck.bpm.toFixed(1)}</p>
            </div>
            <button
              onClick={() => syncBPM(deckId)}
              className="px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest border border-white/10 text-white/30 hover:border-white/30 hover:text-white transition-all"
            >
              SYNC
            </button>
            <EQKnob label="HI" value={eq.high} onChange={v => setEq(p => ({ ...p, high: v }))} color={color} />
            <EQKnob label="MID" value={eq.mid} onChange={v => setEq(p => ({ ...p, mid: v }))} color={color} />
            <EQKnob label="LOW" value={eq.low} onChange={v => setEq(p => ({ ...p, low: v }))} color={color} />
          </div>
        </div>

        {/* Transport */}
        <div className="flex gap-1.5 justify-center">
          <button
            onClick={() => setCue(deckId)}
            className="px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 text-white/50 hover:bg-white/5 transition-all"
          >
            CUE
          </button>
          <button
            onClick={() => { initAudio(); togglePlay(deckId); }}
            disabled={!deck.buffer}
            className="px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
            style={deck.isPlaying
              ? { background: color, color: '#000' }
              : { background: '#1A1A1A', border: `1px solid ${color}66`, color }}
          >
            {deck.isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          {loadingDeck === deckId && (
            <div className="px-3 py-2 rounded-lg text-[9px] font-black text-white/30 animate-pulse">Loading...</div>
          )}
        </div>

        {/* Loop controls */}
        <div className="flex gap-1 justify-center">
          {[
            { label: 'IN',   action: () => setLoopIn(deckId),   active: deck.loopIn !== null },
            { label: 'OUT',  action: () => setLoopOut(deckId),  active: deck.loopOut !== null },
            { label: 'LOOP', action: () => toggleLoop(deckId),  active: deck.loopActive },
          ].map(({ label, action, active }) => (
            <button
              key={label}
              onClick={action}
              className="px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all"
              style={{
                borderColor: active ? color : 'rgba(255,255,255,0.1)',
                color: active ? color : 'rgba(255,255,255,0.3)',
                background: active ? `${color}15` : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Hot cues */}
        <div className="grid grid-cols-4 gap-1">
          {deck.hotCues.map((cue, i) => (
            <button
              key={i}
              onClick={() => setHotCue(deckId, i)}
              onContextMenu={e => {
                e.preventDefault();
                const setState = deckId === 'A' ? setDeckA : setDeckB;
                setState(prev => {
                  const cues = [...prev.hotCues];
                  cues[i] = null;
                  return { ...prev, hotCues: cues };
                });
              }}
              className="py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all"
              style={{
                borderColor: cue !== null ? SAMPLE_COLORS[i] : 'rgba(255,255,255,0.08)',
                color: cue !== null ? SAMPLE_COLORS[i] : 'rgba(255,255,255,0.25)',
                background: cue !== null ? `${SAMPLE_COLORS[i]}15` : 'transparent',
              }}
            >
              {cue !== null ? formatTime(cue).split('.')[0] : `CUE ${i + 1}`}
            </button>
          ))}
        </div>

        {/* FX row */}
        <div className="grid grid-cols-3 gap-2 px-1">
          {[
            { label: 'FILTER', key: 'filter' as const },
            { label: 'DELAY',  key: 'delay'  as const },
            { label: 'REVERB', key: 'reverb' as const },
          ].map(({ label, key }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <input
                type="range" min={0} max={1} step={0.01}
                value={deck.fx[key]}
                onChange={e => setDeck(prev => ({ ...prev, fx: { ...prev.fx, [key]: parseFloat(e.target.value) } }))}
                className="w-full accent-current"
                style={{ accentColor: color }}
              />
              <span className="text-[7px] font-black uppercase tracking-widest text-white/25">{label}</span>
            </div>
          ))}
        </div>

        {/* Sample pads */}
        <div className="grid grid-cols-4 gap-1">
          {deck.samples.map((pad, i) => (
            <div key={pad.id} className="flex flex-col gap-0.5">
              <button
                onClick={() => triggerSample(deckId, i)}
                className="py-2 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all border"
                style={{
                  borderColor: pad.buffer ? pad.color : 'rgba(255,255,255,0.08)',
                  background: pad.isPlaying ? `${pad.color}44` : pad.buffer ? `${pad.color}15` : 'transparent',
                  color: pad.buffer ? pad.color : 'rgba(255,255,255,0.2)',
                  boxShadow: pad.isPlaying ? `0 0 12px ${pad.color}66` : 'none',
                }}
              >
                {pad.buffer ? (pad.title.length > 6 ? pad.title.substring(0, 6) + '…' : pad.title) : `SMP ${i + 1}`}
              </button>
              <label className="cursor-pointer">
                <input type="file" accept="audio/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadSample(deckId, i, f); }} />
                <div className="text-center text-[6px] font-black uppercase tracking-widest text-white/15 hover:text-white/40 transition-colors">
                  ↑ load
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Library ─────────────────────────────────────────────────────────────────

  // Load the user's private music locker into the crate (personal_tracks).
  // Personal use only — DJ with your own collection from any instance.
  const loadLocker = useCallback(async () => {
    if (lockerLoaded || loadingLocker) return;
    setLoadingLocker(true);
    try {
      const personal = await fetchPersonalTracks();
      setLibraryTracks(prev => {
        const seen = new Set(prev.map(t => t.id));
        return [...prev, ...(personal || []).filter(t => t.url && !seen.has(t.id))];
      });
      setLockerLoaded(true);
    } finally { setLoadingLocker(false); }
  }, [lockerLoaded, loadingLocker]);

  const filtered = libraryTracks.filter(t =>
    !libSearch || t.title.toLowerCase().includes(libSearch.toLowerCase()) || t.artist.toLowerCase().includes(libSearch.toLowerCase())
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="fixed inset-0 z-[300] bg-black flex flex-col overflow-hidden"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0A0A0A] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Disc size={16} className="text-[#00D4AA]" />
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white">DJ Mode</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/20">— {album.title}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* MIDI status */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/8">
            <Usb size={10} className={midiStatus === 'ok' ? 'text-[#00D4AA]' : 'text-white/20'} />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">
              {midiStatus === 'ok' ? 'MIDI Connected' : midiStatus === 'denied' ? 'No MIDI' : 'MIDI…'}
            </span>
          </div>

          {/* Smart Lighting */}
          <button
            onClick={() => setIsLightingOpen(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
              isLightingOpen
                ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
                : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
            }`}
          >
            <Lightbulb size={10} /> Lights
          </button>

          {/* Live Talk */}
          <button
            onClick={() => setIsLiveActive(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
              isLiveActive
                ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
                : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
            }`}
          >
            <Radio size={10} /> {isLiveActive ? 'Live On Air' : 'Go Live'}
          </button>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Decks ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 flex-1 min-h-0 overflow-hidden">
        {/* Deck A */}
        <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-3 border-r border-white/5"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const tid = e.dataTransfer.getData('trackId');
            const track = libraryTracks.find(t => t.id === tid);
            if (track) loadTrack(track, 'A');
            const file = e.dataTransfer.files?.[0];
            if (file?.type.startsWith('audio/')) importLocalFile(file, 'A');
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#00D4AA]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-[#00D4AA]">Deck A</span>
          </div>
          {renderDeck('A')}
        </div>

        {/* Mixer */}
        <div className="w-32 shrink-0 bg-[#0A0A0A] border-x border-white/5 flex flex-col items-center gap-4 py-4 px-2">
          <span className="text-[7px] font-black uppercase tracking-widest text-white/20">Mixer</span>

          {/* Volume A */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[6px] font-black uppercase tracking-widest text-[#00D4AA]/50">Vol A</span>
            <input type="range" min={0} max={1} step={0.01} value={deckA.volume}
              onChange={e => setDeckA(p => ({ ...p, volume: parseFloat(e.target.value) }))}
              className="h-24 cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#00D4AA' }}
            />
            <span className="font-mono text-[7px] text-[#00D4AA]/50">{Math.round(deckA.volume * 100)}</span>
          </div>

          {/* Crossfader */}
          <div className="flex flex-col items-center gap-1 w-full">
            <span className="text-[6px] font-black uppercase tracking-widest text-white/20">XFADE</span>
            <input type="range" min={0} max={1} step={0.01} value={crossfader}
              onChange={e => setCrossfader(parseFloat(e.target.value))}
              className="w-full cursor-pointer" style={{ accentColor: '#888' }}
            />
            <div className="flex justify-between w-full">
              <span className="text-[6px] font-black text-[#00D4AA]/50">A</span>
              <span className="text-[6px] font-black text-[#FF6B6B]/50">B</span>
            </div>
          </div>

          {/* Volume B */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[6px] font-black uppercase tracking-widest text-[#FF6B6B]/50">Vol B</span>
            <input type="range" min={0} max={1} step={0.01} value={deckB.volume}
              onChange={e => setDeckB(p => ({ ...p, volume: parseFloat(e.target.value) }))}
              className="h-24 cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: '#FF6B6B' }}
            />
            <span className="font-mono text-[7px] text-[#FF6B6B]/50">{Math.round(deckB.volume * 100)}</span>
          </div>
        </div>

        {/* Deck B */}
        <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-3 border-l border-white/5"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const tid = e.dataTransfer.getData('trackId');
            const track = libraryTracks.find(t => t.id === tid);
            if (track) loadTrack(track, 'B');
            const file = e.dataTransfer.files?.[0];
            if (file?.type.startsWith('audio/')) importLocalFile(file, 'B');
          }}
        >
          <div className="flex items-center gap-2 mb-2 justify-end">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#FF6B6B]">Deck B</span>
            <div className="w-2 h-2 rounded-full bg-[#FF6B6B]" />
          </div>
          {renderDeck('B')}
        </div>
      </div>

      {/* ── Smart Lighting Panel ─────────────────────────────────────────── */}
      <SmartLightingPanel
        isOpen={isLightingOpen}
        onClose={() => setIsLightingOpen(false)}
        analyser={nodesA.current?.analyser ?? null}
      />

      {/* ── Library ────────────────────────────────────────────────────────── */}
      <div className="h-40 shrink-0 bg-[#080808] border-t border-white/5 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
          <List size={12} className="text-white/30" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Library</span>
          <input
            value={libSearch}
            onChange={e => setLibSearch(e.target.value)}
            placeholder="Search tracks…"
            className="flex-1 bg-transparent text-[9px] text-white/60 placeholder-white/20 outline-none font-black uppercase tracking-widest"
          />
          <button onClick={loadLocker} disabled={loadingLocker || lockerLoaded}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/8 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
            title="Load your private music locker">
            <Folder size={10} /> {lockerLoaded ? 'Locker Loaded' : loadingLocker ? 'Loading…' : 'My Locker'}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1 rounded-full bg-white/[0.04] border border-white/8 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            <Upload size={10} /> Import
            <input type="file" accept="audio/*" className="hidden" multiple
              onChange={e => Array.from(e.target.files || []).forEach(f => importLocalFile(f))}
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {filtered.map(track => (
            <div
              key={track.id}
              draggable
              onDragStart={e => e.dataTransfer.setData('trackId', track.id)}
              className="flex items-center gap-3 px-4 py-1.5 hover:bg-white/[0.03] cursor-grab active:cursor-grabbing border-b border-white/[0.03] group"
            >
              <div className="w-6 h-6 rounded overflow-hidden shrink-0">
                {track.albumCover
                  ? <img src={thumb(track.albumCover, THUMB.micro) || undefined} alt="" loading="lazy" decoding="async" onError={onThumbError(track.albumCover)} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-[#1A1A1A] flex items-center justify-center"><Music2 size={8} className="text-white/20" /></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/70 truncate group-hover:text-white transition-colors">{track.title}</p>
                <p className="text-[7px] font-black uppercase tracking-widest text-white/25 truncate">{track.artist}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => loadTrack(track, 'A')}
                  className="px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-[#00D4AA]/20 text-[#00D4AA] hover:bg-[#00D4AA]/30 transition-colors">A</button>
                <button onClick={() => loadTrack(track, 'B')}
                  className="px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-[#FF6B6B]/20 text-[#FF6B6B] hover:bg-[#FF6B6B]/30 transition-colors">B</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default DJModeView;
