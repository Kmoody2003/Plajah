// InvoiceComposer — the one composer for invoices AND estimates. Mobile-first: form on top, live preview below
// (a Preview toggle on phones, side-by-side on desktop). Customer + lines + due date are all you need to send.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Plus, Trash2, Send, Save, Clock, Copy, ExternalLink, Download, Check, Eye, Pencil, UserPlus, BookOpen, Bell, Repeat, Layers } from 'lucide-react';
import type { BillingCustomer, BillingEntityRef, BillingItem, BillingSettings, Estimate, Invoice, InvoiceLine } from '../../types';
import { useBillingFlags } from '../../services/billingFlags';
import {
  TERMS, addDaysISO, billingApi, computeTotals, copyText, emptyLine, entityKey, fromCents, isEmail, saveCustomer, todayISO, toCents,
  useBillingCustomers, useBillingItems, useBillingSettings,
} from '../../services/billingService';
import { InvoicePreview } from './InvoicePreview';
import { Busy, Sheet, btnGhost, btnPrimary, card, field, fieldSm, label, money, useToast } from './ui';

type Doc = Invoice | Estimate;
interface Props {
  entity: BillingEntityRef; entityName: string; logoUrl?: string; mode?: 'invoice' | 'estimate';
  initial?: Partial<Doc> | null; presetCustomerId?: string; onDone: (saved?: Doc) => void; onCancel: () => void;
}
const isInvoice = (d: any): d is Invoice => !!d && 'dueDate' in d;
const estimateUrl = (e: Estimate) => e.acceptToken ? `${window.location.origin}/estimate/${e.acceptToken}` : '';

