/**
 * Kith Quest — level format + builder + the three authored stages.
 * Levels are built with a cursor-based builder (flat / gap / up / down / rise / plat …) rather than
 * hand-typed ASCII, so jump distances and step heights stay inside the movement envelope
 * (see MOVE in sim.ts and the reachability test in tests/kithQuest.test.ts).
 */

export const TILE = 32;

export const T = {
 EMPTY: 0, SOLID: 1, ONEWAY: 2, SLOPE_UP: 3, SLOPE_DOWN: 4, BRICK: 5, BOX: 6, USED: 7, SPIKES: 8, CRUMBLE: 9,
} as const;
export type TileCode = typeof T[keyof typeof T];

export type Biome = 'moss' | 'falls' | 'keep' | 'sunbloom' | 'starwell';
export type ZoneMood = 'calm' | 'energy' | 'danger';
export type BossKind = 'warden' | 'sovereign' | 'weaver';

export type EntKind =
 | 'mote' | 'seed' | 'petal' | 'spark' | 'checkpoint' | 'goal' | 'spring' | 'boostR' | 'boostL' | 'sign'
 | 'walker' | 'hopper' | 'flyer' | 'turret' | 'thornback' | 'beetle' | 'wisp' | 'briar' | 'sentinel'
 | 'lantern' | 'bashNode' | 'platH' | 'platV' | 'boss';

export interface EntDef { kind: EntKind; x: number; y: number; data?: number; }

/** What a bloom box gives when opened (indexed by tile index in LevelDef.boxes). */
export type BoxPrize = 'mote' | 'motes5' | 'petal' | 'spark' | 'seed';

export interface LevelDef {
 id: string; name: string; subtitle: string; biome: Biome;
 w: number; h: number; tiles: Uint8Array;
 ents: EntDef[]; signs: string[];
 boxes: Record<number, BoxPrize>;
 start: { x: number; y: number };
 /** Boss arena (tile columns) and identity for stages with a boss. */
 arena?: { c0: number; c1: number };
 bossKind?: BossKind;
 bossName?: string;
 /** Music zones: from column c onward the score plays this mood (see quest/score.ts). */
 moods: { c: number; mood: ZoneMood }[];
 par: number;
}

