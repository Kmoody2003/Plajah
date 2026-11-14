// Chapter I's ground and sea, built on CC0 Poly Haven surfaces (scripts/eraclash3d/fetchGround.mjs):
// a meadow floor, a worn dirt road with gravel edges, beach sand going wet and foaming at the waterline,
// and seaside cliff rock wherever the ground turns steep (the valley walls). Layers blend per vertex by area
// ("splat": grass, dirt, gravel, sand) and by slope (cliff); a low-frequency pass breaks up tiling.
// The sea is dark and glassy with layered moving ripples, so it mirrors the photographed sky.
import * as THREE from 'three/webgpu';
import {
  texture, positionWorld, normalWorld, vec2, vec3, mix, smoothstep, attribute, time, sin, cos, pow, dot, normalize, cameraPosition, abs, float, normalMap, color, max, exp, sign, uniform,
} from 'three/tsl';
import { pbr, setReflect } from './core/materials';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface Splat { grass: number; dirt: number; gravel: number; sand: number }

/**
 * The ground under the weather (sky.ts drives these): `wet` 0…1 — rain darkens the earth, turns the dirt road to
 * mud and fills its ruts, potholes and low spots with puddles (rippled while it rains, `rain`); `snow` 0…1 — snow
 * settles on the flat first; `autumn` 0…1 — the meadow goes straw and russet.
 */
export const groundWeather = { wet: uniform(0), rain: uniform(0), snow: uniform(0), autumn: uniform(0) };

/** The road's centre line (chapter1.ts roadX) and the stretch that's country dirt road (harbour → Outer Wall). */
const ROAD = { z0: -462, z1: -37 };
/**
 * Where water stands on the dirt road when it rains (0…1): the wheel ruts and a scatter of shallow hollows. The
 * same sums run on the GPU (puddle shading) and the CPU (puddleAt: splashes underfoot), so they agree.
 */
export function puddleAt(x: number, z: number, wet: number) {
  if (wet < 0.25 || z < ROAD.z0 || z > ROAD.z1) return 0;
  const r = x - Math.sin(z * 0.028) * 7, ar = Math.abs(r);
  if (ar > 3) return 0;
  const rut = Math.exp(-(((ar - 0.85) / 0.3) ** 2));
  const hol = Math.sin(x * 1.37 + Math.sin(z * 0.29) * 2.1) * Math.sin(z * 1.03 + Math.sin(x * 0.37) * 1.7);
  const lvl = (wet - 0.25) / 0.75;
  const patch = Math.min(1, Math.max(0, (Math.sin(z * 0.9 + Math.sin(z * 0.23) * 3) - 0.35) / 0.5));
  const m = Math.max(rut * patch * 0.95, hol) - (1 - lvl) * 0.9;
  return Math.min(1, Math.max(0, (m - 0.8) / 0.08));
}

