// Plajah Vegetation — one wind for a world (docs/plajah-vegetation.md §2.2).
//
// From Era Clash's core/wind.ts (the best of the copies): a direction that veers a little, a strength, gusts that roll
// downwind across the land as travelling bands, so grass, shrubs and trees lean together as a gust passes. Added for the
// platform: local IMPULSES — a dash, a blast, a Soul Surge, a vehicle — that push vegetation away from a point and
// spring back. updateWind(dt) once a frame; addImpulse() when something happens.
import * as THREE from 'three/webgpu';
import { cos, dot, float, length, max, sin, smoothstep, time, uniform, uniformArray, vec2, vec3 } from 'three/tsl';

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
