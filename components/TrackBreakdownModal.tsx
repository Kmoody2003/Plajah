/**
 * The Breakdown — multi-stem live score + music theory analysis
 *
 * Each stem shows:
 *   1. Scrolling canvas: real-time FFT frequency data (new)
 *   2. SVG staff: pre-analyzed notation for that stem's role (restored)
 *
 * Full score at the top: original AnimatedStaff (all instruments, role-colored).
 *
 * Triggered globally:
 *   window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', { detail: { track, album } }))
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Music2, Zap, BookOpen, Download, ChevronRight,
  BarChart2, Waves, Hash, Disc, Sparkles, ChevronDown, Activity,
} from 'lucide-react';
import { Track, Album } from '../types';
import { useGlobalPlayer, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { detectBeats, type BeatAnalysis } from '../services/audioBeatDetection';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import html2canvas from 'html2canvas';

// ─── Types ─────────────────────────────────────────────────────────────────────

type NoteRole = 'MELODY' | 'HARMONY' | 'BASS' | 'ACCENT';

interface ScoreNote {
  midi: number;
  role: NoteRole;
  beat: number;
}

export interface TrackTheory {
  key: string;
  scale: string;
  tempo: number;
  chordQuality: string;
  timeSignature: string;
  notes: ScoreNote[];
}

export interface StoredBreakdown {
  theory: TrackTheory;
  isReal: boolean;
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  savedAt: number;
}

const BREAKDOWN_KEY = 'plajah_breakdowns_v1';

export function saveBreakdownResult(data: StoredBreakdown): void {
  try {
    const all = JSON.parse(localStorage.getItem(BREAKDOWN_KEY) || '{}');
    all[data.trackId] = data;
    localStorage.setItem(BREAKDOWN_KEY, JSON.stringify(all));
  } catch {}
}

export function getBreakdownResult(trackId: string): StoredBreakdown | null {
  try {
    const all = JSON.parse(localStorage.getItem(BREAKDOWN_KEY) || '{}');
    return all[trackId] ?? null;
  } catch { return null; }
}

export function getAllBreakdowns(): Record<string, StoredBreakdown> {
  try {
    return JSON.parse(localStorage.getItem(BREAKDOWN_KEY) || '{}');
  } catch { return {}; }
}

// ─── Color system ─────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<NoteRole, string> = {
  MELODY:  '#f97316',
  HARMONY: '#a855f7',
  BASS:    '#10b981',
  ACCENT:  '#ef4444',
};

const ROLE_LABEL: Record<NoteRole, string> = {
  MELODY:  'Melody',
  HARMONY: 'Harmony',
  BASS:    'Bass',
  ACCENT:  'Accent',
};

// ─── Analysis constants ────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const BLUES_SCALE = [0, 3, 5, 6, 7, 10];
const PENTA_MAJOR = [0, 2, 4, 7, 9];

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function genreToScale(genre?: string): { root: number; intervals: number[]; scaleName: string } {
  const g = (genre ?? '').toLowerCase();
  if (g.includes('blues'))                      return { root: 9,  intervals: BLUES_SCALE, scaleName: 'A Blues'        };
  if (g.includes('jazz'))                       return { root: 5,  intervals: MAJOR_SCALE, scaleName: 'F Major'        };
  if (g.includes('hip') || g.includes('rap'))   return { root: 7,  intervals: MINOR_SCALE, scaleName: 'G Minor'        };
  if (g.includes('trap'))                       return { root: 0,  intervals: MINOR_SCALE, scaleName: 'C Minor'        };
  if (g.includes('edm') || g.includes('house')) return { root: 2,  intervals: MINOR_SCALE, scaleName: 'D Minor'        };
  if (g.includes('techno'))                     return { root: 9,  intervals: MINOR_SCALE, scaleName: 'A Minor'        };
  if (g.includes('soul') || g.includes('r&b'))  return { root: 5,  intervals: MAJOR_SCALE, scaleName: 'F Major'        };
  if (g.includes('reggae'))                     return { root: 7,  intervals: MAJOR_SCALE, scaleName: 'G Major'        };
  if (g.includes('folk') || g.includes('country')) return { root: 7, intervals: PENTA_MAJOR, scaleName: 'G Pentatonic' };
  if (g.includes('classical'))                  return { root: 0,  intervals: MAJOR_SCALE, scaleName: 'C Major'        };
  if (g.includes('rock') || g.includes('metal'))return { root: 4,  intervals: MINOR_SCALE, scaleName: 'E Minor'        };
  return { root: 0, intervals: MAJOR_SCALE, scaleName: 'C Major' };
}

function deterministicHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i), h = h >>> 0;
  return h;
}

function buildHashedTheory(track: Track): TrackTheory {
  const { root, intervals, scaleName } = genreToScale(track.genre);
  const tempo = 120;
  const hash = deterministicHash(track.id + track.title);
  const bassPitches = intervals.map(i => 48 + ((root + i) % 12));
  const midPitches  = intervals.map(i => 60 + ((root + i) % 12));
  const highPitches = intervals.map(i => 72 + ((root + i) % 12));
  const notes: ScoreNote[] = [];
  let seed = hash;
  const nextRand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let beat = 0; beat < 20; beat++) {
    const r = nextRand();
    let midi: number; let role: NoteRole;
    if (beat % 4 === 0)           { midi = bassPitches[r % bassPitches.length]; role = 'BASS'; }
    else if (beat % 4 === 2)      { midi = midPitches[r % midPitches.length];   role = 'HARMONY'; }
    else if ((nextRand() % 5) === 0){ midi = highPitches[r % highPitches.length]; role = 'ACCENT'; }
    else                           { midi = midPitches[r % midPitches.length];   role = 'MELODY'; }
    notes.push({ midi, role, beat });
  }
  const cqs = ['Major', 'Minor 7th', 'Dominant 7th', 'Major 7th', 'Minor', 'Suspended 4th'];
  return { key: NOTE_NAMES[root], scale: scaleName, tempo, chordQuality: cqs[hash % cqs.length], timeSignature: '4/4', notes };
}

// ─── Note position table (MIDI → staff Y, viewBox height 130) ─────────────────

const NOTE_Y: Record<number, number> = {
  48: 112, 50: 106, 52: 100, 53: 94,  55: 88,  57: 82,  59: 76,
  60: 70,  62: 64,  64: 58,  65: 52,  67: 46,  69: 40,  71: 34,
  72: 28,  74: 22,  76: 16,
};

function noteY(midi: number): number { return NOTE_Y[midi] ?? 64; }
function isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }

// ─── Real-time audio analysis (Krumhansl-Schmuckler) ──────────────────────────

function detectPitchClass(freqData: Uint8Array, binHz: number): number | null {
  const minBin = Math.max(1, Math.ceil(80 / binHz));
  const maxBin = Math.min(freqData.length - 1, Math.floor(1600 / binHz));
  let maxMag = 0, peakBin = -1;
  for (let i = minBin; i <= maxBin; i++) {
    if (freqData[i] > maxMag) { maxMag = freqData[i]; peakBin = i; }
  }
  if (peakBin === -1 || maxMag < 25) return null;
  const midi = 69 + 12 * Math.log2((peakBin * binHz) / 440);
  return ((Math.round(midi) % 12) + 12) % 12;
}

function detectKeyFromHistogram(hist: number[]): { root: number; isMinor: boolean } {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return { root: 0, isMinor: false };
  const norm = hist.map(v => v / total);
  let best = -Infinity, bestRoot = 0, bestIsMinor = false;
  for (let r = 0; r < 12; r++) {
    const maj = KS_MAJOR.reduce((s, w, i) => s + w * norm[(i + r) % 12], 0);
    const min = KS_MINOR.reduce((s, w, i) => s + w * norm[(i + r) % 12], 0);
    if (maj > best) { best = maj; bestRoot = r; bestIsMinor = false; }
    if (min > best) { best = min; bestRoot = r; bestIsMinor = true; }
  }
  return { root: bestRoot, isMinor: bestIsMinor };
}

function useRealAudioAnalysis(track: Track, fallback: TrackTheory): {
  theory: TrackTheory; isReal: boolean; analyzing: boolean;
} {
  const { analyser: ctxAnalyser, currentTrack } = useGlobalPlayer();
  const { currentTime } = useGlobalPlayerProgress();
  const [realTheory, setRealTheory] = useState<TrackTheory | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(ctxAnalyser);
  useEffect(() => { analyserRef.current = ctxAnalyser; }, [ctxAnalyser]);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  const isCurrentTrack = currentTrack?.id === track.id;

  // Accurate, sample-based tempo/beat grid from the decoded waveform — replaces
  // the synthetic genre/hash BPM and the hardcoded fallback so the beat grid
  // (and therefore note placement + sync) lines up with the real music.
  const beatRef = useRef<BeatAnalysis | null>(null);
  useEffect(() => {
    beatRef.current = null;
    if (!track.url) return;
    const ac = new AbortController();
    detectBeats(track.url, ac.signal)
      .then(a => { if (a.bpm && a.confidence > 0.12) beatRef.current = a; })
      .catch(() => { /* CORS/format/decoding — fall back to live estimate */ });
    return () => ac.abort();
  }, [track.id, track.url]);

  useEffect(() => {
    if (!isCurrentTrack) { setRealTheory(null); setAnalyzing(false); return; }
    const pitchHistogram = new Array(12).fill(0);
    const onsetTimes: number[] = [];
    const beatPitchMap = new Map<number, number[]>();
    let prevRms = 0, sampleCount = 0, startTime: number | null = null, finished = false;
    setRealTheory(null); setAnalyzing(true);

    const intervalId = setInterval(() => {
      if (finished) return;
      const analyser = analyserRef.current;
      if (!analyser) return;
      const { fftSize } = analyser;
      const sampleRate = analyser.context.sampleRate;
      const binHz = sampleRate / fftSize;
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(fftSize);
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      let rmsSum = 0;
      for (let i = 0; i < timeData.length; i++) { const v = (timeData[i] - 128) / 128; rmsSum += v * v; }
      const rms = Math.sqrt(rmsSum / timeData.length);
      if (rms < 0.02) return;
      const t = currentTimeRef.current;
      if (startTime === null) startTime = t;
      if (rms > prevRms * 1.5 && rms > 0.06) onsetTimes.push(t);
      prevRms = prevRms * 0.8 + rms * 0.2;
      const pc = detectPitchClass(freqData, binHz);
      if (pc !== null) {
        pitchHistogram[pc]++;
        // Place pitches on the real beat grid: prefer the sample-accurate
        // analysis (phase-aligned beats), else the measured tempo.
        const accurate = beatRef.current;
        const gridTempo = accurate?.bpm ?? fallback.tempo;
        const phase0 = accurate?.firstBeatSec ?? 0;
        const beatPos = Math.round((t - phase0) * gridTempo / 60) % 20;
        const arr = beatPitchMap.get(((beatPos % 20) + 20) % 20) ?? [];
        arr.push(pc); beatPitchMap.set(((beatPos % 20) + 20) % 20, arr);
      }
      sampleCount++;
      const elapsed = t - (startTime ?? t);
      if (sampleCount >= 30 && elapsed >= 6) {
        const { root, isMinor } = detectKeyFromHistogram(pitchHistogram);
        const keyName = NOTE_NAMES[root];
        const intervals = isMinor ? MINOR_SCALE : MAJOR_SCALE;
        const scaleName = `${keyName} ${isMinor ? 'Minor' : 'Major'}`;
        // Prefer the sample-accurate offline BPM; fall back to the live median
        // only if offline decode failed (CORS/format).
        let tempo = beatRef.current?.bpm ?? fallback.tempo;
        if (!beatRef.current && onsetTimes.length >= 4) {
          const iois = onsetTimes.slice(1).map((t2, i) => t2 - onsetTimes[i]);
          const sorted = [...iois].sort((a, b) => a - b);
          let bpm = Math.round(60 / sorted[Math.floor(sorted.length / 2)]);
          while (bpm < 60) bpm *= 2; while (bpm > 200) bpm /= 2;
          if (bpm > 0) tempo = bpm;
        }
        const bassPitches = intervals.map(i => 48 + ((root + i) % 12));
        const midPitches  = intervals.map(i => 60 + ((root + i) % 12));
        const highPitches = intervals.map(i => 72 + ((root + i) % 12));
        const notes: ScoreNote[] = [];
        for (let beat = 0; beat < 20; beat++) {
          const detected = beatPitchMap.get(beat);
          let midi: number; let role: NoteRole;
          if (detected && detected.length > 0) {
            const pcCount: Record<number, number> = {};
            for (const p of detected) pcCount[p] = (pcCount[p] ?? 0) + 1;
            const domPc = Number(Object.entries(pcCount).sort((a, b) => b[1] - a[1])[0][0]);
            const deg = intervals.indexOf(((domPc - root) + 12) % 12);
            if (beat % 4 === 0)      { midi = deg >= 0 ? bassPitches[deg] : 48 + ((root + domPc) % 12); role = 'BASS'; }
            else if (beat % 4 === 2) { midi = deg >= 0 ? midPitches[deg] : 60 + ((root + domPc) % 12); role = 'HARMONY'; }
            else                     { midi = deg >= 0 ? highPitches[deg % highPitches.length] : 60 + ((root + domPc) % 12); role = 'MELODY'; }
          } else {
            const si = beat % intervals.length;
            if (beat % 4 === 0)      { midi = bassPitches[si % bassPitches.length]; role = 'BASS'; }
            else if (beat % 4 === 2) { midi = midPitches[si % midPitches.length];   role = 'HARMONY'; }
            else                     { midi = midPitches[(si + 2) % midPitches.length]; role = 'MELODY'; }
          }
          while (midi < 48) midi += 12; while (midi > 76) midi -= 12;
          notes.push({ midi, role, beat });
        }
        const topDegs = pitchHistogram.map((c, pc) => ({ pc, c })).sort((a, b) => b.c - a.c).slice(0, 3).map(x => ((x.pc - root + 12) % 12));
        const hasSeventh = topDegs.some(d => d === 10 || d === 11);
        let chordQuality = isMinor ? 'Minor' : 'Major';
        if (hasSeventh && isMinor) chordQuality = 'Minor 7th';
        if (hasSeventh && !isMinor) chordQuality = 'Major 7th';
        if (topDegs.includes(5) && !topDegs.includes(4) && !topDegs.includes(3)) chordQuality = 'Suspended 4th';
        finished = true; clearInterval(intervalId); setAnalyzing(false);
        setRealTheory({ key: keyName, scale: scaleName, tempo, chordQuality, timeSignature: '4/4', notes });
      }
    }, 200);

    return () => { finished = true; clearInterval(intervalId); };
  }, [track.id, isCurrentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  return { theory: realTheory ?? fallback, isReal: realTheory !== null, analyzing: isCurrentTrack && analyzing };
}

// ─── Animated staff (full score — all instruments) ────────────────────────────

interface AnimatedStaffProps { notes: ScoreNote[]; progress: number }

const AnimatedStaff: React.FC<AnimatedStaffProps> = ({ notes, progress }) => {
  const currentBeat = progress * notes.length;
  return (
    <svg width="100%" viewBox="0 0 560 130" className="w-full">
      <rect width="560" height="130" fill="transparent" />
      {[28, 40, 52, 64, 76].map((y, i) => (
        <line key={i} x1="30" y1={y} x2="540" y2={y} stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      ))}
      {[88, 100, 112].map((y, i) => (
        <line key={`lg-${i}`} x1="30" y1={y} x2="540" y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 8" />
      ))}
      <text x="36" y="88" fontSize="72" fill="rgba(255,255,255,0.3)" fontFamily="serif">𝄞</text>
      <text x="90" y="52" fontSize="14" fill="rgba(255,255,255,0.25)" fontFamily="sans-serif" fontWeight="bold">4</text>
      <text x="90" y="70" fontSize="14" fill="rgba(255,255,255,0.25)" fontFamily="sans-serif" fontWeight="bold">4</text>
      {notes.map((note, i) => {
        const x = 120 + i * 22;
        const y = noteY(note.midi);
        const isActive = Math.abs(i - currentBeat) < 0.9;
        const isPast   = i < currentBeat - 0.5;
        const isFuture = i > currentBeat + 0.5;
        const color    = ROLE_COLOR[note.role];
        const opacity  = isFuture ? 0.18 : isPast ? 0.55 : 1;
        return (
          <g key={i}>
            {isActive && (
              <ellipse cx={x} cy={y} rx={12} ry={9} fill={color} opacity={0.22} style={{ filter: 'blur(6px)' }} />
            )}
            {i > 0 && i % 4 === 0 && (
              <line x1={x - 11} y1={28} x2={x - 11} y2={76} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            )}
            <ellipse cx={x} cy={y} rx={7} ry={5}
              fill={isFuture ? 'rgba(255,255,255,0.12)' : color}
              stroke={isActive ? color : 'transparent'} strokeWidth={isActive ? 1.5 : 0}
              opacity={opacity} transform={`rotate(-15,${x},${y})`}
              style={{ transition: 'fill 0.3s, opacity 0.3s' }} />
            {y > 52 ? (
              <line x1={x + 6} y1={y} x2={x + 6} y2={y - 28}
                stroke={isFuture ? 'rgba(255,255,255,0.08)' : color} strokeWidth="1.5" opacity={opacity} style={{ transition: 'stroke 0.3s' }} />
            ) : (
              <line x1={x - 6} y1={y} x2={x - 6} y2={y + 28}
                stroke={isFuture ? 'rgba(255,255,255,0.08)' : color} strokeWidth="1.5" opacity={opacity} style={{ transition: 'stroke 0.3s' }} />
            )}
            {isBlackKey(note.midi) && (
              <text x={x - 14} y={y + 4} fontSize="11" fill={isFuture ? 'rgba(255,255,255,0.12)' : color} fontFamily="serif" opacity={opacity}>♯</text>
            )}
            {isActive && (
              <circle cx={x} cy={y - 16} r={3} fill={color} opacity={0.9} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
            )}
          </g>
        );
      })}
      {progress > 0 && progress < 1 && (
        <line x1={120 + currentBeat * 22} y1={20} x2={120 + currentBeat * 22} y2={120}
          stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 3" opacity={0.65} />
      )}
    </svg>
  );
};

// ─── Stem definitions ─────────────────────────────────────────────────────────

interface StemDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  binStart: number;
  binEnd: number;
  isDrum: boolean;
  canvasHeight: number;
  minMidi: number;
  maxMidi: number;
  threshold: number;
  roles: NoteRole[];      // which score roles belong to this stem
}

