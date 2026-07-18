/**
 * guidedListening — Part 4.4 of the Experience Expansion: "Listen like a musician".
 *
 * The blueprint's note is exact: *"on any track, the Breakdown view becomes a guided tour —
 * key, form, chord map. The transcription engine is the moat; today it's hidden behind a
 * button."* So this module builds nothing new. It **reads** what the transcription engine
 * (services/audioTranscription) already produced — real notes with real onsets, quantized to
 * a measured beat grid, plus a Krumhansl-Schmuckler key — and turns it into things a listener
 * can actually follow: a tonic, a pulse, a shape, and a chord map.
 *
 * Honesty rules baked in:
 *   • Nothing is invented. Every stop carries the numbers it was derived from, and a
 *     `derivedFrom` field saying whether it came from the real transcription or the
 *     genre-estimate fallback.
 *   • Chord labels are constrained to the diatonic set of the detected key. A weighted
 *     pitch-class match against seven candidates is a defensible estimate; free-form chord
 *     naming over a monophonic-leaning transcription would not be.
 *   • Bars with too little transcribed material return `null` rather than a guess.
 *   • Form sections are labelled by measured density ("sparse", "full") — never invented
 *     "CHORUS"/"BRIDGE" labels the analysis cannot support.
 *
 * All functions are pure and cheap enough to run inside a `useMemo`.
 */

import type { Transcription, TNote } from './audioTranscription';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

/** Triad qualities of the seven diatonic degrees. */
const MAJOR_QUALITIES = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'] as const;
const MINOR_QUALITIES = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'] as const;

const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_ROMAN = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

const TRIAD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

export type ChordQuality = 'maj' | 'min' | 'dim';

export interface DiatonicChord {
  /** Scale degree, 1-indexed. */
  degree: number;
  roman: string;
  /** 'F#m', 'Bb', 'B°' */
  label: string;
  rootPc: number;
  quality: ChordQuality;
  /** tonic / subdominant / dominant — the three jobs a chord can have. */
  fn: 'home' | 'away' | 'tension';
  /** One plain-language line about what this chord does to a listener. */
  feel: string;
}

const FUNCTION_BY_DEGREE: Record<number, DiatonicChord['fn']> = {
  1: 'home', 2: 'away', 3: 'home', 4: 'away', 5: 'tension', 6: 'home', 7: 'tension',
};

const FEEL_MAJOR: Record<number, string> = {
  1: 'Home. Everything is measured against this one.',
  2: 'A step away — usually on the way to the five.',
  3: 'Home with a shadow on it; a soft substitute for the one.',
  4: 'Lift and openness. The classic "away from home" chord.',
  5: 'Tension. It leans hard back toward the one; that lean is the engine of the song.',
  6: 'The sad relative of home — same notes, different centre of gravity.',
  7: 'Unstable on purpose. Rare as a landing place.',
};

const FEEL_MINOR: Record<number, string> = {
  1: 'Home, and home is minor. The whole track is coloured by this.',
  2: 'Restless and thin — a passing chord more than a destination.',
  3: 'The brightest chord available here; often where a minor track opens up.',
  4: 'Deepens the shade. Weight without resolution.',
  5: 'Tension. Raise its third and the pull back home becomes irresistible.',
  6: 'Warm and broad — the most consoling chord in a minor key.',
  7: 'A borrowed brightness that pushes forward rather than resolving back.',
};

// ── Key + diatonic set ────────────────────────────────────────────────────────

export function pitchClassOf(key: string): number {
  const idx = NOTE_NAMES.indexOf(key);
  if (idx >= 0) return idx;
  // Tolerate flats ('Bb', 'Eb') coming from a notation spelling.
  const flatMap: Record<string, number> = { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 };
  return flatMap[key] ?? 0;
}

export function noteName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

/** The seven chords available in a key — the listener's whole vocabulary for this track. */
export function diatonicChords(key: string, mode: 'major' | 'minor'): DiatonicChord[] {
  const root = pitchClassOf(key);
  const steps = mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS;
  const qualities = mode === 'minor' ? MINOR_QUALITIES : MAJOR_QUALITIES;
  const romans = mode === 'minor' ? MINOR_ROMAN : MAJOR_ROMAN;
  const feels = mode === 'minor' ? FEEL_MINOR : FEEL_MAJOR;
  return steps.map((step, i) => {
    const rootPc = (root + step) % 12;
    const quality = qualities[i] as ChordQuality;
    const name = noteName(rootPc);
    return {
      degree: i + 1,
      roman: romans[i],
      label: quality === 'min' ? `${name}m` : quality === 'dim' ? `${name}°` : name,
      rootPc,
      quality,
      fn: FUNCTION_BY_DEGREE[i + 1],
      feel: feels[i + 1],
    };
  });
}

