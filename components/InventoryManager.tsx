import React, { useEffect, useState } from 'react';
import { Package, Plus, Minus, Check, X, AlertTriangle, Store, Loader2, Sparkles, Trash2, Pencil } from 'lucide-react';
import type { StoreProduct, StoreProductCategory } from '../types';
import { fetchProductsBySeller, createProduct, updateProduct, deleteProduct } from '../services/storeService';
import { isLowStock, adjustStock, seedDemoBusiness } from '../services/businessOpsService';

/**
 * Inventory for a business/org — the SAME storeProducts that power the on-platform merch store, so
 * anything you add or stock here appears in your store automatically (no sync step). Adjust stock,
 * get low-stock flags, toggle a product live/hidden, and seed a demo catalog for a presentation.
 */
const CATEGORIES: StoreProductCategory[] = ['APPAREL', 'HOME', 'ACCESSORIES', 'COLLECTIBLES', 'BOOKS', 'ELECTRONICS', 'ART', 'DIGITAL', 'MUSIC', 'OTHER'];
const fmt = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const blank = { title: '', description: '', category: 'OTHER' as StoreProductCategory, price: 0, stock: 0, lowStockThreshold: 5, image: '' };

const InventoryManager: React.FC<{ sellerId: string; sellerName: string; canEdit?: boolean }> = ({ sellerId, sellerName, canEdit = true }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<null | { id?: string; form: typeof blank }>(null);

  const load = async () => { setLoading(true); setProducts(await fetchProductsBySeller(sellerId).catch(() => [])); setLoading(false); };
  useEffect(() => { load(); }, [sellerId]);

  const lowCount = products.filter(isLowStock).length;
  const liveCount = products.filter(p => p.isActive).length;

  const bump = async (p: StoreProduct, delta: number) => {
    const next = await adjustStock(p, delta);
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock: next } : x));
  };
  const toggleActive = async (p: StoreProduct) => {
    await updateProduct(p.id, { isActive: !p.isActive });
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
  };
  const remove = async (p: StoreProduct) => {
    if (!confirm(`Remove "${p.title}" from inventory and your store?`)) return;
    await deleteProduct(p.id);
    setProducts(ps => ps.filter(x => x.id !== p.id));
  };
  const seed = async () => { setBusy(true); await seedDemoBusiness(sellerId, sellerName).catch(() => {}); await load(); setBusy(false); };

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.title.trim()) return;
    setBusy(true);
    const payload = {
      title: f.title.trim(), description: f.description.trim(), category: f.category,
      price: Number(f.price) || 0, stock: Math.max(0, Math.floor(Number(f.stock) || 0)),
      lowStockThreshold: Math.max(0, Math.floor(Number(f.lowStockThreshold) || 0)),
      images: f.image ? [f.image] : [], isActive: true,
    };
    if (editing.id) {
      await updateProduct(editing.id, payload);
    } else {
      await createProduct({ sellerId, sellerName, sellerType: 'ORG', isDigital: f.category === 'DIGITAL', ...payload } as any);
    }
    setEditing(null); setBusy(false); await load();
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-5 text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><Package size={20} className="text-small-orange" /> Inventory</h2>
          <p className="text-[10px] text-white/40 mt-1 flex items-center gap-1.5"><Store size={11} /> Items here auto-list in your store · {liveCount} live{lowCount > 0 && <span className="text-amber-400 flex items-center gap-1"> · <AlertTriangle size={10} /> {lowCount} low</span>}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {products.length === 0 && (
              <button onClick={seed} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Seed demo
              </button>
            )}
            <button onClick={() => setEditing({ form: { ...blank } })} className="flex items-center gap-2 px-4 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest"><Plus size={13} /> Add item</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={22} className="animate-spin text-white/40" /></div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center text-white/30"><Package size={40} className="mx-auto mb-3" /><p className="text-[11px] font-black uppercase tracking-widest">No inventory yet</p><p className="text-xs mt-1">Add an item (or seed the demo) — it appears in your store instantly.</p></div>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-2xl border ${p.isActive ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 shrink-0">
                {p.images?.[0] ? <img src={p.images[0]} className="w-full h-full object-cover" alt="" /> : <Package size={16} className="m-4 text-white/20" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black truncate">{p.title}</p>
                <p className="text-[10px] text-white/40">{fmt(p.price)} · {p.category}{p.isActive ? '' : ' · hidden'}</p>
              </div>
              {/* Stock stepper + low badge */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isLowStock(p) && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[8px] font-black uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={9} /> Low</span>}
                {canEdit && <button onClick={() => bump(p, -1)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"><Minus size={13} /></button>}
                <span className="w-10 text-center text-sm font-black tabular-nums">{p.stock ?? 0}</span>
                {canEdit && <button onClick={() => bump(p, 1)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"><Plus size={13} /></button>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(p)} title={p.isActive ? 'Hide from store' : 'Show in store'} className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.isActive ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40'}`}>{p.isActive ? <Check size={13} /> : <X size={13} />}</button>
                  <button onClick={() => setEditing({ id: p.id, form: { title: p.title, description: p.description || '', category: p.category, price: p.price, stock: p.stock ?? 0, lowStockThreshold: p.lowStockThreshold ?? 5, image: p.images?.[0] || '' } })} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50"><Pencil size={12} /></button>
                  <button onClick={() => remove(p)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/40 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/edit sheet */}
      {editing && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-black uppercase tracking-widest">{editing.id ? 'Edit item' : 'New item'}</h3><button onClick={() => setEditing(null)}><X size={16} className="text-white/40" /></button></div>
            {(['title', 'description', 'image'] as const).map(k => (
              <input key={k} value={(editing.form as any)[k]} onChange={e => setEditing(ed => ed && ({ ...ed, form: { ...ed.form, [k]: e.target.value } }))} placeholder={k === 'image' ? 'Image URL (optional)' : k[0].toUpperCase() + k.slice(1)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" />
            ))}
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Price ($)<input type="number" value={editing.form.price} onChange={e => setEditing(ed => ed && ({ ...ed, form: { ...ed.form, price: parseFloat(e.target.value) || 0 } }))} className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-sm outline-none" /></label>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Stock<input type="number" value={editing.form.stock} onChange={e => setEditing(ed => ed && ({ ...ed, form: { ...ed.form, stock: parseInt(e.target.value) || 0 } }))} className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-sm outline-none" /></label>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Low at<input type="number" value={editing.form.lowStockThreshold} onChange={e => setEditing(ed => ed && ({ ...ed, form: { ...ed.form, lowStockThreshold: parseInt(e.target.value) || 0 } }))} className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-sm outline-none" /></label>
            </div>
            <select value={editing.form.category} onChange={e => setEditing(ed => ed && ({ ...ed, form: { ...ed.form, category: e.target.value as StoreProductCategory } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none">
              {CATEGORIES.map(c => <option key={c} value={c} className="bg-black">{c}</option>)}
            </select>
            <button onClick={save} disabled={busy || !editing.form.title.trim()} className="w-full py-3 rounded-2xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />} {editing.id ? 'Save' : 'Add to inventory & store'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryManager;
