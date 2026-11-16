// Region terrain viewer: height field + satellite albedo + circuits, for design review.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeSovereign } from './car';
import { loadSovereignScan } from './scancar';
import { Replay } from './broadcastReplay';
import { createCarState, stepCarPhysics, type CarState, type CarInput } from './physics';
import { CARS } from './manufacturers';
import { GameAudio } from './audio';
import { Sky } from './sky';
import { WaterSurface } from './water';
import { DriveInput } from './inputs';
import { TrackKit } from './trackkit';
import { harborDetail } from './harborDetail';
import { duneDetail } from './duneDetail';
import { injectRoadPbr, roadUniforms, loadRoadPbr } from './roadpbr';
loadRoadPbr();
import { SprayFx, puddleDepth, PUDDLE_GLSL } from './spray';
import { TreeField, cardLod } from './trees';
import { EzTreeField } from './ezforest';
import { GrassField } from './grass';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AoPass } from './ao';
import { RacingLine } from './racingline';
import { CSM } from 'three/addons/csm/CSM.js';
import { GradePass, GAME_LENSES, GAME_LUTS, type GameLens } from './grade';
import { WeatherRig, WEATHERS, worstOf, forecastText } from './weather';
import type { SurfaceType } from './world';

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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
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
  sun.shadow.bias = -0.0025; sun.shadow.normalBias = 2.5;
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
    csm.shaders.set(mm, shader);
  };
  csm.shaders.set(mm, null);
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
  csmSweep();
  const groups = [forestGroup, scapeGroup, furnitureGroup, streetGroup, cityGroup];
  const was = groups.map((g) => g.visible);
  groups.forEach((g) => { g.visible = true; });
  try { await (renderer as unknown as { compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  // the car is the heaviest set of shaders and loads a 14 MB scan: build it now, compile it, and hand it to the first race
  try {
    const car = makeCar(); car.position.set(0, -4000, 0); scene.add(car); prewarmCar = car;
    for (let i = 0; i < 100 && !car.userData.panels; i++) await new Promise((r) => setTimeout(r, 250));
    csmSweep();
    await (renderer as unknown as { compileAsync(s: THREE.Scene, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera);
    scene.remove(car);
  } catch (e) { console.warn('car warm-up failed', e); prewarmCar = null; }
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
const warmTimer = setInterval(() => { if ((window as unknown as { cityCount?: number }).cityCount && treeFields.length >= 3 && grassField && !warmed) { clearInterval(warmTimer); void warmShaders(); } }, 600);
let csmTick = 0;
/** every lit material in the scene must use the cascades, or it is lit three times over: sweep for new ones a few times a second */
function csmSweep(): void {
  if (!csm) return;
  const chk = (m: THREE.Material): void => { const x = m as unknown as Record<string, boolean>; if (!csmDone.has(m) && (x.isMeshStandardMaterial || x.isMeshPhysicalMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial)) csmSetup(m); };
  scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) { if (Array.isArray(m)) m.forEach(chk); else chk(m); } });
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
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    texCache.set(key, t);
  }
  return t;
}

interface Tod { sky: string; sun: number; sunInt: number; sunPos: [number, number, number]; hemiSky: number; hemiGround: number; hemiInt: number; fog: number; fogNear: number; fogFar: number; exposure: number; env: number }
const TOD: Record<string, Tod> = {
  clear:   { sky: 'sky_clear',   sun: 0xfff2dc, sunInt: 3.0, sunPos: [-6000, 12000, -4000], hemiSky: 0xcfe3ff, hemiGround: 0x55503f, hemiInt: 1.2, fog: 0xb8cfe6, fogNear: 9000, fogFar: 42000, exposure: 1.0, env: 0.55 },
  golden:  { sky: 'sky_golden',  sun: 0xffb870, sunInt: 3.4, sunPos: [-12000, 5200, -2000], hemiSky: 0xf0c8a0, hemiGround: 0x4a3a2a, hemiInt: 0.9, fog: 0xe0b88a, fogNear: 7000, fogFar: 38000, exposure: 1.05, env: 0.6 },
  sunset:  { sky: 'sky_sunset',  sun: 0xff8a4a, sunInt: 2.6, sunPos: [-13000, 2500, -1500], hemiSky: 0xd89070, hemiGround: 0x302838, hemiInt: 0.7, fog: 0xc88060, fogNear: 6000, fogFar: 34000, exposure: 1.1, env: 0.6 },
  dusk:    { sky: 'sky_dusk',    sun: 0x8a7ab0, sunInt: 0.9, sunPos: [-13000, 900, -1200], hemiSky: 0x6a6aa0, hemiGround: 0x1c1c28, hemiInt: 0.6, fog: 0x5a4a78, fogNear: 4000, fogFar: 30000, exposure: 1.25, env: 0.7 },
  night:   { sky: 'sky_night',   sun: 0x7a90c8, sunInt: 0.25, sunPos: [-8000, 9000, -5000], hemiSky: 0x24304a, hemiGround: 0x10121a, hemiInt: 0.45, fog: 0x0a0e1c, fogNear: 2500, fogFar: 24000, exposure: 1.5, env: 0.9 },
  sunrise: { sky: 'sky_sunrise', sun: 0xffc8a0, sunInt: 2.4, sunPos: [12000, 3500, 2000], hemiSky: 0xe8b8b0, hemiGround: 0x3a3438, hemiInt: 0.8, fog: 0xd8a8a0, fogNear: 6000, fogFar: 34000, exposure: 1.05, env: 0.6 },
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
function applyTerrainDetail(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: gameTex('grass') };
    sh.uniforms.tSand = { value: gameTex('sand') };
    sh.uniforms.tForest = { value: gameTex('forest') };
    sh.uniforms.tGravel = { value: gameTex('gravel') };
    sh.uniforms.uCam = { value: new THREE.Vector3() };
    sh.uniforms.uMapFade = mapFadeU;
    sh.uniforms.uEdge = edgeU;
    sh.uniforms.tAsph = { value: gameTex('asphalt_plain') };
    sh.uniforms.tPave = { value: gameTex('paver_plain') };
    sh.uniforms.tMask = { value: maskTex };
    sh.uniforms.uMask = { value: maskVec };
    sh.uniforms.uWet = wetU;
    sh.uniforms.uPool = poolU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D tGrass;\nuniform sampler2D tSand;\nuniform sampler2D tForest;\nuniform sampler2D tGravel;\nuniform sampler2D tMask;\nuniform sampler2D tAsph;\nuniform sampler2D tPave;\nuniform vec4 uMask;\nuniform float uWet;\nuniform float uPool;\nuniform float uMapFade;\nuniform vec2 uEdge;\nuniform vec3 uCam;\n' + PUDDLE_GLSL)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.a *= mix(1.0, smoothstep(0.0, 1300.0, min(uEdge.x - abs(vWPos.x), uEdge.y - abs(vWPos.z))), uMapFade);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float gWet = 0.0;
      float gPud = 0.0;
      float gRoad = 0.0;
      float camD = distance(vWPos, uCam);
      float fade = 1.0 - smoothstep(250.0, 1500.0, camD);
      if (fade > 0.01) {
        vec3 b = diffuseColor.rgb;
        float lum = dot(b, vec3(0.299, 0.587, 0.114));
        float greenness = clamp((b.g - max(b.r, b.b)) * 7.0, 0.0, 1.0);
        float sandy = clamp((b.r - b.b) * 5.0 - 0.15, 0.0, 1.0) * (1.0 - greenness) * smoothstep(0.28, 0.5, lum);
        float dark = 1.0 - smoothstep(0.12, 0.3, lum);
        vec2 uv1 = vWPos.xz / 9.0;
        vec3 gr = texture2D(tGrass, uv1).rgb;
        vec3 sa = texture2D(tSand, uv1 * 0.8).rgb;
        vec3 fo = texture2D(tForest, uv1 * 0.9).rgb;
        vec3 gv = texture2D(tGravel, uv1 * 1.3).rgb;
        vec3 det = mix(gr, fo, dark * greenness);
        det = mix(det, sa, sandy);
        det = mix(det, gv, (1.0 - greenness) * (1.0 - sandy) * 0.4);
        float dl = max(dot(det, vec3(0.299, 0.587, 0.114)), 0.05);
        vec3 shaded = b * (0.5 + 1.0 * dl);
        vec3 retint = det * (lum / dl);
        diffuseColor.rgb = mix(b, mix(shaded, retint, 0.4), fade * 0.9);
      }
      vec2 muv = (vWPos.xz - uMask.xy) / uMask.zw;
      if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) {
        vec3 mk = texture2D(tMask, muv).rgb;
        float road = smoothstep(0.42, 0.58, mk.r);
        float walk = smoothstep(0.42, 0.58, mk.g) * (1.0 - road);
        float kerb = (1.0 - road) * smoothstep(0.08, 0.38, mk.r) * walk;
        // streets: the asphalt tile twice at unrelated scales so it never repeats visibly, darker than before (it read as pale beige in the sun), with repair patches, wear and
        // oil in broad low-frequency variation, and sidewalk slabs that vary slab to slab
        vec2 sp = vWPos.xz;
        vec3 a1 = texture2D(tAsph, sp / 4.0).rgb, a2 = texture2D(tAsph, sp / 13.7 + 0.37).rgb;
        float cellN = fract(sin(dot(floor(sp / 6.0), vec2(12.9898, 78.233))) * 43758.5453);
        float cellM = fract(sin(dot(floor(sp / 23.0), vec2(39.3468, 11.135))) * 24634.6345);
        vec3 asph = a1 * (0.5 + a2 * 1.0) * (0.82 + 0.22 * cellN) * (0.86 + 0.2 * cellM);
        asph *= 1.0 - 0.28 * smoothstep(0.78, 0.98, cellN) * smoothstep(0.3, 0.9, a2.r);                      // darker repair patches
        vec3 pave = texture2D(tPave, sp / 1.7).rgb * (0.86 + 0.18 * fract(sin(dot(floor(sp / 1.7), vec2(12.9898, 78.233))) * 43758.5453));
        vec3 col = diffuseColor.rgb;
        col = mix(col, pave * 0.95, walk);
        col = mix(col, vec3(0.5, 0.5, 0.48), kerb);
        col = mix(col, asph * 1.15, road);
        gWet = uWet * max(road, walk * 0.7);
        gRoad = road;
        gPud = puddleAt(vWPos.xz, uPool) * road * (1.0 - smoothstep(600.0, 1400.0, camD));
        col *= 1.0 - 0.42 * gWet;                       // wet pavement is darker and glossy
        col *= 1.0 - 0.38 * gPud;                       // standing water: dark, and a mirror
        diffuseColor.rgb = col;
      }
      diffuseColor.rgb *= 1.0 - 0.16 * uWet;           // wet ground everywhere`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.16, gWet); roughnessFactor = mix(roughnessFactor, 0.015, gPud);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.6, gPud);');
    sh.fragmentShader = injectRoadPbr(sh.fragmentShader, 'vWPos.xz');
    Object.assign(sh.uniforms, roadUniforms);
    m.userData.shader = sh;
  };
}

