// BudgetPulseViews — the Flow (Sankey-style), Projects and Trends views of Budget Pulse.
import React, { useMemo, useState } from 'react';
import { FolderKanban, Pencil, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import type { AcctProject, Organization } from '../../../../types';
import { GENERAL, STATUS_META, computeFlow, monthShort, rangePreset, shiftSpan, usd0, type DeptPulse, type DateSpan } from '../../../../services/acctPulse';
import { saveProject, type LivePulse } from '../../../../services/acctPulseLive';
import { card, field, fieldSm, btnPrimary, btnGhost, label, Empty } from './shared';
import { useDo } from './SpendingUi';
import { BudgetBar, StatusChip, heat } from './BudgetPulseCard';

// Categorical palette (validated on dark: distinct hue AND lightness steps).
const PAL = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb7185', '#a3e635', '#38bdf8', '#e879f9'];

// ── Flow ───────────────────────────────────────────────────────────────────────────────────────
export const FlowView: React.FC<{ org: Organization; live: LivePulse; simple: boolean }> = ({ org, live, simple }) => {
  const sm = org.financeSettings?.fiscalYearStartMonth || 1;
  const today = new Date().toLocaleDateString('en-CA');
  const [kind, setKind] = useState<'MTD' | 'QTD' | 'YTD' | '12MO' | 'CUSTOM'>('YTD');
  const [custom, setCustom] = useState<DateSpan>({ from: `${today.slice(0, 4)}-01-01`, to: today, label: 'Custom' });
  const [cmp, setCmp] = useState<'NONE' | 'PRIOR_PERIOD' | 'PRIOR_YEAR'>('PRIOR_YEAR');
  const span = kind === 'CUSTOM' ? custom : rangePreset(kind, today, sm);
  const base = useMemo(() => ({ accounts: live.data.accounts, journals: live.data.journals, ministries: org.ministries || [], funds: org.givingFunds || [] }), [live.data, org]);
  const f = useMemo(() => computeFlow(base, span), [base, span.from, span.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => (cmp === 'NONE' ? null : computeFlow(base, shiftSpan(span, cmp))), [base, cmp, span.from, span.to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (live.report?.mode !== 'FULL') return <div className={`${card} p-6`}><Empty>The money-flow view needs ledger access (finance, accounting or pastoral roles).</Empty></div>;

  // Sankey geometry
  const W = 720, rows = Math.max(f.sources.filter(s => s.spent > 0).length, f.uses.length, 1), H = Math.max(260, rows * 34), gap = 8;
  const left = f.sources.filter(s => s.spent > 0), tot = Math.max(1, f.totalOut);
  const sc = (H - gap * Math.max(left.length, f.uses.length)) / tot;
  const lpos = new Map<string, { y: number; h: number; off: number }>(), rpos = new Map<string, { y: number; h: number; off: number }>();
  let y = 0; left.forEach(s => { const h = Math.max(4, s.spent * sc); lpos.set(s.id, { y, h, off: 0 }); y += h + gap; });
  y = 0; f.uses.forEach(u => { const h = Math.max(4, u.amount * sc); rpos.set(u.id, { y, h, off: 0 }); y += h + gap; });
  const colorOf = (id: string) => PAL[Math.max(0, f.uses.findIndex(u => u.id === id)) % PAL.length];
  const delta = (a: number, b: number | undefined) => (b === undefined || b === 0 ? null : Math.round((a - b) / b * 100));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['MTD', 'This month'], ['QTD', 'Quarter'], ['YTD', 'Year'], ['12MO', '12 months'], ['CUSTOM', 'Custom']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${kind === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}>{l}</button>))}
        {kind === 'CUSTOM' && <span className="flex items-center gap-1.5"><input type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} className={fieldSm} aria-label="From" /><input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} className={fieldSm} aria-label="To" /></span>}
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-white/40">Compare to
          <select value={cmp} onChange={e => setCmp(e.target.value as any)} className={fieldSm} aria-label="Compare to"><option value="NONE">nothing</option><option value="PRIOR_PERIOD">previous period</option><option value="PRIOR_YEAR">same time last year</option></select></span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ l: simple ? 'Money in' : 'Revenue', v: f.totalIn, p: c?.totalIn, good: true }, { l: simple ? 'Money out' : 'Expenses', v: f.totalOut, p: c?.totalOut, good: false }, { l: 'Net', v: f.net, p: c?.net, good: true }].map(s => {
          const d = delta(s.v, s.p); const up = (d ?? 0) > 0; const ok = s.good ? up : !up;
          return <div key={s.l} className={`${card} p-4`}><p className={label}>{s.l}</p><p className={`text-xl font-black mt-1 tabular-nums ${s.v < 0 ? 'text-red-400' : 'text-white'}`}>{usd0(s.v)}</p>
            {d !== null && <p className="text-[10px] mt-1 inline-flex items-center gap-1" style={{ color: ok ? '#4ade80' : '#fb923c' }}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{up ? '+' : ''}{d}% vs {c?.span.label.toLowerCase()}</p>}</div>;
        })}
      </div>

      <div className={`${card} p-5 overflow-x-auto`}>
        <p className={`${label} mb-3`}>{simple ? 'Where the money came from → where it went' : 'Fund → department expense flow'} · {span.from} to {span.to}</p>
        {!f.uses.length ? <Empty>No spending recorded in this period.</Empty> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label={`Money flow: ${usd0(f.totalIn)} in, ${usd0(f.totalOut)} out across ${f.uses.length} departments`}>
            {f.links.map((l, i) => {
              const a = lpos.get(l.from), b = rpos.get(l.to); if (!a || !b) return null;
              const h = Math.max(1, l.amount * sc);
              const y1 = a.y + a.off, y2 = b.y + b.off; a.off += h; b.off += h;
              const x1 = 150, x2 = W - 170, mx = (x1 + x2) / 2;
              return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + h} C${mx},${y2 + h} ${mx},${y1 + h} ${x1},${y1 + h} Z`} fill={colorOf(l.to)} opacity="0.4"><title>{usd0(l.amount)}</title></path>;
            })}
            {left.map(s => { const p = lpos.get(s.id)!; return <g key={s.id}><rect x={140} y={p.y} width={10} height={p.h} rx={3} fill="#e2e8f0" /><text x={134} y={p.y + p.h / 2} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#e2e8f0" fontWeight="700">{s.name}</text><text x={134} y={p.y + p.h / 2 + 12} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#94a3b8">{usd0(s.amount)} in · {usd0(s.spent)} out</text></g>; })}
            {f.uses.map(u => { const p = rpos.get(u.id)!; return <g key={u.id}><rect x={W - 170} y={p.y} width={10} height={p.h} rx={3} fill={colorOf(u.id)} /><text x={W - 154} y={p.y + p.h / 2} dominantBaseline="middle" fontSize="11" fill="#e2e8f0" fontWeight="700">{u.name}</text><text x={W - 154} y={p.y + p.h / 2 + 12} dominantBaseline="middle" fontSize="9" fill="#94a3b8">{usd0(u.amount)}{c ? (() => { const d = delta(u.amount, c.uses.find(x => x.id === u.id)?.amount); return d === null ? '' : ` · ${d > 0 ? '+' : ''}${d}%`; })() : ''}</text></g>; })}
          </svg>
        )}
      </div>

      {f.categories.length > 0 && (
        <div className={`${card} p-5`}>
          <p className={`${label} mb-3`}>{simple ? 'Biggest spending categories' : 'Expense accounts'}</p>
          <div className="space-y-2">{f.categories.slice(0, 8).map((k, i) => { const cc = c?.categories.find(x => x.accountId === k.accountId)?.amount; const d = delta(k.amount, cc); return (
            <div key={k.accountId} className="flex items-center gap-3 text-[11px]"><span className="w-40 truncate text-white/80">{k.name}</span>
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(k.amount / f.categories[0].amount) * 100}%`, background: PAL[i % PAL.length] }} /></div>
              <span className="w-20 text-right tabular-nums text-white/70">{usd0(k.amount)}</span><span className="w-12 text-right tabular-nums text-[10px]" style={{ color: d === null ? '#64748b' : d > 15 ? '#fb923c' : '#94a3b8' }}>{d === null ? '' : `${d > 0 ? '+' : ''}${d}%`}</span></div>); })}</div>
        </div>
      )}
    </div>
  );
};

