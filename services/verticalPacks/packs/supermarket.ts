/**
 * Full-service grocery store / supermarket (independent or small chain). Real-world notes baked in:
 *  - Departments follow a typical US supermarket layout: Produce, Meat & Seafood, Deli, Bakery, Dairy, Frozen,
 *    Pantry (center store), Household, Health & Beauty, Beer & Wine. Prices are typical 2026 US shelf prices;
 *    costs reflect department margins (center store ~25-30%, produce ~35-40%, meat ~25-30%, deli/bakery 40-55%,
 *    HBC ~35%, beer/wine ~20-25%). Supermarket net margin is only 1-3%, so deals are kept small.
 *  - Random-weight items (loose produce, meat and seafood case, deli by the pound) are priced per lb and need a
 *    scale-integrated register. PosRegister cannot sell catalog items by weight yet, so they are seeded as
 *    INACTIVE drafts gated on WEIGHED_REGISTER. Prepacked fixed-price items (1 lb ground beef, bagged salad) are live.
 *  - SNAP: staple foods, cold deli, bakery and seeds are eligible; hot foods sold for on-premises eating or hot at
 *    sale, alcohol, tobacco, vitamins/supplements, pet food, household and HBC items are NOT eligible.
 *  - Age: beer and wine 21+ (alcohol sale hours and grocery wine licensing vary by state; some states only allow
 *    beer or low-ABV in grocery stores). Lottery is sold on the state terminal, not from inventory.
 *  - Tax: many states exempt or reduce tax on grocery food but tax prepared food, candy/soda (varies) and
 *    non-food at the full rate. Tax classes are set per item; TAX is partial, so confirm with your state.
 *  - EBT needs USDA FNS authorization and a certified EBT processor; Plajah payments cannot settle EBT.
 *  - Smaller c-store / bodega footprint? Use the "Corner Store & Convenience" pack instead.
 */
import type { VerticalPack, StarterItem, TaxClass, AgeRestriction } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

interface Opt { snap?: boolean; tax?: TaxClass; age?: AgeRestriction; stock?: number; low?: number; weigh?: boolean; unit?: string; emoji?: string; desc?: string; sku?: string }
const p = (key: string, name: string, category: string, price: number, cost: number, o: Opt = {}): StarterItem => ({
  key, name, category, price, costPrice: cost, kind: 'product',
  description: o.desc ?? name,
  stock: o.stock ?? 24, lowStockThreshold: o.low ?? 6,
  taxClass: o.tax ?? (o.snap === false ? 'STANDARD' : 'GROCERY_FOOD'),
  snapEligible: o.snap ?? true,
  storeCategory: 'OTHER',
  ...(o.age ? { ageRestricted: o.age } : {}),
  ...(o.weigh ? { soldBy: 'weight' as const, unitLabel: o.unit ?? 'lb', requires: 'WEIGHED_REGISTER' as const } : {}),
  ...(o.emoji ? { emoji: o.emoji } : {}),
  ...(o.sku ? { sku: o.sku } : {}),
});
const nonFood = (o: Opt = {}): Opt => ({ snap: false, tax: 'STANDARD', ...o });

