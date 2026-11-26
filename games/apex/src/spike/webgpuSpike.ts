// Unified Playkit WebGPU + TSL Showcase for Plajah Motorsport: Apex
// (Step 2 & 3 of docs/apex-elohim/webgpu-migration.md).
//
// Proves ALL FOUR Apex TSL shader families + Unified Playkit Lighting & Post running natively
// on `THREE.WebGPURenderer` with ZERO console/WebGPU errors:
//   1. `apexMaterialsTsl.ts`: v4 Colab 2K Neural PBR/ORM/Height hero landmarks (with WebGPU 4-byte
//      vertex-stride sanitization), 3D blue-sky curtain-wall glass skyline, wet-puddle asphalt, terrain.
//   2. `carPaintTsl.ts` + `apexWebGpuAdapter.ts`: Real Vanguard Apex GT scan car (`loadScanCarById`)
//      upgraded to native TSL OEM clearcoat metallic paint, hex grille, real wheels & glowing lamps.
//   3. `worldTsl.ts`: Real Ironport equirectangular Sky Dome (golden/clear/night + clouds/stars/moon)
//      and flow-advected Great Lake Water (`water_flow.png`).
//   4. `apexPostTsl.ts`: LensRain refracted water droplets, clarity vibrance & all 5 Plajah film lenses
//      plugged into `playkit/render/unifiedPost.ts` (GTAO + SSR + 3D Godrays + Bloom + FXAA + FSR 1 + 33^3 LUT).

import * as THREE from 'three/webgpu';
import {
  color, exponentialHeightFogFactor, float, fog, mix, positionWorld, uniform, vec3,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  PlaykitSceneLightingController,
  type LocalLookVolume,
  type WorldLightSpec,
  type WorldProbeSite,
} from '../../../../playkit/render/liveLighting';
import { createPlaykitPostPipeline } from '../../../../playkit/render/unifiedPost';
import {
  createApexFacadeTslMaterial,
  createApexGlassTslMaterial,
  createApexRoadWetTslMaterial,
  createApexTerrainTslMaterial,
  createApexTslSharedUniforms,
  sanitizeObjectForWebGPU,
} from '../tsl/apexMaterialsTsl';
import { createApexPostStage } from '../tsl/apexPostTsl';
import {
  getPlaceholderPngBlobUrl,
  mountApexWebGpuSkyAndWater,
  upgradeCarRigToWebGPU,
} from '../tsl/apexWebGpuAdapter';
import { loadScanCarById } from '../scancar';
import { LensRain } from '../lensRain';
import { GAME_LENSES, type GameLens } from '../grade';

const REGION = '/games/apex/region/';
const IRONPORT_V4 = '/games/apex/ironport/';
const hud = document.getElementById('hud') as HTMLDivElement;
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGPURenderer({
  antialias: false,
  powerPreference: 'high-performance',
  forceWebGL: params.has('webgl'),
});
const dpr = Math.min(devicePixelRatio, 1.25);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
await renderer.init();

const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7d4);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 28000);

// Shared Apex TSL uniforms (sun direction, night factor, road wetness & puddles)
const apexShared = createApexTslSharedUniforms();

// Direct sun + hemisphere fill (sun tagged for 3D shadow-map Godrays in unifiedPost.ts)
const sun = new THREE.DirectionalLight(0xffd298, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.25;
Object.assign(sun.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240, near: 10, far: 4000 });
const hemi = new THREE.HemisphereLight(0xaacdf5, 0x4a443b, 1.15);
scene.add(sun, sun.target, hemi);

const godraysGain = { value: 0.72 };
scene.userData.godrays = sun;
scene.userData.godraysGain = godraysGain;
scene.userData.look = {
  aoRadius: 1.5,
  aoScale: 1.0,
  contrast: 1.04,
  toe: 0.04,
  warm: 0.16,
  rays: 0.70,
};

const fogColorU = uniform(new THREE.Color(0xbcd0e2));
scene.fogNode = fog(fogColorU, exponentialHeightFogFactor(float(0.00011), float(1 / 420)));

