// Chora Session Band — the live session. While Chora's transport runs, the band plays: a bar is
// written a little before it arrives (so a direction lands on the next downbeat, like a real band),
// every note is queued on the song clock and handed to the engine just ahead of time (so stopping
// stops them), the loop wraps are followed, and every bar is kept as the take you can print to the
// timeline. Between phrases the players' personalities come and go, they talk back, and in
// teaching mode they explain what they just played.
//
// Engine-agnostic (BandClock + BandOutput) so it runs against the real engine in the app and a
// fake clock in the tests.

import type { GrooveDoc } from '../grooveDoc';
import { songTime } from '../tempoMap';
import { docKeyOrDefault } from '../songKey';
import { scalePitchClasses } from '../../theory';
import { BAND, playerById, type BandPlayer, type Persona } from './roster';
import { applyDirection, energyAt, newBandDirection, settleBuild, type BandDirection, type DirectionOutcome } from './direction';
import { genreById, type DrumVoice } from './styles';
import { hashSeed, playBar, rng, type BandHit, type BandNote, type BandShared, type BarFrame, type PlayedBar, type PlayerMemory } from './performer';
import { chordMap } from './chords';
import { answer, explainTrace, findLesson } from './teach';
import type { FrameChord } from './performer';

export interface BandClock {
  running(): boolean;
  /** Playhead in song beats. */
  pos(): number;
  /** Audio-clock now (seconds). */
  now(): number;
  /** A loop wrap that is scheduled but not reached yet: the clock jumps from `from` back to `to`. */
  wrap(): { from: number; to: number } | null;
  /** Audio time of a song beat; `previous` = on the segment before a pending wrap. */
  timeAt(beat: number, previous: boolean): number;
}
export interface BandOutput {
  note(playerId: string, n: BandNote, when: number, lenSec: number): void;
  hit(playerId: string, h: BandHit, when: number): void;
}

export type FeedKind = 'say' | 'ack' | 'persona' | 'teach' | 'answer' | 'band' | 'lesson';
export interface FeedEvent { id: number; kind: FeedKind; playerId?: string; text: string; bar: number; /** The personality they spoke in. */ persona?: string }

export interface TakeBar { bar: number; start: number; beats: number; played: Record<string, PlayedBar> }

const LOOK_SEC = 0.12;     // notes go to the engine this far ahead
const PLAN_SEC = 0.45;     // a bar is written this far before it starts
const PHRASE = 4;

export class BandSession {
  dir: BandDirection;
  /** The personality each player is in right now. */
  persona: Record<string, string> = {};
  mem: Record<string, PlayerMemory> = {};
  chart = '';
  teaching = false;
  /** Track ids the band owns (left out of the chord reading). */
  ownTracks: string[] = [];
  /** Every bar played, latest pass wins — the take. */
  take = new Map<number, TakeBar>();
  lastTrace: Record<string, string[]> = {};
  /** Live meter for the UI: last time each player sounded (audio time). */
  lastSound: Record<string, number> = {};
  private doc: GrooveDoc;
  private chords: { key: string; map: Map<number, FrameChord[]> } | null = null;
  private cursor: number | null = null;     // song beat of the next bar to write
  private pastWrap = false;                 // the cursor is already on the far side of a pending wrap
  private queue: { when: number; fire: () => void }[] = [];
  private listeners = new Set<(e: FeedEvent) => void>();
  private feedId = 0;
  private pass = 0;
  private lesson: { playerId: string; lessonId: string; step: number; nextBar: number } | null = null;
  private teachTurn = 0;

  constructor(doc: GrooveDoc, genre = 'pop', readonly seed = Date.now() % 100000) {
    this.doc = doc;
    this.dir = newBandDirection(genre);
    for (const p of BAND) { this.persona[p.id] = this.pickPersona(p, this.dir.energy, rng(hashSeed(p.id, seed))).id; this.mem[p.id] = {}; }
  }