let composer: EffectComposer | null = null;
let cinePass: ShaderPass | null = null;
let aoPass: AoPass | null = null;
let gradePass: GradePass | null = null;
let dbgCam: { pos: THREE.Vector3; at: THREE.Vector3 } | null = null;     // review tool: window.regionViewer.cam(x,y,z, tx,ty,tz) holds the camera still; cam() releases it
let fxOn = true;
try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // the scene is drawn into the composer's read buffer: give it a depth texture so the occlusion pass can read what was really drawn
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
  composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
  aoPass = new AoPass(camera, innerWidth, innerHeight);
  composer.addPass(aoPass);
  composer.setSize(innerWidth, innerHeight);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.55, 0.82);
  composer.addPass(bloom);
  // cinematic pass (linear HDR, before tone mapping): speed blur toward the screen edges, sun light shafts through the sky and cloud, a hint of lens fringing,
  // a soft vignette and fine grain
  cinePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSpeed: { value: 0 }, uSun: { value: new THREE.Vector2(0.5, 0.8) }, uShaft: { value: 0 }, uTime: { value: 0 }, uVig: { value: 0.28 }, uAspect: { value: 1.6 }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uSpeed, uShaft, uTime, uVig, uAspect; uniform vec2 uSun; uniform vec3 uSunCol;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 c = vec2(0.5, 0.42);
        vec2 d = vUv - c;
        float rd = length(d * vec2(uAspect, 1.0));
        // speed blur: samples pulled toward the vanishing point, none in the middle so the car and road ahead stay sharp
        float amt = uSpeed * 0.06 * smoothstep(0.10, 0.75, rd);
        vec3 col = vec3(0.0);
        const int N = 9;
        for (int i = 0; i < N; i++) {
          float t = float(i) / float(N - 1);
          vec2 uv = vUv - d * amt * t;
          // lens fringing grows with distance from the centre and with speed
          float ca = (0.0007 + uSpeed * 0.0012) * rd;
          col += vec3(texture2D(tDiffuse, uv + d * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ca).b);
        }
        col /= float(N);
        // light shafts: march from here toward the sun, gathering bright sky; blocked where trees and buildings cover it
        if (uShaft > 0.01) {
          vec2 ds = (uSun - vUv) / 22.0;
          vec2 p = vUv;
          vec3 acc = vec3(0.0);
          float w = 1.0;
          for (int i = 0; i < 22; i++) {
            p += ds;
            vec3 s = texture2D(tDiffuse, p).rgb;
            float l = dot(s, vec3(0.3, 0.59, 0.11));
            acc += s * smoothstep(1.2, 2.6, l) * w;
            w *= 0.93;
          }
          float toward = 1.0 - clamp(length(uSun - vUv) * 0.9, 0.0, 1.0);
          col += acc / 22.0 * uSunCol * uShaft * (0.25 + 0.75 * toward);
        }
        // vignette and grain
        col *= 1.0 - uVig * smoothstep(0.35, 1.05, rd);
        col += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.012;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(cinePass);
  composer.addPass(new OutputPass());
  // colour grade (the platform's cinematic LUTs) and film/tape lenses, after tone mapping; options in Settings > Graphics
  gradePass = new GradePass(innerWidth, innerHeight);
  try { gradePass.lut = localStorage.getItem('apex.lut') ?? 'none'; gradePass.lens = (localStorage.getItem('apex.lens') as GameLens) ?? 'none'; const a = parseFloat(localStorage.getItem('apex.lutAmt') ?? ''); if (!Number.isNaN(a)) gradePass.lutAmount = a; } catch { /* storage blocked */ }
  composer.addPass(gradePass);
} catch (e) { console.warn('post effects unavailable', e); composer = null; }

let meta: RegionMeta;
let heights: Float32Array;
let terrain: THREE.Mesh;
let terrainMat: THREE.MeshStandardMaterial;
const circuitGroup = new THREE.Group();
const labelGroup = new THREE.Group();
scene.add(circuitGroup, labelGroup);
circuitGroup.visible = false;      // the wide review ribbons; the street furniture (barriers, kerbs, gantry) stays on
let exag = 1;

