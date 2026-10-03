// elevateTemplates — default departments/ministries a new Elevate org is seeded with.
// Every one is renamable ("Youth" → "Next Gen"); the templateKey keeps the behavior stable.

import type { Ministry, OrgType } from '../types';

type Seed = Omit<Ministry, 'id'> & { templateKey: string };

const CHURCH_SEEDS: Seed[] = [
  { templateKey: 'finance',    name: 'Finance',              kind: 'DEPARTMENT', iconEmoji: '💰', isInternal: true,  threadAudience: 'DEPARTMENT', description: 'Giving, budgets and stewardship.' },
  { templateKey: 'media',      name: 'Media',                kind: 'DEPARTMENT', iconEmoji: '🎥', threadAudience: 'DEPARTMENT', description: 'Sermons, livestream, graphics and social.' },
  { templateKey: 'usher',      name: 'Ushers & Hospitality', kind: 'DEPARTMENT', iconEmoji: '🤝', threadAudience: 'ORG',        description: 'Welcome teams, greeters and ushers.' },
  { templateKey: 'youth',      name: 'Youth',                kind: 'MINISTRY',   iconEmoji: '🔥', allowFollowers: true, threadAudience: 'ORG', description: 'Middle & high school ministry.' },
  { templateKey: 'women',      name: "Women's Ministry",     kind: 'MINISTRY',   iconEmoji: '🌸', allowFollowers: true, threadAudience: 'ORG', description: 'Fellowship, study and service for women.' },
  { templateKey: 'men',        name: "Men's Ministry",       kind: 'MINISTRY',   iconEmoji: '🛡️', allowFollowers: true, threadAudience: 'ORG', description: 'Fellowship, study and service for men.' },
  { templateKey: 'deacons',    name: 'Deacons',              kind: 'DEPARTMENT', iconEmoji: '🕊️', threadAudience: 'DEPARTMENT', description: 'Service and care leadership.' },
  { templateKey: 'evangelism', name: 'Evangelism',           kind: 'MINISTRY',   iconEmoji: '📣', allowFollowers: true, threadAudience: 'ORG', description: 'Outreach and community engagement.' },
  { templateKey: 'seniors',    name: 'Seniors',              kind: 'MINISTRY',   iconEmoji: '🌿', allowFollowers: true, threadAudience: 'ORG', description: 'Fellowship and care for seniors.' },
  { templateKey: 'prayer',     name: 'Prayer Team',          kind: 'MINISTRY',   iconEmoji: '🙏', isInternal: true, threadAudience: 'DEPARTMENT', description: 'Intercessory prayer warriors.' },
];

const CULTURAL_SEEDS: Seed[] = [
  { templateKey: 'finance',    name: 'Finance & Development', kind: 'DEPARTMENT', iconEmoji: '💰', isInternal: true, threadAudience: 'DEPARTMENT' },
  { templateKey: 'media',      name: 'Media & Communications', kind: 'DEPARTMENT', iconEmoji: '🎥', threadAudience: 'DEPARTMENT' },
  { templateKey: 'programs',   name: 'Programs & Exhibits',   kind: 'MINISTRY',   iconEmoji: '🖼️', allowFollowers: true, threadAudience: 'ORG' },
  { templateKey: 'education',  name: 'Education',             kind: 'MINISTRY',   iconEmoji: '🎓', allowFollowers: true, threadAudience: 'ORG' },
  { templateKey: 'volunteers', name: 'Volunteers & Docents',  kind: 'DEPARTMENT', iconEmoji: '🤝', threadAudience: 'ORG' },
];

