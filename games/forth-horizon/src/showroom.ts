// The showroom stage: a turntable, lights and cameras for the car the garage screens have selected. The buying, upgrading and tuning screens are in garageUi.ts;
// the progress they work on is in garage/ and is shared with the game through localStorage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AoPass } from './ao';
import { GradePass } from './grade';
import { PhotoMode } from './photo';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadSovereignScan } from './scancar';
import type { CarRig } from './car';
import { GarageUi } from './garageUi';
import { garage, cloud } from './garageGame';
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0412);
  scene.fog = new THREE.Fog(0x0b0412, 14, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // a photographer's studio as the reflection source: big soft boxes overhead and at the sides, so the paint and glass carry long clean highlights like a real shoot
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x07040c);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, i: number, c = 0xffffff): void => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) })); m.position.set(x, y, z); studio.add(m); };
  box(14, 0.3, 5, 0, 9, 0, 3.2); box(0.3, 5, 12, -9, 4, 0, 1.8, 0xcfe0ff); box(0.3, 5, 12, 9, 4, 0, 1.8, 0xffe6c8); box(12, 4, 0.3, 0, 4, -10, 1.2); box(10, 0.2, 0.2, 0, 1.2, 8, 1.6, 0xd40055); box(10, 0.2, 0.2, 0, 1.2, -8, 1.6, 0x00daf3);
  const floorM = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x0a0610 })); floorM.rotation.x = -Math.PI / 2; studio.add(floorM);
  scene.environment = pmrem.fromScene(studio, 0.02).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(5.2, 1.7, 5.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.target.set(0, 0.6, 0);
  controls.minDistance = 0.5; controls.maxDistance = 11; controls.maxPolarAngle = Math.PI * 0.49;

  // the same post chain as the game (ambient occlusion, a touch of bloom, tone mapping, colour grade) so what you see here is what the game and the photos look like
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
  composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
  composer.addPass(new AoPass(camera, innerWidth, innerHeight));
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.06, 0.4, 0.95));
  composer.addPass(new OutputPass());
  const gradePass = new GradePass(innerWidth, innerHeight);
  composer.addPass(gradePass);

  // studio: warm key, magenta and cyan rims, a soft top light and two floor light strips
  scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x12051c, 0.55));
  const key = new THREE.SpotLight(0xfff0dc, 260, 30, 0.5, 0.6, 1.6);
  key.position.set(5, 8, 4); key.target.position.set(0, 0.4, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.radius = 7; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rimM = new THREE.PointLight(0xd40055, 30, 16, 1.6); rimM.position.set(-5.5, 2.4, -4); scene.add(rimM);
  const rimC = new THREE.PointLight(0x00daf3, 25, 16, 1.6); rimC.position.set(5.5, 2.0, -5); scene.add(rimC);
  const top = new THREE.PointLight(0xffffff, 12, 12, 1.8); top.position.set(0, 5, 0); scene.add(top);

  // turntable, floor and a curved back wall
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.7, 0.16, 96), new THREE.MeshPhysicalMaterial({ color: 0x120818, roughness: 0.14, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }));
  plinth.position.y = -0.08; plinth.receiveShadow = true; scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.47, 96), new THREE.MeshBasicMaterial({ color: 0xff8c00, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.93, 96), new THREE.MeshBasicMaterial({ color: 0xd40055, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.004; scene.add(ring2);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x0a0310, roughness: 0.55, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.16; floor.receiveShadow = true; scene.add(floor);
  // a soft contact shadow under the car: grounds it, and shows on the turntable where the lights do not
  const csC = document.createElement('canvas'); csC.width = csC.height = 256;
  { const g = csC.getContext('2d')!; const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(csC), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.006; scene.add(contact);
  const strips: THREE.Mesh[] = [];
  for (const [x, c] of [[-9, 0xd40055], [9, 0x00daf3]] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 18), new THREE.MeshBasicMaterial({ color: c }));
    s.position.set(x, 0.02, -2); strips.push(s); scene.add(s);
  }

  let rig: CarRig | null = null, model: THREE.Object3D | null = null;
  let spin = true, brake = false, token = 0;

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

  const ui = new GarageUi(garage, { show: (d, o) => { void show(d, o); } });
  (window as unknown as { garageUi: GarageUi }).garageUi = ui;
  const cs = document.getElementById('cloudStatus');
  const label = { idle: '', syncing: 'Saving…', synced: 'Saved to Plajah', offline: 'Saved on this device', conflict: 'Merging…', error: 'Cloud save failed' } as const;
  const showCloud = (): void => { if (cs) cs.textContent = label[cloud.status]; };
  cloud.onStatus = showCloud; showCloud();
  const cur = ui.current();
  void show(cur.def, cur.car);

  // camera presets: position, target and the panel to open. Car space: +z is the nose, +x the left side.
  const CAMS: Record<string, { p: [number, number, number]; t: [number, number, number]; open?: string[] }> = {
    front: { p: [4.2, 1.2, 5.6], t: [0, 0.6, 0] }, side: { p: [7.2, 1.3, 0.2], t: [0, 0.6, 0] }, rear: { p: [-4.2, 1.3, -5.6], t: [0, 0.6, 0] },
    wheel: { p: [2.3, 0.55, 2.5], t: [0.9, 0.4, 1.45] }, top: { p: [0.1, 8.5, 0.1], t: [0, 0, 0] },
    interior: { p: [2.7, 1.35, 0.9], t: [0.35, 0.9, 0.2], open: ['doorL'] }, engine: { p: [0.0, 2.1, 3.3], t: [0, 0.9, 1.5], open: ['hood'] }, trunk: { p: [0, 1.7, -4.2], t: [0, 0.8, -1.8], open: ['trunk'] },
  };
  const panelOpen: Record<string, boolean> = {};
  const syncPanelButtons = (): void => document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === '*' ? false : !!panelOpen[b.dataset.panel!]));
  let camTween2: { fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null;
  const btnSpinEl = document.getElementById('btnSpin')!;
  document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => b.addEventListener('click', () => {
    const c = CAMS[b.dataset.cam!]; if (!c) return;
    camTween2 = { fromP: camera.position.clone(), toP: new THREE.Vector3(...c.p), fromT: controls.target.clone(), toT: new THREE.Vector3(...c.t), t: 0 };
    spin = false; btnSpinEl.classList.remove('on'); if (model) model.rotation.y = 0;      // views are from the car's own side, so square it up
    if (rig?.panels) for (const n of rig.panels.names) { const want = !!c.open?.includes(n); rig.panels.set(n, want ? 1 : 0); panelOpen[n] = want; }
    syncPanelButtons();
  }));
  // doors, hood and trunk open and close like the real car
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) => b.addEventListener('click', () => {
    if (!rig?.panels) return;
    const k = b.dataset.panel!;
    if (k === '*') { const open = rig.panels.names.some((n) => !panelOpen[n]); rig.panels.names.forEach((n) => { rig!.panels!.set(n, open ? 1 : 0); panelOpen[n] = open; }); }
    else { rig.panels.toggle(k); panelOpen[k] = !panelOpen[k]; }
    syncPanelButtons();
  }));
  const btnSpin = document.getElementById('btnSpin')!;
  btnSpin.addEventListener('click', () => { spin = !spin; btnSpin.classList.toggle('on', spin); });
  controls.addEventListener('start', () => { spin = false; btnSpin.classList.remove('on'); });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
  const photo = new PhotoMode({
    rig: { renderer, camera, composer, render: () => composer.render() }, scene, controls,
    subject: () => model, panels: () => rig?.panels, grade: () => gradePass, title: () => ui.current().def.make + ' ' + ui.current().def.name,
    onEnter: () => { spin = false; btnSpinEl.classList.remove('on'); },
  });
  document.getElementById('btnPhoto')!.addEventListener('click', () => photo.enter());
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyK' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) photo.toggle(); });

  let last = performance.now();
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (model && spin) model.rotation.y += dt * 0.35;
    if (rig) rig.update(0, 0, dt, brake);                 // the scan car's own animation and lights
    if (camTween2) { camTween2.t = Math.min(1, camTween2.t + dt * 1.6); const k = camTween2.t, e = k * k * (3 - 2 * k); camera.position.lerpVectors(camTween2.fromP, camTween2.toP, e); controls.target.lerpVectors(camTween2.fromT, camTween2.toT, e); if (k >= 1) camTween2 = null; }
    (ring2.material as THREE.MeshBasicMaterial).opacity =0.45 + 0.2 * Math.sin(now / 700);
    gradePass.enabled = gradePass.active;
    if (photo.active) photo.update(); else controls.update();
    composer.render();
  };
  requestAnimationFrame(frame);
}

void boot();
