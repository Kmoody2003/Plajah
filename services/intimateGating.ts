import type { UserProfile, ChatRoom } from '../types';
import { updateUserProfile, deleteChatRoom, updateRoomIntimate } from './backendService';
import { deleteDiary } from './couplesDiary';
import { isPartneredStatus } from './relationships';

// ─────────────────────────────────────────────────────────────────────────
// Intimate Mode — gating & enrollment (Phase 2)
//
// Enforces the user's rules: 18+ only, opt-in enrollment (OFF by default),
// 1:1 private DMs only (never org/group), one active partner at a time, and
// "call it off" which permanently deletes the thread + diary for both.
//
// Profile fields (intimateEnrolled/intimateEnrolledAt/dateOfBirth/
// intimatePartnerUid) now live on UserProfile in types.ts.
// ─────────────────────────────────────────────────────────────────────────

export type IntimateProfile = UserProfile;

export const MIN_AGE = 18;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Whole-years age from a unix-ms date of birth. */
export function ageFromDob(dobMs: number): number {
  return Math.floor((Date.now() - dobMs) / YEAR_MS);
}

/** Education / school-professional accounts NEVER get Nibbles — it must never appear in an
 *  educational context. Covers students, teachers, school-provisioned children, and any
 *  admin/verified-teacher account. (Personal PARENT accounts are unaffected — they're adults.) */
export function isEducationAccount(p?: IntimateProfile | null): boolean {
  if (!p) return false;
  const t = (p as any).accountType;
  if (t === 'STUDENT' || t === 'TEACHER' || t === 'CHILD') return true;
  if ((p as any).childState === 'SCHOOL_PROVISIONED' || (p as any).provisionedByTeacherUid) return true;
  const tv = (p as any).teacherVerification;
  if (tv && tv !== 'UNVERIFIED') return true;
  if ((p as any).isAdmin || (p as any).role === 'ADMIN' || (p as any).isSchoolAdmin) return true;
  return false;
}

/** A minor account can never use intimate mode, regardless of enrollment. */
export function isBlockedMinor(p?: IntimateProfile | null): boolean {
  if (!p) return true;
  if (p.isChild || p.accountType === 'CHILD') return true;
  if (isEducationAccount(p)) return true; // Nibbles is strictly forbidden for education accounts
  if (typeof p.dateOfBirth === 'number' && ageFromDob(p.dateOfBirth) < MIN_AGE) return true;
  return false;
}

/** Eligible = adult (verified DOB, 18+), not a child account, and enrolled (opt-in). */
export function isIntimateEligible(p?: IntimateProfile | null): boolean {
  if (!p) return false;
  if (isBlockedMinor(p)) return false;
  if (typeof p.dateOfBirth !== 'number') return false; // must have provided DOB
  if (ageFromDob(p.dateOfBirth) < MIN_AGE) return false;
  return !!p.intimateEnrolled;
}

/** A human-readable reason a user can't enable Nibbles (or null if they can). */
export function ineligibilityReason(p?: IntimateProfile | null): string | null {
  if (!p) return 'Sign in to use Nibbles.';
  if (p.isChild || p.accountType === 'CHILD') return 'Nibbles is for adult accounts only.';
  if (isEducationAccount(p)) return 'Nibbles is not available on education accounts.';
  if (typeof p.dateOfBirth !== 'number') return 'Confirm your age to use Nibbles.';
  if (ageFromDob(p.dateOfBirth) < MIN_AGE) return 'Nibbles is 18+ only.';
  if (!p.intimateEnrolled) return 'Join Nibbles to turn it on.';
  return null;
}

/**
 * The relationship gate: I must have a partnered relationship status with THIS person
 * linked as my spouse/partner. If their profile is available and they're linked to
 * someone else, block it. Returns a reason or null if the link is good.
 */
export function relationshipReason(
  me?: IntimateProfile | null,
  partner?: IntimateProfile | null,
  otherUid?: string,
): string | null {
  if (!me) return 'Sign in to use Nibbles.';
  if (!isPartneredStatus(me.relationshipStatus)) return 'Set your relationship status on your profile to use Nibbles.';
  if (!me.relationshipPartnerUid) return 'Link your spouse or partner on your profile to use Nibbles.';
  if (otherUid && me.relationshipPartnerUid !== otherUid) return 'Nibbles only works with the partner linked on your profile.';
  if (partner && partner.relationshipPartnerUid && otherUid && partner.relationshipPartnerUid !== me.uid) {
    return 'This person is linked with someone else.';
  }
  return null;
}

