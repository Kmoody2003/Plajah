import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Package, AlertTriangle, Minus, Pencil, MoreHorizontal, Eye, EyeOff, Upload, Boxes, Sparkles, Check,
  TrendingUp, Truck, ClipboardList, Camera, History, ShoppingBag, Copy, CheckCircle2, Trash2, X, Users, ScanLine,
} from 'lucide-react';
import type { StoreProduct } from '../../types';
import { fetchUnifiedSellerProducts } from '../../services/storeService';
import {
  stockStatus, totalStock, liveVariants, isTracked, inventoryTotals, restockPlan, marginPct, STOCK_REASON_LABEL,
  DEFAULT_LOW_STOCK, type StockMove, type StockReason, type RestockItem,
} from '../../services/inventoryCore';
import {
  adjustStock, bulkPatch, bulkPriceChange, bulkDelete, fetchStockMoves, fetchSellerPulse, findByCode, waitlistCount, upgradeLegacyMerch,
  type SellerPulse,
} from '../../services/inventoryService';
import { seedDemoBusiness } from '../../services/businessOpsService';
import { Button, IconButton, Chip, ChipRail, useContextMenu, Eyebrow } from '../ui';
import type { MenuNode } from '../ui';
import BusinessOrdersPanel from '../BusinessOrdersPanel';
import ProductEditor from './ProductEditor';
import BarcodeScanner from './BarcodeScanner';
import StockSheet from './StockSheet';
import ImportSheet from './ImportSheet';
import Sheet from './Sheet';

/**
 * The ONE inventory screen — mounted in the Business dashboard AND the creator's merch shelf, over the same
 * `storeProducts` that power the public shop. What it's built to remove:
 *   • setup friction  → photo-first editor, AI-drafted listings, Shopify/Square/Etsy CSV import
 *   • "what do I reorder?" → Restock tab (sales speed × supplier lead time, per size)
 *   • overselling / shrinkage mysteries → stock ledger + variant-level counts the server enforces
 *   • hand-counting at a market stall → one-tap − / + that batches into one ledger entry
 */

type Tab = 'PRODUCTS' | 'RESTOCK' | 'ORDERS' | 'ACTIVITY';
type Filter = 'ALL' | 'ATTENTION' | 'OUT' | 'HIDDEN';
type Sort = 'NEWEST' | 'ATTENTION' | 'SELLERS' | 'NAME' | 'PRICE';

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const isLegacy = (p: StoreProduct) => !!p.legacyMerchId && p.legacyMerchId === p.id;
const dayLabel = (t: number) => {
  const d = new Date(t), n = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, n)) return 'Today';
  if (same(d, new Date(n.getTime() - 86_400_000))) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};
const timeLabel = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'warn' | 'good' | 'danger'; onClick?: () => void }> =
  ({ icon, label, value, sub, tone, onClick }) => {
    const c = tone === 'danger' ? 'var(--pj-danger)' : tone === 'warn' ? 'var(--pj-warning)' : tone === 'good' ? 'var(--pj-success)' : 'var(--text-primary)';
    const Tag: any = onClick ? 'button' : 'div';
    return (
      <Tag onClick={onClick} className="text-left rounded-2xl p-3.5 min-w-[10.5rem] flex-1 transition-colors" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
        <p className="flex items-center gap-1.5 pj-eyebrow whitespace-nowrap">{icon}{label}</p>
        <p className="type-title-lg font-black tabular-nums mt-1" style={{ color: c }}>{value}</p>
        {sub && <p className="type-body-sm mt-0.5 truncate" style={{ color: 'var(--on-surface-variant)' }}>{sub}</p>}
      </Tag>
    );
  };

const StatusPill: React.FC<{ p: StoreProduct }> = ({ p }) => {
  const s = stockStatus(p);
  if (s === 'OUT') return <span className="pj-chip" style={{ height: 22, background: 'var(--pj-danger-soft)', color: 'var(--pj-danger)', borderColor: 'transparent' }}>Sold out</span>;
  if (s === 'LOW') {
    const t = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : DEFAULT_LOW_STOCK;
    const gone = liveVariants(p).filter(v => v.stock <= 0).length;
    // Total looks healthy but one size/color is gone — say THAT, not "Low · 23 left".
    const label = totalStock(p) > t && gone > 0 ? `${gone} option${gone === 1 ? '' : 's'} sold out` : `Low · ${totalStock(p)} left`;
    return <span className="pj-chip" style={{ height: 22, background: 'var(--pj-warning-soft)', color: 'var(--pj-warning)', borderColor: 'transparent' }}><AlertTriangle size={10} />{label}</span>;
  }
  if (s === 'UNTRACKED') return <span className="pj-chip" style={{ height: 22 }}>{p.isDigital ? 'Digital' : p.fulfillmentSource === 'external' ? 'Sold elsewhere' : 'Made on demand'}</span>;
  return null;
};