/** The terrain: a heightfield mesh painted by `splatAt`, with collision-ready geometry. */
export function buildTerrain(opts: { xMin: number; xMax: number; zMin: number; zMax: number; segX: number; segZ: number; heightAt: (x: number, z: number) => number; splatAt: (x: number, z: number) => Splat }) {
  const { xMin, xMax, zMin, zMax, segX, segZ, heightAt, splatAt } = opts;
  const g = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin, segX, segZ);
  g.translate((xMin + xMax) / 2, 0, 0);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sp = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i) + (zMin + zMax) / 2;
    pos.setZ(i, z);
    pos.setY(i, heightAt(x, z));
    const s = splatAt(x, z), t = s.grass + s.dirt + s.gravel + s.sand || 1;
    sp.set([s.grass / t, s.dirt / t, s.gravel / t, s.sand / t], i * 4);
  }
  g.setAttribute('splat', new THREE.BufferAttribute(sp, 4));
  g.computeVertexNormals();

  const G = pbr('forrest_ground_01'), D = pbr('brown_mud_02'), V = pbr('rocks_ground_05'), S = pbr('coast_sand_01'), C = pbr('coast_sand_rocks_02');
  const m = new THREE.MeshStandardNodeMaterial();
  const w: N = attribute('splat', 'vec4');
  const uvG = positionWorld.xz.mul(1 / 3.2), uvD = positionWorld.xz.mul(1 / 2.6), uvV = positionWorld.xz.mul(1 / 1.8), uvS = positionWorld.xz.mul(1 / 3.0);
  // cliffs: projected along the walls (they run up the valley, facing ±X), and on the hill (facing −Z)
  const uvC: N = mix(vec2(positionWorld.z, positionWorld.y), vec2(positionWorld.x, positionWorld.y), smoothstep(0.4, 0.7, abs(normalWorld.z))).mul(1 / 5);
  const cliff: N = smoothstep(0.84, 0.66, normalWorld.y);
  const base: N = texture(G.diff, uvG).rgb.mul(vec3(0.78, 1.0, 0.62)).mul(w.x)   // the meadow floor, greened under the blades
    .add(texture(D.diff, uvD).rgb.mul(w.y))
    .add(texture(V.diff, uvV).rgb.mul(w.z))
    .add(texture(S.diff, uvS).rgb.mul(w.w));
  // low-frequency variation so the meadow doesn't read as tiles
  const macro: N = texture(G.diff, positionWorld.xz.mul(1 / 61)).rgb.dot(vec3(0.33, 0.33, 0.33)).mul(0.7).add(0.65);
  let col: N = mix(base.mul(macro), texture(C.diff, uvC).rgb, cliff);
  // the waterline: sand darkens where the sea has been, and a foam line runs up and back
  const h: N = positionWorld.y;
  const wet: N = smoothstep(0.9, 0.05, h).mul(w.w);
  col = mix(col, col.mul(0.55), wet);
  const surge: N = sin(time.mul(0.55)).mul(0.14).add(0.06);
  const foam: N = smoothstep(0.16, 0.0, abs(h.sub(surge))).mul(w.w).mul(0.85);
  col = mix(col, vec3(0.9, 0.9, 0.86), foam);
  // ── the country road: wheel ruts and the crown between them, finer than the terrain grid ──
  const pw: N = positionWorld;
  const onRoadZ: N = smoothstep(ROAD.z0, ROAD.z0 + 4, pw.z).mul(smoothstep(ROAD.z1, ROAD.z1 - 4, pw.z));
  const rr: N = pw.x.sub(sin(pw.z.mul(0.028)).mul(7)), ar: N = abs(rr);
  const rutK: N = exp(ar.sub(0.85).div(0.26).pow(2).negate()).mul(onRoadZ).mul(w.y);
  // slope of the rut profile across the road (−0.05 m deep): tilts the normal into and out of each track
  const rutSlope: N = rutK.mul(ar.sub(0.85).div(0.26 * 0.26)).mul(0.1).mul(sign(rr));
  col = col.mul(float(1).sub(rutK.mul(0.12)));   // packed and darker in the tracks
  // ── autumn: the meadow to straw and russet ──
  const gw: N = groundWeather;
  const straw: N = vec3(0.62, 0.5, 0.3).mul(dotLum(col).mul(1.6).add(0.2));
  col = mix(col, straw, gw.autumn.mul(w.x).mul(0.75));
  // ── rain: the earth darkens, the dirt goes to mud, water stands in the ruts and hollows ──
  const wg: N = gw.wet;
  col = col.mul(float(1).sub(wg.mul(0.32)));
  const mud: N = w.y.mul(onRoadZ.mul(0.6).add(0.4)).mul(smoothstep(0.3, 0.8, wg));
  col = mix(col, col.mul(vec3(0.78, 0.66, 0.52)), mud);
  const hol: N = sin(pw.x.mul(1.37).add(sin(pw.z.mul(0.29)).mul(2.1))).mul(sin(pw.z.mul(1.03).add(sin(pw.x.mul(0.37)).mul(1.7))));
  const lvl: N = wg.sub(0.25).div(0.75).clamp(0, 1);
  const rutP: N = exp(ar.sub(0.85).div(0.3).pow(2).negate()).mul(smoothstep(0.35, 0.85, sin(pw.z.mul(0.9).add(sin(pw.z.mul(0.23)).mul(3)))));
  const pud: N = smoothstep(0.8, 0.88, max(rutP.mul(0.95), hol).sub(float(1).sub(lvl).mul(0.9))).mul(onRoadZ).mul(smoothstep(3, 2.6, ar)).mul(smoothstep(0.2, 0.3, wg));
  col = mix(col, vec3(0.1, 0.085, 0.07), pud.mul(0.85));   // muddy water: dark, the sky does the rest
  // ── snow: settles on the flat first, thinner on the trodden road ──
  const snowK: N = gw.snow.mul(smoothstep(0.62, 0.9, normalWorld.y)).mul(float(1).sub(w.y.mul(onRoadZ).mul(0.45))).mul(float(1).sub(w.w.mul(0.8)));
  col = mix(col, vec3(0.86, 0.88, 0.92), snowK.clamp(0, 1));
  m.colorNode = col;
  // normals from the three dominant reliefs (meadow, road, cliff): 3 fetches instead of 5 on the iGPU
  const nBlend: N = mix(mix(texture(G.nor, uvG).rgb, texture(D.nor, uvD).rgb, w.y.add(w.z)), texture(C.nor, uvC).rgb, cliff);
  // the ruts tilt it; puddles go flat (and ripple while it rains); snow smooths it
  const ripple: N = texture(RIPPLES, pw.xz.mul(0.7).add(vec2(time.mul(0.05), time.mul(-0.03)))).rgb;
  const nRoad: N = vec3(nBlend.x.add(rutSlope.negate()), nBlend.y, nBlend.z);
  const nWet: N = mix(nRoad, mix(vec3(0.5, 0.5, 1), ripple, gw.rain.mul(0.6)), pud);
  m.normalNode = normalMap(mix(nWet, vec3(0.5, 0.5, 1), snowK.mul(0.7)));
  const rough: N = mix(texture(G.ard, uvG).g.mul(w.x.add(w.z).add(w.w)).add(texture(D.ard, uvD).g.mul(w.y)), float(0.85), cliff);
  // the sea-wet sand as before; rain takes the rest of the ground toward damp
  const rWet: N = mix(rough.mul(float(1).sub(gw.wet.mul(0.22))), float(0.28), wet);
  m.roughnessNode = mix(mix(mix(rWet, float(0.38), mud.mul(gw.wet)), float(0.06), pud), float(0.58), snowK);
  m.metalnessNode = float(0);
  // Wet road puddles and coastal wet sand participate cleanly in SSR when SSR is active.
  setReflect(m, max(pud.mul(0.92), wet.mul(0.28)), m.roughnessNode);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dotLum = (c: any) => c.dot(vec3(0.2126, 0.7152, 0.0722));
