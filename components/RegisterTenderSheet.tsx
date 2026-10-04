// RegisterTenderSheet - the payment step of the register. Split tenders (cash, card on the merchant's
// own terminal, EBT/external terminal, check, other), tip, age-verify gate, and the live SNAP guidance.
//
// EBT is "connected mode": Plajah never sees a card or PIN. The cashier swipes on the merchant's own
// SNAP-authorised terminal and types the approval reference (+ optional remaining balance) here.
// All amounts are re-validated SERVER-side (/api/store/pos-sale); this sheet only mirrors the pure
// cores (taxCore / ebtCore / tenderCore) so the numbers the cashier sees are the numbers that post.

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeTax, taxLabel, type TaxLineIn, type TaxSettings } from '../services/taxCore';
import { ebtGuidance } from '../services/ebtCore';
import BarcodeScanner from './inventory/BarcodeScanner';
import { codeFromScan } from '../services/storedValueCore';
import { svBalance } from '../services/registerService';
import { validateTenders, tipFromPercent, sanitizeTip, type Tender, type ExternalKind } from '../services/tenderCore';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const toCents = (s: string) => { const v = Math.round(parseFloat(s) * 100); return Number.isFinite(v) ? v : 0; };
const fromCents = (c: number) => (Math.max(0, c) / 100).toFixed(2);

type DraftType = 'CASH' | 'CARD' | 'EXTERNAL' | 'GIFT' | 'STORE_CREDIT' | 'WALLET';
interface Draft { id: number; type: DraftType; kind: ExternalKind; amount: string; tendered: string; reference: string; balance: string; code?: string; note?: string }

interface Props {
  lines: TaxLineIn[];
  discountCents: number;
  settings: TaxSettings;
  tipPresets?: number[];
  ageMin?: number;
  /** Gift cards on the ticket (liability line): added to what is due, untaxed, and cannot be paid with stored value. */
  giftCents?: number;
  businessUid?: string;
  /** Already-collected credit (ticket deposits) subtracted from what is due. Server recomputes it; this only mirrors it. */
  creditCents?: number;
  /** Attached Plajah customer: enables the Wallet tender and their store credit. */
  customerUid?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (tenders: Tender[], tipCents: number, ageVerified: boolean) => void;
}

let nextId = 1;

