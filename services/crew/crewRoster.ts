/**
 * Aria Crew roster — every crew member's charter.
 *
 * `status: 'live'` means it works today; 'planned' members are shown with their charter so orgs and the
 * owner can see what is coming, and cannot be hired yet. Keep this honest: flip a member to 'live' only in
 * the commit that ships its worker.
 */
import type { CrewCharter, CrewMemberId } from './crewTypes';

const SELLS = ['BUSINESS', 'RESTAURANT', 'STUDIO', 'PUBLISHER', 'REALTY', 'CLUB', 'BRAND', 'LABEL'];
const MISSION = ['CHURCH', 'RELIGIOUS', 'NONPROFIT', 'CULTURAL'];

export const ORG_CREW: CrewCharter[] = [
  {
    id: 'front_desk', audience: 'org', name: 'Front Desk',
    role: 'Answers visitors on your page around the clock.',
    promise: 'Answers only from what you have published — your page, hours, location, departments and the questions you teach it. When it does not know, it says so and points to how to reach you.',
    can: ['read_public_profile', 'answer_visitors'],
    never: ['Guesses or invents a time, price or fact', 'Sees members, giving, finance or private files', 'Promises anything on your behalf'],
    approval: 'none', model: 'cloud', dailyModelCalls: 200, status: 'live',
    home: 'Your public page (Ask us) · Crew tab',
  },
  {
    id: 'grants_scout', audience: 'org', name: 'Grants Scout',
    role: 'Finds grants and contracts you qualify for and drafts with you.',
    promise: 'Matches federal grants and contracts to your profile, asks for the facts it is missing, and drafts sections you review.',
    can: ['read_grants', 'draft_message'],
    never: ['Signs, certifies or answers yes/no representations', 'Invents a number — it leaves [NEEDS YOUR FACT]', 'Sends your EIN, UEI or contacts to a model'],
    approval: 'person_approves', model: 'local_first', dailyModelCalls: 25, status: 'live',
    offeredTo: { orgTypes: [...MISSION, 'BUSINESS'] },
    home: 'Grants',
  },
  {
    id: 'follow_up', audience: 'org', name: 'Follow-up',
    role: 'Keeps guests and leads from slipping through the cracks.',
    promise: 'Watches your CRM pipeline, notices who has not heard back, and drafts the next note for you to send.',
    can: ['read_crm', 'draft_message'],
    never: ['Sends anything itself', 'Writes to minors', 'Reads giving or finance'],
    approval: 'person_approves', model: 'cloud', dailyModelCalls: 60, status: 'planned',
    home: 'People / CRM pipeline',
  },
  {
    id: 'shopkeeper', audience: 'org', name: 'Shopkeeper',
    role: 'Minds stock, deals and the menu board.',
    promise: 'Flags what is running low, drafts a reorder list, and keeps signage and the storefront agreeing on what is sold out.',
    can: ['read_inventory', 'draft_reorder'],
    never: ['Places an order or pays anyone', 'Changes a price'],
    approval: 'person_approves', model: 'none', dailyModelCalls: 0, status: 'planned',
    offeredTo: { orgTypes: SELLS, business: true },
    home: 'Store / Inventory',
  },
  {
    id: 'promoter', audience: 'org', name: 'Promoter',
    role: 'Turns your events and news into posts.',
    promise: 'Drafts announcements, social posts and a posting schedule from your events, sermons and products.',
    can: ['read_public_profile', 'draft_post'],
    never: ['Posts anything itself', 'Uses photos of people without your pick'],
    approval: 'person_approves', model: 'cloud', dailyModelCalls: 40, status: 'planned',
    home: 'Marketing',
  },
  {
    id: 'moderator', audience: 'org', name: 'Moderator',
    role: 'Keeps spam and abuse off your feed and comments.',
    promise: 'Hides spam and abusive comments for your review; you can put any of them back with one tap.',
    can: ['hide_content'],
    never: ['Deletes anything', 'Bans a person', 'Uses a model to judge people'],
    approval: 'none', model: 'none', dailyModelCalls: 0, status: 'planned',
    home: 'Social',
  },
  {
    id: 'watchman', audience: 'org', name: 'Watchman',
    role: 'Watches sign-ins and access changes in your org.',
    promise: 'Tells your IT Admin when someone signs in from somewhere new or gets more access than before.',
    can: ['read_security_signals'],
    never: ['Is steered by a model', 'Changes anyone’s access itself'],
    approval: 'none', model: 'none', dailyModelCalls: 0, status: 'planned',
    home: 'Security & Privacy',
  },
];

