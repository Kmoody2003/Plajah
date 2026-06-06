/**
 * The Breakdown — per-track music theory analysis + animated sheet music
 *
 * Animated staff: notes render black, then light up to instrument-role colors
 * in sync with GlobalPlayer playback position.
 *
 * Instrument color system:
 *   Melody    → orange  (#f97316)
 *   Harmony   → purple  (#a855f7)
 *   Bass      → emerald (#10b981)
 *   Accent    → red     (#ef4444)
 *
 * Triggered globally: window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', { detail: { track, album } }))
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Music2, Zap, BookOpen, Download, ChevronRight,
  BarChart2, Waves, Hash, Disc,
} from 'lucide-react';
import { Track, Album } from '../types';
import { useGlobalPlayer, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import html2canvas from 'html2canvas';

// ─── Types ─────────────────────────────────────────────────────────────────────

type NoteRole = 'MELODY' | 'HARMONY' | 'BASS' | 'ACCENT';

interface ScoreNote {
  midi: number;
  role: NoteRole;
  beat: number; // 0-based beat index
}

interface TrackTheory {
  key: string;
  scale: string;
  tempo: number;
  chordQuality: string;
  timeSignature: string;
  notes: ScoreNote[];
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

// ─── Genre → key + scale inference ────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Major scale intervals: W W H W W W H
const MAJOR_SCALE  = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE  = [0, 2, 3, 5, 7, 8, 10];
const BLUES_SCALE  = [0, 3, 5, 6, 7, 10];
const PENTA_MAJOR  = [0, 2, 4, 7, 9];

function genreToScale(genre?: string): { root: number; intervals: number[]; scaleName: string } {
  const g = (genre ?? '').toLowerCase();
  if (g.includes('blues'))                     return { root: 9,  intervals: BLUES_SCALE, scaleName: 'A Blues'       };
  if (g.includes('jazz'))                      return { root: 5,  intervals: MAJOR_SCALE, scaleName: 'F Major'       };
  if (g.includes('hip') || g.includes('rap'))  return { root: 7,  intervals: MINOR_SCALE, scaleName: 'G Minor'       };
  if (g.includes('trap'))                      return { root: 0,  intervals: MINOR_SCALE, scaleName: 'C Minor'       };
  if (g.includes('edm') || g.includes('house'))return { root: 2,  intervals: MINOR_SCALE, scaleName: 'D Minor'       };
  if (g.includes('techno'))                    return { root: 9,  intervals: MINOR_SCALE, scaleName: 'A Minor'       };
  if (g.includes('soul') || g.includes('r&b')) return { root: 5,  intervals: MAJOR_SCALE, scaleName: 'F Major'       };
  if (g.includes('reggae'))                    return { root: 7,  intervals: MAJOR_SCALE, scaleName: 'G Major'       };
  if (g.includes('folk') || g.includes('country')) return { root: 7, intervals: PENTA_MAJOR, scaleName: 'G Pentatonic' };
  if (g.includes('classical'))                 return { root: 0,  intervals: MAJOR_SCALE, scaleName: 'C Major'       };
  if (g.includes('rock') || g.includes('metal')) return { root: 4, intervals: MINOR_SCALE, scaleName: 'E Minor'      };
  return { root: 0, intervals: MAJOR_SCALE, scaleName: 'C Major' };
}

function deterministicHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i), h = h >>> 0;
  return h;
}

// ─── Theory analysis (hash-based fallback) ────────────────────────────────────

function buildHashedTheory(track: Track): TrackTheory {
  const { root, intervals, scaleName } = genreToScale(track.genre);
  const tempo = 120; // fallback; Cora analysis would provide the real value
  const hash = deterministicHash(track.id + track.title);

  // Build an octave-3 pitch set (bass register) and octave-4 (mid register)
  const bassPitches   = intervals.map(i => 48 + ((root + i) % 12));  // octave 3
  const midPitches    = intervals.map(i => 60 + ((root + i) % 12));  // octave 4
  const highPitches   = intervals.map(i => 72 + ((root + i) % 12));  // octave 5

  // Generate 20 notes using a deterministic pseudo-random walk through the scale
  const notes: ScoreNote[] = [];
  let seed = hash;
  const nextRand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };

  for (let beat = 0; beat < 20; beat++) {
    const r = nextRand();
    let midi: number;
    let role: NoteRole;

    if (beat % 4 === 0) {
      // On the downbeat: bass note
      midi = bassPitches[r % bassPitches.length];
      role = 'BASS';
    } else if (beat % 4 === 2) {
      // On the backbeat: harmony
      midi = midPitches[r % midPitches.length];
      role = 'HARMONY';
    } else if ((nextRand() % 5) === 0) {
      // Occasional accent
      midi = highPitches[r % highPitches.length];
      role = 'ACCENT';
    } else {
      // Melody
      midi = midPitches[r % midPitches.length];
      role = 'MELODY';
    }

    notes.push({ midi, role, beat });
  }

  const chordQualities: string[] = ['Major', 'Minor 7th', 'Dominant 7th', 'Major 7th', 'Minor', 'Suspended 4th'];
  const chordQuality = chordQualities[hash % chordQualities.length];

  return {
    key:           NOTE_NAMES[root],
    scale:         scaleName,
    tempo,
    chordQuality,
    timeSignature: '4/4',
    notes,
  };
}

// ─── Note position table (MIDI → staff Y position, octave 3-5) ───────────────

const NOTE_Y: Record<number, number> = {
  // Octave 3 (bass)
  48: 112, 50: 106, 52: 100, 53: 94,  55: 88,  57: 82,  59: 76,
  // Octave 4 (middle)
  60: 70, 62: 64,  64: 58,  65: 52,  67: 46,  69: 40,  71: 34,
  // Octave 5 (high)
  72: 28, 74: 22,  76: 16,
};

function noteY(midi: number): number {
  return NOTE_Y[midi] ?? 64;
}

function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

// ─── Real-time audio analysis ─────────────────────────────────────────────────
// Taps the existing GlobalPlayer AnalyserNode (fftSize=2048).
// Samples every 200 ms: FFT peak → pitch class, time-domain RMS → onset energy.
// After ≥30 samples and ≥6 s of active audio, builds a real TrackTheory using:
//   • Krumhansl-Schmuckler profiles for key detection
//   • Median inter-onset interval for tempo
//   • Per-beat dominant pitch class mapped to the detected scale

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

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
  theory: TrackTheory;
  isReal: boolean;
  analyzing: boolean;
} {
  const { analyser: ctxAnalyser, currentTrack } = useGlobalPlayer();
  const { currentTime } = useGlobalPlayerProgress();

  const [realTheory, setRealTheory] = useState<TrackTheory | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Keep mutable refs so the interval closure always reads the latest values
  const analyserRef2 = useRef<AnalyserNode | null>(ctxAnalyser);
  useEffect(() => { analyserRef2.current = ctxAnalyser; }, [ctxAnalyser]);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const isCurrentTrack = currentTrack?.id === track.id;

  useEffect(() => {
    if (!isCurrentTrack) {
      setRealTheory(null);
      setAnalyzing(false);
      return;
    }

    const pitchHistogram = new Array(12).fill(0);
    const onsetTimes: number[] = [];
    const beatPitchMap = new Map<number, number[]>();
    let prevRms = 0, sampleCount = 0, startTime: number | null = null, finished = false;

    setRealTheory(null);
    setAnalyzing(true);

    const intervalId = setInterval(() => {
      if (finished) return;
      const analyser = analyserRef2.current;
      if (!analyser) return;

      const { fftSize } = analyser;
      const sampleRate = analyser.context.sampleRate;
      const binHz = sampleRate / fftSize;

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(fftSize);
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      // RMS check — skip silent / paused frames
      let rmsSum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        rmsSum += v * v;
      }
      const rms = Math.sqrt(rmsSum / timeData.length);
      if (rms < 0.02) return;

      const t = currentTimeRef.current;
      if (startTime === null) startTime = t;

      // Onset detection via RMS spike
      if (rms > prevRms * 1.5 && rms > 0.06) onsetTimes.push(t);
      prevRms = prevRms * 0.8 + rms * 0.2;

      // Dominant pitch class via FFT peak
      const pc = detectPitchClass(freqData, binHz);
      if (pc !== null) {
        pitchHistogram[pc]++;
        const beatPos = Math.round(t * fallback.tempo / 60) % 20;
        const arr = beatPitchMap.get(beatPos) ?? [];
        arr.push(pc);
        beatPitchMap.set(beatPos, arr);
      }

      sampleCount++;
      const elapsed = t - (startTime ?? t);

      if (sampleCount >= 30 && elapsed >= 6) {
        // ── Key via Krumhansl-Schmuckler ──────────────────────────────────
        const { root, isMinor } = detectKeyFromHistogram(pitchHistogram);
        const keyName = NOTE_NAMES[root];
        const intervals = isMinor ? MINOR_SCALE : MAJOR_SCALE;
        const scaleName = `${keyName} ${isMinor ? 'Minor' : 'Major'}`;

        // ── Tempo via median onset IOI ─────────────────────────────────────
        let tempo = fallback.tempo;
        if (onsetTimes.length >= 4) {
          const iois = onsetTimes.slice(1).map((t2, i) => t2 - onsetTimes[i]);
          const sorted = [...iois].sort((a, b) => a - b);
          let bpm = Math.round(60 / sorted[Math.floor(sorted.length / 2)]);
          while (bpm < 60) bpm *= 2;
          while (bpm > 200) bpm /= 2;
          if (bpm > 0) tempo = bpm;
        }

        // ── Build 20 score notes ──────────────────────────────────────────
        const bassPitches = intervals.map(i => 48 + ((root + i) % 12));
        const midPitches  = intervals.map(i => 60 + ((root + i) % 12));
        const highPitches = intervals.map(i => 72 + ((root + i) % 12));

        const notes: ScoreNote[] = [];
        for (let beat = 0; beat < 20; beat++) {
          const detected = beatPitchMap.get(beat);
          let midi: number;
          let role: NoteRole;

          if (detected && detected.length > 0) {
            const pcCount: Record<number, number> = {};
            for (const p of detected) pcCount[p] = (pcCount[p] ?? 0) + 1;
            const domPc = Number(Object.entries(pcCount).sort((a, b) => b[1] - a[1])[0][0]);
            const deg = intervals.indexOf(((domPc - root) + 12) % 12);
            if (beat % 4 === 0) {
              midi = deg >= 0 ? bassPitches[deg] : 48 + ((root + domPc) % 12);
              role = 'BASS';
            } else if (beat % 4 === 2) {
              midi = deg >= 0 ? midPitches[deg] : 60 + ((root + domPc) % 12);
              role = 'HARMONY';
            } else {
              midi = deg >= 0 ? highPitches[deg % highPitches.length] : 60 + ((root + domPc) % 12);
              role = 'MELODY';
            }
          } else {
            const si = beat % intervals.length;
            if (beat % 4 === 0)      { midi = bassPitches[si % bassPitches.length]; role = 'BASS'; }
            else if (beat % 4 === 2) { midi = midPitches[si % midPitches.length];   role = 'HARMONY'; }
            else                     { midi = midPitches[(si + 2) % midPitches.length]; role = 'MELODY'; }
          }
          while (midi < 48) midi += 12;
          while (midi > 76) midi -= 12;
          notes.push({ midi, role, beat });
        }

        // ── Chord quality heuristic ───────────────────────────────────────
        const topDegs = pitchHistogram
          .map((c, pc) => ({ pc, c }))
          .sort((a, b) => b.c - a.c)
          .slice(0, 3)
          .map(x => ((x.pc - root + 12) % 12));
        const hasSeventh = topDegs.some(d => d === 10 || d === 11);
        let chordQuality = isMinor ? 'Minor' : 'Major';
        if (hasSeventh && isMinor)  chordQuality = 'Minor 7th';
        if (hasSeventh && !isMinor) chordQuality = 'Major 7th';
        if (topDegs.includes(5) && !topDegs.includes(4) && !topDegs.includes(3)) chordQuality = 'Suspended 4th';

        finished = true;
        clearInterval(intervalId);
        setAnalyzing(false);
        setRealTheory({ key: keyName, scale: scaleName, tempo, chordQuality, timeSignature: '4/4', notes });
      }
    }, 200);

    return () => { finished = true; clearInterval(intervalId); };
  }, [track.id, isCurrentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  return { theory: realTheory ?? fallback, isReal: realTheory !== null, analyzing: isCurrentTrack && analyzing };
}

// ─── Animated staff ───────────────────────────────────────────────────────────

interface AnimatedStaffProps {
  notes: ScoreNote[];
  progress: number; // 0..1
}

const AnimatedStaff: React.FC<AnimatedStaffProps> = ({ notes, progress }) => {
  const currentBeat = progress * notes.length;
  const staffRef = useRef<SVGSVGElement>(null);

  return (
    <svg ref={staffRef} width="100%" viewBox="0 0 560 130" className="w-full">
      <rect width="560" height="130" fill="transparent" />

      {/* Staff lines */}
      {[28, 40, 52, 64, 76].map((y, i) => (
        <line key={i} x1="30" y1={y} x2="540" y2={y}
          stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      ))}

      {/* Ledger lines for bass notes */}
      {[88, 100, 112].map((y, i) => (
        <line key={`ledger-${i}`} x1="30" y1={y} x2="540" y2={y}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 8" />
      ))}

      {/* Treble clef */}
      <text x="36" y="88" fontSize="72" fill="rgba(255,255,255,0.35)" fontFamily="serif">𝄞</text>

      {/* Time signature */}
      <text x="90" y="52" fontSize="14" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif" fontWeight="bold">4</text>
      <text x="90" y="70" fontSize="14" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif" fontWeight="bold">4</text>

      {/* Notes */}
      {notes.map((note, i) => {
        const x  = 120 + i * 22;
        const y  = noteY(note.midi);
        const isActive  = Math.abs(i - currentBeat) < 0.9;
        const isPast    = i < currentBeat - 0.5;
        const isFuture  = i > currentBeat + 0.5;
        const color     = ROLE_COLOR[note.role];
        const opacity   = isFuture ? 0.2 : isPast ? 0.55 : 1;
        const glowSize  = isActive ? 12 : 0;

        return (
          <g key={i}>
            {/* Glow for active note */}
            {isActive && (
              <ellipse cx={x} cy={y} rx={glowSize} ry={glowSize * 0.7}
                fill={color} opacity={0.25}
                style={{ filter: `blur(6px)` }} />
            )}

            {/* Bar lines every 4 beats */}
            {i > 0 && i % 4 === 0 && (
              <line x1={x - 11} y1={28} x2={x - 11} y2={76}
                stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            )}

            {/* Note head */}
            <ellipse
              cx={x} cy={y} rx={7} ry={5}
              fill={isFuture ? 'rgba(255,255,255,0.15)' : color}
              stroke={isActive ? color : 'transparent'}
              strokeWidth={isActive ? 1.5 : 0}
              opacity={opacity}
              transform={`rotate(-15,${x},${y})`}
              style={{ transition: 'fill 0.3s, opacity 0.3s' }}
            />

            {/* Stem */}
            {y > 52 ? (
              <line x1={x + 6} y1={y} x2={x + 6} y2={y - 28}
                stroke={isFuture ? 'rgba(255,255,255,0.1)' : color}
                strokeWidth="1.5" opacity={opacity}
                style={{ transition: 'stroke 0.3s' }} />
            ) : (
              <line x1={x - 6} y1={y} x2={x - 6} y2={y + 28}
                stroke={isFuture ? 'rgba(255,255,255,0.1)' : color}
                strokeWidth="1.5" opacity={opacity}
                style={{ transition: 'stroke 0.3s' }} />
            )}

            {/* Accidental for black keys */}
            {isBlackKey(note.midi) && (
              <text x={x - 14} y={y + 4} fontSize="11"
                fill={isFuture ? 'rgba(255,255,255,0.15)' : color}
                fontFamily="serif" opacity={opacity}>♯</text>
            )}

            {/* Instrument dot above active note */}
            {isActive && (
              <circle cx={x} cy={y - 16} r={3}
                fill={color} opacity={0.9}
                style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
            )}
          </g>
        );
      })}

      {/* Playhead cursor */}
      {progress > 0 && progress < 1 && (
        <line
          x1={120 + currentBeat * 22}
          y1={20}
          x2={120 + currentBeat * 22}
          y2={120}
          stroke="#f97316"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity={0.6}
        />
      )}
    </svg>
  );
};

