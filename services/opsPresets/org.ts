/**
 * Org ops presets (OrgHub / Elevate): churches, nonprofits, cultural institutions, clubs and teams,
 * creative companies. Orgs keep their people in ChMS (chmsPeople); the CRM preset here supplies the
 * pipelines, segments and correspondence that sit on top of it.
 */
import type { OpsPreset } from './types';
import { COMMON_SEGMENTS, T, baseCorrespondence, cadence, duty, ev, localPlays, lost, play, prepSpine, promoSpine, social, stage, won } from './base';

const church: OpsPreset = {
  id: 'org_church', label: 'Church', accent: '#6D3FD6',
  events: [
    ev({ key: 'easter_christmas', label: 'Easter / Christmas services', emoji: '✝️', blurb: 'The two Sundays guests come. Extra services, guest parking, kids check-in and a follow-up plan.', format: 'HYBRID', durationMin: 75, tiers: [],
      runOfShow: [{ t: '-60m', what: 'Teams in place: parking, greeters, kids check-in', owner: 'Volunteer lead' }, { t: '0:00', what: 'Service', owner: 'Worship lead' }, { t: '+75m', what: 'Guest welcome table; connection cards into People', owner: 'Connections' }],
      checklist: [...prepSpine, { daysBefore: 42, task: 'Recruit extra volunteers for each service', owner: 'Volunteer lead' }, { daysBefore: 21, task: 'Order guest gifts and connection cards', owner: 'Connections' }],
      promo: [...promoSpine('Easter at church'), { daysBefore: 21, channel: 'mail', copy: 'Invitation postcard to the neighborhood (EDDM).' }, { daysBefore: 14, channel: 'billboard', copy: 'Billboard: service times and one warm line.' }] }),
    ev({ key: 'vbs', label: 'Vacation Bible School', emoji: '🎒', blurb: 'Free registration with medical/allergy questions, check-in tags and volunteer shifts.', format: 'IN_PERSON', durationMin: 180, tiers: [],
      runOfShow: [{ t: '08:30', what: 'Check-in and name tags', owner: 'Kids director' }, { t: '09:00', what: 'Opening rally', owner: 'Host' }, { t: '09:30', what: 'Rotations', owner: 'Crew leaders' }, { t: '11:45', what: 'Pickup with tag match', owner: 'Kids director' }],
      checklist: [...prepSpine, { daysBefore: 60, task: 'Background checks for every volunteer', owner: 'Kids director' }], promo: promoSpine('VBS') }),
    ev({ key: 'fundraiser_dinner', label: 'Mission fundraiser dinner', emoji: '🍽️', blurb: 'Ticketed dinner, sponsor tables and a give moment.', format: 'IN_PERSON', durationMin: 150, capacity: 200,
      tiers: [{ name: 'Seat', price: 50, qty: 160 }, { name: 'Sponsor a table (8)', price: 500, qty: 5, perks: 'Recognition on screens' }],
      runOfShow: [{ t: '18:00', what: 'Doors', owner: 'Host team' }, { t: '18:45', what: 'Dinner', owner: 'Hospitality' }, { t: '19:30', what: 'Story and give moment', owner: 'Pastor' }], checklist: prepSpine, promo: promoSpine('the fundraiser dinner'), merchTieIn: 'Apparel' }),
  ],
  crm: {
    contactNoun: 'guest', tags: ['first-time guest', 'second visit', 'member class', 'volunteer', 'prayer', 'small group'],
    pipelines: [{
      id: 'assimilation', label: 'Guest follow-up', noun: 'guest',
      stages: [stage('first_visit', 'First visit', 20, { slaDays: 2, nextAction: 'Pastor note within 48 hours', templateId: 'guest_letter' }), stage('second_visit', 'Second visit', 40, { slaDays: 14 }),
        stage('next_steps', 'Next steps class', 60), stage('group', 'In a group', 80), won('serving', 'Serving / member'), lost('moved_on', 'Moved on')],
    }, {
      id: 'volunteers', label: 'Volunteer pipeline', noun: 'volunteer',
      stages: [stage('interested', 'Interested', 30, { slaDays: 7 }), stage('screened', 'Background check', 60), stage('trained', 'Trained', 85), won('scheduled', 'On the schedule'), lost()],
    }],
    fields: [{ id: 'how_heard', label: 'How did you hear about us?', type: 'select', options: ['Friend', 'Online', 'Drove by', 'Event', 'Mail'] }, { id: 'kids', label: 'Kids (ages)', type: 'text' }, { id: 'interests', label: 'Interested in', type: 'text' }],
    segments: [...COMMON_SEGMENTS, { id: 'guests_30', label: 'Guests this month', rule: { tagsAny: ['first-time guest'], newWithinDays: 30 } }, { id: 'volunteers', label: 'Volunteers', rule: { tagsAny: ['volunteer'] } }],
  },
  correspondence: [
    { id: 'guest_letter', label: 'First-visit letter from the pastor', channel: 'letter', purpose: 'welcome', body: 'Dear {{first_name}},\n\nThank you for worshiping with us on Sunday. It meant a lot that you came. If there is any way we can pray for you, or if you have questions about faith or our church, I would be glad to hear from you.\n\nGrace and peace,\n{{sender_name}}\n{{business_name}}', trigger: { on: 'stage_enter', stageId: 'first_visit' } },
    T.welcome('We would love to help you find your people here.'),
    T.followUp('second_visit', 'Second visit', 'second_visit', 'Hi {{first_name}},\n\nGreat to see you again! Our next steps lunch is a relaxed way to meet the pastors and hear how to get connected.', 'Good to see you again'),
    T.eventInvite(), T.thankYouLetter('your generosity'), T.birthday('a prayer and a blessing from all of us'),
    T.postcard('You’re invited', 'Join us this Sunday. Kids program for every age, coffee on us.'),
  ],
  social: social([
    { id: 'sunday', label: 'Sunday', share: 35, ideas: ['Sermon clip: one minute that matters.', 'This Sunday: what to expect.'] },
    { id: 'stories', label: 'Stories', share: 25, ideas: ['Baptism Sunday.', 'Why I serve.'] },
    { id: 'community', label: 'Serving the city', share: 25, ideas: ['Food pantry Saturday.', 'Back-to-school drive.'] },
    { id: 'word', label: 'Daily word', share: 15, ideas: ['Verse of the day on Vellum.', 'Prayer prompt.'] },
  ], ['#church', '#sundayservice', '#faith'], cadence(4, 5, 3, 5)),
  marketing: [play({ id: 'neighborhood_invite', label: 'Easter / Christmas neighborhood invite', objective: 'event', channels: ['eddm'], budgetCents: 90000, durationDays: 14, radiusMi: 3, headline: 'You’re invited', body: 'Service times, kids program, one warm sentence. Mail 10 to 14 days before.', cta: 'Plan your visit', when: 'Easter and Christmas', mail: { format: 'postcard_6x11', list: 'eddm_routes' } }),
    play({ id: 'church_billboard', label: 'Seasonal billboard', objective: 'awareness', channels: ['billboard_dooh'], budgetCents: 100000, durationDays: 28, radiusMi: 5, headline: 'Come as you are.', body: 'Service times and the church name.', cta: 'Sundays 9 & 11', billboard: { line: 'Come as you are.', sub: 'Sundays 9 & 11' } }),
    play({ id: 'plan_visit', label: 'Plan-your-visit ads', objective: 'membership', channels: ['meta', 'plajah_house'], budgetCents: 30000, durationDays: 30, radiusMi: 10, headline: 'New in town?', body: 'What to expect on a Sunday, kids check-in, parking.', cta: 'Plan your visit', when: 'Always on' })],
  commerce: { pos: true, kiosk: true, onlineStore: true, merchShop: true, signageFeeds: ['EVENT', 'DEAL', 'PRODUCT'], posQuickKeys: ['Apparel', 'Books', 'Café'], note: 'Bookstore, café and event merch ring on one register; lobby screens show the next events and what is in the shop.' },
  staffToday: [duty('Pastor', ['First-time guests to call', 'Prayer requests'], 'people'), duty('Connections', ['Guest follow-up board', 'Next steps sign-ups'], 'people'), duty('Volunteer lead', ['Sunday rosters', 'Open slots'], 'mobilize'), duty('Admin', ['This week’s events', 'Bulletin and social queue'], 'events')],
};

