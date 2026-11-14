// Melos Beats — the composer council's shared core: the shape of a take, the validator that makes
// any writer's notes safe to drop into the doc, the critic's checks (range, key, clashes with what's
// already playing, doubling, words vs notes) and the apply step that lands a take on the timeline.
//
// Everything runs on the user's own machine (localCouncil.ts): rules write bass / harmony / pads /
// arps (rulesArranger.ts), an on-device model or the studio's local score models write melodies
// (noteLines.ts), and the critic repairs what they get wrong (councilRepair.ts). No cloud model.

import type { ArrangeTrack, GrooveDoc, NoteEvent, TimelineClip } from '../grooveDoc';
import { songTime } from '../tempoMap';
import { guessPartRole, isOnGrid, performClipNotes, personaFor, playerForPart } from '../patterns/performNotes';
import { seedOf } from '../patterns/handDrumPerformer';
import {
  COUNCIL_INSTRUMENTS, PART_ROLES, syllables,
  type ComposeContext, type ComposeRequest, type CouncilInstrument, type CtxNote, type PartRole,
} from './composeContext';
import { midiToName, nameToPc } from '../../theory';

export interface ComposedNote { start: number; length: number; pitch: number; velocity: number }
export interface ComposedPart {
  /** A requested target: an existing track id, or "new:<index into request.targets>". */
  target: string;
  name: string;
  role: PartRole;
  instrument: CouncilInstrument;
  intent: string;
  notes: ComposedNote[];
}
export interface Composition {
  /** The Producer's reading of the request — what this take is going for. */
  brief: string;
  /** The Lyric reader's notes (imagery, arc, stresses → contour). Empty without lyrics. */
  lyricReading: string;
  parts: ComposedPart[];
  /** The Critic's honest self-check (and, after revision, which findings were kept and why). */
  critique: string;
}

/** Comfortable MIDI range per role (lyrics make the melody a SUNG line: a real voice's range). */
export const ROLE_RANGE: Record<PartRole, [number, number]> = {
  melody: [55, 88],
  'counter-melody': [50, 86],
  harmony: [43, 84],
  bass: [28, 60],
  pad: [40, 86],
  arp: [48, 96],
  fill: [36, 96],
};
const SUNG_RANGE: [number, number] = [48, 79];

const GRID = 12;                                   // 1/12 beat: 16ths and triplets both land
const q = (x: number) => Math.round(x * GRID) / GRID;
const MAX_NOTES = 4000;

export interface CouncilIssue { target: string; message: string }

