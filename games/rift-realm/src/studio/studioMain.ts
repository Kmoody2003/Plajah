// Rift Realm World view for the Game Studio (docs/game-studio-unified-plan.md Phases 0–1).
// The real arena, built by the same level module the game uses, with an orbit camera, a gizmo for every
// marker (spawns, enemy spots, control points), the hazard floor, and the project's placed props, each
// rebuilt from its parameters by the game's own builders. Runs inside the Studio's iframe: it reports the
// module's defaults, draws whatever project level it is sent, and turns picks and drags into messages;
// the Studio turns those into undoable ops. The Studio's copy of the project is the truth.
//
// Open on its own (http://localhost:4332/studio.html?level=glacial) it works stand-alone for checks.

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CollisionWorld } from '../collision';
import { initKTX2, preloadSets } from '../textures';
import type { Tier } from '../shrine';
import { exportDefaults, moduleByParam } from './levelModules';
import { instanceGroup } from './prefabs';
import { effectiveLook, effectiveMarkers, effectiveZones, emptyLevel, type GameLevel, type LevelDefaults, type Marker } from '../../../../services/gamestudio/schema';
import { GAME_SOURCE, isStudioMessage, type GameToStudio } from '../../../../services/gamestudio/runtime';
import { markerLabel } from '../../../../services/gamestudio/ops';
import { prefabById } from '../../../../services/gamestudio/prefabs';

const params = new URLSearchParams(location.search);
const mod = moduleByParam(params.get('level'));
const embedded = window.parent !== window;
const statusEl = document.getElementById('status')!;
const labelEl = document.getElementById('label')!;

