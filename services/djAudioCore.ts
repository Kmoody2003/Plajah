// djAudioCore.ts — Core DJ and audio mathematical utilities, Camelot key conversion, and loop helpers
// Reusable across DJModeView, AmboDJTrackPlayer, Melos, and audio unit tests.

import type { Track, AudioAnalysis } from '../types';
import { loadTrackTheory, getOrComputeAnalysis, getCachedAnalysis } from './djAnalysis';

export type DeckId = 'A' | 'B' | 'C' | 'D';

export const DECK_COLORS: Record<DeckId, string> = {
  A: '#00DAF3',
  B: '#D40055',
  C: '#8B5CF6',
  D: '#F59E0B',
};

// Performance-pad palette — eight distinct colours (hot cues + samples), none equal to a deck colour.
export const SAMPLE_COLORS = [
  '#FF5A5F',
  '#FFB020',
  '#FFD93D',
  '#6BCB77',
  '#2BE0A8',
  '#4D96FF',
  '#B980F0',
  '#FF6AD5',
];

// Beat-loop sizes offered in Loop pad mode (in beats).
export const BEAT_LOOPS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];

export const beatLoopLabel = (b: number): string => (b < 1 ? `1/${Math.round(1 / b)}` : String(b));

export type PadMode = 'cue' | 'loop' | 'sample';
export const DEFAULT_BPM = 128;
export const PITCH_RANGE = 6;
export const WAVEFORM_POINTS = 800;

// ── Musical key → Camelot wheel (the readout working DJs harmonic-mix by) ───────
export const PITCH_CLASS: Record<string, number> = {
  c: 0, 'c#': 1, db: 1, d: 2, 'd#': 3, eb: 3, e: 4, fb: 4, 'e#': 5, f: 5,
  'f#': 6, gb: 6, g: 7, 'g#': 8, ab: 8, a: 9, 'a#': 10, bb: 10, b: 11, cb: 11,
};

export const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
export const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

