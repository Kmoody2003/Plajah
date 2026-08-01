// accountCapabilities — the single source of truth for what an account IS and CAN DO.
//
// Part 1 of the backend overhaul. Historically `accountType` (an enum) lived
// alongside 8 hand-maintained booleans (isArtist, isBrandAdmin, isStudent, …)
// that drifted out of sync (updateAccountType wrote only the enum; the UI wrote
// only the booleans in local state). This module makes the enum authoritative:
//   • accountFlagUpdate(type) → the exact boolean set to persist for a type,
//   • capabilitiesFor(type)   → what feature surfaces that type unlocks,
//   • hasCapability(profile, cap) → gate any studio/settings surface on intent.
// Reads stay backward-compatible: legacy code that checks `profile.isArtist`
// keeps working because updateAccountType writes the flags too.

import type { AccountType, UserProfile } from '../types';

export type { AccountType };

export const ACCOUNT_TYPES: AccountType[] = [
  'FAN', 'ARTIST', 'BRAND', 'WRITER', 'STUDENT', 'TEACHER',
  'PARTNER', 'ORGANIZATION', 'CLERGY', 'ATHLETE', 'PARENT', 'CHILD',
  // EMPLOYEE is a managed, business-owned profile — provisioned by a business, never
  // self-selected in the account-type picker (intentionally omitted from the settings grid).
  'EMPLOYEE',
];

export interface AccountTypeMeta {
  type: AccountType;
  label: string;
  blurb: string;
}

export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  FAN:          { type: 'FAN',          label: 'Fan',          blurb: 'Follow, listen, watch, and collect.' },
  ARTIST:       { type: 'ARTIST',       label: 'Artist',       blurb: 'Publish music, video, and film; run a radio + store.' },
  BRAND:        { type: 'BRAND',        label: 'Brand',        blurb: 'A business page + community with staff and a roster.' },
  WRITER:       { type: 'WRITER',       label: 'Writer',       blurb: 'Write articles and self-publish books.' },
  STUDENT:      { type: 'STUDENT',      label: 'Student',      blurb: 'Enroll in classes and build a learning record.' },
  TEACHER:      { type: 'TEACHER',      label: 'Teacher',      blurb: 'Create classrooms and provision learners.' },
  PARTNER:      { type: 'PARTNER',      label: 'Partner',      blurb: 'Storage / service integrations.' },
  ORGANIZATION: { type: 'ORGANIZATION', label: 'Organization', blurb: 'An org page with sub-groups, staff, and giving.' },
  CLERGY:       { type: 'CLERGY',       label: 'Clergy',       blurb: 'A pastor, minister, imam, rabbi or faith leader — run ministries, sermons, prayer and giving.' },
  ATHLETE:      { type: 'ATHLETE',      label: 'Athlete',      blurb: 'A verified sports profile and achievements.' },
  PARENT:       { type: 'PARENT',       label: 'Parent',       blurb: 'Manage child accounts and controls.' },
  CHILD:        { type: 'CHILD',        label: 'Child',        blurb: 'A guardian-managed, safety-first account.' },
  EMPLOYEE:     { type: 'EMPLOYEE',     label: 'Employee',     blurb: 'A business-managed work identity with a role and work badge.' },
};

// ── Capabilities ──────────────────────────────────────────────────────────────
export type Capability =
  | 'CREATE_MUSIC' | 'CREATE_VIDEO' | 'CREATE_BOOK' | 'CREATE_ARTICLE' | 'CREATE_PHOTO' | 'CREATE_GAME'
  | 'RUN_RADIO' | 'LIVE_STREAM' | 'SELL_MERCH' | 'MONETIZE'
  | 'MANAGE_BRAND' | 'MANAGE_ORG'
  | 'TEACH' | 'ENROLL' | 'PROVISION_LEARNERS'
  | 'MANAGE_FAMILY' | 'ATHLETE_PROFILE' | 'PARTNER_INTEGRATIONS';

