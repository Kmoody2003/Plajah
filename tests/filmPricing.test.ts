// Film pricing: the server resolves a film's charge from its filmDistribution, never the request.
//
//   npx tsx --test tests/filmPricing.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filmDistributionOf, filmOffers, legacyFilmFields, resolveFilmCharge } from '../services/filmPricing';
import type { FilmDistribution } from '../types';

const dist = (d: Partial<FilmDistribution>): FilmDistribution => ({ model: 'HYBRID', release: 'NOW', ...d } as FilmDistribution);

test('free films are never for sale, whatever the client asks for', () => {
  const d = dist({ model: 'FREE_FAST', purchasePrice: 12.99, rentalPrice: 3.99 });
  assert.equal(resolveFilmCharge(d, 'PURCHASE').ok, false);
  assert.equal(resolveFilmCharge(d, 'RENTAL').ok, false);
  assert.equal(resolveFilmCharge(undefined, 'PURCHASE').ok, false);
});

test('buy charges the stored purchase price and keeps the creator delivery choice', () => {
  const c = resolveFilmCharge(dist({ model: 'PURCHASE', purchasePrice: 12.99, delivery: 'PLAJAH_ONLY', watermark: false }), 'PURCHASE');
  assert.deepEqual(c, { ok: true, grant: 'PURCHASE', price: 12.99, delivery: 'PLAJAH_ONLY', watermark: false });
});

test('a rental-only film cannot be bought, and its rental streams in-app only', () => {
  const d = dist({ model: 'RENTAL', rentalPrice: 3.99, purchasePrice: 12.99, rentalWindowHrs: 72, delivery: 'DOWNLOAD_OPEN' });
  assert.equal(resolveFilmCharge(d, 'PURCHASE').ok, false);
  assert.deepEqual(resolveFilmCharge(d, 'RENTAL'), { ok: true, grant: 'RENTAL', price: 3.99, rentalWindowHrs: 72, delivery: 'PLAJAH_ONLY', watermark: false });
  assert.equal(filmOffers(d).buy, undefined);   // the page must not show a Buy button either
});

test('a purchase-only film cannot be rented', () => {
  assert.equal(resolveFilmCharge(dist({ model: 'PURCHASE', purchasePrice: 9.99, rentalPrice: 1 }), 'RENTAL').ok, false);
});

test('any unknown grant is treated as a purchase, never a cheaper or free grant', () => {
  const d = dist({ model: 'HYBRID', purchasePrice: 15, rentalPrice: 4 });
  for (const g of ['OWN', 'FREE', '', undefined, 'PPV']) {
    const c = resolveFilmCharge(d, g);
    assert.ok(c.ok && c.grant === 'PURCHASE' && c.price === 15, `grant ${String(g)}`);
  }
});

test('PPV films sell a premiere ticket at the ticket price', () => {
  const c = resolveFilmCharge(dist({ model: 'PPV', purchasePrice: 8 }), 'PURCHASE');
  assert.ok(c.ok && c.grant === 'PPV' && c.price === 8);
});

test('a zero, negative or junk price means not for sale', () => {
  for (const p of [0, -5, NaN, 'abc' as any]) {
    assert.equal(resolveFilmCharge(dist({ model: 'PURCHASE', purchasePrice: p }), 'PURCHASE').ok, false);
  }
});

test('rental window falls back to 48h when unset or invalid', () => {
  assert.equal(filmOffers(dist({ model: 'RENTAL', rentalPrice: 2 })).rent?.windowHrs, 48);
  assert.equal(filmOffers(dist({ model: 'RENTAL', rentalPrice: 2, rentalWindowHrs: 999 as any })).rent?.windowHrs, 48);
});

test('a promo lowers the buy price only while its window is open', () => {
  const now = Date.UTC(2026, 9, 21);
  const d = dist({ model: 'PURCHASE', purchasePrice: 12, promo: { price: 5, startsAt: now - 1000, endsAt: now + 1000 } });
  assert.equal(filmOffers(d, now).buy?.price, 5);
  assert.equal(filmOffers(d, now + 5000).buy?.price, 12);
  assert.equal(filmOffers(dist({ model: 'PURCHASE', purchasePrice: 4, promo: { price: 9 } }), now).buy?.price, 4); // never raises
});

test('legacy albums priced before filmDistribution still sell at their price', () => {
  const d = filmDistributionOf({ isPaywalled: true, price: 7.5 });
  assert.equal(resolveFilmCharge(d, 'PURCHASE').ok && (resolveFilmCharge(d, 'PURCHASE') as any).price, 7.5);
  assert.equal(filmDistributionOf({ isPaywalled: false, price: 7.5 }), undefined);
});

test('legacy flags are derived from the distribution', () => {
  assert.deepEqual(legacyFilmFields(dist({ model: 'RENTAL', rentalPrice: 3 })), { isPaywalled: true, isAdSupported: false, price: 3 });
  assert.deepEqual(legacyFilmFields(dist({ model: 'FREE_FAST' })), { isPaywalled: false, isAdSupported: true, price: 0 });
});
