import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARS, type CarId } from './manufacturers';
import { buildCarVisual, type CarVisual } from './carMesh';

const showroomGltf = new GLTFLoader();

interface RosterEntry {
  id: string;
  carId?: CarId;
  name: string;
  classLabel: string;
  drivetrain: string;
  power: string;
  weight: string;
  sheetUrl: string;
  summary: string;
}

const ROSTER: RosterEntry[] = [
  {
    id: 'kestrel',
    carId: 'kestrel',
    name: 'Kestrel Sovereign GT-R',
    classLabel: 'S1 · 840',
    drivetrain: '6.2L SC V8 · RWD',
    power: '760 HP / 890 Nm',
    weight: '1,480 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-kestrel-sovereign-gtr-0-840ec063-92dd-482b-94c0-b7fba02e715a.webp',
    summary: 'Hero American muscle-GT supercar forged in Ironport. Front-mid V8, widebody carbon aero.',
  },
  {
    id: 'aurelia',
    carId: 'aurelia',
    name: 'Aurelia Zephyr Apex',
    classLabel: 'S2 · 920',
    drivetrain: '5.2L V10 · AWD',
    power: '820 HP / 690 Nm',
    weight: '1,260 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-aurelia-zephyr-apex-0-40b6062a-8596-4f21-bcab-7b1fd984df89.webp',
    summary: 'Carbon-monocoque track weapon with teardrop canopy and swan-neck rear wing.',
  },
  {
    id: 'ironhide',
    name: 'Meridian Ironhide 440',
    classLabel: 'A · 740',
    drivetrain: '7.0L V8 · RWD',
    power: '560 HP',
    weight: '1,720 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-meridian-ironhide-440-v2-0-c0626eaf-04fb-47a7-bd4c-fa42eaa4eb2a.webp',
    summary: 'Retro-modern Detroit brawler built on a heavy steel unibody.',
  },
  {
    id: 'kodiak',
    name: 'Meridian Kodiak 1500',
    classLabel: 'B · 620',
    drivetrain: '6.6L V8 · 4WD',
    power: '490 HP',
    weight: '2,350 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-meridian-kodiak-1500-0-aab12f49-d1b3-4259-8661-a7b4a16370d1.webp',
    summary: 'Full-size Dune Sea & Baja off-road desert truck.',
  },
  {
    id: 'continental',
    name: 'Meridian Continental 67',
    classLabel: 'C · 510',
    drivetrain: 'Classic V8 · RWD',
    power: '390 HP',
    weight: '1,640 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-meridian-continental-67-v2-0-4c444522-57e5-45b3-a36f-f3d01c5e6a3d.webp',
    summary: '1967 Motor City heritage fastback cruiser.',
  },
  {
    id: 'voltstrike',
    name: 'Halcyon Voltstrike S',
    classLabel: 'S1 · 860',
    drivetrain: 'Tri-Motor EV · AWD',
    power: '920 HP',
    weight: '1,820 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-halcyon-voltstrike-s-v2-0-8e97db1d-15a2-4c57-b3a0-782ed19051f8.webp',
    summary: 'Instant-torque electric performance sedan for Lakeshore sweepers.',
  },
  {
    id: 'solstice',
    name: 'Halcyon Solstice GT',
    classLabel: 'S2 · 940',
    drivetrain: 'Quad-Motor EV · AWD',
    power: '1,180 HP',
    weight: '1,690 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-halcyon-solstice-gt-v2-0-5ede5a8e-34af-4199-aebc-171f7faceca5.webp',
    summary: 'Active-aero electric grand tourer.',
  },
  {
    id: 'helios',
    name: 'Halcyon Helios X1',
    classLabel: 'X · 999',
    drivetrain: 'Axial Flux EV · AWD',
    power: '1,450 HP',
    weight: '1,410 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-halcyon-helios-x1-0-22e19dd0-6992-416a-813d-0154264e4df7.webp',
    summary: 'Hyper-experimental flagship from the Legends of Elohim future division.',
  },
  {
    id: 'badlands',
    name: 'Kestrel Badlands XT',
    classLabel: 'A · 720',
    drivetrain: '3.5L Twin-Turbo · 4WD',
    power: '540 HP',
    weight: '2,040 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-kestrel-badlands-xt-0-3b3a5216-2957-4519-8eae-7ee0ab0d3aa5.webp',
    summary: 'Long-travel dune & forest rally raid runner.',
  },
  {
    id: 'sidewinder',
    name: 'Kestrel Sidewinder',
    classLabel: 'A · 780',
    drivetrain: '5.0L V8 · RWD',
    power: '610 HP',
    weight: '1,420 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-kestrel-sidewinder-v2-0-4fdafafd-313a-4c7d-95a5-cdac76c13ddd.webp',
    summary: 'Lightweight drift & street-circuit coupe.',
  },
  {
    id: 'terracorsa',
    name: 'Aurelia Terra Corsa',
    classLabel: 'A · 790',
    drivetrain: '4.0L Flat-6 · AWD',
    power: '520 HP',
    weight: '1,340 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-aurelia-terra-corsa-0-fa3d02cf-8594-4669-b613-bd4eb9ae125e.webp',
    summary: 'Lifted gravel & Pinewood Forest rally supercar.',
  },
  {
    id: 'veloce',
    name: 'Aurelia Veloce Spyder',
    classLabel: 'S1 · 870',
    drivetrain: '4.5L V8 · RWD',
    power: '710 HP',
    weight: '1,310 kg',
    sheetUrl: '/ironport-assets/concept-art/media-generation-aurelia-veloce-spyder-0-085cdb7b-af49-41e2-b36a-75ff2d04a8f1.webp',
    summary: 'Open-top coastal GT built for the Lakeshore Bluffs.',
  },
  // Additional 11 vehicles from Nov 15 - 14_22
  {
    id: 'corsair',
    name: 'Ironport Corsair RS',
    classLabel: 'A · 760',
    drivetrain: '6.4L V8 · RWD',
    power: '640 HP',
    weight: '1,620 kg',
    sheetUrl: '/racer-refs/Ironport_Corsair_RS_muscle_car_1eef7ba7.jpg',
    summary: 'Widebody Detroit muscle-coupe from the Nov 15 turntable & sheet set.',
  },
  {
    id: 'kuronuma',
    name: 'Kuronuma GT-6',
    classLabel: 'S1 · 830',
    drivetrain: '3.6L Twin-Turbo · RWD',
    power: '680 HP',
    weight: '1,360 kg',
    sheetUrl: '/racer-refs/Kuronuma_GT-6_coupe_design_sheet_80915908.jpg',
    summary: 'Drift-tuned twin-turbo coupe built for Ironport night streets.',
  },
  {
    id: 'vanguard',
    name: 'Vanguard Apex GT',
    classLabel: 'S2 · 930',
    drivetrain: '4.2L V8 · RWD',
    power: '840 HP',
    weight: '1,240 kg',
    sheetUrl: '/racer-refs/Vanguard_Apex_GT_rear_view_ffe2fcfd.jpg',
    summary: 'Flagship circuit GT with active diffuser and glowing twin-exit exhaust.',
  },
  {
    id: 'apex_tcr',
    name: 'Apex TCR Spec-2',
    classLabel: 'A · 750',
    drivetrain: '2.0L Turbo · FWD',
    power: '380 HP',
    weight: '1,210 kg',
    sheetUrl: '/racer-refs/Apex_TCR_Spec-2_touring_car_57cda8b3.jpg',
    summary: 'Homologated touring car for Ironport Grand Circuit.',
  },
  {
    id: 'stratos_wrc',
    name: 'Veloce Stratos WRC',
    classLabel: 'A · 790',
    drivetrain: '1.6L Turbo · AWD',
    power: '420 HP',
    weight: '1,190 kg',
    sheetUrl: '/racer-refs/Veloce_Stratos_WRC_rally_car_853f35e3.jpg',
    summary: 'Pinewood Forest & gravel rally hatch.',
  },
  {
    id: 'titan_fx4',
    name: 'Titan Ridge FX4',
    classLabel: 'B · 640',
    drivetrain: '6.8L V8 · 4WD',
    power: '580 HP',
    weight: '2,280 kg',
    sheetUrl: '/racer-refs/Titan_Ridge_FX4_trophy_truck_dde1c24e.jpg',
    summary: 'Long-travel Dune Sea trophy truck.',
  },
  {
    id: 'dunerunner',
    name: 'DuneRunner V8 Buggy',
    classLabel: 'A · 710',
    drivetrain: '6.2L V8 · 4WD',
    power: '610 HP',
    weight: '1,390 kg',
    sheetUrl: '/racer-refs/DuneRunner_V8_Buggy_design_turna…_29e94c61.jpg',
    summary: 'Tubular desert & Silver Lake dune buggy.',
  },
  {
    id: 'zephyr_emotion',
    name: 'Zephyr E-Motion',
    classLabel: 'A · 770',
    drivetrain: 'Dual-Motor EV · AWD',
    power: '690 HP',
    weight: '1,860 kg',
    sheetUrl: '/racer-refs/Zephyr_E-Motion_design_turnaroun…_3d23caa3.jpg',
    summary: 'Aerodynamic electric fastback sedan.',
  },
  {
    id: 'solstice_r',
    name: 'Solstice Aero R',
    classLabel: 'S2 · 950',
    drivetrain: 'Track EV · AWD',
    power: '1,240 HP',
    weight: '1,580 kg',
    sheetUrl: '/racer-refs/Solstice_Aero_R_rear_view_572ac645.jpg',
    summary: 'Track-spec aero evolution of the Solstice GT.',
  },
  {
    id: 'legacy_gtr',
    name: 'Legacy GT-R 1975',
    classLabel: 'B · 610',
    drivetrain: '3.0L I6 · RWD',
    power: '340 HP',
    weight: '1,120 kg',
    sheetUrl: '/racer-refs/Vintage_racecar_design_sheet_52244cfd.jpg',
    summary: '1975 vintage touring/GT racecar.',
  },
  {
    id: 'overland_suv',
    name: 'Kestrel Overland 4x4',
    classLabel: 'B · 600',
    drivetrain: '4.4L V8 · 4WD',
    power: '460 HP',
    weight: '2,410 kg',
    sheetUrl: '/racer-refs/Dakar_SUV_design_sheet_4d47548a.jpg',
    summary: 'Dakar-spec overland 4x4 SUV.',
  },
];