class Builder {
 t: Uint8Array; ents: EntDef[] = []; signs: string[] = []; boxes: Record<number, BoxPrize> = {};
 x = 0; g: number; start = { x: 64, y: 0 }; moods: { c: number; mood: ZoneMood }[] = [{ c: 0, mood: 'calm' }];
 constructor(public w: number, public h: number, ground: number) { this.t = new Uint8Array(w * h); this.g = ground; }
 set(c: number, r: number, v: number) { if (c >= 0 && c < this.w && r >= 0 && r < this.h) this.t[r * this.w + c] = v; }
 get(c: number, r: number) { return c >= 0 && c < this.w && r >= 0 && r < this.h ? this.t[r * this.w + c] : 0; }
 fill(c0: number, c1: number, r0: number, r1: number, v: number) { for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) this.set(c, r, v); return this; }
 col(c: number, top: number) { for (let r = top; r < this.h; r++) this.set(c, r, T.SOLID); return this; }
 /** Flat ground for n columns at the current height. */
 flat(n: number) { for (let i = 0; i < n; i++) this.col(this.x + i, this.g); this.x += n; return this; }
 gap(n: number) { this.x += n; return this; }
 /** 45° slope rising to the right over n columns. */
 up(n: number) { for (let i = 0; i < n; i++) { this.set(this.x, this.g - 1, T.SLOPE_UP); this.col0(this.x, this.g); this.g--; this.x++; } return this; }
 /** 45° slope falling to the right over n columns. */
 down(n: number) { for (let i = 0; i < n; i++) { this.set(this.x, this.g, T.SLOPE_DOWN); this.col0(this.x, this.g + 1); this.g++; this.x++; } return this; }
 private col0(c: number, top: number) { for (let r = top; r < this.h; r++) this.set(c, r, T.SOLID); }
 /** Change ground height by dh tiles (positive = higher). Next flat() makes the wall/cliff. */
 rise(dh: number) { this.g -= dh; return this; }
 /** Row of tiles `above` tiles over the current ground starting dc columns from the cursor. */
 plat(dc: number, above: number, len: number, code: number = T.ONEWAY) { for (let i = 0; i < len; i++) this.set(this.x + dc + i, this.g - above, code); return this; }
 /** Absolute-column platform at absolute row. */
 platAt(c: number, r: number, len: number, code: number = T.ONEWAY) { for (let i = 0; i < len; i++) this.set(c + i, r, code); return this; }
 box(dc: number, above: number, prize: BoxPrize = 'mote') { const c = this.x + dc, r = this.g - above; this.set(c, r, T.BOX); this.boxes[r * this.w + c] = prize; return this; }
 boxAt(c: number, r: number, prize: BoxPrize = 'mote') { this.set(c, r, T.BOX); this.boxes[r * this.w + c] = prize; return this; }
 /** Entity standing on the ground (or `above` tiles over it), dc columns from the cursor. */
 ent(kind: EntKind, dc: number, above = 0, data?: number) { this.ents.push({ kind, x: (this.x + dc) * TILE + TILE / 2, y: (this.g - above) * TILE, data }); return this; }
 entAt(kind: EntKind, c: number, r: number, data?: number) { this.ents.push({ kind, x: c * TILE + TILE / 2, y: r * TILE, data }); return this; }
 motes(dc: number, above: number, n: number, arc = 0) {
  for (let i = 0; i < n; i++) { const k = n > 1 ? i / (n - 1) : .5; this.ent('mote', dc + i, above + arc * 4 * k * (1 - k)); }
  return this;
 }
 /** Music changes to `mood` from the cursor (+dc columns) onward. */
 mood(mood: ZoneMood, dc = 0) { this.moods.push({ c: this.x + dc, mood }); return this; }
 sign(dc: number, text: string) { this.signs.push(text); return this.ent('sign', dc, 0, this.signs.length - 1); }
 begin(dc: number) { this.start = { x: (this.x + dc) * TILE + TILE / 2, y: this.g * TILE }; return this; }
 /** Pad the rest of the level with a wall so nothing walks off the right edge. */
 close() { for (let c = this.x; c < this.w; c++) this.col(c, 0); return this; }
}

