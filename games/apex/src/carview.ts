// Car review room: the Sovereign GT-R on a dark floor, with silhouette scoring against the turntable cut-outs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeSovereign } from './car';
import { loadScanCarById, SCAN_SPECS } from './scancar';

const view = document.getElementById('view') as HTMLElement;
const scoreEl = document.getElementById('score') as HTMLElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15181f);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.65, 0);

// studio light: sky image as the environment, plus a key and a rim
const pmrem = new THREE.PMREMGenerator(renderer);
new THREE.TextureLoader().load('/games/apex/tex/sky_golden.jpg', (t) => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.9;
});
const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
key.position.set(4, 6, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9db8ff, 1.0);
rim.position.set(-5, 3, -4);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xaabbd8, 0x20232a, 0.5));
const floorTex = new THREE.TextureLoader().load('/games/apex/tex/concrete.jpg');
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(3, 3);
floorTex.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.0, color: 0x888888 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const rig = makeSovereign();
scene.add(rig.group);

const VIEWS: Record<string, { pos: [number, number, number]; tgt: [number, number, number]; fov?: number }> = {
  front34: { pos: [4.2, 1.5, 5.6], tgt: [0, 0.6, 0.2] },
  side: { pos: [9, 0.75, 0], tgt: [0, 0.68, 0], fov: 18 },
  rear: { pos: [0, 0.8, -9.5], tgt: [0, 0.68, 0], fov: 18 },
  rear34: { pos: [-4.4, 1.5, -5.6], tgt: [0, 0.6, -0.2] },
  top: { pos: [0.01, 11, 0], tgt: [0, 0.5, 0], fov: 20 },
  wheel: { pos: [2.6, 0.7, 2.6], tgt: [0.8, 0.4, 1.4] },
};
function setView(k: string): void {
  const v = VIEWS[k];
  camera.fov = v.fov ?? 32;
  camera.updateProjectionMatrix();
  camera.position.set(...v.pos);
  controls.target.set(...v.tgt);
  controls.update();
}
setView('front34');
document.querySelectorAll<HTMLButtonElement>('button[data-v]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v!)));
let spin = false;
document.getElementById('spin')!.addEventListener('click', () => { spin = !spin; });

// ---- silhouette scoring ----
async function refMask(k: number): Promise<{ w: number; h: number; a: Uint8Array }> {
  const img = new Image();
  img.src = `/car/sovereign/views/cut${k}.png`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  return { w: c.width, h: c.height, a };
}
function myMask(viewKey: string): { w: number; h: number; a: Uint8Array } {
  setView(viewKey);
  const prevBg = scene.background, prevOver = scene.overrideMaterial, prevFloor = floor.visible;
  scene.background = new THREE.Color(0xffffff);
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  floor.visible = false;
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  scene.background = prevBg; scene.overrideMaterial = prevOver; floor.visible = prevFloor;
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = px[((h - 1 - y) * w + x) * 4] < 128 ? 1 : 0;
  return { w, h, a };
}
function bbox(m: { w: number; h: number; a: Uint8Array }): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a[y * m.w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
function normalise(m: { w: number; h: number; a: Uint8Array }, W = 400, H = 200): { a: Uint8Array; ar: number } {
  const [x0, y0, x1, y1] = bbox(m);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = W / bw;
  const out = new Uint8Array(W * H);
  const oy = Math.round((H - bh * s) / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.floor(x0 + x / s), sy = Math.floor(y0 + (y - oy) / s);
    if (sy >= y0 && sy <= y1 && sx <= x1) out[y * W + x] = m.a[sy * m.w + sx];
  }
  return { a: out, ar: bw / bh };
}
function iou(a: Uint8Array, b: Uint8Array): number {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { const p = a[k], q = b[k]; if (p && q) i++; if (p || q) u++; }
  return u ? i / u : 0;
}
async function score(): Promise<string> {
  const out: string[] = [];
  for (const [name, vk, ref] of [['side (turntable 3)', 'side', 3], ['rear (turntable 4)', 'rear', 4]] as [string, string, number][]) {
    const ma = normalise(myMask(vk)), rm = normalise(await refMask(ref));
    out.push(`${name}: silhouette ${(iou(ma.a, rm.a) * 100).toFixed(1)}%  aspect mine ${ma.ar.toFixed(2)} ref ${rm.ar.toFixed(2)}`);
  }
  setView('front34');
  return out.join('\n');
}
document.getElementById('score-btn')!.addEventListener('click', async () => { scoreEl.textContent = 'scoring…'; scoreEl.textContent = await score(); });
(window as any).carScore = score;
// overlay: red = only my car, blue = only the reference, grey = both. Drawn bottom-right at 2x so shape errors are easy to read.
(window as any).carDiff = async (vk: string, ref: number): Promise<string> => {
  const ma = normalise(myMask(vk)), rm = normalise(await refMask(ref));
  const W = 400, H = 200;
  let c = document.getElementById('diffcv') as HTMLCanvasElement | null;
  if (!c) { c = document.createElement('canvas'); c.id = 'diffcv'; c.width = W; c.height = H; c.style.cssText = 'position:fixed;right:10px;bottom:10px;width:800px;height:400px;z-index:20;border:1px solid #888;background:#000;image-rendering:pixelated'; document.body.appendChild(c); }
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const a = ma.a[i], b = rm.a[i];
    const o = i * 4;
    const col = a && b ? [150, 150, 150] : a ? [255, 60, 60] : b ? [70, 120, 255] : [0, 0, 0];
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  setView('front34');
  return `iou ${(iou(ma.a, rm.a) * 100).toFixed(1)}`;
};
(window as any).carView = setView;
(window as any).carCam = (p: [number, number, number], t: [number, number, number], f = 32): void => { camera.fov = f; camera.updateProjectionMatrix(); camera.position.set(...p); controls.target.set(...t); controls.update(); };
(window as any).carRig = rig;
let scanGroup: THREE.Group | null = null;
let scanRig: import('./car').CarRig | null = null;
let scanCarId = new URLSearchParams(location.search).get('car') ?? 'kestrel';
async function useScan(on: boolean, carId?: string): Promise<void> {
  if (carId && carId !== scanCarId) {
    scanCarId = carId;
    if (scanGroup) { scene.remove(scanGroup); scanGroup = null; scanRig = null; }
  }
  if (on && !scanGroup) {
    const r = await loadScanCarById(scanCarId); scanRig = r; (window as any).scanRig = r; scanGroup = r.group; scene.add(scanGroup);
    const spec = SCAN_SPECS[scanCarId] ?? SCAN_SPECS.kestrel;
    const titleEl = document.querySelector('h1, .title, #hud strong, #hud div') as HTMLElement | null;
    if (titleEl && titleEl.textContent?.toUpperCase().includes('SOVEREIGN')) titleEl.textContent = (spec as { name?: string }).name?.toUpperCase() ?? scanCarId.toUpperCase();
    const bar = document.querySelector('button[data-v]')!.parentElement!;
    if (r.paint && !bar.querySelector('input[type="color"]')) {
      const col = document.createElement('input'); col.type = 'color'; col.value = '#' + Number(spec.paint).toString(16).padStart(6, '0'); col.title = 'paint colour';
      col.oninput = () => scanRig?.paint?.set({ color: parseInt(col.value.slice(1), 16) });
      const fin = document.createElement('select');
      ['gloss', 'satin', 'matte', 'chrome'].forEach((n, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = n; fin.appendChild(o); });
      fin.onchange = () => scanRig?.paint?.set({ finish: Number(fin.value) });
      const fl = document.createElement('input'); fl.type = 'range'; fl.min = '0'; fl.max = '1'; fl.step = '0.05'; fl.value = '0.35'; fl.title = 'metallic flake';
      fl.oninput = () => scanRig?.paint?.set({ flake: Number(fl.value) });
      bar.append(col, fin, fl);
    }
    bar.querySelectorAll('button[data-scan-panel]').forEach((b) => b.remove());
    for (const k of r.panels?.names ?? []) {
      const b = document.createElement('button'); b.dataset.scanPanel = k; b.textContent = k; b.onclick = () => r.panels!.toggle(k); bar.appendChild(b);
    }
  }
  if (scanGroup) scanGroup.visible = on;
  rig.group.visible = !on;
}
(window as any).useScan = useScan;
if (new URLSearchParams(location.search).get('scan') || new URLSearchParams(location.search).get('car')) useScan(true);

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let last = performance.now(), t = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now; t += dt;
  if (spin) rig.update(20, Math.sin(t) * 0.4, dt);
  scanRig?.update(spin ? 20 : 0, spin ? Math.sin(t) * 0.4 : 0, dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
