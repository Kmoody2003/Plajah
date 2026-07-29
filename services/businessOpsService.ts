// businessOpsService — the business operations layer over the SAME storeProducts collection that
// backs the on-platform store. Because inventory items ARE store products, editing inventory
// auto-populates the merch store (no sync job). Also seeds a demo business for presentations.

import type { StoreProduct } from '../types';
import { createProduct, updateProduct, fetchProductsBySeller } from './storeService';

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
