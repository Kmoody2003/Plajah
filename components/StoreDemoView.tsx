import React from 'react';
import { ChevronLeft, Store, ArrowRight } from 'lucide-react';
import MerchStore from './MerchStore';
import DemoRibbon from './DemoRibbon';
import { DEMO_MERCH, DEMO_STORE_OWNER } from '../data/demoShowcase';

// Always-on demo storefront — renders MerchStore with static products (MerchStore
// already skips its Firestore fetch when a `merch` prop is passed). A tutorial
// anyone can browse, then open their own store.
const StoreDemoView: React.FC<{ onBack?: () => void; onCreate: () => void }> = ({ onBack, onCreate }) => (
  <div className="h-full overflow-y-auto scrollbar-hide bg-black">
    <DemoRibbon label="store" accent="#FF8C00" ctaText="Open your store" onCreate={onCreate} />

    <div className="px-6 pt-6 pb-2 max-w-6xl mx-auto">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-4">
          <ChevronLeft size={16} /> Back
        </button>
      )}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-11 h-11 rounded-2xl bg-small-orange/15 border border-small-orange/25 flex items-center justify-center">
          <Store size={20} className="text-small-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">{DEMO_STORE_OWNER}'s Store</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Sample merch · apparel, vinyl, digital &amp; more</p>
        </div>
      </div>
    </div>

    <div className="max-w-6xl mx-auto px-2">
      <MerchStore merch={DEMO_MERCH} />
    </div>

    <div className="max-w-2xl mx-auto px-6 my-10 rounded-2xl p-6 text-center bg-small-orange/10 border border-small-orange/20">
      <p className="text-sm font-black uppercase tracking-widest text-white mb-1">Sell your own merch</p>
      <p className="text-[12px] text-white/50 mb-4">Set up apparel, vinyl, digital downloads and collectibles — Plajah handles checkout and payouts.</p>
      <button onClick={onCreate} className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-small-orange text-black hover:scale-105 transition-transform">
        Open your store <ArrowRight size={13} />
      </button>
    </div>
  </div>
);

export default StoreDemoView;