// ─── Theory card ──────────────────────────────────────────────────────────────

const TheoryCard: React.FC<{ label: string; value: string; icon: React.ReactNode; delay: number }> = ({ label, value, icon, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 flex items-center gap-3"
  >
    <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400 shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 leading-none">{label}</p>
      <p className="text-sm font-black text-white mt-0.5 truncate">{value}</p>
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
  const hashTheory = useMemo(() => buildHashedTheory(track), [track.id]);
  const { theory, isReal, analyzing } = useRealAudioAnalysis(track, hashTheory);
  const progress = duration > 0 ? currentTime / duration : 0;
  const staffRef = useRef<HTMLDivElement>(null);
  const [exportingLorea, setExportingLorea] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const cover = track.images?.[0] || track.albumCover || album?.coverImage || '';

  // ── Export to Lorea ────────────────────────────────────────────────────────

  const handleExportLorea = useCallback(async () => {
    if (exportingLorea || exportDone) return;
    setExportingLorea(true);
    try {
      if (staffRef.current) {
        const canvas = await html2canvas(staffRef.current, { backgroundColor: '#0a0a0a', scale: 2 });
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          // Dispatch to Lorea — creates a score document in the user's library
          window.dispatchEvent(new CustomEvent('LOREA_SAVE_SCORE', {
            detail: {
              title:    `${track.title} — Score`,
              artist:   track.artist,
              imageBlob: blob,
              theory,
            },
          }));
          setExportDone(true);
          setExportingLorea(false);

          // Also offer a local PNG download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${track.title.replace(/[^a-z0-9]/gi, '_')}_score.png`;
          a.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      }
    } catch {
      setExportingLorea(false);
    }
  }, [exportingLorea, exportDone, track, theory]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9998] bg-black/90 backdrop-blur-xl flex flex-col overflow-hidden"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-4 px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0"
        >
          {cover && (
            <img src={cover} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Waves size={11} className="text-orange-400 shrink-0" />
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-orange-400/70">The Breakdown</p>
            </div>
            <p className="text-sm font-black text-white truncate">{track.title}</p>
            <p className="text-[10px] text-white/40 truncate">{track.artist}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors shrink-0">
            <X size={14} className="text-white/60" />
          </button>
        </motion.div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-6">

          {/* Animated staff */}
          <motion.div
            ref={staffRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#0d0d0d] border border-white/8 rounded-3xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Live Score</p>
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
              {/* Instrument color legend */}
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

            {/* Playback progress bar */}
            <div className="mt-3 h-0.5 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-orange-500"
                style={{ width: `${progress * 100}%` }}
                transition={{ type: 'tween', duration: 0.1 }}
              />
            </div>
            <p className="text-[8px] text-white/20 text-center mt-1 font-mono">
              {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
              {' / '}
              {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
            </p>
          </motion.div>

          {/* Theory analysis cards */}
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-3 px-1">Analysis</p>
            <div className="grid grid-cols-2 gap-3">
              <TheoryCard label="Key"        value={theory.key}          icon={<Hash size={14} />}    delay={0.15} />
              <TheoryCard label="Scale"      value={theory.scale}        icon={<Music2 size={14} />}  delay={0.18} />
              <TheoryCard label="Tempo"      value={`${theory.tempo} BPM`} icon={<Zap size={14} />}  delay={0.21} />
              <TheoryCard label="Chord Type" value={theory.chordQuality} icon={<BarChart2 size={14}/>} delay={0.24} />
            </div>
          </div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="space-y-3"
          >
            {/* Study in Theory Studio */}
            <button
              onClick={() => { onClose(); onOpenTheoryStudio(); }}
              className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/8 hover:bg-white/8 hover:border-orange-500/25 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  <BookOpen size={15} className="text-purple-400" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-white">Study in Theory Studio</p>
                  <p className="text-[9px] text-white/35 mt-0.5">Lessons, ear training & score reading</p>
                </div>
              </div>
              <ChevronRight size={15} className="text-white/25 group-hover:text-white/60 transition-colors" />
            </button>

            {/* Export to Lorea */}
            <button
              onClick={handleExportLorea}
              disabled={exportingLorea}
              className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/[0.04] border border-white/8 hover:bg-white/8 hover:border-emerald-500/25 transition-all group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <Disc size={15} className={`${exportDone ? 'text-emerald-400' : 'text-emerald-400/70'}`} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-white">
                    {exportDone ? 'Saved to Lorea ✓' : exportingLorea ? 'Exporting…' : 'Export to Lorea'}
                  </p>
                  <p className="text-[9px] text-white/35 mt-0.5">Save score to your Plajah Lorea library</p>
                </div>
              </div>
              {!exportDone && (
                <Download size={15} className="text-white/25 group-hover:text-white/60 transition-colors" />
              )}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TrackBreakdownModal;

// ─── Global controller ────────────────────────────────────────────────────────
// Mount <TrackBreakdownController /> once in App.tsx.

interface BreakdownEvent { track: Track; album: Album | null }

export const TrackBreakdownController: React.FC<{ onOpenTheoryStudio: () => void }> = ({ onOpenTheoryStudio }) => {
  const [active, setActive] = useState<BreakdownEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { track, album } = (e as CustomEvent<BreakdownEvent>).detail;
      if (track) setActive({ track, album });
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
