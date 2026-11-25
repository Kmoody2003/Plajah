// Lexicon sky (realism foundation, docs/lexicon-visual-identity.md §3): a physical sky (three's SkyMesh, Preetham
// scattering with its own clouds and sun disc — the clouds Kenne preferred in Rift Realm), image-based light baked from
// that same sky (PMREM, rebaked as the sun moves), and aerial-perspective haze: distance fog whose colour is the sky's
// horizon, warmed toward the sun and amber at golden hour. After sunset the sun light becomes the moon.
import * as THREE from 'three/webgpu';
import { cameraPosition, densityFogFactor, dot, float, fog, max, mix, normalize, positionWorld, pow, uniform } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface LexSky {
  /** tod: 0 midnight · 0.25 sunrise · 0.5 noon · 0.75 sunset. */
  update(tod: number, player: THREE.Vector3): void;
  setActive(on: boolean): void;
  readonly sunDir: THREE.Vector3;
  /** 0 night … 1 full day (for things lit by the sky, e.g. the manuscript's paper). */
  readonly light: number;
}

const C = (h: number) => new THREE.Color(h);
const HAZE_DAY = C(0xb4b38e), HAZE_GOLD = C(0xd0a47c), HAZE_NIGHT = C(0x232c44); // warm olive mist like the hollow's air
const GLOW_DAY = C(0xfff0c8), GLOW_GOLD = C(0xffa860);
const SUN_DAY = C(0xffe6bf), SUN_GOLD = C(0xff9a55), MOON = C(0xa8b8ff);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createLexSky(scene: THREE.Scene, renderer: THREE.WebGPURenderer, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, stars: THREE.Points, o: { lo: boolean }): LexSky {
  const sky = new SkyMesh();
  sky.scale.setScalar(450000); sky.frustumCulled = false; sky.renderOrder = -10;
  (sky.material as unknown as { fog: boolean }).fog = false;
  sky.turbidity.value = 3.0; sky.rayleigh.value = 1.2; sky.mieCoefficient.value = 0.005; sky.mieDirectionalG.value = 0.85;
  sky.cloudCoverage.value = 0.42; sky.cloudDensity.value = 0.45;
  scene.add(sky);

  // the light the world is lit by is the same sky, without its clouds' noise or the sun disc
  const envSky = new SkyMesh();
  envSky.scale.setScalar(1000);
  envSky.turbidity.value = 3.0; envSky.rayleigh.value = 1.2; envSky.mieCoefficient.value = 0.005; envSky.mieDirectionalG.value = 0.85;
  envSky.cloudCoverage.value = 0; envSky.showSunDisc.value = 0;
  const envScene = new THREE.Scene(); envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.RenderTarget | null = null;
  const bakedDir = new THREE.Vector3(0, -1, 0);

  // aerial perspective: fog coloured by the horizon, brighter toward the sun
  const uHaze = uniform(HAZE_DAY.clone()), uGlow = uniform(GLOW_DAY.clone()), uSun = uniform(new THREE.Vector3(0, 1, 0)), uDensity = uniform(0.0085);
  const view: N = normalize(positionWorld.sub(cameraPosition));
  const toward: N = pow(max(dot(view, uSun), float(0)), float(8));
  const fogNode: N = fog(mix(uHaze, uGlow, toward.mul(0.75)), densityFogFactor(uDensity));
  let active = true;

  const sunDir = new THREE.Vector3();
  const c = new THREE.Color();

  let light = 1;
  const api: LexSky = {
    sunDir,
    get light() { return light; },
    setActive(on) {
      active = on;
      sky.visible = on; stars.visible = on;
      if (on) { (scene as unknown as { fogNode: N }).fogNode = fogNode; scene.fog = null; scene.environment = envRT?.texture ?? null; scene.background = null; }
      else { (scene as unknown as { fogNode: N }).fogNode = null; scene.environment = null; }
    },
    update(tod, player) {
      if (!active) return;
      // the sun's path: rises in the east (+x), noon high in the south-ish (+z bias so it rakes across the village)
      const ang = (tod - 0.25) * Math.PI * 2, el = Math.sin(ang);
      sunDir.set(Math.cos(ang) * 0.8, el, 0.45).normalize();
      sky.sunPosition.value.copy(sunDir); envSky.sunPosition.value.copy(sunDir);
      const day = smooth(-0.12, 0.2, el), gold = Math.max(0, 1 - Math.abs(el) * 3.2) * day;
      const moon = el < -0.05;
      light = day;

      // light: sun by day, moon by night (same light, flipped), shadow camera rides with the player
      const L = moon ? sunDir.clone().negate().setY(Math.max(0.35, -sunDir.y)).normalize() : sunDir;
      sun.position.copy(player).addScaledVector(L, 150); sun.target.position.copy(player); sun.target.updateMatrixWorld();
      sun.intensity = moon ? 0.9 : 0.05 + smooth(-0.02, 0.25, el) * 3.6;
      sun.color.copy(moon ? MOON : c.copy(SUN_DAY).lerp(SUN_GOLD, gold));
      hemi.intensity = 0.32 + day * 0.3;
      hemi.color.set(day > 0.5 ? 0xc9d6e4 : 0x6a78b0); hemi.groundColor.set(0x3a3a22);
      // the Preetham sky is HDR-bright: as image light it only fills (Rift Realm runs ~0.12 by day); the sun does the lighting
      scene.environmentIntensity = 0.05 + day * 0.1;
      (stars.material as THREE.PointsMaterial).opacity = 1 - day;
      stars.position.set(player.x, 0, player.z);

      uSun.value.copy(sunDir);
      uHaze.value.copy(HAZE_NIGHT).lerp(c.copy(HAZE_DAY).lerp(HAZE_GOLD, gold), day);
      uGlow.value.copy(GLOW_DAY).lerp(GLOW_GOLD, gold).multiplyScalar(day);
      uDensity.value = 0.0042 + gold * 0.003 + (1 - day) * 0.003;

      // re-bake the sky light when the sun has moved enough to see (about 2°) — always into the SAME render target:
      // a new environment texture makes every material that reads it rebuild its pipeline (1–2 s stalls on the iGPU
      // with the vegetation shaders)
      if (bakedDir.dot(sunDir) < 0.9994) {
        bakedDir.copy(sunDir);
        const rt = pmrem.fromScene(envScene as unknown as THREE.Scene, 0, 0.1, 2000, envRT ? { renderTarget: envRT } : {});
        if (rt !== envRT) { envRT = rt; scene.environment = rt.texture; }
      }
    },
  };
  void o;
  api.setActive(true);
  return api;
}
