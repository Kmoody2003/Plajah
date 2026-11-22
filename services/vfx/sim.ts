// Plajah VFX — particle simulation core (docs/rift-realm-fx-study.md §2, "GPU particle system").
// Pure TypeScript, no three.js: a fixed pool per layer, recipes spawn into it, step() moves everything and packs the
// live particles into the arrays the renderer uploads. Kept CPU-side on purpose: hit effects are bursts of a few
// hundred particles, which cost well under a millisecond here, and it runs the same on the WebGL fallback.

export type Layer = 'add' | 'alpha' | 'shard';
export type Shape = 'soft' | 'spark' | 'ring' | 'smoke';
export const SHAPE_ID: Record<Shape, number> = { soft: 0, spark: 1, ring: 2, smoke: 3 };

/** A number or a [min, max] range picked per particle. */
export type Range = number | [number, number];
/** A hex colour, or 'tint' (the colour passed to spawn), or 'tint+white' (tint lifted halfway to white). */
export type Col = number | 'tint' | 'tint+white';

export interface EmitterSpec {
  layer: Layer;
  shape?: Shape;               // sprite layers; ignored for shards
  count: Range;
  delay?: number;              // seconds after the spawn call
  life: Range;
  speed: Range;
  /** Cone half-angle in radians around the spawn direction; Math.PI = every direction. */
  spread?: number;
  /** Extra velocity along world up (embers drifting, smoke rising). */
  lift?: Range;
  radius?: Range;              // spawn sphere radius
  size: [Range, Range];        // start, end (metres)
  color: [Col, Col];           // over life
  intensity?: Range;           // HDR multiplier so bloom catches it
  alpha?: [number, number];    // start, end
  gravity?: number;            // m/s², down
  drag?: number;               // 1/s
  turbulence?: number;         // m/s² of wandering
  stretch?: number;            // spark streak length per m/s
  spin?: Range;                // rad/s (shards, smoke)
  bounce?: number;             // 0 = stop on the ground, 0.4 = lively, undefined = no ground test
}

export interface Recipe {
  id: string;
  emitters: EmitterSpec[];
  /** Point-light pop: colour, peak intensity, range, seconds. */
  light?: { color: Col; intensity: number; range: number; life: number };
  /** Name of the sound clip that belongs with this effect (from the SFX library). */
  sound?: string;
  shake?: number;
}

export interface SpawnOpts {
  dir?: [number, number, number];  // main direction (normal of the surface hit), default up
  tint?: number;
  scale?: number;                  // multiplies size, speed and radius
  count?: number;                  // multiplies counts
}

const FIELDS = 24;
// per particle: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 size0, 9 size1, 10-12 rgb0, 13-15 rgb1, 16 intensity,
// 17 alpha0, 18 alpha1, 19 gravity, 20 drag, 21 turbulence, 22 stretch, 23 shape | bounce packed below
const EXTRA = 4; // 0 spin, 1 rot, 2 bounce (-1 none), 3 seed

