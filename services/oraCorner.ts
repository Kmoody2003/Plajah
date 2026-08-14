import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import { db, auth } from './backendService';
import { getProfile, getCheckin, listGoals, currentSeason } from './oraService';

// ─────────────────────────────────────────────────────────────────────────
// Ora — your corner (accountability).
//
// Your corner is up to five people who can see that you are showing up — from
// of what they see is the entire design:
//
//   THEY SEE:      a streak number, whether you checked in today, and how many
//                  goals are active vs done.
//   THEY NEVER SEE: journal entries, journal titles, check-in notes, your mood
//                  value, goal titles, goal detail, or anything about which
//                  services you use.
//
// That list is deliberately lossy. "How is Kenne doing" should be answerable by
// a friend without the friend reading anything Kenne wrote. Counts support
// encouragement; contents would make a corner a surveillance tool, and the
// moment a corner can surveil, nobody writes honestly in the journal again.
//
// Two collections, both top-level because they are cross-user by nature:
//   oraCorner/{id}        — membership. Owner writes, members read.
//   oraCornerStatus/{uid}  — the lossy status card. Owner writes, corner reads.
//
// `visibleToUids` on the status doc is denormalised membership, purely so the
// rule can be a cheap `in` check instead of a get() per read. It carries no
// personal data beyond uids, and the payload it guards is non-sensitive by
// construction — the usual "denormalisation leaks" objection does not apply
// because there is nothing sensitive here to leak.
// ─────────────────────────────────────────────────────────────────────────

export interface OraCorner {
  id: string;
  ownerUid: string;
  name: string;
  /** Includes the owner. Hard-capped — a corner is not an audience. */
  memberUids: string[];
  createdAt: number;
}

/** Everything someone in your corner is permitted to know. Counts only. */
export interface OraCornerStatus {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  streak: number;
  checkedInToday: boolean;
  goalsActive: number;
  goalsDone: number;
  /** Who may read this doc. Access control only — never rendered. */
  visibleToUids: string[];
  updatedAt: number;
}

const CORNERS = 'oraCorner';
const STATUS = 'oraCornerStatus';

/** A corner is five people. Past that it stops being accountability. */
export const MAX_CORNER = 5;

const uid = () => auth.currentUser?.uid ?? null;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Corners this user belongs to. */
export async function listMyCorners(): Promise<OraCorner[]> {
  const u = uid();
  if (!u) return [];
  try {
    const snap = await getDocs(query(collection(db, CORNERS), where('memberUids', 'array-contains', u)));
    return snap.docs.map((d) => d.data() as OraCorner);
  } catch {
    return [];
  }
}

export async function createCorner(name: string): Promise<OraCorner | null> {
  const u = uid();
  if (!u) return null;
  const corner: OraCorner = {
    id: newId(),
    ownerUid: u,
    name: name.trim().slice(0, 60) || 'My corner',
    memberUids: [u],
    createdAt: Date.now(),
  };
  await setDoc(doc(db, CORNERS, corner.id), corner);
  await publishStatus();
  return corner;
}

/**
 * Add someone to your corner. Owner-only, capped, and idempotent.
 *
 * Adding a person does NOT grant them anything by itself — they only ever read
 * the status card, and only once the added member publishes their own.
 */
export async function addMember(cornerId: string, memberUid: string): Promise<boolean> {
  const u = uid();
  if (!u || !memberUid || memberUid === u) return false;
  const snap = await getDoc(doc(db, CORNERS, cornerId));
  if (!snap.exists()) return false;
  const corner = snap.data() as OraCorner;
  if (corner.ownerUid !== u) return false;
  if (corner.memberUids.includes(memberUid)) return true;
  if (corner.memberUids.length >= MAX_CORNER) return false;
  const memberUids = [...corner.memberUids, memberUid];
  await setDoc(doc(db, CORNERS, cornerId), { memberUids }, { merge: true });
  await publishStatus();
  return true;
}

/** Leave a corner, or (as owner) remove someone. Revocation is immediate. */
export async function removeMember(cornerId: string, memberUid: string): Promise<void> {
  const u = uid();
  if (!u) return;
  const snap = await getDoc(doc(db, CORNERS, cornerId));
  if (!snap.exists()) return;
  const corner = snap.data() as OraCorner;
  const allowed = corner.ownerUid === u || memberUid === u;
  if (!allowed) return;
  const memberUids = corner.memberUids.filter((m) => m !== memberUid);
  if (memberUids.length === 0 || (corner.ownerUid === memberUid)) {
    // The owner leaving dissolves the corner rather than orphaning it.
    await deleteDoc(doc(db, CORNERS, cornerId));
  } else {
    await setDoc(doc(db, CORNERS, cornerId), { memberUids }, { merge: true });
  }
  await publishStatus();
}

/**
 * Recompute and publish this user's status card.
 *
 * Reads the private data locally and writes only counts. Nothing sensitive
 * crosses into the shared document — that translation happens here and nowhere
 * else, which is why every field is assembled by hand rather than spread from
 * a profile object. A spread is how a private field gets published by accident.
 */
export async function publishStatus(): Promise<OraCornerStatus | null> {
  const u = uid();
  if (!u) return null;
  const corners = await listMyCorners();
  const visibleToUids = Array.from(
    new Set(corners.flatMap((c) => c.memberUids).filter((m) => m !== u)),
  );

  if (visibleToUids.length === 0) {
    // In no corner: remove the card entirely rather than leaving a stale one
    // readable by someone who was removed.
    await deleteDoc(doc(db, STATUS, u)).catch(() => {});
    return null;
  }

  const [profile, checkin, goals] = await Promise.all([
    getProfile(), getCheckin(), listGoals(currentSeason()),
  ]);

  const status: OraCornerStatus = clean({
    uid: u,
    displayName: auth.currentUser?.displayName || 'Someone',
    photoURL: auth.currentUser?.photoURL || null,
    streak: profile?.streak?.current ?? 0,
    checkedInToday: !!checkin,
    goalsActive: goals.filter((g) => g.status === 'ACTIVE').length,
    goalsDone: goals.filter((g) => g.status === 'DONE').length,
    visibleToUids,
    updatedAt: Date.now(),
  });
  await setDoc(doc(db, STATUS, u), status);
  return status;
}

/** The status cards this user is allowed to see. Unreadable ones are skipped. */
export async function listCornerStatuses(): Promise<OraCornerStatus[]> {
  const u = uid();
  if (!u) return [];
  const corners = await listMyCorners();
  const others = Array.from(
    new Set(corners.flatMap((c) => c.memberUids).filter((m) => m !== u)),
  );
  if (others.length === 0) return [];
  const cards = await Promise.all(
    others.map(async (m) => {
      try {
        const snap = await getDoc(doc(db, STATUS, m));
        return snap.exists() ? (snap.data() as OraCornerStatus) : null;
      } catch {
        return null; // they have not published, or the rule said no
      }
    }),
  );
  return cards.filter((c): c is OraCornerStatus => !!c);
}

/** Full teardown — leave every corner and delete the shared card. */
export async function leaveAllCorners(): Promise<void> {
  const u = uid();
  if (!u) return;
  const corners = await listMyCorners();
  await Promise.all(corners.map((c) => removeMember(c.id, u).catch(() => {})));
  await deleteDoc(doc(db, STATUS, u)).catch(() => {});
}