// ── Projects ───────────────────────────────────────────────────────────────────────────────────
const blank = (): Partial<AcctProject> & { name: string; budget: number; startDate: string; endDate: string } => {
  const t = new Date().toLocaleDateString('en-CA'); const e = new Date(Date.now() + 90 * 86400000).toLocaleDateString('en-CA');
  return { name: '', budget: 0, startDate: t, endDate: e, status: 'ACTIVE' };
};
export const ProjectsView: React.FC<{ org: Organization; live: LivePulse; simple: boolean; canEdit: boolean }> = ({ org, live, simple, canEdit }) => {
  const [edit, setEdit] = useState<ReturnType<typeof blank> | null>(null);
  const { busy, run } = useDo();
  const rows = live.report?.projects || [];
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3"><div className="flex-1"><p className="text-sm font-black text-white">Projects & campaigns</p><p className="text-[10px] text-white/40 mt-0.5">Building fund, mission trip, VBS… Spend counts when a journal line or expense carries the project, or uses the project's fund during its dates.</p></div>
        {canEdit && <button onClick={() => setEdit(blank())} className={btnPrimary}><Plus size={13} /> New project</button>}</div>
      {edit && (
        <div className={`${card} p-5 space-y-3`}>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={field} placeholder="Project name (e.g. Youth mission trip)" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} aria-label="Project name" />
            <input className={field} type="number" min={0} placeholder="Budget ($)" value={edit.budget || ''} onChange={e => setEdit({ ...edit, budget: Number(e.target.value) })} aria-label="Budget" />
            <select className={field} value={edit.deptId || ''} onChange={e => setEdit({ ...edit, deptId: e.target.value || undefined })} aria-label="Department"><option value="">Any department</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select className={field} value={edit.fundId || ''} onChange={e => setEdit({ ...edit, fundId: e.target.value || undefined })} aria-label="Fund"><option value="">No fund (tag lines instead)</option>{(org.givingFunds || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <label className="text-[10px] text-white/40">Starts<input type="date" className={`${fieldSm} w-full mt-1`} value={edit.startDate} onChange={e => setEdit({ ...edit, startDate: e.target.value })} /></label>
            <label className="text-[10px] text-white/40">Ends<input type="date" className={`${fieldSm} w-full mt-1`} value={edit.endDate} onChange={e => setEdit({ ...edit, endDate: e.target.value })} /></label>
            <select className={field} value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value as AcctProject['status'] })} aria-label="Status">{['PLANNED', 'ACTIVE', 'DONE', 'CANCELLED'].map(s => <option key={s}>{s}</option>)}</select>
          </div>
          <div className="flex gap-2"><button disabled={busy || !edit.name.trim()} onClick={() => run(async () => { await saveProject(org.id, { ...edit, name: edit.name.trim() }); setEdit(null); }, 'Project saved')} className={btnPrimary}>Save project</button><button onClick={() => setEdit(null)} className={btnGhost}>Cancel</button></div>
        </div>
      )}
      {!rows.length && !edit && <div className={`${card} p-8 text-center`}><FolderKanban className="mx-auto text-white/20 mb-2" size={26} /><p className="text-xs text-white/50">No projects yet.{canEdit ? ' Create one to watch its budget burn down against its timeline.' : ''}</p></div>}
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map(p => {
          const m = STATUS_META[p.status]; const W = 300, H = 90;
          const mx = Math.max(1, p.budget, ...p.burn.map(b => b.actual ?? 0));
          const X = (i: number) => (i / (p.burn.length - 1)) * (W - 8) + 4, Y = (v: number) => H - 6 - (v / mx) * (H - 14);
          const act = p.burn.filter(b => b.actual !== null);
          return (
            <div key={p.project.id} className={`${card} p-5`} style={{ borderColor: m.hex + '40' }}>
              <div className="flex items-start gap-2"><div className="flex-1 min-w-0"><p className="text-sm font-black text-white truncate">{p.project.name}</p><p className="text-[10px] text-white/40">{p.deptName ? `${p.deptName} · ` : ''}{p.project.startDate} → {p.project.endDate} · {p.project.status.toLowerCase()}</p></div><StatusChip status={p.status} />{canEdit && <button aria-label="Edit project" onClick={() => setEdit({ ...p.project })} className="p-1.5 rounded-full bg-white/5 text-white/50 hover:text-white"><Pencil size={12} /></button>}</div>
              <div className="mt-3"><BudgetBar a={p} /></div>
              <p className="text-[11px] text-white/70 mt-2">{usd0(p.hard)} of {usd0(p.budget)} used{p.pending ? ` · ${usd0(p.pending)} pending` : ''}{p.overrun > 0 && p.project.status !== 'DONE' ? <span style={{ color: m.hex }}> · on pace to finish {usd0(p.overrun)} over</span> : ''}{p.finishedEarly ? ' · finished within budget' : ''}</p>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label={`Burn-up for ${p.project.name}: planned vs actual spend`}>
                <polyline points={p.burn.map((b, i) => `${X(i)},${Y(b.planned)}`).join(' ')} fill="none" stroke="#64748b" strokeWidth="1.4" strokeDasharray="4 3" />
                {act.length > 1 && <polyline points={act.map((b, i) => `${X(i)},${Y(b.actual!)}`).join(' ')} fill="none" stroke={m.hex} strokeWidth="2" strokeLinejoin="round" />}
                <line x1="4" x2={W - 4} y1={Y(p.budget)} y2={Y(p.budget)} stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
              </svg>
              <p className="text-[9px] text-white/30">Dashed = planned pace · line = actual · {simple ? 'faint line = budget' : 'faint line = budget ceiling'}</p>
            </div>);
        })}
      </div>
    </div>
  );
};

