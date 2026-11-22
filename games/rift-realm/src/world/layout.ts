// Elderwood Wilds — the world map. One 2 km forest round Elderwood Hollow (the CF-24 arena, unchanged at the centre),
// laid out so every forest / cyber-forest shot in the art folders is a real place you can walk to (docs/rift-realm-open-world.md,
// track 1). Metres, x east, z south, y up; the hollow's floor is y≈0.
//
//   North        the High Canopy: rope-bridge network out of the Great Oak (eh-01/03/04/05/06/11/12), the Sunken Ruins pit
//                under its broken bridge, the Highland rising to the north rim.
//   West         Westwood: Treehouse Village (rune plaza in the canopy), the Settlement at its foot, Glowcap Hollow
//                (giant mushrooms, the circuit-ringed clearing), the Titan Tree whose hollow trunk holds the bunker.
//   East / NE    the Redwood Ruins: Portal Plaza, Circuit Court, Elder Cathedral, Zone 10 temple, the Anomaly Shrine and,
//                under the Highland rim, the Neon Gate ruins where the river falls in.
//   South        the river runs through Glowcap Stream's ravine to the Great Falls, drops 42 m into the Gorge (arena on
//                its floor, Z-06 sniper nest on its rim, the vaults behind the falls), past the Zone 05 overlook, into the
//                Violet Vale and the Mangrove Mire at the foot of the escarpment.
// fast 2D value noise (integer hash, no trig): the world height is baked over a million points
function hash2(x: number, z: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x: number, z: number, s: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** 0…1, three octaves (the same shape as geom.fbm3, much cheaper). */
export const fbm2 = (x: number, z: number, s: number) => noise2(x, z, s) * 0.55 + noise2(x * 2.1 + 17.3, z * 2.1 - 9.1, s + 1) * 0.3 + noise2(x * 4.3 - 5.7, z * 4.3 + 3.3, s + 2) * 0.15;

export const HALF = 1000;             // world half-size
export const PLAY = 880;              // mountains rise beyond this
export const CORE = 76;               // the hollow's square (elderwood.ts BOUND)
export const VALE_Y = -46;            // the vale below the escarpment
export const WATER_Y = -48.6;         // the vale's standing water (mire, lake)

export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x: number, a: number, b: number, e: number) => smooth(a - e, a + e, x) * (1 - smooth(b - e, b + e, x));

/** Nearest point on a polyline: distance, the segment index and t along it, and the arc length there. */
export function polyNear(pts: readonly (readonly number[])[], x: number, z: number) {
  let best = { d: Infinity, i: 0, t: 0, s: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (L2 || 1)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best.d) best = { d, i, t, s: acc + L * t };
    acc += L;
  }
  return best;
}
const lerpCol = (pts: readonly (readonly number[])[], i: number, t: number, c: number) => pts[i][c] + (pts[i + 1][c] - pts[i][c]) * t;

// ── the river: [x, z, bed y, width] from the Highland down to the vale ────────────────────────────────────────────
export const RIVER: readonly (readonly [number, number, number, number])[] = [
  [650, -990, 46, 6], [640, -860, 41, 7], [610, -700, 36, 8],
  [566, -560, 33, 9],      // Neon Falls lip, on the Highland rim
  [559, -542, 7.5, 10],    // its plunge pool, behind the Neon Gate ruins
  [522, -470, 5.5, 10], [446, -320, 4.2, 11], [362, -150, 2.8, 12], [300, 0, 1.4, 12],
  [262, 96, 0.2, 9],       // into Glowcap Stream's ravine
  [240, 180, -1.0, 8], [222, 256, -2.4, 9],
  [208, 318, -3.4, 10],    // the Great Falls lip
  [205, 333, -45, 13],     // the plunge pool at the head of the Gorge
  [228, 382, -45.8, 11], [227, 452, -46.4, 11], [214, 525, -47.2, 14], [150, 640, -48.0, 18], [70, 780, -48.9, 24], [10, 1000, -49.4, 30],
];
export const NEON_FALLS = { lip: 3, foot: 4 }, GREAT_FALLS = { lip: 12, foot: 13 };

