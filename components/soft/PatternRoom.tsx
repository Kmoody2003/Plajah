// Sewing & Plush: pick a pattern (plush, home textiles, bags, clothing), set the measurements, and
// it drafts every piece with seam allowance, notches and grainlines. Safety is checked from the
// first choice (who it is for, eyes, cords, sleepwear). Out come print-at-home tiles, a copy-shop
// sheet, cutter files (DXF/SVG for drag-knife and laser), a tech pack for a seamstress or factory,
// and a request to local makers or manufacturers in the Maker Exchange.

import React, { useMemo, useState } from 'react';
import { X, Download, ShieldAlert, Store, Scissors, Printer, FileText, Ruler, ListChecks, Package, FilePlus, ExternalLink, Layers } from 'lucide-react';
import { SOFT_TEMPLATES, softTemplateById, softDefaults, fmtLen, CHILD_SIZES, type Audience, type ParamValue, type ParamDef, type Pattern, type FabricRole } from '../../services/soft/patterns';
import { printSheet, marker, rolesOf, yardage, FABRIC_LABEL, cutChart, patternModel, gradedModel, markerSvg, pieceCaption, type SheetItem, type Marker } from '../../services/soft/layout';
import { sizesOf, sizeRange, gradeSet, gradePom, sizeStyle, sizeRangeLabel } from '../../services/soft/grading';
import Preview3D from './Preview3D';
import DrawingTracer from './DrawingTracer';
import { printPdf, techPackPdf, type Paper } from '../../services/soft/pdf';
import { writeDxf } from '../../services/cad/dxf';
import type { Pt } from '../../services/soft/geometry';
import { processHazards, sortHazards, openHazards } from '../../services/safety/hazards';
import { softHazards, softLabels, softRecallQueries, AUDIENCE_LABEL } from '../../services/safety/softHazards';
import SafetyPanel, { BuildTermsGate, termsAccepted } from '../safety/SafetyPanel';
import ExchangeRoom from '../supply/ExchangeRoom';
import { suppliersFor, type Category } from '../../services/supply/directory';

export interface PatternAddArgs { title: string; svg: string; width: number; height: number; cutList: string[][] }
export interface PatternRoomProps { onClose?: () => void; getToken?: () => Promise<string | null>; apiBase?: string; initialTemplate?: string; onAddToTela?: (a: PatternAddArgs) => Promise<void> }

const C = { bg: '#0d0c11', panel: '#14121a', line: 'rgba(255,255,255,.08)', text: '#ece9f1', dim: 'rgba(255,255,255,.5)', accent: '#f472b6' };
const KINDS: Array<[string, string]> = [['plush', 'Plush'], ['home', 'Home textiles'], ['bag', 'Bags'], ['apparel', 'Clothing']];
const CUTTERS = [{ id: 'scissors', label: 'Scissors / rotary cutter' }, { id: 'drag-knife', label: 'Drag-knife cutter (Cricut Maker, Silhouette, plotter)' }, { id: 'laser-co2', label: 'CO₂ laser' }];
const LASER_FABRICS = ['Cotton', 'Felt (wool)', 'Polyester', 'Fleece', 'Minky', 'Nylon', 'Faux leather (PVC)', 'Faux leather (PU)', 'Leather'];