export const HQ_CREW: CrewCharter[] = [
  {
    id: 'hq_security', audience: 'hq', name: 'Security Council',
    role: 'Sentinel, Warden, Guardian, Medic, Auditor and Steward watch the platform every 15 minutes.',
    promise: 'Rule-based findings with evidence, reversible mitigations only, and a daily brief. Aria explains them; she cannot switch them off.',
    can: ['read_findings', 'read_security_signals'],
    never: ['Is steered by a model', 'Writes rules, config or code'],
    approval: 'none', model: 'none', dailyModelCalls: 0, status: 'live',
    home: 'Admin · Security Council',
  },
  {
    id: 'growth_analyst', audience: 'hq', name: 'Growth Analyst',
    role: 'Signups, who stays, and where people drop off.',
    promise: 'Real counts only. Proposes experiments; never launches one.',
    can: ['read_platform_metrics', 'write_briefing'],
    never: ['Shows a number it did not count', 'Reads anyone’s private content'],
    approval: 'person_approves', model: 'none', dailyModelCalls: 0, status: 'live',
    home: 'Admin · Aria HQ',
  },
  {
    id: 'vision_keeper', audience: 'hq', name: 'Keeper of the Vision',
    role: 'Holds your long-term decisions and flags drift.',
    promise: 'Keeps the standing rules (no held money, 5% direct fee, indie-first Chora, desktop-first AI…) in front of every plan, and tracks the drifts you log until they are fixed.',
    can: ['write_briefing'],
    never: ['Changes a decision — only you do'],
    approval: 'none', model: 'none', dailyModelCalls: 0, status: 'live',
    home: 'Admin · Aria HQ',
  },
  {
    id: 'strategist', audience: 'hq', name: 'Strategist',
    role: 'Market and competitor reads, argued both ways.',
    promise: 'Makes the case for and against a direction in the council format, with sources.',
    can: ['read_platform_metrics', 'write_briefing'],
    never: ['Decides — it advises'],
    approval: 'person_approves', model: 'cloud', dailyModelCalls: 10, status: 'planned',
    home: 'Admin · Aria HQ',
  },
  {
    id: 'counsel', audience: 'hq', name: 'Counsel',
    role: 'Issue-spotter for Terms, copyright, payments and privacy.',
    promise: 'Reads changes against current law and flags what needs a real lawyer. It spots issues; you or an attorney make every legal call.',
    can: ['write_briefing'],
    never: ['Gives legal advice to act on alone', 'Files, signs or sends anything'],
    approval: 'person_approves', model: 'cloud', dailyModelCalls: 10, status: 'planned',
    home: 'Admin · Aria HQ',
  },
];

export const ALL_CREW: CrewCharter[] = [...ORG_CREW, ...HQ_CREW];
const BY_ID = new Map(ALL_CREW.map(c => [c.id, c]));
export const charterFor = (id: string): CrewCharter | undefined => BY_ID.get(id as CrewMemberId);

/** The org crew offered to this kind of org (planned ones included, so the card can say "coming"). */
export function offeredOrgCrew(org: { orgType?: string | null; isBusinessPage?: boolean | null }): CrewCharter[] {
  const t = String(org.orgType || '').toUpperCase();
  return ORG_CREW.filter(c => {
    const o = c.offeredTo;
    if (!o || (!o.orgTypes?.length && !o.business)) return true;
    return (o.orgTypes || []).includes(t) || (!!o.business && !!org.isBusinessPage);
  });
}
