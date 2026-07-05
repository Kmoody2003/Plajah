import React, { useState } from 'react';
import {
  ChevronLeft, Store, ArrowRight, Star, ShoppingBag, Check, Sparkles, Ruler,
  Truck, Shield, ThumbsUp, X, Camera, Upload, Minus, Plus, BadgeCheck,
} from 'lucide-react';
import DemoRibbon from './DemoRibbon';
import { DEMO_STORE_PRODUCTS, DEMO_STORE_OWNER, type DemoProduct } from '../data/demoShowcase';

const ORANGE = '#FF8C00';
const demoAction = () => alert('This is a live demo. Open your own store to sell for real — checkout, variants, reviews and payouts all run for you.');
const money = (n: number) => `$${n.toFixed(2)}`;

const Stars: React.FC<{ r: number; size?: number }> = ({ r, size = 14 }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      <Star key={i} size={size} style={{ color: i <= Math.round(r) ? '#F5A623' : 'rgba(255,255,255,0.2)', fill: i <= Math.round(r) ? '#F5A623' : 'none' }} />
    ))}
  </span>
);

// ─── AI try-on modal ────────────────────────────────────────────────────────────
const TryOnModal: React.FC<{ p: DemoProduct; onClose: () => void }> = ({ p, onClose }) => {
  const [step, setStep] = useState<'upload' | 'result'>('upload');
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-[#141216] border border-white/12 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
          <div className="flex items-center gap-2"><Camera size={15} style={{ color: ORANGE }} /><span className="text-[11px] font-black uppercase tracking-widest text-white">AI Try-On</span></div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        {step === 'upload' ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-4 w-full aspect-[3/4] max-w-[220px] rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 bg-white/[0.02]">
              <Upload size={26} className="text-white/30" />
              <p className="text-[11px] text-white/40 px-6">Upload a full-body photo to see <b className="text-white/70">{p.title}</b> on you</p>
            </div>
            <button onClick={() => setStep('result')} className="w-full py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-black" style={{ background: ORANGE }}>
              <Camera size={13} className="inline mr-1.5" /> Upload photo &amp; try on
            </button>
            <p className="text-[10px] text-white/30 mt-3">Powered by Plajah AI · your photo is never stored</p>
          </div>
        ) : (
          <div className="p-6">
            <div className="relative mx-auto w-full aspect-[3/4] max-w-[240px] rounded-2xl overflow-hidden border border-white/10">
              <img src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=480&h=640&fit=crop" className="w-full h-full object-cover" alt="" />
              <img src={p.images[0]} className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-40" alt="" />
              <div className="absolute inset-0 flex items-end justify-center pb-3"><span className="px-2.5 py-1 rounded-full bg-black/70 text-[9px] font-black uppercase tracking-widest" style={{ color: ORANGE }}>AI preview</span></div>
            </div>
            <p className="text-[11px] text-white/45 text-center mt-3">Here's a preview of the fit. In the live store this renders your actual photo.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep('upload')} className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/60 border border-white/10">Try another</button>
              <button onClick={demoAction} className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-black" style={{ background: ORANGE }}>Add to cart</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Product detail ─────────────────────────────────────────────────────────────
const ProductDetail: React.FC<{ p: DemoProduct; onBack: () => void }> = ({ p, onBack }) => {
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState<string | null>(p.sizes ? null : 'ONE');
  const [qty, setQty] = useState(1);
  const [tryOn, setTryOn] = useState(false);
  const total = p.ratingBreakdown.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {tryOn && <TryOnModal p={p} onClose={() => setTryOn(false)} />}
      <button onClick={onBack} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-5"><ChevronLeft size={16} /> Store</button>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Gallery */}
        <div>
          <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/[0.02] aspect-square">
            <img src={p.images[img]} className="w-full h-full object-cover" alt={p.title} />
          </div>
          {p.images.length > 1 && (
            <div className="flex gap-2 mt-3">
              {p.images.map((im, i) => (
                <button key={i} onClick={() => setImg(i)} className="w-16 h-16 rounded-xl overflow-hidden border-2 transition-all" style={{ borderColor: i === img ? ORANGE : 'rgba(255,255,255,0.1)' }}>
                  <img src={im} className="w-full h-full object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{p.brand}</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2 text-balance">{p.title}</h1>
          <button onClick={() => { const el = document.getElementById('reviews'); el?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-2 mb-4">
            <Stars r={p.rating} />
            <span className="text-[12px] font-bold text-white/70">{p.rating.toFixed(1)}</span>
            <span className="text-[12px] text-white/40 underline underline-offset-2">{p.reviewCount} reviews</span>
          </button>

          <div className="flex items-baseline gap-3 mb-5">
            <span className="text-3xl font-black text-white tabular-nums">{money(p.price)}</span>
            {p.compareAt && <span className="text-lg text-white/30 line-through tabular-nums">{money(p.compareAt)}</span>}
            {p.compareAt && <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-black" style={{ background: ORANGE }}>Save {money(p.compareAt - p.price)}</span>}
          </div>

          <p className="text-[13px] text-white/55 leading-relaxed mb-6">{p.description}</p>

          {/* Colors */}
          {p.colors && (
            <div className="mb-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Color · <span className="text-white/70">{p.colors[color].name}</span></p>
              <div className="flex gap-2">
                {p.colors.map((c, i) => (
                  <button key={c.name} onClick={() => setColor(i)} title={c.name} className="w-9 h-9 rounded-full border-2 transition-all" style={{ background: c.hex, borderColor: i === color ? ORANGE : 'rgba(255,255,255,0.15)' }} />
                ))}
              </div>
            </div>
          )}

          {/* Sizes */}
          {p.sizes && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Size</p>
                <button onClick={demoAction} className="flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-white"><Ruler size={11} /> Size guide</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.sizes.map(s => (
                  <button key={s} onClick={() => setSize(s)} className="min-w-[46px] py-2 px-3 rounded-xl text-[12px] font-black transition-all border" style={size === s ? { background: '#fff', color: '#000', borderColor: '#fff' } : { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)' }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Qty + actions */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center border border-white/12 rounded-xl">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-9 h-10 flex items-center justify-center text-white/50 hover:text-white"><Minus size={14} /></button>
              <span className="w-8 text-center text-sm font-black tabular-nums">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="w-9 h-10 flex items-center justify-center text-white/50 hover:text-white"><Plus size={14} /></button>
            </div>
            <button onClick={() => (p.sizes && !size ? alert('Select a size first.') : demoAction())} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest text-black" style={{ background: ORANGE }}>
              <ShoppingBag size={15} /> Add to cart · {money(p.price * qty)}
            </button>
          </div>
          {p.isClothing && (
            <button onClick={() => setTryOn(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest text-white border transition-all hover:bg-white/5" style={{ borderColor: `${ORANGE}55` }}>
              <Camera size={15} style={{ color: ORANGE }} /> Try it on with AI
            </button>
          )}

          <div className="flex items-center gap-4 mt-5 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5"><Truck size={13} /> Free shipping over $50</span>
            <span className="flex items-center gap-1.5"><Shield size={13} /> Secure checkout</span>
          </div>
        </div>
      </div>

      {/* Features + Specs */}
      <div className="grid md:grid-cols-2 gap-6 mt-10">
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-3">Highlights</h3>
          <ul className="space-y-2">
            {p.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-white/70"><Check size={15} className="shrink-0 mt-0.5" style={{ color: ORANGE }} /> {f}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-3">Details &amp; specs</h3>
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {p.specs.map((s, i) => (
              <div key={i} className="flex justify-between px-4 py-2.5 text-[13px]" style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span className="text-white/40">{s.label}</span><span className="text-white/80 font-medium text-right">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div id="reviews" className="mt-12">
        <h3 className="text-xl font-black tracking-tight text-white mb-4">Reviews</h3>

        {/* AI summary */}
        <div className="rounded-3xl p-5 mb-6 border" style={{ background: 'linear-gradient(135deg, rgba(255,140,0,0.08), rgba(0,0,0,0.3))', borderColor: 'rgba(255,140,0,0.25)' }}>
          <div className="grid sm:grid-cols-[auto_1fr] gap-5 items-center">
            <div className="text-center sm:border-r sm:border-white/10 sm:pr-5">
              <p className="text-4xl font-black text-white tabular-nums leading-none">{p.rating.toFixed(1)}</p>
              <div className="my-1.5 flex justify-center"><Stars r={p.rating} size={13} /></div>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">{p.reviewCount} ratings</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2"><Sparkles size={13} style={{ color: ORANGE }} /><span className="text-[10px] font-black uppercase tracking-widest" style={{ color: ORANGE }}>AI summary of reviews</span></div>
              <p className="text-[13px] text-white/70 leading-relaxed">{p.aiSummary}</p>
            </div>
          </div>
          {/* breakdown */}
          <div className="mt-4 pt-4 border-t border-white/8 space-y-1.5">
            {p.ratingBreakdown.map((count, i) => {
              const stars = 5 - i;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={stars} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white/40 w-6 tabular-nums">{stars}★</span>
                  <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: ORANGE }} /></div>
                  <span className="text-[11px] text-white/35 w-9 text-right tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* review list */}
        <div className="space-y-4">
          {p.reviews.map(r => (
            <div key={r.id} className="rounded-2xl p-4 bg-white/[0.02] border border-white/8">
              <div className="flex items-center gap-2.5 mb-1.5">
                <img src={r.photo} className="w-8 h-8 rounded-full object-cover border border-white/10" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-black text-white truncate">{r.author}</p>
                    {r.verified && <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-400"><BadgeCheck size={10} /> Verified</span>}
                  </div>
                  <div className="flex items-center gap-2"><Stars r={r.rating} size={11} /><span className="text-[10px] text-white/30">{r.date}</span></div>
                </div>
              </div>
              <p className="text-[13px] font-bold text-white mb-1">{r.title}</p>
              <p className="text-[13px] text-white/60 leading-relaxed mb-2">{r.text}</p>
              <button onClick={demoAction} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35 hover:text-white/70"><ThumbsUp size={11} /> Helpful ({r.helpful})</button>
            </div>
          ))}
          <button onClick={demoAction} className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/50 border border-white/10 hover:text-white hover:bg-white/5">Write a review</button>
        </div>
      </div>
    </div>
  );
};

// ─── Store (grid → detail) ──────────────────────────────────────────────────────
const StoreDemoView: React.FC<{ onBack?: () => void; onCreate: () => void }> = ({ onBack, onCreate }) => {
  const [selected, setSelected] = useState<DemoProduct | null>(null);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-black">
      <DemoRibbon label="store" accent={ORANGE} ctaText="Open your store" onCreate={onCreate} />

      {selected ? (
        <ProductDetail p={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div className="px-6 pt-6 pb-2 max-w-6xl mx-auto">
            {onBack && <button onClick={onBack} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-4"><ChevronLeft size={16} /> Back</button>}
            <div className="flex items-center gap-3 mb-1">
              <div className="w-11 h-11 rounded-2xl bg-small-orange/15 border border-small-orange/25 flex items-center justify-center"><Store size={20} style={{ color: ORANGE }} /></div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-white">{DEMO_STORE_OWNER}'s Store</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Apparel · vinyl · digital &amp; collectibles</p>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            {DEMO_STORE_PRODUCTS.map(p => (
              <button key={p.id} onClick={() => { setSelected(p); window.scrollTo(0, 0); }} className="text-left group">
                <div className="rounded-2xl overflow-hidden border border-white/10 aspect-square relative">
                  <img src={p.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="" loading="lazy" />
                  {p.compareAt && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest text-black" style={{ background: ORANGE }}>Sale</span>}
                  {p.isClothing && <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 text-[8px] font-black uppercase tracking-widest text-white"><Camera size={9} style={{ color: ORANGE }} /> Try-on</span>}
                </div>
                <p className="text-[13px] font-bold text-white leading-tight mt-2 line-clamp-1 group-hover:text-orange-300">{p.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5"><Stars r={p.rating} size={11} /><span className="text-[10px] text-white/35">({p.reviewCount})</span></div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-sm font-black text-white tabular-nums">{money(p.price)}</span>
                  {p.compareAt && <span className="text-[11px] text-white/30 line-through tabular-nums">{money(p.compareAt)}</span>}
                </div>
              </button>
            ))}
          </div>

          <div className="max-w-2xl mx-auto px-6 my-10 rounded-2xl p-6 text-center bg-small-orange/10 border border-small-orange/20">
            <p className="text-sm font-black uppercase tracking-widest text-white mb-1">Sell your own merch</p>
            <p className="text-[12px] text-white/50 mb-4">Apparel, vinyl, digital downloads and collectibles — with product pages, reviews, AI try-on, checkout and payouts handled.</p>
            <button onClick={onCreate} className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-small-orange text-black hover:scale-105 transition-transform">Open your store <ArrowRight size={13} /></button>
          </div>
        </>
      )}
    </div>
  );
};

export default StoreDemoView;