const NONPROFIT_SEEDS: Seed[] = [
  { templateKey: 'finance',    name: 'Finance',               kind: 'DEPARTMENT', iconEmoji: '💰', isInternal: true, threadAudience: 'DEPARTMENT' },
  { templateKey: 'media',      name: 'Communications',        kind: 'DEPARTMENT', iconEmoji: '🎥', threadAudience: 'DEPARTMENT' },
  { templateKey: 'programs',   name: 'Programs',              kind: 'MINISTRY',   iconEmoji: '🌍', allowFollowers: true, threadAudience: 'ORG' },
  { templateKey: 'fundraising',name: 'Fundraising',           kind: 'DEPARTMENT', iconEmoji: '🎗️', threadAudience: 'DEPARTMENT' },
  { templateKey: 'volunteers', name: 'Volunteers',            kind: 'DEPARTMENT', iconEmoji: '🤝', threadAudience: 'ORG' },
];

const OTHER_SEEDS: Seed[] = [
  { templateKey: 'finance',    name: 'Finance',               kind: 'DEPARTMENT', iconEmoji: '💰', isInternal: true, threadAudience: 'DEPARTMENT' },
  { templateKey: 'media',      name: 'Media',                 kind: 'DEPARTMENT', iconEmoji: '🎥', threadAudience: 'DEPARTMENT' },
  { templateKey: 'volunteers', name: 'Volunteers',            kind: 'DEPARTMENT', iconEmoji: '🤝', threadAudience: 'ORG' },
];

export const ELEVATE_ORG_KINDS: { orgType: OrgType; label: string; blurb: string }[] = [
  { orgType: 'CHURCH',    label: 'Church',     blurb: 'Congregation with pastors, ministries, giving and sermons.' },
  { orgType: 'RELIGIOUS', label: 'Religious',  blurb: 'Mosque, temple, synagogue or other faith community.' },
  { orgType: 'CULTURAL',  label: 'Cultural',   blurb: 'Museum, cultural center, heritage or arts institution.' },
  { orgType: 'NONPROFIT', label: 'Non-profit', blurb: 'Charity, foundation or community organization.' },
  { orgType: 'OTHER',     label: 'Other',      blurb: 'Any other organization with teams and members.' },
];

/** Faith orgs share one operational stack (pastoral roster, prayer, giving, sermons). */
export const isFaithOrg = (t?: OrgType) => t === 'CHURCH' || t === 'RELIGIOUS';
/** Orgs that run the Elevate operational layer at all. */
export const isElevateOrg = (t?: OrgType) => t === 'CHURCH' || t === 'RELIGIOUS' || t === 'CULTURAL' || t === 'NONPROFIT' || t === 'OTHER';

const newId = () => Math.random().toString(36).slice(2, 10);

/** Seed list for an org type, with fresh ids and stable order. */
export function defaultMinistries(orgType: OrgType): Ministry[] {
  const seeds = isFaithOrg(orgType) ? CHURCH_SEEDS : orgType === 'CULTURAL' ? CULTURAL_SEEDS : orgType === 'NONPROFIT' ? NONPROFIT_SEEDS : OTHER_SEEDS;
  return seeds.map((s, i) => ({ ...s, id: newId(), order: i, headUids: [] }));
}

/** Role keys that make sense to offer for an org type (cultural/nonprofit drop faith-only roles). */
export function roleKeysForOrg(orgType: OrgType): string[] {
  const all = ['SENIOR_PASTOR','PASTOR','MINISTER','ELDER','DEACON','DEPARTMENT_HEAD','FINANCE_DIRECTOR','TREASURER','BOOKKEEPER','ACCOUNTANT','TRUSTEE','MEDIA_TEAM','STAFF','PRAYER_WARRIOR','VOLUNTEER','MEMBER'];
  if (isFaithOrg(orgType)) return all;
  return ['DEPARTMENT_HEAD','FINANCE_DIRECTOR','TREASURER','BOOKKEEPER','ACCOUNTANT','TRUSTEE','MEDIA_TEAM','STAFF','VOLUNTEER','MEMBER'];
}

/** Org-type-aware label for the lead role ("Senior Pastor" vs "Executive Director"). */
export function leadTitleFor(orgType: OrgType): string {
  return isFaithOrg(orgType) ? 'Senior Pastor' : orgType === 'CULTURAL' ? 'Director' : 'Executive Director';
}
