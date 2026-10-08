// Overview / Insights — deterministic KPIs + insight cards; ARIA only narrates and answers questions.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, HeartHandshake, Send, Sparkles, UserPlus, UserMinus, Wallet } from 'lucide-react';
import { askLedger, narrateDigest, settingsOf, syncCareFlags, type QueryAnswer } from '../../../../services/chmsFinance';
import {
  detectAnomalies, firstTimeGivers, fundHealthInsights, fundSummaries, lapsedGivers, live, money, pledgeProgress, sum, todayStr, yearEndChecklist, addDays, aggregateGivers, inRange, curQuarter, type Insight,
} from '../../../../services/chmsFinanceReports';
import { card, field, btnPrimary, btnGhost, heading, label, Stat, Pill, DataTable, useAction, Busy, type TabProps } from './shared';

export function computeInsights(p: Pick<TabProps, 'org' | 'snap' | 'canManage'>): Insight[] {
  const { org, snap, canManage } = p; const st = settingsOf(org); const out: Insight[] = [];
  const rows = snap.ledger; const idx = snap.idx;
  if (canManage) {
    for (const g of lapsedGivers(rows, idx, st.lapsedDays).slice(0, 12)) out.push({ id: `lap_${g.key}`, kind: 'LAPSED', severity: 'watch', title: `${g.name} may have lapsed`, detail: `${g.count} gifts in the past year (${money(g.total)}); last gift ${g.last}.`, personId: g.personId });
    for (const g of firstTimeGivers(rows, idx, 30).slice(0, 12)) out.push({ id: `ft_${g.key}`, kind: 'FIRST_TIME', severity: 'info', title: `${g.name} gave for the first time`, detail: `First gift ${g.first}. A thank-you note goes a long way.`, personId: g.personId });
    out.push(...detectAnomalies(rows, idx, st));
  }
  const funds = fundSummaries(org.givingFunds || [], rows, snap.transfers, curQuarter());
  out.push(...fundHealthInsights(funds));
  const pend = pendingApprovalCount(snap);
  if (pend) out.push({ id: 'appr', kind: 'APPROVAL', severity: 'action', title: `${pend} item(s) waiting for a second approver`, detail: 'Open the Batches tab › Approvals. The person who requested it cannot approve it.' });
  const pr = snap.pledges.filter(x => x.status === 'ACTIVE').map(x => pledgeProgress(x, rows, idx)).filter(x => x.isBehind);
  if (canManage && pr.length) out.push({ id: 'pbehind', kind: 'PLEDGE_BEHIND', severity: 'watch', title: `${pr.length} pledge(s) behind pace`, detail: pr.slice(0, 3).map(x => `${x.name} (${money(x.behind)} behind)`).join(', ') + (pr.length > 3 ? '…' : '') });
  return out;
}
export const pendingApprovalCount = (snap: TabProps['snap']): number =>
  snap.batches.filter(b => !!b.overrideRequest).length + new Set(snap.ledger.filter(r => r.voidRequest && r.status !== 'VOID').map(r => r.splitGroupId || r.id)).size;

const sevTone = { info: 'info', watch: 'warn', action: 'bad' } as const;
const kindIcon = (k: Insight['kind']) => k === 'LAPSED' ? <UserMinus size={14} /> : k === 'FIRST_TIME' ? <UserPlus size={14} /> : k === 'FUND_HEALTH' ? <Wallet size={14} /> : <AlertTriangle size={14} />;

