// Library panel: the architectural symbol library (parametric) and the blocks in the drawing,
// plus blocks loaded from another DWG/DXF (a firm's standard library file).

import React, { useMemo, useRef, useState } from 'react';
import { Search, FolderOpen, Package } from 'lucide-react';
import type { CadModel, CadBlock } from '../../services/cad/model';
import { MM_PER_UNIT, emptyModel } from '../../services/cad/model';
import { drawingToSvg } from '../../services/cad/dxf';
import { LIBRARY, CATEGORIES, defaultParams, makeBlock, userBlocks, type LibraryItem, type Params, type LibraryCategory } from '../../services/cad/library';

export interface Placing { block: CadBlock; layer: string; label: string; item?: { id: string; params: Params } }

const DIM = 'rgba(255,255,255,.5)';
const thumbCache = new Map<string, string>();

function thumb(id: string, entities: CadBlock['entities'], blocks: CadBlock[] = []): string {
  const hit = thumbCache.get(id); if (hit) return hit;
  const m = emptyModel('t', 'dxf', 'plajah-dxf'); m.entities = entities; m.blocks = blocks; m.layers = [{ name: '0', color: '#d6d3e0', visible: true }];
  const svg = drawingToSvg(m, { width: 120, background: null, mono: '#d6d3e0' });
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  thumbCache.set(id, url); return url;
}

