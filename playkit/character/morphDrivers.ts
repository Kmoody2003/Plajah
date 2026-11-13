/**
 * morphDrivers.ts — joint angle in, morph weight out (docs/character-forge.md §2, §6).
 *
 * A driver watches one bone's direction in a reference space (its parent, or e.g. the chest for a shoulder) and maps
 * how far it has swung toward each authored pose onto that pose's corrective shape. Keys along one swing (elbow 90°,
 * then 145°) cross-fade, the way in-between shapes do in film rigs. Twist drivers roll a twist joint by a share of
 * a neighbour's roll about the limb (swing–twist split).
 */
import * as THREE from 'three/webgpu';

export interface MorphDriverSpec {
  bone: string;
  /** Reference bone whose frame the direction is read in (rest orientation identity in the Forge's rigs). */
  space: string;
  /** The bone's rest child direction (unit, rest space). */
  rest: [number, number, number];
  /** Poses along one swing, nearest first: target direction and the morph it drives. */
  keys: { dir: [number, number, number]; morph: string }[];
}
export interface TwistDriverSpec { bone: string; driver: string; share: number; axis: [number, number, number] }

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

interface Bound { spec: MorphDriverSpec; bone: THREE.Object3D; space: THREE.Object3D; rest: THREE.Vector3; keys: { dir: THREE.Vector3; angle: number; targets: { mesh: THREE.Mesh; i: number }[] }[] }

export class MorphDrivers {
  private drivers: Bound[] = [];
  private twists: { bone: THREE.Object3D; driver: THREE.Object3D; share: number; axis: THREE.Vector3; rest: THREE.Quaternion }[] = [];
  /** Current weights by morph name (debug HUD and tests). */
  readonly weights = new Map<string, number>();

  constructor(root: THREE.Object3D, drivers: MorphDriverSpec[], twists: TwistDriverSpec[] = []) {
    const byName = new Map<string, THREE.Object3D>();
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) byName.set(o.name, o);
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).morphTargetDictionary) meshes.push(o as THREE.Mesh);
    });
    for (const spec of drivers) {
      const bone = byName.get(spec.bone), space = byName.get(spec.space);
      if (!bone || !space) continue;
      const rest = new THREE.Vector3(...spec.rest).normalize();
      const keys = spec.keys.map((k) => {
        const dir = new THREE.Vector3(...k.dir).normalize();
        const targets = meshes.flatMap((mesh) => { const i = mesh.morphTargetDictionary![k.morph]; return i === undefined ? [] : [{ mesh, i }]; });
        return { dir, angle: rest.angleTo(dir), targets };
      }).filter((k) => k.targets.length);
      if (keys.length) this.drivers.push({ spec, bone, space, rest, keys });
    }
    for (const t of twists) {
      const bone = byName.get(t.bone), driver = byName.get(t.driver);
      if (bone && driver) this.twists.push({ bone, driver, share: t.share, axis: new THREE.Vector3(...t.axis).normalize(), rest: bone.quaternion.clone() });
    }
  }

  /** Twist joints follow this frame's pose (call before world matrices are updated). */
  updateTwists() {
    for (const t of this.twists) {
      // swing–twist: the driver's local rotation's component about the limb axis
      const q = t.driver.quaternion;
      const p = t.axis.dot(_a.set(q.x, q.y, q.z));
      _qs.set(t.axis.x * p, t.axis.y * p, t.axis.z * p, q.w).normalize();
      _q.identity().slerp(_qs, Math.abs(t.share));
      if (t.share < 0) _q.invert();
      t.bone.quaternion.copy(t.rest).multiply(_q);
    }
  }

  /** Corrective weights from this frame's world matrices (call after they are updated). */
  update() {
    for (const d of this.drivers) {
      // current child direction in the reference space
      d.space.matrixWorld.decompose(_p, _qs, _s);
      d.bone.matrixWorld.decompose(_p, _q, _s);
      _d.copy(d.rest).applyQuaternion(_qs.invert().multiply(_q));
      const angle = d.rest.angleTo(_d);
      // how much of this swing is in the authored plane
      _a.crossVectors(d.rest, _d);
      const la = _a.length();
      let w = new Array(d.keys.length).fill(0);
      if (la > 1e-4) {
        _a.divideScalar(la);
        _b.crossVectors(d.rest, d.keys[d.keys.length - 1].dir).normalize();
        const inPlane = Math.max(0, _a.dot(_b));
        const keys = d.keys;
        // piecewise linear over the key angles: 0 → k0 rises, k0 → k1 cross-fades, past the last holds
        for (let i = 0; i < keys.length; i++) {
          const a0 = i ? keys[i - 1].angle : 0, a1 = keys[i].angle, a2 = i + 1 < keys.length ? keys[i + 1].angle : Infinity;
          let v = 0;
          if (angle <= a0) v = 0;
          else if (angle <= a1) v = (angle - a0) / Math.max(1e-4, a1 - a0);
          else v = a2 === Infinity ? 1 : Math.max(0, 1 - (angle - a1) / Math.max(1e-4, a2 - a1));
          w[i] = v * inPlane;
        }
      } else w = w.map(() => 0);
      d.keys.forEach((k, i) => {
        for (const t of k.targets) t.mesh.morphTargetInfluences![t.i] = w[i];
        this.weights.set(k.targets.length ? (d.spec.keys[i].morph) : '', w[i]);
      });
    }
  }
}
