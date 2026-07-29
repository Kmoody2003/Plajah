import React, { useEffect, useState } from 'react';
import { ShoppingBag, Plus, Minus, X, Package, Loader2, ArrowLeft, Store } from 'lucide-react';
import type { StoreProduct } from '../types';
import { fetchProductsBySeller } from '../services/storeService';
import { auth } from '../services/backendService';

/**
 * In-store ordering kiosk for a business/org — a customer-facing self-serve screen (BYO tablet).
 * Reuses the kiosk pattern from the event merch kiosk, but for a STORE: it lists the business's live
 * products and checks out through /api/store/create-order (Stripe Connect DIRECT → the business owns
 * the funds; server prices everything; the webhook decrements stock). Pickup flow — no shipping.
 */
const fmt = (n: number) => `$${(n ?? 0).toFixed(2)}`;

const StoreKioskMode: React.FC<{ businessUid: string; businessName: string; onExit?: () => void }> = ({ businessUid, businessName, onExit }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({}); // productId → qty
  const [step, setStep] = useState<'browse' | 'review'>('browse');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProductsBySeller(businessUid)
      .then(ps => setProducts(ps.filter(p => p.isActive && !p.isDigital)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessUid]);

  const byId = (id: string) => products.find(p => p.id === id);
  const add = (id: string) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const sub = (id: string) => setCart(c => { const n = (c[id] || 0) - 1; const x = { ...c }; if (n <= 0) delete x[id]; else x[id] = n; return x; });
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId(id), qty })).filter(l => l.p) as { p: StoreProduct; qty: number }[];
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const placeOrder = async () => {
    if (!name.trim()) { setError('Enter a name for the order.'); return; }
    setPlacing(true); setError('');
    try {
      const token = await auth.currentUser?.getIdToken?.();
      const res = await fetch('/api/store/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          businessUid,
          items: lines.map(l => ({ productId: l.p.id, qty: l.qty })),
          fulfillment: 'PICKUP',
          customerName: name.trim(),
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.url; // Stripe Checkout (funds go to the business)
    } catch (e: any) { setError(e.message || 'Checkout failed.'); setPlacing(false); }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-[#0a0a0a] text-white flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          {onExit && <button onClick={onExit} className="p-2 rounded-full bg-white/5"><ArrowLeft size={18} /></button>}
          <div><p className="text-[9px] font-black uppercase tracking-[0.3em] text-small-orange">Order here</p><p className="text-base font-black">{businessName}</p></div>
        </div>
        {count > 0 && step === 'browse' && (
          <button onClick={() => setStep('review')} className="flex items-center gap-2 px-4 py-2.5 bg-small-orange text-black rounded-full text-sm font-black"><ShoppingBag size={15} /> {count} · {fmt(total)}</button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 grid place-items-center"><Loader2 size={24} className="animate-spin text-white/40" /></div>
      ) : step === 'browse' ? (
        <div className="flex-1 overflow-y-auto p-5">
          {products.length === 0 ? (
            <div className="py-24 text-center text-white/30"><Store size={40} className="mx-auto mb-3" /><p className="text-[11px] font-black uppercase tracking-widest">Nothing available to order yet</p></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
              {products.map(p => (
                <div key={p.id} className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
                  <div className="aspect-square bg-white/5">{p.images?.[0] ? <img src={p.images[0]} className="w-full h-full object-cover" alt="" /> : <Package size={28} className="m-auto mt-10 text-white/15" />}</div>
                  <div className="p-3">
                    <p className="text-sm font-black truncate">{p.title}</p>
                    <p className="text-[11px] text-white/40 mb-2">{fmt(p.price)}{(p.stock ?? 0) <= 0 && <span className="text-red-400"> · sold out</span>}</p>
                    {cart[p.id] ? (
                      <div className="flex items-center justify-between"><button onClick={() => sub(p.id)} className="w-8 h-8 rounded-lg bg-white/10"><Minus size={14} className="mx-auto" /></button><span className="font-black">{cart[p.id]}</span><button onClick={() => add(p.id)} disabled={(p.stock ?? 0) <= (cart[p.id] || 0)} className="w-8 h-8 rounded-lg bg-white/10 disabled:opacity-30"><Plus size={14} className="mx-auto" /></button></div>
                    ) : (
                      <button onClick={() => add(p.id)} disabled={(p.stock ?? 0) <= 0} className="w-full py-2 rounded-xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">Add</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 max-w-md mx-auto w-full space-y-3">
          <button onClick={() => setStep('browse')} className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1"><ArrowLeft size={12} /> Keep shopping</button>
          {lines.map(l => (
            <div key={l.p.id} className="flex items-center gap-3 py-2 border-b border-white/5">
              <span className="flex-1 text-sm font-bold truncate">{l.p.title}</span>
              <button onClick={() => sub(l.p.id)} className="w-7 h-7 rounded-lg bg-white/10"><Minus size={12} className="mx-auto" /></button>
              <span className="w-6 text-center font-black">{l.qty}</span>
              <button onClick={() => add(l.p.id)} className="w-7 h-7 rounded-lg bg-white/10"><Plus size={12} className="mx-auto" /></button>
              <span className="w-16 text-right text-sm font-black">{fmt(l.p.price * l.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 text-lg font-black"><span>Total</span><span>{fmt(total)}</span></div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name for the order" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button onClick={placeOrder} disabled={placing || count === 0} className="w-full py-3.5 rounded-2xl bg-small-orange text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
            {placing ? <Loader2 size={15} className="animate-spin" /> : <ShoppingBag size={15} />} Pay & place order
          </button>
          <p className="text-[9px] text-white/25 text-center">Secure checkout · paid directly to {businessName}</p>
        </div>
      )}
    </div>
  );
};

export default StoreKioskMode;