export class Rng {
  constructor(private s = 0x9e3779b9) {}
  next() { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  pick(r: Range | undefined, d = 0) { return r === undefined ? d : typeof r === 'number' ? r : r[0] + (r[1] - r[0]) * this.next(); }
}

function hexRgb(h: number): [number, number, number] { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
function resolveCol(c: Col, tint: number): [number, number, number] {
  if (c === 'tint') return hexRgb(tint);
  if (c === 'tint+white') { const [r, g, b] = hexRgb(tint); return [(r + 1) / 2, (g + 1) / 2, (b + 1) / 2]; }
  return hexRgb(c);
}

/** Output of one layer after step(): `count` live particles packed at the front of each array. */
export interface LayerOut {
  count: number;
  posAge: Float32Array;   // x y z t(0..1)
  velSize: Float32Array;  // vx vy vz size
  color: Float32Array;    // r g b alpha (rgb already × intensity)
  misc: Float32Array;     // stretch shape rot seed
}

export class Pool {
  readonly cap: number;
  private d: Float32Array;
  private x: Float32Array;
  live = 0;
  readonly out: LayerOut;
  constructor(cap: number) {
    this.cap = cap;
    this.d = new Float32Array(cap * FIELDS);
    this.x = new Float32Array(cap * EXTRA);
    this.out = { count: 0, posAge: new Float32Array(cap * 4), velSize: new Float32Array(cap * 4), color: new Float32Array(cap * 4), misc: new Float32Array(cap * 4) };
  }
  /** Returns the slot to fill; when full, overwrites the oldest-looking slot (ring from the end). */
  alloc(): number {
    if (this.live < this.cap) return this.live++;
    let best = 0, bt = -1;
    for (let k = 0; k < this.cap; k += 7) { const t = this.d[k * FIELDS + 6] / this.d[k * FIELDS + 7]; if (t > bt) { bt = t; best = k; } }
    return best;
  }
  raw() { return { d: this.d, x: this.x }; }
}

export type GroundFn = (x: number, z: number, y: number) => number | null;

interface Pending { at: number; e: EmitterSpec; p: [number, number, number]; o: SpawnOpts }

export class ParticleSim {
  readonly pools: Record<Layer, Pool>;
  readonly rng: Rng;
  private pending: Pending[] = [];
  private t = 0;
  ground: GroundFn | null = null;
  /** Lights requested by recipes this step (the renderer turns them into pooled point lights). */
  lights: { p: [number, number, number]; rgb: [number, number, number]; intensity: number; range: number; life: number }[] = [];
  shake = 0;

  constructor(caps: Partial<Record<Layer, number>> = {}, seed = 1) {
    this.pools = { add: new Pool(caps.add ?? 6000), alpha: new Pool(caps.alpha ?? 1500), shard: new Pool(caps.shard ?? 400) };
    this.rng = new Rng(seed);
  }

  spawn(r: Recipe, p: [number, number, number], o: SpawnOpts = {}) {
    for (const e of r.emitters) {
      if (e.delay) this.pending.push({ at: this.t + e.delay, e, p, o });
      else this.emit(e, p, o);
    }
    if (r.light) this.lights.push({ p, rgb: resolveCol(r.light.color, o.tint ?? 0xffffff), intensity: r.light.intensity * (o.scale ?? 1), range: r.light.range * (o.scale ?? 1), life: r.light.life });
    if (r.shake) this.shake = Math.max(this.shake, r.shake * (o.scale ?? 1));
  }

  private emit(e: EmitterSpec, p: [number, number, number], o: SpawnOpts) {
    const R = this.rng, pool = this.pools[e.layer], { d, x } = pool.raw();
    const sc = o.scale ?? 1, tint = o.tint ?? 0xffffff;
    let [dx, dy, dz] = o.dir ?? [0, 1, 0];
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    // basis around the direction
    let ux = Math.abs(dy) < 0.95 ? 0 : 1, uy = Math.abs(dy) < 0.95 ? 1 : 0, uz = 0;
    let tx = uy * dz - uz * dy, ty = uz * dx - ux * dz, tz = ux * dy - uy * dx;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = dy * tz - dz * ty, by = dz * tx - dx * tz, bz = dx * ty - dy * tx;
    const n = Math.max(0, Math.round(R.pick(e.count) * (o.count ?? 1)));
    const c0 = resolveCol(e.color[0], tint), c1 = resolveCol(e.color[1], tint);
    const spread = e.spread ?? Math.PI;
    for (let k = 0; k < n; k++) {
      const i = pool.alloc(), b = i * FIELDS, xb = i * EXTRA;
      // direction inside the cone (uniform over the cap)
      const cosA = 1 - R.next() * (1 - Math.cos(spread)), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA)), ph = R.next() * Math.PI * 2;
      const vx = dx * cosA + (tx * Math.cos(ph) + bx * Math.sin(ph)) * sinA;
      const vy = dy * cosA + (ty * Math.cos(ph) + by * Math.sin(ph)) * sinA;
      const vz = dz * cosA + (tz * Math.cos(ph) + bz * Math.sin(ph)) * sinA;
      const sp = R.pick(e.speed) * sc, rad = R.pick(e.radius) * sc, rr = rad * Math.cbrt(R.next());
      const lift = R.pick(e.lift);
      d[b] = p[0] + vx * rr; d[b + 1] = p[1] + vy * rr; d[b + 2] = p[2] + vz * rr;
      d[b + 3] = vx * sp; d[b + 4] = vy * sp + lift; d[b + 5] = vz * sp;
      d[b + 6] = 0; d[b + 7] = Math.max(0.02, R.pick(e.life));
      d[b + 8] = R.pick(e.size[0]) * sc; d[b + 9] = R.pick(e.size[1]) * sc;
      d.set(c0, b + 10); d.set(c1, b + 13);
      d[b + 16] = R.pick(e.intensity, 1);
      d[b + 17] = e.alpha?.[0] ?? 1; d[b + 18] = e.alpha?.[1] ?? 0;
      d[b + 19] = e.gravity ?? 0; d[b + 20] = e.drag ?? 0; d[b + 21] = e.turbulence ?? 0; d[b + 22] = e.stretch ?? 0;
      d[b + 23] = SHAPE_ID[e.shape ?? 'soft'];
      x[xb] = R.pick(e.spin) * (R.next() < 0.5 ? -1 : 1); x[xb + 1] = R.next() * Math.PI * 2; x[xb + 2] = e.bounce ?? -1; x[xb + 3] = R.next();
    }
  }

