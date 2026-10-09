// emoteEngine — the pure logic of live emotes (no DOM, no Firestore; unit-tested).
//
//   parseEmoteText     chat text → text + emote segments (`:fire:`), jumbo detection
//   emoteQueryAt       the `:fi` being typed at the caret, for autocomplete
//   TapBatcher         press-and-hold → one write per window carrying n taps (TikTok-style tapping
//                      without a Firestore write per tap)
//   TokenBucket        per-viewer send limit
//   ChorusDetector     the same emote from many DIFFERENT people inside a few seconds → tiers 1..3
//   CrowdLight         every emote's gel feeds a decaying light mix → one colour + intensity the
//                      broadcast rim light (and optionally the creator's real room lights) follow
//   canUseEmote        access tiers for channel emotes

import type { EmoteAccess, EmoteDef } from './emoteTypes';

// ── chat text ────────────────────────────────────────────────────────────────────────────────────
export type EmoteSegment = { t: 'text'; v: string } | { t: 'emote'; e: EmoteDef; code: string };

const CODE_RE = /:([a-z0-9_]{1,32}):/gi;

/** Split chat text into text + emote segments. Unknown `:codes:` stay as text. */
export function parseEmoteText(text: string, resolve: (code: string) => EmoteDef | null): EmoteSegment[] {
  const out: EmoteSegment[] = [];
  let last = 0;
  CODE_RE.lastIndex = 0;
  for (let m = CODE_RE.exec(text); m; m = CODE_RE.exec(text)) {
    const e = resolve(m[1].toLowerCase());
    if (!e) { CODE_RE.lastIndex = m.index + 1; continue; }   // allow ":a:fire:" → text ":a" + fire
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: 'emote', e, code: m[1].toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/** A message made only of emotes (and whitespace) renders "jumbo", and passes emote-only mode. */
export function isEmoteOnly(segs: EmoteSegment[]): boolean {
  let n = 0;
  for (const s of segs) {
    if (s.t === 'emote') n++;
    else if (s.v.trim()) return false;
  }
  return n > 0;
}

/** The partial code being typed at `caret` (`"gg :fi|"` → "fi"), or null. Needs ≥ 2 chars. */
export function emoteQueryAt(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s):([a-z0-9_]{2,32})$/i.exec(before);
  return m ? { query: m[2].toLowerCase(), start: caret - m[2].length - 1 } : null;
}

/** Replace the `:partial` at the caret with `:code: `. Returns the new text + caret. */
export function completeEmote(text: string, caret: number, code: string): { text: string; caret: number } {
  const q = emoteQueryAt(text, caret);
  const start = q ? q.start : caret;
  const ins = `:${code}: `;
  return { text: text.slice(0, start) + ins + text.slice(caret), caret: start + ins.length };
}

// ── sending ──────────────────────────────────────────────────────────────────────────────────────
/** Collects taps per emote and flushes one event per window. A first tap flushes after `windowMs`. */
export class TapBatcher {
  private counts = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private flush: (emoteId: string, n: number) => void,
    private windowMs = 650,
    private maxPerEvent = 30,
    private schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  ) {}
  tap(emoteId: string, n = 1) {
    this.counts.set(emoteId, Math.min(this.maxPerEvent, (this.counts.get(emoteId) ?? 0) + n));
    if (!this.timer) this.timer = this.schedule(() => this.drain(), this.windowMs);
  }
  drain() {
    this.timer = null;
    const batch = [...this.counts];
    this.counts.clear();
    for (const [id, n] of batch) this.flush(id, n);
  }
  pending(emoteId: string) { return this.counts.get(emoteId) ?? 0; }
}

/** Classic token bucket. `take()` → false when the viewer is sending too fast. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private capacity = 6, private refillPerSec = 2.5, now = Date.now()) { this.tokens = capacity; this.last = now; }
  take(now = Date.now(), cost = 1): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

// ── chorus ───────────────────────────────────────────────────────────────────────────────────────
export interface ChorusHit { emoteId: string; tier: 1 | 2 | 3; count: number }

export interface ChorusOptions {
  windowMs?: number;
  /** Distinct senders needed for tiers 1/2/3 before audience scaling. */
  base?: [number, number, number];
  /** Fraction of the current audience that also has to join (so a 2,000-viewer stream needs more). */
  audienceFrac?: [number, number, number];
  /** After a tier-3, that emote can't chorus again for this long. */
  cooldownMs?: number;
}

