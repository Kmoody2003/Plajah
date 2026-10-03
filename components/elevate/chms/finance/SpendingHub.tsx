// SpendingHub — money going OUT. My requests · Submit · Approvals · Ready to pay · Check register · Recurring bills.
// Works for a volunteer on a phone (Submit + My requests only) and for finance (queue, batch pay, register).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FilePlus2, Layers, Loader2, Repeat, Search, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import type { Organization, OrgMembership, AcctExpense, RecurringBill } from '../../../../types';
import {
  PAY_METHODS, batchPay, bookBill, categoryName, dueRecurring, draftRecurringBills, isPayable, kindOf, nextRecurringDate, payContext, readiness, recodeExpense, registerCsv,
  saveRecurringBills, todayISO, usd, voidExpense, withdrawExpense, EXPENSE_CATEGORIES, categoryId, addDaysISO, type HubTab, type PayMethod, type SpendSub, type SpendingBundle, type SpendingPerms,
} from '../../../../services/acctSpending';
import { downloadText } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, label, heading, btnPrimary, btnGhost, Empty, Pill } from './shared';
import { ApproveBar, ExpenseCard } from './SpendingCards';
import SpendingSubmit from './SpendingSubmit';
import { SkeletonRows, useDeferred, useDo, useHotkeys, useSpendingBundle, useToast } from './SpendingUi';
import { useRecurringSweep } from './MoneyInbox';