export function toCamelot(key?: string, scale?: string): string | null {
  if (!key) return null;
  const raw = key.trim().toLowerCase();
  const m = raw.match(/^([a-g](?:#|b)?)/);
  if (!m) return null;
  const pc = PITCH_CLASS[m[1]];
  if (pc === undefined) return null;
  const minor =
    (scale && /min|m/i.test(scale)) ||
    /^m(?!aj)/i.test(raw.slice(m[1].length)) ||
    /min|minor|\bm\b|aeolian/i.test(`${raw} ${(scale || '').toLowerCase()}`);
  return (minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[pc] ?? null;
}

export function pitchToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${m}:${s < 10 ? '0' : ''}${s}.${tenths}`;
}

export function extractPeaks(buffer: AudioBuffer): Float32Array {
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

// Minimal Radix-2 FFT
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = re[j]; const ti = im[j];
      re[j] = re[i]; im[j] = im[i];
      re[i] = tr; im[i] = ti;
    }
    let m = n >> 1;
    while (j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let m = 2; m <= n; m <<= 1) {
    const mh = m >> 1;
    const theta = -2 * Math.PI / m;
    const wr = Math.cos(theta); const wi = Math.sin(theta);
    for (let i = 0; i < n; i += m) {
      let ur = 1; let ui = 0;
      for (let k = 0; k < mh; k++) {
        const p = i + k; const q = i + k + mh;
        const tr = ur * re[q] - ui * im[q];
        const ti = ur * im[q] + ui * re[q];
        re[q] = re[p] - tr; im[q] = im[p] - ti;
        re[p] += tr; im[p] += ti;
        const nur = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = nur;
      }
    }
  }
}

export interface BeatMarker {
  time: number;
  type: 'downbeat' | 'beat' | 'upbeat';
  strength: number;
  beatIndex: number;
}

export function detectBeats(buffer: AudioBuffer): BeatMarker[] {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const winSize = 1024;
  const hopSize = 512;
  
  // A simplified onset detection based on energy envelope if FFT spectral flux is too slow for the full track, 
  // but as requested, using spectral flux logic.
  const numFrames = Math.floor((ch.length - winSize) / hopSize);
  const flux = new Float32Array(numFrames);
  
  const re = new Float32Array(winSize);
  const im = new Float32Array(winSize);
  const mag = new Float32Array(winSize / 2);
  let lastMag = new Float32Array(winSize / 2);
  
  for (let i = 0; i < numFrames; i++) {
    const offset = i * hopSize;
    for (let j = 0; j < winSize; j++) {
      re[j] = ch[offset + j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / winSize)); // Hanning
      im[j] = 0;
    }
    fft(re, im);
    let currentFlux = 0;
    for (let k = 0; k < winSize / 2; k++) {
      const currentMag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mag[k] = currentMag;
      const diff = currentMag - lastMag[k];
      if (diff > 0) currentFlux += diff;
    }
    flux[i] = currentFlux;
    const temp = lastMag;
    lastMag = mag;
  }
  
  // Peak picking
  const onsets = [];
  for (let i = 2; i < numFrames - 2; i++) {
    let localAvg = 0;
    for(let w = -2; w <= 2; w++) localAvg += flux[i+w];
    localAvg /= 5;
    
    if (flux[i] > localAvg * 1.5 && flux[i] > flux[i-1] && flux[i] > flux[i+1]) {
      onsets.push({ time: (i * hopSize) / sr, strength: flux[i] });
    }
  }
  
  // Estimate tempo via autocorrelation of onset envelope
  const maxLag = Math.floor(sr / hopSize * (60 / 60)); // 60 BPM max lag
  const minLag = Math.floor(sr / hopSize * (60 / 200)); // 200 BPM min lag
  let bestLag = 0;
  let bestAc = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let i = 0; i < numFrames - lag; i++) {
      ac += flux[i] * flux[i + lag];
    }
    if (ac > bestAc) {
      bestAc = ac;
      bestLag = lag;
    }
  }
  
  const interval = bestLag > 0 ? (bestLag * hopSize) / sr : 60 / DEFAULT_BPM;
  const bpm = 60 / interval;
  
  // Phase align
  let bestPhase = 0;
  let maxPhaseStrength = 0;
  for (const onset of onsets.slice(0, 50)) {
    let phaseStrength = 0;
    for (const other of onsets) {
      const diff = Math.abs(other.time - onset.time);
      const rem = diff % interval;
      const dist = Math.min(rem, interval - rem);
      if (dist < 0.05) phaseStrength += other.strength;
    }
    if (phaseStrength > maxPhaseStrength) {
      maxPhaseStrength = phaseStrength;
      bestPhase = onset.time;
    }
  }
  
  // Generate beats
  const markers: BeatMarker[] = [];
  let firstDownbeat = bestPhase;
  while (firstDownbeat - interval >= 0) firstDownbeat -= interval;
  
  const totalBeats = Math.floor(buffer.duration / interval);
  for (let i = 0; i <= totalBeats; i++) {
    const time = firstDownbeat + i * interval;
    if (time > buffer.duration) break;
    let type: 'downbeat' | 'beat' | 'upbeat' = 'beat';
    if (i % 4 === 0) type = 'downbeat';
    else if (i % 2 !== 0) type = 'upbeat';
    markers.push({ time, type, strength: 1, beatIndex: i });
  }
  
  return markers;
}

/** @deprecated Use detectBeats() for full beat markers. This wrapper is kept for backward compatibility. */
export function estimateBPM(buffer: AudioBuffer): number {
  try {
    const beats = detectBeats(buffer);
    if (beats.length < 2) return DEFAULT_BPM;
    const intervals = beats.slice(1).map((b, i) => b.time - beats[i].time);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval <= 0) return DEFAULT_BPM;
    const bpm = Math.round(60 / avgInterval);
    return Math.max(60, Math.min(200, bpm));
  } catch {
    return DEFAULT_BPM;
  }
}

export interface ColoredWaveformPoint {
  peak: number;
  low: number;
  mid: number;
  high: number;
}

export function computeColoredWaveform(buffer: AudioBuffer, points = WAVEFORM_POINTS): ColoredWaveformPoint[] {
  const ch = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / points));
  const res: ColoredWaveformPoint[] = [];
  const sr = buffer.sampleRate;
  
  const winSize = 2048;
  const re = new Float32Array(winSize);
  const im = new Float32Array(winSize);
  
  const binFreq = sr / winSize;
  const lowBin = Math.floor(200 / binFreq);
  const midBin = Math.floor(4000 / binFreq);
  
  let maxLow = 0, maxMid = 0, maxHigh = 0;
  const rawPoints = [];
  
  for (let i = 0; i < points; i++) {
    const start = i * step;
    let peak = 0;
    for (let j = 0; j < step && start + j < ch.length; j++) {
      const v = Math.abs(ch[start + j]);
      if (v > peak) peak = v;
    }
    
    // FFT for this segment window
    for (let j = 0; j < winSize; j++) {
      if (start + j < ch.length) {
        re[j] = ch[start + j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / winSize));
      } else {
        re[j] = 0;
      }
      im[j] = 0;
    }
    fft(re, im);
    
    let low = 0, mid = 0, high = 0;
    for (let k = 1; k < winSize / 2; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      if (k <= lowBin) low += mag;
      else if (k <= midBin) mid += mag;
      else high += mag;
    }
    
    if (low > maxLow) maxLow = low;
    if (mid > maxMid) maxMid = mid;
    if (high > maxHigh) maxHigh = high;
    
    rawPoints.push({ peak, low, mid, high });
  }
  
  for (const pt of rawPoints) {
    res.push({
      peak: pt.peak,
      low: maxLow > 0 ? pt.low / maxLow : 0,
      mid: maxMid > 0 ? pt.mid / maxMid : 0,
      high: maxHigh > 0 ? pt.high / maxHigh : 0
    });
  }
  
  return res;
}

export interface BeatGrid {
  firstDownbeat: number;
  interval: number;
  bpm: number;
}

export function quantizeToBeat(time: number, grid: BeatGrid | null): number {
  if (!grid || grid.interval <= 0) return time;
  const beatsSinceFirst = (time - grid.firstDownbeat) / grid.interval;
  const nearestBeat = Math.round(beatsSinceFirst);
  return grid.firstDownbeat + nearestBeat * grid.interval;
}

export function beatAtTime(time: number, grid: BeatGrid | null): number {
  if (!grid || grid.interval <= 0) return 0;
  return Math.floor((time - grid.firstDownbeat) / grid.interval);
}

export interface DeckOptions {
  bpm?: number;
  key?: string;
  camelotKey?: string;
}

export interface DeckCue {
  time: number;
  color?: string;
  label?: string;
}

export interface DeckLoop {
  in: number;
  out: number;
  beats?: number;
}

export interface DeckInstance {
  readonly currentTime: number;
  readonly duration: number;
  readonly isPlaying: boolean;
  bpm: number | null;
  key: string | null;
  camelotKey: string | null;
  peaks: Float32Array | number[] | null;
  cues: (DeckCue | null)[];
  activeLoop: DeckLoop | null;
  beatGrid: BeatGrid | null;
  beats: BeatMarker[];
  coloredPeaks: ColoredWaveformPoint[] | null;

  load(buffer: AudioBuffer): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  setVolume(v: number): void;
  setTrim(db: number): void;
  setEQ(low: number, mid: number, high: number): void;
  setFilter(v: number): void;
  setLoop(beats: number, bpm?: number): void;
  clearLoop(): void;
  setCue(index: number, time: number): void;
  jumpToCue(index: number): void;
  clearCue(index: number): void;
  setPitch(semitones: number): void;
  setDelay(time: number, feedback: number, wet: number): void;
  setReverb(wet: number): void;
  getAnalyser(): AnalyserNode;
  connect(dest: AudioNode): void;
  disconnect(): void;

  setBeatGrid(bpm: number, firstDownbeat: number): void;
  setLoopIn(): void;
  setLoopOut(): void;
  moveLoop(direction: 1 | -1): void;
  doubleLoop(): void;
  halveLoop(): void;
  triggerCue(index: number): void;
  getCurrentTime(): number;
  computeAnalysis(): Promise<void>;
}

export function createReverb(ctx: AudioContext): ConvolverNode {
  const length = ctx.sampleRate * 2;
  const decay = 2.0;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = buffer;
  return reverb;
}

export function createDeck(ctx: AudioContext, options?: DeckOptions): DeckInstance {
  let sourceNode: AudioBufferSourceNode | null = null;
  let sourceGain: GainNode | null = null;
  let buffer: AudioBuffer | null = null;

  const gainNode = ctx.createGain();
  
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 320;
  
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1000;
  eqMid.Q.value = 1.0;
  
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 3200;
  
  const filterNode = ctx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 20000;
  
  const analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 256;
  
  const masterGain = ctx.createGain();

  const delayNode = ctx.createDelay(2.0);
  const delayFeedback = ctx.createGain();
  const delayWet = ctx.createGain();
  delayFeedback.gain.value = 0.3;
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayWet);
  delayWet.connect(masterGain);
  delayWet.gain.value = 0;
  
  const reverbNode = createReverb(ctx);
  const reverbWet = ctx.createGain();
  reverbNode.connect(reverbWet);
  reverbWet.connect(masterGain);
  reverbWet.gain.value = 0;

  gainNode.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(filterNode);
  filterNode.connect(analyserNode);

  analyserNode.connect(masterGain);
  analyserNode.connect(delayNode);
  analyserNode.connect(reverbNode);

  const state = {
    currentTime: 0,
    startTime: 0,
    startOffset: 0,
    isPlaying: false,
    bpm: options?.bpm ?? null,
    key: options?.key ?? null,
    camelotKey: options?.camelotKey ?? null,
    peaks: null as Float32Array | number[] | null,
    cues: Array(8).fill(null),
    activeLoop: null as DeckLoop | null,
    beatGrid: null as BeatGrid | null,
    beats: [] as BeatMarker[],
    coloredPeaks: null as ColoredWaveformPoint[] | null,
    pitch: 0,
    volume: 1,
    trim: 0,
    bufferDuration: 0,
    manualLoopIn: null as number | null,
  };

  const stopSource = () => {
    if (sourceNode && sourceGain) {
      const oldSrc = sourceNode;
      const oldGain = sourceGain;
      oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime);
      oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.002);
      setTimeout(() => { try { oldSrc.stop(); oldSrc.disconnect(); oldGain.disconnect(); } catch {} }, 50);
      sourceNode = null;
      sourceGain = null;
    } else if (sourceNode) {
      try { sourceNode.stop(); } catch {}
      sourceNode.disconnect();
      sourceNode = null;
    }
  };

  // ── Looping ────────────────────────────────────────────────────────────────
  // Loops use the source node's OWN loop points (loop/loopStart/loopEnd), which
  // the audio thread applies sample-accurately. The old version polled the
  // playhead with requestAnimationFrame and tried to catch a 6 ms window before
  // loop-out; frames are ~16 ms (and slower under load), so it regularly missed
  // — the clock wrapped but the audio ran on ("looped once, then kept playing").

  /** Push the active loop (or its absence) onto the playing source. */
  const applyLoopToSource = () => {
    if (!sourceNode) return;
    const L = state.activeLoop;
    if (L && L.out > L.in) {
      sourceNode.loopStart = L.in;
      sourceNode.loopEnd = L.out;
      sourceNode.loop = true;
    } else {
      sourceNode.loop = false;
    }
  };

  const startSource = (offset: number, fadeMs = 2) => {
    if (!buffer) return;

    stopSource();

    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.playbackRate.value = pitchToRate(state.pitch);

    sourceGain = ctx.createGain();
    sourceGain.gain.setValueAtTime(0, ctx.currentTime);
    if (fadeMs > 0) {
      sourceGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeMs / 1000);
    } else {
      sourceGain.gain.setValueAtTime(1, ctx.currentTime);
    }

    sourceNode.connect(sourceGain);
    sourceGain.connect(gainNode);

    const at = Math.max(0, Math.min(offset, state.bufferDuration - 0.001));
    applyLoopToSource();
    sourceNode.start(0, at);
    state.startTime = ctx.currentTime;
    state.startOffset = at;

    const src = sourceNode;
    sourceNode.onended = () => {
      if (sourceNode === src && !state.activeLoop) {
        state.isPlaying = false;
        state.currentTime = state.bufferDuration;
        sourceNode = null;
      }
    };
  };

  const getCurrentTime = (): number => {
    if (!state.isPlaying) return state.currentTime;
    const elapsed = (ctx.currentTime - state.startTime) * pitchToRate(state.pitch);
    let t = state.startOffset + elapsed;
    if (state.activeLoop) {
      const { in: li, out: lo } = state.activeLoop;
      const len = lo - li;
      // Mirrors the node: linear until loop-out, then wraps inside the loop.
      if (len > 0 && t >= lo) {
        t = li + ((t - li) % len);
      }
    }
    return Math.min(t, state.bufferDuration);
  };

  const updateTime = () => {
    state.currentTime = getCurrentTime();
    return state.currentTime;
  };

  /**
   * Re-anchor the clock at the current position. Must run before anything that
   * changes how position advances (loop on/off/resize, pitch), or the clock
   * and the audio disagree from then on.
   */
  const rebase = () => {
    if (!state.isPlaying) return;
    const t = getCurrentTime();
    state.currentTime = t;
    state.startOffset = t;
    state.startTime = ctx.currentTime;
  };

  const setLoopCore = (inAt: number, outAt: number, beats?: number) => {
    if (!buffer) return;
    const lo = Math.max(0, inAt);
    const hi = Math.min(outAt, state.bufferDuration);
    if (hi - lo < 0.005) return;
    rebase();
    state.activeLoop = { in: lo, out: hi, beats };
    if (!state.isPlaying) {
      // Paused: park the playhead inside the loop so PLAY starts in it.
      if (state.currentTime < lo || state.currentTime >= hi) {
        state.currentTime = lo;
        state.startOffset = lo;
      }
      return;
    }
    const now = state.currentTime;
    if (now >= hi) {
      // Already past loop-out (resize down / short loop): jump in, keeping
      // phase — the same musical position inside the loop, like Traktor.
      startSource(lo + ((now - lo) % (hi - lo)), 2);
    } else if (now < lo) {
      startSource(lo, 2);
    } else {
      applyLoopToSource();
    }
  };

  /** Grid used for loop placement: the analysed grid, else one built from BPM. */
  const loopGrid = (bpm?: number): BeatGrid => {
    if (state.beatGrid && state.beatGrid.interval > 0) return state.beatGrid;
    const b = bpm ?? state.bpm ?? DEFAULT_BPM;
    return { bpm: b, firstDownbeat: 0, interval: 60 / b };
  };

  return {
    get currentTime() { return updateTime(); },
    get duration() { return state.bufferDuration; },
    get isPlaying() { return state.isPlaying; },
    get bpm() { return state.bpm; },
    set bpm(v) { state.bpm = v; },
    get key() { return state.key; },
    set key(v) { state.key = v; },
    get camelotKey() { return state.camelotKey; },
    set camelotKey(v) { state.camelotKey = v; },
    get peaks() { return state.peaks; },
    set peaks(v) { state.peaks = v; },
    get cues() { return state.cues; },
    set cues(v) { state.cues = v; },
    get activeLoop() { return state.activeLoop; },
    set activeLoop(v) { state.activeLoop = v; },
    get beatGrid() { return state.beatGrid; },
    set beatGrid(v) { state.beatGrid = v; },
    get beats() { return state.beats; },
    set beats(v) { state.beats = v; },
    get coloredPeaks() { return state.coloredPeaks; },
    set coloredPeaks(v) { state.coloredPeaks = v; },

    async computeAnalysis() {
      if (!buffer) return;
      try {
        state.beats = detectBeats(buffer);
        state.coloredPeaks = computeColoredWaveform(buffer);
        state.peaks = new Float32Array(state.coloredPeaks.map(p => p.peak));
        if (state.beats.length > 0) {
          const firstDownbeat = state.beats.find(b => b.type === 'downbeat')?.time ?? state.beats[0].time;
          let interval = 0;
          if (state.beats.length > 1) {
            interval = state.beats[1].time - state.beats[0].time;
          } else {
            interval = 60 / DEFAULT_BPM;
          }
          const bpm = Math.round(60 / interval);
          state.bpm = bpm;
          state.beatGrid = { bpm, firstDownbeat, interval };
        }
      } catch (e) {
        console.error('[DJ] computeAnalysis error:', e);
      }
    },

    getCurrentTime,

    setBeatGrid(bpm: number, firstDownbeat: number) {
      state.beatGrid = {
        bpm,
        firstDownbeat,
        interval: 60 / bpm
      };
      state.bpm = bpm;
    },

    load(buf: AudioBuffer) {
      stopSource();
      buffer = buf;
      state.bufferDuration = buf.duration;
      state.currentTime = 0;
      state.startOffset = 0;
      state.isPlaying = false;
      state.activeLoop = null;
      state.beatGrid = null;
    },
    play() {
      if (!buffer || state.isPlaying) return;
      startSource(state.currentTime);
      state.isPlaying = true;
    },
    pause() {
      if (!state.isPlaying) return;
      updateTime();
      stopSource();
      state.isPlaying = false;
      state.startOffset = state.currentTime;
    },
    stop() {
      stopSource();
      state.isPlaying = false;
      state.currentTime = 0;
      state.startOffset = 0;
    },
    seek(time: number) {
      const clamped = Math.max(0, Math.min(time, state.bufferDuration));
      // Jumping out of an active loop exits it (a hot cue elsewhere must not
      // snap back into the old loop).
      const L = state.activeLoop;
      if (L && (clamped < L.in || clamped >= L.out)) state.activeLoop = null;
      state.currentTime = clamped;
      if (state.isPlaying) {
        startSource(clamped);
      } else {
        state.startOffset = clamped;
      }
    },
    setVolume(v: number) {
      state.volume = v;
      gainNode.gain.value = state.volume * Math.pow(10, state.trim * 9 / 20);
    },
    setTrim(db: number) {
      state.trim = db;
      gainNode.gain.value = state.volume * Math.pow(10, state.trim * 9 / 20);
    },
    setEQ(low: number, mid: number, high: number) {
      const mapDb = (v: number) => (v >= 0 ? v * 6 : v * 24);
      eqLow.gain.value = mapDb(low);
      eqMid.gain.value = mapDb(mid);
      eqHigh.gain.value = mapDb(high);
    },
    setFilter(v: number) {
      if (Math.abs(v - 0.5) < 0.05) {
        // Neutral must also reset the TYPE: a high-pass left at 20 kHz silences
        // the deck after a sweep back to centre.
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 20000;
        filterNode.Q.value = 1;
      } else if (v < 0.5) {
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 200 + v * 2 * 3800;
        filterNode.Q.value = 1 + Math.abs(v - 0.5) * 12;
      } else {
        filterNode.type = 'highpass';
        filterNode.frequency.value = (v - 0.5) * 2 * 8000;
        filterNode.Q.value = 1 + Math.abs(v - 0.5) * 12;
      }
    },

    setLoop(beats: number, bpm?: number) {
      if (!buffer) return;
      const grid = loopGrid(bpm);
      const len = grid.interval * beats;

      let inAt: number;
      if (state.activeLoop) {
        inAt = state.activeLoop.in; // resize from the existing loop-in
      } else {
        // Loop-in snaps BACK to the grid line at or before the playhead (the
        // beat for loops of a beat or more, the loop's own fraction for
        // shorter ones). The playhead is therefore always inside the loop, so
        // it always catches and the region is the one you heard.
        const unit = Math.min(grid.interval, len);
        const now = getCurrentTime();
        const n = Math.floor((now - grid.firstDownbeat) / unit + 1e-6);
        inAt = Math.max(0, grid.firstDownbeat + n * unit);
      }
      setLoopCore(inAt, inAt + len, beats);
    },
    setLoopIn() {
      state.manualLoopIn = quantizeToBeat(getCurrentTime(), state.beatGrid);
    },
    setLoopOut() {
      if (state.manualLoopIn !== null) {
        const outAt = quantizeToBeat(getCurrentTime(), state.beatGrid);
        if (outAt > state.manualLoopIn) {
          setLoopCore(state.manualLoopIn, outAt);
        }
        state.manualLoopIn = null;
      }
    },
    moveLoop(direction: 1 | -1) {
      if (!state.activeLoop || !buffer) return;
      const len = state.activeLoop.out - state.activeLoop.in;
      const shift = len * direction;
      const newIn = state.activeLoop.in + shift;
      const newOut = state.activeLoop.out + shift;
      if (newIn < 0 || newOut > state.bufferDuration) return;
      const pos = getCurrentTime() + shift; // the playhead moves with the loop
      state.activeLoop = { in: newIn, out: newOut, beats: state.activeLoop.beats };
      if (state.isPlaying) startSource(Math.min(Math.max(pos, newIn), newOut - 0.001), 2);
      else { state.currentTime = Math.min(Math.max(pos, newIn), newOut - 0.001); state.startOffset = state.currentTime; }
    },
    doubleLoop() {
      if (!state.activeLoop) return;
      const beats = (state.activeLoop.beats || 4) * 2;
      this.setLoop(beats);
    },
    halveLoop() {
      if (!state.activeLoop) return;
      const beats = Math.max(0.125, (state.activeLoop.beats || 4) / 2);
      this.setLoop(beats);
    },
    clearLoop() {
      // Exit the loop and play on from wherever we are inside it.
      rebase();
      state.activeLoop = null;
      applyLoopToSource();
    },
    setCue(index: number, time: number) {
      if (index >= 0 && index < 8) {
        const t = quantizeToBeat(time, state.beatGrid);
        state.cues[index] = { time: t, color: SAMPLE_COLORS[index] };
      }
    },
    triggerCue(index: number) {
      if (index >= 0 && index < 8) {
        if (state.cues[index]) {
          this.seek(state.cues[index]!.time);
        } else {
          this.setCue(index, getCurrentTime());
        }
      }
    },
    jumpToCue(index: number) {
      this.triggerCue(index);
    },
    clearCue(index: number) {
      if (index >= 0 && index < 8) {
        state.cues[index] = null;
      }
    },
    setPitch(semitones: number) {
      rebase(); // the clock integrates rate — re-anchor before changing it
      state.pitch = semitones;
      if (sourceNode) sourceNode.playbackRate.value = pitchToRate(state.pitch);
    },
    setDelay(time: number, feedback: number, wet: number) {
      delayNode.delayTime.value = time;
      delayFeedback.gain.value = feedback;
      delayWet.gain.value = wet;
    },
    setReverb(wet: number) {
      reverbWet.gain.value = wet;
    },
    getAnalyser() {
      return analyserNode;
    },
    connect(dest: AudioNode) {
      masterGain.connect(dest);
    },
    disconnect() {
      masterGain.disconnect();
    }
  };
}

export async function loadAnalysisForDeck(deck: DeckInstance, trackId: string): Promise<void> {
  if (!trackId) return;
  try {
    const theory = await loadTrackTheory(trackId);
    if (theory) {
      deck.key = theory.key;
      deck.camelotKey = toCamelot(theory.key, theory.scale);
      if (theory.tempo) deck.bpm = theory.tempo;
    }
    const analysis = await getOrComputeAnalysis({ id: trackId, url: '', audioAnalysis: undefined } as any);
    if (analysis) {
      if (!theory && analysis.bpm) deck.bpm = analysis.bpm;
      if (analysis.peaks) deck.peaks = analysis.peaks;
    }
  } catch (e) {
    console.error('[DJ] loadAnalysisForDeck error:', e);
  }
}