// ── Chord map ─────────────────────────────────────────────────────────────────

export interface BarChord {
  bar: number;              // 1-indexed
  startSec: number;
  endSec: number;
  /** null when the bar has too little transcribed material to call. */
  chord: DiatonicChord | null;
  /** 0–1 — the share of the bar's weight that the winning triad accounts for. */
  confidence: number;
}

const secPerBeat = (bpm: number) => 60 / (bpm > 0 ? bpm : 120);

/**
 * Per-bar chord estimate. Candidates are restricted to the seven diatonic triads of the
 * detected key, scored by the duration-weighted pitch-class content of the notes that start
 * in the bar. That constraint is what keeps this honest: it can be wrong about *which*
 * diatonic chord, but it will not invent harmony the key does not contain.
 */
export function buildChordMap(t: Transcription | null, maxBars = 240): BarChord[] {
  if (!t || !t.notes?.length || !t.bpm) return [];
  const chords = diatonicChords(t.key, t.mode);
  const beatsPerBar = t.beatsPerMeasure > 0 ? t.beatsPerMeasure : 4;
  const spb = secPerBeat(t.bpm);

  // Accumulate weight per bar per pitch class.
  const bars = new Map<number, number[]>();
  for (const n of t.notes) {
    const bar = Math.floor(n.startBeat / beatsPerBar);
    if (bar < 0 || bar >= maxBars) continue;
    if (!bars.has(bar)) bars.set(bar, new Array(12).fill(0));
    const pc = ((n.midi % 12) + 12) % 12;
    // Duration × salience: a held note says more about the harmony than a passing one.
    bars.get(bar)![pc] += Math.max(0.05, n.durBeats) * Math.max(0.1, n.velocity || 1);
  }

  const lastBar = Math.max(...Array.from(bars.keys()), -1);
  const out: BarChord[] = [];
  for (let bar = 0; bar <= lastBar; bar++) {
    const startSec = t.firstBeatSec + bar * beatsPerBar * spb;
    const endSec = startSec + beatsPerBar * spb;
    const hist = bars.get(bar);
    const total = hist ? hist.reduce((a, b) => a + b, 0) : 0;
    if (!hist || total <= 0) {
      out.push({ bar: bar + 1, startSec, endSec, chord: null, confidence: 0 });
      continue;
    }
    let best: DiatonicChord | null = null;
    let bestScore = 0;
    for (const c of chords) {
      const pcs = TRIAD_INTERVALS[c.quality].map(i => (c.rootPc + i) % 12);
      // Root gets extra weight — bass motion is the strongest harmonic cue we have.
      const score = pcs.reduce((s, pc, i) => s + hist[pc] * (i === 0 ? 1.5 : 1), 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const confidence = Math.min(1, bestScore / (total * 1.5));
    // Below a third of the bar's weight the call is noise — say nothing instead.
    out.push({
      bar: bar + 1,
      startSec,
      endSec,
      chord: confidence >= 0.34 ? best : null,
      confidence: Math.round(confidence * 100) / 100,
    });
  }
  return out;
}

/** The most-repeated run of 4 consecutive named bars — the track's "loop", if it has one. */
export function dominantProgression(map: BarChord[]): DiatonicChord[] | null {
  const named = map.filter(b => b.chord);
  if (named.length < 8) return null;
  const counts = new Map<string, { chords: DiatonicChord[]; n: number }>();
  for (let i = 0; i + 3 < map.length; i++) {
    const window = map.slice(i, i + 4);
    if (window.some(b => !b.chord)) continue;
    const key = window.map(b => b.chord!.roman).join('|');
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { chords: window.map(b => b.chord!), n: 1 });
  }
  let best: { chords: DiatonicChord[]; n: number } | null = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return best && best.n >= 2 ? best.chords : null;
}

// ── Form ──────────────────────────────────────────────────────────────────────

export type SectionWeight = 'sparse' | 'steady' | 'full';

export interface FormSection {
  startSec: number;
  endSec: number;
  startBar: number;
  endBar: number;
  weight: SectionWeight;
  /** An honest, measurement-derived label. Never "CHORUS". */
  label: string;
  /** Mean transcribed notes per bar across the section. */
  density: number;
}

const SECTION_LABEL: Record<SectionWeight, string> = {
  sparse: 'Sparse',
  steady: 'Steady',
  full: 'Full',
};

/**
 * Segment the track by *measured* note density per bar. This is arrangement shape, not
 * song-form naming: it tells a listener where the music thins out and where everything
 * arrives, which is the thing you actually want to hear coming.
 */
export function buildForm(t: Transcription | null, minBars = 4): FormSection[] {
  if (!t || !t.notes?.length || !t.bpm) return [];
  const beatsPerBar = t.beatsPerMeasure > 0 ? t.beatsPerMeasure : 4;
  const spb = secPerBeat(t.bpm);

  const perBar = new Map<number, number>();
  let lastBar = 0;
  for (const n of t.notes) {
    const bar = Math.floor(n.startBeat / beatsPerBar);
    if (bar < 0) continue;
    perBar.set(bar, (perBar.get(bar) || 0) + 1);
    if (bar > lastBar) lastBar = bar;
  }
  if (lastBar < minBars) return [];

  const counts: number[] = [];
  for (let b = 0; b <= lastBar; b++) counts.push(perBar.get(b) || 0);

  // Smooth over 4 bars so a single busy bar does not split a section.
  const smooth = counts.map((_, i) => {
    const from = Math.max(0, i - 1);
    const to = Math.min(counts.length - 1, i + 2);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += counts[j];
    return sum / (to - from + 1);
  });

  const sorted = [...smooth].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.33)] || 0;
  const hi = sorted[Math.floor(sorted.length * 0.67)] || 0;
  const classify = (v: number): SectionWeight => (v <= lo ? 'sparse' : v >= hi ? 'full' : 'steady');

  const raw: { weight: SectionWeight; start: number; end: number }[] = [];
  for (let b = 0; b < smooth.length; b++) {
    const w = classify(smooth[b]);
    const last = raw[raw.length - 1];
    if (last && last.weight === w) last.end = b;
    else raw.push({ weight: w, start: b, end: b });
  }

  // Absorb runs shorter than minBars into their predecessor — nobody hears a 2-bar "section".
  const merged: typeof raw = [];
  for (const seg of raw) {
    const len = seg.end - seg.start + 1;
    const prev = merged[merged.length - 1];
    if (prev && len < minBars) prev.end = seg.end;
    else merged.push({ ...seg });
  }

  return merged.map(seg => {
    const bars = seg.end - seg.start + 1;
    let notes = 0;
    for (let b = seg.start; b <= seg.end; b++) notes += counts[b];
    return {
      startSec: t.firstBeatSec + seg.start * beatsPerBar * spb,
      endSec: t.firstBeatSec + (seg.end + 1) * beatsPerBar * spb,
      startBar: seg.start + 1,
      endBar: seg.end + 1,
      weight: seg.weight,
      label: SECTION_LABEL[seg.weight],
      density: Math.round((notes / bars) * 10) / 10,
    };
  });
}

