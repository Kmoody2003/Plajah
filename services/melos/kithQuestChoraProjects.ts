// Kith Quest score in Chora Studio — one project per cue (data/gameScores/kithQuest.ts). Like the Era Clash cues,
// the project IS the cue: the game plays a bounce of exactly this document (kithquest-score-lab.html →
// scripts/games/buildKithQuestAudio.ts), and "Open in Chora" builds a fresh copy of it.
//
// Every part is an instrument track on the timeline (the lullabies are waltzes, so the project carries a 3/4
// meter and nothing lives on the 4/4 pad grid):
//   LYRA   harp, silk strings, string quartet, cello, double bass, pizzicato, flute, alto flute, clarinet, oboe,
//          bassoon, French horn, trumpet, trombone, concert violin, viola, felt piano
//   (no bell-type voices — celesta, bells, struck glass, glass choir — Kenne heard them as a metallic sheen)
//   VELA   choir, tremolo strings
//   SOMA   timpani (tuned to each bar's root), gran cassa, concert snare, bodhrán, bendir, deep tar (the heartbeat);
//          the frame drums are played with sticks/beaters here (hand map off), so a key is a stroke at pitch
// The generative side: Chora's ARP device plays the title harp and the energy harp from held chords (scale-locked,
// Euclidean accents, seeded); Humanize note FX on the harps and the oboe answers; modulators sweep the ARP pans and swell the
// tremolo; and the Session Band performs every written part (performDoc) so phrasing, timing and dynamics are played,
// not quantized. Two send returns: FX 1 a Spaces hall (per cue), FX 2 a dotted-eighth delay for the sparkles.
//
// Pure: no engine, no DOM.

import { defaultSendBuses, emptyPad, type ArrangeTrack, type GrooveDoc, type NoteEvent, type TimelineClip, type TrackAutomationLane } from './beats/grooveDoc';
import { performDoc } from './beats/patterns/performNotes';
import type { Modulator, ModTarget } from './beats/modulators';
import { defaultArpPatch, defaultStep, euclidean, type ArpPatch } from './arp';
import { SOMA_PRESETS } from './instruments/soma/presets';
import { newSomaPatch, serializeSomaPatch } from './instruments/soma/patch';
import { serializeTonosPatch, tonosPatchFor } from './instruments/tonos/patch';
import { tonosPresetById } from './instruments/tonos/presets';
import { COLORS, V, clamp, fx, patchFor, presetName, seedOf, somaName, type EraClashProjectInfo } from './eraClashChoraProjects';
import { QUEST_CUES, barVoicings, parseLine, type Cue, type CuePart } from '../../data/gameScores/kithQuest';

export const KITH_QUEST_PREFIX = 'kithquest-';
/** Bars of silence after the body so the last notes ring out (the build wraps them onto the loop start). */
export const KITH_QUEST_TAIL_BARS = 2;

const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const keyName = (c: Cue) => `${KEY_NAMES[c.tonicPc]} ${c.scale}`;

export interface KithQuestProjectInfo extends EraClashProjectInfo { loop: boolean }

export function kithQuestProjects(): KithQuestProjectInfo[] {
  return QUEST_CUES.map((c) => ({
    id: KITH_QUEST_PREFIX + c.id, cueId: c.id, title: `Kith Quest — ${c.title}`, era: 'Kith Quest', blurb: c.blurb, bpm: c.bpm,
    key: keyName(c), bars: c.chords.length, durationSec: Math.round(c.chords.length * c.beats * 60 / c.bpm), loop: c.loop,
    soma: c.parts.filter((p) => p.inst === 'soma').map((p) => `${p.label} (${somaName(p.preset)})`).filter((x, i, a) => a.indexOf(x) === i),
    instruments: c.parts.filter((p) => p.inst !== 'soma').map((p) => `${p.inst.toUpperCase()} ${presetName(V(p.inst, p.preset, p.label, 0))} as ${p.label}`),
  }));
}

export const isKithQuestProjectId = (id: unknown): id is string =>
  typeof id === 'string' && QUEST_CUES.some((c) => KITH_QUEST_PREFIX + c.id === id);