/* ------------------------------------------------------------------ */
/* Stage 1 — Glowmoss Hollow: the basics, slopes, momentum, springs.   */
/* ------------------------------------------------------------------ */
function glowmoss(): LevelDef {
 const b = new Builder(250, 26, 20);
 b.fill(0, 0, 0, 25, T.SOLID);
 b.x = 1;
 b.begin(3).flat(18);
 b.sign(-15, '← → to run. Press Jump (Space / Z / Ⓐ) — hold it to jump higher.');
 b.motes(-9, 1, 5);
 b.box(-4, 4, 'mote').box(-3, 4, 'motes5').box(-2, 4, 'mote');
 b.ent('walker', -1);
 b.flat(8).sign(-6, 'Land on enemies to bop them. Thistlebugs hate that.');
 b.ent('walker', -2);
 b.gap(3).flat(6).motes(-5, 2, 4, 1);
 b.up(3).flat(5).ent('hopper', -2);
 b.gap(4).flat(10).sign(-9, 'Press X / Ⓧ to lash. Lash lanterns for sparks; Special (C / Ⓨ) spends sparks.');
 b.ent('lantern', -6, 1, 0).ent('lantern', -3, 1, 1);
 b.ent('walker', -1);
 b.box(-8, 4, 'spark').plat(-5, 4, 3).motes(-5, 5, 3);
 // momentum valley
 b.mood('energy').down(4).flat(4).sign(-3, 'Hold ↓ while running to roll — rolling smashes foes and builds speed downhill.');
 b.ent('walker', -1);
 b.flat(6).motes(-6, 1, 6);
 b.up(4).flat(6);
 b.ent('checkpoint', -4);
 b.mood('calm').flat(4).ent('spring', -2).sign(-4, 'Springs! Hold Jump in the air to glide down slowly.');
 b.platAt(b.x - 4, b.g - 9, 5).entAt('seed', b.x - 2, b.g - 9);
 b.motes(-2, 4, 1).motes(-2, 6, 1).motes(-2, 8, 1);
 b.flat(4).gap(5).flat(4);
 b.mood('energy', -3).ent('boostR', -2).sign(-4, 'Boost pads send you flying. Keep moving to build top speed.');
 b.flat(16).motes(-14, 1, 12);
 b.ent('walker', -6).ent('walker', -3);
 b.up(2).flat(6).ent('flyer', -2, 4);
 b.sign(-5, 'Press Jump again in mid-air for a second jump.');
 b.mood('calm').rise(4).flat(8).motes(-6, 1, 4);
 b.ent('hopper', -2);
 b.gap(5).flat(3).gap(5).flat(10);
 b.motes(-16, 3, 3, 1).ent('checkpoint', -7);
 // brick vault with a hidden seed
 b.fill(b.x - 4, b.x - 1, b.g - 4, b.g - 4, T.BRICK);
 b.fill(b.x - 4, b.x - 4, b.g - 3, b.g - 1, T.BRICK).fill(b.x - 1, b.x - 1, b.g - 3, b.g - 1, T.BRICK);
 b.entAt('seed', b.x - 3, b.g - 1).motes(-2, 1, 1).motes(-2, 2, 1);
 b.flat(6).sign(-5, 'Bricks crumble to a lash or a roll. Bloom boxes open from below.');
 b.box(-3, 4, 'petal');
 b.mood('danger').down(3).flat(8).ent('turret', -2).ent('walker', -5);
 b.up(3).flat(4);
 b.mood('energy').gap(3).flat(2).gap(3).flat(2).gap(3).flat(10);
 b.motes(-20, 3, 2).motes(-15, 3, 2);
 b.ent('hopper', -6).ent('hopper', -3);
 b.down(3).flat(10).ent('boostR', -9).motes(-8, 1, 7);
 b.up(5).flat(6).plat(-4, 5, 4);
 b.box(-3, 8, 'seed');
 b.ent('flyer', -2, 5);
 b.mood('calm').flat(12).motes(-10, 1, 3).ent('goal', -4);
 b.close();
 return {
  id: 'glowmoss', name: 'Glowmoss Hollow', subtitle: 'A lantern-lit wood at the edge of the Kithlands.', biome: 'moss',
  w: b.w, h: b.h, tiles: b.t, ents: b.ents, signs: b.signs, boxes: b.boxes, start: b.start, moods: b.moods, par: 150,
 };
}

