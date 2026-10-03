import React, { useMemo, useState } from 'react';
import { Play, Trash2, Plus, FlaskConical, Download } from 'lucide-react';
import { DataVizCard, DISCIPLINE_VIZ_LOADERS, type DataVizConfig } from '../LabsDataVisualizer';
import { VIRTUAL_EXPERIMENTS, runTrial, experimentById } from '../../data/virtualExperiments';
import { applyTransform, linearFit, mean, median, stdev, range, fmt, parseTable, TRANSFORMS, type Transform } from '../../services/dataStats';
import type { DataTable, GraphSettings } from '../../services/investigationService';

/**
 * The data step of an investigation. Pull data from a virtual experiment, from LIVE Plajah Labs data
 * (the same loaders the Labs disciplines use), from a pasted spreadsheet or by typing it in. Then
 * graph it with the Labs chart card, read the statistics, and learn what a good graph needs.
 */
interface Props { table: DataTable; onTable: (t: DataTable) => void; graph: GraphSettings; onGraph: (g: GraphSettings) => void; experimentId?: string; onExperiment: (id: string | undefined) => void }

const num = (c: string) => (c.trim() === '' ? NaN : Number(c));
const field = 'rounded-lg bg-black/30 border border-white/15 px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 w-full';
const SOURCES = ['experiment', 'labs', 'paste'] as const;