// Mount Vesselbound's exact Playkit WebGPU Lighting & SH9 GI Controller on Ironport!
const playkitLighting = new PlaykitSceneLightingController(scene, {
  activePointLights: 12,
  maxLightDistanceM: 180,
  palette: {
    skyColor: [0.44, 0.66, 0.94],
    canopyBounceColor: [0.22, 0.44, 0.26],
    groundColor: [0.28, 0.24, 0.20],
    interiorWarmColor: [0.76, 0.50, 0.22],
    sunColor: [1.0, 0.86, 0.64],
    sunDir: [-0.75, 0.45, -0.25],
  },
});

// Load real Ironport heightfield (6 m grid, sampled every 4th cell = 24 m)
const meta = (await (await fetch(REGION + 'height2.json')).json()) as { w: number; h: number; mpp: number; min: number; max: number };
const raw = new Uint16Array(await (await fetch(REGION + 'height2.u16')).arrayBuffer());
const k = (meta.max - meta.min) / 65535;
const hAt = (x: number, z: number): number => {
  const ix = Math.max(0, Math.min(meta.w - 1, Math.round(x / meta.mpp + meta.w / 2)));
  const iz = Math.max(0, Math.min(meta.h - 1, Math.round(z / meta.mpp + meta.h / 2)));
  return meta.min + raw[iz * meta.w + ix] * k;
};

// Mount real Ironport TSL Sky Dome (equirectangular panoramas + clouds/sun/stars) & Flow-Advected Great Lake Water!
const envRw = meta.w * meta.mpp;
const envRh = meta.h * meta.mpp;
const env = mountApexWebGpuSkyAndWater(scene, { rw: envRw, rh: envRh, waterY: 2.4 });

// Bake real L2 SH9 GI probes + Downtown / Harbor LocalLookVolumes
const DT_X = 5513, DT_Z = 934;
const probeSites: WorldProbeSite[] = [
  { x: DT_X, y: hAt(DT_X, DT_Z) + 12, z: DT_Z, kind: 'clearing' },
  { x: 5904, y: hAt(5904, 852) + 12, z: 852, kind: 'clearing' },
  { x: 5180, y: hAt(5180, 1280) + 12, z: 1280, kind: 'clearing' },
  { x: 5900, y: hAt(5900, -1100) + 10, z: -1100, kind: 'water' },
  { x: 4671, y: hAt(4671, 2179) + 10, z: 2179, kind: 'clearing' },
];
playkitLighting.bakeProbes(probeSites);
const lookVolumes: LocalLookVolume[] = [
  { id: 'downtown-ironport', name: 'Downtown Ironport', center: [DT_X, hAt(DT_X, DT_Z) + 20, DT_Z], radiusM: 920, featherM: 320, upperBounceHex: 0x5c8dc4, lowerBounceHex: 0x5a4c3e, interiorMix: 0.14 },
  { id: 'north-harbor', name: 'North Harbor', center: [5900, 12, -1100], radiusM: 760, featherM: 280, upperBounceHex: 0x6aa0cc, lowerBounceHex: 0x2a5666, interiorMix: 0.04 },
];
playkitLighting.addLookVolumes(lookVolumes);

// Terrain using our TSL terrain material + Playkit SH9 GI
const S = 4, gw = Math.floor(meta.w / S), gh = Math.floor(meta.h / S);
const tg = new THREE.PlaneGeometry(envRw, envRh, gw - 1, gh - 1);
tg.rotateX(-Math.PI / 2);
const tp = tg.getAttribute('position') as THREE.BufferAttribute;
for (let i = 0; i < tp.count; i++) tp.setY(i, hAt(tp.getX(i), tp.getZ(i)));
tg.computeVertexNormals();
const tMat = createApexTerrainTslMaterial(apexShared, playkitLighting.uniforms);
const terrain = new THREE.Mesh(tg, tMat);
terrain.receiveShadow = true;
scene.add(terrain);

// Load real Ironport city.json: instanced TSL skyline + REAL v4 Colab 2K Hero Landmarks!
interface SpikeCityItem { kind: 'hero' | 'generic'; slug: string; x: number; z: number; bx?: number; bz?: number; w: number; d: number; h: number; rotY: number; sx?: number; sy?: number; sz?: number }
const city = (await (await fetch(REGION + 'city.json')).json()) as { items: SpikeCityItem[] };
const HERO_SHOWCASE = new Set(['ironport-towers', 'the-guardian', 'old-cathedral', 'city-hall', 'civic-tower']);
const heroItems = city.items.filter((it) => it.kind === 'hero' && HERO_SHOWCASE.has(it.slug));

