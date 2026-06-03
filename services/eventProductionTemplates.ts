import { EventTask, EventBudgetItem, ContractType, EventProductionType } from '../types';

// ── Task templates per event type ─────────────────────────────────────────────

const id = () => `task_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

export interface TaskTemplate { title: string; description: string; category: string; priority: EventTask['priority']; weeksBefore: number; }
export interface VendorCategory { type: ContractType; label: string; emoji: string; avgCostRange: string; mustHave: boolean; searchHint: string; }
export interface BudgetTemplate { category: string; label: string; estimatedPct: number; notes: string; }

// ── CONCERT / LIVE MUSIC ──────────────────────────────────────────────────────
const CONCERT_TASKS: TaskTemplate[] = [
  // 12 weeks out
  { title: 'Define event concept, date, and target audience', description: 'Lock the core idea: genre, vibe, target headcount, rough budget', category: 'Planning', priority: 'URGENT', weeksBefore: 12 },
  { title: 'Set initial budget', description: 'Create a full itemized budget. Include venue, talent, marketing, production, and contingency (10%).', category: 'Finance', priority: 'URGENT', weeksBefore: 12 },
  { title: 'Research and shortlist venues', description: 'Consider capacity, sound system, parking, load-in access, catering options, and cost.', category: 'Venue', priority: 'URGENT', weeksBefore: 12 },
  // 10 weeks out
  { title: 'Book the venue', description: 'Sign venue contract. Confirm dates, capacity, sound/lighting included vs. bring-in, load-in times.', category: 'Venue', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Hire or confirm your band/musicians', description: 'Confirm lineups, set lists, travel and accommodation needs. Get signed musician agreements.', category: 'Talent', priority: 'HIGH', weeksBefore: 10 },
  { title: 'Book headlining and support acts', description: 'Negotiate fees, set times, technical riders. Confirm billing order for marketing.', category: 'Talent', priority: 'HIGH', weeksBefore: 10 },
  { title: 'Hire sound & PA company', description: 'Get 3 quotes. Check references. Confirm system size, engineer, load-in time.', category: 'Production', priority: 'HIGH', weeksBefore: 10 },
  // 8 weeks out
  { title: 'Hire lighting & stage design company', description: 'Confirm rig design, crew call time, power requirements.', category: 'Production', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Launch ticket sales on Plajah', description: 'Set up event page, ticket tiers, promo codes. Share on all social channels.', category: 'Marketing', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Design event poster and press kit', description: 'Create branded artwork for flyers, socials, and press. Include artist bios.', category: 'Marketing', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Run first marketing campaign', description: 'Launch social ads, email blast to fan list, reach out to local press and blogs.', category: 'Marketing', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Book photographer and videographer', description: 'Confirm shots needed: press shots, live action, social content. Agree on deliverables.', category: 'Media', priority: 'MEDIUM', weeksBefore: 8 },
  // 6 weeks out
  { title: 'Hire catering / rider fulfillment', description: 'Artist and crew rider requirements. Audience bar/food if applicable.', category: 'Catering', priority: 'MEDIUM', weeksBefore: 6 },
  { title: 'Hire security', description: 'Based on expected capacity. Confirm licensing, positioning, and briefing plan.', category: 'Security', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Arrange gear and equipment transport', description: 'Vehicles, loading crew, insurance for equipment in transit.', category: 'Logistics', priority: 'MEDIUM', weeksBefore: 6 },
  { title: 'Create day-of production schedule', description: 'Load-in, sound check, support set, headline set, curfew, load-out. Share with all vendors.', category: 'Planning', priority: 'HIGH', weeksBefore: 6 },
  // 4 weeks out
  { title: 'Second marketing push', description: 'Reminder blast to email list, social retargeting, partner promotion, press follow-ups.', category: 'Marketing', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Confirm all vendor contracts are signed', description: 'Chase any unsigned contracts. Confirm all deposits paid.', category: 'Finance', priority: 'URGENT', weeksBefore: 4 },
  { title: 'Send advance tech rider to venue', description: 'Stage plot, input list, backline requirements, power needs.', category: 'Production', priority: 'HIGH', weeksBefore: 4 },
  // 2 weeks out
  { title: 'Sell out push — final marketing', description: 'Urgency campaign. Last chance social posts. Offer early entry as incentive.', category: 'Marketing', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Brief all staff and crew', description: 'Share full production schedule, contacts, emergency plan, access passes.', category: 'Planning', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Confirm guest list and comp tickets', description: 'Press, industry, VIP. Set up at-door check-in list.', category: 'Operations', priority: 'MEDIUM', weeksBefore: 2 },
  // Day of
  { title: 'Oversee load-in and sound check', description: 'Be on site. Have all contacts handy. Resolve issues immediately.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  { title: 'Brief door staff and box office', description: 'Ticket scanning process, ID checks, guest list, accessibility needs.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  // Post-event
  { title: 'Pay all vendors', description: 'Final payments per contracts. Get receipts. Update budget actuals.', category: 'Post-Event', priority: 'HIGH', weeksBefore: -1 },
  { title: 'Share footage and photos with team and press', description: 'Distribute edited content. Send thank-you notes to press and partners.', category: 'Post-Event', priority: 'MEDIUM', weeksBefore: -1 },
  { title: 'Review ticket sales and revenue', description: 'Compare actuals vs. budget. Document learnings for next event.', category: 'Post-Event', priority: 'MEDIUM', weeksBefore: -1 },
];

// ── FILM PREMIERE ─────────────────────────────────────────────────────────────
const FILM_PREMIERE_TASKS: TaskTemplate[] = [
  { title: 'Choose premiere venue', description: 'Cinema, art space, or custom venue. Consider screening quality, red carpet space, and ADA access.', category: 'Venue', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Lock screening format', description: 'DCP, Blu-ray, or digital file. Confirm projection/audio specs with venue.', category: 'Production', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Build guest list: cast, crew, press, industry', description: 'Prioritize lead cast, director, producers, distribution contacts, and key press.', category: 'Planning', priority: 'HIGH', weeksBefore: 10 },
  { title: 'Design invitations and press materials', description: 'Official invite suite, press kit with stills, synopsis, bios, and quotes.', category: 'Marketing', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Send press invites and accreditation', description: 'Film journalists, bloggers, critics. Include screening details and embargo date.', category: 'Marketing', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Book red carpet photographer and videographer', description: 'Confirm coverage: red carpet arrivals, interviews, behind-the-scenes, Q&A.', category: 'Media', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Plan red carpet setup', description: 'Step-and-repeat banner, lighting, press pen, security barrier. Hire stylist if needed.', category: 'Production', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Arrange catering for after-party', description: 'Drinks, food, dietary needs. Budget typically 30% of total event spend.', category: 'Catering', priority: 'MEDIUM', weeksBefore: 6 },
  { title: 'Hire MC for Q&A panel', description: 'Brief them on film, key talking points, guest list of panelists.', category: 'Talent', priority: 'MEDIUM', weeksBefore: 6 },
  { title: 'Organize merch and merchandise table', description: 'Film posters, prints, branded items. Set up Plajah merch kiosk for kits sold at event.', category: 'Operations', priority: 'LOW', weeksBefore: 4 },
  { title: 'Confirm all attendee RSVPs', description: 'Send reminder 1 week before. Confirm dietary restrictions for catering.', category: 'Operations', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Prepare Q&A questions and format', description: 'Work with MC on pacing. Prep cast and crew for likely press questions.', category: 'Production', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Day-of AV check', description: 'Full screening test. Check audio levels, subtitles, aspect ratio.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  { title: 'Brief publicist on press access', description: 'Interview slots, embargo policy, social media rules on set.', category: 'Day Of', priority: 'HIGH', weeksBefore: 0 },
  { title: 'Collect press coverage', description: 'Aggregate reviews, photos, social mentions. Send director/cast summary.', category: 'Post-Event', priority: 'MEDIUM', weeksBefore: -1 },
];

// ── BOOK SIGNING ──────────────────────────────────────────────────────────────
const BOOK_SIGNING_TASKS: TaskTemplate[] = [
  { title: 'Choose venue', description: 'Bookstore, library, indie venue, or private space. Consider seating capacity and accessibility.', category: 'Venue', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Arrange book inventory', description: 'Coordinate with publisher or distributor. Confirm stock count, pre-signed options, ISBN.', category: 'Operations', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Design promotional materials', description: 'Event flyer, social graphics, email header. Use cover art and event details.', category: 'Marketing', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Email your reader list', description: 'Personal invitation from the author. Mention limited capacity if applicable.', category: 'Marketing', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Pitch local media and book blogs', description: 'Press release with book synopsis, author bio, event details. Include reading excerpt.', category: 'Marketing', priority: 'MEDIUM', weeksBefore: 6 },
  { title: 'Set up signing table and merch', description: 'Table, chair, pens, book stands, branded items. Decide on personalization policy.', category: 'Operations', priority: 'MEDIUM', weeksBefore: 2 },
  { title: 'Prepare reading excerpt', description: 'Select 5–10 minutes of high-impact text. Rehearse pacing and pauses.', category: 'Production', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Arrange refreshments', description: 'Light snacks and drinks for attendees — adds to the hospitality feel.', category: 'Catering', priority: 'LOW', weeksBefore: 2 },
  { title: 'Brief venue staff', description: 'Queue management, book sales process, accessibility, photography policy.', category: 'Day Of', priority: 'HIGH', weeksBefore: 0 },
  { title: 'Post event photos and reader testimonials', description: 'Share signing photos on social and reach out to attendees for quotes.', category: 'Post-Event', priority: 'MEDIUM', weeksBefore: -1 },
];

// ── GAME / APP LAUNCH ─────────────────────────────────────────────────────────
const GAME_LAUNCH_TASKS: TaskTemplate[] = [
  { title: 'Define launch event format', description: 'Playable demo stations, press-only preview, public launch party, or hybrid. Set capacity.', category: 'Planning', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Book venue', description: 'Gaming cafe, studio space, or custom build. Power needs, internet speed, and screen count are critical.', category: 'Venue', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Arrange gaming equipment', description: 'PCs, consoles, TVs, controllers, headsets. Rent or source from gaming hardware sponsor.', category: 'Production', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Build demo build for event', description: 'Stable, feature-focused build. Add event branding screen. Test on all hardware configs.', category: 'Production', priority: 'URGENT', weeksBefore: 6 },
  { title: 'Invite gaming press and influencers', description: 'Embargo playthrough, exclusive first-look, social media rules. Send press kits.', category: 'Marketing', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Set up live stream (Plajah + Twitch/YouTube)', description: 'Stream the launch live. Use Plajah FAST channel as primary. Simultaneous Twitch/YouTube.', category: 'Production', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Prepare giveaway items', description: 'Game keys, merch, branded items. Plan distribution (raffle, first-arrival, influencer exclusive).', category: 'Operations', priority: 'MEDIUM', weeksBefore: 4 },
  { title: 'Create launch day social campaign', description: 'Countdown posts, trailer drops, influencer activations. Coordinate with streaming launch.', category: 'Marketing', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Brief tech support and troubleshooting team', description: 'Designated tech on site for each demo station. Test network failover.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  { title: 'Aggregate launch day coverage and reviews', description: 'Collect all press, streams, clips. Compile sentiment report. Share with team.', category: 'Post-Event', priority: 'HIGH', weeksBefore: -1 },
];

// ── PODCAST LIVE RECORDING ────────────────────────────────────────────────────
const PODCAST_LIVE_TASKS: TaskTemplate[] = [
  { title: 'Choose format and guests', description: 'Define episode topic, confirm guest lineup, set episode length. Live taping with audience vs. stream-only.', category: 'Planning', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Book recording venue or studio', description: 'In-person venue with audience seating, or broadcast studio. Check acoustics, internet speed, and A/V.', category: 'Venue', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Confirm guests and send prep materials', description: 'Send talking points, topic outline, and logistics. Confirm travel and any accommodation needs.', category: 'Talent', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Set up multi-track recording', description: 'Each mic on its own track. Test recording software (Riverside, Squadcast, Rodecaster). Backup recording required.', category: 'Production', priority: 'URGENT', weeksBefore: 4 },
  { title: 'Set up live stream on Plajah', description: 'Create event page on Plajah. Set up FAST/live channel for simultaneous broadcast. Test stream key.', category: 'Marketing', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Market the live taping', description: 'Announce guests on socials. Email list. Promote on Plajah platform. Get guests to cross-post.', category: 'Marketing', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Ticket or RSVP management', description: 'Decide free vs. ticketed. Set up through Plajah. Send confirmation emails with location/stream link.', category: 'Operations', priority: 'MEDIUM', weeksBefore: 4 },
  { title: 'Prepare interview questions and run of show', description: 'Draft 20+ questions per guest. Plan segment breaks, ad reads, audience Q&A segment.', category: 'Production', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Test full AV rig', description: 'Full dress rehearsal with all mics, monitors, stream, and recording. Fix all issues.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  { title: 'Brief audience on recording etiquette', description: 'Phones on silent. Applause cues. When NOT to make noise. Emergency exits.', category: 'Day Of', priority: 'HIGH', weeksBefore: 0 },
  { title: 'Edit and publish episode', description: 'Edit recording. Export masters. Publish to Plajah + RSS feed. Create audiogram clips for social.', category: 'Post-Event', priority: 'HIGH', weeksBefore: -1 },
  { title: 'Send thank-you to guests and attendees', description: 'Personal message to guests. Email blast to audience with episode link.', category: 'Post-Event', priority: 'MEDIUM', weeksBefore: -1 },
];

// ── ART SHOW / EXHIBITION ─────────────────────────────────────────────────────
const ART_SHOW_TASKS: TaskTemplate[] = [
  { title: 'Curate artwork selection and theme', description: 'Decide the narrative arc of the show. Select 15–40 pieces. Set price list and decide on originals vs. prints.', category: 'Curation', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Book gallery or event space', description: 'Gallery, pop-up, café, or studio. Consider wall space, lighting, foot traffic, and prestige.', category: 'Venue', priority: 'URGENT', weeksBefore: 10 },
  { title: 'Prepare artist statement and bios', description: 'Written statement for the show. Individual piece descriptions (title, medium, year, price). For the catalogue and wall labels.', category: 'Production', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Print and frame all works', description: 'Confirm print quality. Source frames. Allow time for framing corrections. Handle with care.', category: 'Production', priority: 'URGENT', weeksBefore: 6 },
  { title: 'Design invitations and event catalogue', description: 'Physical invitations, digital invites, show catalogue/booklet, and wall labels.', category: 'Marketing', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Invite collectors, press, and art community', description: 'Build VIP list. Reach out to local art press, galleries, and collectors. Send invites with RSVP.', category: 'Marketing', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Plan installation layout', description: 'Floor plan for artwork placement. Mark walls. Consider flow and sight lines.', category: 'Production', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Arrange opening night catering', description: 'Wine, sparkling water, light bites. Budget 20–30% of event total. Confirm dietary requirements.', category: 'Catering', priority: 'MEDIUM', weeksBefore: 4 },
  { title: 'Set up sales system', description: 'Red dot system for sold pieces. Square/Stripe for on-site sales. Have contracts for consignment.', category: 'Operations', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Hang and install all works', description: 'Install 1–2 days before opening. Check lighting angles. Final adjustments.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  { title: 'Brief gallery staff and helpers', description: 'Explain each piece, pricing, and the artist statement. Handle sales questions.', category: 'Day Of', priority: 'HIGH', weeksBefore: 0 },
  { title: 'Post opening night photos and sales report', description: 'Share event photos on socials and Plajah. Send press release with show highlights. Confirm all sales.', category: 'Post-Event', priority: 'HIGH', weeksBefore: -1 },
];

// ── COMEDY SHOW ───────────────────────────────────────────────────────────────
const COMEDY_SHOW_TASKS: TaskTemplate[] = [
  { title: 'Lock lineup: headliner + support acts', description: 'Confirm headliner, 2–3 support acts, and emcee. Agree on set times and fees.', category: 'Talent', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Book venue', description: 'Comedy club, theater, or bar with stage. Consider capacity, stage size, and sound system.', category: 'Venue', priority: 'URGENT', weeksBefore: 8 },
  { title: 'Negotiate performer agreements', description: 'Written agreements for all comedians: fee, set length, billing, exclusivity radius.', category: 'Finance', priority: 'HIGH', weeksBefore: 8 },
  { title: 'Set up ticket sales on Plajah', description: 'Create event page. Tiered pricing (general, VIP front row, meet & greet). Apply early bird discount.', category: 'Marketing', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Design show poster and social content', description: 'Headliner-focused design. Comedian photos, show details, ticket link. Create 3–5 social assets.', category: 'Marketing', priority: 'HIGH', weeksBefore: 6 },
  { title: 'Run targeted ad campaign', description: 'Facebook/Instagram targeting comedy fans in city radius. Retarget website visitors. Boost best-performing organic post.', category: 'Marketing', priority: 'HIGH', weeksBefore: 4 },
  { title: 'Arrange sound check and PA setup', description: 'Single mic on stand, stage monitor, and FOH mix. Confirm with venue. No feedback.', category: 'Production', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Create show run of order', description: 'Opener → support acts → intermission → headliner. Agreed timing for each. Share with venue and all performers.', category: 'Planning', priority: 'HIGH', weeksBefore: 2 },
  { title: 'Brief door staff and box office', description: 'Ticket scan process, guest list, reserved seating, two-drink minimum if applicable.', category: 'Day Of', priority: 'URGENT', weeksBefore: 0 },
  { title: 'Introduce acts and manage transitions', description: 'Emcee briefed on each act. Smooth transitions. Keep energy up between sets.', category: 'Day Of', priority: 'HIGH', weeksBefore: 0 },
  { title: 'Pay all performers', description: 'Cash or Stripe per agreements. Get signatures. Update payroll.', category: 'Post-Event', priority: 'HIGH', weeksBefore: -1 },
  { title: 'Collect clips and testimonials', description: 'Short video clips for socials. Fan reactions. Start building next show buzz.', category: 'Post-Event', priority: 'MEDIUM', weeksBefore: -1 },
];

export const EVENT_TASK_TEMPLATES: Record<EventProductionType, TaskTemplate[]> = {
  CONCERT:       CONCERT_TASKS,
  FILM_PREMIERE: FILM_PREMIERE_TASKS,
  BOOK_SIGNING:  BOOK_SIGNING_TASKS,
  GAME_LAUNCH:   GAME_LAUNCH_TASKS,
  PODCAST_LIVE:  PODCAST_LIVE_TASKS,
  ART_SHOW:      ART_SHOW_TASKS,
  COMEDY_SHOW:   COMEDY_SHOW_TASKS,
  CUSTOM:        [],
};

// ── Vendor categories per event type ─────────────────────────────────────────

export const VENDOR_CATEGORIES: Record<EventProductionType, VendorCategory[]> = {
  CONCERT: [
    { type: 'VENUE', label: 'Venue', emoji: '🏟️', avgCostRange: '$500–$50,000', mustHave: true, searchHint: 'Search: music venues, concert halls, event spaces near [city]' },
    { type: 'SOUND_AV', label: 'Sound & PA Company', emoji: '🔊', avgCostRange: '$800–$15,000', mustHave: true, searchHint: 'Search: live sound production company, PA rental [city]' },
    { type: 'LIGHTING', label: 'Lighting & Stage', emoji: '💡', avgCostRange: '$500–$10,000', mustHave: true, searchHint: 'Search: stage lighting hire, concert lighting designer [city]' },
    { type: 'MUSICIAN_PERFORMER', label: 'Musicians / Performers', emoji: '🎸', avgCostRange: '$300–$5,000/person', mustHave: false, searchHint: 'Search: session musicians, live band hire [city] or [genre]' },
    { type: 'CATERING', label: 'Catering / Rider', emoji: '🍽️', avgCostRange: '$200–$3,000', mustHave: false, searchHint: 'Search: backstage catering, artist rider fulfillment [city]' },
    { type: 'SECURITY', label: 'Security', emoji: '🔒', avgCostRange: '$300–$5,000', mustHave: true, searchHint: 'Search: event security company, crowd management [city]' },
    { type: 'PHOTOGRAPHER', label: 'Photographer/Videographer', emoji: '📸', avgCostRange: '$300–$3,000', mustHave: false, searchHint: 'Search: concert photographer, live music videographer [city]' },
    { type: 'TRANSPORT', label: 'Equipment Transport', emoji: '🚐', avgCostRange: '$200–$2,000', mustHave: false, searchHint: 'Search: equipment transport, van hire with driver [city]' },
    { type: 'MARKETING_PR', label: 'Marketing & PR', emoji: '📣', avgCostRange: '$500–$5,000', mustHave: false, searchHint: 'Search: music PR agency, event promotion [city]' },
  ],
  FILM_PREMIERE: [
    { type: 'VENUE', label: 'Venue / Cinema', emoji: '🎬', avgCostRange: '$1,000–$20,000', mustHave: true, searchHint: 'Search: private cinema hire, film premiere venue [city]' },
    { type: 'SOUND_AV', label: 'AV / Projection', emoji: '📽️', avgCostRange: '$500–$5,000', mustHave: true, searchHint: 'Search: DCP projection hire, event AV company [city]' },
    { type: 'PHOTOGRAPHER', label: 'Red Carpet Photographer', emoji: '📸', avgCostRange: '$500–$3,000', mustHave: true, searchHint: 'Search: red carpet photographer, press event videographer [city]' },
    { type: 'CATERING', label: 'After-Party Catering', emoji: '🥂', avgCostRange: '$1,000–$10,000', mustHave: false, searchHint: 'Search: event catering company, cocktail party catering [city]' },
    { type: 'SECURITY', label: 'Security', emoji: '🔒', avgCostRange: '$300–$2,000', mustHave: true, searchHint: 'Search: event security, red carpet crowd management [city]' },
    { type: 'MARKETING_PR', label: 'Film PR Agency', emoji: '📣', avgCostRange: '$1,000–$15,000', mustHave: false, searchHint: 'Search: film publicist, entertainment PR agency [city]' },
  ],
  BOOK_SIGNING: [
    { type: 'VENUE', label: 'Venue / Bookstore', emoji: '📚', avgCostRange: 'Free–$500', mustHave: true, searchHint: 'Search: bookstore event space, library event room [city]' },
    { type: 'PHOTOGRAPHER', label: 'Event Photographer', emoji: '📸', avgCostRange: '$200–$800', mustHave: false, searchHint: 'Search: event photographer, book signing photography [city]' },
    { type: 'CATERING', label: 'Light Refreshments', emoji: '🍪', avgCostRange: '$100–$500', mustHave: false, searchHint: 'Search: event catering, light refreshments delivery [city]' },
    { type: 'MARKETING_PR', label: 'Book Publicist', emoji: '📣', avgCostRange: '$500–$5,000', mustHave: false, searchHint: 'Search: book PR, author publicist [city or genre]' },
  ],
  GAME_LAUNCH: [
    { type: 'VENUE', label: 'Venue', emoji: '🎮', avgCostRange: '$500–$10,000', mustHave: true, searchHint: 'Search: gaming venue hire, esports arena rental [city]' },
    { type: 'SOUND_AV', label: 'AV & Streaming Setup', emoji: '🖥️', avgCostRange: '$500–$5,000', mustHave: true, searchHint: 'Search: live streaming production, event AV [city]' },
    { type: 'CATERING', label: 'Food & Drinks', emoji: '🍕', avgCostRange: '$300–$3,000', mustHave: false, searchHint: 'Search: gaming event catering, finger food delivery [city]' },
    { type: 'PHOTOGRAPHER', label: 'Event Media', emoji: '📸', avgCostRange: '$300–$1,500', mustHave: false, searchHint: 'Search: gaming event photographer, launch day coverage [city]' },
    { type: 'MARKETING_PR', label: 'Gaming PR', emoji: '📣', avgCostRange: '$1,000–$10,000', mustHave: false, searchHint: 'Search: games PR agency, influencer outreach [platform]' },
  ],
  PODCAST_LIVE: [
    { type: 'VENUE', label: 'Recording Studio / Venue', emoji: '🎙️', avgCostRange: '$100–$2,000', mustHave: true, searchHint: 'Search: podcast studio hire, recording space [city]' },
    { type: 'SOUND_AV', label: 'Audio Engineer', emoji: '🔊', avgCostRange: '$200–$1,000', mustHave: false, searchHint: 'Search: podcast audio engineer, live recording engineer [city]' },
    { type: 'PHOTOGRAPHER', label: 'Event Photographer', emoji: '📸', avgCostRange: '$200–$800', mustHave: false, searchHint: 'Search: podcast event photographer, studio photography [city]' },
    { type: 'MARKETING_PR', label: 'PR / Media Outreach', emoji: '📣', avgCostRange: '$300–$3,000', mustHave: false, searchHint: 'Search: podcast PR, media outreach specialist' },
  ],
  ART_SHOW: [
    { type: 'VENUE', label: 'Gallery / Event Space', emoji: '🖼️', avgCostRange: 'Free–$3,000', mustHave: true, searchHint: 'Search: gallery space hire, pop-up art venue [city]' },
    { type: 'CATERING', label: 'Opening Night Catering', emoji: '🥂', avgCostRange: '$300–$3,000', mustHave: false, searchHint: 'Search: art opening catering, wine and canapé service [city]' },
    { type: 'PHOTOGRAPHER', label: 'Event Photographer', emoji: '📸', avgCostRange: '$300–$1,500', mustHave: false, searchHint: 'Search: gallery opening photographer, art event photography [city]' },
    { type: 'MARKETING_PR', label: 'Art PR / Press', emoji: '📣', avgCostRange: '$500–$5,000', mustHave: false, searchHint: 'Search: art PR agency, gallery press [city]' },
    { type: 'LIGHTING', label: 'Lighting Design', emoji: '💡', avgCostRange: '$200–$2,000', mustHave: false, searchHint: 'Search: art installation lighting, gallery lighting hire [city]' },
  ],
  COMEDY_SHOW: [
    { type: 'VENUE', label: 'Venue', emoji: '😂', avgCostRange: '$200–$5,000', mustHave: true, searchHint: 'Search: comedy club hire, theater rental, bar with stage [city]' },
    { type: 'SOUND_AV', label: 'Sound System', emoji: '🔊', avgCostRange: '$200–$2,000', mustHave: true, searchHint: 'Search: PA hire, sound system rental [city]' },
    { type: 'MUSICIAN_PERFORMER', label: 'Comedians / Performers', emoji: '🎤', avgCostRange: '$100–$5,000', mustHave: true, searchHint: 'Search: stand-up comedians for hire, improv performers [city]' },
    { type: 'PHOTOGRAPHER', label: 'Photographer / Videographer', emoji: '📸', avgCostRange: '$200–$1,000', mustHave: false, searchHint: 'Search: comedy show photographer, live performance video [city]' },
    { type: 'MARKETING_PR', label: 'Promotion', emoji: '📣', avgCostRange: '$200–$2,000', mustHave: false, searchHint: 'Search: comedy night promotion, event marketing [city]' },
  ],
  CUSTOM: [],
};

// ── Budget templates (% of total) ────────────────────────────────────────────

export const BUDGET_TEMPLATES: Record<EventProductionType, BudgetTemplate[]> = {
  CONCERT: [
    { category: 'Venue', label: 'Venue Hire', estimatedPct: 20, notes: 'Deposit usually 25–50% upfront' },
    { category: 'Production', label: 'Sound & PA', estimatedPct: 15, notes: 'Includes engineer day rate' },
    { category: 'Production', label: 'Lighting & Stage', estimatedPct: 10, notes: '' },
    { category: 'Talent', label: 'Headliner Fee', estimatedPct: 20, notes: 'Negotiate guarantee vs. % of door' },
    { category: 'Talent', label: 'Support Acts', estimatedPct: 8, notes: '' },
    { category: 'Marketing', label: 'Marketing & Ads', estimatedPct: 10, notes: 'Includes Plajah ads + social' },
    { category: 'Security', label: 'Security', estimatedPct: 5, notes: '' },
    { category: 'Catering', label: 'Rider & Catering', estimatedPct: 5, notes: '' },
    { category: 'Media', label: 'Photo/Video', estimatedPct: 4, notes: '' },
    { category: 'Contingency', label: 'Contingency (10%)', estimatedPct: 3, notes: 'Never skip this line' },
  ],
  FILM_PREMIERE: [
    { category: 'Venue', label: 'Venue / Cinema Hire', estimatedPct: 25, notes: '' },
    { category: 'Production', label: 'AV / Projection', estimatedPct: 10, notes: '' },
    { category: 'Catering', label: 'Catering / Bar', estimatedPct: 30, notes: 'Biggest cost for premieres' },
    { category: 'Marketing', label: 'PR & Marketing', estimatedPct: 20, notes: '' },
    { category: 'Media', label: 'Red Carpet Photography', estimatedPct: 8, notes: '' },
    { category: 'Contingency', label: 'Contingency', estimatedPct: 7, notes: '' },
  ],
  BOOK_SIGNING: [
    { category: 'Venue', label: 'Venue', estimatedPct: 15, notes: 'Often free at bookstores' },
    { category: 'Marketing', label: 'Promotion & Ads', estimatedPct: 40, notes: 'Book signings live or die by marketing' },
    { category: 'Catering', label: 'Refreshments', estimatedPct: 15, notes: '' },
    { category: 'Media', label: 'Photography', estimatedPct: 20, notes: '' },
    { category: 'Contingency', label: 'Contingency', estimatedPct: 10, notes: '' },
  ],
  GAME_LAUNCH: [
    { category: 'Venue', label: 'Venue Hire', estimatedPct: 20, notes: '' },
    { category: 'Production', label: 'AV / Streaming Setup', estimatedPct: 20, notes: '' },
    { category: 'Marketing', label: 'Marketing & Influencers', estimatedPct: 30, notes: 'Influencer seeding is key' },
    { category: 'Catering', label: 'Food & Drinks', estimatedPct: 10, notes: '' },
    { category: 'Giveaways', label: 'Merch & Giveaways', estimatedPct: 12, notes: '' },
    { category: 'Contingency', label: 'Contingency', estimatedPct: 8, notes: '' },
  ],
  PODCAST_LIVE: [
    { category: 'Venue', label: 'Studio / Venue Hire', estimatedPct: 25, notes: 'Often day-rate or half-day' },
    { category: 'Production', label: 'Audio Engineering', estimatedPct: 20, notes: '' },
    { category: 'Marketing', label: 'Marketing & Promotion', estimatedPct: 35, notes: 'Episode and live taping promo' },
    { category: 'Media', label: 'Photography / Clips', estimatedPct: 10, notes: '' },
    { category: 'Contingency', label: 'Contingency', estimatedPct: 10, notes: '' },
  ],
  ART_SHOW: [
    { category: 'Venue', label: 'Gallery / Space Hire', estimatedPct: 25, notes: 'Negotiate percentage of sales instead' },
    { category: 'Production', label: 'Printing & Framing', estimatedPct: 30, notes: 'Biggest cost for art shows' },
    { category: 'Catering', label: 'Opening Night Catering', estimatedPct: 20, notes: 'Wine and snacks are expected' },
    { category: 'Marketing', label: 'Marketing & Invites', estimatedPct: 15, notes: '' },
    { category: 'Contingency', label: 'Contingency', estimatedPct: 10, notes: '' },
  ],
  COMEDY_SHOW: [
    { category: 'Talent', label: 'Performer Fees', estimatedPct: 35, notes: 'Headliner + support acts' },
    { category: 'Venue', label: 'Venue Hire', estimatedPct: 20, notes: '' },
    { category: 'Production', label: 'Sound & AV', estimatedPct: 10, notes: '' },
    { category: 'Marketing', label: 'Marketing & Ads', estimatedPct: 25, notes: '' },
    { category: 'Contingency', label: 'Contingency', estimatedPct: 10, notes: '' },
  ],
  CUSTOM: [],
};

// ── Contract templates ────────────────────────────────────────────────────────

export interface ContractTemplate { type: ContractType; title: string; body: string; }

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    type: 'VENUE',
    title: 'Venue Hire Agreement',
    body: `VENUE HIRE AGREEMENT