/** A small stream: the Waterfall Pool (CF-22) spills south to the Gorge's west wall and falls in beside the arena. */
export const POOL_STREAM: readonly (readonly [number, number, number, number])[] = [
  [30, 72, -3.6, 3], [52, 130, -3.2, 3.2], [92, 210, -3.0, 3.4], [128, 300, -3.2, 3.6], [150, 372, -3.4, 3.6],
  [166, 384, -43, 5],   // falls into the Gorge (Sniper Nest Z-06 looks across it)
  [196, 400, -45.6, 4], [222, 404, -46, 4],
];
export const POOL_FALLS = { lip: 4, foot: 5 };

// ── the escarpment between the plateau and the vale, the Gorge cut into its southern spur ──────────────────────────
/** z of the escarpment's edge at x (the plateau is north of it). The spur round the Gorge reaches south to 560. */
export const escarpZ = (x: number) => 335 + 22 * Math.sin(x / 150 + 0.6) + 215 * bump(x, 100, 300, 20);
/** The Gorge's centre line (x at z) and half-width. */
export const gorgeX = (z: number) => 205 + 9 * Math.sin(z / 45);
export const GORGE_HALF = 36;
const gorgeMask = (x: number, z: number) => (1 - smooth(GORGE_HALF - 8, GORGE_HALF + 4, Math.abs(x - gorgeX(z)))) * smooth(316, 330, z);
/** 1 on the plateau, 0 in the vale and the Gorge. */
export const plateauMask = (x: number, z: number) => { const e = escarpZ(x); return (1 - smooth(e - 6, e + 6, z)) * (1 - gorgeMask(x, z)); };

// ── places: every forest shot in the art folders, as somewhere you can stand ──────────────────────────────────────
export interface Place {
  id: string; name: string; region: string;
  x: number; z: number;
  /** Flatten a pad of this radius (blend 1.6× out) to `y` (or the ground at its centre when undefined). */
  pad?: number; y?: number;
  /** Sink the pad this far below the ground (a sunken court). */
  sink?: number;
  shows: string;
}

