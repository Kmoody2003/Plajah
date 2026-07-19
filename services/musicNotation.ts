// ─── Notation model + MusicXML export ─────────────────────────────────────────
// Turns a raw Transcription (quantized notes on a beat grid) into real engraved
// notation: measures, clefs, key/time signatures, note durations with dots, rests
// filling the gaps, and ties across barlines. Serializes to MusicXML 3.1 so the
// result opens in MuseScore / Finale / Sibelius — i.e. actual sheet music for
// composers and musicians, not a bitmap.

import type { Transcription, Voice } from './audioTranscription';

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

export interface NPitch { midi: number; step: string; alter: number; octave: number }

/** A drum/percussion hit: no real pitch, just a staff position + a GM sound. */
export interface NUnpitched {
  /** Where the notehead sits on the staff ('A'…'G'), not a sounding pitch. */
  displayStep: string;
  displayOctave: number;
  /** GM percussion MIDI note number (36 = acoustic bass drum, 38 = snare, …).
   *  Serialized as <midi-unpitched>, which is 1-based, so we emit midiNote + 1. */
  midiNote: number;
  /** <instrument-name>, which MusicXML requires; falls back to a neutral label. */
  name?: string;
  /** MusicXML <instrument-sound>, e.g. 'drum.bass-drum'. */
  sound?: string;
}

export interface NElement {
  rest: boolean;
  /** One pitch = single note; many = chord; empty = rest. */
  pitches: NPitch[];
  divisions: number;
  type: string;
  dots: number;
  tieStart?: boolean;
  tieStop?: boolean;
  /** Percussion hits sounding at this position; parallel to (and normally
   *  exclusive with) `pitches`. */
  unpitched?: NUnpitched[];
  /** Sung text for this position. Only emitted on the head of a tie chain. */
  lyric?: string;
}
export interface NMeasure { number: number; elements: NElement[] }

export type NClef = 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';

export interface NStaff {
  name: string;
  /** Kept narrow because the on-screen SheetMusic renderer only draws these two;
   *  anything else is carried in `clefKind` and is MusicXML-export only. */
  clef: 'treble' | 'bass';
  voice?: Voice;
  measures: NMeasure[];
  /** Explicit MusicXML clef when the part is not a plain treble/bass staff. */
  clefKind?: NClef;
  /** <part id> / <score-part id>. Defaults to P1, P2, … by position. */
  id?: string;
  /** Consecutive staves sharing a groupId are wrapped in one <part-group>. */
  groupId?: string;
  groupSymbol?: 'brace' | 'bracket';
  groupName?: string;
  /** MusicXML <instrument-sound> for a pitched part, e.g. 'keyboard.piano'. */
  instrumentSound?: string;
  /** Distinct percussion instruments used by this staff, collected from its
   *  notes so <score-part> and <instrument> refs can never disagree. */
  instruments?: NUnpitched[];
}

/** Note input for buildNotation. TNote satisfies this structurally, so existing
 *  transcriptions feed straight through; drum detection adds `unpitched`. */
export interface NInputNote {
  midi: number;
  startBeat: number;
  durBeats: number;
  voice?: Voice;
  unpitched?: NUnpitched;
  lyric?: string;
}

/** Describes one part of a multi-part score. */
export interface NPartSpec {
  /** <part id>. Defaults to P1, P2, … by position. */
  id?: string;
  /** <part-name>. */
  label: string;
  clef?: NClef;
  /** Take notes of this transcription voice. Ignored when `filter` is given. */
  voice?: Voice;
  /** Arbitrary selector, for parts that are not one of the two voices. */
  filter?: (n: NInputNote) => boolean;
  /** Note source for this part; defaults to the transcription's own notes. */
  notes?: NInputNote[];
  instrumentSound?: string;
  groupId?: string;
  groupSymbol?: 'brace' | 'bracket';
  groupName?: string;
}

/** Optional score credits. Every field is omitted from the output when absent. */
export interface NCredits {
  composer?: string;
  arranger?: string;
  lyricist?: string;
  /** <rights> — copyright line. */
  rights?: string;
  /** <source> — free-form attribution for where the music came from. */
  source?: string;
}

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