/** Validate + normalise the council's JSON: known targets, quantized in-region notes, no overlaps. */
export function validateComposition(raw: unknown, ctx: ComposeContext): Composition {
  const c = raw as Partial<Composition> | null;
  if (!c || typeof c !== 'object' || !Array.isArray(c.parts)) throw new Error('The council returned no parts');
  const regionLen = ctx.region.beats;
  const allowed = new Set(ctx.request.targets.map((t, i) => t.trackId ?? `new:${i}`));
  const seen = new Set<string>();
  const parts: ComposedPart[] = [];
  for (const p of c.parts) {
    if (!p || typeof p.target !== 'string' || !allowed.has(p.target) || seen.has(p.target)) continue;
    const role = (PART_ROLES as readonly string[]).includes(p.role) ? p.role : ctx.request.targets.find((t, i) => (t.trackId ?? `new:${i}`) === p.target)!.role;
    const instrument = (COUNCIL_INSTRUMENTS as readonly string[]).includes(p.instrument) ? p.instrument : 'onda';
    const notes: ComposedNote[] = [];
    for (const n of Array.isArray(p.notes) ? p.notes : []) {
      if (!n || ![n.start, n.length, n.pitch, n.velocity].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      const start = q(n.start);
      if (start < 0 || start >= regionLen - 1e-6) continue;
      const length = Math.max(1 / GRID, Math.min(q(n.length), q(regionLen - start)));
      const pitch = Math.round(n.pitch);
      if (pitch < 0 || pitch > 127) continue;
      notes.push({ start, length, pitch, velocity: Math.max(1, Math.min(127, Math.round(n.velocity))) });
    }
    notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    // Same pitch overlapping itself: shorten the earlier note (a synth can't hold one key twice).
    const lastByPitch = new Map<number, ComposedNote>();
    const clean: ComposedNote[] = [];
    for (const n of notes) {
      const prev = lastByPitch.get(n.pitch);
      if (prev && prev.start === n.start) continue;
      if (prev && prev.start + prev.length > n.start) prev.length = Math.max(1 / GRID, n.start - prev.start);
      lastByPitch.set(n.pitch, n);
      clean.push(n);
    }
    if (!clean.length) continue;
    seen.add(p.target);
    parts.push({
      target: p.target, name: String(p.name || role).slice(0, 60), role: role as PartRole,
      instrument: instrument as CouncilInstrument, intent: String(p.intent ?? '').slice(0, 400), notes: clean.slice(0, MAX_NOTES),
    });
  }
  if (!parts.length) throw new Error('The council returned no usable notes for the requested parts');
  return {
    brief: String(c.brief ?? '').slice(0, 2000),
    lyricReading: String(c.lyricReading ?? '').slice(0, 3000),
    critique: String(c.critique ?? '').slice(0, 3000),
    parts,
  };
}

const posLabel = (ctx: ComposeContext, beat: number) => {
  let bar = ctx.bars[0];
  for (const b of ctx.bars) if (b.at <= beat + 1e-6) bar = b;
  const into = Math.round((beat - bar.at) * 100) / 100;
  return `bar ${bar.bar} beat ${Math.floor(into) + 1}${into % 1 ? `+${Math.round((into % 1) * 100) / 100}` : ''}`;
};

/** The Critic's automated checks. Each finding is phrased so the revision pass can act on it. */
export function critiqueComposition(comp: Composition, ctx: ComposeContext): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const keyPcs = (() => {
    if (!ctx.song.scaleTones) return null;
    return new Set(ctx.song.scaleTones.split(' ').map((n) => nameToPc(n)));
  })();
  const others = ctx.tracks.filter((t) => t.kind === 'instrument' && !t.target && !t.councilTake && t.notes?.length);
  const regionLyrics = ctx.lyrics.filter((l) => l.inRegion);

  for (const part of comp.parts) {
    const id = part.target;
    const notes = part.notes;
    const sung = (part.role === 'melody') && regionLyrics.length > 0;
    const [lo, hi] = sung ? SUNG_RANGE : ROLE_RANGE[part.role];

    // 1. Range.
    const out = notes.filter((n) => n.pitch < lo || n.pitch > hi);
    if (out.length) {
      const ex = out.slice(0, 3).map((n) => `${midiToName(n.pitch)} at ${posLabel(ctx, n.start)}`).join(', ');
      issues.push({ target: id, message: `${out.length} note${out.length > 1 ? 's' : ''} outside the ${sung ? 'singable' : part.role} range ${midiToName(lo)}–${midiToName(hi)} (${ex}).` });
    }

    // 2. Key.
    if (keyPcs) {
      const outside = notes.filter((n) => !keyPcs.has(n.pitch % 12));
      if (outside.length / notes.length > 0.25) {
        issues.push({ target: id, message: `${Math.round((outside.length / notes.length) * 100)}% of the notes are outside ${ctx.song.key} — make sure the chromaticism is deliberate.` });
      }
    }

    // 3. Clashes: a minor second / minor ninth against a note another track holds, on a strong beat.
    const clashes: string[] = [];
    for (const n of notes) {
      const bar = [...ctx.bars].reverse().find((b) => b.at <= n.start + 1e-6);
      const strong = bar ? Math.abs(((n.start - bar.at) % 1)) < 1e-6 : true;
      if (!strong) continue;
      for (const t of others) {
        const hit = t.notes!.find((o) => o[0] <= n.start + 1e-6 && o[0] + o[1] > n.start + 0.25 && n.length >= 0.5
          && [1, 11].includes(Math.abs(o[2] - n.pitch) % 12) && Math.abs(o[2] - n.pitch) < 24);
        if (hit) { clashes.push(`${midiToName(n.pitch)} against ${t.name}'s ${midiToName(hit[2])} at ${posLabel(ctx, n.start)}`); break; }
      }
    }
    if (clashes.length >= 3) {
      issues.push({ target: id, message: `${clashes.length} sustained minor-second rubs on strong beats (${clashes.slice(0, 3).join('; ')}).` });
    }

    // 4. Doubling an existing line instead of adding to it.
    if (part.role !== 'harmony' && part.role !== 'pad') {
      for (const t of others) {
        const same = notes.filter((n) => t.notes!.some((o) => o[2] === n.pitch && o[0] <= n.start + 1e-3 && o[0] + o[1] > n.start + 1e-3)).length;
        if (notes.length >= 4 && same / notes.length > 0.5) {
          issues.push({ target: id, message: `${Math.round((same / notes.length) * 100)}% of the notes double ${t.name} (the same pitch while it sounds) — it should add something.` });
          break;
        }
      }
    }

    // 5. Words vs notes for a sung melody: roughly a note per syllable, line by line.
    if (sung) {
      const lines = ctx.lyrics.filter((l) => l.inRegion);
      for (let i = 0; i < lines.length; i++) {
        const from = ctx.bars.find((b) => b.bar === lines[i].bar)?.at ?? 0;
        const nextBar = ctx.lyrics.find((l) => l.bar > lines[i].bar)?.bar;
        const to = nextBar ? (ctx.bars.find((b) => b.bar === nextBar)?.at ?? ctx.region.beats) : ctx.region.beats;
        const want = syllables(lines[i].text);
        const got = notes.filter((n) => n.start >= from - 1e-6 && n.start < to - 1e-6).length;
        if (got < Math.floor(want * 0.7)) {
          issues.push({ target: id, message: `"${lines[i].text}" (bar ${lines[i].bar}) has ~${want} syllables but the melody gives it ${got} note${got === 1 ? '' : 's'}.` });
        } else if (got > want * 2.5 + 2) {
          issues.push({ target: id, message: `"${lines[i].text}" (bar ${lines[i].bar}) has ~${want} syllables but ${got} notes — too busy to sing.` });
        }
      }
    }

    // 6. Fills the region (except a fill), and dynamics.
    if (part.role !== 'fill') {
      const covered = notes.reduce((s, n) => s + n.length, 0);
      const span = notes.length ? Math.max(...notes.map((n) => n.start + n.length)) - notes[0].start : 0;
      if (span < ctx.region.beats * 0.5 && covered < ctx.region.beats * 0.4) {
        issues.push({ target: id, message: `the part only spans ${Math.round(span * 10) / 10} of ${ctx.region.beats} beats — it should carry the whole region.` });
      }
    }
    if (notes.length >= 8 && new Set(notes.map((n) => n.velocity)).size === 1) {
      issues.push({ target: id, message: 'every note has the same velocity — shape the dynamics with the phrase.' });
    }
  }
  for (const [i, t] of ctx.request.targets.entries()) {
    const id = t.trackId ?? `new:${i}`;
    if (!comp.parts.some((p) => p.target === id)) issues.push({ target: id, message: 'no part was written for this target.' });
  }
  return issues;
}