This agreement is made between [VENUE NAME] ("Venue") and [ARTIST/PROMOTER NAME] ("Hirer") for the following:

EVENT: [EVENT TITLE]
DATE: [EVENT DATE]
VENUE: [VENUE ADDRESS]
LOAD-IN TIME: [TIME]  |  DOORS: [TIME]  |  CURFEW: [TIME]
CAPACITY: [CAPACITY]

HIRE FEE: $[AMOUNT]
DEPOSIT (due on signing): $[AMOUNT]
BALANCE (due [DATE]): $[AMOUNT]

INCLUSIONS: [List what is included — sound system, lighting rig, bar staff, etc.]
EXCLUSIONS: [List what is NOT included]

CANCELLATION POLICY: If cancelled more than [X] days prior, deposit is refunded. Cancellation within [X] days forfeits deposit.

HOUSE RULES: [Insert venue house rules]

The Hirer agrees to leave the venue in the same condition as found. Any damage will be charged to the Hirer.

Signed: _________________________ (Hirer)  Date: ___________
Signed: _________________________ (Venue) Date: ___________`,
  },
  {
    type: 'SOUND_AV',
    title: 'Sound & AV Production Contract',
    body: `SOUND & AV PRODUCTION AGREEMENT

Between [COMPANY NAME] ("Company") and [ARTIST/PROMOTER] ("Client")

