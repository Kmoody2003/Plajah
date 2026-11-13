/**
 * Kith Quest — deterministic side-scroller simulation (fixed 1/120 s step, no DOM, no randomness
 * outside the seeded rng). The renderer and session only read this state.
 *
 * Movement kit (original Kith take on classic platformer feel):
 *  - variable-height jump with coyote time + jump buffer, speed adds height   (classic plumber feel)
 *  - momentum: top speed climbs while you keep running, slopes push, roll + spin charge (speed-hero feel)
 *  - lash melee with up/down aims, sub-weapons fuelled by sparks from lanterns, knockback (gothic-action feel)
 *  - petal glide after the double jump                                         (limbless-hero feel)
 *  - wall slide / wall jump, air dash, BASH off lanterns, enemies and shots    (spirit-forest feel)
 */
import {buildLevel, tileAt, T, TILE, type LevelDef, type EntKind, type BoxPrize} from './level';

/* ------------------------------- tuning ------------------------------- */
export const MOVE = {
 W: 24, H: 40, H_ROLL: 26,
 RUN: 280, RUN_TOP: 430, TOP_AFTER: .7, ACCEL: 1500, AIR_ACCEL: 1150, DECEL: 2100, AIR_DECEL: 520, SKID: 2900, OVER_DECAY: 380,
 JUMP: 640, JUMP_SPEED_BONUS: .09, DJUMP: 560, WALL_JUMP_X: 380, WALL_JUMP_Y: 600, WALL_LOCK: .16, WALL_SLIDE: 170,
 G_UP: 1900, G_CUT: 4300, G_DOWN: 2500, MAX_FALL: 980, GLIDE_FALL: 105, GLIDE_TIME: 1.6,
 COYOTE: .1, BUFFER: .12,
 DASH_V: 720, DASH_T: .17, DASH_CD: .35,
 BASH_RANGE: 92, BASH_FREEZE: .4, BASH_V: 780,
 ROLL_MIN: 170, ROLL_FRIC: 260, ROLL_SLOPE: 1150, RUN_SLOPE: 480, SPIN_MAX: 1.6,
 STOMP: 480, STOMP_HELD: 700, SPRING: 1060, BOOST: 660,
 LASH_T: .26, LASH_CD: .3, LASH_REACH: 74, LASH_H: 30,
 HURT_INVULN: 1.3, KNOCK_X: 260, KNOCK_Y: 360,
 STEP: 12,
} as const;

export const MAX_HP = 5;
export const START_LIVES = 3;

/* ------------------------------- types -------------------------------- */
export interface QuestInput { x: number; y: number; jump: boolean; attack: boolean; dash: boolean; special: boolean; }
export const emptyQuestInput = (): QuestInput => ({ x: 0, y: 0, jump: false, attack: false, dash: false, special: false });

export type SubKind = 'arc' | 'bolt' | 'ring' | 'wave';
export interface KithTraits { sub: SubKind; color: string; glow: string; runMul: number; jumpMul: number; airJumps: number; glideMul: number; heavy: boolean; }
const TRAITS: Record<string, KithTraits> = {
 rello: { sub: 'arc', color: '#ff8a3d', glow: '#ffb46b', runMul: 1, jumpMul: 1, airJumps: 1, glideMul: 1, heavy: false },
 chora: { sub: 'ring', color: '#e055a8', glow: '#ff9ad5', runMul: 1, jumpMul: 1, airJumps: 1, glideMul: 1.1, heavy: false },
 moki: { sub: 'arc', color: '#9be15d', glow: '#d6ff9a', runMul: 1, jumpMul: 1.02, airJumps: 1, glideMul: 1, heavy: false },
 zippi: { sub: 'bolt', color: '#ffe066', glow: '#fff3a8', runMul: 1.1, jumpMul: 1, airJumps: 1, glideMul: .9, heavy: false },
 nori: { sub: 'wave', color: '#5fd6e6', glow: '#b6fbff', runMul: 1, jumpMul: 1, airJumps: 1, glideMul: 1.25, heavy: false },
 pippa: { sub: 'ring', color: '#ff8fc4', glow: '#ffd0e6', runMul: 1, jumpMul: 1, airJumps: 1, glideMul: 1.5, heavy: false },
 bram: { sub: 'arc', color: '#e0a060', glow: '#ffd29a', runMul: .95, jumpMul: .97, airJumps: 1, glideMul: .8, heavy: true },
 luma: { sub: 'ring', color: '#b9b4ff', glow: '#e8e4ff', runMul: 1, jumpMul: 1, airJumps: 2, glideMul: 1, heavy: false },
 tavi: { sub: 'ring', color: '#ffb35c', glow: '#ffd9a1', runMul: 1, jumpMul: 1, airJumps: 1, glideMul: 1, heavy: false },
 fenn: { sub: 'bolt', color: '#bfe8ff', glow: '#ffffff', runMul: 1, jumpMul: 1, airJumps: 1, glideMul: 1.15, heavy: false },
};
export const kithTraits = (id: string): KithTraits => TRAITS[id] || TRAITS.rello;
export const SUB_NAMES: Record<SubKind, string> = { arc: 'Ember Arc', bolt: 'Spark Bolt', ring: 'Echo Ring', wave: 'Tide Runner' };

export interface Player {
 character: string; traits: KithTraits;
 x: number; y: number; w: number; h: number; vx: number; vy: number;
 facing: 1 | -1; onGround: boolean; groundT: number; onSlope: number; onPlat: number;
 coyote: number; jumpBuf: number; jumpHeld: boolean; airJumps: number; glideT: number; gliding: boolean;
 wallDir: number; wallLock: number; wallSliding: boolean;
 dashT: number; dashCd: number; canDash: boolean;
 rolling: boolean; crouch: boolean; spin: number;
 attackT: number; attackCd: number; attackAim: 0 | -1 | 1; attackHit: Set<number>;
 runT: number; topSpeed: boolean;
 hurtT: number; invuln: number; hp: number; maxHp: number; lives: number;
 motes: number; sparks: number; seeds: boolean[]; score: number;
 dead: number; safe: { x: number; y: number }; checkpoint: { x: number; y: number };
 bash: { t: number; target: number; kind: 'node' | 'enemy' | 'shot'; ax: number; ay: number } | null;
 land: number; anim: string; animT: number;
}

export interface Ent {
 id: number; kind: EntKind; x: number; y: number; w: number; h: number; vx: number; vy: number;
 alive: boolean; hp: number; t: number; dir: number; data: number; onGround: boolean;
 ox: number; oy: number; hurt: number; state: string; stateT: number; prize?: BoxPrize;
}

export interface Shot { id: number; x: number; y: number; vx: number; vy: number; r: number; friendly: boolean; kind: 'spore' | SubKind | 'shock' | 'warden'; t: number; alive: boolean; dmg: number; bounced?: boolean; }

export interface Boss {
 x: number; y: number; vx: number; vy: number; w: number; h: number; hp: number; maxHp: number;
 state: 'dormant' | 'intro' | 'hover' | 'volley' | 'swoop' | 'rise' | 'slam' | 'stun' | 'dying' | 'dead';
 stateT: number; phase: number; hurt: number; dir: number; tx: number; ty: number; volleys: number; next: number;
}

export interface QuestEvent { seq: number; type: string; x: number; y: number; data?: string; }

export interface QuestState {
 level: LevelDef; levelIndex: number; tiles: Uint8Array;
 time: number; phase: 'intro' | 'play' | 'clear' | 'over'; phaseT: number;
 player: Player; ents: Ent[]; shots: Shot[]; boss: Boss | null;
 crumble: Map<number, number>; broken: Map<number, number>;
 events: QuestEvent[]; seq: number; nextId: number; rng: number;
 sign: number; signT: number; arenaLocked: boolean; prev: QuestInput; slow: number;
 result: { time: number; motes: number; seeds: number; score: number } | null;
}

/* ------------------------------ helpers ------------------------------- */
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const sign = (v: number) => v > 0 ? 1 : v < 0 ? -1 : 0;
const approach = (v: number, t: number, d: number) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function rand(s: QuestState) { s.rng = (s.rng * 1664525 + 1013904223) >>> 0; return s.rng / 4294967296; }
function emit(s: QuestState, type: string, x: number, y: number, data?: string) {
 s.events.push({ seq: ++s.seq, type, x, y, data });
 if (s.events.length > 96) s.events.splice(0, s.events.length - 96);
}

