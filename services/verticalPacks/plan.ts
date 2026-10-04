/**
 * Pure planning half of the pack applier: decides EXACTLY what would be written, given what already exists.
 * applyPack.ts executes the plan against Firestore. Keeping this pure makes idempotency unit-testable.
 *
 * Idempotency rules:
 *  - sample products are keyed by packSampleId (`${packId}:${itemKey}`); already-present ids are skipped
 *    (never overwritten, so owner edits survive a re-run);
 *  - offers use deterministic ids (`pack_${packId}_${key}`); existing ids are skipped;
 *  - page flags (accepting orders, rewards, radio ...) are applied only the FIRST time a pack is applied to a
 *    page, so re-running never flips a toggle the owner changed; hours are only filled when empty;
 *  - Firestore throws on `undefined`, so every payload goes through stripUndefined.
 */
import { buildVariantMatrix } from '../inventoryCore';
import type { StarterItem, VerticalPack } from './types';
import { isUsable } from './capabilities';
import { offerIdFor, samplePackId } from './index';

export interface ExistingState {
  /** Products already owned by the seller (only packSampleId matters). */
  products: { id?: string; packSampleId?: string }[];
  offerIds: string[];
  page: {
    subtype?: string; businessType?: string; hours?: Record<string, any>; amenities?: string[]; tags?: string[];
    packManualDone?: string[]; packRoles?: unknown[];
  };
}

export interface ApplyPlan {
  productsToCreate: Record<string, any>[];
  productsSkipped: number;
  offersToCreate: { id: string; offer: Record<string, any> }[];
  offersSkipped: number;
  pagePatch: Record<string, any>;
  /** Items seeded inactive because a capability they need is not usable yet. */
  draftedItems: { key: string; name: string; needs: string }[];
  firstApply: boolean;
}

export function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined).filter(x => x !== undefined) as any;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      if (val === undefined) continue;
      out[k] = stripUndefined(val);
    }
    return out;
  }
  return v;
}