/* ------------------------------------------------------------------ */
/* Stage 2 — Cascade Spires: wall jumps, dash, bash, moving platforms. */
/* ------------------------------------------------------------------ */
function cascade(): LevelDef {
 const b = new Builder(270, 40, 34);
 b.fill(0, 0, 0, 39, T.SOLID);
 b.x = 1;
 b.begin(3).flat(14).motes(-8, 1, 5);
 b.sign(-12, 'Hug a wall while falling to slide. Press Jump to kick off it.');
 // wall-jump shaft: overhang pillar + cliff
 const pillar = b.x + 2;
 b.flat(6);
 b.fill(pillar, pillar + 1, b.g - 13, b.g - 4, T.SOLID);
 b.motes(1, 4, 1).motes(1, 7, 1).motes(1, 10, 1);
 b.rise(12).flat(10);
 b.ent('checkpoint', -8);
 b.sign(-6, 'Dash (Shift / V / Ⓡ) — one burst per jump. Dash + double jump crosses wide gaps.');
 b.motes(-1, 1, 1);
 b.mood('energy').gap(8).flat(6).motes(-14, 2, 6, 1);
 b.ent('turret', -1);
 b.gap(7).flat(8).ent('walker', -3);
 // waterfall drop with moving platforms
 b.down(4).flat(4);
 const wy = b.g;
 b.gap(18);
 b.entAt('platH', b.x - 15, wy - 1, 3).entAt('platV', b.x - 8, wy - 1, 3);
 b.motes(-15, 3, 3).motes(-8, 6, 1);
 b.mood('calm', 2).flat(8).ent('hopper', -3);
 b.ent('checkpoint', -6);
 b.sign(-4, 'Near a glowing bash lantern or an enemy shot, press Dash to BASH: hold a direction and launch.');
 // bash chasm
 const cy = b.g;
 b.mood('energy').gap(26);
 b.entAt('bashNode', b.x - 22, cy - 4).entAt('bashNode', b.x - 14, cy - 6).entAt('bashNode', b.x - 6, cy - 5);
 b.motes(-18, 7, 3).motes(-10, 8, 3);
 b.entAt('seed', b.x - 14, cy - 10);
 b.flat(10).ent('flyer', -4, 4).ent('walker', -2);
 // turret gallery: bash the spores back
 b.mood('danger').rise(3).flat(4).sign(-3, 'Bash a spore shot to fling it back — and launch yourself the other way.');
 b.flat(12).ent('turret', -2).ent('turret', -8);
 b.platAt(b.x - 10, b.g - 4, 4).motes(-10, 5, 4).box(-5, 8, 'seed');
 b.ent('checkpoint', -12);
 // crumble bridge over spikes
 const sy = b.g;
 b.gap(14);
 for (let c = b.x - 14; c < b.x; c++) { b.set(c, sy + 2, T.SPIKES); b.col(c, sy + 3); }
 b.platAt(b.x - 14, sy, 14, T.CRUMBLE);
 b.motes(-12, 2, 10);
 b.flat(6);
 // second shaft (higher), seed on top ledge
 b.mood('calm');
 const p2 = b.x + 3;
 b.flat(7);
 b.fill(p2, p2, b.g - 15, b.g - 4, T.SOLID);
 b.rise(14).flat(8).ent('checkpoint', -6);
 b.platAt(p2 - 4, b.g - 4, 3).entAt('seed', p2 - 3, b.g - 4);
 b.ent('flyer', -2, 3);
 b.down(4).flat(4).gap(6).flat(3).gap(6).flat(5);
 b.ent('hopper', -2);
 b.mood('energy').down(4).flat(6).ent('boostR', -5).flat(14).motes(-14, 1, 12).ent('walker', -4).ent('walker', -2);
 b.up(3).flat(5).ent('turret', -2);
 b.gap(9).flat(12).motes(-20, 3, 6, 1);
 b.ent('goal', -4);
 b.close();
 return {
  id: 'cascade', name: 'Cascade Spires', subtitle: 'Mist, falling water and stone needles that climb into the clouds.', biome: 'falls',
  w: b.w, h: b.h, tiles: b.t, ents: b.ents, signs: b.signs, boxes: b.boxes, start: b.start, moods: b.moods, par: 210,
 };
}

