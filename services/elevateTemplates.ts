// elevateTemplates — default departments/ministries a new Elevate org is seeded with.
// Every one is renamable ("Youth" → "Next Gen"); the templateKey keeps the behavior stable.

import type { Ministry, Organization, OrgType } from '../types';

type Seed = Omit<Ministry, 'id'> & { templateKey: string };

const CHURCH_SEEDS: Seed[] = [
  { templateKey: 'finance',              name: 'Finance',                      kind: 'DEPARTMENT', iconEmoji: '💰', isInternal: true,  threadAudience: 'DEPARTMENT', description: 'Giving, budgets and stewardship.' },
  { templateKey: 'media',                name: 'Media',                        kind: 'DEPARTMENT', iconEmoji: '🎥', threadAudience: 'DEPARTMENT', description: 'Sermons, livestream, graphics and social.' },
  { templateKey: 'education',            name: 'Christian Education',          kind: 'MINISTRY',   iconEmoji: '🎓', allowFollowers: true, threadAudience: 'ORG', description: 'Templated classrooms, Sunday School, Catechism, Bible study & Academia Ed-Tech stack.' },
  { templateKey: 'music',                name: 'Music Department',             kind: 'DEPARTMENT', iconEmoji: '🎵', allowFollowers: true, threadAudience: 'ORG', description: 'Sanctuary Music Department, Chora Song Scratchpad, Setlists & Global Hymnal/Scores.' },
  { templateKey: 'music-worship-teams',  name: 'Worship Teams',                kind: 'MINISTRY',   iconEmoji: '🎤', allowFollowers: true, threadAudience: 'ORG', description: 'Music Sub-Department · Frontline praise vocalists, worship leaders & altar ministry.' },
  { templateKey: 'music-band',           name: 'Band',                         kind: 'MINISTRY',   iconEmoji: '🎸', allowFollowers: true, threadAudience: 'ORG', description: 'Music Sub-Department · Keys, organ, guitars, bass, drums, horns & strings.' },
  { templateKey: 'music-choir',          name: 'Choir',                        kind: 'MINISTRY',   iconEmoji: '🎶', allowFollowers: true, threadAudience: 'ORG', description: 'Music Sub-Department · Sanctuary SATB Choir, Gospel Mass Choir & section rehearsals.' },
  { templateKey: 'music-collective',     name: 'Collective Music Department',  kind: 'DEPARTMENT', iconEmoji: '🎼', allowFollowers: true, threadAudience: 'ORG', description: 'Music Sub-Department · Songwriting collective, Melos studio production & original liturgy.' },
  { templateKey: 'usher',                name: 'Ushers & Hospitality',         kind: 'DEPARTMENT', iconEmoji: '🤝', threadAudience: 'ORG',        description: 'Welcome teams, greeters and ushers.' },
  { templateKey: 'youth',                name: 'Youth',                        kind: 'MINISTRY',   iconEmoji: '🔥', allowFollowers: true, threadAudience: 'ORG', description: 'Middle & high school ministry.' },
  { templateKey: 'women',                name: "Women's Ministry",             kind: 'MINISTRY',   iconEmoji: '🌸', allowFollowers: true, threadAudience: 'ORG', description: 'Fellowship, study and service for women.' },
  { templateKey: 'men',                  name: "Men's Ministry",               kind: 'MINISTRY',   iconEmoji: '🛡️', allowFollowers: true, threadAudience: 'ORG', description: 'Fellowship, study and service for men.' },
  { templateKey: 'deacons',              name: 'Deacons',                      kind: 'DEPARTMENT', iconEmoji: '🕊️', threadAudience: 'DEPARTMENT', description: 'Service and care leadership.' },
  { templateKey: 'evangelism',           name: 'Evangelism',                   kind: 'MINISTRY',   iconEmoji: '📣', allowFollowers: true, threadAudience: 'ORG', description: 'Outreach and community engagement.' },
  { templateKey: 'seniors',              name: 'Seniors',                      kind: 'MINISTRY',   iconEmoji: '🌿', allowFollowers: true, threadAudience: 'ORG', description: 'Fellowship and care for seniors.' },
  { templateKey: 'prayer',               name: 'Prayer Team',                  kind: 'MINISTRY',   iconEmoji: '🙏', isInternal: true, threadAudience: 'DEPARTMENT', description: 'Intercessory prayer warriors.' },
];

