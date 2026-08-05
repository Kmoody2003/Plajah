// relationships — profile relationship status + the spouse/partner link that gates
// Nibbles (couples chat). Setting a partner sends the other person a request; when
// they point back at you, the link is "confirmed" (mutual). Purely profile-field
// based (no separate collection) so it reads anywhere a UserProfile is available.
import type { UserProfile, RelationshipStatus } from '../types';
import { updateUserProfile, fetchUserProfile, createNotification } from './backendService';

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
  return !!me?.relationshipPartnerUid && !!partner
    && me.relationshipPartnerUid === partner.uid
    && partner.relationshipPartnerUid === me.uid;
}

/** My side of the link points at `otherUid` with a partnered status. */
export function iLinkPartner(me: UserProfile | null | undefined, otherUid: string): boolean {
  return !!me && isPartneredStatus(me.relationshipStatus) && me.relationshipPartnerUid === otherUid;
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
 */
export async function setRelationship(me: UserProfile, opts: SetRelationshipOpts): Promise<void> {
  const wantsPartner = isPartneredStatus(opts.status) && !!opts.partnerUid;
  const partnerUid = wantsPartner ? opts.partnerUid! : null;
  const changedPartner = partnerUid && partnerUid !== me.relationshipPartnerUid;

  await updateUserProfile(me.uid, {
    relationshipStatus: opts.status,
    relationshipPartnerUid: partnerUid,
    relationshipPartnerName: wantsPartner ? (opts.partnerName || '') : '',
    relationshipPublic: opts.isPublic ?? me.relationshipPublic ?? false, // private by default; owner always sees their own
    relationshipSince: partnerUid ? (me.relationshipSince || Date.now()) : undefined,
  } as Partial<UserProfile>);

  if (changedPartner) {
    // Does the partner already point back? Then it's mutual immediately.
    let mutual = false;
    try { const other = await fetchUserProfile(partnerUid!); mutual = other?.relationshipPartnerUid === me.uid; } catch { /* best-effort */ }
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
