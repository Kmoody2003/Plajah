// SpendingSubmit — the tiny Request / Submit form. Designed for a volunteer department head on a phone:
// snap the receipt → ARIA pre-fills vendor/date/amount/category → confirm department → send.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Loader2, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { Organization, OrgMembership, AcctExpense } from '../../../../types';
import {
  EXPENSE_CATEGORIES, SPEND_KIND_LABEL, autoLimitFor, categoryId, deptBudgetStatus, deptNameOf, extractReceipt, findDuplicate, kindOf, requiredApprovalsFor,
  submitExpense, suggestFor, todayISO, uploadFinanceFile, usd, validateSubmit, ministryOf, type SpendKind, type SpendingBundle, type SpendingPerms, type ReceiptExtract,
} from '../../../../services/acctSpending';
import { card, field, label, btnPrimary, btnGhost } from './shared';
import { useDo, useToast } from './SpendingUi';

interface Props {
  org: Organization; member: OrgMembership | null; bundle: SpendingBundle; perms: SpendingPerms;
  initialKind?: SpendKind; linkRequest?: AcctExpense | null;
  /** Start from a past/declined expense (resubmit) without linking it as a pre-approval. */
  prefill?: AcctExpense | null;
  onDone: (e: AcctExpense) => void; onCancel?: () => void;
}

