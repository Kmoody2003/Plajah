/**
 * Grocery / corner store. Real-world notes baked in:
 *  - Prices are typical US convenience-store shelf prices; costs are ~65-75% of shelf on packaged goods
 *    (c-store gross margin on packaged food is usually 30-40%, tobacco ~10-15%, beer ~20-25%).
 *  - Tobacco and nicotine: federal minimum sale age is 21. Alcohol: 21. Lottery: state-run, usually 18
 *    (some states 19 or 21), and sold through the state terminal, NOT through inventory, so it is an age-gate
 *    default and a note, not a seeded product.
 *  - SNAP eligibility: staple foods only. Hot / ready-to-eat foods, alcohol, tobacco, vitamins/supplements
 *    and non-food household items are NOT eligible. Cold prepackaged sandwiches ARE eligible.
 *  - EBT acceptance needs USDA FNS authorization plus a certified EBT processor; Plajah payments (Stripe)
 *    cannot settle EBT, so the EBT step is a manual connected-mode checklist item and the capability is planned.
 */
import type { VerticalPack, StarterItem, TaxClass, AgeRestriction } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

interface Opt { snap?: boolean; tax?: TaxClass; age?: AgeRestriction; stock?: number; low?: number; weigh?: boolean; unit?: string; emoji?: string; desc?: string }
const p = (key: string, name: string, category: string, price: number, cost: number, o: Opt = {}): StarterItem => ({
  key, name, category, price, costPrice: cost, kind: 'product',
  description: o.desc ?? name,
  stock: o.stock ?? 12, lowStockThreshold: o.low ?? 4,
  taxClass: o.tax ?? (o.snap === false ? 'STANDARD' : 'GROCERY_FOOD'),
  snapEligible: o.snap ?? true,
  ...(o.age ? { ageRestricted: o.age } : {}),
  ...(o.weigh ? { soldBy: 'weight' as const, unitLabel: o.unit ?? 'lb', requires: 'WEIGHED_REGISTER' as const } : {}),
  ...(o.emoji ? { emoji: o.emoji } : {}),
});

