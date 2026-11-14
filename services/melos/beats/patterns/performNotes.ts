// Play written notes like a musician — the pitched-part counterpart to the drum and hand-drum
// performers. Generated MIDI (basslines, chord progressions, council and AI parts, showcase scores)
// comes out on the grid at one velocity; this gives it the feel of the band member who'd play it:
//   · bass — sits in the pocket a hair behind, roots on strong beats lean in, notes articulate
//     instead of smearing into the next;
//   · chords (keys / guitar / comping) — a slight roll from the bottom up, the top voice sung
//     out over the inner voices, accents from the beat;
//   · lead (melody / solo) — phrases shaped: rise toward the peak note, ease off at the end,
//     long notes held into the next (legato) with a little vibrato on held tones;
//   · pad — gentle, even, swelling on long notes;
//   · arp — steady, accents on the beat, light scatter.
// The persona's traits (roster.ts) set how loose, how far behind or ahead, how dynamic. Notes that
// are already off the grid (played, recorded, imported or already humanized) are left alone.
// Deterministic for a seed. Pure.

import type { GrooveDoc, MeloNote, NoteEvent, Pattern } from '../grooveDoc';
import { humanizeDrumPattern } from './humanizeDrums';
import { BAND, type Persona, type PersonaTraits } from '../band/roster';

export type PartRole = 'bass' | 'chords' | 'lead' | 'pad' | 'arp';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, q = 1000) => Math.round(v * q) / q;

/** Is this part still on the grid (as written by a generator) — i.e. not yet played? */
export function isOnGrid(notes: { startBeats: number }[], grid = 0.25): boolean {
  return notes.every((n) => Math.abs(n.startBeats / grid - Math.round(n.startBeats / grid)) < 1e-3);
}

/** What kind of part this is, from its notes. */
export function guessPartRole(notes: NoteEvent[], name = ''): PartRole {
  const nm = name.toLowerCase();
  if (/bass|bajo|808|sub\b/.test(nm)) return 'bass';
  if (/arp/.test(nm)) return 'arp';
  if (/pad|strings|choir|drone|ison|cantus/.test(nm)) return 'pad';
  if (!notes.length) return 'lead';
  const byStart = new Map<number, number>();
  for (const n of notes) byStart.set(round(n.startBeats, 64), (byStart.get(round(n.startBeats, 64)) ?? 0) + 1);
  const chordy = [...byStart.values()].filter((c) => c >= 3).length / byStart.size;
  const avgKey = notes.reduce((a, n) => a + n.key, 0) / notes.length;
  const avgLen = notes.reduce((a, n) => a + n.lengthBeats, 0) / notes.length;
  if (chordy > 0.4) return avgLen >= 2 ? 'pad' : 'chords';
  if (avgKey < 50) return 'bass';
  return 'lead';
}

/** The band member who'd play a part on this instrument (by track/preset name, then role). */
export function playerForPart(name: string, role: PartRole): string {
  const nm = name.toLowerCase();
  const by: [RegExp, string][] = [
    [/guitar|nylon|strat|tele|jazzmaster/, 'rosa'], [/rhodes|tine|wurli|piano|keys|grand|upright|clav/, 'theo'],
    [/organ|hammond|vox|farfisa/, 'hez'], [/violin|fiddle/, 'priya'], [/cello/, 'ingrid'],
    [/trumpet|brass|horn|cornet|flugel|trombone/, 'corny'], [/sax/, 'lena'],
    [/flute|clarinet|whistle|wind|oboe|reed|pneuma/, 'felix'], [/orchestra|strings|ensemble|choir|vela/, 'elena'],
    [/synth|onda|aura|lead|pluck/, 'nova'], [/bass|bajo|808/, 'dwayne'],
  ];
  for (const [re, id] of by) if (re.test(nm)) return id;
  return role === 'bass' ? 'dwayne' : role === 'pad' ? 'elena' : role === 'lead' ? 'nova' : 'theo';
}

