import React, { useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Sparkles, X, Package, Shirt, Download, Link2, Trash2, Check, ChevronDown, Star, Plus } from 'lucide-react';
import type { StoreProduct, StoreProductVariant, StoreProductCategory } from '../../types';
import {
  buildVariantMatrix, suggestSku, storefrontBadge, marginPct, isSafeVariantId, SIZE_PRESETS, COLOR_PRESETS, DEFAULT_LOW_STOCK,
} from '../../services/inventoryCore';
import { saveProduct, uploadProductPhotos, draftListingFromPhoto } from '../../services/inventoryService';
import { listFulfillmentProviders } from '../../services/fulfillment';
import { Button, Chip } from '../ui';
import Sheet from './Sheet';
import BarcodeScanner from './BarcodeScanner';
import { GROCERY_PACK } from '../../services/ebtCore';

/**
 * Add / edit a product. Designed around three facts about small sellers:
 *   1. they have a PHOTO before they have copy → photo first, and the listing drafts itself from it;
 *   2. only title + price + count are truly required → everything else folds away under "More";
 *   3. not everything is countable → print-on-demand / digital / sold-elsewhere never ask for stock.
 * Sizes × colors become a stock grid automatically (and regenerating never loses existing counts).
 */

type Mode = 'SHIP' | 'POD' | 'DIGITAL' | 'ELSEWHERE';
const CATS: StoreProductCategory[] = ['APPAREL', 'MUSIC', 'ACCESSORIES', 'DIGITAL', 'COLLECTIBLES', 'BOOKS', 'ELECTRONICS', 'HOME', 'ART', 'OTHER'];
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

const modeOf = (p?: StoreProduct): Mode => {
  if (!p) return 'SHIP';
  if (p.fulfillmentSource === 'external') return 'ELSEWHERE';
  if (p.isDigital) return 'DIGITAL';
  if (p.fulfillmentSource === 'printful' || p.fulfillmentSource === 'gelato' || p.fulfillmentSource === 'api') return 'POD';
  return 'SHIP';
};

/** Recover the size/color lists from an existing product's variants ("L / Black"). */
const optionsOf = (p?: StoreProduct): { sizes: string[]; colors: { name: string; hex: string }[] } => {
  const vs = p?.variants || [];
  if (!vs.length) return { sizes: [], colors: [] };
  const hexOf = (n: string) => p?.colorOptions?.find(c => c.name.toLowerCase() === n.toLowerCase())?.hex || COLOR_PRESETS.find(c => c.name.toLowerCase() === n.toLowerCase())?.hex || '#888888';
  if (vs.every(v => v.name.includes(' / '))) {
    const sizes = [...new Set(vs.map(v => v.name.split(' / ')[0]))];
    const colors = [...new Set(vs.map(v => v.name.split(' / ').slice(1).join(' / ')))].map(name => ({ name, hex: hexOf(name) }));
    return { sizes, colors };
  }
  return { sizes: vs.map(v => v.name), colors: [] };
};

const SectionTitle: React.FC<{ n?: number; children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="mb-2">
    <p className="pj-eyebrow">{children}</p>
    {hint && <p className="type-body-sm mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{hint}</p>}
  </div>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 text-left py-2">
    <span className="min-w-0">
      <span className="type-label-lg font-bold block" style={{ color: 'var(--text-primary)' }}>{label}</span>
      {hint && <span className="type-body-sm block" style={{ color: 'var(--on-surface-variant)' }}>{hint}</span>}
    </span>
    <span className="relative shrink-0 rounded-full transition-colors" style={{ width: 44, height: 26, background: on ? 'var(--pj-orange)' : 'var(--pj-glass-3)' }}>
      <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: on ? 21 : 3 }} />
    </span>
  </button>
);

