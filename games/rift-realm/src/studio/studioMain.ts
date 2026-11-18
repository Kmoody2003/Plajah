// Rift Realm World view for the Game Studio (docs/game-studio-unified-plan.md Phase 0).
// The real arena, built by the same level module the game uses, with an orbit camera and a gizmo for
// every marker (spawns, enemy spots, control points) and the hazard floor. Runs inside the Studio's
// iframe: it reports the module's defaults, draws the project's markers, lets you pick and drag them,
// and sends each drag back as a `move` so the Studio turns it into an undoable op. The Studio's copy
// of the project is the truth; this page only draws what it is sent.
//
// Open on its own (http://localhost:4332/studio.html?level=glacial) it works stand-alone for checks.

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CollisionWorld } from '../collision';
import { initKTX2, preloadSets } from '../textures';
import type { Tier } from '../shrine';
import { exportDefaults, moduleByParam } from './levelModules';
import { effectiveLook, effectiveMarkers, effectiveZones, emptyLevel, type GameLevel, type LevelDefaults, type Marker } from '../../../../services/gamestudio/schema';
import { GAME_SOURCE, isStudioMessage, type GameToStudio } from '../../../../services/gamestudio/runtime';
import { markerLabel } from '../../../../services/gamestudio/ops';

const params = new URLSearchParams(location.search);
const mod = moduleByParam(params.get('level'));
const embedded = window.parent !== window;
const statusEl = document.getElementById('status')!;
const labelEl = document.getElementById('label')!;

type Out = GameToStudio extends infer M ? (M extends GameToStudio ? Omit<M, 'source'> : never) : never;
function post(msg: Out) {
  if (embedded) window.parent.postMessage({ source: GAME_SOURCE, ...msg }, '*');
}