// Syllables used for the vocal lyrics layer when no real synced lyrics are available
const VOCAL_SYLLABLES = [
  'la', 'da', 'oh', 'hey', 'yeah', 'mm', 'ah', 'oo', 'na', 'do',
  'be', 'ooh', 'whoa', 'ay', 'sha', 'doo', 'woo', 'lo', 're', 'fa',
];

type SyncedLyric = { time: number; text: string };

/**
 * Distributes lyric words across score notes by matching each note's beat-time
 * to the lyric line active at that moment. Nodes that fall inside a line's
 * time range each receive one word from that line, cycling through the words.
 * Falls back to VOCAL_SYLLABLES when no lyrics are provided.
 */
function buildLyricWordMap(
  notes: ScoreNote[],
  lyrics: SyncedLyric[] | undefined,
  duration: number,
): string[] {
  const total = notes.length;
  if (!lyrics || lyrics.length === 0 || duration <= 0) {
    return notes.map((n, i) => VOCAL_SYLLABLES[(n.midi * 3 + i * 7) % VOCAL_SYLLABLES.length]);
  }

  const wordMap = new Array<string>(total).fill('');

  for (let li = 0; li < lyrics.length; li++) {
    const lineStart = lyrics[li].time;
    const lineEnd   = li + 1 < lyrics.length ? lyrics[li + 1].time : duration;
    const words     = lyrics[li].text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // Collect note indices whose beat-time falls inside this lyric line
    const lineNotes: number[] = [];
    for (let ni = 0; ni < total; ni++) {
      const beatTime = (notes[ni].beat / (total - 1 || 1)) * duration;
      if (beatTime >= lineStart && beatTime < lineEnd) lineNotes.push(ni);
    }
    if (lineNotes.length === 0) continue;

    // Spread words evenly across the notes in this range
    lineNotes.forEach((ni, idx) => {
      const wordIdx = Math.floor((idx / lineNotes.length) * words.length);
      wordMap[ni] = words[Math.min(wordIdx, words.length - 1)];
    });
  }

  // Fill any gaps with VOCAL_SYLLABLES
  return wordMap.map((w, i) => w || VOCAL_SYLLABLES[(notes[i].midi * 3 + i * 7) % VOCAL_SYLLABLES.length]);
}

