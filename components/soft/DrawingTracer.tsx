// Plush from your drawing: pick a drawing or photo, adjust the threshold and smoothing until the
// pink outline hugs the character, optionally mirror one half. Runs on this device: the picture is
// read into a canvas here and never uploaded.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Wand2, PenLine, Eraser } from 'lucide-react';
import { toGray, otsu, traceSilhouette, coverage, outlineFromStrokes, type Gray } from '../../services/soft/trace';
import { encodeOutline } from '../../services/soft/patterns';
import type { Pt } from '../../services/soft/geometry';

const MAX = 400;

/** Draw the outline by hand: each stroke is closed and filled, strokes are unioned, then traced. */
function DrawPad({ onOutline }: { onOutline: (encoded: string) => void }) {
  const [strokes, setStrokes] = useState<Pt[][]>([]); const cur = useRef<Pt[] | null>(null); const [, force] = useState(0); const S = 280;
  const ring = useMemo(() => outlineFromStrokes(strokes.map(s => s.map(([x, y]) => [x, S - y] as Pt)), { smooth: 3 }), [strokes]);
  useEffect(() => { if (ring.length >= 6) onOutline(encodeOutline(ring)); }, [ring]); // eslint-disable-line react-hooks/exhaustive-deps
  const pt = (e: React.PointerEvent<SVGSVGElement>): Pt => { const r = e.currentTarget.getBoundingClientRect(); return [(e.clientX - r.left) * S / r.width, (e.clientY - r.top) * S / r.height]; };
  const path = (s: Pt[]) => `M${s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`;
  return <div className="mt-2">
    <svg viewBox={`0 0 ${S} ${S}`} className="block w-full rounded touch-none" style={{ background: '#fff', cursor: 'crosshair' }} data-testid="sew-draw-pad"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); cur.current = [pt(e)]; force(x => x + 1); }}
      onPointerMove={e => { if (cur.current) { cur.current.push(pt(e)); force(x => x + 1); } }}
      onPointerUp={() => { const s = cur.current; cur.current = null; if (s && s.length > 2) setStrokes(v => [...v, s]); else force(x => x + 1); }}>
      {ring.length > 0 && <path d={`${path(ring.map(([x, y]) => [x, S - y] as Pt))}Z`} fill="rgba(236,72,153,.18)" stroke="#db2777" strokeWidth={1.5}/>}
      {[...strokes, ...(cur.current ? [cur.current] : [])].map((s, i) => <path key={i} d={path(s)} fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round"/>)}
    </svg>
    <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: 'rgba(255,255,255,.5)' }}>
      <span className="flex-1">Draw the outline as one loop (it closes itself); extra loops add ears or arms.</span>
      <button className="sew-btn" style={{ height: 24 }} onClick={() => setStrokes(v => v.slice(0, -1))} disabled={!strokes.length}>Undo</button>
      <button className="sew-btn" style={{ height: 24 }} onClick={() => setStrokes([])} disabled={!strokes.length}><Eraser size={11}/>Clear</button>
    </div>
  </div>;
}

