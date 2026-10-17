// relationships — profile relationship status + the spouse/partner link that gates
// Nibbles (couples chat). Setting a partner sends the other person a request; when
// they point back at you, the link is "confirmed" (mutual). Purely profile-field
// based (no separate collection) so it reads anywhere a UserProfile is available.
//
// GATING RULE: Only PERSONAL accounts get relationship status.
// Never Brands, Organizations, Businesses/Partners, Employees, Students, Children,
// or Teachers — UNLESS a Teacher switches to their Personal Profile.
import type { AccountType, UserProfile, RelationshipStatus } from '../types';
import { updateUserProfile, fetchUserProfile, createNotification } from './backendService';

export const NON_PERSONAL_RELATIONSHIP_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'BRAND',
  'ORGANIZATION',
  'PARTNER',
  'STUDENT',
  'TEACHER',
  'CHILD',
  'EMPLOYEE',
]);

export const PERSONAL_RELATIONSHIP_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'FAN',
  'ARTIST',
  'WRITER',
  'ATHLETE',
  'PARENT',
  'CLERGY',
]);

/**
 * True when the profile is currently in Teacher / Academic mode (and can unlock
 * relationship status by switching to their personal profile).
 */
export function isTeacherProfileMode(
  profile?: Partial<UserProfile> | null,
  activePersonaKey?: string,
): boolean {
  if (!profile) return false;
  if (
    profile.accountType === 'CHILD' ||
    profile.isChild ||
    profile.accountType === 'STUDENT' ||
    profile.isStudent ||
    (profile as any).childState === 'SCHOOL_PROVISIONED' ||
    !!(profile as any).provisionedByTeacherUid
  ) {
    return false;
  }
  return (
    profile.accountType === 'TEACHER' ||
    !!profile.isTeacher ||
    activePersonaKey === 'academic'
  );
}

/**
 * True ONLY for personal accounts.
 * Blocks: Brands, Organizations, Businesses/Partners, Employees/Pre-provisioned seats,
 * Students, Children, and Teachers (unless the teacher switches to their personal profile).
 */
export function canHaveRelationshipStatus(
  profile?: Partial<UserProfile> | null,
  activePersonaKey?: string,
): boolean {
  if (!profile) return false;
  const t = profile.accountType;
  if (t && NON_PERSONAL_RELATIONSHIP_TYPES.has(t)) return false;

  // Legacy & structural flags for non-personal accounts
  if (profile.isBrandAdmin) return false;
  if (profile.isPartner) return false;
  if (profile.isStudent) return false;
  if (profile.isTeacher) return false;
  if (profile.isChild) return false;
  if (profile.isEmployee || (profile as any).isProvisioned) return false;
  if ((profile as any).childState === 'SCHOOL_PROVISIONED') return false;
  if ((profile as any).provisionedByTeacherUid) return false;
  if ((profile as any).guardianUid) return false;

  // Contextual persona check (when evaluating the active signed-in user session)
  if (activePersonaKey === 'business' || activePersonaKey === 'academic') {
    return false;
  }

  return true;
}

/**
 * Human-readable explanation when an account is not eligible for relationship status,
 * or null if the account is a personal account that CAN use relationship status.
 */
export function relationshipIneligibleReason(
  profile?: Partial<UserProfile> | null,
  activePersonaKey?: string,
): string | null {
  if (!profile) return 'Sign in to manage your relationship status.';
  if (canHaveRelationshipStatus(profile, activePersonaKey)) return null;

  if (
    profile.accountType === 'CHILD' ||
    profile.isChild ||
    profile.accountType === 'STUDENT' ||
    profile.isStudent ||
    (profile as any).childState === 'SCHOOL_PROVISIONED' ||
    (profile as any).provisionedByTeacherUid ||
    (profile as any).guardianUid
  ) {
    return 'Relationship status is only available on adult personal accounts (not Student or Child profiles).';
  }
  if (isTeacherProfileMode(profile, activePersonaKey)) {
    return 'Relationship status is disabled on Teacher profiles. Switch to your Personal Profile to view or set your relationship status.';
  }
  if (profile.accountType === 'BRAND' || profile.isBrandAdmin) {
    return 'Relationship status is only available on personal accounts (not Brand accounts).';
  }
  if (profile.accountType === 'ORGANIZATION') {
    return 'Relationship status is only available on personal accounts (not Organization accounts).';
  }
  if (profile.accountType === 'PARTNER' || profile.isPartner || activePersonaKey === 'business') {
    return 'Relationship status is only available on personal accounts (not Business or Partner profiles).';
  }
  if (profile.accountType === 'EMPLOYEE' || profile.isEmployee || (profile as any).isProvisioned) {
    return 'Relationship status is only available on personal accounts (not Employee or work profiles).';
  }
  return 'Relationship status is only available on personal accounts.';
}

export const RELATIONSHIP_OPTIONS: { value: RelationshipStatus; label: string; partnered: boolean }[] = [
  { value: 'SINGLE', label: 'Single', partnered: false },
  { value: 'DATING', label: 'In a relationship', partnered: true },
  { value: 'ENGAGED', label: 'Engaged', partnered: true },
  { value: 'MARRIED', label: 'Married', partnered: true },
  { value: 'PARTNERED', label: 'Partners', partnered: true },
  { value: 'COMPLICATED', label: "It's complicated", partnered: false },
];

