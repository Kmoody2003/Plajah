// Real grass: tapered, curved blades around the player (not cards), swaying in the wind.
// 5×5 tiles of 10 m follow the camera; crossing a tile boundary recycles only the trailing row to the front.
// Blades are placed from the world cell's own seed, so the field is fixed in the world and never shimmers.
// Clumped placement, no grass on roads, sand, cliffs or under buildings (grassAt).
import * as THREE from 'three/webgpu';
import { uv, mix, color, time, sin, positionLocal, vec3, attribute, float, texture } from 'three/tsl';
import { camDist, cutAlpha, keep, fadeIn, fadeOut } from './core/lodFade';
import { seasonU } from './core/seasonLook';
import { windAt, localWindDir } from './core/wind';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const TILE = 10, R = 2;  // 5 × 5 tiles → 50 m square around the player
// The grass is there at every distance (core/lodFade.ts): blades near (fading out by coverage 13 → 19 m, inside the
// ring's nearest edge at 20 m), and past them a tuft for every clump — the same clumps, at the same spots — out to
// ±60 m (5 × 5 tiles of 3 × 3 cells), fading into the haze 48 → 58 m. Walking up, the tufts resolve into blades.
const FAR_CELLS = 3;
const nearFade = (d: N) => fadeOut(d, 13, 19);
const farFade = (d: N) => fadeIn(d, 13, 19).mul(fadeOut(d, 48, 58));

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
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaToCoverage: true });
  const phase: N = attribute('aPhase', 'float');
  const tint: N = attribute('aTint', 'float');
  const t: N = uv().y;
  // base dark and cool, tips warm and dry; each blade a little different
  // the season: autumn takes it to straw and russet, winter snow whitens the tips and presses the blades down
  const tipC: N = mix(mix(color(0x6f9a3c), color(0x9fae4e), tint), mix(color(0xc8a85a), color(0xa86a3a), tint.mul(0.6)), seasonU.autumn);
  const baseC: N = mix(color(0x1c3414), color(0x4a3e22), seasonU.autumn);
  const snowTip: N = seasonU.snow.mul(t).mul(0.8);
  mat.colorNode = mix(mix(baseC, tipC, t.mul(t).mul(0.9)), vec3(0.84, 0.86, 0.9), snowTip);
  // wind (core/wind.ts): every blade bends downwind as the gust bands roll over the field, plus its own quick
  // flutter; the tip goes furthest (and dips a little as it bends)
  const aw: N = attribute('aWind', 'vec3');
  const ld: N = localWindDir(aw.z), push: N = windAt(aw.xy);
  const sway: N = sin(time.mul(2.1).add(phase)).mul(0.55).add(sin(time.mul(5.3).add(phase.mul(2.3))).mul(0.3));
  const bend: N = push.mul(0.42).add(sway.mul(0.05).mul(push.add(0.3)));
  mat.positionNode = positionLocal.add(vec3(ld.x.mul(bend), bend.mul(bend).mul(-0.6), ld.y.mul(bend)).mul(t.mul(t))).mul(vec3(1, float(1).sub(seasonU.snow.mul(0.6)), 1));
  mat.opacityNode = nearFade(camDist(aw.xy));
  mat.maskNode = keep(mat.opacityNode);
  mat.roughnessNode = float(0.85);
  mat.metalnessNode = float(0);

  type Tile = { mesh: THREE.InstancedMesh; cx: number; cz: number };
  const tiles: Tile[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  /** The clumps of world cell (cx, cz): centre, density and seed index — the same whoever asks. */
  function cellClumps(cx: number, cz: number, put: (x: number, z: number, dens: number, c: number) => void) {
    const x0 = cx * TILE, z0 = cz * TILE, clumps = Math.round(perTile / 6);
    for (let c = 0; c < clumps; c++) {
      const r1 = hash(cx * 131 + c, cz * 977 + c * 7);
      const x = x0 + hash(cx * 17 + c * 3, cz * 29 + c) * TILE, z = z0 + r1 * TILE;
      const dens = grassAt(x, z);
      if (dens > 0.02) put(x, z, dens, c);
    }
  }
  function fill(tile: Tile) {
    const mesh = tile.mesh, ph = mesh.geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute, ti = mesh.geometry.getAttribute('aTint') as THREE.InstancedBufferAttribute;
    const wa = mesh.geometry.getAttribute('aWind') as THREE.InstancedBufferAttribute;
    let n = 0;
    cellClumps(tile.cx, tile.cz, (cxw, czw, dens, c) => {
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
    });
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
  const far = tuftLayer(group, heightAt, cellClumps, perTile);
  let ccx = 1e9, ccz = 1e9, first = true;
  // tiles waiting to be refilled: one per frame (refilling five at once was a 20 ms hitch at every tile edge)
  const queue: Tile[] = [];
  return {
    group, get blades() { return tiles.reduce((a, t) => a + t.mesh.count, 0); },
    update(cam) {
      far.update(cam);
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

/** A painted tuft: blades fanning up from a dark base to sunlit tips, the colours of the near blades. */
function tuftTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * 88, h = 50 + r() * 74, lean = (r() - 0.5) * 40, w = 2 + r() * 2.5;
    const grad = g.createLinearGradient(0, 128, 0, 128 - h);
    grad.addColorStop(0, '#1c3414'); grad.addColorStop(0.55, r() < 0.5 ? '#5f8a34' : '#6f9a3c'); grad.addColorStop(1, r() < 0.5 ? '#9fae4e' : '#8aa046');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + lean * 0.4, 128 - h * 0.6, x + lean, 128 - h); g.quadraticCurveTo(x + lean * 0.4 + w * 0.5, 128 - h * 0.6, x + w, 128); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** The far grass: one tuft (three crossed cards) per clump, at the clump's own spot and size. */
function tuftLayer(group: THREE.Group, heightAt: (x: number, z: number) => number,
  cellClumps: (cx: number, cz: number, put: (x: number, z: number, dens: number, c: number) => void) => void, perTile: number) {
  const geo = new THREE.BufferGeometry();
  {
    const pos: number[] = [], uvs: number[] = [], nrm: number[] = [], idx: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, c = Math.cos(a) * 0.55, s = Math.sin(a) * 0.55, b = pos.length / 3;
      pos.push(-c, 0, -s, c, 0, s, -c, 1, -s, c, 1, s); uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);   // lit like the ground, as the blades read from afar
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
  }
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaToCoverage: true, roughness: 0.85, metalness: 0 });
  const tx: N = texture(tuftTexture(), uv());
  mat.colorNode = mix(mix(tx.rgb, tx.rgb.dot(vec3(0.3, 0.6, 0.1)).mul(vec3(1.5, 1.2, 0.7)), seasonU.autumn), vec3(0.84, 0.86, 0.9), seasonU.snow.mul(0.6));
  const aw: N = attribute('aWind', 'vec3'), ld: N = localWindDir(aw.z), push: N = windAt(aw.xy);
  const y: N = positionLocal.y;
  const bend: N = push.mul(0.42).mul(y.mul(y));
  mat.positionNode = positionLocal.add(vec3(ld.x.mul(bend), bend.mul(bend).mul(-0.6), ld.y.mul(bend))).mul(vec3(1, float(1).sub(seasonU.snow.mul(0.6)), 1));
  mat.opacityNode = cutAlpha(tx.a, 0.4, farFade(camDist(aw.xy)));
  mat.maskNode = keep(mat.opacityNode);
  mat.roughnessNode = float(0.85);

  type T = { mesh: THREE.InstancedMesh; cx: number; cz: number };
  const cap = Math.round(perTile / 6) * FAR_CELLS * FAR_CELLS, span = TILE * FAR_CELLS;
  const tiles: T[] = [];
  for (let i = 0; i < (2 * R + 1) ** 2; i++) {
    const g = geo.clone();
    g.setAttribute('aWind', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    const mesh = new THREE.InstancedMesh(g, mat, cap);
    mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = true;
    group.add(mesh); tiles.push({ mesh, cx: 1e9, cz: 1e9 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function fill(t: T) {
    const wa = t.mesh.geometry.getAttribute('aWind') as THREE.InstancedBufferAttribute;
    let n = 0;
    for (let j = 0; j < FAR_CELLS; j++) for (let i = 0; i < FAR_CELLS; i++) {
      cellClumps(t.cx * FAR_CELLS + i, t.cz * FAR_CELLS + j, (x, z, dens) => {
        const yaw = hash(x * 7.1 | 0, z * 9.3 | 0) * Math.PI * 2;
        p.set(x, heightAt(x, z) - 0.02, z); q.setFromAxisAngle(up, yaw);
        // the clump's spread and its blades' height (grassField's blades: 0.42…0.92 × (0.6 + 0.4·density))
        s.set(0.9 + 0.5 * dens, 0.7 * (0.6 + 0.4 * dens), 0.9 + 0.5 * dens);
        m4.compose(p, q, s); t.mesh.setMatrixAt(n, m4); wa.setXYZ(n, x, z, yaw); n++;
      });
    }
    t.mesh.count = n; t.mesh.instanceMatrix.needsUpdate = true; wa.needsUpdate = true; t.mesh.computeBoundingSphere();
  }
  let ccx = 1e9, ccz = 1e9, first = true;
  const queue: T[] = [];
  return {
    update(cam: THREE.Vector3) {
      const qt = queue.shift(); if (qt) fill(qt);
      const cx = Math.floor(cam.x / span), cz = Math.floor(cam.z / span);
      if (cx === ccx && cz === ccz) return;
      ccx = cx; ccz = cz;
      const want = new Set<string>();
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) want.add(`${cx + dx},${cz + dz}`);
      const free = tiles.filter((t) => !want.has(`${t.cx},${t.cz}`));
      for (const key of want) {
        if (tiles.some((t) => `${t.cx},${t.cz}` === key)) continue;
        const t = free.pop(); if (!t) break;
        const [x, z] = key.split(',').map(Number); t.cx = x; t.cz = z;
        const qi = queue.indexOf(t); if (qi >= 0) queue.splice(qi, 1);
        if (first) fill(t); else { t.mesh.count = 0; queue.push(t); }
      }
      queue.sort((a, b) => Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz));
      first = false;
    },
  };
}