const ENT_SIZE: Partial<Record<EntKind, [number, number]>> = {
 mote: [18, 18], seed: [26, 26], petal: [22, 22], spark: [18, 18], checkpoint: [24, 64], goal: [48, 96], spring: [30, 16], boostR: [48, 10], boostL: [48, 10], sign: [26, 34],
 walker: [30, 24], hopper: [28, 28], flyer: [34, 24], turret: [32, 34], thornback: [40, 30], lantern: [18, 30], bashNode: [28, 28], platH: [96, 16], platV: [96, 16], boss: [80, 110],
};
const ENT_HP: Partial<Record<EntKind, number>> = { walker: 1, hopper: 1, flyer: 1, turret: 2, thornback: 3, lantern: 1 };
export const isEnemy = (k: EntKind) => k === 'walker' || k === 'hopper' || k === 'flyer' || k === 'turret' || k === 'thornback';

/* --------------------------- tile physics ----------------------------- */
function tileOf(s: QuestState, c: number, r: number): number {
 const L = s.level;
 if (c < 0 || c >= L.w) return T.SOLID;
 if (r < 0 || r >= L.h) return T.EMPTY;
 return s.tiles[r * L.w + c];
}
const isFullSolid = (v: number) => v === T.SOLID || v === T.BRICK || v === T.BOX || v === T.USED || v === T.CRUMBLE;
const isSlope = (v: number) => v === T.SLOPE_UP || v === T.SLOPE_DOWN;
function slopeFloor(v: number, c: number, r: number, x: number) {
 const lx = clamp(x - c * TILE, 0, TILE);
 return r * TILE + (v === T.SLOPE_UP ? TILE - lx : lx);
}
/** Ground height under a point (for spawns, AI edge checks). Returns Infinity if none within 6 tiles. */
export function groundBelow(s: QuestState, x: number, y: number): number {
 const c = Math.floor(x / TILE);
 for (let r = Math.floor(y / TILE); r < Math.floor(y / TILE) + 7; r++) {
  const v = tileOf(s, c, r);
  if (isSlope(v)) return slopeFloor(v, c, r, x);
  if (isFullSolid(v) || v === T.ONEWAY) return r * TILE;
 }
 return Infinity;
}

/** Top row of the first solid tile in a column (scanning down from the sky). */
export function floorRow(s: QuestState, c: number): number {
 for (let r = 0; r < s.level.h; r++) { const v = tileOf(s, c, r); if (isFullSolid(v) || v === T.ONEWAY) return r; }
 return s.level.h;
}

interface Body { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; }

/** Move a body along X against full-solid tiles. Returns the wall direction hit (0 if none). */
function moveX(s: QuestState, b: Body, dx: number, step: number): number {
 b.x += dx;
 const top = b.y + 1, bottom = b.y + b.h - 1 - step;
 const r0 = Math.floor(top / TILE), r1 = Math.floor(bottom / TILE);
 if (dx > 0) {
  const c = Math.floor((b.x + b.w) / TILE);
  for (let r = r0; r <= r1; r++) { const v = tileOf(s, c, r); if (isFullSolid(v) && !slopeShield(s, c, r)) { b.x = c * TILE - b.w; return 1; } }
 } else if (dx < 0) {
  const c = Math.floor(b.x / TILE);
  for (let r = r0; r <= r1; r++) { const v = tileOf(s, c, r); if (isFullSolid(v) && !slopeShield(s, c, r)) { b.x = (c + 1) * TILE; return -1; } }
 }
 return 0;
}
/** A full tile directly under a slope tile is never a wall (the body rides the slope above it). */
function slopeShield(s: QuestState, c: number, r: number) { return isSlope(tileOf(s, c, r - 1)); }

function touchingWall(s: QuestState, b: Body, dir: number): boolean {
 const x = dir > 0 ? b.x + b.w + 1 : b.x - 1;
 const c = Math.floor(x / TILE);
 const r0 = Math.floor((b.y + 4) / TILE), r1 = Math.floor((b.y + b.h - 6) / TILE);
 for (let r = r0; r <= r1; r++) if (isFullSolid(tileOf(s, c, r)) && !slopeShield(s, c, r)) return true;
 return false;
}

interface YResult { landed: boolean; head: number[]; ground: number; slope: number; }
/** Move along Y with one-way platforms, slopes and head bumps. `snap` lets grounded bodies follow downhill. */
function moveY(s: QuestState, b: Body, dy: number, snap: boolean, dropThrough: boolean): YResult {
 const res: YResult = { landed: false, head: [], ground: -1, slope: 0 };
 const prevBottom = b.y + b.h;
 b.y += dy;
 const c0 = Math.floor((b.x + 2) / TILE), c1 = Math.floor((b.x + b.w - 2) / TILE);
 if (dy < 0) {
  const r = Math.floor(b.y / TILE);
  for (let c = c0; c <= c1; c++) {
   const v = tileOf(s, c, r);
   if (isFullSolid(v)) { res.head.push(r * s.level.w + c); }
  }
  if (res.head.length) { b.y = (r + 1) * TILE; b.vy = 0; }
  return res;
 }
 // falling / resting: full tiles + one-ways under the feet (excluding slope columns, handled below)
 const bottom = b.y + b.h;
 const rb = Math.floor((bottom - .01) / TILE);
 const cx = b.x + b.w / 2, cc = Math.floor(cx / TILE);
 let best = Infinity;
 for (let c = c0; c <= c1; c++) {
  for (let r = Math.floor((prevBottom - MOVE.STEP - 1) / TILE); r <= rb; r++) {
   const v = tileOf(s, c, r);
   const top = r * TILE;
   if (isFullSolid(v)) {
    if (isSlope(tileOf(s, c, r - 1))) continue;
    if (isSlope(tileOf(s, cc, Math.floor((bottom - 1) / TILE))) && c !== cc) continue;
    if (bottom > top && prevBottom <= top + MOVE.STEP + Math.max(0, dy)) { if (top < best) { best = top; res.ground = r * s.level.w + c; } }
   } else if (v === T.ONEWAY && !dropThrough) {
    if (bottom >= top && prevBottom <= top + 1.5) { if (top < best) { best = top; res.ground = r * s.level.w + c; } }
   }
  }
 }
 // slopes under the foot centre
 const rf = Math.floor((bottom - 1) / TILE);
 for (let r = rf - 1; r <= rf + 1; r++) {
  const v = tileOf(s, cc, r);
  if (!isSlope(v)) continue;
  const fy = slopeFloor(v, cc, r, cx);
  if (bottom >= fy - (snap ? 16 : 0) && prevBottom <= fy + 18 && fy <= best) { best = fy; res.slope = v === T.SLOPE_UP ? 1 : -1; res.ground = r * s.level.w + cc; }
 }
 // snap to flat ground just below while grounded (keeps contact when leaving a slope)
 if (best === Infinity && snap) {
  const r = Math.floor((bottom + 14) / TILE);
  for (let c = c0; c <= c1; c++) { const v = tileOf(s, c, r); const top = r * TILE; if ((isFullSolid(v) || v === T.ONEWAY) && top - bottom <= 14 && top >= bottom - 1) best = Math.min(best, top); }
  if (best !== Infinity) res.ground = r * s.level.w + c0;
 }
 if (best !== Infinity) { b.y = best - b.h; b.vy = 0; res.landed = true; }
 return res;
}

/* ------------------------------ create -------------------------------- */
export function createQuestState(character: string, levelIndex = 0, carry?: Partial<Pick<Player, 'lives' | 'motes' | 'score' | 'sparks'>>): QuestState {
 const level = buildLevel(levelIndex);
 const traits = kithTraits(character);
 const p: Player = {
  character, traits, x: level.start.x - MOVE.W / 2, y: level.start.y - MOVE.H, w: MOVE.W, h: MOVE.H, vx: 0, vy: 0,
  facing: 1, onGround: true, groundT: 1, onSlope: 0, onPlat: -1, coyote: 0, jumpBuf: 0, jumpHeld: false, airJumps: traits.airJumps, glideT: MOVE.GLIDE_TIME * traits.glideMul, gliding: false,
  wallDir: 0, wallLock: 0, wallSliding: false, dashT: 0, dashCd: 0, canDash: true, rolling: false, crouch: false, spin: 0,
  attackT: 0, attackCd: 0, attackAim: 0, attackHit: new Set(), runT: 0, topSpeed: false,
  hurtT: 0, invuln: 0, hp: MAX_HP, maxHp: MAX_HP, lives: carry?.lives ?? START_LIVES,
  motes: carry?.motes ?? 0, sparks: carry?.sparks ?? 3, seeds: [false, false, false], score: carry?.score ?? 0,
  dead: 0, safe: { x: level.start.x, y: level.start.y }, checkpoint: { x: level.start.x, y: level.start.y },
  bash: null, land: 0, anim: 'idle', animT: 0,
 };
 const s: QuestState = {
  level, levelIndex, tiles: level.tiles.slice(), time: -1.6, phase: 'intro', phaseT: 0,
  player: p, ents: [], shots: [], boss: null, crumble: new Map(), broken: new Map(),
  events: [], seq: 0, nextId: 1, rng: 0x51ed ^ (levelIndex * 7919), sign: -1, signT: 0, arenaLocked: false, prev: emptyQuestInput(), slow: 0, result: null,
 };
 let seedIdx = 0;
 for (const d of level.ents) {
  if (d.kind === 'boss') {
   s.boss = { x: d.x - 40, y: d.y - 110, vx: 0, vy: 0, w: 80, h: 110, hp: 30, maxHp: 30, state: 'dormant', stateT: 0, phase: 0, hurt: 0, dir: -1, tx: 0, ty: 0, volleys: 0, next: 0 };
   continue;
  }
  const e = spawn(s, d.kind, d.x, d.y, d.data ?? 0);
  if (d.kind === 'seed') e.data = seedIdx++;
 }
 // seeds hidden inside bloom boxes count too
 for (const k of Object.keys(level.boxes)) if (level.boxes[+k] === 'seed') seedIdx++;
 return s;
}