EVENT: [EVENT TITLE]  |  DATE: [DATE]  |  VENUE: [VENUE]

SCOPE OF WORK:
- PA System: [SPEC]
- Mixing Console: [SPEC]
- Microphones: [LIST]
- Backline: [LIST]
- [Other items]

ENGINEER(S): [NAME(S)] — Call time: [TIME]

TOTAL FEE: $[AMOUNT]
DEPOSIT (50%, due on signing): $[AMOUNT]
BALANCE (due day of event): $[AMOUNT]

TECHNICAL RIDER: See attached input list and stage plot.

The Company is not responsible for venue power failures or pre-existing electrical issues. Client must ensure adequate power supply as specified in the tech rider.

Signed: _________________________ (Client)  Date: ___________
Signed: _________________________ (Company) Date: ___________`,
  },
  {
    type: 'MUSICIAN_PERFORMER',
    title: 'Musician / Performer Agreement',
    body: `PERFORMER AGREEMENT

Between [PERFORMER NAME] ("Performer") and [ARTIST/PROMOTER NAME] ("Engager")

EVENT: [EVENT TITLE]
DATE: [DATE]
VENUE: [VENUE]
PERFORMANCE TIME: [SET TIME] — Duration: [LENGTH]
SOUND CHECK: [TIME]
CALL TIME: [TIME]