const nonprofit: OpsPreset = {
  id: 'org_nonprofit', label: 'Nonprofit', accent: '#06D6A0',
  events: [
    ev({ key: 'gala', label: 'Annual gala', emoji: '🎟️', blurb: 'Tickets, sponsor tables, paddle raise and a silent auction.', format: 'IN_PERSON', durationMin: 240, capacity: 300,
      tiers: [{ name: 'Individual', price: 150, qty: 220 }, { name: 'Table of 10', price: 1400, qty: 6 }, { name: 'Presenting sponsor', price: 10000, qty: 1, perks: 'Naming, stage mention, screens' }],
      runOfShow: [{ t: '18:00', what: 'Reception and silent auction opens', owner: 'Events lead' }, { t: '19:00', what: 'Dinner and program', owner: 'ED' }, { t: '20:00', what: 'Paddle raise', owner: 'Auctioneer' }, { t: '21:00', what: 'Auction closes; checkout at POS', owner: 'Finance' }],
      checklist: [...prepSpine, { daysBefore: 120, task: 'Sponsor deck out; venue contract', owner: 'Development director' }, { daysBefore: 45, task: 'Auction items collected and valued', owner: 'Events lead' }],
      promo: [...promoSpine('the gala'), { daysBefore: 45, channel: 'mail', copy: 'Printed invitation to major donors.' }], merchTieIn: 'Apparel' }),
    ev({ key: 'volunteer_day', label: 'Volunteer day', emoji: '🤝', blurb: 'Free sign-up with shifts, waivers and a thank-you that turns volunteers into donors.', format: 'IN_PERSON', durationMin: 240, tiers: [],
      runOfShow: [{ t: '08:30', what: 'Check-in and safety talk', owner: 'Volunteer coordinator' }, { t: '09:00', what: 'Shifts', owner: 'Crew leads' }, { t: '12:30', what: 'Lunch and group photo', owner: 'Coordinator' }], checklist: prepSpine, promo: promoSpine('Volunteer day') }),
    ev({ key: 'fun_run', label: 'Fun run / walk', emoji: '🏃', blurb: 'Ticketed registration, team fundraising, race shirts from the shop.', format: 'IN_PERSON', durationMin: 180, tiers: [{ name: 'Adult', price: 35 }, { name: 'Kid (under 12)', price: 15 }], runOfShow: [{ t: '07:00', what: 'Packet pickup', owner: 'Registration' }, { t: '08:00', what: 'Start', owner: 'Race director' }], checklist: prepSpine, promo: promoSpine('the fun run'), merchTieIn: 'Apparel' }),
  ],
  crm: {
    contactNoun: 'supporter', tags: ['donor', 'monthly donor', 'major donor', 'volunteer', 'sponsor', 'board', 'foundation'],
    pipelines: [{
      id: 'donors', label: 'Donor journey', noun: 'donor', valueLabel: 'Annual giving',
      stages: [stage('first_gift', 'First gift', 30, { slaDays: 2, templateId: 'gift_thanks', nextAction: 'Thank within 48 hours' }), stage('second_gift', 'Second gift', 55), stage('monthly', 'Monthly', 80), won('major', 'Major donor'), lost('lapsed', 'Lapsed', { templateId: 'winback_email' })],
    }, {
      id: 'sponsors', label: 'Sponsorships & grants', noun: 'ask', valueLabel: 'Ask amount',
      stages: [stage('prospect', 'Prospect', 10), stage('cultivating', 'Cultivating', 30), stage('asked', 'Ask made', 50, { slaDays: 21 }), won('committed', 'Committed'), lost('declined', 'Declined')],
    }],
    fields: [{ id: 'interest', label: 'Program interest', type: 'text' }, { id: 'capacity', label: 'Giving capacity', type: 'currency' }, { id: 'employer', label: 'Employer (matching gifts)', type: 'text' }],
    segments: [...COMMON_SEGMENTS, { id: 'donors', label: 'Donors', rule: { tagsAny: ['donor', 'monthly donor', 'major donor'] } }, { id: 'lybunt', label: 'Gave before, not this year', rule: { tagsAny: ['donor'], inactiveDays: 365 } }],
  },
  correspondence: [
    { id: 'gift_thanks', label: 'Gift acknowledgment letter', channel: 'letter', purpose: 'thank_you', body: 'Dear {{first_name}},\n\nThank you for your gift of {{deal}}. Because of you, our work continues this month. No goods or services were provided in exchange for this contribution.\n\nWith gratitude,\n{{sender_name}}\n{{business_name}}', trigger: { on: 'stage_enter', stageId: 'first_gift' } },
    ...baseCorrespondence({ what: 'standing with our mission', winback: 'see what your support made possible this year', postcard: ['Your impact this year', 'Here’s what neighbors like you made possible. Give again at the address on our page.'] }),
  ],
  social: social([
    { id: 'impact', label: 'Impact', share: 40, ideas: ['One story, one number.', 'Where every dollar went.'] },
    { id: 'volunteers', label: 'Volunteers', share: 25, ideas: ['Volunteer of the month.', 'Saturday crew.'] },
    { id: 'asks', label: 'Calls to action', share: 20, ideas: ['Monthly giving: $10 does this.', 'Volunteer shifts open.'] },
    { id: 'partners', label: 'Partners', share: 15, ideas: ['Sponsor thank-you.', 'Community partner spotlight.'] },
  ], ['#nonprofit', '#giveback', '#community'], cadence(4, 5, 2, 4), ['plajah', 'instagram', 'facebook', 'linkedin']),
  marketing: [play({ id: 'year_end_appeal', label: 'Year-end appeal letter', objective: 'membership', channels: ['direct_mail'], budgetCents: 120000, durationDays: 30, headline: 'Before the year ends', body: 'Personal letter with a reply envelope to donors and lapsed donors; mailed late November.', cta: 'Give by Dec 31', when: 'Late November', mail: { format: 'letter', list: 'crm_segment', segmentId: 'donors' } }),
    play({ id: 'gala_billboard', label: 'Gala / campaign billboard', objective: 'event', channels: ['billboard_dooh'], budgetCents: 80000, durationDays: 21, radiusMi: 5, headline: 'Join us', body: '', cta: 'Tickets on Plajah', billboard: { line: 'Change starts here.', sub: 'Gala tickets on Plajah' } }),
    ...localPlays({ offer: 'Volunteer, give or come to our next event.', billboard: 'Neighbors helping neighbors.' }).filter(p => p.id === 'plajah_boost')],
  commerce: { pos: true, kiosk: true, onlineStore: true, merchShop: true, signageFeeds: ['EVENT', 'PRODUCT', 'DEAL'], posQuickKeys: ['Apparel', 'Event'], note: 'Shirts, auction checkout and event tickets share one catalog; every sale shows in the shop and on event screens.' },
  staffToday: [duty('Development', ['Gifts to thank (48h)', 'Asks pending'], 'people'), duty('Volunteer coordinator', ['Shifts this week', 'Unfilled slots'], 'mobilize'), duty('Programs', ['Upcoming events'], 'events')],
};

