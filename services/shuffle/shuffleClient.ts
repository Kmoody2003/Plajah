/** Client for the Shuffle server (services/shuffle/shuffleServer.ts). */
import { auth } from '../firebase';
import type { Eligibility, MatchInfo, ShuffleReportReason } from './shuffleCore';

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to use Shuffle.');
  const res = await fetch(`/api/shuffle/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok && !(j && (j as any).code)) throw new Error((j as any)?.error || 'Shuffle is unavailable right now.');
  return j as T;
}

export type JoinResult =
  | { status: 'matched'; match: MatchInfo }
  | { status: 'waiting' }
  | { status: 'idle' }
  | { status: 'ineligible'; eligibility: Eligibility }
  | { status: 'slow_down'; message: string };

export const shuffleApi = {
  eligibility: () => call<Eligibility>('GET', 'eligibility'),
  attest: (dob: string) => call<Eligibility>('POST', 'attest', { dob, agree: true }),
  join: (o: { interests: string[]; interestsOnly: boolean }) => call<JoinResult>('POST', 'join', {
    ...o, mode: 'video', name: auth.currentUser?.displayName || 'Someone', photo: auth.currentUser?.photoURL || '',
  }),
  poll: (scan: boolean) => call<JoinResult>('POST', 'poll', { scan }),
  leave: () => call<{ ok: boolean }>('POST', 'leave').catch(() => ({ ok: false })),
  end: (matchId: string, reason: 'next' | 'left' | 'report', report?: { reportReason: ShuffleReportReason; details?: string }) =>
    call<{ ok: boolean }>('POST', 'end', { matchId, reason, ...(report || {}) }).catch(() => ({ ok: false })),
};