function spawn(s: QuestState, kind: EntKind, x: number, y: number, data = 0): Ent {
 const [w, h] = ENT_SIZE[kind] || [24, 24];
 const e: Ent = { id: s.nextId++, kind, x: x - w / 2, y: y - h, w, h, vx: 0, vy: 0, alive: true, hp: ENT_HP[kind] ?? 1, t: 0, dir: -1, data, onGround: false, ox: x - w / 2, oy: y - h, hurt: 0, state: 'idle', stateT: 0 };
 if (kind === 'mote' || kind === 'seed' || kind === 'petal' || kind === 'spark') { e.x = x - w / 2; e.y = y - h - 6; e.oy = e.y; }
 if (kind === 'flyer') { e.y = y - h; e.oy = e.y; }
 if (kind === 'bashNode') { e.y = y - h / 2; e.oy = e.y; }
 if (kind === 'platH' || kind === 'platV') { e.y = y; e.oy = y; }
 if (kind === 'walker' || kind === 'thornback') e.vx = kind === 'walker' ? -60 : -40;
 s.ents.push(e);
 return e;
}

/* ------------------------------ damage -------------------------------- */
function hurtPlayer(s: QuestState, fromX: number, amount = 1) {
 const p = s.player;
 if (p.invuln > 0 || p.dead > 0 || s.phase !== 'play') return;
 p.hp -= amount; p.invuln = MOVE.HURT_INVULN; p.hurtT = .35;
 p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * MOVE.KNOCK_X; p.vy = -MOVE.KNOCK_Y; p.onGround = false;
 p.rolling = false; p.dashT = 0; p.gliding = false; p.bash = null;
 emit(s, 'hurt', p.x + p.w / 2, p.y + p.h / 2);
 if (p.hp <= 0) killPlayer(s);
}
function killPlayer(s: QuestState) {
 const p = s.player;
 if (p.dead > 0) return;
 p.dead = 1.6; p.hp = 0; p.vx = 0; p.vy = -520; p.lives--;
 emit(s, 'die', p.x + p.w / 2, p.y + p.h / 2);
}
function respawn(s: QuestState, at: { x: number; y: number }, full: boolean) {
 const p = s.player;
 p.x = at.x - p.w / 2; p.y = at.y - p.h; p.vx = 0; p.vy = 0; p.dead = 0; p.invuln = 1.2; p.rolling = false; p.dashT = 0; p.bash = null;
 if (full) p.hp = p.maxHp;
 p.onGround = true; p.airJumps = p.traits.airJumps; p.canDash = true;
 emit(s, 'respawn', at.x, at.y);
}
function damageEnt(s: QuestState, e: Ent, dmg: number, fromX: number, how: string) {
 if (!e.alive || e.hurt > 0) return false;
 e.hp -= dmg; e.hurt = .22;
 if (e.kind !== 'turret' && e.kind !== 'lantern') { e.vx = (e.x + e.w / 2 < fromX ? -1 : 1) * 180; e.vy = -220; }
 if (e.hp <= 0) {
  e.alive = false;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  if (e.kind === 'lantern') {
   emit(s, 'lantern', cx, cy);
   drop(s, e.data === 1 ? 'petal' : 'spark', cx, cy);
  } else {
   emit(s, 'pop', cx, cy, e.kind);
   s.player.score += e.kind === 'thornback' ? 500 : e.kind === 'turret' ? 300 : 200;
   if (rand(s) < .5) drop(s, 'mote', cx, cy);
  }
 } else emit(s, 'hit', e.x + e.w / 2, e.y + e.h / 2, how);
 return true;
}
function drop(s: QuestState, kind: EntKind, x: number, y: number) {
 const e = spawn(s, kind, x, y + 9);
 e.vy = -360; e.vx = (rand(s) - .5) * 120; e.state = 'pop'; e.stateT = 0;
 if (kind === 'seed') e.data = seedSlotFree(s);
 return e;
}
function seedSlotFree(s: QuestState) {
 const used = new Set(s.ents.filter(e => e.kind === 'seed').map(e => e.data));
 for (let i = 0; i < 3; i++) if (!used.has(i) && !s.player.seeds[i]) return i;
 return 2;
}

function damageBoss(s: QuestState, dmg: number, how: string) {
 const B = s.boss;
 if (!B || B.hurt > 0 || B.state === 'dormant' || B.state === 'intro' || B.state === 'dying' || B.state === 'dead') return false;
 B.hp -= dmg; B.hurt = .45;
 emit(s, 'bossHit', B.x + B.w / 2, B.y + B.h / 2, how);
 if (B.hp <= 0) { B.hp = 0; B.state = 'dying'; B.stateT = 0; s.shots.forEach(sh => { if (!sh.friendly) sh.alive = false; }); emit(s, 'bossDown', B.x + B.w / 2, B.y + B.h / 2); s.player.score += 5000; }
 else if (B.hp <= 20 && B.phase === 0) { B.phase = 1; emit(s, 'bossPhase', B.x + B.w / 2, B.y + B.h / 2, '2'); }
 else if (B.hp <= 10 && B.phase === 1) { B.phase = 2; emit(s, 'bossPhase', B.x + B.w / 2, B.y + B.h / 2, '3'); }
 return true;
}

/* ----------------------------- tile events ---------------------------- */
function openBox(s: QuestState, idx: number) {
 const v = s.tiles[idx];
 const c = idx % s.level.w, r = Math.floor(idx / s.level.w);
 const cx = c * TILE + TILE / 2, cy = r * TILE;
 if (v === T.BOX) {
  s.tiles[idx] = T.USED;
  const prize = s.level.boxes[idx] || 'mote';
  emit(s, 'box', cx, cy, prize);
  if (prize === 'motes5') { for (let i = 0; i < 5; i++) { const m = drop(s, 'mote', cx, cy); m.vx = (i - 2) * 70; m.vy = -420 - i % 2 * 60; } }
  else drop(s, prize === 'mote' ? 'mote' : prize, cx, cy);
  // bop enemies standing on top
  for (const e of s.ents) if (e.alive && isEnemy(e.kind) && Math.abs(e.x + e.w / 2 - cx) < 30 && Math.abs(e.y + e.h - cy) < 6) damageEnt(s, e, 9, cx, 'bump');
 } else if (v === T.BRICK) {
  s.tiles[idx] = T.EMPTY; s.broken.set(idx, s.time);
  emit(s, 'brick', cx, cy + TILE / 2);
  s.player.score += 50;
 }
}