/**
 * A chorus is the same emote from many DIFFERENT people at once — one person holding the button
 * can't start one. Taps (n) don't count, senders do. Tiers fire once each as they're crossed.
 */
export class ChorusDetector {
  private seen = new Map<string, Map<string, number>>();   // emoteId → uid → last ts
  private tierHit = new Map<string, number>();              // emoteId → highest tier fired in this wave
  private cooldown = new Map<string, number>();
  private o: Required<ChorusOptions>;
  audience = 0;
  constructor(o: ChorusOptions = {}) {
    this.o = { windowMs: 5000, base: [3, 8, 18], audienceFrac: [0.02, 0.06, 0.15], cooldownMs: 20000, ...o };
  }
  thresholds(): [number, number, number] {
    const a = Math.max(0, this.audience);
    return this.o.base.map((b, i) => Math.max(b, Math.ceil(a * this.o.audienceFrac[i]))) as [number, number, number];
  }
  add(emoteId: string, uid: string, now = Date.now()): ChorusHit | null {
    if ((this.cooldown.get(emoteId) ?? 0) > now) return null;
    let m = this.seen.get(emoteId);
    if (!m) this.seen.set(emoteId, (m = new Map()));
    m.set(uid, now);
    for (const [u, ts] of m) if (now - ts > this.o.windowMs) m.delete(u);
    const count = m.size;
    if (count < 2) this.tierHit.delete(emoteId);   // the wave died down; new wave
    const th = this.thresholds();
    const tier = count >= th[2] ? 3 : count >= th[1] ? 2 : count >= th[0] ? 1 : 0;
    const prev = this.tierHit.get(emoteId) ?? 0;
    if (tier <= prev) return null;
    this.tierHit.set(emoteId, tier);
    if (tier === 3) { this.cooldown.set(emoteId, now + this.o.cooldownMs); this.seen.delete(emoteId); this.tierHit.delete(emoteId); }
    return { emoteId, tier: tier as 1 | 2 | 3, count };
  }
}

// ── crowd light ──────────────────────────────────────────────────────────────────────────────────
export interface CrowdLightState { hex: string; rgb: [number, number, number]; intensity: number; dominant: string | null }

/**
 * Each emote adds its gel to a light mix that decays with a half-life. The output is the weighted
 * colour (mixed in linear-ish RGB with saturation preserved) and an intensity that rises with the
 * crowd's activity, eased so it breathes rather than flickers. No strobing by construction: the
 * intensity can only move as fast as `attack` / `release` allow.
 */
export class CrowdLight {
  private w = new Map<string, number>();          // gel hex → weight
  private level = 0;
  constructor(private halfLifeS = 3, private fullAt = 14, private attack = 2.2, private release = 0.8) {}
  add(gel: string, n = 1) {
    const k = gel.toLowerCase();
    this.w.set(k, (this.w.get(k) ?? 0) + Math.min(6, 1 + Math.log2(Math.max(1, n))));
  }
  /** Advance by dt seconds and read the light. */
  step(dt: number): CrowdLightState {
    const decay = Math.pow(0.5, dt / this.halfLifeS);
    let total = 0, r = 0, g = 0, b = 0, top: string | null = null, topW = 0;
    for (const [hex, wt0] of this.w) {
      const wt = wt0 * decay;
      if (wt < 0.02) { this.w.delete(hex); continue; }
      this.w.set(hex, wt);
      const [cr, cg, cb] = hexRgb(hex);
      r += cr * cr * wt; g += cg * cg * wt; b += cb * cb * wt;   // mix in squared space (closer to light)
      total += wt;
      if (wt > topW) { topW = wt; top = hex; }
    }
    const target = Math.min(1, total / this.fullAt);
    const rate = target > this.level ? this.attack : this.release;
    this.level += (target - this.level) * (1 - Math.exp(-rate * dt));
    if (!total) return { hex: '#000000', rgb: [0, 0, 0], intensity: this.level < 0.002 ? 0 : this.level, dominant: null };
    let rgb: [number, number, number] = [Math.sqrt(r / total), Math.sqrt(g / total), Math.sqrt(b / total)];
    rgb = resaturate(rgb, hexRgb(top!));
    return { hex: toHex(rgb), rgb: rgb.map(Math.round) as [number, number, number], intensity: this.level, dominant: top };
  }
}
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Mixing many gels greys out; pull the mix's saturation back toward the dominant gel's. */
function resaturate(c: [number, number, number], dom: [number, number, number]): [number, number, number] {
  const sat = (x: number[]) => { const mx = Math.max(...x), mn = Math.min(...x); return mx ? (mx - mn) / mx : 0; };
  const s = sat(c), want = Math.max(s, sat(dom) * 0.85);
  if (s >= want || s === 0) return c;
  const mx = Math.max(...c), k = want / s;
  return c.map(v => mx - (mx - v) * k) as [number, number, number];
}

