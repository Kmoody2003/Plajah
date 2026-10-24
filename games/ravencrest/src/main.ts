import * as THREE from 'three/webgpu';
import { fog, densityFogFactor, exponentialHeightFogFactor, float, max, uniform } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArtAnchor, ARRIVAL_SHOT } from './artAnchor';
import { buildArrival } from './arrival';
import { buildCourtyard } from './courtyard';
import { buildGrandHall } from './grandHall';
import { buildViaduct } from './viaduct';
import { moonSky } from './sky';
import { buildPost } from './post';
import { loadJack, prefetchHero, Character, type Hero } from './character';
import { Difficulty } from './mobs';
import { FxBudget } from './vfx';
import { CollisionWorld } from './collision';
import { setTextureTier, setReflectEnabled, rainAmount } from './materials';
import { PlayerController } from './player';
import { LightPool } from './lights';
import { mergeStatic } from './optimize';
import { GameAudio } from './audio';
import { batchFlames } from './fx';
import { loadFilms, buildBillboards, hangPaintings, focusShowing, FilmCard, Showing } from './cinema';
import { Game, Placement, tuning } from './game';
import { Looks } from './looks';
import { Sfx } from './sfx';
import { Weather } from './weather';
import { Nightmare } from './nightmare';
import { Daybreak } from './daybreak';
import { BridgeBattle } from './bridgeBattle';
import { LensSplatter } from './lensSplatter';
import { buildMist } from './mist';
import { Forest, uLeafDay } from './forest';
import { Flock } from './birds';
import { GroundFog } from './fog';
import { buildRoadObstacles } from './roadObstacles';
import { preloadAngel } from './angel';
import { XRPlay } from './xr';
import { buildFlowers } from './flowers';
import { ExtraInput } from './input';
import { ComboComic } from './comic';
import { buildGrass } from './grass';
import { wind, DynWorld, type DynOpts } from './physics';
import { gustUniform } from './foliage';
import { moatUniforms, addMoatRipple } from './materials';

const params = new URLSearchParams(location.search);
// ── Loading screen (index.html #menuLoad): a phase line plus a bar fed by every three.js loader ──
const loadEl = document.getElementById('menuLoad');
const loadMsg = loadEl?.querySelector('span') ?? null;
const loadBar = loadEl?.querySelector('i') as HTMLElement | null;
let loadPhase = 0;   // 0..1 of the start-up steps before assets stream
function loadStep(msg: string, frac: number) { if (loadMsg) loadMsg.textContent = msg; loadPhase = frac; paintLoad(); }
let assetsDone = 0, assetsTotal = 0, worldLive = false;
function paintLoad() {
  if (!loadBar) return;
  const assets = assetsTotal ? assetsDone / assetsTotal : 0;
  // The world being playable is the first 60%; monsters and props streaming in fill the rest.
  const f = worldLive ? 0.6 + 0.4 * assets : 0.6 * Math.max(loadPhase, loadPhase * 0.7 + assets * 0.3);
  loadBar.style.width = `${Math.round(Math.min(1, f) * 100)}%`;
  if (worldLive && loadMsg) loadMsg.textContent = assetsDone >= assetsTotal ? 'Ravencrest is ready' : `The night is still gathering · ${assetsDone} / ${assetsTotal}`;
  // Hide once everything queued has landed and nothing new started for a moment.
  if (worldLive && assetsDone >= assetsTotal) { const n = assetsTotal; setTimeout(() => { if (assetsDone >= assetsTotal && assetsTotal === n) loadEl?.classList.add('done'); }, 2500); }
  else loadEl?.classList.remove('done');
}
THREE.DefaultLoadingManager.onStart = (_u, done, total) => { assetsDone = done; assetsTotal = total; paintLoad(); };
THREE.DefaultLoadingManager.onProgress = (_u, done, total) => { assetsDone = done; assetsTotal = total; paintLoad(); };
// The chosen hero downloads first, ahead of the world (index.html already knows the pick).
prefetchHero(((window as unknown as { __heroPick?: Hero }).__heroPick) === 'elise' ? 'elise' : 'jack');
loadStep('Waking the graphics card', 0.1);
if (params.has('debug')) (THREE.Node as unknown as { captureStackTrace: boolean }).captureStackTrace = true;
// Quality preset: integrated GPUs (Windows WebGPU ignores powerPreference and often picks the
// iGPU) get 'medium'; discrete GPUs get 'high'. Override with ?q=low|medium|high.
const adapterInfo = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }).then((a) => (a as unknown as { info?: { vendor?: string; architecture?: string } } | null)?.info).catch(() => undefined);
const integrated = !adapterInfo || /intel|qualcomm|apple|arm/i.test(adapterInfo.vendor ?? '') || /xe-|gen-|integrated/i.test(adapterInfo.architecture ?? '');
// Plajah's Windows app hosts the web build in WebView2 launched with --force_high_performance_gpu,
// so there the game gets the discrete GPU and the full-fat 'ultra' tier.
// WebView2 exposes chrome.webview on the top frame only; the game runs in a same-origin iframe
// inside Plajah, so check the top window too.
const inDesktopApp = (() => {
  const has = (w: Window | null) => { try { return !!(w as unknown as { chrome?: { webview?: unknown } })?.chrome?.webview; } catch { return false; } };
  return has(window) || has(window.top);
})();
// Phones, tablets and Plajah's Android app (Capacitor WebView). Tier by GPU, not just "it's a
// phone": recent Adreno (7xx/8xx), Apple and Mali-G7xx/Immortalis get 'medium'; the rest 'low'.
// Everyone then scales: the dynamic resolution climbs while there's headroom and drops under load.
const inAndroidApp = !!(window as unknown as { Capacitor?: unknown }).Capacitor || /; wv\)/.test(navigator.userAgent);
// Not "has a touchscreen": touch laptops (like the dev machine) report 10 touch points but are
// driven by a mouse. A phone/tablet is a mobile UA, an iPad (Mac UA + touch), or a device whose
// only pointer is a finger.
const isMobile = inAndroidApp || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
const gpuArch = `${adapterInfo?.vendor ?? ''} ${adapterInfo?.architecture ?? ''}`.toLowerCase();
const strongMobile = /adreno-[78]|adreno-[78]\d\d|apple|immortalis|mali-g7/.test(gpuArch);
// Desktop: Plajah's Windows app → the RTX 4070 ('ultra'); browsers on the Intel Arc iGPU →
// 'medium' (the main target); discrete Nvidia/AMD in a browser → 'high'.
// After a graphics-card reset (device lost, usually out of video memory) the game reloads once a tier lower.
const lostTier = (() => { try { return sessionStorage.getItem('ravencrest.lostTier'); } catch { return null; } })();
const quality = (params.get('q') ?? lostTier ?? (isMobile ? (strongMobile ? 'medium' : 'low') : inDesktopApp ? 'ultra' : integrated ? 'medium' : 'high')) as 'low' | 'medium' | 'high' | 'ultra';
/** Frame-time target for the dynamic resolution (ms): 30 fps on phones, 60 elsewhere. */
const frameTarget = isMobile ? 33.3 : 16.7;
const Q = {
  // res: internal render height (FSR1 upscales to the display). Intel Arc iGPU = 'medium' = the 60 fps baseline.
  low:    { pr: 1.0, res: isMobile ? 480 : 540, resMin: isMobile ? 300 : 400, ssr: false, ssrScale: 0.5, shadow: 0, pool: isMobile ? 3 : 4 },
  // Moon shadow map costs ~6 ms CPU/frame in r184 for little visible gain in this backlit
  // night scene, so the iGPU baseline uses a contact shadow under Jack instead.
  medium: { pr: 1.0, res: 720, resMin: 480, ssr: false, ssrScale: 0.5, shadow: 0, pool: 4 },
  high:   { pr: Math.min(devicePixelRatio, 1.5), res: 1080, resMin: 720, ssr: true, ssrScale: 0.5, shadow: 2048, pool: 10 },
  // Desktop app on a discrete GPU: native-res internal render, SSR, 4k shadows, big light pool.
  ultra:  { pr: Math.min(devicePixelRatio, 2), res: 2160, resMin: 900, ssr: true, ssrScale: 0.75, shadow: 4096, pool: 14 },
}[quality];
console.info(`[ravencrest] GPU ${adapterInfo?.vendor ?? '?'} ${adapterInfo?.architecture ?? ''} · ${inDesktopApp ? 'desktop app' : 'browser'} → quality ${quality}`);
setTextureTier(quality === 'high' || quality === 'ultra' ? '2k' : '1k');
// Exterior + courtyard materials only get SSR outputs when the exterior pass runs SSR.
const exteriorSSR = (params.get('ssr') === '1' || Q.ssr) && params.get('ssr') !== '0';
setReflectEnabled(exteriorSSR);
const view = document.getElementById('view')!;
const refImg = document.getElementById('ref') as HTMLImageElement;
const review = document.getElementById('review')!;
const refOpacity = document.getElementById('refOpacity') as HTMLInputElement;
const refSplit = document.getElementById('refSplit') as HTMLInputElement;
const fade = document.getElementById('fade')!;
const prompt = document.getElementById('prompt')!;

