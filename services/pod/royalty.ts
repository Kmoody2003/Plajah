// Royalty / pricing math for Plajah print editions. Pure, integer cents.
// Platform cut on direct sales = 5% of the LIST price (not on shipping/tax pass-through).
// Card fees: Stripe's published US standard rate 2.9% + 30c. This is an ESTIMATE; real fees vary by card/country.

export const PLATFORM_CUT_RATE = 0.05;
export const CARD_FEE_RATE = 0.029;
export const CARD_FEE_FIXED_CENTS = 30;

export interface RoyaltyInput {
  listPriceCents: number;
  printCostCents: number;       // per copy: manufacturing (+ fulfillment) excl. shipping
  shippingCents?: number;       // passed through to the buyer at cost
  taxCents?: number;            // passed through to the buyer at cost
}
export interface RoyaltyBreakdown {
  buyerTotalCents: number;
  printCostCents: number;
  platformCutCents: number;
  cardFeeCents: number;         // estimate
  authorProfitCents: number;    // negative if the price is too low
}

export function computeRoyalty(i: RoyaltyInput): RoyaltyBreakdown {
  const ship = i.shippingCents ?? 0, tax = i.taxCents ?? 0;
  const buyerTotal = i.listPriceCents + ship + tax;
  const platform = Math.round(i.listPriceCents * PLATFORM_CUT_RATE);
  const card = Math.round(buyerTotal * CARD_FEE_RATE) + CARD_FEE_FIXED_CENTS;
  // Shipping + tax are collected from the buyer and paid on to the printer, so they net to zero
  // for the author, EXCEPT the card fee on them, which the author bears (it is inside `card`).
  const profit = i.listPriceCents - i.printCostCents - platform - card;
  return { buyerTotalCents: buyerTotal, printCostCents: i.printCostCents, platformCutCents: platform, cardFeeCents: card, authorProfitCents: profit };
}

/** Smallest list price (cents) whose profit is >= 0. Starts from a closed-form estimate so rounding is exact. */
export function minimumListPriceCents(printCostCents: number, shippingCents = 0, taxCents = 0): number {
  const pass = shippingCents + taxCents;
  let L = Math.max(0, Math.floor((printCostCents + CARD_FEE_FIXED_CENTS + CARD_FEE_RATE * pass) / (1 - PLATFORM_CUT_RATE - CARD_FEE_RATE)) - 3);
  for (let n = 0; n < 40; n++, L++) {
    if (computeRoyalty({ listPriceCents: L, printCostCents, shippingCents, taxCents }).authorProfitCents >= 0) return L;
  }
  return L;
}

export function priceIsViable(listPriceCents: number, printCostCents: number, shippingCents = 0, taxCents = 0): boolean {
  return listPriceCents >= minimumListPriceCents(printCostCents, shippingCents, taxCents);
}
