// The country road's stones (harbour → Outer Wall): pebbles scattered across the travelled way and thick on the
// gravel shoulders, the odd fist- or head-sized rock at the verge where carts have shoved it. Placed once from the
// world's own seed (the same stones every visit), batched in 24 m chunks along the road and drawn only near the
// camera — at a few metres a pebble is a pixel.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, normalWorld, vec3, float, mix, smoothstep } from 'three/tsl';
import { groundWeather } from './ground';
import { pbr } from './core/materials';

export interface StoneEnv {
  heightAt(x: number, z: number): number;
  roadX(z: number): number;
  /** Keep off here (the river and its bridge, buildings). */
  skip(x: number, z: number): boolean;
}

const CHUNK = 24;

function hash(a: number, b: number) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }

/** A lumpy stone: an icosphere pushed in and out, squashed (stones lie flat). */
function stoneGeo(seed: number, detail: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.78 + 0.32 * hash(Math.round(v.x * 7) + seed, Math.round(v.y * 7) * 3 + Math.round(v.z * 7) * 7);
    p.setXYZ(i, v.x * k * 1.15, v.y * k * 0.55, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildRoadStones(env: StoneEnv, z0 = -458, z1 = -40) {
  const group = new THREE.Group(); group.name = 'roadStones';
  const R = pbr('rocks_ground_05');
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  // world-projected (no seams across thousands of tiny stones), each stone a slightly different grey-brown
  // wet stones go dark and glossy; snow settles on their tops
  const sc0 = texture(R.diff, positionWorld.xz.mul(1.3)).rgb.mul(vec3(1.05, 1.0, 0.92)).mul(float(1.05)).mul(float(1).sub(groundWeather.wet.mul(0.35)));
  mat.colorNode = mix(sc0, vec3(0.86, 0.88, 0.92), groundWeather.snow.mul(smoothstep(0.2, 0.7, normalWorld.y)));
  mat.roughnessNode = float(0.85).sub(groundWeather.wet.mul(0.5));
  const kinds = [
    { geo: stoneGeo(3, 0), size: [0.03, 0.075], show: 40 },     // pebbles
    { geo: stoneGeo(11, 1), size: [0.12, 0.34], show: 75 },     // rocks
  ];
  const chunks: { z: number; meshes: THREE.InstancedMesh[] }[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let total = 0;
  for (let cz = z0; cz < z1; cz += CHUNK) {
    const per: THREE.Matrix4[][] = [[], []];
    // pebbles: ~1 per m² on the way, ~3 on the shoulders; rocks along the verges
    for (let i = 0; i < CHUNK * 10 * 3.2; i++) {
      const z = cz + hash(i, cz) * CHUNK, rx = (hash(cz, i * 1.7) - 0.5) * 10;   // −5…5 m across the road
      const ar = Math.abs(rx);
      const dens = ar < 1.9 ? 0.3 : ar < 4.2 ? 1 : 0.25;
      if (hash(i * 3.1, cz + 9) > dens) continue;
      const x = env.roadX(z) + rx;
      if (env.skip(x, z)) continue;
      const k = hash(i, cz * 0.3) < 0.03 && ar > 2.6 ? 1 : 0;
      const [a, b] = kinds[k].size, sc = a + (b - a) * hash(i * 0.7, cz) ** 2;
      p.set(x, env.heightAt(x, z) + sc * (k ? 0.12 : 0.2), z);
      q.setFromEuler(e.set((hash(i, 5) - 0.5) * 0.4, hash(i, 7) * 6.28, (hash(i, 9) - 0.5) * 0.4));
      s.set(sc, sc, sc);
      per[k].push(new THREE.Matrix4().compose(p, q, s));
    }
    const meshes = per.map((ms, k) => {
      const im = new THREE.InstancedMesh(kinds[k].geo, mat, Math.max(1, ms.length));
      ms.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.count = ms.length; im.castShadow = k === 1; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.userData.show = kinds[k].show;
      group.add(im);
      total += ms.length;
      return im;
    });
    chunks.push({ z: cz + CHUNK / 2, meshes });
  }
  void m4;
  return {
    group, count: total,
    /** Show only the chunks near the camera. */
    update(cam: THREE.Vector3) {
      for (const c of chunks) {
        const d = Math.abs(c.z - cam.z);
        for (const m of c.meshes) m.visible = m.count > 0 && d < m.userData.show + CHUNK / 2;
      }
    },
  };
}
