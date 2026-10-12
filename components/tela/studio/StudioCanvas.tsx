// StudioCanvas — the Studio vector editor's artboard: rendering, hit testing and every
// on-canvas tool (selection, direct selection, pen, pencil, shapes, type, width, shape
// builder, gradient & mesh annotators, eyedropper, artboard, hand / zoom, rotate / reflect /
// scale), with rulers, guides, grid, smart guides and a pasteboard around the artboard.
//
// Performance contract (2,000+ objects): objects render through memoised nodes keyed by
// object identity, so a commit re-renders only what changed. Gestures never touch the
// document while the pointer moves — moves / scales / rotates preview by setting a
// `transform` attribute on the selected DOM nodes; path edits preview through a per-frame
// (rAF-batched) override of the one object being edited — and commit ONE op on pointer-up.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TelaVectorObject } from '../../../types';
import type { CompoundPath, Matrix, LinearPaint, RadialPaint } from '../../../services/tela/geometry/model';
import type { Rect, Vec } from '../../../services/tela/geometry/vec';
import { ObjectEl } from '../TelaVector';
import { useStudio, type StudioTool } from './studioContext';
import { boundsOf, pathOf, isPathish, isEngineText, transformObject, translateObject, objectMatrix, unionBounds, withPath } from '../../../services/tela/studio/objectGeom';
import { selectionUnit, expandUnits, groupChain, groupsOf, duplicateObjects } from '../../../services/tela/studio/structure';
import { HANDLES, handlePoint, scaleMatrix, rotateMatrix, skewMatrix, matrixAttr, type Handle } from '../../../services/tela/studio/transform';
import { penStart, penDown, penDrag, penUp, penFinish, penPath, penPreview, penContinue, penUndoAnchor, type PenState } from '../../../services/tela/studio/pen';
import { moveAnchors, dragHandle, toggleAnchor, pullHandles, addAnchorAt, deleteAnchorAt, cutAt, endAt, segmentAt, bendSegment, uOnSubpath, refKey, type AnchorRef } from '../../../services/tela/studio/direct';
import { shapeBuilderStart, shapeBuilderPick, shapeBuilderCommit, type ShapeBuilderSession } from '../../../services/tela/studio/pathfinder';
import { editLive, profilePoints, setWidthPoint, setLiveSource, sourcePathOf, paintOf, setPaint, defaultGradient, meshFor, bakeLive, liveShapePath } from '../../../services/tela/studio/appearance';
import { makeTypeObject, newStory, migrateLegacyText, typeOnPath, threadHead, threadChain, editFrames, pointEditFrame } from '../../../services/tela/studio/typeTools';
import { studioId } from '../../../services/tela/studio/model';
import { pathToObject } from '../../../services/tela/geometry/tela';
import { toPathData } from '../../../services/tela/geometry/pathData';
import { subpathCurves } from '../../../services/tela/geometry/model';
import { pointsToPath } from '../../../services/tela/geometry/fit';
import { hitStroke, hitFill, smartGuides, anchorsInRect, distanceToPath, hitAnchor } from '../../../services/tela/geometry/hittest';
import { apply as applyMat, invert, multiply, translate, scale as scaleM, reflect } from '../../../services/tela/geometry/transform';
import TextSurface from '../../text/TextSurface';
import type { TextSystem } from '../../../services/text';
import type { TextStory } from '../../../services/text/model';
import { storyText } from '../../../services/text/model';

// ── Object layer (memoised) ─────────────────────────────────────────────────────────

const ObjectNode = memo(function ObjectNode({ o, writerTexts, dim, locked }: { o: TelaVectorObject; writerTexts?: Record<string, string>; dim: boolean; locked: boolean }) {
  return <g data-oid={o.id} style={{ opacity: dim ? .32 : undefined, pointerEvents: locked ? 'none' : undefined }}><ObjectEl o={o} writerTexts={writerTexts} interactive={false} /></g>;
});

const ObjectLayer = memo(function ObjectLayer({ objects, overrides, hidden, writerTexts, isoMembers }: { objects: TelaVectorObject[]; overrides: Record<string, TelaVectorObject> | null; hidden: Set<string>; writerTexts?: Record<string, string>; isoMembers: Set<string> | null }) {
  return <g data-layer="objects">{objects.map(o => (o.hidden || hidden.has(o.id)) ? null : <ObjectNode key={o.id} o={overrides?.[o.id] ?? o} writerTexts={writerTexts} dim={!!isoMembers && !isoMembers.has(o.id)} locked={!!o.locked || (!!isoMembers && !isoMembers.has(o.id))} />)}</g>;
});

// ── Gestures ────────────────────────────────────────────────────────────────────────

type Gesture =
  | { kind: 'pan'; x: number; y: number; sl: number; st: number }
  | { kind: 'move'; start: Vec; ids: string[]; box: Rect; others: Rect[]; dup: boolean; m: Matrix; moved: boolean }
  | { kind: 'scale'; handle: Handle; box: Rect; ids: string[]; m: Matrix }
  | { kind: 'skew'; handle: Handle; box: Rect; ids: string[]; m: Matrix }
  | { kind: 'rotate'; c: Vec; start: Vec; ids: string[]; m: Matrix }
  | { kind: 'marquee'; start: Vec; mode: 'select' | 'direct' | 'zoom'; add: boolean }
  | { kind: 'anchors'; id: string; path0: CompoundPath; refs: AnchorRef[]; start: Vec; moved: boolean }
  | { kind: 'handle'; id: string; path0: CompoundPath; sub: number; ai: number; which: 'in' | 'out'; alt: boolean }
  | { kind: 'segment'; id: string; path0: CompoundPath; sub: number; seg: number; t: number; start: Vec }
  | { kind: 'pull'; id: string; path0: CompoundPath; sub: number; ai: number; moved: boolean }
  | { kind: 'pen' }
  | { kind: 'pencil'; pts: Vec[] }
  | { kind: 'create'; tool: StudioTool; start: Vec }
  | { kind: 'width'; id: string; spine: CompoundPath; u: number; side: 'both' | 'left' | 'right'; base: TelaVectorObject }
  | { kind: 'shapeBuilder'; picked: number[] }
  | { kind: 'gradient'; id: string; part: 'p1' | 'p2' | 'stop' | 'new'; stop?: number; start: Vec; base: TelaVectorObject }
  | { kind: 'mesh'; id: string; node: number; base: TelaVectorObject }
  | { kind: 'radius'; id: string; base: TelaVectorObject }
  | { kind: 'guide'; axis: 'x' | 'y'; index: number; fromRuler: boolean }
  | { kind: 'artboard'; handle: Handle; w: number; h: number }
  | { kind: 'xform'; tool: 'rotate' | 'scale'; c: Vec; start: Vec; ids: string[]; m: Matrix };

const HANDLE_CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const TOOL_CURSOR: Partial<Record<StudioTool, string>> = {
  pen: 'crosshair', pencil: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', polygon: 'crosshair', star: 'crosshair', line: 'crosshair', spiral: 'crosshair',
  type: 'text', typePath: 'text', addAnchor: 'copy', deleteAnchor: 'not-allowed', convert: 'alias', scissors: 'crosshair', width: 'ew-resize',
  shapeBuilder: 'cell', gradient: 'crosshair', mesh: 'crosshair', eyedropper: 'copy', hand: 'grab', zoom: 'zoom-in', artboard: 'default', rotate: 'crosshair', reflect: 'crosshair', scale: 'crosshair',
};

const ACCENT = '#00DAF3', SEL = '#2E8BFF', MAG = '#D40055';