// Reversed float depth: near-uniform precision out to the far plane. With the old 0.1 m-6 km
// 24-bit range, close layers (road over terrain, puddles, trim, banners and frames on walls)
// z-fought and flickered at a distance.
// Headsets (Meta Quest browser, Android XR, Pico, Wolvic): WebXR runs on the renderer's WebGL backend.
const xrDevice = params.has('xr') || /OculusBrowser|Quest|Pico|Wolvic|Android XR|XR Browser/i.test(navigator.userAgent);
const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', trackTimestamp: params.has('prof'), reversedDepthBuffer: params.get('rdepth') !== '0' && !xrDevice, forceWebGL: xrDevice });
if (xrDevice) renderer.xr.enabled = true;
await renderer.init();
const TIER_DOWN: Record<string, string> = { ultra: 'high', high: 'medium', medium: 'low', low: 'low' };
(renderer as unknown as { onDeviceLost: (info: { message?: string; reason?: string }) => void }).onDeviceLost = (info) => {
  console.error('[ravencrest] graphics device lost', info);
  let retried = false;
  try { retried = sessionStorage.getItem('ravencrest.lostRetried') === '1'; } catch { /* */ }
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:#000d;color:#e8c690;font:14px Georgia,serif;letter-spacing:.2em;text-align:center;padding:24px';
  msg.textContent = retried
    ? 'The graphics card reset again. Close other tabs or games and reload to try once more.'
    : 'The graphics card ran out of memory — restarting Ravencrest at lighter settings…';
  document.body.appendChild(msg);
  if (retried) return;
  try { sessionStorage.setItem('ravencrest.lostRetried', '1'); sessionStorage.setItem('ravencrest.lostTier', TIER_DOWN[quality] ?? 'low'); } catch { /* */ }
  setTimeout(() => location.reload(), 1800);
};
loadStep('Raising the road and the castle', 0.3);
// Display buffer at native (capped) density; the scene renders at `internalH` and FSR1
// upscales. Dynamic resolution moves internalH between resMin and the preset height.
const targetRes = Number(params.get('res')) || Q.res;
// Headroom: the dynamic resolution may climb above the tier's default (to the display's own
// height) when the device keeps beating its frame target.
const resMax = Number(params.get('res')) || Math.max(targetRes, Math.min(Math.round(Q.res * 1.5), Math.round(innerHeight * Math.min(devicePixelRatio, 2))));
let internalH = targetRes;
renderer.setPixelRatio(Q.pr);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = Q.shadow > 0 && params.get('shadows') !== '0';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.15, 4000);
camera.rotation.order = 'YXZ';
const postOpts = {
  ssr: (params.get('ssr') === '1' || Q.ssr) && params.get('ssr') !== '0', ssrScale: Q.ssrScale,
  bloom: (params.get('bloom') === '0' ? false : (quality === 'low' || quality === 'medium') ? 'lean' : 'full') as 'full' | 'lean' | false, taa: params.get('taa') !== '0' && !(quality === 'low' && params.get('taa') !== '1'), smaa: params.get('aa') !== '0', upscale: params.get('fsr') !== '0',
};

// ── Level 1: arrival road, moat, gatehouse and the outer bailey ───────────────
const anchor = new ArtAnchor(ARRIVAL_SHOT);
const outside = new THREE.Scene();
Forest.density = isMobile ? (strongMobile ? 0.65 : 0.45) : quality === 'low' ? 0.65 : 1;
if (isMobile) tuning.cullDist = 32;
const world = await buildArrival(anchor, renderer);
loadStep('Lighting the torches', 0.6);
// The deep forest's impostors are baked from the real tree variants once (forest.ts).
world.forest.bake(renderer).catch((e) => console.warn('[ravencrest] forest impostors failed', e));
outside.add(world.group);
const yard = buildCourtyard(world.fortress);
outside.add(yard.group);
const viaduct = buildViaduct(world.fortress, yard.postern.local, world.group.getObjectByName('crag'));
outside.add(viaduct.group);
// Clear crag trees from the viaduct's corridor and the terrace.
world.group.traverse((o) => {
  const inst = o as THREE.InstancedMesh;
  if (!inst.isInstancedMesh) return;
  const a = yard.postern.position, b = viaduct.terrace;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), seg = new THREE.Line3(a.clone().setY(0), b.clone().setY(0)), q = new THREE.Vector3();
  for (let i = 0; i < inst.count; i++) {
    inst.getMatrixAt(i, m); p.setFromMatrixPosition(m);
    seg.closestPointToPoint(p.clone().setY(0), true, q);
    if (q.distanceTo(p.clone().setY(0)) < 16) { m.makeScale(0, 0, 0); inst.setMatrixAt(i, m); }
  }
  inst.instanceMatrix.needsUpdate = true;
});

// ── The Halloween collection: Cinema Mile billboards + hall paintings (cinema.ts) ──
const films = await loadFilms();
loadStep('Hanging the films', 0.85);
const mile = buildBillboards(world.road, films);
outside.add(mile.group);

const moonRadiusDeg = THREE.MathUtils.radToDeg(Math.atan(38 / anchor.focal));
const sky = moonSky(world.moonDir, moonRadiusDeg);
outside.backgroundNode = sky.node;
const moon = new THREE.DirectionalLight(0x8fa8d4, 1.4);
moon.position.copy(world.moonDir).multiplyScalar(300).add(world.gateCentre);
moon.target.position.copy(world.gateCentre).lerp(new THREE.Vector3(), 0.5);
moon.castShadow = renderer.shadowMap.enabled;
if (moon.castShadow) moon.shadow.mapSize.set(Q.shadow, Q.shadow);
const sc = moon.shadow.camera as THREE.OrthographicCamera;
sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 50; sc.far = 800;
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
outside.add(moon, moon.target);
// Cool, shadowless fill from the viewer's side (art's blue-grey wall values).
const fill = new THREE.DirectionalLight(0x6f86ad, 0.45);
fill.position.set(-40, 60, 120);
outside.add(fill);
const hemi = new THREE.HemisphereLight(0x3a4c6c, 0x05070a, 0.55);
outside.add(hemi);
// Reflection environment built from the art's own night: slate sky gradient, a moonlit
// cloud band and the moon itself. (The Poly Haven HDRI has green foliage in it, which
// turned wet asphalt green once the puddles grew.)
{
  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50, 32, 16);
  const cols: number[] = [];
  const pos = skyGeo.attributes.position as THREE.BufferAttribute;
  const top = new THREE.Color(0x0b0f16), hor = new THREE.Color(0x2b3442), below = new THREE.Color(0x05070a);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    const c = y >= 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(below, Math.min(1, -y * 4));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  envScene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.BackSide })));
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(6) }));
  moonDisc.position.copy(world.moonDir).multiplyScalar(45);
  envScene.add(moonDisc);
  const pmrem = new THREE.PMREMGenerator(renderer);
  outside.environment = pmrem.fromScene(envScene, 0.02).texture;
  outside.environmentIntensity = 0.38;
}
// Fog colour/amount are uniforms so the daybreak can lift the murk to a pale morning haze.
const fogColor = uniform(new THREE.Color(0x262f3d)), fogAmount = uniform(1);
outside.fogNode = fog(fogColor, max(densityFogFactor(float(0.0013)), (exponentialHeightFogFactor(float(0.0032), float(2.6)) as ReturnType<typeof float>).mul(0.85)).mul(fogAmount));

// ── Level 2: the Grand Hall ──────────────────────────────────────────────────
const hallScene = new THREE.Scene();
setReflectEnabled(quality !== 'low' && params.get('ssr') !== '0');
const hall = buildGrandHall();
setReflectEnabled(exteriorSSR);
hallScene.add(hall.group);
const showings: Showing[] = [...mile.showings, ...hangPaintings(hall.paintingSlots, films)];
hallScene.backgroundNode = sky.node; // night sky through the open doors
hallScene.fogNode = fog(uniform(new THREE.Color(0x1a1612)), densityFogFactor(float(0.01)));
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  hallScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  hallScene.environmentIntensity = 0.07;
}

interface Level {
  name: string; scene: THREE.Scene; post: ReturnType<typeof buildPost>; collision: CollisionWorld;
  anchor: ArtAnchor; torches: THREE.PointLight[]; flames: THREE.Mesh[];
}
const reviewKey = new THREE.DirectionalLight(0xfff4e8, 0);
// Soft contact shadow under Jack (radial gradient quad), used with or without shadow maps.
const contactShadow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.38)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
})();
const mkLevel = (name: string, scene: THREE.Scene, a: ArtAnchor, torches: THREE.PointLight[], flames: THREE.Mesh[], opts = postOpts): Level => ({
  name, scene, anchor: a, torches, flames, post: buildPost(renderer, scene, camera, opts), collision: new CollisionWorld(scene),
});
const levels = {
  outside: mkLevel('outside', outside, anchor, [...world.torches, ...yard.torches, ...viaduct.torches], [...world.flames, ...yard.flames, ...viaduct.flames]),
  // The hall's polished floor is a signature of the art: SSR on everywhere but 'low'.
  hall: mkLevel('hall', hallScene, hall.anchor, hall.torches, hall.flames, { ...postOpts, ssr: quality !== 'low' && params.get('ssr') !== '0', ssrScale: quality === 'medium' ? 0.35 : postOpts.ssrScale }),
};
levels.outside.collision.rebuild();
levels.hall.collision.rebuild();
// Async props add colliders; rebuild once they've landed.
// Light pools: authored torches/candles become virtual lights; K real lights per level.
const pools = {
  outside: new LightPool(outside, outside, Q.pool, new Set(levels.outside.torches)),
  hall: new LightPool(hallScene, hallScene, Q.pool + 2, new Set(levels.hall.torches)),
};
// All flames → one draw per level (fx.ts batchFlames), then static batching (optimize.ts).
for (const l of [levels.outside, levels.hall]) {
  const fb = batchFlames(l.flames);
  if (fb) l.scene.add(fb);
}
// Dynamic physics: loose-prop worlds per level. The well rope's mesh is built
// in world space, so it joins the scene directly rather than the yard group.
const dynOutside = new DynWorld(levels.outside.collision);
const dynHall = new DynWorld(levels.hall.collision);
yard.ropes.forEach((r) => outside.add(r.mesh));
dynOutside.onImpact = (pos, speed) => {
  const wc = yard.well.mesh.getWorldPosition(new THREE.Vector3());
  if (pos.distanceTo(wc) < 2.1) yard.well.ripple(pos, Math.min(1.4, speed * 0.25));
};
let moatTimer = 3;
// Moving things stay out of static batching: cloth, the well and its rope, effects.
const noMerge = new Set<THREE.Object3D>([
  ...yard.cloth.map((c) => c.mesh), ...hall.cloth.map((c) => c.mesh),
  yard.well.mesh, ...yard.fxObjects, ...yard.ropes.map((r) => r.mesh),
]);
const batchStats = { outside: mergeStatic(outside, noMerge), hall: mergeStatic(hallScene, noMerge) };
console.info('[ravencrest] static batching', batchStats);
// Wreckage on the road: a different spread every load (some, all, or none).
const obstacles = buildRoadObstacles(world, Number(params.get('obstacles')) || Math.random());
outside.add(obstacles.group);
console.info('[ravencrest] road obstacles', obstacles.placed.join(', ') || 'none');
const obstacleFires = obstacles.fires.map((f) => ({ ...f, light: null as ReturnType<typeof pools.outside.addTransient> | null }));
noMerge.add(obstacles.group);           // pieces stay separate: the tank sends them flying
Promise.all([yard.props, viaduct.props, obstacles.props]).then(() => {
  // Loose props leave the yard group (world transform kept) and become bodies.
  yard.loose.forEach((m) => { outside.attach(m); dynOutside.add(m, m.userData.dyn as DynOpts); noMerge.add(m); });
  for (const f of obstacleFires) f.light = pools.outside.addTransient(f.pos.clone().setY(f.pos.y + 1.4), 0xff7a2a, 70, 16);
  yard.group.traverse((o) => { if ((o as THREE.PointLight).isPointLight && !o.name.startsWith('pool')) pools.outside.add(o as THREE.PointLight); });
  noMerge.add(player.object);
  mergeStatic(outside, noMerge);
  levels.outside.collision.rebuild();
});
hall.props.then(() => { noMerge.add(player.object); mergeStatic(hallScene, noMerge); levels.hall.collision.rebuild(); });
let level: Level = levels.outside;