function download(name: string, data: string | Uint8Array, type: string) {
  const blob = new Blob([data as BlobPart], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileBase = (s: string) => s.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'pattern';

/** Pieces as drafted (the print sheet), y up → SVG y down. */
function SheetSvg({ items, width, height, size, unit, sizes }: { items: SheetItem[]; width: number; height: number; size?: string; unit: 'cm' | 'in'; sizes?: string[] }) {
  const pad = 20; const Y = (y: number) => height - y; const d = (pts: Pt[]) => `M${pts.map(q => `${q[0].toFixed(1)},${Y(q[1]).toFixed(1)}`).join('L')}Z`;
  const fs = Math.max(6, Math.min(16, Math.max(width, height) / 70));
  return <svg viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`} className="w-full h-full" data-testid="sew-sheet">
    {items.map((it, i) => { const g0 = it.grain[0], g1 = it.grain[1]; const cx = (g0[0] + g1[0]) / 2, cy = (g0[1] + g1[1]) / 2; return <g key={i}>
      {it.nest?.length ? it.nest.map(n => { const st = sizeStyle(n.i); return <path key={`n${n.size}`} d={d(n.cut)} fill={n.i === it.nest!.length - 1 ? 'rgba(244,114,182,.05)' : 'none'} stroke={st.color} strokeWidth={Math.max(0.6, fs / 9)} strokeDasharray={st.dash.map(x => x * fs / 8).join(' ') || undefined} data-size={n.size}/>; })
        : <><path d={d(it.cut)} fill="rgba(244,114,182,.07)" stroke="#f9a8d4" strokeWidth={Math.max(0.6, fs / 10)}/>
          <path d={d(it.seam)} fill="none" stroke="#93c5fd" strokeWidth={Math.max(0.4, fs / 16)} strokeDasharray={`${fs / 3} ${fs / 4}`}/></>}
      {it.lines.map((l, k) => <path key={`l${k}`} d={`M${l.pts.map(q => `${q[0].toFixed(1)},${Y(q[1]).toFixed(1)}`).join('L')}`} fill="none" stroke="#93c5fd" strokeWidth={Math.max(0.5, fs / 12)}/>)}
      {it.fold && <line x1={it.fold[0][0]} y1={Y(it.fold[0][1])} x2={it.fold[1][0]} y2={Y(it.fold[1][1])} stroke="#fff" strokeWidth={fs / 5} strokeDasharray={`${fs} ${fs / 2}`}/>}
      <line x1={g0[0]} y1={Y(g0[1])} x2={g1[0]} y2={Y(g1[1])} stroke="#4ade80" strokeWidth={fs / 8} markerEnd="url(#sew-arrow)" markerStart="url(#sew-arrow)"/>
      {it.notches.map((n, k) => <circle key={k} cx={n[0]} cy={Y(n[1])} r={fs / 5} fill="#f87171"/>)}
      {it.marks.map((m, k) => <g key={`m${k}`}><circle cx={m.at[0]} cy={Y(m.at[1])} r={m.r ?? 3} fill="none" stroke="#f87171" strokeWidth={fs / 10}/></g>)}
      {pieceCaption(it.piece, size).map((t, k) => <text key={k} x={cx + fs * 0.6} y={Y(cy) - fs * 0.4 + k * fs * 1.15} fontSize={k ? fs * 0.75 : fs} fill={k ? 'rgba(255,255,255,.6)' : '#fff'} fontWeight={k ? 400 : 700}>{t}</text>)}
    </g>; })}
    <defs><marker id="sew-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#4ade80"/></marker></defs>
    <text x={0} y={height + pad * 0.8} fontSize={fs * 0.8} fill="rgba(255,255,255,.4)">{`${fmtLen(width, unit)} × ${fmtLen(height, unit)} sheet`}</text>
  </svg>;
}

/** Size key for a graded nest: colour and line style per size. */
function SizeKey({ sizes }: { sizes: string[] }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mb-2" data-testid="sew-size-key"><b style={{ color: 'rgba(255,255,255,.6)' }}>Size key</b>
    {sizes.map((s, i) => { const st = sizeStyle(i); return <span key={s} className="inline-flex items-center gap-1"><svg width="26" height="8"><line x1="1" y1="4" x2="25" y2="4" stroke={st.color} strokeWidth="2.2" strokeDasharray={st.dash.join(' ') || undefined}/></svg>{s}</span>; })}</div>;
}

function MarkerSvg({ mk, unit }: { mk: Marker; unit: 'cm' | 'in' }) {
  const W = Math.max(1, mk.length), H = mk.width; const Y = (y: number) => H - y; const d = (pts: Pt[]) => `M${pts.map(q => `${q[0].toFixed(1)},${Y(q[1]).toFixed(1)}`).join('L')}Z`; const fs = Math.max(8, H / 40);
  return <svg viewBox={`-10 -10 ${W + 20} ${H + 20}`} className="w-full" style={{ maxHeight: 260 }} data-testid={`sew-marker-${mk.role}`}>
    <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.25)" strokeWidth={fs / 8}/>
    {mk.placed.map((p, i) => <g key={i}><path d={d(p.cut)} fill="rgba(244,114,182,.18)" stroke="#f9a8d4" strokeWidth={fs / 10}/><text x={p.at[0] + fs * 0.4} y={Y(p.at[1] + p.h) + fs * 1.1} fontSize={fs * 0.8} fill="#fff">{p.label}</text></g>)}
    <text x={0} y={H + fs} fontSize={fs * 0.8} fill="rgba(255,255,255,.45)">{`selvedge ← ${fmtLen(mk.width, unit)} wide → selvedge · length ${fmtLen(mk.length, unit)}`}</text>
  </svg>;
}

export default function PatternRoom({ onClose, getToken, apiBase = '', initialTemplate, onAddToTela }: PatternRoomProps) {
  const [tid, setTid] = useState(initialTemplate && softTemplateById(initialTemplate) ? initialTemplate : 'plush-pal');
  const tpl = softTemplateById(tid)!;
  const [vals, setVals] = useState<Record<string, Record<string, ParamValue>>>({});
  const v = { ...softDefaults(tpl), ...(vals[tid] ?? {}) };
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  const [audienceBy, setAudienceBy] = useState<Record<string, Audience>>({});
  const audience = audienceBy[tid] ?? tpl.audience;
  const [selling, setSelling] = useState(false);
  const [view, setView] = useState<'pieces' | 'layout' | '3d'>('pieces');
  const [gradeBy, setGradeBy] = useState<Record<string, { on: boolean; from: string; to: string }>>({});
  const [right, setRight] = useState<'safety' | 'make' | 'materials' | 'steps'>('safety');
  const [cutter, setCutter] = useState('scissors'); const [laserFabric, setLaserFabric] = useState('Cotton');
  const [widths, setWidths] = useState<Partial<Record<FabricRole, number>>>({});
  const [acks, setAcks] = useState<string[]>([]);
  const [terms, setTerms] = useState(termsAccepted); const [exchange, setExchange] = useState(false);
  const [pack, setPack] = useState({ style: '', designer: '', season: '', colourways: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');

  const pattern: Pattern | null = useMemo(() => { try { return tpl.build(v); } catch (e) { console.error(e); return null; } }, [tid, JSON.stringify(v)]); // eslint-disable-line react-hooks/exhaustive-deps
  const allSizes = useMemo(() => sizesOf(tpl), [tpl]);
  const gradeUi = gradeBy[tid] ?? { on: false, from: '', to: '' };
  const rangeSizes = useMemo(() => {
    if (!gradeUi.on || allSizes.length < 2) return [];
    const cur = String(v.size ?? allSizes[0]); const group = allSizes.filter(s => CHILD_SIZES.includes(s) === CHILD_SIZES.includes(cur));
    return sizeRange(allSizes, gradeUi.from || group[0], gradeUi.to || group[group.length - 1]);
  }, [gradeUi.on, gradeUi.from, gradeUi.to, allSizes, v.size]);
  const grade = useMemo(() => (rangeSizes.length > 1 ? gradeSet(tpl, v, rangeSizes) : null), [tid, rangeSizes.join(','), JSON.stringify(v)]); // eslint-disable-line react-hooks/exhaustive-deps
  const setGrade = (x: Partial<{ on: boolean; from: string; to: string }>) => setGradeBy(s => ({ ...s, [tid]: { ...gradeUi, ...x } }));
  const sheet = useMemo(() => (grade ? printSheet(grade.base, undefined, 15, grade) : pattern ? printSheet(pattern) : null), [pattern, grade]);
  const markers = useMemo(() => (pattern ? rolesOf(pattern).map(r => marker(pattern, r, widths[r] ?? pattern.fabricWidth)) : []), [pattern, JSON.stringify(widths)]); // eslint-disable-line react-hooks/exhaustive-deps
  const hazards = useMemo(() => {
    if (!pattern) return [];
    const proc = cutter === 'laser-co2' ? processHazards('laser-co2', laserFabric.toLowerCase()) : cutter === 'drag-knife' ? processHazards('drag-knife') : [];
    return sortHazards([...softHazards(pattern, audience, selling), ...processHazards('sewing'), ...proc]);
  }, [pattern, audience, selling, cutter, laserFabric]);
  const queries = useMemo(() => (pattern ? softRecallQueries(pattern, audience) : []), [pattern, audience]);
  const open = openHazards(hazards, acks);
  const guard = (fn: () => void | Promise<void>) => {
    if (open.length) { setRight('safety'); setMsg(open.some(h => h.block) ? `Change the design first: ${open.filter(h => h.block).map(h => h.title).join('; ')}.` : `Acknowledge in Safety first: ${open.map(h => h.title).join('; ')}.`); return; }
    setMsg(''); void Promise.resolve(fn()).catch(e => setMsg(String(e?.message ?? e)));
  };
  const setParam = (k: string, x: ParamValue) => setVals(s => ({ ...s, [tid]: { ...(s[tid] ?? {}), [k]: x } }));
  const name = pattern ? fileBase(pattern.name) : 'pattern';
  const cats: Category[] = tpl.kind === 'plush' ? ['plush', 'textile'] : tpl.kind === 'apparel' ? ['apparel', 'print-on-demand'] : ['textile', 'print-on-demand'];
  const processes = tpl.kind === 'plush' ? ['plush', 'pattern'] : tpl.kind === 'apparel' ? ['cut-sew', 'sewing', 'pattern'] : ['sewing', 'upholstery'];

  const runPdf = async (paper: Paper) => { if (!pattern) return; setBusy(paper); try { const r = await printPdf(pattern, paper, unit, grade); download(`${name}${grade ? ` graded ${sizeRangeLabel(grade.sizes)}` : ''} ${paper}.pdf`, r.bytes, 'application/pdf'); setMsg(`${r.pages} page ${grade ? `graded (${sizeRangeLabel(grade.sizes)}) ` : ''}PDF ready. Print at 100% and check the test square.`); } finally { setBusy(''); } };
  const runPack = async () => { if (!pattern) return; setBusy('pack'); try { const b = await techPackPdf(pattern, { ...pack, audience: AUDIENCE_LABEL[audience], hazards, labels: softLabels(pattern, audience, selling), unit, grade }); download(`${name} tech pack.pdf`, b, 'application/pdf'); } finally { setBusy(''); } };
  const runDxf = () => { if (!pattern) return; download(`${name} cut.dxf`, writeDxf(patternModel(pattern, { cutOnly: cutter !== 'scissors', widths })), 'application/dxf'); };
  const runGradedDxf = () => { if (!grade) return; download(`${name} graded ${sizeRangeLabel(grade.sizes)}.dxf`, writeDxf(gradedModel(grade)), 'application/dxf'); setMsg(`Graded DXF: one layer per size (SIZE-${grade.sizes[0]} ... SIZE-${grade.sizes[grade.sizes.length - 1]}).`); };
  const runSvg = (mk: Marker) => download(`${name} ${mk.role}.svg`, markerSvg(mk, cutter !== 'scissors'), 'image/svg+xml');
  const addToDoc = async () => {
    if (!pattern || !sheet || !onAddToTela) return; setBusy('add');
    try { const mk = markers[0]; const svg = mk ? markerSvg(mk) : ''; await onAddToTela({ title: pattern.name, svg, width: Math.round(mk?.length ?? 800), height: Math.round(mk?.width ?? 600), cutList: cutChart(pattern, unit) }); setMsg('Added the layout and cut list to the document.'); } finally { setBusy(''); }
  };

  const paramInput = (p: ParamDef) => {
    const val = v[p.key];
    if (p.type === 'bool') return <label key={p.key} className="flex items-center gap-2 text-[12px] py-1" title={p.help}><input type="checkbox" checked={val === true} onChange={e => setParam(p.key, e.target.checked)} data-testid={`sew-p-${p.key}`}/>{p.label}</label>;
    if (p.type === 'select') return <label key={p.key} className="block text-[11px] py-1" style={{ color: C.dim }} title={p.help}>{p.label}<select className="sew-in" value={String(val)} onChange={e => setParam(p.key, e.target.value)} data-testid={`sew-p-${p.key}`}>{p.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{p.help && <span className="block text-[10px] mt-0.5">{p.help}</span>}</label>;
    const k = p.type === 'length' ? (unit === 'in' ? 25.4 : 10) : 1; const shown = Math.round(Number(val) / k * 100) / 100;
    return <label key={p.key} className="block text-[11px] py-1" style={{ color: C.dim }} title={p.help}>{p.label}{p.type === 'length' ? ` (${unit})` : ''}
      <input className="sew-in" type="number" value={shown} step={p.type === 'length' ? (unit === 'in' ? 0.125 : 0.5) : p.step ?? 1} min={p.min != null ? p.min / k : undefined} max={p.max != null ? p.max / k : undefined}
        onChange={e => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) setParam(p.key, Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, x * k))); }} data-testid={`sew-p-${p.key}`}/>{p.help && <span className="block text-[10px] mt-0.5">{p.help}</span>}</label>;
  };

  return <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: C.bg, color: C.text }} data-testid="sew-room">
    <div className="flex items-center gap-2 px-3 h-12 border-b shrink-0 overflow-x-auto sew-bar" style={{ borderColor: C.line }}>
      <Scissors size={16} color={C.accent}/><b className="text-[13px] sew-label">Sewing &amp; Plush</b><span className="text-[12px] truncate" style={{ color: C.dim }}>{pattern?.name}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: C.line }}>{(['cm', 'in'] as const).map(u => <button key={u} className={`px-2 h-8 text-[11px] font-bold ${unit === u ? 'bg-white/10 text-white' : 'text-white/50'}`} onClick={() => setUnit(u)} data-testid={`sew-unit-${u}`}>{u}</button>)}</div>
        <button className="sew-btn" onClick={() => setRight('safety')} data-testid="sew-safety-chip" style={open.length ? { borderColor: '#f43f5e', color: '#fda4af' } : undefined}><ShieldAlert size={14}/><span className="sew-label">{open.length ? `${open.length} to review` : 'Safety'}</span></button>
        <button className="sew-btn" onClick={() => setExchange(true)} data-testid="sew-exchange"><Store size={14}/><span className="sew-label">Get it made</span></button>
        {onAddToTela && <button className="sew-btn sew-primary" onClick={() => guard(addToDoc)} disabled={!!busy} data-testid="sew-add"><FilePlus size={14}/><span className="sew-label">Add to document</span></button>}
        {onClose && <button className="sew-btn" onClick={onClose} aria-label="Close" data-testid="sew-close"><X size={15}/></button>}
      </div>
    </div>
    {msg && <div className="px-3 py-1.5 text-[12px] border-b" style={{ borderColor: C.line, color: msg.startsWith('Change') || msg.startsWith('Acknowledge') ? '#fda4af' : '#a7f3d0' }} data-testid="sew-msg">{msg}</div>}
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <div className="lg:w-[290px] shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r p-3 max-h-[40vh] lg:max-h-none" style={{ borderColor: C.line, background: C.panel }}>
        {KINDS.map(([k, label]) => <div key={k} className="mb-2"><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: C.dim }}>{label}</div>
          {SOFT_TEMPLATES.filter(t => t.kind === k).map(t => <button key={t.id} onClick={() => { setTid(t.id); setAcks([]); setMsg(''); }} className="block w-full text-left p-2 rounded-lg mb-1" style={{ background: t.id === tid ? 'rgba(244,114,182,.12)' : 'rgba(255,255,255,.03)', border: `1px solid ${t.id === tid ? 'rgba(244,114,182,.5)' : 'transparent'}` }} data-testid={`sew-t-${t.id}`}>
            <div className="text-[12px] font-semibold">{t.name}</div><div className="text-[10.5px]" style={{ color: C.dim }}>{t.blurb}</div></button>)}</div>)}
        <div className="mt-3 pt-3 border-t" style={{ borderColor: C.line }}>
          <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1" style={{ color: C.dim }}>Who is it for?</div>
          <select className="sew-in" value={audience} onChange={e => { setAudienceBy(s => ({ ...s, [tid]: e.target.value as Audience })); setAcks([]); }} data-testid="sew-audience">{(Object.keys(AUDIENCE_LABEL) as Audience[]).map(a => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select>
          <label className="flex items-center gap-2 text-[12px] py-1.5"><input type="checkbox" checked={selling} onChange={e => setSelling(e.target.checked)} data-testid="sew-selling"/>I plan to sell it</label>
          <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mt-2 mb-1" style={{ color: C.dim }}>Measurements</div>
          {tid === 'plush-drawing' && <DrawingTracer key={tid} onOutline={o => setParam('outline', o)}/>}
          {tpl.params.filter(p => !p.hidden).map(paramInput)}
          {allSizes.length > 1 && <div className="mt-3 pt-2 border-t" style={{ borderColor: C.line }} data-testid="sew-grade">
            <label className="flex items-center gap-2 text-[12px] py-1"><input type="checkbox" checked={gradeUi.on} onChange={e => setGrade({ on: e.target.checked })} data-testid="sew-grade-on"/><Layers size={12}/>Nest sizes (graded pattern)</label>
            {gradeUi.on && <div className="grid grid-cols-2 gap-1.5">
              {(['from', 'to'] as const).map(k => <label key={k} className="block text-[11px]" style={{ color: C.dim }}>{k === 'from' ? 'From' : 'To'}<select className="sew-in" value={(k === 'from' ? rangeSizes[0] : rangeSizes[rangeSizes.length - 1]) ?? ''} onChange={e => setGrade({ [k]: e.target.value, ...(k === 'from' ? { to: rangeSizes[rangeSizes.length - 1] } : { from: rangeSizes[0] }) })} data-testid={`sew-grade-${k}`}>{allSizes.map(s => <option key={s} value={s}>{s}</option>)}</select></label>)}
              <div className="col-span-2 text-[10px]" style={{ color: C.dim }}>{grade ? `${grade.sizes.length} sizes nested on the preview, print PDF, DXF and tech pack.` : 'Pick at least two sizes.'}</div></div>}
          </div>}
        </div>
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex items-center gap-1 px-3 h-10 border-b shrink-0" style={{ borderColor: C.line }}>
          {(['pieces', 'layout', '3d'] as const).map(x => <button key={x} className={`sew-tab${view === x ? ' sew-tab-on' : ''}`} onClick={() => setView(x)} data-testid={`sew-view-${x}`}>{x === 'pieces' ? (grade ? `Graded nest ${sizeRangeLabel(grade.sizes)}` : 'Pattern pieces') : x === 'layout' ? 'Fabric layout' : '3D preview'}</button>)}
          {pattern?.fill && <span className="ml-auto text-[11px]" style={{ color: C.dim }}>Fill ≈ {pattern.fill.grams} g</span>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {!pattern && <div className="text-[12px]" style={{ color: '#fda4af' }}>These measurements do not make a valid pattern. Try values nearer the defaults.</div>}
          {pattern && view === 'pieces' && grade && <SizeKey sizes={grade.sizes}/>}
          {pattern && view === '3d' && <div className="h-full min-h-[360px]"><Preview3D pattern={pattern}/></div>}
          {pattern && view === 'pieces' && sheet && (sheet.items.length ? <div className="h-full min-h-[320px]"><SheetSvg items={sheet.items} width={sheet.width} height={sheet.height} size={grade ? sizeRangeLabel(grade.sizes) : pattern.size} unit={unit} sizes={grade?.sizes}/></div>
            : <div className="text-[12px]" style={{ color: C.dim }}>Every piece is a rectangle: no printing needed. Cut from the sizes below, or see the fabric layout.</div>)}
          {pattern && view === 'pieces' && sheet && sheet.skipped.length > 0 && <table className="mt-3 text-[11.5px] w-full max-w-[640px]" data-testid="sew-cutchart"><tbody>{cutChart(pattern, unit).map((r, i) => <tr key={i} className={i ? '' : 'font-bold'}>{r.map((c, j) => <td key={j} className="py-1 pr-3 border-b" style={{ borderColor: C.line }}>{c}</td>)}</tr>)}</tbody></table>}
          {pattern && view === 'layout' && markers.map(mk => { const yd = yardage(mk); return <div key={mk.role} className="mb-4">
            <div className="flex items-center gap-2 text-[12px] mb-1"><b>{FABRIC_LABEL[mk.role]}</b><span style={{ color: C.dim }}>{yd.text} · {Math.round(mk.efficiency * 100)}% used</span>
              <label className="ml-auto text-[11px]" style={{ color: C.dim }}>Width ({unit}) <input className="sew-in ml-1" style={{ display: "inline-block", width: 80 }} type="number" value={Math.round(mk.width / (unit === 'in' ? 25.4 : 10))} onChange={e => { const x = parseFloat(e.target.value); if (x > 10) setWidths(w => ({ ...w, [mk.role]: x * (unit === 'in' ? 25.4 : 10) })); }}/></label></div>
            {mk.tooWide.length > 0 && <div className="text-[11px] mb-1" style={{ color: '#fbbf24' }}>Wider than this fabric: {mk.tooWide.join(', ')}. Use wider fabric or piece it.</div>}
            <MarkerSvg mk={mk} unit={unit}/></div>; })}
        </div>
      </div>
      <div className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col min-h-0" style={{ borderColor: C.line, background: C.panel }}>
        <div className="flex gap-1 p-2 border-b overflow-x-auto sew-bar" style={{ borderColor: C.line }}>
          {([['safety', 'Safety', ShieldAlert], ['make', 'Make', Printer], ['materials', 'Materials', Package], ['steps', 'Steps', ListChecks]] as const).map(([id, label, Icon]) => <button key={id} className={`sew-tab${right === id ? ' sew-tab-on' : ''}`} onClick={() => setRight(id)} data-testid={`sew-r-${id}`}><Icon size={12}/>{label}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {right === 'safety' && <SafetyPanel hazards={hazards} queries={queries} acked={acks} onAck={(id, on) => { setAcks(a => (on ? [...a, id] : a.filter(x => x !== id))); setMsg(''); }} apiBase={apiBase} title="Product safety"/>}
          {right === 'make' && pattern && <div className="text-[12px] space-y-3" data-testid="sew-make">
            <div><div className="sew-h"><Printer size={12}/>Print the pattern</div>
              <div className="grid grid-cols-2 gap-1.5"><button className="sew-btn justify-center" onClick={() => guard(() => runPdf('letter'))} disabled={!!busy} data-testid="sew-pdf-letter">US Letter</button><button className="sew-btn justify-center" onClick={() => guard(() => runPdf('a4'))} disabled={!!busy} data-testid="sew-pdf-a4">A4</button>
                <button className="sew-btn justify-center" onClick={() => guard(() => runPdf('a0'))} disabled={!!busy}>Copy shop A0</button><button className="sew-btn justify-center" onClick={() => guard(() => runPdf('roll36'))} disabled={!!busy}>36″ roll</button></div>
              <div className="text-[10.5px] mt-1" style={{ color: C.dim }}>Print at 100% (actual size) and measure the test square.</div></div>
            <div><div className="sew-h"><Scissors size={12}/>Cut it</div>
              <select className="sew-in" value={cutter} onChange={e => setCutter(e.target.value)} data-testid="sew-cutter">{CUTTERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              {cutter === 'laser-co2' && <select className="sew-in mt-1" value={laserFabric} onChange={e => setLaserFabric(e.target.value)} data-testid="sew-laser-fabric">{LASER_FABRICS.map(f => <option key={f}>{f}</option>)}</select>}
              <div className="grid grid-cols-2 gap-1.5 mt-1.5"><button className="sew-btn justify-center" onClick={() => guard(runDxf)} data-testid="sew-dxf"><Download size={12}/>DXF</button>
                {markers.map(mk => <button key={mk.role} className="sew-btn justify-center" onClick={() => guard(() => runSvg(mk))}><Download size={12}/>SVG {mk.role}</button>)}
                {grade && <button className="sew-btn justify-center col-span-2" onClick={() => guard(runGradedDxf)} data-testid="sew-dxf-graded"><Layers size={12}/>Graded DXF {sizeRangeLabel(grade.sizes)} (layer per size)</button>}</div>
              <div className="text-[10.5px] mt-1" style={{ color: C.dim }}>{cutter === 'scissors' ? 'Files include seam lines, grain and labels.' : 'Cut-line files: one layer, notches as 4 mm slits. Fabric on a mat (drag knife) or flat on the honeycomb (laser).'}</div></div>
            <div><div className="sew-h"><FileText size={12}/>Tech pack (for a seamstress or factory)</div>
              {(['style', 'designer', 'season', 'colourways'] as const).map(k => <input key={k} className="sew-in mb-1" placeholder={k[0].toUpperCase() + k.slice(1)} value={pack[k]} onChange={e => setPack(p => ({ ...p, [k]: e.target.value }))}/>)}
              <button className="sew-btn sew-primary w-full justify-center" onClick={() => guard(runPack)} disabled={!!busy} data-testid="sew-techpack"><FileText size={12}/>{busy === 'pack' ? 'Building…' : 'Download tech pack PDF'}</button></div>
            <div><div className="sew-h"><Store size={12}/>Get it made</div>
              <button className="sew-btn w-full justify-center mb-1.5" onClick={() => setExchange(true)}>Request quotes from makers</button>
              {suppliersFor(cats).slice(0, 6).map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="block p-1.5 rounded mb-1" style={{ background: 'rgba(255,255,255,.03)' }}><div className="flex items-center gap-1 text-[11.5px] font-semibold">{s.name}<ExternalLink size={9}/><span className="ml-auto text-[9.5px] px-1 rounded bg-white/10">{s.connect}</span></div><div className="text-[10.5px]" style={{ color: C.dim }}>{s.about}</div></a>)}</div>
          </div>}
          {right === 'materials' && pattern && <div className="text-[12px]" data-testid="sew-materials">
            <div className="sew-h"><Ruler size={12}/>Fabric</div>
            {markers.map(mk => <div key={mk.role} className="mb-1"><b>{FABRIC_LABEL[mk.role]}</b>: {yardage(mk).text}</div>)}
            <div className="sew-h mt-3"><Package size={12}/>Notions</div>
            {pattern.notions.map((n, i) => <div key={i} className="mb-1.5"><b>{n.qty}</b> {n.item}{n.note && <div className="text-[10.5px]" style={{ color: C.dim }}>{n.note}</div>}</div>)}
            <div className="sew-h mt-3">Finished size</div>
            {pattern.finished.map(([k, x]) => <div key={k} className="flex"><span style={{ color: C.dim }}>{k}</span><span className="ml-auto tabular-nums">{fmtLen(x, unit)}</span></div>)}
            {(() => { const g = grade ? gradePom(grade) : pattern.grading; if (!g) return null; const u = unit === 'in' ? 25.4 : 10; return <div className="mt-3 overflow-x-auto" data-testid="sew-pom"><div className="sew-h">{grade ? `Graded spec ${sizeRangeLabel(grade.sizes)}` : 'Size chart'} (finished, {unit})</div><table className="text-[10.5px]"><tbody><tr><td/>{g.sizes.map(s => <td key={s} className="px-1 font-bold">{s}</td>)}{grade && <td className="px-1 font-bold">Grade</td>}</tr>{g.rows.map(r => <tr key={r.pom}><td className="pr-2" style={{ color: C.dim }}>{r.pom}</td>{r.values.map((x, i) => <td key={i} className="px-1 tabular-nums">{(x / u).toFixed(1)}</td>)}{grade && 'step' in r && <td className="px-1 tabular-nums" style={{ color: C.accent }}>{`${(r as { step: number }).step >= 0 ? '+' : ''}${((r as { step: number }).step / u).toFixed(1)}`}</td>}</tr>)}</tbody></table></div>; })()}
            <div className="sew-h mt-3">Labels {selling ? 'required' : 'if you sell it'}</div>
            {softLabels(pattern, audience, selling).map(l => <div key={l} className="text-[11px] mb-1">• {l}</div>)}
          </div>}
          {right === 'steps' && pattern && <ol className="text-[12px] list-decimal pl-4 space-y-1.5" data-testid="sew-steps">{pattern.steps.map((s, i) => <li key={i}>{s}</li>)}{pattern.notes.map((n, i) => <li key={`n${i}`} className="list-none -ml-4 text-[11px]" style={{ color: '#fbbf24' }}>{n}</li>)}</ol>}
        </div>
      </div>
    </div>
    {exchange && pattern && <ExchangeRoom onClose={() => setExchange(false)} getToken={getToken} apiBase={apiBase} initialCategory={cats[0]}
      prefill={{ title: pattern.name, processes, details: `${pattern.name}${pattern.size ? `, size ${pattern.size}` : ''}. For: ${AUDIENCE_LABEL[audience]}. Fabric: ${markers.map(m => `${FABRIC_LABEL[m.role]} ${yardage(m).text}`).join('; ')}. Tech pack available from Plajah Build.`, hazards: hazards.filter(h => h.severity === 'critical' || h.severity === 'high').map(h => h.title) }}/>}
    {!terms && <BuildTermsGate getToken={getToken} apiBase={apiBase} onAccepted={() => setTerms(true)} onClose={onClose}/>}
    <style>{`.sew-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,.82);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);flex-shrink:0}.sew-btn:hover{background:rgba(255,255,255,.1);color:#fff}.sew-btn:disabled{opacity:.4}.sew-primary{background:linear-gradient(135deg,#ec4899,#8b5cf6);border-color:transparent;color:#fff}.sew-tab{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border-radius:7px;font-size:11px;font-weight:700;color:rgba(255,255,255,.55);flex-shrink:0}.sew-tab-on{background:rgba(255,255,255,.08);color:#fff}.sew-in{display:block;width:100%;margin-top:2px;height:30px;padding:0 8px;border-radius:7px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:12px}.sew-in option{background:#14121a}.sew-h{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:6px}.sew-bar{scrollbar-width:none}@media (max-width:899px){.sew-label{display:none}}`}</style>
  </div>;
}