function hAt(xw: number, zw: number): number {
  const px = xw / meta.mpp + meta.width / 2;
  const py = zw / meta.mpp + meta.height / 2;
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
  const px = Math.max(0, Math.min(W - 1, xw / meta.mpp + W / 2)), py = Math.max(0, Math.min(H - 1, zw / meta.mpp + H / 2));
  const nx = Math.floor((W - 1) / stride) + 1, ny = Math.floor((H - 1) / stride) + 1;
  const gi = Math.min(nx - 2, Math.floor(px / stride)), gj = Math.min(ny - 2, Math.floor(py / stride));
  const u = (px - gi * stride) / stride, v = (py - gj * stride) / stride;
  const hv = (i: number, j: number): number => heights[Math.min(j * stride, H - 1) * W + Math.min(i * stride, W - 1)] * exag;
  const a = hv(gi, gj), b = hv(gi + 1, gj), c = hv(gi, gj + 1), d = hv(gi + 1, gj + 1);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

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
      pos[k * 3] = (px - meta.width / 2) * meta.mpp;
      pos[k * 3 + 1] = heights[py * meta.width + px] * exag;
      pos[k * 3 + 2] = (py - meta.height / 2) * meta.mpp;
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  if (terrain) { terrain.geometry.dispose(); terrain.geometry = g; return; }
  const tex = new THREE.TextureLoader().load(BASE + 'albedo.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  terrainMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, transparent: false });
  applyTerrainDetail(terrainMat);
  terrain = new THREE.Mesh(g, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  // water: region footprint, extended far to the west so the Great Lake runs to the horizon
  const rw = meta.width * meta.mpp, rh = meta.height * meta.mpp, ext = 60000;
  const wGeo = new THREE.PlaneGeometry(rw + ext, rh);
  wGeo.rotateX(-Math.PI / 2);
  wGeo.dispose();
  waterSurface = new WaterSurface(scene, rw, rh, ext, edgeU.value, -rw / 2, -rh / 2);
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
  road(meta.coastal_highway, 0xdddddd, 12);
  road(meta.freeway, 0xcccccc, 18);
  road(meta.river, 0x2f86c4, 0.01);
  for (const p of meta.places) labelGroup.add(label(p.name, p.xz[0], hAt(p.xz[0], p.xz[1]) * exag + 260, p.xz[1], '#ffe9a0', 0.8));
}

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

  // transit sheds and warehouses
  for (const s of h.sheds) {
    const gy = Math.max(hAt(s.c[0], s.c[1]), 1.6) * exag;
    box(s.w, 11, s.d, 0x9aa0a6, s.c[0], gy + 5.5, s.c[1], harborGroup).rotation.y = phi;
    box(s.w * 1.02, 0.8, s.d * 1.02, 0x4f6a86, s.c[0], gy + 11.3, s.c[1], harborGroup).rotation.y = phi;
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
}
// Lane markings for the streets off the race circuit: the carriageways are painted from the street mask (which has no lines), so the centre lines go on as dashes laid
// along each street, broken wherever another street crosses (so there is nothing at an intersection to overlap or flicker) and left off the circuit, which has its own.
function buildStreetMarks(): void {
  const ROAD: Record<string, number> = { street: 9, arterial: 15, freeway: 24, ramp: 8 };
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
function addTreeCards(parent: THREE.Object3D, list: { x: number; z: number; def: SpriteDef; h: number }[], lod = false): void {
  const by = new Map<SpriteDef, typeof list>();
  for (const t of list) { if (!by.has(t.def)) by.set(t.def, []); by.get(t.def)!.push(t); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  by.forEach((arr, def) => {
    let mat = spriteMats.get(def.file);
    const mkey = def.file + (lod ? ':lod' : '');
    mat = spriteMats.get(mkey);
    if (!mat) { mat = new THREE.MeshStandardMaterial({ map: def.tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 }); if (lod) cardLod(mat); spriteMats.set(mkey, mat); }
    const im = new THREE.InstancedMesh(crossGeo, mat, arr.length);
    arr.forEach((t, i) => {
      const hh = t.h, ww = hh * def.w / def.h;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((t.x * 7.3 + t.z * 3.1) % 6.283));
      m4.compose(new THREE.Vector3(t.x, hAt(t.x, t.z) * exag - hh * 0.04, t.z), q, new THREE.Vector3(ww, hh, ww));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setScalar(0.8 + ((t.x * 13.1 + t.z * 5.7) % 1 + 1) % 1 * 0.3));
    });
    im.frustumCulled = false;
    parent.add(im);
  });
}
interface TreeLayer { group: THREE.Group; setWind(w: number): void; update(dt: number, cam: THREE.Vector3): void }
const treeFields: TreeLayer[] = [];
let grassField: GrassField | null = null;
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
const forestGroup = new THREE.Group();
scene.add(forestGroup);
async function buildForest(): Promise<void> {
  const res = await fetch(BASE + 'forest.json');
  if (!res.ok) return;
  for (let i = 0; i < 40 && !roadMask; i++) await new Promise((r) => setTimeout(r, 100));    // the road mask decides where trees may stand
  const pts = ((await res.json()) as number[][]).filter((p) => growable(p[0], p[1], 12, 6, true));
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
        if (!growable(x, z, 9, 6, true) || surfaceAtXZ(x, z) !== 'grass') continue;
        const conifer = rally ? rr() < 0.8 : rr() < 0.45;
        verge.push([x, z, conifer ? 1 : 0, rr(), 0.8 + rr() * 0.5]);
      }
    }
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
  grassField = new GrassField({ rw: meta.width * meta.mpp, rh: meta.height * meta.mpp, albedoUrl: BASE + 'albedo.jpg', ground: meshH, ok: (x, z) => growable(x, z, 6.5, 2.5, true) });
  forestGroup.add(grassField.group);
  duneDetail({ width: meta.width * meta.mpp, depth: meta.height * meta.mpp, albedo: BASE + 'albedo.jpg', ground: meshH, clear: (x, z) => growable(x, z, 13, 5, true) }).then((group) => forestGroup.add(group)).catch((e) => console.warn('dune detail failed', e));
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
  addTreeCards(scapeGroup, okTrees.map((t) => ({ x: t[0], z: t[1], def: pickStreet(t[3]), h: (8 + t[3] * 5) * t[2] / 1.2 })), true);
  // up close the street trees are real 3D trees (the cards take over beyond ~150 m)
  { const tf = mkTrees(okTrees.map((t) => [t[0], t[1], 0, t[3], 0.62 * t[2] + 0.2]), hAt, () => exag); scapeGroup.add(tf.group); treeFields.push(tf); }
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
  pole.frustumCulled = arm.frustumCulled = head.frustumCulled = false;
  scapeGroup.add(pole, arm, head);
  console.log('streetscape', trees.length, 'trees', ln, 'lights');
  (window as any).scapeCount = [trees.length, ln];
}

// ---------- building detail: cornices, rooftop plant, tanks, masts ----------
const roofGroup = new THREE.Group();
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
    // cornice: a slightly larger stone slab at the roofline, and a thin base course
    cornice.push({ x: cx, y: top - 0.45, z: cz, sx: it.w + 0.9, sy: 0.9, sz: it.d + 0.9, ry: phi, c: 0xb8b2a4 });
    if (it.h > 30) cornice.push({ x: cx, y: gy + 3.2, z: cz, sx: it.w + 0.5, sy: 0.6, sz: it.d + 0.5, ry: phi, c: 0xa6a094 });
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
  make(unit, metal, plant, true);
  make(unit, stone, pent, true);
  make(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), tanks, false);
  make(new THREE.BoxGeometry(2.6, 2.4, 2.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.4, wireframe: true }), legs, false);
  make(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), metal, masts, false);
  make(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), lamps, false);
  console.log('roof details', { cornice: cornice.length, plant: plant.length, pent: pent.length, tanks: tanks.length, masts: masts.length });
  (window as any).roofCount = [cornice.length, plant.length, tanks.length, masts.length];
}

// ---------- city buildings ----------
interface CityItem { kind: 'hero' | 'generic'; slug: string; x: number; z: number; rotY: number; w: number; d: number; h: number; sx?: number; sy?: number; sz?: number; bx?: number; bz?: number }
const cityGroup = new THREE.Group();
scene.add(cityGroup);
let cityItems: CityItem[] = [];
const IRON = '/games/forth-horizon/ironport/models/';