  setDoc(doc: GrooveDoc): void { if (doc !== this.doc) { this.doc = doc; this.chords = null; } }
  onFeed(fn: (e: FeedEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(kind: FeedKind, text: string, playerId?: string, bar = this.currentBar()) {
    const p = playerId ? playerById(playerId) : undefined;
    const e: FeedEvent = { id: ++this.feedId, kind, text, playerId, bar, persona: p ? this.activePersona(p).name : undefined };
    for (const fn of this.listeners) fn(e);
  }
  currentBar(): number { return this.cursor === null ? 0 : songTime(this.doc).meter.at(Math.max(0, this.cursor)).bar; }
  activePersona(p: BandPlayer): Persona { return p.personas.find((x) => x.id === this.persona[p.id]) ?? p.personas[0]; }

  // ── direction ─────────────────────────────────────────────────────────────────────────────────
  /** The producer talks. Changes land on the next bar written. */
  direct(text: string): DirectionOutcome {
    const out = applyDirection(this.dir, text, this.currentBar() + 1);
    for (const n of out.notes) this.emit('band', n);
    // A band-wide call gets one line, not eleven replies — the players who stay or come in still answer.
    let acks = out.acks;
    if (acks.length > 4) {
      const byDid = new Map<string, string[]>();
      for (const a of acks) byDid.set(a.did, [...(byDid.get(a.did) ?? []), a.playerId]);
      const quiet = [...byDid.entries()].filter(([, ids]) => ids.length > 3);
      for (const [did, ids] of quiet) this.emit('band', `${ids.length} players ${did}.`);
      const loud = new Set(quiet.flatMap(([, ids]) => ids));
      acks = acks.filter((a) => !loud.has(a.playerId) || /staying in|coming in|solo|switching/.test(a.did));
    }
    for (const a of acks) {
      const p = playerById(a.playerId)!;
      // A pinned personality takes over right away.
      const pinned = this.dir.players[p.id].persona;
      if (pinned && pinned !== this.persona[p.id]) { this.persona[p.id] = pinned; this.emit('persona', `${this.activePersona(p).name}: ${pick(this.activePersona(p).lines.enter, this.feedId)}`, p.id); }
      this.emit('ack', `${pick(this.activePersona(p).lines.ack, this.feedId + p.id.length)} (${a.did})`, p.id);
    }
    if (out.question) {
      const a = answer(out.question.text, out.question.playerId, this.lastTrace);
      this.emit('answer', a.text + (a.also ? `\n\n${a.also}` : ''), a.playerId);
    }
    if (out.lesson) this.startLesson(out.lesson.words, out.lesson.playerId);
    if (!out.understood) this.emit('band', `Not sure what to do with "${text}" — try "lay back", "take a solo", "make it funk", "build over 8 bars", or ask a question.`);
    return out;
  }

  startLesson(words: string, playerId?: string, lessonId?: string): void {
    const found = lessonId && playerId ? { player: playerById(playerId)!, lesson: playerById(playerId)!.lessons.find((l) => l.id === lessonId)! } : findLesson(words, playerId);
    if (!found?.lesson) { this.emit('band', 'No lesson by that name yet — pick one from the lesson list.'); return; }
    this.lesson = { playerId: found.player.id, lessonId: found.lesson.id, step: 0, nextBar: this.currentBar() };
    this.emit('lesson', `${found.lesson.title} — ${found.lesson.summary}`, found.player.id);
    this.advanceLesson(true);
  }
  /** Next step of the running lesson (also called every phrase while one runs). */
  advanceLesson(now = false): void {
    const l = this.lesson;
    if (!l) return;
    const p = playerById(l.playerId)!;
    const lesson = p.lessons.find((x) => x.id === l.lessonId)!;
    const step = lesson.steps[l.step];
    if (!step) { this.emit('lesson', 'That\'s the lesson. Ask me anything about it — or try it yourself on an armed track.', p.id); this.lesson = null; return; }
    if (step.direct) applyDirection(this.dir, step.direct, this.currentBar() + 1);
    for (const q of BAND) { const pin = this.dir.players[q.id].persona; if (pin) this.persona[q.id] = pin; }
    this.emit('lesson', step.say, p.id);
    l.step++;
    l.nextBar = this.currentBar() + (now ? PHRASE : PHRASE * 2);
  }
  stopLesson(): void { this.lesson = null; }
  lessonRunning(): boolean { return !!this.lesson; }

  // ── the bandstand ─────────────────────────────────────────────────────────────────────────────
  private pickPersona(p: BandPlayer, energy: number, r: () => number): Persona {
    const pinned = this.dir?.players[p.id]?.persona;
    if (pinned) return p.personas.find((x) => x.id === pinned) ?? p.personas[0];
    const genre = this.dir?.genre ?? 'pop';
    let best = p.personas[0], bestS = -Infinity;
    for (const x of p.personas) {
      let s = r() * 1.6;                                   // spontaneity: the other sides show up
      if (x.affinity.genres?.includes(genre)) s += 2;
      const [lo, hi] = x.affinity.energy ?? [0, 1];
      if (energy >= lo && energy <= hi) s += 1; else s -= Math.min(Math.abs(energy - lo), Math.abs(energy - hi)) * 3;
      if (x.id === this.persona[p.id]) s += 1.1;           // they settle into a side for a while
      if (s > bestS) { bestS = s; best = x; }
    }
    return best;
  }

  private frameFor(bar: number, start: number, beats: number, chords: Map<number, FrameChord[]>): BarFrame {
    const key = docKeyOrDefault(this.doc);
    const scale = scalePitchClasses(key.tonic, key.scale);
    const loop = this.doc.loop?.on ? this.doc.loop : null;
    const { meter } = songTime(this.doc);
    const phraseStart = loop ? meter.at(loop.startBeats).bar : 0;
    const fallback = [{ at: 0, beats, pcs: [key.tonic, (key.tonic + (scale[(key.tonic + 3) % 12] && !scale[(key.tonic + 4) % 12] ? 3 : 4)) % 12, (key.tonic + 7) % 12] }];
    const cs = (chords.get(bar) ?? fallback).map((c) => ({ ...c, beats: Math.min(c.beats, beats - c.at) })).filter((c) => c.beats > 0);
    const nextBar = loop && start + beats >= loop.endBeats - 1e-6 ? meter.at(loop.startBeats).bar : bar + 1;
    return {
      bar, beats, chords: cs.length ? cs : fallback,
      next: (chords.get(nextBar) ?? fallback)[0].pcs,
      keyPc: key.tonic, scale, minor: !!scale[(key.tonic + 3) % 12] && !scale[(key.tonic + 4) % 12],
      phrasePos: ((bar - phraseStart) % PHRASE + PHRASE) % PHRASE, phraseLen: PHRASE,
      genre: genreById(this.dir.genre), energy: energyAt(this.dir, bar), breakdown: this.dir.breakdown,
      seed: this.seed + this.pass * 7919,
    };
  }

  private chordsAround(bar: number): Map<number, FrameChord[]> {
    const loop = this.doc.loop?.on ? this.doc.loop : null;
    const { meter } = songTime(this.doc);
    const from = loop ? meter.at(loop.startBeats).bar : Math.max(0, bar - (bar % 16));
    const to = loop ? Math.max(from + 1, meter.at(Math.max(loop.startBeats, loop.endBeats - 1e-6)).bar + 1) : from + 17;
    const key = `${from}:${to}:${this.chart}:${this.ownTracks.join()}`;
    if (!this.chords || this.chords.key !== key || (!loop && !this.chords.map.has(bar))) {
      this.chords = { key, map: chordMap(this.doc, from, to, { chart: this.chart || undefined, exclude: this.ownTracks }) };
    }
    return this.chords.map;
  }

  /** Write one bar for the whole band (band order: drums first, so the bass can lock to the kick). */
  performBar(bar: number): TakeBar {
    const { meter } = songTime(this.doc);
    const start = meter.barToBeat(bar);
    const beats = meter.at(start).lenBeats;
    const chords = this.chordsAround(bar);
    const f = this.frameFor(bar, start, beats, chords);
    settleBuild(this.dir, bar);
    if (f.phrasePos === 0) this.phraseTurn(f);
    const soloist = BAND.find((p) => this.dir.players[p.id].in && this.dir.players[p.id].feature)?.id;
    const shared: BandShared = { kicks: [], soloist, padding: false };
    const played: Record<string, PlayedBar> = {};
    for (const p of BAND) {
      const out = playBar({ player: p, persona: this.activePersona(p), dir: this.dir.players[p.id], cue: this.dir.cues[p.id], mem: this.mem[p.id] }, f, shared);
      played[p.id] = out;
      if (this.dir.players[p.id].in) this.lastTrace[p.id] = out.trace;
    }
    this.dir.cues = {};
    const tb = { bar, start, beats, played };
    this.take.set(bar, tb);
    return tb;
  }

  /** At the top of each phrase: personalities shift, someone talks, the teacher explains, lessons move on. */
  private phraseTurn(f: BarFrame): void {
    const r = rng(hashSeed('phrase', f.bar, f.seed));
    for (const p of BAND) {
      const before = this.persona[p.id];
      const next = this.pickPersona(p, f.energy, r);
      this.persona[p.id] = next.id;
      if (next.id !== before && this.dir.players[p.id].in) this.emit('persona', `${next.name}: ${pick(next.lines.enter, f.bar)}`, p.id, f.bar);
    }
    const inBand = BAND.filter((p) => this.dir.players[p.id].in);
    if (this.teaching && inBand.length) {
      const p = inBand[this.teachTurn++ % inBand.length];
      const moves = explainTrace(this.lastTrace[p.id] ?? [], 1);
      if (moves.length) this.emit('teach', moves[0], p.id, f.bar);
    } else if (inBand.length && r() < 0.3) {
      const p = inBand[Math.floor(r() * inBand.length)];
      this.emit('say', pick(this.activePersona(p).lines.groove, f.bar), p.id, f.bar);
    }
    if (this.lesson && f.bar >= this.lesson.nextBar) this.advanceLesson();
  }

  // ── live ──────────────────────────────────────────────────────────────────────────────────────
  /** Call every ~25 ms while the transport may be running. */
  tick(clock: BandClock, out: BandOutput): void {
    if (!clock.running()) { this.cursor = null; this.queue = []; this.pastWrap = false; return; }
    const { meter } = songTime(this.doc);
    const pos = clock.pos();
    const loop = this.doc.loop?.on ? this.doc.loop : null;
    if (this.cursor === null) {
      const b = meter.at(Math.max(0, pos));
      this.cursor = b.beatInBar < 0.05 ? b.startBeat : b.startBeat + b.lenBeats;
    }
    // Seek / restart: the playhead jumped away from where the band thought it was.
    const wrap = clock.wrap();
    if (!wrap) this.pastWrap = false;
    if (!wrap && (pos > this.cursor + 0.5 || pos < this.cursor - meter.at(Math.max(0, this.cursor - 1e-6)).lenBeats * 2 - 0.5)) {
      const b = meter.at(Math.max(0, pos));
      this.cursor = b.beatInBar < 0.05 ? b.startBeat : b.startBeat + b.lenBeats;
      this.queue = [];
    }
    for (let guard = 0; guard < 4; guard++) {
      let previous = false;
      if (loop && this.cursor >= loop.endBeats - 1e-6) {
        if (!wrap) break;                                 // wait for the engine to schedule the wrap
        this.cursor = meter.at(loop.startBeats).startBeat;
        this.pass++;
        this.pastWrap = true;
      } else if (wrap && !this.pastWrap && this.cursor < wrap.from - 1e-6) previous = true;
      if (clock.timeAt(this.cursor, previous) - clock.now() > PLAN_SEC) break;
      const tb = this.performBar(meter.at(this.cursor).bar);
      this.enqueue(tb, clock, out, previous, loop?.endBeats);
      this.cursor = tb.start + tb.beats;
    }
    // Hand what's due to the engine.
    const horizon = clock.now() + LOOK_SEC;
    this.queue.sort((a, b) => a.when - b.when);
    let n = 0;
    while (n < this.queue.length && this.queue[n].when <= horizon) n++;
    for (const e of this.queue.splice(0, n)) e.fire();
  }

  private enqueue(tb: TakeBar, clock: BandClock, out: BandOutput, previous: boolean, loopEnd?: number): void {
    const now = clock.now();
    for (const [pid, pb] of Object.entries(tb.played)) {
      for (const n of pb.notes) {
        const beat = tb.start + n.at;
        const endBeat = Math.min(beat + n.len, loopEnd ?? Infinity);
        if (endBeat <= beat) continue;
        const when = clock.timeAt(beat, previous);
        if (when < now - 0.01) continue;
        const lenSec = clock.timeAt(endBeat, previous) - when;
        this.queue.push({ when, fire: () => { this.lastSound[pid] = when; out.note(pid, n, when, lenSec); } });
      }
      for (const h of pb.hits) {
        const when = clock.timeAt(tb.start + h.at, previous);
        if (when < now - 0.01) continue;
        this.queue.push({ when, fire: () => { this.lastSound[pid] = when; out.hit(pid, h, when); } });
      }
    }
  }

  /** Forget the take (a fresh one starts with the next bar). */
  clearTake(): void { this.take.clear(); }

  /** Write a whole region without playing it (bars [fromBar, toBar)) — returned as a take. */
  writeRegion(fromBar: number, toBar: number): TakeBar[] {
    const bars: TakeBar[] = [];
    this.pass++;
    for (let b = fromBar; b < toBar; b++) bars.push(this.performBar(b));
    return bars;
  }
}

function pick<T>(xs: T[], salt: number | string): T {
  const h = typeof salt === 'number' ? salt : hashSeed(salt);
  return xs[Math.abs(h) % xs.length];
}

export type { DrumVoice };
