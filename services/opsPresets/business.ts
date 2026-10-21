/**
 * Business ops presets, keyed by vertical-pack id (services/verticalPacks) with a fallback per coarse vertical.
 * Real-world notes are inline where a number or a rule matters (e.g. FTC rules for dealers, fair housing).
 */
import type { OpsPreset, CrmField } from './types';
import {
  COMMON_SEGMENTS, T, baseCorrespondence, cadence, customerLifecycle, duty, ev, localPlays, lost, play, prepSpine, promoSpine, social, stage, won,
} from './base';

const ALL_FEEDS = ['PRODUCT', 'MENU', 'DEAL', 'EVENT', 'NOW_PLAYING'] as const;

// ── Grocery store (full service) ──────────────────────────────────────────
const supermarket: OpsPreset = {
  id: 'supermarket', label: 'Grocery Store', accent: '#06D6A0',
  events: [
    ev({ key: 'tasting_saturday', label: 'Saturday tasting', emoji: '🧀', blurb: 'Vendor sampling at the end caps; sales follow the samples.', format: 'IN_PERSON', durationMin: 240, tiers: [], merchTieIn: 'Deli',
      runOfShow: [{ t: '10:00', what: 'Tables up at end caps, samples portioned', owner: 'Deli lead' }, { t: '11:00', what: 'Sampling opens; signage flips to featured items', owner: 'Front end' }, { t: '14:00', what: 'Restock featured SKUs', owner: 'Grocery lead' }],
      checklist: [...prepSpine, { daysBefore: 14, task: 'Confirm vendor demo reps and sample product', owner: 'Grocery lead' }],
      promo: promoSpine('Saturday tasting') }),
    ev({ key: 'farmers_market', label: 'Parking-lot farmers market', emoji: '🥕', blurb: 'Local growers outside, your produce inside. Monthly in season.', format: 'IN_PERSON', durationMin: 300, tiers: [], merchTieIn: 'Produce',
      runOfShow: [{ t: '07:00', what: 'Vendor load-in', owner: 'Manager' }, { t: '08:00', what: 'Market opens', owner: 'Manager' }, { t: '13:00', what: 'Load-out, lot sweep', owner: 'Manager' }],
      checklist: [...prepSpine, { daysBefore: 30, task: 'Vendor applications and certificates of insurance', owner: 'Owner' }], promo: promoSpine('Farmers market') }),
  ],
  crm: {
    contactNoun: 'shopper', tags: ['loyalty', 'catering', 'delivery', 'snap', 'wholesale'],
    pipelines: [customerLifecycle('shopper'), {
      id: 'catering', label: 'Catering & party trays', noun: 'order', valueLabel: 'Order value',
      stages: [stage('inquiry', 'Inquiry', 30, { slaDays: 1, nextAction: 'Call back with tray options' }), stage('quoted', 'Quoted', 60, { slaDays: 3 }), won('confirmed', 'Confirmed'), lost()],
    }],
    fields: [{ id: 'household_size', label: 'Household size', type: 'number' }, { id: 'diet', label: 'Dietary needs', type: 'select', options: ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher'] }],
    segments: [...COMMON_SEGMENTS, { id: 'catering_buyers', label: 'Catering buyers', rule: { tagsAny: ['catering'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'shopping with us', winback: 'take $5 off a $40 basket', postcard: ['Fresh every morning', 'Bring this card for $5 off $40. Produce delivered daily.'], push: 'This week’s specials just dropped at {{business_name}}.' }),
    T.followUp('catering_quote', 'Catering quote', 'quoted', 'Hi {{first_name}},\n\nHere is the quote for your party trays: {{deal}}. Order by 48 hours ahead and we will have it ready at the deli counter.')],
  social: social([
    { id: 'specials', label: 'Weekly specials', share: 35, ideas: ['This week’s ad in 15 seconds: the five deals worth the trip.', 'Meat-case special of the week, cut and wrapped while you wait.'] },
    { id: 'fresh', label: 'Fresh arrivals', share: 30, ideas: ['Truck day: what came in this morning.', 'Peak season produce and how to pick a ripe one.'] },
    { id: 'people', label: 'Our people', share: 20, ideas: ['Meet the butcher.', 'Behind the bakery at 4 a.m.'] },
    { id: 'recipes', label: 'Recipes from the aisles', share: 15, ideas: ['Dinner for four under $20, all from aisle 5.', 'Three lunches from one rotisserie chicken.'] },
  ], ['#shoplocal', '#grocery', '#freshproduce'], cadence(4, 4, 2, 5)),
  marketing: [...localPlays({ offer: '$5 off your next $40 basket. Fresh produce daily.', billboard: 'Fresh groceries. Next exit.', sub: 'Open 7 days' }),
    play({ id: 'weekly_ad', label: 'Weekly ad mailer', objective: 'sales', channels: ['eddm'], budgetCents: 180000, durationDays: 7, radiusMi: 3, headline: 'This week’s specials', body: 'Feature 8 to 12 loss leaders; prices valid Wednesday to Tuesday.', cta: 'Prices good this week', when: 'Weekly or biweekly', mail: { format: 'eddm_flat', list: 'eddm_routes' } })],
  commerce: { pos: true, kiosk: false, onlineStore: true, merchShop: false, signageFeeds: ['DEAL', 'MENU', 'PRODUCT', 'NOW_PLAYING'], menuBoardCategory: 'Deli', posQuickKeys: ['Produce', 'Bakery', 'Deli'],
    note: 'Price edits in Inventory reach every lane, the online store and the deli price board at once; deals appear on screens the moment they go live.' },
  staffToday: [duty('Cashier', ['Open your drawer', 'Ring sales and loyalty lookups', 'Bag and age-check'], 'ORDERS'), duty('Grocery lead', ['Receive the truck', 'Work low-stock list', 'Face the shelves'], 'INVENTORY'), duty('Deli lead', ['Catering orders due today', 'Update the deli board', 'Temp logs'], 'CRM')],
};

// ── Corner store ──────────────────────────────────────────────────────────
const cornerStore: OpsPreset = {
  ...supermarket, id: 'grocery_corner_store', label: 'Corner Store & Convenience', accent: '#06D6A0',
  events: [ev({ key: 'block_party', label: 'Block party / customer appreciation', emoji: '🎉', blurb: 'Free hot dogs, music and a raffle out front. Builds the regulars.', format: 'IN_PERSON', durationMin: 180, tiers: [], merchTieIn: 'Beverages',
    runOfShow: [{ t: '15:00', what: 'Grill and speaker set up', owner: 'Owner' }, { t: '16:00', what: 'Party starts; raffle sign-ups (CRM)', owner: 'Clerk' }, { t: '18:30', what: 'Raffle draw', owner: 'Owner' }],
    checklist: [...prepSpine, { daysBefore: 21, task: 'Check city permit for sidewalk use', owner: 'Owner' }], promo: promoSpine('Block party') })],
  crm: { ...supermarket.crm, contactNoun: 'regular', pipelines: [customerLifecycle('regular')] },
  correspondence: baseCorrespondence({ what: 'stopping by', winback: 'grab a free coffee on us', push: 'Today’s deal at the counter: come see.' }),
  social: social([
    { id: 'deals', label: 'Deals at the counter', share: 40, ideas: ['2-for deals on drinks this week.', 'New snacks just landed.'] },
    { id: 'neighborhood', label: 'Neighborhood', share: 35, ideas: ['Shout-out to our regulars.', 'Open late tonight.'] },
    { id: 'store', label: 'Around the store', share: 25, ideas: ['Cold case restocked.', 'Coffee is fresh, $1.50 any size before 9.'] },
  ], ['#cornerstore', '#bodega', '#shoplocal'], cadence(3, 3, 2, 4)),
  marketing: localPlays({ offer: 'Free coffee with any purchase, this month.', billboard: 'Cold drinks. Hot coffee. Right here.' }),
  commerce: { ...supermarket.commerce, menuBoardCategory: 'Deli & Ready', posQuickKeys: ['Beverages', 'Snacks', 'Deli & Ready'], note: 'One catalog drives the register, the counter screen and the online store; sold-out items drop off the screens automatically.' },
  staffToday: [duty('Clerk', ['Open drawer and count', 'Age-check every tobacco/alcohol sale', 'Restock cooler at 2 p.m.'], 'ORDERS'), duty('Owner', ['Order from suppliers', 'Review low stock', 'Post today’s deal'], 'INVENTORY')],
};

// ── Furniture store ───────────────────────────────────────────────────────
const furniture: OpsPreset = {
  id: 'furniture_store', label: 'Furniture Store', accent: '#D40055',
  events: [
    ev({ key: 'showroom_open_house', label: 'Showroom open house', emoji: '🛋️', blurb: 'Designer on the floor, room makeovers, light bites. Brings in browsers who become buyers.', format: 'IN_PERSON', durationMin: 240, tiers: [], merchTieIn: 'Living Room',
      runOfShow: [{ t: '10:00', what: 'Vignettes staged; signage on the new collection', owner: 'Merchandiser' }, { t: '11:00', what: 'Doors; designer consults by the hour', owner: 'Sales lead' }, { t: '14:00', what: 'Raffle for a free accent chair (CRM sign-ups)', owner: 'Owner' }],
      checklist: [...prepSpine, { daysBefore: 21, task: 'Book an interior designer for consults', owner: 'Owner' }], promo: promoSpine('Showroom open house') }),
    ev({ key: 'holiday_sale', label: 'Holiday weekend sale', emoji: '🏷️', blurb: 'Memorial Day, July 4th, Labor Day, Black Friday: the four weekends that make the year.', format: 'IN_PERSON', durationMin: 600, tiers: [],
      runOfShow: [{ t: '09:00', what: 'Sale tags and signage live', owner: 'Manager' }, { t: '10:00', what: 'Doors', owner: 'Sales' }], checklist: prepSpine, promo: [...promoSpine('Holiday sale'), { daysBefore: 14, channel: 'mail', copy: 'Mailer to past buyers with the doorbuster.' }, { daysBefore: 10, channel: 'billboard', copy: 'Billboard flight starts.' }] }),
  ],
  crm: {
    contactNoun: 'customer', tags: ['designer', 'trade', 'financing', 'delivery', 'special order'],
    pipelines: [{
      id: 'sales', label: 'Showroom sales', noun: 'opportunity', valueLabel: 'Ticket',
      stages: [stage('browsing', 'Browsing', 15, { slaDays: 3, nextAction: 'Send the pieces they liked', templateId: 'room_followup' }), stage('quoted', 'Quote sent', 45, { slaDays: 5 }), stage('measured', 'Measured / swatches', 65), won('sold', 'Sold'), lost()],
    }, {
      id: 'delivery', label: 'Orders & delivery', noun: 'order',
      stages: [stage('ordered', 'Ordered', 100, { slaDays: 14 }), stage('in_transit', 'In transit', 100), stage('received', 'Received', 100, { nextAction: 'Call to schedule delivery', templateId: 'delivery_schedule' }), stage('scheduled', 'Delivery scheduled', 100), won('delivered', 'Delivered', { templateId: 'thank_you_letter' })],
    }, customerLifecycle()],
    fields: [{ id: 'room', label: 'Room', type: 'select', options: ['Living', 'Bedroom', 'Dining', 'Office', 'Outdoor'] }, { id: 'style', label: 'Style', type: 'text' }, { id: 'budget', label: 'Budget', type: 'currency' }, { id: 'move_in', label: 'Move-in date', type: 'date' }],
    segments: [...COMMON_SEGMENTS, { id: 'open_quotes', label: 'Open quotes', rule: { pipelineId: 'sales', stageIn: ['quoted', 'measured'] } }, { id: 'trade', label: 'Designers & trade', rule: { tagsAny: ['designer', 'trade'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'choosing us for your home', winback: 'enjoy free delivery on your next order', postcard: ['Room by room, made easy', 'Free design consult and $100 off $1,000. Bring this card.'] }),
    T.followUp('room_followup', 'Pieces you loved', 'browsing', 'Hi {{first_name}},\n\nIt was great helping you today. Here are the pieces we talked about for your {{custom.room}} room. Want me to hold swatches or measure the space?'),
    T.followUp('delivery_schedule', 'Schedule delivery', 'received', 'Hi {{first_name}},\n\nGood news: your order is in. Reply with two delivery windows that work and we will confirm the white-glove crew.', 'Your furniture has arrived')],
  social: social([
    { id: 'rooms', label: 'Styled rooms', share: 40, ideas: ['One sofa, three looks.', 'Small-space living room under $1,500.'] },
    { id: 'arrivals', label: 'New arrivals', share: 25, ideas: ['Just unboxed on the floor.', 'Fabric swatches for fall.'] },
    { id: 'homes', label: 'Customer homes', share: 20, ideas: ['Delivered this week (with permission).', 'Before and after.'] },
    { id: 'care', label: 'Care & tips', share: 15, ideas: ['How to measure for a sectional.', 'Caring for performance fabric.'] },
  ], ['#homedecor', '#furniture', '#interiordesign'], cadence(5, 3, 3, 4)),
  marketing: [...localPlays({ offer: 'Free design consult and $100 off $1,000.', billboard: 'Your living room called.', sub: 'Showroom open daily' }),
    play({ id: 'mover_mail', label: 'New-mover mailer', objective: 'sales', channels: ['direct_mail'], budgetCents: 60000, durationDays: 30, radiusMi: 10, headline: 'Welcome home', body: 'New homeowners furnish within 90 days. Send a welcome offer.', cta: 'Visit the showroom', when: 'Monthly', mail: { format: 'postcard_6x11', list: 'uploaded' } })],
  commerce: { pos: true, kiosk: false, onlineStore: true, merchShop: false, signageFeeds: ['PRODUCT', 'DEAL', 'EVENT'], posQuickKeys: ['Living Room', 'Bedroom', 'Delivery & Assembly'],
    note: 'Floor models and special orders share one catalog; a sale on the floor updates the website and the showroom screens, and delivery jobs land in the CRM delivery board.' },
  staffToday: [duty('Sales associate', ['Follow up yesterday’s browsers', 'Write quotes', 'Ring sales and delivery'], 'CRM'), duty('Delivery lead', ['Today’s route', 'Call tomorrow’s customers', 'Mark delivered'], 'CRM'), duty('Merchandiser', ['Tag new arrivals', 'Update floor signage'], 'SIGNAGE')],
};

// ── Car dealership ────────────────────────────────────────────────────────
const dealerFields: CrmField[] = [
  { id: 'vehicle', label: 'Vehicle of interest', type: 'text' }, { id: 'stock_no', label: 'Stock #', type: 'text' },
  { id: 'trade', label: 'Trade-in (year/make/model/miles)', type: 'text' }, { id: 'budget', label: 'Monthly budget', type: 'currency' },
  { id: 'financing', label: 'Financing', type: 'select', options: ['Cash', 'Finance', 'Lease', 'Outside lender', 'Undecided'] },
  { id: 'timeline', label: 'Buying timeline', type: 'select', options: ['This week', 'This month', '1–3 months', 'Just looking'] },
];
const dealership: OpsPreset = {
  id: 'car_dealership', label: 'Car Dealership', accent: '#5B8DEF',
  events: [
    ev({ key: 'sales_event', label: 'Weekend sales event', emoji: '🚗', blurb: 'Tent, food truck, extended hours, test-drive raffle. Pre-book appointments to make it count.', format: 'IN_PERSON', durationMin: 540, tiers: [],
      runOfShow: [{ t: '08:30', what: 'Lot line-up, featured units on the front row, signage live', owner: 'Sales manager' }, { t: '09:00', what: 'Doors; appointment board', owner: 'BDC' }, { t: '18:00', what: 'Recap: units, gross, follow-ups owed', owner: 'Sales manager' }],
      checklist: [...prepSpine, { daysBefore: 10, task: 'Confirm advertised prices exclude only government fees (state ad rules)', owner: 'GM' }],
      promo: [...promoSpine('Weekend sales event'), { daysBefore: 12, channel: 'mail', copy: 'Conquest mailer to equity customers.' }, { daysBefore: 7, channel: 'billboard', copy: 'Billboard: the event dates and one hero unit.' }] }),
    ev({ key: 'cars_coffee', label: 'Cars & Coffee', emoji: '☕', blurb: 'Monthly enthusiast meet in your lot. Low cost, high goodwill, future buyers.', format: 'IN_PERSON', durationMin: 150, tiers: [],
      runOfShow: [{ t: '08:00', what: 'Coffee up, cones out', owner: 'Porter' }, { t: '08:30', what: 'Meet', owner: 'Sales' }], checklist: prepSpine, promo: promoSpine('Cars & Coffee') }),
  ],
  crm: {
    contactNoun: 'customer', tags: ['internet lead', 'walk-in', 'phone', 'trade', 'service customer', 'repeat'],
    pipelines: [{
      id: 'sales', label: 'Vehicle sales', noun: 'deal', valueLabel: 'Front gross',
      stages: [
        stage('lead', 'New lead', 10, { slaDays: 1, nextAction: 'Respond within 15 minutes', templateId: 'lead_response' }),
        stage('appointment', 'Appointment set', 30, { slaDays: 2, templateId: 'appt_confirm' }),
        stage('test_drive', 'Test drive', 50, { slaDays: 2 }),
        stage('working', 'Working the deal', 70, { slaDays: 3 }),
        stage('fi', 'F&I', 90, { slaDays: 1 }),
        won('delivered', 'Delivered', { templateId: 'thank_you_letter' }), lost('lost', 'Lost / bought elsewhere'),
      ],
    }, {
      id: 'service_to_sales', label: 'Service-to-sales', noun: 'opportunity',
      stages: [stage('equity', 'Equity position', 20, { nextAction: 'Run payoff vs. trade value' }), stage('contacted', 'Contacted', 40), won('traded', 'Traded in'), lost()],
    }],
    fields: dealerFields,
    segments: [...COMMON_SEGMENTS, { id: 'hot', label: 'Buying this week', rule: { pipelineId: 'sales', stageIn: ['appointment', 'test_drive', 'working'] } }, { id: 'lease_end', label: 'Service customers (equity)', rule: { tagsAny: ['service customer'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'choosing us for your vehicle', winback: 'get a free appraisal on your current car', postcard: ['Your car is worth more than you think', 'Bring this card for a free, no-obligation appraisal.'] }),
    T.followUp('lead_response', 'Internet lead response', 'lead', 'Hi {{first_name}},\n\nThanks for asking about the {{custom.vehicle}}. It is here and available. Would today or tomorrow work for a test drive? I will have it pulled up front.', 'About the {{custom.vehicle}}'),
    T.followUp('appt_confirm', 'Appointment confirmation', 'appointment', 'Hi {{first_name}},\n\nYou are confirmed for {{next_action}}. Bring your license and insurance card; if you are trading in, bring the title or payoff info.', 'You’re confirmed'),
    T.reminder('service_due', 'First service reminder', 'Hi {{first_name}}, your first service is coming up. Book it at {{business_name}}.')],
  social: social([
    { id: 'inventory', label: 'Fresh inventory', share: 40, ideas: ['Just landed: walkaround in 30 seconds.', 'Under $15k and ready to go.'] },
    { id: 'deliveries', label: 'Happy deliveries', share: 30, ideas: ['Congrats to today’s new owners (with permission).', 'First car keys moment.'] },
    { id: 'howto', label: 'Buyer education', share: 20, ideas: ['What to bring when you buy.', 'Lease vs. finance in a minute.'] },
    { id: 'team', label: 'The team', share: 10, ideas: ['Meet our service advisor.', 'Saturday on the lot.'] },
  ], ['#cars', '#dealership', '#newcar'], cadence(5, 5, 4, 4)),
  marketing: [...localPlays({ offer: 'Free appraisal and $500 over book on your trade.', billboard: 'Trade up today.', sub: 'Exit now' }),
    play({ id: 'conquest_mail', label: 'Conquest / equity mailer', objective: 'sales', channels: ['direct_mail'], budgetCents: 220000, durationDays: 21, radiusMi: 15, headline: 'We want your car', body: 'Personalized trade offer to owners in your market area. Advertised offers must disclose terms (FTC / state ad rules).', cta: 'Call for your appraisal', when: 'Monthly', mail: { format: 'letter', list: 'uploaded' } }),
    play({ id: 'search_inventory', label: 'Inventory search ads', objective: 'traffic', channels: ['google', 'meta'], budgetCents: 150000, durationDays: 30, radiusMi: 30, headline: 'Used cars near you', body: 'Vehicle listing ads from your live inventory.', cta: 'See it today', when: 'Always on' })],
  commerce: { pos: true, kiosk: false, onlineStore: true, merchShop: true, signageFeeds: ['PRODUCT', 'DEAL', 'EVENT'], posQuickKeys: ['F&I Products', 'Fees'],
    note: 'Each vehicle is one inventory unit: sell it at the desk and it leaves the website, the showroom screens and ad feeds at once. Dealership-branded merch sells from the same register.' },
  staffToday: [duty('Salesperson', ['Leads older than 15 minutes', 'Today’s appointments', 'Log every test drive'], 'CRM'), duty('BDC', ['Confirm tomorrow’s appointments', 'Work the equity list'], 'CRM'), duty('Sales manager', ['Desk deals', 'Approve trade values', 'Recap at close'], 'ORDERS'), duty('Lot porter', ['Front-row line-up', 'Swap sold units on screens'], 'SIGNAGE')],
};

// ── Event venue ───────────────────────────────────────────────────────────
const venue: OpsPreset = {
  id: 'event_venue', label: 'Event Venue', accent: '#00B4D8',
  events: [
    ev({ key: 'ticketed_show', label: 'Ticketed show / concert', emoji: '🎤', blurb: 'Tiered tickets, bar packages, door ops with scanner and kiosk.', format: 'IN_PERSON', durationMin: 240, capacity: 300,
      tiers: [{ name: 'Early bird', price: 20, qty: 50 }, { name: 'General admission', price: 28, qty: 220 }, { name: 'VIP (balcony + drink)', price: 60, qty: 30, perks: 'Reserved balcony, one drink, early entry' }],
      runOfShow: [{ t: '16:00', what: 'Load-in and sound check', owner: 'Production manager' }, { t: '18:30', what: 'Staff briefing; scanner and POS test', owner: 'House manager' }, { t: '19:00', what: 'Doors', owner: 'Box office' }, { t: '20:00', what: 'Opener', owner: 'Stage manager' }, { t: '21:00', what: 'Headliner', owner: 'Stage manager' }, { t: '23:00', what: 'Settlement with the artist', owner: 'Owner' }],
      checklist: [...prepSpine, { daysBefore: 30, task: 'Artist contract, rider and settlement terms signed', owner: 'Talent buyer' }, { daysBefore: 7, task: 'Security, bar and box-office staffing set', owner: 'House manager' }],
      promo: [...promoSpine('the show'), { daysBefore: 21, channel: 'billboard', copy: 'Digital billboard with the headliner and date.' }], merchTieIn: 'Bar Packages' }),
    ev({ key: 'private_booking', label: 'Private booking (wedding, corporate)', emoji: '💍', blurb: 'Hold → contract → deposit → final count → event → settlement. RSVP for the client’s guests.', format: 'IN_PERSON', durationMin: 360, tiers: [],
      runOfShow: [{ t: '-2h', what: 'Vendor load-in (caterer, florist, DJ)', owner: 'Event captain' }, { t: '0:00', what: 'Guests arrive', owner: 'Event captain' }, { t: '+5h', what: 'Last call', owner: 'Bar lead' }, { t: '+6h', what: 'Load-out and walkthrough', owner: 'Event captain' }],
      checklist: [{ daysBefore: 180, task: 'Signed contract and deposit', owner: 'Sales manager' }, { daysBefore: 30, task: 'Final menu, layout and timeline', owner: 'Event captain' }, { daysBefore: 14, task: 'Final guest count and balance due', owner: 'Sales manager' }, { daysBefore: 3, task: 'Vendor COIs on file', owner: 'Event captain' }, { daysBefore: -1, task: 'Return damage deposit; request review', owner: 'Sales manager' }],
      promo: [{ daysBefore: 30, channel: 'evite', copy: 'Client sends invitations from their event page.' }] }),
    ev({ key: 'open_house', label: 'Venue open house', emoji: '🗝️', blurb: 'Tours, tastings and vendor tables for couples and planners. Fills next year’s calendar.', format: 'IN_PERSON', durationMin: 180, tiers: [],
      runOfShow: [{ t: '17:00', what: 'Spaces staged as weddings and corporate', owner: 'Sales manager' }, { t: '18:00', what: 'Tours every 20 minutes; leads into CRM', owner: 'Sales team' }], checklist: prepSpine, promo: promoSpine('Venue open house') }),
  ],
  crm: {
    contactNoun: 'client', tags: ['wedding', 'corporate', 'nonprofit', 'promoter', 'planner', 'repeat'],
    pipelines: [{
      id: 'bookings', label: 'Private bookings', noun: 'booking', valueLabel: 'Contract value',
      stages: [stage('inquiry', 'Inquiry', 10, { slaDays: 1, nextAction: 'Send availability and packages', templateId: 'venue_inquiry' }), stage('tour', 'Tour booked', 30, { slaDays: 7 }),
        stage('hold', 'Date on hold', 50, { slaDays: 7, nextAction: 'Hold expires in 7 days', templateId: 'hold_expiring' }), stage('contract', 'Contract sent', 70, { slaDays: 5 }),
        won('deposit', 'Deposit paid', { templateId: 'booking_confirmed' }), lost()],
    }, {
      id: 'shows', label: 'Shows & promoters', noun: 'show',
      stages: [stage('pitch', 'Pitch / avail', 20), stage('offer', 'Offer out', 50), stage('confirmed', 'Confirmed', 90), won('settled', 'Settled'), lost('passed', 'Passed')],
    }],
    fields: [{ id: 'event_date', label: 'Event date', type: 'date' }, { id: 'guests', label: 'Guest count', type: 'number' }, { id: 'space', label: 'Space', type: 'text' }, { id: 'budget', label: 'Budget', type: 'currency' }, { id: 'event_type', label: 'Event type', type: 'select', options: ['Wedding', 'Corporate', 'Birthday', 'Fundraiser', 'Concert', 'Other'] }],
    segments: [...COMMON_SEGMENTS, { id: 'open_holds', label: 'Open holds', rule: { pipelineId: 'bookings', stageIn: ['hold', 'contract'] } }, { id: 'planners', label: 'Planners & promoters', rule: { tagsAny: ['planner', 'promoter'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'celebrating with us', winback: 'book your next event with the deposit waived', postcard: ['Your date is waiting', 'Tour the venue this month and save 10% on Friday and Sunday dates.'] }),
    T.followUp('venue_inquiry', 'Inquiry reply', 'inquiry', 'Hi {{first_name}},\n\nThank you for thinking of us for your {{custom.event_type}}. {{custom.event_date}} is currently open. I have attached our packages; the fastest next step is a 20-minute tour.', 'Your date at {{business_name}}'),
    T.followUp('hold_expiring', 'Hold expiring', 'hold', 'Hi {{first_name}},\n\nJust a heads-up: we are holding {{custom.event_date}} for you for a few more days. Shall I send the contract?', 'Your date hold'),
    T.followUp('booking_confirmed', 'Booking confirmed', 'deposit', 'Hi {{first_name}},\n\nIt is official: your event is on our calendar. Your event captain will reach out 30 days before for the final details.', 'You’re booked!')],
  social: social([
    { id: 'shows', label: 'Upcoming shows', share: 35, ideas: ['On sale now: the next four weeks.', 'Last tickets for Saturday.'] },
    { id: 'spaces', label: 'Spaces & setups', share: 25, ideas: ['Same room, three setups: ceremony, dinner, dance.', 'Golden hour on the patio.'] },
    { id: 'recaps', label: 'Event recaps', share: 25, ideas: ['Last night in 20 seconds.', 'Real wedding feature (with permission).'] },
    { id: 'backstage', label: 'Backstage', share: 15, ideas: ['Load-in timelapse.', 'Meet the bar team.'] },
  ], ['#eventvenue', '#livemusic', '#weddingvenue'], cadence(5, 4, 4, 5)),
  marketing: [...localPlays({ offer: 'Tour this month and save 10% on Friday and Sunday dates.', billboard: 'Live music this weekend.', sub: 'Tickets on Plajah' }),
    play({ id: 'show_flight', label: 'Show on-sale flight', objective: 'event', channels: ['meta', 'tiktok', 'billboard_dooh'], budgetCents: 80000, durationDays: 21, radiusMi: 25, headline: 'On sale now', body: 'Headliner, date, one image, ticket link.', cta: 'Get tickets', when: 'Each on-sale', billboard: { line: 'Live this Saturday', sub: 'Tickets on Plajah' } })],
  commerce: { pos: true, kiosk: true, onlineStore: true, merchShop: true, signageFeeds: ['EVENT', 'MENU', 'DEAL', 'NOW_PLAYING'], menuBoardCategory: 'Bar Packages', posQuickKeys: ['Bar', 'Merch', 'Tickets'],
    note: 'Tickets, bar and merch ring on one register; the bar menu board and the "tonight" screen update from inventory and the event calendar.' },
  staffToday: [duty('House manager', ['Tonight’s run of show', 'Staff check-in', 'Door count'], 'EVENTS'), duty('Box office', ['Will-call list', 'Scanner and kiosk test'], 'EVENTS'), duty('Bar lead', ['Par levels', 'Bar board prices', 'Close-out'], 'INVENTORY'), duty('Sales manager', ['Inquiries under 24 hours', 'Holds expiring', 'Tours today'], 'CRM')],
};

// ── Event planner ─────────────────────────────────────────────────────────
const planner: OpsPreset = {
  id: 'event_planner', label: 'Event Planner', accent: '#D40055',
  events: [
    ev({ key: 'wedding', label: 'Wedding (full planning)', emoji: '💐', blurb: '12-month timeline, vendor team, guest RSVP and a day-of run sheet.', format: 'IN_PERSON', durationMin: 420, tiers: [],
      runOfShow: [{ t: '10:00', what: 'Vendor arrivals, florals install', owner: 'Lead planner' }, { t: '15:30', what: 'Ceremony', owner: 'Lead planner' }, { t: '16:00', what: 'Cocktail hour', owner: 'Assistant' }, { t: '17:15', what: 'Grand entrance, dinner, toasts', owner: 'Lead planner' }, { t: '22:30', what: 'Send-off and vendor load-out', owner: 'Assistant' }],
      checklist: [{ daysBefore: 365, task: 'Budget, guest estimate, venue shortlist', owner: 'Lead planner' }, { daysBefore: 300, task: 'Book venue, photographer, caterer', owner: 'Lead planner' }, { daysBefore: 180, task: 'Save-the-dates out (evite)', owner: 'Client' }, { daysBefore: 60, task: 'Invitations out; RSVP open', owner: 'Client' }, { daysBefore: 21, task: 'Final count to caterer; seating chart', owner: 'Lead planner' }, { daysBefore: 7, task: 'Vendor confirmations and timeline to all', owner: 'Assistant' }, { daysBefore: -3, task: 'Thank-you and review request', owner: 'Lead planner' }],
      promo: [{ daysBefore: 180, channel: 'evite', copy: 'Save-the-date' }, { daysBefore: 60, channel: 'evite', copy: 'Formal invitation with RSVP' }] }),
    ev({ key: 'corporate', label: 'Corporate event / conference', emoji: '🏢', blurb: 'Registration, badges, sessions and sponsor tables. Ticketed or invite-only.', format: 'HYBRID', durationMin: 480, capacity: 200,
      tiers: [{ name: 'Attendee', price: 149, qty: 180 }, { name: 'Sponsor table', price: 1500, qty: 10, perks: 'Table, two passes, logo on screens' }],
      runOfShow: [{ t: '07:30', what: 'Registration and badges (kiosk)', owner: 'Registration lead' }, { t: '09:00', what: 'Welcome', owner: 'Producer' }, { t: '12:00', what: 'Lunch and sponsor hall', owner: 'Lead planner' }, { t: '17:00', what: 'Reception', owner: 'Lead planner' }],
      checklist: prepSpine, promo: promoSpine('the conference') }),
    ev({ key: 'birthday', label: 'Milestone party', emoji: '🎂', blurb: 'Theme, vendors and an RSVP page in one afternoon.', format: 'IN_PERSON', durationMin: 240, tiers: [],
      runOfShow: [{ t: '-1h', what: 'Decor install', owner: 'Assistant' }, { t: '0:00', what: 'Guests', owner: 'Lead planner' }], checklist: prepSpine, promo: [{ daysBefore: 30, channel: 'evite', copy: 'Invitations' }] }),
  ],
  crm: {
    contactNoun: 'client', tags: ['wedding', 'corporate', 'social', 'referral', 'venue partner', 'vendor'],
    pipelines: [{
      id: 'clients', label: 'Client pipeline', noun: 'event', valueLabel: 'Planning fee',
      stages: [stage('inquiry', 'Inquiry', 10, { slaDays: 1, templateId: 'planner_inquiry' }), stage('consult', 'Consult booked', 30, { slaDays: 7 }), stage('proposal', 'Proposal sent', 50, { slaDays: 5, templateId: 'proposal_followup' }),
        stage('contract', 'Contract signed', 85), stage('planning', 'Planning', 95), won('done', 'Event delivered', { templateId: 'review_request' }), lost()],
    }, {
      id: 'vendors', label: 'Vendor bench', noun: 'vendor',
      stages: [stage('prospect', 'Prospect', 20), stage('vetted', 'Vetted', 60), won('preferred', 'Preferred'), lost('retired', 'Retired')],
    }],
    fields: [{ id: 'event_date', label: 'Event date', type: 'date' }, { id: 'guests', label: 'Guest count', type: 'number' }, { id: 'budget', label: 'Total budget', type: 'currency' }, { id: 'venue', label: 'Venue', type: 'text' }, { id: 'vibe', label: 'Style / vibe', type: 'text' }],
    segments: [...COMMON_SEGMENTS, { id: 'this_season', label: 'Active clients', rule: { pipelineId: 'clients', stageIn: ['contract', 'planning'] } }, { id: 'referrers', label: 'Referral partners', rule: { tagsAny: ['venue partner', 'referral'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'trusting us with your day', winback: 'enjoy 10% off planning for your next celebration' }),
    T.followUp('planner_inquiry', 'Inquiry reply', 'inquiry', 'Hi {{first_name}},\n\nCongratulations! I would love to hear about your plans for {{custom.event_date}}. Here is a link to book a free 30-minute consult.', 'Let’s plan your event'),
    T.followUp('proposal_followup', 'Proposal follow-up', 'proposal', 'Hi {{first_name}},\n\nChecking in on the proposal. Happy to adjust the scope or walk through it on a quick call.', 'Your proposal')],
  social: social([
    { id: 'real_events', label: 'Real events', share: 40, ideas: ['Tablescape details from Saturday.', 'Timeline of a 200-guest wedding in 30 seconds.'] },
    { id: 'tips', label: 'Planning tips', share: 30, ideas: ['When to send save-the-dates.', 'Budget split that actually works.'] },
    { id: 'vendors', label: 'Vendor love', share: 20, ideas: ['Florist spotlight.', 'Our favorite caterers this season.'] },
    { id: 'bts', label: 'Behind the scenes', share: 10, ideas: ['Emergency kit contents.', 'Day-of at 6 a.m.'] },
  ], ['#eventplanner', '#weddingplanner', '#eventdesign'], cadence(5, 3, 4, 4), ['plajah', 'instagram', 'tiktok']),
  marketing: [play({ id: 'bridal_show', label: 'Bridal show follow-up mail', objective: 'sales', channels: ['direct_mail'], budgetCents: 30000, durationDays: 14, headline: 'It was lovely meeting you', body: 'Follow up every booth sign-up with a printed note within a week.', cta: 'Book a free consult', when: 'After each show', mail: { format: 'postcard_6x9', list: 'crm_segment', segmentId: 'new_30' } }),
    play({ id: 'social_ads', label: 'Engaged-couple social ads', objective: 'traffic', channels: ['meta', 'tiktok'], budgetCents: 60000, durationDays: 30, radiusMi: 40, headline: 'Plan less. Celebrate more.', body: 'Real-wedding reels to engaged couples in your market.', cta: 'Book a consult', when: 'Engagement season (Dec–Feb)' }),
    ...localPlays({ offer: 'Free consult and 10% off day-of coordination.', billboard: 'You enjoy it. We run it.' }).filter(p => p.id === 'billboard_local')],
  commerce: { pos: true, kiosk: false, onlineStore: true, merchShop: false, signageFeeds: ['EVENT'], posQuickKeys: ['Planning Packages', 'Add-ons'],
    note: 'Packages and deposits sell from the same catalog; booked events feed the calendar, the client RSVP pages and the CRM.' },
  staffToday: [duty('Lead planner', ['Inquiries under 24 hours', 'Proposals out', 'This week’s events'], 'CRM'), duty('Assistant', ['Vendor confirmations', 'RSVP counts', 'Day-of kit'], 'EVENTS')],
};

// ── Real estate ───────────────────────────────────────────────────────────
const realEstate: OpsPreset = {
  id: 'real_estate_brokerage', label: 'Real Estate Brokerage', accent: '#5B8DEF',
  events: [
    ev({ key: 'open_house', label: 'Open house', emoji: '🏡', blurb: 'Sign-in on a tablet straight into the CRM; follow-up drips the same evening.', format: 'IN_PERSON', durationMin: 120, tiers: [],
      runOfShow: [{ t: '-45m', what: 'Signs out, lights on, sign-in kiosk up', owner: 'Listing agent' }, { t: '0:00', what: 'Open; every visitor signs in', owner: 'Listing agent' }, { t: '+2h', what: 'Close; same-day thank-you to sign-ins', owner: 'Listing agent' }],
      checklist: [{ daysBefore: 7, task: 'Seller approval and showing instructions', owner: 'Listing agent' }, { daysBefore: 5, task: 'Publish the open house on the listing and Plajah', owner: 'Listing agent' }, { daysBefore: 1, task: 'Print feature sheets; charge the tablet', owner: 'Assistant' }, { daysBefore: -1, task: 'Seller report: traffic and feedback', owner: 'Listing agent' }],
      promo: [{ daysBefore: 5, channel: 'social', copy: 'Open house Sunday 1–3. Walkthrough reel.' }, { daysBefore: 4, channel: 'mail', copy: 'Just-listed postcards to 200 nearest neighbors.' }, { daysBefore: 1, channel: 'push', copy: 'Open house tomorrow.' }] }),
    ev({ key: 'homebuyer_seminar', label: 'First-time homebuyer seminar', emoji: '🎓', blurb: 'With a lender partner. Free RSVP; every attendee is a lead.', format: 'HYBRID', durationMin: 90, tiers: [],
      runOfShow: [{ t: '18:00', what: 'Welcome', owner: 'Broker' }, { t: '18:10', what: 'Budget and pre-approval (lender)', owner: 'Lender partner' }, { t: '18:45', what: 'Q&A; book consults', owner: 'Agents' }], checklist: prepSpine, promo: promoSpine('the homebuyer seminar') }),
  ],
  crm: {
    contactNoun: 'client', tags: ['buyer', 'seller', 'investor', 'renter', 'sphere', 'past client'],
    pipelines: [{
      id: 'buyers', label: 'Buyers', noun: 'buyer', valueLabel: 'Est. commission',
      stages: [stage('lead', 'New lead', 10, { slaDays: 1, templateId: 'buyer_lead' }), stage('consult', 'Consult / agreement', 30, { nextAction: 'Signed buyer agreement before touring' }), stage('showing', 'Showing', 45),
        stage('offer', 'Offer out', 60), stage('contract', 'Under contract', 85, { nextAction: 'Inspection, appraisal, financing dates' }), won('closed', 'Closed', { templateId: 'thank_you_letter' }), lost()],
    }, {
      id: 'sellers', label: 'Sellers', noun: 'listing', valueLabel: 'Est. commission',
      stages: [stage('lead', 'Seller lead', 10, { slaDays: 2 }), stage('cma', 'CMA / listing appt', 40), stage('listed', 'Listed', 70), stage('contract', 'Under contract', 90), won('closed', 'Closed'), lost('withdrawn', 'Withdrawn / expired')],
    }, customerLifecycle('past client')],
    fields: [{ id: 'budget', label: 'Price range', type: 'text' }, { id: 'beds', label: 'Beds', type: 'number' }, { id: 'area', label: 'Areas', type: 'text' }, { id: 'preapproved', label: 'Pre-approved', type: 'select', options: ['Yes', 'No', 'Cash'] }, { id: 'move_by', label: 'Move by', type: 'date' }, { id: 'property', label: 'Property address', type: 'text' }],
    segments: [...COMMON_SEGMENTS, { id: 'active_buyers', label: 'Active buyers', rule: { pipelineId: 'buyers', stageIn: ['showing', 'offer'] } }, { id: 'sphere', label: 'Sphere & past clients', rule: { tagsAny: ['sphere', 'past client'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'letting us help with your move', winback: 'get a free, no-pressure home value update', postcard: ['Just listed in your neighborhood', 'Curious what your home is worth? Free value report, no strings.'] }),
    T.followUp('buyer_lead', 'Buyer lead response', 'lead', 'Hi {{first_name}},\n\nThanks for reaching out. Tell me your must-haves and timing, and I will set up a search that sends you new homes the moment they list.', 'Your home search'),
    { id: 'home_anniversary', label: 'Home anniversary', channel: 'postcard', purpose: 'announcement', subject: 'Happy home anniversary!', body: 'One year ago you got the keys. Here’s to many more. If you ever want a value update, I’m one call away.\n\n{{sender_name}} · {{business_name}}', trigger: { on: 'manual' } }],
  social: social([
    { id: 'listings', label: 'Listings', share: 35, ideas: ['Just listed: 30-second walkthrough.', 'Under contract in 6 days. Here’s why.'] },
    { id: 'market', label: 'Market updates', share: 25, ideas: ['This month’s numbers in our area.', 'Rates, explained without the jargon.'] },
    { id: 'community', label: 'Community', share: 25, ideas: ['Best coffee within walking distance of X.', 'Local business spotlight.'] },
    { id: 'clients', label: 'Client stories', share: 15, ideas: ['Keys day (with permission).', 'First-time buyer story.'] },
  ], ['#realestate', '#justlisted', '#homesforsale'], cadence(5, 4, 3, 4)),
  marketing: [
    play({ id: 'just_listed_mail', label: 'Just listed / just sold postcards', objective: 'awareness', channels: ['direct_mail'], budgetCents: 25000, durationDays: 7, radiusMi: 0.5, headline: 'Just listed near you', body: 'Mail the 200 to 500 nearest homes on every new listing and every sale.', cta: 'Free home value report', when: 'Every listing and closing', mail: { format: 'postcard_6x9', list: 'eddm_routes' } }),
    play({ id: 'farm_mail', label: 'Neighborhood farming', objective: 'awareness', channels: ['eddm'], budgetCents: 60000, durationDays: 30, radiusMi: 1, headline: 'Your neighborhood market report', body: 'Monthly market stats card to one farm area. Consistency wins.', cta: 'Call for your home value', when: 'Monthly', mail: { format: 'postcard_6x11', list: 'eddm_routes' } }),
    play({ id: 'agent_billboard', label: 'Agent billboard', objective: 'awareness', channels: ['billboard_dooh'], budgetCents: 150000, durationDays: 28, radiusMi: 5, headline: 'Sold. Again.', body: 'Face, name, one line. Fair-housing compliant: no preference language.', cta: 'Call', billboard: { line: 'Sold. Again.', sub: '{{business_name}}' } }),
  ],
  commerce: { pos: false, kiosk: true, onlineStore: false, merchShop: false, signageFeeds: ['EVENT'], note: 'Listings, open houses and the window display read from the same listing data; open-house sign-ins land in the CRM as leads.' },
  staffToday: [duty('Agent', ['New leads in under an hour', 'Today’s showings', 'Log feedback'], 'CRM'), duty('Transaction coordinator', ['Contract deadlines this week'], 'CRM'), duty('Broker', ['Compliance review', 'Agent pipeline'], 'COMPLIANCE')],
};

// ── Auto repair (mechanic) ────────────────────────────────────────────────
const autoRepair: OpsPreset = {
  id: 'auto_repair', label: 'Auto Repair Shop', accent: '#5B8DEF',
  events: [ev({ key: 'car_care_clinic', label: 'Car-care clinic', emoji: '🔧', blurb: 'Free Saturday clinic: fluids, tires, wipers, check-engine scans. Every car is a future work order.', format: 'IN_PERSON', durationMin: 180, tiers: [],
    runOfShow: [{ t: '09:00', what: 'Bays cleared, scan tool ready', owner: 'Service manager' }, { t: '09:30', what: 'Free checks; findings into CRM', owner: 'Techs' }], checklist: prepSpine, promo: promoSpine('Car-care clinic') })],
  crm: {
    contactNoun: 'customer', tags: ['fleet', 'warranty', 'repeat', 'declined work'],
    pipelines: [customerLifecycle(), { id: 'declined', label: 'Declined work follow-up', noun: 'recommendation', valueLabel: 'Est. repair',
      stages: [stage('declined', 'Declined', 30, { slaDays: 30, nextAction: 'Remind in 30 days', templateId: 'declined_followup' }), stage('reminded', 'Reminded', 50), won('booked', 'Booked'), lost('passed', 'Not interested')] }],
    fields: [{ id: 'vehicle', label: 'Vehicle', type: 'text' }, { id: 'mileage', label: 'Last mileage', type: 'number' }],
    segments: [...COMMON_SEGMENTS, { id: 'declined', label: 'Declined work', rule: { pipelineId: 'declined', stageIn: ['declined', 'reminded'] } }, { id: 'fleet', label: 'Fleet accounts', rule: { tagsAny: ['fleet'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'trusting us with your car', winback: 'take $15 off your next oil change' }),
    T.followUp('declined_followup', 'Declined work reminder', 'declined', 'Hi {{first_name}},\n\nOn your last visit our tech recommended {{next_action}}. Want us to get it on the schedule before it becomes a bigger repair?', 'A quick reminder about your car')],
  social: social([
    { id: 'tips', label: 'Car tips', share: 40, ideas: ['What that dashboard light means.', 'Tire tread in 10 seconds with a penny.'] },
    { id: 'shop', label: 'In the shop', share: 35, ideas: ['Brake job, before and after.', 'Inspection photos we text customers.'] },
    { id: 'offers', label: 'Specials', share: 25, ideas: ['Oil change special this week.', 'Free multi-point with any service.'] },
  ], ['#autorepair', '#mechanic', '#carcare'], cadence(3, 4, 2, 3)),
  marketing: localPlays({ offer: '$15 off your next oil change. Free multi-point inspection.', billboard: 'Honest repairs. Fair prices.' }),
  commerce: { pos: true, kiosk: false, onlineStore: false, merchShop: false, signageFeeds: ['DEAL', 'PRODUCT'], posQuickKeys: ['Maintenance', 'Parts & Supplies'], note: 'Parts on repair orders draw down inventory; waiting-room screens show today’s specials from the same deals.' },
  staffToday: [duty('Service advisor', ['Write-ups', 'Approvals waiting', 'Cars ready to call'], 'TICKETS'), duty('Technician', ['Assigned jobs', 'Inspection photos'], 'TICKETS'), duty('Parts', ['Low-stock parts', 'Receive orders'], 'INVENTORY')],
};

// ── Restaurant / café ────────────────────────────────────────────────────
const restaurant: OpsPreset = {
  id: 'restaurant_cafe', label: 'Restaurant / Café', accent: '#D40055',
  events: [
    ev({ key: 'live_music_night', label: 'Live music night', emoji: '🎶', blurb: 'Free or ticketed, with a featured cocktail and a set menu.', format: 'IN_PERSON', durationMin: 180, tiers: [{ name: 'Reserved table (2)', price: 20, qty: 15, perks: 'Credit toward food' }],
      runOfShow: [{ t: '18:00', what: 'Featured menu on screens', owner: 'Manager' }, { t: '19:00', what: 'First set', owner: 'Artist' }, { t: '20:15', what: 'Second set', owner: 'Artist' }], checklist: prepSpine, promo: promoSpine('Live music night'), merchTieIn: 'Kitchen' }),
    ev({ key: 'tasting_dinner', label: 'Chef’s tasting dinner', emoji: '🍽️', blurb: 'Five courses, one seating, prepaid tickets.', format: 'IN_PERSON', durationMin: 150, capacity: 40, tiers: [{ name: 'Seat', price: 85, qty: 40 }, { name: 'Seat + pairing', price: 125, qty: 20 }],
      runOfShow: [{ t: '18:30', what: 'Welcome bite', owner: 'Chef' }, { t: '19:00', what: 'Courses every 20 min', owner: 'Expo' }], checklist: prepSpine, promo: promoSpine('Tasting dinner') }),
  ],
  crm: { contactNoun: 'guest', tags: ['regular', 'catering', 'allergy', 'birthday club'], pipelines: [customerLifecycle('guest'), { id: 'catering', label: 'Catering & private dining', noun: 'event', valueLabel: 'Order value', stages: [stage('inquiry', 'Inquiry', 25, { slaDays: 1 }), stage('quoted', 'Quoted', 55), won('booked', 'Booked'), lost()] }],
    fields: [{ id: 'allergies', label: 'Allergies', type: 'text' }, { id: 'favorite', label: 'Usual order', type: 'text' }], segments: COMMON_SEGMENTS },
  correspondence: baseCorrespondence({ what: 'dining with us', winback: 'dessert is on us next time', birthday: 'a free dessert', push: 'Today’s special at {{business_name}} just went up on the board.' }),
  social: social([
    { id: 'dishes', label: 'The food', share: 45, ideas: ['Today’s special, plated.', 'The dish people drive across town for.'] },
    { id: 'kitchen', label: 'Kitchen', share: 25, ideas: ['Prep at 7 a.m.', 'Meet the line.'] },
    { id: 'events', label: 'Happenings', share: 30, ideas: ['Live music Friday.', 'Brunch is back.'] },
  ], ['#foodie', '#eatlocal', '#restaurant'], cadence(5, 4, 4, 5)),
  marketing: localPlays({ offer: 'Free dessert with any entrée. Bring this card.', billboard: 'Hungry? Next exit.' }),
  commerce: { pos: true, kiosk: true, onlineStore: true, merchShop: true, signageFeeds: [...ALL_FEEDS], menuBoardCategory: 'Kitchen', posQuickKeys: ['Coffee', 'Kitchen', 'Bakery'], note: 'The menu board, the kiosk, online ordering and the register read one menu; 86 an item once and it disappears everywhere.' },
  staffToday: [duty('Server / counter', ['Open the register', '86 list', 'Today’s special'], 'ORDERS'), duty('Kitchen lead', ['Prep list', 'Update the menu board'], 'INVENTORY')],
};

// ── Salon / spa / boutique / laundromat: lifecycle-led ───────────────────
const appointmentLed = (id: string, label: string, accent: string, noun: string, tags: string[], hashtags: string[], quick: string[], extra: Partial<OpsPreset> = {}): OpsPreset => ({
  id, label, accent,
  events: [ev({ key: 'client_night', label: 'Client appreciation night', emoji: '🥂', blurb: 'Mini services, retail discounts and rebooking on the spot.', format: 'IN_PERSON', durationMin: 150, tiers: [],
    runOfShow: [{ t: '18:00', what: 'Retail deals on screens; stations set', owner: 'Manager' }, { t: '18:30', what: 'Mini services and demos', owner: 'Team' }, { t: '20:00', what: 'Raffle; rebooking', owner: 'Front desk' }], checklist: prepSpine, promo: promoSpine('Client appreciation night'), merchTieIn: 'Retail' })],
  crm: { contactNoun: noun, tags, pipelines: [customerLifecycle(noun)], fields: [{ id: 'preferred_staff', label: 'Preferred provider', type: 'text' }, { id: 'notes_formula', label: 'Service notes', type: 'text' }], segments: [...COMMON_SEGMENTS, { id: 'rebook', label: 'Due to rebook (6 weeks)', rule: { inactiveDays: 42 } }] },
  correspondence: [...baseCorrespondence({ what: 'your visit', winback: 'take 15% off your next service', birthday: 'an add-on on us' }), T.reminder('rebook_nudge', 'Rebook nudge', 'Hi {{first_name}}, it’s about time for your next visit. Book with {{business_name}} in a tap.')],
  social: social([
    { id: 'work', label: 'Our work', share: 50, ideas: ['Before and after.', 'Transformation of the week.'] },
    { id: 'team', label: 'The team', share: 25, ideas: ['Meet a provider.', 'Education day.'] },
    { id: 'offers', label: 'Offers & retail', share: 25, ideas: ['Product of the month.', 'Openings this week.'] },
  ], hashtags, cadence(5, 3, 4, 4)),
  marketing: localPlays({ offer: '15% off your first visit.', billboard: 'Look good. Feel better.' }),
  commerce: { pos: true, kiosk: false, onlineStore: true, merchShop: false, signageFeeds: ['DEAL', 'PRODUCT', 'NOW_PLAYING'], posQuickKeys: quick, note: 'Services and retail ring together; retail stock updates the online shop and the waiting-area screen.' },
  staffToday: [duty('Front desk', ['Today’s book', 'Rebook every checkout', 'Retail at checkout'], 'APPOINTMENTS'), duty('Provider', ['My appointments', 'Client notes'], 'APPOINTMENTS')],
  ...extra,
});

const salon = appointmentLed('salon_barbershop', 'Salon / Barbershop', '#FF8C00', 'client', ['color client', 'walk-in', 'wedding party'], ['#salon', '#barber', '#hair'], ['Haircuts', 'Add-ons', 'Retail']);
const spa = appointmentLed('health_spa', 'Health Spa', '#06D6A0', 'guest', ['member', 'gift card', 'couples'], ['#spa', '#selfcare', '#massage'], ['Massage', 'Add-ons', 'Retail']);
const boutique: OpsPreset = {
  ...appointmentLed('clothing_boutique', 'Clothing Boutique', '#D40055', 'shopper', ['vip', 'stylist client', 'size notes'], ['#boutique', '#ootd', '#shopsmall'], ['Tops', 'Accessories']),
  events: [ev({ key: 'trunk_show', label: 'Trunk show / new drop', emoji: '👗', blurb: 'Designer or new-collection night with RSVP, sips and a first-look discount.', format: 'IN_PERSON', durationMin: 180, tiers: [],
    runOfShow: [{ t: '17:00', what: 'Racks styled; drop on screens', owner: 'Owner' }, { t: '18:00', what: 'Doors; first-look pricing at the register', owner: 'Stylists' }], checklist: prepSpine, promo: promoSpine('the trunk show'), merchTieIn: 'Accessories' })],
  commerce: { pos: true, kiosk: false, onlineStore: true, merchShop: true, signageFeeds: ['PRODUCT', 'DEAL', 'NOW_PLAYING'], posQuickKeys: ['Tops', 'Bottoms', 'Accessories'], note: 'Size/color stock is shared by the floor, the online shop and the window screens; the last one sold drops off everywhere.' },
  staffToday: [duty('Stylist', ['VIP follow-ups', 'Styled looks for social'], 'CRM'), duty('Sales floor', ['Open register', 'Restock sizes'], 'INVENTORY')],
};
const laundromat: OpsPreset = {
  ...appointmentLed('laundromat', 'Laundromat', '#00B4D8', 'customer', ['wash & fold', 'commercial', 'delivery'], ['#laundry', '#washandfold', '#shoplocal'], ['Wash & Fold', 'Supplies']),
  events: [], commerce: { pos: true, kiosk: false, onlineStore: false, merchShop: false, signageFeeds: ['DEAL', 'NOW_PLAYING'], posQuickKeys: ['Wash & Fold', 'Supplies'], note: 'Wash-and-fold tickets, supplies and wallet reloads share one register; the wall screen shows wallet bonuses and specials.' },
  staffToday: [duty('Attendant', ['Weigh-ins', 'Bags ready to call', 'Wipe-down rounds'], 'TICKETS'), duty('Driver', ['Today’s route'], 'TICKETS')],
};

export const BUSINESS_PRESETS: OpsPreset[] = [supermarket, cornerStore, furniture, dealership, venue, planner, realEstate, autoRepair, restaurant, salon, spa, boutique, laundromat];

// ── Vertical fallbacks (pages without a pack) ─────────────────────────────
const generic = (id: string, label: string, accent: string, base: OpsPreset): OpsPreset => ({ ...base, id, label, accent });
export const VERTICAL_FALLBACK: Record<string, OpsPreset> = {
  RETAIL: generic('vertical_retail', 'Retail', '#FF8C00', boutique),
  RESTAURANT: generic('vertical_restaurant', 'Restaurant', '#D40055', restaurant),
  SERVICE: generic('vertical_service', 'Service business', '#6B0099', salon),
  ENTERTAINMENT: generic('vertical_entertainment', 'Entertainment', '#00B4D8', venue),
  TECH: generic('vertical_tech', 'Tech', '#06D6A0', { ...planner, events: planner.events.filter(e => e.key === 'corporate') }),
  HEALTH: generic('vertical_health', 'Health', '#06D6A0', spa),
  REAL_ESTATE: generic('vertical_real_estate', 'Real estate', '#5B8DEF', realEstate),
  OTHER: generic('vertical_other', 'Business', '#6B0099', boutique),
};
