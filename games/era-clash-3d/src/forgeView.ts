// Character Forge rig test (docs/character-forge.md §7 step 4): the current Haru and Haru v3 side by side on the same
// clip and frame, so springs, correctives and skinning can be judged against what ships today.
//   http://127.0.0.1:4340/forge.html?clip=run|blade_0|punch_0|kick_1|walk|idle&t=0.4&pause=1
// Dev hooks: window.forge.{play(name), at(t), pause(b), capture(name), stats()}.
import * as THREE from 'three/webgpu';
import { initKTX2 } from './core/ktx2';
import { loadJack, restPose, type Character } from './core/character';
import { cutMove, HARU_MOVES } from './moves';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
initKTX2(renderer);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
document.getElementById('view')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a221c);
scene.add(new THREE.HemisphereLight(0xd8c8e8, 0x5a4030, 1.6));
const sun = new THREE.DirectionalLight(0xffd0a0, 3.2);
sun.position.set(-3, 5, 6); sun.castShadow = true; sun.shadow.mapSize.setScalar(2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, far: 30 });
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x9ab8ff, 1.4); rim.position.set(4, 3, -5); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshStandardNodeMaterial({ color: 0x3d342b, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
const view = { yaw: Number(params.get('yaw') ?? 0.5), pitch: Number(params.get('pitch') ?? 0.12), dist: Number(params.get('dist') ?? 5.4), y: Number(params.get('cy') ?? 1.0), x: Number(params.get('cx') ?? 0), z: 0 };
const placeCam = () => {
  camera.position.set(view.x + Math.sin(view.yaw) * view.dist, view.y + Math.sin(view.pitch) * view.dist, view.z + Math.cos(view.yaw) * view.dist);
  camera.lookAt(view.x, view.y, view.z);
  sun.position.set(-3, 5, view.z + 6); sun.target.position.set(0, 0, view.z); sun.target.updateMatrixWorld();
};
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
let drag: [number, number] | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => { if (!drag) return; view.yaw -= (e.clientX - drag[0]) * 0.008; view.pitch = Math.max(-0.4, Math.min(1.2, view.pitch + (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; });
addEventListener('wheel', (e) => { view.dist = Math.max(1.2, Math.min(12, view.dist * (1 + e.deltaY * 0.001))); });

const stats = document.getElementById('stats')!;
const [oldHaru, newHaru] = await Promise.all([
  loadJack('haru'),
  loadJack('haru', { url: `/games/era-clash/3d/assets/characters/${params.get('model') ?? 'samurai_v3'}.glb?v=${Date.now()}` }),
]);
oldHaru.root.position.x = -0.9; newHaru.root.position.x = 0.9;
scene.add(oldHaru.root, newHaru.root);
const cast: Character[] = [oldHaru, newHaru];
// the strikes the game cuts from CMU, on both skeletons
await Promise.all(cast.flatMap((c) => Object.entries(HARU_MOVES).map(async ([k, d]) => {
  try { const m = await cutMove(c.model, k, d); if (m) c.addMove(k, m.clip); } catch (e) { console.warn(k, e); }
})));

let clip = params.get('clip') ?? 'run';
/** A held test pose on top of the rest pose (clip=rest): e.g. forge.pose('elbow'). */
let poseFn: ((c: Character) => void) | null = null;
let noCf = params.get('nocf') === '1';
const bone = (c: Character, n: string) => { let b: THREE.Object3D | undefined; c.model.traverse((o) => { if (!b && (o as THREE.Bone).isBone && o.name === n) b = o; }); return b; };
/** Rotate a bone by an angle about an axis given in world space at rest (the Forge rig's rest frames are identity). */
const turn = (c: Character, n: string, axis: [number, number, number], deg: number) => {
  const b = bone(c, n); if (!b) return;
  const p = b.parent!; const pq = p.getWorldQuaternion(new THREE.Quaternion());
  const ax = new THREE.Vector3(...axis).normalize().applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(pq.clone().invert());
  b.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, deg * Math.PI / 180));
};
const POSES: Record<string, (c: Character) => void> = {
  // children first, while their parents are still at rest, so a world axis is the joint's own hinge
  elbow: (c) => { turn(c, 'LeftForeArm', [-0.76, -0.62, 0], 125); turn(c, 'RightForeArm', [-0.76, 0.62, 0], 125); turn(c, 'LeftArm', [0, 0, 1], -35); turn(c, 'RightArm', [0, 0, 1], 35); },
  raise: (c) => { turn(c, 'LeftArm', [0, 0, 1], 105); turn(c, 'RightArm', [0, 0, 1], -105); },
  down: (c) => { turn(c, 'LeftArm', [0, 0, 1], -38); turn(c, 'RightArm', [0, 0, 1], 38); },
  squat: (c) => { for (const s of ['Left', 'Right']) { turn(c, `${s}Leg`, [1, 0, 0], 120); turn(c, `${s}UpLeg`, [1, 0, 0], -95); } },
};
let paused = params.get('pause') === '1';
let tAt = Number(params.get('t') ?? -1);
/** Moving clips travel: both figures run forward and loop back, so springs see real speed. */
let travel = 0;
const play = (name: string) => {
  clip = name;
  for (const c of cast) {
    c.cancel();
    if (name === 'idle' || name === 'walk' || name === 'run') c.play(name);
    else { c.play('idle'); c.act(name); }
  }
};
const clipsDiv = document.getElementById('clips')!;
for (const name of ['rest', 'idle', 'walk', 'run', 'blade_0', 'blade_1', 'blade_2', 'punch_0', 'kick_1', 'cleave', 'spinKick']) {
  const b = document.createElement('button'); b.textContent = name; b.onclick = () => play(name); clipsDiv.appendChild(b);
}
play(clip);

const clock = new THREE.Clock();
let acc = 0;
renderer.setAnimationLoop(() => {
  let dt = Math.min(clock.getDelta(), 1 / 20);
  if (paused) dt = 0;
  if (tAt >= 0) { // scrub: step from the start at 60 Hz so springs integrate through the motion
    play(clip);
    for (let t = 0; t < tAt; t += 1 / 60) for (const c of cast) { stepTravel(c, 1 / 60); c.mixer.update(1 / 60); }
    tAt = -1; paused = true;
  }
  if (clip === 'rest') for (const c of cast) { restPose(c.model); poseFn?.(c); if (c.forge && !noCf) c.forge.update(dt || 1 / 60); }
  else for (const c of cast) { stepTravel(c, dt); c.mixer.update(dt); }
  // one-shots end: start them again so the pair keeps striking
  if (!paused && clip !== 'rest' && clip !== 'idle' && clip !== 'walk' && clip !== 'run' && !newHaru.acting) play(clip);
  placeCam();
  renderer.render(scene, camera);
  acc += dt;
  if (acc > 0.25) {
    acc = 0;
    const f = newHaru.forge;
    stats.textContent = f
      ? `forge rig ${f.costMs.toFixed(3)} ms (springs ${f.springs.lastMs.toFixed(3)} ms, ${f.springs.chains.length} chains)\n` +
        [...f.drivers.weights].filter(([, w]) => w > 0.01).map(([k, w]) => `${k} ${w.toFixed(2)}`).join('  ')
      : 'v3 has no forge rig';
  }
});
/** Moving clips travel for real (the clips are in place): both run forward, so springs feel the speed and the stop. */
function stepTravel(c: Character, dt: number) {
  const speed = clip === 'run' ? 4.3 : clip === 'walk' ? 1.45 : 0;
  if (speed) c.setLocomotion(speed, 1.45, 4.3);
  c.root.position.z += speed * dt;
  if (c === cast[cast.length - 1]) { travel = c.root.position.z; view.z = travel; }
}

(window as unknown as Record<string, unknown>).forge = {
  play, cast,
  pose(name: string | null) { clip = 'rest'; poseFn = name ? POSES[name] : null; },
  correctives(on: boolean) { noCf = !on; if (!on) for (const c of cast) c.model.traverse((o) => { const m = o as THREE.Mesh; if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0); }); },
  at(t: number) { tAt = t; },
  pause(b: boolean) { paused = b; },
  view,
  stats: () => stats.textContent,
  /** GPU+CPU ms one figure adds to a frame: renders back-to-back with it shown and hidden (the other is hidden). */
  async cost(which = 1, n = 40, rounds = 4) {
    const dev = (renderer.backend as unknown as { device: GPUDevice }).device;
    const c = cast[which], other = cast[1 - which];
    other.root.visible = false;
    const run = async () => { for (let i = 0; i < 4; i++) renderer.render(scene, camera); await dev.queue.onSubmittedWorkDone(); const t0 = performance.now(); for (let i = 0; i < n; i++) { c.mixer.update(1 / 60); renderer.render(scene, camera); await dev.queue.onSubmittedWorkDone(); } return (performance.now() - t0) / n; };
    const shown: number[] = [], hidden: number[] = [];
    for (let k = 0; k < rounds; k++) { c.root.visible = true; shown.push(await run()); c.root.visible = false; hidden.push(await run()); }
    c.root.visible = true; other.root.visible = true;
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return { shownMs: +med(shown).toFixed(2), hiddenMs: +med(hidden).toFixed(2), figureMs: +(med(shown) - med(hidden)).toFixed(2) };
  },
  /** ms per frame for the v3 rig (twists, grips, correctives, springs) over n frames, and springs alone. */
  bench(n = 600) {
    const f = newHaru.forge!; const t0 = performance.now();
    for (let i = 0; i < n; i++) f.update(1 / 60);
    const rig = (performance.now() - t0) / n;
    const t1 = performance.now();
    for (let i = 0; i < n; i++) f.springs.update(1 / 60);
    return { rigMs: rig, springsMs: (performance.now() - t1) / n, chains: f.springs.chains.length, joints: f.springs.chains.reduce((a, c) => a + c.joints.length, 0) };
  },
  /** Play `name` from its start to `t` seconds at 60 Hz right now (springs integrate through it), then hold. */
  scrub(name: string, t: number, lead = 0) {
    paused = true; tAt = -1;
    // from a clean start: clips at time zero, both back at the origin, springs at rest
    for (const c of cast) { c.cancel(); c.mixer.setTime(0); c.root.position.z = 0; c.forge?.springs.reset(); }
    view.z = 0;
    if (lead) { const keep = clip; clip = 'run'; for (let s = 0; s < lead; s += 1 / 60) for (const c of cast) { stepTravel(c, 1 / 60); c.mixer.update(1 / 60); } clip = keep; }
    play(name);
    for (let s = 0; s < t; s += 1 / 60) for (const c of cast) { stepTravel(c, 1 / 60); c.mixer.update(1 / 60); }
    placeCam(); renderer.render(scene, camera);
  },
  async capture(name: string) {
    placeCam();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
    return name;
  },
};
