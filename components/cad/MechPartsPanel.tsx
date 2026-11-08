// Mechanical parts: pick a standard part, set its size, see it in 3D, export STL or add to Tela.

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MECH_PARTS, type MechPart } from '../../services/mech/parts';

const DIM = 'rgba(255,255,255,.5)';

export default function MechPartsPanel({ current, params, onPick, onParams }: { current: MechPart | null; params: Record<string, number | string>; onPick: (p: MechPart) => void; onParams: (p: Record<string, number | string>) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const list = MECH_PARTS.filter(p => !q.trim() || `${p.name} ${p.category} ${p.standard ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
    const g = new Map<string, MechPart[]>(); for (const p of list) { const a = g.get(p.category) ?? []; a.push(p); g.set(p.category, a); } return [...g.entries()];
  }, [q]);
  return <div className="text-[12px]" data-testid="cad-parts">
    <div className="relative mb-2"><Search size={12} className="absolute left-2 top-2" style={{ color: DIM }}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search bolts, gears, bearings…" aria-label="Search parts" className="w-full h-7 rounded-md bg-white/5 border border-white/10 pl-6 pr-2 text-[11px] text-white"/></div>
    {current && <div className="mb-3 p-2 rounded-lg" style={{ background: 'rgba(125,211,252,.06)', border: '1px solid rgba(125,211,252,.25)' }} data-testid="cad-part-params">
      <div className="font-bold">{current.name}</div>
      <div className="text-[10px] mb-1.5" style={{ color: DIM }}>{current.about}{current.standard ? ` · ${current.standard}` : ''}</div>
      {current.params.map(d => <label key={d.key} className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-[11px]" style={{ color: DIM }}>{d.label}{d.unit ? ` (${d.unit})` : ''}</span>
        {d.kind === 'choice'
          ? <select value={String(params[d.key] ?? d.default)} onChange={e => onParams({ ...params, [d.key]: e.target.value })} className="h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label={d.label}>{d.choices!.map(c => <option key={c} value={c} style={{ background: '#15131d' }}>{c}</option>)}</select>
          : <input type="number" step="any" value={Number(params[d.key] ?? d.default)} onChange={e => { const v = +e.target.value; if (Number.isFinite(v)) onParams({ ...params, [d.key]: Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v)) }); }} className="w-20 h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white text-right" aria-label={d.label}/>}
      </label>)}
      <div className="text-[9.5px] mt-1.5" style={{ color: DIM }}>Our own geometry from published standard dimensions; free to use (CC0). Threads are cosmetic.</div>
    </div>}
    {groups.map(([cat, parts]) => <div key={cat} className="mb-2">
      <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: DIM }}>{cat}</div>
      {parts.map(p => <button key={p.id} onClick={() => onPick(p)} data-testid={`cad-part-${p.id}`} className="w-full text-left px-2 py-1.5 rounded-md mb-0.5" style={{ background: current?.id === p.id ? 'rgba(125,211,252,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${current?.id === p.id ? 'rgba(125,211,252,.4)' : 'rgba(255,255,255,.06)'}` }}>
        <div className="font-semibold text-[11.5px]">{p.name}</div>{p.standard && <div className="text-[10px]" style={{ color: DIM }}>{p.standard}</div>}
      </button>)}
    </div>)}
    <div className="text-[10px]" style={{ color: DIM }}>{MECH_PARTS.length} parts. Pick one, set its size, then export STL or add it to your document.</div>
  </div>;
}