/* ── Notes from the score ─────────────────────────────────────────────────────────────────── */

interface Seg { at: number; len: number; v: number[]; bar: number }

/** Every chord segment of the body with its voicing (two chords in a bar share it). */
function segments(c: Cue): Seg[] {
  const out: Seg[] = [];
  c.chords.forEach((field, bar) => {
    const vs = barVoicings(field), len = c.beats / vs.length;
    vs.forEach((v, i) => out.push({ at: bar * c.beats + i * len, len, v, bar }));
  });
  return out;
}

const inBars = (p: CuePart, bar: number) => !p.bars || p.bars.some(([a, z]) => bar >= a && bar < z);
/** Where a bar sits inside its active range (for ramps and `every`). */
function rangePos(p: CuePart, bar: number, totalBars: number): { idx: number; frac: number } {
  const r = p.bars?.find(([a, z]) => bar >= a && bar < z) ?? [0, totalBars];
  return { idx: bar - r[0], frac: r[1] - r[0] > 1 ? (bar - r[0]) / (r[1] - r[0] - 1) : 1 };
}

function noteVel(c: Cue, p: CuePart, beat: number, totalBars: number, accent = true): number {
  const bar = Math.floor(beat / c.beats + 1e-6);
  const base = p.vel ?? 80;
  const ramp = p.ramp ? p.ramp[0] + (p.ramp[1] - p.ramp[0]) * rangePos(p, bar, totalBars).frac : 1;
  const inBar = beat - bar * c.beats;
  const acc = !accent ? 0 : Math.abs(inBar) < 1e-6 ? 6 : Math.abs(inBar % 1) < 1e-6 ? 2 : 0;
  return Math.round(clamp(base * ramp + acc, 12, 127));
}

/** Timpani pitch for a chord root: the nearest one to the drum's own C3. */
function timpKey(root: number, fifth: boolean): number {
  let k = 48 + (((root % 12) - 0 + 12) % 12);
  if (k > 54) k -= 12;
  if (fifth) { k += 7; if (k > 55) k -= 12; }
  return k;
}

/* ── The string choir: chords as four voice-led lines ─────────────────────────────────────── *
 * Every chord segment is voiced for Violins I / Violins II / Violas / Celli (the basses take the root) by searching
 * every spacing in each section's range for the one that covers the chord (root, 3rd, 7th first) with the least
 * motion from the last chord: no crossed voices, no gap over an octave between the upper three, parallel fifths and
 * octaves penalised. A voice that would step down into its new note from a dissonance holds it first (the 4–3, 9–8
 * suspensions), and a held pitch is tied across the bar instead of re-bowed. */
