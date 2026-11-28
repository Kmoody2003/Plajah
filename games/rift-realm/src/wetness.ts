// Wet forest: Kenne (2026-11-22) "everything looks dry in the game". After a level is built, every opaque lit surface
// (ground, rock, bark, moss, leaves, structures) gets a moisture layer in its material: damp everywhere, wet patches
// that wander through the world (noise in world space), and flat ground holding the most water — wet reads darker and
// glossier, so the light catches it. Water, glowing / additive / transparent things, characters and fungi (they have
// their own slime) are left alone.
import * as THREE from 'three/webgpu';
import { float, materialColor, materialRoughness, mix, mx_noise_float, normalWorld, positionWorld, smoothstep, texture, uniform, vec2 } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const done = new WeakSet<THREE.Material>();
const SKIP = /water|river|lake|pond|fall|fung|spore|sky|cloud|glow|beam|flash|ring|hud|reticle|particle/i;

export interface WetOptions {
  /** Overall moisture 0…1 (default 0.55: a damp night forest after rain). */
  amount?: number;
}

// ── the wet shoreline: banks, rocks and roots by the water are soaked (darker and glossier), up to ~1 m above it.
// A level with water hands over a field (world/water.ts): r = closeness to the water's edge (1 at it, 0 beyond ~5 m),
// g = the water's surface height there, over the world square [x0, z0, size]. Without one the term is zero. ──
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
const shoreTex: N = texture(blank);
const shoreBox: N = uniform(new THREE.Vector4(0, 0, 1, 0));   // x0, z0, size, on (0/1)
/** Give the wet layer a shoreline field (see above). Materials made before or after this call pick it up. */
export function setShoreField(tex: THREE.Texture, x0: number, z0: number, size: number) {
  shoreTex.value = tex;
  shoreBox.value.set(x0, z0, size, 1);
  (globalThis as unknown as { __shore?: (on: boolean) => void }).__shore = (on) => { shoreBox.value.w = on ? 1 : 0; };   // debug
}
function shoreWet(): N {
  const s: N = shoreTex.sample(vec2(positionWorld.x.sub(shoreBox.x), positionWorld.z.sub(shoreBox.y)).div(shoreBox.z));
  return s.r.mul(float(1).sub(smoothstep(float(0.05), float(0.8), positionWorld.y.sub(s.g)))).mul(shoreBox.w);
}

function wetAndPool(amount: number): { wet: N; pool: N } {
  const p: N = positionWorld;
  // Shared world-space noise (2 simplex evaluations total instead of 4: halves WGSL compile time & GPU ALU cost)
  const big: N = mx_noise_float(p.mul(0.045)).mul(0.5).add(0.5);
  const fine: N = mx_noise_float(p.mul(0.36).add(17.3)).mul(0.5).add(0.5);
  // soft, large wet patches + flat ground holding moisture
  const zones: N = smoothstep(float(0.3), float(0.85), big.mul(0.82).add(fine.mul(0.18)));
  const up: N = smoothstep(float(0.55), float(0.95), normalWorld.y);
  const wet: N = float(amount * 0.45).add(zones.mul(amount * 0.55)).add(up.mul(zones).mul(0.2)).min(1);
  // standing water: rare puddles only on flat hollows where the big wet zone peaks
  const flat: N = smoothstep(float(0.9), float(0.985), normalWorld.y);
  const pool: N = smoothstep(float(0.74), float(0.86), big.mul(0.7).add(fine.mul(0.3))).mul(flat);
  return { wet, pool };
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
      const { wet, pool } = wetAndPool(amount);
      const col: N = m.colorNode ?? materialColor;
      const rough: N = m.roughnessNode ?? materialRoughness;
      // soaked banks by the water: much darker, a satin sheen (not a mirror: flat banks at roughness 0.06 turned white
      // under the day sky)
      const shore: N = shoreWet();
      m.colorNode = col.mul(float(1).sub(wet.mul(0.2)).sub(shore.mul(0.32)).sub(pool.mul(0.25)));       // wet darkens
      // damp is a satin sheen (never under 0.3: at 0.14 every flagstone mirrored the sky); only the pools are glossy
      const damp: N = mix(rough, rough.mul(0.6).max(0.3), wet);
      m.roughnessNode = mix(mix(damp, rough.min(0.38), shore.mul(0.75)), float(0.07), pool.mul(0.9));
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}
