// SpendingDesk — the "Money" entry for everyone who touches spending (department heads, staff, volunteers with
// SUBMIT_EXPENSES, approvers) who may have NO giving access: Inbox + Spending, nothing else. Mobile-first.
import React, { Suspense, lazy, useState } from 'react';
import { Activity, Inbox as InboxIcon, Loader2, Receipt } from 'lucide-react';
import { auth } from '../../../../services/firebase';
import { pulseAccess } from '../../../../services/acctPulseLive';
import type { Organization, OrgMembership } from '../../../../types';
import type { HubTab, SpendSub } from '../../../../services/acctSpending';
import { CountBadge, ShortcutSheet, ToastProvider, useHotkeys, useMoneyInbox } from './SpendingUi';

const MoneyInbox = lazy(() => import('./MoneyInbox'));
const SpendingHub = lazy(() => import('./SpendingHub'));
const BudgetPulse = lazy(() => import('./BudgetPulse'));
const Fallback = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" size={22} /></div>;

const SpendingDesk: React.FC<{ org: Organization; member: OrgMembership | null; onOpenFinanceHub?: () => void }> = ({ org, member, onOpenFinanceHub }) => {
  const inbox = useMoneyInbox(org, member, null);
  const [tab, setTab] = useState<'inbox' | 'spending' | 'budget'>(inbox.perms.canApprove ? 'inbox' : 'spending');
  // Department heads (no giving access) still see THEIR department's live budget pulse — the hook narrows the data.
  const showBudget = (() => { const a = pulseAccess(org, auth.currentUser?.uid || ''); return a.isDeptHead || a.headOf.length > 0; })();
  const [sub, setSub] = useState<SpendSub | undefined>(undefined);
  const [keys, setKeys] = useState(false);
  const go = (t: HubTab, s?: SpendSub) => {
    if (t === 'spending' || t === 'inbox') { setSub(s); setTab(t); }
    else onOpenFinanceHub?.();       // giving/books chores live in the Finance Hub (finance roles only)
  };
  useHotkeys({ 'g i': () => go('inbox'), 'g s': () => go('spending'), n: () => go('spending', 'submit'), '?': () => setKeys(v => !v) });
  return (
    <ToastProvider>
      <ShortcutSheet open={keys} onClose={() => setKeys(false)} />
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {([['inbox', 'Inbox', InboxIcon, inbox.count], ['spending', 'Spending', Receipt, 0], ...(showBudget ? [['budget', 'Budget', Activity, 0] as const] : [])] as const).map(([k, l, Icon, n]) => (
            <button key={k} onClick={() => { setTab(k); setSub(undefined); }} className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${tab === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}><Icon size={12} />{l}<CountBadge n={n} /></button>
          ))}
        </div>
        <Suspense fallback={<Fallback />}>
          {tab === 'inbox' && <MoneyInbox org={org} member={member} onNavigate={go} />}
          {tab === 'spending' && <SpendingHub org={org} member={member} initialSub={sub} onNavigate={go} />}
          {tab === 'budget' && <BudgetPulse org={org} myMembership={member} onNavigate={go} />}
        </Suspense>
      </div>
    </ToastProvider>
  );
};

export default SpendingDesk;
