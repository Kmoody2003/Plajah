// Reconciliation — AUTOMATIC. Stripe payouts, their line items and the gifts they carry are pulled through the
// church's connected account (server.ts /api/elevate/stripe/*) and webhooks; nobody types a Stripe figure.
// A small manual-adjustment escape hatch stays at the bottom for money that never touched Stripe.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, RefreshCw, Loader2, Zap } from 'lucide-react';
import { savePayout } from '../../../../services/chmsFinance';
import { money, onlineLedgerFlags, reconcilePayouts, reconcileStripePayouts, sum, todayStr, addDays } from '../../../../services/chmsFinanceReports';
import { autoSyncStripe, describeRequirement, fetchStripeStatus, getStripeLink, syncStripeNow, type StripeStatus, type StripeSyncSummary } from '../../../../services/stripeSync';
import { card, fieldSm, btnPrimary, btnGhost, heading, label, Pill, Stat, Empty, DataTable, useAction, Busy, type TabProps } from './shared';

const ago = (t: number | null | undefined) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const statusTone = (s: string): 'ok' | 'warn' | 'bad' | 'info' => s === 'paid' ? 'ok' : s === 'failed' ? 'bad' : s === 'canceled' ? 'warn' : 'info';
const lineLabel = (t: string) => ({ payment: 'Gift', charge: 'Gift', payment_refund: 'Refund', refund: 'Refund', stripe_fee: 'Stripe fee', adjustment: 'Adjustment' } as Record<string, string>)[t] || t.replace(/_/g, ' ');

