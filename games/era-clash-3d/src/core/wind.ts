// One wind for the whole world: a direction that veers a little, a strength, and gusts. On the GPU the gusts roll
// downwind across the land as travelling bands, so a field of grass, a stand of trees and the noren down a street
// all lean together as a gust passes, then spring back. updateWind() (main.ts, once a frame) moves the gusts.
//
// Users: grassField.ts (blades bend downwind), forest.ts (trees bow, leaves flutter), village.ts / otsu.ts /
// chapter1.ts (noren, banners and nets hang and stream; sails belly out; awnings ripple).
import * as THREE from 'three/webgpu';
import { uniform, sin, cos, time, dot, vec2, vec3, float, positionLocal, uv } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Downwind (x, z), unit length; strength 0…1 (a sea breeze ≈ 0.55); gust 0…1 (moved on the CPU). */
export const wind = {
  dir: uniform(new THREE.Vector2(0.62, 0.78).normalize()),
  strength: uniform(0.6),
  gust: uniform(0.5),
};

let t = 0;
/** Advance the gusts and let the wind veer (call once a frame). */
export function updateWind(dt: number) {
  t += dt;
  // gusts: a few slow incommensurate swells, sharpened so lulls are long and gusts come in bursts
  const g = 0.5 + 0.28 * Math.sin(t * 0.21) + 0.16 * Math.sin(t * 0.53 + 1.3) + 0.1 * Math.sin(t * 1.37 + 0.4);
  wind.gust.value = Math.max(0, Math.min(1, g * g * 1.3));
  const a = 0.9 + 0.22 * Math.sin(t * 0.031) + 0.08 * Math.sin(t * 0.11);
  wind.dir.value.set(Math.sin(a), Math.cos(a));
}

/** The wind's push at world (x, z), 0…~1.2: gust bands travelling downwind, with a cross-wave to break them up. */
export function windAt(xz: N): N {
  const d: N = wind.dir, along: N = dot(xz, d), across: N = dot(xz, vec2(d.y.negate(), d.x));
  const band: N = sin(along.mul(0.075).sub(time.mul(1.5))).mul(0.5).add(0.5);
  const ripple: N = sin(along.mul(0.21).add(across.mul(0.06)).sub(time.mul(2.6))).mul(0.5).add(0.5);
  const lift: N = float(0.45).add(wind.gust.mul(0.9));
  return wind.strength.mul(float(0.3).add(band.mul(band).mul(0.55)).add(ripple.mul(0.25))).mul(lift);
}

/** The wind's direction in an instance's own frame (the instance turned by `yaw` about y). */
export function localWindDir(yaw: N): N {
  const c: N = cos(yaw), s: N = sin(yaw), d: N = wind.dir;
  return vec2(d.x.mul(c).sub(d.y.mul(s)), d.x.mul(s).add(d.y.mul(c)));
}

/**
 * Hanging cloth in world-space geometry (merged at the identity): noren, banners, nets. `uv.y` is 1 along the
 * top (where it hangs from) and 0 at the hem: the hem streams downwind and flutters, the top stays put.
 * `k` is how far the hem travels in a full gust (metres per metre of drop, roughly).
 */
export function hangingCloth(k = 0.5): N {
  const p: N = positionLocal, hang: N = float(1).sub(uv().y).clamp(0, 1);
  const w: N = windAt(p.xz);
  const flutter: N = sin(time.mul(7.3).add(p.x.mul(2.9)).add(p.z.mul(2.3)).add(hang.mul(4))).mul(0.06).mul(w);
  const push: N = w.mul(k).add(flutter).mul(hang.mul(hang));
  const d: N = wind.dir;
  // streaming out downwind lifts the hem a little (the cloth keeps its length)
  return p.add(vec3(d.x.mul(push), push.mul(push).mul(0.35).add(hang.mul(sin(time.mul(5.1).add(p.x)).mul(0.012).mul(w))), d.y.mul(push)));
}

/** A sail or awning held at its edges: it bellies downwind in the middle (uv 0…1 both ways). */
export function bellyCloth(k = 0.45): N {
  const p: N = positionLocal, u: N = uv();
  const belly: N = sin(u.x.clamp(0, 1).mul(Math.PI)).mul(sin(u.y.clamp(0, 1).mul(Math.PI)));
  const w: N = windAt(p.xz);
  const shiver: N = sin(time.mul(9).add(p.x.mul(3.1)).add(p.y.mul(2.2))).mul(0.03);
  const push: N = w.mul(k).add(shiver.mul(w)).mul(belly);
  const d: N = wind.dir;
  return p.add(vec3(d.x.mul(push), float(0), d.y.mul(push)));
}

/** A stretched awning (a thin box): a small travelling ripple, up and down. */
export function awningRipple(k = 0.05): N {
  const p: N = positionLocal, w: N = windAt(p.xz);
  const r: N = sin(time.mul(6.2).add(p.x.mul(1.7)).add(p.z.mul(1.3))).mul(k).mul(w);
  return p.add(vec3(0, r, 0));
}

