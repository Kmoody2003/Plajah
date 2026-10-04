/**
 * Restaurant / cafe — the original RESTAURANT vertical preset migrated into pack format.
 * Name/tagline/description come from VERTICAL_PRESETS.RESTAURANT so the demo and the pack stay in sync;
 * tabs and parent defaults come from BUSINESS_VERTICALS.RESTAURANT so nothing is duplicated.
 */
import type { VerticalPack, StarterItem } from '../types';
import { BUSINESS_VERTICALS, VERTICAL_PRESETS } from '../../businessVerticals';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const m = (key: string, name: string, category: string, price: number, cost: number, description: string): StarterItem =>
  ({ key, name, category, price, costPrice: cost, kind: 'product', description, stock: 999, lowStockThreshold: 0, taxClass: 'PREPARED_FOOD', trackInventory: false } as StarterItem);

const V = BUSINESS_VERTICALS.RESTAURANT;
const preset = VERTICAL_PRESETS.RESTAURANT!;

const restaurant: VerticalPack = {
  id: 'restaurant_cafe',
  version: 1,
  parent: 'RESTAURANT',
  label: 'Restaurant / Cafe',
  blurb: V.blurb,
  icon: 'UtensilsCrossed',
  color: V.color,
  clinical: false,
  vocabulary: {
    customer: 'guest', customers: 'guests', staff: 'team member', staffPlural: 'team members',
    catalogNoun: V.catalogNoun, catalogNounSingular: 'menu item', orderNoun: 'order', orderNounPlural: 'orders', checkoutVerb: 'Charge',
  },
  capabilities: [
    { id: 'POS', importance: 'core' }, { id: 'KIOSK', importance: 'core' }, { id: 'ONLINE_STORE', importance: 'core' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' },
    { id: 'RADIO', importance: 'nice' }, { id: 'MESSAGING', importance: 'nice' }, { id: 'TAX', importance: 'nice' },
    { id: 'INVENTORY', importance: 'nice' },
  ],
  tabs: [...V.tabs],
  publicSections: ['menu', 'hours', 'amenities', 'gallery', 'events'],
  defaultHours: week(['07:00', '19:00'], { friday: { open: '07:00', close: '21:00' }, saturday: { open: '08:00', close: '21:00' }, sunday: { open: '08:00', close: '17:00' } }),
  pageDefaults: { ...V.defaults, crmEnabled: true, priceRange: preset.priceRange, amenities: preset.amenities, tags: ['restaurant', 'cafe'] },
  starterCatalog: {
    categories: [{ name: 'Coffee', emoji: '☕' }, { name: 'Tea', emoji: '🍵' }, { name: 'Kitchen', emoji: '🥪' }, { name: 'Bakery', emoji: '🥐' }],
    items: [
      m('drip', 'House Drip', 'Coffee', 3.5, 0.45, 'Small-batch medium roast'),
      m('latte', 'Oat Latte', 'Coffee', 5.25, 1.1, 'House oat milk, double shot'),
      m('cold_brew', 'Cold Brew', 'Coffee', 4.75, 0.8, '16 oz, 20-hour steep'),
      m('matcha', 'Matcha Latte', 'Tea', 5.5, 1.3, 'Ceremonial grade, oat or whole'),
      m('toast', 'Avocado Toast', 'Kitchen', 9, 3.1, 'Sourdough, chili, lime'),
      m('burrito', 'Breakfast Burrito', 'Kitchen', 10.5, 3.4, 'Egg, potato, cheddar, salsa verde'),
      m('croissant', 'Almond Croissant', 'Bakery', 4.25, 1.2, 'Baked in-house daily'),
    ],
  },
  roles: [ownerRole('Owner'), managerRole('General Manager'),
    { key: 'BARISTA', label: 'Barista / Server', baseRole: 'STAFF', description: 'Takes orders and rings up sales.' },
    { key: 'COOK', label: 'Cook', baseRole: 'STAFF', description: 'Sees the kitchen queue.' }],
  loyalty: { rewardsEnabled: true, pointsPerDollar: 1, ladder: [{ points: 100, reward: 'Free drip coffee' }, { points: 250, reward: 'Free pastry' }] },
  deals: [
    { key: 'members_10', label: 'Members save 10%', kind: 'PERCENT', value: 10, membersOnly: true, startActive: true },
    { key: 'five_off_40', label: '$5 off $40+', kind: 'AMOUNT', value: 5, minSubtotalCents: 4000, startActive: true },
  ],
  signage: [slide('Members save 10%', 'Check in on Plajah to earn points', '#1a0033'), slide('Live music Fridays', 'Local artists 6 to 9pm', '#001a33')],
  hardware: [
    { name: 'Tablet register', why: 'Counter ordering.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap and chip.', required: true, approxUsd: 59 },
    { name: 'Kitchen display or printer', why: 'Order tickets for the line.', required: false, approxUsd: 180 },
  ],
  checklist: goLiveSteps({ catalogNoun: 'Menu' }),
  automations: [{ id: 'winback', kind: 'WINBACK', label: 'Win back regulars', params: { afterDays: 21 }, requires: 'REMINDERS' }],
  extras: { presetBusinessName: preset.businessName, presetTagline: preset.tagline, presetDescription: preset.description },
};

export default restaurant;