const OverviewTab: React.FC<TabProps> = (props) => {
  const { org, snap, canManage, reload } = props;
  const st = settingsOf(org);
  const today = todayStr(); const year = new Date().getFullYear();
  const live_ = useMemo(() => live(snap.ledger), [snap.ledger]);
  const ytd = sum(live_.filter(r => r.date.startsWith(String(year))));
  const prevYtd = sum(live_.filter(r => inRange(r.date, { from: `${year - 1}-01-01`, to: `${year - 1}-${today.slice(5)}` })));
  const last30 = live_.filter(r => r.date >= addDays(today, -30));
  const givers30 = aggregateGivers(last30.filter(r => r.personId), snap.idx).length;
  const insights = useMemo(() => computeInsights(props), [props.org, props.snap, props.canManage]); // eslint-disable-line react-hooks/exhaustive-deps
  const pledgeP = useMemo(() => snap.pledges.map(p => pledgeProgress(p, snap.ledger, snap.idx)), [snap]);
  const checklist = useMemo(() => yearEndChecklist({ org, batches: snap.batches, rows: snap.ledger, people: snap.people, pendingApprovals: pendingApprovalCount(snap), statementsSent: snap.statementLogs.filter(l => l.from.startsWith(String(year))).reduce((a, l) => a + l.count, 0), year, pledges: pledgeP }), [org, snap, pledgeP, year]);

  const [q, setQ] = useState('');
  const [ans, setAns] = useState<QueryAnswer | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const ask = useAction(); const dg = useAction(); const care = useAction();
  const [careMsg, setCareMsg] = useState('');

  const onAsk = () => q.trim() && ask.run(async () => { setAns(await askLedger(q, snap.ledger, snap.idx, (org.givingFunds || []).map(f => f.name), canManage)); });
  const onDigest = () => dg.run(async () => setDigest(await narrateDigest(insights.slice(0, 10).map(i => `${i.title} — ${i.kind === 'LAPSED' || i.kind === 'FIRST_TIME' ? 'giver flag' : i.detail.replace(/\$[\d,\.]+/g, 'an amount')}`))));
  const onCare = () => care.run(async () => { const n = await syncCareFlags(org, snap.ledger, snap.idx, snap.careFlags, st.lapsedDays); setCareMsg(n ? `${n} reach-out prompt(s) sent to pastoral care (no amounts shared).` : 'No new prompts — pastoral care is up to date.'); await reload(); });

  const examples = ['Who gave more last year but nothing this quarter?', 'Top givers this year', 'First-time givers this month', 'Total giving last quarter'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`${year} year to date`} value={money(ytd)} sub={prevYtd ? `${ytd >= prevYtd ? '▲' : '▼'} ${money(Math.abs(ytd - prevYtd))} vs same day last year` : undefined} />
        <Stat label="Last 30 days" value={money(sum(last30))} sub={`${last30.length} gifts`} />
        <Stat label="Avg gift (30d)" value={last30.length ? money(sum(last30) / last30.length) : '—'} sub={canManage ? `${givers30} identified givers` : undefined} />
        <Stat label="Online merged" value={String(snap.onlineMerged)} sub={snap.onlineDuplicates ? `${snap.onlineDuplicates} deduped` : 'native Stripe gifts in ledger'} />
      </div>

      {canManage && (
        <div className={`${card} p-5`}>
          <h3 className={heading}><Sparkles size={12} className="inline mr-1.5" />Ask Aria about your giving</h3>
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAsk()} placeholder="e.g. Who gave more last year but nothing this quarter?" className={field} />
            <button onClick={onAsk} disabled={ask.busy || !q.trim()} className={btnPrimary}><Busy on={ask.busy}><Send size={12} /> Ask</Busy></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">{examples.map(x => <button key={x} onClick={() => setQ(x)} className="px-2.5 py-1 rounded-full text-[10px] bg-white/5 border border-white/10 text-white/50 hover:text-white">{x}</button>)}</div>
          {ans && (
            <div className="mt-4">
              <p className="text-xs text-white/80">{ans.narrated || ans.summary}</p>
              <p className="text-[9px] text-white/30 mt-1">Numbers computed from your ledger ({ans.spec.source === 'ARIA' ? 'question parsed by Aria' : 'question parsed offline'}). Giver names never leave your browser.</p>
              {ans.rows.length > 0 && <div className="mt-3"><DataTable org={org} table={{ title: ans.summary, headers: ans.headers, rows: ans.rows }} /></div>}
            </div>
          )}
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className={`${heading} !mb-0`}>Insights</h3>
          <div className="flex gap-2">
            <button onClick={onDigest} disabled={dg.busy || !insights.length} className={btnGhost}><Busy on={dg.busy}><Sparkles size={12} /> Aria digest</Busy></button>
            {canManage && <button onClick={onCare} disabled={care.busy} className={btnGhost} title="Creates reach-out prompts for pastors. No dollar amounts are shared."><Busy on={care.busy}><HeartHandshake size={12} /> Send care prompts to pastors</Busy></button>}
          </div>
        </div>
        {digest && <p className="text-xs text-white/70 bg-white/[0.04] rounded-2xl p-3 mb-3">{digest}</p>}
        {careMsg && <p className="text-[11px] text-green-400 mb-3">{careMsg}</p>}
        {insights.length === 0 ? <p className="text-xs text-white/40 py-4 text-center">All clear. Nothing needs attention right now.</p> : (
          <div className="grid md:grid-cols-2 gap-2">
            {insights.map(i => (
              <div key={i.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div className="flex items-center gap-2 mb-1"><span className="text-white/50">{kindIcon(i.kind)}</span><span className="text-xs font-bold text-white flex-1">{i.title}</span><Pill tone={sevTone[i.severity]}>{i.kind.replace('_', ' ')}</Pill></div>
                <p className="text-[11px] text-white/50">{i.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>{year} year-end — ready to send?</h3>
        <ul className="space-y-1.5">
          {checklist.map(c => (
            <li key={c.key} className="flex items-start gap-2 text-xs">
              {c.ok ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" /> : <Circle size={14} className="text-amber-300 mt-0.5 shrink-0" />}
              <span className={c.ok ? 'text-white/70' : 'text-white'}>{c.label}{c.detail && <span className={`${label} ml-2 normal-case tracking-normal`}>{c.detail}</span>}</span>
            </li>
          ))}
        </ul>
      </div>
      {snap.errors.length > 0 && <p className="text-[10px] text-amber-300/70">Some data could not be loaded ({snap.errors.join('; ')}). Check your finance permissions.</p>}
    </div>
  );
};

export default OverviewTab;
