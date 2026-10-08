/**
 * Central capability-status registry — the ONLY place that says what the platform can really do today.
 * Update a status here (and the test expectations) when a feature ships or is rolled back. Packs, the
 * picker, the checklist and the applier all read it, so the UI can never offer a broken feature.
 *
 * Statuses reflect the repo as of 2026-10-04. Items marked (unverified) were reported by teammates
 * working concurrently and were not re-verified live by the pack author.
 */
import type { CapabilityId, CapabilityInfo, CapabilityStatus, PackReadiness, VerticalPack } from './types';

const c = (id: CapabilityId, label: string, status: CapabilityStatus, note: string): [CapabilityId, CapabilityInfo] =>
  [id, { id, label, status, note }];

export const CAPABILITIES: Record<CapabilityId, CapabilityInfo> = Object.fromEntries([
  c('POS', 'In-person register', 'ready', 'PosRegister: tickets, cash/card, auto-applied deals.'),
  c('ONLINE_STORE', 'Online store', 'ready', 'storeProducts power the storefront and Stripe checkout.'),
  c('INVENTORY', 'Inventory', 'ready', 'Stock, ledger, low-stock flags, CSV import (InventoryHub).'),
  c('VARIANTS', 'Size / color variants', 'ready', 'Variant matrix with per-variant stock.'),
  c('BOOKING', 'Appointment booking', 'partial', 'AppointmentsManager handles bookings; no per-stylist calendars or online deposits yet.'),
  c('MEMBERSHIPS', 'Memberships & packages', 'planned', 'Recurring plans and prepaid packages are not built yet.'),
  c('TICKETS', 'Event tickets', 'planned', 'Ticketed events are not built yet.'),
  c('GIFT_CARDS', 'Gift cards', 'partial', 'Sell/redeem/void gift cards at the register and online (storedValueCore + /api/stored-value/*); not yet verified live.'),
  c('LOYALTY', 'Loyalty rewards', 'ready', 'Points per dollar and members-only deals at the register.'),
  c('DEALS', 'Deals & markdowns', 'ready', 'OffersManager: percent/amount deals, best one auto-applies.'),
  c('TAX', 'Sales tax', 'partial', 'Being built by the register team (unverified); until it ships, enter tax-inclusive prices.'),
  c('AGE_GATE', 'Age checks', 'partial', 'Products can be flagged age-restricted; the register ID-check prompt is in flight (unverified).'),
  c('WEIGHED_ITEMS', 'Weigh-in on tickets', 'partial', 'Weigh-in on service tickets (WeighLineSheet + weighedCore): manual or Web Serial/Bluetooth scale, tiers, minimums, tare, add-ons. Tickets only: the register cannot sell weighed catalog products yet (see WEIGHED_REGISTER). Scale input is not verified on real hardware.'),
  c('WEIGHED_REGISTER', 'Weighed products at the register', 'planned', 'PosRegister cannot sell a catalog product by weight yet (produce by the pound, deli). Per-lb catalog items stay inactive drafts until it ships.'),
  c('SUPPLIERS', 'Suppliers & purchase orders', 'planned', 'Not built; the restock plan exists but there is no ordering.'),
  c('FORMS_WAIVERS', 'Forms & waivers', 'planned', 'Digital intake and signed waivers are not built.'),
  c('REMINDERS', 'Reminders & nudges', 'partial', 'Push and in-app are the primary channels (SMS is intentionally not planned). Works for Plajah customers; email covers guests. Not yet verified live.'),
  c('KIOSK', 'Self-order kiosk', 'ready', 'StoreKioskMode on any tablet.'),
  c('SIGNAGE', 'Digital signage', 'ready', 'Slides pushed to any screen.'),
  c('RADIO', 'In-store radio', 'ready', 'Now Playing + tips.'),
  c('MESSAGING', 'Customer messaging', 'ready', 'Opt-in broadcast (in-app push) is the primary channel; SMS is intentionally not planned.'),
  c('STAFF_ROLES', 'Staff roles', 'ready', 'Role definitions and employee roster.'),
  c('EBT_SNAP', 'EBT / SNAP tender', 'planned', 'Needs a certified EBT processor and USDA authorization; not available on Plajah payments.'),
  c('WORK_ORDERS', 'Work orders / job tickets', 'partial', 'Ticket engine (Tickets tab): stage pipeline, lines, time log, photos, pay through the register. Not yet live-verified; refunds do not reopen the ticket and cash deposits do not hit the drawer.'),
  c('ESTIMATES', 'Estimates & approvals', 'partial', 'Per-line customer approve/decline by secure link, with consent record. Push, in-app and email notices; SMS is intentionally not planned.'),
  c('WALKIN_QUEUE', 'Walk-in queue', 'planned', 'Not built.'),
  c('PREPAID_WALLET', 'Prepaid wallet', 'partial', 'Customer wallets with register reload + tender on the stored-value primitive; auto-reload and plans are planned.'),
  c('VEHICLE_RECORDS', 'Vehicle records', 'partial', 'Per-shop vehicle records keyed by VIN (or plate+state) with owner link, odometer history (rollback flag) and notes. Built and unit-tested; not yet verified live. No OBD intake, no licensed labor guides.'),
  c('DVI', 'Digital vehicle inspection', 'partial', 'Phone-first PASS/WATCH/FAIL checklist with tread/pad/battery thresholds, photos, voice notes, and a traffic-light customer report; recommendations become priced estimate lines. Not yet verified on real devices.'),
  c('VIN_DECODE', 'VIN decode (NHTSA)', 'partial', 'Server-side free NHTSA vPIC decode, cached per VIN. The live NHTSA call has not been exercised yet; falls back to manual entry. Check digit warns only.'),
  c('RECALL_CHECK', 'Open recall check', 'partial', 'Server-side free NHTSA recalls by make/model/year (24h cache). Lists campaigns that MAY apply; confirm by VIN. Recall work is dealer-performed and free; the shop only informs. Live call not yet exercised.'),
  c('AI_ADVISOR', 'AI service advisor (draft)', 'partial', 'Gemini drafts plain-English explanations and rough hour ranges for a human advisor to edit. Never sets prices. Needs the server Gemini key; falls back to standard wording. Not yet verified with a live key.'),
  c('SERVICE_REMINDERS', 'Service reminders', 'partial', 'Next-service predictions from each vehicle own mileage history using SHOP-DEFAULT intervals (not OEM schedules; licensed OEM data is a planned paid add-on). Push, in-app and email; SMS is intentionally not planned.'),
  c('VEHICLE_PASSPORT', 'Vehicle Passport (My Garage)', 'partial', 'Customer-owned, shop-verified service history with claim codes, 48-hour share codes for a new shop, and a printable history for resale. v1: no ownership transfer, no owner-added entries.'),
  c('COMMISSION_PAYROLL', 'Commission & booth rent', 'planned', 'Roster only today; no payout math.'),
  c('COMMERCIAL_ACCOUNTS', 'Commercial accounts', 'partial', 'Laundry accounts: negotiated price, standing pickups, net-terms invoices from completed tickets, aging, statements, mark paid. INVOICE-ONLY: no payment rail, payments are recorded by hand. Not yet verified live.'),
  c('RESOURCE_SCHEDULING', 'Rooms & equipment scheduling', 'planned', 'Not built.'),
  c('LISTINGS', 'Property listings', 'ready', 'Terra-backed ListingsManager.'),
  c('BAG_TAGS', 'Bag tags & rack tracking', 'partial', 'Per-bag scannable tags (Code 128 + QR), rack/shelf, missing-bag and partial-pickup flows on laundry tickets; browser/thermal-label printing. Not verified with a real label printer or scanner.'),
  c('WALLET_PROMO', 'Wallet top-up bonus', 'partial', 'Owner-set bonus (e.g. load $50 get $5) credited as an idempotent stored-value ADJUST on wallet reload. Not yet verified live.'),
  c('DELIVERY', 'Pickup & delivery', 'partial', 'Delivery fee line, address, time windows, driver and a printable day route list. No maps or route optimisation.'),
  c('MACHINE_CONTROL', 'Self-service machine control', 'planned', 'Machine status and payment/start integration with a laundry controller vendor is a later phase; nothing is controlled from Plajah today.'),
] as [CapabilityId, CapabilityInfo][]) as Record<CapabilityId, CapabilityInfo>;

