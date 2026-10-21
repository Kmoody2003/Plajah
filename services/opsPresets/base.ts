/** Shared building blocks for ops presets. Pure. */
import type {
  CorrespondenceTemplate, CrmPipeline, CrmSegment, CrmStage, EventPlaybook, MarketingPlay, SocialNet, SocialPlaybook, StaffDuty,
} from './types';

// ── CRM ──────────────────────────────────────────────────────────────────

export const stage = (id: string, label: string, probability: number, o: Partial<CrmStage> = {}): CrmStage =>
  ({ id, label, kind: 'open', probability, ...o });
export const won = (id: string, label: string, o: Partial<CrmStage> = {}): CrmStage => ({ id, label, kind: 'won', probability: 100, ...o });
export const lost = (id = 'lost', label = 'Lost', o: Partial<CrmStage> = {}): CrmStage => ({ id, label, kind: 'lost', probability: 0, ...o });

/** Every business gets a regulars pipeline: new → returning → regular → VIP, with lapsed as the off-ramp. */
export const customerLifecycle = (noun = 'customer'): CrmPipeline => ({
  id: 'lifecycle',
  label: `${noun[0].toUpperCase()}${noun.slice(1)} lifecycle`,
  noun,
  stages: [
    stage('new', 'New', 20, { slaDays: 30, nextAction: 'Welcome note and first-visit thank-you', templateId: 'welcome_email' }),
    stage('returning', 'Returning', 50, { slaDays: 45, nextAction: 'Invite to loyalty' }),
    stage('regular', 'Regular', 80, { slaDays: 60 }),
    won('vip', 'VIP', { nextAction: 'Personal thank-you, early access' }),
    lost('lapsed', 'Lapsed', { templateId: 'winback_email' }),
  ],
});

export const COMMON_SEGMENTS: CrmSegment[] = [
  { id: 'new_30', label: 'New this month', rule: { newWithinDays: 30 } },
  { id: 'regulars', label: 'Regulars (5+ visits)', rule: { minVisits: 5 } },
  { id: 'big_spenders', label: 'Top spenders ($500+)', rule: { minSpend: 500 } },
  { id: 'winback_60', label: 'Haven’t seen in 60 days', rule: { inactiveDays: 60 } },
  { id: 'opted_in', label: 'Marketing opt-in', rule: { optedIn: true } },
  { id: 'mailable', label: 'Has a mailing address', rule: { hasAddress: true } },
];

// ── Correspondence ───────────────────────────────────────────────────────

const SIGN = '\n\n{{sender_name}}\n{{business_name}} · {{business_phone}}';

