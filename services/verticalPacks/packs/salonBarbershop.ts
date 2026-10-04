/**
 * Salon / barbershop. Notes:
 *  - Haircut rebook cycle is 4-6 weeks (barbers 2-4); color touch-ups 6-8 weeks. Nudge defaults follow that.
 *  - Staff pay models in the wild: commission (40-60% of service, lower on retail), booth rent (chair rental,
 *    stylist is an independent contractor and keeps their own revenue), or hourly+tips. Payout math is a PLANNED
 *    capability; packs only record which model the owner chose.
 *  - This is a personal-care business, NOT clinical: parent is SERVICE and nothing routes to the HEALTH/PHI flow.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const svc = (key: string, name: string, category: string, price: number, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, kind: 'service', durationMin, description, taxClass: 'SERVICE', ...o });
const add = (key: string, name: string, price: number, durationMin: number, forKeys: string[] | '*' = '*', description = name): StarterItem =>
  ({ key, name, category: 'Add-ons', price, kind: 'addon', durationMin, description, addOnFor: forKeys === '*' ? ['*'] : forKeys, taxClass: 'SERVICE' });
const retail = (key: string, name: string, price: number, cost: number): StarterItem =>
  ({ key, name, category: 'Retail', price, costPrice: cost, kind: 'product', description: name, stock: 8, lowStockThreshold: 3, taxClass: 'STANDARD', storeCategory: 'ACCESSORIES' });

const salon: VerticalPack = {
  id: 'salon_barbershop',
  version: 1,
  parent: 'SERVICE',
  label: 'Salon / Barbershop',
  blurb: 'Hair, nails and barbering. Service menu with durations, stylists, retail and rebook nudges.',
  icon: 'Scissors',
  color: '#FF8C00',
  clinical: false,
  vocabulary: {
    customer: 'client', customers: 'clients',
    staff: 'stylist', staffPlural: 'stylists',
    catalogNoun: 'Service menu', catalogNounSingular: 'service',
    orderNoun: 'appointment', orderNounPlural: 'appointments',
    checkoutVerb: 'Check out',
  },
  capabilities: [
    { id: 'BOOKING', importance: 'core', why: 'Appointments are the business.' },
    { id: 'POS', importance: 'core' }, { id: 'STAFF_ROLES', importance: 'core' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' }, { id: 'MESSAGING', importance: 'nice' },
    { id: 'REMINDERS', importance: 'nice', why: 'No-show reminders (push only today).' },
    { id: 'INVENTORY', importance: 'nice', why: 'Retail products.' }, { id: 'SIGNAGE', importance: 'nice' }, { id: 'RADIO', importance: 'nice' },
    { id: 'WALKIN_QUEUE', importance: 'nice' }, { id: 'COMMISSION_PAYROLL', importance: 'nice' },
    { id: 'MEMBERSHIPS', importance: 'nice' }, { id: 'GIFT_CARDS', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'APPOINTMENTS', 'ORDERS', 'INVENTORY', 'TEAM', 'CRM', 'MESSAGING', 'SIGNAGE', 'RADIO', 'SETTINGS'],
  publicSections: ['services', 'book', 'gallery', 'hours', 'amenities'],
  defaultHours: week(['09:00', '19:00'], { sunday: 'closed', monday: 'closed', saturday: { open: '08:00', close: '17:00' }, thursday: { open: '09:00', close: '20:00' } }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: true, radioServiceEnabled: true, priceRange: '$$', amenities: ['wifi', 'music', 'coffee'], tags: ['salon', 'barber', 'hair'] },
  starterCatalog: {
    categories: [
      { name: 'Haircuts', emoji: '✂️' }, { name: 'Color', emoji: '🎨' }, { name: 'Styling', emoji: '💇' },
      { name: 'Barber', emoji: '🪒' }, { name: 'Nails', emoji: '💅' }, { name: 'Add-ons', emoji: '➕' }, { name: 'Retail', emoji: '🧴' },
    ],
    items: [
      svc('womens_cut', "Women's Cut & Style", 'Haircuts', 65, 60, 'Consultation, shampoo, cut and blow-dry.'),
      svc('mens_cut', "Men's Haircut", 'Haircuts', 35, 30, 'Consultation, cut and style.'),
      svc('kids_cut', 'Kids Cut (12 & under)', 'Haircuts', 25, 30, 'Gentle, quick cut for kids.'),
      svc('trim', 'Bang / Neckline Trim', 'Haircuts', 15, 15, 'Quick tidy between cuts.'),
      svc('barber_cut', 'Barber Cut', 'Barber', 32, 30, 'Clipper or scissor cut, line-up included.'),
      svc('fade', 'Skin Fade', 'Barber', 38, 40, 'Tapered or skin fade with detailed blending.'),
      svc('beard', 'Beard Trim & Shape', 'Barber', 20, 20, 'Trim, shape and hot-towel finish.'),
      svc('hot_shave', 'Hot Towel Shave', 'Barber', 35, 30, 'Straight-razor shave with hot towels.'),
      svc('root_color', 'Root Touch-Up', 'Color', 85, 90, 'Single-process color on regrowth.'),
      svc('full_color', 'All-Over Color', 'Color', 110, 120, 'Single-process color, shampoo and style.'),
      svc('highlights', 'Partial Highlights', 'Color', 145, 150, 'Foils on crown and part line, toner and style.'),
      svc('balayage', 'Balayage', 'Color', 220, 180, 'Hand-painted lightening with toner and style.'),
      svc('blowout', 'Blowout', 'Styling', 45, 45, 'Shampoo and blow-dry style.'),
      svc('updo', 'Special-Occasion Updo', 'Styling', 90, 60, 'Formal styling for events.'),
      svc('manicure', 'Classic Manicure', 'Nails', 28, 30, 'Shape, cuticle care and polish.'),
      svc('gel_mani', 'Gel Manicure', 'Nails', 45, 45, 'Long-wear gel polish.'),
      svc('pedicure', 'Classic Pedicure', 'Nails', 40, 45, 'Soak, scrub, shape and polish.'),
      add('deep_condition', 'Deep Conditioning Treatment', 25, 15, ['womens_cut', 'full_color', 'highlights', 'balayage', 'blowout']),
      add('scalp_massage', 'Scalp Massage', 15, 10),
      add('toner_gloss', 'Gloss / Toner', 35, 15, ['root_color', 'full_color', 'highlights', 'balayage']),
      add('eyebrow_wax', 'Eyebrow Shape', 18, 15),
      add('nail_art', 'Nail Art (per hand)', 15, 15, ['manicure', 'gel_mani']),
      retail('shampoo', 'Professional Shampoo, 8.5 oz', 26, 12),
      retail('conditioner', 'Professional Conditioner, 8.5 oz', 28, 13),
      retail('styling_cream', 'Styling Cream', 24, 10),
      retail('beard_oil', 'Beard Oil, 1 oz', 18, 6),
      retail('pomade', 'Matte Pomade, 3 oz', 20, 7),
    ],
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Salon Manager', 'Schedules, handles pricing, reviews commission reports.'),
    { key: 'STYLIST', label: 'Stylist', baseRole: 'STAFF', description: 'Own calendar, own clients, rings up services and retail.' },
    { key: 'BARBER', label: 'Barber', baseRole: 'STAFF', description: 'Own calendar and walk-ins.' },
    { key: 'NAIL_TECH', label: 'Nail Technician', baseRole: 'STAFF', description: 'Own calendar for nail services.' },
    { key: 'BOOTH_RENTER', label: 'Booth Renter', baseRole: 'MEMBER', description: 'Independent chair renter: own prices and clients inside your shop.' },
    { key: 'FRONT_DESK', label: 'Front Desk', baseRole: 'STAFF', description: 'Books, checks in and checks out. No price edits.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 150, reward: '$10 off any service' }, { points: 300, reward: 'Free deep conditioning add-on' }, { points: 600, reward: '$40 off color service' }],
  },
  deals: [
    { key: 'first_visit', label: 'New-client 15% off', kind: 'PERCENT', value: 15, startActive: false, note: 'Switch on while you build your book.' },
    { key: 'members_5', label: 'Members save 5%', kind: 'PERCENT', value: 5, membersOnly: true, startActive: true },
    { key: 'refer', label: '$10 off $60+', kind: 'AMOUNT', value: 10, minSubtotalCents: 6000, startActive: true },
  ],
  signage: [
    slide('Book your next visit today', 'Rebook before you leave and keep your favorite time', '#33001a'),
    slide('Gloss + toner add-on', 'Shine that lasts until your next color', '#1a0033'),
    slide('Walk-ins welcome', 'Barber chairs open until close', '#000'),
  ],
  hardware: [
    { name: 'Tablet at the front desk', why: 'Check-in, bookings and checkout.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap, chip and tip entry.', required: true, approxUsd: 59 },
    { name: 'Receipt printer', why: 'Optional, email receipts work.', required: false, approxUsd: 120 },
    { name: 'Wall TV for signage', why: 'Menu and promo loop for the waiting area.', required: false, approxUsd: 200 },
    { name: 'Bluetooth speaker', why: 'In-store radio.', required: false, approxUsd: 80 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Service menu',
    testSaleLabel: 'Check out a test appointment',
    extra: [
      { id: 'pay_model', label: 'Choose how stylists are paid', detail: 'Commission, booth rent or hourly. We record it on the roster; payout math is coming.', minutes: 1, detect: 'MANUAL', tab: 'TEAM' },
      { id: 'first_stylist', label: 'Add your first stylist', detail: 'Give each stylist a role so they only see what they need.', minutes: 1, detect: 'STAFF_ADDED', tab: 'TEAM' },
    ],
  }),
  automations: [
    { id: 'rebook_cut', kind: 'REBOOK_NUDGE', label: 'Rebook nudge after a cut', params: { afterWeeks: 5, minWeeks: 4, maxWeeks: 6, categories: 'Haircuts,Barber' }, requires: 'REMINDERS' },
    { id: 'rebook_color', kind: 'REBOOK_NUDGE', label: 'Color touch-up nudge', params: { afterWeeks: 7, minWeeks: 6, maxWeeks: 8, categories: 'Color' }, requires: 'REMINDERS' },
    { id: 'reminder_24h', kind: 'REMINDER', label: 'Appointment reminder', params: { hoursBefore: 24, secondHoursBefore: 2 }, requires: 'REMINDERS' },
    { id: 'low_stock_retail', kind: 'LOW_STOCK', label: 'Retail low-stock', params: { defaultThreshold: 3 } },
  ],
  policies: [
    { id: 'cancel', label: 'Cancellation', text: 'Please give 24 hours notice. Late cancellations and no-shows may be charged 50% of the service.' },
    { id: 'late', label: 'Late arrivals', text: 'Arrivals more than 15 minutes late may need to be rescheduled.' },
  ],
  extras: {
    payModels: [
      { id: 'commission', label: 'Commission', note: 'Typically 40-60% of service sales to the stylist, lower on retail.' },
      { id: 'booth_rent', label: 'Booth rent', note: 'Weekly or monthly chair rental; renter keeps own revenue.' },
      { id: 'hourly', label: 'Hourly + tips', note: 'Common for assistants and front desk.' },
    ],
    walkInMode: 'Walk-in queue is planned; for now use short same-day appointments.',
    rebookWeeks: { cut: [4, 6], barber: [2, 4], color: [6, 8] },
  },
};

export default salon;