FEE: $[AMOUNT]
Payment method: [Stripe / Bank Transfer / Cash]
Payment due: [Before show / Day of / Within X days]

RIDER REQUIREMENTS: [List technical and hospitality rider items]

CANCELLATION: If Engager cancels within [X] days, Performer receives [X%] of fee as kill fee.
If Performer cancels within [X] days, they forfeit any deposit paid.

EXCLUSIVITY: Performer agrees not to perform within [X] miles of the venue in the [X] days before the event.

Signed: _________________________ (Performer) Date: ___________
Signed: _________________________ (Engager)   Date: ___________`,
  },
  {
    type: 'CATERING',
    title: 'Catering / Rider Fulfillment Agreement',
    body: `CATERING SERVICES AGREEMENT

Between [CATERING COMPANY] ("Caterer") and [ARTIST/PROMOTER] ("Client")

EVENT: [EVENT TITLE]  |  DATE: [DATE]  |  VENUE: [VENUE]

SERVICE: [Backstage rider / Public catering / Both]
GUEST COUNT: [NUMBER]
SERVICE WINDOW: [TIME] to [TIME]
SETUP TIME: [TIME]

MENU: [Describe menu or attach]
DIETARY REQUIREMENTS: [List]

TOTAL FEE: $[AMOUNT]  (includes service staff and equipment)
DEPOSIT (due on signing): $[AMOUNT]
BALANCE (due [DATE]): $[AMOUNT]