// Anchor showcase boulevard cleanly 125 m out in front of Ironport Towers so the full hero complex +
// Vanguard hypercar + wet SSR boulevard + wider blue-glass skyline frame unobstructed!
const anchorHero = heroItems.find((h) => h.slug === 'ironport-towers') ?? heroItems[0];
const HERO_X = anchorHero ? (anchorHero.bx ?? anchorHero.x) : DT_X;
const HERO_Z = anchorHero ? (anchorHero.bz ?? anchorHero.z) : DT_Z;
const BLVD_X = HERO_X + 122;
const BLVD_Z = HERO_Z + 18;
const BLVD_Y = hAt(BLVD_X, BLVD_Z) + 0.35;

// Wet-puddle TSL downtown boulevard apron (tests wet roughness 0.05 + Playkit SSR reflections!)
const roadMat = createApexRoadWetTslMaterial(apexShared, playkitLighting.uniforms);
const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 900), roadMat);
roadMesh.rotation.x = -Math.PI / 2;
roadMesh.position.set(BLVD_X, BLVD_Y, BLVD_Z);
roadMesh.receiveShadow = true;
scene.add(roadMesh);

// Register clustered streetlamps lining the wet showcase boulevard (256-light ClusteredLightManager)
const lampSpecs: WorldLightSpec[] = [];
for (let zOff = -240; zOff <= 240; zOff += 38) {
  for (const xSide of [-13, 13]) {
    const lx = BLVD_X + xSide, lz = BLVD_Z + zOff;
    lampSpecs.push({
      id: `plaza_lamp_${xSide}_${zOff}`,
      x: lx,
      y: hAt(lx, lz) + 8.4,
      z: lz,
      colorHex: 0xffd088,
      intensity: 44,
      range: 42,
      beatScale: 0.0,
    });
  }
}
playkitLighting.addLights(lampSpecs);

// Clear placeholder background boxes overlapping the boulevard corridor, camera sightline, or hero footprints
const bgItems = city.items.filter((it) => {
  if (it.kind === 'hero' && HERO_SHOWCASE.has(it.slug)) return false;
  const bx = it.bx ?? it.x, bz = it.bz ?? it.z;
  // Keep boulevard + camera-to-Ironport-Towers sightline wide open!
  if (bx > HERO_X + 35 && bx < BLVD_X + 55 && Math.abs(bz - BLVD_Z) < 110) return false;
  if (Math.abs(bx - BLVD_X) < 34 && Math.abs(bz - BLVD_Z) < 280) return false;
  for (const h of heroItems) {
    const hx = h.bx ?? h.x, hz = h.bz ?? h.z;
    if (Math.hypot(bx - hx, bz - hz) < Math.max(h.w, h.d) * 0.55 + 10) return false;
  }
  return true;
});

// Instanced background skyline dressed with our TSL blue-sky curtain-wall glass shader (ONE instanced draw!)
const bgMat = createApexGlassTslMaterial({ tint: 'blue', shared: apexShared, gi: playkitLighting.uniforms });
const bGeo = new THREE.BoxGeometry(1, 1, 1);
bGeo.translate(0, 0.5, 0);
const inst = new THREE.InstancedMesh(bGeo, bgMat, bgItems.length);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
bgItems.forEach((it, i) => {
  const bx = it.bx ?? it.x, bz = it.bz ?? it.z;
  q.setFromAxisAngle(up, it.rotY ?? 0);
  m4.compose(new THREE.Vector3(bx, hAt(bx, bz) - 0.5, bz), q, new THREE.Vector3(Math.max(4, it.w), Math.max(4, it.h ?? 10), Math.max(4, it.d)));
  inst.setMatrixAt(i, m4);
});
inst.castShadow = inst.receiveShadow = true;
scene.add(inst);

// Real 4x4 PNG Blob URL intercepts legacy embedded tex-shared-*.png refs in v4 glTFs -> ZERO console/network errors!
const placeholderBlobUrl = await getPlaceholderPngBlobUrl();
const gltfMgr = new THREE.LoadingManager();
gltfMgr.setURLModifier((url) => (/tex-(shared|hero)-[^/]*\.(png|jpe?g)$/i.test(url) ? placeholderBlobUrl : url));
const gltfLoader = new GLTFLoader(gltfMgr);

