// ─── Notation model + MusicXML export ─────────────────────────────────────────
// Turns a raw Transcription (quantized notes on a beat grid) into real engraved
// notation: measures, clefs, key/time signatures, note durations with dots, rests
// filling the gaps, and ties across barlines. Serializes to MusicXML 3.1 so the
// result opens in MuseScore / Finale / Sibelius — i.e. actual sheet music for
// composers and musicians, not a bitmap.

import type { Transcription, TNote, Voice } from './audioTranscription';

const DIV = 4;                 // divisions per quarter note (sixteenth = 1)
const MAX_MEASURES = 64;

const SHARP_SPELL: Record<number, [string, number]> = {
  0: ['C', 0], 1: ['C', 1], 2: ['D', 0], 3: ['D', 1], 4: ['E', 0], 5: ['F', 0],
  6: ['F', 1], 7: ['G', 0], 8: ['G', 1], 9: ['A', 0], 10: ['A', 1], 11: ['B', 0],
};
const FLAT_SPELL: Record<number, [string, number]> = {
  0: ['C', 0], 1: ['D', -1], 2: ['D', 0], 3: ['E', -1], 4: ['E', 0], 5: ['F', 0],
  6: ['G', -1], 7: ['G', 0], 8: ['A', -1], 9: ['A', 0], 10: ['B', -1], 11: ['B', 0],
};

// Representable durations (in divisions) → MusicXML note type + dot count.
const DUR_TABLE: { div: number; type: string; dots: number }[] = [
  { div: 16, type: 'whole', dots: 0 },
  { div: 12, type: 'half', dots: 1 },
  { div: 8, type: 'half', dots: 0 },
  { div: 6, type: 'quarter', dots: 1 },
  { div: 4, type: 'quarter', dots: 0 },
  { div: 3, type: 'eighth', dots: 1 },
  { div: 2, type: 'eighth', dots: 0 },
  { div: 1, type: '16th', dots: 0 },
];

export interface NElement {
  rest: boolean;
  midi?: number;
  step?: string;
  alter?: number;
  octave?: number;
  divisions: number;
  type: string;
  dots: number;
  tieStart?: boolean;
  tieStop?: boolean;
}
export interface NMeasure { number: number; elements: NElement[] }
export interface NStaff { name: string; clef: 'treble' | 'bass'; voice: Voice; measures: NMeasure[] }
export interface Notation {
  staves: NStaff[];
  key: string;
  mode: string;
  keyFifths: number;
  beats: number;       // time-sig numerator
  beatType: number;    // time-sig denominator
  divisions: number;
  tempo: number;
}

function spell(midi: number, fifths: number): { step: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = (fifths >= 0 ? SHARP_SPELL : FLAT_SPELL)[pc];
  const octave = Math.floor(midi / 12) - 1;
  return { step, alter, octave };
}

/** Greedily split a duration (divisions) into representable note units. */
function splitDuration(divisions: number): { div: number; type: string; dots: number }[] {
  const out: { div: number; type: string; dots: number }[] = [];
  let rem = divisions;
  let guard = 0;
  while (rem > 0 && guard++ < 64) {
    const unit = DUR_TABLE.find(u => u.div <= rem);
    if (!unit) break;
    out.push(unit);
    rem -= unit.div;
  }
  return out;
}

/** Build one staff's measures from a single voice's quantized notes. */
function buildStaff(notes: TNote[], voice: Voice, clef: 'treble' | 'bass', name: string, fifths: number, measureLen: number): NStaff {
  // Enforce monophony: sort, then truncate any note that overruns the next onset.
  const seq = notes
    .filter(n => n.voice === voice)
    .map(n => ({ start: Math.round(n.startBeat * DIV), dur: Math.max(1, Math.round(n.durBeats * DIV)), midi: n.midi }))
    .sort((a, b) => a.start - b.start || b.dur - a.dur);

  // De-overlap (keep the first, clip to next start; drop zero-length).
  const mono: { start: number; dur: number; midi: number }[] = [];
  for (const n of seq) {
    const prev = mono[mono.length - 1];
    if (prev && n.start < prev.start + prev.dur) {
      if (n.start <= prev.start) continue;          // fully shadowed
      prev.dur = n.start - prev.start;
    }
    if (n.dur > 0) mono.push({ ...n });
  }

  const totalDiv = mono.length ? Math.min(mono[mono.length - 1].start + mono[mono.length - 1].dur, MAX_MEASURES * measureLen) : measureLen;
  const measureCount = Math.max(1, Math.ceil(totalDiv / measureLen));
  const measures: NMeasure[] = Array.from({ length: measureCount }, (_, i) => ({ number: i + 1, elements: [] }));

  // Emit a span [pos, pos+dur) as either a rest or a pitched note, split across
  // barlines (ties) and into representable durations.
  const emit = (pos: number, dur: number, midi: number | null) => {
    let p = pos, remaining = dur;
    const isNote = midi !== null;
    let first = true;
    while (remaining > 0) {
      const mIndex = Math.floor(p / measureLen);
      if (mIndex >= measureCount) break;
      const spaceToBar = (mIndex + 1) * measureLen - p;
      const chunk = Math.min(remaining, spaceToBar);
      const units = splitDuration(chunk);
      for (let u = 0; u < units.length; u++) {
        const unit = units[u];
        const lastUnitOfNote = first && u === units.length - 1 && chunk === remaining;
        const el: NElement = {
          rest: !isNote,
          divisions: unit.div,
          type: unit.type,
          dots: unit.dots,
        };
        if (isNote) {
          const sp = spell(midi as number, fifths);
          el.midi = midi as number; el.step = sp.step; el.alter = sp.alter; el.octave = sp.octave;
          el.tieStop = !first || u > 0;
          el.tieStart = !lastUnitOfNote;
        }
        measures[mIndex].elements.push(el);
      }
      p += chunk; remaining -= chunk; first = false;
    }
  };

  let cursor = 0;
  for (const n of mono) {
    if (n.start > cursor) emit(cursor, n.start - cursor, null);   // gap → rest
    emit(n.start, n.dur, n.midi);
    cursor = n.start + n.dur;
  }
  // Pad the final measure to full length with a rest.
  const fill = measureCount * measureLen - cursor;
  if (fill > 0) emit(cursor, fill, null);

  return { name, clef, voice, measures };
}

