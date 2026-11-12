// Cut a long take into moves. Strikes are found the way Era Clash cuts its CMU takes (games/era-clash-3d/src/
// moves.ts): a limb reaching near-full extension out in front of the body, scored by how fast it got there,
// measured relative to the hips so footwork doesn't count. Pauses split the rest into segments.
import * as THREE from 'three';
import type { MotionClip, MotionMove } from './types';
import { clipFrame, fk, JOINTS } from './solve';

type Eff = NonNullable<MotionMove['effector']>;
const CHAIN: Record<Eff, [string, string, string]> = {
  rHand: ['rShldr', 'rForeArm', 'rHand'], lHand: ['lShldr', 'lForeArm', 'lHand'],
  rFoot: ['rThigh', 'rShin', 'rFoot'], lFoot: ['lThigh', 'lShin', 'lFoot'],
};
const idx = (n: string) => (JOINTS as readonly string[]).indexOf(n);

export interface StrikeOptions {
  pre?: number; post?: number; gap?: number; max?: number;
  /** Count why candidates were dropped (for tuning). */
  why?: Record<string, number>;
  /** Gates (defaults tuned on the ground-truth benchmark, labs/mocap/bench.ts). */
  handExt?: number; footExt?: number; handFwd?: number; footFwd?: number; footSide?: number; handSnap?: number; footRise?: number;
}

// Chosen by sweeping against the benchmark's true blows with zero moves allowed on run/walk takes: F1 0.55 (P 0.67,
// R 0.46) vs 0.22 for the earlier fixed gates (2026-11-11).
export const STRIKE_DEFAULTS = { handExt: 0.78, footExt: 0.75, handFwd: 0.4, footFwd: 0.15, footSide: 0.45, handSnap: 0.25, footRise: 0.35 };