const cultural: OpsPreset = {
  ...nonprofit, id: 'org_cultural', label: 'Cultural institution', accent: '#E2C27E',
  events: [
    ev({ key: 'exhibit_opening', label: 'Exhibit opening', emoji: '🖼️', blurb: 'Members preview, then the public night. Shop features the catalog and prints.', format: 'IN_PERSON', durationMin: 180, tiers: [{ name: 'Member preview', price: 0, qty: 150 }, { name: 'Public', price: 15, qty: 300 }],
      runOfShow: [{ t: '17:30', what: 'Members preview', owner: 'Membership' }, { t: '19:00', what: 'Public opening and remarks', owner: 'Director' }], checklist: prepSpine, promo: [...promoSpine('the opening'), { daysBefore: 21, channel: 'billboard', copy: 'Exhibit billboard.' }], merchTieIn: 'Prints' }),
    ev({ key: 'workshop_series', label: 'Workshop series', emoji: '🎨', blurb: 'Ticketed classes with materials sold at the register.', format: 'IN_PERSON', durationMin: 120, capacity: 20, tiers: [{ name: 'Single session', price: 35 }, { name: 'Series (4)', price: 120 }], runOfShow: [{ t: '0:00', what: 'Class', owner: 'Teaching artist' }], checklist: prepSpine, promo: promoSpine('the workshop series') }),
  ],
  crm: { ...nonprofit.crm, contactNoun: 'patron', tags: ['member', 'donor', 'docent', 'school group', 'artist'] },
  commerce: { ...nonprofit.commerce, posQuickKeys: ['Admission', 'Prints', 'Books'], note: 'Admission, the gift shop and memberships share one register; lobby screens show what is on and what is in the shop.' },
};

