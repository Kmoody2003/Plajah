// Gorge mist: slow-drifting sheets of moonlit vapour lying thick over the moat far below the bridge
// (nobody stands in them). Ground fog where people walk is fog.ts's drifting puffs.
import * as THREE from 'three/webgpu';
import { positionWorld, cameraPosition, mx_fractal_noise_float, vec2, vec3, float, smoothstep, time, uniform } from 'three/tsl';
import type { ArrivalWorld } from './arrival';

/** Overall mist density (daybreak can thin it). */
export const mistAmount = uniform(1);

function mistMaterial(strength: number, scale: number, drift: [number, number], tint: number) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const p = positionWorld.xz;
  const n = mx_fractal_noise_float(vec3(p.mul(scale).add(vec2(drift[0], drift[1]).mul(time)), time.mul(0.025)), 4, 2, 0.5, 1).mul(0.5).add(0.5);
  const wisps = smoothstep(float(0.35), float(0.85), n);
  const d = positionWorld.distance(cameraPosition);
  const near = smoothstep(float(1.5), float(9), d);
  const far = smoothstep(float(320), float(140), d);
  m.colorNode = vec3(new THREE.Color(tint).r, new THREE.Color(tint).g, new THREE.Color(tint).b);
  m.opacityNode = wisps.mul(near).mul(far).mul(strength).mul(mistAmount);
  m.fog = true;
  return m;
}

export function buildMist(world: ArrivalWorld, layers: number) {
  const group = new THREE.Group();
  group.name = 'mist';
  const R = world.road, B = world.bridge;
  const add = (w: number, l: number, at: THREE.Vector3, yaw: number, mat: THREE.Material) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, l, 1, 1), mat);
    plane.rotation.set(-Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.position.copy(at); holder.rotation.y = yaw;
    holder.add(plane);
    plane.renderOrder = 5;
    plane.frustumCulled = false;
    group.add(holder);
  };
  // The road's valley and the bridge deck get drifting fog puffs instead (fog.ts): a flat sheet at
  // ankle height sliced through anyone standing in it.
  void R;
  // The gorge under the bridge: thick, slow mist over the moat.
  const gm = B.start.clone().addScaledVector(B.dir, B.len / 2);
  add(700, 700, gm.clone().setY(B.waterY + 1.4), 0, mistMaterial(0.5, 0.02, [0.12, 0.05], 0x5e6878));
  if (layers > 1) add(700, 700, gm.clone().setY(B.waterY + 4.5), 0, mistMaterial(0.26, 0.014, [0.08, -0.04], 0x6c7686));
  return group;
}