const texLoader = new THREE.TextureLoader();
const loadTex = (url: string, srgb: boolean): THREE.Texture => {
  const t = texLoader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

let loadedHeroes = 0;
void Promise.all(heroItems.map(async (it) => {
  try {
    const g = await gltfLoader.loadAsync(`${IRONPORT_V4}models-v4/hero/${it.slug}_lod0.gltf`);
    const root = g.scene;
    sanitizeObjectForWebGPU(root);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const old = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial | undefined;
      const name = old?.name ?? '';
      const hasVtxCol = !!m.geometry.getAttribute('color');
      if (/glass/i.test(name)) {
        const tint = /bronze/i.test(name) ? 'bronze' : /cerulean/i.test(name) ? 'cerulean' : 'blue';
        m.material = createApexGlassTslMaterial({ tint, shared: apexShared, gi: playkitLighting.uniforms });
      } else {
        const stem = name.replace(/_mat.*$/, '');
        const isHeroSheet = /^tex-hero-/.test(stem);
        const dir = isHeroSheet ? 'hero-facades' : 'shared';
        if (/^tex-(hero|shared)-/.test(stem)) {
          const base = loadTex(`${IRONPORT_V4}textures-v4/${dir}/${stem}_base.jpg`, true);
          const nrm = loadTex(`${IRONPORT_V4}textures-v4/${dir}/${stem}_nrm.jpg`, false);
          const orm = loadTex(`${IRONPORT_V4}textures-v4/${dir}/${stem}_orm.jpg`, false);
          const hgt = loadTex(`${IRONPORT_V4}textures-v4/${dir}/${stem}_hgt.jpg`, false);
          m.material = createApexFacadeTslMaterial({
            map: base, normalMap: nrm, ormMap: orm, heightMap: hgt,
            isHero: isHeroSheet, vertexColors: hasVtxCol,
            shared: apexShared, gi: playkitLighting.uniforms,
          });
        } else {
          const fallback = new THREE.MeshStandardNodeMaterial({ color: old?.color?.getHex() ?? 0x888a8e, roughness: 0.72, vertexColors: hasVtxCol });
          if (hasVtxCol) fallback.colorNode = mix(color(old?.color?.getHex() ?? 0x888a8e), vec3(1, 1, 1), float(0)).mul(positionWorld.y.mul(0).add(1));
          m.material = fallback;
        }
      }
      m.castShadow = !/__v4_|_front$/i.test(m.name);
      m.receiveShadow = true;
    });
    const bx = it.bx ?? it.x, bz = it.bz ?? it.z;
    root.position.set(it.x, hAt(bx, bz) - 0.35, it.z);
    root.rotation.y = it.rotY ?? 0;
    root.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    scene.add(root);
    loadedHeroes++;
  } catch (e) {
    console.warn('[apex-webgpu] hero load skipped:', it.slug, e);
  }
}));

// Load FULL real Apex Vanguard Apex GT (`loadScanCarById`) upgraded onto native WebGPU TSL!
let carLoaded = false;
let heroRig: Awaited<ReturnType<typeof loadScanCarById>> | null = null;
void (async () => {
  try {
    const rig = upgradeCarRigToWebGPU(await loadScanCarById('vanguard'), playkitLighting.uniforms);
    rig.group.position.set(BLVD_X - 1.5, BLVD_Y + 0.02, BLVD_Z);
    rig.group.rotation.y = -Math.PI * 0.28; // angled 3/4 hero stance facing downtown towers
    scene.add(rig.group);
    heroRig = rig;
    carLoaded = true;
  } catch (e) {
    console.warn('[apex-webgpu] showcase car skipped:', e);
  }
})();

// Mount Playkit's Unified WebGPU Post Stack + Apex's signature LensRain/Clarity/Film-Lens stage!
const postFlags = params.get('post') ?? '';
const useSsr = postFlags.includes('ssr');
const internalScale = Number(params.get('scale')) || 0.75;
const lensRain = new LensRain();
const apexPost = createApexPostStage();
const post = createPlaykitPostPipeline(renderer, scene, camera, {
  ao: true,
  ssr: useSsr,
  ssrScale: 0.5,
  fxaa: true,
  fsr1: internalScale < 0.99,
  internalScale,
  bloom: 'full',
  lut: true,
  lutPreset: 'fable-warm',
  lutStrength: 0.22,
  debugFlags: postFlags,
  stylize: apexPost.stylize,
});

