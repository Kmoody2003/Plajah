// Sheet-metal part: describe a brake-formed profile or a tray, see its flat pattern, bend table and
// checks, and download the flat as DXF (outline on CUT, bend lines on BEND) for the laser and the brake.

import React, { useMemo, useState } from 'react';
import { Download, Layers } from 'lucide-react';
import { SHEET_MATERIALS, sheetMaterial, bendTable, flatPattern, flatToDxf, sheetChecks, type SheetPart, type Bend } from '../../services/fab/sheetMetal';
import { processHazards, openHazards, sortHazards } from '../../services/safety/hazards';
import SafetyPanel from '../safety/SafetyPanel';

const DIM = 'rgba(255,255,255,.5)';
const LV: Record<string, string> = { error: '#f87171', warn: '#fbbf24', info: '#93c5fd', pass: '#4ade80' };
const field = 'h-6 rounded bg-white/5 border border-white/10 px-1.5 text-[11px] text-white';

/** "90 up, 45 down" → bends. */
export function parseBends(text: string): Bend[] {
  return text.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => { const m = /(-?\d+(?:\.\d+)?)\s*°?\s*(up|down|u|d)?/i.exec(s); return { angle: m ? Math.min(179, Math.max(1, +m[1])) : 90, dir: m?.[2] && /^d/i.test(m[2]) ? 'down' : 'up' } as Bend; });
}
const parseNums = (text: string) => text.split(/[,;\s]+/).map(Number).filter(v => Number.isFinite(v) && v > 0);

