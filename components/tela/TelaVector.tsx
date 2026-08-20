/**
 * TelaVector — the vector-design device (P2). A real, functional editor
 * rendered as SVG, so every object (and TEXT via <text>) is resolution
 * independent — razor-sharp at any zoom. That satisfies the sharp-text mandate
 * for the DOM/SVG postures.
 *
 * NOTE: the WGSL / Slug analytic-curve text engine (spec §04 — "GPU postures &
 * deep zoom") is a LATER dedicated push. SVG <text> already renders tack-sharp
 * under continuous zoom for these postures, so P2 ships SVG and defers the
 * curve engine rather than half-building it here.
 *
 * Objects: RECT | ELLIPSE | LINE | PATH (pen/polyline) | TEXT. Every mutation is
 * ops-shaped through the parent (add / update / delete / reorder), ids stable,
 * so multiplayer later is an op-log change. A TEXT object may be bound to a
 * Writer device (boundWriterDeviceId) and renders that Writer's text live — the
 * binding-graph "text" edge; the object's own text is a never-destroyed
 * fallback.
 */
import React, { useRef, useState } from 'react';
import {
  MousePointer2, Square, Circle, Minus, PenTool, Type,
  ChevronUp, ChevronDown, Trash2, Link2, Unlink,
} from 'lucide-react';
import type { TelaVectorDevice, TelaVectorObject, TelaVectorObjectKind } from '../../types';

export type VectorTool = 'select' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text';