function groundMin(it: CityItem): number {
  const cx = it.bx ?? it.x, cz = it.bz ?? it.z, c = Math.cos(it.rotY), s = Math.sin(it.rotY);
  let m = 1e9;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const lx = (i / 2) * (it.w / 2 + 1), lz = (j / 2) * (it.d / 2 + 1);
    m = Math.min(m, hAt(cx + lx * c + lz * s, cz - lx * s + lz * c));
  }
  return m;
}
// Facade depth: steep parallax mapping driven by the base-colour luminance (dark = recessed: windows, mortar, joints),
// plus the relief normals. Faded out beyond about 200 m.
// Weathering on top of the texture, in world space so it is continuous across the building: ground-level grime, rain streaks running down the wall, fine
// grain at close range so the colour map is never a flat painted surface, and a wet darkening and gloss in the rain.
const FACADE_WEATHER = `
float fh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fvn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh3(i), fh3(i + vec3(1, 0, 0)), f.x), mix(fh3(i + vec3(0, 1, 0)), fh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fh3(i + vec3(0, 0, 1)), fh3(i + vec3(1, 0, 1)), f.x), mix(fh3(i + vec3(0, 1, 1)), fh3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 facadeWeather(vec3 col, vec3 fw, float dist, float wet) {
  float nearK = 1.0 - smoothstep(25.0, 110.0, dist);
  float low = fvn(fw * vec3(0.3, 0.1, 0.3));
  float ground = 1.0 - smoothstep(0.0, 8.0, fw.y);
  float streak = fvn(vec3((fw.x + fw.z) * 0.45, fw.y * 0.05, 3.0));
  float dirt = clamp(ground * (0.4 + 0.6 * low) + smoothstep(0.58, 0.92, streak) * 0.2 * smoothstep(3.0, 20.0, fw.y), 0.0, 1.0);
  // a photograph is less saturated and has more contrast than a painted colour map: pull the colour toward grey a little and open up the midtones
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.82);
  col = mix(vec3(lum), col, 1.0) * (0.88 + 0.28 * smoothstep(0.05, 0.6, lum));
  col *= 1.0 - 0.45 * dirt;
  col = mix(col, col * vec3(0.8, 0.78, 0.74), dirt * 0.5);
  float micro = fvn(fw * 5.0) * 0.6 + fvn(fw * 17.0) * 0.4;
  col *= 1.0 + (micro - 0.5) * 0.26 * nearK;
  col *= 1.0 - 0.26 * wet * (0.6 + 0.4 * low);
  return col;
}`;
function patchParallax(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWetF = wetU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 fwp = vec4(position, 1.0);\n#ifdef USE_INSTANCING\nfwp = instanceMatrix * fwp;\n#endif\nvFW = (modelMatrix * fwp).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;\nuniform float uWetF;\n' + FACADE_WEATHER)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, 'pUv') + '\ndiffuseColor.rgb = facadeWeather(diffuseColor.rgb, vFW, length(vViewPosition), uWetF);')
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace(/vRoughnessMapUv/g, 'pUv') + '\nroughnessFactor = mix(roughnessFactor, roughnessFactor * 0.5, uWetF);')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g, 'pUv'))
      .replace('#include <logdepthbuf_fragment>', `#include <logdepthbuf_fragment>
      vec2 pUv = vMapUv;
      {
        float pDist = length(vViewPosition);
        float pFade = 1.0 - smoothstep(70.0, 220.0, pDist);
        if (pFade > 0.02) {
          vec3 pN = normalize(vNormal);
          mat3 pT = getTangentFrame(-vViewPosition, pN, vMapUv);
          vec3 pV = normalize(vViewPosition);
          vec3 pt = vec3(dot(pV, pT[0]), dot(pV, pT[1]), dot(pV, pT[2]));
          // depth in metres, converted to texture units with the local uv-per-metre of this surface
          float uvA = dot(dFdx(vMapUv), dFdx(vMapUv)) + dot(dFdy(vMapUv), dFdy(vMapUv));
          float pA = dot(dFdx(vViewPosition), dFdx(vViewPosition)) + dot(dFdy(vViewPosition), dFdy(vViewPosition));
          float upm = sqrt(uvA / max(pA, 1e-8));
          vec2 pDir = pt.xy / max(pt.z, 0.35) * (0.16 * upm) * pFade;
          const float LAY = 8.0;
          vec2 pStep = pDir / LAY;
          float cur = 0.0;
          vec2 uvc = vMapUv;
          float hmap = 1.0 - smoothstep(0.08, 0.62, dot(texture2D(map, uvc).rgb, vec3(0.299, 0.587, 0.114)));
          for (int i = 0; i < 8; i++) {
            if (cur >= hmap) break;
            uvc -= pStep;
            cur += 1.0 / LAY;
            hmap = 1.0 - smoothstep(0.08, 0.62, dot(texture2D(map, uvc).rgb, vec3(0.299, 0.587, 0.114)));
          }
          pUv = uvc;
        }
      }`);
  };
  mat.customProgramCacheKey = () => 'facade-parallax-1';
}
// Curtain-wall glass: a dark tinted mirror that reflects the sky and the sun with a sharp highlight, a little different from pane to pane, and at night (or under a
// storm) a share of the panes light up warm. The facade texture still supplies the mullions, tint and relief.
const nightU = { value: 0 };
function patchGlass(mat: THREE.MeshStandardMaterial): void {
  mat.metalness = 0.62; mat.roughness = 0.5; mat.envMapIntensity = 3.0;
  mat.color.multiplyScalar(0.72);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uNightG = nightU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 gwp = vec4(position, 1.0);\n#ifdef USE_INSTANCING\ngwp = instanceMatrix * gwp;\n#endif\nvGW = (modelMatrix * gwp).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nuniform float uNightG;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * 0.16, 0.035, 0.3);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 gc = floor(vec2(vGW.x + vGW.z, vGW.y) / vec2(3.2, 3.4));
        float gh = fract(sin(dot(gc, vec2(12.9898, 78.233))) * 43758.5453);
        float gl = step(1.0 - uNightG * 0.42, gh);
        totalEmissiveRadiance += vec3(1.0, 0.82, 0.55) * gl * uNightG * (0.5 + 0.9 * fract(gh * 7.3)) * 0.85;
        diffuseColor.rgb *= 0.86 + 0.28 * fract(gh * 13.7);
      }`);
  };
  mat.customProgramCacheKey = () => 'glass-1';
}
async function buildCity(): Promise<void> {
  const res = await fetch(BASE + 'city.json');
  if (!res.ok) return;
  cityItems = ((await res.json()) as { items: CityItem[] }).items;
  buildCollision();
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
    const fm = u.match(/\/textures\/(shared|hero-facades)\/(tex-(?:shared|hero)-[a-z0-9-]+)_(base|nrm|rgh)\.png/);
    if (!fm) return u;
    if (LOW && fm[3] !== 'base') return TINY;
    if (FLOW.has(fm[2])) return `/games/forth-horizon/tex/bld/${fm[2]}_${fm[3]}.jpg`;
    return `/games/forth-horizon/ironport/textures/${fm[1]}/${fm[2]}_${fm[3]}.jpg`;
  });
  const loader = new GLTFLoader(manager);
  const texCache = new Map<string, THREE.Texture>();
  const protos = new Map<string, Promise<THREE.Object3D | null>>();
  const load = (kind: string, slug: string): Promise<THREE.Object3D | null> => {
    const key = kind + '/' + slug;
    if (!protos.has(key)) {
      protos.set(key, loader.loadAsync(`${IRON}${kind}/${slug}_lod0.gltf`).then((g) => {
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
              if (have && have !== tx) { tx.dispose(); (mat as any)[k] = have; } else texCache.set(uri, tx);
            }
            if (mat.normalMap) mat.normalScale.set(2.2, 2.2);
            if (mat.map && mat.normalMap && !LOW) patchParallax(mat);
            if (/hero/i.test(mat.name)) mat.normalScale.set(1.4, 1.4);     // the sheet-derived normals are gentle: push the relief
            mat.envMapIntensity = 0.7;
            if (/glass/i.test(mat.name)) patchGlass(mat);
            mat.needsUpdate = true;
          }
        });
        return g.scene;
      }).catch((e) => { console.warn('model failed', key, e); return null; }));
    }
    return protos.get(key)!;
  };
  // One InstancedMesh per mesh node of each model: thousands of buildings in a few hundred draw calls.
  const groups = new Map<string, CityItem[]>();
  for (const it of cityItems) {
    const key = it.kind + '/' + it.slug;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  cityGroup.clear();
  let done = 0;
  await Promise.all([...groups.entries()].map(async ([key, items]) => {
    const [kind, slug] = key.split('/');
    const proto = await load(kind, slug);
    if (!proto) return;
    proto.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    proto.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const place = new THREE.Matrix4(), rotM = new THREE.Matrix4(), inst = new THREE.Matrix4(), scM = new THREE.Matrix4();
    for (const m of meshes) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, items.length);
      im.castShadow = true;
      im.receiveShadow = true;
      items.forEach((it, i) => {
        const gy = groundMin(it) - 0.35;
        rotM.makeRotationY(it.rotY);
        place.makeTranslation(it.x, gy * exag, it.z).multiply(rotM).multiply(scM.makeScale(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
        inst.copy(place).multiply(m.matrixWorld);
        im.setMatrixAt(i, inst);
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      cityGroup.add(im);
    }
    done += items.length;
  }));
  console.log('city buildings placed', done, 'of', cityItems.length);
  (window as any).cityCount = done;
  addRoofDetails(cityItems);
  buildStreetscape().catch((e) => console.error('streetscape failed', e));
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
for (const [alt, size, rep, seed, vx, vz, op] of [[2900, 44000, 2.4, 7, 0.0075, 0.0028, 0.62], [3900, 52000, 1.7, 19, -0.0042, 0.0062, 0.42]] as [number, number, number, number, number, number, number][]) {
  const tex = makeCloudTexture(seed);
  tex.repeat.set(rep, rep);
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  mesh.position.set(1200, alt, 100);
  mesh.renderOrder = 5;
  scene.add(mesh);
  cloudLayers.push({ mesh, tex, vx, vz });
}
// ---------- weather ----------
const wx = new WeatherRig(scene);
const sky = new Sky(scene);
const spray = new SprayFx(scene);
const wDir = new THREE.Vector3(), wSun = new THREE.Vector3(0, 0.4, 1), tmpSun = new THREE.Vector3();
sky.loadWeatherSkies();
const NIGHT_K: Record<string, number> = { clear: 0, golden: 0, sunrise: 0.15, sunset: 0.1, dusk: 0.55, night: 1 };
const skyFog = new THREE.Color();
// each race has a plan: what the sky does over the race (seconds from the green light). The map shows the worst of it as the forecast.
const WEATHER_PLAN: Record<string, { t: number; w: string }[]> = {
  city: [{ t: 0, w: 'overcast' }, { t: 70, w: 'rain' }, { t: 200, w: 'storm' }],
  cliff: [{ t: 0, w: 'fog' }, { t: 140, w: 'overcast' }, { t: 320, w: 'partly' }],
  rally: [{ t: 0, w: 'partly' }, { t: 60, w: 'overcast' }, { t: 150, w: 'rain' }],
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
  poolLevel = Math.min(1, Math.max(0, poolLevel + (w.rain > 0.12 ? w.rain * dt / 70 : -dt / 220)));
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
  const g = SOV_SPEC.corneringGrip * w.grip * (1 - 0.82 * hydro);
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
  const hide: THREE.Object3D[] = [s.car, spray.points, forestGroup, scapeGroup];
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
vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;background:radial-gradient(ellipse at 60% 50%,rgba(0,0,0,0) 40%,rgba(10,0,16,.6) 100%),linear-gradient(90deg,rgba(26,0,38,.82) 0%,rgba(26,0,38,0) 36%)';
document.body.appendChild(vignette);
// a small tag that stays on screen the whole time: this build is a pre-alpha
{
  const tag = document.createElement('div');
  tag.textContent = 'PRE-ALPHA';
  tag.style.cssText = 'position:fixed;left:12px;bottom:10px;z-index:40;pointer-events:none;font:700 10px Outfit,Inter,sans-serif;letter-spacing:.24em;color:rgba(255,255,255,.78);padding:3px 9px;border:1px solid rgba(255,140,0,.55);border-radius:999px;background:rgba(10,12,24,.55)';
  document.body.appendChild(tag);
}
const menuEl = document.createElement('div');
menuEl.style.cssText = 'position:fixed;left:44px;top:50%;transform:translateY(-50%);width:360px;display:none;font-family:Inter,Manrope,sans-serif;color:#fff;user-select:none';
menuEl.innerHTML = `
  <div style="font:600 11px Outfit,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#FF8C00;margin-bottom:8px">Legends of Elohim <span style="margin-left:8px;padding:2px 8px;border:1px solid rgba(255,140,0,.7);border-radius:999px;letter-spacing:.16em;color:#fff;background:rgba(212,0,85,.35)">Pre-alpha</span></div>
  <div style="font:800 44px/1 Outfit,sans-serif;letter-spacing:.02em;margin-bottom:6px;background:linear-gradient(135deg,#D40055,#FF8C00);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent">APEX ELOHIM</div>
  <div style="font:500 12px 'JetBrains Mono',monospace;color:rgba(208,188,255,.75);margin-bottom:26px">Ironport &middot; Lake Michigan coast &middot; 150 km&sup2;</div>
  <div id="mapCards"></div>
  <div style="margin-top:22px;font:600 10px Outfit,sans-serif;opacity:.55;letter-spacing:.28em;text-transform:uppercase">DRAG TO ORBIT &nbsp;&middot;&nbsp; SCROLL TO ZOOM</div>`;
document.body.appendChild(menuEl);
const MAP_EVENTS: { id: string; tag: string; name: string; sub: string; color: string; act: () => void }[] = [
  { id: 'city', tag: 'CITY CIRCUIT', name: 'Ironport Grand Circuit', sub: '4.2 km · 13 corners · downtown streets', color: '#FF8C00', act: () => openBrief('city') },
  { id: 'cliff', tag: 'ROAD COURSE', name: 'Great Lakes Cliff Raceway', sub: '9.8 km · tunnel · 135 m lake-view climb', color: '#00DAF3', act: () => openBrief('cliff') },
  { id: 'rally', tag: 'RALLY STAGE', name: 'Pinewood Rally Stage', sub: '11 km · gravel · forest trail', color: '#D40055', act: () => openBrief('rally') },
  { id: 'free', tag: 'FREE ROAM', name: 'Explore the region', sub: 'Port Halcyon · dunes · harbor · freeway', color: '#D0BCFF', act: () => openBrief('free') },
];
const cardsEl = menuEl.querySelector('#mapCards') as HTMLElement;
for (const ev of MAP_EVENTS) {
  const b = document.createElement('div');
  b.style.cssText = `padding:14px 18px;margin-bottom:10px;border-radius:24px;border:1px solid rgba(255,255,255,.10);background:rgba(26,0,38,.62);backdrop-filter:blur(14px);cursor:pointer;transition:transform .2s cubic-bezier(.2,0,0,1),border-color .2s,box-shadow .2s;box-shadow:0 10px 30px rgba(0,0,0,.35)`;
  const plan = WEATHER_PLAN[ev.id], worst = WEATHERS[worstOf(plan)];
  b.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${ev.color};box-shadow:0 0 10px ${ev.color}"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:${ev.color}">${ev.tag}</span><span style="margin-left:auto;font:600 11px Outfit,sans-serif;letter-spacing:.08em;color:#D0BCFF">${worst.icon} ${worst.temp}&deg;C</span></div><div style="font:600 19px Outfit,sans-serif;margin:5px 0 3px">${ev.name}</div><div style="font:400 12px Inter,sans-serif;color:rgba(255,255,255,.62)">${ev.sub}</div><div style="font:500 11px Inter,sans-serif;color:rgba(208,188,255,.85);margin-top:6px;letter-spacing:.03em">Forecast: ${forecastText(plan)}</div>`;
  b.onmouseenter = () => { if (wxOverride === 'auto') wx.setWeather(worstOf(WEATHER_PLAN[ev.id]), false, true); b.style.transform = 'translateX(8px)'; b.style.borderColor = ev.color; b.style.boxShadow = `0 10px 34px rgba(0,0,0,.45),0 0 22px ${ev.color}55`; };
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
const toggleSettings = (open?: boolean): void => { settingsEl.style.display = (open ?? settingsEl.style.display !== 'block') ? 'block' : 'none'; };
gearBtn.onclick = () => toggleSettings();
(document.getElementById('shClose') as HTMLElement).onclick = () => toggleSettings(false);
const devBox = document.querySelector('.sh-dev') as HTMLDetailsElement;
hud.style.display = 'none';
devBox.addEventListener('toggle', () => { hud.style.display = devBox.open ? 'block' : 'none'; });
function applyMapOffset(): void {
  if (mapMode) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.12, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
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
  free: { view: 'downtown', drive: 'free', tag: 'FREE ROAM', name: 'Explore the region', color: '#D0BCFF', lines: ['150 km² open region', 'Port Halcyon, the dune coast, the harbor and the freeway', 'Drive anywhere'], blurb: 'Start on the coastal highway and go wherever the roads lead.' },
};
const briefEl = document.createElement('div');
briefEl.style.cssText = 'position:fixed;left:44px;bottom:48px;width:420px;display:none;font-family:Inter,sans-serif;color:#fff;padding:22px 24px;background:rgba(26,0,38,.78);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.55);user-select:none';
document.body.appendChild(briefEl);
const countEl = document.createElement('div');
countEl.style.cssText = 'position:fixed;left:0;right:0;top:30%;text-align:center;font:800 130px Outfit,sans-serif;color:#fff;text-shadow:0 0 50px rgba(212,0,85,.9),0 0 90px rgba(255,140,0,.5);display:none;pointer-events:none;letter-spacing:.04em';
document.body.appendChild(countEl);
function hideBrief(): void { briefEl.style.display = 'none'; }
function openBrief(id: string): void {
  const b = BRIEFS[id];
  if (wxOverride === 'auto') wx.setWeather(worstOf(WEATHER_PLAN[id]), false, true);      // the map shows the race's worst weather as the forecast
  preset(b.view, true);       // stays on the map screen: dark backdrop, faded edges, no sky
  const cc = id === 'free' ? new THREE.Vector3(-4600, 0, 1800) : centroid(meta.circuits[b.drive]);
  const hh = id === 'city' ? 1500 : id === 'cliff' ? 5200 : id === 'rally' ? 6200 : 6800;
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
  let P = densify(c, 6);
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
  { const rm = accMeshTex(roadAcc, gameTex('asphalt_highway'), 0.8, -3); furnitureGroup.add(rm); driveSurfaces.push(rm); }
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
  const chk = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), stdMat(0xffffff, 0.6), 2 * Math.floor(2 * HALF / 1.1));
  let ci = 0;
  for (let a = 0; a < Math.floor(2 * HALF / 1.1); a++) for (let b = 0; b < 2; b++) {
    const lx = (a - Math.floor(HALF / 1.1)) * 1.1, lz = b * 1.1;
    const x = g0.x + (-gz) * lx + gx * lz, z = g0.z + gx * lx + gz * lz;
    m4.makeTranslation(x, hAt(x, z) * exag + 0.14, z);
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
  furnitureGroup.add(trackKit.group);
  const gridQuad = new THREE.Mesh(new THREE.PlaneGeometry(26, 10.5), new THREE.MeshStandardMaterial({ map: gameTex('grid', false), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  gridQuad.rotation.order = 'YXZ';
  gridQuad.rotation.x = -Math.PI / 2;
  gridQuad.rotation.y = -Math.atan2(gz, gx);
  gridQuad.position.set(g0.x - gx * 15, hAt(g0.x - gx * 15, g0.z - gz * 15) * exag + 0.4, g0.z - gz * 15);
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
}

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
  return `LAP ${L.laps + (L.started ? 1 : 0)} &nbsp; ${cur}` + (L.last !== null ? ` &nbsp; last ${fmtT(L.last)}` : '') + (L.best !== null ? ` &nbsp; best ${fmtT(L.best)}` : '') + (L.splits.length ? ` &nbsp; S${L.splits.length} ${fmtT(L.splits[L.splits.length - 1])}` : '') + (L.off ? ' &nbsp; <span style="color:#ffb36a">off the street</span>' : '');
}

// ---------- driving ----------
const keys = new Set<string>();
interface DriveState { lock: number; camDist: number; camH: number; camView: number; circuitId: string; pos: THREE.Vector3; yaw: number; sp: number; lat: number; steer: number; car: THREE.Group; startPos: THREE.Vector3; startYaw: number; camPos: THREE.Vector3; hit: number; ps: CarState }
let driving: DriveState | null = null;
// racing line and assists (Settings > Driving)
const assist = { line: true, brake: true, steer: true };
try { const a = JSON.parse(localStorage.getItem('apex.assist') ?? 'null'); if (a) Object.assign(assist, a); } catch { /* storage blocked */ }
let racingLine: RacingLine | null = null, lineMesh: THREE.Mesh | null = null, assistBrakeShown = 0;
function buildRacingLine(id: string): void {
  if (lineMesh) { scene.remove(lineMesh); lineMesh.geometry.dispose(); lineMesh = null; }
  racingLine = null;
  if (id === 'free') return;
  const city = id === 'ironport_grand_circuit';
  const pts = city ? cityPath : meta.circuits[id] ? densify(meta.circuits[id], 6) : [];
  if (pts.length < 8) return;
  const cg = SOV_SPEC.corneringGrip * 1.18 * 9.81;
  racingLine = new RacingLine(pts, city, { aLat: cg * 0.66, aBrake: 1.1 * SOV_SPEC.corneringGrip * 9.81 * 0.6, vmax: 80 });
  lineMesh = racingLine.mesh((x, z) => groundH(x, z) + 0.06);
  lineMesh.visible = assist.line;
  scene.add(lineMesh);
}
function saveAssist(): void { try { localStorage.setItem('apex.assist', JSON.stringify(assist)); } catch { /* storage blocked */ } if (lineMesh) lineMesh.visible = assist.line; }
const driveHud = document.createElement('div');
driveHud.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:10px 22px;background:rgba(26,0,38,.72);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.14);border-radius:20px;font:700 15px JetBrains Mono,monospace;color:#fff;display:none;text-align:center;pointer-events:none';
document.body.appendChild(driveHud);

// ---------- the Sovereign's vehicle spec and the ground it drives on ----------
// suspension tunes: spring rate (N/m), damper (N·s/m), anti-roll, travel (m). Damping ratio is 0.7 to 0.95 so the body settles and does not ring.
const SUSPENSION_TUNES: Record<string, { springRateNm: number; damperNsM: number; antiRollFactor: number; travelM: number; rideHeightM: number }> = {
  comfort: { springRateNm: 52000, damperNsM: 6600, antiRollFactor: 0.6, travelM: 0.16, rideHeightM: 0.14 },
  sport: { springRateNm: 68000, damperNsM: 8600, antiRollFactor: 0.85, travelM: 0.13, rideHeightM: 0.12 },
  track: { springRateNm: 92000, damperNsM: 11800, antiRollFactor: 1.0, travelM: 0.09, rideHeightM: 0.09 },
  rally: { springRateNm: 40000, damperNsM: 5800, antiRollFactor: 0.5, travelM: 0.24, rideHeightM: 0.2 },
};
let suspTune = 'sport';
try { const t = localStorage.getItem('apex.susp'); if (t && SUSPENSION_TUNES[t]) suspTune = t; } catch { /* storage blocked */ }
let SOV_SPEC = CARS.kestrel;
function applySuspension(name: string): void {
  suspTune = name;
  SOV_SPEC = { ...CARS.kestrel, suspension: { ...CARS.kestrel.suspension, ...SUSPENSION_TUNES[name] } };
  try { localStorage.setItem('apex.susp', name); } catch { /* storage blocked */ }
}
applySuspension(suspTune);
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
function surfaceTop(x: number, z: number): number {
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
    if (y > top) top = y;
  }
  return top;
}
function groundH(x: number, z: number): number {
  return Math.max(meshH(x, z), surfaceTop(x, z));
}
let surfIdx = 0;
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