// ── access ───────────────────────────────────────────────────────────────────────────────────────
export interface ViewerAccess { isCreator?: boolean; isMember?: boolean; isFollower?: boolean }
const RANK: Record<EmoteAccess, number> = { everyone: 0, follower: 1, member: 2, creator: 3 };
export function canUseEmote(e: EmoteDef, v: ViewerAccess): boolean {
  const need = RANK[e.access ?? 'everyone'];
  const have = v.isCreator ? 3 : v.isMember ? 2 : v.isFollower ? 1 : 0;
  return have >= need;
}
export const ACCESS_LABEL: Record<EmoteAccess, string> = { everyone: 'Everyone', follower: 'Followers', member: 'Members', creator: 'Creator only' };

// ── recents ──────────────────────────────────────────────────────────────────────────────────────
export function pushRecent(list: string[], id: string, max = 16): string[] {
  return [id, ...list.filter(x => x !== id)].slice(0, max);
}

// ── relay (scale) ────────────────────────────────────────────────────────────────────────────────
// Small streams: every viewer listens to the raw events (fastest). Busy streams: the HOST, which
// already reads every event for the chorus, folds them into one summary doc every ~1.2 s, and viewers
// listen to that single doc instead — reads per viewer drop from "every event" to < 1 per second,
// whatever the audience does. Hysteresis keeps it from flapping around the threshold.
export const RELAY_ON_AT = 40, RELAY_OFF_BELOW = 25, RELAY_TICK_MS = 1200, RELAY_MAX_ITEMS = 24;

export function relayWanted(audience: number, current: boolean): boolean {
  return current ? audience >= RELAY_OFF_BELOW : audience >= RELAY_ON_AT;
}

/** Host-side accumulator: taps per emote since the last tick. */
export class RelayBuffer {
  private m = new Map<string, number>();
  add(emoteId: string, n = 1) { this.m.set(emoteId, (this.m.get(emoteId) ?? 0) + n); }
  get size() { return this.m.size; }
  /** The tick payload: biggest first, capped; the rest are dropped (they're the long tail). */
  drain(max = RELAY_MAX_ITEMS): [string, number][] {
    const items = [...this.m].sort((a, b) => b[1] - a[1]).slice(0, max);
    this.m.clear();
    return items;
  }
}

/**
 * Viewer-side: turn one tick into spawns spread across the tick's duration (so a second's worth of
 * emotes arrives as a second's worth of motion, not one clump). Subtracts what this viewer already
 * drew locally (their own taps). Caps visual particles per emote; the count still shows in `n`.
 */
export function spreadTick(items: [string, number][], durMs: number, mine: Map<string, number> = new Map(), maxSpawnsPerEmote = 6): { id: string; n: number; at: number }[] {
  const out: { id: string; n: number; at: number }[] = [];
  for (const [id, total] of items) {
    const n = Math.max(0, total - (mine.get(id) ?? 0));
    if (!n) continue;
    const spawns = Math.min(maxSpawnsPerEmote, n);
    const per = n / spawns;
    for (let i = 0; i < spawns; i++) {
      out.push({ id, n: Math.max(1, Math.round(per * (i + 1)) - Math.round(per * i)), at: Math.round(((i + 0.5) / spawns) * durMs) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
