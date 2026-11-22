// BVH collision world for capsule movement and hitscan raycasting.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

/** Mark an object (and its descendants) as solid world geometry. */
export function collide<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((c) => { c.userData.collide = true; });
  return obj;
}

/** A big open world's ground and tree trunks, answered from a height grid and a trunk grid instead of the BVH
 *  (a 2 km terrain as triangles would be millions of them). A level puts one on its group's userData.terrain.
 *  The interface lives in the shared terrain service. */
import type { TerrainField } from '../../../services/terrain/field';
export type { TerrainField };

/** Visual meshes that never block (soft or see-through stuff) — the auto-collider pass skips them by name. */
const SOFT = /plant|fung|grass|fern|bush|vine|leaf|leaves|canopy|crown|foliage|flower|moss|water|river|sky|cloud|fog|mist|glow|light|ray|spore|thorn|decal|particle|vfx|beam|wisp|petal|cobweb|rope/i;

export class CollisionWorld {
  private bvh: MeshBVH | null = null;
  terrain: TerrainField | null = null;
  /** Trunk columns found automatically on instanced trees (x, z, r, y0, y1), hashed in 8 m cells. */
  private cols = new Map<number, number[][]>();
  readonly stats = { autoTrunks: 0, autoMeshes: 0 };

  constructor(private root: THREE.Object3D) {}

