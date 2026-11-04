/**
 * ModelingRoom.tsx — traditional polygon modeling, beside the clay. Vertices, edges and faces under your hands:
 * move, rotate, scale, extrude, inset, bevel, loop cut, subdivide, mirror, merge. Every tool is adjustable until
 * the next one, and a finished form can go on to the clay to be sculpted.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { ArrowLeft, Download, Redo2, Undo2 } from 'lucide-react';
import {
  bevelEdges, deleteFaces, EdgeKey, edgeFaces, edgeKey, extrudeFaces, flipFaces, insetFaces, joinMeshes, loopCut, makeBox,
  makeCylinder, makePlane, makeSphere, mergeVerts, mirrorX, parseEdge, PolyMesh, subdivide, toTriangles,
} from '../../services/argilla/poly/polyMesh';
import { meshToGlb } from '../../services/argilla/document';

type Mode = 'vertex' | 'edge' | 'face';
type Gizmo = 'translate' | 'rotate' | 'scale';
interface Selection { verts: number[]; edges: EdgeKey[]; faces: number[] }
const NONE: Selection = { verts: [], edges: [], faces: [] };
const AUTOSAVE_KEY = 'argilla-poly-autosave';

/** The last tool, kept so its amount can still change: it re-runs from the mesh before it. */
interface LastTool { label: string; amount: number; min: number; max: number; run: (amount: number) => { mesh: PolyMesh; faces?: number[] } }

const tool = 'px-2 py-1.5 rounded-md text-[11px] font-semibold bg-white/[.07] hover:bg-white/15 disabled:opacity-30 text-left';

export interface ModelingRoomProps {
  onBack: () => void;
  /** Hands the form to the clay as triangles. */
  onSculpt?: (positions: Float32Array, indices: Uint32Array) => void;
  onApi?: (api: unknown) => void;
}