Signed: _________________________ (Client)   Date: ___________
Signed: _________________________ (Caterer)  Date: ___________`,
  },
  {
    type: 'PHOTOGRAPHER',
    title: 'Photography & Videography Agreement',
    body: `PHOTOGRAPHY / VIDEOGRAPHY AGREEMENT

Between [PHOTOGRAPHER/VIDEOGRAPHER NAME] ("Contractor") and [ARTIST/PROMOTER] ("Client")

EVENT: [EVENT TITLE]  |  DATE: [DATE]
CALL TIME: [TIME]  |  END TIME: [TIME]

DELIVERABLES:
□ [X] edited high-resolution photos (delivered within [X] business days)
□ [X]-minute highlight reel (delivered within [X] business days)
□ Raw files: Yes / No
□ Social media cuts: Yes / No

FEE: $[AMOUNT]
DEPOSIT (due on signing): $[AMOUNT]
BALANCE (due [DATE]): $[AMOUNT]

USAGE RIGHTS: Client receives non-exclusive licence to use images/video for promotional purposes. Contractor retains copyright and may use images in portfolio.

Signed: _________________________ (Client)      Date: ___________
Signed: _________________________ (Contractor)  Date: ___________`,
  },
  {
    type: 'SECURITY',
    title: 'Security Services Agreement',
    body: `SECURITY SERVICES AGREEMENT

