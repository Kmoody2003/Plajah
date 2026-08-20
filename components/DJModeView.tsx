import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Album, Track } from '../types';
import {
  X, Play, Pause, SkipBack, SkipForward, Repeat, ZapOff,
  Zap, Headphones, Radio, Music2, Upload, Folder, ChevronLeft,
  ChevronRight, RotateCcw, Activity, Volume2, Shuffle, List,
  Disc, Mic2, Monitor, Usb, AlertCircle, CheckCircle, Lightbulb, Square,
  Video, LayoutGrid
} from 'lucide-react';
import SmartLightingPanel from './SmartLightingPanel';
import StreamStudio from './dj/StreamStudio';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { fetchPersonalTracks } from '../services/backendService';
import { getCachedAnalysis, getOrComputeAnalysis, loadTrackTheory } from '../services/djAnalysis';
import { mediaFetchUrl } from '../services/mediaFetchPolicy';

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
  key: string | null;  // Camelot key badge (e.g. '8A'), loaded from cached theory
  loopIn: number | null;
  loopOut: number | null;
  loopActive: boolean;
  loopBeats: number | null;   // active beat-loop size (highlights the Loop-mode pad)
  padMode: PadMode;           // which performance-pad layer is showing
  hotCues: (number | null)[]; // 8 hot cues
  samples: SamplePad[];       // 8 sample pads
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
  /** Album context when launched from the player. Optional so DJ Console can open
   *  as its own app with an empty crate the user fills from Chora / Locker / import. */
  album?: Album;
  onClose: () => void;
  initialTrack?: Track | null;      // Currently playing track → auto-load Deck A
  initialTime?: number;             // Current playback position for Deck A
  initialTrackIndex?: number;       // Index in album.tracks for the current track
  onPauseGlobal?: () => void;       // Called immediately to hand off audio control
  /** The global player's shared, always-unlocked AudioContext. When provided, the decks
   *  build on THIS instead of a separate context — so DJ audio can't get stuck suspended. */
  getSharedAudioContext?: () => AudioContext | null;
  /** Hand playback back to the album view on exit so the song KEEPS playing, carrying the
   *  deck's position, play-state, and filter setting. */
  onExitToGlobal?: (track: Track, timeSec: number, opts: { playing: boolean; filter: number }) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Plajah design-language deck identity. Four decks: A/C share the left channel,
// B/D share the right channel (A/C and B/D swap via tabs — 2-channel, 4-deck).
type DeckId = 'A' | 'B' | 'C' | 'D';
const DECK_COLORS: Record<DeckId, string> = { A: '#00DAF3', B: '#D40055', C: '#8B5CF6', D: '#F59E0B' };
// Performance-pad palette — eight distinct colours (hot cues + samples), none equal to a deck colour.
const SAMPLE_COLORS = ['#FF5A5F', '#FFB020', '#FFD93D', '#6BCB77', '#2BE0A8', '#4D96FF', '#B980F0', '#FF6AD5'];
// Beat-loop sizes offered in Loop pad mode (in beats).
const BEAT_LOOPS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
const beatLoopLabel = (b: number) => (b < 1 ? `1/${Math.round(1 / b)}` : String(b));
type PadMode = 'cue' | 'loop' | 'sample';
const DEFAULT_BPM = 128;
const PITCH_RANGE = 6;
const WAVEFORM_POINTS = 800;