export const InvoiceComposer: React.FC<Props> = ({ entity, entityName, logoUrl, mode = 'invoice', initial, presetCustomerId, onDone, onCancel }) => {
  const toast = useToast(); const flags = useBillingFlags();
  const can = (k: Parameters<typeof flags.enabled>[0]) => flags.enabled(k) || flags.preview(k);
  const isEst = mode === 'estimate';
  const { rows: customers } = useBillingCustomers(entity);
  const { rows: items } = useBillingItems(entity);
  const { settings } = useBillingSettings(entity);
  const ini: any = initial || {};

  const [customerId, setCustomerId] = useState<string>(ini.customerId || presetCustomerId || '');
  const [newCust, setNewCust] = useState<{ name: string; email: string } | null>(null);
  const [custQ, setCustQ] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>(ini.lines?.length ? ini.lines : [emptyLine()]);
  const [discount, setDiscount] = useState(ini.discount ? String(ini.discount) : '');
  const [taxRate, setTaxRate] = useState('');
  const [issueDate, setIssueDate] = useState<string>(ini.issueDate || todayISO());
  const [termsDays, setTermsDays] = useState<number | 'custom'>(ini.dueDate ? 'custom' : 30);
  const [dueDate, setDueDate] = useState<string>(ini.dueDate || '');
  const [validUntil, setValidUntil] = useState<string>(ini.validUntil || addDaysISO(todayISO(), 30));
  const [memo, setMemo] = useState<string>(ini.memo ?? '');
  const [footer, setFooter] = useState<string>(ini.footer ?? '');
  const [po, setPo] = useState<string>(ini.poNumber || '');
  const [schedule, setSchedule] = useState<NonNullable<Invoice['schedule']>>(ini.schedule || []);
  const [recurring, setRecurring] = useState<Invoice['recurring'] | undefined>(ini.recurring);
  const [remind, setRemind] = useState<boolean>(!!ini.reminders);
  const [sendLater, setSendLater] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [sent, setSent] = useState<Doc | null>(null);
  const seeded = useRef(false);

  // Seed defaults from settings once (new docs only).
  useEffect(() => {
    if (seeded.current || !settings || initial?.id) return;
    seeded.current = true;
    if (settings.defaultTermsDays !== undefined && !ini.dueDate) setTermsDays(TERMS.some(t => t.days === settings.defaultTermsDays) ? settings.defaultTermsDays : 'custom');
    if (settings.defaultMemo && !memo) setMemo(settings.defaultMemo);
    if (settings.defaultFooter && !footer) setFooter(settings.defaultFooter);
    if (settings.defaultReminders && !isEst) setRemind(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const effDue = termsDays === 'custom' ? (dueDate || addDaysISO(issueDate, 30)) : addDaysISO(issueDate, termsDays);
  const rate = parseFloat(taxRate) || 0;
  const totals = useMemo(() => computeTotals({ lines, discount: parseFloat(discount) || 0, taxRate: rate }), [lines, discount, rate]);
  const cust: BillingCustomer | undefined = customers.find(c => c.id === customerId);
  const custName = newCust ? newCust.name : cust?.name || ini.customerName || '';
  const custEmail = newCust ? newCust.email : cust?.email || ini.customerEmail;

  const upd = (i: number, p: Partial<InvoiceLine>) => setLines(l => l.map((x, j) => j === i ? { ...x, ...p } : x));
  const addFromBook = (id: string) => { const it = items.find(x => x.id === id); if (!it) return; setLines(l => [...l.filter(x => x.description || x.unitAmount), { itemId: it.id, description: it.name + (it.description ? ` — ${it.description}` : ''), quantity: 1, unitAmount: it.unitAmount, taxable: it.taxable }]); };

  const schedSum = schedule.reduce((a, s) => a + toCents(s.amount), 0);
  const schedOk = schedule.length === 0 || schedSum === toCents(totals.total);
  const quickDeposit = (pct: number) => {
    const t = toCents(totals.total); const dep = Math.round(t * pct / 100);
    setSchedule([{ label: `Deposit (${pct}%)`, amount: fromCents(dep), dueDate: issueDate }, { label: 'Balance', amount: fromCents(t - dep), dueDate: effDue }]);
  };

  const problem = (() => {
    if (!custName.trim()) return 'Pick or add a customer';
    if (newCust && newCust.email && !isEmail(newCust.email)) return 'That email looks off';
    if (!lines.some(l => l.description.trim() && toCents(l.unitAmount) > 0)) return 'Add at least one line with a price';
    if (totals.total <= 0) return 'Total must be more than $0';
    if (!schedOk) return 'Payment schedule must add up to the total';
    return '';
  })();

  /** Persist (creates the customer inline if needed) and return the saved doc. */
  const persist = async (): Promise<Doc> => {
    let cid = customerId; let name = custName; let email = custEmail;
    if (newCust) { const c = await saveCustomer(entity, { name: newCust.name.trim(), email: newCust.email.trim() || undefined }); cid = c.id; name = c.name; email = c.email; setCustomerId(c.id); setNewCust(null); }
    const cleanLines = lines.filter(l => l.description.trim() || toCents(l.unitAmount) > 0).map(l => ({ ...l, quantity: Number(l.quantity) || 1, unitAmount: fromCents(toCents(l.unitAmount)) }));
    if (isEst) {
      return billingApi.saveEstimate(entity, { id: ini.id, customerId: cid, customerName: name, lines: cleanLines, total: totals.total, validUntil, memo: memo || undefined, status: 'DRAFT' });
    }
    const inv: Partial<Invoice> = {
      id: ini.id, customerId: cid, customerName: name, customerEmail: email || undefined, lines: cleanLines,
      subtotal: totals.subtotal, discount: totals.discount || undefined, tax: totals.tax || undefined, total: totals.total,
      amountPaid: ini.amountPaid || 0, amountDue: fromCents(toCents(totals.total) - toCents(ini.amountPaid || 0)), currency: 'usd',
      issueDate, dueDate: effDue, memo: memo || undefined, footer: footer || undefined, poNumber: po || undefined, status: 'DRAFT',
      schedule: schedule.length ? schedule : undefined, recurring: recurring || undefined,
      reminders: remind ? { beforeDueDays: [3], afterDueDays: [1, 7, 14] } : undefined,
      scheduledSendAt: sendLater ? new Date(sendLater).getTime() : undefined,
    };
    return billingApi.saveInvoice(entity, inv);
  };

  const run = async (kind: 'draft' | 'send' | 'later') => {
    if (problem) { toast(problem, { tone: 'warn' }); return; }
    setBusy(true);
    try {
      const saved = await persist();
      if (kind === 'draft') { toast(isEst ? 'Estimate saved as draft' : 'Draft saved'); onDone(saved); return; }
      if (kind === 'later') { toast(`Scheduled for ${new Date(sendLater).toLocaleString()}`); onDone(saved); return; }
      const out = isEst ? await billingApi.sendEstimate(entity, saved.id) : await billingApi.invoiceAction('send', entity, saved.id, { via: custPlajah ? ['email', 'plajah'] : ['email'] });
      setSent(out);
    } catch (e: any) { toast(e?.message || 'Could not save — nothing was sent.', { tone: 'bad' }); }
    finally { setBusy(false); }
  };
  const custPlajah = !!cust?.plajahUid;

  // Ctrl/Cmd+S = save draft
  const runRef = useRef(run); runRef.current = run;
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); runRef.current('draft'); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  if (sent) return <SendResult doc={sent} entityName={entityName} customerEmail={custEmail} plajah={custPlajah} onDone={() => onDone(sent)} />;

  const filteredCust = customers.filter(c => !c.archived && (!custQ || `${c.name} ${c.email || ''} ${c.company || ''}`.toLowerCase().includes(custQ.toLowerCase())));
  const title = `${initial?.id ? 'Edit' : 'New'} ${isEst ? 'estimate' : 'invoice'}`;

  const form = (
    <div className="space-y-5">
      {/* customer */}
      <section aria-label="Customer">
        <p className={label}>Customer</p>
        {newCust ? (
          <div className="grid sm:grid-cols-2 gap-2 mt-1.5">
            <input autoFocus value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} placeholder="Name or company" aria-label="Customer name" className={field} />
            <input value={newCust.email} onChange={e => setNewCust({ ...newCust, email: e.target.value })} placeholder="Email (to send it)" inputMode="email" aria-label="Customer email" className={field} />
            <button onClick={() => setNewCust(null)} className="text-[10px] text-white/40 hover:text-white text-left">Cancel — pick an existing customer</button>
          </div>
        ) : (
          <div className="mt-1.5 space-y-2">
            {customers.length > 6 && <input value={custQ} onChange={e => setCustQ(e.target.value)} placeholder="Search customers…" aria-label="Search customers" className={fieldSm + ' w-full'} />}
            <div className="flex gap-2">
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} aria-label="Customer" className={field}>
                <option value="">{customers.length ? 'Select a customer…' : 'No customers yet — add one →'}</option>
                {cust && !filteredCust.some(c => c.id === cust.id) && <option value={cust.id}>{cust.name}</option>}
                {filteredCust.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>)}
              </select>
              <button onClick={() => setNewCust({ name: '', email: '' })} className={btnGhost + ' shrink-0'}><UserPlus size={13} /> New</button>
            </div>
            {cust && !cust.email && <p className="text-[10px] text-amber-300">No email on file — you can still copy the link or show the QR.</p>}
          </div>
        )}
      </section>

      {/* lines */}
      <section aria-label="Line items">
        <div className="flex items-center justify-between"><p className={label}>Items</p>
          {items.filter(i => i.active).length > 0 && (
            <label className="flex items-center gap-1 text-[10px] text-white/50"><BookOpen size={11} />
              <select value="" onChange={e => { addFromBook(e.target.value); e.currentTarget.value = ''; }} aria-label="Add from price book" className={fieldSm}>
                <option value="">Add from price book…</option>{items.filter(i => i.active).map((i: BillingItem) => <option key={i.id} value={i.id}>{i.name} · {money(i.unitAmount)}</option>)}
              </select></label>
          )}
        </div>
        <div className="space-y-2 mt-1.5">
          {lines.map((l, i) => (
            <div key={i} className="bg-black/20 border border-white/10 rounded-2xl p-3 space-y-2">
              <div className="flex gap-2">
                <input value={l.description} onChange={e => upd(i, { description: e.target.value })} placeholder="Description" aria-label={`Line ${i + 1} description`} className={field} />
                {lines.length > 1 && <button onClick={() => setLines(x => x.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="p-2 text-white/30 hover:text-red-400"><Trash2 size={14} /></button>}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Qty
                  <input type="number" min={0} step="any" inputMode="decimal" value={l.quantity} onChange={e => upd(i, { quantity: parseFloat(e.target.value) || 0 })} className={fieldSm + ' w-full mt-0.5'} /></label>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Price
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={l.unitAmount || ''} onChange={e => upd(i, { unitAmount: parseFloat(e.target.value) || 0 })} placeholder="0.00" className={fieldSm + ' w-full mt-0.5'} /></label>
                <p className="text-sm font-black text-white tabular-nums text-right pt-3">{money(fromCents(Math.round(toCents(l.unitAmount) * (Number(l.quantity) || 0))))}</p>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-white/50"><input type="checkbox" checked={!!l.taxable} onChange={e => upd(i, { taxable: e.target.checked })} /> Taxable</label>
            </div>
          ))}
          <button onClick={() => setLines(l => [...l, emptyLine()])} className={btnGhost}><Plus size={12} /> Add line</button>
        </div>
      </section>

      {/* totals inputs */}
      <section className="grid grid-cols-2 gap-2" aria-label="Discount and tax">
        <label className={label}>Discount ($)<input type="number" min={0} step="0.01" inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" className={fieldSm + ' w-full mt-1'} /></label>
        <label className={label}>Tax rate (%)<input type="number" min={0} step="0.001" inputMode="decimal" value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="0" className={fieldSm + ' w-full mt-1'} /></label>
      </section>

      {/* dates */}
      {isEst ? (
        <label className={label}>Valid until<input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={fieldSm + ' w-full mt-1'} /></label>
      ) : (
        <section aria-label="Due date">
          <p className={label}>Due</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {TERMS.map(t => <button key={t.days} onClick={() => setTermsDays(t.days)} aria-pressed={termsDays === t.days} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${termsDays === t.days ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 text-white/60 border-white/10'}`}>{t.label}</button>)}
            <button onClick={() => { setTermsDays('custom'); setDueDate(effDue); }} aria-pressed={termsDays === 'custom'} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${termsDays === 'custom' ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 text-white/60 border-white/10'}`}>Pick date</button>
          </div>
          {termsDays === 'custom' && <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} aria-label="Due date" className={fieldSm + ' mt-2'} />}
          <p className="text-[10px] text-white/30 mt-1">Due {effDue}</p>
        </section>
      )}

      {/* notes */}
      <section className="space-y-2" aria-label="Notes">
        <label className={label}>Memo to customer<textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="Thanks for your business!" className={field + ' mt-1'} /></label>
        <details className="group"><summary className="text-[10px] font-black uppercase tracking-widest text-white/40 cursor-pointer">More: footer, PO number</summary>
          <div className="space-y-2 mt-2">
            <textarea value={footer} onChange={e => setFooter(e.target.value)} rows={2} placeholder="Footer (payment terms, legal line…)" aria-label="Footer" className={field} />
            {!isEst && <input value={po} onChange={e => setPo(e.target.value)} placeholder="PO / reference number" aria-label="PO number" className={field} />}
          </div>
        </details>
      </section>

      {/* advanced, flag-gated */}
      {!isEst && can('INSTALLMENTS') && (
        <section className={`${card} p-4`} aria-label="Deposit and milestones">
          <div className="flex items-center justify-between"><p className="text-xs font-black text-white flex items-center gap-2"><Layers size={13} className="text-small-orange" /> Deposit & milestones</p>
            {schedule.length > 0 && <button onClick={() => setSchedule([])} className="text-[10px] text-white/40 hover:text-white">Remove</button>}</div>
          {schedule.length === 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">{[25, 50].map(p => <button key={p} onClick={() => quickDeposit(p)} disabled={totals.total <= 0} className={btnGhost}>{p}% deposit + balance</button>)}
              <button onClick={() => setSchedule([{ label: 'Milestone 1', amount: 0, dueDate: issueDate }])} className={btnGhost}>Custom</button></div>
          ) : (
            <div className="space-y-2 mt-2">
              {schedule.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_5.5rem] sm:grid-cols-[1fr_6rem_9rem_auto] gap-2 items-center">
                  <input value={s.label} onChange={e => setSchedule(x => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} aria-label="Label" className={fieldSm} />
                  <input type="number" step="0.01" value={s.amount || ''} onChange={e => setSchedule(x => x.map((y, j) => j === i ? { ...y, amount: parseFloat(e.target.value) || 0 } : y))} aria-label="Amount" className={fieldSm} />
                  <input type="date" value={s.dueDate} onChange={e => setSchedule(x => x.map((y, j) => j === i ? { ...y, dueDate: e.target.value } : y))} aria-label="Due date" className={fieldSm} />
                  <button onClick={() => setSchedule(x => x.filter((_, j) => j !== i))} aria-label="Remove installment" className="p-1 text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between"><button onClick={() => setSchedule(x => [...x, { label: `Milestone ${x.length + 1}`, amount: 0, dueDate: effDue }])} className={btnGhost}><Plus size={12} /> Add</button>
                <p className={`text-[10px] font-black ${schedOk ? 'text-green-400' : 'text-amber-300'}`}>{schedOk ? '✓ Adds up to total' : `Off by ${money(fromCents(toCents(totals.total) - schedSum))}`}</p></div>
            </div>
          )}
        </section>
      )}
      {!isEst && can('RECURRING_INVOICES') && (
        <section className={`${card} p-4`} aria-label="Recurring">
          <label className="flex items-center gap-2 text-xs font-black text-white"><input type="checkbox" checked={!!recurring} onChange={e => setRecurring(e.target.checked ? { interval: 'month', every: 1 } : undefined)} /> <Repeat size={13} className="text-small-orange" /> Repeat this invoice</label>
          {recurring && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-white/60">Every
              <input type="number" min={1} value={recurring.every} onChange={e => setRecurring({ ...recurring, every: Math.max(1, parseInt(e.target.value) || 1) })} aria-label="Every" className={fieldSm + ' w-16'} />
              <select value={recurring.interval} onChange={e => setRecurring({ ...recurring, interval: e.target.value as any })} aria-label="Interval" className={fieldSm}><option value="week">week(s)</option><option value="month">month(s)</option><option value="year">year(s)</option></select>
              until <input type="date" value={recurring.endDate || ''} onChange={e => setRecurring({ ...recurring, endDate: e.target.value || undefined })} aria-label="End date" className={fieldSm} /></div>
          )}
        </section>
      )}
      {!isEst && can('REMINDERS') && (
        <label className={`${card} p-4 flex items-center gap-2 text-xs font-black text-white`}><input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} /> <Bell size={13} className="text-small-orange" /> Send friendly reminders <span className="text-white/40 font-normal">3 days before, then 1, 7 and 14 days after</span></label>
      )}
    </div>
  );

  const preview = (
    <InvoicePreview d={{
      kind: mode, number: ini.number, entityName: settings?.businessName || entityName, logoUrl: settings?.logoUrl || logoUrl, customerName: custName, customerEmail: custEmail,
      issueDate: isEst ? undefined : issueDate, dueDate: isEst ? undefined : effDue, validUntil: isEst ? validUntil : undefined, lines, totals, memo, footer, poNumber: po, schedule, amountPaid: ini.amountPaid,
    }} />
  );

  return (
    <Sheet title={title} onClose={onCancel} wide>
      <div className="sm:hidden flex gap-1 mb-4 p-1 bg-white/5 rounded-full" role="tablist">
        {(['edit', 'preview'] as const).map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`flex-1 py-2 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 ${view === v ? 'bg-small-orange text-black' : 'text-white/50'}`}>{v === 'edit' ? <Pencil size={11} /> : <Eye size={11} />}{v}</button>)}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className={view === 'preview' ? 'hidden sm:block' : ''}>{form}</div>
        <div className={`${view === 'edit' ? 'hidden sm:block' : ''} lg:sticky lg:top-12 self-start`}>{preview}</div>
      </div>

      {/* action bar */}
      <div className="sticky bottom-0 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 mt-6 px-5 sm:px-7 py-3 bg-zinc-950/95 backdrop-blur border-t border-white/10 flex flex-wrap items-center gap-2">
        <div className="mr-auto"><p className={label}>Total</p><p className="text-lg font-black text-white tabular-nums">{money(totals.total)}</p></div>
        {problem && <p className="w-full sm:w-auto text-[10px] text-amber-300 order-last sm:order-none" role="status">{problem}</p>}
        <button onClick={() => run('draft')} disabled={busy} className={btnGhost}><Busy on={busy}><Save size={12} /> Save draft</Busy></button>
        {!isEst && (
          <details className="relative"><summary className={btnGhost + ' list-none cursor-pointer'}><Clock size={12} /> Later</summary>
            <div className="absolute bottom-12 right-0 bg-zinc-900 border border-white/10 rounded-2xl p-3 w-64 space-y-2 z-20">
              <p className={label}>Send on</p><input type="datetime-local" value={sendLater} onChange={e => setSendLater(e.target.value)} className={fieldSm + ' w-full'} />
              <button onClick={() => run('later')} disabled={!sendLater || busy} className={btnPrimary + ' w-full'}>Schedule send</button></div></details>
        )}
        <button onClick={() => run('send')} disabled={busy || !!problem} className={btnPrimary}><Busy on={busy}><Send size={12} /> {isEst ? 'Send estimate' : 'Send now'}</Busy></button>
      </div>
    </Sheet>
  );
};

