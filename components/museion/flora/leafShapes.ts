// ═══════════════════════════════════════════════════════════════════════════
// leafShapes — real leaf silhouettes, as maths.
//
// A square leaf is what makes procedural foliage read as "computer graphics".
// The single largest quality jump available here is giving each species the
// outline a botanist would recognise: an oak's rounded lobes, a birch's
// serrated ovate blade, a willow's lanceolate taper, a baobab's palmate hand,
// a pine's needle fascicle.
//
// PURE. Every generator returns polygons in leaf space — x ∈ [-0.5, 0.5],
// y ∈ [0, 1], base at the petiole (0,0), tip at (0,1). No canvas, no three.js,
// so the outlines are unit-testable; the texture baker rasterises them and the
// renderer only ever sees an alpha map.
// ═══════════════════════════════════════════════════════════════════════════

export type LeafShape =
  | 'broad' | 'needle' | 'palmate' | 'scale' | 'frond'
  | 'lanceolate' | 'ovate' | 'maple' | 'fan' | 'heart';

/** A closed outline: [x, y] pairs, counter-clockwise. */
export type Polygon = [number, number][];

/** One leaf may be several blades (a palmate hand, a needle fascicle). */
export interface LeafOutline {
  polygons: Polygon[];
  /** Midrib polylines — drawn as veins over the blade. */
  veins: Polygon[];
}

const TAU = Math.PI * 2;

/**
 * Oak: pinnately lobed. Width is a base ellipse modulated by a cosine so the
 * margin swings in and out — that swing IS the lobe, and the deep sinuses
 * between them are what your eye reads as "oak" from ten metres away.
 */
function oakBlade(lobes = 4, depth = 0.42, steps = 90): LeafOutline {
  const right: Polygon = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;                       // 0 at base, 1 at tip
    // base ellipse: narrow at the petiole, widest ~55% up, tapering to the tip
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.5;
    // lobe swing — deeper in the middle of the blade than at either end
    const swing = 1 - depth * (0.5 + 0.5 * Math.cos(t * lobes * TAU));
    const w = env * swing * Math.pow(1 - t * 0.18, 0.6);
    right.push([w, t]);
  }
  const poly: Polygon = [...right];
  for (let i = right.length - 1; i >= 0; i--) poly.push([-right[i][0], right[i][1]]);
  return { polygons: [poly], veins: [[[0, 0], [0, 1]]] };
}

/**
 * Birch: ovate with a doubly-serrate margin and a drawn-out tip. The teeth are
 * a high-frequency sawtooth riding the outline — small, but they catch light
 * at the silhouette edge and stop the leaf reading as a smooth blob.
 */
function ovateSerrate(teeth = 22, toothDepth = 0.055, steps = 120): LeafOutline {
  const right: Polygon = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const env = Math.sin(Math.pow(t, 0.58) * Math.PI) * 0.46;   // broad low, pointed tip
    const saw = (t * teeth) % 1;
    const tooth = t > 0.06 && t < 0.97 ? (saw < 0.5 ? saw : 1 - saw) * 2 * toothDepth : 0;
    right.push([Math.max(0, env - tooth), t]);
  }
  const poly: Polygon = [...right];
  for (let i = right.length - 1; i >= 0; i--) poly.push([-right[i][0], right[i][1]]);
  const veins: Polygon[] = [[[0, 0], [0, 1]]];
  for (let k = 1; k <= 5; k++) {                                 // pinnate side veins
    const y = 0.14 + k * 0.14;
    const w = Math.sin(Math.pow(y, 0.58) * Math.PI) * 0.42;
    veins.push([[0, y], [w, y + 0.09]]);
    veins.push([[0, y], [-w, y + 0.09]]);
  }
  return { polygons: [poly], veins };
}