Between [SECURITY COMPANY] ("Company") and [ARTIST/PROMOTER] ("Client")

EVENT: [EVENT TITLE]  |  DATE: [DATE]  |  VENUE: [VENUE]
EXPECTED ATTENDANCE: [NUMBER]
HOURS: [START TIME] to [END TIME]

PERSONNEL:
- [X] Door staff (SIA licensed)
- [X] Floor security
- [X] Backstage security
- Site supervisor: [NAME]

TOTAL FEE: $[AMOUNT]
DEPOSIT: $[AMOUNT]  |  Balance due: [DATE]

The Company holds current public liability insurance of [£/$X] million.
All door staff are SIA licensed / state certified (as applicable).

Signed: _________________________ (Client)   Date: ___________
Signed: _________________________ (Company)  Date: ___________`,
  },
];

// ── AI prompt templates ───────────────────────────────────────────────────────

export function buildIntroLetterPrompt(eventTitle: string, eventDate: string, venue: string, vendorType: ContractType, creatorName: string): string {
  const vendorLabels: Record<ContractType, string> = {
    VENUE: 'venue', SOUND_AV: 'sound and PA production company', CATERING: 'catering company',
    SECURITY: 'security company', PHOTOGRAPHER: 'photographer/videographer', MUSICIAN_PERFORMER: 'musician/performer',
    MARKETING_PR: 'marketing and PR agency', LIGHTING: 'lighting and staging company', TRANSPORT: 'equipment transport company', CUSTOM: 'vendor',
  };
  return `Write a professional and warm introductory email from ${creatorName} to a ${vendorLabels[vendorType]} for their event "${eventTitle}" on ${eventDate} at ${venue}.