// Time-of-day presets, wet-road toggle & film-lens cycler
type SpikeTod = 'golden' | 'clear' | 'night';
let activeTod: SpikeTod = (params.get('tod') as SpikeTod) || 'golden';
let wetMode = params.has('wet') || useSsr;
let lensIdx = 0;
let activeLens: GameLens = 'none';
const sunDir = new THREE.Vector3(-0.75, 0.42, -0.25).normalize();

function applyTod(tod: SpikeTod): void {
  activeTod = tod;
  let skyName = 'sky2_golden';
  if (tod === 'night') {
    skyName = 'sky2_night';
    sun.color.setHex(0x8aa8e0); sun.intensity = 0.42;
    sunDir.set(-0.55, 0.65, -0.35).normalize();
    hemi.color.setHex(0x283a62); hemi.groundColor.setHex(0x1e1812); hemi.intensity = 0.72;
    fogColorU.value.setHex(0x0d1526); (scene.background as THREE.Color).setHex(0x0d1526);
    scene.environmentIntensity = 0.45;
    apexShared.uNight.value = 1.0;
    godraysGain.value = 0.0;
    post?.setLut('cyber-neon', 0.30);
  } else if (tod === 'clear') {
    skyName = 'sky2_clear';
    sun.color.setHex(0xfff6e6); sun.intensity = 3.4;
    sunDir.set(-0.45, 0.82, -0.32).normalize();
    hemi.color.setHex(0xaad2ff); hemi.groundColor.setHex(0x5c5850); hemi.intensity = 1.25;
    fogColorU.value.setHex(0xb6d2ec); (scene.background as THREE.Color).setHex(0xb6d2ec);
    scene.environmentIntensity = 0.95;
    apexShared.uNight.value = 0.0;
    godraysGain.value = 0.55;
    post?.setLut('neutral', 0.0);
  } else {
    skyName = 'sky2_golden';
    sun.color.setHex(0xffd296); sun.intensity = 3.6;
    // Front-3/4 golden hour raking across BOTH the Vanguard hypercar and the v4 Ironport Towers facades!
    sunDir.set(0.68, 0.42, 0.56).normalize();
    hemi.color.setHex(0x9ec6f7); hemi.groundColor.setHex(0x5c5448); hemi.intensity = 1.25;
    fogColorU.value.setHex(0xbcd0e2); (scene.background as THREE.Color).setHex(0xbcd0e2);
    scene.environmentIntensity = 1.05;
    apexShared.uNight.value = 0.0;
    godraysGain.value = 0.72;
    post?.setLut('fable-warm', 0.22);
  }
  env.loadSkyPanorama(skyName, (tex) => {
    // WebGPU NodeMaterial EnvironmentNode consumes equirectangular scene.environment directly!
    scene.environment = tex;
  });
  apexShared.uSunDir.value.copy(sunDir);
  apexShared.uWet.value = wetMode ? 0.85 : 0.0;
  apexShared.uPool.value = wetMode ? 0.78 : 0.0;
}
applyTod(activeTod);

const btnLens = document.getElementById('btnLens');
document.getElementById('btnGolden')?.addEventListener('click', () => applyTod('golden'));
document.getElementById('btnClear')?.addEventListener('click', () => applyTod('clear'));
document.getElementById('btnNight')?.addEventListener('click', () => applyTod('night'));
document.getElementById('btnWet')?.addEventListener('click', () => { wetMode = !wetMode; applyTod(activeTod); });
btnLens?.addEventListener('click', () => {
  lensIdx = (lensIdx + 1) % GAME_LENSES.length;
  activeLens = GAME_LENSES[lensIdx].id;
  btnLens.textContent = `Film Lens: ${GAME_LENSES[lensIdx].label}`;
});

