/**
 * Auto repair shop. Notes:
 *  - Shop labor rates run roughly $110-$180/hr in the US; default $135 (owner must set theirs). Services are
 *    priced as flat-rate "book time x rate" typical sample prices, parts shown separately via markup.
 *  - Parts markup: a common tiered matrix (cheap parts 100%+, expensive parts 30-40%). Default flat 40% shown
 *    here; the tier table is data for the future estimates feature.
 *  - Written estimate before work is legally required in many states (e.g. CA Bureau of Automotive Repair) and
 *    customer authorization is needed for work beyond the estimate; the stage pipeline models that.
 *  - Estimates, work orders, vehicle records, VIN decode + recalls (NHTSA, free), digital inspection, an AI advisor DRAFT,
 *    mileage-aware reminders (shop-default intervals, NOT OEM schedules) and the customer-owned Vehicle Passport are
 *    built as 'partial' (unit-tested, not live-verified; see services/verticalPacks/capabilities.ts for honest status).
 *    NOT built: licensed labor-time guides, OEM schedules, parts catalog/ordering, OBD intake.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';
import { AUTO_TICKET } from './ticketConfigs';

const LABOR = 135;
const svc = (key: string, name: string, category: string, price: number, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, kind: 'service', durationMin, description, taxClass: 'SERVICE', ...o });
const part = (key: string, name: string, category: string, price: number, cost: number, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, costPrice: cost, kind: 'product', description: name, stock: 6, lowStockThreshold: 2, taxClass: 'STANDARD', storeCategory: 'OTHER', ...o });

const auto: VerticalPack = {
  id: 'auto_repair',
  version: 1,
  parent: 'SERVICE',
  label: 'Auto Repair Shop',
  blurb: 'Maintenance and repair. Repair orders with VIN decode, recall alerts, photo inspections, approvals, service reminders and a customer-owned vehicle history.',
  icon: 'Wrench',
  color: '#5B8DEF',
  clinical: false,
  vocabulary: {
    customer: 'customer', customers: 'customers',
    staff: 'technician', staffPlural: 'technicians',
    catalogNoun: 'Services & parts', catalogNounSingular: 'service',
    orderNoun: 'work order', orderNounPlural: 'work orders',
    checkoutVerb: 'Write up',
  },
  capabilities: [
    { id: 'POS', importance: 'core', why: 'Take payment at pickup.' },
    { id: 'INVENTORY', importance: 'core', why: 'Parts and shop supplies.' },
    { id: 'WORK_ORDERS', importance: 'core', why: 'Estimate, approve, work, ready.' },
    { id: 'ESTIMATES', importance: 'core' }, { id: 'VEHICLE_RECORDS', importance: 'core', why: 'VIN, plate, mileage history.' },
    { id: 'VIN_DECODE', importance: 'nice', why: 'Scan the VIN, autofill the vehicle (free NHTSA data).' },
    { id: 'RECALL_CHECK', importance: 'nice', why: 'Tell customers about open safety recalls.' },
    { id: 'DVI', importance: 'nice', why: 'Photo inspections that turn into approved work.' },
    { id: 'AI_ADVISOR', importance: 'nice', why: 'Drafts customer-friendly explanations for you to edit.' },
    { id: 'SERVICE_REMINDERS', importance: 'nice', why: 'Mileage-aware service-due nudges (push / email).' },
    { id: 'VEHICLE_PASSPORT', importance: 'nice', why: 'Customer-owned, shop-verified service history.' },
    { id: 'REMINDERS', importance: 'nice', why: 'Service-due nudges (push only today).' },
    { id: 'TAX', importance: 'nice', why: 'Parts taxable, labor often not.' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' },
    { id: 'SUPPLIERS', importance: 'nice' }, { id: 'COMMERCIAL_ACCOUNTS', importance: 'nice', why: 'Fleet customers on terms.' },
    { id: 'SIGNAGE', importance: 'nice' }, { id: 'BOOKING', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'TICKETS', 'ORDERS', 'APPOINTMENTS', 'INVENTORY', 'CRM', 'MESSAGING', 'TEAM', 'SIGNAGE', 'SETTINGS'],
  publicSections: ['services', 'book', 'hours', 'gallery'],
  defaultHours: week(['08:00', '17:30'], { saturday: { open: '08:00', close: '14:00' }, sunday: 'closed' }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: false, radioServiceEnabled: false, priceRange: '$$', amenities: ['wifi', 'waiting_area', 'shuttle'], tags: ['auto', 'mechanic', 'repair'] },
  starterCatalog: {
    categories: [
      { name: 'Maintenance', emoji: '🛢️' }, { name: 'Brakes', emoji: '🛑' }, { name: 'Tires & Alignment', emoji: '🛞' },
      { name: 'Inspection & Diagnostics', emoji: '🔍' }, { name: 'A/C & Battery', emoji: '🔋' }, { name: 'Parts & Supplies', emoji: '⚙️' },
    ],
    items: [
      svc('oil_conv', 'Oil & Filter Change (conventional)', 'Maintenance', 55, 30, 'Up to 5 qt conventional oil, new filter, fluid top-off and multi-point check.'),
      svc('oil_synth', 'Oil & Filter Change (full synthetic)', 'Maintenance', 95, 40, 'Up to 5 qt full synthetic oil, new filter and multi-point check.'),
      svc('tire_rotation', 'Tire Rotation & Balance', 'Tires & Alignment', 60, 45, 'Rotate and balance four wheels, set pressures.'),
      svc('alignment', 'Four-Wheel Alignment', 'Tires & Alignment', 120, 60, 'Computerized alignment with printout.'),
      svc('tire_mount', 'Mount, Balance & Install Tire (each)', 'Tires & Alignment', 30, 20, 'Tire supplied by customer or from stock.'),
      svc('flat_repair', 'Flat Tire Repair', 'Tires & Alignment', 30, 30, 'Patch-plug repair when puncture is in repairable area.'),
      svc('brake_front', 'Front Brake Pads & Rotors', 'Brakes', 420, 120, 'Replace front pads, resurface or replace rotors, lubricate hardware. Price varies by vehicle; confirm on estimate.'),
      svc('brake_rear', 'Rear Brake Pads', 'Brakes', 260, 90, 'Replace rear pads and service hardware. Price varies by vehicle.'),
      svc('brake_fluid', 'Brake Fluid Flush', 'Brakes', 120, 45, 'Replace fluid and bleed system.'),
      svc('state_inspection', 'State Safety Inspection', 'Inspection & Diagnostics', 35, 30, 'Fee is set by your state; confirm and edit. Plajah does not file inspections.'),
      svc('diag_check_engine', 'Check Engine Diagnostic', 'Inspection & Diagnostics', 135, 60, 'Scan codes and test to find the cause. Applied to repair if approved.'),
      svc('pre_purchase', 'Pre-Purchase Inspection', 'Inspection & Diagnostics', 150, 75, 'Multi-point inspection for buyers.'),
      svc('battery_install', 'Battery Test & Install', 'A/C & Battery', 40, 20, 'Test and install; battery sold separately.'),
      svc('ac_recharge', 'A/C Evaporator Check & Recharge', 'A/C & Battery', 180, 60, 'Leak check and recharge. Refrigerant handled by a certified tech.'),
      svc('coolant_flush', 'Coolant Flush', 'Maintenance', 140, 60, 'Drain, flush and refill with correct coolant.'),
      svc('trans_service', 'Transmission Fluid Service', 'Maintenance', 210, 75, 'Drain and fill or exchange as vehicle requires.'),
      part('oil_filter', 'Oil Filter (assorted)', 'Parts & Supplies', 14, 6, { stock: 20, lowStockThreshold: 6 }),
      part('oil_synth_qt', 'Synthetic Oil, quart', 'Parts & Supplies', 9, 4.5, { stock: 40, lowStockThreshold: 12 }),
      part('wiper', 'Wiper Blade (each)', 'Parts & Supplies', 22, 9, { stock: 12 }),
      part('cabin_filter', 'Cabin Air Filter', 'Parts & Supplies', 28, 11, { stock: 10 }),
      part('engine_filter', 'Engine Air Filter', 'Parts & Supplies', 30, 12, { stock: 10 }),
      part('brake_pads_set', 'Brake Pad Set (assorted)', 'Parts & Supplies', 85, 38, { stock: 6 }),
      part('battery_group', 'Battery, Group 24F', 'Parts & Supplies', 165, 98, { stock: 3, lowStockThreshold: 1 }),
      part('shop_fee', 'Shop Supplies & Disposal Fee', 'Parts & Supplies', 5, 0, { stock: 999, lowStockThreshold: 0, description: 'Flat fee for fluids disposal and consumables. Check your state rules.' }),
    ],
  },
  roles: [
    ownerRole('Shop Owner'),
    managerRole('Service Manager', 'Writes estimates, approves discounts, owns the schedule.'),
    { key: 'SERVICE_ADVISOR', label: 'Service Advisor', baseRole: 'STAFF', description: 'Writes up vehicles, quotes and calls customers for approval.' },
    { key: 'TECH', label: 'Technician', baseRole: 'STAFF', description: 'Sees assigned jobs and clocks labor.' },
    { key: 'LUBE_TECH', label: 'Lube / Tire Tech', baseRole: 'STAFF', description: 'Maintenance and tire services.' },
    { key: 'PARTS', label: 'Parts Counter', baseRole: 'STAFF', description: 'Orders and receives parts, adjusts stock.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 150, reward: 'Free tire rotation' }, { points: 400, reward: '$25 off any repair' }, { points: 800, reward: 'Free oil change' }],
  },
  deals: [
    { key: 'oil_special', label: '$10 off $100+', kind: 'AMOUNT', value: 10, minSubtotalCents: 10000, startActive: true },
    { key: 'members_5', label: 'Members save 5% on labor and parts', kind: 'PERCENT', value: 5, membersOnly: true, startActive: true },
    { key: 'brake_season', label: 'Brake special 10% off', kind: 'PERCENT', value: 10, minSubtotalCents: 20000, startActive: false, note: 'Run before winter or summer road trips.' },
  ],
  signage: [
    slide('Oil change, 30 minutes', 'Full synthetic, filter and multi-point check', '#001a33'),
    slide('Free multi-point inspection', 'With any service', '#1a0033'),
    slide('Approved before we start', 'No surprise charges. We call you first.', '#000'),
  ],
  hardware: [
    { name: 'Tablet or desktop at the counter', why: 'Write-ups and checkout.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap, chip and swipe.', required: true, approxUsd: 59 },
    { name: 'Barcode scanner', why: 'Parts inventory.', required: false, approxUsd: 40 },
    { name: 'Receipt / invoice printer', why: 'Printed invoice at pickup.', required: false, approxUsd: 150 },
    { name: 'OBD-II scan tool', why: 'Diagnostics (not integrated).', required: false, approxUsd: 120 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Services & parts',
    testSaleLabel: 'Ring up a test service',
    extra: [
      { id: 'labor_rate', label: 'Set your shop labor rate and parts markup', detail: 'We assumed $135/hr labor and 40% parts markup. Edit service prices to match your rate.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'estimate_flow', label: 'Written estimates and approvals', detail: 'Use the Tickets tab: write the estimate, send the approval link, then work and take payment.', minutes: 0, detect: 'MANUAL', requires: 'ESTIMATES', optional: true },
    ],
  }),
  automations: [
    { id: 'svc_oil', kind: 'SERVICE_DUE', label: 'Oil change due', params: { miles: 5000, months: 6, syntheticMiles: 7500 }, requires: 'VEHICLE_RECORDS' },
    { id: 'svc_rotation', kind: 'SERVICE_DUE', label: 'Tire rotation due', params: { miles: 6000, months: 6 }, requires: 'VEHICLE_RECORDS' },
    { id: 'svc_brake', kind: 'SERVICE_DUE', label: 'Brake inspection due', params: { miles: 20000, months: 12 }, requires: 'VEHICLE_RECORDS' },
    { id: 'svc_inspection', kind: 'SERVICE_DUE', label: 'State inspection due', params: { months: 12 }, requires: 'VEHICLE_RECORDS' },
    { id: 'svc_coolant', kind: 'SERVICE_DUE', label: 'Coolant flush due', params: { miles: 30000, months: 36 }, requires: 'VEHICLE_RECORDS' },
    { id: 'stage_ready', kind: 'STAGE_NOTIFY', label: 'Text/push when car is ready', params: { stage: 'ready' }, requires: 'WORK_ORDERS' },
    { id: 'low_stock_parts', kind: 'LOW_STOCK', label: 'Low-stock on parts', params: { defaultThreshold: 2 } },
  ],
  stages: [
    { id: 'estimate', label: 'Estimate', notifyCustomer: true },
    { id: 'approved', label: 'Approved' },
    { id: 'in_progress', label: 'Work in progress' },
    { id: 'ready', label: 'Ready for pickup', notifyCustomer: true },
    { id: 'picked_up', label: 'Picked up' },
  ],
  jobFields: [
    { id: 'vin', label: 'VIN', type: 'text' },
    { id: 'plate', label: 'License plate', type: 'text' },
    { id: 'mileage_in', label: 'Mileage in', type: 'number' },
    { id: 'year_make_model', label: 'Year / make / model', type: 'text' },
    { id: 'complaint', label: 'Customer concern', type: 'text' },
    { id: 'authorized_by', label: 'Authorized by', type: 'text' },
  ],
  policies: [
    { id: 'estimate', label: 'Estimates', text: 'We give a written or recorded estimate and get your approval before work. We call before anything beyond the estimate.' },
    { id: 'warranty', label: 'Warranty', text: 'Parts and labor warranty: 12 months or 12,000 miles unless a part manufacturer states otherwise.' },
  ],
  ticket: AUTO_TICKET,
  extras: {
    laborRatePerHour: LABOR,
    partsMarkupPercent: 40,
    partsMarkupTiers: [{ maxCost: 10, percent: 100 }, { maxCost: 50, percent: 60 }, { maxCost: 200, percent: 40 }, { maxCost: 99999, percent: 30 }],
    shopSuppliesFeePercent: 5,
  },
};

export default auto;
