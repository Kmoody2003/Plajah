// OrgStoreSection — the org's merch shop (Elevate).
//
// Uses the ONE canonical store: StoreProduct (storeProducts) keyed by the owner uid, where the owner is the
// org's linked account (org.accountUid) or its creator. The catalog is LIVE (commerceBus.subscribeCatalog):
// a sale at the register or a restock in Inventory updates the shop's stock badges without a refresh.
//
//   • public — category chips, product cards with live stock, product detail + cart, and checkout through the
//     storefront order spine (POST /api/store/create-order → Stripe; the server prices + stock-checks).
//   • manage — store on/off (only when signed in AS the owner account: it writes users/{ownerUid}) and the
//     shared StoreProductManager; other managers see the live shop preview and a hint.

import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, ExternalLink, Loader2, Power, Package } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import type { Ministry, Organization, StoreCartItem, StoreProduct, StoreSettings } from '../../types';
import { db } from '../../services/firebase';
import { auth } from '../../services/backendService';
import { updateOrganization } from '../../services/organizationService';
import { subscribeCatalog, onCommerce, applySaleLocally, boardPrice } from '../../services/commerceBus';
import { availableFor, storefrontBadge } from '../../services/inventoryCore';
import StoreProductManager from '../StoreProductManager';
import { CartSidebar } from '../StorePageView';
import ProductPage, { useProductRoute } from '../store/ProductPage';
import { startStoreCheckout, type CheckoutOptions } from '../../services/storeService';

export const orgStoreOwnerUid = (org: Pick<Organization, 'accountUid' | 'creatorId'>) => org.accountUid || org.creatorId;

export interface OrgStoreSectionProps {
  org: Organization;
  /** Store owner uid (storeProducts.sellerId). Defaults to the org's linked account / creator. */
  ownerUid?: string;
  /** May this viewer manage the store? Defaults to mode === 'manage'. */
  canManage?: boolean;
  mode?: 'public' | 'manage';
  /** Action colour (default Plajah orange). */
  accent?: string;
  onVisitUser?: (uid: string) => void;
  onOrgChange?: (o: Organization) => void;
  /** Department shop: only products tagged with this ministry (StoreProduct.ministryId). Same owner account and checkout. */
  ministry?: Ministry;
  /** Leaders' preview: also show unpublished drafts (isActive === false), badged "Draft" and not buyable. */
  previewDrafts?: boolean;
}

const DISPLAY = "'Bricolage Grotesque', Inter, system-ui, sans-serif";
const ORANGE = '#FF8C00';
const keyOf = (i: { product: StoreProduct; variantId?: string }) => `${i.product.id}|${i.variantId || ''}`;
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

