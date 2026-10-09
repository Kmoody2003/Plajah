// playGames — the kids "play gate" for evites, as pure data + math (no React, no DOM).
//
// Before a kids invite resolves its details, the child plays a 10–15 s mini-game (or scratches to reveal); the card
// then celebrates and the details appear. A parent can always skip. The component lives in
// components/evite/EvitePlayGate.tsx; everything it needs to decide (which game, where things spawn, card shuffles,
// hit tests, scratch coverage, the 15 s auto-complete clock, the hit/spring timing) lives here so it can be tested.
//
// Motion follows the Motion Council kids spec (docs/evites/motion/kids.json): ONE spring(320,28) for every
// interaction, hits = 2-frame anticipation squish + 1-frame impact flash + 3-frame dissipation burst of 6 shards,
// celebration ≤24 particles with a 45-frame life, reduced motion = opacity-only twin with the same timing.
//
// Tested in tests/evitePlay.test.ts.
import { springStep } from './motionRecipes';

export type PlayKind = 'pop' | 'catch' | 'memory' | 'hunt' | 'candles' | 'scratch';
export type SpriteKind =
  | 'balloon' | 'bubble' | 'star' | 'egg' | 'coin' | 'gem' | 'paw' | 'note' | 'ball' | 'flag'
  | 'shuriken' | 'heart' | 'candle' | 'butterfly' | 'ghost' | 'apple' | 'snowflake' | 'gift';
/** Theme silhouette baked into the dissipation shards (council: dino = bone shards, space = star points, …). */
export type ShardKind = 'angular' | 'star' | 'heart' | 'arc' | 'rect' | 'blob';

export interface PlaySpec {
  kind: PlayKind;
  /** pop/catch: items, hunt: hidden items, candles: candles, memory: pairs, scratch: percent of the foil to clear */
  goal: number;
  prompt: string;
  sprite: SpriteKind;
  colors: string[];
}

export const SPRITES: SpriteKind[] = ['balloon', 'bubble', 'star', 'egg', 'coin', 'gem', 'paw', 'note', 'ball', 'flag', 'shuriken', 'heart', 'candle', 'butterfly', 'ghost', 'apple', 'snowflake', 'gift'];
export const KIDS_PLAY_COLLECTIONS = ['kids_everyone', 'kids_boy', 'kids_girl', 'kids_kaiju', 'sports_kids'] as const;

// ── timing (Motion Council kids) ──────────────────────────────────────────────────────────────────────────────────
export const FRAME_MS = 1000 / 60;
/** the one spring for every interaction */
export const PLAY_SPRING: [number, number] = [320, 28];
/** no child gets stuck: the gate completes itself after this much visible play time */
export const PLAY_LIMIT_MS = 15000;
/** the game starts helping (bigger targets, slower sprites, hints) from here… */
export const ASSIST_FROM_MS = 7000;
/** …and is at full help here */
export const ASSIST_FULL_MS = 13000;
export const HIT = { anticipation: 2, impact: 1, dissipation: 3, fade: 6, shards: 6, travel: 24, squish: [0.9, 1.1] as [number, number], flash: 0.6 };
export const WIN = { particles: 24, lifeFrames: 45, holdFrames: 2 };
/** win → overlay fades from here (ms after the win), and onWin fires at WIN_DONE_MS */
export const WIN_FADE_MS = 520;
export const WIN_DONE_MS = 860;
/** scratch reveals when this share of the foil is cleared */
export const REVEAL_AT = 0.55;
/** smallest tap target (CSS px diameter) */
export const MIN_TAP = 44;