async function boot() {
  let renderer: THREE.WebGPURenderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
    await renderer.init();
  } catch {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
    await renderer.init();
  }
  const adapter = (renderer.backend as any)?.device?.adapterInfo ?? {};
  const forced = params.get('q');
  const tier: Tier = forced === 'low' || forced === 'high' ? forced : adapter.vendor === 'intel' ? 'low' : 'high';
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = tier === 'high';
  renderer.setPixelRatio(tier === 'low' ? 0.8 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('view')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, mod.look.far);
  scene.add(camera);

  initKTX2(renderer);
  await preloadSets(mod.sets);
  const level = mod.build(scene, tier);
  const collision = new CollisionWorld(level.group);
  collision.rebuild();
  document.getElementById('loading')!.remove();

  const defaults: LevelDefaults = exportDefaults(mod, level);
  let project: GameLevel = emptyLevel(mod.param, defaults.name, mod.id);
  let selected: string | null = null;

  // camera: frame the level's markers from above at a three-quarter angle
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  const bounds = new THREE.Box3();
  for (const m of defaults.markers) bounds.expandByPoint(new THREE.Vector3(...m.pos));
  const centre = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const span = bounds.isEmpty() ? 40 : Math.max(20, bounds.getSize(new THREE.Vector3()).length());
  controls.target.copy(centre);
  // high and steep: arenas are ringed by trees/walls that hide the floor from a low angle
  camera.position.copy(centre).add(new THREE.Vector3(span * 0.2, span * 0.8, span * 0.5));
  controls.update();

  // ── gizmos ──
  const gizmos = new THREE.Group();
  gizmos.name = 'studio-gizmos';
  scene.add(gizmos);
  const COLORS: Record<string, number> = { a: 0x38bdf8, b: 0xf97316, enemySpot: 0xef4444, controlPoint: 0xfbbf24, pickup: 0x4ade80, camera: 0xc084fc };
  const mat = (c: number, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthTest: false, depthWrite: false });
    return m;
  };
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6).translate(0, 1.2, 0);
  const cone = new THREE.ConeGeometry(0.55, 1.2, 12).translate(0, 3.0, 0);
  const arrow = new THREE.ConeGeometry(0.3, 0.9, 8).rotateX(Math.PI / 2).translate(0, 0.25, 0.9);
  const diamond = new THREE.OctahedronGeometry(0.45).translate(0, 1.0, 0);
  const ring = new THREE.TorusGeometry(1, 0.06, 6, 64).rotateX(Math.PI / 2).translate(0, 0.08, 0);
  const disc = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2).translate(0, 0.05, 0);

  function gizmoFor(m: Marker): THREE.Group {
    const g = new THREE.Group();
    g.userData.markerId = m.id;
    const c = m.kind === 'spawn' ? COLORS[m.team ?? 'a'] : COLORS[m.kind] ?? 0xffffff;
    const sel = m.id === selected;
    const tint = sel ? 0xffffff : c;
    if (m.kind === 'spawn') {
      g.add(new THREE.Mesh(pole, mat(tint)), new THREE.Mesh(cone, mat(tint)), new THREE.Mesh(arrow, mat(c)));
      g.rotation.y = m.yaw ?? 0;
    } else if (m.kind === 'controlPoint') {
      const r = m.radius ?? 4;
      const rr = new THREE.Mesh(ring, mat(tint)); rr.scale.set(r, 1, r);
      const dd = new THREE.Mesh(disc, mat(c, sel ? 0.28 : 0.14)); dd.scale.set(r, 1, r);
      g.add(rr, dd, new THREE.Mesh(pole, mat(tint)));
    } else {
      g.add(new THREE.Mesh(pole, mat(tint, 0.7)), new THREE.Mesh(diamond, mat(tint)));
    }
    g.position.set(...m.pos);
    g.traverse(o => { o.renderOrder = sel ? 1001 : 1000; });
    return g;
  }

  let hazard: THREE.Mesh | null = null;
  function rebuildGizmos() {
    for (const c of gizmos.children.slice()) gizmos.remove(c);
    for (const m of effectiveMarkers(project, defaults)) gizmos.add(gizmoFor(m));
    if (hazard) { scene.remove(hazard); hazard = null; }
    const hz = effectiveZones(project, defaults).find(z => z.kind === 'hazardBelow');
    if (hz?.y !== undefined) {
      hazard = new THREE.Mesh(new THREE.PlaneGeometry(span * 3, span * 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      hazard.position.set(centre.x, hz.y, centre.z);
      scene.add(hazard);
    }
    const look = effectiveLook(project, defaults);
    renderer.toneMappingExposure = look.exposure ?? mod.look.exposure;
    camera.far = Math.max(look.far ?? mod.look.far, span * 4);
    camera.updateProjectionMatrix();
    const n = effectiveMarkers(project, defaults).length;
    statusEl.textContent = `${defaults.name} · ${n} markers · drag to move · right-drag to pan`;
  }
  rebuildGizmos();

  // ── picking + dragging ──
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setNdc = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const pickMarker = (): string | null => {
    const hit = ray.intersectObjects(gizmos.children, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.markerId === undefined) o = o.parent;
    return o?.userData.markerId ?? null;
  };
  let drag: { id: string; plane: THREE.Plane; down: THREE.Vector2; moved: boolean } | null = null;
  const tmp = new THREE.Vector3();

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    setNdc(e);
    const id = pickMarker();
    if (!id) return;
    const m = effectiveMarkers(project, defaults).find(x => x.id === id)!;
    drag = { id, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -m.pos[1]), down: new THREE.Vector2(e.clientX, e.clientY), moved: false };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    if (selected !== id) { selected = id; rebuildGizmos(); post({ type: 'select', markerId: id }); }
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.down.x, e.clientY - drag.down.y) < 4) return;
    drag.moved = true;
    setNdc(e);
    if (!ray.ray.intersectPlane(drag.plane, tmp)) return;
    // drop onto whatever surface is under the cursor (stairs, ring, gallery), else stay on the drag plane
    const y = collision.groundAt(tmp.x, tmp.z, tmp.y + 12, 40) ?? tmp.y;
    const pos: [number, number, number] = [round(tmp.x), round(y + 0.1), round(tmp.z)];
    const g = gizmos.children.find(c => c.userData.markerId === drag!.id);
    g?.position.set(...pos);
    post({ type: 'move', markerId: drag.id, pos });
    if (!embedded) {
      // stand-alone: keep a local copy so the gizmo stays put
      const own = project.markers.find(m => m.id === drag!.id);
      if (own) own.pos = pos;
    }
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    renderer.domElement.releasePointerCapture(e.pointerId);
    drag = null;
    controls.enabled = true;
  };
  renderer.domElement.addEventListener('pointerup', end);
  renderer.domElement.addEventListener('pointercancel', end);
  renderer.domElement.addEventListener('click', (e) => {
    setNdc(e as PointerEvent);
    if (!pickMarker() && selected) { selected = null; rebuildGizmos(); post({ type: 'select', markerId: null }); }
  });

  // ── studio messages ──
  let flyTo: THREE.Vector3 | null = null;
  window.addEventListener('message', (e) => {
    if (!isStudioMessage(e.data)) return;
    const msg = e.data;
    if (msg.type === 'level') { project = msg.level; if (!drag) rebuildGizmos(); }
    else if (msg.type === 'select') { selected = msg.markerId; rebuildGizmos(); }
    else if (msg.type === 'frame') {
      const m = effectiveMarkers(project, defaults).find(x => x.id === msg.markerId);
      if (m) { selected = m.id; rebuildGizmos(); flyTo = new THREE.Vector3(...m.pos); }
    }
  });
  post({ type: 'ready', defaults });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── loop ──
  const clock = new THREE.Clock();
  let acc = 0, frames = 0, ms = 0;
  const proj = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const t0 = performance.now();
    const dt = Math.min(clock.getDelta(), 0.1);
    if (flyTo) {
      const delta = tmp.copy(flyTo).sub(controls.target).multiplyScalar(Math.min(1, dt * 6));
      controls.target.add(delta); camera.position.add(delta);
      if (delta.lengthSq() < 1e-4) flyTo = null;
    }
    controls.update();
    level.update(dt, 0, 0);
    renderer.render(scene, camera);
    // label the selected marker
    const sel = selected && effectiveMarkers(project, defaults).find(m => m.id === selected);
    if (sel) {
      proj.set(sel.pos[0], sel.pos[1] + 3.6, sel.pos[2]).project(camera);
      labelEl.style.display = proj.z < 1 ? 'block' : 'none';
      labelEl.style.left = `${(proj.x * 0.5 + 0.5) * window.innerWidth}px`;
      labelEl.style.top = `${(-proj.y * 0.5 + 0.5) * window.innerHeight}px`;
      labelEl.textContent = markerLabel(sel);
    } else labelEl.style.display = 'none';
    ms += performance.now() - t0; frames++; acc += dt;
    if (acc >= 0.5) {
      const info = (renderer as any).info?.render ?? {};
      post({ type: 'stats', frameMs: round(ms / frames), draws: info.drawCalls ?? info.calls ?? 0, triangles: info.triangles ?? 0 });
      acc = 0; frames = 0; ms = 0;
    }
  });
  (window as any).riftStudio = { defaults: () => defaults, project: () => project, select: (id: string) => { selected = id; rebuildGizmos(); } };
}

const round = (n: number) => Math.round(n * 100) / 100;

boot().catch((err) => {
  console.error('[rift-studio]', err);
  document.getElementById('loading')!.textContent = `World view failed: ${err?.message ?? err}`;
});