export interface StudioCanvasProps {
  onObjectContextMenu?: (e: React.MouseEvent, o: TelaVectorObject) => void;
  onCanvasContextMenu?: (e: React.MouseEvent, artboardPoint: Vec) => void;
  onResizeArtboard?: (w: number, h: number) => void;
  /** Width of the rulers (0 = hidden). */
  rulerSize?: number;
  viewportRef: React.RefObject<HTMLDivElement>;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({ onObjectContextMenu, onCanvasContextMenu, onResizeArtboard, viewportRef }) => {
  const api = useStudio();
  const { device, objects, zoom, tool, selection, readOnly, prefs } = api;
  const W = device.width, H = device.height;
  const PAD = Math.round(Math.max(360, Math.max(W, H) * .6));
  const groups = groupsOf(api.studio);
  const guides = api.studio.guides ?? { x: [], y: [] };

  const svgRef = useRef<SVGSVGElement>(null);
  const overlayMoveRef = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [overrides, setOverrides] = useState<Record<string, TelaVectorObject> | null>(null);
  const [cursor, setCursor] = useState<Vec | null>(null);
  const [mods, setMods] = useState({ shift: false, alt: false, ctrl: false, space: false });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [smart, setSmart] = useState<Array<{ axis: 'x' | 'y'; at: number; from: number; to: number }>>([]);
  const [pen, setPen] = useState<PenState>(penStart());
  const [pencil, setPencil] = useState<Vec[] | null>(null);
  const [draft, setDraft] = useState<TelaVectorObject | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [sbHover, setSbHover] = useState<number>(-1);
  const [sbPicked, setSbPicked] = useState<number[]>([]);
  const [artDraft, setArtDraft] = useState<{ w: number; h: number } | null>(null);
  const [guideDraft, setGuideDraft] = useState<{ axis: 'x' | 'y'; at: number } | null>(null);
  const [xformOrigin, setXformOrigin] = useState<Vec | null>(null);
  const [textSys, setTextSys] = useState<TextSystem | null>(null);
  const frame = useRef(0);

  const byId = useMemo(() => new Map(objects.map(o => [o.id, o])), [objects]);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const selObjs = useMemo(() => objects.filter(o => selSet.has(o.id)), [objects, selSet]);
  const selBox = useMemo(() => unionBounds(selObjs.map(boundsOf)), [selObjs]);
  const isoMembers = useMemo(() => api.isolation ? new Set(objects.filter(o => o.groupId && groupChain(o, groups).includes(api.isolation!)).map(o => o.id)) : null, [api.isolation, objects, groups]);

  // ── Coordinates ────────────────────────────────────────────────────────────────────
  const toArt = useCallback((e: { clientX: number; clientY: number }): Vec => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom - PAD, y: (e.clientY - r.top) / zoom - PAD };
  }, [zoom, PAD]);
  const tol = 6 / zoom;

  // ── Snapping ───────────────────────────────────────────────────────────────────────
  const snapPt = useCallback((p: Vec, exclude?: Set<string>): Vec => {
    let q = { ...p };
    if (prefs.snapPoint) {
      let best = 8 / zoom, hit: Vec | null = null;
      for (const o of objects) {
        if (exclude?.has(o.id) || o.hidden) continue;
        const b = boundsOf(o); if (p.x < b.x - 12 || p.x > b.x + b.w + 12 || p.y < b.y - 12 || p.y > b.y + b.h + 12) continue;
        const path = isPathish(o) ? pathOf(o) : null;
        const pts = path ? path.subpaths.flatMap(s => s.anchors) : [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }];
        for (const a of pts) { const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < best) { best = d; hit = a; } }
      }
      if (hit) return { x: hit.x, y: hit.y };
    }
    const gx = [...guides.x, 0, W, W / 2], gy = [...guides.y, 0, H, H / 2];
    for (const x of gx) if (Math.abs(x - q.x) < 6 / zoom) { q.x = x; break; }
    for (const y of gy) if (Math.abs(y - q.y) < 6 / zoom) { q.y = y; break; }
    if (prefs.snapGrid && prefs.gridSize > 0) { const g = prefs.gridSize; if (q.x === p.x) q.x = Math.round(q.x / g) * g; if (q.y === p.y) q.y = Math.round(q.y / g) * g; }
    return q;
  }, [prefs.snapPoint, prefs.snapGrid, prefs.gridSize, objects, zoom, guides.x, guides.y, W, H]);

  // ── Hit testing ────────────────────────────────────────────────────────────────────
  /** Topmost object at a point: the DOM's own fill/stroke hit, else a tolerant stroke hit for thin lines. */
  const hitObject = useCallback((e: { target: EventTarget | null }, p: Vec): TelaVectorObject | null => {
    const el = (e.target as Element | null)?.closest?.('[data-oid]');
    const id = el?.getAttribute('data-oid');
    if (id) { const o = byId.get(id); if (o && !o.locked && (!isoMembers || isoMembers.has(o.id))) return o; }
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]; if (o.hidden || o.locked || (isoMembers && !isoMembers.has(o.id))) continue;
      const b = boundsOf(o); const pad = Math.max(tol, (o.strokeWidth || 0) / 2 + tol);
      if (p.x < b.x - pad || p.x > b.x + b.w + pad || p.y < b.y - pad || p.y > b.y + b.h + pad) continue;
      const path = isPathish(o) ? pathOf(o) : null;
      if (!path) { if (o.kind === 'TEXT' || o.kind === 'IMAGE') return o; continue; }
      if ((o.stroke !== 'none' || o.fill === 'none') && hitStroke(path, p, o.strokeWidth || 1, tol)) return o;
      if (o.fill !== 'none' && hitFill(path, p)) return o;
    }
    return null;
  }, [byId, objects, tol, isoMembers]);

  const unitOf = useCallback((id: string) => selectionUnit(objects, id, groups, api.isolation), [objects, groups, api.isolation]);

  // ── Preview helpers ────────────────────────────────────────────────────────────────
  const nodesOf = (ids: string[]) => { const svg = svgRef.current; if (!svg) return []; const set = new Set(ids); return [...svg.querySelectorAll<SVGGElement>('[data-oid]')].filter(n => set.has(n.getAttribute('data-oid')!)); };
  const previewMatrix = (ids: string[], m: Matrix | null) => {
    const attr = m ? matrixAttr(m) : null;
    for (const n of nodesOf(ids)) { if (attr) n.setAttribute('transform', attr); else n.removeAttribute('transform'); }
    const ov = overlayMoveRef.current; if (ov) { if (attr) ov.setAttribute('transform', attr); else ov.removeAttribute('transform'); }
  };
  const raf = (fn: () => void) => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(fn); };

  // ── Shape builder session ──────────────────────────────────────────────────────────
  const sbSession = useMemo<ShapeBuilderSession | null>(() => tool === 'shapeBuilder' && selection.length ? shapeBuilderStart(objects, selection) : null, [tool, selection, objects]);
  useEffect(() => { setSbPicked([]); setSbHover(-1); }, [sbSession]);

  // ── Pen bookkeeping ────────────────────────────────────────────────────────────────
  const finishPen = useCallback((st: PenState) => {
    const path = penPath(st); setPen(penStart());
    if (!path || !path.subpaths.some(s => s.anchors.length >= 2)) return;
    const objs = api.latest().objects;
    if (st.target) {
      const o = objs.find(x => x.id === st.target!.id); if (!o) return;
      const next = o.studio?.live ? setLiveSource(o, path) : withPath(o, path);
      api.commit(objs.map(x => x.id === o.id ? next : x), { label: 'Pen', select: [o.id] });
      return;
    }
    const obj = newPath(path, api.paint, 'Path');
    api.commit([...objs, ...placeInIsolation([obj])], { label: 'Pen', select: [obj.id] });
  }, [api]);
  const placeInIsolation = (list: TelaVectorObject[]) => api.isolation ? list.map(o => ({ ...o, groupId: api.isolation! })) : list;

  // Switching tools finishes an open pen path, ends text editing.
  useEffect(() => { if (tool !== 'pen' && pen.anchors.length) finishPen(pen); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tool]);
  useEffect(() => { setXformOrigin(null); }, [tool, selection]);

  // ── Keyboard owned by the canvas (pen, space-hand, modifier display) ───────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      setMods(m => ({ ...m, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey }));
      const t = e.target as HTMLElement | null; if (t?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (e.code === 'Space' && !mods.space && !api.editingText) { setMods(m => ({ ...m, space: true })); e.preventDefault(); }
      if (tool === 'pen' && pen.anchors.length) {
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finishPen(penFinish(pen)); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopImmediatePropagation(); setPen(penUndoAnchor(pen)); }
      }
    };
    const up = (e: KeyboardEvent) => { setMods(m => ({ ...m, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, space: e.code === 'Space' ? false : m.space })); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, [tool, pen, finishPen, mods.space, api.editingText]);

  // Text engine is loaded lazily the first time type is touched.
  useEffect(() => {
    if (textSys) return;
    const need = tool === 'type' || tool === 'typePath' || api.editingText || objects.some(isEngineText);
    if (need) void api.text().then(setTextSys).catch(err => api.status(`Type engine failed to load: ${err?.message ?? err}`));
  }, [tool, api.editingText, objects, textSys, api]);

  // ── Pointer down ───────────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const svg = svgRef.current!; const p0 = toArt(e);
    const vp = viewportRef.current;
    if (e.button === 1 || mods.space || tool === 'hand') {
      if (vp) { gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop }; svg.setPointerCapture(e.pointerId); }
      return;
    }
    if (readOnly) return;
    if (api.editingText) { api.setEditingText(null); }
    const target = e.target as Element;
    const handle = target.closest?.('[data-h]')?.getAttribute('data-h');
    svg.setPointerCapture(e.pointerId);

    // Guides dragged on the canvas (select tools only).
    const guideEl = target.closest?.('[data-guide]');
    if (guideEl && (tool === 'select' || tool === 'direct')) {
      const [axis, idx] = guideEl.getAttribute('data-guide')!.split(':');
      gesture.current = { kind: 'guide', axis: axis as 'x' | 'y', index: +idx, fromRuler: false };
      return;
    }

    switch (tool) {
      case 'zoom': gesture.current = { kind: 'marquee', start: p0, mode: 'zoom', add: false }; return;
      case 'artboard': {
        if (handle?.startsWith('ab:')) { gesture.current = { kind: 'artboard', handle: handle.slice(3) as Handle, w: W, h: H }; }
        return;
      }
      case 'select': return downSelect(e, p0, handle);
      case 'direct': return downDirect(e, p0);
      case 'pen': return downPen(e, p0);
      case 'pencil': { const p = snapPt(p0); gesture.current = { kind: 'pencil', pts: [p] }; setPencil([p]); return; }
      case 'rect': case 'ellipse': case 'polygon': case 'star': case 'line': case 'spiral': {
        const p = snapPt(p0); gesture.current = { kind: 'create', tool, start: p }; setDraft(null); return;
      }
      case 'type': return downType(e, p0);
      case 'typePath': return downTypePath(e, p0);
      case 'addAnchor': case 'deleteAnchor': case 'scissors': case 'convert': return downPathTool(e, p0);
      case 'width': return downWidth(e, p0);
      case 'shapeBuilder': {
        if (!sbSession) { api.status('Select overlapping shapes, then drag across regions with the Shape Builder (Alt deletes).'); return; }
        const r = shapeBuilderPick(sbSession, p0); gesture.current = { kind: 'shapeBuilder', picked: r >= 0 ? [r] : [] }; setSbPicked(r >= 0 ? [r] : []); return;
      }
      case 'gradient': return downGradient(e, p0, handle);
      case 'mesh': return downMesh(e, p0, handle);
      case 'eyedropper': return downEyedropper(e, p0);
      case 'rotate': case 'scale': case 'reflect': return downXform(e, p0);
    }
  };

  function downSelect(e: React.PointerEvent, p0: Vec, handle: string | null | undefined) {
    if (handle && selBox && selection.length) {
      const ids = selection.filter(id => !byId.get(id)?.locked);
      if (handle === 'rot' || handle.startsWith('rot:')) { const c = { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 }; gesture.current = { kind: 'rotate', c, start: p0, ids, m: [1, 0, 0, 1, 0, 0] }; return; }
      if (handle === 'radius') { const o = byId.get(selection[0])!; gesture.current = { kind: 'radius', id: o.id, base: o }; return; }
      const h = handle as Handle;
      if (HANDLES.includes(h)) {
        if ((e.ctrlKey || e.metaKey) && (h === 'n' || h === 's' || h === 'e' || h === 'w')) gesture.current = { kind: 'skew', handle: h, box: selBox, ids, m: [1, 0, 0, 1, 0, 0] };
        else gesture.current = { kind: 'scale', handle: h, box: selBox, ids, m: [1, 0, 0, 1, 0, 0] };
        return;
      }
    }
    const hit = hitObject(e, p0);
    if (hit) {
      const unit = unitOf(hit.id);
      let next = selection;
      if (e.shiftKey) next = unit.every(id => selSet.has(id)) ? selection.filter(id => !unit.includes(id)) : [...selection, ...unit];
      else if (!unit.every(id => selSet.has(id))) next = unit;
      api.setSelection(next);
      if (!next.includes(hit.id)) return;
      const moving = next.filter(id => !byId.get(id)?.locked);
      const box = unionBounds(moving.map(id => boundsOf(byId.get(id)!))) ?? { x: p0.x, y: p0.y, w: 0, h: 0 };
      const movingSet = new Set(moving);
      const others = prefs.smartGuides ? objects.filter(o => !movingSet.has(o.id) && !o.hidden).map(boundsOf).concat([{ x: 0, y: 0, w: W, h: H }], guides.x.map(x => ({ x, y: 0, w: 0, h: H })), guides.y.map(y => ({ x: 0, y, w: W, h: 0 }))) : [];
      gesture.current = { kind: 'move', start: p0, ids: moving, box, others, dup: e.altKey, m: [1, 0, 0, 1, 0, 0], moved: false };
      return;
    }
    gesture.current = { kind: 'marquee', start: p0, mode: 'select', add: e.shiftKey };
    if (!e.shiftKey) api.setSelection([]);
  }

  function downDirect(e: React.PointerEvent, p0: Vec) {
    // Anchors / handles of objects that are already selected take priority.
    const candidates = selObjs.filter(o => isPathish(o) && !o.locked);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const o = candidates[i]; const path = sourcePathOf(o); if (!path) continue;
      const h = hitAnchor(path, p0, tol, true);
      if (!h) continue;
      if (h.part === 'anchor') {
        const ref: AnchorRef = [h.sub, h.anchor];
        const cur = api.anchorSel?.id === o.id ? api.anchorSel.refs : [];
        const has = cur.some(r => refKey(r) === refKey(ref));
        const refs = e.shiftKey ? (has ? cur.filter(r => refKey(r) !== refKey(ref)) : [...cur, ref]) : has ? cur : [ref];
        api.setAnchorSel({ id: o.id, refs });
        gesture.current = { kind: 'anchors', id: o.id, path0: path, refs, start: p0, moved: false };
        return;
      }
      // handles only count for selected anchors (+ their neighbours), as drawn
      gesture.current = { kind: 'handle', id: o.id, path0: path, sub: h.sub, ai: h.anchor, which: h.part, alt: e.altKey };
      return;
    }
    const hit = hitObject(e, p0);
    if (hit && isPathish(hit)) {
      const path = sourcePathOf(hit)!;
      const seg = segmentAt(path, p0, tol + (hit.strokeWidth || 0) / 2);
      if (!selSet.has(hit.id)) api.setSelection(e.shiftKey ? [...selection, hit.id] : [hit.id]);
      if (seg) {
        api.setAnchorSel({ id: hit.id, refs: seg.refs });
        const curve = subpathCurves(path.subpaths[seg.sub])[seg.seg];
        if (curve && !curve.line && !e.shiftKey) { gesture.current = { kind: 'segment', id: hit.id, path0: path, sub: seg.sub, seg: seg.seg, t: seg.t, start: p0 }; return; }
        gesture.current = { kind: 'anchors', id: hit.id, path0: path, refs: seg.refs, start: p0, moved: false }; return;
      }
      // Clicking inside a fill selects the whole path's anchors and drags them.
      const all: AnchorRef[] = path.subpaths.flatMap((s, si) => s.anchors.map((_, ai) => [si, ai] as AnchorRef));
      api.setAnchorSel({ id: hit.id, refs: all });
      gesture.current = { kind: 'anchors', id: hit.id, path0: path, refs: all, start: p0, moved: false };
      return;
    }
    if (hit) { api.setSelection([hit.id]); api.setAnchorSel(null); const box = boundsOf(hit); gesture.current = { kind: 'move', start: p0, ids: [hit.id], box, others: [], dup: e.altKey, m: [1, 0, 0, 1, 0, 0], moved: false }; return; }
    api.setAnchorSel(null);
    if (!e.shiftKey) api.setSelection([]);
    gesture.current = { kind: 'marquee', start: p0, mode: 'direct', add: e.shiftKey };
  }

  function downPen(e: React.PointerEvent, p0: Vec) {
    let st = pen;
    const p = snapPt(p0);
    if (!st.anchors.length) {
      // Continue an open path when starting on one of its ends.
      for (const o of [...selObjs].reverse()) {
        if (!isPathish(o)) continue; const path = sourcePathOf(o); if (!path) continue;
        const end = endAt(path, p0, tol * 1.4);
        if (end) { st = penContinue(path.subpaths[end.sub], end.atStart, { id: o.id, sub: end.sub, others: path.subpaths.filter((_, i) => i !== end.sub) }); break; }
      }
    }
    const next = penDown(st, p, { shift: e.shiftKey, alt: e.altKey }, tol * 1.4);
    gesture.current = { kind: 'pen' }; setPen(next);
  }

  function downType(e: React.PointerEvent, p0: Vec) {
    const hit = hitObject(e, p0);
    if (hit && hit.kind === 'TEXT') {
      if (hit.boundWriterDeviceId) { api.status('This text is bound to a Writer — edit it there.'); return; }
      if (!hit.studio?.type) { const m = migrateLegacyText(hit); if (m) api.commit(api.latest().objects.map(o => o.id === m.id ? m : o), { label: 'Edit type', select: [m.id] }); api.rebakeType(hit.id); }
      api.setSelection([threadHead(api.latest().objects, hit.id)]); api.setEditingText(threadHead(api.latest().objects, hit.id));
      return;
    }
    gesture.current = { kind: 'create', tool: 'type', start: snapPt(p0) };
  }

  function downTypePath(e: React.PointerEvent, p0: Vec) {
    const hit = hitObject(e, p0);
    if (!hit || !isPathish(hit)) { api.status('Click on a path to set type along it.'); return; }
    const path = pathOf(hit)!; const n = distanceToPath(path, p0);
    const along = n.sub >= 0 ? uOnSubpath(path, n.sub, n.seg, n.t) : { u: 0, total: 0 };
    const story = newStory('Type on a path', { fontFamily: 'Inter', fontSize: 24, color: api.paint.fill !== 'none' ? api.paint.fill : '#1B1523', align: 'left' });
    const t = typeOnPath(hit, path, story, along.u * along.total);
    const objs = api.latest().objects;
    api.commit(objs.map(o => o.id === hit.id ? t : o), { label: 'Type on a path', select: [t.id] });
    api.rebakeType(t.id); api.setEditingText(t.id);
  }

  function downPathTool(e: React.PointerEvent, p0: Vec) {
    const cands = [...(selObjs.length ? selObjs : objects)].reverse().filter(o => isPathish(o) && !o.locked && !o.hidden);
    for (const o of cands.slice(0, 400)) {
      const path = sourcePathOf(o); if (!path) continue;
      const b = boundsOf(o); if (p0.x < b.x - 20 || p0.x > b.x + b.w + 20 || p0.y < b.y - 20 || p0.y > b.y + b.h + 20) continue;
      const commitPath = (q: CompoundPath, label: string) => {
        const objs = api.latest().objects; const cur = objs.find(x => x.id === o.id)!;
        const next = cur.studio?.live ? setLiveSource(cur, q) : withPath(cur, q);
        api.commit(objs.map(x => x.id === o.id ? next : x), { label, select: [o.id] });
      };
      if (tool === 'addAnchor') { const q = addAnchorAt(path, p0, tol + o.strokeWidth / 2); if (q) { commitPath(q, 'Add anchor'); return; } }
      if (tool === 'deleteAnchor') { const q = deleteAnchorAt(path, p0, tol); if (q) { commitPath(q, 'Delete anchor'); return; } }
      if (tool === 'convert') {
        const h = hitAnchor(path, p0, tol, true);
        if (h && h.part === 'anchor') { gesture.current = { kind: 'pull', id: o.id, path0: path, sub: h.sub, ai: h.anchor, moved: false }; api.setSelection([o.id]); return; }
        if (h) { gesture.current = { kind: 'handle', id: o.id, path0: path, sub: h.sub, ai: h.anchor, which: h.part as 'in' | 'out', alt: true }; return; }
      }
      if (tool === 'scissors') {
        const parts = cutAt(path, p0, tol + o.strokeWidth / 2);
        if (parts) {
          const objs = api.latest().objects; const cur = objs.find(x => x.id === o.id)!;
          const pieces = parts.map((q, i) => i === 0 ? withPath(cur, q) : { ...withPath(cur, q), id: studioId('obj') });
          const at = objs.indexOf(cur);
          api.commit([...objs.slice(0, at), ...pieces, ...objs.slice(at + 1)], { label: 'Scissors', select: pieces.map(x => x.id) });
          return;
        }
      }
    }
  }

  function downWidth(e: React.PointerEvent, p0: Vec) {
    const cands = [...objects].reverse().filter(o => isPathish(o) && !o.locked && !o.hidden && (o.studio?.live?.width || o.stroke !== 'none'));
    for (const o of cands) {
      const spine = sourcePathOf(o); if (!spine) continue;
      const n = distanceToPath(spine, p0); const w = o.studio?.live?.width?.width ?? o.strokeWidth ?? 1;
      if (n.sub < 0 || n.dist > Math.max(w / 2 + tol, tol * 2)) continue;
      const { u } = uOnSubpath(spine, n.sub, n.seg, n.t);
      api.setSelection([o.id]);
      gesture.current = { kind: 'width', id: o.id, spine, u, side: e.altKey ? 'left' : 'both', base: o };
      return;
    }
    api.status('Width tool: drag on a stroked path to widen or narrow it at that point (Alt: one side).');
  }

  function downGradient(e: React.PointerEvent, p0: Vec, handle: string | null | undefined) {
    const o = selObjs[0];
    if (!o) { const hit = hitObject(e, p0); if (hit) api.setSelection([hit.id]); return; }
    if (handle?.startsWith('g:')) {
      const [, part, idx] = handle.split(':');
      gesture.current = { kind: 'gradient', id: o.id, part: part as 'p1' | 'p2' | 'stop', stop: idx !== undefined ? +idx : undefined, start: p0, base: o };
      if (part === 'stop') api.setPaintTarget({ kind: 'gradient', stop: +idx });
      return;
    }
    gesture.current = { kind: 'gradient', id: o.id, part: 'new', start: p0, base: o };
  }

  function downMesh(e: React.PointerEvent, p0: Vec, handle: string | null | undefined) {
    const o = selObjs[0];
    if (handle?.startsWith('m:') && o) { const node = +handle.slice(2); api.setPaintTarget({ kind: 'mesh', node }); gesture.current = { kind: 'mesh', id: o.id, node, base: o }; return; }
    const hit = hitObject(e, p0);
    if (!hit || !isPathish(hit)) { api.status('Mesh tool: click inside a shape to add a gradient mesh.'); return; }
    api.setSelection([hit.id]);
    const f = paintOf(hit, 'fill');
    if (typeof f === 'string' || f.type !== 'mesh') {
      const n = setPaint(hit, 'fill', meshFor(hit, 3, 3));
      api.commit(api.latest().objects.map(x => x.id === hit.id ? n : x), { label: 'Gradient mesh', select: [n.id] });
      api.setPaintTarget({ kind: 'mesh' });
    }
  }

  function downEyedropper(e: React.PointerEvent, p0: Vec) {
    const hit = hitObject(e, p0); if (!hit) return;
    const targets = selection.filter(id => id !== hit.id);
    if (!targets.length || e.altKey) { api.setPaint({ fill: typeof paintOf(hit, 'fill') === 'string' ? paintOf(hit, 'fill') as string : hit.fill, stroke: hit.stroke, strokeWidth: hit.strokeWidth }); api.status('Picked up fill and stroke.'); return; }
    const set = new Set(targets);
    const next = api.latest().objects.map(o => {
      if (!set.has(o.id) || o.kind === 'IMAGE' || o.kind === 'LOTTIE') return o;
      let n = setPaint(o, 'fill', paintOf(hit, 'fill')); n = setPaint(n, 'stroke', paintOf(hit, 'stroke'));
      n = { ...n, strokeWidth: hit.strokeWidth, opacity: hit.opacity, blendMode: hit.blendMode, strokeDash: hit.strokeDash };
      if (hit.geom && n.kind === 'PATH' && n.svgPathData) n.geom = { ...(n.geom ?? { v: 1 }), strokeStyle: hit.geom.strokeStyle, material: hit.geom.material };
      return n;
    });
    api.commit(next, { label: 'Eyedropper' });
  }

  function downXform(e: React.PointerEvent, p0: Vec) {
    const ids = selection.filter(id => !byId.get(id)?.locked); if (!ids.length || !selBox) return;
    if (tool === 'reflect') {
      // Click: reflect across a vertical axis through the origin (Shift: horizontal). Alt-click sets the origin.
      if (e.altKey) { setXformOrigin(p0); return; }
      const m = reflect(e.shiftKey ? 0 : 90, xformOrigin ?? { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 });
      const set = new Set(ids);
      api.commit(api.latest().objects.map(o => set.has(o.id) ? transformObject(o, m) : o), { label: 'Reflect' });
      return;
    }
    if (e.altKey) { setXformOrigin(p0); return; }
    const c = xformOrigin ?? { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 };
    gesture.current = { kind: 'xform', tool: tool as 'rotate' | 'scale', c, start: p0, ids, m: [1, 0, 0, 1, 0, 0] };
  }

  // ── Pointer move ───────────────────────────────────────────────────────────────────
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; const p = toArt(e);
    if (!g) {
      // hover state (cheap): cursor for pen rubber band, object highlight, shape-builder region
      raf(() => {
        if (tool === 'pen' || tool === 'width' || tool === 'type' || tool === 'typePath') setCursor(p);
        if (tool === 'shapeBuilder' && sbSession) setSbHover(shapeBuilderPick(sbSession, p));
        if (tool === 'select' || tool === 'direct' || tool === 'scissors' || tool === 'addAnchor' || tool === 'deleteAnchor' || tool === 'convert' || tool === 'typePath' || tool === 'eyedropper') {
          const h = hitObject(e, p); setHover(h?.id ?? null);
        }
      });
      return;
    }
    switch (g.kind) {
      case 'pan': { const vp = viewportRef.current; if (vp) { vp.scrollLeft = g.sl - (e.clientX - g.x); vp.scrollTop = g.st - (e.clientY - g.y); } return; }
      case 'move': {
        let dx = p.x - g.start.x, dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * zoom < 3) return;
        g.moved = true;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        let guidesOut: typeof smart = [];
        if (prefs.smartGuides && !e.ctrlKey) {
          const moved = { x: g.box.x + dx, y: g.box.y + dy, w: g.box.w, h: g.box.h };
          const s = smartGuides(moved, g.others, 5 / zoom); dx += s.dx; dy += s.dy; guidesOut = s.guides;
        } else if (prefs.snapGrid && prefs.gridSize > 0) {
          const gsz = prefs.gridSize; dx = Math.round((g.box.x + dx) / gsz) * gsz - g.box.x; dy = Math.round((g.box.y + dy) / gsz) * gsz - g.box.y;
        }
        g.m = translate(dx, dy); g.dup = e.altKey;
        raf(() => { previewMatrix(g.ids, g.m); setSmart(guidesOut); });
        return;
      }
      case 'scale': { g.m = scaleMatrix(g.box, g.handle, snapPt(p, new Set(g.ids)), { shift: e.shiftKey, alt: e.altKey }); raf(() => previewMatrix(g.ids, g.m)); return; }
      case 'skew': { g.m = skewMatrix(g.box, g.handle, p, e.altKey); raf(() => previewMatrix(g.ids, g.m)); return; }
      case 'rotate': { g.m = rotateMatrix(g.c, g.start, p, e.shiftKey).m; raf(() => previewMatrix(g.ids, g.m)); return; }
      case 'xform': {
        if (g.tool === 'rotate') g.m = rotateMatrix(g.c, g.start, p, e.shiftKey).m;
        else { const d0 = { x: g.start.x - g.c.x, y: g.start.y - g.c.y }, d1 = { x: p.x - g.c.x, y: p.y - g.c.y }; let sx = Math.abs(d0.x) > 1e-6 ? d1.x / d0.x : 1, sy = Math.abs(d0.y) > 1e-6 ? d1.y / d0.y : 1; if (e.shiftKey) { const k = Math.max(Math.abs(sx), Math.abs(sy)); sx = k; sy = k; } g.m = scaleM(sx || 1e-3, sy || 1e-3, g.c); }
        raf(() => previewMatrix(g.ids, g.m)); return;
      }
      case 'marquee': { const r = rectOf(g.start, p); raf(() => setMarquee(r)); return; }
      case 'anchors': {
        let dx = p.x - g.start.x, dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * zoom < 2) return; g.moved = true;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (g.refs.length === 1 && prefs.snapPoint) { const a = g.path0.subpaths[g.refs[0][0]].anchors[g.refs[0][1]]; const s = snapPt({ x: a.x + dx, y: a.y + dy }, new Set([g.id])); dx = s.x - a.x; dy = s.y - a.y; }
        const q = moveAnchors(g.path0, g.refs, dx, dy); previewPath(g.id, q); return;
      }
      case 'handle': { const a = g.path0.subpaths[g.sub].anchors[g.ai]; let to = p; if (e.shiftKey) to = constrain45(a, p); const q = dragHandle(g.path0, g.sub, g.ai, g.which, to, g.alt || e.altKey); previewPath(g.id, q); return; }
      case 'segment': { const q = bendSegment(g.path0, g.sub, g.seg, g.t, { x: p.x - g.start.x, y: p.y - g.start.y }); previewPath(g.id, q); return; }
      case 'pull': { g.moved = true; const q = pullHandles(g.path0, g.sub, g.ai, e.shiftKey ? constrain45(g.path0.subpaths[g.sub].anchors[g.ai], p) : p); previewPath(g.id, q); return; }
      case 'pen': { setPen(st => penDrag(st, p, { shift: e.shiftKey, alt: e.altKey })); return; }
      case 'pencil': { const last = g.pts[g.pts.length - 1]; if (Math.hypot(p.x - last.x, p.y - last.y) * zoom < 1.5) return; g.pts.push(p); raf(() => setPencil([...g.pts])); return; }
      case 'create': { const q = snapPt(p); raf(() => setDraft(draftShape(g.tool, g.start, q, e.shiftKey, e.altKey))); return; }
      case 'width': {
        const n = distanceToPath(g.spine, p); const half = Math.max(.25, n.dist);
        const cur = g.base.studio?.live?.width;
        const w = cur ?? { width: Math.max(1, g.base.strokeWidth || 2), profile: 'uniform' };
        const pts = profilePoints(w);
        const at = pts.find(x => Math.abs(x.u - g.u) <= .04);
        const left = g.side === 'right' ? (at?.left ?? w.width / 2) : half, right = g.side === 'left' ? (at?.right ?? at?.left ?? w.width / 2) : half;
        const nextPts = setWidthPoint(pts, g.u, left, right);
        const width = Math.max(...nextPts.map(x => Math.max(x.left, x.right ?? x.left))) * 2;
        raf(() => {
          const o = editLive(g.base, l => ({ ...l, width: { width, profile: nextPts, cap: w.cap, join: w.join } }), api.studio.brushes);
          setOverrides({ [g.id]: o });
        });
        return;
      }
      case 'shapeBuilder': { if (!sbSession) return; const r = shapeBuilderPick(sbSession, p); if (r >= 0 && !g.picked.includes(r)) { g.picked.push(r); setSbPicked([...g.picked]); } setSbHover(r); return; }
      case 'gradient': { previewGradient(g, p, e.shiftKey); return; }
      case 'mesh': {
        const f = paintOf(g.base, 'fill'); if (typeof f === 'string' || f.type !== 'mesh') return;
        const local = applyMat(invert(objectMatrix(g.base)), p);
        const nodes = f.nodes.map((n, i) => i === g.node ? { ...n, x: local.x, y: local.y } : n);
        raf(() => setOverrides({ [g.id]: setPaint(g.base, 'fill', { ...f, nodes }) }));
        return;
      }
      case 'radius': {
        const o = g.base; const r = Math.max(0, Math.min(Math.min(o.w, o.h) / 2, Math.min(p.x - o.x, p.y - o.y)));
        raf(() => setOverrides({ [g.id]: { ...o, rx: Math.round(r * 10) / 10 } })); return;
      }
      case 'guide': { raf(() => setGuideDraft({ axis: g.axis, at: g.axis === 'x' ? p.x : p.y })); return; }
      case 'artboard': {
        const w = g.handle.includes('e') ? Math.max(16, Math.round(p.x)) : g.w, h = g.handle.includes('s') ? Math.max(16, Math.round(p.y)) : g.h;
        raf(() => setArtDraft({ w, h })); return;
      }
    }
  };

  const previewPath = (id: string, q: CompoundPath) => {
    const o = byId.get(id); if (!o) return;
    raf(() => setOverrides({ [id]: o.studio?.live ? setLiveSource(o, q, api.studio.brushes) : withPath(o, q) }));
    pendingPath.current = { id, q };
  };
  const pendingPath = useRef<{ id: string; q: CompoundPath } | null>(null);

  function previewGradient(g: Extract<Gesture, { kind: 'gradient' }>, p: Vec, shift: boolean) {
    const o = g.base;
    let f = paintOf(o, 'fill');
    if (typeof f === 'string' || (f.type !== 'linear' && f.type !== 'radial')) f = defaultGradient(o, 'linear');
    let next = f as LinearPaint | RadialPaint;
    if (g.part === 'new') {
      // Drag defines a fresh gradient vector in the object's origin space (transform reset).
      const inv = invert(objectMatrix(o)); const s0 = applyMat(inv, g.start); const L = applyMat(inv, shift ? constrain45(g.start, p) : p);
      next = next.type === 'linear' ? { ...next, x1: s0.x, y1: s0.y, x2: L.x, y2: L.y, transform: undefined } : { ...next, cx: s0.x, cy: s0.y, r: Math.max(1, Math.hypot(L.x - s0.x, L.y - s0.y)), fx: undefined, fy: undefined, transform: undefined };
    } else {
      const inv = invert(gradTf(next, objectMatrix(o)));
      const [a0] = gradEnds(next); const anchorArt = applyMat(gradTf(next, objectMatrix(o)), a0);
      const L = applyMat(inv, shift && g.part === 'p2' ? constrain45(anchorArt, p) : p);
      if (g.part === 'p1') next = next.type === 'linear' ? { ...next, x1: L.x, y1: L.y } : { ...next, cx: L.x, cy: L.y };
      else if (g.part === 'p2') next = next.type === 'linear' ? { ...next, x2: L.x, y2: L.y } : { ...next, r: Math.max(1, Math.hypot(L.x - next.cx, L.y - next.cy)) };
      else if (g.part === 'stop' && g.stop !== undefined) {
        const [a, b] = gradEnds(next); const t = projT(a, b, L);
        next = { ...next, stops: next.stops.map((st, i) => i === g.stop ? { ...st, offset: Math.max(0, Math.min(1, t)) } : st) };
      }
    }
    const n = setPaint(o, 'fill', next);
    raf(() => setOverrides({ [g.id]: n }));
  }

  // ── Pointer up ─────────────────────────────────────────────────────────────────────
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; gesture.current = null; const p = toArt(e);
    cancelAnimationFrame(frame.current);
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!g) return;
    const objs = api.latest().objects;
    switch (g.kind) {
      case 'move': {
        previewMatrix(g.ids, null); setSmart([]);
        if (!g.moved) {
          // a click (no drag) on an already-selected unit: narrow to it
          return;
        }
        const set = new Set(g.ids);
        if (g.dup) {
          const src = objs.filter(o => set.has(o.id));
          const d = duplicateObjects(src, groups);
          const moved = d.objects.map(o => transformObject(o, g.m));
          const top = Math.max(...src.map(o => objs.indexOf(o)));
          const next = [...objs.slice(0, top + 1), ...moved, ...objs.slice(top + 1)];
          api.commit(next, { label: 'Duplicate', select: moved.map(o => o.id), studio: Object.keys(d.groups).length ? { ...api.studio, groups: { ...groups, ...d.groups } } : undefined });
          lastTransform.current = g.m;
        } else {
          api.commit(objs.map(o => set.has(o.id) ? transformObject(o, g.m) : o), { label: 'Move' });
          lastTransform.current = g.m;
        }
        return;
      }
      case 'scale': case 'skew': case 'rotate': case 'xform': {
        previewMatrix(g.ids, null);
        if (isIdentityish(g.m)) return;
        const set = new Set(g.ids);
        const next = objs.map(o => set.has(o.id) ? transformObject(o, g.m) : o);
        api.commit(next, { label: g.kind === 'rotate' || (g.kind === 'xform' && g.tool === 'rotate') ? 'Rotate' : g.kind === 'skew' ? 'Shear' : 'Scale' });
        lastTransform.current = g.m;
        for (const o of next) if (set.has(o.id) && isEngineText(o) && o.studio?.type?.mode !== 'path') api.rebakeType(threadHead(next, o.id));
        return;
      }
      case 'marquee': {
        setMarquee(null);
        const r = rectOf(g.start, p);
        if (g.mode === 'zoom') {
          const vp = viewportRef.current; if (!vp) return;
          if (r.w * zoom < 4 && r.h * zoom < 4) { api.setZoom(zoom * (e.altKey ? 1 / 1.6 : 1.6), p); return; }
          const z = Math.min(vp.clientWidth / r.w, vp.clientHeight / r.h) * .9; api.setZoom(z, { x: r.x + r.w / 2, y: r.y + r.h / 2 }); return;
        }
        if (r.w * zoom < 2 && r.h * zoom < 2) return;
        if (g.mode === 'direct') {
          let best: { id: string; refs: AnchorRef[] } | null = null;
          for (const o of objects) {
            if (o.hidden || o.locked || !isPathish(o)) continue; const b = boundsOf(o);
            if (b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y) continue;
            const path = sourcePathOf(o); if (!path) continue; const refs = anchorsInRect(path, r);
            if (refs.length && (!best || refs.length > best.refs.length)) best = { id: o.id, refs };
          }
          const hits = objects.filter(o => !o.hidden && !o.locked && intersects(boundsOf(o), r)).map(o => o.id);
          api.setSelection(g.add ? [...new Set([...selection, ...hits])] : hits);
          api.setAnchorSel(best);
          return;
        }
        const hits = objects.filter(o => !o.hidden && !o.locked && (!isoMembers || isoMembers.has(o.id)) && intersects(boundsOf(o), r)).map(o => o.id);
        const units = expandUnits(objects, hits, groups, api.isolation);
        api.setSelection(g.add ? [...new Set([...selection, ...units])] : units);
        return;
      }
      case 'anchors': case 'handle': case 'segment': case 'pull': {
        const pend = pendingPath.current; pendingPath.current = null; setOverrides(null);
        if (g.kind === 'pull' && !g.moved) {
          const q = toggleAnchor(g.path0, g.sub, g.ai); commitPath(g.id, q, 'Convert anchor'); return;
        }
        if (!pend || pend.id !== g.id) return;
        commitPath(g.id, pend.q, g.kind === 'anchors' ? 'Move anchors' : g.kind === 'segment' ? 'Reshape curve' : 'Edit handle');
        return;
      }
      case 'pen': {
        const st = penUp(pen); if (st.done) finishPen(st); else setPen(st); return;
      }
      case 'pencil': {
        setPencil(null); if (g.pts.length < 3) return;
        const closed = Math.hypot(g.pts[0].x - p.x, g.pts[0].y - p.y) < 8 / zoom && g.pts.length > 8;
        const path = pointsToPath(g.pts, { tol: Math.max(.6, 2.2 / zoom), closed, cornerAngle: 70 });
        if (!path.subpaths.length) return;
        const obj = newPath(path, { ...api.paint, fill: closed ? api.paint.fill : 'none' }, 'Pencil');
        api.commit([...objs, ...placeInIsolation([obj])], { label: 'Pencil', select: [obj.id] }); return;
      }
      case 'create': {
        setDraft(null);
        if (g.tool === 'type') {
          const q = snapPt(p); const dragged = Math.hypot(q.x - g.start.x, q.y - g.start.y) * zoom > 6;
          const story = newStory('', { fontFamily: 'Inter', fontSize: 24, color: api.paint.fill !== 'none' ? api.paint.fill : '#1B1523', align: 'left' });
          const r = rectOf(g.start, q);
          const t = dragged ? makeTypeObject(story, 'area', { x: r.x, y: r.y, w: Math.max(20, r.w), h: Math.max(20, r.h) }) : makeTypeObject(story, 'point', { x: g.start.x, y: g.start.y - 24, w: 0, h: 30 });
          api.commit([...objs, ...placeInIsolation([t])], { label: 'Type', select: [t.id] });
          api.setEditingText(t.id);
          return;
        }
        const d = draftShape(g.tool, g.start, snapPt(p), e.shiftKey, e.altKey, true);
        if (!d) return;
        api.commit([...objs, ...placeInIsolation([d])], { label: toolLabel(g.tool), select: [d.id] });
        return;
      }
      case 'width': {
        const o = overrides?.[g.id]; setOverrides(null);
        if (o) api.commit(objs.map(x => x.id === g.id ? o : x), { label: 'Width' });
        return;
      }
      case 'shapeBuilder': {
        if (!sbSession || !g.picked.length) { setSbPicked([]); return; }
        const r = shapeBuilderCommit(objs, sbSession, g.picked, e.altKey);
        setSbPicked([]);
        if (r) api.commit(r.objects, { label: e.altKey ? 'Shape Builder delete' : 'Shape Builder', select: r.selection.length ? r.selection : [] });
        return;
      }
      case 'gradient': case 'mesh': case 'radius': {
        const o = overrides?.[g.id]; setOverrides(null);
        if (o) api.commit(objs.map(x => x.id === g.id ? o : x), { label: g.kind === 'radius' ? 'Corner radius' : g.kind === 'mesh' ? 'Mesh point' : 'Gradient' });
        else if (g.kind === 'gradient' && g.part === 'stop') { /* click on a stop just focuses it */ }
        return;
      }
      case 'guide': {
        setGuideDraft(null);
        const at = g.axis === 'x' ? p.x : p.y; const list = [...(guides[g.axis] ?? [])];
        const outOfBoard = g.axis === 'x' ? (p.x < -PAD * .2 || p.x > W + PAD * .2) : (p.y < -PAD * .2 || p.y > H + PAD * .2);
        if (g.fromRuler) { if (!outOfBoard) list.push(Math.round(at * 10) / 10); }
        else if (outOfBoard || insideRuler(e)) list.splice(g.index, 1); else list[g.index] = Math.round(at * 10) / 10;
        api.commitStudio({ ...api.studio, guides: { ...guides, [g.axis]: list } }, 'Guide');
        return;
      }
      case 'artboard': {
        setArtDraft(null); const d = artDraft; if (d && (d.w !== W || d.h !== H)) onResizeArtboard?.(d.w, d.h); return;
      }
    }
  };
  const lastTransform = useRef<Matrix | null>(null);
  // Expose "transform again" (Ctrl+D) through the window so the shell's key handler can reach it.
  useEffect(() => {
    const again = () => {
      const m = lastTransform.current; if (!m || !selection.length) return false;
      const set = new Set(selection); api.commit(api.latest().objects.map(o => set.has(o.id) ? transformObject(o, m) : o), { label: 'Transform again' }); return true;
    };
    (window as unknown as { __telaStudioAgain?: () => boolean }).__telaStudioAgain = again;
    return () => { delete (window as unknown as { __telaStudioAgain?: () => boolean }).__telaStudioAgain; };
  }, [selection, api]);

  function commitPath(id: string, q: CompoundPath, label: string) {
    const objs = api.latest().objects; const cur = objs.find(o => o.id === id); if (!cur) return;
    const next = cur.studio?.live ? setLiveSource(cur, q, api.studio.brushes) : withPath(cur, q);
    api.commit(objs.map(o => o.id === id ? next : o), { label });
  }
  const insideRuler = (e: React.PointerEvent) => { const vp = viewportRef.current?.getBoundingClientRect(); return !!vp && (e.clientY - vp.top < 20 || e.clientX - vp.left < 20); };

  // ── Double click ───────────────────────────────────────────────────────────────────
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = toArt(e);
    if (tool === 'pen' && pen.anchors.length) { finishPen(penFinish(pen)); return; }
    if (tool !== 'select' && tool !== 'direct') return;
    const hit = hitObject(e, p);
    if (!hit) { if (api.isolation) { const gs = groups[api.isolation]; api.setIsolation(gs?.parent ?? null); } return; }
    if (hit.kind === 'TEXT') {
      if (hit.boundWriterDeviceId) { api.status('Bound to a Writer — edit the text there.'); return; }
      if (!hit.studio?.type) { const m = migrateLegacyText(hit); if (m) api.commit(api.latest().objects.map(o => o.id === m.id ? m : o), { label: 'Edit type' }); api.rebakeType(hit.id); }
      const head = threadHead(api.latest().objects, hit.id); api.setSelection([head]); api.setEditingText(head); return;
    }
    const chain = groupChain(hit, groups);
    if (chain.length) {
      const iso = api.isolation; const idx = iso ? chain.indexOf(iso) : chain.length;
      const target = idx > 0 ? chain[idx - 1] : null;
      if (target) { api.setIsolation(target); api.setSelection([hit.id]); api.status(hit.studio?.symbol ? 'Editing symbol — changes update every instance when you exit (Esc).' : 'Isolation mode — Esc to exit.'); return; }
    }
    if (tool === 'select' && isPathish(hit)) { api.setTool('direct'); api.setSelection([hit.id]); }
  };

  // ── Context menu ───────────────────────────────────────────────────────────────────
  const onContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = toArt(e);
    const hit = hitObject(e, p);
    if (hit) {
      if (!selSet.has(hit.id)) api.setSelection(unitOf(hit.id));
      if (onObjectContextMenu) onObjectContextMenu(e, hit);
    } else {
      if (onCanvasContextMenu) onCanvasContextMenu(e, p);
    }
  };

  // ── Wheel: Ctrl/Cmd zooms about the pointer ───────────────────────────────────────
  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) && !e.altKey) return;
      e.preventDefault();
      const p = toArt(e); api.setZoom(zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0018)), p);
    };
    vp.addEventListener('wheel', onWheel, { passive: false }); return () => vp.removeEventListener('wheel', onWheel);
  }, [viewportRef, toArt, zoom, api]);

  // ── Draft shapes ───────────────────────────────────────────────────────────────────
  const draftShape = (t: StudioTool, a: Vec, b: Vec, shift: boolean, alt: boolean, final = false): TelaVectorObject | null => {
    let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
    const clickOnly = Math.hypot(b.x - a.x, b.y - a.y) * zoom < 3;
    if (clickOnly && !final) return null;
    if (clickOnly) { const s = t === 'line' ? 100 : 100; x0 = a.x - (alt ? s / 2 : 0); y0 = a.y - (alt ? s / 2 : 0); x1 = x0 + s; y1 = y0 + s; if (t === 'polygon' || t === 'star' || t === 'spiral') { x0 = a.x - s / 2; y0 = a.y - s / 2; x1 = a.x + s / 2; y1 = a.y + s / 2; } }
    if (t === 'line') {
      let e2 = { x: x1, y: y1 }; if (shift) e2 = constrain45(a, e2);
      const o = baseObj('LINE', api.paint); o.points = [a.x, a.y, e2.x, e2.y]; o.fill = 'none'; o.x = Math.min(a.x, e2.x); o.y = Math.min(a.y, e2.y); o.w = Math.abs(e2.x - a.x); o.h = Math.abs(e2.y - a.y);
      return o;
    }
    const centred = alt || t === 'polygon' || t === 'star' || t === 'spiral';
    let w = x1 - x0, h = y1 - y0;
    if (shift || t === 'polygon' || t === 'star' || t === 'spiral') { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
    let box: Rect = centred && !clickOnly ? { x: a.x - Math.abs(w), y: a.y - Math.abs(h), w: Math.abs(w) * 2, h: Math.abs(h) * 2 } : { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.abs(w), h: Math.abs(h) };
    if (clickOnly) box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    if (box.w < .5 || box.h < .5) return null;
    if (t === 'rect') { const o = baseObj('RECT', api.paint); Object.assign(o, box); o.rx = api.shapeOpts.radius; return o; }
    if (t === 'ellipse') { const o = baseObj('ELLIPSE', api.paint); Object.assign(o, box); return o; }
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, r = Math.min(box.w, box.h) / 2;
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const shape = t === 'polygon' ? { kind: 'polygon' as const, params: { cx, cy, r, sides: api.shapeOpts.sides, rot: shift ? -90 : ang } }
      : t === 'star' ? { kind: 'star' as const, params: { cx, cy, r1: r, r2: r * api.shapeOpts.innerRatio, points: api.shapeOpts.points, rot: shift ? -90 : ang } }
      : { kind: 'spiral' as const, params: { cx, cy, r, decay: api.shapeOpts.spiralDecay, segments: api.shapeOpts.spiralSegments, rot: ang, clockwise: 1 } };
    const src = pathToObject(liveShapePath(shape), {}, 'tmp');
    const o: TelaVectorObject = { ...baseObj('PATH', api.paint), x: src.x, y: src.y, w: src.w, h: src.h, svgPathData: src.svgPathData, pathOriginX: src.x, pathOriginY: src.y, pathOriginW: src.w, pathOriginH: src.h, pathClosed: t !== 'spiral', geom: { v: 1, fillRule: 'nonzero' } };
    if (t === 'spiral') o.fill = 'none';
    o.studio = { v: 1, live: { d: src.svgPathData!, shape } };
    return final ? bakeLive(o) : o;
  };

  // ── Overlays ───────────────────────────────────────────────────────────────────────
  const hs = 7 / zoom; // handle size in artboard px
  const sw = 1 / zoom;
  const singleSel = selObjs.length === 1 ? selObjs[0] : null;
  const showBox = (tool === 'select' || tool === 'rotate' || tool === 'scale' || tool === 'reflect') && selBox && !api.editingText;
  const anchorObjs = (tool === 'direct' || tool === 'pen' || tool === 'addAnchor' || tool === 'deleteAnchor' || tool === 'convert' || tool === 'scissors') ? selObjs.filter(isPathish).slice(0, 300) : [];
  const anchorSelKeys = api.anchorSel ? new Set(api.anchorSel.refs.map(refKey)) : new Set<string>();

  const overlay = (
    <g data-layer="overlay" style={{ pointerEvents: 'none' }}>
      {/* hover outline */}
      {hover && !gesture.current && !selSet.has(hover) && (() => { const o = byId.get(hover); const path = o && isPathish(o) ? pathOf(o) : null; const b = o ? boundsOf(o) : null; return path ? <path d={toPathData(path)} fill="none" stroke={SEL} strokeWidth={1.5 * sw} /> : b ? <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={SEL} strokeWidth={sw} /> : null; })()}

      {/* per-object selection outlines (multi) */}
      {(tool === 'select' || tool === 'direct') && selObjs.length > 1 && selObjs.length <= 400 && selObjs.map(o => { const b = boundsOf(o); return <rect key={o.id} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={SEL} strokeOpacity={.55} strokeWidth={sw} />; })}

      {/* direct selection: outlines, anchors, handles */}
      {anchorObjs.map(o => {
        const path = sourcePathOf(o); if (!path) return null;
        const isActive = api.anchorSel?.id === o.id;
        const live = !!o.studio?.live;
        return <g key={o.id}>
          <path d={toPathData(path)} fill="none" stroke={live ? MAG : SEL} strokeWidth={sw} strokeDasharray={live ? `${4 * sw} ${3 * sw}` : undefined} />
          {path.subpaths.map((s, si) => s.anchors.map((a, ai) => {
            const k = `${si}:${ai}`; const on = isActive && anchorSelKeys.has(k);
            const n = s.anchors.length; const near = isActive && (anchorSelKeys.has(`${si}:${(ai + 1) % n}`) || anchorSelKeys.has(`${si}:${(ai - 1 + n) % n}`));
            const showH = on || near || (tool === 'convert');
            return <g key={k}>
              {showH && a.hin && <><line x1={a.x} y1={a.y} x2={a.hin.x} y2={a.hin.y} stroke={SEL} strokeWidth={sw} /><circle cx={a.hin.x} cy={a.hin.y} r={hs * .45} fill={SEL} /></>}
              {showH && a.hout && <><line x1={a.x} y1={a.y} x2={a.hout.x} y2={a.hout.y} stroke={SEL} strokeWidth={sw} /><circle cx={a.hout.x} cy={a.hout.y} r={hs * .45} fill={SEL} /></>}
              <rect x={a.x - hs / 2} y={a.y - hs / 2} width={hs} height={hs} fill={on ? SEL : '#fff'} stroke={SEL} strokeWidth={sw} />
            </g>;
          }))}
        </g>;
      })}

      {/* bounding box + handles (moves with the preview transform) */}
      <g ref={overlayMoveRef}>
        {showBox && selBox && <>
          <rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} fill="none" stroke={SEL} strokeWidth={sw} />
          {xformOrigin && <g><circle cx={xformOrigin.x} cy={xformOrigin.y} r={hs * .7} fill="none" stroke={SEL} strokeWidth={sw} /><path d={`M${xformOrigin.x - hs} ${xformOrigin.y}H${xformOrigin.x + hs}M${xformOrigin.x} ${xformOrigin.y - hs}V${xformOrigin.y + hs}`} stroke={SEL} strokeWidth={sw} /></g>}
        </>}
      </g>
      {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(46,139,255,.08)" stroke={SEL} strokeWidth={sw} strokeDasharray={`${4 * sw} ${3 * sw}`} />}
      {smart.map((g, i) => g.axis === 'x' ? <line key={i} x1={g.at} x2={g.at} y1={g.from - 8 / zoom} y2={g.to + 8 / zoom} stroke={MAG} strokeWidth={sw} /> : <line key={i} y1={g.at} y2={g.at} x1={g.from - 8 / zoom} x2={g.to + 8 / zoom} stroke={MAG} strokeWidth={sw} />)}
      {/* pen preview */}
      {tool === 'pen' && (() => { const pv = penPreview(pen, cursor, mods); const d = toPathData({ fillRule: 'nonzero', subpaths: [pv.path] }); return <g>
        {d && <path d={d} fill="none" stroke={SEL} strokeWidth={1.25 * sw} />}
        {pv.rubber && <path d={toPathData({ fillRule: 'nonzero', subpaths: [pv.rubber] })} fill="none" stroke={SEL} strokeWidth={sw} strokeDasharray={`${3 * sw} ${3 * sw}`} />}
        {pen.anchors.map((a, i) => <g key={i}>
          {a.hin && <><line x1={a.x} y1={a.y} x2={a.hin.x} y2={a.hin.y} stroke={SEL} strokeWidth={sw} /><circle cx={a.hin.x} cy={a.hin.y} r={hs * .45} fill={SEL} /></>}
          {a.hout && <><line x1={a.x} y1={a.y} x2={a.hout.x} y2={a.hout.y} stroke={SEL} strokeWidth={sw} /><circle cx={a.hout.x} cy={a.hout.y} r={hs * .45} fill={SEL} /></>}
          <rect x={a.x - hs / 2} y={a.y - hs / 2} width={hs} height={hs} fill={i === pen.anchors.length - 1 ? SEL : '#fff'} stroke={SEL} strokeWidth={sw} />
        </g>)}
        {pen.anchors.length >= 2 && cursor && Math.hypot(cursor.x - pen.anchors[0].x, cursor.y - pen.anchors[0].y) < tol * 1.4 && <circle cx={pen.anchors[0].x} cy={pen.anchors[0].y} r={hs} fill="none" stroke={MAG} strokeWidth={1.5 * sw} />}
      </g>; })()}
      {pencil && pencil.length > 1 && <polyline points={pencil.map(q => `${q.x},${q.y}`).join(' ')} fill="none" stroke={api.paint.stroke !== 'none' ? api.paint.stroke : SEL} strokeWidth={Math.max(sw, api.paint.strokeWidth)} strokeLinecap="round" strokeLinejoin="round" opacity={.8} />}
      {draft && <g opacity={.85}><ObjectEl o={draft} interactive={false} /></g>}
      {/* shape builder */}
      {sbSession && sbSession.regions.map((r, i) => (i === sbHover || sbPicked.includes(i)) ? <path key={i} d={toPathData(r.path)} fill={mods.alt ? 'rgba(212,0,85,.25)' : 'rgba(46,139,255,.22)'} stroke={mods.alt ? MAG : SEL} strokeWidth={sw} strokeDasharray={`${3 * sw} ${2 * sw}`} /> : null)}
      {/* width tool hover */}
      {tool === 'width' && cursor && !gesture.current && (() => {
        for (const o of [...objects].reverse()) { if (!isPathish(o) || o.hidden) continue; const spine = sourcePathOf(o); if (!spine) continue; const n = distanceToPath(spine, cursor); const w = o.studio?.live?.width?.width ?? o.strokeWidth ?? 1; if (n.sub >= 0 && n.dist <= w / 2 + tol) return <g><path d={toPathData(spine)} fill="none" stroke={SEL} strokeWidth={sw} /><circle cx={n.point.x} cy={n.point.y} r={hs * .6} fill="#fff" stroke={SEL} strokeWidth={sw} /></g>; }
        return null;
      })()}
      {guideDraft && (guideDraft.axis === 'x' ? <line x1={guideDraft.at} x2={guideDraft.at} y1={-PAD} y2={H + PAD} stroke={ACCENT} strokeWidth={sw} /> : <line y1={guideDraft.at} y2={guideDraft.at} x1={-PAD} x2={W + PAD} stroke={ACCENT} strokeWidth={sw} />)}
      {artDraft && <rect x={0} y={0} width={artDraft.w} height={artDraft.h} fill="none" stroke={MAG} strokeWidth={1.5 * sw} strokeDasharray={`${6 * sw} ${4 * sw}`} />}
    </g>
  );

  // Interactive handles (pointer events on) drawn above the overlay.
  const handles = (
    <g data-layer="handles">
      {showBox && selBox && !gesture.current && <>
        {HANDLES.map(h => { const q = handlePoint(selBox, h); return <rect key={h} data-h={h} x={q.x - hs / 2} y={q.y - hs / 2} width={hs} height={hs} fill="#fff" stroke={SEL} strokeWidth={sw} style={{ cursor: mods.ctrl && h.length === 1 ? 'crosshair' : HANDLE_CURSOR[h] }} />; })}
        {(['nw', 'ne', 'se', 'sw'] as Handle[]).map(h => { const q = handlePoint(selBox, h); const ox = h.includes('w') ? -1 : 1, oy = h.includes('n') ? -1 : 1; return <circle key={`rot:${h}`} data-h={`rot:${h}`} cx={q.x + ox * hs * 1.6} cy={q.y + oy * hs * 1.6} r={hs * 1.3} fill="transparent" style={{ cursor: 'grab' }} />; })}
        {singleSel?.kind === 'RECT' && !singleSel.rotation && (() => { const r = singleSel.rx ?? 2; const d = Math.max(r, 12 / zoom); return <circle data-h="radius" cx={singleSel.x + d} cy={singleSel.y + d} r={hs * .55} fill="#fff" stroke={SEL} strokeWidth={sw} style={{ cursor: 'pointer' }}><title>Corner radius</title></circle>; })()}
      </>}
      {tool === 'gradient' && singleSel && (() => {
        const f = paintOf(overrides?.[singleSel.id] ?? singleSel, 'fill'); if (typeof f === 'string' || (f.type !== 'linear' && f.type !== 'radial')) return null;
        const m = objectMatrix(singleSel); const [a0, b0] = gradEnds(f); const a = applyMat(gradTf(f, m), a0), b = applyMat(gradTf(f, m), b0);
        return <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#111" strokeWidth={3 * sw} /><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={1.5 * sw} />
          <circle data-h="g:p1" cx={a.x} cy={a.y} r={hs * .8} fill="#fff" stroke="#111" strokeWidth={sw} style={{ cursor: 'move' }} />
          <rect data-h="g:p2" x={b.x - hs * .7} y={b.y - hs * .7} width={hs * 1.4} height={hs * 1.4} fill="#fff" stroke="#111" strokeWidth={sw} style={{ cursor: 'move' }} />
          {f.stops.map((s, i) => { const q = { x: a.x + (b.x - a.x) * s.offset, y: a.y + (b.y - a.y) * s.offset }; const on = api.paintTarget?.kind === 'gradient' && api.paintTarget.stop === i; return <circle key={i} data-h={`g:stop:${i}`} cx={q.x} cy={q.y + 9 / zoom} r={hs * .75} fill={s.color} stroke={on ? ACCENT : '#fff'} strokeWidth={(on ? 2.5 : 1.5) * sw} style={{ cursor: 'ew-resize' }} />; })}
        </g>;
      })()}
      {tool === 'mesh' && singleSel && (() => {
        const f = paintOf(overrides?.[singleSel.id] ?? singleSel, 'fill'); if (typeof f === 'string' || f.type !== 'mesh') return null;
        const m = objectMatrix(singleSel); const P = f.nodes.map(n => applyMat(m, n)); const C = f.cols + 1;
        const lines: string[] = [];
        for (let r = 0; r <= f.rows; r++) lines.push('M' + P.slice(r * C, r * C + C).map(q => `${q.x} ${q.y}`).join('L'));
        for (let c = 0; c < C; c++) { const col: Vec[] = []; for (let r = 0; r <= f.rows; r++) col.push(P[r * C + c]); lines.push('M' + col.map(q => `${q.x} ${q.y}`).join('L')); }
        return <g><path d={lines.join('')} fill="none" stroke="#fff" strokeOpacity={.8} strokeWidth={sw} />{P.map((q, i) => { const on = api.paintTarget?.kind === 'mesh' && api.paintTarget.node === i; return <rect key={i} data-h={`m:${i}`} x={q.x - hs * .5} y={q.y - hs * .5} width={hs} height={hs} fill={f.nodes[i].color} stroke={on ? ACCENT : '#fff'} strokeWidth={(on ? 2.5 : 1.2) * sw} style={{ cursor: 'move' }} />; })}</g>;
      })()}
      {tool === 'artboard' && (['e', 's', 'se'] as Handle[]).map(h => { const q = handlePoint({ x: 0, y: 0, w: W, h: H }, h); return <rect key={h} data-h={`ab:${h}`} x={q.x - hs * .7} y={q.y - hs * .7} width={hs * 1.4} height={hs * 1.4} fill="#fff" stroke={MAG} strokeWidth={1.5 * sw} style={{ cursor: HANDLE_CURSOR[h] }} />; })}
      {/* guides (draggable with the selection tools) */}
      {prefs.showGuides && guides.x.map((x, i) => <line key={`gx${i}`} data-guide={`x:${i}`} x1={x} x2={x} y1={-PAD} y2={H + PAD} stroke={ACCENT} strokeWidth={sw} style={{ cursor: 'col-resize', pointerEvents: tool === 'select' || tool === 'direct' ? 'stroke' : 'none' }} strokeOpacity={.85} />)}
      {prefs.showGuides && guides.y.map((y, i) => <line key={`gy${i}`} data-guide={`y:${i}`} y1={y} y2={y} x1={-PAD} x2={W + PAD} stroke={ACCENT} strokeWidth={sw} style={{ cursor: 'row-resize', pointerEvents: tool === 'select' || tool === 'direct' ? 'stroke' : 'none' }} strokeOpacity={.85} />)}
    </g>
  );

  // ── Text editing overlay ───────────────────────────────────────────────────────────
  const editing = api.editingText ? byId.get(api.editingText) : null;
  const editChain = editing ? threadChain(objects, editing.id) : [];
  const hiddenIds = useMemo(() => new Set(editChain.map(o => o.id)), [editChain.map(o => o.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const textOverlay = editing && textSys && editing.studio?.type?.story ? (() => {
    const t = editing.studio!.type!;
    const frames = t.mode === 'area' ? editFrames(editChain) : t.mode === 'point' ? [pointEditFrame(editing)] : [{ id: editing.id, x: editing.x, y: editing.y - 10, width: Math.max(320, editing.w), height: 60 }];
    const vx = Math.min(...frames.map(f => f.x)), vy = Math.min(...frames.map(f => f.y));
    const vw = Math.max(...frames.map(f => f.x + f.width)) - vx, vh = Math.max(...frames.map(f => f.y + f.height)) - vy;
    const onChange = (story: TextStory) => {
      const objs = api.latest().objects; const cur = objs.find(o => o.id === editing.id); if (!cur?.studio?.type) return;
      api.commit(objs.map(o => o.id === cur.id ? { ...o, text: storyText(story), studio: { ...o.studio!, type: { ...o.studio!.type!, story } } } : o), { label: 'Typing', coalesce: `text:${cur.id}` });
      api.rebakeType(cur.id, 'Typing');
    };
    return <div data-studio-text style={{ position: 'absolute', left: (vx + PAD) * zoom, top: (vy + PAD) * zoom, width: vw * zoom, zIndex: 5, background: t.mode === 'path' ? 'rgba(255,255,255,.96)' : 'transparent', boxShadow: t.mode === 'path' ? '0 8px 30px rgba(0,0,0,.35)' : undefined, outline: `1px dashed ${SEL}` }}
      onPointerDown={e => e.stopPropagation()}>
      <TextSurface system={textSys} story={t.story!} frames={frames} viewBox={[vx, vy, vw, vh]} onChange={onChange} />
    </div>;
  })() : null;

  useEffect(() => {
    if (!api.editingText) return;
    const id = setTimeout(() => { const ta = document.querySelector<HTMLTextAreaElement>('[data-studio-text] textarea'); ta?.focus(); }, 30);
    return () => clearTimeout(id);
  }, [api.editingText, textSys]);

  // ── Render ─────────────────────────────────────────────────────────────────────────
  const cursorCss = mods.space || gesture.current?.kind === 'pan' ? 'grabbing' : tool === 'zoom' && mods.alt ? 'zoom-out' : TOOL_CURSOR[tool] ?? 'default';
  const SW = (W + PAD * 2) * zoom, SH = (H + PAD * 2) * zoom;
  const grid = prefs.showGrid && prefs.gridSize > 0;

  return (
    <div style={{ position: 'relative', width: SW, height: SH }}>
      <svg ref={svgRef} width={SW} height={SH} viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
        style={{ display: 'block', touchAction: 'none', cursor: cursorCss, outline: 'none' }}
        className={prefs.outline ? 'tela-studio-outline' : undefined}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => { setHover(null); setCursor(null); }} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
        <defs>
          {grid && <pattern id="studio-grid" width={prefs.gridSize} height={prefs.gridSize} patternUnits="userSpaceOnUse"><path d={`M${prefs.gridSize} 0H0V${prefs.gridSize}`} fill="none" stroke="rgba(30,80,200,.16)" strokeWidth={sw} /></pattern>}
          <filter id="studio-board-shadow" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy={6 / zoom} stdDeviation={10 / zoom} floodColor="#000" floodOpacity=".45" /></filter>
        </defs>
        <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={H + PAD * 2} fill="#1d1c24" />
        <rect x={0} y={0} width={W} height={H} fill="#fff" filter="url(#studio-board-shadow)" />
        <ObjectLayer objects={objects} overrides={overrides} hidden={hiddenIds} writerTexts={api.writerTexts} isoMembers={isoMembers} />
        {grid && <rect x={0} y={0} width={W} height={H} fill="url(#studio-grid)" pointerEvents="none" />}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={sw} pointerEvents="none" />
        {api.isolation && <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={20 / zoom} fill="rgba(46,139,255,.85)" pointerEvents="none" />}
        {overlay}
        {handles}
      </svg>
      {textOverlay}
      {api.isolation && <div style={{ position: 'sticky', left: 8, top: 0, zIndex: 6, display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: -SH, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#fff', background: SEL, borderRadius: '0 0 8px 8px' }}>
        {byId.get(selection[0] ?? '')?.studio?.symbol ? 'Editing symbol' : 'Isolation'} · {groups[api.isolation]?.name ?? 'Group'} <button onClick={() => api.setIsolation(null)} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'rgba(255,255,255,.2)', color: '#fff', border: 0, cursor: 'pointer' }}>Exit (Esc)</button>
      </div>}
    </div>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────────────

const rectOf = (a: Vec, b: Vec): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
const intersects = (a: Rect, b: Rect) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
function constrain45(from: Vec, to: Vec): Vec { const a = Math.atan2(to.y - from.y, to.x - from.x); const s = Math.PI / 4; const r = Math.hypot(to.x - from.x, to.y - from.y); const q = Math.round(a / s) * s; return { x: from.x + Math.cos(q) * r, y: from.y + Math.sin(q) * r }; }
const isIdentityish = (m: Matrix) => Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-9 && Math.abs(m[5]) < 1e-9;
const toolLabel = (t: StudioTool) => ({ rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line', spiral: 'Spiral' } as Record<string, string>)[t] ?? 'Shape';

function baseObj(kind: TelaVectorObject['kind'], paint: { fill: string; stroke: string; strokeWidth: number }): TelaVectorObject {
  return { id: studioId('obj'), kind, x: 0, y: 0, w: 0, h: 0, fill: paint.fill, stroke: paint.stroke, strokeWidth: paint.stroke === 'none' ? 0 : paint.strokeWidth, rotation: 0, opacity: 1, objectLabel: undefined };
}
function newPath(path: CompoundPath, paint: { fill: string; stroke: string; strokeWidth: number }, label: string): TelaVectorObject {
  const o = pathToObject(path, { fill: paint.fill, stroke: paint.stroke, strokeWidth: paint.stroke === 'none' ? 0 : paint.strokeWidth, label }, studioId('obj'));
  if (!o.geom) o.geom = { v: 1, fillRule: 'nonzero' };
  return o;
}

function gradEnds(f: LinearPaint | RadialPaint): [Vec, Vec] {
  return f.type === 'linear' ? [{ x: f.x1, y: f.y1 }, { x: f.x2, y: f.y2 }] : [{ x: f.cx, y: f.cy }, { x: f.cx + f.r, y: f.cy }];
}
const gradTf = (f: LinearPaint | RadialPaint, m: Matrix): Matrix => f.transform ? multiply(m, f.transform) : m;
function projT(a: Vec, b: Vec, p: Vec): number { const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy; return L > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; }
export { gradEnds, projT };
