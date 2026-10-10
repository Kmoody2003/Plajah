// Shuffle UI lab — the REAL ShuffleView with /api/shuffle mocked and a stand-in signed-in user.
// Walks gate → lobby → searching. (A real call needs two signed-in accounts on two devices.)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { auth } from '../services/firebase';
import ShuffleView from '../components/shuffle/ShuffleView';

Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ uid: 'lab-user', displayName: 'Lab User', photoURL: '', getIdToken: async () => 'lab-token' }) });
const calls: string[] = [];
let attested = new URLSearchParams(location.search).has('attested');
const realFetch = window.fetch.bind(window);
window.fetch = async (input: any, init?: any) => {
  const url = String(input?.url || input);
  if (!url.includes('/api/shuffle/')) return realFetch(input, init);
  const path = url.split('/api/shuffle/')[1];
  calls.push(`${init?.method || 'GET'} ${path} ${init?.body || ''}`);
  const body = init?.body ? JSON.parse(init.body) : {};
  const ok = (j: any) => new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (path === 'eligibility') return ok(attested ? { ok: true, code: 'OK', message: '' } : { ok: false, code: 'NEEDS_DOB', message: 'Confirm your date of birth to use Shuffle.', needsDob: true });
  if (path === 'attest') {
    const y = +String(body.dob).slice(0, 4);
    if (2026 - y < 18) return ok({ ok: false, code: 'UNDER_18', message: 'Shuffle is for adults (18+) only.' });
    attested = true; return ok({ ok: true, code: 'OK', message: '' });
  }
  if ((path === 'join' || path === 'poll') && new URLSearchParams(location.search).has('match'))
    return ok({ status: 'matched', match: { matchId: 'a'.repeat(32), sessionId: 'shuffle_lab', peerUid: 'lab-peer', peerName: 'Stranger', shared: ['music'], initiator: true, createdAt: Date.now() } });
  if (path === 'join' || path === 'poll') return ok({ status: 'waiting' });
  return ok({ ok: true });
};
(window as any).__shuffleCalls = calls;
createRoot(document.getElementById('root')!).render(<ShuffleView onClose={() => { (window as any).__closed = true; }} />);