const creative: OpsPreset = {
  id: 'org_creative', label: 'Label / studio / publisher', accent: '#D40055',
  events: [
    ev({ key: 'release_party', label: 'Release party / premiere', emoji: '💿', blurb: 'Ticketed listening party or premiere with merch drop and livestream.', format: 'HYBRID', durationMin: 180, capacity: 250, tiers: [{ name: 'GA', price: 20 }, { name: 'VIP + signed merch', price: 75, qty: 40 }],
      runOfShow: [{ t: '19:00', what: 'Doors; merch table live', owner: 'Merch lead' }, { t: '20:00', what: 'Premiere / set', owner: 'Artist' }, { t: '21:00', what: 'Signing', owner: 'Artist manager' }], checklist: prepSpine, promo: [...promoSpine('the release party'), { daysBefore: 14, channel: 'billboard', copy: 'Artist billboard in the home market.' }], merchTieIn: 'Apparel' }),
    ev({ key: 'showcase', label: 'Roster showcase', emoji: '🎤', blurb: 'Three acts, industry guest list, RSVP.', format: 'IN_PERSON', durationMin: 180, tiers: [], runOfShow: [{ t: '20:00', what: 'Act 1', owner: 'A&R' }], checklist: prepSpine, promo: promoSpine('the showcase') }),
  ],
  crm: {
    contactNoun: 'contact', tags: ['press', 'buyer', 'venue', 'brand partner', 'superfan', 'collaborator'],
    pipelines: [{ id: 'partnerships', label: 'Partnerships & sync', noun: 'deal', valueLabel: 'Deal value', stages: [stage('pitch', 'Pitch', 15, { slaDays: 7 }), stage('talks', 'In talks', 40), stage('terms', 'Terms', 70), won('signed', 'Signed'), lost('passed', 'Passed')] },
      { id: 'press', label: 'Press & playlists', noun: 'outlet', stages: [stage('pitched', 'Pitched', 20, { slaDays: 10 }), stage('interested', 'Interested', 50), won('covered', 'Covered / added'), lost('passed', 'Passed')] }],
    fields: [{ id: 'outlet', label: 'Outlet / company', type: 'text' }, { id: 'project', label: 'Project', type: 'text' }],
    segments: [...COMMON_SEGMENTS, { id: 'superfans', label: 'Superfans', rule: { tagsAny: ['superfan'] } }, { id: 'press', label: 'Press list', rule: { tagsAny: ['press'] } }],
  },
  correspondence: [...baseCorrespondence({ what: 'supporting the work', push: 'New drop from {{business_name}} is live.' }),
    T.followUp('pitch_followup', 'Pitch follow-up', 'pitch', 'Hi {{first_name}},\n\nCircling back on {{custom.project}}. Happy to send stems, a screener or an advance copy.', 'Re: {{custom.project}}')],
  social: social([
    { id: 'drops', label: 'Drops', share: 40, ideas: ['Out now.', 'Merch drop in 3, 2, 1.'] },
    { id: 'bts', label: 'Behind the scenes', share: 30, ideas: ['In the studio.', 'Rehearsal clip.'] },
    { id: 'fans', label: 'Fans', share: 30, ideas: ['Fan covers.', 'Tour photo dump.'] },
  ], ['#newmusic', '#indie', '#merch'], cadence(5, 3, 7, 7), ['plajah', 'instagram', 'tiktok', 'x']),
  marketing: [play({ id: 'release_flight', label: 'Release flight', objective: 'awareness', channels: ['meta', 'tiktok', 'plajah_house'], budgetCents: 50000, durationDays: 14, radiusMi: 50, headline: 'Out now', body: 'Short clip, one link.', cta: 'Listen on Plajah', when: 'Release week' }),
    play({ id: 'artist_billboard', label: 'Hometown billboard', objective: 'awareness', channels: ['billboard_dooh'], budgetCents: 60000, durationDays: 14, radiusMi: 10, headline: 'Out now', body: '', cta: 'Plajah', billboard: { line: 'Hometown hero. Out now.', sub: 'Listen on Plajah' } })],
  commerce: { pos: true, kiosk: true, onlineStore: true, merchShop: true, signageFeeds: ['PRODUCT', 'EVENT', 'NOW_PLAYING'], posQuickKeys: ['Apparel', 'Vinyl', 'Signed'], note: 'Tour merch, the online shop and the merch-table register share one stock count; the show screen sells what is actually left.' },
  staffToday: [duty('Manager', ['Partnership follow-ups', 'Release calendar'], 'people'), duty('Merch lead', ['Merch counts', 'Restock sizes'], 'store'), duty('Social', ['Queue this week’s posts'], 'social')],
};