The email should:
1. Briefly introduce ${creatorName} and their work
2. Describe the event (type, vibe, expected attendance)
3. Explain what they're looking for from this vendor
4. Ask for availability and a quote
5. Be friendly and professional, not corporate or stiff
Keep it under 200 words. Do not use placeholder brackets in the final letter — write it as if ready to send.`;
}

export function buildMuseEventContextPrompt(project: any): string {
  return `You are Muse, Plajah's AI assistant, helping a creator plan and manage their live event.

CURRENT EVENT:
- Title: ${project.title}
- Type: ${project.type}
- Date: ${project.eventDate ? new Date(project.eventDate).toLocaleDateString() : 'Not set'}
- Venue: ${project.venue || 'Not booked'}
- City: ${project.city || 'Not set'}
- Budget: $${((project.totalBudgetCents || 0) / 100).toFixed(0)}
- Tasks completed: ${project.tasks?.filter((t: any) => t.status === 'DONE').length ?? 0} / ${project.tasks?.length ?? 0}
- Vendors contracted: ${project.vendors?.filter((v: any) => v.status === 'CONTRACTED').length ?? 0}

Your role: Help the creator stay on track, suggest vendors, draft communications, give budget guidance, and answer any event planning questions. Be practical, encouraging, and specific. Never be vague.`;
}

export const EVENT_TYPE_META: Record<EventProductionType, { label: string; emoji: string; color: string; desc: string }> = {
  CONCERT:       { label: 'Concert / Live Music', emoji: '🎤', color: '#a78bfa', desc: 'Live performance with full production' },
  FILM_PREMIERE: { label: 'Film Premiere',         emoji: '🎬', color: '#f472b6', desc: 'Screening with red carpet and Q&A' },
  BOOK_SIGNING:  { label: 'Book Signing',           emoji: '📖', color: '#fbbf24', desc: 'Author signing and reading event' },
  GAME_LAUNCH:   { label: 'Game / App Launch',      emoji: '🎮', color: '#34d399', desc: 'Demo and launch event' },
  PODCAST_LIVE:  { label: 'Live Podcast Recording', emoji: '🎙️', color: '#60a5fa', desc: 'Live taping with audience' },
  ART_SHOW:      { label: 'Art Show / Exhibition',  emoji: '🖼️', color: '#fb923c', desc: 'Gallery opening or art showcase' },
  COMEDY_SHOW:   { label: 'Comedy Show',            emoji: '😂', color: '#f87171', desc: 'Stand-up or improv performance' },
  CUSTOM:        { label: 'Custom Event',           emoji: '✨', color: '#94a3b8', desc: 'Build your own checklist' },
};
