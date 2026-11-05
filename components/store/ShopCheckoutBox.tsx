import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Tag, Truck, X } from 'lucide-react';
import type { StoreCartItem } from '../../types';
import { quoteStoreCart, type CartQuote, type CheckoutOptions } from '../../services/storeService';

const money = (c: number) => `$${((c || 0) / 100).toFixed(2)}`;
const COUNTRY_NAME = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (c: string) => COUNTRY_NAME?.of(c) || c;

/**
 * One shop's part of the cart: where it ships, how, an optional discount code, and the real total from
 * the server (the same pricing checkout uses), then the button that takes the buyer to pay.
 */
const ShopCheckoutBox: React.FC<{
  sellerId: string; lines: StoreCartItem[]; label: string; busy: boolean;
  onCheckout: (sellerId: string, opts: CheckoutOptions) => void;
}> = ({ sellerId, lines, label, busy, onCheckout }) => {
  const physical = lines.some(i => !i.product.isDigital);
  const [opts, setOpts] = useState<CheckoutOptions>({});
  const [codeText, setCodeText] = useState('');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [err, setErr] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const sig = lines.map(l => `${l.product.id}|${l.variantId || ''}|${l.quantity}`).join(',');

  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      quoteStoreCart(sellerId, lines, opts)
        .then(q => { if (n === seq.current) { setQuote(q); setErr(''); setCodeErr(''); } })
        .catch((e: any) => {
          if (n !== seq.current) return;
          if (e.code === 'BAD_CODE') { setCodeErr(e.message); setOpts(o => ({ ...o, discountCode: undefined })); }
          else setErr(e.message);
        })
        .finally(() => n === seq.current && setLoading(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, sig, opts.shipCountry, opts.shipMethod, opts.discountCode, opts.pickup]);

  const sh = quote?.shipping;
  const country = opts.shipCountry || sh?.domesticCountry || 'US';
  const domestic = country === (sh?.domesticCountry || 'US');
  const row = 'flex items-center justify-between';
  const dim = 'text-white/40 font-bold uppercase tracking-widest';

  return (
    <div className="space-y-2.5">
      {physical && sh && (
        <div className="space-y-2 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          {sh.pickup && (
            <div className="flex gap-1.5 text-[10px] font-black uppercase tracking-widest">
              {[false, true].map(p => (
                <button key={String(p)} onClick={() => setOpts(o => ({ ...o, pickup: p }))} className={`flex-1 py-2 rounded-lg ${!!opts.pickup === p ? 'bg-small-orange text-white' : 'bg-white/5 text-white/50'}`}>{p ? 'Pick up' : 'Ship it'}</button>
              ))}
            </div>
          )}
          {opts.pickup ? <p className="text-[10px] text-white/50">{sh.pickupNote || 'The shop will tell you when it’s ready.'}</p> : (
            <>
              <label className="flex items-center gap-2 text-[10px]">
                <Truck size={12} className="text-white/40" /><span className={dim}>Ship to</span>
                <select className="ml-auto bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px]" value={country} onChange={e => setOpts(o => ({ ...o, shipCountry: e.target.value, shipMethod: undefined }))} aria-label="Ship to country">
                  {[sh.domesticCountry, ...sh.countries].map(c => <option key={c} value={c}>{countryName(c)}</option>)}
                </select>
              </label>
              {domestic && sh.expressCents > 0 && (
                <div className="flex gap-1.5 text-[10px] font-bold">
                  {(['standard', 'express'] as const).map(m => (
                    <button key={m} onClick={() => setOpts(o => ({ ...o, shipMethod: m }))} className={`flex-1 py-1.5 rounded-lg ${(opts.shipMethod || 'standard') === m ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'}`}>{m === 'standard' ? 'Standard' : 'Express'}</button>
                  ))}
                </div>
              )}
              {!domestic && <p className="text-[9px] text-white/35">Import duties and taxes may be charged by your country on delivery.</p>}
            </>
          )}
        </div>
      )}

      {opts.discountCode ? (
        <div className="flex items-center gap-2 text-[10px] font-bold text-green-400"><Tag size={12} /> {opts.discountCode} applied
          <button className="ml-auto p-1 rounded hover:bg-white/5" aria-label="Remove code" onClick={() => { setOpts(o => ({ ...o, discountCode: undefined })); setCodeText(''); }}><X size={12} /></button>
        </div>
      ) : (
        <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); if (codeText.trim()) setOpts(o => ({ ...o, discountCode: codeText.trim().toUpperCase() })); }}>
          <input value={codeText} onChange={e => setCodeText(e.target.value)} placeholder="Discount code" aria-label="Discount code" className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] uppercase" />
          <button type="submit" className="px-3 rounded-lg bg-white/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-40" disabled={!codeText.trim()}>Apply</button>
        </form>
      )}
      {codeErr && <p className="text-[10px] font-bold text-red-400">{codeErr}</p>}

      <div className="space-y-1 text-[10px]">
        <div className={row}><span className={dim}>Subtotal</span><span className="font-black">{quote ? money(quote.subtotalCents) : '…'}</span></div>
        {!!quote?.discountCents && <div className={row}><span className={dim}>Discount</span><span className="font-black text-green-400">-{money(quote.discountCents)}</span></div>}
        {physical && <div className={row}><span className={dim}>{opts.pickup ? 'Pickup' : 'Shipping'}</span><span className="font-black">{!quote ? '…' : opts.pickup || quote.shippingCents === 0 ? 'Free' : money(quote.shippingCents)}</span></div>}
        <div className={row}><span className={dim}>Tax</span><span className="font-black">{!quote ? '…' : quote.taxAtCheckout ? 'At checkout' : money(quote.taxCents)}</span></div>
        <div className={`${row} pt-1.5 border-t border-white/[0.06]`}><span className="text-[11px] font-black uppercase tracking-widest">Total</span><span className="text-lg font-black text-small-orange">{quote ? money(quote.totalCents) : '…'}</span></div>
      </div>
      {err && <p role="alert" className="text-[10px] font-bold text-red-400">{err}</p>}
      <button
        onClick={() => onCheckout(sellerId, opts)}
        disabled={busy || loading || !!err}
        className="w-full py-3.5 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-small-orange/80 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <>Checkout{label ? ` · ${label}` : ''} <ArrowRight size={16} /></>}
      </button>
    </div>
  );
};

export default ShopCheckoutBox;