async function bootShowroom() {
  const viewEl = document.getElementById('view')!;
  const rosterEl = document.getElementById('roster')!;
  const sheetImg = document.getElementById('sheetImg') as HTMLImageElement;
  const specTitle = document.getElementById('specTitle')!;
  const specSub = document.getElementById('specSub')!;
  const specGrid = document.getElementById('specGrid')!;
  const glbStatus = document.getElementById('glbStatus')!;
  const btnSpin = document.getElementById('btnSpin')!;
  const btnLights = document.getElementById('btnLights')!;

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  viewEl.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090c12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(4.3, 1.85, 4.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.6, 0);
  controls.minDistance = 2.6;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.48;

  // Studio 3-point lighting
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x111827, 0.8));
  const key = new THREE.DirectionalLight(0xfff1db, 3.4);
  key.position.set(5, 7, 5);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x38bdf8, 2.2);
  rim.position.set(-6, 3, -5);
  scene.add(rim);

  // Turntable plinth
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.6, 0.14, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x12161f, roughness: 0.18, metalness: 0.45, clearcoat: 0.9 })
  );
  plinth.position.y = -0.07;
  plinth.receiveShadow = true;
  scene.add(plinth);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.38, 3.44, 64),
    new THREE.MeshBasicMaterial({ color: 0xff6b2b, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.005;
  scene.add(ring);

  let currentVisual: CarVisual | null = null;
  let currentGlbOnly: THREE.Group | null = null;
  let autoSpin = true;
  let brakeGlow = false;

  async function selectEntry(entry: RosterEntry) {
    document.querySelectorAll('.car-card').forEach((c) => {
      c.classList.toggle('active', c.getAttribute('data-id') === entry.id);
    });
    sheetImg.src = entry.sheetUrl;
    specTitle.textContent = entry.name;
    specSub.textContent = entry.summary;
    specGrid.innerHTML = `
      <div class="sg-item"><div class="sg-lbl">Class</div><div class="sg-val">${entry.classLabel}</div></div>
      <div class="sg-item"><div class="sg-lbl">Power</div><div class="sg-val">${entry.power}</div></div>
      <div class="sg-item"><div class="sg-lbl">Drivetrain</div><div class="sg-val">${entry.drivetrain}</div></div>
      <div class="sg-item"><div class="sg-lbl">Weight</div><div class="sg-val">${entry.weight}</div></div>
    `;

    if (currentVisual) {
      scene.remove(currentVisual.root);
      currentVisual = null;
    }
    if (currentGlbOnly) {
      scene.remove(currentGlbOnly);
      currentGlbOnly = null;
    }

    const res = await fetch(`/cars/${entry.id}.glb?v=${Date.now()}`, { method: 'HEAD' }).catch(() => null);
    const hasGlb = Boolean(res && res.ok);

    if (entry.carId) {
      currentVisual = buildCarVisual(CARS[entry.carId], false);
      scene.add(currentVisual.root);
      glbStatus.textContent = hasGlb
        ? `Loaded GLB: /cars/${entry.id}.glb`
        : `Showing procedural mesh (no /cars/${entry.id}.glb yet).`;
    } else if (hasGlb) {
      const gltf = await showroomGltf.loadAsync(`/cars/${entry.id}.glb?v=${Date.now()}`);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = 4.55 / Math.max(size.x, size.z, 0.001);
      model.scale.setScalar(scale);
      if (size.x > size.z) model.rotation.y = Math.PI * 0.5;
      const box2 = new THREE.Box3().setFromObject(model);
      const c2 = new THREE.Vector3();
      box2.getCenter(c2);
      model.position.set(-c2.x, -box2.min.y, -c2.z);
      currentGlbOnly = model;
      scene.add(model);
      glbStatus.textContent = `Loaded Tela 3D mesh: /cars/${entry.id}.glb`;
    } else {
      glbStatus.textContent = 'Concept sheet & specs only — run Tela 3D script to generate .glb.';
    }
  }

  for (const entry of ROSTER) {
    const card = document.createElement('button');
    card.className = 'car-card';
    card.setAttribute('data-id', entry.id);
    card.innerHTML = `
      <div class="cc-top">
        <span class="cc-name">${entry.name}</span>
        <span class="cc-tag ${entry.carId ? '' : 'sheet'}">${entry.carId ? '3D Ready' : 'Sheet Only'}</span>
      </div>
      <div class="cc-sub">${entry.classLabel} · ${entry.drivetrain}</div>
    `;
    card.addEventListener('click', () => { void selectEntry(entry); });
    rosterEl.appendChild(card);
  }

  btnSpin.addEventListener('click', () => {
    autoSpin = !autoSpin;
    btnSpin.classList.toggle('active', autoSpin);
  });
  btnLights.addEventListener('click', () => {
    brakeGlow = !brakeGlow;
    btnLights.classList.toggle('active', brakeGlow);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  await selectEntry(ROSTER[0]);

  let lastT = performance.now();
  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (currentVisual) {
      if (autoSpin) currentVisual.root.rotation.y += dt * 0.35;
      for (const m of currentVisual.rotorMats) m.emissiveIntensity = brakeGlow ? 4.2 : 0;
      currentVisual.brakeLightMat.emissiveIntensity = brakeGlow ? 4.2 : 1.1;
    } else if (currentGlbOnly && autoSpin) {
      currentGlbOnly.rotation.y += dt * 0.35;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

void bootShowroom();
