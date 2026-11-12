// Chapter I's ground and sea, built on CC0 Poly Haven surfaces (scripts/eraclash3d/fetchGround.mjs):
// a meadow floor, a worn dirt road with gravel edges, beach sand going wet and foaming at the waterline,
// and seaside cliff rock wherever the ground turns steep (the valley walls). Layers blend per vertex by area
// ("splat": grass, dirt, gravel, sand) and by slope (cliff); a low-frequency pass breaks up tiling.
// The sea is dark and glassy with layered moving ripples, so it mirrors the photographed sky.
import * as THREE from 'three/webgpu';
import {
  texture, positionWorld, normalWorld, vec2, vec3, mix, smoothstep, attribute, time, sin, abs, float, normalMap, color, max,
} from 'three/tsl';
import { pbr } from './core/materials';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface Splat { grass: number; dirt: number; gravel: number; sand: number }

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
  m.colorNode = col;
  // normals from the three dominant reliefs (meadow, road, cliff): 3 fetches instead of 5 on the iGPU
  const nBlend: N = mix(mix(texture(G.nor, uvG).rgb, texture(D.nor, uvD).rgb, w.y.add(w.z)), texture(C.nor, uvC).rgb, cliff);
  m.normalNode = normalMap(nBlend);
  const rough: N = mix(texture(G.ard, uvG).g.mul(w.x.add(w.z).add(w.w)).add(texture(D.ard, uvD).g.mul(w.y)), float(0.85), cliff);
  m.roughnessNode = mix(rough, float(0.28), wet);
  m.metalnessNode = float(0);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

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

/** The sea: deep, glassy, with two ripple layers drifting across each other; mirrors the HDRI sky. */
export function buildSea() {
  const rip = rippleNormals();
  const m = new THREE.MeshStandardNodeMaterial({ transparent: false });
  const p: N = positionWorld.xz;
  const a: N = texture(rip, p.mul(1 / 9).add(vec2(time.mul(0.018), time.mul(0.011)))).rgb;
  const b: N = texture(rip, p.mul(1 / 23).add(vec2(time.mul(-0.009), time.mul(0.014)))).rgb;
  m.normalNode = normalMap(mix(a, b, 0.5));
  // deep water darker with distance from shore (−Z), lighter in the shallows
  const shallow: N = smoothstep(-540, -470, positionWorld.z);
  m.colorNode = mix(color(0x06141e), color(0x17414a), shallow);
  m.roughnessNode = float(0.06);
  m.metalnessNode = float(0);
  // big enough that its edge sits in the haze, never against the photo's own ground
  const sea = new THREE.Mesh(new THREE.CircleGeometry(6000, 64).rotateX(-Math.PI / 2), m);
  sea.position.set(0, 0.02, -470);   // the coast is 400 m south of the wall (river.ts COAST_DZ)
  sea.scale.set(1, 1, 1);
  void max;
  return sea;
}
