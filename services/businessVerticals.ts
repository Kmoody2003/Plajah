/**
 * Business verticals — one chassis, many presets.
 *
 * The business stack (page, store, kiosk, POS, signage, CRM, rewards, staff,
 * messaging, payments) is already vertical-agnostic. What differs per industry is
 * only: what you call things, which dashboard tabs are useful, what the public
 * page renders, and what a demo seeds. That is a registry, not an engine.
 *
 * `BusinessPage.businessType` is an open union (`... | string`), so adding a
 * vertical is a zero-migration change — only this file and the maps derived from
 * it need to know.
 *
 * Colours come from the Plajah brand family (orange #FF8C00, magenta #D40055,
 * purple #6B0099) so a vertical never introduces an off-brand accent.
 */

import type { BusinessMenuItem } from '../types';

export type VerticalId =
  | 'RETAIL' | 'RESTAURANT' | 'SERVICE' | 'ENTERTAINMENT'
  | 'TECH' | 'HEALTH' | 'REAL_ESTATE' | 'OTHER';

/** Dashboard tab ids. Must stay in sync with BusinessDashboard's BizTab union. */
export type VerticalTab =
  | 'OVERVIEW' | 'ORDERS' | 'INVENTORY' | 'TEAM' | 'MESSAGING' | 'CRM'
  | 'SIGNAGE' | 'SEEDRAISER' | 'RADIO' | 'SETTINGS'
  | 'LISTINGS' | 'COMPLIANCE';

export interface VerticalDefinition {
  id: VerticalId;
  label: string;
  /** Plural, for directory headings. */
  labelPlural: string;
  color: string;
  /** One line shown when picking a vertical. */
  blurb: string;
  /** Dashboard tabs, in order. Anything omitted is hidden for this vertical. */
  tabs: VerticalTab[];
  /** What the catalogue of sellable things is called here. */
  catalogNoun: string;
  /** Public-page section renderers this vertical wants. */
  publicSections: ('menu' | 'listings' | 'gallery' | 'events' | 'hours' | 'amenities')[];
  /** Capability defaults applied when a page switches to this vertical. */
  defaults?: { radioServiceEnabled?: boolean; digitalSignageEnabled?: boolean; isAcceptingOrders?: boolean };
}

const BASE_TABS: VerticalTab[] = ['OVERVIEW', 'ORDERS', 'INVENTORY', 'TEAM', 'MESSAGING', 'CRM', 'SIGNAGE', 'COMPLIANCE', 'SEEDRAISER', 'RADIO', 'SETTINGS'];

