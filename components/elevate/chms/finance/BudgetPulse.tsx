// BudgetPulse — near-real-time money flow for finance departments: calm, glanceable, colour-coded, with trends.
// Everything shown is computed by services/acctPulse.ts (pure) from live Firestore listeners
// (services/acctPulseLive.ts). Colour is always paired with an icon + words.
import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BellOff, CheckCheck, Clock, Download, FileText, Landmark, MessageSquare, PiggyBank, Printer, Receipt, Sparkles, X } from 'lucide-react';
import type { Organization, OrgMembership } from '../../../../types';
import { auth } from '../../../../services/firebase';
import { createNotification } from '../../../../services/backendService';
import { updateOrganization } from '../../../../services/organizationService';
import { auditExport, saveBudget } from '../../../../services/acctService';
import { downloadText } from '../../../../services/chmsFinanceReports';
import {
  SEVERITY_STATUS, STATUS_META, deptHeadline, pulseCsv, suggestBudgetLines, usd0, usd2,
  type AlertPref, type DeptPulse, type PulseAlert, type PulseScope, type PulseStatus,
} from '../../../../services/acctPulse';
import {
  askAriaWhy, getAlertPref, isMuted, requestAlertSweep, setAlertPref, useAlertAcks, useBudgetPulse, type LivePulse,
} from '../../../../services/acctPulseLive';
import type { HubTab, SpendSub } from '../../../../services/acctSpending';
import { card, field, fieldSm, btnPrimary, btnGhost, label, heading, printHtml, Empty } from './shared';
import { useDo, useToast } from './SpendingUi';
import { BudgetBar, Dot, Sparkline, StatusChip } from './BudgetPulseCard';
import { FlowView, ProjectsView, TrendsView } from './BudgetPulseViews';

type View = 'board' | 'flow' | 'projects' | 'trends';
export interface BudgetPulseProps { org: Organization; myMembership: OrgMembership | null; onClose?: () => void; onNavigate?: (t: HubTab, s?: SpendSub) => void; onOrgChange?: (o: Organization) => void }

