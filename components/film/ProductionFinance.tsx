// ProductionFinance — Film Production "Finance" tab: budget builder, cost tracking, cost reports,
// invoices (Plajah Billing, entity PRODUCTION) and a Crew Pay roadmap card. Gated by PRODUCTION_FINANCE.
import React, { useEffect, useMemo, useState } from 'react';
import { DEPARTMENTS, deptMeta, type DeptKey, type ProductionScene, type CallSheet } from '../../services/filmProductionService';
import { useBillingFlags } from '../../services/billingFlags';
import * as PF from '../../services/productionFinance';
import { BillingHubMount, ComingSoonCard, SoonPill } from '../BillingMounts';

type Seg = 'budget' | 'costs' | 'report' | 'invoices' | 'crew';
const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
const pill = (on: boolean) => `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${on ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-white/5 text-white/40 border border-transparent hover:text-white/60'}`;
const btn = 'px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 disabled:opacity-40';
const btnPri = 'px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40';

export interface ProductionFinanceProps {
  prodId: string; prodName: string; totalDays: number; canManage: boolean;
  scenes: ProductionScene[]; callSheets: CallSheet[]; isDemo?: boolean;
}

export const ProductionFinance: React.FC<ProductionFinanceProps> = ({ prodId, prodName, totalDays, canManage, scenes, callSheets, isDemo }) => {
  const flags = useBillingFlags();
  const on = flags.enabled('PRODUCTION_FINANCE');
  const preview = flags.preview('PRODUCTION_FINANCE');
  const [seg, setSeg] = useState<Seg>('budget');
  const [budget, setBudget] = useState<PF.ProductionBudgetDoc | null>(null);
  const [costs, setCosts] = useState<PF.CostEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!(on || preview) || !canManage || isDemo) { setLoaded(true); return; }
    const u1 = PF.subBudget(prodId, b => { setBudget(b); setLoaded(true); });
    const u2 = PF.subCosts(prodId, setCosts);
    return () => { u1(); u2(); };
  }, [prodId, on, preview, canManage, isDemo]);

  if (!flags.loaded) return <div className="p-6 text-xs text-white/30">Loading…</div>;
  if (!on && !preview) return <ComingSoonCard title="Production finance" blurb="Budget builder, cost reports, hot-cost sheets and invoicing for this production — all in one place. Launching soon." />;
  if (!canManage) return <ComingSoonCard title="Finance is limited to producers" blurb="Budget and cost data is visible to the production owner and people granted the budget permission." />;

  const doc: PF.ProductionBudgetDoc = budget || PF.emptyBudget();
  const scen = doc.scenarios.find(s => s.id === doc.activeScenarioId) || doc.scenarios[0];
  const totals = PF.scenarioTotals(scen.lines);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const persist = async (next: PF.ProductionBudgetDoc) => { setBudget(next); try { await PF.saveBudget(prodId, next); } catch (e: any) { flash(isDemo ? 'Demo production — not saved.' : 'Could not save budget.'); } };
  const setLines = (lines: PF.BudgetLine[]) => persist({ ...doc, scenarios: doc.scenarios.map(s => s.id === scen.id ? { ...s, lines } : s) });

  const SEGS: { id: Seg; label: string; soon?: boolean }[] = [
    { id: 'budget', label: 'Budget' }, { id: 'costs', label: 'Costs' }, { id: 'report', label: 'Cost report' },
    { id: 'invoices', label: 'Invoices' }, { id: 'crew', label: 'Crew pay', soon: !flags.enabled('CREW_PAY') },
  ];

  return (
    <div className="space-y-5">
      {preview && <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/80">Admin preview · production finance is off for everyone else</p>}
      <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex flex-wrap gap-6 justify-between">
        <Stat label={`Budget · ${scen.name}`} value={PF.fmtCents(totals.grand)} />
        <Stat label="Above / below the line" value={`${PF.fmtCents(totals.atl)} / ${PF.fmtCents(totals.btl)}`} />
        <Stat label="Actual to date" value={PF.fmtCents(costs.reduce((s, c) => s + c.amountCents, 0))} />
      </div>
      <div className="flex gap-1.5 flex-wrap items-center">
        {SEGS.map(s => <button key={s.id} onClick={() => setSeg(s.id)} className={pill(seg === s.id)}>{s.label}{s.soon && <SoonPill />}</button>)}
        {msg && <span className="ml-auto text-[10px] text-amber-300">{msg}</span>}
      </div>
      {!loaded && <p className="text-xs text-white/30">Loading…</p>}
      {seg === 'budget' && <BudgetSection doc={doc} scen={scen} totals={totals} persist={persist} setLines={setLines} />}
      {seg === 'costs' && <CostsSection prodId={prodId} costs={costs} scenes={scenes} callSheets={callSheets} flash={flash} isDemo={!!isDemo} />}
      {seg === 'report' && <ReportSection prodName={prodName} scen={scen} costs={costs} totalDays={totalDays} callSheets={callSheets} />}
      {seg === 'invoices' && (
        <div className="space-y-3">
          <p className="text-xs text-white/50">Bill clients, distributors and sponsors. Payments go straight to this production’s own Stripe account — Plajah never holds the funds.</p>
          <p className="text-[10px] text-white/30">Suggested price book: {PF.FILM_PRICE_BOOK_DEFAULTS.map(p => `${p.name} ($${p.unitAmount}/${p.unit})`).join(' · ')}</p>
          <BillingHubMount entity={{ kind: 'PRODUCTION', id: prodId }} entityName={prodName} canManage={canManage} />
        </div>
      )}
      {seg === 'crew' && (
        <ComingSoonCard title="Pay crew & contractors" preview={flags.preview('CREW_PAY')}
          blurb="Paying crew and tracking 1099s requires a funds-flow design: Plajah never holds money, so payouts must move from the production’s own Stripe/bank account to each payee. Until that design is reviewed, log crew costs under Costs and mark them paid when you’ve paid them." />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div><p className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</p><p className="text-lg font-black text-white">{value}</p></div>
);

// ── Budget ──────────────────────────────────────────────────────────────────
const BudgetSection: React.FC<{
  doc: PF.ProductionBudgetDoc; scen: PF.BudgetScenario; totals: PF.ScenarioTotals;
  persist: (d: PF.ProductionBudgetDoc) => void; setLines: (l: PF.BudgetLine[]) => void;
}> = ({ doc, scen, totals, persist, setLines }) => {
  const blank = { dept: 'PRODUCTION' as DeptKey, category: 'BTL' as PF.BudgetCategory, description: '', units: '1', rate: '', unitLabel: 'days', fringe: '', cont: '' };
  const [f, setF] = useState(blank);
  const add = () => {
    if (!f.description.trim()) return;
    setLines([...scen.lines, { id: PF.newId(), dept: f.dept, category: f.category, description: f.description.trim(), units: parseFloat(f.units) || 0, rateCents: PF.centsFromDollars(f.rate), unitLabel: f.unitLabel, fringePct: parseFloat(f.fringe) || 0, contingencyPct: parseFloat(f.cont) || 0 }]);
    setF({ ...blank, dept: f.dept, category: f.category });
  };
  const addScenario = () => {
    const id = PF.newId();
    persist({ ...doc, scenarios: [...doc.scenarios, { id, name: `Scenario ${doc.scenarios.length + 1}`, lines: scen.lines.map(l => ({ ...l, id: PF.newId() })) }], activeScenarioId: id });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {doc.scenarios.map(s => (
          <button key={s.id} onClick={() => persist({ ...doc, activeScenarioId: s.id })} className={pill(s.id === scen.id)}>
            {s.name} · {PF.fmtCents(PF.scenarioTotals(s.lines).grand)}
          </button>
        ))}
        <button onClick={addScenario} className={btn}>+ Copy as scenario</button>
        <input className={`${inp} !w-44`} value={scen.name} onChange={e => persist({ ...doc, scenarios: doc.scenarios.map(s => s.id === scen.id ? { ...s, name: e.target.value } : s) })} aria-label="Scenario name" />
        {doc.scenarios.length > 1 && <button className={btn} onClick={() => { const rest = doc.scenarios.filter(s => s.id !== scen.id); persist({ ...doc, scenarios: rest, activeScenarioId: rest[0].id }); }}>Delete scenario</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <select className={inp} value={f.dept} onChange={e => setF({ ...f, dept: e.target.value as DeptKey })}>{DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        <select className={inp} value={f.category} onChange={e => setF({ ...f, category: e.target.value as PF.BudgetCategory })}>{PF.BUDGET_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <input className={`${inp} col-span-2`} placeholder="Description (e.g. Director of Photography)" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        <input className={inp} placeholder="Units" inputMode="decimal" value={f.units} onChange={e => setF({ ...f, units: e.target.value })} />
        <input className={inp} placeholder="Rate $" inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} />
        <input className={inp} placeholder="Unit (days)" value={f.unitLabel} onChange={e => setF({ ...f, unitLabel: e.target.value })} />
        <input className={inp} placeholder="Fringes %" inputMode="decimal" value={f.fringe} onChange={e => setF({ ...f, fringe: e.target.value })} />
        <input className={inp} placeholder="Contingency %" inputMode="decimal" value={f.cont} onChange={e => setF({ ...f, cont: e.target.value })} />
        <button className={btnPri} onClick={add}>Add line</button>
      </div>

      {PF.BUDGET_CATEGORIES.map(cat => {
        const rows = scen.lines.filter(l => l.category === cat.key);
        if (!rows.length) return null;
        return (
          <div key={cat.key} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
            <div className="px-4 py-2 flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40"><span>{cat.label}</span><span>{PF.fmtCents(totals.byCategory[cat.key])}</span></div>
            <table className="w-full text-xs text-white/80">
              <tbody>
                {rows.map(l => {
                  const t = PF.lineTotals(l);
                  return (
                    <tr key={l.id} className="border-t border-white/5">
                      <td className="px-4 py-2">{deptMeta(l.dept).emoji} {deptMeta(l.dept).label}</td>
                      <td className="px-2 py-2">{l.description}</td>
                      <td className="px-2 py-2 text-white/40">{l.units} {l.unitLabel} × {PF.fmtCents(l.rateCents)}</td>
                      <td className="px-2 py-2 text-white/40">{l.fringePct ? `+${l.fringePct}% fr` : ''} {l.contingencyPct ? `+${l.contingencyPct}% ct` : ''}</td>
                      <td className="px-2 py-2 text-right font-black">{PF.fmtCents(t.total)}</td>
                      <td className="px-2 py-2 text-right"><button className="text-red-400/70 hover:text-red-300" onClick={() => setLines(scen.lines.filter(x => x.id !== l.id))} aria-label="Remove line">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {!scen.lines.length && <p className="text-xs text-white/30">No budget lines yet. Add the first one above.</p>}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Subtotal" value={PF.fmtCents(totals.sub)} /><Stat label="Fringes" value={PF.fmtCents(totals.fringe)} />
        <Stat label="Contingency" value={PF.fmtCents(totals.contingency)} /><Stat label="Grand total" value={PF.fmtCents(totals.grand)} />
      </div>
    </div>
  );
};

// ── Costs ───────────────────────────────────────────────────────────────────
const CostsSection: React.FC<{
  prodId: string; costs: PF.CostEntry[]; scenes: ProductionScene[]; callSheets: CallSheet[]; flash: (m: string) => void; isDemo: boolean;
}> = ({ prodId, costs, scenes, callSheets, flash, isDemo }) => {
  const today = new Date().toISOString().slice(0, 10);
  const blank = { vendor: '', dept: 'PRODUCTION' as DeptKey, amount: '', date: today, description: '', paid: false, shootDay: '', sceneId: '' };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => [...new Set(callSheets.map(c => c.shootDay))].sort((a, b) => a - b), [callSheets]);
  const save = async () => {
    if (!f.vendor.trim() || !PF.centsFromDollars(f.amount)) { flash('Vendor and amount are required.'); return; }
    if (isDemo) { flash('Demo production — not saved.'); return; }
    setBusy(true);
    try {
      let receiptUrl: string | undefined;
      if (file) receiptUrl = await PF.uploadReceipt(prodId, file);
      await PF.saveCost(prodId, {
        id: PF.newId(), vendor: f.vendor.trim(), dept: f.dept, amountCents: PF.centsFromDollars(f.amount), date: f.date, description: f.description.trim() || undefined,
        paid: f.paid, receiptUrl, shootDay: f.shootDay ? Number(f.shootDay) : undefined, sceneId: f.sceneId || undefined, createdAt: Date.now(),
      });
      setF({ ...blank, dept: f.dept }); setFile(null);
    } catch { flash('Could not save expense.'); }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <input className={inp} placeholder="Vendor" value={f.vendor} onChange={e => setF({ ...f, vendor: e.target.value })} />
        <select className={inp} value={f.dept} onChange={e => setF({ ...f, dept: e.target.value as DeptKey })}>{DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        <input className={inp} placeholder="Amount $" inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />
        <input className={inp} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
        <input className={`${inp} col-span-2`} placeholder="What was it for?" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        <select className={inp} value={f.shootDay} onChange={e => setF({ ...f, shootDay: e.target.value })}><option value="">Shoot day (optional)</option>{days.map(d => <option key={d} value={d}>Day {d}</option>)}</select>
        <select className={inp} value={f.sceneId} onChange={e => setF({ ...f, sceneId: e.target.value })}><option value="">Scene (optional)</option>{scenes.map(s => <option key={s.id} value={s.id}>Sc {s.sceneNum} · {s.set}</option>)}</select>
        <label className="flex items-center gap-2 text-[11px] text-white/60"><input type="checkbox" checked={f.paid} onChange={e => setF({ ...f, paid: e.target.checked })} /> Paid</label>
        <input type="file" accept="image/*,application/pdf" className="text-[11px] text-white/50 col-span-2" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button className={btnPri} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Log expense'}</button>
      </div>
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        <table className="w-full text-xs text-white/80">
          <tbody>
            {costs.map(c => (
              <tr key={c.id} className="border-t border-white/5 first:border-0">
                <td className="px-4 py-2 text-white/40">{c.date}{c.shootDay ? ` · D${c.shootDay}` : ''}</td>
                <td className="px-2 py-2">{c.vendor}<span className="text-white/30"> · {deptMeta(c.dept).label}</span>{c.description ? <span className="text-white/40"> — {c.description}</span> : null}</td>
                <td className="px-2 py-2 text-right font-black">{PF.fmtCents(c.amountCents)}</td>
                <td className="px-2 py-2"><button className={`text-[10px] font-black uppercase ${c.paid ? 'text-emerald-400' : 'text-amber-400'}`} onClick={() => PF.saveCost(prodId, { ...c, paid: !c.paid })}>{c.paid ? 'Paid' : 'Unpaid'}</button></td>
                <td className="px-2 py-2">{c.receiptUrl && <a href={c.receiptUrl} target="_blank" rel="noreferrer" className="text-sky-400">Receipt</a>}</td>
                <td className="px-2 py-2"><button className="text-red-400/70 hover:text-red-300" onClick={() => PF.deleteCost(prodId, c.id)} aria-label="Delete expense">✕</button></td>
              </tr>
            ))}
            {!costs.length && <tr><td className="px-4 py-6 text-white/30">No expenses logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Report ──────────────────────────────────────────────────────────────────
const ReportSection: React.FC<{ prodName: string; scen: PF.BudgetScenario; costs: PF.CostEntry[]; totalDays: number; callSheets: CallSheet[] }> = ({ prodName, scen, costs, totalDays, callSheets }) => {
  const { rows, totals } = PF.costReport(scen.lines, costs);
  const today = new Date().toISOString().slice(0, 10);
  const daysShot = new Set(callSheets.filter(c => c.date <= today).map(c => c.shootDay)).size;
  const proj = PF.projectOverage(totals.budget, totals.actual, daysShot, totalDays || callSheets[0]?.totalDays || 0);
  const [date, setDate] = useState(today);
  const hot = PF.dailyCostReport(costs, { date }, totals.budget);
  const label = (d: string) => (DEPARTMENTS.find(x => x.key === d)?.label || d);
  const tableHtml = `<h2>${prodName} — cost report</h2><table><tr><th>Dept</th><th class=n>Budget</th><th class=n>Actual</th><th class=n>Variance</th></tr>${[...rows, totals].map(r => `<tr><td>${label(r.dept)}</td><td class=n>${PF.fmtCents(r.budget)}</td><td class=n>${PF.fmtCents(r.actual)}</td><td class=n>${PF.fmtCents(r.variance)}</td></tr>`).join('')}</table>`;
  const hotHtml = `<h2>${prodName} — hot costs ${date}</h2><table><tr><th>Dept</th><th class=n>Today</th></tr>${Object.entries(hot.byDept).map(([d, v]) => `<tr><td>${label(d)}</td><td class=n>${PF.fmtCents(v)}</td></tr>`).join('')}<tr><th>Day total</th><th class=n>${PF.fmtCents(hot.dayTotal)}</th></tr><tr><td>To date</td><td class=n>${PF.fmtCents(hot.toDate)}</td></tr><tr><td>Remaining</td><td class=n>${PF.fmtCents(hot.remaining)}</td></tr></table>`;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button className={btn} onClick={() => PF.downloadText(`${prodName}-cost-report.csv`, PF.costReportCsv(scen.lines, costs))}>Export CSV</button>
        <button className={btn} onClick={() => PF.printHtml(`${prodName} cost report`, tableHtml)}>Print / PDF</button>
      </div>
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        <table className="w-full text-xs text-white/80">
          <thead><tr className="text-[10px] uppercase tracking-widest text-white/30"><th className="text-left px-4 py-2">Dept</th><th className="text-right px-2">Budget</th><th className="text-right px-2">Actual</th><th className="text-right px-2">Unpaid</th><th className="text-right px-4">Variance</th></tr></thead>
          <tbody>
            {[...rows, totals].map(r => (
              <tr key={r.dept} className={`border-t border-white/5 ${r.dept === 'TOTAL' ? 'font-black' : ''}`}>
                <td className="px-4 py-2">{r.dept === 'TOTAL' ? 'Total' : label(r.dept)}</td>
                <td className="px-2 text-right">{PF.fmtCents(r.budget)}</td><td className="px-2 text-right">{PF.fmtCents(r.actual)}</td><td className="px-2 text-right text-amber-300/80">{PF.fmtCents(r.unpaid)}</td>
                <td className={`px-4 text-right ${r.variance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{PF.fmtCents(r.variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/70">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Projection</p>
        {proj.pct > 0
          ? <p>{daysShot} of {totalDays} shoot days done → projected final cost <b>{PF.fmtCents(proj.projected)}</b> ({proj.overage > 0 ? <span className="text-red-400">{PF.fmtCents(proj.overage)} over budget</span> : <span className="text-emerald-400">{PF.fmtCents(-proj.overage)} under budget</span>}).</p>
          : <p className="text-white/40">Projection starts once shoot days are completed (needs published call sheets with dates).</p>}
      </div>
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Daily cost report (hot costs)</p>
          <input type="date" className={`${inp} !w-40`} value={date} onChange={e => setDate(e.target.value)} />
          <button className={btn} onClick={() => PF.printHtml(`Hot costs ${date}`, hotHtml)}>Print / PDF</button>
        </div>
        <p className="text-xs text-white/70">Day total <b>{PF.fmtCents(hot.dayTotal)}</b> · to date {PF.fmtCents(hot.toDate)} · remaining {PF.fmtCents(hot.remaining)}</p>
        {Object.entries(hot.byDept).map(([d, v]) => <p key={d} className="text-[11px] text-white/50">{label(d)}: {PF.fmtCents(v)}</p>)}
      </div>
    </div>
  );
};

export default ProductionFinance;