/* -------------------------------- step -------------------------------- */
export function stepQuest(s: QuestState, input: QuestInput, dt: number) {
 const prev = s.prev;
 const edge = { jump: input.jump && !prev.jump, attack: input.attack && !prev.attack, dash: input.dash && !prev.dash, special: input.special && !prev.special, down: input.y > .5 && !(prev.y > .5) };
 s.prev = { ...input };
 if (s.slow > 0) { s.slow -= dt; dt *= .12; }
 s.time += dt;
 if (s.phase === 'intro') { if (s.time >= 0) { s.phase = 'play'; emit(s, 'go', 0, 0); } else return; }
 if (s.phase === 'clear' || s.phase === 'over') { s.phaseT += dt; stepEnts(s, dt); return; }
 const p = s.player;
 p.animT += dt;
 if (s.signT > 0) s.signT -= dt;

 // death / respawn
 if (p.dead > 0) {
  p.dead -= dt; p.vy = Math.min(MOVE.MAX_FALL, p.vy + 1500 * dt); p.y += p.vy * dt;
  if (p.dead <= 0) {
   if (p.lives < 0) { p.lives = 0; s.phase = 'over'; s.phaseT = 0; emit(s, 'gameover', 0, 0); return; }
   respawn(s, p.checkpoint, true);
   if (s.arenaLocked && s.boss && s.boss.state !== 'dead') { s.boss.state = 'hover'; s.boss.stateT = 0; s.shots = []; }
  }
  stepEnts(s, dt);
  return;
 }

 // timers
 p.invuln = Math.max(0, p.invuln - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.wallLock = Math.max(0, p.wallLock - dt);
 p.dashCd = Math.max(0, p.dashCd - dt); p.attackCd = Math.max(0, p.attackCd - dt); p.coyote = Math.max(0, p.coyote - dt);
 p.jumpBuf = Math.max(0, p.jumpBuf - dt); p.land = Math.max(0, p.land - dt);
 if (edge.jump) p.jumpBuf = MOVE.BUFFER;
 p.jumpHeld = input.jump;
 const ix = Math.abs(input.x) > .25 ? sign(input.x) : 0;

 // ---- bash (aim freeze, then launch) ----
 if (p.bash) {
  p.bash.t -= dt / .12; // real-time feel while the world is slowed
  if (ix || Math.abs(input.y) > .25) { const l = Math.hypot(ix, input.y) || 1; p.bash.ax = ix / l; p.bash.ay = (Math.abs(input.y) > .25 ? sign(input.y) : 0) / l; const n = Math.hypot(p.bash.ax, p.bash.ay) || 1; p.bash.ax /= n; p.bash.ay /= n; }
  if (p.bash.t <= 0 || (!input.dash && p.bash.t < MOVE.BASH_FREEZE - .08)) launchBash(s);
  else { s.slow = Math.max(s.slow, .02); stepEnts(s, dt); return; }
 }

 // ---- dash / bash trigger ----
 if (edge.dash && p.dashCd <= 0) {
  const tgt = findBashTarget(s);
  if (tgt) {
   p.bash = { t: MOVE.BASH_FREEZE, target: tgt.id, kind: tgt.kind, ax: ix || 0, ay: ix ? 0 : -1 };
   if (ix && Math.abs(input.y) > .25) { const n = Math.SQRT1_2; p.bash.ax = ix * n; p.bash.ay = sign(input.y) * n; }
   p.vx = 0; p.vy = 0; p.dashT = 0; p.rolling = false; s.slow = .02;
   emit(s, 'bashAim', p.x + p.w / 2, p.y + p.h / 2);
   stepEnts(s, dt);
   return;
  }
  if (p.canDash) {
   p.dashT = MOVE.DASH_T; p.dashCd = MOVE.DASH_CD; p.canDash = p.onGround; p.rolling = false; p.gliding = false;
   if (ix) p.facing = ix as 1 | -1;
   p.vy = 0; emit(s, 'dash', p.x + p.w / 2, p.y + p.h / 2);
  }
 }

 // ---- crouch / roll / spin charge ----
 const down = input.y > .5;
 if (p.onGround && !p.rolling) {
  if (down && Math.abs(p.vx) >= MOVE.ROLL_MIN) { setRoll(s, true); emit(s, 'roll', p.x + p.w / 2, p.y + p.h); }
  else if (down && Math.abs(p.vx) < 60) {
   p.crouch = true;
   if (edge.jump) { p.spin = Math.min(MOVE.SPIN_MAX, p.spin + .45); p.jumpBuf = 0; emit(s, 'rev', p.x + p.w / 2, p.y + p.h, String(p.spin)); }
  } else p.crouch = false;
  if (!down && p.spin > 0) { setRoll(s, true); p.vx = p.facing * (480 + p.spin * 270); p.spin = 0; p.crouch = false; emit(s, 'spinRelease', p.x + p.w / 2, p.y + p.h); }
  if (!down) p.crouch = false;
 } else if (!p.onGround) { p.crouch = false; p.spin = 0; }
 p.spin = Math.max(0, p.spin - dt * .25);

 // ---- horizontal ----
 const topMul = p.traits.runMul;
 if (ix && sign(p.vx) === ix && Math.abs(p.vx) > MOVE.RUN * .8 * topMul) p.runT += dt; else if (!ix || sign(p.vx) !== ix) p.runT = Math.max(0, p.runT - dt * 3);
 p.topSpeed = p.runT > MOVE.TOP_AFTER;
 const maxRun = (p.topSpeed ? MOVE.RUN_TOP : MOVE.RUN) * topMul;
 if (p.dashT > 0) {
  p.dashT -= dt; p.vx = p.facing * MOVE.DASH_V; p.vy = 0;
  if (p.dashT <= 0) p.vx = p.facing * Math.max(maxRun, MOVE.RUN_TOP * .9);
 } else if (p.rolling) {
  p.vx = approach(p.vx, 0, MOVE.ROLL_FRIC * dt);
  if (ix) p.vx += ix * 220 * dt;
  if (p.onSlope && p.onGround) p.vx += -p.onSlope * MOVE.ROLL_SLOPE * dt;
  if (p.onGround && Math.abs(p.vx) < 70) setRoll(s, false);
 } else if (p.crouch) {
  p.vx = approach(p.vx, 0, MOVE.DECEL * dt);
 } else {
  const ctl = p.wallLock > 0 ? 0 : ix;
  const ground = p.onGround;
  if (ctl) {
   if (sign(p.vx) === -ctl && Math.abs(p.vx) > 40) { p.vx = approach(p.vx, 0, (ground ? MOVE.SKID : MOVE.AIR_ACCEL * 1.3) * dt); if (ground && Math.abs(p.vx) > 200) emit(s, 'skid', p.x + p.w / 2, p.y + p.h); }
   else if (Math.abs(p.vx) > maxRun && sign(p.vx) === ctl) p.vx = approach(p.vx, ctl * maxRun, MOVE.OVER_DECAY * dt);
   else p.vx = approach(p.vx, ctl * maxRun, (ground ? MOVE.ACCEL : MOVE.AIR_ACCEL) * dt);
   p.facing = ctl as 1 | -1;
  } else if (p.wallLock <= 0) p.vx = approach(p.vx, 0, (ground ? MOVE.DECEL : MOVE.AIR_DECEL) * dt);
  if (p.onSlope && ground) p.vx += -p.onSlope * MOVE.RUN_SLOPE * dt * (ctl ? .55 : .25);
 }

 // ---- jumping ----
 p.wallDir = !p.onGround ? (touchingWall(s, p, 1) ? 1 : touchingWall(s, p, -1) ? -1 : 0) : 0;
 if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0) && !p.crouch) {
  const speedBonus = Math.abs(p.vx) * MOVE.JUMP_SPEED_BONUS;
  p.vy = -(MOVE.JUMP * p.traits.jumpMul + speedBonus);
  p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.onPlat = -1; p.land = 0;
  emit(s, 'jump', p.x + p.w / 2, p.y + p.h, p.rolling ? 'spin' : '');
 } else if (p.jumpBuf > 0 && p.wallDir && !p.onGround && p.dashT <= 0) {
  p.vx = -p.wallDir * MOVE.WALL_JUMP_X; p.vy = -MOVE.WALL_JUMP_Y; p.wallLock = MOVE.WALL_LOCK; p.facing = (-p.wallDir) as 1 | -1;
  p.jumpBuf = 0; p.airJumps = p.traits.airJumps; p.canDash = true; p.rolling = false; p.gliding = false; p.glideT = MOVE.GLIDE_TIME * p.traits.glideMul;
  emit(s, 'walljump', p.x + (p.wallDir > 0 ? p.w : 0), p.y + p.h / 2);
 } else if (edge.jump && !p.onGround && p.airJumps > 0 && p.dashT <= 0) {
  p.vy = -MOVE.DJUMP * p.traits.jumpMul; p.airJumps--; p.jumpBuf = 0; p.rolling = false; p.gliding = false;
  setRoll(s, false);
  emit(s, 'djump', p.x + p.w / 2, p.y + p.h);
 }

 // ---- gravity / glide / wall slide ----
 p.wallSliding = false; p.gliding = false;
 if (p.dashT <= 0) {
  const g = p.vy < 0 ? (p.jumpHeld || p.rolling && !p.onGround ? MOVE.G_UP : MOVE.G_CUT) : MOVE.G_DOWN;
  p.vy += g * dt;
  if (!p.onGround && p.vy > 0 && p.wallDir && ix === p.wallDir) { p.vy = Math.min(p.vy, MOVE.WALL_SLIDE); p.wallSliding = true; p.facing = (-p.wallDir) as 1 | -1; }
  else if (!p.onGround && p.vy > 0 && p.jumpHeld && p.airJumps === 0 && p.glideT > 0 && !p.rolling) {
   p.vy = Math.min(p.vy, MOVE.GLIDE_FALL); p.glideT -= dt; p.gliding = true;
  }
  p.vy = Math.min(p.vy, MOVE.MAX_FALL);
 }

 // ---- moving platforms carry ----
 const wasGround = p.onGround;
 if (p.onPlat >= 0) { const pl = s.ents.find(e => e.id === p.onPlat); if (pl) { p.x += pl.vx * dt; p.y += pl.vy * dt; } }

 // ---- integrate ----
 const step = wasGround ? MOVE.STEP : 0;
 const wall = moveX(s, p, p.vx * dt, step);
 if (wall) { if (p.rolling && Math.abs(p.vx) > 300) emit(s, 'bonk', p.x + (wall > 0 ? p.w : 0), p.y + p.h / 2); p.vx = 0; if (p.dashT > 0) p.dashT = 0; }
 const prevBottom = p.y + p.h;
 const dropThrough = down && edge.jump && false;
 const ry = moveY(s, p, p.vy * dt, wasGround && p.vy >= 0, dropThrough);
 for (const idx of ry.head) { const v = s.tiles[idx]; if (v === T.BOX || v === T.BRICK) openBox(s, idx); else emit(s, 'head', p.x + p.w / 2, p.y); }
 p.onGround = ry.landed; p.onSlope = ry.landed ? ry.slope : 0;
 // moving platform landing
 if (p.vy >= 0 || ry.landed) {
  p.onPlat = -1;
  for (const pl of s.ents) {
   if (!pl.alive || (pl.kind !== 'platH' && pl.kind !== 'platV')) continue;
   const bottom = p.y + p.h;
   if (p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && bottom >= pl.y - .5 && prevBottom <= pl.y + 8 + Math.max(0, pl.vy * dt)) {
    p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.onPlat = pl.id; p.onSlope = 0;
   }
  }
 }
 if (p.onGround) {
  if (!wasGround) {
   p.land = .14; emit(s, 'land', p.x + p.w / 2, p.y + p.h, String(Math.round(Math.abs(prevBottom))));
   if (p.traits.heavy && p.vy === 0 && prevBottom) { /* heavy landing handled by renderer shake */ }
  }
  p.coyote = MOVE.COYOTE; p.airJumps = p.traits.airJumps; p.canDash = true; p.glideT = MOVE.GLIDE_TIME * p.traits.glideMul; p.groundT += dt;
  // crumble tiles + safe ground
  if (ry.ground >= 0 && s.tiles[ry.ground] === T.CRUMBLE && !s.crumble.has(ry.ground)) { s.crumble.set(ry.ground, .45); emit(s, 'crumble', (ry.ground % s.level.w) * TILE + 16, Math.floor(ry.ground / s.level.w) * TILE); }
  if (p.groundT > .2 && p.onPlat < 0 && ry.ground >= 0 && s.tiles[ry.ground] === T.SOLID && !p.rolling && p.invuln <= 0) {
   const cx = p.x + p.w / 2, c = Math.floor(cx / TILE), r = Math.floor((p.y + p.h) / TILE);
   if (isFullSolid(tileOf(s, c - 1, r)) && isFullSolid(tileOf(s, c + 1, r))) p.safe = { x: cx, y: p.y + p.h };
  }
 } else { p.groundT = 0; if (wasGround && p.vy >= 0) p.coyote = MOVE.COYOTE; else if (wasGround) p.coyote = 0; }

 // ---- spikes / pits ----
 {
  const r = Math.floor((p.y + p.h - 4) / TILE), c0 = Math.floor((p.x + 4) / TILE), c1 = Math.floor((p.x + p.w - 4) / TILE);
  for (let c = c0; c <= c1; c++) if (tileOf(s, c, r) === T.SPIKES && p.y + p.h > r * TILE + 12) { hurtPlayer(s, p.x + p.w / 2 - p.facing * 10); p.vy = -620; p.vx *= .3; break; }
 }
 if (p.y > s.level.h * TILE + 40) {
  p.hp -= 1; emit(s, 'fall', p.x + p.w / 2, s.level.h * TILE);
  if (p.hp <= 0) killPlayer(s); else respawn(s, s.arenaLocked ? p.checkpoint : p.safe, false);
 }

 // ---- lash attack ----
 if (edge.attack && p.attackCd <= 0 && !p.rolling && !p.bash) {
  p.attackT = MOVE.LASH_T; p.attackCd = MOVE.LASH_CD; p.attackHit = new Set();
  p.attackAim = input.y < -.5 ? -1 : (input.y > .5 && !p.onGround) ? 1 : 0;
  if (ix) p.facing = ix as 1 | -1;
  emit(s, 'lash', p.x + p.w / 2, p.y + p.h / 2, String(p.attackAim));
 }
 if (p.attackT > 0) {
  const e0 = MOVE.LASH_T - p.attackT;
  p.attackT -= dt;
  if (e0 > .045 && e0 < .2) lashHits(s);
 }

 // ---- sub-weapon ----
 if (edge.special && p.sparks > 0 && !p.bash) {
  p.sparks--;
  const sub = p.traits.sub, cx = p.x + p.w / 2, cy = p.y + p.h * .4;
  const shot: Shot = { id: s.nextId++, x: cx + p.facing * 14, y: cy, vx: 0, vy: 0, r: 9, friendly: true, kind: sub, t: 0, alive: true, dmg: 2 };
  if (sub === 'arc') { shot.vx = p.facing * 330 + p.vx * .4; shot.vy = -520; }
  else if (sub === 'bolt') { shot.vx = p.facing * 760; shot.r = 7; }
  else if (sub === 'ring') { shot.vx = p.facing * 560; shot.r = 12; }
  else { shot.vx = p.facing * 420; shot.y = p.y + p.h - 10; shot.r = 11; shot.vy = 0; }
  s.shots.push(shot);
  emit(s, 'sub', cx, cy, sub);
 }

 // ---- anim state ----
 p.anim = p.dead > 0 ? 'dead' : p.bash ? 'bash' : p.hurtT > 0 ? 'hurt' : p.dashT > 0 ? 'dash' : p.rolling ? 'roll' : p.wallSliding ? 'wall' : p.gliding ? 'glide' : !p.onGround ? (p.vy < 0 ? 'jump' : 'fall') : p.crouch ? (p.spin > 0 ? 'rev' : 'crouch') : Math.abs(p.vx) > 20 ? (p.topSpeed ? 'sprint' : 'run') : 'idle';

 stepEnts(s, dt);
 playerVsWorld(s, prevBottom);
 stepBoss(s, dt);
 stepShots(s, dt);
 // crumble timers
 for (const [idx, t] of s.crumble) {
  const nt = t - dt;
  if (nt <= 0 && s.tiles[idx] === T.CRUMBLE) { s.tiles[idx] = T.EMPTY; s.crumble.set(idx, -3); emit(s, 'crumbleFall', (idx % s.level.w) * TILE + 16, Math.floor(idx / s.level.w) * TILE + 8); }
  else if (nt < -6) { s.tiles[idx] = T.CRUMBLE; s.crumble.delete(idx); }
  else s.crumble.set(idx, nt);
 }
 if (s.time > 0 && s.player.motes >= 100) { s.player.motes -= 100; s.player.lives++; emit(s, 'oneup', p.x + p.w / 2, p.y); }
}