// ── Audio ────────────────────────────────────────────────────────────────────
const audio = new GameAudio();
audio.armOnFirstGesture();
const lastStepPos = new THREE.Vector3();
/** Where the player is, for music zone + footstep surface. */
function place(): { where: 'road' | 'yard' | 'hall' | 'gallery'; surface: 'ASPHALT' | 'STONE' | 'WOOD_ATTIC' | 'SPIRAL_STAIR' } {
  const p = player.object.position;
  if (level === levels.hall) return p.y > 1 ? { where: p.y > 5 ? 'gallery' : 'hall', surface: p.y > 5 ? 'STONE' : 'SPIRAL_STAIR' } : { where: 'hall', surface: 'STONE' };
  const F = world.fortress;
  const rel = p.clone().sub(F.origin);
  const inward = rel.dot(new THREE.Vector3(-Math.sin(F.yaw), 0, -Math.cos(F.yaw))); // metres past the gate face
  if (inward > 0) return { where: 'yard', surface: 'STONE' };
  if (inward > -60 && p.y > 0.1) return { where: 'road', surface: 'WOOD_ATTIC' }; // drawbridge deck
  return { where: 'road', surface: 'ASPHALT' };
}

// ── Player ───────────────────────────────────────────────────────────────────
const player = new PlayerController(renderer.domElement);
let jack: Character | null = null;
/** The HUD name card (the Game is created further down; startHero can run before it exists). */
let heroName = 'Jack Thorne';
let gameRef: Game | null = null;
function startHero(hero: Hero) {
  heroName = hero === 'elise' ? 'Elise Carter' : 'Jack Thorne';
  gameRef?.setHeroName(heroName);
  loadJack(hero).then((c) => { jack = c; player.character = c; player.object.add(c.root); })
    .catch((e) => console.error(`[ravencrest] ${hero} failed to load`, e));
}
// ── Start menu: pick Jack or Elise, read the brief, enter. (?hero=jack|elise skips it.) ──
const menuEl = document.getElementById('menu')!;
let menuOpen = !params.has('hero') && !params.has('ref');
let heroPick: Hero = ((window as unknown as { __heroPick?: Hero }).__heroPick) ?? 'jack';   // picked before the game loaded (index.html)
// A repeat run after beating Dracula: say so on the title.
if (Difficulty.level > 0) { const sub = menuEl.querySelector('.sub'); if (sub) sub.textContent = `NIGHTMARE +${Difficulty.level} · The night remembers you. Every fight is harder.`; }
if (menuOpen) player.enabled = false;
if (!menuOpen) { menuEl.remove(); startHero((params.get('hero') as Hero) === 'elise' ? 'elise' : 'jack'); }
else {
  menuEl.querySelectorAll<HTMLElement>('.hero').forEach((h) => {
    h.addEventListener('pointerenter', () => sfx.uiHover());
    h.addEventListener('click', () => {
      heroPick = h.dataset.hero as Hero;
      prefetchHero(heroPick);
      menuEl.querySelectorAll('.hero').forEach((x) => x.classList.toggle('on', x === h));
      menuEl.classList.toggle('elise', heroPick === 'elise');   // accent: Plajah orange for Jack, purple for Elise
      loadEl?.classList.toggle('elise', heroPick === 'elise');
      sfx.uiSelect();
    });
  });
  // The first click/key wakes the audio (browser rule): the score starts under the title.
  const awake = () => { menuEl.querySelector('.awaken')?.remove(); removeEventListener('pointerdown', awake); removeEventListener('keydown', awake); };
  addEventListener('pointerdown', awake); addEventListener('keydown', awake);
  addEventListener('keydown', (e) => { if (menuOpen && (e.code === 'Enter' || e.code === 'NumpadEnter')) document.getElementById('menuStart')?.click(); });
  document.getElementById('menuStart')!.addEventListener('click', () => {
    if (!menuOpen) return;
    sfx.uiStart();
    player.cinematic = false;
    menuOpen = false;
    menuEl.classList.add('gone');
    setTimeout(() => menuEl.remove(), 700);
    startHero(heroPick);
    // Begin exactly at the spawn, facing up the road to the castle, the camera snapped behind.
    player.teleport(checkpoint.pos, checkpoint.yaw);
    player.enabled = true;
    setTimeout(() => game.call('Films line the road and hang in the castle — watch one, or cross the bridge, defeat Dracula, and break the curse', 6.5, '#ffd9a0'), 1200);
  });
}
/** Behind the title screen: a slow, low dolly up the misty road toward the castle. */
let menuT = 0;
function menuCamera(dt: number) {
  menuT += dt;
  player.cinematic = true;
  const R = world.road, u = (R.uL + R.uR) / 2;
  const v = -95 + (menuT * 0.9) % 70;
  camera.position.copy(R.fromLocal(u + Math.sin(menuT * 0.11) * 1.2, v, 2.1 + Math.sin(menuT * 0.07) * 0.4));
  camera.lookAt(world.gateCentre.clone().setY(world.gateCentre.y + 12));
  camera.fov = 52; camera.updateProjectionMatrix();
}
/** Achievements → the host page (RavencrestGameFrame unlocks them on Plajah). */
function achieve(trigger: string, title: string) {
  game.reward(`Achievement unlocked — ${title}`);
  if (window.parent !== window) window.parent.postMessage({ type: 'ravencrest:achievement', trigger }, location.origin);
}

let hallHinted = false;
let checkpoint = { level: levels.outside as Level, pos: world.spawn.position.clone(), yaw: world.spawn.yaw };
function enterLevel(next: Level, pos: THREE.Vector3, yaw: number) {
  level = next;
  checkpoint = { level: next, pos: pos.clone(), yaw };
  next.scene.add(player.object, reviewKey, reviewKey.target, contactShadow);
  player.world = next.collision;
  player.teleport(pos, yaw);
}
const startInHall = params.get('start') === 'hall';
if (startInHall) enterLevel(levels.hall, hall.spawn.position, hall.spawn.yaw);
else enterLevel(levels.outside, world.spawn.position, world.spawn.yaw);

// Door transitions with a short fade, timed in simulation time (timers are throttled in
// background tabs, which would strand the player mid-fade).
let transition: { next: Level; pos: THREE.Vector3; yaw: number; t: number; swapped: boolean } | null = null;
function travel(next: Level, pos: THREE.Vector3, yaw: number) {
  if (transition) return;
  transition = { next, pos, yaw, t: 0, swapped: false };
  player.enabled = false;
  fade.style.opacity = '1';
}
function stepTransition(dt: number) {
  if (!transition) return;
  transition.t += dt;
  if (!transition.swapped && transition.t >= 0.45) {
    enterLevel(transition.next, transition.pos, transition.yaw);
    transition.swapped = true;
    fade.style.opacity = '0';
  }
  if (transition.t >= 0.9) { player.enabled = mode === 'play'; transition = null; }
}
let focus: Showing | null = null;
let atHallDoor = false;
function checkDoors() {
  const p = player.object.position;
  focus = focusShowing(showings, level === levels.hall ? 'hall' : 'outside', p);
  if (card.open && card.open !== focus?.film) card.close();
  const filmPrompt = focus ? `E · ${focus.film.title}${focus.film.year ? ` (${focus.film.year})` : ''}` : '';
  prompt.classList.toggle('film', !!focus);
  if (level === levels.outside) {
    const near = p.distanceTo(yard.hallDoor.position) < yard.hallDoor.radius + 3;
    const sealed = p.distanceTo(viaduct.sealedGate.position) < viaduct.sealedGate.radius + 2;
    prompt.textContent = near ? 'E · Open the Great Hall doors' : sealed ? 'The Upper Ward — sealed' : filmPrompt;
    prompt.classList.toggle('film', near || !!focus);
    atHallDoor = near;
  } else {
    prompt.textContent = filmPrompt;
    if (p.distanceTo(hall.exitTrigger.position) < hall.exitTrigger.radius) travel(levels.outside, yard.hallDoor.exitPos, yard.hallDoor.exitYaw);
  }
}

// Film card: E (or a tap on the prompt) opens it for the showing in front of you.
const card = new FilmCard(() => {}, (film) => {
  const s = (focus?.film === film ? focus : null) ?? showings.find((x) => x.film === film) ?? null;
  if (s) playFilm(s); else watch(film.id);
});
/** Choosing a film: the camera flies into the billboard (or painting) until it fills the frame,
 *  the picture fades to black, and the host page opens the film and starts it (studio ident first). */
