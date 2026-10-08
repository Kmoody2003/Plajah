/**
 * Vertical packs — the manifest that turns "I run a laundromat" into a configured business.
 *
 * Pure data + pure functions. NOTHING in this folder except applyPack.ts may import Firebase, so every
 * pack and every rule is unit-testable (tests/verticalPacks.test.ts, `npm run test:packs`).
 *
 * Honesty rule: a pack may DESCRIBE a feature the platform does not have yet (so the owner can see the
 * roadmap), but every such feature is gated through the capability registry (capabilities.ts) and the UI
 * shows "coming soon" instead of offering it. Seeding never creates live data that depends on a
 * non-ready capability: such items are seeded inactive.
 */
import type { VerticalId, VerticalTab } from '../businessVerticals';
import type { OrgRoleDef } from '../businessTemplates';

export type { OrgRoleDef, VerticalId, VerticalTab };

export type CapabilityId =
  | 'POS' | 'ONLINE_STORE' | 'INVENTORY' | 'VARIANTS' | 'BOOKING' | 'MEMBERSHIPS' | 'TICKETS'
  | 'GIFT_CARDS' | 'LOYALTY' | 'DEALS' | 'TAX' | 'AGE_GATE' | 'WEIGHED_ITEMS' | 'SUPPLIERS'
  | 'FORMS_WAIVERS' | 'REMINDERS' | 'KIOSK' | 'SIGNAGE' | 'RADIO' | 'MESSAGING' | 'STAFF_ROLES'
  | 'EBT_SNAP' | 'WORK_ORDERS' | 'ESTIMATES' | 'WALKIN_QUEUE' | 'PREPAID_WALLET' | 'VEHICLE_RECORDS'
  | 'COMMISSION_PAYROLL' | 'COMMERCIAL_ACCOUNTS' | 'RESOURCE_SCHEDULING' | 'LISTINGS'
  // Laundromat layer (2026-10-04)
  | 'WEIGHED_REGISTER' | 'BAG_TAGS' | 'WALLET_PROMO' | 'DELIVERY' | 'MACHINE_CONTROL'
  // Auto repair layer (2026-10-04)
  | 'DVI' | 'VIN_DECODE' | 'RECALL_CHECK' | 'AI_ADVISOR' | 'SERVICE_REMINDERS' | 'VEHICLE_PASSPORT';

/** ready = works end to end today; partial = usable with gaps (note says which); planned = not built. */
export type CapabilityStatus = 'ready' | 'partial' | 'planned';

export interface CapabilityInfo {
  id: CapabilityId;
  label: string;
  status: CapabilityStatus;
  /** Honest one-liner shown next to the badge. */
  note: string;
}

/** How a pack uses a capability. `core` drives the readiness badge; `nice` never lowers it. */
export interface PackCapability { id: CapabilityId; importance: 'core' | 'nice'; why?: string }

export type PackReadiness = 'ready' | 'partial' | 'early';

export interface PackVocabulary {
  customer: string; customers: string;
  staff: string; staffPlural: string;
  catalogNoun: string; catalogNounSingular: string;
  /** What one sale/job is called: 'ticket', 'appointment', 'work order', 'order'. */
  orderNoun: string; orderNounPlural: string;
  /** Verb on the main call to action: 'Check out', 'Book', 'Write ticket'. */
  checkoutVerb: string;
}

export type AgeRestriction = 'TOBACCO' | 'ALCOHOL' | 'LOTTERY' | 'VAPE' | 'ADULT';
export type TaxClass = 'STANDARD' | 'GROCERY_FOOD' | 'PREPARED_FOOD' | 'CLOTHING' | 'SERVICE' | 'EXEMPT';

export interface StarterItem {
  /** Stable within the pack. Becomes packSampleId = `${pack.id}:${key}`. NEVER change once shipped. */
  key: string;
  name: string;
  description: string;
  /** Pack category (display grouping); must exist in pack.starterCatalog.categories. */
  category: string;
  /** Dollars (matches StoreProduct.price). */
  price: number;
  costPrice?: number;
  kind: 'product' | 'service' | 'addon';
  durationMin?: number;
  /** Add-ons: keys of services this attaches to, or '*' for all. */
  addOnFor?: string[];
  stock?: number;
  lowStockThreshold?: number;
  sku?: string;
  taxClass?: TaxClass;
  snapEligible?: boolean;
  ageRestricted?: AgeRestriction;
  /** Weighed items: price is per unit of unitLabel. Needs WEIGHED_ITEMS. */
  soldBy?: 'each' | 'weight';
  unitLabel?: string;
  sizes?: string[];
  colors?: string[];
  /** Existing StoreProductCategory to file the product under (default OTHER). */
  storeCategory?: string;
  /** If set, the item is seeded INACTIVE (draft) until this capability is usable. */
  requires?: CapabilityId;
  emoji?: string;
}

export interface StarterCategory { name: string; emoji?: string }

