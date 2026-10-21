/**
 * Independent used-car dealership. Real-world notes baked in:
 *  - A state dealer license (plus surety bond, and usually a fixed lot with signage) is required to sell more
 *    than a handful of vehicles a year; Plajah does not issue or check licenses. The checklist asks for the
 *    license number so it can be shown on the page and paperwork, as most states require in ads.
 *  - FTC Used Car Rule: every used vehicle offered for sale must display a Buyers Guide (As Is / Warranty) in the
 *    window, and its terms override the contract. Plajah does not print Buyers Guides yet; use the FTC form.
 *  - FTC CARS Rule (2023) was vacated by the Fifth Circuit in January 2025, but its core asks (advertise the real
 *    offering price, no junk fees, express informed consent for every add-on) still follow from FTC Act Section 5
 *    and state UDAP laws, so this pack keeps F&I products as clearly optional, separately priced add-ons.
 *  - Federal odometer disclosure on transfer; title/registration and sales tax are usually collected by the dealer
 *    and remitted to the state, at rates and fees the state sets (pass-through, not dealer revenue).
 *  - Doc fees are capped in some states (e.g. California, New York) and must be disclosed or posted in others;
 *    default $399 is a mid-range uncapped-state figure; edit to your state.
 *  - Dealer-arranged financing brings Truth in Lending (Reg Z), ECOA/adverse action, and the FTC Safeguards Rule
 *    for customer data. Plajah has NO lender integration and stores no credit applications (FINANCING planned).
 *  - Used dealers are not federally barred from selling vehicles with open recalls, but disclosing them is best
 *    practice (and required in some states); RECALL_CHECK (NHTSA, free) helps.
 *  - Vehicles are inventory items with stock 1 (VEHICLE_INVENTORY partial: no DMS, no marketplace feeds).
 *    Prices/costs are typical 2026 US used-retail for the year/mileage; cost = acquisition + recon.
 */
import type { VerticalPack, StarterItem } from '../types';
import { goLiveSteps, managerRole, ownerRole, slide, week } from './shared';

interface Spec { year: number; make: string; model: string; trim: string; miles: number; body: string; drivetrain: string; engine: string; transmission: string; exterior: string; mpg?: string; rangeMi?: number }

const SPECS: Record<string, Spec> = {};
const car = (key: string, category: string, price: number, cost: number, s: Spec, extra = ''): StarterItem => {
  SPECS[key] = s;
  return {
    key, category, price, costPrice: cost, kind: 'product',
    name: `${s.year} ${s.make} ${s.model} ${s.trim}`,
    description: `${s.miles.toLocaleString('en-US')} miles. ${s.engine}, ${s.transmission}, ${s.drivetrain}. ${s.exterior}.${extra ? ` ${extra}` : ''} Buyers Guide posted on the vehicle.`,
    stock: 1, lowStockThreshold: 0, taxClass: 'STANDARD', storeCategory: 'OTHER', requires: 'VEHICLE_INVENTORY', emoji: '🚗',
  };
};
const fi = (key: string, name: string, price: number, cost: number, description: string, o: Partial<StarterItem> = {}): StarterItem =>
  ({ key, name, category: 'F&I Products', price, costPrice: cost, kind: 'addon', addOnFor: ['*'], description: `Optional. ${description}`, taxClass: 'SERVICE', ...o });