/** Blows in the clip, best first, each as a move with wind-up `pre` and follow-through `post` seconds. */
export function detectStrikes(clip: MotionClip, o: StrikeOptions = {}): MotionMove[] {
  const fps = clip.fps, n = clip.frames;
  const pre = Math.round((o.pre ?? 0.35) * fps), post = Math.round((o.post ?? 0.4) * fps), gap = Math.round((o.gap ?? 0.5) * fps);
  const skel = clip.skeleton.joints;
  const effs: Eff[] = ['rHand', 'lHand', 'rFoot', 'lFoot'];
  const frames = Array.from({ length: n }, (_, f) => fk(clipFrame(clip, f).local, skel).pos);
  const len = effs.map((e) => { const [a, m, b] = CHAIN[e].map(idx); return frames[0][a].distanceTo(frames[0][m]) + frames[0][m].distanceTo(frames[0][b]); });
  type Level = 'high' | 'mid' | 'low';
  const cands: { f: number; v: number; e: Eff; level: Level }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const SNAP_HAND = Math.round(0.4 * fps), SNAP_FOOT = Math.round(0.6 * fps);
  const G = { ...STRIKE_DEFAULTS, ...o };
  const drop = (k: string) => { if (o.why) o.why[k] = (o.why[k] ?? 0) + 1; };
  // Only where the performer was really seen through the blow: noise in filled-in gaps throws "punches" too.
  const seen = (f: number) => clip.seen ? Math.min(...clip.seen.slice(Math.max(0, f - 4), f + 3)) : 1;
  for (let f = 3; f < n - 3; f++) {
    if (seen(f) < 0.5) continue;
    const P = frames[f], hip = P[idx('hip')];
    const face = P[idx('lThigh')].clone().sub(P[idx('rThigh')]).setY(0).normalize().cross(up).normalize();
    effs.forEach((e, k) => {
      const [a, , b] = CHAIN[e].map(idx);
      const ext = (q: number) => frames[q][a].distanceTo(frames[q][b]) / len[k];
      const x = ext(f);
      if (!(x >= ext(f - 1) && x >= ext(f + 1))) return;
      const hand = e.endsWith('Hand');
      // Real capture compresses depth, so a punch thrown partly toward the camera rarely reads fully straight or far in
      // front; the snap test below is what separates blows from guards and arm swing.
      if (x < (hand ? G.handExt : G.footExt)) { drop(hand ? 'hand: not straight' : 'foot: leg not straight'); return; }
      const from = hand ? P[idx('chest')] : P[a];
      const fwd = P[b].clone().sub(from).setY(0).dot(face) / len[k];
      const relNow = P[b].clone().sub(hip), relThen = frames[f - 3][b].clone().sub(frames[f - 3][idx('hip')]);
      const side = relNow.clone().setY(0).cross(up).length() / len[k];
      if (fwd < (hand ? G.handFwd : G.footFwd) && !(!hand && side > G.footSide)) { drop(hand ? 'hand: not in front' : 'foot: not in front or side'); return; }
      const lift = (P[b].y - hip.y) / len[k];
      if (!hand && lift < -0.55) { drop('foot: too low'); return; }
      // A blow is thrown: the arm straightens from a chambered (bent) position, the kicking foot rises fast off the
      // floor. Without that "snap", an extended limb is a guard, a runner's arm swing, a balancing arm or a held kick
      // (all measured on real footage: snap 0.00–0.06 for those, 0.15–0.32 for punches; kicks rise 1+ leg lengths).
      if (hand) {
        let lo = x; for (let q = Math.max(0, f - SNAP_HAND); q < f; q++) lo = Math.min(lo, ext(q));
        if (x - lo < G.handSnap) { drop('hand: no snap'); return; }
      } else {
        const liftAt = (q: number) => (frames[q][b].y - frames[q][idx('hip')].y) / len[k];
        let lo = lift; for (let q = Math.max(0, f - SNAP_FOOT); q < f; q++) lo = Math.min(lo, liftAt(q));
        if (lift - lo < G.footRise) { drop('foot: no rise'); return; }
      }
      const speed = relNow.distanceTo(relThen) / len[k];
      // Where the fist lands: between hips and shoulders is a middle punch; above the shoulders is usually a
      // rising block, near the hips a down block. Game punch slots want the middle ones.
      let level: Level = 'mid';
      if (hand) {
        const sh = P[a].y, hy = hip.y, y = P[b].y;
        level = y > sh + 0.08 ? 'high' : y < hy + (sh - hy) * 0.25 ? 'low' : 'mid';
      }
      // A foot extended around hip height or above is a kick, and it outranks the arm that swings out straight
      // for balance at the same moment (found on real kick footage: the arm won and the kick was lost).
      const highKick = !hand && lift > -0.3;
      cands.push({ f, e, level, v: x * (0.5 + fwd) * speed * (hand ? 1 : 1 + Math.max(0, lift + 0.55)) * (hand && level !== 'mid' ? 0.5 : 1) * (highKick ? 4 : 1) });
    });
  }
  // Blows that come out of a turn (kata turn 90–180° into a block or punch) make poor game strikes: a game
  // strike faces its target throughout. Measure the hips' yaw change from wind-up to contact and mark those down.
  const yaw = (f: number) => {
    const P = frames[f], d = P[idx('lThigh')].clone().sub(P[idx('rThigh')]);
    return Math.atan2(d.z, d.x);
  };
  for (const c of cands) {
    let t = Math.abs(yaw(c.f) - yaw(Math.max(0, c.f - pre)));
    if (t > Math.PI) t = 2 * Math.PI - t;
    if (t > Math.PI / 4) c.v *= 0.3;
  }
  cands.sort((p, q) => q.v - p.v);
  const out: MotionMove[] = [];
  for (const c of cands) {
    if (out.length >= (o.max ?? 24)) break;
    if (out.some((m) => Math.abs((m.hit ?? 0) - c.f) < gap)) continue;
    out.push({ name: '', start: Math.max(0, c.f - pre), end: Math.min(n - 1, c.f + post), hit: c.f, effector: c.e, score: +c.v.toFixed(4), level: c.level });
  }
  out.sort((p, q) => p.start - q.start);
  const count: Record<string, number> = {};
  for (const m of out) {
    const kind = m.effector!.endsWith('Hand') ? 'strike' : 'kick';
    const side = m.effector!.startsWith('r') ? 'right' : 'left';
    const key = `${side} ${kind}`;
    count[key] = (count[key] ?? 0) + 1;
    m.name = `${key[0].toUpperCase()}${key.slice(1)} ${count[key]}${kind === 'strike' && m.level && m.level !== 'mid' ? ` (${m.level})` : ''}`;
  }
  return out;
}

/** Seamless loop points: the pair of frames (at least `minSec` apart) whose poses and root velocity match best. */
export function findLoop(clip: MotionClip, minSec = 0.6): { start: number; end: number; error: number } | null {
  const n = clip.frames, J = clip.skeleton.joints.length, min = Math.round(minSec * clip.fps);
  if (n < min + 2) return null;
  const pose = (f: number) => clip.rot.slice(f * J * 4, (f + 1) * J * 4);
  let best: { start: number; end: number; error: number } | null = null;
  const step = Math.max(1, Math.floor(n / 240));
  for (let a = 0; a < n - min; a += step) {
    const pa = pose(a);
    for (let b = a + min; b < n; b += step) {
      const pb = pose(b);
      let err = 0;
      for (let j = 0; j < J; j++) {
        const d = Math.abs(pa[j * 4] * pb[j * 4] + pa[j * 4 + 1] * pb[j * 4 + 1] + pa[j * 4 + 2] * pb[j * 4 + 2] + pa[j * 4 + 3] * pb[j * 4 + 3]);
        err += 1 - Math.min(1, d);
      }
      if (!best || err < best.error) best = { start: a, end: b, error: err };
    }
  }
  return best;
}
