// 2D drafting view: an AutoCAD-style editor on top of the plotted drawing.
// Tools, object snaps, ortho/grid, window/crossing selection, grips, command line with
// typed coordinates and aliases, F3/F7/F8/F9. Geometry and edits live in services/cad/draft.ts.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, Hand, Minus, Spline, Square, Circle, Ruler, Type, Move, Copy, Crosshair, Trash2, Undo2, Redo2, Maximize, RotateCw, Scaling, FlipHorizontal2, BetweenVerticalStart, BrickWall, PaintBucket, Scissors, ArrowRightToLine, CornerDownRight, Tag } from 'lucide-react';
import type { CadModel, CadEntity2D, CadBlock } from '../../services/cad/model';
import { ensureBlockAndLayer, itemById, LAYER_COLORS } from '../../services/cad/library';
import { wallAt, addOpening } from '../../services/cad/walls';
import { HATCH_PATTERNS, HATCH_LABELS } from '../../services/cad/hatchPatterns';
import type { Finding } from '../../services/cad/codeCheck';
import { collectOpenings } from '../../services/cad/schedules';
import { MM_PER_UNIT } from '../../services/cad/model';
import { drawingToSvg, flatten2D, drawingFrame } from '../../services/cad/dxf';
import { buildGeom, findSnap, applyOrtho, pick, boxSelect, parsePointInput, COMMAND_ALIASES, moveEntities, eraseEntities, addEntities, measureEntity, arcFrom, drawingScale, DEFAULT_SNAPS, transformEntities, rotateAbout, scaleAbout, mirrorAcross, offsetEntity, insertBlock, wallsFrom, trimEntity, extendEntity, filletEntities, boundaryAt, type P, type DraftTool, type Snap, type SnapOptions } from '../../services/cad/draft';

const ACCENT = '#7dd3fc', WARM = '#ffb020', SEL = '#3b82f6';