// ── palettes ─────────────────────────────────────────────────────────────────────────────────────────────────────
const PAL: Record<string, string[]> = {
  party: ['#FF5A76', '#FFD23F', '#4CC3FF', '#52D681', '#B794F6', '#FF8C00'],
  sea: ['#7FE7FF', '#B6F3FF', '#9AD0FF', '#C9B6FF'],
  lab: ['#7CFF6B', '#B794F6', '#35E0E8', '#FFD23F'],
  space: ['#FFE066', '#FFFFFF', '#FFD23F', '#9AD0FF'],
  night: ['#FFE08A', '#FFF6D6', '#B6E3FF'],
  candy: ['#FF5FA2', '#B794F6', '#FFD23F', '#7FDBFF', '#FF9AC9'],
  egg: ['#9AE6B4', '#FFD8A8', '#B6E3FF', '#F9C6E8'],
  paw: ['#FFB347', '#FF7EB6', '#7FDBFF'],
  treasure: ['#FFC83D', '#FFD966', '#F2B33D'],
  rainbow: ['#FF5FA2', '#7FDBFF', '#B794F6', '#52D681', '#FFD23F'],
  kaiju: ['#D40055', '#FF8C00', '#B794F6', '#35E0E8', '#FFD23F'],
  ice: ['#E6F6FF', '#B6E3FF', '#FFFFFF'],
  sport: ['#FFFFFF', '#FFD23F', '#52D681'],
  fruit: ['#FF4B4B', '#FF7A45', '#7CD957'],
  flags: ['#FF8C00', '#D40055', '#FFD23F'],
  ghost: ['#B794F6', '#35E0E8', '#7CFF6B'],
};

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────────
const NOUN: Record<SpriteKind, [string, string]> = {
  balloon: ['balloon', 'balloons'], bubble: ['bubble', 'bubbles'], star: ['star', 'stars'], egg: ['egg', 'eggs'], coin: ['gold coin', 'gold coins'],
  gem: ['gem', 'gems'], paw: ['paw print', 'paw prints'], note: ['music note', 'music notes'], ball: ['ball', 'balls'], flag: ['flag', 'flags'],
  shuriken: ['ninja star', 'ninja stars'], heart: ['heart', 'hearts'], candle: ['candle', 'candles'], butterfly: ['butterfly', 'butterflies'],
  ghost: ['ghost', 'ghosts'], apple: ['apple', 'apples'], snowflake: ['snowflake', 'snowflakes'], gift: ['present', 'presents'],
};
export const spriteNoun = (s: SpriteKind, n = 2) => NOUN[s][n === 1 ? 0 : 1];

export function promptFor(kind: PlayKind, goal: number, sprite: SpriteKind): string {
  const things = spriteNoun(sprite, goal);
  switch (kind) {
    case 'pop': return `${sprite === 'balloon' || sprite === 'bubble' ? 'Pop' : 'Tap'} ${goal} ${things} to open your invite!`;
    case 'catch': return `Catch ${goal} ${things} to open your invite!`;
    case 'hunt': return `Find ${goal} hidden ${things}!`;
    case 'candles': return `Tap to light ${goal} candles!`;
    case 'memory': return `Match ${goal} pairs to open your invite!`;
    case 'scratch': return 'Scratch to reveal your invite!';
  }
}

// ── the plate → game table ───────────────────────────────────────────────────────────────────────────────────────
type Row = [PlayKind, SpriteKind, keyof typeof PAL, string?];
const GOAL: Record<PlayKind, number> = { pop: 8, catch: 8, hunt: 3, candles: 4, memory: 6, scratch: Math.round(REVEAL_AT * 100) };