export const T = {
  welcome: (extra = ''): CorrespondenceTemplate => ({
    id: 'welcome_email', label: 'Welcome', channel: 'email', purpose: 'welcome',
    subject: 'Welcome to {{business_name}}',
    body: `Hi {{first_name}},\n\nThanks for coming in. ${extra || 'We are glad you found us.'} Reply to this note any time; a real person reads it.${SIGN}`,
    trigger: { on: 'new_contact' },
  }),
  thankYou: (what = 'your visit'): CorrespondenceTemplate => ({
    id: 'thank_you_email', label: 'Thank you', channel: 'email', purpose: 'thank_you',
    subject: 'Thank you, {{first_name}}',
    body: `Hi {{first_name}},\n\nThank you for ${what}. If anything was less than great, tell us and we will make it right.${SIGN}`,
    trigger: { on: 'after_purchase', days: 1 },
  }),
  review: (): CorrespondenceTemplate => ({
    id: 'review_request', label: 'Ask for a review', channel: 'email', purpose: 'review_request',
    subject: 'Quick favor, {{first_name}}?',
    body: `Hi {{first_name}},\n\nIf we earned it, a short review helps a small business more than you would think. It takes a minute.${SIGN}`,
    trigger: { on: 'after_purchase', days: 3 },
  }),
  winback: (offer = 'something on us next time'): CorrespondenceTemplate => ({
    id: 'winback_email', label: 'We miss you', channel: 'email', purpose: 'winback', promotional: true,
    subject: 'It has been a while, {{first_name}}',
    body: `Hi {{first_name}},\n\nWe have not seen you in a bit and wanted to say hello. Come by this month and ${offer}.${SIGN}`,
    trigger: { on: 'inactive_days', days: 60 },
  }),
  birthday: (gift = 'a little something on us'): CorrespondenceTemplate => ({
    id: 'birthday_push', label: 'Birthday', channel: 'push', purpose: 'birthday', promotional: true,
    body: `Happy birthday, {{first_name}}! Stop by {{business_name}} this week for ${gift}.`,
    trigger: { on: 'birthday' },
  }),
  eventInvite: (): CorrespondenceTemplate => ({
    id: 'event_invite', label: 'Event invitation', channel: 'email', purpose: 'event_invite', promotional: true,
    subject: 'You are invited: {{event_title}}',
    body: `Hi {{first_name}},\n\nWe are hosting {{event_title}} on {{event_date}} and would love to see you there. Details and RSVP are on our page.${SIGN}`,
    trigger: { on: 'manual' },
  }),
  promoPush: (line: string): CorrespondenceTemplate => ({
    id: 'promo_push', label: 'Promo push', channel: 'push', purpose: 'promo', promotional: true,
    body: line, trigger: { on: 'manual' },
  }),
  thankYouLetter: (what = 'your business'): CorrespondenceTemplate => ({
    id: 'thank_you_letter', label: 'Handwritten-style thank-you letter', channel: 'letter', purpose: 'thank_you',
    body: `Dear {{first_name}},\n\nThank you for ${what}. Customers like you are the reason we open the doors every morning. If there is ever anything we can do, call me directly at {{business_phone}}.\n\nWith gratitude,\n{{sender_name}}\n{{business_name}}`,
    trigger: { on: 'manual' },
  }),
  postcard: (headline: string, line: string): CorrespondenceTemplate => ({
    id: 'promo_postcard', label: 'Promo postcard', channel: 'postcard', purpose: 'promo', promotional: true,
    subject: headline,
    body: `${line}\n\n{{business_name}}\n{{business_address}} · {{business_phone}}`,
    trigger: { on: 'manual' },
  }),
  followUp: (id: string, label: string, stageId: string, body: string, subject = 'Following up, {{first_name}}'): CorrespondenceTemplate => ({
    id, label, channel: 'email', purpose: 'follow_up', subject, body: `${body}${SIGN}`, trigger: { on: 'stage_enter', stageId },
  }),
  reminder: (id: string, label: string, body: string): CorrespondenceTemplate => ({
    id, label, channel: 'push', purpose: 'reminder', body, trigger: { on: 'manual' },
  }),
};

/** The baseline set every business gets; presets add type-specific ones on top. */
export const baseCorrespondence = (o: { what?: string; winback?: string; birthday?: string; postcard?: [string, string]; push?: string } = {}): CorrespondenceTemplate[] => [
  T.welcome(), T.thankYou(o.what), T.review(), T.winback(o.winback), T.birthday(o.birthday), T.eventInvite(),
  T.thankYouLetter(o.what), T.postcard(...(o.postcard ?? ['Neighbors save more', 'Bring this card in for 10% off your next visit.'] as [string, string])),
  T.promoPush(o.push ?? 'New this week at {{business_name}}. Come see what just came in.'),
];

// ── Social ───────────────────────────────────────────────────────────────

const LOCAL: SocialNet[] = ['plajah', 'instagram', 'facebook'];
export const cadence = (ig = 4, fb = 3, tt = 3, plajah = 5): SocialPlaybook['cadence'] => [
  { network: 'plajah', perWeek: plajah, bestTimes: ['08:00', '12:00', '18:00'] },
  { network: 'instagram', perWeek: ig, bestTimes: ['11:00', '19:00'] },
  { network: 'facebook', perWeek: fb, bestTimes: ['09:00', '13:00'] },
  ...(tt ? [{ network: 'tiktok' as SocialNet, perWeek: tt, bestTimes: ['18:00', '21:00'] }] : []),
];

