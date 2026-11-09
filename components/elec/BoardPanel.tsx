// Board tab: the schematic laid out and routed as a two-layer PCB. The centre view shows the board
// (layers switchable); the side panel lays out and routes, lists DRC results, and downloads the
// Gerber zip / assembly files / KiCad board once the safety review and DRC are clear.

import React, { useMemo } from 'react';
import { Download, Route, Factory, Layers } from 'lucide-react';
import type { Layout, DrcItem, FpStyle } from '../../services/elec/pcb';
import { drcCounts } from '../../services/elec/pcb';
import { boardSvg, COPPER, type BoardLayers } from '../../services/elec/pcb/svg';

const C = { line: 'rgba(255,255,255,.08)', dim: 'rgba(255,255,255,.5)', accent: '#fbbf24' };
const LEVEL: Record<string, string> = { error: '#f87171', warning: '#fbbf24', pass: '#4ade80' };

export function BoardView({ layout, layers, focus }: { layout: Layout | null; layers: BoardLayers; focus?: [number, number] | null }) {
  const svg = useMemo(() => layout ? boardSvg(layout.board, { layers, drc: layout.drc, fit: true, focus: focus ?? undefined }) : '', [layout, layers, focus]);
  if (!layout) return <div className="absolute inset-0 grid place-items-center text-[13px]" style={{ color: C.dim, background: '#0c0d12' }} data-testid="elec-board-empty">Press “Lay out & route” in the Board panel to turn this schematic into a board.</div>;
  return <div className="absolute inset-0 p-6" style={{ background: '#0c0d12' }} data-testid="elec-board-view" dangerouslySetInnerHTML={{ __html: svg }}/>;
}

export interface BoardSideProps {
  layout: Layout | null; stale: boolean; busy: boolean; style: FpStyle; onStyle: (s: FpStyle) => void; onRoute: () => void;
  layers: BoardLayers; onLayers: (l: BoardLayers) => void; onFocus: (p: [number, number] | null) => void;
  onGerbers: () => void; onPackage: () => void; onBom: () => void; onCpl: () => void; onKicad: () => void; onGetMade: () => void;
  openHazards: number;
}