const items: StarterItem[] = [
  car('camry_21', 'Sedans', 23995, 20800, { year: 2021, make: 'Toyota', model: 'Camry', trim: 'SE', miles: 41200, body: 'Sedan', drivetrain: 'FWD', engine: '2.5L I4', transmission: '8-speed automatic', exterior: 'Celestial Silver', mpg: '28/39' }, 'One owner, clean history report.'),
  car('altima_21', 'Sedans', 18995, 16300, { year: 2021, make: 'Nissan', model: 'Altima', trim: '2.5 SV', miles: 38700, body: 'Sedan', drivetrain: 'FWD', engine: '2.5L I4', transmission: 'CVT', exterior: 'Gun Metallic', mpg: '28/39' }),
  car('elantra_20', 'Sedans', 15995, 13500, { year: 2020, make: 'Hyundai', model: 'Elantra', trim: 'SEL', miles: 44100, body: 'Sedan', drivetrain: 'FWD', engine: '2.0L I4', transmission: 'CVT', exterior: 'Phantom Black', mpg: '30/40' }, 'Balance of 10-year/100k powertrain warranty applies to the original owner only; confirm coverage.'),
  car('accord_17', 'Sedans', 17495, 14600, { year: 2017, make: 'Honda', model: 'Accord', trim: 'EX-L', miles: 88300, body: 'Sedan', drivetrain: 'FWD', engine: '2.4L I4', transmission: 'CVT', exterior: 'Modern Steel', mpg: '27/36' }, 'Leather, sunroof. Sold As Is.'),
  car('crv_20', 'SUVs & Crossovers', 24495, 21300, { year: 2020, make: 'Honda', model: 'CR-V', trim: 'EX AWD', miles: 52800, body: 'SUV', drivetrain: 'AWD', engine: '1.5L turbo I4', transmission: 'CVT', exterior: 'Platinum White Pearl', mpg: '27/32' }),
  car('equinox_22', 'SUVs & Crossovers', 21995, 19100, { year: 2022, make: 'Chevrolet', model: 'Equinox', trim: 'LT', miles: 29900, body: 'SUV', drivetrain: 'FWD', engine: '1.5L turbo I4', transmission: '6-speed automatic', exterior: 'Mosaic Black', mpg: '26/31' }),
  car('grand_cherokee_18', 'SUVs & Crossovers', 21495, 18400, { year: 2018, make: 'Jeep', model: 'Grand Cherokee', trim: 'Limited 4x4', miles: 74600, body: 'SUV', drivetrain: '4WD', engine: '3.6L V6', transmission: '8-speed automatic', exterior: 'Granite Crystal', mpg: '18/25' }),
  car('f150_19', 'Trucks', 31995, 28000, { year: 2019, make: 'Ford', model: 'F-150', trim: 'XLT SuperCrew 4x4', miles: 68400, body: 'Pickup', drivetrain: '4WD', engine: '2.7L EcoBoost V6', transmission: '10-speed automatic', exterior: 'Oxford White', mpg: '18/23' }, 'Tow package, 5.5 ft bed.'),
  car('tacoma_16', 'Trucks', 26495, 23100, { year: 2016, make: 'Toyota', model: 'Tacoma', trim: 'SR5 Double Cab 4x4', miles: 96200, body: 'Pickup', drivetrain: '4WD', engine: '3.5L V6', transmission: '6-speed automatic', exterior: 'Magnetic Gray', mpg: '18/22' }),
  car('model3_22', 'Electric', 25995, 22900, { year: 2022, make: 'Tesla', model: 'Model 3', trim: 'RWD', miles: 31500, body: 'Sedan', drivetrain: 'RWD', engine: 'Electric', transmission: 'Single-speed', exterior: 'Pearl White', rangeMi: 272 }, 'Battery health report available. We do not promise any tax credit or rebate; check current rules.'),
  // F&I products: optional, separately priced, never pre-checked.
  fi('vsc', 'Vehicle Service Contract (3 yr / 36k mi)', 2195, 1100, 'Mechanical breakdown coverage from a third-party administrator; terms, deductible and exclusions are in the contract. Not a warranty.'),
  fi('gap', 'GAP Waiver', 795, 300, 'Covers the gap between insurance payout and loan balance after a total loss. Only useful when financed; refundable pro rata if the loan is paid off early (state rules vary).'),
  fi('tire_wheel', 'Tire & Wheel Protection (3 yr)', 699, 250, 'Road-hazard repair or replacement of tires and wheels.'),
  fi('appearance', 'Paint & Interior Protection', 499, 80, 'Sealant and fabric/leather treatment with a stain warranty.'),
  fi('key_replace', 'Key Replacement Plan', 399, 120, 'Replaces lost or damaged smart keys and fobs.'),
  fi('tint', 'Window Tint (sides and rear)', 299, 90, 'Installed to your state legal VLT limit. Front windshield strip only where allowed.'),
  { key: 'doc_fee', name: 'Documentation Fee', category: 'Fees', price: 399, costPrice: 0, kind: 'addon', addOnFor: ['*'], description: 'Title and paperwork processing. Capped in some states and must be disclosed or posted in others; set yours to your state rule.', taxClass: 'STANDARD' },
  { key: 'temp_tag', name: 'Temporary Tag', category: 'Fees', price: 25, costPrice: 5, kind: 'addon', addOnFor: ['*'], description: 'State temporary registration. Fee set by your state; title and registration are pass-through.', taxClass: 'EXEMPT' },
  // Services
  { key: 'test_drive', name: 'Test Drive Appointment', category: 'Services', price: 0, kind: 'service', durationMin: 30, description: 'Bring your driver license and proof of insurance. Free.', requires: 'TEST_DRIVES' },
  { key: 'appraisal', name: 'Trade-In Appraisal', category: 'Services', price: 0, kind: 'service', durationMin: 20, description: 'Walkaround appraisal and a written offer good for 7 days or 300 miles. Free.' },
  { key: 'detail', name: 'Full Detail', category: 'Services', price: 199, costPrice: 60, kind: 'service', durationMin: 180, description: 'Interior shampoo, exterior wash, clay and wax.' },
];

