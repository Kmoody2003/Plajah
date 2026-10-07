// kaijuFace — the kaiju's emotional range.
//
// Two pieces, both pure (no three.js, no DOM) so they are unit-testable and shared by the 3D rig:
//   • EXPRESSIONS / resolveFace — each named expression is a combination of face parts (eyes + brows + mouth
//     + extras). The GLBs toggle parts by bone scale; older GLBs lack the newer parts, so every part has a
//     fallback chain and an expression always resolves to bones that exist.
//   • EmotionDirector — decides, per dancer and per moment, which expression to wear, from what the music
//     is doing (energy tier, singing, drops, silence) and the character's personality, with minimum hold
//     times so faces change on phrases rather than flickering. It also runs blinks (a fast lid squash, not a
//     swap to a black shape) and gaze.

export type Expr =
  | 'grumpy' | 'calm' | 'joy' | 'excited' | 'surprised' | 'smug' | 'sleepy' | 'sleep' | 'sad' | 'love' | 'laugh' | 'angry' | 'worried' | 'sing' | 'shout' | 'wink';

export interface FaceSpec { eyes: string; brows: string; mouth: string; extras?: string[] }

/** Part base names. Paired parts get an _L/_R suffix when resolved against the rig. */
export const EXPRESSIONS: Record<Expr, FaceSpec> = {
  grumpy: { eyes: 'eye', brows: 'brow', mouth: 'mouth_frown' },
  calm: { eyes: 'eye', brows: 'brow_flat', mouth: 'mouth_smile' },
  joy: { eyes: 'heye', brows: 'brow_up', mouth: 'mouth_grin', extras: ['blush_big'] },
  excited: { eyes: 'eye_wide', brows: 'brow_up', mouth: 'mouth_laugh', extras: ['blush_big'] },
  surprised: { eyes: 'eye_wide', brows: 'brow_up', mouth: 'mouth_ooh' },
  smug: { eyes: 'eye_half', brows: 'brow', mouth: 'mouth_smirk' },
  sleepy: { eyes: 'eye_half', brows: 'brow_flat', mouth: 'mouth_ooh' },
  sleep: { eyes: 'eye_closed', brows: 'brow_flat', mouth: 'mouth_smile' },
  sad: { eyes: 'eye_sad', brows: 'brow_sad', mouth: 'mouth_sad', extras: ['tear'] },
  love: { eyes: 'eye_heart', brows: 'brow_up', mouth: 'mouth_smile', extras: ['blush_big'] },
  laugh: { eyes: 'eye_squint', brows: 'brow_up', mouth: 'mouth_laugh', extras: ['blush_big'] },
  angry: { eyes: 'eye', brows: 'brow', mouth: 'mouth_shout' },
  worried: { eyes: 'eye', brows: 'brow_sad', mouth: 'mouth_sad', extras: ['sweat'] },
  sing: { eyes: 'eye', brows: 'brow_flat', mouth: 'mouth_o' },
  shout: { eyes: 'eye', brows: 'brow_up', mouth: 'mouth_shout' },
  wink: { eyes: 'eye', brows: 'brow_up', mouth: 'mouth_smirk' },
};

/** What to use when a rig does not have a part (older GLBs only have eye/heye/brow/mouth_frown|grin|o). */
const FALLBACK: Record<string, string[]> = {
  eye_wide: ['eye'], eye_half: ['eye'], eye_sad: ['eye'], eye_closed: ['heye'], eye_squint: ['heye'], eye_heart: ['heye'],
  brow_up: ['brow'], brow_sad: ['brow'], brow_flat: ['brow'],
  mouth_smile: ['mouth_grin'], mouth_laugh: ['mouth_grin'], mouth_sad: ['mouth_frown'], mouth_smirk: ['mouth_grin'], mouth_ooh: ['mouth_o'], mouth_shout: ['mouth_o'],
};
const PAIRED = /^(eye|heye|brow|blush|tear)/;

/** Resolve an expression to the concrete bone names that must be "shown" (everything else face-ish is hidden). */
export function resolveFace(spec: FaceSpec, has: (bone: string) => boolean): string[] {
  const out: string[] = [];
  const add = (base: string, optional = false) => {
    const chain = [base, ...(FALLBACK[base] ?? [])];
    for (const b of chain) {
      const names = PAIRED.test(b) || b.includes('_big') ? [`${b}_L`, `${b}_R`] : [b];
      // tear/sweat/blush extras may be singletons or pairs depending on the rig
      const found = names.filter(has).length ? names.filter(has) : (has(b) ? [b] : []);
      if (found.length) { out.push(...found); return; }
    }
    void optional;
  };
  add(spec.eyes); add(spec.brows); add(spec.mouth);
  for (const x of spec.extras ?? []) add(x, true);
  return out;
}

// ------------------------------------------------------------------------------------------------ emotion
export interface EmotionInput {
  dt: number; t: number;
  tier: 'silent' | 'quiet' | 'groove' | 'peak';
  silent: boolean; asleep: boolean;
  singing: boolean; vocalEnv: number; sustain: boolean;
  kick: number; beat: boolean; beats: number;
  drop: boolean; snapped: boolean;
  eFast: number;
}
export interface EmotionOut {
  expr: Expr;
  /** 0 open … 1 fully closed — apply as a vertical squash of whichever open eye is showing. */
  blink: number;
  gazeX: number; gazeY: number;
  browLift: number;
  /** singing mouth: 0 closed … 1 wide open (chooses mouth_o vs mouth_shout) */
  mouth: number;
}

const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export type Personality = 'chora' | 'reello';