export const capabilityStatus = (id: CapabilityId): CapabilityStatus => CAPABILITIES[id]?.status ?? 'planned';
/** Usable = ready or partial. Planned features are never offered. */
export const isUsable = (id: CapabilityId): boolean => capabilityStatus(id) !== 'planned';
export const isReady = (id: CapabilityId): boolean => capabilityStatus(id) === 'ready';

/**
 * Honest readiness badge for a pack.
 *  ready   — every core capability is ready.
 *  partial — every core capability is at least partial (works, with known gaps).
 *  early   — at least one core capability is planned: the pack sets up the shop, but a core workflow is roadmap.
 */
export function packReadiness(pack: Pick<VerticalPack, 'capabilities'>): PackReadiness {
  const core = pack.capabilities.filter(x => x.importance === 'core');
  if (core.some(x => capabilityStatus(x.id) === 'planned')) return 'early';
  if (core.some(x => capabilityStatus(x.id) === 'partial')) return 'partial';
  return 'ready';
}

export const READINESS_LABEL: Record<PackReadiness, string> = {
  ready: 'Ready to run',
  partial: 'Works today · some gaps',
  early: 'Early access',
};

export interface CapabilityBreakdown { ready: CapabilityInfo[]; partial: CapabilityInfo[]; planned: CapabilityInfo[] }

export function capabilityBreakdown(pack: Pick<VerticalPack, 'capabilities'>): CapabilityBreakdown {
  const out: CapabilityBreakdown = { ready: [], partial: [], planned: [] };
  for (const x of pack.capabilities) {
    const info = CAPABILITIES[x.id];
    if (info) out[info.status].push(info);
  }
  return out;
}