export const MUSIC_SUB_DEPARTMENT_TEMPLATES = [
  'music',
  'music-worship-teams',
  'music-band',
  'music-choir',
  'music-collective',
] as const;

export type MusicSubDepartmentKey = (typeof MUSIC_SUB_DEPARTMENT_TEMPLATES)[number];

export const isMusicDepartmentMinistry = (m?: Pick<Ministry, 'templateKey' | 'name'> | null): boolean => {
  if (!m) return false;
  if (m.templateKey && (MUSIC_SUB_DEPARTMENT_TEMPLATES as readonly string[]).includes(m.templateKey)) return true;
  const n = (m.name || '').toLowerCase();
  return (
    n.includes('music') ||
    n.includes('worship team') ||
    n === 'band' ||
    n.includes('choir') ||
    n.includes('collective music')
  );
};

export const isEducationMinistry = (m?: Pick<Ministry, 'templateKey' | 'name'> | null): boolean => {
  if (!m) return false;
  if (m.templateKey === 'education') return true;
  const n = (m.name || '').toLowerCase();
  return n.includes('christian education') || n.includes('sunday school') || n.includes('education');
};

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

/** Seed list for an org type, with fresh ids and stable order. Every department is born with its social feed:
 *  public-facing ministries (followable, not internal) post to a PUBLIC feed; internal departments keep theirs
 *  DEPARTMENT-only; everything else is org-wide. Chat rooms per department are seeded by orgChatService. */
export function defaultMinistries(orgType: OrgType): Ministry[] {
  const seeds = isFaithOrg(orgType) ? CHURCH_SEEDS : orgType === 'CULTURAL' ? CULTURAL_SEEDS : orgType === 'NONPROFIT' ? NONPROFIT_SEEDS : OTHER_SEEDS;
  return seeds.map((s, i) => ({ ...s, id: newId(), order: i, headUids: [], threadAudience: feedAudienceFor(s) }));
}

/**
 * Ensures any Church/Religious organization includes Christian Education and the
 * Music Department + its 4 Sub-Categories (Worship Teams, Band, Choir, Collective Music Department),
 * even if the organization was created before these seeds were introduced.
 */
export function ensureChurchMusicAndEducationDepartments(org: Pick<Organization, 'id' | 'orgType' | 'ministries'>): Ministry[] {
  const existing = [...(org.ministries || [])];
  if (!isFaithOrg(org.orgType || 'CHURCH')) return existing;

  const requiredKeys = [
    'education',
    'music',
    'music-worship-teams',
    'music-band',
    'music-choir',
    'music-collective',
  ];

  for (const key of requiredKeys) {
    const seed = CHURCH_SEEDS.find(s => s.templateKey === key);
    if (!seed) continue;
    const found = existing.some(
      m => m.templateKey === key || m.name.toLowerCase() === seed.name.toLowerCase()
    );
    if (!found) {
      existing.push({
        ...seed,
        id: `dept_${key.replace(/[^a-z0-9]+/g, '_')}`,
        order: existing.length,
        headUids: [],
        threadAudience: feedAudienceFor(seed),
      });
    }
  }
  return existing;
}

/** Default feed audience for a department: public-facing ministry → PUBLIC, internal → DEPARTMENT, else ORG. */
export function feedAudienceFor(m: Pick<Ministry, 'allowFollowers' | 'isInternal' | 'kind' | 'threadAudience'>): NonNullable<Ministry['threadAudience']> {
  if (m.isInternal) return 'DEPARTMENT';
  if (m.allowFollowers && m.kind !== 'DEPARTMENT') return 'PUBLIC';
  return m.threadAudience || 'ORG';
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