export default function SheetMetalPanel({ name = 'part', brakeTons, brakeLength }: { name?: string; brakeTons?: number; brakeLength?: number }) {
  const [kind, setKind] = useState<'profile' | 'tray'>('profile');
  const [material, setMaterial] = useState('steel-cr'); const mat = sheetMaterial(material);
  const [t, setT] = useState(2); const table = useMemo(() => bendTable(material, t), [material, t]);
  const [radius, setRadius] = useState<number | ''>(''); const R = radius === '' ? table.R : radius;
  const [segText, setSegText] = useState('40, 60, 40'); const [bendText, setBendText] = useState('90 up, 90 up'); const [dims, setDims] = useState<'outside' | 'inside' | 'flat'>('outside'); const [width, setWidth] = useState(100);
  const [tray, setTray] = useState({ w: 120, l: 80, s: 25, e: 25, n: 25, wf: 25 });
  const [acks, setAcks] = useState<string[]>([]); const [tons, setTons] = useState(brakeTons ?? 0);
  const part: SheetPart = kind === 'profile'
    ? { kind, material, t, width, radius: R, segments: parseNums(segText), dims, bends: parseBends(bendText) }
    : { kind, material, t, radius: R, w: tray.w, l: tray.l, flanges: { s: tray.s, e: tray.e, n: tray.n, w: tray.wf } };
  const result = useMemo(() => { try { return { flat: flatPattern(part), checks: sheetChecks(part, { brakeTons: tons > 0 ? tons : undefined, brakeLength }), error: '' }; } catch (e: any) { return { flat: null, checks: null, error: String(e?.message ?? e) }; } }, [JSON.stringify(part), tons, brakeLength]); // eslint-disable-line react-hooks/exhaustive-deps
  const hazards = useMemo(() => sortHazards([...processHazards('press-brake'), ...(result.checks?.hazards ?? [])]), [result.checks]);
  const open = openHazards(hazards, acks); const errors = result.checks?.findings.filter(f => f.level === 'error') ?? [];
  const num = (v: number, set: (n: number) => void, label: string, step = 1) => <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>{label}</span><input type="number" step={step} value={v} onChange={e => set(+e.target.value)} className={`w-20 ${field}`} aria-label={label}/></label>;

  return <div className="text-[12px] mt-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }} data-testid="sheet-metal">
    <div className="flex items-center gap-1.5 font-bold mb-1.5"><Layers size={13} color="#fbbf24"/>Sheet-metal part</div>
    <div className="flex gap-1 mb-1.5">{(['profile', 'tray'] as const).map(k => <button key={k} className={`cad-btn flex-1 justify-center ${kind === k ? 'cad-primary' : ''}`} onClick={() => setKind(k)} data-testid={`sheet-kind-${k}`}>{k === 'profile' ? 'Bent profile' : 'Tray / box'}</button>)}</div>
    <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Material</span><select value={material} onChange={e => { setMaterial(e.target.value); const m = sheetMaterial(e.target.value); if (!m.thicknesses.includes(t)) setT(m.thicknesses[Math.floor(m.thicknesses.length / 2)]); }} className={`w-36 ${field}`} aria-label="Sheet material">{SHEET_MATERIALS.map(m => <option key={m.id} value={m.id} style={{ background: '#15131d' }}>{m.name}</option>)}</select></label>
    <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Thickness (mm)</span><select value={t} onChange={e => setT(+e.target.value)} className={`w-20 ${field}`} aria-label="Sheet thickness">{mat.thicknesses.map(v => <option key={v} value={v} style={{ background: '#15131d' }}>{v}</option>)}</select></label>
    <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Inside radius (mm)</span><input type="number" step={0.1} value={radius} placeholder={String(table.R)} onChange={e => setRadius(e.target.value === '' ? '' : +e.target.value)} className={`w-20 ${field}`} aria-label="Inside radius"/></label>
    {kind === 'profile' ? <>
      <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Flanges (mm)</span><input value={segText} onChange={e => setSegText(e.target.value)} className={`w-32 ${field}`} aria-label="Flange lengths" data-testid="sheet-segments"/></label>
      <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Bends</span><input value={bendText} onChange={e => setBendText(e.target.value)} className={`w-32 ${field}`} aria-label="Bends" data-testid="sheet-bends"/></label>
      <label className="flex items-center justify-between py-0.5 gap-2"><span style={{ color: DIM }}>Flanges measured</span><select value={dims} onChange={e => setDims(e.target.value as typeof dims)} className={`w-32 ${field}`} aria-label="Dimension type"><option value="outside" style={{ background: '#15131d' }}>Outside</option><option value="inside" style={{ background: '#15131d' }}>Inside</option><option value="flat" style={{ background: '#15131d' }}>Flat (tangent)</option></select></label>
      {num(width, setWidth, 'Width (mm)')}
      <div className="text-[10px]" style={{ color: DIM }}>One more flange than bends, e.g. a channel: 40, 60, 40 with 90 up, 90 up.</div>
    </> : <>
      {num(tray.w, v => setTray(x => ({ ...x, w: v })), 'Base width (outside, mm)')}{num(tray.l, v => setTray(x => ({ ...x, l: v })), 'Base length (outside, mm)')}
      {num(tray.s, v => setTray(x => ({ ...x, s: v })), 'Front flange (0 = none)')}{num(tray.e, v => setTray(x => ({ ...x, e: v })), 'Right flange')}{num(tray.n, v => setTray(x => ({ ...x, n: v })), 'Back flange')}{num(tray.wf, v => setTray(x => ({ ...x, wf: v })), 'Left flange')}
    </>}
    {num(tons, setTons, 'Brake rating (t, 0 = unknown)')}
    {result.error && <div className="text-[10.5px] mt-1" style={{ color: LV.error }}>{result.error}</div>}
    {result.flat && <>
      <FlatPreview flat={result.flat}/>
      <div className="text-[11px] mt-1" data-testid="sheet-flat-size">Flat {result.flat.size[0].toFixed(2)} × {result.flat.size[1].toFixed(2)} mm · {result.flat.bends.length} bend{result.flat.bends.length === 1 ? '' : 's'} · K {result.flat.K.toFixed(3)} · R {R}</div>
      <details className="mt-1"><summary className="cursor-pointer text-[10.5px]">Bend table: {mat.name}, {t} mm</summary>
        <div className="text-[10px] mt-1" style={{ color: DIM }}>V die {table.V} mm · formed radius ≈ {table.R} mm · K {table.K.toFixed(3)} (DIN 6935) · min flange {table.minFlange} mm · {(table.forcePerM / 9.80665).toFixed(1)} t/m · springback ≈ {table.springback}°</div>
        <table className="w-full text-[10px] mt-1 tabular-nums" data-testid="sheet-bend-table"><thead><tr style={{ color: DIM }}><th className="text-left">Angle</th><th className="text-right">BA</th><th className="text-right">BD</th><th className="text-right">OSSB</th></tr></thead>
          <tbody>{table.rows.map(r => <tr key={r.angle}><td>{r.angle}°</td><td className="text-right">{r.ba.toFixed(2)}</td><td className="text-right">{r.bd.toFixed(2)}</td><td className="text-right">{r.ossb.toFixed(2)}</td></tr>)}</tbody></table></details>
      <div className="mt-1.5">{result.checks!.findings.map((f, i) => <div key={i} className="flex gap-1.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: LV[f.level] }}/><div><div className="font-semibold">{f.title}</div>{f.detail && <div className="text-[10.5px]" style={{ color: DIM }}>{f.detail}</div>}</div></div>)}</div>
      <div className="mt-1.5"><SafetyPanel hazards={hazards} acked={acks} onAck={(id, v) => setAcks(a => v ? [...new Set([...a, id])] : a.filter(x => x !== id))} title="Bending safety"/></div>
      <button className="cad-btn cad-primary w-full justify-center mt-1.5" disabled={errors.length > 0 || open.length > 0} data-testid="sheet-dxf"
        onClick={() => { const u = URL.createObjectURL(new Blob([flatToDxf(result.flat!, t, name)], { type: 'application/dxf' })); const a = document.createElement('a'); a.href = u; a.download = `${name}-flat.dxf`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }}>
        <Download size={13}/>{errors.length ? 'Fix the problems above' : open.length ? 'Acknowledge the safety items above' : 'Flat pattern DXF'}</button>
      <div className="text-[10px] mt-1" style={{ color: DIM }}>Cut outline on layer CUT, bend centre lines on BEND, direction / angle / radius on BEND_NOTES. Check the first part against the drawing: real K-factors vary with the tooling.</div>
    </>}
  </div>;
}

function FlatPreview({ flat }: { flat: NonNullable<ReturnType<typeof flatPattern>> }) {
  const pts = flat.outline; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1; const pad = Math.max(w, h) * 0.04;
  // SVG y runs down; flip so the drawing reads as in CAD.
  const P = (p: number[]) => `${(p[0] - x0).toFixed(3)},${(h - (p[1] - y0)).toFixed(3)}`;
  return <svg viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`} className="w-full mt-1.5 rounded-lg" style={{ maxHeight: 180, background: '#07080b', border: '1px solid rgba(255,255,255,.08)' }} data-testid="sheet-flat-preview">
    <polygon points={pts.map(P).join(' ')} fill="rgba(251,191,36,.08)" stroke="#fbbf24" strokeWidth={Math.max(w, h) / 300}/>
    {flat.holes.map((c, i) => <circle key={i} cx={c.c[0] - x0} cy={h - (c.c[1] - y0)} r={c.r} fill="#07080b" stroke="#fbbf24" strokeWidth={Math.max(w, h) / 300}/>)}
    {flat.bends.map((b, i) => <line key={i} x1={b.a[0] - x0} y1={h - (b.a[1] - y0)} x2={b.b[0] - x0} y2={h - (b.b[1] - y0)} stroke={b.dir === 'up' ? '#7dd3fc' : '#f472b6'} strokeDasharray={`${Math.max(w, h) / 60} ${Math.max(w, h) / 90}`} strokeWidth={Math.max(w, h) / 300}/>)}
  </svg>;
}