export interface ApplyOptions {
  uid: () => string;
  /** Make a new instrument track (the caller owns instrument factories). Returns it, already pushed. */
  createTrack: (doc: GrooveDoc, instrument: CouncilInstrument, name: string, after?: ArrangeTrack) => ArrangeTrack;
  /** "A", "B", … — names the clips and any take tracks. */
  takeLabel: string;
  /** Provenance badge on the clips (which writer made the take). */
  engineTag?: string;
}

/**
 * Land a take on the timeline. A rewrite goes onto its own track when that track is free over the
 * region; otherwise it gets a take track right under it (same instrument) so nothing is overwritten.
 * New parts get new tracks. Returns the ids of the tracks written to.
 */
export function applyComposition(doc: GrooveDoc, ctx: ComposeContext, comp: Composition, opts: ApplyOptions): string[] {
  const start = ctx.request.startBeats;
  const len = ctx.request.endBeats - start;
  const written: string[] = [];
  for (const part of comp.parts) {
    let track: ArrangeTrack | undefined;
    const existing = doc.arrangement.find((t) => t.id === part.target);
    if (existing) {
      const busy = existing.clips.some((c) => c.startBeats < start + len - 1e-6 && c.startBeats + c.lengthBeats > start + 1e-6);
      if (!busy) track = existing;
      else {
        track = opts.createTrack(doc, (existing.instrument?.type ?? part.instrument) as CouncilInstrument, `${existing.name} · take ${opts.takeLabel}`, existing);
        if (existing.instrument) track.instrument = JSON.parse(JSON.stringify(existing.instrument));
        track.color = existing.color;
      }
    } else {
      track = opts.createTrack(doc, part.instrument, `${part.name} · ${opts.takeLabel}`);
    }
    const raw: NoteEvent[] = part.notes.map((n) => ({ id: opts.uid(), startBeats: n.start, lengthBeats: n.length, key: n.pitch, vel: n.velocity }));
    // A composed part comes out on the grid; the band member who plays that instrument plays it.
    const who = `${part.name} ${part.instrument}`;
    const role = guessPartRole(raw, who);
    const notes = isOnGrid(raw) ? performClipNotes(raw, { role, traits: personaFor(playerForPart(who, role)).traits, seed: seedOf(`${part.name}${start}`) }) : raw;
    const clip: TimelineClip = { id: opts.uid(), startBeats: start, lengthBeats: len, name: `Council ${opts.takeLabel} · ${part.name}`, notes, generativeEngine: opts.engineTag ?? 'local-council' };
    track.clips.push(clip);
    written.push(track.id);
  }
  return written;
}

/** Bars of a region for display ("bars 5–8"). */
export function regionLabel(doc: GrooveDoc, startBeats: number, endBeats: number): string {
  const { meter } = songTime(doc);
  const a = meter.at(Math.max(0, startBeats)).bar + 1, b = meter.at(Math.max(startBeats, endBeats - 1e-6)).bar + 1;
  return a === b ? `bar ${a}` : `bars ${a}–${b}`;
}

/** Re-export for callers that only import the council. */
export type { ComposeContext, ComposeRequest };