export function buildNotation(t: Transcription): Notation {
  const measureLen = t.beatsPerMeasure * DIV * (4 / t.beatUnit);
  return {
    staves: [
      buildStaff(t.notes, 'melody', 'treble', 'Melody', t.keyFifths, measureLen),
      buildStaff(t.notes, 'bass', 'bass', 'Bass', t.keyFifths, measureLen),
    ],
    key: t.key,
    mode: t.mode,
    keyFifths: t.keyFifths,
    beats: t.beatsPerMeasure,
    beatType: t.beatUnit,
    divisions: DIV,
    tempo: Math.round(t.bpm),
  };
}

// ─── MusicXML serialization ────────────────────────────────────────────────────

const ACCIDENTAL: Record<number, string> = { 1: 'sharp', 2: 'double-sharp', [-1]: 'flat', [-2]: 'flat-flat' };

function noteXml(el: NElement, fifths: number): string {
  const lines: string[] = ['      <note>'];
  if (el.rest) {
    lines.push('        <rest/>');
  } else {
    lines.push('        <pitch>');
    lines.push(`          <step>${el.step}</step>`);
    if (el.alter) lines.push(`          <alter>${el.alter}</alter>`);
    lines.push(`          <octave>${el.octave}</octave>`);
    lines.push('        </pitch>');
  }
  lines.push(`        <duration>${el.divisions}</duration>`);
  if (!el.rest && el.tieStop) lines.push('        <tie type="stop"/>');
  if (!el.rest && el.tieStart) lines.push('        <tie type="start"/>');
  lines.push('        <voice>1</voice>');
  lines.push(`        <type>${el.type}</type>`);
  for (let d = 0; d < el.dots; d++) lines.push('        <dot/>');
  if (!el.rest && el.alter && ACCIDENTAL[el.alter]) lines.push(`        <accidental>${ACCIDENTAL[el.alter]}</accidental>`);
  // Tie *notation* (slur-like) mirrors the sounding tie above.
  if (!el.rest && (el.tieStart || el.tieStop)) {
    lines.push('        <notations>');
    if (el.tieStop) lines.push('          <tied type="stop"/>');
    if (el.tieStart) lines.push('          <tied type="start"/>');
    lines.push('        </notations>');
  }
  lines.push('      </note>');
  return lines.join('\n');
}

function partXml(staff: NStaff, n: Notation, partId: string): string {
  const clefXml = staff.clef === 'bass'
    ? '          <clef><sign>F</sign><line>4</line></clef>'
    : '          <clef><sign>G</sign><line>2</line></clef>';
  const body = staff.measures.map((m, i) => {
    const attrs = i === 0
      ? [
          '        <attributes>',
          `          <divisions>${n.divisions}</divisions>`,
          `          <key><fifths>${n.keyFifths}</fifths><mode>${n.mode}</mode></key>`,
          `          <time><beats>${n.beats}</beats><beat-type>${n.beatType}</beat-type></time>`,
          clefXml,
          '        </attributes>',
          i === 0 ? `        <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${n.tempo}</per-minute></metronome></direction-type></direction>` : '',
        ].filter(Boolean).join('\n')
      : '';
    const notes = m.elements.map(el => noteXml(el, n.keyFifths)).join('\n');
    return `    <measure number="${m.number}">\n${attrs ? attrs + '\n' : ''}${notes}\n    </measure>`;
  }).join('\n');
  return `  <part id="${partId}">\n${body}\n  </part>`;
}

export function notationToMusicXML(n: Notation, title: string, composer: string): string {
  const parts = n.staves.map((s, i) => partXml(s, n, `P${i + 1}`)).join('\n');
  const partList = n.staves.map((s, i) =>
    `    <score-part id="P${i + 1}"><part-name>${escapeXml(s.name)}</part-name></score-part>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <identification><creator type="composer">${escapeXml(composer)}</creator><encoding><software>Plajah Cora</software></encoding></identification>
  <part-list>
${partList}
  </part-list>
${parts}
</score-partwise>`;
}

function escapeXml(s: string): string {
  return (s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}