const items: StarterItem[] = [
  // Snacks
  p('chips_classic', 'Potato Chips, 2.625 oz', 'Snacks', 1.79, 1.10, { stock: 24, emoji: '🥔' }),
  p('chips_big', 'Tortilla Chips, 9.25 oz', 'Snacks', 4.49, 3.00, { emoji: '🌽' }),
  p('pretzels', 'Pretzel Twists, 16 oz', 'Snacks', 3.99, 2.60),
  p('candy_bar', 'Chocolate Candy Bar', 'Snacks', 1.89, 1.05, { stock: 36 }),
  p('gum', 'Gum, 15-stick pack', 'Snacks', 1.99, 1.15, { stock: 30 }),
  p('jerky', 'Beef Jerky, 3 oz', 'Snacks', 7.99, 5.40),
  p('granola_bar', 'Granola Bars, 6 ct', 'Snacks', 4.29, 2.90),
  // Dairy and eggs
  p('milk_gal', 'Whole Milk, 1 gal', 'Dairy & Eggs', 4.79, 3.55, { stock: 10, low: 4, emoji: '🥛' }),
  p('milk_half', 'Whole Milk, half gal', 'Dairy & Eggs', 3.19, 2.30),
  p('eggs_dozen', 'Eggs, large, 12 ct', 'Dairy & Eggs', 3.99, 2.85, { stock: 14, low: 5, emoji: '🥚' }),
  p('butter', 'Salted Butter, 1 lb', 'Dairy & Eggs', 5.49, 4.10),
  p('cheese_slices', 'American Cheese Slices, 12 ct', 'Dairy & Eggs', 3.79, 2.60),
  p('yogurt', 'Yogurt Cup, 6 oz', 'Dairy & Eggs', 1.29, 0.80, { stock: 20 }),
  // Beverages
  p('water_16', 'Bottled Water, 16.9 oz', 'Beverages', 1.49, 0.60, { stock: 48, low: 12, emoji: '💧' }),
  p('soda_20', 'Soda, 20 oz bottle', 'Beverages', 2.39, 1.20, { stock: 36, low: 12 }),
  p('soda_12pk', 'Soda, 12-pack cans', 'Beverages', 8.99, 6.60),
  p('energy', 'Energy Drink, 16 oz', 'Beverages', 3.29, 1.90, { stock: 24 }),
  p('juice', 'Orange Juice, 52 oz', 'Beverages', 4.99, 3.50),
  p('sports_drink', 'Sports Drink, 28 oz', 'Beverages', 2.49, 1.40, { stock: 24 }),
  p('coffee_hot', 'Fresh Hot Coffee, 16 oz', 'Beverages', 1.99, 0.35, { snap: false, tax: 'PREPARED_FOOD', stock: 999, low: 0, desc: 'Brewed in store (hot, so not SNAP-eligible)' }),
  // Pantry / grocery
  p('bread', 'Sandwich Bread, 20 oz', 'Pantry', 3.49, 2.40, { emoji: '🍞' }),
  p('cereal', 'Breakfast Cereal, 12 oz', 'Pantry', 4.99, 3.40),
  p('pasta', 'Spaghetti, 16 oz', 'Pantry', 2.19, 1.30),
  p('pasta_sauce', 'Pasta Sauce, 24 oz', 'Pantry', 3.49, 2.20),
  p('rice', 'Long Grain Rice, 2 lb', 'Pantry', 3.29, 2.10),
  p('beans', 'Canned Black Beans, 15 oz', 'Pantry', 1.59, 0.90),
  p('soup', 'Chicken Noodle Soup, 10.75 oz', 'Pantry', 2.19, 1.30),
  p('pb', 'Peanut Butter, 16 oz', 'Pantry', 4.29, 2.90),
  p('instant_noodles', 'Instant Noodles', 'Pantry', 1.19, 0.55, { stock: 30 }),
  // Produce (sold by weight: seeded as drafts until the register supports it)
  p('bananas', 'Bananas (per lb)', 'Produce', 0.69, 0.40, { weigh: true, emoji: '🍌' }),
  p('apples', 'Apples (per lb)', 'Produce', 1.99, 1.20, { weigh: true, emoji: '🍎' }),
  p('onions', 'Yellow Onions (per lb)', 'Produce', 1.29, 0.70, { weigh: true }),
  p('potatoes', 'Russet Potatoes (per lb)', 'Produce', 0.99, 0.55, { weigh: true }),
  p('lemons', 'Lemons', 'Produce', 0.79, 0.40, { emoji: '🍋' }),
  // Household and personal care (not SNAP, standard tax)
  p('paper_towels', 'Paper Towels, 2 rolls', 'Household', 3.99, 2.60, { snap: false, tax: 'STANDARD' }),
  p('tissue', 'Toilet Paper, 4 rolls', 'Household', 4.49, 3.00, { snap: false, tax: 'STANDARD' }),
  p('dish_soap', 'Dish Soap, 12 oz', 'Household', 3.29, 2.00, { snap: false, tax: 'STANDARD' }),
  p('trash_bags', 'Trash Bags, 13 gal, 20 ct', 'Household', 5.49, 3.60, { snap: false, tax: 'STANDARD' }),
  p('batteries_aa', 'AA Batteries, 4 pk', 'Household', 6.99, 4.30, { snap: false, tax: 'STANDARD' }),
  p('toothpaste', 'Toothpaste, 4 oz', 'Household', 3.99, 2.40, { snap: false, tax: 'STANDARD' }),
  p('pain_reliever', 'Pain Reliever, 24 ct', 'Household', 6.49, 4.00, { snap: false, tax: 'STANDARD' }),
  // Age-restricted (21+). Prices vary a lot by state tax and brand; owner must reprice.
  p('beer_6', 'Domestic Beer, 6-pack', 'Beer & Tobacco (21+)', 9.99, 7.60, { snap: false, tax: 'STANDARD', age: 'ALCOHOL', stock: 12, desc: 'Check ID. Alcohol taxes and hours differ by state.' }),
  p('beer_single', 'Tallboy Can, 24 oz', 'Beer & Tobacco (21+)', 2.99, 2.10, { snap: false, tax: 'STANDARD', age: 'ALCOHOL', stock: 24 }),
  p('cigs_pack', 'Cigarettes, pack', 'Beer & Tobacco (21+)', 10.49, 9.60, { snap: false, tax: 'STANDARD', age: 'TOBACCO', stock: 40, low: 10, desc: 'Check ID (21+). Tobacco carries thin margin and heavy state tax; reprice to your state.' }),
  p('lighter', 'Lighter', 'Beer & Tobacco (21+)', 1.99, 0.60, { snap: false, tax: 'STANDARD', stock: 30 }),
  // Prepared / deli
  p('cold_sandwich', 'Pre-made Sandwich (cold)', 'Deli & Ready', 5.99, 3.10, { tax: 'PREPARED_FOOD', desc: 'Cold prepackaged sandwiches are SNAP-eligible.' }),
  p('hot_dog', 'Hot Dog (roller grill)', 'Deli & Ready', 2.49, 0.80, { snap: false, tax: 'PREPARED_FOOD', stock: 999, low: 0, desc: 'Hot ready-to-eat food is not SNAP-eligible.' }),
];

