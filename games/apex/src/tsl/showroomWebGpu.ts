// games/apex/src/tsl/showroomWebGpu.ts
//
// Native Unified Playkit WebGPU + TSL + SSR Studio Showroom for Plajah Motorsport: Apex (`showroom.html?webgpu=1`).
// Runs on `THREE.WebGPURenderer` + `playkit/render/unifiedPost.ts` (GTAO + Studio Turntable SSR +
// Bloom + FXAA + 33^3 Filmic LUT) + `apexPostTsl.ts` (clarity + Plajah film lenses) + `carPaintTsl.ts`
// (OEM metallic/flake/pearl/clearcoat/hex-grille/panel-seams) while keeping 100% of GarageUi,
// opening doors/hood/trunk, real modelled wheels, camera presets & Photo Mode intact!

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlaykitPostPipeline } from '../../../../playkit/render/unifiedPost';
import { PlaykitSceneLightingController } from '../../../../playkit/render/liveLighting';
import { sanitizeObjectForWebGPU } from './apexMaterialsTsl';
import { createApexPostStage } from './apexPostTsl';
import { upgradeCarRigToWebGPU } from './apexWebGpuAdapter';
import { hasScanCar, loadScanCarById } from '../scancar';
import type { CarRig } from '../car';
import { GarageUi } from '../garageUi';
import { garage, cloud } from '../garageGame';
import type { OwnedCar } from '../garage/build';
import { CAR_BY_ID, type CarDef } from '../garage/catalog';
import { PhotoMode } from '../photo';
import type { GameLens } from '../grade';

const gltf = new GLTFLoader();

