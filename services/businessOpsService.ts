// businessOpsService — the business operations layer over the SAME storeProducts collection that
// backs the on-platform store. Because inventory items ARE store products, editing inventory
// auto-populates the merch store (no sync job). Also seeds a demo business for presentations.

import { collection, query, where, getDocs } from 'firebase/firestore';
import type { StoreProduct } from '../types';
import { createProduct, updateProduct, fetchProductsBySeller } from './storeService';
import { db, auth } from './backendService';

// Orders created by the server order spine (/api/store/create-order) live in `storeOrders` keyed by
// customerUid/businessUid with items as a JSON string (the server's Firestore writer can't store
// object arrays). These read them back for customer order-tracking + the business order view.
export interface StoreOrderRecord {
  id: string;
  businessUid: string;
  customerUid: string;
  status: string;                 // PENDING_PAYMENT | CONFIRMED | PREPARING | READY | COMPLETED | CANCELLED
  items: { productId: string; title: string; qty: number; unitAmount: number; variantName?: string | null }[];
  subtotalCents: number;
  fulfillment: string;            // PICKUP | SHIP
  note?: string;
  customerName?: string;
  createdAt: number;
  paidAt?: number;
}

function mapOrder(id: string, x: any): StoreOrderRecord {
  let items: StoreOrderRecord['items'] = [];
  try { items = JSON.parse(x.items || '[]'); } catch { /* */ }
  return {
    id, businessUid: x.businessUid, customerUid: x.customerUid,
    status: x.status || 'PENDING_PAYMENT', items,
    subtotalCents: x.subtotalCents || 0, fulfillment: x.fulfillment || 'PICKUP',
    note: x.note, customerName: x.customerName, createdAt: x.createdAt || 0, paidAt: x.paidAt,
  };
}

/** The signed-in customer's store orders (newest first). Single-field query → no composite index. */
export async function fetchMyStoreOrders(): Promise<StoreOrderRecord[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'storeOrders'), where('customerUid', '==', uid)));
    return snap.docs.map(d => mapOrder(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/** A business's incoming store orders (newest first). */
export async function fetchBusinessStoreOrders(businessUid: string): Promise<StoreOrderRecord[]> {
  try {
    const snap = await getDocs(query(collection(db, 'storeOrders'), where('businessUid', '==', businessUid)));
    return snap.docs.map(d => mapOrder(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/** An item is "low stock" when its on-hand count is at/below its threshold (default 5). */
export function isLowStock(p: Pick<StoreProduct, 'stock' | 'lowStockThreshold'>): boolean {
  const t = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 5;
  return (p.stock ?? 0) <= t;
}

/** Adjust on-hand stock by a delta (receiving = +, shrinkage/manual sale = -). Clamped at 0. */
export async function adjustStock(product: StoreProduct, delta: number): Promise<number> {
  const next = Math.max(0, (product.stock ?? 0) + delta);
  await updateProduct(product.id, { stock: next });
  return next;
}

/** A demo catalog for a boutique café/shop — a realistic mix + one low-stock item to show the alert. */
const DEMO_CATALOG: Array<Pick<StoreProduct, 'title' | 'description' | 'category' | 'price' | 'stock' | 'lowStockThreshold' | 'isDigital'>> = [
  { title: 'House Blend Coffee — 12oz', description: 'Small-batch medium roast, ground or whole bean.', category: 'HOME', price: 16, stock: 48, isDigital: false },
  { title: 'Ceramic Mug', description: 'Heavy 12oz stoneware mug with the shop logo.', category: 'HOME', price: 14, stock: 30, isDigital: false },
  { title: 'Logo Tee', description: 'Soft ringspun cotton tee. Unisex fit.', category: 'APPAREL', price: 28, stock: 22, isDigital: false },
  { title: 'Canvas Tote', description: 'Heavyweight eco tote — perfect for the market.', category: 'ACCESSORIES', price: 18, stock: 4, lowStockThreshold: 6, isDigital: false }, // low-stock demo
  { title: 'Sticker Pack (5)', description: 'Die-cut vinyl sticker set.', category: 'ACCESSORIES', price: 8, stock: 120, isDigital: false },
  { title: 'Digital Gift Card — $25', description: 'Emailed instantly. Spend in-store or online.', category: 'DIGITAL', price: 25, stock: 999, isDigital: true },
];

/**
 * Seed a demo business's storeProducts so the store + kiosk + POS + inventory all have content for a
 * presentation. Idempotent: tagged 'demo-seed', skips if already present. Returns the product ids.
 */
export async function seedDemoBusiness(sellerId: string, sellerName: string): Promise<string[]> {
  const existing = await fetchProductsBySeller(sellerId).catch(() => [] as StoreProduct[]);
  if (existing.some(p => p.tags?.includes('demo-seed'))) {
    return existing.filter(p => p.tags?.includes('demo-seed')).map(p => p.id);
  }
  const ids: string[] = [];
  for (const d of DEMO_CATALOG) {
    const id = await createProduct({
      sellerId,
      sellerName,
      sellerType: 'ORG',
      title: d.title,
      description: d.description,
      category: d.category,
      price: d.price,
      images: [`https://picsum.photos/seed/plajah-${encodeURIComponent(d.title)}/600/600`],
      stock: d.stock,
      lowStockThreshold: d.lowStockThreshold,
      isDigital: d.isDigital,
      isActive: true,            // active = live in the store immediately (auto-populate)
      tags: ['demo-seed'],
    } as Omit<StoreProduct, 'id' | 'createdAt' | 'updatedAt'>).catch(() => '');
    if (id) ids.push(id);
  }
  return ids;
}
