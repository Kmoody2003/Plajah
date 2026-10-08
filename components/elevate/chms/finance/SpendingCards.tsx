// SpendingCards — the expense card + one-tap approve/reject bar, shared by Money Inbox and the Spending hub.
import React, { useState } from 'react';
import { Check, Paperclip, X } from 'lucide-react';
import type { Organization, OrgMembership, AcctExpense } from '../../../../types';
import { SPEND_KIND_LABEL, approveExpense, canApproveExpense, categoryName, kindOf, readiness, rejectExpense, statusLine, usd, type Readiness } from '../../../../services/acctSpending';
import { auth } from '../../../../services/firebase';
import { btnGhost, btnPrimary, fieldSm, Pill } from './shared';
import { useDeferred } from './SpendingUi';

export const READY_TONE: Record<Readiness, 'ok' | 'warn' | 'bad' | 'info'> = { DRAFT: 'info', PENDING: 'warn', NEEDS_SECOND: 'warn', READY: 'ok', READY_AUTO: 'ok', REQUEST_APPROVED: 'ok', PAID: 'ok', REJECTED: 'bad', VOID: 'info' };
export const READY_LABEL: Record<Readiness, string> = { DRAFT: 'Draft', PENDING: 'Waiting', NEEDS_SECOND: '2nd approval', READY: 'Approved', READY_AUTO: 'Auto-approved', REQUEST_APPROVED: 'Approved', PAID: 'Paid', REJECTED: 'Declined', VOID: 'Withdrawn' };

export const QUICK_REASONS = ['Need the receipt', 'Over budget', 'Not this month', 'Please recode the category'];

export const ExpenseCard: React.FC<{ org: Organization; e: AcctExpense; all: AcctExpense[]; accountsName?: (id: string) => string; children?: React.ReactNode; right?: React.ReactNode; dense?: boolean }> = ({ org, e, all, children, right, dense }) => {
  const r = readiness(org, e, all);
  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/10 ${dense ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-black text-white tabular-nums">{usd(e.amount)}</p>
            <Pill tone={READY_TONE[r]}>{READY_LABEL[r]}</Pill>
            <Pill>{SPEND_KIND_LABEL[kindOf(e)].label}</Pill>
          </div>
          <p className="text-xs text-white/80 mt-1 break-words">{e.vendorName ? <b className="text-white">{e.vendorName} · </b> : null}{e.description}</p>
          <p className="text-[10px] text-white/40 mt-0.5">{e.submittedByName || 'Someone'} · {e.deptName || 'General'} · {categoryName(org.id, e.accountId)} · {e.date}{e.dueDate ? ` · due ${e.dueDate}` : ''}</p>
          <p className="text-[10px] text-white/50 mt-0.5">{statusLine(org, e, all)}</p>
          {!!e.receiptUrls?.length && <div className="flex gap-1.5 mt-2 flex-wrap">{e.receiptUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-small-orange"><Paperclip size={10} />Receipt{e.receiptUrls!.length > 1 ? ` ${i + 1}` : ''}</a>)}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
};

/** One-tap approve + reject-with-reason. Optimistic, with a 5-second Undo before anything is written. */
export const ApproveBar: React.FC<{ org: Organization; member: OrgMembership | null; e: AcctExpense; patch: (id: string, p: Partial<AcctExpense>) => void; label?: string }> = ({ org, member, e, patch, label = 'Approve' }) => {
  const defer = useDeferred(); const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState('');
  const g = canApproveExpense(org, member, e);
  const me = auth.currentUser;
  if (!g.ok) return g.reason ? <p className="text-[10px] text-white/40 mt-3">{g.reason}</p> : null;

  const approve = () => {
    const prev = { status: e.status, approvals: e.approvals, approvedBy: e.approvedBy };
    patch(e.id, { status: 'APPROVED', approvals: [...(e.approvals || []), { uid: me?.uid || '', name: me?.displayName || '', at: Date.now() }] });
    defer(`Approved ${usd(e.amount)}`, () => approveExpense(org, member, e), () => patch(e.id, prev));
  };
  const reject = () => {
    if (!reason.trim()) return;
    const prev = { status: e.status, rejectedReason: e.rejectedReason };
    patch(e.id, { status: 'REJECTED', rejectedReason: reason.trim() });
    defer(`Declined ${usd(e.amount)}`, () => rejectExpense(org, member, e, reason), () => patch(e.id, prev));
    setRejecting(false); setReason('');
  };
  return (
    <div className="mt-3">
      {!rejecting ? (
        <div className="flex gap-2">
          <button onClick={approve} className={`${btnPrimary} flex-1 sm:flex-none sm:min-w-[9rem] py-3`}><Check size={13} /> {label}</button>
          <button onClick={() => setRejecting(true)} className={`${btnGhost} flex-1 sm:flex-none py-3`}><X size={13} /> Decline</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">{QUICK_REASONS.map(q => <button key={q} onClick={() => setReason(q)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${reason === q ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60'}`}>{q}</button>)}</div>
          <div className="flex gap-2"><input autoFocus value={reason} onChange={e2 => setReason(e2.target.value)} onKeyDown={e2 => { if (e2.key === 'Enter') reject(); }} placeholder="Why? (they’ll see this)" className={`${fieldSm} flex-1`} /><button onClick={reject} disabled={!reason.trim()} className={btnPrimary}>Decline</button><button onClick={() => setRejecting(false)} className={btnGhost}>Back</button></div>
        </div>
      )}
    </div>
  );
};
