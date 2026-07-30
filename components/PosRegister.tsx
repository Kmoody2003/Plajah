// PosRegister — the staff-facing point-of-sale register. Sits on the SAME storeProducts inventory
// that backs the on-platform store, so ringing up a sale decrements the same stock the store shows.
// A cash sale posts through the server (/api/store/pos-sale): it records a CONFIRMED order, decrements
// stock atomically, and — when a Plajah customer is attached — awards loyalty points. Card-present
// tender (Stripe Terminal) and staff-PIN auth are follow-ups; v1 is the owner ringing cash sales.
//
// Deep integration, per the vision:
//   • Inventory      — grid is live storeProducts; sale decrements the same stock.
//   • Loyalty        — attach a recognized Plajah customer → earn points; redeem points as a discount.
//   • Recognition    — search a Plajah customer by name/handle and attach them to the ticket.

import React, { useEffect, useMemo, useState } from 'react';
import type { StoreProduct, UserProfile } from '../types';
import { fetchProductsBySeller } from '../services/storeService';
import { searchUsers } from '../services/backendService';
import { posSale, fetchLoyaltyPoints } from '../services/businessOpsService';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface CartLine { product: StoreProduct; qty: number; }
interface Props { businessUid: string; businessName: string; onExit: () => void; }

export default function PosRegister({ businessUid, businessName, onExit }: Props) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState('');

  // Customer recognition + loyalty
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<UserProfile[]>([]);
  const [customer, setCustomer] = useState<UserProfile | null>(null);
  const [custPoints, setCustPoints] = useState(0);
  const [redeem, setRedeem] = useState(false);
  const [searching, setSearching] = useState(false);

  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ total: number; points: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await fetchProductsBySeller(businessUid).catch(() => [] as StoreProduct[]);
      setProducts(list.filter(p => p.isActive !== false));
      setLoading(false);
    })();
  }, [businessUid]);

  // Debounced Plajah-customer search
  useEffect(() => {
    if (custQuery.trim().length < 2) { setCustResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchUsers(custQuery).catch(() => [] as UserProfile[]);
      setCustResults((res || []).slice(0, 6));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [custQuery]);

  async function attachCustomer(u: UserProfile) {
    setCustomer(u); setCustResults([]); setCustQuery('');
    const pts = await fetchLoyaltyPoints(businessUid, u.uid).catch(() => 0);
    setCustPoints(pts);
  }
  function detachCustomer() { setCustomer(null); setCustPoints(0); setRedeem(false); }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter(p => p.title?.toLowerCase().includes(s)) : products;
  }, [products, q]);

  function addToCart(p: StoreProduct) {
    setReceipt(null); setError('');
    setCart(prev => {
      const i = prev.findIndex(l => l.product.id === p.id);
      if (i >= 0) { const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next; }
      return [...prev, { product: p, qty: 1 }];
    });
  }
  function setQty(id: string, delta: number) {
    setCart(prev => prev.flatMap(l => {
      if (l.product.id !== id) return [l];
      const qty = l.qty + delta;
      return qty <= 0 ? [] : [{ ...l, qty }];
    }));
  }
  function clearCart() { setCart([]); setRedeem(false); setError(''); }

  const subtotalCents = cart.reduce((s, l) => s + Math.round((l.product.price || 0) * 100) * l.qty, 0);
  // Loyalty redemption: 1 point = 1¢, capped at the subtotal (100 pts = $1).
  const redeemCents = redeem && customer ? Math.min(custPoints, subtotalCents) : 0;
  const totalCents = Math.max(0, subtotalCents - redeemCents);

  async function ringUp(tender: 'CASH' | 'CARD') {
    if (!cart.length || busy) return;
    setBusy(true); setError('');
    try {
      const out = await posSale({
        businessUid,
        items: cart.map(l => ({ productId: l.product.id, qty: l.qty })),
        tender,
        customerUid: customer?.uid,
        discountCents: redeemCents,
      });
      setReceipt({ total: out.totalCents, points: out.pointsEarned });
      // Reflect the sale locally: decrement stock in the grid + reset the ticket.
      setProducts(prev => prev.map(p => {
        const line = cart.find(l => l.product.id === p.id);
        return line ? { ...p, stock: Math.max(0, (p.stock ?? 0) - line.qty) } : p;
      }));
      setCart([]); setRedeem(false);
      if (customer) setCustPoints(p => Math.max(0, p - redeemCents) + out.pointsEarned);
    } catch (e: any) {
      setError(e?.message || 'Sale failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0f] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white" style={{ background: GRAD }}>Register</span>
          <span className="text-sm font-bold truncate max-w-[40vw]">{businessName}</span>
        </div>
        <button onClick={onExit} className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">Close</button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Product grid */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/10">
          <div className="p-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-white/30" />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {loading ? (
              <div className="text-center text-white/40 text-sm py-16">Loading inventory…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-white/40 text-sm py-16">No products. Add items in Inventory — they appear here instantly.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filtered.map(p => {
                  const out = (p.stock ?? 0) <= 0 && !p.isDigital;
                  return (
                    <button key={p.id} onClick={() => !out && addToCart(p)} disabled={out}
                      className={`text-left rounded-2xl overflow-hidden border transition ${out ? 'border-white/5 opacity-40 cursor-not-allowed' : 'border-white/10 hover:border-white/30 active:scale-[0.98]'}`}>
                      <div className="aspect-square bg-white/5 relative">
                        {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                        {!p.isDigital && (
                          <span className={`absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${out ? 'bg-red-600' : (p.stock ?? 0) <= 5 ? 'bg-amber-500 text-black' : 'bg-black/60'}`}>
                            {out ? 'OUT' : `${p.stock} left`}
                          </span>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-[11px] font-bold leading-tight line-clamp-2">{p.title}</div>
                        <div className="text-sm font-black mt-0.5">{money(Math.round((p.price || 0) * 100))}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Ticket / checkout */}
        <div className="w-[340px] shrink-0 flex flex-col bg-black/30">
          {/* Customer */}
          <div className="p-3 border-b border-white/10">
            {customer ? (
              <div className="flex items-center justify-between gap-2 bg-white/5 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{customer.displayName || customer.username}</div>
                  <div className="text-[10px] text-amber-300 font-black">{custPoints.toLocaleString()} pts</div>
                </div>
                <button onClick={detachCustomer} className="text-[10px] font-bold uppercase text-white/50 hover:text-white">Remove</button>
              </div>
            ) : (
              <div className="relative">
                <input value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Attach Plajah customer…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />
                {(searching || custResults.length > 0) && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-[#15151d] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    {searching && <div className="px-3 py-2 text-[11px] text-white/40">Searching…</div>}
                    {custResults.map(u => (
                      <button key={u.uid} onClick={() => attachCustomer(u)} className="w-full text-left px-3 py-2 hover:bg-white/10 text-xs flex items-center gap-2">
                        {u.photoURL && <img src={u.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />}
                        <span className="truncate">{u.displayName || u.username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center text-white/30 text-xs py-12">Tap products to build the ticket.</div>
            ) : cart.map(l => (
              <div key={l.product.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{l.product.title}</div>
                  <div className="text-[10px] text-white/40">{money(Math.round((l.product.price || 0) * 100))} ea</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setQty(l.product.id, -1)} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-sm leading-none">–</button>
                  <span className="w-5 text-center text-xs font-black">{l.qty}</span>
                  <button onClick={() => setQty(l.product.id, +1)} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-sm leading-none">+</button>
                </div>
                <div className="w-14 text-right text-xs font-black">{money(Math.round((l.product.price || 0) * 100) * l.qty)}</div>
              </div>
            ))}
          </div>

          {/* Totals + tender */}
          <div className="p-3 border-t border-white/10 space-y-2">
            {customer && custPoints > 0 && subtotalCents > 0 && (
              <label className="flex items-center justify-between text-[11px] font-bold cursor-pointer">
                <span className="text-amber-300">Redeem {Math.min(custPoints, subtotalCents).toLocaleString()} pts</span>
                <input type="checkbox" checked={redeem} onChange={e => setRedeem(e.target.checked)} className="accent-amber-400" />
              </label>
            )}
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Subtotal</span><span>{money(subtotalCents)}</span>
            </div>
            {redeemCents > 0 && (
              <div className="flex items-center justify-between text-xs text-amber-300">
                <span>Loyalty</span><span>–{money(redeemCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-black">
              <span>Total</span><span>{money(totalCents)}</span>
            </div>

            {receipt && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-[11px] text-emerald-300 font-bold">
                Sale complete — {money(receipt.total)}{receipt.points > 0 ? ` · +${receipt.points} pts earned` : ''}.
              </div>
            )}
            {error && <div className="text-[11px] text-red-400 font-bold">{error}</div>}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button disabled={!cart.length || busy} onClick={() => ringUp('CASH')}
                className="py-3 rounded-xl font-black text-sm text-white disabled:opacity-30" style={{ background: GRAD }}>
                {busy ? '…' : 'Cash'}
              </button>
              <button disabled title="Card-present needs a Stripe Terminal reader (coming soon)"
                className="py-3 rounded-xl font-black text-sm bg-white/10 text-white/40 cursor-not-allowed">Card</button>
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="w-full text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white pt-1">Clear ticket</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