const OrgStoreSection: React.FC<OrgStoreSectionProps> = ({ org, ownerUid: ownerProp, canManage, mode = 'public', accent = ORANGE, onVisitUser, onOrgChange, ministry, previewDrafts }) => {
  const ownerUid = ownerProp || orgStoreOwnerUid(org);
  const [all, setAll] = useState<StoreProduct[] | null>(null);
  const [settings, setSettings] = useState<StoreSettings | undefined>();
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [cat, setCat] = useState<string>('ALL');
  const [dept, setDept] = useState<string>('ALL');
  const [cart, setCart] = useState<StoreCartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [busySeller, setBusySeller] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [toggling, setToggling] = useState(false);
  const isStoreOwner = !!auth.currentUser && auth.currentUser.uid === ownerUid;
  const manage = mode === 'manage' && (canManage ?? true);

  useEffect(() => {
    setAll(null);
    const un = subscribeCatalog(ownerUid, setAll, { onError: () => setAll(a => a || []) });
    const off = onCommerce(e => { if (e.type === 'SALE' && e.sellerUid === ownerUid) setAll(a => (a ? applySaleLocally(a, e.lines) : a)); });
    return () => { un(); off(); };
  }, [ownerUid]);

  useEffect(() => {
    let alive = true;
    setSettingsLoaded(false);
    getDoc(doc(db, 'users', ownerUid))
      .then(s => { if (alive) setSettings(s.data()?.storeSettings as StoreSettings | undefined); })
      .catch(() => {})
      .finally(() => { if (alive) setSettingsLoaded(true); });
    return () => { alive = false; };
  }, [ownerUid]);

  const showDrafts = !!previewDrafts || mode === 'manage';
  const products = useMemo(() => (all || []).filter(p =>
    (showDrafts || p.isActive !== false) && (ministry ? p.ministryId === ministry.id : true)), [all, showDrafts, ministry]);
  // Main (org) shop: departments that have their own shelf → "Shop by department" chips.
  const deptName = (id?: string) => (id && org.ministries?.find(m => m.id === id)?.name) || '';
  const depts = useMemo(() => {
    if (ministry) return [] as [string, number][];
    const m = new Map<string, number>();
    products.forEach(p => { if (p.ministryId && deptName(p.ministryId)) m.set(p.ministryId, (m.get(p.ministryId) || 0) + 1); });
    return Array.from(m.entries());
  }, [products, ministry, org.ministries]);
  const inDept = dept === 'ALL' ? products : dept === 'MAIN' ? products.filter(p => !p.ministryId) : products.filter(p => p.ministryId === dept);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    inDept.forEach(p => m.set(p.category || 'OTHER', (m.get(p.category || 'OTHER') || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [inDept]);
  const shown = cat === 'ALL' ? inDept : inDept.filter(p => (p.category || 'OTHER') === cat);

  // The product page: a full page with its own URL (?product=<id>), not a popup over the shop.
  const route = useProductRoute(all ? products.map(p => p.id) : null);
  const openProduct = (p: StoreProduct) => route.open(p.id);
  const current = route.openId ? products.find(p => p.id === route.openId) || null : null;
  const related = useMemo(() => {
    if (!current) return [];
    const score = (p: StoreProduct) => (p.ministryId === current.ministryId ? 2 : 0) + (p.category === current.category ? 1 : 0);
    return products.filter(p => p.id !== current.id && (showDrafts || p.isActive !== false)).sort((a, b) => score(b) - score(a));
  }, [current, products, showDrafts]);
  const draftCount = products.filter(p => p.isActive === false).length;

  // Keep cart lines pointed at the live product and clamped to what's on the shelf.
  useEffect(() => {
    if (!all) return;
    setCart(prev => prev.map(i => {
      const live = all.find(p => p.id === i.product.id) || i.product;
      return { ...i, product: live, quantity: Math.min(i.quantity, availableFor(live, i.variantId)) };
    }).filter(i => i.quantity > 0));
  }, [all]);

  const enabled = !!settings?.isEnabled;

  // Writes users/{ownerUid}.storeSettings — only ever as the owner account itself (the old version wrote
  // the CURRENT user's doc, flipping a staff member's personal store instead of the org's).
  const toggleEnabled = async () => {
    if (!isStoreOwner || toggling) return;
    setToggling(true);
    const next: StoreSettings = { useExternalStore: false, showDemoContent: false, ...(settings || {}), isEnabled: !settings?.isEnabled };
    try {
      await updateDoc(doc(db, 'users', ownerUid), { storeSettings: next });
      setSettings(next);
      if (next.isEnabled) {
        await updateOrganization(org.id, { setupState: { ...(org.setupState || {}), storeReady: true } }).catch(() => {});
        onOrgChange?.({ ...org, setupState: { ...(org.setupState || {}), storeReady: true } });
      }
    } catch { /* leave the switch as it was */ }
    finally { setToggling(false); }
  };

  const addToCart = (product: StoreProduct, variantId?: string, quantity = 1, openCart = true) => {
    if (product.isActive === false) return; // drafts are previews, not for sale
    if (product.variants?.length && !variantId) { openProduct(product); return; }
    const avail = availableFor(product, variantId);
    if (avail <= 0) return;
    const variantName = product.variants?.find(v => v.id === variantId)?.name;
    setCart(prev => {
      const k = `${product.id}|${variantId || ''}`;
      const ex = prev.find(i => keyOf(i) === k);
      if (ex) return prev.map(i => (keyOf(i) === k ? { ...i, quantity: Math.min(avail, i.quantity + quantity) } : i));
      return [...prev, { product, variantId, variantName, quantity: Math.min(avail, quantity) }];
    });
    setCheckoutError(''); if (openCart) setShowCart(true);
  };

  // Same order spine as StorePageView: the server re-prices + stock-checks, then Stripe Checkout (funds → the shop).
  const checkout = async (sellerId: string, opts: CheckoutOptions = {}) => {
    const group = cart.filter(i => (i.product.sellerId || '') === sellerId);
    if (!group.length) return;
    setBusySeller(sellerId); setCheckoutError('');
    try {
      await startStoreCheckout(sellerId, group, opts);
    } catch (e: any) {
      setCheckoutError(e?.message || 'Checkout failed. Try again.');
      setBusySeller(null);
    }
  };

  const cartCount = cart.reduce((n, i) => n + i.quantity, 0);

  const shop = (
    <section className="mt-10" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-[22px] font-extrabold tracking-tight text-white flex items-center gap-2" style={{ fontFamily: DISPLAY }}>
          <ShoppingBag size={18} style={{ color: accent }} /> {ministry ? ministry.name : org.name} shop
        </h2>
        <div className="flex items-center gap-2">
          {cartCount > 0 && (
            <button onClick={() => setShowCart(true)} className="h-11 px-4 rounded-full text-[14px] font-bold text-[#1A0E00] flex items-center gap-2" style={{ background: accent }}>
              <ShoppingBag size={15} /> Cart · <span className="tabular-nums">{cartCount}</span>
            </button>
          )}
          {onVisitUser && (
            <button onClick={() => onVisitUser(ownerUid)} className="h-11 px-4 rounded-full text-[13px] font-semibold text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/10 flex items-center gap-1.5">Full store <ExternalLink size={13} /></button>
          )}
        </div>
      </div>

      {draftCount > 0 && (
        <p className="mb-3 text-[12px] text-white/55 rounded-xl px-3 py-2 bg-white/[0.04] border border-white/10">
          <span className="tabular-nums">{draftCount}</span> draft{draftCount === 1 ? '' : 's'} — only leaders see these until each one gets a price and is published.
        </p>
      )}

      {depts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1" aria-label="Shop by department">
          {([['ALL', 'Everything'], ['MAIN', org.name], ...depts.map(([id]) => [id, deptName(id)])] as [string, string][]).map(([id, label]) => {
            const on = dept === id;
            return (
              <button key={id} onClick={() => { setDept(id); setCat('ALL'); }} aria-pressed={on}
                className="h-10 px-4 rounded-full text-[13px] font-bold whitespace-nowrap transition"
                style={{ background: on ? accent : 'rgba(255,255,255,.06)', color: on ? '#1A0E00' : 'rgba(255,255,255,.75)' }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {cats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1" role="tablist" aria-label="Categories">
          {[['ALL', inDept.length] as [string, number], ...cats].map(([c, n]) => {
            const on = cat === c;
            return (
              <button key={c} role="tab" aria-selected={on} onClick={() => setCat(c)}
                className="h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap border transition"
                style={{ borderColor: on ? accent : 'rgba(255,255,255,.12)', background: on ? 'rgba(255,140,0,.14)' : 'transparent', color: on ? '#FFD4A3' : 'rgba(255,255,255,.75)' }}>
                {c === 'ALL' ? 'All' : pretty(c)} <span className="opacity-60 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map(p => {
          const draft = p.isActive === false;
          const badge = draft ? { label: 'Draft', soldOut: false } : storefrontBadge(p);
          const options = !!p.variants?.length;
          return (
            <div key={p.id} className={`rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 flex flex-col ${badge.soldOut ? 'opacity-60' : ''}`}>
              <button onClick={() => openProduct(p)} className="text-left">
                <div className="aspect-square bg-black/40 relative">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Package size={28} className="absolute inset-0 m-auto text-white/15" />}
                  {badge.label && (
                    <span className="absolute top-2 left-2 text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={badge.soldOut ? { background: 'rgba(0,0,0,.72)', color: '#FF6FA3' } : { background: 'rgba(0,0,0,.72)', color: ORANGE }}>{badge.label}</span>
                  )}
                </div>
                <div className="px-3 pt-3">
                  <p className="text-[14px] font-semibold text-white truncate">{p.title}</p>
                  {!ministry && deptName(p.ministryId) && <p className="text-[11px] text-white/45 truncate">{deptName(p.ministryId)}</p>}
                  <p className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[18px] font-extrabold tabular-nums text-white" style={{ fontFamily: DISPLAY }}>{draft && !p.price ? 'Price TBD' : <>{boardPrice(p.price)}{options ? '+' : ''}</>}</span>
                    {p.compareAtPrice && p.compareAtPrice > p.price && <span className="text-[12px] text-white/40 line-through tabular-nums">{boardPrice(p.compareAtPrice)}</span>}
                    {!draft && p.price >= 1 && <span className="text-[11px] font-bold text-amber-300/90 tabular-nums" title="Loyalty points you earn at this shop">+{Math.floor(p.price)} pts</span>}
                  </p>
                </div>
              </button>
              <div className="p-3 pt-2 mt-auto">
                <button onClick={() => (options || draft ? openProduct(p) : addToCart(p))} disabled={badge.soldOut}
                  className="w-full h-11 rounded-xl text-[13px] font-bold text-[#1A0E00] disabled:opacity-40 disabled:bg-white/10 disabled:text-white"
                  style={badge.soldOut ? undefined : { background: accent }}>
                  {badge.soldOut ? 'Sold out' : draft ? 'View product' : options ? 'Choose options' : 'Add to cart'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {current && (
        <ProductPage product={current} related={related} accent={accent}
          shopName={org.name} deptName={deptName(current.ministryId) || undefined}
          backLabel={`${ministry ? ministry.name : org.name} shop`}
          cartCount={cartCount} onOpenCart={() => setShowCart(true)}
          onAddToCart={(p, v, q) => addToCart(p, v, q, false)}
          // Buy now opens the cart with this item, so the buyer still picks where it ships and can use a code.
          onBuyNow={(p, v, q) => addToCart(p, v, q || 1, true)}
          onOpenProduct={openProduct} onBack={route.close} />
      )}
      <AnimatePresence>
        {showCart && (
          <CartSidebar items={cart}
            onUpdateQty={(k, q) => { if (q < 1) return; setCart(prev => prev.map(i => (keyOf(i) === k ? { ...i, quantity: Math.min(q, availableFor(i.product, i.variantId)) } : i))); }}
            onRemove={k => setCart(prev => prev.filter(i => keyOf(i) !== k))}
            onCheckout={checkout} busySeller={busySeller} error={checkoutError} onClose={() => setShowCart(false)} />
        )}
      </AnimatePresence>
    </section>
  );

  if (all === null || !settingsLoaded) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={20} /></div>;

  if (!manage) {
    if (products.length === 0) return null;
    if (!enabled && !(previewDrafts && draftCount > 0)) return null;
    return shop;
  }

  // ── manage ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5">
        <div>
          <p className="text-[15px] font-bold text-white">{enabled ? 'Store is live' : 'Store is off'}</p>
          <p className="text-[12px] text-white/50"><span className="tabular-nums">{products.length}</span> active product{products.length === 1 ? '' : 's'} · shown on the public page when enabled</p>
        </div>
        {isStoreOwner && (
          <button onClick={toggleEnabled} disabled={toggling} className={`h-11 flex items-center gap-1.5 px-4 rounded-full text-[13px] font-bold disabled:opacity-50 ${enabled ? 'bg-white/10 text-white' : 'text-[#1A0E00]'}`} style={enabled ? undefined : { background: accent }}>
            {toggling ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} {enabled ? 'Turn off' : 'Turn on store'}
          </button>
        )}
      </div>
      {isStoreOwner ? (
        <StoreProductManager ownerId={ownerUid} sellerName={org.name} sellerType="ORG" settings={settings} onSettingsUpdate={setSettings}
          departments={(org.ministries || []).filter(m => !m.isInternal).map(m => ({ id: m.id, name: m.name }))} ministryId={ministry?.id} />
      ) : (
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-[13px] text-white/55">
          This store belongs to the organization's {org.accountUid ? 'linked account' : 'owner account'}. Sign in as that account to add or edit products or turn the store on — here's what visitors see:
          {products.length ? shop : <p className="mt-3 text-white/40">No products yet.</p>}
        </div>
      )}
    </div>
  );
};

export default OrgStoreSection;
