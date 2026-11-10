// Build Studio 3D workspace: shapes on a millimetre workplane, handles to move/turn/stretch,
// typed sizes, solids and holes, groups (cut with our own CSG), align, mirror, and a print check
// with STL/3MF export or Send to Make.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Undo2, Redo2, Copy, Trash2, Group, Ungroup, Move3d, RotateCw, Scaling, FlipHorizontal2, ArrowDownToLine, Download, Send, Home, Eye, Magnet, AlignHorizontalJustifyCenter } from 'lucide-react';
import { SHAPE_INFO, HOLE_COLOR, makeShape, primitive, solidOf, shapeBounds, translate, groupShapes, ungroup, rotateGroup, scaleGroup, align, mirror, dropToPlane, snap, newId, meshes, printReport, PRINTERS, type Scene, type Shape, type ShapeKind, type Audience, type AlignMode } from '../../../services/build/studio/shapes';
import { toMesh, type V3 } from '../../../services/build/studio/csg';
import { writeStl } from '../../../services/mech/geometry';
import { write3mf } from '../../../services/fab/threeMf';
import { emptyModel, type CadModel } from '../../../services/cad/model';
import { useToolRail, useToolRunner, useRoomState, AriaToolHint, FreshDot } from '../../workspace/useToolRail';
import { STUDIO, registerStudioTools, studioRoomState, type StudioToolDoc, type StudioToolId } from '../../../services/build/workspaceTools';
import type { Level } from '../../../services/workspace/guidePath';

registerStudioTools();
const NO_SEL: number[] = [];

type Kind = Exclude<ShapeKind, 'group'>;
const KINDS: Kind[] = ['box', 'cylinder', 'sphere', 'cone', 'wedge', 'pyramid', 'torus', 'text', 'star', 'heart'];
const SWATCHES = ['#e03131', '#e8590c', '#fab005', '#2f9e44', '#0ca678', '#1c7ed6', '#7048e8', '#d6336c', '#f8f9fa', '#343a40'];
const dl = (name: string, data: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const fileName = (t: string) => (t.trim() || 'build').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase();
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Our own shape icons (simple line drawings). */
export function ShapeIcon({ kind, size = 30 }: { kind: Kind; size?: number }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' as const };
  const body: Record<Kind, React.ReactNode> = {
    box: <><path d="M6 11 L16 6 L26 11 L26 22 L16 27 L6 22 Z" {...s}/><path d="M6 11 L16 16 L26 11 M16 16 V27" {...s}/></>,
    cylinder: <><ellipse cx="16" cy="9" rx="9" ry="3.5" {...s}/><path d="M7 9 V23 A9 3.5 0 0 0 25 23 V9" {...s}/></>,
    sphere: <><circle cx="16" cy="16" r="10" {...s}/><ellipse cx="16" cy="16" rx="10" ry="3.5" {...s} strokeDasharray="2 2"/></>,
    cone: <><path d="M16 5 L25 23 A9 3.5 0 0 1 7 23 Z" {...s}/></>,
    wedge: <><path d="M6 24 L26 24 L26 24 L6 9 Z" {...s}/><path d="M6 9 L12 6 L30 21 L26 24 M30 21 V21" {...s}/></>,
    pyramid: <><path d="M16 5 L27 22 L16 27 L5 22 Z" {...s}/><path d="M16 5 V27" {...s}/></>,
    torus: <><ellipse cx="16" cy="16" rx="11" ry="6" {...s}/><ellipse cx="16" cy="15.5" rx="4.5" ry="2" {...s}/></>,
    text: <><path d="M8 25 L13 7 L18 25 M10 19 H16" {...s}/><path d="M20 25 V13 H25 A3 3 0 0 1 25 19 H20 M25 19 A3 3 0 0 1 25 25 H20" {...s}/></>,
    star: <path d="M16 5 L19 13 L27 13 L21 18 L23 26 L16 21 L9 26 L11 18 L5 13 L13 13 Z" {...s}/>,
    heart: <path d="M16 26 C6 19 4 13 7 9 C10 6 14 7 16 11 C18 7 22 6 25 9 C28 13 26 19 16 26 Z" {...s}/>,
  };
  return <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">{body[kind]}</svg>;
}

function geometryOf(s: Shape): THREE.BufferGeometry {
  let m: { positions: Float32Array; indices: Uint32Array };
  if (s.kind === 'group') { const sol = solidOf(s); m = toMesh(sol); for (let i = 0; i < m.positions.length; i += 3) { m.positions[i] -= s.pos[0]; m.positions[i + 1] -= s.pos[1]; m.positions[i + 2] -= s.pos[2]; } }
  else m = toMesh(primitive(s));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.computeVertexNormals(); return g;
}
const geoKey = (s: Shape) => JSON.stringify(s.kind === 'group' ? s : { k: s.kind, z: s.size, n: s.sides, t: s.text, p: s.top });

function rulerSprite(text: string) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d')!; x.fillStyle = '#5c6b80'; x.font = '600 20px ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 32, 16);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); sp.scale.set(10, 5, 1); return sp;
}