const club: OpsPreset = {
  ...creative, id: 'org_club', label: 'Club / team', accent: '#FF8C00',
  events: [
    ev({ key: 'game_day', label: 'Game day / match', emoji: '🏟️', blurb: 'Tickets, concessions, merch tent, halftime promos.', format: 'IN_PERSON', durationMin: 180, tiers: [{ name: 'GA', price: 10 }, { name: 'Family (4)', price: 30 }],
      runOfShow: [{ t: '-90m', what: 'Gates, scanner, concessions open', owner: 'Ops' }, { t: '0:00', what: 'Kickoff', owner: 'Coach' }, { t: 'half', what: 'Halftime promo on screens', owner: 'Marketing' }], checklist: prepSpine, promo: promoSpine('game day'), merchTieIn: 'Apparel' }),
    ev({ key: 'meetup', label: 'Member meetup', emoji: '🤝', blurb: 'Free RSVP, members-only.', format: 'IN_PERSON', durationMin: 120, tiers: [], runOfShow: [{ t: '0:00', what: 'Meetup', owner: 'Organizer' }], checklist: prepSpine, promo: promoSpine('the meetup') }),
  ],
  crm: { ...creative.crm, contactNoun: 'member', tags: ['member', 'season ticket', 'sponsor', 'volunteer', 'alumni'],
    pipelines: [{ id: 'sponsors', label: 'Sponsors', noun: 'sponsor', valueLabel: 'Sponsorship', stages: [stage('prospect', 'Prospect', 15), stage('pitched', 'Pitched', 40, { slaDays: 14 }), won('signed', 'Signed'), lost()] }] },
  marketing: localPlays({ offer: 'Family 4-pack $30. Kids get a free scarf.', billboard: 'Home game Saturday.' }),
  correspondence: [...baseCorrespondence({ what: 'being part of the club', push: 'Game day at {{business_name}}: gates open 90 minutes early.' }),
    T.followUp('sponsor_followup', 'Sponsor follow-up', 'pitched', 'Hi {{first_name}},\n\nThanks for looking at the sponsorship packet. Happy to tailor a package around your goals for the season.', 'Season sponsorship')],
};

const genericOrg: OpsPreset = { ...nonprofit, id: 'org_other', label: 'Organization', accent: '#6B0099' };

export const ORG_PRESETS: Record<string, OpsPreset> = {
  CHURCH: church, RELIGIOUS: church,
  NONPROFIT: nonprofit, CULTURAL: cultural,
  LABEL: creative, STUDIO: creative, PUBLISHER: creative, BRAND: creative,
  CLUB: club, TEAM: club,
  OTHER: genericOrg, BUSINESS: genericOrg,
};