function setRoll(s: QuestState, on: boolean) {
 const p = s.player;
 if (p.rolling === on) return;
 if (on) { p.y += MOVE.H - MOVE.H_ROLL; p.h = MOVE.H_ROLL; p.rolling = true; }
 else {
  // only stand up if there is headroom
  const c0 = Math.floor((p.x + 2) / TILE), c1 = Math.floor((p.x + p.w - 2) / TILE), r = Math.floor((p.y + p.h - MOVE.H) / TILE);
  for (let c = c0; c <= c1; c++) if (isFullSolid(tileOf(s, c, r))) return;
  p.y -= MOVE.H - MOVE.H_ROLL; p.h = MOVE.H; p.rolling = false;
 }
}

function findBashTarget(s: QuestState): { id: number; kind: 'node' | 'enemy' | 'shot' } | null {
 const p = s.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
 let best: { id: number; kind: "node" | "enemy" | "shot" } | null = null, bd: number = MOVE.BASH_RANGE;
 for (const e of s.ents) {
  if (!e.alive || !(e.kind === 'bashNode' || (isEnemy(e.kind) && e.kind !== 'turret'))) continue;
  const d = Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py);
  if (d < bd) { bd = d; best = { id: e.id, kind: e.kind === 'bashNode' ? 'node' : 'enemy' }; }
 }
 for (const sh of s.shots) {
  if (!sh.alive || sh.friendly || sh.kind === 'shock') continue;
  const d = Math.hypot(sh.x - px, sh.y - py);
  if (d < bd + 10) { bd = d; best = { id: sh.id, kind: 'shot' }; }
 }
 return best;
}