  private colKey(cx: number, cz: number) { return (cx + 4096) * 8192 + (cz + 4096); }
  private addCol(c: number[]) {
    const x0 = Math.floor((c[0] - c[2]) / 8), x1 = Math.floor((c[0] + c[2]) / 8), z0 = Math.floor((c[1] - c[2]) / 8), z1 = Math.floor((c[1] + c[2]) / 8);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = this.colKey(x, z); const a = this.cols.get(k); if (a) a.push(c); else this.cols.set(k, [c]); }
  }
  private colsNear(x: number, z: number, r: number, out: Set<number[]>) {
    out.clear();
    for (let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++) for (let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++) {
      const a = this.cols.get(this.colKey(cx, cz)); if (a) for (const c of a) out.add(c);
    }
    return out;
  }
  private near = new Set<number[]>();

  /** Instanced trees carry no collider of their own: give each instance a trunk column measured from its mesh
   *  (the spread of the vertices 0.4-1.8 m above its base). A mesh with no vertices down there (a crown on its own)
   *  is skipped, so only real trunks block. */
  private autoTrunks(m: THREE.InstancedMesh) {
    const g = m.geometry, pa = g.attributes.position as THREE.BufferAttribute | undefined;
    if (!pa || m.count === 0 || SOFT.test(m.name) || SOFT.test(m.parent?.name ?? '')) return;
    g.computeBoundingBox();
    const bb = g.boundingBox!, h = bb.max.y - bb.min.y;
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.getMatrixAt(0, m4); m4.premultiply(m.matrixWorld).decompose(p, q, sc);
    if (h * sc.y < 3.5) return; // not a tree
    let cx = 0, cz = 0, n = 0;
    const lo = bb.min.y + 0.4 / sc.y, hi = bb.min.y + 1.8 / sc.y;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < lo || y > hi) continue; cx += pa.getX(i); cz += pa.getZ(i); n++; }
    if (n < 6) return;
    cx /= n; cz /= n;
    const ds: number[] = [];
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < lo || y > hi) continue; ds.push(Math.hypot(pa.getX(i) - cx, pa.getZ(i) - cz)); }
    ds.sort((a, b) => a - b);
    const rLocal = ds[Math.floor(ds.length * 0.8)];
    if (!(rLocal > 0) || rLocal * Math.max(sc.x, sc.z) > 3) return; // too wide to be a trunk (a bush, a hedge)
    const c = new THREE.Vector3();
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, m4); m4.premultiply(m.matrixWorld).decompose(p, q, sc);
      if (sc.x === 0 && sc.y === 0) continue; // hidden instance
      c.set(cx, bb.min.y, cz).multiply(sc).applyQuaternion(q).add(p);
      const r = rLocal * Math.max(sc.x, sc.z) * 0.9;
      this.addCol([c.x, c.z, Math.max(0.15, r), c.y - 0.5, c.y + Math.min(h * sc.y * 0.6, 12)]);
      this.stats.autoTrunks++;
    }
  }

  rebuild() {
    this.terrain = (this.root.userData.terrain as TerrainField | undefined) ?? null;
    this.root.updateMatrixWorld(true);
    const geos: THREE.BufferGeometry[] = [];
    this.cols.clear(); this.stats.autoTrunks = this.stats.autoMeshes = 0;
    // trunk columns a level lists itself (its planted trees: [x, z, r, y0, y1] each)
    for (const c of (this.root.userData.trunkColumns as number[][] | undefined) ?? []) { this.addCol(c); this.stats.autoTrunks++; }
    // a level marks its solid geometry with collide(); visual meshes it forgot (structure models whose kit
    // collider doesn't cover them, instanced trees) get colliders here so nothing solid can be walked through.
    // userData.noCollide on a mesh or a parent opts out.
    const marked = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.userData.collide || q.userData.noCollide) return true; return false; };
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) {
        const im = m as unknown as THREE.InstancedMesh;
        if (marked(m) || !m.visible || im.count === 0) return;
        // a handful of big set-piece instances (the giant trees' trunks, buttress roots, boulders): collide with
        // their real shape; a forest of hundreds: a trunk column each
        const pa = im.geometry.attributes.position, tris = (im.geometry.index ? im.geometry.index.count : pa?.count ?? 0) / 3;
        if (pa && im.count <= 64 && tris * im.count <= 400000 && !SOFT.test(im.name) && !SOFT.test(im.parent?.name ?? '')) {
          im.geometry.computeBoundingBox();
          const bb = im.geometry.boundingBox!, m4 = new THREE.Matrix4(), sc = new THREE.Vector3();
          im.getMatrixAt(0, m4); sc.setFromMatrixScale(m4);
          if ((bb.max.y - bb.min.y) * sc.y >= 1.0) {
            for (let i = 0; i < im.count; i++) {
              im.getMatrixAt(i, m4); m4.premultiply(im.matrixWorld);
              const g = new THREE.BufferGeometry();
              g.setAttribute('position', pa.clone());
              if (im.geometry.index) g.setIndex(im.geometry.index.clone());
              g.applyMatrix4(m4);
              geos.push(g.index ? g.toNonIndexed() : g);
              this.stats.autoMeshes++;
            }
            return;
          }
        }
        this.autoTrunks(im);
        return;
      }
      let auto = false;
      if (!m.userData.collide) {
        if (marked(m) || !m.visible || !m.geometry?.attributes.position) return;
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material & { alphaTest?: number };
        if (!mat || mat.transparent || (mat.alphaTest ?? 0) > 0 || mat.blending === THREE.AdditiveBlending) return;
        if (SOFT.test(m.name) || SOFT.test(mat.name ?? '') || SOFT.test(m.parent?.name ?? '')) return;
        const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        if (tris > 150000) return;
        const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3());
        if (sz.y < 1.0 || Math.max(sz.x, sz.z) > 80) return; // flat dressing, or ground/sky scale
        auto = true;
      }
      const src = m.geometry;
      if (!src?.attributes.position) return;
      if (auto) this.stats.autoMeshes++;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position.clone());
      if (src.index) g.setIndex(src.index.clone());
      g.applyMatrix4(m.matrixWorld);
      geos.push(g.index ? g.toNonIndexed() : g);
    });
    this.bvh = null;
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    if (merged) this.bvh = new MeshBVH(merged);
  }

  groundAt(x: number, z: number, fromY: number, maxDrop = 50): number | null {
    let best: number | null = null;
    if (this.bvh) {
      const hit = this.bvh.raycastFirst(
        new THREE.Ray(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)),
        THREE.DoubleSide,
      );
      if (hit && hit.distance <= maxDrop) best = hit.point.y;
    }
    if (this.terrain) {
      const h = this.terrain.heightAt(x, z, fromY);
      if (h <= fromY + 0.05 && fromY - h <= maxDrop && (best === null || h > best)) best = h;
    }
    return best;
  }

  rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    let d = max;
    if (this.bvh) {
      const hit = this.bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide);
      if (hit && hit.distance < d) d = hit.distance;
    }
    // auto trunk columns
    if (this.cols.size) {
      const hl = Math.hypot(dir.x, dir.z);
      if (hl > 1e-4) {
        const ux = dir.x / hl, uz = dir.z / hl;
        for (let s = 0; s < d * hl + 4; s += 6) {
          for (const tr of this.colsNear(origin.x + ux * s, origin.z + uz * s, 6, this.near)) {
            const ox = origin.x - tr[0], oz = origin.z - tr[1];
            const b = ox * ux + oz * uz, c = ox * ox + oz * oz - tr[2] * tr[2], disc = b * b - c;
            if (disc < 0) continue;
            const hd = -b - Math.sqrt(disc);
            if (hd < 0) continue;
            const td = hd / hl, y = origin.y + dir.y * td;
            if (td < d && y > tr[3] && y < tr[4]) d = td;
          }
        }
      }
    }
    const t = this.terrain;
    if (t) {
      // march the ground in 1 m steps (finer near), then refine the crossing
      let prev = 0;
      for (let s = 0.25; s < d; s += s < 6 ? 0.25 : 1) {
        if (origin.y + dir.y * s < t.heightAt(origin.x + dir.x * s, origin.z + dir.z * s, origin.y + dir.y * s)) {
          let a = prev, b = s;
          for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (origin.y + dir.y * m < t.heightAt(origin.x + dir.x * m, origin.z + dir.z * m, origin.y + dir.y * m)) b = m; else a = m; }
          d = Math.min(d, a); break;
        }
        prev = s;
      }
      // trunks the ray passes (2D ray-circle in the cells along it, within each trunk's height)
      if (t.trunksNear && d > 0.5) {
        const hl = Math.hypot(dir.x, dir.z);
        if (hl > 1e-4) {
          const ux = dir.x / hl, uz = dir.z / hl;
          for (let s = 0; s < d * hl; s += 6) {
            for (const tr of t.trunksNear(origin.x + ux * s, origin.z + uz * s, 8)) {
              const ox = origin.x - tr[0], oz = origin.z - tr[1];
              const b = ox * ux + oz * uz, c = ox * ox + oz * oz - tr[2] * tr[2], disc = b * b - c;
              if (disc < 0) continue;
              const hd = -b - Math.sqrt(disc);
              if (hd < 0) continue;
              const td = hd / hl, y = origin.y + dir.y * td;
              if (td < d && y > tr[3] && y < tr[4]) d = td;
            }
          }
        }
      }
    }
    return d;
  }

  /** Push a capsule out of the terrain and the trunks. Returns whether it stands on walkable ground. */
  private resolveTerrain(pos: THREE.Vector3, radius: number, height: number): boolean {
    const t = this.terrain!;
    const step = t.step ?? 0.55;
    // walls: ground rising more than a step within the capsule's radius pushes it back (cliff faces, gorge walls)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const qy = pos.y + 1;
      if (t.heightAt(pos.x + dx * radius, pos.z + dz * radius, qy) <= pos.y + step) continue;
      let lo = 0, hi = radius;
      for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (t.heightAt(pos.x + dx * m, pos.z + dz * m, qy) > pos.y + step) hi = m; else lo = m; }
      const push = radius - hi;
      if (push > 1e-3) { pos.x -= dx * push * 0.5; pos.z -= dz * push * 0.5; }
    }
    let ground = false;
    const qy = pos.y + 1, h = t.heightAt(pos.x, pos.z, qy);
    if (pos.y < h) {
      const e = 0.6, nx = t.heightAt(pos.x - e, pos.z, qy) - t.heightAt(pos.x + e, pos.z, qy), nz = t.heightAt(pos.x, pos.z - e, qy) - t.heightAt(pos.x, pos.z + e, qy);
      const ny = 2 * e, nl = Math.hypot(nx, ny, nz), uy = ny / nl;
      if (uy >= 0.5 || h - pos.y > 2.5) { pos.y = h; ground = true; }
      else { const p = (h - pos.y) * uy; pos.x += (nx / nl) * p; pos.y += uy * p; pos.z += (nz / nl) * p; }
    } else if (pos.y - h < 0.04) ground = true;
    if (t.trunksNear) {
      for (const tr of t.trunksNear(pos.x, pos.z, radius + 3)) {
        if (pos.y > tr[4] || pos.y + height < tr[3]) continue;
        const dx = pos.x - tr[0], dz = pos.z - tr[1], d = Math.hypot(dx, dz), min = tr[2] + radius;
        if (d >= min || d < 1e-5) continue;
        pos.x += (dx / d) * (min - d); pos.z += (dz / d) * (min - d);
      }
    }
    return ground;
  }

  private seg = new THREE.Line3();
  private box = new THREE.Box3();
  private triPt = new THREE.Vector3();
  private capPt = new THREE.Vector3();

  resolve(pos: THREE.Vector3, radius: number, height: number): { pos: THREE.Vector3; onGround: boolean } {
    if (!this.bvh) { const g = this.terrain ? this.resolveTerrain(pos, radius, height) : true; this.resolveCols(pos, radius, height); return { pos, onGround: g }; }
    const seg = this.seg;
    seg.start.set(pos.x, pos.y + radius, pos.z);
    seg.end.set(pos.x, pos.y + height - radius, pos.z);
    let pushedUp = 0;

    for (let iter = 0; iter < 3; iter++) {
      this.box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end).expandByScalar(radius);
      let moved = false;
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(this.box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(seg, this.triPt, this.capPt);
          if (d >= radius || d === 0) return false;
          const push = radius - d;
          const n = this.capPt.sub(this.triPt).normalize();
          seg.start.addScaledVector(n, push);
          seg.end.addScaledVector(n, push);
          pos.addScaledVector(n, push);
          if (n.y > 0.45) pushedUp = Math.max(pushedUp, n.y);
          moved = true;
          return false;
        },
      });
      if (!moved) break;
    }

    const onTerrain = this.terrain ? this.resolveTerrain(pos, radius, height) : false;
    this.resolveCols(pos, radius, height);
    return { pos, onGround: pushedUp > 0.45 || onTerrain };
  }

  private resolveCols(pos: THREE.Vector3, radius: number, height: number) {
    if (!this.cols.size) return;
    for (const tr of this.colsNear(pos.x, pos.z, radius + 3, this.near)) {
      if (pos.y > tr[4] || pos.y + height < tr[3]) continue;
      const dx = pos.x - tr[0], dz = pos.z - tr[1], d = Math.hypot(dx, dz), min = tr[2] + radius;
      if (d >= min || d < 1e-5) continue;
      pos.x += (dx / d) * (min - d); pos.z += (dz / d) * (min - d);
    }
  }
}
