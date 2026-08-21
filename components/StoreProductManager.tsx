import React, { useState, useEffect, useCallback } from 'react';
import { useContextMenu } from './ui/ContextMenu';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Trash2, Edit2, Package, Tag, Globe, Sparkles, Layers, Truck, ImageIcon, X, Boxes,
} from 'lucide-react';
import type { StoreProduct, StoreProductVariant, StoreProductCategory, StoreSettings } from '../types';
import { createProduct, updateProduct, deleteProduct, fetchUnifiedSellerProducts } from '../services/storeService';
import { updateStoreSettings } from '../services/backendService';
import { listFulfillmentProviders } from '../services/fulfillment';

// The ONE canonical store/product manager (consolidation slice 2). Backed by
// storeService/StoreProduct — variants, SKU, inventory, fulfillment — reads the
// unified list (canonical + folded-in legacy merch) and migrates a legacy item to
// storeProducts the moment its owner saves an edit (non-destructive).

const CATEGORIES: StoreProductCategory[] = ['APPAREL', 'MUSIC', 'ACCESSORIES', 'DIGITAL', 'COLLECTIBLES', 'BOOKS', 'ELECTRONICS', 'HOME', 'ART', 'OTHER'];
const inp = 'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const lbl = 'text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5 block';

// A legacy merch item folded into the unified view has id === legacyMerchId
// (see merchToStoreProduct); a real storeProducts doc does not.
const isLegacy = (p: StoreProduct) => !!p.legacyMerchId && p.legacyMerchId === p.id;

interface DraftRich { images: string; features: string; specs: string; colors: string; sizes: string; }
const emptyRich: DraftRich = { images: '', features: '', specs: '', colors: '', sizes: '' };

const richFromProduct = (p?: StoreProduct): DraftRich => ({
  images: (p?.images || []).join('\n'),
  features: (p?.features || []).join('\n'),
  specs: (p?.specs || []).map(s => `${s.label}: ${s.value}`).join('\n'),
  colors: (p?.colorOptions || []).map(c => `${c.name} ${c.hex}`).join('\n'),
  sizes: (p?.sizeOptions || []).join(', '),
});

