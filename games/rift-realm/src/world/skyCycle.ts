// Elderwood Wilds — time of day and weather.
//
// Time: one full turn of the sun every `cycleSeconds` (4 min by default): night → dawn → day → dusk → evening → night.
// The sun is the level's shadow-casting light (its shadow camera follows the player along the light direction); after
// sunset the same light becomes the moon on the other side of the sky. A physical sky (three's SkyMesh: Preetham
// scattering, clouds, the sun disc) fades in over the nebula night sky at dawn and out again after dusk; the haze blends
// from the night fog (coloured by the nebula environment) to a blue-green day haze that warms toward the sun, and to
// amber at golden hour. The post chain's godrays use the same light, so shafts follow the sun (and the moon).
//
// Weather: the six states of Apex's weather (games/forth-horizon/src/weather.ts: clear, partly cloudy, overcast, fog,
// rain, thunderstorm — each a set of multipliers on sun, sky light, haze, clouds, rain and wind), switched by a
// sporadic director: short spells, sudden squalls, fog banks rolling in, breaks of sun. Rain, splashes, lightning
// bolts and thunder that arrives by distance are Era Clash's Weather (games/era-clash-3d/src/core/weather.ts, WebGPU).
//
// ?time=day  — fixed daylight as the art shots are lit (no weather unless ?weather=…)
// ?time=night — fixed night (the level's own look)
// ?cycle=240 — seconds per day; ?weather=storm|rain|fog|overcast|partly|clear pins one, ?weather=off none
import * as THREE from 'three/webgpu';
import { cameraPosition, color, densityFogFactor, float, fog, max, mix, normalize, pmremTexture, positionWorld, uniform, vec3, vec4 } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WEATHERS, type WxParams } from '../../../forth-horizon/src/weather';
import { Weather } from '../../../era-clash-3d/src/core/weather';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type SkyMode = 'cycle' | 'day' | 'night';
export interface SkyCycleOptions {
  mode: SkyMode;
  /** Seconds for a whole day. */
  cycleSeconds: number;
  /** Where the clock starts, 0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  start: number;
  /** 'auto' (the sporadic director), 'off', or a pinned state from WEATHERS. */
  weather: string;
  lo: boolean;
  ground(x: number, z: number): number;
}
export interface SkyCycle {
  update(dt: number, view: THREE.Camera | null, player: THREE.Vector3): void;
  /** Wind strength for the vegetation (0.55 calm). */
  wind(): number;
  /** Debug/HUD: the clock (0…1) and the weather now. */
  state(): { time: number; weather: string; storm: number };
}

/** The sun of the fixed daylight (the art shots): 33° up, raking in between the trunks. */
export const DAY_SUN = new THREE.Vector3(0.6, 0.55, -0.58).normalize();

const C = (h: number) => new THREE.Color(h);
const NIGHT = { hemi: C(0x8c96e6), ground: C(0x1c3024), hemiI: 1.7, moon: C(0xcfe2ff), moonI: 3.0 };
const DAY = { hemi: C(0xd6e6dc), ground: C(0x33412d), hemiI: 2.7, sun: C(0xfff0d4), sunI: 5.2, haze: C(0xa4b8b4), glow: C(0xfff0cc), density: 0.0085, exposure: 1.2, env: 0.18 };
const GOLD = { hemi: C(0xe8b49a), sun: C(0xff9b55), haze: C(0x9c8c86), glow: C(0xffb070) };
const GREY = C(0x7f878a);
const NIGHT_DENSITY = 0.0032;

