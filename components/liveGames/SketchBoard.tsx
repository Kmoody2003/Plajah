// The Sketch Rush canvas. Viewers: renders the live strokes. Drawer: captures pointer input, shows it instantly,
// and ships it to the referee as small vector batches (every ~150 ms) through useStrokeSender.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Trash2, Undo2 } from 'lucide-react';
import { CANVAS_H, CANVAS_W, PALETTE, WIDTHS, foldStrokes, type StrokeBatch, type StrokeOp } from '../../services/liveGames/core';
import { liveGame, failed } from '../../services/liveGames/client';
import { paintStrokes, type Stroke } from './sketchPaint';

// ───────────────────────────────────────────── sender (drawer only)
/** Collects the drawer's ops and posts them in order. A failed batch is retried with the same seq (the server
 *  ignores duplicates), so a flaky connection never drops or doubles a line. */
export function useStrokeSender(gid: string, round: number, serverBatches: StrokeBatch[], enabled: boolean) {
  const queue = useRef<StrokeOp[]>([]);
  const seq = useRef(0);
  const inflight = useRef(false);
  const roundRef = useRef(round);
  // Resume numbering after a reload: continue from the highest batch the server already has for this round.
  useEffect(() => { roundRef.current = round; queue.current = []; seq.current = serverBatches.reduce((m, b) => Math.max(m, b.seq), 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [round, gid]);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(async () => {
      if (inflight.current || queue.current.length === 0) return;
      inflight.current = true;
      const ops = queue.current.splice(0, 60);
      const n = ++seq.current, r = roundRef.current;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await liveGame.strokes(gid, r, n, ops);
        if (!failed(res) || res.httpStatus === 409 || res.httpStatus === 403 || res.httpStatus === 400) break;
        await new Promise(z => setTimeout(z, 300 * (attempt + 1)));
      }
      inflight.current = false;
    }, 150);
    return () => window.clearInterval(t);
  }, [enabled, gid]);

  return useCallback((op: StrokeOp) => {
    const q = queue.current, last = q[q.length - 1];
    // Merge points into the queued continuation of the same stroke instead of sending one op per sample.
    if (op.t === 's' && last && last.t === 's' && last.id === op.id && last.p.length < 400) last.p.push(...op.p);
    else q.push(op.t === 's' ? { ...op, p: [...op.p] } : op);
  }, []);
}

// ───────────────────────────────────────────── board
interface Props {
  batches: StrokeBatch[];
  /** Drawer mode: pointer input, tools, and every op goes to `send`. */
  draw?: { send: (op: StrokeOp) => void; roundKey: string };
  className?: string;
  overlay?: React.ReactNode;
}

export default function SketchBoard({ batches, draw, className = '', overlay }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  // The drawer's own picture is its local op log (instant), seeded from the server when a round starts or the page reloads.
  const local = useRef<StrokeOp[]>([]);
  const seeded = useRef('');
  const nextId = useRef(1);
  const active = useRef<{ id: number; last: [number, number] } | null>(null);
  const [, bump] = useState(0);

  if (draw && seeded.current !== draw.roundKey) {
    seeded.current = draw.roundKey;
    local.current = batches.flatMap(b => b.ops);
    nextId.current = 1 + local.current.reduce((m, o) => (o.t === 's' || o.t === 'u' ? Math.max(m, o.id) : m), 0);
  }

  const strokes: Stroke[] = draw ? foldStrokes([{ seq: 1, ops: local.current }]) : foldStrokes(batches);

  const paint = useCallback(() => {
    const c = canvas.current, w = wrap.current; if (!c || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = w.clientWidth, ch = Math.round((cw * CANVAS_H) / CANVAS_W);
    if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); c.style.height = `${ch}px`; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintStrokes(ctx, strokes, 0, 0, cw, ch);
  }, [strokes]);

  useEffect(() => { paint(); });
  useEffect(() => {
    const w = wrap.current; if (!w || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => paint()); ro.observe(w); return () => ro.disconnect();
  }, [paint]);

  const toCanvas = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * CANVAS_W), Math.round(((e.clientY - r.top) / r.height) * CANVAS_H)];
  };
  const push = (op: StrokeOp) => {
    const L = local.current, last = L[L.length - 1];
    if (op.t === 's' && last && last.t === 's' && last.id === op.id) last.p.push(...op.p); else L.push(op.t === 's' ? { ...op, p: [...op.p] } : op);
    draw!.send(op); bump(x => x + 1);
  };
  const down = (e: React.PointerEvent) => {
    if (!draw) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = toCanvas(e), id = nextId.current++;
    active.current = { id, last: pt };
    push({ t: 's', id, c: color, w: width, p: pt });
  };
  const move = (e: React.PointerEvent) => {
    const a = active.current; if (!draw || !a) return;
    const pt = toCanvas(e);
    if (Math.abs(pt[0] - a.last[0]) + Math.abs(pt[1] - a.last[1]) < 4) return; // skip sub-pixel jitter
    a.last = pt;
    push({ t: 's', id: a.id, c: color, w: width, p: pt });
  };
  const up = () => { active.current = null; };
  const undo = () => {
    const ids = foldStrokes([{ seq: 1, ops: local.current }]).map(s => s.id);
    const id = ids[ids.length - 1]; if (id) push({ t: 'u', id });
  };

  return (
    <div className={`relative select-none ${className}`}>
      <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl bg-white shadow-inner ring-1 ring-black/10">
        <canvas
          ref={canvas} className={`block w-full touch-none ${draw ? 'cursor-crosshair' : ''}`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
          aria-label={draw ? 'Drawing canvas' : 'Live drawing'}
        />
        {overlay}
      </div>
      {draw && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PALETTE.map(c => (
            <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full ring-2 transition ${color === c ? 'scale-110 ring-violet-500' : 'ring-black/10'}`} style={{ background: c }} />
          ))}
          <span className="mx-1 h-6 w-px bg-white/20" />
          {WIDTHS.map(w => (
            <button key={w} type="button" aria-label={`Brush ${w}`} onClick={() => setWidth(w)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${width === w ? 'bg-violet-600' : 'bg-white/10'}`}>
              <span className="rounded-full bg-white" style={{ width: Math.min(22, w / 1.6 + 3), height: Math.min(22, w / 1.6 + 3) }} />
            </button>
          ))}
          <button type="button" onClick={() => setColor('#ffffff')} className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs ${color === '#ffffff' ? 'bg-violet-600' : 'bg-white/10'}`}><Eraser size={14} /> Eraser</button>
          <button type="button" onClick={undo} className="flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2 text-xs"><Undo2 size={14} /> Undo</button>
          <button type="button" onClick={() => push({ t: 'c' })} className="flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2 text-xs"><Trash2 size={14} /> Clear</button>
        </div>
      )}
    </div>
  );
}