const ReconcileTab: React.FC<TabProps> = ({ org, snap, reload, canManage, onOpenPerson }) => {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<StripeSyncSummary | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [p, setP] = useState({ payoutDate: todayStr(), periodStart: addDays(todayStr(), -7), periodEnd: todayStr(), gross: '', fees: '', net: '', ref: '' });
  const act = useAction();

  const loadStatus = useCallback(async () => {
    try { setStatus(await fetchStripeStatus(org.id)); setStatusErr(''); }
    catch (e: any) { setStatusErr(e?.message || 'Could not reach Stripe'); }
  }, [org.id]);

  const sync = useCallback(async (manual: boolean) => {
    setSyncing(true);
    try {
      const s = manual ? await syncStripeNow(org.id) : await autoSyncStripe(org.id);
      if (s) { setSummary(s); await reload(); }
    } catch (e: any) { if (manual) setStatusErr(e?.message || 'Sync failed'); }
    finally { setSyncing(false); await loadStatus(); }
  }, [org.id, reload, loadStatus]);

  // Auto-sync on open (throttled to once per 10 min per org in stripeSync) — finance roles only.
  useEffect(() => { loadStatus(); if (canManage && org.stripeAccountId) sync(false); }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fix = (kind: 'fix' | 'dashboard') => act.run(async () => { const url = await getStripeLink(org.id, kind); window.open(url, '_blank', 'noopener'); });

  const online = useMemo(() => snap.ledger.filter(r => r.origin === 'ONLINE' || (r.method === 'ONLINE' && !!r.stripePaymentId)).filter(r => r.status !== 'VOID'), [snap.ledger]);
  const giftById = useMemo(() => new Map(snap.ledger.map(r => [r.id, r])), [snap.ledger]);
  const checks = useMemo(() => reconcileStripePayouts(snap.stripePayouts || [], snap.payoutLines || []), [snap.stripePayouts, snap.payoutLines]);
  const flags = useMemo(() => onlineLedgerFlags(snap.ledger), [snap.ledger]);
  const legacy = useMemo(() => reconcilePayouts(snap.payouts, snap.ledger).sort((a, b) => b.payout.payoutDate.localeCompare(a.payout.payoutDate)), [snap.payouts, snap.ledger]);
  const problems = checks.filter(c => c.payout.status === 'paid' && !c.reconciled);
  const waiting = online.filter(r => !r.payoutId && r.stripePaymentId && r.origin === 'LEDGER');
  const platformFees = Math.round(online.reduce((a, r) => a + (r.feePaidBy === 'platform' ? (r.stripeFee || 0) : 0), 0) * 100) / 100;
  const orgFees = Math.round(online.reduce((a, r) => a + (r.feePaidBy === 'org' ? (r.stripeFee || 0) : 0), 0) * 100) / 100;
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const connected = !!org.stripeAccountId && status?.connected !== false;

  const save = () => act.run(async () => {
    const gross = Number(p.gross), fees = Number(p.fees || 0), net = p.net ? Number(p.net) : gross - fees;
    if (!(gross > 0)) { alert('Enter the adjustment amount.'); return; }
    await savePayout(org, { payoutDate: p.payoutDate, periodStart: p.periodStart, periodEnd: p.periodEnd, gross, fees, net, ref: p.ref.trim() || undefined });
    setP(v => ({ ...v, gross: '', fees: '', net: '', ref: '' })); await reload();
  });

  return (
    <div className="space-y-6">
      {/* Live Stripe status */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <Zap size={16} className="text-small-orange" />
          <div className="flex-1 min-w-[200px]">
            <h3 className="text-sm font-black text-white">Stripe — live</h3>
            <p className="text-[10px] text-white/40">
              {!org.stripeAccountId ? 'Not connected yet. Connect Stripe in Giving settings and gifts, fees and payouts will appear here by themselves.'
                : syncing ? 'Syncing with Stripe…' : `Last synced ${ago(status?.lastSyncAt)}${summary ? ` · ${summary.giftsAdded} gift(s) recovered, ${summary.payouts} payout(s) checked` : ''}`}
            </p>
          </div>
          {canManage && org.stripeAccountId && (
            <>
              <button onClick={() => sync(true)} disabled={syncing} className={btnPrimary}>{syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now</button>
              <button onClick={() => fix('dashboard')} disabled={act.busy} className={btnGhost}><ExternalLink size={12} /> Stripe dashboard</button>
            </>
          )}
        </div>
        {statusErr && <p className="text-[11px] text-amber-300 mt-3">{statusErr}</p>}
        {status?.connected && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Stat label="Payouts" value={status.payoutsEnabled ? 'Enabled' : 'Paused'} tone={status.payoutsEnabled ? 'ok' : 'bad'} sub={status.chargesEnabled ? 'Accepting gifts' : 'Cannot accept gifts yet'} />
            <Stat label="Available" value={status.availableBalance == null ? '—' : money(status.availableBalance)} sub="ready to pay out" />
            <Stat label="Pending" value={status.pendingBalance == null ? '—' : money(status.pendingBalance)} sub="still clearing" />
            <Stat label="Next payout" value={status.nextPayoutEstimate?.date ? `${status.nextPayoutEstimate.date}` : '—'} sub={status.nextPayoutEstimate?.amount != null ? money(status.nextPayoutEstimate.amount) : (status.nextPayoutEstimate?.schedule || 'No payout scheduled')} />
          </div>
        )}
        {status && status.missingRequirements.length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4">
            <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} />Stripe needs a little more information{status.payoutsEnabled ? '' : ' before it can pay out'}</p>
            <ul className="text-[11px] text-white/70 mt-2 list-disc ml-5 space-y-0.5">{status.missingRequirements.slice(0, 6).map(r => <li key={r}>{describeRequirement(r)}</li>)}</ul>
            {canManage && <button onClick={() => fix('fix')} disabled={act.busy} className={`${btnPrimary} mt-3`}><ExternalLink size={12} /> Fix in Stripe</button>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Online gifts" value={String(online.length)} sub={`${money(sum(online))} · flows in automatically`} />
        <Stat label="Payouts" value={String(checks.length)} sub={`${checks.filter(c => c.reconciled).length} reconciled`} />
        <Stat label="Needs a look" value={String(problems.length)} tone={problems.length ? 'bad' : 'ok'} sub={`${waiting.length} gift(s) awaiting payout`} />
        <Stat label="Stripe fees" value={money(platformFees + orgFees)} sub={orgFees > 0 ? `${money(orgFees)} paid by the church` : 'covered by the platform'} />
      </div>

      {problems.length > 0 && (
        <div className={`${card} p-5 border-red-500/30`}>
          <h3 className={heading}><AlertTriangle size={12} className="inline mr-1.5" />{problems.length} payout{problems.length === 1 ? '' : 's'} don’t add up</h3>
          <div className="space-y-1">{problems.slice(0, 5).map(c => <button key={c.payout.id} onClick={() => toggle(c.payout.id)} className="w-full text-left text-xs px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.07]"><span className="text-white font-bold">{c.payout.arrivalDate} · {money(c.payout.amount)}</span><span className="text-amber-300"> — {c.flags[0]}</span></button>)}</div>
          <p className="text-[10px] text-white/40 mt-2">Press Sync now to re-check. Differences that remain are real movements in Stripe (adjustments, disputes) — open the payout to see the lines.</p>
        </div>
      )}

      {/* Payouts */}
      <div className={`${card} p-5`}>
        <h3 className={heading}>Payouts from Stripe</h3>
        {checks.length === 0 ? <Empty>{connected ? (syncing ? 'Pulling payouts from Stripe…' : 'No payouts yet — they appear here automatically as Stripe pays out.') : 'Connect Stripe to see payouts.'}</Empty> : (
          <div className="space-y-2">
            {checks.map(c => {
              const po = c.payout, isOpen = open.has(po.id);
              return (
                <div key={po.id} className="rounded-2xl bg-white/[0.04] border border-white/10">
                  <button onClick={() => toggle(po.id)} className="w-full flex flex-wrap items-center gap-3 text-xs p-3 text-left">
                    {isOpen ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
                    {c.reconciled ? <CheckCircle2 size={14} className="text-green-400" /> : <AlertTriangle size={14} className={po.status === 'paid' ? 'text-amber-300' : 'text-white/30'} />}
                    <span className="text-white font-bold">{po.arrivalDate}</span>
                    <Pill tone={statusTone(po.status)}>{po.status.replace('_', ' ')}</Pill>
                    <span className="text-white/40 flex-1">{po.bankLast4 ? `bank ••${po.bankLast4}` : po.method || ''}</span>
                    <span className="text-white/60 tabular-nums">gross {money(po.gross ?? 0)} · fees {money(po.fees ?? 0)} · refunds {money(po.refunds ?? 0)} · <span className="text-white font-bold">net {money(po.amount)}</span></span>
                    <Pill tone={c.unmatchedCount ? 'warn' : 'info'}>{c.matchedCount}/{c.giftLines.length} gifts matched</Pill>
                    <Pill tone={c.reconciled ? 'ok' : po.status === 'paid' ? 'warn' : 'info'}>{c.reconciled ? 'reconciled' : po.status === 'paid' ? 'review' : 'in progress'}</Pill>
                  </button>
                  {c.flags.map((f, i) => <p key={i} className="text-[11px] text-amber-300 px-4 pb-2 -mt-1">{f}</p>)}
                  {isOpen && (
                    <div className="px-3 pb-3">
                      {c.lines.length === 0 ? <p className="text-[11px] text-white/40 px-2 py-2">No line items synced for this payout yet.</p> : (
                        <table className="w-full text-xs">
                          <thead><tr>{['Date', 'Type', 'Giver / fund', 'Amount', 'Fee', 'Net'].map(h => <th key={h} className={`${label} text-left py-1.5 px-2`}>{h}</th>)}</tr></thead>
                          <tbody>
                            {c.lines.map(l => {
                              const g = l.contributionId ? giftById.get(l.contributionId) : undefined;
                              const who = g ? (canManage ? snap.idx.nameOf(g.personId, g.giverName) : 'Giver hidden') : '';
                              return (
                                <tr key={l.id} className="border-t border-white/5">
                                  <td className="py-1.5 px-2 text-white/50">{l.date}</td>
                                  <td className="py-1.5 px-2 text-white/70">{lineLabel(l.type)}</td>
                                  <td className="py-1.5 px-2 text-white/80">
                                    {g ? <>
                                      {canManage && g.personId && onOpenPerson ? <button onClick={() => onOpenPerson(g.personId!)} className="font-bold hover:underline text-left">{who}</button> : <span className="font-bold">{who}</span>}
                                      <span className="text-white/40"> · {g.fundName}{g.recurringKey || g.stripeSubscriptionId ? ' · monthly' : ''}</span>
                                    </> : (l.type === 'payment' || l.type === 'charge') ? <span className="text-amber-300">Not matched to a gift</span> : <span className="text-white/30">{l.description || ''}</span>}
                                  </td>
                                  <td className={`py-1.5 px-2 text-right tabular-nums ${l.amount < 0 ? 'text-red-400' : 'text-white/80'}`}>{money(l.amount)}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-white/50">{l.fee ? money(l.fee) : '—'}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-white/80">{money(l.net)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {waiting.length > 0 && <p className={`${label} normal-case tracking-normal mt-3`}>{waiting.length} online gift(s) ({money(sum(waiting))}) are waiting for their payout — nothing to do, they’ll match on arrival.</p>}
      </div>

      {flags.length > 0 && (
        <div className={`${card} p-5 border-amber-500/30`}>
          <h3 className={heading}><AlertTriangle size={12} className="inline mr-1.5" />Flagged online entries</h3>
          <div className="space-y-1">{flags.map((f, i) => <div key={i} className="flex gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.04]"><span className="text-white/40 w-20">{f.row.date}</span><span className="flex-1 text-white">{canManage ? snap.idx.nameOf(f.row.personId, f.row.giverName) : 'Giver hidden'} · {f.row.fundName} <span className="text-amber-300">— {f.flag}</span></span><span className="tabular-nums text-white">{money(f.row.amount)}</span></div>)}</div>
        </div>
      )}

      <DataTable org={org} table={{ title: 'Online (Stripe) gifts in ledger', headers: ['Date', 'Giver', 'Fund', 'Amount', 'Fee', 'Payment id', 'Payout'], rows: [...online].sort((a, b) => b.date.localeCompare(a.date)).map(r => [r.date, canManage ? snap.idx.nameOf(r.personId, r.giverName) : '—', r.fundName, r.amount, r.stripeFee ?? 0, r.stripePaymentId || '', r.payoutId ? 'matched' : 'pending']) }} maxRows={100} />

      {/* Escape hatch — secondary on purpose */}
      {canManage && (
        <details className={`${card} p-5`}>
          <summary className="text-[10px] font-black uppercase tracking-widest text-white/40 cursor-pointer">Add an adjustment manually (money that did not go through Stripe)</summary>
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <label className="text-[9px] text-white/40">Date<input type="date" value={p.payoutDate} onChange={e => setP(v => ({ ...v, payoutDate: e.target.value }))} className={`${fieldSm} block mt-1`} /></label>
              <label className="text-[9px] text-white/40">Covers from<input type="date" value={p.periodStart} onChange={e => setP(v => ({ ...v, periodStart: e.target.value }))} className={`${fieldSm} block mt-1`} /></label>
              <label className="text-[9px] text-white/40">to<input type="date" value={p.periodEnd} onChange={e => setP(v => ({ ...v, periodEnd: e.target.value }))} className={`${fieldSm} block mt-1`} /></label>
              <label className="text-[9px] text-white/40">Gross $<input value={p.gross} onChange={e => setP(v => ({ ...v, gross: e.target.value.replace(/[^0-9.]/g, '') }))} className={`${fieldSm} block mt-1 w-24`} /></label>
              <label className="text-[9px] text-white/40">Fees $<input value={p.fees} onChange={e => setP(v => ({ ...v, fees: e.target.value.replace(/[^0-9.]/g, '') }))} className={`${fieldSm} block mt-1 w-20`} /></label>
              <label className="text-[9px] text-white/40">Net $<input value={p.net} onChange={e => setP(v => ({ ...v, net: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="auto" className={`${fieldSm} block mt-1 w-24`} /></label>
              <label className="text-[9px] text-white/40">Reference<input value={p.ref} onChange={e => setP(v => ({ ...v, ref: e.target.value }))} className={`${fieldSm} block mt-1 w-32`} /></label>
              <button onClick={save} disabled={act.busy} className={`${btnGhost} self-end`}><Busy on={act.busy}>Record</Busy></button>
            </div>
          </div>
          {legacy.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className={label}>Manually recorded</p>
              {legacy.map(c => <div key={c.payout.id} className="flex flex-wrap gap-3 text-[11px] px-3 py-2 rounded-xl bg-white/[0.04]"><span className="text-white font-bold">{c.payout.payoutDate}</span><span className="text-white/40 flex-1">{c.payout.periodStart} → {c.payout.periodEnd}{c.payout.ref ? ` · ${c.payout.ref}` : ''}</span><span className="text-white/60">gross {money(c.payout.gross)} · fees {money(c.payout.fees)} · net {money(c.payout.net)}</span></div>)}
            </div>
          )}
        </details>
      )}
    </div>
  );
};

export default ReconcileTab;
