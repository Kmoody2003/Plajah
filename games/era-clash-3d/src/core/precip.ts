// Rain and snow round the camera (core/climate.ts says how much). Each is one instanced draw placed entirely on the
// GPU: world-fixed drops and flakes falling through a box that travels with the camera (wrapped, so nothing pops),
// blown by the wind. Rain is thin streaks along their fall, faint (as rain really reads); snow is soft flakes that
// drift and wander. Rain spatters the ground round the player.
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec2, uniform, instanceIndex, hash, time, cameraPosition, positionLocal, positionWorld, normalize, cross, mod, sin, uv, length, smoothstep } from 'three/tsl';
import { Particles } from './vfx';
import { wind } from './wind';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const RAIN_BOX = new THREE.Vector3(34, 20, 34), SNOW_BOX = new THREE.Vector3(30, 16, 30);

function fallMesh(count: number, box: THREE.Vector3, o: { speed: number; amount: N; streak: boolean; wind: N }) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const nz: N = normalize, cr: N = cross;
  m.positionNode = Fn(() => {
    const i = float(instanceIndex as N) as N;
    const seed = vec3(hash(i), hash(i.add(17.3)), hash(i.add(41.7))) as N;
    const b = vec3(box.x, box.y, box.z) as N;
    const sp = float(o.speed).mul(float(0.85).add(seed.y.mul(0.3)));
    // snow wanders: a slow sideways swirl per flake
    const wander: N = o.streak ? vec3(0, 0, 0) : vec3(sin(time.mul(0.9).add(seed.x.mul(40))).mul(0.6), 0, sin(time.mul(0.7).add(seed.z.mul(40))).mul(0.6));
    const fall = vec3(o.wind.x, sp.negate(), o.wind.y) as N;
    const p = seed.mul(b).add(fall.mul(time)).add(wander);
    const rel = mod(p.sub(cameraPosition as N).add(b.mul(0.5)), b).sub(b.mul(0.5));
    const world = (cameraPosition as N).add(rel);
    const lp = positionLocal as N;
    if (o.streak) {
      const along = nz(fall);
      const side = nz(cr(along, nz(world.sub(cameraPosition as N))));
      return world.add(side.mul(lp.x.mul(0.011))).add(along.mul(lp.y.mul(float(0.5).add(seed.z.mul(0.3)))));
    }
    // a flake faces the camera
    const toCam = nz((cameraPosition as N).sub(world));
    const right = nz(cr(vec3(0, 1, 0), toCam)), up = cr(toCam, right);
    const s = float(0.035).add(seed.z.mul(0.035));
    return world.add(right.mul(lp.x.mul(s))).add(up.mul(lp.y.mul(s)));
  })();
  const near: N = Fn(() => hash(float(instanceIndex as N).add(3.1)).mul(0.5).add(0.5))();
  if (o.streak) {
    m.colorNode = vec3(0.72, 0.76, 0.82);
    // a drop right at the eye would draw as a broad bar: they thin out inside the first couple of metres
    m.opacityNode = (o.amount as N).mul(0.28).mul(near).mul(smoothstep(1.2, 3.5, length(positionWorld.sub(cameraPosition as N))));
  } else {
    const r: N = length(uv().sub(vec2(0.5, 0.5)));
    m.colorNode = vec3(0.96, 0.97, 1.0);
    m.opacityNode = smoothstep(0.5, 0.15, r).mul(o.amount).mul(0.9).mul(near);
  }
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 4;
  return mesh;
}

export class Precip {
  readonly group = new THREE.Group();
  private rainAmt = uniform(0); private snowAmt = uniform(0);
  private windU = uniform(new THREE.Vector2());
  private rain: THREE.InstancedMesh; private snow: THREE.InstancedMesh;
  private splash = new Particles(500, false);

  constructor(rainCount = 9000, snowCount = 6000) {
    this.group.name = 'precip';
    this.rain = fallMesh(rainCount, RAIN_BOX, { speed: 13, amount: this.rainAmt, streak: true, wind: this.windU });
    this.snow = fallMesh(snowCount, SNOW_BOX, { speed: 1.3, amount: this.snowAmt, streak: false, wind: this.windU });
    this.group.add(this.rain, this.snow, this.splash.mesh);
  }

  /** `rain`, `snow` 0…1; `ground(x, z)` the height there (or null: water, roofs); `outdoors` false under a roof. */
  update(dt: number, cam: THREE.Camera, at: THREE.Vector3, rain: number, snow: number, ground: (x: number, z: number) => number | null) {
    // the wind leans the fall (core/wind.ts direction, stronger in a storm)
    const w = wind.dir.value as THREE.Vector2, k = 1 + 3 * (wind.strength.value as number);
    this.windU.value.set(w.x * k, w.y * k);
    this.rainAmt.value = rain; this.snowAmt.value = snow;
    this.rain.visible = rain > 0.01; this.snow.visible = snow > 0.01;
    this.rain.count = Math.max(1, Math.round(this.rain.instanceMatrix.count * Math.min(1, rain * 1.2)));
    this.snow.count = Math.max(1, Math.round(this.snow.instanceMatrix.count * Math.min(1, snow * 1.2)));
    // drops spatter on the ground round the player
    if (rain > 0.05) {
      const n = Math.floor(rain * 110 * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const x = at.x + (Math.random() - 0.5) * 16, z = at.z + (Math.random() - 0.5) * 16;
        const gy = ground(x, z);
        if (gy === null) continue;
        for (let j = 0; j < 2; j++) this.splash.emit({ pos: new THREE.Vector3(x, gy + 0.02, z), vel: new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.7 + Math.random() * 0.7, (Math.random() - 0.5) * 0.7), color: new THREE.Color(0.62, 0.66, 0.72), size: 0.022, life: 0.2, gravity: 9 });
      }
    }
    this.splash.update(dt, cam);
  }
}
