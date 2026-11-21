// Real 3D trees for the forest. The 90k forest points stay photographic cross-card sprites at a distance; inside NEAR_R of the camera each point is drawn
// as an actual tree model (trunk, layered conifer boughs or lobed broadleaf crowns, vertex-coloured, swaying in the wind) and its card is discarded by the card
// material (see `cardLod`). Trees are selected from a spatial grid a few times a second, so the cost is bounded by how many are near, not by the forest.
import * as THREE from 'three';

export const NEAR_R = 195;
export const cardLodUniforms = { uNearR: { value: NEAR_R - 14 } };

/** patch a sprite card material so cards inside the 3D radius vanish (the 3D tree stands there instead) */
export function cardLod(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNearR = cardLodUniforms.uNearR;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uNearR;\nvarying float vTreeD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvTreeD = distance(cameraPosition.xz, (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz);\nif (vTreeD < uNearR) transformed = vec3(0.0);\n#else\nvTreeD = 1e5;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTreeD;\nuniform float uNearR;')
      .replace('void main() {', 'void main() {\n  if (vTreeD < uNearR) discard;');
  };
  mat.customProgramCacheKey = () => 'cardlod-v2';
}

function rng(seed: number): () => number { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

interface Part { pos: number[]; col: number[]; nor: number[]; leaf: number[]; }
/** soft shading for foliage: normals fan out from a centre (a ball) or from the axis (a bough) instead of facing each flat triangle, and the underside is darker */
interface Soft { cx: number; cy: number; cz: number; rad: number; axis: boolean }
function addGeo(p: Part, g: THREE.BufferGeometry, color: THREE.Color, jitter: number, r: () => number, tint = 0.12, soft?: Soft): void {
  const ng = g.index ? g.toNonIndexed() : g;
  const a = ng.getAttribute('position');
  const c = new THREE.Color(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), fn = new THREE.Vector3(), rn = new THREE.Vector3();
  for (let i = 0; i < a.count; i += 3) {
    c.copy(color).offsetHSL((r() - 0.5) * tint * 0.4, 0, (r() - 0.5) * tint);
    A.fromBufferAttribute(a, i); B.fromBufferAttribute(a, i + 1); C.fromBufferAttribute(a, i + 2);
    fn.copy(B).sub(A).cross(C.clone().sub(A)).normalize();
    for (let k = 0; k < 3; k++) {
      const x = a.getX(i + k), y = a.getY(i + k), z = a.getZ(i + k);
      p.pos.push(x, y, z);
      let shade = 1;
      if (soft) {
        rn.set(x - soft.cx, soft.axis ? 0.45 * soft.rad : y - soft.cy, z - soft.cz).normalize();
        const out = fn.dot(rn) < 0 ? fn.clone().negate() : fn;          // face normal pointing outward
        rn.multiplyScalar(0.78).addScaledVector(out, 0.22).normalize();
        shade = 0.7 + 0.4 * THREE.MathUtils.clamp((y - soft.cy) / (soft.rad * 1.4) * 0.5 + 0.5, 0, 1);
        p.nor.push(rn.x, rn.y, rn.z); p.leaf.push(1);
      } else { p.nor.push(fn.x, fn.y, fn.z); p.leaf.push(0); }
      p.col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  void jitter;
}
function toGeo(p: Part): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(p.leaf, 1));
  return g;
}
/** displace a geometry's vertices by hashed noise so shapes read as foliage, not primitives */
function rough(g: THREE.BufferGeometry, amt: number, r: () => number): THREE.BufferGeometry {
  const a = g.getAttribute('position');
  const map = new Map<string, THREE.Vector3>();
  for (let i = 0; i < a.count; i++) {
    const k = `${a.getX(i).toFixed(3)},${a.getY(i).toFixed(3)},${a.getZ(i).toFixed(3)}`;
    let d = map.get(k); if (!d) { d = new THREE.Vector3((r() - 0.5) * amt, (r() - 0.5) * amt * 0.6, (r() - 0.5) * amt); map.set(k, d); }
    a.setXYZ(i, a.getX(i) + d.x, a.getY(i) + d.y, a.getZ(i) + d.z);
  }
  return g;
}

/** a conifer 18 m tall: trunk and seven drooping, ragged boughs */
function coniferGeo(seed: number): THREE.BufferGeometry {
  const r = rng(seed), p: Part = { pos: [], col: [], nor: [], leaf: [] };
  const bark = new THREE.Color(0x4a3524);
  const trunk = new THREE.CylinderGeometry(0.1, 0.42, 18, 7, 1); trunk.translate(0, 9, 0);
  addGeo(p, trunk, bark, 0, r, 0.2);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const R = (1 - t * 0.88) * 3.6 + 0.3, H = 3.6 - t * 1.6, y = 3.0 + t * 12.2;
    const cone = new THREE.ConeGeometry(R, H, 11, 2, true); cone.translate(0, y + H * 0.5, 0);
    // droop the rim and break up the silhouette
    const a = cone.getAttribute('position');
    for (let k = 0; k < a.count; k++) if (a.getY(k) < y + H * 0.25) a.setY(k, a.getY(k) - R * 0.22 * (0.4 + r()));
    rough(cone, R * 0.34, r);
    addGeo(p, cone, new THREE.Color().setHSL(0.34 + (r() - 0.5) * 0.03, 0.46, 0.2 + t * 0.045), 0, r, 0.18, { cx: 0, cy: y + H * 0.3, cz: 0, rad: R, axis: true });
  }
  return toGeo(p);
}
/** a broadleaf tree 14 m tall: a forked trunk and a crown of lobes */
function broadGeo(seed: number, leaf: THREE.Color): THREE.BufferGeometry {
  const r = rng(seed), p: Part = { pos: [], col: [], nor: [], leaf: [] };
  const bark = new THREE.Color(0x4f3e30);
  const trunk = new THREE.CylinderGeometry(0.22, 0.5, 6.5, 7, 1); trunk.translate(0, 3.25, 0);
  addGeo(p, trunk, bark, 0, r, 0.2);
  for (let b = 0; b < 3; b++) {
    const ang = b * 2.1 + r(), br = new THREE.CylinderGeometry(0.08, 0.2, 4.6, 5); br.translate(0, 2.3, 0); br.rotateZ(0.7); br.rotateY(ang); br.translate(0, 5.0, 0);
    addGeo(p, br, bark, 0, r, 0.2);
  }
  const lobes = 9;
  for (let i = 0; i < lobes; i++) {
    const ang = (i / lobes) * 6.283 + r() * 0.6, rad = i === 0 ? 0 : 2.0 + r() * 1.6;
    const ls = 2.0 + r() * 1.3;
    const g = new THREE.IcosahedronGeometry(ls, 2);
    rough(g, ls * 0.34, r);
    g.scale(1, 0.82, 1);
    const lx = Math.cos(ang) * rad, ly = 9.2 + r() * 3.4 + (i === 0 ? 1.4 : 0), lz = Math.sin(ang) * rad;
    g.translate(lx, ly, lz);
    addGeo(p, g, leaf.clone().offsetHSL(0, 0, (r() - 0.5) * 0.09), 0, r, 0.22, { cx: lx, cy: ly, cz: lz, rad: ls, axis: false });
  }
  return toGeo(p);
}