let filmZoom: { s: Showing; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion; posted: boolean } | null = null;
function playFilm(s: Showing) {
  if (filmZoom) return;
  filmZoom = { s, t: 0, from: camera.position.clone(), fromQ: camera.quaternion.clone(), posted: false };
  player.enabled = false; player.cinematic = true;
  sfx.uiStart();
}
function updateFilmZoom(dt: number) {
  const z = filmZoom!;
  z.t += dt;
  const face = z.s.face;
  face.updateWorldMatrix(true, false);
  const centre = new THREE.Vector3().setFromMatrixPosition(face.matrixWorld);
  const n = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
  if (n.dot(z.from.clone().sub(centre)) < 0) n.negate();      // the side we're looking at
  const g = (face.geometry as THREE.PlaneGeometry).parameters;
  const sc = new THREE.Vector3().setFromMatrixScale(face.matrixWorld);
  const h = Math.max(g.height * sc.y, (g.width * sc.x) / Math.max(0.5, camera.aspect));
  const dist = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.92;   // poster fills the frame
  const k = Math.min(1, z.t / 1.4), e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(z.from, centre.clone().addScaledVector(n, dist), e);
  const look = new THREE.Object3D(); look.position.copy(camera.position); look.lookAt(centre);
  camera.quaternion.copy(z.fromQ).slerp(look.quaternion, Math.min(1, e * 1.4));
  fade.style.opacity = String(THREE.MathUtils.clamp((z.t - 0.9) / 0.5, 0, 1));
  if (z.t >= 1.45 && !z.posted) { z.posted = true; watch(z.s.film.id); }
  // Standalone (no host page to play it): come back out after a beat.
  if (z.t >= 3 && window.parent === window) {
    fade.style.opacity = '0'; filmZoom = null;
    player.cinematic = false; player.enabled = true;
  }
}
function interact() {
  if (card.open) { card.close(); return; }
  if (mode === 'cut') { skipCut(); return; }
  if (atHallDoor && mode === 'play' && !transition) { startEntrance(); return; }
  if (focus && mode === 'play' && !transition) card.show(focus.film);
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) interact();
});
prompt.addEventListener('click', interact);
/** Ask the host Plajah page (RavencrestGameFrame) to open a film in the Cinema player. */
function watch(id: string, timecode?: string) {
  nightmare.filmChosen();
  if (window.parent !== window) window.parent.postMessage({ type: 'ravencrest:watch', id, timecode }, location.origin);
  else console.info('[ravencrest] watch', id, timecode ?? '');
}

// ── Modes (play / reference review / portrait / free camera) ─────────────────
let mode: 'play' | 'ref' | 'free' | 'portrait' | 'cut' = params.has('ref') ? 'ref' : 'play';
const keys = player.keys;
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') setMode(mode === 'ref' ? 'play' : 'ref');
  if (e.code === 'KeyF') setMode(mode === 'free' ? 'play' : 'free');
  if (e.code === 'KeyC') { level.collision.debugMesh.visible = !level.collision.debugMesh.visible; level.scene.add(level.collision.debugMesh); }
});
const freeCam = new THREE.Vector3();
function setMode(m: typeof mode) {
  mode = m;
  player.enabled = m === 'play';
  review.classList.toggle('on', m === 'ref');
  if (m === 'free') freeCam.copy(camera.position);
  layout();
}