/** A number box that keeps what the student is typing (no rounding mid-number) and applies each valid value. */
function NumField({ value, onCommit, step, min, testid }: { value: number; onCommit: (v: number) => void; step: number; min?: number; testid?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (v: number) => { if (Number.isFinite(v) && (min === undefined || v >= min)) onCommit(v); };
  return <input type="text" inputMode="decimal" value={draft ?? String(r1(value))} data-testid={testid}
    onFocus={e => { setDraft(String(r1(value))); e.currentTarget.select(); }} onBlur={() => setDraft(null)}
    onKeyDown={e => {
      if (e.key === 'Enter') e.currentTarget.blur();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = r1((parseFloat(draft ?? String(value)) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)); setDraft(String(v)); apply(v); }
    }}
    onChange={e => { const t = e.target.value.replace(/[^0-9.\-]/g, ''); setDraft(t); if (/^-?\d*\.?\d+$|^-?\d+\.?$/.test(t)) apply(parseFloat(t)); }}/>;
}

export interface Studio3DProps {
  scene: Scene; commit: (s: Scene) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  title: string; audience: Audience; setAudience: (a: Audience) => void; printer: string; setPrinter: (id: string) => void;
  exportBlocked: string | null; onExported: () => void; onSendToMake: (m: CadModel) => void; registerThumb: (fn: () => string | undefined) => void; showSafety: () => void;
  /** Simple/Pro from the workspace shell. */
  level?: Level;
}