const dealership: VerticalPack = {
  id: 'car_dealership',
  version: 1,
  parent: 'RETAIL',
  label: 'Car Dealership',
  blurb: 'Independent used-car lot. Vehicles as inventory, test drives, a deal pipeline from lead to delivery, optional F&I add-ons and honest pricing.',
  icon: 'Car',
  color: '#D40055',
  clinical: false,
  vocabulary: {
    customer: 'customer', customers: 'customers',
    staff: 'salesperson', staffPlural: 'salespeople',
    catalogNoun: 'Vehicles', catalogNounSingular: 'vehicle',
    orderNoun: 'deal', orderNounPlural: 'deals',
    checkoutVerb: 'Write deal',
  },
  capabilities: [
    { id: 'POS', importance: 'core', why: 'Take deposits and down payments.' },
    { id: 'INVENTORY', importance: 'core' },
    { id: 'VEHICLE_INVENTORY', importance: 'core', why: 'One item per vehicle, stock 1, specs on the item.' },
    { id: 'CRM_PIPELINE', importance: 'core', why: 'Lead to test drive to deal to delivery.' },
    { id: 'TEST_DRIVES', importance: 'core', why: 'Book test drives as appointments.' },
    { id: 'VIN_DECODE', importance: 'nice', why: 'Decode VINs when taking in a vehicle or trade (free NHTSA data).' },
    { id: 'RECALL_CHECK', importance: 'nice', why: 'Disclose open safety recalls before sale.' },
    { id: 'VEHICLE_RECORDS', importance: 'nice', why: 'Keep mileage and history per VIN.' },
    { id: 'FINANCING', importance: 'nice', why: 'Credit apps and lender submissions.' },
    { id: 'DEPOSITS', importance: 'nice', why: 'Hold a vehicle with a deposit.' },
    { id: 'TAX', importance: 'nice', why: 'Vehicle sales tax is usually collected at titling.' },
    { id: 'ONLINE_STORE', importance: 'nice', why: 'Show inventory on your page.' },
    { id: 'MESSAGING', importance: 'nice' }, { id: 'REMINDERS', importance: 'nice' }, { id: 'DEALS', importance: 'nice' },
    { id: 'LOYALTY', importance: 'nice' }, { id: 'SIGNAGE', importance: 'nice' }, { id: 'STAFF_ROLES', importance: 'nice' },
  ],
  tabs: ['OVERVIEW', 'INVENTORY', 'CRM', 'APPOINTMENTS', 'ORDERS', 'MESSAGING', 'TEAM', 'SIGNAGE', 'SETTINGS'],
  publicSections: ['products', 'book', 'gallery', 'hours', 'amenities'],
  defaultHours: week(['09:00', '19:00'], { saturday: { open: '09:00', close: '18:00' }, sunday: 'closed' }),
  pageDefaults: { isAcceptingOrders: false, crmEnabled: true, digitalSignageEnabled: false, radioServiceEnabled: false, priceRange: '$$$', amenities: ['parking', 'wifi', 'waiting_area'], tags: ['cars', 'used cars', 'dealership', 'trucks', 'suv'] },
  starterCatalog: {
    categories: [
      { name: 'Sedans', emoji: '🚗' }, { name: 'SUVs & Crossovers', emoji: '🚙' }, { name: 'Trucks', emoji: '🛻' },
      { name: 'Electric', emoji: '⚡' }, { name: 'F&I Products', emoji: '🛡️' }, { name: 'Fees', emoji: '🧾' }, { name: 'Services', emoji: '🔑' },
    ],
    items,
  },
  roles: [
    ownerRole('Dealer Principal'),
    managerRole('Sales Manager', 'Desks deals, approves pricing and trade values, manages the lot.'),
    { key: 'FI_MANAGER', label: 'F&I Manager', baseRole: 'ADMIN', description: 'Presents optional products, prepares contracts and titling paperwork.' },
    { key: 'SALES', label: 'Salesperson', baseRole: 'STAFF', description: 'Works leads, books test drives, writes up deals. No price changes.' },
    { key: 'BDC', label: 'BDC / Internet Rep', baseRole: 'STAFF', description: 'Answers web leads and sets appointments.' },
    { key: 'TITLE_CLERK', label: 'Title Clerk', baseRole: 'STAFF', description: 'Titles, registrations, temp tags and payoffs.' },
  ],
  loyalty: {
    rewardsEnabled: true, pointsPerDollar: 1,
    ladder: [{ points: 5000, reward: 'Free full detail' }, { points: 15000, reward: '$250 off your next vehicle' }, { points: 25000, reward: '$500 off your next vehicle' }],
  },
  deals: [
    { key: 'referral_250', label: '$250 off for referred buyers', kind: 'AMOUNT', value: 250, minSubtotalCents: 1000000, startActive: true, note: 'Applies to the vehicle price; some states limit referral payments to non-licensees.' },
    { key: 'military_500', label: '$500 military & first responder', kind: 'AMOUNT', value: 500, minSubtotalCents: 1500000, startActive: false, note: 'Verify ID before applying.' },
    { key: 'month_end', label: 'Month-end $1,000 off $25k+', kind: 'AMOUNT', value: 1000, minSubtotalCents: 2500000, startActive: false, note: 'Advertise the real price after discount; no "must finance with us" conditions without disclosing them.' },
  ],
  signage: [
    slide('Every price is the real price', 'No add-ons you did not ask for', '#33001a'),
    slide('Trade-in appraisal in 20 minutes', 'Written offer good for 7 days', '#001a33'),
    slide('Book a test drive', 'Bring your license and insurance card', '#1a0033'),
    slide('Open recalls? We check every VIN', 'Free NHTSA recall lookup before you buy', '#000'),
  ],
  hardware: [
    { name: 'Desk computer or tablet', why: 'Deals, CRM and paperwork.', required: true, approxUsd: 600 },
    { name: 'Card reader', why: 'Deposits and down payments (card limits apply; most down payments are ACH or certified funds).', required: true, approxUsd: 59 },
    { name: 'Laser printer', why: 'Buyers Guides, bills of sale, odometer statements.', required: true, approxUsd: 250 },
    { name: 'VIN barcode scanner', why: 'Scan door-jamb or windshield VINs at intake.', required: false, approxUsd: 90 },
    { name: 'Key lockbox / key management cabinet', why: 'Track keys on the lot.', required: false, approxUsd: 400 },
    { name: 'Dealer plates', why: 'Issued by your state for test drives and transport.', required: false },
  ],
  checklist: goLiveSteps({
    catalogNoun: 'Vehicles',
    testSaleLabel: 'Ring up a test deposit',
    extra: [
      { id: 'dealer_license', label: 'Add your dealer license number', detail: 'Most states require it on ads and paperwork. Plajah does not verify licenses.', minutes: 1, detect: 'MANUAL', tab: 'SETTINGS' },
      { id: 'doc_fee_rule', label: 'Set your doc fee to your state rule', detail: 'Doc fees are capped in some states and must be posted in others. Edit the Documentation Fee item.', minutes: 1, detect: 'MANUAL', tab: 'INVENTORY' },
      { id: 'buyers_guide', label: 'Buyers Guide on every vehicle', detail: 'Federal Used Car Rule: post the FTC Buyers Guide (As Is or Warranty) in each window. Use the FTC form; Plajah does not print it yet.', minutes: 0, detect: 'MANUAL', optional: true },
      { id: 'recall_check', label: 'Check open recalls on your lot', detail: 'Run the free NHTSA recall check on each VIN and disclose what you find.', minutes: 2, detect: 'MANUAL', requires: 'RECALL_CHECK', optional: true },
      { id: 'lenders', label: 'Lender connections', detail: 'No lender integration yet. Customers can bring outside financing; record the lender on the deal.', minutes: 0, detect: 'MANUAL', requires: 'FINANCING', optional: true },
    ],
  }),
  automations: [
    { id: 'lead_followup', kind: 'STAGE_NOTIFY', label: 'Follow up a new lead within 15 minutes', params: { stage: 'lead', minutes: 15 }, requires: 'CRM_PIPELINE' },
    { id: 'test_drive_reminder', kind: 'REMINDER', label: 'Test drive reminder', params: { hoursBefore: 3 }, requires: 'REMINDERS' },
    { id: 'lost_deal_winback', kind: 'WINBACK', label: 'Check in with shoppers who did not buy', params: { afterDays: 10 }, requires: 'CRM_PIPELINE' },
    { id: 'aged_inventory', kind: 'REMINDER', label: 'Aged unit alert (on lot 60+ days)', params: { daysOnLot: 60 } },
    { id: 'first_service', kind: 'SERVICE_DUE', label: 'First oil change after purchase', params: { miles: 5000, months: 6 }, requires: 'VEHICLE_RECORDS' },
  ],
  stages: [
    { id: 'lead', label: 'Lead' },
    { id: 'test_drive', label: 'Test drive', notifyCustomer: true },
    { id: 'working', label: 'Working deal' },
    { id: 'fi', label: 'F&I / paperwork' },
    { id: 'delivered', label: 'Delivered', notifyCustomer: true },
  ],
  jobFields: [
    { id: 'vin', label: 'VIN', type: 'text' },
    { id: 'stock_no', label: 'Stock #', type: 'text' },
    { id: 'trade_in', label: 'Trade-in (year / make / model / miles)', type: 'text' },
    { id: 'trade_vin', label: 'Trade-in VIN', type: 'text' },
    { id: 'trade_payoff', label: 'Trade-in payoff ($)', type: 'number' },
    { id: 'financing', label: 'Financing', type: 'select', options: ['Cash', 'Outside lender', 'Dealer-arranged', 'Buy here pay here'] },
    { id: 'lender', label: 'Lender', type: 'text' },
    { id: 'down_payment', label: 'Down payment ($)', type: 'number' },
  ],
  policies: [
    { id: 'pricing', label: 'Pricing', text: 'Advertised prices are the full price of the vehicle before tax, title, registration and our disclosed documentation fee. Add-on products are optional and never required to buy or finance.' },
    { id: 'buyers_guide', label: 'Buyers Guide', text: 'Every used vehicle has a federal Buyers Guide in the window showing whether it is sold As Is or with a warranty. The Buyers Guide is part of your contract.' },
    { id: 'deposits', label: 'Deposits', text: 'A deposit holds a vehicle for 48 hours. Deposits are refundable if we cannot complete the sale as agreed.' },
    { id: 'recalls', label: 'Recalls', text: 'We check every VIN for open safety recalls with NHTSA and tell you what we find. Recall repairs are free at a franchised dealer of that brand.' },
    { id: 'license', label: 'Licensing', text: 'Licensed and bonded motor vehicle dealer. License number shown on our page and paperwork.' },
    { id: 'privacy', label: 'Customer information', text: 'We do not take credit applications through Plajah. Any financing paperwork is handled by the lender under its own privacy policy.' },
  ],
  extras: {
    vehicleSpecs: SPECS,
    docFeeDefault: 399,
    buyersGuide: 'FTC Used Car Rule (16 CFR 455): Buyers Guide on every used vehicle offered for sale.',
    carsRuleNote: 'FTC CARS Rule vacated by the Fifth Circuit (Jan 2025); pack still follows its pricing and add-on consent practices.',
    holdHours: 48,
  },
};

export default dealership;
