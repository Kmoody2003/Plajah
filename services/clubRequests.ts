// clubRequests — club admins answering "Request to join" (private clubs and clubs that approve each member).
// Requests are clubMemberships rows with status PENDING (written by joinClub). Approving flips the row to
// ACTIVE, writes the member marker (clubMemberIndex) and bumps memberCount — all allowed for club managers
// by firestore.rules. Declining marks the row DECLINED (rules let managers update, not delete, other rows).
import { collection, doc, getDocs, increment, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { ClubMembership } from '../types';

export async function fetchClubJoinRequests(clubId: string): Promise<ClubMembership[]> {
  const snap = await getDocs(query(collection(db, 'clubMemberships'), where('clubId', '==', clubId), where('status', '==', 'PENDING'), limit(200)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubMembership)).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

export async function approveClubJoinRequest(m: ClubMembership): Promise<void> {
  const b = writeBatch(db);
  b.update(doc(db, 'clubMemberships', m.id), { status: 'ACTIVE', joinedAt: Date.now() });
  b.set(doc(db, 'clubMemberIndex', `${m.clubId}_${m.userId}`), { clubId: m.clubId, userId: m.userId, at: Date.now() });
  b.update(doc(db, 'clubs', m.clubId), { memberCount: increment(1) });
  await b.commit();
}

export async function declineClubJoinRequest(m: ClubMembership): Promise<void> {
  const b = writeBatch(db);
  b.update(doc(db, 'clubMemberships', m.id), { status: 'DECLINED' });
  await b.commit();
}