const items: StarterItem[] = [
  // Produce
  p('bananas', 'Bananas (per lb)', 'Produce', 0.65, 0.38, { weigh: true, stock: 120, low: 30, emoji: '🍌' }),
  p('apples_gala', 'Gala Apples (per lb)', 'Produce', 1.99, 1.15, { weigh: true, stock: 80, low: 20, emoji: '🍎' }),
  p('tomatoes_roma', 'Roma Tomatoes (per lb)', 'Produce', 1.79, 1.00, { weigh: true, stock: 40, low: 10, emoji: '🍅' }),
  p('avocado', 'Hass Avocado, each', 'Produce', 1.25, 0.70, { stock: 48, low: 12, emoji: '🥑' }),
  p('salad_bag', 'Spring Mix Salad, 5 oz bag', 'Produce', 3.99, 2.40, { stock: 18, emoji: '🥗' }),
  p('strawberries', 'Strawberries, 1 lb clamshell', 'Produce', 3.99, 2.50, { stock: 20, emoji: '🍓' }),
  // Meat & Seafood
  p('ground_beef', 'Ground Beef 80/20, 1 lb pack', 'Meat & Seafood', 5.99, 4.40, { stock: 30, low: 8, emoji: '🥩' }),
  p('chicken_breast', 'Boneless Chicken Breast (per lb)', 'Meat & Seafood', 3.99, 2.80, { weigh: true, stock: 60, low: 15, emoji: '🍗' }),
  p('ribeye', 'Ribeye Steak, USDA Choice (per lb)', 'Meat & Seafood', 13.99, 10.20, { weigh: true, stock: 20, low: 5 }),
  p('salmon', 'Atlantic Salmon Fillet (per lb)', 'Meat & Seafood', 10.99, 7.60, { weigh: true, stock: 15, low: 4, emoji: '🐟' }),
  p('bacon', 'Thick-Cut Bacon, 16 oz', 'Meat & Seafood', 6.99, 5.00, { stock: 24 }),
  // Deli
  p('deli_turkey', 'Oven-Roasted Turkey Breast, sliced (per lb)', 'Deli', 10.99, 6.20, { weigh: true, stock: 20, low: 5, desc: 'Sliced to order at the deli counter.' }),
  p('deli_cheese', 'Swiss Cheese, sliced (per lb)', 'Deli', 8.99, 5.10, { weigh: true, stock: 15, low: 4 }),
  p('rotisserie', 'Hot Rotisserie Chicken', 'Deli', 7.99, 4.60, { snap: false, tax: 'PREPARED_FOOD', stock: 20, low: 5, desc: 'Sold hot, so not SNAP-eligible. A cold chicken from the grab-and-go case is eligible.' }),
  p('cold_sub', 'Italian Sub, cold (grab-and-go)', 'Deli', 7.49, 3.60, { tax: 'PREPARED_FOOD', stock: 12, low: 4, desc: 'Cold prepackaged sandwiches are SNAP-eligible; many states still tax them as prepared food.' }),
  // Bakery
  p('baguette', 'French Baguette, baked in store', 'Bakery', 2.99, 0.90, { stock: 24, low: 6, emoji: '🥖' }),
  p('sandwich_bread', 'Sandwich Bread, 20 oz', 'Bakery', 3.49, 2.30, { emoji: '🍞' }),
  p('birthday_cake', 'Decorated Sheet Cake, 1/4 sheet', 'Bakery', 29.99, 11.00, { stock: 4, low: 1, emoji: '🎂', desc: 'Custom writing included. 48 hours notice for custom designs. SNAP-eligible (non-food decorations over 50% of value are not).' }),
  // Dairy
  p('milk_gal', 'Whole Milk, 1 gal', 'Dairy', 4.29, 3.30, { stock: 40, low: 12, emoji: '🥛' }),
  p('eggs_dozen', 'Large Eggs, 12 ct', 'Dairy', 3.49, 2.50, { stock: 36, low: 10, emoji: '🥚' }),
  p('butter', 'Salted Butter, 1 lb', 'Dairy', 4.99, 3.70),
  p('cheddar', 'Shredded Cheddar, 8 oz', 'Dairy', 2.99, 2.00),
  p('greek_yogurt', 'Greek Yogurt, 32 oz', 'Dairy', 5.99, 4.10),
  // Frozen
  p('frozen_pizza', 'Frozen Pizza, 12 inch', 'Frozen', 6.49, 4.40, { emoji: '🍕' }),
  p('ice_cream', 'Ice Cream, 1.5 qt', 'Frozen', 5.49, 3.70, { emoji: '🍨' }),
  // Pantry (center store)
  p('cereal', 'Breakfast Cereal, family size', 'Pantry', 5.49, 3.90),
  p('pasta', 'Spaghetti, 16 oz', 'Pantry', 1.69, 1.05),
  p('pasta_sauce', 'Marinara Sauce, 24 oz', 'Pantry', 3.29, 2.30),
  p('rice', 'Long Grain White Rice, 5 lb', 'Pantry', 5.99, 4.20),
  p('coffee_ground', 'Ground Coffee, 24 oz', 'Pantry', 11.99, 8.60, { emoji: '☕' }),
  p('soda_12pk', 'Soda, 12-pack cans', 'Pantry', 7.99, 5.90, { desc: 'Some states tax soft drinks at the full rate; check yours.' }),
  // Household
  p('paper_towels', 'Paper Towels, 6 double rolls', 'Household', 12.99, 9.40, nonFood({ stock: 18 })),
  p('laundry_det', 'Liquid Laundry Detergent, 92 oz', 'Household', 13.99, 9.80, nonFood({ stock: 12, low: 4 })),
  p('dog_food', 'Dry Dog Food, 15 lb', 'Household', 19.99, 14.20, nonFood({ stock: 8, low: 2, desc: 'Pet food is not SNAP-eligible.' })),
  // Health & Beauty
  p('shampoo', 'Shampoo, 12 oz', 'Health & Beauty', 5.99, 3.70, nonFood({ stock: 12, low: 3 })),
  p('pain_reliever', 'Ibuprofen 200 mg, 100 ct', 'Health & Beauty', 8.99, 5.40, nonFood({ stock: 12, low: 3 })),
  p('vitamins', 'Daily Multivitamin, 100 ct', 'Health & Beauty', 10.99, 6.80, nonFood({ stock: 8, low: 2, desc: 'Vitamins and supplements with a Supplement Facts label are not SNAP-eligible.' })),
  // Beer & Wine (21+)
  p('beer_12', 'Domestic Beer, 12-pack cans', 'Beer & Wine (21+)', 15.99, 12.40, nonFood({ age: 'ALCOHOL', stock: 24, low: 6, desc: 'Check ID (21+). Grocery alcohol licensing and sale hours vary by state.' })),
  p('craft_6', 'Craft IPA, 6-pack', 'Beer & Wine (21+)', 11.99, 8.90, nonFood({ age: 'ALCOHOL', stock: 12, low: 3 })),
  p('wine_red', 'Cabernet Sauvignon, 750 ml', 'Beer & Wine (21+)', 12.99, 8.90, nonFood({ age: 'ALCOHOL', stock: 12, low: 3, emoji: '🍷' })),
];

