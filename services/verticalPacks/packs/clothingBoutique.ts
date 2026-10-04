/**
 * Clothing boutique. Notes:
 *  - Keystone markup (2.0x cost) is the classic boutique baseline; samples use ~2.0-2.4x.
 *  - Clothing sales tax is state-specific (e.g. NJ and PA exempt most clothing; NY exempts under $110).
 *    Items carry taxClass CLOTHING so the tax engine can apply the state rule once TAX ships.
 *  - Size x color variant matrix uses inventoryCore.buildVariantMatrix at apply time (stock per variant).
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const STD_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const cl = (key: string, name: string, category: string, price: number, cost: number, colors: string[], o: Partial<StarterItem> = {}): StarterItem => ({
  key, name, category, price, costPrice: cost, kind: 'product', description: o.description ?? name,
  sizes: STD_SIZES, colors, stock: 2, lowStockThreshold: 3, taxClass: 'CLOTHING', storeCategory: 'APPAREL', ...o,
});
const ac = (key: string, name: string, category: string, price: number, cost: number, o: Partial<StarterItem> = {}): StarterItem => ({
  key, name, category, price, costPrice: cost, kind: 'product', description: o.description ?? name,
  stock: 6, lowStockThreshold: 2, taxClass: 'STANDARD', storeCategory: 'ACCESSORIES', ...o,
});

const boutique: VerticalPack = {
  id: 'clothing_boutique',
  version: 1,
  parent: 'RETAIL',
  label: 'Clothing Boutique',
  blurb: 'Apparel and accessories with a size and color matrix, seasonal markdowns and a returns policy.',
  icon: 'Shirt',
  color: '#D40055',
  clinical: false,
  vocabulary: {
    customer: 'customer', customers: 'customers',
    staff: 'associate', staffPlural: 'associates',
    catalogNoun: 'Products', catalogNounSingular: 'style',
    orderNoun: 'order', orderNounPlural: 'orders',
    checkoutVerb: 'Check out',
  },
  capabilities: [
    { id: 'POS', importance: 'core' }, { id: 'INVENTORY', importance: 'core' }, { id: 'VARIANTS', importance: 'core' },
    { id: 'ONLINE_STORE', importance: 'core' }, { id: 'DEALS', importance: 'core' }, { id: 'LOYALTY', importance: 'nice' },
    { id: 'TAX', importance: 'nice', why: 'Clothing tax exemptions vary by state.' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'KIOSK', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' },
    { id: 'GIFT_CARDS', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'ORDERS', 'INVENTORY', 'CRM', 'MESSAGING', 'SIGNAGE', 'TEAM', 'SETTINGS'],
  publicSections: ['products', 'gallery', 'hours', 'events'],
  defaultHours: week(['11:00', '19:00'], { sunday: { open: '12:00', close: '17:00' }, saturday: { open: '10:00', close: '19:00' }, friday: { open: '11:00', close: '20:00' } }),
  pageDefaults: { isAcceptingOrders: true, crmEnabled: true, digitalSignageEnabled: false, radioServiceEnabled: false, priceRange: '$$', amenities: ['fitting_rooms', 'wifi'], tags: ['boutique', 'apparel'] },
  starterCatalog: {
    categories: [
      { name: 'Tops', emoji: '👚' }, { name: 'Bottoms', emoji: '👖' }, { name: 'Dresses', emoji: '👗' },
      { name: 'Outerwear', emoji: '🧥' }, { name: 'Accessories', emoji: '🧣' },
    ],
    items: [
      cl('tee_basic', 'Everyday Crew Tee', 'Tops', 34, 14, ['White', 'Black', 'Sage']),
      cl('blouse_linen', 'Linen Button Blouse', 'Tops', 68, 29, ['Ivory', 'Rust']),
      cl('knit_sweater', 'Chunky Knit Sweater', 'Tops', 88, 38, ['Oat', 'Charcoal']),
      cl('jeans_straight', 'High-Rise Straight Jeans', 'Bottoms', 98, 42, ['Indigo', 'Black'], { sizes: ['24', '25', '26', '27', '28', '29', '30', '31', '32'] }),
      cl('skirt_midi', 'Satin Midi Skirt', 'Bottoms', 74, 31, ['Champagne', 'Emerald']),
      cl('dress_wrap', 'Wrap Midi Dress', 'Dresses', 118, 50, ['Floral', 'Black']),
      cl('dress_slip', 'Slip Dress', 'Dresses', 96, 40, ['Olive', 'Plum']),
      cl('jacket_denim', 'Cropped Denim Jacket', 'Outerwear', 112, 48, ['Light Wash', 'Dark Wash']),
      cl('coat_wool', 'Wool-Blend Coat', 'Outerwear', 198, 82, ['Camel', 'Black']),
      ac('scarf', 'Soft Wool Scarf', 'Accessories', 42, 17, { colors: ['Camel', 'Grey'], description: 'Soft wool scarf' }),
      ac('tote', 'Canvas Tote Bag', 'Accessories', 38, 13),
      ac('belt', 'Leather Belt', 'Accessories', 54, 20),
      ac('earrings', 'Gold-Fill Hoop Earrings', 'Accessories', 32, 9),
      ac('sunglasses', 'Acetate Sunglasses', 'Accessories', 48, 16),
    ],
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Store Manager', 'Buys, prices, runs markdowns and reports.'),
    { key: 'ASSOCIATE', label: 'Sales Associate', baseRole: 'STAFF', description: 'Rings up sales, handles fitting rooms and returns up to a limit.' },
    { key: 'VISUAL', label: 'Visual Merchandiser', baseRole: 'STAFF', description: 'Updates displays, signage and the online store photos.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 200, reward: '$10 off a purchase' }, { points: 500, reward: '$30 off a purchase' }, { points: 1000, reward: 'Early access to new drops' }],
  },
  deals: [
    { key: 'welcome_10', label: 'Members save 10%', kind: 'PERCENT', value: 10, membersOnly: true, startActive: true },
    { key: 'spend_100', label: '$15 off $100+', kind: 'AMOUNT', value: 15, minSubtotalCents: 10000, startActive: true },
    { key: 'seasonal_markdown', label: 'End-of-season markdown 30% off', kind: 'PERCENT', value: 30, startActive: false, note: 'Switch on when the season turns. Start at 30%, step to 50% after 4 weeks, then clear.' },
  ],
  signage: [
    slide('New this week', 'Ask us to style it', '#33001a'),
    slide('Members save 10%', 'Scan to join on Plajah', '#1a0033'),
    slide('Free alterations on coats', 'Ask in store', '#000'),
  ],
  hardware: [
    { name: 'Tablet or phone for the register', why: 'Mobile checkout on the floor.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap and chip via Stripe.', required: true, approxUsd: 59 },
    { name: 'Barcode label printer', why: 'Tags with SKU, size and color for fast scan.', required: false, approxUsd: 150 },
    { name: 'Receipt printer', why: 'Optional, email receipts also work.', required: false, approxUsd: 120 },
    { name: 'Tagging gun + tags', why: 'Price tags for the sample styles.', required: false, approxUsd: 25 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Products',
    extra: [
      { id: 'returns_policy', label: 'Confirm your returns policy', detail: 'We drafted one (14 days, tags attached, store credit after). Adjust and publish.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS' },
    ],
  }),
  automations: [
    { id: 'low_stock_size', kind: 'LOW_STOCK', label: 'Low-stock alert per size', params: { defaultThreshold: 1, perVariant: true } },
    { id: 'winback', kind: 'WINBACK', label: 'Win back shoppers after a season', params: { afterDays: 60 }, requires: 'REMINDERS' },
  ],
  policies: [
    { id: 'returns', label: 'Returns', text: 'Returns within 14 days with tags attached and receipt, for store credit or original payment. Final sale on marked-down items and accessories worn or altered.' },
    { id: 'exchanges', label: 'Exchanges', text: 'Size exchanges are free within 30 days, subject to availability.' },
  ],
  extras: { markdownSchedule: [{ afterWeeks: 0, percent: 30 }, { afterWeeks: 4, percent: 50 }, { afterWeeks: 8, percent: 70 }], keystoneMarkup: 2.0 },
};

export default boutique;
