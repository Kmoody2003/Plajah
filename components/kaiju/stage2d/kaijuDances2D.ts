// kaijuDances2D — motion-capture dances for the 2D puppets.
//
// scripts/mocap/bakeKaiju2DDances.mjs projects the same CMU clips the 3D kaiju dance to onto the 2D Pose
// vector (arm raise, leg swing, torso lean, head roll, hop, spin, tail, frill flare, squash…).
// Dance2D plays one of them (looping, speed-matched to the beat) and crossfades to the next.

import { type Pose, REST, clamp } from '../kaijuPose';
import { type DanceMeta, danceTimeScale, pickDance } from '../stage3d/kaijuDanceCommon';

interface Index2D {
  fps: number; perFrame: number; credit: string;
  channels: { name: string; scale: number }[];
  clips: DanceMeta[];
}
export interface Dances2D { index: Index2D; metas: DanceMeta[]; data: Int16Array; credit: string }

const BASE = '/models/mascots/dances/';
let loading: Promise<Dances2D | null> | null = null;
export function loadDances2D(): Promise<Dances2D | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [jr, br] = await Promise.all([fetch(BASE + 'dances2d.json'), fetch(BASE + 'dances2d.bin')]);
      if (!jr.ok || !br.ok) return null;
      const index: Index2D = await jr.json();
      return { index, metas: index.clips, data: new Int16Array(await br.arrayBuffer()), credit: index.credit };
    } catch { return null; }
  })();
  return loading;
}
export { pickDance, danceTimeScale };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
/** Plays one mocap clip as a stream of Pose partials; crossfades when the clip changes. */
export class Dance2D {
  private cur: { meta: DanceMeta; t: number; ts: number } | null = null;
  private prev: { meta: DanceMeta; t: number; ts: number } | null = null;
  private fade = 1; private fadeDur = 0.45;
  current: DanceMeta | null = null;
  private readonly chIndex: Record<string, number> = {};
  private readonly scr: Float32Array;
  constructor(private readonly d: Dances2D) {
    d.index.channels.forEach((c, i) => { this.chIndex[c.name] = i; });
    this.scr = new Float32Array(d.index.perFrame);
  }

  start(meta: DanceMeta, bpm: number, fade = 0.45, startFrac?: number) {
    if (this.cur && this.cur.meta.id === meta.id) { this.cur.ts = danceTimeScale(meta, bpm); return; }
    this.prev = this.cur; this.fade = this.prev ? 0 : 1; this.fadeDur = fade;
    const t0 = (startFrac ?? Math.random() * 0.6) * Math.max(0.1, meta.duration - 4);
    this.cur = { meta, t: t0, ts: danceTimeScale(meta, bpm) }; this.current = meta;
  }
  retime(bpm: number) { if (this.cur) this.cur.ts = danceTimeScale(this.cur.meta, bpm); }

  private sample(c: { meta: DanceMeta; t: number }, out: Float32Array) {
    const { index, data } = this.d, m = c.meta, per = index.perFrame;
    const f = (c.t * index.fps) % m.frames, i0 = Math.floor(f), i1 = (i0 + 1) % m.frames, u = f - i0;
    const o0 = m.offset / 2 + i0 * per, o1 = m.offset / 2 + i1 * per;
    for (let k = 0; k < per; k++) {
      const s = index.channels[k].scale;
      let a = data[o0 + k] / s, b = data[o1 + k] / s;
      if (index.channels[k].name === 'spin' && Math.sign(a) !== Math.sign(b)) { out[k] = u < 0.5 ? a : b; continue; }   // a turn: no mid-way squash through 0
      out[k] = a + (b - a) * u;
    }
  }

  /** Advance by dt and write the mocap channels onto `into` (everything else — face, props — is the caller's). */
  step(dt: number, into: Pose) {
    if (!this.cur) return false;
    this.cur.t += dt * this.cur.ts;
    if (this.prev) { this.prev.t += dt * this.prev.ts; this.fade = Math.min(1, this.fade + dt / this.fadeDur); if (this.fade >= 1) this.prev = null; }
    const A = this.scr; this.sample(this.cur, A);
    let B: Float32Array | null = null;
    if (this.prev) { B = new Float32Array(A.length); this.sample(this.prev, B); }
    const w = this.fade * this.fade * (3 - 2 * this.fade);
    const g = (name: string) => { const k = this.chIndex[name]; if (k === undefined) return undefined; return B ? B[k] + (A[k] - B[k]) * w : A[k]; };
    const P = into as Mutable<Pose>;
    for (const n of ['x', 'y', 'rot', 'spin', 'headRot', 'headX', 'headY', 'armL', 'armR', 'legL', 'legR', 'liftL', 'liftR', 'tail', 'mane'] as const) {
      const v = g(n); if (v !== undefined) P[n] = v;
    }
    const sq = g('squash');
    if (sq !== undefined) { P.sy = 1 + sq; P.sx = 1 - sq * 0.6; }
    return true;
  }
}
void REST; void clamp;
