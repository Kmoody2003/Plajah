import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ShoppingBag, X, Sparkles, Loader2 } from 'lucide-react';
import type { MerchItem, StoreProduct } from '../types';
import { auth } from '../services/backendService';
import { fetchUnifiedSellerProducts, deleteProduct } from '../services/storeService';
import { subscribeCatalog, publishMerchProduct, emitCommerce } from '../services/commerceBus';
import { storefrontBadge, isTracked, totalStock } from '../services/inventoryCore';
import { AnimatePresence } from 'motion/react';
import MerchBuilder from './MerchBuilder';

// MerchManager — a creator/club's merch shelf. ONE catalog: new items are canonical storeProducts
// (via commerceBus.publishMerchProduct → inventoryService.saveProduct, which writes the stock ledger),
// so merch shows in Inventory, the POS register, the kiosk, the storefront and signage. Legacy `merch`
// docs still list (read-only) through fetchUnifiedSellerProducts until they're upgraded in Inventory.

interface MerchManagerProps {
  artistId: string;
  /** Legacy seed list (kept for call-site compatibility; the live catalog replaces it once loaded). */
  initialMerch: MerchItem[];
  onUpdate: (merch: MerchItem[]) => void;
  /** Sell as an organization (sellerType 'ORG'); name shown on the products. */
  org?: { id?: string; name: string };
}

const CATS: { id: StoreProduct['category']; label: string }[] = [
  { id: 'APPAREL', label: 'Apparel' }, { id: 'MUSIC', label: 'Music' }, { id: 'ACCESSORIES', label: 'Accessories' },
  { id: 'DIGITAL', label: 'Digital' }, { id: 'COLLECTIBLES', label: 'Collectibles' },
];

const toMerchItem = (p: StoreProduct): MerchItem => ({
  id: p.id, ownerId: p.sellerId, title: p.title, description: p.description || '', price: p.price,
  imageUrl: p.images?.[0] || '', category: (p.category === 'ACCESSORIES' ? 'ACCESSORY' : ['APPAREL', 'MUSIC', 'DIGITAL', 'COLLECTIBLES'].includes(p.category) ? p.category : 'APPAREL') as MerchItem['category'],
  stock: Number.isFinite(totalStock(p)) ? totalStock(p) : 9999, timestamp: p.createdAt || 0,
  fulfillmentSource: p.fulfillmentSource === 'api' ? undefined : p.fulfillmentSource,
  printfulSyncProductId: p.printfulSyncProductId, printfulVariantId: p.printfulVariantId, externalStoreUrl: p.externalStoreUrl,
});

const blank = () => ({ title: '', description: '', price: '', imageUrl: '', category: 'APPAREL' as StoreProduct['category'], stock: '25', isDigital: false });