const MAX_CHORD = 5;

/** One sounding thing at an onset: a pitch, or a percussion hit. */
interface Hit { midi: number; un?: NUnpitched; lyric?: string }

/** Build one staff's measures from a part's quantized notes, grouping
 *  simultaneous notes into chords (homophonic reduction by onset). */
function buildStaff(notes: NInputNote[], spec: NPartSpec, fifths: number, measureLen: number): NStaff {
  // No selector at all (e.g. a part with its own `notes`) means take everything.
  const select = spec.filter ?? (spec.voice ? (n: NInputNote) => n.voice === spec.voice : () => true);
  const voiced = (spec.notes ?? notes)
    .filter(select)
    .map(n => ({
      start: Math.round(n.startBeat * DIV), dur: Math.max(1, Math.round(n.durBeats * DIV)),
      midi: n.midi, un: n.unpitched, lyric: n.lyric,
    }));

  // Group notes that share a quantized onset into a chord. Percussion hits are
  // keyed by their GM note so two drums can share one onset.
  const byStart = new Map<number, { start: number; hits: Hit[]; keys: Set<string>; maxEnd: number }>();
  for (const n of voiced) {
    let g = byStart.get(n.start);
    if (!g) { g = { start: n.start, hits: [], keys: new Set(), maxEnd: 0 }; byStart.set(n.start, g); }
    const key = n.un ? `u${n.un.midiNote}` : `p${n.midi}`;
    if (!g.keys.has(key)) { g.keys.add(key); g.hits.push({ midi: n.midi, un: n.un, lyric: n.lyric }); }
    g.maxEnd = Math.max(g.maxEnd, n.start + n.dur);
  }
  const groups = [...byStart.values()].sort((a, b) => a.start - b.start);

  // Each chord lasts until the next onset (block-chord rhythm), clamped to its
  // own longest note so trailing silence becomes a rest.
  const events = groups.map((g, i) => {
    const nextStart = i + 1 < groups.length ? groups[i + 1].start : g.maxEnd;
    const dur = Math.max(1, Math.min(g.maxEnd - g.start, nextStart - g.start) || (g.maxEnd - g.start));
    const hits = [...g.hits]
      .sort((a, b) => (a.un?.midiNote ?? a.midi) - (b.un?.midiNote ?? b.midi))
      .slice(0, MAX_CHORD);
    return { start: g.start, dur, hits };
  });

  const lastEnd = events.length ? events[events.length - 1].start + events[events.length - 1].dur : measureLen;
  const totalDiv = Math.min(lastEnd, MAX_MEASURES * measureLen);
  const measureCount = Math.max(1, Math.ceil(totalDiv / measureLen));
  const measures: NMeasure[] = Array.from({ length: measureCount }, (_, i) => ({ number: i + 1, elements: [] }));

  // Emit a span [pos, pos+dur) as a rest (hits null) or a (possibly chord) note,
  // split across barlines (ties) and into representable durations.
  const emit = (pos: number, dur: number, hits: Hit[] | null) => {
    let p = pos, remaining = dur;
    const isNote = hits !== null && hits.length > 0;
    const pitched = isNote ? (hits as Hit[]).filter(h => !h.un) : [];
    const struck = isNote ? (hits as Hit[]).filter(h => h.un).map(h => h.un as NUnpitched) : [];
    const lyric = isNote ? (hits as Hit[]).find(h => h.lyric)?.lyric : undefined;
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
          pitches: pitched.map(h => ({ midi: h.midi, ...spell(h.midi, fifths) })),
          divisions: unit.div,
          type: unit.type,
          dots: unit.dots,
        };
        if (struck.length) el.unpitched = struck;
        if (isNote) {
          el.tieStop = !first || u > 0;
          el.tieStart = !lastUnitOfNote;
          // Lyrics belong to the head of a tie chain only.
          if (lyric && !el.tieStop) el.lyric = lyric;
        }
        measures[mIndex].elements.push(el);
      }
      p += chunk; remaining -= chunk; first = false;
    }
  };

  let cursor = 0;
  for (const ev of events) {
    if (ev.start > cursor) emit(cursor, ev.start - cursor, null);   // gap → rest
    if (ev.start < cursor) continue;                                // overlap guard
    emit(ev.start, ev.dur, ev.hits);
    cursor = ev.start + ev.dur;
  }
  const fill = measureCount * measureLen - cursor;
  if (fill > 0) emit(cursor, fill, null);

  // Collect the distinct percussion instruments this staff actually plays, so
  // the <score-part> declarations and the per-note <instrument> refs match.
  const byNote = new Map<number, NUnpitched>();
  for (const n of voiced) if (n.un && !byNote.has(n.un.midiNote)) byNote.set(n.un.midiNote, n.un);
  const instruments = [...byNote.values()].sort((a, b) => a.midiNote - b.midiNote);

  const clefKind = spec.clef ?? 'treble';
  const staff: NStaff = {
    name: spec.label,
    clef: clefKind === 'bass' ? 'bass' : 'treble',
    measures,
  };
  if (spec.voice) staff.voice = spec.voice;
  if (clefKind !== 'treble' && clefKind !== 'bass') staff.clefKind = clefKind;
  if (spec.id) staff.id = spec.id;
  if (spec.groupId) {
    staff.groupId = spec.groupId;
    if (spec.groupSymbol) staff.groupSymbol = spec.groupSymbol;
    if (spec.groupName) staff.groupName = spec.groupName;
  }
  if (spec.instrumentSound) staff.instrumentSound = spec.instrumentSound;
  if (instruments.length) staff.instruments = instruments;
  return staff;
}