/** That player's side for a genre (their persona's affinity), else their first. */
export function personaFor(playerId: string, genre?: string): Persona {
  const p = BAND.find((x) => x.id === playerId) ?? BAND[0];
  if (genre) {
    const g = genre.toLowerCase().replace(/[^a-z]/g, '');
    const hit = p.personas.find((x) => x.affinity.genres?.some((a) => g.includes(a) || a.includes(g)));
    if (hit) return hit;
  }
  return p.personas[0];
}

export interface PerformNotesOpts { role: PartRole; traits: PersonaTraits; seed: number; beatsPerBar?: number }

/** Play a clip's notes. Returns new notes; leaves the input untouched. */
export function performClipNotes(notes: NoteEvent[], o: PerformNotesOpts): NoteEvent[] {
  if (!notes.length) return notes;
  const rand = rng(o.seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const t = o.traits;
  const bpb = o.beatsPerBar ?? 4;
  const loose = 1 - clamp(t.tightness, 0, 1);
  const dyn = clamp(t.dynamics, 0, 1);
  const sorted = [...notes].sort((a, b) => a.startBeats - b.startBeats || a.key - b.key);

  // Chords: notes that start together.
  const groups = new Map<number, NoteEvent[]>();
  for (const n of sorted) { const k = round(n.startBeats, 64); (groups.get(k) || groups.set(k, []).get(k)!).push(n); }
  const starts = [...groups.keys()].sort((a, b) => a - b);

  // Lead phrasing: each two-bar phrase rises to its highest note and eases off after it.
  const phraseLen = bpb * 2;
  const peakOf = new Map<number, number>();
  if (o.role === 'lead') for (const n of sorted) { const ph = Math.floor(n.startBeats / phraseLen); peakOf.set(ph, Math.max(peakOf.get(ph) ?? 0, n.key)); }

  const out: NoteEvent[] = [];
  starts.forEach((s, gi) => {
    const chord = groups.get(s)!;
    const next = starts[gi + 1];
    const inBar = ((s % bpb) + bpb) % bpb;
    const accent = inBar < 1e-3 ? 1 : Math.abs(inBar - Math.round(inBar)) < 1e-3 ? 0.5 : 0.1;
    const pocket = t.pocket + (o.role === 'bass' ? 0.008 : o.role === 'lead' ? -0.004 * accent : 0);
    const groupShift = pocket + gauss() * loose * (o.role === 'pad' ? 0.01 : 0.022);
    // Rolled chords: a few ms from the bottom note up, wider for looser, busier players.
    const roll = o.role === 'chords' ? 0.006 + 0.012 * t.complexity : o.role === 'pad' ? 0.004 : 0;
    const top = Math.max(...chord.map((n) => n.key));
    chord.forEach((n, vi) => {
      let v = n.vel;
      v *= 1 + (accent - 0.4) * 0.14 * (0.5 + dyn);
      if (o.role === 'chords' || o.role === 'pad') v *= n.key === top ? 1.08 : chord.length > 2 && vi > 0 ? 0.93 : 1;
      if (o.role === 'lead') {
        const ph = Math.floor(n.startBeats / phraseLen);
        const peak = peakOf.get(ph) ?? n.key;
        v *= 0.9 + 0.16 * clamp(1 - (peak - n.key) / 12, 0, 1) + 0.04 * clamp(n.lengthBeats - 0.5, 0, 1);
      }
      if (o.role === 'pad') v = n.vel + (v - n.vel) * 0.5;
      v += gauss() * loose * (o.role === 'pad' ? 4 : 9);

      let len = n.lengthBeats;
      if (next !== undefined) {
        const gap = next - n.startBeats;
        if (o.role === 'bass' && len >= gap - 0.01) len = Math.max(0.1, gap - 0.04 - loose * 0.03); // articulate
        if (o.role === 'lead' && gap > len && gap - len < 0.26 && t.space < 0.5) len = gap + 0.02; // legato
      }
      const note: NoteEvent = { ...n, startBeats: round(Math.max(0, n.startBeats + groupShift + roll * vi)), lengthBeats: round(Math.max(0.05, len)), vel: Math.round(clamp(v, 1, 127)) };
      // Held lead notes and pads breathe.
      if ((o.role === 'lead' && len >= 1) || (o.role === 'pad' && len >= 2)) {
        note.expr = {
          ...(n.expr ?? {}),
          swellShape: n.expr?.swellShape ?? (o.role === 'pad' ? 'hairpin' : 'sustained'),
          ...(o.role === 'lead' && n.expr?.vibratoDepth === undefined ? { vibratoDepth: round(0.12 + 0.12 * dyn, 100), vibratoDelay01: 0.35 } : {}),
        };
      }
      out.push(note);
    });
  });
  return out;
}

/** Play a MEKA piano-roll lane (16th steps) — the same feel expressed as micro-timing and velocity. */
export function performMeloLane(lane: Record<number, MeloNote[]>, o: PerformNotesOpts): Record<number, MeloNote[]> {
  const notes: NoteEvent[] = [];
  const back = new Map<NoteEvent, { step: number }>();
  for (const [stepKey, chord] of Object.entries(lane)) {
    for (const m of chord) {
      const n: NoteEvent = { id: '', startBeats: Number(stepKey) / 4 + (m.micro ?? 0) / 4, lengthBeats: m.len / 4, key: 60 + m.semi, vel: m.v };
      notes.push(n);
      back.set(n, { step: Number(stepKey) });
    }
  }
  if (!isOnGrid(notes)) return lane;
  const played = performClipNotes(notes, o);
  const out: Record<number, MeloNote[]> = {};
  for (const n of played) {
    const at = n.startBeats * 4;
    let step = Math.round(at);
    let micro = round(at - step);
    if (micro > 0.45) { step++; micro -= 1; } else if (micro < -0.45) { step--; micro += 1; }
    step = Math.max(0, step);
    const m: MeloNote = { semi: n.key - 60, v: n.vel, len: Math.max(1, Math.round(n.lengthBeats * 4)) };
    if (Math.abs(micro) > 1e-3) m.micro = clamp(micro, -0.45, 0.45);
    (out[step] || (out[step] = [])).push(m);
  }
  return out;
}

/** Play every on-grid pitched lane of a MEKA pattern (pad index → instrument/track name for the player). */
export function performPatternMelo(p: Pattern, padName: (padIdx: number) => string, seed: number, genre?: string): void {
  if (!p.melo) return;
  for (const [padKey, lane] of Object.entries(p.melo)) {
    const flat: NoteEvent[] = Object.entries(lane).flatMap(([s, ch]) => ch.map((m) => ({ id: '', startBeats: Number(s) / 4, lengthBeats: m.len / 4, key: 60 + m.semi, vel: m.v })));
    const name = padName(Number(padKey));
    const role = guessPartRole(flat, name);
    p.melo[Number(padKey)] = performMeloLane(lane, { role, traits: personaFor(playerForPart(name, role), genre).traits, seed: seed + Number(padKey) });
  }
}

/**
 * Play a whole project's generated parts (e.g. a showcase template): every on-grid instrument clip
 * by the player its track suggests, every on-grid piano-roll lane, and drum rows that have no feel
 * yet (feel only — same length, no fills). Mutates the doc.
 */
export function performDoc(doc: GrooveDoc, seed: number, genre?: string): void {
  doc.arrangement.forEach((track, ti) => {
    if (track.kind !== 'instrument') return;
    const name = `${track.name} ${track.instrument?.presetName ?? ''} ${track.instrument?.type ?? ''}`;
    track.clips.forEach((clip, ci) => {
      if (!clip.notes?.length || !isOnGrid(clip.notes)) return;
      const role = guessPartRole(clip.notes, name);
      clip.notes = performClipNotes(clip.notes, { role, traits: personaFor(playerForPart(name, role), genre).traits, seed: seed + ti * 101 + ci });
    });
  });
  const drummer = personaFor('marcus', genre).traits;
  doc.patterns.forEach((p, pi) => {
    performPatternMelo(p, (i) => doc.kit[i]?.name ?? '', seed + pi * 7, genre);
    const hits = Object.values(p.steps).flatMap((row) => Object.values(row));
    if (hits.length && !hits.some((h) => h.micro)) p.steps = humanizeDrumPattern(p, drummer, seed + pi, 1, false).steps;
  });
}
