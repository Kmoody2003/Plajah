/**
 * Real-estate brokerage — the original REAL_ESTATE vertical preset migrated into pack format, enriched 2026-10-20.
 * Listings come from Terra (no product catalog). Tabs/defaults are read from BUSINESS_VERTICALS.REAL_ESTATE.
 * Real-world notes baked in:
 *  - Agents are paid by commission at closing, so consults, CMAs and staging advice are seeded as $0 services
 *    (bookable, never charged at the register). Brokerages that charge flat fees can set a price.
 *  - NAR settlement practice changes (effective Aug 17, 2024): MLS participants need a WRITTEN agreement with a
 *    buyer before touring a home; buyer-broker compensation must be specific and objectively ascertainable (no
 *    open-ended "whatever the seller pays"), negotiable, and cannot be offered through the MLS. The checklist and
 *    policy text say so; Plajah does not draft or e-sign agreements (FORMS_WAIVERS planned).
 *  - Fair Housing Act: no steering, no discriminatory ads; the policy text is the HUD-style equal-opportunity line.
 *    Many states add protected classes (source of income, sexual orientation, etc.).
 *  - State license required for every agent; the broker supervises. License numbers appear in ads in most states.
 *  - Buyer rebates / closing credits are prohibited or restricted in some states and must be disclosed to the
 *    lender, so every credit deal is seeded switched off.
 *  - Wire fraud is the top closing scam; the policy warns buyers to verify wiring instructions by phone.
 */
import type { VerticalPack, StarterItem } from '../types';
import { BUSINESS_VERTICALS, VERTICAL_PRESETS } from '../../businessVerticals';
import { managerRole, ownerRole, slide, week } from './shared';

const V = BUSINESS_VERTICALS.REAL_ESTATE;
const preset = VERTICAL_PRESETS.REAL_ESTATE!;

const svc = (key: string, name: string, category: string, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price: 0, kind: 'service', durationMin, description, taxClass: 'SERVICE', storeCategory: 'OTHER', ...o });

