// Trims on the 3D garment: buttons (click where), a zip, elastic and drawcords, each simulated and
// each checked against the children's-wear rules (drawstrings, small parts).

import React, { useState } from 'react';
import { MousePointerClick, Trash2 } from 'lucide-react';
import type { DrapeSetup } from '../../../services/soft/drape/drape';
import type { TrimSpec } from '../../../services/soft/drape/trims';
import { cordEnds } from '../../../services/soft/drape/trims';
import type { PickHit } from './Viewport';

export default function TrimsPanel({ setup, trims, setTrims, setPick, prefix }: { setup: DrapeSetup | null; trims: TrimSpec[]; setTrims: (t: TrimSpec[]) => void; setPick: (f: ((h: PickHit) => void) | null) => void; prefix: string }) {
  const [dia, setDia] = useState(15); const [endMm, setEndMm] = useState(70);
  const m = setup?.model; const has = (id: string) => !!m?.pieces.some(p => p.id === prefix + id);
  const piece = (id: string) => setup?.rig.placed.find(p => p.id === prefix + id);
  const addButton = () => setPick(() => (h: PickHit) => { if (h.on !== 'cloth' || h.vertex == null || !m) return; const pi = m.vPiece[h.vertex]; const P = m.pieces[pi]; if (P.pieceId === 'drawcord') return;
    setTrims([...trims, { kind: 'button', piece: P.id, at: [m.rest2[2 * h.vertex], m.rest2[2 * h.vertex + 1]], diameterMm: dia, label: `${dia} mm button on ${P.name}` }]); setPick(null); });
  const hoodCord = () => { const hood = piece('hood-L'); if (!hood) return; const top = Math.max(...hood.seam.filter(q => q[0] < 1).map(q => q[1]));
    setTrims([...trims, { kind: 'drawcord', where: 'hood', endMm, label: 'Hood drawcord', casing: [{ piece: prefix + 'hood-L', from: [0, 0], to: [0, top] }, { piece: prefix + 'hood-R', from: [0, top], to: [0, 0] }] }]); };
  const waistCord = () => { const lg = piece('leg-L') ?? piece('front'); if (!lg) return; const ys = lg.seam.map(q => q[1]); const top = Math.max(...ys); const xs = lg.seam.filter(q => q[1] > top - 25).map(q => q[0]);
    setTrims([...trims, { kind: 'drawcord', where: 'waist', endMm, label: 'Waist drawcord', casing: [{ piece: lg.id, from: [Math.min(...xs), top - 8], to: [Math.max(...xs), top - 8] }] }]); };
  const zip = () => { const fr = piece('front'); if (!fr) return; const top = Math.max(...fr.seam.filter(q => Math.abs(q[0]) < 20).map(q => q[1])); setTrims([...trims, { kind: 'zip', piece: fr.id, from: [0, 0], to: [0, top], label: 'Centre-front zip' }]); };
  const sleeveElastic = () => { const out: TrimSpec[] = []; for (const tag of ['L', 'R']) { const sl = piece(`sleeve-${tag}`); if (!sl) continue; const hw = Math.max(...sl.seam.filter(q => q[1] < 0.5).map(q => q[0])); out.push({ kind: 'elastic', piece: sl.id, from: [hw, 0], to: [-hw, 0], ratio: 0.75, forceN: 6, label: `Elastic sleeve hem ${tag}` }); } setTrims([...trims, ...out]); };
  return <div data-testid="drape-trims" className="text-[12px] space-y-2">
    <div className="grid grid-cols-2 gap-1.5 items-end">
      <label className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>Button Ø {dia} mm<input type="range" min={8} max={40} value={dia} onChange={e => setDia(Number(e.target.value))} className="w-full"/></label>
      <button className="sew-btn justify-center" onClick={addButton} disabled={!m} data-testid="drape-trim-button"><MousePointerClick size={12}/>Place button</button>
      <label className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>Cord ends {endMm} mm<input type="range" min={30} max={300} value={endMm} onChange={e => setEndMm(Number(e.target.value))} className="w-full"/></label>
      {has('hood-L') ? <button className="sew-btn justify-center" onClick={hoodCord} data-testid="drape-trim-hoodcord">Hood drawcord</button> : <button className="sew-btn justify-center" onClick={waistCord} disabled={!has('leg-L') && !has('front')} data-testid="drape-trim-waistcord">Waist drawcord</button>}
      {has('front') && <button className="sew-btn justify-center" onClick={zip} data-testid="drape-trim-zip">Centre-front zip</button>}
      {has('sleeve-L') && <button className="sew-btn justify-center" onClick={sleeveElastic} data-testid="drape-trim-elastic">Elastic sleeve hems</button>}
    </div>
    <div className="sew-h mt-2">On this garment</div>
    {!trims.length && <div style={{ color: 'rgba(255,255,255,.5)' }}>No trims.</div>}
    {trims.map((t, k) => { const c = setup?.trimState?.cords.find(x => x.label === (t.label ?? 'Drawcord')); const ends = c && m ? cordEnds(m, c) : null;
      return <div key={k} className="flex items-center gap-2 text-[11.5px]" data-testid={`drape-trim-${k}`}><span className="flex-1">{t.label ?? t.kind}{ends ? ` · ends hang ${Math.round(ends[0])} / ${Math.round(ends[1])} mm` : ''}</span><button className="opacity-60 hover:opacity-100" onClick={() => setTrims(trims.filter((_, j) => j !== k))} aria-label="Remove"><Trash2 size={12}/></button></div>; })}
    <div className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.45)' }}>Buttons add their weight where they sit; a zip stiffens and weighs its line; elastic gathers the edge with a real pull; cords hang and swing. Children's rules are checked in Safety.</div>
  </div>;
}