const SpendingHub: React.FC<{ org: Organization; member: OrgMembership | null; initialSub?: SpendSub; onNavigate?: (t: HubTab, s?: SpendSub) => void; focusSearchRef?: React.MutableRefObject<(() => void) | null> }> = ({ org, member, initialSub, onNavigate, focusSearchRef }) => {
  const { bundle, perms, loading, reload, patch } = useSpendingBundle(org, member);
  useRecurringSweep(org, perms);
  const uid = member?.userId || '';
  const [sub, setSub] = useState<SpendSub>(initialSub || 'mine');
  const [q, setQ] = useState(''); const searchRef = useRef<HTMLInputElement>(null);
  const [prefill, setPrefill] = useState<AcctExpense | null>(null);
  const [link, setLink] = useState<AcctExpense | null>(null);
  useEffect(() => { if (initialSub) setSub(initialSub); }, [initialSub]);
  useEffect(() => { if (focusSearchRef) focusSearchRef.current = () => searchRef.current?.focus(); }, [focusSearchRef]);
  useHotkeys({ n: () => setSub('submit') });

  const ex = bundle?.expenses ?? [];
  const mine = ex.filter(e => e.submittedBy === uid);
  const approvalsN = perms.canApprove ? ex.filter(e => e.status === 'SUBMITTED' && readiness(org, e, ex) === 'PENDING').length : 0;
  const payN = perms.canViewBooks ? ex.filter(e => isPayable(readiness(org, e, ex)) && !e.isRequest).length : 0;

  const tabs = useMemo(() => ([
    { k: 'mine' as const, l: 'My requests', n: 0, show: true },
    { k: 'submit' as const, l: 'New', n: 0, show: perms.canSubmit },
    { k: 'approve' as const, l: 'Approvals', n: approvalsN, show: perms.canApprove },
    { k: 'pay' as const, l: 'Ready to pay', n: payN, show: perms.canViewBooks },
    { k: 'register' as const, l: 'Check register', n: 0, show: perms.canViewBooks },
    { k: 'recurring' as const, l: 'Recurring', n: 0, show: perms.canViewBooks },
  ]).filter(t => t.show), [perms, approvalsN, payN]);
  useEffect(() => { if (tabs.length && !tabs.some(t => t.k === sub)) setSub(tabs[0].k); }, [tabs, sub]);

  const match = (e: AcctExpense) => !q.trim() || [e.vendorName, e.description, e.submittedByName, e.deptName, e.invoiceNumber, e.checkNumber, String(e.amount)].join(' ').toLowerCase().includes(q.trim().toLowerCase());

  if (loading && !bundle) return <SkeletonRows rows={3} />;
  if (!bundle) return <Empty>Couldn’t load spending. Check your connection and tap refresh.</Empty>;

  return (
    <div className="space-y-4">
      {perms.readOnly && <div className="px-4 py-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-xs text-sky-200 flex items-center gap-2"><ShieldAlert size={14} /> You’re in <b>read-only</b> mode — you can view and export everything, but not change anything.</div>}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map(t => <button key={t.k} onClick={() => { setSub(t.k); if (t.k !== 'submit') { setPrefill(null); setLink(null); } }} className={`shrink-0 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${sub === t.k ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{t.l}{t.n > 0 && <span className={`ml-1.5 ${sub === t.k ? 'text-black/70' : 'text-small-orange'}`}>{t.n}</span>}</button>)}
        <div className="ml-auto relative shrink-0"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" /><input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); } }} placeholder="Search  ( / )" className={`${fieldSm} pl-8 w-36 sm:w-48`} /></div>
      </div>

      {sub === 'submit' && perms.canSubmit && (
        <SpendingSubmit org={org} member={member} bundle={bundle} perms={perms} initialKind={link ? 'EXPENSE' : undefined} linkRequest={link} prefill={prefill} onCancel={() => { setSub('mine'); setPrefill(null); setLink(null); }} onDone={() => { setSub('mine'); setPrefill(null); setLink(null); }} />
      )}
      {sub === 'mine' && <MyRequests org={org} bundle={bundle} list={mine.filter(match)} canSubmit={perms.canSubmit} patch={patch} onNew={() => setSub('submit')} onResubmit={e => { setPrefill(e); setSub('submit'); }} onLink={e => { setLink(e); setSub('submit'); }} />}
      {sub === 'approve' && perms.canApprove && <Approvals org={org} member={member} perms={perms} list={ex.filter(match)} all={ex} patch={patch} />}
      {sub === 'pay' && perms.canViewBooks && <PayQueue org={org} perms={perms} bundle={bundle} list={ex.filter(match)} patch={patch} reload={() => reload(true)} />}
      {sub === 'register' && perms.canViewBooks && <Register org={org} perms={perms} list={ex.filter(match)} patch={patch} />}
      {sub === 'recurring' && perms.canViewBooks && <Recurring org={org} perms={perms} bundle={bundle} />}
    </div>
  );
};

// ── My requests ────────────────────────────────────────────────────────────────
const MyRequests: React.FC<{ org: Organization; bundle: SpendingBundle; list: AcctExpense[]; canSubmit: boolean; patch: (id: string, p: Partial<AcctExpense>) => void; onNew: () => void; onResubmit: (e: AcctExpense) => void; onLink: (e: AcctExpense) => void }> = ({ org, bundle, list, canSubmit, patch, onNew, onResubmit, onLink }) => {
  const defer = useDeferred();
  const shown = list.filter(e => e.status !== 'VOID');
  if (!shown.length) return (
    <div className={`${card} p-8 text-center`}>
      <p className="text-sm font-black text-white">Nothing submitted yet</p>
      <p className="text-[11px] text-white/50 mt-1 mb-4">Bought something for ministry? Snap the receipt and it’s on its way — it takes about 20 seconds.</p>
      {canSubmit && <button onClick={onNew} className={btnPrimary}><FilePlus2 size={13} /> Submit your first one</button>}
    </div>
  );
  const withdraw = (e: AcctExpense) => { patch(e.id, { status: 'VOID' }); defer(`Withdrew ${usd(e.amount)}`, () => withdrawExpense(org, e), () => patch(e.id, { status: e.status })); };
  return (
    <div className="space-y-2.5">
      {canSubmit && <button onClick={onNew} className={`${btnPrimary} w-full sm:w-auto`}><FilePlus2 size={13} /> New request or receipt</button>}
      {shown.map(e => (
        <ExpenseCard key={e.id} org={org} e={e} all={bundle.expenses} dense>
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {e.status === 'REJECTED' && <button onClick={() => onResubmit(e)} className={btnPrimary}>Fix & resubmit</button>}
            {e.isRequest && e.status === 'APPROVED' && <button onClick={() => onLink(e)} className={btnPrimary}>I bought it — add receipt</button>}
            {(e.status === 'SUBMITTED') && <button onClick={() => withdraw(e)} className={btnGhost}><Undo2 size={12} /> Withdraw</button>}
          </div>
        </ExpenseCard>
      ))}
    </div>
  );
};

// ── Approvals ──────────────────────────────────────────────────────────────────
const Approvals: React.FC<{ org: Organization; member: OrgMembership | null; perms: SpendingPerms; list: AcctExpense[]; all: AcctExpense[]; patch: (id: string, p: Partial<AcctExpense>) => void }> = ({ org, member, list, all, patch }) => {
  const waiting = list.filter(e => { const r = readiness(org, e, all); return r === 'PENDING' || r === 'NEEDS_SECOND'; });
  const recent = list.filter(e => (e.status === 'APPROVED' || e.status === 'REJECTED') && !waiting.includes(e)).slice(0, 8);
  return (
    <div className="space-y-5">
      <section><h3 className={heading}>Waiting for a decision ({waiting.length})</h3>
        {!waiting.length ? <div className={`${card} p-6 text-center text-xs text-white/50`}>Nothing waiting. New requests will ping you.</div>
          : <div className="space-y-2.5">{waiting.map(e => <ExpenseCard key={e.id} org={org} e={e} all={all}><ApproveBar org={org} member={member} e={e} patch={patch} /></ExpenseCard>)}</div>}</section>
      {recent.length > 0 && <section><h3 className={heading}>Recently decided</h3><div className="space-y-2">{recent.map(e => <ExpenseCard key={e.id} org={org} e={e} all={all} dense />)}</div></section>}
    </div>
  );
};

// ── Ready to pay ───────────────────────────────────────────────────────────────
const nextCheck = (list: AcctExpense[]) => { const n = Math.max(0, ...list.filter(e => e.paymentMethod === 'CHECK').map(e => parseInt(e.checkNumber || '', 10) || 0)); return n ? n + 1 : undefined; };

const PayQueue: React.FC<{ org: Organization; perms: SpendingPerms; bundle: SpendingBundle; list: AcctExpense[]; patch: (id: string, p: Partial<AcctExpense>) => void; reload: () => void }> = ({ org, perms, bundle, list, patch }) => {
  const act = useDo(); const toast = useToast();
  const all = bundle.expenses; const today = todayISO();
  const payable = list.filter(e => isPayable(readiness(org, e, all)) && !e.isRequest).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const waitingSecond = list.filter(e => readiness(org, e, all) === 'NEEDS_SECOND');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<string[] | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null); const [vr, setVr] = useState('');
  const chosen = payable.filter(e => sel.has(e.id));
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ctxRef = useRef<Awaited<ReturnType<typeof payContext>> | null>(null);
  const ctx = async () => ctxRef.current || (ctxRef.current = await payContext(org, bundle));

  const book = (e: AcctExpense) => act.run(async () => { await bookBill(org, e, await ctx()); }, `Booked ${usd(e.amount)} to Accounts Payable`);
  const doVoid = (e: AcctExpense) => act.run(async () => { await voidExpense(org, e, vr, perms); setVoiding(null); setVr(''); }, `Voided ${usd(e.amount)}`);
  const recode = (e: AcctExpense, accountId: string) => act.run(async () => { patch(e.id, { accountId }); await recodeExpense(org, e, { accountId }); }, 'Category updated');

  if (!payable.length && !waitingSecond.length) return <div className={`${card} p-8 text-center`}><p className="text-sm font-black text-white">Nothing to pay</p><p className="text-[11px] text-white/50 mt-1">Approved bills and reimbursements show up here the moment they’re ready.</p></div>;

  const totalSel = chosen.reduce((s, e) => s + e.amount, 0);
  const catOptions = (bundle.accounts.filter(a => a.type === 'EXPENSE' && a.active && !a.systemKey).map(a => ({ id: a.id, name: a.name })));
  const opts = catOptions.length ? catOptions : EXPENSE_CATEGORIES.map(c => ({ id: categoryId(org.id, c.code), name: c.name }));

  return (
    <div className="space-y-4">
      {!perms.readOnly && payable.length > 1 && <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setSel(sel.size === payable.length ? new Set() : new Set(payable.map(e => e.id)))} className={btnGhost}><Layers size={12} /> {sel.size === payable.length ? 'Clear' : 'Select all'}</button>
        {payable.some(e => e.dueDate && e.dueDate <= addDaysISO(today, 7)) && <button onClick={() => setSel(new Set(payable.filter(e => e.dueDate && e.dueDate <= addDaysISO(today, 7)).map(e => e.id)))} className={btnGhost}>Due this week</button>}
      </div>}
      <div className="space-y-2.5">
        {payable.map(e => {
          const overdue = !!e.dueDate && e.dueDate < today;
          return (
            <ExpenseCard key={e.id} org={org} e={e} all={all} dense right={!perms.readOnly && <input type="checkbox" aria-label="Select" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="mt-1 h-5 w-5 accent-orange-500" />}>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {overdue && <Pill tone="bad">Overdue</Pill>}
                {!perms.readOnly && <>
                  <button onClick={() => setPaying([e.id])} className={btnPrimary}>{e.kind === 'EXPENSE' ? 'Record as paid' : 'Pay'}</button>
                  {e.kind === 'BILL' && !e.journalId && <button onClick={() => book(e)} disabled={act.busy} className={btnGhost}>Book to AP</button>}
                  {!e.journalId && <select aria-label="Category" value={e.accountId} onChange={ev => recode(e, ev.target.value)} className={`${fieldSm} max-w-[9.5rem]`}>{!opts.some(o => o.id === e.accountId) && <option value={e.accountId}>{categoryName(org.id, e.accountId)}</option>}{opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
                  <button onClick={() => { setVoiding(voiding === e.id ? null : e.id); setVr(''); }} className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-red-400 ml-auto"><Trash2 size={11} className="inline -mt-0.5" /> Void</button>
                </>}
              </div>
              {voiding === e.id && <div className="flex gap-2 mt-2"><input autoFocus value={vr} onChange={ev => setVr(ev.target.value)} placeholder="Reason for voiding (required)" className={`${fieldSm} flex-1`} /><button disabled={!vr.trim() || act.busy} onClick={() => doVoid(e)} className={btnPrimary}>Void</button></div>}
            </ExpenseCard>
          );
        })}
        {waitingSecond.map(e => <ExpenseCard key={e.id} org={org} e={e} all={all} dense><p className="text-[10px] text-amber-300 mt-2">Needs a second approver before it can be paid (different from {e.approvals?.[0]?.name || 'the first approver'}).</p></ExpenseCard>)}
      </div>

      {chosen.length > 0 && !perms.readOnly && (
        <div className="sticky bottom-3 z-20"><div className={`${card} bg-zinc-950/95 backdrop-blur p-3 flex items-center justify-between gap-3 border-small-orange/40`}>
          <p className="text-xs font-black text-white pl-2">{chosen.length} selected · {usd(totalSel)}</p>
          <button onClick={() => setPaying(chosen.map(e => e.id))} className={btnPrimary}>Pay {chosen.length === 1 ? 'it' : 'together'}</button>
        </div></div>
      )}

      {paying && <PayPanel org={org} bundle={bundle} items={all.filter(e => paying.includes(e.id))} onClose={() => setPaying(null)} patch={patch} onPaid={() => { setPaying(null); setSel(new Set()); }} ctx={ctx} toast={toast} />}
    </div>
  );
};

const PayPanel: React.FC<{ org: Organization; bundle: SpendingBundle; items: AcctExpense[]; onClose: () => void; onPaid: () => void; patch: (id: string, p: Partial<AcctExpense>) => void; ctx: () => Promise<any>; toast: ReturnType<typeof useToast> }> = ({ org, bundle, items, onClose, onPaid, patch, ctx, toast }) => {
  const act = useDo();
  const banks = bundle.bankAccounts.filter(b => b.active && b.kind !== 'STRIPE');
  const [method, setMethod] = useState<PayMethod>(items.every(e => e.kind === 'EXPENSE') ? 'CARD' : 'CHECK');
  const [bank, setBank] = useState(banks.find(b => b.kind === (method === 'CARD' ? 'CREDIT_CARD' : 'CHECKING'))?.id || banks[0]?.id || '');
  const [date, setDate] = useState(todayISO());
  const [check, setCheck] = useState(String(nextCheck(bundle.expenses) ?? ''));
  const total = items.reduce((s, e) => s + e.amount, 0);
  const go = () => act.run(async () => {
    const r = await batchPay(org, items, { method, bankAccountId: bank || undefined, date, startCheck: method === 'CHECK' ? Number(check) || undefined : undefined }, await ctx());
    r.paid.forEach(id => patch(id, { status: 'PAID', paymentMethod: method, paidAt: Date.now() }));
    if (r.failed.length) toast(`${r.paid.length} paid · ${r.failed.length} need attention: ${r.failed[0].message}`, { tone: 'warn', ms: 8000 });
    else toast(`Paid ${r.paid.length} · ${usd(total)}`);
    if (r.paid.length) onPaid();
  });
  return (
    <div className="fixed inset-0 z-[250] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={`${card} bg-zinc-950 w-full sm:max-w-md p-5 space-y-4 rounded-b-none sm:rounded-b-[2rem] max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-black text-white">{items.length === 1 ? `Pay ${usd(total)}` : `Pay ${items.length} items · ${usd(total)}`}</h3>
        <div className="flex flex-wrap gap-1.5">{PAY_METHODS.map(m => <button key={m.key} onClick={() => setMethod(m.key)} className={`px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${method === m.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60'}`}>{m.label}</button>)}</div>
        {banks.length > 0 ? <div><p className={`${label} mb-1`}>Paid from</p><select value={bank} onChange={e => setBank(e.target.value)} className={field}>{banks.map(b => <option key={b.id} value={b.id}>{b.name}{b.last4 ? ` ····${b.last4}` : ''}</option>)}</select></div>
          : <p className="text-[10px] text-amber-300">No bank account added yet — this will post against Operating Checking. Add yours in Setup for exact matching.</p>}
        <div className="grid grid-cols-2 gap-3"><div><p className={`${label} mb-1`}>Date paid</p><input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></div>
          {method === 'CHECK' && <div><p className={`${label} mb-1`}>{items.length > 1 ? 'First check #' : 'Check #'}</p><input inputMode="numeric" value={check} onChange={e => setCheck(e.target.value.replace(/\D/g, ''))} className={field} /></div>}</div>
        {items.length > 1 && <div className="max-h-32 overflow-y-auto text-[10px] text-white/50 space-y-0.5">{items.map((e, i) => <p key={e.id} className="flex justify-between"><span className="truncate">{method === 'CHECK' && check ? `#${Number(check) + i} · ` : ''}{e.vendorName || e.submittedByName} — {e.description}</span><span className="tabular-nums">{usd(e.amount)}</span></p>)}</div>}
        <div className="flex gap-2"><button onClick={go} disabled={act.busy || (method === 'CHECK' && !check)} className={`${btnPrimary} flex-1`}>{act.busy && <Loader2 size={13} className="animate-spin" />}Confirm payment</button><button onClick={onClose} className={btnGhost}>Cancel</button></div>
        <p className="text-[10px] text-white/30">Posts to your books automatically. Mistake? Void it from the register and we reverse the entry.</p>
      </div>
    </div>
  );
};

// ── Check register ─────────────────────────────────────────────────────────────
const Register: React.FC<{ org: Organization; perms: SpendingPerms; list: AcctExpense[]; patch: (id: string, p: Partial<AcctExpense>) => void }> = ({ org, perms, list }) => {
  const [mode, setMode] = useState<'checks' | 'all'>('checks'); const act = useDo(); const [voiding, setVoiding] = useState<string | null>(null); const [vr, setVr] = useState('');
  const paid = list.filter(e => e.status === 'PAID' && !e.isRequest).sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));
  const rows = mode === 'checks' ? paid.filter(e => e.paymentMethod === 'CHECK').sort((a, b) => (parseInt(b.checkNumber || '0', 10) || 0) - (parseInt(a.checkNumber || '0', 10) || 0)) : paid;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(['checks', 'all'] as const).map(m => <button key={m} onClick={() => setMode(m)} className={`px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${mode === m ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{m === 'checks' ? 'Checks' : 'All payments'}</button>)}
        <button className={`${btnGhost} ml-auto`} onClick={() => downloadText(`${mode === 'checks' ? 'check-register' : 'payments'}-${todayISO()}.csv`, registerCsv(rows))} disabled={!rows.length}><Download size={12} /> CSV</button>
      </div>
      {!rows.length ? <Empty>No {mode === 'checks' ? 'checks' : 'payments'} yet. Paid bills land here automatically.</Empty> : (
        <div className={`${card} p-4 overflow-x-auto`}><table className="w-full text-xs"><thead><tr>{['Check #', 'Paid', 'Payee', 'For', 'Amount', ''].map(h => <th key={h} className={`${label} text-left py-2 px-2 whitespace-nowrap`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(e => <React.Fragment key={e.id}><tr className="border-t border-white/5"><td className="py-2 px-2 text-white/80 tabular-nums">{e.checkNumber || (e.paymentMethod || '—')}</td><td className="py-2 px-2 text-white/60 whitespace-nowrap">{todayISO(new Date(e.paidAt || 0))}</td><td className="py-2 px-2 text-white/80">{e.vendorName || e.payee || e.submittedByName}</td><td className="py-2 px-2 text-white/50 max-w-[14rem] truncate">{e.description}</td><td className="py-2 px-2 text-right tabular-nums text-white">{usd(e.amount)}</td>
            <td className="py-2 px-2 text-right">{perms.canManage && <button onClick={() => { setVoiding(voiding === e.id ? null : e.id); setVr(''); }} className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-red-400">Void</button>}</td></tr>
            {voiding === e.id && <tr><td colSpan={6} className="px-2 pb-3"><div className="flex gap-2"><input autoFocus value={vr} onChange={ev => setVr(ev.target.value)} placeholder="Reason (required) — the entry is reversed, never deleted" className={`${fieldSm} flex-1`} /><button disabled={!vr.trim() || act.busy} onClick={() => act.run(async () => { await voidExpense(org, e, vr, perms); setVoiding(null); setVr(''); }, `Voided ${usd(e.amount)} and reversed the entry`)} className={btnPrimary}>Void</button></div></td></tr>}</React.Fragment>)}</tbody></table></div>
      )}
    </div>
  );
};

// ── Recurring bills ────────────────────────────────────────────────────────────
const Recurring: React.FC<{ org: Organization; perms: SpendingPerms; bundle: SpendingBundle }> = ({ org, perms, bundle }) => {
  const act = useDo(); const list = org.financeSettings?.recurringBills || [];
  const [f, setF] = useState({ vendor: '', desc: '', amount: '', freq: 'MONTHLY' as RecurringBill['frequency'], next: todayISO(), cat: '', due: '10' });
  const [localList, setLocal] = useState<RecurringBill[]>(list);
  useEffect(() => setLocal(list), [org.financeSettings?.recurringBills]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = bundle.accounts.filter(a => a.type === 'EXPENSE' && a.active && !a.systemKey).map(a => ({ id: a.id, name: a.name }));
  const cats = opts.length ? opts : EXPENSE_CATEGORIES.map(c => ({ id: categoryId(org.id, c.code), name: c.name }));
  const add = () => act.run(async () => {
    if (!f.vendor.trim() || !(Number(f.amount) > 0) || !f.cat) throw new Error('Add the vendor, amount and category.');
    const rb: RecurringBill = { id: Math.random().toString(36).slice(2, 9), vendorName: f.vendor.trim(), description: f.desc.trim() || f.vendor.trim(), amount: Number(f.amount), accountId: f.cat, frequency: f.freq, nextDate: f.next, dueInDays: Number(f.due) || 0, active: true };
    const next = [...localList, rb]; setLocal(next); await saveRecurringBills(org, next); setF(v => ({ ...v, vendor: '', desc: '', amount: '' }));
  }, 'Recurring bill added — it will draft itself.');
  const toggle = (id: string) => act.run(async () => { const next = localList.map(r => r.id === id ? { ...r, active: !r.active } : r); setLocal(next); await saveRecurringBills(org, next); });
  const remove = (id: string) => act.run(async () => { const next = localList.filter(r => r.id !== id); setLocal(next); await saveRecurringBills(org, next); }, 'Removed');
  const due = dueRecurring({ financeSettings: { ...(org.financeSettings || {}), recurringBills: localList } });
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/50">Rent, utilities, insurance, copier lease… set it once and Plajah drafts each bill as approved, ready for you to pay.</p>
      {due.length > 0 && perms.canManage && <button onClick={() => act.run(async () => { const n = await draftRecurringBills(org); return n; }, n => `Drafted ${n} bill${n === 1 ? '' : 's'}`)} className={btnPrimary} disabled={act.busy}><Repeat size={12} /> Draft {due.length} due now</button>}
      {!localList.length ? <Empty>No recurring bills yet. Add rent or your electric bill below.</Empty> : <div className="space-y-2">{localList.map(r => (
        <div key={r.id} className={`${card} p-4 flex items-center gap-3`}><div className="min-w-0 flex-1"><p className="text-xs font-black text-white">{r.vendorName} · {usd(r.amount)} <span className="text-white/40 font-bold">{r.frequency.toLowerCase()}</span></p><p className="text-[10px] text-white/40">{r.description} · next {r.nextDate} · {categoryName(org.id, r.accountId, bundle.accounts)}</p></div>
          {perms.canManage && <><button onClick={() => toggle(r.id)} className={btnGhost}>{r.active ? 'Pause' : 'Resume'}</button><button onClick={() => remove(r.id)} aria-label="Remove" className="p-2 text-white/30 hover:text-red-400"><Trash2 size={13} /></button></>}</div>))}</div>}
      {perms.canManage && <div className={`${card} p-5`}><h3 className={heading}>Add a recurring bill</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <input value={f.vendor} onChange={e => setF({ ...f, vendor: e.target.value })} placeholder="Vendor (e.g. DTE Energy)" className={field} />
          <input value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="Description (optional)" className={field} />
          <input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Amount $" className={field} />
          <select value={f.freq} onChange={e => setF({ ...f, freq: e.target.value as any })} className={field}>{['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].map(x => <option key={x} value={x}>{x[0] + x.slice(1).toLowerCase()}</option>)}</select>
          <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })} className={field}><option value="">Category…</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <div className="grid grid-cols-2 gap-2"><input type="date" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} className={field} /><input inputMode="numeric" value={f.due} onChange={e => setF({ ...f, due: e.target.value.replace(/\D/g, '') })} placeholder="Due in days" className={field} /></div>
        </div>
        <button onClick={add} disabled={act.busy} className={`${btnPrimary} mt-3`}>Add</button></div>}
    </div>
  );
};

export default SpendingHub;
