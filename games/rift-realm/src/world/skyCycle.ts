// Elderwood Wilds — time of day and weather.
//
// Time: one full turn of the sun every `cycleSeconds` (4 min by default): night → dawn → day → dusk → evening → night.
// The sun is the level's shadow-casting light (its shadow camera follows the player along the light direction); after
// sunset the same light becomes the moon on the other side of the sky. A physical sky (three's SkyMesh: Preetham
// scattering, clouds, the sun disc) fades in over the nebula night sky at dawn and out again after dusk; the haze blends
// from the night fog (coloured by the nebula environment) to a blue-green day haze that warms toward the sun, and to
// amber at golden hour. The post chain's godrays use the same light, so shafts follow the sun (and the moon).
//
// Weather: the six states of Apex's weather (games/apex/src/weather.ts: clear, partly cloudy, overcast, fog,
// rain, thunderstorm — each a set of multipliers on sun, sky light, haze, clouds, rain and wind), switched by a
// sporadic director: short spells, sudden squalls, fog banks rolling in, breaks of sun. Rain, splashes, lightning
// bolts and thunder that arrives by distance are Era Clash's Weather (games/era-clash-3d/src/core/weather.ts, WebGPU).
//
// ?time=day  — fixed daylight as the art shots are lit (no weather unless ?weather=…)
// ?time=night — fixed night (the level's own look)
// ?cycle=240 — seconds per day; ?weather=storm|rain|fog|overcast|partly|clear pins one, ?weather=off none
import * as THREE from 'three/webgpu';
import { smoothstep, cameraPosition, color, densityFogFactor, float, fog, max, mix, normalize, pmremTexture, positionWorld, uniform, vec3, vec4 } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WEATHERS, type WxParams } from '../../../apex/src/weather';
import { Weather } from '../../../era-clash-3d/src/core/weather';
import { auroraCurtains, volumetricClouds, AURORA_PALETTES } from '../../../../services/sky';

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
  /** The level's beat pulse (TSL uniform): the aurora brightens a little on the beat. */
  beat?: N;
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
// low key like the art: the sun does the lighting (warm shafts), the sky fill is a dim green-grey bounce, so the shade
// under the canopy reads dark and the AO shows (a 2.7 fill lit everything evenly and the forest went flat and pale)
const DAY = { hemi: C(0xa9bf9c), ground: C(0x2c3a1e), hemiI: 1.05, sun: C(0xffd9a2), sunI: 6.0, haze: C(0x76846a), glow: C(0xffd890), density: 0.0048, exposure: 1.0, env: 0.12 };
const GOLD = { hemi: C(0xe8b49a), sun: C(0xff9b55), haze: C(0x9c8c86), glow: C(0xffb070) };
const GREY = C(0x7f878a);
const NIGHT_DENSITY = 0.0032;

// how long each kind of spell lasts (s) and how likely it is next: short and changeable, storms can come out of nowhere
const SPELL: Record<string, [number, number]> = { clear: [15, 50], partly: [15, 40], overcast: [10, 30], fog: [15, 45], rain: [10, 35], storm: [12, 40] };
const NEXT: Record<string, number> = { clear: 0.22, partly: 0.2, overcast: 0.14, fog: 0.14, rain: 0.16, storm: 0.14 };

