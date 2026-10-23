// Daybreak: Dracula falls and the curse lifts. Over ~15 s the storm dies, the clouds open on a
// clear blue morning, the moon gives way to a warm sun, haze replaces the murk, the black firs
// take back their green, and grass and wildflowers grow back across the valley in a ring
// spreading out from where he fell. Birds return.
import * as THREE from 'three/webgpu';

export interface DaybreakDeps {
  sky: { uDay: { value: number }; uSun: { value: THREE.Vector3 } };
  /** The shared light rig (nightmare.ts dims `base` from `base0`; we raise `base0` to daylight). */
  rig: { light: THREE.Light; base: number; base0: number }[];
  moon: THREE.DirectionalLight; hemi: THREE.HemisphereLight; sunTarget: THREE.Vector3;
  envScenes: { scene: THREE.Scene; base: number }[];
  fog: { color: { value: THREE.Color }; amount: { value: number } };
  firs: THREE.Material[];
  grass: { mesh: THREE.Object3D; uGrow: { value: number }; uCenter: { value: THREE.Vector2 } };
  setExposure(e: number): void;
  calmWeather(): void;
  dayAudio(k: number): void;
  /** Orbs fade to soft motes in daylight. */
  orbs(k: number): void;
}

const DUR = 15;

export class Daybreak {
  k = 0;
  private t = -1;
  private from = new Map<object, number>();
  private moonCol0 = new THREE.Color(); private hemiSky0 = new THREE.Color(); private hemiGround0 = new THREE.Color();
  private fog0 = new THREE.Color(); private fir0 = new Map<THREE.Material, THREE.Color>();
  private moonPos0 = new THREE.Vector3();

  constructor(private d: DaybreakDeps) {}

  /** Begin, centred on where the Count fell. */
  start(at: THREE.Vector3) {
    if (this.t >= 0) return;
    this.t = 0;
    const d = this.d;
    for (const r of d.rig) this.from.set(r, r.base0);
    d.envScenes.forEach((e) => this.from.set(e, e.base));
    this.moonCol0.copy(d.moon.color); this.moonPos0.copy(d.moon.position);
    this.hemiSky0.copy(d.hemi.color); this.hemiGround0.copy(d.hemi.groundColor);
    this.fog0.copy(d.fog.color.value);
    for (const m of d.firs) this.fir0.set(m, (m as THREE.MeshStandardMaterial).color.clone());
    d.grass.uCenter.value.set(at.x, at.z);
    d.grass.mesh.visible = true;
    d.calmWeather();
  }

  update(dt: number) {
    if (this.t < 0 || this.k >= 1) return;
    this.t += dt;
    const raw = Math.min(1, this.t / DUR);
    const k = (this.k = raw * raw * (3 - 2 * raw));
    const d = this.d;
    d.sky.uDay.value = k;
    // Sun: the key light swings from the moon's quarter up to a high morning sun, warm white.
    const sunDir = d.sky.uSun.value;
    d.moon.position.copy(this.moonPos0).lerp(d.sunTarget.clone().addScaledVector(sunDir, 300), k);
    d.moon.color.copy(this.moonCol0).lerp(new THREE.Color(0xfff0d2), k);
    const target: Record<string, number> = { 0: 3.4, 1: 0.9, 2: 1.5 };
    d.rig.forEach((r, i) => { if (target[i] !== undefined) r.base = r.base0 = THREE.MathUtils.lerp(this.from.get(r)!, target[i], k); });
    d.hemi.color.copy(this.hemiSky0).lerp(new THREE.Color(0xa8ccff), k);
    d.hemi.groundColor.copy(this.hemiGround0).lerp(new THREE.Color(0x4f5e2c), k);
    d.envScenes.forEach((e) => { e.base = THREE.MathUtils.lerp(this.from.get(e)!, 1.0, k); e.scene.environmentIntensity = e.base; });
    d.fog.color.value.copy(this.fog0).lerp(new THREE.Color(0xbfd2e6), k);
    d.fog.amount.value = THREE.MathUtils.lerp(1, 0.4, k);
    for (const [m, c0] of this.fir0) (m as THREE.MeshStandardMaterial).color.copy(c0).lerp(new THREE.Color(0x27402a), k);
    d.grass.uGrow.value = 170 * raw;
    d.setExposure(THREE.MathUtils.lerp(0.8, 0.92, k));
    d.dayAudio(k);
    d.orbs(1 - 0.8 * k);
  }
}