/** Willow: lanceolate — long, narrow, tapered at both ends, entire margin. */
function lanceolate(steps = 80): LeafOutline {
  const right: Polygon = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = Math.sin(Math.pow(t, 0.85) * Math.PI) * 0.19;      // slender
    right.push([w, t]);
  }
  const poly: Polygon = [...right];
  for (let i = right.length - 1; i >= 0; i--) poly.push([-right[i][0], right[i][1]]);
  return { polygons: [poly], veins: [[[0, 0], [0, 1]]] };
}

/**
 * Baobab: palmate — 5 leaflets radiating from one point, the middle longest.
 * Each leaflet is its own obovate blade, rotated about the petiole.
 */
function palmate(leaflets = 5, spread = 1.5, steps = 40): LeafOutline {
  const polygons: Polygon[] = [];
  const veins: Polygon[] = [];
  for (let k = 0; k < leaflets; k++) {
    const f = leaflets === 1 ? 0 : (k / (leaflets - 1) - 0.5) * 2;   // −1..1
    const ang = f * (spread / 2);
    const len = 1 - Math.abs(f) * 0.3;                               // outer ones shorter
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const right: Polygon = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Obovate: widest past the middle, but pinched to nothing at the petiole —
      // without that taper the outer leaflets swing below the attachment point
      // once rotated, and the hand stops sitting on its stalk.
      const w = Math.sin(Math.pow(t, 0.5) * Math.PI) * 0.115 * Math.min(1, t * 6);
      right.push([w, t * len]);
    }
    const blade: Polygon = [...right];
    for (let i = right.length - 1; i >= 0; i--) blade.push([-right[i][0], right[i][1]]);
    polygons.push(blade.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca] as [number, number]));
    veins.push([[0, 0], [-sa * len, ca * len]]);
  }
  return { polygons, veins };
}

/** Pine: a fascicle of needles — thin, near-parallel, splayed slightly. */
function needleFascicle(count = 5, spread = 0.5): LeafOutline {
  const polygons: Polygon[] = [];
  const w = 0.028;
  for (let k = 0; k < count; k++) {
    const f = count === 1 ? 0 : (k / (count - 1) - 0.5) * 2;
    const ang = f * (spread / 2);
    const len = 1 - Math.abs(f) * 0.12;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const raw: Polygon = [[-w, 0], [w, 0], [w * 0.35, len * 0.92], [0, len], [-w * 0.35, len * 0.92]];
    polygons.push(raw.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca] as [number, number]));
  }
  return { polygons, veins: [] };
}

/** Cypress/juniper: overlapping scale leaves on a short shoot. */
function scaleLeaf(rows = 5): LeafOutline {
  const polygons: Polygon[] = [];
  for (let r = 0; r < rows; r++) {
    const y = r / rows;
    const w = 0.11 * (1 - y * 0.5);
    const h = 1 / rows;
    const side = r % 2 ? 1 : -1;
    polygons.push([
      [side * w * 0.2, y],
      [side * w, y + h * 0.45],
      [side * w * 0.3, y + h],
      [0, y + h * 0.5],
    ]);
  }
  return { polygons, veins: [] };
}

/** Fern: a pinnate frond — paired pinnae stepping down a central rachis. */
function frond(pairs = 12): LeafOutline {
  const polygons: Polygon[] = [];
  const rachis: Polygon = [[-0.012, 0], [0.012, 0], [0.006, 1], [-0.006, 1]];
  polygons.push(rachis);
  for (let k = 0; k < pairs; k++) {
    const t = 0.06 + (k / pairs) * 0.9;
    const len = 0.34 * Math.sin(Math.pow(t, 0.6) * Math.PI) + 0.05;
    const h = 0.055;
    for (const s of [1, -1]) {
      polygons.push([
        [0, t],
        [s * len, t + h * 0.8],
        [s * len * 0.92, t + h * 1.5],
        [0, t + h * 0.6],
      ]);
    }
  }
  return { polygons, veins: [] };
}

