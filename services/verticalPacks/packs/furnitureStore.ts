/**
 * Furniture store (independent showroom). Real-world notes baked in:
 *  - Prices are typical mid-market US showroom retail (2026); furniture keystone-ish markup means cost is
 *    roughly 45-55% of retail on case goods and upholstery, ~40% on mattresses, ~35% on decor.
 *  - Most showroom pieces are floor samples + a little stock; the bulk of upholstery is SPECIAL ORDER in the
 *    customer's fabric/color with a 6-12 week vendor lead time and a 30-50% deposit. The special-order pipeline
 *    (ordered -> in transit -> received -> delivery scheduled -> delivered) is modeled as `stages`, but there is no
 *    special-order tracker on Plajah yet (SPECIAL_ORDERS planned): ring the deposit as a sale and track by hand.
 *  - Layaway is a common furniture ask; it is NOT built (LAYAWAY planned). Many states regulate layaway terms
 *    (written agreement, cancellation refunds), so the policy text tells the owner to check local rules.
 *  - Delivery & assembly are services (DELIVERY partial: fee line, address, windows, route list; no maps).
 *  - Protection plans (stain/damage) are third-party service contracts in most states; the store sells them as
 *    add-ons. Price shown is a typical retail; the administrator (e.g. Guardsman-type providers) sets terms.
 *  - FTC Mail Order Rule applies to online orders: ship when promised or offer consent-to-delay / refund.
 *  - Mattress sales must keep the federal law tag; used-bedding rules vary by state.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const prod = (key: string, name: string, category: string, price: number, cost: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, costPrice: cost, kind: 'product', description, stock: 2, lowStockThreshold: 1, taxClass: 'STANDARD', storeCategory: 'HOME', ...o });
const svc = (key: string, name: string, price: number, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category: 'Delivery & Assembly', price, kind: 'service', durationMin, description, taxClass: 'SERVICE', ...o });

const UPHOLSTERY = ['sofa_3', 'sectional', 'loveseat', 'recliner', 'accent_chair'];
const BEDROOM = ['bed_frame', 'dresser', 'nightstand'];
const MATTRESSES = ['mattress_hybrid', 'mattress_foam'];
const DINING = ['dining_table', 'dining_chair'];

const FABRICS = ['Charcoal', 'Oatmeal', 'Navy', 'Sage'];
const WOODS = ['Walnut', 'Natural Oak', 'Black'];

const items: StarterItem[] = [
  // Living Room
  prod('sofa_3', '3-Seat Sofa, 86 in', 'Living Room', 1299, 640, 'Kiln-dried hardwood frame, sinuous springs, performance fabric. Special order any fabric in 8-10 weeks.', { colors: FABRICS, stock: 1 }),
  prod('sectional', 'Modular Sectional, 3-piece', 'Living Room', 2499, 1250, 'Reversible chaise, removable cushion covers. Special order 10-12 weeks.', { colors: FABRICS, stock: 1 }),
  prod('loveseat', 'Loveseat, 64 in', 'Living Room', 999, 490, 'Matches the 3-seat sofa.', { colors: FABRICS, stock: 1 }),
  prod('recliner', 'Power Recliner', 'Living Room', 899, 440, 'Wall-hugger power recline with USB port.', { colors: ['Charcoal', 'Brown Leather'], stock: 2 }),
  prod('accent_chair', 'Accent Chair', 'Living Room', 449, 210, 'Swivel base, boucle fabric.', { colors: ['Ivory', 'Rust'], stock: 2 }),
  prod('coffee_table', 'Coffee Table, solid wood', 'Living Room', 449, 220, 'Solid acacia, lower shelf.', { colors: WOODS, stock: 1 }),
  prod('tv_stand', 'Media Console, 70 in', 'Living Room', 699, 340, 'Fits TVs up to 80 in, cable management.', { colors: WOODS, stock: 1 }),
  prod('bookcase', 'Bookcase, 5-shelf', 'Living Room', 329, 160, 'Anchors to the wall (anti-tip kit included, required by the STURDY Act).', { colors: WOODS, stock: 2 }),
  // Bedroom
  prod('bed_frame', 'Upholstered Bed Frame', 'Bedroom', 899, 430, 'Tufted headboard, slat support (no box spring needed). Price shown is Queen; set King/Full prices per variant.', { sizes: ['Full', 'Queen', 'King'], stock: 1 }),
  prod('dresser', '6-Drawer Dresser', 'Bedroom', 1099, 540, 'Dovetail drawers, full-extension glides, anti-tip kit.', { colors: WOODS, stock: 1 }),
  prod('nightstand', 'Nightstand, 2-drawer', 'Bedroom', 349, 165, 'Matches the dresser. USB charging.', { colors: WOODS, stock: 2 }),
  // Mattresses
  prod('mattress_hybrid', 'Hybrid Mattress, 13 in', 'Mattresses', 1499, 600, 'Pocketed coils + gel memory foam, medium-firm. Price shown is Queen. 100-night comfort exchange (see policy).', { sizes: ['Twin', 'Full', 'Queen', 'King', 'Cal King'], stock: 1 }),
  prod('mattress_foam', 'Memory Foam Mattress, 10 in', 'Mattresses', 799, 320, 'Medium feel, bed-in-a-box option. Price shown is Queen.', { sizes: ['Twin', 'Full', 'Queen', 'King'], stock: 1 }),
  prod('adj_base', 'Adjustable Base, Queen', 'Mattresses', 999, 450, 'Head and foot lift, zero-gravity preset, wireless remote.', { stock: 2 }),
  prod('pillow', 'Gel Memory Foam Pillow', 'Mattresses', 79, 28, 'Standard size, washable cover.', { stock: 12, lowStockThreshold: 4 }),
  // Dining
  prod('dining_table', 'Dining Table, 72 in', 'Dining', 1199, 580, 'Seats 6, solid wood top.', { colors: WOODS, stock: 1 }),
  prod('dining_chair', 'Dining Chair (each)', 'Dining', 199, 90, 'Upholstered seat. Sold individually.', { colors: ['Charcoal', 'Oatmeal'], stock: 6, lowStockThreshold: 2 }),
  prod('bar_stool', 'Counter Stool, 26 in', 'Dining', 179, 80, 'Swivel, footrest.', { colors: ['Black', 'Natural Oak'], stock: 4 }),
  // Office & Outdoor
  prod('desk', 'Writing Desk, 60 in', 'Office & Outdoor', 599, 290, 'Two drawers, cable grommet.', { colors: WOODS, stock: 1 }),
  prod('office_chair', 'Ergonomic Office Chair', 'Office & Outdoor', 399, 180, 'Adjustable lumbar and arms, BIFMA tested.', { stock: 3 }),
  prod('patio_set', 'Patio Conversation Set, 4-piece', 'Office & Outdoor', 1299, 620, 'Powder-coated aluminum, all-weather cushions.', { stock: 1 }),
  // Decor & Rugs
  prod('rug_8x10', 'Area Rug, 8x10', 'Decor & Rugs', 499, 190, 'Low pile, power-loomed. Other sizes by special order.', { colors: ['Ivory/Grey', 'Navy/Rust'], stock: 2 }),
  prod('floor_lamp', 'Floor Lamp', 'Decor & Rugs', 149, 58, 'Arc lamp, LED bulb included.', { stock: 4 }),
  prod('throw_pillow', 'Throw Pillow, 20x20', 'Decor & Rugs', 39, 13, 'Feather-down insert.', { colors: ['Rust', 'Sage', 'Ivory'], stock: 4 }),
  prod('wall_mirror', 'Wall Mirror, 30x40', 'Decor & Rugs', 229, 90, 'Metal frame, hardware included.', { stock: 3 }),
  // Delivery & Assembly (services)
  svc('white_glove', 'White-Glove Delivery', 149, 90, 'Two-person crew: delivered to your room of choice, unboxed, placed and packaging removed. Within 25 miles; add mileage beyond.', { requires: 'DELIVERY' }),
  svc('threshold', 'Threshold Delivery', 79, 30, 'Delivered to your front door or garage. Within 25 miles.', { requires: 'DELIVERY' }),
  svc('assembly', 'In-Home Assembly (per piece)', 99, 60, 'Bed frames, dining sets, desks. Wall-anchoring included for dressers and bookcases.'),
  svc('haul_away', 'Old Furniture Haul-Away (per piece)', 49, 20, 'We remove and dispose or donate one old piece. Mattress recycling fees may apply by state.'),
  // Protection plans (add-ons)
  { key: 'protect_uph', name: '5-Year Fabric & Leather Protection', category: 'Protection Plans', price: 199, costPrice: 60, kind: 'addon', addOnFor: UPHOLSTERY, description: 'Accidental stains, rips and burns. Third-party service contract; terms set by the plan administrator.', taxClass: 'SERVICE' },
  { key: 'protect_wood', name: '5-Year Wood & Case Goods Protection', category: 'Protection Plans', price: 149, costPrice: 45, kind: 'addon', addOnFor: [...BEDROOM, ...DINING, 'coffee_table', 'tv_stand', 'desk', 'bookcase'], description: 'Accidental scratches, gouges, liquid marks. Third-party service contract.', taxClass: 'SERVICE' },
  { key: 'mattress_protector', name: 'Waterproof Mattress Protector', category: 'Protection Plans', price: 89, costPrice: 30, kind: 'addon', addOnFor: MATTRESSES, description: 'Keeps the manufacturer warranty valid (stains void most mattress warranties).', taxClass: 'STANDARD' },
];

const furniture: VerticalPack = {
  id: 'furniture_store',
  version: 1,
  parent: 'RETAIL',
  label: 'Furniture Store',
  blurb: 'Showroom furniture and mattresses with fabric/finish variants, delivery and assembly, protection plans and special-order tracking stages.',
  icon: 'Sofa',
  color: '#FF8C00',
  clinical: false,
  vocabulary: {
    customer: 'customer', customers: 'customers',
    staff: 'design consultant', staffPlural: 'design consultants',
    catalogNoun: 'Showroom', catalogNounSingular: 'piece',
    orderNoun: 'sale', orderNounPlural: 'sales',
    checkoutVerb: 'Write up',
  },
  capabilities: [
    { id: 'POS', importance: 'core' }, { id: 'INVENTORY', importance: 'core' },
    { id: 'VARIANTS', importance: 'core', why: 'Fabric, finish and size options per piece.' },
    { id: 'DELIVERY', importance: 'core', why: 'Delivery windows, address and a day route list (no maps).' },
    { id: 'SPECIAL_ORDERS', importance: 'nice', why: 'Track customer fabric orders from vendor to delivery.' },
    { id: 'DEPOSITS', importance: 'nice', why: '30-50% deposit on special orders.' },
    { id: 'LAYAWAY', importance: 'nice' },
    { id: 'FINANCING', importance: 'nice', why: '0% promo financing is common in furniture; no lender integration.' },
    { id: 'CRM_PIPELINE', importance: 'nice', why: 'Follow up on design-consult leads.' },
    { id: 'TAX', importance: 'nice' }, { id: 'ONLINE_STORE', importance: 'nice' }, { id: 'BOOKING', importance: 'nice', why: 'In-home or in-store design appointments.' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'SUPPLIERS', importance: 'nice', why: 'Vendor purchase orders.' },
  ],
  tabs: ['OVERVIEW', 'ORDERS', 'INVENTORY', 'APPOINTMENTS', 'CRM', 'MESSAGING', 'SIGNAGE', 'TEAM', 'SETTINGS'],
  publicSections: ['products', 'gallery', 'book', 'hours', 'amenities'],
  defaultHours: week(['10:00', '19:00'], { saturday: { open: '10:00', close: '19:00' }, sunday: { open: '12:00', close: '17:00' } }),
  pageDefaults: { isAcceptingOrders: true, crmEnabled: true, digitalSignageEnabled: false, radioServiceEnabled: true, priceRange: '$$$', amenities: ['parking', 'delivery', 'design_help'], tags: ['furniture', 'home', 'mattress', 'showroom'] },
  starterCatalog: {
    categories: [
      { name: 'Living Room', emoji: '🛋️' }, { name: 'Bedroom', emoji: '🛏️' }, { name: 'Mattresses', emoji: '😴' },
      { name: 'Dining', emoji: '🍽️' }, { name: 'Office & Outdoor', emoji: '🪑' }, { name: 'Decor & Rugs', emoji: '🪞' },
      { name: 'Delivery & Assembly', emoji: '🚚' }, { name: 'Protection Plans', emoji: '🛡️' },
    ],
    items,
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Store Manager', 'Sets prices and promos, approves discounts, owns special orders and vendor accounts.'),
    { key: 'SALES', label: 'Design Consultant', baseRole: 'STAFF', description: 'Sells on the floor, writes up orders and special orders, books design appointments.' },
    { key: 'DELIVERY_LEAD', label: 'Delivery Lead', baseRole: 'STAFF', description: 'Schedules and runs delivery routes, assembly and haul-away.' },
    { key: 'WAREHOUSE', label: 'Warehouse / Receiving', baseRole: 'STAFF', description: 'Receives vendor shipments, inspects for damage, adjusts stock.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 500, reward: 'Free throw pillow' }, { points: 1500, reward: 'Free threshold delivery' }, { points: 3000, reward: '$100 off your next piece' }],
  },
  deals: [
    { key: 'free_delivery_1999', label: '$79 off $1,999+ (free delivery)', kind: 'AMOUNT', value: 79, minSubtotalCents: 199900, startActive: true },
    { key: 'members_5', label: 'Members save 5%', kind: 'PERCENT', value: 5, membersOnly: true, startActive: true },
    { key: 'holiday_sale', label: 'Holiday sale 15% off $1,000+', kind: 'PERCENT', value: 15, minSubtotalCents: 100000, startActive: false, note: 'Switch on for Memorial Day, July 4th, Labor Day and Black Friday events.' },
    { key: 'floor_model', label: 'Floor model clearance 25%', kind: 'PERCENT', value: 25, startActive: false, note: 'Use for as-is floor samples only; mark them as-is on the receipt.' },
  ],
  signage: [
    slide('Your fabric, your sofa', '200+ fabrics. Special order in 8-10 weeks.', '#331a00'),
    slide('White-glove delivery', 'Placed in your room, packaging gone', '#1a0033'),
    slide('Try a mattress for 100 nights', 'Comfort exchange on every hybrid', '#001a33'),
    slide('Free design consult', 'Book in store or in your home', '#33001a'),
  ],
  hardware: [
    { name: 'Tablet for the sales floor', why: 'Write up orders anywhere in the showroom.', required: true, approxUsd: 350 },
    { name: 'Card reader', why: 'Deposits and balances via Stripe.', required: true, approxUsd: 59 },
    { name: 'Receipt / invoice printer', why: 'Printed sales order with delivery date and terms.', required: false, approxUsd: 150 },
    { name: 'Barcode scanner', why: 'Receiving and tag scanning.', required: false, approxUsd: 40 },
    { name: 'Tag / label printer', why: 'Price tags and warehouse labels.', required: false, approxUsd: 150 },
    { name: 'Driver phone with mounts', why: 'Delivery route list and proof-of-delivery photos.', required: false, approxUsd: 300 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Showroom',
    testSaleLabel: 'Write up a test sale',
    extra: [
      { id: 'delivery_zone', label: 'Set your delivery zone and fees', detail: 'We assumed 25 miles, $79 threshold and $149 white-glove. Edit the delivery services to match.', minutes: 2, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'special_orders', label: 'Special-order tracking', detail: 'Ordered, in transit, received, delivery scheduled, delivered. Until it ships, ring the deposit as a sale and track the vendor order in the CRM.', minutes: 0, detect: 'MANUAL', requires: 'SPECIAL_ORDERS', optional: true },
      { id: 'protection_admin', label: 'Pick a protection-plan administrator', detail: 'Protection plans are third-party contracts; sign with a provider and match the add-on prices to theirs.', minutes: 2, detect: 'MANUAL', tab: 'INVENTORY', optional: true },
      { id: 'layaway', label: 'Layaway plans', detail: 'Not built yet. Many states regulate layaway terms; check yours before offering it.', minutes: 0, detect: 'MANUAL', requires: 'LAYAWAY', optional: true },
    ],
  }),
  automations: [
    { id: 'stage_received', kind: 'STAGE_NOTIFY', label: 'Tell the customer their order arrived', params: { stage: 'received' }, requires: 'SPECIAL_ORDERS' },
    { id: 'delivery_reminder', kind: 'REMINDER', label: 'Delivery window reminder', params: { hoursBefore: 24 }, requires: 'REMINDERS' },
    { id: 'consult_followup', kind: 'WINBACK', label: 'Follow up on design consults that did not buy', params: { afterDays: 7 }, requires: 'CRM_PIPELINE' },
    { id: 'low_stock_decor', kind: 'LOW_STOCK', label: 'Low-stock on decor and pillows', params: { defaultThreshold: 2 } },
  ],
  stages: [
    { id: 'ordered', label: 'Ordered from vendor', notifyCustomer: true },
    { id: 'in_transit', label: 'In transit' },
    { id: 'received', label: 'Received & inspected', notifyCustomer: true },
    { id: 'delivery_scheduled', label: 'Delivery scheduled', notifyCustomer: true },
    { id: 'delivered', label: 'Delivered' },
  ],
  jobFields: [
    { id: 'vendor', label: 'Vendor / manufacturer', type: 'text' },
    { id: 'vendor_po', label: 'Vendor PO #', type: 'text' },
    { id: 'fabric_finish', label: 'Fabric / finish / size', type: 'text' },
    { id: 'deposit_paid', label: 'Deposit paid ($)', type: 'number' },
    { id: 'est_arrival', label: 'Estimated arrival', type: 'text' },
    { id: 'delivery_type', label: 'Delivery type', type: 'select', options: ['Customer pickup', 'Threshold', 'White-glove'] },
  ],
  policies: [
    { id: 'returns', label: 'Returns', text: 'In-stock items may be returned within 14 days in original condition (15% restocking fee; delivery fees non-refundable). Special orders, custom fabrics, clearance and floor models are final sale.' },
    { id: 'special_orders', label: 'Special orders', text: 'Special orders need a 50% deposit and are made to your selections. Vendor lead times are estimates; we will tell you if a date slips and you may cancel for a refund of your deposit if the delay is more than 30 days past the quoted date.' },
    { id: 'delivery', label: 'Delivery', text: 'Please measure doorways, stairs and hallways. Inspect items at delivery and note any damage on the delivery receipt; we will repair or replace.' },
    { id: 'mattress', label: 'Mattress comfort exchange', text: 'Hybrid mattresses may be exchanged once within 100 nights (after a 30-night break-in) with a mattress protector; a pickup fee applies. Law tags must stay attached.' },
    { id: 'layaway', label: 'Layaway', text: 'Layaway is not offered through our online system. If we offer it in store, terms are in writing and follow state law.' },
  ],
  extras: {
    depositPercent: 50,
    typicalLeadTimeWeeks: { upholstery: '8-12', caseGoods: '6-10', mattresses: '1-2' },
    deliveryRadiusMiles: 25,
    specialOrderNote: 'Stages are descriptive until SPECIAL_ORDERS ships; the ticket engine is only on for auto repair and laundry today.',
  },
};

export default furniture;
