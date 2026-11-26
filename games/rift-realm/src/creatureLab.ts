// Dev lab for the creature rigs (creature-lab.html): one creature, its clips as buttons, orbit + fixed views.
//   ?kind=wolf&clip=run&view=side|front|back|three&speed=4&t=0.2 (t pauses the clip at that time, for side-by-sides)
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CreatureRig, loadRig, type RigKind } from './creatureRig';
import { MothSwarm } from './creatures';

const q = new URLSearchParams(location.search);
const kind = (q.get('kind') ?? 'wolf') as RigKind;
const HEIGHT: Partial<Record<RigKind, number>> = {
  wolf: 1.45, mantis: 2.5, wasp: 1.8, deer: 2.3, bat: 1.6, moth: 0.9,
  apex_drake: 2.35, amphibian_brute: 2.15, cryo_panther: 1.55, shadow_stalker_beast: 1.95,
  hydro_serpent: 1.55, bio_sloth: 1.35, bio_axolotl: 0.88, cyan_bat: 1.45, glow_beetle: 0.85,
  blue_axolotl: 0.86, bio_turtle: 1.08, sky_jelly: 1.85, cyber_dragonfly: 1.15,
  electric_newt: 0.92, acid_hornet: 1.5, venom_caterpillar: 0.95, poison_salamander: 0.88, venom_toad: 1.25,
};

const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: q.has('alpha') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
if (!q.has('alpha')) scene.background = new THREE.Color(0x1b2027);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);
const ctl = new OrbitControls(cam, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x202018, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 4); sun.castShadow = true; scene.add(sun);
if (!q.has('alpha')) {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshStandardNodeMaterial({ color: 0x2a3038, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  scene.add(new THREE.GridHelper(16, 32, 0x3a4450, 0x2a323a));
}

const H = HEIGHT[kind] ?? 1.5;
const view = q.get('view') ?? 'three';
const D = H * 2.6;
const views: Record<string, [number, number, number]> = { side: [D * 1.3, H * 0.5, 0], front: [0, H * 0.5, D * 1.3], back: [0, H * 0.5, -D * 1.3], three: [D, H * 0.8, D] };
cam.position.set(...(views[view] ?? views.three));
ctl.target.set(0, H * 0.45, 0); ctl.update();
if (view !== "three") { cam.fov = 18; cam.position.set(cam.position.x * 2, H * 0.5, cam.position.z * 2); cam.updateProjectionMatrix(); ctl.update(); }

const info = document.getElementById('info')!;
const ui = document.getElementById('ui')!;
let rig: CreatureRig | null = null;
let speed = parseFloat(q.get('speed') ?? '0');
let crouch = 0, tell = 0, held = '';
const tPause = q.has('t') ? parseFloat(q.get('t')!) : null;

// ?swarm: the moth swarm (instanced, the rig's fly clip baked to a vertex-animation texture)
const swarm = q.has('swarm') ? new MothSwarm(scene, [new THREE.Vector3(0, -0.6, 0)], 14, 0.75) : null;
const t = await loadRig(kind);
if (!t) { info.textContent = 'no rig for ' + kind; throw new Error('no rig'); }
rig = new CreatureRig(kind, t, H);
scene.add(rig.root);
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ui.appendChild(b); return b; };
for (const k of ['wolf', 'deer', 'mantis', 'wasp', 'bat', 'moth']) btn(k, () => { q.set('kind', k); location.search = q.toString(); });
ui.appendChild(document.createElement('br'));
btn('stand', () => { speed = 0; }); btn('walk 1.5', () => { speed = 1.5; }); btn('run 4', () => { speed = 4; }); btn('run 7', () => { speed = 7; });
btn('crouch', () => { crouch = crouch ? 0 : 1; }); btn('tell', () => { tell = tell ? 0 : 1; });
for (const c of rig.clipNames) {
  if (c === 'crouch' || c === 'tell') continue;
  btn(c, () => {
    if (held) { rig!.release(); held = ''; }
    if (c === 'death' || c === 'knockdown') { rig!.hold(c); held = c; } else rig!.play(c);
  });
}
btn('release', () => { rig!.release(); held = ''; });
const clipQ = q.get('clip');
if (clipQ) { if (tPause !== null || clipQ === 'death' || clipQ === 'knockdown') { rig.hold(clipQ); } else rig.play(clipQ); }
(globalThis as Record<string, unknown>).__lab = { rig, setSpeed: (s: number) => { speed = s; } };

const clock = new THREE.Clock();
let el = 0;
await renderer.init();
renderer.setAnimationLoop(() => {
  let dt = Math.min(0.05, clock.getDelta());
  if (tPause !== null) {
    // advance exactly to t once (held clip: weight ramps in over 0.1 s), then freeze
    if (el >= tPause + 0.15) dt = 0; el += dt;
  }
  rig!.crouch = crouch; rig!.tell = tell;
  rig!.update(dt, speed);
  swarm?.update(dt);
  info.textContent = `${kind}  speed ${speed}  clips: ${rig!.clipNames.join(', ')}\n` +
    Object.entries(rig!.meta).map(([k, m]) => `${k}: ${m.source ?? '?'}${m.video ? ' ' + m.video + ' ' + (m.frames ?? []).join('-') : ''}`).join('   ');
  renderer.render(scene, cam);
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