interface Pt { x: number; z: number; conifer: boolean; k: number; s: number }

export class TreeField {
  readonly group = new THREE.Group();
  private grid = new Map<number, Pt[]>();
  private cell = 80;
  private meshes: THREE.InstancedMesh[] = [];
  private variants: { mesh: THREE.InstancedMesh; conifer: boolean; slot: number }[] = [];
  private last = new THREE.Vector2(1e9, 1e9);
  private accT = 0;
  private uTime = { value: 0 };
  private uWind = { value: 0.3 };
  private cap = 1800;
  private effRadius = NEAR_R;
  private effCap = 1800;
  private _buckets: number[] = [];
  private _m4 = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _pos = new THREE.Vector3();
  private _sc = new THREE.Vector3();
  private _col = new THREE.Color();
  count = 0;

  constructor(pts: number[][], private hAt: (x: number, z: number) => number, private exag: () => number) {
    for (const p of pts) {
      const k = Math.floor(p[0] / this.cell) * 4096 + Math.floor(p[1] / this.cell);
      let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
      a.push({ x: p[0], z: p[1], conifer: !!p[2], k: p[3], s: p[4] ?? 1 });
    }
    const mk = (g: THREE.BufferGeometry): THREE.InstancedMesh => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime; sh.uniforms.uWind = this.uWind;
        // leaf breakup: foliage edges (where the surface turns away from the eye) are eaten into by hashed gaps, so the crown reads as leaves, not a solid ball
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLeaf; varying vec3 vObj;\nfloat lh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vLeaf > 0.5) {
            float edge = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
            float n = lh(floor(vObj * 3.2)) * 0.6 + lh(floor(vObj * 7.5) + 3.0) * 0.4;
            if (n < edge * edge * 0.9 + 0.04) discard;
          }`);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLeaf; varying float vLeaf; varying vec3 vObj;\nuniform float uTime, uWind;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeaf = aLeaf; vObj = position;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
            vec3 ib = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
            float h01 = clamp(position.y / 17.0, 0.0, 1.0);
            float sw = uWind * h01 * h01 * 0.9;
            transformed.x += sin(uTime * 1.5 + ib.x * 0.07 + position.y * 0.3) * sw + sin(uTime * 3.1 + position.z * 1.7 + ib.z * 0.11) * sw * 0.25;
            transformed.z += cos(uTime * 1.2 + ib.z * 0.06) * sw * 0.7;
            #endif`);
      };
      m.customProgramCacheKey = () => 'treefield';
      const im = new THREE.InstancedMesh(g, m, this.cap);
      im.count = 0; im.frustumCulled = false; im.castShadow = false;
      this.group.add(im); this.meshes.push(im);
      return im;
    };
    const cs = [coniferGeo(11), coniferGeo(23), coniferGeo(37)].map(mk);
    const bs = [broadGeo(5, new THREE.Color(0x3f6a2a)), broadGeo(9, new THREE.Color(0x4d7a2e)), broadGeo(14, new THREE.Color(0x8a6a2a))].map(mk);
    cs.forEach((m, i) => this.variants.push({ mesh: m, conifer: true, slot: i }));
    bs.forEach((m, i) => this.variants.push({ mesh: m, conifer: false, slot: i }));
    this._buckets = this.variants.map(() => 0);
    this.group.frustumCulled = false;
  }

  setWind(w: number): void { this.uWind.value = w; }
  setQuality(scale: number): void {
    const s = Math.max(0.5, Math.min(1, scale));
    const nr = NEAR_R * (0.68 + 0.32 * s);
    const nc = Math.max(250, Math.floor(this.cap * (0.5 + 0.5 * s)));
    cardLodUniforms.uNearR.value = nr - 12;
    if (Math.abs(nr - this.effRadius) > 4 || Math.abs(nc - this.effCap) > 80) {
      this.effRadius = nr;
      this.effCap = nc;
      this.last.set(1e9, 1e9);
    }
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.uTime.value += dt;
    this.accT += dt;
    const moved = Math.hypot(cam.x - this.last.x, cam.z - this.last.y);
    if (this.accT < 0.25 || moved < 8) return;
    this.accT = 0; this.last.set(cam.x, cam.z);
    const R = this.effRadius, R2 = R * R, c0 = Math.floor((cam.x - R) / this.cell), c1 = Math.floor((cam.x + R) / this.cell), d0 = Math.floor((cam.z - R) / this.cell), d1 = Math.floor((cam.z + R) / this.cell);
    const buckets = this._buckets; buckets.fill(0);
    const m4 = this._m4, q = this._q, up = this._up, pos = this._pos, sc = this._sc, col = this._col;
    const maxCap = this.effCap;
    const ex = this.exag();
    let total = 0;
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const a = this.grid.get(cx * 4096 + cz); if (!a) continue;
      for (const t of a) {
        if (total >= maxCap * 2) break;
        const dx = t.x - cam.x, dz = t.z - cam.z;
        if (dx * dx + dz * dz > R2) continue;
        const h = (t.conifer ? 13 + t.k * 7 : 11 + t.k * 5) / (t.conifer ? 18 : 14) * t.s;
        const pick = Math.floor(((t.x * 31 + t.z * 17) % 1 + 1) % 1 * 3);
        let vi = t.conifer ? pick : 3 + pick;
        if (!t.conifer && ((t.x * 7 + t.z * 3) % 1 + 1) % 1 < 0.15) vi = 5;
        const v = this.variants[vi];
        if (buckets[vi] >= maxCap) continue;
        q.setFromAxisAngle(up, ((t.x * 7.3 + t.z * 3.1) % 6.283));
        pos.set(t.x, this.hAt(t.x, t.z) * ex - 0.15, t.z);
        sc.set(h, h, h);
        m4.compose(pos, q, sc);
        v.mesh.setMatrixAt(buckets[vi], m4);
        v.mesh.setColorAt(buckets[vi], col.setScalar(0.78 + (((t.x * 13.1 + t.z * 5.7) % 1 + 1) % 1) * 0.4));
        buckets[vi]++; total++;
      }
    }
    this.variants.forEach((v, i) => { v.mesh.count = buckets[i]; v.mesh.instanceMatrix.needsUpdate = true; if (v.mesh.instanceColor) v.mesh.instanceColor.needsUpdate = true; });
    this.count = total;
  }
}