function launchBash(s: QuestState) {
 const p = s.player, b = p.bash!;
 p.bash = null; s.slow = 0;
 let ax = b.ax, ay = b.ay;
 if (!ax && !ay) ay = -1;
 const n = Math.hypot(ax, ay) || 1; ax /= n; ay /= n;
 p.vx = ax * MOVE.BASH_V; p.vy = ay * MOVE.BASH_V * (ay < 0 ? 1 : .6);
 if (ax) p.facing = sign(ax) as 1 | -1;
 p.airJumps = p.traits.airJumps; p.canDash = true; p.onGround = false; p.glideT = MOVE.GLIDE_TIME * p.traits.glideMul;
 p.wallLock = .18; p.rolling = false; p.invuln = Math.max(p.invuln, .25);
 p.runT = MOVE.TOP_AFTER + .2;
 const px = p.x + p.w / 2, py = p.y + p.h / 2;
 if (b.kind === 'shot') {
  const sh = s.shots.find(x => x.id === b.target);
  if (sh) { sh.friendly = true; sh.bounced = true; sh.vx = -ax * 620; sh.vy = -ay * 620; sh.dmg = 3; sh.t = 0; }
 } else if (b.kind === 'enemy') {
  const e = s.ents.find(x => x.id === b.target);
  if (e && e.alive) { e.vx = -ax * 520; e.vy = -ay * 520 - 120; e.state = 'flung'; e.stateT = 0; }
 }
 emit(s, 'bash', px, py, b.kind);
}

function lashBox(s: QuestState) {
 const p = s.player;
 const reach = MOVE.LASH_REACH, hh = MOVE.LASH_H;
 if (p.attackAim === -1) return { x: p.x + p.w / 2 - 22, y: p.y - reach + 10, w: 44, h: reach };
 if (p.attackAim === 1) return { x: p.x + p.w / 2 - 22, y: p.y + p.h - 6, w: 44, h: reach - 10 };
 return { x: p.facing > 0 ? p.x + p.w - 4 : p.x - reach + 4, y: p.y + p.h * .35 - hh / 2, w: reach, h: hh };
}
export const playerLashBox = lashBox;

function lashHits(s: QuestState) {
 const p = s.player, box = lashBox(s);
 let pogo = false;
 for (const e of s.ents) {
  if (!e.alive || p.attackHit.has(e.id)) continue;
  if (!(isEnemy(e.kind) || e.kind === 'lantern')) continue;
  if (overlap(box, e)) { p.attackHit.add(e.id); if (damageEnt(s, e, 1, p.x + p.w / 2, 'lash')) pogo = true; }
 }
 for (const sh of s.shots) {
  if (!sh.alive || sh.friendly || sh.kind === 'shock') continue;
  if (sh.x > box.x - sh.r && sh.x < box.x + box.w + sh.r && sh.y > box.y - sh.r && sh.y < box.y + box.h + sh.r) {
   sh.friendly = true; sh.bounced = true; sh.vx = -sh.vx * 1.2 || p.facing * 500; sh.vy = -sh.vy; sh.dmg = 3; emit(s, 'parry', sh.x, sh.y); pogo = true;
  }
 }
 const B = s.boss;
 if (B && !p.attackHit.has(-1) && overlap(box, B)) { p.attackHit.add(-1); if (damageBoss(s, 1, 'lash')) pogo = true; }
 // bricks / boxes
 const c0 = Math.floor(box.x / TILE), c1 = Math.floor((box.x + box.w) / TILE), r0 = Math.floor(box.y / TILE), r1 = Math.floor((box.y + box.h) / TILE);
 for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
  const idx = r * s.level.w + c, v = tileOf(s, c, r);
  if ((v === T.BRICK || v === T.BOX) && !p.attackHit.has(-1000 - idx)) { p.attackHit.add(-1000 - idx); openBox(s, idx); pogo = true; }
 }
 if (pogo && p.attackAim === 1) { p.vy = -560; p.airJumps = p.traits.airJumps; p.canDash = true; }
}

/* ------------------------- player vs entities ------------------------- */
function playerVsWorld(s: QuestState, prevBottom: number) {
 const p = s.player;
 if (p.dead > 0) return;
 const pc = p.x + p.w / 2;
 for (const e of s.ents) {
  if (!e.alive) continue;
  if (!overlap(p, e)) {
   if (e.kind === 'bashNode') continue;
   if (e.kind === 'sign' && s.sign === e.data && s.signT <= 0) { /* out of range */ }
   continue;
  }
  switch (e.kind) {
   case 'mote': e.alive = false; p.motes++; p.score += 10; emit(s, 'mote', e.x + e.w / 2, e.y + e.h / 2); break;
   case 'seed': e.alive = false; p.seeds[clamp(e.data, 0, 2)] = true; p.score += 2000; emit(s, 'seed', e.x + e.w / 2, e.y + e.h / 2, String(e.data)); break;
   case 'petal': e.alive = false; p.hp = Math.min(p.maxHp, p.hp + 1); emit(s, 'petal', e.x + e.w / 2, e.y + e.h / 2); break;
   case 'spark': e.alive = false; p.sparks = Math.min(99, p.sparks + 3); emit(s, 'spark', e.x + e.w / 2, e.y + e.h / 2); break;
   case 'checkpoint':
    if (e.state !== 'lit') { e.state = 'lit'; p.checkpoint = { x: e.x + e.w / 2, y: e.y + e.h }; p.hp = Math.max(p.hp, Math.min(p.maxHp, p.hp + 1)); emit(s, 'checkpoint', e.x + e.w / 2, e.y + 10); }
    break;
   case 'goal':
    if (s.phase === 'play') {
     s.phase = 'clear'; s.phaseT = 0;
     const seeds = p.seeds.filter(Boolean).length;
     const timeBonus = Math.max(0, Math.round((s.level.par - s.time) * 20));
     p.score += 1000 + timeBonus;
     s.result = { time: s.time, motes: p.motes, seeds, score: p.score };
     emit(s, 'clear', e.x + e.w / 2, e.y + 20);
    }
    break;
   case 'spring':
    if (p.vy >= 0 && prevBottom <= e.y + 10) { p.vy = -MOVE.SPRING; p.y = e.y - p.h; p.onGround = false; p.airJumps = p.traits.airJumps; p.canDash = true; e.stateT = .25; setRoll(s, false); emit(s, 'spring', e.x + e.w / 2, e.y); }
    break;
   case 'boostR': case 'boostL':
    if (p.onGround) { const d = e.kind === 'boostR' ? 1 : -1; if (sign(p.vx) !== d || Math.abs(p.vx) < MOVE.BOOST) { p.vx = d * MOVE.BOOST; p.facing = d as 1 | -1; p.runT = MOVE.TOP_AFTER + .4; emit(s, 'boost', e.x + e.w / 2, e.y); } }
    break;
   case 'sign': if (s.sign !== e.data || s.signT < 1) { if (s.sign !== e.data) emit(s, 'sign', e.x, e.y); s.sign = e.data; s.signT = 4; } break;
   default:
    if (!isEnemy(e.kind)) break;
    if (e.state === 'flung') break;
    {
     const stomp = p.vy > 60 && prevBottom <= e.y + Math.min(14, e.h * .5) + 4;
     if (p.rolling || p.dashT > 0 && p.invuln > 0) {
      if (e.kind === 'thornback' && !p.rolling) { hurtPlayer(s, e.x + e.w / 2); break; }
      damageEnt(s, e, e.kind === 'thornback' ? 1 : 9, pc, 'roll');
      if (!p.onGround) { p.vy = -MOVE.STOMP * .8; }
      else if (e.alive) { p.vx = -p.vx * .5; setRoll(s, false); }
     } else if (stomp && e.kind !== 'thornback') {
      damageEnt(s, e, 9, pc, 'stomp');
      p.vy = -(p.jumpHeld ? MOVE.STOMP_HELD : MOVE.STOMP); p.airJumps = p.traits.airJumps; p.canDash = true; p.glideT = MOVE.GLIDE_TIME * p.traits.glideMul;
      p.y = e.y - p.h;
      emit(s, 'stomp', pc, e.y);
     } else hurtPlayer(s, e.x + e.w / 2);
    }
  }
 }
 // boss body
 const B = s.boss;
 if (B && B.state !== 'dormant' && B.state !== 'dying' && B.state !== 'dead' && overlap(p, B)) {
  const stomp = p.vy > 60 && prevBottom <= B.y + 24;
  if (stomp) { damageBoss(s, 2, 'stomp'); p.vy = -MOVE.STOMP_HELD; p.airJumps = p.traits.airJumps; p.canDash = true; emit(s, 'stomp', pc, B.y); }
  else if (p.rolling) { damageBoss(s, 1, 'roll'); p.vx = -p.vx * .6; p.vy = -400; }
  else hurtPlayer(s, B.x + B.w / 2);
 }
 // boss arena lock
 const A = s.level.arena;
 if (A && B && B.state === 'dormant' && pc > (A.c0 + 4) * TILE) {
  s.arenaLocked = true; B.state = 'intro'; B.stateT = 0;
  for (let r = 0; r < s.level.h; r++) { const i0 = r * s.level.w + A.c0 - 1, i1 = r * s.level.w + A.c1 + 1; if (s.tiles[i0] === T.EMPTY) s.tiles[i0] = T.SOLID; if (s.tiles[i1] === T.EMPTY) s.tiles[i1] = T.SOLID; }
  p.checkpoint = { x: (A.c0 + 3) * TILE, y: p.y + p.h };
  emit(s, 'bossIntro', B.x + B.w / 2, B.y);
 }
}

