// Asset review: lays the generated GLBs out in a grid so each can be judged against its source sheet.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PROPS = ['start_gantry', 'light_gantry', 'grandstand_modular', 'grandstand_steel', 'concrete_barrier', 'catch_fence', 'tire_barrier', 'pit_equipment', 'festival_props', 'food_booths', 'urban_furniture', 'rural_props', 'tree_hero', 'forest_flora', 'wetland_foliage', 'beach_grass', 'dead_pines', 'crops', 'brake_rotor', 'brake_assembly'];
const CARS = ['kestrel', 'aurelia', 'vanguard', 'helios', 'corsair', 'veloce', 'voltstrike', 'solstice', 'ironhide', 'continental', 'badlands', 'kodiak', 'sidewinder', 'terracorsa', 'kuronuma', 'apex_tcr', 'stratos_wrc', 'titan_fx4', 'dunerunner', 'legacy_gtr', 'overland_suv', 'solstice_r', 'zephyr_emotion'];

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24122e);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 500);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a2a40, 1.6));
const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
key.position.set(5, 8, 6);
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x2c2234, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(200, 100, 0x55406a, 0x33243f));

const loader = new GLTFLoader();
let group = new THREE.Group();
scene.add(group);
const info = document.getElementById('info') as HTMLElement;

function label(text: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d')!; g.font = '600 24px Outfit, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(text, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(2.4, 0.45, 1);
  return s;
}

async function show(kind: 'props' | 'cars', names: string[], base = `/assets-src/${kind}/`, ext = '.glb'): Promise<void> {
  scene.remove(group);
  group = new THREE.Group();
  scene.add(group);
  const cols = Math.ceil(Math.sqrt(names.length));
  const lines: string[] = [];
  await Promise.all(names.map(async (n, i) => {
    try {
      const g = await loader.loadAsync(`${base}${n}${ext}`);
      const o = g.scene;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      const s = (kind === 'cars' ? 4.6 : 3.2) / Math.max(size.x, size.y, size.z, 1e-6);
      o.scale.setScalar(s);
      box.setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      o.position.set(-c.x, -box.min.y, -c.z);
      const holder = new THREE.Group();
      holder.add(o);
      holder.position.set((i % cols) * 6.2, 0, Math.floor(i / cols) * 6.2);
      const lb = label(n); lb.position.set(0, 3.4, 0); holder.add(lb);
      group.add(holder);
      let tris = 0; let meshes = 0;
      o.traverse((m) => { const me = m as THREE.Mesh; if (me.isMesh) { meshes++; const idx = me.geometry.index; tris += (idx ? idx.count : me.geometry.attributes.position.count) / 3; } });
      lines.push(`${n}: ${Math.round(tris)} tris, ${meshes} meshes, raw size ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
    } catch (e) { lines.push(`${n}: failed`); }
  }));
  const w = cols * 6.2;
  camera.position.set(w * 0.5, w * 0.62, w * 1.15);
  controls.target.set(w * 0.5 - 3, 0.8, Math.ceil(names.length / cols) * 3.1 - 3);
  controls.update();
  info.textContent = lines.sort().join('\n');
}
const bar = document.getElementById('bar') as HTMLElement;
const mk = (t: string, f: () => void): void => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; bar.appendChild(b); };
mk('PROPS', () => show('props', PROPS));
mk('CARS', () => show('cars', CARS));
for (let i = 0; i < PROPS.length; i += 4) mk(`props ${i + 1}-${i + 4}`, () => show('props', PROPS.slice(i, i + 4)));
(window as any).assetShow = show;
const qs = new URLSearchParams(location.search);
if (qs.get('glb')) { const g = qs.get('glb')!; const i = g.lastIndexOf('/'); show('cars', [g.slice(i + 1).replace(/\.glb$/, '')], g.slice(0, i + 1), '.glb'); }
if (!new URLSearchParams(location.search).get('glb')) show('props', PROPS.slice(0, 4));
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
(function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