// ── Musical key → Camelot wheel (the readout working DJs harmonic-mix by) ───────
const PITCH_CLASS: Record<string, number> = {
  c: 0, 'c#': 1, db: 1, d: 2, 'd#': 3, eb: 3, e: 4, fb: 4, 'e#': 5, f: 5,
  'f#': 6, gb: 6, g: 7, 'g#': 8, ab: 8, a: 9, 'a#': 10, bb: 10, b: 11, cb: 11,
};
const CAMELOT_MAJOR = ['8B','3B','10B','5B','12B','7B','2B','9B','4B','11B','6B','1B'];
const CAMELOT_MINOR = ['5A','12A','7A','2A','9A','4A','11A','6A','1A','8A','3A','10A'];
function toCamelot(key?: string, scale?: string): string | null {
  if (!key) return null;
  const raw = key.trim().toLowerCase();
  const m = raw.match(/^([a-g](?:#|b)?)/);
  if (!m) return null;
  const pc = PITCH_CLASS[m[1]];
  if (pc === undefined) return null;
  const minor = /min|minor|\bm\b|aeolian/.test(`${raw} ${(scale || '').toLowerCase()}`);
  return (minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[pc] ?? null;
}

// ── DJ audio engine ────────────────────────────────────────────────────────────
// DJ mode builds its decks on the GLOBAL player's shared AudioContext (passed in via
// getSharedAudioContext) so it's the same always-unlocked engine the player already uses —
// this is what stops the decks from being silent. primeDJAudio() is only a FALLBACK for the
// rare case that context isn't available; it still must be called from a click (gesture) to
// unlock, since an AudioContext born in a React effect stays suspended in Chrome.
let sharedDJCtx: AudioContext | null = null;
export function primeDJAudio(): AudioContext {
  if (!sharedDJCtx || sharedDJCtx.state === 'closed') {
    sharedDJCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedDJCtx.state === 'suspended') sharedDJCtx.resume().catch(() => {});
  return sharedDJCtx;
}

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
}> = ({ label, value, onChange, color = '#00DAF3' }) => {
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
  color: string;
  angle: number;
  isScratch: boolean;
  isPlaying: boolean;
  coverImage: string | null;
  onScratchStart: () => void;
  onScratchMove: (deltaDeg: number) => void;
  onScratchEnd: () => void;
  onToggleScratch: () => void;
}> = ({ color, angle, isScratch, isPlaying, coverImage, onScratchStart, onScratchMove, onScratchEnd, onToggleScratch }) => {
  const jogRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef(0);
  const isDraggingRef = useRef(false);

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

const DJModeView: React.FC<Props> = ({ album, onClose, initialTrack, initialTime = 0, initialTrackIndex = 0, onPauseGlobal, getSharedAudioContext, onExitToGlobal }) => {
  // Safe album context — DJ Console can run with no album (its own app).
  const albumTitle = album?.title || 'Live Session';
  const albumCover = album?.coverImage || '';
  const albumTracks = album?.tracks ?? [];
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isSharedCtxRef = useRef(false);   // true when audioCtxRef is the global player's shared context
  const masterGainRef = useRef<GainNode | null>(null);
  const nodesA = useRef<DeckAudioNodes | null>(null);
  const nodesB = useRef<DeckAudioNodes | null>(null);
  const nodesC = useRef<DeckAudioNodes | null>(null);
  const nodesD = useRef<DeckAudioNodes | null>(null);
  const rafRef = useRef<number>(0);
  const midiRef = useRef<MIDIAccess | null>(null);

  const emptyDeck = (id: DeckId): DeckState => ({
    track: null, buffer: null, peaks: null,
    isPlaying: false, isCued: false,
    currentTime: 0, duration: 0,
    volume: 0.8, pitch: 0, bpm: DEFAULT_BPM, key: null,
    loopIn: null, loopOut: null, loopActive: false,
    loopBeats: null, padMode: 'cue',
    hotCues: [null, null, null, null, null, null, null, null],
    samples: SAMPLE_COLORS.map((color, i) => ({
      id: `${id}-sample-${i}`, title: '', url: null, buffer: null,
      sourceNode: null, gainNode: null, isPlaying: false, color,
    })),
    fx: { filter: 0.5, delay: 0, reverb: 0 },
    jogAngle: 0, isScratch: true,
  });

  const [deckA, setDeckA] = useState<DeckState>(() => emptyDeck('A'));
  const [deckB, setDeckB] = useState<DeckState>(() => emptyDeck('B'));
  const [deckC, setDeckC] = useState<DeckState>(() => emptyDeck('C'));
  const [deckD, setDeckD] = useState<DeckState>(() => emptyDeck('D'));
  const [crossfader, setCrossfader] = useState(0.5);
  const [eqA, setEqA] = useState({ low: 0, mid: 0, high: 0 });
  const [eqB, setEqB] = useState({ low: 0, mid: 0, high: 0 });
  const [eqC, setEqC] = useState({ low: 0, mid: 0, high: 0 });
  const [eqD, setEqD] = useState({ low: 0, mid: 0, high: 0 });
  // Which deck each mixer channel currently shows (A/C on the left, B/D on the right).
  const [leftDeckId, setLeftDeckId] = useState<DeckId>('A');
  const [rightDeckId, setRightDeckId] = useState<DeckId>('B');

  // ── Per-deck accessor maps (4 decks) — read state / setter / nodes / eq by id ──
  const DS: Record<DeckId, DeckState> = { A: deckA, B: deckB, C: deckC, D: deckD };
  const SET: Record<DeckId, React.Dispatch<React.SetStateAction<DeckState>>> = { A: setDeckA, B: setDeckB, C: setDeckC, D: setDeckD };
  const NODES: Record<DeckId, React.MutableRefObject<DeckAudioNodes | null>> = { A: nodesA, B: nodesB, C: nodesC, D: nodesD };
  const EQ: Record<DeckId, { low: number; mid: number; high: number }> = { A: eqA, B: eqB, C: eqC, D: eqD };
  const SETEQ: Record<DeckId, React.Dispatch<React.SetStateAction<{ low: number; mid: number; high: number }>>> = { A: setEqA, B: setEqB, C: setEqC, D: setEqD };
  const [libraryTracks, setLibraryTracks] = useState<Track[]>(albumTracks);
  const [libSearch, setLibSearch] = useState('');
  // Booth = the pro rack; Stream = the streamer switcher (webcam / mic / Pixels / program out).
  const [workspace, setWorkspace] = useState<'booth' | 'stream'>('booth');
  // Bumped once the shared audio engine is built, so StreamStudio receives the real ctx/master.
  const [audioReady, setAudioReady] = useState(false);
  const [lockerLoaded, setLockerLoaded] = useState(false);
  const [loadingLocker, setLoadingLocker] = useState(false);
  const [midiStatus, setMidiStatus] = useState<'idle' | 'ok' | 'denied'>('idle');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [loadingDeck, setLoadingDeck] = useState<DeckId | null>(null);
  const [isLightingOpen, setIsLightingOpen] = useState(false);
  // ── Record the set → Post as a Chora Mix ──
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // ─── Audio init ─────────────────────────────────────────────────────────────

  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    // Build the decks on the GLOBAL player's shared, always-unlocked context (the same one
    // the player already outputs through). Fall back to a click-primed context only if it
    // isn't available. This is what stops the decks from being silent.
    const ctx = getSharedAudioContext?.() ?? primeDJAudio();
    audioCtxRef.current = ctx;
    isSharedCtxRef.current = !!getSharedAudioContext?.();

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
    nodesC.current = buildDeckNodes();
    nodesD.current = buildDeckNodes();
    updateCrossfader(crossfader);
    setAudioReady(true);   // hand the real ctx/master to StreamStudio

    return ctx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSharedAudioContext]);

  // Crossfader mixes the two VISIBLE decks (equal-power); the other two play at unity.
  const updateCrossfader = (value: number) => {
    const angle = value * Math.PI / 2;
    const l = NODES[leftDeckId].current, r = NODES[rightDeckId].current;
    if (l) l.xfadeGain.gain.value = Math.cos(angle);
    if (r) r.xfadeGain.gain.value = Math.sin(angle);
    (['A', 'B', 'C', 'D'] as DeckId[]).forEach(id => {
      if (id !== leftDeckId && id !== rightDeckId) { const n = NODES[id].current; if (n) n.xfadeGain.gain.value = 1; }
    });
  };

  // ─── Track loading ──────────────────────────────────────────────────────────

  const loadTrack = useCallback(async (
    track: Track,
    deckId: DeckId,
    opts?: { autoPlay?: boolean; startOffset?: number }
  ) => {
    const ctx = initAudio();
    if (ctx.state === 'suspended') await ctx.resume();
    setLoadingDeck(deckId);
    try {
      // Route through the shared media-fetch policy: Audius/CORS-open hosts fetch
      // directly (an Audius deck loads), everything else via /api/proxy. Falls back
      // to the raw URL if the policy target fails (e.g. proxy 500 on a redirect).
      let response: Response;
      try {
        response = await fetch(mediaFetchUrl(track.url));
        if (!response.ok) throw new Error(String(response.status));
      } catch {
        response = await fetch(track.url);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer  = await ctx.decodeAudioData(arrayBuffer);
      const peaks = extractPeaks(audioBuffer);
      // Prefer the precomputed BPM (proper beat detection, done at upload) over the cheap
      // in-deck estimate — instant and far more accurate. Warm it in the background if absent.
      const cached = getCachedAnalysis(track);
      const bpm = cached?.bpm ?? estimateBPM(audioBuffer);
      if (!cached) void getOrComputeAnalysis(track);
      const offset = Math.max(0, Math.min(opts?.startOffset ?? 0, audioBuffer.duration - 0.1));
      const setState = SET[deckId];
      setState(prev => ({
        ...prev, track, buffer: audioBuffer, peaks,
        bpm, duration: audioBuffer.duration, key: null,
        currentTime: offset, isPlaying: false, isCued: false,
        loopIn: null, loopOut: null, loopActive: false,
        hotCues: [null, null, null, null],
      }));
      // Harmonic key badge — resolve from cached/derived theory (no extra decode).
      if (track.id) {
        loadTrackTheory(track.id).then(theory => {
          const cam = toCamelot(theory?.key, theory?.scale);
          if (cam) setState(prev => (prev.track?.id === track.id ? { ...prev, key: cam } : prev));
        }).catch(() => {});
      }
      // Auto-start directly using the decoded buffer (bypasses React state timing)
      if (opts?.autoPlay) {
        const nodes = NODES[deckId].current;
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

  const startSource = useCallback((deckId: DeckId, offset: number, rate = 1) => {
    const ctx = audioCtxRef.current;
    const nodes = NODES[deckId].current;
    const state = DS[deckId];
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
  }, [deckA, deckB, deckC, deckD]);

  const togglePlay = useCallback((deckId: DeckId) => {
    const ctx = audioCtxRef.current;
    const nodes = NODES[deckId].current;
    const state = DS[deckId];
    const setState = SET[deckId];
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
  }, [deckA, deckB, deckC, deckD, startSource, initAudio]);

  const setCue = useCallback((deckId: DeckId) => {
    const ctx = audioCtxRef.current;
    const nodes = NODES[deckId].current;
    const state = DS[deckId];
    const setState = SET[deckId];
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
  }, [deckA, deckB, deckC, deckD, startSource]);

  const seekTo = useCallback((deckId: DeckId, time: number) => {
    const ctx = audioCtxRef.current;
    const nodes = NODES[deckId].current;
    const state = DS[deckId];
    const setState = SET[deckId];
    if (!state.buffer || !ctx) return;

    const clampedTime = Math.max(0, Math.min(time, state.buffer.duration));
    setState(prev => ({ ...prev, currentTime: clampedTime }));

    if (state.isPlaying) startSource(deckId, clampedTime, pitchToRate(state.pitch));
  }, [deckA, deckB, deckC, deckD, startSource]);

  // ─── Sync BPM ───────────────────────────────────────────────────────────────

  const syncBPM = useCallback((targetId: DeckId) => {
    // Sync to the OTHER visible deck (the one on the opposite channel).
    const sourceId: DeckId = targetId === leftDeckId ? rightDeckId : leftDeckId;
    const source = DS[sourceId];
    const setState = SET[targetId];
    const nodes = NODES[targetId].current;
    if (!source.bpm || !nodes?.sourceNode) return;
    const targetState = DS[targetId];
    const ratio = source.bpm / (targetState.bpm || DEFAULT_BPM);
    if (nodes.sourceNode) nodes.sourceNode.playbackRate.value = ratio * pitchToRate(targetState.pitch);
    setState(prev => ({ ...prev, bpm: source.bpm }));
  }, [deckA, deckB, deckC, deckD, leftDeckId, rightDeckId]);

  // ─── Jog wheel ──────────────────────────────────────────────────────────────

  const onJogMove = useCallback((deckId: DeckId, deltaDeg: number) => {
    const ctx = audioCtxRef.current;
    const nodes = NODES[deckId].current;
    const state = DS[deckId];
    const setState = SET[deckId];

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
  }, [deckA, deckB, deckC, deckD]);

  // ─── Loop controls ──────────────────────────────────────────────────────────

  const setLoopIn = (deckId: DeckId) => {
    const state = DS[deckId];
    (SET[deckId])(prev => ({ ...prev, loopIn: state.currentTime }));
  };
  const setLoopOut = (deckId: DeckId) => {
    const state = DS[deckId];
    (SET[deckId])(prev => ({ ...prev, loopOut: state.currentTime }));
  };
  const toggleLoop = (deckId: DeckId) => {
    const state = DS[deckId];
    const nodes = NODES[deckId].current;
    if (!state.loopIn || !state.loopOut || !nodes?.sourceNode) return;
    nodes.sourceNode.loop = !state.loopActive;
    nodes.sourceNode.loopStart = state.loopIn;
    nodes.sourceNode.loopEnd = state.loopOut;
    (SET[deckId])(prev => ({ ...prev, loopActive: !prev.loopActive, loopBeats: prev.loopActive ? null : prev.loopBeats }));
  };

  // Beat-loop: snap a loop of N beats from the current position (Loop pad mode).
  // Pressing the active size again releases the loop — the Traktor toggle behaviour.
  const setBeatLoop = (deckId: DeckId, beats: number) => {
    const state = DS[deckId];
    const setState = SET[deckId];
    const nodes = NODES[deckId].current;
    if (!state.buffer) return;
    if (state.loopActive && state.loopBeats === beats) {
      if (nodes?.sourceNode) nodes.sourceNode.loop = false;
      setState(prev => ({ ...prev, loopActive: false, loopBeats: null }));
      return;
    }
    const len = (60 / (state.bpm || DEFAULT_BPM)) * beats;
    const inAt = state.currentTime;
    const outAt = Math.min(inAt + len, state.buffer.duration);
    if (nodes?.sourceNode) {
      nodes.sourceNode.loopStart = inAt;
      nodes.sourceNode.loopEnd = outAt;
      nodes.sourceNode.loop = true;
    }
    setState(prev => ({ ...prev, loopIn: inAt, loopOut: outAt, loopActive: true, loopBeats: beats }));
  };

  // ─── Hot cues ───────────────────────────────────────────────────────────────

  const setHotCue = (deckId: DeckId, idx: number) => {
    const state = DS[deckId];
    const setState = SET[deckId];
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

  // EQ for all four decks.
  useEffect(() => {
    const MAX_DB = 12;
    (['A', 'B', 'C', 'D'] as DeckId[]).forEach(id => {
      const n = NODES[id].current; if (!n) return;
      const e = EQ[id];
      n.eqLow.gain.value  = e.low  * MAX_DB;
      n.eqMid.gain.value  = e.mid  * MAX_DB;
      n.eqHigh.gain.value = e.high * MAX_DB;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqA, eqB, eqC, eqD]);

  // ─── Volume + FX sync (all four decks) ───────────────────────────────────────

  useEffect(() => {
    (['A', 'B', 'C', 'D'] as DeckId[]).forEach(id => {
      const n = NODES[id].current; if (!n) return;
      const d = DS[id];
      n.gainNode.gain.value = d.volume;
      // Filter sweep: 0=200Hz, 0.5=off, 1=8kHz → kill at extremes
      const f = d.fx.filter;
      if (Math.abs(f - 0.5) < 0.05) {
        n.filterNode.frequency.value = 20000;
      } else if (f < 0.5) {
        n.filterNode.type = 'lowpass';
        n.filterNode.frequency.value = 200 + f * 2 * 3800;
      } else {
        n.filterNode.type = 'highpass';
        n.filterNode.frequency.value = (f - 0.5) * 2 * 8000;
      }
      n.delayWet.gain.value = d.fx.delay * 0.7;
      n.reverbWet.gain.value = d.fx.reverb * 0.6;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckA.volume, deckA.fx, deckB.volume, deckB.fx, deckC.volume, deckC.fx, deckD.volume, deckD.fx]);

  useEffect(() => { updateCrossfader(crossfader); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [crossfader, leftDeckId, rightDeckId]);

  // ─── Pitch change ───────────────────────────────────────────────────────────

  const changePitch = (deckId: DeckId, semitones: number) => {
    const nodes = NODES[deckId].current;
    const setState = SET[deckId];
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
      updateDeckTime(nodesC.current, deckC, setDeckC);
      updateDeckTime(nodesD.current, deckD, setDeckD);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckA.isPlaying, deckB.isPlaying, deckC.isPlaying, deckD.isPlaying]);

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

  const loadSample = async (deckId: DeckId, padIdx: number, file: File) => {
    const ctx = initAudio();
    const ab = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    const setState = SET[deckId];
    setState(prev => {
      const samples = [...prev.samples];
      samples[padIdx] = { ...samples[padIdx], title: file.name.replace(/\.[^.]+$/, ''), buffer: buf, url: URL.createObjectURL(file) };
      return { ...prev, samples };
    });
  };

  const triggerSample = (deckId: DeckId, padIdx: number) => {
    const ctx = audioCtxRef.current || initAudio();
    if (ctx.state === 'suspended') ctx.resume();
    const state = DS[deckId];
    const pad = state.samples[padIdx];
    if (!pad.buffer || !masterGainRef.current) return;

    if (pad.isPlaying && pad.sourceNode) {
      try { pad.sourceNode.stop(); } catch {}
    }
    const source = ctx.createBufferSource();
    source.buffer = pad.buffer;
    source.connect(masterGainRef.current);
    source.start();

    const setState = SET[deckId];
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

  const importLocalFile = async (file: File, deckId?: DeckId) => {
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

    // Load next track in album into Deck B (only when launched with an album crate)
    if (albumTracks.length > 0) {
      const nextIdx = ((initialTrackIndex ?? 0) + 1) % albumTracks.length;
      const nextTrack = albumTracks[nextIdx];
      if (nextTrack && nextTrack.id !== initialTrack?.id) {
        loadTrack(nextTrack, 'B');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      // NEVER close the context — it's the global player's shared engine (or a reused
      // singleton). Just stop this session's deck sources and disconnect its own master,
      // leaving the shared graph (and the player's own nodes) untouched.
      try { nodesA.current?.sourceNode?.stop(); } catch { /* */ }
      try { nodesB.current?.sourceNode?.stop(); } catch { /* */ }
      try { nodesC.current?.sourceNode?.stop(); } catch { /* */ }
      try { nodesD.current?.sourceNode?.stop(); } catch { /* */ }
      // Stopping a live recorder fires its onstop → finalize → posts the captured set.
      try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch { /* */ }
      try { masterGainRef.current?.disconnect(); } catch { /* */ }
    };
  }, []);

  // ─── Record the set → Post as a Chora Mix ─────────────────────────────────────
  // Tap the master bus (decks + samples + EQ/FX + crossfade — everything audible) with a
  // MediaStreamDestination + MediaRecorder. On stop, hand the capture to the publish wizard
  // as a pre-seeded MIX (source DJ_MODE) via the OPEN_ALBUM_CREATOR bridge.
  const pickRecMime = () => {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const MR: any = (window as any).MediaRecorder;
    for (const m of cands) { try { if (MR?.isTypeSupported?.(m)) return m; } catch { /* */ } }
    return '';
  };
  const startRecording = () => {
    const ctx = audioCtxRef.current || initAudio();
    const master = masterGainRef.current;
    if (!ctx || !master || typeof (window as any).MediaRecorder === 'undefined') {
      alert('Recording isn’t supported in this browser.'); return;
    }
    try {
      const dest = ctx.createMediaStreamDestination();
      master.connect(dest);
      recDestRef.current = dest;
      const mime = pickRecMime();
      const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) recChunksRef.current.push(e.data); };
      rec.onstop = () => finalizeRecording(rec.mimeType || mime || 'audio/webm');
      rec.start(1000); // 1s timeslices → resilient to a mid-set tab hiccup
      recorderRef.current = rec;
      setIsRecording(true);
    } catch (e) { console.error('[DJ] record start failed', e); alert('Could not start recording.'); }
  };
  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* */ } }
    setIsRecording(false);
  };
  const finalizeRecording = (mimeType: string) => {
    try { if (recDestRef.current && masterGainRef.current) masterGainRef.current.disconnect(recDestRef.current); } catch { /* */ }
    recDestRef.current = null;
    const chunks = recChunksRef.current; recChunksRef.current = [];
    recorderRef.current = null;
    if (!chunks.length) { alert('Nothing was captured.'); return; }
    const blob = new Blob(chunks, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const stamp = Date.now();
    const file = new File([blob], `dj-set-${stamp}.${ext}`, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const trackId = `mixtrk_${stamp}_${Math.random().toString(36).slice(2, 7)}`;
    const seed: Partial<Album> = {
      id: `mix_${stamp}_${Math.random().toString(36).slice(2, 7)}`,
      title: '',
      artist: album?.artist || '',
      type: 'MUSIC',
      subType: 'MIX',
      coverImage: album?.coverImage || '',
      description: '',
      tracks: [{ id: trackId, title: 'DJ Set', artist: album?.artist || '', file, url, mediaKind: 'AUDIO' } as Track],
      mixMeta: { visualMode: 'AUTO', source: 'DJ_MODE', allowComments: true },
      createdAt: stamp,
    };
    window.dispatchEvent(new CustomEvent('OPEN_ALBUM_CREATOR', { detail: { album: seed } }));
  };
  const toggleRecording = () => { isRecording ? stopRecording() : startRecording(); };

  // ─── Seamless exit — keep the music playing back in the album view ────────────
  // Hand the live deck (whichever is audible) back to the global player at its exact
  // position, play-state, and filter setting, THEN unmount. So exiting DJ mode continues
  // the song with the FX you had — and the Kill button resets it to dry.
  const handleClose = useCallback(() => {
    try {
      // The audible deck is whichever VISIBLE channel the crossfader favours.
      const right = DS[rightDeckId], left = DS[leftDeckId];
      const liveIsRight = right.isPlaying && crossfader > 0.5;
      const live = liveIsRight ? right : left;
      const liveId = liveIsRight ? rightDeckId : leftDeckId;
      if (onExitToGlobal && live.track) {
        const nodes = NODES[liveId].current;
        const ctx = audioCtxRef.current;
        let t = live.currentTime;
        if (ctx && nodes?.sourceNode) t = nodes.startOffset + (ctx.currentTime - nodes.startTime);
        onExitToGlobal(live.track, Math.max(0, t), { playing: live.isPlaying, filter: live.fx.filter });
      }
    } catch { /* fall through to a normal close */ }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckA, deckB, deckC, deckD, leftDeckId, rightDeckId, crossfader, onExitToGlobal, onClose]);

  // ─── Deck panel render helper ────────────────────────────────────────────────

  const renderDeck = (deckId: DeckId) => {
    const deck  = DS[deckId];
    const setDeck = SET[deckId];
    const eq    = EQ[deckId];
    const setEq = SETEQ[deckId];
    const color = DECK_COLORS[deckId];
    // Which two decks share this channel, and how to switch which one shows.
    const pair: DeckId[] = (deckId === 'A' || deckId === 'C') ? ['A', 'C'] : ['B', 'D'];
    const setVisible = (deckId === 'A' || deckId === 'C') ? setLeftDeckId : setRightDeckId;
    const hiddenId = pair.find(id => id !== deckId)!;
    const hidden = DS[hiddenId];

    return (
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        {/* Deck-swap tabs — A/C on the left channel, B/D on the right (4 decks, 2 channels) */}
        <div className="flex items-center gap-1.5">
          {pair.map(id => (
            <button
              key={id}
              onClick={() => setVisible(id)}
              className="w-7 h-7 rounded-lg text-[12px] font-black grid place-items-center transition-all shrink-0"
              style={id === deckId
                ? { background: DECK_COLORS[id], color: '#04070a' }
                : { border: '1px solid rgba(255,255,255,0.14)', color: DS[id].isPlaying ? DECK_COLORS[id] : 'rgba(255,255,255,0.4)' }}
              title={`Deck ${id}${DS[id].isPlaying ? ' — playing' : ''}`}
            >
              {id}
            </button>
          ))}
          <span className="text-[10px] font-bold uppercase tracking-widest ml-1" style={{ color }}>Deck {deckId}</span>
          {hidden.isPlaying && (
            <span className="ml-auto flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full" style={{ color: DECK_COLORS[hiddenId], background: DECK_COLORS[hiddenId] + '18' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: DECK_COLORS[hiddenId] }} />Deck {hiddenId} live
            </span>
          )}
        </div>

        {/* Track info + big parameter readouts (Traktor-style, readable in a dark room) */}
        <div className="px-3 py-2.5 bg-[#0c0d12] rounded-xl border border-white/10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${color}55` }}>
            {deck.track?.albumCover || albumCover ? (
              <img src={thumb(deck.track?.albumCover || albumCover, THUMB.small) || undefined} alt="" loading="lazy" decoding="async" onError={onThumbError(deck.track?.albumCover || albumCover)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#1A1A1A] flex items-center justify-center">
                <Music2 size={16} className="text-white/20" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-white truncate leading-tight">
              {deck.track?.title || 'No track loaded'}
            </p>
            <p className="text-[11px] font-semibold truncate" style={{ color: color + 'cc' }}>
              {deck.track?.artist || 'Drag from library, or load A/B'}
            </p>
          </div>
          {/* KEY (Camelot) */}
          <div className="shrink-0 rounded-lg px-2.5 py-1.5 text-center min-w-[42px]" style={{ background: `${color}1a`, border: `1px solid ${color}44` }}>
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/35">Key</p>
            <p className="font-mono text-[15px] font-black leading-none mt-0.5" style={{ color: deck.key ? color : 'rgba(255,255,255,0.25)' }}>{deck.key || '–'}</p>
          </div>
          {/* BPM */}
          <div className="shrink-0 text-right min-w-[58px]">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/35">BPM</p>
            <p className="font-mono text-[22px] font-black leading-none tabular-nums" style={{ color }}>{deck.bpm.toFixed(1)}</p>
          </div>
          {/* TIME */}
          <div className="shrink-0 text-right min-w-[62px]">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/35">Time</p>
            <p className="font-mono text-[17px] font-bold leading-none tabular-nums text-white">{formatTime(deck.currentTime).split('.')[0]}</p>
            <p className="font-mono text-[10px] font-semibold text-white/30 tabular-nums">-{formatTime(Math.max(0, deck.duration - deck.currentTime)).split('.')[0]}</p>
          </div>
          {/* PITCH */}
          <div className="shrink-0 text-right min-w-[46px]">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/35">Tempo</p>
            <p className="font-mono text-[15px] font-bold leading-none tabular-nums" style={{ color: Math.abs(deck.pitch) > 0.05 ? color : 'rgba(255,255,255,0.5)' }}>
              {deck.pitch > 0 ? '+' : ''}{((deck.pitch / PITCH_RANGE) * 8).toFixed(1)}%
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
            color={color}
            angle={deck.jogAngle}
            isScratch={deck.isScratch}
            isPlaying={deck.isPlaying}
            coverImage={deck.track?.albumCover || albumCover}
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

        {/* Performance pads — mode selector (Hot Cue / Loop / Sample) + 8-pad grid */}
        <div className="flex gap-1">
          {(['cue', 'loop', 'sample'] as PadMode[]).map(m => (
            <button
              key={m}
              onClick={() => setDeck(p => ({ ...p, padMode: m }))}
              className="flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all border"
              style={deck.padMode === m
                ? { background: `${color}22`, color, borderColor: `${color}66` }
                : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {m === 'cue' ? 'Hot Cue' : m}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {/* Hot Cue mode — 8 cues (left-click set/jump, right-click clear) */}
          {deck.padMode === 'cue' && deck.hotCues.map((cue, i) => (
            <button
              key={i}
              onClick={() => setHotCue(deckId, i)}
              onContextMenu={e => {
                e.preventDefault();
                (SET[deckId])(prev => {
                  const cues = [...prev.hotCues]; cues[i] = null; return { ...prev, hotCues: cues };
                });
              }}
              className="py-2 rounded-lg text-[9px] font-bold tabular-nums border transition-all"
              style={{
                borderColor: cue !== null ? SAMPLE_COLORS[i] : 'rgba(255,255,255,0.08)',
                color: cue !== null ? SAMPLE_COLORS[i] : 'rgba(255,255,255,0.3)',
                background: cue !== null ? `${SAMPLE_COLORS[i]}18` : 'transparent',
              }}
            >
              {cue !== null ? formatTime(cue).split('.')[0] : `${i + 1}`}
            </button>
          ))}

          {/* Loop mode — 8 beat-loop sizes (press active size again to release) */}
          {deck.padMode === 'loop' && BEAT_LOOPS.map(b => {
            const active = deck.loopActive && deck.loopBeats === b;
            return (
              <button
                key={b}
                onClick={() => setBeatLoop(deckId, b)}
                className="py-2 rounded-lg text-[10px] font-bold tabular-nums border transition-all flex flex-col items-center leading-none gap-0.5"
                style={{
                  borderColor: active ? color : 'rgba(255,255,255,0.08)',
                  color: active ? color : 'rgba(255,255,255,0.45)',
                  background: active ? `${color}22` : 'transparent',
                  boxShadow: active ? `0 0 12px ${color}55` : 'none',
                }}
              >
                {beatLoopLabel(b)}
                <span className="text-[6px] font-bold uppercase tracking-widest text-white/25">{b >= 1 ? 'bars' : 'beat'}</span>
              </button>
            );
          })}

          {/* Sample mode — 8 sample pads (trigger + load) */}
          {deck.padMode === 'sample' && deck.samples.map((pad, i) => (
            <div key={pad.id} className="flex flex-col gap-0.5">
              <button
                onClick={() => triggerSample(deckId, i)}
                className="py-2 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all border w-full"
                style={{
                  borderColor: pad.buffer ? pad.color : 'rgba(255,255,255,0.08)',
                  background: pad.isPlaying ? `${pad.color}44` : pad.buffer ? `${pad.color}18` : 'transparent',
                  color: pad.buffer ? pad.color : 'rgba(255,255,255,0.25)',
                  boxShadow: pad.isPlaying ? `0 0 12px ${pad.color}66` : 'none',
                }}
              >
                {pad.buffer ? (pad.title.length > 5 ? pad.title.substring(0, 5) + '…' : pad.title) : `${i + 1}`}
              </button>
              <label className="cursor-pointer">
                <input type="file" accept="audio/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadSample(deckId, i, f); }} />
                <div className="text-center text-[6px] font-bold uppercase tracking-widest text-white/15 hover:text-white/40 transition-colors">↑ load</div>
              </label>
            </div>
          ))}
        </div>

        {/* Manual loop set + FX */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[
              { label: 'IN',   action: () => setLoopIn(deckId),  active: deck.loopIn !== null },
              { label: 'OUT',  action: () => setLoopOut(deckId), active: deck.loopOut !== null },
              { label: 'LOOP', action: () => toggleLoop(deckId), active: deck.loopActive },
            ].map(({ label, action, active }) => (
              <button
                key={label}
                onClick={action}
                className="px-2.5 py-1 rounded-md text-[8px] font-bold uppercase tracking-widest border transition-all"
                style={{
                  borderColor: active ? color : 'rgba(255,255,255,0.1)',
                  color: active ? color : 'rgba(255,255,255,0.35)',
                  background: active ? `${color}15` : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 flex-1">
            {[
              { label: 'FILTER', key: 'filter' as const },
              { label: 'DELAY',  key: 'delay'  as const },
              { label: 'REVERB', key: 'reverb' as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex flex-col items-center gap-0.5">
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={deck.fx[key]}
                  onChange={e => setDeck(prev => ({ ...prev, fx: { ...prev.fx, [key]: parseFloat(e.target.value) } }))}
                  className="w-full accent-current"
                  style={{ accentColor: color }}
                />
                <span className="text-[7px] font-bold uppercase tracking-widest text-white/30">{label}</span>
              </div>
            ))}
          </div>
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

  // ── Program feed for the Stream workspace ────────────────────────────────────
  // Whichever visible deck is audible (by play-state + crossfader) is what streams.
  const rightVisible = DS[rightDeckId], leftVisible = DS[leftDeckId];
  const liveIsRight = rightVisible.isPlaying && crossfader > 0.5;
  const liveDeck = liveIsRight ? rightVisible : leftVisible;
  const programNowPlaying = liveDeck.track
    ? { title: liveDeck.track.title, artist: liveDeck.track.artist, deck: (liveIsRight ? rightDeckId : leftDeckId) as 'A' | 'B' }
    : null;
  const programBpm = liveDeck.bpm || DEFAULT_BPM;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="fixed inset-0 z-[300] bg-[#060609] flex flex-col overflow-hidden"
      style={{ fontFamily: "'Outfit', 'Space Grotesk', sans-serif" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0A0A0A] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <Disc size={17} className="text-[#00DAF3]" />
          <span className="text-[12px] font-black uppercase tracking-[0.28em] text-white">DJ Console</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">— {albumTitle}</span>
        </div>

        {/* Workspace toggle — Booth (pro rack) ⟷ Stream (streamer switcher) */}
        <div className="ml-3 flex items-center gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/10">
          {([
            { id: 'booth' as const, icon: LayoutGrid, label: 'Booth' },
            { id: 'stream' as const, icon: Video, label: 'Stream' },
          ]).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setWorkspace(id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                workspace === id
                  ? (id === 'stream' ? 'bg-[#D40055] text-white' : 'bg-[#00DAF3] text-black')
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* MIDI status */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/8">
            <Usb size={10} className={midiStatus === 'ok' ? 'text-[#00DAF3]' : 'text-white/20'} />
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

          {/* Record the set → Post as a Chora Mix */}
          <button
            onClick={toggleRecording}
            title={isRecording ? 'Stop recording and post your set as a Mix' : 'Record your set to post as a Chora Mix'}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
              isRecording
                ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
            }`}
          >
            {isRecording
              ? <><Square size={9} className="fill-current" /> Stop &amp; Post</>
              : <><Disc size={10} /> Record Mix</>}
          </button>

          <button
            onClick={handleClose}
            title="Exit DJ — keeps the song playing in the album view"
            className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Stream workspace — the streamer switcher ───────────────────────── */}
      {workspace === 'stream' && (
        <div className="flex-1 min-h-0 overflow-hidden bg-[#060609]">
          <StreamStudio
            audioCtx={audioReady ? audioCtxRef.current : null}
            masterGain={audioReady ? masterGainRef.current : null}
            nowPlaying={programNowPlaying}
            bpm={programBpm}
            ensureAudio={initAudio}
          />
        </div>
      )}

      {/* ── Booth workspace — decks · mixer · library ──────────────────────── */}
      {workspace === 'booth' && <>
      {/* ── Decks (A/C on the left channel, B/D on the right) ──────────────── */}
      <div className="flex gap-0 flex-1 min-h-0 overflow-hidden">
        {/* Left channel deck */}
        <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-3 border-r border-white/5"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const tid = e.dataTransfer.getData('trackId');
            const track = libraryTracks.find(t => t.id === tid);
            if (track) loadTrack(track, leftDeckId);
            const file = e.dataTransfer.files?.[0];
            if (file?.type.startsWith('audio/')) importLocalFile(file, leftDeckId);
          }}
        >
          {renderDeck(leftDeckId)}
        </div>

        {/* Mixer */}
        <div className="w-32 shrink-0 bg-[#0A0A0A] border-x border-white/5 flex flex-col items-center gap-4 py-4 px-2">
          <span className="text-[7px] font-black uppercase tracking-widest text-white/20">Mixer</span>

          {/* Left channel volume */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[6px] font-black uppercase tracking-widest" style={{ color: DECK_COLORS[leftDeckId] + '80' }}>Vol {leftDeckId}</span>
            <input type="range" min={0} max={1} step={0.01} value={DS[leftDeckId].volume}
              onChange={e => SET[leftDeckId](p => ({ ...p, volume: parseFloat(e.target.value) }))}
              className="h-24 cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: DECK_COLORS[leftDeckId] }}
            />
            <span className="font-mono text-[7px]" style={{ color: DECK_COLORS[leftDeckId] + '80' }}>{Math.round(DS[leftDeckId].volume * 100)}</span>
          </div>

          {/* Crossfader */}
          <div className="flex flex-col items-center gap-1 w-full">
            <span className="text-[6px] font-black uppercase tracking-widest text-white/20">XFADE</span>
            <input type="range" min={0} max={1} step={0.01} value={crossfader}
              onChange={e => setCrossfader(parseFloat(e.target.value))}
              className="w-full cursor-pointer" style={{ accentColor: '#888' }}
            />
            <div className="flex justify-between w-full">
              <span className="text-[6px] font-black" style={{ color: DECK_COLORS[leftDeckId] + '80' }}>{leftDeckId}</span>
              <span className="text-[6px] font-black" style={{ color: DECK_COLORS[rightDeckId] + '80' }}>{rightDeckId}</span>
            </div>
          </div>

          {/* Right channel volume */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[6px] font-black uppercase tracking-widest" style={{ color: DECK_COLORS[rightDeckId] + '80' }}>Vol {rightDeckId}</span>
            <input type="range" min={0} max={1} step={0.01} value={DS[rightDeckId].volume}
              onChange={e => SET[rightDeckId](p => ({ ...p, volume: parseFloat(e.target.value) }))}
              className="h-24 cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: DECK_COLORS[rightDeckId] }}
            />
            <span className="font-mono text-[7px]" style={{ color: DECK_COLORS[rightDeckId] + '80' }}>{Math.round(DS[rightDeckId].volume * 100)}</span>
          </div>
        </div>

        {/* Right channel deck */}
        <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-3 border-l border-white/5"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const tid = e.dataTransfer.getData('trackId');
            const track = libraryTracks.find(t => t.id === tid);
            if (track) loadTrack(track, rightDeckId);
            const file = e.dataTransfer.files?.[0];
            if (file?.type.startsWith('audio/')) importLocalFile(file, rightDeckId);
          }}
        >
          {renderDeck(rightDeckId)}
        </div>
      </div>

      {/* ── Smart Lighting Panel ─────────────────────────────────────────── */}
      <SmartLightingPanel
        isOpen={isLightingOpen}
        onClose={() => setIsLightingOpen(false)}
        analyser={NODES[leftDeckId].current?.analyser ?? null}
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
                <button onClick={() => loadTrack(track, leftDeckId)} title={`Load to Deck ${leftDeckId}`}
                  className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest transition-colors"
                  style={{ background: DECK_COLORS[leftDeckId] + '33', color: DECK_COLORS[leftDeckId] }}>{leftDeckId}</button>
                <button onClick={() => loadTrack(track, rightDeckId)} title={`Load to Deck ${rightDeckId}`}
                  className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest transition-colors"
                  style={{ background: DECK_COLORS[rightDeckId] + '33', color: DECK_COLORS[rightDeckId] }}>{rightDeckId}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>}
    </motion.div>
  );
};

export default DJModeView;