const art = (emoji: string, color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1a0033"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="128" font-size="86" text-anchor="middle">${emoji}</text></svg>`)}`;

/** Map a pack item to a StoreProduct draft. Extra pack fields are additive and loosely typed on purpose:
 *  another change is adding taxClass/snapEligible/ageRestricted to StoreProduct, so we write the same names. */
export function toProductDraft(pack: VerticalPack, item: StarterItem, ctx: { sellerId: string; sellerName: string }): Record<string, any> {
  const isService = item.kind !== 'product';
  const cat = pack.starterCatalog.categories.find(c => c.name === item.category);
  const hasMatrix = Boolean(item.sizes?.length || item.colors?.length);
  const variants = hasMatrix
    ? buildVariantMatrix({ title: item.name, sizes: item.sizes ?? [], colors: item.colors ?? [], defaultStock: item.stock ?? 2 })
    : undefined;
  const variantStock = variants ? Object.fromEntries(variants.map(v => [v.id, v.stock])) : undefined;
  const stock = variants ? variants.reduce((n, v) => n + v.stock, 0) : (isService ? 0 : item.stock ?? 0);
  const active = item.requires ? isUsable(item.requires) : true;
  return stripUndefined({
    sellerId: ctx.sellerId,
    sellerName: ctx.sellerName,
    sellerType: 'ORG',
    title: item.name,
    description: item.description,
    category: item.storeCategory ?? 'OTHER',
    price: item.price,
    costPrice: item.costPrice,
    images: [art(item.emoji ?? cat?.emoji ?? (isService ? '✨' : '📦'), pack.color)],
    variants,
    variantStock,
    stock,
    lowStockThreshold: isService ? undefined : item.lowStockThreshold,
    trackInventory: isService ? false : (item as any).trackInventory === false ? false : true,
    isDigital: false,
    isActive: active,
    isClothing: pack.id === 'clothing_boutique' ? true : undefined,
    sizeOptions: item.sizes,
    colorOptions: item.colors?.map(name => ({ name, hex: '#888888' })),
    sku: item.sku,
    tags: ['sample', `pack:${pack.id}`, `cat:${item.category}`, ...(item.requires && !active ? [`needs:${item.requires}`] : [])],
    // pack bookkeeping (additive, loose)
    isSample: true,
    packId: pack.id,
    packVersion: pack.version,
    packSampleId: samplePackId(pack, item.key),
    packCategory: item.category,
    packKind: item.kind,
    durationMin: item.durationMin,
    addOnFor: item.addOnFor,
    isService: isService ? true : undefined,
    taxClass: item.taxClass,
    snapEligible: item.snapEligible,
    ageRestricted: item.ageRestricted,
    soldBy: item.soldBy,
    unitLabel: item.unitLabel,
  });
}

export function planApply(pack: VerticalPack, existing: ExistingState, ctx: { sellerId: string; sellerName: string }): ApplyPlan {
  const have = new Set(existing.products.map(p => p.packSampleId).filter(Boolean) as string[]);
  const firstApply = existing.page.subtype !== pack.id;

  const productsToCreate: Record<string, any>[] = [];
  const draftedItems: ApplyPlan['draftedItems'] = [];
  let productsSkipped = 0;
  for (const item of pack.starterCatalog.items) {
    if (have.has(samplePackId(pack, item.key))) { productsSkipped++; continue; }
    const draft = toProductDraft(pack, item, ctx);
    if (!draft.isActive && item.requires) draftedItems.push({ key: item.key, name: item.name, needs: item.requires });
    productsToCreate.push(draft);
  }

  const haveOffers = new Set(existing.offerIds);
  const offersToCreate: ApplyPlan['offersToCreate'] = [];
  let offersSkipped = 0;
  for (const d of pack.deals) {
    const id = offerIdFor(pack, d.key);
    if (haveOffers.has(id)) { offersSkipped++; continue; }
    offersToCreate.push({
      id,
      offer: stripUndefined({ label: d.label, kind: d.kind, value: d.value, minSubtotalCents: d.minSubtotalCents, membersOnly: d.membersOnly, active: d.startActive, packId: pack.id }),
    });
  }

  const hoursEmpty = !existing.page.hours || Object.keys(existing.page.hours).length === 0;
  const union = (a?: string[], b?: string[]) => Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  const patch: Record<string, any> = {
    subtype: pack.id,
    packId: pack.id,
    packVersion: pack.version,
    packVocabulary: pack.vocabulary,
    packCapabilities: Object.fromEntries(pack.capabilities.map(c => [c.id, c.importance])),
    amenities: union(existing.page.amenities, pack.pageDefaults.amenities),
    tags: union(existing.page.tags, pack.pageDefaults.tags),
  };
  // The pack decides the coarse vertical (e.g. a spa is SERVICE, never the clinical HEALTH flow).
  if (existing.page.businessType !== pack.parent) patch.businessType = pack.parent;
  if (hoursEmpty) patch.hours = pack.defaultHours;
  if (!existing.page.packRoles?.length) patch.packRoles = pack.roles;
  if (firstApply) {
    const d = pack.pageDefaults;
    if (d.isAcceptingOrders !== undefined) patch.isAcceptingOrders = d.isAcceptingOrders;
    if (d.radioServiceEnabled !== undefined) patch.radioServiceEnabled = d.radioServiceEnabled;
    if (d.digitalSignageEnabled !== undefined) patch.digitalSignageEnabled = d.digitalSignageEnabled;
    if (d.crmEnabled !== undefined) patch.crmEnabled = d.crmEnabled;
    if (d.priceRange) patch.priceRange = d.priceRange;
    patch.rewardsEnabled = pack.loyalty.rewardsEnabled;
    if (pack.loyalty.rewardsEnabled) patch.rewardPointsPerDollar = pack.loyalty.pointsPerDollar;
  }

  return { productsToCreate, productsSkipped, offersToCreate, offersSkipped, pagePatch: stripUndefined(patch), draftedItems, firstApply };
}

/** Is this product an untouched-or-edited sample the owner may bulk delete? */
export const isSampleProduct = (p: { isSample?: boolean; packSampleId?: string; tags?: string[] }): boolean =>
  Boolean(p.isSample || p.packSampleId || p.tags?.includes('sample'));