const supermarket: VerticalPack = {
  id: 'supermarket',
  version: 1,
  parent: 'RETAIL',
  label: 'Grocery Store',
  blurb: 'Full-service supermarket: produce, meat, deli, bakery and center store. Department reporting, SNAP flags, age checks and low-stock alerts.',
  icon: 'ShoppingCart',
  color: '#00B4D8',
  clinical: false,
  vocabulary: {
    customer: 'shopper', customers: 'shoppers',
    staff: 'associate', staffPlural: 'associates',
    catalogNoun: 'Inventory', catalogNounSingular: 'item',
    orderNoun: 'sale', orderNounPlural: 'sales',
    checkoutVerb: 'Ring up',
  },
  capabilities: [
    { id: 'POS', importance: 'core' }, { id: 'INVENTORY', importance: 'core' },
    { id: 'TAX', importance: 'core', why: 'Grocery food, prepared food and non-food tax differently in most states.' },
    { id: 'AGE_GATE', importance: 'core', why: 'Beer and wine need ID checks.' },
    { id: 'WEIGHED_REGISTER', importance: 'nice', why: 'Loose produce, meat case and deli by the pound.' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice', why: 'Weekly ad specials.' },
    { id: 'ONLINE_STORE', importance: 'nice', why: 'Online ordering for pickup.' },
    { id: 'DELIVERY', importance: 'nice', why: 'Local grocery delivery windows.' },
    { id: 'SIGNAGE', importance: 'nice' }, { id: 'RADIO', importance: 'nice' }, { id: 'MESSAGING', importance: 'nice' },
    { id: 'SUPPLIERS', importance: 'nice', why: 'Wholesaler and DSD vendor ordering.' },
    { id: 'EBT_SNAP', importance: 'nice', why: 'Requires USDA authorization and an EBT processor.' },
    { id: 'STAFF_ROLES', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'ORDERS', 'INVENTORY', 'CRM', 'MESSAGING', 'SIGNAGE', 'TEAM', 'RADIO', 'SETTINGS'],
  publicSections: ['products', 'hours', 'amenities', 'gallery'],
  defaultHours: week(['07:00', '22:00']),
  pageDefaults: { isAcceptingOrders: true, crmEnabled: true, digitalSignageEnabled: true, radioServiceEnabled: true, priceRange: '$$', amenities: ['parking', 'carts', 'restrooms', 'atm'], tags: ['grocery', 'supermarket', 'produce', 'deli', 'bakery'] },
  starterCatalog: {
    categories: [
      { name: 'Produce', emoji: '🥬' }, { name: 'Meat & Seafood', emoji: '🥩' }, { name: 'Deli', emoji: '🧀' },
      { name: 'Bakery', emoji: '🥐' }, { name: 'Dairy', emoji: '🥛' }, { name: 'Frozen', emoji: '🧊' },
      { name: 'Pantry', emoji: '🥫' }, { name: 'Household', emoji: '🧻' }, { name: 'Health & Beauty', emoji: '🧴' },
      { name: 'Beer & Wine (21+)', emoji: '🪪' },
    ],
    items,
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Store Manager', 'Runs the store, sets prices and the weekly ad, handles voids, refunds and end-of-day.'),
    { key: 'DEPT_MANAGER', label: 'Department Manager', baseRole: 'ADMIN', description: 'Owns one department (produce, meat, deli, bakery): ordering, shrink and pricing for that department.' },
    { key: 'HEAD_CASHIER', label: 'Head Cashier / Front End', baseRole: 'STAFF', description: 'Opens and closes lanes, approves overrides, counts drawers.' },
    { key: 'CASHIER', label: 'Cashier', baseRole: 'STAFF', description: 'Rings up sales and checks ID for beer and wine. No price edits.' },
    { key: 'CLERK', label: 'Stock / Department Clerk', baseRole: 'STAFF', description: 'Receives deliveries, stocks shelves and adjusts counts.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 200, reward: '$5 off your next trip' }, { points: 500, reward: 'Free bakery item or deli side' }, { points: 1000, reward: '$15 off a $75 order' }],
  },
  deals: [
    { key: 'members_3', label: 'Members save 3%', kind: 'PERCENT', value: 3, membersOnly: true, startActive: true, note: 'Keep small; grocery net margins are 1-3%.' },
    { key: 'ten_off_100', label: '$10 off $100+', kind: 'AMOUNT', value: 10, minSubtotalCents: 10000, startActive: true },
    { key: 'senior_day', label: 'Senior Tuesday 5% off', kind: 'PERCENT', value: 5, startActive: false, note: 'Switch on for your senior discount day; staff confirm age at the lane.' },
    { key: 'weekly_ad', label: 'Weekly ad 10% off $50+', kind: 'PERCENT', value: 10, minSubtotalCents: 5000, startActive: false, note: 'Turn on for promo weeks; item-level ad prices are set by editing items.' },
  ],
  signage: [
    slide('Fresh from the bakery', 'Baguettes out of the oven at 7am and 3pm', '#33001a'),
    slide('This week: ribeye $13.99/lb', 'USDA Choice, cut in store', '#330000'),
    slide('Rewards members save 3%', 'Every trip. Ask at any lane.', '#1a0033'),
    slide('Order your celebration cake', '48 hours notice at the bakery counter', '#001a33'),
    slide('ID required for beer and wine', '21+. We card anyone who looks under 40.', '#000'),
  ],
  hardware: [
    { name: 'Tablet or touch monitor per lane', why: 'Runs the register.', required: true, approxUsd: 300 },
    { name: 'Card reader per lane', why: 'Tap, chip and swipe via Stripe.', required: true, approxUsd: 59 },
    { name: 'Barcode scanner per lane', why: 'UPC scanning at checkout and receiving.', required: true, approxUsd: 60 },
    { name: 'Receipt printer + cash drawer per lane', why: 'Receipts and cash.', required: false, approxUsd: 210 },
    { name: 'Legal-for-trade scale (NTEP)', why: 'Required for anything sold by weight; not yet integrated with the register.', required: false, approxUsd: 450 },
    { name: 'Deli/meat label scale', why: 'Prints price-embedded barcode labels for random-weight packs.', required: false, approxUsd: 1500 },
    { name: 'Shelf label printer', why: 'Shelf tags and weekly ad signs.', required: false, approxUsd: 150 },
    { name: 'TV or display for signage', why: 'Weekly specials at the entrance and deli.', required: false, approxUsd: 250 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Inventory',
    extra: [
      { id: 'age_rules', label: 'Confirm your beer and wine rules', detail: 'We flagged beer and wine 21+. Confirm your state grocery alcohol license and sale hours.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'tax_check', label: 'Confirm tax by department', detail: 'Grocery food, prepared/hot food, soda and candy, and non-food often tax differently by state.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS', requires: 'TAX' },
      { id: 'departments', label: 'Assign department managers', detail: 'Give produce, meat, deli and bakery leads the Department Manager role.', minutes: 2, detect: 'MANUAL', tab: 'TEAM', optional: true },
      { id: 'scale_setup', label: 'Weighed items at the register', detail: 'Produce, meat and deli by the pound are saved as drafts until the register can read a scale.', minutes: 0, detect: 'MANUAL', requires: 'WEIGHED_REGISTER', optional: true },
      { id: 'ebt_connected', label: 'EBT / SNAP: connected mode', detail: 'Apply for USDA SNAP authorization and sign with an EBT processor; keep your EBT terminal for those tenders. SNAP-eligible items are flagged so reports can split them.', minutes: 0, detect: 'MANUAL', requires: 'EBT_SNAP', optional: true },
      { id: 'weekly_signage', label: 'Put the weekly ad on a screen', detail: 'Edit a sample slide with this week\'s specials.', minutes: 2, detect: 'SIGNAGE_SLIDE', tab: 'SIGNAGE', optional: true },
    ],
  }),
  automations: [
    { id: 'low_stock_default', kind: 'LOW_STOCK', label: 'Low-stock alert', params: { defaultThreshold: 6, fastMoverThreshold: 24 } },
    { id: 'low_stock_dairy', kind: 'LOW_STOCK', label: 'Milk and eggs reorder point', params: { category: 'Dairy', threshold: 12 } },
    { id: 'winback', kind: 'WINBACK', label: 'Win back shoppers who stopped coming', params: { afterDays: 30 }, requires: 'REMINDERS' },
    { id: 'cake_pickup', kind: 'REMINDER', label: 'Cake order pickup reminder', params: { hoursBefore: 24 }, requires: 'REMINDERS' },
  ],
  policies: [
    { id: 'returns', label: 'Returns', text: '100% satisfaction: bring back any grocery item with your receipt within 30 days for a refund or replacement. Beer, wine and opened health items cannot be returned where state law prohibits it.' },
    { id: 'age', label: 'Age verification', text: 'We check ID for beer and wine (21+). We card anyone who looks under 40. No ID, no sale.' },
    { id: 'rainchecks', label: 'Rain checks', text: 'If an advertised item sells out we will issue a rain check at the sale price, valid 30 days. Limited-quantity and "while supplies last" items excluded.' },
    { id: 'snap', label: 'SNAP / EBT', text: 'We accept SNAP EBT for eligible food items. Hot foods, alcohol, vitamins, pet food and non-food items cannot be bought with SNAP benefits.' },
  ],
  extras: {
    ageGateDefaults: [
      { id: 'ALCOHOL', minAge: 21, note: 'Check state grocery license, sale hours and whether wine is allowed.' },
      { id: 'LOTTERY', minAge: 18, note: 'Varies by state (18, 19 or 21). Sold on the state terminal, not in inventory.' },
    ],
    snapNote: 'Eligible: staple foods, cold deli, bakery, seeds and plants that produce food. Not eligible: hot foods, alcohol, tobacco, vitamins/supplements, pet food, household and HBC items.',
    departmentMarginsPercent: { Produce: 38, 'Meat & Seafood': 28, Deli: 45, Bakery: 55, Dairy: 25, Frozen: 28, Pantry: 27, Household: 30, 'Health & Beauty': 35, 'Beer & Wine (21+)': 22 },
    smallerFormatPack: 'grocery_corner_store',
  },
};

export default supermarket;