const InventoryHub: React.FC<{
  sellerId: string;
  sellerName: string;
  sellerType?: 'USER' | 'ORG';
  sellerPhoto?: string;
  /** Wording only: a business has a "store", a creator has a "shop". */
  audience?: 'business' | 'creator';
  canEdit?: boolean;
  /** Demo data (guided tours, previews): replaces the Firestore reads. Nothing is persisted — edits simply fail soft and revert. */
  demo?: { products: StoreProduct[]; pulse: SellerPulse; moves: StockMove[] };
}> = ({ sellerId, sellerName, sellerType = 'USER', sellerPhoto, audience = 'creator', canEdit: canEditProp = true, demo }) => {
  const canEdit = canEditProp;
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const isDemo = !!demo;
  const who = useMemo(() => ({ sellerId, sellerName, sellerType }), [sellerId, sellerName, sellerType]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [pulse, setPulse] = useState<SellerPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('PRODUCTS');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<Sort>('NEWEST');
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ product?: StoreProduct; barcode?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [stockFor, setStockFor] = useState<{ product: StoreProduct; reason?: StockReason; prefill?: { variantId?: string; add: number } } | null>(null);
  const [importing, setImporting] = useState(false);
  const [priceSheet, setPriceSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StoreProduct[] | null>(null);
  const [lead, setLead] = useState(14);
  const [moves, setMoves] = useState<StockMove[] | null>(null);
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = (m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(''), 3200); };

  const load = useCallback(async () => {
    const d = demoRef.current;
    if (d) { setProducts(d.products); setPulse(d.pulse); setLoading(false); return; }
    const [ps, pl] = await Promise.all([
      fetchUnifiedSellerProducts(sellerId, sellerName).catch(() => [] as StoreProduct[]),
      fetchSellerPulse(sellerId, 30),
    ]);
    setProducts(ps); setPulse(pl); setLoading(false);
  }, [sellerId, sellerName, isDemo]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { if (tab === 'ACTIVITY') (demoRef.current ? Promise.resolve(demoRef.current.moves) : fetchStockMoves(sellerId)).then(setMoves); }, [tab, sellerId, products, isDemo]);

  // ── Derived ──
  const totals = useMemo(() => inventoryTotals(products), [products]);
  const plan = useMemo(() => (pulse ? restockPlan(products, pulse.sales, { leadDays: lead }) : []), [products, pulse, lead]);
  const attention = totals.low + totals.out;

  // Who's waiting on sold-out items (shown on the Restock tab).
  useEffect(() => {
    if (tab !== 'RESTOCK') return;
    const ids = [...new Set(plan.filter(r => r.urgency === 'OUT').map(r => r.product.id))].filter(id => waiting[id] === undefined && !(products.find(p => p.id === id) && isLegacy(products.find(p => p.id === id) as StoreProduct))).slice(0, 12);
    ids.forEach(id => waitlistCount(id).then(n => setWaiting(w => ({ ...w, [id]: n }))));
  }, [tab, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let xs = products.filter(p => {
      if (filter === 'ATTENTION' && !['LOW', 'OUT'].includes(stockStatus(p))) return false;
      if (filter === 'OUT' && stockStatus(p) !== 'OUT') return false;
      if (filter === 'HIDDEN' && p.isActive !== false) return false;
      if (!needle) return true;
      return [p.title, p.sku, p.barcode, p.category, ...(p.tags || []), ...(p.variants || []).flatMap(v => [v.name, v.sku, v.barcode])]
        .some(x => (x || '').toLowerCase().includes(needle));
    });
    const rank = (p: StoreProduct) => ({ OUT: 0, LOW: 1, OK: 2, UNTRACKED: 3 }[stockStatus(p)]);
    xs = [...xs].sort((a, b) => {
      if (sort === 'ATTENTION') return rank(a) - rank(b) || (b.createdAt || 0) - (a.createdAt || 0);
      if (sort === 'SELLERS') return (b.soldCount || 0) - (a.soldCount || 0);
      if (sort === 'NAME') return a.title.localeCompare(b.title);
      if (sort === 'PRICE') return (b.price || 0) - (a.price || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return xs;
  }, [products, q, filter, sort]);

  // ── Quick stock steppers: optimistic, and a burst of taps becomes ONE ledger entry ──
  const pending = useRef<Map<string, { delta: number; timer: number }>>(new Map());
  const bump = (p: StoreProduct, delta: number) => {
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, stock: Math.max(0, (x.stock ?? 0) + delta) } : x));
    const cur = pending.current.get(p.id);
    if (cur) window.clearTimeout(cur.timer);
    const total = (cur?.delta || 0) + delta;
    const timer = window.setTimeout(async () => {
      pending.current.delete(p.id);
      if (!total) return;
      try { await adjustStock({ product: p, delta: total, reason: total > 0 ? 'RECEIVE' : 'OFFLINE_SALE' }); }
      catch { say('Couldn\'t save that count — reloading.'); load(); }
    }, 700);
    pending.current.set(p.id, { delta: total, timer });
  };

  const toggleLive = async (p: StoreProduct) => {
    if (isLegacy(p)) { setEditor({ product: p }); return; }     // migrate first (saving upgrades it)
    const next = p.isActive === false;
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, isActive: next } : x));
    try { await bulkPatch([p.id], { isActive: next }); say(next ? `${p.title} is live` : `${p.title} hidden`); }
    catch { say('Couldn\'t update — reloading.'); load(); }
  };

  // A copy starts hidden with ZERO stock — duplicating a product must never duplicate inventory you don't have.
  const duplicate = (p: StoreProduct) => setEditor({ product: {
    ...p, id: '', title: `${p.title} copy`, isActive: false, soldCount: 0, rating: undefined, reviewCount: undefined, legacyMerchId: undefined,
    stock: 0, variantStock: undefined, variants: p.variants?.map(v => ({ ...v, stock: 0 })), sku: undefined, barcode: undefined,
  } as StoreProduct });

  const menu = useContextMenu<StoreProduct>((p) => {
    const items: MenuNode<StoreProduct>[] = [
      { kind: 'header', label: p.title || 'Untitled' },
      { id: 'edit', label: 'Edit product', icon: <Pencil size={14} />, onSelect: x => setEditor({ product: x }) },
    ];
    if (isTracked(p)) items.push({ id: 'stock', label: 'Update stock', icon: <Boxes size={14} />, onSelect: x => setStockFor({ product: x }) });
    items.push(
      { id: 'live', label: p.isActive === false ? 'Show in shop' : 'Hide from shop', icon: p.isActive === false ? <Eye size={14} /> : <EyeOff size={14} />, onSelect: toggleLive },
      { id: 'dup', label: 'Duplicate', icon: <Copy size={14} />, onSelect: duplicate },
      { kind: 'separator' },
      { id: 'del', label: 'Delete', danger: true, icon: <Trash2 size={14} />, onSelect: x => setConfirmDelete([x]) },
    );
    return items;
  });

  // ── Bulk ──
  const togglePick = (id: string) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickedProducts = products.filter(p => picked.has(p.id));
  const exitSelect = () => { setSelectMode(false); setPicked(new Set()); };
  const runBulk = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await fn(); say(done); exitSelect(); await load(); } catch { say('Something went wrong — nothing was changed that you can\'t retry.'); } finally { setBusy(false); }
  };
  const realIds = (ps: StoreProduct[]) => ps.filter(p => !isLegacy(p)).map(p => p.id);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const real = realIds(confirmDelete);
      if (real.length) await bulkDelete(real);
      const legacy = confirmDelete.filter(isLegacy);
      if (legacy.length) { const { deleteMerchItem } = await import('../../services/backendService'); for (const l of legacy) await deleteMerchItem(l.id); }
      say(`Deleted ${confirmDelete.length}`); setConfirmDelete(null); exitSelect(); await load();
    } catch { say('Couldn\'t delete — try again.'); } finally { setBusy(false); }
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const hit = findByCode(products, q);                       // USB / bluetooth scanners type the code + Enter
    if (hit) { setStockFor({ product: hit.product, reason: 'RECEIVE', prefill: { variantId: hit.variantId, add: 1 } }); setQ(''); }
  };

  const legacyItems = useMemo(() => products.filter(isLegacy), [products]);
  const upgradeAll = async () => {
    setBusy(true);
    try { const n = await upgradeLegacyMerch(legacyItems, who); say(`Upgraded ${n} item${n === 1 ? '' : 's'} — they can take orders now`); await load(); }
    catch { say('Couldn\'t upgrade — nothing was changed. Try again.'); }
    finally { setBusy(false); }
  };

  // Phone scan: a known code opens "receive 1" for that item/size; an unknown code starts a new product with the barcode filled in.
  const onScan = (code: string) => {
    setScanning(false);
    const hit = findByCode(products, code);
    if (hit) setStockFor({ product: hit.product, reason: 'RECEIVE', prefill: { variantId: hit.variantId, add: 1 } });
    else { say('New barcode — let\'s add it'); setEditor({ barcode: code }); }
  };

  const seedDemo = async () => { setBusy(true); await seedDemoBusiness(sellerId, sellerName).catch(() => {}); await load(); setBusy(false); };
  const shop = audience === 'business' ? 'store' : 'shop';

  const copyReorder = async () => {
    const lines = plan.map(r => `${r.suggest} × ${r.product.title}${r.variant ? ` (${r.variant.name})` : ''}${r.product.sku ? ` — ${r.variant?.sku || r.product.sku}` : r.variant?.sku ? ` — ${r.variant.sku}` : ''}`);
    try { await navigator.clipboard.writeText(`Reorder list — ${sellerName}\n${lines.join('\n')}`); say('Reorder list copied'); } catch { say('Couldn\'t copy — select and copy manually.'); }
  };

  // ── Render ──
  const tabs = [
    { id: 'PRODUCTS', label: 'Products', count: products.length || undefined, icon: <Package size={13} /> },
    { id: 'RESTOCK', label: 'Restock', count: plan.length || undefined, icon: <ClipboardList size={13} /> },
    { id: 'ORDERS', label: 'Orders', count: (pulse?.toFulfil || 0) || undefined, icon: <ShoppingBag size={13} /> },
    { id: 'ACTIVITY', label: 'Activity', icon: <History size={13} /> },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-5 py-5" style={{ color: 'var(--text-primary)' }}>
      {menu.node}

      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
        <div>
          <Eyebrow>Inventory</Eyebrow>
          <h2 className="type-headline-sm font-black">Your {shop}, in stock</h2>
          <p className="type-body-sm mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>Everything here is live in your {shop} the moment you publish — no syncing.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" icon={<Upload />} onClick={() => setImporting(true)}>Import</Button>
            <Button variant="primary" size="md" icon={<Plus />} onClick={() => setEditor({})}>Add product</Button>
          </div>
        )}
      </div>

      {/* Old merch shelf → working shop */}
      {!loading && canEdit && legacyItems.length > 0 && (
        <div className="rounded-2xl p-4 mb-5 flex items-center gap-3 flex-wrap" style={{ background: 'var(--pj-orange-soft)', border: '1px solid var(--pj-orange)' }}>
          <Sparkles size={18} style={{ color: 'var(--pj-orange)' }} />
          <p className="type-body-md flex-1 min-w-[14rem]"><b>{legacyItems.length} item{legacyItems.length === 1 ? '' : 's'} on your old merch shelf can't take orders yet.</b> Upgrade them in one tap — nothing is lost, and they'll appear on your page ready to buy.</p>
          <Button variant="primary" size="md" loading={busy} onClick={upgradeAll}>Upgrade {legacyItems.length}</Button>
        </div>
      )}

      {/* Pulse */}
      {!loading && products.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-5">
          <Stat icon={<Package size={11} />} label="Stock value" value={money(totals.retailValue)} sub={`${totals.units.toLocaleString()} units${totals.costValue > 0 ? ` · cost ${money(totals.costValue)}` : ''}`} />
          <Stat icon={<AlertTriangle size={11} />} label="Attention" value={String(attention)} tone={totals.out ? 'danger' : attention ? 'warn' : 'good'}
            sub={totals.out ? `${totals.out} sold out · ${totals.low} low` : attention ? `${totals.low} running low` : 'All stocked up'}
            onClick={() => { setTab('PRODUCTS'); setFilter(attention ? 'ATTENTION' : 'ALL'); }} />
          <Stat icon={<TrendingUp size={11} />} label="Last 30 days" value={money((pulse?.sales.revenueCents || 0) / 100)} sub={`${pulse?.sales.units || 0} sold${pulse?.sales.top[0] ? ` · top: ${pulse.sales.top[0].title}` : ''}`} />
          <Stat icon={<Truck size={11} />} label="To fulfil" value={String(pulse?.toFulfil || 0)} tone={pulse?.oversold ? 'danger' : pulse?.toFulfil ? 'warn' : undefined}
            sub={pulse?.oversold ? `${pulse.oversold} oversold — needs you` : pulse?.toFulfil ? 'Paid, waiting on you' : 'Nothing waiting'} onClick={() => setTab('ORDERS')} />
        </div>
      )}

      <ChipRail className="mb-5" items={tabs} activeId={tab} onSelect={id => setTab(id as Tab)} />

      {/* ───────────── PRODUCTS ───────────── */}
      {tab === 'PRODUCTS' && (
        loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-[84px] rounded-2xl animate-pulse" style={{ background: 'var(--pj-glass-1)' }} />)}</div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl p-6 sm:p-10 text-center" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 grid place-items-center" style={{ background: 'var(--pj-grad-brand)' }}><Boxes size={26} color="#fff" /></div>
            <h3 className="type-title-lg font-black">Let's stock your {shop}</h3>
            <p className="type-body-md mt-1 mb-6 mx-auto max-w-md" style={{ color: 'var(--on-surface-variant)' }}>Add your first item in about 30 seconds — a photo, a price and a count. We handle the rest.</p>
            <div className="grid sm:grid-cols-3 gap-3 text-left max-w-3xl mx-auto">
              {[
                { icon: <Plus size={18} />, t: 'Add your first product', d: 'Snap a photo — we draft the listing.', on: () => setEditor({}), primary: true },
                { icon: <Upload size={18} />, t: 'Import from Shopify, Square, Etsy', d: 'Drop your CSV. Variants and stock come along.', on: () => setImporting(true) },
                ...(audience === 'business' ? [{ icon: <Sparkles size={18} />, t: 'Try it with sample items', d: 'A demo catalog so you can look around.', on: seedDemo }] : []),
              ].map(c => (
                <button key={c.t} type="button" onClick={c.on} disabled={busy} className="rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                  style={{ background: c.primary ? 'var(--pj-orange-soft)' : 'var(--pj-glass-2)', border: `1px solid ${c.primary ? 'var(--pj-orange)' : 'var(--pj-border)'}` }}>
                  <span style={{ color: 'var(--pj-orange)' }}>{c.icon}</span>
                  <p className="type-label-lg font-bold mt-2">{c.t}</p>
                  <p className="type-body-sm mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{c.d}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 items-center flex-wrap mb-3">
              <div className="relative flex-1 min-w-[12rem]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--on-surface-variant)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearchKey} className="pj-input w-full" style={{ paddingLeft: 38 }} placeholder="Search — or scan a barcode to add stock" aria-label="Search products" />
                {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={14} /></button>}
              </div>
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="pj-input" style={{ width: 'auto' }} aria-label="Sort">
                <option value="NEWEST">Newest</option><option value="ATTENTION">Needs attention first</option><option value="SELLERS">Best sellers</option><option value="NAME">A–Z</option><option value="PRICE">Price: high to low</option>
              </select>
              {canEdit && <Button variant="secondary" size="md" icon={<Camera />} onClick={() => setScanning(true)}>Scan</Button>}
              {canEdit && <Button variant={selectMode ? 'primary' : 'secondary'} size="md" icon={<Check />} onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>{selectMode ? 'Done' : 'Select'}</Button>}
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              {([['ALL', 'All', products.length], ['ATTENTION', 'Needs attention', attention], ['OUT', 'Sold out', totals.out], ['HIDDEN', 'Hidden', products.filter(p => p.isActive === false).length]] as const).map(([id, label, n]) => (
                <Chip key={id} interactive selected={filter === id} onClick={() => setFilter(id)}>{label}{n ? ` · ${n}` : ''}</Chip>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="py-14 text-center type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Nothing matches. {q && <button className="underline" onClick={() => { setQ(''); setFilter('ALL'); }}>Clear filters</button>}</p>
            ) : (
              <div className="grid lg:grid-cols-2 gap-2.5">
                {shown.map(p => {
                  const st = stockStatus(p), tracked = st !== 'UNTRACKED', vs = liveVariants(p);
                  const low = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : DEFAULT_LOW_STOCK;
                  const margin = marginPct(p.price, p.costPrice);
                  return (
                    <div key={p.id} {...menu.bind(p)} onClick={selectMode ? () => togglePick(p.id) : undefined}
                      className="rounded-2xl p-3 flex gap-3 transition-colors"
                      style={{ background: 'var(--pj-glass-1)', border: `1px solid ${picked.has(p.id) ? 'var(--pj-orange)' : 'var(--pj-border)'}`, opacity: p.isActive === false ? 0.66 : 1, cursor: selectMode ? 'pointer' : undefined }}>
                      {selectMode && (
                        <span className="self-center shrink-0 grid place-items-center rounded-md" style={{ width: 22, height: 22, background: picked.has(p.id) ? 'var(--pj-orange)' : 'var(--pj-glass-3)', border: '1px solid var(--pj-border-strong)' }}>
                          {picked.has(p.id) && <Check size={14} color="#000" />}
                        </span>
                      )}
                      <button type="button" disabled={selectMode} onClick={() => setEditor({ product: p })} className="shrink-0 rounded-xl overflow-hidden" style={{ width: 68, height: 68, background: 'var(--pj-glass-2)' }} aria-label={`Edit ${p.title}`}>
                        {p.images?.[0] ? <img src={p.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="w-full h-full grid place-items-center"><Package size={22} style={{ color: 'var(--on-surface-variant)', opacity: 0.4 }} /></span>}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="type-label-lg font-bold truncate">{p.title}</p>
                            <p className="type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>
                              {money(p.price)}{margin !== null ? ` · ${margin}% margin` : ''}{p.isActive === false ? ' · hidden' : ''}{(p.soldCount || 0) > 0 ? ` · ${p.soldCount} sold` : ''}
                            </p>
                          </div>
                          {!selectMode && <IconButton aria-label="More" variant="ghost" size="xs" onClick={e => menu.openFrom(e.currentTarget, p)}><MoreHorizontal /></IconButton>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <StatusPill p={p} />
                          {isLegacy(p) && <Chip>Old merch · upgrade on edit</Chip>}
                          {tracked && !vs.length && !selectMode && canEdit && (
                            <span className="inline-flex items-center gap-1 ml-auto">
                              <IconButton square variant="secondary" size="xs" aria-label={`Remove one ${p.title}`} disabled={(p.stock ?? 0) <= 0} onClick={() => bump(p, -1)}><Minus /></IconButton>
                              <button type="button" className="tabular-nums font-black text-center rounded-lg" style={{ minWidth: 40, height: 28, background: 'var(--pj-glass-2)', color: st === 'OUT' ? 'var(--pj-danger)' : st === 'LOW' ? 'var(--pj-warning)' : 'var(--text-primary)' }} onClick={() => setStockFor({ product: p })} aria-label={`${p.title}: ${p.stock ?? 0} in stock. Edit count`}>{Math.max(0, p.stock ?? 0)}</button>
                              <IconButton square variant="secondary" size="xs" aria-label={`Add one ${p.title}`} onClick={() => bump(p, 1)}><Plus /></IconButton>
                            </span>
                          )}
                          {!selectMode && canEdit && <Button variant="ghost" size="xs" icon={p.isActive === false ? <Eye /> : <EyeOff />} onClick={() => toggleLive(p)} className={tracked && !vs.length ? '' : 'ml-auto'}>{p.isActive === false ? 'Show' : 'Hide'}</Button>}
                        </div>
                        {tracked && vs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {vs.slice(0, 8).map(v => (
                              <button key={v.id} type="button" disabled={selectMode || !canEdit} onClick={() => setStockFor({ product: p, prefill: { variantId: v.id, add: 0 } })}
                                className="rounded-md px-1.5 tabular-nums" style={{ height: 22, fontSize: 11, fontWeight: 700,
                                  background: v.stock <= 0 ? 'var(--pj-danger-soft)' : v.stock <= low ? 'var(--pj-warning-soft)' : 'var(--pj-glass-2)',
                                  color: v.stock <= 0 ? 'var(--pj-danger)' : v.stock <= low ? 'var(--pj-warning)' : 'var(--on-surface-variant)' }}>
                                {v.name} <b>{v.stock}</b>
                              </button>
                            ))}
                            {vs.length > 8 && <span className="type-body-sm self-center" style={{ color: 'var(--on-surface-variant)' }}>+{vs.length - 8}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )
      )}

      {/* ───────────── RESTOCK ───────────── */}
      {tab === 'RESTOCK' && (
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Based on your last 30 days of sales. How long does a reorder take to arrive?</p>
            <div className="flex gap-2">{[7, 14, 30].map(d => <Chip key={d} interactive selected={lead === d} onClick={() => setLead(d)}>{d} days</Chip>)}</div>
          </div>
          {plan.length === 0 ? (
            <div className="rounded-3xl py-14 text-center" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
              <CheckCircle2 size={34} className="mx-auto mb-3" style={{ color: 'var(--pj-success)' }} />
              <p className="type-title-md font-bold">You're stocked up</p>
              <p className="type-body-md mt-1" style={{ color: 'var(--on-surface-variant)' }}>We'll tell you the moment something runs low — and what to order.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {plan.map((r: RestockItem) => {
                  const key = `${r.product.id}-${r.variant?.id || ''}`;
                  const tone = r.urgency === 'OUT' ? 'var(--pj-danger)' : r.urgency === 'SOON' ? 'var(--pj-warning)' : 'var(--on-surface-variant)';
                  const w = waiting[r.product.id];
                  return (
                    <div key={key} className="rounded-2xl p-3 flex gap-3 items-center" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
                      <div className="shrink-0 rounded-xl overflow-hidden" style={{ width: 56, height: 56, background: 'var(--pj-glass-2)' }}>
                        {r.product.images?.[0] && <img src={r.product.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="type-label-lg font-bold truncate">{r.product.title}{r.variant ? <span style={{ color: 'var(--on-surface-variant)' }}> · {r.variant.name}</span> : null}</p>
                        <p className="type-body-sm" style={{ color: tone }}>
                          {r.urgency === 'OUT' ? 'Sold out' : `${r.onHand} left`}
                          {r.perDay > 0 ? ` · selling ~${r.perDay < 0.1 ? '<0.1' : r.perDay.toFixed(1)}/day${r.urgency !== 'OUT' && Number.isFinite(r.cover) ? ` → out in ${Math.max(1, Math.round(r.cover))} day${Math.round(r.cover) === 1 ? '' : 's'}` : ''}` : ' · no recent sales'}
                        </p>
                        <p className="type-body-sm flex items-center gap-2" style={{ color: 'var(--on-surface-variant)' }}>
                          Order about <b style={{ color: 'var(--text-primary)' }}>{r.suggest}</b>
                          {w ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--pj-orange)' }}><Users size={11} />{w} waiting</span> : null}
                        </p>
                      </div>
                      {canEdit && <Button variant="primary" size="sm" icon={<Check />} onClick={() => setStockFor({ product: r.product, reason: 'RECEIVE', prefill: { variantId: r.variant?.id, add: r.suggest } })}>Received</Button>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4"><Button variant="secondary" size="md" icon={<Copy />} onClick={copyReorder}>Copy reorder list</Button></div>
            </>
          )}
        </div>
      )}

      {/* ───────────── ORDERS ───────────── */}
      {tab === 'ORDERS' && isDemo && <p className="py-14 text-center type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Orders appear here as customers buy — with their shipping address, tracking and one-tap fulfilment.</p>}
      {tab === 'ORDERS' && !isDemo && <BusinessOrdersPanel businessUid={sellerId} businessName={sellerName} businessPhoto={sellerPhoto} onChanged={load} />}

      {/* ───────────── ACTIVITY ───────────── */}
      {tab === 'ACTIVITY' && (
        moves === null ? <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--pj-glass-1)' }} /> :
        moves.length === 0 ? (
          <p className="py-14 text-center type-body-md" style={{ color: 'var(--on-surface-variant)' }}>No stock activity yet. Every sale, delivery, recount and write-off lands here — so you can always see where inventory went.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(moves.reduce<Record<string, StockMove[]>>((g, m) => { (g[dayLabel(m.at)] ||= []).push(m); return g; }, {})).map(([day, ms]) => (
              <div key={day}>
                <Eyebrow>{day}</Eyebrow>
                <div className="mt-2 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--pj-border)' }}>
                  {ms.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ background: 'var(--pj-glass-1)', borderTop: i ? '1px solid var(--pj-border)' : undefined }}>
                      <span className="tabular-nums font-black shrink-0 text-center rounded-lg" style={{ minWidth: 48, padding: '3px 0', background: m.delta > 0 ? 'var(--pj-success-soft)' : 'var(--pj-glass-2)', color: m.delta > 0 ? 'var(--pj-success)' : 'var(--text-primary)' }}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                      <div className="min-w-0 flex-1">
                        <p className="type-label-lg font-semibold truncate">{m.productTitle}{m.variantName ? ` · ${m.variantName}` : ''}</p>
                        <p className="type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>{STOCK_REASON_LABEL[m.reason] || m.reason} · {m.before} → {m.after}{m.note ? ` · ${m.note}` : ''}</p>
                      </div>
                      <span className="type-body-sm shrink-0" style={{ color: 'var(--on-surface-variant)' }}>{timeLabel(m.at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Bulk bar */}
      {selectMode && (
        <div className="fixed left-0 right-0 bottom-4 z-[1200] flex justify-center px-4 pointer-events-none">
          <div className="pj-surface pj-surface--5 pointer-events-auto flex items-center gap-2 flex-wrap justify-center" style={{ padding: '10px 14px', borderRadius: 999 }}>
            <span className="type-label-lg font-bold px-1">{picked.size} selected</span>
            <Button size="sm" variant="secondary" disabled={!picked.size || busy} onClick={() => runBulk(() => bulkPatch(realIds(pickedProducts), { isActive: true }), 'Published')}>Publish</Button>
            <Button size="sm" variant="secondary" disabled={!picked.size || busy} onClick={() => runBulk(() => bulkPatch(realIds(pickedProducts), { isActive: false }), 'Hidden')}>Hide</Button>
            <Button size="sm" variant="secondary" disabled={!picked.size || busy} onClick={() => setPriceSheet(true)}>Price…</Button>
            <Button size="sm" variant="danger-quiet" icon={<Trash2 />} disabled={!picked.size || busy} onClick={() => setConfirmDelete(pickedProducts)}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map(p => p.id)))}>All</Button>
          </div>
        </div>
      )}

      {/* Sheets */}
      {scanning && <BarcodeScanner title="Scan to add stock" hint="Scan an item's barcode — we'll find it or start a new product" onDetect={onScan} onClose={() => setScanning(false)} />}
      {editor && <ProductEditor who={who} product={editor.product} initialBarcode={editor.barcode} onClose={() => setEditor(null)} onSaved={() => { say('Saved'); load(); }} />}
      {stockFor && <StockSheet product={stockFor.product} reason={stockFor.reason} prefill={stockFor.prefill} onClose={() => setStockFor(null)} onDone={() => { say('Stock updated'); load(); }} />}
      {importing && <ImportSheet who={who} onClose={() => setImporting(false)} onDone={n => { say(`Imported ${n} product${n === 1 ? '' : 's'}`); load(); }} />}
      {priceSheet && <PriceSheet products={pickedProducts} onClose={() => setPriceSheet(false)} onApply={pct => runBulk(async () => { await bulkPriceChange(pickedProducts.filter(p => !isLegacy(p)), pct); setPriceSheet(false); }, 'Prices updated')} busy={busy} />}
      {confirmDelete && (
        <Sheet title={`Delete ${confirmDelete.length === 1 ? `“${confirmDelete[0].title}”` : `${confirmDelete.length} products`}?`} eyebrow="This can't be undone" onClose={() => setConfirmDelete(null)}
          footer={<div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Keep</Button><Button variant="danger" icon={<Trash2 />} loading={busy} onClick={doDelete}>Delete</Button></div>}>
          <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>They disappear from your {shop} right away. Past orders keep their record. Want to pause selling instead? Hide it — you can bring it back anytime.</p>
        </Sheet>
      )}

      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[1400] px-4 py-2.5 rounded-full type-label-lg font-bold pj-surface pj-surface--5" style={{ padding: '10px 18px' }}>{toast}</div>}
      <ScanHint show={tab === 'PRODUCTS' && products.length > 0} />
    </div>
  );
};

const ScanHint: React.FC<{ show: boolean }> = ({ show }) => (show ? <p className="type-body-sm mt-6 flex items-center gap-1.5" style={{ color: 'var(--on-surface-variant)' }}><ScanLine size={13} /> Tip: tap Scan to use your phone camera — or use a USB scanner in the search box.</p> : null);

const PriceSheet: React.FC<{ products: StoreProduct[]; onClose: () => void; onApply: (pct: number) => void; busy: boolean }> = ({ products, onClose, onApply, busy }) => {
  const [pct, setPct] = useState('10');
  const n = parseFloat(pct) || 0;
  const ex = products[0];
  return (
    <Sheet title="Change prices" eyebrow={`${products.length} product${products.length === 1 ? '' : 's'}`} onClose={onClose}
      footer={<div className="flex justify-end"><Button variant="primary" icon={<Check />} loading={busy} disabled={!n} onClick={() => onApply(n)}>{n > 0 ? `Raise by ${n}%` : n < 0 ? `Lower by ${Math.abs(n)}%` : 'Apply'}</Button></div>}>
      <div className="flex flex-wrap gap-2 mb-3">{[-20, -10, 5, 10, 20].map(v => <Chip key={v} interactive selected={n === v} onClick={() => setPct(String(v))}>{v > 0 ? '+' : ''}{v}%</Chip>)}</div>
      <input className="pj-input w-full" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value.replace(/[^0-9.\-]/g, ''))} aria-label="Percent change" />
      {ex && n !== 0 && <p className="type-body-sm mt-3" style={{ color: 'var(--on-surface-variant)' }}>e.g. {ex.title}: {money(ex.price)} → <b style={{ color: 'var(--text-primary)' }}>{money(Math.max(0.5, Math.round(ex.price * (1 + n / 100) * 100) / 100))}</b></p>}
    </Sheet>
  );
};

export default InventoryHub;