/** Returns the lyric line whose `time` is <= currentTime (currently active line). */
function getActiveLyric(lyrics: SyncedLyric[] | undefined, currentTime: number): string | null {
  if (!lyrics || lyrics.length === 0) return null;
  let active: string | null = null;
  for (const l of lyrics) {
    if (l.time <= currentTime) active = l.text;
    else break;
  }
  return active;
}

const STEMS: StemDef[] = [
  { id: 'vocals',  label: 'Vocals',        emoji: '🎤', color: '#FF8C00', binStart: 5,   binEnd: 75,  isDrum: false, canvasHeight: 80, minMidi: 48, maxMidi: 84, threshold: 40, roles: ['MELODY']             },
  { id: 'bass',    label: 'Bass',          emoji: '🎸', color: '#6366f1', binStart: 1,   binEnd: 10,  isDrum: false, canvasHeight: 68, minMidi: 28, maxMidi: 55, threshold: 48, roles: ['BASS']               },
  { id: 'drums',   label: 'Drums',         emoji: '🥁', color: '#ef4444', binStart: 0,   binEnd: 0,   isDrum: true,  canvasHeight: 80, minMidi: 0,  maxMidi: 0,  threshold: 55, roles: ['ACCENT']             },
  { id: 'piano',   label: 'Piano / Keys',  emoji: '🎹', color: '#10b981', binStart: 3,   binEnd: 110, isDrum: false, canvasHeight: 80, minMidi: 36, maxMidi: 88, threshold: 38, roles: ['HARMONY', 'MELODY']  },
  { id: 'strings', label: 'Strings',       emoji: '🎻', color: '#818cf8', binStart: 6,   binEnd: 140, isDrum: false, canvasHeight: 68, minMidi: 48, maxMidi: 88, threshold: 32, roles: ['HARMONY']            },
  { id: 'horns',   label: 'Horns / Brass', emoji: '🎺', color: '#f43f5e', binStart: 4,   binEnd: 58,  isDrum: false, canvasHeight: 68, minMidi: 45, maxMidi: 78, threshold: 40, roles: ['HARMONY', 'ACCENT']  },
  { id: 'synth',   label: 'Synth / Lead',  emoji: '🎛️', color: '#ec4899', binStart: 9,   binEnd: 190, isDrum: false, canvasHeight: 68, minMidi: 48, maxMidi: 96, threshold: 35, roles: ['MELODY']             },
];

// ─── Per-stem score sheet (SVG notation for that stem's role) ─────────────────

