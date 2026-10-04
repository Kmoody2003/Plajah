/**
 * Real-estate brokerage — the original REAL_ESTATE vertical preset migrated into pack format.
 * No catalog: listings come from Terra. Tabs/defaults are read from BUSINESS_VERTICALS.REAL_ESTATE.
 */
import type { VerticalPack } from '../types';
import { BUSINESS_VERTICALS, VERTICAL_PRESETS } from '../../businessVerticals';
import { managerRole, ownerRole, slide, week } from './shared';

const V = BUSINESS_VERTICALS.REAL_ESTATE;
const preset = VERTICAL_PRESETS.REAL_ESTATE!;

const realEstate: VerticalPack = {
  id: 'real_estate_brokerage',
  version: 1,
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
    { id: 'MESSAGING', importance: 'nice' }, { id: 'BOOKING', importance: 'nice', why: 'Showings.' },
  ],
  tabs: [...V.tabs],
  publicSections: [...V.publicSections] as any,
  defaultHours: week(['09:00', '18:00'], { sunday: 'closed', saturday: { open: '10:00', close: '16:00' } }),
  pageDefaults: { ...V.defaults, crmEnabled: true, priceRange: preset.priceRange, amenities: preset.amenities, tags: ['real-estate'] },
  starterCatalog: { categories: [], items: [] },
  roles: [ownerRole('Broker'), managerRole('Managing Broker'),
    { key: 'AGENT', label: 'Agent', baseRole: 'STAFF', description: 'Own listings and leads.' }],
  loyalty: { rewardsEnabled: false, pointsPerDollar: 0, ladder: [] },
  deals: [],
  signage: [slide('Just listed', 'Ask about our newest properties', '#001a33')],
  hardware: [],
  checklist: [
    { id: 'apply_pack', label: 'Pick your business type', detail: 'Listings, compliance and leads tabs are set up.', minutes: 1, detect: 'PACK_APPLIED' },
    { id: 'confirm_address', label: 'Confirm office address and phone', detail: 'Shown on your public page.', minutes: 2, detect: 'HAS_ADDRESS', tab: 'SETTINGS' },
    { id: 'confirm_hours', label: 'Check your office hours', detail: 'Typical hours are filled in.', minutes: 1, detect: 'HAS_HOURS', tab: 'SETTINGS' },
    { id: 'go_public', label: 'Publish your page', detail: 'Turn on your public page.', minutes: 1, detect: 'PAGE_PUBLIC', tab: 'SETTINGS' },
    { id: 'add_staff', label: 'Invite an agent', detail: 'Give agents their own role.', minutes: 2, detect: 'STAFF_ADDED', tab: 'TEAM', optional: true },
  ],
  automations: [],
  extras: { presetBusinessName: preset.businessName, presetTagline: preset.tagline, presetDescription: preset.description },
};

export default realEstate;