// ── Range ─────────────────────────────────────────────────────────────────────

function midiToName(midi: number): string {
  return `${noteName(midi)}${Math.floor(midi / 12) - 1}`;
}

function rangeOf(notes: TNote[]): { low: number; high: number } | null {
  if (!notes.length) return null;
  let low = Infinity, high = -Infinity;
  for (const n of notes) { if (n.midi < low) low = n.midi; if (n.midi > high) high = n.midi; }
  return Number.isFinite(low) ? { low, high } : null;
}

// ── The tour ──────────────────────────────────────────────────────────────────

export interface TourStop {
  id: string;
  /** Where in the track this stop is best heard. */
  atSec: number;
  title: string;
  /** Plain language. No jargon that is not immediately unpacked. */
  body: string;
  /** What to actually do with your ears right now. */
  listenFor: string;
  /** The measured value behind the claim, shown as a chip. */
  evidence: string;
  icon: 'key' | 'pulse' | 'form' | 'chords' | 'melody' | 'bass';
  derivedFrom: 'transcription' | 'estimate';
}

export interface GuidedTour {
  stops: TourStop[];
  chords: DiatonicChord[];
  chordMap: BarChord[];
  form: FormSection[];
  progression: DiatonicChord[] | null;
  /** True when everything came off the real transcription rather than the genre fallback. */
  isReal: boolean;
  key: string;
  mode: 'major' | 'minor';
  bpm: number;
  meter: string;
}