export async function bootShowroomWebGpu(): Promise<void> {
  const viewEl = document.getElementById('view')!;
  const sheetWrap = document.getElementById('sheetWrap')!;
  const sheetImg = document.getElementById('sheetImg') as HTMLImageElement;
  const sheetVideo = document.getElementById('sheetVideo') as HTMLVideoElement;
  const status = document.getElementById('glbStatus')!;
  const params = new URLSearchParams(location.search);

  const renderer = new THREE.WebGPURenderer({
    antialias: false,
    powerPreference: 'high-performance',
    forceWebGL: params.has('webgl'),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  viewEl.appendChild(renderer.domElement);
  await renderer.init();

  const backendLabel = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0412);
  scene.fog = new THREE.Fog(0x0b0412, 14, 36);

  // Studio photographer softbox environment captured via WebGPU PMREMGenerator
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x07040c);
  const addSoftbox = (w: number, h: number, d: number, x: number, y: number, z: number, intensity: number, hex = 0xffffff): void => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) }),
    );
    m.position.set(x, y, z);
    studio.add(m);
  };
  addSoftbox(14, 0.3, 5, 0, 9, 0, 3.2);
  addSoftbox(0.3, 5, 12, -9, 4, 0, 1.8, 0xcfe0ff);
  addSoftbox(0.3, 5, 12, 9, 4, 0, 1.8, 0xffe6c8);
  addSoftbox(12, 4, 0.3, 0, 4, -10, 1.2);
  addSoftbox(10, 0.2, 0.2, 0, 1.2, 8, 0.55, 0xd40055);
  addSoftbox(10, 0.2, 0.2, 0, 1.2, -8, 0.55, 0x00daf3);
  const studioFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x0a0610 }));
  studioFloor.rotation.x = -Math.PI / 2;
  studio.add(studioFloor);
  try {
    scene.environment = pmrem.fromScene(studio, 0.02).texture;
    scene.environmentIntensity = 0.65;
  } catch (err) {
    console.warn('[showroom-webgpu] studio PMREM fallback:', err);
  }

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(5.2, 1.7, 5.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.6, 0);
  controls.minDistance = 0.5;
  controls.maxDistance = 11;
  controls.maxPolarAngle = Math.PI * 0.49;

  // Playkit SH9 studio GI bounce (warm overhead + subtle neon rim floor fill)
  const playkitLighting = new PlaykitSceneLightingController(scene, {
    activePointLights: 4,
    maxLightDistanceM: 32,
    palette: {
      skyColor: [0.32, 0.28, 0.44],
      canopyBounceColor: [0.22, 0.16, 0.28],
      groundColor: [0.12, 0.08, 0.16],
      interiorWarmColor: [0.55, 0.44, 0.36],
      sunColor: [1.0, 0.94, 0.86],
      sunDir: [0.5, 0.8, 0.4],
    },
  });
  playkitLighting.bakeProbes([{ x: 0, y: 1.2, z: 0, kind: 'interior' }]);

  // Studio lights: warm key + magenta & cyan rims + soft overhead fill
  scene.add(new THREE.HemisphereLight(0xcdb8ff, 0x12051c, 0.6));
  const key = new THREE.SpotLight(0xfff0dc, 260, 30, 0.5, 0.6, 1.6);
  key.position.set(5, 8, 4);
  key.target.position.set(0, 0.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rimM = new THREE.PointLight(0xb02868, 6, 16, 1.8); rimM.position.set(-5.5, 2.4, -4); scene.add(rimM);
  const rimC = new THREE.PointLight(0x00daf3, 7, 16, 1.8); rimC.position.set(5.5, 2.0, -5); scene.add(rimC);
  const top = new THREE.PointLight(0xffffff, 12, 12, 1.8); top.position.set(0, 5, 0); scene.add(top);

  // Satin-gloss turntable plinth + epoxy floor tuned for live Playkit Screen-Space Reflections (SSR!)
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.7, 0.16, 96),
    new THREE.MeshPhysicalNodeMaterial({ color: 0x110c16, roughness: 0.14, metalness: 0.24, clearcoat: 0.35, clearcoatRoughness: 0.14 }),
  );
  plinth.position.y = -0.08;
  plinth.receiveShadow = true;
  scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.47, 96), new THREE.MeshBasicMaterial({ color: 0xff8c00, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.93, 96), new THREE.MeshBasicMaterial({ color: 0xd40055, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }));
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.004; scene.add(ring2);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardNodeMaterial({ color: 0x0a0310, roughness: 0.22, metalness: 0.28 }),
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.16; floor.receiveShadow = true; scene.add(floor);

  // Soft grounded studio contact shadow under car
  const csC = document.createElement('canvas'); csC.width = csC.height = 256;
  const gCtx = csC.getContext('2d')!;
  const gr = gCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,.85)');
  gr.addColorStop(0.55, 'rgba(0,0,0,.45)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  gCtx.fillStyle = gr; gCtx.fillRect(0, 0, 256, 256);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(csC), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.006; scene.add(contact);

  for (const [x, c] of [[-9, 0xd40055], [9, 0x00daf3]] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 18), new THREE.MeshBasicMaterial({ color: c }));
    s.position.set(x, 0.02, -2);
    scene.add(s);
  }

  // Unified Playkit WebGPU Post Stack: GTAO + Real-Time Studio Turntable SSR + Bloom + Apex Post + FXAA + 33^3 LUT!
  scene.userData.look = {
    aoRadius: 0.65,
    aoScale: 0.9,
    bloomStrength: 0.22,
    bloomRadius: 0.4,
    bloomThreshold: 1.05,
    contrast: 1.03,
    toe: 0.02,
    warm: 0.06,
  };
  const apexPost = createApexPostStage();
  const useSsr = !params.has('nossr');
  const post = createPlaykitPostPipeline(renderer, scene, camera, {
    ao: true,
    ssr: useSsr,
    ssrScale: 0.65,
    fxaa: true,
    bloom: 'full',
    lut: true,
    lutPreset: 'era-clash-cinema',
    lutStrength: 0.20,
    stylize: apexPost.stylize,
  });

  // Add a quick return-to-WebGL2 switcher pill next to btnPhoto
  const btnPhoto = document.getElementById('btnPhoto');
  if (btnPhoto?.parentElement) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = `${backendLabel}${useSsr ? ' + SSR' : ''}`;
    toggle.title = 'Click to switch back to WebGL2 showroom';
    toggle.style.cssText = 'border-color:#00daf3;color:#00daf3';
    toggle.addEventListener('click', () => {
      const next = new URL(location.href);
      next.searchParams.delete('webgpu');
      location.href = next.toString();
    });
    btnPhoto.parentElement.appendChild(toggle);
  }

  let rig: CarRig | null = null, model: THREE.Object3D | null = null;
  let spin = true, brake = false, token = 0;
  let activeLens: GameLens = 'none';

  function clearCar(): void {
    rig = null;
    if (model) { scene.remove(model); model = null; }
  }

  async function show(def: CarDef, owned: OwnedCar | null): Promise<void> {
    const my = ++token;
    clearCar();
    sheetWrap.style.display = 'none'; sheetVideo.pause();
    const paint = owned?.paint;
    if (hasScanCar(def.id)) {
      status.textContent = `Loading ${def.make} ${def.name} (${backendLabel})…`;
      try {
        const rawRig = await loadScanCarById(def.id);
        if (my !== token) return;
        const r = upgradeCarRigToWebGPU(
          rawRig,
          playkitLighting.uniforms,
          paint ? new THREE.Color(paint).getHex() : undefined,
        );
        if (paint) r.paint?.set({ color: new THREE.Color(paint).getHex() });
        rig = r; model = r.group; scene.add(r.group);
        status.textContent = `${def.make} ${def.name} · Playkit ${backendLabel}${useSsr ? ' + SSR' : ''}`;
      } catch (e) { status.textContent = `${def.name} failed to load: ` + String(e); }
      return;
    }
    const allowCad = def.body !== 'pending' || location.search.includes('cad=1');
    const url = def.glbUrl ?? `/cars/${def.id}.glb`;
    const head = allowCad ? await fetch(url, { method: 'HEAD' }).catch(() => null) : null;
    if (my !== token) return;
    if (head && head.ok) {
      try {
        const g = await gltf.loadAsync(`${url}?v=${Date.now()}`);
        if (my !== token) return;
        const m = g.scene;
        sanitizeObjectForWebGPU(m);
        const box = new THREE.Box3().setFromObject(m), size = new THREE.Vector3(); box.getSize(size);
        m.scale.setScalar(4.55 / Math.max(size.x, size.z, 0.001));
        if (size.x > size.z) m.rotation.y = Math.PI / 2;
        const b2 = new THREE.Box3().setFromObject(m), c2 = new THREE.Vector3(); b2.getCenter(c2);
        m.position.set(-c2.x, -b2.min.y, -c2.z);
        model = m; scene.add(m); status.textContent = `${def.make} ${def.name} · ${backendLabel}`;
        return;
      } catch { /* fall through */ }
    }
    if (def.videoUrl) { sheetImg.style.display = 'none'; sheetVideo.style.display = 'block'; sheetVideo.src = def.videoUrl; void sheetVideo.play().catch(() => {}); }
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
  const qCar = params.get('car');
  if (qCar && CAR_BY_ID[qCar]) {
    document.querySelector<HTMLButtonElement>('[data-tab="showroom"]')?.click();
    const pick = document.querySelector<HTMLElement>(`[data-act="pick-def"][data-id="${qCar}"]`);
    if (pick) pick.click();
    else void show(CAR_BY_ID[qCar], null);
  } else {
    void show(cur.def, cur.car);
  }

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
    spin = false; btnSpinEl.classList.remove('on'); if (model) model.rotation.y = 0;
    if (rig?.panels) for (const n of rig.panels.names) { const want = !!c.open?.includes(n); rig.panels.set(n, want ? 1 : 0); panelOpen[n] = want; }
    syncPanelButtons();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) => b.addEventListener('click', () => {
    if (!rig?.panels) return;
    const k = b.dataset.panel!;
    if (k === '*') { const open = rig.panels.names.some((n) => !panelOpen[n]); rig.panels.names.forEach((n) => { rig!.panels!.set(n, open ? 1 : 0); panelOpen[n] = open; }); }
    else { rig.panels.toggle(k); panelOpen[k] = !panelOpen[k]; }
    syncPanelButtons();
  }));
  btnSpinEl.addEventListener('click', () => { spin = !spin; btnSpinEl.classList.toggle('on', spin); });
  controls.addEventListener('start', () => { spin = false; btnSpinEl.classList.remove('on'); });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  const renderNow = () => { if (post) post.render(); else renderer.render(scene, camera); };
  const fakeGrade = {
    get lut() { return 'none'; }, set lut(_v: string) { /* bridged via Playkit LUT */ },
    get lutAmount() { return 1; }, set lutAmount(_v: number) {},
    get lens() { return activeLens; }, set lens(v: GameLens) { activeLens = v; },
    speed: 0,
  };
  const photo = new PhotoMode({
    rig: { renderer: renderer as never, camera, composer: null, render: renderNow },
    scene: scene as unknown as THREE.Scene,
    controls,
    subject: () => model,
    panels: () => rig?.panels,
    grade: () => fakeGrade as never,
    title: () => ui.current().def.make + ' ' + ui.current().def.name,
    onEnter: () => { spin = false; btnSpinEl.classList.remove('on'); },
  });
  btnPhoto?.addEventListener('click', () => photo.enter());
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyK' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) photo.toggle(); });

  (window as unknown as { showroomWebGpu?: unknown }).showroomWebGpu = {
    backend: backendLabel,
    passes: post?.activePasses ?? [],
    ssr: useSsr,
  };

  const focusOrigin = new THREE.Vector3(0, 0.8, 0);
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (model && spin) model.rotation.y += dt * 0.35;
    if (rig) rig.update(0, 0, dt, brake);
    if (camTween2) {
      camTween2.t = Math.min(1, camTween2.t + dt * 1.6);
      const k = camTween2.t, e = k * k * (3 - 2 * k);
      camera.position.lerpVectors(camTween2.fromP, camTween2.toP, e);
      controls.target.lerpVectors(camTween2.fromT, camTween2.toT, e);
      if (k >= 1) camTween2 = null;
    }
    (ring2.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.2 * Math.sin(now / 700);
    playkitLighting.update(dt, camera, focusOrigin, 0, 0.7);
    apexPost.update({ dt, speed01: 0, aspect: innerWidth / Math.max(1, innerHeight), lens: activeLens, grain: 0.004 });
    if (photo.active) photo.update(); else controls.update();
    renderNow();
  });
}