const grocery: VerticalPack = {
  id: 'grocery_corner_store',
  version: 1,
  parent: 'RETAIL',
  label: 'Grocery / Corner Store',
  blurb: 'Convenience, bodega and small grocery. Fast register, age checks, stock alerts.',
  icon: 'ShoppingBasket',
  color: '#06D6A0',
  clinical: false,
  vocabulary: {
    customer: 'shopper', customers: 'shoppers',
    staff: 'clerk', staffPlural: 'clerks',
    catalogNoun: 'Inventory', catalogNounSingular: 'item',
    orderNoun: 'sale', orderNounPlural: 'sales',
    checkoutVerb: 'Ring up',
  },
  capabilities: [
    { id: 'POS', importance: 'core' }, { id: 'INVENTORY', importance: 'core' },
    { id: 'TAX', importance: 'core', why: 'Grocery vs prepared food tax differs by state.' },
    { id: 'AGE_GATE', importance: 'core', why: 'Tobacco, alcohol and lottery need ID checks.' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' },
    { id: 'ONLINE_STORE', importance: 'nice' }, { id: 'KIOSK', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' },
    { id: 'MESSAGING', importance: 'nice' },
    { id: 'WEIGHED_ITEMS', importance: 'nice', why: 'Produce by the pound.' },
    { id: 'SUPPLIERS', importance: 'nice', why: 'Distributor ordering.' },
    { id: 'EBT_SNAP', importance: 'nice', why: 'Requires USDA authorization and an EBT processor.' },
  ],
  tabs: ['OVERVIEW', 'ORDERS', 'INVENTORY', 'CRM', 'MESSAGING', 'SIGNAGE', 'TEAM', 'RADIO', 'SETTINGS'],
  publicSections: ['products', 'hours', 'amenities', 'gallery'],
  defaultHours: week(['06:00', '23:00'], { friday: { open: '06:00', close: '24:00' }, saturday: { open: '07:00', close: '24:00' }, sunday: { open: '07:00', close: '22:00' } }),
  pageDefaults: { isAcceptingOrders: true, crmEnabled: true, digitalSignageEnabled: false, radioServiceEnabled: false, priceRange: '$', amenities: ['atm', 'parking'], tags: ['grocery', 'convenience'] },
  starterCatalog: {
    categories: [
      { name: 'Snacks', emoji: '🍿' }, { name: 'Dairy & Eggs', emoji: '🥛' }, { name: 'Beverages', emoji: '🥤' },
      { name: 'Pantry', emoji: '🥫' }, { name: 'Produce', emoji: '🍎' }, { name: 'Household', emoji: '🧻' },
      { name: 'Beer & Tobacco (21+)', emoji: '🪪' }, { name: 'Deli & Ready', emoji: '🥪' },
    ],
    items,
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Store Manager', 'Orders stock, sets prices, handles voids and end-of-day.'),
    { key: 'CLERK', label: 'Cashier', baseRole: 'STAFF', description: 'Rings up sales and checks ID. No price edits.' },
    { key: 'STOCKER', label: 'Stocker', baseRole: 'STAFF', description: 'Receives deliveries and adjusts counts.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 100, reward: '$2 off any purchase' }, { points: 250, reward: 'Free fountain drink or coffee' }, { points: 500, reward: '$10 off a $40 basket' }],
  },
  deals: [
    { key: 'members_5', label: 'Members save 5%', kind: 'PERCENT', value: 5, membersOnly: true, startActive: true, note: 'Keep small; c-store margins are thin.' },
    { key: 'five_off_30', label: '$3 off $30+', kind: 'AMOUNT', value: 3, minSubtotalCents: 3000, startActive: true },
    { key: 'dairy_day', label: 'Slow-day 10% off', kind: 'PERCENT', value: 10, minSubtotalCents: 2000, startActive: false, note: 'Switch on for slow weekday afternoons.' },
  ],
  signage: [
    slide('Coffee + breakfast sandwich', 'Mornings 6-10am', '#33001a'),
    slide('Members save 5%', 'Ask about Plajah rewards at the register', '#1a0033'),
    slide('ID required', 'Tobacco, vape and alcohol: 21+. Lottery: age per state law.', '#000'),
  ],
  hardware: [
    { name: 'Barcode scanner (USB or Bluetooth)', why: 'Scan items at the register; barcodes are stored on products.', required: true, approxUsd: 40 },
    { name: 'Receipt printer', why: 'Customers expect a receipt. Any ESC/POS thermal printer.', required: false, approxUsd: 120 },
    { name: 'Cash drawer', why: 'Pops on cash sales.', required: false, approxUsd: 90 },
    { name: 'Tablet or touch monitor', why: 'Runs the register and kiosk.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap, chip and swipe via Stripe.', required: true, approxUsd: 59 },
    { name: 'Label printer', why: 'Shelf and price labels.', required: false, approxUsd: 150 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Inventory',
    extra: [
      { id: 'age_rules', label: 'Confirm your state age rules', detail: 'We flagged tobacco and alcohol 21+. Lottery age and alcohol hours vary by state; confirm yours.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'tax_check', label: 'Confirm tax by category', detail: 'Grocery food, prepared food and household usually tax differently by state.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS', requires: 'TAX' },
      { id: 'ebt_connected', label: 'EBT / SNAP: connected mode', detail: 'Apply for USDA SNAP authorization and sign with an EBT processor; keep your existing EBT terminal for those tenders. SNAP-eligible items are already flagged so reports can split them.', minutes: 0, detect: 'MANUAL', requires: 'EBT_SNAP', optional: true },
    ],
  }),
  automations: [
    { id: 'low_stock_default', kind: 'LOW_STOCK', label: 'Low-stock alert', params: { defaultThreshold: 4, fastMoverThreshold: 12 } },
    { id: 'winback', kind: 'WINBACK', label: 'Win back lapsed regulars', params: { afterDays: 21 }, requires: 'REMINDERS' },
  ],
  policies: [
    { id: 'returns', label: 'Returns', text: 'Unopened non-perishables within 7 days with receipt. No returns on perishables, tobacco or alcohol.' },
    { id: 'age', label: 'Age verification', text: 'We check ID for tobacco, vape and alcohol (21+) and lottery (age per state). No ID, no sale.' },
  ],
  extras: {
    ageGateDefaults: [
      { id: 'TOBACCO', minAge: 21, note: 'Federal minimum age 21.' },
      { id: 'ALCOHOL', minAge: 21, note: 'Also check local sale hours.' },
      { id: 'LOTTERY', minAge: 18, note: 'Varies by state (18, 19 or 21). Sold on the state terminal, not in inventory.' },
    ],
    snapNote: 'Eligible: staple foods and cold prepackaged food. Not eligible: hot food, alcohol, tobacco, supplements, household items.',
  },
};

export default grocery;