const parseRich = (r: DraftRich) => {
  const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
  return {
    images: lines(r.images),
    features: lines(r.features),
    specs: lines(r.specs).map(l => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: '' }; }),
    colorOptions: lines(r.colors).map(l => { const m = l.match(/#[0-9a-fA-F]{3,8}/); return { name: l.replace(/#[0-9a-fA-F]{3,8}/, '').trim() || 'Color', hex: m ? m[0] : '#888888' }; }),
    sizeOptions: r.sizes.split(',').map(x => x.trim()).filter(Boolean),
  };
};

const StoreProductManager: React.FC<{
  ownerId: string;
  sellerName?: string;
  settings?: StoreSettings;
  onSettingsUpdate?: (s: StoreSettings) => void;
}> = ({ ownerId, sellerName = '', settings, onSettingsUpdate }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StoreProduct | null>(null); // null = closed
  const [isNew, setIsNew] = useState(false);
  const [rich, setRich] = useState<DraftRich>(emptyRich);
  const [variants, setVariants] = useState<StoreProductVariant[]>([]);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<StoreSettings>(settings || { isEnabled: true, useExternalStore: false, externalStoreUrl: '', showDemoContent: true });

  const load = useCallback(async () => {
    setLoading(true);
    setProducts(await fetchUnifiedSellerProducts(ownerId, sellerName).catch(() => []));
    setLoading(false);
  }, [ownerId, sellerName]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing({ id: '', sellerId: ownerId, sellerName, title: '', description: '', category: 'APPAREL', price: 0, images: [], stock: 0, isDigital: false, isActive: true, createdAt: 0, updatedAt: 0 });
    setRich(emptyRich); setVariants([]); setIsNew(true);
  };
  const openEdit = (p: StoreProduct) => { setEditing({ ...p }); setRich(richFromProduct(p)); setVariants(p.variants || []); setIsNew(false); };
  const close = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing || !editing.title.trim()) return;
    setSaving(true);
    const parsed = parseRich(rich);
    const totalStock = variants.length ? variants.reduce((s, v) => s + (v.stock || 0), 0) : editing.stock;
    const fields: any = {
      sellerId: ownerId, sellerName,
      title: editing.title.trim(), description: editing.description || '', category: editing.category,
      price: editing.price || 0, compareAtPrice: editing.compareAtPrice,
      images: parsed.images.length ? parsed.images : editing.images,
      variants: variants.length ? variants : undefined,
      stock: totalStock, weight: editing.weight,
      isDigital: !!editing.isDigital, digitalFileUrl: editing.digitalFileUrl,
      features: parsed.features, specs: parsed.specs, colorOptions: parsed.colorOptions, sizeOptions: parsed.sizeOptions,
      isClothing: editing.isClothing, isActive: editing.isActive !== false, isFeatured: editing.isFeatured,
      videoUrl: editing.videoUrl, worldId: editing.worldId,
      fulfillmentSource: editing.fulfillmentSource, fulfillmentProviderId: editing.fulfillmentProviderId,
      fulfillmentExternalId: editing.fulfillmentExternalId, externalStoreUrl: editing.externalStoreUrl,
    };
    // strip undefined (Firestore rejects undefined writes)
    Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);
    try {
      if (isNew) {
        await createProduct(fields);
      } else if (isLegacy(editing)) {
        // Migrate this legacy merch item into the canonical collection (non-destructive).
        await createProduct({ ...fields, legacyMerchId: editing.id });
      } else {
        await updateProduct(editing.id, fields);
      }
      await load();
      close();
    } catch (e) {
      console.warn('[StoreProductManager] save failed', e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: StoreProduct) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    if (!isLegacy(p)) { try { await deleteProduct(p.id); } catch { /* */ } }
    // (legacy merch deletion stays in the old path; here we just drop it from view)
    setProducts(prev => prev.filter(x => x.id !== p.id));
  };

  const saveSettings = async () => { await updateStoreSettings(cfg); onSettingsUpdate?.(cfg); };

  const setE = (patch: Partial<StoreProduct>) => setEditing(e => e ? { ...e, ...patch } : e);
  const addVariant = () => setVariants(v => [...v, { id: `v_${Math.random().toString(36).slice(2, 8)}`, name: '', stock: 0 }]);
  const setVariant = (i: number, patch: Partial<StoreProductVariant>) => setVariants(v => v.map((x, j) => j === i ? { ...x, ...patch } : x));

  // Right-click / long-press a product — the shared design-system menu.
  const productMenu = useContextMenu<StoreProduct>((p) => [
    { kind: 'header', label: p.title || 'Untitled product' },
    { id: 'edit', label: 'Edit', icon: <Edit2 size={14} />, onSelect: (pr) => openEdit(pr) },
    { id: 'dup', label: 'Duplicate', onSelect: (pr) => { setEditing({ ...pr, id: '', title: `${pr.title} copy`, createdAt: 0, updatedAt: 0 }); setRich(richFromProduct(pr)); setVariants(pr.variants || []); setIsNew(true); } },
    { kind: 'separator' },
    { id: 'del', label: 'Delete', danger: true, icon: <Trash2 size={14} />, onSelect: (pr) => remove(pr) },
  ]);

  return (
    <div className="space-y-8">
      {/* Store configuration */}
      <section className="bg-white/[0.02] border border-white/8 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-5"><Globe className="text-small-orange" size={18} /><h3 className="text-lg font-black uppercase tracking-tight">Store settings</h3></div>
        <div className="grid sm:grid-cols-2 gap-4">
          {([['isEnabled', 'Store enabled', 'Public visibility'], ['useExternalStore', 'External store', 'Link to your own site']] as const).map(([k, t, d]) => (
            <div key={k} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/8">
              <div><p className="text-xs font-black uppercase tracking-widest">{t}</p><p className="text-[9px] text-white/40 font-bold uppercase">{d}</p></div>
              <button onClick={() => setCfg(c => ({ ...c, [k]: !c[k] }))} className={`w-12 h-7 rounded-full relative transition-all ${cfg[k] ? 'bg-small-orange' : 'bg-white/10'}`}><span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${cfg[k] ? 'left-6' : 'left-1'}`} /></button>
            </div>
          ))}
        </div>
        {cfg.useExternalStore && <input value={cfg.externalStoreUrl || ''} onChange={e => setCfg(c => ({ ...c, externalStoreUrl: e.target.value }))} placeholder="https://your-store.com" className={`${inp} mt-4`} />}
        <button onClick={saveSettings} className="mt-4 px-6 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:brightness-110">Save settings</button>
      </section>

      {/* Products */}
      {!cfg.useExternalStore && (
        <section className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3"><Package className="text-small-orange" size={18} /><div><h3 className="text-lg font-black uppercase tracking-tight">Products</h3><p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{products.length} item{products.length === 1 ? '' : 's'} · variants · inventory · fulfillment</p></div></div>
            <button onClick={openNew} className="flex items-center gap-2 px-5 py-2.5 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:brightness-110"><Plus size={14} /> Add product</button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-[10px] font-black uppercase tracking-widest text-white/30">Loading…</div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center rounded-3xl border border-white/8 bg-white/[0.02]"><Boxes size={30} className="mx-auto text-white/12 mb-3" /><p className="text-[10px] font-black uppercase tracking-widest text-white/30">No products yet</p></div>
          ) : (
            <div className="space-y-3">
              {productMenu.node}
              {products.map(p => (
                <div key={p.id} className="bg-white/[0.02] border border-white/8 rounded-2xl p-4 flex items-center gap-4 group hover:bg-white/[0.04] transition-all" {...productMenu.bind(p)}>
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black shrink-0">
                    {p.images?.[0] ? <img src={p.images[0]} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="" /> : <div className="w-full h-full grid place-items-center"><ImageIcon size={22} className="text-white/15" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm font-black uppercase tracking-tight truncate">{p.title}</h4>
                      <span className="px-2 py-0.5 bg-white/5 rounded-full text-[7px] font-black text-white/40 uppercase tracking-widest border border-white/8">{p.category}</span>
                      {isLegacy(p) && <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/25">Legacy · migrates on save</span>}
                      {p.variants?.length ? <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/8"><Layers size={8} className="inline mr-0.5" />{p.variants.length} variants</span> : null}
                      {p.fulfillmentSource && p.fulfillmentSource !== 'manual' && <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/8"><Truck size={8} className="inline mr-0.5" />{p.fulfillmentSource}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="flex items-center gap-1 font-black"><Tag size={12} className="text-small-orange" />${(p.price || 0).toFixed(2)}{p.compareAtPrice ? <span className="text-white/25 line-through ml-1">${p.compareAtPrice.toFixed(2)}</span> : null}</span>
                      <span className="flex items-center gap-1 text-white/40 font-bold"><Package size={12} />{p.stock ?? 0} in stock</span>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(p)} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all"><Edit2 size={16} /></button>
                    <button onClick={() => remove(p)} className="p-3 bg-white/5 hover:bg-rose-500/10 rounded-xl text-white/40 hover:text-rose-400 transition-all"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Editor */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={close}>
            <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0a0a0d] border border-white/10">
              <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-white/8 bg-[#0a0a0d]">
                <Package size={17} className="text-small-orange" />
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white">{isNew ? 'New product' : 'Edit product'}</p>
                <button onClick={close} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 grid place-items-center text-white/40 hover:text-white"><X size={15} /></button>
              </div>
              <div className="p-5 space-y-5">
                <div><label className={lbl}>Title</label><input value={editing.title} onChange={e => setE({ title: e.target.value })} placeholder="Limited Edition Hoodie" className={inp} /></div>
                <div><label className={lbl}>Description</label><textarea value={editing.description} onChange={e => setE({ description: e.target.value })} rows={3} className={`${inp} resize-none`} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Category</label><select value={editing.category} onChange={e => setE({ category: e.target.value as StoreProductCategory })} className={inp}>{CATEGORIES.map(c => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</select></div>
                  <div><label className={lbl}>Stock {variants.length > 0 && <span className="text-white/25">(from variants)</span>}</label><input type="number" value={variants.length ? variants.reduce((s, v) => s + (v.stock || 0), 0) : (editing.stock ?? 0)} disabled={variants.length > 0} onChange={e => setE({ stock: parseInt(e.target.value) || 0 })} className={inp} /></div>
                  <div><label className={lbl}>Price ($)</label><input type="number" value={editing.price ?? 0} onChange={e => setE({ price: parseFloat(e.target.value) || 0 })} className={inp} /></div>
                  <div><label className={lbl}>Compare-at ($)</label><input type="number" value={editing.compareAtPrice ?? ''} onChange={e => setE({ compareAtPrice: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="Optional" className={inp} /></div>
                </div>

                {/* Variants / SKU / inventory */}
                <div className="pt-4 border-t border-white/8">
                  <div className="flex items-center justify-between mb-2"><label className={lbl + ' mb-0'}>Variants · SKU · inventory</label><button onClick={addVariant} className="text-[9px] font-black uppercase tracking-widest text-small-orange flex items-center gap-1"><Plus size={11} /> Add variant</button></div>
                  {variants.length === 0 ? <p className="text-[10px] text-white/25">No variants — the product uses the single stock above. Add variants (e.g. Large / Black) for per-SKU inventory & pricing.</p> : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-2 px-1 text-[7px] font-black uppercase tracking-widest text-white/30"><span>Name</span><span>SKU</span><span>Stock</span><span>±Price</span><span /></div>
                      {variants.map((v, i) => (
                        <div key={v.id} className="grid grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-2 items-center">
                          <input value={v.name} onChange={e => setVariant(i, { name: e.target.value })} placeholder="Large / Black" className={`${inp} py-2 text-xs`} />
                          <input value={v.sku || ''} onChange={e => setVariant(i, { sku: e.target.value })} placeholder="SKU" className={`${inp} py-2 text-xs`} />
                          <input type="number" value={v.stock} onChange={e => setVariant(i, { stock: parseInt(e.target.value) || 0 })} className={`${inp} py-2 text-xs`} />
                          <input type="number" value={v.priceModifier ?? ''} onChange={e => setVariant(i, { priceModifier: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="0" className={`${inp} py-2 text-xs`} />
                          <button onClick={() => setVariants(vs => vs.filter((_, j) => j !== i))} className="text-white/30 hover:text-rose-400"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rich product page */}
                <div className="pt-4 border-t border-white/8 space-y-3">
                  <div className="flex items-center justify-between"><label className={lbl + ' mb-0'}>Rich product page</label>
                    <button onClick={() => setE({ isClothing: !editing.isClothing })} className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${editing.isClothing ? 'bg-small-orange/20 border-small-orange/40 text-small-orange' : 'border-white/10 text-white/40'}`}>{editing.isClothing ? '✓ Clothing · AI try-on' : 'Mark as clothing'}</button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><label className={lbl}>Gallery — one URL/line</label><textarea value={rich.images} onChange={e => setRich(r => ({ ...r, images: e.target.value }))} rows={3} placeholder={'https://…/front.jpg'} className={`${inp} text-xs resize-none`} /></div>
                    <div><label className={lbl}>Highlights — one/line</label><textarea value={rich.features} onChange={e => setRich(r => ({ ...r, features: e.target.value }))} rows={3} placeholder={'Heavyweight cotton'} className={`${inp} text-xs resize-none`} /></div>
                    <div><label className={lbl}>Specs — "Label: Value"</label><textarea value={rich.specs} onChange={e => setRich(r => ({ ...r, specs: e.target.value }))} rows={3} placeholder={'Material: 100% cotton'} className={`${inp} text-xs resize-none`} /></div>
                    <div><label className={lbl}>Colors — "Name #hex"</label><textarea value={rich.colors} onChange={e => setRich(r => ({ ...r, colors: e.target.value }))} rows={3} placeholder={'Vintage Black #1a1a1a'} className={`${inp} text-xs resize-none`} /></div>
                  </div>
                  <div><label className={lbl}>Sizes — comma separated</label><input value={rich.sizes} onChange={e => setRich(r => ({ ...r, sizes: e.target.value }))} placeholder="XS, S, M, L, XL" className={inp} /></div>
                </div>

                {/* Fulfillment */}
                <div className="pt-4 border-t border-white/8 space-y-3">
                  <label className={lbl + ' flex items-center gap-1.5'}><Truck size={12} /> Fulfillment</label>
                  <select value={editing.fulfillmentSource || 'manual'} onChange={e => setE({ fulfillmentSource: e.target.value as any })} className={inp}>
                    <option value="manual">Manual (you ship it)</option>
                    {listFulfillmentProviders().filter(p => p.id !== 'manual').map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    <option value="api">Custom API (any provider)</option>
                    <option value="external">External store link</option>
                  </select>
                  {editing.fulfillmentSource === 'api' && (
                    <div className="grid grid-cols-2 gap-3">
                      <input value={editing.fulfillmentProviderId || ''} onChange={e => setE({ fulfillmentProviderId: e.target.value })} placeholder="Provider id" className={inp} />
                      <input value={editing.fulfillmentExternalId || ''} onChange={e => setE({ fulfillmentExternalId: e.target.value })} placeholder="Product id at provider" className={inp} />
                    </div>
                  )}
                  {editing.fulfillmentSource === 'external' && <input value={editing.externalStoreUrl || ''} onChange={e => setE({ externalStoreUrl: e.target.value })} placeholder="https://your-store.com/product" className={inp} />}
                </div>

                {/* Flags */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {([['isActive', 'Active'], ['isFeatured', 'Featured'], ['isDigital', 'Digital good']] as const).map(([k, t]) => (
                    <button key={k} onClick={() => setE({ [k]: !(editing as any)[k] } as any)} className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${(editing as any)[k] ? 'bg-small-orange/20 border-small-orange/40 text-small-orange' : 'border-white/10 text-white/40'}`}>{(editing as any)[k] ? '✓ ' : ''}{t}</button>
                  ))}
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/8">
                  <button onClick={save} disabled={saving || !editing.title.trim()} className="flex-1 py-3.5 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2">{saving ? 'Saving…' : (isNew ? <><Sparkles size={15} /> Create product</> : 'Save changes')}</button>
                  <button onClick={close} className="px-8 py-3.5 bg-white/5 hover:bg-white/10 rounded-full font-black text-xs uppercase tracking-widest text-white/70">Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreProductManager;
