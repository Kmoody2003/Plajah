import * as THREE from 'three/webgpu';
import { fog, densityFogFactor, exponentialHeightFogFactor, color, float, max } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArtAnchor, ARRIVAL_SHOT } from './artAnchor';
import { buildArrival } from './arrival';
import { buildCourtyard } from './courtyard';
import { buildGrandHall } from './grandHall';
import { buildViaduct } from './viaduct';
import { moonSky } from './sky';
import { buildPost } from './post';
import { loadJack, Character } from './character';
import { CollisionWorld } from './collision';
import { PlayerController } from './player';
import { LightPool } from './lights';
import { mergeStatic } from './optimize';
import { GameAudio } from './audio';

const params = new URLSearchParams(location.search);
if (params.has('debug')) (THREE.Node as unknown as { captureStackTrace: boolean }).captureStackTrace = true;
// Quality preset: integrated GPUs (Windows WebGPU ignores powerPreference and often picks the
// iGPU) get 'medium'; discrete GPUs get 'high'. Override with ?q=low|medium|high.
const adapterInfo = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }).then((a) => (a as unknown as { info?: { vendor?: string; architecture?: string } } | null)?.info).catch(() => undefined);
const integrated = !adapterInfo || /intel|qualcomm|apple|arm/i.test(adapterInfo.vendor ?? '') || /xe-|gen-|integrated/i.test(adapterInfo.architecture ?? '');
const quality = (params.get('q') ?? (integrated ? 'medium' : 'high')) as 'low' | 'medium' | 'high';
const Q = {
  // res: internal render height (FSR1 upscales to the display). Intel Arc iGPU = 'medium' = the 60 fps baseline.
  low:    { pr: 1.0, res: 540, resMin: 400, ssr: false, ssrScale: 0.5, shadow: 1024, pool: 4 },
  medium: { pr: 1.0, res: 720, resMin: 480, ssr: false, ssrScale: 0.5, shadow: 1024, pool: 5 },
  high:   { pr: Math.min(devicePixelRatio, 1.5), res: 1080, resMin: 720, ssr: true, ssrScale: 0.5, shadow: 2048, pool: 10 },
}[quality];
console.info(`[ravencrest] GPU ${adapterInfo?.vendor ?? '?'} ${adapterInfo?.architecture ?? ''} → quality ${quality}`);
const view = document.getElementById('view')!;
const refImg = document.getElementById('ref') as HTMLImageElement;
const review = document.getElementById('review')!;
const refOpacity = document.getElementById('refOpacity') as HTMLInputElement;
const refSplit = document.getElementById('refSplit') as HTMLInputElement;
const fade = document.getElementById('fade')!;
const prompt = document.getElementById('prompt')!;

const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', trackTimestamp: params.has('prof') });
await renderer.init();
// Display buffer at native (capped) density; the scene renders at `internalH` and FSR1
// upscales. Dynamic resolution moves internalH between resMin and the preset height.
const targetRes = Number(params.get('res')) || Q.res;
let internalH = targetRes;
renderer.setPixelRatio(Q.pr);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 6000);
camera.rotation.order = 'YXZ';
const postOpts = {
  ssr: (params.get('ssr') === '1' || Q.ssr) && params.get('ssr') !== '0', ssrScale: Q.ssrScale,
  bloom: params.get('bloom') !== '0', taa: params.get('taa') === '1', smaa: params.get('aa') !== '0', upscale: params.get('fsr') !== '0',
};

// ── Level 1: arrival road, moat, gatehouse and the outer bailey ───────────────
const anchor = new ArtAnchor(ARRIVAL_SHOT);
const outside = new THREE.Scene();
const world = await buildArrival(anchor, renderer);
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

