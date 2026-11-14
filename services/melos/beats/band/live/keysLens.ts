// What a keys player notices — the lens for pitched keyboard instruments (LYRA piano and tine
// electric piano first). It hears notes as you play them and reports, in the shared observation
// vocabulary plus a few keyboard ones:
//   keys.chord        — a chord it can name (e.g. "D minor 7"), once you've held it
//   keys.bark         — on the tine piano, playing hard enough that the pickup barks
//   keys.mud          — a close chord low down, where it turns to mud
//   keys.single-line  — a run of single notes (a melody or a line), no chords
//   strike.velocity.flat / .wide, groove.steady / .rushing / .dragging, param.tweaking, preset.changed,
//   session.hello, strike.first, idle.long — as for every instrument.
// Pure — fed events, asked for observations.

import type { LiveEvent } from './events';
import type { Lens, Observation } from './observations';
import { CHORDS } from '../../../theory';

const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const WINDOW_MS = 20_000;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

/** Name the chord in a set of keys (any inversion), e.g. "D minor 7". */
export function nameChord(keys: number[]): { name: string; symbol: string; rootPc: number } | null {
  const pcs = [...new Set(keys.map((k) => ((k % 12) + 12) % 12))];
  if (pcs.length < 3) return null;
  const bass = ((Math.min(...keys) % 12) + 12) % 12;
  // Prefer the reading whose root is in the bass, then any root.
  const roots = [bass, ...pcs.filter((p) => p !== bass)];
  for (const root of roots) {
    const rel = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b).join(',');
    const c = CHORDS.find((x) => [...new Set(x.intervals.map((i) => i % 12))].sort((a, b) => a - b).join(',') === rel);
    if (c) return { name: `${NOTE[root]} ${c.name.toLowerCase()}`, symbol: `${NOTE[root]}${c.symbol}`, rootPc: root };
  }
  return null;
}

interface Onset { at: number; key: number; v: number }

export class KeysLens implements Lens {
  private onsets: Onset[] = [];
  private held = new Map<number, number>(); // key → velocity
  private chord: { name: string; symbol: string; at: number; low: number; span: number } | null = null;
  private params: number[] = [];
  private total = 0;
  private lastActivity = -Infinity;
  private preset: { name: string; at: number } | null = null;
  private opened: number | null = null;

  /** @param instrument which instrument this lens hears (e.g. 'lyra'); `tine` = it's the tine piano (bark matters). */
  constructor(private instrument: string, public tine = false) {}

  feed(e: LiveEvent): void {
    if (e.instrument !== this.instrument) return;
    if (e.kind === 'note') {
      if (!e.on) { this.held.delete(e.key); return; }
      this.held.set(e.key, e.velocity);
      this.onsets.push({ at: e.at, key: e.key, v: e.velocity });
      this.total++;
      this.lastActivity = e.at;
      if (this.held.size >= 3) {
        const keys = [...this.held.keys()];
        const c = nameChord(keys);
        if (c && c.symbol !== this.chord?.symbol) this.chord = { ...c, at: e.at, low: Math.min(...keys), span: Math.max(...keys) - Math.min(...keys) };
      }
    } else if (e.kind === 'preset') { this.preset = { name: e.presetName, at: e.at }; this.lastActivity = e.at; }
    else if (e.kind === 'param') { this.params.push(e.at); this.lastActivity = e.at; }
    else if (e.kind === 'open') { this.opened = e.at; this.lastActivity = e.at; }
  }

  private recent(at: number) { return this.onsets.filter((o) => at - o.at <= WINDOW_MS); }

  /** Onset times of chords/notes as played events (notes within 40 ms are one event). */
  private events(at: number): Onset[] {
    const out: Onset[] = [];
    for (const o of this.recent(at)) if (!out.length || o.at - out[out.length - 1].at > 40) out.push(o);
    return out;
  }