// ?cov= / ?dark= override the cloud coverage and storm darkness (tuning)
const DBG = (() => { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null; const n = (k: string) => (q?.has(k) ? Number(q.get(k)) : undefined); return { cov: n('cov'), dark: n('dark') }; })();
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
  const godraysGain = { value: 1 }; scene.userData.godraysGain = godraysGain;   // post.ts fades the shafts with it
  // post.ts reads these: forest-scale contact shadows and a low-key contrast curve (the art's deep shade)
  scene.userData.look = { aoRadius: 1.4, aoScale: 1.3, contrast: 1.12, toe: 0.05, warm: 0.6, rays: 1.4, ...(scene.userData.look ?? {}) };
  const nightEnvI = scene.environmentIntensity, nightExposure = renderer.toneMappingExposure;

  // ── the haze: night fog (the nebula environment's colour) ↔ day haze warming toward the sun ──
  const uDay = uniform(0), uDens = uniform(NIGHT_DENSITY), uGlowK = uniform(0.75);
  const uHaze: N = uniform(DAY.haze.clone()), uGlow: N = uniform(DAY.glow.clone()), uSun: N = uniform(DAY_SUN.clone());
  const view: N = normalize(positionWorld.sub(cameraPosition));
  const env = scene.environment;
  const nightCol: N = env ? (pmremTexture(env as N, normalize(vec3(view.x, max(view.y, float(0.05)), view.z)), float(0.55)) as N).mul(0.85) : mix(color(0x0f3038), color(0x1c1f48), smoothstep(-0.05, 0.5, view.y));
  const dayCol: N = mix(uHaze, uGlow, view.dot(uSun).max(0).pow(5).mul(uGlowK));
  // height fog: thick on the forest floor, thinning over ~28 m so the misty understory reads deep while towering 40 m
  // Grovewardens and high canopies remain unmistakably visible across the distant skyline
  const uFogBase = uniform(0), uFogH = uniform(28);
  const heightK: N = float(1).sub(smoothstep(0, 1, positionWorld.y.sub(uFogBase).div(uFogH).clamp(0, 1))).mul(0.82).add(0.18);
  (scene as unknown as { fogNode: unknown }).fogNode = fog(mix(nightCol, dayCol, uDay), densityFogFactor(uDens).mul(heightK));
  scene.fog = null;

  // ── the day sky over the nebula ──
  const sky = new SkyMesh();
  sky.scale.setScalar(450000); sky.frustumCulled = false; sky.renderOrder = -10;
  const sm = sky.material as unknown as THREE.NodeMaterial & { colorNode: N; fog: boolean };
  const uSkyA = uniform(0), uSkyDim = uniform(1), uHorizonDim = uniform(0);
  // storms also darken the band near the horizon (below the volumetric deck's fade, 0–0.14 view height, the SkyMesh shows)
  const skyView: N = normalize(positionWorld.sub(cameraPosition));
  const horizonK: N = float(1).sub(uHorizonDim.mul(float(1).sub(smoothstep(0.0, 0.25, skyView.y.abs()))));
  sm.colorNode = vec4((sm.colorNode as N).rgb.mul(uSkyDim).mul(horizonK), uSkyA);
  sm.transparent = true; sm.fog = false;
  sky.turbidity.value = 3.2; sky.rayleigh.value = 1.3; sky.mieCoefficient.value = 0.006; sky.mieDirectionalG.value = 0.86;
  // ?sky=vol: the volumetric clouds and aurora (services/sky), opt-in until they clearly beat the SkyMesh's own clouds
  // side by side (Kenne, 2026-11-22: the sky had regressed); without it the SkyMesh clouds as committed in 6551a5c7
  const VOL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sky') === 'vol';
  if (VOL) sky.cloudCoverage.value = 0;
  if (!(typeof location !== 'undefined' && location.search.includes('noskymesh'))) scene.add(sky);   // (?noskymesh: tuning)
  // ── volumetric clouds over everything in the sky, the aurora under them (services/sky) ──
  const clouds = VOL ? volumetricClouds({ lo: o.lo }) : null, aurora = VOL ? auroraCurtains({ lo: o.lo, beat: o.beat }) : null;
  if (aurora) scene.add(aurora.mesh);
  (globalThis as unknown as { __sky?: unknown }).__sky = { clouds, aurora };   // ?rrdebug inspection (uniform values)
  if (clouds && !(typeof location !== 'undefined' && location.search.includes('noclouds'))) scene.add(clouds.mesh);
  const palettes = Object.keys(AURORA_PALETTES);
  let palA = 'emerald', palB = 'turquoise', wasNight = false;

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
    // (clouds and aurora: services/sky; tuned in update below)
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
      uFogBase.value = o.ground(player.x, player.z);
      godraysGain.value = dayK;
      // a storm's haze is dark; a blighted Elderwood shifts daylight haze toward smoky charred amber-ash
      const blight = (globalThis as unknown as { __forestHealth?: { blight?: number } }).__forestHealth?.blight ?? 0;
      lerpC(tmpC, DAY.haze, GOLD.haze, gold);
      if (blight > 0.05) tmpC.lerp(tmpC2.setHex(0x6e4738), blight * 0.62);
      (uHaze.value as THREE.Color).copy(tmpC).lerp(GREY, cur.fogGrey).multiplyScalar(1 - 0.55 * cur.cloudDark);
      uHorizonDim.value = Math.min(0.88, 0.7 * cur.cloudDark + blight * 0.22);
      lerpC(uGlow.value as THREE.Color, DAY.glow, GOLD.glow, Math.min(1, gold + blight * 0.55));
      (uSun.value as THREE.Vector3).copy(dir);
      uGlowK.value = 0.75 * cur.sun;
      uDens.value = ((NIGHT_DENSITY + (DAY.density - NIGHT_DENSITY) * dayK) * (1 + blight * 0.35)) / Math.max(0.25, 0.3 + 0.7 * cur.fogFar);
      uSkyA.value = o.mode === 'day' ? 1 : smooth(-0.18, 0.05, sinE);
      // the day sky through canopy gaps was a blown white hole: hold it a little under the sun-lit ground
      uSkyDim.value = (1 - 0.55 * cur.cloudDark) * (1 - 0.5 * dayK);
      sky.sunPosition.value.copy(dir);
      const night = sinE <= -0.04, cov = Math.min(0.97, Math.max(0.08, (cur.cloud - 0.4) * 0.55));
      if (!clouds || !aurora) { sky.cloudCoverage.value = Math.min(0.95, 0.15 + 0.35 * cur.cloud); sky.cloudDensity.value = 0.3 + 0.6 * cur.cloudDark; }
      else {
      // clouds: lit by the sun (or the moon), sky light from the hemisphere; coverage, storm darkness and drift from the weather
      const cu = clouds.u;
      (cu.sunDir.value as THREE.Vector3).copy(night ? (sunL?.userData.offset as THREE.Vector3 ?? dir).clone().normalize() : dir);
      if (sunL) (cu.sunColor.value as THREE.Color).copy(sunL.color).multiplyScalar(Math.max(0, sunL.intensity - flash * 9) / DAY.sunI * (night ? 0.3 : 0.6));
      if (hemiL) { (cu.ambient.value as THREE.Color).copy(hemiL.color).multiplyScalar(Math.max(0, hemiL.intensity - flash * 3) * (night ? 0.07 : 0.13)); (cu.ambientLow.value as THREE.Color).copy(cu.ambient.value as THREE.Color).multiplyScalar(0.3).lerp(new THREE.Color(0.05, 0.055, 0.06), cur.cloudDark * 0.6); }
      cu.coverage.value = DBG.cov ?? cov; cu.darkness.value = DBG.dark ?? cur.cloudDark;
      // a heavy deck is grey, not tinted by the sky light
      (cu.ambient.value as THREE.Color).lerp(tmpC.setRGB(0.42, 0.44, 0.47).multiplyScalar(hemiL ? hemiL.intensity * 0.13 : 0.3), Math.min(1, (DBG.cov ?? cov) * 0.8));
      cu.cirrus.value = 0.65 * (1 - cov) * (1 - cur.fogGrey * 0.6);
      cu.cosmic.value = 0.2 + 0.3 * gold;
      cu.camY.value = player.y;
      clouds.update(dt, 5 + cur.wind * 22, 2 + cur.wind * 8);
      // aurora: full at night, softer at dawn and dusk, a faint cyan veil by day (the fantasy domes have it at noon); clouds hide it.
      // A new pair of curtain colours every night (emerald, turquoise, violet, silver, cyan), blended in slowly.
      if (night && !wasNight) { palA = palettes[Math.floor(Math.random() * palettes.length)]; palB = palettes[Math.floor(Math.random() * palettes.length)]; }
      wasNight = night;
      aurora.setPalette(palA, Math.min(1, dt * 0.2), palB);
      aurora.u.intensity.value = (o.mode === 'day' ? 0.16 : 0.16 + 0.84 * (1 - smooth(-0.15, 0.25, sinE))) * (1 - 0.8 * cov) * (1 - cur.fogGrey * 0.7);
      }
      scene.environmentIntensity = nightEnvI + (DAY.env - nightEnvI) * dayK;
      renderer.toneMappingExposure = nightExposure + (DAY.exposure - nightExposure) * dayK + cur.exposure * dayK + flash * 0.3;
    },
  };
}
