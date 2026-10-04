/**
 * Vertical pack registry + pure lookups. Firebase-free (safe in tests and in the dev preview).
 *
 * `businessVerticals.ts` stays the coarse base registry (8 verticals) and is NOT changed by packs; a page
 * with `subtype` = a pack id simply gets finer tabs/vocabulary on top. Pages without a subtype behave exactly
 * as before, so this is zero-migration.
 */
import { getVertical, type VerticalId, type VerticalTab } from '../businessVerticals';
import type { VerticalPack, PackVocabulary } from './types';
import grocery from './packs/groceryCornerStore';
import boutique from './packs/clothingBoutique';
import salon from './packs/salonBarbershop';
import spa from './packs/healthSpa';
import auto from './packs/autoRepair';
import laundromat from './packs/laundromat';
import restaurant from './packs/restaurantCafe';
import realEstate from './packs/realEstateBrokerage';

export * from './types';
export { CAPABILITIES, capabilityStatus, isUsable, isReady, packReadiness, READINESS_LABEL, capabilityBreakdown } from './capabilities';

export const PACKS: VerticalPack[] = [grocery, boutique, salon, spa, auto, laundromat, restaurant, realEstate];

const BY_ID = new Map(PACKS.map(p => [p.id, p] as const));
export const PACK_IDS = PACKS.map(p => p.id);

export const getPack = (id?: string | null): VerticalPack | null => (id ? BY_ID.get(id) ?? null : null);

/** Pack for a page: `subtype` wins, `packId` is accepted as an alias. */
export const packForPage = (page?: { subtype?: string; packId?: string } | null): VerticalPack | null =>
  getPack(page?.subtype) ?? getPack(page?.packId);

export const packsByParent = (): { parent: VerticalId; label: string; color: string; packs: VerticalPack[] }[] => {
  const order: VerticalId[] = [];
  for (const p of PACKS) if (!order.includes(p.parent)) order.push(p.parent);
  return order.map(parent => {
    const v = getVertical(parent);
    return { parent, label: v.labelPlural, color: v.color, packs: PACKS.filter(p => p.parent === parent) };
  });
};

/** Stable key for a seeded sample product. Do not change the format: existing businesses depend on it. */
export const samplePackId = (pack: Pick<VerticalPack, 'id'>, key: string): string => `${pack.id}:${key}`;
export const offerIdFor = (pack: Pick<VerticalPack, 'id'>, key: string): string => `pack_${pack.id}_${key}`;

export const DEFAULT_VOCABULARY: PackVocabulary = {
  customer: 'customer', customers: 'customers', staff: 'team member', staffPlural: 'team members',
  catalogNoun: 'Products', catalogNounSingular: 'product', orderNoun: 'order', orderNounPlural: 'orders', checkoutVerb: 'Check out',
};

/** Vocabulary for a page: its pack, else the parent vertical's catalog noun over the defaults. */
export function vocabularyFor(page?: { businessType?: string; subtype?: string; packId?: string } | null): PackVocabulary {
  const pack = packForPage(page);
  if (pack) return pack.vocabulary;
  const v = getVertical(page?.businessType);
  return { ...DEFAULT_VOCABULARY, catalogNoun: v.catalogNoun };
}

/** Dashboard tabs for a page: the pack's list when one is applied, else the vertical's. Never empty. */
export function tabsFor(page?: { businessType?: string; subtype?: string; packId?: string } | null): VerticalTab[] {
  const pack = packForPage(page);
  const tabs = pack ? pack.tabs : getVertical(page?.businessType).tabs;
  return tabs.length ? tabs : getVertical(undefined).tabs;
}
