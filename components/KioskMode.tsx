import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag, X, Plus, Minus, Package, ArrowLeft,
  Check, RefreshCw, Truck, CreditCard, Ticket,
  AlertCircle, ChevronRight,
} from 'lucide-react';
import { startKioskSession } from '../services/backendService';
import { UserProfile } from '../types';

interface Props {
  eventId: string;
  eventTitle: string;
  creatorUid: string;
  currentUser: UserProfile;
  onExit: () => void;
}

interface CartItem {
  id: string;
  name: string;
  price: number; // cents
  image?: string;
  size?: string;
  qty: number;
  category: string;
}

interface StoreProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category: string;
  sizes?: string[];
  stock?: number;
}

const fmt = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const KioskMode: React.FC<Props> = ({ eventId, eventTitle, creatorUid, currentUser, onExit }) => {
  const [products, setProducts]     = useState<StoreProduct[]>([]);
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [step, setStep]             = useState<'browse' | 'cart' | 'shipping' | 'confirm'>('browse');
  const [sessionId, setSessionId]   = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [shipping, setShipping]     = useState({ name: '', email: '', line1: '', city: '', state: '', zip: '', country: 'US' });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [confirmExit, setConfirmExit] = useState(false);

  // Load creator's store products from Firestore via a fetch
  useEffect(() => {
    startKioskSession(eventId, `Kiosk at ${eventTitle}`).then(id => setSessionId(id)).catch(() => {});
    // Load store products
    fetch(`/api/store/products/${creatorUid}`).then(r => r.json()).then(d => setProducts(d.products ?? [])).catch(() => {
      // Demo products if no store is set up
      setProducts([
        { id: 'demo1', name: 'Event T-Shirt', description: 'Official event tee', price: 2999, category: 'Apparel', sizes: ['S','M','L','XL','XXL'], image: '' },
        { id: 'demo2', name: 'Signed Poster', description: 'Signed by the artist', price: 1999, category: 'Collectibles', image: '' },
        { id: 'demo3', name: 'Tote Bag', description: 'Eco-friendly canvas', price: 1499, category: 'Accessories', image: '' },
        { id: 'demo4', name: 'Digital Album Download', description: 'Full album + bonus tracks', price: 999, category: 'Digital', image: '' },
      ]);
    });
  }, [eventId, creatorUid, eventTitle]);

  const addToCart = (product: StoreProduct) => {
    const size = selectedSize[product.id];
    if (product.sizes?.length && !size) { setError(`Please select a size for ${product.name}`); return; }
    setError('');
    const key = `${product.id}_${size ?? ''}`;
    setCart(prev => {
      const existing = prev.find(i => i.id === key);
      if (existing) return prev.map(i => i.id === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: key, name: product.name, price: product.price, image: product.image, size, qty: 1, category: product.category }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const handleCheckout = async () => {
    if (!shipping.name || !shipping.email || !shipping.line1 || !shipping.city || !shipping.zip) {
      setError('Please fill in all required shipping fields'); return;
    }
    setLoading(true); setError('');
    try {
      // Build Stripe checkout for all cart items shipped to the address
      const res = await fetch('/api/store/kiosk-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await (window as any).__getIdToken?.()}` },
        body: JSON.stringify({ eventId, sessionId, creatorUid, items: cart, shipping }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const { url } = await res.json();
      window.location.href = url;
    } catch (e: any) { setError(e.message); setLoading(false); }
  };

  const CATEGORIES = [...new Set(products.map(p => p.category))];

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0 bg-black/60 backdrop-blur-xl">
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-widest">Merch Kiosk</p>
          <p className="text-base font-black text-white">{eventTitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && step === 'browse' && (
            <button onClick={() => setStep('cart')} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl font-black text-sm">
              <ShoppingBag size={15} /> Cart ({cartCount}) · {fmt(cartTotal)}
            </button>
          )}
          <button onClick={() => setConfirmExit(true)} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ── Browse ── */}
          {step === 'browse' && (
            <motion.div key="browse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto p-6">
              {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2"><AlertCircle size={12} />{error}</div>}

              {/* Info banner */}
              <div className="mb-6 p-4 bg-[#60a5fa]/8 border border-[#60a5fa]/20 rounded-2xl flex items-start gap-3">
                <Truck size={16} className="text-[#60a5fa] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-black text-white mb-0.5">Order now, delivered to your home</p>
                  <p className="text-xs text-white/40">Browse merch, add to cart, enter your shipping address. We'll send it straight to you — no need to carry anything tonight.</p>
                </div>
              </div>

              {CATEGORIES.map(cat => (
                <div key={cat} className="mb-8">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">{cat}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.filter(p => p.category === cat).map(product => (
                      <div key={product.id} className="bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden hover:border-white/20 transition-all group">
                        <div className="h-40 bg-white/5 flex items-center justify-center">
                          {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" /> : <Package size={40} className="text-white/15" />}
                        </div>
                        <div className="p-4">
                          <p className="text-sm font-black text-white mb-1">{product.name}</p>
                          {product.description && <p className="text-[10px] text-white/35 mb-2 leading-tight">{product.description}</p>}
                          <p className="text-base font-black text-[#a78bfa] mb-3">{fmt(product.price)}</p>
                          {product.sizes && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {product.sizes.map(s => (
                                <button key={s} onClick={() => setSelectedSize(prev => ({ ...prev, [product.id]: s }))} className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border transition-all ${selectedSize[product.id] === s ? 'bg-[#a78bfa]/20 border-[#a78bfa]/50 text-[#a78bfa]' : 'border-white/10 text-white/30 hover:text-white'}`}>{s}</button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => addToCart(product)} className="w-full py-2.5 bg-white/8 hover:bg-white/15 border border-white/10 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2">
                            <Plus size={12} /> Add to Cart
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* ── Cart ── */}
          {step === 'cart' && (
            <motion.div key="cart" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="h-full flex flex-col">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
                <button onClick={() => setStep('browse')} className="text-white/40 hover:text-white"><ArrowLeft size={18} /></button>
                <p className="font-black text-white">Your Cart ({cartCount} items)</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center py-16 text-white/25"><ShoppingBag size={32} className="mx-auto mb-3 opacity-30" /><p>Your cart is empty</p></div>
                ) : cart.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                    <div className="w-14 h-14 rounded-xl bg-white/8 flex items-center justify-center shrink-0">
                      {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover rounded-xl" /> : <Package size={20} className="text-white/30" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white">{item.name}{item.size ? ` (${item.size})` : ''}</p>
                      <p className="text-sm text-[#a78bfa] font-black">{fmt(item.price * item.qty)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => updateQty(item.id, -1)} className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center font-black hover:bg-white/15 transition-all"><Minus size={12} /></button>
                      <span className="w-6 text-center text-sm font-black">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center font-black hover:bg-white/15 transition-all"><Plus size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-white/8 shrink-0">
                <div className="flex justify-between text-lg font-black text-white mb-4">
                  <span>Total</span><span>{fmt(cartTotal)}</span>
                </div>
                <button onClick={() => setStep('shipping')} disabled={cart.length === 0} className="w-full py-4 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-2xl font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 hover:brightness-110 transition-all">
                  <Truck size={16} /> Enter Shipping Address <ChevronRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Shipping ── */}
          {step === 'shipping' && (
            <motion.div key="shipping" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="h-full flex flex-col">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
                <button onClick={() => setStep('cart')} className="text-white/40 hover:text-white"><ArrowLeft size={18} /></button>
                <p className="font-black text-white">Shipping Details</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-md mx-auto w-full">
                <p className="text-sm text-white/40 leading-relaxed">Enter where you'd like your merch delivered. We'll ship it to you — nothing to carry tonight.</p>
                {[
                  { field: 'name', label: 'Full Name', placeholder: 'Jane Smith' },
                  { field: 'email', label: 'Email Address', placeholder: 'jane@example.com', type: 'email' },
                  { field: 'line1', label: 'Street Address', placeholder: '123 Main St' },
                  { field: 'city', label: 'City', placeholder: 'New York' },
                  { field: 'state', label: 'State', placeholder: 'NY' },
                  { field: 'zip', label: 'ZIP Code', placeholder: '10001' },
                ].map(f => (
                  <div key={f.field}>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">{f.label}</label>
                    <input type={f.type || 'text'} value={(shipping as any)[f.field]} onChange={e => setShipping(s => ({ ...s, [f.field]: e.target.value }))} placeholder={f.placeholder} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25" />
                  </div>
                ))}
                {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2"><AlertCircle size={12} />{error}</div>}
                <button onClick={handleCheckout} disabled={loading} className="w-full py-4 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-2xl font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 hover:brightness-110 transition-all">
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  {loading ? 'Opening Checkout…' : `Pay ${fmt(cartTotal)} →`}
                </button>
                <p className="text-[8px] text-white/20 text-center uppercase tracking-widest">Secure payment by Stripe</p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Exit confirm */}
      <AnimatePresence>
        {confirmExit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <div className="bg-[#0d0d0d] border border-white/15 rounded-3xl p-6 max-w-xs w-full text-center">
              <p className="text-base font-black text-white mb-2">Exit Kiosk Mode?</p>
              <p className="text-xs text-white/40 mb-5">Cart will be cleared and you'll return to the event dashboard.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmExit(false)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-black text-xs uppercase text-white/50">Cancel</button>
                <button onClick={onExit} className="flex-1 py-3 bg-red-500/20 border border-red-500/30 rounded-xl font-black text-xs uppercase text-red-400">Exit</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default KioskMode;