const StemScoreNotes: React.FC<{
  stem: StemDef;
  notes: ScoreNote[];
  progress: number;
  lyrics?: SyncedLyric[];
  duration?: number;
}> = ({ stem, notes, progress, lyrics, duration = 0 }) => {
  const currentBeat = progress * notes.length;

  if (stem.isDrum) {
    // Percussion staff: 3 labeled lines — kick, snare, hihat
    const drumY = { 1: 50, 2: 30, 3: 12 }; // kick bottom, snare mid, hihat top
    const drumColor = { 1: '#f87171', 2: '#fbbf24', 3: '#c4b5fd' };
    const drumLabel = { 1: 'KICK', 2: 'SNARE', 3: 'HIHAT' };
    return (
      <svg width="100%" viewBox="0 0 560 65" className="w-full">
        <rect width="560" height="65" fill="transparent" />
        {([1, 2, 3] as const).map(t => (
          <line key={t} x1="90" y1={drumY[t]} x2="540" y2={drumY[t]}
            stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        ))}
        {([1, 2, 3] as const).map(t => (
          <text key={t} x="6" y={drumY[t] + 4} fontSize="7" fill={drumColor[t] + '70'} fontFamily="monospace" fontWeight="bold">
            {drumLabel[t]}
          </text>
        ))}
        <text x="90" y="38" fontSize="28" fill="rgba(255,255,255,0.18)" fontFamily="serif">𝄥</text>

        {notes.map((_, i) => {
          const x = 120 + i * 22;
          const isActive = Math.abs(i - currentBeat) < 0.9;
          const isPast   = i < currentBeat - 0.5;
          const type = i % 4 === 0 ? 1 : i % 4 === 2 ? 2 : 3;
          const y = drumY[type as 1|2|3];
          const col = isActive ? drumColor[type as 1|2|3] : 'rgba(255,255,255,' + (isPast ? '0.22' : '0.1') + ')';
          const sz = isActive ? 5 : 4;
          return (
            <g key={i}>
              {i > 0 && i % 4 === 0 && (
                <line x1={x - 11} y1={6} x2={x - 11} y2={58} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              )}
              {isActive && (
                <circle cx={x} cy={y} r={9} fill={stem.color} opacity={0.18} style={{ filter: 'blur(5px)' }} />
              )}
              <line x1={x - sz} y1={y - sz} x2={x + sz} y2={y + sz} stroke={col} strokeWidth={isActive ? 2 : 1.5} />
              <line x1={x + sz} y1={y - sz} x2={x - sz} y2={y + sz} stroke={col} strokeWidth={isActive ? 2 : 1.5} />
            </g>
          );
        })}
        {progress > 0 && progress < 1 && (
          <line x1={120 + currentBeat * 22} y1={4} x2={120 + currentBeat * 22} y2={60}
            stroke={stem.color} strokeWidth="1.5" strokeDasharray="3 2" opacity={0.55} />
        )}
      </svg>
    );
  }

  // Melodic staff — filter notes to this stem's roles
  const stemNotes = notes.filter(n => stem.roles.includes(n.role));
  if (stemNotes.length === 0) return null;

  const isVocals = stem.id === 'vocals';
  // Build word-per-note map: real synced lyrics when available, syllable fallback otherwise
  const syllables = isVocals ? buildLyricWordMap(stemNotes, lyrics, duration) : [];

  // Vocals need extra height to show lyric text row below staff lines
  const viewH = isVocals ? 120 : 100;
  const staffTop = 20;
  const staffLines = [staffTop, staffTop + 12, staffTop + 24, staffTop + 36, staffTop + 48];
  const lyricBaseline = staffLines[4] + 30; // below bottom staff line

  return (
    <svg width="100%" viewBox={`0 0 560 ${viewH}`} className="w-full">
      <rect width="560" height={viewH} fill="transparent" />

      {staffLines.map((y, i) => (
        <line key={i} x1="30" y1={y} x2="540" y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1.2" />
      ))}
      {/* Ledger lines below staff (for bass register notes) */}
      {[staffLines[4] + 12, staffLines[4] + 24].map((y, i) => (
        <line key={`lg-${i}`} x1="30" y1={y} x2="540" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 6" />
      ))}

      {/* Vocal lyric lane separator */}
      {isVocals && (
        <>
          <line x1="30" y1={lyricBaseline - 10} x2="540" y2={lyricBaseline - 10}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 8" />
          <text x="6" y={lyricBaseline + 2} fontSize="6" fill="rgba(255,255,255,0.2)" fontFamily="monospace" fontWeight="bold">LYRICS</text>
        </>
      )}

      <text x="34" y={staffLines[4] + 16} fontSize="56" fill="rgba(255,255,255,0.2)" fontFamily="serif">𝄞</text>

      {stemNotes.map((note, si) => {
        const x = 110 + (note.beat / (notes.length - 1 || 1)) * 420;
        // Map noteY output (16-112 for 130-height coords) into our staff coordinate space
        const rawY = noteY(note.midi);
        const y = staffTop + ((rawY - 16) / 100) * (staffLines[4] - staffTop + 12);
        const isActive = Math.abs(note.beat - currentBeat) < 1.2;
        const isPast   = note.beat < currentBeat - 0.8;
        const opacity  = isPast ? 0.52 : isActive ? 1 : 0.18;
        const syllable = syllables[si];

        return (
          <g key={si}>
            {isActive && (
              <ellipse cx={x} cy={y} rx={11} ry={8} fill={stem.color} opacity={0.2} style={{ filter: 'blur(5px)' }} />
            )}
            <ellipse cx={x} cy={y} rx={6.5} ry={4.8}
              fill={isActive || isPast ? stem.color : 'rgba(255,255,255,0.1)'}
              opacity={opacity} transform={`rotate(-15,${x},${y})`}
              style={{ transition: 'fill 0.3s, opacity 0.3s' }} />

            {/* Note stem line */}
            {y > staffTop + 24 ? (
              <line x1={x + 6} y1={y} x2={x + 6} y2={y - 26}
                stroke={isActive || isPast ? stem.color : 'rgba(255,255,255,0.08)'} strokeWidth="1.5" opacity={opacity} />
            ) : (
              <line x1={x - 6} y1={y} x2={x - 6} y2={y + 26}
                stroke={isActive || isPast ? stem.color : 'rgba(255,255,255,0.08)'} strokeWidth="1.5" opacity={opacity} />
            )}

            {isBlackKey(note.midi) && (
              <text x={x - 13} y={y + 4} fontSize="10" fill={isActive || isPast ? stem.color : 'rgba(255,255,255,0.1)'}
                fontFamily="serif" opacity={opacity}>♯</text>
            )}

            {isActive && (
              <circle cx={x} cy={y - 14} r={2.5} fill={stem.color} opacity={0.9}
                style={{ filter: `drop-shadow(0 0 4px ${stem.color})` }} />
            )}

            {/* Lyric syllable — below staff, connected to note with a dashed vertical line */}
            {isVocals && syllable && (
              <>
                {/* Connector: dashed line from note down to lyric baseline */}
                <line
                  x1={x} y1={Math.min(y + 6, staffLines[4] + 2)}
                  x2={x} y2={lyricBaseline - 8}
                  stroke={isActive ? stem.color : 'rgba(255,255,255,0.07)'}
                  strokeWidth="1" strokeDasharray="2 3"
                  opacity={isActive ? 0.5 : 0.3}
                />
                {/* Active lyric glow */}
                {isActive && (
                  <text x={x} y={lyricBaseline} textAnchor="middle" fontSize="9"
                    fontFamily="monospace" fontWeight="bold"
                    fill={stem.color} opacity={0.35} style={{ filter: 'blur(4px)' }}>
                    {syllable}
                  </text>
                )}
                {/* Lyric text */}
                <text
                  x={x} y={lyricBaseline} textAnchor="middle"
                  fontSize={isActive ? '9' : '8'}
                  fontFamily="monospace" fontWeight={isActive ? 'bold' : 'normal'}
                  fill={isActive ? stem.color : isPast ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}
                  opacity={isActive ? 1 : isPast ? 0.7 : 0.4}
                  style={{ transition: 'fill 0.3s, opacity 0.3s' }}
                >
                  {syllable}
                </text>
              </>
            )}
          </g>
        );
      })}

      {progress > 0 && progress < 1 && (
        <line
          x1={110 + progress * 420} y1={12} x2={110 + progress * 420} y2={isVocals ? viewH - 8 : 88}
          stroke={stem.color} strokeWidth="1.5" strokeDasharray="4 3" opacity={0.55}
        />
      )}
    </svg>
  );
};

