// Product page lab: the real Wayne T Jackson Ministries products (read live, public) in the new full product
// page, with lab-only reviews and sign-in. ?as=shopper|seller|guest  ?reviews=0  ?live=1 (drafts shown as on sale)
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { opsDb } from './services/firebase';
import type { StoreProduct } from './types';
import ProductPage, { useProductRoute } from './components/store/ProductPage';
import { LAB_SELLER } from './labs/product-page/shims';
import '/index.css';

const params = new URLSearchParams(location.search);
const live = params.get('live') === '1';

const Lab = () => {
  const [items, setItems] = useState<StoreProduct[] | null>(null);
  const [cart, setCart] = useState(0);
  const [err, setErr] = useState('');
  useEffect(() => {
    getDocs(query(collection(opsDb, 'storeProducts'), where('sellerId', '==', LAB_SELLER)))
      .then(s => {
        let ps = s.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct)).filter(p => p.id.startsWith('wtjm_'));
        if (live) ps = ps.map(p => ({ ...p, isActive: true, price: p.price || 19.99, stock: p.stock || 12 }));
        setItems(ps);
      })
      .catch(e => setErr(String(e?.message || e)));
  }, []);
  const route = useProductRoute(items ? items.map(p => p.id) : null);
  const current = items?.find(p => p.id === route.openId) || null;
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Product page lab</h1>
      <p className="text-white/50 text-sm mt-1">
        Real WTJM products (read only). Reviews here are lab samples and are never saved.{' '}
        {live ? 'Drafts shown as on sale, lab price $19.99 where none is set.' : 'Shown as they really are (drafts).'}
      </p>
      {err && <p className="text-red-400 mt-3">{err}</p>}
      {!items && !err && <p className="mt-4 text-white/50">Loading…</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        {items?.map(p => (
          <button key={p.id} onClick={() => route.open(p.id)} className="text-left rounded-xl overflow-hidden bg-white/5">
            <img src={p.images?.[0]} alt="" className="aspect-square w-full object-cover" />
            <p className="p-2 text-sm">{p.title}</p>
          </button>
        ))}
      </div>
      {current && (
        <ProductPage product={current} accent="#FF8C00" shopName="Great Faith Ministries International" deptName="Wayne T Jackson Minsitries"
          backLabel="Wayne T Jackson Minsitries shop" related={items!.filter(p => p.id !== current.id)}
          cartCount={cart} onOpenCart={() => alert('Lab: the cart sidebar is not mounted here')}
          onAddToCart={(_p, _v, q) => setCart(c => c + (q || 1))}
          onBuyNow={async () => { throw new Error('Lab: checkout is off here (no Stripe).'); }}
          onOpenProduct={p => route.open(p.id)} onBack={route.close} />
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
