import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brush, Eraser, Undo2, Trash2, Plus, Eye, EyeOff, X, Check, Loader2, Layers as LayersIcon, Droplet,
} from 'lucide-react';

// A real layered paint canvas — the drawing-engine foundation. Pressure-aware brush
// (PointerEvent.pressure), eraser, per-layer opacity/visibility/blend mode, undo, and
// PNG export. Deliberately dependency-free (raw Canvas2D). This is a strong base to
// iterate toward Procreate/Clip-Studio depth (brush dynamics, filters, selection).

const BLEND_MODES: GlobalCompositeOperation[] = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'soft-light'];
const BLEND_LABEL: Record<string, string> = { 'source-over': 'Normal', 'color-dodge': 'Dodge', 'soft-light': 'Soft light' };

interface Layer { id: string; canvas: HTMLCanvasElement; visible: boolean; opacity: number; blend: GlobalCompositeOperation; name: string; }

const uid = () => Math.random().toString(36).slice(2, 9);

const ComicDrawCanvas: React.FC<{
  width?: number; height?: number; initialImageUrl?: string;
  onSave: (blob: Blob) => Promise<void> | void; onClose: () => void;
}> = ({ width = 900, height = 1200, initialImageUrl, onSave, onClose }) => {
  const dispRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<Layer[]>([]);
  const activeRef = useRef<string>('');
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<{ id: string; data: ImageData }[]>([]);
  const [, force] = useState(0);
  const rerender = () => force(v => v + 1);

  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [color, setColor] = useState('#111111');
  const [size, setSize] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [saving, setSaving] = useState(false);

  const mkLayer = (name: string): Layer => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    return { id: uid(), canvas, visible: true, opacity: 1, blend: 'source-over', name };
  };

  // Init: base layer (+ optional starting image) and an ink layer.
  useEffect(() => {
    const base = mkLayer('Background');
    const ink = mkLayer('Ink');
    layersRef.current = [base, ink];
    activeRef.current = ink.id;
    if (initialImageUrl) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { base.canvas.getContext('2d')!.drawImage(img, 0, 0, width, height); composite(); };
      img.src = initialImageUrl;
    }
    composite(); rerender();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const composite = useCallback(() => {
    const disp = dispRef.current; if (!disp) return;
    const ctx = disp.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(l.canvas, 0, 0);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }, [width, height]);

  const activeLayer = () => layersRef.current.find(l => l.id === activeRef.current) || layersRef.current[layersRef.current.length - 1];

  const pos = (e: React.PointerEvent) => {
    const r = dispRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * width, y: (e.clientY - r.top) / r.height * height, p: e.pressure && e.pressure > 0 ? e.pressure : 0.5 };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const l = activeLayer(); if (!l) return;
    // snapshot for undo (cap 24)
    const ctx = l.canvas.getContext('2d')!;
    undoStack.current.push({ id: l.id, data: ctx.getImageData(0, 0, width, height) });
    if (undoStack.current.length > 24) undoStack.current.shift();
    drawing.current = true;
    const { x, y } = pos(e); last.current = { x, y };
    stroke(e); // dot on tap
  };

  const stroke = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const l = activeLayer(); if (!l) return;
    const ctx = l.canvas.getContext('2d')!;
    const { x, y, p } = pos(e);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = tool === 'eraser' ? 1 : opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, size * (0.35 + 0.65 * p));
    const lp = last.current || { x, y };
    const mx = (lp.x + x) / 2, my = (lp.y + y) / 2;
    ctx.beginPath(); ctx.moveTo(lp.x, lp.y); ctx.quadraticCurveTo(lp.x, lp.y, mx, my); ctx.stroke();
    last.current = { x, y };
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    composite();
  };

  const onUp = () => { drawing.current = false; last.current = null; };

  const undo = () => {
    const snap = undoStack.current.pop(); if (!snap) return;
    const l = layersRef.current.find(x => x.id === snap.id); if (!l) return;
    l.canvas.getContext('2d')!.putImageData(snap.data, 0, 0);
    composite();
  };

  const addLayer = () => { const l = mkLayer(`Layer ${layersRef.current.length}`); layersRef.current.push(l); activeRef.current = l.id; composite(); rerender(); };
  const delLayer = (id: string) => { if (layersRef.current.length <= 1) return; layersRef.current = layersRef.current.filter(l => l.id !== id); if (activeRef.current === id) activeRef.current = layersRef.current[layersRef.current.length - 1].id; composite(); rerender(); };
  const patchLayer = (id: string, patch: Partial<Layer>) => { const l = layersRef.current.find(x => x.id === id); if (l) Object.assign(l, patch); composite(); rerender(); };
  const clearActive = () => { const l = activeLayer(); if (!l) return; undoStack.current.push({ id: l.id, data: l.canvas.getContext('2d')!.getImageData(0, 0, width, height) }); l.canvas.getContext('2d')!.clearRect(0, 0, width, height); composite(); };

  const save = async () => {
    setSaving(true);
    try {
      const out = document.createElement('canvas'); out.width = width; out.height = height;
      const ctx = out.getContext('2d')!;
      for (const l of layersRef.current) { if (!l.visible) continue; ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend; ctx.drawImage(l.canvas, 0, 0); }
      const blob: Blob | null = await new Promise(res => out.toBlob(res, 'image/png'));
      if (blob) await onSave(blob);
    } finally { setSaving(false); }
  };

  const Tool: React.FC<{ on: boolean; onClick: () => void; title: string; children: React.ReactNode }> = ({ on, onClick, title, children }) => (
    <button onClick={onClick} title={title} className={`p-2.5 rounded-xl transition-colors ${on ? 'bg-orange-500 text-black' : 'bg-white/5 text-white/50 hover:text-white'}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-[400] bg-[#141416] flex flex-col" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/8 shrink-0">
        <Brush size={16} className="text-orange-400" />
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Draw</p>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-orange-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-orange-400 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save to panel</button>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 grid place-items-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Tools */}
        <div className="w-16 shrink-0 border-r border-white/8 flex flex-col items-center gap-2 py-3">
          <Tool on={tool === 'brush'} onClick={() => setTool('brush')} title="Brush"><Brush size={16} /></Tool>
          <Tool on={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={16} /></Tool>
          <Tool on={false} onClick={undo} title="Undo"><Undo2 size={16} /></Tool>
          <Tool on={false} onClick={clearActive} title="Clear layer"><Trash2 size={16} /></Tool>
          <label className="mt-2 w-9 h-9 rounded-xl overflow-hidden border border-white/15 cursor-pointer" title="Color" style={{ background: color }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="opacity-0 w-full h-full cursor-pointer" />
          </label>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-4 px-4 py-2 border-b border-white/8 text-white/50 text-[10px]">
            <label className="flex items-center gap-2"><Brush size={11} /> Size<input type="range" min={1} max={80} value={size} onChange={e => setSize(+e.target.value)} className="w-24 accent-orange-500" /><span className="w-6 tabular-nums">{size}</span></label>
            <label className="flex items-center gap-2"><Droplet size={11} /> Opacity<input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={e => setOpacity(+e.target.value)} className="w-24 accent-orange-500" /><span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span></label>
            <span className="ml-auto text-white/25">Pressure-sensitive · pen or mouse</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto grid place-items-center p-6" style={{ background: '#0d0d0f' }}>
            <canvas
              ref={dispRef} width={width} height={height}
              onPointerDown={onDown} onPointerMove={stroke} onPointerUp={onUp} onPointerLeave={onUp}
              className="rounded-lg shadow-2xl ring-1 ring-white/10 touch-none"
              style={{ width: 'auto', height: '78vh', maxWidth: '100%', background: '#fff', cursor: 'crosshair' }}
            />
          </div>
        </div>

        {/* Layers */}
        <div className="w-56 shrink-0 border-l border-white/8 bg-[#0d0d0f] flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/8">
            <LayersIcon size={14} className="text-white/50" /><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Layers</p>
            <button onClick={addLayer} className="ml-auto text-white/40 hover:text-white"><Plus size={15} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {[...layersRef.current].reverse().map(l => (
              <div key={l.id} onClick={() => { activeRef.current = l.id; rerender(); }}
                className={`rounded-xl border p-2 cursor-pointer transition-colors ${activeRef.current === l.id ? 'border-orange-500/50 bg-orange-500/[0.06]' : 'border-white/8 bg-white/[0.02]'}`}>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); patchLayer(l.id, { visible: !l.visible }); }} className="text-white/40 hover:text-white">{l.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                  <span className="text-[11px] font-bold text-white/70 flex-1 truncate">{l.name}</span>
                  <button onClick={e => { e.stopPropagation(); delLayer(l.id); }} className="text-white/25 hover:text-rose-400"><Trash2 size={12} /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input type="range" min={0} max={1} step={0.05} value={l.opacity} onClick={e => e.stopPropagation()} onChange={e => patchLayer(l.id, { opacity: +e.target.value })} className="flex-1 accent-orange-500 h-1" />
                  <select value={l.blend} onClick={e => e.stopPropagation()} onChange={e => patchLayer(l.id, { blend: e.target.value as GlobalCompositeOperation })} className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[8px] text-white/60">
                    {BLEND_MODES.map(m => <option key={m} value={m}>{BLEND_LABEL[m] || m}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComicDrawCanvas;
