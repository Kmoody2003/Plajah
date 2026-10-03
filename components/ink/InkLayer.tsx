import React, { useEffect, useRef } from 'react';
import type { TelaVectorObject } from '../../types';
import { chaikin, simplify, widthFor, flatten, avgPressure, boundsOf, strokeNear, TOOL_LOOK, type InkPoint, type InkStyle, type Box } from '../../services/inkMath';

/**
 * Captures pen, finger and mouse input over a notebook page and turns it into Tela vector PATH
 * objects. Samsung-Notes behaviour: once a stylus has been seen, touch scrolls the page instead of
 * drawing (palm rejection) unless "finger draws" is on; pressure changes line width; the eraser
 * removes whole strokes it touches; the lasso selects a region.
 */
export type NoteTool = 'select' | 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'lasso' | 'text';

interface Props {
  width: number; height: number;
  tool: NoteTool; style: InkStyle; fingerDraws: boolean;
  strokes: TelaVectorObject[];
  hiddenIds: Set<string>;
  onStroke: (o: TelaVectorObject) => void;
  onErase: (ids: string[]) => void;
  onLasso: (box: Box | null) => void;
  onTap: (x: number, y: number) => void;
}

const newId = () => `ink_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const InkLayer: React.FC<Props> = ({ width, height, tool, style, fingerDraws, strokes, hiddenIds, onStroke, onErase, onLasso, onTap }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ pts: InkPoint[]; id: number } | null>(null);
  const lasso = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const penSeen = useRef(false);
  const strokesRef = useRef(strokes); strokesRef.current = strokes;

  const drawing = tool === 'pen' || tool === 'pencil' || tool === 'highlighter';
  const active = drawing || tool === 'eraser' || tool === 'lasso' || tool === 'text';

  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
    cv.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height]);

  const toPage = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvas.current!.getBoundingClientRect(); const k = r.width / width;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const clear = () => canvas.current?.getContext('2d')?.clearRect(0, 0, width, height);
  const segment = (a: InkPoint, b: InkPoint) => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = style.color; ctx.globalAlpha = TOOL_LOOK[style.tool].opacity;
    ctx.lineWidth = widthFor(style, (a.p + b.p) / 2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
  };

  // A touch is ignored for drawing when a pen has been seen and finger drawing is off.
  const accepts = (e: React.PointerEvent) => e.pointerType !== 'touch' || fingerDraws || !penSeen.current;

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') penSeen.current = true;
    if (!active || !accepts(e)) return;
    const p = toPage(e);
    if (tool === 'text') { onTap(p.x, p.y); return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (drawing) { live.current = { pts: [{ ...p, p: e.pressure || 0.5 }], id: e.pointerId }; }
    else if (tool === 'eraser') { erased.current = new Set(); eraseAt(p); }
    else if (tool === 'lasso') { lasso.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; onLasso(null); }
  };
  const eraseAt = (p: { x: number; y: number }) => {
    for (const s of strokesRef.current) if (s.kind === 'PATH' && s.points && !hiddenIds.has(s.id) && !erased.current.has(s.id) && strokeNear(s.points, p, 8)) erased.current.add(s.id);
    if (erased.current.size) onErase([...erased.current]);
  };
  const move = (e: React.PointerEvent) => {
    if (live.current && live.current.id === e.pointerId) {
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent as PointerEvent];
      const r = canvas.current!.getBoundingClientRect(); const k = r.width / width;
      for (const ev of evs) { const pt: InkPoint = { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k, p: ev.pressure || 0.5 }; const prev = live.current.pts[live.current.pts.length - 1]; live.current.pts.push(pt); segment(prev, pt); }
    } else if (tool === 'eraser' && e.buttons) { eraseAt(toPage(e)); }
    else if (lasso.current) {
      const p = toPage(e); lasso.current.x1 = p.x; lasso.current.y1 = p.y; clear();
      const ctx = canvas.current!.getContext('2d')!; const l = lasso.current;
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#00DAF3'; ctx.lineWidth = 1.5; ctx.strokeRect(Math.min(l.x0, l.x1), Math.min(l.y0, l.y1), Math.abs(l.x1 - l.x0), Math.abs(l.y1 - l.y0)); ctx.setLineDash([]);
    }
  };
  const up = (e: React.PointerEvent) => {
    if (live.current && live.current.id === e.pointerId) {
      const pts = live.current.pts; live.current = null; clear();
      const slim = chaikin(simplify(pts, 0.5), 2); const flat = flatten(slim); const b = boundsOf(flat);
      onStroke({ id: newId(), kind: 'PATH', x: b.x, y: b.y, w: b.w, h: b.h, points: flat, fill: 'none', stroke: style.color, strokeWidth: Math.round(widthFor(style, avgPressure(pts)) * 10) / 10, rotation: 0, opacity: TOOL_LOOK[style.tool].opacity } as TelaVectorObject);
    } else if (lasso.current) {
      const l = lasso.current; lasso.current = null; clear();
      const box = { x: Math.min(l.x0, l.x1), y: Math.min(l.y0, l.y1), w: Math.abs(l.x1 - l.x0), h: Math.abs(l.y1 - l.y0) };
      onLasso(box.w > 6 && box.h > 6 ? box : null);
    }
    erased.current = new Set();
  };

  return (
    <canvas ref={canvas} aria-label="Drawing surface" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      className="absolute inset-0"
      style={{ width, height, pointerEvents: active ? 'auto' : 'none', touchAction: active && (fingerDraws || !penSeen.current) && !drawing ? 'pan-x pan-y' : (drawing && fingerDraws ? 'none' : 'pan-x pan-y pinch-zoom'), cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : active ? 'crosshair' : 'default' }} />
  );
};

export default InkLayer;