// how long each kind of spell lasts (s) and how likely it is next: short and changeable, storms can come out of nowhere
const SPELL: Record<string, [number, number]> = { clear: [15, 50], partly: [15, 40], overcast: [10, 30], fog: [15, 45], rain: [10, 35], storm: [12, 40] };
const NEXT: Record<string, number> = { clear: 0.22, partly: 0.2, overcast: 0.14, fog: 0.14, rain: 0.16, storm: 0.14 };

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createSkyCycle(scene: THREE.Scene, group: THREE.Object3D, renderer: THREE.WebGPURenderer, o: SkyCycleOptions): SkyCycle {
  let hemi: THREE.HemisphereLight | null = null, sun: THREE.DirectionalLight | null = null;
  group.traverse((x) => {
    const h = x as THREE.HemisphereLight, d = x as THREE.DirectionalLight;
    if (h.isHemisphereLight && !hemi) hemi = h;
    if (d.isDirectionalLight && d.castShadow && !sun) sun = d;
  });
  if (!sun) group.traverse((x) => { const d = x as THREE.DirectionalLight; if (d.isDirectionalLight && !sun) sun = d; });
  const sunL = sun as THREE.DirectionalLight | null, hemiL = hemi as THREE.HemisphereLight | null;
  if (sunL) { sunL.userData.offset = DAY_SUN.clone().multiplyScalar(150); scene.userData.godrays = sunL; }
  const nightEnvI = scene.environmentIntensity, nightExposure = renderer.toneMappingExposure;

  // ── the haze: night fog (the nebula environment's colour) ↔ day haze warming toward the sun ──
  const uDay = uniform(0), uDens = uniform(NIGHT_DENSITY), uGlowK = uniform(0.75);
  const uHaze: N = uniform(DAY.haze.clone()), uGlow: N = uniform(DAY.glow.clone()), uSun: N = uniform(DAY_SUN.clone());
  const view: N = normalize(positionWorld.sub(cameraPosition));
  const env = scene.environment;
  const nightCol: N = env ? (pmremTexture(env as N, normalize(vec3(view.x, max(view.y, float(0.05)), view.z)), float(0.55)) as N).mul(0.85) : color(0x0f3038);
  const dayCol: N = mix(uHaze, uGlow, view.dot(uSun).max(0).pow(5).mul(uGlowK));
  (scene as unknown as { fogNode: unknown }).fogNode = fog(mix(nightCol, dayCol, uDay), densityFogFactor(uDens));
  scene.fog = null;

  // ── the day sky over the nebula ──
  const sky = new SkyMesh();
  sky.scale.setScalar(450000); sky.frustumCulled = false; sky.renderOrder = -10;
  const sm = sky.material as unknown as THREE.NodeMaterial & { colorNode: N; fog: boolean };
  const uSkyA = uniform(0), uSkyDim = uniform(1);
  sm.colorNode = vec4((sm.colorNode as N).rgb.mul(uSkyDim), uSkyA);
  sm.transparent = true; sm.fog = false;
  sky.turbidity.value = 3.2; sky.rayleigh.value = 1.3; sky.mieCoefficient.value = 0.006; sky.mieDirectionalG.value = 0.86;
  scene.add(sky);

  // ── weather: Apex's states, Era Clash's rain and lightning ──
  const pinned = o.weather !== 'auto' && o.weather !== 'off' && WEATHERS[o.weather] ? o.weather : null;
  let wxName = pinned ?? (o.weather === 'off' ? 'clear' : 'partly');
  const cur: WxParams = { ...WEATHERS[wxName].p };
  let target: WxParams = { ...cur }, tau = 6, nextSpell = 12 + Math.random() * 25;
  let actx: AudioContext | null = null, noise: AudioBuffer | null = null;
  const thunder = (dist: number) => {
    try {
      if (!actx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        actx = new AC(); noise = actx.createBuffer(1, actx.sampleRate * 3, actx.sampleRate);
        const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (actx.state === 'suspended') void actx.resume();
      const t = actx.currentTime, near = Math.max(0, 1 - dist / 700);
      const src = actx.createBufferSource(); src.buffer = noise;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260 + near * 900, t); lp.frequency.exponentialRampToValueAtTime(60, t + 3);
      const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15 + near * 0.5, t + 0.05 + (1 - near) * 0.4); g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
      src.connect(lp); lp.connect(g); g.connect(actx.destination); src.start(t); src.stop(t + 3.3);
    } catch { /* no audio */ }
  };
  const rain = o.weather === 'off' ? null : new Weather({
    sky: { uStorm: { value: 0 }, uFlash: { value: 0 } }, flashLights: [],
    thunder: (d) => thunder(d), setStorm: () => {}, indoors: () => false, scene: () => scene,
    ground: (x, z) => o.ground(x, z),
  }, o.lo ? 3000 : 7000, { natural: false, lightningAt: 0.9 });
  const pickNext = () => {
    let tot = 0; for (const k in NEXT) if (k !== wxName) tot += NEXT[k];
    let r = Math.random() * tot; for (const k in NEXT) { if (k === wxName) continue; if ((r -= NEXT[k]) <= 0) return k; }
    return 'clear';
  };

  let clock = o.start, flash = 0;
  const lerpC = (out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number) => out.copy(a).lerp(b, t);
  const dir = new THREE.Vector3(), tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

  return {
    wind: () => 0.55 + cur.wind * 1.4,
    state: () => ({ time: clock, weather: wxName, storm: rain?.storm ?? 0 }),
    update(dt, cam, player) {
      dt = Math.min(dt, 0.1);
      // ── the clock and the sun's path ──
      if (o.mode === 'cycle') clock = (clock + dt / o.cycleSeconds) % 1;
      const th = (clock - 0.25) * Math.PI * 2;
      let sinE: number;
      if (o.mode === 'day') { dir.copy(DAY_SUN); sinE = DAY_SUN.y; }
      else if (o.mode === 'night') { dir.set(0.4, -0.6, 0.3).normalize(); sinE = -0.6; }
      else { dir.set(-Math.cos(th) * 0.85, Math.sin(th) * 0.9, -0.42).normalize(); sinE = dir.y; }
      const dayK = smooth(-0.1, 0.12, sinE), gold = 1 - smooth(0.05, 0.45, sinE);

      // ── weather: the director, then ease toward the spell ──
      if (!pinned && rain) {
        nextSpell -= dt;
        if (nextSpell <= 0) {
          wxName = pickNext(); target = { ...WEATHERS[wxName].p };
          tau = Math.random() < 0.45 ? 1.2 : 5;                          // squalls arrive in seconds
          const [a, b] = SPELL[wxName]; nextSpell = a + Math.random() * (b - a);
        }
      } else if (pinned) target = WEATHERS[pinned].p;
      const k = 1 - Math.exp(-dt / tau);
      const c = cur as unknown as Record<string, number>, tg = target as unknown as Record<string, number>;
      for (const key of Object.keys(c)) c[key] += (tg[key] - c[key]) * k;
      if (rain && cam) {
        rain.force = cur.rain > 0.02 ? Math.min(1, 0.25 + 0.6 * cur.rain + (WEATHERS[wxName].storm ? 0.15 : 0)) : 0;
        rain.update(dt, cam, player, false);
        flash = rain.flash;
      }

      // ── lights: the sun by day, the moon (the same light, the other side of the sky) by night ──
      if (sunL) {
        if (sinE > -0.04) {
          sunL.userData.offset = (sunL.userData.offset as THREE.Vector3 ?? new THREE.Vector3()).copy(dir).multiplyScalar(150);
          lerpC(sunL.color, DAY.sun, GOLD.sun, gold);
          sunL.intensity = DAY.sunI * smooth(-0.03, 0.12, sinE) * cur.sun;
        } else {
          const m = tmpC2; void m;
          (sunL.userData.offset as THREE.Vector3).set(-dir.x, Math.max(0.35, -dir.y), 0.4).normalize().multiplyScalar(150);
          sunL.color.copy(NIGHT.moon);
          sunL.intensity = NIGHT.moonI * smooth(-0.04, -0.2, sinE) * Math.max(0.35, cur.sun);
        }
        sunL.intensity += flash * 9;
      }
      if (hemiL) {
        lerpC(tmpC, DAY.hemi, GOLD.hemi, gold);
        hemiL.color.copy(NIGHT.hemi).lerp(tmpC, dayK);
        hemiL.groundColor.copy(NIGHT.ground).lerp(DAY.ground, dayK);
        hemiL.intensity = (NIGHT.hemiI + (DAY.hemiI - NIGHT.hemiI) * dayK) * (1 + (cur.hemi - 1) * dayK) + flash * 3;
      }

      // ── haze, sky, exposure ──
      uDay.value = dayK;
      lerpC(tmpC, DAY.haze, GOLD.haze, gold); (uHaze.value as THREE.Color).copy(tmpC).lerp(GREY, cur.fogGrey);
      lerpC(uGlow.value as THREE.Color, DAY.glow, GOLD.glow, gold);
      (uSun.value as THREE.Vector3).copy(dir);
      uGlowK.value = 0.75 * cur.sun;
      uDens.value = (NIGHT_DENSITY + (DAY.density - NIGHT_DENSITY) * dayK) / Math.max(0.25, 0.3 + 0.7 * cur.fogFar);
      uSkyA.value = o.mode === 'day' ? 1 : smooth(-0.18, 0.05, sinE);
      uSkyDim.value = 1 - 0.55 * cur.cloudDark;
      sky.sunPosition.value.copy(dir);
      sky.cloudCoverage.value = Math.min(0.95, 0.15 + 0.35 * cur.cloud);
      sky.cloudDensity.value = 0.3 + 0.6 * cur.cloudDark;
      scene.environmentIntensity = nightEnvI + (DAY.env - nightEnvI) * dayK;
      renderer.toneMappingExposure = nightExposure + (DAY.exposure - nightExposure) * dayK + cur.exposure * dayK + flash * 0.3;
    },
  };
}