type Out = GameToStudio extends infer M ? (M extends GameToStudio ? Omit<M, 'source'> : never) : never;
function post(msg: Out) {
  if (embedded) window.parent.postMessage({ source: GAME_SOURCE, ...msg }, '*');
}
const round = (n: number) => Math.round(n * 100) / 100;

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
  document.getElementById('loading')!.remove();

  const defaults: LevelDefaults = exportDefaults(mod, level);
  let project: GameLevel = emptyLevel(mod.param, defaults.name, mod.id);
  let selected: string | null = null;
  let armed: string | null = null;

  // ── props: one group per instance, rebuilt only when that instance changes ──
  const propsRoot = new THREE.Group();
  propsRoot.name = 'studio-props';
  scene.add(propsRoot);
  const built = new Map<string, { group: THREE.Group; key: string }>();
  // collision = the arena plus the props, so markers and new props land on top of placed pieces.
  // CollisionWorld walks one root; this stand-in walks both without reparenting either.
  const world = new THREE.Object3D();
  world.traverse = (cb) => { level.group.traverse(cb); propsRoot.traverse(cb); };
  world.updateMatrixWorld = (force?: boolean) => { level.group.updateMatrixWorld(force); propsRoot.updateMatrixWorld(force); };
  const collision = new CollisionWorld(world);
  const rebuildCollision = () => collision.rebuild();
  rebuildCollision();

  function syncProps() {
    const want = new Map(project.instances.map(i => [i.id, i] as const));
    for (const [id, b] of built) if (!want.has(id)) { propsRoot.remove(b.group); dispose(b.group); built.delete(id); }
    let changed = false;
    for (const inst of project.instances) {
      const key = JSON.stringify([inst.prefab, inst.pos, inst.rot, inst.params]);
      const have = built.get(inst.id);
      if (have?.key === key) continue;
      if (have) { if (gizmo.object === have.group) gizmo.detach(); propsRoot.remove(have.group); dispose(have.group); }
      const group = instanceGroup(inst);
      propsRoot.add(group);
      built.set(inst.id, { group, key });
      changed = true;
    }
    if (changed || built.size !== project.instances.length) rebuildCollision();
    attachGizmo();
  }
  const dispose = (g: THREE.Object3D) => g.traverse(o => { (o as THREE.Mesh).geometry?.dispose?.(); });

  // camera: frame the level's markers from above at a steep angle
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

  // ── transform handle for the selected prop: move on the ground plane, turn around Y ──
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace('world');
  gizmo.setTranslationSnap(0.25);
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
  const helper = gizmo.getHelper();
  scene.add(helper);
  let tool: 'move' | 'turn' = 'move';
  const applyTool = () => {
    gizmo.setMode(tool === 'move' ? 'translate' : 'rotate');
    gizmo.showX = tool === 'move'; gizmo.showZ = tool === 'move'; gizmo.showY = tool === 'turn';
  };
  applyTool();
  // A piece's geometry is built in world space. To move/turn it with the handle, its group pivots on the
  // piece's anchor: children shifted by -anchor, group placed at +anchor. Then the group's position IS
  // the new anchor and its rotation.y is the turn. While dragging the group moves as a whole; on release
  // the Studio sends the level back and the piece is rebuilt in place (world-projected textures realign).
  let dragYaw0 = 0;
  gizmo.addEventListener('dragging-changed', (e: any) => {
    controls.enabled = !e.value;
    const inst = selected ? project.instances.find(i => i.id === selected) : undefined;
    if (e.value) dragYaw0 = inst?.rot[1] ?? 0;
    else emitTransform(true);
  });
  gizmo.addEventListener('objectChange', () => emitTransform(false));
  function emitTransform(done: boolean) {
    const g = gizmo.object as THREE.Object3D | undefined;
    const id = g?.userData.instanceId as string | undefined;
    if (!g || !id) return;
    const pos: [number, number, number] = [round(g.position.x), round(g.position.y), round(g.position.z)];
    const yaw = Math.round((dragYaw0 + THREE.MathUtils.radToDeg(g.rotation.y)) * 10) / 10;
    post({ type: 'transform', instanceId: id, pos, yaw: ((yaw % 360) + 540) % 360 - 180, done });
  }
  function attachGizmo() {
    const b = selected ? built.get(selected) : undefined;
    const inst = selected ? project.instances.find(i => i.id === selected) : undefined;
    if (!b || !inst || armed) { if (gizmo.object) gizmo.detach(); return; }
    if (gizmo.object === b.group) return;
    const [x, y, z] = inst.pos;
    for (const c of b.group.children) c.position.set(-x, -y, -z);
    b.group.position.set(x, y, z);
    b.group.rotation.set(0, 0, 0);
    gizmo.attach(b.group);
  }

  // ── marker gizmos ──
  const gizmos = new THREE.Group();
  gizmos.name = 'studio-gizmos';
  scene.add(gizmos);
  const COLORS: Record<string, number> = { a: 0x38bdf8, b: 0xf97316, enemySpot: 0xef4444, controlPoint: 0xfbbf24, pickup: 0x4ade80, camera: 0xc084fc };
  const mat = (c: number, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthTest: false, depthWrite: false });
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

  // selection box around the selected prop
  const selBox = new THREE.Box3Helper(new THREE.Box3(), 0xfbbf24);
  (selBox.material as THREE.LineBasicMaterial).depthTest = false;
  selBox.renderOrder = 1002;
  selBox.visible = false;
  scene.add(selBox);

  let hazard: THREE.Mesh | null = null;
  function redraw() {
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
    syncProps();
    const n = effectiveMarkers(project, defaults).length;
    statusEl.textContent = armed
      ? `Click where the ${prefabById(armed)?.name ?? 'piece'} goes · Esc to cancel`
      : `${defaults.name} · ${n} markers · ${project.instances.length} props · drag to move · right-drag to pan`;
    renderer.domElement.style.cursor = armed ? 'crosshair' : '';
  }
  redraw();

  // ── picking + dragging ──
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setNdc = (e: PointerEvent | MouseEvent) => {
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
  const pickProp = (): string | null => {
    const hit = ray.intersectObjects(propsRoot.children, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.instanceId === undefined) o = o.parent;
    return o?.userData.instanceId ?? null;
  };
  /** Where the cursor ray meets the world (arena or a placed prop). */
  const groundPoint = (): THREE.Vector3 | null => {
    const hits = ray.intersectObjects([level.group, propsRoot], true).filter(h => (h.object as THREE.Mesh).isMesh && h.object.visible !== false);
    return hits[0]?.point ?? null;
  };
  const select = (id: string | null) => {
    if (selected === id) return;
    selected = id;
    redraw();
    post({ type: 'select', id });
  };

  let drag: { id: string; plane: THREE.Plane; down: THREE.Vector2; moved: boolean } | null = null;
  const tmp = new THREE.Vector3();
  let downAt: THREE.Vector2 | null = null;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downAt = new THREE.Vector2(e.clientX, e.clientY);
    if (armed || (gizmo as any).axis) return; // placing, or grabbing the transform handle
    setNdc(e);
    const id = pickMarker();
    if (!id) return;
    const m = effectiveMarkers(project, defaults).find(x => x.id === id)!;
    drag = { id, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -m.pos[1]), down: new THREE.Vector2(e.clientX, e.clientY), moved: false };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    select(id);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.down.x, e.clientY - drag.down.y) < 4) return;
    drag.moved = true;
    setNdc(e);
    if (!ray.ray.intersectPlane(drag.plane, tmp)) return;
    // drop onto whatever surface is under the cursor (stairs, ring, gallery, a placed wall), else stay on the plane
    const y = collision.groundAt(tmp.x, tmp.z, tmp.y + 12, 40) ?? tmp.y;
    const pos: [number, number, number] = [round(tmp.x), round(y + 0.1), round(tmp.z)];
    gizmos.children.find(c => c.userData.markerId === drag!.id)?.position.set(...pos);
    post({ type: 'move', markerId: drag.id, pos });
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
    // a click is a press that didn't orbit the camera
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    setNdc(e);
    if (armed) {
      const p = groundPoint();
      if (p) post({ type: 'placed', prefab: armed, pos: [round(p.x), round(p.y), round(p.z)] });
      return;
    }
    if ((gizmo as any).dragging) return;
    if (pickMarker()) return;
    select(pickProp());
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && armed) { armed = null; redraw(); post({ type: 'select', id: selected }); }
  });

  // ── studio messages ──
  let flyTo: THREE.Vector3 | null = null;
  window.addEventListener('message', (e) => {
    if (!isStudioMessage(e.data)) return;
    const msg = e.data;
    if (msg.type === 'level') { project = msg.level; if (!drag && !(gizmo as any).dragging) redraw(); }
    else if (msg.type === 'select') { selected = msg.id; redraw(); }
    else if (msg.type === 'frame') {
      const m = effectiveMarkers(project, defaults).find(x => x.id === msg.id);
      const inst = project.instances.find(i => i.id === msg.id);
      const at = m?.pos ?? inst?.pos;
      if (at) { selected = msg.id; redraw(); flyTo = new THREE.Vector3(...at); }
    }
    else if (msg.type === 'arm') { armed = msg.prefab && prefabById(msg.prefab) ? msg.prefab : null; redraw(); }
    else if (msg.type === 'tool') { tool = msg.tool; applyTool(); }
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
    const selGroup = selected ? built.get(selected)?.group : undefined;
    selBox.visible = !!selGroup;
    if (selGroup) selBox.box.setFromObject(selGroup);
    renderer.render(scene, camera);
    // label the selection
    const selM = selected ? effectiveMarkers(project, defaults).find(m => m.id === selected) : undefined;
    const selI = selected ? project.instances.find(i => i.id === selected) : undefined;
    const at = selM ? [selM.pos[0], selM.pos[1] + 3.6, selM.pos[2]] : selGroup ? [selBox.box.getCenter(tmp).x, selBox.box.max.y + 0.8, tmp.z] : null;
    if (at) {
      proj.set(at[0], at[1], at[2]).project(camera);
      labelEl.style.display = proj.z < 1 ? 'block' : 'none';
      labelEl.style.left = `${(proj.x * 0.5 + 0.5) * window.innerWidth}px`;
      labelEl.style.top = `${(-proj.y * 0.5 + 0.5) * window.innerHeight}px`;
      labelEl.textContent = selM ? markerLabel(selM) : prefabById(selI!.prefab)?.name ?? selI!.prefab;
    } else labelEl.style.display = 'none';
    ms += performance.now() - t0; frames++; acc += dt;
    if (acc >= 0.5) {
      const info = (renderer as any).info?.render ?? {};
      post({ type: 'stats', frameMs: round(ms / frames), draws: info.drawCalls ?? info.calls ?? 0, triangles: info.triangles ?? 0 });
      acc = 0; frames = 0; ms = 0;
    }
  });
  (window as any).riftStudio = { defaults: () => defaults, project: () => project, select, props: () => [...built.keys()], scene };
}

boot().catch((err) => {
  console.error('[rift-studio]', err);
  document.getElementById('loading')!.textContent = `World view failed: ${err?.message ?? err}`;
});
