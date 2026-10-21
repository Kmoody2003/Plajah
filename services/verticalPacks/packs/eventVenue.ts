/**
 * Event venue (weddings, private parties, corporate meetings; optionally ticketed shows). Real-world notes:
 *  - Rental pricing is by space and day part: Saturday evening is the premium block (often 2-3x a weekday);
 *    6-hour blocks with paid overtime are standard. Defaults are typical mid-size US venue rates (2026) for a
 *    250-seat ballroom, a 120-guest courtyard and a 60-guest loft; edit to your market.
 *  - Contracts usually take a 50% non-refundable retainer to book the date, the balance 14 days out, and a
 *    separate refundable damage deposit. DEPOSITS is partial: Plajah has no online deposit links or
 *    deposit-on-booking for venues, so the owner rings deposits as register sales and notes them on the booking.
 *  - Food & beverage carries a service charge (20-24%). In many states a mandatory service charge is taxable and is
 *    NOT a gratuity unless the contract says it goes to staff; the policy text says so plainly.
 *  - Alcohol needs the venue's own liquor license (or a licensed caterer/bartending service with its own license,
 *    or a one-day permit, by state). Bar packages are age-restricted (21+) and need licensed, trained bartenders;
 *    many venues require security at a guest-count threshold when alcohol is served.
 *  - Posted occupancy (fire marshal) caps every space; outside vendors must carry insurance and name the venue on a
 *    certificate of insurance (COI).
 *  - Event workflow (inquiry -> tour -> hold -> contract -> deposit -> event -> settled) rides on Booking (tours) +
 *    the new CRM pipeline (both partial). No floor plans, BEOs or e-signatures yet.
 *  - Ticketed shows use Plajah Events (TICKETS partial: tiers, checkout, kiosk and scanner). The service-ticket
 *    engine (Tickets tab) is unrelated and not enabled for this pack.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const rental = (key: string, name: string, price: number, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category: 'Space Rentals', price, kind: 'service', durationMin, description, taxClass: 'SERVICE', ...o });
const addon = (key: string, name: string, category: string, price: number, cost: number, description: string, addOnFor: string[], o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, costPrice: cost, kind: 'addon', addOnFor, description, taxClass: 'SERVICE', ...o });

const BALLROOM = ['ballroom_sat', 'ballroom_fri_sun', 'ballroom_weekday'];
const SPACES = [...BALLROOM, 'courtyard_ceremony', 'courtyard_hourly', 'loft_hourly', 'meeting_day'];

const items: StarterItem[] = [
  // Space rentals
  rental('ballroom_sat', 'Grand Ballroom: Saturday Evening (6 hr)', 5500, 360, 'Up to 250 seated / 350 standing. Includes tables, chairs, house linens, setup and breakdown. Overtime $500/hr.'),
  rental('ballroom_fri_sun', 'Grand Ballroom: Friday or Sunday (6 hr)', 3800, 360, 'Same inclusions as Saturday. Holiday weekends priced as Saturday.'),
  rental('ballroom_weekday', 'Grand Ballroom: Weekday (6 hr)', 2200, 360, 'Monday-Thursday, day or evening.'),
  rental('courtyard_ceremony', 'Garden Courtyard: Ceremony (2 hr)', 1200, 120, 'Up to 120 guests. Includes ceremony chairs, arbor and a rain plan in the loft.'),
  rental('courtyard_hourly', 'Garden Courtyard (hourly)', 250, 60, 'Cocktail hours and showers. 3-hour minimum.'),
  rental('loft_hourly', 'Private Loft (hourly)', 150, 60, 'Up to 60 guests. Rehearsal dinners, birthdays, showers. 3-hour minimum.'),
  rental('meeting_day', 'Boardroom / Meeting Day Rate (8 hr)', 650, 480, 'Up to 24 at the boardroom table. Screen, Wi-Fi and coffee service included.'),
  rental('rehearsal', 'Ceremony Rehearsal (1 hr)', 250, 60, 'Weekday before the event, subject to availability.'),
  rental('tour', 'Venue Tour', 0, 45, 'Walk the spaces with our events manager. Free, by appointment.', { requires: 'BOOKING' }),
  // Bar packages (per guest, 21+)
  addon('bar_beer_wine', 'Beer & Wine Package (per guest, 4 hr)', 'Bar Packages', 26, 9, 'House beer and wine. Licensed bartenders; ID checked. Price per guest age 21+.', SPACES, { ageRestricted: 'ALCOHOL', taxClass: 'STANDARD' }),
  addon('bar_standard', 'Standard Open Bar (per guest, 4 hr)', 'Bar Packages', 38, 13, 'Well spirits, house wine, domestic and craft beer.', SPACES, { ageRestricted: 'ALCOHOL', taxClass: 'STANDARD' }),
  addon('bar_premium', 'Premium Open Bar (per guest, 4 hr)', 'Bar Packages', 52, 19, 'Call and premium spirits, upgraded wine, signature cocktail.', SPACES, { ageRestricted: 'ALCOHOL', taxClass: 'STANDARD' }),
  addon('bar_soft', 'Soft Drink & Mocktail Package (per guest)', 'Bar Packages', 8, 2, 'Sodas, juices, iced tea, two mocktails. For under-21 guests and dry events.', SPACES, { taxClass: 'PREPARED_FOOD' }),
  addon('bartender', 'Additional Bartender (per hour)', 'Bar Packages', 50, 30, 'One bartender per 75 guests is included; add more for faster service.', SPACES),
  // Catering (per guest)
  addon('cater_buffet', 'Buffet Dinner (per guest)', 'Catering', 48, 18, 'Two entrees, three sides, salad, rolls. Service charge applies.', SPACES, { taxClass: 'PREPARED_FOOD' }),
  addon('cater_plated', 'Plated Dinner (per guest)', 'Catering', 65, 24, 'Three courses, choice of two entrees. Service charge applies.', SPACES, { taxClass: 'PREPARED_FOOD' }),
  addon('cater_apps', 'Passed Hors d\'Oeuvres (per guest, 1 hr)', 'Catering', 22, 8, 'Five selections, two per guest each.', SPACES, { taxClass: 'PREPARED_FOOD' }),
  addon('cater_late', 'Late-Night Snack (per guest)', 'Catering', 12, 4, 'Sliders, fries or a taco bar.', SPACES, { taxClass: 'PREPARED_FOOD' }),
  addon('outside_cater_fee', 'Approved Outside Caterer Fee (per guest)', 'Catering', 10, 0, 'When you bring an approved outside caterer. Caterer must provide a certificate of insurance.', SPACES),
  // Add-ons
  addon('av_package', 'AV Package', 'Add-ons', 450, 60, 'Projector and screen, two wireless mics, house sound and a tech for setup.', SPACES),
  addon('uplighting', 'Uplighting (20 fixtures)', 'Add-ons', 350, 40, 'Color-matched LED uplights.', SPACES),
  addon('dance_floor', 'Dance Floor + DJ Booth', 'Add-ons', 400, 80, 'Portable floor (up to 24x24) and booth power.', SPACES),
  addon('security', 'Security Officer (per hour)', 'Add-ons', 55, 35, 'Licensed officer. Required for 100+ guests when alcohol is served.', SPACES),
  addon('cleaning', 'Cleaning Fee', 'Add-ons', 350, 150, 'Post-event cleaning and trash removal.', SPACES),
  addon('chiavari', 'Chiavari Chair Upgrade (per chair)', 'Add-ons', 8, 3, 'Gold, silver or natural, with cushion.', SPACES),
  addon('overtime', 'Overtime Hour', 'Add-ons', 500, 120, 'Each extra hour beyond the rental block, when the calendar allows.', BALLROOM),
  addon('damage_deposit', 'Refundable Damage Deposit', 'Deposits', 1000, 0, 'Refunded within 14 days after the event, less documented damage or excess cleaning.', SPACES, { taxClass: 'EXEMPT', requires: 'DEPOSITS' }),
];

const venue: VerticalPack = {
  id: 'event_venue',
  version: 1,
  parent: 'ENTERTAINMENT',
  label: 'Event Venue',
  blurb: 'Wedding, party and meeting venue. Space rentals by day part, bar and catering packages, tours, holds and deposits, plus ticketed shows.',
  icon: 'Landmark',
  color: '#6B0099',
  clinical: false,
  vocabulary: {
    customer: 'client', customers: 'clients',
    staff: 'event staff', staffPlural: 'event staff',
    catalogNoun: 'Packages', catalogNounSingular: 'package',
    orderNoun: 'booking', orderNounPlural: 'bookings',
    checkoutVerb: 'Book',
  },
  capabilities: [
    { id: 'POS', importance: 'core', why: 'Take retainers, balances and bar tabs.' },
    { id: 'BOOKING', importance: 'core', why: 'Tours and date holds.' },
    { id: 'EVENT_WORKFLOW', importance: 'core', why: 'Inquiry to settled, per event.' },
    { id: 'CRM_PIPELINE', importance: 'core', why: 'Track every inquiry and hold.' },
    { id: 'DEPOSITS', importance: 'core', why: 'Retainer plus a refundable damage deposit.' },
    { id: 'TICKETS', importance: 'nice', why: 'Sell tickets to your own shows.' },
    { id: 'AGE_GATE', importance: 'nice', why: 'Bar packages are 21+.' },
    { id: 'RESOURCE_SCHEDULING', importance: 'nice', why: 'Block spaces and equipment against double-booking.' },
    { id: 'FORMS_WAIVERS', importance: 'nice', why: 'Signed contracts and vendor COIs.' },
    { id: 'TAX', importance: 'nice', why: 'Food, alcohol and service charges tax differently.' },
    { id: 'KIOSK', importance: 'nice', why: 'Door check-in for ticketed shows.' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'REMINDERS', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' },
    { id: 'DEALS', importance: 'nice' }, { id: 'LOYALTY', importance: 'nice' }, { id: 'STAFF_ROLES', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'APPOINTMENTS', 'CRM', 'ORDERS', 'INVENTORY', 'MESSAGING', 'TEAM', 'SIGNAGE', 'RADIO', 'SETTINGS'],
  publicSections: ['events', 'gallery', 'amenities', 'book', 'services', 'hours'],
  defaultHours: week(['10:00', '18:00'], { saturday: { open: '10:00', close: '16:00' }, sunday: 'closed' }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: true, radioServiceEnabled: false, priceRange: '$$$', amenities: ['parking', 'wheelchair_accessible', 'bridal_suite', 'catering', 'bar', 'av'], tags: ['venue', 'weddings', 'events', 'private parties', 'meetings'] },
  starterCatalog: {
    categories: [
      { name: 'Space Rentals', emoji: '🏛️' }, { name: 'Bar Packages', emoji: '🍸' }, { name: 'Catering', emoji: '🍽️' },
      { name: 'Add-ons', emoji: '🎛️' }, { name: 'Deposits', emoji: '🔒' },
    ],
    items,
  },
  roles: [
    ownerRole('Venue Owner'),
    managerRole('General Manager', 'Owns the calendar, pricing, contracts and vendor list.'),
    { key: 'SALES', label: 'Sales & Events Manager', baseRole: 'ADMIN', description: 'Answers inquiries, gives tours, places holds and sends contracts.' },
    { key: 'COORDINATOR', label: 'Event Coordinator', baseRole: 'STAFF', description: 'Runs the event day: timeline, vendors, setup and breakdown.' },
    { key: 'BAR_LEAD', label: 'Bar Lead', baseRole: 'STAFF', description: 'Runs the bar, checks ID, keeps the alcohol log.' },
    { key: 'CREW', label: 'Setup & Facilities Crew', baseRole: 'STAFF', description: 'Sets rooms, runs AV, cleans after.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 2500, reward: 'Free uplighting at your next event' }, { points: 6000, reward: 'Free 3-hour loft rental' }, { points: 12000, reward: '$500 off your next booking' }],
  },
  deals: [
    { key: 'weekday_10', label: 'Weekday events 10% off', kind: 'PERCENT', value: 10, minSubtotalCents: 150000, startActive: true },
    { key: 'off_season', label: 'Off-season 15% off (Jan-Mar)', kind: 'PERCENT', value: 15, minSubtotalCents: 300000, startActive: false, note: 'Switch on for January through March.' },
    { key: 'last_minute', label: 'Open date within 60 days: $500 off', kind: 'AMOUNT', value: 500, minSubtotalCents: 300000, startActive: false, note: 'Fill open dates; turn off once booked.' },
    { key: 'nonprofit', label: 'Nonprofit 10% off', kind: 'PERCENT', value: 10, startActive: false, note: 'Ask for a 501(c)(3) letter.' },
  ],
  signage: [
    slide('Now booking next season', 'Saturdays go first. Tour this week.', '#1a0033'),
    slide('Weekday events save 10%', 'Meetings, showers, rehearsal dinners', '#33001a'),
    slide('Tonight: live in the Ballroom', 'Tickets at the door or on Plajah', '#000'),
    slide('Welcome, guests', 'Coat check left, restrooms right, bar opens at 6', '#001a33'),
  ],
  hardware: [
    { name: 'Tablet for tours and the office', why: 'Calendar, CRM and contracts on the go.', required: true, approxUsd: 350 },
    { name: 'Card reader', why: 'Retainers, balances and bar sales.', required: true, approxUsd: 59 },
    { name: 'Phone or scanner at the door', why: 'Ticket check-in for shows (Plajah scanner).', required: false, approxUsd: 0 },
    { name: 'Wireless mics + house sound', why: 'Toasts, speeches and presentations.', required: false, approxUsd: 1200 },
    { name: 'Projector / large display', why: 'Slideshows and corporate decks.', required: false, approxUsd: 900 },
    { name: 'Signage TV at the entrance', why: 'Welcome screens and upcoming events.', required: false, approxUsd: 300 },
    { name: 'Receipt printer + cash drawer at the bar', why: 'Cash bars and tabs.', required: false, approxUsd: 210 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Packages',
    testSaleLabel: 'Take a test retainer',
    extra: [
      { id: 'capacity', label: 'Enter posted occupancy for each space', detail: 'Use your fire marshal limits in each rental description; we filled in sample numbers.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'liquor', label: 'Confirm your alcohol setup', detail: 'Your liquor license, a licensed caterer, or a one-day permit. Remove bar packages if you do not serve.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'deposit_terms', label: 'Set retainer and deposit terms', detail: 'We assumed 50% retainer, balance 14 days out and a $1,000 refundable damage deposit. Ring deposits as sales for now.', minutes: 2, detect: 'MANUAL', requires: 'DEPOSITS', optional: true },
      { id: 'vendor_coi', label: 'Publish your vendor insurance rules', detail: 'Outside vendors send a COI naming the venue. Paste the policy on your page.', minutes: 2, detect: 'MANUAL', tab: 'SETTINGS', optional: true },
      { id: 'first_show', label: 'List a ticketed show (optional)', detail: 'Create an event with ticket tiers; scan tickets at the door.', minutes: 3, detect: 'MANUAL', requires: 'TICKETS', optional: true },
    ],
  }),
  automations: [
    { id: 'inquiry_reply', kind: 'STAGE_NOTIFY', label: 'Reply to new inquiries within 1 hour', params: { stage: 'inquiry', minutes: 60 }, requires: 'CRM_PIPELINE' },
    { id: 'tour_reminder', kind: 'REMINDER', label: 'Tour reminder', params: { hoursBefore: 24 }, requires: 'REMINDERS' },
    { id: 'hold_expiry', kind: 'REMINDER', label: 'Date hold expires in 48 hours', params: { holdDays: 7, warnHours: 48 }, requires: 'CRM_PIPELINE' },
    { id: 'balance_due', kind: 'REMINDER', label: 'Final balance due 14 days out', params: { daysBefore: 14 }, requires: 'REMINDERS' },
    { id: 'final_details', kind: 'REMINDER', label: 'Final guest count and timeline due', params: { daysBefore: 10 }, requires: 'REMINDERS' },
    { id: 'post_event', kind: 'WINBACK', label: 'Thank-you + review request', params: { afterDays: 3 }, requires: 'REMINDERS' },
  ],
  stages: [
    { id: 'inquiry', label: 'Inquiry' },
    { id: 'tour', label: 'Tour booked', notifyCustomer: true },
    { id: 'hold', label: 'Date on hold', notifyCustomer: true },
    { id: 'contract', label: 'Contract sent' },
    { id: 'deposit_paid', label: 'Retainer paid', notifyCustomer: true },
    { id: 'event', label: 'Event day' },
    { id: 'settled', label: 'Settled (deposit returned)', notifyCustomer: true },
  ],
  jobFields: [
    { id: 'event_date', label: 'Event date', type: 'text' },
    { id: 'event_type', label: 'Event type', type: 'select', options: ['Wedding', 'Reception', 'Birthday / milestone', 'Corporate', 'Nonprofit / gala', 'Concert / show', 'Other'] },
    { id: 'guest_count', label: 'Guest count', type: 'number' },
    { id: 'space', label: 'Space', type: 'select', options: ['Grand Ballroom', 'Garden Courtyard', 'Private Loft', 'Boardroom'] },
    { id: 'times', label: 'Start / end time', type: 'text' },
    { id: 'catering', label: 'Catering', type: 'select', options: ['In-house', 'Approved outside caterer', 'None'] },
    { id: 'bar', label: 'Bar', type: 'select', options: ['None', 'Beer & wine', 'Standard open bar', 'Premium open bar', 'Cash bar'] },
    { id: 'coi_received', label: 'Vendor COIs received', type: 'select', options: ['Not needed', 'Pending', 'All received'] },
  ],
  policies: [
    { id: 'retainer', label: 'Retainer & payments', text: 'A 50% non-refundable retainer and signed contract reserve your date. The balance and final guest count are due 14 days before the event.' },
    { id: 'damage_deposit', label: 'Damage deposit', text: 'A refundable damage deposit is due with the final balance and returned within 14 days after the event, less documented damage or excess cleaning.' },
    { id: 'cancellation', label: 'Cancellation', text: 'Cancel more than 180 days out: retainer kept, nothing further owed. Within 180 days: 75% of the rental. Within 60 days: 100%. We refund anything we re-book the date for, less costs.' },
    { id: 'service_charge', label: 'Service charge', text: 'Food and beverage carry a 22% service charge. It is not a gratuity and is not paid to staff unless your contract says so; it may be taxable in our state.' },
    { id: 'alcohol', label: 'Alcohol', text: 'Only our licensed bartenders serve alcohol. We check ID for everyone who looks under 40, do not serve anyone under 21 or visibly intoxicated, and close the bar 30 minutes before the end.' },
    { id: 'vendors', label: 'Outside vendors', text: 'Outside vendors must carry general liability insurance and send a certificate of insurance naming the venue at least 10 days before the event.' },
  ],
  extras: {
    retainerPercent: 50,
    balanceDueDaysBefore: 14,
    damageDepositUsd: 1000,
    serviceChargePercent: 22,
    holdDays: 7,
    spaces: [
      { id: 'ballroom', name: 'Grand Ballroom', seated: 250, standing: 350 },
      { id: 'courtyard', name: 'Garden Courtyard', seated: 120, standing: 150 },
      { id: 'loft', name: 'Private Loft', seated: 60, standing: 80 },
      { id: 'boardroom', name: 'Boardroom', seated: 24, standing: 24 },
    ],
    ticketedShowsNote: 'Ticketed shows use Plajah Events (TICKETS). The Tickets tab (service tickets) is not part of this pack.',
  },
};

export default venue;
