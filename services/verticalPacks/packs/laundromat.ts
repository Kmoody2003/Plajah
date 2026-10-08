/**
 * Laundromat. Notes:
 *  - Two business modes that often coexist: SELF-SERVE (customer runs machines; revenue is machine coin/card
 *    which Plajah does NOT control) and WASH-AND-FOLD (drop-off, priced per pound, 24-48h turnaround, often with
 *    a per-order minimum of ~$15-20).
 *  - Typical US pricing: wash-and-fold $1.50-$2.50/lb (default $1.85), min 10 lb; comforters/bulky by the piece;
 *    dry-cleaning is usually outsourced to a plant (pass-through).
 *  - Per-pound pricing happens at the WEIGH-IN on a ticket (WEIGHED_ITEMS, partial: tickets only; tiers, minimums,
 *    add-ons and rush live in services/laundryDefaults.ts and are owner-editable on the Laundry desk). The per-lb
 *    catalog items below stay INACTIVE drafts because the REGISTER cannot sell weighed products yet
 *    (WEIGHED_REGISTER, planned); flat-priced bulky items and supplies are live.
 *  - Ticket pipeline, bag tags, wallet promo, commercial accounts and delivery are built (partial, not live-verified).
 *    Self-serve machine control/payment is a later hardware-integration phase (MACHINE_CONTROL, planned).
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';
import { LAUNDRY_TICKET } from './ticketConfigs';

const flat = (key: string, name: string, category: string, price: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, kind: 'service', description, taxClass: 'SERVICE', ...o });
const perLb = (key: string, name: string, price: number, description: string): StarterItem =>
  ({ key, name, category: 'Wash & Fold', price, kind: 'service', description, taxClass: 'SERVICE', soldBy: 'weight', unitLabel: 'lb', requires: 'WEIGHED_REGISTER' });
const sup = (key: string, name: string, price: number, cost: number, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category: 'Supplies', price, costPrice: cost, kind: 'product', description: name, stock: 24, lowStockThreshold: 8, taxClass: 'STANDARD', storeCategory: 'HOME', ...o });

const laundromat: VerticalPack = {
  id: 'laundromat',
  version: 1,
  parent: 'SERVICE',
  label: 'Laundromat',
  blurb: 'Self-serve plus wash-and-fold. Drop-off tickets, supplies, commercial accounts.',
  icon: 'WashingMachine',
  color: '#00B4D8',
  clinical: false,
  vocabulary: {
    customer: 'customer', customers: 'customers',
    staff: 'attendant', staffPlural: 'attendants',
    catalogNoun: 'Services & supplies', catalogNounSingular: 'service',
    orderNoun: 'ticket', orderNounPlural: 'tickets',
    checkoutVerb: 'Write ticket',
  },
  capabilities: [
    { id: 'POS', importance: 'core' }, { id: 'INVENTORY', importance: 'core', why: 'Vending-style supplies.' },
    { id: 'WEIGHED_ITEMS', importance: 'core', why: 'Wash-and-fold is priced per pound.' },
    { id: 'WORK_ORDERS', importance: 'core', why: 'Ticket pipeline: received to ready.' },
    { id: 'PREPAID_WALLET', importance: 'nice' }, { id: 'COMMERCIAL_ACCOUNTS', importance: 'nice', why: 'Hotels, gyms, restaurants: net-terms invoices.' },
    { id: 'BAG_TAGS', importance: 'nice', why: 'Scannable bag tags and rack tracking.' }, { id: 'WALLET_PROMO', importance: 'nice', why: 'Load $50, get $5.' },
    { id: 'DELIVERY', importance: 'nice', why: 'Pickup and delivery with a driver route list.' }, { id: 'MACHINE_CONTROL', importance: 'nice', why: 'Self-serve machine status and payment (later phase).' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'REMINDERS', importance: 'nice', why: 'Ready-for-pickup and unclaimed nudges (push, in-app and email; SMS intentionally not planned).' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' },
    { id: 'KIOSK', importance: 'nice' }, { id: 'TAX', importance: 'nice' }, { id: 'MEMBERSHIPS', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'TICKETS', 'ORDERS', 'INVENTORY', 'CRM', 'MESSAGING', 'SIGNAGE', 'TEAM', 'SETTINGS'],
  publicSections: ['services', 'hours', 'amenities', 'gallery'],
  defaultHours: week(['06:00', '22:00'], { sunday: { open: '07:00', close: '21:00' } }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: true, radioServiceEnabled: false, priceRange: '$', amenities: ['wifi', 'parking', 'folding_tables', 'change_machine', 'vending'], tags: ['laundromat', 'wash-and-fold', 'laundry'] },
  starterCatalog: {
    categories: [
      { name: 'Wash & Fold', emoji: '🧺' }, { name: 'Bulky Items', emoji: '🛏️' }, { name: 'Self-Serve', emoji: '🪙' },
      { name: 'Dry Cleaning (partner)', emoji: '👔' }, { name: 'Supplies', emoji: '🧴' },
    ],
    items: [
      perLb('wf_standard', 'Wash & Fold, per lb', 1.85, 'Sorted, washed, dried and folded. Priced at the weigh-in on the ticket (tiers and minimum are set on the Laundry desk).'),
      perLb('wf_rush', 'Same-Day Wash & Fold, per lb', 2.85, 'Dropped off by 10am, ready by 6pm.'),
      perLb('wf_delicate', 'Delicates / Hang-Dry, per lb', 2.50, 'Cold wash, line or rack dry.'),
      flat('wf_min', 'Wash & Fold Minimum Order', 'Wash & Fold', 18.5, 'Charged when a load weighs under the 10 lb minimum.'),
      flat('comforter_queen', 'Comforter, Queen/Full', 'Bulky Items', 22, 'Washed and dried. Large machine.'),
      flat('comforter_king', 'Comforter, King', 'Bulky Items', 28, 'Washed and dried. Extra-large machine.'),
      flat('sleeping_bag', 'Sleeping Bag', 'Bulky Items', 20, 'Washed and dried.'),
      flat('pillow', 'Pillow (each)', 'Bulky Items', 9, 'Washed and dried.'),
      flat('rug_small', 'Small Area Rug (under 4x6)', 'Bulky Items', 25, 'Washed and dried.'),
      flat('wash_std', 'Wash, standard machine (20 lb)', 'Self-Serve', 4.5, 'Self-serve front-load washer. Machine revenue is collected by your machines; this item is for card-at-register top-ups.', { requires: 'PREPAID_WALLET' }),
      flat('dry_10', 'Dry, 10 minutes', 'Self-Serve', 0.75, 'Self-serve dryer time.', { requires: 'PREPAID_WALLET' }),
      flat('dc_shirt', 'Dress Shirt, laundered and pressed', 'Dry Cleaning (partner)', 3.25, 'Pass-through to partner plant.'),
      flat('dc_suit', 'Suit (2-piece), dry clean', 'Dry Cleaning (partner)', 17, 'Pass-through to partner plant. 3 day turnaround.'),
      sup('detergent_single', 'Detergent, single-use box', 1.5, 0.45, { stock: 80, lowStockThreshold: 25 }),
      sup('softener_single', 'Fabric Softener, single-use', 1.25, 0.35, { stock: 60, lowStockThreshold: 20 }),
      sup('dryer_sheets', 'Dryer Sheets, 6 ct', 1.5, 0.4),
      sup('laundry_bag', 'Laundry Bag, mesh', 9, 3.2, { stock: 20, lowStockThreshold: 6 }),
      sup('stain_remover', 'Stain Remover Pen', 4.5, 1.6),
      sup('hangers', 'Hangers, 10 pack', 5, 1.6),
      sup('detergent_big', 'Detergent, 50 oz', 11.99, 6.5, { stock: 12, lowStockThreshold: 4 }),
    ],
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Store Manager', 'Sets prices, reviews machine and ticket reports.'),
    { key: 'ATTENDANT', label: 'Attendant', baseRole: 'STAFF', description: 'Writes tickets, weighs, folds, assists customers. No price edits.' },
    { key: 'FOLDER', label: 'Wash & Fold Operator', baseRole: 'STAFF', description: 'Moves tickets through washing, drying, folding.' },
    { key: 'DRIVER', label: 'Pickup & Delivery Driver', baseRole: 'STAFF', description: 'Handles pickup and delivery tickets.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 100, reward: 'Free wash & dry (one load)' }, { points: 250, reward: '$5 off any wash & fold' }, { points: 500, reward: '10 lb free wash & fold' }],
  },
  deals: [
    { key: 'wf_first', label: 'First wash & fold $5 off', kind: 'AMOUNT', value: 5, minSubtotalCents: 1500, startActive: true },
    { key: 'members_5', label: 'Members save 5%', kind: 'PERCENT', value: 5, membersOnly: true, startActive: true },
    { key: 'weekday_off', label: 'Weekday wash & fold 10% off', kind: 'PERCENT', value: 10, startActive: false, note: 'Fill quiet midweek capacity.' },
  ],
  signage: [
    slide('Drop it off. We fold it.', 'Wash & fold $1.85/lb. Ready in 24 to 48 hours.', '#001a33'),
    slide('Comforters welcome', 'Queen $22, King $28', '#1a0033'),
    slide('Last wash 30 minutes before close', 'Please remove items promptly when done', '#000'),
  ],
  hardware: [
    { name: 'Digital scale (NTEP approved for trade)', why: 'Per-pound pricing must use a legal-for-trade scale.', required: true, approxUsd: 250 },
    { name: 'Tablet at the counter', why: 'Tickets and checkout.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap, chip and swipe.', required: true, approxUsd: 59 },
    { name: 'Label / tag printer', why: 'Ticket tags for bags.', required: false, approxUsd: 150 },
    { name: 'Wall TV for signage', why: 'Prices and promos.', required: false, approxUsd: 200 },
    { name: 'Garment tagging gun / numbered tags', why: 'Match items to tickets.', required: false, approxUsd: 25 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Services & supplies',
    testSaleLabel: 'Write a test ticket',
    extra: [
      { id: 'pick_mode', label: 'Pick your modes: self-serve, wash-and-fold, or both', detail: 'Wash-and-fold is priced at the weigh-in on a ticket (Tickets tab). Self-serve machine payment and control are not part of Plajah yet; bulky items and supplies sell at the register now.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'scale_check', label: 'Confirm a legal-for-trade scale', detail: 'Required by weights-and-measures law for per-pound pricing. A USB or Bluetooth scale can feed the weigh-in; typing the weight always works.', minutes: 0, detect: 'MANUAL', requires: 'WEIGHED_ITEMS', optional: true },
      { id: 'laundry_prices', label: 'Set your wash-and-fold prices, rush rule and hours', detail: 'Tickets tab > Laundry desk > More > Settings: price tiers, minimum order, rush, turnaround, tax class.', minutes: 5, detect: 'MANUAL', tab: 'TICKETS', requires: 'WORK_ORDERS', optional: true },
      { id: 'tag_printer', label: 'Print a test bag tag', detail: 'Any label printer works through the browser print dialog; a 2.25 x 1.25 in thermal roll prints one tag per page.', minutes: 3, detect: 'MANUAL', requires: 'BAG_TAGS', optional: true },
      { id: 'machine_integration', label: 'Self-serve machine status and payment', detail: 'Planned: needs your machine controller vendor. Not available yet.', minutes: 0, detect: 'MANUAL', requires: 'MACHINE_CONTROL', optional: true },
    ],
  }),
  automations: [
    { id: 'ready_notify', kind: 'STAGE_NOTIFY', label: 'Notify customer when ticket is ready', params: { stage: 'ready' }, requires: 'WORK_ORDERS' },
    { id: 'uncollected', kind: 'REMINDER', label: 'Uncollected-ticket reminder', params: { afterDays: 3, secondAfterDays: 7 }, requires: 'REMINDERS' },
    { id: 'low_stock_supplies', kind: 'LOW_STOCK', label: 'Low-stock on supplies', params: { defaultThreshold: 8 } },
    { id: 'winback', kind: 'WINBACK', label: 'Win back lapsed wash-and-fold customers', params: { afterDays: 30 }, requires: 'REMINDERS' },
  ],
  stages: [
    { id: 'received', label: 'Received', notifyCustomer: false },
    { id: 'washing', label: 'Washing' },
    { id: 'drying', label: 'Drying' },
    { id: 'folded', label: 'Folded' },
    { id: 'ready', label: 'Ready for pickup', notifyCustomer: true },
  ],
  jobFields: [
    { id: 'weight_lb', label: 'Weight (lb)', type: 'number' },
    { id: 'bags', label: 'Bags', type: 'number' },
    { id: 'detergent', label: 'Detergent', type: 'select', options: ['Store brand', 'Free & clear', 'Customer supplied'] },
    { id: 'notes', label: 'Special care', type: 'text' },
  ],
  policies: [
    { id: 'liability', label: 'Liability', text: 'We are not responsible for items left in pockets or for dye bleeding from new items. Claims within 24 hours of pickup.' },
    { id: 'abandon', label: 'Uncollected items', text: 'Items not collected within 30 days may be donated.' },
  ],
  ticket: LAUNDRY_TICKET,
  extras: {
    modes: [
      { id: 'self_serve', label: 'Self-serve', note: 'Customers run the machines. Machine payment hardware is separate from Plajah.' },
      { id: 'wash_fold', label: 'Wash and fold', note: 'Drop-off tickets priced per pound with a minimum.' },
    ],
    pricePerLb: 1.85, minimumLb: 10, minimumCharge: 18.5,
    prepaidWallet: { suggestedTopUps: [20, 40, 100], bonusPercent: 5, status: 'partial', promo: 'Load $50, get $5 (owner enables it in Laundry desk settings; credited once per top-up)' },
    commercialAccounts: { examples: ['Hotels (linens)', 'Gyms (towels)', 'Restaurants (linens)', 'Salons (towels)'], terms: 'Net 15 or net 30, invoice-only', status: 'partial' },
    tags: { format: 'WF-217-2 (Code 128 + QR)', printing: 'browser print, thermal-label friendly; raw ZPL not built', status: 'partial' },
    delivery: { feeCents: 500, freeOverCents: 6000, routing: 'sorted list by time window; no maps or optimisation', status: 'partial' },
    machines: { status: 'planned', note: 'Machine status/payment integration needs a controller vendor (hardware phase). Nothing is controlled from Plajah today.' },
  },
};

export default laundromat;