// Reference mode letterboxes the canvas to the painting's aspect so the overlay registers 1:1.
function layout() {
  let w = innerWidth, h = innerHeight, x = 0, y = 0;
  const shot = level.anchor.shot;
  if (mode === 'ref') {
    const a = shot.width / shot.height;
    if (w / h > a) { const nw = h * a; x = (w - nw) / 2; w = nw; } else { const nh = w / a; y = (h - nh) / 2; h = nh; }
    refImg.src = shot.image;
    Object.assign(refImg.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  }
  Object.assign(view.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  renderer.setSize(w, h);
  applyInternalRes();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  updateOverlay();
}
function updateOverlay() {
  refImg.style.opacity = mode === 'ref' ? refOpacity.value : '0';
  refImg.style.clipPath = refSplit.checked ? 'inset(0 50% 0 0)' : 'none';
}
refOpacity.addEventListener('input', updateOverlay);
refSplit.addEventListener('change', updateOverlay);
addEventListener('resize', layout);
layout();

// ── Looks: LUT grade in the post chain + film/tape lenses over the frame (looks.ts) ──
const looks = new Looks(renderer.domElement);

// ── Weather + the nightmare (weather.ts, nightmare.ts) ─────────────────────────
// One light rig shared by both: the storm flashes on top of `base`, the nightmare dims `base`.
const hallFlash = new THREE.DirectionalLight(0xc8d8ff, 0);
hallFlash.position.set(0, 30, -60);
hallScene.add(hallFlash);
const lightRig = [
  { light: moon as THREE.Light, base: moon.intensity, base0: moon.intensity, keep: 0.16 },
  { light: fill as THREE.Light, base: fill.intensity, base0: fill.intensity, keep: 0.03 },
  { light: hemi as THREE.Light, base: hemi.intensity, base0: hemi.intensity, keep: 0.1 },
  { light: hallFlash as THREE.Light, base: 0, base0: 0, keep: 1 },
];
const sfx = new Sfx(audio);
const comboComic = new ComboComic();
const lens = new LensSplatter();
const weather = new Weather({
  sky,
  flashLights: lightRig,
  thunder: (dist, indoors) => sfx.thunder(dist, indoors),
  setStorm: (s) => { audio.setStorm(s); rainAmount.value = s; if (jack?.hair) jack.hair.wind = s; },
  indoors: () => level === levels.hall,
  scene: () => (level === levels.outside ? outside : null),
  ground: (x, z, y) => level.collision.groundAt(x, z, y, 8),
}, { low: isMobile ? 700 : 1200, medium: 1800, high: 5000, ultra: 8000 }[quality]);

// ── Gameplay: combat, monsters, cast encounters (game.ts) ─────────────────────
const game = new Game({
  player, camera, dom: renderer.domElement,
  jack: () => jack,
  level: () => (level === levels.hall ? 'hall' : 'outside'),
  scene: (l) => levels[l].scene,
  collision: (l) => levels[l].collision,
  pool: (l) => pools[l],
  live: () => mode === 'play' && !transition && !card.open && !menuOpen,
  respawn: () => enterLevel(checkpoint.level, checkpoint.pos, checkpoint.yaw),
  watch,
  primary: (x, y) => primaryOnFilm(x, y),
  sfx,
  comic: comboComic,
  lens,
  eventActive: (): boolean => (nightmare.phase !== 'wait' && nightmare.phase !== 'done') || bridgeBattle.active,
});
player.onSens = (v) => game.call(`Mouse sensitivity ${Math.round(v * 100)}%  ( -  / = )`, 1.6, '#ffd9a0');
gameRef = game;
setTimeout(preloadAngel, 20000);   // fetched quietly after start-up, long before any halo
game.setHeroName(heroName);
const nightmareEnv = [{ scene: outside, base: outside.environmentIntensity }, { scene: hallScene, base: hallScene.environmentIntensity }];
const nightmare = new Nightmare({
  game, player, camera, weather, sfx, audio,
  level: () => (level === levels.hall ? 'hall' : 'outside'),
  pools: [pools.outside, pools.hall],
  sky,
  dimLights: lightRig,
  envScenes: nightmareEnv,
  renderer,
  live: () => (mode === 'play' || mode === 'portrait') && !transition && !menuOpen,
  ready: (): boolean => bridgeBattle.defeated && level === levels.hall,
  eject: () => travel(levels.outside, yard.hallDoor.exitPos, yard.hallDoor.exitYaw),
  frontDoor: () => ({ pos: yard.hallDoor.exitPos.clone(), yaw: yard.hallDoor.exitYaw }),
  glow: (k) => {
    for (const s of showings) {
      const m = s.face.material as THREE.MeshStandardNodeMaterial;
      m.userData.glow0 ??= m.emissiveIntensity;
      if (m.emissiveIntensity > 0 || m.userData.glow0 > 0) m.emissiveIntensity = (m.map ? (m.userData.glow0 || 0.55) : 0) * k;
    }
  },
}, Number(params.get('nightmare')) || 10);
// ── Daybreak (daybreak.ts, grass.ts): what defeating Dracula does to the valley ─────
const grass = buildGrass(world.road, { low: isMobile ? 2500 : 5000, medium: 8000, high: 26000, ultra: 40000 }[quality]);
outside.add(grass.mesh);
outside.add(buildMist(world, quality === 'low' || quality === 'medium' ? 1 : 2));
const groundFog = new GroundFog(world, isMobile ? 120 : quality === 'medium' ? 200 : 300);
outside.add(groundFog.mesh);
const firs: THREE.Material[] = [];
outside.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if ((o as THREE.InstancedMesh).isInstancedMesh && m?.color && m.color.getHex() === 0x0b1012 && !firs.includes(m)) firs.push(m); });
const daybreak = new Daybreak({
  sky, rig: lightRig, moon, hemi, sunTarget: world.gateCentre,
  envScenes: nightmareEnv,
  fog: { color: fogColor, amount: fogAmount },
  firs, grass,
  setExposure: (e) => { nightmare.exposureBase = e; renderer.toneMappingExposure = e; },
  calmWeather: () => { weather.calm = true; weather.force = 0; },
  dayAudio: (k) => audio.setDay(k),
  orbs: (k) => { game.orbBoost = k; game.setOrbGlow(k); },
});
// ── The daybreak cutscene: the curse breaking across the valley, shot by shot ─────────
//  0 – 4 s    wide: high over the moat, the bridge and the castle as the sky opens
//  4 – 7.5    close: the canopy over the road, the leaves turning green
//  7.5 – 10.5 low: grass and wildflowers growing back where the Count fell
//  10.5 – 15.5 the bridge from the gorge side, a flock of birds sweeping over it
//  15.5 – 25  back to the hero; Pumpkin Patch strolls up and says his piece
const flock = new Flock();
outside.add(flock.mesh);
const flowers = buildFlowers(world.road, isMobile ? 900 : 2400);
outside.add(flowers.group);
const flowerCentre = new THREE.Vector3();
let victoryCut: { t: number; at: THREE.Vector3; melvin: boolean; line: boolean; birds: boolean; atV: number | null } | null = null;
function startVictoryCut(at: THREE.Vector3) {
  victoryCut = { t: 0, at: at.clone(), melvin: false, line: false, birds: false, atV: null };
  player.enabled = false; player.cinematic = true;
}
function updateVictoryCut(dt: number) {
  const V = victoryCut!;
  V.t += dt;
  const t = V.t, R = world.road, B = world.bridge, G = world.gateCentre, up = new THREE.Vector3(0, 1, 0);
  uLeafDay.value = THREE.MathUtils.clamp((t - 3.6) / 3.6, 0, 1);
  const shot = (pos: THREE.Vector3, look: THREE.Vector3, fov: number) => { camera.position.copy(pos); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix(); };
  const mid = B.start.clone().addScaledVector(B.dir, B.len * 0.5).setY(B.deckY);
  const roadV = -40, roadMidU = (R.uL + R.uR) / 2;
  if (t < 4) {
    const k = t / 4;
    shot(mid.clone().addScaledVector(B.dir, -70 + 12 * k).addScaledVector(B.right, 26).addScaledVector(up, 32 - 5 * k), G.clone().setY(G.y + 8), 50);
  } else if (t < 7.5) {
    const k = (t - 4) / 3.5;
    const base = R.fromLocal(roadMidU, roadV + k * 2, R.heightAt(roadMidU, roadV) + 1.5);
    shot(base, R.fromLocal(R.uR - 0.5 + k * 1.5, roadV + 7, R.heightAt(roadMidU, roadV) + 9.5), 42);
  } else if (t < 10.5) {
    // Low along the verge nearest where he fell, where the grass and wildflowers come up.
    const k = (t - 7.5) / 3;
    if (V.atV === null) { let best = Infinity; for (let v = R.vStart; v < 0; v += 1) { const d = R.fromLocal(roadMidU, v, 0).setY(0).distanceTo(V.at.clone().setY(0)); if (d < best) { best = d; V.atV = v; } } }
    const v0 = V.atV!, u0 = R.uL - 2.6;
    const h = (u: number, v: number) => R.heightAt(u, v);
    shot(R.fromLocal(u0, v0 - 3 + k * 1.2, h(u0, v0) + 1.05), R.fromLocal(u0 - 1.6, v0 + 3.5, h(u0 - 1.6, v0 + 3.5) + 0.55), 38);
  } else if (t < 15.5) {
    const k = (t - 10.5) / 5;
    if (!V.birds) {
      V.birds = true;
      const far = mid.clone().addScaledVector(B.right, -60).addScaledVector(B.dir, -25).setY(B.deckY + 14);
      flock.start([far, mid.clone().addScaledVector(B.right, -15).setY(B.deckY + 9), mid.clone().setY(B.deckY + 7), mid.clone().addScaledVector(B.right, 25).addScaledVector(B.dir, 10).setY(B.deckY + 11), mid.clone().addScaledVector(B.right, 70).addScaledVector(B.dir, 30).setY(B.deckY + 20)], 6.5);
      sfx.bats(0);
    }
    shot(mid.clone().addScaledVector(B.right, B.width / 2 + 16).addScaledVector(B.dir, -8 + 6 * k).setY(B.deckY - 3.5), mid.clone().addScaledVector(up, 5), 46);
  } else {
    const p = player.object.position, fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    if (!V.melvin) { V.melvin = true; game.melvinWalkUp(); }
    const mel = game.mobs.find((m) => m.kind === 'pumpkin' && m.team === 'ally' && m.alive);
    // Walked by hand (the ally AI follows a camera-relative slot, and this camera is a film's):
    // down the road at a stroll, stopping at the hero's shoulder, turning to face them.
    if (mel?.ready) {
      mel.scripted = true;
      const stop = p.clone().addScaledVector(fwd, 1.3).addScaledVector(side, 1.1);
      const to = stop.clone().sub(mel.object.position).setY(0), d = to.length();
      if (d > 0.15) {
        mel.object.position.addScaledVector(to.normalize(), Math.min(d, 1.45 * dt));
        mel.object.position.y = p.y;
        mel.yaw = Math.atan2(to.x, to.z);
        mel.pose('walk');
      } else {
        const face = p.clone().sub(mel.object.position).setY(0);
        mel.yaw = Math.atan2(face.x, face.z);
        mel.pose('idle');
      }
      mel.object.rotation.y = mel.yaw;
    }
    const two = mel ? p.clone().lerp(mel.object.position, 0.5) : p.clone().addScaledVector(fwd, 2);
    // Over the hero's shoulder as Melvin comes down the road to them.
    shot(p.clone().addScaledVector(fwd, -3.2).addScaledVector(side, -0.9).setY(p.y + 1.75), two.clone().setY(p.y + 1.3), 42);
    if (!V.line && mel && (mel.object.position.distanceTo(p) < 2.2 || t > 23)) { V.line = true; game.bark('pumpkin', 'melvin_victory', true); V.t = Math.max(V.t, 19.5); }
    if (V.line && t > 27) {
      victoryCut = null;
      if (mel) mel.scripted = false;
      player.cinematic = false; player.enabled = true;
      game.call('The curse is broken. Ravencrest is free.', 5, '#ffe7b0');
    }
  }
}
nightmare.onVictory = (at) => {
  setTimeout(() => { daybreak.start(at); game.makePeace(); startVictoryCut(at); }, 2500);
  achieve('RAVENCREST_DRACULA_SLAIN', 'Dracula Slain');
  bridgeBattle.cleared = true;
  Difficulty.won();   // the next playthrough is a Nightmare+ run
  setTimeout(() => achieve('RAVENCREST_CURSE_BREAKER', 'Curse Breaker'), 4200);
};
// ── The bridge battle (bridgeBattle.ts): the troll, the kraken, Miriam's air war ──────
const bridgeBattle = new BridgeBattle({
  game, player, camera, sfx, weather, bridge: world.bridge, scene: outside, pool: pools.outside,
  free: () => level === levels.outside && !game.peace && !game.hordeActive && nightmare.phase === 'wait',
  live: () => mode === 'play' && !transition && !card.open && !menuOpen,
}, params.get('bridge') === '1' ? 1 : 0.5);
bridgeBattle.onDefeated = () => {
  achieve('RAVENCREST_TROLL_SLAYER', 'Troll Slayer');
  setTimeout(() => game.call('The way to Ravencrest is open — Dracula waits in the castle', 4, '#ffd9a0'), 6000);
};
if (params.get('troll') === 'done') bridgeBattle.defeated = true;   // debug: skip to the castle
game.onTrollSlam = (m) => bridgeBattle.trollSlam(m);
game.onTankMove = (pos, dir, speed) => obstacles.smash(pos, dir, speed);   // the tank bursts through the road wreckage
// ── Controller + touch play (input.ts) ─────────────────────────────────────────
const extraInput = new ExtraInput({
  player, game, interact,
  menuOpen: () => menuOpen,
  menuPick: (dir) => {
    const heroes = Array.from(document.querySelectorAll<HTMLElement>('#menu .hero'));
    const i = heroes.findIndex((h) => h.classList.contains('on'));
    heroes[(i + dir + heroes.length) % heroes.length]?.click();
  },
  menuStart: () => document.getElementById('menuStart')?.click(),
});
extraInput.setVisible(!menuOpen);
document.getElementById('menuStart')?.addEventListener('click', () => extraInput.setVisible(true));
if (extraInput.isTouch) document.getElementById('hud')?.remove();
{
  const R = world.road, uMid = (R.uL + R.uR) / 2;
  const onRoad = (u: number, v: number) => R.fromLocal(u, v, Math.max(0.05, R.heightAt(u, v)));
  const ground = (l: Level, p: THREE.Vector3) => { const g = l.collision.groundAt(p.x, p.z, p.y + 20, 40); if (g !== null) p.y = g; return p; };
  // Courtyard: measured from the hall portal toward the gate.
  const yd = world.fortress.origin.clone().sub(yard.hallDoor.exitPos).setY(0).normalize();
  const ys = new THREE.Vector3(-yd.z, 0, yd.x);
  const inYard = (along: number, side: number) => ground(levels.outside, yard.hallDoor.exitPos.clone().addScaledVector(yd, along).addScaledVector(ys, side));
  const onViaduct = (t: number) => ground(levels.outside, yard.postern.position.clone().lerp(viaduct.terrace, t));
  const H = hall.spawn.position;
  const gallery = hall.paintingSlots.filter((s) => s.position.y > 4.5);
  const places: Placement[] = [
    // The Cinema Mile: shamblers among the billboards, a werewolf before the bridge.
    { kind: 'zombie', level: 'outside', pos: onRoad(uMid - 1, -112) },
    { kind: 'zombie', level: 'outside', pos: onRoad(uMid + 2, -96) },
    { kind: 'ghost', level: 'outside', pos: onRoad(R.uL - 1, -84) },
    // A wolf pack loping down out of the woods.
    { kind: 'wolf', level: 'outside', pos: onRoad(R.uR - 0.5, -122) },
    { kind: 'wolf', level: 'outside', pos: onRoad(R.uR + 1.5, -119) },
    { kind: 'wolf', level: 'outside', pos: onRoad(R.uR + 0.5, -125) },
    { kind: 'zombie', level: 'outside', pos: onRoad(R.uL + 1.5, -70) },
    { kind: 'zombie', level: 'outside', pos: onRoad(uMid, -55) },
    { kind: 'ghost', level: 'outside', pos: onRoad(R.uR - 1, -44) },
    { kind: 'werewolf', level: 'outside', pos: onRoad(uMid, -30) },
    // Outer bailey.
    { kind: 'zombie', level: 'outside', pos: inYard(7, -5) },
    { kind: 'zombie', level: 'outside', pos: inYard(9, 5) },
    { kind: 'ghost', level: 'outside', pos: inYard(14, 0) },
    { kind: 'werewolf', level: 'outside', pos: inYard(18, -6) },
    { kind: 'vampire', level: 'outside', pos: inYard(11, 7) },
    // Viaduct.
    { kind: 'ghost', level: 'outside', pos: onViaduct(0.35) },
    { kind: 'zombie', level: 'outside', pos: onViaduct(0.62) },
    // The Unknown guards the sealed Upper Ward gate.
    { kind: 'unknown', level: 'outside', pos: ground(levels.outside, viaduct.sealedGate.position.clone().lerp(viaduct.terrace, 0.45).setY(viaduct.terrace.y + 2)) },
    // Great Hall: nave, aisle and the galleries.
    { kind: 'zombie', level: 'hall', pos: H.clone().add(new THREE.Vector3(-3, 0, -9)) },
    { kind: 'zombie', level: 'hall', pos: H.clone().add(new THREE.Vector3(3, 0, -15)) },
    { kind: 'ghost', level: 'hall', pos: H.clone().add(new THREE.Vector3(0, 0.3, -21)) },
    { kind: 'werewolf', level: 'hall', pos: H.clone().add(new THREE.Vector3(-9, 0, -18)) },
    ...gallery.slice(0, 2).map((s) => ({ kind: 'ghost' as const, level: 'hall' as const, pos: s.position.clone().addScaledVector(s.normal, 2.4).setY(s.position.y - 2.3) })),
    // Upper wing.
    { kind: 'werewolf', level: 'hall', pos: hall.wing.corridor.clone().add(new THREE.Vector3(-9, 0, 0)) },
    { kind: 'zombie', level: 'hall', pos: hall.wing.library.clone() },
    { kind: 'zombie', level: 'hall', pos: hall.wing.library.clone().add(new THREE.Vector3(2, 0, -3)) },
    { kind: 'ghost', level: 'hall', pos: hall.wing.cinema.clone().add(new THREE.Vector3(0, 0.3, -3)) },
    { kind: 'vampire', level: 'hall', pos: hall.wing.banquet.clone().add(new THREE.Vector3(2.5, 0, 2)) },
    { kind: 'zombie', level: 'hall', pos: hall.wing.banquet.clone().add(new THREE.Vector3(-2.5, 0, -3)) },
  ];
  const toGate = world.fortress.origin.clone().sub(R.fromLocal(uMid, 0)).setY(0).normalize();
  game.populate(places, {
    tankPath: [onRoad(uMid, R.vStart + 2), onRoad(uMid, -4)],
    road: R,
    miriam: { pos: ground(levels.outside, world.gateCentre.clone().addScaledVector(toGate, -9).setY(5)), yaw: Math.atan2(-toGate.x, -toGate.z) },
    stitch: { pos: ground(levels.outside, viaduct.terrace.clone().setY(viaduct.terrace.y + 2)), yaw: 0 },
    crane: { pos: H.clone().add(new THREE.Vector3(2.6, 0, -4.5)), yaw: Math.PI },
  });
}
// ── Look-at lock-on: hold your view on a billboard/painting and it locks; Enter or click plays ──
const lockEl = document.createElement('div');
lockEl.id = 'lock';
lockEl.innerHTML = '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span></span>';
document.body.appendChild(lockEl);
const lock = { s: null as Showing | null, dwell: 0, lost: 0 };
const LOCK_TIME = 0.6;
const ray = new THREE.Raycaster();
function faceHit(ndc: THREE.Vector2, maxDist: number): Showing | null {
  ray.setFromCamera(ndc, camera);
  ray.far = maxDist;
  const lv = level === levels.hall ? 'hall' : 'outside';
  const list = showings.filter((x) => x.level === lv);
  const hits = ray.intersectObjects(list.map((x) => x.face), false);
  if (!hits.length) return null;
  // Walls in front of the poster? Compare with the collision ray.
  const wall = level.collision.rayDistance(ray.ray.origin, ray.ray.direction, hits[0].distance);
  if (wall < hits[0].distance - 0.3) return null;
  return list.find((x) => x.face === hits[0].object) ?? null;
}
function updateLock(dt: number) {
  const hit = faceHit(new THREE.Vector2(0, 0.08), level === levels.hall ? 16 : 70);
  if (hit && hit === lock.s) { lock.dwell += dt; lock.lost = 0; }
  else if (hit) { lock.s = hit; lock.dwell = 0; lock.lost = 0; }
  else if (lock.s) { lock.lost += dt; if (lock.lost > 0.35) { lock.s = null; lock.dwell = 0; } }
  const s = lock.s;
  if (!s || card.open) { lockEl.classList.remove('on', 'locked'); return; }
  // Bracket the face on screen; it closes in as the lock builds.
  const g = (s.face.geometry as THREE.PlaneGeometry).parameters;
  s.face.updateWorldMatrix(true, false);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const rect = renderer.domElement.getBoundingClientRect();
  for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const v = new THREE.Vector3(cx * g.width, cy * g.height, 0).applyMatrix4(s.face.matrixWorld).project(camera);
    const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  }
  const k = Math.min(1, lock.dwell / LOCK_TIME), grow = (1 - k) * 0.25;
  const w = x1 - x0, h = y1 - y0;
  Object.assign(lockEl.style, { left: `${x0 - w * grow / 2}px`, top: `${y0 - h * grow / 2}px`, width: `${w * (1 + grow)}px`, height: `${h * (1 + grow)}px`, opacity: String(0.35 + 0.65 * k) });
  lockEl.classList.add('on');
  lockEl.classList.toggle('locked', k >= 1);
  lockEl.querySelector('span')!.textContent = k >= 1 ? `▶ Enter / Click  ·  Watch ${s.film.title}` : s.film.title;
}
/** Primary press (click/Enter): plays the locked-on film, or the poster under the cursor. */
function primaryOnFilm(clientX?: number, clientY?: number): boolean {
  if (mode !== 'play') return false;
  // Enter with the film card open plays that film.
  if (card.open && clientX === undefined) { card.watch(); return true; }
  let s: Showing | null = null;
  if (clientX !== undefined && clientY !== undefined) {
    const r = renderer.domElement.getBoundingClientRect();
    s = faceHit(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), 70);
  } else if (lock.s && lock.dwell >= LOCK_TIME) s = lock.s;
  if (!s) return false;
  // In a fight, a click is a sword stroke, not a ticket.
  const p = player.object.position;
  if (game.mobs.some((m) => m.team === 'enemy' && m.alive && m.level === (level === levels.hall ? 'hall' : 'outside') && m.object.position.distanceTo(p) < 5)) return false;
  game.call(`▶ ${s.film.title}`, 1.6, '#ffcf8a');
  playFilm(s);
  lock.s = null; lock.dwell = 0;
  return true;
}