const DataWorkbench: React.FC<Props> = ({ table, onTable, graph, onGraph, experimentId, onExperiment }) => {
  const [src, setSrc] = useState<(typeof SOURCES)[number]>(experimentId ? 'experiment' : 'experiment');
  const [xVal, setXVal] = useState('');
  const [paste, setPaste] = useState('');
  const [labsDisc, setLabsDisc] = useState('earth');
  const [labsBusy, setLabsBusy] = useState(false);
  const [labsConfigs, setLabsConfigs] = useState<DataVizConfig[] | null>(null);
  const exp = experimentById(experimentId || '');

  const setCell = (r: number, c: number, v: string) => onTable({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const addRow = () => onTable({ ...table, rows: [...table.rows, table.headers.map(() => '')] });
  const delRow = (r: number) => onTable({ ...table, rows: table.rows.filter((_, i) => i !== r) });
  const setHeader = (c: number, v: string) => onTable({ ...table, headers: table.headers.map((h, i) => (i === c ? v : h)) });

  const pickExperiment = (id: string) => {
    const e = experimentById(id)!; onExperiment(id); setXVal(String(e.independent.min));
    onTable({ headers: [`${e.independent.name} (${e.independent.unit})`, `${e.dependent.name} (${e.dependent.unit})`], rows: [], source: `Simulated data: ${e.title} virtual experiment (Plajah Academia)` });
    onGraph({ ...graph, xCol: 0, yCol: 1, type: 'SCATTER', xT: 'none', yT: 'none', fit: true });
  };
  const runOne = (x: number) => { if (!exp) return; onTable({ ...table, rows: [...table.rows, [String(x), String(runTrial(exp, x))]] }); };
  const runSweep = () => {
    if (!exp) return; const rows: string[][] = [];
    for (let x = exp.independent.min; x <= exp.independent.max + 1e-9; x += exp.independent.step) { const xv = Math.round(x * 1000) / 1000; rows.push([String(xv), String(runTrial(exp, xv))]); }
    onTable({ ...table, rows: [...table.rows, ...rows] });
  };

  const loadLabs = async () => {
    setLabsBusy(true); setLabsConfigs(null);
    try { const l = DISCIPLINE_VIZ_LOADERS[labsDisc]; setLabsConfigs(l ? (await l()).filter(Boolean) : []); } catch { setLabsConfigs([]); }
    setLabsBusy(false);
  };
  const useLabs = (c: DataVizConfig) => {
    if (c.tableHeaders && c.tableRows) { onTable({ headers: c.tableHeaders, rows: c.tableRows.map(r => r.map(String)), source: `${c.source}${c.sourceUrl ? ` (${c.sourceUrl})` : ''}, via Plajah Labs` }); return; }
    const xKey = c.xKey || 'x'; const ser = c.series || [];
    onTable({ headers: [c.xLabel || xKey, ...ser.map(s => s.label)], rows: (c.chartData || []).map(d => [String(d[xKey] ?? ''), ...ser.map(s => String(d[s.key] ?? ''))]), source: `${c.source}${c.sourceUrl ? ` (${c.sourceUrl})` : ''}, via Plajah Labs` });
    onGraph({ ...graph, type: c.type === 'BAR' ? 'BAR' : 'LINE', xCol: 0, yCol: 1, xT: 'none', yT: 'none', fit: false });
  };
  const usePaste = () => { const t = parseTable(paste); if (t.headers.length) { onTable({ headers: t.headers, rows: t.rows, source: 'Pasted data' }); setSrc('paste'); } };

  // ── Graph ────────────────────────────────────────────────────────────────
  const pts = useMemo(() => table.rows.map(r => ({ x: applyTransform(num(r[graph.xCol] ?? ''), graph.xT), y: applyTransform(num(r[graph.yCol] ?? ''), graph.yT), label: r[graph.xCol] ?? '' })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)), [table.rows, graph]);
  const fit = useMemo(() => (graph.type === 'SCATTER' ? linearFit(pts.map(p => p.x), pts.map(p => p.y)) : null), [pts, graph.type]);
  const ys = pts.map(p => p.y);
  const tLabel = (t: Transform) => (t === 'none' ? '' : t === 'square' ? '² ' : t === 'sqrt' ? '√ ' : t === 'ln' ? 'ln ' : '1/ ');
  const xName = `${graph.xT === 'square' ? '(' : ''}${tLabel(graph.xT) === '² ' ? '' : tLabel(graph.xT)}${table.headers[graph.xCol] || 'x'}${graph.xT === 'square' ? ')²' : ''}`;
  const yName = `${graph.yT === 'square' ? '(' : ''}${tLabel(graph.yT) === '² ' ? '' : tLabel(graph.yT)}${table.headers[graph.yCol] || 'y'}${graph.yT === 'square' ? ')²' : ''}`;

  const config: DataVizConfig | null = useMemo(() => {
    if (pts.length < 2) return null;
    const data = (graph.type === 'LINE' ? [...pts].sort((a, b) => a.x - b.x) : pts).map(p => ({ x: graph.type === 'BAR' ? p.label : p.x, y: p.y }));
    return {
      id: 'investigation-graph', title: graph.title || `${yName} vs ${xName}`, source: table.source || 'Student data', description: table.source ? `Data: ${table.source}` : undefined,
      type: graph.type, chartData: data, xKey: 'x', series: [{ key: 'y', label: yName, color: '#00DAF3' }], xLabel: xName, yLabel: yName, fetchedAt: Date.now(),
      fitLine: graph.fit && fit ? { slope: fit.slope, intercept: fit.intercept } : undefined,
    } as DataVizConfig;
  }, [pts, graph, fit, table.source, xName, yName]);

  const download = () => {
    const csv = [table.headers.join(','), ...table.rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'investigation-data.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const hasUnits = (h: string) => /\(.+\)/.test(h);
  const hygiene: string[] = [];
  if (!graph.title.trim()) hygiene.push('Give your graph a title that says what it shows.');
  [graph.xCol, graph.yCol].forEach(c => { if (table.headers[c] && !hasUnits(table.headers[c])) hygiene.push(`Add units to the "${table.headers[c]}" column heading, like "Length (m)".`); });
  if (graph.type === 'LINE' && pts.length > 0 && pts.length < 4) hygiene.push('A line graph needs several points; with so few, a scatter plot is more honest.');
  if (graph.type === 'BAR' && graph.xT !== 'none') hygiene.push('Bar charts compare categories; transforming the x axis does not make sense here.');
  if (pts.length > 0 && pts.length < 5) hygiene.push('Few data points make any pattern uncertain. Can you collect more?');

  return (
    <div className="grid gap-4">
      {/* Sources */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex gap-1.5 mb-3 flex-wrap" role="tablist" aria-label="Where the data comes from">
          {([['experiment', 'Virtual experiment'], ['labs', 'Live Plajah Labs data'], ['paste', 'Paste a spreadsheet']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={src === id} onClick={() => setSrc(id)} className={`px-3 py-1.5 rounded-full text-[11px] font-black ${src === id ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>{label}</button>
          ))}
        </div>

        {src === 'experiment' && (
          <div>
            <div className="grid sm:grid-cols-4 gap-2 mb-3">{VIRTUAL_EXPERIMENTS.map(e => (
              <button key={e.id} type="button" onClick={() => pickExperiment(e.id)} aria-pressed={experimentId === e.id} className={`text-left rounded-xl border p-3 ${experimentId === e.id ? 'border-white bg-white/10' : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
                <span className="text-xl">{e.emoji}</span><p className="text-[12px] font-black mt-1">{e.title}</p></button>))}</div>
            {exp ? (
              <div>
                <p className="text-[13px] font-bold">{exp.question}</p>
                <p className="text-[12px] text-white/55 mt-1">{exp.background}</p>
                <p className="text-[11px] text-white/45 mt-1">Keep the same: {exp.controls.join('; ')}.</p>
                <p className="text-[11px] text-amber-200/80 mt-1">Simulated data: it follows a real law with realistic measurement error, but it is not a real measurement.</p>
                <div className="flex flex-wrap items-end gap-2 mt-3">
                  <label className="grid gap-1 text-[11px] font-black text-white/60">{exp.independent.label} ({exp.independent.unit})
                    <input type="number" value={xVal} min={exp.independent.min} max={exp.independent.max} step={exp.independent.step} onChange={e => setXVal(e.target.value)} className={`${field} w-32`} /></label>
                  <button type="button" onClick={() => { const x = Number(xVal); if (Number.isFinite(x)) runOne(x); }} className="rounded-full bg-[#06D6A0] text-black text-[12px] font-black px-4 py-2 inline-flex items-center gap-1.5"><Play size={13} /> Run a trial</button>
                  <button type="button" onClick={runSweep} className="rounded-full border border-white/20 text-[12px] font-black px-4 py-2">Run one trial at every setting</button>
                </div>
              </div>
            ) : <p className="text-[12px] text-white/50">Pick an experiment to start. You can run as many trials as you like, and repeating a setting shows how much measurements vary.</p>}
          </div>
        )}

        {src === 'labs' && (
          <div>
            <p className="text-[12px] text-white/60 mb-2">Real, live data from the science APIs behind Plajah Labs (earthquakes, near-Earth objects, research activity and more).</p>
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <select value={labsDisc} onChange={e => setLabsDisc(e.target.value)} className={`${field} w-48`} aria-label="Labs discipline">{Object.keys(DISCIPLINE_VIZ_LOADERS).map(d => <option key={d} value={d}>{d}</option>)}</select>
              <button type="button" onClick={loadLabs} disabled={labsBusy} className="rounded-full bg-white text-black text-[12px] font-black px-4 py-2 inline-flex items-center gap-1.5"><FlaskConical size={13} /> {labsBusy ? 'Loading…' : 'Load data'}</button>
            </div>
            {labsConfigs && labsConfigs.length === 0 && <p className="text-[12px] text-white/50">Nothing came back right now. Try another discipline or check your connection.</p>}
            <div className="grid gap-2">{(labsConfigs || []).map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2"><div className="min-w-0 flex-1"><p className="text-[12px] font-black truncate">{c.title}</p><p className="text-[10px] text-white/45">{c.source} · {(c.chartData || c.tableRows || []).length} rows</p></div>
                <button type="button" onClick={() => useLabs(c)} className="rounded-full bg-[#06D6A0] text-black text-[11px] font-black px-3 py-1.5">Use this data</button></div>))}</div>
          </div>
        )}

        {src === 'paste' && (
          <div>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} placeholder={'Paste rows from a spreadsheet or CSV. The first row can be headings:\nLength (m),Period (s)\n0.2,0.90\n0.4,1.27'} aria-label="Pasted data" className={`${field} font-mono`} />
            <button type="button" onClick={usePaste} className="mt-2 rounded-full bg-white text-black text-[12px] font-black px-4 py-2">Use this data</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-x-auto">
        <table className="w-full text-sm min-w-[360px]">
          <thead><tr>{table.headers.map((h, c) => <th key={c} className="p-1.5"><input value={h} onChange={e => setHeader(c, e.target.value)} aria-label={`Column ${c + 1} heading`} className={`${field} font-black`} /></th>)}<th /></tr></thead>
          <tbody>{table.rows.map((r, i) => (
            <tr key={i} className="border-t border-white/5">{table.headers.map((_, c) => <td key={c} className="p-1"><input value={r[c] ?? ''} onChange={e => setCell(i, c, e.target.value)} aria-label={`Row ${i + 1} column ${c + 1}`} className={`${field} font-mono`} /></td>)}
              <td className="p-1 w-8"><button type="button" aria-label={`Delete row ${i + 1}`} onClick={() => delRow(i)} className="text-white/35 hover:text-rose-300"><Trash2 size={14} /></button></td></tr>))}</tbody>
        </table>
        <div className="flex gap-2 p-2.5 border-t border-white/5"><button type="button" onClick={addRow} className="text-[11px] font-black text-white/70 inline-flex items-center gap-1"><Plus size={12} /> Add row</button>
          <span className="flex-1" /><button type="button" onClick={download} className="text-[11px] font-black text-white/50 inline-flex items-center gap-1"><Download size={12} /> CSV</button></div>
      </div>

      {/* Graph controls */}
      {table.headers.length >= 2 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 grid gap-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="grid gap-1 text-[11px] font-black text-white/60">Graph type<select value={graph.type} onChange={e => onGraph({ ...graph, type: e.target.value as GraphSettings['type'] })} className={field}><option value="SCATTER">Scatter (relationship)</option><option value="LINE">Line (change over time)</option><option value="BAR">Bar (compare categories)</option></select></label>
            <label className="grid gap-1 text-[11px] font-black text-white/60">x axis<select value={graph.xCol} onChange={e => onGraph({ ...graph, xCol: Number(e.target.value) })} className={field}>{table.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></label>
            <label className="grid gap-1 text-[11px] font-black text-white/60">y axis<select value={graph.yCol} onChange={e => onGraph({ ...graph, yCol: Number(e.target.value) })} className={field}>{table.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></label>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="grid gap-1 text-[11px] font-black text-white/60">Transform x<select value={graph.xT} onChange={e => onGraph({ ...graph, xT: e.target.value as Transform })} className={field}>{TRANSFORMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="grid gap-1 text-[11px] font-black text-white/60">Transform y<select value={graph.yT} onChange={e => onGraph({ ...graph, yT: e.target.value as Transform })} className={field}>{TRANSFORMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="flex items-end gap-2 text-[12px] font-black text-white/70 pb-2"><input type="checkbox" checked={graph.fit} onChange={e => onGraph({ ...graph, fit: e.target.checked })} /> Best-fit line</label>
          </div>
          <label className="grid gap-1 text-[11px] font-black text-white/60">Graph title<input value={graph.title} onChange={e => onGraph({ ...graph, title: e.target.value })} placeholder="What does this graph show?" className={field} /></label>

          {config ? <DataVizCard config={config} /> : <p className="text-[12px] text-white/45">Add at least two rows of numbers to see a graph.</p>}

          {ys.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/25 p-3 text-[12px]"><p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">The numbers ({yName})</p>
                n = {ys.length} · mean {fmt(mean(ys))} · median {fmt(median(ys))} · spread (sd) {fmt(stdev(ys))} · range {fmt(range(ys))}</div>
              {fit && <div className="rounded-xl bg-black/25 p-3 text-[12px]"><p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Best-fit line</p>
                y = {fmt(fit.slope)} x {fit.intercept < 0 ? '−' : '+'} {fmt(Math.abs(fit.intercept))} · r² = {fmt(fit.r2, 3)}
                <p className="text-white/55 mt-1">{fit.r2 > 0.9 ? 'The points sit very close to a straight line.' : fit.r2 > 0.5 ? 'There is a pattern, with a lot of scatter.' : 'The points are not close to a straight line. Try a transform, or the relationship may be something else.'} A strong fit shows a pattern, not what causes it.</p></div>}
            </div>
          )}
          {hygiene.length > 0 && <ul className="text-[11px] text-amber-200/85 list-disc pl-5 grid gap-0.5">{hygiene.map((h, i) => <li key={i}>{h}</li>)}</ul>}
        </div>
      )}
    </div>
  );
};

export default DataWorkbench;
