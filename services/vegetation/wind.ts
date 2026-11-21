// Plajah Vegetation — one wind for a world (docs/plajah-vegetation.md §2.2).
//
// From Era Clash's core/wind.ts (the best of the copies): a direction that veers a little, a strength, gusts that roll
// downwind across the land as travelling bands, so grass, shrubs and trees lean together as a gust passes. Added for the
// platform: local IMPULSES — a dash, a blast, a Soul Surge, a vehicle — that push vegetation away from a point and
// spring back. updateWind(dt) once a frame; addImpulse() when something happens.
import * as THREE from 'three/webgpu';
import { cos, dot, float, length, max, positionLocal, sin, smoothstep, time, uniform, uniformArray, uv, vec2, vec3 } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export const MAX_IMPULSES = 8;

export const wind = {
  /** Downwind (x, z), unit length. */
  dir: uniform(new THREE.Vector2(0.62, 0.78).normalize()),
  /** 0…1 (a sea breeze ≈ 0.55). */
  strength: uniform(0.55),
  /** 0…1, moved on the CPU. */
  gust: uniform(0.5),
  /** Impulses: (x, z, radius, push) — push decays to 0 on the CPU. */
  impulses: uniformArray(Array.from({ length: MAX_IMPULSES }, () => new THREE.Vector4(0, 0, 1, 0)), 'vec4'),
};

const live: { x: number; z: number; r: number; push: number; decay: number }[] = [];
let t = 0;

/** Something pushed the air at (x, z): radius in metres, push 0…1+ (a footstep 0.2, a dash 0.6, a blast 1.5). */
export function addImpulse(x: number, z: number, radius: number, push: number, decay = 2.5) {
  live.push({ x, z, r: radius, push, decay });
  if (live.length > MAX_IMPULSES) live.sort((a, b) => b.push - a.push).length = MAX_IMPULSES;
}

/** Advance gusts, veer, and decay impulses (once a frame). `strength` optionally sets the weather's wind. */
export function updateWind(dt: number, strength?: number) {
  t += dt;
  const g = 0.5 + 0.28 * Math.sin(t * 0.21) + 0.16 * Math.sin(t * 0.53 + 1.3) + 0.1 * Math.sin(t * 1.37 + 0.4);
  wind.gust.value = Math.max(0, Math.min(1, g * g * 1.3));
  const a = 0.9 + 0.22 * Math.sin(t * 0.031) + 0.08 * Math.sin(t * 0.11);
  (wind.dir.value as THREE.Vector2).set(Math.sin(a), Math.cos(a));
  if (strength !== undefined) wind.strength.value = strength;
  for (let i = live.length - 1; i >= 0; i--) { live[i].push -= live[i].push * Math.min(1, dt * live[i].decay); if (live[i].push < 0.01) live.splice(i, 1); }
  const arr = wind.impulses.array as THREE.Vector4[];
  for (let i = 0; i < MAX_IMPULSES; i++) {
    const p = live[i];
    arr[i].set(p ? p.x : 0, p ? p.z : 0, p ? p.r : 1, p ? p.push : 0);
  }
}

/** The wind's push at world (x, z), 0…~1.2: gust bands travelling downwind, with a cross-wave to break them up. */
export function windAt(xz: N): N {
  const d: N = wind.dir, along: N = dot(xz, d), across: N = dot(xz, vec2(d.y.negate(), d.x));
  const band: N = sin(along.mul(0.075).sub(time.mul(1.5))).mul(0.5).add(0.5);
  const ripple: N = sin(along.mul(0.21).add(across.mul(0.06)).sub(time.mul(2.6))).mul(0.5).add(0.5);
  const lift: N = float(0.45).add(wind.gust.mul(0.9));
  return wind.strength.mul(float(0.3).add(band.mul(band).mul(0.55)).add(ripple.mul(0.25))).mul(lift);
}

/** The impulses' push at world (x, z): a vec2 pointing away from each source, fading over its radius. */
export function impulseAt(xz: N): N {
  let acc: N = vec2(0, 0);
  for (let i = 0; i < MAX_IMPULSES; i++) {
    const im: N = wind.impulses.element(i);
    const off: N = xz.sub(im.xy), d: N = max(length(off), float(0.001));
    const fall: N = smoothstep(im.z, float(0), d).mul(im.w);
    acc = acc.add(off.div(d).mul(fall));
  }
  return acc;
}

/** The total horizontal push (wind + impulses) at world (x, z), as a world-space vec2. */
export function pushAt(xz: N): N {
  return wind.dir.mul(windAt(xz)).add(impulseAt(xz));
}

/** A world-space vec2 rotated into an instance's frame (the instance turned by `yaw` about y). */
export function toLocal(v: N, yaw: N): N {
  const c: N = cos(yaw), s: N = sin(yaw);
  return vec2(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)));
}

/** A local displacement (vec3) from a horizontal push: lean in the push's direction, dipping a little as it bends. */
export function bendOffset(pushLocal: N, amount: N): N {
  const p: N = pushLocal.mul(amount);
  return vec3(p.x, dot(p, p).mul(-0.35), p.y);
}

// ── cloth in the same wind (from Era Clash: noren, banners, nets, sails, awnings) ──────────────────────────────

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