/* ------------------------------------------------------------------ */
/* Stage 3 — Lanternkeep: candles, thornbacks, the Hollow Warden.      */
/* ------------------------------------------------------------------ */
function lanternkeep(): LevelDef {
 const b = new Builder(240, 26, 20);
 b.fill(0, 0, 0, 25, T.SOLID);
 b.x = 1;
 b.begin(3).flat(16);
 b.sign(-13, 'Thornbacks can’t be bopped. Lash them, roll into them, or throw sparks.');
 for (let i = 0; i < 4; i++) b.ent('lantern', -14 + i * 3, 2, i % 2);
 b.ent('thornback', -2);
 b.flat(6).plat(-5, 3, 4).plat(-2, 6, 4).motes(-2, 7, 4);
 b.gap(4).flat(8).ent('flyer', -4, 4).ent('lantern', -6, 2, 1).ent('lantern', -2, 2, 0);
 // spike corridor with one-way stairs
 const sy = b.g;
 b.mood('danger', -2).gap(12);
 for (let c = b.x - 12; c < b.x; c++) { b.set(c, sy + 1, T.SPIKES); b.col(c, sy + 2); }
 b.platAt(b.x - 11, sy - 2, 3).platAt(b.x - 7, sy - 3, 3).platAt(b.x - 3, sy - 2, 3);
 b.motes(-10, 3, 2).motes(-6, 4, 2).motes(-2, 3, 2);
 b.entAt('seed', b.x - 6, sy - 7);
 b.flat(8).ent('checkpoint', -5).ent('thornback', -2).mood('energy', -6);
 // brick wall
 b.fill(b.x, b.x + 1, b.g - 4, b.g - 1, T.BRICK);
 b.flat(10).ent('lantern', -6, 2, 0).ent('turret', -2);
 b.rise(3).flat(8).ent('hopper', -3).box(-6, 4, 'spark').box(-5, 4, 'petal');
 b.down(3).flat(6).ent('walker', -2);
 b.gap(5).flat(4).gap(5).flat(8);
 b.ent('flyer', -10, 5).ent('flyer', -4, 4);
 b.ent('thornback', -3);
 // high route with a seed
 b.platAt(b.x - 6, b.g - 4, 3).platAt(b.x - 2, b.g - 7, 3).platAt(b.x + 2, b.g - 10, 3).entAt('seed', b.x + 3, b.g - 10);
 b.mood('danger').flat(10).ent('lantern', -6, 2, 1).ent('thornback', -2).sign(-8, 'Something old stirs at the top of the keep…');
 b.rise(2).flat(6).ent('checkpoint', -4);
 b.rise(2).flat(4).ent('turret', -2);
 b.gap(4).flat(6).ent('thornback', -2).ent('lantern', -5, 2, 1);
 b.fill(b.x - 3, b.x - 3, b.g - 1, b.g - 1, T.BRICK);
 b.entAt('seed', b.x - 3, b.g - 1);
 b.flat(6).ent('checkpoint', -3).ent('lantern', -5, 2, 0).ent('lantern', -1, 2, 1);
 // boss arena
 const c0 = b.x;
 b.flat(36);
 const c1 = b.x - 1;
 b.platAt(c0 + 6, b.g - 4, 4).platAt(c1 - 9, b.g - 4, 4).platAt(c0 + 15, b.g - 7, 6);
 b.ent('boss', -18, 6);
 b.ent('lantern', -33, 2, 1).ent('lantern', -3, 2, 0);
 b.close();
 b.fill(c0 - 1, c0 - 1, 0, b.g - 6, T.SOLID);
 return {
  id: 'lanternkeep', name: 'Lanternkeep', subtitle: 'A candlelit fortress where the Hollow Warden keeps the last flame.', biome: 'keep',
  w: b.w, h: b.h, tiles: b.t, ents: b.ents, signs: b.signs, boxes: b.boxes, start: b.start,
  arena: { c0, c1 }, bossKind: 'warden', bossName: 'THE HOLLOW WARDEN', moods: b.moods, par: 240,
 };
}

