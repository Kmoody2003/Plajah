// MoneyInbox — ONE "what needs me" queue, by role. Every item has a one-click action and clears itself when done.
// Approvals can be decided right on the card (optimistic, 5s undo); chores deep-link to the exact tab.
import React, { useEffect, useRef } from 'react';
import { ArrowRight, BellRing, Check, PartyPopper, X } from 'lucide-react';
import type { Organization, OrgMembership } from '../../../../types';
import { draftRecurringBills, dueRecurring, type HubTab, type InboxItem, type SpendSub, type SpendingPerms } from '../../../../services/acctSpending';
import type { FinanceSnapshot } from '../../../../services/chmsFinance';
import { card, btnGhost, btnPrimary, Pill } from './shared';
import { ExpenseCard, ApproveBar } from './SpendingCards';
import { SkeletonRows, useMoneyInbox, useToast } from './SpendingUi';

export type Navigate = (tab: HubTab, sub?: SpendSub) => void;
const swept = new Set<string>();

/** Auto-drafts due recurring bills once per session for people who can post to the books. */
export function useRecurringSweep(org: Organization, perms: SpendingPerms | null) {
  const toast = useToast();
  useEffect(() => {
    if (!perms?.canManage || swept.has(org.id) || !dueRecurring(org).length) return;
    swept.add(org.id);
    draftRecurringBills(org).then(n => { if (n) toast(`Drafted ${n} recurring bill${n === 1 ? '' : 's'} — ready to pay.`); }).catch(() => swept.delete(org.id));
  }, [org, perms?.canManage]); // eslint-disable-line react-hooks/exhaustive-deps
}

const GROUPS: { title: string; kinds: InboxItem['kind'][] }[] = [
  { title: 'Needs your decision', kinds: ['APPROVE', 'COUNTERSIGN', 'VOIDS', 'MINE_REJECTED'] },
  { title: 'Money out', kinds: ['OVERDUE', 'PAY', 'RECURRING', 'W9'] },
  { title: 'Books & giving', kinds: ['PAYOUTS', 'BANK', 'BATCH', 'GIFTS', 'STATEMENTS', 'CARE'] },
  { title: 'Your requests', kinds: ['MINE_APPROVED', 'MINE_OPEN'] },
];

const MoneyInbox: React.FC<{ org: Organization; member: OrgMembership | null; snap?: FinanceSnapshot | null; onNavigate: Navigate; compact?: boolean; limit?: number }> = ({ org, member, snap, onNavigate, compact, limit }) => {
  const { items, count, loading, bundle, perms, patch, dismiss } = useMoneyInbox(org, member, snap);
  useRecurringSweep(org, perms);
  const submitted = bundle?.expenses ?? [];

  if (loading && !bundle) return <SkeletonRows rows={compact ? 2 : 3} />;

  const work = items.filter(i => i.kind !== 'MINE_OPEN');
  const zero = count === 0;

  const row = (i: InboxItem) => {
    const decide = (i.kind === 'APPROVE' || i.kind === 'COUNTERSIGN') && i.expense;
    if (decide) return (
      <ExpenseCard key={i.id} org={org} e={i.expense!} all={submitted} dense={compact}>
        <ApproveBar org={org} member={member} e={i.expense!} patch={patch} label={i.kind === 'COUNTERSIGN' ? 'Countersign' : 'Approve'} />
      </ExpenseCard>
    );
    const tone = i.tone === 'action' ? 'border-small-orange/40 bg-small-orange/[0.06]' : 'border-white/10 bg-white/[0.03]';
    const dismissible = i.kind === 'MINE_REJECTED' || i.kind === 'MINE_APPROVED';
    return (
      <div key={i.id} className={`flex items-center gap-3 rounded-2xl border p-3.5 ${tone}`}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white break-words">{i.title}</p>
          {i.detail && <p className="text-[10px] text-white/50 mt-0.5 break-words line-clamp-2">{i.detail}</p>}
        </div>
        {dismissible && <button onClick={() => dismiss(i.id)} aria-label="Dismiss" title="Got it" className="p-2 rounded-full text-white/30 hover:text-white"><X size={13} /></button>}
        {i.tab && <button onClick={() => { if (i.kind === 'MINE_REJECTED' || i.kind === 'MINE_APPROVED') dismiss(i.id); onNavigate(i.tab!, i.sub); }} className={i.tone === 'action' ? btnPrimary : btnGhost}>{i.cta}<ArrowRight size={12} /></button>}
      </div>
    );
  };

  if (zero && !items.length) return <InboxZero compact={compact} />;

  const shown = limit ? work.slice(0, limit) : work;
  return (
    <div className="space-y-5">
      {zero && <InboxZero compact />}
      {compact ? (
        <div className="space-y-2.5">{shown.map(row)}{work.length > shown.length && <button onClick={() => onNavigate('inbox')} className="text-[10px] font-black uppercase tracking-widest text-small-orange">+ {work.length - shown.length} more in your inbox →</button>}
          {items.filter(i => i.kind === 'MINE_OPEN').map(row)}</div>
      ) : GROUPS.map(g => {
        const list = items.filter(i => g.kinds.includes(i.kind)); if (!list.length) return null;
        return <section key={g.title}><div className="flex items-center gap-2 mb-2.5"><h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange">{g.title}</h3><Pill tone="info">{list.length}</Pill></div><div className="space-y-2.5">{list.map(row)}</div></section>;
      })}
    </div>
  );
};

const InboxZero: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const t = useRef(['You’re all caught up.', 'Inbox zero — go enjoy your day.', 'Nothing needs you right now.'][new Date().getDate() % 3]);
  return (
    <div className={`${card} text-center ${compact ? 'p-5' : 'p-10'} bg-gradient-to-b from-emerald-500/[0.06] to-transparent`}>
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-300 mb-3">{compact ? <Check size={20} /> : <PartyPopper size={22} />}</div>
      <p className="text-sm font-black text-white">{t.current}</p>
      <p className="text-[10px] text-white/40 mt-1 flex items-center justify-center gap-1.5"><BellRing size={11} />We’ll nudge you the moment something needs a decision.</p>
    </div>
  );
};

export default MoneyInbox;