// ── Great Hall entrance cutscene ─────────────────────────────────────────────
// Action at the doors: black, the doors groan open, cut to the far end of the hall high up,
// crane down as Jack walks in, the doors slam behind him (echoing down the nave), then the
// camera flies in and settles behind him and the player takes over.
let doorOpen = 1, doorTarget = 1;
const CUT = { swap: 0.45, walk0: 0.9, walk1: 4.4, shut: 3.5, slam: 4.0, fly: 4.6, end: 6.4 };
const ENTER_FROM = new THREE.Vector3(0, 0.02, 3.2);
let cut: { t: number; slammed: boolean } | null = null;
function startEntrance() {
  cut = { t: 0, slammed: false };
  setMode('cut');
  fade.style.opacity = '1';
  audio.door('open');
  prompt.textContent = '';
}
function skipCut() { if (cut) cut.t = Math.max(cut.t, CUT.end - 0.01); }
const ease = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
function runCut(dt: number) {
  if (!cut) return;
  const c = cut;
  c.t += dt;
  const t = c.t;
  if (t >= CUT.swap && level !== levels.hall) {
    enterLevel(levels.hall, ENTER_FROM, hall.spawn.yaw);
    doorOpen = doorTarget = 0.15;
    fade.style.opacity = '0';
  }
  if (level !== levels.hall) return;
  // Doors: swing open as he comes through, slam shut behind him.
  doorOpen = t < CUT.shut ? Math.max(doorOpen, 0.15 + 0.85 * ease((t - CUT.swap) / 1.1)) : 1 - ease((t - CUT.shut) / 0.55);
  doorTarget = t < CUT.shut ? 1 : 0;
  hall.setDoors(doorOpen);
  if (t >= CUT.slam && !c.slammed) { c.slammed = true; audio.door('close'); player.shake = 0.3; }
  // Jack walks in.
  const w = ease((t - CUT.walk0) / (CUT.walk1 - CUT.walk0));
  const pos = ENTER_FROM.clone().lerp(hall.spawn.position, w);
  player.object.position.copy(pos);
  player.yaw = hall.spawn.yaw; player.object.rotation.y = player.yaw;
  const walking = t > CUT.walk0 && t < CUT.walk1;
  jack?.setLocomotion(walking ? 3.0 : 0, 2.0, 5.6);
  // Camera: crane down from the far end, then fly in and settle behind him.
  const head = pos.clone().setY(pos.y + 1.55);
  const far = new THREE.Vector3(0, hall.landH + 9.5, hall.farZ + 3);
  const low = new THREE.Vector3(1.2, 2.6, hall.spawn.position.z - 11);
  const behind = pos.clone().add(new THREE.Vector3(Math.sin(player.yaw + Math.PI) * 3.4 + 0.45 * Math.cos(player.yaw + Math.PI), 1.85, Math.cos(player.yaw + Math.PI) * 3.4));
  let cam: THREE.Vector3, fov: number;
  if (t < CUT.fly) { const k = ease((t - CUT.swap) / (CUT.fly - CUT.swap)); cam = far.clone().lerp(low, k); fov = 34 + 6 * k; }
  else { const k = ease((t - CUT.fly) / (CUT.end - CUT.fly)); cam = low.clone().lerp(behind, k); fov = 40 + 10 * k; }
  camera.position.copy(cam);
  camera.lookAt(head);
  camera.fov = fov; camera.updateProjectionMatrix();
  if (t >= CUT.end) {
    cut = null;
    player.teleport(hall.spawn.position, hall.spawn.yaw);
    checkpoint = { level: levels.hall, pos: hall.spawn.position.clone(), yaw: hall.spawn.yaw };
    setMode('play');
  }
}
addEventListener('keydown', (e) => { if (mode === 'cut' && (e.code === 'Escape' || e.code === 'Space')) skipCut(); });

