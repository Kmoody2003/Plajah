/**
 * benchCloth.ts — times Haru v3's cloth and springs in Node, away from a browser tab's throttling.
 *
 *   npx tsx scripts/eraclash3d/benchCloth.ts [glb]
 *
 * Rebuilds the skeleton from the GLB's nodes (no meshes: anchors fall back to the rest pose, so this is the solve —
 * integration, constraints, collisions — not the mesh write) and swings the legs and arms so the cloth works.
 */
import fs from 'node:fs';
import * as THREE from 'three/webgpu';
import { ClothSim, type ClothSimSpec } from '../../playkit/character/clothSim';
import { SpringBones } from '../../playkit/character/springBones';

const file = process.argv[2] ?? 'public/games/era-clash/3d/assets/characters/samurai_v3.glb';
const buf = fs.readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const objs: THREE.Object3D[] = gltf.nodes.map((n: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[] }, i: number) => {
  const o = gltf.skins?.[0]?.joints.includes(i) ? new THREE.Bone() : new THREE.Object3D();
  o.name = n.name ?? `node${i}`;
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  return o;
});
gltf.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach((c) => objs[i].add(objs[c])));
const root = new THREE.Group();
for (const i of gltf.scenes[0].nodes) root.add(objs[i]);
let forge: { cloth: ClothSimSpec[]; springs: never[]; capsules: never[] } | undefined;
for (const n of gltf.nodes) if (n.extras?.forge) forge = n.extras.forge;
if (!forge) throw new Error('no extras.forge in ' + file);
root.updateMatrixWorld(true);
const cloth = new ClothSim(root, forge.cloth, forge.capsules);
const springs = new SpringBones(root, forge.springs, forge.capsules);
const bone = (n: string) => root.getObjectByName(n)!;
const legs = [bone('LeftUpLeg'), bone('RightUpLeg')], arms = [bone('LeftArm'), bone('RightArm')];
let t = 0;
const pose = () => {
  t += 1 / 60;
  legs.forEach((b, i) => b.rotation.x = Math.sin(t * 9 + i * Math.PI) * 0.7);
  arms.forEach((b, i) => b.rotation.z = Math.sin(t * 5 + i) * 0.5);
  root.position.z += 4 / 60;
  root.updateMatrixWorld(true);
};
cloth.reset(); springs.reset();
const time = (f: () => void, n: number) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
time(() => { pose(); cloth.update(1 / 60); springs.update(1 / 60); }, 600); // warm up
const poseMs = time(pose, 600);
const clothMs = time(() => { pose(); cloth.update(1 / 60); }, 600) - poseMs;
const springMs = time(() => { pose(); springs.update(1 / 60); }, 600) - poseMs;
// every particle finite, and none further from where the body puts it than its tether allows
const c = cloth as unknown as { x: Float32Array; anchor: Float32Array; maxD: Float32Array };
let finite = true, worst = 0;
for (let q = 0; q < cloth.particles; q++) {
  for (let k = 0; k < 3; k++) if (!Number.isFinite(c.x[q * 3 + k])) finite = false;
  const d = Math.hypot(c.x[q * 3] - c.anchor[q * 3], c.x[q * 3 + 1] - c.anchor[q * 3 + 1], c.x[q * 3 + 2] - c.anchor[q * 3 + 2]);
  worst = Math.max(worst, d - c.maxD[q]);
}
const ok = finite && worst < 1e-4;
console.log(JSON.stringify({ particles: cloth.particles, clothMs: +clothMs.toFixed(3), springMs: +springMs.toFixed(3), finite, tetherOverrun: +worst.toFixed(5), ok }));
if (!ok) process.exit(1);