// ── Trends ─────────────────────────────────────────────────────────────────────────────────────
const Multiple: React.FC<{ d: DeptPulse }> = ({ d }) => {
  const W = 220, H = 64, mx = Math.max(1, ...d.monthly, ...d.priorYear), m = STATUS_META[d.status === 'NONE' ? 'GREEN' : d.status];
  const X = (i: number) => (i / 11) * (W - 8) + 4, Y = (v: number) => H - 5 - (v / mx) * (H - 12);
  const L = (a: number[]) => a.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-black text-white truncate">{d.name}</p>
        {d.mom !== null && <span className="text-[10px] tabular-nums inline-flex items-center gap-0.5" style={{ color: d.mom > 15 ? '#fb923c' : '#94a3b8' }}>{d.mom > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{d.mom > 0 ? '+' : ''}{d.mom}% MoM</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label={`${d.name} monthly spending, last 12 months`}>
        {d.priorYear.some(v => v > 0) && <polyline points={L(d.priorYear)} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="2 3" />}
        <polygon points={`${X(0)},${H - 5} ${L(d.monthly)} ${X(11)},${H - 5}`} fill={m.hex} opacity="0.15" />
        <polyline points={L(d.monthly)} fill="none" stroke={m.hex} strokeWidth="1.8" strokeLinejoin="round" />
        <polyline points={L(d.avg3)} fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
      </svg>
      <p className="text-[9px] text-white/35 mt-1">{d.yoy !== null ? `${d.yoy > 0 ? '+' : ''}${d.yoy}% vs last year · ` : ''}next month ≈ {usd0(d.nextMonthForecast)}</p>
    </div>
  );
};

export const TrendsView: React.FC<{ live: LivePulse; simple: boolean }> = ({ live, simple }) => {
  const r = live.report; if (!r) return null;
  const depts = r.depts.filter(d => d.monthly.some(v => v > 0));
  if (!depts.length) return <div className={`${card} p-6`}><Empty>Trends appear once there is a few months of spending history.</Empty></div>;
  const anomalies = depts.filter(d => d.anomaly), accel = depts.filter(d => d.accelerating);
  return (
    <div className="space-y-5">
      {(anomalies.length > 0 || accel.length > 0 || r.org.scissors) && (
        <div className="space-y-2">
          {r.org.scissors && <div className="px-4 py-3 rounded-2xl border text-xs" style={{ borderColor: '#fb923c55', background: STATUS_META.ORANGE.soft, color: '#fdba74' }}>◆ Giving is {r.org.scissors.revenuePct}% over the last 3 months while spending is {r.org.scissors.expensePct > 0 ? '+' : ''}{r.org.scissors.expensePct}% — worth a look.</div>}
          {anomalies.map(d => <div key={d.deptId + 'a'} className="px-4 py-3 rounded-2xl border text-xs" style={{ borderColor: '#facc1555', background: STATUS_META.YELLOW.soft, color: '#fde68a' }}>▲ <b>{d.name}</b> spent {usd0(d.anomaly!.amount)} in {monthShort(d.anomaly!.period)} — about {usd0(d.anomaly!.delta)} above its usual {usd0(d.anomaly!.mean)}{simple ? '' : ` (z=${d.anomaly!.z})`}.</div>)}
          {accel.map(d => <div key={d.deptId + 'x'} className="px-4 py-3 rounded-2xl border text-xs border-white/10 bg-white/[0.03] text-white/70">↗ <b>{d.name}</b> is speeding up: about {usd0(d.accelerating!.recent)}/month lately vs {usd0(d.accelerating!.prior)}/month before (+{d.accelerating!.pct}%).</div>)}
        </div>
      )}
      <div className={`${card} p-5 overflow-x-auto`}>
        <p className={`${label} mb-3`}>Spending heatmap · each row is shaded against its own busiest month</p>
        <table className="w-full text-[10px] border-separate border-spacing-1 min-w-[560px]">
          <thead><tr><th className="text-left text-white/40 font-black uppercase tracking-widest pr-2">Department</th>{r.months.map(m => <th key={m} className="text-white/40 font-bold">{monthShort(m)}</th>)}</tr></thead>
          <tbody>{depts.map(d => { const mx = Math.max(1, ...d.monthly); return (
            <tr key={d.deptId}><td className="text-white/80 font-bold pr-2 whitespace-nowrap max-w-[140px] truncate">{d.name}</td>
              {d.monthly.map((v, i) => <td key={i} title={`${d.name} · ${monthShort(r.months[i])}: ${usd0(v)}`} className="text-center rounded-md tabular-nums" style={{ background: heat(v / mx), color: v / mx > 0.35 && v / mx < 0.75 ? '#0b0b0f' : '#fff', height: 26 }}>{v ? (v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)) : ''}</td>)}</tr>); })}</tbody>
        </table>
        <p className="text-[9px] text-white/30 mt-2">Cool blue = quiet month, amber/red = busy month. Numbers are dollars.</p>
      </div>
      <div className={`${card} p-5`}>
        <p className={`${label} mb-3`}>Money in vs money out · last 12 months</p>
        {(() => { const W = 640, H = 120, mx = Math.max(1, ...r.orgMonthly.out, ...r.orgMonthly.inn), bw = W / 12; return (
          <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="Monthly money in and out">
            {r.months.map((m, i) => <g key={m}><rect x={i * bw + 6} y={H - (r.orgMonthly.inn[i] / mx) * H} width={bw / 2 - 7} height={(r.orgMonthly.inn[i] / mx) * H} fill="#4ade80" opacity="0.85" rx="2" /><rect x={i * bw + bw / 2} y={H - (r.orgMonthly.out[i] / mx) * H} width={bw / 2 - 7} height={(r.orgMonthly.out[i] / mx) * H} fill="#fb923c" opacity="0.85" rx="2" /><text x={i * bw + bw / 2} y={H + 12} textAnchor="middle" fontSize="9" fill="#94a3b8">{monthShort(m).slice(0, 3)}</text></g>)}
          </svg>); })()}
        <p className="text-[10px] text-white/40 mt-1"><span style={{ color: '#4ade80' }}>■</span> in · <span style={{ color: '#fb923c' }}>◆</span> out · hover-free: numbers in the heatmap above</p>
      </div>
      <div><p className={`${label} mb-3`}>Each department · dashed white = 3-month average · grey dashed = last year</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{depts.map(d => <Multiple key={d.deptId} d={d} />)}</div></div>
    </div>
  );
};

export { GENERAL };