/* ------------------------------------------------------------------ */
/* Stage 4 — Sunbloom Canopy: golden updrafts, beetles, Gale Sovereign.*/
/* ------------------------------------------------------------------ */
function sunbloom(): LevelDef {
 const b = new Builder(280, 34, 28);
 b.fill(0, 0, 0, 33, T.SOLID);
 b.x = 1;
 b.begin(3).flat(18);
 b.sign(-15, 'Mossback Beetles wear stone-hard shells. Roll (↓) or Lash (X) to crack them open!');
 b.motes(-11, 1, 5).ent('beetle', -3);
 b.up(3).flat(12).ent('briar', -6).box(-4, 4, 'motes5').plat(-9, 4, 4).motes(-9, 5, 3);
 b.mood('energy').gap(4).flat(8).ent('wisp', -3, 5).ent('hopper', -5);
 // sunlit bash gorge with Seed 1 hovering in the updraft canopy
 const cy = b.g;
 b.gap(20);
 b.entAt('bashNode', b.x - 16, cy - 3).entAt('bashNode', b.x - 10, cy - 6).entAt('bashNode', b.x - 4, cy - 4);
 b.motes(-14, 6, 4).entAt('seed', b.x - 10, cy - 10);
 b.flat(12).ent('checkpoint', -9).ent('beetle', -4).ent('lantern', -7, 2, 1);
 // rolling flower hill + spring launch to Seed 2
 b.mood('calm').down(5).flat(4).ent('boostR', -3).flat(18).motes(-16, 1, 10).ent('walker', -6).ent('briar', -3);
 b.up(4).flat(10).ent('spring', -6).plat(-7, 8, 5).ent('seed', -5, 8);
 b.mood('danger').gap(5).flat(10).ent('wisp', -4, 5).ent('flyer', -7, 4).ent('checkpoint', -8);
 b.fill(b.x, b.x + 1, b.g - 4, b.g - 1, T.BRICK);
 b.flat(10).ent('sentinel', -4, 4).ent('lantern', -7, 2, 0);
 // wind gorge with moving raft & crumble bridge over thorns
 const wy = b.g;
 b.gap(16);
 for (let c = b.x - 16; c < b.x; c++) { b.set(c, wy + 2, T.SPIKES); b.col(c, wy + 3); }
 b.entAt('platH', b.x - 14, wy - 1, 3).platAt(b.x - 7, wy - 2, 3, T.CRUMBLE);
 b.motes(-13, 3, 3).motes(-7, 4, 3).boxAt(b.x - 6, wy - 6, 'spark');
 b.flat(10).ent('briar', -6).ent('beetle', -3).plat(-7, 4, 4).plat(-2, 8, 4).ent('seed', 0, 8);
 b.mood('energy').rise(3).flat(8).ent('checkpoint', -5).ent('lantern', -3, 2, 1).ent('lantern', -1, 2, 0).sign(-6, 'The wind gathers at the high shrine. Ready your bash!');
 const c0 = b.x;
 b.flat(36);
 const c1 = b.x - 1;
 b.platAt(c0 + 6, b.g - 4, 4).platAt(c1 - 9, b.g - 4, 4).platAt(c0 + 15, b.g - 7, 6);
 b.ent('boss', -18, 6).ent('bashNode', -31, 5).ent('bashNode', -5, 5);
 b.close();
 b.fill(c0 - 1, c0 - 1, 0, b.g - 6, T.SOLID);
 return {
  id: 'sunbloom', name: 'Sunbloom Canopy', subtitle: 'Gilded sky terraces where the Gale Sovereign rides the summer thermal.', biome: 'sunbloom',
  w: b.w, h: b.h, tiles: b.t, ents: b.ents, signs: b.signs, boxes: b.boxes, start: b.start,
  arena: { c0, c1 }, bossKind: 'sovereign', bossName: 'THE GALE SOVEREIGN', moods: b.moods, par: 245,
 };
}

