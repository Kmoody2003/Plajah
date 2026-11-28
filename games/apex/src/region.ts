// Region terrain viewer: height field + satellite albedo + circuits, for design review.
import * as THREE from 'three';
import * as THREE_GPU from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPlaykitPostPipeline, type PlaykitPostHandle, type PlaykitLutPreset } from '../../../playkit/render/unifiedPost';
import { PlaykitSceneLightingController } from '../../../playkit/render/liveLighting';
import {
  createApexFacadeTslMaterial,
  createApexGlassTslMaterial,
  createApexUsRoadTslMaterial,
  sanitizeGeometryForWebGPU,
  sanitizeObjectForWebGPU,
} from './tsl/apexMaterialsTsl';
import {
  createApexCirrusTslMaterial,
  createApexIronportTerrainTslMaterial,
  createApexTreeCardLodTslMaterial,
  type ApexIronportTerrainTslHandle,
} from './tsl/worldTsl';
import { createApexPostStage, type ApexPostStageHandle } from './tsl/apexPostTsl';
import { upgradeCarRigToWebGPU } from './tsl/apexWebGpuAdapter';
import { initRegionTslContext, isRegionWebGpuRequested } from './tsl/webgpuRuntime';
import { ApexSocialHud } from './apexSocialHud';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GpuTextureLoader, initKTX2, ktxReadyPromise } from './ktx2';
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
import { CityBatches, CityCellBatches, type CityPart } from './cityBatch';
import { CityBroadcastLights, type BroadcastLeaderEntry } from './cityBroadcastLights';
import { IronportSignatureTowers } from './ironportSignatureTowers';
import { patchFacadeMasonry, patchGlassInterior, patchPunchedInterior, type FacadeV4Maps } from './buildingShaders';
import { makeSovereign } from './car';
import { makeRivalCar, type RivalCarVariant } from './rivalCars';
import { garage, cloud, activeSpec, hasCar, RunTracker, PathProgress, refParSec, showBanner, showCard, showRaceResultsOverlay, DeliveryGame, makeSpots, TIER_LIST, type RaceFinishStanding } from './garageGame';
import { CAR_BY_ID, stockSpec } from './garage/catalog';
import { medalFor } from './garage/progress';
import { smoothClosedPath } from './circuitSmooth';
import { PhotoMode } from './photo';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { hasScanCar, loadScanCarById, loadScanOpponentCar, RACE_OPPONENT_SCAN_IDS, TRAFFIC_SCAN_IDS } from './scancar';
import {
  Replay,
  REPLAY_FLAG_AIRBORNE,
  REPLAY_FLAG_DRIFT,
  REPLAY_FLAG_HEADLIGHTS,
  REPLAY_FLAG_TUNNEL,
} from './broadcastReplay';
import { createApexRegionBridge } from './tsl/regionWebGpuBridge';
import { createCarState, stepCarPhysics, setWorldBounds, type CarState, type CarInput } from './physics';
import { CARS, type CarSpec } from './manufacturers';
import { GameAudio, type NearbyVehicleAudioSample } from './audio';
import { Sky } from './sky';
import { WaterSurface } from './water';
import { DriveInput } from './inputs';
import { TrackKit } from './trackkit';
import { buildPinewoodRallyCircuit } from './circuits/pinewoodRally';
import { buildCliffRacewayCircuit } from './circuits/cliffRaceway';
import { carveCliffRaceway, designCliffTrack, indexTrack, cliffSurface, type TrackDesign, type TrackIndex } from './circuits/cliffTrack';
import { buildCountryScenes, carveCreek, type CountryScenes, type RoadNetwork, type Shoreline, carveShoreline } from './countryScenes';
import { buildRuralOpenWorldDetail } from './ruralDetail';
import { activateRuralOmniTextures } from './library/kit';
import { buildCityExpansion } from './cityExpansion';
import { buildCoastalWorld } from './coastalWorld';
import { buildRiverfrontWorld } from './riverfrontWorld';
import { buildRuralRoadNetwork, buildRuralTownPads, buildRuralTowns, RURAL_TOWNS } from './ruralTownsAndRoads';
import { buildRiverBridges, carveRiverReaches, routeOverBridges, gradeFromFoot, bridgeCorridors } from './riverBridges';
import {
  gradeRoads,
  corridor,
  sanitizeRoadPolyline,
  softenTrackBermApron,
  type GradeRoad,
  type GradeClass,
  type SanitizeStats,
} from './roadGrade';
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
import { openOnlineMultiplayerHub, openOnlineRaceLobby } from './onlineLobby';
import { RealtimeClient } from '../../../services/realtime/client';
import { SpatialCuller, runWithConcurrency, populateTiledTerrain, populateTerrainLOD, detectInitialTier, detectWebGpuTierAsync, TIER_CONFIGS, type PerfTier } from './enginePerf';
import { harborDetail } from './harborDetail';
import { duneDetail } from './duneDetail';
import { Vegetation } from './vegetation';
import { buildIndustrialCircuit, buildJerseyBarrierRibbon, concreteBarrierMaterial, carveCourseFormation, carveIndustrialCutting, industrialProfile, type GradeFeature } from './industrialCircuit';
import { quayCrane, shippingContainerMaterials } from './library/industrial';
import { WorldCollisionAndBreakables } from './worldPhysicsProps';
import { buildIronworksDistrict } from './ironworksDistrict';
import { preloadModelledPieces } from './library/modelled';
import { sharedPbrTex } from './library/kit';
import { buildCivicRiverfront, type CivicPlan } from './civicDistrict';
import { HERO_SCENES } from './heroScenes';
import { glassSelects } from './glassSelect';
import { buildParkingLots } from './parkingLots';
import { buildUtilities, type UtilitiesData } from './utilities';
import { mergeByMaterial, mergeStaticScenery } from './carBatch';
import { SimLayer, carveSim, planSim, type SimPlan } from './simLayer';
import { REF_SCENES, autumnLeaf, buildReferenceDressing, type RefDressing } from './referenceScenes';
import { buildTownSidewalks } from './townStreets';
import { buildParkedCars } from './parkedCars';
import { loadCarLibraryModels } from './carLibraryInstancer';
import { denseArea } from './sim/signals';
import type { UserMapData } from './sim/data';
import { buildPortDistrict, carvePlatform, inPort, type PortData } from './portDistrict';
import { injectRoadPbr, roadUniforms, loadRoadPbr, loadPbr1K, roadRipples, createUsRoadTexture } from './roadpbr';
import { buildWildlifeWorld, type WildlifeWorld } from './wildlifeWorld';
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
import { RacingHud, type MapLandmark, type MapOpponent, type MapRoadLayer } from './racingHud';
import { WetRoad, waterContact } from './wetRoad';
import { BlackGuard } from './blackGuard';
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
import { PlaykitRegistry } from '../../../playkit/core/registry';
import { APEX_SUPERCAR_VEHICLE_CONFIG } from '../../../playkit/adapters/verticalAdapters';
import { ClusteredLightManager } from '../../../playkit/render/clusteredLights';
import { PK_WEBGL_GI_PARS, buildPlaykitGiInjectGlsl, patchPointLightVisibilitySkip } from '../../../playkit/render/webglLighting';
import { Fsr1WebGLPass } from '../../../playkit/render/fsr1Webgl';
import { ApexPlaykitLighting } from './apexLighting';

const BASE = '/games/apex/region/';

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
const USE_WEBGPU = isRegionWebGpuRequested();
const renderer: THREE.WebGLRenderer = (USE_WEBGPU
  ? new THREE_GPU.WebGPURenderer({
      antialias: false,
      powerPreference: requestedGpu === 'default' ? 'high-performance' : requestedGpu,
    })
  : new THREE.WebGLRenderer({ antialias: false, powerPreference: requestedGpu })) as unknown as THREE.WebGLRenderer;
renderer.setPixelRatio(Math.min(devicePixelRatio, USE_WEBGPU ? 1.0 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if (!USE_WEBGPU) {
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}
view.appendChild(renderer.domElement);
const frameProfiler = new FrameProfiler(renderer);
const carProbe: CarProbe | null = USE_WEBGPU ? null : new CarProbe(renderer);              // WebGPU uses Playkit SSR + PMREM natively
if (carProbe) (window as unknown as { carProbe: CarProbe }).carProbe = carProbe;
queueMicrotask(() => { (window as unknown as { setTod: (k: string) => void }).setTod = (k: string) => setTimeOfDay(k); });   // review hook: daylight for looking at materials
if (!USE_WEBGPU) initKTX2(renderer);

const scene = new THREE.Scene();
frameProfiler.scene = scene;
// Mount Plajah Motorsport: Apex onto the unified Playkit engine registry, supercar suspension spec,
// live L2 SH9 GI probes, district LocalLookVolumes & clustered light manager
const TV_MODE_BOOT = (() => { try { return new URLSearchParams(location.search).get('tv') === '1' || localStorage.getItem('apex.tv') === '1'; } catch { return false; } })();
const webgpuLighting: PlaykitSceneLightingController | null = USE_WEBGPU
  ? new PlaykitSceneLightingController(scene, { activePointLights: 0, lowTier: TV_MODE_BOOT })
  : null;
const tslRegionCtx = USE_WEBGPU && webgpuLighting ? initRegionTslContext(webgpuLighting.uniforms, 246) : null;
const apexPostStage: ApexPostStageHandle | null = USE_WEBGPU ? createApexPostStage() : null;
let webgpuPost: PlaykitPostHandle | null = null;
let webgpuReady = !USE_WEBGPU;
let webgpuTerrainHandle: ApexIronportTerrainTslHandle | null = null;
let webgpuActiveLens: GameLens = 'none';
let webgpuActiveLut = 'none';
let webgpuLutAmt = 1;
try {
  webgpuActiveLut = localStorage.getItem('apex.lut') ?? 'none';
  webgpuActiveLens = (localStorage.getItem('apex.lens') as GameLens) ?? 'none';
  const a = parseFloat(localStorage.getItem('apex.lutAmt') ?? '');
  if (!Number.isNaN(a)) webgpuLutAmt = a;
} catch { /* storage blocked */ }
const apexPlaykitRegistry = new PlaykitRegistry();
const apexClusteredLights = new ClusteredLightManager({ maxTotalLights: 256, far: 260 });
const apexLighting = new ApexPlaykitLighting({
  scene,
  clusterManager: apexClusteredLights,
  lowTier: TV_MODE_BOOT,
  // WebGPU evaluates every active PointLight on every fragment without WebGL2's visibility skip, AND toggling PointLight.visible at dusk recompiles all 364 WGSL pipelines!
  activePointLights: USE_WEBGPU ? 0 : (TV_MODE_BOOT ? 2 : 4),
});
// On WebGL2, real native SpotLight + PointLight illuminate ahead; on WebGPU, zero native dynamic lights keep Intel xe-lpg at 33-38 FPS
// while our zero-cost TSL dual-beam headlight shader (`apexHeadlightSpotTsl`) illuminates road, curbs, barriers, terrain & buildings up to 85 m ahead!
const playerHeadlightSpot = !USE_WEBGPU ? new THREE.SpotLight(0xfff5e4, 0, 82, 0.56, 0.64, 1.25) : null;
if (playerHeadlightSpot) {
  playerHeadlightSpot.castShadow = false;
  playerHeadlightSpot.position.set(0, -200, 0);
  playerHeadlightSpot.target.position.set(0, -200, 10);
  scene.add(playerHeadlightSpot, playerHeadlightSpot.target);
}
const playerHeadlightNear = !USE_WEBGPU ? new THREE.PointLight(0xfff0d6, 0, 26, 1.45) : null;
if (playerHeadlightNear) {
  playerHeadlightNear.castShadow = false;
  playerHeadlightNear.position.set(0, -200, 0);
  scene.add(playerHeadlightNear);
}
try {
  const pkGiFlag = new URLSearchParams(location.search).get('gi') ?? localStorage.getItem('apex.pkgi');
  if (pkGiFlag === '0') apexLighting.controller.setEnabled(false);
} catch { /* storage blocked */ }
(window as unknown as { __apexPlaykit?: unknown }).__apexPlaykit = {
  registry: apexPlaykitRegistry,
  template: apexPlaykitRegistry.getGenreTemplate('racer'),
  vehicleConfig: APEX_SUPERCAR_VEHICLE_CONFIG,
  clusteredLights: apexClusteredLights,
  lighting: apexLighting,
  probeVolume: apexLighting.controller.probeVolume,
  giUniforms: apexLighting.uniforms,
  setGiEnabled: (on: boolean) => apexLighting.controller.setEnabled(on),
  setGiStrength: (v: number) => apexLighting.controller.setGiStrength(v),
  status: () => ({
    giEnabled: apexLighting.controller.enabled,
    probes: apexLighting.controller.probeVolume.count,
    totalLights: apexLighting.controller.totalRegisteredLights,
    activeClusterLights: apexLighting.controller.latestClusterBinning?.activeLightCount ?? 0,
    pointPool: apexLighting.controller.activeLightPoolSize,
    activeLookVolume: apexLighting.controller.activeLookVolumeId,
    activeLookVolumeName: apexLighting.controller.activeLookVolumeName,
    interiorMix: +apexLighting.controller.fogMod.interiorMix.toFixed(3),
    giUpper: '#' + apexLighting.uniforms.uPkGiUpper.value.getHexString(),
    giLower: '#' + apexLighting.uniforms.uPkGiLower.value.getHexString(),
    renderer: USE_WEBGPU ? 'webgpu' : 'webgl2',
    webgpuActive: USE_WEBGPU && webgpuReady,
    webgpuPasses: webgpuPost?.activePasses ?? [],
    shadows: SHADOWS,
    csmActive: !!csm,
    fsrEnabled: fsrEnabled,
    fsrUpscaled: fsr1Pass?.lastUpscaled ?? false,
    renderScale: +renderScale.toFixed(2),
  }),
  geometryStack: ['nurbs-opera-sails', 'bim-grand-civic', 'subd-capitals', 'nurbs-glasshouse', 'nurbs-festival-canopy', 'nurbs-yacht-hull', 'playkit-space-colonization-trees'],
};
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
// Building textures: v4 is the Colab GPU 2K Neural PBR set (delit albedo, Marigold normals, calibrated ORM + Depth Anything V2 height, tools/colab/ingest_ironport_colab.mjs);
// v3 is the 1K photoreal delivery of 2026-11-16; v1 is the earlier packed set with Flow replacements. ?tex=v1|v3|v4 or Settings.
// When no explicit choice is pinned, buildCity() auto-promotes to v4 once ironport/v4-manifest.json is present.
let TEXSET: 'v1' | 'v3' | 'v4' = 'v3';
let TEXSET_EXPLICIT = false;
try { const q = new URLSearchParams(location.search).get('tex') ?? localStorage.getItem('apex.tex'); if (q === 'v1' || q === 'v3' || q === 'v4') { TEXSET = q; TEXSET_EXPLICIT = true; } } catch { /* storage blocked */ }
const V3_HOLD = new Set<string>([]);
// Building models: v4 is the Colab GPU Plajah Architectural Modeler pass (depth-displaced hero reliefs, 3D curtain-wall fins, architectural cornices/eaves & CUDA raytraced vertex AO);
// v3 is the detail pass; v1 the earlier models. ?models=v1|v3|v4 or Settings.
let MODELSET: 'v1' | 'v3' | 'v4' = 'v3';
let MODELSET_EXPLICIT = false;
try { const q = new URLSearchParams(location.search).get('models') ?? localStorage.getItem('apex.models'); if (q === 'v1' || q === 'v3' || q === 'v4') { MODELSET = q; MODELSET_EXPLICIT = true; } } catch { /* storage blocked */ }
let SHADOWS = 'basic';
try {
  const qs = new URLSearchParams(location.search).get('shadows');
  const saved = qs ?? localStorage.getItem('apex.shadows');
  SHADOWS = saved === 'cascaded' ? 'cascaded' : 'basic';
} catch { /* storage blocked */ }
const csm = !USE_WEBGPU && SHADOWS === 'cascaded' ? new CSM({ maxFar: 560, cascades: 2, mode: 'practical', parent: scene, shadowMapSize: 2048, lightDirection: sunDir.clone().negate(), camera, lightIntensity: 2.4, shadowBias: -0.0004 }) : null;
let lastCsmNear = camera.near, lastCsmFar = camera.far, lastCsmAspect = camera.aspect;
if (csm) {
  sun.visible = false; sun.castShadow = false;
  // Guard Three.js CSM_FADE Cascade-0 margin=0 divide-by-zero (0.25 * pow(0.0, 2.0) = 0 -> dist/0 NaN on D3D11/ANGLE)
  if (THREE.ShaderChunk.lights_fragment_begin.includes('float ratio = clamp( dist / margin, 0.0, 1.0 );')) {
    THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
      'float ratio = clamp( dist / margin, 0.0, 1.0 );',
      'float ratio = (UNROLLED_LOOP_INDEX == 0 && linearDepth < cascadeCenter) ? 1.0 : clamp( dist / max(margin, 1e-4), 0.0, 1.0 );',
    );
  }
  // Re-apply PointLight BRDF visibility skip since CSM replaced ShaderChunk.lights_fragment_begin
  patchPointLightVisibilitySkip();
  csm.fade = true;
  // Cascade 0 (near car & street canyon): razor-sharp 2048x2048; Cascade 1 (mid city): lean 1024x1024 for Intel Arc
  csm.lights.forEach((l, i) => {
    l.shadow.normalBias = [0.28, 0.95][i] ?? 1.0;
    l.shadow.bias = [-0.0004, -0.0008][i] ?? -0.0008;
    if (i > 0) {
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.map?.dispose();
      l.shadow.map = null;
    }
  });
  csm.updateFrustums();
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
/** Make any lit material use CSM cascades, preserving existing onBeforeCompile & customProgramCacheKey so zero materials double-light! */
function csmSetup(m: THREE.Material): void {
  if (!csm || csmDone.has(m)) return;
  const x = m as unknown as Record<string, boolean>;
  if (!(x.isMeshStandardMaterial || x.isMeshPhysicalMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial)) return;
  csmDone.add(m);
  const mm = m as THREE.MeshStandardMaterial;
  mm.defines = mm.defines || {};
  mm.defines.USE_CSM = 1; mm.defines.CSM_CASCADES = csm.cascades; if (csm.fade) mm.defines.CSM_FADE = '';
  const prev = mm.onBeforeCompile;
  const prevKeyFn = mm.customProgramCacheKey.bind(mm);
  const isDefaultKey = mm.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey;
  const fixedKey = isDefaultKey ? prevKeyFn() : '';
  const breaks: THREE.Vector2[] = [];
  mm.onBeforeCompile = (shader, r) => {
    prev?.call(mm, shader, r);
    const far = Math.min(camera.far, csm.maxFar);
    (csm as unknown as { _getExtendedBreaks(b: THREE.Vector2[]): void })._getExtendedBreaks(breaks);
    shader.uniforms.CSM_cascades = { value: breaks }; shader.uniforms.cameraNear = { value: camera.near }; shader.uniforms.shadowFar = { value: far };
    (csm.shaders as unknown as Map<THREE.Material, unknown>).set(mm, shader);
  };
  mm.customProgramCacheKey = () => `${isDefaultKey ? fixedKey : prevKeyFn()}|csm${csm.cascades}${csm.fade ? 'f' : ''}`;
  (csm.shaders as unknown as Map<THREE.Material, unknown>).set(mm, null);
  mm.needsUpdate = true;
}
const csmWatched = new WeakSet<THREE.Object3D>();
/** Auto-attach CSM to every mesh the moment it enters the scene graph (before its first draw call, preventing 2x sun washout on streets/terrain). */
function watchCsm(root: THREE.Object3D): void {
  if (!csm) return;
  const m = (root as THREE.Mesh).material;
  if (m) { if (Array.isArray(m)) m.forEach(csmSetup); else csmSetup(m); }
  if (csmWatched.has(root)) return;
  csmWatched.add(root);
  root.addEventListener('childadded', (ev) => watchCsm(ev.child));
  for (const ch of root.children) watchCsm(ch);
}
if (csm) watchCsm(scene);
// ---------- shader warm-up ----------
// Three compiles a material the first frame it is drawn, and several hundred materials come into view the moment a race starts (trees, grass, buildings with the cascade
// patch). Do that work during the menu instead: once the city, forest and grass exist, compile everything with the drive-mode groups switched on, then upload the textures
// one per frame. The cascade setup runs first so no material compiles twice.
let warmed = false;
let prewarmCar: THREE.Group | null = null;
/** Start loading & compiling the player's active scan car right away after boot so frame 1 of the first race already has the real model (zero pop-in near '1'!). */
function preloadHeroCar(): void {
  const wantId = activeCarId();
  if (driving || (prewarmCar && prewarmCar.userData.carId === wantId)) return;
  try {
    const car = makeCar(wantId);
    car.position.set(0, -4000, 0);
    scene.add(car);
    prewarmCar = car;
    void (car.userData.scanPromise as Promise<void> | undefined)?.then(async () => {
      if (prewarmCar !== car || driving) return;
      if (!USE_WEBGPU) {
        csmSweep(true);
        try { await (renderer as unknown as { compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera); } catch { /* ok */ }
      }
      if (prewarmCar === car && !driving) scene.remove(car);
    });
  } catch (e) { console.warn('hero car preload failed', e); }
}
async function warmShaders(): Promise<void> {
  if (warmed || driving || (USE_WEBGPU && !webgpuReady)) return;
  warmed = true;
  if (USE_WEBGPU) {
    sanitizeObjectForWebGPU(scene);
    if (!driving && !prewarmCar) preloadHeroCar();
    return;
  }
  csmSweep(true);
  const groups = [forestGroup, scapeGroup, furnitureGroup, streetGroup, cityGroup];
  const was = groups.map((g) => g.visible);
  groups.forEach((g) => { g.visible = true; });
  try { await (renderer as unknown as { compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  if (!driving && !prewarmCar) preloadHeroCar();
  groups.forEach((g, i) => { g.visible = was[i]; });
  const tex = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const ms = (o as THREE.Mesh).material; if (!ms) return;
    for (const m of Array.isArray(ms) ? ms : [ms]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const) { const t = (m as unknown as Record<string, THREE.Texture | null>)[k]; if (t && (t as THREE.Texture).isTexture && (t as THREE.Texture).image) tex.add(t); }
  });
  const q = [...tex];
  let skip = 0;
  const step = (): void => {
    if (!q.length) { console.log('warm-up done'); return; }
    // Never upload idle background textures mid-race (prevents Lap 1 D3D11 upload stutters)
    if (driving || (skip++ & 1) === 1) { requestAnimationFrame(step); return; }
    const t = q.pop()!;
    try { renderer.initTexture(t); } catch { /* not ready */ }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const warmTimer = setInterval(() => { if (!driving && (window as unknown as { cityCount?: number }).cityCount && treeFields.length >= 3 && (grassField || vegetation) && !warmed) { clearInterval(warmTimer); void warmShaders(); } }, 800);
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

const TEXBASE = '/games/apex/tex/';
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
  clear:   { sky: 'sky_clear',   sun: 0xfff5e4, sunInt: 3.70, sunPos: [-6000, 12000, -4000], hemiSky: 0xa6ceff, hemiGround: 0x555248, hemiInt: 1.24, fog: 0xb4d0ea, fogNear: 9000, fogFar: 42000, exposure: 1.03, env: 1.24 },
  golden:  { sky: 'sky_golden',  sun: 0xffc074, sunInt: 3.85, sunPos: [-12000, 5200, -2000], hemiSky: 0x90bcf5, hemiGround: 0x4c453a, hemiInt: 1.12, fog: 0xc0cedf, fogNear: 7000, fogFar: 38000, exposure: 1.04, env: 1.26 },
  sunset:  { sky: 'sky_sunset',  sun: 0xff8440, sunInt: 3.30, sunPos: [-13000, 2500, -1500], hemiSky: 0x7692cc, hemiGround: 0x352f40, hemiInt: 0.98, fog: 0x9ca0bc, fogNear: 6000, fogFar: 34000, exposure: 1.08, env: 1.12 },
  dusk:    { sky: 'sky_dusk',    sun: 0x9298ce, sunInt: 1.18, sunPos: [-13000, 900, -1200], hemiSky: 0x5e74b6, hemiGround: 0x262936, hemiInt: 0.84, fog: 0x4c5a86, fogNear: 4000, fogFar: 30000, exposure: 1.12, env: 0.56 },
  night:   { sky: 'sky_night',   sun: 0x9ab8ee, sunInt: 0.68, sunPos: [-8000, 9000, -5000], hemiSky: 0x3b5386, hemiGround: 0x26211c, hemiInt: 0.78, fog: 0x121c32, fogNear: 2800, fogFar: 24000, exposure: 1.12, env: 0.24 },
  sunrise: { sky: 'sky_sunrise', sun: 0xffc490, sunInt: 3.10, sunPos: [12000, 3500, 2000], hemiSky: 0xa0c0e8, hemiGround: 0x4a4648, hemiInt: 1.14, fog: 0xc2cfe0, fogNear: 6000, fogFar: 34000, exposure: 1.05, env: 1.12 },
};
const PRESET_HOURS: Record<string, number> = {
  night: 23.0, sunrise: 6.4, clear: 12.8, golden: 17.5, sunset: 19.2, dusk: 20.3,
};
let nightSkyPref = 'sky2_night';
try {
  const savedNight = localStorage.getItem('apex.nightSky');
  if (savedNight && /^sky2_night(?:_moon|_aurora|_cloudy|_storm)?$/.test(savedNight)) nightSkyPref = savedNight;
} catch { /* ok */ }
const resolveSkyTexName = (name: string): string => (name === 'sky2_night' ? nightSkyPref : name);
interface SolarStop {
  h: number; sky: string; sun: number; sunInt: number; hemiSky: number; hemiGround: number;
  hemiInt: number; fog: number; fogNear: number; fogFar: number; exposure: number; env: number;
  nightK: number; mist: number;
}
const SOLAR_STOPS: SolarStop[] = [
  { h: 0.0,  sky: 'sky2_night',   sun: 0x9ab8ee, sunInt: 0.66, hemiSky: 0x395182, hemiGround: 0x25201b, hemiInt: 0.76, fog: 0x111a30, fogNear: 2800, fogFar: 24000, exposure: 1.12, env: 0.22, nightK: 1.00, mist: 0.28 },
  { h: 5.0,  sky: 'sky2_dusk',    sun: 0x8692c4, sunInt: 0.85, hemiSky: 0x4b6096, hemiGround: 0x242632, hemiInt: 0.80, fog: 0x36446a, fogNear: 3600, fogFar: 28000, exposure: 1.12, env: 0.42, nightK: 0.72, mist: 0.50 },
  { h: 6.4,  sky: 'sky2_sunrise', sun: 0xffb882, sunInt: 3.05, hemiSky: 0xa0c0e8, hemiGround: 0x4a4648, hemiInt: 1.14, fog: 0xc8cfdc, fogNear: 5800, fogFar: 34000, exposure: 1.05, env: 1.10, nightK: 0.14, mist: 0.68 },
  { h: 9.0,  sky: 'sky2_clear',   sun: 0xfff2dc, sunInt: 3.55, hemiSky: 0xa6d0ff, hemiGround: 0x56544b, hemiInt: 1.28, fog: 0xb6d2ec, fogNear: 8200, fogFar: 40000, exposure: 1.03, env: 1.22, nightK: 0.00, mist: 0.26 },
  { h: 13.0, sky: 'sky2_clear',   sun: 0xfff7ec, sunInt: 3.70, hemiSky: 0xadd5ff, hemiGround: 0x5c5950, hemiInt: 1.32, fog: 0xb6d4ee, fogNear: 9500, fogFar: 44000, exposure: 1.02, env: 1.24, nightK: 0.00, mist: 0.12 },
  { h: 17.5, sky: 'sky2_golden',  sun: 0xffc074, sunInt: 3.85, hemiSky: 0x90bcf5, hemiGround: 0x4c453a, hemiInt: 1.12, fog: 0xc0cedf, fogNear: 6800, fogFar: 38000, exposure: 1.04, env: 1.26, nightK: 0.00, mist: 0.32 },
  { h: 19.2, sky: 'sky2_sunset',  sun: 0xff8440, sunInt: 3.30, hemiSky: 0x7692cc, hemiGround: 0x352f40, hemiInt: 0.98, fog: 0x9ca0bc, fogNear: 5800, fogFar: 34000, exposure: 1.08, env: 1.12, nightK: 0.14, mist: 0.52 },
  { h: 20.3, sky: 'sky2_dusk',    sun: 0x9298ce, sunInt: 1.18, hemiSky: 0x5e74b6, hemiGround: 0x262936, hemiInt: 0.84, fog: 0x4c5a86, fogNear: 4000, fogFar: 30000, exposure: 1.12, env: 0.56, nightK: 0.58, mist: 0.44 },
  { h: 21.8, sky: 'sky2_night',   sun: 0x9ab8ee, sunInt: 0.68, hemiSky: 0x3b5386, hemiGround: 0x26211c, hemiInt: 0.78, fog: 0x121c32, fogNear: 2800, fogFar: 24000, exposure: 1.12, env: 0.24, nightK: 1.00, mist: 0.28 },
  { h: 24.0, sky: 'sky2_night',   sun: 0x9ab8ee, sunInt: 0.66, hemiSky: 0x395182, hemiGround: 0x25201b, hemiInt: 0.76, fog: 0x111a30, fogNear: 2800, fogFar: 24000, exposure: 1.12, env: 0.22, nightK: 1.00, mist: 0.28 },
];
let pmrem: THREE.PMREMGenerator | null = USE_WEBGPU ? null : new THREE.PMREMGenerator(renderer);
const pmremCache = new Map<string, THREE.Texture>();
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
let todMode: 'preset' | 'dynamic' | 'realtime' = 'preset';
let cycleHour = 17.5;
let lastIblSkyName = '';
let lastClockUiMs = 0;
let lastCycleApplyMs = 0;
let dofEnabled = true;
try { dofEnabled = localStorage.getItem('apex.dof') !== '0'; } catch { /* ok */ }
const curTod = {
  sunCol: new THREE.Color(0xffc074),
  hemiSky: new THREE.Color(0x90bcf5),
  hemiGround: new THREE.Color(0x4c453a),
  fogCol: new THREE.Color(0xc0cedf),
  sunInt: 3.85, hemiInt: 1.12, fogNear: 7000, fogFar: 38000, exposure: 1.04, env: 1.26, nightK: 0, mistBoost: 0.32,
};
const _cA = new THREE.Color(), _cB = new THREE.Color(), _moonV = new THREE.Vector3();

function applyCachedPmrem(skyName: string, tx: THREE.Texture, allowGenerateNow: boolean): void {
  tx.mapping = THREE.EquirectangularReflectionMapping;
  skyTex = tx;
  const cached = pmremCache.get(skyName);
  if (cached) {
    if (scene.environment !== cached) {
      scene.environment = cached;
      lastIblSkyName = skyName;
    }
    return;
  }
  // Never run synchronous pmrem.fromEquirectangular() mid-drive during 24h cycle (causes 400-1500 ms GPU freeze + hard IBL pop!).
  // Instead keep the resident IBL texture and smoothly crossfade lighting via continuous scene.environmentIntensity + sun/hemi/sky!
  if (!allowGenerateNow && scene.environment) return;
  if (pmrem) {
    try {
      const envTex = pmrem.fromEquirectangular(tx).texture;
      pmremCache.set(skyName, envTex);
      scene.environment = envTex;
      lastIblSkyName = skyName;
    } catch { /* wait for init */ }
  }
}

function fmtClock24(hour24: number): string {
  const hNorm = ((hour24 % 24) + 24) % 24;
  const hh = Math.floor(hNorm);
  const mm = Math.floor((hNorm - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function localRealHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
function syncTodClockUi(force = false): void {
  const now = performance.now();
  if (!force && now - lastClockUiMs < 450) return;
  lastClockUiMs = now;
  const clk = document.getElementById('todClock');
  const rng = document.getElementById('todHour') as HTMLInputElement | null;
  const tag = todMode === 'realtime' ? ' · LOCAL' : todMode === 'dynamic' ? ' · 24H' : '';
  if (clk) clk.textContent = fmtClock24(cycleHour) + tag;
  if (rng && document.activeElement !== rng) rng.value = (((cycleHour % 24) + 24) % 24).toFixed(1);
}
function applySolarHour(hour24: number, forcePresetPose = false): void {
  const h = ((hour24 % 24) + 24) % 24;
  cycleHour = h;
  let a = SOLAR_STOPS[0], b = SOLAR_STOPS[SOLAR_STOPS.length - 1];
  for (let i = 0; i < SOLAR_STOPS.length - 1; i++) {
    if (h >= SOLAR_STOPS[i].h && h <= SOLAR_STOPS[i + 1].h) { a = SOLAR_STOPS[i]; b = SOLAR_STOPS[i + 1]; break; }
  }
  const span = Math.max(1e-4, b.h - a.h);
  const uRaw = Math.max(0, Math.min(1, (h - a.h) / span));
  const u = uRaw * uRaw * (3 - 2 * uRaw);

  curTod.sunCol.copy(_cA.setHex(a.sun)).lerp(_cB.setHex(b.sun), u);
  curTod.hemiSky.copy(_cA.setHex(a.hemiSky)).lerp(_cB.setHex(b.hemiSky), u);
  curTod.hemiGround.copy(_cA.setHex(a.hemiGround)).lerp(_cB.setHex(b.hemiGround), u);
  curTod.fogCol.copy(_cA.setHex(a.fog)).lerp(_cB.setHex(b.fog), u);
  curTod.sunInt = a.sunInt + (b.sunInt - a.sunInt) * u;
  curTod.hemiInt = a.hemiInt + (b.hemiInt - a.hemiInt) * u;
  curTod.fogNear = a.fogNear + (b.fogNear - a.fogNear) * u;
  curTod.fogFar = a.fogFar + (b.fogFar - a.fogFar) * u;
  curTod.exposure = a.exposure + (b.exposure - a.exposure) * u;
  curTod.env = a.env + (b.env - a.env) * u;
  curTod.nightK = a.nightK + (b.nightK - a.nightK) * u;
  curTod.mistBoost = a.mist + (b.mist - a.mist) * u;

  // Continuous Michigan (43 deg N) East->South->West solar arc + opposite lunar arc
  if (forcePresetPose && TOD[todKey]) {
    const t = TOD[todKey];
    sun.position.set(...t.sunPos);
    sunDir.set(...t.sunPos).normalize();
    _moonV.set(-sunDir.x * 0.7 + 0.35, Math.max(0.38, 0.72 - sunDir.y * 0.4), -sunDir.z * 0.7 - 0.35).normalize();
  } else {
    const solarPhase = ((h - 6.0) / 12.0) * Math.PI; // 0 = sunrise East, PI/2 = solar noon, PI = sunset West
    const sunElev = Math.sin(solarPhase) * 0.86;
    const sunAzX = Math.cos(solarPhase) * 0.94;
    const sunAzZ = -0.34 - Math.sin(solarPhase) * 0.22;
    if (sunElev > -0.04) {
      sunDir.set(sunAzX, Math.max(0.055, sunElev), sunAzZ).normalize();
    } else {
      // Soft moonlight key light direction at night so night shadows & car reflections stay crisp
      const moonElev = Math.max(0.28, -sunElev * 0.85);
      sunDir.set(-sunAzX * 0.85, moonElev, -sunAzZ * 0.85).normalize();
    }
    sun.position.copy(sunDir).multiplyScalar(14000);
    _moonV.set(-sunAzX * 0.85, Math.max(0.26, -Math.sin(solarPhase) * 0.85 + 0.22), -sunAzZ * 0.85).normalize();
  }
  sky.setMoonDir(_moonV);
  sun.color.copy(curTod.sunCol);
  sun.intensity = curTod.sunInt;
  hemi.color.copy(curTod.hemiSky);
  hemi.groundColor.copy(curTod.hemiGround);
  hemi.intensity = curTod.hemiInt;
  tintClouds(curTod.sunCol.getHex(), curTod.hemiSky.getHex());
  if (!mapMode) {
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(curTod.fogCol);
      scene.fog.near = curTod.fogNear;
      scene.fog.far = curTod.fogFar;
    } else {
      scene.fog = new THREE.Fog(curTod.fogCol.getHex(), curTod.fogNear, curTod.fogFar);
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(curTod.fogCol);
    else scene.background = curTod.fogCol.clone();
  }
  renderer.toneMappingExposure = curTod.exposure;
  scene.environmentIntensity = curTod.env;

  const aSky = resolveSkyTexName(a.sky);
  const bSky = resolveSkyTexName(b.sky);
  const domSky = u < 0.5 ? aSky : bSky;
  // Smooth continuous sky panorama crossfade (preloaded in idle time); NEVER rebuild PMREM mid-drive!
  sky.setBlendedBase(aSky, bSky, u, (tx) => {
    if (domSky === lastIblSkyName && scene.environment) return;
    applyCachedPmrem(domSky, tx, !scene.environment);
  });
  syncTodClockUi();
}
function stepDayNight(dt: number): void {
  if (cineOn) return;
  if (todMode === 'dynamic') {
    // Full 24h cycle in 12 real minutes (smooth sunrise -> noon -> golden -> sunset -> dusk -> starry night!)
    cycleHour = (((cycleHour + dt * (24 / 720)) % 24) + 24) % 24;
  } else if (todMode !== 'realtime') {
    return;
  }
  const now = performance.now();
  if (now - lastCycleApplyMs < 85) return;
  lastCycleApplyMs = now;
  applySolarHour(todMode === 'realtime' ? localRealHour() : cycleHour, false);
}
function setTimeOfDay(key: string): void {
  if (key === 'realtime') {
    todKey = 'realtime';
    todMode = 'realtime';
    sky.preloadCycleSkies();
    applySolarHour(localRealHour(), false);
    syncTodClockUi(true);
    return;
  }
  if (key === 'dynamic') {
    todKey = 'dynamic';
    todMode = 'dynamic';
    sky.preloadCycleSkies();
    applySolarHour(cycleHour, false);
    syncTodClockUi(true);
    return;
  }
  const t = TOD[key];
  if (!t) return;
  todKey = key;
  todMode = 'preset';
  cycleHour = PRESET_HOURS[key] ?? 17.5;
  curTod.sunCol.setHex(t.sun);
  curTod.hemiSky.setHex(t.hemiSky);
  curTod.hemiGround.setHex(t.hemiGround);
  curTod.fogCol.setHex(t.fog);
  curTod.sunInt = t.sunInt;
  curTod.hemiInt = t.hemiInt;
  curTod.fogNear = t.fogNear;
  curTod.fogFar = t.fogFar;
  curTod.exposure = t.exposure;
  curTod.env = t.env;
  curTod.nightK = key === 'night' ? 1 : key === 'dusk' ? 0.55 : key === 'sunrise' ? 0.15 : key === 'sunset' ? 0.10 : 0;
  curTod.mistBoost = key === 'sunrise' ? 0.68 : key === 'sunset' ? 0.52 : key === 'dusk' ? 0.44 : key === 'golden' ? 0.32 : 0.16;
  tintClouds(t.sun, t.hemiSky);
  sun.color.setHex(t.sun); sun.intensity = t.sunInt; sun.position.set(...t.sunPos); sunDir.set(...t.sunPos).normalize();
  hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiInt;
  if (!mapMode) {
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.setHex(t.fog); scene.fog.near = t.fogNear; scene.fog.far = t.fogFar; }
    else scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
    if (scene.background instanceof THREE.Color) scene.background.setHex(t.fog);
    else scene.background = new THREE.Color(t.fog);
  }
  renderer.toneMappingExposure = t.exposure;
  scene.environmentIntensity = t.env;
  const skyName = resolveSkyTexName(t.sky.replace('sky_', 'sky2_'));
  sky.setBase(skyName, (tx) => {
    applyCachedPmrem(skyName, tx, !driving || !scene.environment);
  });
  syncTodClockUi(true);
}

const maskVec = new THREE.Vector4(0, 0, 1, 1);
let roadMask: { data: Uint8ClampedArray; w: number; h: number } | null = null;
const maskTex = new THREE.Texture();
let loadedCityMaskTex: THREE.Texture | null = null;
fetch('/games/apex/region/city_mask.json').then((r) => r.json()).then((m) => {
  maskVec.set(m.x0, m.z0, m.w, m.h);
  new THREE.TextureLoader().load('/games/apex/region/city_mask.png', (t) => {
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    try {
      const cv = document.createElement('canvas'); cv.width = t.image.width; cv.height = t.image.height;
      const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(t.image as CanvasImageSource, 0, 0);
      roadMask = { data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    } catch { roadMask = null; }
    loadedCityMaskTex = t;
    webgpuTerrainHandle?.setMaskTexture(t);
    maskTex.image = t.image; maskTex.flipY = false; maskTex.colorSpace = THREE.NoColorSpace; maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
    maskTex.minFilter = THREE.LinearMipmapLinearFilter; maskTex.magFilter = THREE.LinearFilter; maskTex.generateMipmaps = true; maskTex.anisotropy = 8; maskTex.needsUpdate = true;
  });
}).catch(() => undefined);
// terrain detail: close up, high-frequency grass, sand, forest floor and gravel from the reference textures ride on the satellite colour
const terrO = { value: new THREE.Vector2(0, 0) };                         // world position of the grid centre (GRID.ox, GRID.oz)
const terrV = { value: new THREE.Vector2(16512, 9216) };                  // world size of the height grid, for sampling the land class map
const classTex = new THREE.TextureLoader().load('/games/apex/region/landclass.png');
classTex.colorSpace = THREE.NoColorSpace; classTex.minFilter = THREE.LinearFilter; classTex.generateMipmaps = false;
function applyTerrainDetail(m: THREE.MeshStandardMaterial): void {
  m.userData.__playkitWebglGi = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, apexLighting.uniforms);
    sh.uniforms.tGA = groundU.tGA; sh.uniforms.tGP = groundU.tGP; sh.uniforms.uGroundOn = groundU.uGroundOn; sh.uniforms.uGTune = groundU.uGTune;     // the ground's own PBR materials (groundArrays.ts)
    sh.uniforms.uCam = { value: new THREE.Vector3() };
    sh.uniforms.uMapFade = mapFadeU;
    sh.uniforms.uEdge = edgeU;
    // Surface our curated high-res PBR asphalt & architectural concrete sidewalk sets (1K mipmapped for low VRAM + 8x aniso crispness)
    sh.uniforms.tAsph = { value: loadPbr1K('ground_asphalt_dry.png', true, 0x35373c, 1024) };
    sh.uniforms.tPave = { value: loadPbr1K('ground_concrete_sidewalk.png', true, 0xa2a09a, 512) };
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
      .replace('#include <common>', '#include <common>\n' + PK_WEBGL_GI_PARS + 'varying vec3 vWPos;\nvarying vec3 vWNorm;\nuniform highp sampler2DArray tGA;\nuniform highp sampler2DArray tGP;\nuniform float uGroundOn;\nuniform vec4 uGTune;\nuniform sampler2D tMask;\nuniform sampler2D tAsph;\nuniform sampler2D tPave;\nuniform vec4 uMask;\nuniform float uWet;\nuniform float uPool;\nuniform float uMapFade;\nuniform vec2 uEdge;\nuniform vec3 uCam;\nuniform sampler2D tClass;\nuniform vec2 uTerr;\nuniform vec2 uTerrO;\nfloat tHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\nfloat tNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y); }\n' + PUDDLE_GLSL)
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
      vec2 gUrbanN = vec2(0.0); float gUrbanW = 0.0, gUrbanR = 0.86;   // crisp multi-scale urban concrete/paver/park detail beyond the track
      vec3 gRockN = vec3(0.0); float gRockW = 0.0, gRockR = 0.84;      // world-space cliff strata & snow crystalline normal relief
      // ── 100% Real Procedural Multi-Biome PBR Terrain (ZERO blurry satellite pixels at ANY distance!) ──
      // Strictly preserves Ironport's exact heightfield, coastlines (vWPos.y), landclass.png (sand/forest/farmland),
      // and city_mask.png (urban streets/sidewalks/parcels) while synthesizing razor-sharp ground from 0 m to 20 km.
      vec3 satHint = diffuseColor.rgb;
      float satChroma = max(satHint.r, max(satHint.g, satHint.b)) - min(satHint.r, min(satHint.g, satHint.b));
      vec3 cls = texture2D(tClass, vec2((vWPos.x - uTerrO.x) / uTerr.x + 0.5, 1.0 - ((vWPos.z - uTerrO.y) / uTerr.y + 0.5))).rgb;
      // Greater Ironport Urban, Industrial, Harbor & West-Bank Metro envelope:
      // city_mask.png starts at x = 4494 (East Bank), so extend crisp urban/suburban ground cleanly across the
      // West Bank riverfront, Ironworks, Port, Harbor & Suburbs so farmland NEVER spills onto urban riverbanks!
      float metroX = smoothstep(1850.0, 2650.0, vWPos.x);
      float metroZ = smoothstep(-4150.0, -3450.0, vWPos.z) * (1.0 - smoothstep(3050.0, 3650.0, vWPos.z));
      float metroCore = clamp(max(inMask ? 1.0 : 0.0, metroX * metroZ), 0.0, 1.0);
      // Suburban residential lawn ring around the outer West Bank & northern suburbs (manicured yards, NOT crop furrows!)
      float suburbBand = smoothstep(1400.0, 2100.0, vWPos.x) * (1.0 - metroCore) * smoothstep(-3200.0, -2400.0, vWPos.z) * (1.0 - smoothstep(2200.0, 3100.0, vWPos.z));
      float urbanAny = clamp(metroCore + suburbBand * 0.75, 0.0, 1.0);

      float shoreBand = (1.0 - smoothstep(1.1, 4.6, vWPos.y)) * (urbanAny > 0.4 ? 0.18 : 1.0);
      float wetShore = 1.0 - smoothstep(0.15, 1.55, vWPos.y);
      float sandy = clamp(max(cls.r, shoreBand * 0.92) * (1.0 - metroCore * 0.72), 0.0, 1.0);
      float forestK = clamp(cls.g * (1.0 - shoreBand * 0.75), 0.0, 1.0);
      // Farmland crop parcels ONLY in genuine rural agricultural zones (strictly excluded from West & East Bank urban/suburban metro!)
      float fieldK = clamp(cls.b * (1.0 - forestK * 0.85) * (1.0 - sandy * 0.85) * (1.0 - urbanAny), 0.0, 1.0);
      float rockK = smoothstep(0.22, 0.48, 1.0 - smoothN.y);
      float macroA = tNoise(vWPos.xz / 240.0);
      float macroB = tNoise(vWPos.xz / 68.0);
      float macroC = tNoise(vWPos.xz / 19.0);
      float macro = macroA * 0.42 + macroB * 0.36 + macroC * 0.22;

      // Redrawn Michigan agricultural farmland parcels (sharp field dividers, alternating crop types & directional furrows)
      vec2 farmWarp = vWPos.xz + vec2(tNoise(vWPos.xz / 900.0) - 0.5, tNoise(vWPos.xz / 900.0 + 9.3) - 0.5) * 18.0;
      vec2 parcelSz = vec2(210.0, 260.0);
      vec2 fcell = floor(farmWarp / parcelSz);
      vec2 fuv = fract(farmWarp / parcelSz);
      float fh = tHash(fcell);
      float fh2 = tHash(fcell + vec2(17.3, 41.9));
      // Subdivide half of parcels into tighter twin fields for authentic Midwest patchwork scale
      if (fh > 0.48) {
        vec2 subSz = fh > 0.74 ? vec2(105.0, 260.0) : vec2(210.0, 130.0);
        fcell = floor(farmWarp / subSz);
        fuv = fract(farmWarp / subSz);
        fh = tHash(fcell);
        fh2 = tHash(fcell + vec2(17.3, 41.9));
      }
      float borderDist = min(min(fuv.x, 1.0 - fuv.x) * parcelSz.x, min(fuv.y, 1.0 - fuv.y) * parcelSz.y);
      float hedgerow = 1.0 - smoothstep(2.2, 6.2, borderDist);         // grassy field divider & headland strip
      float rowCoord = (fh2 > 0.5 ? farmWarp.x : farmWarp.y);
      float rowsK = 0.5 + 0.5 * sin(rowCoord * 1.45 + fh * 31.0);
      float rowsFine = 0.5 + 0.5 * sin(rowCoord * 4.2 + fh * 17.0);
      // 6 distinct authentic Great Lakes crop & soil palettes (sharp from Map Overview AND close-up!)
      vec3 cropCol;
      float cropSoilMix = 0.0;
      if (fh < 0.18) {
        // Freshly plowed rich dark Michigan loam furrows
        cropCol = mix(vec3(0.088, 0.064, 0.044), vec3(0.145, 0.106, 0.072), rowsK * 0.7 + macroC * 0.3);
        cropSoilMix = 0.88;
      } else if (fh < 0.36) {
        // Golden sunlit wheat / barley crop rows
        cropCol = mix(vec3(0.24, 0.19, 0.088), vec3(0.36, 0.285, 0.125), rowsK * 0.55 + macroB * 0.45);
        cropSoilMix = 0.22;
      } else if (fh < 0.56) {
        // Lush emerald corn & soybean crop rows with dark soil between furrows
        cropCol = mix(vec3(0.068, 0.125, 0.042), vec3(0.115, 0.215, 0.066), rowsK * 0.65 + rowsFine * 0.20 + macroC * 0.15);
        cropSoilMix = 0.18;
      } else if (fh < 0.74) {
        // Mowed alfalfa / hayfield pasture with subtle tractor swath bands
        float swath = 0.5 + 0.5 * sin(rowCoord * 0.22 + fh * 12.0);
        cropCol = mix(vec3(0.128, 0.205, 0.068), vec3(0.175, 0.248, 0.085), swath * 0.55 + macroB * 0.45);
        cropSoilMix = 0.10;
      } else if (fh < 0.88) {
        // Harvested golden stubble / fallow field
        cropCol = mix(vec3(0.205, 0.175, 0.108), vec3(0.295, 0.242, 0.148), rowsK * 0.45 + macro * 0.55);
        cropSoilMix = 0.48;
      } else {
        // Rich spring clover & meadow pasture
        cropCol = mix(vec3(0.098, 0.182, 0.064), vec3(0.155, 0.228, 0.086), macro * 0.75 + rowsK * 0.25);
        cropSoilMix = 0.08;
      }
      vec3 hedgeCol = mix(vec3(0.055, 0.105, 0.042), vec3(0.105, 0.155, 0.062), macroC);
      cropCol = mix(cropCol, hedgeCol, hedgerow * 0.88);
      cropCol *= 0.88 + 0.24 * macroB;

      // Crisp procedural base colours for every biome (eliminates blurry low-res satellite map at EVERY altitude!)
      vec3 wetSandCol = mix(vec3(0.11, 0.096, 0.078), vec3(0.16, 0.14, 0.112), macroC);
      vec3 beachSandCol = mix(vec3(0.36, 0.305, 0.215), vec3(0.46, 0.395, 0.285), macroB * 0.6 + macroC * 0.4);
      vec3 duneCol = mix(beachSandCol, vec3(0.18, 0.205, 0.095), smoothstep(3.0, 9.5, vWPos.y) * (0.35 + 0.45 * macroB));
      vec3 coastCol = mix(duneCol, wetSandCol, wetShore);
      vec3 forestCol = mix(vec3(0.052, 0.094, 0.038), vec3(0.098, 0.148, 0.058), macro * 0.7 + macroC * 0.3);
      vec3 meadowCol = mix(vec3(0.095, 0.172, 0.058), vec3(0.168, 0.222, 0.082), macro * 0.68 + macroC * 0.32);
      // Higher alpine hills & northern ridges transition naturally to cooler heather & sunlit stone-meadow
      float altK = smoothstep(95.0, 250.0, vWPos.y);
      meadowCol = mix(meadowCol, mix(vec3(0.145, 0.162, 0.105), vec3(0.185, 0.175, 0.135), macroB), altK * 0.65);
      // Clean urban base (park turf + architectural concrete/gravel lots; never raw blurry satellite roofs)
      float satGreen = clamp((satHint.g - max(satHint.r, satHint.b)) * 6.0, 0.0, 1.0);
      float urbanParkK = clamp(max(forestK * 0.85, satGreen * 0.9), 0.0, 1.0);
      vec3 urbanLotMacro = mix(vec3(0.22, 0.225, 0.232), vec3(0.295, 0.292, 0.286), macroB * 0.65 + macroC * 0.35);
      vec3 urbanParkMacro = mix(vec3(0.088, 0.168, 0.058), vec3(0.135, 0.212, 0.076), macroB);
      vec3 urbanMacroCol = mix(urbanLotMacro, urbanParkMacro, urbanParkK);

      float open = (1.0 - forestK) * (1.0 - sandy);
      vec3 synthMacro = meadowCol;
      synthMacro = mix(synthMacro, cropCol, fieldK);
      synthMacro = mix(synthMacro, forestCol, forestK);
      synthMacro = mix(synthMacro, coastCol, sandy);
      // Clean urban concrete/plaza/park ground across BOTH East Bank (city_mask) AND West Bank urban/industrial riverfront!
      if (urbanAny > 0.01) {
        float lotGrid = step(0.42, tNoise(vWPos.xz / 42.0));
        // West Bank & Harbor industrial/downtown core leans hard-surface concrete/yards + riverside parks; outer suburbs lean lush lawns + residential driveways
        float hardUrban = clamp(metroCore * (1.0 - urbanParkK * 0.78) * (0.55 + 0.45 * lotGrid), 0.0, 1.0);
        vec3 suburbYard = mix(urbanParkMacro * (0.92 + 0.16 * macroC), urbanLotMacro * 1.06, smoothstep(0.55, 0.82, tNoise(vWPos.xz / 24.0)) * 0.45);
        vec3 metroGround = mix(suburbYard, urbanMacroCol, clamp(metroCore * 0.85 + hardUrban * 0.35, 0.0, 1.0));
        float maskBlend = inMask
          ? smoothstep(0.0, 0.04, min(min(muv.x, 1.0 - muv.x), min(muv.y, 1.0 - muv.y)))
          : urbanAny;
        synthMacro = mix(synthMacro, metroGround, maskBlend * (1.0 - sandy * 0.72));
      }
      // Subtle alpine snow cap above 265 m on gentler high mountain ridges
      float alpineSnow = smoothstep(265.0, 365.0, vWPos.y + (macroB - 0.5) * 32.0) * smoothstep(0.52, 0.82, smoothN.y);
      synthMacro = mix(synthMacro, vec3(0.84, 0.88, 0.92), alpineSnow);

      // Commit the crisp procedural macro albedo immediately so NO raw blurry satellite pixel is ever shown!
      diffuseColor.rgb = synthMacro;

      if (road < 0.995 && (walk * (1.0 - kerb)) < 0.995) {
        float wv[8];
        wv[0] = open * (1.0 - fieldK * 0.72) * (0.65 + 0.7 * macro) + fieldK * hedgerow * 0.8;
        wv[1] = open * 0.32 * (1.3 - 0.7 * macro) + fieldK * (1.0 - cropSoilMix) * 0.95;
        wv[2] = forestK * (1.0 - sandy);
        wv[3] = fieldK * cropSoilMix * (1.0 - hedgerow) * 1.15;
        wv[4] = wetShore * 0.45 + open * 0.05;
        wv[5] = sandy * (1.0 - wetShore * 0.35);
        wv[6] = fieldK * cropSoilMix * 0.22 * macroC + wetShore * 0.55;
        wv[7] = 0.0;
        float tot = 0.0;
        for (int i = 0; i < 7; i++) { wv[i] *= (1.0 - rockK); tot += wv[i]; }
        wv[7] = rockK; tot += rockK;
        float tile[8]; tile[0] = 3.6; tile[1] = 3.4; tile[2] = 4.2; tile[3] = 4.0; tile[4] = 3.0; tile[5] = 4.6; tile[6] = 3.6; tile[7] = 6.5;
        vec3 alb = vec3(0.0); vec4 surf = vec4(0.0); float wsum = 0.0;
        // High-res PBR 2DArray texture detail up to 1150 m (Top-2 dominant biomes = max 6 texture fetches!)
        float detailFar = max(uGTune.z, 1150.0);
        if (camD < detailFar && uGroundOn > 0.5) {
          int b0 = 0, b1 = 0;
          float w0 = -1.0, w1 = -1.0;
          for (int i = 0; i < 8; i++) {
            float wi = wv[i] / max(tot, 1e-4);
            if (wi > w0) { w1 = w0; b1 = b0; w0 = wi; b0 = i; }
            else if (wi > w1) { w1 = wi; b1 = i; }
          }
          vec2 dPdx = dFdx(vWPos.xz), dPdy = dFdy(vWPos.xz);
          bool useRot = camD < 210.0;
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
          float near = (1.0 - smoothstep(detailFar * 0.22, detailFar, camD)) * (1.0 - alpineSnow);
          float al = max(dot(alb, vec3(0.299, 0.587, 0.114)), 0.04);
          float ml = max(dot(synthMacro, vec3(0.299, 0.587, 0.114)), 0.04);
          // Modulate PBR micro-detail albedo smoothly into our crisp procedural biome palette (keeps zero satellite blur!)
          vec3 pbrTinted = mix(alb * clamp(ml / al, 0.52, 1.55), synthMacro * (0.58 + 0.84 * (alb / al)), 0.55);
          pbrTinted *= mix(1.0, surf.a, 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, pbrTinted, near);
          gTN = surf.rg * 2.0 - 1.0;
          // Add subtle directional crop-furrow & beach wind-ripple normal relief
          if (fieldK > 0.1) {
            float furDeriv = cos(rowCoord * 1.45 + fh * 31.0) * 0.42 * fieldK * (1.0 - hedgerow);
            gTN += (fh2 > 0.5 ? vec2(furDeriv, 0.0) : vec2(0.0, furDeriv));
          }
          if (sandy > 0.15 && wetShore < 0.8) {
            float sandRip = cos(vWPos.x * 2.4 + vWPos.z * 0.9 + macroC * 4.0) * 0.22 * sandy;
            gTN += vec2(sandRip, sandRip * 0.35);
          }
          gTW = near;
          gTR = mix(surf.b, 0.24, wetShore * 0.82);
        } else {
          // Far-distance crisp micro-contrast & farmland furrow relief (prevents smooth plastic look from aerials)
          diffuseColor.rgb *= 1.0 + (macroC - 0.5) * 0.22;
          gTR = mix(0.88, 0.24, wetShore * 0.82);
        }
        // Wine-country tulip flower beds: rich sunlit petal clusters + dark green leaf furrows visible across the valley
        if (vWPos.z < -4200.0 && vWPos.y < 140.0 && satChroma > 0.20 && satHint.g < max(satHint.r, satHint.b) * 0.90) {
          float tNear = smoothstep(0.20, 0.34, satChroma);
          float row = 0.5 + 0.5 * sin(vWPos.x * 5.2 + tNoise(vWPos.xz / 18.0) * 1.6);
          float bloom = smoothstep(0.26, 0.72, tNoise(vWPos.xz * 3.1) * 0.65 + tNoise(vWPos.xz * 9.5) * 0.35);
          float speck = tNoise(vWPos.xz * 12.0);
          vec3 stemCol = vec3(0.05, 0.14, 0.04) * (0.7 + 0.5 * speck);
          vec3 petalCol = satHint * (0.78 + 0.52 * speck);
          vec3 tulip = mix(stemCol, petalCol, bloom * (0.28 + 0.72 * row));
          diffuseColor.rgb = mix(diffuseColor.rgb, tulip, tNear * 0.92);
          gTN = mix(gTN, vec2((speck - 0.5) * 1.6, (bloom - 0.5) * 1.6), tNear * 0.85 * fade);
          gTW = max(gTW, tNear * 0.85 * fade);
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
      if ((inMask || metroCore > 0.25) && (road + walk + kerb) < 0.995) {
        // Urban parcels, plazas, parking aprons, industrial yards & city parks across BOTH riverbanks:
        // crisp multi-scale architectural pavers, weathered concrete & manicured park turf (zero blurry satellite pixels!)
        float parcelMask = (inMask ? 1.0 : metroCore) * (1.0 - clamp(road + walk, 0.0, 1.0)) * (1.0 - smoothstep(320.0, 1850.0, camD));
        if (parcelMask > 0.005) {
          vec2 up = vWPos.xz;
          float hardLot = (1.0 - urbanParkK) * (1.0 - sandy * 0.8);
          // Architectural plaza / concrete lot grid with weathered aggregate & expansion joints
          vec2 lotG = fract(up / 4.2);
          float lotSeamX = 1.0 - smoothstep(0.0, 0.032, min(lotG.x, 1.0 - lotG.x));
          float lotSeamY = 1.0 - smoothstep(0.0, 0.032, min(lotG.y, 1.0 - lotG.y));
          float lotSeam = max(lotSeamX, lotSeamY) * (1.0 - smoothstep(45.0, 220.0, camD));
          vec3 lotTexA = texture2D(tPave, up / 3.4).rgb;
          vec3 lotTexB = texture2D(tPave, up / 13.5 + 0.27).rgb;
          float lotStain = 0.82 + 0.30 * tNoise(up / 18.0) * (0.75 + 0.35 * tNoise(up / 4.8));
          vec3 lotCol = mix(lotTexA, lotTexA * (0.62 + 0.72 * lotTexB), 0.50) * lotStain * (1.0 - 0.24 * lotSeam);
          float lotLum = max(dot(lotCol, vec3(0.299, 0.587, 0.114)), 0.05);
          float baseLum = max(dot(urbanLotMacro, vec3(0.299, 0.587, 0.114)), 0.05);
          lotCol *= clamp(baseLum / lotLum, 0.68, 1.32);
          // Urban parks, medians & manicured lawns with subtle stadium/park mower stripes
          float turfStripe = 1.0 + 0.085 * sin(up.x * 1.15 + up.y * 0.32);
          float turfFine = 0.82 + 0.34 * tNoise(up / 1.6) * (0.7 + 0.4 * tNoise(up / 6.2));
          vec3 parkCol = urbanParkMacro * turfStripe * turfFine;
          vec3 urbanBase = mix(parkCol, lotCol, hardLot);
          diffuseColor.rgb = mix(diffuseColor.rgb, urbanBase, parcelMask * (0.62 + 0.32 * hardLot));
          // Tactile analytical normal relief for plazas, concrete aprons & city lawns
          float nH1 = tNoise(up / 1.8), nH2 = tNoise((up + vec2(0.35, 0.0)) / 1.8), nH3 = tNoise((up + vec2(0.0, 0.35)) / 1.8);
          vec2 microN = vec2(nH2 - nH1, nH3 - nH1) * (2.6 + 1.4 * hardLot);
          vec2 seamN = vec2((lotG.x < 0.5 ? -1.0 : 1.0) * lotSeamX, (lotG.y < 0.5 ? -1.0 : 1.0) * lotSeamY) * 0.65 * hardLot;
          gUrbanN = microN + seamN;
          gUrbanW = max(gUrbanW, parcelMask * (0.55 + 0.35 * hardLot));
          gUrbanR = mix(0.92, 0.78 + 0.14 * lotTexB.r, hardLot);
        }
      }
      if (inMask && (road + walk + kerb) > 0.002) {
        vec2 sp = vWPos.xz;
        vec3 col = diffuseColor.rgb;
        if (walk > 0.005) {
          vec2 slabF = fract(sp / 1.7);
          float jointX = 1.0 - smoothstep(0.0, 0.045, min(slabF.x, 1.0 - slabF.x));
          float jointY = 1.0 - smoothstep(0.0, 0.045, min(slabF.y, 1.0 - slabF.y));
          float joint = max(jointX, jointY);
          float stain = 0.84 + 0.24 * tNoise(sp / 9.5);
          vec3 pave = texture2D(tPave, sp / 1.7).rgb * (0.84 + 0.20 * fract(sin(dot(floor(sp / 1.7), vec2(12.9898, 78.233))) * 43758.5453)) * stain;
          float jFade = 1.0 - smoothstep(25.0, 110.0, camD);
          pave *= 1.0 - 0.28 * joint * jFade;
          col = mix(col, pave * 0.88, walk);
          // Crisp sidewalk joint bevel & brushed concrete normal relief
          float wN0 = tNoise(sp / 0.85), wNx = tNoise((sp + vec2(0.18, 0.0)) / 0.85), wNz = tNoise((sp + vec2(0.0, 0.18)) / 0.85);
          vec2 walkN = vec2((slabF.x < 0.5 ? -1.0 : 1.0) * jointX, (slabF.y < 0.5 ? -1.0 : 1.0) * jointY) * 0.72 * jFade + vec2(wNx - wN0, wNz - wN0) * 2.2 * jFade;
          gUrbanN = mix(gUrbanN, walkN, walk);
          gUrbanW = max(gUrbanW, walk * (0.45 + 0.55 * jFade));
          gUrbanR = mix(gUrbanR, 0.74 + 0.18 * stain, walk);
        }
        col = mix(col, vec3(0.56, 0.55, 0.52) * (0.78 + 0.34 * tNoise(sp / 0.85)) * (0.88 + 0.20 * tNoise(sp / 3.1)), kerb);
        if (road > 0.005) {
          vec3 a1 = texture2D(tAsph, sp / 3.2).rgb, a2 = texture2D(tAsph, sp / 12.5 + 0.37).rgb;
          float cellN = fract(sin(dot(floor(sp / 6.0), vec2(12.9898, 78.233))) * 43758.5453);
          float cellM = fract(sin(dot(floor(sp / 23.0), vec2(39.3468, 11.135))) * 24634.6345);
          float patchMacro = 0.88 + 0.22 * tNoise(sp / 28.0);
          vec3 asph = mix(a1, a1 * (0.55 + a2 * 0.9), 0.55) * (0.86 + 0.18 * cellN) * (0.88 + 0.18 * cellM) * patchMacro;
          asph *= 1.0 - 0.22 * smoothstep(0.78, 0.98, cellN) * smoothstep(0.3, 0.9, a2.r);
          // On Map Overview (uMapFade > 0.5) deepen asphalt contrast so every downtown/suburban street reads crisply from orbit
          vec3 roadCol = mix(asph * 1.12, vec3(0.085, 0.095, 0.115), uMapFade * 0.72);
          col = mix(col, roadCol, road);
        }
        gWet = uWet * max(road, walk * 0.7);
        gRoad = road;
        gPud = puddleAt(vWPos.xz, uPool) * road * (1.0 - smoothstep(600.0, 1400.0, camD));
        col *= 1.0 - 0.26 * gWet;
        col *= 1.0 - 0.30 * gPud;
        diffuseColor.rgb = col;
      }
      diffuseColor.rgb *= 1.0 - 0.14 * uWet;           // wet ground everywhere`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(0.55, 1.0, gTR), gTW);\nroughnessFactor = mix(roughnessFactor, gUrbanR, gUrbanW * (1.0 - road));\nroughnessFactor = mix(roughnessFactor, gRockR, gRockW);\nroughnessFactor = mix(roughnessFactor, 0.42, gWet);\nroughnessFactor = mix(roughnessFactor, 0.06, gPud);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.02, gPud);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      ${buildPlaykitGiInjectGlsl('0.78')}
      { if (gPud > 0.01 || gWet > 0.01) { float fBase = clamp(1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0), 0.0, 1.0); float fW = fBase * fBase * fBase; reflectedLight.indirectSpecular = min(max(reflectedLight.indirectSpecular, vec3(0.0)), vec3(16.0)) * (1.0 + gPud * (0.18 + 0.65 * fW) + gWet * 0.10 * fW); } }`);
    sh.fragmentShader = injectRoadPbr(sh.fragmentShader, 'vWPos.xz');
    Object.assign(sh.uniforms, roadUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float dfade = gTW * (1.0 - road) * (1.0 - gPud);
        float ufade = gUrbanW * (1.0 - road) * (1.0 - gPud);
        if (dfade > 0.002 || ufade > 0.002 || gRockW > 0.002) {
          vec3 nWv = inverseTransformDirection(normal, viewMatrix);
          if (dfade > 0.002 || ufade > 0.002) {
            vec3 refA = abs(nWv.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
            vec3 T = normalize(cross(refA, nWv)), B = cross(nWv, T);
            if (dfade > 0.002) nWv = normalize(nWv + (T * gTN.x + B * gTN.y) * 1.42 * dfade);
            if (ufade > 0.002) nWv = normalize(nWv + (T * gUrbanN.x + B * gUrbanN.y) * 0.85 * ufade);
          }
          if (gRockW > 0.002) {
            nWv = normalize(nWv + gRockN * 0.55 * gRockW);
          }
          normal = normalize((viewMatrix * vec4(nWv, 0.0)).xyz);
        }
      }`);
    m.userData.shader = sh;
  };
  m.customProgramCacheKey = () => 'apex-terrain-detail-pkgi-v2';
}

let composer: EffectComposer | null = null;
let cinePass: ShaderPass | null = null;
let aoPass: AoPass | null = null;
let bloomPass: UnrealBloomPass | null = null;
let outputPass: OutputPass | null = null;
let gradePass: GradePass | null = null;
let aaPass: ShaderPass | SMAAPass | null = null;
let fsr1Pass: Fsr1WebGLPass | null = null;
let fsrEnabled = (() => { try { const q = new URLSearchParams(location.search).get('fsr') ?? localStorage.getItem('apex.fsr'); return q !== '0'; } catch { return true; } })();
const USE_SMAA = (() => { try { return new URLSearchParams(location.search).get('aa') === 'smaa'; } catch { return false; } })();
let dbgCam: { pos: THREE.Vector3; at: THREE.Vector3 } | null = null;     // review tool: window.regionViewer.cam(x,y,z, tx,ty,tz) holds the camera still; cam() releases it
let fxOn = true;
const ctxLostEl = document.createElement('div');
ctxLostEl.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:9999;display:none;padding:10px 18px;border-radius:12px;background:rgba(160,24,24,0.92);color:#fff;font:600 13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.45);pointer-events:none';
ctxLostEl.textContent = 'GPU memory exhausted (WebGL context lost) — close other GPU apps/models or reload';
document.body.appendChild(ctxLostEl);
let glContextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  glContextLost = true;
  ctxLostEl.style.display = 'block';
  try { cineFade.style.opacity = '0'; } catch { /* not created yet */ }
  console.warn('[apex] WebGL context lost (likely GPU VRAM pressure) — waiting for GPU restore');
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  glContextLost = false;
  ctxLostEl.style.display = 'none';
  console.warn('[apex] WebGL context restored');
});
if (!USE_WEBGPU) try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // the scene is drawn into the composer's read buffer: match depthTexture pixel dimensions to renderTarget2 (pixelRatio-scaled)
  const initPr = renderer.getPixelRatio();
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(Math.max(1, Math.floor(innerWidth * initPr)), Math.max(1, Math.floor(innerHeight * initPr)));
  composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
  aoPass = new AoPass(camera, Math.max(320, Math.floor(innerWidth * 0.5)), Math.max(180, Math.floor(innerHeight * 0.5)));
  composer.addPass(aoPass);
  composer.setSize(innerWidth, innerHeight);
  // Quarter-res bloom (capped at 480x270): visually identical wide glow at ~4x lower GPU fill & bandwidth across 11 blur passes
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.min(480, Math.max(160, Math.floor(innerWidth * 0.25))), Math.min(270, Math.max(90, Math.floor(innerHeight * 0.25)))),
    0.34, 0.45, 1.45
  );
  composer.addPass(bloomPass);
  // cinematic pass: speed blur toward screen edges, depth-occluded 8-tap jittered volumetric Mie sun shafts, lens rain, vibrance, vignette, grain,
  // plus fused AgX filmic tone mapping + sRGB encode when GradePass is inactive (saves an entire full-res HalfFloat pass)
  cinePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tSkyMask: { value: null }, uHasSkyMask: { value: 1 },
      uSpeed: { value: 0 }, uSun: { value: new THREE.Vector2(0.5, 0.8) }, uShaft: { value: 0 },
      uTime: { value: 0 }, uVig: { value: 0.28 }, uAspect: { value: 1.6 }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      uToneMap: { value: 1 }, uExposure: { value: 1.08 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse, tSkyMask; uniform float uHasSkyMask, uSpeed, uShaft, uTime, uVig, uAspect, uToneMap, uExposure; uniform vec2 uSun; uniform vec3 uSunCol;
      varying vec2 vUv;
      ${LENS_RAIN_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 sanitizeHdr(vec3 c) {
        return vec3(
          !(c.r > 0.0) ? 0.0 : min(c.r, 48.0),
          !(c.g > 0.0) ? 0.0 : min(c.g, 48.0),
          !(c.b > 0.0) ? 0.0 : min(c.b, 48.0)
        );
      }
      // Troy Sobotka's AgX filmic tone mapping (prefixed to never collide with Three.js built-in agxDefaultContrastApprox)
      vec3 apexAgxContrast(vec3 x) {
        vec3 x2 = x * x;
        vec3 x4 = x2 * x2;
        return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
      }
      vec3 apexAgxToneMap(vec3 c, float expVal) {
        const mat3 agxIn = mat3(
          0.842479062253094,  0.0423282422610123, 0.0423756549057051,
          0.0784335999999992, 0.878468636469772,  0.0784336,
          0.0792237451477643, 0.0791661274605434, 0.879142973793104
        );
        const mat3 agxOut = mat3(
           1.19687900512017,   -0.0528968517574562, -0.0529716355144438,
          -0.0980208811401368,  1.15190312990417,   -0.0980434501171241,
          -0.0990297440797205, -0.0989611768448433,  1.15107367264116
        );
        vec3 safeIn = sanitizeHdr(c) * max(expVal, 0.01);
        vec3 v = max(agxIn * safeIn, vec3(1e-5));
        v = (clamp(log2(v), -12.47393, 4.026069) + 12.47393) / (4.026069 + 12.47393);
        v = clamp(agxOut * apexAgxContrast(v), 0.0, 1.0);
        // Subtle photographic punch (guard pow base >= 1e-5 so D3D11 never hits pow(0.0, 1.05) = NaN)
        float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
        vec3 punched = pow(max(v, vec3(1e-5)), vec3(1.05));
        return clamp(mix(vec3(l), punched, 1.07), 0.0, 1.0);
      }
      void main() {
        vec2 c = vec2(0.5, 0.42);
        vec2 d = vUv - c;
        float rd = length(d * vec2(uAspect, 1.0));
        // speed blur: samples pulled toward the vanishing point, none in the center so the car and road ahead stay sharp
        float amt = uSpeed * 0.06 * smoothstep(0.10, 0.75, rd);
        vec3 col = vec3(0.0);
        float ca = (0.0007 + uSpeed * 0.0012) * rd;
        if (amt <= 0.0008) {
          col = vec3(
            texture2D(tDiffuse, clamp(vUv + d * ca, vec2(0.001), vec2(0.999))).r,
            texture2D(tDiffuse, vUv).g,
            texture2D(tDiffuse, clamp(vUv - d * ca, vec2(0.001), vec2(0.999))).b
          );
        } else {
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            float t = float(i) / 5.0;
            acc += sanitizeHdr(texture2D(tDiffuse, clamp(vUv - d * amt * t, vec2(0.001), vec2(0.999))).rgb);
          }
          acc /= 6.0;
          col = vec3(
            mix(acc.r, texture2D(tDiffuse, clamp(vUv + d * ca, vec2(0.001), vec2(0.999))).r, 0.45),
            acc.g,
            mix(acc.b, texture2D(tDiffuse, clamp(vUv - d * ca, vec2(0.001), vec2(0.999))).b, 0.45)
          );
        }
        col = sanitizeHdr(col);
        float j = hash(vUv * 1000.0 + uTime);
        // Depth-occluded volumetric Mie sun shafts: 8 jittered march steps gated by true half-res sky occlusion (tSkyMask.b)
        // so skyscrapers, bridges & tree canopies cast authentic crepuscular god rays without white buildings glowing falsely.
        float sunDist = length((uSun - vUv) * vec2(uAspect, 1.0));
        if (uShaft > 0.01 && sunDist < 1.35) {
          vec2 ds = (uSun - vUv) / 8.0;
          vec2 p = vUv + ds * j;
          vec3 accS = vec3(0.0);
          float w = 1.0;
          for (int i = 0; i < 8; i++) {
            vec2 cp = clamp(p, vec2(0.001), vec2(0.999));
            vec3 s = sanitizeHdr(texture2D(tDiffuse, cp).rgb);
            float l = dot(s, vec3(0.3, 0.59, 0.11));
            float skyVis = uHasSkyMask > 0.5 ? clamp(texture2D(tSkyMask, cp).b, 0.0, 1.0) : smoothstep(1.15, 2.5, l);
            float sampleAmt = uHasSkyMask > 0.5 ? skyVis * (0.45 + 0.55 * smoothstep(0.45, 1.8, l)) : skyVis;
            accS += mix(uSunCol * 1.1, s, 0.52) * sampleAmt * w;
            w *= 0.85;
            p += ds;
          }
          float phaseBase = max(1e-4, 1.0 - sunDist * 0.72);
          float phase = pow(phaseBase, 1.75);
          col += accS * 0.095 * uSunCol * uShaft * (0.18 + 0.82 * phase);
        }
        float lensMask, lensShade, lensSparkle;
        vec2 refractedUv = lensRainUv(vUv, lensMask, lensShade, lensSparkle);
        if (lensMask > 0.001) col = mix(col, sanitizeHdr(texture2D(tDiffuse, clamp(refractedUv, vec2(0.001), vec2(0.999))).rgb) * lensShade + vec3(lensSparkle), clamp(lensMask, 0.0, 1.0));
        // Subtle AAA photographic clarity: clean vibrance without muddying skies or crushing shadow detail
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
        col = mix(vec3(luma), col, 1.0 + 0.10 * (1.0 - clamp(sat * 1.4, 0.0, 1.0)));
        // vignette and fine film grain
        col *= 1.0 - uVig * smoothstep(0.38, 1.08, rd);
        col += (j - 0.5) * 0.008;
        if (uToneMap > 0.5) col = apexAgxToneMap(col, uExposure);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  cinePass.uniforms.tSkyMask.value = aoPass.maskTexture;
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
  // AMD FidelityFX FSR 1.0 (EASU directional upscale + RCAS sharpening) — matches Vesselbound's Intel iGPU profile
  fsr1Pass = new Fsr1WebGLPass({ sharpness: 0.30 });
  fsr1Pass.enabled = fsrEnabled;
  composer.addPass(fsr1Pass);
} catch (e) { console.warn('post effects unavailable', e); composer = null; }

let meta: RegionMeta;
let heights: Float32Array;
let hiRes = false;                                   // the 6 m height grid and 4 m ground texture (tools/build_terrain_hi.py); ?hires=0 turns it off
let terrain: THREE.Group;
let terrainMat: THREE.MeshStandardMaterial;
const circuitGroup = new THREE.Group();
circuitGroup.name = 'circuits';
const labelGroup = new THREE.Group();
labelGroup.name = 'labels';
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
    if (TERRAIN_LOD) {
    // On WebGPU mid/low iGPUs, use 240-cell tiles (2,880 m wide, corner radius 2,036 m -> ~42 tiles instead of 72!)
    // with LOD 0 out to 2650 m (> 2036 m + 614 m buffer so terrain under & ahead of roads NEVER drops to coarse LOD 1!)
    const tv = (USE_WEBGPU && perfTier !== 'high') ? 240 : 144;
    const lodD = (USE_WEBGPU && perfTier !== 'high') ? [0, 2650, 4400, 7000] : [0, 1700, 3200, 5800];
    populateTerrainLOD(terrain, terrainMat, nx, ny, pos, uv, nor, tv, lodD);
  } else populateTiledTerrain(terrain, terrainMat, nx, ny, pos, uv, nor, 8, 6);
    return;
  }
  terrV.value.set(meta.width * meta.mpp, meta.height * meta.mpp); terrO.value.set(GRID.ox, GRID.oz);
  const tex = new THREE.TextureLoader().load(BASE + (hiRes ? 'albedo_hi.jpg' : 'albedo.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (USE_WEBGPU && tslRegionCtx) {
    webgpuTerrainHandle = createApexIronportTerrainTslMaterial({
      albedoMap: tex,
      maskMap: loadedCityMaskTex ?? maskTex,
      classMap: classTex,
      asphaltMap: loadPbr1K('ground_asphalt_dry.png', true, 0x35373c, 1024),
      paveMap: loadPbr1K('ground_concrete_sidewalk.png', true, 0xa2a09a, 512),
      grassMap: loadPbr1K('ground_grass_meadow.png', true, 0x3f642c, 512),
      forestMap: loadPbr1K('ground_forest_floor.png', true, 0x2a3b1e, 512),
      maskVec,
      terrSize: terrV.value,
      terrOrigin: terrO.value,
      edge: edgeU.value,
      shared: tslRegionCtx.shared,
      gi: tslRegionCtx.gi,
      leanMode: perfTier !== 'high',
    });
    terrainMat = webgpuTerrainHandle.material as unknown as THREE.MeshStandardMaterial;
  } else {
    terrainMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, transparent: false });
    applyTerrainDetail(terrainMat);
    csmSetup(terrainMat);
  }
  terrain = new THREE.Group();
  terrain.name = 'terrain-tiles';
  if (TERRAIN_LOD) {
    const tv = (USE_WEBGPU && perfTier !== 'high') ? 240 : 144;
    const lodD = (USE_WEBGPU && perfTier !== 'high') ? [0, 2650, 4400, 7000] : [0, 1700, 3200, 5800];
    populateTerrainLOD(terrain, terrainMat, nx, ny, pos, uv, nor, tv, lodD);
  } else populateTiledTerrain(terrain, terrainMat, nx, ny, pos, uv, nor, 8, 6);
  scene.add(terrain);
  // water: region footprint, extended far to the west so the Great Lake runs to the horizon
  const rw = meta.width * meta.mpp, rh = meta.height * meta.mpp, ext = 60000;
  edgeU.value.set(rw / 2, rh / 2);                                               // half extents of the map, for the soft edge fade
  waterSurface = new WaterSurface(scene, rw, rh, ext, edgeU.value, GRID.ox - rw / 2, GRID.oz - rh / 2, atmosphere, (x, z) => hAt(x, z));
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

const stdMatPool = new Map<string, THREE.MeshStandardMaterial>();
function stdMat(color: number, rough = 0.85, metal = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${rough.toFixed(2)}|${metal.toFixed(2)}`;
  let m = stdMatPool.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    stdMatPool.set(key, m);
  }
  return m;
}
function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, parent: THREE.Object3D, metal = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(color, 0.7, metal));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
let craneSeed = 1;
function craneGroup(): THREE.Group {
  // Plajah Industrial Library ship-to-shore A-frame container gantry crane (portal legs, stay cables, trolley cab & boom)
  return quayCrane(craneSeed++);
}
function shipGroup(type: string, len: number, beam: number): THREE.Group {
  // local +x is the bow: flared hull with crimson anti-fouling boot-top, bridge wings, tinted navigation windows, radar mast & corrugated ISO containers
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, -beam / 2);
  shape.lineTo(len * 0.28, -beam / 2);
  shape.quadraticCurveTo(len * 0.46, -beam * 0.35, len / 2, 0);
  shape.quadraticCurveTo(len * 0.46, beam * 0.35, len * 0.28, beam / 2);
  shape.lineTo(-len / 2, beam / 2);
  shape.closePath();
  const lowGeo = new THREE.ExtrudeGeometry(shape, { depth: 7.5, bevelEnabled: false });
  lowGeo.rotateX(-Math.PI / 2);
  const lowHull = new THREE.Mesh(lowGeo, stdMat(0x7a1e18, 0.72, 0.12));
  lowHull.position.y = -8;
  g.add(lowHull);
  const upGeo = new THREE.ExtrudeGeometry(shape, { depth: 8.5, bevelEnabled: false });
  upGeo.rotateX(-Math.PI / 2);
  const upHull = new THREE.Mesh(upGeo, stdMat(type === 'container' ? 0x22384e : 0x2f4a6b, 0.68, 0.22));
  upHull.position.y = -0.5;
  g.add(upHull);
  box(len * 0.96, 0.7, beam * 0.96, 0x4b5056, 0, 8.2, 0, g, 0.15);
  // Multi-tier accommodation block + cantilevered bridge wings + panoramic dark windows + radar mast
  const bx = -len / 2 + 20;
  box(16, 20, beam * 0.72, 0xe8eaee, bx, 18.5, 0, g);
  box(10, 4.0, beam * 1.02, 0xe8eaee, bx + 2, 27.5, 0, g);
  box(10.3, 1.8, beam * 0.94, 0x101c28, bx + 2.4, 27.8, 0, g, 0.65);
  box(5, 8.5, 5, 0xc23b2b, bx - 6, 32, 0, g, 0.2);
  box(0.55, 11, 0.55, 0x9aa2aa, bx + 2, 35, 0, g, 0.55);
  if (type === 'container') {
    const cols = [0x2f6fb0, 0xc9482e, 0x3e9a5a, 0xd8a52a, 0x8a8f96, 0x5b3f8a];
    const bays = Math.floor((len * 0.62) / 12.6);
    const across = Math.floor((beam - 6) / 2.7);
    const geo = new THREE.BoxGeometry(12.2, 2.6, 2.5);
    const im = new THREE.InstancedMesh(geo, shippingContainerMaterials(), bays * across * 4);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    for (let b = 0; b < bays; b++) for (let a = 0; a < across; a++) {
      const tiers = 1 + ((b * 7 + a * 3) % 4);
      for (let t = 0; t < tiers; t++) {
        m4.makeTranslation(-len / 2 + 44 + b * 12.6 + 6, 9.7 + t * 2.62, (a - (across - 1) / 2) * 2.7);
        im.setMatrixAt(n, m4);
        im.setColorAt(n, col.setHex(cols[(b * 5 + a * 3 + t) % cols.length]));
        n++;
      }
    }
    im.count = n;
    g.add(im);
  } else {
    for (let i = 0; i < 5; i++) box(24, 3.2, beam * 0.68, 0x5c6058, -len / 2 + 50 + i * 30, 9.8, 0, g, 0.2);
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
  bol.forEach((b, i) => { m4.makeTranslation(b[0], b[1] + 0.5, b[2]); bIm.setMatrixAt(i, m4); worldPhys.addBreakable(b[0], b[1], b[2], 'bollard', 0.65); });
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
  const cIm = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.5), shippingContainerMaterials(), Math.max(cells.length, 1));
  const col = new THREE.Color(), rq = new THREE.Matrix4().makeRotationY(phi);
  cells.forEach((c, i) => { m4.makeTranslation(c.x, c.y, c.z).multiply(rq); cIm.setMatrixAt(i, m4); cIm.setColorAt(i, col.setHex(c.c)); });
  cIm.castShadow = cIm.receiveShadow = true;
  cIm.frustumCulled = false;
  harborGroup.add(cIm);

  // transit sheds and warehouses: textured corrugated steel siding + weathered steel roof trim instead of plain untextured boxes
  const shedTex = new THREE.TextureLoader().load('/games/apex/ironport/textures-v3/shared/tex-shared-21-corrugated-steel_base.jpg');
  shedTex.colorSpace = THREE.SRGBColorSpace; shedTex.wrapS = shedTex.wrapT = THREE.RepeatWrapping; shedTex.repeat.set(8, 2); shedTex.anisotropy = 4;
  const shedNrm = new THREE.TextureLoader().load('/games/apex/ironport/textures-v3/shared/tex-shared-21-corrugated-steel_nrm.jpg');
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
  h.tanks.forEach((t, i) => { m4.makeTranslation(t[0], Math.max(hAt(t[0], t[1]), 1.6) * exag + 8, t[1]); tIm.setMatrixAt(i, m4); worldPhys.addSolidCylinder(t[0], t[1], 9.2, 'pillar'); });
  harborGroup.add(tIm);
  // gantry cranes
  for (const c of h.cranes) {
    const g = craneGroup();
    g.position.set(c.c[0], Math.max(hAt(c.c[0], c.c[1]), 1.6) * exag, c.c[1]);
    g.rotation.y = phi + (c.dir < 0 ? Math.PI : 0);
    harborGroup.add(g);
    worldPhys.addSolidBox(c.c[0], c.c[1], 8.5, 14, g.rotation.y, 'pillar');
  }
  // ships
  for (const b of h.berths) {
    const g = shipGroup(b.type, b.len, b.beam);
    g.position.set(b.c[0], 0, b.c[1]);
    g.rotation.y = phi;
    harborGroup.add(g);
    // Escort harbor tugboat berthed right off each ship's bow/quarter
    const tug = new THREE.Group();
    tug.position.set(b.c[0] + ex[0] * (b.len * 0.42), 0, b.c[1] + ex[1] * (b.len * 0.42) + 28);
    tug.rotation.y = phi + 0.25;
    box(22, 3.0, 8.2, 0x7a1e18, 0, -0.6, 0, tug, 0.12);
    box(23, 2.2, 8.6, 0x1e262e, 0, 1.8, 0, tug, 0.25);
    box(10, 4.0, 6.0, 0xb82e24, -1.5, 4.6, 0, tug, 0.18);
    box(6.0, 3.4, 5.2, 0xeaece8, 0.5, 8.2, 0, tug, 0.08);
    box(1.4, 4.6, 1.4, 0xc83c24, -4.0, 8.4, 0, tug, 0.22);
    harborGroup.add(tug);
  }
  // Additional moored Great Lakes shipping vessels along deepwater harbor approach + working yard RTG straddle cranes & reach stackers
  {
    const extraBerths: [number, number, 'container' | 'bulk', number, number, number][] = [
      [5840, -1620, 'container', 210, 32, phi],
      [5480, -1040, 'bulk', 185, 28, phi + 0.12],
      [6020, -1480, 'container', 195, 30, phi],
    ];
    for (const [sx, sz, stype, slen, sbeam, srot] of extraBerths) {
      if (hAt(sx, sz) < -0.5) {
        const sg = shipGroup(stype, slen, sbeam);
        sg.position.set(sx, 0, sz);
        sg.rotation.y = srot;
        harborGroup.add(sg);
      }
    }
    const rtgY = stdMat(0xe0a21c, 0.45, 0.55), rtgR = stdMat(0xc23526, 0.48, 0.45), rtgD = stdMat(0x23262b, 0.85, 0.25);
    for (const t of h.terminals) {
      const ey = [-ex[1], ex[0]];
      for (const frac of [-0.28, 0.22]) {
        const rx = t.c[0] + ex[0] * t.w * frac, rz = t.c[1] + ex[1] * t.w * frac;
        if (hAt(rx, rz) < 1.3) continue;
        const gy = Math.max(hAt(rx, rz), 1.6) * exag;
        const rtg = new THREE.Group();
        rtg.position.set(rx, gy, rz);
        rtg.rotation.y = phi;
        const span = 22;
        for (const sx of [-4.4, 4.4]) {
          for (const sz of [-span * 0.5, span * 0.5]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 16, 1.1), rtgY); leg.position.set(sx, 8, sz); rtg.add(leg);
            const bog = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.6), rtgD); bog.position.set(sx, 0.8, sz); rtg.add(bog);
          }
          const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, span + 1.2), rtgR); beam.position.set(sx, 16.3, 0); rtg.add(beam);
        }
        const spr = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.9, 2.5), rtgR); spr.position.set(0, 12.0, 0); rtg.add(spr);
        harborGroup.add(rtg);
        // Reach stacker & yard tractor staged beside terminal aisle
        const rsx = rx + ey[0] * (span * 0.65), rsz = rz + ey[1] * (span * 0.65);
        if (hAt(rsx, rsz) >= 1.3) {
          const rs = new THREE.Group(); rs.position.set(rsx, gy, rsz); rs.rotation.y = phi + 0.35;
          box(6.5, 2.0, 3.0, 0xc23526, 0, 1.5, 0, rs, 0.35);
          const bm = box(8.0, 0.8, 0.9, 0x262b30, 2.1, 4.3, 0, rs, 0.6); bm.rotation.z = 0.48;
          box(4.6, 0.45, 2.4, 0xe0a21c, 5.5, 6.2, 0, rs, 0.45);
          harborGroup.add(rs);
        }
      }
    }
  }
  harborGroup.add(harborDetail(h, (x, z) => Math.max(hAt(x, z), 1.6) * exag));
  // rail yard
  for (const r of h.rail) {
    const pts: number[][] = [];
    for (let i = 0; i <= 30; i++) pts.push([r[0][0] + (r[1][0] - r[0][0]) * i / 30, r[0][1] + (r[1][1] - r[0][1]) * i / 30]);
    harborGroup.add(ribbon(pts, null, 3.2, 0x57534d, 0.4));
    harborGroup.add(ribbon(pts, null, 0.35, 0xb8b2a6, 0.5));
  }
  mergeStaticScenery(harborGroup, 600);
  apexLighting.registerHarborLights(h, hAt);
  scheduleCullerReindex();
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
streetGroup.name = 'streets';
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
    const lx = p[0] + nx, lz = p[1] + nz, rx = p[0] - nx, rz = p[1] - nz;
    // Sample BOTH bilinear height and the actual drawn stride-2 terrain mesh across center, left & right
    // so neither side-slopes nor terrain triangle ridges can ever poke up or peel through the pavement.
    const sC = Math.max(hAt(p[0], p[1]) * exag, meshH(p[0], p[1]));
    const sL = Math.max(hAt(lx, lz) * exag, meshH(lx, lz));
    const sR = Math.max(hAt(rx, rz) * exag, meshH(rx, rz));
    const yL = Math.max(sL, sC) + lift;
    const yR = Math.max(sR, sC) + lift;
    acc.pos.push(lx, yL, lz, rx, yR, rz);
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
  const mm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po * 2 }));
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
  rebuildMapRoads();
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
      // never on the new street circuits' courses (they run along town streets, and a parked car is solid): downtown's are as they were
      skip: (x, z) => roadDist(x, z) < 9 || hAt(x, z) < 2.5 || insideBuilding(x, z, 0.8) || !!(simLayer?.junctions.near(x, z, 3)) || onCourse(x, z, 1, [IND, HARB, CIV]),
      onLoaded: () => scheduleCullerReindex(),
    });
    furnitureGroup.add(parked.group);
    for (const pc of parked.cars) worldPhys.addSolidBox(pc.x, pc.z, 0.96, 2.25, pc.yaw, 'car');
  }
  if (!refDress) {
    refDress = buildReferenceDressing({
      ground: (x, z) => meshH(x, z), water: (x, z) => hAt(x, z) < 2.5, building: (x, z, m) => insideBuilding(x, z, m), roadDist: (x, z) => roadDist(x, z),
      paved: countryScenes.pavedRuns, shore: shoreHw, industrial: meta.circuits[IND]?.xz.map((q) => ({ x: q[0], z: q[1] })), mouths: countryScenes.driveMouths,
      course: (x, z, extra) => onCourse(x, z, extra ?? 0),
      streets: streetRuns.map((r) => ({ line: r.p.map(([x, z]) => ({ x, z })), half: ({ street: 4.25, arterial: 7, freeway: 6.25, ramp: 2.75 } as Record<string, number>)[r.c] ?? 4.25 })),
    });
    furnitureGroup.add(refDress.group);
    mergeStaticScenery(refDress.group, 500);
    scheduleCullerReindex();
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
        if (roadDist(x, z) < 8 || crossing(x, z, ri) || hAt(x, z) < 1.2 || trenchHole(x, z)) continue;
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
      const segLen = Math.hypot(qx - px, qz - pz);
      if (segLen < 0.2 || hAt(px + sx, pz + sz) < 1.2 || hAt(qx + sx, qz + sz) < 1.2 || trenchHole(mx + sx, mz + sz)) continue;
      const y0p = meshH(px + sx, pz + sz) + 0.01, y0q = meshH(qx + sx, qz + sz) + 0.01;
      // Civil-engineering guard: skip impossible vertical/cliff curb shards and drape outer sidewalk slab cleanly to terrain
      if (Math.abs(y0q - y0p) / segLen > 0.24) continue;
      const exP = px + sx + nx * SLAB, ezP = pz + sz + nz * SLAB;
      const exQ = qx + sx + nx * SLAB, ezQ = qz + sz + nz * SLAB;
      const ySlabP = Math.max(y0p + H - 0.22, Math.min(y0p + H + 0.22, meshH(exP, ezP) + 0.06));
      const ySlabQ = Math.max(y0q + H - 0.22, Math.min(y0q + H + 0.22, meshH(exQ, ezQ) + 0.06));
      const A0 = [px + sx, y0p, pz + sz], B0 = [qx + sx, y0q, qz + sz], A1 = [px + sx, y0p + H, pz + sz], B1 = [qx + sx, y0q + H, qz + sz];
      const C1 = [px + sx + nx * TOP, y0p + H, pz + sz + nz * TOP], D1 = [qx + sx + nx * TOP, y0q + H, qz + sz + nz * TOP];
      const E1 = [exP, ySlabP, ezP], F1 = [exQ, ySlabQ, ezQ];
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
  const curbMap = loadPbr1K('ground_curb_granite.png', true, 0x8e8d88, 512);
  const curbNorm = loadPbr1K('ground_curb_granite_normal.png', false, 0x8080ff, 512);
  const curbRough = loadPbr1K('ground_curb_granite_roughness.png', false, 0xd0d0d0, 512);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: curbMap, normalMap: curbNorm, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: curbRough, vertexColors: true, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide }));
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
    const man = (await (await fetch('/games/apex/sprites/manifest.json')).json()) as { file: string; w: number; h: number; cat: string }[];
    const load = (e: { file: string; w: number; h: number; cat: string }): Promise<SpriteDef> => new Promise((res) => {
      new THREE.TextureLoader().load('/games/apex/sprites/' + e.file, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
        res({ file: e.file, w: e.w, h: e.h, tex: t, kind: e.cat });
      }, undefined, () => {
        const dt = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
        dt.needsUpdate = true;
        res({ file: e.file, w: e.w, h: e.h, tex: dt, kind: e.cat });
      });
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
  mat.customProgramCacheKey = () => (lod ? 'treecard-lod-v3' : 'treecard-v3');
}
function addTreeCards(parent: THREE.Object3D, list: { x: number; z: number; def: SpriteDef; h: number }[], lod = false): void {
  const by = new Map<SpriteDef, typeof list>();
  for (const t of list) { if (!by.has(t.def)) by.set(t.def, []); by.get(t.def)!.push(t); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const CELL_SZ = (USE_WEBGPU && perfTier !== 'high') ? 2600 : 1800;
  by.forEach((arr, def) => {
    const mkey = def.file + (lod ? ':lod' : '');
    let mat = spriteMats.get(mkey);
    if (!mat) {
      if (USE_WEBGPU && tslRegionCtx) {
        mat = createApexTreeCardLodTslMaterial(def.tex, tslRegionCtx.foliage, tslRegionCtx.gi) as unknown as THREE.MeshStandardMaterial;
      } else {
        // Higher alphaTest (0.76) cuts out the dark semi-transparent matte halo baked into sprite PNG edges
        mat = new THREE.MeshStandardMaterial({ map: def.tex, alphaTest: 0.76, side: THREE.DoubleSide, roughness: 0.94, metalness: 0 });
        if (lod) cardLod(mat);
        patchTreeCard(mat, lod);
      }
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
      chunkList.push({ m: im, cx: bs.center.x, cz: bs.center.z, r: bs.radius, baseCastShadow: false, maxDist: (USE_WEBGPU && perfTier !== 'high') ? 900 : 1750, maxShadowDist: 0 });
    }
  });
}
interface TreeLayer { group: THREE.Group; setWind(w: number): void; setQuality(scale: number): void; update(dt: number, cam: THREE.Vector3): void }
const treeFields: TreeLayer[] = [];
let grassField: GrassField | null = null;
const IND = 'ironworks_industrial_circuit';                // the street course through the port, the refinery and the freight yard (North Harbor Circuit II)
const CIV = 'civic_riverfront_circuit';                    // the street course along the civic riverfront (Civic Riverfront Street Circuit)
let civicPath: { x: number; z: number }[] = [];
let civicNear: ((x: number, z: number, r: number) => boolean) | null = null;
let civicYs: number[] | undefined;
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
function mkTrees(pts: number[][], h: (x: number, z: number) => number, ex: () => number, syncCardLod = false): TreeLayer {
  try { return new EzTreeField(pts, h, ex, syncCardLod); } catch (e) { console.warn('high-quality trees unavailable, using simple trees', e); return new TreeField(pts, h, ex); }
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
  for (const r of countryNet?.roads ?? []) {
    if (r.kind === 'drive') continue;
    for (let i = 0; i < r.xz.length - 1; i++) {
      const a = r.xz[i], b = r.xz[i + 1], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
      for (let k = 0; k <= steps; k++) add(a[0] + (b[0] - a[0]) * (k / steps), a[1] + (b[1] - a[1]) * (k / steps));
    }
  }
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
  if (civicNear && civicNear(x, z, 10 + extra)) return false;
  if (portData && inPort(portData, x, z, 14 + extra)) return false;
  if (utilData && inPort({ platform: utilData.platform } as PortData, x, z, 14 + extra)) return false;
  if (simLayer && simLayer.near(x, z, 7 + extra)) return false;
  if (townWalks && townWalks.near(x, z, extra)) return false;
  if (parkingLots && parkingLots.near(x, z, 3 + extra)) return false;
  return true;
}
/** Tighter roadside clearance for low 3D grass, wildflowers & farm crops so lush verge grass hugs both shoulders right up to the asphalt without ever growing ON tarmac. */
function grassOk(x: number, z: number): boolean {
  if (hAt(x, z) <= 1.55) return false;
  if (paintedRoad(x, z, 0.45, true)) return false;
  if (onCourse(x, z, 1.1, TARMAC_CIRCUITS)) return false;
  if (countryScenes && (countryScenes.pavedNear(x, z, 1.05) || countryScenes.dirtNear(x, z, 0.35))) return false;
  if (insideBuilding(x, z, 1.0)) return false;
  if (bridgeNear && bridgeNear(x, z, 8.5)) return false;
  if (indNear && indNear(x, z, 6.5)) return false;
  if (harborNear && harborNear(x, z, 6.5)) return false;
  if (civicNear && civicNear(x, z, 6.5)) return false;
  if (portData && inPort(portData, x, z, 10)) return false;
  if (utilData && inPort({ platform: utilData.platform } as PortData, x, z, 10)) return false;
  if (simLayer && simLayer.near(x, z, 4.5)) return false;
  if (townWalks && townWalks.near(x, z, 0.2)) return false;
  if (parkingLots && parkingLots.near(x, z, 1.2)) return false;
  return true;
}
const worldPhys = new WorldCollisionAndBreakables();
scene.add(worldPhys.group);
const forestGroup = new THREE.Group();
forestGroup.name = 'forest';
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
  const leanCards = USE_WEBGPU && perfTier !== 'high';
  for (const p of pts) {
    const set = p[2] ? sp.conifer : sp.broad;
    // On WebGPU mid/low iGPUs, use 1 shared conifer + 1 shared broadleaf card atlas (cuts distant forest card draws 3x!)
    const def = leanCards ? set[0] : set[Math.floor(((p[0] * 31 + p[1] * 17) % 1 + 1) % 1 * set.length)];
    list.push({ x: p[0], z: p[1], def, h: (p[2] ? 15 + p[3] * 9 : 13 + p[3] * 7) });
  }
  for (const p of pts) {
    const s = p[4] ?? 1;
    if (s < 0.52) worldPhys.addBreakable(p[0], hAt(p[0], p[1]) * exag, p[1], 'sapling', 0.65);
    else worldPhys.addSolidCylinder(p[0], p[1], Math.max(0.45, Math.min(0.82, 0.52 * s)), 'tree');
  }
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
    // back-yard trees behind the houses (tools/relay_houses.py) — strictly filtered off roads & intersections
    const yt = await fetch(BASE + 'yard_trees.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as number[][] | null;
    if (yt) for (const t of yt) if (vegOk(t[0], t[1], 1.5)) verge.push(t);
  }
  const vlist = verge.map((p) => {
    const set = p[2] ? sp.conifer : sp.broad;
    return { x: p[0], z: p[1], def: set[Math.floor(rr() * set.length)], h: (p[2] ? 15 + p[3] * 9 : 13 + p[3] * 7) * p[4] };
  });
  // Combine forest + verge into ONE single card set & ONE single EzTreeField (cuts forest draw calls in half with zero visual change!)
  addTreeCards(forestGroup, list.concat(vlist), true);
  const combinedTreePts = pts.concat(verge);
  const tf = mkTrees(combinedTreePts, hAt, () => exag, true);
  if (USE_WEBGPU && perfTier !== 'high') tf.setQuality(perfTier === 'low' ? 0.58 : 0.76);
  forestGroup.add(tf.group); treeFields.push(tf);
  for (const p of verge) {
    const s = p[4] ?? 1;
    if (s < 0.55) worldPhys.addBreakable(p[0], hAt(p[0], p[1]) * exag, p[1], 'sapling', 0.65);
    else worldPhys.addSolidCylinder(p[0], p[1], Math.max(0.44, Math.min(0.76, 0.48 * s)), 'tree');
  }
  console.log('verge trees', verge.length);
  // real grass around the camera, hugging both highway/rural verges cleanly while staying strictly off asphalt and buildings
  if (!location.search.includes('veg=old')) {
    if (!vegetation) {
      vegetation = new Vegetation({ rw: meta.width * meta.mpp, rh: meta.height * meta.mpp, classUrl: BASE + 'landclass.png', albedoUrl: BASE + 'albedo.jpg', ground: meshH, ok: (x, z) => grassOk(x, z) });
      scene.add(vegetation.group);
    }
  } else {
  grassField = new GrassField({ rw: meta.width * meta.mpp, rh: meta.height * meta.mpp, albedoUrl: BASE + 'albedo.jpg', ground: meshH, ok: (x, z) => growable(x, z, 6.5, 2.5, true) });
  forestGroup.add(grassField.group);
  duneDetail({ width: meta.width * meta.mpp, depth: meta.height * meta.mpp, albedo: BASE + 'albedo.jpg', ground: meshH, clear: (x, z) => growable(x, z, 13, 5, true) }).then((group) => forestGroup.add(group)).catch((e) => console.warn('dune detail failed', e));
  }
}

// ---------- streetscape: street trees and street lights ----------
const scapeGroup = new THREE.Group();
scapeGroup.name = 'scape';
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
  { const tf = mkTrees(okTrees.map((t) => { const leaf = autumnLeaf(t[0], t[1], t[3]); return leaf === undefined ? [t[0], t[1], 0, t[3], 0.62 * t[2] + 0.2] : [t[0], t[1], 0, t[3], 0.62 * t[2] + 0.2, leaf]; }), hAt, () => exag); if (USE_WEBGPU && perfTier !== 'high') tf.setQuality(perfTier === 'low' ? 0.18 : 0.22); scapeGroup.add(tf.group); treeFields.push(tf); }
  for (const t of okTrees) {
    if (t[2] < 0.85) worldPhys.addBreakable(t[0], hAt(t[0], t[1]) * exag, t[1], 'sapling', 0.55);
    else worldPhys.addSolidCylinder(t[0], t[1], 0.44 * t[2], 'tree');
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const zeroM4 = new THREE.Matrix4().makeScale(0, 0, 0);
  // street lights: spatially chunked into 450 m cells (pole, arm, emissive lamp head — individually smashable!)
  // Prevents all 3,477 downtown streetlights from drawing unculled across the entire city!
  const ln = lights.length;
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 8.6, 6);
  const armGeo = new THREE.BoxGeometry(0.1, 0.1, 2.4);
  const headGeo = new THREE.BoxGeometry(0.5, 0.14, 0.9);
  const poleMat = stdMat(0x3c4047, 0.6, 0.5);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe7ae });
  const e = new THREE.Euler();
  const lightCell = 450;
  const lightBuckets = new Map<string, number[][]>();
  for (const l of lights) {
    const k = `${Math.floor(l[0] / lightCell)},${Math.floor(l[1] / lightCell)}`;
    let b = lightBuckets.get(k);
    if (!b) { b = []; lightBuckets.set(k, b); }
    b.push(l);
  }
  const lightReach = (USE_WEBGPU && perfTier !== 'high') ? 320 : 620;
  for (const sub of lightBuckets.values()) {
    const pole = new THREE.InstancedMesh(poleGeo, poleMat, sub.length);
    const arm = new THREE.InstancedMesh(armGeo, poleMat, sub.length);
    const head = new THREE.InstancedMesh(headGeo, headMat, sub.length);
    sub.forEach((l, i) => {
      const gy = hAt(l[0], l[1]) * exag;
      q.setFromEuler(e.set(0, l[2], 0));
      m4.compose(new THREE.Vector3(l[0], gy + 4.3, l[1]), q.identity(), new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(i, m4);
      const fx = Math.sin(l[2]), fz = Math.cos(l[2]);
      m4.compose(new THREE.Vector3(l[0] + fx * 1.1, gy + 8.5, l[1] + fz * 1.1), q.setFromEuler(e.set(0, l[2], 0)), new THREE.Vector3(1, 1, 1));
      arm.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(l[0] + fx * 2.1, gy + 8.4, l[1] + fz * 2.1), q, new THREE.Vector3(1, 1, 1));
      head.setMatrixAt(i, m4);
      worldPhys.addBreakable(l[0], gy, l[1], 'pole', 0.55, () => {
        pole.setMatrixAt(i, zeroM4); pole.instanceMatrix.needsUpdate = true;
        arm.setMatrixAt(i, zeroM4); arm.instanceMatrix.needsUpdate = true;
        head.setMatrixAt(i, zeroM4); head.instanceMatrix.needsUpdate = true;
      });
    });
    for (const im of [pole, arm, head]) {
      im.name = 'street-light';
      im.userData.chunked = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.frustumCulled = true;
      scapeGroup.add(im);
      const bs = im.boundingSphere!;
      chunkList.push({ m: im, cx: bs.center.x, cz: bs.center.z, r: bs.radius, baseCastShadow: false, maxDist: lightReach, maxShadowDist: 0 });
    }
  }
  chunkInstanced(scapeGroup);
  const regLamps = apexLighting.registerStreetLights(lights, hAt, exag);
  console.log('streetscape', trees.length, 'trees', ln, 'lights (playkit clustered:', regLamps + ')');
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
    // cornice: only for legacy v1 plain boxes (v3/v4 models already have sculpted 3D parapets & tapered tops)
    if (MODELSET === 'v1') {
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
  const stone = new THREE.MeshStandardMaterial({ color: 0xdedbd4, map: sharedPbrTex('tex-shared-16-concrete-weathered', 'base'), normalMap: sharedPbrTex('tex-shared-16-concrete-weathered', 'nrm'), roughnessMap: sharedPbrTex('tex-shared-16-concrete-weathered', 'rgh'), roughness: 0.90, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dce0, map: sharedPbrTex('tex-shared-14-steel-panel', 'base'), normalMap: sharedPbrTex('tex-shared-14-steel-panel', 'nrm'), roughnessMap: sharedPbrTex('tex-shared-14-steel-panel', 'rgh'), roughness: 0.52, metalness: 0.55 });
  make(unit, stone, cornice, true);
  make(unit, metal, plant, false);
  make(unit, stone, pent, true);
  make(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 14), new THREE.MeshStandardMaterial({ color: 0xcab092, map: sharedPbrTex('tex-shared-18-timber-siding', 'base'), normalMap: sharedPbrTex('tex-shared-18-timber-siding', 'nrm'), roughness: 0.88 }), tanks, false);
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
  const t = new THREE.TextureLoader().load('/games/apex/tex/bld/tex-shared-06-granite_base.jpg');
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
  // v4 towers already have Plajah-modeled sculpted parapets, molded cornices, mechanical penthouses & spires (no repetitive setback boxes!)
  if (MODELSET === 'v4') return;
  type T = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number };
  const glass: T[] = [], stone: T[] = [];
  for (const it of items) {
    if (it.kind !== 'generic' || it.h < 48 || it.w < 12 || /house|bungalow|duplex|townhouse|barn|silo|tower-rural|windmill/.test(it.slug)) continue;
    const cx = it.bx ?? it.x, cz = it.bz ?? it.z, phi = it.rotY, c = Math.cos(phi), sn = Math.sin(phi);
    const gy = groundMin(it) - 0.35, top = gy + it.h;
    const at = (u: number, v: number): [number, number] => [cx + u * c + v * sn, cz - u * sn + v * c];
    // podium & corner piers: only for legacy v1 boxes (v3/v4 towers already have real 3D ground lobbies, doors, and sculpted piers)
    if (MODELSET === 'v1') {
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
  patchGlassInterior(gm, nightU, curtainU, sunDirU, false, apexLighting.uniforms);
  make(glass, gm);
  make(stone, stoneMaterial());
  console.log('tower geometry', { glassTiers: glass.length, stone: stone.length });
}

// ---------- city buildings ----------
interface CityItem { kind: 'hero' | 'generic'; slug: string; x: number; z: number; rotY: number; w: number; d: number; h: number; sx?: number; sy?: number; sz?: number; bx?: number; bz?: number }
const CITY_BATCH = !USE_WEBGPU && !location.search.includes('citybatch=0'); // WebGPU uses CityCellBatches / InstancedMesh (BatchedMesh loops per-instance drawIndexed without multi_draw)
let cityBatches: CityBatches | null = null;
let cityCellBatches: CityCellBatches | null = null;
let cityBroadcastLights: CityBroadcastLights | null = null;
let signatureTowers: IronportSignatureTowers | null = null;
let cityCoreReady = false;
let resolveCityCore: (() => void) | null = null;
const cityCorePromise = new Promise<void>((res) => { resolveCityCore = res; });
let cityFullyBuilt = false;
const cityGroup = new THREE.Group();
cityGroup.name = 'city';
scene.add(cityGroup);
// Ultra-fast 2-draw-call architectural skyline proxy for 60 FPS Map Overview mode (~55k tris instead of 95M tris at 4.9 km altitude!)
const mapSkylineGroup = new THREE.Group();
mapSkylineGroup.name = 'map-skyline';
mapSkylineGroup.visible = false;
scene.add(mapSkylineGroup);
const mapWorldProxyGroup = new THREE.Group();
mapWorldProxyGroup.name = 'map-world-proxy';
mapWorldProxyGroup.visible = false;
scene.add(mapWorldProxyGroup);
const mapRoadsGroup = new THREE.Group();
mapRoadsGroup.name = 'map-roads-overlay';
mapRoadsGroup.visible = false;
scene.add(mapRoadsGroup);

function rebuildMapRoads(): void {
  if (!meta) return;
  mapRoadsGroup.clear();
  const hwyPos: number[] = [], hwyIdx: number[] = [];
  const spinePos: number[] = [], spineIdx: number[] = [];
  const pavedPos: number[] = [], pavedIdx: number[] = [];
  const dirtPos: number[] = [], dirtIdx: number[] = [];
  const pushRibbon = (pts: number[][], width: number, lift: number, outPos: number[], outIdx: number[], ys?: number[]): void => {
    if (!pts || pts.length < 2) return;
    const base = outPos.length / 3;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * width * 0.5, nz = (dx / l) * width * 0.5;
      const y = (ys ? ys[i] : meshH(p[0], p[1])) + lift;
      outPos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
    }
    for (let i = 0; i < n - 1; i++) {
      const k = base + i * 2;
      outIdx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  };
  if (meta.freeway?.xz) {
    pushRibbon(meta.freeway.xz, 24, 1.4, hwyPos, hwyIdx);
    pushRibbon(meta.freeway.xz, 4.2, 1.75, spinePos, spineIdx);
  }
  if (meta.coastal_highway?.xz) {
    pushRibbon(meta.coastal_highway.xz, 18, 1.35, hwyPos, hwyIdx);
    pushRibbon(meta.coastal_highway.xz, 3.4, 1.7, spinePos, spineIdx);
  }
  if (shoreHw?.xz) {
    pushRibbon(shoreHw.xz, 18, 1.4, hwyPos, hwyIdx, shoreHw.y);
    pushRibbon(shoreHw.xz, 3.4, 1.75, spinePos, spineIdx, shoreHw.y);
  }
  for (const r of countryNet?.roads ?? []) {
    if (r.xz.length < 2) continue;
    if (r.kind === 'dirt') pushRibbon(r.xz, Math.max(8.5, (r.half ?? 4) * 2.1), 1.05, dirtPos, dirtIdx);
    else pushRibbon(r.xz, Math.max(11.5, (r.half ?? 5) * 2.1), 1.2, pavedPos, pavedIdx);
  }
  for (const sr of scenicData) {
    if (sr.surface === 'paved') {
      pushRibbon(sr.xz, Math.max(14, sr.half * 2.2), 1.3, hwyPos, hwyIdx, sr.y);
      pushRibbon(sr.xz, 2.8, 1.65, spinePos, spineIdx, sr.y);
    } else {
      pushRibbon(sr.xz, Math.max(10, sr.half * 2.1), 1.1, dirtPos, dirtIdx, sr.y);
    }
  }
  for (const run of streetRuns) {
    if (run.p.length < 2) continue;
    const w = run.c === 'freeway' ? 22 : run.c === 'arterial' ? 15 : 10.5;
    pushRibbon(run.p, w, 1.15, run.c === 'freeway' ? hwyPos : pavedPos, run.c === 'freeway' ? hwyIdx : pavedIdx);
  }
  const emitRoad = (pos: number[], idx: number[], color: number, name: string): void => {
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6 });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.frustumCulled = false;
    mapRoadsGroup.add(mesh);
  };
  emitRoad(hwyPos, hwyIdx, 0x262b34, 'map-highways');
  emitRoad(spinePos, spineIdx, 0xe8b956, 'map-highway-center');
  emitRoad(pavedPos, pavedIdx, 0x353b46, 'map-paved-roads');
  emitRoad(dirtPos, dirtIdx, 0xa89270, 'map-dirt-roads');
  mapRoadsGroup.visible = mapMode;
}
function buildMapSkyline(items: CityItem[]): void {
  mapSkylineGroup.clear();
  if (!items.length) return;
  const boxes: CityItem[] = [];
  const cyls: CityItem[] = [];
  for (const it of items) {
    if (it.kind === 'hero' && /rencen|rotunda|cylinder|silo|tank/i.test(it.slug)) cyls.push(it);
    else boxes.push(it);
  }
  const skyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.34 });
  skyMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMapW; varying vec3 vMapN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMapN = normal;
        #ifdef USE_INSTANCING
          vMapW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vMapW = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMapW; varying vec3 vMapN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float isRoof = step(0.65, vMapN.y);
        float floorBand = 0.86 + 0.14 * step(0.38, fract(vMapW.y * 0.24));
        float hLift = mix(0.76, 1.12, clamp(vMapW.y / 95.0, 0.0, 1.0));
        diffuseColor.rgb *= mix(floorBand * hLift, 1.12, isRoof);`);
  };
  skyMat.customProgramCacheKey = () => 'map-skyline-proxy-v1';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const buildInst = (list: CityItem[], geo: THREE.BufferGeometry): void => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, skyMat, list.length);
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const h = Math.max(4, it.h * (it.sy ?? 1));
      const w = Math.max(4, it.w * (it.sx ?? 1));
      const d = Math.max(4, it.d * (it.sz ?? 1));
      const gy = groundMin(it) - 0.6;
      const cx = it.bx ?? it.x, cz = it.bz ?? it.z;
      q.setFromAxisAngle(up, it.rotY);
      pos.set(cx, gy * exag + h * 0.5, cz);
      sc.set(w, h, d);
      m4.compose(pos, q, sc);
      im.setMatrixAt(i, m4);
      const seed = Math.abs(Math.sin(cx * 0.017 + cz * 0.023));
      if (it.kind === 'hero' || h >= 42) {
        col.setRGB(0.56 + seed * 0.14, 0.66 + seed * 0.12, 0.78 + seed * 0.12); // sleek glass skyscrapers
      } else if (h >= 18) {
        col.setRGB(0.68 + seed * 0.14, 0.64 + seed * 0.11, 0.59 + seed * 0.10); // mid-rise limestone & brick blocks
      } else {
        col.setRGB(0.54 + seed * 0.14, 0.52 + seed * 0.12, 0.49 + seed * 0.10); // low-rise urban/industrial fabric
      }
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    mapSkylineGroup.add(im);
  };
  buildInst(boxes, new THREE.BoxGeometry(1, 1, 1));
  buildInst(cyls, new THREE.CylinderGeometry(0.5, 0.5, 1, 16));
}
let cityItems: CityItem[] = [];
const IRON_BASE = (kind: string, slug: string, v4Set: Set<string>): string => {
  if (MODELSET === 'v4' && v4Set.has(`${kind}/${slug}`)) return '/games/apex/ironport/models-v4/';
  if (MODELSET === 'v3' || MODELSET === 'v4') return '/games/apex/ironport/models-v3/';
  return '/games/apex/ironport/models/';
};

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
let civicShore: number[][] = [];
async function buildCivic(): Promise<void> {
  const plan = await fetch(BASE + 'civic_riverfront.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as CivicPlan | null;
  if (!plan) return;
  const d = buildCivicRiverfront({ plan, ground: (x, z) => meshH(x, z), water: (x, z) => hAt(x, z) < 2.5, blocked: (x, z, r) => onCourse(x, z, r) || paintedRoad(x, z, r) || insideBuilding(x, z, r) });
  mergeByMaterial(d.group, 400);
  furnitureGroup.add(d.group);
  scheduleCullerReindex();
  civicSpots = d.spots; civicShore = plan.shore;
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
      if (onCourse(cx + lx * c + lz * sn, cz - lx * sn + lz * c, 1, [IND, CIV])) return false;
    }
    return true;
  });
  // Build bespoke sculpted architectural landmarks across Downtown Ironport, Grand Circuit & Civic Riverfront Promenade,
  // clearing only generic filler boxes under their footprints while preserving every historic Detroit hero landmark!
  if (signatureTowers) { scene.remove(signatureTowers.group); signatureTowers = null; }
  const heroAvoid = cityItems
    .filter((it) => it.kind === 'hero' && it.h >= 50)
    .map((it) => ({ x: it.bx ?? it.x, z: it.bz ?? it.z, r: Math.max(it.w, it.d) * 0.55 + 12 }));
  signatureTowers = new IronportSignatureTowers({
    groundAt: (x, z) => Math.max(hAt(x, z) * exag, meshH(x, z)),
    isWater: (x, z) => hAt(x, z) < 2.0,
    onCourse: (x, z, pad) => onCourse(x, z, pad),
    avoidPoints: heroAvoid,
  });
  const sigPlaced = signatureTowers.placed;
  if (sigPlaced.length > 0) {
    cityItems = cityItems.filter((it) => {
      if (it.kind === 'hero') return true;
      const cx = it.bx ?? it.x, cz = it.bz ?? it.z;
      const halfSpan = Math.max(it.w, it.d) * 0.45;
      for (const p of sigPlaced) {
        if (Math.hypot(cx - p.x, cz - p.z) < p.radius + halfSpan) return false;
      }
      return true;
    });
    for (const p of sigPlaced) {
      worldPhys.addSolidCylinder(p.x, p.z, Math.max(10, p.radius * 0.50), 'pillar');
    }
    signatureTowers.group.visible = !mapMode && (document.getElementById('tBld') as HTMLInputElement).checked;
    scene.add(signatureTowers.group);
    console.log('ironport signature towers placed:', sigPlaced.length, sigPlaced.map((p) => p.id + '@(' + Math.round(p.x) + ',' + Math.round(p.z) + ')').join(', '));
  }
  buildCollision();
  buildCivic().catch((e) => console.error('civic riverfront failed', e));
  // Check optional Colab GPU v4 upgrade manifest (models-v4 / textures-v4 with 2K neural PBR + ORM + height + baked vertex AO).
  interface V4Manifest { version?: number; models?: string[]; textures?: string[]; ruralTextures?: string[]; hasOrm?: boolean; hasHeight?: boolean }
  const v4Man = await fetch('/games/apex/ironport/v4-manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) as V4Manifest | null;
  if (v4Man?.ruralTextures?.length) {
    activateRuralOmniTextures(v4Man.ruralTextures);
  }
  const v4Models = new Set<string>(v4Man?.models ?? []);
  const v4Tex = new Set<string>(v4Man?.textures ?? []);
  const v4HasOrm = v4Man?.hasOrm !== false && v4Tex.size > 0;
  const v4HasHeight = v4Man?.hasHeight !== false && v4Tex.size > 0;
  if (!MODELSET_EXPLICIT && v4Models.size > 0) {
    MODELSET = 'v4';
    const ms = document.getElementById('modSel') as HTMLSelectElement | null;
    if (ms) ms.value = 'v4';
  }
  if (!TEXSET_EXPLICIT && v4Tex.size > 0) {
    TEXSET = 'v4';
    const ts = document.getElementById('texSel') as HTMLSelectElement | null;
    if (ts) ts.value = 'v4';
  }
  if (v4Models.size || v4Tex.size) {
    console.log('ironport v4 manifest:', { models: v4Models.size, textures: v4Tex.size, activeModel: MODELSET, activeTex: TEXSET });
  }
  // Review viewer budget: Quest-tier textures (smaller), one GPU copy per shared texture, base colour only.
  const manager = new THREE.LoadingManager();
  // Rich building materials: base, normal (the bump) and roughness for every material, one GPU copy per texture.
  // Shared materials at full 1024 (2048 KTX2 on v4); hero facades at 1024 (2048 KTX2 on v4).
  // `?lowtex` falls back to the earlier base-colour-only budget.
  const LOW = location.search.includes('lowtex');
  const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  // photographic 2048 sets (colour with occlusion folded in, normal and roughness at 1024) for the most-used materials: tools/prep_flow_textures.py
  const FLOW = new Set(['tex-shared-01-red-brick', 'tex-shared-04-limestone', 'tex-shared-05-white-marble', 'tex-shared-07-glass-curtain-blue', 'tex-shared-14-steel-panel', 'tex-shared-15-concrete-boardformed', 'tex-shared-16-concrete-weathered', 'tex-shared-17-white-stucco', 'tex-shared-18-timber-siding', 'tex-shared-21-corrugated-steel', 'tex-hero-01-ironport-towers',
    'tex-shared-02-weathered-brick', 'tex-shared-03-orange-brick', 'tex-shared-06-granite', 'tex-shared-08-glass-curtain-cerulean', 'tex-shared-09-glass-curtain-bronze', 'tex-shared-10-terracotta', 'tex-shared-12-bronze-metal', 'tex-shared-13-copper-roof', 'tex-shared-23-slate-roof', 'tex-shared-24-stone-rubble', 'tex-hero-31-city-hall']);
  // the glTFs point at ../../textures/<set>/<name>_<map>.png: route v4 -> textures-v4 (when present), v3 -> textures-v3, v1 -> tex/bld or textures
  manager.setURLModifier((u) => {
    const fm0 = u.match(/(tex-(?:shared|hero)-[a-z0-9-]+)_(base|nrm|rgh|orm|hgt)\.png/);
    if (!fm0) return u;
    const fm = [fm0[0], fm0[1].startsWith('tex-hero') ? 'hero-facades' : 'shared', fm0[1], fm0[2]];
    if (LOW && fm[3] !== 'base') return TINY;
    // Skip redundant _rgh download when v4 neural _orm supplies calibrated roughness + AO + metalness directly
    if (TEXSET === 'v4' && v4HasOrm && fm[3] === 'rgh' && v4Tex.has(fm[2])) return TINY;
    if (TEXSET === 'v4' && v4Tex.has(fm[2])) return `/games/apex/ironport/textures-v4/${fm[1]}/${fm[2]}_${fm[3]}.jpg`;
    if ((TEXSET === 'v3' || TEXSET === 'v4') && !V3_HOLD.has(fm[2])) return `/games/apex/ironport/textures-v3/${fm[1]}/${fm[2]}_${fm[3]}.jpg`;
    if (FLOW.has(fm[2])) return `/games/apex/tex/bld/${fm[2]}_${fm[3]}.jpg`;
    return `/games/apex/ironport/textures/${fm[1]}/${fm[2]}_${fm[3]}.jpg`;
  });
  // Geometry-first progressive city streaming on WebGPU: GLTFLoader builds 100% of Wave 0 3D building geometry
  // immediately using 1x1 material-matched architectural placeholders (~2-3s), then streams 2K BC7/JPG albedos
  // & Marigold normals asynchronously into the ~20 shared canonical TSL materials with zero geometry reloads!
  const DEFER_CITY_TEX = USE_WEBGPU && !LOW && !location.search.includes('defertex=0');
  const deferredTexQueue = new Map<string, { url: string; isBase: boolean }>();
  const streamedTexDone = new Map<string, THREE.Texture>();
  const streamBindings = new Map<string, Set<{ mat: THREE.Material; slot: 'map' | 'normalMap'; refTex: THREE.Texture }>>();
  manager.addHandler(
    /tex-(shared|hero)-[a-z0-9-]+_(base|nrm|rgh|orm|hgt)\.png/,
    new GpuTextureLoader(manager, DEFER_CITY_TEX, (cacheKey, rawUrl, isBase) => {
      if (!streamedTexDone.has(cacheKey) && !deferredTexQueue.has(cacheKey)) {
        deferredTexQueue.set(cacheKey, { url: rawUrl, isBase });
      }
    }) as unknown as THREE.Loader,
  );
  const loader = new GLTFLoader(manager);
  // All 86 models used to load at once, and every one asks for its own copy of each texture: with the detailed v3/v4 models that is thousands of requests in flight and the browser
  // refuses some (net::ERR_INSUFFICIENT_RESOURCES), which left buildings out. So: a few models at a time, and the cache answers a texture a second model asks for again.
  THREE.Cache.enabled = true;
  // 8 concurrent geometry/HTTP slots saturate local/CDN fetches cleanly; pause outer Wave 12 during rural spawn/fly-in.
  let loadSlots = DEFER_CITY_TEX ? 8 : 6;
  const loadWaiters: (() => void)[] = [];
  const limited = async <T,>(f: () => Promise<T>): Promise<T> => {
    if (loadSlots > 0) loadSlots--; else await new Promise<void>((r) => loadWaiters.push(r));
    try {
      while (cityCoreReady && driving && !mapMode && driveIntro?.active) {
        await new Promise<void>((r) => setTimeout(r, 250));
      }
      return await f();
    } finally { const w = loadWaiters.shift(); if (w) w(); else loadSlots++; }
  };
  const texCache = new Map<string, THREE.Texture>();
  const swapLoader = new GpuTextureLoader(manager, false);
  const swapTex = new Map<string, Promise<THREE.Texture>>();
  const loadSwap = (name: string, suffix: 'base' | 'nrm' | 'rgh' | 'orm' | 'hgt'): Promise<THREE.Texture> => {
    const url = `${name}_${suffix}.png`;                          // the URL modifier above points it at the packed jpg/ktx2 of whichever texture set is on
    const cached = texCache.get(url);
    if (cached && !cached.userData?._isPlaceholder) return Promise.resolve(cached);
    if (!swapTex.has(url)) swapTex.set(url, limited(() => swapLoader.loadAsync(url)));
    return swapTex.get(url)!;
  };
  // Canonical GPU Texture sharing pool: prevents WebGLRenderer from allocating 1,000+ duplicate Texture2D objects per variant/clone!
  const sharedTexPool = new Map<string, THREE.Texture>();
  const getSharedTex = (baseTx: THREE.Texture, ref: THREE.Texture, srcKey: string, cs: string): THREE.Texture => {
    const isComp = (baseTx as THREE.CompressedTexture).isCompressedTexture === true;
    const fy = isComp ? baseTx.flipY : ref.flipY;
    const key = `${srcKey}|${ref.wrapS}|${ref.wrapT}|${ref.repeat.x.toFixed(2)},${ref.repeat.y.toFixed(2)}|${ref.offset.x.toFixed(2)},${ref.offset.y.toFixed(2)}|${ref.rotation.toFixed(2)}|${fy ? 1 : 0}|${cs}`;
    let tx = sharedTexPool.get(key);
    if (!tx) {
      const sameProps = baseTx.wrapS === ref.wrapS && baseTx.wrapT === ref.wrapT
        && baseTx.repeat.equals(ref.repeat) && baseTx.offset.equals(ref.offset)
        && baseTx.rotation === ref.rotation && baseTx.colorSpace === cs && (isComp || baseTx.flipY === ref.flipY);
      if (sameProps && !baseTx.userData._pooled) {
        tx = baseTx;
        tx.userData._pooled = true;
      } else {
        tx = baseTx.clone();
        if (!isComp) tx.flipY = ref.flipY;
        tx.wrapS = ref.wrapS; tx.wrapT = ref.wrapT; tx.repeat.copy(ref.repeat); tx.offset.copy(ref.offset); tx.rotation = ref.rotation; tx.center.copy(ref.center);
        tx.colorSpace = cs;
        if (!isComp && !tx.image) { tx.version = 0; if (tx.source) tx.source.version = 0; }
        else if (!isComp && (baseTx.flipY !== ref.flipY || baseTx.colorSpace !== cs)) tx.needsUpdate = true;
      }
      tx.userData.srcKey = srcKey;
      tx.anisotropy = Math.min(4, ref.anisotropy || 4);
      sharedTexPool.set(key, tx);
    }
    return tx;
  };
  const loadV4Extras = async (mat: THREE.MeshStandardMaterial): Promise<FacadeV4Maps | undefined> => {
    // On WebGPU mid/low integrated GPUs (unified RAM/VRAM), skip extra 2K _orm & _hgt maps (~1.5 GB VRAM saved, keeps full v4 2K albedo + Marigold normal maps!)
    if (LOW || TEXSET !== 'v4' || !mat.map || /glass/i.test(mat.name) || (USE_WEBGPU && perfTier !== 'high')) return undefined;
    const stem = mat.name.replace(/_mat.*$/, '');
    if (!v4Tex.has(stem)) return undefined;
    const [ormBase, hgtBase] = await Promise.all([
      v4HasOrm ? loadSwap(stem, 'orm').catch(() => null) : Promise.resolve(null),
      v4HasHeight ? loadSwap(stem, 'hgt').catch(() => null) : Promise.resolve(null),
    ]);
    if (!ormBase && !hgtBase) return undefined;
    return {
      ormMap: ormBase ? getSharedTex(ormBase, mat.map, `${stem}_orm.png`, THREE.NoColorSpace) : null,
      heightMap: hgtBase ? getSharedTex(hgtBase, mat.map, `${stem}_hgt.png`, THREE.NoColorSpace) : null,
      parallaxDepth: /hero/i.test(mat.name) ? 0.28 : 0.16,
    };
  };
  const webgpuGlassCache = new Map<string, THREE.Material>();
  const webgpuFacadeCache = new Map<string, THREE.Material>();
  const finishMat = (mat: THREE.MeshStandardMaterial, v4Maps?: FacadeV4Maps, hasVtxColors = false): THREE.Material => {
    if (USE_WEBGPU && tslRegionCtx) {
      if (/glass/i.test(mat.name)) {
        const tint = /bronze/i.test(mat.name) ? 'bronze' : /cerulean/i.test(mat.name) ? 'cerulean' : 'blue';
        let gm = webgpuGlassCache.get(tint);
        if (!gm) {
          // Always use the sky-mirror architectural TSL glass shader (only 3 shared materials across the whole city!)
          gm = createApexGlassTslMaterial({ tint, shared: tslRegionCtx.shared, gi: tslRegionCtx.gi }) as unknown as THREE.Material;
          gm.name = 'glass_' + tint;
          webgpuGlassCache.set(tint, gm);
        }
        return gm;
      }
      if (mat.map && !LOW) {
        const isHero = /hero/i.test(mat.name);
        const vtx = hasVtxColors || Boolean(mat.vertexColors);
        // Keep full rich TSL facade lighting (2K albedo + Marigold normal relief + CUDA vertex AO + canyon AO + mortar AO + hero sky-mirror glass + Playkit SH9 GI bounce)
        // on ALL tiers, deduplicated into ~18 shared canonical materials (skipping only heavy 2-tap height parallax & per-pixel GI micro-noise on mid/low iGPUs)!
        const useHeight = perfTier === 'high' ? (v4Maps?.heightMap ?? null) : null;
        const tintHex = (isHero || perfTier === 'high') ? (mat.color?.getHex() ?? 0xffffff) : 0xffffff;
        const mKey = [
          mat.map.userData?.srcKey ?? mat.map.uuid,
          mat.normalMap?.userData?.srcKey ?? '-',
          v4Maps?.ormMap?.userData?.srcKey ?? '-',
          useHeight?.userData?.srcKey ?? '-',
          isHero ? 1 : 0,
          vtx ? 1 : 0,
          tintHex.toString(16),
          perfTier === 'high' ? 'H' : 'L',
        ].join('|');
        let fm = webgpuFacadeCache.get(mKey);
        if (!fm) {
          fm = createApexFacadeTslMaterial({
            map: mat.map,
            normalMap: mat.normalMap,
            ormMap: v4Maps?.ormMap ?? null,
            heightMap: useHeight,
            isHero,
            vertexColors: vtx,
            tintHex,
            leanGi: perfTier !== 'high',
            shared: tslRegionCtx.shared,
            gi: tslRegionCtx.gi,
          }) as unknown as THREE.Material;
          fm.name = mat.name;
          webgpuFacadeCache.set(mKey, fm);
          if (DEFER_CITY_TEX) {
            const bindSlot = (srcTx: THREE.Texture | null | undefined, slot: 'map' | 'normalMap'): void => {
              const ck = srcTx?.userData?.srcKey as string | undefined;
              if (!ck || !srcTx) return;
              const already = streamedTexDone.get(ck);
              if (already) {
                const tx = getSharedTex(already, srcTx, ck, slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace);
                if (slot === 'map') (fm!.userData.__setStreamedAlbedo as ((t: THREE.Texture) => void) | undefined)?.(tx);
                else (fm!.userData.__setStreamedNormal as ((t: THREE.Texture) => void) | undefined)?.(tx);
                return;
              }
              if (srcTx.userData?._isPlaceholder) {
                let set = streamBindings.get(ck);
                if (!set) { set = new Set(); streamBindings.set(ck, set); }
                set.add({ mat: fm!, slot, refTex: srcTx });
              }
            };
            bindSlot(mat.map, 'map');
            bindSlot(mat.normalMap, 'normalMap');
          }
        }
        return fm;
      }
      // Deduplicate untextured trim/roof MeshStandardMaterials into canonical shared instances so CityCellBatches merges them cleanly
      const vtx = hasVtxColors || Boolean(mat.vertexColors);
      const colHex = (mat.color?.getHex() ?? 0xffffff).toString(16);
      const rQ = Math.round(mat.roughness * 10);
      const mQ = Math.round(mat.metalness * 10);
      const sKey = `plain|${colHex}|${rQ}|${mQ}|${vtx ? 1 : 0}|${mat.side}`;
      let sm = webgpuFacadeCache.get(sKey);
      if (!sm) {
        mat.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
        mat.vertexColors = vtx;
        webgpuFacadeCache.set(sKey, mat);
        sm = mat;
      }
      return sm;
    }
    // Reset onBeforeCompile before patching so cloned variant materials never stack duplicate shader passes
    mat.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
    const isDetailed = MODELSET === 'v3' || MODELSET === 'v4';
    if (/glass/i.test(mat.name)) {
      patchGlassInterior(mat, nightU, curtainU, sunDirU, isDetailed, apexLighting.uniforms);
      mat.needsUpdate = true;
      return mat;
    }
    const isHero = /hero/i.test(mat.name);
    // Only synthesize procedural punched windows on legacy windowless v1 boxes — v3/v4 models already have real 3D recessed windows & frames!
    const isPunched = !isDetailed && /06-granite|04-limestone|16-concrete|15-concrete|17-white-stucco/.test(mat.name) && !!mat.map;
    const isMetalTrim = /12-bronze|14-steel|21-corrugated|13-copper/.test(mat.name);
    const hasV4 = !!(v4Maps?.ormMap || v4Maps?.heightMap);
    // Drop redundant roughnessMap/metalnessMap when v4 ORM provides all three channels in one fetch
    if (v4Maps?.ormMap) {
      mat.roughnessMap = null;
      mat.metalnessMap = null;
    }
    if (mat.normalMap) {
      const nScale = hasV4 ? (isHero ? 1.55 : 1.75) : (isHero ? 2.2 : 2.6);
      mat.normalScale.set(nScale, nScale);
    }
    mat.envMapIntensity = (isHero || isPunched) ? 1.95 : isMetalTrim ? 1.75 : 1.1;
    if (mat.map && mat.normalMap && !LOW) patchFacadeMasonry(mat, isHero, wetU, nightU, sunDirU, v4Maps, apexLighting.uniforms);
    if (isPunched) patchPunchedInterior(mat, nightU, curtainU, sunDirU);
    mat.needsUpdate = true;
    return mat;
  };
  const protos = new Map<string, Promise<THREE.Object3D | null>>();
  const load = (kind: string, slug: string): Promise<THREE.Object3D | null> => {
    const key = kind + '/' + slug;
    if (!protos.has(key)) {
      protos.set(key, limited(() => loader.loadAsync(`${IRON_BASE(kind, slug, v4Models)}${kind}/${slug}_lod0.gltf`)).then(async (g) => {
        const json = g.parser.json as { textures?: { source: number }[]; images?: { uri?: string }[] };
        const matJobs: Promise<void>[] = [];
        if (USE_WEBGPU) sanitizeObjectForWebGPU(g.scene);
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const hasVtxCol = Boolean(m.geometry?.getAttribute?.('color'));
          const isArr = Array.isArray(m.material);
          const mats = (isArr ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
          const outMats: THREE.Material[] = [...mats];
          mats.forEach((mat, mi) => {
            if (LOW) { if (mat.normalMap) { mat.normalMap.dispose(); mat.normalMap = null; } if (mat.roughnessMap) { mat.roughnessMap.dispose(); mat.roughnessMap = null; } }
            for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
              const tx = mat[k] as THREE.Texture | null;
              if (!tx) continue;
              const assoc = g.parser.associations.get(tx) as { textures?: number } | undefined;
              const uri = assoc?.textures != null ? json.images?.[json.textures?.[assoc.textures]?.source ?? -1]?.uri : undefined;
              if (!uri) continue;
              // Canonicalize by basename so bare 'tex-shared-*.png' and '../../textures/shared/tex-shared-*.png' share ONE GPU texture!
              const cacheKey = uri.split('/').pop() ?? uri;
              const have = texCache.get(cacheKey);
              if (have && have !== tx) { if (!tx.userData?._sharedTiny) tx.dispose(); (mat as any)[k] = have; } else { tx.userData.srcKey = cacheKey; texCache.set(cacheKey, tx); }
            }
            matJobs.push(loadV4Extras(mat).then((v4m) => {
              const finalM = finishMat(mat, v4m, hasVtxCol);
              outMats[mi] = finalM;
              m.material = isArr ? outMats : outMats[0];
            }));
          });
        });
        await Promise.all(matJobs);
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
    // On WebGPU mid/low iGPUs (without BatchedMesh multi_draw), keep 1 canonical scheme per generic building type (cuts city draw calls in half!)
    if (USE_WEBGPU && perfTier !== 'high') return 0;
    const rawN = variantTypes[it.slug].schemes.length;
    const n = rawN;
    if (n <= 1) return 0;
    const t = Math.sin(it.x * 12.9898 + it.z * 78.233 + it.rotY * 3.1) * 43758.5453;
    const u = t - Math.floor(t);
    return u < 0.34 ? 0 : 1 + Math.min(n - 2, Math.floor(((u - 0.34) / 0.66) * (n - 1)));
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
            if (suffix === 'rgh' && TEXSET === 'v4' && v4HasOrm && v4Tex.has(to)) { nm.roughnessMap = null; return; }
            const old = mat[k] as THREE.Texture | null;
            if (!old) return;
            const baseTx = await loadSwap(to, suffix);
            nm[k] = getSharedTex(baseTx, old, `${to}_${suffix}.png`, old.colorSpace);
          };
          jobs.push((async () => {
            await Promise.all([set('map', 'base'), set('normalMap', 'nrm'), set('roughnessMap', 'rgh')]);
            const v4m = await loadV4Extras(nm as THREE.MeshStandardMaterial);
            const finalM = finishMat(nm as THREE.MeshStandardMaterial, v4m, Boolean(m.geometry?.getAttribute?.('color')));
            if (finalM !== nm) {
              made.set(mat, finalM);
              if (Array.isArray(m.material)) {
                m.material = m.material.map((xm) => (xm === nm ? finalM : xm));
              } else if (m.material === nm) {
                m.material = finalM;
              }
            }
          })());
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
  buildMapSkyline(cityItems);
  const showBuildings = (document.getElementById('tBld') as HTMLInputElement).checked;
  cityGroup.visible = !mapMode && showBuildings;
  mapSkylineGroup.visible = mapMode && showBuildings;
  cityVisibility.batches = [];
  cityBatches?.dispose(); cityBatches = null;
  cityCellBatches?.dispose(); cityCellBatches = null;
  cityCoreReady = false;
  cityFullyBuilt = false;
  const CITY_CELLS = USE_WEBGPU && perfTier !== 'high' && !location.search.includes('citycells=0');
  if (CITY_BATCH) {
    cityBatches = new CityBatches([]);
    cityGroup.add(cityBatches.group);
  } else if (CITY_CELLS) {
    cityCellBatches = new CityCellBatches();
    cityGroup.add(cityCellBatches.group);
  }
  // Priority-sort building groups so ALL Downtown + Ironport Grand Circuit corridor landmarks & blocks
  // load in Wave 0 before Lap 1 — zero pop-in along any straight or waterfront turn!
  const DT_X = 5250, DT_Z = 1450;
  const circuitSamples: Array<[number, number]> = [];
  for (let i = 0; i < cityPath.length; i += 6) circuitSamples.push([cityPath[i].x, cityPath[i].z]);
  const groupPri = (key: string, items: CityItem[]): number => {
    if (key.startsWith('hero/')) return 0;
    let bestD = Infinity, bestCircuitD2 = Infinity, maxH = 0;
    for (const it of items) {
      const ix = it.bx ?? it.x, iz = it.bz ?? it.z;
      const d = Math.hypot(ix - DT_X, iz - DT_Z);
      if (d < bestD) bestD = d;
      if (it.h > maxH) maxH = it.h;
      for (let k = 0; k < circuitSamples.length; k++) {
        const dx = ix - circuitSamples[k][0], dz = iz - circuitSamples[k][1];
        const d2 = dx * dx + dz * dz;
        if (d2 < bestCircuitD2) bestCircuitD2 = d2;
      }
    }
    if (bestD < 1450 || bestCircuitD2 < 850 * 850 || maxH >= 22) return 0;
    if (bestD < 2700) return 1;
    return 2;
  };
  const allEntries = [...groups.entries()].map(([key, items]) => ({ key, items, pri: groupPri(key, items) }));
  const wave0 = allEntries.filter((e) => e.pri === 0);
  const wave12 = allEntries.filter((e) => e.pri > 0).sort((a, b) => a.pri - b.pri);

  let done = 0;
  const loadGroupInto = async (entry: { key: string; items: CityItem[] }, outParts: CityPart[]): Promise<void> => {
    const { key, items } = entry;
    const [kind, rest] = key.split('/');
    const [slug, vs] = rest.split('#');
    const proto = await variantProto(kind, slug, Number(vs));
    if (!proto) return;
    proto.updateMatrixWorld(true);
    // On WebGPU mid/low iGPUs, strip tiny generic sub-meshes & __v4_* micro-trims BEFORE merging each building prototype by material
    // — collapses 15-30 separate GLTF mesh nodes per generic AND hero skyscraper down to 4-6 clean InstancedMeshes!
    if (USE_WEBGPU && perfTier !== 'high' && !proto.userData._mergedByMat) {
      const drop: THREE.Mesh[] = [];
      proto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        if (/^.*__v4_/.test(m.name) || (kind === 'generic' && (m.geometry.boundingSphere?.radius ?? 5) < 2.8)) drop.push(m);
      });
      for (const d of drop) { d.parent?.remove(d); d.geometry.dispose(); }
      mergeByMaterial(proto);
      proto.userData._mergedByMat = true;
      proto.updateMatrixWorld(true);
    }
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
      const isV4Micro = /__v4_/.test(m.name);
      // On WebGPU mid/low iGPUs, skip __v4_* micro-trim & tiny (< 2.8 m) generic sub-meshes that multiply draw calls without changing silhouette
      if (USE_WEBGPU && perfTier !== 'high' && (isV4Micro || (kind === 'generic' && (m.geometry.boundingSphere?.radius ?? 5) < 2.8))) continue;
      const transforms = placements.map((placement) => placement.clone().multiply(m.matrixWorld));
      const isHeroRelief = kind === 'hero' && /_front$/i.test(m.name);
      const bRad = m.geometry.boundingSphere?.radius ?? 5;
      // Main building shells cast exact macro shadows; on iGPU mid/low only hero landmarks & tall buildings (>= 12 m radius) cast shadows to cut shadow-pass spikes!
      const castShadow = !isV4Micro && !isHeroRelief && ((USE_WEBGPU && perfTier !== 'high') ? (kind === 'hero' || bRad >= 12) : bRad >= 4.5);
      // Batch generic buildings AND shared-material hero sub-meshes (glass, trims, __v4_* cornices/pilasters, roofs)
      // into CityBatches to eliminate ~280 redundant 1-instance hero draws! Keep hero-unique facades & central-station unbatched.
      const matName = ((m.material as THREE.Material)?.name ?? '');
      const canBatchHeroShared = kind === 'hero' && slug !== 'central-station' && !/hero/i.test(matName);
      if ((CITY_BATCH && (kind !== 'hero' || canBatchHeroShared)) || CITY_CELLS) {
        // Cull v4 micro-trims (cornices, pilasters, eaves, chimneys) cleanly beyond 145 m so close-up 3D stays full detail while distant skyline stays lean
        outParts.push({ geometry: m.geometry, material: m.material as THREE.Material, transforms, castShadow, maxDist: isV4Micro ? 145 : undefined });
        continue;
      }
      const batch = new InstanceVisibility(m.geometry, m.material, transforms);
      batch.mesh.name = `${kind}/${slug}:${m.name || 'm'}`;
      if (!castShadow) batch.mesh.castShadow = false;
      if (isV4Micro) batch.maxDist = 175;
      cityVisibility.batches.push(batch);
      cityGroup.add(batch.mesh);
    }
    done += items.length;
  };

  // Progressive 2K BC7/JPG texture streamer: upgrades placeholder textures in-place on the ~20 canonical shared TSL materials
  // with ZERO shader recompile and ZERO geometry/CityCellBatches rebuild!
  let streamRunning = false;
  const streamCityTextures = async (): Promise<void> => {
    if (!DEFER_CITY_TEX || streamRunning || deferredTexQueue.size === 0) return;
    streamRunning = true;
    try {
      await Promise.race([ktxReadyPromise, new Promise<void>((r) => setTimeout(r, 400))]);
      const tStart = performance.now();
      let streamedCount = 0;
      while (deferredTexQueue.size > 0) {
        const batch = [...deferredTexQueue.entries()].sort((a, b) => {
          // Priority 0: shared & hero _base albedos FIRST so buildings look photoreal right away; _nrm Marigold normals SECOND
          if (a[1].isBase !== b[1].isBase) return a[1].isBase ? -1 : 1;
          const aShared = a[0].startsWith('tex-shared-') ? 0 : 1;
          const bShared = b[0].startsWith('tex-shared-') ? 0 : 1;
          return aShared - bShared;
        });
        for (const [ck] of batch) deferredTexQueue.delete(ck);
        const conc = driving ? 2 : 6;
        await runWithConcurrency(batch, conc, async ([cacheKey, item]) => {
          if (streamedTexDone.has(cacheKey)) return;
          try {
            const loaded = await swapLoader.loadAsync(item.url);
            loaded.userData.srcKey = cacheKey;
            streamedTexDone.set(cacheKey, loaded);
            const bindings = streamBindings.get(cacheKey);
            if (bindings) {
              for (const b of bindings) {
                const cs = b.slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                const tx = getSharedTex(loaded, b.refTex, cacheKey, cs);
                texCache.set(cacheKey, tx);
                if (b.slot === 'map') {
                  const fn = b.mat.userData.__setStreamedAlbedo as ((t: THREE.Texture) => void) | undefined;
                  if (fn) fn(tx);
                  else { (b.mat as THREE.MeshStandardMaterial).map = tx; b.mat.needsUpdate = true; }
                } else {
                  const fn = b.mat.userData.__setStreamedNormal as ((t: THREE.Texture) => void) | undefined;
                  if (fn) fn(tx);
                  else { (b.mat as THREE.MeshStandardMaterial).normalMap = tx; b.mat.needsUpdate = true; }
                }
              }
              streamBindings.delete(cacheKey);
            } else {
              texCache.set(cacheKey, loaded);
            }
            streamedCount++;
            if (driving) await new Promise<void>((r) => requestAnimationFrame(() => r()));
          } catch { /* keep architectural color placeholder if a single texture fails */ }
        });
      }
      if (streamedCount > 0) {
        console.log(`[apex-stream] streamed ${streamedCount} 2K city textures in ${Math.round(performance.now() - tStart)} ms`);
      }
    } finally {
      streamRunning = false;
    }
  };

  // Quietly pre-compile the ~20 canonical shared Downtown building & glass WebGPU pipelines while browsing the Map Overview
  // so clicking START drops straight into the 3D city with zero WGSL compile stall during countdown '3'!
  let cityPipelinesWarmed = false;
  const warmWebGpuCityPipelines = async (): Promise<void> => {
    if (!USE_WEBGPU || !webgpuReady || cityPipelinesWarmed || driving) return;
    cityPipelinesWarmed = true;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (driving) return;
    const t0 = performance.now();
    const probe = new THREE.Group();
    const geoPlain = new THREE.PlaneGeometry(0.1, 0.1);
    const geoVtx = new THREE.PlaneGeometry(0.1, 0.1);
    const vc = geoVtx.getAttribute('position').count;
    geoVtx.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vc * 3).fill(1), 3));
    const seen = new Set<THREE.Material>();
    for (const m of [...webgpuGlassCache.values(), ...webgpuFacadeCache.values()]) {
      if (seen.has(m)) continue;
      seen.add(m);
      const pm = new THREE.Mesh((m as THREE.MeshStandardMaterial).vertexColors ? geoVtx : geoPlain, m);
      pm.frustumCulled = false;
      pm.castShadow = false;
      pm.receiveShadow = true;
      probe.add(pm);
    }
    try {
      const ca = (renderer as unknown as { compileAsync?: (o: THREE.Object3D, c: THREE.Camera, ts?: THREE.Scene) => Promise<void> }).compileAsync;
      if (typeof ca === 'function' && probe.children.length > 0) {
        await ca.call(renderer, probe, camera, scene);
        console.log(`[apex-webgpu] pre-warmed ${probe.children.length} shared city pipelines in ${Math.round(performance.now() - t0)} ms`);
      }
    } catch (err) {
      console.warn('[apex-webgpu] city pipeline pre-warm skipped:', err);
    } finally {
      geoPlain.dispose();
      geoVtx.dispose();
    }
  };

  // Wave 0: Downtown + Grand Circuit Hero Landmarks & Tall/Corridor Generics -> geometry placed IMMEDIATELY during Map boot!
  // With DEFER_CITY_TEX + 520 m cells + 36 ms boot slice budget, ALL Wave 0 3D geometry finishes in ~2-3s before Map menu fades in,
  // and keeps Downtown city draws lean (~50-65 draws instead of 195!) out to 720 m view distance!
  const wave0T0 = performance.now();
  const wave0Parts: CityPart[] = [];
  await runWithConcurrency(wave0, DEFER_CITY_TEX ? 10 : 6, (entry) => loadGroupInto(entry, wave0Parts));
  if (CITY_BATCH && cityBatches && wave0Parts.length) {
    await cityBatches.appendPartsSliced(wave0Parts, 8);
  } else if (CITY_CELLS && cityCellBatches && wave0Parts.length) {
    await cityCellBatches.appendPartsSliced(wave0Parts, 520, 140000, driving ? 6 : 36);
  }
  cityCoreReady = true;
  resolveCityCore?.();
  resolveCityCore = null;
  (window as any).cityCount = done;
  console.log('city Wave 0 (Downtown/Lap-1 core) ready:', done, 'of', cityItems.length, 'batches:', cityBatches?.drawCalls ?? cityCellBatches?.drawCalls ?? 0, 'in', Math.round(performance.now() - wave0T0), 'ms');
  // Build Downtown architectural crown/pylon lighting + live race broadcast LED video walls & marquee ribbons (all ~5 draw calls!)
  if (!cityBroadcastLights && cityItems.length > 0 && cityPath.length > 16) {
    cityBroadcastLights = new CityBroadcastLights({
      cityItems,
      cityPath,
      groundMin,
      groundAt: (x, z) => Math.max(hAt(x, z) * exag, meshH(x, z)),
      halfTrackWidth: 5.5,
      gantryIndex: 0,
      onCourse: (x, z, pad) => onCourse(x, z, pad, ['ironport_grand_circuit']),
    });
    cityBroadcastLights.group.visible = !mapMode;
    scene.add(cityBroadcastLights.group);
    console.log('city architectural lights & live LED walls:', JSON.stringify(cityBroadcastLights.counts));
  }
  // Immediately stream 2K BC7/JPG facade & normal textures into the ~20 shared materials + pre-warm WebGPU pipelines while on Map Overview!
  void streamCityTextures();
  void warmWebGpuCityPipelines();

  // Wave 1 (single merged wave for all outer city parts): avoids creating 15+ duplicate BatchedMesh sets per material!
  // On WebGPU mid/low iGPUs, gently pace Wave 1 while driving so background GLTF loads & WGSL compiles never stall the countdown or framerate!
  const wave1Parts: CityPart[] = [];
  const wave1Conc = (USE_WEBGPU && perfTier !== 'high') ? 2 : (driving ? 4 : 6);
  await runWithConcurrency(wave12, wave1Conc, async (entry) => {
    if (USE_WEBGPU && perfTier !== 'high' && driving) {
      // Never allocate outer city GLTF/WebGPU buffers during closed-circuit races or while driving far from Downtown — eliminates mid-race stutters!
      while (driving && (driving.lock > 0 || driving.circuitId !== 'free' || Math.hypot(driving.pos.x - DT_X, driving.pos.z - DT_Z) > 1650)) {
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 180));
    }
    await loadGroupInto(entry, wave1Parts);
  });
  if (USE_WEBGPU && perfTier !== 'high' && driving && driving.circuitId !== 'free') {
    while (driving && driving.circuitId !== 'free') {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (CITY_BATCH && cityBatches && wave1Parts.length) {
    await cityBatches.appendPartsSliced(wave1Parts, driving ? 4 : 8);
  } else if (CITY_CELLS && cityCellBatches && wave1Parts.length) {
    await cityCellBatches.appendPartsSliced(wave1Parts, 520, 140000, driving ? 4 : 24);
  }
  if (DEFER_CITY_TEX && deferredTexQueue.size > 0) void streamCityTextures();

  cityFullyBuilt = true;
  if (CITY_BATCH && cityBatches) {
    console.log('city batched:', cityBatches.drawCalls, 'draws,', cityBatches.instances, 'instances');
  }
  console.log('city buildings placed', done, 'of', cityItems.length);
  (window as any).cityCount = done;
  lastInput = performance.now();
  // Defer heavy rooftop/streetscape/zone passes slightly if mid-race so Lap 1 never stutters
  const finishExtras = (): void => {
    addRoofDetails(cityItems);
    buildStreetscape().then(() => scheduleCullerReindex()).catch((e) => console.error('streetscape failed', e));
    buildZones().then(() => scheduleCullerReindex()).catch((e) => console.error('zones failed', e));
  };
  if (driving) {
    const waitIdle = setInterval(() => {
      if (!driving) { clearInterval(waitIdle); finishExtras(); }
    }, 1500);
  } else {
    finishExtras();
  }
}

// ---------- industrial yards and waterfront rows (region/zones.json, made by tools/infill_waterfront.py) ----------
// Each zone has its outline and is paved: concrete yards under the industrial buildings, a lighter quay strip under the waterfront rows. They sit on the drawn terrain, and they
// are named on the map. The far bank has them too, so there is something over the river.
const zoneGroup = new THREE.Group();
zoneGroup.name = 'zones';
scene.add(zoneGroup);
async function buildZones(): Promise<void> {
  const res = await fetch(BASE + 'zones.json');
  if (!res.ok) return;
  const zones = ((await res.json()) as { zones: { id: string; name: string; kind: 'industrial' | 'waterfront'; bank: string; center: number[]; hull: number[][] }[] }).zones;
  const tex = new THREE.TextureLoader().load('/games/apex/ironport/textures-v3/shared/tex-shared-16-concrete-weathered_base.jpg');
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
  let cmat: THREE.Material;
  if (USE_WEBGPU) {
    const tc = createApexCirrusTslMaterial(tex);
    tc.opacity = op;
    cmat = tc as unknown as THREE.Material;
  } else {
    const wc = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, fog: false, side: THREE.DoubleSide });
    // Smooth circular edge fade so square cloud plane boundaries never cut a hard line across the sky
    wc.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vCloudUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloudUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vCloudUv;')
        .replace('#include <dithering_fragment>', 'gl_FragColor.a *= smoothstep(1.0, 0.25, length(vCloudUv * 2.0 - 1.0));\n#include <dithering_fragment>');
    };
    wc.customProgramCacheKey = () => 'cloud-radial-fade';
    cmat = wc;
  }
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
  city: [{ t: 0, w: 'partly' }, { t: 130, w: 'overcast' }, { t: 230, w: 'rain' }],
  cliff: [{ t: 0, w: 'partly' }, { t: 140, w: 'overcast' }, { t: 320, w: 'partly' }],
  rally: [{ t: 0, w: 'partly' }, { t: 60, w: 'overcast' }, { t: 150, w: 'rain' }],
  ind: [{ t: 0, w: 'partly' }, { t: 110, w: 'overcast' }, { t: 240, w: 'rain' }],
  civ: [{ t: 0, w: 'clear' }, { t: 180, w: 'partly' }, { t: 330, w: 'clear' }],        // a fine evening on the riverfront
  harb: [{ t: 0, w: 'partly' }, { t: 120, w: 'overcast' }, { t: 260, w: 'rain' }],       // sea weather rolling in over the harbour
  superior: [{ t: 0, w: 'clear' }, { t: 420, w: 'fog' }, { t: 720, w: 'partly' }],         // clear on the coast, cloud on the pass, sun again in the forest
  escarpment: [{ t: 0, w: 'partly' }, { t: 150, w: 'clear' }, { t: 330, w: 'overcast' }],    // broken cloud by the lake, clear on the crest, cloud coming in for the descent
  free: [{ t: 0, w: 'partly' }, { t: 240, w: 'clear' }, { t: 540, w: 'overcast' }, { t: 840, w: 'rain' }],
};
let wxOverride = 'auto';
try { const o = localStorage.getItem('apex.wx'); if (o && (o === 'auto' || WEATHERS[o])) wxOverride = o; } catch { /* storage blocked */ }
let wxPlan: { t: number; w: string }[] | null = null, wxPlanT = 0, wxPlanI = -1;
const cloudBase = new Map<THREE.Mesh, number>();
const WX_GREY = new THREE.Color(0x7d8794), WX_TINT = new THREE.Color(0.52, 0.58, 0.68), tmpC = new THREE.Color();
let wxGripSpec: typeof CARS.kestrel | null = null;       // the car's spec with the weather's grip folded in
function stepWeather(dt: number): void {
  stepDayNight(dt);
  wx.step(dt, camera.position, mapMode, driving ? Math.abs(driving.ps.speedMps) : 0, false);
  const w = wx.cur;
  // Don't soak or pool the race track while hovering storm forecast cards on the overview menu
  if (!mapMode) {
    roadWater.pooling = poolLevel;
    roadWater.update(dt, w.rain, w.sun, w.wind);
  }
  w.wet = mapMode ? 0 : roadWater.wetness;
  const f = wx.flash;
  sun.intensity = curTod.sunInt * w.sun * (1 + f * 2.5);
  hemi.intensity = curTod.hemiInt * w.hemi * (1 + f * 1.6);
  renderer.toneMappingExposure = curTod.exposure + w.exposure + f * 0.45;
  scene.environmentIntensity = curTod.env * (0.45 + 0.55 * w.sun) * (1 + f);
  wetU.value = w.wet;
  const nkCloud = curTod.nightK;
  for (const l of cloudLayers) {
    const m = l.mesh.material as THREE.MeshBasicMaterial;
    if (!cloudBase.has(l.mesh)) cloudBase.set(l.mesh, m.opacity);
    const op = Math.min(0.92, cloudBase.get(l.mesh)! * w.cloud) * (1 - nkCloud * 0.52);
    m.opacity = op;
    // Tint clouds smoothly from sunlit golden/day -> sunset amber -> deep moonlit midnight navy (NEVER bright white over stars at night!)
    m.color.set(0xffffff).lerp(curTod.sunCol, 0.24).lerp(curTod.hemiSky, 0.12);
    m.color.lerp(tmpC.set(0x2a303c), w.cloudDark * 0.88);
    m.color.lerp(tmpC.set(0x10192e), nkCloud * 0.90);
    if (f > 0.05) m.color.lerp(tmpC.set(0xdfe8ff), f * 0.6);
    if (m.userData?.uTint?.value) (m.userData.uTint.value as THREE.Color).copy(m.color);
    if (m.userData?.uOp) m.userData.uOp.value = op;
  }
  if (mapMode) {
    if (terrainMat && !USE_WEBGPU) terrainMat.color.set(0xffffff).lerp(WX_TINT, Math.min(1, w.fogGrey * 0.7 + w.rain * 0.25));
  } else {
    if (terrainMat && !USE_WEBGPU) terrainMat.color.set(0xffffff);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(curTod.fogCol).lerp(WX_GREY, w.fogGrey).multiplyScalar(1 - w.cloudDark * 0.35 + f * 0.4);
      // Keep foreground & mid-ground crisp and deep-contrast (no chalky grey haze 40 m ahead of the hood!)
      const minNear = wx.name === 'fog' ? 220 : 650;
      const minFar = wx.name === 'fog' ? 1800 : 4800;
      scene.fog.near = Math.max(minNear, curTod.fogNear * w.fogNear);
      scene.fog.far = Math.max(minFar, curTod.fogFar * w.fogFar);
    }
    scene.backgroundIntensity = 1 - 0.62 * w.fogGrey * (1 - f * 0.7);
  }
  if (mapMode) scene.backgroundIntensity = 1;
  // the sky dome: physical Rayleigh/Mie + blended panorama + weather overcast/storm + moon/stars
  {
    const night = curTod.nightK;
    skyFog.copy(curTod.fogCol).lerp(WX_GREY, w.fogGrey).multiplyScalar(1 - w.cloudDark * 0.35);
    sky.setVisible(!mapMode);
    sky.update(dt, camera, {
      sunDir, sunCol: sun.color, sunAmt: (1 - night) * Math.min(1, w.sun * 1.3 + 0.1), night, fog: skyFog, fogAmt: w.fogGrey,
      mixOver: Math.min(1, Math.max(0, (w.cloud - 0.9) / 0.6)), mixStorm: Math.min(1, Math.max(0, (w.cloudDark - 0.6) / 0.3)),
      dark: w.cloudDark * 0.6, flash: f, birds: !mapMode && w.rain < 0.15 && night < 0.3 && w.fogGrey < 0.5,
    });
  }
  if (waterSurface) {
    const night = curTod.nightK;
    waterSurface.setSky(sky.baseTexture());
    // the menu's high view: put the sun low in the direction the camera faces (drifting a little) so a glitter path runs across the water toward the viewer
    if (mapMode) {
      camera.getWorldDirection(wDir); const az = Math.atan2(wDir.x, wDir.z) + Math.sin(performance.now() / 9000) * 0.35;
      wSun.set(Math.sin(az) * 0.94, 0.34, Math.cos(az) * 0.94).normalize();
    }
    waterSurface.update(dt, {
      glint: mapMode ? 1 : Math.max(0.42, w.sun * 0.72),
      sunDir: mapMode ? wSun : sunDir, sunCol: sun.color, sunAmt: (1 - night) * Math.min(1, w.sun * 1.3 + 0.1), wind: Math.min(1, 0.24 + w.wind * 0.6 + w.rain * 0.45 + w.cloudDark * 0.35), rain: w.rain,
      storm: Math.min(1, Math.max(0, (w.cloudDark - 0.6) / 0.3)), fog: scene.fog instanceof THREE.Fog ? scene.fog.color : skyFog,
      fogNear: scene.fog instanceof THREE.Fog ? scene.fog.near : 1e6, fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : 2e6,
      skyDim: (1 - w.cloudDark * 0.5) * (1 - night * 0.85) + f * 0.6, mapFade: mapFadeU.value,
    });
  }
  // water collects while it rains and drains away slowly after
  poolLevel = roadWater.pooling;
  poolU.value = poolLevel;
  { const nk = curTod.nightK; nightU.value = Math.min(1, nk + w.cloudDark * 0.45 * (1 - nk)); }
  if (tslRegionCtx) {
    tslRegionCtx.shared.uWet.value = w.wet;
    tslRegionCtx.shared.uPool.value = poolLevel;
    tslRegionCtx.shared.uNight.value = nightU.value;
    (tslRegionCtx.shared.uSunDir.value as THREE.Vector3).copy(sunDir);
    (tslRegionCtx.foliage.uSunDir.value as THREE.Vector3).copy(sunDir);
    (tslRegionCtx.foliage.uSunCol.value as THREE.Color).copy(sun.color);
  }
  if (webgpuTerrainHandle) {
    webgpuTerrainHandle.uniforms.uWet.value = w.wet;
    webgpuTerrainHandle.uniforms.uPool.value = poolLevel;
    webgpuTerrainHandle.uniforms.uMapFade.value = mapFadeU.value;
  }
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
  if (!USE_WEBGPU) for (const m of driveSurfaces) {
    const mm = m.material as THREE.MeshStandardMaterial;
    mm.roughness = 0.84 - 0.34 * w.wet; mm.color.setScalar(1 - 0.24 * w.wet);
    if (!mm.userData.pud) {                      // the road meshes carry the same localized puddles as the terrain's painted roads
      mm.userData.pud = true;
      mm.onBeforeCompile = (sh) => {
        sh.uniforms.uPool = poolU; sh.uniforms.uWet = wetU; Object.assign(sh.uniforms, roadUniforms);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;\nuniform float uPool;\nuniform float uWet;\n' + PUDDLE_GLSL)
          .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gPud = puddleAt(vRW.xz, uPool);\nfloat gRoad = 1.0;\ndiffuseColor.rgb *= 1.0 - 0.30 * gPud;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, gPud);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.02, gPud);')
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n{ float fBase = clamp(1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0), 0.0, 1.0); float fW = fBase * fBase * fBase; reflectedLight.indirectSpecular = min(max(reflectedLight.indirectSpecular, vec3(0.0)), vec3(16.0)) * (1.0 + gPud * (0.18 + 0.65 * fW) + uWet * 0.10 * fW); }');
        sh.fragmentShader = injectRoadPbr(sh.fragmentShader, 'vRW.xz');
      };
      mm.customProgramCacheKey = () => 'roadpud-v2';
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
  if (!pmrem) return;
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
const MUSIC_BASE = '/games/apex/music/';
let musicVol = 0.8;
try { const v = parseFloat(localStorage.getItem('apex.musicVol') ?? ''); if (!Number.isNaN(v)) musicVol = Math.min(1, Math.max(0, v)); } catch { /* storage blocked */ }
let musicDuck = 1;                      // stays full 1.0 in-race so player controls exact Music vs Engine vs SFX mix!
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
let musicInFlight = false;
function syncBootAudioPill(state: 'playing' | 'tap'): void {
  const btn = document.getElementById('bootAudioBtn');
  const lbl = document.getElementById('bootAudioLabel');
  if (!btn || !lbl) return;
  if (state === 'playing') {
    btn.classList.add('is-playing');
    lbl.textContent = 'SOUNDTRACK PLAYING';
  } else {
    btn.classList.remove('is-playing');
    lbl.textContent = 'TAP ANYWHERE FOR SOUNDTRACK';
  }
}
let menuIdx = 0;
function playMusic(kind: 'menu' | 'drive', allowAutoplayProbe = false): void {
  musicWanted = kind;
  if (!musicUnlocked && !allowAutoplayProbe) return;
  if (curAudio && curAudio.dataset.kind === kind && !curAudio.paused && !curAudio.ended) {
    syncBootAudioPill('playing');
    return;
  }
  if (musicInFlight && !musicUnlocked) return;
  const list = musicLists[kind].length ? musicLists[kind] : musicLists.menu;
  const file = kind === 'menu' ? list[menuIdx++ % list.length].file : list[driveIdx++ % list.length].file;
  const next = new Audio(MUSIC_BASE + file);
  next.dataset.kind = kind;
  next.volume = 0;
  next.loop = false;
  next.onended = () => { if (musicWanted === kind) playMusic(kind); };
  musicInFlight = true;
  next.play().then(() => {
    musicInFlight = false;
    musicUnlocked = true;
    removeEventListener('pointerdown', unlockMusic);
    removeEventListener('keydown', unlockMusic);
    const prev = curAudio;
    curAudio = next;
    syncBootAudioPill('playing');
    fadeTo(next, musicVol * musicDuck, 1600);
    if (prev) fadeTo(prev, 0, 1200, () => { prev.pause(); });
  }).catch(() => {
    musicInFlight = false;
    if (!musicUnlocked) {
      menuIdx = Math.max(0, menuIdx - 1);
      syncBootAudioPill('tap');
    }
  });
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
// Kick off the Apex menu soundtrack right on the full-page boot splash screen (autoplays immediately when browser allows,
// otherwise cleanly arms the splash tap-anywhere audio trigger so it starts seamlessly during loading!)
fetch(MUSIC_BASE + 'music.json')
  .then((r) => r.json())
  .then((m) => { musicLists = m; })
  .catch(() => undefined)
  .finally(() => { if (musicWanted === 'menu') playMusic('menu', true); });

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
menuEl.id = 'menu';
menuEl.style.cssText = 'position:fixed;inset:0;display:none;pointer-events:none;font-family:Inter,Manrope,sans-serif;color:#fff;user-select:none';
menuEl.innerHTML = `
  <div id="menuTitle" style="position:absolute;left:44px;top:26px;width:440px">
    <img src="/games/apex/brand/apex-logo.svg" alt="Plajah Motorsport: Apex" style="display:block;width:400px;max-width:60vw;height:auto;filter:drop-shadow(0 4px 18px rgba(0,0,0,.55))" />
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
  { id: 'civ', tag: 'STREET COURSE', name: 'Civic Riverfront Street Circuit', sub: '5.4 km · riverwalk · opera to the beach', color: '#e8b04a', act: () => openBrief('civ') },
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
const cineBtn = document.createElement('button');
cineBtn.id = 'heroShowcaseBtn';
cineBtn.textContent = 'HERO SHOWCASE';
cineBtn.style.cssText = 'position:fixed;right:68px;top:19px;height:36px;padding:0 14px;display:inline-flex;align-items:center;background:rgba(26,0,38,.62);color:#00DAF3;border:1px solid rgba(0,218,243,.42);border-radius:999px;backdrop-filter:blur(12px);font:700 11px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;z-index:21';
cineBtn.onclick = (e) => { e.stopPropagation(); startCine(); };
document.body.appendChild(cineBtn);
const onlineHubBtn = document.createElement('button');
onlineHubBtn.id = 'onlineHubBtn';
onlineHubBtn.textContent = 'ONLINE';
onlineHubBtn.style.cssText = 'position:fixed;right:218px;top:19px;height:36px;padding:0 15px;display:inline-flex;align-items:center;gap:6px;background:linear-gradient(90deg,rgba(212,0,85,.78),rgba(255,140,0,.78));color:#fff;border:1px solid rgba(255,255,255,.26);border-radius:999px;backdrop-filter:blur(12px);font:800 11px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;z-index:21;box-shadow:0 6px 20px rgba(212,0,85,.35)';
const launchOnlineHub = (initialTab: 'world' | 'race' = 'race', circuitId = 'ironport_grand_circuit'): void => {
  openOnlineMultiplayerHub(onlineSession, {
    apiBase: RT_API,
    circuitId,
    initialTab,
    onEnterOpenWorld: () => {
      startDrive('free');
    },
    onEnterGrid: (chosenCircuit) => {
      const cid = chosenCircuit || circuitId;
      startDrive(cid);
      // Human field only when racing on the Plajah Realtime server so server standings match what everyone sees
      if (onlineSession.rt) {
        if (competition) competition.racers = competition.racers.filter((r) => r.isPlayer);
        aiGroup.clear(); aiMeshes = [];
      }
    },
    onBanner: (t, k) => showBanner(t, k, 5200),
    onCancel: () => { /* stays on current view */ },
  });
};
onlineHubBtn.onclick = (e) => { e.stopPropagation(); launchOnlineHub(onlineSession.mode === 'persistent_world' ? 'world' : 'race'); };
document.body.appendChild(onlineHubBtn);
// Live Ironport Transit & Aviation Schedule Board (Halcyon Intl Airport Flights + Operating Freight & Passenger Rail)
const transitBtn = document.createElement('button');
transitBtn.id = 'transitBtn';
transitBtn.textContent = 'TRANSIT';
transitBtn.style.cssText = 'position:fixed;right:318px;top:19px;height:36px;padding:0 14px;display:inline-flex;align-items:center;gap:6px;background:rgba(16,8,30,.78);color:#00DAF3;border:1px solid rgba(0,218,243,.45);border-radius:999px;backdrop-filter:blur(12px);font:800 11px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;z-index:21';
const transitPanel = document.createElement('div');
transitPanel.id = 'transitPanel';
transitPanel.style.cssText = 'position:fixed;right:20px;top:66px;width:min(440px,94vw);max-height:76vh;overflow:auto;padding:16px 18px;border-radius:20px;background:rgba(14,5,26,.92);border:1px solid rgba(0,218,243,.35);backdrop-filter:blur(18px);box-shadow:0 24px 70px rgba(0,0,0,.68);color:#f3ecff;font:400 12px/1.45 Inter,system-ui,sans-serif;display:none;z-index:55';
// Static header + action buttons live outside the 1 Hz table refresh so clicks NEVER drop during live timetable updates!
transitPanel.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div><div style="font:800 10px 'JetBrains Mono',monospace;letter-spacing:.22em;color:#00DAF3">IRONPORT LIVE OPERATIONS</div><div style="font:900 17px Outfit,sans-serif">AIRPORT &amp; RAIL TIMETABLE</div></div>
    <button id="transitClose" type="button" style="padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.16);font:700 10px Outfit,sans-serif;cursor:pointer">CLOSE</button>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
    <button id="tJumpAirport" type="button" style="padding:6px 11px;border-radius:999px;background:linear-gradient(90deg,#00DAF3,#00a6d6);color:#090312;border:0;font:800 10px Outfit,sans-serif;letter-spacing:.1em;cursor:pointer">WATCH AIRPORT</button>
    <button id="tDriveAirport" type="button" style="padding:6px 11px;border-radius:999px;background:rgba(0,218,243,.14);color:#00DAF3;border:1px solid rgba(0,218,243,.4);font:700 10px Outfit,sans-serif;cursor:pointer">DRIVE AIRPORT</button>
    <button id="tJumpKettle" type="button" style="padding:6px 11px;border-radius:999px;background:linear-gradient(90deg,#D40055,#FF8C00);color:#fff;border:0;font:800 10px Outfit,sans-serif;letter-spacing:.1em;cursor:pointer">WATCH RAIL TOWN</button>
    <button id="tDriveKettle" type="button" style="padding:6px 11px;border-radius:999px;background:rgba(255,140,0,.14);color:#FF8C00;border:1px solid rgba(255,140,0,.4);font:700 10px Outfit,sans-serif;cursor:pointer">DRIVE KETTLE CROSSING</button>
  </div>
  <div id="transitTables"></div>`;
document.body.appendChild(transitBtn);
document.body.appendChild(transitPanel);
const transitTablesEl = transitPanel.querySelector('#transitTables') as HTMLElement;
let transitOpen = false;
let lastTransitRenderMs = 0;
function renderTransitBoard(): void {
  if (!transitOpen) return;
  const flights = simLayer?.world.air?.schedule() ?? [];
  const trains = simLayer?.world.trains?.schedule() ?? [];
  const fmtEta = (s: number): string => s <= 2 ? 'NOW' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  const flightRows = flights.length
    ? flights.map((f) => `<tr style="border-bottom:1px solid rgba(255,255,255,.07)"><td style="padding:5px 4px;font:700 11px 'JetBrains Mono',monospace;color:${f.direction === 'ARR' ? '#00DAF3' : '#FF8C00'}">${f.flightNo}</td><td style="padding:5px 4px">${f.city}</td><td style="padding:5px 4px;font:700 10px 'JetBrains Mono',monospace">${f.gateLabel}</td><td style="padding:5px 4px;font:700 10px 'JetBrains Mono',monospace;color:#ffd166">${f.status}</td><td style="padding:5px 4px;text-align:right;font:600 11px 'JetBrains Mono',monospace">${fmtEta(f.etaSec)}</td></tr>`).join('')
    : '<tr><td colspan="5" style="padding:8px;opacity:.6">Airport initializing…</td></tr>';
  const trainRows = trains.length
    ? trains.map((t) => `<tr style="border-bottom:1px solid rgba(255,255,255,.07)"><td style="padding:5px 4px;font:700 11px 'JetBrains Mono',monospace;color:${t.kind === 'passenger' ? '#68f2ff' : '#ffb86c'}">${t.serviceNo}</td><td style="padding:5px 4px">${t.serviceName}</td><td style="padding:5px 4px">${t.nextStop}</td><td style="padding:5px 4px;font:700 10px 'JetBrains Mono',monospace;color:${t.state === 'dwell' ? '#00f5d4' : t.state === 'hold' ? '#ff7b8a' : '#e0d6ff'}">${t.state === 'dwell' ? 'BOARDING' : t.state === 'hold' ? 'HOLD' : `${t.speedKmh} km/h`}</td><td style="padding:5px 4px;text-align:right;font:600 11px 'JetBrains Mono',monospace">${fmtEta(t.etaSec)}</td></tr>`).join('')
    : '<tr><td colspan="5" style="padding:8px;opacity:.6">Rail timetable initializing…</td></tr>';
  transitTablesEl.innerHTML = `
    <div style="font:800 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#FF8C00;margin:6px 0 4px">HALCYON INTL AIRPORT (KIPT · RWY 09/27) — LIVE FLIGHTS</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px"><thead><tr style="color:#9db0c8;text-align:left;border-bottom:1px solid rgba(255,255,255,.14)"><th>FLT</th><th>ROUTE</th><th>GATE</th><th>STATUS</th><th style="text-align:right">ETA</th></tr></thead><tbody>${flightRows}</tbody></table>
    <div style="font:800 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#00DAF3;margin:6px 0 4px">IRONPORT REGIONAL RAIL — PASSENGER &amp; FREIGHT</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="color:#9db0c8;text-align:left;border-bottom:1px solid rgba(255,255,255,.14)"><th>TRAIN</th><th>SERVICE</th><th>NEXT STOP</th><th>STATE</th><th style="text-align:right">ETA</th></tr></thead><tbody>${trainRows}</tbody></table>`;
}
(transitPanel.querySelector('#transitClose') as HTMLButtonElement).onclick = (e) => { e.stopPropagation(); transitOpen = false; transitPanel.style.display = 'none'; };
(transitPanel.querySelector('#tJumpAirport') as HTMLButtonElement).onclick = (e) => { e.stopPropagation(); preset('airport'); };
(transitPanel.querySelector('#tDriveAirport') as HTMLButtonElement).onclick = (e) => { e.stopPropagation(); transitOpen = false; transitPanel.style.display = 'none'; freeSpawn = { p: [-4850, 3915], q: [-4350, 3915] }; startDrive('free'); };
(transitPanel.querySelector('#tJumpKettle') as HTMLButtonElement).onclick = (e) => { e.stopPropagation(); preset('kettle'); };
(transitPanel.querySelector('#tDriveKettle') as HTMLButtonElement).onclick = (e) => { e.stopPropagation(); transitOpen = false; transitPanel.style.display = 'none'; freeSpawn = { p: [-1520, 1380], q: [-1460, 1490] }; startDrive('free'); };
transitBtn.onclick = (e) => {
  e.stopPropagation();
  transitOpen = !transitOpen;
  transitPanel.style.display = transitOpen ? 'block' : 'none';
  if (transitOpen) renderTransitBoard();
};
// Live Cops & Robbers Pursuit HUD Banner (Role, APB/Hideout Distance, Vehicle Health, [F] On Foot)
const pursuitHudEl = document.createElement('div');
pursuitHudEl.id = 'pursuitHud';
pursuitHudEl.style.cssText = 'position:fixed;left:50%;top:62px;transform:translateX(-50%);z-index:35;min-width:min(460px,92vw);padding:10px 18px;border-radius:16px;background:rgba(12,6,24,.88);border:1px solid rgba(255,70,95,.55);backdrop-filter:blur(14px);box-shadow:0 16px 46px rgba(0,0,0,.55);color:#fff;font:600 12px/1.4 Inter,sans-serif;display:none;pointer-events:none';
document.body.appendChild(pursuitHudEl);

// Interactive Police Cruiser Siren ON/OFF + Tone + Air Horn Controls (visible in Cop Pursuit & Free Roam in Police Interceptor)
const policeControlsEl = document.createElement('div');
policeControlsEl.id = 'policeControls';
policeControlsEl.style.cssText = 'position:fixed;left:50%;top:138px;transform:translateX(-50%);z-index:38;display:none;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(9,14,28,.86);border:1px solid rgba(100,175,255,.45);backdrop-filter:blur(12px);box-shadow:0 12px 32px rgba(0,0,0,.48);pointer-events:auto';
policeControlsEl.innerHTML = `
  <button id="sirenToggleBtn" type="button" style="height:30px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#dce8ff;font:800 11px Outfit,sans-serif;letter-spacing:.14em;cursor:pointer">SIREN: OFF [G]</button>
  <button id="sirenModeBtn" type="button" style="height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#9ed4ff;font:700 11px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">TONE: WAIL [T]</button>
  <button id="sirenHornBtn" type="button" style="height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,190,70,.35);background:rgba(255,160,30,.14);color:#ffd57e;font:700 11px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">AIR HORN [H]</button>
`;
document.body.appendChild(policeControlsEl);
const sirenToggleBtn = policeControlsEl.querySelector('#sirenToggleBtn') as HTMLButtonElement;
const sirenModeBtn = policeControlsEl.querySelector('#sirenModeBtn') as HTMLButtonElement;
const sirenHornBtn = policeControlsEl.querySelector('#sirenHornBtn') as HTMLButtonElement;
function isPlayerPoliceCar(): boolean {
  return !!driving && (pursuitMode?.role === 'cop' || driving.car.userData.carId === 'vernon_police');
}
function syncPoliceControlsUi(): void {
  const show = isPlayerPoliceCar() && !mapMode && !replay.active;
  policeControlsEl.style.display = show ? 'flex' : 'none';
  if (!show) return;
  policeControlsEl.style.top = pursuitMode ? '138px' : '64px';
  const on = gameAudio.isSirenOn;
  const mode = gameAudio.currentSirenMode.toUpperCase();
  sirenToggleBtn.textContent = on ? `SIREN: ON · ${mode} [G]` : 'SIREN: OFF [G]';
  sirenToggleBtn.style.background = on ? 'linear-gradient(90deg,#e0243d,#1e6eff)' : 'rgba(255,255,255,.08)';
  sirenToggleBtn.style.color = on ? '#ffffff' : '#dce8ff';
  sirenToggleBtn.style.boxShadow = on ? '0 0 18px rgba(40,130,255,.55)' : 'none';
  sirenModeBtn.textContent = `TONE: ${mode} [T]`;
}
sirenToggleBtn.onclick = (e) => { e.stopPropagation(); gameAudio.toggleSiren(); syncPoliceControlsUi(); };
sirenModeBtn.onclick = (e) => { e.stopPropagation(); gameAudio.cycleSirenMode(); syncPoliceControlsUi(); };
sirenHornBtn.onclick = (e) => { e.stopPropagation(); gameAudio.triggerAirHorn(); };
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

// ---------- photorealistic idle hero showcase: after 25 s on the map menu, curated low-altitude cinema dolly shots glide through Ironport ----------
const cineFade = document.createElement('div');
cineFade.style.cssText = 'position:fixed;inset:0;background:#07030e;opacity:0;pointer-events:none;z-index:15;transition:opacity .95s cubic-bezier(.22,1,.36,1)';
document.body.appendChild(cineFade);
const cineOverlay = document.createElement('div');
cineOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:14;display:none;font-family:Outfit,Inter,sans-serif;color:#fff';
cineOverlay.innerHTML = `
  <div style="position:absolute;left:0;right:0;top:0;height:6vh;background:linear-gradient(180deg,rgba(6,2,12,.92),rgba(6,2,12,.72))"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:6vh;background:linear-gradient(0deg,rgba(6,2,12,.92),rgba(6,2,12,.72))"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 56%,rgba(8,2,16,.48) 100%)"></div>
  <div data-c="cap" style="position:absolute;left:44px;bottom:calc(6vh + 22px);padding:10px 18px;background:rgba(14,6,26,.68);backdrop-filter:blur(12px);border-left:4px solid #FF8C00;border-radius:0 8px 8px 0">
    <div data-c="tag" style="font:700 10px 'JetBrains Mono',monospace;letter-spacing:.26em;color:#00DAF3;text-transform:uppercase">IRONPORT SHOWCASE</div>
    <div data-c="title" style="font:800 20px Outfit,sans-serif;letter-spacing:.08em;margin-top:2px">DOWNTOWN SKYLINE</div>
  </div>
  <div style="position:absolute;right:44px;bottom:calc(6vh + 24px);font:600 11px 'JetBrains Mono',monospace;letter-spacing:.14em;opacity:.72;text-transform:uppercase">Move mouse or press any key to return to map</div>`;
document.body.appendChild(cineOverlay);
const cineTagEl = cineOverlay.querySelector('[data-c="tag"]') as HTMLElement;
const cineTitleEl = cineOverlay.querySelector('[data-c="title"]') as HTMLElement;

interface CineHeroShot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  atFrom: THREE.Vector3;
  atTo: THREE.Vector3;
  dur: number;
  fov: number;
  tod: string;
  wet: number;
  tag: string;
  title: string;
}
let cineOn = false, cineIdx = 0, cineT = 0, cineShots: CineHeroShot[] = [];
let cineSavedLut: { lut: string; amt: number } | null = null;
let cineBaseFov = 55;
let lastInput = performance.now();

function buildCineShots(): CineHeroShot[] {
  const out: CineHeroShot[] = [];
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const g = (x: number, z: number): number => meshH(x, z);
  const add = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    atFrom: THREE.Vector3,
    atTo: THREE.Vector3,
    tag: string,
    title: string,
    opts?: { dur?: number; fov?: number; tod?: string; wet?: number },
  ): void => {
    out.push({
      from,
      to,
      atFrom,
      atTo,
      dur: opts?.dur ?? 9.5,
      fov: opts?.fov ?? 36,
      tod: opts?.tod ?? 'golden',
      wet: opts?.wet ?? 0.18,
      tag,
      title,
    });
  };

  // 1. Low-altitude riverfront push toward the v4 Colab HD Downtown Skyline & RenCen towers (440 m — crisp & haze-free!)
  add(
    V(5080, 46, 1490), V(5320, 34, 1340),
    V(5610, 74, 1140), V(5640, 62, 1080),
    'DOWNTOWN IRONPORT · GOLDEN HOUR', 'WATERFRONT SKYLINE APPROACH',
    { dur: 10, fov: 35, tod: 'golden', wet: 0.24 },
  );
  // 2. Ironport Grand Circuit street-level canyon glide along the main straight & start/finish gantry
  if (cityPath.length > 24) {
    const a = cityPath[cityPath.length - 18], b = cityPath[cityPath.length - 4], c = cityPath[10];
    const ga = g(a.x, a.z), gb = g(b.x, b.z), gc = g(c.x, c.z);
    add(
      V(a.x + 2.4, ga + 3.2, a.z), V(b.x + 1.2, gb + 2.4, b.z),
      V(c.x, gc + 4.5, c.z), V(c.x, gc + 8.5, c.z),
      'IRONPORT GRAND CIRCUIT · STREET CANYON', 'START / FINISH STRAIGHT',
      { dur: 9, fov: 38, tod: 'sunset', wet: 0.38 },
    );
  }
  // 3. Halcyon Gateway cable-stayed bridge low sweeping hero pass
  add(
    V(3160, g(3160, 3140) + 34, 3140), V(3440, g(3440, 2980) + 52, 2980),
    V(3810, 48, 2770), V(3840, 58, 2740),
    'GREAT LAKES CROSSING · SUNSET', 'HALCYON GATEWAY BRIDGE',
    { dur: 9.5, fov: 35, tod: 'sunset', wet: 0.28 },
  );
  // 4. Civic Riverfront Opera Hall & Marina twilight reflection sweep
  if (civicSpots['opera hall']) {
    const L = civicSpots['opera hall'];
    add(
      V(L[0] - 185, Math.max(g(L[0] - 185, L[2] - 55), 3) + 26, L[2] - 55),
      V(L[0] - 145, Math.max(g(L[0] - 145, L[2] + 35), 3) + 20, L[2] + 35),
      V(L[0], L[1] + 16, L[2]), V(L[0], L[1] + 14, L[2]),
      'CIVIC RIVERFRONT · TWILIGHT', 'GRAND OPERA HALL & MARINA',
      { dur: 9.5, fov: 36, tod: 'dusk', wet: 0.42 },
    );
  }
  // 5. Northgate Bridge crisp sunrise reveal
  add(
    V(5660, g(5660, -3540) + 46, -3540), V(5860, g(5860, -3610) + 56, -3610),
    V(6280, 48, -3888), V(6300, 52, -3880),
    'NORTH HARBOR · SUNRISE', 'NORTHGATE SUSPENSION SPAN',
    { dur: 9, fov: 35, tod: 'sunrise', wet: 0.16 },
  );
  // 6. Campus Martius downtown crest overlooking the financial district skyscrapers
  add(
    V(5460, g(5460, 1080) + 36, 1080), V(5680, g(5680, 1030) + 42, 1030),
    V(5860, 74, 1190), V(5820, 68, 1220),
    'IRONPORT FINANCIAL DISTRICT', 'CAMPUS MARTIUS CREST',
    { dur: 9, fov: 36, tod: 'golden', wet: 0.30 },
  );
  // 7. Ironworks Container Terminal & Harbor Cranes
  if (portData?.cranes?.length) {
    const cr = portData.cranes[0];
    add(
      V(cr.x - 165, Math.max(g(cr.x - 165, cr.z + 90), 4) + 28, cr.z + 90),
      V(cr.x - 115, Math.max(g(cr.x - 115, cr.z + 135), 4) + 22, cr.z + 135),
      V(cr.x, 22, cr.z), V(cr.x + 25, 26, cr.z),
      'IRONWORKS INDUSTRIAL CIRCUIT', 'CONTAINER TERMINAL QUAY',
      { dur: 9, fov: 36, tod: 'golden', wet: 0.34 },
    );
  }
  // 8. Shoreline Highway cliff gallery overhang
  if (shoreHw) {
    const i = Math.floor((shoreHw.gallery.from + shoreHw.gallery.to) / 2), q = shoreHw.xz[i], y = shoreHw.y[i];
    add(
      V(q[0] - 210, y + 36, q[1] - 210), V(q[0] - 155, y + 26, q[1] - 95),
      V(q[0], y + 6, q[1] + 55), V(q[0], y + 5, q[1] + 85),
      'SUPERIOR COAST · ROCK GALLERY', 'SHORELINE CLIFF OVERHANG',
      { dur: 9, fov: 36, tod: 'golden', wet: 0.14 },
    );
  }
  // 9. Countryside Millbrook Covered Bridge & Pinewood Valley
  if (countryScenes?.shots?.[0]) {
    const sh = countryScenes.shots[0];
    add(
      V(...sh.cam), V(sh.cam[0] + 10, sh.cam[1] + 2.5, sh.cam[2] - 10),
      V(...sh.at), V(sh.at[0], sh.at[1] + 0.5, sh.at[2]),
      'PINEWOOD VALLEY · COUNTRYSIDE', 'MILLBROOK COVERED BRIDGE',
      { dur: 8.5, fov: 38, tod: 'golden', wet: 0.10 },
    );
  }
  // 10. Dune Coast & Great Lakes golden horizon
  add(
    V(-6320, g(-6320, 1280) + 42, 1280), V(-6160, g(-6160, 1020) + 34, 1020),
    V(-5450, 26, 520), V(-5380, 24, 460),
    'WEST COAST · DUNES', 'GREAT LAKES HORIZON',
    { dur: 9, fov: 36, tod: 'sunset', wet: 0.08 },
  );
  return out;
}

function applyCineShotMood(s: CineHeroShot): void {
  setTimeOfDay(s.tod);
  wx.setWeather(s.wet > 0.32 ? 'partly' : 'clear', false, true);
  roadWater.wetness = s.wet;
  roadWater.pooling = s.wet > 0.34 ? 0.18 : 0.04;
  wetU.value = roadWater.wetness;
  poolU.value = roadWater.pooling;
  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  cineTagEl.textContent = s.tag;
  cineTitleEl.textContent = s.title;
}

let cineStartedAt = 0;
function startCine(): void {
  if (cineOn || driving) return;
  cineShots = buildCineShots();
  if (!cineShots.length) return;
  cineOn = true; cineT = 0; cineIdx = 0; cineStartedAt = performance.now();
  cineBaseFov = camera.fov;
  setMapMode(false);                                                   // full photoreal world: shadows, SSAO, skyline, trees, wet sheen
  // Apply Plajah AgX warm cinema LUT during idle showcase, restoring user's choice cleanly on exit
  if (gradePass) {
    cineSavedLut = { lut: gradePass.lut, amt: gradePass.lutAmount };
    if (gradePass.lut === 'none') { gradePass.lut = 'fable-warm'; gradePass.lutAmount = 0.55; }
  }
  applyCineShotMood(cineShots[0]);
  menuEl.style.display = 'none'; backBtn.style.display = 'none';
  cineOverlay.style.display = 'block';
  controls.autoRotate = false; controls.enabled = false; tween = null;
  labelGroup.visible = false;
  furnitureGroup.traverse((o) => { if (o instanceof THREE.Sprite) o.visible = false; });
}
(window as unknown as { startCine?: () => void }).startCine = startCine;

function endCine(quiet = false): void {                              // quiet: a drive is starting, so don't fall back to the overview
  if (!cineOn) return;
  cineOn = false; cineFade.style.opacity = '0';
  cineOverlay.style.display = 'none';
  if (gradePass && cineSavedLut) { gradePass.lut = cineSavedLut.lut; gradePass.lutAmount = cineSavedLut.amt; cineSavedLut = null; }
  camera.fov = cineBaseFov; camera.updateProjectionMatrix();
  controls.enabled = true; labelGroup.visible = (document.getElementById('tLab') as HTMLInputElement).checked;
  furnitureGroup.traverse((o) => { if (o instanceof THREE.Sprite) o.visible = true; });
  const w = menuEl.querySelector('#mapCardsWrap') as HTMLElement; w.style.opacity = '1'; w.style.pointerEvents = 'auto';
  if (!quiet) preset('overview');
}
function stepCine(dt: number, now: number): void {
  if (!cineOn) {
    const cityReady = ((window as unknown as { cityCount?: number }).cityCount ?? 0) > 0;
    if (cityReady && bootDismissed && mapMode && menuEl.style.display === 'block' && briefEl.style.display === 'none' && settingsEl.style.display !== 'block' && !mapEditor?.isOpen() && !driving && now - lastInput > 25000) startCine();
    return;
  }
  const s = cineShots[cineIdx];
  cineT += dt;
  const k = Math.min(1, cineT / s.dur);
  const e = k * k * (3 - 2 * k) * 0.45 + k * 0.55;      // motorized cinema dolly glide
  camera.position.lerpVectors(s.from, s.to, e);
  controls.target.lerpVectors(s.atFrom, s.atTo, e);
  camera.lookAt(controls.target);
  cineFade.style.opacity = cineT < 0.85 || cineT > s.dur - 0.85 ? '1' : '0';
  if (cineT >= s.dur) {
    cineIdx = (cineIdx + 1) % cineShots.length;
    cineT = 0;
    applyCineShotMood(cineShots[cineIdx]);
  }
}
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
  addEventListener(ev, (e) => {
    if (ev === 'pointermove' && Math.abs((e as PointerEvent).movementX) + Math.abs((e as PointerEvent).movementY) < 2) return;
    const now = performance.now();
    lastInput = now;
    if (cineOn && now - cineStartedAt > 450) endCine();
  }, { passive: true });
}

function setMapMode(on: boolean): void {
  if (mapMode === on) return;
  mapMode = on;
  vignette.style.display = on ? 'block' : 'none';
  menuEl.style.display = on ? 'block' : 'none';
  backBtn.style.display = on ? 'none' : 'block';
  cineBtn.style.display = on ? 'inline-flex' : 'none';
  onlineHubBtn.style.right = on ? '218px' : '304px';
  onlineHubBtn.style.top = on ? '19px' : '16px';
  transitBtn.style.right = on ? '316px' : '408px';
  transitBtn.style.top = on ? '19px' : '16px';
  controls.autoRotate = on;
  controls.autoRotateSpeed = 0.35;
  applyMapOffset();
  mapFadeU.value = on ? 1 : 0;
  if (webgpuTerrainHandle) webgpuTerrainHandle.uniforms.uMapFade.value = on ? 1 : 0;
  if (on) playMusic('menu');
  // Keep WebGPU terrain strictly opaque (border fades smoothly into mapBackdrop color in TSL) — avoids transparent sorting glitches & shader recompiles!
  if (terrainMat && !USE_WEBGPU) { terrainMat.transparent = on; terrainMat.needsUpdate = true; }
  // 60 FPS Map Overview Mode: swap 95M-tri full city for 2-draw-call skyline proxy, disable shadow passes & sub-pixel close-up micro-props
  // (restored instantaneously when flying down into a circuit, entering hero showcase, or starting a race!)
  const showBuildings = (document.getElementById('tBld') as HTMLInputElement).checked;
  cityGroup.visible = !on && showBuildings;
  if (cityBroadcastLights) cityBroadcastLights.group.visible = !on && showBuildings;
  if (signatureTowers) signatureTowers.group.visible = !on && showBuildings;
  mapSkylineGroup.visible = on && showBuildings;
  mapWorldProxyGroup.visible = on && showBuildings;
  mapRoadsGroup.visible = on;
  // Never turn autoUpdate back on in WebGPU/WebGL driving mode — spatialCuller throttles shadow redraws every shadowStride frames!
  renderer.shadowMap.autoUpdate = false;
  sun.shadow.autoUpdate = false;
  if (!on) { renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; }
  if (on) {
    mapBackdrop = mapBackdrop ?? makeMapBackdrop();
    scene.background = mapBackdrop;
    forestGroup.visible = false;
    scapeGroup.visible = false;
    streetGroup.visible = false;
    roofGroup.visible = false;
    harborGroup.visible = false;
    furnitureGroup.visible = false;
    zoneGroup.visible = false;
    worldPhys.group.visible = false;
    for (const l of cloudLayers) l.mesh.visible = false;
    if (parked) parked.group.visible = false;
    if (townWalks) townWalks.group.visible = false;
    if (refDress) refDress.group.visible = false;
    if (parkingLots) parkingLots.group.visible = false;
    if (wildlifeWorld) wildlifeWorld.group.visible = false;
    if (simLayer) simLayer.setMapOverview(true);
    scene.fog = new THREE.Fog(0x000000, 1e6, 2e6);          // never null: adding or removing fog recompiles every shader in the scene
    circuitGroup.visible = true;
    placeNext = 0;                                         // immediately cull close-up hardware on entering map mode
  } else {
    forestGroup.visible = true;
    scapeGroup.visible = (document.getElementById('tScape') as HTMLInputElement).checked;
    streetGroup.visible = (document.getElementById('tStr') as HTMLInputElement).checked;
    roofGroup.visible = showBuildings;
    harborGroup.visible = (document.getElementById('tHar') as HTMLInputElement).checked;
    furnitureGroup.visible = true;
    zoneGroup.visible = true;
    worldPhys.group.visible = true;
    for (const l of cloudLayers) l.mesh.visible = true;
    if (parked) parked.group.visible = true;
    if (townWalks) townWalks.group.visible = true;
    if (refDress) refDress.group.visible = true;
    if (parkingLots) parkingLots.group.visible = true;
    if (wildlifeWorld) wildlifeWorld.group.visible = true;
    if (simLayer) simLayer.setMapOverview(false);
    renderer.shadowMap.needsUpdate = true;
    setTimeOfDay(todKey);
    circuitGroup.visible = (document.getElementById('tCirc') as HTMLInputElement).checked;
    placeNext = 0;
    for (const tf of treeFields) tf.update(0.016, camera.position);
  }
}

// ---------- event briefing and countdown ----------
const BRIEFS: Record<string, { view: string; drive: string; tag: string; name: string; color: string; lines: string[]; blurb: string }> = {
  city: { view: 'city', drive: 'ironport_grand_circuit', tag: 'CITY CIRCUIT', name: 'Ironport Grand Circuit', color: '#FF8C00', lines: ['4.2 km  ·  13 corners  ·  clockwise', 'Riverside straight into the RenCen hairpin', 'Climb to the Campus Martius crest, 43 m above the lake'], blurb: 'Walls everywhere, no run-off. Brake late at T1 and keep it clean through the downtown hill.' },
  cliff: { view: 'cliff', drive: 'great_lakes_cliff_raceway', tag: 'ROAD COURSE', name: 'Great Lakes Cliff Raceway', color: '#00DAF3', lines: ['9.8 km  ·  switchback climb  ·  tunnel', 'Starts on the beach, finishes 135 m above the lake', 'Coastal run out of the tunnel with open lake views'], blurb: 'A traditional race course on the western bluff. Hold the line through the climb.' },
  rally: { view: 'rally', drive: 'pinewood_rally_stage', tag: 'RALLY STAGE', name: 'Pinewood Rally Stage', color: '#D40055', lines: ['11 km  ·  gravel and forest trail', 'Service park at Otter Creek', 'Creek ford, lighthouse point and a cut forest trail'], blurb: 'Loose surface through the pines. Short on grip, long on speed.' },
  ind: { view: 'industrial', drive: IND, tag: 'STREET COURSE', name: 'Ironworks Industrial Circuit', color: '#9bb0c8', lines: ['5.3 km  ·  20 turns  ·  clockwise', 'Warehouse district, container port and the harbour hairpin on the river', 'Through the refinery, over the freight yard, under the railway'], blurb: 'Concrete either side the whole way. The bridge over the rail yard and the dive under the railway decide the lap.' },
  civ: { view: 'civic', drive: CIV, tag: 'STREET COURSE', name: 'Civic Riverfront Street Circuit', color: '#e8b04a', lines: ['5.4 km  ·  clockwise', 'South along the riverwalk past the marina, the museums, the amphitheatre and the beach', 'Back up the boulevard, a chicane by the museum and one by the amphitheatre'], blurb: 'The promenade on one side, the river beyond the palms. Two hairpins and two chicanes: brake late and keep it off the walls.' },
  harb: { view: 'harbor', drive: HARB, tag: 'STREET COURSE', name: 'Harbor District Street Circuit', color: '#6fb7d8', lines: ['5.4 km  ·  20 turns  ·  clockwise', 'Out along the east pier and back, round the wharf on the quay', 'Container yards, cranes and ships the whole lap'], blurb: 'Two piers and a wharf: the long DRS runs are out over the water. Brake for the pier hairpin before the cranes.' },
  superior: { view: 'superior', drive: 'superior_range_circuit', tag: 'MOUNTAIN CIRCUIT', name: 'Superior Range Circuit', color: '#7FD1FF', lines: ['23 km  ·  one lap  ·  clockwise', 'North along the cliff highway and over the three fjord bridges', 'Back over Glacier Pass: hairpins to 430 m between the glaciers, down through the giant forest'], blurb: 'Fast and open on the coast, tight and steep on the pass. Save the brakes for the descent.' },
  escarpment: { view: 'escarpment', drive: 'escarpment_circuit', tag: 'MOUNTAIN CIRCUIT', name: 'Escarpment Circuit', color: '#FFB86B', lines: ['10.4 km  ·  one lap', 'Over the finger lake head bridge, then up the Stair: six legs and five hairpins on the cliff face', 'East along the crest, a 120 m viaduct over the notch, down the eastern gap to the lake'], blurb: 'Climb hard, then hold your nerve on the skyline. The descent is long, fast and downhill all the way to the lake.' },
  free: { view: 'downtown', drive: 'free', tag: 'FREE ROAM', name: 'Explore the region', color: '#D0BCFF', lines: ['150 km² open region', 'Port Halcyon, the dune coast, the harbor and the freeway', 'Drive anywhere'], blurb: 'Start on the coastal highway and go wherever the roads lead.' },
};
const briefEl = document.createElement('div');
briefEl.id = 'brief';
briefEl.style.cssText = 'position:fixed;left:44px;bottom:48px;width:420px;display:none;font-family:Inter,sans-serif;color:#fff;padding:22px 24px;background:rgba(26,0,38,.78);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.55);user-select:none';
document.body.appendChild(briefEl);
const countEl = document.createElement('div');
countEl.id = 'raceCount';
countEl.style.cssText = 'position:fixed;left:0;right:0;top:30%;text-align:center;font:800 130px Outfit,sans-serif;color:#fff;text-shadow:0 0 50px rgba(212,0,85,.9),0 0 90px rgba(255,140,0,.5);display:none;pointer-events:none;letter-spacing:.04em';
document.body.appendChild(countEl);
function hideBrief(): void { briefEl.style.display = 'none'; }
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !driving && briefEl.style.display === 'block') {
    e.preventDefault();
    if (wxOverride === 'auto') wx.setWeather('partly', false, true);
    preset('overview');
  }
});

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
addMenuCard('ONLINE OPEN WORLD', 'Ironport Online (32P)', 'Shared open map · live drivers · gamertags · voice', '#00DAF3', () => launchOnlineHub('world'));
addMenuCard('ONLINE RACE LOBBY', 'Ranked & Private Lobbies', '12-player matchmaking · room codes · all circuits', '#FF8C00', () => launchOnlineHub('race'));
addMenuCard('PURSUIT MODE', 'Cops & Robbers', 'Heist getaway or police chase · pick your side', '#4d8dff', openPursuitBrief);
addMenuCard('COURIER MODE', 'Delivery shift','Passengers · food · packages · beat the clock, chain the drops', '#00f5d4', openCourierBrief);
addMenuCard('GARAGE', 'Cars, parts and tuning', 'Showroom · upgrades · tuning · objectives', '#ffd166', () => { location.href = 'showroom.html'; });
function openBrief(id: string): void {
  const b = BRIEFS[id];
  if (!b) return;
  if (wxOverride === 'auto' && WEATHER_PLAN[id]) wx.setWeather(worstOf(WEATHER_PLAN[id]), false, true);      // the map shows the race's worst weather as the forecast
  preset(b.view, true);       // stays on the map screen: dark backdrop, faded edges, no sky
  const circ = id === 'free' ? null : meta.circuits[b.drive];
  const cc = id === 'free' ? new THREE.Vector3(-4600, 0, 1800) : (circ ? centroid(circ) : new THREE.Vector3(3800, 0, 300));
  const hh = id === 'city' ? 1500 : id === 'ind' || id === 'harb' || id === 'civ' ? 1300 : id === 'cliff' ? 5200 : id === 'rally' ? 6200 : id === 'superior' ? 9000 : id === 'escarpment' ? 5200 : 6800;
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
function look(pos: THREE.Vector3, target: THREE.Vector3, instant = false): void {
  if (tweenOn && !instant) {
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur: 1.5 };
    return;
  }
  tween = null;
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
  if (name === 'harbor' && harbor && harbor.terminals.length) { const t = harbor.terminals[0]; look(new THREE.Vector3(t.c[0] - 700, 260, t.c[1] - 500), new THREE.Vector3(t.c[0], 8, t.c[1] + 120)); }
  if (name === 'civic' && meta.circuits[CIV]) { const c = centroid(meta.circuits[CIV]); look(new THREE.Vector3(c.x - 900, 900, c.z + 700), new THREE.Vector3(c.x, 10, c.z)); }
  if (name === 'harbor' && meta.circuits[HARB]) { const c = centroid(meta.circuits[HARB]); look(new THREE.Vector3(c.x - 700, 1000, c.z + 900), new THREE.Vector3(c.x, 10, c.z)); }
  if (name === 'industrial' && meta.circuits[IND]) { const c = centroid(meta.circuits[IND]); look(new THREE.Vector3(c.x - 600, 900, c.z + 900), new THREE.Vector3(c.x, 10, c.z)); }
  if (name === 'superior' && meta.circuits.superior_range_circuit) { const c = centroid(meta.circuits.superior_range_circuit); look(new THREE.Vector3(c.x + 4200, 3600, c.z + 5200), new THREE.Vector3(c.x - 200, 200, c.z)); }
  if (name === 'escarpment' && meta.circuits.escarpment_circuit) { const c = centroid(meta.circuits.escarpment_circuit); look(new THREE.Vector3(c.x + 1800, 1500, c.z + 2600), new THREE.Vector3(c.x, 180, c.z - 300)); }
  if (name === 'dunes') look(new THREE.Vector3(-6500, 1500, 1500), new THREE.Vector3(-5200, 10, 400));
  if (name === 'airport') look(new THREE.Vector3(-5650, 175, 3780), new THREE.Vector3(-4550, 16, 4220), true);
  if (name === 'kettle') look(new THREE.Vector3(-1760, 155, 1760), new THREE.Vector3(-1460, 14, 1450), true);
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
furnitureGroup.name = 'furniture';
scene.add(furnitureGroup);
let cityRoadMat: THREE.Material | null = null;                  // US MUTCD 2-lane asphalt (double-yellow center, white outer fog lines, wet-road PBR)
let usRoadMat4Lane: THREE.Material | null = null;               // US MUTCD 4-lane highway/freeway asphalt (double-yellow divider + dashed white lanes)
let usRoadMatPlain: THREE.Material | null = null;               // Clean unmarked weathered asphalt for intersection aprons (prevents X line clashes!)
let wildlifeWorld: WildlifeWorld | null = null;
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
  // Continuous, strictly vertical F-shape concrete Jersey barrier walls along both edges of the Grand Circuit
  // (weathered precast concrete + tire scuffs + red/white outside-corner accents, smoothly following road height with zero block staggering or tilted angles)
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  {
    const greyRuns: [number, number, number][][] = [];
    const redRuns: [number, number, number][][] = [];
    const hazRuns: [number, number, number][][] = [];
    const off = HALF + 1.4;
    for (const side of [-1, 1]) {
      const edge: ({ p: [number, number, number]; kind: 'grey' | 'red' | 'hazard' } | null)[] = [];
      for (let i = 0; i < n; i++) {
        const [tx, tz] = tan(i);
        const x = P[i].x - tz * off * side, z = P[i].z + tx * off * side;
        const [txA, tzA] = tan((i - 2 + n) % n), [txB, tzB] = tan((i + 2) % n);
        const turn = Math.atan2(txA * tzB - tzA * txB, txA * txB + tzA * tzB);
        // Smooth road edge height (anchored cleanly with the ribbon's -0.32 m footing so it never steps or floats on crowns)
        const roadY = Math.max(hAt(P[i].x, P[i].z) * exag, meshH(P[i].x, P[i].z)) + RIBBON_LIFT - 0.04;
        const isOutsideCorner = Math.abs(turn) > 0.20 && (turn > 0 ? -1 : 1) === side;
        const kind: 'grey' | 'red' | 'hazard' = isOutsideCorner ? (side > 0 ? 'red' : 'hazard') : 'grey';
        edge.push({ p: [x, roadY, z], kind });
      }
      let curKind: 'grey' | 'red' | 'hazard' = 'grey';
      let curRun: [number, number, number][] = [];
      const flush = (): void => {
        if (curRun.length >= 2) (curKind === 'red' ? redRuns : curKind === 'hazard' ? hazRuns : greyRuns).push(curRun);
        curRun = [];
      };
      for (let k = 0; k <= n; k++) {
        const i = k % n, item = edge[i];
        if (!item) { flush(); continue; }
        const [tx, tz] = tan(i);
        if (curRun.length) {
          const prev = curRun[curRun.length - 1];
          const dx = item.p[0] - prev[0], dz = item.p[2] - prev[2], d = Math.hypot(dx, dz);
          if (d > 24 || (d > 0.25 && (dx * tx + dz * tz) / d < 0.28)) { flush(); }
        }
        if (curRun.length && item.kind !== curKind) {
          curRun.push(item.p);
          flush();
          curKind = item.kind;
          curRun.push(item.p);
        } else {
          curKind = item.kind;
          curRun.push(item.p);
        }
      }
      flush();
    }
    const gWall = buildJerseyBarrierRibbon(greyRuns, concreteBarrierMaterial('grey'), 'city-jersey-grey');
    const rWall = buildJerseyBarrierRibbon(redRuns, concreteBarrierMaterial('red'), 'city-jersey-red');
    const hWall = buildJerseyBarrierRibbon(hazRuns, concreteBarrierMaterial('hazard'), 'city-jersey-hazard');
    if (gWall) furnitureGroup.add(gWall);
    if (rWall) furnitureGroup.add(rWall);
    if (hWall) furnitureGroup.add(hWall);
  }
  // Crisp uniform-width FIA corner apex kerbs (0.95 m constant width tucked strictly along the inside corner curb;
  // anchored +4.5 cm above the exact road centerline+edge height with strong polygonOffset so they NEVER z-fight, widen, or chase the car!)
  const corners = c.corners ?? [];
  const kAcc: Acc = { pos: [], idx: [], uv: [] };
  const KERB_W = 0.95;
  const KERB_TILE = 2.6;
  for (const cn of corners) {
    let bi2 = 0, best = 1e9;
    for (let i = 0; i < n; i++) { const d = Math.hypot(P[i].x - cn.x, P[i].z - cn.z); if (d < best) { best = d; bi2 = i; } }
    const inside = cn.turn > 0 ? 1 : -1;
    const base = kAcc.pos.length / 3;
    let dist = 0;
    let prevX = 0, prevZ = 0;
    const kHalf = 4; // +/- 4 segments (~48 m strictly around the corner apex — never spilling down straightaways!)
    const segCount = kHalf * 2 + 1;
    for (let s = 0; s < segCount; s++) {
      const k = s - kHalf;
      const i = (bi2 + k + n) % n;
      const [tx, tz] = tan(i);
      const nx = -tz * inside, nz = tx * inside;
      // Tuck outer edge flush to the curb line (HALF) and inner edge exactly KERB_W (0.95 m) inward
      const outX = P[i].x + nx * (HALF + 0.02), outZ = P[i].z + nz * (HALF + 0.02);
      const inX = P[i].x + nx * (HALF - KERB_W), inZ = P[i].z + nz * (HALF - KERB_W);
      const sCenter = Math.max(hAt(P[i].x, P[i].z) * exag, meshH(P[i].x, P[i].z));
      const sOut = Math.max(hAt(outX, outZ) * exag, meshH(outX, outZ));
      const sIn = Math.max(hAt(inX, inZ) * exag, meshH(inX, inZ));
      const yKerb = Math.max(sCenter, sOut, sIn) + RIBBON_LIFT + 0.045;
      kAcc.pos.push(inX, yKerb, inZ, outX, yKerb, outZ);
      if (s > 0) dist += Math.hypot(outX - prevX, outZ - prevZ);
      prevX = outX; prevZ = outZ;
      kAcc.uv!.push(0, dist / KERB_TILE, 1, dist / KERB_TILE);
    }
    for (let s = 0; s < segCount - 1; s++) {
      const v = base + s * 2;
      kAcc.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  {
    const km = accMeshTex(kAcc, loadPbr1K('ground_rumble_strip.png', true, 0xc8382e, 512), 0.78, -9);
    const kMat = km.material as THREE.MeshStandardMaterial;
    kMat.polygonOffset = true;
    kMat.polygonOffsetFactor = -9;
    kMat.polygonOffsetUnits = -18;
    kMat.normalMap = loadPbr1K('ground_rumble_strip_normal.png', false, 0x8080ff, 512);
    kMat.normalScale = new THREE.Vector2(1.05, 1.05);
    kMat.roughnessMap = loadPbr1K('ground_rumble_strip_roughness.png', false, 0xc0c0c0, 512);
    kMat.needsUpdate = true;
    furnitureGroup.add(km);
    driveSurfaces.push(km);
  }
  // racing surface over the street: crisp US MUTCD asphalt (double solid amber-yellow centerline + solid white outer fog lines)
  const roadAcc: Acc = { pos: [], idx: [], uv: [] };
  addRibbonUV(roadAcc, P.map((p) => [p.x, p.z]), 11, RIBBON_LIFT, 6.2);
  {
    const rm = accMeshTex(roadAcc, createUsRoadTexture('2lane'), 0.8, -4);
    if (USE_WEBGPU && tslRegionCtx) {
      cityRoadMat = createApexUsRoadTslMaterial({ map: createUsRoadTexture('2lane'), shared: tslRegionCtx.shared, gi: tslRegionCtx.gi, polygonOffsetFactor: -4, roughness: 0.80 }) as unknown as THREE.Material;
      rm.material = cityRoadMat;
      usRoadMat4Lane = createApexUsRoadTslMaterial({ map: createUsRoadTexture('4lane'), shared: tslRegionCtx.shared, gi: tslRegionCtx.gi, polygonOffsetFactor: -4, roughness: 0.80 }) as unknown as THREE.Material;
      usRoadMatPlain = createApexUsRoadTslMaterial({ map: createUsRoadTexture('plain'), shared: tslRegionCtx.shared, gi: tslRegionCtx.gi, polygonOffsetFactor: -6, roughness: 0.82 }) as unknown as THREE.Material;
    } else {
      cityRoadMat = rm.material as THREE.Material;
      usRoadMat4Lane = new THREE.MeshStandardMaterial({
        map: createUsRoadTexture('4lane'),
        roughness: 0.8,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -8,
      });
      usRoadMatPlain = new THREE.MeshStandardMaterial({
        map: createUsRoadTexture('plain'),
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -12,
      });
    }
    furnitureGroup.add(rm);
    driveSurfaces.push(rm);
  }
  // start and finish gantry with a chequered line
  const [gx, gz] = tan(0);
  const g0 = P[0];
  const gy = Math.max(hAt(g0.x, g0.z) * exag, meshH(g0.x, g0.z));
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
  mergeStaticScenery(trackKit.group, 800);
  furnitureGroup.add(trackKit.group);
  const gridQuad = new THREE.Mesh(new THREE.PlaneGeometry(26, 10.5), new THREE.MeshStandardMaterial({ map: gameTex('grid', false), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  gridQuad.rotation.order = 'YXZ';
  gridQuad.rotation.x = -Math.PI / 2;
  gridQuad.rotation.y = -Math.atan2(gz, gx);
  gridQuad.position.set(g0.x - gx * 15, hAt(g0.x - gx * 15, g0.z - gz * 15) * exag + RIBBON_LIFT + 0.012, g0.z - gz * 15);      // on the road surface: 40 cm up it buried the car
  furnitureGroup.add(gridQuad);
  furnitureGroup.add(ribbon(pit, null, 0.4, 0xf2f2f2, 0.42));
  // sector markers at one third and two thirds of the lap (exact road-deck max(hAt, meshH) height matching CityBroadcastLights LED signboards mounted atop!)
  [[Math.floor(n / 3), 0x2e7bd6, 'SECTOR 2'], [Math.floor(2 * n / 3), 0xa44cd6, 'SECTOR 3']].forEach(([idx, color, text]) => {
    const p = P[idx as number], [tx, tz] = tan(idx as number);
    const archY = Math.max(hAt(p.x, p.z) * exag, meshH(p.x, p.z));
    const arch = new THREE.Group();
    box(0.8, 6, 0.8, color as number, -(HALF + 1.8), 3, 0, arch);
    box(0.8, 6, 0.8, color as number, HALF + 1.8, 3, 0, arch);
    box(2 * (HALF + 1.8), 0.8, 0.8, color as number, 0, 6, 0, arch);
    arch.position.set(p.x, archY, p.z);
    arch.rotation.y = Math.atan2(tx, tz);
    furnitureGroup.add(arch);
    furnitureGroup.add(label(text as string, p.x, archY + 22, p.z, '#' + (color as number).toString(16).padStart(6, '0'), 0.5));
  });
  // corner names
  for (const cn of corners) {
    furnitureGroup.add(label(`T${(cn as any).n ?? ''} ${cn.name}`, cn.x, hAt(cn.x, cn.z) * exag + 34, cn.z, '#ffd9a0', 0.5));
  }

  // Other two race circuits: Pinewood Rally Stage & Great Lakes Cliff Raceway
  const rallyCircuit = meta.circuits.pinewood_rally_stage;
  if (rallyCircuit) {
    const rallyDense = densify(rallyCircuit, 6);
    rallyNear = makeCorridor(rallyDense);
    const builtRally = buildPinewoodRallyCircuit({
      circuit: rallyCircuit,
      ground: (x, z) => meshH(x, z),
      exag,
    });
    furnitureGroup.add(builtRally.group);
    if (builtRally.road) { driveSurfaces.push(builtRally.road); surfGrid = null; }
    // Register breakable wooden fence posts & corner rally signs along the off-road rally verges so you can smash right through them!
    for (let i = 4; i < rallyDense.length - 4; i += 6) {
      const a = rallyDense[i - 1], b = rallyDense[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const p = rallyDense[i];
      for (const side of [-1, 1]) {
        const px = p.x + nx * side * 5.6, pz = p.z + nz * side * 5.6;
        worldPhys.addBreakable(px, meshH(px, pz), pz, (i % 18 === 0) ? 'sign' : 'fence', 0.85);
      }
    }
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
    countryScenes = buildCountryScenes({
      ground: (x, z) => meshH(x, z),
      roadMaterial: cityRoadMat ?? undefined,
      roadMaterial4Lane: usRoadMat4Lane ?? undefined,
      plainRoadMaterial: usRoadMatPlain ?? undefined,
      network: netOff,
      shoreline: shoreHw ?? undefined,
    });
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
      console.log('ironworks district', JSON.stringify(d.counts)); (window as unknown as { districtAt: unknown }).districtAt = { ...((window as unknown as { districtAt?: object }).districtAt ?? {}), ironworks: d.at };
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
      console.log('harbor district', JSON.stringify(d.counts)); (window as unknown as { districtAt: unknown }).districtAt = { ...((window as unknown as { districtAt?: object }).districtAt ?? {}), harbor: d.at };
    }
  }
  if (meta.circuits[CIV]) {
    const cc = buildIndustrialCircuit({ path: meta.circuits[CIV].xz.map((q) => ({ x: q[0], z: q[1] })), ground: (x, z) => meshH(x, z), roadMaterial: cityRoadMat ?? undefined, ys: civicYs });
    cc.group.name = 'civic-circuit';
    furnitureGroup.add(cc.group);
    driveSurfaces.push(cc.road);
    surfGrid = null;
    civicPath = cc.path;
    civicNear = makeCorridor(cc.path);
  }

  if (simPlan && (simPlan.net || simPlan.L || simPlan.data.zones.length)) {
    // no signal pole or stop sign on a painted street or inside the city circuit's barriers (they stand 1.4 m past its 5.5 m half width)
    if (simLayer) scene.remove(simLayer.group);
    const gcx = meta.circuits.ironport_grand_circuit as { xz?: number[][]; y?: number[] } | undefined;
    const inCircuit = gcx?.xz ? makeCorridor(smoothClosedPath(gcx.xz, gcx.y, 12, 6).xz.map((p) => ({ x: p[0], z: p[1] }))) : null;
    simLayer = new SimLayer(simPlan, { ground: (x, z) => meshH(x, z), carGround: (x, z) => groundH(x, z), water: (x, z) => hAt(x, z) < 2.5, keepOut: (x, z) => paintedRoad(x, z, 0.5) || !!inCircuit?.(x, z, 7.6) });
    simLayer.group.userData.dynamicInstanced = true;
    // Add directly to scene (not furnitureGroup) so operating Rail & Halcyon Airport stay live & visible even on 60 FPS Map Overview!
    scene.add(simLayer.group);
    simLayer.setMapOverview(mapMode);
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
  if (parkingData && parkingData.length) {
    parkingLots = buildParkingLots(parkingData, (x, z) => meshH(x, z));
    furnitureGroup.add(parkingLots.group);
    for (const pc of parkingLots.cars) worldPhys.addSolidBox(pc.x, pc.z, 0.96, 2.25, pc.yaw, 'car');
  }
  if (portData) {
    const wy = waterMesh ? waterMesh.position.y : 0;
    // nothing of the port stands on a race course (the new Ironworks runs across the old port yards): a container block, crane, tank or the flare on the
    // course is left out, and the pipe rack and the plant fence go if any part of them would cross it
    const pd = portData, onC = (x: number, z: number, r: number): boolean => onCourse(x, z, r);
    const blockOn = (b: number[]): boolean => { const x1 = b[0] + b[2] * 12.6, z0b = b[1] - 1.3, z1 = b[1] + b[3] * 2.6; for (let x = b[0]; x <= x1; x += 6) for (let z = z0b; z <= z1; z += 6) if (onC(x, z, 2)) return true; return onC(x1, z1, 2); };
    const pipeOnCourse = (pts: number[][]): boolean => {
      for (let i = 0; i < pts.length; i++) {
        if (onC(pts[i][0], pts[i][1], 8)) return true;
        if (i + 1 < pts.length) {
          const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(len / 4));
          for (let s = 1; s < steps; s++) { const t = s / steps; if (onC(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 8)) return true; }
        }
      }
      return false;
    };
    const portOff: PortData = { ...pd, cranes: pd.cranes.filter((c) => !onC(c.x, c.z, 18)), containers: pd.containers.filter((b) => !blockOn(b)), tanks: pd.tanks.filter((t) => !onC(t.x, t.z, t.r + 9)),
      pipeRack: pipeOnCourse(pd.pipeRack) ? [] : pd.pipeRack, flare: pd.flare.length >= 2 && onC(pd.flare[0], pd.flare[1], 12) ? [] : pd.flare,
      fence: pd.fence.some((q, i) => { const r = pd.fence[(i + 1) % pd.fence.length]; for (let t = 0; t <= 1; t += 0.1) if (onC(q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t, 1)) return true; return false; }) ? [] : pd.fence };
    const portBuilt = buildPortDistrict(portOff, { waterY: wy });
    const portGrp = portBuilt.group;
    for (const sol of portBuilt.solids) worldPhys.addSolidBox(sol.x, sol.z, sol.hw, sol.hd, sol.rot, sol.kind);
    for (const t of portOff.tanks) worldPhys.addSolidCylinder(t.x, t.z, t.r + 0.5, 'pillar');
    mergeStaticScenery(portGrp, 500);
    furnitureGroup.add(portGrp);
  }

  // Rural Horizon open-world farmland architecture, silos, hay bales, breakable pasture fences & Festival Outpost
  const ruralBuilt = buildRuralOpenWorldDetail({
    ground: (x, z) => meshH(x, z),
    clearCheck: (x, z) => surfaceAtXZ(x, z) === 'grass' && !insideBuilding(x, z, 28) && !onCourse(x, z, 18) && !paintedRoad(x, z, 16),
    ruralRoads: (countryNet?.roads ?? []).filter((r) => !r.town).map((r) => r.xz),
  });
  for (const sol of ruralBuilt.solids) worldPhys.addSolidBox(sol.x, sol.z, sol.hw, sol.hd, sol.rot, sol.kind);
  for (const brk of ruralBuilt.breakables) worldPhys.addBreakable(brk.x, brk.y, brk.z, brk.kind, brk.radius);
  mergeStaticScenery(ruralBuilt.group, 500);
  ruralBuilt.group.name = 'rural-detail';
  furnitureGroup.add(ruralBuilt.group);

  // Real 3D Great Lakes Coastline Geometry, Riprap Rocks, Boardwalks, Piers, Lighthouses & Drivable Lakeside Streets
  mapWorldProxyGroup.clear();
  if (shoreHw) {
    const coastalBuilt = buildCoastalWorld({
      shoreline: shoreHw,
      ground: (x, z) => meshH(x, z),
      rawGround: (x, z) => hAt(x, z),
      blocked: (x, z, r) => onCourse(x, z, r) || paintedRoad(x, z, r) || insideBuilding(x, z, r),
      roadMaterial: cityRoadMat ?? undefined,
    });
    coastalBuilt.group.name = 'coastal-world';
    furnitureGroup.add(coastalBuilt.group);
    mapWorldProxyGroup.add(coastalBuilt.mapProxy);
    if (coastalBuilt.decks.length) {
      driveSurfaces.push(...coastalBuilt.decks);
      surfGrid = null;
    }
    for (const sol of coastalBuilt.solids) worldPhys.addSolidBox(sol.x, sol.z, sol.hw, sol.hd, sol.rot, sol.kind);
    for (const brk of coastalBuilt.breakables) worldPhys.addBreakable(brk.x, brk.y, brk.z, brk.kind, brk.radius);
    console.log('coastal world', JSON.stringify(coastalBuilt.counts));
  }

  // Full Dual-Bank Ironport Riverfront (West Bank + East Bank seawalls, riverwalks, marinas, yachts, lofts & working wharves)
  {
    const rfBuilt = buildRiverfrontWorld({
      ground: (x, z) => meshH(x, z),
      rawGround: (x, z) => hAt(x, z),
      blocked: (x, z, r) => onCourse(x, z, r) || paintedRoad(x, z, r) || insideBuilding(x, z, r),
    });
    rfBuilt.group.name = 'riverfront-world';
    furnitureGroup.add(rfBuilt.group);
    mapWorldProxyGroup.add(rfBuilt.mapProxy);
    for (const sol of rfBuilt.solids) worldPhys.addSolidBox(sol.x, sol.z, sol.hw, sol.hd, sol.rot, sol.kind);
    for (const brk of rfBuilt.breakables) worldPhys.addBreakable(brk.x, brk.y, brk.z, brk.kind, brk.radius);
    console.log('riverfront world', JSON.stringify(rfBuilt.counts));
  }
  // Four Zoned Rural Small Towns (Kettle Crossing, Section Corners, Maple Ridge, Cedar Creek) + Map Overview Town/Airport Labels
  {
    const rtBuilt = buildRuralTowns({
      ground: (x, z) => meshH(x, z),
      blocked: (x, z, r) => onCourse(x, z, r) || paintedRoad(x, z, r) || insideBuilding(x, z, r) || !!simLayer?.near(x, z, r + 6),
      roads: (countryNet?.roads ?? []).filter((r) => r.kind !== 'drive'),
    });
    rtBuilt.group.name = 'RuralSmallTowns';
    furnitureGroup.add(rtBuilt.group);
    mapWorldProxyGroup.add(rtBuilt.mapProxy);
    for (const sol of rtBuilt.solids) worldPhys.addSolidBox(sol.x, sol.z, sol.hw, sol.hd, sol.rot, sol.kind);
    for (const brk of rtBuilt.breakables) worldPhys.addBreakable(brk.x, brk.y, brk.z, brk.kind, brk.radius);
    for (const town of RURAL_TOWNS) {
      labelGroup.add(label(town.name, town.x, meshH(town.x, town.z) + 55, town.z, '#ffd98a', 0.85));
    }
    labelGroup.add(label('Halcyon Intl Airport (KIPT)', -4750, meshH(-4750, 4150) + 75, 4150, '#7ff7ff', 0.95));
    console.log('rural towns', JSON.stringify(rtBuilt.counts));
  }
  // Living Michigan Countryside Wildlife: grazing cows & horses beside pasture hay bales, shy woodland white-tail deer & soaring bird flocks
  {
    if (wildlifeWorld) scene.remove(wildlifeWorld.group);
    wildlifeWorld = buildWildlifeWorld({
      ground: (x, z) => meshH(x, z),
      clearCheck: (x, z) => vegOk(x, z, 4.0) && !insideBuilding(x, z, 8),
    });
    wildlifeWorld.group.visible = !mapMode;
    scene.add(wildlifeWorld.group);
    console.log('wildlife', JSON.stringify(wildlifeWorld.counts));
  }
  mapWorldProxyGroup.visible = mapMode && (document.getElementById('tBld') as HTMLInputElement).checked;
  rebuildMapRoads();

  // Suburbs, Industrial Zone & Cross-River City District
  const cityExpGroup = buildCityExpansion({
    ground: (x, z) => hAt(x, z) * exag,
    clearCheck: (x, z) => !insideBuilding(x, z, 24),
  });
  mergeStaticScenery(cityExpGroup, 500);
  furnitureGroup.add(cityExpGroup);

  // the two high-level river bridges (deck 46 m over the water, so the ships pass beneath): Halcyon Gateway in the south, Northgate at the head of the waterway
  {
    const rb = buildRiverBridges({ ground: (x, z) => meshH(x, z), roadMaterial: cityRoadMat ?? undefined });
    scene.add(rb.group);                                   // keep the two landmark bridges visible on the 60 FPS Map Overview even while furnitureGroup is hidden!
    driveSurfaces.push(...rb.decks);
    surfGrid = null;
    bridgeNear = makeCorridor(rb.path);
    if (scenicData.length) {
      // guardrails stay clear of every other road's mouth (country roads, driveways, city streets); they are solid (scenicRailHit)
      const keep = [...(countryNet?.roads ?? []).map((r) => r.xz), ...streetRuns.map((r) => r.p)];
      const sr = buildScenicRoads(scenicData, (x, z) => meshH(x, z), cityRoadMat ?? undefined, keep); furnitureGroup.add(sr.group); driveSurfaces.push(...sr.decks);
      scenicRails = railIndex(sr.rails);
      const pavedPts = scenicData.filter((r) => r.surface === 'paved').flatMap((r) => r.xz.map((p) => ({ x: p[0], z: p[1] })));
      const gravelPts = scenicData.filter((r) => r.surface !== 'paved').flatMap((r) => r.xz.map((p) => ({ x: p[0], z: p[1] })));
      if (pavedPts.length) scenicPavedNear = makeCorridor(pavedPts);
      if (gravelPts.length) scenicGravelNear = makeCorridor(gravelPts);
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
    if (festivalData) { const fg = buildFestival(festivalData, (x, z) => groundH(x, z), roadDir); mergeStaticScenery(fg, 500); furnitureGroup.add(fg); }   // stand on the road surface (decks, raised beds), not the terrain under it                         // Chora Fest stages and stunt furniture
    // Chora Fest progression: Fest Points, Stage Passes, outposts and their opening sets (src/festProgress.ts), saved with the garage
    if (festivalData && !festProg) festProg = createFestProgress({
      festival: festivalData, scenic: scenicData, save: garage.save, persist: () => garage.persist(), banner: (t, k) => showBanner(t, k),
      card: (act) => addMenuCard('CHORA FEST', 'Festival progress', 'Fest Points · Stage Passes · outposts', '#ff2d9a', act),
      brief: briefEl, hideBrief, back: () => preset('overview'),
      travel: (p, q) => { freeSpawn = { p, q }; startDrive('free'); },
      cars: () => simLayer?.world.cars ?? [],
      radio: {
        host: () => gameAudio.currentStation.persona ?? onAirNow() ?? HOSTS[0], station: () => gameAudio.currentStation.name.split(' · ')[0],
        duck: (on) => { if (driving) setMusicDuck(on ? 0.35 : 1.0); }, voice: () => (document.getElementById('tHostVoice') as HTMLInputElement | null)?.checked ?? false,
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
  scheduleCullerReindex(true);
}

let cullerReindexTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCullerReindex(immediate = false): void {
  const run = (): void => {
    cullerReindexTimer = null;
    spatialCuller.indexGroups([furnitureGroup, scapeGroup, zoneGroup, roofGroup, harborGroup]);
  };
  if (immediate) {
    if (cullerReindexTimer) { clearTimeout(cullerReindexTimer); cullerReindexTimer = null; }
    run();
    return;
  }
  if (cullerReindexTimer) clearTimeout(cullerReindexTimer);
  cullerReindexTimer = setTimeout(run, 120);
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
  scheduleCullerReindex();
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
interface DriveState { lock: number; readyHold: number; readyStartedAt: number; gridCompiled: boolean; camDist: number; camH: number; camView: number; circuitId: string; pos: THREE.Vector3; yaw: number; sp: number; lat: number; steer: number; car: THREE.Group; startPos: THREE.Vector3; startYaw: number; camPos: THREE.Vector3; hit: number; ps: CarState }
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
photoBtn.style.cssText = 'position:fixed;right:184px;top:16px;height:36px;padding:0 15px;background:rgba(26,0,38,.72);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;backdrop-filter:blur(12px);font:600 11px Outfit,sans-serif;letter-spacing:.16em;cursor:pointer;display:none;z-index:30';
photoBtn.onclick = () => { if (driving && !replay.active) photo.enter(); };
document.body.appendChild(photoBtn);

// ---------- the Sovereign's vehicle spec and the ground it drives on ----------
// The car is the active car in the garage: its parts and tune decide the physics spec (power, mass, grip, springs, brakes, downforce).
let SOV_SPEC = activeSpec();
function applyActiveCar(): void { SOV_SPEC = activeSpec(); }
const gameAudio = new GameAudio();      // engine, supercharger, tyres, brakes, backfire and suspension thumps driven by the physics state
gameAudio.setMusic(false);              // the region game plays its own tracks
let engVol = 0.75;
let sfxVol = 0.85;
try { const v = parseFloat(localStorage.getItem('apex.engVol') ?? ''); if (!Number.isNaN(v)) engVol = Math.min(1.5, Math.max(0, v)); } catch { /* storage blocked */ }
try { const v = parseFloat(localStorage.getItem('apex.sfxVol') ?? ''); if (!Number.isNaN(v)) sfxVol = Math.min(1.5, Math.max(0, v)); } catch { /* storage blocked */ }
gameAudio.setEngineLevel(engVol);
gameAudio.setSfxLevel(sfxVol);
// the racing surface is a ribbon above the terrain mesh (edge-conforming in addRibbonUV); 12 cm keeps side-slopes and distant Z-buffer precision from peeling back the underlying texture
const RIBBON_LIFT = 0.12;
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
const COURSE_R: Record<string, number> = { ironport_grand_circuit: 8.0, ironworks_industrial_circuit: 8.0, harbor_district_circuit: 8.0, civic_riverfront_circuit: 8.0, great_lakes_cliff_raceway: 8.5, pinewood_rally_stage: 6.5 };
let courseTests: { id: string; near: (x: number, z: number, r: number) => boolean; r: number }[] | null = null;
const TARMAC_CIRCUITS = ['ironport_grand_circuit', 'ironworks_industrial_circuit', 'harbor_district_circuit', 'civic_riverfront_circuit', 'great_lakes_cliff_raceway'];
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
let scenicPavedNear: ((x: number, z: number, r: number) => boolean) | null = null;   // paved scenic highways (Escarpment Circuit, Superior Range)
let scenicGravelNear: ((x: number, z: number, r: number) => boolean) | null = null;  // gravel scenic passes
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
  if (scenicPavedNear && scenicPavedNear(x, z, 6.4)) return 'asphalt';
  if (scenicGravelNear && scenicGravelNear(x, z, 6.0)) return 'gravel';
  if (rallyNear && rallyNear(x, z, 5.2)) return 'gravel';
  if (bridgeNear && bridgeNear(x, z, 10)) return 'asphalt';
  if (indNear && indNear(x, z, 7.2)) return 'asphalt';
  if (harborNear && harborNear(x, z, 7.2)) return 'asphalt';
  if (civicNear && civicNear(x, z, 7.2)) return 'asphalt';
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
driveInput.photoOn = () => photo.active;
driveInput.settingsOpen = () => settingsEl.style.display === 'block';
driveInput.toggleSettings = () => toggleSettings();
const VIEW_NAMES =['Chase', 'Far chase', 'Hood', 'Dash', 'Driver'];
let pedalT = 0, pedalB = 0;
let carY = -1e9, carPitch = 0, carRoll = 0, slopePS = 0, slopeRS = 0;
let camYawOff = 0, camPitchOff = 0, camZoom = 1, camIdle = 0, lookBack = false;
const apexBridge = createApexRegionBridge(renderer);
(window as unknown as { apexEngine: unknown }).apexEngine = apexBridge.diagnostics;

const replay = new Replay({
  camera,
  car: () => driving?.car ?? null,
  opponents: () => {
    const out: Array<{ mesh: THREE.Object3D; speed?: number; steer?: number; pitch?: number; roll?: number; brake?: number; wetNight?: number }> = [];
    const wnNow = Math.min(1, wx.cur.wet * 0.85 + (NIGHT_K[todKey] ?? 0) * 1.15);
    if (competition && aiMeshes.length) {
      let aiIdx = 0;
      for (const r of competition.racers) {
        if (r.isPlayer) continue;
        const m = aiMeshes[aiIdx++];
        if (m) out.push({ mesh: m, speed: r.state.forwardSpeed, steer: r.state.steerAngle, pitch: m.rotation.x, roll: m.rotation.z, brake: r.brakeAmt, wetNight: wnNow });
      }
    }
    if (trafficMgr && trafficMeshes.length) {
      for (let i = 0; i < trafficMgr.vehicles.length && i < trafficMeshes.length; i++) {
        out.push({ mesh: trafficMeshes[i], speed: trafficMgr.vehicles[i].speedMps, wetNight: wnNow });
      }
    }
    if (onlineSession.mode !== 'offline') {
      for (const rem of onlineSession.remotes.values()) {
        if (rem.mesh) out.push({ mesh: rem.mesh, speed: rem.vel?.length() ?? 0, wetNight: wnNow });
      }
    }
    return out;
  },
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
  buildingTopAt: (x, z, margin) => {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    let maxTop = -Infinity;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = colGrid.get(`${gx + ox},${gz + oz}`);
        if (!list) continue;
        for (const it of list) {
          const cx = it.bx ?? it.x, cz = it.bz ?? it.z, c = Math.cos(it.rotY), sn = Math.sin(it.rotY);
          const dx = x - cx, dz = z - cz;
          if (Math.abs(dx * c - dz * sn) < it.w / 2 + margin && Math.abs(dx * sn + dz * c) < it.d / 2 + margin) {
            const top = hAt(cx, cz) * exag + Math.max(4, it.h);
            if (top > maxTop) maxTop = top;
          }
        }
      }
    }
    return maxTop;
  },
  inTunnel: (x, z) => !!(cliffTunnelNear && cliffTunnelNear(x, z, 14)),
  lapInfo: () => {
    const cid = driving?.circuitId;
    if (!cid || cid === 'free') return 'FREE ROAM';
    return (RUN_NAMES[cid] ?? meta?.circuits[cid]?.name ?? cid).toUpperCase();
  },
});
apexBridge.setReplayDiagnostics(() => replay.getDiagnostics());
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
  holder.name = 'player-car';
  holder.userData.carId = id;
  holder.userData.scanReady = false;
  const rig = makeSovereign();
  holder.add(rig.group);
  holder.userData.update = rig.update;
  // swap in the GT-R standard scan car once it has loaded; the stand-in covers the wait
  holder.userData.scanPromise = loadScanCarById(id).then(async (r) => {
    if (holder.userData.cancelled) return;
    {
      const activeDefId = garage.active ? garage.def(garage.active.uid)?.id : undefined;
      const pc = !qOverride && activeDefId === id ? garage.active?.paint : undefined;
      if (USE_WEBGPU && tslRegionCtx) {
        const initHex = pc ? new THREE.Color(pc).getHex() : (id === 'vernon_police' ? 0x121824 : undefined);
        upgradeCarRigToWebGPU(r, tslRegionCtx.gi, initHex);
      }
      if (pc) r.paint?.set({ color: new THREE.Color(pc).getHex() });
    }
    // compile the scan car's shaders before it is shown: the first render of its heavy paint / glass materials used to stall the frame the car appeared in. The compile starts with the car visible
    // (it only sees visible objects) and the car is hidden again before anything is drawn; the stand-in covers the wait.
    r.group.visible = true; holder.add(r.group);
    let compiled: Promise<unknown> | null = null;
    if (!USE_WEBGPU) {
      try { compiled = renderer.compileAsync(scene, camera); } catch { compiled = null; }
    }
    r.group.visible = false;
    try { await compiled; } catch { /* compile errors surface on the first render, as before */ }
    if (holder.userData.cancelled) { holder.remove(r.group); return; }
    r.group.visible = true; holder.userData.update = r.update; holder.userData.panels = r.panels;
    // the stand-in is finished: stop drawing it and free its geometry
    // the scan car casts the sun's shadow (skip sub-28 cm interior/hardware parts to save >100k shadow tris), and keeps the stand-in's soft contact shadow under it
    r.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.Material).transparent) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.castShadow = (m.geometry.boundingSphere?.radius ?? 1) >= ((USE_WEBGPU && perfTier !== 'high') ? 1.2 : 0.28);
    });
    let blob: THREE.Object3D | null = null;
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (!blob && m.isMesh && (m.geometry as THREE.BufferGeometry).type === 'PlaneGeometry' && ((m.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture | null)?.isCanvasTexture) blob = m; });
    if (blob) { const b = blob as THREE.Mesh; b.parent?.remove(b); holder.add(b); }
    rig.group.visible = false; holder.remove(rig.group);
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); } });
    holder.userData.scanReady = true;
  }).catch((e) => {
    console.warn('scan car failed', e);
    holder.userData.scanReady = true;
  });
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
  const P = cliff ? cliffPathPts : s.circuitId === IND ? industrialPath : s.circuitId === HARB ? harborPath : s.circuitId === CIV ? civicPath : cityPath, n = P.length;
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
  for (const [id, P] of [[IND, industrialPath], [HARB, harborPath], [CIV, civicPath], ['ironport_grand_circuit', cityPath]] as [string, { x: number; z: number }[]][]) {
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
/** push the car back from a wall it is `worst` metres into ((ux, uz) points into the wall), play wall crash/scrape SFX, and take away the speed going into it */
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
    const speedMag = Math.hypot(vx, vz);
    if (into > 2.4) {
      gameAudio.playCollision('wall', Math.min(1, into / 18));
    } else if (speedMag > 3.0) {
      gameAudio.playCollision('scrape', Math.min(0.85, speedMag / 26));
    }
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
let runTracker: RunTracker | null = null, stagePath: PathProgress | null = null, stageFinished = false, lastLapCount = 0, raceStartLaps = 0, lastCompLap = 1, raceClockStart = 0, delivery: DeliveryGame | null = null;
let runGen = 0;
interface VictoryCineState { active: boolean; elapsed: number; circuitId: string; dismissUi: (() => void) | null }
let victoryCine: VictoryCineState | null = null;
const CLOSED_CIRCUITS = new Set([
  'ironport_grand_circuit',
  'ironworks_industrial_circuit',
  'harbor_district_circuit',
  'civic_riverfront_circuit',
  'great_lakes_cliff_raceway',
  'superior_range_circuit',
  'escarpment_circuit',
]);
const RUN_NAMES: Record<string, string> = {
  ironport_grand_circuit: 'Ironport Grand Circuit',
  great_lakes_cliff_raceway: 'Great Lakes Cliff Raceway',
  pinewood_rally_stage: 'Pinewood Rally Stage',
  ironworks_industrial_circuit: 'Ironworks Industrial Circuit',
  harbor_district_circuit: 'Harbor District Circuit',
  civic_riverfront_circuit: 'Civic Riverfront Circuit',
  superior_range_circuit: 'Superior Range Circuit',
  escarpment_circuit: 'Escarpment Circuit',
};
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
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as Record<string, unknown>).__fhOnline = onlineSession; // dev servers only: inspect the online session from the console / lab scripts
const socialHud = new ApexSocialHud({
  session: onlineSession,
  apiBase: new URLSearchParams(location.search).get('api') ?? '',
  onOpenHub: () => launchOnlineHub(onlineSession.mode === 'persistent_world' ? 'world' : 'race'),
});
(window as unknown as { apexSocialHud: ApexSocialHud }).apexSocialHud = socialHud;
const remoteGroup = new THREE.Group();
remoteGroup.name = 'remote-cars';
scene.add(remoteGroup);
const spatialCuller = new SpatialCuller();
const aiGroup = new THREE.Group();
aiGroup.name = 'ai-cars';
const trafficGroup = new THREE.Group();
trafficGroup.name = 'traffic-cars';
scene.add(aiGroup, trafficGroup);
let aiMeshes: THREE.Group[] = [];
let trafficMeshes: THREE.Group[] = [];

function makePlayerNameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 384; c.height = 72;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(14,4,26,0.78)';
  g.strokeStyle = 'rgba(0,218,243,0.85)';
  g.lineWidth = 3;
  g.beginPath(); g.roundRect(8, 10, 368, 52, 26); g.fill(); g.stroke();
  g.fillStyle = '#00DAF3'; g.beginPath(); g.arc(34, 36, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.font = '800 26px Outfit, Inter, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(name.slice(0, 18), 54, 37);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(3.4, 0.64, 1);
  sp.position.set(0, 2.35, 0);
  sp.renderOrder = 10;
  return sp;
}
function makeTrafficOrAiCarMesh(paintHex: number | string, variant: RivalCarVariant | number = 0): THREE.Group {
  return makeRivalCar(paintHex, variant);
}

function clearVictoryCine(): void {
  if (!victoryCine) return;
  victoryCine.dismissUi?.();
  victoryCine = null;
}
function teardownRun(): void {
  runGen++;
  clearVictoryCine();
  if (delivery) { const d = delivery; delivery = null; d.quit(); d.dispose(); }
  if (pursuitMode) { scene.remove(pursuitMode.group); pursuitMode = null; }
  pursuitHudEl.style.display = 'none';
  runTracker = null; stagePath = null; stageFinished = false; lastCompLap = 1; raceClockStart = 0;
  competition = null; trafficMgr = null; challengeMgr = null;
  aiGroup.clear(); trafficGroup.clear();
  aiMeshes = []; trafficMeshes = [];
}
function setupRun(id: string, courier?: 'rookie' | 'pro' | 'legend', pursuitRole?: PursuitRoleChoice): void {
  teardownRun();
  const gen = runGen;
  lastLapCount = lap?.laps ?? 0;
  raceStartLaps = lastLapCount;
  lastCompLap = 1;
  raceClockStart = 0;
  if (pursuitRole && driving) {
    pursuitMode = new CopsAndRobbersMode(pursuitRole, driving.pos, driving.yaw, groundH);
    scene.add(pursuitMode.group);
    pursuitHudEl.style.display = 'block';
    msg.textContent = `${pursuitMode.statusText} · [G] SIREN · [F] ON FOOT`;
    syncPoliceControlsUi();
    return;
  }
  if (courier) { delivery = new DeliveryGame(courier, deliverySpots(), scene, groundH, () => preset('overview')); return; }
  if (id === 'free') {
    const hwPts = meta.coastal_highway.xz.map((p) => new THREE.Vector3(p[0], hAt(p[0], p[1]) * exag, p[1]));
    const subPts = streetRuns.slice(0, 12).flatMap((r) => r.p.map((p) => new THREE.Vector3(p[0], hAt(p[0], p[1]) * exag, p[1])));
    trafficMgr = new TrafficManager({ i196Samples: hwPts, suburbSamples: subPts, terrainHeight: groundH }, 18);
    let tvIdx = 0;
    for (const tv of trafficMgr.vehicles) {
      const idx = tvIdx++;
      const paintHex = new THREE.Color(tv.paintHex).getHex();
      const m = makeTrafficOrAiCarMesh(paintHex, idx % 4 === 0 ? 'exotic-wedge' : 'sport-coupe');
      m.position.copy(tv.pos);
      m.rotation.y = tv.yaw;
      trafficGroup.add(m);
      trafficMeshes.push(m);
      if (TRAFFIC_SCAN_IDS.length > 0) {
        const trafficId = TRAFFIC_SCAN_IDS[idx % TRAFFIC_SCAN_IDS.length];
        // Stagger traffic scan-car upgrades so spawning free roam never stalls the GPU on frame 1
        setTimeout(() => {
          if (gen !== runGen || !m.parent) return;
          void loadScanOpponentCar(trafficId, paintHex, 'traffic').then((realTraffic) => {
            if (gen !== runGen || !m.parent) return;
            while (m.children.length) m.remove(m.children[0]);
            m.add(realTraffic);
            m.userData.update = realTraffic.userData.update;
            carProbe?.apply(m, 0.78);
          }).catch(() => { /* keep fallback */ });
        }, 450 + idx * 160);
      }
    }
    challengeMgr = new OpenWorldChallengeManager(festivalData);
    return;
  }
  const city = id === 'ironport_grand_circuit';
  const isClosed = CLOSED_CIRCUITS.has(id);
  const pts = city ? cityPath : meta.circuits[id] ? densify(meta.circuits[id], 6) : [];
  if (pts.length < 8) return;
  runTracker = new RunTracker(id, refParSec(pts, isClosed, city ? 5.4 : 4.2));
  const vecPts = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  competition = new CompetitionEngine();
  const leanAiGrid = USE_WEBGPU && perfTier !== 'high';
  competition.createGrid(vecPts, [CARS.kestrel, CARS.aurelia], groundH, { totalLaps: isClosed ? 3 : 1, includePlayer: true, totalCars: leanAiGrid ? 6 : 12 });
  const aiVariants: RivalCarVariant[] = ['gt-track', 'exotic-wedge', 'gt-track', 'sport-coupe'];
  let aiVarIdx = 0;
  for (const r of competition.racers) {
    if (r.isPlayer) continue;
    const idx = aiVarIdx++;
    const oppCarId = RACE_OPPONENT_SCAN_IDS[idx % RACE_OPPONENT_SCAN_IDS.length];
    const m = makeTrafficOrAiCarMesh(r.paintHex, aiVariants[idx % aiVariants.length]);
    m.position.copy(r.state.pos);
    m.rotation.y = r.state.yaw;
    aiGroup.add(m);
    aiMeshes.push(m);
    // Streamlined GT-R scan opponents ('traffic' on iGPUs = ~12 draws/car instead of ~85 draws/car, cutting 1,017 AI draws -> ~72 draws!)
    const oppQuality = leanAiGrid ? 'traffic' : 'hero';
    setTimeout(() => {
      if (gen !== runGen || !m.parent) return;
      void loadScanOpponentCar(oppCarId, r.paintHex, oppQuality).then((realOpp) => {
        if (gen !== runGen || !m.parent) return;
        while (m.children.length) m.remove(m.children[0]);
        m.add(realOpp);
        m.userData.update = realOpp.userData.update;
        carProbe?.apply(m, 0.85);
      }).catch(() => { /* keep sculpted fallback */ });
    }, 40 + idx * 140);
  }
  // Only open point-to-point stages (like Pinewood Rally) use single-pass PathProgress; all closed circuits use multi-lap competition tracking!
  stagePath = isClosed ? null : new PathProgress(pts);
}
function finishRun(timeSec: number, lapsDone = 1): void {
  if (!runTracker || victoryCine?.active) return;
  const circuitId = driving?.circuitId ?? runTracker.eventId;
  const topMph = runTracker.top * 2.23694;
  const playerRacer = competition?.racers.find((r) => r.isPlayer);
  const position = playerRacer?.position ?? 1;
  const totalRacers = competition?.racers.length ?? 1;
  const totalRaceSec = raceClockStart > 0 ? Math.max(timeSec, driveClock - raceClockStart) : timeSec;
  const bestLapSec = playerRacer?.bestLapSec ?? (circuitId === 'ironport_grand_circuit' ? lap?.best : null) ?? timeSec;
  const standings: RaceFinishStanding[] = competition
    ? [...competition.racers]
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ position: r.position, driverName: r.isPlayer ? 'You' : r.driverName, carName: r.carName, gapSec: r.gapToLeaderSec, isPlayer: r.isPlayer }))
    : [{ position: 1, driverName: 'You', carName: garage.active ? `${garage.def(garage.active.uid)?.make ?? ''} ${garage.def(garage.active.uid)?.name ?? ''}`.trim() : 'Kestrel Sovereign GT-R', gapSec: 0, isPlayer: true }];

  const r = runTracker.take(bestLapSec, Math.max(1, lapsDone), { ...assist });
  const o = garage.recordRun(r);
  const courseName = RUN_NAMES[r.eventId] ?? meta.circuits[r.eventId]?.name ?? r.eventId;

  // Enter live 3D Victory Cutscene (cinematic hero orbit around the finishing car) + Post-Race Results & 12s Auto-Replay
  driveHud.style.display = 'none';
  countEl.style.display = 'none';
  photoBtn.style.display = 'none';
  setMusicDuck(0.28);
  victoryCine = { active: true, elapsed: 0, circuitId, dismissUi: null };
  const canReplay = replay.n >= 12;
  const ui = showRaceResultsOverlay({
    courseName,
    position,
    totalRacers,
    raceTimeText: fmtT(totalRaceSec),
    bestLapText: fmtT(bestLapSec),
    parTimeText: fmtT(r.parSec),
    topMph,
    standings,
    outcome: o,
    canReplay,
    autoReplaySec: 12,
    onReplay: () => {
      if (victoryCine) { victoryCine.dismissUi = null; victoryCine.active = false; }
      if (replay.start()) {
        driveHud.style.display = 'none';
        countEl.style.display = 'none';
        gameAudio.setPaused(true);
      }
    },
    onRestart: () => {
      clearVictoryCine();
      startDrive(circuitId);
    },
    onContinue: () => {
      clearVictoryCine();
      preset('overview');
    },
  });
  victoryCine.dismissUi = ui.dismiss;
}
function garageStep(dt: number, s: DriveState, bumped: boolean): void {
  if (s.lock > 0 || s.readyHold > 0 || victoryCine?.active) return;
  const ps = s.ps;
  if (delivery) { delivery.update(dt, { x: s.pos.x, z: s.pos.z, speedMps: Math.abs(ps.forwardSpeed), hit: bumped }, s.yaw); return; }
  if (!runTracker) return;
  if (raceClockStart <= 0) raceClockStart = driveClock;
  runTracker.sample(dt, { x: s.pos.x, z: s.pos.z, speedMps: ps.speedMps, drifting: ps.isDrifting, hit: bumped, wet: wx.cur.wet });

  const isClosed = CLOSED_CIRCUITS.has(s.circuitId);
  if (isClosed) {
    const playerRacer = competition?.racers.find((r) => r.isPlayer);
    const totalLaps = competition?.totalLaps ?? 3;
    if (s.circuitId === 'ironport_grand_circuit' && lap && lap.laps > lastLapCount) {
      lastLapCount = lap.laps;
      const raceLapsDone = lap.laps - raceStartLaps;
      if (lap.last) {
        if (raceLapsDone < totalLaps) {
          // Non-blocking top toast on intermediate laps — never obstructs the player mid-race!
          showBanner(`LAP ${raceLapsDone}/${totalLaps} · ${fmtT(lap.last)}${lap.best === lap.last ? ' · BEST' : ''} · P${playerRacer?.position ?? 1}/${competition?.racers.length ?? 12}`, lap.best === lap.last ? 'gold' : 'ok', 2400);
        } else if (!stageFinished) {
          stageFinished = true;
          finishRun(lap.best ?? lap.last, totalLaps);
        }
      }
    } else if (s.circuitId !== 'ironport_grand_circuit' && playerRacer) {
      if (playerRacer.lap > lastCompLap) {
        const doneLap = playerRacer.lap - 1;
        lastCompLap = playerRacer.lap;
        if (!playerRacer.finished && doneLap < totalLaps) {
          const lt = playerRacer.lastLapSec ? ` · ${fmtT(playerRacer.lastLapSec)}` : '';
          const bestTag = playerRacer.lastLapSec && playerRacer.bestLapSec === playerRacer.lastLapSec ? ' · BEST' : '';
          showBanner(`LAP ${doneLap}/${totalLaps}${lt}${bestTag} · P${playerRacer.position}/${competition!.racers.length}`, bestTag ? 'gold' : 'ok', 2400);
        }
      }
      if (playerRacer.finished && !stageFinished) {
        stageFinished = true;
        const finishT = playerRacer.bestLapSec ?? playerRacer.lastLapSec ?? Math.max(10, driveClock - raceClockStart);
        finishRun(finishT, totalLaps);
      }
    }
  } else if (stagePath) {
    stagePath.update(s.pos.x, s.pos.z, performance.now() / 1000);
    if (stagePath.done && !stageFinished) {
      stageFinished = true;
      finishRun(performance.now() / 1000 - stagePath.t0, 1);
    }
  }
}
interface DriveIntroDrone {
  active: boolean;
  t: number;
  dur: number;
  startedAt: number;
  vegWarmed: boolean;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  fromLook: THREE.Vector3;
  fromFov: number;
  fromNear: number;
}
let driveIntro: DriveIntroDrone | null = null;

function createCopInterceptorSpec(): CarSpec {
  const def = CAR_BY_ID['vernon_police'];
  const base = def ? stockSpec(def) : structuredClone(CARS.kestrel);
  base.id = 'vernon_police';
  base.manufacturer = 'Vernon';
  base.model = 'Police Interceptor';
  base.topSpeedMps = Math.max(base.topSpeedMps, 79);
  base.corneringGrip = Math.max(base.corneringGrip, 1.09);
  base.engine.soundBank = 'muscle_v8';
  base.engine.name = '5.7L Pursuit V8';
  return base;
}

function attachPoliceLightbar(car: THREE.Group, roofY = 1.355, barZ = -0.34): void {
  const existing = car.getObjectByName('police-lightbar');
  if (existing) car.remove(existing);
  const bar = new THREE.Group();
  bar.name = 'police-lightbar';
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x12151c, metalness: 0.78, roughness: 0.28 });
  // Bolted aluminum stanchion feet extending cleanly down into the roof crown so the lightbar NEVER floats!
  for (const sx of [-0.42, 0.42]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.20), frameMat);
    foot.position.set(sx, -0.02, 0);
    bar.add(foot);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.036, 0.23), frameMat);
  base.position.set(0, 0.024, 0);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.018, 0.20), frameMat);
  cap.position.set(0, 0.094, 0);
  const centerDiv = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.064, 0.22), frameMat);
  centerDiv.position.set(0, 0.062, 0);
  const redL = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.062, 0.21),
    new THREE.MeshStandardMaterial({ color: 0xff1e2d, emissive: 0xff1e2d, emissiveIntensity: 0.16, roughness: 0.18, metalness: 0.1 }),
  );
  redL.position.set(-0.275, 0.062, 0);
  const blueR = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.062, 0.21),
    new THREE.MeshStandardMaterial({ color: 0x1e88ff, emissive: 0x1e88ff, emissiveIntensity: 0.16, roughness: 0.18, metalness: 0.1 }),
  );
  blueR.position.set(0.275, 0.062, 0);
  bar.add(base, cap, centerDiv);
  mergeByMaterial(bar);
  bar.add(redL, blueR);
  bar.position.set(0, roofY, barZ);
  car.add(bar);
  car.userData.sirenLights = [redL, blueR];
}

function startDrive(id: string, courier?: 'rookie' | 'pro' | 'legend', pursuitRole?: PursuitRoleChoice): void {
  // Capture exact live map / circuit-briefing camera pose BEFORE switching out of map mode so we can drone-fly seamlessly into the car!
  const entryFromPos = camera.position.clone();
  const entryFromLook = controls.target.clone();
  const entryFromFov = camera.fov;
  const entryFromNear = camera.near;

  const resolvedPursuitRole: PursuitRoleChoice | undefined = pursuitRole === 'auto' ? (Math.random() < 0.5 ? 'cop' : 'robber') : pursuitRole;
  endCine(true);                                                       // a drive started without a click (gamepad, script) would otherwise be ended by the first key press
  clearVictoryCine();
  cineFade.style.opacity = '0';
  if (resolvedPursuitRole === 'cop') SOV_SPEC = createCopInterceptorSpec();
  else applyActiveCar();
  setMapMode(false);
  // Explicitly hide menu/brief overlays even when startDrive is triggered from idle beauty mode (where mapMode was already false)
  menuEl.style.display = 'none';
  briefEl.style.display = 'none';
  vignette.style.display = 'none';
  backBtn.style.display = 'none';
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
  const wantCarId = resolvedPursuitRole === 'cop' ? 'vernon_police' : activeCarId();
  let car: THREE.Group;
  if (driving?.car && driving.car.userData.carId === wantCarId) {
    car = driving.car;
    prewarmCar = null;
  } else if (prewarmCar && prewarmCar.userData.carId === wantCarId) {
    car = prewarmCar;
    prewarmCar = null;
  } else {
    if (driving?.car) scene.remove(driving.car);
    car = makeCar(wantCarId);
    prewarmCar = null;
  }
  if (wantCarId === 'vernon_police') {
    const mountBar = (): void => {
      if (car.userData.cancelled) return;
      attachPoliceLightbar(car, 1.355, -0.34);
      carProbe?.apply(car, 0.85);
    };
    if (car.userData.scanReady) mountBar();
    else void (car.userData.scanPromise as Promise<void> | undefined)?.then(mountBar);
  }
  car.position.set(0, 0, 0);
  if (!car.parent) scene.add(car);
  // never spawn under the drawn road: the cliff raceway's road was raised above its survey heights, and the start countdown holds the car still, so a car started under the
  // asphalt stayed stuck in it, nose down
  const y = Math.max((free ? hAt(p[0], p[1]) : city && cn > 8 ? cp[cn - 8].y : c!.y ? c!.y[0] : hAt(p[0], p[1])) * exag, groundH(p[0], p[1]) + 0.05);
  const scanReadyNow = !!car.userData.scanReady;
  const needCityAtGrid = id === 'ironport_grand_circuit' || id === CIV || id === HARB || id === IND;

  // Seamless curved aerial drone fly-in from the live Map Overview / briefing camera straight into the rear chase camera behind the player's car!
  // Wall-clock timed in stepDrive() + high-altitude veg/shadow pause so the swoop stays silky-smooth and NEVER stalls!
  const carTarget = new THREE.Vector3(p[0], y, p[1]);
  const flyDist = entryFromPos.distanceTo(carTarget);
  if (flyDist > 18 && Number.isFinite(flyDist)) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const lx = cy, lz = -sy;
    const dur = Math.min(2.35, Math.max(1.70, 1.45 + Math.log10(Math.max(10, flyDist)) * 0.28));
    const p1 = entryFromPos.clone().lerp(carTarget, 0.42);
    p1.y = Math.max(p1.y, y + Math.min(260, flyDist * 0.22));
    const p2 = new THREE.Vector3(p[0] - sy * 34 + lx * 14, Math.max(groundH(p[0] - sy * 34, p[1] - cy * 34) + 12, y + 16), p[1] - cy * 34 + lz * 14);
    driveIntro = { active: true, t: 0, dur, startedAt: 0, vegWarmed: false, p0: entryFromPos, p1, p2, fromLook: entryFromLook, fromFov: entryFromFov, fromNear: Math.min(180, Math.max(1, entryFromNear)) };
  } else {
    driveIntro = null;
  }

  (window as unknown as { __didDriveCull?: boolean }).__didDriveCull = false;
  driving = {
    lock: driveIntro ? Math.max(3.4, driveIntro.dur + 1.8) : 3.4,
    readyHold: (!scanReadyNow || (needCityAtGrid && !cityCoreReady)) ? (needCityAtGrid ? 8.0 : 3.0) : 0,
    readyStartedAt: performance.now(),
    gridCompiled: false,
    camDist: 5.8, camH: 1.6, camView: 0, circuitId: id,
    pos: new THREE.Vector3(p[0], y, p[1]), yaw, sp: 0, lat: 0, steer: 0, car,
    startPos: new THREE.Vector3(p[0], y, p[1]), startYaw: yaw,
    camPos: new THREE.Vector3(p[0] - Math.sin(yaw) * 5.8, y + 1.6, p[1] - Math.cos(yaw) * 5.8),
    hit: 0, ps: createCarState(p[0], y, p[1], yaw),
  };
  carY = -1e9; carPitch = carRoll = slopePS = slopeRS = 0; setMusicDuck(1.0); gameAudio.ensureStarted(); gameAudio.setEngineLevel(engVol); gameAudio.setSfxLevel(sfxVol); gameAudio.setPaused(false);
  wx.ensureAudio(); wx.setAudioLevel(sfxVol); wx.setPaused(false);
  if (USE_WEBGPU && perfTier !== 'high' && vegetation) {
    // Reclaim ~420k unused grass triangles inside concrete Downtown Ironport while keeping full lush meadows in Free Roam & rural circuits!
    vegetation.setQuality(id === 'ironport_grand_circuit' ? 0.16 : (perfTier === 'low' ? 0.38 : 0.50), false);
  }
  {
    const key = id === 'ironport_grand_circuit' ? 'city' : id === 'great_lakes_cliff_raceway' ? 'cliff' : id === 'pinewood_rally_stage' ? 'rally' : id === IND ? 'ind' : id === HARB ? 'harb' : id === CIV ? 'civ' : id === 'superior_range_circuit' ? 'superior' : id === 'escarpment_circuit' ? 'escarpment' : 'free';
    wxPlan = WEATHER_PLAN[key]; wxPlanT = 0; wxPlanI = 0;
    const startWx = wxOverride === 'auto' ? wxPlan[0].w : wxOverride;
    wx.setWeather(startWx, true, true);
    // Match road wetness & puddle level to the race's starting weather (never carry over soaked puddles from card previews or a prior storm race)
    const w0 = WEATHERS[startWx]?.p;
    roadWater.wetness = w0 ? (w0.rain > 0.3 ? 0.55 : w0.wet * 0.25) : 0;
    roadWater.pooling = w0 && w0.rain > 0.5 ? 0.22 : 0;
    poolLevel = roadWater.pooling;
    poolU.value = poolLevel;
    wetU.value = roadWater.wetness;
  }
  camera.near = 1.0; camera.far = 18000; camera.updateProjectionMatrix();      // the map view uses an altitude-adaptive near plane; 1 m / 18 km preserves tight 24-bit road depth precision in chase view
  lapReset();
  buildRacingLine(id);
  setupRun(id, courier, resolvedPursuitRole);
  gameAudio.setSirenEnabled(false);
  syncPoliceControlsUi();
  // On WebGPU mid/low iGPUs during closed-circuit races (e.g. Ironport Grand Circuit), hide off-track side-street parked cars,
  // parking lots & skyscraper rooftop HVAC boxes behind the barriers — cuts ~1.6M unseen triangles on the City Circuit!
  const hideClosedExtras = USE_WEBGPU && perfTier !== 'high' && CLOSED_CIRCUITS.has(id);
  if (parked) parked.group.visible = !hideClosedExtras;
  if (parkingLots) parkingLots.group.visible = !hideClosedExtras;
  roofGroup.visible = !hideClosedExtras;
  // Pre-populate grass right away ONLY if no curved drone fly-in is active; otherwise warm smoothly as the drone descends so START responds instantly!
  if (!driveIntro) {
    vegetation?.prewarmAt(new THREE.Vector3(p[0], y, p[1]), new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)));
  }
  replay.clear(); driveClock = 0; camYawOff = 0; camPitchOff = 0; camZoom = 1;
  controls.enabled = false;
  circuitGroup.visible = false;      // the review ribbons are drawn wider than the road
  const route = city && cityPath.length ? cityPath.map((p) => ({ x: p.x, z: p.z })) : (c?.xz ?? []).map((p) => ({ x: p[0], z: p[1] }));
  const mapLayers: MapRoadLayer[] = [
    { kind: 'highway', points: meta.coastal_highway.xz.map((pt) => ({ x: pt[0], z: pt[1] })) },
    ...(countryNet?.roads ?? [])
      .filter((r) => r.kind !== 'drive' && r.xz.length >= 2)
      .map((r): MapRoadLayer => ({
        kind: r.kind === 'dirt' ? 'dirt' : (r.half ?? 4) >= 6.8 ? 'highway' : 'paved',
        points: r.xz.map((pt) => ({ x: pt[0], z: pt[1] })),
      })),
    ...streetRuns.map((r): MapRoadLayer => ({
      kind: r.c === 'freeway' || r.c === 'ramp' ? 'highway' : 'paved',
      points: r.p.map((pt) => ({ x: pt[0], z: pt[1] })),
    })),
    ...scenicData.map((r): MapRoadLayer => ({
      kind: r.surface === 'paved' ? 'paved' : 'dirt',
      points: r.xz.map((pt) => ({ x: pt[0], z: pt[1] })),
    })),
    ...(simPlan?.data.rails ?? []).map((rl): MapRoadLayer => ({
      kind: 'rail',
      points: rl.pts.map((pt) => ({ x: pt[0], z: pt[1] })),
    })),
    { kind: 'runway', points: [{ x: -5390, z: 4160 }, { x: -4110, z: 4160 }] },
  ];
  racingHud.configure(free ? 'Free roam' : c?.name ?? 'Ironport Grand Circuit', route, mapLayers);
  labelGroup.visible = false;
  furnitureGroup.traverse((object) => { if (object instanceof THREE.Sprite) object.visible = false; });
  hud.style.display = 'none';
  driveHud.style.display = 'block';
  photoBtn.style.display = 'block';
}
function stopDrive(): void {
  if (!driving) return;
  clearVictoryCine();
  if (lineMesh) { scene.remove(lineMesh); lineMesh.geometry.dispose(); lineMesh = null; }
  racingLine = null;
  photo.exit(); photoBtn.style.display = 'none';
  teardownRun();
  gameAudio.setSirenEnabled(false);
  gameAudio.updateNearbyVehicles(null, null, 0.016);
  policeControlsEl.style.display = 'none';
  scene.remove(driving.car);
  driving = null;
  driveIntro = null;
  if (!mapMode) {
    if (parked) parked.group.visible = true;
    if (parkingLots) parkingLots.group.visible = true;
    roofGroup.visible = true;
  }
  worldPhys.clearDebris();
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
  const inVictory = !!victoryCine?.active;
  if (inVictory && victoryCine) victoryCine.elapsed += dt;
  const needCity = s.circuitId === 'ironport_grand_circuit' || s.circuitId === CIV || s.circuitId === HARB || s.circuitId === IND;
  const readyElapsed = (performance.now() - s.readyStartedAt) * 0.001;
  const preparing = !inVictory && s.readyHold > 0 && readyElapsed < s.readyHold && (!s.car.userData.scanReady || (needCity && !cityCoreReady));
  if (preparing) {
    // Keep boxy fallback hidden while real scan car & Downtown Lap-1 buildings finish loading/compiling (capped by wall-clock readyHold!)
    s.car.visible = !!s.car.userData.scanReady;
    countEl.style.display = 'block';
    countEl.textContent = (needCity && !cityCoreReady) ? 'LOADING CITY' : 'GRID';
  } else if (!s.gridCompiled) {
    s.car.visible = true;
    s.gridCompiled = true;
    s.readyHold = 0;
    csmSweep(true);
    // Never call blocking full-scene renderer.compile() on WebGPU (compiles all 150 km² districts synchronously for 20-30s!)
    if (!USE_WEBGPU) {
      try { renderer.compile(scene, camera); } catch { /* ok */ }
    }
  } else if (!s.car.visible) {
    s.car.visible = true;
  }
  // Online race on the Plajah Realtime server: the grid waits in the lobby, then the lights follow the server's GO, not the local timer.
  const rtHold = onlineSession.raceHold();
  if (rtHold && 'lobby' in rtHold) s.lock = Math.max(s.lock, 1);
  else if (rtHold) s.lock = rtHold.remainingSec;
  const locked = preparing || (!inVictory && s.lock > 0);
  if (trackKit) { if (locked) goClock = 0; else goClock += dt; trackKit.setLights(locked ? 'red' : goClock < 3.5 ? 'green' : 'off'); }
  if (!preparing && !inVictory && s.lock > 0) {
    // Allow countdown to advance cleanly even during a shader-warm frame so '1' never stalls for minutes!
    s.lock -= Math.min(dt, 0.25);
    const droneDiving = !!(driveIntro?.active && driveIntro.t < driveIntro.dur * 0.65);
    if (droneDiving && !(rtHold && 'lobby' in rtHold)) {
      countEl.style.display = 'none';
    } else {
      const n = Math.ceil(s.lock - 0.5);
      countEl.style.display = 'block';
      countEl.textContent = n > 0 ? String(n) : s.lock > 0 ? 'GO' : '';
      if (s.lock <= 0) countEl.style.display = 'none';
      if (rtHold && 'lobby' in rtHold) countEl.textContent = 'LOBBY';
    }
  }
  const pad = driveInput.axes;                                  // controller + touch, analog
  const rawGas = inVictory ? 0 : Math.max((keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0, pad.throttle);
  const kUp = !locked && !inVictory && (keys.has('KeyW') || keys.has('ArrowUp')), kDown = !locked && !inVictory && (keys.has('KeyS') || keys.has('ArrowDown'));
  const up = kUp || (!locked && !inVictory && pad.throttle > 0.05), down = kDown || (!locked && !inVictory && pad.brake > 0.05);
  const left = !inVictory && (keys.has('KeyA') || keys.has('ArrowLeft')), right = !inVictory && (keys.has('KeyD') || keys.has('ArrowRight'));
  const hand = !inVictory && (keys.has('Space') || pad.handbrake);
  const kSteer = (left ? 1 : 0) - (right ? 1 : 0);
  if (!inVictory && pad.recenterCam) { camYawOff = 0; camPitchOff = 0; }
  if (!inVictory && Math.abs(pad.lookX) + Math.abs(pad.lookY) > 0) {            // right stick: free-look
    camYawOff -= pad.lookX * dt * 2.4; camPitchOff = Math.max(-0.12, Math.min(1.1, camPitchOff + pad.lookY * dt * 1.6)); camIdle = 0;
  }
  // ---- the new vehicle model (physics.ts): gears and RPM, supercharger, weight transfer, 4-corner suspension, tyre grip, drift, brake heat ----
  const ps = s.ps;
  if (locked) { ps.vel.set(0, 0, 0); ps.angularVel = 0; }
  // pedals ease in like a foot would: throttle takes about a third of a second to go to the floor, the brake about half, and both lift faster
  // driving assists, as in Forza: brake help ahead of corners the car is too fast for, and a nudge toward the racing line (both off in the Settings, along with the line itself)
  let assistBrake = 0, assistSteer = 0;
  if (racingLine && !locked && !inVictory) {
    const li = racingLine.nearest(s.pos.x, s.pos.z), off = racingLine.offsets(li, s.pos.x, s.pos.z, s.yaw), v = Math.max(0, s.ps.forwardSpeed);
    const gripNow = Math.max(0.3, (1 - 0.24 * roadWater.wetness) * (1 - 0.82 * hydro));
    if (Math.abs(off.lat) < 9) {
      if (assist.brake && v > 9) { const need = racingLine.demand(li, v, gripNow), cap = 9.0 * gripNow; assistBrake = Math.min(1, Math.max(0, (need - cap * 0.78) / (cap * 0.5))) * 0.5; }
      if (assist.steer && v > 6) assistSteer = Math.max(-0.6, Math.min(0.6, off.head * 1.3 - off.lat * 0.06)) * 0.65;
    }
  }
  assistBrakeShown = assistBrake;
  if (racingLine && chevrons && lineMesh?.visible) chevrons.update(racingLine.nearest(s.pos.x, s.pos.z), Math.max(0, s.ps.forwardSpeed), Math.max(0.3, (1 - 0.24 * roadWater.wetness) * (1 - 0.82 * hydro)));
  const thrWant = (locked || inVictory) ? 0 : Math.max(kUp ? 1 : 0, pad.throttle) * (1 - assistBrake);
  const brkWant = locked ? 1 : inVictory ? (ps.speedMps > 4.5 ? 0.32 : 0.85) : Math.max(kDown ? 1 : 0, pad.brake, assistBrake);
  pedalT += (thrWant - pedalT) * Math.min(1, dt * (thrWant > pedalT ? 3.4 : 8));
  pedalB += (brkWant - pedalB) * Math.min(1, dt * (brkWant > pedalB ? (assistBrake > 0 && brkWant === assistBrake ? 2.6 : 14) : 10));
  const input: CarInput = { throttle: (locked || inVictory) ? 0 : pedalT, brake: locked ? 1 : pedalB, steer: inVictory ? 0 : (() => { const p = Math.abs(pad.steer) > Math.abs(kSteer) ? pad.steer : kSteer; return Math.max(-1, Math.min(1, p + assistSteer * (1 - Math.abs(p)))); })(), handbrake: hand };
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
      if (Math.abs(g - oy) > 1.8) {
        gameAudio.playCollision('wall', Math.min(1, Math.max(0.32, ps.speedMps / 16)));
        ps.pos.x = ox; ps.pos.z = oz; ps.vel.x *= -0.25; ps.vel.z *= -0.25; s.hit = 0.4;
      }
    }
    groundYHint = null;
  }
  // Universal steep-bank & road-lip gravity pushback (runs on ALL surfaces including banked curve edges & shoulders!):
  // prevents a car on a >19 deg steep cut-bank wall or embankment lip from sticking or driving sideways on its door!
  if (!ps.isAirborne && !locked) {
    const gx = (groundH(ps.pos.x + 1.2, ps.pos.z) - groundH(ps.pos.x - 1.2, ps.pos.z)) / 2.4;
    const gz = (groundH(ps.pos.x, ps.pos.z + 1.2) - groundH(ps.pos.x, ps.pos.z - 1.2)) / 2.4;
    const gMag = Math.hypot(gx, gz);
    const onAsph = surfaceAtXZ(ps.pos.x, ps.pos.z) === 'asphalt';
    const bankThresh = onAsph ? 0.36 : 0.32;
    if (gMag > bankThresh) {
      const ux = gx / gMag, uz = gz / gMag;
      const upDot = ps.vel.x * ux + ps.vel.z * uz;
      if (upDot > 0) {
        // Hard-reject climbing sideways up un-drivable steep bank walls
        const damp = Math.min(1.12, dt * 22 * Math.min(3.5, (gMag - bankThresh + 0.12) * 5));
        ps.vel.x -= ux * upDot * damp;
        ps.vel.z -= uz * upDot * damp;
      }
      // Strong real downhill gravity slide pulls the car cleanly back down onto the flat road/level ground
      const sinTheta = gMag / Math.sqrt(1 + gMag * gMag);
      const slideAccel = Math.min(32, 9.81 * sinTheta * 2.4 + (gMag - bankThresh) * 28) * dt;
      ps.vel.x -= ux * slideAccel;
      ps.vel.z -= uz * slideAccel;
      // Gently align yaw downhill when pinned sideways on a steep wall so the car noses back down off the bank
      if (gMag > 0.44) {
        const downYaw = Math.atan2(-ux, -uz);
        const yawDiff = Math.atan2(Math.sin(downYaw - ps.yaw), Math.cos(downYaw - ps.yaw));
        ps.yaw += yawDiff * Math.min(0.25, dt * 1.4 * Math.min(2, gMag - 0.38));
      }
      const syE = Math.sin(ps.yaw), cyE = Math.cos(ps.yaw);
      ps.forwardSpeed = ps.vel.x * syE + ps.vel.z * cyE;
      ps.lateralSpeed = ps.vel.x * cyE - ps.vel.z * syE;
      ps.speedMps = Math.hypot(ps.vel.x, ps.vel.z);
    }
  }
  if (!ps.isAirborne) {
    ps.vel.multiplyScalar(Math.exp(-waterDrag * dt));
    ps.angularVel += Math.max(-0.2, Math.min(0.2, splitDrag * ps.forwardSpeed * 0.1)) * dt;
  }
  // reverse: hold brake at a standstill and the car backs out right away (Forza style), with a sensible top speed in reverse
  if (down && !up && !locked && !inVictory) {
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
  const wetNightNow = Math.min(1, wx.cur.wet * 0.85 + (NIGHT_K[todKey] ?? 0) * 1.15);
  if (competition) {
    competition.step(dt, driveClock, groundH, surfaceAtXZ, [], ps, locked);
    let aiIdx = 0;
    for (const r of competition.racers) {
      if (r.isPlayer) continue;
      const m = aiMeshes[aiIdx++];
      if (m) {
        const ax = r.state.pos.x, az = r.state.pos.z, ayaw = r.state.yaw;
        const afx = Math.sin(ayaw), afz = Math.cos(ayaw), alx = Math.cos(ayaw), alz = -Math.sin(ayaw);
        const hF = groundH(ax + afx * 1.45, az + afz * 1.45);
        const hR = groundH(ax - afx * 1.45, az - afz * 1.45);
        const hL = groundH(ax + alx * 0.82, az + alz * 0.82);
        const hRi = groundH(ax - alx * 0.82, az - alz * 0.82);
        const hC = groundH(ax, az);
        const cl = (g: number): number => Math.max(hC - 0.32, Math.min(hC + 0.32, g));
        const cF = cl(hF), cR = cl(hR), cL = cl(hL), cRi = cl(hRi);
        const aSlopeP = Math.max(-0.34, Math.min(0.34, (cF - cR) / 2.9));
        const aSlopeR = Math.max(-0.24, Math.min(0.24, (cL - cRi) / 1.64));
        m.position.set(ax, Math.max((cF + cR + cL + cRi) * 0.25, hC - 0.02) + 0.02, az);
        m.rotation.order = 'YXZ';
        m.rotation.set(
          Math.max(-0.36, Math.min(0.36, -Math.atan(aSlopeP) + r.state.pitch * 0.65)),
          ayaw,
          Math.max(-0.25, Math.min(0.25, Math.atan(aSlopeR) + r.state.roll * 0.45)),
        );
        (m.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void) | undefined)?.(
          r.state.forwardSpeed,
          r.state.steerAngle,
          dt,
          wetNightNow > 0.25,
          r.brakeAmt,
          wetNightNow,
        );
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
      const tm = trafficMeshes[i];
      tm.position.copy(tv.pos);
      tm.rotation.y = tv.yaw;
      (tm.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void) | undefined)?.(
        tv.speedMps,
        0,
        dt,
        wetNightNow > 0.25,
        tv.speedMps < 1.5 ? 0.8 : 0,
        wetNightNow,
      );
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
    // Live Cops & Robbers Pursuit HUD update (Role badge, APB/Hideout objective, Vehicle Integrity bar)
    const isCop = pursuitMode.role === 'cop';
    const hp = Math.max(0, Math.round(pursuitMode.playerCarHealth));
    const badgeBg = isCop ? 'linear-gradient(90deg,#1a56db,#00daf3)' : 'linear-gradient(90deg,#d40055,#ff8c00)';
    const subLine = isCop
      ? `APB: ${pursuitMode.suspectVehicle.colorName} ${pursuitMode.suspectVehicle.make} ${pursuitMode.suspectVehicle.model}`
      : `HIDEOUT: ${pursuitMode.hideout.name}`;
    pursuitHudEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:5px"><span style="padding:2px 9px;border-radius:999px;background:${badgeBg};font:800 10px Outfit,sans-serif;letter-spacing:.16em">${isCop ? 'COP PURSUIT' : 'ROBBER ESCAPE'}</span><span style="font:700 11px 'JetBrains Mono',monospace;color:#ffd166">${subLine}</span><span style="font:700 11px 'JetBrains Mono',monospace;color:#9ef2ff">HP ${hp}%</span></div><div style="font:600 12px Inter,sans-serif;color:#f4ecff">${pursuitMode.statusText} <span style="opacity:.68;font-size:11px">· [G] Siren · [F] On Foot</span></div><div style="height:4px;margin-top:6px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden"><div style="height:100%;width:${hp}%;background:${hp > 40 ? '#00f5d4' : '#ff4d6d'}"></div></div>`;
    if (pursuitMode.playerOnFoot.active) {
      s.pos.copy(pursuitMode.playerOnFoot.pos);
      s.yaw = pursuitMode.playerOnFoot.yaw;
      s.sp = pursuitMode.playerOnFoot.speed;
    }
  }
  // Sync rooftop police lightbar strobe cleanly with player Siren ON/OFF state (both Cop Pursuit & Free Roam Police Interceptor)
  {
    const pLights = s.car.userData.sirenLights as THREE.Mesh[] | undefined;
    if (pLights && pLights.length >= 2) {
      if (gameAudio.isSirenOn) {
        const flashMs = gameAudio.currentSirenMode === 'phaser' ? 80 : gameAudio.currentSirenMode === 'yelp' ? 115 : 165;
        const flash = Math.floor(performance.now() / flashMs) % 2 === 0;
        (pLights[0].material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 3.2 : 0.16;
        (pLights[1].material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 0.16 : 3.2;
      } else {
        (pLights[0].material as THREE.MeshStandardMaterial).emissiveIntensity = 0.14;
        (pLights[1].material as THREE.MeshStandardMaterial).emissiveIntensity = 0.14;
      }
    }
    // Nearby AI racer / pursuit / traffic Doppler engine + distant AI police siren audio
    let closestVeh: NearbyVehicleAudioSample | null = null;
    let closestDist = 78;
    const considerVeh = (vx: number, vz: number, velX: number, velZ: number, rpm: number, pitchBaseHz: number, isEv: boolean): void => {
      const dx = vx - ps.pos.x, dz = vz - ps.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1 || dist >= closestDist) return;
      closestDist = dist;
      const approach = -((velX - ps.vel.x) * dx + (velZ - ps.vel.z) * dz) / dist;
      closestVeh = { distanceM: dist, approachMps: approach, rpm, pitchBaseHz, isEv };
    };
    if (competition) {
      for (const r of competition.racers) {
        if (r.isPlayer) continue;
        considerVeh(r.state.pos.x, r.state.pos.z, r.state.vel.x, r.state.vel.z, r.state.rpm, r.spec.engine.pitchBaseHz, r.spec.engine.aspiration === 'Electric');
      }
    }
    if (trafficMgr) {
      for (const tv of trafficMgr.vehicles) {
        considerVeh(tv.pos.x, tv.pos.z, tv.vel.x, tv.vel.z, 1500 + tv.speedMps * 85, 42, false);
      }
    }
    let closestAiCop: { distanceM: number; approachMps: number } | null = null;
    if (pursuitMode) {
      if (pursuitMode.robberUnit && !pursuitMode.robberUnit.disabled) {
        const ru = pursuitMode.robberUnit;
        considerVeh(ru.carState.pos.x, ru.carState.pos.z, ru.carState.vel.x, ru.carState.vel.z, ru.carState.rpm, ru.spec.engine.pitchBaseHz, ru.spec.engine.aspiration === 'Electric');
      }
      let bestCopDist = 135;
      for (const cu of pursuitMode.copUnits) {
        if (cu.disabled) continue;
        const dx = cu.carState.pos.x - ps.pos.x, dz = cu.carState.pos.z - ps.pos.z;
        const dist = Math.hypot(dx, dz);
        considerVeh(cu.carState.pos.x, cu.carState.pos.z, cu.carState.vel.x, cu.carState.vel.z, cu.carState.rpm, 44, false);
        if (dist > 1 && dist < bestCopDist) {
          bestCopDist = dist;
          const approach = -((cu.carState.vel.x - ps.vel.x) * dx + (cu.carState.vel.z - ps.vel.z) * dz) / dist;
          closestAiCop = { distanceM: dist, approachMps: approach };
        }
      }
    }
    gameAudio.updateNearbyVehicles(closestVeh, closestAiCop, dt);
  }
  if (onlineSession.mode !== 'offline') {
    const activeCar = garage.active;
    const activeCarId = activeCar?.carId || 'kestrel';
    const activePaintHex = (() => {
      const p = activeCar?.paint;
      return typeof p === 'string' && /^#[0-9a-f]{6}$/i.test(p) ? parseInt(p.slice(1), 16) : 0xc24d12;
    })();
    onlineSession.step(dt, ps, {
      carId: activeCarId,
      paintHex: activePaintHex,
      onFoot: pursuitMode?.playerOnFoot.active,
      pursuitRole: pursuitMode?.role,
      // On the realtime server: laps done this race + position round the lap (0..1); the server referees both.
      lap: onlineSession.rt ? (lap?.started ? Math.max(0, lap.laps - raceStartLaps) : 0) : (lap?.laps ?? 0) + 1,
      splineT: onlineSession.rt && lap?.started && cityPath.length ? lap.idx / cityPath.length : undefined,
    });
    const remoteCount = onlineSession.remotes.size;
    onlineHubBtn.textContent = remoteCount > 0 ? `ONLINE · ${remoteCount + 1} LIVE` : 'ONLINE · LIVE';
    const wnRemote = Math.min(1, wx.cur.wet * 0.85 + curTod.nightK * 1.15);
    for (const r of onlineSession.remotes.values()) {
      if (!r.mesh) {
        r.mesh = makeTrafficOrAiCarMesh(r.paintHex);
        r.mesh.add(makePlayerNameTag(r.driverName));
        remoteGroup.add(r.mesh);
      }
      if (!r.heroRequested) {
        r.heroRequested = true;
        const scanId = hasScanCar(r.carId) ? r.carId : 'kestrel';
        void loadScanOpponentCar(scanId, r.paintHex, 'hero').then((heroMesh) => {
          if (!heroMesh || !onlineSession.remotes.has(r.peerId)) return;
          if (r.mesh) remoteGroup.remove(r.mesh);
          heroMesh.add(makePlayerNameTag(r.driverName));
          heroMesh.position.copy(r.pos);
          heroMesh.rotation.y = r.yaw;
          r.mesh = heroMesh;
          remoteGroup.add(heroMesh);
          carProbe?.apply(heroMesh, 0.85);
        });
      }
      const gyR = groundH(r.pos.x, r.pos.z);
      r.mesh.position.set(r.pos.x, Math.max(gyR + 0.02, r.pos.y), r.pos.z);
      r.mesh.rotation.order = 'YXZ';
      r.mesh.rotation.y = r.yaw;
      const fxR = Math.sin(r.yaw), fzR = Math.cos(r.yaw);
      const gfR = groundH(r.pos.x + fxR * 1.45, r.pos.z + fzR * 1.45);
      const gbR = groundH(r.pos.x - fxR * 1.45, r.pos.z - fzR * 1.45);
      r.mesh.rotation.x = -Math.atan(Math.max(-0.38, Math.min(0.38, (gfR - gbR) / 2.9)));
      (r.mesh.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void) | undefined)?.(
        r.speedMps, r.steerAngle, dt, wnRemote > 0.25, r.isBraking ? 0.9 : 0, wnRemote
      );
    }
  } else if (onlineHubBtn.textContent !== 'ONLINE') {
    onlineHubBtn.textContent = 'ONLINE';
  }
  s.pos.set(ps.pos.x, ps.pos.y, ps.pos.z);
  s.yaw = ps.yaw;
  s.sp = ps.forwardSpeed; s.lat = ps.lateralSpeed; s.steer = ps.steerInputSmoothed;
  let bumped = false;
  if (collide(s)) {
    gameAudio.playCollision('wall', Math.min(1, Math.max(0.32, Math.hypot(s.sp, s.lat) / 18)));
    s.sp *= 0.86; s.lat *= 0.7; s.hit = 0.4; bumped = true;
  }
  if (worldPhys.stepAndCollide(dt, s.pos, s.yaw, ps.vel, groundH, {
    onSolidHit: (sev, kind, yawKick) => {
      gameAudio.playCollision(kind === 'car' ? 'car' : 'wall', sev);
      const syH = Math.sin(s.yaw), cyH = Math.cos(s.yaw);
      s.sp = ps.vel.x * syH + ps.vel.z * cyH;
      s.lat = ps.vel.x * cyH - ps.vel.z * syH;
      ps.angularVel += yawKick;
      s.hit = Math.max(s.hit, 0.35 + sev * 0.25);
    },
    onSmashHit: (kind, bx, by, bz) => {
      gameAudio.playCollision(kind === 'pole' ? 'car' : 'wall', kind === 'pole' ? 0.52 : 0.32);
      driveInput.rumble(kind === 'pole' ? 0.65 : 0.35, 0.45, 110);
      dust.wheel(0.06, bx, by + 0.3, bz, ps.vel.x * 0.4, ps.vel.z * 0.4, Math.max(12, ps.speedMps), 1.0, 1.0, 1.3);
      const syH = Math.sin(s.yaw), cyH = Math.cos(s.yaw);
      s.sp = ps.vel.x * syH + ps.vel.z * cyH;
      s.lat = ps.vel.x * cyH - ps.vel.z * syH;
      s.hit = Math.max(s.hit, kind === 'pole' ? 0.22 : 0.12);
    },
  })) {
    bumped = true;
  }
  if ((s.circuitId === 'ironport_grand_circuit' || s.circuitId === IND || s.circuitId === HARB || s.circuitId === CIV || s.circuitId === 'great_lakes_cliff_raceway') && barrierCollide(s)) { s.hit = 0.4; bumped = true; }
  else if (s.circuitId !== 'ironport_grand_circuit' && s.circuitId !== IND && s.circuitId !== HARB && s.circuitId !== CIV && s.circuitId !== 'great_lakes_cliff_raceway' && freeRoamBarrierHit(s)) { s.hit = 0.4; bumped = true; }
  else if (scenicRailHit(s)) { s.hit = 0.4; bumped = true; }
  if (bumped) driveInput.rumble(0.9, 0.7, 220);
  else if (ps.isDrifting) driveInput.rumble(0.0, 0.25, 60);
  garageStep(dt, s, bumped);
  s.hit = Math.max(0, s.hit - dt);
  const lim = meta.width * meta.mpp / 2 - 80, limz = meta.height * meta.mpp / 2 - 80;
  s.pos.x = Math.max(GRID.ox - lim, Math.min(GRID.ox + lim, s.pos.x));
  s.pos.z = Math.max(GRID.oz - limz, Math.min(GRID.oz + limz, s.pos.z));
  // in the water (not on a bridge deck over it): back to the start (mark replay discontinuity so car snaps instead of warping through buildings)
  if (hAt(s.pos.x, s.pos.z) < -1.5 && ps.pos.y < 1) { s.pos.copy(s.startPos); s.yaw = s.startYaw; s.sp = 0; s.lat = 0; bumped = true; replay.markDiscontinuity(); }
  if (bumped) {                                  // hand the corrected position and speeds back to the physics state
    ps.pos.x = s.pos.x; ps.pos.z = s.pos.z; ps.yaw = s.yaw;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    ps.vel.x = sy * s.sp + cy * s.lat; ps.vel.z = cy * s.sp - sy * s.lat;
  }
  s.pos.y = ps.pos.y;
  const nfx = Math.sin(s.yaw), nfz = Math.cos(s.yaw), nlx = Math.cos(s.yaw), nlz = -Math.sin(s.yaw);
  // 5-point ground contact (4 wheels + center belly): conforms tightly to off-road hills, crests, ruts & gravel with true suspension heave!
  const HW = 1.48, HT = 0.81;                                  // half wheelbase and half track of the Sovereign model
  const wg = (ox: number, oz: number): number => groundH(s.pos.x + nlx * ox + nfx * oz, s.pos.z + nlz * ox + nfz * oz);
  const gFL = wg(HT, HW), gFR = wg(-HT, HW), gRL = wg(HT, -HW), gRR = wg(-HT, -HW);
  const gCenter = groundH(s.pos.x, s.pos.z);
  // Clamp sudden road-deck/curb-lip vertical discontinuities per wheel before computing visual body tilt
  // so straddling the edge of a banked curve or embankment NEVER flips the car sideways onto its door!
  const clampEdge = (g: number): number => Math.max(gCenter - 0.34, Math.min(gCenter + 0.34, g));
  const cFL = clampEdge(gFL), cFR = clampEdge(gFR), cRL = clampEdge(gRL), cRR = clampEdge(gRR);
  const mean = (cFL + cFR + cRL + cRR) / 4;
  const onPavedBank = surfaceAtXZ(s.pos.x, s.pos.z) === 'asphalt';
  const maxBankRoll = onPavedBank ? 0.25 : 0.29;
  const slopeP = Math.max(-0.36, Math.min(0.36, ((cFL + cFR) - (cRL + cRR)) / 2 / (2 * HW)));
  const slopeR = Math.max(-maxBankRoll, Math.min(maxBankRoll, ((cFL + cRL) - (cFR + cRR)) / 2 / (2 * HT)));
  const lift = Math.max(0, cFL - (mean + slopeP * HW + slopeR * HT), cFR - (mean + slopeP * HW - slopeR * HT), cRL - (mean - slopeP * HW + slopeR * HT), cRR - (mean - slopeP * HW - slopeR * HT));
  const avgComp = (ps.wheelCompression[0] + ps.wheelCompression[1] + ps.wheelCompression[2] + ps.wheelCompression[3]) * 0.25;
  const floorY = Math.max(mean + Math.min(lift, 0.42), gCenter - 0.03) + 0.02;
  const yWant = ps.isAirborne ? Math.max(floorY, ps.pos.y) : Math.max(floorY - 0.03, floorY - avgComp * 0.45);
  // Asymmetric vertical tracking: snap cleanly UP over rising off-road hills/crests (zero ground sinking!), smooth spring droop over dips
  if (carY < -1e8 || Math.abs(carY - yWant) > 1.5) carY = yWant;
  else if (yWant > carY) carY = Math.max(floorY - 0.02, carY + (yWant - carY) * Math.min(1, dt * 48));
  else carY += (yWant - carY) * Math.min(1, dt * 18);
  s.car.position.set(s.pos.x, carY, s.pos.z);
  s.car.rotation.order = 'YXZ';
  s.car.rotation.y = s.yaw;
  // Responsive road-slope + live 4-corner suspension pitch & roll (clamped strictly to physical bank angles!)
  slopePS += (slopeP - slopePS) * Math.min(1, dt * 18); slopeRS += (slopeR - slopeRS) * Math.min(1, dt * 18);
  carPitch += (ps.pitch * 1.0 - carPitch) * Math.min(1, dt * 11); carRoll += (ps.roll * 0.85 - carRoll) * Math.min(1, dt * 11);
  s.car.rotation.x = Math.max(-0.38, Math.min(0.38, -Math.atan(slopePS) + carPitch));
  s.car.rotation.z = Math.max(-maxBankRoll, Math.min(maxBankRoll, Math.atan(slopeRS) + carRoll));
  const brakeAmt = Math.max(input.brake, hand ? 0.85 : 0);
  const duskAmt = Math.max(0, Math.min(1, (0.24 - sunDir.y) * 2.6));
  const wetNightAmt = Math.min(1, Math.max(curTod.nightK * 1.15, duskAmt * 0.85, wx.cur.wet * 0.85, wx.cur.cloudDark * 0.45));
  const headlightsOn = wetNightAmt > 0.16 || apexLighting.controller.fogMod.interiorMix > 0.25;
  (s.car.userData.update as ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number, wheelComp?: readonly [number, number, number, number]) => void) | undefined)?.(
    s.sp, ps.steerAngle, dt, headlightsOn, brakeAmt, wetNightAmt, ps.wheelCompression
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
  // Record 1:1 frame-accurate replay telemetry once launch begins (never record dead pre-race grid hold frames)
  if (!inVictory && !locked) {
    let rFlags = 0;
    if (ps.isDrifting) rFlags |= REPLAY_FLAG_DRIFT;
    if (ps.isAirborne) rFlags |= REPLAY_FLAG_AIRBORNE;
    if (cliffTunnelNear && cliffTunnelNear(s.pos.x, s.pos.z, 14)) rFlags |= REPLAY_FLAG_TUNNEL;
    if (wetNightAmt > 0.25) rFlags |= REPLAY_FLAG_HEADLIGHTS;
    const hitImpact = bumped ? Math.min(1, Math.hypot(s.sp, s.lat) / 26) : 0;
    replay.record({
      t: (driveClock += dt),
      x: s.car.position.x,
      y: s.car.position.y,
      z: s.car.position.z,
      yaw: s.car.rotation.y,
      pitch: s.car.rotation.x,
      roll: s.car.rotation.z,
      speed: s.sp,
      steerAngle: ps.steerAngle,
      brake: brakeAmt,
      wetNight: wetNightAmt,
      latSpeed: s.lat,
      rpm: ps.rpm,
      gear: ps.forwardSpeed < -0.5 ? -1 : ps.gear,
      hit: hitImpact,
      flags: rFlags,
    });
  }
  camIdle += dt;
  const dragging = camIdle < 1.4;
  if (lookBack) camYawOff += (Math.PI - camYawOff) * Math.min(1, dt * 8);
  else if (!dragging) { camYawOff += (Math.round(camYawOff / (Math.PI * 2)) * Math.PI * 2 - camYawOff) * Math.min(1, dt * 2.5); camPitchOff += (0 - camPitchOff) * Math.min(1, dt * 2.5); }
  // Victory cinematic orbit camera takes over gracefully on race finish!
  if (inVictory && victoryCine) {
    const tV = victoryCine.elapsed;
    const ang = s.yaw + 0.65 + tV * 0.38;
    const r = 6.2 + Math.sin(tV * 0.45) * 0.65;
    const camX = s.pos.x + Math.sin(ang) * r;
    const camZ = s.pos.z + Math.cos(ang) * r;
    const camYWant = Math.max(groundH(camX, camZ) + 0.85, s.car.position.y + 1.55 + Math.sin(tV * 0.52) * 0.35);
    s.camPos.lerp(new THREE.Vector3(camX, camYWant, camZ), 1 - Math.exp(-dt * 4.5));
    camera.position.copy(s.camPos);
    // Offset look slightly to the right of the car so the hero car frames cleanly left-of-center beside the post-race results panel!
    const rightX = Math.cos(ang), rightZ = -Math.sin(ang);
    camera.lookAt(s.pos.x + rightX * 1.1, s.car.position.y + 0.78, s.pos.z + rightZ * 1.1);
    const fovWant = 42;
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 3.5); camera.updateProjectionMatrix(); }
    return;
  }
  // Seamless curved drone fly-in from map/briefing view straight into the rear chase camera behind the player car!
  if (driveIntro?.active) {
    // Stamp wall-clock start on the FIRST actually rendered drive frame (after startDrive setup finishes) so a launch frame NEVER teleports past the swoop!
    const nowMs = performance.now();
    if (driveIntro.startedAt <= 0) {
      driveIntro.startedAt = nowMs;
    } else {
      driveIntro.t += Math.min(dt, 0.055);
      // Safety ceiling so an unexpected background tab pause can never trap the camera forever
      const elapsedS = (nowMs - driveIntro.startedAt) / 1000;
      if (elapsedS > driveIntro.dur + 3.2) driveIntro.t = driveIntro.dur;
    }
    const u = Math.min(1, driveIntro.t / driveIntro.dur);
    if (!driveIntro.vegWarmed && u >= 0.72) {
      driveIntro.vegWarmed = true;
      vegetation?.prewarmAt(s.pos, new THREE.Vector3(nfx, 0, nfz));
    }
    // Quintic smootherstep for silky drone acceleration and soft lock-in deceleration
    const e = u * u * u * (u * (u * 6 - 15) + 10);
    const om = 1 - e;
    const p3 = new THREE.Vector3(
      s.pos.x - nfx * s.camDist * camZoom,
      Math.max(groundH(s.pos.x - nfx * s.camDist, s.pos.z - nfz * s.camDist) + 0.9, s.car.position.y + s.camH * camZoom),
      s.pos.z - nfz * s.camDist * camZoom,
    );
    const curPos = new THREE.Vector3()
      .addScaledVector(driveIntro.p0, om * om * om)
      .addScaledVector(driveIntro.p1, 3 * om * om * e)
      .addScaledVector(driveIntro.p2, 3 * om * e * e)
      .addScaledVector(p3, e * e * e);
    const minGround = groundH(curPos.x, curPos.z) + 1.1;
    if (curPos.y < minGround) curPos.y = minGround;
    const targetEnd = new THREE.Vector3(s.pos.x + nfx * 9, s.car.position.y + 0.95, s.pos.z + nfz * 9);
    const lookCur = driveIntro.fromLook.clone().lerp(targetEnd, Math.min(1, e * 1.15));
    s.camPos.copy(curPos);
    camera.position.copy(curPos);
    camera.lookAt(lookCur);
    camera.fov = driveIntro.fromFov + (54 - driveIntro.fromFov) * e;
    camera.near = Math.max(1.0, driveIntro.fromNear + (1.0 - driveIntro.fromNear) * Math.min(1, u * 1.4));
    camera.far = 18000 + (40000 - 18000) * (1 - e);
    camera.updateProjectionMatrix();
    if (u >= 1) {
      driveIntro.active = false;
      driveIntro = null;
      camera.near = 1.0;
      camera.far = 18000;
      camera.fov = 54;
      camera.updateProjectionMatrix();
    }
    return;
  }
  // Forza-style views: 0 near chase, 1 far chase, 2 hood, 3 dash, 4 first person (the driver's eyes). Chase views sit at a fixed length behind the car;
  // the others are fixed to the car body and look along it, with mouse free-look on top.
  const view = s.camView;
  // depth precision: keeping near >= 0.14 m in hood/dash/cockpit (3x finer Z-buffer than 0.05 m) and 1.0 m in chase prevents pavement/kerb peeling past 300 m.
  const nearWant = view >= 2 ? 0.14 : 1.0;
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
  // Keep downtown lap tracker synced on ironport_grand_circuit, and build rich live POS + LAP/PROGRESS + TIMER HUD on EVERY race!
  if (s.circuitId === 'ironport_grand_circuit') lapStep(s.pos.x, s.pos.z, performance.now() / 1000);
  let lapTxt = '';
  let opponents: MapOpponent[] | undefined;
  if (competition) {
    const me = competition.racers.find((r) => r.isPlayer);
    opponents = competition.racers
      .filter((r) => !r.isPlayer)
      .map((r) => ({ x: r.state.pos.x, z: r.state.pos.z, isLeader: r.position === 1 }));
    if (me) {
      const posCol = me.position === 1 ? '#ffd166' : me.position === 2 ? '#dbe4ee' : me.position === 3 ? '#e8a26e' : '#68dbe4';
      const total = competition.racers.length;
      const elapsedSec = raceClockStart > 0 ? Math.max(0, driveClock - raceClockStart) : 0;
      const timerStr = locked ? '--:--.--' : fmtT(elapsedSec);
      const gapStr = me.position === 1 ? '<span style="color:#ffd166">LEADER</span>' : `+${me.gapToLeaderSec.toFixed(1)}s`;
      if (CLOSED_CIRCUITS.has(s.circuitId)) {
        const totalLaps = competition.totalLaps;
        const curLap = s.circuitId === 'ironport_grand_circuit' && lap
          ? Math.min(totalLaps, Math.max(1, lap.laps - raceStartLaps + 1))
          : Math.min(totalLaps, Math.max(1, me.lap));
        const pct = locked ? 0 : Math.max(0, Math.min(99, Math.round(me.splineT * 100)));
        const bestSec = me.bestLapSec ?? (s.circuitId === 'ironport_grand_circuit' ? lap?.best : null);
        lapTxt = `<span style="color:${posCol};font-weight:900">POS ${me.position}/${total}</span> &nbsp;·&nbsp; LAP ${curLap}/${totalLaps} &nbsp;·&nbsp; ${pct}% &nbsp;·&nbsp; ${timerStr} &nbsp;·&nbsp; ${gapStr}` + (bestSec ? ` &nbsp;·&nbsp; BEST ${fmtT(bestSec)}` : '');
      } else {
        const stagePct = stagePath ? Math.round((stagePath.idx / Math.max(1, (meta.circuits[s.circuitId]?.xz.length ?? 100) - 1)) * 100) : Math.round(me.splineT * 100);
        lapTxt = `<span style="color:${posCol};font-weight:900">POS ${me.position}/${total}</span> &nbsp;·&nbsp; STAGE ${Math.max(0, Math.min(100, stagePct))}% &nbsp;·&nbsp; ${timerStr} &nbsp;·&nbsp; ${gapStr}`;
      }
    }
  }
  if (onlineSession.mode !== 'offline' && onlineSession.remotes.size > 0) {
    opponents = opponents ?? [];
    for (const r of onlineSession.remotes.values()) {
      opponents.push({ x: r.pos.x, z: r.pos.z, isLeader: true });
    }
  }
  racingHud.update(dt, { speed: ps.forwardSpeed, rpm: ps.rpm, redline: SOV_SPEC.engine.redlineRpm, gear: ps.forwardSpeed < -0.5 ? -1 : ps.gear, gears: SOV_SPEC.gearRatios.length, shift: ps.shiftTimer > 0, x: ps.pos.x, z: ps.pos.z, yaw: ps.yaw, throttle: locked ? rawGas : input.throttle, brake: input.brake, rain: wx.cur.rain, wetness: roadWater.wetness, hydro, drift: ps.isDrifting, collision: s.hit > 0, assist: assistBrakeShown > 0.25, lapHtml: lapTxt, mode: VIEW_NAMES[s.camView], touch: driveInput.touchMode, opponents });
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyK' && driving && !replay.active) { e.preventDefault(); photo.toggle(); return; }
  if (replay.active) {
    if (replay.key(e.code)) {
      e.preventDefault();
      if (!replay.active && driving) {
        if (victoryCine?.active) { clearVictoryCine(); preset('overview'); }
        else { driveHud.style.display = 'block'; syncPoliceControlsUi(); s2cam(); gameAudio.setPaused(false); }
      }
    }
    return;
  }
  if (!driving) return;
  if (e.code === 'KeyP') { if (replay.start()) { clearVictoryCine(); driveHud.style.display = 'none'; policeControlsEl.style.display = 'none'; countEl.style.display = 'none'; gameAudio.setPaused(true); } return; }
  if (e.code === 'KeyG' && isPlayerPoliceCar()) { e.preventDefault(); gameAudio.toggleSiren(); syncPoliceControlsUi(); return; }
  if (e.code === 'KeyT' && isPlayerPoliceCar()) { e.preventDefault(); gameAudio.cycleSirenMode(); syncPoliceControlsUi(); return; }
  if (e.code === 'KeyH' && isPlayerPoliceCar()) { e.preventDefault(); gameAudio.triggerAirHorn(); return; }
  if (e.code === 'KeyB') { lookBack = true; return; }
  if (e.code === 'KeyL') { assist.line = !assist.line; saveAssist(); const cb = document.getElementById('tLine') as HTMLInputElement | null; if (cb) cb.checked = assist.line; return; }
  if (e.code === 'Escape') { preset('overview'); return; }
  if (e.code === 'KeyR') { driving.pos.copy(driving.startPos); driving.yaw = driving.startYaw; driving.sp = 0; driving.lat = 0; driving.ps = createCarState(driving.startPos.x, driving.startPos.y, driving.startPos.z, driving.startYaw); lapReset(); replay.markDiscontinuity(); return; }
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

// ---------- full-page boot splash controller ----------
let bootDismissed = false;
function setBootProgress(pct: number, stage: string): void {
  const fill = document.getElementById('bootBarFill');
  const pctEl = document.getElementById('bootPct');
  const stageEl = document.getElementById('bootStage');
  const clamped = Math.max(4, Math.min(100, Math.round(pct)));
  if (fill) fill.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${clamped}%`;
  if (stageEl) stageEl.textContent = stage;
}
function dismissBootSplash(): void {
  if (bootDismissed) return;
  bootDismissed = true;
  setBootProgress(100, 'WELCOME TO IRONPORT');
  hud.style.visibility = 'visible';
  const splash = document.getElementById('bootSplash');
  if (!splash) return;
  // Wait two painted frames so the GPU has actually presented the fully populated map + menu before fading the curtain
  requestAnimationFrame(() => requestAnimationFrame(() => {
    splash.classList.add('boot-done');
    setTimeout(() => splash.remove(), 760);
  }));
}
// Absolute safety guard so the splash can never stall indefinitely even on an offline or degraded GPU
setTimeout(() => { if (!bootDismissed) dismissBootSplash(); }, 18000);

// ---------- boot ----------
async function boot(): Promise<void> {
  if (USE_WEBGPU) {
    setBootProgress(8, 'INITIALIZING WEBGPU & PLAYKIT PIPELINE');
    try {
      await (renderer as unknown as THREE_GPU.WebGPURenderer).init();
      webgpuReady = true;
      // Probe real WebGPU GPUDevice.adapterInfo / navigator.gpu adapter (Three r184 does NOT expose backend.adapter!)
      const gpuDetect = await detectWebGpuTierAsync(renderer, TV_MODE);
      applyPerfTier(gpuDetect.tier);
      if (perfTier !== 'high' && !explicitScale) {
        renderScale = perfTier === 'low' ? 0.84 : 0.90;
      }
      // Keep crisp 1024x1024 shadows on mid iGPUs (768x768 on low) — CityCellBatches cuts shadow casters to ~8 nearby cells so shadows stay both sharp and fast!
      if (perfTier !== 'high' && sun.shadow.mapSize.x > 1024) {
        const sSz = perfTier === 'low' ? 768 : 1024;
        sun.shadow.mapSize.set(sSz, sSz);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      // Throttle directional shadow map redraws via spatialCuller (every shadowStride frames) — set BOTH renderer.shadowMap AND sun.shadow.autoUpdate (WebGPU reads sun.shadow.autoUpdate!)
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      sun.shadow.autoUpdate = false;
      sun.shadow.needsUpdate = true;
      initKTX2(renderer);
      pmrem = new THREE_GPU.PMREMGenerator(renderer as unknown as THREE_GPU.WebGPURenderer) as unknown as THREE.PMREMGenerator;
      scene.userData.look = {
        aoRadius: 1.15,
        aoScale: 0.92,
        bloomStrength: perfTier === 'high' ? 0.30 : 0.24,
        bloomRadius: 0.44,
        bloomThreshold: 1.18,
        contrast: 1.03,
        toe: 0.015,
        warm: 0.04,
      };
      // Discrete high-tier GPUs (or explicit ?post=1 / ?ssr=1) run the full Playkit MRT+SSR+GTAO+Bloom+CAS+LUT post stack.
      // Mid/low integrated GPUs (e.g. Intel Xe-LPG) render DIRECTLY to the native 1:1 swapchain with ACESFilmicToneMapping
      // — zero offscreen 64-bit HalfFloat pass, zero upscaling blur, 100% pixel-sharp & 2.5-3x smoother framerate!
      const forcePost = location.search.includes('post=1') || location.search.includes('ssr=1');
      const useSsr = !location.search.includes('nossr') && (perfTier === 'high' || location.search.includes('ssr=1'));
      webgpuPost = (perfTier === 'high' || forcePost)
        ? createPlaykitPostPipeline(
            renderer as unknown as THREE_GPU.WebGPURenderer,
            scene,
            camera,
            {
              ao: perfTier === 'high',
              ssr: useSsr,
              ssrScale: 0.45,
              fxaa: perfTier === 'high',
              fsr1: false,
              internalScale: perfTier === 'high' ? 1.0 : perfTier === 'mid' ? 0.80 : 0.72,
              bloom: perfTier === 'high' ? 'full' : false,
              lut: true,
              lutPreset: 'era-clash-cinema',
              lutStrength: 0.22,
              stylize: apexPostStage!.stylize,
            },
          )
        : null;
      // Native 1:1 CSS pixel canvas on mid/low iGPUs (pixel-sharp direct WebGPU output, zero double-scaling!) + 1.25x on high GPUs
      renderer.setPixelRatio(Math.min(devicePixelRatio, perfTier === 'high' ? 1.25 : 1.0));
      webgpuPost?.setInternalScale(perfTier === 'high' ? 1.0 : perfTier === 'mid' ? 0.80 : 0.72);
      const isNativeGpu = Boolean((renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend);
      const badgeEl = document.getElementById('rendererBadge');
      if (badgeEl) {
        badgeEl.textContent = isNativeGpu ? (useSsr ? 'WebGPU · SSR' : webgpuPost ? 'WebGPU · FX' : 'WebGPU') : 'WebGPU-Compat';
      }
      console.log('[apex-webgpu] initialized:', {
        tier: perfTier,
        gpu: gpuDetect.gpu,
        nativeWebGPU: isNativeGpu,
        passes: webgpuPost?.activePasses ?? ['direct'],
      });
    } catch (err) {
      console.error('[apex-webgpu] init failed, falling back to WebGL2 reload:', err);
      try { localStorage.setItem('apex.renderer', 'webgl'); } catch { /* ignore */ }
      const u = new URL(location.href);
      u.searchParams.set('renderer', 'webgl');
      location.replace(u.href);
      return;
    }
  }
  setBootProgress(12, 'LOADING IRONPORT ELEVATION & CIRCUITS');
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
  { if (!countryNet) countryNet = { roads: [] }; countryNet.roads.push({ kind: 'paved', xz: meta.coastal_highway.xz, half: 6.4 }, { kind: 'paved', xz: meta.freeway.xz, half: 10 }, ...buildRuralRoadNetwork()); }
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
    // the Civic Riverfront Street Circuit along the east bank (tools/plan_civic_circuit.py)
    const cvc = await fetch(BASE + 'civic_circuit.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { name: string; xz: number[][] } | null;
    if (cvc && cvc.xz.length > 6) { const sm = smoothClosedPath(cvc.xz, undefined, 18, 6); meta.circuits[CIV] = { name: cvc.name, kind: 'road_course', xz: sm.xz } as typeof meta.circuits[string]; }
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
  // Carve rural small-town graded pads BEFORE planSim() so rail elevations (P.y) & grade crossings match town streets flush!
  carvePads(heights, meta.width, meta.height, meta.mpp, buildRuralTownPads());
  {
    // the simulation layer: plan the rails and the airfield on the ground as it is, then grade the ground for them
    const cityRuns = await fetch(BASE + 'city_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { c: string; p: number[][] }[] | null;
    const tall = await fetch(BASE + 'city.json').then((x) => (x.ok ? x.json() : null)).then((d: { items: CityItem[] } | null) => (d?.items ?? []).filter((i) => i.h >= 30).map((i) => [i.x, i.z] as [number, number])).catch(() => [] as [number, number][]);   // downtown, for the junction control
    simPlan = planSim(userMap as unknown as UserMapData | null, { country: countryNet ? [countryNet] : [], city: cityRuns ?? [], shoreline: shoreHw }, (x, z) => hAt(x, z), tall);
    carveSim(simPlan, heights, meta.width, meta.height, meta.mpp);
  }
  setBootProgress(30, 'GRADING IRONPORT STREETS & HIGHWAYS');
  carveCreek(heights, meta.width, meta.height, meta.mpp);
  // Civil-engineering berm apron softening BEFORE building pads & road grading:
  // turns the razor-steep 55% side cliff of Ironport Grand Circuit's 42 m downtown hill into a smooth <=9.5% urban hillside
  // so downtown towers, building pads, Woodward Ave, Campus Martius, Randolph St & Jefferson Ave sit cleanly without impossible grades!
  const preTrench = await fetch(BASE + 'trench.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { lines: { xz: number[][]; half: number }[] } | null;
  const preTrenchLock = corridor((preTrench?.lines ?? []).map((l) => ({ xz: l.xz, r: l.half + 8 })));
  const gcRaw = meta.circuits.ironport_grand_circuit as { xz?: number[][] } | undefined;
  const apronStats = gcRaw?.xz ? softenTrackBermApron(heights, meta.width, meta.height, meta.mpp, gcRaw.xz, preTrenchLock) : { cellsRaised: 0, maxRaise: 0 };
  console.log('downtown berm apron', apronStats);
  // Civil-engineering road network sanitizer: removes folded <54 deg acute hairpin spikes & underwater cliff-plunge stubs before grading and 3D meshing
  const sanStats: SanitizeStats = { roadsIn: 0, roadsOut: 0, acuteSpikesRemoved: 0, waterStubsClipped: 0, underwaterDropped: 0 };
  if (countryNet?.roads) {
    const cleanedRoads: typeof countryNet.roads = [];
    for (const r of countryNet.roads) {
      sanStats.roadsIn++;
      if (r.kind === 'drive') { cleanedRoads.push(r); sanStats.roadsOut++; continue; }
      const p = sanitizeRoadPolyline(r.xz, (x, z) => hAt(x, z), sanStats);
      if (p.length >= 2) { cleanedRoads.push({ ...r, xz: p }); sanStats.roadsOut++; }
    }
    countryNet.roads = cleanedRoads;
  }
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
    const td = preTrench;
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
    const gcv = meta.circuits[CIV] as { xz?: number[][] } | undefined;
    if (gcv?.xz && gcv.xz.length > 3) roads.push({ xz: [...gcv.xz, gcv.xz[0]], half: 7.5, cls: 'highway' });
    // the Pinewood Rally Stage as a gravel lane (12 % at most): graded after the paved roads, it eases into their beds where it crosses them instead of dropping
    // into the cutting (a 0.76 m dip at 33 % where it crossed the paved road at -1117, -3571) and takes the steepest pitches off the hillsides it runs over
    const gr = meta.circuits.pinewood_rally_stage as { xz?: number[][] } | undefined;
    if (gr?.xz && gr.xz.length > 3) roads.push({ xz: gr.xz, half: 4, cls: 'lane' });
    const W8 = { street: 8.5, arterial: 14, freeway: 12.5, ramp: 5.5 } as Record<string, number>;
    const runs = await fetch(BASE + 'city_streets.json').then((x) => (x.ok ? x.json() : null)).catch(() => null) as { c: string; p: number[][] }[] | null;
    for (const r of runs ?? []) {
      const sp = sanitizeRoadPolyline(r.p, (x, z) => hAt(x, z), sanStats);
      if (sp.length >= 2) roads.push({ xz: sp, half: (W8[r.c] ?? 8.5) / 2, cls: r.c === 'freeway' ? 'freeway' : r.c === 'street' ? 'street' : 'highway' });
    }
    for (const r of countryNet?.roads ?? []) {
      const rr = r as { kind: string; xz: number[][]; half?: number; trail?: boolean; driveway?: boolean; town?: boolean };
      const cls: GradeClass = rr.kind === 'drive' ? 'drive' : rr.kind === 'dirt' || rr.trail ? 'lane' : rr.half === 10 ? 'freeway' : rr.xz === meta.coastal_highway.xz ? 'highway' : rr.town ? 'street' : 'rural';
      roads.push({ xz: rr.xz, half: rr.half ?? 3.6, cls });
    }
    const st = gradeRoads(heights, meta.width, meta.height, meta.mpp, roads, locked, scenicFlat);   // no later road reshapes the ground under a scenic road
    apexBridge.setCivilStats(apronStats, sanStats, st);
    console.log('civil road sanitizer', sanStats);
    // the new Ironworks leaves the ground twice: over the Port Branch on a bridge, under it in a cutting. Its design heights come from the graded ground, then
    // the cutting is dug (the rail keeps the height it was planned at and crosses on its own bridge)
    if (gi?.xz && industrialGrade.length) {
      const pts = gi.xz.map((q) => ({ x: q[0], z: q[1] }));
      industrialYs = industrialProfile(pts, industrialGrade, (x, z) => hAt(x, z));
      console.log('ironworks cutting cells', carveIndustrialCutting(heights, meta.width, meta.height, meta.mpp, GRID.ox, GRID.oz, pts, industrialYs, (x, z) => hAt(x, z)));
    }
    // the harbour circuit's piers and wharf stand out over the water: its road never goes below 3.6 m (a deck on piers there) and no grade passes 10 %
    if (gh?.xz) harborYs = industrialProfile(gh.xz.map((q) => ({ x: q[0], z: q[1] })), [], (x, z) => hAt(x, z));
    if (gcv?.xz) civicYs = industrialProfile(gcv.xz.map((q) => ({ x: q[0], z: q[1] })), [], (x, z) => hAt(x, z));
    // each new circuit sits on a formation: the land cut and filled flat across the course to its design height, eased back into the hillside
    for (const [nm, c, ys] of [['ironworks', gi, industrialYs], ['harbor', gh, harborYs], ['civic', gcv, civicYs]] as const) {
      if (c?.xz && ys) console.log(nm + ' formation', JSON.stringify(carveCourseFormation(heights, meta.width, meta.height, meta.mpp, GRID.ox, GRID.oz, c.xz.map((q) => ({ x: q[0], z: q[1] })), ys)));
    }
    console.log('road grade pass', st);
    (window as unknown as { roadGrade: unknown }).roadGrade = st;
  }
  {
    const cc = meta.circuits.great_lakes_cliff_raceway;
    if (cc) { cliffDesign = designCliffTrack(cc as { xz: number[][]; y?: number[]; tunnel?: { from: number; to: number } }); carveCliffRaceway(heights, meta.width, meta.height, meta.mpp, cliffDesign); cliffIx = indexTrack(cliffDesign); (window as unknown as { cliffDesign: unknown }).cliffDesign = cliffDesign; }
  }
  setBootProgress(52, 'SCULPTING TERRAIN, WATER & ATMOSPHERE');
  buildTerrain();
  apexLighting.populateRegion(meta, hAt);
  buildOverlays();
  setBootProgress(64, 'ASSEMBLING HARBOR, TRACKS & LANDMARKS');
  // the Plajah 3D builds of the district sheets (src/library/modelled.ts): loaded before the districts are dressed, each falls back to its code-built piece
  console.log('library models', JSON.stringify(await preloadModelledPieces()));
  buildFurniture();
  preset('overview');
  lastInput = performance.now();
  cineFade.style.opacity = '0';
  tweenOn = true;
  const savedTod = (() => { try { return localStorage.getItem('apex.tod'); } catch { return null; } })();
  const initTod = savedTod && (savedTod === 'realtime' || savedTod === 'dynamic' || TOD[savedTod]) ? savedTod : 'golden';
  setTimeOfDay(initTod);
  const todElInit = document.getElementById('tod') as HTMLSelectElement | null;
  if (todElInit) todElInit.value = initTod;
  msg.remove();
  setBootProgress(78, 'POPULATING DOWNTOWN SKYLINE & MENU');
  // Configure the heading-up minimap with live regional terrain/water imagery & named landmarks
  {
    const lm: MapLandmark[] = [];
    for (const p of meta.places) {
      const kind: MapLandmark['kind'] = /port|harbor|ironworks|refinery|plant/i.test(p.name) ? 'industrial' : /lake|river|bay|shore|beach/i.test(p.name) ? 'water' : /park|forest|pine|ridge|bluff|cliff/i.test(p.name) ? 'nature' : 'city';
      lm.push({ name: p.name, x: p.xz[0], z: p.xz[1], kind });
    }
    for (const [name, x, z] of NORTH_PLACES) {
      const kind: MapLandmark['kind'] = /lake|coast|shore|fjord/i.test(name) ? 'water' : 'nature';
      lm.push({ name, x, z, kind });
    }
    for (const st of festivalData?.sites ?? []) lm.push({ name: st.name, x: st.x, z: st.z, kind: 'festival' });
    for (const sr of scenicData) {
      const m = sr.xz[sr.xz.length >> 1];
      if (m) lm.push({ name: sr.name, x: m[0], z: m[1], kind: 'track' });
    }
    if (portData?.cranes?.length) lm.push({ name: 'Container Port', x: portData.cranes[0].x, z: portData.cranes[0].z, kind: 'industrial' });
    if (portData?.tanks?.length) lm.push({ name: 'Refinery Tanks', x: portData.tanks[0].x, z: portData.tanks[0].z, kind: 'industrial' });
    for (const town of RURAL_TOWNS) lm.push({ name: town.name, x: town.x, z: town.z, kind: 'town' });
    lm.push({ name: 'Halcyon Intl Airport', x: -4750, z: 4150, kind: 'airport' });
    // Build live procedural topographic & biome minimap canvas straight from graded heights (replaces stale satellite albedo!)
    const buildMinimapCanvas = (): HTMLCanvasElement => {
      const sz = 512;
      const cv = document.createElement('canvas');
      cv.width = sz; cv.height = sz;
      const g = cv.getContext('2d')!;
      const img = g.createImageData(sz, sz);
      const rw = meta.width * meta.mpp, rh = meta.height * meta.mpp;
      const minX = GRID.ox - rw * 0.5, minZ = GRID.oz - rh * 0.5;
      for (let py = 0; py < sz; py++) {
        const wz = minZ + (py / (sz - 1)) * rh;
        for (let px = 0; px < sz; px++) {
          const wx = minX + (px / (sz - 1)) * rw;
          const h = hAt(wx, wz);
          const idx = (py * sz + px) * 4;
          let r = 24, gr = 44, b = 36;
          if (h <= 1.55) {
            const deep = Math.min(1, Math.max(0, (1.55 - h) / 14));
            r = Math.round(13 - deep * 6);
            gr = Math.round(38 - deep * 16);
            b = Math.round(62 - deep * 18);
          } else if (h < 4.2) {
            // Coastal beach / sand dunes
            r = 56; gr = 58; b = 46;
          } else {
            const metro = Math.hypot((wx - 5350) / 2200, (wz - 920) / 1900);
            const elev = Math.min(1, Math.max(0, (h - 4) / 240));
            const contour = Math.abs(((h % 20) + 20) % 20 - 10) < 0.9 ? 1.10 : 1.0;
            if (metro < 1.0) {
              // Urban Ironport dark slate grid backdrop
              const u = 1 - metro;
              r = Math.round((26 + u * 16 + elev * 10) * contour);
              gr = Math.round((34 + u * 14 + elev * 10) * contour);
              b = Math.round((42 + u * 16 + elev * 12) * contour);
            } else {
              // Rural farmland & Michigan pinewoods (subtle farm parcel grid in farmland belt!)
              const isFarm = wx > -4400 && wx < 2400 && wz > -2200 && wz < 4200 && h < 90;
              const parcel = isFarm && (((Math.floor(wx / 260) + Math.floor(wz / 210)) & 1) === 0) ? 1.09 : 0.96;
              r = Math.round((22 + elev * 24) * parcel * contour);
              gr = Math.round((46 + elev * 20 + (isFarm ? 6 : 0)) * parcel * contour);
              b = Math.round((30 + elev * 16) * parcel * contour);
            }
          }
          img.data[idx] = Math.min(255, r);
          img.data[idx + 1] = Math.min(255, gr);
          img.data[idx + 2] = Math.min(255, b);
          img.data[idx + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return cv;
    };
    racingHud.configureEnvironment(buildMinimapCanvas(), { ox: GRID.ox, oz: GRID.oz, w: meta.width * meta.mpp, h: meta.height * meta.mpp }, lm);
  }
  // Eagerly preload & compile the active hero scan car immediately so frame 1 of the first race already has the real model (zero pop-in near '1')
  preloadHeroCar();
  // Spin up curved 3D blade-strand grass, roadside wildflowers, farm crops & PBR rocks right away (lightweight: ~1 MB, instant on frame 1!)
  if (!location.search.includes('veg=old') && !vegetation) {
    vegetation = new Vegetation({ rw: meta.width * meta.mpp, rh: meta.height * meta.mpp, classUrl: BASE + 'landclass.png', albedoUrl: BASE + 'albedo.jpg', ground: meshH, ok: (x, z) => grassOk(x, z) });
    scene.add(vegetation.group);
  }
  const streetsP = buildStreets().catch((e) => console.error('streets failed', e));
  const forestP = buildForest().catch((e) => console.error('forest failed', e));
  const harborP = loadHarbor().catch((e) => console.error('harbor failed', e));
  const trenchP = buildTrenchLayer().catch((e) => console.error('trench failed', e));
  // Stream the 8-layer 512x512 ground PBR array pack cleanly in background (groundArrays.ts yields 16 ms between layers,
  // so players who enter Drive City or Race right away ALWAYS get full ground PBR relief instead of bare satellite pixels)
  buildCity()
    .catch((e) => {
      console.error('city failed', e);
      resolveCityCore?.();
      resolveCityCore = null;
    })
    .finally(() => {
      loadGroundArrays().catch((e) => console.error('ground materials failed', e));
    });
  // Hold the full-page Plajah Motorsport: Apex splash screen until the map, streets, harbor, trench,
  // downtown Wave-0 skyline, and menu are genuinely populated — then reveal cleanly in one smooth fade!
  void Promise.race([
    Promise.allSettled([cityCorePromise, streetsP, harborP, trenchP, forestP]),
    new Promise<void>((res) => setTimeout(res, 9500)),
  ]).then(() => {
    if (USE_WEBGPU) {
      sanitizeObjectForWebGPU(scene);
      if (perfTier !== 'high') {
        vegetation?.setQuality(perfTier === 'low' ? 0.38 : 0.50, false);
        grassField?.setQuality(perfTier === 'low' ? 0.55 : 0.72);
        for (const tf of treeFields) tf.setQuality(perfTier === 'low' ? 0.58 : 0.76);
      }
    }
    setBootProgress(96, 'FINALIZING MENU & LIGHTING');
    lastInput = performance.now();
    dismissBootSplash();
    // Quietly preload all 6 24-hour sky panoramas in idle time so 24h cycle transitions NEVER stall or hard-pop mid-drive!
    setTimeout(() => sky.preloadCycleSkies(), 1200);
  });
  fetch(BASE + 'yards.json').then((x) => (x.ok ? x.json() : null)).then((y) => { if (y) { const yg = buildYards(keepYardsOffCourse(y), (x, z) => meshH(x, z)); mergeStaticScenery(yg, 500); furnitureGroup.add(yg); scheduleCullerReindex(); } }).catch(() => undefined);
  mapEditor = createMapEditor({
    scene, camera, dom: renderer.domElement, terrain: () => terrain, ground: (x, z) => meshH(x, z),
    topView: () => { const t = controls.target; look(new THREE.Vector3(t.x, Math.max(2500, camera.position.distanceTo(t)), t.z + 1), t.clone()); },
  });
  mapEditor.load(userMap ?? { version: 1, features: [] });
  (window as any).refScenes = REF_SCENES;
  // Kenne's hero shots as camera spots in the world (src/heroScenes.ts): a point on a circuit's built line, or a landmark seen from the river
  (window as any).heroScenes = () => HERO_SCENES.map((h) => {
    const sp = h.spot;
    if ('course' in sp) {
      const paths = { ironport_grand_circuit: cityPath, great_lakes_cliff_raceway: cliffPathPts, ironworks_industrial_circuit: industrialPath, harbor_district_circuit: harborPath, civic_riverfront_circuit: civicPath } as Record<string, { x: number; z: number }[]>;
      const P = paths[sp.course]; if (!P?.length) return { id: h.id, files: h.files, what: h.what, cam: null, at: null };
      let k = 0, bd = 1e18; P.forEach((q, i) => { const d = (q.x - sp.near[0]) ** 2 + (q.z - sp.near[1]) ** 2; if (d < bd) { bd = d; k = i; } });
      const n = P.length, a = P[((k + sp.ahead) % n + n) % n], b = P[((k + sp.ahead + sp.look) % n + n) % n];
      return { id: h.id, files: h.files, what: h.what, cam: [a.x, groundH(a.x, a.z) + sp.h, a.z], at: [b.x, groundH(b.x, b.z) + sp.h * 0.6, b.z] };
    }
    const L = civicSpots[sp.landmark]; if (!L || !civicShore.length) return { id: h.id, files: h.files, what: h.what, cam: null, at: null };
    let s0 = civicShore[0], bd = 1e18; for (const q of civicShore) { const d = (q[0] - L[0]) ** 2 + (q[1] - L[2]) ** 2; if (d < bd) { bd = d; s0 = q; } }
    const dl = Math.hypot(s0[0] - L[0], s0[1] - L[2]) || 1, ux = (s0[0] - L[0]) / dl, uz = (s0[1] - L[2]) / dl, side = sp.side ?? 0;
    const cx = L[0] + ux * sp.back - uz * side, cz = L[2] + uz * sp.back + ux * side;
    return { id: h.id, files: h.files, what: h.what, cam: [cx, Math.max(groundH(cx, cz), 1.5) + sp.h, cz], at: [L[0], L[1] + 8, L[2]] };
  });
  (window as any).coursePaths = () => ({ ironport_grand_circuit: cityPath, great_lakes_cliff_raceway: cliffPathPts, ironworks_industrial_circuit: industrialPath, harbor_district_circuit: harborPath, civic_riverfront_circuit: civicPath });   // the lines the circuits are built on (scripts/apex-probe-circuits.mjs)
  (window as any).cineJump = (i: number) => { if (!cineOn) startCine(); cineIdx = i % cineShots.length; cineT = 1.2; };
  (window as any).vegStats = () => vegetation?.stats;
  (window as any).simDebug = () => ({ cars: simLayer?.world.cars ?? [], trafficCalls, signals: simLayer?.world.signals, surf: surfaceAtXZ, meshH, graph: simLayer?.world.graph });
  (window as any).regionViewer = { debug: () => ({ cityItems, cityPath }), wx, scene, terrain: () => terrain, furniture: () => furnitureGroup, groundH, meshH, lap: () => lap, preset, startFly, stopFly, hAt, camera, controls, meta, csm, renderer, warmShaders, audio: gameAudio, cam: (x?: number, y?: number, z?: number, tx?: number, ty?: number, tz?: number) => { dbgCam = x === undefined ? null : { pos: new THREE.Vector3(x, y!, z!), at: new THREE.Vector3(tx!, ty!, tz!) }; }, setPool: (v: number) => { poolLevel = v; }, hydro: () => hydro, startDrive, stopDrive, finishRun, keys, drive: () => driving, delivery: () => delivery, garage };
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
const todSelEl = document.getElementById('tod') as HTMLSelectElement;
todSelEl.addEventListener('change', (e) => {
  const val = (e.target as HTMLSelectElement).value;
  setTimeOfDay(val);
  try { localStorage.setItem('apex.tod', val); } catch { /* storage blocked */ }
});
const nightSkySelEl = document.getElementById('nightSkySel') as HTMLSelectElement | null;
if (nightSkySelEl) {
  nightSkySelEl.value = nightSkyPref;
  nightSkySelEl.addEventListener('change', () => {
    const val = nightSkySelEl.value;
    if (/^sky2_night(_moon|_aurora|_cloudy|_storm)?$/.test(val)) {
      nightSkyPref = val;
      try { localStorage.setItem('apex.nightSky', val); } catch { /* storage blocked */ }
      if (todMode === 'preset') setTimeOfDay(todKey);
      else applySolarHour(todMode === 'realtime' ? localRealHour() : cycleHour, true);
    }
  });
}
const todHourEl = document.getElementById('todHour') as HTMLInputElement | null;
if (todHourEl) {
  todHourEl.addEventListener('input', () => {
    const h = parseFloat(todHourEl.value);
    if (!Number.isFinite(h)) return;
    todMode = 'preset';
    applySolarHour(h, false);
    syncTodClockUi(true);
  });
}
const dofCbEl = document.getElementById('tDof') as HTMLInputElement | null;
if (dofCbEl) {
  dofCbEl.checked = dofEnabled;
  dofCbEl.addEventListener('change', () => {
    dofEnabled = dofCbEl.checked;
    try { localStorage.setItem('apex.dof', dofEnabled ? '1' : '0'); } catch { /* storage blocked */ }
  });
}
(document.getElementById('tFx') as HTMLInputElement).addEventListener('change', (e) => { fxOn = (e.target as HTMLInputElement).checked; });
{
  const syncPct = (id: string, v: number): void => { const el = document.getElementById(id); if (el) el.textContent = `${Math.round(v * 100)}%`; };
  const engEl = document.getElementById('engVol') as HTMLInputElement | null;
  const sfxEl = document.getElementById('sfxVol') as HTMLInputElement | null;
  const musEl = document.getElementById('musicVol') as HTMLInputElement | null;
  if (engEl) {
    engEl.value = String(engVol);
    syncPct('engVolVal', engVol);
    engEl.addEventListener('input', () => {
      engVol = parseFloat(engEl.value);
      gameAudio.setEngineLevel(engVol);
      syncPct('engVolVal', engVol);
      try { localStorage.setItem('apex.engVol', String(engVol)); } catch { /* storage blocked */ }
    });
  }
  if (sfxEl) {
    sfxEl.value = String(sfxVol);
    syncPct('sfxVolVal', sfxVol);
    sfxEl.addEventListener('input', () => {
      sfxVol = parseFloat(sfxEl.value);
      gameAudio.setSfxLevel(sfxVol);
      wx.setAudioLevel(sfxVol);
      syncPct('sfxVolVal', sfxVol);
      try { localStorage.setItem('apex.sfxVol', String(sfxVol)); } catch { /* storage blocked */ }
    });
  }
  if (musEl) {
    musEl.value = String(musicVol);
    syncPct('musicVolVal', musicVol);
    musEl.addEventListener('input', () => {
      const mv = parseFloat(musEl.value);
      setMusicVolume(mv);
      syncPct('musicVolVal', mv);
    });
  }
}
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
  const rendererSel = document.getElementById('rendererSel') as HTMLSelectElement | null;
  const rendererBadge = document.getElementById('rendererBadge');
  if (rendererSel) {
    rendererSel.value = USE_WEBGPU ? 'webgpu' : 'webgl';
    if (rendererBadge && !USE_WEBGPU) {
      rendererBadge.textContent = 'WebGL2';
      rendererBadge.style.color = '#FF8C00';
    }
    rendererSel.addEventListener('change', () => {
      const next = rendererSel.value === 'webgl' ? 'webgl' : 'webgpu';
      try { localStorage.setItem('apex.renderer', next); } catch { /* storage blocked */ }
      const url = new URL(location.href);
      url.searchParams.set('renderer', next);
      url.searchParams.delete('webgl');
      url.searchParams.delete('webgpu');
      location.assign(url.href);
    });
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
  const pkGiCb = document.getElementById('tPkGi') as HTMLInputElement | null;
  if (pkGiCb) {
    pkGiCb.checked = apexLighting.controller.enabled;
    pkGiCb.addEventListener('change', () => {
      apexLighting.controller.setEnabled(pkGiCb.checked);
      try { localStorage.setItem('apex.pkgi', pkGiCb.checked ? '1' : '0'); } catch { /* storage blocked */ }
    });
  }
  const fsrCb = document.getElementById('tFsr') as HTMLInputElement | null;
  if (fsrCb) {
    fsrCb.checked = fsrEnabled;
    fsrCb.addEventListener('change', () => {
      fsrEnabled = fsrCb.checked;
      if (fsr1Pass) fsr1Pass.enabled = fsrEnabled;
      try { localStorage.setItem('apex.fsr', fsrEnabled ? '1' : '0'); } catch { /* storage blocked */ }
      if (!fsrEnabled && renderScale < 1 && IS_INTEL_IGPU) renderScale = 1;
      applyRenderScale();
    });
  }
  // colour grade and lens options (the platform's LUT library and film/tape lenses)
  const lutSel = document.getElementById('lutSel') as HTMLSelectElement, lutAmt = document.getElementById('lutAmt') as HTMLInputElement, lensSel = document.getElementById('lensSel') as HTMLSelectElement;
  for (const l of GAME_LUTS) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; lutSel.appendChild(o); }
  for (const l of GAME_LENSES.filter((x) => x.id !== 'none')) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; lensSel.appendChild(o); }
  if (gradePass) { lutSel.value = gradePass.lut; lensSel.value = gradePass.lens; lutAmt.value = String(gradePass.lutAmount); }
  else { lutSel.value = webgpuActiveLut; lensSel.value = webgpuActiveLens; lutAmt.value = String(webgpuLutAmt); }
  const syncWebGpuGrade = (): void => {
    if (!webgpuPost) return;
    const preset: PlaykitLutPreset = webgpuActiveLut === 'none' ? 'era-clash-cinema' : 'fable-warm';
    const str = webgpuActiveLut === 'none' ? 0.22 : Math.max(0, Math.min(1, webgpuLutAmt * 0.65));
    webgpuPost.setLut(preset, str);
  };
  const save = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
  lutSel.addEventListener('change', () => { webgpuActiveLut = lutSel.value; if (gradePass) gradePass.lut = lutSel.value; syncWebGpuGrade(); save('apex.lut', lutSel.value); });
  lutAmt.addEventListener('input', () => { webgpuLutAmt = parseFloat(lutAmt.value); if (gradePass) gradePass.lutAmount = webgpuLutAmt; syncWebGpuGrade(); save('apex.lutAmt', lutAmt.value); });
  lensSel.addEventListener('change', () => { webgpuActiveLens = lensSel.value as GameLens; if (gradePass) gradePass.lens = webgpuActiveLens; save('apex.lens', lensSel.value); });
  (window as unknown as { apexGrade: unknown }).apexGrade = { set: (lut: string, lens: string, amt = 1) => { webgpuActiveLut = lut; webgpuActiveLens = lens as GameLens; webgpuLutAmt = amt; if (gradePass) { gradePass.lut = lut; gradePass.lens = lens as GameLens; gradePass.lutAmount = amt; } syncWebGpuGrade(); } };
}
(document.getElementById('tStr') as HTMLInputElement).addEventListener('change', (e) => { streetGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tScape') as HTMLInputElement).addEventListener('change', (e) => { scapeGroup.visible = (e.target as HTMLInputElement).checked; });
(document.getElementById('tBld') as HTMLInputElement).addEventListener('change', (e) => {
  const vis = (e.target as HTMLInputElement).checked;
  cityGroup.visible = roofGroup.visible = vis;
  if (cityBroadcastLights) cityBroadcastLights.group.visible = !mapMode && vis;
  if (signatureTowers) signatureTowers.group.visible = !mapMode && vis;
});
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
document.getElementById('playOnlineWorld')?.addEventListener('click', () => launchOnlineHub('world'));
// Online race: through the Plajah Realtime server when /api/gamer/rt is switched on (lobby, server countdown,
// refereed finish order on the gamer ledger); otherwise instant local multi-tab BroadcastChannel mode.
const RT_API = new URLSearchParams(location.search).get('api') ?? '';
document.getElementById('playOnlineRace')?.addEventListener('click', () => launchOnlineHub('race', 'ironport_grand_circuit'));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; applyMapOffset();
  applyRenderScale();
});


// ── Frame-rate governor & GPU Quality Tiers (`low` / `mid` / `high`). Target 60 fps (30 on TV / low-power with ?tv=1); dynamic resolution + tier stepping hold TARGET_MS. ──
const TV_MODE = TV_MODE_BOOT;
const IS_INTEL_IGPU = (() => {
  if (USE_WEBGPU) return false;
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rStr = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase() : '';
    return /\b(intel|arc|uhd|hd graphics|iris)\b/.test(rStr) && !/\b(arc a7[57]0|arc b5[78]0)\b/.test(rStr);
  } catch { return false; }
})();
let perfTier: PerfTier = detectInitialTier(renderer, TV_MODE);
let tierCfg = TIER_CONFIGS[perfTier];
const TARGET_MS = TV_MODE ? 1000 / 30 : 1000 / 60;
// On integrated Intel GPUs (Arc iGPU / Iris / UHD), cap canvas DPR at 1.0x on large viewports (still 1:1 CSS crisp)
// and start FSR 1 internal scale at 0.67x (matching Vesselbound's Intel iGPU profile in rift-realm/src/gfx.ts)
const BASE_PR = Math.min(devicePixelRatio, TV_MODE ? 1 : (IS_INTEL_IGPU && innerWidth * innerHeight > 1100 * 700 ? 1.0 : 1.5));
const explicitScale = (() => { try { const q = parseFloat(new URLSearchParams(location.search).get('scale') ?? ''); return Number.isFinite(q) && q >= 0.5 && q <= 1 ? q : null; } catch { return null; } })();
let renderScale = explicitScale ?? (TV_MODE ? 0.75 : perfTier === 'low' ? 0.8 : (IS_INTEL_IGPU && fsrEnabled ? 0.67 : 1)), govAcc = 0, govN = 0, govMax = 0, govLast = 0, govHold = 0, govPrev = 0, govFrom = 1, govDropped = false, govNoDrop = 0;
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
let lastCanvasPr = -1, lastCanvasW = -1, lastCanvasH = -1;
function applyRenderScale(): void {
  const effectiveScale = USE_WEBGPU ? Math.max(0.75, Math.min(1.0, renderScale)) : renderScale;
  const internalPr = Math.max(0.5, BASE_PR * effectiveScale);
  const useFsrScale = !!(composer && fsr1Pass && fsrEnabled);
  // Keep canvas at native 1:1 DPR (or crisp locked 0.78-0.80 on WebGPU iGPUs — never bounce swapchain size mid-drive!)
  const canvasPr = USE_WEBGPU
    ? (webgpuPost ? Math.min(BASE_PR, perfTier === 'high' ? 1.25 : 1.0) : Math.max(0.75, Math.min(perfTier === 'high' ? BASE_PR : 1.0, effectiveScale)))
    : (useFsrScale ? Math.min(BASE_PR, perfTier === 'low' ? 1.0 : 1.25) : internalPr);
  if (Math.abs(canvasPr - lastCanvasPr) > 0.015 || innerWidth !== lastCanvasW || innerHeight !== lastCanvasH) {
    lastCanvasPr = canvasPr;
    lastCanvasW = innerWidth;
    lastCanvasH = innerHeight;
    renderer.setPixelRatio(canvasPr);
    renderer.setSize(innerWidth, innerHeight);
  }
  let iw = Math.max(1, Math.floor(innerWidth * internalPr));
  let ih = Math.max(1, Math.floor(innerHeight * internalPr));
  if (webgpuPost) {
    webgpuPost.setInternalScale(effectiveScale);
  }
  if (composer) {
    composer.setPixelRatio?.(internalPr);
    composer.setSize(innerWidth, innerHeight);
    iw = Math.max(1, composer.renderTarget2.width);
    ih = Math.max(1, composer.renderTarget2.height);
    // Recreate DepthTexture at exact renderTarget2 pixel dimensions so D3D11 FBO never goes INCOMPLETE_DIMENSIONS -> black
    const oldDepth = composer.renderTarget2.depthTexture;
    if (oldDepth && (oldDepth.image?.width !== iw || oldDepth.image?.height !== ih)) {
      oldDepth.dispose();
      const nextDepth = new THREE.DepthTexture(iw, ih);
      nextDepth.type = THREE.UnsignedIntType;
      composer.renderTarget2.depthTexture = nextDepth;
      composer.renderTarget2.dispose();
    }
    if (cinePass && aoPass) cinePass.uniforms.tSkyMask.value = aoPass.maskTexture;
  }
  // Keep UnrealBloomPass at quarter resolution (capped at 480x270) after composer.setSize resizes passes
  bloomPass?.setSize(
    Math.min(480, Math.max(160, Math.floor(iw * 0.25))),
    Math.min(270, Math.max(90, Math.floor(ih * 0.25)))
  );
  if (aaPass && 'uniforms' in aaPass && aaPass.uniforms?.uInvRes) {
    aaPass.uniforms.uInvRes.value.set(1 / iw, 1 / ih);
  }
  vegetation?.setQuality(perfTier === 'low' ? 0.38 : perfTier === 'mid' ? 0.50 : 1.0, perfTier === 'high');
  grassField?.setQuality(renderScale * (perfTier === 'low' ? 0.72 : perfTier === 'mid' ? 0.85 : 1));
  for (const tf of treeFields) tf.setQuality(perfTier === 'low' ? 0.58 : perfTier === 'mid' ? 0.76 : 1.0);
}
function governFrames(nowMs: number): void {
  if (govLast) { const d = nowMs - govLast; if (d < 250) { govAcc += d; govN++; if (d > govMax) govMax = d; } }
  govLast = nowMs;
  if (govN < 45 || (window as unknown as { govOff?: boolean }).govOff) { if (govN >= 45) { govAcc = 0; govN = 0; } return; }
  const avg = govAcc / govN; govAcc = 0; govN = 0; govMax = 0;
  if (nowMs < 12000 || !cityCoreReady) return;                       // wait only for core city wave, then protect FPS right from Lap 1!
  if (govHold > 0) { govHold--; return; }
  // On direct WebGPU (without offscreen post target), never oscillate renderScale mid-drive — calling renderer.setSize() reallocates the WebGPU swapchain and causes visible stutters!
  // Only adjust tier AFTER launch countdown finishes, and allow recovering back UP to mid once steady-state FPS is smooth (> 41 FPS)!
  if (USE_WEBGPU && !webgpuPost) {
    if (driving && (driving.lock > 0 || driving.readyHold > 0)) return;
    if (avg > TARGET_MS * 1.65 && perfTier === 'high') {
      applyPerfTier('mid');
      govHold = 4;
    } else if (avg > 38.0 && perfTier === 'mid') {
      applyPerfTier('low');
      govHold = 6;
    } else if (avg < 24.0 && perfTier === 'low' && !TV_MODE) {
      applyPerfTier('mid');
      govHold = 6;
    }
    (window as unknown as { govState?: unknown }).govState = { avgMs: +avg.toFixed(1), renderScale: +renderScale.toFixed(2), tv: TV_MODE, tier: perfTier };
    return;
  }
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
if (TV_MODE || IS_INTEL_IGPU || renderScale < 0.99) applyRenderScale();

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
  if (best > 0.6) {
    gameAudio.playCollision(best > 2.8 ? 'car' : 'scrape', Math.min(1, best / 14));
  }
  return best;
}

// Whole-place culling: dense circuits & Ironport hardware (harbor, catch fencing, grandstands, yards, roof details) are hidden when far and split into frustum-cullable chunks with tiered view/shadow budgets.
const PLACE_FAR = new Set([
  'river-bridges', 'country-scenes', 'port-district', 'parking-lots', 'utilities',
  'Ironport harbor hardware', 'Ironport bolted catch fencing', 'Ironport grandstand', 'trackkit-group', 'yards', 'IronportCityExpansion', 'roof-group', 'harbor-group',
  'RuralSmallTowns', 'rural-detail', 'coastal-world', 'riverfront-world', 'scenic-roads', 'town-sidewalks', 'parked-cars',
]);
const placeBoxes = new Map<THREE.Object3D, THREE.Box3>();
let placeNext = 0, placeScan = 0; const placeList: THREE.Object3D[] = [];
function cullPlaces(now: number): void {
  if (now < placeNext) return;
  placeNext = now + 400;
  // Never run a full-world scene.traverse() mid-drive once places are indexed (eliminates periodic 15 s stutter hiccups!)
  if (!placeList.length || (!driving && now > placeScan)) {
    placeScan = now + 15000;
    scene.traverse((g) => { if (g.name && (g.name.startsWith('circuit:') || g.name === 'cliffRacewayCircuit' || g.name === 'industrial-circuit' || PLACE_FAR.has(g.name)) && !placeList.includes(g)) placeList.push(g); });
  }
  for (const root of placeList) {
    if (!root.userData.chunkDone) { root.userData.chunkDone = true; chunkInstanced(root.parent && root.parent !== scene && root.parent.children.length < 400 ? root.parent : root); }
    if (mapMode) {
      // In 60 FPS Map Overview mode, keep major river bridges visible and hide close-up fences/barriers/grandstands/yards/roofs!
      const keepOnMap = root.name === 'river-bridges';
      root.visible = keepOnMap;
      if (keepOnMap) {
        for (const g of root.children) if (!(g as THREE.InstancedMesh).userData?.chunked) g.visible = true;
      }
      continue;
    }
    const hideClosedExtras = USE_WEBGPU && perfTier !== 'high' && !!driving && CLOSED_CIRCUITS.has(driving.circuitId);
    const hideDowntownOffCircuit = USE_WEBGPU && perfTier !== 'high' && driving?.circuitId === 'ironport_grand_circuit';
    if (hideClosedExtras && (root.name === 'parked-cars' || root.name === 'parking-lots' || root.name === 'roof-group')) {
      root.visible = false;
      continue;
    }
    if (hideDowntownOffCircuit && (
      root.name === 'riverfront-world' || root.name === 'coastal-world' || root.name === 'RuralSmallTowns' ||
      root.name === 'rural-detail' || root.name === 'yards' || root.name === 'IronportCityExpansion' ||
      root.name === 'port-district' || root.name === 'town-sidewalks' || root.name === 'country-scenes' ||
      root.name === 'harbor-group' || root.name === 'utilities'
    )) {
      root.visible = false;
      continue;
    }
    root.visible = true;
    for (const g of root.children) {
      if ((g as THREE.InstancedMesh).userData?.chunked) continue;                  // chunks are distance/shadow managed by chunkList below
      let b = placeBoxes.get(g);
      if (!b) { g.visible = true; g.updateMatrixWorld(true); b = new THREE.Box3(); g.traverse((o) => { const m = o as THREE.InstancedMesh; if (!m.isMesh) return; if (m.isInstancedMesh) { m.computeBoundingBox(); if (m.boundingBox) b!.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); } else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b!.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); } }); placeBoxes.set(g, b); }
      const placeReach = (USE_WEBGPU && perfTier !== 'high')
        ? Math.min((hideDowntownOffCircuit ? 680 : tierCfg.cullViewDist + 180), PLACE_FAR.has(root.name) ? 1600 : 1100)
        : (PLACE_FAR.has(root.name) ? 1600 : 1100);
      g.visible = b.distanceToPoint(camera.position) < placeReach;
    }
  }
  const camX = camera.position.x, camZ = camera.position.z;
  const tierSh = tierCfg.cullShadowDist;
  const hideDowntownOffCircuit = USE_WEBGPU && perfTier !== 'high' && driving?.circuitId === 'ironport_grand_circuit';
  const tierChunkCap = (USE_WEBGPU && perfTier !== 'high') ? (hideDowntownOffCircuit ? 680 : tierCfg.cullViewDist + 180) : Infinity;
  for (let i = 0; i < chunkList.length; i++) {
    const c = chunkList[i];
    if (mapMode) {
      c.m.visible = false;
      if (c.baseCastShadow) c.m.castShadow = false;
      continue;
    }
    const dist = Math.hypot(c.cx - camX, c.cz - camZ) - c.r;
    const vis = dist < Math.min(c.maxDist, tierChunkCap);
    c.m.visible = vis;
    if (c.baseCastShadow) c.m.castShadow = vis && dist < Math.min(tierSh, c.maxShadowDist);
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
  if (/catch fencing/i.test(label)) return { cell: 650, maxDist: 420, maxShadowDist: 90 };
  if (/trackkit-tyres/i.test(label)) return { cell: 650, maxDist: 280, maxShadowDist: 0 };
  if (/pit garages|grandstand/i.test(label)) return { cell: 650, maxDist: 560, maxShadowDist: 90 };
  if (/harbor hardware|yards/i.test(label)) return { cell: 550, maxDist: 560, maxShadowDist: 100 };
  if (/roof-group|street-light/i.test(label)) return { cell: 620, maxDist: 620, maxShadowDist: 110 };
  if (/coastal-world|riverfront-world|rural|scenic-roads|country-scenes/i.test(label)) return { cell: 620, maxDist: 640, maxShadowDist: 100 };
  return { cell: 750, maxDist: 1100, maxShadowDist: 180 };
}
function chunkInstanced(root: THREE.Object3D): void {
  const big: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || m.userData.chunked || m.userData.dynamicInstanced) return;
    if (m.count > 450) { big.push(m); return; }
    if (m.count > 36) {
      if (!m.boundingSphere) m.computeBoundingSphere();
      if ((m.boundingSphere?.radius ?? 0) > 450) big.push(m);
    }
  });
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
// black 3D view guard (src/blackGuard.ts): spots a pure black frame where the scene should be lit, resets the effects, then turns them off; log in localStorage 'apex.blackLog'
const blackGuard = new BlackGuard({
  renderer, camera,
  shouldBeLit: () => !mapMode && curTod.nightK < 0.5 && !replay.active,
  fxOn: () => fxOn, setFx: (on) => { fxOn = on; },
  resetPost: () => {
    if (cinePass) { cinePass.uniforms.uSpeed.value = 0; cinePass.uniforms.uShaft.value = 0; cinePass.uniforms.uTime.value = 0; }
    if (aoPass) (aoPass as unknown as { havePrev: boolean }).havePrev = false;
    if (!Number.isFinite(renderer.toneMappingExposure) || renderer.toneMappingExposure <= 0.05) renderer.toneMappingExposure = 1.08;
  },
  resetCamera: () => {
    const d = driving;
    if (d && Number.isFinite(d.pos.x) && Number.isFinite(d.car.position.y)) { camera.position.set(d.pos.x - Math.sin(d.yaw) * 8, d.car.position.y + 3, d.pos.z - Math.cos(d.yaw) * 8); camera.lookAt(d.pos.x, d.car.position.y + 1, d.pos.z); }
    else { camera.position.set(4000, 400, 1500); camera.lookAt(4600, 0, 2000); }
    camera.fov = 60; camera.near = 1; camera.far = 18000; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  },
  context: () => ({ weather: wx.name, tier: perfTier, scale: +renderScale.toFixed(2), circuit: driving?.circuitId ?? null, cam: camera.position.toArray().map((v) => Math.round(v)), w: renderer.domElement.width, h: renderer.domElement.height }),
});
function frame(now: number): void {
  frameNo++;
  if (USE_WEBGPU && (!webgpuReady || !bootDismissed)) { requestAnimationFrame(frame); return; }
  if (TV_MODE && now < tvNext) { requestAnimationFrame(frame); return; }
  if (TV_MODE) tvNext = now + 1000 / 30 - 4;
  // When the opaque 2D interactive World Map is open, pause all 3D world updates & WebGL rendering so the map runs at locked 60+ FPS
  if (glContextLost || festMap?.isOpen()) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  if (!mapMode) governFrames(now);
  cullPlaces(now);
  frameProfiler.begin(now);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const __t0 = performance.now();
  driveInput.tick();
  if (simLayer) {
    if (mapMode) {
      simLayer.updateTransitOnly(dt);
    } else {
      simLayer.setPublicTraffic(!driving || driving.circuitId === 'free');
      simLayer.update(dt, camera.position);
    }
  }
  if (transitOpen && now - lastTransitRenderMs > 900) {
    lastTransitRenderMs = now;
    renderTransitBoard();
  }
  // During the high-altitude portion of the curved Map-to-Car drone swoop, skip ground cell rebuilds so the aerial dive stays 45-60 FPS!
  const droneHigh = !!(driveIntro?.active && driveIntro.t < driveIntro.dur * 0.65);
  if (vegetation) {
    if (mapMode) vegetation.setEnabled(false);
    else {
      vegetation.setEnabled(true);
      if (!droneHigh) {
        vegetation.setWind(0.35 + wx.cur.wind * 0.95 + wx.cur.rain * 0.35);
        vegetation.setWet(wx.cur.wet);
        vegetation.setCarWake(driving ? driving.pos : null, driving ? driving.ps.vel : null);
        camera.getWorldDirection(tmpSun);
        vegetation.update(dt, camera.position, tmpSun);
      }
    }
  }
  if (grassField && !mapMode && !droneHigh) {
    grassField.setWind(0.35 + wx.cur.wind * 0.95 + wx.cur.rain * 0.35);
    grassField.setWet(wx.cur.wet);
    grassField.setCarWake(driving ? driving.pos : null, driving ? driving.ps.vel : null);
    grassField.update(dt, camera.position);
  }
  if (treeFields.length && !mapMode && !droneHigh) for (const tf of treeFields) { tf.setWind(0.25 + wx.cur.rain * 0.5 + wx.cur.cloudDark * 0.4); tf.update(dt, camera.position); }
  const __t1 = performance.now();
  stepFly(dt);
  stepTween(dt);
  stepCine(dt, now);
  stepWeather(dt);
  refDress?.update(now * 0.001);
  if (wildlifeWorld && !mapMode) wildlifeWorld.update(dt, now * 0.001, driving ? driving.pos : null);
  heroBridgeUpdate?.(now * 0.001, Math.max(0, Math.min(1, 1 - (sunDir.y + 0.05) * 4)));
  for (const l of cloudLayers) { l.tex.offset.x += l.vx * dt; l.tex.offset.y += l.vz * dt; }
  if (replay.active) replay.step(dt); else if (!photo.active) stepDrive(dt);      // photo mode pauses the drive
  if (trackKit && !mapMode && (!(USE_WEBGPU && perfTier !== 'high') || (frameNo & 1) === 0)) {
    trackKit.update(dt * ((USE_WEBGPU && perfTier !== 'high') ? 2 : 1), camera.position, wx.cur.wind + wx.cur.rain * 0.35, driving ? driving.pos : null, driving ? driving.ps.vel : null);
  }
  // Real-time shallow-water puddle/wet-road wake fluid simulation around the moving car (< 0.12 ms/frame)
  if (!mapMode && (wx.cur.wet > 0.08 || poolLevel > 0.05)) {
    const focusX = driving ? driving.pos.x : camera.position.x;
    const focusZ = driving ? driving.pos.z : camera.position.z;
    roadRipples.recenter(focusX, focusZ);
    if (driving && Math.abs(driving.ps.speedMps) > 3.5) {
      const sy = Math.sin(driving.yaw), cy = Math.cos(driving.yaw);
      const strength = Math.min(0.65, Math.abs(driving.ps.speedMps) / 38) * Math.max(wx.cur.wet, poolLevel);
      for (const [lx, lz] of [[-0.82, 1.38], [0.82, 1.38], [-0.82, -1.38], [0.82, -1.38]]) {
        const wxp = driving.pos.x + cy * lx + sy * lz;
        const wzp = driving.pos.z - sy * lx + cy * lz;
        roadRipples.splat(wxp, wzp, -strength, 0.72);
      }
    }
    roadRipples.step(dt, wx.cur.rain);
  }
  photo.update();
  updateProbe(dt);
  if (!fly && !driving) {
    const pad = driveInput.axes;
    if (Math.abs(pad.mapOrbitX) + Math.abs(pad.mapOrbitY) + Math.abs(pad.mapZoom) > 0) {
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta -= pad.mapOrbitX * dt * 1.9;
      sph.phi = Math.max(0.22, Math.min(Math.PI * 0.46, sph.phi - pad.mapOrbitY * dt * 1.4));
      sph.radius = Math.max(120, Math.min(9500, sph.radius * (1 - pad.mapZoom * dt * 1.6)));
      off.setFromSpherical(sph);
      camera.position.copy(controls.target).add(off);
    }
    controls.update();
  }
  // Altitude-adaptive near/far planes in 3D overview/map/fly views: raises 24-bit depth precision by >50x at map altitude
  // so rivers, lakeshores, and distant roads stay rock-solid with zero Z-fighting jitter.
  if (!driving) {
    const gndY = meta && heights ? Math.max(0, hAt(camera.position.x, camera.position.z) * exag) : 0;
    const camClear = Math.max(5, camera.position.y - gndY);
    const wantNear = Math.min(280, Math.max(4, camClear * 0.065));
    const wantFar = Math.min(48000, Math.max(24000, camClear * 9.5));
    if (Math.abs(camera.near - wantNear) > wantNear * 0.08 || Math.abs(camera.far - wantFar) > 1500) {
      camera.near = wantNear; camera.far = wantFar; camera.updateProjectionMatrix();
    }
  }
  let shadowStride = mapMode ? 6 : sun.intensity < 0.08 ? 90 : tierCfg.shadowStride;
  {
    const ft = driving ? driving.pos : controls.target;
    const drvSh = !csm && !!driving && !mapMode;
    const sb = drvSh ? (USE_WEBGPU && perfTier !== 'high' ? 130 : 170) : 380;
    let sx = ft.x, sy = ft.y, sz = ft.z;
    if (drvSh) {
      // Lock directional shadow frustum center to the shadow-map texel grid in sun-light space so building shadows glide silky-smooth with zero stepping or crawling!
      const mapRes = sun.shadow.mapSize.x || 2048;
      const texelWorld = (2 * sb) / mapRes;
      const upX = Math.abs(sunDir.y) > 0.98 ? 1 : 0, upY = Math.abs(sunDir.y) > 0.98 ? 0 : 1, upZ = 0;
      let rx = upY * sunDir.z - upZ * sunDir.y;
      let ry = upZ * sunDir.x - upX * sunDir.z;
      let rz = upX * sunDir.y - upY * sunDir.x;
      const rLen = Math.hypot(rx, ry, rz) || 1;
      rx /= rLen; ry /= rLen; rz /= rLen;
      const ux = sunDir.y * rz - sunDir.z * ry;
      const uy = sunDir.z * rx - sunDir.x * rz;
      const uz = sunDir.x * ry - sunDir.y * rx;
      const pR = Math.round((ft.x * rx + ft.y * ry + ft.z * rz) / texelWorld) * texelWorld;
      const pU = Math.round((ft.x * ux + ft.y * uy + ft.z * uz) / texelWorld) * texelWorld;
      const pD = ft.x * sunDir.x + ft.y * sunDir.y + ft.z * sunDir.z;
      sx = rx * pR + ux * pU + sunDir.x * pD;
      sy = ry * pR + uy * pU + sunDir.y * pD;
      sz = rz * pR + uz * pU + sunDir.z * pD;
    }
    sun.target.position.set(sx, sy, sz);
    sun.position.set(sx + sunDir.x * 3000, sy + sunDir.y * 3000, sz + sunDir.z * 3000);
    sun.target.updateMatrixWorld();
    if (camera.position.distanceToSquared(ft) >= 900 * 900) shadowStride = 4;
    if (csm) {
      if (!mapMode) {
        camera.updateMatrixWorld();
        if (
          Math.abs(camera.near - lastCsmNear) > 0.05 ||
          Math.abs(camera.far - lastCsmFar) > 50 ||
          Math.abs(camera.aspect - lastCsmAspect) > 0.005
        ) {
          lastCsmNear = camera.near; lastCsmFar = camera.far; lastCsmAspect = camera.aspect;
          csm.updateFrustums();
        }
        csm.lightDirection.copy(sunDir).negate();
        csm.update();
        for (let i = 0; i < csm.lights.length; i++) { const l = csm.lights[i]; l.intensity = sun.intensity; l.color.copy(sun.color); l.castShadow = csmCast[i]; }        // constant: flipping it recompiles every shader
        csmSweep();
      }
    } else {
      {
        const sc = sun.shadow.camera;
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
    u.uTime.value = ((Number.isFinite(u.uTime.value) ? u.uTime.value : 0) + dt) % 100;
    u.uAspect.value = Math.max(0.25, innerWidth / Math.max(1, innerHeight));
    const kmh = driving && !replay.active && Number.isFinite(driving.ps.speedMps) ? Math.abs(driving.ps.speedMps) : 0;
    const prevSpeed = Number.isFinite(u.uSpeed.value) ? u.uSpeed.value : 0;
    u.uSpeed.value = prevSpeed + (Math.min(1, Math.max(0, (kmh - 18) / 62)) - prevSpeed) * Math.min(1, dt * 4);
    // where the sun is on screen, and how much of it is there to shine through (a low sun in a clear sky; none under overcast or at night)
    const sv = tmpSun.copy(camera.position).addScaledVector(sunDir, 20000).project(camera);
    const svFinite = Number.isFinite(sv.x) && Number.isFinite(sv.y) && Number.isFinite(sv.z);
    const w = wx.cur, nk = curTod.nightK;
    const vis = svFinite && sv.z < 1 ? 1 : 0;
    const clear = Math.max(0, 1 - w.cloudDark * 1.4) * Math.max(0, 1 - w.fogGrey * 0.8);
    if (svFinite) u.uSun.value.set(Math.max(-2, Math.min(3, sv.x * 0.5 + 0.5)), Math.max(-2, Math.min(3, sv.y * 0.5 + 0.5)));
    else u.uSun.value.set(0.5, 0.8);
    const prevShaft = Number.isFinite(u.uShaft.value) ? u.uShaft.value : 0;
    const targetShaft = vis * clear * (1 - nk) * (mapMode ? 0 : 0.74);
    u.uShaft.value = Number.isFinite(targetShaft) ? prevShaft + (targetShaft - prevShaft) * Math.min(1, dt * 3) : 0;
    u.uHasSkyMask.value = aoPass?.aoOn ? 1 : 0;
    (u.uSunCol.value as THREE.Color).copy(sun.color);
  }
  // Update Playkit unified SH9 GI probes, district LocalLookVolumes, clustered streetlamps/tunnels & real 3D car headlights
  {
    const nk = curTod.nightK;
    const wDim = Math.min(1, wx.cur.cloudDark * 0.68 + wx.cur.rain * 0.42);
    const focus = driving ? driving.pos : controls.target;
    apexLighting.update(dt, camera, focus, nk, wDim, sunDir, mapMode);
    const duskK = Math.max(0, Math.min(1, (0.24 - sunDir.y) * 2.6));
    const hlStrength = Math.min(1, Math.max(nk * 1.15, duskK * 0.85, wx.cur.wet * 0.72, apexLighting.controller.fogMod.interiorMix));
    const hlOn = !!driving && !mapMode && !replay.active && hlStrength > 0.12;
    const brkAmt = driving && !replay.active && (keys.has('Space') || keys.has('KeyS') || keys.has('ArrowDown')) ? 0.9 : 0;
    apexLighting.updateVehicleLights(!!driving && !mapMode && !replay.active, driving?.pos, driving?.yaw ?? 0, hlOn, brkAmt);
    if (hlOn && driving) {
      const fx = Math.sin(driving.yaw), fz = Math.cos(driving.yaw);
      const cyBase = Number.isFinite(driving.car.position.y) ? driving.car.position.y : driving.pos.y;
      if (tslRegionCtx) {
        (tslRegionCtx.shared.uHlPos.value as THREE.Vector3).set(driving.pos.x + fx * 2.15, cyBase + 0.96, driving.pos.z + fz * 2.15);
        (tslRegionCtx.shared.uHlDir.value as THREE.Vector3).set(fx, -0.055, fz).normalize();
        tslRegionCtx.shared.uHlPower.value = hlStrength;
      }
      if (playerHeadlightSpot && playerHeadlightNear) {
        playerHeadlightSpot.position.set(driving.pos.x + fx * 2.15, cyBase + 0.94, driving.pos.z + fz * 2.15);
        playerHeadlightSpot.target.position.set(driving.pos.x + fx * 30.0, cyBase + 0.05, driving.pos.z + fz * 30.0);
        playerHeadlightSpot.target.updateMatrixWorld();
        playerHeadlightSpot.intensity = hlStrength * 240;
        playerHeadlightNear.position.set(driving.pos.x + fx * 8.5, cyBase + 1.35, driving.pos.z + fz * 8.5);
        playerHeadlightNear.intensity = hlStrength * 44;
      }
    } else {
      if (tslRegionCtx) tslRegionCtx.shared.uHlPower.value = 0;
      if (playerHeadlightSpot) playerHeadlightSpot.intensity = 0;
      if (playerHeadlightNear) playerHeadlightNear.intensity = 0;
    }
  }
  if (aoPass) {
    // 60 FPS map overview mode: disable full-screen AO/atmosphere pass completely while on the high map!
    aoPass.enabled = !mapMode;
    if (!mapMode) {
      // the atmosphere (ao.ts): dual-layer Rayleigh aerial perspective + coastal/valley mist + Mie sun scatter + optional real-time cinematic optical DOF
      const f = aoPass.fog, w = wx.cur;
      const nk = curTod.nightK;
      const fm = apexLighting.controller.fogMod;
      aoPass.aoOn = tierCfg.aoEnabled;
      f.on = true;
      f.density = 0.000165 * (1 + w.fogGrey * 4.5 + w.rain * 1.4) * fm.densityMul * (cineOn ? 0.48 : 1.0);
      f.falloff = 1 / 410;
      if (scene.fog instanceof THREE.Fog) {
        f.color.copy(scene.fog.color);
        if (fm.tintWeight > 0.002) f.color.lerp(fm.tintColor, fm.tintWeight);
      }
      f.sunColor.copy(sun.color).multiplyScalar(Math.min(1.75, 0.38 + sun.intensity * 0.50));
      f.sunDir.copy(sunDir);
      aoPass.mistBoost = Math.min(1, curTod.mistBoost + w.rain * 0.45 + w.fogGrey * 0.70);
      aoPass.contactShadow = Math.max(0, (1 - w.cloudDark * 1.15) * (1 - nk)) * 0.88;
      aoPass.blur = !photo.active && driving && !replay.active ? 0.46 : 0;             // camera motion blur while driving (ao.ts)
      const wantDof = dofEnabled && !photo.active && !replay.active && perfTier !== 'low';
      aoPass.dof.strength = wantDof ? (cineOn ? 0.46 : driving ? 0.30 : 0.22) : 0;
      aoPass.dof.focus = driving ? 10.5 : 26.0;
      aoPass.dof.farStart = cineOn ? 95 : driving ? 125 : 190;
    }
  }
  if (bloomPass) bloomPass.enabled = !mapMode;
  lensRain.update(dt, wx.cur.rain, driving ? Math.abs(driving.ps.speedMps) : 0, !mapMode && !!driving && !replay.active && driving.camView < 3, innerWidth / innerHeight);
  socialHud.setDrivingMode(!mapMode && !!driving && !photo.active);
  if (USE_WEBGPU && webgpuLighting) {
    (webgpuLighting.uniforms.uGiUpper.value as THREE.Color).copy(apexLighting.uniforms.uPkGiUpper.value);
    (webgpuLighting.uniforms.uGiLower.value as THREE.Color).copy(apexLighting.uniforms.uPkGiLower.value);
    webgpuLighting.uniforms.uGiInteriorMix.value = apexLighting.uniforms.uPkGiInteriorMix.value;
    webgpuLighting.uniforms.uDetailStrength.value = apexLighting.controller.enabled ? 1.0 : 0.0;
  }
  if (USE_WEBGPU && apexPostStage) {
    const kmh = driving && !replay.active && Number.isFinite(driving.ps.speedMps) ? Math.abs(driving.ps.speedMps) : 0;
    const speed01 = Math.min(1, Math.max(0, (kmh - 18) / 62));
    const w = wx.cur;
    const fm = apexLighting.controller.fogMod;
    const fogC = scene.fog instanceof THREE.Fog ? scene.fog.color.clone() : skyFog.clone();
    if (fm.tintWeight > 0.002) fogC.lerp(fm.tintColor, fm.tintWeight);
    const wantDof = dofEnabled && !photo.active && !replay.active && perfTier !== 'low' && !mapMode;
    apexPostStage.update({
      dt,
      speed01: mapMode ? 0 : speed01,
      aspect: Math.max(0.25, innerWidth / Math.max(1, innerHeight)),
      lens: webgpuActiveLens,
      lensRain: !mapMode ? lensRain : null,
      hazeOn: !mapMode,
      hazeDensity: 0.000135 * (1 + w.fogGrey * 2.0 + w.rain * 0.65) * fm.densityMul * (cineOn ? 0.48 : 1.0),
      mistBoost: Math.min(1, curTod.mistBoost + w.rain * 0.45 + w.fogGrey * 0.70),
      fogColor: fogC,
      sunColor: sun.color,
      dofStrength: wantDof ? (cineOn ? 0.30 : driving ? 0.14 : 0.12) : 0,
      dofFarStart: cineOn ? 140 : driving ? 240 : 280,
      camNear: camera.near,
      camFar: camera.far,
      invWidth: 1 / Math.max(1, Math.round(renderer.domElement.width * (perfTier === 'high' ? 1.0 : Math.max(0.72, Math.min(1.0, renderScale))))),
      invHeight: 1 / Math.max(1, Math.round(renderer.domElement.height * (perfTier === 'high' ? 1.0 : Math.max(0.72, Math.min(1.0, renderScale))))),
      sharpness: mapMode ? 0.20 : 0.46,
    });
  }
  const gradeActive = !!gradePass?.active;
  if (gradePass) gradePass.enabled = gradeActive;
  if (outputPass) outputPass.enabled = gradeActive;
  if (!Number.isFinite(renderer.toneMappingExposure) || renderer.toneMappingExposure <= 0.05) renderer.toneMappingExposure = 1.08;
  if (cinePass) {
    cinePass.uniforms.uToneMap.value = gradeActive ? 0 : 1;
    cinePass.uniforms.uExposure.value = renderer.toneMappingExposure;
  }
  if (aaPass && 'uniforms' in aaPass && aaPass.uniforms?.uInvRes) {
    const aw = Math.max(1, composer?.renderTarget2.width ?? Math.floor(innerWidth * renderer.getPixelRatio()));
    const ah = Math.max(1, composer?.renderTarget2.height ?? Math.floor(innerHeight * renderer.getPixelRatio()));
    aaPass.uniforms.uInvRes.value.set(1 / aw, 1 / ah);
  }
  const __t2 = performance.now();
  // Throttle live car cubemap probe (and disable on WebGPU mid/low iGPUs where CubeCamera target switches trigger ~200 ms WGSL pipeline/draw hitches; cars reflect crisp scene.environment PMREM instead!)
  const probeStride = (TV_MODE || perfTier !== 'high' || IS_INTEL_IGPU) ? 24 : 6;
  if (carProbe && !(USE_WEBGPU && perfTier !== 'high') && driving && !mapMode && !replay.active && (frameNo % probeStride) === 0) {
    const hideList: THREE.Object3D[] = [driving.car, spray.points, dust.points, forestGroup, scapeGroup, aiGroup, trafficGroup, roofGroup];
    if (simLayer?.group) hideList.push(simLayer.group);
    if (vegetation?.group) hideList.push(vegetation.group);
    if (grassField?.group) hideList.push(grassField.group);
    if (carProbe.step(renderer, scene, probePos.set(driving.pos.x, driving.car.position.y + 1.1, driving.pos.z), hideList)) {
      carProbe?.apply(driving.car, 0.85);
      carProbe?.apply(aiGroup, 0.85);
      carProbe?.apply(trafficGroup, 0.78);
    }
  }
  if (!mapMode) {
    const firstDriveFrame = !(window as unknown as { __didDriveCull?: boolean }).__didDriveCull;
    (window as unknown as { __didDriveCull?: boolean }).__didDriveCull = true;
    const baseCityView = tierCfg.cityViewDist;
    const baseCullView = tierCfg.cullViewDist;
    cityVisibility.viewDist = cineOn ? Math.max(baseCityView, 1850) : baseCityView;
    cityVisibility.shadowDist = tierCfg.cityShadowDist;
    cityVisibility.update(camera, csm ? csm.lights : [sun], firstDriveFrame ? 0 : frameNo % 3, firstDriveFrame ? 1 : 3);
    if (cityBatches) { cityBatches.viewDist = cityVisibility.viewDist; cityBatches.shadowDist = cityVisibility.shadowDist; cityBatches.update(camera.position, frameNo % 3, 3); }
    if (cityCellBatches) { cityCellBatches.update(camera, cityVisibility.viewDist, cityVisibility.shadowDist); }
    spatialCuller.update(camera, renderer, false, baseCullView, tierCfg.cullShadowDist, shadowStride, sun);
  }
  const __t3 = performance.now();
  frameProfiler.context = { mode: mapMode ? 'map' : driving ? 'drive' : 'review', weather: wx.name, camera: camera.position.toArray().map((v) => Math.round(v)) };
  // Update Downtown architectural building lighting waves, live LED marquee banners & live 3D race broadcast video walls!
  if (signatureTowers && !mapMode && signatureTowers.group.visible) {
    signatureTowers.update(curTod.nightK);
  }
  if (cityBroadcastLights && !mapMode && cityBroadcastLights.group.visible) {
    const nearDowntown = (driving?.circuitId === 'ironport_grand_circuit')
      || Math.hypot(camera.position.x - 5550, camera.position.z - 950) < 1750;
    if (nearDowntown) {
      const meRacer = competition?.racers.find((r) => r.isPlayer);
      const totalCars = competition?.racers.length ?? 6;
      const lapTot = driving && CLOSED_CIRCUITS.has(driving.circuitId) ? 3 : 1;
      const lapCur = Math.min(lapTot, Math.max(1, (meRacer?.lap ?? 0) + 1));
      const elapsedRace = raceClockStart > 0 ? Math.max(0, driveClock - raceClockStart) : 0;
      const lb: BroadcastLeaderEntry[] = competition?.racers?.length
        ? [...competition.racers]
            .sort((a, b) => a.position - b.position)
            .slice(0, 4)
            .map((r) => ({
              pos: r.position,
              name: r.isPlayer ? 'YOU · APEX GT' : r.driverName.toUpperCase(),
              gap: r.position === 1 ? 'LEADER' : `+${Math.max(0, r.gapToLeaderSec).toFixed(2)}s`,
              isPlayer: r.isPlayer,
            }))
        : [
            { pos: 1, name: 'YOU · KESTREL GT-R', gap: 'LEADER', isPlayer: true },
            { pos: 2, name: 'V. ROSSI · AURELIA', gap: '+0.42s', isPlayer: false },
            { pos: 3, name: 'K. TAKAHASHI · APEX', gap: '+1.18s', isPlayer: false },
          ];
      const psNow = driving?.ps;
      const spdMps = psNow && Number.isFinite(psNow.speedMps) ? Math.abs(psNow.speedMps) : 0;
      const gNow = psNow ? (psNow.forwardSpeed < -0.5 ? 'R' : psNow.gear <= 0 ? 'N' : String(psNow.gear)) : 'N';
      const rpm01 = psNow && Number.isFinite(psNow.rpm) ? Math.max(0.08, Math.min(1, psNow.rpm / 8200)) : 0.16;
      const flagText = !driving ? 'APEX LIVE' : driving.lock > 0 ? 'GRID HOLD' : lapCur >= lapTot ? 'FINAL LAP' : 'GREEN FLAG';
      cityBroadcastLights.update(dt, now, {
        active: !!driving,
        circuitName: driving && driving.circuitId !== 'free' ? (meta.circuits[driving.circuitId]?.name ?? 'Ironport Grand Circuit') : 'Ironport Grand Circuit',
        lapText: `LAP ${lapCur}/${lapTot}`,
        raceTimeText: fmtT(elapsedRace),
        speedKmh: spdMps * 3.6,
        gearLabel: gNow,
        rpm01,
        posText: meRacer ? `POS ${meRacer.position}/${totalCars}` : 'FREE ROAM',
        flagText,
        nightK: curTod.nightK,
        playerPos: driving ? driving.pos : null,
        playerYaw: driving ? driving.yaw : 0,
        playerSpeedMps: spdMps,
        leaderboard: lb,
      });
      // Capture throttled 320x180 live 3D broadcast footage of the race (skip during high-altitude drone swoop;
      // hide non-essential props & heavy trackKit fencing/tyres during the tiny 320x180 TV pass so main framerate stays silky!)
      if (!droneHigh) {
        cityBroadcastLights.renderBroadcastFeed(
          renderer,
          scene,
          [
            vegetation?.group, grassField?.group, forestGroup, wildlifeWorld?.group, trackKit?.group,
            spray.points, dust.points, scapeGroup, roofGroup, harborGroup, zoneGroup,
            simLayer?.group, parked?.group, parkingLots?.group, townWalks?.group, refDress?.group,
          ],
          false,
        );
      }
    }
  }
  frameProfiler.beginRender();
  atmosphere?.update(scene, camera, sunDir, sun.color, wx.cur.fogGrey, wx.cur.sun, curTod.nightK, mapMode, now);
  if (USE_WEBGPU) {
    const wAny = window as unknown as { __webgpuErrLogged?: boolean; __webgpuPostDisabled?: boolean };
    try {
      if (webgpuPost && fxOn && !mapMode && !wAny.__webgpuPostDisabled) {
        webgpuPost.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (err) {
      if (!wAny.__webgpuErrLogged) {
        wAny.__webgpuErrLogged = true;
        console.error('[apex-webgpu] frame render error:', err instanceof Error ? (err.stack || err.message) : err);
        sanitizeObjectForWebGPU(scene);
      }
      if (webgpuPost && fxOn && !mapMode && !wAny.__webgpuPostDisabled) {
        wAny.__webgpuPostDisabled = true;
        console.warn('[apex-webgpu] post pipeline failed; falling back to direct WebGPU render');
        try { renderer.render(scene, camera); } catch { /* ignore */ }
      }
    }
  } else if (composer && fxOn) {
    // Always align ping-pong so RenderPass writes renderTarget2 (with depthTexture) even after tier/AA pass toggles
    composer.readBuffer = composer.renderTarget2;
    composer.writeBuffer = composer.renderTarget1;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  blackGuard.check();
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
  const gl = !USE_WEBGPU ? renderer.getContext() : null, px = new Uint8Array(4), t: number[] = [], cull: number[] = [], veg: number[] = [], rend: number[] = [];
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
    if (cityCellBatches) { cityCellBatches.update(camera, cityVisibility.viewDist, cityVisibility.shadowDist); }
    spatialCuller.update(camera, renderer, false, tierCfg.cullViewDist, tierCfg.cullShadowDist, tierCfg.shadowStride);
    if (csm) csm.update();
    const t2 = performance.now();
    if (USE_WEBGPU && webgpuPost && fxOn && !plain) webgpuPost.render();
    else if (composer && fxOn && !plain) composer.render();
    else renderer.render(scene, camera);
    if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t3 = performance.now();
    if (i >= warm) { t.push(t3 - t0); veg.push(t1 - t0); cull.push(t2 - t1); rend.push(t3 - t2); calls = renderer.info.render.calls; tris = renderer.info.render.triangles; }
  }
  renderer.info.autoReset = auto;
  if (wasMap) setMapMode(true);
  const med = (a: number[]): number => { const b = [...a].sort((x, y) => x - y); return +b[b.length >> 1].toFixed(1); };
  const p90 = (a: number[]): number => { const b = [...a].sort((x, y) => x - y); return +b[Math.floor(b.length * 0.9)].toFixed(1); };
  return { median: med(t), p90: p90(t), vegMs: med(veg), cullMs: med(cull), renderMs: med(rend), calls, tris, w: renderer.domElement.width, h: renderer.domElement.height };
};
boot().catch((e) => {
  dismissBootSplash();
  msg.style.display = 'block';
  msg.textContent = 'failed: ' + e;
  console.error(e);
});
requestAnimationFrame(frame);