const newObjId = () => `obj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Axis-aligned bounds for any object (box kinds direct; line/path from points). */
export function objBounds(o: TelaVectorObject): { x: number; y: number; w: number; h: number } {
  if ((o.kind === 'LINE' || o.kind === 'PATH') && o.points && o.points.length >= 2) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      minX = Math.min(minX, o.points[i]); maxX = Math.max(maxX, o.points[i]);
      minY = Math.min(minY, o.points[i + 1]); maxY = Math.max(maxY, o.points[i + 1]);
    }
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function makeObject(kind: TelaVectorObjectKind, x: number, y: number): TelaVectorObject {
  const base: TelaVectorObject = {
    id: newObjId(), kind, x, y, w: 0, h: 0,
    fill: kind === 'LINE' || kind === 'PATH' ? 'none' : (kind === 'TEXT' ? '#1B1523' : '#6B0099'),
    stroke: kind === 'TEXT' ? 'none' : '#120D1C',
    strokeWidth: kind === 'TEXT' ? 0 : (kind === 'LINE' || kind === 'PATH' ? 3 : 1.5),
    rotation: 0, opacity: 1,
  };
  if (kind === 'TEXT') {
    base.w = 260; base.h = 48; base.text = 'Text';
    base.fontSize = 34; base.fontFamily = 'system-ui, sans-serif'; base.fontWeight = 700;
    base.fill = '#1B1523';
  }
  if (kind === 'LINE') base.points = [x, y, x, y];
  return base;
}

// ── One rendered object ───────────────────────────────────────────────────────

function textLines(o: TelaVectorObject, writerTexts?: Record<string, string>): string[] {
  const bound = o.boundWriterDeviceId ? writerTexts?.[o.boundWriterDeviceId] : undefined;
  const src = (bound !== undefined && bound !== '') ? bound : (o.text ?? '');
  return src.split('\n');
}

const ObjectEl: React.FC<{
  o: TelaVectorObject;
  writerTexts?: Record<string, string>;
  interactive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}> = ({ o, writerTexts, interactive, onPointerDown }) => {
  const b = objBounds(o);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const common: React.SVGProps<any> = {
    fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, opacity: o.opacity,
    transform: o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined,
    onPointerDown, style: { cursor: interactive ? 'move' : 'default' },
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  if (o.kind === 'RECT') return <rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={Math.max(0, o.h)} rx={2} {...common} />;
  if (o.kind === 'ELLIPSE') return <ellipse cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={Math.max(0, o.w / 2)} ry={Math.max(0, o.h / 2)} {...common} />;
  if (o.kind === 'LINE' && o.points) return <line x1={o.points[0]} y1={o.points[1]} x2={o.points[2]} y2={o.points[3]} {...common} />;
  if (o.kind === 'PATH' && o.points) {
    const pts = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(`${o.points[i]},${o.points[i + 1]}`);
    return <polyline points={pts.join(' ')} {...common} />;
  }
  if (o.kind === 'TEXT') {
    const size = o.fontSize || 24;
    const lines = textLines(o, writerTexts);
    return (
      <text
        x={o.x} y={o.y + size} fill={o.fill} opacity={o.opacity}
        fontSize={size} fontFamily={o.fontFamily || 'system-ui, sans-serif'} fontWeight={o.fontWeight || 400}
        transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined}
        onPointerDown={onPointerDown} style={{ cursor: interactive ? 'move' : 'default', userSelect: 'none' }}
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={o.x} dy={i === 0 ? 0 : size * 1.22}>{ln === '' ? ' ' : ln}</tspan>
        ))}
      </text>
    );
  }
  return null;
};

// ── Object properties (reused by the inline popover AND the Studio panel) ─────

export const TelaVectorObjectProps: React.FC<{
  object: TelaVectorObject;
  writers?: { id: string; name: string }[];
  onUpdate: (patch: Partial<TelaVectorObject>) => void;
  onDelete: () => void;
  onForward: () => void;
  onBack: () => void;
  compact?: boolean;
}> = ({ object: o, writers, onUpdate, onDelete, onForward, onBack, compact }) => {
  const isText = o.kind === 'TEXT';
  const isLine = o.kind === 'LINE' || o.kind === 'PATH';
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
  const rowCls = 'flex items-center gap-2 mb-2';
  const numStyle: React.CSSProperties = { width: 56, height: 28, padding: '0 7px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none' };
  const swatch: React.CSSProperties = { width: 30, height: 28, padding: 0, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 7, background: 'transparent', cursor: 'pointer' };
  return (
    <div style={{ color: '#fff' }}>
      {isText && (
        <div style={{ marginBottom: 10 }}>
          <div style={lbl}>Text</div>
          <textarea
            value={o.text ?? ''}
            onChange={e => onUpdate({ text: e.target.value })}
            rows={2}
            disabled={!!o.boundWriterDeviceId}
            placeholder={o.boundWriterDeviceId ? 'Bound to a Writer — edit it there' : 'Type…'}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.boundWriterDeviceId ? 'rgba(255,255,255,0.45)' : '#fff', fontSize: 12.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
          />
          {writers && writers.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={lbl}>Bind to Writer <span style={{ color: 'var(--pj-cyan,#00DAF3)' }}>· live</span></div>
              <div className="flex items-center gap-2">
                <select
                  value={o.boundWriterDeviceId || ''}
                  onChange={e => onUpdate({ boundWriterDeviceId: e.target.value || undefined })}
                  style={{ flex: 1, height: 30, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,218,243,0.35)', color: '#8fe9f6', fontSize: 12, outline: 'none' }}
                >
                  <option value="">— not bound —</option>
                  {writers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {o.boundWriterDeviceId && (
                  <button title="Unbind" onClick={() => onUpdate({ boundWriterDeviceId: undefined })} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><Unlink size={14} /></button>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div>
              <div style={lbl}>Size</div>
              <input type="number" value={o.fontSize || 24} onChange={e => onUpdate({ fontSize: Math.max(4, +e.target.value || 24) })} style={numStyle} />
            </div>
            <div>
              <div style={lbl}>Weight</div>
              <select value={o.fontWeight || 400} onChange={e => onUpdate({ fontWeight: +e.target.value })} style={{ ...numStyle, width: 74 }}>
                {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className={rowCls}>
        {!isText && (
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            <input type="color" value={o.fill === 'none' ? '#000000' : o.fill} onChange={e => onUpdate({ fill: e.target.value })} style={swatch} />
            Fill
          </label>
        )}
        {isText && (
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            <input type="color" value={o.fill === 'none' ? '#000000' : o.fill} onChange={e => onUpdate({ fill: e.target.value })} style={swatch} />
            Color
          </label>
        )}
        {!isText && (
          <button title={o.fill === 'none' ? 'No fill' : 'Clear fill'} onClick={() => onUpdate({ fill: o.fill === 'none' ? '#6B0099' : 'none' })} style={{ fontSize: 10, fontWeight: 700, padding: '4px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.fill === 'none' ? 'var(--pj-cyan,#00DAF3)' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>none</button>
        )}
      </div>

      {!isText && (
        <div className={rowCls}>
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            <input type="color" value={o.stroke === 'none' ? '#000000' : o.stroke} onChange={e => onUpdate({ stroke: e.target.value })} style={swatch} />
            Stroke
          </label>
          <input type="number" min={0} step={0.5} value={o.strokeWidth} onChange={e => onUpdate({ strokeWidth: Math.max(0, +e.target.value || 0) })} style={numStyle} title="Stroke width" />
          <button title={o.stroke === 'none' ? 'No stroke' : 'Clear stroke'} onClick={() => onUpdate({ stroke: o.stroke === 'none' ? '#120D1C' : 'none' })} style={{ fontSize: 10, fontWeight: 700, padding: '4px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.stroke === 'none' ? 'var(--pj-cyan,#00DAF3)' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>none</button>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={lbl}>Opacity {Math.round(o.opacity * 100)}%</div>
        <input type="range" min={0} max={1} step={0.01} value={o.opacity} onChange={e => onUpdate({ opacity: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
      </div>
      {!isLine && (
        <div style={{ marginBottom: 8 }}>
          <div style={lbl}>Rotation {Math.round(o.rotation)}°</div>
          <input type="range" min={-180} max={180} step={1} value={o.rotation} onChange={e => onUpdate({ rotation: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
        </div>
      )}

      <div className="flex items-center gap-1.5" style={{ marginTop: compact ? 6 : 10 }}>
        <button title="Bring forward" onClick={onForward} className="flex-1" style={{ display: 'grid', placeItems: 'center', height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><ChevronUp size={15} /></button>
        <button title="Send back" onClick={onBack} className="flex-1" style={{ display: 'grid', placeItems: 'center', height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><ChevronDown size={15} /></button>
        <button title="Delete object" onClick={onDelete} style={{ display: 'grid', placeItems: 'center', width: 44, height: 30, borderRadius: 8, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: '#fda4a4', cursor: 'pointer' }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
};

// ── The device ────────────────────────────────────────────────────────────────

interface TelaVectorProps {
  device: TelaVectorDevice;
  readOnly?: boolean;
  /** Studio drives tool/selection + hides internal chrome; default = self-managed. */
  chrome?: boolean;
  tool?: VectorTool;
  onToolChange?: (t: VectorTool) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  writerTexts?: Record<string, string>;
  writers?: { id: string; name: string }[];
  onAddObject: (object: TelaVectorObject) => void;
  onUpdateObject: (objectId: string, patch: Partial<TelaVectorObject>) => void;
  onDeleteObject: (objectId: string) => void;
  onReorder: (objectId: string, toIndex: number) => void;
}

const TOOLS: { id: VectorTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={15} />, label: 'Select' },
  { id: 'rect', icon: <Square size={15} />, label: 'Rectangle' },
  { id: 'ellipse', icon: <Circle size={15} />, label: 'Ellipse' },
  { id: 'line', icon: <Minus size={15} />, label: 'Line' },
  { id: 'pen', icon: <PenTool size={15} />, label: 'Pen / polyline' },
  { id: 'text', icon: <Type size={15} />, label: 'Text' },
];

const TelaVector: React.FC<TelaVectorProps> = (props) => {
  const {
    device, readOnly, chrome = true, writerTexts, writers,
    onAddObject, onUpdateObject, onDeleteObject, onReorder,
  } = props;

  // Controlled / uncontrolled tool + selection.
  const [toolI, setToolI] = useState<VectorTool>('select');
  const tool = props.tool ?? toolI;
  const setTool = (t: VectorTool) => { setToolI(t); props.onToolChange?.(t); };
  const [selI, setSelI] = useState<string | null>(null);
  const selectedId = props.selectedId !== undefined ? props.selectedId : selI;
  const select = (id: string | null) => { setSelI(id); props.onSelect?.(id); };

  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<TelaVectorObject | null>(null);
  const [penPts, setPenPts] = useState<number[] | null>(null);
  const drag = useRef<
    | { mode: 'create'; startX: number; startY: number }
    | { mode: 'move'; id: string; startX: number; startY: number; ox: number; oy: number; opoints?: number[] }
    | { mode: 'resize'; id: string; handle: string; }
    | { mode: 'linept'; id: string; idx: number }
    | null
  >(null);

  const selected = device.objects.find(o => o.id === selectedId) || null;

  const svgPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // ── Background pointer: create tools + deselect ──
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    const p = svgPoint(e);
    if (tool === 'select') { select(null); return; }
    if (tool === 'pen') {
      setPenPts(prev => prev ? [...prev, p.x, p.y] : [p.x, p.y]);
      return;
    }
    if (tool === 'text') {
      const o = makeObject('TEXT', p.x, p.y - 24);
      onAddObject(o); select(o.id); setTool('select');
      return;
    }
    // rect / ellipse / line — start a drag-draft.
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const kind: TelaVectorObjectKind = tool === 'rect' ? 'RECT' : tool === 'ellipse' ? 'ELLIPSE' : 'LINE';
    setDraft(makeObject(kind, p.x, p.y));
    drag.current = { mode: 'create', startX: p.x, startY: p.y };
  };

  const onObjectPointerDown = (e: React.PointerEvent, id: string) => {
    if (readOnly) return;
    if (tool !== 'select') return; // let the bg handle creation tools
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    select(id);
    const o = device.objects.find(x => x.id === id);
    if (!o) return;
    const p = svgPoint(e);
    drag.current = { mode: 'move', id, startX: p.x, startY: p.y, ox: o.x, oy: o.y, opoints: o.points ? [...o.points] : undefined };
  };

  const onHandlePointerDown = (e: React.PointerEvent, handle: string) => {
    if (readOnly || !selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'resize', id: selected.id, handle };
  };
  const onLinePtPointerDown = (e: React.PointerEvent, idx: number) => {
    if (readOnly || !selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'linept', id: selected.id, idx };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = svgPoint(e);
    if (d.mode === 'create' && draft) {
      if (draft.kind === 'LINE') {
        setDraft({ ...draft, points: [d.startX, d.startY, p.x, p.y] });
      } else {
        const x = Math.min(d.startX, p.x), y = Math.min(d.startY, p.y);
        setDraft({ ...draft, x, y, w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY) });
      }
    } else if (d.mode === 'move') {
      const dx = p.x - d.startX, dy = p.y - d.startY;
      if (d.opoints) {
        onUpdateObject(d.id, { points: d.opoints.map((v, i) => i % 2 === 0 ? v + dx : v + dy) });
      } else {
        onUpdateObject(d.id, { x: d.ox + dx, y: d.oy + dy });
      }
    } else if (d.mode === 'resize') {
      const o = device.objects.find(x => x.id === d.id); if (!o) return;
      let { x, y, w, h } = o;
      if (d.handle.includes('w')) { w = (x + w) - p.x; x = p.x; }
      if (d.handle.includes('e')) { w = p.x - x; }
      if (d.handle.includes('n')) { h = (y + h) - p.y; y = p.y; }
      if (d.handle.includes('s')) { h = p.y - y; }
      onUpdateObject(d.id, { x, y, w: Math.max(2, w), h: Math.max(2, h) });
    } else if (d.mode === 'linept') {
      const o = device.objects.find(x => x.id === d.id); if (!o || !o.points) return;
      const pts = [...o.points]; pts[d.idx * 2] = p.x; pts[d.idx * 2 + 1] = p.y;
      onUpdateObject(d.id, { points: pts });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d?.mode === 'create' && draft) {
      // Ignore zero-size clicks.
      const bounds = objBounds(draft);
      if (bounds.w >= 3 || bounds.h >= 3 || draft.kind === 'LINE') {
        onAddObject(draft); select(draft.id); setTool('select');
      }
      setDraft(null);
    }
    drag.current = null;
  };

  const finishPen = () => {
    if (penPts && penPts.length >= 4) {
      const b = { x: Math.min(...penPts.filter((_, i) => i % 2 === 0)), y: Math.min(...penPts.filter((_, i) => i % 2 === 1)) };
      const o: TelaVectorObject = { ...makeObject('PATH', b.x, b.y), points: penPts };
      onAddObject(o); select(o.id);
    }
    setPenPts(null);
    setTool('select');
  };

  // ── z-order ──
  const reorder = (id: string, dir: 1 | -1) => {
    const i = device.objects.findIndex(o => o.id === id);
    if (i < 0) return;
    onReorder(id, Math.max(0, Math.min(device.objects.length - 1, i + dir)));
  };

  const selBounds = selected ? objBounds(selected) : null;
  const handles = selBounds
    ? [
        { k: 'nw', x: selBounds.x, y: selBounds.y },
        { k: 'ne', x: selBounds.x + selBounds.w, y: selBounds.y },
        { k: 'sw', x: selBounds.x, y: selBounds.y + selBounds.h },
        { k: 'se', x: selBounds.x + selBounds.w, y: selBounds.y + selBounds.h },
      ]
    : [];

  return (
    <div className="tela-vector" style={{ position: 'relative', width: device.width, height: device.height, background: '#fff' }}>
      {/* Internal tool palette — hidden when Studio drives the tool. */}
      {chrome && !readOnly && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, display: 'flex', gap: 2, padding: 3, background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, backdropFilter: 'blur(6px)' }}
        >
          {TOOLS.map(t => (
            <button
              key={t.id} title={t.label}
              onClick={() => { setTool(t.id); if (t.id !== 'pen') setPenPts(null); }}
              style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', color: tool === t.id ? '#fff' : 'rgba(255,255,255,0.55)', background: tool === t.id ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' : 'transparent' }}
            >
              {t.icon}
            </button>
          ))}
        </div>
      )}

      {/* Pen hint */}
      {chrome && penPts && (
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 46, left: 8, zIndex: 4, display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(0,218,243,0.4)', borderRadius: 9, color: '#8fe9f6', fontSize: 11, fontWeight: 700 }}>
          {penPts.length / 2} pts · click to add
          <button onClick={finishPen} style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--pj-cyan,#00DAF3)', color: '#062', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Finish</button>
          <button onClick={() => { setPenPts(null); setTool('select'); }} style={{ padding: '2px 6px', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer' }}>Esc</button>
        </div>
      )}

      <svg
        ref={svgRef}
        width={device.width}
        height={device.height}
        viewBox={`0 0 ${device.width} ${device.height}`}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => { if (penPts) finishPen(); }}
      >
        {/* Artboard background — captures create/deselect pointers. */}
        <rect x={0} y={0} width={device.width} height={device.height} fill="#FFFFFF" onPointerDown={onBgPointerDown} />

        {device.objects.map(o => (
          <ObjectEl
            key={o.id} o={o} writerTexts={writerTexts}
            interactive={!readOnly && tool === 'select'}
            onPointerDown={readOnly ? undefined : e => onObjectPointerDown(e, o.id)}
          />
        ))}

        {/* Draft preview */}
        {draft && <ObjectEl o={{ ...draft, opacity: 0.7 }} interactive={false} />}

        {/* Pen in-progress polyline */}
        {penPts && penPts.length >= 2 && (
          <polyline
            points={penPts.reduce((a: string[], _, i) => (i % 2 === 0 ? [...a, `${penPts[i]},${penPts[i + 1]}`] : a), []).join(' ')}
            fill="none" stroke="var(--pj-cyan,#00DAF3)" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Selection outline + handles */}
        {selBounds && !readOnly && tool === 'select' && (
          <g>
            <rect x={selBounds.x} y={selBounds.y} width={selBounds.w} height={selBounds.h}
              fill="none" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {selected && (selected.kind === 'LINE') && selected.points
              ? [0, 1].map(i => (
                  <rect key={i} x={selected.points![i * 2] - 5} y={selected.points![i * 2 + 1] - 5} width={10} height={10}
                    fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'crosshair' }} onPointerDown={e => onLinePtPointerDown(e, i)} />
                ))
              : selected && selected.kind !== 'PATH' && handles.map(h => (
                  <rect key={h.k} x={h.x - 5} y={h.y - 5} width={10} height={10}
                    fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    style={{ cursor: h.k === 'nw' || h.k === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={e => onHandlePointerDown(e, h.k)} />
                ))}
          </g>
        )}
      </svg>

      {/* Inline properties popover — hidden when Studio hosts the panel. */}
      {chrome && !readOnly && selected && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 4, width: 232, padding: 12, background: 'rgba(18,13,28,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, backdropFilter: 'blur(8px)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>{selected.kind}</div>
          <TelaVectorObjectProps
            object={selected} writers={writers}
            onUpdate={patch => onUpdateObject(selected.id, patch)}
            onDelete={() => { onDeleteObject(selected.id); select(null); }}
            onForward={() => reorder(selected.id, 1)}
            onBack={() => reorder(selected.id, -1)}
          />
        </div>
      )}
    </div>
  );
};

export default TelaVector;
