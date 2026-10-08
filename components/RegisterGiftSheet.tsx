// RegisterGiftSheet - register-side stored value: SELL a gift card (adds a liability line to the ticket),
// CHECK a balance (type or scan the card QR), RELOAD a customer's wallet. Money rules are enforced SERVER-side
// (/api/stored-value/*, /api/store/pos-sale); this sheet only collects input and mirrors the limits.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import BarcodeScanner from './inventory/BarcodeScanner';
import { codeFromScan, GIFT_PRESETS_CENTS, DEFAULT_LIMITS, CARD_KIND_LABEL } from '../services/storedValueCore';
import { svBalance, svCustomer, svReload, type GiftLineIn } from '../services/registerService';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const toCents = (s: string) => { const v = Math.round(parseFloat(s) * 100); return Number.isFinite(v) ? v : 0; };
const inp = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-white/30 w-full';

export type GiftSheetMode = 'SELL' | 'BALANCE' | 'RELOAD';
interface Props {
  mode: GiftSheetMode; businessUid: string; token?: string | null;
  customer?: { uid: string; name: string } | null;
  onAddGift?: (g: GiftLineIn) => void;
  onClose: () => void;
}

export default function RegisterGiftSheet({ mode: initial, businessUid, token, customer, onAddGift, onClose }: Props) {
  const [mode, setMode] = useState<GiftSheetMode>(initial);
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [msg, setMsg] = useState('');
  const [code, setCode] = useState(''); const [scan, setScan] = useState(false);
  const [info, setInfo] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [cust, setCust] = useState<{ wallet: number | null; credit: number | null } | null>(null);
  const [payType, setPayType] = useState<'CASH' | 'CARD'>('CASH');

  useEffect(() => {
    if (!customer) { setCust(null); return; }
    svCustomer(businessUid, customer.uid, token).then(r => setCust({ wallet: r.wallet ? r.wallet.balanceCents : null, credit: r.credit ? r.credit.balanceCents : null })).catch(() => setCust(null));
  }, [customer?.uid, businessUid, token, info]);

  const cents = toCents(amount);
  const check = async (raw: string) => {
    setErr(''); setInfo('');
    const c = codeFromScan(raw);
    if (!c) { setErr('That is not a valid card code - check it and try again.'); return; }
    setBusy(true);
    try { const r = await svBalance(businessUid, c); setInfo(`${CARD_KIND_LABEL[r.kind]} ...${r.last4}: ${money(r.balanceCents)} left`); }
    catch (e: any) { setErr(e?.code === 'RATE' ? 'Too many tries - wait a few minutes.' : 'Invalid card.'); }
    finally { setBusy(false); }
  };

  const tab = (m: GiftSheetMode, label: string) => (
    <button key={m} onClick={() => { setMode(m); setErr(''); setInfo(''); }} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${mode === m ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}>{label}</button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[210] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Gift cards and wallets">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a] border border-white/10 text-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-black italic" style={{ fontFamily: 'Outfit, sans-serif' }}>Gift cards &amp; wallets</div>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Close</button>
        </div>
        <div className="flex gap-1.5">{tab('SELL', 'Sell card')}{tab('BALANCE', 'Check balance')}{tab('RELOAD', 'Reload wallet')}</div>

        {mode === 'SELL' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {GIFT_PRESETS_CENTS.map(p => <button key={p} onClick={() => setAmount((p / 100).toFixed(2))} className={`px-3 py-2 rounded-xl text-xs font-black ${cents === p ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>{money(p)}</button>)}
            </div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Custom amount $" aria-label="Gift card amount" className={inp} />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Recipient name (optional)" className={inp} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email the card to (optional)" inputMode="email" className={inp} />
            <input value={msg} onChange={e => setMsg(e.target.value.slice(0, 300))} placeholder="Message (optional)" className={inp} />
            <div className="text-[11px] text-white/50">A gift card is not taxed and is not sales revenue until it is spent. The code prints / shows once after payment.</div>
            {cents > 0 && cents < DEFAULT_LIMITS.minIssueGiftCents && <div className="text-[11px] text-amber-300 font-bold">Minimum is {money(DEFAULT_LIMITS.minIssueGiftCents)} (owner can change it).</div>}
            <button disabled={cents < DEFAULT_LIMITS.minIssueGiftCents} onClick={() => { onAddGift?.({ amountCents: cents, ...(email.trim() ? { recipientEmail: email.trim() } : {}), ...(name.trim() ? { recipientName: name.trim() } : {}), ...(msg.trim() ? { message: msg.trim() } : {}) }); onClose(); }}
              className="w-full py-3 rounded-2xl font-black text-white disabled:opacity-30" style={{ background: GRAD }}>Add {cents > 0 ? money(cents) : ''} gift card to ticket</button>
          </div>
        )}

        {mode === 'BALANCE' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Card code" className={inp + ' font-mono tracking-wider'} />
              <button onClick={() => setScan(true)} className="shrink-0 px-3 rounded-xl text-white text-[10px] font-black" style={{ background: GRAD }}>Scan</button>
            </div>
            <button disabled={!code.trim() || busy} onClick={() => check(code)} className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase disabled:opacity-30">{busy ? 'Checking...' : 'Check balance'}</button>
            {info && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-black text-emerald-200">{info}</div>}
            {err && <div className="text-xs text-red-300 font-bold">{err}</div>}
          </div>
        )}

        {mode === 'RELOAD' && (
          <div className="space-y-2">
            {!customer ? <div className="text-sm text-amber-300 font-bold">Attach the customer to the ticket first (Customer box on the register) - wallets belong to a Plajah account.</div> : (
              <>
                <div className="text-sm font-bold">{customer.name}'s wallet: {cust && cust.wallet !== null ? money(cust.wallet) : 'not opened yet (the first reload opens it)'}</div>
                <div className="flex flex-wrap gap-1.5">{[1000, 2000, 5000, 10000].map(p => <button key={p} onClick={() => setAmount((p / 100).toFixed(2))} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black">{money(p)}</button>)}</div>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Reload amount $" aria-label="Reload amount" className={inp} />
                <div className="flex gap-2">{(['CASH', 'CARD'] as const).map(t => <button key={t} onClick={() => setPayType(t)} className={`flex-1 py-2 rounded-xl text-xs font-black ${payType === t ? 'bg-white text-black' : 'bg-white/10'}`}>{t === 'CASH' ? 'Cash' : 'Card (your terminal)'}</button>)}</div>
                <button disabled={cents < DEFAULT_LIMITS.minReloadCents || busy} onClick={async () => {
                  setBusy(true); setErr(''); setInfo('');
                  try { const r = await svReload({ businessUid, customerUid: customer.uid, amountCents: cents, tenders: [{ type: payType, amountCents: cents }] }, token); setInfo(`Reloaded.${(r as any).bonusCents ? ` Bonus +${money((r as any).bonusCents)}.` : ''} New wallet balance ${money(r.balanceCents)}.`); setAmount(''); }
                  catch (e: any) { setErr(e?.message || 'Could not reload.'); } finally { setBusy(false); }
                }} className="w-full py-3 rounded-2xl font-black text-white disabled:opacity-30" style={{ background: GRAD }}>{busy ? 'Reloading...' : `Take ${cents > 0 ? money(cents) : 'payment'} and reload`}</button>
                {info && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-black text-emerald-200">{info}</div>}
                {err && <div className="text-xs text-red-300 font-bold">{err}</div>}
              </>
            )}
          </div>
        )}
        {mode === 'BALANCE' && customer && cust && (cust.wallet !== null || cust.credit !== null) && (
          <div className="text-xs text-white/70 border-t border-white/10 pt-2">{customer.name}: {cust.wallet !== null ? `wallet ${money(cust.wallet)}` : 'no wallet'}{cust.credit !== null ? ` - store credit ${money(cust.credit)}` : ''}</div>
        )}
      </div>
      {scan && <BarcodeScanner title="Scan gift card" hint="Scan the QR on the card or receipt" onDetect={c => { setScan(false); setCode(c); check(c); }} onClose={() => setScan(false)} />}
    </div>,
    document.body,
  );
}
