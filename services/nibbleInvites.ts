// nibbleInvites — share a "nibble" to bring your partner onto Plajah and pre-link
// them. The inviter creates a code (shareable link ?nibble=<code>); when the invitee
// signs in and opens it, they're linked to the inviter as partner (pending the
// inviter's confirm). Collection: `nibbleInvites`.
import { collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { UserProfile } from '../types';
import { setRelationship } from './relationships';

export interface NibbleInvite {
  code: string;
  inviterUid: string;
  inviterName: string;
  inviterPhoto?: string;
  status: 'OPEN' | 'ACCEPTED';
  accepterUid?: string;
  createdAt: number;
  acceptedAt?: number;
}

const genCode = () => Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 6);

const shareOrigin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com');

/** Create a fresh invite and return the code + a shareable URL. */
export async function createNibbleInvite(me: UserProfile): Promise<{ code: string; url: string }> {
  if (!me?.uid) throw new Error('Sign in to invite your partner.');
  const code = genCode();
  const invite: NibbleInvite = {
    code,
    inviterUid: me.uid,
    inviterName: me.displayName || 'Your partner',
    inviterPhoto: (me as any).photoURL || (me as any).avatarUrl || '',
    status: 'OPEN',
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'nibbleInvites', code), invite);
  return { code, url: `${shareOrigin()}/?nibble=${code}` };
}

export async function getNibbleInvite(code: string): Promise<NibbleInvite | null> {
  if (!code) return null;
  try {
    const snap = await getDoc(doc(db, 'nibbleInvites', code));
    return snap.exists() ? (snap.data() as NibbleInvite) : null;
  } catch { return null; }
}

/**
 * Accept an invite: mark it used and link ME to the inviter as partner (which sends
 * the inviter a confirm request). Rule-safe — I only write my own profile + the invite.
 */
export async function acceptNibbleInvite(code: string, me: UserProfile): Promise<{ ok: boolean; reason?: string; inviterUid?: string; inviterName?: string }> {
  const invite = await getNibbleInvite(code);
  if (!invite) return { ok: false, reason: 'That invite link is invalid or expired.' };
  if (!me?.uid) return { ok: false, reason: 'Sign in to accept.' };
  if (invite.inviterUid === me.uid) return { ok: false, reason: 'This is your own invite link.' };
  if (invite.status === 'ACCEPTED' && invite.accepterUid && invite.accepterUid !== me.uid) {
    return { ok: false, reason: 'This invite has already been used.' };
  }
  try {
    await updateDoc(doc(db, 'nibbleInvites', code), { status: 'ACCEPTED', accepterUid: me.uid, acceptedAt: Date.now() });
  } catch { /* the link write may be denied for edge cases; still link below */ }
  await setRelationship(me, { status: 'PARTNERED', partnerUid: invite.inviterUid, partnerName: invite.inviterName, isPublic: true });
  return { ok: true, inviterUid: invite.inviterUid, inviterName: invite.inviterName };
}

/** Read a ?nibble=<code> param from the current URL (returns the code or null). */
export function pendingNibbleCode(): string | null {
  if (typeof window === 'undefined') return null;
  try { return new URLSearchParams(window.location.search).get('nibble'); } catch { return null; }
}
