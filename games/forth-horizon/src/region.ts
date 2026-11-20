// Region terrain viewer: height field + satellite albedo + circuits, for design review.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GpuTextureLoader, initKTX2 } from './ktx2';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { CarProbe } from './carProbe';
import { carvePads, type Pad } from './pads';
import { groundU, loadGroundArrays } from './groundArrays';
import { buildYards, type YardData } from './yards';
import { buildTrench, type TrenchLine } from './trench';
import { CityBatches, type CityPart } from './cityBatch';
import { patchFacadeMasonry, patchGlassInterior, patchPunchedInterior } from './buildingShaders';
import { makeSovereign } from './car';
import { makeRivalCar, type RivalCarVariant } from './rivalCars';
import { garage, cloud, activeSpec, hasCar, RunTracker, PathProgress, refParSec, showBanner, showCard, DeliveryGame, makeSpots, TIER_LIST } from './garageGame';
import { medalFor } from './garage/progress';
import { smoothClosedPath } from './circuitSmooth';
import { PhotoMode } from './photo';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { hasScanCar, loadScanCarById, loadScanOpponentCar, RACE_OPPONENT_SCAN_IDS } from './scancar';
import { Replay } from './broadcastReplay';
import { createCarState, stepCarPhysics, setWorldBounds, type CarState, type CarInput } from './physics';
import { CARS } from './manufacturers';
import { GameAudio } from './audio';
import { Sky } from './sky';
import { WaterSurface } from './water';
import { DriveInput } from './inputs';
import { TrackKit } from './trackkit';
import { buildPinewoodRallyCircuit } from './circuits/pinewoodRally';
import { buildCliffRacewayCircuit } from './circuits/cliffRaceway';
import { carveCliffRaceway, designCliffTrack, indexTrack, cliffSurface, type TrackDesign, type TrackIndex } from './circuits/cliffTrack';
import { buildCountryScenes, carveCreek, type CountryScenes, type RoadNetwork, type Shoreline, carveShoreline } from './countryScenes';
import { buildRuralOpenWorldDetail } from './ruralDetail';
import { buildCityExpansion } from './cityExpansion';
import { buildRiverBridges, carveRiverReaches, routeOverBridges, gradeFromFoot, bridgeCorridors } from './riverBridges';
import { gradeRoads, corridor, type GradeRoad, type GradeClass } from './roadGrade';
import { carveScenicRoads, buildScenicRoads, scenicCorridors, railIndex, railPenetration, type ScenicRoad, type RailSeg } from './scenicRoads';
import { createMapEditor, ROAD_STYLE, type RoadKind, type UserMap } from './mapEditor';
import { CompetitionEngine } from './racingAI';
import { TrafficManager, OpenWorldChallengeManager, type FestivalData } from './openWorldEvents';
import { buildFestival } from './festival';
import { createFestProgress, type FestProgress } from './festProgress';
import { createFestMap, type MapRoad } from './festMap';
import { HOSTS } from '../../../services/onair/hosts';
import { onAirNow } from '../../../services/onair/station';
import { CopsAndRobbersMode, type PursuitRoleChoice } from './copsAndRobbers';
import { OnlineSessionManager } from './onlineMultiplayer';
import { SpatialCuller, runWithConcurrency, populateTiledTerrain, populateTerrainLOD, detectInitialTier, TIER_CONFIGS, type PerfTier } from './enginePerf';
import { harborDetail } from './harborDetail';
import { duneDetail } from './duneDetail';
import { Vegetation } from './vegetation';
import { buildIndustrialCircuit, carveIndustrialCutting, industrialProfile, type GradeFeature } from './industrialCircuit';
import { buildIronworksDistrict } from './ironworksDistrict';
import { buildCivicRiverfront, type CivicPlan } from './civicDistrict';
import { glassSelects } from './glassSelect';
import { buildParkingLots } from './parkingLots';
import { buildUtilities, type UtilitiesData } from './utilities';
import { mergeByMaterial } from './carBatch';
import { SimLayer, carveSim, planSim, type SimPlan } from './simLayer';
import { REF_SCENES, autumnLeaf, buildReferenceDressing, type RefDressing } from './referenceScenes';
import { buildTownSidewalks } from './townStreets';
import { buildParkedCars } from './parkedCars';
import { denseArea } from './sim/signals';
import type { UserMapData } from './sim/data';
import { buildPortDistrict, carvePlatform, inPort, type PortData } from './portDistrict';
import { injectRoadPbr, roadUniforms, loadRoadPbr } from './roadpbr';
loadRoadPbr();
import { SprayFx, DustFx, puddleDepth, PUDDLE_GLSL } from './spray';
import { TreeField, cardLod } from './trees';
import { EzTreeField } from './ezforest';
import { GrassField } from './grass';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AoPass } from './ao';
import { RacingLine, ChevronLine } from './racingline';
import { CSM } from 'three/addons/csm/CSM.js';
import { GradePass, GAME_LENSES, GAME_LUTS, type GameLens } from './grade';
import { WeatherRig, WEATHERS, worstOf, forecastText } from './weather';
import { LensRain, LENS_RAIN_GLSL } from './lensRain';
import { RacingHud } from './racingHud';
import { WetRoad, waterContact } from './wetRoad';
import { FrameProfiler, gpuPreference } from './performance';
import { InstanceVisibility, CityVisibility } from './instanceVisibility';
import { Atmosphere } from './atmosphere';
// Opt-in A/B experiment; default renderer and Gemini's performance controls are unchanged.
const atmosphere = new URLSearchParams(location.search).get('atmosphere') === '1' ? new Atmosphere() : null;
const cityVisibility = new CityVisibility();
const lensRain = new LensRain();
const roadWater = new WetRoad();
import type { SurfaceType } from './world';
import { GRID } from './grid';

const BASE = '/games/forth-horizon/region/';

interface PolyXZ { xz: number[][]; y?: number[] }
interface CircuitDef extends PolyXZ { name: string; kind: string; tunnel?: { from: number; to: number }; corners?: { n?: number; name: string; turn: number; x: number; z: number }[] }
interface RegionMeta {
  width: number; height: number; mpp: number;
  circuits: Record<string, CircuitDef>;
  river: PolyXZ; coastal_highway: PolyXZ; freeway: PolyXZ;
  places: { name: string; xz: number[] }[];
}

const view = document.getElementById('view') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const msg = document.getElementById('msg') as HTMLElement;

let requestedGpu: WebGLPowerPreference = 'default';
try { requestedGpu = gpuPreference(new URLSearchParams(location.search).get('gpu') ?? localStorage.getItem('apex.gpu')); } catch { /* use browser default */ }
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: requestedGpu });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
view.appendChild(renderer.domElement);
const frameProfiler = new FrameProfiler(renderer);
const carProbe = new CarProbe(renderer);              // the hero car's own reflections (carProbe.ts)
(window as unknown as { carProbe: CarProbe }).carProbe = carProbe;
queueMicrotask(() => { (window as unknown as { setTod: (k: string) => void }).setTod = (k: string) => setTimeOfDay(k); });   // review hook: daylight for looking at materials
initKTX2(renderer);

const scene = new THREE.Scene();
atmosphere?.prepare(scene);
scene.background = new THREE.Color(0x9bb7d4);
scene.fog = new THREE.Fog(0x9bb7d4, 12000, 42000);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 5, 80000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.495;
controls.zoomSpeed = 1.4;

// ---------- lighting, sky, textures and post effects ----------
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4a38, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(-9000, 12000, -6000);
scene.add(sun);
scene.add(sun.target);
const sunDir = new THREE.Vector3(-0.5, 0.7, -0.4).normalize();
// The sun's shadows are cascaded: three shadow maps over 0 to 900 m (sharp around the car, softer across the street, soft over the district). `sun` stays as the
// holder of the sun's colour and strength (the weather writes to it); the cascade lights copy it every frame and do the lighting and shadowing.
// Settings > Graphics > Shadows: "cascaded" (default) or "basic" (the earlier single shadow map, lighter on weak GPUs); changing it reloads the page.
// The cascaded option is experimental and OFF by default: with it the cascade lights stack on the ground and the streets wash out to a flat beige (the street textures
// "glitched" and the streets off the circuit looked untextured). Basic is the default until the cascade masking is fixed.
// Building textures: v3 is the photoreal delivery of 2026-11-16 (36 hero facades + 24 shared materials, tools/pack_ironport_v3.py); v1 is the earlier packed set with our Flow
// replacements. ?tex=v1 or v3, or Settings. Hero sheets listed in V3_HOLD keep v1 because their v3 layout does not fit the model (checked building by building).
let TEXSET: 'v1' | 'v3' = 'v3';
try { const q = new URLSearchParams(location.search).get('tex') ?? localStorage.getItem('apex.tex'); if (q === 'v1' || q === 'v3') TEXSET = q; } catch { /* storage blocked */ }
const V3_HOLD = new Set<string>([]);
// Building models: v3 is the detail pass (real doors, framed windows, trim; the same 86 buildings with identical footprints), v1 the earlier models. ?models=v1 or v3, or Settings.
let MODELSET: 'v1' | 'v3' = 'v3';
try { const q = new URLSearchParams(location.search).get('models') ?? localStorage.getItem('apex.models'); if (q === 'v1' || q === 'v3') MODELSET = q; } catch { /* storage blocked */ }
let SHADOWS = 'basic';
try { SHADOWS = localStorage.getItem('apex.shadows') === 'cascaded' ? 'cascaded' : 'basic'; } catch { /* storage blocked */ }
const csm = SHADOWS === 'cascaded' ? new CSM({ maxFar: 700, cascades: 2, mode: 'practical', parent: scene, shadowMapSize: 2048, lightDirection: sunDir.clone().negate(), camera, lightIntensity: 2.4, shadowBias: -0.0004 }) : null;
if (csm) {
  sun.visible = false; sun.castShadow = false;
  csm.fade = true;
  csm.lights.forEach((l, i) => { l.shadow.normalBias = [0.1, 0.9][i] ?? 1; });
} else {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -380; sun.shadow.camera.right = 380; sun.shadow.camera.top = 380; sun.shadow.camera.bottom = -380;
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 6000;
  sun.shadow.bias = -0.0012; sun.shadow.normalBias = 1.1;
}
const csmCast = [true, true, true];                 // which cascades draw a shadow map (debug / quality switch)
(window as unknown as { csmCast: boolean[] }).csmCast = csmCast;
const csmDone = new WeakSet<THREE.Material>();
/** make a lit material use the cascades; chains whatever shader patch it already has (the stock CSM setup would replace it) */
function csmSetup(m: THREE.Material): void {
  if (!csm || csmDone.has(m)) return;
  csmDone.add(m);
  const mm = m as THREE.MeshStandardMaterial;
  mm.defines = mm.defines || {};
  mm.defines.USE_CSM = 1; mm.defines.CSM_CASCADES = csm.cascades; if (csm.fade) mm.defines.CSM_FADE = '';
  const prev = mm.onBeforeCompile;
  const breaks: THREE.Vector2[] = [];
  mm.onBeforeCompile = (shader, r) => {
    prev?.call(mm, shader, r);
    const far = Math.min(camera.far, csm.maxFar);
    (csm as unknown as { _getExtendedBreaks(b: THREE.Vector2[]): void })._getExtendedBreaks(breaks);
    shader.uniforms.CSM_cascades = { value: breaks }; shader.uniforms.cameraNear = { value: camera.near }; shader.uniforms.shadowFar = { value: far };
    (csm.shaders as unknown as Map<THREE.Material, unknown>).set(mm, shader);
  };
  (csm.shaders as unknown as Map<THREE.Material, unknown>).set(mm, null);
  mm.needsUpdate = true;
}
// ---------- shader warm-up ----------
// Three compiles a material the first frame it is drawn, and several hundred materials come into view the moment a race starts (trees, grass, buildings with the cascade
// patch). Do that work during the menu instead: once the city, forest and grass exist, compile everything with the drive-mode groups switched on, then upload the textures
// one per frame. The cascade setup runs first so no material compiles twice.
let warmed = false;
let prewarmCar: THREE.Group | null = null;
async function warmShaders(): Promise<void> {
  if (warmed) return;
  warmed = true;
  csmSweep(true);
  const groups = [forestGroup, scapeGroup, furnitureGroup, streetGroup, cityGroup];
  const was = groups.map((g) => g.visible);
  groups.forEach((g) => { g.visible = true; });
  try { await (renderer as unknown as { compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  // the car is the heaviest set of shaders and loads a 14 MB scan: build it now, compile it, and hand it to the first race
  if (!driving) try {
    const car = makeCar(); car.position.set(0, -4000, 0); scene.add(car); prewarmCar = car;
    for (let i = 0; i < 100 && !car.userData.panels && prewarmCar === car; i++) await new Promise((r) => setTimeout(r, 250));
    csmSweep(true);
    await (renderer as unknown as { compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera);
    if (prewarmCar === car) scene.remove(car);
  } catch (e) { console.warn('car warm-up failed', e); if (prewarmCar) prewarmCar = null; }
  groups.forEach((g, i) => { g.visible = was[i]; });
  const tex = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const ms = (o as THREE.Mesh).material; if (!ms) return;
    for (const m of Array.isArray(ms) ? ms : [ms]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const) { const t = (m as unknown as Record<string, THREE.Texture | null>)[k]; if (t && (t as THREE.Texture).isTexture && (t as THREE.Texture).image) tex.add(t); }
  });
  const q = [...tex];
  const step = (): void => { const t = q.pop(); if (!t) { console.log('warm-up done'); return; } try { renderer.initTexture(t); } catch { /* not ready */ } requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const warmTimer = setInterval(() => { if ((window as unknown as { cityCount?: number }).cityCount && treeFields.length >= 3 && (grassField || vegetation) && !warmed) { clearInterval(warmTimer); void warmShaders(); } }, 600);
let csmTick = 0;
const csmVisited = new WeakSet<THREE.Object3D>();
/** every lit material in the scene must use the cascades, or it is lit three times over: scan only newly added nodes */
function csmSweep(force = false): void {
  if (!csm || (!force && csmTick++ % 120 !== 0)) return;
  const chk = (m: THREE.Material): void => { const x = m as unknown as Record<string, boolean>; if (!csmDone.has(m) && (x.isMeshStandardMaterial || x.isMeshPhysicalMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial)) csmSetup(m); };
  scene.traverse((o) => {
    if (!force && csmVisited.has(o)) return;
    csmVisited.add(o);
    const m = (o as THREE.Mesh).material;
    if (m) { if (Array.isArray(m)) m.forEach(chk); else chk(m); }
  });
}

const TEXBASE = '/games/forth-horizon/tex/';
const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function gameTex(name: string, repeat = true): THREE.Texture {
  const key = name + (repeat ? '' : ':c');
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(TEXBASE + name + '.jpg');
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    texCache.set(key, t);
  }
  return t;
}

interface Tod { sky: string; sun: number; sunInt: number; sunPos: [number, number, number]; hemiSky: number; hemiGround: number; hemiInt: number; fog: number; fogNear: number; fogFar: number; exposure: number; env: number }
const TOD: Record<string, Tod> = {
  clear:   { sky: 'sky_clear',   sun: 0xfff6e6, sunInt: 3.5, sunPos: [-6000, 12000, -4000], hemiSky: 0xaad2ff, hemiGround: 0x5c5b52, hemiInt: 1.45, fog: 0xb6d2ec, fogNear: 9000, fogFar: 42000, exposure: 1.05, env: 1.15 },
  golden:  { sky: 'sky_golden',  sun: 0xffc884, sunInt: 3.7, sunPos: [-12000, 5200, -2000], hemiSky: 0x9ec6f7, hemiGround: 0x585348, hemiInt: 1.35, fog: 0xbcd0e2, fogNear: 7000, fogFar: 38000, exposure: 1.08, env: 1.15 },
  sunset:  { sky: 'sky_sunset',  sun: 0xff8c48, sunInt: 3.1, sunPos: [-13000, 2500, -1500], hemiSky: 0x7c98cf, hemiGround: 0x3b3544, hemiInt: 1.1, fog: 0x9ea2bd, fogNear: 6000, fogFar: 34000, exposure: 1.12, env: 1.05 },
  dusk:    { sky: 'sky_dusk',    sun: 0x9296cc, sunInt: 1.15, sunPos: [-13000, 900, -1200], hemiSky: 0x6278ba, hemiGround: 0x242836, hemiInt: 0.85, fog: 0x546390, fogNear: 4000, fogFar: 30000, exposure: 1.25, env: 0.95 },
  night:   { sky: 'sky_night',   sun: 0x8aa8e0, sunInt: 0.35, sunPos: [-8000, 9000, -5000], hemiSky: 0x2a3d66, hemiGround: 0x151a26, hemiInt: 0.62, fog: 0x0e1628, fogNear: 2500, fogFar: 24000, exposure: 1.45, env: 1.0 },
  sunrise: { sky: 'sky_sunrise', sun: 0xffc694, sunInt: 3.0, sunPos: [12000, 3500, 2000], hemiSky: 0xa4c4eb, hemiGround: 0x4c484c, hemiInt: 1.18, fog: 0xc2cfe0, fogNear: 6000, fogFar: 34000, exposure: 1.08, env: 1.08 },
};
const pmrem = new THREE.PMREMGenerator(renderer);
let skyTex: THREE.Texture | null = null;
const mapFadeU = { value: 0 };
const wetU = { value: 0 };
const poolU = { value: 0 };                 // how much standing water has collected (0 dry .. 1 flooded)
let poolLevel = 0, hydro = 0;
const edgeU = { value: new THREE.Vector2(8256, 4608) };
let waterMesh: THREE.Mesh | null = null;
let waterSurface: WaterSurface | null = null;
let mapMode = false;
let todKey = 'golden';
function setTimeOfDay(key: string): void {
  const t = TOD[key];
  if (!t) return;
  todKey = key;
  tintClouds(t.sun, t.hemiSky);
  sun.color.setHex(t.sun); sun.intensity = t.sunInt; sun.position.set(...t.sunPos); sunDir.set(...t.sunPos).normalize();
  hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiInt;
  if (!mapMode) { scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar); scene.background = new THREE.Color(t.fog); }
  renderer.toneMappingExposure = t.exposure;
  scene.environmentIntensity = t.env;
  sky.setBase(t.sky.replace('sky_', 'sky2_'), (tx) => {
    tx.mapping = THREE.EquirectangularReflectionMapping;
    skyTex = tx;
    scene.environment = pmrem.fromEquirectangular(tx).texture;
  });
}

const maskVec = new THREE.Vector4(0, 0, 1, 1);
let roadMask: { data: Uint8ClampedArray; w: number; h: number } | null = null;
const maskTex = new THREE.Texture();
fetch('/games/forth-horizon/region/city_mask.json').then((r) => r.json()).then((m) => {
  maskVec.set(m.x0, m.z0, m.w, m.h);
  new THREE.TextureLoader().load('/games/forth-horizon/region/city_mask.png', (t) => {
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    try {
      const cv = document.createElement('canvas'); cv.width = t.image.width; cv.height = t.image.height;
      const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(t.image as CanvasImageSource, 0, 0);
      roadMask = { data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    } catch { roadMask = null; }
    maskTex.image = t.image; maskTex.flipY = false; maskTex.colorSpace = THREE.NoColorSpace; maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
    maskTex.minFilter = THREE.LinearMipmapLinearFilter; maskTex.magFilter = THREE.LinearFilter; maskTex.generateMipmaps = true; maskTex.anisotropy = 8; maskTex.needsUpdate = true;
  });
}).catch(() => undefined);
// terrain detail: close up, high-frequency grass, sand, forest floor and gravel from the reference textures ride on the satellite colour
const terrO = { value: new THREE.Vector2(0, 0) };                         // world position of the grid centre (GRID.ox, GRID.oz)
const terrV = { value: new THREE.Vector2(16512, 9216) };                  // world size of the height grid, for sampling the land class map
const classTex = new THREE.TextureLoader().load('/games/forth-horizon/region/landclass.png');
classTex.colorSpace = THREE.NoColorSpace; classTex.minFilter = THREE.LinearFilter; classTex.generateMipmaps = false;
function applyTerrainDetail(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGA = groundU.tGA; sh.uniforms.tGP = groundU.tGP; sh.uniforms.uGroundOn = groundU.uGroundOn; sh.uniforms.uGTune = groundU.uGTune;     // the ground's own PBR materials (groundArrays.ts)
    sh.uniforms.uCam = { value: new THREE.Vector3() };
    sh.uniforms.uMapFade = mapFadeU;
    sh.uniforms.uEdge = edgeU;
    sh.uniforms.tAsph = { value: gameTex('asphalt_plain') };
    sh.uniforms.tPave = { value: gameTex('paver_plain') };
    sh.uniforms.tMask = { value: maskTex };
    sh.uniforms.tClass = { value: classTex };
    sh.uniforms.uTerr = terrV; sh.uniforms.uTerrO = terrO;
    sh.uniforms.uMask = { value: maskVec };
    sh.uniforms.uWet = wetU;
    sh.uniforms.uPool = poolU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nuniform highp sampler2DArray tGA;\nuniform highp sampler2DArray tGP;\nuniform float uGroundOn;\nuniform vec4 uGTune;\nuniform sampler2D tMask;\nuniform sampler2D tAsph;\nuniform sampler2D tPave;\nuniform vec4 uMask;\nuniform float uWet;\nuniform float uPool;\nuniform float uMapFade;\nuniform vec2 uEdge;\nuniform vec3 uCam;\nuniform sampler2D tClass;\nuniform vec2 uTerr;\nuniform vec2 uTerrO;\nfloat tHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\nfloat tNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y); }\n' + PUDDLE_GLSL)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.a *= mix(1.0, smoothstep(0.0, 1300.0, min(uEdge.x - abs(vWPos.x - uTerrO.x), uEdge.y - abs(vWPos.z - uTerrO.y))), uMapFade);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float gWet = 0.0;
      float gPud = 0.0;
      float gRoad = 0.0;
      float camD = distance(vWPos, uCam);
      vec2 muv = (vWPos.xz - uMask.xy) / uMask.zw;
      bool inMask = muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0;
      float road = 0.0, walk = 0.0, kerb = 0.0;
      if (inMask) {
        vec4 mk4 = texture2D(tMask, muv);
        if (mk4.a < 0.5) discard;                    // the depressed freeway's cut in the ground (plan_trench.py): the trench itself is drawn below (trench.ts)
        vec3 mk = mk4.rgb;
        road = smoothstep(0.42, 0.58, mk.r);
        walk = smoothstep(0.42, 0.58, mk.g) * (1.0 - road);
        kerb = (1.0 - road) * smoothstep(0.08, 0.38, mk.r) * walk;
      }
      float fade = 1.0 - smoothstep(250.0, 1500.0, camD);
      vec3 smoothN = normalize(vWNorm); if (smoothN.y < 0.0) smoothN = -smoothN;
      vec2 gTN = vec2(0.0); float gTW = 0.0, gTR = 0.0;                // the ground material's normal (x,y), how much of it applies, its roughness
      vec3 gRockN = vec3(0.0); float gRockW = 0.0, gRockR = 0.84;      // world-space cliff strata & snow crystalline normal relief
      if (fade > 0.01 && road < 0.995 && (walk * (1.0 - kerb)) < 0.995) {
        vec3 b = diffuseColor.rgb;                                       // the satellite colour
        float lum = dot(b, vec3(0.299, 0.587, 0.114));
        float greenness = clamp((b.g - max(b.r, b.b)) * 7.0, 0.0, 1.0);
        float dark = 1.0 - smoothstep(0.12, 0.3, lum);
        vec3 cls = texture2D(tClass, vec2((vWPos.x - uTerrO.x) / uTerr.x + 0.5, 1.0 - ((vWPos.z - uTerrO.y) / uTerr.y + 0.5))).rgb;
        float sandy = cls.r, forestK = max(cls.g, dark * greenness), fieldK = cls.b * (1.0 - forestK);
        float rockK = smoothstep(0.22, 0.48, 1.0 - smoothN.y);           // smooth per-pixel interpolated slope (no flat polygon facets!)
        // field rows (farmland): alternating soil and crop
        vec2 fcell = floor(vWPos.xz / 160.0); float fh = tHash(fcell);
        float rowsK = 0.5 + 0.5 * sin((fh > 0.5 ? vWPos.z : vWPos.x) * 1.3 + fh * 40.0);
        float macro = tNoise(vWPos.xz / 55.0) * 0.6 + tNoise(vWPos.xz / 17.0) * 0.4;
        float wv[8];
        float open = (1.0 - forestK) * (1.0 - sandy);
        float gk = clamp((b.g - b.r * 0.92) * 5.0 + uGTune.y, 0.0, 1.0);          // Michigan is green: lean to meadow unless the photo is clearly brown
        wv[0] = open * (0.3 + 0.7 * gk) * (1.0 - fieldK * 0.7) * (0.6 + 0.8 * macro);
        wv[1] = open * (1.0 - gk) * 0.6 * (1.0 - fieldK * 0.5) * (1.4 - 0.8 * macro) + fieldK * rowsK * 0.8;
        wv[2] = forestK * (1.0 - sandy);
        wv[3] = fieldK * (1.0 - rowsK) * 0.9 + open * (1.0 - gk) * 0.05;
        wv[4] = (1.0 - gk) * (1.0 - sandy) * (1.0 - forestK) * 0.06;
        wv[5] = sandy;
        wv[6] = fieldK * (1.0 - rowsK) * 0.25 * macro;
        wv[7] = 0.0;
        float tot = 0.0;
        for (int i = 0; i < 7; i++) { wv[i] *= (1.0 - rockK); tot += wv[i]; }
        wv[7] = rockK; tot += rockK;
        float tile[8]; tile[0] = 3.6; tile[1] = 3.4; tile[2] = 4.2; tile[3] = 4.0; tile[4] = 3.0; tile[5] = 4.6; tile[6] = 3.6; tile[7] = 6.5;
        vec3 alb = vec3(0.0); vec4 surf = vec4(0.0); float wsum = 0.0;
        // Skip all biome 2DArray texture fetches beyond uGTune.z (where near == 0), and blend only the Top-2 dominant biomes (cuts max fetches from 24 -> 6 with zero visual loss)
        if (camD < uGTune.z && uGroundOn > 0.5) {
          int b0 = 0, b1 = 0;
          float w0 = -1.0, w1 = -1.0;
          for (int i = 0; i < 8; i++) {
            float wi = wv[i] / max(tot, 1e-4);
            if (wi > w0) { w1 = w0; b1 = b0; w0 = wi; b0 = i; }
            else if (wi > w1) { w1 = wi; b1 = i; }
          }
          vec2 dPdx = dFdx(vWPos.xz), dPdy = dFdy(vWPos.xz);
          bool useRot = camD < 185.0;
          mat2 rot = mat2(1.0, 0.0, 0.0, 1.0);
          if (useRot) { float ra = tNoise(vWPos.xz / 31.0) * 6.2831; rot = mat2(cos(ra), sin(ra), -sin(ra), cos(ra)); }
          for (int k = 0; k < 2; k++) {
            int bi = (k == 0) ? b0 : b1;
            float wi = (k == 0) ? w0 : w1;
            if (wi < 0.06) continue;
            float scA = tile[bi] * uGTune.w;
            vec2 uvA = vWPos.xz / scA;
            vec2 gxA = dPdx / scA, gyA = dPdy / scA;
            vec3 cA = textureGrad(tGA, vec3(uvA, float(bi)), gxA, gyA).rgb;
            if (useRot) {
              float scB = scA * 2.7;
              vec2 uvB = rot * (vWPos.xz / scB) + 0.37;
              float m = smoothstep(0.35, 0.65, tNoise(vWPos.xz / 9.0 + float(bi)));
              cA = mix(cA, textureGrad(tGA, vec3(uvB, float(bi)), rot * (dPdx / scB), rot * (dPdy / scB)).rgb, m * 0.5);
            }
            alb += wi * cA;
            surf += wi * textureGrad(tGP, vec3(uvA, float(bi)), gxA, gyA);
            wsum += wi;
          }
        }
        if (wsum > 0.01) {
          alb /= wsum; surf /= wsum;
          float near = (1.0 - smoothstep(uGTune.z * 0.18, uGTune.z, camD)) * fade;
          float al = max(dot(alb, vec3(0.299, 0.587, 0.114)), 0.04);
          // keep the photo's large-scale light and shade (fields, clearings, worn patches) as a gentle tint, and the material's detail at full strength
          vec3 ground = alb * mix(1.0, clamp(lum / al, 0.55, 1.6), uGTune.x) * (1.0 + (macro - 0.5) * 0.22);
          ground *= mix(1.0, surf.a, 0.55);                              // occlusion in the cracks
          diffuseColor.rgb = mix(b, ground, near);
          gTN = surf.rg * 2.0 - 1.0; gTW = near; gTR = surf.b;
        } else {
          diffuseColor.rgb *= 1.0 + (macro - 0.5) * 0.34 * fade;
        }
        // Wine-country tulip flower beds: rich sunlit petal clusters + dark green leaf furrows visible across the valley
        float chroma = max(b.r, max(b.g, b.b)) - min(b.r, min(b.g, b.b));
        if (vWPos.z < -4200.0 && vWPos.y < 140.0 && chroma > 0.18 && b.g < max(b.r, b.b) * 0.90) {
          float tNear = (1.0 - smoothstep(120.0, 680.0, camD)) * smoothstep(0.18, 0.32, chroma);
          float row = 0.5 + 0.5 * sin(vWPos.x * 5.2 + tNoise(vWPos.xz / 18.0) * 1.6);
          float bloom = smoothstep(0.26, 0.72, tNoise(vWPos.xz * 3.1) * 0.65 + tNoise(vWPos.xz * 9.5) * 0.35);
          float speck = tNoise(vWPos.xz * 12.0);
          vec3 stemCol = vec3(0.05, 0.14, 0.04) * (0.7 + 0.5 * speck);
          vec3 petalCol = b * (0.78 + 0.52 * speck);
          vec3 tulip = mix(stemCol, petalCol, bloom * (0.28 + 0.72 * row));
          diffuseColor.rgb = mix(diffuseColor.rgb, tulip, tNear * 0.92);
          gTN = mix(gTN, vec2((speck - 0.5) * 1.6, (bloom - 0.5) * 1.6), tNear * 0.85);
          gTW = max(gTW, tNear * 0.85);
          gTR = mix(gTR, 0.74, tNear);
        }
      }
      {
        // Dramatic dark coastal basalt & granite cliffs: irregular domain-warped oblique strata, vertical crag fissures, crevice AO & mossy ledges (zero flat diamonds or tan Venetian blinds)
        float warpLo = tNoise(vWPos.xz / 65.0) * 14.0 + tNoise(vWPos.xz / 19.0) * 4.2;
        float slopeRaw = 1.0 - smoothN.y;
        float steep = smoothstep(0.20, 0.46, slopeRaw + (tNoise(vWPos.xz / 24.0) - 0.5) * 0.10);
        float lumB = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float snowMask = smoothstep(0.68, 0.88, lumB) * smoothstep(220.0, 340.0, vWPos.y);
        float rockAmt = steep * (1.0 - snowMask) * (1.0 - road);
        if (rockAmt > 0.01) {
          float yStrata = vWPos.y * 0.34 + vWPos.x * 0.045 - vWPos.z * 0.035 + warpLo;
          float strata = smoothstep(0.15, 0.85, tNoise(vec2(yStrata * 0.85, (vWPos.x - vWPos.z) / 55.0)));
          vec2 rockUv = vec2(vWPos.x * 0.75 + vWPos.z * 0.66, vWPos.y * 0.95);
          float crag = tNoise(rockUv / 11.0);
          float vertCrack = tNoise(vec2(rockUv.x / 3.4, rockUv.y / 14.0 + crag * 2.4));
          float microF = tNoise(rockUv / 2.2 + 4.1);
          float fissure = smoothstep(0.20, 0.46, vertCrack * 0.62 + microF * 0.38);
          float blot = tNoise(vec2(vWPos.x - vWPos.z, vWPos.y * 0.4) / 28.0);
          // Rich dark Lake Superior basalt/granite with weathered iron-ochre veins (realistic dark linear albedo under bright sun)
          vec3 darkBasalt = vec3(0.085, 0.092, 0.102);
          vec3 slateGranite = vec3(0.21, 0.21, 0.215);
          vec3 warmIron = vec3(0.27, 0.21, 0.16);
          vec3 rockC = mix(darkBasalt, mix(slateGranite, warmIron, smoothstep(0.42, 0.82, blot)), strata * 0.48 + crag * 0.34 + microF * 0.18);
          rockC *= (0.48 + 0.62 * fissure) * clamp(lumB / 0.32, 0.62, 1.05);
          // Dark evergreen moss clinging to gentler upper cliff shelves below alpine snowline
          float mossK = smoothstep(0.54, 0.78, smoothN.y + (crag - 0.5) * 0.22) * smoothstep(260.0, 130.0, vWPos.y) * (1.0 - smoothstep(10.0, 4.0, vWPos.y));
          rockC = mix(rockC, vec3(0.07, 0.12, 0.055), mossK * 0.58);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockC, rockAmt);
          // Analytical jagged crag + fracture normal relief (zero extra texture sampler)
          float dFx = (tNoise((rockUv + vec2(0.9, 0.0)) / 3.8) - tNoise((rockUv - vec2(0.9, 0.0)) / 3.8)) * 2.6;
          float dFy = (tNoise((rockUv + vec2(0.0, 0.9)) / 4.4) - tNoise((rockUv - vec2(0.0, 0.9)) / 4.4)) * 2.1;
          gRockN = vec3(dFx * 0.85, dFy * 0.75 + (strata - 0.5) * 0.55, -dFx * 0.85);
          gRockW = rockAmt * (1.0 - smoothstep(1400.0, 5200.0, camD) * 0.65);
          gRockR = mix(0.94, 0.56, fissure * (0.35 + 0.65 * blot)) * (1.0 - 0.52 * uWet);
        } else if (snowMask > 0.05) {
          // Crystalline micro-normal & wind-scoured sastrugi snow sparkle on high alpine ridges
          float s1 = tNoise(vWPos.xz / 14.0), s2 = tNoise(vWPos.xz / 3.2 + 5.7);
          gRockN = vec3((s1 - 0.5) * 0.55 + (s2 - 0.5) * 0.35, 0.0, (s2 - 0.5) * 0.45);
          gRockW = snowMask * (1.0 - smoothstep(800.0, 4000.0, camD) * 0.7);
          gRockR = 0.38 + 0.22 * s1;
        }
      }
      if (inMask && (road + walk + kerb) > 0.002) {
        vec2 sp = vWPos.xz;
        vec3 col = diffuseColor.rgb;
        if (walk > 0.005) {
          vec2 slabF = fract(sp / 1.7);
          float joint = 1.0 - smoothstep(0.0, 0.045, min(min(slabF.x, 1.0 - slabF.x), min(slabF.y, 1.0 - slabF.y)));
          float stain = 0.84 + 0.24 * tNoise(sp / 9.5);
          vec3 pave = texture2D(tPave, sp / 1.7).rgb * (0.84 + 0.20 * fract(sin(dot(floor(sp / 1.7), vec2(12.9898, 78.233))) * 43758.5453)) * stain;
          pave *= 1.0 - 0.28 * joint * (1.0 - smoothstep(25.0, 85.0, camD));
          col = mix(col, pave * 0.88, walk);
        }
        col = mix(col, vec3(0.42, 0.42, 0.40) * (0.85 + 0.25 * tNoise(sp / 2.2)), kerb);
        if (road > 0.005) {
          vec3 a1 = texture2D(tAsph, sp / 4.0).rgb, a2 = texture2D(tAsph, sp / 13.7 + 0.37).rgb;
          float cellN = fract(sin(dot(floor(sp / 6.0), vec2(12.9898, 78.233))) * 43758.5453);
          float cellM = fract(sin(dot(floor(sp / 23.0), vec2(39.3468, 11.135))) * 24634.6345);
          vec3 asph = a1 * (0.5 + a2 * 1.0) * (0.82 + 0.22 * cellN) * (0.86 + 0.2 * cellM);
          asph *= 1.0 - 0.28 * smoothstep(0.78, 0.98, cellN) * smoothstep(0.3, 0.9, a2.r);
          col = mix(col, asph * 1.15, road);
        }
        gWet = uWet * max(road, walk * 0.7);
        gRoad = road;
        gPud = puddleAt(vWPos.xz, uPool) * road * (1.0 - smoothstep(600.0, 1400.0, camD));
        col *= 1.0 - 0.42 * gWet;
        col *= 1.0 - 0.38 * gPud;
        diffuseColor.rgb = col;
      }
      diffuseColor.rgb *= 1.0 - 0.16 * uWet;           // wet ground everywhere`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(0.55, 1.0, gTR), gTW);\nroughnessFactor = mix(roughnessFactor, gRockR, gRockW);\nroughnessFactor = mix(roughnessFactor, 0.14, gWet);\nroughnessFactor = mix(roughnessFactor, 0.015, gPud);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.6, gPud);');
    sh.fragmentShader = injectRoadPbr(sh.fragmentShader, 'vWPos.xz');
    Object.assign(sh.uniforms, roadUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float dfade = gTW * (1.0 - road) * (1.0 - gPud);
        if (dfade > 0.002 || gRockW > 0.002) {
          vec3 nWv = inverseTransformDirection(normal, viewMatrix);
          if (dfade > 0.002) {
            vec3 refA = abs(nWv.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
            vec3 T = normalize(cross(refA, nWv)), B = cross(nWv, T);
            nWv = normalize(nWv + (T * gTN.x + B * gTN.y) * 0.9 * dfade);
          }
          if (gRockW > 0.002) {
            nWv = normalize(nWv + gRockN * 0.55 * gRockW);
          }
          normal = normalize((viewMatrix * vec4(nWv, 0.0)).xyz);
        }
      }`);
    m.userData.shader = sh;
  };
}

let composer: EffectComposer | null = null;
let cinePass: ShaderPass | null = null;
let aoPass: AoPass | null = null;
let bloomPass: UnrealBloomPass | null = null;
let outputPass: OutputPass | null = null;
let gradePass: GradePass | null = null;
let aaPass: ShaderPass | SMAAPass | null = null;
const USE_SMAA = (() => { try { return new URLSearchParams(location.search).get('aa') === 'smaa'; } catch { return false; } })();
let dbgCam: { pos: THREE.Vector3; at: THREE.Vector3 } | null = null;     // review tool: window.regionViewer.cam(x,y,z, tx,ty,tz) holds the camera still; cam() releases it
let fxOn = true;
try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // the scene is drawn into the composer's read buffer: give it a depth texture so the occlusion pass can read what was really drawn
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
  composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
  aoPass = new AoPass(camera, Math.max(320, Math.floor(innerWidth * 0.5)), Math.max(180, Math.floor(innerHeight * 0.5)));
  composer.addPass(aoPass);
  composer.setSize(innerWidth, innerHeight);
  // Quarter-res bloom (capped at 480x270): visually identical wide glow at ~4x lower GPU fill & bandwidth across 11 blur passes
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.min(480, Math.max(160, Math.floor(innerWidth * 0.25))), Math.min(270, Math.max(90, Math.floor(innerHeight * 0.25)))),
    0.42, 0.55, 0.82
  );
  composer.addPass(bloomPass);
  // cinematic pass: speed blur toward screen edges, 8-tap jittered sun shafts, lens rain, vibrance, vignette, grain,
  // plus fused ACESFilmic tone mapping + sRGB encode when GradePass is inactive (saves an entire full-res HalfFloat pass)
  cinePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uSpeed: { value: 0 }, uSun: { value: new THREE.Vector2(0.5, 0.8) }, uShaft: { value: 0 },
      uTime: { value: 0 }, uVig: { value: 0.28 }, uAspect: { value: 1.6 }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      uToneMap: { value: 1 }, uExposure: { value: 1.08 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uSpeed, uShaft, uTime, uVig, uAspect, uToneMap, uExposure; uniform vec2 uSun; uniform vec3 uSunCol;
      varying vec2 vUv;
      ${LENS_RAIN_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 rrtOdt(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
      vec3 acesFilmic(vec3 c, float expVal) {
        const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        return clamp(outM * rrtOdt(inM * (max(c, vec3(0.0)) * (expVal / 0.6))), 0.0, 1.0);
      }
      vec3 linToSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main() {
        vec2 c = vec2(0.5, 0.42);
        vec2 d = vUv - c;
        float rd = length(d * vec2(uAspect, 1.0));
        // speed blur: samples pulled toward the vanishing point, none in the center so the car and road ahead stay sharp
        float amt = uSpeed * 0.06 * smoothstep(0.10, 0.75, rd);
        vec3 col = vec3(0.0);
        float ca = (0.0007 + uSpeed * 0.0012) * rd;
        if (amt <= 0.0008) {
          col = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
        } else {
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            float t = float(i) / 5.0;
            acc += texture2D(tDiffuse, vUv - d * amt * t).rgb;
          }
          acc /= 6.0;
          col = vec3(
            mix(acc.r, texture2D(tDiffuse, vUv + d * ca).r, 0.45),
            acc.g,
            mix(acc.b, texture2D(tDiffuse, vUv - d * ca).b, 0.45)
          );
        }
        float j = hash(vUv * 1000.0 + uTime);
        // light shafts: 8 jittered march steps, skipped completely when sun is outside screen
        float sunDist = length(uSun - vUv);
        if (uShaft > 0.01 && sunDist < 1.15) {
          vec2 ds = (uSun - vUv) / 8.0;
          vec2 p = vUv + ds * j;
          vec3 accS = vec3(0.0);
          float w = 1.0;
          for (int i = 0; i < 8; i++) {
            vec3 s = texture2D(tDiffuse, p).rgb;
            float l = dot(s, vec3(0.3, 0.59, 0.11));
            accS += s * smoothstep(1.15, 2.5, l) * w;
            w *= 0.84;
            p += ds;
          }
          float toward = 1.0 - clamp(sunDist * 0.88, 0.0, 1.0);
          col += accS * 0.125 * uSunCol * uShaft * (0.25 + 0.75 * toward);
        }
        float lensMask, lensShade, lensSparkle;
        vec2 refractedUv = lensRainUv(vUv, lensMask, lensShade, lensSparkle);
        if (lensMask > 0.001) col = mix(col, texture2D(tDiffuse, refractedUv).rgb * lensShade + vec3(lensSparkle), lensMask);
        // Subtle AAA photographic clarity: clean vibrance without muddying skies or crushing shadow detail
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
        col = mix(vec3(luma), col, 1.0 + 0.12 * (1.0 - clamp(sat * 1.4, 0.0, 1.0)));
        // vignette and fine film grain
        col *= 1.0 - uVig * smoothstep(0.38, 1.08, rd);
        col += (j - 0.5) * 0.009;
        if (uToneMap > 0.5) col = linToSRGB(acesFilmic(col, uExposure));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  Object.assign(cinePass.uniforms, lensRain.uniforms);
  composer.addPass(cinePass);
  outputPass = new OutputPass();
  outputPass.enabled = false;
  composer.addPass(outputPass);
  // colour grade (the platform's cinematic LUTs) and film/tape lenses, after tone mapping; options in Settings > Graphics
  gradePass = new GradePass(innerWidth, innerHeight);
  try { gradePass.lut = localStorage.getItem('apex.lut') ?? 'none'; gradePass.lens = (localStorage.getItem('apex.lens') as GameLens) ?? 'none'; const a = parseFloat(localStorage.getItem('apex.lutAmt') ?? ''); if (!Number.isNaN(a)) gradePass.lutAmount = a; } catch { /* storage blocked */ }
  composer.addPass(gradePass);
  // Single-pass Luma FXAA (replaces 3 full-res SMAA passes & 2 full-res buffers for ~3x faster edge AA; ?aa=smaa restores SMAA)
  if (USE_SMAA) {
    aaPass = new SMAAPass();
  } else {
    aaPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uInvRes: { value: new THREE.Vector2(1 / innerWidth, 1 / innerHeight) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uInvRes; varying vec2 vUv;
        float lumaOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        void main() {
          vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
          vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uInvRes).rgb;
          vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * uInvRes).rgb;
          vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * uInvRes).rgb;
          vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * uInvRes).rgb;
          float lumaM = lumaOf(rgbM), lumaNW = lumaOf(rgbNW), lumaNE = lumaOf(rgbNE), lumaSW = lumaOf(rgbSW), lumaSE = lumaOf(rgbSE);
          float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
          float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
          if (lumaMax - lumaMin < max(0.045, lumaMax * 0.115)) { gl_FragColor = vec4(rgbM, 1.0); return; }
          vec2 dir = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), ((lumaNW + lumaSW) - (lumaNE + lumaSE)));
          float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
          dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + dirReduce), vec2(-8.0), vec2(8.0)) * uInvRes;
          vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
          vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
          float lumaB = lumaOf(rgbB);
          gl_FragColor = vec4((lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB, 1.0);
        }`,
    });
  }
  composer.addPass(aaPass);
} catch (e) { console.warn('post effects unavailable', e); composer = null; }

let meta: RegionMeta;
let heights: Float32Array;
let hiRes = false;                                   // the 6 m height grid and 4 m ground texture (tools/build_terrain_hi.py); ?hires=0 turns it off
let terrain: THREE.Group;
let terrainMat: THREE.MeshStandardMaterial;
const circuitGroup = new THREE.Group();
const labelGroup = new THREE.Group();
scene.add(circuitGroup, labelGroup);
circuitGroup.visible = false;      // the wide review ribbons; the street furniture (barriers, kerbs, gantry) stays on
let exag = 1;

function hAt(xw: number, zw: number): number {
  const px = (xw - GRID.ox) / meta.mpp + meta.width / 2;
  const py = (zw - GRID.oz) / meta.mpp + meta.height / 2;
  const x0 = Math.max(0, Math.min(meta.width - 2, Math.floor(px)));
  const y0 = Math.max(0, Math.min(meta.height - 2, Math.floor(py)));
  const fx = px - x0, fy = py - y0, W = meta.width;
  const a = heights[y0 * W + x0], b = heights[y0 * W + x0 + 1];
  const c = heights[(y0 + 1) * W + x0], d = heights[(y0 + 1) * W + x0 + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// height of the terrain MESH under a point: the mesh uses every second map pixel with two triangles per cell, so it is not the same surface as the
// bilinear hAt(); the car has to sit on what is drawn, or its tyres sink into the road
function meshH(xw: number, zw: number): number {
  const stride = 2, W = meta.width, H = meta.height;
  const px = Math.max(0, Math.min(W - 1, (xw - GRID.ox) / meta.mpp + W / 2)), py = Math.max(0, Math.min(H - 1, (zw - GRID.oz) / meta.mpp + H / 2));
  const nx = Math.floor((W - 1) / stride) + 1, ny = Math.floor((H - 1) / stride) + 1;
  const gi = Math.min(nx - 2, Math.floor(px / stride)), gj = Math.min(ny - 2, Math.floor(py / stride));
  const u = (px - gi * stride) / stride, v = (py - gj * stride) / stride;
  const hv = (i: number, j: number): number => heights[Math.min(j * stride, H - 1) * W + Math.min(i * stride, W - 1)] * exag;
  const a = hv(gi, gj), b = hv(gi + 1, gj), c = hv(gi, gj + 1), d = hv(gi + 1, gj + 1);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

const TERRAIN_LOD = !location.search.includes('terrainlod=0');               // distance LOD for the terrain tiles (enginePerf.populateTerrainLOD)
function buildTerrain(): void {
  const stride = 2;
  const nx = Math.floor((meta.width - 1) / stride) + 1;
  const ny = Math.floor((meta.height - 1) / stride) + 1;
  const pos = new Float32Array(nx * ny * 3);
  const uv = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const px = Math.min(i * stride, meta.width - 1);
      const py = Math.min(j * stride, meta.height - 1);
      const k = j * nx + i;
      pos[k * 3] = (px - meta.width / 2) * meta.mpp + GRID.ox;
      pos[k * 3 + 1] = heights[py * meta.width + px] * exag;
      pos[k * 3 + 2] = (py - meta.height / 2) * meta.mpp + GRID.oz;
      uv[k * 2] = px / (meta.width - 1);
      uv[k * 2 + 1] = 1 - py / (meta.height - 1);
    }
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let t = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const tmpGeo = new THREE.BufferGeometry();
  tmpGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tmpGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  tmpGeo.computeVertexNormals();
  const nor = tmpGeo.getAttribute('normal').array as Float32Array;
  tmpGeo.dispose();

  if (terrain) {
    if (TERRAIN_LOD) populateTerrainLOD(terrain, terrainMat, nx, ny, pos, uv, nor); else populateTiledTerrain(terrain, terrainMat, nx, ny, pos, uv, nor, 8, 6);
    return;
  }
  terrV.value.set(meta.width * meta.mpp, meta.height * meta.mpp); terrO.value.set(GRID.ox, GRID.oz);
  const tex = new THREE.TextureLoader().load(BASE + (hiRes ? 'albedo_hi.jpg' : 'albedo.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  terrainMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, transparent: false });
  applyTerrainDetail(terrainMat);
  terrain = new THREE.Group();
  terrain.name = 'terrain-tiles';
  if (TERRAIN_LOD) populateTerrainLOD(terrain, terrainMat, nx, ny, pos, uv, nor); else populateTiledTerrain(terrain, terrainMat, nx, ny, pos, uv, nor, 8, 6);
  scene.add(terrain);
  // water: region footprint, extended far to the west so the Great Lake runs to the horizon
  const rw = meta.width * meta.mpp, rh = meta.height * meta.mpp, ext = 60000;
  edgeU.value.set(rw / 2, rh / 2);                                               // half extents of the map, for the soft edge fade
  waterSurface = new WaterSurface(scene, rw, rh, ext, edgeU.value, GRID.ox - rw / 2, GRID.oz - rh / 2, atmosphere);
  waterMesh = waterSurface.mesh;
}

function ribbon(pts: number[][], ys: number[] | null, width: number, color: number, lift: number): THREE.Mesh {
  const n = pts.length;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = -dz * width / 2, nz = dx * width / 2;
    const y = (ys ? ys[i] : hAt(p[0], p[1])) * exag + lift;
    pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return new THREE.Mesh(g, m);
}

function label(text: string, x: number, y: number, z: number, color = '#ffffff', scale = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '600 40px Outfit, sans-serif';
  const tw = g.measureText(text).width;
  if (tw > 470) g.font = `600 ${Math.floor(40 * 470 / tw)}px Outfit, sans-serif`;   // a long name shrinks to fit instead of running off the label
  g.fillStyle = 'rgba(26,0,38,0.78)';
  const w = Math.min(500, g.measureText(text).width + 24);
  g.fillRect(256 - w / 2, 18, w, 60);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.fillText(text, 256, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.position.set(x, y, z);
  s.scale.set(0.30 * scale, 0.056 * scale, 1);
  s.renderOrder = 10;
  return s;
}

const COLORS: Record<string, number> = { city: 0xffaa28, rally: 0x3ce696, road_course: 0x3ce6e6 };

function buildOverlays(): void {
  circuitGroup.clear();
  labelGroup.clear();
  for (const [id, c] of Object.entries(meta.circuits)) {
    const width = c.kind === 'rally' ? 18 : 28; // drawn wider than real so it reads from the overview
    const r = ribbon(c.xz, c.y ?? null, width, COLORS[c.kind] ?? 0xffffff, 0.35);
    r.name = id;
    circuitGroup.add(r);
    const mid = c.xz[Math.floor(c.xz.length / 2)];
    labelGroup.add(label(c.name, mid[0], hAt(mid[0], mid[1]) * exag + 500, mid[1], '#' + (COLORS[c.kind] ?? 0xffffff).toString(16).padStart(6, '0')));
    if (c.tunnel && c.y) {
      for (const k of [c.tunnel.from, c.tunnel.to]) {
        const p = c.xz[k], y = c.y[k] * exag;
        const portal = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 8), new THREE.MeshBasicMaterial({ color: 0x151515 }));
        portal.position.set(p[0], y + 6, p[1]);
        circuitGroup.add(portal);
      }
      const a = c.xz[c.tunnel.from], b = c.xz[c.tunnel.to];
      const seg = c.xz.slice(c.tunnel.from, c.tunnel.to + 1);
      const ys = (c.y as number[]).slice(c.tunnel.from, c.tunnel.to + 1);
      const tn = ribbon(seg, ys, width + 4, 0xff4040, 0.5);
      (tn.material as THREE.MeshBasicMaterial).depthTest = true;
      circuitGroup.add(tn);
      labelGroup.add(label('TUNNEL', (a[0] + b[0]) / 2, ys[ys.length >> 1] * exag + 140, (a[1] + b[1]) / 2, '#ff8080', 0.7));
    }
  }
  const road = (p: PolyXZ, color: number, w: number) => circuitGroup.add(ribbon(p.xz, null, w, color, 0.3));
  // the coastal highway and the freeway are real asphalt in the world now (countryScenes); no flat grey review ribbons for them
  road(meta.river, 0x2f86c4, 0.01);
  for (const p of meta.places) labelGroup.add(label(p.name, p.xz[0], hAt(p.xz[0], p.xz[1]) * exag + 260, p.xz[1], '#ffe9a0', 0.8));
  // the north lands (tools/grow_north.py), the Chora Fest sites (region/festival.json) and the scenic roads, so the map reads as the festival's world
  for (const [name, x, z] of NORTH_PLACES) labelGroup.add(label(name, x, hAt(x, z) * exag + 300, z, '#ffe9a0', 0.8));
  for (const st of festivalData?.sites ?? []) labelGroup.add(label('CHORA FEST · ' + st.name.toUpperCase(), st.x, hAt(st.x, st.z) * exag + 380, st.z, '#ff6fb1', st.kind === 'main' ? 0.85 : 0.65));
  for (const r of scenicData) { const m = r.xz[r.xz.length >> 1]; labelGroup.add(label(r.name, m[0], r.y[r.xz.length >> 1] * exag + 180, m[1], '#d6e4ea', 0.5)); }
}
/** names for the north lands on the map (positions from region/north_lands.json) */
const NORTH_PLACES: [string, number, number][] = [
  ['Wine Country', 3200, -6000], ['Tulip Flats', -300, -5900], ['Finger Lake', 1450, -6900], ['The Giant Forest', -5000, -8300], ['The Escarpment', 2600, -9250],
  ['Superior Range', -3300, -12500], ['Glacier', -4400, -12100], ['Fjord Coast', -6700, -11400], ['Dry Canyons', 1000, -11300], ['North Shore', -2500, -14100],
];

// ---------- harbor ----------
interface HarborPlan {
  heading: number;
  quays: { pts: number[][] }[];
  terminals: { name: string; c: number[]; w: number; d: number }[];
  sheds: { c: number[]; w: number; d: number }[];
  tanks: number[][];
  berths: { type: string; c: number[]; len: number; beam: number }[];
  cranes: { c: number[]; dir: number }[];
  rail: number[][][];
}
const harborGroup = new THREE.Group();
harborGroup.name = 'harbor-group';
scene.add(harborGroup);
let harbor: HarborPlan | null = null;

function stdMat(color: number, rough = 0.85, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, parent: THREE.Object3D, metal = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(color, 0.7, metal));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function craneGroup(): THREE.Group {
  // ship-to-shore gantry crane: local +z is toward the water, local x along the quay
  const g = new THREE.Group();
  const steel = 0xb9bfc7, dark = 0x5d646d;
  for (const sx of [-14, 14]) for (const sz of [-14, 14]) box(2.4, 38, 2.4, steel, sx, 19, sz, g, 0.3);
  box(32, 3, 34, steel, 0, 39, 0, g, 0.3);
  for (const sx of [-14, 14]) box(2, 2, 34, dark, sx, 30, 0, g);
  box(3, 3.2, 78, steel, 0, 44, 22, g, 0.3);
  box(3, 3.2, 26, steel, 0, 44, -26, g, 0.3);
  box(6, 5, 6, 0xe0b040, 0, 41, 6, g);
  box(1, 22, 1, dark, 0, 55, -4, g);
  return g;
}
function shipGroup(type: string, len: number, beam: number): THREE.Group {
  // local +x is the bow
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, -beam / 2);
  shape.lineTo(len * 0.28, -beam / 2);
  shape.quadraticCurveTo(len * 0.46, -beam * 0.35, len / 2, 0);
  shape.quadraticCurveTo(len * 0.46, beam * 0.35, len * 0.28, beam / 2);
  shape.lineTo(-len / 2, beam / 2);
  shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 15, bevelEnabled: false });
  hullGeo.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, stdMat(type === 'container' ? 0x7a2a22 : 0x2f4a6b, 0.7, 0.1));
  hull.position.y = -8;
  g.add(hull);
  box(len * 0.98, 0.6, beam * 0.98, 0x5b5f64, 0, 7.1, 0, g);
  box(16, 22, beam * 0.72, 0xe8eaee, -len / 2 + 20, 18, 0, g);
  box(5, 8, 5, 0xc23b2b, -len / 2 + 14, 32, 0, g);
  if (type === 'container') {
    const cols = [0x2f6fb0, 0xc9482e, 0x3e9a5a, 0xd8a52a, 0x8a8f96, 0x5b3f8a];
    const bays = Math.floor((len * 0.62) / 12.6);
    const across = Math.floor((beam - 6) / 2.7);
    const geo = new THREE.BoxGeometry(12.2, 2.6, 2.5);
    const im = new THREE.InstancedMesh(geo, stdMat(0xffffff, 0.8), bays * across * 4);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    for (let b = 0; b < bays; b++) for (let a = 0; a < across; a++) {
      const tiers = 1 + ((b * 7 + a * 3) % 4);
      for (let t = 0; t < tiers; t++) {
        m4.makeTranslation(-len / 2 + 44 + b * 12.6 + 6, 8.7 + t * 2.62, (a - (across - 1) / 2) * 2.7);
        im.setMatrixAt(n, m4);
        im.setColorAt(n, col.setHex(cols[(b * 5 + a * 3 + t) % cols.length]));
        n++;
      }
    }
    im.count = n;
    g.add(im);
  } else {
    for (let i = 0; i < 5; i++) box(24, 3, beam * 0.66, 0x555a50, -len / 2 + 50 + i * 30, 8.8, 0, g);
  }
  return g;
}

function buildHarbor(): void {
  if (!harbor) return;
  harborGroup.clear();
  const h = harbor, ex = [Math.cos(h.heading), Math.sin(h.heading)], phi = -h.heading;
  const m4 = new THREE.Matrix4();
  // quay walls, coping, bollards, light poles
  const wallPos: number[] = [], wallIdx: number[] = [];
  const bol: number[][] = [], poles: number[][] = [];
  for (const q of h.quays) {
    const base = wallPos.length / 3;
    q.pts.forEach((p, i) => {
      const top = Math.max(hAt(p[0], p[1]), 1.6) * exag + 0.5;
      wallPos.push(p[0], -5, p[1], p[0], top, p[1]);
      if (i % 5 === 2) bol.push([p[0], top, p[1]]);
      if (i % 12 === 6) poles.push([p[0], top, p[1]]);
    });
    for (let i = 0; i < q.pts.length - 1; i++) {
      const a = base + i * 2;
      wallIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    harborGroup.add(ribbon(q.pts, q.pts.map((p) => Math.max(hAt(p[0], p[1]), 1.6) + 0.45), 2.6, 0x77797c, 0.06));
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wg.setIndex(wallIdx);
  wg.computeVertexNormals();
  harborGroup.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x8e9093, roughness: 0.95, side: THREE.DoubleSide })));
  const bIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.6, 1.0, 8), stdMat(0x23262b), Math.max(bol.length, 1));
  bol.forEach((b, i) => { m4.makeTranslation(b[0], b[1] + 0.5, b[2]); bIm.setMatrixAt(i, m4); });
  harborGroup.add(bIm);
  const pIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 24, 6), stdMat(0x40454c), Math.max(poles.length, 1));
  const hIm = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.8, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), Math.max(poles.length, 1));
  poles.forEach((b, i) => { m4.makeTranslation(b[0], b[1] + 12, b[2]); pIm.setMatrixAt(i, m4); m4.makeTranslation(b[0], b[1] + 24.3, b[2]); hIm.setMatrixAt(i, m4); });
  harborGroup.add(pIm, hIm);

  // container stacks
  const palette = [0x2f6fb0, 0xc9482e, 0x3e9a5a, 0xd8a52a, 0x8a8f96, 0x5b3f8a, 0xb5b9c0];
  const cells: { x: number; y: number; z: number; c: number }[] = [];
  for (const t of h.terminals) {
    const ey = [-ex[1], ex[0]];
    const nx = Math.floor((t.w - 8) / 12.6), nz = Math.floor((t.d - 8) / 2.8);
    for (let j = 0; j < nz; j++) {
      if (j % 7 === 6) continue;
      for (let i = 0; i < nx; i++) {
        if (i % 11 === 10) continue;
        const h0 = ((i * 13 + j * 7 + (i ^ j)) % 5);
        if (h0 === 0) continue;
        const lx = (i - (nx - 1) / 2) * 12.6, lz = (j - (nz - 1) / 2) * 2.8;
        const x = t.c[0] + ex[0] * lx + ey[0] * lz, z = t.c[1] + ex[1] * lx + ey[1] * lz;
        if (hAt(x, z) < 1.3) continue;               // stacks stay on land
        const gy = Math.max(hAt(x, z), 1.6) * exag;
        for (let k = 0; k < h0; k++) cells.push({ x, y: gy + 1.3 + k * 2.62, z, c: palette[(i * 3 + j * 5 + k) % palette.length] });
      }
    }
  }
  const cIm = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.5), stdMat(0xffffff, 0.8), Math.max(cells.length, 1));
  const col = new THREE.Color(), rq = new THREE.Matrix4().makeRotationY(phi);
  cells.forEach((c, i) => { m4.makeTranslation(c.x, c.y, c.z).multiply(rq); cIm.setMatrixAt(i, m4); cIm.setColorAt(i, col.setHex(c.c)); });
  cIm.frustumCulled = false;
  harborGroup.add(cIm);

  // transit sheds and warehouses: textured corrugated steel siding + weathered steel roof trim instead of plain untextured boxes
  const shedTex = new THREE.TextureLoader().load('/games/forth-horizon/ironport/textures-v3/shared/tex-shared-21-corrugated-steel_base.jpg');
  shedTex.colorSpace = THREE.SRGBColorSpace; shedTex.wrapS = shedTex.wrapT = THREE.RepeatWrapping; shedTex.repeat.set(8, 2); shedTex.anisotropy = 4;
  const shedNrm = new THREE.TextureLoader().load('/games/forth-horizon/ironport/textures-v3/shared/tex-shared-21-corrugated-steel_nrm.jpg');
  shedNrm.wrapS = shedNrm.wrapT = THREE.RepeatWrapping; shedNrm.repeat.set(8, 2); shedNrm.anisotropy = 4;
  const shedWallMat = new THREE.MeshStandardMaterial({ map: shedTex, normalMap: shedNrm, normalScale: new THREE.Vector2(1.8, 1.8), color: 0x8a9096, roughness: 0.72, metalness: 0.38 });
  const shedRoofMat = new THREE.MeshStandardMaterial({ color: 0x3b4856, roughness: 0.65, metalness: 0.45 });
  for (const s of h.sheds) {
    const gy = Math.max(hAt(s.c[0], s.c[1]), 1.6) * exag;
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, 11, s.d), shedWallMat);
    wMesh.position.set(s.c[0], gy + 5.5, s.c[1]); wMesh.rotation.y = phi; wMesh.castShadow = wMesh.receiveShadow = true;
    harborGroup.add(wMesh);
    const rMesh = new THREE.Mesh(new THREE.BoxGeometry(s.w * 1.02, 0.8, s.d * 1.02), shedRoofMat);
    rMesh.position.set(s.c[0], gy + 11.3, s.c[1]); rMesh.rotation.y = phi; rMesh.castShadow = rMesh.receiveShadow = true;
    harborGroup.add(rMesh);
  }
  // tank farm
  const tIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(9, 9, 16, 20), stdMat(0xd7d9dc, 0.6, 0.2), Math.max(h.tanks.length, 1));
  h.tanks.forEach((t, i) => { m4.makeTranslation(t[0], Math.max(hAt(t[0], t[1]), 1.6) * exag + 8, t[1]); tIm.setMatrixAt(i, m4); });
  harborGroup.add(tIm);
  // gantry cranes
  for (const c of h.cranes) {
    const g = craneGroup();
    g.position.set(c.c[0], Math.max(hAt(c.c[0], c.c[1]), 1.6) * exag, c.c[1]);
    g.rotation.y = phi + (c.dir < 0 ? Math.PI : 0);
    harborGroup.add(g);
  }
  // ships
  for (const b of h.berths) {
    const g = shipGroup(b.type, b.len, b.beam);
    g.position.set(b.c[0], 0, b.c[1]);
    g.rotation.y = phi;
    harborGroup.add(g);
  }
  harborGroup.add(harborDetail(h, (x, z) => Math.max(hAt(x, z), 1.6) * exag));
  // rail yard
  for (const r of h.rail) {
    const pts: number[][] = [];
    for (let i = 0; i <= 30; i++) pts.push([r[0][0] + (r[1][0] - r[0][0]) * i / 30, r[0][1] + (r[1][1] - r[0][1]) * i / 30]);
    harborGroup.add(ribbon(pts, null, 3.2, 0x57534d, 0.4));
    harborGroup.add(ribbon(pts, null, 0.35, 0xb8b2a6, 0.5));
  }
}

async function loadHarbor(): Promise<void> {
  const res = await fetch(BASE + 'harbor.json');
  if (!res.ok) return;
  harbor = (await res.json()) as HarborPlan;
  // the civic riverfront takes the east bank from the harbour circuit down to downtown (docs/apex-elohim/east-bank-masterplan.md): the old harbour's
  // terminals, sheds, tanks, berths, cranes, rail spurs and quays in that stretch are left out (its frontage on downtown, south of z 800, stays as it was)
  {
    const civic = (z: number): boolean => z > -2450 && z < 800;
    const h = harbor as unknown as Record<string, unknown[]>;
    const cz = (it: unknown): number => { const o = it as { c?: number[]; pts?: number[][] }; if (Array.isArray(it) && typeof it[1] === 'number') return it[1] as number; if (Array.isArray(it) && Array.isArray(it[0])) return ((it[0] as number[])[1] + (it[it.length - 1] as number[])[1]) / 2; if (o.c) return o.c[1]; if (o.pts) return o.pts.reduce((a, q) => a + q[1], 0) / o.pts.length; return 1e9; };
    for (const k of ['terminals', 'sheds', 'tanks', 'berths', 'cranes', 'rail', 'quays']) if (Array.isArray(h[k])) h[k] = h[k].filter((it) => !civic(cz(it)));
  }
  buildHarbor();
}

// ---------- city streets ----------
interface StreetRun { c: string; n: string; p: number[][] }
const streetGroup = new THREE.Group();
scene.add(streetGroup);
interface Acc { pos: number[]; idx: number[]; uv?: number[] }
function addRibbon(acc: Acc, pts: number[][], width: number, lift: number): void {
  const n = pts.length;
  if (n < 2) return;
  const base = acc.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = -dz * width / 2, nz = dx * width / 2;
    const y = meshH(p[0], p[1]) + lift;                       // on the drawn terrain mesh, not the bilinear height
    acc.pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = base + i * 2;
    acc.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}
function offsetPts(pts: number[][], d: number): number[][] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    return [p[0] - dz * d, p[1] + dx * d];
  });
}
function addRibbonUV(acc: Acc, pts: number[][], width: number, lift: number, tile: number): void {
  const n = pts.length;
  if (n < 2) return;
  if (!acc.uv) acc.uv = [];
  const base = acc.pos.length / 3;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = -dz * width / 2, nz = dx * width / 2;
    const y = hAt(p[0], p[1]) * exag + lift;
    acc.pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
    acc.uv.push(0, dist / tile, 1, dist / tile);
    if (i < n - 1) dist += Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = base + i * 2;
    acc.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}
function accMeshTex(acc: Acc, map: THREE.Texture, rough: number, po: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv ?? [], 2));
  g.setIndex(acc.idx);
  g.computeVertexNormals();
  const mm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po }));
  mm.receiveShadow = true;
  return mm;
}
function accMesh(acc: Acc, color: number, po: number, basic = false): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setIndex(acc.idx);
  g.computeVertexNormals();
  const m = basic
    ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po });
  return new THREE.Mesh(g, m);
}
let streetRuns: StreetRun[] = [];
async function buildStreets(): Promise<void> {
  if (!streetRuns.length) {
    const res = await fetch(BASE + 'city_streets.json');
    if (!res.ok) return;
    streetRuns = (await res.json()) as StreetRun[];
  }
  streetGroup.clear();
  const aS: Acc = { pos: [], idx: [], uv: [] }, aH: Acc = { pos: [], idx: [], uv: [] }, walk: Acc = { pos: [], idx: [], uv: [] };
  const W: Record<string, number> = { freeway: 22, ramp: 9, arterial: 16, street: 10 };
  // the carriageways and sidewalks are painted by the terrain shader from the baked street mask (city_mask.png); the curbs are real geometry on top of that
  void aS; void aH; void walk; void W;
  buildCurbs().catch((e) => console.warn('curbs failed', e));
  buildStreetMarks();
  buildTownExtras();
}
// Once the street runs are in: curbs and sidewalks along the town streets (src/townStreets.ts; downtown keeps the ones painted from the street mask), and parked cars
// at the city curbs and in the driveways (src/parkedCars.ts). Built once.
function buildTownExtras(): void {
  if (!countryScenes) return;
  if (!townWalks) {
    const CW: Record<string, number> = { street: 4.25, arterial: 7, freeway: 6.25, ramp: 2.75 };
    townWalks = buildTownSidewalks(countryScenes, { ground: (x, z) => meshH(x, z), painted: (x, z) => paintedRoad(x, z, 0, true), water: (x, z) => hAt(x, z) < 2.5, extra: streetRuns.map((r) => ({ line: r.p.map(([x, z]) => ({ x, z })), half: CW[r.c] ?? 4.25 })) });
    furnitureGroup.add(townWalks.group);
  }
  if (!parked) {
    const dense = simPlan?.tall?.length ? denseArea(simPlan.tall) : () => false;
    parked = buildParkedCars({
      streets: streetRuns, drives: countryNet?.roads ?? [], ground: (x, z) => meshH(x, z), downtown: dense, mouths: countryScenes.driveMouths,
      skip: (x, z) => roadDist(x, z) < 9 || hAt(x, z) < 2.5 || insideBuilding(x, z, 0.8) || !!(simLayer?.junctions.near(x, z, 3)),
    });
    furnitureGroup.add(parked.group);
  }
  if (!refDress) {
    refDress = buildReferenceDressing({
      ground: (x, z) => meshH(x, z), water: (x, z) => hAt(x, z) < 2.5, building: (x, z, m) => insideBuilding(x, z, m), roadDist: (x, z) => roadDist(x, z),
      paved: countryScenes.pavedRuns, shore: shoreHw, industrial: meta.circuits[IND]?.xz.map((q) => ({ x: q[0], z: q[1] })), mouths: countryScenes.driveMouths,
      course: (x, z, extra) => onCourse(x, z, extra ?? 0),
      streets: streetRuns.map((r) => ({ line: r.p.map(([x, z]) => ({ x, z })), half: ({ street: 4.25, arterial: 7, freeway: 6.25, ramp: 2.75 } as Record<string, number>)[r.c] ?? 4.25 })),
    });
    furnitureGroup.add(refDress.group);
    console.log('reference dressing', JSON.stringify(refDress.counts));
  }
}
// Lane markings for the streets off the race circuit: the carriageways are painted from the street mask (which has no lines), so the centre lines go on as dashes laid
// along each street, broken wherever another street crosses (so there is nothing at an intersection to overlap or flicker) and left off the circuit, which has its own.
function buildStreetMarks(): void {
  const ROAD: Record<string, number> = { street: 8.5, arterial: 14, freeway: 12.5, ramp: 5.5 };     // the same real-world widths as tools/build_city_mask.py (a freeway line is one carriageway)
  const CELLS = 40, grid = new Map<number, { x0: number; z0: number; x1: number; z1: number; run: number; half: number }[]>();
  streetRuns.forEach((r, ri) => {
    const half = (ROAD[r.c] ?? 9) / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1];
      const seg = { x0: a[0], z0: a[1], x1: b[0], z1: b[1], run: ri, half };
      const gx0 = Math.floor((Math.min(a[0], b[0]) - half - 4) / CELLS), gx1 = Math.floor((Math.max(a[0], b[0]) + half + 4) / CELLS), gz0 = Math.floor((Math.min(a[1], b[1]) - half - 4) / CELLS), gz1 = Math.floor((Math.max(a[1], b[1]) + half + 4) / CELLS);
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const k = gx * 8192 + gz; let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(seg); }
    }
  });
  const crossing = (x: number, z: number, run: number): boolean => {
    const l = grid.get(Math.floor(x / CELLS) * 8192 + Math.floor(z / CELLS)); if (!l) return false;
    for (const s of l) {
      if (s.run === run) continue;
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / L2));
      if (Math.hypot(x - (s.x0 + dx * t), z - (s.z0 + dz * t)) < s.half + 2.2) return true;
    }
    return false;
  };
  const white: THREE.Matrix4[] = [], yellow: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  streetRuns.forEach((r, ri) => {
    if (r.c !== 'street' && r.c !== 'arterial') return;
    const PERIOD = r.c === 'arterial' ? 12 : 9, DASH = r.c === 'arterial' ? 5 : 3.2;
    let travelled = 0, next = PERIOD / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const ux = dx / L, uz = dz / L;
      while (next <= travelled + L) {
        const s = next - travelled, x = a[0] + ux * s, z = a[1] + uz * s;
        next += PERIOD;
        if (roadDist(x, z) < 8 || crossing(x, z, ri) || hAt(x, z) < 1.2) continue;
        q.setFromAxisAngle(up, Math.atan2(ux, uz));
        const y = meshH(x, z) + 0.05;
        if (r.c === 'arterial') for (const o of [-0.2, 0.2]) { m4.compose(new THREE.Vector3(x - uz * o, y, z + ux * o), q, new THREE.Vector3(1, 1, DASH / 3.2)); yellow.push(m4.clone()); }
        else { m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, DASH / 3.2)); white.push(m4.clone()); }
      }
      travelled += L;
    }
  });
  const geo = new THREE.PlaneGeometry(0.16, 3.2); geo.rotateX(-Math.PI / 2);
  for (const [list, color] of [[white, 0xe6e6df], [yellow, 0xe0b73a]] as [THREE.Matrix4[], number][]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.receiveShadow = true; im.frustumCulled = false;
    streetGroup.add(im);
  }
  console.log('street marks', white.length, yellow.length);
}
// Curb stones and a raised sidewalk along every street edge that has one (lines traced from the mask by tools/build_curbs.py): a 17 cm vertical stone face, a rounded
// top, and the sidewalk slab 17 cm above the carriageway, so the street no longer melts into the pavement. Not along the race circuit, whose barriers and racing
// surface own those edges.
async function buildCurbs(): Promise<void> {
  const res = await fetch(BASE + 'city_curbs.json');
  if (!res.ok) return;
  const lines = (await res.json()) as number[][];
  const H = 0.17, TOP = 0.24, SLAB = 3.7;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const tint = (c: number): number[] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  const cFace = tint(0xb4b2ab), cTop = tint(0xc6c4bd), cSlab = tint(0xd2d0c9);
  const quad = (a: number[], b: number[], c: number[], d: number[], color: number[]): void => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(p[0], p[1], p[2]); uv.push(p[0] / 1.7, p[2] / 1.7); col.push(color[0], color[1], color[2]); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const ln of lines) {
    for (let i = 0; i + 7 < ln.length; i += 4) {
      const px = ln[i], pz = ln[i + 1], qx = ln[i + 4], qz = ln[i + 5], nx = ln[i + 6], nz = ln[i + 7];
      if (Math.hypot(qx - px, qz - pz) > 40) continue;
      const mx = (px + qx) / 2, mz = (pz + qz) / 2;
      let shift = 0;
      const dRoad = roadDist(mx, mz);
      if (dRoad < 7.8) {
        // along the race circuit the racing surface and the barriers cover the street's own edge: start the curb behind the barriers instead, and skip the cross streets
        let best = 1e18, bi = -1;
        for (let k = 0; k < cityPath.length; k++) { const d2 = (cityPath[k].x - mx) ** 2 + (cityPath[k].z - mz) ** 2; if (d2 < best) { best = d2; bi = k; } }
        if (bi < 0) continue;
        const a = cityPath[bi], b = cityPath[(bi + 1) % cityPath.length];
        const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, sl = Math.hypot(qx - px, qz - pz) || 1;
        const par = Math.abs(((b.x - a.x) * (qx - px) + (b.z - a.z) * (qz - pz)) / (tl * sl));
        if (par < 0.85) continue;
        shift = Math.max(0, 7.8 - Math.sqrt(best));
      }
      const sx = nx * shift, sz = nz * shift;
      const y0p = meshH(px + sx, pz + sz) + 0.01, y0q = meshH(qx + sx, qz + sz) + 0.01;
      const A0 = [px + sx, y0p, pz + sz], B0 = [qx + sx, y0q, qz + sz], A1 = [px + sx, y0p + H, pz + sz], B1 = [qx + sx, y0q + H, qz + sz];
      const C1 = [px + sx + nx * TOP, y0p + H, pz + sz + nz * TOP], D1 = [qx + sx + nx * TOP, y0q + H, qz + sz + nz * TOP];
      const E1 = [px + sx + nx * SLAB, y0p + H, pz + sz + nz * SLAB], F1 = [qx + sx + nx * SLAB, y0q + H, qz + sz + nz * SLAB];
      quad(A0, B0, B1, A1, cFace);
      quad(A1, B1, D1, C1, cTop);
      quad(C1, D1, F1, E1, cSlab);
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const t = gameTex('paver_plain');
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false;
  streetGroup.add(m);
  console.log('curbs', lines.length, 'lines', pos.length / 12, 'quads');
}

// ---------- tree sprites (cross cards) ----------
interface SpriteDef { file: string; w: number; h: number; tex: THREE.Texture; kind: string }
interface SpriteSet { urban: SpriteDef[]; autumn: SpriteDef[]; conifer: SpriteDef[]; broad: SpriteDef[] }
let spriteSet: Promise<SpriteSet> | null = null;
const crossGeo = (() => {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a), base = pos.length / 3;
    for (const [x, y, u, v] of [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]]) { pos.push(x * c, y, x * sn); uv.push(u, v); nor.push(0, 1, 0); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
})();
function loadSprites(): Promise<SpriteSet> {
  if (spriteSet) return spriteSet;
  spriteSet = (async () => {
    const man = (await (await fetch('/games/forth-horizon/sprites/manifest.json')).json()) as { file: string; w: number; h: number; cat: string }[];
    const load = (e: { file: string; w: number; h: number; cat: string }): Promise<SpriteDef> => new Promise((res) => {
      new THREE.TextureLoader().load('/games/forth-horizon/sprites/' + e.file, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
        res({ file: e.file, w: e.w, h: e.h, tex: t, kind: e.cat });
      }, undefined, () => res({ file: e.file, w: e.w, h: e.h, tex: new THREE.Texture(), kind: e.cat }));
    });
    const want = (names: string[]): Promise<SpriteDef[]> => Promise.all(man.filter((e) => names.includes(e.file)).map(load));
    const [urban, autumn, conifer, broad] = await Promise.all([
      want(['urban_1_00.png', 'urban_1_01.png', 'urban_1_02.png', 'urban_1_03.png', 'urban_1_04.png']),
      want(['trees_0_00.png', 'trees_0_01.png', 'trees_0_02.png']),
      want(['conifer_00.png', 'conifer_01.png', 'conifer_04.png', 'conifer_05.png', 'conifer_06.png', 'conifer_07.png']),
      want(['urban_1_00.png', 'urban_1_01.png', 'urban_1_02.png', 'urban_1_01.png', 'trees_0_00.png']),
    ]);
    return { urban, autumn, conifer, broad };
  })();
  return spriteSet;
}
const spriteMats = new Map<string, THREE.MeshStandardMaterial>();
function patchTreeCard(mat: THREE.MeshStandardMaterial, lod: boolean): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCardH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCardH = clamp(uv.y, 0.0, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCardH;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        // Counter dark matte edge bleed + match distant sprite foliage hue & depth to close 3D EzTreeField conifers
        if (diffuseColor.a < 0.96) diffuseColor.rgb = min(vec3(1.0), diffuseColor.rgb / max(diffuseColor.a, 0.78));
        float fLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(fLum), diffuseColor.rgb, 1.48) * vec3(0.46, 0.62, 0.40) * mix(0.68, 1.04, vCardH);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Never let DoubleSide flip tree canopy normal into the ground; bias smoothly toward sky for soft volumetric canopy lighting
        vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        if (dot(normal, upView) < 0.0) normal = -normal;
        normal = normalize(mix(normal, upView, 0.72));`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // Sunlit backlit leaf subsurface scattering (SSS) for photographic forest glow
        #if NUM_DIR_LIGHTS > 0
        {
          float back = pow(clamp(dot(normalize(vViewPosition), -directionalLights[0].direction), 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * back * (0.35 + 0.65 * vCardH) * 0.42;
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => (lod ? 'treecard-lod-v2' : 'treecard-v2');
}
function addTreeCards(parent: THREE.Object3D, list: { x: number; z: number; def: SpriteDef; h: number }[], lod = false): void {
  const by = new Map<SpriteDef, typeof list>();
  for (const t of list) { if (!by.has(t.def)) by.set(t.def, []); by.get(t.def)!.push(t); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const CELL_SZ = 1800;
  by.forEach((arr, def) => {
    const mkey = def.file + (lod ? ':lod' : '');
    let mat = spriteMats.get(mkey);
    if (!mat) {
      // Higher alphaTest (0.76) cuts out the dark semi-transparent matte halo baked into sprite PNG edges
      mat = new THREE.MeshStandardMaterial({ map: def.tex, alphaTest: 0.76, side: THREE.DoubleSide, roughness: 0.94, metalness: 0 });
      if (lod) cardLod(mat);
      patchTreeCard(mat, lod);
      spriteMats.set(mkey, mat);
    }
    // Partition massive regional tree-card arrays into frustum- and distance-cullable 520 m cells so off-screen / 8 km-away trees are skipped
    const buckets = new Map<string, typeof list>();
    for (const t of arr) {
      const k = Math.floor(t.x / CELL_SZ) + ',' + Math.floor(t.z / CELL_SZ);
      let b = buckets.get(k);
      if (!b) buckets.set(k, b = []);
      b.push(t);
    }
    for (const sub of buckets.values()) {
      const im = new THREE.InstancedMesh(crossGeo, mat, sub.length);
      sub.forEach((t, i) => {
        const hh = t.h, ww = hh * def.w / def.h;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((t.x * 7.3 + t.z * 3.1) % 6.283));
        m4.compose(new THREE.Vector3(t.x, hAt(t.x, t.z) * exag - hh * 0.04, t.z), q, new THREE.Vector3(ww, hh, ww));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, col.setScalar(0.8 + ((t.x * 13.1 + t.z * 5.7) % 1 + 1) % 1 * 0.3));
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      const bs = im.boundingSphere!;
      im.frustumCulled = true;
      im.userData.chunked = true;
      parent.add(im);
      chunkList.push({ m: im, cx: bs.center.x, cz: bs.center.z, r: bs.radius, baseCastShadow: false, maxDist: 1750, maxShadowDist: 0 });
    }
  });
}
interface TreeLayer { group: THREE.Group; setWind(w: number): void; setQuality(scale: number): void; update(dt: number, cam: THREE.Vector3): void }
const treeFields: TreeLayer[] = [];
let grassField: GrassField | null = null;
const IND = 'ironworks_industrial_circuit';                // the street course through the port, the refinery and the freight yard (North Harbor Circuit II)
const HARB = 'harbor_district_circuit';                    // the street course on the north coast's docks and piers (Harbor District Street Circuit)
let harborPath: { x: number; z: number }[] = [];
let harborNear: ((x: number, z: number, r: number) => boolean) | null = null;
let harborRaw: { xz: number[][]; sectors: Record<string, number[]> } | null = null;
let harborYs: number[] | undefined;
let industrialPath: { x: number; z: number }[] = [];
let industrialGrade: GradeFeature[] = [];
let industrialRaw: { xz: number[][]; sectors: Record<string, number[]> } | null = null;   // the planned points and the map's sectors (dressing)             // where the new Ironworks leaves the ground (bridge, underpass)
let industrialYs: number[] | undefined;               // its design heights along the path (industrialProfile)
let indNear: ((x: number, z: number, r: number) => boolean) | null = null;
let simPlan: SimPlan | null = null;                 // road graph, rails and airfield from the map editor (src/simLayer.ts)
let simLayer: SimLayer | null = null;
let townWalks: ReturnType<typeof buildTownSidewalks> | null = null;   // town street curbs and sidewalks (src/townStreets.ts)
let refDress: RefDressing | null = null;                                               // what the reference scenes' places were missing (src/referenceScenes.ts)
let parked: ReturnType<typeof buildParkedCars> | null = null;                         // parked cars at the curbs and in driveways
let festProg: FestProgress | null = null;                                             // Chora Fest progression
let festMap: ReturnType<typeof createFestMap> | null = null;                         // the designed navigation map (src/festMap.ts)
let freeSpawn: { p: number[]; q: number[] } | null = null;                             // where the next free roam starts (fast travel)
let parkingLots: ReturnType<typeof buildParkingLots> | null = null;
let parkingData: number[][] | null = null;
let utilData: UtilitiesData | null = null;          // power plant, substations, pylons (tools/plan_utilities.py)
let portData: PortData | null = null;               // the Ironworks port district: graded platform, quay, piers, containers, tank farm (tools/plan_port_district.py)
let vegetation: Vegetation | null = null;            // the streamed grass, shrub and rock system (src/vegetation.ts); ?veg=old brings back the previous grass
/** the Ravencrest/Era Clash trees (ez-tree skeletons, bark scans, painted leaves); the simple procedural trees only if those fail to build */
function mkTrees(pts: number[][], h: (x: number, z: number) => number, ex: () => number): TreeLayer {
  try { return new EzTreeField(pts, h, ex); } catch (e) { console.warn('high-quality trees unavailable, using simple trees', e); return new TreeField(pts, h, ex); }
}
// ---------- keep trees and grass off the roads ----------
// Every circuit's centreline, the coastal highway and the painted road mask are checked: nothing grows on tarmac, pavement or the course.
let roadHash: Map<number, number[]> | null = null;
const RH = 24;
function ensureRoadHash(): Map<number, number[]> {
  if (roadHash) return roadHash;
  const h = new Map<number, number[]>();
  const add = (x: number, z: number): void => { const k = Math.floor(x / RH) * 8192 + Math.floor(z / RH); let a = h.get(k); if (!a) { a = []; h.set(k, a); } a.push(x, z); };
  for (const c of Object.values(meta.circuits)) for (const p of densify(c, 8)) add(p.x, p.z);
  const hw = meta.coastal_highway?.xz ?? [];
  for (let i = 0; i < hw.length; i++) add(hw[i][0], hw[i][1]);
  for (const r of scenicData) for (let i = 0; i < r.xz.length; i += 2) add(r.xz[i][0], r.xz[i][1]);   // every scenic road (not only the ones a circuit uses): no tree on Kettle Pass
  roadHash = h;
  return h;
}
/** distance (m) from x,z to the nearest course centreline or highway, capped at 2*RH */
function roadDist(x: number, z: number): number {
  const h = ensureRoadHash();
  let best = 1e9;
  const cx = Math.floor(x / RH), cz = Math.floor(z / RH);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = h.get((cx + i) * 8192 + cz + j); if (!a) continue;
    for (let k = 0; k < a.length; k += 2) { const d = Math.hypot(a[k] - x, a[k + 1] - z); if (d < best) best = d; }
  }
  return best;
}
/** painted road (the street mask's road channel) at x,z or within `pad` m of it; `walk` also counts pavements */
function paintedRoad(x: number, z: number, pad: number, walk = false): boolean {
  if (!roadMask) return false;
  for (const [ox, oz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
    const u = (x + ox - maskVec.x) / maskVec.z, v = (z + oz - maskVec.y) / maskVec.w;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const i = ((Math.floor(v * roadMask.h) * roadMask.w) + Math.floor(u * roadMask.w)) * 4;
    if (roadMask.data[i] > 90 || (walk && roadMask.data[i + 1] > 90)) return true;
  }
  return false;
}
/** may a tree or grass stand here? `clear`: metres kept from any course centreline */
function growable(x: number, z: number, clear: number, pad: number, walk = true): boolean {
  return hAt(x, z) > 1.2 && roadDist(x, z) > clear && !paintedRoad(x, z, pad, walk);
}
/** may anything grow here: not on or beside any road we draw (the old street mask, the country roads, zone streets, highways, the shoreline highway, the bridges, the industrial circuit) */
/** inside a built zone drawn in the editor (the satellite's forest there is not ours): the forest point list is ignored, street trees and parks are placed by tools/detail_zones.py */
function inBuiltZone(x: number, z: number): boolean {
  if (!userMap) return false;
  for (const f of userMap.features) {
    if (f.type !== 'zone' || !(f.kind === 'residential' || f.kind === 'dense' || f.kind === 'industrial' || f.kind === 'waterfront' || f.kind === 'commercial' || f.kind === 'civic')) continue;
    let inside = false;
    for (let i = 0, j = f.pts.length - 1; i < f.pts.length; j = i++) { const a = f.pts[i], b = f.pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; }
    if (inside) return true;
  }
  return false;
}
function vegOk(x: number, z: number, extra = 0): boolean {
  if (extra === 0 && !growable(x, z, 6.5, 2.5, true)) return false;
  if (countryScenes && (countryScenes.pavedNear(x, z, 1.6 + extra) || countryScenes.dirtNear(x, z, 0.9 + extra))) return false;
  if (bridgeNear && bridgeNear(x, z, 13 + extra)) return false;
  if (indNear && indNear(x, z, 10 + extra)) return false;
  if (harborNear && harborNear(x, z, 10 + extra)) return false;
  if (portData && inPort(portData, x, z, 14 + extra)) return false;
  if (utilData && inPort({ platform: utilData.platform } as PortData, x, z, 14 + extra)) return false;
  if (simLayer && simLayer.near(x, z, 7 + extra)) return false;
  if (townWalks && townWalks.near(x, z, extra)) return false;
  if (parkingLots && parkingLots.near(x, z, 3 + extra)) return false;
  return true;
}
const forestGroup = new THREE.Group();
scene.add(forestGroup);
async function buildForest(): Promise<void> {
  const res = await fetch(BASE + 'forest.json');
  if (!res.ok) return;
  for (let i = 0; i < 40 && !roadMask; i++) await new Promise((r) => setTimeout(r, 100));    // the road mask decides where trees may stand
  const north = await fetch(BASE + 'north_trees.json').then((x) => (x.ok ? x.json() : [])).catch(() => []) as number[][];   // the grown north (tools/grow_north.py): woodlots, conifers, the giant forest
  const pts = ((await res.json()) as number[][]).concat(north).filter((p) => growable(p[0], p[1], 12, 6, true) && vegOk(p[0], p[1], 5) && !inBuiltZone(p[0], p[1]));
  const sp = await loadSprites();
  forestGroup.clear();
  const list: { x: number; z: number; def: SpriteDef; h: number }[] = [];
  for (const p of pts) {
    const set = p[2] ? sp.conifer : sp.broad;
    const def = set[Math.floor(((p[0] * 31 + p[1] * 17) % 1 + 1) % 1 * set.length)];
    list.push({ x: p[0], z: p[1], def, h: (p[2] ? 15 + p[3] * 9 : 13 + p[3] * 7) });
  }
  addTreeCards(forestGroup, list, true);
  const tf = mkTrees(pts, hAt, () => exag);
  forestGroup.add(tf.group); treeFields.push(tf);
  console.log('forest', list.length);
  // trees along the cliff raceway and the rally trail: lining both verges, off the tarmac, away from the water
  const verge: number[][] = [];
  let seed = 91;
  const rr = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [id, c] of Object.entries(meta.circuits)) {
    if (id === 'ironport_grand_circuit') continue;
    const rally = id.includes('rally');
    const D = densify(c, 11);
    for (let i = 0; i < D.length; i++) {
      const a = D[i], b = D[(i + 1) % D.length];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (const side of [-1, 1]) {
        if (rr() > (rally ? 0.7 : 0.38)) continue;
        const off = (rally ? 10 : 12) + rr() * (rally ? 20 : 24), al = (rr() - 0.5) * 9;
        const x = a.x + nx * off * side + (dx / l) * al, z = a.z + nz * off * side + (dz / l) * al;
        if (!growable(x, z, 9, 6, true) || !vegOk(x, z, 4) || surfaceAtXZ(x, z) !== 'grass') continue;
        const conifer = rally ? rr() < 0.8 : rr() < 0.45;
        verge.push([x, z, conifer ? 1 : 0, rr(), 0.8 + rr() * 0.5]);
      }
    }
  }
  // street trees, park and trail cover for the zones drawn in the editor (tools/detail_zones.py): the same layout as the verge trees, kept off roads and the port
  {
    const zt = await fetch(BASE + 'zone_trees.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as number[][] | null;
    if (zt) for (const t of zt) if (vegOk(t[0], t[1], 1)) verge.push(t);
    // back-yard trees behind the houses (tools/relay_houses.py)
    const yt = await fetch(BASE + 'yard_trees.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as number[][] | null;
    if (yt) for (const t of yt) verge.push(t);
  }
  const vlist = verge.map((p) => {
    const set = p[2] ? sp.conifer : sp.broad;
    return { x: p[0], z: p[1], def: set[Math.floor(rr() * set.length)], h: (p[2] ? 15 + p[3] * 9 : 13 + p[3] * 7) * p[4] };
  });
  addTreeCards(forestGroup, vlist, true);
  const vf = mkTrees(verge, hAt, () => exag);
  forestGroup.add(vf.group); treeFields.push(vf);
  console.log('verge trees', verge.length);
  // real grass around the camera, on green ground only, never on roads, pavement or the course
  if (!location.search.includes('veg=old')) {
    vegetation = new Vegetation({ rw: meta.width * meta.mpp, rh: meta.height * meta.mpp, classUrl: BASE + 'landclass.png', albedoUrl: BASE + 'albedo.jpg', ground: meshH, ok: (x, z) => vegOk(x, z) });
    forestGroup.add(vegetation.group);
  } else {
  grassField = new GrassField({ rw: meta.width * meta.mpp, rh: meta.height * meta.mpp, albedoUrl: BASE + 'albedo.jpg', ground: meshH, ok: (x, z) => growable(x, z, 6.5, 2.5, true) });
  forestGroup.add(grassField.group);
  duneDetail({ width: meta.width * meta.mpp, depth: meta.height * meta.mpp, albedo: BASE + 'albedo.jpg', ground: meshH, clear: (x, z) => growable(x, z, 13, 5, true) }).then((group) => forestGroup.add(group)).catch((e) => console.warn('dune detail failed', e));
  }
}

// ---------- streetscape: street trees and street lights ----------
const scapeGroup = new THREE.Group();
scene.add(scapeGroup);
function insideBuilding(x: number, z: number, margin: number): boolean {
  const list = colGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!list) return false;
  for (const it of list) {
    const cx = it.bx ?? it.x, cz = it.bz ?? it.z, c = Math.cos(it.rotY), s = Math.sin(it.rotY);
    const dx = x - cx, dz = z - cz;
    if (Math.abs(dx * c - dz * s) < it.w / 2 + margin && Math.abs(dx * s + dz * c) < it.d / 2 + margin + 2) return true;
  }
  return false;
}
async function buildStreetscape(): Promise<void> {
  for (let i = 0; i < 60 && !streetRuns.length; i++) await new Promise((r) => setTimeout(r, 250));
  if (!streetRuns.length) return;
  scapeGroup.clear();
  const cmx = 5513, cmz = 934;                  // Campus Martius analog (world metres)
  // spatial hash of every street sample so trees keep off other streets and intersections
  const HC = 24;
  const hash = new Map<string, number[]>();
  streetRuns.forEach((r, ri) => {
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 5));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
        const key = Math.floor(x / HC) + ',' + Math.floor(z / HC);
        if (!hash.has(key)) hash.set(key, []);
        hash.get(key)!.push(ri, x, z);
      }
    }
  });
  const nearOther = (ri: number, x: number, z: number, d: number): boolean => {
    const gx = Math.floor(x / HC), gz = Math.floor(z / HC);
    for (let ax = gx - 1; ax <= gx + 1; ax++) for (let az = gz - 1; az <= gz + 1; az++) {
      const l = hash.get(ax + ',' + az);
      if (!l) continue;
      for (let i = 0; i < l.length; i += 3) if (l[i] !== ri && Math.hypot(l[i + 1] - x, l[i + 2] - z) < d) return true;
    }
    return false;
  };
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const trees: number[][] = [], lights: number[][] = [];
  const W: Record<string, number> = { arterial: 16, street: 10 };
  streetRuns.forEach((r, ri) => {
    const w = W[r.c];
    if (!w) return;
    const spacing = r.c === 'arterial' ? 21 : 15;
    let carry = rnd() * spacing, lightCarry = rnd() * 44;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.5) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
      let t = 0;
      while (t < L) {
        const step = Math.min(carry, lightCarry);
        if (t + step > L) { carry -= L - t; lightCarry -= L - t; break; }
        t += step; carry -= step; lightCarry -= step;
        const x = a[0] + ux * t, z = a[1] + uz * t;
        if (carry <= 0.001) {
          carry = spacing + (rnd() - 0.5) * 5;
          const cmd = Math.hypot(x - cmx, z - cmz);
          const p = cmd < 500 ? 0.22 : cmd < 1200 ? 0.55 : 0.85;
          for (const side of [-1, 1]) {
            if (rnd() > p) continue;
            const off = w / 2 + 2.2;
            const tx = x + nx * off * side + (rnd() - 0.5) * 1.2, tz = z + nz * off * side + (rnd() - 0.5) * 1.2;
            if (hAt(tx, tz) < 1.0 || nearOther(ri, tx, tz, 8.5) || insideBuilding(tx, tz, 0.8)) continue;
            trees.push([tx, tz, 0.8 + rnd() * 0.7, rnd()]);
          }
        }
        if (lightCarry <= 0.001) {
          lightCarry = 44;
          const side = (lights.length & 1) ? 1 : -1;
          const off = w / 2 + 3.5;
          const lx = x + nx * off * side, lz = z + nz * off * side;
          if (hAt(lx, lz) >= 1.0 && !nearOther(ri, lx, lz, 7.5) && !insideBuilding(lx, lz, 0.3)) lights.push([lx, lz, Math.atan2(-nx * side, -nz * side)]);
        }
      }
    }
  });
  // street trees: photographic cross-card sprites cut from the asset sheets
  const sp = await loadSprites();
  const pickStreet = (r: number): SpriteDef => {
    const list = r < 0.14 ? sp.autumn : sp.urban;
    return list[Math.floor((r * 977) % 1 * list.length)];
  };
  for (let i = 0; i < 40 && !roadMask; i++) await new Promise((r) => setTimeout(r, 100));
  const okTrees = trees.filter((t) => roadDist(t[0], t[1]) > 8.5 && !paintedRoad(t[0], t[1], 1.6, false));      // sidewalk trees, never in the carriageway or the course
  addTreeCards(scapeGroup, okTrees.map((t) => ({ x: t[0], z: t[1], def: autumnLeaf(t[0], t[1], t[3]) !== undefined ? sp.autumn[Math.floor(t[3] * sp.autumn.length) % sp.autumn.length] ?? pickStreet(t[3]) : pickStreet(t[3]), h: (8 + t[3] * 5) * t[2] / 1.2 })), true);
  // up close the street trees are real 3D trees (the cards take over beyond ~150 m)
  { const tf = mkTrees(okTrees.map((t) => { const leaf = autumnLeaf(t[0], t[1], t[3]); return leaf === undefined ? [t[0], t[1], 0, t[3], 0.62 * t[2] + 0.2] : [t[0], t[1], 0, t[3], 0.62 * t[2] + 0.2, leaf]; }), hAt, () => exag); scapeGroup.add(tf.group); treeFields.push(tf); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  // street lights: pole, arm, emissive lamp head
  const ln = lights.length;
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 8.6, 6), stdMat(0x3c4047, 0.6, 0.5), ln);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 2.4), stdMat(0x3c4047, 0.6, 0.5), ln);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 0.9), new THREE.MeshBasicMaterial({ color: 0xffe7ae }), ln);
  const e = new THREE.Euler();
  lights.forEach((l, i) => {
    const gy = hAt(l[0], l[1]) * exag;
    q.setFromEuler(e.set(0, l[2], 0));
    m4.compose(new THREE.Vector3(l[0], gy + 4.3, l[1]), q.identity(), new THREE.Vector3(1, 1, 1));
    pole.setMatrixAt(i, m4);
    const fx = Math.sin(l[2]), fz = Math.cos(l[2]);
    m4.compose(new THREE.Vector3(l[0] + fx * 1.1, gy + 8.5, l[1] + fz * 1.1), q.setFromEuler(e.set(0, l[2], 0)), new THREE.Vector3(1, 1, 1));
    arm.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(l[0] + fx * 2.1, gy + 8.4, l[1] + fz * 2.1), q, new THREE.Vector3(1, 1, 1));
    head.setMatrixAt(i, m4);
  });
  pole.name = arm.name = head.name = 'street-light';
  pole.frustumCulled = arm.frustumCulled = head.frustumCulled = false;
  scapeGroup.add(pole, arm, head);
  chunkInstanced(scapeGroup);
  console.log('streetscape', trees.length, 'trees', ln, 'lights');
  (window as any).scapeCount = [trees.length, ln];
}

// ---------- building detail: cornices, rooftop plant, tanks, masts ----------
const roofGroup = new THREE.Group();
roofGroup.name = 'roof-group';
scene.add(roofGroup);
function addRoofDetails(items: CityItem[]): void {
  roofGroup.clear();
  const hash = (a: number, b: number): number => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  type Inst = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; c: number };
  const cornice: Inst[] = [], plant: Inst[] = [], tanks: Inst[] = [], legs: Inst[] = [], pent: Inst[] = [], masts: Inst[] = [], lamps: Inst[] = [];
  for (const it of items) {
    if (it.h < 13 || (it.kind === 'generic' && /house|bungalow|duplex|townhouse|diner|pharmacy|grocery|barber|coffee|gas|auto|strip/.test(it.slug))) continue;
    const cx = it.bx ?? it.x, cz = it.bz ?? it.z, phi = it.rotY, c = Math.cos(phi), sn = Math.sin(phi);
    const gy = groundMin(it) - 0.35, top = gy + it.h;
    const r0 = hash(cx, cz), r1 = hash(cz, cx + 7), r2 = hash(cx + 3, cz - 5);
    const at = (u: number, v: number): [number, number] => [cx + u * c + v * sn, cz - u * sn + v * c];
    // cornice: only for legacy v1 plain boxes (v3 models already have sculpted 3D parapets & tapered tops)
    if (MODELSET !== 'v3') {
      cornice.push({ x: cx, y: top - 0.45, z: cz, sx: it.w + 0.9, sy: 0.9, sz: it.d + 0.9, ry: phi, c: 0x6e6c66 });
      if (it.h > 30) cornice.push({ x: cx, y: gy + 3.2, z: cz, sx: it.w + 0.5, sy: 0.6, sz: it.d + 0.5, ry: phi, c: 0x5c5a55 });
    }
    // rooftop mechanical units
    const nUnits = it.w * it.d > 400 ? 1 + Math.floor(r0 * 3) : Math.floor(r0 * 2);
    for (let k = 0; k < nUnits; k++) {
      const [x, z] = at((hash(cx + k, cz) - 0.5) * it.w * 0.6, (hash(cx, cz + k) - 0.5) * it.d * 0.6);
      plant.push({ x, y: top + 0.9, z, sx: 2.6 + r1 * 2, sy: 1.8, sz: 2 + r2 * 1.6, ry: phi, c: k % 2 ? 0x8a9096 : 0x9ea3a8 });
    }
    // elevator penthouse on mid and high rises
    if (it.h > 26) { const [x, z] = at((r1 - 0.5) * it.w * 0.4, (r2 - 0.5) * it.d * 0.4); pent.push({ x, y: top + 1.7, z, sx: it.w * 0.22, sy: 3.4, sz: it.d * 0.22, ry: phi, c: 0x9a948a }); }
    // wooden water tank on legs
    if (it.h > 18 && it.h < 75 && r0 > 0.62) {
      const [x, z] = at((r2 - 0.5) * it.w * 0.5, (r1 - 0.5) * it.d * 0.5);
      tanks.push({ x, y: top + 4.2, z, sx: 1, sy: 1, sz: 1, ry: 0, c: 0x6f4d33 });
      legs.push({ x, y: top + 1.2, z, sx: 1, sy: 1, sz: 1, ry: phi, c: 0x4a4a4e });
    }
    // radio mast with a red lamp on the tallest buildings
    if (it.h > 58) {
      const [x, z] = at((r1 - 0.5) * it.w * 0.3, (r2 - 0.5) * it.d * 0.3);
      const mh = 9 + r0 * 12;
      masts.push({ x, y: top + mh / 2 + 0.5, z, sx: 0.5, sy: mh, sz: 0.5, ry: 0, c: 0x6a6e74 });
      lamps.push({ x, y: top + mh + 0.6, z, sx: 1, sy: 1, sz: 1, ry: 0, c: 0xff3030 });
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], shadow: boolean): void => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => { q.setFromAxisAngle(up, t.ry); m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.sx, t.sy, t.sz)); im.setMatrixAt(i, m4); im.setColorAt(i, col.setHex(t.c)); });
    im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false;
    roofGroup.add(im);
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.55 });
  make(unit, stone, cornice, true);
  make(unit, metal, plant, false);
  make(unit, stone, pent, true);
  make(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), tanks, false);
  make(new THREE.BoxGeometry(2.6, 2.4, 2.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.4, wireframe: true }), legs, false);
  make(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), metal, masts, false);
  make(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), lamps, false);
  console.log('roof details', { cornice: cornice.length, plant: plant.length, pent: pent.length, tanks: tanks.length, masts: masts.length });
  (window as any).roofCount = [cornice.length, plant.length, tanks.length, masts.length];
  addTowerGeometry(items);
  chunkInstanced(roofGroup);
}

// Tower geometry. The generic towers are plain boxes; real ones have a podium, a profile that steps in toward the top, a crown, and piers that cast shadow lines down the
// face. Added here around each tall generic building: a stone podium (the base block), four corner piers, one or two setback tiers in curtain-wall glass with a stone parapet
// at each step, so the skyline has a silhouette. Stone is mapped by world position (triplanar) so it never stretches however the box is scaled.
function stoneMaterial(): THREE.MeshStandardMaterial {
  const t = new THREE.TextureLoader().load('/games/forth-horizon/tex/bld/tex-shared-06-granite_base.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.78, metalness: 0, color: 0xd8d4cc });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTP; varying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 tpw = vec4(position, 1.0);\nmat3 tnm = mat3(modelMatrix);\n#ifdef USE_INSTANCING\ntpw = instanceMatrix * tpw;\ntnm = tnm * mat3(instanceMatrix);\n#endif\n#ifdef USE_BATCHING\ntpw = batchingMatrix * tpw;\ntnm = tnm * mat3(batchingMatrix);\n#endif\nvTP = (modelMatrix * tpw).xyz;\nvTN = tnm * normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTP; varying vec3 vTN;')
      .replace('#include <map_fragment>', `
        vec3 tw = pow(abs(normalize(vTN)), vec3(6.0)); tw /= (tw.x + tw.y + tw.z);
        vec4 tsm = texture2D(map, vTP.zy / 3.6) * tw.x + texture2D(map, vTP.xz / 3.6) * tw.y + texture2D(map, vTP.xy / 3.6) * tw.z;
        diffuseColor *= tsm;`);
  };
  m.customProgramCacheKey = () => 'tower-stone-1';
  return m;
}
function addTowerGeometry(items: CityItem[]): void {
  type T = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number };
  const glass: T[] = [], stone: T[] = [];
  for (const it of items) {
    if (it.kind !== 'generic' || it.h < 48 || it.w < 12 || /house|bungalow|duplex|townhouse|barn|silo|tower-rural|windmill/.test(it.slug)) continue;
    const cx = it.bx ?? it.x, cz = it.bz ?? it.z, phi = it.rotY, c = Math.cos(phi), sn = Math.sin(phi);
    const gy = groundMin(it) - 0.35, top = gy + it.h;
    const at = (u: number, v: number): [number, number] => [cx + u * c + v * sn, cz - u * sn + v * c];
    // podium & corner piers: only for legacy v1 boxes (v3 towers already have real 3D ground lobbies, doors, and sculpted piers)
    if (MODELSET !== 'v3') {
      if (it.h > 60) stone.push({ x: cx, y: gy + 4.4, z: cz, sx: it.w + 1.4, sy: 8.8, sz: it.d + 1.4, ry: phi });
      if (it.h > 55) for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const [x, z] = at(u * (it.w / 2), v * (it.d / 2)); stone.push({ x, y: gy + it.h * 0.49, z, sx: 1.1, sy: it.h * 0.98, sz: 1.1, ry: phi }); }
    }
    // setback tiers in glass, each with a stone parapet
    const t1 = Math.max(7, Math.min(16, it.h * 0.13));
    glass.push({ x: cx, y: top + t1 / 2, z: cz, sx: it.w * 0.8, sy: t1, sz: it.d * 0.8, ry: phi });
    stone.push({ x: cx, y: top + t1 + 0.4, z: cz, sx: it.w * 0.8 + 0.7, sy: 0.8, sz: it.d * 0.8 + 0.7, ry: phi });
    if (it.h > 85) {
      const t2 = 8 + (it.h > 110 ? 4 : 0);
      glass.push({ x: cx, y: top + t1 + 0.8 + t2 / 2, z: cz, sx: it.w * 0.52, sy: t2, sz: it.d * 0.52, ry: phi });
      stone.push({ x: cx, y: top + t1 + 0.8 + t2 + 0.4, z: cz, sx: it.w * 0.52 + 0.6, sy: 0.8, sz: it.d * 0.52 + 0.6, ry: phi });
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const make = (list: T[], mat: THREE.Material): void => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
    list.forEach((t, i) => { q.setFromAxisAngle(up, t.ry); m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.sx, t.sy, t.sz)); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    roofGroup.add(im);
  };
  const gm = new THREE.MeshStandardMaterial({ color: 0x25384a, roughness: 0.4, metalness: 0.6 });
  gm.name = 'tex-shared-07-glass-curtain-blue_mat';
  patchGlassInterior(gm, nightU, curtainU, sunDirU, false);
  make(glass, gm);
  make(stone, stoneMaterial());
  console.log('tower geometry', { glassTiers: glass.length, stone: stone.length });
}

// ---------- city buildings ----------
interface CityItem { kind: 'hero' | 'generic'; slug: string; x: number; z: number; rotY: number; w: number; d: number; h: number; sx?: number; sy?: number; sz?: number; bx?: number; bz?: number }
const CITY_BATCH = !location.search.includes('citybatch=0');      // ?citybatch=0: the old one-InstancedMesh-per-part city, for comparing
let cityBatches: CityBatches | null = null;
const cityGroup = new THREE.Group();
scene.add(cityGroup);
let cityItems: CityItem[] = [];
const IRON = MODELSET === 'v3' ? '/games/forth-horizon/ironport/models-v3/' : '/games/forth-horizon/ironport/models/';

function groundMin(it: CityItem): number {
  const cx = it.bx ?? it.x, cz = it.bz ?? it.z, c = Math.cos(it.rotY), s = Math.sin(it.rotY);
  let m = 1e9;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const lx = (i / 2) * (it.w / 2 + 1), lz = (j / 2) * (it.d / 2 + 1);
    m = Math.min(m, hAt(cx + lx * c + lz * s, cz - lx * s + lz * c));
  }
  return m;
}
// AAA Building Shaders live in ./buildingShaders.ts (3D Ray-Box Interior Mapping, dielectric Fresnel glass,
// recessed stone/concrete windows + ground-floor storefronts, street-canyon vertical AO, hero facade glass detection).
const nightU = { value: 0 };
const sunDirU = { value: sunDir };
const curtainU = { value: 1 };                         // 1: 3D interior mapping & architectural glazing on towers; 0: texture only (debug A/B: window.apexTowers.set(0 | 1))
(window as unknown as { apexTowers: unknown }).apexTowers = { set: (v: number) => { curtainU.value = v; } };
// ---------- the civic riverfront on the east bank (region/civic_riverfront.json, src/civicDistrict.ts) ----------
// Built once the city's buildings are known, so nothing of it lands on downtown (downtown is not changed: its frontage only gets the promenade where free).
let civicSpots: Record<string, [number, number, number]> = {};
async function buildCivic(): Promise<void> {
  const plan = await fetch(BASE + 'civic_riverfront.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as CivicPlan | null;
  if (!plan) return;
  const d = buildCivicRiverfront({ plan, ground: (x, z) => meshH(x, z), water: (x, z) => hAt(x, z) < 2.5, blocked: (x, z, r) => onCourse(x, z, r) || paintedRoad(x, z, r) || insideBuilding(x, z, r) });
  mergeByMaterial(d.group, 400);
  furnitureGroup.add(d.group);
  civicSpots = d.spots;
  (window as unknown as { civicSpots: unknown }).civicSpots = civicSpots;
  console.log('civic riverfront', JSON.stringify(d.counts));
}
async function buildCity(): Promise<void> {
  const res = await fetch(BASE + 'city.json');
  if (!res.ok) return;
  // the new Ironworks runs through the old yards: a building whose footprint (w x d, the world footprint) touches its course is left out (downtown and the
  // other circuits are not touched)
  cityItems = ((await res.json()) as { items: CityItem[] }).items.filter((it) => {
    const cx = it.bx ?? it.x, cz = it.bz ?? it.z, c = Math.cos(it.rotY), sn = Math.sin(it.rotY);
    for (const [u, v] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]]) {
      const lx = u * it.w, lz = v * it.d;
      if (onCourse(cx + lx * c + lz * sn, cz - lx * sn + lz * c, 1, [IND])) return false;
    }
    return true;
  });
  buildCollision();
  buildCivic().catch((e) => console.error('civic riverfront failed', e));
  // Review viewer budget: Quest-tier textures (smaller), one GPU copy per shared texture, base colour only.
  const manager = new THREE.LoadingManager();
  // Rich building materials: base, normal (the bump) and roughness for every material, one GPU copy per texture.
  // Shared materials at full 1024; the 1600 hero facades come from the 1024 tier to stay inside the GPU budget.
  // `?lowtex` falls back to the earlier base-colour-only budget.
  const LOW = location.search.includes('lowtex');
  const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  // photographic 2048 sets (colour with occlusion folded in, normal and roughness at 1024) for the most-used materials: tools/prep_flow_textures.py
  const FLOW = new Set(['tex-shared-01-red-brick', 'tex-shared-04-limestone', 'tex-shared-05-white-marble', 'tex-shared-07-glass-curtain-blue', 'tex-shared-14-steel-panel', 'tex-shared-15-concrete-boardformed', 'tex-shared-16-concrete-weathered', 'tex-shared-17-white-stucco', 'tex-shared-18-timber-siding', 'tex-shared-21-corrugated-steel', 'tex-hero-01-ironport-towers',
    'tex-shared-02-weathered-brick', 'tex-shared-03-orange-brick', 'tex-shared-06-granite', 'tex-shared-08-glass-curtain-cerulean', 'tex-shared-09-glass-curtain-bronze', 'tex-shared-10-terracotta', 'tex-shared-12-bronze-metal', 'tex-shared-13-copper-roof', 'tex-shared-23-slate-roof', 'tex-shared-24-stone-rubble', 'tex-hero-31-city-hall']);
  // the glTFs point at ../../textures/<set>/<name>_<map>.png: photographic sets come from tex/bld, everything else from the packed copy (tools/pack_ironport.py)
  manager.setURLModifier((u) => {
    const fm0 = u.match(/(tex-(?:shared|hero)-[a-z0-9-]+)_(base|nrm|rgh)\.png/);
    if (!fm0) return u;
    const fm = [fm0[0], fm0[1].startsWith('tex-hero') ? 'hero-facades' : 'shared', fm0[1], fm0[2]];
    if (LOW && fm[3] !== 'base') return TINY;
    if (TEXSET === 'v3' && !V3_HOLD.has(fm[2])) return `/games/forth-horizon/ironport/textures-v3/${fm[1]}/${fm[2]}_${fm[3]}.jpg`;
    if (FLOW.has(fm[2])) return `/games/forth-horizon/tex/bld/${fm[2]}_${fm[3]}.jpg`;
    return `/games/forth-horizon/ironport/textures/${fm[1]}/${fm[2]}_${fm[3]}.jpg`;
  });
  manager.addHandler(/tex-(shared|hero)-[a-z0-9-]+_(base|nrm|rgh)\.png/, new GpuTextureLoader(manager) as unknown as THREE.Loader);
  const loader = new GLTFLoader(manager);
  // All 86 models used to load at once, and every one asks for its own copy of each texture: with the detailed v3 models that is thousands of requests in flight and the browser
  // refuses some (net::ERR_INSUFFICIENT_RESOURCES), which left buildings out. So: a few models at a time, and the cache answers a texture a second model asks for again.
  THREE.Cache.enabled = true;
  let loadSlots = 4;
  const loadWaiters: (() => void)[] = [];
  const limited = async <T,>(f: () => Promise<T>): Promise<T> => {
    if (loadSlots > 0) loadSlots--; else await new Promise<void>((r) => loadWaiters.push(r));
    try { return await f(); } finally { const w = loadWaiters.shift(); if (w) w(); else loadSlots++; }
  };
  const texCache = new Map<string, THREE.Texture>();
  const finishMat = (mat: THREE.MeshStandardMaterial): void => {
    // Reset onBeforeCompile before patching so cloned variant materials never stack duplicate shader passes
    mat.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
    const isV3 = MODELSET === 'v3';
    if (/glass/i.test(mat.name)) {
      patchGlassInterior(mat, nightU, curtainU, sunDirU, isV3);
      mat.needsUpdate = true;
      return;
    }
    const isHero = /hero/i.test(mat.name);
    // Only synthesize procedural punched windows on legacy windowless v1 boxes — v3 models already have real 3D recessed windows & frames!
    const isPunched = !isV3 && /06-granite|04-limestone|16-concrete|15-concrete|17-white-stucco/.test(mat.name) && !!mat.map;
    const isMetalTrim = /12-bronze|14-steel|21-corrugated|13-copper/.test(mat.name);
    if (mat.normalMap) mat.normalScale.set(isHero ? 2.2 : 2.6, isHero ? 2.2 : 2.6);
    mat.envMapIntensity = (isHero || isPunched) ? 1.85 : isMetalTrim ? 1.65 : 1.05;
    if (mat.map && mat.normalMap && !LOW) patchFacadeMasonry(mat, isHero, wetU, nightU, sunDirU);
    if (isPunched) patchPunchedInterior(mat, nightU, curtainU, sunDirU);
    mat.needsUpdate = true;
  };
  const protos = new Map<string, Promise<THREE.Object3D | null>>();
  const load = (kind: string, slug: string): Promise<THREE.Object3D | null> => {
    const key = kind + '/' + slug;
    if (!protos.has(key)) {
      protos.set(key, limited(() => loader.loadAsync(`${IRON}${kind}/${slug}_lod0.gltf`)).then((g) => {
        const json = g.parser.json as { textures?: { source: number }[]; images?: { uri?: string }[] };
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats as THREE.MeshStandardMaterial[]) {
            if (LOW) { if (mat.normalMap) { mat.normalMap.dispose(); mat.normalMap = null; } if (mat.roughnessMap) { mat.roughnessMap.dispose(); mat.roughnessMap = null; } }
            for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
              const tx = mat[k] as THREE.Texture | null;
              if (!tx) continue;
              const assoc = g.parser.associations.get(tx) as { textures?: number } | undefined;
              const uri = assoc?.textures != null ? json.images?.[json.textures?.[assoc.textures]?.source ?? -1]?.uri : undefined;
              if (!uri) continue;
              const have = texCache.get(uri);
              if (have && have !== tx) { tx.dispose(); (mat as any)[k] = have; } else { tx.userData.srcKey = uri.split('/').pop() ?? uri; texCache.set(uri, tx); }
            }
            finishMat(mat);
          }
        });
        return g.scene;
      }).catch((e) => { console.warn('model failed', key, e); return null; }));
    }
    return protos.get(key)!;
  };
  // Variants. generic_variants.json gives every generic building six material schemes (facade, trim, roof): the same form in brick or limestone, blue or bronze glass.
  // Each placed building takes one by a hash of where it stands (the first, the original, most often), so a street of one design no longer looks copied.
  interface Scheme { facade: string; trim: string; roof: string }
  let variantTypes: Record<string, { schemes: Scheme[] }> = {};
  try { variantTypes = ((await (await fetch(BASE + 'generic_variants.json')).json()) as { types: typeof variantTypes }).types; } catch { /* no variants: every building keeps its own materials */ }
  const variantOf = (it: CityItem): number => {
    if (location.search.includes('variants=0') || it.kind !== 'generic' || !variantTypes[it.slug]?.schemes?.length) return 0;     // ?variants=0: every building keeps its own materials
    const n = variantTypes[it.slug].schemes.length;
    const t = Math.sin(it.x * 12.9898 + it.z * 78.233 + it.rotY * 3.1) * 43758.5453;
    const u = t - Math.floor(t);
    return u < 0.34 ? 0 : 1 + Math.min(n - 2, Math.floor(((u - 0.34) / 0.66) * (n - 1)));
  };
  const swapLoader = new GpuTextureLoader(manager);
  const swapTex = new Map<string, Promise<THREE.Texture>>();
  const loadSwap = (name: string, suffix: 'base' | 'nrm' | 'rgh'): Promise<THREE.Texture> => {
    const url = `${name}_${suffix}.png`;                          // the URL modifier above points it at the packed jpg of whichever texture set is on
    if (!swapTex.has(url)) swapTex.set(url, swapLoader.loadAsync(url));
    return swapTex.get(url)!;
  };
  const vprotos = new Map<string, Promise<THREE.Object3D | null>>();
  const variantProto = (kind: string, slug: string, v: number): Promise<THREE.Object3D | null> => {
    if (v === 0) return load(kind, slug);
    const key = `${kind}/${slug}#${v}`;
    if (!vprotos.has(key)) vprotos.set(key, (async () => {
      const base = await load(kind, slug);
      if (!base) return null;
      const schemes = variantTypes[slug].schemes, d = schemes[0], t = schemes[v];
      const map = new Map<string, string>();
      for (const role of ['facade', 'trim', 'roof'] as const) if (d[role] && t[role] && d[role] !== t[role] && !map.has(d[role])) map.set(d[role], t[role]);
      const clone = base.clone(true);
      const made = new Map<THREE.Material, THREE.Material>();
      const jobs: Promise<void>[] = [];
      clone.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const swap = (mat: THREE.MeshStandardMaterial): THREE.Material => {
          const stem = mat.name.replace(/_mat.*$/, '');
          const to = map.get(stem);
          if (!to) return mat;
          if (made.has(mat)) return made.get(mat)!;
          const nm = mat.clone();
          nm.name = to + '_mat';
          made.set(mat, nm);
          const set = async (k: 'map' | 'normalMap' | 'roughnessMap', suffix: 'base' | 'nrm' | 'rgh'): Promise<void> => {
            const old = mat[k] as THREE.Texture | null;
            if (!old) return;
            const tx = (await loadSwap(to, suffix)).clone();
            tx.userData.srcKey = `${to}_${suffix}.png`;
            tx.flipY = old.flipY; tx.wrapS = old.wrapS; tx.wrapT = old.wrapT; tx.repeat.copy(old.repeat); tx.offset.copy(old.offset); tx.rotation = old.rotation; tx.center.copy(old.center);
            tx.colorSpace = old.colorSpace; tx.anisotropy = Math.min(4, old.anisotropy || 4); tx.needsUpdate = true;
            nm[k] = tx;
          };
          jobs.push((async () => { await Promise.all([set('map', 'base'), set('normalMap', 'nrm'), set('roughnessMap', 'rgh')]); finishMat(nm as THREE.MeshStandardMaterial); })());
          return nm;
        };
        m.material = Array.isArray(m.material) ? m.material.map((x) => swap(x as THREE.MeshStandardMaterial)) : swap(m.material as THREE.MeshStandardMaterial);
      });
      await Promise.all(jobs);
      return clone;
    })().catch((e) => { console.warn('variant failed', key, e); return load(kind, slug); }));
    return vprotos.get(key)!;
  };
  // One InstancedMesh per mesh node of each model: thousands of buildings in a few hundred draw calls.
  const groups = new Map<string, CityItem[]>();
  for (const it of cityItems) {
    const key = it.kind + '/' + it.slug + '#' + variantOf(it);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  cityGroup.clear();
  cityVisibility.batches = [];
  cityBatches?.dispose(); cityBatches = null;
  const cityParts: CityPart[] = [];
  let done = 0;
  await runWithConcurrency([...groups.entries()], 6, async ([key, items]) => {
    const [kind, rest] = key.split('/');
    const [slug, vs] = rest.split('#');
    const proto = await variantProto(kind, slug, Number(vs));
    if (!proto) return;
    proto.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    proto.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const place = new THREE.Matrix4(), rotM = new THREE.Matrix4(), scM = new THREE.Matrix4();
    // Grounding and placement are shared by every mesh part of this building.
    const placements = items.map((it) => {
      const gy = groundMin(it) - 0.35;
      rotM.makeRotationY(it.rotY);
      return place.makeTranslation(it.x, gy * exag, it.z).multiply(rotM).multiply(scM.makeScale(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)).clone();
    });
    for (const m of meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const transforms = placements.map((placement) => placement.clone().multiply(m.matrixWorld));
      const castShadow = (m.geometry.boundingSphere?.radius ?? 5) >= 4.5;
      // hero landmarks keep their own meshes: one (Central Station) drew a stray roof slab when batched, and the ~90 heroes cost few draws
      if (CITY_BATCH && kind !== 'hero') { cityParts.push({ geometry: m.geometry, material: m.material as THREE.Material, transforms, castShadow }); continue; }
      const batch = new InstanceVisibility(m.geometry, m.material, transforms);
      if (!castShadow) batch.mesh.castShadow = false;
      cityVisibility.batches.push(batch);
      cityGroup.add(batch.mesh);
    }
    done += items.length;
  });
  if (CITY_BATCH && cityParts.length) {
    // every part sharing a material in one multi-draw (cityBatch.ts): ~100 draws for the whole city instead of thousands
    cityBatches = new CityBatches(cityParts);
    cityGroup.add(cityBatches.group);
    console.log('city batched:', cityBatches.drawCalls, 'draws,', cityBatches.instances, 'instances');
  }
  console.log('city buildings placed', done, 'of', cityItems.length);
  (window as any).cityCount = done;
  addRoofDetails(cityItems);
  buildStreetscape().then(() => spatialCuller.indexGroups([furnitureGroup, scapeGroup, zoneGroup])).catch((e) => console.error('streetscape failed', e));
  buildZones().then(() => spatialCuller.indexGroups([furnitureGroup, scapeGroup, zoneGroup])).catch((e) => console.error('zones failed', e));
}

// ---------- industrial yards and waterfront rows (region/zones.json, made by tools/infill_waterfront.py) ----------
// Each zone has its outline and is paved: concrete yards under the industrial buildings, a lighter quay strip under the waterfront rows. They sit on the drawn terrain, and they
// are named on the map. The far bank has them too, so there is something over the river.
const zoneGroup = new THREE.Group();
scene.add(zoneGroup);
async function buildZones(): Promise<void> {
  const res = await fetch(BASE + 'zones.json');
  if (!res.ok) return;
  const zones = ((await res.json()) as { zones: { id: string; name: string; kind: 'industrial' | 'waterfront'; bank: string; center: number[]; hull: number[][] }[] }).zones;
  const tex = new THREE.TextureLoader().load('/games/forth-horizon/ironport/textures-v3/shared/tex-shared-16-concrete-weathered_base.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  const mats = {
    industrial: new THREE.MeshStandardMaterial({ map: tex, color: 0x8b8a86, roughness: 0.93, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    waterfront: new THREE.MeshStandardMaterial({ map: tex, color: 0xb9b2a2, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  zoneGroup.clear();
  for (const z of zones) {
    const hull = z.hull;
    if (hull.length < 3) continue;
    const cx = hull.reduce((a, q) => a + q[0], 0) / hull.length, cz = hull.reduce((a, q) => a + q[1], 0) / hull.length;
    // the outline as a radius for each of 28 directions from the centre (the hull is convex), then 8 rings out to it: close-set points, so the pad lies on the ground between them
    const N = 28, RN = 8;
    const radius = (ang: number): number => {
      const dx = Math.cos(ang), dz = Math.sin(ang);
      let best = 0;
      for (let i = 0; i < hull.length; i++) {
        const a1 = hull[i], b1 = hull[(i + 1) % hull.length];
        const ex = b1[0] - a1[0], ez = b1[1] - a1[1], den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a1[0] - cx) * ez - (a1[1] - cz) * ex) / den, u = ((a1[0] - cx) * dz - (a1[1] - cz) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
      }
      return best;
    };
    const rs: number[] = []; for (let i = 0; i < N; i++) rs.push(radius((i / N) * Math.PI * 2));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const at = (x: number, zz: number): void => { pos.push(x, meshH(x, zz) + 0.3, zz); uv.push(x / 9, zz / 9); };
    at(cx, cz);
    for (let r = 1; r <= RN; r++) for (let i = 0; i < N; i++) { const ang = (i / N) * Math.PI * 2, rr = rs[i] * (r / RN); at(cx + Math.cos(ang) * rr, cz + Math.sin(ang) * rr); }
    for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
    for (let r = 1; r < RN; r++) for (let i = 0; i < N; i++) {
      const a = 1 + (r - 1) * N + i, b = 1 + (r - 1) * N + ((i + 1) % N), c = a + N, d = b + N;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats[z.kind]);
    m.receiveShadow = true; m.name = z.id;
    zoneGroup.add(m);
    labelGroup.add(label(z.name, z.center[0], meshH(z.center[0], z.center[1]) + (z.kind === 'industrial' ? 180 : 140), z.center[1], z.kind === 'industrial' ? '#ffb870' : '#9fe6ff', 0.5));
  }
}

// ---------- cloud cover ----------
function makeCloudTexture(seed: number): THREE.CanvasTexture {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  let sd = seed;
  const rnd = (): number => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const octave = (cells: number): Float32Array => {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = grid[(y0 % cells) * cells + (x0 % cells)], b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const d = grid[((y0 + 1) % cells) * cells + (x0 % cells)], e = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * N + x] = (a + (b - a) * sx) * (1 - sy) + (d + (e - d) * sx) * sy;
    }
    return out;
  };
  const o1 = octave(4), o2 = octave(8), o3 = octave(16), o4 = octave(32);
  for (let i = 0; i < N * N; i++) {
    const v = o1[i] * 0.5 + o2[i] * 0.28 + o3[i] * 0.15 + o4[i] * 0.07;
    const cov = Math.min(1, Math.max(0, (v - 0.55) / 0.26));
    const a = cov * cov * (3 - 2 * cov);
    const shade = 255 - Math.round((1 - Math.min(1, o3[i] * 1.2)) * 12);
    img.data[i * 4] = shade; img.data[i * 4 + 1] = shade; img.data[i * 4 + 2] = Math.min(255, shade + 6); img.data[i * 4 + 3] = Math.round(a * 210);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const cloudLayers: { mesh: THREE.Mesh; tex: THREE.Texture; vx: number; vz: number }[] = [];
for (const [alt, size, rep, seed, vx, vz, op] of [[2900, 62000, 2.8, 7, 0.0075, 0.0028, 0.62], [3900, 72000, 2.0, 19, -0.0042, 0.0062, 0.42]] as [number, number, number, number, number, number, number][]) {
  const tex = makeCloudTexture(seed);
  tex.repeat.set(rep, rep);
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const cmat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, fog: false, side: THREE.DoubleSide });
  // Smooth circular edge fade so square cloud plane boundaries never cut a hard line across the sky
  cmat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloudUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudUv;')
      .replace('#include <dithering_fragment>', 'gl_FragColor.a *= smoothstep(1.0, 0.25, length(vCloudUv * 2.0 - 1.0));\n#include <dithering_fragment>');
  };
  cmat.customProgramCacheKey = () => 'cloud-radial-fade';
  const mesh = new THREE.Mesh(geo, cmat);
  mesh.position.set(0, alt, -4500);
  mesh.renderOrder = 5;
  scene.add(mesh);
  cloudLayers.push({ mesh, tex, vx, vz });
}
// ---------- weather ----------
const wx = new WeatherRig(scene);
const sky = new Sky(scene, atmosphere);
const spray = new SprayFx(scene);
const dust = new DustFx(scene);          // dirt and dust off loose surfaces: the rally stage above all
const wDir = new THREE.Vector3(), wSun = new THREE.Vector3(0, 0.4, 1), tmpSun = new THREE.Vector3();
sky.loadWeatherSkies();
const NIGHT_K: Record<string, number> = { clear: 0, golden: 0, sunrise: 0.15, sunset: 0.1, dusk: 0.55, night: 1 };
const skyFog = new THREE.Color();
// each race has a plan: what the sky does over the race (seconds from the green light). The map shows the worst of it as the forecast.
const WEATHER_PLAN: Record<string, { t: number; w: string }[]> = {
  city: [{ t: 0, w: 'overcast' }, { t: 70, w: 'rain' }, { t: 200, w: 'storm' }],
  cliff: [{ t: 0, w: 'fog' }, { t: 140, w: 'overcast' }, { t: 320, w: 'partly' }],
  rally: [{ t: 0, w: 'partly' }, { t: 60, w: 'overcast' }, { t: 150, w: 'rain' }],
  ind: [{ t: 0, w: 'overcast' }, { t: 90, w: 'rain' }, { t: 240, w: 'overcast' }],
  harb: [{ t: 0, w: 'partly' }, { t: 120, w: 'overcast' }, { t: 260, w: 'rain' }],       // sea weather rolling in over the harbour
  superior: [{ t: 0, w: 'clear' }, { t: 420, w: 'fog' }, { t: 720, w: 'partly' }],         // clear on the coast, cloud on the pass, sun again in the forest
  escarpment: [{ t: 0, w: 'partly' }, { t: 150, w: 'clear' }, { t: 330, w: 'overcast' }],    // broken cloud by the lake, clear on the crest, cloud coming in for the descent
  free: [{ t: 0, w: 'clear' }, { t: 240, w: 'partly' }, { t: 540, w: 'overcast' }, { t: 840, w: 'rain' }],
};
let wxOverride = 'auto';
try { const o = localStorage.getItem('apex.wx'); if (o && (o === 'auto' || WEATHERS[o])) wxOverride = o; } catch { /* storage blocked */ }
let wxPlan: { t: number; w: string }[] | null = null, wxPlanT = 0, wxPlanI = -1;
const cloudBase = new Map<THREE.Mesh, number>();
const WX_GREY = new THREE.Color(0x7d8794), WX_TINT = new THREE.Color(0.52, 0.58, 0.68), tmpC = new THREE.Color();
let wxGripSpec: typeof CARS.kestrel | null = null;       // the car's spec with the weather's grip folded in
function stepWeather(dt: number): void {
  wx.step(dt, camera.position, mapMode, driving ? Math.abs(driving.ps.speedMps) : 0, false);
  const w = wx.cur, t = TOD[todKey];
  roadWater.pooling = poolLevel;
  roadWater.update(dt, w.rain, w.sun, w.wind);
  w.wet = roadWater.wetness;
  if (!t) return;
  const f = wx.flash;
  sun.intensity = t.sunInt * w.sun * (1 + f * 2.5);
  hemi.intensity = t.hemiInt * w.hemi * (1 + f * 1.6);
  renderer.toneMappingExposure = t.exposure + w.exposure + f * 0.45;
  scene.environmentIntensity = t.env * (0.45 + 0.55 * w.sun) * (1 + f);
  wetU.value = w.wet;
  for (const l of cloudLayers) {
    const m = l.mesh.material as THREE.MeshBasicMaterial;
    if (!cloudBase.has(l.mesh)) cloudBase.set(l.mesh, m.opacity);
    m.opacity = Math.min(0.96, cloudBase.get(l.mesh)! * w.cloud);
    m.color.set(0xffffff).lerp(tmpC.set(0x2a303c), w.cloudDark * 0.92);
    if (f > 0.05) m.color.lerp(tmpC.set(0xdfe8ff), f * 0.6);
  }
  if (mapMode) {
    if (terrainMat) terrainMat.color.set(0xffffff).lerp(WX_TINT, Math.min(1, w.fogGrey * 0.7 + w.rain * 0.25));
  } else {
    if (terrainMat) terrainMat.color.set(0xffffff);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(t.fog).lerp(WX_GREY, w.fogGrey).multiplyScalar(1 - w.cloudDark * 0.35 + f * 0.4);
      scene.fog.near = t.fogNear * w.fogNear; scene.fog.far = t.fogFar * w.fogFar;
    }
    scene.backgroundIntensity = 1 - 0.62 * w.fogGrey * (1 - f * 0.7);
  }
  if (mapMode) scene.backgroundIntensity = 1;
  // the sky dome: panorama + procedural detail, with the weather blending in a real overcast and storm sky
  {
    const night = NIGHT_K[todKey] ?? 0;
    skyFog.set(t.fog).lerp(WX_GREY, w.fogGrey).multiplyScalar(1 - w.cloudDark * 0.35);
    sky.setVisible(!mapMode);
    sky.update(dt, camera, {
      sunDir, sunCol: sun.color, sunAmt: (1 - night) * Math.min(1, w.sun * 1.3 + 0.1), night, fog: skyFog, fogAmt: w.fogGrey,
      mixOver: Math.min(1, Math.max(0, (w.cloud - 0.9) / 0.6)), mixStorm: Math.min(1, Math.max(0, (w.cloudDark - 0.6) / 0.3)),
      dark: w.cloudDark * 0.6, flash: f, birds: !mapMode && w.rain < 0.15 && night < 0.3 && w.fogGrey < 0.5,
    });
  }
  if (waterSurface) {
    const night = NIGHT_K[todKey] ?? 0;
    waterSurface.setSky(sky.baseTexture());
    // the menu's high view: put the sun low in the direction the camera faces (drifting a little) so a glitter path runs across the water toward the viewer
    if (mapMode) {
      camera.getWorldDirection(wDir); const az = Math.atan2(wDir.x, wDir.z) + Math.sin(performance.now() / 9000) * 0.35;
      wSun.set(Math.sin(az) * 0.94, 0.34, Math.cos(az) * 0.94).normalize();
    }
    waterSurface.update(dt, {
      glint: mapMode ? 1 : 0,
      sunDir: mapMode ? wSun : sunDir, sunCol: sun.color, sunAmt: (1 - night) * Math.min(1, w.sun * 1.3 + 0.1), wind: Math.min(1, 0.12 + w.rain * 0.5 + w.cloudDark * 0.5), rain: w.rain,
      storm: Math.min(1, Math.max(0, (w.cloudDark - 0.6) / 0.3)), fog: scene.fog instanceof THREE.Fog ? scene.fog.color : skyFog,
      fogNear: scene.fog instanceof THREE.Fog ? scene.fog.near : 1e6, fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : 2e6,
      skyDim: (1 - w.cloudDark * 0.5) * (1 - night * 0.85) + f * 0.6, mapFade: mapFadeU.value,
    });
  }
  // water collects while it rains and drains away slowly after
  poolLevel = roadWater.pooling;
  poolU.value = poolLevel;
  { const nk = NIGHT_K[todKey] ?? 0; nightU.value = Math.min(1, nk + w.cloudDark * 0.45 * (1 - nk)); }
  roadUniforms.uRainR.value = w.rain; roadUniforms.uTimeR.value += dt;
  spray.setTint(skyFog, 1.12);
  if (driving && !mapMode && w.rain > 0.1) {                        // rain bouncing off the road around the camera
    let n = w.rain * dt * 260; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = 2 + Math.random() * 17, x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
      spray.emit(x, groundH(x, z) + 0.03, z, (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6, 0.04, 0.2 + Math.random() * 0.15, 0.4, 14);
    }
  }
  spray.update(dt);
  {
    // the dust is the ground's ochre, lit by the day: bright in sun, a grey brown under cloud and in the evening
    const lum = skyFog.r * 0.3 + skyFog.g * 0.59 + skyFog.b * 0.11;
    dust.setTint(new THREE.Color(0.62, 0.42, 0.22).multiplyScalar(0.34 + 0.62 * Math.min(1, lum * 1.3)));
    dust.wind.set(Math.sin(wx.cur.wind * 2.0) * (0.4 + wx.cur.wind * 4), Math.cos(wx.cur.wind * 2.0) * (0.3 + wx.cur.wind * 3));
    dust.update(dt);
  }
  for (const m of driveSurfaces) {
    const mm = m.material as THREE.MeshStandardMaterial;
    mm.roughness = 0.8 - 0.62 * w.wet; mm.color.setScalar(1 - 0.36 * w.wet);
    if (!mm.userData.pud) {                      // the road meshes carry the same puddles as the terrain's painted roads
      mm.userData.pud = true;
      mm.onBeforeCompile = (sh) => {
        sh.uniforms.uPool = poolU; sh.uniforms.uWet = wetU; Object.assign(sh.uniforms, roadUniforms);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nuniform float uPool;\nuniform float uWet;\n' + PUDDLE_GLSL)
          .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gPud = puddleAt(vRW.xz, uPool);\nfloat gRoad = 1.0;\ndiffuseColor.rgb *= 1.0 - 0.38 * gPud;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.015, gPud);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.6, gPud);');
        sh.fragmentShader = injectRoadPbr(sh.fragmentShader, 'vRW.xz');
      };
      mm.customProgramCacheKey = () => 'roadpud';
      mm.needsUpdate = true;
    }
  }
  const g = SOV_SPEC.corneringGrip * (1 - 0.24 * (SOV_SPEC.wetSensitivity ?? 1) * roadWater.wetness) * (1 - 0.82 * hydro);
  if (!wxGripSpec || Math.abs(wxGripSpec.corneringGrip - g) > 0.004 || wxGripSpec.suspension !== SOV_SPEC.suspension) wxGripSpec = { ...SOV_SPEC, corneringGrip: g };
  // the race's plan: step through its weather as the clock runs
  if (driving && wxPlan && wxOverride === 'auto' && driving.lock <= 0) {
    wxPlanT += dt;
    while (wxPlanI + 1 < wxPlan.length && wxPlanT >= wxPlan[wxPlanI + 1].t) { wxPlanI++; wx.setWeather(wxPlan[wxPlanI].w, false, false); }
  }
}
// ---------- wet-road reflections ----------
// While the road is wet or has puddles, the scene around the car is captured into a small environment map a couple of times a second, and the road materials
// reflect it: puddles show the buildings, lights and sky, wet asphalt a blurred version, with the roughness deciding the blur.
let probeRT: THREE.WebGLRenderTarget | null = null, probeT = 0, probeOn = false;
const probeMats = (): THREE.MeshStandardMaterial[] => [terrainMat, ...(driveSurfaces.map((m) => m.material) as THREE.MeshStandardMaterial[])].filter(Boolean);
// Off: the snapshot is re-taken from a new spot every few tenths of a second, so the reflections popped and jumped around on the wet asphalt like a moving light.
// Wet roads and puddles reflect the (stable) scene environment instead.
const DYNAMIC_PROBE = false;
function updateProbe(dt: number): void {
  const need = DYNAMIC_PROBE && !!driving && !mapMode && !replay.active && (wx.cur.wet > 0.25 || poolLevel > 0.1);
  if (!need) {
    if (probeOn) { probeOn = false; for (const m of probeMats()) { m.envMap = null; m.needsUpdate = true; } probeRT?.dispose(); probeRT = null; }
    return;
  }
  probeT -= dt;
  if (probeT > 0 && probeRT) return;
  probeT = 0.8;
  const s = driving!;
  const hide: THREE.Object3D[] = [s.car, spray.points, dust.points, forestGroup, scapeGroup];
  const was = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  const next = pmrem.fromScene(scene, 0, 1, 14000, { size: 96, position: new THREE.Vector3(s.pos.x, s.car.position.y + 2.5, s.pos.z) });
  hide.forEach((o, i) => { o.visible = was[i]; });
  const old = probeRT; probeRT = next;
  const strength = 0.55 + 0.9 * Math.max(wx.cur.wet, poolLevel);
  for (const m of probeMats()) { m.envMap = next.texture; m.envMapIntensity = strength; if (!probeOn) m.needsUpdate = true; }
  probeOn = true;
  old?.dispose();
}
function tintClouds(sun: number, sky: number): void {
  const c = new THREE.Color(0xffffff).lerp(new THREE.Color(sun), 0.12).lerp(new THREE.Color(sky), 0.05);
  for (const l of cloudLayers) (l.mesh.material as THREE.MeshBasicMaterial).color.copy(c);
}

// ---------- music ----------
// Menu tracks on the map screen and briefings; the driving tracks alternate while driving (lists in music/music.json, built by tools/prep_music.py). Browsers only
// allow audio after a first click or key press, so playback starts on the first gesture. Tracks crossfade.
const MUSIC_BASE = '/games/forth-horizon/music/';
let musicVol = 0.6;
try { const v = parseFloat(localStorage.getItem('apex.musicVol') ?? ''); if (!Number.isNaN(v)) musicVol = Math.min(1, Math.max(0, v)); } catch { /* storage blocked */ }
let musicDuck = 1;                      // the music sits well under the engine while driving
let musicWanted: 'menu' | 'drive' = 'menu';
let musicUnlocked = false;
let driveIdx = 0;
let curAudio: HTMLAudioElement | null = null;
function fadeTo(a: HTMLAudioElement, target: number, ms: number, done?: () => void): void {
  const from = a.volume, t0 = performance.now();
  const tick = (): void => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.min(1, Math.max(0, from + (target - from) * k));
    if (k < 1) requestAnimationFrame(tick); else done?.();
  };
  tick();
}
let musicLists: { menu: { file: string }[]; drive: { file: string }[] } = { menu: [{ file: 'menu0.mp3' }], drive: [{ file: 'drive0.mp3' }] };
fetch(MUSIC_BASE + 'music.json').then((r) => r.json()).then((m) => { musicLists = m; }).catch(() => undefined);
let menuIdx = 0;
function playMusic(kind: 'menu' | 'drive'): void {
  musicWanted = kind;
  if (!musicUnlocked) return;
  if (curAudio && curAudio.dataset.kind === kind && !curAudio.paused && !curAudio.ended) return;
  const list = musicLists[kind].length ? musicLists[kind] : musicLists.menu;
  const file = kind === 'menu' ? list[menuIdx++ % list.length].file : list[driveIdx++ % list.length].file;
  const next = new Audio(MUSIC_BASE + file);
  next.dataset.kind = kind;
  next.volume = 0;
  next.loop = false;
  next.onended = () => { if (musicWanted === kind) playMusic(kind); };
  next.play().then(() => {
    const prev = curAudio;
    curAudio = next;
    fadeTo(next, musicVol * musicDuck, 1600);
    if (prev) fadeTo(prev, 0, 1200, () => { prev.pause(); });
  }).catch(() => undefined);
}
function setMusicVolume(v: number): void {
  musicVol = v;
  if (curAudio) curAudio.volume = v * musicDuck;
  try { localStorage.setItem('apex.musicVol', String(v)); } catch { /* storage blocked */ }
}
function setMusicDuck(d: number): void {
  musicDuck = d;
  if (curAudio) fadeTo(curAudio, musicVol * d, 600);
}
const unlockMusic = (): void => {
  if (musicUnlocked) return;
  musicUnlocked = true;
  removeEventListener('pointerdown', unlockMusic);
  removeEventListener('keydown', unlockMusic);
  playMusic(musicWanted);
};
addEventListener('pointerdown', unlockMusic);
addEventListener('keydown', unlockMusic);

// ---------- map screen (game menu feel) ----------
const MAP_BG = 0x070b12;
const vignette = document.createElement('div');
vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;background:radial-gradient(ellipse at 60% 50%,rgba(0,0,0,0) 40%,rgba(10,0,16,.6) 100%),linear-gradient(0deg,rgba(26,0,38,.88) 0%,rgba(26,0,38,0) 38%),linear-gradient(180deg,rgba(26,0,38,.7) 0%,rgba(26,0,38,0) 24%)';
document.body.appendChild(vignette);
// a small tag that stays on screen the whole time: this build is a pre-alpha
{
  const tag = document.createElement('div');
  tag.textContent = 'PRE-ALPHA';
  tag.style.cssText = 'position:fixed;left:12px;bottom:10px;z-index:40;pointer-events:none;font:700 10px Outfit,Inter,sans-serif;letter-spacing:.24em;color:rgba(255,255,255,.78);padding:3px 9px;border:1px solid rgba(255,140,0,.55);border-radius:999px;background:rgba(10,12,24,.55)';
  document.body.appendChild(tag);
}
const menuEl = document.createElement('div');
menuEl.style.cssText = 'position:fixed;inset:0;display:none;pointer-events:none;font-family:Inter,Manrope,sans-serif;color:#fff;user-select:none';
menuEl.innerHTML = `
  <div id="menuTitle" style="position:absolute;left:44px;top:26px;width:440px">
    <img src="/games/forth-horizon/brand/apex-logo.svg" alt="Plajah Motorsport: Apex" style="display:block;width:400px;max-width:60vw;height:auto;filter:drop-shadow(0 4px 18px rgba(0,0,0,.55))" />
    <div style="margin-top:6px;display:flex;align-items:center;gap:10px"><span style="padding:2px 8px;border:1px solid rgba(255,140,0,.7);border-radius:999px;font:600 11px Outfit,sans-serif;letter-spacing:.16em;color:#fff;background:rgba(212,0,85,.35)">PRE-ALPHA</span><span style="font:500 12px 'JetBrains Mono',monospace;color:rgba(208,188,255,.75)">Ironport &middot; the Great Lakes coast &middot; 150 km&sup2;</span></div>
  </div>
  <div id="mapCardsWrap" style="position:absolute;left:0;right:0;bottom:40px;pointer-events:auto;transition:opacity .9s">
    <button id="mcPrev" aria-label="Previous" style="position:absolute;left:14px;top:50%;transform:translateY(-62%);z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(26,0,38,.7);color:#fff;font:700 22px Outfit,sans-serif;cursor:pointer">&lsaquo;</button>
    <div id="mapCards" style="display:flex;gap:14px;align-items:stretch;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;scroll-snap-type:x proximity;padding:20px 16vw 24px;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 15%,#000 85%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 15%,#000 85%,transparent 100%)"></div>
    <button id="mcNext" aria-label="Next" style="position:absolute;right:14px;top:50%;transform:translateY(-62%);z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(26,0,38,.7);color:#fff;font:700 22px Outfit,sans-serif;cursor:pointer">&rsaquo;</button>
    <div style="text-align:center;font:600 10px Outfit,sans-serif;opacity:.55;letter-spacing:.28em;text-transform:uppercase;margin-top:2px">SCROLL OR DRAG THE CARDS &nbsp;&middot;&nbsp; DRAG THE MAP TO ORBIT</div>
  </div>`;
document.body.appendChild(menuEl);
{
  const track = menuEl.querySelector('#mapCards') as HTMLElement, wrap = menuEl.querySelector('#mapCardsWrap') as HTMLElement;
  track.style.setProperty('-ms-overflow-style', 'none');
  const style = document.createElement('style'); style.textContent = '#mapCards::-webkit-scrollbar{display:none}'; document.head.appendChild(style);
  const by = (d: number): void => { track.scrollBy({ left: d * 320, behavior: 'smooth' }); };
  (menuEl.querySelector('#mcPrev') as HTMLElement).onclick = () => by(-1);
  (menuEl.querySelector('#mcNext') as HTMLElement).onclick = () => by(1);
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); track.style.scrollBehavior = 'auto'; track.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY); track.style.scrollBehavior = ''; }, { passive: false });
  addEventListener('keydown', (e) => { if (menuEl.style.display === 'none' || cineOn) return; if (e.key === 'ArrowRight') by(1); else if (e.key === 'ArrowLeft') by(-1); });
  // drag the strip with the mouse; a drag is not a click on a card
  let dx0 = 0, sl0 = 0, dragging = false, moved = 0;
  track.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; dx0 = e.clientX; sl0 = track.scrollLeft; });
  addEventListener('pointermove', (e) => { if (!dragging) return; moved = Math.max(moved, Math.abs(e.clientX - dx0)); track.style.scrollBehavior = 'auto'; track.scrollLeft = sl0 - (e.clientX - dx0); });
  addEventListener('pointerup', () => { dragging = false; track.style.scrollBehavior = ''; });
  track.addEventListener('click', (e) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
}
const MAP_EVENTS: { id: string; tag: string; name: string; sub: string; color: string; act: () => void }[] = [
  { id: 'city', tag: 'CITY CIRCUIT', name: 'Ironport Grand Circuit', sub: '4.2 km · 13 corners · downtown streets', color: '#FF8C00', act: () => openBrief('city') },
  { id: 'cliff', tag: 'ROAD COURSE', name: 'Great Lakes Cliff Raceway', sub: '9.8 km · tunnel · 135 m lake-view climb', color: '#00DAF3', act: () => openBrief('cliff') },
  { id: 'rally', tag: 'RALLY STAGE', name: 'Pinewood Rally Stage', sub: '11 km · gravel · forest trail', color: '#D40055', act: () => openBrief('rally') },
  { id: 'superior', tag: 'MOUNTAIN CIRCUIT', name: 'Superior Range Circuit', sub: '23 km · cliff highway + Glacier Pass', color: '#7FD1FF', act: () => openBrief('superior') },
  { id: 'escarpment', tag: 'MOUNTAIN CIRCUIT', name: 'Escarpment Circuit', sub: '10.4 km · the Stair · crest viaduct', color: '#FFB86B', act: () => openBrief('escarpment') },
  { id: 'ind', tag: 'STREET COURSE', name: 'Ironworks Industrial Circuit', sub: '5.3 km · rail-yard bridge · harbour hairpin', color: '#9bb0c8', act: () => openBrief('ind') },
  { id: 'harb', tag: 'STREET COURSE', name: 'Harbor District Street Circuit', sub: '5.4 km · piers · container yards', color: '#6fb7d8', act: () => openBrief('harb') },
  { id: 'free', tag: 'FREE ROAM', name: 'Explore the region', sub: 'Port Halcyon · dunes · harbor · freeway', color: '#D0BCFF', act: () => openBrief('free') },
];
const cardsEl = menuEl.querySelector('#mapCards') as HTMLElement;
for (const ev of MAP_EVENTS) {
  const b = document.createElement('div');
  b.style.cssText = `flex:0 0 288px;scroll-snap-align:center;padding:14px 18px;border-radius:24px;border:1px solid rgba(255,255,255,.10);background:rgba(26,0,38,.62);backdrop-filter:blur(14px);cursor:pointer;transition:transform .2s cubic-bezier(.2,0,0,1),border-color .2s,box-shadow .2s;box-shadow:0 10px 30px rgba(0,0,0,.35)`;
  const plan = WEATHER_PLAN[ev.id], worst = WEATHERS[worstOf(plan)];
  b.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${ev.color};box-shadow:0 0 10px ${ev.color}"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:${ev.color}">${ev.tag}</span><span style="margin-left:auto;font:600 11px Outfit,sans-serif;letter-spacing:.08em;color:#D0BCFF">${worst.icon} ${worst.temp}&deg;C</span></div><div style="font:600 19px Outfit,sans-serif;margin:5px 0 3px">${ev.name}</div><div style="font:400 12px Inter,sans-serif;color:rgba(255,255,255,.62)">${ev.sub}</div><div style="font:500 11px Inter,sans-serif;color:rgba(208,188,255,.85);margin-top:6px;letter-spacing:.03em">Forecast: ${forecastText(plan)}</div>`;
  b.onmouseenter = () => { if (wxOverride === 'auto') wx.setWeather(worstOf(WEATHER_PLAN[ev.id]), false, true); b.style.transform = 'translateY(-8px)'; b.style.borderColor = ev.color; b.style.boxShadow = `0 10px 34px rgba(0,0,0,.45),0 0 22px ${ev.color}55`; };
  b.onmouseleave = () => { if (wxOverride === 'auto' && briefEl.style.display === 'none') wx.setWeather('partly', false, true); b.style.transform = ''; b.style.borderColor = 'rgba(255,255,255,.10)'; b.style.boxShadow = '0 10px 30px rgba(0,0,0,.35)'; };
  b.onclick = ev.act;
  cardsEl.appendChild(b);
}
const backBtn = document.createElement('button');
backBtn.textContent = '← MAP';
backBtn.style.cssText = 'position:fixed;right:76px;top:16px;height:42px;padding:0 20px;background:rgba(26,0,38,.62);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;backdrop-filter:blur(12px);font:600 12px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;display:none';
backBtn.onclick = () => preset('overview');
document.body.appendChild(backBtn);
function makeMapBackdrop(): THREE.CanvasTexture {
  const W = 2048, H = 1152, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(W * 0.68, H * 0.5, 80, W * 0.62, H * 0.52, W * 0.8);
  bg.addColorStop(0, '#5a0a7e'); bg.addColorStop(0.42, '#2a0640'); bg.addColorStop(1, '#0a0210');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // topographic contour rings
  const cx = W * 0.7, cy = H * 0.52;
  for (let k = 1; k < 46; k++) {
    g.beginPath();
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      const r = k * 30 + 22 * Math.sin(3 * a + k * 0.35) + 14 * Math.sin(5 * a - k * 0.2) + 9 * Math.sin(9 * a + k * 0.6);
      const x = cx + Math.cos(a) * r * 1.35, y = cy + Math.sin(a) * r * 0.95;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.strokeStyle = `rgba(208,188,255,${k % 5 === 0 ? 0.30 : 0.13})`;
    g.lineWidth = k % 5 === 0 ? 1.6 : 1;
    g.stroke();
  }
  // fine grid with heavier lines every fifth
  for (let x = 0; x < W; x += 64) { g.strokeStyle = x % 320 === 0 ? 'rgba(208,188,255,.18)' : 'rgba(208,188,255,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 64) { g.strokeStyle = y % 320 === 0 ? 'rgba(208,188,255,.18)' : 'rgba(208,188,255,.06)'; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // orange accent slashes and corner ticks
  g.fillStyle = 'rgba(212,0,85,.30)';
  for (let i = 0; i < 5; i++) { g.save(); g.translate(W * 0.43 + i * 26, 0); g.transform(1, 0, -0.45, 1, 0, 0); g.fillRect(0, 0, 10 - i, H); g.restore(); }
  g.strokeStyle = 'rgba(255,140,0,.7)'; g.lineWidth = 2;
  for (const [x, y, dx, dy] of [[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]]) { g.beginPath(); g.moveTo(x, y + dy * 60); g.lineTo(x, y); g.lineTo(x + dx * 60, y); g.stroke(); }
  // coordinates and tick scale
  g.font = '600 15px JetBrains Mono, monospace'; g.fillStyle = 'rgba(208,188,255,.65)';
  g.fillText('42.33° N   83.05° W', W - 330, H - 56);
  g.fillText('IRONPORT  ·  LAKE MICHIGAN COAST', W - 410, 70);
  g.fillText('N', W * 0.7 - 5, 60);
  g.strokeStyle = 'rgba(208,188,255,.4)'; g.lineWidth = 1;
  g.beginPath(); g.arc(W * 0.7, 120, 26, 0, Math.PI * 2); g.moveTo(W * 0.7, 80); g.lineTo(W * 0.7, 160); g.moveTo(W * 0.7 - 40, 120); g.lineTo(W * 0.7 + 40, 120); g.stroke();
  for (let x = 120; x < W - 120; x += 16) { g.beginPath(); g.moveTo(x, H - 40); g.lineTo(x, H - 40 - (x % 80 === 0 ? 14 : 6)); g.stroke(); }
  // ---- race theme ----
  // speed streaks sweeping left to right
  for (let i = 0; i < 70; i++) {
    const y = ((i * 97) % 100) / 100 * H, len = 160 + ((i * 53) % 100) * 6, x = ((i * 211) % 100) / 100 * W - 80;
    const gr = g.createLinearGradient(x, y, x + len, y - len * 0.12);
    gr.addColorStop(0, 'rgba(255,140,0,0)'); gr.addColorStop(0.7, `rgba(${i % 3 ? '255,140,0' : '212,0,85'},${0.07 + (i % 5) * 0.03})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = 1 + (i % 3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y - len * 0.12); g.stroke();
  }
  // ghost track outline (a closed circuit silhouette) behind the map
  g.save();
  g.translate(W * 0.64, H * 0.5); g.rotate(-0.18);
  g.beginPath();
  const tp: number[][] = [[-420, -90], [-300, -230], [-90, -250], [60, -170], [230, -250], [420, -180], [470, -20], [330, 90], [380, 230], [150, 270], [-60, 170], [-240, 250], [-430, 150], [-500, 20]];
  g.moveTo((tp[0][0] + tp[tp.length - 1][0]) / 2, (tp[0][1] + tp[tp.length - 1][1]) / 2);
  for (let i = 0; i < tp.length; i++) { const a = tp[i], b = tp[(i + 1) % tp.length]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
  g.closePath();
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 34; g.stroke();
  g.setLineDash([22, 22]); g.strokeStyle = 'rgba(255,140,0,.38)'; g.lineWidth = 2.5; g.stroke(); g.setLineDash([]);
  g.restore();
  // tyre tread marks sweeping across the lower left
  g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 14;
  for (const off of [0, 26]) { g.beginPath(); g.moveTo(-40, H * 0.86 + off); g.bezierCurveTo(W * 0.18, H * 0.74 + off, W * 0.3, H * 0.96 + off, W * 0.5, H * 0.82 + off); g.stroke(); }
  // solid brand rails along the bottom and top edges (ember gradient with a lap-marker notch)
  for (const [y0, hh] of [[H - 22, 6], [16, 3]] as [number, number][]) {
    const rg = g.createLinearGradient(0, 0, W, 0);
    rg.addColorStop(0, 'rgba(212,0,85,0)'); rg.addColorStop(0.18, 'rgba(212,0,85,.85)'); rg.addColorStop(0.62, 'rgba(255,140,0,.85)'); rg.addColorStop(1, 'rgba(255,140,0,0)');
    g.fillStyle = rg; g.fillRect(0, y0, W, hh);
  }
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(W * 0.62 - 2, H - 30, 4, 14);
  // rev counter arc and lap readout (bottom left)
  g.save(); g.translate(150, H - 150);
  g.lineWidth = 10; g.strokeStyle = 'rgba(208,188,255,.25)'; g.beginPath(); g.arc(0, 0, 92, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
  g.strokeStyle = 'rgba(255,140,0,.8)'; g.beginPath(); g.arc(0, 0, 92, Math.PI * 1.9, Math.PI * 2.25); g.stroke();
  for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.75 + (Math.PI * 1.5) * i / 12; g.strokeStyle = 'rgba(220,240,255,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * 74, Math.sin(a) * 74); g.lineTo(Math.cos(a) * 86, Math.sin(a) * 86); g.stroke(); }
  g.rotate(-0.4); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(70, 0); g.stroke();
  g.restore();
  g.font = '700 44px JetBrains Mono, monospace'; g.fillStyle = 'rgba(255,255,255,.36)'; g.fillText('00:00.000', 280, H - 118);
  g.font = '700 13px JetBrains Mono, monospace'; g.fillStyle = 'rgba(255,140,0,.75)'; g.fillText('BEST LAP   --:--.---', 282, H - 92);
  // sector bars and a large ghost race number
  for (let i = 0; i < 3; i++) { g.fillStyle = ['rgba(0,218,243,.65)', 'rgba(255,140,0,.65)', 'rgba(212,0,85,.65)'][i]; g.fillRect(W - 470 + i * 140, 112, 130, 6); }
  g.font = '700 12px JetBrains Mono, monospace'; g.fillStyle = 'rgba(208,188,255,.7)'; g.fillText('S1', W - 470, 140); g.fillText('S2', W - 330, 140); g.fillText('S3', W - 190, 140);
  g.font = '800 420px Outfit, sans-serif'; g.fillStyle = 'rgba(255,255,255,.04)'; g.fillText('01', W * 0.52, H * 0.86);
  // chevron arrows pointing into the map
  for (let i = 0; i < 5; i++) { const x = W * 0.4 + i * 34; g.strokeStyle = `rgba(255,140,0,${0.16 + i * 0.07})`; g.lineWidth = 7; g.beginPath(); g.moveTo(x, H * 0.46); g.lineTo(x + 22, H * 0.5); g.lineTo(x, H * 0.54); g.stroke(); }
  // vignette
  const vg = g.createRadialGradient(W * 0.6, H * 0.5, H * 0.35, W * 0.6, H * 0.5, W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let mapBackdrop: THREE.CanvasTexture | null = null;
const gearBtn = document.createElement('button');
gearBtn.setAttribute('aria-label', 'Settings');
gearBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
gearBtn.style.cssText = 'position:fixed;right:18px;top:16px;width:42px;height:42px;padding:0;display:flex;align-items:center;justify-content:center;background:rgba(26,0,38,.62);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:50%;backdrop-filter:blur(12px);cursor:pointer;z-index:21';
document.body.appendChild(gearBtn);
const settingsEl = document.getElementById('panel') as HTMLElement;
glassSelects(settingsEl);                          // frosted purple dropdowns with an orange highlight (the browser's own option list is white on white here)
const toggleSettings = (open?: boolean): void => { settingsEl.style.display = (open ?? settingsEl.style.display !== 'block') ? 'block' : 'none'; };
gearBtn.onclick = () => toggleSettings();
// developer tools, on the local dev server only: draw roads and zones (F2)
if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
  const editBtn = document.createElement('button');
  editBtn.textContent = 'MAP EDIT';
  editBtn.style.cssText = 'position:fixed;right:18px;top:66px;height:34px;padding:0 14px;background:rgba(26,0,38,.62);color:#FF8C00;border:1px solid rgba(255,140,0,.5);border-radius:999px;backdrop-filter:blur(12px);font:700 11px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;z-index:21';
  editBtn.onclick = () => mapEditor?.toggle();
  document.body.appendChild(editBtn);
}
(document.getElementById('shClose') as HTMLElement).onclick = () => toggleSettings(false);
const devBox = document.querySelector('.sh-dev') as HTMLDetailsElement;
hud.style.display = 'none';
devBox.addEventListener('toggle', () => { hud.style.display = devBox.open ? 'block' : 'none'; });
function applyMapOffset(): void {
  if (mapMode) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.07, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// ---------- idle beauty shots: after 10 s with the map menu untouched the camera goes cruising over the region; any input brings the menu back ----------
const cineFade = document.createElement('div');
cineFade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:15;transition:opacity .9s';
document.body.appendChild(cineFade);
let cineOn = false, cineIdx = 0, cineT = 0, cineShots: { from: THREE.Vector3; to: THREE.Vector3; at: THREE.Vector3; dur: number }[] = [];
let lastInput = performance.now();
function buildCineShots(): typeof cineShots {
  const out: typeof cineShots = [];
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const add = (from: THREE.Vector3, to: THREE.Vector3, at: THREE.Vector3, dur = 9): void => { out.push({ from, to, at, dur }); };
  const g = (x: number, z: number): number => meshH(x, z);
  const city = meta.circuits.ironport_grand_circuit, cliff = meta.circuits.great_lakes_cliff_raceway, rally = meta.circuits.pinewood_rally_stage;
  const cc = centroid(city), cl = centroid(cliff), rc = centroid(rally);
  add(V(3900, 240, 520), V(4350, 190, 700), V(5700, 70, 860));                                          // downtown from the river
  add(V(cc.x - 900, 700, cc.z + 1100), V(cc.x - 450, 520, cc.z + 800), V(cc.x, 30, cc.z));            // the city circuit from above
  add(V(2900, g(2900, 3250) + 45, 3250), V(3300, g(3300, 3150) + 70, 3150), V(3800, 46, 2770));      // Halcyon Gateway Bridge
  add(V(5600, g(5600, -3500) + 70, -3500), V(5780, g(5780, -3560) + 80, -3560), V(6280, 46, -3888)); // Northgate Bridge
  add(V(cl.x - 1800, 900, cl.z + 1500), V(cl.x - 1300, 700, cl.z + 1300), V(cl.x, 60, cl.z));          // the cliff raceway
  add(V(rc.x - 1200, 900, rc.z + 1700), V(rc.x - 800, 700, rc.z + 1400), V(rc.x, 20, rc.z));          // the rally stage
  add(V(-6500, 330, 1500), V(-6350, 300, 1150), V(-5400, 40, 500));                                     // dunes and the lake shore
  if (shoreHw) {                                                                                         // the open gallery on the shoreline highway
    const i = Math.floor((shoreHw.gallery.from + shoreHw.gallery.to) / 2), q = shoreHw.xz[i], y = shoreHw.y[i];
    add(V(q[0] - 260, y + 55, q[1] - 260), V(q[0] - 190, y + 40, q[1] - 120), V(q[0], y + 4, q[1] + 60));
  }
  if (countryScenes) for (const k of [0, 2, 3]) { const sh = countryScenes.shots[k]; if (sh) add(V(...sh.cam), V(sh.cam[0] + 8, sh.cam[1] + 3, sh.cam[2] - 8), V(...sh.at), 8); }
  // the reference scenes (docs/apex-elohim/reference-scenes.md) the covered bridge and barn shots above do not already cover: a slow push toward each
  for (const r of REF_SCENES) {
    if (r.n === 1 || r.n === 6) continue;
    const gy = (x: number, z: number): number => (r.rel ? g(x, z) : 0), c = V(r.cam[0], r.cam[1] + gy(r.cam[0], r.cam[2]), r.cam[2]), a = V(r.at[0], r.at[1] + gy(r.at[0], r.at[2]), r.at[2]);
    add(c, c.clone().lerp(a, 0.06), a, 8);
  }
  return out;
}
function startCine(): void {
  if (cineOn) return;
  cineShots = buildCineShots();
  if (!cineShots.length) return;
  cineOn = true; cineT = 0; cineIdx = Math.floor(Math.random() * cineShots.length);
  setMapMode(false);                                                   // the real world, in its golden light, not the map backdrop
  setTimeOfDay('golden'); wx.setWeather('partly', false, true);
  menuEl.style.display = 'block'; backBtn.style.display = 'none';
  (menuEl.querySelector('#mapCardsWrap') as HTMLElement).style.opacity = '0';
  (menuEl.querySelector('#mapCardsWrap') as HTMLElement).style.pointerEvents = 'none';
  controls.autoRotate = false; controls.enabled = false; tween = null;
  labelGroup.visible = false;                                          // no map labels in a beauty shot
}
function endCine(quiet = false): void {                              // quiet: a drive is starting, so don't fall back to the overview
  if (!cineOn) return;
  cineOn = false; cineFade.style.opacity = '0';
  controls.enabled = true; labelGroup.visible = (document.getElementById('tLab') as HTMLInputElement).checked;
  const w = menuEl.querySelector('#mapCardsWrap') as HTMLElement; w.style.opacity = '1'; w.style.pointerEvents = 'auto';
  if (!quiet) preset('overview');
}
function stepCine(dt: number, now: number): void {
  if (!cineOn) {
    if (mapMode && menuEl.style.display === 'block' && briefEl.style.display === 'none' && settingsEl.style.display !== 'block' && !mapEditor?.isOpen() && !driving && now - lastInput > 10000) startCine();
    return;
  }
  const s = cineShots[cineIdx];
  cineT += dt;
  const k = Math.min(1, cineT / s.dur), e = k * k * (3 - 2 * k) * 0.5 + k * 0.5;      // a slow glide, eased only a little
  camera.position.lerpVectors(s.from, s.to, e);
  controls.target.copy(s.at);
  camera.lookAt(s.at);
  cineFade.style.opacity = cineT < 0.9 || cineT > s.dur - 0.9 ? '1' : '0';
  if (cineT >= s.dur) { cineIdx = (cineIdx + 1) % cineShots.length; cineT = 0; }
}
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
  addEventListener(ev, (e) => {
    if (ev === 'pointermove' && Math.abs((e as PointerEvent).movementX) + Math.abs((e as PointerEvent).movementY) < 2) return;
    lastInput = performance.now();
    if (cineOn) endCine();
  }, { passive: true });
}

function setMapMode(on: boolean): void {
  if (mapMode === on) return;
  mapMode = on;
  vignette.style.display = on ? 'block' : 'none';
  menuEl.style.display = on ? 'block' : 'none';
  backBtn.style.display = on ? 'none' : 'block';
  controls.autoRotate = on;
  controls.autoRotateSpeed = 0.35;
  applyMapOffset();
  mapFadeU.value = on ? 1 : 0;
  if (on) playMusic('menu');
  if (terrainMat) { terrainMat.transparent = on; terrainMat.needsUpdate = true; }
  if (on) {
    mapBackdrop = mapBackdrop ?? makeMapBackdrop();
    scene.background = mapBackdrop;
    forestGroup.visible = false; scapeGroup.visible = false;
    scene.fog = new THREE.Fog(0x000000, 1e6, 2e6);          // never null: adding or removing fog recompiles every shader in the scene
    circuitGroup.visible = true;
  } else {
    forestGroup.visible = true; scapeGroup.visible = (document.getElementById('tScape') as HTMLInputElement).checked;
    setTimeOfDay(todKey);
    circuitGroup.visible = (document.getElementById('tCirc') as HTMLInputElement).checked;
  }
}

// ---------- event briefing and countdown ----------
const BRIEFS: Record<string, { view: string; drive: string; tag: string; name: string; color: string; lines: string[]; blurb: string }> = {
  city: { view: 'city', drive: 'ironport_grand_circuit', tag: 'CITY CIRCUIT', name: 'Ironport Grand Circuit', color: '#FF8C00', lines: ['4.2 km  ·  13 corners  ·  clockwise', 'Riverside straight into the RenCen hairpin', 'Climb to the Campus Martius crest, 43 m above the lake'], blurb: 'Walls everywhere, no run-off. Brake late at T1 and keep it clean through the downtown hill.' },
  cliff: { view: 'cliff', drive: 'great_lakes_cliff_raceway', tag: 'ROAD COURSE', name: 'Great Lakes Cliff Raceway', color: '#00DAF3', lines: ['9.8 km  ·  switchback climb  ·  tunnel', 'Starts on the beach, finishes 135 m above the lake', 'Coastal run out of the tunnel with open lake views'], blurb: 'A traditional race course on the western bluff. Hold the line through the climb.' },
  rally: { view: 'rally', drive: 'pinewood_rally_stage', tag: 'RALLY STAGE', name: 'Pinewood Rally Stage', color: '#D40055', lines: ['11 km  ·  gravel and forest trail', 'Service park at Otter Creek', 'Creek ford, lighthouse point and a cut forest trail'], blurb: 'Loose surface through the pines. Short on grip, long on speed.' },
  ind: { view: 'industrial', drive: IND, tag: 'STREET COURSE', name: 'Ironworks Industrial Circuit', color: '#9bb0c8', lines: ['5.3 km  ·  20 turns  ·  clockwise', 'Warehouse district, container port and the harbour hairpin on the river', 'Through the refinery, over the freight yard, under the railway'], blurb: 'Concrete either side the whole way. The bridge over the rail yard and the dive under the railway decide the lap.' },
  harb: { view: 'harbor', drive: HARB, tag: 'STREET COURSE', name: 'Harbor District Street Circuit', color: '#6fb7d8', lines: ['5.4 km  ·  20 turns  ·  clockwise', 'Out along the east pier and back, round the wharf on the quay', 'Container yards, cranes and ships the whole lap'], blurb: 'Two piers and a wharf: the long DRS runs are out over the water. Brake for the pier hairpin before the cranes.' },
  superior: { view: 'superior', drive: 'superior_range_circuit', tag: 'MOUNTAIN CIRCUIT', name: 'Superior Range Circuit', color: '#7FD1FF', lines: ['23 km  ·  one lap  ·  clockwise', 'North along the cliff highway and over the three fjord bridges', 'Back over Glacier Pass: hairpins to 430 m between the glaciers, down through the giant forest'], blurb: 'Fast and open on the coast, tight and steep on the pass. Save the brakes for the descent.' },
  escarpment: { view: 'escarpment', drive: 'escarpment_circuit', tag: 'MOUNTAIN CIRCUIT', name: 'Escarpment Circuit', color: '#FFB86B', lines: ['10.4 km  ·  one lap', 'Over the finger lake head bridge, then up the Stair: six legs and five hairpins on the cliff face', 'East along the crest, a 120 m viaduct over the notch, down the eastern gap to the lake'], blurb: 'Climb hard, then hold your nerve on the skyline. The descent is long, fast and downhill all the way to the lake.' },
  free: { view: 'downtown', drive: 'free', tag: 'FREE ROAM', name: 'Explore the region', color: '#D0BCFF', lines: ['150 km² open region', 'Port Halcyon, the dune coast, the harbor and the freeway', 'Drive anywhere'], blurb: 'Start on the coastal highway and go wherever the roads lead.' },
};
const briefEl = document.createElement('div');
briefEl.style.cssText = 'position:fixed;left:44px;bottom:48px;width:420px;display:none;font-family:Inter,sans-serif;color:#fff;padding:22px 24px;background:rgba(26,0,38,.78);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.55);user-select:none';
document.body.appendChild(briefEl);
const countEl = document.createElement('div');
countEl.style.cssText = 'position:fixed;left:0;right:0;top:30%;text-align:center;font:800 130px Outfit,sans-serif;color:#fff;text-shadow:0 0 50px rgba(212,0,85,.9),0 0 90px rgba(255,140,0,.5);display:none;pointer-events:none;letter-spacing:.04em';
document.body.appendChild(countEl);
function hideBrief(): void { briefEl.style.display = 'none'; }

// ---------- garage and courier cards on the map screen ----------
const walletEl = document.createElement('div');
walletEl.style.cssText = 'margin:16px 0 0;width:330px;padding:8px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(26,0,38,.55);font:600 12px Outfit,sans-serif;letter-spacing:.06em;color:#D0BCFF;display:flex;gap:12px;align-items:center';
(menuEl.querySelector('#menuTitle') as HTMLElement).appendChild(walletEl);
function refreshWallet(): void {
  const lp = garage.levelProgress(), a = garage.active;
  walletEl.innerHTML = `<span style="color:#FF8C00">LV ${lp.level}</span><span style="flex:1;height:5px;border-radius:9px;background:rgba(255,255,255,.12);overflow:hidden"><i style="display:block;height:100%;width:${Math.round(lp.frac * 100)}%;background:linear-gradient(90deg,#D40055,#FF8C00)"></i></span><span style="color:#ffd166;font-family:'JetBrains Mono',monospace">${garage.credits.toLocaleString()} cr</span>`
    + `<span style="width:100%;flex-basis:100%;font:500 11px Inter,sans-serif;color:rgba(255,255,255,.6)">${a ? `Driving: ${garage.def(a.uid)!.make} ${esc(a.nickname ?? garage.def(a.uid)!.name)}` : 'No car yet: pick your first car in the garage'}</span>`;
  walletEl.style.flexWrap = 'wrap';
  const cl = { idle: '', syncing: 'saving…', synced: 'saved to Plajah', offline: 'saved on this device', conflict: 'merging…', error: 'cloud save failed' }[cloud.status];
  if (cl) walletEl.insertAdjacentHTML('beforeend', `<span style="width:100%;flex-basis:100%;font:500 10px Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.45)">${cl}</span>`);
}
const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
refreshWallet(); garage.subscribe(refreshWallet); cloud.onStatus = refreshWallet;
/** a card on the map screen; returns its subtitle line, for cards that keep it current */
function addMenuCard(tag: string, name: string, sub: string, color: string, act: () => void): HTMLElement {
  const b = document.createElement('div');
  b.style.cssText = 'flex:0 0 288px;scroll-snap-align:center;padding:14px 18px;border-radius:24px;border:1px solid rgba(255,255,255,.10);background:rgba(26,0,38,.62);backdrop-filter:blur(14px);cursor:pointer;transition:transform .2s cubic-bezier(.2,0,0,1),border-color .2s,box-shadow .2s;box-shadow:0 10px 30px rgba(0,0,0,.35)';
  b.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color}"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:${color}">${tag}</span></div><div style="font:600 19px Outfit,sans-serif;margin:5px 0 3px">${name}</div><div style="font:400 12px Inter,sans-serif;color:rgba(255,255,255,.62)">${sub}</div>`;
  b.onmouseenter = () => { b.style.transform = 'translateY(-8px)'; b.style.borderColor = color; b.style.boxShadow = `0 10px 34px rgba(0,0,0,.45),0 0 22px ${color}55`; };
  b.onmouseleave = () => { b.style.transform = ''; b.style.borderColor = 'rgba(255,255,255,.10)'; b.style.boxShadow = '0 10px 30px rgba(0,0,0,.35)'; };
  b.onclick = act;
  (menuEl.querySelector('#mapCards') as HTMLElement).appendChild(b);
  return b.lastElementChild as HTMLElement;
}
function openCourierBrief(): void {
  preset('downtown', true);
  const lvl = garage.level;
  briefEl.style.borderColor = '#00f5d488';
  briefEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#00f5d4;box-shadow:0 0 10px #00f5d4"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:#00f5d4">COURIER MODE</span></div>
    <div style="font:800 26px Outfit,sans-serif;margin:4px 0 6px">Delivery shift</div>
    <div style="font:400 12px Inter,sans-serif;color:rgba(255,255,255,.7);margin-bottom:12px">Passengers, food and packages appear around the map. Drive into a beam and slow down to pick up, then reach the drop before its timer runs out. Every on-time drop adds time to your shift and builds a chain multiplier. Carry several orders at once and plan the route.</div>
    ${TIER_LIST.map((t) => { const ok = lvl >= t.level; return `<button class="ct" data-t="${t.id}" ${ok ? '' : 'disabled'} style="display:block;width:100%;text-align:left;margin:6px 0;padding:10px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;cursor:${ok ? 'pointer' : 'not-allowed'};opacity:${ok ? 1 : 0.5}"><b style="font:700 14px Outfit,sans-serif">${t.name}</b> <span style="font:500 11px Inter,sans-serif;color:#D0BCFF">${ok ? `${Math.floor(t.shiftSec / 60)} min · carry ${t.capacity} · fares ×${t.fareMult}` : `unlocks at level ${t.level}`}</span><div style="font:400 11px Inter,sans-serif;color:rgba(255,255,255,.6)">${t.blurb}</div></button>`; }).join('')}
    <button id="briefBack" style="margin-top:8px;height:42px;padding:0 24px;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;font:600 12px Outfit,sans-serif;letter-spacing:.18em;cursor:pointer">BACK</button>`;
  briefEl.style.display = 'block';
  briefEl.querySelectorAll<HTMLButtonElement>('.ct').forEach((b) => { b.onclick = () => { hideBrief(); startDrive('free', b.dataset.t as 'rookie' | 'pro' | 'legend'); }; });
  (document.getElementById('briefBack') as HTMLElement).onclick = () => preset('overview');
}
function openPursuitBrief(): void {
  preset('downtown', true);
  briefEl.style.borderColor = '#4d8dff88';
  const opt = (role: string, title: string, sub: string): string => `<button class="pr" data-r="${role}" style="display:block;width:100%;text-align:left;margin:6px 0;padding:10px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;cursor:pointer"><div style="font:700 14px Outfit,sans-serif">${title}</div><div style="font:400 11px Inter,sans-serif;color:rgba(255,255,255,.65)">${sub}</div></button>`;
  briefEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#4d8dff;box-shadow:0 0 10px #4d8dff"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:#4d8dff">PURSUIT MODE</span></div>
    <div style="font:800 26px Outfit,sans-serif;margin:4px 0 6px">Cops &amp; Robbers</div>
    <div style="font:400 12px Inter,sans-serif;color:rgba(255,255,255,.7);margin-bottom:12px">Pull off the bank job and lose the police at a hideout, or take the APB and run the getaway car down.</div>
    ${opt('robber', 'Be the robber', 'Heist intro · getaway car · reach a hideout')}${opt('cop', 'Be the cop', 'Dispatch APB · backup cruisers · chase on foot if they bail')}${opt('auto', 'Random role', 'The game picks your side')}
    <button id="briefBack" style="margin-top:8px;height:42px;padding:0 24px;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;font:600 12px Outfit,sans-serif;letter-spacing:.18em;cursor:pointer">BACK</button>`;
  briefEl.style.display = 'block';
  briefEl.querySelectorAll<HTMLButtonElement>('.pr').forEach((b) => { b.onclick = () => { hideBrief(); startDrive('free', undefined, b.dataset.r as PursuitRoleChoice); }; });
  (document.getElementById('briefBack') as HTMLElement).onclick = () => preset('overview');
}
addMenuCard('PURSUIT MODE', 'Cops & Robbers', 'Heist getaway or police chase · pick your side', '#4d8dff', openPursuitBrief);
addMenuCard('COURIER MODE', 'Delivery shift','Passengers · food · packages · beat the clock, chain the drops', '#00f5d4', openCourierBrief);
addMenuCard('GARAGE', 'Cars, parts and tuning', 'Showroom · upgrades · tuning · objectives', '#ffd166', () => { location.href = 'showroom.html'; });
function openBrief(id: string): void {
  const b = BRIEFS[id];
  if (wxOverride === 'auto') wx.setWeather(worstOf(WEATHER_PLAN[id]), false, true);      // the map shows the race's worst weather as the forecast
  preset(b.view, true);       // stays on the map screen: dark backdrop, faded edges, no sky
  const cc = id === 'free' ? new THREE.Vector3(-4600, 0, 1800) : centroid(meta.circuits[b.drive]);
  const hh = id === 'city' ? 1500 : id === 'ind' || id === 'harb' ? 1300 : id === 'cliff' ? 5200 : id === 'rally' ? 6200 : id === 'superior' ? 9000 : id === 'escarpment' ? 5200 : 6800;
  look(new THREE.Vector3(cc.x - hh * 0.3, hh, cc.z + hh * 0.62), cc);   // steep, so no horizon shows
  briefEl.style.borderColor = b.color + '88';
  briefEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${b.color};box-shadow:0 0 10px ${b.color}"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:${b.color}">${b.tag}</span></div>
    <div style="font:800 26px Outfit,sans-serif;margin:4px 0 12px">${b.name}</div>
    ${b.lines.map((l) => `<div style="font:400 13px Inter,sans-serif;color:rgba(255,255,255,.78);margin:4px 0">${l}</div>`).join('')}
    <div style="font:400 12px Inter,sans-serif;color:rgba(208,188,255,.8);margin:14px 0 18px">${b.blurb}</div>
    <div style="display:flex;gap:10px"><button id="briefGo" style="height:50px;padding:0 32px;background:#FF8C00;color:#14001c;border:0;border-radius:999px;font:800 14px Outfit,sans-serif;letter-spacing:.2em;cursor:pointer;box-shadow:0 0 24px rgba(255,140,0,.45)">START</button>
    <button id="briefBack" style="height:50px;padding:0 24px;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;font:600 12px Outfit,sans-serif;letter-spacing:.18em;cursor:pointer">BACK</button></div>`;
  briefEl.style.display = 'block';
  (document.getElementById('briefGo') as HTMLElement).onclick = () => { hideBrief(); startDrive(b.drive); };
  (document.getElementById('briefBack') as HTMLElement).onclick = () => { if (wxOverride === 'auto') wx.setWeather('partly', false, true); preset('overview'); };
}

// ---------- camera presets ----------
function centroid(c: CircuitDef): THREE.Vector3 {
  let x = 0, z = 0;
  for (const p of c.xz) { x += p[0]; z += p[1]; }
  return new THREE.Vector3(x / c.xz.length, 0, z / c.xz.length);
}
let tween: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; t: number; dur: number } | null = null;
let tweenOn = false;
function look(pos: THREE.Vector3, target: THREE.Vector3): void {
  if (tweenOn) {
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur: 1.5 };
    return;
  }
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.update();
}
function stepTween(dt: number): void {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = tween.t, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(tween.p0, tween.p1, e);
  controls.target.lerpVectors(tween.t0, tween.t1, e);
  controls.update();
  if (tween.t >= 1) tween = null;
}
function preset(name: string, keepMap = false): void {
  hideBrief();
  stopFly();
  stopDrive();
  setMapMode(name === 'overview' || keepMap);
  menuEl.style.display = name === 'overview' ? 'block' : 'none';
  controls.autoRotate = name === 'overview';
  const city = meta.circuits.ironport_grand_circuit, rally = meta.circuits.pinewood_rally_stage, cliff = meta.circuits.great_lakes_cliff_raceway;
  if (name === 'overview') look(new THREE.Vector3(-900, 4900, 4500), new THREE.Vector3(1300, 0, 150));
  if (name === 'city') { const c = centroid(city); look(new THREE.Vector3(c.x - 700, 2600, c.z + 2300), new THREE.Vector3(c.x, 20, c.z)); }
  if (name === 'rally') { const c = centroid(rally); look(new THREE.Vector3(c.x - 1500, 4200, c.z + 5200), new THREE.Vector3(c.x, 0, c.z)); }
  if (name === 'cliff') { const c = centroid(cliff); look(new THREE.Vector3(c.x - 3600, 2800, c.z + 3200), new THREE.Vector3(c.x + 300, cliff.y ? 60 : 0, c.z)); }
  if (name === 'tunnel' && cliff.tunnel && cliff.y) {
    const k = cliff.tunnel.to, p = cliff.xz[k];
    look(new THREE.Vector3(p[0] + 450, cliff.y[k] * exag + 190, p[1] + 320), new THREE.Vector3(p[0] - 1500, cliff.y[k] * exag - 120, p[1] - 500));
  }
  if (name === 'downtown') { const c = centroid(city); look(new THREE.Vector3(c.x - 1500, 420, c.z + 1500), new THREE.Vector3(c.x + 100, 60, c.z - 100)); }
  if (name === 'street' && city.y) { const k = 20, p = city.xz[k], q = city.xz[k + 4]; look(new THREE.Vector3(p[0], city.y[k] + 9, p[1]), new THREE.Vector3(q[0], city.y[k] + 25, q[1])); }
  if (name === 'harbor' && harbor) { const t = harbor.terminals[0]; look(new THREE.Vector3(t.c[0] - 700, 260, t.c[1] - 500), new THREE.Vector3(t.c[0], 8, t.c[1] + 120)); }
  if (name === 'harbor' && meta.circuits[HARB]) { const c = centroid(meta.circuits[HARB]); look(new THREE.Vector3(c.x - 700, 1000, c.z + 900), new THREE.Vector3(c.x, 10, c.z)); }
  if (name === 'industrial' && meta.circuits[IND]) { const c = centroid(meta.circuits[IND]); look(new THREE.Vector3(c.x - 600, 900, c.z + 900), new THREE.Vector3(c.x, 10, c.z)); }
  if (name === 'superior' && meta.circuits.superior_range_circuit) { const c = centroid(meta.circuits.superior_range_circuit); look(new THREE.Vector3(c.x + 4200, 3600, c.z + 5200), new THREE.Vector3(c.x - 200, 200, c.z)); }
  if (name === 'escarpment' && meta.circuits.escarpment_circuit) { const c = centroid(meta.circuits.escarpment_circuit); look(new THREE.Vector3(c.x + 1800, 1500, c.z + 2600), new THREE.Vector3(c.x, 180, c.z - 300)); }
  if (name === 'dunes') look(new THREE.Vector3(-6500, 1500, 1500), new THREE.Vector3(-5200, 10, 400));
}

// ---------- fly lap ----------
let fly: { c: CircuitDef; t: number } | null = null;
function startFly(id: string): void {
  fly = { c: meta.circuits[id], t: 0 };
  controls.enabled = false;
}
function stopFly(): void {
  fly = null;
  controls.enabled = true;
}
function stepFly(dt: number): void {
  if (!fly) return;
  const c = fly.c, n = c.xz.length;
  const speed = 4.5; // samples per second (~12 m spacing * 3 -> about 140 km/h at 36 m/sample)
  fly.t = (fly.t + dt * speed) % n;
  const i = Math.floor(fly.t), f = fly.t - i;
  const at = (k: number): THREE.Vector3 => {
    const a = c.xz[k % n], b = c.xz[(k + 1) % n];
    const ya = c.y ? c.y[k % n] : hAt(a[0], a[1]), yb = c.y ? c.y[(k + 1) % n] : hAt(b[0], b[1]);
    return new THREE.Vector3(a[0] + (b[0] - a[0]) * f, (ya + (yb - ya) * f) * exag, a[1] + (b[1] - a[1]) * f);
  };
  const p = at(i), q = at(i + 9);
  camera.position.set(p.x, p.y + 6, p.z);
  camera.lookAt(q.x, q.y + 3, q.z);
}

// ---------- city circuit furniture: barriers, kerbs, gantry, pit lane, sectors, corner names ----------
let trackKit: TrackKit | null = null;
let goClock = 99;
const furnitureGroup = new THREE.Group();
scene.add(furnitureGroup);
let cityRoadMat: THREE.Material | null = null;                  // the city circuit's asphalt (lane markings, wet-road shading), shared with the cliff raceway
let cityPath: { x: number; y: number; z: number }[] = [];       // dense path (about 6 m) for timing and barriers
function densify(c: CircuitDef, step: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const n = c.xz.length;
  for (let i = 0; i < n; i++) {
    const a = c.xz[i], b = c.xz[(i + 1) % n];
    const ya = c.y ? c.y[i] : hAt(a[0], a[1]), yb = c.y ? c.y[(i + 1) % n] : hAt(b[0], b[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({ x: a[0] + (b[0] - a[0]) * t, y: ya + (yb - ya) * t, z: a[1] + (b[1] - a[1]) * t });
    }
  }
  return out;
}
function buildFurniture(): void {
  furnitureGroup.clear();
  const c = meta.circuits.ironport_grand_circuit;
  if (!c) return;
  // the route starts at a corner; the start line sits 90 m down the Riverside straight so cars leave the grid on a straight
  // the circuit's own points are 22 m apart with a sharp vertex at every corner; round the corners and space the points evenly, so the road, barriers, kerbs and racing line have a curve to follow
  const sm = smoothClosedPath(c.xz, c.y, 12, 6);
  let P = densify({ ...c, xz: sm.xz, y: c.y ? sm.y : undefined } as CircuitDef, 6);
  P = [...P.slice(15), ...P.slice(0, 15)];
  cityPath = P;
  const n = P.length;
  const HALF = 5.5;
  const tan = (i: number): [number, number] => {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  // concrete jersey barriers from the asset sheet (grey, hazard-stripe and worn red/white), 3.05 m long
  const jProf: number[][] = [[-0.30, 0], [0.30, 0], [0.30, 0.075], [0.255, 0.33], [0.125, 0.81], [-0.125, 0.81], [-0.255, 0.33], [-0.30, 0.075]];
  const jGeo = (() => {
    const L = 3.05, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const n = jProf.length;
    let tot = 0; const cum = [0];
    for (let i = 0; i < n; i++) { const a = jProf[i], b = jProf[(i + 1) % n]; tot += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(tot); }
    for (let r = 0; r < 2; r++) for (let i = 0; i <= n; i++) { const p = jProf[i % n]; pos.push(p[0], p[1], (r - 0.5) * L); uv.push(r, cum[i] / tot); }
    for (let i = 0; i < n; i++) { const a = i, b = i + 1, c = a + n + 1, d = b + n + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const jMat = (k: string): THREE.MeshStandardMaterial => { const t = gameTex(k, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }); };
  const variants = [['barrier_grey', 0], ['barrier_hazard', 0], ['barrier_red', 0]] as [string, number][];
  const slots: THREE.Matrix4[][] = [[], [], []];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  // barriers are laid end to end along the offset edge of the road by arc length, each turned to the edge's own direction: round a corner they follow the curve with no
  // gaps on the outside and no overlap or fanning on the inside (the old version placed them along the centre line's tangent at fixed samples)
  const BL = 3.05;
  for (const side of [-1, 1]) {
    const off = HALF + 1.4;
    const edge: [number, number][] = [];
    for (let i = 0; i < n; i++) { const [tx, tz] = tan(i); edge.push([P[i].x - tz * off * side, P[i].z + tx * off * side]); }
    let travelled = 0, next = BL / 2, count = 0;
    for (let i = 0; i < n; i++) {
      const a = edge[i], b = edge[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      const ux = dx / L, uz = dz / L, [tx, tz] = tan(i);
      const folded = ux * tx + uz * tz < 0.3;                                 // the inside edge of a tight corner folds back on itself: nothing stands there
      while (next <= travelled + L) {
        if (!folded) {
          const s = next - travelled, x = a[0] + ux * s, z = a[1] + uz * s, y = hAt(x, z) * exag;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(ux, uz));
          m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
          slots[(count % 9 === 4 && side > 0) ? 2 : (count % 13 === 6 && side < 0) ? 1 : 0].push(m4.clone());
          count++;
        }
        next += BL;
      }
      travelled += L;
    }
  }
  variants.forEach(([k], vi) => {
    const im = new THREE.InstancedMesh(jGeo, jMat(k), Math.max(slots[vi].length, 1));
    slots[vi].forEach((mm, i) => im.setMatrixAt(i, mm));
    im.count = slots[vi].length;
    im.frustumCulled = false;
    im.castShadow = true;
    furnitureGroup.add(im);
  });
  // kerbs on the inside of each corner (reference kerb texture)
  const corners = c.corners ?? [];
  const kAcc: Acc = { pos: [], idx: [], uv: [] };
  for (const cn of corners) {
    let bi2 = 0, best = 1e9;
    for (let i = 0; i < n; i++) { const d = Math.hypot(P[i].x - cn.x, P[i].z - cn.z); if (d < best) { best = d; bi2 = i; } }
    const inside = cn.turn > 0 ? 1 : -1;
    const kp: number[][] = [];
    for (let k = -8; k <= 8; k++) {
      const i = (bi2 + k + n) % n;
      const [tx, tz] = tan(i);
      kp.push([P[i].x + -tz * (HALF - 0.6) * inside, P[i].z + tx * (HALF - 0.6) * inside]);
    }
    addRibbonUV(kAcc, kp, 1.9, RIBBON_LIFT + 0.02, 3.4);      // painted flush with the road: a 50 cm kerb was a ramp the car climbed and rolled on
  }
  { const km = accMeshTex(kAcc, gameTex('kerb'), 0.8, -5); furnitureGroup.add(km); driveSurfaces.push(km); }
  // racing surface over the street, the reference asphalt with its lane marks
  const roadAcc: Acc = { pos: [], idx: [], uv: [] };
  addRibbonUV(roadAcc, P.map((p) => [p.x, p.z]), 11, RIBBON_LIFT, 6.2);
  { const rm = accMeshTex(roadAcc, gameTex('asphalt_highway'), 0.8, -3); furnitureGroup.add(rm); driveSurfaces.push(rm); cityRoadMat = rm.material as THREE.Material; }
  // start and finish gantry with a chequered line
  const [gx, gz] = tan(0);
  const g0 = P[0];
  const gy = hAt(g0.x, g0.z) * exag;
  const gantry = new THREE.Group();
  box(1.4, 8.5, 1.4, 0x2a2f38, -(HALF + 2.5), 4.25, 0, gantry);
  box(1.4, 8.5, 1.4, 0x2a2f38, HALF + 2.5, 4.25, 0, gantry);
  box(2 * (HALF + 3.2), 1.6, 1.6, 0x2a2f38, 0, 8.7, 0, gantry);
  const banner = box(2 * HALF, 1.3, 0.3, 0xffffff, 0, 8.7, 0.9, gantry);
  (banner.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xffd27a);
  (banner.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
  gantry.position.set(g0.x, gy, g0.z);
  gantry.rotation.y = Math.atan2(gx, gz);
  furnitureGroup.add(gantry);
  const chk = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.02, 1.1), stdMat(0xffffff, 0.6), 2 * Math.floor(2 * HALF / 1.1));
  let ci = 0;
  for (let a = 0; a < Math.floor(2 * HALF / 1.1); a++) for (let b = 0; b < 2; b++) {
    const lx = (a - Math.floor(HALF / 1.1)) * 1.1, lz = b * 1.1;
    const x = g0.x + (-gz) * lx + gx * lz, z = g0.z + gx * lx + gz * lz;
    m4.makeTranslation(x, hAt(x, z) * exag + RIBBON_LIFT + 0.012, z);
    chk.setMatrixAt(ci, m4);
    chk.setColorAt(ci, col.setHex((a + b) & 1 ? 0x101010 : 0xf2f2f2));
    ci++;
  }
  chk.count = ci;
  chk.rotation.set(0, 0, 0);
  furnitureGroup.add(chk);
  // pit lane: a parallel service lane after the line
  const pit: number[][] = [];
  for (let i = 0; i < 42; i++) { const [tx, tz] = tan(i); pit.push([P[i].x + tz * 15.5, P[i].z - tx * 15.5]); }
  const pitAcc: Acc = { pos: [], idx: [], uv: [] };
  addRibbonUV(pitAcc, pit, 8, 0.33, 5);
  furnitureGroup.add(accMeshTex(pitAcc, gameTex('pit'), 0.9, -3));
  trackKit = new TrackKit({ P, corners: corners as { x: number; z: number; turn: number }[], ground: (x, z) => hAt(x, z) * exag, HALF, pitFrom: 0, pitTo: 41, gantryAt: 0 });
  mergeByMaterial(trackKit.group, 600);
  furnitureGroup.add(trackKit.group);
  const gridQuad = new THREE.Mesh(new THREE.PlaneGeometry(26, 10.5), new THREE.MeshStandardMaterial({ map: gameTex('grid', false), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  gridQuad.rotation.order = 'YXZ';
  gridQuad.rotation.x = -Math.PI / 2;
  gridQuad.rotation.y = -Math.atan2(gz, gx);
  gridQuad.position.set(g0.x - gx * 15, hAt(g0.x - gx * 15, g0.z - gz * 15) * exag + RIBBON_LIFT + 0.012, g0.z - gz * 15);      // on the road surface: 40 cm up it buried the car
  furnitureGroup.add(gridQuad);
  furnitureGroup.add(ribbon(pit, null, 0.4, 0xf2f2f2, 0.42));
  // sector markers at one third and two thirds of the lap
  [[Math.floor(n / 3), 0x2e7bd6, 'SECTOR 2'], [Math.floor(2 * n / 3), 0xa44cd6, 'SECTOR 3']].forEach(([idx, color, text]) => {
    const p = P[idx as number], [tx, tz] = tan(idx as number);
    const arch = new THREE.Group();
    box(0.8, 6, 0.8, color as number, -(HALF + 1.8), 3, 0, arch);
    box(0.8, 6, 0.8, color as number, HALF + 1.8, 3, 0, arch);
    box(2 * (HALF + 1.8), 0.8, 0.8, color as number, 0, 6, 0, arch);
    arch.position.set(p.x, hAt(p.x, p.z) * exag, p.z);
    arch.rotation.y = Math.atan2(tx, tz);
    furnitureGroup.add(arch);
    furnitureGroup.add(label(text as string, p.x, hAt(p.x, p.z) * exag + 22, p.z, '#' + (color as number).toString(16).padStart(6, '0'), 0.5));
  });
  // corner names
  for (const cn of corners) {
    furnitureGroup.add(label(`T${(cn as any).n ?? ''} ${cn.name}`, cn.x, hAt(cn.x, cn.z) * exag + 34, cn.z, '#ffd9a0', 0.5));
  }

  // Other two race circuits: Pinewood Rally Stage & Great Lakes Cliff Raceway
  const rallyCircuit = meta.circuits.pinewood_rally_stage;
  if (rallyCircuit) {
    rallyNear = makeCorridor(densify(rallyCircuit, 6));
    const builtRally = buildPinewoodRallyCircuit({
      circuit: rallyCircuit,
      ground: (x, z) => hAt(x, z) * exag,
      exag,
    });
    furnitureGroup.add(builtRally.group);
  }
  const cliffCircuit = meta.circuits.great_lakes_cliff_raceway;
  if (cliffCircuit && cliffDesign) {
    // the road is laid on the terrain mesh that is drawn (hAt is a smoother surface and let the grass through), in the same asphalt as the city circuit, and the car rides on it
    const builtCliff = buildCliffRacewayCircuit({
      circuit: cliffCircuit,
      ground: (x, z) => meshH(x, z),
      exag,
      roadMaterial: cityRoadMat ?? undefined,
      design: cliffDesign!,
    });
    furnitureGroup.add(builtCliff.group);
    driveSurfaces.push(builtCliff.road);
    surfGrid = null;
    cliffNear = makeCorridor(builtCliff.path);
    cliffPathPts = builtCliff.path;
    cliffTunnelNear = builtCliff.tunnelPath.length ? makeCorridor(builtCliff.tunnelPath) : null;
  }

  // countryside set pieces for the reference shots: creek, covered bridge, paved and dirt lanes, barn
  {
    if (countryScenes) { furnitureGroup.remove(countryScenes.group); for (const r of countryScenes.roads) { const i = driveSurfaces.indexOf(r); if (i >= 0) driveSurfaces.splice(i, 1); } }
    // no country road runs onto a tarmac circuit: each is cut where it would enter one (the circuit's barriers end it); the rally stage and the scenic circuits keep their junctions
    const netOff = countryNet ? { ...countryNet, roads: countryNet.roads.flatMap((r) => {
      const pieces: number[][][] = []; let cur: number[][] = [];
      if (!r.xz.some((p) => onCourse(p[0], p[1], 40, TARMAC_CIRCUITS))) return [r];                // far from every tarmac circuit: as it is
      const dense: number[][] = [];
      r.xz.forEach((p, i) => { if (i) { const q = r.xz[i - 1], L = Math.hypot(p[0] - q[0], p[1] - q[1]), k = Math.max(1, Math.ceil(L / 3)); for (let j = 1; j < k; j++) dense.push([q[0] + (p[0] - q[0]) * j / k, q[1] + (p[1] - q[1]) * j / k]); } dense.push(p); });
      if (!dense.some((p) => onCourse(p[0], p[1], 1, TARMAC_CIRCUITS))) return [r];
      for (const p of dense) { if (onCourse(p[0], p[1], 1, TARMAC_CIRCUITS)) { if (cur.length > 1) pieces.push(cur); cur = []; } else cur.push(p); }
      if (cur.length > 1) pieces.push(cur);
      return pieces.map((xz) => ({ ...r, xz }));
    }) } : undefined;
    countryScenes = buildCountryScenes({ ground: (x, z) => meshH(x, z), roadMaterial: cityRoadMat ?? undefined, network: netOff, shoreline: shoreHw ?? undefined });
    furnitureGroup.add(countryScenes.group);
    driveSurfaces.push(...countryScenes.roads);
    surfGrid = null;
    (window as any).countryShots = countryScenes.shots;
  }

  if (meta.circuits[IND]) {
    const ic = buildIndustrialCircuit({ path: meta.circuits[IND].xz.map((q) => ({ x: q[0], z: q[1] })), ground: (x, z) => meshH(x, z), roadMaterial: cityRoadMat ?? undefined, ys: industrialYs, grade: industrialGrade });
    furnitureGroup.add(ic.group);
    driveSurfaces.push(ic.road);
    surfGrid = null;
    industrialPath = ic.path;
    indNear = makeCorridor(ic.path);
    // the districts round it from the library pieces (src/ironworksDistrict.ts). The course counts as open ground where its road is up on the bridge (the
    // rail yard runs on underneath); the Port Branch near the bridge sets the yard's line
    if (industrialRaw && industrialYs) {
      const ys = industrialYs, P = ic.path;
      const elevated = (x: number, z: number): boolean => { let k = 0, bd = 1e18; for (let i = 0; i < P.length; i += 2) { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < bd) { bd = d; k = i; } } return bd < 30 * 30 && ys[k] - hAt(P[k].x, P[k].z) > 6; };
      const bridge = industrialGrade.find((g) => g.kind === 'bridge');
      const pb = userMap?.features.find((f) => f.type === 'rail' && /port branch/i.test(f.name ?? ''));
      let rail: { x: number; z: number; dx: number; dz: number } | undefined;
      if (bridge && pb) {
        let bi = 0, bd = 1e18; pb.pts.forEach((q, i) => { const d = (q[0] - bridge.at[0]) ** 2 + (q[1] - bridge.at[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
        const a = pb.pts[Math.max(0, bi - 1)], b = pb.pts[Math.min(pb.pts.length - 1, bi + 1)];
        rail = { x: bridge.at[0], z: bridge.at[1], dx: b[0] - a[0], dz: b[1] - a[1] };
      }
      const d = buildIronworksDistrict({
        route: industrialRaw.xz, sectors: industrialRaw.sectors, ground: (x, z) => meshH(x, z), water: (x, z) => hAt(x, z) < 2.5, rail,
        blocked: (x, z, r) => (onCourse(x, z, r) && !elevated(x, z)) || paintedRoad(x, z, r) || insideBuilding(x, z, r),
      });
      mergeByMaterial(d.group, 400);
      furnitureGroup.add(d.group);
      console.log('ironworks district', JSON.stringify(d.counts));
    }
  }
  if (meta.circuits[HARB]) {
    const hc = buildIndustrialCircuit({ path: meta.circuits[HARB].xz.map((q) => ({ x: q[0], z: q[1] })), ground: (x, z) => meshH(x, z), roadMaterial: cityRoadMat ?? undefined, ys: harborYs });
    hc.group.name = 'harbor-circuit';
    furnitureGroup.add(hc.group);
    driveSurfaces.push(hc.road);
    surfGrid = null;
    harborPath = hc.path;
    harborNear = makeCorridor(hc.path);
    if (harborRaw) {
      const d = buildIronworksDistrict({ route: harborRaw.xz, sectors: harborRaw.sectors, ground: (x, z) => meshH(x, z), water: (x, z) => hAt(x, z) < 2.5, blocked: (x, z, r) => onCourse(x, z, r) || paintedRoad(x, z, r) || insideBuilding(x, z, r) });
      d.group.name = 'harbor-district'; mergeByMaterial(d.group, 400); furnitureGroup.add(d.group);
      console.log('harbor district', JSON.stringify(d.counts));
    }
  }

  if (simPlan && (simPlan.net || simPlan.L || simPlan.data.zones.length)) {
    // no signal pole or stop sign on a painted street or inside the city circuit's barriers (they stand 1.4 m past its 5.5 m half width)
    const gcx = meta.circuits.ironport_grand_circuit as { xz?: number[][]; y?: number[] } | undefined;
    const inCircuit = gcx?.xz ? makeCorridor(smoothClosedPath(gcx.xz, gcx.y, 12, 6).xz.map((p) => ({ x: p[0], z: p[1] }))) : null;
    simLayer = new SimLayer(simPlan, { ground: (x, z) => meshH(x, z), carGround: (x, z) => groundH(x, z), water: (x, z) => hAt(x, z) < 2.5, keepOut: (x, z) => paintedRoad(x, z, 0.5) || !!inCircuit?.(x, z, 7.6) });
    furnitureGroup.add(simLayer.group);
    driveSurfaces.push(...simLayer.surfaces);
    surfGrid = null;
  }
  if (utilData) {
    // a pylon standing on a race course walks along its line (toward a neighbour) to the nearest clear spot, so the wires still run pylon to pylon
    let moved = 0;
    utilData.pylons.forEach((py, i) => {
      if (!onCourse(py.x, py.z, 9)) return;
      const nb = utilData!.spans.filter((sp) => sp[0] === i || sp[1] === i).map((sp) => utilData!.pylons[sp[0] === i ? sp[1] : sp[0]]);
      let best: [number, number] | null = null, bd = 1e9;
      for (const q of nb) { const L = Math.hypot(q.x - py.x, q.z - py.z) || 1, ux = (q.x - py.x) / L, uz = (q.z - py.z) / L; for (let d = 3; d < Math.min(60, L * 0.45); d += 3) { const x = py.x + ux * d, z = py.z + uz * d; if (!onCourse(x, z, 9)) { if (d < bd) { bd = d; best = [x, z]; } break; } } }
      // a line running alongside the course never clears it: step sideways (square to the line) instead, the nearer way
      if (!best) for (const q of nb.slice(0, 1)) { const L = Math.hypot(q.x - py.x, q.z - py.z) || 1, sx = -(q.z - py.z) / L, sz = (q.x - py.x) / L; for (let d = 3; d <= 36 && !best; d += 3) for (const sg of [1, -1]) { const x = py.x + sx * d * sg, z = py.z + sz * d * sg; if (!onCourse(x, z, 9)) { best = [x, z]; break; } } }
      if (best) { py.x = best[0]; py.z = best[1]; moved++; }
    });
    if (moved) console.log('pylons moved off the race courses', moved);
  }
  if (utilData) { const ug = buildUtilities(utilData, (x, z) => meshH(x, z)).group; const mb = mergeByMaterial(ug, 600); console.log('utilities meshes', mb.before, '->', mb.after); furnitureGroup.add(ug); }   // pylons and yards: one draw per material per 600 m cell
  if (parkingData && parkingData.length) { parkingLots = buildParkingLots(parkingData, (x, z) => meshH(x, z)); furnitureGroup.add(parkingLots.group); }
  if (portData) {
    const wy = waterMesh ? waterMesh.position.y : 0;
    // nothing of the port stands on a race course (the new Ironworks runs across the old port yards): a container block, crane, tank or the flare on the
    // course is left out, and the pipe rack and the plant fence go if any part of them would cross it
    const pd = portData, onC = (x: number, z: number, r: number): boolean => onCourse(x, z, r);
    const blockOn = (b: number[]): boolean => { const x1 = b[0] + b[2] * 12.6, z0b = b[1] - 1.3, z1 = b[1] + b[3] * 2.6; for (let x = b[0]; x <= x1; x += 6) for (let z = z0b; z <= z1; z += 6) if (onC(x, z, 2)) return true; return onC(x1, z1, 2); };
    const portOff: PortData = { ...pd, cranes: pd.cranes.filter((c) => !onC(c.x, c.z, 16)), containers: pd.containers.filter((b) => !blockOn(b)), tanks: pd.tanks.filter((t) => !onC(t.x, t.z, t.r + 3)),
      pipeRack: pd.pipeRack.some((q) => onC(q[0], q[1], 4)) ? [] : pd.pipeRack, flare: pd.flare.length >= 2 && onC(pd.flare[0], pd.flare[1], 8) ? [] : pd.flare,
      fence: pd.fence.some((q, i) => { const r = pd.fence[(i + 1) % pd.fence.length]; for (let t = 0; t <= 1; t += 0.1) if (onC(q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t, 1)) return true; return false; }) ? [] : pd.fence };
    furnitureGroup.add(buildPortDistrict(portOff, { waterY: wy }).group);
  }

  // Rural Horizon open-world architecture & Festival Outpost
  const ruralGroup = buildRuralOpenWorldDetail({
    ground: (x, z) => hAt(x, z) * exag,
    clearCheck: (x, z) => surfaceAtXZ(x, z) === 'grass' && !insideBuilding(x, z, 28),
  });
  furnitureGroup.add(ruralGroup);

  // Suburbs, Industrial Zone, Coastline & Cross-River City District
  const cityExpGroup = buildCityExpansion({
    ground: (x, z) => hAt(x, z) * exag,
    clearCheck: (x, z) => !insideBuilding(x, z, 24),
  });
  furnitureGroup.add(cityExpGroup);

  // the two high-level river bridges (deck 46 m over the water, so the ships pass beneath): Halcyon Gateway in the south, Northgate at the head of the waterway
  {
    const rb = buildRiverBridges({ ground: (x, z) => meshH(x, z), roadMaterial: cityRoadMat ?? undefined });
    furnitureGroup.add(rb.group);
    driveSurfaces.push(...rb.decks);
    surfGrid = null;
    bridgeNear = makeCorridor(rb.path);
    if (scenicData.length) {
      // guardrails stay clear of every other road's mouth (country roads, driveways, city streets); they are solid (scenicRailHit)
      const keep = [...(countryNet?.roads ?? []).map((r) => r.xz), ...streetRuns.map((r) => r.p)];
      const sr = buildScenicRoads(scenicData, (x, z) => meshH(x, z), cityRoadMat ?? undefined, keep); furnitureGroup.add(sr.group); driveSurfaces.push(...sr.decks);
      scenicRails = railIndex(sr.rails);
    }
    // the arch's road direction: the named scenic road (or any scenic road) nearest the arch, over +-2 samples
    const roadDir = (x: number, z: number, name?: string): [number, number] | null => {
      let best = 900, bx = 0, bz = 0;
      for (const r of scenicData) {
        if (name && r.name !== name && scenicData.some((q) => q.name === name)) continue;
        for (let i = 0; i < r.xz.length; i++) {
          const d = (r.xz[i][0] - x) ** 2 + (r.xz[i][1] - z) ** 2; if (d >= best) continue;
          const a = r.xz[Math.max(0, i - 2)], b = r.xz[Math.min(r.xz.length - 1, i + 2)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          best = d; bx = (b[0] - a[0]) / L; bz = (b[1] - a[1]) / L;
        }
      }
      return best < 900 ? [bx, bz] : null;
    };
    if (festivalData) furnitureGroup.add(buildFestival(festivalData, (x, z) => groundH(x, z), roadDir));   // stand on the road surface (decks, raised beds), not the terrain under it                         // Chora Fest stages and stunt furniture
    // Chora Fest progression: Fest Points, Stage Passes, outposts and their opening sets (src/festProgress.ts), saved with the garage
    if (festivalData && !festProg) festProg = createFestProgress({
      festival: festivalData, scenic: scenicData, save: garage.save, persist: () => garage.persist(), banner: (t, k) => showBanner(t, k),
      card: (act) => addMenuCard('CHORA FEST', 'Festival progress', 'Fest Points · Stage Passes · outposts', '#ff2d9a', act),
      brief: briefEl, hideBrief, back: () => preset('overview'),
      travel: (p, q) => { freeSpawn = { p, q }; startDrive('free'); },
      cars: () => simLayer?.world.cars ?? [],
      radio: {
        host: () => gameAudio.currentStation.persona ?? onAirNow() ?? HOSTS[0], station: () => gameAudio.currentStation.name.split(' · ')[0],
        duck: (on) => { if (driving) setMusicDuck(on ? 0.15 : 0.4); }, voice: () => (document.getElementById('tHostVoice') as HTMLInputElement | null)?.checked ?? false,
      },
    });
    if (festivalData && festProg && !festMap) {
      const fd = festivalData, fp = festProg, SC = ['#7ff7ff', '#ff7ab8', '#ffd166', '#b8ff6a', '#c9a0ff', '#ff9a4d', '#6ad7ff', '#ffe07a'];
      const roads: MapRoad[] = [];
      const collect = (): MapRoad[] => { if (roads.length) return roads;
      for (const r of countryNet?.roads ?? []) {
        if (r.kind === 'drive' || r.xz.length < 2) continue;
        const h = r.half ?? 3.6;
        roads.push({ xz: r.xz, kind: r.kind === 'dirt' ? 'dirt' : h >= 9 ? 'freeway' : h >= 6 ? 'highway' : (r as { town?: boolean }).town && h < 4.6 ? 'street' : 'country' });
      }
      for (const r of streetRuns) roads.push({ xz: r.p, kind: r.c === 'freeway' || r.c === 'ramp' ? 'freeway' : r.c === 'arterial' ? 'country' : 'street' });
      if (shoreHw) roads.push({ xz: shoreHw.xz, kind: 'highway' });
      scenicData.forEach((r, i) => roads.push({ xz: r.xz, kind: 'scenic', name: r.name, color: SC[i % SC.length] }));
      return roads; };
      const W2 = meta.width * meta.mpp / 2, H2 = meta.height * meta.mpp / 2;
      festMap = createFestMap({
        bounds: { minX: GRID.ox - W2, maxX: GRID.ox + W2, minZ: GRID.oz - H2, maxZ: GRID.oz + H2 },
        height: (x, z) => hAt(x, z), roads: collect, buildings: () => cityItems.map((it) => [it.x, it.z] as [number, number]),
        places: [...meta.places.map((p) => [p.name, p.xz[0], p.xz[1]] as [string, number, number]), ...NORTH_PLACES],
        sites: () => fd.sites.map((st) => ({ id: st.id, name: st.name, kind: st.kind, x: st.x, z: st.z, open: fp.fest.isOpen(st.id), canOpen: fp.fest.passes.free > 0 })),
        stunts: () => [
          ...fd.speedTraps.map((t) => ({ kind: 'trap' as const, name: t.name, x: t.x, z: t.z, stars: fp.fest.save.stars[t.id] ?? 0 })),
          ...fd.speedZones.map((t) => ({ kind: 'zone' as const, name: t.name, x: (t.a[0] + t.b[0]) / 2, z: (t.a[1] + t.b[1]) / 2, stars: fp.fest.save.stars[t.id] ?? 0 })),
          ...fd.driftZones.map((t) => ({ kind: 'drift' as const, name: t.name, x: (t.a[0] + t.b[0]) / 2, z: (t.a[1] + t.b[1]) / 2, stars: fp.fest.save.stars[t.id] ?? 0 })),
          ...fd.dangerSigns.map((t) => ({ kind: 'danger' as const, name: t.name, x: t.x, z: t.z, stars: fp.fest.save.stars[t.id] ?? 0 })),
        ],
        player: () => (driving ? { x: driving.ps.pos.x, z: driving.ps.pos.z, yaw: driving.ps.yaw } : null),
        fp: () => `${fp.fest.fp.toLocaleString()} Fest Points · ${fp.fest.save.open.length} of ${fd.sites.length} sites open`,
        travel: (id) => { hideBrief(); fp.travel(id); }, openSite: (id) => fp.openSite(id),
        // while driving, the map pauses the car, its sound and the weather
        onOpen: () => { if (driving) { gameAudio.setPaused(true); wx.setPaused(true); driveHud.style.display = 'none'; } },
        onClose: () => { if (driving) { gameAudio.setPaused(false); wx.setPaused(false); driveHud.style.display = 'block'; } },
      });
      addMenuCard('WORLD MAP', 'Navigation map', 'Festival sites · stunts · fast travel (M)', '#9fe8c8', () => festMap?.open());
      addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !festMap?.isOpen() && !replay.active && !photo.active && !(e.target instanceof HTMLInputElement)) { keys.clear(); festMap?.open(); } });
    }
    heroBridgeUpdate = rb.updateLed;
  }
  spatialCuller.indexGroups([furnitureGroup, scapeGroup, zoneGroup]);
}

/** the depressed downtown freeways (trench.ts): bed, walls, medians and overpasses, once the street mask (which holds the cut) has loaded */
async function buildTrenchLayer(): Promise<void> {
  const td = await fetch(BASE + 'trench.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { lines: TrenchLine[] } | null;
  if (!td || !td.lines.length) return;
  const streets = await fetch(BASE + 'city_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { c: string; p: number[][] }[] | null;
  for (let i = 0; i < 200 && !roadMask; i++) await new Promise((r) => setTimeout(r, 100));
  const W: Record<string, number> = { street: 8.5, arterial: 14 };
  const t = buildTrench({
    lines: td.lines, ground: (x, z) => meshH(x, z), hole: trenchHole, roadMaterial: cityRoadMat ?? undefined,
    crossings: (streets ?? []).filter((r) => W[r.c]).map((r) => ({ half: W[r.c] / 2, p: r.p })),
  });
  furnitureGroup.add(t.group);
  driveSurfaces.push(...t.surfaces);
  surfGrid = null;
  console.log('freeway trench:', td.lines.length, 'lines,', t.overpasses, 'overpasses');
}
let heroBridgeUpdate: ((elapsed: number, nightFactor: number) => void) | null = null;

// ---------- lap timing ----------
interface Lap { idx: number; started: boolean; t0: number; s1: boolean; s2: boolean; splits: number[]; last: number | null; best: number | null; laps: number; off: boolean }
let lap: Lap | null = null;
const fmtT = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
function lapReset(): void { lap = { idx: 0, started: false, t0: 0, s1: false, s2: false, splits: [], last: lap?.last ?? null, best: lap?.best ?? null, laps: lap?.laps ?? 0, off: false }; }
function lapStep(x: number, z: number, now: number): string {
  if (!lap) lapReset();
  const L = lap!, n = cityPath.length;
  if (!n) return '';
  let best = 1e18, bi = L.idx;
  for (let k = -25; k <= 40; k++) {
    const i = (L.idx + k + n) % n;
    const d = (cityPath[i].x - x) ** 2 + (cityPath[i].z - z) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  L.off = best > 40 * 40;
  const prev = L.idx;
  L.idx = bi;
  const third = n / 3;
  if (!L.started && bi >= 3 && bi < 40) { L.started = true; L.t0 = now; L.s1 = L.s2 = false; L.splits = []; }
  if (L.started) {
    if (!L.s1 && bi >= third && bi < 2 * third) { L.s1 = true; L.splits.push(now - L.t0); }
    if (L.s1 && !L.s2 && bi >= 2 * third && bi < n - 20) { L.s2 = true; L.splits.push(now - L.t0); }
    if (L.s2 && prev > n - 30 && bi < 30) {
      const t = now - L.t0;
      L.last = t; L.laps++;
      if (L.best === null || t < L.best) L.best = t;
      L.t0 = now; L.s1 = L.s2 = false; L.splits = [];
    }
  }
  const cur = L.started ? fmtT(now - L.t0) : '--:--.--';
  const totalLaps = competition?.totalLaps ?? 3;
  const raceLap = Math.min(totalLaps, Math.max(0, L.laps - raceStartLaps) + (L.started ? 1 : 0));
  return `LAP ${raceLap}/${totalLaps} &nbsp; ${cur}` + (L.last !== null ? ` &nbsp; last ${fmtT(L.last)}` : '') + (L.best !== null ? ` &nbsp; best ${fmtT(L.best)}` : '') + (L.splits.length ? ` &nbsp; S${L.splits.length} ${fmtT(L.splits[L.splits.length - 1])}` : '') + (L.off ? ' &nbsp; <span style="color:#ffb36a">off the street</span>' : '');
}

// ---------- driving ----------
const keys = new Set<string>();
interface DriveState { lock: number; camDist: number; camH: number; camView: number; circuitId: string; pos: THREE.Vector3; yaw: number; sp: number; lat: number; steer: number; car: THREE.Group; startPos: THREE.Vector3; startYaw: number; camPos: THREE.Vector3; hit: number; ps: CarState }
let driving: DriveState | null = null;
// racing line and assists (Settings > Driving)
const assist = { line: true, brake: true, steer: true };
try { const a = JSON.parse(localStorage.getItem('apex.assist') ?? 'null'); if (a) Object.assign(assist, a); } catch { /* storage blocked */ }
let racingLine: RacingLine | null = null, chevrons: ChevronLine | null = null, lineMesh: THREE.Mesh | null = null, assistBrakeShown = 0;
function buildRacingLine(id: string): void {
  if (lineMesh) { scene.remove(lineMesh); lineMesh.geometry.dispose(); lineMesh = null; }
  racingLine = null;
  if (id === 'free') return;
  const city = id === 'ironport_grand_circuit';
  const pts = city ? cityPath : meta.circuits[id] ? densify(meta.circuits[id], 6) : [];
  if (pts.length < 8) return;
  const cg = SOV_SPEC.corneringGrip * 1.18 * 9.81;
  racingLine = new RacingLine(pts, city, { aLat: cg * 0.66, aBrake: 1.1 * SOV_SPEC.corneringGrip * 9.81 * 0.6, vmax: 80, halfWidth: city ? 5.4 : 4.2 });
  chevrons = new ChevronLine(racingLine, (x, z) => groundH(x, z) + 0.07);
  lineMesh = chevrons.mesh;
  lineMesh.visible = assist.line;
  scene.add(lineMesh);
}
function saveAssist(): void { try { localStorage.setItem('apex.assist', JSON.stringify(assist)); } catch { /* storage blocked */ } if (lineMesh) lineMesh.visible = assist.line; }
const driveHud = document.createElement('div');
driveHud.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:10px 22px;background:rgba(26,0,38,.72);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.14);border-radius:20px;font:700 15px JetBrains Mono,monospace;color:#fff;display:none;text-align:center;pointer-events:none';
document.body.appendChild(driveHud);
const racingHud = new RacingHud(driveHud);

// ---------- photo mode: freeze the car, take the camera, open the doors, shoot (src/photo.ts) ----------
let bokeh: BokehPass | null = null;
const photo = new PhotoMode({
  rig: { renderer, camera, composer, render: () => { if (composer && fxOn) composer.render(); else renderer.render(scene, camera); } },
  scene, controls,
  subject: () => driving?.car ?? null,
  panels: () => (driving?.car.userData.panels as import('./car').CarRig['panels'] | undefined),
  grade: () => gradePass,
  title: () => { const a = garage.active; return a ? `${garage.def(a.uid)!.make} ${a.nickname ?? garage.def(a.uid)!.name}` : 'Kestrel Sovereign GT-R'; },
  rows: () => [
    { label: 'Time of day', options: [['golden', 'Golden hour'], ['clear', 'Clear day'], ['sunset', 'Sunset'], ['dusk', 'Dusk'], ['night', 'Night'], ['sunrise', 'Sunrise']], get: () => todKey, set: (v) => setTimeOfDay(v) },
    { label: 'Weather', options: [['clear', 'Clear'], ['partly', 'Partly cloudy'], ['overcast', 'Overcast'], ['fog', 'Fog'], ['rain', 'Rain'], ['storm', 'Storm']], get: () => wx.name, set: (v) => wx.setWeather(v, false, true) },
  ],
  dof: {
    set: (on, aperture, focus) => {
      if (!composer) return;
      if (on && !bokeh) { bokeh = new BokehPass(scene, camera, { focus, aperture: 0.0001, maxblur: 0.012 }); composer.insertPass(bokeh, 2); }
      if (bokeh) { bokeh.enabled = on; if (on) { const u = bokeh.uniforms as Record<string, { value: number }>; u.focus.value = focus; u.aperture.value = aperture * 0.00012; } }
    },
  },
  onEnter: () => { replay.active || (driveHud.style.display = 'none'); },
  onExit: () => { if (driving) { controls.enabled = false; driveHud.style.display = 'block'; } },
});
const photoBtn = document.createElement('button');
photoBtn.textContent = 'PHOTO (K)';
photoBtn.style.cssText = 'position:fixed;right:76px;top:66px;height:38px;padding:0 16px;background:rgba(26,0,38,.62);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;backdrop-filter:blur(12px);font:600 11px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;display:none;z-index:30';
photoBtn.onclick = () => { if (driving && !replay.active) photo.enter(); };
document.body.appendChild(photoBtn);

// ---------- the Sovereign's vehicle spec and the ground it drives on ----------
// The car is the active car in the garage: its parts and tune decide the physics spec (power, mass, grip, springs, brakes, downforce).
let SOV_SPEC = activeSpec();
function applyActiveCar(): void { SOV_SPEC = activeSpec(); }
const gameAudio = new GameAudio();      // engine, supercharger, tyres, brakes, backfire and suspension thumps driven by the physics state
gameAudio.setMusic(false);              // the region game plays its own tracks
let engVol = 1.0;
try { const v = parseFloat(localStorage.getItem('apex.engVol') ?? ''); if (!Number.isNaN(v)) engVol = Math.min(1.5, Math.max(0, v)); } catch { /* storage blocked */ }
gameAudio.setLevel(engVol);
// the racing surface is a ribbon a few centimetres above the terrain mesh; the car has to ride on what is drawn
const RIBBON_LIFT = 0.07;
// every drivable surface mesh (the racing-surface ribbon, the kerbs) goes into a 2D triangle grid, so the car's wheels sit on exactly what is drawn,
// including the steps, crowns and kerbs that stand above the terrain mesh. groundH = the highest of the terrain mesh and those surfaces.
const driveSurfaces: THREE.Mesh[] = [];
interface SurfGrid { cell: number; map: Map<string, number[]>; tris: Float32Array }
let surfGrid: SurfGrid | null = null;
function buildSurfGrid(): SurfGrid {
  const cell = 5, map = new Map<string, number[]>(), flat: number[] = [];
  for (const m of driveSurfaces) {
    m.updateMatrixWorld(true);
    const pos = m.geometry.attributes.position, idx = m.geometry.index!;
    const v = new THREE.Vector3();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
    for (let t = 0; t < idx.count; t += 3) {
      const a = pts[idx.getX(t)], b = pts[idx.getX(t + 1)], c = pts[idx.getX(t + 2)];
      const id = flat.length / 9;
      flat.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / cell), x1 = Math.floor(Math.max(a.x, b.x, c.x) / cell);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / cell), z1 = Math.floor(Math.max(a.z, b.z, c.z) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx + ',' + gz; const l = map.get(k); if (l) l.push(id); else map.set(k, [id]); }
    }
  }
  return { cell, map, tris: new Float32Array(flat) };
}
function surfaceTop(x: number, z: number, maxY = Infinity): number {
  if (!driveSurfaces.length) return -1e9;
  surfGrid ??= buildSurfGrid();
  const l = surfGrid.map.get(Math.floor(x / surfGrid.cell) + ',' + Math.floor(z / surfGrid.cell));
  if (!l) return -1e9;
  const T = surfGrid.tris;
  let top = -1e9;
  for (const id of l) {
    const o = id * 9;
    const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, l3 = 1 - l1 - l2;
    if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
    const y = l1 * T[o + 1] + l2 * T[o + 4] + l3 * T[o + 7];
    if (y > top && y <= maxY) top = y;
  }
  return top;
}
/** inside the depressed freeway's cut (the street mask's alpha) */
function trenchHole(x: number, z: number): boolean {
  if (!roadMask) return false;
  const u = (x - maskVec.x) / maskVec.z, v = (z - maskVec.y) / maskVec.w;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  return roadMask.data[((Math.floor(v * roadMask.h) * roadMask.w) + Math.floor(u * roadMask.w)) * 4 + 3] < 128;
}
/** the height of whatever the car is on, for multi-level places (an overpass over the freeway): the highest surface no more than a step above this */
let groundYHint: number | null = null;
function groundH(x: number, z: number): number {
  if (trenchHole(x, z)) {
    // in the cut there is no ground at street level: the freeway bed below and the overpasses above; take the one the car is on (or, with no hint, the bed)
    if (groundYHint !== null) { const t = surfaceTop(x, z, groundYHint + 2.2); if (t > -1e8) return t; }
    return lowestSurface(x, z, meshH(x, z) - 7.5);
  }
  const top = surfaceTop(x, z);
  if (cliffTunnelNear && cliffTunnelNear(x, z, 15)) {
    if (top > -1e8) return top;
    const sy = cliffIx ? cliffSurface(cliffIx, x, z, 14) : NaN;                         // a wheel past the road edge inside the tunnel stands on the road's own plane, never on the mountain above
    if (!Number.isNaN(sy)) return sy * exag;
  }       // in the tunnel the road is the ground; the terrain is the mountain over it
  // on the cliff raceway's tarmac the road is the ground too: where a dune bank laps over the road edge (the sand at the start is meant to be there) the car
  // drives on the road under it instead of climbing the sand and sticking there
  if (cliffIx && cliffNear && cliffNear(x, z, 6.2)) {
    const sy = cliffSurface(cliffIx, x, z, 6.2);
    if (!Number.isNaN(sy)) return Math.max(sy * exag, top > -1e8 && top < sy * exag + 1.5 ? top : -1e9);
  }
  return Math.max(meshH(x, z), top);
}
/** the lowest drivable surface at x,z (the freeway bed under an overpass), or `fallback` */
function lowestSurface(x: number, z: number, fallback: number): number {
  let y = surfaceTop(x, z), best = y;
  for (let k = 0; k < 4 && y > -1e8; k++) { y = surfaceTop(x, z, y - 0.5); if (y > -1e8) best = y; }
  return best > -1e8 ? best : fallback;
}
let surfIdx = 0;
/** a fast "is this point within r metres of the line" test: the line's points in a hash of 24 m cells */
function makeCorridor(pts: { x: number; z: number }[]): (x: number, z: number, r: number) => boolean {
  const C = 24, h = new Map<number, number[]>();
  for (const p of pts) { const k = Math.floor(p.x / C) * 8192 + Math.floor(p.z / C); let a = h.get(k); if (!a) { a = []; h.set(k, a); } a.push(p.x, p.z); }
  return (x, z, r) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C), r2 = r * r;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = h.get((cx + i) * 8192 + cz + j); if (!a) continue;
      for (let k = 0; k < a.length; k += 2) { const dx = a[k] - x, dz = a[k + 1] - z; if (dx * dx + dz * dz < r2) return true; }
    }
    return false;
  };
}
/** on a race course or inside its barriers: every circuit's line (densified to 2 m) with its own clearance (half width + barriers + a margin). Built on first use, after
 *  the circuits are loaded; site plans, yards, hedges and utilities ask it before they stand anything on the ground */
const COURSE_R: Record<string, number> = { ironport_grand_circuit: 8.0, ironworks_industrial_circuit: 8.0, harbor_district_circuit: 8.0, great_lakes_cliff_raceway: 8.5, pinewood_rally_stage: 6.5 };
let courseTests: { id: string; near: (x: number, z: number, r: number) => boolean; r: number }[] | null = null;
const TARMAC_CIRCUITS = ['ironport_grand_circuit', 'ironworks_industrial_circuit', 'harbor_district_circuit', 'great_lakes_cliff_raceway'];
function onCourse(x: number, z: number, extra = 0, only?: string[]): boolean {
  if (!courseTests) {
    if (!meta?.circuits) return false;
    courseTests = Object.entries(meta.circuits).map(([id, c]) => {
      const xz = (c as { xz: number[][] }).xz, pts: { x: number; z: number }[] = [];
      for (let i = 0; i < xz.length - 1; i++) { const a = xz[i], b = xz[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 2)); for (let j = 0; j < k; j++) pts.push({ x: a[0] + (b[0] - a[0]) * j / k, z: a[1] + (b[1] - a[1]) * j / k }); }
      return { id, near: makeCorridor(pts), r: COURSE_R[id] ?? 6.5 };
    });
  }
  return courseTests.some((t) => (!only || only.includes(t.id)) && t.near(x, z, t.r + extra));
}
/** the yard and site-plan items that would stand on a course, left out; long fence runs are cut where they cross one */
function keepYardsOffCourse(d: YardData): YardData {
  const seg = (list?: number[][]): number[][] | undefined => {
    if (!list) return list;
    const out: number[][] = [];
    for (const [x0, z0, x1, z1, ...rest] of list) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 3));
      let run: number[] | null = null;
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n, ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
        const bad = onCourse(ax, az, 0.5) || onCourse(bx, bz, 0.5) || onCourse((ax + bx) / 2, (az + bz) / 2, 0.5);
        if (bad) { if (run) { out.push(run); run = null; } continue; }
        if (run) { run[2] = bx; run[3] = bz; } else run = [ax, az, bx, bz, ...rest];
      }
      if (run) out.push(run);
    }
    return out;
  };
  const pt = (list: number[][] | undefined, r: (it: number[]) => number): number[][] | undefined => list?.filter((it) => !onCourse(it[0], it[1], r(it)));
  return {
    ...d,
    garages: pt(d.garages, () => 5) ?? [], fences: seg(d.fences) ?? [], walks: seg(d.walks), sideFences: seg(d.sideFences), pickets: seg(d.pickets), chain: seg(d.chain),
    shrubs: pt(d.shrubs, (it) => it[2] ?? 1), mailboxes: pt(d.mailboxes, () => 0.5), docks: pt(d.docks, () => 2), trailers: pt(d.trailers, () => 9), dumpsters: pt(d.dumpsters, () => 1.5),
    aprons: pt(d.aprons, (it) => Math.max(it[2], it[3]) / 2),
  };
}
let cliffPathPts: { x: number; z: number }[] = [];
let cliffDesign: TrackDesign | null = null; let cliffIx: TrackIndex | null = null;
let cliffNear: ((x: number, z: number, r: number) => boolean) | null = null;         // the cliff raceway's tarmac
let cliffTunnelNear: ((x: number, z: number, r: number) => boolean) | null = null;   // inside its tunnel, where the mountain overhead must not hold the car up
let mapEditor: ReturnType<typeof createMapEditor> | null = null;
let userMap: UserMap | null = null;                                                    // roads and zones drawn in the map editor (F2)
let festivalData: FestivalData | null = null;                                         // Chora Fest sites and PR stunts (region/festival.json)
let scenicData: ScenicRoad[] = [];                                                    // the festival's designed roads (Kettle Pass, ...)
let shoreHw: Shoreline | null = null;                                                  // the shoreline highway and its open gallery
let countryNet: RoadNetwork | null = null;                                             // country roads traced from the map texture
let bridgeNear: ((x: number, z: number, r: number) => boolean) | null = null;         // the river bridges' roadway
let countryScenes: CountryScenes | null = null;                                        // Millbrook Creek, its covered bridge, Millbrook Road and Hollow Lane
let rallyNear: ((x: number, z: number, r: number) => boolean) | null = null;         // the rally stage's gravel road
function surfaceAtXZ(x: number, z: number): SurfaceType {
  // roads and pavement from the baked street mask, the coastal highway and the city circuit corridor, beach sand near the water, grass elsewhere
  if (roadMask) {
    const u = (x - maskVec.x) / maskVec.z, v = (z - maskVec.y) / maskVec.w;
    if (u >= 0 && u < 1 && v >= 0 && v < 1) {
      const i = ((Math.floor(v * roadMask.h) * roadMask.w) + Math.floor(u * roadMask.w)) * 4;
      if (roadMask.data[i] > 90 || roadMask.data[i + 1] > 90) return 'asphalt';
    }
  }
  if (meta) {
    const hw = meta.coastal_highway.xz;
    for (let i = 0; i < hw.length; i += 2) { const dx = hw[i][0] - x, dz = hw[i][1] - z; if (dx * dx + dz * dz < 64) return 'asphalt'; }
  }
  const P = cityPath, n = P.length;
  if (n) {
    let best = 1e18;
    for (let k = -12; k <= 12; k++) { const j = ((surfIdx + k) % n + n) % n; const d = (P[j].x - x) ** 2 + (P[j].z - z) ** 2; if (d < best) { best = d; surfIdx = j; } }
    if (best < 80) return 'asphalt';
  }
  if (cliffNear && cliffNear(x, z, 6.6)) return 'asphalt';
  if (rallyNear && rallyNear(x, z, 5.2)) return 'gravel';
  if (bridgeNear && bridgeNear(x, z, 10)) return 'asphalt';
  if (indNear && indNear(x, z, 7.2)) return 'asphalt';
  if (harborNear && harborNear(x, z, 7.2)) return 'asphalt';
  if (portData && inPort(portData, x, z)) return 'asphalt';
  if (countryScenes) { if (countryScenes.pavedNear(x, z, 0.8)) return 'asphalt'; if (countryScenes.dirtNear(x, z, 0.8)) return 'gravel'; }
  return hAt(x, z) < 3 ? 'sand' : 'grass';
}

// ---------- replay + free-look camera ----------
let driveClock = 0;
let driveViewShown = 0;
const driveInput = new DriveInput();
driveInput.drivingOn = () => !!driving;
driveInput.replayOn = () => replay.active;
const VIEW_NAMES =['Chase', 'Far chase', 'Hood', 'Dash', 'Driver'];
let pedalT = 0, pedalB = 0;
let carY = -1e9, carPitch = 0, carRoll = 0, slopePS = 0, slopeRS = 0;
let camYawOff = 0, camPitchOff = 0, camZoom = 1, camIdle = 0, lookBack = false;
const replay = new Replay({
  camera,
  car: () => driving?.car ?? null,
  hAt: (x, z) => hAt(x, z),
  exag: () => exag,
  blocked: (x, z) => {
    const list = colGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!list) return false;
    for (const it of list) {
      const cx = it.bx ?? it.x, cz = it.bz ?? it.z, c = Math.cos(it.rotY), sn = Math.sin(it.rotY);
      const dx = x - cx, dz = z - cz;
      if (Math.abs(dx * c - dz * sn) < it.w / 2 + 2.5 && Math.abs(dx * sn + dz * c) < it.d / 2 + 2.5) return true;
    }
    return false;
  },
  lapInfo: () => (driving?.circuitId === 'ironport_grand_circuit' ? 'IRONPORT GRAND CIRCUIT' : 'FREE ROAM'),
});
(window as any).replay = replay;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!driving || replay.active || !(e.buttons & 3)) return;
  camYawOff -= e.movementX * 0.006;
  camPitchOff = Math.max(-0.12, Math.min(1.1, camPitchOff + e.movementY * 0.004));
  camIdle = 0;
});
renderer.domElement.addEventListener('wheel', (e) => {
  if (!driving || replay.active) return;
  camZoom = Math.max(0.45, Math.min(2.6, camZoom * (e.deltaY > 0 ? 1.08 : 0.92)));
  e.preventDefault();
}, { passive: false });

function activeCarId(): string {
  const q = new URLSearchParams(location.search).get('car');
  if (q && hasScanCar(q)) return q;
  const a = garage.active;
  const id = a ? garage.def(a.uid)?.id : undefined;
  return id && hasScanCar(id) ? id : 'kestrel';
}

function makeCar(carId?: string): THREE.Group {
  const id = carId ?? activeCarId();
  const qOverride = new URLSearchParams(location.search).get('car');
  const holder = new THREE.Group();
  holder.userData.carId = id;
  const rig = makeSovereign();
  holder.add(rig.group);
  holder.userData.update = rig.update;
  // swap in the GT-R standard scan car once it has loaded; the stand-in covers the wait
  loadScanCarById(id).then(async (r) => {
    {
      const activeDefId = garage.active ? garage.def(garage.active.uid)?.id : undefined;
      const pc = !qOverride && activeDefId === id ? garage.active?.paint : undefined;
      if (pc) r.paint?.set({ color: new THREE.Color(pc).getHex() });
    }
    // compile the scan car's shaders before it is shown: the first render of its heavy paint / glass materials used to stall the frame the car appeared in. The compile starts with the car visible
    // (it only sees visible objects) and the car is hidden again before anything is drawn; the stand-in covers the wait.
    r.group.visible = true; holder.add(r.group);
    let compiled: Promise<unknown> | null = null;
    try { compiled = renderer.compileAsync(scene, camera); } catch { compiled = null; }
    r.group.visible = false;
    try { await compiled; } catch { /* compile errors surface on the first render, as before */ }
    r.group.visible = true; holder.userData.update = r.update; holder.userData.panels = r.panels;
    // the stand-in is finished: stop drawing it and free its geometry
    // the scan car casts the sun's shadow (skip sub-28 cm interior/hardware parts to save >100k shadow tris), and keeps the stand-in's soft contact shadow under it
    r.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.Material).transparent) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.castShadow = (m.geometry.boundingSphere?.radius ?? 1) >= 0.28;
    });
    let blob: THREE.Object3D | null = null;
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (!blob && m.isMesh && (m.geometry as THREE.BufferGeometry).type === 'PlaneGeometry' && ((m.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture | null)?.isCanvasTexture) blob = m; });
    if (blob) { const b = blob as THREE.Mesh; b.parent?.remove(b); holder.add(b); }
    rig.group.visible = false; holder.remove(rig.group);
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); } });
  }).catch((e) => console.warn('scan car failed', e));
  return holder;
}

// building collision: spatial hash of footprints
const CELL = 60;
const colGrid = new Map<string, CityItem[]>();
function buildCollision(): void {
  colGrid.clear();
  for (const it of cityItems) {
    const cx = it.bx ?? it.x, cz = it.bz ?? it.z;
    const r = Math.hypot(it.w, it.d) / 2;
    for (let gx = Math.floor((cx - r) / CELL); gx <= Math.floor((cx + r) / CELL); gx++)
      for (let gz = Math.floor((cz - r) / CELL); gz <= Math.floor((cz + r) / CELL); gz++) {
        const k = gx + ',' + gz;
        if (!colGrid.has(k)) colGrid.set(k, []);
        colGrid.get(k)!.push(it);
      }
  }
}
function collide(s: DriveState): boolean {
  let hit = false;
  const gx = Math.floor(s.pos.x / CELL), gz = Math.floor(s.pos.z / CELL);
  const seen = new Set<CityItem>();
  for (let ax = gx - 1; ax <= gx + 1; ax++) for (let az = gz - 1; az <= gz + 1; az++) {
    const list = colGrid.get(ax + ',' + az);
    if (!list) continue;
    for (const it of list) {
      if (seen.has(it)) continue;
      seen.add(it);
      const cx = it.bx ?? it.x, cz = it.bz ?? it.z;
      const c = Math.cos(it.rotY), sn = Math.sin(it.rotY);
      const dx = s.pos.x - cx, dz = s.pos.z - cz;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const hw = it.w / 2 + 1.3, hd = it.d / 2 + 1.3;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
        if (px < pz) { const d = Math.sign(lx || 1) * px; s.pos.x += d * c; s.pos.z += -d * sn; }
        else { const d = Math.sign(lz || 1) * pz; s.pos.x += d * sn; s.pos.z += d * c; }
        hit = true;
      }
    }
  }
  return hit;
}

// The barriers stand 6.9 m from the centre line (inner face about 6.6 m). The whole car is held inside them, not just its middle: a car turning into a wall has its front
// corner out ahead of the centre, and testing only the centre let that corner through the barrier.
const BARRIER_FACE = 6.45;                                   // how far from the centre line any point of the car may get (the inner face is 6.6, with a hand's width spare)
const CAR_HW = 1.0, CAR_HL = 2.35;                           // half width and half length of the Sovereign's body
let barrierIdx = 0;
function corridorAt(P: { x: number; z: number }[], n: number, bi: number, x: number, z: number): { d: number; nx: number; nz: number } {
  let nd = 1e18, nx = 0, nz = 0;
  for (let j = bi - 4; j <= bi + 3; j++) {
    const a = P[(j + n) % n], b = P[(j + 1 + n) % n];
    const tx = b.x - a.x, tz = b.z - a.z, L2 = tx * tx + tz * tz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * tx + (z - a.z) * tz) / L2));
    const qx = a.x + tx * t, qz = a.z + tz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < nd) { nd = d; nx = x - qx; nz = z - qz; }
  }
  return { d: nd, nx, nz };
}
function barrierCollide(s: DriveState): boolean {
  const cliff = s.circuitId === 'great_lakes_cliff_raceway';
  const P = cliff ? cliffPathPts : s.circuitId === IND ? industrialPath : s.circuitId === HARB ? harborPath : cityPath, n = P.length;
  if (!n) return false;
  // nearest path point near the last one (the path is a closed loop; search a window, fall back to a full scan)
  let best = 1e18, bi = barrierIdx;
  const scan = (from: number, to: number): void => {
    for (let k = from; k <= to; k++) {
      const i = ((barrierIdx + k) % n + n) % n;
      const d = (P[i].x - s.pos.x) ** 2 + (P[i].z - s.pos.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
  };
  scan(-20, 20);
  if (best > 60 * 60) { best = 1e18; for (let i = 0; i < n; i++) { const d = (P[i].x - s.pos.x) ** 2 + (P[i].z - s.pos.z) ** 2; if (d < best) { best = d; bi = i; } } }
  barrierIdx = bi;
  // the four corners of the car: the one furthest past the barrier face decides how far the car is pushed back
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  let worst = 0, ux = 0, uz = 0;
  for (const [lx, lz] of [[CAR_HW, CAR_HL], [-CAR_HW, CAR_HL], [CAR_HW, -CAR_HL], [-CAR_HW, -CAR_HL]]) {
    const x = s.pos.x + cy * lx + sy * lz, z = s.pos.z - sy * lx + cy * lz;
    const c = corridorAt(P, n, bi, x, z);
    const inTun = cliff && cliffTunnelNear ? cliffTunnelNear(x, z, 14) : false;
    const over = c.d - (cliff ? (inTun ? 8.55 : 8.05) : BARRIER_FACE);       // cliff raceway: the Armco / Jersey face (the tunnel's wall inside the mountain)
    if (over > worst && c.d < 60) { worst = over; ux = c.nx / c.d; uz = c.nz / c.d; }
  }
  if (worst > 0) { wallPush(s, ux, uz, worst); return true; }
  return false;
}
/** off a race (free roam, deliveries, events) the street circuits' concrete barriers are solid from both sides too: a car outside the course is stopped by them
 *  as much as one inside it (it used to drive straight through them). Ironworks and Ironport: blocks centred 6.9 m from the line, 0.55 m thick; where Ironworks
 *  left a block out (beside another leg of its own course) there is nothing to hit */
const freeBarrierIdx: Record<string, number> = {};
function freeRoamBarrierHit(s: DriveState): boolean {
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  for (const [id, P] of [[IND, industrialPath], [HARB, harborPath], ['ironport_grand_circuit', cityPath]] as [string, { x: number; z: number }[]][]) {
    const n = P.length; if (n < 8) continue;
    let best = 1e18, bi = freeBarrierIdx[id] ?? 0;
    for (let k = -20; k <= 20; k++) { const i = ((bi + k) % n + n) % n, d = (P[i].x - s.pos.x) ** 2 + (P[i].z - s.pos.z) ** 2; if (d < best) { best = d; bi = i; } }
    if (best > 40 * 40) { best = 1e18; for (let i = 0; i < n; i += 2) { const d = (P[i].x - s.pos.x) ** 2 + (P[i].z - s.pos.z) ** 2; if (d < best) { best = d; bi = i; } } }
    freeBarrierIdx[id] = bi;
    if (best > 14 * 14) continue;                                                     // nowhere near this course's barriers
    const B = 6.9, T = 0.3 + 0.05;
    const centre = corridorAt(P, n, bi, s.pos.x, s.pos.z), inside = centre.d < B;
    let worst = 0, ux = 0, uz = 0;
    for (const [lx, lz] of [[CAR_HW, CAR_HL], [-CAR_HW, CAR_HL], [CAR_HW, -CAR_HL], [-CAR_HW, -CAR_HL]]) {
      const x = s.pos.x + cy * lx + sy * lz, z = s.pos.z - sy * lx + cy * lz;
      const c = corridorAt(P, n, bi, x, z); if (c.d < 1e-3) continue;
      const ox = c.nx / c.d, oz = c.nz / c.d;
      // a gap Ironworks left (another leg of the course within 7.6 m of where the block would stand)
      if (id === IND) { const bx = x - ox * (c.d - B), bz = z - oz * (c.d - B); let gap = false; for (let j = 0; j < n && !gap; j += 2) { const di = Math.min(Math.abs(j - bi), n - Math.abs(j - bi)); if (di >= 8 && Math.hypot(P[j].x - bx, P[j].z - bz) < 7.6) gap = true; } if (gap) continue; }
      const over = inside ? c.d - (B - T) : (B + T) - c.d;
      if (over > 0 && over < 2 * T + 1.2 && over > worst) { worst = over; ux = inside ? ox : -ox; uz = inside ? oz : -oz; }
    }
    if (worst > 0) { wallPush(s, ux, uz, worst); return true; }
  }
  return false;
}
/** the scenic roads' guardrails are solid on every drive (a car that runs wide on a viaduct or a mountain bend scrapes the rail instead of dropping off) */
let scenicRails: Map<number, RailSeg[]> | null = null;
function scenicRailHit(s: DriveState): boolean {
  if (!scenicRails) return false;
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  let worst = 0, ux = 0, uz = 0;
  for (const [lx, lz] of [[CAR_HW, CAR_HL], [-CAR_HW, CAR_HL], [CAR_HW, -CAR_HL], [-CAR_HW, -CAR_HL]]) {
    const r = railPenetration(scenicRails, s.pos.x + cy * lx + sy * lz, s.ps.pos.y, s.pos.z - sy * lx + cy * lz);
    if (r.d > worst) { worst = r.d; ux = r.ox; uz = r.oz; }
  }
  if (worst > 0) { wallPush(s, ux, uz, worst); return true; }
  return false;
}
/** push the car back from a wall it is `worst` metres into ((ux, uz) points into the wall) and take away the speed going into it */
function wallPush(s: DriveState, ux: number, uz: number, worst: number): void {
  {
    s.pos.x -= ux * worst;
    s.pos.z -= uz * worst;
    // A wall takes away the speed going INTO it and keeps the speed ALONG it, and it turns the car's nose toward the wall's direction: the car scrapes along and out of the
    // corner. (It used to cut the car's speed by a third of the way to a stop on every frame in contact and kick the sideways speed back, so a car that hit a corner nose-on
    // stayed pinned there with its wheels pointed at the wall.)
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    let vx = fx * s.sp + rx * s.lat, vz = fz * s.sp + rz * s.lat;
    const into = vx * ux + vz * uz;                     // speed towards the wall (positive: going into it)
    if (into > 0) { vx -= (1 + 0.12) * into * ux; vz -= (1 + 0.12) * into * uz; }
    vx *= 0.985; vz *= 0.985;                           // scrape friction along the wall
    // turn the nose toward the wall's direction (whichever way along it the car was already going)
    let tx = -uz, tz = ux; if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
    if (fx * ux + fz * uz > 0.15) {                     // the nose points into the wall
      const want = Math.atan2(tx, tz); let d = want - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += d * 0.14;
    }
    const nfx = Math.sin(s.yaw), nfz = Math.cos(s.yaw);
    s.sp = vx * nfx + vz * nfz; s.lat = vx * Math.cos(s.yaw) - vz * Math.sin(s.yaw);
  }
}

// ---------- garage: run tracking, medals, payouts and the courier mode ----------
let runTracker: RunTracker | null = null, stagePath: PathProgress | null = null, stageFinished = false, lastLapCount = 0, raceStartLaps = 0, delivery: DeliveryGame | null = null;
const RUN_NAMES: Record<string, string> = { ironport_grand_circuit: 'Ironport Grand Circuit', great_lakes_cliff_raceway: 'Great Lakes Cliff Raceway', pinewood_rally_stage: 'Pinewood Rally Stage', ironworks_industrial_circuit: 'Ironworks Industrial Circuit', superior_range_circuit: 'Superior Range Circuit', escarpment_circuit: 'Escarpment Circuit' };
let courierSpots: ReturnType<typeof makeSpots> | null = null;
function deliverySpots(): ReturnType<typeof makeSpots> {
  if (!courierSpots) courierSpots = makeSpots([meta.coastal_highway.xz.map((p) => ({ x: p[0], z: p[1] })), ...streetRuns.map((r) => r.p.map((p) => ({ x: p[0], z: p[1] })))]);
  return courierSpots;
}
let competition: CompetitionEngine | null = null;
let trafficMgr: TrafficManager | null = null;
let challengeMgr: OpenWorldChallengeManager | null = null;
let pursuitMode: CopsAndRobbersMode | null = null;
const onlineSession = new OnlineSessionManager((text) => { msg.textContent = text; });
const remoteGroup = new THREE.Group();
scene.add(remoteGroup);
const spatialCuller = new SpatialCuller();
const aiGroup = new THREE.Group();
const trafficGroup = new THREE.Group();
scene.add(aiGroup, trafficGroup);
let aiMeshes: THREE.Group[] = [];
let trafficMeshes: THREE.Group[] = [];

function makeTrafficOrAiCarMesh(paintHex: number | string, variant: RivalCarVariant | number = 0): THREE.Group {
  return makeRivalCar(paintHex, variant);
}

function teardownRun(): void {
  if (delivery) { const d = delivery; delivery = null; d.quit(); d.dispose(); }
  if (pursuitMode) { scene.remove(pursuitMode.group); pursuitMode = null; }
  runTracker = null; stagePath = null; stageFinished = false;
  competition = null; trafficMgr = null; challengeMgr = null;
  aiGroup.clear(); trafficGroup.clear();
  aiMeshes = []; trafficMeshes = [];
}
function setupRun(id: string, courier?: 'rookie' | 'pro' | 'legend', pursuitRole?: PursuitRoleChoice): void {
  teardownRun();
  lastLapCount = lap?.laps ?? 0;
  raceStartLaps = lastLapCount;
  if (pursuitRole && driving) {
    pursuitMode = new CopsAndRobbersMode(pursuitRole, driving.pos, driving.yaw, groundH);
    scene.add(pursuitMode.group);
    msg.textContent = `${pursuitMode.statusText} · [F] BAIL OUT / ON FOOT`;
    return;
  }
  if (courier) { delivery = new DeliveryGame(courier, deliverySpots(), scene, groundH, () => preset('overview')); return; }
  if (id === 'free') {
    const hwPts = meta.coastal_highway.xz.map((p) => new THREE.Vector3(p[0], hAt(p[0], p[1]) * exag, p[1]));
    const subPts = streetRuns.slice(0, 12).flatMap((r) => r.p.map((p) => new THREE.Vector3(p[0], hAt(p[0], p[1]) * exag, p[1])));
    trafficMgr = new TrafficManager({ i196Samples: hwPts, suburbSamples: subPts, terrainHeight: groundH }, 18);
    let tvIdx = 0;
    for (const tv of trafficMgr.vehicles) {
      const m = makeTrafficOrAiCarMesh(new THREE.Color(tv.paintHex).getHex(), tvIdx++ % 4 === 0 ? 'exotic-wedge' : 'sport-coupe');
      m.position.copy(tv.pos);
      m.rotation.y = tv.yaw;
      trafficGroup.add(m);
      trafficMeshes.push(m);
    }
    challengeMgr = new OpenWorldChallengeManager(festivalData);
    return;
  }
  const city = id === 'ironport_grand_circuit';
  const pts = city ? cityPath : meta.circuits[id] ? densify(meta.circuits[id], 6) : [];
  if (pts.length < 8) return;
  runTracker = new RunTracker(id, refParSec(pts, city, city ? 5.4 : 4.2));
  const vecPts = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  competition = new CompetitionEngine();
  competition.createGrid(vecPts, [CARS.kestrel, CARS.aurelia], groundH, { includePlayer: true });
  const aiVariants: RivalCarVariant[] = ['gt-track', 'exotic-wedge', 'gt-track', 'sport-coupe'];
  let aiVarIdx = 0;
  for (const r of competition.racers) {
    if (r.isPlayer) continue;
    const oppCarId = RACE_OPPONENT_SCAN_IDS[aiVarIdx % RACE_OPPONENT_SCAN_IDS.length];
    const m = makeTrafficOrAiCarMesh(r.paintHex, aiVariants[aiVarIdx++ % aiVariants.length]);
    m.position.copy(r.state.pos);
    m.rotation.y = r.state.yaw;
    aiGroup.add(m);
    aiMeshes.push(m);
    // Upgrade race opponents from placeholder shells to real built high-performance scan cars
    // (Vanguard Apex GT, Ironport Corsair RS, Kestrel Sovereign GT-R) using cached exterior geometry
    void loadScanOpponentCar(oppCarId, r.paintHex).then((realOpp) => {
      if (!m.parent) return;
      while (m.children.length) m.remove(m.children[0]);
      m.add(realOpp);
    }).catch(() => { /* keep sculpted fallback */ });
  }
  stagePath = city ? null : new PathProgress(pts);
}
function finishRun(timeSec: number): void {
  if (!runTracker) return;
  const r = runTracker.take(timeSec, 1, { ...assist });
  const o = garage.recordRun(r);
  const m = o.medal ? `${o.medal} medal` : 'no medal';
  showCard(RUN_NAMES[r.eventId] ?? r.eventId, `${fmtT(timeSec)} · ${m} · ideal line ${fmtT(r.parSec)}`, o);
}
function garageStep(dt: number, s: DriveState, bumped: boolean): void {
  if (s.lock > 0) return;
  const ps = s.ps;
  if (delivery) { delivery.update(dt, { x: s.pos.x, z: s.pos.z, speedMps: Math.abs(ps.forwardSpeed), hit: bumped }, s.yaw); return; }
  if (!runTracker) return;
  runTracker.sample(dt, { x: s.pos.x, z: s.pos.z, speedMps: ps.speedMps, drifting: ps.isDrifting, hit: bumped, wet: wx.cur.wet });
  if (s.circuitId === 'ironport_grand_circuit') {
    if (lap && lap.laps > lastLapCount) {
      lastLapCount = lap.laps;
      const totalLaps = competition?.totalLaps ?? 3;
      const raceLapsDone = lap.laps - raceStartLaps;
      if (lap.last) {
        if (raceLapsDone < totalLaps) {
          // Non-blocking top toast on intermediate laps — never block the screen mid-race!
          showBanner(`LAP ${raceLapsDone}/${totalLaps} · ${fmtT(lap.last)}${lap.best === lap.last ? ' · BEST' : ''}`, lap.best === lap.last ? 'gold' : 'ok', 2400);
        } else if (!stageFinished) {
          stageFinished = true;
          finishRun(lap.best ?? lap.last);
        }
      }
    }
  } else if (stagePath) {
    stagePath.update(s.pos.x, s.pos.z, performance.now() / 1000);
    if (stagePath.done && !stageFinished) { stageFinished = true; finishRun(performance.now() / 1000 - stagePath.t0); }
  }
}
function startDrive(id: string, courier?: 'rookie' | 'pro' | 'legend', pursuitRole?: PursuitRoleChoice): void {
  endCine(true);                                                       // a drive started without a click (gamepad, script) would otherwise be ended by the first key press
  applyActiveCar();
  setMapMode(false);
  playMusic('drive');
  stopFly();
  tween = null;
  const free = id === 'free';
  const c = free ? null : meta.circuits[id];
  // the city circuit starts on the grid, about 40 m behind the line; free roam starts on the coastal highway
  const city = id === 'ironport_grand_circuit';
  const cp = cityPath, cn = cp.length;
  const hw = meta.coastal_highway.xz;
  let p: number[], q: number[];
  if (free && freeSpawn) { p = freeSpawn.p; q = freeSpawn.q; freeSpawn = null; }          // fast travel to a festival site
  else if (free) { p = hw[hw.length - 22]; q = hw[hw.length - 26]; }
  else if (id === 'great_lakes_cliff_raceway' && cliffDesign) { const d = cliffDesign.pts; p = [d[2].x, d[2].z]; q = [d[6].x, d[6].z]; }     // the engineered line, not the raw survey points (up to 14 m off it)
  else { p = city && cn > 8 ? [cp[cn - 8].x, cp[cn - 8].z] : c!.xz[0]; q = city && cn > 8 ? [cp[cn - 7].x, cp[cn - 7].z] : c!.xz[4]; }
  const yaw = Math.atan2(q[0] - p[0], q[1] - p[1]);
  const wantCarId = activeCarId();
  let car: THREE.Group;
  if (driving?.car && driving.car.userData.carId === wantCarId) {
    car = driving.car;
  } else if (prewarmCar && prewarmCar.userData.carId === wantCarId) {
    car = prewarmCar;
  } else {
    if (driving?.car) scene.remove(driving.car);
    car = makeCar(wantCarId);
  }
  prewarmCar = null;
  car.position.set(0, 0, 0);
  if (!car.parent) scene.add(car);
  // never spawn under the drawn road: the cliff raceway's road was raised above its survey heights, and the start countdown holds the car still, so a car started under the
  // asphalt stayed stuck in it, nose down
  const y = Math.max((free ? hAt(p[0], p[1]) : city && cn > 8 ? cp[cn - 8].y : c!.y ? c!.y[0] : hAt(p[0], p[1])) * exag, groundH(p[0], p[1]) + 0.05);
  driving = { lock: 3.6, camDist: 5.8, camH: 1.6, camView: 0, circuitId: id, pos: new THREE.Vector3(p[0], y, p[1]), yaw, sp: 0, lat: 0, steer: 0, car, startPos: new THREE.Vector3(p[0], y, p[1]), startYaw: yaw, camPos: new THREE.Vector3(p[0] - Math.sin(yaw) * 10, y + 4, p[1] - Math.cos(yaw) * 10), hit: 0, ps: createCarState(p[0], y, p[1], yaw) };
  carY = -1e9; carPitch = carRoll = slopePS = slopeRS = 0; setMusicDuck(0.4); gameAudio.ensureStarted(); gameAudio.setPaused(false);
  wx.ensureAudio(); wx.setAudioLevel(engVol); wx.setPaused(false);
  {
    const key = id === 'ironport_grand_circuit' ? 'city' : id === 'great_lakes_cliff_raceway' ? 'cliff' : id === 'pinewood_rally_stage' ? 'rally' : id === IND ? 'ind' : id === HARB ? 'harb' : id === 'superior_range_circuit' ? 'superior' : id === 'escarpment_circuit' ? 'escarpment' : 'free';
    wxPlan = WEATHER_PLAN[key]; wxPlanT = 0; wxPlanI = 0;
    wx.setWeather(wxOverride === 'auto' ? wxPlan[0].w : wxOverride, false, true);
  }
  camera.near = 1.0; camera.far = 22000; camera.updateProjectionMatrix();      // the map view uses a 5 m near plane, which cut the back of the car off at chase distance
  lapReset();
  buildRacingLine(id);
  setupRun(id, courier, pursuitRole);
  replay.clear(); driveClock = 0; camYawOff = 0; camPitchOff = 0; camZoom = 1;
  controls.enabled = false;
  circuitGroup.visible = false;      // the review ribbons are drawn wider than the road
  const route = city && cityPath.length ? cityPath.map((p) => ({ x: p.x, z: p.z })) : (c?.xz ?? []).map((p) => ({ x: p[0], z: p[1] }));
  racingHud.configure(free ? 'Free roam' : c?.name ?? 'Ironport Grand Circuit', route, [meta.coastal_highway.xz.map((p) => ({ x: p[0], z: p[1] })), ...streetRuns.map((r) => r.p.map((p) => ({ x: p[0], z: p[1] })))]);
  labelGroup.visible = false;
  furnitureGroup.traverse((object) => { if (object instanceof THREE.Sprite) object.visible = false; });
  hud.style.display = 'none';
  driveHud.style.display = 'block';
  photoBtn.style.display = 'block';
}
function stopDrive(): void {
  if (!driving) return;
  if (lineMesh) { scene.remove(lineMesh); lineMesh.geometry.dispose(); lineMesh = null; }
  racingLine = null;
  photo.exit(); photoBtn.style.display = 'none';
  teardownRun();
  scene.remove(driving.car);
  driving = null;
  if (simLayer) { simLayer.world.player = null; simLayer.world.takePlayerCalls(); }
  festProg?.quiet(); gameAudio.setPaused(true); setMusicDuck(1); wx.setPaused(true); wxPlan = null; if (wxOverride === 'auto') wx.setWeather('partly', false, true);
  camera.near = 5; camera.far = 80000; camera.updateProjectionMatrix();
  controls.enabled = true;
  circuitGroup.visible = (document.getElementById('tCirc') as HTMLInputElement).checked;
  driveHud.style.display = 'none';
  hud.style.display = '';
  labelGroup.visible = (document.getElementById('tLab') as HTMLInputElement).checked;
  furnitureGroup.traverse((object) => { if (object instanceof THREE.Sprite) object.visible = true; });
  countEl.style.display = 'none';
}
function stepDrive(dt: number): void {
  if (!driving) return;
  const s = driving;
  const locked = s.lock > 0;
  if (trackKit) { if (locked) goClock = 0; else goClock += dt; trackKit.setLights(locked ? 'red' : goClock < 3.5 ? 'green' : 'off'); }
  if (locked) {
    s.lock -= dt;
    const n = Math.ceil(s.lock - 0.5);
    countEl.style.display = 'block';
    countEl.textContent = n > 0 ? String(n) : s.lock > 0 ? 'GO' : '';
    if (s.lock <= 0) countEl.style.display = 'none';
  }
  const pad = driveInput.axes;                                  // controller + touch, analog
  const rawGas = Math.max((keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0, pad.throttle);
  const kUp = !locked && (keys.has('KeyW') || keys.has('ArrowUp')), kDown = !locked && (keys.has('KeyS') || keys.has('ArrowDown'));
  const up = kUp || (!locked && pad.throttle > 0.05), down = kDown || (!locked && pad.brake > 0.05);
  const left = keys.has('KeyA') || keys.has('ArrowLeft'), right = keys.has('KeyD') || keys.has('ArrowRight');
  const hand = keys.has('Space') || pad.handbrake;
  const kSteer = (left ? 1 : 0) - (right ? 1 : 0);
  if (Math.abs(pad.lookX) + Math.abs(pad.lookY) > 0) {            // right stick: free-look
    camYawOff -= pad.lookX * dt * 2.4; camPitchOff = Math.max(-0.12, Math.min(1.1, camPitchOff + pad.lookY * dt * 1.6)); camIdle = 0;
  }
  // ---- the new vehicle model (physics.ts): gears and RPM, supercharger, weight transfer, 4-corner suspension, tyre grip, drift, brake heat ----
  const ps = s.ps;
  if (locked) { ps.vel.set(0, 0, 0); ps.angularVel = 0; }
  // pedals ease in like a foot would: throttle takes about a third of a second to go to the floor, the brake about half, and both lift faster
  // driving assists, as in Forza: brake help ahead of corners the car is too fast for, and a nudge toward the racing line (both off in the Settings, along with the line itself)
  let assistBrake = 0, assistSteer = 0;
  if (racingLine && !locked) {
    const li = racingLine.nearest(s.pos.x, s.pos.z), off = racingLine.offsets(li, s.pos.x, s.pos.z, s.yaw), v = Math.max(0, s.ps.forwardSpeed);
    const gripNow = Math.max(0.3, (1 - 0.24 * roadWater.wetness) * (1 - 0.82 * hydro));
    if (Math.abs(off.lat) < 9) {
      if (assist.brake && v > 9) { const need = racingLine.demand(li, v, gripNow), cap = 9.0 * gripNow; assistBrake = Math.min(1, Math.max(0, (need - cap * 0.78) / (cap * 0.5))) * 0.5; }
      if (assist.steer && v > 6) assistSteer = Math.max(-0.6, Math.min(0.6, off.head * 1.3 - off.lat * 0.06)) * 0.65;
    }
  }
  assistBrakeShown = assistBrake;
  if (racingLine && chevrons && lineMesh?.visible) chevrons.update(racingLine.nearest(s.pos.x, s.pos.z), Math.max(0, s.ps.forwardSpeed), Math.max(0.3, (1 - 0.24 * roadWater.wetness) * (1 - 0.82 * hydro)));
  const thrWant = locked ? 0 : Math.max(kUp ? 1 : 0, pad.throttle) * (1 - assistBrake), brkWant = locked ? 1 : Math.max(kDown ? 1 : 0, pad.brake, assistBrake);
  pedalT += (thrWant - pedalT) * Math.min(1, dt * (thrWant > pedalT ? 3.4 : 8));
  pedalB += (brkWant - pedalB) * Math.min(1, dt * (brkWant > pedalB ? (assistBrake > 0 && brkWant === assistBrake ? 2.6 : 14) : 10));
  const input: CarInput = { throttle: locked ? 0 : pedalT, brake: locked ? 1 : pedalB, steer: (() => { const p = Math.abs(pad.steer) > Math.abs(kSteer) ? pad.steer : kSteer; return Math.max(-1, Math.min(1, p + assistSteer * (1 - Math.abs(p)))); })(), handbrake: hand };
  // Every tyre samples the puddles drawn by the shader. The unloaded side
  // loses contact earlier, and one-sided water drag produces a modest yaw moment.
  let contactGrip = 0, hydroTarget = 0, waterDrag = 0, splitDrag = 0;
  const sy0 = Math.sin(ps.yaw), cy0 = Math.cos(ps.yaw);
  const contacts = [[SOV_SPEC.trackWidth / 2, SOV_SPEC.wheelbase / 2], [-SOV_SPEC.trackWidth / 2, SOV_SPEC.wheelbase / 2], [SOV_SPEC.trackWidth / 2, -SOV_SPEC.wheelbase / 2], [-SOV_SPEC.trackWidth / 2, -SOV_SPEC.wheelbase / 2]];
  contacts.forEach(([ox, oz], i) => {
    const x = ps.pos.x + cy0 * ox + sy0 * oz, z = ps.pos.z - sy0 * ox + cy0 * oz;
    const road = surfaceAtXZ(x, z) === 'asphalt';
    const depth = road ? puddleDepth(x, z, poolLevel) : 0;
    const load = ps.wheelLoadN[i] / Math.max(1, SOV_SPEC.massKg * 9.81 / 4);
    const contact = waterContact(ps.speedMps, roadWater.wetness, depth * poolLevel * 7, load);
    contactGrip += contact.grip / 4;
    hydroTarget += (ps.isAirborne ? 0 : contact.hydro) / 4;
    waterDrag += contact.drag / 4; splitDrag += contact.drag * Math.sign(ox) / 4;
  });
  hydro += (hydroTarget - hydro) * (1 - Math.exp(-dt * (hydroTarget > hydro ? 6 : 3.5)));
  const grip = SOV_SPEC.corneringGrip * Math.min(contactGrip, (1 - 0.24 * (SOV_SPEC.wetSensitivity ?? 1) * roadWater.wetness) * (1 - 0.82 * hydro));
  if (!wxGripSpec || Math.abs(wxGripSpec.corneringGrip - grip) > 0.001 || wxGripSpec.suspension !== SOV_SPEC.suspension) wxGripSpec = { ...SOV_SPEC, corneringGrip: grip };
  if (hydro > 0.3) driveInput.rumble(0, Math.min(0.4, hydro * 0.4), 60);
  {
    // multi-level ground (the freeway trench under its overpasses): the car's own height picks the level it is on. And a step of more than ~1.8 m is a wall (the trench's
    // retaining walls, the overpass parapets): the car is held back instead of being lifted onto the street above or dropped into the cut
    const ox = ps.pos.x, oz = ps.pos.z, oy = ps.pos.y;
    groundYHint = oy;
    stepCarPhysics(ps, wxGripSpec, input, dt, groundH, surfaceAtXZ, []);
    if (trenchHole(ps.pos.x, ps.pos.z) !== trenchHole(ox, oz)) {
      const g = groundH(ps.pos.x, ps.pos.z);
      if (Math.abs(g - oy) > 1.8) { ps.pos.x = ox; ps.pos.z = oz; ps.vel.x *= -0.25; ps.vel.z *= -0.25; s.hit = 0.4; }
    }
    groundYHint = null;
  }
  if (!ps.isAirborne) {
    ps.vel.multiplyScalar(Math.exp(-waterDrag * dt));
    ps.angularVel += Math.max(-0.2, Math.min(0.2, splitDrag * ps.forwardSpeed * 0.1)) * dt;
  }
  // reverse: hold brake at a standstill and the car backs out right away (Forza style), with a sensible top speed in reverse
  if (down && !up && !locked) {
    if (ps.forwardSpeed < 1.5 && ps.forwardSpeed > -13) { const a = 5.2 * dt; ps.vel.x -= Math.sin(ps.yaw) * a; ps.vel.z -= Math.cos(ps.yaw) * a; }
    if (ps.forwardSpeed < -13) { const k = 13 / -ps.forwardSpeed; ps.vel.multiplyScalar(k); }
  }
  if (locked) {
    // Allow live Neutral grid revving during the 3-2-1 countdown so the player hears & feels the engine on the line!
    const idle = SOV_SPEC.engine.idleRpm, red = SOV_SPEC.engine.redlineRpm;
    const revTarget = idle + rawGas * (red - idle);
    const revRate = rawGas > 0.08 ? 11.5 : 4.8;
    ps.rpm += (revTarget - ps.rpm) * (1 - Math.exp(-revRate * dt));
    if (ps.rpm > red - 90 && rawGas > 0.5) ps.rpm = red - 90 - Math.abs(Math.sin(performance.now() * 0.05)) * 180;
    ps.gear = 0;
    ps.prevGear = 1;
    const boostTgt = rawGas * Math.max(0, (ps.rpm - idle) / Math.max(1, red - idle));
    ps.turboBoost += (boostTgt - ps.turboBoost) * (1 - Math.exp(-7 * dt));
  }
  gameAudio.update(ps, SOV_SPEC, locked ? rawGas : input.throttle);          // buildings and barriers are handled below on the real footprints
  if (competition) {
    competition.step(dt, driveClock, groundH, surfaceAtXZ, [], ps, locked);
    let aiIdx = 0;
    for (const r of competition.racers) {
      if (r.isPlayer) continue;
      const m = aiMeshes[aiIdx++];
      if (m) {
        m.position.copy(r.state.pos);
        m.rotation.y = r.state.yaw;
      }
      if (!locked) { const hit = carHit(ps, r.state.pos, r.state.yaw, r.state.vel, 1); if (hit > 3) { r.state.vel.multiplyScalar(0.985); } }
    }
  }
  if (parked && !locked) for (const pc of parked.near(ps.pos.x, ps.pos.z, 7)) carHit(ps, PARKED_P.set(pc.x, ps.pos.y, pc.z), pc.yaw, PARKED_V, 3);   // parked cars are solid
  // the town's traffic (src/sim): in free roam the player's car is a road user like the others. The sim cars are solid, stop behind it and give way to it,
  // the lights change for it, and a red light or stop sign it runs is called out (Settings > Driving, on by default)
  if (simLayer) {
    const free = driving.circuitId === 'free';
    simLayer.world.player = free ? { x: ps.pos.x, z: ps.pos.z, yaw: ps.yaw, v: Math.max(0, ps.forwardSpeed) } : null;
    if (free && !locked) for (const c of simLayer.world.cars) {
      if (Math.abs(c.x - ps.pos.x) > 7 || Math.abs(c.z - ps.pos.z) > 7) continue;
      const hit = carHit(ps, PARKED_P.set(c.x, ps.pos.y, c.z), c.yaw, PARKED_V.set(Math.sin(c.yaw) * c.v, 0, Math.cos(c.yaw) * c.v), c.kind === 'truck' ? 4 : 1.1);
      if (hit > 2) c.v *= 0.3;
    }
    for (const call of simLayer.world.takePlayerCalls()) {
      trafficCalls[call.kind]++;
      if (!(document.getElementById('tTrafficCalls') as HTMLInputElement | null)?.checked || driveClock - lastTrafficCall < 6) continue;
      lastTrafficCall = driveClock;
      showBanner(call.kind === 'red' ? `RAN A RED LIGHT · ${Math.round(call.speed * 2.237)} mph` : `ROLLED A STOP SIGN · ${Math.round(call.speed * 2.237)} mph`, 'bad', 2200);
    }
  }
  if (trafficMgr) {
    trafficMgr.update(dt, ps);
    for (let i = 0; i < trafficMgr.vehicles.length && i < trafficMeshes.length; i++) {
      const tv = trafficMgr.vehicles[i];
      trafficMeshes[i].position.copy(tv.pos);
      trafficMeshes[i].rotation.y = tv.yaw;
      if (!locked) { const hit = carHit(ps, tv.pos, tv.yaw, tv.vel, 1.1); if (hit > 3) { tv.speedMps *= 0.9; } }
    }
  }
  if (challengeMgr) {
    const events = challengeMgr.step(ps, dt);
    if (festProg) { for (const ev of events) festProg.challenge(ev); festProg.step(dt, ps); }
    if (events.length) {
      const ev = events[events.length - 1];
      msg.textContent = `${ev.title} · ${ev.subtitle}`;
    }
  }
  if (pursuitMode) {
    pursuitMode.step(dt, ps, input, groundH, surfaceAtXZ);
    msg.textContent = pursuitMode.statusText;
    if (pursuitMode.playerOnFoot.active) {
      s.pos.copy(pursuitMode.playerOnFoot.pos);
      s.yaw = pursuitMode.playerOnFoot.yaw;
      s.sp = pursuitMode.playerOnFoot.speed;
    }
  }
  if (onlineSession.mode !== 'offline') {
    onlineSession.step(dt, ps, {
      carId: 'kestrel',
      paintHex: 0xc24d12,
      onFoot: pursuitMode?.playerOnFoot.active,
      pursuitRole: pursuitMode?.role,
      lap: (lap?.laps ?? 0) + 1,
    });
    for (const r of onlineSession.remotes.values()) {
      if (!r.mesh) {
        r.mesh = makeTrafficOrAiCarMesh(r.paintHex);
        remoteGroup.add(r.mesh);
      }
      r.mesh.position.copy(r.pos);
      r.mesh.rotation.y = r.yaw;
    }
  }
  s.pos.set(ps.pos.x, ps.pos.y, ps.pos.z);
  s.yaw = ps.yaw;
  s.sp = ps.forwardSpeed; s.lat = ps.lateralSpeed; s.steer = ps.steerInputSmoothed;
  let bumped = false;
  if (collide(s)) { s.sp *= 0.86; s.lat *= 0.7; s.hit = 0.4; bumped = true; }
  if ((s.circuitId === 'ironport_grand_circuit' || s.circuitId === IND || s.circuitId === HARB || s.circuitId === 'great_lakes_cliff_raceway') && barrierCollide(s)) { s.hit = 0.4; bumped = true; }
  else if (s.circuitId !== 'ironport_grand_circuit' && s.circuitId !== IND && s.circuitId !== HARB && s.circuitId !== 'great_lakes_cliff_raceway' && freeRoamBarrierHit(s)) { s.hit = 0.4; bumped = true; }
  else if (scenicRailHit(s)) { s.hit = 0.4; bumped = true; }
  if (bumped) driveInput.rumble(0.9, 0.7, 220);
  else if (ps.isDrifting) driveInput.rumble(0.0, 0.25, 60);
  garageStep(dt, s, bumped);
  s.hit = Math.max(0, s.hit - dt);
  const lim = meta.width * meta.mpp / 2 - 80, limz = meta.height * meta.mpp / 2 - 80;
  s.pos.x = Math.max(GRID.ox - lim, Math.min(GRID.ox + lim, s.pos.x));
  s.pos.z = Math.max(GRID.oz - limz, Math.min(GRID.oz + limz, s.pos.z));
  // in the water (not on a bridge deck over it): back to the start
  if (hAt(s.pos.x, s.pos.z) < -1.5 && ps.pos.y < 1) { s.pos.copy(s.startPos); s.yaw = s.startYaw; s.sp = 0; s.lat = 0; bumped = true; }
  if (bumped) {                                  // hand the corrected position and speeds back to the physics state
    ps.pos.x = s.pos.x; ps.pos.z = s.pos.z; ps.yaw = s.yaw;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    ps.vel.x = sy * s.sp + cy * s.lat; ps.vel.z = cy * s.sp - sy * s.lat;
  }
  s.pos.y = ps.pos.y;
  const nfx = Math.sin(s.yaw), nfz = Math.cos(s.yaw), nlx = Math.cos(s.yaw), nlz = -Math.sin(s.yaw);
  // ground contact: sample the terrain under the four wheels, fit a plane for the body, then lift the car so the highest wheel point still sits on the surface
  const HW = 1.48, HT = 0.81;                                  // half wheelbase and half track of the Sovereign model
  const wg = (ox: number, oz: number): number => groundH(s.pos.x + nlx * ox + nfx * oz, s.pos.z + nlz * ox + nfz * oz);
  const gFL = wg(HT, HW), gFR = wg(-HT, HW), gRL = wg(HT, -HW), gRR = wg(-HT, -HW);
  const mean = (gFL + gFR + gRL + gRR) / 4;
  const slopeP = ((gFL + gFR) - (gRL + gRR)) / 2 / (2 * HW), slopeR = ((gFL + gRL) - (gFR + gRR)) / 2 / (2 * HT);
  const lift = Math.max(0, gFL - (mean + slopeP * HW + slopeR * HT), gFR - (mean + slopeP * HW - slopeR * HT), gRL - (mean - slopeP * HW + slopeR * HT), gRR - (mean - slopeP * HW - slopeR * HT));
  const yWant = (ps.isAirborne ? ps.pos.y : mean + lift) + 0.02;
  carY = carY < -1e8 || Math.abs(carY - yWant) > 1.5 ? yWant : carY + (yWant - carY) * Math.min(1, dt * 22);
  s.car.position.set(s.pos.x, carY, s.pos.z);
  s.car.rotation.order = 'YXZ';
  s.car.rotation.y = s.yaw;
  // the body follows the road slope and the suspension, both low-passed so ground noise and spring ringing do not read as bouncing
  slopePS += (slopeP - slopePS) * Math.min(1, dt * 14); slopeRS += (slopeR - slopeRS) * Math.min(1, dt * 14);
  carPitch += (ps.pitch * 0.7 - carPitch) * Math.min(1, dt * 7); carRoll += (ps.roll * 0.5 - carRoll) * Math.min(1, dt * 7);
  s.car.rotation.x = -Math.atan(slopePS) + carPitch;
  s.car.rotation.z = Math.atan(slopeRS) + carRoll;
  const brakeAmt = Math.max(input.brake, hand ? 0.85 : 0);
  const wetNightAmt = Math.min(1, wx.cur.wet * 0.85 + (NIGHT_K[todKey] ?? 0) * 1.15);
  (s.car.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void) | undefined)?.(
    s.sp, ps.steerAngle, dt, wetNightAmt > 0.25, brakeAmt, wetNightAmt
  );
  // spray and mist off the four tyres: more from deep water, more at speed, a little from any wet road
  if (!ps.isAirborne && !locked) {
    const sy1 = Math.sin(s.yaw), cy1 = Math.cos(s.yaw), spdH = Math.hypot(ps.vel.x, ps.vel.z), road = surfaceAtXZ(s.pos.x, s.pos.z) === 'asphalt';
    const wetBase = road ? wx.cur.wet * 0.42 : wx.cur.wet * 0.12;
    for (const [ox, oz, bigK] of [[0.81, 1.48, 0.0], [-0.81, 1.48, 0.0], [0.82, -1.59, 0.4], [-0.82, -1.59, 0.4]]) {
      const x = s.pos.x + cy1 * ox + sy1 * oz, z = s.pos.z - sy1 * ox + cy1 * oz;
      const pd = road ? puddleDepth(x, z, poolLevel) : 0;
      spray.wheel(dt, x, groundH(x, z), z, ps.vel.x, ps.vel.z, spdH, Math.max(wetBase, pd), Math.min(1.4, pd + bigK * (pd > 0.1 ? 1 : 0.4)));
      // dust and clods off anything loose: a rally road throws the most, sand and grass less, and wet ground turns to mud that stays down
      const sf = surfaceAtXZ(x, z), loose = sf === 'gravel' ? 1 : sf === 'sand' ? 0.6 : sf === 'grass' ? 0.35 : 0;
      if (loose > 0) dust.wheel(dt, x, groundH(x, z), z, ps.vel.x, ps.vel.z, spdH, loose * (1 - 0.65 * wx.cur.wet), Math.abs(ps.lateralSpeed) / Math.max(spdH, 4) + (ps.isDrifting ? 0.5 : 0), bigK + 0.4);
    }
  }
  // chase camera
  // free-look: drag with the mouse to orbit the car, wheel to zoom, hold B to look back; it eases home after a moment
  if (replay.n === 0 || !locked) replay.record(driveClock += dt, s.pos.x, s.car.position.y, s.pos.z, s.yaw, s.car.rotation.x, s.car.rotation.z, s.sp, s.steer, s.hit > 0 ? 1 : 0, s.lat);
  camIdle += dt;
  const dragging = camIdle < 1.4;
  if (lookBack) camYawOff += (Math.PI - camYawOff) * Math.min(1, dt * 8);
  else if (!dragging) { camYawOff += (Math.round(camYawOff / (Math.PI * 2)) * Math.PI * 2 - camYawOff) * Math.min(1, dt * 2.5); camPitchOff += (0 - camPitchOff) * Math.min(1, dt * 2.5); }
  // Forza-style views: 0 near chase, 1 far chase, 2 hood, 3 dash, 4 first person (the driver's eyes). Chase views sit at a fixed length behind the car;
  // the others are fixed to the car body and look along it, with mouse free-look on top.
  const view = s.camView;
  // depth precision: the road ribbon sits 7 cm above the painted road under it, and that only holds apart if the near plane is as far out as it can be (1 m in the chase views; the
  // car is never that close), with the far plane no further than the horizon needs. A 0.35 m near and 30 km far made road, kerb and ground flicker into each other past about 500 m.
  const nearWant = view >= 2 ? 0.05 : 1.0;
  if (camera.near !== nearWant) { camera.near = nearWant; camera.updateProjectionMatrix(); }
  const driverObj = s.car.getObjectByName('driver');
  if (driverObj) driverObj.visible = view !== 4;                 // no helmet in front of the driver's own eyes
  if (view < 2) {
    const ca = s.yaw + camYawOff;
    const cdist = s.camDist * camZoom;                           // fixed distance behind the car
    const want = new THREE.Vector3(s.pos.x - Math.sin(ca) * cdist * Math.cos(camPitchOff), s.car.position.y + s.camH * camZoom + Math.sin(camPitchOff) * cdist, s.pos.z - Math.cos(ca) * cdist * Math.cos(camPitchOff));
    s.camPos.x = want.x; s.camPos.z = want.z;
    s.camPos.y += (want.y - s.camPos.y) * Math.min(1, dt * 10);
    const fovWant = 54 + 16 * Math.min(1, Math.abs(ps.speedMps) / 70);
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    const ch = groundH(s.camPos.x, s.camPos.z) + 0.9;
    if (s.camPos.y < ch) s.camPos.y = ch;
    camera.position.copy(s.camPos);
    const ahead = 9 * Math.max(0, 1 - Math.abs(camYawOff) / 0.5);
    camera.lookAt(s.pos.x + nfx * ahead, s.car.position.y + 0.95, s.pos.z + nfz * ahead);
  } else {
    const LOC: [number, number, number][] = [[0, 1.16, 0.95], [0.4, 1.03, 0.14], [0.4, 1.1, -0.36]];     // hood, dash, driver's eyes in the car frame
    const FOV = [66, 74, 78];
    s.car.updateMatrixWorld(true);
    const p = new THREE.Vector3(...LOC[view - 2]);
    s.car.localToWorld(p);
    s.camPos.copy(p);
    camera.position.copy(p);
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);          // the car faces +z, a camera looks down -z
    const free = new THREE.Quaternion().setFromEuler(new THREE.Euler(-camPitchOff * 0.8 - 0.04, camYawOff, 0, 'YXZ'));
    camera.quaternion.copy(s.car.quaternion).multiply(flip).multiply(free);
    const fovWant = FOV[view - 2] + 6 * Math.min(1, Math.abs(ps.speedMps) / 70);
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }
  const lapTxt = s.circuitId === 'ironport_grand_circuit' ? lapStep(s.pos.x, s.pos.z, performance.now() / 1000) + '<br>' : '';
  racingHud.update(dt, { speed: ps.forwardSpeed, rpm: ps.rpm, redline: SOV_SPEC.engine.redlineRpm, gear: ps.forwardSpeed < -0.5 ? -1 : ps.gear, gears: SOV_SPEC.gearRatios.length, shift: ps.shiftTimer > 0, x: ps.pos.x, z: ps.pos.z, yaw: ps.yaw, throttle: locked ? rawGas : input.throttle, brake: input.brake, rain: wx.cur.rain, wetness: roadWater.wetness, hydro, drift: ps.isDrifting, collision: s.hit > 0, assist: assistBrakeShown > 0.25, lapHtml: lapTxt, mode: VIEW_NAMES[s.camView], touch: driveInput.touchMode });
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyK' && driving && !replay.active) { e.preventDefault(); photo.toggle(); return; }
  if (replay.active) { if (replay.key(e.code)) { e.preventDefault(); if (!replay.active && driving) { driveHud.style.display = 'block'; s2cam(); gameAudio.setPaused(false); } } return; }
  if (!driving) return;
  if (e.code === 'KeyP') { if (replay.start()) { driveHud.style.display = 'none'; countEl.style.display = 'none'; gameAudio.setPaused(true); } return; }
  if (e.code === 'KeyB') { lookBack = true; return; }
  if (e.code === 'KeyL') { assist.line = !assist.line; saveAssist(); const cb = document.getElementById('tLine') as HTMLInputElement | null; if (cb) cb.checked = assist.line; return; }
  if (e.code === 'Escape') { preset('overview'); return; }
  if (e.code === 'KeyR') { driving.pos.copy(driving.startPos); driving.yaw = driving.startYaw; driving.sp = 0; driving.lat = 0; driving.ps = createCarState(driving.startPos.x, driving.startPos.y, driving.startPos.z, driving.startYaw); lapReset(); return; }
  if (e.code === 'KeyC' || /^Digit[1-5]$/.test(e.code)) {
    const V = [[5.8, 1.6], [8.6, 2.6]];
    driving.camView = e.code === 'KeyC' ? (driving.camView + 1) % 5 : Number(e.code.slice(5)) - 1;
    if (driving.camView < 2) { driving.camDist = V[driving.camView][0]; driving.camH = V[driving.camView][1]; }
    camYawOff = 0; camPitchOff = 0; driveViewShown = performance.now();
    return;
  }
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyB') lookBack = false; });
// a key still "held" when the window loses focus (alt-tab, a click elsewhere) would otherwise keep driving the car on its own
addEventListener('blur', () => { keys.clear(); lookBack = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); lookBack = false; } });
// after a replay the chase camera starts from wherever the replay left it; snap it behind the car
function s2cam(): void { if (driving) driving.camPos.copy(camera.position); }

// ---------- boot ----------
async function boot(): Promise<void> {
  const [m, buf] = await Promise.all([
    fetch(BASE + 'region.json').then((r) => r.json()) as Promise<RegionMeta>,
    fetch(BASE + 'height.f32').then((r) => r.arrayBuffer()),
  ]);
  meta = m;
  countryNet = await fetch(BASE + 'country_roads.json').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  {
    // roads traced from the satellite that run through or beside the cliff raceway (long straight pieces that join nothing, with a bridge or two where they cross a creek) are not part of the
    // modelled map: the raceway is a closed circuit with its own road and bridges, and nothing else should cut across it
    const cc = meta.circuits.great_lakes_cliff_raceway;
    if (cc && countryNet) {
      const tr = cc.xz as number[][];
      const near = (r: { xz: number[][] }): boolean => {
        for (let i = 0; i < r.xz.length - 1; i++) {
          const a = r.xz[i], b = r.xz[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 50));
          for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; for (let j = 0; j < tr.length; j += 3) if (Math.hypot(tr[j][0] - x, tr[j][1] - z) < 700) return true; }
        }
        return false;
      };
      const before = countryNet.roads.length;
      countryNet.roads = countryNet.roads.filter((r) => !near(r));
      console.log('country roads near the cliff raceway removed:', before - countryNet.roads.length);
    }
  }
  for (const f of ['farbank_streets.json', 'user_streets.json']) { const fb = await fetch(BASE + f).then((x) => (x.ok ? x.json() : null)).catch(() => null); if (fb && f === 'user_streets.json') for (const r of fb.roads) r.town = true; if (fb && countryNet) countryNet.roads.push(...fb.roads); else if (fb) countryNet = fb; }
  { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push({ kind: 'paved', xz: meta.coastal_highway.xz, half: 6.4 }, { kind: 'paved', xz: meta.freeway.xz, half: 10 }); }
  userMap = await fetch(BASE + 'user_map.json?t=' + Date.now()).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (userMap) {
    const roads = userMap.features.filter((f) => f.type === 'road' && f.kind !== 'creek' && f.pts.length >= 2).map((f) => ({ kind: (f.kind === 'dirt' ? 'dirt' : 'paved') as 'paved' | 'dirt', xz: f.pts, half: ROAD_STYLE[f.kind as RoadKind].half }));
    if (roads.length) { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push(...roads); }
  }
  {
    const ind = await fetch(BASE + 'industrial_circuit.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { name: string; kind: string; xz: number[][]; grade?: GradeFeature[] } | null;
    // the new Ironworks (North Harbor Circuit II, tools/plan_ironworks_v2.py): tighter corners than the old route, so a 16 m rounding radius
    if (ind && ind.xz.length > 6) { const sm = smoothClosedPath(ind.xz, undefined, ind.grade ? 16 : 26, 6); meta.circuits[IND] = { name: ind.name, kind: 'road_course', xz: sm.xz } as typeof meta.circuits[string]; industrialGrade = ind.grade ?? []; if ((ind as { sectors?: Record<string, number[]> }).sectors) industrialRaw = { xz: ind.xz, sectors: (ind as unknown as { sectors: Record<string, number[]> }).sectors }; }
    // the Harbor District Street Circuit on the north coast (tools/plan_harbor_circuit.py)
    const hb = await fetch(BASE + 'harbor_circuit.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { name: string; xz: number[][]; sectors?: Record<string, number[]> } | null;
    if (hb && hb.xz.length > 6) { const sm = smoothClosedPath(hb.xz, undefined, 16, 6); meta.circuits[HARB] = { name: hb.name, kind: 'road_course', xz: sm.xz } as typeof meta.circuits[string]; if (hb.sectors) harborRaw = { xz: hb.xz, sectors: hb.sectors }; }
  }
  portData = await fetch(BASE + 'port_district.json').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  { const dw = await fetch(BASE + 'driveways.json').then((x) => (x.ok ? x.json() : null)).catch(() => null); if (dw) { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push(...dw.roads); } }
  parkingData = await fetch(BASE + 'parking_lots.json').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  // no parking lot on a race course (its surface stood up to 2.3 m over the new Ironworks): a lot whose rectangle touches a course is left out, before its pad is graded
  if (parkingData) parkingData = (parkingData as number[][]).filter((l) => { const c = Math.cos(l[4] ?? 0), sn = Math.sin(l[4] ?? 0); for (const [u, v] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]]) { const lx = u * l[2], lz = v * l[3]; if (onCourse(l[0] + lx * c + lz * sn, l[1] - lx * sn + lz * c, 1)) return false; } return true; });
  utilData = await fetch(BASE + 'utilities.json').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  { const us2 = await fetch(BASE + 'utility_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null); if (us2) { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push(...us2.roads); } }
  { const ps = await fetch(BASE + 'port_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null); if (ps) { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push(...ps.roads); } }
  shoreHw = await fetch(BASE + 'shoreline_highway.json').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  heights = new Float32Array(buf);
  if (!location.search.includes('hires=0')) {
    const h2 = await fetch(BASE + 'height2.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { w: number; h: number; mpp: number; min: number; max: number; ox?: number; oz?: number } | null;
    const raw = h2 ? await fetch(BASE + 'height2.u16').then((x) => (x.ok ? x.arrayBuffer() : null)).catch(() => null) : null;
    if (h2 && raw && raw.byteLength === h2.w * h2.h * 2) {
      const u = new Uint16Array(raw), f = new Float32Array(u.length), k = (h2.max - h2.min) / 65535;
      for (let i = 0; i < u.length; i++) f[i] = h2.min + u[i] * k;
      heights = f; meta.width = h2.w; meta.height = h2.h; meta.mpp = h2.mpp; hiRes = true;
      GRID.ox = h2.ox ?? 0; GRID.oz = h2.oz ?? 0;                                  // the grid's centre in the world (the map grew north: oz < 0)
    }
  }
  if (shoreHw) carveShoreline(heights, meta.width, meta.height, meta.mpp, shoreHw);
  carveRiverReaches(heights, meta.width, meta.height, meta.mpp);                // the satellite's baked bridge strips come out of the river
  if (countryNet) {                                                                 // the freeway crosses the river on the Halcyon Gateway, not on a low deck of its own beside it
    const fw = countryNet.roads.findIndex((r) => r.xz === meta.freeway.xz);
    if (fw >= 0) { const r = countryNet.roads[fw]; let pcs = routeOverBridges(r.xz, (x, z) => hAt(x, z));
      {
        // where the freeway runs down into the depressed downtown system (trench.json, its regional ramp included) the trench bed is the road: the draped ribbon stops
        // where the trench gets deeper than 0.3 m
        const tj = await fetch(BASE + 'trench.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { lines: { xz: number[][]; half: number; depth: number[] }[] } | null;
        const deep = corridor((tj?.lines ?? []).map((l) => ({ xz: l.xz.filter((_, i) => l.depth[i] > 0.3), r: l.half + 3 })).filter((l) => l.xz.length > 1));
        const cut: number[][][] = [];
        for (const pc of pcs) { let run: number[][] = []; for (const p of pc) { if (deep(p[0], p[1])) { if (run.length > 1) cut.push(run); run = []; } else run.push(p); } if (run.length > 1) cut.push(run); }
        pcs = cut;
      }
      if (pcs.length > 1) for (let q = 0; q < pcs.length; q++) {                     // grade the joining curves like the approaches (5 %, cut and embankment)
        if (q > 0) gradeFromFoot(heights, meta.width, meta.height, meta.mpp, pcs[q], r.half ?? 10);
        if (q < pcs.length - 1) gradeFromFoot(heights, meta.width, meta.height, meta.mpp, [...pcs[q]].reverse(), r.half ?? 10);
      } countryNet.roads.splice(fw, 1, ...pcs.map((xz) => ({ ...r, xz }))); }
  }
  if (portData) carvePlatform(heights, meta.width, meta.height, meta.mpp, portData);
  if (utilData) carvePlatform(heights, meta.width, meta.height, meta.mpp, { platform: utilData.platform } as PortData);
  {
    // the simulation layer: plan the rails and the airfield on the ground as it is, then grade the ground for them
    const cityRuns = await fetch(BASE + 'city_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { c: string; p: number[][] }[] | null;
    const tall = await fetch(BASE + 'city.json').then((x) => (x.ok ? x.json() : null)).then((d: { items: CityItem[] } | null) => (d?.items ?? []).filter((i) => i.h >= 30).map((i) => [i.x, i.z] as [number, number])).catch(() => [] as [number, number][]);   // downtown, for the junction control
    simPlan = planSim(userMap as unknown as UserMapData | null, { country: countryNet ? [countryNet] : [], city: cityRuns ?? [], shoreline: shoreHw }, (x, z) => hAt(x, z), tall);
    carveSim(simPlan, heights, meta.width, meta.height, meta.mpp);
  }
  carveCreek(heights, meta.width, meta.height, meta.mpp);
  {
    // flat graded pads under every large building and parking lot (pads.ts); houses sit on their small lots as the ground lies
    const cj = await fetch(BASE + 'city.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { items: CityItem[] } | null;
    const pads: Pad[] = [];
    for (const it of cj?.items ?? []) if (Math.max(it.w, it.d) >= 24) pads.push({ x: it.bx ?? it.x, z: it.bz ?? it.z, w: it.w, d: it.d, rot: it.rotY });   // w, d are the world footprint (as groundMin reads them)
    for (const l of (parkingData ?? []) as number[][]) pads.push({ x: l[0], z: l[1], w: l[2], d: l[3], rot: l[4] });
    festivalData = await fetch(BASE + 'festival.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as FestivalData | null;
    // every Chora Fest stage has a gravel access track from the nearest road (tools/plan_festival.py); they join the country-road network
    if (festivalData?.access?.length) { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push(...festivalData.access.map((r) => ({ kind: 'dirt' as const, xz: r.xz, half: r.half }))); }
    for (const st of festivalData?.sites ?? []) { const k = st.kind === 'main' ? 1.6 : 1; pads.push({ x: st.x, z: st.z, w: 70 * k, d: 70 * k, rot: 0 }); }   // a graded pad under every festival stage and its crowd area
    console.log('graded pads', carvePads(heights, meta.width, meta.height, meta.mpp, pads));
  }
  scenicData = ((await fetch(BASE + 'scenic_roads.json').then((x) => (x.ok ? x.json() : null)).catch(() => null)) as { roads: ScenicRoad[] } | null)?.roads ?? [];
  roadHash = null;                                                                     // rebuilt with the scenic roads in it (tree and grass clearance)
  const scenicFlat = carveScenicRoads(heights, meta.width, meta.height, meta.mpp, scenicData);     // the scenic roads are graded to their own banked design
  {
    // the car physics' world edges follow the height grid (it grew 10.2 km north; the old fixed bounds snapped every car north of z -5550 back onto the lake)
    const hx = meta.width * meta.mpp / 2 - 60, hz = meta.height * meta.mpp / 2 - 60;
    setWorldBounds(GRID.ox - hx, GRID.ox + hx, GRID.oz - hz, GRID.oz + hz);
  }
  {
    // the Superior Range Circuit: a closed lap made of two designed roads. North on the Superior Coast Highway along the cliffs and over the fjord bridges, back
    // south over Glacier Pass (the saddle between the glaciated peaks, 430 m), down through the giant forest to the junction. The grid sits on the highway 60 m
    // north of the junction, so the lap ends after the forest descent.
    const hw = scenicData.find((r) => r.name === 'Superior Coast Highway'), gp = scenicData.find((r) => r.name === 'Glacier Pass');
    if (hw && gp) {
      const j0 = gp.xz[0];
      let j = 0, best = 1e18;
      hw.xz.forEach((p, i) => { const d = (p[0] - j0[0]) ** 2 + (p[1] - j0[1]) ** 2; if (d < best) { best = d; j = i; } });
      const g = Math.min(hw.xz.length - 1, j + 15);
      const xz = [...hw.xz.slice(g), ...gp.xz.slice(0, -1).reverse(), ...hw.xz.slice(j, g + 1)];
      const y = [...hw.y.slice(g), ...gp.y.slice(0, -1).reverse(), ...hw.y.slice(j, g + 1)];
      meta.circuits.superior_range_circuit = { name: 'Superior Range Circuit', kind: 'road', xz, y };
    }
  }
  {
    // the Escarpment Circuit, on roads of its own (none shared with the Superior Range Circuit): from the grid on Finger Lake Loop's east shore north over the
    // lake-head bridge and down the west shore to the junction, the Escarpment Road up the Stair (six legs, five hairpins on the talus apron), the Escarpment
    // Crest Road east along the skyline, over the notch viaduct, down the eastern gap and across the foothills back to the east shore.
    const fl = scenicData.find((r) => r.name === 'Finger Lake Loop'), er = scenicData.find((r) => r.name === 'Escarpment Road'), cr = scenicData.find((r) => r.name === 'Escarpment Crest Road');
    if (fl && er && cr) {
      const near = (pts: number[][], p: number[]) => { let k = 0, best = 1e18; pts.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < best) { best = d; k = i; } }); return k; };
      const jE = near(fl.xz, er.xz[0]), jC = near(fl.xz, cr.xz[cr.xz.length - 1]), b = near(er.xz, cr.xz[0]), g = jC - 20;   // the grid: 80 m up the shore from the T
      const rev = <T,>(a: T[]) => a.slice().reverse();
      const xz = [...rev(fl.xz.slice(jE, g + 1)), ...er.xz.slice(1, b + 1), ...cr.xz.slice(1), ...rev(fl.xz.slice(g, jC))];
      const y = [...rev(fl.y.slice(jE, g + 1)), ...er.y.slice(1, b + 1), ...cr.y.slice(1), ...rev(fl.y.slice(g, jC))];
      meta.circuits.escarpment_circuit = { name: 'Escarpment Circuit', kind: 'road', xz, y };
    }
  }
  {
    // the road grade pass (roadGrade.ts): every highway and street gets a designed vertical profile (5 % freeways, 6 % highways and arterials, 8 % streets) and the
    // ground is cut or built up to it; the sunken freeway, the bridge approaches, the shoreline highway and the cliff raceway keep their own grading
    const td = await fetch(BASE + 'trench.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { lines: { xz: number[][]; half: number }[] } | null;
    const cc = meta.circuits.great_lakes_cliff_raceway as { xz?: number[][] } | undefined;
    const locked = corridor([
      ...(td?.lines ?? []).map((l) => ({ xz: l.xz, r: l.half + 8 })),
      ...bridgeCorridors((x, z) => hAt(x, z)),
      ...(shoreHw ? [{ xz: shoreHw.xz, r: 30 }] : []),
      ...(cc?.xz ? [{ xz: cc.xz, r: 30 }] : []),
      ...scenicCorridors(scenicData),
    ]);
    const roads: GradeRoad[] = [];
    // the Ironport Grand Circuit first, as one continuous road (graded with the highways, ahead of the streets it runs along): graded street by street it got a step
    // at every joint where one street's profile met the next one's already-fixed bed (up to 1 m in 2 m); the cross streets now join the circuit's bed instead
    // the Ironworks Industrial Circuit the same way (its line is already smoothed when loaded; 7.2 m half width)
    const gc = meta.circuits.ironport_grand_circuit as { xz?: number[][]; y?: number[] } | undefined;
    if (gc?.xz && gc.xz.length > 3) { const sm = smoothClosedPath(gc.xz, gc.y, 12, 6).xz; roads.push({ xz: [...sm, sm[0]], half: 6, cls: 'highway' }); }
    const gi = meta.circuits[IND] as { xz?: number[][] } | undefined;
    if (gi?.xz && gi.xz.length > 3) roads.push({ xz: [...gi.xz, gi.xz[0]], half: 7.5, cls: 'highway' });
    const gh = meta.circuits[HARB] as { xz?: number[][] } | undefined;
    if (gh?.xz && gh.xz.length > 3) roads.push({ xz: [...gh.xz, gh.xz[0]], half: 7.5, cls: 'highway' });
    // the Pinewood Rally Stage as a gravel lane (12 % at most): graded after the paved roads, it eases into their beds where it crosses them instead of dropping
    // into the cutting (a 0.76 m dip at 33 % where it crossed the paved road at -1117, -3571) and takes the steepest pitches off the hillsides it runs over
    const gr = meta.circuits.pinewood_rally_stage as { xz?: number[][] } | undefined;
    if (gr?.xz && gr.xz.length > 3) roads.push({ xz: gr.xz, half: 4, cls: 'lane' });
    const W8 = { street: 8.5, arterial: 14, freeway: 12.5, ramp: 5.5 } as Record<string, number>;
    const runs = await fetch(BASE + 'city_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { c: string; p: number[][] }[] | null;
    for (const r of runs ?? []) roads.push({ xz: r.p, half: (W8[r.c] ?? 8.5) / 2, cls: r.c === 'freeway' ? 'freeway' : r.c === 'street' ? 'street' : 'highway' });
    for (const r of countryNet?.roads ?? []) {
      const rr = r as { kind: string; xz: number[][]; half?: number; trail?: boolean; driveway?: boolean; town?: boolean };
      const cls: GradeClass = rr.kind === 'drive' ? 'drive' : rr.kind === 'dirt' || rr.trail ? 'lane' : rr.half === 10 ? 'freeway' : rr.xz === meta.coastal_highway.xz ? 'highway' : rr.town ? 'street' : 'rural';
      roads.push({ xz: rr.xz, half: rr.half ?? 3.6, cls });
    }
    const st = gradeRoads(heights, meta.width, meta.height, meta.mpp, roads, locked, scenicFlat);   // no later road reshapes the ground under a scenic road
    // the new Ironworks leaves the ground twice: over the Port Branch on a bridge, under it in a cutting. Its design heights come from the graded ground, then
    // the cutting is dug (the rail keeps the height it was planned at and crosses on its own bridge)
    if (gi?.xz && industrialGrade.length) {
      const pts = gi.xz.map((q) => ({ x: q[0], z: q[1] }));
      industrialYs = industrialProfile(pts, industrialGrade, (x, z) => hAt(x, z));
      console.log('ironworks cutting cells', carveIndustrialCutting(heights, meta.width, meta.height, meta.mpp, GRID.ox, GRID.oz, pts, industrialYs, (x, z) => hAt(x, z)));
    }
    // the harbour circuit's piers and wharf stand out over the water: its road never goes below 3.6 m (a deck on piers there) and no grade passes 10 %
    if (gh?.xz) harborYs = industrialProfile(gh.xz.map((q) => ({ x: q[0], z: q[1] })), [], (x, z) => hAt(x, z));
    console.log('road grade pass', st);
    (window as unknown as { roadGrade: unknown }).roadGrade = st;
  }
  {
    const cc = meta.circuits.great_lakes_cliff_raceway;
    if (cc) { cliffDesign = designCliffTrack(cc as { xz: number[][]; y?: number[]; tunnel?: { from: number; to: number } }); carveCliffRaceway(heights, meta.width, meta.height, meta.mpp, cliffDesign); cliffIx = indexTrack(cliffDesign); (window as unknown as { cliffDesign: unknown }).cliffDesign = cliffDesign; }
  }
  buildTerrain();
  buildOverlays();
  buildFurniture();
  preset('overview');
  tweenOn = true;
  setTimeOfDay('golden');
  msg.remove();
  buildStreets().catch((e) => console.error('streets failed', e));
  buildForest().catch((e) => console.error('forest failed', e));
  loadHarbor().catch((e) => console.error('harbor failed', e));
  buildCity().catch((e) => console.error('city failed', e));
  buildTrenchLayer().catch((e) => console.error('trench failed', e));
  loadGroundArrays().catch((e) => console.error('ground materials failed', e));
  fetch(BASE + 'yards.json').then((x) => (x.ok ? x.json() : null)).then((y) => { if (y) furnitureGroup.add(buildYards(keepYardsOffCourse(y), (x, z) => meshH(x, z))); }).catch(() => undefined);
  mapEditor = createMapEditor({
    scene, camera, dom: renderer.domElement, terrain: () => terrain, ground: (x, z) => meshH(x, z),
    topView: () => { const t = controls.target; look(new THREE.Vector3(t.x, Math.max(2500, camera.position.distanceTo(t)), t.z + 1), t.clone()); },
  });
  mapEditor.load(userMap ?? { version: 1, features: [] });
  (window as any).refScenes = REF_SCENES;
  (window as any).coursePaths = () => ({ ironport_grand_circuit: cityPath, great_lakes_cliff_raceway: cliffPathPts, ironworks_industrial_circuit: industrialPath, harbor_district_circuit: harborPath });   // the lines the circuits are built on (scripts/apex-probe-circuits.mjs)
  (window as any).cineJump = (i: number) => { if (!cineOn) startCine(); cineIdx = i % cineShots.length; cineT = 1.2; };
  (window as any).vegStats = () => vegetation?.stats;
  (window as any).simDebug = () => ({ cars: simLayer?.world.cars ?? [], trafficCalls, signals: simLayer?.world.signals, surf: surfaceAtXZ, meshH, graph: simLayer?.world.graph });
  (window as any).regionViewer = { debug: () => ({ cityItems, cityPath }), wx, scene, terrain: () => terrain, furniture: () => furnitureGroup, groundH, meshH, lap: () => lap, preset, startFly, stopFly, hAt, camera, controls, meta, csm, renderer, warmShaders, audio: gameAudio, cam: (x?: number, y?: number, z?: number, tx?: number, ty?: number, tz?: number) => { dbgCam = x === undefined ? null : { pos: new THREE.Vector3(x, y!, z!), at: new THREE.Vector3(tx!, ty!, tz!) }; }, setPool: (v: number) => { poolLevel = v; }, hydro: () => hydro, startDrive, stopDrive, keys, drive: () => driving, delivery: () => delivery, garage };
}

document.querySelectorAll<HTMLButtonElement>('button[data-cam]').forEach((b) => b.addEventListener('click', () => preset(b.dataset.cam!)));
document.getElementById('fly')!.addEventListener('click', () => startFly('great_lakes_cliff_raceway'));
document.getElementById('flycity')!.addEventListener('click', () => startFly('ironport_grand_circuit'));
document.getElementById('stop')!.addEventListener('click', () => { stopFly(); stopDrive(); });
document.getElementById('drivecity')!.addEventListener('click', () => startDrive('ironport_grand_circuit'));
document.getElementById('drivecliff')!.addEventListener('click', () => startDrive('great_lakes_cliff_raceway'));
document.getElementById('driverally')!.addEventListener('click', () => startDrive('pinewood_rally_stage'));
{
  const toggle = document.getElementById('tLensRain') as HTMLInputElement;
  try { lensRain.enabled = localStorage.getItem('apex.lensRain') !== 'off'; } catch { /* storage unavailable */ }
  toggle.checked = lensRain.enabled;
  toggle.addEventListener('change', () => { lensRain.enabled = toggle.checked; try { localStorage.setItem('apex.lensRain', toggle.checked ? 'on' : 'off'); } catch { /* storage unavailable */ } });
}
(document.getElementById('tCirc') as HTMLInputElement).addEventListener('change', (e) => { circuitGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tHar') as HTMLInputElement).addEventListener('change', (e) => { harborGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tod') as HTMLSelectElement).addEventListener('change', (e) => setTimeOfDay((e.target as HTMLSelectElement).value));
(document.getElementById('tFx') as HTMLInputElement).addEventListener('change', (e) => { fxOn = (e.target as HTMLInputElement).checked; });
(document.getElementById('engVol') as HTMLInputElement).value = String(engVol);
(document.getElementById('engVol') as HTMLInputElement).addEventListener('input', (e) => { engVol = parseFloat((e.target as HTMLInputElement).value); gameAudio.setLevel(engVol); try { localStorage.setItem('apex.engVol', String(engVol)); } catch { /* storage blocked */ } });
(document.getElementById('wxsel') as HTMLSelectElement).value = wxOverride;
(document.getElementById('wxsel') as HTMLSelectElement).addEventListener('change', (e) => {
  wxOverride = (e.target as HTMLSelectElement).value;
  try { localStorage.setItem('apex.wx', wxOverride); } catch { /* storage blocked */ }
  wx.setWeather(wxOverride === 'auto' ? (wxPlan ? wxPlan[Math.max(0, wxPlanI)].w : 'partly') : wxOverride, false, true);
});
{
  for (const [id, key] of [['tLine', 'line'], ['tBrkAssist', 'brake'], ['tStrAssist', 'steer']] as const) {
    const cb = document.getElementById(id) as HTMLInputElement;
    cb.checked = assist[key];
    cb.addEventListener('change', () => { assist[key] = cb.checked; saveAssist(); });
  }
  const gpuSelect = document.getElementById('gpuPreference') as HTMLSelectElement;
  gpuSelect.value = requestedGpu;
  gpuSelect.addEventListener('change', () => {
    try { localStorage.setItem('apex.gpu', gpuSelect.value); } catch { /* storage unavailable */ }
    const url = new URL(location.href); url.searchParams.set('gpu', gpuSelect.value); location.assign(url.href);
  });
  const shSel = document.getElementById('shadowSel') as HTMLSelectElement;
  shSel.value = SHADOWS;
  const modSel = document.getElementById('modSel') as HTMLSelectElement | null;
  if (modSel) { modSel.value = MODELSET; modSel.addEventListener('change', () => { try { localStorage.setItem('apex.models', modSel.value); } catch { /* storage blocked */ } location.reload(); }); }
  const texSel = document.getElementById('texSel') as HTMLSelectElement | null;
  if (texSel) { texSel.value = TEXSET; texSel.addEventListener('change', () => { try { localStorage.setItem('apex.tex', texSel.value); } catch { /* storage blocked */ } location.reload(); }); }
  shSel.addEventListener('change', () => { try { localStorage.setItem('apex.shadows', shSel.value); } catch { /* storage blocked */ } location.reload(); });
  // colour grade and lens options (the platform's LUT library and film/tape lenses)
  const lutSel = document.getElementById('lutSel') as HTMLSelectElement, lutAmt = document.getElementById('lutAmt') as HTMLInputElement, lensSel = document.getElementById('lensSel') as HTMLSelectElement;
  for (const l of GAME_LUTS) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; lutSel.appendChild(o); }
  for (const l of GAME_LENSES.filter((x) => x.id !== 'none')) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; lensSel.appendChild(o); }
  if (gradePass) { lutSel.value = gradePass.lut; lensSel.value = gradePass.lens; lutAmt.value = String(gradePass.lutAmount); }
  const save = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
  lutSel.addEventListener('change', () => { if (gradePass) gradePass.lut = lutSel.value; save('apex.lut', lutSel.value); });
  lutAmt.addEventListener('input', () => { if (gradePass) gradePass.lutAmount = parseFloat(lutAmt.value); save('apex.lutAmt', lutAmt.value); });
  lensSel.addEventListener('change', () => { if (gradePass) gradePass.lens = lensSel.value as GameLens; save('apex.lens', lensSel.value); });
  (window as unknown as { apexGrade: unknown }).apexGrade = { set: (lut: string, lens: string, amt = 1) => { if (gradePass) { gradePass.lut = lut; gradePass.lens = lens as GameLens; gradePass.lutAmount = amt; } } };
}
(document.getElementById('musicVol') as HTMLInputElement).value = String(musicVol);
(document.getElementById('musicVol') as HTMLInputElement).addEventListener('input', (e) => setMusicVolume(parseFloat((e.target as HTMLInputElement).value)));
(document.getElementById('tStr') as HTMLInputElement).addEventListener('change', (e) => { streetGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tScape') as HTMLInputElement).addEventListener('change', (e) => { scapeGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tBld') as HTMLInputElement).addEventListener('change', (e) => { cityGroup.visible = roofGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tLab') as HTMLInputElement).addEventListener('change', (e) => { labelGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tXray') as HTMLInputElement).addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked;
  terrainMat.transparent = on; terrainMat.opacity = on ? 0.35 : 1; terrainMat.needsUpdate = true;
});
(document.getElementById('exag') as HTMLInputElement).addEventListener('input', (e) => {
  exag = parseFloat((e.target as HTMLInputElement).value);
  (document.getElementById('exagv') as HTMLElement).textContent = exag.toFixed(1);
  buildTerrain(); buildOverlays(); buildFurniture(); buildStreets().catch(() => undefined); buildHarbor();
});
const radioLabelEl = document.getElementById('radioLabel');
const syncRadioLabel = () => {
  if (!radioLabelEl) return;
  const st = gameAudio.currentStation;
  radioLabelEl.textContent = `${st.name} · ${st.artist}`;
};
syncRadioLabel();
{ const tc = document.getElementById('tTrafficCalls') as HTMLInputElement | null; if (tc) { try { tc.checked = localStorage.getItem('apex_traffic_calls') !== '0'; } catch { /* storage blocked */ } tc.addEventListener('change', () => { try { localStorage.setItem('apex_traffic_calls', tc.checked ? '1' : '0'); } catch { /* storage blocked */ } }); } }
{ const hv = document.getElementById('tHostVoice') as HTMLInputElement | null; if (hv) { try { hv.checked = localStorage.getItem('apex_host_voice') === '1'; } catch { /* storage blocked */ } hv.addEventListener('change', () => { try { localStorage.setItem('apex_host_voice', hv.checked ? '1' : '0'); } catch { /* storage blocked */ } }); } }
document.getElementById('radioPrev')?.addEventListener('click', () => { gameAudio.cycleStation(-1); syncRadioLabel(); });
document.getElementById('radioNext')?.addEventListener('click', () => { gameAudio.cycleStation(1); syncRadioLabel(); });
addEventListener('keydown', (e) => {
  if (e.key === '[') { gameAudio.cycleStation(-1); syncRadioLabel(); }
  if (e.key === ']') { gameAudio.cycleStation(1); syncRadioLabel(); }
  if (e.code === 'KeyF' && pursuitMode && driving) {
    const onFoot = pursuitMode.togglePlayerOnFoot(driving.ps, groundH);
    msg.textContent = onFoot ? `${pursuitMode.statusText} (ON FOOT)` : pursuitMode.statusText;
  }
});
document.getElementById('playPursuitAuto')?.addEventListener('click', () => startDrive('free', undefined, 'auto'));
document.getElementById('playCop')?.addEventListener('click', () => startDrive('free', undefined, 'cop'));
document.getElementById('playRobber')?.addEventListener('click', () => startDrive('free', undefined, 'robber'));
document.getElementById('playOnlineWorld')?.addEventListener('click', () => {
  onlineSession.connectPersistentWorld();
  startDrive('free');
});
document.getElementById('playOnlineRace')?.addEventListener('click', () => {
  onlineSession.joinOnlineRace('ironport_grand_circuit');
  startDrive('ironport_grand_circuit');
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; applyMapOffset();
  applyRenderScale();
});


// ── Frame-rate governor & GPU Quality Tiers (`low` / `mid` / `high`). Target 60 fps (30 on TV / low-power with ?tv=1); dynamic resolution + tier stepping hold TARGET_MS. ──
const TV_MODE = (() => { try { return new URLSearchParams(location.search).get('tv') === '1' || localStorage.getItem('apex.tv') === '1'; } catch { return false; } })();
let perfTier: PerfTier = detectInitialTier(renderer, TV_MODE);
let tierCfg = TIER_CONFIGS[perfTier];
const TARGET_MS = TV_MODE ? 1000 / 30 : 1000 / 60;
const BASE_PR = Math.min(devicePixelRatio, TV_MODE ? 1 : 2);
let renderScale = TV_MODE ? 0.75 : perfTier === 'low' ? 0.8 : 1, govAcc = 0, govN = 0, govMax = 0, govLast = 0, govHold = 0, govPrev = 0, govFrom = 1, govDropped = false, govNoDrop = 0;
function applyPerfTier(next: PerfTier): void {
  perfTier = next;
  tierCfg = TIER_CONFIGS[next];
  if (aoPass) {
    aoPass.aoOn = tierCfg.aoEnabled;                       // the pass stays on: it also draws the atmosphere
    if (tierCfg.aoStrength > 0) aoPass.strength = tierCfg.aoStrength;
  }
  if (aaPass) aaPass.enabled = next !== 'low';             // single-pass FXAA on mid/high, bypassed on low/TV
  if (bloomPass) bloomPass.strength = next === 'low' ? 0.34 : 0.42;
  (window as unknown as { perfTier?: PerfTier }).perfTier = next;
}
function applyRenderScale(): void {
  const pr = Math.max(0.5, BASE_PR * renderScale);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer?.setPixelRatio?.(pr);
  composer?.setSize(innerWidth, innerHeight);
  // Keep UnrealBloomPass at quarter resolution (capped at 480x270) after composer.setSize resizes passes
  bloomPass?.setSize(
    Math.min(480, Math.max(160, Math.floor(innerWidth * pr * 0.25))),
    Math.min(270, Math.max(90, Math.floor(innerHeight * pr * 0.25)))
  );
  if (aaPass && 'uniforms' in aaPass && aaPass.uniforms?.uInvRes) {
    aaPass.uniforms.uInvRes.value.set(1 / Math.max(1, innerWidth * pr), 1 / Math.max(1, innerHeight * pr));
  }
  grassField?.setQuality(renderScale * (perfTier === 'low' ? 0.75 : perfTier === 'mid' ? 0.88 : 1));
  for (const tf of treeFields) tf.setQuality(renderScale * (perfTier === 'low' ? 0.75 : perfTier === 'mid' ? 0.88 : 1));
}
function governFrames(nowMs: number): void {
  if (govLast) { const d = nowMs - govLast; if (d < 250) { govAcc += d; govN++; if (d > govMax) govMax = d; } }
  govLast = nowMs;
  if (govN < 45 || (window as unknown as { govOff?: boolean }).govOff) { if (govN >= 45) { govAcc = 0; govN = 0; } return; }
  const avg = govAcc / govN; govAcc = 0; govN = 0; govMax = 0;
  if (nowMs < 30000) return;                                         // the first seconds are texture / shader warm-up hitches, not a steady cost
  if (govHold > 0) { govHold--; return; }
  let ns = renderScale;
  // A drop that bought less than 6% means the frame is CPU / vertex bound, not fill bound: put the resolution back and stop lowering it for a while (it only costs sharpness).
  if (govPrev > 0 && govDropped) { govDropped = false; if (avg > govPrev * 0.94) { ns = govFrom; govNoDrop = 8; } }
  else if (avg > TARGET_MS * 1.12 && govNoDrop <= 0) { ns = Math.max(0.5, renderScale - (avg > TARGET_MS * 1.5 ? 0.15 : 0.07)); govFrom = renderScale; govPrev = avg; govDropped = ns !== renderScale; }
  else if (govNoDrop > 0) govNoDrop--;
  else if (avg < TARGET_MS * 1.15 && renderScale < 1 && !govDropped) ns = Math.min(1, renderScale + 0.1);
  // Step down tier cleanly if GPU remains over budget near minimum renderScale or CPU-bound
  if (avg > TARGET_MS * 1.25 && (renderScale <= 0.65 || govNoDrop >= 6) && perfTier !== 'low') {
    applyPerfTier(perfTier === 'high' ? 'mid' : 'low');
    applyRenderScale();
    govHold = 2;
  } else if (Math.abs(ns - renderScale) > 1e-3) { renderScale = ns; applyRenderScale(); govHold = 1; }
  (window as unknown as { govState?: unknown }).govState = { avgMs: +avg.toFixed(1), renderScale: +renderScale.toFixed(2), tv: TV_MODE, tier: perfTier };
}
let tvNext = 0;
applyPerfTier(perfTier);
if (TV_MODE || renderScale < 0.99) applyRenderScale();

// Car-to-car contact: each car is three circles along its length; overlap pushes the player out and swaps momentum along the contact normal (the other car is heavier or lighter by `otherMass`).
const CAR_CIRCLES = [-1.45, 0, 1.45], CAR_R = 1.0;
const PARKED_P = new THREE.Vector3(), PARKED_V = new THREE.Vector3();
/** red lights and stop signs run this session (free roam), and when the last one was called out */
const trafficCalls = { red: 0, stop: 0 };
let lastTrafficCall = -1e9;
function carHit(ps: DriveState['ps'], op: THREE.Vector3, oyaw: number, ovel: THREE.Vector3, otherMass: number): number {
  const sy = Math.sin(ps.yaw), cy = Math.cos(ps.yaw), oy = Math.sin(oyaw), oc = Math.cos(oyaw);
  if ((ps.pos.x - op.x) ** 2 + (ps.pos.z - op.z) ** 2 > 36) return 0;
  let best = 0;
  for (const a of CAR_CIRCLES) for (const b of CAR_CIRCLES) {
    const ax = ps.pos.x + sy * a, az = ps.pos.z + cy * a, bx = op.x + oy * b, bz = op.z + oc * b;
    let dx = ax - bx, dz = az - bz; const d = Math.hypot(dx, dz), min = CAR_R * 2;
    if (d >= min) continue;
    if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
    const push = (min - d) * 0.6;
    ps.pos.x += dx * push; ps.pos.z += dz * push;
    const rel = (ps.vel.x - ovel.x) * dx + (ps.vel.z - ovel.z) * dz;
    if (rel < 0) {
      const k = (1 + 0.25) * rel * (otherMass / (1 + otherMass));
      ps.vel.x -= k * dx; ps.vel.z -= k * dz;
      ps.angularVel += (dx * cy - dz * sy) * rel * 0.01 * (a > 0 ? 1 : -1);
      ps.suspensionImpact = Math.max(ps.suspensionImpact, Math.min(1, -rel / 14));
      best = Math.max(best, -rel);
    }
  }
  return best;
}

// Whole-place culling: dense circuits & Ironport hardware (harbor, catch fencing, grandstands, yards, roof details) are hidden when far and split into frustum-cullable chunks with tiered view/shadow budgets.
const PLACE_FAR = new Set([
  'river-bridges', 'country-scenes', 'port-district', 'parking-lots', 'utilities',
  'Ironport harbor hardware', 'Ironport bolted catch fencing', 'Ironport grandstand', 'yards', 'IronportCityExpansion', 'roof-group', 'harbor-group',
]);
const placeBoxes = new Map<THREE.Object3D, THREE.Box3>();
let placeNext = 0, placeScan = 0; const placeList: THREE.Object3D[] = [];
function cullPlaces(now: number): void {
  if (now < placeNext) return;
  placeNext = now + 400;
  if (!placeList.length || now > placeScan) { placeScan = now + 15000; scene.traverse((g) => { if (g.name && (g.name.startsWith('circuit:') || g.name === 'cliffRacewayCircuit' || g.name === 'industrial-circuit' || PLACE_FAR.has(g.name)) && !placeList.includes(g)) placeList.push(g); }); }
  for (const root of placeList) {
    if (!root.userData.chunkDone) { root.userData.chunkDone = true; chunkInstanced(root.parent && root.parent !== scene && root.parent.children.length < 400 ? root.parent : root); }
    root.visible = true;
    for (const g of root.children) {
      if ((g as THREE.InstancedMesh).userData?.chunked) continue;                  // chunks are distance/shadow managed by chunkList below
      let b = placeBoxes.get(g);
      if (!b) { g.visible = true; g.updateMatrixWorld(true); b = new THREE.Box3(); g.traverse((o) => { const m = o as THREE.InstancedMesh; if (!m.isMesh) return; if (m.isInstancedMesh) { m.computeBoundingBox(); if (m.boundingBox) b!.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); } else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b!.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); } }); placeBoxes.set(g, b); }
      g.visible = mapMode || b.distanceToPoint(camera.position) < (PLACE_FAR.has(root.name) ? 1600 : 1100);
    }
  }
  const camX = camera.position.x, camZ = camera.position.z;
  const tierSh = tierCfg.cullShadowDist;
  for (let i = 0; i < chunkList.length; i++) {
    const c = chunkList[i];
    const dist = Math.hypot(c.cx - camX, c.cz - camZ) - c.r;
    const vis = mapMode || dist < c.maxDist;
    c.m.visible = vis;
    if (c.baseCastShadow) c.m.castShadow = vis && !mapMode && dist < Math.min(tierSh, c.maxShadowDist);
  }
}

// Big instanced sets (fences, barriers, tyre walls, harbor hardware, streetlights, tree cards, rooftops) are split into spatial chunks with tiered distance/shadow budgets.
const chunkList: { m: THREE.InstancedMesh; cx: number; cz: number; r: number; baseCastShadow: boolean; maxDist: number; maxShadowDist: number }[] = [];
function chunkBudgetFor(m: THREE.Object3D): { cell: number; maxDist: number; maxShadowDist: number } {
  let label = m.name || '';
  let cur = m.parent;
  while (cur && cur !== scene) {
    if (cur.name) label += ' ' + cur.name;
    cur = cur.parent;
  }
  if (/catch fencing/i.test(label)) return { cell: 380, maxDist: 340, maxShadowDist: 105 };
  if (/trackkit-tyres|harbor hardware|yards/i.test(label)) return { cell: 450, maxDist: 480, maxShadowDist: 120 };
  if (/roof-group|street-light/i.test(label)) return { cell: 620, maxDist: 620, maxShadowDist: 135 };
  return { cell: 750, maxDist: 1100, maxShadowDist: 180 };
}
function chunkInstanced(root: THREE.Object3D): void {
  const big: THREE.InstancedMesh[] = [];
  root.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh && m.count > 450 && !m.userData.chunked) big.push(m); });
  const e = new THREE.Matrix4(), v = new THREE.Vector3(), col = new THREE.Color();
  for (const m of big) {
    m.userData.chunked = true; m.updateMatrixWorld(true);
    const { cell, maxDist, maxShadowDist } = chunkBudgetFor(m);
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, e); v.setFromMatrixPosition(e).applyMatrix4(m.matrixWorld); const k = Math.floor(v.x / cell) + ',' + Math.floor(v.z / cell); let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i); }
    for (const idx of buckets.values()) {
      const c = new THREE.InstancedMesh(m.geometry, m.material, idx.length);
      c.name = m.name; c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow; c.userData.chunked = true; c.matrixAutoUpdate = false; c.matrix.copy(m.matrix); c.matrixWorld.copy(m.matrixWorld);
      idx.forEach((src, j) => { m.getMatrixAt(src, e); c.setMatrixAt(j, e); if (m.instanceColor) { m.getColorAt(src, col); c.setColorAt(j, col); } });
      c.instanceMatrix.needsUpdate = true; c.computeBoundingSphere();
      const bs = c.boundingSphere!.clone().applyMatrix4(c.matrixWorld);
      c.frustumCulled = true; m.parent!.add(c); chunkList.push({ m: c, cx: bs.center.x, cz: bs.center.z, r: bs.radius, baseCastShadow: m.castShadow, maxDist, maxShadowDist });
    }
    m.parent!.remove(m);
  }
}

let last = performance.now();
let lastHudMs = 0;
let frameNo = 0;
const probePos = new THREE.Vector3();
function frame(now: number): void {
  frameNo++;
  if (TV_MODE && now < tvNext) { requestAnimationFrame(frame); return; }
  if (TV_MODE) tvNext = now + 1000 / 30 - 4;
  governFrames(now);
  cullPlaces(now);
  frameProfiler.begin(now);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const __t0 = performance.now();
  driveInput.tick();
  if (simLayer && !mapMode) { simLayer.setPublicTraffic(!driving || driving.circuitId === 'free'); simLayer.update(dt, camera.position); }
  if (vegetation) { if (mapMode) vegetation.setEnabled(false); else { vegetation.setEnabled(true); vegetation.setWind(0.3 + wx.cur.wind * 0.9 + wx.cur.rain * 0.3); vegetation.setWet(wx.cur.wet); vegetation.update(dt, camera.position); } }
  if (grassField && !mapMode) { grassField.setWind(0.3 + wx.cur.wind * 0.9 + wx.cur.rain * 0.3); grassField.setWet(wx.cur.wet); grassField.update(dt, camera.position); }
  if (treeFields.length && !mapMode) for (const tf of treeFields) { tf.setWind(0.25 + wx.cur.rain * 0.5 + wx.cur.cloudDark * 0.4); tf.update(dt, camera.position); }
  const __t1 = performance.now();
  stepFly(dt);
  stepTween(dt);
  stepCine(dt, now);
  stepWeather(dt);
  refDress?.update(now * 0.001);
  heroBridgeUpdate?.(now * 0.001, Math.max(0, Math.min(1, 1 - (sunDir.y + 0.05) * 4)));
  for (const l of cloudLayers) { l.tex.offset.x += l.vx * dt; l.tex.offset.y += l.vz * dt; }
  if (replay.active) replay.step(dt); else if (!photo.active && !festMap?.isOpen()) stepDrive(dt);      // photo mode and the navigation map pause the drive
  photo.update();
  updateProbe(dt);
  if (!fly && !driving) controls.update();
  let shadowStride = tierCfg.shadowStride;
  {
    const ft = driving ? driving.pos : controls.target;
    sun.target.position.set(ft.x, ft.y, ft.z);
    sun.position.set(ft.x + sunDir.x * 3000, ft.y + sunDir.y * 3000, ft.z + sunDir.z * 3000);
    if (camera.position.distanceToSquared(ft) >= 900 * 900) shadowStride = 4;
    if (csm) {
      camera.updateMatrixWorld();
      csm.lightDirection.copy(sunDir).negate();
      csm.update();
      for (let i = 0; i < csm.lights.length; i++) { const l = csm.lights[i]; l.intensity = sun.intensity; l.color.copy(sun.color); l.castShadow = csmCast[i]; }        // constant: flipping it recompiles every shader
      csmSweep();
    } else {
      {
        const drvSh = driving && !mapMode;
        const sb = drvSh ? 170 : 380, sc = sun.shadow.camera;
        if (sc.right !== sb) {
          sc.left = -sb; sc.right = sb; sc.top = sb; sc.bottom = -sb;
          sc.updateProjectionMatrix();
          // Tight normalBias (0.36m) in drive mode anchors shadows flush against building bases, barriers & tires instead of floating 2.5m off the wall
          sun.shadow.normalBias = drvSh ? 0.36 : 1.1;
          sun.shadow.bias = drvSh ? -0.0005 : -0.0012;
        }
      }
      sun.castShadow = true;           // constant: toggling it with camera distance flickered the sun and recompiled shaders; shadow throttling stays in spatialCuller
    }
  }
  const sh = terrainMat?.userData.shader;
  if (sh) sh.uniforms.uCam.value.copy(camera.position);
  if (dbgCam) { camera.position.copy(dbgCam.pos); camera.lookAt(dbgCam.at); camera.updateMatrixWorld(); }
  if (cinePass) {
    const u = cinePass.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 100;
    u.uAspect.value = innerWidth / innerHeight;
    const kmh = driving && !replay.active ? Math.abs(driving.ps.speedMps) : 0;
    u.uSpeed.value += (Math.min(1, Math.max(0, (kmh - 18) / 62)) - u.uSpeed.value) * Math.min(1, dt * 4);
    // where the sun is on screen, and how much of it is there to shine through (a low sun in a clear sky; none under overcast or at night)
    const sv = tmpSun.copy(camera.position).addScaledVector(sunDir, 20000).project(camera);
    const w = wx.cur, nk = NIGHT_K[todKey] ?? 0;
    const vis = sv.z < 1 ? 1 : 0;
    const clear = Math.max(0, 1 - w.cloudDark * 1.4) * Math.max(0, 1 - w.fogGrey * 0.8);
    u.uSun.value.set(sv.x * 0.5 + 0.5, sv.y * 0.5 + 0.5);
    u.uShaft.value += (vis * clear * (1 - nk) * (mapMode ? 0 : 0.55) - u.uShaft.value) * Math.min(1, dt * 3);
    (u.uSunCol.value as THREE.Color).copy(sun.color);
  }
  if (aoPass) {
    // the atmosphere (ao.ts): dual-layer Rayleigh aerial perspective + low-altitude valley mist + warm Mie sun scatter; off on the map
    const f = aoPass.fog, w = wx.cur;
    f.on = !mapMode;
    f.density = 0.000155 * (1 + w.fogGrey * 4.5 + w.rain * 1.4);
    f.falloff = 1 / 420;
    if (scene.fog instanceof THREE.Fog) f.color.copy(scene.fog.color);
    f.sunColor.copy(sun.color).multiplyScalar(Math.min(1.65, 0.35 + sun.intensity * 0.48));
    f.sunDir.copy(sunDir);
    aoPass.blur = !mapMode && !photo.active && driving && !replay.active ? 0.5 : 0;             // camera motion blur while driving (ao.ts)
  }
  lensRain.update(dt, wx.cur.rain, driving ? Math.abs(driving.ps.speedMps) : 0, !mapMode && !!driving && !replay.active && driving.camView < 3, innerWidth / innerHeight);
  const gradeActive = !!gradePass?.active;
  if (gradePass) gradePass.enabled = gradeActive;
  if (outputPass) outputPass.enabled = gradeActive;
  if (cinePass) {
    cinePass.uniforms.uToneMap.value = gradeActive ? 0 : 1;
    cinePass.uniforms.uExposure.value = renderer.toneMappingExposure;
  }
  if (aaPass && 'uniforms' in aaPass && aaPass.uniforms?.uInvRes) {
    const pr = renderer.getPixelRatio();
    aaPass.uniforms.uInvRes.value.set(1 / Math.max(1, innerWidth * pr), 1 / Math.max(1, innerHeight * pr));
  }
  const __t2 = performance.now();
  const probeMask = (TV_MODE || perfTier === 'low') ? 3 : 1;
  if (driving && !mapMode && !replay.active && (frameNo & probeMask) === 0) {                  // one cube face every other frame (every fourth on TV/low): a full refresh about 5 times a second
    if (carProbe.step(renderer, scene, probePos.set(driving.pos.x, driving.car.position.y + 1.1, driving.pos.z), [driving.car, spray.points, dust.points, forestGroup, scapeGroup])) carProbe.apply(driving.car);
  }
  cityVisibility.viewDist = mapMode ? Infinity : tierCfg.cityViewDist;
  cityVisibility.shadowDist = mapMode ? Infinity : tierCfg.cityShadowDist;
  if (mapMode) cityVisibility.update(camera, csm ? csm.lights : [sun]); else cityVisibility.update(camera, csm ? csm.lights : [sun], frameNo % 3, 3);
  if (cityBatches) { cityBatches.viewDist = cityVisibility.viewDist; cityBatches.shadowDist = cityVisibility.shadowDist; if (mapMode) cityBatches.update(camera.position); else cityBatches.update(camera.position, frameNo % 3, 3); }
  spatialCuller.update(camera, renderer, mapMode, tierCfg.cullViewDist, tierCfg.cullShadowDist, shadowStride);
  const __t3 = performance.now();
  frameProfiler.context = { mode: mapMode ? 'map' : driving ? 'drive' : 'review', weather: wx.name, camera: camera.position.toArray().map((v) => Math.round(v)) };
  frameProfiler.beginRender();
  atmosphere?.update(scene, camera, sunDir, sun.color, wx.cur.fogGrey, wx.cur.sun, NIGHT_K[todKey] ?? 0, mapMode, now);
  if (composer && fxOn) composer.render(); else renderer.render(scene, camera);
  frameProfiler.end();
  { const __t4 = performance.now(), q = ((window as any).__seg ??= { sim: [], mid: [], city: [], render: [] }); q.sim.push(__t1 - __t0); q.mid.push(__t2 - __t1); q.city.push(__t3 - __t2); q.render.push(__t4 - __t3); if (q.sim.length > 600) for (const k in q) q[k].shift(); }
  if (meta && heights && now - lastHudMs > 100) {
    lastHudMs = now;
    const e = hAt(camera.position.x, camera.position.z);
    hud.innerHTML = `camera ${Math.round(camera.position.x)}, ${Math.round(camera.position.z)}<br>alt over ground ${Math.round(camera.position.y - e * exag)} m<br>ground ${e.toFixed(0)} m above lake`;
  }
  requestAnimationFrame(frame);
}
// dev benchmark: renders n frames from a fixed camera with the real per-frame culling and post chain, and forces the GPU to finish each one
// (a 1-pixel read-back), so the times are true frame costs even when the page is in the background (no requestAnimationFrame). Returns ms stats.
(window as unknown as { __bench: unknown }).__bench = (n: number, pos: number[], at: number[], plain = false) => {
  camera.position.set(pos[0], pos[1], pos[2]); camera.lookAt(at[0], at[1], at[2]); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const gl = renderer.getContext(), px = new Uint8Array(4), t: number[] = [], cull: number[] = [], veg: number[] = [], rend: number[] = [];
  const auto = renderer.info.autoReset; renderer.info.autoReset = false;
  const wasMap = mapMode; if (wasMap) setMapMode(false);                       // measure the game as it is played, not the overview map (which shows everything)
  let calls = 0, tris = 0;
  const warm = 12;                                                               // let vegetation and streaming settle after the camera jump
  for (let i = 0; i < n + warm; i++) {
    renderer.info.reset();
    const t0 = performance.now();
    cullPlaces(performance.now() + i * 1000);
    if (vegetation) vegetation.update(0.016, camera.position);
    if (grassField) grassField.update(0.016, camera.position);
    for (const tf of treeFields) tf.update(0.016, camera.position);
    const t1 = performance.now();
    cityVisibility.viewDist = tierCfg.cityViewDist; cityVisibility.shadowDist = tierCfg.cityShadowDist;
    cityVisibility.update(camera, csm ? csm.lights : [sun], i % 3, 3);
    if (cityBatches) { cityBatches.viewDist = cityVisibility.viewDist; cityBatches.shadowDist = cityVisibility.shadowDist; cityBatches.update(camera.position, i % 3, 3); }
    spatialCuller.update(camera, renderer, false, tierCfg.cullViewDist, tierCfg.cullShadowDist, tierCfg.shadowStride);
    if (csm) csm.update();
    const t2 = performance.now();
    if (composer && fxOn && !plain) composer.render(); else renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t3 = performance.now();
    if (i >= warm) { t.push(t3 - t0); veg.push(t1 - t0); cull.push(t2 - t1); rend.push(t3 - t2); calls = renderer.info.render.calls; tris = renderer.info.render.triangles; }
  }
  renderer.info.autoReset = auto;
  if (wasMap) setMapMode(true);
  const med = (a: number[]): number => { const b = [...a].sort((x, y) => x - y); return +b[b.length >> 1].toFixed(1); };
  const p90 = (a: number[]): number => { const b = [...a].sort((x, y) => x - y); return +b[Math.floor(b.length * 0.9)].toFixed(1); };
  return { median: med(t), p90: p90(t), vegMs: med(veg), cullMs: med(cull), renderMs: med(rend), calls, tris, w: renderer.domElement.width, h: renderer.domElement.height };
};
boot().catch((e) => { msg.textContent = 'failed: ' + e; console.error(e); });
requestAnimationFrame(frame);
