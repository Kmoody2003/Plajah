// Wings + cloth lab (wings-lab.html): the Void Stalker and a Robot Paladin on a test track, to see the wings fold and
// unfurl, the membrane cloth, the outfit swing and the wind. ?wind=calm|breeze|strong|storm sets the stand-in wind.
// window.__lab drives it from a script: mode('idle'|'run'|'glide'|'turns'|'jump'), view('back'|'side'|'front'|'top'),
// step(seconds) (fixed 60 Hz sim without waiting for frames), render().
import * as THREE from 'three/webgpu';
import { assets, CharacterRig, preloadCharacters } from './characters';
import { initKTX2 } from './textures';
import { setSecondaryTier } from './secondary';

type Mode = 'idle' | 'walk' | 'run' | 'glide' | 'turns' | 'jump';
const q = new URLSearchParams(location.search);

async function main() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  setSecondaryTier(q.get('q') === 'low' ? 'low' : 'high');
  initKTX2(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3240);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30281e, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.4); sun.position.set(4, 8, 3); scene.add(sun);
  const grid = new THREE.GridHelper(400, 200, 0x557, 0x334); scene.add(grid);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 500);
  await preloadCharacters();
  if (!assets.stalker || !assets.paladin) throw new Error('characters failed to load');
  const stalker = new CharacterRig(assets.stalker, 1.9);
  const paladin = new CharacterRig(assets.paladin, 2.0);
  scene.add(stalker.root, paladin.root);

  let mode: Mode = (q.get('mode') as Mode) || 'idle';
  let view = q.get('view') || 'back';
  let t = 0, heading = 0, y = 0, vy = 0;
  const pos = new THREE.Vector3(), ppos = new THREE.Vector3(3, 0, 0);

  function sim(dt: number) {
    t += dt;
    const speed = mode === 'run' || mode === 'turns' || mode === 'glide' || mode === 'jump' ? 10 : mode === 'walk' ? 1.6 : 0;
    // turns: a slalom; glide: a slow S-curve
    const turnRate = mode === 'turns' ? Math.sin(t * 1.4) * 2.2 : mode === 'glide' ? Math.sin(t * 0.6) * 0.6 : 0;
    heading += turnRate * dt;
    pos.x += Math.sin(heading) * speed * dt; pos.z += Math.cos(heading) * speed * dt;
    if (mode === 'glide') { y = 6 + Math.sin(t * 0.3) * 0.4; vy = 0; }
    else if (mode === 'jump') { if (y <= 0 && t % 1.6 < dt) vy = 10.8; vy -= 18 * dt; y = Math.max(0, y + vy * dt); }
    else y = 0;
    stalker.root.position.set(pos.x, y, pos.z);
    stalker.root.rotation.set(0, heading, mode === 'glide' || mode === 'turns' ? -turnRate * 0.18 : 0);
    const w = stalker.wings;
    if (w) {
      const running = speed > 6;
      w.target.open = running || mode === 'glide' || (mode === 'jump' && y > 0.3) ? 1 : 0;
      w.target.sweep = mode === 'glide' ? 0 : 1;
      w.target.liftL = mode === 'glide' ? -0.2 + turnRate * 0.3 : 0;
      w.target.liftR = mode === 'glide' ? -0.2 - turnRate * 0.3 : 0;
    }
    stalker.setPoseLayer(mode === 'glide' ? 'wing_hover' : null);
    stalker.poseLayerW = mode === 'glide' ? 0.85 : 0;
    stalker.update(dt, mode === 'glide' ? 0 : speed, 0, 1);
    ppos.set(pos.x + Math.cos(heading) * 3, 0, pos.z - Math.sin(heading) * 3);
    paladin.root.position.copy(ppos); paladin.root.rotation.set(0, heading, 0);
    paladin.update(dt, speed > 6 ? 6 : speed, 0, 1);
  }
  function place() {
    const c = stalker.root.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const d = Number(q.get('dist')) || 3.4;
    const off = view === 'side' ? side.multiplyScalar(d) : view === 'front' ? back.multiplyScalar(-d) : view === 'top' ? back.multiplyScalar(2).setY(5) : view === 'fp' ? new THREE.Vector3(0, 0.45, 0) : back.multiplyScalar(d).setY(0.6);
    camera.position.copy(c).add(off);
    if (view === 'fp') camera.lookAt(c.clone().add(back.clone().multiplyScalar(-10)).setY(c.y + 0.3)); else camera.lookAt(c);
  }
  const info = document.getElementById('info')!;
  function render() { place(); renderer.render(scene, camera); info.textContent = `${mode}  open ${stalker.wings?.open.toFixed(2)}  wings ${stalker.wings?.lastMs.toFixed(2)} ms  soft ${stalker.soft?.lastMs.toFixed(3)} ms  wind ${q.get('wind') ?? 'breeze'}`; }
  const ui = document.getElementById('ui')!;
  const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ui.appendChild(b); };
  for (const m of ['idle', 'walk', 'run', 'turns', 'jump', 'glide'] as Mode[]) btn(m, () => { mode = m; });
  for (const v of ['back', 'side', 'front', 'top', 'fp']) btn('view ' + v, () => { view = v; });
  let paused = false;
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) sim(dt);
    render();
  });
  (window as unknown as { __lab: unknown }).__lab = {
    mode: (m: Mode) => { mode = m; }, view: (v: string) => { view = v; },
    step: (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) sim(1 / 60); },
    pause: (p = true) => { paused = p; }, render, stalker, paladin,
  };
}
main().catch((e) => { document.body.textContent = String(e?.stack ?? e); });