  get liveCount() { return this.pools.add.live + this.pools.alpha.live + this.pools.shard.live; }

  step(dt: number) {
    this.t += dt;
    if (this.pending.length) {
      const due = this.pending.filter((q) => q.at <= this.t);
      if (due.length) { this.pending = this.pending.filter((q) => q.at > this.t); for (const q of due) this.emit(q.e, q.p, q.o); }
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    const R = this.rng;
    for (const layer of ['add', 'alpha', 'shard'] as Layer[]) {
      const pool = this.pools[layer], { d, x } = pool.raw(), o = pool.out;
      let w = 0;
      for (let i = 0; i < pool.live; i++) {
        const b = i * FIELDS, xb = i * EXTRA;
        d[b + 6] += dt;
        if (d[b + 6] >= d[b + 7]) continue; // dead: not copied forward
        const drag = Math.exp(-d[b + 20] * dt), tu = d[b + 21];
        d[b + 3] = d[b + 3] * drag + (tu ? (R.next() - 0.5) * tu * dt * 2 : 0);
        d[b + 4] = d[b + 4] * drag - d[b + 19] * dt + (tu ? (R.next() - 0.5) * tu * dt * 2 : 0);
        d[b + 5] = d[b + 5] * drag + (tu ? (R.next() - 0.5) * tu * dt * 2 : 0);
        d[b] += d[b + 3] * dt; d[b + 1] += d[b + 4] * dt; d[b + 2] += d[b + 5] * dt;
        x[xb + 1] += x[xb] * dt;
        const bounce = x[xb + 2];
        if (bounce >= 0 && this.ground && d[b + 4] < 0) {
          const g = this.ground(d[b], d[b + 2], d[b + 1] + 0.5);
          if (g !== null && d[b + 1] < g) {
            d[b + 1] = g; d[b + 4] = -d[b + 4] * bounce; d[b + 3] *= 0.6; d[b + 5] *= 0.6; x[xb] *= 0.5;
          }
        }
        // compact: move this particle to slot w
        if (w !== i) { d.copyWithin(w * FIELDS, b, b + FIELDS); x.copyWithin(w * EXTRA, xb, xb + EXTRA); }
        const wb = w * FIELDS, wx = w * EXTRA, t = d[wb + 6] / d[wb + 7], q = w * 4;
        const size = d[wb + 8] + (d[wb + 9] - d[wb + 8]) * t, I = d[wb + 16] * (1 - 0.55 * t); // glow cools as it dies
        o.posAge[q] = d[wb]; o.posAge[q + 1] = d[wb + 1]; o.posAge[q + 2] = d[wb + 2]; o.posAge[q + 3] = t;
        o.velSize[q] = d[wb + 3]; o.velSize[q + 1] = d[wb + 4]; o.velSize[q + 2] = d[wb + 5]; o.velSize[q + 3] = size;
        // colour eases toward the end colour faster at the start (hot core cools quickly)
        const ct = Math.sqrt(t);
        o.color[q] = (d[wb + 10] + (d[wb + 13] - d[wb + 10]) * ct) * I;
        o.color[q + 1] = (d[wb + 11] + (d[wb + 14] - d[wb + 11]) * ct) * I;
        o.color[q + 2] = (d[wb + 12] + (d[wb + 15] - d[wb + 12]) * ct) * I;
        o.color[q + 3] = d[wb + 17] + (d[wb + 18] - d[wb + 17]) * t;
        o.misc[q] = d[wb + 22]; o.misc[q + 1] = d[wb + 23]; o.misc[q + 2] = x[wx + 1]; o.misc[q + 3] = x[wx + 3];
        w++;
      }
      pool.live = w; o.count = w;
    }
  }
}