export function statusLabel(s?: RelationshipStatus | null): string {
  return RELATIONSHIP_OPTIONS.find(o => o.value === s)?.label || 'Single';
}

/** A status that can carry a partner link (everything but Single / Complicated). */
export function isPartneredStatus(s?: RelationshipStatus | null): boolean {
  return !!RELATIONSHIP_OPTIONS.find(o => o.value === s)?.partnered;
}

/** True once both people point at each other — the relationship is mutually confirmed. */
export function partnerConfirmed(me?: UserProfile | null, partner?: UserProfile | null): boolean {
  return canHaveRelationshipStatus(me) && canHaveRelationshipStatus(partner)
    && !!me?.relationshipPartnerUid && !!partner
    && me.relationshipPartnerUid === partner.uid
    && partner.relationshipPartnerUid === me.uid;
}

/** My side of the link points at `otherUid` with a partnered status. */
export function iLinkPartner(me: UserProfile | null | undefined, otherUid: string): boolean {
  return !!me && canHaveRelationshipStatus(me) && isPartneredStatus(me.relationshipStatus) && me.relationshipPartnerUid === otherUid;
}

export interface SetRelationshipOpts {
  status: RelationshipStatus;
  partnerUid?: string | null;
  partnerName?: string;
  isPublic?: boolean;
}

/**
 * Save my relationship status. If I link a NEW partner, send them a request
 * notification so they can confirm it back. Clearing the partner (or picking a
 * non-partnered status) drops the link.
 *
 * Strictly gated to personal accounts on both sides.
 */
export async function setRelationship(me: UserProfile, opts: SetRelationshipOpts): Promise<void> {
  const ineligible = relationshipIneligibleReason(me);
  if (ineligible) {
    throw new Error(ineligible);
  }

  const wantsPartner = isPartneredStatus(opts.status) && !!opts.partnerUid;
  const partnerUid = wantsPartner ? opts.partnerUid! : null;
  const changedPartner = partnerUid && partnerUid !== me.relationshipPartnerUid;

  let otherProfile: UserProfile | null = null;
  if (partnerUid) {
    try {
      otherProfile = await fetchUserProfile(partnerUid);
    } catch { /* best-effort */ }
    if (otherProfile && !canHaveRelationshipStatus(otherProfile)) {
      throw new Error('You can only link a personal account as a relationship partner (not a brand, organization, business, student, or teacher profile).');
    }
  }

  await updateUserProfile(me.uid, {
    relationshipStatus: opts.status,
    relationshipPartnerUid: partnerUid,
    relationshipPartnerName: wantsPartner ? (opts.partnerName || '') : '',
    relationshipPublic: opts.isPublic ?? me.relationshipPublic ?? false, // private by default; owner always sees their own
    relationshipSince: partnerUid ? (me.relationshipSince || Date.now()) : undefined,
  } as Partial<UserProfile>);

  if (changedPartner) {
    // Does the partner already point back? Then it's mutual immediately.
    const mutual = otherProfile?.relationshipPartnerUid === me.uid;
    try {
      await createNotification({
        userId: partnerUid!,
        senderId: me.uid,
        senderName: me.displayName || 'Someone',
        senderPhoto: (me as any).photoURL || (me as any).avatarUrl || '',
        type: 'SYSTEM',
        title: mutual ? 'Relationship confirmed 💞' : 'Partner request 💞',
        message: mutual
          ? `You and ${me.displayName || 'your partner'} are now linked on Plajah.`
          : `${me.displayName || 'Someone'} listed you as their ${statusLabel(opts.status).toLowerCase()} partner. Link them back on your profile to confirm.`,
        link: 'PROFILE_SETTINGS',
        targetId: me.uid,
      });
    } catch { /* non-blocking */ }
  }
}

/** Confirm/accept a partner (point back at them). */
export async function confirmRelationship(me: UserProfile, partnerUid: string, partnerName: string, status: RelationshipStatus = 'PARTNERED'): Promise<void> {
  const ineligible = relationshipIneligibleReason(me);
  if (ineligible) throw new Error(ineligible);
  await setRelationship(me, { status: isPartneredStatus(me.relationshipStatus) ? me.relationshipStatus! : status, partnerUid, partnerName, isPublic: me.relationshipPublic ?? false });
}

/** Remove my partner link and go Single. Notifies the ex-partner (best-effort). */
export async function clearRelationship(me: UserProfile): Promise<void> {
  const ex = me.relationshipPartnerUid;
  await updateUserProfile(me.uid, {
    relationshipStatus: 'SINGLE',
    relationshipPartnerUid: null,
    relationshipPartnerName: '',
    relationshipSince: undefined,
  } as Partial<UserProfile>);
  if (ex) {
    try {
      await createNotification({
        userId: ex, senderId: me.uid, senderName: me.displayName || 'Someone',
        senderPhoto: (me as any).photoURL || (me as any).avatarUrl || '',
        type: 'SYSTEM', title: 'Relationship ended',
        message: `${me.displayName || 'Someone'} updated their relationship status.`,
        link: 'PROFILE_SETTINGS', targetId: me.uid,
      });
    } catch { /* non-blocking */ }
  }
}