export interface DealTemplate {
  /** Stable key -> offer id `pack_${pack.id}_${key}`. */
  key: string;
  label: string;
  kind: 'PERCENT' | 'AMOUNT';
  value: number;
  minSubtotalCents?: number;
  membersOnly?: boolean;
  /** false when it needs the owner's judgement (e.g. markdowns): seeded switched off. */
  startActive: boolean;
  note?: string;
}

export interface LoyaltyConfig {
  rewardsEnabled: boolean;
  pointsPerDollar: number;
  /** Plain-English reward ladder the owner sees (display only). */
  ladder: { points: number; reward: string }[];
}

export type DetectorId =
  | 'PACK_APPLIED' | 'HAS_ADDRESS' | 'HAS_HOURS' | 'HAS_CONTACT' | 'HAS_LOGO' | 'CATALOG_REVIEWED'
  | 'OWN_ITEM_ADDED' | 'STRIPE_CONNECTED' | 'FIRST_SALE' | 'DEAL_ACTIVE' | 'LOYALTY_ON' | 'PAGE_PUBLIC'
  | 'STAFF_ADDED' | 'CUSTOMER_ADDED' | 'SIGNAGE_SLIDE';

export interface ChecklistStep {
  id: string;
  label: string;
  detail: string;
  /** Approximate minutes, summed for the "15 minutes" promise. */
  minutes: number;
  /** Auto-detected from business data (checklist.ts) or ticked by the owner. */
  detect: DetectorId | 'MANUAL';
  /** Dashboard tab that fixes it. */
  tab?: VerticalTab;
  /** Step is shown as "coming soon" if this capability is planned. */
  requires?: CapabilityId;
  /** Optional steps never block "live". */
  optional?: boolean;
}

export interface Automation {
  id: string;
  kind: 'LOW_STOCK' | 'REBOOK_NUDGE' | 'REMINDER' | 'SERVICE_DUE' | 'STAGE_NOTIFY' | 'WINBACK';
  label: string;
  /** Numeric/text knobs: thresholds, days, hours. Pure data. */
  params: Record<string, number | string | boolean>;
  requires?: CapabilityId;
}

export interface StageDef { id: string; label: string; notifyCustomer?: boolean }
export interface SignageIdea { headline: string; subtext: string; bg: string }
export interface HardwareItem { name: string; why: string; required: boolean; approxUsd?: number }
export interface FormTemplate { id: string; label: string; fields: string[]; requires: CapabilityId; clinical: false }
export interface PackageIdea { name: string; blurb: string; price: number; requires: CapabilityId }

export type PublicSection = 'menu' | 'listings' | 'gallery' | 'events' | 'hours' | 'amenities' | 'services' | 'book' | 'products';

export type DayHours = { open: string; close: string; closed?: boolean };

export interface VerticalPack {
  /** Stable pack id, also stored on BusinessPage.subtype. Never change. */
  id: string;
  version: number;
  parent: VerticalId;
  label: string;
  blurb: string;
  /** lucide icon name; the picker maps it (unknown -> Store). */
  icon: string;
  color: string;
  /** Marks a pack that must never route to the clinical/PHI flow. */
  clinical: false;
  vocabulary: PackVocabulary;
  capabilities: PackCapability[];
  /** Dashboard tabs, in order (overrides the parent vertical's list for this business). */
  tabs: VerticalTab[];
  publicSections: PublicSection[];
  /** Keys are lowercase weekday names (BusinessPage.hours shape). */
  defaultHours: Record<string, DayHours>;
  /** Page flags to set. */
  pageDefaults: {
    isAcceptingOrders?: boolean; radioServiceEnabled?: boolean; digitalSignageEnabled?: boolean;
    crmEnabled?: boolean; priceRange?: '$' | '$$' | '$$$' | '$$$$'; amenities?: string[]; tags?: string[];
  };
  starterCatalog: { categories: StarterCategory[]; items: StarterItem[] };
  roles: OrgRoleDef[];
  loyalty: LoyaltyConfig;
  deals: DealTemplate[];
  signage: SignageIdea[];
  hardware: HardwareItem[];
  checklist: ChecklistStep[];
  automations: Automation[];
  /** Policy text the owner can paste on the public page (returns, cancellations...). */
  policies?: { id: string; label: string; text: string }[];
  /** Job pipeline for laundromat tickets / repair orders. */
  stages?: StageDef[];
  /** Extra per-job fields (vehicle VIN, plate...). Descriptive until WORK_ORDERS ships. */
  jobFields?: { id: string; label: string; type: 'text' | 'number' | 'select'; options?: string[] }[];
  forms?: FormTemplate[];
  packages?: PackageIdea[];
  /** Pack-specific facts the UI can show (labor rate, modes, commission models). */
  extras?: Record<string, any>;
  /** Generic ticket engine config (stages, subject schema, numbering, notify rules, line templates). Pure data. */
  ticket?: import('../ticketCore').TicketConfig;
}