/* ------------------------------ entities ------------------------------ */
function stepEnts(s: QuestState, dt: number) {
 const p = s.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
 for (const e of s.ents) {
  if (!e.alive) continue;
  e.t += dt; e.stateT += dt; e.hurt = Math.max(0, e.hurt - dt);
  switch (e.kind) {
   case 'mote': case 'seed': case 'petal': case 'spark':
    if (e.state === 'pop') {
     e.vy += 1500 * dt; e.vx = approach(e.vx, 0, 60 * dt);
     moveX(s, e, e.vx * dt, 0);
     const r = moveY(s, e, e.vy * dt, false, false);
     if (r.landed) { e.vy = 0; e.vx = 0; if (e.stateT > .25) e.state = 'rest'; }
     if (e.y > s.level.h * TILE) e.alive = false;
    }
    // mote magnet when close
    if (e.kind === 'mote' && Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py) < 70 && p.dead <= 0) { e.x += (px - e.x - e.w / 2) * Math.min(1, 9 * dt); e.y += (py - e.y - e.h / 2) * Math.min(1, 9 * dt); }
    break;
   case 'spring': e.stateT = Math.max(0, e.stateT - dt * 2); break;
   case 'platH': case 'platV': {
    const range = (e.data || 3) * TILE, ph = e.t * .7 + e.id;
    const nx = e.kind === 'platH' ? e.ox + Math.sin(ph) * range : e.ox;
    const ny = e.kind === 'platV' ? e.oy - (Math.sin(ph) * .5 + .5) * range : e.oy;
    e.vx = (nx - e.x) / dt; e.vy = (ny - e.y) / dt; e.x = nx; e.y = ny;
    break;
   }
   case 'walker': case 'thornback': case 'hopper': case 'flyer': case 'turret':
    stepEnemy(s, e, dt, px, py);
    break;
  }
 }
 if (s.ents.length > 400) s.ents = s.ents.filter(e => e.alive || e.kind === 'checkpoint');
}

function stepEnemy(s: QuestState, e: Ent, dt: number, px: number, py: number) {
 const near = Math.abs(e.x - px) < 900;
 if (!near && e.state !== 'flung') return;
 if (e.state === 'flung') {
  e.vy += 1800 * dt;
  const w = moveX(s, e, e.vx * dt, 0);
  const r = moveY(s, e, e.vy * dt, false, false);
  // flung enemies smash into others
  for (const o of s.ents) if (o !== e && o.alive && isEnemy(o.kind) && overlap(e, o)) { damageEnt(s, o, 9, e.x + e.w / 2, 'fling'); }
  if (s.boss && overlap(e, s.boss)) { damageBoss(s, 3, 'fling'); e.vx = -e.vx; }
  if (w || r.landed || e.stateT > 1.2) { damageEnt(s, e, 9, e.x, 'fling'); }
  if (e.y > s.level.h * TILE) e.alive = false;
  return;
 }
 switch (e.kind) {
  case 'walker': case 'thornback': {
   const speed = e.kind === 'walker' ? 60 : 42;
   if (e.hurt <= 0) e.vx = approach(e.vx, sign(e.vx || e.dir) * speed, 600 * dt);
   e.vy = Math.min(900, e.vy + 1800 * dt);
   const w = moveX(s, e, e.vx * dt, 0);
   const r = moveY(s, e, e.vy * dt, e.onGround, false);
   e.onGround = r.landed;
   if (w) e.vx = -w * speed;
   // turn at ledges
   if (e.onGround && e.hurt <= 0) { const ahead = e.vx > 0 ? e.x + e.w + 2 : e.x - 2; if (groundBelow(s, ahead, e.y + e.h - 4) > e.y + e.h + 20) e.vx = -e.vx; }
   e.dir = sign(e.vx) || e.dir;
   break;
  }
  case 'hopper': {
   e.vy = Math.min(900, e.vy + 1800 * dt);
   if (e.onGround) { e.vx = approach(e.vx, 0, 900 * dt); if (e.stateT > 1.25 && Math.abs(px - e.x) < 420) { e.vy = -620; e.vx = sign(px - e.x - e.w / 2) * 150; e.stateT = 0; e.dir = sign(e.vx) || -1; } }
   const w = moveX(s, e, e.vx * dt, 0); if (w) e.vx = -e.vx;
   const r = moveY(s, e, e.vy * dt, false, false); if (r.landed && !e.onGround) e.stateT = 0;
   e.onGround = r.landed;
   break;
  }
  case 'flyer': {
   if (e.state === 'idle') {
    e.x = e.ox + Math.sin(e.t * 1.3 + e.id) * 60; e.y = e.oy + Math.sin(e.t * 2.6) * 14;
    e.dir = Math.cos(e.t * 1.3 + e.id) > 0 ? 1 : -1;
    if (Math.abs(px - e.x) < 240 && py > e.y && e.stateT > 1.5) { e.state = 'swoop'; e.stateT = 0; const d = Math.hypot(px - e.x, py - e.y) || 1; e.vx = (px - e.x) / d * 330; e.vy = (py - e.y) / d * 330; e.dir = sign(e.vx) || 1; }
   } else if (e.state === 'swoop') {
    e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= 420 * dt;
    if (e.stateT > 1.1) { e.state = 'return'; e.stateT = 0; }
   } else {
    e.x += (e.ox - e.x) * Math.min(1, 2 * dt); e.y += (e.oy - e.y) * Math.min(1, 2 * dt);
    if (e.stateT > 1.4) { e.state = 'idle'; e.stateT = 0; }
   }
   break;
  }
  case 'turret': {
   e.dir = px < e.x + e.w / 2 ? -1 : 1;
   if (e.stateT > 2.3 && Math.abs(px - e.x) < 560 && Math.abs(py - e.y) < 360) {
    e.stateT = 0;
    const cx = e.x + e.w / 2, cy = e.y + 8, d = Math.hypot(px - cx, py - cy) || 1;
    s.shots.push({ id: s.nextId++, x: cx, y: cy, vx: (px - cx) / d * 210, vy: (py - cy) / d * 210 - 40, r: 10, friendly: false, kind: 'spore', t: 0, alive: true, dmg: 1 });
    emit(s, 'spore', cx, cy);
   }
   break;
  }
 }
 if (e.y > s.level.h * TILE + 100) e.alive = false;
}

