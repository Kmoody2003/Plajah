// The Plajah pose lifter in the browser: corrects MediaPipe's 3D body from one camera before the solver runs.
// Trained by scripts/mocap/train_lifter.py on CMU motion rendered on Plajah characters (labs/mocap/multiview.ts).
// A small residual MLP over a 9-frame window; plain typed-array maths, well under a millisecond per frame, so it
// runs for live capture too. Weights: a JSON header + float16 blob (public/models/mocap/lifter-v1.*).
//
//   const lifter = await loadLifter();  const better = lifter.apply(rawTake);  solveTake(better)
import type { RawFrame, RawTake } from './types';

interface Header {
  format: string; window: number; feat: number; hidden: number; blocks: number; joints: string[];
  tensors: { name: string; shape: number[]; offset: number }[];
  valBoneDeg?: number; mediapipeValBoneDeg?: number;
}

const half2float = (h: number) => {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
};

/** Our joints → the MediaPipe landmark they replace; hands/feet/head points ride along with their anchor. */
const TO_MP: Record<string, number> = { lShldr: 11, rShldr: 12, lForeArm: 13, rForeArm: 14, lHand: 15, rHand: 16, lThigh: 23, rThigh: 24, lShin: 25, rShin: 26, lFoot: 27, rFoot: 28 };
const RIDERS: [number, number[]][] = [[15, [17, 19, 21]], [16, [18, 20, 22]], [27, [29, 31]], [28, [30, 32]]];
const FEAT = 33 * 2 + 33 + 33 * 3;

export interface Lifter {
  header: Header;
  /** Body for every found frame: 15 joints (header.joints), hip-relative, camera frame (y up, z toward camera), in
   *  units of the hip→neck length. */
  predict(take: RawTake): (Float32Array | null)[];
  /** The take with MediaPipe's world points replaced by the lifter's (same scale and axes as MediaPipe's). Frames
   *  where the picture is poorly seen, or where the lifter and MediaPipe disagree wildly, keep MediaPipe (blended
   *  smoothly over time so nothing pops). */
  apply(take: RawTake, gate?: LiftGate | false): RawTake;
}

export interface LiftGate {
  /** Mean landmark visibility (limbs) below which the lifter fades out. Default 0.5. */
  minVis?: number;
  /** Mean limb-direction disagreement (degrees) above which the lifter fades out. Default 40. */
  maxDisagreeDeg?: number;
  /** Frames either side over which the weight is smoothed. Default 4. */
  smooth?: number;
}

export async function loadLifter(url = '/models/mocap/lifter-v1'): Promise<Lifter> {
  const [header, bin] = await Promise.all([
    fetch(`${url}.json`).then((r) => { if (!r.ok) throw new Error(`lifter ${r.status}`); return r.json() as Promise<Header>; }),
    fetch(`${url}.bin`).then((r) => r.arrayBuffer()),
  ]);
  return makeLifter(header, bin);
}