/**
 * Maple: palmately LOBED — one blade with five points radiating from the petiole
 * and deep sinuses between them. Different from 'palmate', which is separate
 * leaflets; this is the flag-of-Canada silhouette.
 */
function mapleBlade(points = 5, steps = 220): LeafOutline {
  const poly: Polygon = [];
  const SWEEP = 1.22;                                 // ±70°: a fan, not a full circle
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const ang = (u - 0.5) * SWEEP * 2;
    // |cos| peaks once per lobe; the exponent sharpens the sinus between them
    const wave = Math.abs(Math.cos((u - 0.5) * points * Math.PI));
    const taper = 1 - Math.abs(u - 0.5) * 0.5;        // outer lobes are shorter
    const r = (0.34 + 0.62 * Math.pow(wave, 0.62)) * taper;
    poly.push([Math.sin(ang) * r * 0.62, Math.max(0, Math.cos(ang) * r)]);
  }
  poly.push([0, 0]);                                  // close at the petiole
  const veins: Polygon[] = [];
  for (let k = 0; k < points; k++) {
    const f = points === 1 ? 0 : (k / (points - 1) - 0.5) * 2;
    const ang = f * SWEEP;
    veins.push([[0, 0.03], [Math.sin(ang) * 0.5 * 0.62, Math.max(0.05, Math.cos(ang) * 0.78)]]);
  }
  return { polygons: [poly], veins };
}

/** Ginkgo: a fan — no midrib, just dichotomous veins radiating to a notched edge. */
function fanBlade(steps = 60): LeafOutline {
  const poly: Polygon = [[0, 0]];
  const spread = 1.05;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = (u - 0.5) * spread * 2;
    // a shallow notch splits the fan's outer edge in two
    const notch = 1 - Math.pow(Math.cos(a * 3.1), 8) * 0.16;
    const r = 0.92 * notch;
    poly.push([Math.sin(a) * r * 0.72, Math.cos(a) * r]);
  }
  const veins: Polygon[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 6 - 0.5) * spread * 1.7;
    veins.push([[0, 0.02], [Math.sin(a) * 0.62, Math.cos(a) * 0.84]]);
  }
  return { polygons: [poly], veins };
}

/** Cordate — a heart, for lindens and poplars: broad shoulders, drawn-out tip. */
function heartBlade(steps = 110): LeafOutline {
  const right: Polygon = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // widest low on the blade, notched at the base
    const env = Math.sin(Math.pow(t, 0.42) * Math.PI) * 0.47;
    const notch = t < 0.1 ? Math.pow(t / 0.1, 0.55) : 1;
    right.push([env * notch, t]);
  }
  const poly: Polygon = [...right];
  for (let i = right.length - 1; i >= 0; i--) poly.push([-right[i][0], right[i][1]]);
  const veins: Polygon[] = [[[0, 0], [0, 1]]];
  for (let k = 1; k <= 3; k++) {
    const y = 0.12 + k * 0.2;
    veins.push([[0, 0.06], [0.4, y + 0.16]]);
    veins.push([[0, 0.06], [-0.4, y + 0.16]]);
  }
  return { polygons: [poly], veins };
}

/** The species → outline table. */
export function leafOutline(shape: LeafShape): LeafOutline {
  switch (shape) {
    case 'needle': return needleFascicle();
    case 'palmate': return palmate();
    case 'scale': return scaleLeaf();
    case 'frond': return frond();
    case 'lanceolate': return lanceolate();
    case 'ovate': return ovateSerrate();
    case 'maple': return mapleBlade();
    case 'fan': return fanBlade();
    case 'heart': return heartBlade();
    case 'broad':
    default: return oakBlade();
  }
}

/** Bounding box of an outline — the baker uses it to fill the texture. */
export function outlineBounds(o: LeafOutline): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of o.polygons) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/** Signed area × 2 — used to check a blade is a real, non-degenerate polygon. */
export function polygonArea(p: Polygon): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