// ─── Multi-stem FFT data hook ──────────────────────────────────────────────────

function useMultiStemData() {
  const { analyser } = useGlobalPlayer();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Uint8Array | null>(null);
  const lastReadRef = useRef(0);

  useEffect(() => {
    analyserRef.current = analyser ?? null;
    if (analyser) bufRef.current = new Uint8Array(analyser.frequencyBinCount);
  }, [analyser]);

  const getFFT = useCallback((): Uint8Array | null => {
    const a = analyserRef.current;
    if (!a || !bufRef.current) return null;
    const now = performance.now();
    if (now - lastReadRef.current > 12) {
      a.getByteFrequencyData(bufRef.current);
      lastReadRef.current = now;
    }
    return bufRef.current;
  }, []);

  const getMetadata = useCallback(() => ({
    sampleRate: analyserRef.current?.context.sampleRate ?? 44100,
    fftSize: analyserRef.current?.fftSize ?? 2048,
  }), []);

  return { getFFT, getMetadata };
}

// ─── Stem canvas (scrolling real-time FFT) ────────────────────────────────────

const STEM_HISTORY = 160;

const StemCanvas: React.FC<{
  stem: StemDef;
  getFFT: () => Uint8Array | null;
  getMetadata: () => { sampleRate: number; fftSize: number };
  lyrics?: SyncedLyric[];
  currentTime?: number;
}> = ({ stem, getFFT, getMetadata, lyrics, currentTime = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const histRef = useRef<Array<{ pitch: number; energy: number }[]>>([]);
  // Refs so the RAF loop always has the latest values without restarts
  const lyricsRef = useRef(lyrics);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { lyricsRef.current = lyrics; }, [lyrics]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) canvas.width = Math.round(e.contentRect.width * dpr);
    });
    const parent = canvas.parentElement ?? document.body;
    canvas.width = parent.clientWidth * dpr;
    ro.observe(parent);

    const { sampleRate, fftSize } = getMetadata();
    const binHz = sampleRate / fftSize;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const fft = getFFT();
      const frame: { pitch: number; energy: number }[] = [];

      if (fft) {
        if (stem.isDrum) {
          let kickSum = 0;
          for (let i = 1; i < Math.min(5, fft.length); i++) kickSum += fft[i];
          const kickE = kickSum / (4 * 255);
          if (kickE > 0.28) frame.push({ pitch: 1, energy: Math.min(kickE * 1.8, 1) });

          let snareSum = 0;
          for (let i = 5; i < Math.min(23, fft.length); i++) snareSum += fft[i];
          const snareE = snareSum / (18 * 255);
          if (snareE > 0.22) frame.push({ pitch: 2, energy: Math.min(snareE * 2, 1) });

          let hihatMax = 0;
          for (let i = 130; i < Math.min(230, fft.length); i++) hihatMax = Math.max(hihatMax, fft[i]);
          const hihatE = hihatMax / 255;
          if (hihatE > 0.18) frame.push({ pitch: 3, energy: Math.min(hihatE * 2.2, 1) });
        } else {
          const sliceEnd = Math.min(stem.binEnd, fft.length);
          for (let i = stem.binStart + 1; i < sliceEnd - 1; i++) {
            if (fft[i] > stem.threshold && fft[i] >= fft[i - 1] && fft[i] >= fft[i + 1]) {
              const freq = i * binHz;
              if (freq < 20) continue;
              const midi = Math.round(12 * Math.log2(freq / 440) + 69);
              if (midi >= stem.minMidi && midi <= stem.maxMidi) {
                frame.push({ pitch: midi, energy: fft[i] / 255 });
              }
            }
          }
          frame.sort((a, b) => b.energy - a.energy);
          if (frame.length > 4) frame.length = 4;
        }
      }

      histRef.current.push(frame);
      if (histRef.current.length > STEM_HISTORY) histRef.current.shift();

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, W, H);

      const colW = W / STEM_HISTORY;

      if (stem.isDrum) {
        const laneY = { 1: H * 0.82, 2: H * 0.5, 3: H * 0.18 };
        const laneColor = { 1: '#f87171', 2: '#fbbf24', 3: '#c4b5fd' };
        const laneLabel = { 1: 'KICK', 2: 'SNARE', 3: 'HI-HAT' };

        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 8]);
        ([1, 2, 3] as const).forEach(t => {
          ctx.beginPath(); ctx.moveTo(0, laneY[t]); ctx.lineTo(W, laneY[t]); ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.font = `bold ${Math.round(8 * dpr)}px monospace`;
        ([1, 2, 3] as const).forEach(t => {
          ctx.fillStyle = laneColor[t] + '55';
          ctx.fillText(laneLabel[t], 6 * dpr, laneY[t] - 6 * dpr);
        });
        histRef.current.forEach((hFrame, fi) => {
          const x = fi * colW;
          const age = fi / STEM_HISTORY;
          hFrame.forEach(({ pitch, energy }) => {
            const t = pitch as 1 | 2 | 3;
            const y = laneY[t];
            const col = laneColor[t];
            const alpha = Math.pow(age, 0.7) * Math.min(energy * 1.5, 1);
            const sz = Math.max(3 * dpr, colW * 2 * energy);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = col;
            ctx.translate(x + colW * 0.5, y);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-sz * 0.35, -dpr * 1.2, sz * 0.7, dpr * 2.4);
            ctx.fillRect(-dpr * 1.2, -sz * 0.35, dpr * 2.4, sz * 0.7);
            ctx.restore();
          });
        });
      } else {
        const staffTop  = H * 0.1;
        const staffSpan = H * 0.75;
        const lineSpacing = staffSpan / 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = dpr;
        for (let l = 0; l < 5; l++) {
          const y = staffTop + l * lineSpacing;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = dpr;
        for (let m = 32; m < STEM_HISTORY; m += 32) {
          const x = m * colW;
          ctx.beginPath(); ctx.moveTo(x, staffTop); ctx.lineTo(x, staffTop + staffSpan); ctx.stroke();
        }
        const midiRange = stem.maxMidi - stem.minMidi || 1;
        histRef.current.forEach((hFrame, fi) => {
          const x = fi * colW;
          const age = fi / STEM_HISTORY;
          hFrame.forEach(({ pitch, energy }) => {
            const normY = 1 - (pitch - stem.minMidi) / midiRange;
            const y = staffTop + normY * staffSpan;
            const alpha = Math.pow(age, 0.5) * Math.min(energy * 1.4, 1);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = stem.color;
            ctx.translate(x + colW * 0.5, y);
            ctx.rotate(-0.26);
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(dpr * 1.5, colW * 0.65), Math.max(dpr * 1.2, H * 0.022), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            if (age > 0.6 && energy > 0.4) {
              const midStaff = staffTop + staffSpan * 0.5;
              ctx.save();
              ctx.globalAlpha = alpha * 0.5;
              ctx.strokeStyle = stem.color;
              ctx.lineWidth = dpr;
              ctx.beginPath();
              if (y > midStaff) {
                ctx.moveTo(x + colW * 0.5 + dpr * 3, y);
                ctx.lineTo(x + colW * 0.5 + dpr * 3, y - H * 0.18);
              } else {
                ctx.moveTo(x + colW * 0.5 - dpr * 3, y);
                ctx.lineTo(x + colW * 0.5 - dpr * 3, y + H * 0.18);
              }
              ctx.stroke();
              ctx.restore();
            }
          });
        });
      }

      const phX = (STEM_HISTORY - 1) * colW;
      ctx.strokeStyle = '#FF8C00';
      ctx.lineWidth = dpr * 1.5;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([dpr * 4, dpr * 3]);
      ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // For vocals stem: show current lyric line (or syllable fallback) at detected pitch
      if (stem.id === 'vocals') {
        const lastFrame = histRef.current[histRef.current.length - 1];
        if (lastFrame && lastFrame.length > 0) {
          const topNote = lastFrame[0];
          const midiRange = stem.maxMidi - stem.minMidi || 1;
          const normY = 1 - (topNote.pitch - stem.minMidi) / midiRange;
          const staffTop = H * 0.1;
          const staffSpan = H * 0.75;
          const noteCanvasY = staffTop + normY * staffSpan;
          const textAlpha = Math.min(topNote.energy * 1.8, 0.95);

          // Resolve what text to show: real lyric line > syllable fallback
          const activeLine = getActiveLyric(lyricsRef.current, currentTimeRef.current);
          const displayText = activeLine
            ? (activeLine.length > 28 ? activeLine.slice(0, 26) + '…' : activeLine)
            : VOCAL_SYLLABLES[Math.round(topNote.pitch * 3) % VOCAL_SYLLABLES.length];

          // Connector dot at pitch position on playhead
          ctx.beginPath();
          ctx.arc(phX, noteCanvasY, dpr * 3, 0, Math.PI * 2);
          ctx.fillStyle = stem.color;
          ctx.globalAlpha = textAlpha;
          ctx.fill();
          ctx.globalAlpha = 1;

          // Lyric text below the pitch dot
          const fontSize = activeLine ? Math.round(10 * dpr) : Math.round(11 * dpr);
          ctx.font = `bold ${fontSize}px ${activeLine ? 'sans-serif' : 'monospace'}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = stem.color;
          ctx.globalAlpha = textAlpha * 0.9;
          ctx.fillText(displayText, phX, Math.min(noteCanvasY + 18 * dpr, H - 4 * dpr));
          ctx.globalAlpha = 1;
          ctx.textAlign = 'left';
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [stem, getFFT, getMetadata]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      height={stem.canvasHeight * (window.devicePixelRatio || 1)}
      className="w-full block"
      style={{ height: `${stem.canvasHeight}px` }}
    />
  );
};

// ─── Arrangement timeline ──────────────────────────────────────────────────────

const ARRANGEMENT_SECTIONS = [
  { label: 'INTRO',   start: 0,    end: 0.08, color: '#6366f1' },
  { label: 'VERSE',   start: 0.08, end: 0.30, color: '#3b82f6' },
  { label: 'CHORUS',  start: 0.30, end: 0.48, color: '#FF8C00' },
  { label: 'VERSE 2', start: 0.48, end: 0.65, color: '#3b82f6' },
  { label: 'CHORUS',  start: 0.65, end: 0.82, color: '#FF8C00' },
  { label: 'BRIDGE',  start: 0.82, end: 0.92, color: '#a855f7' },
  { label: 'OUTRO',   start: 0.92, end: 1.0,  color: '#6366f1' },
];

const ArrangementTimeline: React.FC<{
  progress: number; currentTime: number; duration: number;
}> = ({ progress, currentTime, duration }) => {
  const currentSection = ARRANGEMENT_SECTIONS.find(s => progress >= s.start && progress < s.end);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Activity size={9} className="text-white/25" />
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Arrangement</p>
        {currentSection && (
          <span className="text-[8px] font-black uppercase tracking-wider ml-1" style={{ color: currentSection.color }}>
            › {currentSection.label}
          </span>
        )}
      </div>
      <div className="relative h-8 bg-white/[0.025] rounded-xl overflow-hidden border border-white/[0.05]">
        {ARRANGEMENT_SECTIONS.map((sec, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex items-center justify-center"
            style={{
              left: `${sec.start * 100}%`,
              width: `${(sec.end - sec.start) * 100}%`,
              background: sec === currentSection ? `${sec.color}20` : 'transparent',
              borderRight: i < ARRANGEMENT_SECTIONS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            <span
              className="text-[6px] font-black uppercase tracking-wider truncate px-0.5 select-none"
              style={{ color: sec === currentSection ? sec.color : 'rgba(255,255,255,0.15)' }}
            >
              {sec.label}
            </span>
          </div>
        ))}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${Math.min(progress * 100, 99.5)}%`,
            background: 'linear-gradient(to bottom, transparent, #FF8C00, transparent)',
            transition: 'left 0.1s linear',
          }}
        />
      </div>
      <div className="flex justify-between mt-1 px-0.5">
        <span className="text-[7px] font-mono text-white/15">
          {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
        </span>
        <span className="text-[7px] font-mono text-white/15">
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
};

// ─── Aria factoids ────────────────────────────────────────────────────────────

interface AriaFactoid { id: string; timePercent: number; title: string; body: string; icon: string }

function generateAriaFactoids(theory: TrackTheory): AriaFactoid[] {
  const isMinor = theory.scale.toLowerCase().includes('minor') || theory.scale.includes('Blues');
  const { key, scale, tempo, chordQuality } = theory;
  const moodDesc = theory.scale.includes('Blues')
    ? 'soulful and expressive — built on blue notes that bend between major and minor'
    : isMinor
    ? 'introspective and emotionally rich — minor keys carry tension and yearning'
    : 'bright and uplifting — major tonality projects confidence and openness';
  const tempoLabel = tempo < 70 ? 'a slow ballad — space between beats gives the arrangement room to breathe'
    : tempo < 100 ? 'a laid-back groove — the pulse leaves space for feel and nuance'
    : tempo < 128 ? 'a mid-tempo feel — energetic enough to drive forward, relaxed enough to groove'
    : tempo < 150 ? 'high-energy dance territory — the tempo sustains an elevated emotional state'
    : 'a fast, high-octane pace — intensity is a compositional choice';
  const chordColor: Record<string, string> = {
    'Major': 'stable, resolved, and grounded', 'Minor': 'tense and yearning, pointing toward resolution',
    'Minor 7th': 'smooth with jazz-soul warmth — the added seventh softens the minor',
    'Major 7th': 'dreamy and lush — a favorite in R&B and neo-soul production',
    'Dominant 7th': 'bluesy with built-in forward motion — wants to resolve to the IV or I',
    'Suspended 4th': 'ambiguous and floating — avoids both major and minor, creating tension',
  };
  const root = NOTE_NAMES.indexOf(key);
  const iv = NOTE_NAMES[(root + 5) % 12];
  const v  = NOTE_NAMES[(root + 7) % 12];
  const vi = NOTE_NAMES[(root + 9) % 12];
  const flat7 = NOTE_NAMES[(root + 10) % 12];
  let progression = isMinor ? `${key}m → ${flat7} → ${iv}m → ${v}` : `${key} → ${v} → ${vi}m → ${iv}`;
  if (chordQuality.includes('7')) {
    progression = isMinor ? `${key}m7 → ${iv}m7 → ${v}7 → ${key}m7` : `${key}maj7 → ${v}7 → ${vi}m7 → ${iv}maj7`;
  }
  return [
    { id: 'key',         timePercent: 0.07, icon: '🎵', title: `Key: ${scale}`,
      body: `This track is ${moodDesc}. Every melodic phrase and chord voicing is built from this tonal center.` },
    { id: 'tempo',       timePercent: 0.22, icon: '🥁', title: `${tempo} BPM — ${tempo < 70 ? 'Ballad' : tempo < 100 ? 'Groove' : tempo < 128 ? 'Mid-Tempo' : 'Uptempo'}`,
      body: `At ${tempo} BPM, this is ${tempoLabel}. Tempo is a compositional element — it shapes emotion as much as melody does.` },
    { id: 'chord',       timePercent: 0.40, icon: '🎹', title: `Harmonic Color: ${chordQuality}`,
      body: `${chordQuality} chords define the harmonic texture here — ${chordColor[chordQuality] ?? 'complex and layered'}. Listen for how chord changes signal structural moments.` },
    { id: 'progression', timePercent: 0.60, icon: '🎼', title: 'Chord Progression',
      body: `The underlying harmonic motion follows: ${progression}. This loop (or variation of it) forms the backbone that repeats across sections.` },
    { id: 'arrangement', timePercent: 0.80, icon: '🏗️', title: 'Track Architecture',
      body: `As the track nears its final section, notice how the arrangement has built and released energy — layers entering and exiting to shape the arc. This structural intelligence transforms a collection of notes into a composition.` },
  ];
}

const AriaFactoidPanel: React.FC<{ factoids: AriaFactoid[]; progress: number }> = ({ factoids, progress }) => {
  const visible = factoids.filter(f => f.timePercent <= progress);
  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3">
        <Sparkles size={13} className="text-white/20 shrink-0" />
        <p className="text-[10px] text-white/25 italic leading-relaxed">Aria's music analysis notes will appear as the track plays…</p>
      </div>
    );
  }
  const latest = visible[visible.length - 1];
  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">
        <motion.div key={latest.id} initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.35 }}
          className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-base shrink-0 mt-0.5 leading-none">{latest.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[7px] font-black uppercase tracking-[0.2em] text-orange-400/70 mb-1.5">{latest.title}</p>
              <p className="text-[11px] text-white/65 leading-relaxed">{latest.body}</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      {visible.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {visible.slice(0, -1).map(f => (
            <div key={f.id} className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.05] rounded-lg px-2 py-1">
              <span className="text-[9px]">{f.icon}</span>
              <span className="text-[7px] text-white/25 font-black uppercase tracking-wider">{f.title.split(':')[0]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Theory helpers ────────────────────────────────────────────────────────────

function detectMode(theory: TrackTheory): string {
  const s = theory.scale;
  if (s.includes('Blues')) return 'Blues';
  if (s.includes('Pentatonic') && !s.includes('Minor')) return 'Pentatonic Major';
  if (s.includes('Pentatonic')) return 'Pentatonic Minor';
  if (s.includes('Minor')) return 'Aeolian';
  return 'Ionian';
}

function circleOfFifthsPos(key: string): string {
  const pos: Record<string, string> = {
    'C': '0♯/♭','G': '1♯','D': '2♯','A': '3♯','E': '4♯','B': '5♯',
    'F#': '6♯','F': '1♭','A#': '2♭','D#': '3♭','G#': '4♭','C#': '5♭',
  };
  return pos[key] ?? '—';
}

// ─── Theory card ──────────────────────────────────────────────────────────────

const TheoryCard: React.FC<{
  label: string; value: string; sub?: string; icon: React.ReactNode; delay: number; accent?: string;
}> = ({ label, value, sub, icon, delay, accent = '#FF8C00' }) => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: `${accent}15`, color: accent }}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[7px] font-black uppercase tracking-[0.2em] text-white/25 leading-none">{label}</p>
      <p className="text-[12px] font-black text-white mt-0.5 truncate leading-tight">{value}</p>
      {sub && <p className="text-[8px] text-white/30 mt-0.5 truncate">{sub}</p>}
    </div>
  </motion.div>
);

// ─── Main modal ───────────────────────────────────────────────────────────────

export interface TrackBreakdownModalProps {
  track: Track;
  album: Album | null;
  onClose: () => void;
  onOpenTheoryStudio: () => void;
}

const TrackBreakdownModal: React.FC<TrackBreakdownModalProps> = ({
  track, album, onClose, onOpenTheoryStudio,
}) => {
  const { currentTime, duration } = useGlobalPlayerProgress();
  const hashTheory = useMemo(() => buildHashedTheory(track), [track.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { theory, isReal, analyzing } = useRealAudioAnalysis(track, hashTheory);
  const progress = duration > 0 ? currentTime / duration : 0;

  const factoids = useMemo(() => generateAriaFactoids(theory), [theory.key, theory.scale, theory.tempo, theory.chordQuality]); // eslint-disable-line react-hooks/exhaustive-deps
  const { getFFT, getMetadata } = useMultiStemData();

  // Which stems are expanded (show both canvas + score)
  const [expandedStems, setExpandedStems] = useState<Set<string>>(
    () => new Set(['vocals', 'drums', 'bass', 'piano'])
  );
  const toggleStem = (id: string) =>
    setExpandedStems(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const staffRef = useRef<HTMLDivElement>(null);
  const [exportingLorea, setExportingLorea] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const cover = track.images?.[0] || track.albumCover || album?.coverImage || '';

  useEffect(() => {
    saveBreakdownResult({ theory: hashTheory, isReal: false, trackId: track.id, trackTitle: track.title, trackArtist: track.artist, savedAt: Date.now() });
  }, [track.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isReal) saveBreakdownResult({ theory, isReal: true, trackId: track.id, trackTitle: track.title, trackArtist: track.artist, savedAt: Date.now() });
  }, [isReal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportLorea = useCallback(async () => {
    if (exportingLorea || exportDone) return;
    setExportingLorea(true);
    try {
      if (staffRef.current) {
        const canvas = await html2canvas(staffRef.current, { backgroundColor: '#080808', scale: 2 });
        canvas.toBlob(async blob => {
          if (!blob) return;
          window.dispatchEvent(new CustomEvent('LOREA_SAVE_SCORE', {
            detail: { title: `${track.title} — Score`, artist: track.artist, imageBlob: blob, theory },
          }));
          setExportDone(true); setExportingLorea(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${track.title.replace(/[^a-z0-9]/gi, '_')}_score.png`; a.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      }
    } catch { setExportingLorea(false); }
  }, [exportingLorea, exportDone, track, theory]);

  const mode = detectMode(theory);
  const cof  = circleOfFifthsPos(theory.key);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9998] bg-black/92 backdrop-blur-xl flex flex-col overflow-hidden"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Header */}
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}
          className="flex items-center gap-4 px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          {cover && (
            <img src={cover} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Waves size={10} className="text-orange-400 shrink-0" />
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-orange-400/70">The Breakdown</p>
              {analyzing ? (
                <span className="text-[7px] font-bold text-orange-300/70 animate-pulse ml-1">Analyzing live…</span>
              ) : isReal ? (
                <span className="flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 4px #34d399' }} />
                  <span className="text-[7px] font-bold text-emerald-400/80">Live Analysis</span>
                </span>
              ) : (
                <span className="text-[7px] text-white/20 ml-1">Genre estimate</span>
              )}
            </div>
            <p className="text-sm font-black text-white truncate">{track.title}</p>
            <p className="text-[10px] text-white/40 truncate">{track.artist}</p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-1.5">
              <span className="text-xs font-black text-orange-400">{theory.key}</span>
              <span className="text-[9px] text-white/30">·</span>
              <span className="text-[10px] font-black text-white/60">{theory.tempo} BPM</span>
              <span className="text-[9px] text-white/30">·</span>
              <span className="text-[10px] font-black text-white/40">{theory.timeSignature}</span>
            </div>
            <span className="text-[8px] text-white/20 font-mono">{theory.chordQuality}</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/12 flex items-center justify-center transition-colors shrink-0">
            <X size={14} className="text-white/50" />
          </button>
        </motion.div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">

          {/* Arrangement timeline */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl px-4 pt-4 pb-3">
            <ArrangementTimeline progress={progress} currentTime={currentTime} duration={duration} />
          </motion.div>

          {/* ── Full Score (original AnimatedStaff, all instruments) ── */}
          <motion.div ref={staffRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="bg-[#0d0d0d] border border-white/[0.06] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Full Score</p>
                  {analyzing ? (
                    <span className="text-[7px] font-bold text-orange-400/80 animate-pulse">Analyzing…</span>
                  ) : isReal ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 4px #34d399' }} />
                      <span className="text-[7px] font-bold text-emerald-400/80">Live Analysis</span>
                    </span>
                  ) : (
                    <span className="text-[7px] font-bold text-white/20">Genre estimate</span>
                  )}
                </div>
                <p className="text-xs font-black text-white mt-0.5">{theory.scale} · {theory.timeSignature}</p>
              </div>
              <div className="flex items-center gap-3">
                {(Object.entries(ROLE_COLOR) as [NoteRole, string][]).map(([role, color]) => (
                  <div key={role} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <p className="text-[7px] font-black uppercase tracking-wider text-white/30">{ROLE_LABEL[role]}</p>
                  </div>
                ))}
              </div>
            </div>
            <AnimatedStaff notes={theory.notes} progress={progress} />
            <div className="mt-3 h-0.5 bg-white/8 rounded-full overflow-hidden">
              <motion.div className="h-full bg-orange-500" style={{ width: `${progress * 100}%` }} transition={{ type: 'tween', duration: 0.1 }} />
            </div>
            <p className="text-[8px] text-white/20 text-center mt-1 font-mono">
              {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
              {' / '}
              {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
            </p>
          </motion.div>

          {/* ── Per-stem score + canvas lanes ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Stem Breakdown</p>
              <div className="flex-1 h-px bg-white/[0.05]" />
              <p className="text-[7px] text-white/20 font-mono">real-time FFT · per-stem score</p>
            </div>

            <div className="space-y-2">
              {STEMS.map((stem, si) => (
                <motion.div
                  key={stem.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + si * 0.04 }}
                  className="bg-[#080808] border border-white/[0.05] rounded-2xl overflow-hidden"
                  style={{ borderLeft: `2px solid ${stem.color}35` }}
                >
                  {/* Stem header */}
                  <button
                    onClick={() => toggleStem(stem.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <span className="text-sm shrink-0 leading-none">{stem.emoji}</span>
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] leading-none" style={{ color: stem.color }}>
                      {stem.label}
                    </p>
                    <span className="text-[7px] text-white/20 ml-1">
                      {stem.isDrum ? 'kick · snare · hi-hat' : stem.roles.map(r => ROLE_LABEL[r]).join(' · ').toLowerCase()}
                    </span>
                    <div className="flex-1" />
                    <ChevronDown size={10} className="text-white/20 transition-transform duration-200"
                      style={{ transform: expandedStems.has(stem.id) ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>

                  {/* Expanded: canvas + score */}
                  {expandedStems.has(stem.id) && (
                    <div>
                      {/* Real-time FFT canvas */}
                      <div className="border-t border-white/[0.04]">
                        <div className="px-3 pt-2 pb-0">
                          <p className="text-[7px] font-black uppercase tracking-[0.15em] text-white/20">Live FFT</p>
                        </div>
                        <StemCanvas
                          stem={stem}
                          getFFT={getFFT}
                          getMetadata={getMetadata}
                          lyrics={track.timeCodedLyrics}
                          currentTime={currentTime}
                        />
                      </div>

                      {/* Per-stem score sheet */}
                      <div className="border-t border-white/[0.04] px-3 pt-2 pb-2">
                        <p className="text-[7px] font-black uppercase tracking-[0.15em] text-white/20 mb-1.5">Score</p>
                        <StemScoreNotes
                          stem={stem}
                          notes={theory.notes}
                          progress={progress}
                          lyrics={track.timeCodedLyrics}
                          duration={duration}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Aria factoids */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Sparkles size={9} className="text-white/25" />
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Aria · Music Analysis</p>
            </div>
            <AriaFactoidPanel factoids={factoids} progress={progress} />
          </motion.div>

          {/* Theory cards */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-3 px-1">Theory Analysis</p>
            <div className="grid grid-cols-2 gap-2.5">
              <TheoryCard label="Key"           value={theory.key}             icon={<Hash size={13} />}      delay={0.46} />
              <TheoryCard label="Scale"         value={theory.scale}           icon={<Music2 size={13} />}    delay={0.48} />
              <TheoryCard label="Mode"          value={mode}                   icon={<Waves size={13} />}     delay={0.50} accent="#a855f7" />
              <TheoryCard label="Tempo"         value={`${theory.tempo} BPM`}  icon={<Zap size={13} />}       delay={0.52} />
              <TheoryCard label="Chord Type"    value={theory.chordQuality}    icon={<BarChart2 size={13} />} delay={0.54} accent="#10b981" />
              <TheoryCard label="Circle of 5ths" value={cof}                   icon={<Disc size={13} />}      delay={0.56} accent="#6366f1"
                sub={`${theory.key} ${detectMode(theory).includes('Minor') || detectMode(theory).includes('Blues') ? 'Minor' : 'Major'}`} />
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="space-y-2.5 pb-4">
            <button onClick={() => { onClose(); onOpenTheoryStudio(); }}
              className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-orange-500/25 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/12 flex items-center justify-center">
                  <BookOpen size={14} className="text-purple-400" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-white">Study in Theory Studio</p>
                  <p className="text-[9px] text-white/30 mt-0.5">Lessons, ear training & score reading</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </button>

            <button onClick={handleExportLorea} disabled={exportingLorea}
              className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-emerald-500/25 transition-all group disabled:opacity-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 flex items-center justify-center">
                  <Disc size={14} className={exportDone ? 'text-emerald-400' : 'text-emerald-400/60'} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-white">
                    {exportDone ? 'Saved to Lorea ✓' : exportingLorea ? 'Exporting…' : 'Export to Lorea'}
                  </p>
                  <p className="text-[9px] text-white/30 mt-0.5">Save score snapshot to your Plajah library</p>
                </div>
              </div>
              {!exportDone && <Download size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TrackBreakdownModal;

// ─── Global controller ────────────────────────────────────────────────────────

interface BreakdownEvent { track: Track; album: Album | null }

export const TrackBreakdownController: React.FC<{ onOpenTheoryStudio: () => void }> = ({ onOpenTheoryStudio }) => {
  const [active, setActive] = useState<BreakdownEvent | null>(null);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { track, album } = (e as CustomEvent<BreakdownEvent>).detail;
      if (!track) return;

      // Open immediately with whatever track data we have
      setActive({ track, album });

      // Then fetch the latest track data from Firestore to get synced lyrics
      // generated in the lyrics/caption panel after the track was loaded into the player
      const albumId = track.albumId || album?.id;
      if (!albumId) return;

      try {
        const snap = await getDoc(doc(db, 'albums', albumId));
        if (!snap.exists()) return;
        const freshTracks: Track[] = snap.data().tracks ?? [];
        const freshTrack = freshTracks.find(t => t.id === track.id);
        if (freshTrack?.timeCodedLyrics && freshTrack.timeCodedLyrics.length > 0) {
          // Merge the fresh synced lyrics into the active event
          setActive(prev =>
            prev ? { ...prev, track: { ...prev.track, timeCodedLyrics: freshTrack.timeCodedLyrics } } : prev
          );
        }
      } catch {
        // Non-fatal — modal already open with whatever lyrics were in the player state
      }
    };
    window.addEventListener('OPEN_BREAKDOWN', handler);
    return () => window.removeEventListener('OPEN_BREAKDOWN', handler);
  }, []);

  if (!active) return null;
  return (
    <TrackBreakdownModal
      track={active.track}
      album={active.album}
      onClose={() => setActive(null)}
      onOpenTheoryStudio={onOpenTheoryStudio}
    />
  );
};