const SpendingSubmit: React.FC<Props> = ({ org, member, bundle, perms, initialKind, linkRequest, prefill, onDone, onCancel }) => {
  const uid = member?.userId || '';
  const toast = useToast(); const act = useDo();
  const myDept = useMemo(() => (org.ministries || []).find(m => m.headUids?.includes(uid))?.id || member?.ministryRoles?.[0]?.ministryId || '', [org, member, uid]);
  const seed = linkRequest || prefill || null;
  const [kind, setKind] = useState<SpendKind>(initialKind || (prefill ? kindOf(prefill) : 'EXPENSE'));
  const [amount, setAmount] = useState(seed ? String(seed.amount) : '');
  const [vendor, setVendor] = useState(seed?.vendorName || '');
  const [desc, setDesc] = useState(seed?.description || '');
  const [date, setDate] = useState(todayISO());
  const [due, setDue] = useState('');
  const [invoice, setInvoice] = useState('');
  const [dept, setDept] = useState(seed?.deptId || myDept);
  const [cat, setCat] = useState(seed?.accountId || '');
  const [fund, setFund] = useState(seed?.fundId || '');
  const [reqId, setReqId] = useState(linkRequest?.id || '');
  const [urls, setUrls] = useState<string[]>(prefill?.receiptUrls || []);
  const [reading, setReading] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [dupOk, setDupOk] = useState(false);
  const [more, setMore] = useState(false);
  const catTouched = useRef(!!seed); const cam = useRef<HTMLInputElement>(null); const pick = useRef<HTMLInputElement>(null);

  // Finance sees the real chart; everyone else gets the standard church categories (ids are deterministic).
  const cats = useMemo(() => {
    const live = bundle.accounts.filter(a => a.type === 'EXPENSE' && a.active && !a.systemKey);
    return live.length ? live.map(a => ({ id: a.id, name: a.name })) : EXPENSE_CATEGORIES.map(c => ({ id: categoryId(org.id, c.code), name: c.name }));
  }, [bundle.accounts, org.id]);
  const myApprovedRequests = bundle.expenses.filter(e => e.isRequest && e.status === 'APPROVED' && e.submittedBy === uid);
  const vendorNames = useMemo(() => Array.from(new Set([...bundle.vendors.map(v => v.name), ...bundle.expenses.map(e => e.vendorName || '')].filter(Boolean))).slice(0, 200), [bundle]);

  // rule-based memory: vendor → category / fund / dept
  const sug = useMemo(() => kind === 'REQUEST' && !vendor ? null : suggestFor(org.id, vendor, bundle.expenses, bundle.vendors), [vendor, bundle, kind, org.id]);
  useEffect(() => {
    if (!sug || catTouched.current) return;
    if (sug.accountId && cats.some(c => c.id === sug.accountId)) setCat(sug.accountId);
    if (sug.fundId && !fund) setFund(sug.fundId);
    if (sug.deptId && !dept) setDept(sug.deptId);
  }, [sug]); // eslint-disable-line react-hooks/exhaustive-deps

  const amt = Number(amount) || 0;
  const budget = dept ? deptBudgetStatus(org, bundle.budgets, bundle.expenses, dept) : null;
  const dup = kind !== 'REQUEST' && amt > 0 ? findDuplicate({ vendorName: vendor, invoiceNumber: invoice, amount: amt, date }, bundle.expenses) : null;
  const auto = autoLimitFor(org, dept) >= amt && amt > 0 && requiredApprovalsFor(org, amt) === 1;
  const heads = ministryOf(org, dept)?.headUids || [];
  const route = auto ? `Under ${usd(autoLimitFor(org, dept))} — auto-approved` : requiredApprovalsFor(org, amt) === 2 ? 'Needs two approvals (approver + finance)' : heads.length ? `Goes to the ${deptNameOf(org, dept)} head` : 'Goes to a pastor or finance';

  const onFile = async (f?: File | null) => {
    if (!f) return;
    setReading(true); setAiNote('');
    try {
      const [url, ocr] = await Promise.all([uploadFinanceFile(org, f).catch(() => ''), extractReceipt(f)]);
      if (url) setUrls(u => [...u, url]); else toast('Couldn’t upload the photo — check your connection and try again.', { tone: 'bad' });
      if (ocr.ok && ocr.data) applyOcr(ocr.data); else if (ocr.message) setAiNote(ocr.message);
    } finally { setReading(false); }
  };
  const applyOcr = (d: ReceiptExtract) => {
    if (d.amount && !amount) setAmount(String(d.amount));
    if (d.vendor && !vendor) setVendor(d.vendor);
    if (d.date && date === todayISO()) setDate(d.date);
    if (d.description && !desc) setDesc(d.description);
    if (d.invoiceNumber && !invoice) setInvoice(d.invoiceNumber);
    if (d.categoryCode && !catTouched.current) { const id = categoryId(org.id, d.categoryCode); if (cats.some(c => c.id === id)) setCat(id); }
    setAiNote('ARIA read your receipt — double-check the amount, then send.');
  };

  const input = { kind, vendorName: vendor, description: desc, date, dueDate: due || undefined, amount: amt, accountId: cat, fundId: fund || undefined, deptId: dept || undefined, receiptUrls: urls, invoiceNumber: invoice, requestId: reqId || undefined, allowDuplicate: dupOk };
  const problem = validateSubmit(input);
  const needReceipt = kind === 'EXPENSE' || kind === 'REIMBURSEMENT';

  const submit = () => act.run(async () => {
    const e = await submitExpense(org, input, bundle.expenses);
    onDone(e);
    return e;
  }, e => auto ? `Sent — auto-approved, finance will take it from here.` : `Sent for approval · ${usd(e.amount)}`);

  const chip = (k: SpendKind) => (
    <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 min-w-[44%] sm:min-w-0 text-left px-3 py-2.5 rounded-2xl border transition-all ${kind === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest">{SPEND_KIND_LABEL[k].label}</p>
      <p className={`text-[10px] mt-0.5 ${kind === k ? 'text-black/60' : 'text-white/40'}`}>{SPEND_KIND_LABEL[k].hint}</p>
    </button>
  );

  return (
    <div className={`${card} p-4 sm:p-6 space-y-4`}>
      <div className="flex items-center justify-between"><h3 className="text-sm font-black text-white">{kind === 'REQUEST' ? 'Ask for approval' : 'Submit spending'}</h3>{onCancel && <button onClick={onCancel} aria-label="Close" className="text-white/40 hover:text-white"><X size={16} /></button>}</div>
      <div className="flex flex-wrap gap-2">{(['EXPENSE', 'REIMBURSEMENT', 'BILL', 'REQUEST'] as SpendKind[]).map(chip)}</div>

      {/* receipt */}
      <div>
        <div className="flex gap-2">
          <button type="button" onClick={() => cam.current?.click()} disabled={reading} className={`${btnPrimary} flex-1 py-4`}>{reading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {reading ? 'Reading…' : urls.length ? 'Add another photo' : kind === 'BILL' ? 'Snap the invoice' : 'Snap receipt'}</button>
          <button type="button" onClick={() => pick.current?.click()} disabled={reading} className={`${btnGhost} px-4`} aria-label="Upload a file"><ImagePlus size={14} /> Upload</button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={pick} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {urls.length > 0 && <div className="flex gap-2 mt-2 flex-wrap">{urls.map((u, i) => <div key={u} className="relative"><img src={u} alt={`Receipt ${i + 1}`} className="h-14 w-14 rounded-xl object-cover border border-white/10 bg-white/5" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} /><button type="button" aria-label="Remove" onClick={() => setUrls(l => l.filter(x => x !== u))} className="absolute -top-1.5 -right-1.5 bg-black border border-white/20 rounded-full p-0.5"><X size={10} /></button></div>)}</div>}
        {aiNote && <p className="text-[10px] text-white/50 mt-2 flex items-center gap-1.5"><Sparkles size={11} className="text-small-orange" />{aiNote}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><p className={`${label} mb-1`}>Amount</p><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className={`${field} pl-8 text-lg font-black`} /></div></div>
        <div><p className={`${label} mb-1`}>{kind === 'BILL' ? 'Invoice date' : 'Date'}</p><input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></div>
      </div>
      <div><p className={`${label} mb-1`}>{kind === 'REIMBURSEMENT' ? 'Where did you buy it?' : 'Vendor / store'}</p><input list="vendor-names" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Hobby Lobby" className={field} /><datalist id="vendor-names">{vendorNames.map(v => <option key={v} value={v} />)}</datalist></div>
      <div><p className={`${label} mb-1`}>What was it for?</p><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Craft supplies for Sunday school" className={field} /></div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div><p className={`${label} mb-1`}>Department</p>
          <select value={dept} onChange={e => setDept(e.target.value)} className={field}><option value="">General / not sure</option>{(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><p className={`${label} mb-1`}>Category {sug?.accountId && sug.accountId === cat && <span className="text-small-orange normal-case tracking-normal font-bold">· auto-picked ({sug.why})</span>}</p>
          <select value={cat} onChange={e => { catTouched.current = true; setCat(e.target.value); }} className={field}><option value="">Choose…</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>

      {budget && (
        <div className={`px-4 py-3 rounded-2xl border text-xs ${budget.left - amt < 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'}`}>
          {budget.left - amt < 0
            ? <><TriangleAlert size={12} className="inline mr-1.5 -mt-0.5" />{budget.deptName} {budget.left < 0 ? `is already ${usd(-budget.left)} over its` : `has only ${usd(budget.left)} left in its`} {budget.period} budget — this {amt ? `${usd(amt)} ` : ''}will go over. You can still send it; your approver will see the note.</>
            : <><CheckCircle2 size={12} className="inline mr-1.5 -mt-0.5" />{budget.deptName} has <b>{usd(budget.left)}</b> left this quarter{amt ? ` (${usd(budget.left - amt)} after this)` : ''}.</>}
        </div>
      )}

      {(kind === 'EXPENSE' || kind === 'REIMBURSEMENT') && myApprovedRequests.length > 0 && (
        <div><p className={`${label} mb-1`}>This is for an approved request</p>
          <select value={reqId} onChange={e => setReqId(e.target.value)} className={field}><option value="">No — it’s a new expense</option>{myApprovedRequests.map(r => <option key={r.id} value={r.id}>{usd(r.amount)} · {r.description}</option>)}</select>
          {reqId && <p className="text-[10px] text-emerald-300 mt-1">Pre-approved — it goes straight to finance.</p>}</div>
      )}

      {kind === 'BILL' && <div className="grid grid-cols-2 gap-3"><div><p className={`${label} mb-1`}>Due date</p><input type="date" value={due} onChange={e => setDue(e.target.value)} className={field} /></div><div><p className={`${label} mb-1`}>Invoice #</p><input value={invoice} onChange={e => setInvoice(e.target.value)} className={field} /></div></div>}

      <button type="button" onClick={() => setMore(v => !v)} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">{more ? 'Hide' : 'More'} options (fund{kind !== 'BILL' ? ', invoice #' : ''})</button>
      {more && <div className="grid grid-cols-2 gap-3"><div><p className={`${label} mb-1`}>Fund (restricted spend)</p><select value={fund} onChange={e => setFund(e.target.value)} className={field}><option value="">General</option>{(org.givingFunds || []).filter(f => !f.inactive).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>{kind !== 'BILL' && <div><p className={`${label} mb-1`}>Invoice / receipt #</p><input value={invoice} onChange={e => setInvoice(e.target.value)} className={field} /></div>}</div>}

      {dup && (
        <div className="px-4 py-3 rounded-2xl border bg-red-500/10 border-red-500/30 text-xs text-red-200">
          <TriangleAlert size={12} className="inline mr-1.5 -mt-0.5" /><b>Possible duplicate.</b> {dup.reason}.
          <label className="flex items-center gap-2 mt-2 text-red-100"><input type="checkbox" checked={dupOk} onChange={e => setDupOk(e.target.checked)} /> It’s a different purchase — send anyway</label>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[10px] text-white/40 min-w-0">{amt > 0 ? route : 'Enter an amount to see who approves it.'}{needReceipt && !urls.length && amt > 0 ? ' · receipt required' : ''}</p>
        <button onClick={submit} disabled={act.busy || reading || !!problem || (!!dup && !dupOk)} title={problem || ''} className={`${btnPrimary} shrink-0`}>{act.busy ? <Loader2 size={13} className="animate-spin" /> : null}{kind === 'REQUEST' ? 'Ask' : 'Send'}</button>
      </div>
      {problem && amt > 0 && <p className="text-[10px] text-amber-300 -mt-2">{problem}</p>}
    </div>
  );
};

export default SpendingSubmit;