const DEFAULT_PARTS: NPartSpec[] = [
  { label: 'Melody', clef: 'treble', voice: 'melody' },
  { label: 'Bass', clef: 'bass', voice: 'bass' },
];

export function buildNotation(t: Transcription, parts?: NPartSpec[]): Notation {
  const measureLen = t.beatsPerMeasure * DIV * (4 / t.beatUnit);
  const specs = parts && parts.length ? parts : DEFAULT_PARTS;
  return {
    staves: specs.map(spec => buildStaff(t.notes, spec, t.keyFifths, measureLen)),
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

/** <lyric> sits after <notations> in the MusicXML note content model. We only
 *  ever emit syllabic "single" — we do no hyphenation, and claiming
 *  begin/middle/end without it would engrave wrong. */
function lyricXml(text: string): string[] {
  return [
    '        <lyric number="1">',
    '          <syllabic>single</syllabic>',
    `          <text>${escapeXml(text)}</text>`,
    '        </lyric>',
  ];
}

function noteXml(el: NElement, _fifths: number, partId: string): string {
  // Percussion: <unpitched> + an <instrument> ref in place of <pitch>.
  if (!el.rest && el.unpitched?.length) {
    return el.unpitched.map((u, idx) => {
      const lines: string[] = ['      <note>'];
      if (idx > 0) lines.push('        <chord/>');
      lines.push('        <unpitched>');
      lines.push(`          <display-step>${u.displayStep}</display-step>`);
      lines.push(`          <display-octave>${u.displayOctave}</display-octave>`);
      lines.push('        </unpitched>');
      lines.push(`        <duration>${el.divisions}</duration>`);
      if (el.tieStop) lines.push('        <tie type="stop"/>');
      if (el.tieStart) lines.push('        <tie type="start"/>');
      lines.push(`        <instrument id="${instrumentId(partId, u)}"/>`);
      lines.push('        <voice>1</voice>');
      lines.push(`        <type>${el.type}</type>`);
      for (let d = 0; d < el.dots; d++) lines.push('        <dot/>');
      if (el.tieStart || el.tieStop) {
        lines.push('        <notations>');
        if (el.tieStop) lines.push('          <tied type="stop"/>');
        if (el.tieStart) lines.push('          <tied type="start"/>');
        lines.push('        </notations>');
      }
      if (idx === 0 && el.lyric) lines.push(...lyricXml(el.lyric));
      lines.push('      </note>');
      return lines.join('\n');
    }).join('\n');
  }
  // Rest → a single <note><rest/>.
  if (el.rest || el.pitches.length === 0) {
    return [
      '      <note>',
      '        <rest/>',
      `        <duration>${el.divisions}</duration>`,
      '        <voice>1</voice>',
      `        <type>${el.type}</type>`,
      ...Array.from({ length: el.dots }, () => '        <dot/>'),
      '      </note>',
    ].join('\n');
  }
  // One <note> per chord pitch; chord members carry <chord/> before <pitch>.
  return el.pitches.map((p, idx) => {
    const lines: string[] = ['      <note>'];
    if (idx > 0) lines.push('        <chord/>');
    lines.push('        <pitch>');
    lines.push(`          <step>${p.step}</step>`);
    if (p.alter) lines.push(`          <alter>${p.alter}</alter>`);
    lines.push(`          <octave>${p.octave}</octave>`);
    lines.push('        </pitch>');
    lines.push(`        <duration>${el.divisions}</duration>`);
    if (el.tieStop) lines.push('        <tie type="stop"/>');
    if (el.tieStart) lines.push('        <tie type="start"/>');
    lines.push('        <voice>1</voice>');
    lines.push(`        <type>${el.type}</type>`);
    for (let d = 0; d < el.dots; d++) lines.push('        <dot/>');
    if (p.alter && ACCIDENTAL[p.alter]) lines.push(`        <accidental>${ACCIDENTAL[p.alter]}</accidental>`);
    if (el.tieStart || el.tieStop) {
      lines.push('        <notations>');
      if (el.tieStop) lines.push('          <tied type="stop"/>');
      if (el.tieStart) lines.push('          <tied type="start"/>');
      lines.push('        </notations>');
    }
    if (idx === 0 && el.lyric) lines.push(...lyricXml(el.lyric));
    lines.push('      </note>');
    return lines.join('\n');
  }).join('\n');
}

const CLEF_XML: Record<NClef, string> = {
  treble: '<clef><sign>G</sign><line>2</line></clef>',
  bass: '<clef><sign>F</sign><line>4</line></clef>',
  alto: '<clef><sign>C</sign><line>3</line></clef>',
  tenor: '<clef><sign>C</sign><line>4</line></clef>',
  percussion: '<clef><sign>percussion</sign><line>2</line></clef>',
};

/** Instrument ids are derived, never stored, so <score-instrument id> and the
 *  <instrument id> refs on notes cannot drift apart. */
function instrumentId(partId: string, u: NUnpitched): string {
  return `${partId}-I${u.midiNote}`;
}

function partXml(staff: NStaff, n: Notation, partId: string): string {
  const clefKind: NClef = staff.clefKind ?? staff.clef;
  const clefXml = `          ${CLEF_XML[clefKind]}`;
  const body = staff.measures.map((m, i) => {
    const attrs = i === 0
      ? [
          '        <attributes>',
          `          <divisions>${n.divisions}</divisions>`,
          // A percussion staff has no key signature to engrave.
          clefKind === 'percussion'
            ? ''
            : `          <key><fifths>${n.keyFifths}</fifths><mode>${n.mode}</mode></key>`,
          `          <time><beats>${n.beats}</beats><beat-type>${n.beatType}</beat-type></time>`,
          clefXml,
          '        </attributes>',
          i === 0 ? `        <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${n.tempo}</per-minute></metronome></direction-type></direction>` : '',
        ].filter(Boolean).join('\n')
      : '';
    const notes = m.elements.map(el => noteXml(el, n.keyFifths, partId)).join('\n');
    return `    <measure number="${m.number}">\n${attrs ? attrs + '\n' : ''}${notes}\n    </measure>`;
  }).join('\n');
  return `  <part id="${partId}">\n${body}\n  </part>`;
}

const partIdOf = (s: NStaff, i: number) => s.id || `P${i + 1}`;

/** <score-part> content order is fixed: part-name, then score-instrument*, then
 *  midi-instrument*. Percussion parts declare one instrument per drum, with
 *  <midi-unpitched> on channel 10 (the GM percussion channel). */
function scorePartXml(staff: NStaff, partId: string): string {
  const name = `<part-name>${escapeXml(staff.name)}</part-name>`;
  const instruments = staff.instruments ?? [];
  if (!instruments.length && !staff.instrumentSound) {
    return `    <score-part id="${partId}">${name}</score-part>`;
  }
  const lines = [`    <score-part id="${partId}">`, `      ${name}`];
  if (instruments.length) {
    for (const u of instruments) {
      const id = instrumentId(partId, u);
      const label = u.name || `Unpitched ${u.midiNote}`;
      const sound = u.sound ? `<instrument-sound>${escapeXml(u.sound)}</instrument-sound>` : '';
      lines.push(`      <score-instrument id="${id}"><instrument-name>${escapeXml(label)}</instrument-name>${sound}</score-instrument>`);
    }
    for (const u of instruments) {
      // <midi-unpitched> is 1-based against MIDI note numbers.
      lines.push(`      <midi-instrument id="${instrumentId(partId, u)}"><midi-channel>10</midi-channel><midi-unpitched>${u.midiNote + 1}</midi-unpitched></midi-instrument>`);
    }
  } else if (staff.instrumentSound) {
    lines.push(`      <score-instrument id="${partId}-I1"><instrument-name>${escapeXml(staff.name)}</instrument-name><instrument-sound>${escapeXml(staff.instrumentSound)}</instrument-sound></score-instrument>`);
  }
  lines.push('    </score-part>');
  return lines.join('\n');
}

/** Wrap runs of staves that share a groupId in <part-group start/stop>. */
function partListXml(staves: NStaff[]): string {
  const out: string[] = [];
  let open: string | null = null;
  let groupNum = 0;
  staves.forEach((s, i) => {
    const gid = s.groupId ?? null;
    if (gid !== open) {
      if (open !== null) out.push(`    <part-group type="stop" number="${groupNum}"/>`);
      open = gid;
      if (gid) {
        groupNum++;
        const inner = [
          s.groupName ? `      <group-name>${escapeXml(s.groupName)}</group-name>` : '',
          `      <group-symbol>${s.groupSymbol ?? 'brace'}</group-symbol>`,
          '      <group-barline>yes</group-barline>',
        ].filter(Boolean).join('\n');
        out.push(`    <part-group type="start" number="${groupNum}">\n${inner}\n    </part-group>`);
      }
    }
    out.push(scorePartXml(s, partIdOf(s, i)));
  });
  if (open !== null) out.push(`    <part-group type="stop" number="${groupNum}"/>`);
  return out.join('\n');
}

/** <identification> content order: creator*, rights*, encoding?, source?.
 *  Source attribution uses the real <source> element rather than an
 *  encoding-description or a miscellaneous-field — it is the element MusicXML
 *  defines for exactly this, so importers surface it as the score's source. */
function identificationXml(composer: string, credits?: NCredits): string {
  const creator = (type: string, v?: string) =>
    v ? `<creator type="${type}">${escapeXml(v)}</creator>` : '';
  const composerName = credits?.composer ?? composer;
  return [
    `<creator type="composer">${escapeXml(composerName)}</creator>`,
    creator('arranger', credits?.arranger),
    creator('lyricist', credits?.lyricist),
    credits?.rights ? `<rights>${escapeXml(credits.rights)}</rights>` : '',
    '<encoding><software>Plajah Cora</software></encoding>',
    credits?.source ? `<source>${escapeXml(credits.source)}</source>` : '',
  ].join('');
}

export function notationToMusicXML(n: Notation, title: string, composer: string, credits?: NCredits): string {
  const parts = n.staves.map((s, i) => partXml(s, n, partIdOf(s, i))).join('\n');
  const partList = partListXml(n.staves);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <identification>${identificationXml(composer, credits)}</identification>
  <part-list>
${partList}
  </part-list>
${parts}
</score-partwise>`;
}

function escapeXml(s: string): string {
  return (s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}