/** Every kids plate, keyed `collection/subject` (alternates resolve to their base subject). */
export const PLAY_TABLE: Record<string, Row> = {
  // kids_everyone
  'kids_everyone/zoo': ['hunt', 'paw', 'paw'],
  'kids_everyone/circus': ['pop', 'balloon', 'party'],
  'kids_everyone/pajama-party': ['memory', 'star', 'candy'],
  'kids_everyone/bounce-house': ['pop', 'balloon', 'party'],
  'kids_everyone/mad-science': ['pop', 'bubble', 'lab'],
  'kids_everyone/farm': ['hunt', 'egg', 'egg'],
  'kids_everyone/camping': ['catch', 'star', 'night'],
  'kids_everyone/magic-show': ['scratch', 'star', 'candy', 'Scratch the magic curtain to reveal your invite!'],
  'kids_everyone/slime-lab': ['pop', 'bubble', 'lab'],
  'kids_everyone/bubbles': ['pop', 'bubble', 'sea'],
  'kids_everyone/pool-splash': ['pop', 'bubble', 'sea'],
  'kids_everyone/superstar': ['catch', 'star', 'party'],
  // kids_boy
  'kids_boy/dino': ['hunt', 'egg', 'egg', 'Find 3 hidden dino eggs!'],
  'kids_boy/rocket': ['catch', 'star', 'space'],
  'kids_boy/truck': ['scratch', 'star', 'flags'],
  'kids_boy/soccer': ['catch', 'ball', 'sport'],
  'sports_kids/golf': ['hunt', 'ball', 'sport', 'Find 3 lost golf balls'],
  'sports_kids/swimming': ['pop', 'bubble', 'sea'],
  'sports_kids/gymnastics': ['catch', 'star', 'space'],
  'sports_kids/boxing': ['pop', 'star', 'flags', 'Tap 8 stars to warm up'],
  'sports_kids/skate': ['catch', 'coin', 'treasure'],
  'sports_kids/cheer': ['scratch', 'star', 'party'],
  'sports_kids/track': ['catch', 'flag', 'flags'],
  'sports_kids/martial-arts': ['pop', 'shuriken', 'night'],
  'sports_kids/basketball': ['catch', 'ball', 'sport'],
  'sports_kids/football': ['catch', 'ball', 'sport'],
  'sports_kids/soccer': ['catch', 'ball', 'sport'],
  'sports_kids/baseball': ['catch', 'ball', 'sport'],
  'sports_kids/hockey': ['hunt', 'coin', 'ice', 'Find 3 hidden pucks'],
  'sports_kids/racing': ['catch', 'flag', 'flags'],
  'sports_kids/tennis': ['catch', 'ball', 'fruit'],
  'sports_kids/volleyball': ['pop', 'ball', 'sport', 'Tap 8 balls before they land'],
  'kids_boy/pirate': ['hunt', 'coin', 'treasure', 'Find 3 hidden gold coins!'],
  'kids_boy/hero': ['catch', 'star', 'party'],
  'kids_boy/robot': ['memory', 'gem', 'rainbow'],
  'kids_boy/shark': ['pop', 'bubble', 'sea'],
  'kids_boy/safari': ['hunt', 'paw', 'paw'],
  'kids_boy/knight': ['scratch', 'gem', 'rainbow'],
  'kids_boy/racecar': ['catch', 'flag', 'flags'],
  'kids_boy/ninja': ['pop', 'shuriken', 'kaiju'],
  // kids_girl
  'kids_girl/unicorn': ['scratch', 'heart', 'candy', 'Scratch the sparkle to reveal your invite!'],
  'kids_girl/princess': ['memory', 'gem', 'candy'],
  'kids_girl/mermaid': ['pop', 'bubble', 'sea'],
  'kids_girl/fairy': ['catch', 'star', 'candy'],
  'kids_girl/butterfly': ['pop', 'butterfly', 'candy'],
  'kids_girl/ballet': ['scratch', 'heart', 'candy'],
  'kids_girl/bakery': ['candles', 'candle', 'candy'],
  'kids_girl/rainbow': ['hunt', 'gem', 'rainbow'],
  'kids_girl/kitty': ['memory', 'paw', 'candy'],
  'kids_girl/art': ['scratch', 'star', 'rainbow'],
  'kids_girl/carousel': ['pop', 'balloon', 'candy'],
  'kids_girl/popstar': ['scratch', 'note', 'candy'],
  // kids_kaiju
  'kids_kaiju/cake-eruption': ['candles', 'candle', 'kaiju'],
  'kids_kaiju/disco': ['catch', 'note', 'kaiju'],
  'kids_kaiju/kelp-rave': ['pop', 'bubble', 'sea'],
  'kids_kaiju/space-countdown': ['catch', 'star', 'space'],
  'kids_kaiju/haunted-creep': ['hunt', 'ghost', 'ghost'],
  'kids_kaiju/jungle-gym': ['hunt', 'egg', 'egg', 'Find 3 hidden kaiju eggs!'],
  'kids_kaiju/pillow-fort': ['memory', 'star', 'kaiju'],
  'kids_kaiju/premiere': ['scratch', 'star', 'kaiju', 'Scratch the curtain to reveal your invite!'],
  'kids_kaiju/picnic-stampede': ['catch', 'apple', 'fruit'],
  'kids_kaiju/wave-crash': ['pop', 'bubble', 'sea'],
  'kids_kaiju/skate-bowl': ['catch', 'coin', 'treasure'],
  'kids_kaiju/snow-howl': ['catch', 'snowflake', 'ice'],
  'kids_kaiju/presents': ['hunt', 'gift', 'kaiju'],
  'kids_kaiju/pool-party': ['pop', 'bubble', 'sea'],
  'kids_kaiju/camping': ['catch', 'star', 'night'],
  'kids_kaiju/dance-off': ['catch', 'note', 'kaiju'],
};
/** alternates whose stem is not itself a subject */
const ALIAS: Record<string, string> = { magic: 'magic-show' };
/** a new kids plate that is not in the table yet still gets a game */
const FALLBACK: Row = ['pop', 'balloon', 'party'];

