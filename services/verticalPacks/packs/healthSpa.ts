/**
 * Day spa / wellness spa. NON-CLINICAL by construction:
 *  - parent is SERVICE (not HEALTH), so the dashboard never shows "Clinical Care", the PHI guardrails or
 *    ClinicalCareGate. `clinical: false` is a typed literal, so a clinical pack cannot be written here.
 *  - Intake forms are wellness questionnaires and liability waivers (contraindication screening: pregnancy,
 *    allergies, recent sunburn, medications that affect massage). They are NOT medical records. Do not store
 *    diagnoses. Anything medical-practice (IV therapy, injectables, physician-led) belongs in the clinical flow.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

const svc = (key: string, name: string, category: string, price: number, durationMin: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category, price, kind: 'service', durationMin, description, taxClass: 'SERVICE', ...o });
const add = (key: string, name: string, price: number, durationMin: number, forKeys: string[] | '*' = '*'): StarterItem =>
  ({ key, name, category: 'Add-ons', price, kind: 'addon', durationMin, description: name, addOnFor: forKeys === '*' ? ['*'] : forKeys, taxClass: 'SERVICE' });
const retail = (key: string, name: string, price: number, cost: number): StarterItem =>
  ({ key, name, category: 'Retail', price, costPrice: cost, kind: 'product', description: name, stock: 8, lowStockThreshold: 3, taxClass: 'STANDARD', storeCategory: 'HOME' });

const spa: VerticalPack = {
  id: 'health_spa',
  version: 1,
  parent: 'SERVICE',
  label: 'Day Spa / Wellness Spa',
  blurb: 'Massage, facials, body treatments and packages. Wellness only: not a clinical practice.',
  icon: 'Flower2',
  color: '#06D6A0',
  clinical: false,
  vocabulary: {
    customer: 'guest', customers: 'guests',
    staff: 'therapist', staffPlural: 'therapists',
    catalogNoun: 'Treatment menu', catalogNounSingular: 'treatment',
    orderNoun: 'appointment', orderNounPlural: 'appointments',
    checkoutVerb: 'Check out',
  },
  capabilities: [
    { id: 'BOOKING', importance: 'core' }, { id: 'POS', importance: 'core' }, { id: 'STAFF_ROLES', importance: 'core' },
    { id: 'FORMS_WAIVERS', importance: 'core', why: 'Wellness questionnaire and waiver before first treatment.' },
    { id: 'MEMBERSHIPS', importance: 'nice', why: 'Monthly massage / facial memberships.' },
    { id: 'RESOURCE_SCHEDULING', importance: 'nice', why: 'Treatment rooms and equipment.' },
    { id: 'GIFT_CARDS', importance: 'nice' }, { id: 'LOYALTY', importance: 'nice' }, { id: 'DEALS', importance: 'nice' },
    { id: 'REMINDERS', importance: 'nice' }, { id: 'MESSAGING', importance: 'nice' }, { id: 'INVENTORY', importance: 'nice' },
    { id: 'SIGNAGE', importance: 'nice' }, { id: 'RADIO', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'APPOINTMENTS', 'ORDERS', 'INVENTORY', 'TEAM', 'CRM', 'MESSAGING', 'SIGNAGE', 'RADIO', 'SETTINGS'],
  publicSections: ['services', 'book', 'gallery', 'hours', 'amenities'],
  defaultHours: week(['10:00', '19:00'], { sunday: { open: '11:00', close: '17:00' }, saturday: { open: '09:00', close: '19:00' } }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: true, radioServiceEnabled: true, priceRange: '$$$', amenities: ['wifi', 'tea', 'lockers', 'showers'], tags: ['spa', 'massage', 'wellness'] },
  starterCatalog: {
    categories: [
      { name: 'Massage', emoji: '💆' }, { name: 'Facials', emoji: '🧖' }, { name: 'Body', emoji: '🌿' },
      { name: 'Hands & Feet', emoji: '🦶' }, { name: 'Add-ons', emoji: '➕' }, { name: 'Retail', emoji: '🕯️' },
    ],
    items: [
      svc('swedish_60', 'Swedish Massage, 60 min', 'Massage', 95, 60, 'Relaxing full-body massage with light to medium pressure. Room: massage.'),
      svc('swedish_90', 'Swedish Massage, 90 min', 'Massage', 135, 90, 'Extended relaxation massage. Room: massage.'),
      svc('deep_tissue_60', 'Deep Tissue Massage, 60 min', 'Massage', 110, 60, 'Firm pressure for tight muscles. Room: massage.'),
      svc('hot_stone', 'Hot Stone Massage, 75 min', 'Massage', 140, 75, 'Heated basalt stones with warm oil. Needs stone warmer. Room: massage.'),
      svc('couples', "Couples Massage, 60 min", 'Massage', 210, 60, 'Side-by-side massage for two. Needs the couples suite (two therapists).'),
      svc('prenatal', 'Prenatal Massage, 60 min', 'Massage', 105, 60, 'Side-lying massage with pregnancy pillows. Wellness massage only; guests should check with their provider.'),
      svc('facial_classic', 'Signature Facial, 60 min', 'Facials', 100, 60, 'Cleanse, exfoliate, extractions, mask and moisture. Room: facial.'),
      svc('facial_hydra', 'Hydrating Facial, 75 min', 'Facials', 130, 75, 'Deep hydration treatment with massage. Room: facial.'),
      svc('facial_express', 'Express Facial, 30 min', 'Facials', 60, 30, 'Quick cleanse and glow. Room: facial.'),
      svc('body_scrub', 'Sea Salt Body Scrub, 45 min', 'Body', 85, 45, 'Full-body exfoliation and moisturizer. Room: wet room.'),
      svc('body_wrap', 'Detox Body Wrap, 60 min', 'Body', 115, 60, 'Mineral wrap treatment. Room: wet room.'),
      svc('manicure', 'Spa Manicure, 45 min', 'Hands & Feet', 45, 45, 'Soak, scrub, massage and polish.'),
      svc('pedicure', 'Spa Pedicure, 60 min', 'Hands & Feet', 65, 60, 'Soak, scrub, mask, massage and polish. Station: pedicure chair.'),
      add('aromatherapy', 'Aromatherapy', 15, 0),
      add('hot_towel_foot', 'Hot Towel + Foot Treatment', 20, 10, ['swedish_60', 'swedish_90', 'deep_tissue_60']),
      add('eye_treatment', 'Eye Treatment', 20, 10, ['facial_classic', 'facial_hydra', 'facial_express']),
      add('scalp', 'Scalp Treatment', 20, 10, ['swedish_60', 'swedish_90', 'deep_tissue_60', 'facial_classic']),
      retail('candle', 'Soy Candle', 28, 11),
      retail('body_oil', 'Massage & Body Oil, 4 oz', 32, 12),
      retail('face_mask', 'Clay Face Mask', 30, 11),
      retail('bath_salts', 'Mineral Bath Salts', 24, 8),
    ],
  },
  roles: [
    ownerRole('Owner'),
    managerRole('Spa Manager', 'Schedules rooms and therapists, runs reports.'),
    { key: 'MASSAGE_THERAPIST', label: 'Massage Therapist', baseRole: 'STAFF', description: 'Own schedule and treatment notes for comfort preferences only (no diagnoses).' },
    { key: 'ESTHETICIAN', label: 'Esthetician', baseRole: 'STAFF', description: 'Facials and body treatments.' },
    { key: 'NAIL_TECH', label: 'Nail Technician', baseRole: 'STAFF', description: 'Hands and feet.' },
    { key: 'FRONT_DESK', label: 'Front Desk / Concierge', baseRole: 'STAFF', description: 'Books, checks in, sells packages and retail.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 200, reward: 'Free add-on' }, { points: 500, reward: '$40 off any treatment' }, { points: 1000, reward: 'Free 60-min massage' }],
  },
  deals: [
    { key: 'weekday', label: 'Weekday 10% off treatments', kind: 'PERCENT', value: 10, startActive: false, note: 'Fill slow Tuesday to Thursday slots.' },
    { key: 'members_5', label: 'Members save 5%', kind: 'PERCENT', value: 5, membersOnly: true, startActive: true },
    { key: 'spend_150', label: '$20 off $150+', kind: 'AMOUNT', value: 20, minSubtotalCents: 15000, startActive: true },
  ],
  signage: [
    slide('Book a 60-minute reset', 'Ask about packages and memberships', '#06332a'),
    slide('Add aromatherapy for $15', 'Make any massage a ritual', '#1a0033'),
    slide('Arrive 15 minutes early', 'Time to unwind and complete your intake', '#000'),
  ],
  hardware: [
    { name: 'Tablet at the front desk', why: 'Check-in, intake and checkout.', required: true, approxUsd: 250 },
    { name: 'Card reader', why: 'Tap, chip and tips.', required: true, approxUsd: 59 },
    { name: 'Hydraulic or electric massage table(s)', why: 'One per massage room.', required: false, approxUsd: 700 },
    { name: 'Stone warmer', why: 'Hot stone service.', required: false, approxUsd: 120 },
    { name: 'Wall TV or tablet for signage', why: 'Lobby menu loop.', required: false, approxUsd: 200 },
    { name: 'Bluetooth speaker', why: 'In-store calm playlist via Plajah Radio.', required: false, approxUsd: 80 },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Treatment menu',
    testSaleLabel: 'Check out a test treatment',
    extra: [
      { id: 'rooms_noted', label: 'Note your rooms and equipment', detail: 'Treatment rooms, couples suite, stone warmer. Room scheduling is coming; for now note it in each treatment description.', minutes: 1, detect: 'MANUAL', requires: 'RESOURCE_SCHEDULING', optional: true },
      { id: 'waiver_ready', label: 'Have a waiver and intake on file', detail: 'Digital wellness questionnaire and waiver are coming. Until then use your paper form.', minutes: 0, detect: 'MANUAL', requires: 'FORMS_WAIVERS', optional: true },
    ],
  }),
  automations: [
    { id: 'reminder_24h', kind: 'REMINDER', label: 'Appointment reminder', params: { hoursBefore: 24, secondHoursBefore: 2 }, requires: 'REMINDERS' },
    { id: 'rebook_massage', kind: 'REBOOK_NUDGE', label: 'Rebook nudge after a massage', params: { afterWeeks: 4 }, requires: 'REMINDERS' },
    { id: 'rebook_facial', kind: 'REBOOK_NUDGE', label: 'Rebook nudge after a facial', params: { afterWeeks: 5 }, requires: 'REMINDERS' },
    { id: 'low_stock_retail', kind: 'LOW_STOCK', label: 'Retail low-stock', params: { defaultThreshold: 3 } },
  ],
  policies: [
    { id: 'cancel', label: 'Cancellation', text: 'Please cancel at least 24 hours ahead. Late cancellations and no-shows are charged 50% of the treatment.' },
    { id: 'health', label: 'Wellness notice', text: 'Our treatments are for relaxation and wellness. They are not medical care. Please tell your therapist about any conditions before your treatment.' },
  ],
  forms: [
    { id: 'wellness_questionnaire', label: 'Wellness questionnaire', requires: 'FORMS_WAIVERS', clinical: false, fields: ['Pregnant or nursing?', 'Allergies (oils, nuts, latex)', 'Skin sensitivities', 'Areas to avoid', 'Pressure preference', 'Anything else your therapist should know'] },
    { id: 'liability_waiver', label: 'Liability waiver and consent', requires: 'FORMS_WAIVERS', clinical: false, fields: ['Full name', 'Date', 'Signature', 'Photo release (optional)'] },
  ],
  packages: [
    { name: '3-massage package', blurb: 'Three 60-minute Swedish massages, prepaid at 10% off.', price: 256, requires: 'MEMBERSHIPS' },
    { name: 'Monthly massage membership', blurb: 'One 60-minute massage per month, billed monthly.', price: 80, requires: 'MEMBERSHIPS' },
    { name: 'Spa day for two', blurb: 'Couples massage plus two express facials.', price: 300, requires: 'MEMBERSHIPS' },
  ],
  extras: { rooms: ['Massage room 1', 'Massage room 2', 'Facial room', 'Wet room', 'Couples suite'], equipment: ['Stone warmer', 'Pedicure chairs'], nonClinicalNote: 'No charting, diagnoses or PHI. For clinical care use the Health & Wellness (clinical) business type.' },
};

export default spa;
