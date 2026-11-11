// The night's weather. Clear at first; 60 s in, a storm rolls in over ~90 s: the cloud deck
// thickens and races, wind rises, rain sheets in on the wind, and lightning strikes with its
// thunder arriving at the speed of sound (≈343 m/s) — close strikes crack, far ones rumble.
// Rain is one instanced draw positioned entirely on the GPU around the camera.
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, uniform, instanceIndex, hash, time, cameraPosition, positionLocal, normalize, cross, mod, fract } from 'three/tsl';
import { Particles } from './vfx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface WeatherHooks {
  /** Sky uniforms (sky.ts). */
  sky: { uStorm: { value: number }; uFlash: { value: number } };
  /** Lights a flash brightens (moon key + fill), with their resting intensities. */
  flashLights: { light: THREE.Light; base: number }[];
  thunder(distance: number, indoors: boolean): void;
  setStorm(s: number): void;
  indoors(): boolean;
  /** Scene the rain/bolts/splashes belong to right now (outside only). */
  scene(): THREE.Scene | null;
  ground(x: number, z: number, y: number): number | null;
}

const STORM_START = 60, STORM_RAMP = 90;
const BOX = new THREE.Vector3(36, 22, 36);

export class Weather {
  /** 0 clear … 1 full storm. */
  storm = 0;
  /** Extra intensity forced by the nightmare (boss fight). */
  force = 0;
  /** The curse lifted: the storm dies away and does not come back. */
  calm = false;
  flash = 0;
  private t = 0;
  private nextStrike = 0;
  private strikes: { at: number; dist: number; done: boolean }[] = [];
  private flashT = -1; private flashPulses: number[] = [];
  private rain: THREE.InstancedMesh;
  private uRain = uniform(0);
  private uWind: N = uniform(new THREE.Vector3());
  private uFlashRain = uniform(0);
  private bolt: THREE.Mesh | null = null;
  private boltT = 0;
  private splash = new Particles(400, false);
  private rainGroup = new THREE.Group();
  wind = new THREE.Vector3();

  constructor(private h: WeatherHooks, count: number) {
    this.rainGroup.userData.dynamic = true;
    // Rain streak: a thin quad oriented along its fall velocity, facing the camera.
    const geo = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const speed = float(14);
    m.positionNode = Fn(() => {
      const i = float(instanceIndex as N) as N;
      const seed = vec3(hash(i), hash(i.add(17.3)), hash(i.add(41.7))) as N;
      const box = vec3(BOX.x, BOX.y, BOX.z) as N;
      const fall = vec3(this.uWind.x, speed.negate(), this.uWind.z) as N;
      // World-stable drops wrapped into a box that travels with the camera.
      const p = seed.mul(box).add(fall.mul((time as N).mul(float(0.9).add(seed.x.mul(0.2)))));
      const rel = mod(p.sub(cameraPosition as N).add(box.mul(0.5)), box).sub(box.mul(0.5));
      const world = (cameraPosition as N).add(rel);
      const along = normalize(fall);
      const side = (normalize as N)((cross as N)(along, (normalize as N)(world.sub(cameraPosition as N))));
      const lp = positionLocal as N;
      return world.add(side.mul(lp.x.mul(0.012))).add(along.mul(lp.y.mul(float(0.45).add(seed.z.mul(0.25)))));
    })();
    const fadeNear = Fn(() => fract(hash(float(instanceIndex as N).add(3.1)) as N).mul(0.5).add(0.5))();
    m.colorNode = (vec3(0.55, 0.62, 0.75) as N).mul((this.uRain as N).mul(0.35).mul(fadeNear as N).mul((this.uFlashRain as N).mul(5).add(1)));
    this.rain = new THREE.InstancedMesh(geo, m, count);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rainGroup.add(this.rain, this.splash.mesh);
  }

  /** Called every frame (simulation time). `cam` for splashes. */
  update(dt: number, cam: THREE.Camera, player: THREE.Vector3, bossFight: boolean) {
    this.t += dt;
    const natural = THREE.MathUtils.smoothstep(this.t, STORM_START, STORM_START + STORM_RAMP);
    this.storm = this.calm ? Math.max(0, this.storm - dt / 10) : Math.max(natural, this.force);
    const s = this.storm;
    const g = 0.5 + 0.5 * Math.sin(this.t * 0.23) * Math.sin(this.t * 0.071 + 2);
    this.wind.set(2 + 6 * s * g, 0, 1 + 3 * s * g);
    this.uWind.value.copy(this.wind);
    this.h.sky.uStorm.value = s;
    this.h.setStorm(s);

    const sc = this.h.scene();
    if (sc && this.rainGroup.parent !== sc) sc.add(this.rainGroup);
    if (!sc && this.rainGroup.parent) this.rainGroup.removeFromParent();
    const rainAmt = THREE.MathUtils.smoothstep(s, 0.25, 0.85);
    this.uRain.value = rainAmt;
    this.rain.visible = !!sc && rainAmt > 0.01;
    this.rain.count = Math.max(1, Math.round(this.rain.instanceMatrix.count * rainAmt));
    // Splashes on the ground around the player.
    if (sc && rainAmt > 0.05) {
      const n = Math.floor(rainAmt * 90 * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const x = player.x + (Math.random() - 0.5) * 18, z = player.z + (Math.random() - 0.5) * 18;
        const gy = this.h.ground(x, z, player.y + 4);
        if (gy === null) continue;
        for (let k = 0; k < 3; k++) this.splash.emit({ pos: new THREE.Vector3(x, gy + 0.02, z), vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8), color: new THREE.Color(0.55, 0.6, 0.7), size: 0.025, life: 0.22, gravity: 9 });
      }
    }
    this.splash.update(dt, cam);

