// The showroom stage: a turntable, lights and cameras for the car the garage screens have selected. The buying, upgrading and tuning screens are in garageUi.ts;
// the progress they work on is in garage/ and is shared with the game through localStorage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadSovereignScan } from './scancar';
import type { CarRig } from './car';
import { GarageUi } from './garageUi';
import { Garage } from './garage/progress';
import type { OwnedCar } from './garage/build';
import type { CarDef } from './garage/catalog';

const gltf = new GLTFLoader();


async function boot(): Promise<void> {
  const viewEl = document.getElementById('view')!;
  const sheetWrap = document.getElementById('sheetWrap')!;
  const sheetImg = document.getElementById('sheetImg') as HTMLImageElement;
  const sheetVideo = document.getElementById('sheetVideo') as HTMLVideoElement;
  const status = document.getElementById('glbStatus')!;

  // WebGL, like the game: the Sovereign is the same scanned model and shader the game drives, so it has to be drawn the same way
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0412);
  scene.fog = new THREE.Fog(0x0b0412, 14, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(5.2, 1.7, 5.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.target.set(0, 0.6, 0);
  controls.minDistance = 2.4; controls.maxDistance = 11; controls.maxPolarAngle = Math.PI * 0.49;

  // studio: warm key, magenta and cyan rims, a soft top light and two floor light strips
  scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x12051c, 0.55));
  const key = new THREE.SpotLight(0xfff0dc, 520, 30, 0.5, 0.6, 1.6);
  key.position.set(5, 8, 4); key.target.position.set(0, 0.4, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002;
  scene.add(key, key.target);
  const rimM = new THREE.PointLight(0xd40055, 90, 16, 1.6); rimM.position.set(-5.5, 2.4, -4); scene.add(rimM);
  const rimC = new THREE.PointLight(0x00daf3, 70, 16, 1.6); rimC.position.set(5.5, 2.0, -5); scene.add(rimC);
  const top = new THREE.PointLight(0xffffff, 40, 12, 1.8); top.position.set(0, 5, 0); scene.add(top);

  // turntable, floor and a curved back wall
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.7, 0.16, 96), new THREE.MeshPhysicalMaterial({ color: 0x120818, roughness: 0.14, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }));
  plinth.position.y = -0.08; plinth.receiveShadow = true; scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.47, 96), new THREE.MeshBasicMaterial({ color: 0xff8c00, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.93, 96), new THREE.MeshBasicMaterial({ color: 0xd40055, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.004; scene.add(ring2);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0a0310, roughness: 0.55, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.16; floor.receiveShadow = true; scene.add(floor);
  const strips: THREE.Mesh[] = [];
  for (const [x, c] of [[-9, 0xd40055], [9, 0x00daf3]] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 18), new THREE.MeshBasicMaterial({ color: c }));
    s.position.set(x, 0.02, -2); strips.push(s); scene.add(s);
  }

  let rig: CarRig | null = null, model: THREE.Object3D | null = null;
  let spin = true, brake = false, token = 0;
  let camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;

  function clearCar(): void {
    rig = null;
    if (model) { scene.remove(model); model = null; }
  }

  async function show(def: CarDef, owned: OwnedCar | null): Promise<void> {
    const my = ++token;
    clearCar();
    sheetWrap.style.display = 'none'; sheetVideo.pause();
    const paint = owned?.paint;
    if (def.id === 'kestrel') {
      status.textContent = 'Loading the Sovereign scan…';
      try {
        const r = await loadSovereignScan();                 // the model and paint shader the game drives
        if (my !== token) return;
        if (paint) r.paint?.set({ color: new THREE.Color(paint).getHex() });
        rig = r; model = r.group; scene.add(r.group);
        status.textContent = 'Kestrel Sovereign GT-R (the in-game model)';
      } catch (e) { status.textContent = 'The Sovereign scan failed to load: ' + String(e); }
      return;
    }
    const url = def.glbUrl ?? `/cars/${def.id}.glb`;
    const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (my !== token) return;
    if (head && head.ok) {
      try {
        const g = await gltf.loadAsync(`${url}?v=${Date.now()}`);
        if (my !== token) return;
        const m = g.scene, box = new THREE.Box3().setFromObject(m), size = new THREE.Vector3(); box.getSize(size);
        m.scale.setScalar(4.55 / Math.max(size.x, size.z, 0.001));
        if (size.x > size.z) m.rotation.y = Math.PI / 2;
        const b2 = new THREE.Box3().setFromObject(m), c2 = new THREE.Vector3(); b2.getCenter(c2);
        m.position.set(-c2.x, -b2.min.y, -c2.z);
        model = m; scene.add(m); status.textContent = `${def.make} ${def.name}`;
        return;
      } catch { /* fall through to the design sheet */ }
    }
    // no 3D model yet: show its design sheet (or turntable) on the stage
    if (def.videoUrl) { sheetImg.style.display = 'none'; sheetVideo.style.display = 'block'; sheetVideo.src = def.videoUrl; void sheetVideo.play().catch(() => { /* autoplay blocked */ }); }
    else { sheetVideo.style.display = 'none'; sheetImg.style.display = 'block'; sheetImg.src = def.sheetUrl; }
    sheetImg.onerror = () => { sheetWrap.style.display = 'none'; };
    sheetWrap.style.display = 'block';
    status.textContent = `${def.make} ${def.name}: 3D model in production`;
  }

  const ui = new GarageUi(new Garage(safeStorage()), { show: (d, o) => { void show(d, o); } });
  (window as unknown as { garageUi: GarageUi }).garageUi = ui;
  const cur = ui.current();
  void show(cur.def, cur.car);

  // camera presets
  const CAMS: Record<string, [number, number, number]> = { front: [4.2, 1.2, 5.6], side: [7.2, 1.3, 0.2], rear: [-4.2, 1.3, -5.6], wheel: [2.2, 0.55, 2.4], top: [0.1, 8.5, 0.1] };
  document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => b.addEventListener('click', () => {
    const p = CAMS[b.dataset.cam!]; camTween = { from: camera.position.clone(), to: new THREE.Vector3(...p), t: 0 };
  }));
  const btnSpin = document.getElementById('btnSpin')!, btnLights = document.getElementById('btnLights')!;
  btnSpin.addEventListener('click', () => { spin = !spin; btnSpin.classList.toggle('on', spin); });
  btnLights.addEventListener('click', () => { brake = !brake; btnLights.classList.toggle('on', brake); });
  controls.addEventListener('start', () => { spin = false; btnSpin.classList.remove('on'); });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  let last = performance.now();
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (model && spin) model.rotation.y += dt * 0.35;
    if (rig) rig.update(0, 0, dt, brake);                 // the scan car's own animation and lights
    if (camTween) { camTween.t = Math.min(1, camTween.t + dt * 1.8); const k = camTween.t, e = k * k * (3 - 2 * k); camera.position.lerpVectors(camTween.from, camTween.to, e); if (k >= 1) camTween = null; }
    (ring2.material as THREE.MeshBasicMaterial).opacity =0.45 + 0.2 * Math.sin(now / 700);
    controls.update();
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}

function safeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try { localStorage.setItem('apex.t', '1'); localStorage.removeItem('apex.t'); return localStorage; } catch { return null; }
}

void boot();