const MerchManager: React.FC<MerchManagerProps> = ({ artistId, initialMerch, onUpdate, org }) => {
  const [live, setLive] = useState<StoreProduct[] | null>(null);
  const [legacy, setLegacy] = useState<StoreProduct[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isMerchBuilderOpen, setIsMerchBuilderOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const me = auth.currentUser?.uid;
  const isOwner = !!me && me === artistId;
  const sellerName = org?.name || auth.currentUser?.displayName || '';

  // Live canonical catalog + a one-time read of not-yet-upgraded legacy merch.
  useEffect(() => subscribeCatalog(artistId, setLive), [artistId]);
  useEffect(() => {
    let alive = true;
    fetchUnifiedSellerProducts(artistId, sellerName).then(all => { if (alive) setLegacy(all.filter(p => !!p.legacyMerchId)); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);

  const products = useMemo(() => {
    const canonical = live || [];
    const migrated = new Set(canonical.map(p => p.legacyMerchId).filter(Boolean) as string[]);
    return [...canonical, ...legacy.filter(p => !migrated.has(p.id))].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [live, legacy]);

  // Keep the parent's (legacy-typed) view in sync.
  useEffect(() => { if (live) onUpdate(products.map(toMerchItem)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [products]);

  const handleAdd = async () => {
    const price = parseFloat(form.price);
    if (!form.title.trim() || !(price > 0) || !me) return;
    setLoading(true); setError('');
    try {
      await publishMerchProduct({
        title: form.title.trim(), description: form.description.trim(), price,
        images: form.imageUrl.trim() ? [form.imageUrl.trim()] : [], category: form.category,
        stock: parseInt(form.stock, 10) || 0, isDigital: form.isDigital || form.category === 'DIGITAL', fulfillmentSource: 'manual',
      }, { sellerId: me, sellerName, sellerType: org ? 'ORG' : 'USER' });
      setIsAdding(false); setForm(blank());
    } catch (e: any) {
      setError(e?.message || 'Couldn’t add that item.');
    } finally { setLoading(false); }
  };

  const remove = async (p: StoreProduct) => {
    if (confirmDel !== p.id) { setConfirmDel(p.id); return; }
    setConfirmDel(null);
    try { await deleteProduct(p.id); emitCommerce({ type: 'STOCK', sellerUid: p.sellerId, productId: p.id }); }
    catch { setError('Couldn’t delete that item.'); }
  };

  const shown = live === null && initialMerch.length ? null : products;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-small-orange/10 rounded-2xl">
            <ShoppingBag size={20} className="text-small-orange" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold tracking-tight" style={{ fontFamily: "'Bricolage Grotesque', Inter, sans-serif" }}>Merch</h3>
            <p className="text-[12px] text-white/50">One catalog — shows in your store, register, kiosk and signage.</p>
          </div>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <button onClick={() => setIsMerchBuilderOpen(true)} className="h-11 px-5 bg-small-orange text-black rounded-full font-bold text-[13px] hover:brightness-110 transition-all flex items-center gap-2">
              <Sparkles size={15} /> Merch Builder
            </button>
            <button onClick={() => setIsAdding(true)} className="h-11 px-5 bg-white/10 text-white border border-white/10 rounded-full font-bold text-[13px] hover:bg-white/15 transition-all flex items-center gap-2">
              <Plus size={15} /> Manual
            </button>
          </div>
        )}
      </div>

      {!isOwner && <p className="text-[12px] text-white/45">Only the store owner’s account can add merch here.</p>}
      {error && <p role="alert" className="text-[13px] text-red-300">{error}</p>}

      {isAdding && (
        <div className="p-6 bg-white/[0.03] border border-white/10 rounded-[2rem]">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-[15px] font-bold text-small-orange">New item</h4>
            <button onClick={() => setIsAdding(false)} className="w-11 h-11 grid place-items-center text-white/40 hover:text-white" aria-label="Close"><X size={20} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <label className="block">
                <span className="block text-[12px] font-medium text-white/50 mb-1.5">Item title</span>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Limited Edition Vinyl"
                  className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm font-semibold outline-none focus:border-small-orange/50" />
              </label>
              <label className="block">
                <span className="block text-[12px] font-medium text-white/50 mb-1.5">Description</span>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Tell the story of this item…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-small-orange/50 h-24 resize-none" />
              </label>
              <label className="block">
                <span className="block text-[12px] font-medium text-white/50 mb-1.5">Image link (optional)</span>
                <input type="url" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…"
                  className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-small-orange/50" />
              </label>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[12px] font-medium text-white/50 mb-1.5">Price ($)</span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                    className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm font-semibold tabular-nums outline-none focus:border-small-orange/50" />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-medium text-white/50 mb-1.5">On hand</span>
                  <input type="number" inputMode="numeric" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} disabled={form.category === 'DIGITAL'}
                    className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm font-semibold tabular-nums outline-none focus:border-small-orange/50 disabled:opacity-40" />
                </label>
              </div>
              <label className="block">
                <span className="block text-[12px] font-medium text-white/50 mb-1.5">Category</span>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as StoreProduct['category'] })}
                  className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm font-semibold outline-none focus:border-small-orange/50">
                  {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          <button onClick={handleAdd} disabled={loading || !form.title.trim() || !(parseFloat(form.price) > 0)}
            className="w-full h-12 bg-small-orange text-black rounded-full font-bold text-[14px] hover:brightness-110 active:scale-[.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Adding…</> : 'Add to store'}
          </button>
        </div>
      )}

      {shown === null ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-white/30" /></div>
      ) : shown.length === 0 ? (
        <p className="text-[13px] text-white/45">No merch yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.map(p => {
            const badge = storefrontBadge(p);
            const tracked = isTracked(p);
            const n = totalStock(p);
            const canDelete = isOwner && !p.legacyMerchId;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4 bg-white/[0.03] border border-white/5 rounded-[1.5rem] hover:bg-white/[0.06] transition-all">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
                    {p.images?.[0] && <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <h5 className="text-[14px] font-bold text-white truncate">{p.title}</h5>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[14px] font-extrabold text-small-orange tabular-nums">${(p.price ?? 0).toFixed(2)}</span>
                      <span className="text-[12px] text-white/45 tabular-nums">{!tracked ? (p.fulfillmentSource === 'external' ? 'Linked store' : 'Made to order') : `${n} on hand`}</span>
                      {badge.label && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={badge.soldOut ? { background: 'rgba(212,0,85,.2)', color: '#FF6FA3' } : { background: 'rgba(255,140,0,.18)', color: '#FF8C00' }}>{badge.label}</span>}
                      {p.legacyMerchId && <span className="text-[11px] text-white/40">Legacy · upgrade in Inventory</span>}
                    </div>
                  </div>
                </div>
                {canDelete && (
                  <button onClick={() => remove(p)} onBlur={() => setConfirmDel(c => (c === p.id ? null : c))} aria-label={`Delete ${p.title}`}
                    className={`h-11 shrink-0 rounded-full transition-all flex items-center gap-1.5 ${confirmDel === p.id ? 'px-4 bg-red-500/15 text-red-300' : 'w-11 justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10'}`}>
                    <Trash2 size={17} />{confirmDel === p.id && <span className="text-[13px] font-semibold">Delete?</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <AnimatePresence>
        {isMerchBuilderOpen && (
          <MerchBuilder
            artistId={artistId}
            sellerName={sellerName}
            sellerType={org ? 'ORG' : 'USER'}
            onComplete={() => setIsMerchBuilderOpen(false)}   // the live catalog picks the new product up
            onClose={() => setIsMerchBuilderOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MerchManager;
