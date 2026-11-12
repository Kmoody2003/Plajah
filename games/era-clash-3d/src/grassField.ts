// Real grass: tapered, curved blades around the player (not cards), swaying in the wind.
// 5×5 tiles of 10 m follow the camera; crossing a tile boundary recycles only the trailing row to the front.
// Blades are placed from the world cell's own seed, so the field is fixed in the world and never shimmers.
// Clumped placement, no grass on roads, sand, cliffs or under buildings (grassAt).
import * as THREE from 'three/webgpu';
import { uv, mix, color, time, sin, positionLocal, vec3, attribute, float } from 'three/tsl';
import { windAt, localWindDir } from './core/wind';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const TILE = 10, R = 2;  // 5 × 5 tiles → 50 m square around the player

function bladeGeometry() {
  // a blade: 4 segments narrowing to a point, slightly curved forward; base at y = 0, height 1
  const segs = 4, w = 0.05;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, hw = w * (1 - t) * (1 - t * 0.15), z = t * t * 0.18;
    if (i < segs) { pos.push(-hw, t, z, hw, t, z); uvs.push(0, t, 1, t); }
    else { pos.push(0, 1, z); uvs.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const last = (segs - 1) * 2; idx.push(last, last + 1, last + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function hash(x: number, z: number) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export interface GrassField { group: THREE.Group; update(camera: THREE.Vector3): void; blades: number }

export function buildGrassField(heightAt: (x: number, z: number) => number, grassAt: (x: number, z: number) => number, perTile = 1600): GrassField {
  const group = new THREE.Group(); group.name = 'grassField';
  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const phase: N = attribute('aPhase', 'float');
  const tint: N = attribute('aTint', 'float');
  const t: N = uv().y;
  // base dark and cool, tips warm and dry; each blade a little different
  mat.colorNode = mix(color(0x1c3414), mix(color(0x6f9a3c), color(0x9fae4e), tint), t.mul(t).mul(0.9));
  // wind (core/wind.ts): every blade bends downwind as the gust bands roll over the field, plus its own quick
  // flutter; the tip goes furthest (and dips a little as it bends)
  const aw: N = attribute('aWind', 'vec3');
  const ld: N = localWindDir(aw.z), push: N = windAt(aw.xy);
  const sway: N = sin(time.mul(2.1).add(phase)).mul(0.55).add(sin(time.mul(5.3).add(phase.mul(2.3))).mul(0.3));
  const bend: N = push.mul(0.42).add(sway.mul(0.05).mul(push.add(0.3)));
  mat.positionNode = positionLocal.add(vec3(ld.x.mul(bend), bend.mul(bend).mul(-0.6), ld.y.mul(bend)).mul(t.mul(t)));
  mat.roughnessNode = float(0.85);
  mat.metalnessNode = float(0);

  type Tile = { mesh: THREE.InstancedMesh; cx: number; cz: number };
  const tiles: Tile[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function fill(tile: Tile) {
    const mesh = tile.mesh, ph = mesh.geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute, ti = mesh.geometry.getAttribute('aTint') as THREE.InstancedBufferAttribute;
    const wa = mesh.geometry.getAttribute('aWind') as THREE.InstancedBufferAttribute;
    let n = 0;
    const x0 = tile.cx * TILE, z0 = tile.cz * TILE;
    const clumps = Math.round(perTile / 6);
    for (let c = 0; c < clumps && n < perTile; c++) {
      const r1 = hash(tile.cx * 131 + c, tile.cz * 977 + c * 7);
      const cxw = x0 + hash(tile.cx * 17 + c * 3, tile.cz * 29 + c) * TILE, czw = z0 + r1 * TILE;
      const dens = grassAt(cxw, czw);
      if (dens <= 0.02) continue;
      const k = Math.round(6 + 7 * dens);
      for (let b = 0; b < k && n < perTile; b++) {
        const a = hash(c * 13 + b, tile.cx * 7 + tile.cz * 11 + b) * Math.PI * 2, rr = Math.sqrt(hash(b * 5 + c, c * 19 + tile.cz)) * 0.45;
        const x = cxw + Math.cos(a) * rr, z = czw + Math.sin(a) * rr;
        if (grassAt(x, z) <= 0.05) continue;
        p.set(x, heightAt(x, z) - 0.02, z);
        const yaw = hash(x * 7.1 | 0, z * 9.3 | 0) * Math.PI * 2;
        q.setFromAxisAngle(up, yaw);
        const hgt = (0.42 + 0.5 * hash(b + 3, c + 5)) * (0.6 + 0.4 * dens);
        s.set(1, hgt, 1);
        m4.compose(p, q, s); mesh.setMatrixAt(n, m4);
        ph.setX(n, x * 0.35 + z * 0.22); ti.setX(n, hash(c, b)); wa.setXYZ(n, x, z, yaw);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true; ph.needsUpdate = true; ti.needsUpdate = true; wa.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  for (let i = 0; i < (2 * R + 1) ** 2; i++) {
    const g = geo.clone();
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(perTile), 1));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(perTile), 1));
    g.setAttribute('aWind', new THREE.InstancedBufferAttribute(new Float32Array(perTile * 3), 3));
    const mesh = new THREE.InstancedMesh(g, mat, perTile);
    mesh.frustumCulled = true; mesh.castShadow = false; mesh.receiveShadow = true;
    group.add(mesh);
    tiles.push({ mesh, cx: 1e9, cz: 1e9 });
  }
  let ccx = 1e9, ccz = 1e9, first = true;
  // tiles waiting to be refilled: one per frame (refilling five at once was a 20 ms hitch at every tile edge)
  const queue: Tile[] = [];
  return {
    group, get blades() { return tiles.reduce((a, t) => a + t.mesh.count, 0); },
    update(cam) {
      const qt = queue.shift(); if (qt) fill(qt);
      const cx = Math.floor(cam.x / TILE), cz = Math.floor(cam.z / TILE);
      if (cx === ccx && cz === ccz) return;
      ccx = cx; ccz = cz;
      // which tiles are wanted; keep the ones already in place, refill the rest
      const want = new Set<string>();
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) want.add(`${cx + dx},${cz + dz}`);
      const free = tiles.filter((t) => !want.has(`${t.cx},${t.cz}`));
      for (const key of want) {
        if (tiles.some((t) => `${t.cx},${t.cz}` === key)) continue;
        const t = free.pop(); if (!t) break;
        const [x, z] = key.split(',').map(Number); t.cx = x; t.cz = z;
        // until refilled, a recycled tile shows nothing (not its old blades in the wrong place)
        const qi = queue.indexOf(t); if (qi >= 0) queue.splice(qi, 1);
        if (first) fill(t); else { t.mesh.count = 0; queue.push(t); }
      }
      // the tile underfoot first
      queue.sort((a, b) => Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz));
      first = false;
    },
  };
}
