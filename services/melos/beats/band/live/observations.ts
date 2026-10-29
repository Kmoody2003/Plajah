// Chora Session Band live — what a character notices. An instrument lens watches the event stream
// and reports observations from one shared vocabulary (the ids in character sheets' reactions), with
// the numbers that back them up. The SOMA lens is the first: it reads hand-drum hits for where they
// land, how loud they are and how steady the time is. Pure — fed events, asked for observations.

import type { LiveEvent } from './events';

export interface Observation {
  id: string;
  /** Values for the line template ({count}, {bpm}, {zone}, …). */
  data: Record<string, string | number>;
  /** One sentence of plain fact for the AI mind ("12 strokes, all centre bass"). */
  fact: string;
}

export interface Lens {
  feed(e: LiveEvent): void;
  /** Observations true right now, given the time. The director handles cooldowns and priority. */
  observe(at: number): Observation[];
  /** A short summary of the recent playing for the AI mind's context. */
  summary(at: number): string;
  reset(): void;
}

export type SomaZone = 'bass' | 'tone' | 'slap' | 'muted';
const ZONE_WORD: Record<SomaZone, string> = { bass: 'centre bass', tone: 'open tone', slap: 'rim slap', muted: 'muted stroke' };

/** Where a SOMA hit lands: SOMA's striker 3 is the pressed (muted) hand; otherwise by radius. */
export function somaZone(pos = 0.6, striker = 1): SomaZone {
  if (Math.round(striker) === 3) return 'muted';
  if (pos < 0.3) return 'bass';
  if (pos < 0.72) return 'tone';
  return 'slap';
}

interface Hit { at: number; v: number; zone: SomaZone }

const WINDOW_MS = 20_000;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

export class SomaLens implements Lens {
  private hits: Hit[] = [];
  private params: number[] = [];
  private lastActivity = -Infinity;
  private totalHits = 0;
  private preset: { id: string; name: string; at: number } | null = null;
  private opened: number | null = null;

  feed(e: LiveEvent): void {
    if (e.instrument !== 'soma') return;
    if (e.kind === 'strike') {
      this.hits.push({ at: e.at, v: e.velocity, zone: somaZone(e.pos, e.striker) });
      this.totalHits++;
      this.lastActivity = e.at;
    } else if (e.kind === 'preset') {
      this.preset = { id: e.presetId, name: e.presetName, at: e.at };
      // A new drum is a fresh start for zone/dynamics habits, not for timing history.
      this.hits = this.hits.filter((h) => h.at > e.at);
      this.lastActivity = e.at;
    } else if (e.kind === 'param') {
      this.params.push(e.at);
      this.lastActivity = e.at;
    } else if (e.kind === 'open') {
      this.opened = e.at;
      this.lastActivity = e.at;
    }
  }

  private recent(at: number): Hit[] { return this.hits.filter((h) => at - h.at <= WINDOW_MS); }

  /** Inter-onset intervals of the latest run of playing (gaps over 1.5 s break the run). */
  private run(at: number): number[] {
    const hs = this.recent(at);
    const iois: number[] = [];
    for (let i = hs.length - 1; i > 0; i--) {
      const d = hs[i].at - hs[i - 1].at;
      if (d > 1500) break;
      if (d > 60) iois.unshift(d); // flams / near-simultaneous hits aren't beats
    }
    return iois;
  }

  observe(at: number): Observation[] {
    const out: Observation[] = [];
    if (this.opened !== null && at - this.opened < 4000) out.push({ id: 'session.hello', data: {}, fact: 'They just opened the instrument.' });
    if (this.preset && at - this.preset.at < 1500) {
      out.push({ id: 'preset.changed', data: { preset: this.preset.name }, fact: `They switched to the preset "${this.preset.name}".` });
    }
    if (this.totalHits === 1 && this.hits.length && at - this.hits[this.hits.length - 1].at < 3000) {
      out.push({ id: 'strike.first', data: {}, fact: 'They just played their first stroke.' });
    }

    const hs = this.recent(at);
    const last12 = hs.slice(-12);
    if (last12.length >= 10) {
      const zones = new Set(last12.map((h) => h.zone));
      if (zones.size === 1) {
        const z = last12[0].zone;
        out.push({ id: 'strike.zone.stuck', data: { zone: ZONE_WORD[z], count: last12.length }, fact: `Their last ${last12.length} strokes were all ${ZONE_WORD[z]}.` });
      } else if (zones.size >= 3) {
        out.push({ id: 'strike.variety', data: { count: zones.size }, fact: `They're using ${zones.size} different strokes.` });
      }
      const vs = last12.map((h) => h.v);
      const spread = Math.max(...vs) - Math.min(...vs);
      if (spread < 0.12) out.push({ id: 'strike.velocity.flat', data: { count: last12.length }, fact: `Their last ${last12.length} strokes were all about the same loudness.` });
      else if (spread > 0.45) out.push({ id: 'strike.velocity.wide', data: {}, fact: 'They\'re playing with a wide dynamic range.' });
    }

    const iois = this.run(at);
    if (iois.length >= 8) {
      const m = mean(iois);
      const cv = sd(iois) / m;
      const bpm = Math.round(60000 / m);
      // Compare the first and last thirds of the run for a tempo drift.
      const k = Math.max(2, Math.floor(iois.length / 3));
      const early = mean(iois.slice(0, k)), late = mean(iois.slice(-k));
      const drift = (late - early) / early;
      if (cv < 0.07 && Math.abs(drift) < 0.05) out.push({ id: 'groove.steady', data: { bpm }, fact: `Their time is steady at about ${bpm} BPM.` });
      else if (drift < -0.08) out.push({ id: 'groove.rushing', data: { bpm }, fact: `They're speeding up (about ${Math.round(60000 / early)} → ${Math.round(60000 / late)} BPM).` });
      else if (drift > 0.08) out.push({ id: 'groove.dragging', data: { bpm }, fact: `They're slowing down (about ${Math.round(60000 / early)} → ${Math.round(60000 / late)} BPM).` });
    }

    const recentParams = this.params.filter((t) => at - t < 15_000);
    if (recentParams.length >= 12) out.push({ id: 'param.tweaking', data: { count: recentParams.length }, fact: 'They\'re adjusting the drum\'s sound settings a lot.' });

    if (this.totalHits > 0 && at - this.lastActivity > 45_000 && at - this.lastActivity < 50_000) {
      out.push({ id: 'idle.long', data: {}, fact: 'They\'ve stopped playing for a while.' });
    }
    return out;
  }

  summary(at: number): string {
    const hs = this.recent(at);
    const parts: string[] = [];
    if (this.preset) parts.push(`SOMA preset "${this.preset.name}"`);
    if (hs.length) {
      const counts = new Map<SomaZone, number>();
      for (const h of hs) counts.set(h.zone, (counts.get(h.zone) ?? 0) + 1);
      parts.push(`${hs.length} strokes in the last 20 s (${[...counts].map(([z, n]) => `${n} ${ZONE_WORD[z]}`).join(', ')})`);
      const vs = hs.map((h) => h.v);
      parts.push(`velocity ${Math.round(Math.min(...vs) * 127)}–${Math.round(Math.max(...vs) * 127)}`);
      const iois = this.run(at);
      if (iois.length >= 4) parts.push(`about ${Math.round(60000 / mean(iois))} BPM, timing spread ${Math.round((sd(iois) / mean(iois)) * 100)}%`);
    } else parts.push('not playing right now');
    return parts.join('; ');
  }

  reset(): void { this.hits = []; this.params = []; this.totalHits = 0; this.preset = null; this.opened = null; this.lastActivity = -Infinity; }
}