  observe(at: number): Observation[] {
    const out: Observation[] = [];
    if (this.opened !== null && at - this.opened < 4000) out.push({ id: 'session.hello', data: {}, fact: 'They just opened the instrument.' });
    if (this.preset && at - this.preset.at < 1500) out.push({ id: 'preset.changed', data: { preset: this.preset.name }, fact: `They switched to "${this.preset.name}".` });
    if (this.total === 1 && at - this.lastActivity < 3000) out.push({ id: 'strike.first', data: {}, fact: 'They just played their first note.' });

    // A chord, once it has been held for a moment (not every passing voicing).
    // (Past the director's pause so it can actually say it; its cooldown stops repeats.)
    if (this.chord && at - this.chord.at > 1400 && this.held.size >= 3) {
      out.push({ id: 'keys.chord', data: { chord: this.chord.name, symbol: this.chord.symbol }, fact: `They're holding ${this.chord.name} (${this.chord.symbol}).` });
      if (this.chord.low < 48 && this.chord.span <= 12) out.push({ id: 'keys.mud', data: { chord: this.chord.name }, fact: `That ${this.chord.symbol} is a close voicing below C3, which gets muddy.` });
    }

    const rec = this.recent(at);
    const last = rec.slice(-12);
    if (last.length >= 10) {
      const vs = last.map((o) => o.v);
      const spread = Math.max(...vs) - Math.min(...vs);
      if (spread < 0.1) out.push({ id: 'strike.velocity.flat', data: { count: last.length }, fact: `Their last ${last.length} notes were all about the same loudness.` });
      else if (spread > 0.45) out.push({ id: 'strike.velocity.wide', data: {}, fact: 'They\'re playing with a wide dynamic range.' });
      if (this.tine && last.filter((o) => o.v > 0.85).length >= 6) out.push({ id: 'keys.bark', data: {}, fact: 'They\'re digging in hard on the tine piano — the pickup is barking.' });
      const evs = this.events(at).slice(-12);
      const chordy = evs.filter((ev) => rec.filter((o) => Math.abs(o.at - ev.at) <= 40).length >= 3).length;
      if (chordy === 0 && evs.length >= 8) out.push({ id: 'keys.single-line', data: { count: evs.length }, fact: 'They\'re playing a single-note line, no chords.' });
    }

    const evs = this.events(at);
    const iois: number[] = [];
    for (let i = evs.length - 1; i > 0; i--) { const d = evs[i].at - evs[i - 1].at; if (d > 1500) break; if (d > 80) iois.unshift(d); }
    if (iois.length >= 8) {
      const m = mean(iois), cv = sd(iois) / m, bpm = Math.round(60000 / m);
      const k = Math.max(2, Math.floor(iois.length / 3));
      const early = mean(iois.slice(0, k)), late = mean(iois.slice(-k)), drift = (late - early) / early;
      if (cv < 0.08 && Math.abs(drift) < 0.05) out.push({ id: 'groove.steady', data: { bpm }, fact: `Their time is steady at about ${bpm} BPM.` });
      else if (drift < -0.08) out.push({ id: 'groove.rushing', data: { bpm }, fact: 'They\'re speeding up.' });
      else if (drift > 0.08) out.push({ id: 'groove.dragging', data: { bpm }, fact: 'They\'re slowing down.' });
    }

    if (this.params.filter((t) => at - t < 15_000).length >= 12) out.push({ id: 'param.tweaking', data: {}, fact: 'They\'re shaping the sound a lot.' });
    if (this.total > 0 && at - this.lastActivity > 45_000 && at - this.lastActivity < 50_000) out.push({ id: 'idle.long', data: {}, fact: 'They\'ve stopped playing for a while.' });
    return out;
  }

  summary(at: number): string {
    const rec = this.recent(at);
    const parts: string[] = [];
    if (this.preset) parts.push(`preset "${this.preset.name}"`);
    if (rec.length) {
      parts.push(`${rec.length} notes in the last 20 s, range ${NOTE[Math.min(...rec.map((o) => o.key)) % 12]}–${NOTE[Math.max(...rec.map((o) => o.key)) % 12]}`);
      parts.push(`velocity ${Math.round(Math.min(...rec.map((o) => o.v)) * 127)}–${Math.round(Math.max(...rec.map((o) => o.v)) * 127)}`);
      if (this.chord) parts.push(`last chord ${this.chord.name}`);
    } else parts.push('not playing right now');
    return parts.join('; ');
  }

  reset(): void { this.onsets = []; this.held.clear(); this.chord = null; this.params = []; this.total = 0; this.preset = null; this.opened = null; this.lastActivity = -Infinity; }
}