    // Lightning: rare in a building storm, frequent in a full one, near and violent in the fight.
    if (s > 0.35 && this.t >= this.nextStrike) {
      this.nextStrike = this.t + (bossFight ? 3 + Math.random() * 6 : (12 + Math.random() * 25) / s);
      this.strike(bossFight ? 35 + Math.random() * 90 : 150 + Math.random() * 600, player);
    }
    // Thunder arrives later, by distance.
    for (const st of this.strikes) if (!st.done && this.t >= st.at) { st.done = true; this.h.thunder(st.dist, this.h.indoors()); }
    this.strikes = this.strikes.filter((x) => !x.done);

    // Flash: a few fast pulses, decaying.
    let f = 0;
    if (this.flashT >= 0) {
      this.flashT += dt;
      for (const p of this.flashPulses) { const d = this.flashT - p; if (d >= 0) f = Math.max(f, Math.exp(-d * 22) * (d < 0.03 ? 1 : 0.85)); }
      if (this.flashT > 1) this.flashT = -1;
    }
    this.flash = f;
    this.h.sky.uFlash.value = f;
    this.uFlashRain.value = f;
    for (const { light, base } of this.h.flashLights) light.intensity = base + f * 9 * (this.h.indoors() ? 0.25 : 1);
    if (this.bolt) {
      this.boltT += dt;
      (this.bolt.material as THREE.MeshBasicNodeMaterial).opacity = f;
      if (this.boltT > 0.6) { this.bolt.removeFromParent(); this.bolt.geometry.dispose(); this.bolt = null; }
    }
  }

  /** A strike `dist` metres away (forced near the player when given). */
  strike(dist: number, player: THREE.Vector3) {
    this.flashT = 0;
    this.flashPulses = [0, 0.07 + Math.random() * 0.05, 0.18 + Math.random() * 0.1].slice(0, 2 + (Math.random() < 0.6 ? 1 : 0));
    this.strikes.push({ at: this.t + dist / 343, dist, done: false });
    const sc = this.h.scene();
    if (!sc) return;
    const a = Math.random() * Math.PI * 2;
    const ground = new THREE.Vector3(player.x + Math.cos(a) * dist, player.y - 5, player.z + Math.sin(a) * dist);
    this.bolt?.removeFromParent();
    this.bolt = boltMesh(ground, 160 + Math.random() * 80);
    this.boltT = 0;
    sc.add(this.bolt);
  }
}

/** A jagged, branching bolt from the cloud base down to `ground`, as camera-agnostic ribbons. */
function boltMesh(ground: THREE.Vector3, height: number): THREE.Mesh {
  const pos: number[] = [], idx: number[] = [];
  const seg = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    // Two crossed quads so it reads from any side.
    for (const off of [new THREE.Vector3(w, 0, 0), new THREE.Vector3(0, 0, w)]) {
      const n = pos.length / 3;
      pos.push(a.x - off.x, a.y, a.z - off.z, a.x + off.x, a.y, a.z + off.z, b.x - off.x, b.y, b.z - off.z, b.x + off.x, b.y, b.z + off.z);
      idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
    }
  };
  const walk = (from: THREE.Vector3, to: THREE.Vector3, w: number, depth: number) => {
    let p = from.clone();
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const q = from.clone().lerp(to, t).add(new THREE.Vector3((Math.random() - 0.5) * 18 * (1 - t * 0.5), 0, (Math.random() - 0.5) * 18 * (1 - t * 0.5)));
      if (i === steps) q.copy(to);
      seg(p, q, w * (1 - t * 0.6));
      if (depth < 2 && Math.random() < 0.18) {
        const end = q.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, -(30 + Math.random() * 50), (Math.random() - 0.5) * 60));
        walk(q, end, w * 0.5, depth + 1);
      }
      p = q;
    }
  };
  walk(ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, height, (Math.random() - 0.5) * 40)), ground, 0.9, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(14), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.userData.dynamic = true;
  return mesh;
}
