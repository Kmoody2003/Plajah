// BudgetPulseCard — shared visual atoms for Budget Pulse (status chip, budget bar with a "today" marker,
// sparkline, heat colours) plus the compact summary card embedded in FinanceHome.
// Colour is NEVER the only signal: every status renders colour + icon + words.
import React from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import type { Organization } from '../../../../types';
import { STATUS_META, usd0, type Assessment, type PulseStatus } from '../../../../services/acctPulse';
import { useBudgetPulse } from '../../../../services/acctPulseLive';
import { card, heading } from './shared';

export const StatusChip: React.FC<{ status: PulseStatus; big?: boolean; count?: number; label?: string }> = ({ status, big, count, label }) => {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-widest ${big ? 'px-3.5 py-2 text-[11px]' : 'px-2 py-0.5 text-[9px]'}`}
      style={{ color: m.hex, background: m.soft, borderColor: m.hex + '55' }}>
      <span aria-hidden="true">{m.icon}</span>{count !== undefined && <span className="tabular-nums">{count}</span>}{label ?? m.short}
    </span>
  );
};

/** Stacked bar: spent (solid) · committed (hatched) · pending (outline), a budget-end tick, and a TODAY marker where pace should be. */
export const BudgetBar: React.FC<{ a: Assessment; height?: number }> = ({ a, height = 10 }) => {
  const m = STATUS_META[a.status];
  const scale = Math.max(a.budget, a.hard + a.pending, 1);
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const todayAt = a.budget > 0 ? (a.budgetToDate / scale) * 100 : null;
  const label = a.budget > 0
    ? `${usd0(a.spent)} spent, ${usd0(a.committed)} approved, ${usd0(a.pending)} pending of ${usd0(a.budget)}; ${a.expectedPct}% of the plan is expected by today. ${m.label}.`
    : `${usd0(a.hard + a.pending)} spent, no budget set.`;
  return (
    <div role="img" aria-label={label} className="relative w-full rounded-full bg-white/10" style={{ height }}>
      <div className="absolute inset-y-0 left-0 rounded-full overflow-hidden flex" style={{ width: pct(a.hard + a.pending) }}>
        <div style={{ width: `${sdivPct(a.spent, a.hard + a.pending)}%`, background: m.hex }} />
        <div style={{ width: `${sdivPct(a.committed, a.hard + a.pending)}%`, background: `repeating-linear-gradient(135deg, ${m.hex}cc 0 3px, ${m.hex}55 3px 6px)` }} />
        <div style={{ width: `${sdivPct(a.pending, a.hard + a.pending)}%`, background: 'rgba(255,255,255,0.28)' }} />
      </div>
      {a.budget > 0 && a.hard + a.pending > a.budget && <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-white/70" style={{ left: pct(a.budget) }} title="Budget limit" />}
      {todayAt !== null && <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-white" style={{ left: `${Math.min(99.5, todayAt)}%` }} title={`Today: ${a.expectedPct}% of the plan expected`}><span className="absolute -top-1 -left-[3px] w-2 h-2 rounded-full bg-white" /></div>}
    </div>
  );
};
const sdivPct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

export const Sparkline: React.FC<{ values: number[]; color: string; w?: number; h?: number; label?: string }> = ({ values, color, w = 96, h = 28, label }) => {
  const max = Math.max(1, ...values), n = values.length;
  const pts = values.map((v, i) => `${(i / Math.max(1, n - 1)) * (w - 4) + 2},${h - 3 - (v / max) * (h - 8)}`).join(' ');
  const last = values[n - 1] ?? 0;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label || `12-month trend, latest ${usd0(last)}`} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={(n - 1) / Math.max(1, n - 1) * (w - 4) + 2} cy={h - 3 - (last / max) * (h - 8)} r="2.4" fill={color} />
    </svg>
  );
};

/** Heat colour 0..1 → rgba (calm blue → amber → red, readable on dark). */
export const heat = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  const stops = [[30, 41, 59], [56, 130, 140], [250, 204, 21], [251, 146, 60], [248, 113, 113]];
  const p = x * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

export const Dot: React.FC<{ live: boolean }> = ({ live }) => <span className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} aria-hidden="true" />;

/** Compact "Budget Pulse" summary for FinanceHome: colour chips + the 3 departments that most need a look. */
const BudgetPulseCard: React.FC<{ org: Organization; onOpen: () => void }> = ({ org, onOpen }) => {
  const { report, loading, alerts, restricted } = useBudgetPulse(org);
  const order: PulseStatus[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];
  const top = (report?.depts || []).filter(d => d.status === 'RED' || d.status === 'ORANGE' || d.status === 'YELLOW').slice(0, 3);
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center justify-between"><h3 className={heading}>Budget pulse</h3><Activity size={14} className="text-white/20 -mt-3" /></div>
      {loading ? <div className="h-16 rounded-2xl bg-white/5 animate-pulse" /> : !report || (!report.hasBudget && !report.depts.length) ? (
        <button onClick={onOpen} className="w-full text-left text-xs text-white/50 hover:text-white">Set a budget to unlock pace tracking and early warnings <ArrowRight size={11} className="inline" /></button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">{order.map(s => <StatusChip key={s} status={s} count={report.counts[s]} label={STATUS_META[s].short} />)}</div>
          {top.length === 0 ? <p className="text-xs text-white/60">{report.counts.GREEN ? 'Every budgeted department is on track.' : 'Nothing needs attention right now.'}</p> : (
            <div className="space-y-2.5">{top.map(d => (
              <button key={d.deptId} onClick={onOpen} className="w-full text-left">
                <div className="flex justify-between text-[11px]"><span className="font-bold text-white/85 truncate">{d.name}</span><span className="tabular-nums" style={{ color: STATUS_META[d.status].hex }}>{d.status === 'RED' ? `${usd0(d.hard - d.budget)} over` : d.overrun > 0 ? `on pace for +${usd0(d.overrun)}` : `${d.usedPct}% used`}</span></div>
                <div className="mt-1"><BudgetBar a={d} height={6} /></div>
              </button>))}</div>
          )}
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-white/35">{alerts.length ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'}` : 'No alerts'}{restricted ? ' · your departments' : ''}</span>
            <button onClick={onOpen} className="text-[10px] font-black uppercase tracking-widest text-small-orange inline-flex items-center gap-1">Open Pulse <ArrowRight size={11} /></button>
          </div>
        </>
      )}
    </section>
  );
};
export default BudgetPulseCard;
