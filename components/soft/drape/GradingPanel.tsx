// Grading: rules derived from our drafts or imported (AAMA/ASTM DXF + RUL, Seamly2D/Valentina SVG,
// flat DXF), editable per rule and size break, nested size view, and exchange files out.

import React, { useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { ParamValue, Pattern, SoftTemplate } from '../../../services/soft/patterns';
import { softDefaults } from '../../../services/soft/patterns';
import { deriveGrading, nestSvg, type GradedPattern, ungraded } from '../../../services/soft/drape/grading';
import { writeAama, readAama, readRul } from '../../../services/soft/drape/aama';
import { importSvg, importDxf } from '../../../services/soft/drape/importPattern';

const dl = (name: string, data: string, type: string) => { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); };

export default function GradingPanel({ pattern, template, params, unit }: { pattern: Pattern; template: SoftTemplate; params: Record<string, ParamValue>; unit: 'cm' | 'in' }) {
  const derived = useMemo<GradedPattern | null>(() => {
    const sizes = pattern.grading?.sizes; if (!sizes?.length || !pattern.size) return null;
    const drafts = Object.fromEntries(sizes.map(s => [s, template.build({ ...softDefaults(template), ...params, size: s })])); return deriveGrading(drafts, sizes, pattern.size, `${pattern.template} grade rules`);
  }, [pattern, template, params]);
  const [imported, setImported] = useState<GradedPattern | null>(null); const [warn, setWarn] = useState<string[]>([]); const [edits, setEdits] = useState<Record<string, number>>({});
  const rulRef = useRef<string | null>(null); const fileRef = useRef<HTMLInputElement>(null);
  const base = imported ?? derived ?? ungraded(pattern);
  const g: GradedPattern = useMemo(() => ({ ...base, table: { ...base.table, rules: base.table.rules.map(r => ({ ...r, deltas: r.deltas.map((d, k) => [edits[`${r.id}:${k}:x`] ?? d[0], edits[`${r.id}:${k}:y`] ?? d[1]] as [number, number]) })) } }), [base, edits]);
  const k = unit === 'in' ? 25.4 : 1; const u = unit === 'in' ? 'in' : 'mm';
  const onFile = async (files: FileList | null) => {
    if (!files?.length) return; const list = [...files]; const rul = list.find(f => /\.rul$/i.test(f.name)); if (rul) rulRef.current = await rul.text();
    const main = list.find(f => !/\.rul$/i.test(f.name)); if (!main) { if (imported && rulRef.current) setImported({ ...imported, table: readRul(rulRef.current) }); return; }
    const text = await main.text(); setEdits({});
    try {
      if (/\.svg$/i.test(main.name)) { const r = importSvg(text, main.name.replace(/\.\w+$/, '')); setImported(ungraded(r.pattern)); setWarn(r.warnings); }
      else if (/Piece Name:/i.test(text)) { const r = readAama(text, rulRef.current ?? undefined); setImported(r.graded); setWarn(r.warnings); }
      else { const r = importDxf(text, main.name.replace(/\.\w+$/, '')); setImported(r.graded ?? ungraded(r.pattern)); setWarn(r.warnings); }
    } catch (e) { setWarn([`Could not read ${main.name}: ${String((e as Error).message ?? e)}`]); }
  };
  const nest = useMemo(() => { try { return nestSvg(g); } catch { return ''; } }, [g]);
  const out = () => { const { dxf, rul } = writeAama(g, { style: g.pattern.name }); const nm = g.pattern.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'pattern'; dl(`${nm} AAMA.dxf`, dxf, 'application/dxf'); dl(`${nm}.rul`, rul, 'text/plain'); };
  const outAll = () => { const { dxf } = writeAama(g, { style: g.pattern.name, allSizes: true }); dl(`${(g.pattern.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'pattern')} all sizes.dxf`, dxf, 'application/dxf'); };
  const nPts = Object.values(g.points).reduce((s, x) => s + x.length, 0);
  return <div data-testid="drape-grading" className="text-[12px]">
    <div className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,.55)' }}>{imported ? `Imported: ${g.pattern.name}, ${g.pattern.pieces.length} pieces.` : derived ? `Rules derived from our ${pattern.name.replace(/ size .*/, '')} drafts.` : 'This pattern has one size; add rules by importing a graded file.'} {g.table.rules.length} rules on {nPts} grade points · sample size <b>{g.table.base}</b> · {g.table.sizes.length} sizes.</div>
    <div className="grid grid-cols-2 gap-1.5 mb-2">
      <button className="sew-btn justify-center" onClick={out} data-testid="drape-aama-out"><Download size={12}/>AAMA DXF + RUL</button>
      <button className="sew-btn justify-center" onClick={outAll} data-testid="drape-aama-all"><Download size={12}/>All sizes DXF</button>
      <button className="sew-btn justify-center" onClick={() => dl(`${g.pattern.name} nest.svg`, nest, 'image/svg+xml')}><Download size={12}/>Nest SVG</button>
      <button className="sew-btn justify-center" onClick={() => fileRef.current?.click()} data-testid="drape-import"><Upload size={12}/>Import…</button>
      <input ref={fileRef} type="file" multiple accept=".dxf,.rul,.svg" className="hidden" onChange={e => { void onFile(e.target.files); e.target.value = ''; }} data-testid="drape-import-file"/>
    </div>
    <div className="text-[10.5px] mb-2" style={{ color: 'rgba(255,255,255,.45)' }}>Import AAMA/ASTM D6673 DXF (pick the .rul too), Seamly2D/Valentina SVG or DXF, or any flat DXF of closed outlines.</div>
    {warn.map((w, i) => <div key={i} className="text-[11px] mb-1" style={{ color: '#fcd34d' }}>{w}</div>)}
    {nest && <div className="rounded-lg bg-white p-1 mb-2 overflow-auto" style={{ maxHeight: 220 }} dangerouslySetInnerHTML={{ __html: nest.replace(/width="[^"]*" height="[^"]*"/, 'width="100%" height="200"') }} data-testid="drape-nest"/>}
    <div className="sew-h">Rule table ({u} per size break)</div>
    <div className="overflow-x-auto"><table className="text-[10.5px]" data-testid="drape-rules"><thead><tr><td className="pr-1">#</td>{g.table.sizes.slice(0, -1).map((s, i) => <td key={i} className="px-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,.5)' }}>{s}→{g.table.sizes[i + 1]}</td>)}</tr></thead>
      <tbody>{g.table.rules.slice(0, 60).map(r => <tr key={r.id}><td className="pr-1 font-bold">{r.id}</td>{r.deltas.map((d, i) => <td key={i} className="px-0.5">
        {(['x', 'y'] as const).map((ax, j) => <input key={ax} className="w-[42px] h-6 rounded bg-white/5 border border-white/10 px-0.5 text-white text-[10px]" type="number" step="0.1" value={Math.round(d[j] / k * 100) / 100} onChange={e => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) setEdits(s => ({ ...s, [`${r.id}:${i}:${ax}`]: x * k })); }} title={`rule ${r.id} ${ax}`}/>)}</td>)}</tr>)}</tbody></table>
      {g.table.rules.length > 60 && <div className="text-[10px]" style={{ color: 'rgba(255,255,255,.4)' }}>Showing 60 of {g.table.rules.length} rules; all are exported.</div>}</div>
  </div>;
}