const initials = (n?: string) => (n || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const ago = (t: number, now: number) => { if (!t) return 'connecting…'; const s = Math.max(0, Math.round((now - t) / 1000)); return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };

const BudgetPulse: React.FC<BudgetPulseProps> = ({ org: initialOrg, myMembership, onClose, onNavigate, onOrgChange }) => {
  const [org, setOrg] = useState(initialOrg);
  useEffect(() => setOrg(initialOrg), [initialOrg]);
  const [view, setView] = useState<View>('board');
  const [scope, setScope] = useState<PulseScope>('YEAR');
  const [simple, setSimple] = useState<boolean>(() => { try { const v = localStorage.getItem(`books_simple_${initialOrg.id}`); return v === null ? true : v === '1'; } catch { return true; } });
  const [open, setOpen] = useState<string | null>(null);
  const [showMuted, setShowMuted] = useState(false);
  const [pref, setPref] = useState<AlertPref>('WATCH');
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  const live = useBudgetPulse(org, undefined, scope);
  const { acks, stored, ack } = useAlertAcks(org.id);
  const { report, access } = live;
  const canEdit = access.canRaiseBudget;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  useEffect(() => { getAlertPref(org.id).then(setPref); }, [org.id]);
  // Make sure alert docs + notifications exist even if the scheduled sweep has not run (server dedupes; throttled to 30 min).
  useEffect(() => { if (canEdit) requestAlertSweep(org.id); }, [org.id, canEdit]);

  const toggleSimple = (v: boolean) => { setSimple(v); try { localStorage.setItem(`books_simple_${org.id}`, v ? '1' : '0'); } catch { /* */ } };
  const setOrgBoth = (o: Organization) => { setOrg(o); onOrgChange?.(o); };

  const alerts = useMemo(() => {
    const t = Date.now();
    // Server-persisted alerts that the client cannot re-derive (e.g. fired earlier, now resolved) are intentionally not resurrected.
    const vis = live.alerts.filter(a => (access.full || (a.deptId && access.headOf.includes(a.deptId))));
    return { active: vis.filter(a => !isMuted(acks, a.id, t)), muted: vis.filter(a => isMuted(acks, a.id, t)) };
  }, [live.alerts, acks, access, stored]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = report?.depts.find(d => d.deptId === open) || null;
  const month = new Date().toLocaleString('en-US', { month: 'long' });

  if (live.loading || !report) return <div className="space-y-3" aria-busy="true"><div className="h-24 rounded-[2rem] bg-white/5 animate-pulse" /><div className="h-40 rounded-[2rem] bg-white/5 animate-pulse" /></div>;

  if (!access.full && !access.isDeptHead) return <div className={`${card} p-8`}><Empty>Budget Pulse is for finance roles, pastors and department heads.</Empty></div>;

  const tabs: { k: View; l: string }[] = [{ k: 'board', l: 'Pulse' }, { k: 'flow', l: simple ? 'Where it goes' : 'Flow' }, { k: 'projects', l: 'Projects' }, { k: 'trends', l: 'Trends' }];
  const needsBudget = !report.hasBudget;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]"><h2 className="text-base font-black text-white flex items-center gap-2"><Activity size={16} className="text-small-orange" />Budget pulse</h2>
          <p className="text-[10px] text-white/40 flex items-center gap-1.5"><Dot live={Date.now() - live.updatedAt < 120000} />Live · updated {ago(live.updatedAt, now)} · {report.window.label}</p></div>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1" role="group" aria-label="Period">
          {([['MONTH', 'Month'], ['QUARTER', 'Quarter'], ['YEAR', 'Year']] as const).map(([k, l]) => <button key={k} onClick={() => setScope(k)} aria-pressed={scope === k} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${scope === k ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>{l}</button>)}</div>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1" role="group" aria-label="Detail level">
          {[{ v: true, l: 'Simple' }, { v: false, l: 'Pro' }].map(o => <button key={o.l} onClick={() => toggleSimple(o.v)} aria-pressed={simple === o.v} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${simple === o.v ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>{o.l}</button>)}</div>
        <button onClick={() => { downloadText(`budget-pulse-${report.window.key}.csv`, pulseCsv(report)); auditExport(org.id, 'Budget pulse CSV', { rows: report.depts.length }); }} className={btnGhost}><Download size={12} /> CSV</button>
        <button onClick={() => printHtml(snapshotHtml(org, report, alerts.active))} className={btnGhost}><Printer size={12} /> Board snapshot</button>
        {onClose && <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white"><X size={14} /></button>}
      </div>

      {live.restricted && <div className="px-4 py-2.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-[11px] text-sky-200">{access.full ? 'Some ledger data could not be read, so figures use expenses and budgets only.' : `You're seeing ${access.headOf.length === 1 ? 'your department' : 'your departments'} only — built from budgets and visible expenses. Finance sees the whole church.`}</div>}

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist">{tabs.map(t => <button key={t.k} role="tab" aria-selected={view === t.k} onClick={() => setView(t.k)} className={`shrink-0 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${view === t.k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{t.l}</button>)}</div>

      {view === 'flow' && <FlowView org={org} live={live} simple={simple} />}
      {view === 'projects' && <ProjectsView org={org} live={live} simple={simple} canEdit={canEdit} />}
      {view === 'trends' && <TrendsView live={live} simple={simple} />}

      {view === 'board' && (
        <>
          {/* top strip */}
          <div className="grid lg:grid-cols-[1fr_auto] gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {access.full && (
                <div className={`${card} p-4`}><p className={label}>Cash runway</p>
                  <p className="text-xl font-black mt-1 text-white tabular-nums">{report.org.cash === null ? '—' : report.org.runwayMonths === null ? (report.org.burn3 !== null && report.org.burn3 <= 0 ? 'Growing' : '—') : `${report.org.runwayMonths} mo`}</p>
                  <div className="mt-1.5">{report.org.runwayStatus !== 'NONE' ? <StatusChip status={report.org.runwayStatus} /> : <span className="text-[10px] text-white/40">Set up your books</span>}</div>
                  {report.org.cash !== null && <p className="text-[10px] text-white/35 mt-1">{usd0(report.org.cash)} cash{!simple && report.org.burn3 !== null ? ` · ${usd0(report.org.burn3)}/mo net burn` : ''}</p>}</div>)}
              {access.full && <div className={`${card} p-4`}><p className={label}>{month} in</p><p className="text-xl font-black mt-1 text-white tabular-nums">{usd0(report.org.monthIn)}</p><p className="text-[10px] text-white/35 mt-1">{simple ? 'money received' : 'revenue posted'}</p></div>}
              {access.full && <div className={`${card} p-4`}><p className={label}>{month} out</p><p className="text-xl font-black mt-1 text-white tabular-nums">{usd0(report.org.monthOut)}</p><p className="text-[10px] mt-1" style={{ color: report.org.net < 0 ? '#fb923c' : '#4ade80' }}>{report.org.net >= 0 ? '+' : ''}{usd0(report.org.net)} net</p></div>}
              {access.full && <div className={`${card} p-4`}><p className={label}>Net, 12 months</p><div className="mt-2"><Sparkline values={report.org.netSeries.map(m => Math.max(0, m.net + Math.abs(Math.min(0, ...report.org.netSeries.map(x => x.net)))))} color="#94a3b8" w={110} h={34} label="Net cash flow per month, last 12 months" /></div></div>}
              {!access.full && <div className={`${card} p-4 col-span-2 sm:col-span-4`}><p className={label}>Your budget · {report.window.label}</p><p className="text-xl font-black mt-1 text-white tabular-nums">{usd0(report.total.hard)} <span className="text-white/40 text-sm font-bold">of {usd0(report.total.budget)}</span></p></div>}
            </div>
            <div className="flex flex-wrap lg:flex-col gap-2 justify-center" aria-label="Departments by health">
              {(['RED', 'ORANGE', 'YELLOW', 'GREEN'] as PulseStatus[]).map(s => <StatusChip key={s} big status={s} count={report.counts[s]} label={STATUS_META[s].label} />)}
            </div>
          </div>

          {needsBudget && <EmptyBudget org={org} live={live} canEdit={canEdit} onNavigate={onNavigate} />}

          {report.income && access.full && (
            <div className={`${card} p-4 flex flex-wrap items-center gap-4`}><div className="flex-1 min-w-[200px]"><p className={label}>{simple ? 'Giving vs plan' : 'Revenue vs budget'}</p><p className="text-sm font-black text-white mt-1">{usd0(report.income.given)} <span className="text-white/40 font-bold">of {usd0(report.income.budgetToDate)} expected so far</span></p></div><StatusChip status={report.income.status} /><div className="w-48"><BudgetBar a={{ ...report.income, status: report.income.status }} height={8} /></div></div>)}

          {/* alerts */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-3"><h3 className={`${heading} mb-0`}>Needs a look</h3>
              <div className="flex items-center gap-2 text-[10px] text-white/40"><BellOff size={11} /><select aria-label="Notification level" value={pref} onChange={async e => { const v = e.target.value as AlertPref; setPref(v); try { await setAlertPref(org.id, v); toast('Notification level saved'); } catch { toast('Could not save that preference', { tone: 'bad' }); } }} className={fieldSm}><option value="ALL">Notify me about everything</option><option value="WATCH">Watch and above</option><option value="RISK">At risk and over only</option><option value="CRITICAL">Over budget only</option><option value="OFF">Mute notifications</option></select></div></div>
            {alerts.active.length === 0 ? <div className={`${card} p-5 text-xs text-white/60 flex items-center gap-2`}><CheckCheck size={15} className="text-emerald-400" />All quiet. Nothing is trending toward its limit.</div> : (
              <div className="space-y-2.5">{alerts.active.slice(0, 8).map(a => <AlertRow key={a.id} a={a} org={org} live={live} onAck={ack} onOpen={() => a.deptId || a.scope === 'DEPT' ? setOpen(a.scopeId) : a.scope === 'PROJECT' ? setView('projects') : null} />)}</div>)}
            {alerts.muted.length > 0 && <button onClick={() => setShowMuted(v => !v)} className="mt-2 text-[10px] text-white/40 hover:text-white">{showMuted ? 'Hide' : 'Show'} {alerts.muted.length} acknowledged/snoozed</button>}
            {showMuted && <div className="space-y-2 mt-2 opacity-60">{alerts.muted.map(a => <AlertRow key={a.id} a={a} org={org} live={live} onAck={ack} muted />)}</div>}
          </section>

          {/* department board */}
          <section>
            <h3 className={heading}>Where the money is flowing</h3>
            {report.depts.length === 0 ? <div className={`${card} p-6`}><Empty>No department spending yet. As soon as a bill is approved or paid it appears here.</Empty></div> : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{report.depts.map(d => <DeptCard key={d.deptId} d={d} org={org} simple={simple} onOpen={() => setOpen(d.deptId)} />)}</div>)}
          </section>
        </>
      )}

      {sel && <Drawer d={sel} org={org} live={live} simple={simple} canRaise={canEdit} myMembership={myMembership} onClose={() => setOpen(null)} onNavigate={onNavigate} setOrg={setOrgBoth} />}
    </div>
  );
};
export default BudgetPulse;

// ── Empty state: no budget yet ──────────────────────────────────────────────────────────────────
const EmptyBudget: React.FC<{ org: Organization; live: LivePulse; canEdit: boolean; onNavigate?: BudgetPulseProps['onNavigate'] }> = ({ org, live, canEdit, onNavigate }) => {
  const { busy, run } = useDo();
  const lines = useMemo(() => suggestBudgetLines({ accounts: live.data.accounts, journals: live.data.journals, today: new Date().toLocaleDateString('en-CA'), startMonth: org.financeSettings?.fiscalYearStartMonth || 1 }), [live.data, org]);
  const total = lines.reduce((s, l) => s + l.amounts.reduce((a, b) => a + b, 0), 0);
  return (
    <div className={`${card} p-6 text-center`}>
      <PiggyBank size={28} className="mx-auto text-small-orange mb-2" />
      <p className="text-sm font-black text-white">Set a budget to unlock pace tracking</p>
      <p className="text-xs text-white/50 mt-1 max-w-md mx-auto">Once each department has a budget, you'll see who is ahead of pace, who is on track, and a heads-up before anyone goes over.</p>
      <div className="flex flex-wrap gap-2 justify-center mt-4">
        {onNavigate && <button onClick={() => onNavigate('books')} className={btnPrimary}>Open Budgets</button>}
        {canEdit && lines.length > 0 && <button disabled={busy} onClick={() => { if (!confirm(`Create a ${live.fiscalYear} budget of ${usd0(total)} from your last 12 months of real spending (${lines.length} lines)? You can edit every line in Budgets.`)) return; run(() => saveBudget(org.id, live.fiscalYear, lines), 'Budget created from your actual spending'); }} className={btnGhost}><Sparkles size={12} /> Suggest from last 12 months</button>}
      </div>
    </div>
  );
};

// ── Alert row ───────────────────────────────────────────────────────────────────────────────────
const AlertRow: React.FC<{ a: PulseAlert; org: Organization; live: LivePulse; onAck: (id: string, snooze?: number) => Promise<void>; onOpen?: () => void; muted?: boolean }> = ({ a, org, live, onAck, onOpen, muted }) => {
  const st = SEVERITY_STATUS[a.severity], m = STATUS_META[st];
  const [why, setWhy] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const dept = live.report?.depts.find(d => d.deptId === a.scopeId);
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: m.hex + '55', background: m.soft }} role="group" aria-label={`${m.label} alert: ${a.title}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sm" style={{ color: m.hex }} aria-hidden="true">{m.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><p className="text-xs font-black text-white">{a.title}</p><StatusChip status={st} label={a.severity === 'CRITICAL' ? 'Over' : a.severity === 'RISK' ? 'At risk' : 'Watch'} /></div>
          <p className="text-xs text-white/80 mt-1">{a.message}</p>
          <p className="text-[11px] text-white/50 mt-1"><b className="text-white/70">Next:</b> {a.nextStep}</p>
          {why && <p className="text-[11px] text-white/80 mt-2 p-3 rounded-xl bg-black/30 border border-white/10"><Sparkles size={11} className="inline mr-1 text-small-orange" />{why}</p>}
          {!muted && (
            <div className="flex flex-wrap gap-2 mt-3">
              {onOpen && <button onClick={onOpen} className={btnGhost}>Open</button>}
              {dept && <button disabled={busy} onClick={async () => { setBusy(true); setWhy(await askAriaWhy(org, dept)); setBusy(false); }} className={btnGhost}><Sparkles size={11} /> {busy ? 'Thinking…' : 'Ask ARIA why'}</button>}
              <button onClick={() => onAck(a.id)} className={btnGhost}><CheckCheck size={11} /> Got it</button>
              <button onClick={() => onAck(a.id, Date.now() + 7 * 86400000)} className={btnGhost}><Clock size={11} /> Snooze 7d</button>
            </div>)}
        </div>
      </div>
    </div>
  );
};

// ── Department card ─────────────────────────────────────────────────────────────────────────────
const DeptCard: React.FC<{ d: DeptPulse; org: Organization; simple: boolean; onOpen: () => void }> = ({ d, org, simple, onOpen }) => {
  const m = STATUS_META[d.status];
  const head = org.ministries?.find(x => x.id === d.deptId);
  return (
    <button onClick={onOpen} className={`${card} p-5 text-left transition-all hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40`} style={{ borderColor: m.hex + '45' }} aria-label={`${d.name}: ${m.label}. ${deptHeadline(d)}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-black text-white/70 shrink-0" title={head?.leaderName ? `Owner: ${head.leaderName}` : 'No owner assigned'}>{initials(head?.leaderName || d.name)}</span>
        <div className="flex-1 min-w-0"><p className="text-sm font-black text-white truncate">{d.name}</p><p className="text-[10px] text-white/40 truncate">{head?.leaderName ? `Owner · ${head.leaderName}` : d.isGeneral ? 'Not tied to a department' : 'No owner assigned'}</p></div>
        <StatusChip status={d.status} />
      </div>
      <p className="text-xs mt-3" style={{ color: d.status === 'GREEN' || d.status === 'NONE' ? '#cbd5e1' : m.hex }}>{deptHeadline(d)}</p>
      <div className="mt-3"><BudgetBar a={d} /></div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-white/50 tabular-nums">
        <span>{usd0(d.hard)}{d.pending > 0 && <span className="text-white/35"> + {usd0(d.pending)} pending</span>}</span>
        <span>{d.budget > 0 ? `of ${usd0(d.budget)}` : 'no budget'}</span>
      </div>
      <div className="flex items-end justify-between mt-3 gap-3">
        <div className="text-[10px] text-white/40 space-y-0.5">
          {d.runwayDays !== null && d.budget > 0 && d.status !== 'GREEN' && <p>{d.runwayDays <= 0 ? 'Budget used up' : `${d.runwayDays} days of budget left`}</p>}
          {!simple && d.paceRatio !== null && <p>Pace {Math.round(d.paceRatio * 100)}% · burn {usd0(d.burnPerDay)}/day</p>}
          {d.overrun > 0 && d.status !== 'RED' && <p style={{ color: m.hex }}>Projected +{usd0(d.overrun)} over</p>}
        </div>
        <Sparkline values={d.monthly} color={m.hex} />
      </div>
    </button>
  );
};