/** After "Send": every way to get it to the customer — link, QR, email status, Plajah inbox, PDF. */
const SendResult: React.FC<{ doc: Doc; entityName: string; customerEmail?: string; plajah: boolean; onDone: () => void }> = ({ doc: d, customerEmail, plajah, onDone }) => {
  const toast = useToast(); const inv = isInvoice(d);
  const url = inv ? (d as Invoice).hostedUrl || '' : estimateUrl(d as Estimate);
  const [qr, setQr] = useState(''); const [copied, setCopied] = useState(false);
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr).catch(() => {}); }, [url]);
  const pdf = async () => { try { window.open(await billingApi.invoicePdf((d as Invoice).entity, d.id), '_blank'); } catch (e: any) { toast(e?.message || 'PDF not ready yet.', { tone: 'bad' }); } };
  return (
    <Sheet title={inv ? 'Invoice sent' : 'Estimate sent'} onClose={onDone}>
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400"><Check size={22} /></div>
        <div><p className="text-sm font-black text-white">{(d as any).number || ''} · {money(d.total)}</p>
          <p className="text-[11px] text-white/50 mt-1">{customerEmail ? `Emailed to ${customerEmail}` : 'No email on file — share the link or QR below'}{plajah ? ' · also delivered to their Plajah inbox' : ''}.</p></div>
        {url ? (
          <>
            {qr && <img src={qr} alt={`QR code for ${inv ? 'invoice' : 'estimate'} link`} className="mx-auto w-44 h-44 rounded-2xl bg-white p-2" />}
            <input readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Link" className={field + ' text-center text-xs'} />
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={async () => { setCopied(await copyText(url)); }} className={btnPrimary}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}</button>
              <a href={url} target="_blank" rel="noreferrer" className={btnGhost}><ExternalLink size={12} /> Open</a>
              {inv && <button onClick={pdf} className={btnGhost}><Download size={12} /> PDF</button>}
              {typeof navigator !== 'undefined' && (navigator as any).share && <button onClick={() => (navigator as any).share({ title: (d as any).number, url }).catch(() => {})} className={btnGhost}>Share…</button>}
            </div>
          </>
        ) : <p className="text-[11px] text-white/40">The hosted link will appear on the invoice in a moment.</p>}
        <button onClick={onDone} className={btnGhost + ' w-full sm:w-auto'}>Done</button>
      </div>
    </Sheet>
  );
};
export default InvoiceComposer;