const CREATOR_CAPS: Capability[] = [
  'CREATE_MUSIC', 'CREATE_VIDEO', 'CREATE_BOOK', 'CREATE_ARTICLE', 'CREATE_PHOTO', 'CREATE_GAME',
  'RUN_RADIO', 'LIVE_STREAM', 'SELL_MERCH', 'MONETIZE',
];

export const CAPABILITIES_BY_TYPE: Record<AccountType, Capability[]> = {
  FAN:          ['CREATE_ARTICLE', 'CREATE_PHOTO'],
  ARTIST:       [...CREATOR_CAPS],
  WRITER:       ['CREATE_ARTICLE', 'CREATE_BOOK', 'SELL_MERCH', 'MONETIZE', 'LIVE_STREAM'],
  BRAND:        [...CREATOR_CAPS, 'MANAGE_BRAND', 'MANAGE_ORG'],
  ORGANIZATION: [...CREATOR_CAPS, 'MANAGE_ORG'],
  CLERGY:       [...CREATOR_CAPS, 'MANAGE_ORG'],
  TEACHER:      ['TEACH', 'PROVISION_LEARNERS', 'CREATE_ARTICLE', 'CREATE_VIDEO', 'LIVE_STREAM'],
  STUDENT:      ['ENROLL', 'CREATE_ARTICLE', 'CREATE_PHOTO'],
  PARENT:       ['MANAGE_FAMILY', 'CREATE_ARTICLE', 'CREATE_PHOTO'],
  CHILD:        ['ENROLL'],
  ATHLETE:      ['ATHLETE_PROFILE', 'CREATE_VIDEO', 'CREATE_PHOTO', 'LIVE_STREAM'],
  PARTNER:      ['PARTNER_INTEGRATIONS'],
  // Minimal by default — an employee's real powers come from their org role
  // (services/orgPermissions.ts), not from platform-wide account capabilities.
  EMPLOYEE:     ['CREATE_ARTICLE', 'CREATE_PHOTO'],
};

export function capabilitiesFor(type: AccountType | undefined): Set<Capability> {
  return new Set(CAPABILITIES_BY_TYPE[type || 'FAN'] || []);
}

/** True if the account (or bare type) unlocks a capability. */
export function hasCapability(
  who: Pick<UserProfile, 'accountType'> | AccountType | null | undefined,
  cap: Capability,
): boolean {
  const type = typeof who === 'string' ? who : who?.accountType;
  return capabilitiesFor(type).has(cap);
}

// ── Legacy boolean flags (derived) ────────────────────────────────────────────
// The exact boolean fields the old code queries/reads. Kept in sync by writing
// them alongside accountType.
export const ACCOUNT_FLAG_FIELDS = [
  'isFan', 'isArtist', 'isBrandAdmin', 'isWriter', 'isStudent', 'isTeacher', 'isPartner', 'isChild',
] as const;

/**
 * The boolean-flag patch to persist when an account's type changes, keeping the
 * legacy flags consistent with the enum.
 *
 * NOTE on `isArtist`: it doubles as a "has published content" discovery signal
 * (featured-artists query: where('isArtist','==',true)). So we only ever turn it
 * ON for ARTIST accounts and never clear it on a type switch — a creator who
 * later becomes, say, a BRAND shouldn't vanish from discovery.
 */
export function accountFlagUpdate(type: AccountType): Record<string, boolean> {
  const patch: Record<string, boolean> = {
    isFan: type === 'FAN',
    isBrandAdmin: type === 'BRAND',
    isWriter: type === 'WRITER',
    isStudent: type === 'STUDENT',
    isTeacher: type === 'TEACHER',
    isPartner: type === 'PARTNER',
    isChild: type === 'CHILD',
  };
  if (type === 'ARTIST') patch.isArtist = true;
  return patch;
}