/** Build a two-week starter calendar from pillar ideas: one post a weekday, rotating pillars. */
export function starterCalendar(pillars: SocialPlaybook['pillars'], nets: SocialNet[] = LOCAL): SocialPlaybook['starterPosts'] {
  const out: SocialPlaybook['starterPosts'] = [];
  const times = ['11:30', '17:30', '08:30', '12:15', '18:00'];
  let i = 0;
  for (let day = 0; day < 14; day++) {
    if (day % 7 === 6) continue; // Sundays off
    const p = pillars[i % pillars.length];
    const idea = p.ideas[Math.floor(i / pillars.length) % p.ideas.length];
    out.push({ pillar: p.id, text: idea, dayOffset: day, time: times[day % times.length], networks: nets });
    i++;
  }
  return out;
}

export const social = (pillars: SocialPlaybook['pillars'], hashtags: string[], c = cadence(), nets?: SocialNet[]): SocialPlaybook =>
  ({ pillars, cadence: c, starterPosts: starterCalendar(pillars, nets), hashtags });

// ── Marketing ────────────────────────────────────────────────────────────

export const play = (p: MarketingPlay): MarketingPlay => p;

/** Opening / always-on local plays most storefronts share. */
export const localPlays = (name: { offer: string; billboard: string; sub?: string }): MarketingPlay[] => [
  play({
    id: 'eddm_neighbors', label: 'Every-door mail to the neighborhood', objective: 'traffic', channels: ['eddm'],
    budgetCents: 75000, durationDays: 21, radiusMi: 2, headline: 'Your neighbors already shop here',
    body: name.offer, cta: 'Bring this card in', when: 'Opening month, then each spring and fall',
    mail: { format: 'postcard_6x11', list: 'eddm_routes' },
  }),
  play({
    id: 'billboard_local', label: 'Digital billboard near the store', objective: 'awareness', channels: ['billboard_dooh'],
    budgetCents: 120000, durationDays: 28, radiusMi: 3, headline: name.billboard, body: '', cta: name.sub ?? 'Next exit',
    when: 'Grand opening and peak season', billboard: { line: name.billboard, sub: name.sub },
  }),
  play({
    id: 'mail_winback', label: 'Win-back postcard to lapsed customers', objective: 'sales', channels: ['direct_mail'],
    budgetCents: 25000, durationDays: 14, headline: 'We saved you a spot', body: name.offer, cta: 'Redeem by the date on the card',
    when: 'Quarterly', mail: { format: 'postcard_6x9', list: 'crm_segment', segmentId: 'winback_60' },
  }),
  play({
    id: 'plajah_boost', label: 'Plajah local boost', objective: 'traffic', channels: ['plajah_house', 'meta'],
    budgetCents: 15000, durationDays: 14, radiusMi: 5, headline: 'New in the neighborhood', body: name.offer, cta: 'See the shop',
    when: 'Always on, small budget',
  }),
];

// ── Events ───────────────────────────────────────────────────────────────

export const ev = (p: EventPlaybook): EventPlaybook => p;

/** The promotion spine every event gets; playbooks add their own beats. */
export const promoSpine = (title: string): EventPlaybook['promo'] => [
  { daysBefore: 28, channel: 'social', copy: `Save the date: ${title}.` },
  { daysBefore: 21, channel: 'evite', copy: 'Send invitations to regulars and VIPs.' },
  { daysBefore: 14, channel: 'email', copy: `${title} is two weeks out. RSVP or grab tickets.` },
  { daysBefore: 10, channel: 'signage', copy: 'Put the event slide on every in-store screen.' },
  { daysBefore: 3, channel: 'push', copy: `${title} is this week.` },
  { daysBefore: 0, channel: 'social', copy: 'Going live now. Post stories through the event.' },
];

export const prepSpine: EventPlaybook['checklist'] = [
  { daysBefore: 30, task: 'Lock date, space and budget', owner: 'Owner' },
  { daysBefore: 21, task: 'Publish the event page and open RSVP or tickets', owner: 'Owner' },
  { daysBefore: 14, task: 'Confirm staff schedule and roles', owner: 'Manager' },
  { daysBefore: 7, task: 'Stock check on featured items; set POS quick keys', owner: 'Manager' },
  { daysBefore: 2, task: 'Print check-in list; test kiosk and scanner', owner: 'Manager' },
  { daysBefore: -1, task: 'Thank-you note to attendees; log new contacts in CRM', owner: 'Owner' },
];

// ── Staff ────────────────────────────────────────────────────────────────

export const duty = (role: string, duties: string[], opens?: string): StaffDuty => ({ role, duties, opens });