export interface DraftViewProps {
  model: CadModel;
  hiddenLayers: Set<string>;
  currentLayer: string;
  fitNonce: number;
  fmt: (d: number) => string;
  fmtArea: (a: number) => string;
  onChange: (next: CadModel, label: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelection?: (idx: number[]) => void;
  selection: number[];
  setSelection: (idx: number[]) => void;
  /** Set a layer on the selection (from the status bar). */
  onSetLayer: (layer: string) => void;
  layers: string[];
  /** A library item or block being placed; the view switches to INSERT while it is set. */
  placing?: { block: CadBlock; layer: string; label: string; item?: { id: string; params: Record<string, number | string | boolean> } } | null;
  onStopPlacing?: () => void;
  /** Live code-check results to mark on the plan. */
  findings?: Finding[]; showChecks?: boolean; onToggleChecks?: () => void; failCount?: number;
}

const TOOLS: Array<{ id: DraftTool; icon: React.ComponentType<{ size?: number }>; label: string; key: string }> = [
  { id: 'select', icon: MousePointer2, label: 'Select', key: 'S' },
  { id: 'pan', icon: Hand, label: 'Pan', key: 'P' },
  { id: 'wall', icon: BrickWall, label: 'Wall (chain; C closes)', key: 'W' },
  { id: 'line', icon: Minus, label: 'Line', key: 'L' },
  { id: 'polyline', icon: Spline, label: 'Polyline', key: 'PL' },
  { id: 'rect', icon: Square, label: 'Rectangle', key: 'REC' },
  { id: 'circle', icon: Circle, label: 'Circle', key: 'C' },
  { id: 'arc', icon: Circle, label: 'Arc (centre, start, end)', key: 'A' },
  { id: 'dimension', icon: Ruler, label: 'Dimension', key: 'DIM' },
  { id: 'text', icon: Type, label: 'Text', key: 'T' },
  { id: 'roomtag', icon: Tag, label: 'Room tag (name + live area)', key: 'RT' },
  { id: 'move', icon: Move, label: 'Move', key: 'M' },
  { id: 'copy', icon: Copy, label: 'Copy', key: 'CO' },
  { id: 'rotate', icon: RotateCw, label: 'Rotate', key: 'RO' },
  { id: 'scale', icon: Scaling, label: 'Scale', key: 'SC' },
  { id: 'mirror', icon: FlipHorizontal2, label: 'Mirror', key: 'MI' },
  { id: 'offset', icon: BetweenVerticalStart, label: 'Offset (walls from lines)', key: 'O' },
  { id: 'trim', icon: Scissors, label: 'Trim', key: 'TR' },
  { id: 'extend', icon: ArrowRightToLine, label: 'Extend', key: 'EX' },
  { id: 'fillet', icon: CornerDownRight, label: 'Fillet (radius 0 joins corners and walls)', key: 'F' },
  { id: 'hatch', icon: PaintBucket, label: 'Hatch (click inside a closed shape)', key: 'H' },
  { id: 'measure', icon: Crosshair, label: 'Measure distance', key: 'DI' },
];

const PROMPTS: Record<DraftTool, string[]> = {
  select: ['Pick objects, or drag a window (left to right) or crossing (right to left)'],
  pan: ['Drag to pan'],
  line: ['LINE  First point', 'LINE  Next point  [Enter to finish, U to undo]'],
  polyline: ['PLINE  Start point', 'PLINE  Next point  [Enter to finish, C to close, U to undo]'],
  rect: ['RECTANG  First corner', 'RECTANG  Other corner, or @width,height'],
  circle: ['CIRCLE  Centre point', 'CIRCLE  Radius (click or type)'],
  arc: ['ARC  Centre point', 'ARC  Start point', 'ARC  End point (counter-clockwise)'],
  dimension: ['DIM  First point', 'DIM  Second point', 'DIM  Dimension line position'],
  text: ['TEXT  Insertion point', 'TEXT  Type the text, then Enter'],
  move: ['MOVE  Base point', 'MOVE  Second point'],
  copy: ['COPY  Base point', 'COPY  Second point  [Esc when done]'],
  measure: ['DIST  First point', 'DIST  Second point'],
  rotate: ['ROTATE  Base point', 'ROTATE  Angle (click, or type degrees)'],
  scale: ['SCALE  Base point', 'SCALE  Type a factor, or click a reference point', 'SCALE  Click the new point for the reference'],
  mirror: ['MIRROR  First point of the mirror line', 'MIRROR  Second point (originals are kept)'],
  offset: ['OFFSET  Type the distance (or click two points)', 'OFFSET  Second point of the distance', 'OFFSET  Pick the object to offset', 'OFFSET  Click the side to offset to'],
  insert: ['INSERT  Place it  [type an angle, R rotates 90, F flips, Esc when done]'],
  wall: ['WALL  Start point', 'WALL  Next point  [Enter to finish, C to close, U to undo]'],
  trim: ['TRIM  Click the part to cut away (everything else cuts)'],
  extend: ['EXTEND  Click near the end to extend'],
  fillet: ['FILLET  First line or wall  [type a radius]', 'FILLET  Second line or wall'],
  hatch: ['HATCH  Click inside a closed shape'],
  roomtag: ['ROOM TAG  Click inside a room', 'ROOM TAG  Type the room name, then Enter'],
};

const SNAP_LABEL: Record<Snap['kind'], string> = { end: 'Endpoint', mid: 'Midpoint', center: 'Centre', quad: 'Quadrant', node: 'Node', insert: 'Insertion', intersection: 'Intersection', grid: 'Grid', perp: 'Perpendicular' };

export default function DraftView(p: DraftViewProps) {
  const { model, hiddenLayers, currentLayer, fmt, fmtArea, onChange, selection, setSelection } = p;
  const box = useRef<HTMLDivElement>(null);
  const cmdRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<{ cx: number; cy: number; s: number } | null>(null);
  const [tool, setToolState] = useState<DraftTool>('select');
  const [pts, setPts] = useState<P[]>([]);
  const [cursor, setCursor] = useState<P | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [snaps, setSnaps] = useState<SnapOptions & { osnap: boolean }>({ ...DEFAULT_SNAPS, osnap: true, gridSize: drawingScale(model).grid });
  const [cmd, setCmd] = useState('');
  const [drag, setDrag] = useState<{ start: P; startScreen: P; now: P; mode: 'box' | 'pan'; moved: number; view?: { cx: number; cy: number } } | null>(null);
  const [measured, setMeasured] = useState<[P, P] | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [insRot, setInsRot] = useState(0); const [insFlip, setInsFlip] = useState(false);
  const unitsPerMm = 1 / MM_PER_UNIT[model.units];
  const [wallT, setWallT] = useState(200 * unitsPerMm); const [wallStart, setWallStart] = useState<P | null>(null);
  const [filletR, setFilletR] = useState(0); const [filletFirst, setFilletFirst] = useState<{ idx: number; p: P } | null>(null);
  // Brick patterns are defined at real brick size, so their natural scale is 1:1 in millimetres;
  // line patterns (3.175 apart at scale 1) scale with the drawing so they read at plan size.
  const hatchDefault = (pat: string) => /BRSTD|BRICK|B816/.test(pat) ? +unitsPerMm.toPrecision(4) : Math.max(1, Math.round(drawingScale(model).textHeight / 3.175 / 2));
  const [hatchPat, setHatchPatState] = useState<string>('ANSI31'); const [hatchScale, setHatchScale] = useState(() => hatchDefault('ANSI31'));
  const setHatchPat = (pat: string) => { setHatchPatState(pat); setHatchScale(hatchDefault(pat)); };
  const [offsetDist, setOffsetDist] = useState<number | null>(null); const [offsetTarget, setOffsetTarget] = useState<number | null>(null);
  const scale = useMemo(() => drawingScale(model), [model]);

  const setTool = useCallback((t: DraftTool) => { setToolState(t); setPts([]); setMeasured(null); setOffsetTarget(null); if (t !== 'offset') setOffsetDist(null); setWallStart(null); setFilletFirst(null); }, []);
  // A library pick switches to INSERT; leaving INSERT clears the pick.
  useEffect(() => { if (p.placing) { setToolState('insert'); setPts([]); setInsRot(0); setInsFlip(false); } else setToolState(t => t === 'insert' ? 'select' : t); }, [p.placing]);

  // ── drawing and geometry caches ──
  const svg = useMemo(() => drawingToSvg(model, { width: 2400, background: null, hiddenLayers }), [model, hiddenLayers]);
  const url = useMemo(() => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), [svg]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const frame = useMemo(() => drawingFrame(flatten2D(model, { hiddenLayers })), [model, hiddenLayers]);
  const geom = useMemo(() => buildGeom(model, hiddenLayers), [model, hiddenLayers]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = useCallback(() => {
    const b = model.bounds; const w = Math.max(1e-6, b.max[0] - b.min[0]), h = Math.max(1e-6, b.max[1] - b.min[1]);
    setView({ cx: (b.min[0] + b.max[0]) / 2, cy: (b.min[1] + b.max[1]) / 2, s: Math.min(size.w * 0.9 / w, size.h * 0.9 / h) });
  }, [model.bounds, size.w, size.h]);
  // Fit when asked, or on first layout; edits never move the view.
  useEffect(() => { if (size.w > 0) fit(); }, [p.fitNonce, size.w > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = view ?? { cx: 0, cy: 0, s: 1 };
  const toScreen = (q: P): P => [size.w / 2 + (q[0] - v.cx) * v.s, size.h / 2 - (q[1] - v.cy) * v.s];
  // Pointer maths reads the canvas size at the moment of the event (layout can change before the resize observer reports).
  const live = useRef(size); live.current = size;
  const toModel = (sx: number, sy: number): P => [v.cx + (sx - live.current.w / 2) / v.s, v.cy - (sy - live.current.h / 2) / v.s];
  const tol = 10 / v.s;
  const last = pts.length ? pts[pts.length - 1] : null;

  const resolve = (sx: number, sy: number): { p: P; snap: Snap | null } => {
    const raw = toModel(sx, sy);
    const base = tool === 'select' || tool === 'pan' ? null : last;
    const sn = snaps.osnap || snaps.grid ? findSnap(geom, raw, tol, { ...snaps, end: snaps.osnap && snaps.end, mid: snaps.osnap && snaps.mid, center: snaps.osnap && snaps.center, intersection: snaps.osnap && snaps.intersection, perpendicular: snaps.osnap && snaps.perpendicular }, base) : null;
    if (sn) return { p: sn.p, snap: sn };
    return { p: snaps.ortho ? applyOrtho(raw, base) : raw, snap: null };
  };

  const stage = pts.length;
  const offsetStage = offsetDist === null ? (pts.length ? 1 : 0) : offsetTarget === null ? 2 : 3;
  const prompt = tool === 'fillet' ? `${PROMPTS.fillet[filletFirst ? 1 : 0]}  (radius ${fmt(filletR)})` : tool === 'wall' ? `${PROMPTS.wall[pts.length ? 1 : 0]}  (thickness ${fmt(wallT)})` : tool === 'offset' ? PROMPTS.offset[offsetStage] + (offsetDist !== null ? `  (${fmt(offsetDist)})` : '') : tool === 'insert' && p.placing ? `INSERT ${p.placing.label}  rotation ${insRot}°${insFlip ? ', flipped' : ''}  [type an angle, R rotates 90, F flips, Esc when done]` : PROMPTS[tool][Math.min(stage, PROMPTS[tool].length - 1)];
  const say = (line: string) => setHistory(h => [...h.slice(-30), line]);

  const withLayer = (m: CadModel, name: string) => m.layers.some(l => l.name === name) ? m : { ...m, layers: [...m.layers, { name, color: LAYER_COLORS[name] ?? (name === 'A-WALL' ? '#ff0000' : '#ffffff'), visible: true }] };
  /** Library doors/windows go into a wall when the cursor is over one. */
  const hostFor = (q: P) => {
    const it = p.placing?.item ? itemById(p.placing.item.id) : undefined; if (!it || (it.category !== 'Doors' && it.category !== 'Windows')) return null;
    const hit = wallAt(model.entities, q, Math.max(tol * 2, 50 * unitsPerMm)); if (!hit) return null;
    const widthMm = Number(p.placing!.item!.params.width ?? it.params.find(d => d.key === 'width')?.default ?? 900);
    const next = addOpening(hit.wall, q, { kind: it.category === 'Windows' ? 'window' : 'door', width: widthMm * unitsPerMm, item: it.id, params: p.placing!.item!.params });
    return { index: hit.index, next };
  };

  // ── the heart: one point given to the current tool ──
  const givePoint = (q: P) => {
    const layer = currentLayer;
    switch (tool) {
      case 'line':
        if (last) onChange(addEntities(model, [{ type: 'line', layer, a: [last[0], last[1], 0], b: [q[0], q[1], 0] }]), 'Line');
        setPts([q]); break;
      case 'polyline': setPts([...pts, q]); break;
      case 'rect':
        if (!last) { setPts([q]); break; }
        onChange(addEntities(model, [{ type: 'polyline', layer, points: [[last[0], last[1], 0], [q[0], last[1], 0], [q[0], q[1], 0], [last[0], q[1], 0]], closed: true }]), 'Rectangle'); setPts([]); break;
      case 'circle':
        if (!last) { setPts([q]); break; }
        onChange(addEntities(model, [{ type: 'circle', layer, c: [last[0], last[1], 0], r: Math.hypot(q[0] - last[0], q[1] - last[1]) }]), 'Circle'); setPts([]); break;
      case 'arc':
        if (pts.length < 2) { setPts([...pts, q]); break; }
        onChange(addEntities(model, [arcFrom(pts[0], pts[1], q, layer)]), 'Arc'); setPts([]); break;
      case 'dimension':
        if (pts.length < 2) { setPts([...pts, q]); break; }
        onChange(addEntities(model, [{ type: 'dimension', layer: model.layers.some(l => l.name === 'A-ANNO-DIMS') ? 'A-ANNO-DIMS' : layer, a: [pts[0][0], pts[0][1], 0], b: [pts[1][0], pts[1][1], 0], at: [q[0], q[1], 0], height: scale.textHeight, decimals: model.units === 'mm' ? 0 : 2 }]), 'Dimension'); setPts([]); break;
      case 'text': case 'roomtag': setPts([q]); setTimeout(() => cmdRef.current?.focus(), 0); break;
      case 'move': case 'copy':
        if (!selection.length) { say('Select objects first, then choose Move or Copy.'); setTool('select'); break; }
        if (!last) { setPts([q]); break; }
        { const r = moveEntities(model, selection, q[0] - last[0], q[1] - last[1], tool === 'copy'); onChange(r.model, tool === 'copy' ? 'Copy' : 'Move'); setSelection(r.selection); }
        if (tool === 'move') setTool('select'); // copy keeps placing from the same base point
        break;
      case 'rotate': case 'scale': case 'mirror':
        if (!selection.length) { say('Select objects first.'); setTool('select'); break; }
        if (!last) { setPts([q]); break; }
        if (tool === 'rotate') { const ang = Math.atan2(q[1] - last[1], q[0] - last[0]) * 180 / Math.PI; const r = transformEntities(model, selection, rotateAbout(last, ang)); onChange(r.model, 'Rotate'); setTool('select'); break; }
        if (tool === 'mirror') { const r = transformEntities(model, selection, mirrorAcross(last, q), true); onChange(r.model, 'Mirror'); setSelection(r.selection); setTool('select'); break; }
        if (pts.length === 1) { setPts([last, q]); break; } // scale: reference point
        { const ref = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); const k = ref > 0 ? Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) / ref : 1; const r = transformEntities(model, selection, scaleAbout(pts[0], k)); onChange(r.model, `Scale ×${+k.toPrecision(4)}`); setTool('select'); }
        break;
      case 'offset':
        if (offsetDist === null) { if (!last) { setPts([q]); break; } setOffsetDist(Math.hypot(q[0] - last[0], q[1] - last[1])); setPts([]); break; }
        if (offsetTarget === null) { const hit = pick(geom, q, tol, model.entities); if (hit < 0) { say('Nothing there to offset.'); break; } setOffsetTarget(hit); setSelection([hit]); break; }
        { const made = offsetEntity(model.entities[offsetTarget], offsetDist, q); if (made) onChange(addEntities(model, [made]), 'Offset'); else say('That object cannot be offset that way.'); setOffsetTarget(null); setSelection([]); }
        break;
      case 'wall':
        if (last) onChange(addEntities(withLayer(model, 'A-WALL'), wallsFrom([last, q], wallT, 2700 * unitsPerMm, 'A-WALL', unitsPerMm)), 'Wall');
        else setWallStart(q);
        setPts([q]); break;
      case 'trim': { const hit = pick(geom, q, tol, model.entities); if (hit < 0) { say('Nothing there.'); break; } const r = trimEntity(model, hit, q); if (r) onChange(r, 'Trim'); else say('Nothing crosses that part, or it is not a line, circle or arc.'); break; }
      case 'extend': { const hit = pick(geom, q, tol, model.entities); if (hit < 0) { say('Nothing there.'); break; } const r = extendEntity(model, hit, q); if (r) onChange(r, 'Extend'); else say('Nothing to extend to in that direction.'); break; }
      case 'fillet': {
        const hit = pick(geom, q, tol, model.entities); if (hit < 0) { say('Pick a line or wall.'); break; }
        if (!filletFirst) { setFilletFirst({ idx: hit, p: q }); setSelection([hit]); break; }
        const r = filletEntities(model, filletFirst.idx, filletFirst.p, hit, q, filletR); if (r) onChange(r, filletR ? 'Fillet' : 'Corner'); else say('Those two cannot be filleted (parallel, or not lines/walls).');
        setFilletFirst(null); setSelection([]); break;
      }
      case 'hatch': {
        const loops = boundaryAt(model, q, hiddenLayers); if (!loops) { say('No closed shape around that point.'); break; }
        onChange(addEntities(model, [{ type: 'hatch', layer: currentLayer, loops, pattern: hatchPat, solid: hatchPat === 'SOLID', patternScale: hatchScale, patternAngle: 0 }]), `Hatch ${hatchPat}`); break;
      }
      case 'insert':
        if (!p.placing) break;
        { const host = hostFor(q); if (host) { if (!host.next) { say('It does not fit there (too wide, or overlaps another opening).'); break; }
          const m2 = withLayer(withLayer(model, 'A-DOOR'), 'A-GLAZ'); onChange({ ...m2, entities: m2.entities.map((e, i) => i === host.index ? host.next! : e) }, `${p.placing.label} in wall`); break; } }
        onChange(insertBlock(ensureBlockAndLayer(model, p.placing.block, p.placing.layer), p.placing.block.name, q, insRot, insFlip, p.placing.layer), `Insert ${p.placing.label}`);
        break;
      case 'measure':
        if (!last) { setPts([q]); setMeasured(null); break; }
        setMeasured([last, q]); say(`Distance ${fmt(Math.hypot(q[0] - last[0], q[1] - last[1]))}  ΔX ${fmt(Math.abs(q[0] - last[0]))}  ΔY ${fmt(Math.abs(q[1] - last[1]))}`); setPts([]); break;
      default: break;
    }
  };

  const finish = () => {
    if (tool === 'wall') { setPts([]); setWallStart(null); return; }
    if (tool === 'polyline' && pts.length >= 2) onChange(addEntities(model, [{ type: 'polyline', layer: currentLayer, points: pts.map(q => [q[0], q[1], 0]), closed: false }]), 'Polyline');
    setPts([]);
  };
  const escape = () => { if (tool === 'insert') { p.onStopPlacing?.(); setTool('select'); return; } if (pts.length) setPts([]); else if (tool !== 'select') setTool('select'); else setSelection([]); setMeasured(null); setOffsetTarget(null); };
  const erase = () => { if (!selection.length) return; onChange(eraseEntities(model, selection), `Erase ${selection.length}`); setSelection([]); };

  const runCommand = (raw: string) => {
    const text = raw.trim(); if (!text) { if (tool === 'polyline' || tool === 'line' || tool === 'wall') finish(); return; }
    const upper = text.toUpperCase();
    if (tool === 'roomtag' && pts.length === 1) {
      const nums = model.entities.filter(e => e.type === 'room').map(e => parseInt((e as any).number, 10)).filter(Number.isFinite);
      const number = String(nums.length ? Math.max(...nums) + 1 : 101);
      const m2 = model.layers.some(l => l.name === 'A-ANNO-TEXT') ? model : { ...model, layers: [...model.layers, { name: 'A-ANNO-TEXT', color: '#ffffff', visible: true }] };
      onChange(addEntities(m2, [{ type: 'room', layer: 'A-ANNO-TEXT', at: [pts[0][0], pts[0][1], 0], name: text, number, height: scale.textHeight, unitsPerMm }]), `Room ${number}`); setPts([]); return;
    }
    if (tool === 'text' && pts.length === 1) {
      onChange(addEntities(model, [{ type: 'text', layer: model.layers.some(l => l.name === 'A-ANNO-TEXT') ? 'A-ANNO-TEXT' : currentLayer, at: [pts[0][0], pts[0][1], 0], height: scale.textHeight, rotation: 0, text }]), 'Text'); setPts([]); return;
    }
    if (tool === 'wall' && upper === 'C' && wallStart && last && (last[0] !== wallStart[0] || last[1] !== wallStart[1])) { onChange(addEntities(withLayer(model, 'A-WALL'), wallsFrom([last, wallStart], wallT, 2700 * unitsPerMm, 'A-WALL', unitsPerMm)), 'Wall'); setPts([]); setWallStart(null); return; }
    if (tool === 'wall' && upper === 'U') { setPts([]); return; }
    if (tool === 'fillet' && /^\d*\.?\d+$/.test(text)) { setFilletR(+text); return; }
    if ((tool === 'polyline') && upper === 'C' && pts.length >= 3) { onChange(addEntities(model, [{ type: 'polyline', layer: currentLayer, points: pts.map(q => [q[0], q[1], 0]), closed: true }]), 'Polyline'); setPts([]); return; }
    if ((tool === 'polyline' || tool === 'line') && upper === 'U' && pts.length) { setPts(pts.slice(0, -1)); return; }
    if (tool === 'wall' && /^\d*\.?\d+$/.test(text) && !pts.length) { setWallT(+text); say(`Wall thickness ${fmt(+text)}`); return; }
    if (tool === 'insert') {
      if (upper === 'R') { setInsRot(r => (r + 90) % 360); return; }
      if (upper === 'F') { setInsFlip(f => !f); return; }
      if (/^-?\d*\.?\d+$/.test(text)) { setInsRot(((+text % 360) + 360) % 360); return; }
    }
    if (tool === 'rotate' && pts.length === 1 && /^-?\d*\.?\d+$/.test(text) && selection.length) { const r = transformEntities(model, selection, rotateAbout(pts[0], +text)); onChange(r.model, 'Rotate'); setTool('select'); return; }
    if (tool === 'scale' && pts.length === 1 && /^\d*\.?\d+$/.test(text) && selection.length && +text > 0) { const r = transformEntities(model, selection, scaleAbout(pts[0], +text)); onChange(r.model, `Scale ×${text}`); setTool('select'); return; }
    if (tool === 'offset' && offsetDist === null && /^\d*\.?\d+$/.test(text) && +text > 0) { setOffsetDist(+text); setPts([]); return; }
    if (tool === 'circle' && pts.length === 1 && /^\d*\.?\d+$/.test(text)) { onChange(addEntities(model, [{ type: 'circle', layer: currentLayer, c: [pts[0][0], pts[0][1], 0], r: +text }]), 'Circle'); setPts([]); return; }
    const alias = COMMAND_ALIASES[upper];
    if (alias) {
      say(`Command: ${upper}`);
      if (alias === 'erase') erase(); else if (alias === 'undo') p.onUndo(); else if (alias === 'redo') p.onRedo(); else if (alias === 'zoom') fit(); else if (alias === 'escape') escape(); else setTool(alias);
      return;
    }
    const q = parsePointInput(text, last, cursor);
    if (q && tool !== 'select' && tool !== 'pan') { givePoint(q); return; }
    say(`Unknown command or point: ${text}`);
  };

  // ── keyboard: F-keys, Esc, Enter, Delete, Ctrl+Z/Y; letters go to the command line ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inCmd = document.activeElement === cmdRef.current;
      const inOther = !inCmd && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || (document.activeElement as HTMLElement)?.isContentEditable);
      if (inOther) return;
      if (e.key === 'F3') { e.preventDefault(); setSnaps(s => ({ ...s, osnap: !s.osnap })); return; }
      if (e.key === 'F7' || e.key === 'F9') { e.preventDefault(); setSnaps(s => ({ ...s, grid: !s.grid })); return; }
      if (e.key === 'F8') { e.preventDefault(); setSnaps(s => ({ ...s, ortho: !s.ortho })); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? p.onRedo() : p.onUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); p.onRedo(); return; }
      if (e.key === 'Escape') { e.preventDefault(); setCmd(''); escape(); cmdRef.current?.blur(); return; }
      if (inCmd) return; // the input handles Enter itself
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selection.length) { e.preventDefault(); erase(); } return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (tool === 'polyline' || tool === 'line' || tool === 'wall') finish(); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { cmdRef.current?.focus(); /* the character lands in the input */ }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── pointer ──
  const local = (e: React.PointerEvent | React.WheelEvent): P => { const r = box.current!.getBoundingClientRect(); live.current = { w: r.width, h: r.height }; return [e.clientX - r.left, e.clientY - r.top]; };
  const onWheel = (e: React.WheelEvent) => {
    const [sx, sy] = local(e); const at = toModel(sx, sy); const k = Math.exp(-e.deltaY * 0.0015);
    setView(o => { const s = Math.min(1e6, Math.max(1e-6, (o ?? v).s * k)); return { s, cx: at[0] - (sx - size.w / 2) / s, cy: at[1] + (sy - size.h / 2) / s }; });
  };
  const onDown = (e: React.PointerEvent) => {
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured (synthetic or ended touches) */ }
    const [sx, sy] = local(e); const panning = e.button === 1 || tool === 'pan';
    setDrag({ start: toModel(sx, sy), startScreen: [sx, sy], now: toModel(sx, sy), mode: panning || tool !== 'select' ? 'pan' : 'box', moved: 0, view: { cx: v.cx, cy: v.cy } });
  };
  const onMove = (e: React.PointerEvent) => {
    const [sx, sy] = local(e);
    if (drag) {
      const moved = Math.hypot(sx - drag.startScreen[0], sy - drag.startScreen[1]);
      if (drag.mode === 'pan' && (moved > 4 || tool === 'pan' || e.buttons === 4)) {
        setView({ s: v.s, cx: drag.view!.cx - (sx - drag.startScreen[0]) / v.s, cy: drag.view!.cy + (sy - drag.startScreen[1]) / v.s });
      }
      setDrag({ ...drag, now: toModel(sx, sy), moved });
      if (drag.mode === 'pan' && moved > 4) return;
    }
    const r = resolve(sx, sy); setCursor(r.p); setSnap(r.snap);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag; setDrag(null); if (!d) return;
    const [sx, sy] = local(e);
    if (d.mode === 'box' && d.moved > 4) { const sel = boxSelect(geom, d.start, toModel(sx, sy)); setSelection(e.shiftKey ? [...new Set([...selection, ...sel])] : sel); return; }
    if (d.moved > 4 || tool === 'pan' || e.button === 1) return;
    if (e.button === 2) { finish(); return; }
    if (tool === 'select') {
      const hit = pick(geom, toModel(sx, sy), tol, model.entities);
      if (hit < 0) { if (!e.shiftKey) setSelection([]); return; }
      setSelection(e.shiftKey ? (selection.includes(hit) ? selection.filter(i => i !== hit) : [...selection, hit]) : [hit]);
      return;
    }
    givePoint(resolve(sx, sy).p);
  };

  // ── preview of what the current tool would make ──
  const preview: CadEntity2D[] = useMemo(() => {
    if (!cursor) return [];
    const L = currentLayer; const c = cursor; const z = (q: P): [number, number, number] => [q[0], q[1], 0];
    if (tool === 'line' && last) return [{ type: 'line', layer: L, a: z(last), b: z(c) }];
    if (tool === 'polyline' && pts.length) return [{ type: 'polyline', layer: L, points: [...pts, c].map(z), closed: false }];
    if (tool === 'rect' && last) return [{ type: 'polyline', layer: L, points: [z(last), [c[0], last[1], 0], z(c), [last[0], c[1], 0]], closed: true }];
    if (tool === 'circle' && last) return [{ type: 'circle', layer: L, c: z(last), r: Math.hypot(c[0] - last[0], c[1] - last[1]) }, { type: 'line', layer: L, a: z(last), b: z(c) }];
    if (tool === 'arc' && pts.length === 1) return [{ type: 'line', layer: L, a: z(pts[0]), b: z(c) }];
    if (tool === 'arc' && pts.length === 2) return [arcFrom(pts[0], pts[1], c, L)];
    if (tool === 'dimension' && pts.length === 1) return [{ type: 'line', layer: L, a: z(pts[0]), b: z(c) }];
    if (tool === 'dimension' && pts.length === 2) return [{ type: 'dimension', layer: L, a: z(pts[0]), b: z(pts[1]), at: z(c), height: scale.textHeight, decimals: model.units === 'mm' ? 0 : 2 }];
    if ((tool === 'move' || tool === 'copy') && last) return selection.map(i => model.entities[i]).filter(Boolean).map(e => ({ ...moveEntities({ ...model, entities: [e] }, [0], c[0] - last[0], c[1] - last[1]).model.entities[0] }));
    if (tool === 'measure' && last) return [{ type: 'line', layer: L, a: z(last), b: z(c) }];
    const sel = { ...model, entities: selection.map(i => model.entities[i]).filter(Boolean) }; const all = sel.entities.map((_, i) => i);
    if (tool === 'rotate' && last && sel.entities.length) return [...transformEntities(sel, all, rotateAbout(last, Math.atan2(c[1] - last[1], c[0] - last[0]) * 180 / Math.PI)).model.entities, { type: 'line', layer: L, a: z(last), b: z(c) }];
    if (tool === 'mirror' && last && sel.entities.length) return [...transformEntities(sel, all, mirrorAcross(last, c)).model.entities, { type: 'line', layer: L, a: z(last), b: z(c) }];
    if (tool === 'scale' && pts.length === 2 && sel.entities.length) { const ref = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); const k = ref > 0 ? Math.hypot(c[0] - pts[0][0], c[1] - pts[0][1]) / ref : 1; return transformEntities(sel, all, scaleAbout(pts[0], k)).model.entities; }
    if (tool === 'offset' && offsetDist === null && last) return [{ type: 'line', layer: L, a: z(last), b: z(c) }];
    if (tool === 'offset' && offsetDist !== null && offsetTarget !== null) { const e = offsetEntity(model.entities[offsetTarget], offsetDist, c); return e ? [e] : []; }
    if (tool === 'wall' && last) return wallsFrom([last, c], wallT, 2700 * unitsPerMm, 'A-WALL', unitsPerMm);
    if (tool === 'insert' && p.placing) { const host = hostFor(c); if (host?.next) return [host.next]; }
    if (tool === 'insert' && p.placing) return [{ type: 'insert', layer: p.placing.layer, block: p.placing.block.name, at: z(c), scale: [insFlip ? -1 : 1, 1, 1], rotation: insRot }];
    return [];
  }, [cursor, tool, pts, last, currentLayer, selection, model, scale.textHeight, offsetDist, offsetTarget, insRot, insFlip, p.placing, wallT]);
  const previewFlat = useMemo(() => flatten2D({ entities: preview, blocks: p.placing ? [...model.blocks, p.placing.block] : model.blocks, layers: model.layers }), [preview, model.blocks, model.layers, p.placing]);
  const selectedFlat = useMemo(() => flatten2D({ entities: selection.map(i => model.entities[i]).filter(Boolean), blocks: model.blocks, layers: model.layers }), [selection, model]);
  const grips = useMemo(() => geom.filter(g => selection.includes(g.index)).flatMap(g => g.snaps.filter(s => s.kind === 'end' || s.kind === 'mid' || s.kind === 'center').map(s => s.p)).slice(0, 400), [geom, selection]);

  // Door/window marks on the plan (D01, W01) and room tag positions, from the same source as the schedules.
  const [showMarks, setShowMarks] = useState(true);
  const marks = useMemo(() => showMarks ? collectOpenings(model).map(o => { const w = o.wallIndex !== undefined ? model.entities[o.wallIndex] : null; const off = w && w.type === 'wall' ? w.thickness * 2.2 : 0; const ux = w && w.type === 'wall' ? (w.b[0] - w.a[0]) : 1, uy = w && w.type === 'wall' ? (w.b[1] - w.a[1]) : 0; const l = Math.hypot(ux, uy) || 1; const side = o.opening?.flip ? 1 : -1; return { mark: o.mark, kind: o.kind, at: [o.at[0] - uy / l * off * side, o.at[1] + ux / l * off * side] as P }; }) : [], [model, showMarks]);
  // Selection summary for the status bar (length, area: quick takeoff).
  const selInfo = useMemo(() => {
    if (!selection.length) return '';
    let len = 0, area = 0, nl = 0, na = 0;
    for (const i of selection) { const m = measureEntity(model.entities[i]); if (m.length !== undefined) { len += m.length; nl++; } if (m.area !== undefined) { area += m.area; na++; } }
    return `${selection.length} selected${nl ? ` · length ${fmt(len)}` : ''}${na ? ` · area ${fmtArea(area)}` : ''}`;
  }, [selection, model, fmt, fmtArea]);

  const pathD = (pts2: Array<[number, number]>, closed: boolean) => pts2.map((q, i) => { const s = toScreen(q); return `${i ? 'L' : 'M'}${s[0].toFixed(1)} ${s[1].toFixed(1)}`; }).join('') + (closed ? 'Z' : '');
  const imgPos = toScreen([frame.x0, frame.y1]);
  const gridLines = useMemo(() => {
    if (!snaps.grid || !view) return null; const gs = snaps.gridSize; if (gs * v.s < 6) return null;
    const a = toModel(0, size.h), b = toModel(size.w, 0); const out: React.ReactNode[] = [];
    for (let x = Math.ceil(a[0] / gs) * gs; x <= b[0] && out.length < 400; x += gs) { const s = toScreen([x, 0]); out.push(<line key={`x${x}`} x1={s[0]} x2={s[0]} y1={0} y2={size.h} stroke="rgba(255,255,255,.05)"/>); }
    for (let y = Math.ceil(a[1] / gs) * gs; y <= b[1] && out.length < 800; y += gs) { const s = toScreen([0, y]); out.push(<line key={`y${y}`} y1={s[1]} y2={s[1]} x1={0} x2={size.w} stroke="rgba(255,255,255,.05)"/>); }
    return out;
  }, [snaps.grid, snaps.gridSize, view, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const cursorStyle = tool === 'pan' || drag?.mode === 'pan' && (drag?.moved ?? 0) > 4 ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair';

  return <div className="absolute inset-0 flex flex-col">
    {/* tool strip */}
    <div className="flex items-center gap-1 px-2 h-10 shrink-0 overflow-x-auto cad-bar" style={{ borderBottom: '1px solid rgba(255,255,255,.08)', background: '#121019' }} data-testid="cad-draft-tools">
      {TOOLS.map(t => { const I = t.icon; return <button key={t.id} title={`${t.label} (${t.key})`} aria-label={t.label} onClick={() => setTool(t.id)} data-testid={`cad-tool-${t.id}`} className={`cad-btn${tool === t.id ? ' cad-on' : ''}`} style={{ height: 30, padding: '0 8px' }}><I size={14}/></button>; })}
      <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,.1)' }}/>
      <button className="cad-btn" style={{ height: 30, padding: '0 8px' }} title="Erase (Delete)" aria-label="Erase" onClick={erase} disabled={!selection.length}><Trash2 size={14}/></button>
      <button className="cad-btn" style={{ height: 30, padding: '0 8px' }} title="Undo (Ctrl+Z)" aria-label="Undo" onClick={p.onUndo}><Undo2 size={14}/></button>
      <button className="cad-btn" style={{ height: 30, padding: '0 8px' }} title="Redo (Ctrl+Y)" aria-label="Redo" onClick={p.onRedo}><Redo2 size={14}/></button>
      <button className="cad-btn" style={{ height: 30, padding: '0 8px' }} title="Zoom extents (Z)" aria-label="Zoom extents" onClick={fit}><Maximize size={14}/></button>
      {tool === 'wall' && <label className="flex items-center gap-1 text-[11px] ml-2 shrink-0" style={{ color: 'rgba(255,255,255,.6)' }}>Thickness<input type="number" step="any" min={0} value={+wallT.toPrecision(6)} onChange={e => setWallT(Math.max(0.001, +e.target.value || 0))} className="w-16 h-6 rounded bg-white/5 border border-white/10 px-1 text-white text-right" aria-label="Wall thickness" data-testid="cad-wall-thickness"/></label>}
      {tool === 'fillet' && <label className="flex items-center gap-1 text-[11px] ml-2 shrink-0" style={{ color: 'rgba(255,255,255,.6)' }}>Radius<input type="number" step="any" min={0} value={filletR} onChange={e => setFilletR(Math.max(0, +e.target.value || 0))} className="w-16 h-6 rounded bg-white/5 border border-white/10 px-1 text-white text-right" aria-label="Fillet radius"/></label>}
      {tool === 'hatch' && <><select value={hatchPat} onChange={e => setHatchPat(e.target.value)} className="ml-2 h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white shrink-0" aria-label="Hatch pattern" data-testid="cad-hatch-pattern">{HATCH_PATTERNS.map(h => <option key={h} value={h} style={{ background: '#15131d' }}>{HATCH_LABELS[h]}</option>)}</select>
        {hatchPat !== 'SOLID' && <label className="flex items-center gap-1 text-[11px] ml-1 shrink-0" style={{ color: 'rgba(255,255,255,.6)' }}>Scale<input type="number" step="any" min={0} value={hatchScale} onChange={e => setHatchScale(Math.max(0.01, +e.target.value || 1))} className="w-14 h-6 rounded bg-white/5 border border-white/10 px-1 text-white text-right" aria-label="Hatch scale"/></label>}</>}
    </div>

    {/* canvas */}
    <div ref={box} className="flex-1 min-h-0 relative overflow-hidden select-none" style={{ background: '#0a0a0e', cursor: cursorStyle, touchAction: 'none' }}
      onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { setCursor(null); setSnap(null); }} onContextMenu={e => e.preventDefault()} data-testid="cad-drawing" data-view={view ? `${view.cx},${view.cy},${view.s}` : undefined}>
      <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h}>{gridLines}</svg>
      <img src={url} alt={model.name} draggable={false} className="absolute pointer-events-none" style={{ left: imgPos[0], top: imgPos[1], width: frame.spanX * v.s, height: frame.spanY * v.s, maxWidth: 'none' }}/>
      <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h}>
        {selectedFlat.paths.map((q, i) => <path key={`s${i}`} d={pathD(q.pts, q.closed)} fill="none" stroke={SEL} strokeWidth={2} strokeDasharray="6 4"/>)}
        {grips.map((g, i) => { const s = toScreen(g); return <rect key={`g${i}`} x={s[0] - 4} y={s[1] - 4} width={8} height={8} fill={SEL} stroke="#fff" strokeWidth={0.5}/>; })}
        {previewFlat.paths.map((q, i) => <path key={`p${i}`} d={pathD(q.pts, q.closed)} fill="none" stroke={ACCENT} strokeWidth={1.4} strokeDasharray={tool === 'move' || tool === 'copy' ? '5 4' : undefined}/>)}
        {previewFlat.texts.map((t, i) => { const s = toScreen(t.at); return <text key={`t${i}`} x={s[0]} y={s[1]} fill={ACCENT} fontSize={Math.max(9, t.height * v.s)} textAnchor="middle" transform={t.rotation ? `rotate(${-t.rotation} ${s[0]} ${s[1]})` : undefined}>{t.text}</text>; })}
        {pts.map((q, i) => { const s = toScreen(q); return <circle key={`v${i}`} cx={s[0]} cy={s[1]} r={3} fill={ACCENT}/>; })}
        {measured && (() => { const a = toScreen(measured[0]), b = toScreen(measured[1]); return <g><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={WARM} strokeWidth={1.5}/><circle cx={a[0]} cy={a[1]} r={3.5} fill={WARM}/><circle cx={b[0]} cy={b[1]} r={3.5} fill={WARM}/></g>; })()}
        {drag?.mode === 'box' && drag.moved > 4 && (() => { const a = toScreen(drag.start), b = toScreen(drag.now); const crossing = b[0] < a[0]; return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill={crossing ? 'rgba(52,211,153,.08)' : 'rgba(59,130,246,.1)'} stroke={crossing ? '#34d399' : SEL} strokeDasharray={crossing ? '5 4' : undefined}/>; })()}
        {marks.map(mk => { const sp = toScreen(mk.at); return <g key={mk.mark}><rect x={sp[0] - 15} y={sp[1] - 8} width={30} height={15} rx={7} fill="rgba(10,10,14,.85)" stroke={mk.kind === 'door' ? '#00ff00' : '#00ffff'} strokeWidth={0.8}/><text x={sp[0]} y={sp[1] + 3.5} fontSize={9} textAnchor="middle" fill={mk.kind === 'door' ? '#86efac' : '#a5f3fc'}>{mk.mark}</text></g>; })}
        {(p.findings ?? []).map((f, i) => { const sp = toScreen(f.at); const col = f.status === 'fail' ? '#f87171' : f.status === 'warn' ? '#fbbf24' : '#34d399'; return f.status === 'pass'
          ? <circle key={`f${i}`} cx={sp[0] + 10} cy={sp[1] - 10} r={3.5} fill={col} opacity={0.85}><title>{`${f.title}: ${f.detail}`}</title></circle>
          : <g key={`f${i}`}><circle cx={sp[0] + 12} cy={sp[1] - 12} r={8} fill={col}/><text x={sp[0] + 12} y={sp[1] - 8.5} fontSize={11} fontWeight={700} textAnchor="middle" fill="#111">!</text><title>{`${f.title}: ${f.detail} (${f.citation})`}</title></g>; })}
        {snap && cursor && <SnapGlyph at={toScreen(snap.p)} kind={snap.kind}/>}
      </svg>
      {measured && <div className="absolute pointer-events-none px-2 py-1 rounded-md text-[12px] font-bold" data-testid="cad-measure-label" style={(() => { const a = toScreen(measured[0]), b = toScreen(measured[1]); return { left: (a[0] + b[0]) / 2 + 8, top: (a[1] + b[1]) / 2 - 28, background: 'rgba(20,16,8,.92)', color: WARM, border: '1px solid rgba(255,176,32,.4)' }; })()}>{fmt(Math.hypot(measured[1][0] - measured[0][0], measured[1][1] - measured[0][1]))}</div>}
      {snap && cursor && <div className="absolute pointer-events-none text-[10px] px-1.5 py-0.5 rounded" style={{ left: toScreen(snap.p)[0] + 12, top: toScreen(snap.p)[1] + 10, background: 'rgba(0,0,0,.75)', color: WARM }}>{SNAP_LABEL[snap.kind]}</div>}
    </div>

    {/* command line + status bar */}
    <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,.08)', background: '#0f0d15' }}>
      {history.length > 0 && <div className="px-3 pt-1 text-[11px] font-mono" style={{ color: 'rgba(255,255,255,.45)' }}>{history.slice(-2).map((h, i) => <div key={i} className="truncate">{h}</div>)}</div>}
      <form className="flex items-center gap-2 px-3 h-8" onSubmit={e => { e.preventDefault(); runCommand(cmd); setCmd(''); }}>
        <span className="text-[11px] font-mono shrink-0 truncate max-w-[55%]" style={{ color: ACCENT }} data-testid="cad-prompt">{prompt}:</span>
        <input ref={cmdRef} value={cmd} onChange={e => setCmd(e.target.value)} className="flex-1 min-w-0 bg-transparent outline-none text-[12px] font-mono text-white" placeholder="type a command (L, PL, C…) or a point (1200,300  @500,0  @1000<90  2500)" aria-label="Command line" data-testid="cad-command"/>
      </form>
      <div className="flex items-center gap-1.5 px-3 h-7 text-[10px] overflow-x-auto cad-bar" style={{ color: 'rgba(255,255,255,.55)', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <span className="font-mono shrink-0 w-44" data-testid="cad-coords">{cursor ? `${fmt(cursor[0])}, ${fmt(cursor[1])}` : ' '}</span>
        {([['osnap', 'OSNAP', 'F3'], ['ortho', 'ORTHO', 'F8'], ['grid', 'GRID', 'F7']] as const).map(([k, label, key]) => <button key={k} title={`${label} (${key})`} onClick={() => setSnaps(s => ({ ...s, [k]: !s[k] }))} className="px-1.5 h-5 rounded font-bold shrink-0" style={{ background: snaps[k] ? 'rgba(125,211,252,.16)' : 'transparent', color: snaps[k] ? ACCENT : 'rgba(255,255,255,.4)' }} data-testid={`cad-toggle-${k}`}>{label}</button>)}
        <button onClick={() => setShowMarks(x => !x)} className="px-1.5 h-5 rounded font-bold shrink-0" style={{ background: showMarks ? 'rgba(125,211,252,.16)' : 'transparent', color: showMarks ? ACCENT : 'rgba(255,255,255,.4)' }} title="Door and window marks">MARKS</button>
        {p.onToggleChecks && <button onClick={p.onToggleChecks} className="px-1.5 h-5 rounded font-bold shrink-0" style={{ background: p.showChecks ? 'rgba(125,211,252,.16)' : 'transparent', color: p.failCount ? '#f87171' : p.showChecks ? ACCENT : 'rgba(255,255,255,.4)' }} title="Accessibility pre-check markers" data-testid="cad-toggle-checks">CHECKS{p.failCount ? ` ${p.failCount}` : ''}</button>}
        <span className="shrink-0 ml-2">Layer</span>
        <select value={selection.length ? (model.entities[selection[0]]?.layer ?? currentLayer) : currentLayer} onChange={e => p.onSetLayer(e.target.value)} className="h-5 rounded bg-white/5 border border-white/10 text-[10px] text-white shrink-0" aria-label="Layer" data-testid="cad-layer-select">
          {p.layers.map(l => <option key={l} value={l} style={{ background: '#15131d' }}>{l}</option>)}
        </select>
        <span className="ml-auto shrink-0" data-testid="cad-sel-info">{selInfo}</span>
      </div>
    </div>
  </div>;
}

function SnapGlyph({ at, kind }: { at: P; kind: Snap['kind'] }) {
  const [x, y] = at; const s = 6; const st = { fill: 'none', stroke: WARM, strokeWidth: 1.6 };
  switch (kind) {
    case 'end': return <rect x={x - s} y={y - s} width={2 * s} height={2 * s} {...st}/>;
    case 'mid': return <path d={`M${x} ${y - s}L${x + s} ${y + s}L${x - s} ${y + s}Z`} {...st}/>;
    case 'center': return <circle cx={x} cy={y} r={s} {...st}/>;
    case 'quad': return <path d={`M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`} {...st}/>;
    case 'intersection': return <path d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`} {...st}/>;
    case 'perp': return <path d={`M${x - s} ${y + s}L${x + s} ${y + s}M${x} ${y + s}L${x} ${y - s}`} {...st}/>;
    case 'grid': return <path d={`M${x - s} ${y}L${x + s} ${y}M${x} ${y - s}L${x} ${y + s}`} {...st}/>;
    default: return <circle cx={x} cy={y} r={s / 2} {...st}/>;
  }
}

