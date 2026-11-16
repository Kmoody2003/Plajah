import * as THREE from 'three';

/** Compact static world instances against the union of view and shadow frusta.
 * Keeps the original draw-call count, geometry, materials, transforms and shadows.
 * Uploads only when the visible index list changes, rather than every frame.
 */
export class InstanceVisibility {
  readonly mesh: THREE.InstancedMesh;
  private spheres: THREE.Sphere[];
  private source: Float32Array;
  private indices: Int32Array;
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], matrices: readonly THREE.Matrix4[]) {
    this.mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // CPU union includes shadow-only casters.
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    this.spheres = matrices.map((matrix) => geometry.boundingSphere!.clone().applyMatrix4(matrix));
    this.source = new Float32Array(matrices.length * 16);
    this.indices = new Int32Array(matrices.length);
    matrices.forEach((matrix, i) => { this.source.set(matrix.elements, i * 16); this.mesh.setMatrixAt(i, matrix); this.indices[i] = i; });
  }
  update(frustums: readonly THREE.Frustum[]): number {
    let count = 0, changed = false;
    const target = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.spheres.length; i++) {
      if (!frustums.some((frustum) => frustum.intersectsSphere(this.spheres[i]))) continue;
      if (this.indices[count] !== i) {
        this.indices[count] = i; changed = true;
        for (let k = 0; k < 16; k++) target[count * 16 + k] = this.source[i * 16 + k];
      }
      count++;
    }
    if (changed) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, count * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    this.mesh.count = count;
    return count;
  }
}

export class CityVisibility {
  batches: InstanceVisibility[] = [];
  private view = new THREE.Frustum();
  private shadows: THREE.Frustum[] = [];
  private matrix = new THREE.Matrix4();
  update(camera: THREE.PerspectiveCamera, lights: readonly THREE.DirectionalLight[]): void {
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
    for (const batch of this.batches) batch.update(frustums);
  }
}