export const PLACES: Place[] = [
  // Elderwood Hollow (CF-24, built by elderwood.ts)
  { id: 'oak-deck', name: 'Great Oak Deck', region: 'Elderwood Hollow', x: 2, z: -36, shows: 'treetop deck round the Great Oak, rune circle (OBJ A), rope rail' },
  { id: 'oak-roots', name: 'Great Oak from the Ruins', region: 'Elderwood Hollow', x: 2, z: -12, shows: 'the trunk and its roots over the old stones, ladders and decks above' },
  { id: 'west-bridge', name: 'West Lookout Bridge', region: 'Elderwood Hollow', x: -30, z: -48, shows: 'rope bridge from the oak deck to the West Lookout platform' },
  { id: 'mossy-floor', name: 'Mossy Floor', region: 'Elderwood Hollow', x: -40, z: -22, shows: 'forest floor: roots, mossy rocks, glowcaps, fireflies' },
  // the High Canopy (north)
  { id: 'canopy-n1', name: 'North Oak Platform', region: 'High Canopy', x: 8, z: -120, shows: 'crenellated oak platform (CF-07), first link north' },
  { id: 'junction', name: 'High Junction', region: 'High Canopy', x: 22, z: -200, shows: 'five rope bridges meet at a hut round a trunk, 22 m up (CF-12)' },
  { id: 'rune-west', name: 'West Rune Oak', region: 'High Canopy', x: -160, z: -150, shows: 'oak platform with a rune spawn circle, bridge off into the canopy' },
  { id: 'rune-east', name: 'East Rune Oak', region: 'High Canopy', x: 175, z: -170, shows: 'oak platform with a blue rune circle, glowcaps on the rail' },
  { id: 'ruins-pit', name: 'Sunken Ruins', region: 'High Canopy', x: -92, z: -276, shows: 'broken bridge over a pit of old stone, 36 m drop' },
  { id: 'seedpods', name: 'Seedpod Lookout', region: 'High Canopy', x: 118, z: -262, shows: 'small deck under vines hung with glowing seedpods' },
  { id: 'combat-deck', name: 'Combat Deck', region: 'High Canopy', x: -205, z: -250, shows: 'square plank hub, bridges on every side, treehouses round it' },
  // Westwood
  { id: 'village', name: 'Treehouse Village', region: 'Westwood', x: -330, z: -195, shows: 'round rune plaza deck in the canopy ringed by treehouses on giant trees' },
  { id: 'settlement', name: 'Settlement', region: 'Westwood', x: -395, z: -55, pad: 34, shows: 'stone tower houses, treehouses, rope bridges, a glowing cable path, crystals' },
  { id: 'glowcap-hollow', name: 'Glowcap Hollow', region: 'Westwood', x: -420, z: 210, pad: 30, shows: 'giant blue mushrooms over a circuit-ringed clearing, stairs and arches' },
  { id: 'titan', name: 'Titan Tree', region: 'Westwood', x: -150, z: 326, shows: 'hollow titan trunk across the escarpment: bunker rings and a spiral ramp inside' },
  // the river, the Gorge, the vale
  { id: 'glowcap-stream', name: 'Glowcap Stream', region: 'River', x: 238, z: 170, shows: 'the river rushing through a rocky ravine under giant mushrooms, old pipes on the ledge' },
  { id: 'overlook', name: 'Zone 05 Outpost', region: 'Gorge', x: 262, z: 342, pad: 9, shows: 'cliff balcony beside the Great Falls over the violet vale (night)' },
  { id: 'sniper', name: 'Sniper Nest Z-06', region: 'Gorge', x: 136, z: 430, shows: 'sniper deck high in a rim tree, rope bridge down to the arena in the Gorge' },
  { id: 'gorge-arena', name: 'Gorge Arena', region: 'Gorge', x: 186, z: 456, shows: 'glowing ring arena on the Gorge floor between the falls' },
  { id: 'crystal-vault', name: 'Crystal Vault', region: 'Gorge', x: 268, z: 354, shows: 'cave behind the falls: crystals, ammo lockers, grates' },
  { id: 'rift-vault', name: 'Rift Vault', region: 'Gorge', x: 272, z: 322, shows: 'rune hall with a rift portal, circuit lines in the floor' },
  { id: 'mire', name: 'Mangrove Mire', region: 'Violet Vale', x: -330, z: 620, shows: 'boardwalks over the mire, stilt huts, terminals, a walkway through a trunk' },
  { id: 'vale', name: 'Violet Vale', region: 'Violet Vale', x: 20, z: 600, shows: 'violet canopy below the escarpment, the falls beyond' },
  // the Redwood Ruins (east, north-east)
  { id: 'portal-plaza', name: 'Portal Plaza', region: 'Redwood Ruins', x: 400, z: -110, pad: 30, shows: 'paved plaza under redwoods, gothic arches, a portal gate, cyan floor lines' },
  { id: 'circuit-court', name: 'Circuit Court', region: 'Redwood Ruins', x: 330, z: -265, pad: 22, shows: 'stone court with a stele on round steps, circuit lines, ruin walls' },
  { id: 'cathedral', name: 'Elder Cathedral', region: 'Redwood Ruins', x: 235, z: -420, pad: 30, shows: 'roofless nave, rose window, roots through the floor' },
  { id: 'zone10', name: 'Zone 10 Temple', region: 'Redwood Ruins', x: 445, z: -385, pad: 24, shows: 'statues either side of a ruined arch, a ZONE 10 pillar, dark grove' },
  { id: 'neon-gate', name: 'Neon Gate Ruins', region: 'Redwood Ruins', x: 505, z: -488, pad: 26, shows: 'holo gates and a neon grid floor before the Neon Falls' },
  { id: 'shrine', name: 'Anomaly Shrine', region: 'Redwood Ruins', x: 620, z: -240, pad: 30, sink: 4, shows: 'sunken octagon with a crystal pillar, scaffold galleries' },
  { id: 'digital-bridge', name: 'Digital Bridge', region: 'Redwood Ruins', x: 352, z: -128, shows: 'stone bridge over the river with cyan rails' },
];
export const place = (id: string) => PLACES.find((p) => p.id === id)!;

// ── underground and inside-the-tree spaces ───────────────────────────────────────────────────────────────────────
/** Where the terrain mesh has a hole (a cave mouth in a cliff, the Titan Tree's hollow): circles [x, z, r] and boxes
 *  [x, z, w, d, yaw] (local x along w). */