const look = new THREE.Vector3();
const focusVec = new THREE.Vector3(BLVD_X, BLVD_Y + 2, BLVD_Z);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const times: number[] = [];
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  times.push(now - last); last = now;
  if (times.length > 120) times.shift();

  // Hero Forza/Gran Turismo framing: low sweeping dolly behind/beside the Vanguard hypercar on the
  // wet SSR boulevard looking straight across the car UP at the v4 Ironport Towers + skyline + sky!
  const t = now * 0.00028;
  const cx = BLVD_X + 7.2 + Math.cos(t) * 2.4;
  const cz = BLVD_Z + 8.5 + Math.sin(t) * 3.8;
  camera.position.set(cx, BLVD_Y + 2.35 + 0.55 * Math.sin(t * 1.3), cz);
  look.set(HERO_X + 46, BLVD_Y + 8.5, HERO_Z + 6);
  camera.lookAt(look);
  focusVec.set(BLVD_X, BLVD_Y + 1.5, BLVD_Z);

  env.skyMesh.position.copy(camera.position);
  env.sky.update(dt, {
    sunDir,
    sunCol: sun.color,
    sunAmt: activeTod === 'night' ? 0.05 : 1.0,
    night: activeTod === 'night' ? 1.0 : 0.0,
    fog: fogColorU.value,
    fogAmt: 0.25,
    mixOver: wetMode ? 0.28 : 0.0,
    mixStorm: 0.0,
    dark: wetMode ? 0.14 : 0.0,
    flash: 0.0,
    birds: false,
  });
  env.water.update(dt, {
    sunDir,
    sunCol: sun.color,
    sunAmt: activeTod === 'night' ? 0.08 : 1.0,
    wind: wetMode ? 0.55 : 0.22,
    rain: wetMode ? 0.5 : 0.0,
    storm: 0.0,
    fog: fogColorU.value,
    fogNear: 6000,
    fogFar: 24000,
    skyDim: activeTod === 'night' ? 0.35 : 1.0,
    mapFade: 0,
    glint: activeTod === 'golden' ? 0.65 : 0.2,
  });

  heroRig?.update(0, -0.18, dt, true, 0.25, (wetMode ? 0.5 : 0) + (activeTod === 'night' ? 0.8 : 0));
  lensRain.update(dt, wetMode ? 0.55 : 0, 12, wetMode, innerWidth / Math.max(1, innerHeight));
  apexPost.update({
    dt,
    speed01: 0,
    aspect: innerWidth / Math.max(1, innerHeight),
    lens: activeLens,
    lensRain,
  });

  sun.target.position.copy(focusVec);
  sun.position.copy(focusVec).addScaledVector(sunDir, 1800);
  playkitLighting.update(dt, camera, focusVec, 0, activeTod === 'night' ? 0.15 : 0.85);

  if (post) post.render();
  else renderer.render(scene, camera);

  if (times.length % 15 === 0) {
    const s = [...times].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)] || 16.7;
    const p90 = s[Math.floor(s.length * 0.9)] || med;
    const info = renderer.info.render as unknown as { drawCalls?: number; calls?: number; triangles: number };
    const passes = post ? post.activePasses.join(' → ') : 'direct';
    hud.textContent =
      `Plajah Motorsport: Apex · Unified Playkit WebGPU + TSL\n` +
      `backend     ${backend}\n` +
      `frame       ${med.toFixed(1)} ms median (${(1000 / med).toFixed(0)} fps) · ${p90.toFixed(1)} ms p90\n` +
      `draw calls  ${info.drawCalls ?? info.calls ?? '?'} · triangles ${(info.triangles / 1e6).toFixed(2)} M\n` +
      `v4 heroes   ${loadedHeroes}/${heroItems.length} · car ${carLoaded ? 'vanguard-full-tsl' : 'loading'} · skyline ${bgItems.length}\n` +
      `playkit GI  ${playkitLighting.probeVolume.count} SH9 probes · ${playkitLighting.totalRegisteredLights} clustered lamps · look ${playkitLighting.activeLookVolumeId ?? 'open'}\n` +
      `post stack  ${passes}\n` +
      `mode        ${activeTod} · wet=${wetMode ? 'on' : 'off'} · lens=${activeLens} · scale=${internalScale.toFixed(2)}x`;
    (window as unknown as { spike: unknown }).spike = {
      backend, med, p90, calls: info.drawCalls ?? info.calls, tris: info.triangles,
      heroes: loadedHeroes, carLoaded, look: playkitLighting.activeLookVolumeId, passes: post?.activePasses ?? [],
      lens: activeLens,
    };
  }
});