const DIVISI_RANGE: [number, number][] = [[67, 88], [62, 81], [55, 74], [43, 64]];
/** Where each section sings best (violins high and open, celli in their tenor): the search leans toward these. */
const DIVISI_HOME = [79, 72, 64, 53];
interface DivNote { t: number; d: number; key: number }
const divisiCache = new Map<string, DivNote[][]>();
export function divisiLines(c: Cue): DivNote[][] {
  const hit = divisiCache.get(c.id);
  if (hit) return hit;
  const segs = segments(c);
  const lines: DivNote[][] = [[], [], [], []];
  let prev: number[] | null = null;
  for (const s of segs) {
    const pcs = [...new Set(s.v.map((k) => ((k % 12) + 12) % 12))];
    const root = ((s.v[0] % 12) + 12) % 12;
    const third = pcs.find((x) => [3, 4].includes((x - root + 12) % 12));
    const seventh = pcs.find((x) => [10, 11].includes((x - root + 12) % 12));
    const cands = DIVISI_RANGE.map(([lo, hi]) => { const o: number[] = []; for (let k = lo; k <= hi; k++) if (pcs.includes(k % 12)) o.push(k); return o; });
    let best: number[] = [], bestCost = Infinity;
    for (const a of cands[0]) for (const b of cands[1]) {
      if (b >= a || a - b > 12) continue;
      for (const v of cands[2]) {
        if (v >= b || b - v > 12) continue;
        for (const ce of cands[3]) {
          if (ce >= v || v - ce > 19) continue;
          const voicing = [a, b, v, ce], have = new Set(voicing.map((k) => k % 12));
          let cost = 0;
          if (third !== undefined && !have.has(third)) cost += 40;
          if (seventh !== undefined && !have.has(seventh)) cost += 14;
          if (!have.has(root)) cost += 18;
          cost += (4 - have.size) * 6; // prefer every chord tone sounding
          if (prev) {
            for (let i = 0; i < 4; i++) cost += Math.abs(voicing[i] - prev[i]) * (i === 0 ? 1.4 : 1);
            for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
              const was = (prev[i] - prev[j]) % 12, now = (voicing[i] - voicing[j]) % 12;
              if (was === now && (now === 7 || now === 0) && voicing[i] !== prev[i]) cost += 30;
            }
          }
          for (let i = 0; i < 4; i++) cost += Math.abs(voicing[i] - DIVISI_HOME[i]) * 0.45;
          if (cost < bestCost) { bestCost = cost; best = voicing; }
        }
      }
    }
    if (!best.length) best = prev ?? [76, 69, 62, 50];
    for (let i = 0; i < 4; i++) {
      const line = lines[i], n = best[i], last = line[line.length - 1];
      const p = prev?.[i];
      // suspension: the old note a step above the new one, not in the new chord → hold it, then resolve
      if (p !== undefined && p - n >= 1 && p - n <= 2 && !pcs.includes(p % 12) && s.len >= 2) {
        const hold = s.len >= 3 ? 1 : s.len / 2;
        if (last && last.key === p && Math.abs(last.t + last.d - s.at) < 1e-6) last.d += hold; else line.push({ t: s.at, d: hold, key: p });
        line.push({ t: s.at + hold, d: s.len - hold, key: n });
      } else if (last && last.key === n && Math.abs(last.t + last.d - s.at) < 1e-6) last.d += s.len; // tie
      else line.push({ t: s.at, d: s.len, key: n });
    }
    prev = best;
  }
  divisiCache.set(c.id, lines);
  return lines;
}

/** Volume automation for a part: written dynamics (`dyn`) and/or breathing swells, in dB around the track's gain. */
function dynamicsLane(c: Cue, p: CuePart, trackId: string): TrackAutomationLane | null {
  if (!p.dyn && !p.swell) return null;
  const base = p.gainDb ?? -10, bars = c.chords.length, pts = new Map<number, number>();
  const dynAt = (bar: number) => {
    const d = p.dyn;
    if (!d?.length) return 0;
    if (bar <= d[0][0]) return d[0][1];
    for (let i = 1; i < d.length; i++) if (bar <= d[i][0]) { const f = (bar - d[i - 1][0]) / (d[i][0] - d[i - 1][0]); return d[i - 1][1] + (d[i][1] - d[i - 1][1]) * f; }
    return d[d.length - 1][1];
  };
  const swellAt = (bar: number) => {
    if (!p.swell) return 0;
    const f = (bar % p.swell.bars) / p.swell.bars; // 0 → 1 over the phrase: rise to 60 %, ease back
    const g = f < 0.6 ? Math.sin((f / 0.6) * Math.PI / 2) : Math.cos(((f - 0.6) / 0.4) * Math.PI / 2) * 0.55 + 0.45;
    return -p.swell.depth * (1 - g);
  };
  const step = p.swell ? Math.max(0.25, p.swell.bars / 8) : 1;
  for (let bar = 0; bar <= bars + 1e-6; bar += step) pts.set(+(bar * c.beats).toFixed(4), base + dynAt(bar) + swellAt(bar));
  for (const [b] of p.dyn ?? []) pts.set(b * c.beats, base + dynAt(b) + swellAt(b));
  return { id: `${trackId}_dyn`, target: { kind: 'volume' }, points: [...pts.entries()].sort((a, b) => a[0] - b[0]).map(([beat, value]) => ({ beat, value: +clamp(value, -60, 6).toFixed(2), curve: 'smooth' as const })) };
}