export const BUSINESS_VERTICALS: Record<VerticalId, VerticalDefinition> = {
  RETAIL: {
    id: 'RETAIL', label: 'Retail', labelPlural: 'Retail',
    color: '#FF8C00',
    blurb: 'Shops and boutiques — inventory, storefront, kiosk and register.',
    tabs: BASE_TABS,
    catalogNoun: 'Products',
    publicSections: ['gallery', 'hours', 'amenities', 'events'],
  },
  RESTAURANT: {
    id: 'RESTAURANT', label: 'Restaurant', labelPlural: 'Restaurants',
    color: '#D40055',
    blurb: 'Cafés, bars and kitchens — menu, orders, kiosk, signage and in-store radio.',
    tabs: BASE_TABS,
    catalogNoun: 'Menu',
    publicSections: ['menu', 'hours', 'amenities', 'gallery', 'events'],
    defaults: { radioServiceEnabled: true, digitalSignageEnabled: true, isAcceptingOrders: true },
  },
  SERVICE: {
    id: 'SERVICE', label: 'Service', labelPlural: 'Services',
    color: '#6B0099',
    blurb: 'Trades and professional services — bookings, clients and invoicing.',
    tabs: ['OVERVIEW', 'ORDERS', 'TEAM', 'MESSAGING', 'CRM', 'COMPLIANCE', 'SEEDRAISER', 'SETTINGS'],
    catalogNoun: 'Services',
    publicSections: ['hours', 'gallery'],
  },
  ENTERTAINMENT: {
    id: 'ENTERTAINMENT', label: 'Entertainment', labelPlural: 'Entertainment',
    color: '#00B4D8',
    blurb: 'Venues and clubs — events, tickets, signage and live sound.',
    tabs: BASE_TABS,
    catalogNoun: 'Tickets',
    publicSections: ['events', 'hours', 'gallery', 'amenities'],
    defaults: { radioServiceEnabled: true, digitalSignageEnabled: true },
  },
  TECH: {
    id: 'TECH', label: 'Tech', labelPlural: 'Tech',
    color: '#06D6A0',
    blurb: 'Studios and software shops — clients, projects and invoicing.',
    tabs: ['OVERVIEW', 'ORDERS', 'TEAM', 'MESSAGING', 'CRM', 'SEEDRAISER', 'SETTINGS'],
    catalogNoun: 'Offerings',
    publicSections: ['gallery', 'hours'],
  },
  HEALTH: {
    id: 'HEALTH', label: 'Health & Wellness', labelPlural: 'Health & Wellness',
    color: '#FFD166',
    blurb: 'Clinics, salons and studios — appointments, clients and staff.',
    tabs: ['OVERVIEW', 'ORDERS', 'TEAM', 'MESSAGING', 'CRM', 'COMPLIANCE', 'SEEDRAISER', 'SETTINGS'],
    catalogNoun: 'Services',
    publicSections: ['hours', 'amenities', 'gallery'],
  },
  REAL_ESTATE: {
    id: 'REAL_ESTATE', label: 'Real Estate', labelPlural: 'Real Estate',
    // Blueprint blue — architectural, and unclaimed by the other verticals.
    color: '#5B8DEF',
    blurb: 'Agents and brokerages — listings, showings, leads and property records.',
    // No inventory/kiosk/radio: a realtor sells property, not stock. Compliance
    // and Listings replace them, both riding the Terra parcel spine.
    tabs: ['OVERVIEW', 'LISTINGS', 'COMPLIANCE', 'TEAM', 'MESSAGING', 'CRM', 'SEEDRAISER', 'SETTINGS'],
    catalogNoun: 'Listings',
    publicSections: ['listings', 'gallery', 'hours'],
    defaults: { radioServiceEnabled: false, digitalSignageEnabled: false, isAcceptingOrders: false },
  },
  OTHER: {
    id: 'OTHER', label: 'Business', labelPlural: 'Businesses',
    color: '#ffffff40',
    blurb: 'Anything else — the full stack, nothing assumed.',
    tabs: BASE_TABS,
    catalogNoun: 'Products',
    publicSections: ['gallery', 'hours', 'amenities'],
  },
};

export const VERTICAL_IDS = Object.keys(BUSINESS_VERTICALS) as VerticalId[];

/** Never throws — an unrecognised businessType falls back to OTHER. */
export function getVertical(businessType?: string | null): VerticalDefinition {
  if (!businessType) return BUSINESS_VERTICALS.OTHER;
  return BUSINESS_VERTICALS[businessType as VerticalId] ?? BUSINESS_VERTICALS.OTHER;
}

/** Derived maps so the directory never hard-codes labels or colours again. */
export const VERTICAL_LABELS: Record<string, string> =
  Object.fromEntries(VERTICAL_IDS.map(id => [id, BUSINESS_VERTICALS[id].label]));

export const VERTICAL_COLORS: Record<string, string> =
  Object.fromEntries(VERTICAL_IDS.map(id => [id, BUSINESS_VERTICALS[id].color]));

/** Is this tab visible for this business type? */
export function verticalHasTab(businessType: string | undefined, tab: VerticalTab): boolean {
  return getVertical(businessType).tabs.includes(tab);
}

// ─── Demo presets ────────────────────────────────────────────────────────────
// Seed content per vertical. Extracted so demoBusinessSeed stops being the de
// facto registry, and so a new vertical ships with a tourable demo for free.

export interface VerticalPreset {
  businessName: string;
  tagline: string;
  description: string;
  menuItems?: BusinessMenuItem[];
  amenities?: string[];
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
}

export const VERTICAL_PRESETS: Partial<Record<VerticalId, VerticalPreset>> = {
  RESTAURANT: {
    businessName: 'Plajah Corner Café',
    tagline: 'Coffee, vinyl & good company',
    description:
      'A neighbourhood café showcasing the full Plajah in-store stack — order at the kiosk or register, '
      + 'earn loyalty, hear local artists on our in-store radio, and tip them right from your phone.',
    amenities: ['wifi', 'coffee', 'food', 'music', 'outdoor'],
    priceRange: '$$',
  },
  REAL_ESTATE: {
    businessName: 'Rosedale Property Group',
    tagline: 'Detroit, parcel by parcel',
    description:
      'An independent brokerage running on Terra — every listing carries its full public record, '
      + 'a cinematic walkthrough, and a page the seller actually owns.',
    amenities: ['wifi', 'parking'],
    priceRange: '$$',
  },
};
