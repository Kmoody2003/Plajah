import * as THREE from 'three';

function sphereInFrustum(f: THREE.Frustum, x: number, y: number, z: number, r: number): boolean {
  const planes = f.planes;
  const nr = -r;
  for (let p = 0; p < 6; p++) {
    const pl = planes[p];
    if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < nr) return false;
  }
  return true;
}

/** Compact static world instances against the union of view and shadow frusta.
 * Stores packed Float32Array sphere bounds for L1-friendly scanning, skips
 * out-of-range batches in O(1), and uploads GPU matrices only on change.
 */
export class InstanceVisibility {
  readonly mesh: THREE.InstancedMesh;
  /** Optional hard per-batch distance cutoff (e.g. 220 m for v4 micro-trims). */
  maxDist = Infinity;
  private bounds: Float32Array;
  private readonly countTotal: number;
  private source: Float32Array;
  private indices: Int32Array;
  private bx = 0;
  private by = 0;
  private bz = 0;
  private br = 0;
  private maxInstR = 1;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], matrices: readonly THREE.Matrix4[]) {
    this.mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // CPU union includes shadow-only casters.
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const baseSphere = geometry.boundingSphere!;
    const n = matrices.length;
    this.countTotal = n;
    this.bounds = new Float32Array(n * 4);
    this.source = new Float32Array(n * 16);
    this.indices = new Int32Array(n);

    const tmp = new THREE.Sphere();
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let mr = 1;
    for (let i = 0; i < n; i++) {
      const matrix = matrices[i];
      tmp.copy(baseSphere).applyMatrix4(matrix);
      const o = i * 4;
      this.bounds[o] = tmp.center.x;
      this.bounds[o + 1] = tmp.center.y;
      this.bounds[o + 2] = tmp.center.z;
      this.bounds[o + 3] = tmp.radius;
      if (tmp.radius > mr) mr = tmp.radius;
      if (tmp.center.x - tmp.radius < minX) minX = tmp.center.x - tmp.radius;
      if (tmp.center.y - tmp.radius < minY) minY = tmp.center.y - tmp.radius;
      if (tmp.center.z - tmp.radius < minZ) minZ = tmp.center.z - tmp.radius;
      if (tmp.center.x + tmp.radius > maxX) maxX = tmp.center.x + tmp.radius;
      if (tmp.center.y + tmp.radius > maxY) maxY = tmp.center.y + tmp.radius;
      if (tmp.center.z + tmp.radius > maxZ) maxZ = tmp.center.z + tmp.radius;
      this.source.set(matrix.elements, i * 16);
      this.indices[i] = -1;
    }
    this.maxInstR = mr;
    if (n > 0) {
      this.bx = (minX + maxX) * 0.5;
      this.by = (minY + maxY) * 0.5;
      this.bz = (minZ + maxZ) * 0.5;
      this.br = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5;
    }
    // Start culled until first CityVisibility.update() pass so streamed Wave 1/2 batches never flash all 11,000+ buildings across the GPU!
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  update(frustums: readonly THREE.Frustum[], cam?: THREE.Vector3, viewDist = Infinity, shadowDist = Infinity): number {
    const n = this.countTotal;
    if (n === 0) { this.mesh.count = 0; this.mesh.visible = false; return 0; }

    // Batch-level distance early-out: skip 100s of instances in 1 check
    const effVd = Math.min(viewDist, this.maxDist);
    const maxLim = effVd === Infinity ? Infinity : (Number.isFinite(this.maxDist) ? effVd : Math.min(effVd, Math.max(550, this.maxInstR * 32)));
    const effShad = this.mesh.castShadow ? shadowDist : 0;
    const camX = cam ? cam.x : 0;
    const camY = cam ? cam.y : 0;
    const camZ = cam ? cam.z : 0;
    const viewFrustum = frustums[0];
    const fLen = frustums.length;

    if (cam && effVd !== Infinity) {
      const bdx = this.bx - camX, bdy = this.by - camY, bdz = this.bz - camZ;
      const batchCut = Math.max(maxLim, effShad) + this.br;
      if (bdx * bdx + bdy * bdy + bdz * bdz > batchCut * batchCut) {
        this.mesh.count = 0;
        this.mesh.visible = false;
        return 0;
      }
      if (!sphereInFrustum(viewFrustum, this.bx, this.by, this.bz, this.br)) {
        // Also ensure aggregate sphere intersects at least one shadow frustum if close enough to cast
        let inAnyShadow = false;
        if (effShad > 0 && bdx * bdx + bdy * bdy + bdz * bdz <= (effShad + this.br) * (effShad + this.br)) {
          for (let k = 1; k < fLen; k++) {
            if (sphereInFrustum(frustums[k], this.bx, this.by, this.bz, this.br)) { inAnyShadow = true; break; }
          }
        }
        if (!inAnyShadow) {
          this.mesh.count = 0;
          this.mesh.visible = false;
          return 0;
        }
      }
    }

    let count = 0;
    let changed = false;
    const target = this.mesh.instanceMatrix.array as Float32Array;
    const bounds = this.bounds;
    const src = this.source;
    const idx = this.indices;

    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const cx = bounds[o];
      const cy = bounds[o + 1];
      const cz = bounds[o + 2];
      const r = bounds[o + 3];

      if (cam) {
        const dx = cx - camX;
        const dz = cz - camZ;
        const lim = effVd === Infinity ? Infinity : (Number.isFinite(this.maxDist) ? effVd : Math.min(effVd, Math.max(550, r * 32)));
        const reach = Math.max(lim, effShad) + r;
        // Fast AABB pre-reject before squaring/sqrt
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const dyAbs = cy > camY ? cy - camY : camY - cy;
        const dy = dyAbs > r ? dyAbs - r : 0;
        const d2 = dx * dx + dz * dz + dy * dy;
        const limR = lim + r;
        const shadR = effShad + r;
        const near = effShad > 0 && d2 < shadR * shadR;
        if (d2 >= limR * limR && !near) continue;

        if (sphereInFrustum(viewFrustum, cx, cy, cz, r)) {
          if (d2 >= limR * limR) continue;
        } else {
          if (!near) continue;
          let inShadow = false;
          for (let k = 1; k < fLen; k++) {
            if (sphereInFrustum(frustums[k], cx, cy, cz, r)) { inShadow = true; break; }
          }
          if (!inShadow) continue;
        }
      } else {
        let vis = false;
        for (let k = 0; k < fLen; k++) {
          if (sphereInFrustum(frustums[k], cx, cy, cz, r)) { vis = true; break; }
        }
        if (!vis) continue;
      }

      if (idx[count] !== i) {
        idx[count] = i;
        changed = true;
        target.set(src.subarray(i * 16, i * 16 + 16), count * 16);
      }
      count++;
    }

    if (changed) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, count * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    return count;
  }
}

export class CityVisibility {
  batches: InstanceVisibility[] = [];
  private view = new THREE.Frustum();
  private shadows: THREE.Frustum[] = [];
  private matrix = new THREE.Matrix4();
  viewDist = Infinity; shadowDist = Infinity;
  /** `slice` of `slices`: only that share of the batches is refreshed this call (frustums are still built every call), spreading the cost over several frames. */
  update(camera: THREE.PerspectiveCamera, lights: readonly THREE.DirectionalLight[], slice = 0, slices = 1): void {
    camera.updateMatrixWorld();
    this.view.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const frustums = [this.view];
    let index = 0;
    for (const light of lights) {
      if (!light.visible || !light.castShadow) continue;
      light.updateMatrixWorld(); light.target.updateMatrixWorld();
      light.shadow.updateMatrices(light);
      const shadowCamera = light.shadow.camera;
      const frustum = this.shadows[index] ?? (this.shadows[index] = new THREE.Frustum());
      frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse));
      frustums.push(frustum); index++;
    }
    for (let b = slice; b < this.batches.length; b += slices) this.batches[b].update(frustums, camera.position, this.viewDist, this.shadowDist);
  }
}