function partNotes(c: Cue, p: CuePart): NoteEvent[] {
  const bars = c.chords.length, oct = p.oct ?? 0, out: NoteEvent[] = [];
  const add = (t: number, d: number, key: number, vel?: number) => {
    const bar = Math.floor(t / c.beats + 1e-6);
    if (!inBars(p, bar)) return;
    out.push({ id: '', startBeats: +t.toFixed(4), lengthBeats: +Math.max(0.0625, d).toFixed(4), key: clamp(key, 21, 108), vel: vel ?? noteVel(c, p, t, bars) });
  };
  const written = p.src === 'melody' ? c.melody : p.src === 'counter' ? c.counter : p.src === 'bass' ? c.bass : p.src === 'line' ? p.line : undefined;
  if (written !== undefined) {
    for (const e of parseLine(written)) for (const k of e.keys) add(e.t, e.d, k + oct);
    return out;
  }
  if (p.src === 'divisi') {
    for (const n of divisiLines(c)[p.voice ?? 0]) add(n.t, n.d, n.key + oct);
    return out;
  }
  const segs = segments(c), gate = p.gate ?? 1;
  const barOk = (bar: number) => inBars(p, bar) && rangePos(p, bar, bars).idx % (p.every ?? 1) === 0;
  if (p.src === 'drum' || p.src === 'timp') {
    const width = c.beats * 4, line = (p.line ?? 'X').padEnd(width, '-');
    const home = SOMA_PRESETS.find((x) => x.id === p.preset)?.defaultNote ?? 48;
    const VEL: Record<string, number> = { X: 1.12, x: 0.92, o: 0.68, '.': 0.42, f: 0.95 };
    for (let bar = 0; bar < bars; bar++) {
      if (!barOk(bar)) continue;
      const { idx } = rangePos(p, bar, bars), seg = segs.find((s) => s.bar === bar)!;
      for (let i = 0; i < width; i++) {
        const ch = line[(idx * width + i) % line.length];
        const m = VEL[ch];
        if (!m) continue;
        const t = bar * c.beats + i / 4;
        const key = p.src === 'timp' ? timpKey(seg.v[0], ch === 'f') : home;
        add(t, p.src === 'timp' ? 1 : 0.25, key, Math.round(clamp(noteVel(c, p, t, bars, false) * m, 12, 127)));
      }
    }
    return out;
  }
  for (const s of segs) {
    if (!barOk(s.bar)) continue;
    const v = s.v.map((k) => k + oct);
    switch (p.src) {
      case 'pad': case 'arp': for (const k of v) add(s.at, s.len, k); break;
      case 'root': add(s.at, s.len * gate, v[0]); break;
      case 'stab': for (const k of v) add(s.at, Math.min(s.len, 1) * gate * 3, k); break;
      case 'harp': {
        const arp = [...v, v[1] + 12, v[2] + 12], order = [0, 2, 1, 3, 4, 2, 5, 3];
        for (let k = 0; k * 0.5 < s.len - 1e-6; k++) add(s.at + k * 0.5, 1.5, arp[order[k % order.length] % arp.length], noteVel(c, p, s.at + k * 0.5, bars) - (k ? 6 : 0));
        break;
      }
      case 'spic': {
        const pat = [v[0], v[2], v[0] + 12, v[2], v[1], v[2]];
        for (let k = 0; k * 0.5 < s.len - 1e-6; k++) add(s.at + k * 0.5, 0.5 * gate, pat[k % pat.length], noteVel(c, p, s.at + k * 0.5, bars) - (k % 2 ? 10 : 0));
        break;
      }
      case 'pizz': for (let k = 0; k < s.len - 1e-6; k++) add(s.at + k, 0.5, k % 2 ? v[2] : v[0]); break;
      case 'tick': for (let k = 0; k * 0.5 < s.len - 1e-6; k++) add(s.at + k * 0.5, 0.5 * gate, v[0] + (k % 2), noteVel(c, p, s.at + k * 0.5, bars) - (k % 2 ? 8 : 0)); break;
    }
  }
  return out;
}