export default function LibraryPanel({ model, currentLayer, onPlace, onLoadBlocks, placingLabel }: { model: CadModel; currentLayer: string; onPlace: (p: Placing) => void; onLoadBlocks: (file: File) => void; placingLabel?: string | null }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState<LibraryCategory | 'All'>('All');
  const [open, setOpen] = useState<LibraryItem | null>(null); const [params, setParams] = useState<Params>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const unitsPerMm = 1 / MM_PER_UNIT[model.units];
  const unitLabel = model.units === 'unitless' ? 'units' : model.units;
  const items = useMemo(() => LIBRARY.filter(i => (cat === 'All' || i.category === cat) && (!q.trim() || `${i.name} ${i.category} ${i.about}`.toLowerCase().includes(q.trim().toLowerCase()))), [q, cat]);
  const mine = userBlocks(model);

  const choose = (item: LibraryItem) => { setOpen(item); setParams(defaultParams(item)); };
  const place = () => { if (!open) return; onPlace({ block: makeBlock(open, params, model.units), layer: open.layer, label: open.name, item: { id: open.id, params: { ...defaultParams(open), ...params } } }); };
  // Lengths are stored in mm; shown and typed in the drawing's units.
  const show = (v: number) => +(v * unitsPerMm).toPrecision(5);

  return <div className="text-[12px]" data-testid="cad-library">
    <div className="relative mb-1.5">
      <Search size={12} className="absolute left-2 top-2" style={{ color: DIM }}/>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search doors, beds, toilets…" aria-label="Search the library" className="w-full h-7 rounded-md bg-white/5 border border-white/10 pl-6 pr-2 text-[11px] text-white" data-testid="cad-library-search"/>
    </div>
    <div className="flex flex-wrap gap-1 mb-2">
      {(['All', ...CATEGORIES] as const).map(c => <button key={c} onClick={() => setCat(c)} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: cat === c ? 'rgba(125,211,252,.16)' : 'rgba(255,255,255,.04)', color: cat === c ? '#7dd3fc' : DIM }}>{c}</button>)}
    </div>
    {placingLabel && <div className="mb-2 px-2 py-1.5 rounded-md text-[11px]" style={{ background: 'rgba(255,176,32,.1)', color: '#ffb020' }}>Placing {placingLabel}. Click in the drawing; Esc when done.</div>}

    {open && <div className="mb-2 p-2 rounded-lg" style={{ background: 'rgba(125,211,252,.06)', border: '1px solid rgba(125,211,252,.25)' }} data-testid="cad-library-item">
      <div className="flex gap-2 items-start mb-1.5">
        <img src={thumb(`${open.id}:${JSON.stringify(params)}`, open.build({ ...defaultParams(open), ...params }))} alt="" className="w-14 h-14 rounded bg-black/30 object-contain shrink-0"/>
        <div className="min-w-0"><div className="font-bold">{open.name}</div><div className="text-[10px] leading-snug" style={{ color: DIM }}>{open.about}</div><div className="text-[10px] mt-0.5" style={{ color: DIM }}>Layer {open.layer}</div></div>
      </div>
      {open.params.map(d => <label key={d.key} className="flex items-center justify-between gap-2 py-0.5">
        <span style={{ color: DIM }} className="text-[11px]">{d.label}{d.kind === 'length' ? ` (${unitLabel})` : d.kind === 'angle' ? ' (°)' : ''}</span>
        {d.kind === 'choice'
          ? <select value={String(params[d.key])} onChange={e => setParams(p => ({ ...p, [d.key]: e.target.value }))} className="h-6 rounded bg-white/5 border border-white/10 text-[11px] text-white">{d.choices!.map(c => <option key={c} value={c} style={{ background: '#15131d' }}>{c}</option>)}</select>
          : d.kind === 'text'
            ? <input value={String(params[d.key])} onChange={e => setParams(p => ({ ...p, [d.key]: e.target.value }))} className="w-24 h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white"/>
            : <input type="number" step="any" value={d.kind === 'length' ? show(Number(params[d.key])) : Number(params[d.key])} onChange={e => { const raw = +e.target.value; if (!Number.isFinite(raw)) return; const mm = d.kind === 'length' ? raw / unitsPerMm : raw; setParams(p => ({ ...p, [d.key]: Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, d.kind === 'count' ? Math.round(mm) : mm)) })); }} className="w-20 h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white text-right" aria-label={d.label}/>}
      </label>)}
      <div className="flex gap-1.5 mt-1.5"><button className="cad-btn cad-primary flex-1 justify-center" style={{ height: 28 }} onClick={place} data-testid="cad-library-place">Place</button><button className="cad-btn" style={{ height: 28 }} onClick={() => setOpen(null)}>Close</button></div>
    </div>}

    <div className="grid grid-cols-3 gap-1.5">
      {items.map(i => <button key={i.id} onClick={() => choose(i)} title={i.about} data-testid={`cad-lib-${i.id}`} className="flex flex-col items-center gap-0.5 p-1 rounded-md hover:bg-white/5" style={{ border: `1px solid ${open?.id === i.id ? 'rgba(125,211,252,.5)' : 'rgba(255,255,255,.06)'}` }}>
        <img src={thumb(i.id, i.build(defaultParams(i)))} alt="" className="w-full h-12 object-contain" loading="lazy"/>
        <span className="text-[9.5px] leading-tight text-center line-clamp-2" style={{ color: 'rgba(255,255,255,.75)' }}>{i.name}</span>
      </button>)}
    </div>
    {!items.length && <div className="p-2" style={{ color: DIM }}>Nothing matches.</div>}

    <div className="mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
      <div className="flex items-center gap-1.5 mb-1.5"><Package size={12} style={{ color: DIM }}/><span className="text-[10px] font-extrabold uppercase tracking-[.12em]" style={{ color: DIM }}>Blocks in this drawing ({mine.length})</span></div>
      <button className="cad-btn w-full justify-center mb-1.5" style={{ height: 28 }} onClick={() => fileRef.current?.click()} data-testid="cad-load-blocks"><FolderOpen size={13}/>Load blocks from a DWG / DXF</button>
      <input ref={fileRef} type="file" accept=".dxf,.dwg" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onLoadBlocks(f); }}/>
      <div className="grid grid-cols-3 gap-1.5">
        {mine.slice(0, 120).map(b => <button key={b.name} title={b.name} onClick={() => onPlace({ block: b, layer: currentLayer, label: b.name })} className="flex flex-col items-center gap-0.5 p-1 rounded-md hover:bg-white/5" style={{ border: '1px solid rgba(255,255,255,.06)' }}>
          <img src={thumb(`user:${model.name}:${b.name}`, [{ type: 'insert', layer: '0', block: b.name, at: [0, 0, 0], scale: [1, 1, 1], rotation: 0 }], model.blocks)} alt="" className="w-full h-12 object-contain" loading="lazy"/>
          <span className="text-[9.5px] leading-tight text-center truncate w-full" style={{ color: 'rgba(255,255,255,.75)' }}>{b.name}</span>
        </button>)}
      </div>
      {mine.length > 120 && <div className="text-[10px] mt-1" style={{ color: DIM }}>Showing 120 of {mine.length}.</div>}
    </div>
  </div>;
}
