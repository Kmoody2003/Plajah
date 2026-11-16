import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARS, RIVAL_PAINTS, type CarId } from './manufacturers';
import { buildCarVisual, type CarVisual } from './carMesh';
import { buildWorld, type TimeOfDay } from './world';
import type { CircuitId, FastTravelPoint } from './worldMap';
import { createCarState, stepCarPhysics, stepAIRival, type AIRival, type CarInput } from './physics';
import { GameAudio } from './audio';
import { PlajahGamesBridge } from './plajahBridge';
import { ReplaySystem } from './replay';

// ── DOM References ──
const viewEl = document.getElementById('view')!;
const loadingEl = document.getElementById('loading')!;
const ldSubEl = document.getElementById('ldSub')!;
const bannerEl = document.getElementById('banner')!;
const raceHudEl = document.getElementById('raceHud')!;
const rhPosEl = document.getElementById('rhPos')!;
const rhLapEl = document.getElementById('rhLap')!;
const rhTimeEl = document.getElementById('rhTime')!;
const rhBestEl = document.getElementById('rhBest')!;
const gSpeedEl = document.getElementById('gSpeed')!;
const gGearEl = document.getElementById('gGear')!;
const gRpmEl = document.getElementById('gRpm')!;
const gCarNameEl = document.getElementById('gCarName')!;
const gDriftEl = document.getElementById('gDrift')!;
const zoneTagEl = document.getElementById('zoneTag')!;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const mapCtx = minimapCanvas.getContext('2d')!;

const radStationEl = document.getElementById('radStation')!;
const radHostEl = document.getElementById('radHost')!;
const radLineEl = document.getElementById('radLine')!;
const radMuteBtn = document.getElementById('radMute')!;

const btnRoam = document.getElementById('btnRoam')!;
const btnRace = document.getElementById('btnRace')!;
const btnMap = document.getElementById('btnMap')!;
const btnCloseMap = document.getElementById('btnCloseMap')!;
const btnReset = document.getElementById('btnReset')!;
const btnSky = document.getElementById('btnSky')!;
const btnCam = document.getElementById('btnCam')!;
const btnReplay = document.getElementById('btnReplay')!;
const worldMapModal = document.getElementById('worldMapModal')!;
const fullMapCanvas = document.getElementById('fullMapCanvas') as HTMLCanvasElement;
const fullMapCtx = fullMapCanvas.getContext('2d')!;
const wmListEl = document.getElementById('wmList')!;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

function showBanner(text: string, durationMs = 1300) {
  bannerEl.textContent = text;
  bannerEl.classList.add('on');
  window.setTimeout(() => {
    if (bannerEl.textContent === text) bannerEl.classList.remove('on');
  }, durationMs);
}