/* ── Tracks ───────────────────────────────────────────────────────────────────────────────── */

function clipsFor(c: Cue, trackId: string, notes: NoteEvent[], color: string): TimelineClip[] {
  const clips: TimelineClip[] = [];
  for (const [name, from, to] of c.sections) {
    const start = from * c.beats, end = to * c.beats;
    const inside = notes.filter((n) => n.startBeats >= start - 1e-6 && n.startBeats < end - 1e-6);
    if (!inside.length) continue;
    clips.push({
      id: `${trackId}_${from}`, name, startBeats: start, lengthBeats: end - start, color,
      notes: inside.map((n, i) => ({ ...n, id: `${trackId}_${from}_${i}`, startBeats: +(n.startBeats - start).toFixed(4) })),
    });
  }
  return clips;
}

function arpFor(c: Cue, p: CuePart): ArpPatch {
  const a = p.arp!;
  const length = Math.min(16, c.beats * a.rate);
  const acc = euclidean(length, Math.min(length, a.accents), 0);
  return {
    ...defaultArpPatch(), enabled: true, order: a.order, rate: a.rate, octaves: a.octaves, gate: 0.6, length,
    steps: acc.map((on) => ({ ...defaultStep(), velocity: on ? 108 : 70 })),
    scale: { rootPc: c.tonicPc, scaleId: c.scale, enabled: true },
    seed: seedOf(`kithquest:${c.id}:${p.key}:arp`),
  };
}

function somaPatch(p: CuePart, id: string): Record<string, unknown> {
  const preset = SOMA_PRESETS.find((x) => x.id === p.preset);
  if (!preset) throw new Error(`kithQuest: unknown SOMA preset ${p.preset}`);
  return serializeSomaPatch({ ...newSomaPatch(preset), id, hand: { enabled: false, layout: 'keys' as const } });
}

/** A TONOS world-string patch (the instrument as its preset builds and plays it). */
function tonosPatch(p: CuePart, id: string): Record<string, unknown> {
  if (!tonosPresetById(p.preset)) throw new Error(`kithQuest: unknown TONOS preset ${p.preset}`);
  return { ...serializeTonosPatch(tonosPatchFor(p.preset)), id };
}

function modulator(id: string, label: string, target: ModTarget, min: number, max: number, wave: string, syncBeats: number): Modulator {
  return { id, on: true, label, target, min, max, wave, syncBeats, rateHz: 0.5, phase: 0, probability: 1, rest: 0.5, randomness: 0, curve: 'linear', curveAmt: 0.5, seed: seedOf(id) };
}

/* ── The project ──────────────────────────────────────────────────────────────────────────── */

