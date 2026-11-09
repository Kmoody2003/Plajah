// Print placement on the 3D garment → one print file per pattern piece, ready for cut-and-sew
// print-on-demand (Printful-style all-over print) or the Merch Designer.

import React, { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, MousePointerClick } from 'lucide-react';
import type { Pattern } from '../../../services/soft/patterns';
import type { DrapeSetup } from '../../../services/soft/drape/drape';
import { projectDecal, decalOverlay, printPieces, type Decal, type PiecePrint } from '../../../services/soft/drape/printMap';
import { bbox, offset, ccw } from '../../../services/soft/geometry';
import type { ViewportHandle, PickHit } from './Viewport';

/** Draw one piece's print: each covered triangle texture-mapped from the decal image (affine per triangle). */
export function renderPiecePrint(pp: PiecePrint, img: CanvasImageSource & { width: number; height: number }, dpi = 150, bleed = 12): HTMLCanvasElement {
  const cut = offset(ccw(pp.outline), bleed); const b = bbox(cut); const s = dpi / 25.4; const W = Math.ceil(b.w * s), H = Math.ceil(b.h * s);
  const cv = document.createElement('canvas'); cv.width = Math.max(1, W); cv.height = Math.max(1, H); const g = cv.getContext('2d')!;
  const X = (x: number) => (pp.mirrored ? (b.x1 - x) : (x - b.x0)) * s, Y = (y: number) => (b.y1 - y) * s;
  g.save(); g.beginPath(); cut.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.clip();
  const iw = img.width, ih = img.height;
  for (const t of pp.tris) {
    const [p0, p1, p2] = t.p.map(([x, y]) => [X(x), Y(y)]); const [u0, u1, u2] = t.uv.map(([u, v]) => [u * iw, (1 - v) * ih]);
    g.save(); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath();
    // Grow the clip a hair so neighbouring triangles leave no hairline gaps.
    g.lineWidth = 1; g.clip();
    const d = (u1[0] - u0[0]) * (u2[1] - u0[1]) - (u2[0] - u0[0]) * (u1[1] - u0[1]); if (Math.abs(d) < 1e-9) { g.restore(); continue; }
    const a = ((p1[0] - p0[0]) * (u2[1] - u0[1]) - (p2[0] - p0[0]) * (u1[1] - u0[1])) / d, bb = ((p1[1] - p0[1]) * (u2[1] - u0[1]) - (p2[1] - p0[1]) * (u1[1] - u0[1])) / d;
    const c = ((p2[0] - p0[0]) * (u1[0] - u0[0]) - (p1[0] - p0[0]) * (u2[0] - u0[0])) / d, dd = ((p2[1] - p0[1]) * (u1[0] - u0[0]) - (p1[1] - p0[1]) * (u2[0] - u0[0])) / d;
    g.setTransform(a, bb, c, dd, p0[0] - a * u0[0] - c * u0[1], p0[1] - bb * u0[0] - dd * u0[1]); g.drawImage(img, 0, 0); g.restore();
  }
  g.restore(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.setLineDash([6, 4]); g.beginPath(); pp.outline.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.stroke();
  return cv;
}

export default function PrintPanel({ setup, vp, setPick, pattern }: { setup: DrapeSetup | null; vp: React.RefObject<ViewportHandle | null>; setPick: (f: ((h: PickHit) => void) | null) => void; pattern: Pattern }) {
  const [img, setImg] = useState<HTMLCanvasElement | null>(null); const [decal, setDecal] = useState<Decal | null>(null); const [size, setSize] = useState(220); const [rot, setRot] = useState(0); const [prints, setPrints] = useState<PiecePrint[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = (f: File) => { const im = new Image(); im.onload = () => { const pad = 2; const c = document.createElement('canvas'); c.width = im.width + 2 * pad; c.height = im.height + 2 * pad; c.getContext('2d')!.drawImage(im, pad, pad); setImg(c); }; im.src = URL.createObjectURL(f); };
  const sample = () => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!; g.clearRect(0, 0, 512, 512);
    const gr = g.createLinearGradient(0, 0, 512, 512); gr.addColorStop(0, '#f472b6'); gr.addColorStop(1, '#8b5cf6'); g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 230, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 120px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MAKE', 256, 212); g.font = 'bold 72px system-ui'; g.fillText('IT YOURS', 256, 318); setImg(c); };
  useEffect(() => {
    if (!setup || !img || !decal) { vp.current?.setDecal(null); setPrints([]); return; }
    const d = { ...decal, width: size, height: size * img.height / img.width, rotation: rot * Math.PI / 180 }; const pr = projectDecal(setup.model, d);
    vp.current?.setDecal(decalOverlay(setup.model, pr) as never, img); setPrints(printPieces(setup.model, pr));
  }, [setup, img, decal, size, rot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { vp.current?.setDecal(null); setPick(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const place = () => setPick(() => (h: PickHit) => { if (h.on !== 'cloth') return; setDecal({ center: h.point, normal: h.normal, width: size, height: size, rotation: 0 }); setPick(null); });
  const save = () => { if (!img) return; for (const pp of prints) { const cv = renderPiecePrint(pp, img); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `${pattern.name} ${pp.name}${pp.mirrored ? ' (mirrored)' : ''}.png`; a.click(); }
    const manifest = { pattern: pattern.name, size: pattern.size, dpi: 150, bleedMm: 12, pieces: prints.map(p => ({ id: p.id, piece: p.pieceId, name: p.name, mirrored: p.mirrored, file: `${pattern.name} ${p.name}${p.mirrored ? ' (mirrored)' : ''}.png`, outlineMm: p.outline })) };
    const u = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = `${pattern.name} print manifest.json`; a.click(); };
  return <div data-testid="drape-print" className="text-[12px] space-y-2">
    <div className="grid grid-cols-2 gap-1.5"><button className="sew-btn justify-center" onClick={() => fileRef.current?.click()}><ImagePlus size={12}/>Your artwork</button><button className="sew-btn justify-center" onClick={sample} data-testid="drape-print-sample">Sample art</button></div>
    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }}/>
    <button className="sew-btn w-full justify-center" disabled={!img || !setup} onClick={place} data-testid="drape-print-place"><MousePointerClick size={12}/>{decal ? 'Move it: click the garment' : 'Place it: click the garment'}</button>
    <label className="block text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>Width {Math.round(size / 10)} cm<input type="range" min={40} max={700} value={size} onChange={e => setSize(Number(e.target.value))} className="w-full"/></label>
    <label className="block text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>Rotate {rot}°<input type="range" min={-180} max={180} value={rot} onChange={e => setRot(Number(e.target.value))} className="w-full"/></label>
    {prints.length > 0 && <><div className="sew-h">Lands on</div>{prints.map(p => <div key={p.id} className="text-[11px]" data-testid={`drape-print-${p.id}`}>• {p.name}: {p.tris.length} triangles{p.mirrored ? ' (print mirrored: this piece is cut face down)' : ''}</div>)}
      <button className="sew-btn sew-primary w-full justify-center" onClick={save} data-testid="drape-print-save"><Download size={12}/>Print files per piece (PNG + manifest)</button></>}
    <div className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.45)' }}>Each file is the piece's cut shape (+12 mm bleed) at 150 dpi with the artwork exactly where it falls on the body, so it lines up across seams when sewn. Use only artwork you own or have licensed.</div>
  </div>;
}
