// Crop & scale for one shot of a Themed Show.
//   • Picture — crop the photo itself (aspect presets, drag to move, corners to resize,
//     slider to scale the crop). Replaces the automatic border / screenshot trim.
//   • Polaroid — choose which square of the picture goes in the print (replaces the
//     face-aware automatic square).
//   • Full-page size — how large the photo sits on screen when it goes full page.
// "Auto" returns any of them to the automatic choice.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';
import type { CropRect, ShowPhoto } from '../../services/slideshow/types';
import { drawTurned, loadUpright, uprightTrimmed } from '../../services/slideshow/photoPrep';

type Mode = 'picture' | 'polaroid';
const ASPECTS: { id: string; label: string; r: number | null }[] = [
  { id: 'free', label: 'Free', r: null }, { id: 'orig', label: 'Original', r: -1 },
  { id: '16:9', label: '16:9', r: 16 / 9 }, { id: '4:3', label: '4:3', r: 4 / 3 }, { id: '3:2', label: '3:2', r: 3 / 2 },
  { id: '1:1', label: '1:1', r: 1 }, { id: '4:5', label: '4:5', r: 4 / 5 },
];

interface Props {
  photo: ShowPhoto;
  onClose: () => void;
  onApply: (r: { manualCrop?: CropRect | null; manualPolaroid?: CropRect | null; fullScale: number }) => void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function ShowCropTool({ photo, onClose, onApply }: Props) {
  const [mode, setMode] = useState<Mode>('picture');
  const [srcFull, setSrcFull] = useState<string | null>(null);   // upright original
  const [srcPic, setSrcPic] = useState<string | null>(null);     // upright, current crop
  const [dims, setDims] = useState({ fw: 1, fh: 1, pw: 1, ph: 1 });
  const [crop, setCrop] = useState<CropRect>(photo.manualCrop || photo.trim || { x: 0, y: 0, w: 1, h: 1 });
  const [cropAuto, setCropAuto] = useState(!photo.manualCrop);
  const [pol, setPol] = useState<CropRect>(photo.manualPolaroid || photo.polaroidCrop);
  const [polAuto, setPolAuto] = useState(!photo.manualPolaroid);
  const [aspect, setAspect] = useState('free');
  const [scale, setScale] = useState(photo.fullScale ?? 1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const bmp = await loadUpright(photo.src);
      const full = drawTurned(bmp, photo.quarterTurns || 0);
      const pic = await uprightTrimmed(photo);
      if (!alive) return;
      setSrcFull(full.toDataURL('image/jpeg', 0.9));
      setSrcPic(pic.toDataURL('image/jpeg', 0.9));
      setDims({ fw: full.width, fh: full.height, pw: pic.width, ph: pic.height });
    })();
    return () => { alive = false; };
  }, [photo]);

  // the rectangle being edited and the image it's relative to
  const rect = mode === 'picture' ? crop : pol;
  const setRect = (r: CropRect) => { if (mode === 'picture') { setCrop(r); setCropAuto(false); } else { setPol(r); setPolAuto(false); } };
  const imgW = mode === 'picture' ? dims.fw : dims.pw, imgH = mode === 'picture' ? dims.fh : dims.ph;
  const lockR = useMemo(() => {
    if (mode === 'polaroid') return imgH / imgW; // square in pixels → normalised w/h ratio
    const a = ASPECTS.find((x) => x.id === aspect)?.r;
    if (a == null) return null;
    const ratio = a === -1 ? imgW / imgH : a;
    return (ratio * imgH) / imgW;            // normalised w / h
  }, [mode, aspect, imgW, imgH]);

  const applyAspect = (id: string) => {
    setAspect(id);
    const a = ASPECTS.find((x) => x.id === id)?.r;
    if (a == null) return;
    const ratio = ((a === -1 ? dims.fw / dims.fh : a) * dims.fh) / dims.fw;
    // largest rect of that ratio centred on the current crop
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    let w = Math.min(1, crop.w), h = w / ratio;
    if (h > 1) { h = 1; w = h * ratio; }
    setCrop({ x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h });
    setCropAuto(false);
  };

  // scale the rectangle about its centre (the "zoom" of the crop)
  const zoomRect = (k: number) => {
    const r = rect;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let w = clamp(r.w * k, 0.05, 1), h = clamp(r.h * k, 0.05, 1);
    if (lockR) { if (w / h > lockR) w = h * lockR; else h = w / lockR; }
    setRect({ x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h });
  };

  const drag = (e: React.PointerEvent, kind: 'move' | 'tl' | 'tr' | 'bl' | 'br') => {
    e.preventDefault();
    e.stopPropagation();
    const el = boxRef.current!;
    const b = el.getBoundingClientRect();
    const start = { ...rect }, sx = e.clientX, sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / b.width, dy = (ev.clientY - sy) / b.height;
      let { x, y, w, h } = start;
      if (kind === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
      else {
        const left = kind === 'tl' || kind === 'bl', top = kind === 'tl' || kind === 'tr';
        let x0 = start.x, y0 = start.y, x1 = start.x + start.w, y1 = start.y + start.h;
        if (left) x0 = clamp(x0 + dx, 0, x1 - 0.04); else x1 = clamp(x1 + dx, x0 + 0.04, 1);
        if (top) y0 = clamp(y0 + dy, 0, y1 - 0.04); else y1 = clamp(y1 + dy, y0 + 0.04, 1);
        w = x1 - x0; h = y1 - y0;
        if (lockR) {
          // keep the ratio, anchored at the opposite corner
          if (w / h > lockR) w = h * lockR; else h = w / lockR;
          x0 = left ? x1 - w : x0; y0 = top ? y1 - h : y0;
          if (x0 < 0 || y0 < 0 || x0 + w > 1 || y0 + h > 1) return;
        }
        x = x0; y = y0;
      }
      setRect({ x, y, w, h });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const src = mode === 'picture' ? srcFull : srcPic;
  const pctRect = { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` };
  const handle = 'absolute w-3.5 h-3.5 bg-white rounded-sm ring-2 ring-black/40';
  const fitStyle: React.CSSProperties = imgW / imgH > 16 / 10 ? { width: '100%' } : { height: '62vh' };

  return (
    <div className="fixed inset-0 z-[330] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-950 rounded-2xl p-4 w-full max-w-5xl flex flex-col gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex p-1 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest">
            {(['picture', 'polaroid'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 rounded-full ${mode === m ? 'bg-white text-black' : 'text-white/50'}`}>{m === 'picture' ? 'Crop picture' : 'Polaroid window'}</button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="flex items-center justify-center bg-black/40 rounded-xl p-3 select-none touch-none"
          onWheel={(e) => zoomRect(e.deltaY > 0 ? 1.04 : 1 / 1.04)}>
          {src ? (
            <div ref={boxRef} className="relative" style={{ ...fitStyle, aspectRatio: `${imgW} / ${imgH}`, maxWidth: '100%', maxHeight: '62vh' }}>
              <img src={src} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
              {/* shade outside the crop */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.55)', clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${rect.x * 100}% ${rect.y * 100}%,${rect.x * 100}% ${(rect.y + rect.h) * 100}%,${(rect.x + rect.w) * 100}% ${(rect.y + rect.h) * 100}%,${(rect.x + rect.w) * 100}% ${rect.y * 100}%,${rect.x * 100}% ${rect.y * 100}%)` }} />
              <div className="absolute ring-2 ring-white cursor-move" style={pctRect} onPointerDown={(e) => drag(e, 'move')}>
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, transparent 33%, rgba(255,255,255,.35) 33%, rgba(255,255,255,.35) calc(33% + 1px), transparent calc(33% + 1px), transparent 66%, rgba(255,255,255,.35) 66%, rgba(255,255,255,.35) calc(66% + 1px), transparent calc(66% + 1px)), linear-gradient(to bottom, transparent 33%, rgba(255,255,255,.35) 33%, rgba(255,255,255,.35) calc(33% + 1px), transparent calc(33% + 1px), transparent 66%, rgba(255,255,255,.35) 66%, rgba(255,255,255,.35) calc(66% + 1px), transparent calc(66% + 1px))' }} />
                <div className={`${handle} -left-2 -top-2 cursor-nwse-resize`} onPointerDown={(e) => drag(e, 'tl')} />
                <div className={`${handle} -right-2 -top-2 cursor-nesw-resize`} onPointerDown={(e) => drag(e, 'tr')} />
                <div className={`${handle} -left-2 -bottom-2 cursor-nesw-resize`} onPointerDown={(e) => drag(e, 'bl')} />
                <div className={`${handle} -right-2 -bottom-2 cursor-nwse-resize`} onPointerDown={(e) => drag(e, 'br')} />
              </div>
            </div>
          ) : <div className="h-64 flex items-center text-white/40 text-sm">Loading…</div>}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {mode === 'picture' && (
            <div className="flex flex-wrap gap-1">
              {ASPECTS.map((a) => (
                <button key={a.id} onClick={() => applyAspect(a.id)} className={`px-2.5 py-1 rounded-full ${aspect === a.id ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>{a.label}</button>
              ))}
            </div>
          )}
          {mode === 'polaroid' && <span className="text-white/50">The square that goes in the print. Drag it onto the faces you want.</span>}
          <label className="flex items-center gap-2">Zoom
            <input type="range" min={0} max={100} value={Math.round((1 - Math.min(rect.w, rect.h * (lockR ?? rect.w / rect.h))) * 100)}
              onChange={(e) => { const target = 1 - +e.target.value / 100; const cur = Math.min(rect.w, rect.h * (lockR ?? rect.w / rect.h)); if (cur > 0) zoomRect(Math.max(0.05, target) / cur); }} />
          </label>
          <button onClick={() => { if (mode === 'picture') { setCrop(photo.trim && photo.trimReason !== 'manual' ? photo.trim : { x: 0, y: 0, w: 1, h: 1 }); setCropAuto(true); setAspect('free'); } else { setPol(photo.polaroidCrop); setPolAuto(true); } }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20"><RotateCcw size={12} /> Auto</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3 text-xs">
          <label className="flex items-center gap-2" title="How large the photo sits on screen when it goes full page">
            Full-page size {Math.round(scale * 100)}%
            <input type="range" min={60} max={100} value={Math.round(scale * 100)} onChange={(e) => setScale(+e.target.value / 100)} />
          </label>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">Cancel</button>
            <button onClick={() => onApply({ manualCrop: cropAuto ? null : crop, manualPolaroid: polAuto ? null : pol, fullScale: scale })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black font-bold"><Check size={14} /> Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