const moonRadiusDeg = THREE.MathUtils.radToDeg(Math.atan(38 / anchor.focal));
const sky = moonSky(world.moonDir, moonRadiusDeg);
outside.backgroundNode = sky.node;
const moon = new THREE.DirectionalLight(0x8fa8d4, 1.4);
moon.position.copy(world.moonDir).multiplyScalar(300).add(world.gateCentre);
moon.target.position.copy(world.gateCentre).lerp(new THREE.Vector3(), 0.5);
moon.castShadow = true;
moon.shadow.mapSize.set(Q.shadow, Q.shadow);
const sc = moon.shadow.camera as THREE.OrthographicCamera;
sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 50; sc.far = 800;
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
outside.add(moon, moon.target);
// Cool, shadowless fill from the viewer's side (art's blue-grey wall values).
const fill = new THREE.DirectionalLight(0x6f86ad, 0.45);
fill.position.set(-40, 60, 120);
outside.add(fill);
outside.add(new THREE.HemisphereLight(0x3a4c6c, 0x05070a, 0.55));
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
outside.fogNode = fog(color(0x262f3d), max(densityFogFactor(float(0.0013)), (exponentialHeightFogFactor(float(0.0032), float(2.6)) as ReturnType<typeof float>).mul(0.85)));

// ── Level 2: the Grand Hall ──────────────────────────────────────────────────
const hallScene = new THREE.Scene();
const hall = buildGrandHall();
hallScene.add(hall.group);
hallScene.backgroundNode = sky.node; // night sky through the open doors
hallScene.fogNode = fog(color(0x1a1612), densityFogFactor(float(0.01)));
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
const mkLevel = (name: string, scene: THREE.Scene, a: ArtAnchor, torches: THREE.PointLight[], flames: THREE.Mesh[], opts = postOpts): Level => ({
  name, scene, anchor: a, torches, flames, post: buildPost(renderer, scene, camera, opts), collision: new CollisionWorld(scene),
});
const levels = {
  outside: mkLevel('outside', outside, anchor, [...world.torches, ...yard.torches, ...viaduct.torches], [...world.flames, ...yard.flames, ...viaduct.flames]),
  // The hall's polished floor is a signature of the art: SSR on everywhere but 'low'.
  hall: mkLevel('hall', hallScene, hall.anchor, hall.torches, hall.flames, { ...postOpts, ssr: quality !== 'low' && params.get('ssr') !== '0' }),
};
levels.outside.collision.rebuild();
levels.hall.collision.rebuild();
// Async props add colliders; rebuild once they've landed.
// Light pools: authored torches/candles become virtual lights; K real lights per level.
const pools = {
  outside: new LightPool(outside, outside, Q.pool, new Set(levels.outside.torches)),
  hall: new LightPool(hallScene, hallScene, Q.pool + 2, new Set(levels.hall.torches)),
};
// Static batching (see optimize.ts). Flames re-orient every frame, so they stay separate.
const noMerge = new Set<THREE.Object3D>([...levels.outside.flames, ...levels.hall.flames]);
const batchStats = { outside: mergeStatic(outside, noMerge), hall: mergeStatic(hallScene, noMerge) };
console.info('[ravencrest] static batching', batchStats);
yard.props.then(() => {
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
loadJack().then((c) => { jack = c; player.character = c; player.object.add(c.root); })
  .catch((e) => console.error('[ravencrest] Jack failed to load', e));

function enterLevel(next: Level, pos: THREE.Vector3, yaw: number) {
  level = next;
  next.scene.add(player.object, reviewKey, reviewKey.target);
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
function checkDoors() {
  const p = player.object.position;
  if (level === levels.outside) {
    const near = p.distanceTo(yard.hallDoor.position) < yard.hallDoor.radius + 3;
    const sealed = p.distanceTo(viaduct.sealedGate.position) < viaduct.sealedGate.radius + 2;
    prompt.textContent = near ? 'The Great Hall' : sealed ? 'The Upper Ward — sealed' : '';
    if (p.distanceTo(yard.hallDoor.position) < yard.hallDoor.radius) travel(levels.hall, hall.spawn.position, hall.spawn.yaw);
  } else {
    prompt.textContent = '';
    if (p.distanceTo(hall.exitTrigger.position) < hall.exitTrigger.radius) travel(levels.outside, yard.hallDoor.exitPos, yard.hallDoor.exitYaw);
  }
}

// ── Modes (play / reference review / portrait / free camera) ─────────────────
let mode: 'play' | 'ref' | 'free' | 'portrait' = params.has('ref') ? 'ref' : 'play';
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

// ── Loop ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock(); // eslint-disable-line
document.getElementById('loading')!.remove();
let simTime = 0;
let camYaw = 0, camPitch = -0.1;

/** One simulation step (input, physics, animation, camera). Captures drive it directly. */
function tick(dt: number) {
  simTime += dt;
  const t = simTime;
  void t;
  (level === levels.hall ? pools.hall : pools.outside).update(dt, camera.position);
  level.flames.forEach((f) => {
    f.parent?.updateMatrixWorld();
    const local = f.parent ? f.parent.worldToLocal(camera.position.clone()) : camera.position;
    f.lookAt(f.parent ? f.parent.localToWorld(new THREE.Vector3(local.x, f.position.y, local.z)) : camera.position);
  });

  if (mode !== 'ref') {
    camera.clearViewOffset();
    camera.aspect = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
  }
  if (mode === 'ref') {
    level.anchor.applyTo(camera);
  } else if (mode === 'portrait') {
    jack?.play('idle');
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
  if (mode === 'play') {
    lastStepPos.copy(player.object.position);
    player.update(dt, camera);
    const where = place();
    const moved = Math.hypot(player.object.position.x - lastStepPos.x, player.object.position.z - lastStepPos.z);
    audio.step(moved, moved / Math.max(dt, 1e-3), where.surface);
    audio.update(simTime, where.where);
    if (!transition) checkDoors();
  } else if (mode === 'free') {
    // Mouse still steers the free camera through the controller's yaw/pitch.
  } else {
    player.character?.setLocomotion(0, 1.6, 4.8);
  }
  player.object.visible = mode !== 'ref';
  reviewKey.intensity = mode === 'portrait' ? 2.2 : 0;
  jack?.mixer.update(dt);
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
  const raw = clock.getDelta();
  frameEma += (raw * 1000 - frameEma) * 0.1;
  scaleTimer += raw;
  if (dynRes && scaleTimer > 0.5 && mode === 'play') {
    scaleTimer = 0;
    // Hold 60 fps: drop 8% of internal height when slow, recover 4% when there's headroom.
    const next = frameEma > 18 ? internalH * 0.92 : frameEma < 14 ? internalH * 1.04 : internalH;
    const clamped = Math.round(THREE.MathUtils.clamp(next, Q.resMin, targetRes));
    if (Math.abs(clamped - internalH) >= 8) { internalH = clamped; applyInternalRes(); }
  }
  tick(Math.min(raw, 0.05));
  level.post.pipeline.render();
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
  const wall: number[] = [], gpu: number[] = [], cpu: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    tick(1 / 60); nodeFrame.update(); level.post.pipeline.render();
    cpu.push(performance.now() - t0);
    await device.queue.onSubmittedWorkDone();
    wall.push(performance.now() - t0);
    if (prof) { await renderer.resolveTimestampsAsync('render'); gpu.push(renderer.info.render.timestamp); }
  }
  const med = (a: number[]) => a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(2) : null;
  return {
    level: level.name, px: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    internal: internalSize(),
    gpuMs: med(gpu), cpuMs: med(cpu), wallMs: med(wall), drawCalls: renderer.info.render.drawCalls,
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

(window as unknown as Record<string, unknown>).ravencrest = {
  renderer, camera, anchor, world, yard, viaduct, hall, levels, pools, batchStats, setMode, capture, simulate, bench, player, quality,
  get perf() { return { frameMs: +frameEma.toFixed(1), internal: internalSize() }; },
  setRes: (h: number) => { internalH = h; applyInternalRes(); },
  get level() { return level; }, get jack() { return jack; },
  goto: (name: 'outside' | 'hall' | 'yard') => name === 'hall' ? enterLevel(levels.hall, hall.spawn.position, hall.spawn.yaw)
    : name === 'yard' ? enterLevel(levels.outside, yard.hallDoor.exitPos, yard.hallDoor.exitYaw)
      : enterLevel(levels.outside, world.spawn.position, world.spawn.yaw),
};