function makeCar(): THREE.Group {
  const holder = new THREE.Group();
  const rig = makeSovereign();
  holder.add(rig.group);
  holder.userData.update = rig.update;
  // swap in the scanned Sovereign (Hunyuan mesh painted from the turntable) once it has loaded; the stand-in covers the wait
  loadSovereignScan().then((r) => { rig.group.visible = false; holder.add(r.group); holder.userData.update = r.update; holder.userData.panels = r.panels; }).catch((e) => console.warn('scan car failed', e));
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

// The barriers stand 6.9 m from the centre line (inner face about 6.6 m). The car is about 1 m half-width plus a margin.
const BARRIER_LIMIT = 5.45;
let barrierIdx = 0;
function barrierCollide(s: DriveState): boolean {
  const P = cityPath, n = P.length;
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
  // distance to the centre line (clamped to each segment, so outside corners are held by the vertex): the barrier is a fixed corridor
  let nd = 1e18, nx = 0, nz = 0;
  for (let j = bi - 3; j <= bi + 2; j++) {
    const a = P[(j + n) % n], b = P[(j + 1 + n) % n];
    const tx = b.x - a.x, tz = b.z - a.z, L2 = tx * tx + tz * tz || 1;
    const t = Math.max(0, Math.min(1, ((s.pos.x - a.x) * tx + (s.pos.z - a.z) * tz) / L2));
    const qx = a.x + tx * t, qz = a.z + tz * t;
    const d = Math.hypot(s.pos.x - qx, s.pos.z - qz);
    if (d < nd) { nd = d; nx = s.pos.x - qx; nz = s.pos.z - qz; }
  }
  if (nd > BARRIER_LIMIT && nd < 40) {
    const ux = nx / nd, uz = nz / nd;
    s.pos.x -= ux * (nd - BARRIER_LIMIT);
    s.pos.z -= uz * (nd - BARRIER_LIMIT);
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const vx = fx * s.sp + Math.cos(s.yaw) * s.lat, vz = fz * s.sp - Math.sin(s.yaw) * s.lat;
    const into = Math.max(0, vx * ux + vz * uz);       // speed towards the wall
    s.sp *= Math.max(0.45, 1 - into * 0.035);
    s.lat *= -0.2;
    return true;
  }
  return false;
}

function startDrive(id: string): void {
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
  if (free) { p = hw[hw.length - 22]; q = hw[hw.length - 26]; }
  else { p = city && cn > 8 ? [cp[cn - 8].x, cp[cn - 8].z] : c!.xz[0]; q = city && cn > 8 ? [cp[cn - 7].x, cp[cn - 7].z] : c!.xz[4]; }
  const yaw = Math.atan2(q[0] - p[0], q[1] - p[1]);
  const car = driving?.car ?? prewarmCar ?? makeCar();
  prewarmCar = null;
  car.position.set(0, 0, 0);
  if (!car.parent) scene.add(car);
  const y = (free ? hAt(p[0], p[1]) : city && cn > 8 ? cp[cn - 8].y : c!.y ? c!.y[0] : hAt(p[0], p[1])) * exag;
  driving = { lock: 3.6, camDist: 5.8, camH: 1.6, camView: 0, circuitId: id, pos: new THREE.Vector3(p[0], y, p[1]), yaw, sp: 0, lat: 0, steer: 0, car, startPos: new THREE.Vector3(p[0], y, p[1]), startYaw: yaw, camPos: new THREE.Vector3(p[0] - Math.sin(yaw) * 10, y + 4, p[1] - Math.cos(yaw) * 10), hit: 0, ps: createCarState(p[0], y, p[1], yaw) };
  carY = -1e9; carPitch = carRoll = slopePS = slopeRS = 0; setMusicDuck(0.4); gameAudio.ensureStarted(); gameAudio.setPaused(false);
  wx.ensureAudio(); wx.setAudioLevel(engVol); wx.setPaused(false);
  {
    const key = id === 'ironport_grand_circuit' ? 'city' : id === 'great_lakes_cliff_raceway' ? 'cliff' : id === 'pinewood_rally_stage' ? 'rally' : 'free';
    wxPlan = WEATHER_PLAN[key]; wxPlanT = 0; wxPlanI = 0;
    wx.setWeather(wxOverride === 'auto' ? wxPlan[0].w : wxOverride, false, true);
  }
  camera.near = 1.0; camera.far = 22000; camera.updateProjectionMatrix();      // the map view uses a 5 m near plane, which cut the back of the car off at chase distance
  lapReset();
  buildRacingLine(id);
  replay.clear(); driveClock = 0; camYawOff = 0; camPitchOff = 0; camZoom = 1;
  controls.enabled = false;
  circuitGroup.visible = false;      // the review ribbons are drawn wider than the road
  driveHud.style.display = 'block';
}
function stopDrive(): void {
  if (!driving) return;
  if (lineMesh) { scene.remove(lineMesh); lineMesh.geometry.dispose(); lineMesh = null; }
  racingLine = null;
  scene.remove(driving.car);
  driving = null;
  gameAudio.setPaused(true); setMusicDuck(1); wx.setPaused(true); wxPlan = null; if (wxOverride === 'auto') wx.setWeather('partly', false, true);
  camera.near = 5; camera.far = 80000; camera.updateProjectionMatrix();
  controls.enabled = true;
  circuitGroup.visible = (document.getElementById('tCirc') as HTMLInputElement).checked;
  driveHud.style.display = 'none';
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
    const gripNow = Math.max(0.3, wx.cur.grip * (1 - 0.82 * hydro));
    if (Math.abs(off.lat) < 9) {
      if (assist.brake && v > 9) { const need = racingLine.demand(li, v, gripNow), cap = 9.0 * gripNow; assistBrake = Math.min(1, Math.max(0, (need - cap * 0.5) / (cap * 0.4))) * 0.9; }
      if (assist.steer && v > 6) assistSteer = Math.max(-0.6, Math.min(0.6, off.head * 1.3 - off.lat * 0.06)) * 0.65;
    }
  }
  assistBrakeShown = assistBrake;
  const thrWant = locked ? 0 : Math.max(kUp ? 1 : 0, pad.throttle) * (1 - assistBrake), brkWant = locked ? 1 : Math.max(kDown ? 1 : 0, pad.brake, assistBrake);
  pedalT += (thrWant - pedalT) * Math.min(1, dt * (thrWant > pedalT ? 3.4 : 8));
  pedalB += (brkWant - pedalB) * Math.min(1, dt * (brkWant > pedalB ? 2.6 : 9));
  const input: CarInput = { throttle: locked ? 0 : pedalT, brake: locked ? 1 : pedalB, steer: (() => { const p = Math.abs(pad.steer) > Math.abs(kSteer) ? pad.steer : kSteer; return Math.max(-1, Math.min(1, p + assistSteer * (1 - Math.abs(p)))); })(), handbrake: hand };
  // standing water under the wheels: deep puddles at speed lift the tyres off the tarmac (aquaplaning): grip collapses until the car slows or leaves the water
  let pudAvg = 0;
  {
    const sy0 = Math.sin(ps.yaw), cy0 = Math.cos(ps.yaw);
    for (const [ox, oz] of [[0.81, 1.48], [-0.81, 1.48], [0.81, -1.48], [-0.81, -1.48]]) pudAvg += puddleDepth(ps.pos.x + cy0 * ox + sy0 * oz, ps.pos.z - sy0 * ox + cy0 * oz, poolLevel) / 4;
    if (surfaceAtXZ(ps.pos.x, ps.pos.z) !== 'asphalt') pudAvg = 0;
  }
  {
    const spdA = Math.abs(ps.forwardSpeed);
    const target = pudAvg > 0.25 && poolLevel > 0.08 ? Math.min(1, Math.max(0, (spdA - (31 - 13 * pudAvg)) / 9)) * Math.min(1, pudAvg * 1.3) : 0;
    hydro += (target - hydro) * Math.min(1, dt * (target > hydro ? 5 : 2.2));
    if (hydro > 0.3) driveInput.rumble(0, 0.35, 60);
  }
  stepCarPhysics(ps, wxGripSpec ?? SOV_SPEC, input, dt, groundH, surfaceAtXZ, []);
  if (pudAvg > 0.3) { const k = 1 - dt * 0.3 * pudAvg * Math.min(1, Math.abs(ps.forwardSpeed) / 25); ps.vel.x *= k; ps.vel.z *= k; }       // the water drags at the car
  // reverse: hold brake at a standstill and the car backs out right away (Forza style), with a sensible top speed in reverse
  if (down && !up && !locked) {
    if (ps.forwardSpeed < 1.5 && ps.forwardSpeed > -13) { const a = 5.2 * dt; ps.vel.x -= Math.sin(ps.yaw) * a; ps.vel.z -= Math.cos(ps.yaw) * a; }
    if (ps.forwardSpeed < -13) { const k = 13 / -ps.forwardSpeed; ps.vel.multiplyScalar(k); }
  }
  gameAudio.update(ps, SOV_SPEC, input.throttle);          // buildings and barriers are handled below on the real footprints
  s.pos.set(ps.pos.x, ps.pos.y, ps.pos.z);
  s.yaw = ps.yaw;
  s.sp = ps.forwardSpeed; s.lat = ps.lateralSpeed; s.steer = ps.steerInputSmoothed;
  let bumped = false;
  if (collide(s)) { s.sp *= 0.55; s.lat *= 0.5; s.hit = 0.4; bumped = true; }
  if (s.circuitId === 'ironport_grand_circuit' && barrierCollide(s)) { s.hit = 0.4; bumped = true; }
  if (bumped) driveInput.rumble(0.9, 0.7, 220);
  else if (ps.isDrifting) driveInput.rumble(0.0, 0.25, 60);
  s.hit = Math.max(0, s.hit - dt);
  const lim = meta.width * meta.mpp / 2 - 80, limz = meta.height * meta.mpp / 2 - 80;
  s.pos.x = Math.max(-lim, Math.min(lim, s.pos.x));
  s.pos.z = Math.max(-limz, Math.min(limz, s.pos.z));
  if (hAt(s.pos.x, s.pos.z) < -1.5) { s.pos.copy(s.startPos); s.yaw = s.startYaw; s.sp = 0; s.lat = 0; bumped = true; }
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
  (s.car.userData.update as ((sp: number, st: number, dt: number) => void) | undefined)?.(s.sp, ps.steerAngle, dt);
  // spray and mist off the four tyres: more from deep water, more at speed, a little from any wet road
  if (!ps.isAirborne && !locked) {
    const sy1 = Math.sin(s.yaw), cy1 = Math.cos(s.yaw), spdH = Math.hypot(ps.vel.x, ps.vel.z), road = surfaceAtXZ(s.pos.x, s.pos.z) === 'asphalt';
    const wetBase = road ? wx.cur.wet * 0.42 : wx.cur.wet * 0.12;
    for (const [ox, oz, bigK] of [[0.81, 1.48, 0.0], [-0.81, 1.48, 0.0], [0.82, -1.59, 0.4], [-0.82, -1.59, 0.4]]) {
      const x = s.pos.x + cy1 * ox + sy1 * oz, z = s.pos.z - sy1 * ox + cy1 * oz;
      const pd = road ? puddleDepth(x, z, poolLevel) : 0;
      spray.wheel(dt, x, groundH(x, z), z, ps.vel.x, ps.vel.z, spdH, Math.max(wetBase, pd), Math.min(1.4, pd + bigK * (pd > 0.1 ? 1 : 0.4)));
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
    const ch = meshH(s.camPos.x, s.camPos.z) + 0.9;
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
  driveHud.innerHTML = lapTxt + `${Math.round(ps.speedMps * 3.6)} km/h &nbsp;·&nbsp; ${ps.gear < 0 ? 'R' : ps.gear === 0 ? 'N' : ps.gear} &nbsp;·&nbsp; ${Math.round(ps.rpm)} rpm` + (ps.isDrifting ? ' &nbsp;·&nbsp; <span style="color:#FF8C00">drift</span>' : '') + (hydro > 0.3 ? ' &nbsp;·&nbsp; <span style="color:#00DAF3">aquaplaning</span>' : '') + (assistBrakeShown > 0.25 ? ' &nbsp;·&nbsp; <span style="color:#FF8C00">brake assist</span>' : '') + (performance.now() - driveViewShown < 1800 ? ` &nbsp;·&nbsp; <span style="color:#00DAF3">${VIEW_NAMES[s.camView]}</span>` : '') + (s.hit > 0 ? ' &nbsp;·&nbsp; <span style="color:#D40055">crash</span>' : '') + '<br><span style="font:500 11px Inter,sans-serif;opacity:.7;letter-spacing:.04em">' + (driveInput.touchMode ? 'drag the wheel to steer · drag the view to look around' : driveInput.axes.active ? 'RT throttle · LT brake · stick steer · A handbrake · Y camera · X replay · Back reset · Start exit' : 'W/S throttle and brake · A/D steer · Space handbrake · drag mouse to look around · B look back · C or 1-5 camera (chase, far, hood, dash, driver) · P replay · R reset · Esc exit') + '</span>';
}
addEventListener('keydown', (e) => {
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
// after a replay the chase camera starts from wherever the replay left it; snap it behind the car
function s2cam(): void { if (driving) driving.camPos.copy(camera.position); }

// ---------- boot ----------
async function boot(): Promise<void> {
  const [m, buf] = await Promise.all([
    fetch(BASE + 'region.json').then((r) => r.json()) as Promise<RegionMeta>,
    fetch(BASE + 'height.f32').then((r) => r.arrayBuffer()),
  ]);
  meta = m;
  heights = new Float32Array(buf);
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
  (window as any).regionViewer = { debug: () => ({ cityItems, cityPath }), wx, scene, terrain: () => terrain, furniture: () => furnitureGroup, groundH, meshH, lap: () => lap, preset, startFly, stopFly, hAt, camera, controls, meta, csm, renderer, warmShaders, cam: (x?: number, y?: number, z?: number, tx?: number, ty?: number, tz?: number) => { dbgCam = x === undefined ? null : { pos: new THREE.Vector3(x, y!, z!), at: new THREE.Vector3(tx!, ty!, tz!) }; }, setPool: (v: number) => { poolLevel = v; }, hydro: () => hydro, startDrive, stopDrive, keys, drive: () => driving };
}

document.querySelectorAll<HTMLButtonElement>('button[data-cam]').forEach((b) => b.addEventListener('click', () => preset(b.dataset.cam!)));
document.getElementById('fly')!.addEventListener('click', () => startFly('great_lakes_cliff_raceway'));
document.getElementById('flycity')!.addEventListener('click', () => startFly('ironport_grand_circuit'));
document.getElementById('stop')!.addEventListener('click', () => { stopFly(); stopDrive(); });
document.getElementById('drivecity')!.addEventListener('click', () => startDrive('ironport_grand_circuit'));
document.getElementById('drivecliff')!.addEventListener('click', () => startDrive('great_lakes_cliff_raceway'));
document.getElementById('driverally')!.addEventListener('click', () => startDrive('pinewood_rally_stage'));
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
  const shSel = document.getElementById('shadowSel') as HTMLSelectElement;
  shSel.value = SHADOWS;
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
(document.getElementById('susp') as HTMLSelectElement).value = suspTune;
(document.getElementById('susp') as HTMLSelectElement).addEventListener('change', (e) => applySuspension((e.target as HTMLSelectElement).value));
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
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; applyMapOffset();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  driveInput.tick();
  if (grassField && !mapMode) { grassField.setWind(0.3 + wx.cur.wind * 0.9 + wx.cur.rain * 0.3); grassField.setWet(wx.cur.wet); grassField.update(dt, camera.position); }
  if (treeFields.length && !mapMode) for (const tf of treeFields) { tf.setWind(0.25 + wx.cur.rain * 0.5 + wx.cur.cloudDark * 0.4); tf.update(dt, camera.position); }
  stepFly(dt);
  stepTween(dt);
  stepWeather(dt);
  for (const l of cloudLayers) { l.tex.offset.x += l.vx * dt; l.tex.offset.y += l.vz * dt; }
  if (replay.active) replay.step(dt); else stepDrive(dt);
  updateProbe(dt);
  if (!fly && !driving) controls.update();
  {
    const ft = driving ? driving.pos : controls.target;
    sun.target.position.set(ft.x, ft.y, ft.z);
    sun.position.set(ft.x + sunDir.x * 3000, ft.y + sunDir.y * 3000, ft.z + sunDir.z * 3000);
    if (csm) {
      camera.updateMatrixWorld();
      csm.lightDirection.copy(sunDir).negate();
      csm.update();
      for (let i = 0; i < csm.lights.length; i++) { const l = csm.lights[i]; l.intensity = sun.intensity; l.color.copy(sun.color); l.castShadow = csmCast[i]; }        // constant: flipping it recompiles every shader
      csmSweep();
    } else {
      sun.castShadow = camera.position.distanceTo(ft) < 900;
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
  if (composer && fxOn) composer.render(); else renderer.render(scene, camera);
  if (meta) {
    const e = hAt(camera.position.x, camera.position.z);
    hud.innerHTML = `camera ${Math.round(camera.position.x)}, ${Math.round(camera.position.z)}<br>alt over ground ${Math.round(camera.position.y - e * exag)} m<br>ground ${e.toFixed(0)} m above lake`;
  }
  requestAnimationFrame(frame);
}
boot().catch((e) => { msg.textContent = 'failed: ' + e; console.error(e); });
requestAnimationFrame(frame);
