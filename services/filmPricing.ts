// Film pricing — the one rule for what a film costs. `filmDistribution` on the album is the
// source of truth; every editor (AlbumCreator/FilmDistributionStep, Film Distribution Hub
// pricing tab, FilmOnboardingWizard) writes it, the Taleo page reads it for the Buy/Rent
// buttons, and /api/stripe/content-purchase resolves the charge from it server-side, so a
// client can never pick its own price, grant or payee.

import type { Album, FilmDistribution } from '../types';

export type FilmGrant = 'PURCHASE' | 'RENTAL' | 'PPV';

export interface FilmOffers {
  /** Buy-to-own (or the PPV premiere ticket when model === 'PPV'). */
  buy?: { grant: 'PURCHASE' | 'PPV'; price: number };
  rent?: { price: number; windowHrs: 24 | 48 | 72 };
}

const money = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const windowOf = (v: unknown): 24 | 48 | 72 => (v === 24 || v === 72 ? v : 48);

/**
 * The album's film distribution, with a fallback for films priced before
 * `filmDistribution` existed (only legacy `isPaywalled` + `price`): those sell to own.
 */
export function filmDistributionOf(album: Partial<Album> | Record<string, any> | null | undefined): FilmDistribution | undefined {
  if (!album) return undefined;
  const d = (album as any).filmDistribution as FilmDistribution | undefined;
  if (d && d.model) return d;
  const legacyPrice = money((album as any).price);
  if ((album as any).isPaywalled && legacyPrice > 0) {
    return { model: 'PURCHASE', purchasePrice: legacyPrice, release: 'NOW', delivery: 'DOWNLOAD_OPEN', watermark: true };
  }
  return undefined;
}

/** A promo applies while its window is open and only ever lowers the buy price. */
function promoPrice(d: FilmDistribution, now: number): number {
  const p = d.promo;
  if (!p) return 0;
  const price = money(p.price);
  if (!price || (p.startsAt && now < p.startsAt) || (p.endsAt && now > p.endsAt)) return 0;
  return price;
}

/** What a viewer can actually pay for. Prices only count for the models that use them. */
export function filmOffers(d: FilmDistribution | undefined, now = Date.now()): FilmOffers {
  if (!d || d.model === 'FREE_FAST') return {};
  const out: FilmOffers = {};
  const listBuy = money(d.purchasePrice);
  const promo = d.model === 'PPV' ? 0 : promoPrice(d, now);
  const buyPrice = promo > 0 && promo < listBuy ? promo : listBuy;
  const rentPrice = money(d.rentalPrice);
  if ((d.model === 'PURCHASE' || d.model === 'HYBRID' || d.model === 'PPV') && buyPrice > 0) {
    out.buy = { grant: d.model === 'PPV' ? 'PPV' : 'PURCHASE', price: buyPrice };
  }
  if ((d.model === 'RENTAL' || d.model === 'HYBRID') && rentPrice > 0) {
    out.rent = { price: rentPrice, windowHrs: windowOf(d.rentalWindowHrs) };
  }
  return out;
}

/** The legacy flat album fields, derived from a distribution so old readers stay in step. */
export function legacyFilmFields(d: FilmDistribution): Pick<Album, 'isPaywalled' | 'isAdSupported' | 'price'> {
  const o = filmOffers(d);
  return {
    isPaywalled: !!(o.buy || o.rent),
    isAdSupported: d.model === 'FREE_FAST' || !!d.fastChannel,
    price: o.buy?.price ?? o.rent?.price ?? 0,
  };
}

export type FilmCharge =
  | { ok: true; grant: FilmGrant; price: number; rentalWindowHrs?: number; delivery: 'DOWNLOAD_OPEN' | 'PLAJAH_ONLY'; watermark: boolean }
  | { ok: false; error: string };

/** Server-side: turn a buyer's request ("rent" or "buy") into the exact charge. */
export function resolveFilmCharge(d: FilmDistribution | undefined, requested: unknown): FilmCharge {
  const o = filmOffers(d);
  if (!o.buy && !o.rent) return { ok: false, error: 'This film is not for sale' };
  if (requested === 'RENTAL') {
    if (!o.rent) return { ok: false, error: 'This film is not offered for rent' };
    // Rentals always stream in-app — never a downloadable copy.
    return { ok: true, grant: 'RENTAL', price: o.rent.price, rentalWindowHrs: o.rent.windowHrs, delivery: 'PLAJAH_ONLY', watermark: false };
  }
  if (!o.buy) return { ok: false, error: 'This film is only offered for rent' };
  return {
    ok: true, grant: o.buy.grant, price: o.buy.price,
    delivery: d!.delivery === 'PLAJAH_ONLY' ? 'PLAJAH_ONLY' : 'DOWNLOAD_OPEN',
    watermark: d!.watermark !== false,
  };
}