const isKids = (c: string) => (KIDS_PLAY_COLLECTIONS as readonly string[]).includes(c);
/** `dino-alt` → `dino`, `magic-alt` → `magic-show` */
export const baseSubject = (subject: string) => { const stem = subject.replace(/-alt$/, ''); return ALIAS[stem] || stem; };

/** The game for a plate, or null when the plate is not a kids plate (no gate). */
export function playFor(collection: string, subject: string): PlaySpec | null {
  if (!isKids(collection)) return null;
  const row = PLAY_TABLE[`${collection}/${baseSubject(subject)}`] || FALLBACK;
  const [kind, sprite, pal, prompt] = row;
  const goal = GOAL[kind];
  return { kind, goal, prompt: prompt || promptFor(kind, goal, sprite), sprite, colors: [...PAL[pal]] };
}

// ── seeded randomness ────────────────────────────────────────────────────────────────────────────────────────────
export function seedFrom(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** mulberry32: small, fast, deterministic */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice(); const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ── spawn schedules (pop: rise from below, catch: fall from above) ───────────────────────────────────────────────
export interface SpawnEvent {
  /** ms after play starts */
  at: number;
  /** 0..1 across the card */
  x: number;
  /** card heights per second */
  speed: number;
  /** diameter as a share of card width */
  size: number;
  /** sideways sway as a share of card width */
  drift: number;
  phase: number;
  /** index into spec.colors */
  color: number;
  /** radians per second (shuriken, snowflakes, notes) */
  spin: number;
}

export function spawnSchedule(kind: 'pop' | 'catch', goal: number, seed: number, durationMs = PLAY_LIMIT_MS): SpawnEvent[] {
  const r = rng(seed);
  const n = goal * 2 + 4;
  const span = durationMs * 0.8, gap = span / n;
  const LANES = 5;
  let lanes: number[] = [];
  const out: SpawnEvent[] = [];
  for (let i = 0; i < n; i++) {
    if (!lanes.length) lanes = shuffle([0, 1, 2, 3, 4], Math.floor(r() * 2 ** 31));
    const lane = lanes.pop()!;
    const x = Math.min(0.88, Math.max(0.12, 0.12 + ((lane + 0.5) / LANES) * 0.76 + (r() - 0.5) * (0.76 / LANES) * 0.6));
    out.push({
      at: Math.max(0, 180 + i * gap + (r() - 0.5) * gap * 0.6),
      x,
      speed: kind === 'pop' ? 0.17 + r() * 0.07 : 0.24 + r() * 0.08,
      size: kind === 'pop' ? 0.15 + r() * 0.04 : 0.12 + r() * 0.03,
      drift: 0.015 + r() * 0.025,
      phase: r() * Math.PI * 2,
      color: Math.floor(r() * 64),
      spin: (r() - 0.5) * (kind === 'pop' ? 2 : 3),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ── memory ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** 2 × pairs card ids, each id 0..pairs-1 exactly twice, shuffled by seed */
export function memoryDeck(pairs: number, seed: number): number[] {
  const ids: number[] = []; for (let i = 0; i < pairs; i++) ids.push(i, i);
  return shuffle(ids, seed);
}
const FACE_ORDER: SpriteKind[] = ['heart', 'star', 'balloon', 'gem', 'butterfly', 'note', 'coin', 'apple', 'paw', 'ghost', 'snowflake', 'gift'];
/** distinct, easy-to-tell-apart faces for memory cards: the theme sprite first, then a fixed set, each with its own colour */
export function memoryFaces(spec: PlaySpec): { sprite: SpriteKind; color: string }[] {
  const sprites = [spec.sprite, ...FACE_ORDER.filter(s => s !== spec.sprite)].slice(0, spec.goal);
  const pool = [...spec.colors, '#FF5A76', '#4CC3FF', '#52D681', '#FFD23F', '#B794F6', '#FF8C00'];
  return sprites.map((sprite, i) => ({ sprite, color: pool[i % pool.length] }));
}
/** cols × rows for a memory grid that fits a 2:3 card */
export function memoryGrid(cards: number): { cols: number; rows: number } {
  const cols = cards <= 8 ? 2 : cards <= 12 ? 3 : 4;
  return { cols, rows: Math.ceil(cards / cols) };
}

// ── hit testing ──────────────────────────────────────────────────────────────────────────────────────────────────
/** tap radius for a sprite of a given diameter: never below the 44 px target */
export const tapRadius = (diameter: number) => Math.max(MIN_TAP / 2, diameter / 2 + 8);
export const hitCircle = (px: number, py: number, cx: number, cy: number, r: number) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
export const hitRect = (px: number, py: number, x: number, y: number, w: number, h: number) => px >= x && px <= x + w && py >= y && py <= y + h;
/** nearest of several circles that the point hits (or -1) */
export function pickNearest(px: number, py: number, items: { x: number; y: number; r: number }[]): number {
  let best = -1, bd = Infinity;
  items.forEach((it, i) => { const d = (px - it.x) ** 2 + (py - it.y) ** 2; if (d <= it.r * it.r && d < bd) { bd = d; best = i; } });
  return best;
}

// ── hunt ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** n hiding spots inside the card, away from the top bar and the edges, at least minDist apart (relaxed if impossible) */
export function huntSpots(n: number, seed: number, w: number, h: number, o: { top?: number; bottom?: number; margin?: number; minDist?: number } = {}): { x: number; y: number }[] {
  const r = rng(seed); const top = o.top ?? 120, bottom = o.bottom ?? 60, m = o.margin ?? 36;
  let minDist = o.minDist ?? Math.min(w, h) * 0.3;
  const out: { x: number; y: number }[] = [];
  let tries = 0;
  while (out.length < n) {
    const p = { x: m + r() * Math.max(1, w - 2 * m), y: top + r() * Math.max(1, h - top - bottom) };
    if (out.every(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 >= minDist * minDist)) out.push(p);
    if (++tries % 200 === 0) minDist *= 0.8;
  }
  return out;
}

// ── scratch ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ScratchGrid { cols: number; rows: number; cell: number; cells: Uint8Array; cleared: number }
/** coarse coverage grid over a w × h foil (cell px per cell) */
export function scratchGrid(w: number, h: number, cell = 12): ScratchGrid {
  const cols = Math.max(1, Math.ceil(w / cell)), rows = Math.max(1, Math.ceil(h / cell));
  return { cols, rows, cell, cells: new Uint8Array(cols * rows), cleared: 0 };
}
/** clear every cell whose centre is inside the brush; returns how many were newly cleared */
export function scratchAt(g: ScratchGrid, x: number, y: number, radius: number): number {
  const c0 = Math.max(0, Math.floor((x - radius) / g.cell)), c1 = Math.min(g.cols - 1, Math.floor((x + radius) / g.cell));
  const r0 = Math.max(0, Math.floor((y - radius) / g.cell)), r1 = Math.min(g.rows - 1, Math.floor((y + radius) / g.cell));
  let n = 0;
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
    const i = rr * g.cols + cc; if (g.cells[i]) continue;
    const cx = (cc + 0.5) * g.cell, cy = (rr + 0.5) * g.cell;
    if ((cx - x) ** 2 + (cy - y) ** 2 <= radius * radius) { g.cells[i] = 1; n++; }
  }
  g.cleared += n; return n;
}
/** a stroke from (x0,y0) to (x1,y1), stamped every half radius */
export function scratchLine(g: ScratchGrid, x0: number, y0: number, x1: number, y1: number, radius: number): number {
  const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(d / Math.max(1, radius * 0.5)));
  let n = 0; for (let i = 0; i <= steps; i++) n += scratchAt(g, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, radius);
  return n;
}
export const coverage = (g: ScratchGrid) => g.cleared / g.cells.length;
export const revealed = (g: ScratchGrid, at = REVEAL_AT) => coverage(g) >= at;

// ── the clock: visible play time only, auto-completes so no child gets stuck ─────────────────────────────────────
export interface PlayClock { elapsed: number; limit: number; paused: boolean; done: boolean }
export const createClock = (limit = PLAY_LIMIT_MS): PlayClock => ({ elapsed: 0, limit, paused: false, done: false });
/** advance by dt ms (clamped to 250 ms so a resumed tab never jumps to the end) */
export function tickClock(c: PlayClock, dtMs: number): PlayClock {
  if (c.paused || c.done) return c;
  const elapsed = c.elapsed + Math.max(0, Math.min(250, dtMs));
  return { ...c, elapsed, done: elapsed >= c.limit };
}
export const pauseClock = (c: PlayClock, paused: boolean): PlayClock => (c.paused === paused ? c : { ...c, paused });
/** 0 until ASSIST_FROM_MS, 1 at ASSIST_FULL_MS: bigger targets, slower sprites, hints */
export const assistLevel = (elapsedMs: number) => Math.max(0, Math.min(1, (elapsedMs - ASSIST_FROM_MS) / (ASSIST_FULL_MS - ASSIST_FROM_MS)));

// ── motion ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** spring(320,28) from 0 → 1, sampled per 60 fps frame for 1 s (springStep is the same integrator the stage uses) */
export const SPRING_LUT: number[] = (() => {
  const out = [0]; let x = 0, v = 0;
  for (let i = 1; i <= 60; i++) { [x, v] = springStep(x, v, 1, 1 / 60, PLAY_SPRING); out.push(x); }
  return out;
})();
/** spring(320,28) position at t ms after release, 0 → 1 (with its slight overshoot) */
export function springAt(tMs: number): number {
  if (tMs <= 0) return 0;
  const f = tMs / FRAME_MS; if (f >= SPRING_LUT.length - 1) return 1;
  const i = Math.floor(f), k = f - i; return SPRING_LUT[i] + (SPRING_LUT[i + 1] - SPRING_LUT[i]) * k;
}

export interface HitPhase { phase: 'anticipation' | 'impact' | 'dissipation' | 'done'; sx: number; sy: number; flash: number; /** 0..1 shard travel */ travel: number; /** 0..1 shard opacity */ alpha: number }
/** The three-beat hit: 2-frame squish, 1-frame white flash, 3-frame shard burst (then a short fade). */
export function hitPhase(ageMs: number): HitPhase {
  const f = ageMs / FRAME_MS;
  const a = HIT.anticipation, i = a + HIT.impact, d = i + HIT.dissipation, end = d + HIT.fade;
  if (f < a) return { phase: 'anticipation', sx: HIT.squish[0], sy: HIT.squish[1], flash: 0, travel: 0, alpha: 0 };
  if (f < i) return { phase: 'impact', sx: 1, sy: 1, flash: HIT.flash, travel: 0, alpha: 1 };
  if (f < d) return { phase: 'dissipation', sx: 0, sy: 0, flash: 0, travel: (f - i) / HIT.dissipation, alpha: 1 };
  if (f < end) return { phase: 'dissipation', sx: 0, sy: 0, flash: 0, travel: 1, alpha: 1 - (f - d) / HIT.fade };
  return { phase: 'done', sx: 0, sy: 0, flash: 0, travel: 1, alpha: 0 };
}

const SHARD: Record<SpriteKind, ShardKind> = {
  egg: 'angular', star: 'star', shuriken: 'star', snowflake: 'star', coin: 'star', heart: 'heart', butterfly: 'heart', paw: 'heart',
  bubble: 'arc', balloon: 'rect', flag: 'rect', gift: 'rect', note: 'rect', gem: 'angular', ball: 'blob', apple: 'blob', ghost: 'blob', candle: 'star',
};
export const shardFor = (s: SpriteKind): ShardKind => SHARD[s];

/** progress readout: "3 / 8", or a percentage of the way to the scratch reveal */
export function progressLabel(spec: PlaySpec, value: number): string {
  if (spec.kind === 'scratch') return `${Math.min(100, Math.round((value / (spec.goal / 100)) * 100))}%`;
  return `${Math.min(value, spec.goal)} / ${spec.goal}`;
}