export default function DrawingTracer({ onOutline }: { onOutline: (encoded: string) => void }) {
  const [mode, setMode] = useState<'picture' | 'draw'>('picture');
  const [img, setImg] = useState<{ url: string; gray: Gray } | null>(null);
  const [threshold, setThreshold] = useState(128); const [smooth, setSmooth] = useState(1);
  const [invert, setInvert] = useState(false); const [mirror, setMirror] = useState<'off' | 'left' | 'right'>('off'); const [err, setErr] = useState('');

  const load = (file: File) => {
    setErr(''); const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAX / Math.max(im.width, im.height)); const w = Math.max(8, Math.round(im.width * k)), h = Math.max(8, Math.round(im.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!; ctx.drawImage(im, 0, 0, w, h);
      const gray = toGray(ctx.getImageData(0, 0, w, h).data, w, h); setImg({ url, gray }); setThreshold(Math.round(otsu(gray)));
    };
    im.onerror = () => setErr('That file could not be read as an image. Try a PNG or JPEG.'); im.src = url;
  };
  const ring: Pt[] = useMemo(() => (img ? traceSilhouette(img.gray, { threshold, smooth, invert, mirror }) : []), [img, threshold, smooth, invert, mirror]);
  const cover = img ? coverage(ring, img.gray) : 0;
  useEffect(() => { if (ring.length >= 6) onOutline(encodeOutline(ring)); }, [ring]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  const h = img?.gray.h ?? 1;
  return <div className="mb-2 p-2 rounded-lg" style={{ background: 'rgba(244,114,182,.06)', border: '1px solid rgba(244,114,182,.25)' }} data-testid="sew-tracer">
    <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: 'rgba(255,255,255,.5)' }}>Your drawing</div>
    <div className="flex gap-1 mb-1"><button className="sew-btn flex-1 justify-center" style={{ opacity: mode === 'picture' ? 1 : 0.55 }} onClick={() => setMode('picture')} data-testid="sew-trace-mode-picture"><Upload size={12}/>Picture</button>
      <button className="sew-btn flex-1 justify-center" style={{ opacity: mode === 'draw' ? 1 : 0.55 }} onClick={() => setMode('draw')} data-testid="sew-trace-mode-draw"><PenLine size={12}/>Draw it</button></div>
    {mode === 'draw' ? <DrawPad onOutline={onOutline}/> : <>
    <label className="sew-btn w-full justify-center cursor-pointer"><Upload size={12}/>{img ? 'Choose another picture' : 'Upload a drawing or photo'}
      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); }} data-testid="sew-trace-file"/></label>
    <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,.5)' }}>A dark drawing on light paper works best; a closed outline or a filled shape. Stays on this device.</div>
    {err && <div className="text-[11px] mt-1" style={{ color: '#fda4af' }}>{err}</div>}
    {img && <>
      <div className="relative mt-2 rounded overflow-hidden" style={{ background: '#fff' }}>
        <img src={img.url} alt="Your drawing" className="block w-full" style={{ opacity: 0.55 }}/>
        <svg viewBox={`0 0 ${img.gray.w} ${img.gray.h}`} className="absolute inset-0 w-full h-full" data-testid="sew-trace-preview">
          {ring.length > 0 && <path d={`M${ring.map(([x, y]) => `${x.toFixed(1)},${(h - 1 - y).toFixed(1)}`).join('L')}Z`} fill="rgba(236,72,153,.18)" stroke="#db2777" strokeWidth={Math.max(1, img.gray.w / 200)}/>}
        </svg>
      </div>
      {!ring.length && <div className="text-[11px] mt-1" style={{ color: '#fda4af' }}>Nothing traced: move the threshold or tick “light drawing on dark”.</div>}
      {cover > 0.97 && <div className="text-[11px] mt-1" style={{ color: '#fbbf24' }}>The outline is the whole picture: the background is being traced. Try “light drawing on dark” or a lower threshold.</div>}
      <label className="block text-[11px] mt-2" style={{ color: 'rgba(255,255,255,.55)' }}>Threshold {threshold}
        <span className="flex items-center gap-1"><input type="range" min={1} max={254} value={threshold} onChange={e => setThreshold(+e.target.value)} className="flex-1" data-testid="sew-trace-threshold"/>
          <button className="sew-btn" style={{ height: 24 }} title="Pick automatically" onClick={() => setThreshold(Math.round(otsu(img.gray)))}><Wand2 size={11}/>Auto</button></span></label>
      <label className="block text-[11px] mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>Smoothing {smooth}<input type="range" min={0} max={8} value={smooth} onChange={e => setSmooth(+e.target.value)} className="w-full" data-testid="sew-trace-smooth"/></label>
      <label className="flex items-center gap-2 text-[11.5px] py-1"><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} data-testid="sew-trace-invert"/>Light drawing on dark</label>
      <label className="block text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>Mirror half (symmetric characters)
        <select className="sew-in" value={mirror} onChange={e => setMirror(e.target.value as 'off' | 'left' | 'right')} data-testid="sew-trace-mirror"><option value="off">Off: trace as drawn</option><option value="left">Keep the left half, mirror it</option><option value="right">Keep the right half, mirror it</option></select></label>
    </>}
    </>}
  </div>;
}