let _ripples: THREE.DataTexture | null = null;
/** One shared ripple normal map (rain on the puddles, the sea). */
const RIPPLES = (() => { _ripples = _ripples ?? rippleNormals(); return _ripples; })();

/** A tileable ripple normal map, built once from integer-frequency sine waves (no seam). */
function rippleNormals(size = 256) {
  const waves = Array.from({ length: 9 }, (_, i) => ({ kx: ((i * 7) % 5) + 1 + (i % 3), ky: ((i * 3) % 4) + 1, a: 1 / (1 + i * 0.6), p: i * 1.37 }));
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin(2 * Math.PI * (w.kx * x + w.ky * y) / size + w.p) + w.a * 0.5 * Math.sin(2 * Math.PI * (w.ky * x - w.kx * y) / size + w.p * 2);
    hgt[y * size + x] = v;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.6, dy = (at(x, y + 1) - at(x, y - 1)) * 0.6;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** The sea: deep, glassy, with multi-octave ripples, coastal caustics, surf foam and SSR mirror sheen. */
export function buildSea() {
  const rip = rippleNormals();
  const m = new THREE.MeshStandardNodeMaterial({ transparent: false });
  const p: N = positionWorld.xz;
  const a: N = texture(rip, p.mul(1 / 9).add(vec2(time.mul(0.018), time.mul(0.011)))).rgb;
  const b: N = texture(rip, p.mul(1 / 23).add(vec2(time.mul(-0.009), time.mul(0.014)))).rgb;
  const c: N = texture(rip, p.mul(1 / 4.2).add(vec2(time.mul(0.025), time.mul(-0.019)))).rgb;
  const nMix: N = mix(mix(a, b, 0.5), c, 0.28);
  m.normalNode = normalMap(nMix);
  const view: N = normalize(cameraPosition.sub(positionWorld));
  const fres: N = pow(float(1).sub(max(dot(view, normalWorld), 0)), 4.5);
  // Deep sapphire abyss blending into translucent jade shallows + subtle sunlit caustic interference + surf foam.
  const shallow: N = smoothstep(-545, -468, positionWorld.z);
  const causticWave: N = sin(p.x.mul(1.6).add(time.mul(1.9))).mul(cos(p.y.mul(1.8).sub(time.mul(1.5)))).mul(0.5).add(0.5);
  const caustics: N = pow(causticWave, 3).mul(shallow).mul(0.22);
  const surfLine: N = smoothstep(-479, -467, positionWorld.z).mul(smoothstep(0.35, 0.9, sin(positionWorld.z.mul(0.42).sub(time.mul(1.15))).mul(0.5).add(0.5))).mul(0.32);
  const baseWater: N = mix(color(0x05131f), color(0x1b525c), shallow);
  const litWater: N = mix(baseWater.add(vec3(0.16, 0.34, 0.32).mul(caustics)), vec3(0.84, 0.89, 0.9), surfLine);
  m.colorNode = mix(litWater, litWater.mul(0.42), fres.mul(0.55));
  m.roughnessNode = mix(float(0.035), float(0.16), surfLine);
  m.metalnessNode = float(0);
  setReflect(m, mix(float(0.96), float(0.2), surfLine), m.roughnessNode);
  // big enough that its edge sits in the haze, never against the photo's own ground
  const sea = new THREE.Mesh(new THREE.CircleGeometry(6000, 64).rotateX(-Math.PI / 2), m);
  sea.position.set(0, 0.02, -470);   // the coast is 400 m south of the wall (river.ts COAST_DZ)
  sea.scale.set(1, 1, 1);
  void max;
  return sea;
}