export const MESH_HOLES: { circles: number[][]; boxes: number[][] } = {
  circles: [[-150, 326, 12.2]],
  boxes: [[249, 354, 9, 7, 0]],          // the Crystal Vault's mouth in the Gorge's east wall
};
/** Volumes where the ground is the structure's own floor, not the terrain above it: [x, z, w, d, yaw, ceilY]. */
export const CAVES: number[][] = [
  [262, 354, 34, 18, 0, -36.5],          // Crystal Vault (mouth tunnel + hall)
  [272, 326, 20, 34, 0, -34.5],          // Rift Vault
];
export const CAVE_CIRCLES: number[][] = [[-150, 326, 12.6, 80]];   // the Titan Tree's hollow (whole height)

// ── trails between them (vegetation keeps off; data cables run along some) ───────────────────────────────────────
export const TRAILS: number[][][] = [
  [[72, 0], [150, -30], [260, -70], [340, -125], [400, -110]],                         // Spawn B → Digital Bridge → Portal Plaza
  [[400, -110], [372, -190], [330, -265], [270, -340], [235, -420]],                   // → Circuit Court → Cathedral
  [[330, -265], [400, -320], [445, -385], [490, -440], [505, -488]],                   // → Zone 10 → Neon Gate
  [[400, -110], [500, -160], [620, -240]],                                             // → Anomaly Shrine
  [[30, 76], [70, 150], [150, 170], [222, 150]],                                       // Waterfall Pool → Glowcap Stream
  [[222, 150], [232, 230], [250, 300], [262, 334]],                                    // ravine ledge → Zone 05 Outpost
  [[60, 120], [100, 260], [124, 380], [136, 430]],                                     // → Sniper Nest Z-06
  [[-72, 0], [-160, -20], [-260, -40], [-395, -55]],                                   // Spawn A → Settlement
  [[-395, -55], [-360, -130], [-330, -170]],                                           // → Treehouse Village
  [[-395, -55], [-430, 60], [-420, 210]],                                              // → Glowcap Hollow
  [[-420, 210], [-300, 260], [-160, 290]],                                             // → Titan Tree (plateau door)
  [[-60, 70], [-150, 200], [-160, 290]],
  [[-150, 330], [-250, 480], [-330, 620], [-150, 650], [20, 600], [150, 600], [205, 540]], // vale: Titan foot → Mire → Gorge mouth
  [[0, -80], [-30, -180], [-70, -250]],                                                // north trail to the Sunken Ruins
  [[0, -80], [80, -170], [118, -262]],
  [[-160, -150], [-205, -250]],
];

// ── the height function ───────────────────────────────────────────────────────────────────────────────────────────
let coreH: (x: number, z: number) => number = () => 0;
export const setCoreHeight = (f: (x: number, z: number) => number) => { coreH = f; padY.clear(); };
const padY = new Map<string, number>();

type Near = ReturnType<typeof polyNear>;
function bbox(pts: readonly (readonly number[])[], pad: number) {
  return pts.slice(0, -1).map((a, i) => { const b = pts[i + 1]; return [Math.min(a[0], b[0]) - pad, Math.max(a[0], b[0]) + pad, Math.min(a[1], b[1]) - pad, Math.max(a[1], b[1]) + pad]; });
}
const RIVER_BOX = bbox(RIVER, 60), STREAM_BOX = bbox(POOL_STREAM, 20);
const FAR: Near = { d: Infinity, i: 0, t: 0, s: 0 };
/** polyNear, skipped (d = Infinity) when (x, z) is outside every segment's padded box. */
function nearIfClose(pts: readonly (readonly number[])[], box: number[][], x: number, z: number): Near {
  for (const b of box) if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) return polyNear(pts, x, z);
  return FAR;
}
function riverCarve(h: number, n: Near, pts: readonly (readonly number[])[], bank: number): number {
  if (n.d === Infinity) return h;
  const w = lerpCol(pts, n.i, n.t, 3) / 2, bed = lerpCol(pts, n.i, n.t, 2);
  if (n.d > w + bank) return h;
  const prof = bed + (n.d < w ? -0.3 * (1 - (n.d / w) ** 2) : ((n.d - w) / bank) ** 1.6 * Math.max(0, h - bed));
  return Math.min(h, prof);
}