export default function BoardSide(p: BoardSideProps) {
  const L = p.layout; const k = L ? drcCounts(L.drc) : { errors: 0, warnings: 0 };
  const blocked = !L || p.stale || k.errors > 0;
  const why = !L ? 'Lay out the board first.' : p.stale ? 'The schematic changed: lay out again.' : k.errors ? `Fix ${k.errors} DRC error${k.errors > 1 ? 's' : ''} first.` : '';
  const sorted: DrcItem[] = L ? [...L.drc].sort((a, b) => ['error', 'warning', 'pass'].indexOf(a.level) - ['error', 'warning', 'pass'].indexOf(b.level)) : [];
  const Toggle = ({ k: key, label, color }: { k: keyof BoardLayers; label: string; color?: string }) => <label className="flex items-center gap-1.5 text-[11px] py-0.5 cursor-pointer"><input type="checkbox" checked={p.layers[key]} onChange={e => p.onLayers({ ...p.layers, [key]: e.target.checked })} data-testid={`elec-board-layer-${key}`}/>{color && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }}/>}{label}</label>;
  return <div data-testid="elec-board">
    <div className="flex items-center gap-2 mb-2">
      <select value={p.style} onChange={e => p.onStyle(e.target.value as FpStyle)} className="h-7 rounded bg-white/5 border border-white/10 text-[11px] text-white" aria-label="Footprint style" data-testid="elec-board-style">
        <option value="tht" style={{ background: '#12141b' }}>Through-hole (hand solder)</option><option value="smd" style={{ background: '#12141b' }}>Surface mount (assembly)</option>
      </select>
    </div>
    <button className="elec-btn elec-primary w-full justify-center mb-2" onClick={p.onRoute} disabled={p.busy} data-testid="elec-board-route"><Route size={13}/>{p.busy ? 'Routing…' : L ? 'Lay out & route again' : 'Lay out & route'}</button>
    {L && <div className="text-[11px] mb-2 leading-snug" style={{ color: C.dim }} data-testid="elec-board-summary">
      2 layers · {L.board.W} × {L.board.H} mm · {L.board.parts.length} parts · {L.board.tracks.length} tracks · {L.board.vias.length} vias · routed in {(L.ms / 1000).toFixed(1)} s{p.stale ? <b style={{ color: C.accent }}> · out of date</b> : null}
    </div>}
    <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mt-2 mb-1 flex items-center gap-1" style={{ color: C.dim }}><Layers size={11}/>Layers</div>
    <div className="grid grid-cols-2 gap-x-2 mb-2">
      <Toggle k="top" label="Top copper" color={COPPER.top}/><Toggle k="bottom" label="Bottom copper" color={COPPER.bottom}/>
      <Toggle k="silk" label="Silkscreen" color="#f4f4f0"/><Toggle k="drills" label="Drills"/>
      <Toggle k="ratsnest" label="Ratsnest" color="#f0f"/><Toggle k="drc" label="DRC markers" color="#ff4d4d"/>
    </div>
    {L && <>
      <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mt-3 mb-1" style={{ color: C.dim }}>Design rules</div>
      <div className="flex gap-3 mb-1.5 text-[11px]" data-testid="elec-board-drc-counts"><span style={{ color: LEVEL.error }}>{k.errors} errors</span><span style={{ color: LEVEL.warning }}>{k.warnings} warnings</span></div>
      <div data-testid="elec-board-drc">{sorted.map((d, i) => <button key={i} onClick={() => p.onFocus(d.at ?? null)} className="w-full text-left p-1.5 rounded-md mb-1 text-[11px] leading-snug" style={{ background: 'rgba(255,255,255,.03)', borderLeft: `3px solid ${LEVEL[d.level]}` }}>
        <span className="text-[9px] font-extrabold uppercase mr-1" style={{ color: LEVEL[d.level] }}>{d.rule}</span>{d.text}</button>)}</div>
      {L.board.notes.length > 0 && <><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mt-3 mb-1" style={{ color: C.dim }}>Before you order</div>
        <ul className="text-[10.5px] leading-snug list-disc pl-4" style={{ color: 'rgba(255,255,255,.65)' }}>{L.board.notes.map((n, i) => <li key={i} className="mb-0.5">{n}</li>)}</ul></>}
    </>}
    <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mt-3 mb-1" style={{ color: C.dim }}>Make it</div>
    {why && <div className="text-[10.5px] mb-1.5" style={{ color: C.accent }} data-testid="elec-board-blocked">{why}</div>}
    {p.openHazards > 0 && <div className="text-[10.5px] mb-1.5" style={{ color: '#fda4af' }}>{p.openHazards} safety item{p.openHazards > 1 ? 's' : ''} to review before downloading.</div>}
    <div className="grid grid-cols-2 gap-1.5">
      <button className="elec-btn justify-center" onClick={p.onGerbers} disabled={blocked} data-testid="elec-board-gerbers" title="Gerber RS-274X + Excellon drill, zipped for JLCPCB / PCBWay / OSH Park"><Download size={13}/>Gerber zip</button>
      <button className="elec-btn justify-center" onClick={p.onPackage} disabled={blocked} data-testid="elec-board-package" title="Gerbers, BOM, pick-and-place, KiCad board and a read-me"><Download size={13}/>Everything</button>
      <button className="elec-btn justify-center" onClick={p.onBom} disabled={!L || p.stale}><Download size={13}/>BOM</button>
      <button className="elec-btn justify-center" onClick={p.onCpl} disabled={!L || p.stale}><Download size={13}/>Pick & place</button>
      <button className="elec-btn justify-center col-span-2" onClick={p.onKicad} disabled={!L || p.stale} data-testid="elec-board-kicad"><Download size={13}/>KiCad board (.kicad_pcb)</button>
    </div>
    <button className="elec-btn elec-primary w-full justify-center mt-2" onClick={p.onGetMade} disabled={blocked} data-testid="elec-board-getmade"><Factory size={13}/>Get it made</button>
    <div className="text-[10px] mt-2 leading-snug" style={{ color: C.dim }}>Footprints are Plajah's own drawings of common packages; check connectors, pots and modules against the parts you buy. 1.6 mm FR-4, 1 oz copper, rules inside standard 2-layer capability (0.2 mm spacing, 0.3 mm vias).</div>
  </div>;
}