export function makeLifter(header: Header, bin: ArrayBuffer): Lifter {
  if (header.format !== 'plajah-lifter/1') throw new Error(`unknown lifter format ${header.format}`);
  const u16 = new Uint16Array(bin);
  const T: Record<string, { d: Float32Array; shape: number[] }> = {};
  for (const t of header.tensors) {
    const n = t.shape.reduce((a, b) => a * b, 1), d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = half2float(u16[t.offset + i]);
    T[t.name] = { d, shape: t.shape };
  }
  const H = header.hidden, IN = header.window * header.feat;
  // Linear: torch weight is (out, in), row-major.
  const linear = (x: Float32Array, name: string, out: number, inp: number) => {
    const W = T[`${name}.weight`].d, b = T[`${name}.bias`].d, y = new Float32Array(out);
    for (let o = 0; o < out; o++) { let s = b[o]; const r = o * inp; for (let i = 0; i < inp; i++) s += W[r + i] * x[i]; y[o] = s; }
    return y;
  };
  const gelu = (x: Float32Array) => { for (let i = 0; i < x.length; i++) { const v = x[i]; x[i] = 0.5 * v * (1 + Math.tanh(0.7978845608 * (v + 0.044715 * v * v * v))); } return x; };
  const norm = (x: Float32Array, name: string) => {
    let m = 0; for (const v of x) m += v; m /= x.length;
    let q = 0; for (const v of x) q += (v - m) ** 2; const s = 1 / Math.sqrt(q / x.length + 1e-5);
    const g = T[`${name}.weight`].d, b = T[`${name}.bias`].d, y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = (x[i] - m) * s * g[i] + b[i];
    return y;
  };
  const mu = T.mu.d, sd = T.sd.d;
  const forward = (inp: Float32Array) => {
    const z = new Float32Array(IN);
    for (let i = 0; i < IN; i++) z[i] = (inp[i] - mu[i]) / sd[i];
    let x = gelu(linear(z, 'inp', H, IN));
    for (let k = 0; k < header.blocks; k++) {
      const y = linear(gelu(linear(norm(x, `blocks.${k}.n`), `blocks.${k}.a`, H, H)), `blocks.${k}.b`, H, H);
      for (let i = 0; i < H; i++) x[i] += y[i];
    }
    x = norm(x, 'n');
    return linear(x, 'out', 45, H);
  };

  const features = (take: RawTake): { f: Float32Array[]; found: boolean[] } => {
    const W = take.width || 16, Hh = take.height || 9;
    const fN = 0.5 / Math.tan(((take.hfovDeg ?? 60) * Math.PI) / 360);
    const f: Float32Array[] = [], found: boolean[] = [];
    for (const fr of take.frames) {
      const v = new Float32Array(FEAT);
      if (fr) {
        const rx = fr.pts.map((p) => (p.x - 0.5) / fN), ry = fr.pts.map((p) => (-(p.y - 0.5) * (Hh / W)) / fN);
        const hx = (rx[23] + rx[24]) / 2, hy = (ry[23] + ry[24]) / 2;
        const torso = Math.max(Math.hypot((rx[11] + rx[12]) / 2 - hx, (ry[11] + ry[12]) / 2 - hy), 1e-3);
        for (let i = 0; i < 33; i++) {
          v[i * 2] = (rx[i] - hx) / torso; v[i * 2 + 1] = (ry[i] - hy) / torso; v[66 + i] = fr.pts[i].v;
          v[99 + i * 3] = fr.world[i].x; v[99 + i * 3 + 1] = -fr.world[i].y; v[99 + i * 3 + 2] = -fr.world[i].z;
        }
      }
      f.push(v); found.push(!!fr);
    }
    // Missing frames take the nearest found frame.
    const idx = found.flatMap((x, i) => (x ? [i] : []));
    if (idx.length) for (let i = 0; i < f.length; i++) if (!found[i]) {
      let best = idx[0]; for (const j of idx) if (Math.abs(j - i) < Math.abs(best - i)) best = j;
      f[i] = f[best];
    }
    return { f, found };
  };

  const predict = (take: RawTake) => {
    const { f, found } = features(take), n = f.length, half = header.window >> 1;
    if (!found.some(Boolean)) return f.map(() => null);
    const inp = new Float32Array(IN);
    return f.map((_, i) => {
      if (!found[i]) return null;
      for (let k = 0; k < header.window; k++) inp.set(f[Math.min(n - 1, Math.max(0, i - half + k))], k * FEAT);
      return forward(inp);
    });
  };

  const J = (name: string) => header.joints.indexOf(name);
  const LIMBS: [number, number][] = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [23, 11], [24, 12]];
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const apply = (take: RawTake, gate: LiftGate | false = {}): RawTake => {
    const pred = predict(take);
    const lifted = take.frames.map((fr, i): RawFrame | null => {
      const p = pred[i];
      if (!fr || !p) return fr;
      const w = fr.world.map((q) => ({ ...q }));
      // Scale: MediaPipe's own hip→shoulder-mid length in metres (the lifter is proportion-free).
      const mid = (a: number, b: number) => ({ x: (w[a].x + w[b].x) / 2, y: (w[a].y + w[b].y) / 2, z: (w[a].z + w[b].z) / 2 });
      const hm = mid(23, 24), sm = mid(11, 12);
      const scale = Math.hypot(sm.x - hm.x, sm.y - hm.y, sm.z - hm.z);
      // Lifter joints in MediaPipe's axes (x right, y down, z away), recentred on the new hip midpoint.
      const at = (j: number) => ({ x: p[j * 3] * scale, y: -p[j * 3 + 1] * scale, z: -p[j * 3 + 2] * scale });
      const lt = at(J('lThigh')), rt = at(J('rThigh'));
      const c = { x: (lt.x + rt.x) / 2, y: (lt.y + rt.y) / 2, z: (lt.z + rt.z) / 2 };
      const oldNeck = sm;
      for (const [name, mp] of Object.entries(TO_MP)) {
        const q = at(J(name)), dx = q.x - c.x - w[mp].x, dy = q.y - c.y - w[mp].y, dz = q.z - c.z - w[mp].z;
        w[mp].x += dx; w[mp].y += dy; w[mp].z += dz;
        for (const [anchor, riders] of RIDERS) if (anchor === mp) for (const r of riders) { w[r].x += dx; w[r].y += dy; w[r].z += dz; }
      }
      // Head points follow the shoulders' midpoint.
      const ns = mid(11, 12), hx = ns.x - oldNeck.x, hy = ns.y - oldNeck.y, hz = ns.z - oldNeck.z;
      for (let k = 0; k <= 10; k++) { w[k].x += hx; w[k].y += hy; w[k].z += hz; }
      return { ...fr, world: w };
    });
    if (gate === false) return { ...take, frames: lifted, source: { ...take.source, lifted: true } as RawTake['source'] };
    // Confidence: how well the limbs are seen, and how far the lifter strays from MediaPipe's own limb directions.
    const minVis = gate.minVis ?? 0.5, maxDeg = gate.maxDisagreeDeg ?? 40, R = gate.smooth ?? 4;
    const raw = take.frames.map((fr, i) => {
      const l = lifted[i];
      if (!fr || !l || !pred[i]) return 0;
      let vis = 0; for (const [a, b] of LIMBS) vis += Math.min(fr.pts[a].v, fr.pts[b].v); vis /= LIMBS.length;
      let deg = 0;
      for (const [a, b] of LIMBS) {
        const u = { x: fr.world[b].x - fr.world[a].x, y: fr.world[b].y - fr.world[a].y, z: fr.world[b].z - fr.world[a].z };
        const v = { x: l.world[b].x - l.world[a].x, y: l.world[b].y - l.world[a].y, z: l.world[b].z - l.world[a].z };
        const c = (u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1);
        deg += (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
      }
      deg /= LIMBS.length;
      return ss(minVis - 0.15, minVis + 0.15, vis) * (1 - ss(maxDeg - 15, maxDeg + 15, deg));
    });
    const weight = raw.map((_, i) => {
      let s = 0, n = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < raw.length && take.frames[j]) { s += raw[j]; n++; } }
      return n ? Math.min(raw[i] + 0.25, s / n) : 0; // a bad frame pulls its neighbours down, never up much
    });
    const frames = take.frames.map((fr, i): RawFrame | null => {
      const l = lifted[i], a = weight[i];
      if (!fr || !l || a <= 0) return fr;
      if (a >= 1) return l;
      return { ...fr, world: fr.world.map((q, k) => ({ ...q, x: q.x + (l.world[k].x - q.x) * a, y: q.y + (l.world[k].y - q.y) * a, z: q.z + (l.world[k].z - q.z) * a })) };
    });
    return { ...take, frames, source: { ...take.source, lifted: true, liftWeight: weight.reduce((x, y) => x + y, 0) / Math.max(1, weight.length) } as RawTake['source'] };
  };

  return { header, predict, apply };
}