/** Where each cast encounter fires. */
function checkEncounters() {
  const p = player.object.position;
  if (level === levels.hall) {
    game.encounter('katrina_crane_patrol');
    if (p.y > 5) game.encounter('lil_boo_jar');
    return;
  }
  const R = world.road;
  const along = new THREE.Vector3(Math.sin(R.yawAlong), 0, Math.cos(R.yawAlong));
  const v = p.clone().sub(R.fromLocal(0, 0)).dot(along);
  if (p.distanceTo(world.gateCentre) < 26) game.encounter('miriam_monkeys');
  if (place().where === 'yard') game.encounter('pumpkin_patch_blades');
  if (p.distanceTo(viaduct.terrace) < 32) game.encounter('stitch_scarecrow');
}

// ── Loop ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock(); // eslint-disable-line
document.getElementById('loading')!.remove();
let simTime = 0;
let camYaw = 0, camPitch = -0.1;

/** One simulation step (input, physics, animation, camera). Captures drive it directly. */
// Road checkpoints: a death outside respawns at the furthest calm spot reached, not the very start.
let cpTimer = 0;
function updateRoadCheckpoint(dt: number) {
  if ((cpTimer += dt) < 3) return;
  cpTimer = 0;
  if (level !== levels.outside || checkpoint.level !== levels.outside || mode !== 'play' || menuOpen || game.hp < game.maxHp * 0.4) return;
  if (bridgeBattle.active || player.cinematic) return;
  const p = player.object.position;
  if (game.mobs.some((m) => m.alive && m.object.position.distanceToSquared(p) < 18 * 18)) return;
  const from = world.spawn.position;
  if (p.distanceTo(from) > checkpoint.pos.distanceTo(from) + 15) checkpoint = { level: levels.outside, pos: p.clone(), yaw: player.yaw };
}

function tick(dt: number) {
  simTime += dt;
  updateRoadCheckpoint(dt);
  xrPlay.update(dt);
  if (filmZoom) updateFilmZoom(dt);
  if (victoryCut) updateVictoryCut(dt);
  flock.update(dt);
  // Wreckage the tank hurled: once it all comes to rest off the road, the road's collision is rebuilt.
  if (obstacles.update(dt, (x, z, y) => levels.outside.collision.groundAt(x, z, y, 6))) levels.outside.collision.rebuild();
  if (level === levels.outside) {
    groundFog.update(dt, camera);
    // The burning wreck: firelight flickers; land in it and it burns.
    const pp = player.object.position;
    for (const f of obstacleFires) {
      if (f.light) f.light.intensity = 70 * (0.8 + 0.2 * Math.sin(simTime * 13 + f.pos.x) * Math.sin(simTime * 7.3));
      if (Math.hypot(pp.x - f.pos.x, pp.z - f.pos.z) < f.r * 0.8 && pp.y < f.pos.y + 1.0) game.hurtPlayer(7, f.pos);
    }
  }
  if (grass.uGrow.value > 0) flowers.update(flowerCentre.set(grass.uCenter.value.x, 0, grass.uCenter.value.y), grass.uGrow.value);
  const t = simTime;
  void t;
  wind.update(dt);
  gustUniform.value = wind.gust;
  (moatUniforms.wind as unknown as { value: THREE.Vector3 }).value.copy(wind.dir).multiplyScalar(0.5 + wind.strength * 0.5);
  (level === levels.hall ? pools.hall : pools.outside).update(dt, camera.position, wind.gust);
  // Flames billboard in their vertex shader (fx.ts).

  if (mode !== 'ref') {
    camera.clearViewOffset();
    camera.aspect = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
  }
  if (mode === 'ref') {
    level.anchor.applyTo(camera);
  } else if (mode === 'portrait') {
    jack?.play('idle');
    player.object.rotation.y = player.yaw; // body faces its yaw even before the first play tick
    const p = player.object.position;
    const face = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const side = new THREE.Vector3(face.z, 0, -face.x);
    camera.position.copy(p).addScaledVector(face, 3.6).addScaledVector(side, 0.9).setY(p.y + 1.05);
    camera.lookAt(p.x, p.y + 0.95, p.z);
    camera.fov = 35; camera.updateProjectionMatrix();
    reviewKey.position.copy(camera.position).add(new THREE.Vector3(1.5, 2, 0));
    reviewKey.target.position.copy(p).setY(p.y + 1);
  } else if (mode === 'free') {
    const sp = (keys.has('ShiftLeft') ? 40 : 10) * dt;
    camYaw = player.camYaw; camPitch = player.camPitch;
    const f = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
    const r = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    if (keys.has('KeyW')) freeCam.addScaledVector(f, sp);
    if (keys.has('KeyS')) freeCam.addScaledVector(f, -sp);
    if (keys.has('KeyD')) freeCam.addScaledVector(r, sp);
    if (keys.has('KeyA')) freeCam.addScaledVector(r, -sp);
    camera.position.copy(freeCam);
    camera.rotation.set(camPitch, camYaw, 0);
    camera.fov = 55; camera.updateProjectionMatrix();
  }
  stepTransition(dt);
  if (mode === 'cut') runCut(dt);
  // Great doors: shut behind you, swing open as you walk back toward them (echoing).
  if (level === levels.hall && mode !== 'cut') {
    const want = mode === 'ref' || player.object.position.distanceTo(hall.exitTrigger.position) < 12 ? 1 : 0; // wide enough that the follow camera never ends up behind shut doors
    if (want !== doorTarget) { if (mode === 'play') audio.door(want ? 'open' : 'close'); doorTarget = want; }
    doorOpen += (doorTarget - doorOpen) * (1 - Math.exp(-dt * 2.4));
    hall.setDoors(doorOpen);
  }
  if (mode === 'play') updateLock(dt);
  else lockEl.classList.remove('on');
  if (mode === 'play') {
    lastStepPos.copy(player.object.position);
    player.update(dt, camera);
    const where = place();
    const moved = Math.hypot(player.object.position.x - lastStepPos.x, player.object.position.z - lastStepPos.z);
    audio.step(moved, moved / Math.max(dt, 1e-3), where.surface);
    audio.update(simTime, where.where);
    if (!transition) { checkDoors(); checkEncounters(); }
  } else if (mode === 'free') {
    // Mouse still steers the free camera through the controller's yaw/pitch.
  } else {
    player.character?.setLocomotion(0, 1.6, 4.8);
  }
  player.object.visible = mode !== 'ref';
  {
    const p = player.object.position;
    const g = level.collision.groundAt(p.x, p.z, p.y + 0.4, 3);
    const h = g === null ? 3 : p.y - g;
    contactShadow.visible = player.object.visible && g !== null && h < 2.5;
    if (g !== null) contactShadow.position.set(p.x, g + 0.025, p.z);
    (contactShadow.material as THREE.MeshBasicNodeMaterial).opacity = THREE.MathUtils.clamp(1 - h / 2.5, 0, 1);
  }
  if (level === levels.hall && !bridgeBattle.defeated) bridgeBattle.visitedCastle = true;
  if (level === levels.hall && !hallHinted && mode === 'play' && !transition) {
    hallHinted = true;
    game.call('The paintings of the Grand Hall are films — walk up to one to watch', 5, '#ffd9a0');
  }
  game.update(dt, mode);
  if (mode !== 'ref') weather.update(dt, camera, player.object.position, nightmare.phase === 'boss');
  // The nightmare's countdown holds while the bridge battle is on.
  if ((mode === 'play' || mode === 'portrait') && !(bridgeBattle.active && nightmare.phase === 'wait')) nightmare.update(dt);
  if (mode === 'play' || mode === 'portrait') bridgeBattle.update(dt, simTime);
  daybreak.update(dt);
  reviewKey.intensity = mode === 'portrait' ? 2.2 : 0;
  jack?.mixer.update(dt * (mode === 'play' ? game.timeScale : 1));

  // ── Living systems: cloth, ropes, interactive water, loose props ──
  const pVel = mode === 'play'
    ? player.object.position.clone().sub(lastStepPos).divideScalar(Math.max(dt, 1e-3))
    : new THREE.Vector3();
  if (level === levels.outside) {
    const wc = yard.well.mesh.getWorldPosition(new THREE.Vector3());
    const ps = { c: player.object.position.clone().add(new THREE.Vector3(0, 1.1, 0)), r: 0.55 };
    yard.cloth.forEach((c) => c.update(dt, wind, { world: levels.outside.collision, spheres: [ps] }));
    yard.ropes.forEach((r) => r.update(dt, wind));
    yard.well.update(dt, wind.gust);
    const tip = yard.ropes[0]?.tip();
    if (tip && Math.hypot(tip.x - wc.x, tip.z - wc.z) < 1.4 && Math.random() < dt * 0.8) yard.well.ripple(tip, 0.3);
    if (player.object.position.distanceTo(wc) < 2.3 && Math.random() < dt * 1.4) yard.well.ripple(player.object.position, 0.3);
    moatTimer -= dt;
    if (moatTimer <= 0) {
      moatTimer = 2.5 + Math.random() * 5;
      addMoatRipple(world.gateCentre.x + (Math.random() - 0.5) * 36, world.gateCentre.z + 16 + Math.random() * 22, 0.4 + wind.gust * 0.7);
    }
    dynOutside.update(dt, player.object.position, pVel);
  } else {
    const ps = { c: player.object.position.clone().add(new THREE.Vector3(0, 1.1, 0)), r: 0.55 };
    hall.cloth.forEach((c) => c.update(dt, wind, { world: levels.hall.collision, spheres: [ps] }, 0.12));
    dynHall.update(dt, player.object.position, pVel);
  }
}

