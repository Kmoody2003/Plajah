// Dev-only: renders the inventory screens directly (no sign-in gate, no Firestore) with a demo catalog so
// layout and flow can be reviewed. Writes fail soft — this page never touches real data. Delete freely.
//
//   /inventory-preview.html?screen=hub|editor|new|stock|import|picker
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import InventoryHub from '../components/inventory/InventoryHub';
import ProductEditor from '../components/inventory/ProductEditor';
import StockSheet from '../components/inventory/StockSheet';
import ImportSheet from '../components/inventory/ImportSheet';
import VariantPicker from '../components/inventory/VariantPicker';
import RegisterTenderSheet from '../components/RegisterTenderSheet';
import { buildVariantMatrix, saleLinesFromOrder, summarizeSales, type StockMove } from '../services/inventoryCore';
import type { StoreProduct, StoreCartItem } from '../types';
import { ProductCard, CartSidebar, ProductDetailModal } from '../components/StorePageView';

const SCREENS = ['tender', 'hub', 'editor', 'new', 'stock', 'import', 'picker', 'shop', 'detail', 'soldout', 'cart'] as const;
type Screen = (typeof SCREENS)[number];

const art = (emoji: string, a: string, b: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="128" font-size="86" text-anchor="middle">${emoji}</text></svg>`)}`;

const NOW = Date.now(), DAY = 86_400_000;
const base = (o: Partial<StoreProduct>): StoreProduct => ({
  id: 'p', sellerId: 'demo', sellerName: 'Neon Hours', category: 'APPAREL', title: '', description: '', price: 0, images: [],
  stock: 0, isDigital: false, isActive: true, createdAt: NOW, updatedAt: NOW, lowStockThreshold: 5, ...o,
});

const hoodieV = buildVariantMatrix({ title: 'Tour Hoodie', sizes: ['S', 'M', 'L', 'XL'], colors: ['Black'] }).map((v, i) => ({ ...v, stock: [12, 3, 0, 8][i], priceModifier: v.name.startsWith('XL') ? 4 : undefined }));
const teeV = buildVariantMatrix({ title: 'Logo Tee', sizes: ['S', 'M', 'L', 'XL', '2XL'], colors: ['Black', 'White'] }).map((v, i) => ({ ...v, stock: (i * 7 + 4) % 19 }));
const sum = (vs: { stock: number }[]) => vs.reduce((s, v) => s + v.stock, 0);

export const DEMO_PRODUCTS: StoreProduct[] = [
  base({ id: 'hoodie', title: 'Tour Hoodie', price: 62, costPrice: 24, images: [art('🧥', '#6B0099', '#D40055')], variants: hoodieV, stock: sum(hoodieV), soldCount: 46, createdAt: NOW - 1 * DAY, sku: undefined }),
  base({ id: 'tee', title: 'Logo Tee', price: 28, costPrice: 9.5, images: [art('👕', '#1f2a44', '#00DAF3')], variants: teeV, stock: sum(teeV), soldCount: 112, createdAt: NOW - 3 * DAY }),
  base({ id: 'lp', title: 'Vinyl LP — Neon Hours', category: 'MUSIC', price: 34, costPrice: 14, stock: 4, images: [art('💿', '#FF8C00', '#D40055')], soldCount: 31, createdAt: NOW - 5 * DAY, sku: 'LP-NH-01' }),
  base({ id: 'pin', title: 'Enamel Pin', category: 'ACCESSORIES', price: 9, costPrice: 2.1, stock: 0, images: [art('📍', '#D40055', '#6B0099')], soldCount: 88, createdAt: NOW - 8 * DAY }),
  base({ id: 'stickers', title: 'Sticker Pack (5)', category: 'ACCESSORIES', price: 8, costPrice: 1.2, stock: 120, images: [art('✨', '#00DAF3', '#6B0099')], soldCount: 64, createdAt: NOW - 9 * DAY }),
  base({ id: 'poster', title: 'Tour Poster 18×24', category: 'ART', price: 25, fulfillmentSource: 'printful', trackInventory: false, stock: 0, images: [art('🖼️', '#111', '#6B0099')], soldCount: 19, createdAt: NOW - 11 * DAY }),
  base({ id: 'samples', title: 'Producer Sample Pack', category: 'DIGITAL', price: 15, isDigital: true, stock: 0, images: [art('🎛️', '#2f5d3a', '#00DAF3')], soldCount: 27, createdAt: NOW - 14 * DAY }),
  base({ id: 'tote', title: 'Canvas Tote', category: 'ACCESSORIES', price: 18, stock: 22, isActive: false, images: [art('👜', '#d9c7a3', '#FF8C00')], createdAt: NOW - 16 * DAY }),
];

const order = (productId: string, variantId: string | undefined, qty: number, unit: number, daysAgo: number) =>
  saleLinesFromOrder({ status: 'CONFIRMED', paidAt: NOW - daysAgo * DAY, items: JSON.stringify([{ productId, variantId, title: productId, qty, unitAmount: unit }]) });
const SALES = summarizeSales([
  ...order('hoodie', hoodieV[1].id, 9, 6200, 4), ...order('hoodie', hoodieV[2].id, 7, 6200, 6), ...order('hoodie', hoodieV[0].id, 4, 6200, 9),
  ...order('tee', undefined, 20, 2800, 3), ...order('lp', undefined, 14, 3400, 5), ...order('pin', undefined, 30, 900, 2), ...order('stickers', undefined, 11, 800, 7),
].map(l => ({ ...l, title: ({ hoodie: 'Tour Hoodie', tee: 'Logo Tee', lp: 'Vinyl LP', pin: 'Enamel Pin', stickers: 'Sticker Pack' } as any)[l.productId] })), 30, NOW);

const MOVES: StockMove[] = [
  { id: '1', sellerId: 'demo', productId: 'pin', productTitle: 'Enamel Pin', delta: -2, before: 2, after: 0, reason: 'SALE', at: NOW - 40 * 60_000 },
  { id: '2', sellerId: 'demo', productId: 'hoodie', productTitle: 'Tour Hoodie', variantName: 'L / Black', delta: -1, before: 1, after: 0, reason: 'POS_SALE', at: NOW - 3 * 3_600_000 },
  { id: '3', sellerId: 'demo', productId: 'lp', productTitle: 'Vinyl LP — Neon Hours', delta: -3, before: 7, after: 4, reason: 'OFFLINE_SALE', note: 'Merch table, Saturday show', at: NOW - 20 * 3_600_000 },
  { id: '4', sellerId: 'demo', productId: 'tee', productTitle: 'Logo Tee', variantName: 'M / Black', delta: 24, before: 3, after: 27, reason: 'RECEIVE', note: 'PO #1042', at: NOW - 26 * 3_600_000 },
  { id: '5', sellerId: 'demo', productId: 'stickers', productTitle: 'Sticker Pack (5)', delta: -4, before: 124, after: 120, reason: 'DAMAGE', at: NOW - 3 * DAY },
];

const CART: StoreCartItem[] = [
  { product: DEMO_PRODUCTS[0], variantId: hoodieV[3].id, variantName: hoodieV[3].name, quantity: 1 },
  { product: DEMO_PRODUCTS[1], variantId: teeV[0].id, variantName: teeV[0].name, quantity: 2 },
];
const q = new URLSearchParams(location.search);
const initial = (q.get('screen') || 'hub') as Screen;
const who = { sellerId: 'demo', sellerName: 'Neon Hours', sellerType: 'USER' as const };

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>(SCREENS.includes(initial) ? initial : 'hub');
  const go = (s: Screen) => { setScreen(s); history.replaceState(null, '', `?screen=${s}`); };
  const noop = () => {};
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <nav style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 5, background: '#0a0a0fcc', backdropFilter: 'blur(8px)' }}>
        {SCREENS.map(s => <button key={s} onClick={() => go(s)} style={{ padding: '4px 12px', borderRadius: 99, border: '1px solid #444', background: s === screen ? '#FF8C00' : 'transparent', color: s === screen ? '#000' : '#ddd', fontSize: 12, fontWeight: 700 }}>{s}</button>)}
      </nav>
      {screen === 'tender' && <RegisterTenderSheet lines={[{ grossCents: 600, snapEligible: true, taxClass: 'GROCERY_FOOD' }, { grossCents: 400, snapEligible: true }, { grossCents: 500 }, { grossCents: 799 }]} discountCents={0} settings={{ defaultRateBps: 825, rates: { GROCERY_FOOD: 0 } }} ageMin={21} onCancel={noop} onConfirm={(t, tip, age) => { (window as any).__sale = { t, tip, age }; document.title = 'SALE ' + JSON.stringify(t); }} />}
      {screen === 'hub' && <InventoryHub sellerId="demo" sellerName="Neon Hours" audience="creator" demo={{ products: DEMO_PRODUCTS, pulse: { sales: SALES, toFulfil: 3, oversold: 0 }, moves: MOVES }} />}
      {screen === 'editor' && <ProductEditor who={who} product={DEMO_PRODUCTS[0]} onClose={() => go('hub')} onSaved={noop} />}
      {screen === 'new' && <ProductEditor who={who} onClose={() => go('hub')} onSaved={noop} />}
      {screen === 'stock' && <StockSheet product={DEMO_PRODUCTS[0]} onClose={() => go('hub')} onDone={noop} />}
      {screen === 'import' && <ImportSheet who={who} onClose={() => go('hub')} onDone={noop} />}
      {(screen === 'shop' || screen === 'detail' || screen === 'soldout' || screen === 'cart') && (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: 16, color: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
            {DEMO_PRODUCTS.filter(p => p.isActive).map(p => <ProductCard key={p.id} product={p} onSelect={() => go('detail')} onAddToCart={noop} />)}
          </div>
        </div>
      )}
      {screen === 'detail' && <ProductDetailModal product={DEMO_PRODUCTS[0]} onClose={() => go('shop')} onAddToCart={noop} />}
      {screen === 'soldout' && <ProductDetailModal product={DEMO_PRODUCTS[3]} onClose={() => go('shop')} onAddToCart={noop} />}
      {screen === 'cart' && <CartSidebar items={CART} onUpdateQty={noop} onRemove={noop} onCheckout={noop} busySeller={null} error="Only 2 of Tour Hoodie (L / Black) left." onClose={() => go('shop')} />}
      {screen === 'picker' && <VariantPicker product={DEMO_PRODUCTS[0]} allowSoldOut onPick={noop} onClose={() => go('hub')} />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