/* ------------------------------------------------------------------ */
/* Stage 5 — Starwell Sanctuary: crystal depths, sentinels, Umbra Weaver. */
/* ------------------------------------------------------------------ */
function starwell(): LevelDef {
 const b = new Builder(285, 36, 30);
 b.fill(0, 0, 0, 35, T.SOLID);
 b.x = 1;
 b.begin(3).flat(14);
 b.sign(-11, 'Starwell Sanctuary — Bash crystal bolts back at Astral Sentinels and the Umbra Weaver.');
 b.motes(-9, 1, 5).ent('wisp', -3, 5);
 b.flat(8).ent('briar', -5).ent('sentinel', -2, 4);
 // wall-jump crystal chimney up to Seed 1
 const pillar = b.x + 2;
 b.flat(7);
 b.fill(pillar, pillar + 1, b.g - 13, b.g - 4, T.SOLID);
 b.motes(1, 4, 1).motes(1, 7, 1).motes(1, 10, 1);
 b.rise(12).flat(10).ent('checkpoint', -7);
 b.platAt(pillar - 4, b.g - 4, 3).entAt('seed', pillar - 3, b.g - 4);
 b.mood('energy').down(4).flat(6).ent('boostR', -5).flat(16).motes(-14, 1, 10).ent('beetle', -6).ent('thornback', -2);
 // crystal basin bash cascade
 const cy = b.g;
 b.gap(22);
 for (let c = b.x - 22; c < b.x; c++) { b.set(c, cy + 2, T.SPIKES); b.col(c, cy + 3); }
 b.entAt('bashNode', b.x - 18, cy - 4).entAt('bashNode', b.x - 11, cy - 6).entAt('bashNode', b.x - 4, cy - 4);
 b.platAt(b.x - 13, cy - 2, 4).motes(-12, 5, 4);
 b.flat(10).ent('checkpoint', -7).ent('lantern', -4, 2, 1).ent('wisp', -2, 5);
 b.mood('danger').gap(5).flat(6).ent('briar', -3).box(-3, 5, 'seed');
 b.down(3).flat(10).ent('sentinel', -3, 4).ent('beetle', -7).plat(-8, 4, 4).motes(-8, 5, 4);
 b.fill(b.x, b.x + 1, b.g - 4, b.g - 1, T.BRICK);
 b.flat(10).ent('hopper', -6).ent('turret', -2).box(-5, 4, 'spark').box(-4, 4, 'petal');
 // moving sanctuary lifts + Seed 3 above
 const sy = b.g;
 b.gap(16);
 b.entAt('platH', b.x - 13, sy - 1, 3).entAt('platV', b.x - 6, sy - 2, 3);
 b.platAt(b.x - 7, sy - 9, 4).entAt('seed', b.x - 5, sy - 9);
 b.mood('calm').flat(10).ent('checkpoint', -7).ent('lantern', -5, 2, 0).ent('lantern', -3, 2, 1).ent('lantern', -1, 2, 0).sign(-6, 'Beyond this threshold waits the Umbra Weaver. Rekindle the final star!');
 b.mood('danger');
 const c0 = b.x;
 b.flat(38);
 const c1 = b.x - 1;
 b.platAt(c0 + 6, b.g - 4, 4).platAt(c1 - 9, b.g - 4, 4).platAt(c0 + 16, b.g - 8, 6);
 b.ent('boss', -19, 6).ent('lantern', -34, 2, 1).ent('lantern', -4, 2, 0).ent('bashNode', -19, 10);
 b.close();
 b.fill(c0 - 1, c0 - 1, 0, b.g - 6, T.SOLID);
 return {
  id: 'starwell', name: 'Starwell Sanctuary', subtitle: 'A sunken crystal abbey where the Umbra Weaver guards the sleeping stars.', biome: 'starwell',
  w: b.w, h: b.h, tiles: b.t, ents: b.ents, signs: b.signs, boxes: b.boxes, start: b.start,
  arena: { c0, c1 }, bossKind: 'weaver', bossName: 'THE UMBRA WEAVER', moods: b.moods, par: 255,
 };
}

export const LEVELS: (() => LevelDef)[] = [glowmoss, cascade, lanternkeep, sunbloom, starwell];
export const LEVEL_INFO = [
 { id: 'glowmoss', name: 'Glowmoss Hollow', subtitle: 'Run, jump, roll and glide through a lantern-lit wood.', biome: 'moss' as Biome },
 { id: 'cascade', name: 'Cascade Spires', subtitle: 'Wall jumps, dashes and bash lanterns over the falls.', biome: 'falls' as Biome },
 { id: 'lanternkeep', name: 'Lanternkeep', subtitle: 'A candlelit fortress and the Hollow Warden.', biome: 'keep' as Biome },
 { id: 'sunbloom', name: 'Sunbloom Canopy', subtitle: 'Gilded sky terraces, wind gorges and the Gale Sovereign.', biome: 'sunbloom' as Biome },
 { id: 'starwell', name: 'Starwell Sanctuary', subtitle: 'Crystal depths, astral guardians and the Umbra Weaver.', biome: 'starwell' as Biome },
];
export const buildLevel = (i: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))]();

export const tileAt = (L: LevelDef, c: number, r: number) => (c < 0 || c >= L.w) ? T.SOLID : (r < 0 || r >= L.h) ? T.EMPTY : L.tiles[r * L.w + c];

/** Music zone at a pixel x (last marker at or before that column). */
export function moodAt(L: LevelDef, x: number): ZoneMood {
 const c = Math.floor(x / TILE);
 let m: ZoneMood = 'calm';
 for (const z of L.moods) if (z.c <= c) m = z.mood;
 return m;
}