/** Intimate mode is allowed ONLY on a 1:1 private DM (never org/group/live). */
export function isPrivateDM(room: ChatRoom): boolean {
  return room.type === 'PRIVATE' && Array.isArray(room.participants) && room.participants.length === 2;
}

/** The user's current intimate partner uid, if any. */
export function activePartnerUid(p?: IntimateProfile | null): string | null {
  return (p?.intimatePartnerUid as string) || null;
}

/** Enroll (opt-in): verify 18+ from the supplied DOB, then persist the flags. */
export async function enrollIntimate(uid: string, dobMs: number): Promise<void> {
  if (ageFromDob(dobMs) < MIN_AGE) throw new Error('You must be 18 or older to enroll.');
  await updateUserProfile(uid, {
    dateOfBirth: dobMs,
    intimateEnrolled: true,
    intimateEnrolledAt: Date.now(),
  });
}

/** Leave the program (keeps DOB; just clears the opt-in). */
export async function unenrollIntimate(uid: string): Promise<void> {
  await updateUserProfile(uid, { intimateEnrolled: false });
}

export interface BeginResult { ok: boolean; reason?: string }

/**
 * Attempt to turn intimate mode ON for a room. Enforces: my eligibility, the
 * partner not being a blocked minor, 1:1-DM-only, and single-active partner
 * (I can't already be intimate with someone else). Sets MY partner link + the
 * shared room flag. (The partner's own link is set when they engage; stale
 * links self-heal via reconcileStalePartner.)
 */
export async function beginIntimate(
  room: ChatRoom,
  me: IntimateProfile,
  partner: IntimateProfile | null,
  otherUid: string,
  skipEligibility = false, // set true right after enrollment (profile prop briefly stale)
): Promise<BeginResult> {
  if (!skipEligibility) {
    const reason = ineligibilityReason(me);
    if (reason) return { ok: false, reason };
  }
  if (!isPrivateDM(room)) return { ok: false, reason: 'Nibbles only works in a 1:1 direct message.' };
  if (partner && isBlockedMinor(partner)) return { ok: false, reason: 'This person cannot use Nibbles.' };
  // Relationship gate — must have this person linked as your partner on your profile.
  const relReason = relationshipReason(me, partner, otherUid);
  if (relReason) return { ok: false, reason: relReason };
  const current = activePartnerUid(me);
  if (current && current !== otherUid) {
    return { ok: false, reason: 'You can only have one Nibbles connection at a time. End the current one first.' };
  }
  await updateUserProfile(me.uid, { intimatePartnerUid: otherUid });
  await updateRoomIntimate(room.id, { isIntimate: true });
  return { ok: true };
}

/** Pause intimate mode without deleting anything (keeps thread + diary). */
export async function pauseIntimate(roomId: string): Promise<void> {
  await updateRoomIntimate(roomId, { isIntimate: false });
}

/**
 * "Call it off" — permanently end the connection: clears MY partner link,
 * deletes the shared diary AND the entire DM thread (messages + room) for both.
 * The other user's stale partner link self-heals on their next load.
 */
export async function callItOff(roomId: string, myUid: string): Promise<void> {
  await updateUserProfile(myUid, { intimatePartnerUid: null });
  await deleteDiary(roomId).catch(() => {});
  await deleteChatRoom(roomId).catch(() => {});
}

/**
 * Self-heal: if I still point at a partner but the intimate DM with them is
 * gone or no longer intimate, clear my stale link so single-active frees up.
 * Call on chat mount with my profile + my current rooms.
 */
export async function reconcileStalePartner(me: IntimateProfile, rooms: ChatRoom[]): Promise<void> {
  const partner = activePartnerUid(me);
  if (!partner) return;
  const live = rooms.some(r => isPrivateDM(r) && r.isIntimate && r.participants.includes(partner));
  if (!live) {
    await updateUserProfile(me.uid, { intimatePartnerUid: null }).catch(() => {});
  }
}
