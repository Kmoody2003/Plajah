// Ground fog as drifting puffs, not sheets. Each puff is a soft, noise-eroded billboard turned to
// the camera (around the vertical, so it never tilts), fading out at its base and near the eye.
// Because every puff faces you, nothing standing in the fog is sliced by a flat plane: legs vanish
// gradually into vapour. The puffs drift with a slow wind and wrap around their home patch.
// One instanced draw; matrices are rewritten each frame (a few hundred).
import * as THREE from 'three/webgpu';
import { cameraPosition, float, instanceIndex, mx_fractal_noise_float, positionWorld, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import type { ArrivalWorld } from './arrival';
import { mistAmount } from './mist';
import { rng } from './kit';

interface Puff { home: THREE.Vector3; size: number; h: number; drift: number; phase: number }

export class GroundFog {
  readonly mesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private t = 0;

  constructor(world: ArrivalWorld, count = 260) {
    const R = world.road, B = world.bridge, rnd = rng(9090);
    // Along the road's valley (lanes, verges, the first rows of trees) …
    for (let i = 0; i < count * 0.72; i++) {
      const u = R.uL - 14 + rnd() * (R.uR - R.uL + 26), v = R.vStart - 4 + rnd() * (-R.vStart + 30);
      this.puffs.push({ home: R.fromLocal(u, v, R.heightAt(u, v)), size: 5 + rnd() * 6, h: 1.6 + rnd() * 1.4, drift: 0.25 + rnd() * 0.35, phase: rnd() * 100 });
    }
    // … and creeping across the bridge deck and spilling over its balustrades.
    for (let i = 0; i < count * 0.28; i++) {
      const along = rnd() * B.len, across = (rnd() - 0.5) * (B.width + 8);
      const p = B.start.clone().addScaledVector(B.dir, along).addScaledVector(B.right, across).setY(B.deckY);
      this.puffs.push({ home: p, size: 4 + rnd() * 5, h: 1.3 + rnd() * 1.2, drift: 0.3 + rnd() * 0.4, phase: rnd() * 100 });
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);                       // base at the ground
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const seed = float(instanceIndex).mul(7.31);
    const u = uv();
    // Soft blob (wider than tall), eroded by drifting noise into wisps.
    const c = u.sub(vec2(0.5, 0.42)).mul(vec2(2.0, 2.4));
    const blob = smoothstep(float(1.0), float(0.15), c.length());
    const n = mx_fractal_noise_float(vec3(u.mul(vec2(2.2, 1.6)).add(vec2(time.mul(0.03), 0)), seed.add(time.mul(0.04))), 3, 2, 0.5, 1).mul(0.5).add(0.5);
    const wisps = smoothstep(float(0.32), float(0.8), n);
    const base = smoothstep(float(0.0), float(0.28), u.y);                       // no hard line where it meets the ground
    const dist = positionWorld.distance(cameraPosition);
    const near = smoothstep(float(1.2), float(6.5), dist);   // walk through, not into
    // Beyond ~30 m the puffs would read as discrete grey blobs on wide shots: they melt into the
    // scene fog instead, which carries the haze at range.
    const far = smoothstep(float(42), float(22), dist);
    m.colorNode = vec3(0.47, 0.52, 0.6);
    m.opacityNode = blob.mul(wisps).mul(base).mul(near).mul(far).mul(0.3).mul(mistAmount);
    this.mesh = new THREE.InstancedMesh(geo, m, this.puffs.length);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.dynamic = true;
  }

  update(dt: number, camera: THREE.Camera) {
    this.t += dt;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const wind = new THREE.Vector3(0.8, 0, 0.35).normalize();
    this.puffs.forEach((f, i) => {
      // A slow wander around home (bounded, so the fog stays where it pools).
      const w = this.t * f.drift + f.phase;
      p.copy(f.home).addScaledVector(wind, Math.sin(w * 0.11) * 6).add(new THREE.Vector3(Math.sin(w * 0.07 + 1.3) * 2.5, 0, Math.cos(w * 0.09) * 2.5));
      q.setFromAxisAngle(Y, Math.atan2(camera.position.x - p.x, camera.position.z - p.z));
      m.compose(p.setY(f.home.y - 0.15), q, s.set(f.size, f.h, 1));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