export interface TourFallback {
  key: string;
  mode: 'major' | 'minor';
  bpm: number;
  beatsPerMeasure: number;
  beatUnit: number;
  durationSec: number;
}

const countIn = (beats: number) =>
  beats === 3 ? 'ONE two three, ONE two three'
    : beats === 6 ? 'ONE two three four five six'
    : beats === 5 ? 'ONE two three four five'
    : 'ONE two three four';

const tempoFeel = (bpm: number) =>
  bpm < 70 ? 'slow enough that the space between hits becomes part of the music'
    : bpm < 100 ? 'a walking pace — you could nod to it without trying'
    : bpm < 128 ? 'the mid-tempo pocket most popular music lives in'
    : bpm < 150 ? 'dance tempo; the pulse is doing the emotional work'
    : 'fast enough that the beat reads as texture rather than a count';

/**
 * Build the guided tour. `t` is the real transcription when the engine has finished;
 * `fallback` supplies the genre/live estimate so the tour still says something true-ish
 * (and clearly marked as an estimate) before transcription lands.
 */
export function buildGuidedTour(t: Transcription | null, fallback: TourFallback): GuidedTour {
  const isReal = !!(t && t.notes?.length);
  const key = t?.key || fallback.key;
  const mode: 'major' | 'minor' = t?.mode || fallback.mode;
  const bpm = Math.round(t?.bpm || fallback.bpm || 120);
  const beats = t?.beatsPerMeasure || fallback.beatsPerMeasure || 4;
  const beatUnit = t?.beatUnit || fallback.beatUnit || 4;
  const meter = `${beats}/${beatUnit}`;
  const duration = t?.durationSec || fallback.durationSec || 0;

  const chords = diatonicChords(key, mode);
  const chordMap = buildChordMap(t);
  const form = buildForm(t);
  const progression = dominantProgression(chordMap);

  const derivedFrom: TourStop['derivedFrom'] = isReal ? 'transcription' : 'estimate';
  const stops: TourStop[] = [];

  // 1 — the tonic
  const tonic = chords[0];
  const dominant = chords[4];
  stops.push({
    id: 'tonic',
    atSec: t?.firstBeatSec ?? 0,
    title: `The home note is ${key}`,
    body: `This track is in ${key} ${mode}. That means one note — ${key} — is the gravitational centre: `
      + `every melody line is heard as either sitting on it, leaning away from it, or falling back to it. `
      + (mode === 'minor'
        ? 'Minor keys put a smaller interval between the home note and the third above it, and that single semitone is most of what people mean when they call music "sad".'
        : 'Major keys put a wider interval between the home note and the third above it, which is most of what people mean when they call music "bright".'),
    listenFor: `Hum ${key} and hold it. Through most of the track it will fit; the moments it clashes are the moments the harmony has moved away.`,
    evidence: `${key} ${mode}`,
    icon: 'key',
    derivedFrom,
  });

  // 2 — the pulse
  stops.push({
    id: 'pulse',
    atSec: (t?.firstBeatSec ?? 0) + 4 * secPerBeat(bpm),
    title: `${bpm} BPM in ${meter}`,
    body: `The beat grid measured here runs at ${bpm} beats per minute — ${tempoFeel(bpm)}. `
      + `The bar is ${beats} beats long, so the music organises itself in groups of ${beats}.`,
    listenFor: `Count "${countIn(beats)}" out loud with the track. The number you say loudest is where chords tend to change.`,
    evidence: `${bpm} BPM · ${meter}`,
    icon: 'pulse',
    derivedFrom,
  });

  // 3 — the shape
  if (form.length >= 2) {
    const fullest = [...form].sort((a, b) => b.density - a.density)[0];
    const sparsest = [...form].sort((a, b) => a.density - b.density)[0];
    stops.push({
      id: 'form',
      atSec: fullest.startSec,
      title: `${form.length} distinct stretches`,
      body: `Counting the transcribed notes bar by bar, the arrangement thins and thickens ${form.length} times. `
        + `The fullest stretch starts around bar ${fullest.startBar} (${fullest.density} notes per bar); the thinnest is `
        + `bar ${sparsest.startBar} (${sparsest.density} per bar). That contrast — not the melody — is what makes a track feel like it goes somewhere.`,
      listenFor: 'Notice what enters at the fullest section and what was taken away before it. Arrangement is mostly subtraction.',
      evidence: `${form.length} sections`,
      icon: 'form',
      derivedFrom,
    });
  }

  // 4 — the chord map
  if (progression) {
    stops.push({
      id: 'chords',
      atSec: chordMap.find(b => b.chord)?.startSec ?? 0,
      title: `The loop: ${progression.map(c => c.label).join(' → ')}`,
      body: `Reading the transcribed notes bar by bar, the harmony that repeats most is `
        + `${progression.map(c => c.roman).join(' → ')} — ${progression.map(c => c.label).join(', ')}. `
        + `The ${dominant.label} is the one carrying tension; the ${tonic.label} is where it lands.`,
      listenFor: 'Wait for the chord before the one that feels like an arrival. That is the chord doing the work.',
      evidence: progression.map(c => c.roman).join(' → '),
      icon: 'chords',
      derivedFrom,
    });
  } else {
    stops.push({
      id: 'chords',
      atSec: 0,
      title: `Seven chords are available in ${key} ${mode}`,
      body: `Almost everything you hear will be one of these: ${chords.map(c => c.label).join(', ')}. `
        + `Three of them do most of the work — ${tonic.label} is home, ${chords[3].label} steps away, and ${dominant.label} pulls back.`,
      listenFor: `Every time the music feels like it "arrives", it has almost certainly landed on ${tonic.label}.`,
      evidence: `${chords.length} diatonic chords`,
      icon: 'chords',
      derivedFrom,
    });
  }

  // 5 / 6 — the two lines the engine actually tracks
  if (t?.notes?.length) {
    const melody = t.notes.filter(n => n.voice === 'melody');
    const bass = t.notes.filter(n => n.voice === 'bass');
    const mRange = rangeOf(melody);
    const bRange = rangeOf(bass);
    if (mRange && melody.length > 8) {
      const span = mRange.high - mRange.low;
      stops.push({
        id: 'melody',
        atSec: melody[Math.floor(melody.length / 3)]?.startSec ?? 0,
        title: `The melody covers ${span} semitones`,
        body: `The lead line moves between ${midiToName(mRange.low)} and ${midiToName(mRange.high)} — `
          + (span <= 7 ? 'a narrow range, which is why it sits so easily in the ear and is easy to sing back.'
            : span <= 14 ? 'about an octave, the range a normal voice can carry without strain.'
            : 'a wide range, which takes real control to sing and gives the track its sense of reach.'),
        listenFor: 'Find the highest note in the track. It is almost never an accident — it usually marks the emotional peak.',
        evidence: `${midiToName(mRange.low)}–${midiToName(mRange.high)}`,
        icon: 'melody',
        derivedFrom: 'transcription',
      });
    }
    if (bRange && bass.length > 8) {
      stops.push({
        id: 'bass',
        atSec: bass[Math.floor(bass.length / 2)]?.startSec ?? 0,
        title: 'The bass is telling you the chord',
        body: `The low line runs ${midiToName(bRange.low)} to ${midiToName(bRange.high)}. `
          + 'In almost all popular music the bass note is the root of the current chord, which means you can follow the entire harmonic map by ear without knowing any theory — just track the lowest note.',
        listenFor: 'Ignore everything above the bass for thirty seconds. The song\'s shape is still completely legible.',
        evidence: `${midiToName(bRange.low)}–${midiToName(bRange.high)}`,
        icon: 'bass',
        derivedFrom: 'transcription',
      });
    }
  }

  // Keep the tour in listening order and inside the track.
  const ordered = stops
    .map(s => ({ ...s, atSec: Math.max(0, duration > 0 ? Math.min(s.atSec, duration - 1) : s.atSec) }))
    .sort((a, b) => a.atSec - b.atSec);

  return { stops: ordered, chords, chordMap, form, progression, isReal, key, mode, bpm, meter };
}

/** The stop the listener is currently inside, by playhead position. */
export function activeStopIndex(stops: TourStop[], currentTime: number): number {
  if (!stops.length) return -1;
  let idx = 0;
  for (let i = 0; i < stops.length; i++) if (currentTime >= stops[i].atSec) idx = i;
  return idx;
}

/** The bar the playhead is inside. -1 when unknown. */
export function activeBarIndex(map: BarChord[], currentTime: number): number {
  for (let i = 0; i < map.length; i++) {
    if (currentTime >= map[i].startSec && currentTime < map[i].endSec) return i;
  }
  return -1;
}
