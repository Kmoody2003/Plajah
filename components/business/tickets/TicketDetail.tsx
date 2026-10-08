// TicketDetail - one ticket: stage actions, lines editor, approvals, photos, notes, time log, deposits,
// timeline, customer link, and "Take payment" (opens the EXISTING RegisterTenderSheet; the sale itself runs
// through /api/store/pos-sale with ticketId so tax, tenders, drawer, loyalty and receipt are not duplicated).
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  allowedNext, canTransition, computeTicketTotals, stageById, stageKind, taxClassFor, lineGrossCents, minutesByTech, LINE_KINDS, partPriceFromCost,
  type Ticket, type TicketConfig, type TicketLine, type LineKind,
} from '../../../services/ticketCore';
import type { TicketApi, PayContext } from '../../../services/ticketService';
// Lazy: the tender sheet pulls in the stored-value/firebase graph; the board renders without it.
const RegisterTenderSheet = lazy(() => import('../../RegisterTenderSheet'));
import type { Tender } from '../../../services/tenderCore';
import { NO_TAX } from '../../../services/taxCore';
import { TicketPanels } from '../ticketPlugins';
import { detailPanels } from './panelRegistry';   // pack plug-in panels (cfg.panels), lazy-loaded

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(Math.max(0, c) / 100).toFixed(2)}`;
const toCents = (s: string) => { const v = Math.round(parseFloat(s) * 100); return Number.isFinite(v) ? v : 0; };
const APPROVAL_COLOR: Record<string, string> = { PENDING: '#FF8C00', APPROVED: '#06D6A0', DECLINED: '#D40055' };
const inp = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-white/30 w-full text-white';
const lbl = 'text-[10px] font-black uppercase tracking-widest text-white/40';

interface Props { api: TicketApi; cfg: TicketConfig; ticket: Ticket; onClose: () => void; onChanged: (t: Ticket) => void; canOverride?: boolean }

export default function TicketDetail({ api, cfg, ticket: initial, onClose, onChanged, canOverride = true }: Props) {
  const [t, setT] = useState<Ticket>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ctx, setCtx] = useState<PayContext | null>(null);
  const [link, setLink] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [newLine, setNewLine] = useState({ kind: 'SERVICE' as LineKind, description: '', qty: '1', price: '', cost: '' });
  const [note, setNote] = useState(''); const [noteInternal, setNoteInternal] = useState(true);
  const [dep, setDep] = useState({ amount: '', method: 'CASH' });
  const [override, setOverride] = useState<{ to: string; msg: string; pin: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tax = ctx?.tax ?? NO_TAX;
  const totals = useMemo(() => computeTicketTotals(t, cfg, tax), [t, cfg, tax]);
  const kind = stageKind(cfg, t.stage);
  const closed = kind === 'DONE' || kind === 'CANCELLED' || !!t.saleOrderId;
  const stage = stageById(cfg, t.stage);

  useEffect(() => { api.payContext(initial, 0).then(setCtx).catch(() => {}); api.link(initial.id).then(setLink).catch(() => {}); }, [api, initial]);

  const run = useCallback(async <T,>(fn: () => Promise<T>, after?: (r: T) => void) => {
    setBusy(true); setErr('');
    try { const r = await fn(); after?.(r); return r; }
    catch (e: any) { setErr(e?.message || 'Something went wrong.'); return undefined; }
    finally { setBusy(false); }
  }, []);
  const apply = (nt: Ticket) => { setT(nt); onChanged(nt); };

  const go = (to: string, force?: { pin?: string }) => run(() => api.transition(t.id, to, force ? { override: true, managerPin: force.pin } : {}), r => { apply(r.ticket); setOverride(null); }).then(undefined);
  const goClick = async (to: string) => {
    setBusy(true); setErr('');
    try { const r = await api.transition(t.id, to); apply(r.ticket); }
    catch (e: any) {
      if (String(e?.code || '').startsWith('OVERRIDABLE_') && canOverride) setOverride({ to, msg: e.message, pin: '' });
      else setErr(e?.message || 'Could not move the ticket.');
    } finally { setBusy(false); }
  };

  const addLine = () => {
    const price = toCents(newLine.price); if (!newLine.description.trim()) return setErr('Describe the line.');
    run(() => api.line(t.id, { op: 'add', line: { kind: newLine.kind, description: newLine.description, qty: parseFloat(newLine.qty) || 1, unitPriceCents: price, ...(newLine.cost ? { costCents: toCents(newLine.cost) } : {}), ...(newLine.kind === 'BY_WEIGHT' ? { unit: 'lb' } : {}) } }), nt => { apply(nt); setNewLine({ ...newLine, description: '', price: '', cost: '' }); });
  };
  const addTemplate = (key: string) => {
    const tpl = cfg.lineTemplates?.find(x => x.key === key); if (!tpl) return;
    run(() => api.line(t.id, { op: 'add', line: { kind: tpl.kind, description: tpl.label, qty: tpl.qty ?? 1, unitPriceCents: tpl.unitPriceCents, costCents: tpl.costCents, unit: tpl.unit, taxClass: tpl.taxClass } }), apply);
  };
  const editLine = (l: TicketLine, patch: Partial<{ qty: number; unitPriceCents: number; description: string }>) => run(() => api.line(t.id, { op: 'edit', lineId: l.id, line: patch }), apply);
  const photo = async (f?: File | null) => {
    if (!f) return;
    await run(async () => { const url = await api.uploadPhoto(f, t.id); return api.update(t.id, { attachment: { url, kind: f.type.startsWith('video') ? 'video' : 'image', name: f.name } }); }, apply);
    if (fileRef.current) fileRef.current.value = '';
  };

  const taxLines = t.lines.filter(l => l.approval === 'APPROVED').map(l => ({ grossCents: lineGrossCents(l), taxClass: taxClassFor(cfg, l) }));
  const subtotal = taxLines.reduce((n, l) => n + l.grossCents, 0);
  const pay = async (tenders: Tender[], tipCents: number, ageVerified: boolean) => {
    setBusy(true); setErr('');
    try {
      const out = await api.pay(t, { tenders, tipCents, ageVerified });
      setPayOpen(false); setReceipt(`Paid ${money(out.paidCents)}. Order ${out.orderId.slice(-8)}.`);
      const fresh = await api.get(t.id); apply(fresh.ticket);
    } catch (e: any) { setErr(e?.message || 'Payment failed.'); } finally { setBusy(false); }
  };
  const next = allowedNext(cfg, t.stage).map(id => stageById(cfg, id)!).filter(Boolean);
  const mins = minutesByTech(t);
  const running = t.timeLog.some(e => !e.endedAt);

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Ticket ${t.number}`}>
      <div className="w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a]/95 backdrop-blur-xl border border-white/10 text-white p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl font-black italic uppercase leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>{t.number}</div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full" style={{ background: GRAD }}>{stage?.label}</span>
              <span className="text-sm font-bold">{t.customer.name}</span>
              {t.customer.phone && <span className="text-xs text-white/50">{t.customer.phone}</span>}
              {t.customer.email && <span className="text-xs text-white/50">{t.customer.email}</span>}
            </div>
            <div className="text-xs text-white/50 mt-1">
              {cfg.subjectFields.filter(f => t.subject[f.id] !== undefined && !f.hidden).map(f => `${f.label}: ${Array.isArray(t.subject[f.id]) ? (t.subject[f.id] as string[]).join(', ') : t.subject[f.id]}`).join('  ·  ')}
            </div>
          </div>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Close</button>
        </div>

        {err && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8]">{err}</div>}
        {receipt && <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">{receipt}</div>}

        {/* Stage actions */}
        {!closed && (
          <div className="flex flex-wrap gap-2">
            {next.map(s => (
              <button key={s.id} disabled={busy} onClick={() => goClick(s.id)}
                className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest ${s.kind === 'CANCELLED' ? 'bg-white/5 text-white/50 hover:text-[#ff7aa8]' : 'text-white'} disabled:opacity-40`}
                style={s.kind === 'CANCELLED' ? undefined : { background: GRAD }}>
                {s.kind === 'AWAITING_APPROVAL' ? 'Send estimate' : s.kind === 'CANCELLED' ? 'Cancel' : s.label}{s.notify ? ' · notifies' : ''}
              </button>
            ))}
          </div>
        )}
        {override && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 space-y-2">
            <div className="text-sm font-bold text-amber-200">{override.msg} Owner/manager override?</div>
            <div className="flex gap-2">
              <input value={override.pin} onChange={e => setOverride({ ...override, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="Manager PIN (not needed for owner)" inputMode="numeric" className={inp} />
              <button disabled={busy} onClick={() => go(override.to, { pin: override.pin })} className="shrink-0 px-4 rounded-lg bg-amber-400 text-black text-xs font-black uppercase">Override</button>
              <button onClick={() => setOverride(null)} className="shrink-0 px-3 rounded-lg bg-white/10 text-xs font-bold">No</button>
            </div>
          </div>
        )}

        {/* Pack plug-in panels (e.g. auto repair: vehicle, inspection, passport) */}
        {(cfg.panels || []).map(id => { const P = detailPanels[id]; return P ? <Suspense key={id} fallback={null}><P api={api} cfg={cfg} ticket={t} closed={closed} onChanged={apply} /></Suspense> : null; })}

        {/* Lines */}
        <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between"><div className={lbl}>Lines</div>{totals.pendingCount > 0 && cfg.requireApproval && <span className="text-[10px] font-black uppercase text-[#FF8C00]">{totals.pendingCount} awaiting approval</span>}</div>
          {t.lines.length === 0 && <div className="text-sm text-white/40 py-2">No lines yet. Add labor, parts or services below.</div>}
          {t.lines.map(l => (
            <div key={l.id} className="rounded-xl bg-white/5 p-2.5 space-y-1.5" data-testid="ticket-line">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{l.description}</div>
                  <div className="text-[11px] text-white/40">{l.kind.replace('_', ' ').toLowerCase()}{l.technicianName ? ` · ${l.technicianName}` : ''}{l.costCents !== undefined ? ` · cost ${money(l.costCents)}` : ''}</div>
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full" style={{ color: APPROVAL_COLOR[l.approval], background: APPROVAL_COLOR[l.approval] + '22' }}>{l.approval.toLowerCase()}</span>
                <div className="text-sm font-black w-20 text-right">{money(lineGrossCents(l))}</div>
              </div>
              {!closed && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <label className="flex items-center gap-1 text-white/50">Qty <input defaultValue={l.qty} onBlur={e => { const v = parseFloat(e.target.value); if (v > 0 && v !== l.qty) editLine(l, { qty: v }); }} inputMode="decimal" className={inp + ' !w-16'} aria-label="Quantity" /></label>
                  <label className="flex items-center gap-1 text-white/50">Price <input defaultValue={(l.unitPriceCents / 100).toFixed(2)} onBlur={e => { const v = toCents(e.target.value); if (v !== l.unitPriceCents) editLine(l, { unitPriceCents: v }); }} inputMode="decimal" className={inp + ' !w-20'} aria-label="Unit price" /></label>
                  {cfg.requireApproval && l.approval === 'PENDING' && <>
                    <button onClick={() => run(() => api.line(t.id, { op: 'decide', decisions: { [l.id]: 'APPROVED' } }), apply)} className="px-2.5 py-1 rounded-full bg-emerald-400/15 text-emerald-300 font-black uppercase text-[10px]" title="Customer approved by phone / in person">Approved verbally</button>
                    <button onClick={() => run(() => api.line(t.id, { op: 'decide', decisions: { [l.id]: 'DECLINED' } }), apply)} className="px-2.5 py-1 rounded-full bg-[#D40055]/15 text-[#ff7aa8] font-black uppercase text-[10px]">Declined</button>
                  </>}
                  <button onClick={() => run(() => api.line(t.id, { op: 'remove', lineId: l.id }), apply)} className="ml-auto px-2 py-1 text-white/40 hover:text-[#ff7aa8]" aria-label="Remove line">x</button>
                </div>
              )}
            </div>
          ))}
          {!closed && (
            <div className="space-y-2 pt-1">
              {!!cfg.lineTemplates?.length && <div className="flex gap-1.5 flex-wrap">{cfg.lineTemplates.map(x => <button key={x.key} onClick={() => addTemplate(x.key)} className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold">+ {x.label}</button>)}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-[110px_1fr_70px_90px_90px_auto] gap-2 items-center">
                <select value={newLine.kind} onChange={e => setNewLine({ ...newLine, kind: e.target.value as LineKind })} className={inp} aria-label="Line type">{LINE_KINDS.map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select>
                <input value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })} placeholder="Description" className={inp + ' col-span-2 sm:col-span-1'} />
                <input value={newLine.qty} onChange={e => setNewLine({ ...newLine, qty: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Qty" inputMode="decimal" className={inp} aria-label="New line quantity" />
                <input value={newLine.price} onChange={e => setNewLine({ ...newLine, price: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Price $" inputMode="decimal" className={inp} aria-label="New line price" />
                <input value={newLine.cost} onChange={e => setNewLine({ ...newLine, cost: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Cost $" inputMode="decimal" className={inp} aria-label="New line cost" />
                <button disabled={busy} onClick={addLine} className="px-4 py-2 rounded-lg text-xs font-black uppercase text-white disabled:opacity-40" style={{ background: GRAD }}>Add</button>
              </div>
              {newLine.kind === 'PART' && newLine.cost && cfg.partsMarkupPct ? (
                <button onClick={() => setNewLine({ ...newLine, price: (partPriceFromCost(toCents(newLine.cost), cfg.partsMarkupPct!) / 100).toFixed(2) })} className="text-[11px] font-bold text-[#FF8C00]">Price at cost + {cfg.partsMarkupPct}% = {money(partPriceFromCost(toCents(newLine.cost), cfg.partsMarkupPct))}</button>
              ) : null}
            </div>
          )}
        </section>

        {/* Pack plug-in panels (cfg.ui.detailPanels): weigh-in, bag tags, delivery, account, pickup for laundry */}
        <TicketPanels ids={cfg.ui?.detailPanels} api={api} cfg={cfg} ticket={t} apply={apply} closed={closed} />

        {/* Totals */}
        <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 text-sm space-y-1">
          {cfg.requireApproval && totals.pendingCount > 0 && <div className="flex justify-between text-white/60"><span>Estimate (incl. pending)</span><span>{money(totals.estimate.totalCents)}</span></div>}
          <div className="flex justify-between text-white/60"><span>Approved subtotal</span><span>{money(totals.approved.subtotalCents)}</span></div>
          <div className="flex justify-between text-white/60"><span>Tax</span><span>{money(totals.approved.taxCents)}</span></div>
          {totals.depositsCents > 0 && <div className="flex justify-between text-emerald-300"><span>Deposits</span><span>-{money(totals.depositsCents)}</span></div>}
          <div className="flex justify-between text-xl font-black pt-1"><span>{t.saleOrderId ? 'Paid' : 'Balance due'}</span><span>{t.saleOrderId ? money(t.paidCents || 0) : money(totals.balanceCents)}</span></div>
          {totals.excessDepositCents > 0 && <div className="text-xs text-amber-300">Deposits exceed the approved total by {money(totals.excessDepositCents)}: refund the difference.</div>}
          {!closed && totals.approvedCount > 0 && (
            <button disabled={busy} onClick={() => run(() => api.payContext(t, subtotal), c => { setCtx(c); setPayOpen(true); })} className="w-full mt-2 py-3 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ background: GRAD }}>Take payment</button>
          )}
          {t.saleOrderId && <div className="text-[11px] text-white/40">Sale {t.saleOrderId}. Refunds are done from the register against that order; the ticket stays closed.</div>}
        </section>

        <div className="grid sm:grid-cols-2 gap-3">
          {/* Photos */}
          <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between"><div className={lbl}>Photos &amp; video</div>
              <button disabled={busy || closed} onClick={() => fileRef.current?.click()} className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">Add</button>
              <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={e => photo(e.target.files?.[0])} aria-label="Upload photo" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {t.attachments.map(a => (
                <div key={a.id} className="relative aspect-square rounded-lg overflow-hidden bg-black/40">
                  {a.kind === 'video' ? <video src={a.url} className="w-full h-full object-cover" /> : <img src={a.url} alt={a.name || 'attachment'} className="w-full h-full object-cover" />}
                  <button onClick={() => run(() => api.update(t.id, { removeAttachmentId: a.id }), apply)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-[10px]" aria-label="Remove attachment">x</button>
                </div>
              ))}
              {!t.attachments.length && <div className="col-span-3 text-xs text-white/40">Customers see photos on their approval page.</div>}
            </div>
          </section>

          {/* Customer link + chat + deposit */}
          <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
            <div className={lbl}>Customer</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={async () => { const l = link || await api.link(t.id); setLink(l); try { await navigator.clipboard?.writeText(l); setReceipt('Customer link copied.'); } catch { setReceipt(l); } }} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold">Copy approval link</button>
              <button onClick={async () => { const l = await api.link(t.id, true); setLink(l); setReceipt('New link created. The old one no longer works.'); }} className="px-3 py-1.5 rounded-full bg-white/5 text-[11px] font-bold text-white/50">Revoke &amp; renew</button>
              {t.customer.uid && <button onClick={() => window.dispatchEvent(new CustomEvent('START_CHAT', { detail: { userId: t.customer.uid } }))} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold">Open chat</button>}
            </div>
            {!closed && <div className="flex gap-2 items-center pt-1">
              <input value={dep.amount} onChange={e => setDep({ ...dep, amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Deposit $" inputMode="decimal" className={inp} aria-label="Deposit amount" />
              <select value={dep.method} onChange={e => setDep({ ...dep, method: e.target.value })} className={inp + ' !w-24'} aria-label="Deposit method"><option>CASH</option><option>CARD</option><option>CHECK</option><option>OTHER</option></select>
              <button disabled={busy || !dep.amount} onClick={() => run(() => api.deposit(t.id, toCents(dep.amount), dep.method), nt => { apply(nt); setDep({ ...dep, amount: '' }); })} className="shrink-0 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase disabled:opacity-40">Record</button>
            </div>}
            {t.deposits.map(d => <div key={d.id} className="text-xs text-white/50 flex justify-between"><span>{d.method} deposit · {new Date(d.at).toLocaleDateString()}</span><span>{money(d.amountCents)}</span></div>)}
          </section>
        </div>

        {/* Time log */}
        <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-1.5">
          <div className="flex items-center justify-between"><div className={lbl}>Time log</div>
            {!closed && <button disabled={busy} onClick={() => run(() => api.update(t.id, { timer: running ? 'stop' : 'start' }), apply)} className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">{running ? 'Stop my timer' : 'Start my timer'}</button>}
          </div>
          {Object.entries(mins).map(([id, m]) => <div key={id} className="text-xs text-white/60 flex justify-between"><span>{m.name}</span><span>{(m.minutes / 60).toFixed(2)} h</span></div>)}
          {!t.timeLog.length && <div className="text-xs text-white/40">No time logged.</div>}
        </section>

        {/* Notes */}
        <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
          <div className={lbl}>Notes</div>
          {t.notes.map(n => <div key={n.id} className={`text-sm rounded-lg px-2.5 py-1.5 ${n.internal ? 'bg-white/5' : 'bg-[#6B0099]/25'}`}><span className="text-[9px] font-black uppercase tracking-widest text-white/40 mr-2">{n.internal ? 'internal' : 'customer sees'}</span>{n.text}</div>)}
          <div className="flex gap-2">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note" className={inp} />
            <label className="shrink-0 flex items-center gap-1 text-[11px] text-white/50"><input type="checkbox" checked={noteInternal} onChange={e => setNoteInternal(e.target.checked)} className="accent-[#D40055]" />Internal</label>
            <button disabled={busy || !note.trim()} onClick={() => run(() => api.update(t.id, { note: { text: note, internal: noteInternal } }), nt => { apply(nt); setNote(''); })} className="shrink-0 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase disabled:opacity-40">Add</button>
          </div>
        </section>

        {/* Approvals + timeline */}
        {t.approvals.length > 0 && (
          <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-1.5">
            <div className={lbl}>Approval records</div>
            {t.approvals.map((a, i) => <div key={i} className="text-xs text-white/60">{new Date(a.at).toLocaleString()} · {a.decision.toLowerCase()} {a.lineIds.length} line(s) · {a.via === 'LINK' ? `customer link (IP ${a.ip})` : `staff${a.by ? ` (${a.by})` : ''}`}</div>)}
          </section>
        )}
        <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-1.5">
          <div className={lbl}>Timeline</div>
          {[...t.audit].reverse().slice(0, 40).map((e, i) => (
            <div key={i} className="text-xs text-white/60 flex gap-2"><span className="text-white/30 shrink-0 w-32">{new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <span><b className="text-white/80">{e.by}</b> {e.type === 'TRANSITION' || e.type === 'OVERRIDE' ? `${stageById(cfg, e.from || '')?.label || e.from} → ${stageById(cfg, e.to || '')?.label || e.to}` : e.type.toLowerCase()}{e.detail ? ` · ${e.detail}` : ''}</span></div>
          ))}
        </section>
      </div>

      {payOpen && (
        <Suspense fallback={null}><RegisterTenderSheet lines={taxLines} discountCents={ctx?.discountCents ?? 0} settings={tax} tipPresets={ctx?.tipPresets} creditCents={totals.depositsCents}
          customerUid={t.customer.uid} busy={busy} error={err} onCancel={() => setPayOpen(false)} onConfirm={pay} /></Suspense>
      )}
    </div>,
    document.body,
  );
}
