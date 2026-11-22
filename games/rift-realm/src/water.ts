// Rift Realm water — the Apex (forth-horizon/src/water.ts) water technique, ported to TSL node materials and tuned for
// the fantasy cyber-forest. Kenne (2026-11-22): "we got to get the water looking amazing… you did such a good job with
// the water in Apex, why not use similar thing but tune for the levels' aesthetics".
//
// What carries over from Apex: a procedural tileable normal map (value noise, 5 octaves, height in alpha), ripples
// advected along the current with two cross-fading phases so they visibly travel without the texture ever stretching,
// a rotated slow swell layer that breaks up the tile grid, Fresnel (Schlick) that turns grazing water into a mirror,
// foam from the ripple height where the water is fast and along the banks. Reflections and sun glints come from the
// physical material itself (scene.environment + the scene lights); a level without an environment gets a fake sky
// tint through the Fresnel term.
// What's new for the Rift: faint bioluminescent light riding the ripple crests, a slow caustic shimmer under the
// surface, and a per-level palette (cold teal pools, murky green marsh, glowing cyber river).
import * as THREE from 'three/webgpu';
import {
  abs, cameraPosition, clamp, color, length, dot, float, fract, max, min, mix, normalize, positionViewDirection, positionWorld, pow, smoothstep,
  texture, time, transformNormalToView, uv, vec2, vec3,
} from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