// ── Drill-down drawer ───────────────────────────────────────────────────────────────────────────
const Drawer: React.FC<{ d: DeptPulse; org: Organization; live: LivePulse; simple: boolean; canRaise: boolean; myMembership: OrgMembership | null; onClose: () => void; onNavigate?: BudgetPulseProps['onNavigate']; setOrg: (o: Organization) => void }> = ({ d, org, live, simple, canRaise, onClose, onNavigate, setOrg }) => {
  const [tab, setTab] = useState<'why' | 'accounts' | 'txns' | 'actions'>('why');
  const [why, setWhy] = useState<string | null>(null); const [thinking, setThinking] = useState(false);
  const [amt, setAmt] = useState(''); const [note, setNote] = useState('');
  const { busy, run } = useDo();
  const m = STATUS_META[d.status];
  const senderUid = auth.currentUser?.uid || '';
  const finance = [...new Set([...(org.financeUids || []), ...(org.accountingUids || [])])];
  const notify = async (to: string[], title: string, message: string) => { await Promise.all(to.filter(u => u !== senderUid).map(u => createNotification({ userId: u, senderId: senderUid, senderName: org.name, senderPhoto: org.logoUrl || '', type: 'SYSTEM', title, message, targetId: org.id }))); };

  const raise = async () => {
    const add = Number(amt); if (!(add > 0)) throw new Error('Enter an amount to add.');
    const fy = live.fiscalYear; const doc = live.data.budgets.filter(b => b.fiscalYear === fy).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    const lines = (doc?.lines || []).map(l => ({ ...l, amounts: [...l.amounts] }));
    const accId = d.accounts.find(a => a.accountId)?.accountId || lines.find(l => (l.deptId || '_general') === d.deptId)?.accountId;
    if (!accId) throw new Error('Pick an account in Budgets first — this department has no budget line to raise.');
    let line = lines.find(l => l.accountId === accId && (l.deptId || '_general') === d.deptId);
    if (!line) { line = { accountId: accId, deptId: d.isGeneral ? undefined : d.deptId, amounts: Array(12).fill(0) }; lines.push(line); }
    const rem = live.report!.window.allMonths.map((_, i) => i).filter(i => i >= live.report!.window.curIdx);
    const per = Math.round((add / rem.length) * 100) / 100;
    rem.forEach((i, k) => { line!.amounts[i] = Math.round(((line!.amounts[i] || 0) + (k === rem.length - 1 ? add - per * (rem.length - 1) : per)) * 100) / 100; });
    await saveBudget(org.id, fy, lines);
    setAmt('');
  };

  const nav = (t: HubTab, s?: SpendSub) => { onNavigate?.(t, s); onClose(); };
  return (
    <div className="fixed inset-0 z-[200] flex justify-end" role="dialog" aria-modal="true" aria-label={`${d.name} budget details`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full overflow-y-auto bg-[#0b0b0f] border-l border-white/10 p-6 space-y-5">
        <div className="flex items-start gap-3"><div className="flex-1"><h3 className="text-lg font-black text-white">{d.name}</h3><div className="mt-1.5 flex items-center gap-2"><StatusChip status={d.status} /><span className="text-[11px] text-white/60">{deptHeadline(d)}</span></div></div><button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/5 text-white/60 hover:text-white"><X size={14} /></button></div>
        <BudgetBar a={d} height={12} />
        <div className="grid grid-cols-3 gap-2 text-center">{[['Spent', d.spent], ['Approved', d.committed], ['Pending', d.pending]].map(([l, v]) => <div key={l as string} className="rounded-2xl bg-white/[0.04] border border-white/10 py-2.5"><p className={label}>{l}</p><p className="text-sm font-black text-white tabular-nums">{usd0(v as number)}</p></div>)}</div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{([['why', 'What changed'], ['accounts', simple ? 'Categories' : 'Accounts'], ['txns', 'Transactions'], ['actions', 'Actions']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${tab === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>)}</div>

        {tab === 'why' && (
          <div className="space-y-4">
            <Forecast d={d} win={live.report!.window} />
            <ul className="space-y-2">{d.narrative.length ? d.narrative.map((n, i) => <li key={i} className="text-xs text-white/75 flex gap-2"><span style={{ color: m.hex }} aria-hidden="true">•</span>{n}</li>) : <li className="text-xs text-white/40">Nothing notable yet.</li>}</ul>
            {!simple && <p className="text-[10px] text-white/35">Pace {d.paceRatio === null ? '—' : Math.round(d.paceRatio * 100) + '%'} · expected {d.expectedPct}% by today · linear projection {usd0(d.projectedLinear)} · budget-shaped projection {usd0(d.projected)}</p>}
            <button disabled={thinking} onClick={async () => { setThinking(true); setWhy(await askAriaWhy(org, d)); setThinking(false); }} className={btnGhost}><Sparkles size={12} /> {thinking ? 'Thinking…' : 'Ask ARIA why'}</button>
            {why && <p className="text-xs text-white/85 p-3 rounded-2xl bg-white/[0.04] border border-white/10">{why}</p>}
          </div>)}

        {tab === 'accounts' && (
          <div className="space-y-3">{d.accounts.length === 0 ? <Empty>No account-level activity.</Empty> : d.accounts.map(a => <div key={a.key}><div className="flex justify-between text-[11px]"><span className="text-white/80 font-bold truncate">{simple ? a.name : `${a.code ? a.code + ' · ' : ''}${a.name}`}</span><span className="tabular-nums" style={{ color: STATUS_META[a.status].hex }}>{usd0(a.hard)}{a.budget > 0 ? ` / ${usd0(a.budget)}` : ''}</span></div><div className="mt-1"><BudgetBar a={a} height={6} /></div></div>)}</div>)}

        {tab === 'txns' && (
          <div className="divide-y divide-white/5">{d.txns.length === 0 ? <Empty>No transactions in this period.</Empty> : d.txns.slice(0, 80).map((t, i) => (
            <button key={t.kind + t.id + i} onClick={() => t.kind === 'EXPENSE' ? nav('spending', t.state === 'PENDING' ? 'approve' : 'register') : nav('books')} className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-white/[0.03] px-1 rounded-lg">
              <div className="flex-1 min-w-0"><p className="text-xs text-white/85 truncate">{t.vendor ? `${t.vendor} · ` : ''}{t.memo}</p><p className="text-[10px] text-white/35">{t.date}</p></div>
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/10 text-white/50">{t.state === 'POSTED' ? 'Paid' : t.state === 'COMMITTED' ? 'Approved' : 'Pending'}</span>
              <span className="text-xs tabular-nums text-white/80 w-20 text-right">{usd2(t.amount)}</span></button>))}</div>)}

        {tab === 'actions' && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <button onClick={() => nav('spending', 'approve')} className={btnGhost}><Receipt size={12} /> View pending requests</button>
              <button onClick={() => nav('books')} className={btnGhost}><Landmark size={12} /> Open budgets</button>
            </div>
            <div className="rounded-2xl border border-white/10 p-4 space-y-2">
              <p className={label}>Message the department head</p>
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={`e.g. "${d.name} is trending ahead of budget — can we talk through upcoming purchases?"`} className={field} />
              <button disabled={busy || !d.headUids.length} onClick={() => run(() => notify(d.headUids, `${d.name} budget`, note.trim() || deptHeadline(d)), 'Sent')} className={btnPrimary}><MessageSquare size={12} /> {d.headUids.length ? 'Send' : 'No head assigned'}</button>
            </div>
            <div className="rounded-2xl border border-white/10 p-4 space-y-2">
              <p className={label}>{canRaise ? 'Raise this budget' : 'Request a budget transfer'}</p>
              <input type="number" min={0} value={amt} onChange={e => setAmt(e.target.value)} placeholder="Amount ($)" className={field} aria-label="Amount" />
              {canRaise ? <button disabled={busy} onClick={() => run(raise, 'Budget raised — spread over the remaining months')} className={btnPrimary}>Raise by {amt ? usd0(Number(amt)) : '…'}</button>
                : <button disabled={busy || !(Number(amt) > 0)} onClick={() => run(() => notify(finance, `Budget transfer request: ${d.name}`, `${auth_name()} asks to move ${usd0(Number(amt))} into ${d.name}. ${note.trim()}`), 'Request sent to finance')} className={btnPrimary}>Send request to finance</button>}
              <p className="text-[10px] text-white/35">{canRaise ? 'Adds to the largest budget line for the rest of the year. Fine-tune it in Budgets.' : 'Finance can raise the budget or move money from another department.'}</p>
            </div>
            {canRaise && !d.isGeneral && (
              <button disabled={busy} onClick={() => run(async () => { const fs = org.financeSettings || {}; const next = { ...fs, deptAutoApprove: { ...(fs.deptAutoApprove || {}), [d.deptId]: 0 } }; await updateOrganization(org.id, { financeSettings: next }); setOrg({ ...org, financeSettings: next }); }, `Every ${d.name} request now needs a person to approve it`)} className={btnGhost}><AlertTriangle size={12} /> Stop auto-approving small requests</button>)}
          </div>)}
      </div>
    </div>
  );
};

const auth_name = (): string => auth.currentUser?.displayName || 'A teammate';

// ── Forecast mini-chart: cumulative actual vs plan, projected to period end ────────────────────
const Forecast: React.FC<{ d: DeptPulse; win: { from: string; to: string; daysTotal: number; daysElapsed: number } }> = ({ d, win }) => {
  const W = 480, H = 130, pad = 6;
  const top = Math.max(1, d.budget, d.projected, d.hard);
  const X = (f: number) => pad + f * (W - pad * 2), Y = (v: number) => H - 16 - (v / top) * (H - 28);
  const tf = win.daysTotal ? win.daysElapsed / win.daysTotal : 0;
  const days = (iso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+win.from.slice(0, 4), +win.from.slice(5, 7) - 1, +win.from.slice(8, 10))) / 86400000);
  const posted = [...d.txns].filter(t => t.state === 'POSTED').sort((a, b) => a.date.localeCompare(b.date));
  let run = 0; const pts: [number, number][] = [[0, 0]];
  posted.forEach(t => { run += t.amount; pts.push([Math.min(1, Math.max(0, days(t.date) / Math.max(1, win.daysTotal))), run]); });
  pts.push([tf, d.hard]);
  const m = STATUS_META[d.status];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Forecast: ${usd0(d.hard)} so far, projected ${usd0(d.projected)} by period end against a ${usd0(d.budget)} budget`}>
        {d.budget > 0 && <><line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(d.budget)} stroke="#64748b" strokeWidth="1.2" strokeDasharray="4 3" /><line x1={X(0)} x2={X(1)} y1={Y(d.budget)} y2={Y(d.budget)} stroke="#94a3b8" strokeWidth="0.8" opacity="0.6" /><text x={W - pad} y={Y(d.budget) - 3} textAnchor="end" fontSize="9" fill="#94a3b8">budget {usd0(d.budget)}</text></>}
        <polyline points={pts.map(([f, v]) => `${X(f)},${Y(v)}`).join(' ')} fill="none" stroke={m.hex} strokeWidth="2" strokeLinejoin="round" />
        <line x1={X(tf)} x2={X(tf)} y1={8} y2={H - 16} stroke="#fff" strokeWidth="1" opacity="0.7" /><text x={X(tf)} y={H - 4} textAnchor="middle" fontSize="9" fill="#e2e8f0">today</text>
        <line x1={X(tf)} y1={Y(d.hard)} x2={X(1)} y2={Y(d.projected)} stroke={m.hex} strokeWidth="2" strokeDasharray="5 4" />
        <circle cx={X(1)} cy={Y(d.projected)} r="3.5" fill={m.hex} /><text x={X(1) - 6} y={Y(d.projected) - 6} textAnchor="end" fontSize="10" fontWeight="700" fill={m.hex}>{usd0(d.projected)}</text>
      </svg>
      <p className="text-[9px] text-white/30">Solid = actual · dashed grey = even pace to budget · dashed colour = projection at period end</p>
    </div>
  );
};

// ── Print / PDF "Board snapshot" (light theme so it prints cleanly) ───────────────────────────
function snapshotHtml(org: Organization, r: NonNullable<LivePulse['report']>, alerts: PulseAlert[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col: Record<PulseStatus, string> = { GREEN: '#15803d', YELLOW: '#a16207', ORANGE: '#c2410c', RED: '#b91c1c', NONE: '#475569' };
  const rows = r.depts.map(d => `<tr><td>${esc(d.name)}</td><td style="color:${col[d.status]};font-weight:700">${STATUS_META[d.status].icon} ${STATUS_META[d.status].label}</td><td class="n">${usd0(d.budget)}</td><td class="n">${usd0(d.hard)}</td><td class="n">${d.usedPct ?? '—'}${d.usedPct === null ? '' : '%'}</td><td class="n">${usd0(d.projected)}</td><td class="n" style="color:${d.overrun > 0 ? col.RED : '#334155'}">${d.overrun > 0 ? '+' + usd0(d.overrun) : '—'}</td></tr>`).join('');
  const al = alerts.slice(0, 6).map(a => `<li><b>${esc(a.title)}</b> — ${esc(a.message)}</li>`).join('') || '<li>No open alerts.</li>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Board snapshot</title><style>body{font:13px system-ui,sans-serif;color:#0f172a;margin:32px}h1{margin:0;font-size:20px}h2{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#475569;margin:22px 0 6px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{font-size:10px;text-transform:uppercase;color:#64748b}.n{text-align:right;font-variant-numeric:tabular-nums}.k{display:flex;gap:24px;margin-top:10px}.k div{border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px}.k b{display:block;font-size:18px}</style></head><body>
<h1>${esc(org.legalName || org.name)} — Budget snapshot</h1><p style="color:#64748b;margin:2px 0">${esc(r.window.label)} · as of ${r.asOf}</p>
<div class="k"><div>Cash runway<b>${r.org.runwayMonths === null ? '—' : r.org.runwayMonths + ' months'}</b></div><div>Cash<b>${r.org.cash === null ? '—' : usd0(r.org.cash)}</b></div><div>Departments<b>${r.counts.GREEN} on track · ${r.counts.YELLOW} watch · ${r.counts.ORANGE} at risk · ${r.counts.RED} over</b></div></div>
<h2>Departments</h2><table><thead><tr><th>Department</th><th>Status</th><th class="n">Budget</th><th class="n">Spent + approved</th><th class="n">% used</th><th class="n">Projected</th><th class="n">Over by</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Needs attention</h2><ul>${al}</ul>
<p style="color:#94a3b8;font-size:10px;margin-top:24px">Status uses colour, an icon and a label. Projected = where spending lands at period end at today's pace.</p></body></html>`;
}
