// Character Forge kit viewer: every armour, garment and weapon asset a Forge character is built from, each loaded from
// its own GLB (scripts/eraclash3d/forgeKit.ts) and set out on the floor like a flat-lay.
//   http://127.0.0.1:4341/kit.html?kit=haru&yaw=0&pitch=0.5
// Dev hooks: window.kit.{view, capture(name)}.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { initKTX2 } from './core/ktx2';

const params = new URLSearchParams(location.search);
const kitName = params.get('kit') ?? 'haru';
const base = `/games/era-clash/3d/assets/props/${kitName}/`;
const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
initKTX2(renderer);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth || 1500, innerHeight || 1100);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('view')!.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d4cc);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 2.2));
const sun = new THREE.DirectionalLight(0xfff0e0, 2.4); sun.position.set(-2, 6, 4); scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, (innerWidth || 1500) / (innerHeight || 1100), 0.05, 100);
const view = { yaw: Number(params.get('yaw') ?? 0), pitch: Number(params.get('pitch') ?? 0.35), dist: Number(params.get('dist') ?? 4.2), x: 0, y: 0.45, z: 0 };
const place = () => { camera.position.set(view.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, view.y + Math.sin(view.pitch) * view.dist, view.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist); camera.lookAt(view.x, view.y, view.z); };

const manifest = await (await fetch(`${base}kit.json?v=${Date.now()}`)).json() as { assets: { id: string; label: string; file: string; size: number[]; tris: number; kind: string }[] };
const loader = new GLTFLoader();
document.getElementById('list')!.textContent = manifest.assets.map((a) => `${a.id.padEnd(12)} ${a.kind.padEnd(8)} ${a.size.map((v) => v.toFixed(2)).join('×')} m  ${a.tris} tris`).join('\n');
// laid out like the flat-lay: rows of pieces, each slot as wide as its piece, weapons lying in front
const loaded = await Promise.all(manifest.assets.map(async (a) => ({ a, root: (await loader.loadAsync(`${base}${a.file}?v=${Date.now()}`)).scene })));
const rows: { a: (typeof manifest.assets)[number]; root: THREE.Object3D }[][] = [[], [], []];
for (const it of loaded) (it.a.kind === 'weapon' ? rows[2] : it.a.kind === 'garment' ? rows[1] : rows[0]).push(it);
let z = 0, maxW = 0;
const byId = new Map<string, THREE.Object3D>();
for (const row of rows) {
  let x = 0, depth = 0;
  const placed: [THREE.Object3D, number][] = [];
  for (const { a, root } of row) {
    if (a.kind === 'weapon') root.rotation.z = -Math.PI / 2; // lying down, hilt to the left
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    root.position.x += x - box.min.x; root.position.y += -box.min.y; root.position.z += z - (box.min.z + box.max.z) / 2;
    placed.push([root, size.x]); x += size.x + 0.12; depth = Math.max(depth, size.z); byId.set(a.id, root);
    scene.add(root);
  }
  for (const [root] of placed) root.position.x -= (x - 0.12) / 2;
  maxW = Math.max(maxW, x); z -= depth + 0.25;
}
view.z = z / 2; view.y = 0.1; view.dist = Number(params.get('dist') ?? Math.max(2.5, maxW * 1.6));
renderer.setAnimationLoop(() => { place(); renderer.render(scene, camera); });
(window as unknown as Record<string, unknown>).kit = {
  view,
  /** Frame one asset: the camera on it, at a distance from its size. */
  focus(id: string, yaw = 0, pitch = 0.25) {
    const r = byId.get(id); if (!r) return false;
    const box = new THREE.Box3().setFromObject(r), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    Object.assign(view, { x: c.x, y: c.y, z: c.z, yaw, pitch, dist: Math.max(size.x, size.y, size.z) * 2.6 + 0.2 });
    return true;
  },
  async capture(name: string) {
    place();
    (renderer as unknown as { _nodes?: { nodeFrame?: { update(): void } } })._nodes?.nodeFrame?.update();
    renderer.render(scene, camera);
    await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: renderer.domElement.toDataURL('image/png') });
    return name;
  },
};
