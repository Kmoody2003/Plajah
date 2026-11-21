// Plajah Vegetation — instanced plants with the one wind (docs/plajah-vegetation.md §2.3).
//
// A few grown variants per species, each an InstancedMesh; placements are sorted every few frames: in view and inside
// the draw range, or skipped. Fronds and stems bend from their roots with the wind and the impulses (aSway.x = how far
// out along the frond), leaves and petals flutter, and glowing parts pulse with the beat.
import * as THREE from 'three/webgpu';
import { attribute, color, float, mix, normalView, positionLocal, positionViewDirection, sin, time, uniform, vec3 } from 'three/tsl';
import type { PlantSpecies } from '../species';
import { pushAt, toLocal, windAt } from '../wind';
import { buildPlant } from './build';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface PlantSpot { x: number; y: number; z: number; yaw: number; species: number; scale: number }
export interface PlantOptions { variants?: number; range?: number; lowTier?: boolean; beat?: N; shadows?: boolean }

interface Bucket { mesh: THREE.InstancedMesh; spots: PlantSpot[]; radius: number }

function plantMaterial(sp: PlantSpecies, beat: N) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
  const inst: N = attribute('aInst', 'vec4'), sw: N = attribute('aSway', 'vec2'), col: N = attribute('color', 'vec3'), gl: N = attribute('aGlow', 'float');
  const w: N = windAt(inst.xy), push: N = toLocal(pushAt(inst.xy), inst.z);
  const k: N = sw.x.mul(sw.x);
  const swing: N = sin(time.mul(1.7).add(sw.y.mul(6.283))).mul(w.mul(0.5).add(0.1)).mul(sp.wind.sway * 0.06);
  const flutter: N = sin(time.mul(7.5).add(sw.y.mul(40)).add(positionLocal.x.mul(9))).mul(w.add(0.2)).mul(sp.wind.flutter * 0.015).mul(sw.x);
  const bend: N = push.mul(k.mul(sp.wind.sway * 0.35)).add(swing.mul(k));
  m.positionNode = positionLocal.add(vec3(bend.x.add(flutter), bend.dot(bend).mul(-0.4).add(flutter.mul(0.5)), bend.y.sub(flutter)));
  // glossy surfaces (crystals, resin, metal): smooth, and crystals catch an iridescent rim
  const mt: N = attribute('aMat', 'float');
  const edge: N = float(1).sub(normalView.dot(positionViewDirection).abs());
  m.colorNode = mix(col, col.mul(0.7).add(vec3(0.25, 0.2, 0.35).mul(edge)), mt.mul(0.5));
  m.roughnessNode = mix(float(0.72), float(0.18), mt);
  let em: N = col.mul(edge.mul(0.12)).add(col.mul(edge.mul(edge)).mul(mt.mul(0.35)));
  if (sp.glow) em = em.add(col.mul(gl).mul(float(sp.glow.strength).add(beat.mul(sp.glow.beat))).add(color(sp.glow.color).mul(gl.mul(0.15))));
  m.emissiveNode = em;
  return m;
}

export class PlantField {
  readonly group = new THREE.Group();
  readonly stats = { drawn: 0, culled: 0, triangles: 0 };
  private buckets: Bucket[] = [];
  private range: number;
  private t = 1;
  private frustum = new THREE.Frustum(); private pv = new THREE.Matrix4(); private sph = new THREE.Sphere();

  constructor(species: PlantSpecies[], spots: PlantSpot[], o: PlantOptions = {}) {
    this.group.name = 'plants';
    const variants = o.variants ?? 3, beat: N = o.beat ?? uniform(0);
    this.range = o.range ?? (o.lowTier ? 40 : 75);
    species.forEach((sp, si) => {
      const mat = plantMaterial(sp, beat);
      for (let vi = 0; vi < variants; vi++) {
        const mine = spots.filter((p, k) => p.species === si && k % variants === vi);
        if (!mine.length) continue;
        const pm = buildPlant(sp, si * 31 + vi * 7 + 3);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pm.position, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(pm.normal, 3));
        g.setAttribute('color', new THREE.BufferAttribute(pm.color, 3));
        g.setAttribute('aGlow', new THREE.BufferAttribute(pm.glow, 1));
        g.setAttribute('aSway', new THREE.BufferAttribute(pm.sway, 2));
        g.setAttribute('aMat', new THREE.BufferAttribute(pm.mat, 1));
        g.setIndex(new THREE.BufferAttribute(pm.index, 1));
        g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 4), 4));
        g.computeBoundingSphere();
        const mesh = new THREE.InstancedMesh(g, mat, mine.length);
        mesh.frustumCulled = false; mesh.castShadow = !!o.shadows; mesh.receiveShadow = true; mesh.count = 0;
        mesh.name = `plant-${sp.id}-${vi}`;
        this.group.add(mesh);
        this.buckets.push({ mesh, spots: mine, radius: g.boundingSphere!.radius });
      }
    });
  }

  update(camera: THREE.Camera, dt: number) {
    this.t += dt;
    if (this.t < 0.2) return;
    this.t = 0;
    const pos = camera.getWorldPosition(new THREE.Vector3());
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pv);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const r2 = this.range ** 2, st = this.stats; st.drawn = st.culled = st.triangles = 0;
    for (const b of this.buckets) {
      let n = 0;
      const a = b.mesh.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
      for (const p of b.spots) {
        const d2 = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        this.sph.center.set(p.x, p.y + b.radius * 0.5 * p.scale, p.z); this.sph.radius = b.radius * p.scale;
        if (d2 > r2 || !this.frustum.intersectsSphere(this.sph)) { st.culled++; continue; }
        m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), s3.set(p.scale, p.scale, p.scale));
        b.mesh.setMatrixAt(n, m4); a.setXYZW(n, p.x, p.z, p.yaw, p.scale); n++;
      }
      b.mesh.count = n; b.mesh.instanceMatrix.needsUpdate = true; a.needsUpdate = true;
      st.drawn += n; st.triangles += n * (b.mesh.geometry.index!.count / 3);
    }
  }
}