/** The world's height before the pads (the hollow inside its square). */
function baseHeight(x: number, z: number): number {
  const r = Math.max(Math.abs(x), Math.abs(z));
  const far = smooth(90, 260, r);
  // the plateau: rolling forest floor, gentle by the hollow
  let pl = (fbm2(x * 0.005, z * 0.005, 7) - 0.5) * 16 * far + (fbm2(x * 0.022, z * 0.022, 3) - 0.5) * (2.5 + 2.5 * far) + (fbm2(x * 0.09, z * 0.09, 5) - 0.5) * 0.6;
  // the Highland rising north, with a cliff rim in the east where the river falls
  pl += 30 * smooth(-440, -690, z) + 22 * smooth(-512, -530, z) * smooth(340, 420, x) * (1 - smooth(760, 830, x));
  // the Sunken Ruins: a pit of old stone under the canopy's broken bridge
  const pe = Math.hypot((x + 92) / 36, (z + 276) / 21);
  pl -= 22 * (1 - smooth(0.82, 1.04, pe));
  // Glowcap Stream: rock walls either side of the river through the ravine
  const rn = nearIfClose(RIVER, RIVER_BOX, x, z);
  {
    const n = rn;
    if (n.d < 44 && z > 60 && z < 270) pl += 9 * smooth(6, 12, n.d) * (1 - smooth(24, 42, n.d)) * smooth(60, 100, z) * (1 - smooth(230, 270, z)) * (0.75 + 0.5 * fbm2(x * 0.08, z * 0.08, 1));
  }
  // Glowcap Hollow: a sunken round clearing
  pl -= 3.2 * (1 - smooth(22, 30, Math.hypot(x + 420, z - 210)));
  // the vale: low, undulating, the mire basin in the south-west, a lake where the river ends
  const P = plateauMask(x, z);
  if (P >= 1) return finish(pl, x, z, r, rn);
  let vh = VALE_Y + (fbm2(x * 0.012, z * 0.012, 9) - 0.5) * 6;
  vh -= 4.2 * (1 - smooth(70, 200, Math.hypot(x + 330, z - 630))) * (0.6 + 0.8 * fbm2(x * 0.05, z * 0.05, 2));
  vh -= 3.0 * (1 - smooth(60, 160, Math.hypot(x - 40, z - 820)));
  let h = vh + (pl - vh) * P;
  // cliff faces: a little rock noise where the plateau breaks
  if (P > 0) h += (fbm2(x * 0.12, z * 0.12, 6) - 0.5) * 3 * P * (1 - P) * 4;
  return finish(h, x, z, r, rn);
}

function finish(h: number, x: number, z: number, r: number, rn: Near): number {
  // the hollow itself (elderwood.ts) inside its square
  const wc = 1 - smooth(CORE - 4, CORE + 26, r);
  if (wc > 0) h = h * (1 - wc) + coreH(x, z) * wc;
  // rivers carve through everything
  h = riverCarve(h, rn, RIVER, 10);
  h = riverCarve(h, nearIfClose(POOL_STREAM, STREAM_BOX, x, z), POOL_STREAM, 5);
  // mountains round the world
  if (r > PLAY - 40) h += smooth(PLAY - 40, HALF - 10, r) * (80 + 70 * fbm2(x * 0.004, z * 0.004, 8));
  return h;
}

/** World height: base, then the places' pads. */
export function worldHeight(x: number, z: number): number {
  let h = baseHeight(x, z);
  for (const p of PLACES) {
    if (!p.pad) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.pad * 1.6) continue;
    let y = p.y ?? padY.get(p.id);
    if (y === undefined) { y = p.y ?? baseHeight(p.x, p.z) - (p.sink ?? 0); padY.set(p.id, y); }
    const f = smooth(p.pad * 1.6, p.pad, d);
    h = h * (1 - f) + y * f;
  }
  return h;
}

/** The ground a place stands on (its pad height when it has one). */
export const placeY = (p: Place) => (p.pad ? (p.y ?? padY.get(p.id) ?? worldHeight(p.x, p.z)) : worldHeight(p.x, p.z));
