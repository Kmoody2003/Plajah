// 3D → 2D: click style lines onto the avatar, flatten the enclosed surface into a pattern piece,
// download it as DXF (ours) or AAMA DXF.

import React, { useEffect, useMemo, useState } from 'react';
import { Download, MousePointerClick, Undo2, Eraser } from 'lucide-react';
import type { DrapeSetup } from '../../../services/soft/drape/drape';
import { flattenRegion, type FlattenResult } from '../../../services/soft/drape/flatten';
import { surfaceNets, type V3 } from '../../../services/soft/drape/avatar';
import { writeAama } from '../../../services/soft/drape/aama';
import { blankPattern } from '../../../services/soft/drape/importPattern';
import { ungraded } from '../../../services/soft/drape/grading';
import { patternModel } from '../../../services/soft/layout';
import { writeDxf } from '../../../services/cad/dxf';
import { cutLine } from '../../../services/soft/patterns';
import { bbox } from '../../../services/soft/geometry';
import type { ViewportHandle, PickHit } from './Viewport';

const dl = (name: string, data: string, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); };

export default function FlattenPanel({ setup, vp, setPick, unit }: { setup: DrapeSetup | null; vp: React.RefObject<ViewportHandle | null>; setPick: (f: ((h: PickHit) => void) | null) => void; unit: 'cm' | 'in' }) {
  const [pts, setPts] = useState<V3[]>([]); const [ease, setEase] = useState(15); const [res, setRes] = useState<FlattenResult | null>(null); const [name, setName] = useState('Yoke');
  const mesh = useMemo(() => (setup?.sdf ? surfaceNets(setup.sdf) : null), [setup]);
  useEffect(() => { setPick(() => (h: PickHit) => { if (h.on === 'body') setPts(p => [...p, h.point]); }); return () => { setPick(null); vp.current?.setMarkers([]); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { vp.current?.setMarkers(pts, pts.length > 2); }, [pts, vp]);
  const run = () => { if (!mesh || !setup?.body) return; setRes(flattenRegion(mesh, setup.body, pts, { ease, name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'styled' })); };
  const pat = res ? blankPattern(`${name} (from 3D)`, [res.piece]) : null;
  const k = unit === 'in' ? 25.4 : 10; const b = res ? bbox(cutLine(res.piece)) : null;
  return <div data-testid="drape-flatten" className="text-[12px] space-y-2">
    <div className="text-[11px]" style={{ color: 'rgba(255,255,255,.6)' }}><MousePointerClick size={11} className="inline"/> Click round the panel you want on the body (front or back of the torso): {pts.length} points.</div>
    <div className="flex gap-1.5"><button className="sew-btn" onClick={() => setPts(p => p.slice(0, -1))} disabled={!pts.length}><Undo2 size={12}/>Undo</button><button className="sew-btn" onClick={() => { setPts([]); setRes(null); }}><Eraser size={12}/>Clear</button>
      <input className="flex-1 h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-white text-[12px]" value={name} onChange={e => setName(e.target.value)} placeholder="Piece name"/></div>
    <label className="block text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>Ease off the body {ease} mm<input type="range" min={0} max={60} value={ease} onChange={e => setEase(Number(e.target.value))} className="w-full"/></label>
    <button className="sew-btn sew-primary w-full justify-center" disabled={pts.length < 3 || !mesh} onClick={run} data-testid="drape-flatten-run">Flatten to a pattern piece</button>
    {pts.length >= 3 && res === null && <div className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.45)' }}>Uses the torso; arms, hands and the head are left out.</div>}
    {res && b && <div data-testid="drape-flatten-result">
      <svg viewBox={`${b.x0 - 10} ${-b.y1 - 10} ${b.w + 20} ${b.h + 20}`} className="w-full rounded-lg bg-white/5" style={{ maxHeight: 200 }}>
        <path d={`M${cutLine(res.piece).map(([x, y]) => `${x},${-y}`).join('L')}Z`} fill="rgba(244,114,182,.12)" stroke="#f9a8d4" strokeWidth={1.5}/><path d={`M${res.piece.seam.map(([x, y]) => `${x},${-y}`).join('L')}Z`} fill="none" stroke="#93c5fd" strokeDasharray="6 4" strokeWidth={1}/></svg>
      <div className="text-[11px] mt-1">{(b.w / k).toFixed(1)} × {(b.h / k).toFixed(1)} {unit} cut · {(res.distortion * 100).toFixed(1)}% edge distortion · {Math.round(res.area2d / 100) / 100} dm² flat vs {Math.round(res.area3d / 100) / 100} dm² on the body</div>
      {res.distortion > 0.04 && <div className="text-[11px]" style={{ color: '#fcd34d' }}>High distortion: add a dart or split this panel with another line.</div>}
      <div className="grid grid-cols-2 gap-1.5 mt-1.5"><button className="sew-btn justify-center" onClick={() => pat && dl(`${name}.dxf`, writeDxf(patternModel(pat)), 'application/dxf')}><Download size={12}/>DXF</button>
        <button className="sew-btn justify-center" onClick={() => pat && dl(`${name} AAMA.dxf`, writeAama(ungraded(pat)).dxf, 'application/dxf')}><Download size={12}/>AAMA DXF</button></div>
    </div>}
  </div>;
}