export class EmotionDirector {
  readonly out: EmotionOut = { expr: 'grumpy', blink: 0, gazeX: 0, gazeY: 0, browLift: 0, mouth: 0 };
  private expr: Expr = 'grumpy'; private since = -9; private hold = 2; private n = 0;
  private override: { expr: Expr; until: number } | null = null;
  private blinkAt = 1.2; private blinkT = -9; private double = false; private gazeAt = 0; private gx = 0; private gy = 0; private tgx = 0; private tgy = 0;
  private clock = 0; private lastBeatPhrase = -1; private lift = 0;

  constructor(private readonly who: Personality, private readonly seed = 0) {}

  /** Force an expression for `dur` seconds (a drop, a snap, a cheer). */
  emote(expr: Expr, dur: number) { this.override = { expr, until: this.clock + dur }; }

  update(i: EmotionInput): EmotionOut {
    const dt = Math.min(0.1, i.dt); this.clock += dt;
    const chora = this.who === 'chora';
    const o = this.out;

    // ---- one-shot reactions
    if (i.drop) this.emote(chora ? 'surprised' : 'excited', 0.9);
    if (i.snapped && !chora) this.emote('wink', 0.8);

    // ---- pick a baseline expression for the moment (changes on phrases, held for a while)
    const phrase = Math.floor(i.beats / 8);
    const wantNew = this.clock - this.since > this.hold && phrase !== this.lastBeatPhrase;
    const forced = i.asleep ? 'sleep' : i.singing ? 'sing' : null;
    if (forced) { if (this.expr !== forced) { this.expr = forced; this.since = this.clock; this.hold = 1.5; } }
    else if (wantNew || (this.expr === 'sing' || this.expr === 'sleep')) {
      this.lastBeatPhrase = phrase; this.n++; this.since = this.clock;
      const r = hash(this.n * 3.7 + this.seed + (chora ? 0 : 11));
      const pick = <T,>(xs: readonly [T, number][]) => { const tot = xs.reduce((a, [, w]) => a + w, 0); let k = r * tot; for (const [v, w] of xs) { k -= w; if (k <= 0) return v; } return xs[0][0]; };
      let e: Expr;
      switch (i.tier) {
        case 'silent': e = pick([['grumpy', 3], ['sleepy', 3], ['calm', 1.5]] as const); break;
        case 'quiet': e = chora ? pick([['calm', 3], ['love', 2], ['sleepy', 1.2], ['sad', 1], ['joy', 0.8]] as const) : pick([['calm', 3], ['smug', 1.5], ['sleepy', 1.5], ['worried', 0.8], ['love', 1]] as const); break;
        case 'groove': e = chora ? pick([['joy', 3], ['calm', 2], ['love', 1.2], ['smug', 1], ['grumpy', 1]] as const) : pick([['smug', 3], ['joy', 2], ['calm', 1.5], ['grumpy', 1.5], ['excited', 0.8]] as const); break;
        default: e = chora ? pick([['excited', 3], ['laugh', 2.5], ['joy', 2.5], ['shout', 1], ['love', 0.8], ['surprised', 0.6]] as const) : pick([['excited', 3], ['laugh', 2], ['smug', 1.5], ['joy', 2], ['angry', 1.2], ['shout', 1]] as const);
      }
      if (e === this.expr) e = e === 'joy' ? 'calm' : 'joy';
      this.expr = e; this.hold = i.tier === 'peak' ? 2.2 : i.tier === 'quiet' ? 5 : 3.5;
    } else if (phrase !== this.lastBeatPhrase) this.lastBeatPhrase = phrase;

    const ov = this.override && this.clock < this.override.until ? this.override.expr : null;
    o.expr = ov ?? this.expr;

    // ---- singing mouth + brow flash on big hits
    o.mouth = i.singing ? Math.max(0, Math.min(1, i.vocalEnv * 1.8)) : 0;
    this.lift += ((i.kick > 0.9 && i.eFast > 0.55 ? 1 : 0) - this.lift) * (1 - Math.exp(-dt * (i.kick > 0.9 ? 40 : 9)));
    o.browLift = this.lift + (i.singing && i.sustain ? 0.6 : 0);

    // ---- blink: close 55 ms, hold 30 ms, open 100 ms; the odd double-blink
    if (this.clock > this.blinkAt && !i.asleep) {
      this.blinkT = this.clock; this.double = hash(this.n * 5.1 + this.clock) < 0.18;
      this.blinkAt = this.clock + 1.8 + hash(this.clock * 3.3 + this.seed) * 3.6;
    }
    const bt = this.clock - this.blinkT;
    const one = (x: number) => (x < 0 ? 0 : x < 0.055 ? x / 0.055 : x < 0.085 ? 1 : x < 0.185 ? 1 - (x - 0.085) / 0.1 : 0);
    o.blink = Math.max(one(bt), this.double ? one(bt - 0.24) : 0);
    if (o.expr === 'sleep' || o.expr === 'joy' || o.expr === 'laugh' || o.expr === 'love') o.blink = 0;   // already closed / squinting / hearts

    // ---- gaze: wander, glance at the partner on phrase changes
    if (this.clock > this.gazeAt) {
      this.gazeAt = this.clock + 0.8 + hash(this.clock * 7.7 + this.seed) * 2.2;
      this.tgx = (hash(this.clock * 1.3 + 1) - 0.5) * 1.4 + (this.who === 'chora' ? 0.35 : -0.35); this.tgy = (hash(this.clock * 2.9 + 2) - 0.5) * 0.7;
    }
    const k = 1 - Math.exp(-dt * 14);
    this.gx += (this.tgx - this.gx) * k; this.gy += (this.tgy - this.gy) * k;
    o.gazeX = this.gx; o.gazeY = this.gy;
    return o;
  }
}