// Dynamic resolution: hold ~60 fps by trading render scale (checked twice a second).
let frameEma = 16, scaleTimer = 0;
const dynRes = params.get('dynres') !== '0';
function internalSize(): [number, number] {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const sc = Math.min(1, internalH / buf.y);
  return [Math.round(buf.x * sc), Math.round(buf.y * sc)];
}
function applyInternalRes() {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const sc = Math.min(1, internalH / Math.max(1, buf.y));
  for (const l of [levels.outside, levels.hall]) l.post.setInternalScale(sc);
}
renderer.setAnimationLoop(() => {
  if (paused) { clock.getDelta(); return; }   // the last frame stays on screen; nothing simulates
  const raw = clock.getDelta();
  frameEma += (raw * 1000 - frameEma) * 0.1;
  // Long frames thin the particles and flashes first (fights), before resolution has to drop.
  // Cutscenes are shot at full quality: resolution locks to its top, effects aren't thinned (the frame
  // rate gives instead; nothing is being played).
  const inCut = mode === 'play' && !menuOpen && (bridgeBattle.inCutscene || !!victoryCut || !!filmZoom || player.cinematic);
  if (inCut) {
    FxBudget.scale = 1;
    if (internalH !== resMax) { internalH = resMax; applyInternalRes(); }
  } else FxBudget.scale += (THREE.MathUtils.clamp((frameTarget * 1.15) / frameEma, 0.35, 1) - FxBudget.scale) * 0.05;
  scaleTimer += raw;
  if (dynRes && scaleTimer > 0.5 && mode === 'play' && !inCut) {
    scaleTimer = 0;
    // Hold 60 fps: drop 8% of internal height when slow, recover 4% when there's headroom.
    const next = frameEma > frameTarget * 1.08 ? internalH * 0.92 : frameEma < frameTarget * 0.84 ? internalH * 1.04 : internalH;
    const clamped = Math.round(THREE.MathUtils.clamp(next, Q.resMin, resMax));
    if (Math.abs(clamped - internalH) >= 8) { internalH = clamped; applyInternalRes(); }
  }
  extraInput.update(Math.min(raw, 0.05));
  if (menuOpen) menuCamera(raw);
  tick(Math.min(raw, 0.05));

  if (renderer.xr.isPresenting) { renderer.render(level.scene, camera); return; }
  level.post.pipeline.render();
  looks.render();
  comboComic.afterRender(renderer.domElement, performance.now());
  lens.update(Math.min(0.1, raw));
});

/** Render a frame now and save it via the dev capture endpoint (see vite.config.mjs). */
async function capture(name: string, frames = 12, held: string[] = []) {
  held.forEach((k) => keys.add(k));
  for (let i = 0; i < frames * 2; i++) tick(1 / 30);
  held.forEach((k) => keys.delete(k));
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame;
  const c = document.createElement('canvas');
  c.width = size.x; c.height = size.y;
  // Default: render to the canvas and copy it in the same task (before it's presented).
  // The offscreen path (?capture=rt) can hang on GPU readback in background tabs.
  if (params.get('capture') !== 'rt') {
    for (let i = 0; i < frames; i++) { nodeFrame.update(); level.post.pipeline.render(); }
    c.getContext('2d')!.drawImage(renderer.domElement, 0, 0, size.x, size.y);
  } else try {
    // Offscreen path. Linear storage: the pipeline already tone-maps and sRGB-encodes.
    const rt = new THREE.RenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, colorSpace: THREE.LinearSRGBColorSpace });
    renderer.setOutputRenderTarget(rt);
    // Pass nodes re-render once per frameId, which only the animation loop advances.
    for (let i = 0; i < frames; i++) { nodeFrame.update(); level.post.pipeline.render(); }
    let px: Uint8Array;
    try { px = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, size.x, size.y)) as Uint8Array; }
    finally { renderer.setOutputRenderTarget(null); rt.dispose(); }
    const row = size.x * 4, padded = Math.ceil(row / 256) * 256;
    if (padded !== row && px.length >= padded * size.y) {
      const tight = new Uint8Array(row * size.y);
      for (let y = 0; y < size.y; y++) tight.set(px.subarray(y * padded, y * padded + row), y * row);
      px = tight;
    }
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.buffer, px.byteOffset, size.x * size.y * 4), size.x, size.y), 0, 0);
  } catch (e) {
    // Fallback: render to the canvas and copy it in the same task (before it is presented).
    console.warn('[ravencrest] offscreen capture failed, using canvas copy', e);
    for (let i = 0; i < frames; i++) { nodeFrame.update(); level.post.pipeline.render(); }
    c.getContext('2d')!.drawImage(renderer.domElement, 0, 0, size.x, size.y);
  }
  const url = c.toDataURL('image/png');
  await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
  return url.length;
}

/**
 * Frame cost. With ?prof=1 uses GPU timestamp queries (true GPU ms for the whole frame);
 * otherwise wall time including the queue round-trip.
 */
async function bench(n = 30) {
  const nodeFrame = (renderer as unknown as { _nodes: { nodeFrame: { update(): void } } })._nodes.nodeFrame;
  const device = (renderer.backend as unknown as { device: GPUDevice }).device;
  const prof = params.has('prof');
  for (let i = 0; i < 5; i++) { nodeFrame.update(); level.post.pipeline.render(); }
  await device.queue.onSubmittedWorkDone();
  if (prof) await renderer.resolveTimestampsAsync('render');
  const wall: number[] = [], gpu: number[] = [], cpu: number[] = [], sim: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    tick(1 / 60);
    sim.push(performance.now() - t0);
    nodeFrame.update(); level.post.pipeline.render();
    cpu.push(performance.now() - t0);
    await device.queue.onSubmittedWorkDone();
    wall.push(performance.now() - t0);
    if (prof) { await renderer.resolveTimestampsAsync('render'); gpu.push(renderer.info.render.timestamp); }
  }
  const med = (a: number[]) => a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(2) : null;
  return {
    level: level.name, px: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    internal: internalSize(),
    gpuMs: med(gpu), cpuMs: med(cpu), simMs: med(sim), wallMs: med(wall), drawCalls: renderer.info.render.drawCalls,
  };
}

/** Simulate held input for `seconds` without rendering (automated walk tests). */
function simulate(seconds: number, held: string[] = [], mouseYaw = 0) {
  held.forEach((k) => keys.add(k));
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) { player.camYaw += mouseYaw / n; tick(1 / 30); }
  held.forEach((k) => keys.delete(k));
  return { pos: player.object.position.toArray().map((v) => +v.toFixed(2)), level: level.name, yaw: +player.yaw.toFixed(2) };
}

// ── Pause (Esc / P / leaving the tab) and exit ───────────────────────────────────
let paused = false;
const pauseEl = document.getElementById('pause')!;
const canPause = () => mode === 'play' && !menuOpen && !renderer.xr.isPresenting;
function setPaused(on: boolean) {
  if (on === paused || (on && !canPause())) return;
  paused = on;
  pauseEl.classList.toggle('on', on);
  pauseEl.classList.toggle('elise', heroPick === 'elise');
  const ctx = audio.context;
  if (ctx) void (on ? ctx.suspend() : ctx.resume()).catch(() => {});
  player.keys.clear();
  if (on && document.pointerLockElement) document.exitPointerLock();
  if (!on) { clock.getDelta(); try { (renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* */ } }
}
function exitGame() {
  setPaused(false);
  // Inside Plajah the host closes the game; standalone, go back to where the player came from.
  if (window.parent !== window) window.parent.postMessage({ type: 'ravencrest:exit' }, location.origin);
  else if (history.length > 1) history.back();
  else location.href = '/';
}
document.getElementById('pauseResume')!.addEventListener('click', () => setPaused(false));
document.getElementById('pauseExit')!.addEventListener('click', exitGame);
// Losing mouse capture (Esc while captured, clicking another window or panel) never pauses on its
// own: the browser can't tell those apart. A second Esc, or P, pauses.
addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && !e.repeat) { setPaused(!paused); return; }
  if (e.code === 'Escape' && !e.repeat && !document.pointerLockElement && mode === 'play') setPaused(!paused);
  else if (paused && (e.code === 'Enter' || e.code === 'NumpadEnter')) setPaused(false);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
addEventListener('message', (e) => { if (e.origin === location.origin && (e.data as { type?: string } | null)?.type === 'ravencrest:pause') setPaused(true); });

// ── Headset play (xr.ts) ──────────────────────────────────────────────────────────
const xrPlay = new XRPlay({
  renderer, camera, player, game, interact,
  scene: () => level.scene,
  startFromMenu: () => { if (menuOpen) document.getElementById('menuStart')?.click(); },
});
void xrPlay.offerButton();

// The world is live: the menu's still dissolves into the road dolly and Enter wakes up.
menuEl.classList.add('live');
{ const sb = document.getElementById('menuStart'); if (sb) sb.textContent = 'ENTER RAVENCREST'; }
worldLive = true; paintLoad();

(window as unknown as Record<string, unknown>).ravencrest = {
  renderer, camera, anchor, world, yard, viaduct, hall, levels, pools, batchStats, setMode, capture, simulate, bench, player, quality, game, films, showings, card, weather, nightmare, audio, sfx, daybreak, bridgeBattle, looks, THREE,
  get perf() { return { frameMs: +frameEma.toFixed(1), internal: internalSize() }; },
  setRes: (h: number) => { internalH = h; applyInternalRes(); },
  get level() { return level; }, get jack() { return jack; },
  obstacles,
  /** Debug: play the Dracula victory (daybreak cutscene) where the player stands. */
  victory: () => nightmare.onVictory?.(player.object.position.clone()),
  get cut() { return victoryCut ? { t: +victoryCut.t.toFixed(2), melvin: victoryCut.melvin, line: victoryCut.line } : null; },
  goto: (name: 'outside' | 'hall' | 'yard') => name === 'hall' ? enterLevel(levels.hall, hall.spawn.position, hall.spawn.yaw)
    : name === 'yard' ? enterLevel(levels.outside, yard.hallDoor.exitPos, yard.hallDoor.exitYaw)
      : enterLevel(levels.outside, world.spawn.position, world.spawn.yaw),
};
