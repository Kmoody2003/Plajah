// Private half of a user profile: users/{uid}/private/profile.
//
// users/{uid} is a public card anyone can open. What must not be on it (email, age, guardian links,
// parental controls) lives here. firestore.rules lets the owner, the guardians, the provisioning
// teacher and platform admins read this doc and refuses to let those fields back onto the public one.
//
// Callers keep reading `profile.email`, `profile.guardianUid`, ...: fetchUserProfile and the profile
// listeners merge this doc in whenever the viewer may read it. Anyone else sees those fields as absent.

import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export const PRIVATE_USER_FIELDS = [
  'email', 'birthYear', 'dateOfBirth', 'guardianUid', 'coGuardianUids',
  'provisionedByTeacherUid', 'childUids', 'parentalControls',
  'masterEmail', 'aliases', 'fcmToken', 'fcmTokens',
] as const;

export const privateProfileRef = (uid: string) => doc(db, 'users', uid, 'private', 'profile');

/** Splits a profile write into what goes on the public doc and what goes on private/profile. */
export function splitUserFields<T extends Record<string, any>>(data: T): { pub: Record<string, any>; priv: Record<string, any> } {
  const pub: Record<string, any> = {};
  const priv: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if ((PRIVATE_USER_FIELDS as readonly string[]).includes(k)) priv[k] = v;
    else pub[k] = v;
  }
  return { pub, priv };
}

/** A public doc says whether this viewer could possibly read the private half, sparing denied reads. */
export function viewerMayReadPrivate(uid: string, pub: Record<string, any> | undefined): boolean {
  const me = auth.currentUser?.uid;
  if (!me) return false;
  if (me === uid) return true;
  return !!pub && (pub.isChild === true || pub.accountType === 'CHILD' || pub.childState === 'SCHOOL_PROVISIONED');
}

/** The private half, or {} when absent or not readable by this viewer. Never throws. */
export async function readPrivateProfile(uid: string): Promise<Record<string, any>> {
  try {
    const s = await getDoc(privateProfileRef(uid));
    return s.exists() ? (s.data() as Record<string, any>) : {};
  } catch { return {}; }
}

/** Public + private, the way the rest of the app expects a profile to look. */
export async function withPrivateFields<T extends Record<string, any>>(uid: string, pub: T): Promise<T> {
  if (!viewerMayReadPrivate(uid, pub)) return pub;
  return { ...pub, ...(await readPrivateProfile(uid)) };
}

/** Writes private fields for `uid`. Rules decide who may. */
export async function writePrivateProfile(uid: string, data: Record<string, any>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length) await setDoc(privateProfileRef(uid), clean, { merge: true });
}

/** Live merged profile. The first callback waits for the private half, so a child's controls are
 *  never briefly missing. Viewers who can't read it just get the public card. */
export function listenMergedProfile(
  uid: string,
  callback: (data: Record<string, any> | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  let pub: Record<string, any> | null | undefined;
  let priv: Record<string, any> | undefined;
  let unsubPriv: (() => void) | null = null;
  const emit = () => {
    if (pub === undefined) return;
    if (pub === null) { callback(null); return; }
    if (unsubPriv && priv === undefined) return;
    callback({ uid, ...pub, ...(priv || {}) });
  };
  const unsubPub = onSnapshot(doc(db, 'users', uid), (snap) => {
    pub = snap.exists() ? (snap.data() as Record<string, any>) : null;
    if (pub && !unsubPriv && viewerMayReadPrivate(uid, pub)) {
      unsubPriv = onSnapshot(privateProfileRef(uid),
        (s) => { priv = s.exists() ? (s.data() as Record<string, any>) : {}; emit(); },
        () => { priv = {}; emit(); });
    }
    emit();
  }, (e) => { if (onError) onError(e); else callback(null); });
  return () => { unsubPub(); unsubPriv?.(); };
}

/** Which grown-ups to loop in for these students, from the server: a teacher can't read a student's
 *  private doc directly. Empty on failure; the caller carries on without them. */
export async function fetchGuardiansOf(uids: string[], ctx?: { roomId?: string }): Promise<Record<string, string[]>> {
  const list = [...new Set(uids.filter(Boolean))].slice(0, 300);
  const u = auth.currentUser;
  if (!u || !list.length) return {};
  try {
    const r = await fetch('/api/learner-auth/guardians-of', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
      body: JSON.stringify({ uids: list, roomId: ctx?.roomId }),
    });
    if (!r.ok) return {};
    return ((await r.json()).guardians || {}) as Record<string, string[]>;
  } catch { return {}; }
}
