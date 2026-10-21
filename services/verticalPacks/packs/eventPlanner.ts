/**
 * Event planner / coordinator (weddings, milestone parties, corporate events). Real-world notes:
 *  - US planner pricing (2026): month-of / day-of coordination ~$1,500-$3,000, partial planning ~$3,000-$6,000,
 *    full planning & design ~$6,000-$15,000+ or 10-20% of the event budget; corporate events often per-event or
 *    hourly ($100-$175/hr). Defaults sit mid-range; edit to your market.
 *  - Contracts typically take a 50% non-refundable retainer and the balance 30 days before the event. DEPOSITS
 *    is partial (no online deposit links for this pack): ring the retainer as a sale and note it on the client.
 *  - Vendor contracts (venue, caterer, photographer...) are between the client and each vendor; the planner
 *    coordinates but is not the vendor's agent. If you take referral fees or commissions from vendors, disclose
 *    them to the client in writing (FTC truthful-advertising principles; many planner associations require it).
 *  - No state license is generally required to plan events, but alcohol, permits for public spaces, and
 *    insurance (general liability) are on the planner's checklist; we do not file permits.
 *  - Workflow inquiry -> consult -> proposal -> contract -> planning -> event -> review rides on Booking (consults)
 *    + the new CRM pipeline (both partial). No timelines/run-of-show builder, budgets or e-signatures yet.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const pkg = (key: string, name: string, price: number, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category: 'Planning Packages', price, kind: 'service', durationMin, description, taxClass: 'SERVICE', ...o });
const add = (key: string, name: string, price: number, description: string, addOnFor: string[] = ['*'], o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category: 'Add-ons', price, kind: 'addon', addOnFor, description, taxClass: 'SERVICE', ...o });

const WEDDING = ['day_of', 'partial', 'full'];

const items: StarterItem[] = [
  pkg('consult', 'Free Consultation (60 min)', 0, 60, 'In person or video. We talk date, budget, guest count and style, then send a proposal.', { category: 'Consulting' }),
  pkg('hourly', 'Planning Consult (hourly)', 125, 60, 'Vendor recommendations, budget review or a timeline check for DIY planners.', { category: 'Consulting' }),
  pkg('day_of', 'Day-Of Coordination (month-of)', 1800, 600, 'Starts 6-8 weeks out: vendor confirmations, timeline, rehearsal, and up to 10 hours on the day with one assistant.'),
  pkg('partial', 'Partial Planning', 4000, 720, 'From 4-6 months out: fill vendor gaps, design guidance, budget tracking, monthly check-ins, plus full day-of coordination.'),
  pkg('full', 'Full Planning & Design', 8500, 720, 'From booking to send-off: venue search, all vendor sourcing and negotiation, design, budget, guest logistics and a full event-day team.'),
  pkg('corporate', 'Corporate Event Planning (up to 150)', 5000, 600, 'Conferences, offsites, holiday parties and launches: venue, catering, AV, registration and on-site management.', { category: 'Corporate' }),
  pkg('milestone', 'Milestone Party Planning', 1500, 360, 'Birthdays, anniversaries, quinceañeras, showers: design, vendors and on-site hosting.', { category: 'Social Events' }),
  pkg('proposal', 'Proposal Planning', 950, 240, 'Location scouting, setup, florals, photographer coordination and a backup plan.', { category: 'Social Events' }),
  pkg('elopement', 'Elopement / Micro-Wedding', 1200, 300, 'Up to 20 guests: officiant, photographer and venue coordination.', { category: 'Social Events' }),
  pkg('shower', 'Baby or Bridal Shower Planning', 900, 240, 'Theme, invitations, venue or home setup, catering and games.', { category: 'Social Events' }),
  pkg('gala', 'Gala & Fundraiser Planning', 6500, 720, 'Venue, run of show, auction and sponsor logistics, ticketing setup and on-site management. Raffles and auctions follow your state charitable-gaming rules.', { category: 'Corporate' }),
  pkg('conference', 'Conference / Multi-Day Program (per day)', 2500, 600, 'Session logistics, speaker care, registration desk and vendor management for each program day.', { category: 'Corporate' }),
  // Add-ons
  add('timeline', 'Run-of-Show & Timeline Document', 200, 'A minute-by-minute timeline shared with every vendor.', ['milestone', 'corporate', 'gala', 'shower']),
  add('assistant', 'Additional Event-Day Assistant', 350, 'One more coordinator for up to 10 hours. Recommended over 150 guests.'),
  add('rehearsal', 'Rehearsal Coordination', 300, 'Run the rehearsal the day before (1 hour on site).', WEDDING),
  add('design', 'Design & Mood Board', 600, 'Color palette, decor plan, floor plan sketch and a vendor-ready design brief.', ['day_of', 'milestone', 'corporate']),
  add('rsvp', 'RSVP & Guest List Management', 250, 'Track RSVPs, meal choices and seating chart.'),
  add('welcome_bags', 'Welcome Bag Assembly & Delivery (up to 100)', 200, 'Assembly and hotel drop-off; contents billed at cost.'),
  add('extra_hour', 'Extra Event-Day Hour', 150, 'Per coordinator, beyond the package hours.'),
  add('travel', 'Destination Travel Day', 400, 'Per travel day outside 50 miles, plus airfare and lodging at cost.'),
  add('vendor_mgmt', 'Additional Vendor Management (each)', 150, 'Add a vendor beyond those included in day-of coordination.', ['day_of']),
];

const planner: VerticalPack = {
  id: 'event_planner',
  version: 1,
  parent: 'SERVICE',
  label: 'Event Planner',
  blurb: 'Wedding, party and corporate planning. Consults, proposals, planning packages and add-ons, with a client pipeline from inquiry to review.',
  icon: 'PartyPopper',
  color: '#06D6A0',
  clinical: false,
  vocabulary: {
    customer: 'client', customers: 'clients',
    staff: 'planner', staffPlural: 'planners',
    catalogNoun: 'Packages', catalogNounSingular: 'package',
    orderNoun: 'event', orderNounPlural: 'events',
    checkoutVerb: 'Book',
  },
  capabilities: [
    { id: 'BOOKING', importance: 'core', why: 'Book consultations.' },
    { id: 'CRM_PIPELINE', importance: 'core', why: 'Inquiry to review, per client.' },
    { id: 'EVENT_WORKFLOW', importance: 'core', why: 'Stages per event.' },
    { id: 'POS', importance: 'core', why: 'Take retainers and payments.' },
    { id: 'DEPOSITS', importance: 'nice', why: '50% retainer to book.' },
    { id: 'FORMS_WAIVERS', importance: 'nice', why: 'Signed contracts and questionnaires.' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'REMINDERS', importance: 'nice', why: 'Payment and planning-meeting reminders.' },
    { id: 'TICKETS', importance: 'nice', why: 'Ticketed galas and fundraisers.' },
    { id: 'DEALS', importance: 'nice' }, { id: 'LOYALTY', importance: 'nice' }, { id: 'STAFF_ROLES', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'APPOINTMENTS', 'CRM', 'ORDERS', 'INVENTORY', 'MESSAGING', 'TEAM', 'SETTINGS'],
  publicSections: ['services', 'book', 'gallery', 'hours'],
  defaultHours: week(['10:00', '18:00'], { saturday: { open: '10:00', close: '14:00' }, sunday: 'closed' }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: false, radioServiceEnabled: false, priceRange: '$$$', amenities: ['by_appointment', 'virtual_consults'], tags: ['event planner', 'wedding planner', 'corporate events', 'parties'] },
  starterCatalog: {
    categories: [
      { name: 'Consulting', emoji: '💬' }, { name: 'Planning Packages', emoji: '💍' }, { name: 'Corporate', emoji: '🏢' },
      { name: 'Social Events', emoji: '🎉' }, { name: 'Add-ons', emoji: '✨' },
    ],
    items,
  },
  roles: [
    ownerRole('Lead Planner / Owner'),
    managerRole('Senior Planner', 'Leads full-planning clients, approves proposals and vendor contracts.'),
    { key: 'COORDINATOR', label: 'Coordinator', baseRole: 'STAFF', description: 'Runs day-of events and vendor confirmations.' },
    { key: 'ASSISTANT', label: 'Event Assistant', baseRole: 'STAFF', description: 'Event-day support: setup, guest flow, vendor arrivals.' },
    { key: 'DESIGNER', label: 'Designer', baseRole: 'STAFF', description: 'Mood boards, decor plans and floor plans.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 1500, reward: 'Free RSVP management' }, { points: 4000, reward: 'Free rehearsal coordination' }, { points: 8000, reward: '$500 off your next event' }],
  },
  deals: [
    { key: 'referral_100', label: '$100 off for referred clients', kind: 'AMOUNT', value: 100, minSubtotalCents: 150000, startActive: true },
    { key: 'off_peak', label: 'Off-peak dates 10% off (Nov-Mar)', kind: 'PERCENT', value: 10, minSubtotalCents: 150000, startActive: false, note: 'Switch on for slower months.' },
    { key: 'repeat_client', label: 'Returning clients 10% off', kind: 'PERCENT', value: 10, membersOnly: true, startActive: true },
  ],
  signage: [
    slide('Planning made calm', 'Book a free 60-minute consult', '#003326'),
    slide('Day-of coordination from $1,800', 'You enjoy it. We run it.', '#1a0033'),
    slide('Corporate events, handled', 'Offsites, launches, holiday parties', '#001a33'),
  ],
  hardware: [
    { name: 'Laptop or tablet', why: 'CRM, proposals and client messages.', required: true, approxUsd: 600 },
    { name: 'Card reader', why: 'Retainers and in-person payments.', required: false, approxUsd: 59 },
    { name: 'Two-way radios / earpieces', why: 'Event-day team communication.', required: false, approxUsd: 200 },
    { name: 'Emergency kit', why: 'Sewing kit, stain remover, tape, first aid, chargers.', required: false, approxUsd: 120 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Packages',
    testSaleLabel: 'Take a test retainer',
    extra: [
      { id: 'contract_terms', label: 'Set your retainer and cancellation terms', detail: 'We assumed 50% retainer, balance 30 days out. Edit the policy text to match your contract.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS' },
      { id: 'referral_disclosure', label: 'Decide your vendor-referral policy', detail: 'If vendors pay you referral fees or commissions, say so in writing. We added a disclosure policy you can edit.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS' },
      { id: 'portfolio', label: 'Add 6 portfolio photos', detail: 'Clients book planners on photos. Add them to your gallery.', minutes: 3, detect: 'MANUAL', tab: 'SETTINGS', optional: true },
      { id: 'insurance', label: 'Carry general liability insurance', detail: 'Most venues ask planners for a certificate of insurance.', minutes: 0, detect: 'MANUAL', optional: true },
    ],
  }),
  automations: [
    { id: 'inquiry_reply', kind: 'STAGE_NOTIFY', label: 'Reply to new inquiries within 2 hours', params: { stage: 'inquiry', minutes: 120 }, requires: 'CRM_PIPELINE' },
    { id: 'consult_reminder', kind: 'REMINDER', label: 'Consultation reminder', params: { hoursBefore: 24 }, requires: 'REMINDERS' },
    { id: 'proposal_followup', kind: 'STAGE_NOTIFY', label: 'Follow up on unsigned proposals', params: { stage: 'proposal', afterDays: 5 }, requires: 'CRM_PIPELINE' },
    { id: 'balance_due', kind: 'REMINDER', label: 'Final balance due 30 days out', params: { daysBefore: 30 }, requires: 'REMINDERS' },
    { id: 'review_request', kind: 'WINBACK', label: 'Ask for a review after the event', params: { afterDays: 7 }, requires: 'REMINDERS' },
  ],
  stages: [
    { id: 'inquiry', label: 'Inquiry' },
    { id: 'consult', label: 'Consultation', notifyCustomer: true },
    { id: 'proposal', label: 'Proposal sent', notifyCustomer: true },
    { id: 'contract', label: 'Contract & retainer', notifyCustomer: true },
    { id: 'planning', label: 'Planning' },
    { id: 'event', label: 'Event day' },
    { id: 'review', label: 'Wrap-up & review', notifyCustomer: true },
  ],
  jobFields: [
    { id: 'event_date', label: 'Event date', type: 'text' },
    { id: 'event_type', label: 'Event type', type: 'select', options: ['Wedding', 'Elopement', 'Birthday / milestone', 'Corporate', 'Gala / fundraiser', 'Proposal', 'Other'] },
    { id: 'guest_count', label: 'Guest count', type: 'number' },
    { id: 'budget', label: 'Total event budget ($)', type: 'number' },
    { id: 'venue', label: 'Venue (booked or wanted)', type: 'text' },
    { id: 'package', label: 'Package', type: 'select', options: ['Day-of', 'Partial', 'Full', 'Corporate', 'Hourly'] },
    { id: 'referral_source', label: 'How they found you', type: 'text' },
  ],
  policies: [
    { id: 'retainer', label: 'Retainer & payments', text: 'A signed agreement and a 50% non-refundable retainer reserve your date. The balance is due 30 days before the event.' },
    { id: 'cancellation', label: 'Cancellation & changes', text: 'If you cancel, the retainer is kept for work already done and dates turned away. Date changes are honored once if we are available.' },
    { id: 'vendors', label: 'Vendor contracts', text: 'You sign directly with each vendor and pay them directly. We recommend, negotiate and coordinate, but we are not responsible for a vendor\'s performance.' },
    { id: 'referrals', label: 'Referral disclosure', text: 'Some vendors we recommend may pay us a referral fee. We will tell you which ones in writing, and we only recommend vendors we would hire ourselves.' },
  ],
  extras: {
    retainerPercent: 50,
    balanceDueDaysBefore: 30,
    percentOfBudgetModel: { min: 10, max: 20, note: 'Some full-service planners charge a percentage of the total budget instead of a flat fee.' },
    vendorReferralNote: 'Disclose any referral fees or commissions to clients in writing.',
  },
};

export default planner;
