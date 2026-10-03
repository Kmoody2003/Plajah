/**
 * Homeroom requests — the two student-initiated flows that always route through a responsible adult:
 *  • chatRequests/{id}   a student asks their guardian to turn on text chat (voice notes are always on);
 *  • clubProposals/{id}  a student proposes a club and names a sponsor (a teacher at their school or their
 *                        own guardian). The club only goes live after the sponsor accepts (sponsor flow).
 * Writes are awaited and the UI reports failure honestly — nothing tells a child "sent" unless it was.
 */
import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

export interface ChatRequest { childUid: string; guardianUid: string; scope: 'classes' | 'classes_clubs'; note: string; status: 'pending'; createdAt: number }
export interface ClubProposal {
  proposerUid: string; name: string; purpose: string; meets: string;
  sponsorKind: 'teacher' | 'guardian'; sponsorUid: string; status: 'awaiting_sponsor'; createdAt: number;
}

export async function requestTextChat(r: Omit<ChatRequest, 'status' | 'createdAt'>): Promise<boolean> {
  try { await addDoc(collection(db, 'chatRequests'), { ...r, status: 'pending', createdAt: Date.now() }); return true; } catch { return false; }
}

export async function proposeClub(p: Omit<ClubProposal, 'status' | 'createdAt'>): Promise<boolean> {
  try { await addDoc(collection(db, 'clubProposals'), { ...p, status: 'awaiting_sponsor', createdAt: Date.now() }); return true; } catch { return false; }
}