export default function RegisterTenderSheet({ lines, discountCents, settings, tipPresets = [15, 18, 20], ageMin = 0, giftCents = 0, creditCents = 0, businessUid, customerUid, busy, error, onCancel, onConfirm }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tipStr, setTipStr] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [scanFor, setScanFor] = useState<number | null>(null);

  const guidance = useMemo(() => ebtGuidance(lines, settings, discountCents), [lines, settings, discountCents]);
  const snapRequested = drafts.filter(d => d.type === 'EXTERNAL' && d.kind === 'EBT_SNAP').reduce((n, d) => n + Math.max(0, toCents(d.amount)), 0);
  // Tax drops live as SNAP is entered (SNAP-covered eligible items are untaxed).
  const taxed = useMemo(() => computeTax(lines, settings, { discountCents, snapCents: snapRequested }), [lines, settings, discountCents, snapRequested]);
  const tipCents = sanitizeTip(toCents(tipStr));
  const dueCents = taxed.totalCents + tipCents + giftCents - Math.min(creditCents, taxed.totalCents);
  const paid = drafts.reduce((n, d) => n + Math.max(0, toCents(d.amount)), 0);
  const remaining = dueCents - paid;

  const asTenders = (): Tender[] => drafts.map(d => {
    const amountCents = toCents(d.amount);
    if (d.type === 'CASH') return { type: 'CASH', amountCents, tenderedCents: d.tendered ? toCents(d.tendered) : amountCents };
    if (d.type === 'CARD') return { type: 'CARD', amountCents, ...(d.reference ? { reference: d.reference } : {}) };
    if (d.type === 'GIFT' || d.type === 'STORE_CREDIT' || d.type === 'WALLET') return { type: d.type, amountCents, ...(d.code ? { code: d.code } : {}) };
    return { type: 'EXTERNAL', kind: d.kind, amountCents, reference: d.reference, ...(d.balance !== '' ? { balanceCents: toCents(d.balance) } : {}) };
  });
  const check = validateTenders(asTenders(), dueCents, { snapMaxCents: guidance.snapMaxCents, storedValueMaxCents: dueCents - giftCents });
  const canCharge = check.ok && !busy && (ageMin <= 0 || ageOk);

  const add = (type: DraftType, kind: ExternalKind = 'EBT_SNAP') => {
    setDrafts(ds => {
      let amountCents = Math.max(0, remaining);
      if (type === 'EXTERNAL' && kind === 'EBT_SNAP') {
        const used = ds.filter(d => d.type === 'EXTERNAL' && d.kind === 'EBT_SNAP').reduce((n, d) => n + toCents(d.amount), 0);
        amountCents = Math.max(0, guidance.snapMaxCents - used);
      }
      return [...ds, { id: nextId++, type, kind, amount: fromCents(amountCents), tendered: '', reference: '', balance: '' }];
    });
  };
  const checkCode = async (d: Draft) => {
    const c = codeFromScan(d.code || '');
    if (!c || !businessUid) { patch(d.id, { note: 'Not a valid card code.' }); return; }
    try {
      const r = await svBalance(businessUid, c);
      const take = Math.min(r.balanceCents, Math.max(0, remaining + toCents(d.amount)));
      patch(d.id, { code: c, note: `Balance ${money(r.balanceCents)}`, amount: fromCents(take) });
    } catch (e: any) { patch(d.id, { note: e?.code === 'RATE' ? 'Too many tries - wait a few minutes.' : 'Invalid card.' }); }
  };
  const patch = (id: number, p: Partial<Draft>) => setDrafts(ds => ds.map(d => (d.id === id ? { ...d, ...p } : d)));
  const fillRemaining = (id: number) => setDrafts(ds => ds.map(d => (d.id === id ? { ...d, amount: fromCents(Math.max(0, toCents(d.amount) + remaining)) } : d)));

  const tipBase = taxed.totalCents - taxed.taxCents;
  const inp = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-white/30 w-full';

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Take payment">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a] border border-white/10 text-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-black italic" style={{ fontFamily: 'Outfit, sans-serif' }}>Take payment</div>
          <button onClick={onCancel} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Back</button>
        </div>

        {ageMin > 0 && (
          <label className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 cursor-pointer">
            <input type="checkbox" checked={ageOk} onChange={e => setAgeOk(e.target.checked)} className="mt-1 accent-amber-400" />
            <span className="text-sm font-bold text-amber-200">Verify ID - customer must be {ageMin}+. I checked a valid photo ID.</span>
          </label>
        )}

        {guidance.hasEligible && (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200" data-testid="ebt-guidance">
            {guidance.message}
            <div className="text-[11px] font-medium text-emerald-200/70 mt-0.5">SNAP covers eligible items only, never tax or tip.</div>
          </div>
        )}

        <div className="rounded-xl bg-white/5 p-3 space-y-1 text-sm">
          <div className="flex justify-between text-white/60"><span>Subtotal</span><span>{money(taxed.subtotalCents)}</span></div>
          {taxed.discountCents > 0 && <div className="flex justify-between text-emerald-300"><span>Discounts</span><span>-{money(taxed.discountCents)}</span></div>}
          {(taxed.taxCents > 0 || settings.defaultRateBps > 0) && <div className="flex justify-between text-white/60"><span>{taxLabel(settings, taxed.lines)}</span><span>{money(taxed.taxCents)}</span></div>}
          {snapRequested > 0 && taxed.snapCoveredCents > 0 && <div className="text-[11px] text-emerald-300">SNAP-paid eligible items: no tax</div>}
          {tipCents > 0 && <div className="flex justify-between text-white/60"><span>Tip</span><span>{money(tipCents)}</span></div>}
          {giftCents > 0 && <div className="flex justify-between text-white/60"><span>Gift cards (no tax)</span><span>{money(giftCents)}</span></div>}
          {creditCents > 0 && <div className="flex justify-between text-emerald-300"><span>Deposit applied</span><span>-{money(Math.min(creditCents, taxed.totalCents))}</span></div>}
          <div className="flex justify-between text-xl font-black pt-1"><span>Due</span><span>{money(dueCents)}</span></div>
        </div>

        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Tip (optional)</div>
          <div className="flex gap-1.5">
            {tipPresets.map(p => <button key={p} onClick={() => setTipStr(fromCents(tipFromPercent(tipBase, p)))} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold">{p}%</button>)}
            <button onClick={() => setTipStr('')} className="px-3 py-1.5 rounded-full bg-white/5 text-xs font-bold text-white/50">None</button>
            <input value={tipStr} onChange={e => setTipStr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="$ custom" inputMode="decimal" className={inp + ' !w-24 ml-auto'} aria-label="Custom tip" />
          </div>
        </div>

        <div className="space-y-2">
          {drafts.map(d => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-2.5 space-y-2" data-testid={`tender-${d.type}`}>
              <div className="flex items-center gap-2">
                {d.type === 'EXTERNAL' ? (
                  <select value={d.kind} onChange={e => patch(d.id, { kind: e.target.value as ExternalKind })} className={inp + ' !w-auto font-bold'} aria-label="External tender type">
                    <option value="EBT_SNAP">EBT SNAP</option><option value="EBT_CASH">EBT Cash</option><option value="CHECK">Check</option><option value="OTHER">Other</option>
                  </select>
                ) : <div className="text-sm font-black">{({ CASH: 'Cash', CARD: 'Card (your terminal)', GIFT: 'Gift card', STORE_CREDIT: 'Store credit', WALLET: 'Wallet' } as Record<string, string>)[d.type]}</div>}
                <input value={d.amount} onChange={e => patch(d.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" className={inp + ' text-right font-black'} aria-label="Tender amount" />
                <button onClick={() => fillRemaining(d.id)} className="shrink-0 text-[10px] font-black uppercase px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" title="Put whatever remains on this tender">Rest</button>
                <button onClick={() => setDrafts(ds => ds.filter(x => x.id !== d.id))} className="shrink-0 text-white/40 hover:text-white px-1" aria-label="Remove tender">x</button>
              </div>
              {d.type === 'CASH' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Handed over</span>
                  <input value={d.tendered} onChange={e => patch(d.id, { tendered: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="exact" className={inp + ' !w-24'} />
                  {d.tendered && toCents(d.tendered) > toCents(d.amount) && <span className="font-black text-amber-300">Change {money(toCents(d.tendered) - toCents(d.amount))}</span>}
                </div>
              )}
              {(d.type === 'GIFT' || d.type === 'STORE_CREDIT') && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input value={d.code || ''} onChange={e => patch(d.id, { code: e.target.value.toUpperCase(), note: '' })} placeholder={d.type === 'GIFT' ? 'Card code' : customerUid ? 'Card code (blank = customer credit)' : 'Credit card code'} aria-label="Card code" className={inp + ' font-mono'} />
                    <button onClick={() => setScanFor(d.id)} className="shrink-0 text-[10px] font-black uppercase px-2.5 rounded-lg bg-white/10 hover:bg-white/20">Scan</button>
                    <button onClick={() => checkCode(d)} disabled={!d.code} className="shrink-0 text-[10px] font-black uppercase px-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30">Check</button>
                  </div>
                  {d.note && <div className="text-[11px] font-bold text-emerald-300">{d.note}</div>}
                </div>
              )}
              {d.type === 'WALLET' && <div className="text-[11px] text-white/50">Paid from the attached customer's wallet. Declines if the balance is too low.</div>}
              {d.type === 'CARD' && <input value={d.reference} onChange={e => patch(d.id, { reference: e.target.value })} placeholder="Approval code / last 4 (optional)" className={inp} />}
              {d.type === 'EXTERNAL' && (
                <div className="space-y-1.5">
                  {(d.kind === 'EBT_SNAP' || d.kind === 'EBT_CASH') && <div className="text-[11px] text-white/50">Swipe on your own EBT terminal, then type what it prints. Plajah never sees the card or PIN.</div>}
                  <div className="flex gap-2">
                    <input value={d.reference} onChange={e => patch(d.id, { reference: e.target.value })} placeholder={d.kind.startsWith('EBT') ? 'Approval reference (required)' : 'Reference / check # (optional)'} className={inp} aria-label="Approval reference" />
                    {d.kind.startsWith('EBT') && <input value={d.balance} onChange={e => patch(d.id, { balance: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Balance left $" inputMode="decimal" className={inp + ' !w-32'} aria-label="Remaining benefit balance" />}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => add('CASH')} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">+ Cash</button>
            <button onClick={() => add('CARD')} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">+ Card</button>
            <button onClick={() => add('GIFT')} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">+ Gift card</button>
            <button onClick={() => add('STORE_CREDIT')} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">+ Store credit</button>
            {customerUid && <button onClick={() => add('WALLET')} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">+ Wallet</button>}
            <button onClick={() => add('EXTERNAL', guidance.hasEligible ? 'EBT_SNAP' : 'EBT_CASH')} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">+ EBT / external terminal</button>
          </div>
        </div>

        <div className="flex justify-between text-sm font-bold">
          <span className="text-white/50">{remaining > 0 ? 'Remaining' : remaining < 0 ? 'Over by' : 'Fully covered'}</span>
          <span className={remaining === 0 ? 'text-emerald-300' : 'text-amber-300'}>{remaining === 0 ? money(0) : money(Math.abs(remaining))}</span>
        </div>
        {drafts.length > 0 && check.ok === false && remaining === 0 && <div className="text-[11px] text-red-300 font-bold">{check.error}</div>}
        {drafts.length > 0 && check.ok === false && remaining !== 0 && drafts.some(d => d.type === 'EXTERNAL' && d.kind === 'EBT_SNAP') && toCents(drafts.find(d => d.kind === 'EBT_SNAP')?.amount || '0') > guidance.snapMaxCents && <div className="text-[11px] text-red-300 font-bold">{check.error}</div>}
        {error && <div className="text-[12px] text-red-400 font-bold">{error}</div>}

        <button disabled={!canCharge} onClick={() => check.ok && onConfirm(check.tenders, tipCents, ageMin > 0 ? ageOk : false)}
          className="w-full py-3.5 rounded-2xl font-black text-white disabled:opacity-30" style={{ background: GRAD }}>
          {busy ? 'Recording sale...' : `Complete sale - ${money(dueCents)}`}
        </button>
      </div>
      {scanFor !== null && <BarcodeScanner title="Scan card" hint="Scan the QR on the card" onDetect={c => { const id = scanFor; setScanFor(null); const d = drafts.find(x => x.id === id); if (d) { patch(id, { code: codeFromScan(c) || c }); } }} onClose={() => setScanFor(null)} />}
    </div>,
    document.body,
  );
}