let normalTex: THREE.DataTexture | null = null;
/** Tileable ripple normal map (rgb = tangent-space normal, a = height), generated once and shared. */
function rippleTexture(size = 256): THREE.DataTexture {
  if (normalTex) return normalTex;
  const h = new Float32Array(size * size);
  const lat = (n: number, seed: number) => { const a = new Float32Array(n * n); let s = seed; for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; } return a; };
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (const [n, amp, seed] of [[4, 1.0, 11], [8, 0.55, 23], [16, 0.3, 37], [32, 0.16, 53], [64, 0.08, 71]] as const) {
    const L = lat(n, seed);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * n, fy = (y / size) * n;
      const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      const tx = sm(fx - Math.floor(fx)), ty = sm(fy - Math.floor(fy));
      h[y * size + x] += ((L[y0 * n + x0] * (1 - tx) + L[y0 * n + x1] * tx) * (1 - ty) + (L[y1 * n + x0] * (1 - tx) + L[y1 * n + x1] * tx) * ty) * amp;
    }
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 3.2, dy = (at(x, y + 1) - at(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    data[o + 3] = Math.round(Math.min(1, Math.max(0, at(x, y) / 2)) * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  normalTex = t;
  return t;
}

export interface RiftWaterOptions {
  /** Deep water colour (the body seen straight down). */
  deep: number;
  /** Shallow / lit colour (ripple faces, the edges). */
  shallow: number;
  /** Bioluminescent colour riding the crests (0 / omit = none). */
  glow?: number;
  /** Crest glow strength (default 0.35). */
  glowAmt?: number;
  /** 'still': ripples in world space with a slow drift (pools, lakes, marsh). 'uv': a river ribbon whose uv.y runs
   *  downstream (metres / uvMetres) and uv.x across the banks — ripples travel down it and foam lines the banks. */
  flow?: 'still' | 'uv';
  /** Current speed in m/s (river) or drift (still). */
  speed?: number;
  /** For flow 'uv': metres per uv.y unit and the ribbon's rough width in metres. */
  uvMetres?: number; width?: number;
  /** Still-water drift direction (x, z). */
  dir?: [number, number];
  /** Ripple strength (default 1). */
  chop?: number;
  /** Foam amount (default 0.6 on rivers, 0.15 still). */
  foam?: number;
  /** Sky tint reflected at grazing angles when the scene has no environment map (0 = rely on scene.environment). */
  sky?: number; skyAmt?: number;
  /** Base opacity looking straight down (rises to ~0.97 at grazing angles). */
  opacity?: number;
  lowTier?: boolean;
}

/** The Rift Realm water material (see the header). */
export function riftWater(o: RiftWaterOptions): THREE.MeshStandardNodeMaterial {
  const lo = !!o.lowTier;
  const m: THREE.MeshStandardNodeMaterial = lo
    ? new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.05, transparent: true })
    : new THREE.MeshPhysicalNodeMaterial({ metalness: 0, roughness: 0.035, ior: 1.33, specularIntensity: 1, transparent: true });
  m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
  const tex = rippleTexture();
  const speed = o.speed ?? (o.flow === 'uv' ? 1.6 : 0.25), chop = o.chop ?? 1;
  const isRiver = o.flow === 'uv';

  // surface coordinates in metres, and the current along them
  const um = o.uvMetres ?? 6, wid = o.width ?? 10;
  const q: N = isRiver ? vec2(uv().x.mul(wid), uv().y.mul(um)) : positionWorld.xz;
  const d = o.dir ?? [0.8, 0.35], dl = Math.hypot(d[0], d[1]) || 1;
  const cur: N = isRiver ? vec2(0, -speed) : vec2(d[0] / dl * speed, d[1] / dl * speed);

  // two-phase flow advection (Apex): two samples offset along the current, cross-faded so neither stretches
  const T = 2.4;
  const ph0: N = fract(time.div(T)), ph1: N = fract(time.div(T).add(0.5));
  const wgt: N = abs(ph0.mul(2).sub(1));
  const tA0: N = texture(tex, q.div(7).sub(cur.mul(ph0).mul(T / 7)));
  const tA1: N = texture(tex, q.div(7).sub(cur.mul(ph1).mul(T / 7)));
  const tB0: N = texture(tex, q.div(2.2).sub(cur.mul(1.25).mul(ph0).mul(T / 2.2)).add(vec2(0.37, 0.11)));
  const tB1: N = texture(tex, q.div(2.2).sub(cur.mul(1.25).mul(ph1).mul(T / 2.2)).add(vec2(0.37, 0.11)));
  // slow rotated swell: breaks up the tile grid on open water
  const qr: N = vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8)));
  const tC: N = texture(tex, qr.div(31).sub(cur.mul(time).mul(0.42 / 31)).add(vec2(0.19, 0.63)));
  const nA: N = mix(tA0.xyz, tA1.xyz, wgt).mul(2).sub(1);
  const nB: N = mix(tB0.xyz, tB1.xyz, wgt).mul(2).sub(1);
  const nC: N = tC.xyz.mul(2).sub(1);
  const choppy = (0.5 + speed * 0.16) * chop;
  // fine ripples fade with distance (Apex near/mid fade) so far water doesn't sparkle into noise; the swell stays
  const dist: N = length(cameraPosition.sub(positionWorld));
  const nearFade: N = float(1).sub(smoothstep(25, 140, dist).mul(0.75)), midFade: N = float(1).sub(smoothstep(120, 600, dist).mul(0.6));
  const slope: N = nA.xy.mul(0.65).add(nB.xy.mul(0.5)).mul(nearFade).add(nC.xy.mul(0.7).mul(midFade)).mul(choppy);
  const nW: N = normalize(vec3(slope.x, float(1), slope.y));
  const nV: N = transformNormalToView(nW);
  m.normalNode = nV;

  // Fresnel (Schlick) from the rippled normal
  const ndv: N = clamp(dot(nV, positionViewDirection), 0, 1);
  const omN: N = float(1).sub(ndv);
  const F: N = float(0.02).add(pow(omN, 5).mul(0.98));

  // body colour: deep straight down, lit shallow on ripple faces and the swell's crests
  const hh: N = mix(tA0.w, tA1.w, wgt).mul(tC.w.mul(0.85).add(0.35));
  // ripple faces tilted toward the viewer catch more light: slope magnitude brightens the body, crests lift it
  const tilt: N = clamp(slope.x.mul(slope.x).add(slope.y.mul(slope.y)).mul(6), 0, 1);
  let body: N = mix(color(o.deep), color(o.shallow), smoothstep(0.35, 0.95, hh).mul(0.5).add(tilt.mul(0.35)).add(omN.mul(0.2)));

  // foam: banks of a river, the fast crests, a little on still water's highest ripples
  const foamAmt = o.foam ?? (isRiver ? 0.6 : 0.15);
  let foam: N = smoothstep(0.66, 0.9, hh).mul(isRiver ? THREE.MathUtils.smoothstep(speed, 0.8, 2.2) * 0.7 : 0.35);
  if (isRiver) {
    const edge: N = min(uv().x, float(1).sub(uv().x));
    foam = foam.add(smoothstep(0.07, 0.0, edge).mul(smoothstep(0.45, 0.8, hh.add(0.1))).mul(0.8));
  }
  foam = clamp(foam.mul(foamAmt), 0, 1);
  body = mix(body, color(0xdfeef2), foam.mul(0.8));
  m.colorNode = body;
  m.roughnessNode = mix(float(lo ? 0.05 : 0.035), float(0.55), foam);

  // emissive: fake sky at grazing angles (levels without an environment), bioluminescent crests, caustic shimmer
  let em: N = vec3(0, 0, 0);
  if (o.sky !== undefined) em = em.add(color(o.sky).mul(F.mul(o.skyAmt ?? 0.6)));
  if (o.glow !== undefined) {
    const glowAmt = o.glowAmt ?? 0.35;
    const crest: N = smoothstep(0.55, 0.82, hh).mul(tilt.mul(0.6).add(0.4));
    // caustics: two height samples drifting against each other, their product sharpened into thin bright webs
    const c1: N = texture(tex, q.div(3.1).add(vec2(time.mul(0.05), time.mul(0.031)))).w;
    const c2: N = texture(tex, q.div(2.3).sub(vec2(time.mul(0.037), time.mul(-0.043))).add(0.5)).w;
    const caustic: N = smoothstep(0.42, 0.62, float(1).sub(abs(c1.sub(c2)).mul(3.2))).mul(ndv);
    em = em.add(color(o.glow).mul(crest.mul(glowAmt).add(caustic.mul(glowAmt * 0.45)).add(glowAmt * 0.04)));
  }
  m.emissiveNode = em;

  // opacity: see into it looking down, a mirror at grazing angles; foam is opaque
  const op = o.opacity ?? 0.72;
  m.opacityNode = clamp(float(op).add(F.mul(0.6)).add(foam.mul(0.4)), 0, 0.97);
  return m;
}