const realEstate: VerticalPack = {
  id: 'real_estate_brokerage',
  version: 2,
  parent: 'REAL_ESTATE',
  label: 'Real Estate Brokerage',
  blurb: V.blurb,
  icon: 'Building2',
  color: V.color,
  clinical: false,
  vocabulary: {
    customer: 'client', customers: 'clients', staff: 'agent', staffPlural: 'agents',
    catalogNoun: V.catalogNoun, catalogNounSingular: 'listing', orderNoun: 'showing', orderNounPlural: 'showings', checkoutVerb: 'Schedule',
  },
  capabilities: [
    { id: 'LISTINGS', importance: 'core' }, { id: 'STAFF_ROLES', importance: 'core' },
    { id: 'CRM_PIPELINE', importance: 'nice', why: 'Lead to closed, per client.' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'BOOKING', importance: 'nice', why: 'Consults and showings.' },
    { id: 'REMINDERS', importance: 'nice', why: 'Showing reminders and contract deadlines.' },
    { id: 'FORMS_WAIVERS', importance: 'nice', why: 'Buyer agreements and disclosures with e-signature.' },
    { id: 'COMMISSION_PAYROLL', importance: 'nice', why: 'Agent commission splits.' },
    { id: 'SIGNAGE', importance: 'nice', why: 'Window displays of listings.' },
  ],
  tabs: [...V.tabs],
  publicSections: [...V.publicSections] as any,
  defaultHours: week(['09:00', '18:00'], { sunday: 'closed', saturday: { open: '10:00', close: '16:00' } }),
  pageDefaults: { ...V.defaults, crmEnabled: true, priceRange: preset.priceRange, amenities: preset.amenities, tags: ['real-estate'] },
  starterCatalog: {
    categories: [{ name: 'Seller Services', emoji: '🏡' }, { name: 'Buyer Services', emoji: '🔑' }],
    items: [
      svc('listing_consult', 'Listing Consultation', 'Seller Services', 60, 'Walk the home, review pricing strategy, marketing plan and timeline. No charge; commission is agreed in the listing agreement.'),
      svc('cma', 'Comparative Market Analysis (CMA)', 'Seller Services', 45, 'A written estimate of market value from recent comparable sales. Free, no obligation. Not an appraisal.'),
      svc('staging_consult', 'Staging Consultation', 'Seller Services', 60, 'Room-by-room advice to prepare for photos and showings. Complimentary for listing clients.'),
      svc('open_house', 'Open House', 'Seller Services', 120, 'Hosted open house with sign-in and follow-up.'),
      svc('buyer_consult', 'Buyer Consultation', 'Buyer Services', 60, 'Goals, budget, neighborhoods and the buying process. We review the written buyer agreement required before touring.'),
      svc('showing', 'Private Showing', 'Buyer Services', 30, 'Tour a home with your agent. A signed buyer agreement is required first.', { requires: 'BOOKING' }),
      svc('relocation', 'Relocation Consultation', 'Buyer Services', 45, 'Moving from out of town: neighborhoods, schools, commute and a virtual tour plan.'),
    ],
  },
  roles: [ownerRole('Broker'), managerRole('Managing Broker', 'Supervises agents, reviews contracts and compliance files.'),
    { key: 'AGENT', label: 'Agent', baseRole: 'STAFF', description: 'Own listings and leads.' },
    { key: 'TC', label: 'Transaction Coordinator', baseRole: 'STAFF', description: 'Tracks contract deadlines, documents and closing.' },
    { key: 'SHOWING_ASSISTANT', label: 'Showing Assistant', baseRole: 'STAFF', description: 'Licensed assistant who shows homes and hosts open houses.' }],
  loyalty: { rewardsEnabled: false, pointsPerDollar: 0, ladder: [] },
  deals: [
    { key: 'past_client_credit', label: 'Past-client closing credit $500', kind: 'AMOUNT', value: 500, startActive: false, note: 'Credits must be disclosed to the lender and on the closing statement; rebates are restricted in some states.' },
    { key: 'hero_credit', label: 'Military & first responder credit $750', kind: 'AMOUNT', value: 750, startActive: false, note: 'Check your state rebate rules and the buyer\'s loan program before offering.' },
    { key: 'referral_credit', label: 'Referral thank-you $250', kind: 'AMOUNT', value: 250, startActive: false, note: 'Most states prohibit paying referral fees to unlicensed people; use a gift or charity donation where required.' },
  ],
  signage: [
    slide('Just listed', 'Ask about our newest properties', '#001a33'),
    slide('What is your home worth?', 'Free market analysis, no obligation', '#1a0033'),
    slide('Open house this Sunday', '1-3pm. Walk in, no appointment needed.', '#33001a'),
  ],
  hardware: [
    { name: 'Laptop or tablet', why: 'CRM, listings and showings on the go.', required: true, approxUsd: 600 },
    { name: 'Electronic lockbox access', why: 'Usually through your MLS (key service subscription).', required: false },
    { name: 'Window display / TV', why: 'Listing slideshow in the office window.', required: false, approxUsd: 300 },
    { name: 'Yard signs and riders', why: 'For every listing.', required: false, approxUsd: 150 },
  ],
  checklist: [
    { id: 'apply_pack', label: 'Pick your business type', detail: 'Listings, compliance and leads tabs are set up.', minutes: 1, detect: 'PACK_APPLIED' },
    { id: 'confirm_address', label: 'Confirm office address and phone', detail: 'Shown on your public page.', minutes: 2, detect: 'HAS_ADDRESS', tab: 'SETTINGS' },
    { id: 'confirm_hours', label: 'Check your office hours', detail: 'Typical hours are filled in.', minutes: 1, detect: 'HAS_HOURS', tab: 'SETTINGS' },
    { id: 'broker_license', label: 'Add your brokerage license number', detail: 'Most states require it in advertising. Plajah does not verify licenses.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS' },
    { id: 'fair_housing', label: 'Post the fair housing statement', detail: 'We added an equal-opportunity policy. Add any extra protected classes your state or city lists.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS' },
    { id: 'buyer_agreement', label: 'Ready your written buyer agreement', detail: 'Required before touring a home (NAR practice change, Aug 2024). Compensation must be a specific amount or rate. Use your state association form.', minutes: 1, detect: 'MANUAL' },
    { id: 'go_public', label: 'Publish your page', detail: 'Turn on your public page.', minutes: 1, detect: 'PAGE_PUBLIC', tab: 'SETTINGS' },
    { id: 'first_listing', label: 'Add your first listing', detail: 'Pull it from Terra; the public record comes with it.', minutes: 3, detect: 'MANUAL', tab: 'LISTINGS', optional: true },
    { id: 'review_services', label: 'Review your consult services', detail: 'Free consults and CMAs are seeded at $0 (commission-based). Set a price only if you charge flat fees.', minutes: 2, detect: 'CATALOG_REVIEWED', optional: true },
    { id: 'esign', label: 'E-signed agreements', detail: 'Buyer agreements and disclosures with e-signature are not built yet; keep using your forms provider.', minutes: 0, detect: 'MANUAL', requires: 'FORMS_WAIVERS', optional: true },
    { id: 'add_staff', label: 'Invite an agent', detail: 'Give agents their own role.', minutes: 2, detect: 'STAFF_ADDED', tab: 'TEAM', optional: true },
  ],
  automations: [
    { id: 'lead_reply', kind: 'STAGE_NOTIFY', label: 'Reply to new leads within 5 minutes', params: { stage: 'lead', minutes: 5 }, requires: 'CRM_PIPELINE' },
    { id: 'showing_reminder', kind: 'REMINDER', label: 'Showing reminder', params: { hoursBefore: 2 }, requires: 'REMINDERS' },
    { id: 'contract_deadlines', kind: 'REMINDER', label: 'Inspection, appraisal and financing deadlines', params: { daysBefore: 2 }, requires: 'REMINDERS' },
    { id: 'stale_lead', kind: 'WINBACK', label: 'Re-engage leads quiet for 30 days', params: { afterDays: 30 }, requires: 'CRM_PIPELINE' },
    { id: 'home_anniversary', kind: 'WINBACK', label: 'Home anniversary + free CMA', params: { afterDays: 365 }, requires: 'REMINDERS' },
  ],
  stages: [
    { id: 'lead', label: 'Lead' },
    { id: 'appointment', label: 'Consult booked', notifyCustomer: true },
    { id: 'showing', label: 'Showing homes' },
    { id: 'offer', label: 'Offer submitted', notifyCustomer: true },
    { id: 'under_contract', label: 'Under contract', notifyCustomer: true },
    { id: 'closed', label: 'Closed', notifyCustomer: true },
  ],
  jobFields: [
    { id: 'side', label: 'Client side', type: 'select', options: ['Buying', 'Selling', 'Both', 'Renting'] },
    { id: 'budget', label: 'Budget / list price ($)', type: 'number' },
    { id: 'beds', label: 'Bedrooms', type: 'number' },
    { id: 'area', label: 'Area / neighborhoods', type: 'text' },
    { id: 'pre_approved', label: 'Pre-approved', type: 'select', options: ['Yes', 'No', 'In progress', 'Cash buyer'] },
    { id: 'buyer_agreement', label: 'Buyer agreement signed', type: 'select', options: ['Yes', 'No', 'Not needed (seller)'] },
    { id: 'timeline', label: 'Timeline', type: 'select', options: ['0-3 months', '3-6 months', '6-12 months', '12+ months'] },
  ],
  policies: [
    { id: 'fair_housing', label: 'Fair housing', text: 'We are pledged to the letter and spirit of U.S. policy for equal housing opportunity. We do not discriminate on race, color, religion, sex (including sexual orientation and gender identity), handicap, familial status or national origin, or any class protected by state or local law.' },
    { id: 'buyer_agreement', label: 'Buyer agreements', text: 'Before we tour homes together we sign a written buyer agreement. It states exactly how much we are paid (a specific amount or rate, never open-ended), and that compensation is negotiable and not set by law.' },
    { id: 'agency', label: 'Agency disclosure', text: 'We will explain who we represent in writing before you share confidential information. Dual agency, where allowed, needs both parties\' written consent.' },
    { id: 'wire_fraud', label: 'Wire fraud warning', text: 'We will never email you wiring instructions or changes. Always call your title or escrow company at a known number before wiring money.' },
  ],
  extras: {
    presetBusinessName: preset.businessName, presetTagline: preset.tagline, presetDescription: preset.description,
    narSettlementEffective: '2024-08-17',
    commissionModels: [
      { id: 'percent', label: 'Percent of sale price', note: 'Negotiable; set in the listing or buyer agreement.' },
      { id: 'flat', label: 'Flat fee', note: 'Set a price on the consult services if you charge up front.' },
    ],
  },
};

export default realEstate;
