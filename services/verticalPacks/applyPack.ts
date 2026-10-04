/**
 * Pack applier — executes plan.ts against Firestore. Idempotent and re-runnable: samples are keyed by
 * packSampleId, offers by deterministic id, so a second run creates nothing new and never overwrites edits.
 *
 * Writes go through the existing create paths (storeService.createProduct for storeProducts, offersService.saveOffer,
 * businessService.saveBusinessPage) so rules, ids and timestamps behave exactly like hand-entered data.
 * Everything is written under the signed-in owner's uid, so it is fully client-side and rules-compatible.
 */
import type { BusinessPage } from '../../types';
import { auth } from '../firebase';
import { saveBusinessPage, fetchSignageSlides, saveSignageSlide } from '../businessService';
import { createProduct, fetchProductsBySeller, deleteProduct } from '../storeService';
import { fetchOffers, saveOffer } from '../offersService';
import { planApply, stripUndefined, isSampleProduct, type ApplyPlan } from './plan';
import { computeChecklist, type BusinessSnapshot, type ChecklistProgress } from './checklist';
import type { VerticalPack } from './types';

export interface ApplyResult {
  page: BusinessPage;
  productsCreated: number;
  productsSkipped: number;
  offersCreated: number;
  draftedItems: ApplyPlan['draftedItems'];
  signageCreated: number;
  failed: number;
}

const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function applyPack(
  page: BusinessPage,
  pack: VerticalPack,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<ApplyResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');

  const [products, offers] = await Promise.all([
    fetchProductsBySeller(uid).catch(() => []),
    fetchOffers(uid).catch(() => []),
  ]);
  const plan = planApply(
    pack,
    {
      products: products.map(p => ({ id: p.id, packSampleId: (p as any).packSampleId })),
      offerIds: offers.map(o => o.id),
      page: page as any,
    },
    { sellerId: uid, sellerName: page.businessName || 'My Business' },
  );

  const total = plan.productsToCreate.length + plan.offersToCreate.length + 2;
  let done = 0, failed = 0;
  const tick = (label: string) => onProgress?.(++done, total, label);

  // 1. Page first, so the dashboard flips to the pack even if a later write fails.
  const saved = await saveBusinessPage({ ...stripUndefined(plan.pagePatch), id: page.id });
  tick('Business details');

  // 2. Sample catalog, a few at a time.
  let productsCreated = 0;
  for (const group of chunk(plan.productsToCreate, 6)) {
    await Promise.all(group.map(async draft => {
      try { await createProduct(draft as any); productsCreated++; } catch { failed++; }
      tick(String(draft.title));
    }));
  }

  // 3. Starter deals.
  let offersCreated = 0;
  for (const { id, offer } of plan.offersToCreate) {
    try { await saveOffer(uid, { ...(offer as any), id }); offersCreated++; } catch { failed++; }
    tick(String(offer.label));
  }

  // 4. Signage ideas, only when the business has no slides yet and signage is on.
  let signageCreated = 0;
  try {
    const wantsSignage = Boolean((plan.pagePatch.digitalSignageEnabled ?? page.digitalSignageEnabled));
    if (wantsSignage && pack.signage.length) {
      const existing = await fetchSignageSlides(page.id).catch(() => []);
      if (existing.length === 0) {
        for (const [i, s] of pack.signage.entries()) {
          await saveSignageSlide({ type: 'PROMO', headline: s.headline, subtext: s.subtext, backgroundColor: s.bg, durationSeconds: 8, isActive: true, order: i, businessId: page.id } as any).catch(() => { failed++; });
          signageCreated++;
        }
      }
    }
  } catch { /* signage is best-effort */ }
  tick('Signage');

  return {
    page: { ...page, ...saved, ...(plan.pagePatch as any) } as BusinessPage,
    productsCreated,
    productsSkipped: plan.productsSkipped,
    offersCreated,
    draftedItems: plan.draftedItems,
    signageCreated,
    failed,
  };
}

/** Delete every sample product the pack seeded (owner-initiated "clear samples"). Returns how many were removed. */
export async function deleteSampleProducts(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const products = await fetchProductsBySeller(uid);
  const samples = products.filter(p => isSampleProduct(p as any));
  for (const group of chunk(samples, 8)) await Promise.all(group.map(p => deleteProduct(p.id).catch(() => {})));
  return samples.length;
}

/** Gather live business data into a checklist snapshot (best-effort; each read fails soft to 0). */
export async function loadSnapshot(
  page: BusinessPage,
  extra: { orderCount: number; contactCount: number; slideCount: number },
): Promise<BusinessSnapshot> {
  const uid = auth.currentUser?.uid;
  const [products, offers, staffCount] = await Promise.all([
    uid ? fetchProductsBySeller(uid).catch(() => []) : Promise.resolve([]),
    uid ? fetchOffers(uid).catch(() => []) : Promise.resolve([]),
    countStaff(uid).catch(() => 0),
  ]);
  const samples = products.filter(p => isSampleProduct(p as any));
  return {
    page: page as any,
    productCount: products.length,
    sampleCount: samples.length,
    editedSampleCount: samples.filter(p => (p.updatedAt || 0) - (p.createdAt || 0) > 5000).length,
    activeOfferCount: offers.filter(o => o.active).length,
    orderCount: extra.orderCount,
    contactCount: extra.contactCount,
    slideCount: extra.slideCount,
    staffCount,
  };
}

async function countStaff(uid?: string): Promise<number> {
  if (!uid) return 0;
  const { fetchStaff } = await import('../staffService');
  const list: any = await (fetchStaff as any)(uid);
  return Array.isArray(list) ? list.length : 0;
}

export async function setManualStep(page: BusinessPage, stepId: string, done: boolean): Promise<BusinessPage> {
  const cur = new Set(((page as any).packManualDone as string[] | undefined) ?? []);
  done ? cur.add(stepId) : cur.delete(stepId);
  const packManualDone = Array.from(cur);
  await saveBusinessPage({ id: page.id, packManualDone } as any);
  return { ...page, packManualDone } as any;
}

export type { ChecklistProgress };
export { computeChecklist };