export default function Studio3D(p: Studio3DProps) {
  const { scene, commit } = p;
  const mount = useRef<HTMLDivElement>(null);
  const T = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; orbit: OrbitControls; tc: TransformControls; root: THREE.Group; objs: Map<string, { key: string; obj: THREE.Mesh }> } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [alignOpen, setAlignOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const shapesRef = useRef(scene.shapes); shapesRef.current = scene.shapes;
  const selRef = useRef(sel); selRef.current = sel;
  const grid = scene.grid || 1;
  const selected = scene.shapes.filter(s => sel.includes(s.id));
  const one = selected.length === 1 ? selected[0] : null;
  // Tools join the toolbar as the plate calls for them (services/build/workspaceTools.ts).
  const level = p.level ?? 'simple';
  const floating = selected.some(s => shapeBounds(s).min[2] > 0.05);
  const railDoc = useMemo<StudioToolDoc>(() => ({ shapes: scene.shapes.length, holes: scene.shapes.filter(s => s.hole).length, groups: scene.shapes.filter(s => s.kind === 'group').length, picked: sel.length, floating }), [scene.shapes, sel.length, floating]);
  const rail = useToolRail<StudioToolDoc>(STUDIO, railDoc, NO_SEL, level);
  const setShapes = useCallback((shapes: Shape[]) => commit({ ...scene, shapes }), [commit, scene]);
  const replace = (s: Shape) => setShapes(scene.shapes.map(x => (x.id === s.id ? s : x)));

  // ---------------------------------------------------------------- three.js setup
  useEffect(() => {
    const el = mount.current!; const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block'; renderer.domElement.setAttribute('data-testid', 'studio3d-canvas');
    const sc = new THREE.Scene(); sc.background = new THREE.Color('#e7ecf3');
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000); camera.position.set(140, 150, 190);
    sc.add(new THREE.HemisphereLight('#ffffff', '#b8c2cf', 1.6)); const sun = new THREE.DirectionalLight('#ffffff', 1.8); sun.position.set(120, 260, 160); sc.add(sun);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#f7f9fc' })); plate.rotation.x = -Math.PI / 2; plate.position.y = -0.05; sc.add(plate);
    const minor = new THREE.GridHelper(200, 40, '#d3dbe6', '#d3dbe6'); sc.add(minor); const major = new THREE.GridHelper(200, 10, '#7f93ad', '#9fb0c6'); major.position.y = 0.02; sc.add(major);
    for (let v = -100; v <= 100; v += 20) { const a = rulerSprite(String(v)); a.position.set(v, 0.5, 108); sc.add(a); if (v) { const b = rulerSprite(String(v)); b.position.set(-110, 0.5, -v); sc.add(b); } }
    const axes = new THREE.Group(); const ax = (dir: V3, color: string) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(...dir)]); axes.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color }))); };
    ax([24, 0.1, 0], '#e03131'); ax([0, 0.1, -24], '#2f9e44'); sc.add(axes);
    const root = new THREE.Group(); root.rotation.x = -Math.PI / 2; sc.add(root); // model is Z-up, three is Y-up
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 5, 0); orbit.enableDamping = true; orbit.maxDistance = 1500;
    const tc = new TransformControls(camera, renderer.domElement); tc.setSize(0.9); sc.add(tc.getHelper());
    tc.addEventListener('dragging-changed', e => { orbit.enabled = !(e as unknown as { value: boolean }).value; });
    T.current = { renderer, scene: sc, camera, orbit, tc, root, objs: new Map() };
    const resize = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0; const tick = () => { raf = requestAnimationFrame(tick); orbit.update(); renderer.render(sc, camera); }; tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); tc.dispose(); orbit.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); T.current = null; };
  }, []);

  useEffect(() => { p.registerThumb(() => { const t = T.current; if (!t) return undefined; t.tc.detach(); t.renderer.render(t.scene, t.camera); const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d')!; x.drawImage(t.renderer.domElement, 0, 0, 320, 240); return c.toDataURL('image/jpeg', 0.82); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep meshes in step with the shapes.
  useEffect(() => {
    const t = T.current; if (!t) return; const seen = new Set<string>();
    for (const s of scene.shapes) {
      seen.add(s.id); const key = geoKey(s); let rec = t.objs.get(s.id);
      if (!rec || rec.key !== key) {
        if (rec) { t.root.remove(rec.obj); rec.obj.geometry.dispose(); }
        const mesh = new THREE.Mesh(geometryOf(s), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 })); mesh.userData.id = s.id;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: '#ff8c00' })); edges.name = 'sel'; mesh.add(edges);
        rec = { key, obj: mesh }; t.objs.set(s.id, rec); t.root.add(mesh);
      }
      const m = rec.obj; const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.set(s.hole ? HOLE_COLOR : s.color); mat.transparent = s.hole; mat.opacity = s.hole ? 0.38 : 1; mat.depthWrite = !s.hole; mat.side = THREE.DoubleSide;
      m.position.set(...s.pos);
      if (s.kind === 'group') { m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); }
      else { m.rotation.set(...(s.rot.map(d => (d * Math.PI) / 180) as V3), 'XYZ'); m.scale.set(s.flip?.[0] ? -1 : 1, s.flip?.[1] ? -1 : 1, s.flip?.[2] ? -1 : 1); }
      (m.getObjectByName('sel') as THREE.Object3D).visible = sel.includes(s.id);
    }
    for (const [id, rec] of t.objs) if (!seen.has(id)) { t.root.remove(rec.obj); rec.obj.geometry.dispose(); t.objs.delete(id); }
    const first = sel.length ? t.objs.get(sel[sel.length - 1])?.obj : undefined;
    if (first && sel.length === 1) { t.tc.attach(first); } else t.tc.detach();
  }, [scene.shapes, sel]);

  useEffect(() => { const t = T.current; if (!t) return; t.tc.setMode(mode); t.tc.setSpace(mode === 'translate' ? 'world' : 'local'); t.tc.setTranslationSnap(grid); t.tc.setRotationSnap(THREE.MathUtils.degToRad(15)); t.tc.setScaleSnap(null); }, [mode, grid]);

  // Commit a handle drag back into the model.
  useEffect(() => {
    const t = T.current; if (!t) return;
    const up = () => {
      const obj = t.tc.object as THREE.Mesh | undefined; if (!obj) return; const id = obj.userData.id as string; const s = shapesRef.current.find(x => x.id === id); if (!s) return;
      let next: Shape = s; const pos: V3 = [obj.position.x, obj.position.y, obj.position.z];
      if (t.tc.mode === 'translate') { const d = pos.map((v, i) => v - s.pos[i]) as V3; next = translate(s, d); }
      else if (t.tc.mode === 'rotate') {
        const deg = [obj.rotation.x, obj.rotation.y, obj.rotation.z].map(r => r1(THREE.MathUtils.radToDeg(r))) as V3;
        if (s.kind === 'group') { next = s; deg.forEach((d, i) => { if (Math.abs(d) > 0.01) next = rotateGroup(next, i as 0 | 1 | 2, d); }); }
        else next = { ...s, rot: deg };
      } else {
        const k = [Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z)]; const size = s.size.map((v, i) => Math.max(grid >= 1 ? 1 : 0.5, snap(v * k[i], grid))) as V3;
        next = s.kind === 'group' ? scaleGroup(s, size) : { ...s, size, pos: [s.pos[0], s.pos[1], s.pos[2] + (size[2] - s.size[2]) / 2 * (s.rot[0] || s.rot[1] ? 0 : 1)] };
      }
      commit({ ...sceneRef.current, shapes: shapesRef.current.map(x => (x.id === id ? next : x)) });
    };
    t.tc.addEventListener('mouseUp', up); return () => t.tc.removeEventListener('mouseUp', up);
  }, [commit, grid]);
  const sceneRef = useRef(scene); sceneRef.current = scene;

  // Click to select (a click, not an orbit drag).
  const down = useRef<[number, number] | null>(null);
  const pick = (e: React.PointerEvent) => {
    const t = T.current; const d = down.current; down.current = null; if (!t || !d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4 || t.tc.dragging) return;
    if ((t.tc as unknown as { axis: string | null }).axis) return;
    const r = t.renderer.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), t.camera);
    const hit = ray.intersectObjects([...t.objs.values()].map(x => x.obj), false)[0]; const id = hit?.object.userData.id as string | undefined;
    if (!id) { if (!e.shiftKey) setSel([]); return; }
    setSel(cur => (e.shiftKey ? (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]) : [id]));
  };
  /** Where on the workplane a screen point lands (model mm). */
  const planeAt = (clientX: number, clientY: number): [number, number] => {
    const t = T.current; if (!t) return [0, 0]; const r = t.renderer.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), t.camera);
    const pt = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt) ? [snap(pt.x, grid), snap(-pt.z, grid)] : [0, 0];
  };

  // ---------------------------------------------------------------- actions
  const add = (kind: Kind, at?: [number, number]) => {
    let spot = at ?? [0, 0]; if (!at) { const taken = (x: number, y: number) => scene.shapes.some(s => { const b = shapeBounds(s); return x > b.min[0] - 6 && x < b.max[0] + 6 && y > b.min[1] - 6 && y < b.max[1] + 6; }); for (let i = 0; i < 40 && taken(spot[0], spot[1]); i++) spot = [((i % 5) - 2) * 30, (Math.floor(i / 5) - 1) * -30]; }
    const s = makeShape(kind, spot); setShapes([...scene.shapes, s]); setSel([s.id]);
  };
  const del = () => { if (!sel.length) return; setShapes(scene.shapes.filter(s => !sel.includes(s.id))); setSel([]); };
  const dup = () => { if (!selected.length) return; const clone = (s: Shape): Shape => ({ ...s, id: newId(), children: s.children?.map(clone) }); const copies = selected.map(s => translate(clone(s), [grid >= 1 ? 10 : 5, grid >= 1 ? 10 : 5, 0])); setShapes([...scene.shapes, ...copies]); setSel(copies.map(c => c.id)); };
  const doGroup = () => { if (selected.length < 2) return; const g = groupShapes(selected); setShapes([...scene.shapes.filter(s => !sel.includes(s.id)), g]); setSel([g.id]); };
  const doUngroup = () => { const gs = selected.filter(s => s.kind === 'group'); if (!gs.length) return; const kids = gs.flatMap(ungroup); setShapes([...scene.shapes.filter(s => !gs.includes(s)), ...kids]); setSel(kids.map(k => k.id)); };
  const toggleHole = (hole?: boolean) => { if (!selected.length) return; const h = hole ?? !selected.every(s => s.hole); setShapes(scene.shapes.map(s => (sel.includes(s.id) ? { ...s, hole: h } : s))); };
  const doAlign = (axis: 0 | 1 | 2, m: AlignMode) => { const moved = align(selected, axis, m); setShapes(scene.shapes.map(s => moved.find(x => x.id === s.id) ?? s)); };
  const doMirror = (axis: 0 | 1 | 2) => setShapes(scene.shapes.map(s => (sel.includes(s.id) ? mirror(s, axis) : s)));
  const doDrop = () => setShapes(scene.shapes.map(s => (sel.includes(s.id) ? dropToPlane(s) : s)));
  const nudge = (d: V3) => setShapes(scene.shapes.map(s => (sel.includes(s.id) ? translate(s, d) : s)));
  const view = (which: 'home' | 'top' | 'front') => { const t = T.current; if (!t) return; const pos = which === 'top' ? [0, 320, 0.01] : which === 'front' ? [0, 40, 300] : [140, 150, 190]; t.camera.position.set(pos[0], pos[1], pos[2]); t.orbit.target.set(0, which === 'top' ? 0 : 5, 0); t.orbit.update(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase(); const mod = e.ctrlKey || e.metaKey; const step = e.shiftKey ? grid * 10 : grid;
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) p.redo(); else p.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); p.redo(); }
      else if (mod && k === 'd') { e.preventDefault(); dup(); }
      else if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) doUngroup(); else doGroup(); }
      else if (k === 'delete' || k === 'backspace') { if (sel.length) { e.preventDefault(); del(); } }
      else if (k === 'h' && !mod) toggleHole();
      else if (k === 'escape') setSel([]);
      else if (k === 'arrowleft') { e.preventDefault(); nudge([-step, 0, 0]); } else if (k === 'arrowright') { e.preventDefault(); nudge([step, 0, 0]); }
      else if (k === 'arrowup') { e.preventDefault(); nudge(mod ? [0, 0, step] : [0, step, 0]); } else if (k === 'arrowdown') { e.preventDefault(); nudge(mod ? [0, 0, -step] : [0, -step, 0]); }
      else if (k === 'w') setMode('translate'); else if (k === 'e') setMode('rotate'); else if (k === 'r') setMode('scale');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const printer = PRINTERS.find(x => x.id === p.printer) ?? PRINTERS[1];
  const report = useMemo(() => { try { return printReport(scene, printer, p.audience); } catch { return null; } }, [scene, printer, p.audience]);
  // Ask Aria knows what's on the plate, what's picked and what the print check found.
  useRoomState(STUDIO, useMemo(() => studioRoomState({ title: p.title, shapes: scene.shapes, picked: selected, report, audience: p.audience }), [p.title, scene.shapes, selected, report, p.audience]));
  const errors = report?.findings.filter(f => f.level === 'error') ?? [];
  const smallParts = errors.find(e => e.id === 'small-parts');
  const blocked = p.exportBlocked ?? (smallParts ? 'Made for a child under 3 but small enough to choke on: make it bigger, or change who it is for.' : null);
  const exportFile = (kind: 'stl' | '3mf') => {
    if (blocked) { if (p.exportBlocked) p.showSafety(); else setPrintOpen(true); return; }
    const ms = meshes(scene); if (!ms.length) return;
    if (kind === 'stl') dl(`${fileName(p.title)}.stl`, writeStl(ms, p.title) as BlobPart, 'model/stl'); else dl(`${fileName(p.title)}.3mf`, write3mf(ms, { title: p.title }) as BlobPart, 'model/3mf');
    p.onExported();
  };
  const sendToMake = () => {
    if (blocked) { if (p.exportBlocked) p.showSafety(); else setPrintOpen(true); return; }
    const ms = meshes(scene); if (!ms.length) return; const m = emptyModel(`${p.title}.stl`, 'stl', 'Plajah Build Studio'); m.units = 'mm';
    m.meshes = ms.map((x, i) => ({ id: `m${i}`, name: x.name, positions: x.positions, indices: x.indices, color: scene.shapes.filter(s => !s.hole)[i]?.color }));
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]; for (const x of ms) for (let i = 0; i < x.positions.length; i++) { const k = i % 3; min[k] = Math.min(min[k], x.positions[i]); max[k] = Math.max(max[k], x.positions[i]); }
    m.bounds = { min, max }; m.elements = ms.map((x, i) => ({ id: `e${i}`, cls: 'Part', name: x.name, meshIds: [`m${i}`], props: {} })); p.onSendToMake(m);
  };

  // ---------------------------------------------------------------- inspector helpers
  const num = (label: string, value: number, set: (v: number) => void, o: { min?: number; step?: number; testid?: string } = {}) => <label className="bs-num"><span>{label}</span>
    <NumField value={value} onCommit={set} step={o.step ?? grid} min={o.min} testid={o.testid}/></label>;
  const setSize = (i: number, v: number) => { if (!one) return; const size = one.size.slice() as V3; size[i] = Math.max(0.2, v); if (one.kind === 'group') { replace(scaleGroup(one, size)); return; } const bottom = shapeBounds(one).min[2]; const s = { ...one, size }; const nb = shapeBounds(s).min[2]; replace({ ...s, pos: [s.pos[0], s.pos[1], s.pos[2] + (bottom - nb)] }); };
  const setPos = (i: number, v: number) => { if (!one) return; const d: V3 = [0, 0, 0]; if (i < 2) d[i] = v - one.pos[i]; else d[2] = v - shapeBounds(one).min[2]; replace(translate(one, d)); };
  const setRot = (i: number, v: number) => { if (!one) return; if (one.kind === 'group') { replace(rotateGroup(one, i as 0 | 1 | 2, v)); return; } const rot = one.rot.slice() as V3; rot[i] = v; replace({ ...one, rot }); };
  const setColor = (c: string) => setShapes(scene.shapes.map(s => (sel.includes(s.id) ? { ...s, color: c, hole: false, children: s.children?.map(k => (k.hole ? k : { ...k, color: c })) } : s)));

  const tool = (icon: React.ReactNode, label: string, on: () => void, o: { disabled?: boolean; active?: boolean; testid?: string; id?: StudioToolId } = {}) => {
    if (o.id && !o.active && !rail.shows(o.id)) return null;
    const fresh = o.id ? rail.fresh.get(o.id) : undefined;
    return <button className={`bs-tool${o.active ? ' on' : ''}`} style={fresh ? { position: 'relative' } : undefined} onClick={() => { if (o.id) rail.used(o.id); on(); }} disabled={o.disabled} title={label} aria-label={label} data-testid={o.testid ?? (o.id ? `tool-${o.id}` : undefined)}>{icon}<span>{label}</span>{fresh && <FreshDot reason={fresh} testid={`studio-fresh-${o.id}`}/>}</button>;
  };
  const tryTool = (id: StudioToolId) => { rail.used(id); ({ group: doGroup, align: () => setAlignOpen(true), ungroup: doUngroup, drop: doDrop, top: () => view('top') } as Partial<Record<StudioToolId, () => void>>)[id]?.(); };
  // Ask Aria's "Show me": the same buttons, pressed from the chat.
  useToolRunner(STUDIO, id => {
    const run: Partial<Record<StudioToolId, () => void>> = { group: doGroup, align: () => setAlignOpen(true), ungroup: doUngroup, drop: doDrop, top: () => view('top'), home: () => view('home'),
      move: () => setMode('translate'), turn: () => setMode('rotate'), stretch: () => setMode('scale'), undo: p.undo, redo: p.redo, duplicate: dup, delete: del, mirror: () => doMirror(0) };
    const f = run[id as StudioToolId]; if (!f) return false;
    const simple = level === 'simple';
    if ((id === 'group' || id === 'align') && selected.length < 2) return simple ? `First pick the shapes: click one, then Shift+click the other${id === 'group' ? ' (the solid and the hole)' : ''}. Then press Show me again.` : `Select two or more shapes first (Shift+click).`;
    if (['duplicate', 'delete', 'mirror', 'drop'].includes(id) && !selected.length) return simple ? 'First click the shape you want, then press Show me again.' : 'Select a shape first.';
    if (id === 'ungroup' && !selected.some(s => s.kind === 'group')) return simple ? 'First click the group you want to take apart.' : 'Select a group first.';
    rail.used(id); f(); return true;
  });

  return <div className="bs3">
    <aside className="bs3-palette" aria-label="Shapes">
      <div className="bs-h">Shapes</div>
      <div className="bs3-shapes">{KINDS.map(k => <button key={k} draggable onDragStart={e => e.dataTransfer.setData('text/plajah-shape', k)} onClick={() => add(k)} title={SHAPE_INFO[k].about} data-testid={`shape-${k}`} style={{ ['--c' as any]: SHAPE_INFO[k].color }}>
        <ShapeIcon kind={k}/><span>{SHAPE_INFO[k].label}</span></button>)}</div>
      <div className="bs-tip">Drag a shape onto the plate or click it. Shift-click to pick more than one.</div>
    </aside>

    <div className="bs3-main">
      <div className="bs3-toolbar" role="toolbar" aria-label="3D tools">
        {tool(<Undo2 size={16}/>, 'Undo', p.undo, { disabled: !p.canUndo, testid: 'tool-undo', id: 'undo' })}
        {tool(<Redo2 size={16}/>, 'Redo', p.redo, { disabled: !p.canRedo, id: 'redo' })}
        <i className="bs-sep"/>
        {tool(<Move3d size={16}/>, 'Move', () => setMode('translate'), { active: mode === 'translate', id: 'move' })}
        {tool(<RotateCw size={16}/>, 'Turn', () => setMode('rotate'), { active: mode === 'rotate', id: 'turn' })}
        {tool(<Scaling size={16}/>, 'Stretch', () => setMode('scale'), { active: mode === 'scale', id: 'stretch' })}
        <i className="bs-sep"/>
        {tool(<Copy size={16}/>, 'Duplicate', dup, { disabled: !sel.length, id: 'duplicate' })}
        {tool(<Trash2 size={16}/>, 'Delete', del, { disabled: !sel.length, id: 'delete' })}
        {tool(<Group size={16}/>, 'Group', doGroup, { disabled: selected.length < 2, testid: 'tool-group', id: 'group' })}
        {tool(<Ungroup size={16}/>, 'Ungroup', doUngroup, { disabled: !selected.some(s => s.kind === 'group'), id: 'ungroup' })}
        {(rail.shows('align') || alignOpen) && <div className="bs-pop">{tool(<AlignHorizontalJustifyCenter size={16}/>, 'Align', () => setAlignOpen(o => !o), { disabled: selected.length < 2, id: 'align' })}
          {alignOpen && selected.length >= 2 && <div className="bs-menu" onMouseLeave={() => setAlignOpen(false)}>{(['X', 'Y', 'Z'] as const).map((a, i) => <div key={a} className="bs-menu-row"><b>{a === 'Z' ? 'Height' : a === 'X' ? 'Left–right' : 'Front–back'}</b>{(['min', 'mid', 'max'] as AlignMode[]).map(m => <button key={m} onClick={() => doAlign(i as 0 | 1 | 2, m)}>{m === 'mid' ? 'centre' : i === 2 ? (m === 'min' ? 'bottom' : 'top') : i === 0 ? (m === 'min' ? 'left' : 'right') : (m === 'min' ? 'front' : 'back')}</button>)}</div>)}</div>}
        </div>}
        {tool(<FlipHorizontal2 size={16}/>, 'Mirror', () => doMirror(0), { disabled: !sel.length, id: 'mirror' })}
        {tool(<ArrowDownToLine size={16}/>, 'Drop', doDrop, { disabled: !sel.length, id: 'drop' })}
        <i className="bs-sep"/>
        {(rail.shows('snap') || grid !== 1) && <label className="bs-snap" title="Snap grid" onChange={() => rail.used('snap')}><Magnet size={14}/><select value={grid} onChange={e => commit({ ...scene, grid: parseFloat(e.target.value) })} aria-label="Snap grid">{[0.1, 0.5, 1, 2, 5, 10].map(g => <option key={g} value={g}>{g} mm</option>)}</select></label>}
        {tool(<Home size={16}/>, 'Home view', () => view('home'), { id: 'home' })}
        {tool(<Eye size={16}/>, 'Top view', () => view('top'), { id: 'top' })}
        {(rail.hidden > 0 || rail.showAll) && <button className="bs-tool" onClick={() => rail.setShowAll(!rail.showAll)} title={rail.showAll ? 'Show only the tools this build needs' : 'Show every tool'} data-testid="studio-tools-more"><span>{rail.showAll ? 'Fewer' : `+${rail.hidden}`}</span></button>}
      </div>
      <div className="bs3-view" ref={mount} onPointerDown={e => { down.current = [e.clientX, e.clientY]; }} onPointerUp={pick}
        onDragOver={e => { if (e.dataTransfer.types.includes('text/plajah-shape')) e.preventDefault(); }}
        onDrop={e => { const k = e.dataTransfer.getData('text/plajah-shape') as Kind; if (!KINDS.includes(k)) return; e.preventDefault(); add(k, planeAt(e.clientX, e.clientY)); }}>
        {one && <div className="bs3-dims" data-testid="studio3d-dims">{one.name}: {r1(one.size[0])} × {r1(one.size[1])} × {r1(one.size[2])} mm{one.hole ? ' · hole' : ''}</div>}
        {!scene.shapes.length && <div className="bs3-empty">Drag a shape here to start</div>}
        {rail.suggestion && <AriaToolHint tool={rail.suggestion} level={level} testid="studio-aria-hint" style={{ bottom: 14 }} onDismiss={rail.dismiss} onTry={() => tryTool(rail.suggestion!.id as StudioToolId)}/>}
      </div>
    </div>

    <aside className="bs3-side" aria-label="Inspector">
      {one ? <div className="bs-card" data-testid="studio3d-inspector">
        <input className="bs-name" value={one.name} onChange={e => replace({ ...one, name: e.target.value.slice(0, 40) })} aria-label="Shape name"/>
        <div className="bs-seg" role="radiogroup" aria-label="Solid or hole">
          <button className={!one.hole ? 'on' : ''} onClick={() => toggleHole(false)} data-testid="make-solid">Solid</button>
          <button className={one.hole ? 'on hole' : ''} onClick={() => toggleHole(true)} data-testid="make-hole">Hole</button>
        </div>
        <div className="bs-h">Size (mm)</div>
        <div className="bs-row3">{num('W', one.size[0], v => setSize(0, v), { min: 0.2, testid: 'size-w' })}{num('D', one.size[1], v => setSize(1, v), { min: 0.2, testid: 'size-d' })}{num('H', one.size[2], v => setSize(2, v), { min: 0.2, testid: 'size-h' })}</div>
        <div className="bs-h">Position (mm)</div>
        <div className="bs-row3">{num('X', one.pos[0], v => setPos(0, v), { testid: 'pos-x' })}{num('Y', one.pos[1], v => setPos(1, v), { testid: 'pos-y' })}{num('Lift', shapeBounds(one).min[2], v => setPos(2, v), { testid: 'pos-lift' })}</div>
        <div className="bs-h">Turn (degrees)</div>
        <div className="bs-row3">{num('X', one.kind === 'group' ? 0 : one.rot[0], v => setRot(0, v), { step: 15 })}{num('Y', one.kind === 'group' ? 0 : one.rot[1], v => setRot(1, v), { step: 15 })}{num('Z', one.kind === 'group' ? 0 : one.rot[2], v => setRot(2, v), { step: 15 })}</div>
        {one.kind === 'text' && <><div className="bs-h">Letters</div><input className="bs-text" value={one.text ?? ''} maxLength={24} onChange={e => replace({ ...one, text: e.target.value })} data-testid="shape-text" aria-label="Letters"/></>}
        {(one.kind === 'cylinder' || one.kind === 'cone' || one.kind === 'sphere' || one.kind === 'torus') && <label className="bs-range"><span>Smoothness</span><input type="range" min={6} max={96} step={2} value={one.sides ?? 32} onChange={e => replace({ ...one, sides: +e.target.value })}/><b>{one.sides ?? 32}</b></label>}
        {one.kind === 'cone' && <label className="bs-range"><span>Top</span><input type="range" min={0} max={1} step={0.05} value={one.top ?? 0} onChange={e => replace({ ...one, top: +e.target.value })}/><b>{Math.round((one.top ?? 0) * 100)}%</b></label>}
        {rail.shows('mirror') && <><div className="bs-h">Mirror</div>
        <div className="bs-seg">{(['X', 'Y', 'Z'] as const).map((a, i) => <button key={a} onClick={() => { rail.used('mirror'); doMirror(i as 0 | 1 | 2); }}>{a}</button>)}</div></>}
        {!one.hole && <><div className="bs-h">Colour</div><div className="bs-swatches">{SWATCHES.map(c => <button key={c} style={{ background: c }} className={one.color === c ? 'on' : ''} onClick={() => setColor(c)} aria-label={`Colour ${c}`}/>)}<input type="color" value={one.color} onChange={e => setColor(e.target.value)} aria-label="Pick a colour"/></div></>}
        {one.kind === 'group' && <p className="bs-tip">This group is {(one.children ?? []).filter(k => k.hole).length ? 'cut by its holes' : 'joined into one solid'}. Ungroup to change its parts.</p>}
      </div> : selected.length > 1 ? <div className="bs-card"><b>{selected.length} shapes selected</b><p className="bs-tip">Group them to join solids and cut holes, or Align to line them up.</p><button className="bs-btn" onClick={doGroup} data-testid="side-group"><Group size={15}/>Group</button></div>
        : <div className="bs-card"><b>Nothing selected</b><p className="bs-tip">Click a shape to change its size, turn it, or make it a hole. Keys: W move · E turn · R stretch · H hole · arrows nudge · Ctrl+arrows lift.</p></div>}

      <div className="bs-card bs-print" data-testid="print-panel">
        <button className="bs-print-h" onClick={() => setPrintOpen(o => !o)}><b>Print check</b>{report && report.volume > 0 && <span className={errors.length ? 'bad' : report.findings.some(f => f.level === 'warn') ? 'warn' : 'ok'}>{errors.length ? `${errors.length} to fix` : report.findings.some(f => f.level === 'warn') ? 'tips' : 'ready'}</span>}</button>
        {report && report.volume > 0 && <div className="bs-print-sum">{report.size.map(v => r1(v)).join(' × ')} mm · about {Math.max(1, Math.round(report.grams))} g of PLA · ~{report.minutes < 90 ? `${report.minutes} min` : `${r1(report.minutes / 60)} h`}</div>}
        {(printOpen || errors.length > 0) && <>
          <label className="bs-field"><span>Printer</span><select value={printer.id} onChange={e => p.setPrinter(e.target.value)}>{PRINTERS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="bs-field"><span>Who is it for?</span><select value={p.audience} onChange={e => p.setAudience(e.target.value as Audience)} data-testid="audience">{[['under3', 'A child under 3'], ['kids', 'Kids'], ['teens', 'Teens'], ['adults', 'Adults']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <ul className="bs-findings">{report?.findings.map(f => <li key={f.id} className={f.level}>{f.text}</li>)}</ul>
        </>}
        <div className="bs-export">
          <button className="bs-btn primary" onClick={() => exportFile('stl')} disabled={!scene.shapes.some(s => !s.hole)} data-testid="export-stl"><Download size={15}/>STL</button>
          <button className="bs-btn" onClick={() => exportFile('3mf')} disabled={!scene.shapes.some(s => !s.hole)} data-testid="export-3mf"><Download size={15}/>3MF</button>
          <button className="bs-btn make" onClick={sendToMake} disabled={!scene.shapes.some(s => !s.hole)} data-testid="send-to-make"><Send size={15}/>Send to Make</button>
        </div>
        {blocked && <p className="bs-gate" data-testid="export-gate">{blocked}</p>}
      </div>
    </aside>
  </div>;
}