async function boot() {
  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.outline = 'none';
  renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus());
  viewEl.appendChild(renderer.domElement);
  renderer.domElement.focus();

  ldSubEl.textContent = 'Compiling WebGPU PBR Shaders…';
  await renderer.init();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 2000);

  ldSubEl.textContent = 'Sculpting Ironport & Lake Michigan Coast…';
  const world = buildWorld(scene);
  const audio = new GameAudio();
  const bridge = new PlajahGamesBridge();
  const replay = new ReplaySystem();

  // ── Player Car ──
  let activeCircuitId: CircuitId = 'ironport_gp';
  let activeCarId: CarId = 'kestrel';
  let activeSpec = CARS[activeCarId];
  let playerVisual: CarVisual = buildCarVisual(activeSpec, true);
  scene.add(playerVisual.root);

  const initialCircuit = world.circuits[activeCircuitId];
  const startPt = initialCircuit.samples[0];
  const startNext = initialCircuit.samples[1];
  const startYaw = Math.atan2(startNext.x - startPt.x, startNext.z - startPt.z);
  const playerState = createCarState(startPt.x, startPt.y, startPt.z, startYaw);

  // ── AI Rivals (for Circuit Race) ──
  const rivals: { ai: AIRival; visual: CarVisual; lap: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const rSpec = i % 2 === 0 ? CARS.aurelia : CARS.kestrel;
    const tOffset = 0.008 * (i + 1);
    const pt = initialCircuit.spline.getPointAt(tOffset);
    const tan = initialCircuit.spline.getTangentAt(tOffset);
    const lane = (i - 1) * 3.8;
    const right = new THREE.Vector3(-tan.z, 0, tan.x);
    pt.addScaledVector(right, lane);
    const y = world.terrainHeight(pt.x, pt.z);
    const yaw = Math.atan2(tan.x, tan.z);

    const visual = buildCarVisual(rSpec, false, RIVAL_PAINTS[i]);
    visual.root.visible = false;
    scene.add(visual.root);

    rivals.push({
      ai: {
        state: createCarState(pt.x, y, pt.z, yaw),
        spec: rSpec,
        splineT: tOffset,
        laneOffset: lane,
        pace: 0.86 + i * 0.045,
      },
      visual,
      lap: 1,
    });
  }

  // ── Tire Smoke / Dune Dust Particle Pool ──
  const dustCount = 90;
  const dustPool: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  const dustGeo = new THREE.SphereGeometry(0.45, 6, 6);
  for (let i = 0; i < dustCount; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.45 });
    const mesh = new THREE.Mesh(dustGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    dustPool.push({ mesh, vel: new THREE.Vector3(), life: 0 });
  }
  let dustCursor = 0;

  function spawnDust(x: number, y: number, z: number, isSand: boolean) {
    const p = dustPool[dustCursor];
    dustCursor = (dustCursor + 1) % dustCount;
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.25, z + (Math.random() - 0.5) * 0.5);
    p.mesh.scale.setScalar(0.6);
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(isSand ? 0xd4b483 : 0xe5e7eb);
    p.vel.set((Math.random() - 0.5) * 2.2, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2.2);
    p.life = 0.65;
    p.mesh.visible = true;
  }

  // ── Radio UI Sync ──
  function syncRadioUI(customLine?: string) {
    const st = audio.currentStation;
    radStationEl.textContent = st.name;
    radHostEl.textContent = st.hostName;
    radLineEl.textContent = customLine ?? st.tagline;
    document.documentElement.style.setProperty('--accent', st.accent);
    radMuteBtn.textContent = audio.isMuted ? 'Muted' : 'Audio On';
  }
  syncRadioUI();

  // ── Game Modes & State ──
  let mode: 'roam' | 'race' = 'roam';
  let timeOfDay: TimeOfDay = 'golden';
  let camMode = 0; // 0: Chase, 1: Close Chase, 2: Hood
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  // Race state
  const TOTAL_LAPS = 3;
  let raceActive = false;
  let countdownSec = 0;
  let lap = 1;
  let nextCheckpoint = 1;
  let lapTime = 0;
  let bestLap: number | null = null;
  let coastalExplorerAwarded = false;
  let speed150Awarded = false;

  function resetPlayerToStart() {
    const c = world.circuits[activeCircuitId];
    const sp = c.samples[0];
    const sn = c.samples[1];
    playerState.pos.set(sp.x, sp.y, sp.z);
    playerState.vel.set(0, 0, 0);
    playerState.yaw = Math.atan2(sn.x - sp.x, sn.z - sp.z);
    playerState.angularVel = 0;
  }

  function fastTravelTo(ft: FastTravelPoint) {
    if (ft.circuitId) activeCircuitId = ft.circuitId;
    const y = world.terrainHeight(ft.x, ft.z);
    playerState.pos.set(ft.x, y, ft.z);
    playerState.vel.set(0, 0, 0);
    playerState.yaw = ft.yaw;
    playerState.angularVel = 0;
    worldMapModal.classList.remove('on');
    showBanner(ft.name.toUpperCase(), 1400);
  }

  function startCircuitRace(circuitId?: CircuitId) {
    if (circuitId) activeCircuitId = circuitId;
    const c = world.circuits[activeCircuitId];
    mode = 'race';
    btnRace.classList.add('active');
    btnRoam.classList.remove('active');
    raceHudEl.classList.add('on');
    worldMapModal.classList.remove('on');

    resetPlayerToStart();
    lap = 1;
    nextCheckpoint = 1;
    lapTime = 0;
    countdownSec = 3.2;
    raceActive = true;

    rivals.forEach((r, i) => {
      const tOffset = 0.008 * (i + 1);
      const pt = c.spline.getPointAt(tOffset);
      const tan = c.spline.getTangentAt(tOffset);
      const lane = (i - 1) * 3.8;
      const right = new THREE.Vector3(-tan.z, 0, tan.x);
      pt.addScaledVector(right, lane);
      r.ai.state.pos.set(pt.x, world.terrainHeight(pt.x, pt.z), pt.z);
      r.ai.state.vel.set(0, 0, 0);
      r.ai.state.yaw = Math.atan2(tan.x, tan.z);
      r.ai.splineT = tOffset;
      r.lap = 1;
      r.visual.root.visible = true;
    });

    syncRadioUI(audio.getHostCallout('start'));
  }

  function switchToFreeRoam() {
    mode = 'roam';
    raceActive = false;
    btnRoam.classList.add('active');
    btnRace.classList.remove('active');
    raceHudEl.classList.remove('on');
    rivals.forEach((r) => { r.visual.root.visible = false; });
    showBanner('FREE ROAM', 1000);
  }

  function selectCar(id: CarId) {
    if (activeCarId === id) return;
    activeCarId = id;
    activeSpec = CARS[id];
    scene.remove(playerVisual.root);
    playerVisual = buildCarVisual(activeSpec, true);
    scene.add(playerVisual.root);
    gCarNameEl.textContent = `${activeSpec.manufacturer} ${activeSpec.model}`;
    document.querySelectorAll('[data-car]').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-car') === id);
    });
  }

  // Populate World Map Fast-Travel & Circuit List
  for (const ft of world.fastTravelPoints) {
    const card = document.createElement('button');
    card.className = 'wm-card';
    card.innerHTML = `<div class="wm-card-title">${ft.name}</div><div class="wm-card-sub">${ft.subtitle}${ft.circuitId ? ' · Click to Fast-Travel' : ''}</div>`;
    card.addEventListener('click', () => {
      audio.ensureStarted();
      fastTravelTo(ft);
    });
    wmListEl.appendChild(card);
  }

  function drawFullMap() {
    const w = fullMapCanvas.width;
    const h = fullMapCanvas.height;
    fullMapCtx.clearRect(0, 0, w, h);

    // Map [-8800..9000] x [-5800..5800] -> [0..w] x [0..h]
    const toFull = (x: number, z: number): [number, number] => [
      ((x + 8800) / 17800) * w,
      ((z + 5800) / 11600) * h,
    ];

    // Land & Lake Michigan
    fullMapCtx.fillStyle = '#18241d';
    fullMapCtx.fillRect(0, 0, w, h);
    fullMapCtx.fillStyle = '#0d3f54';
    fullMapCtx.fillRect(0, 0, w * 0.055, h);

    // Dune Sea tint
    fullMapCtx.fillStyle = 'rgba(214, 191, 143, 0.35)';
    const [dx1, dz1] = toFull(-8100, 1250);
    const [dx2, dz2] = toFull(-6400, 5200);
    fullMapCtx.fillRect(dx1, dz1, dx2 - dx1, dz2 - dz1);

    // Ironport River
    fullMapCtx.beginPath();
    world.riverSamples.forEach((p, i) => {
      const [rx, ry] = toFull(p.x, p.z);
      if (i === 0) fullMapCtx.moveTo(rx, ry);
      else fullMapCtx.lineTo(rx, ry);
    });
    fullMapCtx.strokeStyle = '#15607d';
    fullMapCtx.lineWidth = 10;
    fullMapCtx.stroke();

    // I-196 & Suburban Loops
    const drawPath = (pts: THREE.Vector3[], color: string, lw: number, closed = false) => {
      fullMapCtx.beginPath();
      pts.forEach((p, i) => {
        const [px, py] = toFull(p.x, p.z);
        if (i === 0) fullMapCtx.moveTo(px, py);
        else fullMapCtx.lineTo(px, py);
      });
      if (closed) fullMapCtx.closePath();
      fullMapCtx.strokeStyle = color;
      fullMapCtx.lineWidth = lw;
      fullMapCtx.stroke();
    };
    drawPath(world.i196Samples, '#8da0b8', 2.2);
    drawPath(world.suburbSamples, '#6b7f96', 1.8, true);

    // 3 Circuits
    drawPath(world.circuits.ironport_gp.samples, '#ff6b2b', 3.2, true);
    drawPath(world.circuits.foundry_bridge.samples, '#ffd166', 3.0, true);
    drawPath(world.circuits.great_lakes_raceway.samples, '#2ec4b6', 3.2, true);

    // Zone labels
    fullMapCtx.font = 'bold 11px Segoe UI, sans-serif';
    fullMapCtx.fillStyle = '#cfe0f5';
    const labels: [string, number, number][] = [
      ['LAKE MICHIGAN', -8500, -4200],
      ['GREAT LAKES RACEWAY', -7500, -3450],
      ['DUNE SEA', -7550, 3100],
      ['HARBORFEST', -6950, 1050],
      ['RIVER DELTAS', -3900, 1650],
      ['HARVEST VALLEY FARMLAND', -2200, -200],
      ['PINEWOOD FOREST', -3200, -3400],
      ['SUBURBAN LOOPS', 3900, -2100],
      ['IRONPORT NORTH', 6600, -2250],
      ['IRONPORT SOUTH', 6550, 1150],
    ];
    for (const [txt, lx, lz] of labels) {
      const [tx, ty] = toFull(lx, lz);
      fullMapCtx.fillText(txt, tx, ty);
    }

    // Player marker
    const [px, py] = toFull(playerState.pos.x, playerState.pos.z);
    fullMapCtx.fillStyle = '#ff6b2b';
    fullMapCtx.beginPath();
    fullMapCtx.arc(px, py, 6, 0, Math.PI * 2);
    fullMapCtx.fill();
    fullMapCtx.strokeStyle = '#ffffff';
    fullMapCtx.lineWidth = 2;
    fullMapCtx.stroke();
  }

  function toggleWorldMap() {
    const on = worldMapModal.classList.toggle('on');
    if (on) drawFullMap();
  }

  // ── Controls (Keyboard + Gamepad) ──
  const keys = new Set<string>();
  const DRIVE_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
  ]);
  window.addEventListener('keydown', (e) => {
    if (DRIVE_CODES.has(e.code)) e.preventDefault();
    audio.ensureStarted();
    const k = e.code;
    keys.add(k);
    if (k === 'Tab') toggleWorldMap();
    if (k === 'KeyC') {
      if (replay.active) replay.cycleAngle();
      else camMode = (camMode + 1) % 3;
    }
    if (k === 'KeyP') {
      const on = replay.toggle();
      btnReplay.classList.toggle('active', on);
      showBanner(on ? 'REPLAY · C TO SWITCH CAM' : 'LIVE DRIVE', 1100);
    }
    if (k === 'KeyR') resetPlayerToStart();
    if (k === 'KeyM') {
      audio.toggleMute();
      syncRadioUI();
    }
  }, { passive: false });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      (b as HTMLElement).blur();
      renderer.domElement.focus();
    });
  });

  btnRoam.addEventListener('click', () => { audio.ensureStarted(); switchToFreeRoam(); });
  btnRace.addEventListener('click', () => { audio.ensureStarted(); startCircuitRace(); });
  btnMap.addEventListener('click', () => { audio.ensureStarted(); toggleWorldMap(); });
  btnCloseMap.addEventListener('click', () => { worldMapModal.classList.remove('on'); });
  btnReset.addEventListener('click', () => { audio.ensureStarted(); resetPlayerToStart(); });
  btnCam.addEventListener('click', () => {
    if (replay.active) replay.cycleAngle();
    else camMode = (camMode + 1) % 3;
  });
  btnReplay.addEventListener('click', () => {
    audio.ensureStarted();
    const on = replay.toggle();
    btnReplay.classList.toggle('active', on);
    showBanner(on ? 'REPLAY · C TO SWITCH CAM' : 'LIVE DRIVE', 1100);
  });

  btnSky.addEventListener('click', () => {
    const order: TimeOfDay[] = ['golden', 'night', 'overcast'];
    const labels: Record<TimeOfDay, string> = {
      golden: 'Golden Hour',
      night: 'Midnight Neon',
      overcast: 'Great Lakes Mist',
    };
    timeOfDay = order[(order.indexOf(timeOfDay) + 1) % order.length];
    btnSky.textContent = labels[timeOfDay];
  });

  document.querySelectorAll('[data-car]').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.ensureStarted();
      selectCar(btn.getAttribute('data-car') as CarId);
    });
  });

  document.getElementById('radPrev')!.addEventListener('click', () => {
    audio.ensureStarted();
    audio.cycleStation(-1);
    syncRadioUI();
  });
  document.getElementById('radNext')!.addEventListener('click', () => {
    audio.ensureStarted();
    audio.cycleStation(1);
    syncRadioUI();
  });
  radMuteBtn.addEventListener('click', () => {
    audio.ensureStarted();
    audio.toggleMute();
    syncRadioUI();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Minimap Renderer (Local 1.8km Radar around Player) ──
  function drawMinimap() {
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    mapCtx.clearRect(0, 0, w, h);

    const radarRange = 950;
    const toMap = (x: number, z: number): [number, number] => [
      ((x - playerState.pos.x) / (radarRange * 2) + 0.5) * w,
      ((z - playerState.pos.z) / (radarRange * 2) + 0.5) * h,
    ];

    const drawMiniPath = (pts: THREE.Vector3[], color: string, lw: number, closed = false) => {
      mapCtx.beginPath();
      pts.forEach((p, idx) => {
        const [mx, my] = toMap(p.x, p.z);
        if (idx === 0) mapCtx.moveTo(mx, my);
        else mapCtx.lineTo(mx, my);
      });
      if (closed) mapCtx.closePath();
      mapCtx.strokeStyle = color;
      mapCtx.lineWidth = lw;
      mapCtx.stroke();
    };

    drawMiniPath(world.riverSamples, 'rgba(21, 96, 125, 0.75)', 10);
    drawMiniPath(world.i196Samples, 'rgba(255,255,255,0.28)', 3);
    drawMiniPath(world.suburbSamples, 'rgba(255,255,255,0.22)', 2.5, true);
    drawMiniPath(world.circuits.ironport_gp.samples, 'rgba(255,107,43,0.7)', 4, true);
    drawMiniPath(world.circuits.foundry_bridge.samples, 'rgba(255,209,102,0.7)', 4, true);
    drawMiniPath(world.circuits.great_lakes_raceway.samples, 'rgba(46,196,182,0.7)', 4, true);

    // AI Rivals
    if (mode === 'race') {
      rivals.forEach((r) => {
        const [rx, ry] = toMap(r.ai.state.pos.x, r.ai.state.pos.z);
        mapCtx.fillStyle = '#2ec4b6';
        mapCtx.beginPath();
        mapCtx.arc(rx, ry, 3.2, 0, Math.PI * 2);
        mapCtx.fill();
      });
    }

    // Player arrow at center
    mapCtx.save();
    mapCtx.translate(w * 0.5, h * 0.5);
    mapCtx.rotate(-playerState.yaw + Math.PI);
    mapCtx.fillStyle = '#ff6b2b';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4.5, 5);
    mapCtx.lineTo(0, 2.5);
    mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  // ── Main Loop ──
  loadingEl.classList.add('done');
  let lastT = performance.now();
  let elapsed = 0;

  function applyVisualFromState(visual: CarVisual, st: typeof playerState, spec: typeof activeSpec) {
    visual.root.position.copy(st.pos);
    visual.root.rotation.y = st.yaw;
    visual.bodyGroup.rotation.x = st.pitch;
    visual.bodyGroup.rotation.z = st.roll;
    visual.wheelSteerPivots[0].rotation.y = st.steerAngle;
    visual.wheelSteerPivots[1].rotation.y = st.steerAngle;
    for (let i = 0; i < 4; i++) {
      visual.wheelSteerPivots[i].position.y = spec.wheelRadius + st.wheelCompression[i] * 0.45;
      visual.wheelSpinGroups[i].rotation.x = st.wheelSpin;
      visual.rotorMats[i].emissiveIntensity = Math.pow(st.brakeTemp[i], 1.6) * 4.5;
    }
    visual.brakeLightMat.emissiveIntensity = st.isBraking ? 4.2 : 0.9;
    const hlIntensity = timeOfDay === 'night' ? 32 : 10;
    for (const spot of visual.headlightSpots) spot.intensity = hlIntensity;
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    elapsed += dt;

    // Input (Keyboard + Gamepad)
    let throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
    let brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
    const left = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
    const right = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
    let steer = left - right;
    let handbrake = keys.has('Space');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[0];
    if (pad) {
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const rawX = -(pad.axes[0] ?? 0);
      const lx = Math.abs(rawX) > 0.10 ? Math.sign(rawX) * Math.pow(Math.abs(rawX), 1.6) : 0;
      if (rt > throttle) throttle = rt;
      if (lt > brake) brake = lt;
      if (Math.abs(lx) > Math.abs(steer)) steer = lx;
      if (pad.buttons[0]?.pressed || pad.buttons[2]?.pressed) handbrake = true;
    }

    const input: CarInput = {
      throttle: countdownSec > 0 ? 0 : throttle,
      brake: countdownSec > 0 ? 0 : brake,
      steer,
      handbrake,
    };

    const inReplay = replay.step(playerState, camera, elapsed, world.broadcastCams);
    if (!inReplay) {
      stepCarPhysics(
        playerState,
        activeSpec,
        input,
        dt,
        world.terrainHeight,
        world.surfaceAt,
        world.colliders
      );
      replay.record(playerState);
    }
    applyVisualFromState(playerVisual, playerState, activeSpec);

    // Tire smoke / sand dust
    if (
      (playerState.isDrifting || (playerState.surface === 'sand' && playerState.speedMps > 12)) &&
      Math.random() < 0.65
    ) {
      const sinY = Math.sin(playerState.yaw);
      const cosY = Math.cos(playerState.yaw);
      spawnDust(
        playerState.pos.x - sinY * 1.4,
        playerState.pos.y,
        playerState.pos.z - cosY * 1.4,
        playerState.surface === 'sand'
      );
    }

    for (const p of dustPool) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.addScalar(dt * 2.2);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 0.55);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }

    // Race Countdown & Checkpoints
    if (mode === 'race' && raceActive) {
      if (countdownSec > 0) {
        const prev = Math.ceil(countdownSec);
        countdownSec = Math.max(0, countdownSec - dt);
        const curr = Math.ceil(countdownSec);
        if (curr > 0 && curr !== prev) showBanner(String(curr), 850);
        if (countdownSec === 0) showBanner('GO!', 900);
      } else {
        lapTime += dt;
        const activeCircuit = world.circuits[activeCircuitId];
        for (const r of rivals) {
          stepAIRival(r.ai, activeCircuit.spline, dt, world.terrainHeight, world.surfaceAt, world.colliders);
          applyVisualFromState(r.visual, r.ai.state, r.ai.spec);
        }

        const cp = activeCircuit.checkpoints[nextCheckpoint];
        if (Math.hypot(playerState.pos.x - cp.x, playerState.pos.z - cp.z) < 28) {
          nextCheckpoint = (nextCheckpoint + 1) % activeCircuit.checkpoints.length;
          if (nextCheckpoint === 1) {
            // Completed a lap!
            if (lapTime > 8) {
              if (bestLap === null || lapTime < bestLap) bestLap = lapTime;
              rhBestEl.textContent = fmtTime(bestLap);
              bridge.unlock('forth_first_lap');
              bridge.creditXp(75);
              syncRadioUI(audio.getHostCallout('lap'));
            }
            if (lap >= TOTAL_LAPS) {
              raceActive = false;
              showBanner('FINISH!', 3500);
              bridge.unlock('forth_race_win');
              bridge.creditXp(250);
            } else {
              lap += 1;
              lapTime = 0;
              showBanner(`LAP ${lap} / ${TOTAL_LAPS}`, 1400);
            }
          }
        }
      }
      rhLapEl.textContent = `${lap} / ${TOTAL_LAPS}`;
      rhTimeEl.textContent = fmtTime(lapTime);
      rhPosEl.textContent = '1 / 4';
    }

    // Milestones
    const mph = Math.round(playerState.speedMps * 2.23694);
    if (mph >= 150 && !speed150Awarded) {
      speed150Awarded = true;
      bridge.unlock('forth_150_mph');
      bridge.creditXp(100);
      syncRadioUI(audio.getHostCallout('speed'));
    }
    const zone = world.zoneNameAt(playerState.pos.x, playerState.pos.z);
    if (zone === 'West Coast Sand Dunes' && !coastalExplorerAwarded) {
      coastalExplorerAwarded = true;
      bridge.unlock('forth_coastal_explorer');
      bridge.creditXp(80);
    }

    // Camera Follow + Speed FOV (skip when replay camera is driving)
    const sinY = Math.sin(playerState.yaw);
    const cosY = Math.cos(playerState.yaw);
    if (inReplay) {
      // ReplaySystem already positioned & aimed camera
    } else {
      const targetFov = 60 + THREE.MathUtils.clamp(playerState.speedMps / 80, 0, 1) * 18;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
      camera.updateProjectionMatrix();

      if (camMode === 2) {
        // Hood Cam
        camPos.set(
          playerState.pos.x + sinY * 0.7,
          playerState.pos.y + 1.32,
          playerState.pos.z + cosY * 0.7
        );
        camLook.set(
          playerState.pos.x + sinY * 22,
          playerState.pos.y + 1.25,
          playerState.pos.z + cosY * 22
        );
        camera.position.copy(camPos);
        camera.lookAt(camLook);
      } else {
        // Forza-style velocity-blended chase camera
        const dist = camMode === 0 ? 7.8 : 5.6;
        const height = camMode === 0 ? 2.85 : 2.15;
        let camFwdX = sinY;
        let camFwdZ = cosY;
        if (playerState.speedMps > 5) {
          const vx = playerState.vel.x / playerState.speedMps;
          const vz = playerState.vel.z / playerState.speedMps;
          camFwdX = THREE.MathUtils.lerp(sinY, vx, 0.45);
          camFwdZ = THREE.MathUtils.lerp(cosY, vz, 0.45);
          const len = Math.hypot(camFwdX, camFwdZ) || 1;
          camFwdX /= len;
          camFwdZ /= len;
        }
        const desired = new THREE.Vector3(
          playerState.pos.x - camFwdX * dist,
          playerState.pos.y + height,
          playerState.pos.z - camFwdZ * dist
        );
        camera.position.lerp(desired, 1 - Math.exp(-7.5 * dt));
        camLook.set(
          playerState.pos.x + camFwdX * 7.0,
          playerState.pos.y + 1.15,
          playerState.pos.z + camFwdZ * 7.0
        );
        camera.lookAt(camLook);
      }
    }

    // HUD & Audio
    gSpeedEl.textContent = String(mph);
    gGearEl.textContent = playerState.gear === -1 ? 'R' : playerState.gear === 0 ? 'N' : String(playerState.gear);
    const rpmPct = THREE.MathUtils.clamp(
      ((playerState.rpm - activeSpec.engine.idleRpm) / (activeSpec.engine.redlineRpm - activeSpec.engine.idleRpm)) * 100,
      4,
      100
    );
    gRpmEl.style.width = `${rpmPct.toFixed(1)}%`;
    gDriftEl.classList.toggle('on', playerState.isDrifting);
    zoneTagEl.textContent = zone;

    world.updateWorld(elapsed, timeOfDay);
    audio.update(playerState, activeSpec, throttle);
    drawMinimap();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  ldSubEl.textContent = `WebGPU init error: ${String(err)}`;
});