const ProductEditor: React.FC<{
  who: { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG' };
  product?: StoreProduct;               // omit to create
  initialBarcode?: string;              // e.g. from a phone scan of an unknown item
  onClose: () => void;
  onSaved: () => void;
}> = ({ who, product, initialBarcode, onClose, onSaved }) => {
  const legacy = !!product && !!product.legacyMerchId && product.legacyMerchId === product.id;   // folded-in old merch: saving migrates it
  const isNew = !product || !product.id || legacy;          // '' id = a duplicate being created
  const o = optionsOf(product);

  const [mode, setMode] = useState<Mode>(modeOf(product));
  const [trackStock, setTrackStock] = useState<boolean>(product ? (product.trackInventory ?? modeOf(product) === 'SHIP') : true);
  const [title, setTitle] = useState(product?.title || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price ? String(product.price) : '');
  const [compareAt, setCompareAt] = useState(product?.compareAtPrice ? String(product.compareAtPrice) : '');
  const [cost, setCost] = useState(product?.costPrice ? String(product.costPrice) : '');
  const [category, setCategory] = useState<StoreProductCategory>(product?.category || 'OTHER');
  const [catTouched, setCatTouched] = useState(!!product);
  const [sku, setSku] = useState(product?.sku || '');
  const [barcode, setBarcode] = useState(product?.barcode || initialBarcode || '');
  const [taxClass, setTaxClass] = useState(product?.taxClass || 'STANDARD');
  const [snapEligible, setSnapEligible] = useState(!!product?.snapEligible);
  const [ageMin, setAgeMin] = useState(product?.ageRestricted ? String(product.ageRestricted) : '');
  const [scanOpen, setScanOpen] = useState(false);
  const [lowAt, setLowAt] = useState(String(product?.lowStockThreshold ?? DEFAULT_LOW_STOCK));
  const [weight, setWeight] = useState(product?.weight ? String(product.weight) : '');
  const [tags, setTags] = useState((product?.tags || []).filter(t => t !== 'demo-seed').join(', '));
  const [featured, setFeatured] = useState(!!product?.isFeatured);
  const [backorder, setBackorder] = useState(!!product?.allowBackorder);
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [baseStock, setBaseStock] = useState(String(product ? Math.max(0, product.stock ?? 0) : ''));
  const [sizes, setSizes] = useState<string[]>(o.sizes);
  const [colors, setColors] = useState<{ name: string; hex: string }[]>(o.colors);
  const [variants, setVariants] = useState<StoreProductVariant[]>(
    (product?.variants || []).map(v => ({ ...v, stock: Math.max(0, product?.variantStock?.[v.id] ?? v.stock ?? 0) })),
  );
  const [podProvider, setPodProvider] = useState<string>(
    product?.fulfillmentSource === 'gelato' ? 'gelato' : product?.fulfillmentSource === 'api' ? 'api' : 'printful');
  const [podProviderId, setPodProviderId] = useState(product?.fulfillmentProviderId || '');
  const [podExternalId, setPodExternalId] = useState(product?.fulfillmentExternalId || '');
  const [externalUrl, setExternalUrl] = useState(product?.externalStoreUrl || '');
  const [digitalUrl, setDigitalUrl] = useState(product?.digitalFileUrl || '');

  const [moreOpen, setMoreOpen] = useState(!!initialBarcode);
  const [uploading, setUploading] = useState<[number, number] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [err, setErr] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newHex, setNewHex] = useState('#ff8c00');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const firstFile = useRef<File | null>(null);

  const tracked = mode === 'SHIP' && trackStock;
  const priceN = parseFloat(price) || 0, costN = parseFloat(cost) || 0;
  const margin = marginPct(priceN, costN);
  const hasVariants = variants.length > 0;
  const providers = useMemo(() => listFulfillmentProviders().filter(p => p.id !== 'manual'), []);

  const regen = (nextSizes: string[], nextColors: { name: string; hex: string }[], existing = variants) =>
    setVariants(buildVariantMatrix({ title: title || 'Item', sizes: nextSizes, colors: nextColors.map(c => c.name), existing, autoSku: false }));
  const setSizeList = (xs: string[]) => { setSizes(xs); regen(xs, colors); };
  const setColorList = (xs: { name: string; hex: string }[]) => { setColors(xs); regen(sizes, xs); };
  const addSize = (s: string) => { const v = s.trim(); if (v && !sizes.some(x => x.toLowerCase() === v.toLowerCase())) setSizeList([...sizes, v]); setNewSize(''); };
  const toggleColor = (c: { name: string; hex: string }) =>
    setColorList(colors.some(x => x.name.toLowerCase() === c.name.toLowerCase()) ? colors.filter(x => x.name.toLowerCase() !== c.name.toLowerCase()) : [...colors, c]);
  const patchVariant = (id: string, patch: Partial<StoreProductVariant>) => setVariants(vs => vs.map(v => (v.id === id ? { ...v, ...patch } : v)));
  const setAllStock = (n: number) => setVariants(vs => vs.map(v => ({ ...v, stock: n })));

  // ── Photos + AI draft ──
  const addPhotos = async (files: FileList | File[] | null) => {
    const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    setErr(''); setUploading([0, list.length]);
    if (!firstFile.current && images.length === 0) firstFile.current = list[0];
    try {
      const urls = await uploadProductPhotos(list, (a, b) => setUploading([a, b]));
      setImages(prev => [...prev, ...urls]);
      // First photo on a blank listing → draft the copy from it (fills only what's still empty).
      if (!title.trim() && !description.trim() && urls.length && firstFile.current) await runDraft(firstFile.current, true);
    } catch (e: any) { setErr(e?.message || 'Photo upload failed — try again.'); }
    finally { setUploading(null); }
  };

  const runDraft = async (file: File | null, onlyEmpty: boolean) => {
    setDrafting(true);
    const d = await draftListingFromPhoto(file, title);
    setDrafting(false);
    if (!d) { if (!onlyEmpty) setErr('Couldn\'t draft that one — write a line or two and you\'re set.'); return; }
    setDrafted(true);
    if (!onlyEmpty || !title.trim()) setTitle(d.title);
    if (!onlyEmpty || !description.trim()) setDescription(d.description);
    if (!catTouched) setCategory(d.category);
    if (!tags.trim()) setTags(d.tags.join(', '));
  };

  // ── Save ──
  const save = async (publish: boolean) => {
    setErr('');
    if (!title.trim()) return setErr('Give it a name.');
    if (publish && !(priceN > 0)) return setErr('Set a price to publish — or save it as a hidden draft.');
    if (mode === 'ELSEWHERE' && publish && !/^https?:\/\//.test(externalUrl.trim())) return setErr('Add the link where this is sold (https://…).');
    if (mode === 'DIGITAL' && publish && !digitalUrl.trim()) return setErr('Add the file or link buyers receive.');
    if (hasVariants && variants.some(v => !isSafeVariantId(v.id))) return setErr('One option has an unsupported id — remove and re-add it.');

    const cmp = parseFloat(compareAt) || 0;
    const fields: Partial<StoreProduct> = {
      title: title.trim(), description: description.trim(), category, price: priceN,
      compareAtPrice: cmp > priceN ? cmp : undefined, costPrice: costN > 0 ? costN : undefined,
      images, isActive: publish ? true : (!isNew && product ? product.isActive : false),
      isDigital: mode === 'DIGITAL', digitalFileUrl: mode === 'DIGITAL' ? digitalUrl.trim() : undefined,
      trackInventory: tracked, allowBackorder: tracked && backorder ? true : undefined,
      lowStockThreshold: Math.max(0, parseInt(lowAt, 10) || 0),
      sku: !hasVariants && sku.trim() ? sku.trim() : undefined, barcode: barcode.trim() || undefined,
      // explicit values so the stored doc is deterministic (saveProduct merges onto the live doc)
      taxClass, snapEligible, ageRestricted: parseInt(ageMin, 10) > 0 ? parseInt(ageMin, 10) : 0,
      weight: parseFloat(weight) > 0 ? parseFloat(weight) : undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean), isFeatured: featured || undefined,
      sizeOptions: sizes.length ? sizes : undefined, colorOptions: colors.length ? colors : undefined,
      isClothing: category === 'APPAREL' ? true : product?.isClothing,
      fulfillmentSource: mode === 'POD' ? (podProvider as any) : mode === 'ELSEWHERE' ? 'external' : 'manual',
      fulfillmentProviderId: mode === 'POD' && podProvider === 'api' ? podProviderId.trim() || undefined : undefined,
      fulfillmentExternalId: mode === 'POD' ? podExternalId.trim() || undefined : undefined,
      externalStoreUrl: mode === 'ELSEWHERE' ? externalUrl.trim() : undefined,
    };
    // Migrating a legacy merch item keeps its provider links + points back at the old doc.
    const carry: Partial<StoreProduct> = legacy && product
      ? { legacyMerchId: product.id, printfulSyncProductId: product.printfulSyncProductId, printfulVariantId: product.printfulVariantId, linkedAssetId: product.linkedAssetId, videoUrl: product.videoUrl, worldId: product.worldId, rating: product.rating, reviewCount: product.reviewCount, features: product.features, specs: product.specs }
      : {};
    // SKUs are filled in now (not as options are picked) so they carry the FINAL title.
    const taken = new Set(variants.map(v => v.sku).filter(Boolean) as string[]);
    const finalVariants = variants.map(v => { if (v.sku?.trim()) return v; const k = suggestSku(title, v.name, taken); taken.add(k); return { ...v, sku: k }; });
    setSaving(publish ? 'publish' : 'draft');
    try {
      await saveProduct({
        ...who,
        id: isNew ? undefined : product!.id,
        original: isNew ? undefined : product,
        fields: { ...carry, ...fields },
        variants: finalVariants,
        // An untracked product's stock number is never touched (delta 0 against what it opened with).
        baseStock: tracked ? parseInt(baseStock, 10) || 0 : Math.max(0, product?.stock ?? 0),
      });
      onSaved(); onClose();
    } catch (e: any) { setErr(e?.message || 'Could not save — check your connection and try again.'); setSaving(null); }
  };

  const preview: StoreProduct = {
    id: 'preview', sellerId: who.sellerId, sellerName: who.sellerName, title: title || 'Your product', description,
    category, price: priceN, images, stock: hasVariants ? variants.reduce((s, v) => s + v.stock, 0) : parseInt(baseStock, 10) || 0,
    variants: hasVariants ? variants : undefined, isDigital: mode === 'DIGITAL', isActive: true, createdAt: 0, updatedAt: 0,
    trackInventory: tracked, allowBackorder: backorder, compareAtPrice: parseFloat(compareAt) > priceN ? parseFloat(compareAt) : undefined,
  };
  const badge = storefrontBadge(preview);

  const modeCards: { id: Mode; icon: React.ReactNode; title: string; sub: string }[] = [
    { id: 'SHIP', icon: <Package size={18} />, title: 'I make & ship it', sub: 'Count stock — we warn you before it runs out' },
    { id: 'POD', icon: <Shirt size={18} />, title: 'Print-on-demand', sub: 'No inventory. Printed when someone orders' },
    { id: 'DIGITAL', icon: <Download size={18} />, title: 'Digital download', sub: 'Instant delivery, unlimited stock' },
    { id: 'ELSEWHERE', icon: <Link2 size={18} />, title: 'Sold elsewhere', sub: 'Link out to Shopify, Etsy, your site' },
  ];

  return (
    <Sheet
      wide title={isNew ? 'New product' : 'Edit product'} eyebrow={legacy ? 'Upgrading your old merch item' : who.sellerName} onClose={onClose}
      footer={
        <div className="flex items-center gap-3 flex-wrap">
          <p className="type-body-sm flex-1 min-w-[10rem]" role={err ? 'alert' : undefined} style={{ color: err ? 'var(--pj-danger)' : 'var(--on-surface-variant)' }}>
            {err || (!isNew && product && !product.isActive ? 'Hidden from your shop' : 'Live in your shop the moment you publish')}
          </p>
          {(isNew || !product?.isActive) && <Button variant="secondary" size="md" loading={saving === 'draft'} disabled={!!saving} onClick={() => save(false)}>Save hidden</Button>}
          <Button variant="primary" size="md" icon={<Check />} loading={saving === 'publish'} disabled={!!saving} onClick={() => save(true)}>
            {isNew || !product?.isActive ? 'Publish' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="grid md:grid-cols-[1fr_15rem] gap-6">
        <div className="space-y-6 min-w-0">
          {/* 1 — Photos */}
          <section>
            <SectionTitle hint="Add a photo and we'll draft the name and description for you.">Photos</SectionTitle>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); addPhotos(e.dataTransfer.files); }}
              className="grid grid-cols-4 sm:grid-cols-5 gap-2 rounded-2xl p-2 transition-colors"
              style={{ background: drag ? 'var(--pj-orange-soft)' : 'transparent', outline: drag ? '2px dashed var(--pj-orange)' : undefined }}
            >
              {images.map((u, i) => (
                <div key={u + i} className="relative aspect-square rounded-xl overflow-hidden group" style={{ background: 'var(--pj-glass-2)' }}>
                  <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  {i === 0 ? (
                    <span className="absolute left-1 top-1 pj-chip pj-chip--brand" style={{ height: 20, fontSize: 9 }}>Cover</span>
                  ) : (
                    <button type="button" aria-label="Make cover photo" onClick={() => setImages(im => [im[i], ...im.filter((_, j) => j !== i)])}
                      className="absolute left-1 top-1 w-6 h-6 rounded-full bg-black/60 grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100"><Star size={12} className="text-white" /></button>
                  )}
                  <button type="button" aria-label="Remove photo" onClick={() => setImages(im => im.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/60 grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100"><X size={12} className="text-white" /></button>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!!uploading}
                className="aspect-square rounded-xl grid place-items-center text-center transition-colors"
                style={{ border: '2px dashed var(--pj-border-strong)', background: 'var(--pj-glass-1)', color: 'var(--on-surface-variant)' }}>
                <span>
                  <ImagePlus size={22} className="mx-auto mb-1" style={{ color: 'var(--pj-orange)' }} />
                  <span className="type-label-md block">{uploading ? `${uploading[0]}/${uploading[1]}…` : images.length ? 'Add' : 'Add photos'}</span>
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
            </div>
          </section>

          {/* 2 — Essentials */}
          <section className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pe-title" className="type-label-lg font-bold" style={{ color: 'var(--text-primary)' }}>Name</label>
                <Button variant="ghost" size="xs" icon={<Sparkles />} loading={drafting} onClick={() => runDraft(firstFile.current, false)}>{drafted ? 'Redo with AI' : 'Write it for me'}</Button>
              </div>
              <input id="pe-title" className="pj-input w-full" value={title} onChange={e => setTitle(e.target.value)} placeholder="Limited-edition tour hoodie" maxLength={80} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pe-price" className="type-label-lg font-bold block mb-1" style={{ color: 'var(--text-primary)' }}>Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--on-surface-variant)' }}>$</span>
                  <input id="pe-price" inputMode="decimal" className="pj-input w-full" style={{ paddingLeft: 26 }} value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
                </div>
              </div>
              {tracked && !hasVariants ? (
                <div>
                  <label htmlFor="pe-stock" className="type-label-lg font-bold block mb-1" style={{ color: 'var(--text-primary)' }}>How many do you have?</label>
                  <input id="pe-stock" inputMode="numeric" className="pj-input w-full" value={baseStock} onChange={e => setBaseStock(e.target.value.replace(/\D/g, ''))} placeholder="0" />
                </div>
              ) : (
                <div className="flex items-end"><p className="type-body-sm pb-3" style={{ color: 'var(--on-surface-variant)' }}>
                  {hasVariants && tracked ? `${variants.reduce((s, v) => s + v.stock, 0)} units across ${variants.length} options` : mode === 'SHIP' ? 'Stock isn\'t counted' : 'No stock to count'}
                </p></div>
              )}
            </div>
            {margin !== null && priceN > 0 && (
              <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                You keep <b style={{ color: 'var(--pj-success)' }}>${(priceN - costN).toFixed(2)}</b> per sale before fees · {margin}% margin
              </p>
            )}
          </section>

          {/* 3 — What kind of item */}
          <section>
            <SectionTitle hint="This decides whether we count stock.">How is it fulfilled?</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {modeCards.map(m => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
                  className="text-left rounded-2xl p-3 transition-colors flex gap-3"
                  style={{ background: mode === m.id ? 'var(--pj-orange-soft)' : 'var(--pj-glass-1)', border: `1px solid ${mode === m.id ? 'var(--pj-orange)' : 'var(--pj-border)'}` }}>
                  <span className="shrink-0 mt-0.5" style={{ color: mode === m.id ? 'var(--pj-orange)' : 'var(--on-surface-variant)' }}>{m.icon}</span>
                  <span className="min-w-0">
                    <span className="type-label-lg font-bold block" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
                    <span className="type-body-sm block" style={{ color: 'var(--on-surface-variant)' }}>{m.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            {mode === 'SHIP' && <Toggle on={trackStock} onChange={setTrackStock} label="Count stock for this item" hint="Turn off for things you can always make more of." />}
            {mode === 'POD' && (
              <div className="grid sm:grid-cols-2 gap-2 mt-3">
                <select className="pj-input" value={podProvider} onChange={e => setPodProvider(e.target.value)} aria-label="Print provider">
                  {providers.filter(p => p.id !== 'api').map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  <option value="api">Custom API (any provider)</option>
                </select>
                <input className="pj-input" value={podExternalId} onChange={e => setPodExternalId(e.target.value)} placeholder="Product id at the provider" />
                {podProvider === 'api' && <input className="pj-input sm:col-span-2" value={podProviderId} onChange={e => setPodProviderId(e.target.value)} placeholder="Provider id" />}
              </div>
            )}
            {mode === 'DIGITAL' && <input className="pj-input w-full mt-3" value={digitalUrl} onChange={e => setDigitalUrl(e.target.value)} placeholder="Link to the file buyers receive (https://…)" />}
            {mode === 'ELSEWHERE' && <input className="pj-input w-full mt-3" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://your-store.com/product" />}
          </section>

          {/* 4 — Sizes & colors → stock grid */}
          {mode !== 'DIGITAL' && mode !== 'ELSEWHERE' && (
            <section>
              <SectionTitle hint="Pick the sizes and colors you offer — we build the stock grid.">Sizes &amp; colors</SectionTitle>
              <div className="flex flex-wrap gap-2 mb-2">
                {(Object.keys(SIZE_PRESETS) as (keyof typeof SIZE_PRESETS)[]).map(k => (
                  <Chip key={k} interactive onClick={() => setSizeList([...SIZE_PRESETS[k]])}>{k}</Chip>
                ))}
                {sizes.length > 0 && <Chip interactive onClick={() => { setSizes([]); setColors([]); setVariants([]); }}>Clear</Chip>}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {sizes.map(s => (
                  <Chip key={s} selected>{s}<button type="button" aria-label={`Remove ${s}`} className="ml-1.5" onClick={() => setSizeList(sizes.filter(x => x !== s))}><X size={11} /></button></Chip>
                ))}
                <input className="pj-input" style={{ width: 140, height: 32 }} value={newSize} onChange={e => setNewSize(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSize(newSize); } }} onBlur={() => newSize && addSize(newSize)} placeholder="Add size / option" />
              </div>
              <div className="flex flex-wrap gap-2 items-center mt-3">
                {COLOR_PRESETS.map(c => {
                  const on = colors.some(x => x.name.toLowerCase() === c.name.toLowerCase());
                  return (
                    <button key={c.name} type="button" onClick={() => toggleColor(c)} aria-pressed={on} title={c.name}
                      className="rounded-full transition-transform" style={{ width: 28, height: 28, background: c.hex, border: on ? '2px solid var(--pj-orange)' : '1px solid var(--pj-border-strong)', boxShadow: on ? '0 0 0 3px var(--pj-orange-soft)' : undefined, transform: on ? 'scale(1.08)' : undefined }} />
                  );
                })}
                {colors.filter(c => !COLOR_PRESETS.some(p => p.name.toLowerCase() === c.name.toLowerCase())).map(c => (
                  <Chip key={c.name} selected><span className="inline-block rounded-full mr-1.5" style={{ width: 10, height: 10, background: c.hex }} />{c.name}<button type="button" aria-label={`Remove ${c.name}`} className="ml-1.5" onClick={() => toggleColor(c)}><X size={11} /></button></Chip>
                ))}
                <input type="color" aria-label="Custom color" value={newHex} onChange={e => setNewHex(e.target.value)} className="rounded-full" style={{ width: 28, height: 28, padding: 0, border: 0, background: 'none' }} />
                <input className="pj-input" style={{ width: 120, height: 32 }} value={newColor} onChange={e => setNewColor(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newColor.trim()) { e.preventDefault(); toggleColor({ name: newColor.trim(), hex: newHex }); setNewColor(''); } }} placeholder="Custom color" />
              </div>

              {hasVariants && (
                <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--pj-border)' }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--pj-glass-2)' }}>
                    <p className="type-label-lg font-bold" style={{ color: 'var(--text-primary)' }}>{variants.length} options</p>
                    {tracked && (
                      <div className="flex items-center gap-1.5">
                        <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Set all to</span>
                        {[0, 5, 10, 25].map(n => <Button key={n} variant="secondary" size="xs" square onClick={() => setAllStock(n)}>{n}</Button>)}
                      </div>
                    )}
                  </div>
                  {variants.map(v => (
                    <div key={v.id} className="grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: tracked ? 'minmax(0,1fr) minmax(0,1.25fr) 64px 64px' : 'minmax(0,1fr) minmax(0,1.25fr) 64px', borderTop: '1px solid var(--pj-border)' }}>
                      <p className="type-label-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={v.name}>{v.name}</p>
                      <input className="pj-input" style={{ height: 32 }} value={v.sku || ''} onChange={e => patchVariant(v.id, { sku: e.target.value })} placeholder="SKU" aria-label={`${v.name} SKU`} />
                      {tracked && <input className="pj-input text-center tabular-nums" style={{ height: 32 }} inputMode="numeric" value={v.stock} onFocus={e => e.currentTarget.select()} onChange={e => patchVariant(v.id, { stock: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })} aria-label={`${v.name} stock`} />}
                      <input className="pj-input text-center tabular-nums" style={{ height: 32 }} inputMode="decimal" value={v.priceModifier ?? ''} onChange={e => patchVariant(v.id, { priceModifier: e.target.value ? parseFloat(e.target.value) || 0 : undefined })} placeholder="±$" aria-label={`${v.name} price difference`} />
                    </div>
                  ))}
                  <p className="type-body-sm px-3 py-2" style={{ color: 'var(--on-surface-variant)', borderTop: '1px solid var(--pj-border)' }}>Columns: option · SKU{tracked ? ' · in stock' : ''} · price difference (e.g. +2 for 2XL)</p>
                </div>
              )}
            </section>
          )}

          {/* 5 — More */}
          <section>
            <button type="button" onClick={() => setMoreOpen(o => !o)} className="flex items-center gap-2 type-label-lg font-bold" aria-expanded={moreOpen} style={{ color: 'var(--text-primary)' }}>
              <ChevronDown size={16} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} /> More options
              <span className="type-body-sm font-normal" style={{ color: 'var(--on-surface-variant)' }}>description · cost · SKU · alerts</span>
            </button>
            {moreOpen && (
              <div className="mt-3 space-y-3">
                <textarea className="pj-input w-full" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell people what makes it great…" />
                <div className="grid grid-cols-2 gap-3">
                  <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Category
                    <select className="pj-input w-full mt-1" value={category} onChange={e => { setCategory(e.target.value as StoreProductCategory); setCatTouched(true); }}>{CATS.map(c => <option key={c} value={c}>{cap(c)}</option>)}</select></label>
                  <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Was price (crossed out)
                    <input className="pj-input w-full mt-1" inputMode="decimal" value={compareAt} onChange={e => setCompareAt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Optional" /></label>
                  <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Your cost per item
                    <input className="pj-input w-full mt-1" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Shows your margin" /></label>
                  {tracked && <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Warn me at
                    <input className="pj-input w-full mt-1" inputMode="numeric" value={lowAt} onChange={e => setLowAt(e.target.value.replace(/\D/g, ''))} /></label>}
                  {!hasVariants && <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>SKU
                    <input className="pj-input w-full mt-1" value={sku} onChange={e => setSku(e.target.value)} placeholder="Auto if blank" /></label>}
                  <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Barcode
                    <span className="flex gap-1.5 mt-1"><input className="pj-input w-full" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="UPC / EAN" /><Button variant="secondary" size="md" square iconOnly icon={<Camera />} aria-label="Scan barcode with camera" onClick={() => setScanOpen(true)} /></span></label>
                  <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Weight (grams)
                    <input className="pj-input w-full mt-1" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
                  <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Tags
                    <input className="pj-input w-full mt-1" value={tags} onChange={e => setTags(e.target.value)} placeholder="tour, limited, hoodie" /></label>
                </div>
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-container)' }}>
                  <div className="type-label-md font-bold" style={{ color: 'var(--text-primary)' }}>Register: tax, SNAP and age checks</div>
                  <div className="flex flex-wrap gap-1.5">
                    {GROCERY_PACK.map(pr => <button key={pr.id} type="button" className="pj-chip type-body-sm px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--outline-variant)' }} onClick={() => { setTaxClass(pr.taxClass); setSnapEligible(pr.snapEligible); setAgeMin(pr.ageRestricted ? String(pr.ageRestricted) : ''); }}>{pr.label}</button>)}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Tax class
                      <select className="pj-input w-full mt-1" value={taxClass} onChange={e => setTaxClass(e.target.value)}>{['STANDARD','EXEMPT','GROCERY_FOOD','PREPARED_FOOD'].map(c => <option key={c} value={c}>{c === 'STANDARD' ? 'Standard' : c === 'EXEMPT' ? 'Exempt (no tax)' : c === 'GROCERY_FOOD' ? 'Grocery food' : 'Prepared food'}</option>)}</select></label>
                    <label className="type-label-md font-bold block" style={{ color: 'var(--text-primary)' }}>Customer must be
                      <select className="pj-input w-full mt-1" value={ageMin} onChange={e => setAgeMin(e.target.value)}><option value="">Any age</option><option value="18">18+</option><option value="21">21+</option></select></label>
                  </div>
                  <Toggle on={snapEligible} onChange={setSnapEligible} label="SNAP / EBT eligible" hint="Eligible foods can be paid with EBT SNAP and are never taxed when they are." />
                </div>
                {tracked && <Toggle on={backorder} onChange={setBackorder} label="Keep selling when sold out" hint="For made-to-order and pre-orders. Never shows “sold out”." />}
                <Toggle on={featured} onChange={setFeatured} label="Feature in my shop" hint="Pinned to the top carousel." />
              </div>
            )}
          </section>

          {!isNew && (
            <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
              <Trash2 size={12} className="inline mr-1" />To delete this product, use the ⋯ menu on the list.
            </p>
          )}
        </div>

        {/* Live preview */}
        <aside className="hidden md:block">
          <p className="pj-eyebrow mb-2">How it looks</p>
          <div className="rounded-2xl overflow-hidden sticky top-0" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
            <div className="aspect-square relative" style={{ background: 'var(--pj-glass-2)' }}>
              {images[0] ? <img src={images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full grid place-items-center"><Package size={34} style={{ color: 'var(--on-surface-variant)', opacity: 0.4 }} /></div>}
              {badge.label && <span className="absolute left-2 top-2 pj-chip" style={{ height: 22, background: badge.soldOut ? 'rgba(0,0,0,.7)' : 'var(--pj-danger)', color: '#fff', borderColor: 'transparent' }}>{badge.label}</span>}
            </div>
            <div className="p-3">
              <p className="type-label-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>{title || 'Your product'}</p>
              <p className="type-label-lg font-black mt-0.5" style={{ color: 'var(--pj-orange)' }}>
                ${priceN.toFixed(2)}{preview.compareAtPrice ? <span className="font-normal line-through ml-1.5" style={{ color: 'var(--on-surface-variant)' }}>${preview.compareAtPrice.toFixed(2)}</span> : null}
              </p>
              {hasVariants && <p className="type-body-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{sizes.length ? `${sizes.length} sizes` : ''}{sizes.length && colors.length ? ' · ' : ''}{colors.length ? `${colors.length} colors` : ''}</p>}
            </div>
          </div>
          <Button variant="ghost" size="xs" className="mt-2" icon={<Plus />} onClick={() => setMoreOpen(true)}>More options</Button>
        </aside>
      </div>
      {scanOpen && <BarcodeScanner title="Scan the barcode" onDetect={c => { setBarcode(c); setScanOpen(false); }} onClose={() => setScanOpen(false)} />}
    </Sheet>
  );
};

export default ProductEditor;
