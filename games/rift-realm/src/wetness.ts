// Wet forest: Kenne (2026-11-22) "everything looks dry in the game". After a level is built, every opaque lit surface
// (ground, rock, bark, moss, leaves, structures) gets a moisture layer in its material: damp everywhere, wet patches
// that wander through the world (noise in world space), and flat ground holding the most water — wet reads darker and
// glossier, so the light catches it. Water, glowing / additive / transparent things, characters and fungi (they have
// their own slime) are left alone.
import * as THREE from 'three/webgpu';
import { float, materialColor, materialRoughness, mix, mx_noise_float, normalWorld, positionWorld, smoothstep } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const done = new WeakSet<THREE.Material>();
const SKIP = /water|river|lake|pond|fall|fung|spore|sky|cloud|glow|beam|flash|ring|hud|reticle|particle/i;

export interface WetOptions {
  /** Overall moisture 0…1 (default 0.55: a damp night forest after rain). */
  amount?: number;
}

function wetMask(amount: number): N {
  const p: N = positionWorld;
  // big wandering wet zones + smaller blotches
  const big: N = mx_noise_float(p.mul(0.045)).mul(0.5).add(0.5);
  const small: N = mx_noise_float(p.mul(0.32).add(17.3)).mul(0.5).add(0.5);
  // soft, large patches (small hard-edged ones read as camouflage, especially through river water)
  const zones: N = smoothstep(float(0.3), float(0.85), big.mul(0.82).add(small.mul(0.18)));
  // flat ground holds water (puddle shine), walls and trunks stay damp
  const up: N = smoothstep(float(0.55), float(0.95), normalWorld.y);
  return float(amount * 0.45).add(zones.mul(amount * 0.55)).add(up.mul(zones).mul(0.35)).min(1);
}

/** Add the moisture layer to every eligible material under `root` (each material once). Returns how many. */
export function wetten(root: THREE.Object3D, o: WetOptions = {}): number {
  const amount = o.amount ?? 0.55;
  let n = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || (obj as THREE.SkinnedMesh).isSkinnedMesh || SKIP.test(obj.name)) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardNodeMaterial;
      if (!m || done.has(m) || !(m as N).isMeshStandardNodeMaterial) continue;
      done.add(m);
      if (m.transparent || m.blending !== THREE.NormalBlending || SKIP.test(m.name) || m.metalness > 0.6) continue;
      const wet: N = wetMask(amount);
      const col: N = m.colorNode ?? materialColor;
      const rough: N = m.roughnessNode ?? materialRoughness;
      m.colorNode = col.mul(float(1).sub(wet.mul(0.2)));                // wet darkens
      m.roughnessNode = mix(rough, rough.mul(0.22).max(0.06), wet);     // and shines
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}