/* -------------------------------- shots ------------------------------- */
function stepShots(s: QuestState, dt: number) {
 const p = s.player;
 for (const sh of s.shots) {
  if (!sh.alive) continue;
  sh.t += dt;
  if (sh.kind === 'arc') sh.vy += 1500 * dt;
  if (sh.kind === 'ring' && sh.t > .32) { const tx = p.x + p.w / 2, ty = p.y + p.h / 2; sh.vx += sign(tx - sh.x) * 2200 * dt; sh.vy += (ty - sh.y) * 6 * dt; if (sh.t > .5 && Math.hypot(tx - sh.x, ty - sh.y) < 26) { sh.alive = false; continue; } }
  if (sh.kind === 'wave') { const gy = groundBelow(s, sh.x, sh.y - 20); if (gy < Infinity) sh.y = gy - 10; else sh.vy += 1500 * dt; }
  sh.x += sh.vx * dt; sh.y += sh.vy * dt;
  if (sh.kind === 'shock') { const gy = groundBelow(s, sh.x, sh.y - 30); if (gy < Infinity) sh.y = gy - 12; }
  const c = Math.floor(sh.x / TILE), r = Math.floor(sh.y / TILE), v = tileOf(s, c, r);
  if (isFullSolid(v) || (isSlope(v) && sh.y > slopeFloor(v, c, r, sh.x))) {
   if (sh.friendly && (v === T.BRICK || v === T.BOX)) openBox(s, r * s.level.w + c);
   if (sh.kind !== 'ring' && sh.kind !== 'wave') { sh.alive = false; emit(s, 'shotHit', sh.x, sh.y, sh.kind); continue; }
   if (sh.kind === 'wave') { sh.alive = false; emit(s, 'shotHit', sh.x, sh.y, sh.kind); continue; }
  }
  if (sh.t > 4 || sh.y > s.level.h * TILE + 50) { sh.alive = false; continue; }
  if (sh.friendly) {
   for (const e of s.ents) {
    if (!e.alive || !(isEnemy(e.kind) || e.kind === 'lantern')) continue;
    if (sh.x > e.x - sh.r && sh.x < e.x + e.w + sh.r && sh.y > e.y - sh.r && sh.y < e.y + e.h + sh.r) {
     if (damageEnt(s, e, sh.dmg, sh.x - sh.vx, 'sub') && sh.kind !== 'ring') { sh.alive = false; emit(s, 'shotHit', sh.x, sh.y, sh.kind); break; }
    }
   }
   const B = s.boss;
   if (sh.alive && B && sh.x > B.x && sh.x < B.x + B.w && sh.y > B.y && sh.y < B.y + B.h) { if (damageBoss(s, sh.dmg, sh.bounced ? 'reflect' : 'sub')) { sh.alive = false; emit(s, 'shotHit', sh.x, sh.y, sh.kind); } }
  } else if (p.dead <= 0 && !p.bash) {
   if (sh.x > p.x - sh.r && sh.x < p.x + p.w + sh.r && sh.y > p.y - sh.r && sh.y < p.y + p.h + sh.r) {
    if (p.dashT > 0 && sh.kind !== 'shock') continue;
    hurtPlayer(s, sh.x - sh.vx * .1); if (sh.kind !== 'shock') sh.alive = false;
   }
  }
 }
 if (s.shots.length > 60 || s.shots.some(x => !x.alive)) s.shots = s.shots.filter(x => x.alive).slice(-60);
}

/* -------------------------------- boss -------------------------------- */
function stepBoss(s: QuestState, dt: number) {
 const B = s.boss, A = s.level.arena;
 if (!B || !A || B.state === 'dormant' || B.state === 'dead') return;
 const p = s.player, px = p.x + p.w / 2;
 B.stateT += dt; B.hurt = Math.max(0, B.hurt - dt);
 const ax0 = (A.c0 + 2) * TILE, ax1 = (A.c1 - 1) * TILE;
 const floor = floorRow(s, A.c0 + 2) * TILE;
 const homeY = floor - 300;
 const speed = 1 + B.phase * .22;
 const go = (st: Boss['state']) => { B.state = st; B.stateT = 0; };
 switch (B.state) {
  case 'intro':
   B.y += (homeY - B.y) * Math.min(1, 1.5 * dt);
   if (B.stateT > 2.4) go('hover');
   break;
  case 'hover': {
   const tx = clamp(px + Math.sin(s.time * .9) * 220, ax0 + 40, ax1 - B.w - 40);
   B.x += (tx - B.x) * Math.min(1, 1.6 * dt); B.y += (homeY + Math.sin(s.time * 2) * 20 - B.y) * Math.min(1, 2.5 * dt);
   B.dir = px < B.x + B.w / 2 ? -1 : 1;
   if (B.stateT > 1.5 / speed) {
    const pick = B.next++ % (B.phase >= 1 ? 4 : 3);
    go(pick === 0 ? 'volley' : pick === 1 ? 'swoop' : pick === 2 ? 'rise' : 'volley');
    B.volleys = 0; B.tx = px; B.ty = p.y;
   }
   break;
  }
  case 'volley': {
   const every = .55 / speed;
   if (B.stateT > .45 + B.volleys * every && B.volleys < 2 + B.phase) {
    B.volleys++;
    const n = 3 + B.phase * 2, cx = B.x + B.w / 2, cy = B.y + B.h * .45;
    const base = Math.atan2(p.y + p.h / 2 - cy, px - cx);
    for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * .26; s.shots.push({ id: s.nextId++, x: cx, y: cy, vx: Math.cos(a) * 240 * speed, vy: Math.sin(a) * 240 * speed, r: 11, friendly: false, kind: 'warden', t: 0, alive: true, dmg: 1 }); }
    emit(s, 'bossVolley', cx, cy);
   }
   if (B.stateT > .6 + (2 + B.phase) * every + .4) go('hover');
   break;
  }
  case 'swoop': {
   if (B.stateT < .7) { B.y += (homeY - 40 - B.y) * Math.min(1, 3 * dt); if (B.stateT < dt * 1.5) emit(s, 'bossTell', B.x + B.w / 2, B.y + B.h / 2, 'swoop'); }
   else {
    if (B.vx === 0) { const d = B.tx > B.x + B.w / 2 ? 1 : -1; B.vx = d * 640 * speed; B.vy = 520; B.dir = d; }
    B.x += B.vx * dt; B.y += B.vy * dt; B.vy -= 820 * dt;
    if (B.y + B.h > floor - 6) { B.y = floor - 6 - B.h; }
    if (B.x < ax0 || B.x + B.w > ax1 || B.stateT > 2.2) { B.x = clamp(B.x, ax0, ax1 - B.w); B.vx = 0; B.vy = 0; go('hover'); }
   }
   break;
  }
  case 'rise': {
   B.x += (clamp(px - B.w / 2, ax0, ax1 - B.w) - B.x) * Math.min(1, 4 * dt);
   B.y += (homeY - 120 - B.y) * Math.min(1, 3 * dt);
   if (B.stateT < dt * 1.5) emit(s, 'bossTell', B.x + B.w / 2, floor, 'slam');
   if (B.stateT > .9 / speed) { go('slam'); B.vy = 0; }
   break;
  }
  case 'slam': {
   B.vy += 3600 * dt; B.y += B.vy * dt;
   if (B.y + B.h >= floor) {
    B.y = floor - B.h; B.vy = 0;
    const cx = B.x + B.w / 2;
    for (const d of [-1, 1]) s.shots.push({ id: s.nextId++, x: cx + d * 40, y: floor - 12, vx: d * 380 * speed, vy: 0, r: 14, friendly: false, kind: 'shock', t: 0, alive: true, dmg: 1 });
    emit(s, 'bossSlam', cx, floor);
    if (B.phase >= 2) for (let i = 0; i < 2; i++) { const f = spawn(s, 'flyer', cx + (i ? 260 : -260), floor - 220); f.ox = f.x; f.oy = f.y; }
    go('stun');
   }
   break;
  }
  case 'stun':
   if (B.stateT > 1.1 / speed) go('hover');
   break;
  case 'dying':
   B.y += Math.sin(B.stateT * 40) * 2;
   if (B.stateT > 2.6) {
    B.state = 'dead'; s.arenaLocked = false;
    spawn(s, 'goal', (A.c0 + A.c1) / 2 * TILE, floor);
    for (let i = 0; i < 12; i++) { const m = drop(s, 'mote', B.x + B.w / 2, B.y + B.h / 2); m.vx = (i - 6) * 55; m.vy = -500 - (i % 3) * 90; }
    emit(s, 'bossDead', B.x + B.w / 2, B.y + B.h / 2);
   }
   break;
 }
}

/* ------------------------------- queries ------------------------------ */
export const seedsTotal = (s: QuestState) => 3;
export const levelProgress = (s: QuestState) => clamp((s.player.x - s.level.start.x) / Math.max(1, (s.level.w - 12) * TILE - s.level.start.x), 0, 1);