export default function ModelingRoom({ onBack, onSculpt, onApi }: ModelingRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mesh, setMeshState] = useState<PolyMesh>(() => makeBox(1));
  const [selection, setSelection] = useState<Selection>(NONE);
  const [mode, setMode] = useState<Mode>('face');
  const [gizmo, setGizmo] = useState<Gizmo>('translate');
  const [flat, setFlat] = useState(true);
  const [preview, setPreview] = useState(0);
  const [last, setLast] = useState<LastTool | null>(null);
  const [note, setNote] = useState('');
  const undoStack = useRef<PolyMesh[]>([]);
  const redoStack = useRef<PolyMesh[]>([]);
  const [, bump] = useState(0);
  const live = useRef({ mesh, selection, mode });
  live.current = { mesh, selection, mode };

  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; orbit: OrbitControls;
    gizmo: TransformControls; handle: THREE.Object3D; solid: THREE.Mesh; wire: THREE.LineSegments; picked: THREE.LineSegments; pickedFaces: THREE.Mesh; points: THREE.Points;
    triFace: number[];
  } | null>(null);
  const drag = useRef<{ start: PolyMesh; centre: THREE.Vector3; verts: number[] } | null>(null);

  const commit = useCallback((next: PolyMesh, sel: Selection = NONE, tweak: LastTool | null = null) => {
    undoStack.current.push(live.current.mesh);
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
    setMeshState(next);
    setSelection(sel);
    setLast(tweak);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prior = undoStack.current.pop();
    if (!prior) return;
    redoStack.current.push(live.current.mesh);
    setMeshState(prior); setSelection(NONE); setLast(null); bump((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(live.current.mesh);
    setMeshState(next); setSelection(NONE); setLast(null); bump((n) => n + 1);
  }, []);

  // ---- Picks --------------------------------------------------------------------------------------
  const selectedVerts = useCallback((m: PolyMesh, s: Selection) => {
    const set = new Set(s.verts);
    for (const key of s.edges) for (const v of parseEdge(key)) set.add(v);
    for (const f of s.faces) for (const v of m.faces[f] ?? []) set.add(v);
    return [...set];
  }, []);

  const pick = useCallback((clientX: number, clientY: number, extend: boolean) => {
    const t = three.current;
    if (!t) return;
    const { mesh: m, selection: sel, mode: md } = live.current;
    const rect = t.renderer.domElement.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const project = (v: number[]) => {
      const p = new THREE.Vector3(v[0], v[1], v[2]).project(t.camera);
      return [(p.x * 0.5 + 0.5) * rect.width, (0.5 - p.y * 0.5) * rect.height, p.z];
    };
    const toggle = <T,>(list: T[], item: T) => (extend ? (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]) : [item]);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / rect.width) * 2 - 1, 1 - (py / rect.height) * 2), t.camera);
    const hit = ray.intersectObject(t.solid, false)[0];
    if (md === 'face') {
      if (hit && hit.faceIndex != null) setSelection({ ...NONE, faces: toggle(sel.faces, t.triFace[hit.faceIndex]) });
      else if (!extend) setSelection(NONE);
      return;
    }
    // Only what's on the facing side counts: the nearest surface hit limits how deep a pick can reach.
    const depthLimit = hit ? hit.point.clone().project(t.camera).z + 0.002 : 1;
    if (md === 'vertex') {
      let best = -1, bestD = 16;
      m.verts.forEach((v, i) => {
        const [x, y, z] = project(v);
        const d = Math.hypot(x - px, y - py);
        if (d < bestD && z <= depthLimit) { bestD = d; best = i; }
      });
      if (best >= 0) setSelection({ ...NONE, verts: toggle(sel.verts, best) });
      else if (!extend) setSelection(NONE);
      return;
    }
    let bestEdge: EdgeKey | null = null, bestD = 12;
    for (const key of edgeFaces(m).keys()) {
      const [a, b] = parseEdge(key);
      const [ax, ay, az] = project(m.verts[a]), [bx, by, bz] = project(m.verts[b]);
      const dx = bx - ax, dy = by - ay;
      const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6)));
      const d = Math.hypot(ax + dx * u - px, ay + dy * u - py);
      if (d < bestD && az + (bz - az) * u <= depthLimit) { bestD = d; bestEdge = key; }
    }
    if (bestEdge) setSelection({ ...NONE, edges: toggle(sel.edges, bestEdge) });
    else if (!extend) setSelection(NONE);
  }, []);

  // ---- Viewport setup -----------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#16151b');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 200);
    camera.position.set(2.4, 1.9, 3.2);
    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    orbit.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a44', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(3, 5, 4);
    scene.add(sun, new THREE.GridHelper(10, 20, 0x3b3a44, 0x26252c));
    const solid = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#a9a6ad', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#17161b' }));
    const picked = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ff5a8a', linewidth: 2, depthTest: false }));
    const pickedFaces = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ff5a8a', transparent: true, opacity: 0.45, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#ffffff', size: 6, sizeAttenuation: false, depthTest: true }));
    picked.renderOrder = 3;
    const handle = new THREE.Object3D();
    const gz = new TransformControls(camera, canvas);
    gz.attach(handle);
    gz.setSize(0.8);
    gz.enabled = false;
    scene.add(solid, wire, pickedFaces, picked, points, handle, gz.getHelper());
    three.current = { renderer, scene, camera, orbit, gizmo: gz, handle, solid, wire, picked, pickedFaces, points, triFace: [] };

    gz.addEventListener('dragging-changed', (event) => {
      if (event.value) {
        const { mesh: m, selection: s } = live.current;
        drag.current = { start: m, centre: handle.position.clone(), verts: selectedVerts(m, s) };
      } else if (drag.current) {
        const from = drag.current.start;
        const now = live.current.mesh;
        drag.current = null;
        handle.rotation.set(0, 0, 0);
        handle.scale.set(1, 1, 1);
        // The drag changed the live mesh directly; undo needs the mesh from before it.
        undoStack.current.push(from);
        redoStack.current = [];
        setMeshState(now);
        setLast(null);
        bump((n) => n + 1);
      }
    });
    gz.addEventListener('objectChange', () => {
      const d = drag.current;
      if (!d) return;
      const m = d.start;
      const verts = m.verts.map((v) => [...v]) as PolyMesh['verts'];
      const p = new THREE.Vector3();
      for (const i of d.verts) {
        p.set(...m.verts[i]).sub(d.centre).multiply(handle.scale).applyQuaternion(handle.quaternion).add(handle.position);
        verts[i] = [p.x, p.y, p.z];
      }
      setMeshState({ verts, faces: m.faces });
    });

    let raf = 0;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(r.height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(size);
    observer.observe(canvas);
    size();
    const loop = () => { raf = requestAnimationFrame(loop); orbit.update(); renderer.render(scene, camera); };
    loop();

    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { if (e.button === 0 && !gz.dragging && !gz.axis) down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) pick(e.clientX, e.clientY, e.shiftKey);
      down = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      gz.dispose(); orbit.dispose(); renderer.dispose();
      three.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Draw ---------------------------------------------------------------------------------------
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    let shown = mesh;
    for (let i = 0; i < preview; i++) shown = subdivide(shown);
    const tris = toTriangles(shown, flat && !preview);
    t.solid.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(tris.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(tris.normals, 3));
    g.setIndex(new THREE.BufferAttribute(tris.indices, 1));
    t.solid.geometry = g;
    t.triFace = preview ? [] : tris.triFace;
    const lineOf = (m: PolyMesh, keys: Iterable<EdgeKey>) => {
      const out: number[] = [];
      for (const key of keys) { const [a, b] = parseEdge(key); out.push(...m.verts[a], ...m.verts[b]); }
      return new Float32Array(out);
    };
    t.wire.geometry.dispose();
    t.wire.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lineOf(mesh, edgeFaces(mesh).keys()), 3));
    t.wire.visible = true;
    t.points.geometry.dispose();
    t.points.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.verts.flat()), 3));
    t.points.visible = mode === 'vertex';
  }, [mesh, preview, flat, mode]);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const edges = new Set<EdgeKey>(selection.edges);
    for (const f of selection.faces) { const face = mesh.faces[f] ?? []; face.forEach((v, i) => edges.add(edgeKey(v, face[(i + 1) % face.length]))); }
    const out: number[] = [];
    for (const key of edges) { const [a, b] = parseEdge(key); if (mesh.verts[a] && mesh.verts[b]) out.push(...mesh.verts[a], ...mesh.verts[b]); }
    for (const v of selection.verts) {
      const p = mesh.verts[v];
      if (!p) continue;
      const k = 0.02;
      out.push(p[0] - k, p[1], p[2], p[0] + k, p[1], p[2], p[0], p[1] - k, p[2], p[0], p[1] + k, p[2], p[0], p[1], p[2] - k, p[0], p[1], p[2] + k);
    }
    t.picked.geometry.dispose();
    t.picked.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    const tri: number[] = [];
    for (const f of selection.faces) {
      const face = mesh.faces[f] ?? [];
      for (let i = 1; i < face.length - 1; i++) tri.push(...mesh.verts[face[0]], ...mesh.verts[face[i]], ...mesh.verts[face[i + 1]]);
    }
    t.pickedFaces.geometry.dispose();
    t.pickedFaces.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri), 3));
    const verts = selectedVerts(mesh, selection);
    t.gizmo.enabled = verts.length > 0;
    t.gizmo.getHelper().visible = verts.length > 0;
    t.gizmo.setMode(gizmo);
    if (verts.length && !drag.current) {
      const c = new THREE.Vector3();
      for (const v of verts) c.add(new THREE.Vector3(...mesh.verts[v]));
      t.handle.position.copy(c.divideScalar(verts.length));
      t.handle.rotation.set(0, 0, 0);
      t.handle.scale.set(1, 1, 1);
    }
  }, [mesh, selection, gizmo, selectedVerts]);

  // ---- Autosave on this device ----------------------------------------------------------------------
  useEffect(() => { void idbGet(AUTOSAVE_KEY).then((saved: PolyMesh | undefined) => { if (saved?.faces?.length) setMeshState(saved); }).catch(() => {}); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void idbSet(AUTOSAVE_KEY, mesh).catch(() => {}); }, 1000);
    return () => window.clearTimeout(timer);
  }, [mesh]);

  // ---- Tools ------------------------------------------------------------------------------------------
  const adjustable = (label: string, amount: number, min: number, max: number, run: LastTool['run']) => {
    const first = run(amount);
    const sel: Selection = first.faces ? { ...NONE, faces: first.faces } : NONE;
    commit(first.mesh, sel, { label, amount, min, max, run });
  };
  const needFaces = () => { if (!selection.faces.length) { setNote('Select one or more faces first (press 3).'); return false; } setNote(''); return true; };
  const needEdges = () => { if (!selection.edges.length) { setNote('Select one or more edges first (press 2).'); return false; } setNote(''); return true; };

  const actions = {
    extrude: () => { if (!needFaces()) return; const b = mesh, ids = selection.faces; adjustable('Extrude', 0.25, -1.5, 1.5, (d) => extrudeFaces(b, ids, d)); },
    inset: () => { if (!needFaces()) return; const b = mesh, ids = selection.faces; adjustable('Inset', 0.25, 0.02, 0.95, (d) => insetFaces(b, ids, d)); },
    bevel: () => { if (!needEdges()) return; const b = mesh, ids = selection.edges; adjustable('Bevel', 0.08, 0.005, 0.4, (d) => ({ mesh: bevelEdges(b, ids, d) })); },
    loop: () => { if (!needEdges()) return; const b = mesh, e = selection.edges[0]; adjustable('Loop cut', 0.5, 0.02, 0.98, (d) => ({ mesh: loopCut(b, e, d) })); },
    subdivide: () => commit(subdivide(mesh)),
    mirror: () => commit(mirrorX(mesh)),
    flip: () => commit(flipFaces(mesh, selection.faces.length ? selection.faces : undefined), selection),
    merge: () => { const v = selectedVerts(mesh, selection); if (v.length < 2) { setNote('Select two or more vertices to merge.'); return; } commit(mergeVerts(mesh, v)); },
    remove: () => { if (!needFaces()) return; commit(deleteFaces(mesh, selection.faces)); },
    add: (next: PolyMesh) => commit(joinMeshes(mesh, next)),
    clearAll: () => commit({ verts: [], faces: [] }),
  };
  const act = useRef(actions);
  act.current = actions;

  useEffect(() => { onApi?.({ get mesh() { return live.current.mesh; }, get selection() { return live.current.selection; }, setSelection, setMode, actions: act, undo, redo, three }); }, [onApi, undo, redo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey) return;
      const a = act.current;
      const map: Record<string, () => void> = {
        1: () => { setMode('vertex'); setSelection(NONE); }, 2: () => { setMode('edge'); setSelection(NONE); }, 3: () => { setMode('face'); setSelection(NONE); },
        w: () => setGizmo('translate'), e: () => setGizmo('rotate'), r: () => setGizmo('scale'),
        x: a.extrude, i: a.inset, b: a.bevel, l: a.loop, d: a.subdivide, m: a.merge, delete: a.remove,
      };
      map[k]?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const exportGlb = async () => {
    const tris = toTriangles(mesh, flat);
    const glb = await meshToGlb(tris, 'Model');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(glb);
    link.download = 'model.glb';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
  };

  const sculpt = () => {
    let shown = mesh;
    for (let i = 0; i < preview; i++) shown = subdivide(shown);
    const tris = toTriangles(shown);
    onSculpt?.(tris.positions, tris.indices);
  };

  return (
    <div className="absolute inset-0 z-30 flex bg-[#16151b] text-white text-xs" data-testid="modeling-room">
      <nav className="w-36 shrink-0 p-2 flex flex-col gap-1 border-r border-white/[.07] overflow-y-auto">
        <button onClick={onBack} className={`${tool} flex items-center gap-1`}><ArrowLeft size={12}/>Back to clay</button>
        <div className="mt-2 text-[10px] uppercase tracking-wide text-white/40">Select</div>
        <div className="grid grid-cols-3 gap-1">
          {(['vertex', 'edge', 'face'] as Mode[]).map((m, i) => (
            <button key={m} aria-pressed={mode === m} title={`${m} (${i + 1})`} onClick={() => { setMode(m); setSelection(NONE); }} className={`py-1 rounded-md text-[10.5px] font-semibold ${mode === m ? 'bg-white text-black' : 'bg-white/[.07] hover:bg-white/15'}`}>{m === 'vertex' ? 'Vert' : m === 'edge' ? 'Edge' : 'Face'}</button>
          ))}
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-wide text-white/40">Transform</div>
        <div className="grid grid-cols-3 gap-1">
          {([['translate', 'Move', 'W'], ['rotate', 'Turn', 'E'], ['scale', 'Size', 'R']] as [Gizmo, string, string][]).map(([g, label, key]) => (
            <button key={g} aria-pressed={gizmo === g} title={`${label} (${key})`} onClick={() => setGizmo(g)} className={`py-1 rounded-md text-[10.5px] font-semibold ${gizmo === g ? 'bg-white text-black' : 'bg-white/[.07] hover:bg-white/15'}`}>{label}</button>
          ))}
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-wide text-white/40">Tools</div>
        <button className={tool} onClick={actions.extrude}>Extrude <span className="text-white/35">X</span></button>
        <button className={tool} onClick={actions.inset}>Inset <span className="text-white/35">I</span></button>
        <button className={tool} onClick={actions.bevel}>Bevel <span className="text-white/35">B</span></button>
        <button className={tool} onClick={actions.loop}>Loop cut <span className="text-white/35">L</span></button>
        <button className={tool} onClick={actions.subdivide}>Subdivide <span className="text-white/35">D</span></button>
        <button className={tool} onClick={actions.merge}>Merge <span className="text-white/35">M</span></button>
        <button className={tool} onClick={actions.mirror}>Mirror across X</button>
        <button className={tool} onClick={actions.flip}>Flip faces</button>
        <button className={tool} onClick={actions.remove}>Delete faces <span className="text-white/35">Del</span></button>
        <div className="mt-2 text-[10px] uppercase tracking-wide text-white/40">Add</div>
        <button className={tool} onClick={() => actions.add(makeBox(1))}>Box</button>
        <button className={tool} onClick={() => actions.add(makeCylinder())}>Cylinder</button>
        <button className={tool} onClick={() => actions.add(makeSphere())}>Sphere</button>
        <button className={tool} onClick={() => actions.add(makePlane(1, 4))}>Plane</button>
        <button className={tool} onClick={actions.clearAll}>Clear all</button>
      </nav>

      <main className="relative flex-1 min-w-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none"/>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button onClick={undo} disabled={!undoStack.current.length} aria-label="Undo" className="p-2 rounded-lg bg-black/50 hover:bg-black/70 disabled:opacity-30"><Undo2 size={14}/></button>
          <button onClick={redo} disabled={!redoStack.current.length} aria-label="Redo" className="p-2 rounded-lg bg-black/50 hover:bg-black/70 disabled:opacity-30"><Redo2 size={14}/></button>
          <button onClick={exportGlb} className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-black/50 hover:bg-black/70 font-semibold"><Download size={13}/>GLB</button>
          {onSculpt && <button onClick={sculpt} className="px-3 py-2 rounded-lg font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055]">Sculpt this</button>}
        </div>
        {last && (
          <label className="absolute top-2 left-2 w-52 p-2 rounded-lg bg-black/65 flex flex-col gap-1 font-semibold">{last.label}
            <input aria-label={`${last.label} amount`} type="range" min={last.min} max={last.max} step={(last.max - last.min) / 200} value={last.amount}
              onChange={(e) => { const amount = +e.target.value; const redone = last.run(amount); setMeshState(redone.mesh); setLast({ ...last, amount }); if (redone.faces) setSelection({ ...NONE, faces: redone.faces }); }}/>
          </label>
        )}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-black/65">
          <label className="flex items-center gap-1.5">Smooth preview
            <select aria-label="Smooth preview level" value={preview} onChange={(e) => setPreview(+e.target.value)} className="bg-white/10 rounded px-1 outline-none">
              {[0, 1, 2, 3].map((n) => <option key={n} value={n} className="text-black">{n ? `${n}x` : 'Off'}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)}/>Flat</label>
          <span className="text-white/45">{mesh.verts.length} verts · {mesh.faces.length} faces · right drag turns, wheel zooms, Shift adds</span>
        </div>
        {!!note && <div role="status" className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/70">{note}</div>}
      </main>
    </div>
  );
}