export function buildKithQuestGrooveDoc(cueOrProjectId: string, ownerId = 'kithquest-showcase'): GrooveDoc {
  const cueId = cueOrProjectId.startsWith(KITH_QUEST_PREFIX) ? cueOrProjectId.slice(KITH_QUEST_PREFIX.length) : cueOrProjectId;
  const c = QUEST_CUES.find((x) => x.id === cueId);
  if (!c) throw new Error(`Unknown Kith Quest cue: ${cueOrProjectId}`);
  const tag = `kq_${c.id.replace(/[^a-z0-9]/gi, '')}`;
  const now = Date.now();
  const bodyBeats = c.chords.length * c.beats;
  const echoMs = Math.round(60000 / c.bpm * 0.75);
  const doc: GrooveDoc = {
    id: `kithquest_${c.id}`, name: `Kith Quest · ${c.title}`, ownerId, bpm: c.bpm, swing: 0,
    key: { tonic: c.tonicPc, scale: c.scale }, kit: Array.from({ length: 32 }, (_, i) => ({ ...emptyPad(i), id: `${tag}_pad_${i}` })),
    patterns: [], scenes: [], sections: [], groupMeta: [{ name: 'Group A (empty: every part is on the timeline)', color: '#555555' }],
    modulators: [], arrangement: [],
    mixer: {
      groups: [0, 1, 2, 3].map(() => ({ gainDb: 0, mute: false, solo: false })),
      sendBuses: defaultSendBuses().map((b, i) => (i === 0
        ? { ...b, name: 'Hall', inserts: [{ id: `${tag}_fx_hall`, type: 'spaces', on: true, params: { irMode: 0, irIndex: 0, space: c.space, size: 1, damp: 0.25, preDelay: 22, width: 100, mix: 100 } }] }
        : { ...b, name: 'Echo', gainDb: -4, inserts: [{ id: `${tag}_fx_echo`, type: 'delay', on: true, params: { time: echoMs, feedback: 32, tone: 4500, spread: 30, wetGain: 0, mix: 100 } }] })),
      master: { gainDb: 0, limiterOn: true },
    },
    version: 1, createdAt: now, updatedAt: now,
  };
  if (c.beats === 3) doc.meter = [{ bar: 0, num: 3, den: 4 }];
  if (c.loop) doc.loop = { on: true, startBeats: 0, endBeats: bodyBeats };

  for (const p of c.parts) {
    const notes = partNotes(c, p);
    if (!notes.length) continue;
    const trackId = `${tag}_trk_${p.key}`;
    const color = COLORS[p.inst];
    const pan = p.pan ?? 0;
    const t: ArrangeTrack = {
      id: trackId, kind: 'instrument', name: `${p.label} · ${p.inst.toUpperCase()}`, color, mute: false, solo: false,
      gainDb: p.gainDb ?? -10, pan, clips: clipsFor(c, trackId, notes, color), armed: false, position: [pan, 0.1, -0.9],
      sends: [p.hall ?? 0.3, p.echo ?? 0],
      instrument: p.inst === 'soma'
        ? { type: 'soma', patch: somaPatch(p, `${trackId}_patch`), presetName: somaName(p.preset) }
        : p.inst === 'tonos'
          ? { type: 'tonos', patch: tonosPatch(p, `${trackId}_patch`), presetName: tonosPresetById(p.preset)!.name }
          : { type: p.inst, patch: { ...patchFor(V(p.inst, p.preset, p.label, 0)), id: `${trackId}_patch` }, presetName: presetName(V(p.inst, p.preset, p.label, 0)) },
    };
    const lane = dynamicsLane(c, p, trackId);
    if (lane) t.automationLanes = [lane];
    if (p.src === 'arp') t.instrument!.arp = arpFor(c, p) as unknown as Record<string, unknown>;
    if (p.src === 'harp' || p.key === 'cel' || p.key === 'answer') t.instrument!.noteFx = [fx('humanize', `${tag}_nfx_${p.key}`, { timing: 0.01, vel: 8, len: 0.08 })];
    doc.arrangement.push(t);
  }
  // the tail: an empty clip so the bounce runs on while everything rings out
  const first = doc.arrangement[0];
  if (first) first.clips.push({ id: `${first.id}_tail`, name: 'Tail (ring-out)', startBeats: bodyBeats, lengthBeats: KITH_QUEST_TAIL_BARS * c.beats, color: '#444444', notes: [] });

  const mods: Modulator[] = [];
  for (const t of doc.arrangement) {
    if (t.instrument?.arp) mods.push(modulator(`${t.id}_mod_pan`, `Pan — ${t.name}`, { kind: 'track', trackId: t.id, target: { kind: 'pan' } }, -0.45, 0.45, 'sine', c.beats * 4));
    if (/Tremolo|hushed/.test(t.name)) mods.push(modulator(`${t.id}_mod_swell`, `Swell — ${t.name}`, { kind: 'track', trackId: t.id, target: { kind: 'mod-wheel' } }, 0.25, 0.85, 'sine', c.beats * 2));
  }
  doc.modulators = mods;
  performDoc(doc, seedOf(`kithquest:${c.id}`), 'cinematic');
  return doc;
}

export function kithQuestProjectCopy(projectId: string, ownerId: string): GrooveDoc {
  const doc = buildKithQuestGrooveDoc(projectId, ownerId);
  const now = Date.now();
  doc.id = `${doc.id}_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  doc.createdAt = now; doc.updatedAt = now;
  return doc;
}