/** A waterfall sheet: fast streaks falling down the sheet's uv.y (1 = top), white water at the foot, see-through
 *  at the sides. Unlit (the falling water is mostly spray and light). */
export function riftWaterfall(o: { tint: number; white?: number; speed?: number; opacity?: number }): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const tex = rippleTexture();
  const sp = o.speed ?? 1.6;
  const s1: N = texture(tex, vec2(uv().x.mul(2.5), uv().y.mul(0.6).add(time.mul(sp * 0.55)))).w;
  const s2: N = texture(tex, vec2(uv().x.mul(5.3).add(0.31), uv().y.mul(1.1).add(time.mul(sp * 0.9)))).w;
  const streak: N = smoothstep(0.5, 0.85, s1.mul(0.6).add(s2.mul(0.6)));
  const foot: N = smoothstep(0.25, 0.0, uv().y);
  m.colorNode = mix(color(o.tint), color(o.white ?? 0xf0fcff), max(streak, foot.mul(0.8)));
  const sides: N = smoothstep(0.0, 0.14, uv().x).mul(smoothstep(1.0, 0.86, uv().x));
  m.opacityNode = sides.mul(float(o.opacity ?? 0.7).mul(streak.mul(0.45).add(0.55)).add(foot.mul(0.2)));
  return m;
}
