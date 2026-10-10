// Shuffle (Omegle-style) — eligibility, ranking and the cross-instance matching protocol.
// Run: npx tsx --test tests/shuffle.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFromDob, eligibility, normalizeInterests, rankPartners, rateCheck, RATE_MAX_MATCHES, type QueueEntry } from '../services/shuffle/shuffleCore';
import { createShuffleEngine, type ShuffleStore } from '../services/shuffle/shuffleServer';

const NOW = Date.UTC(2026, 9, 10, 12);

test('age gate: 18th birthday boundary, junk input, future dates', () => {
  assert.equal(ageFromDob('2008-10-10', NOW), 18);
  assert.equal(ageFromDob('2008-10-11', NOW), 17);
  assert.equal(ageFromDob('2001-02-31', NOW), null);
  assert.equal(ageFromDob('2030-01-01', NOW), null);
  assert.equal(ageFromDob('nope', NOW), null);
});

test('eligibility: anonymous, minor flags, missing DOB, under 18, standing — and OK', () => {
  const base = { anonymous: false, profile: {}, attestedDob: '1990-01-01', canUse: true, now: NOW };
  assert.equal(eligibility({ ...base, anonymous: true }).code, 'SIGN_IN');
  assert.equal(eligibility({ ...base, profile: { isChild: true } }).code, 'UNDER_18');
  assert.equal(eligibility({ ...base, profile: { accountType: 'STUDENT' } }).code, 'UNDER_18');
  assert.equal(eligibility({ ...base, attestedDob: null }).code, 'NEEDS_DOB');
  assert.equal(eligibility({ ...base, attestedDob: '2010-05-05' }).code, 'UNDER_18');
  const st = eligibility({ ...base, canUse: false });
  assert.equal(st.code, 'STANDING'); assert.match(st.message, /appeal/i);
  assert.equal(eligibility(base).ok, true);
});

test('interests are normalized and capped', () => {
  assert.deepEqual(normalizeInterests([' Music ', 'music', 'Anime!!', 'a'.repeat(40), 'x', 'y', 'z']), ['music', 'anime', 'a'.repeat(24), 'x', 'y']);
  assert.deepEqual(normalizeInterests('nope'), []);
});

const entry = (uid: string, over: Partial<QueueEntry> = {}): QueueEntry => ({
  uid, name: uid, interests: [], interestsOnly: false, mode: 'video', status: 'waiting', createdAt: NOW - 1000, heartbeatAt: NOW, ...over,
});
const ctx = (blocked: string[] = [], met: Record<string, number> = {}) => ({ blocked: (_a: string, b: string) => blocked.includes(b), lastMet: (_a: string, b: string) => met[b] || 0, now: NOW });

test('ranking: shared interests first, then longest wait; filters blocks, cooldown, stale, interests-only', () => {
  const me = entry('me', { interests: ['music'], createdAt: NOW });
  const q = [
    entry('old', { createdAt: NOW - 9000 }),
    entry('fan', { interests: ['music'], createdAt: NOW - 100 }),
    entry('blocked', { interests: ['music'] }),
    entry('recent', { interests: ['music'] }),
    entry('stale', { heartbeatAt: NOW - 60_000 }),
    entry('picky', { interestsOnly: true, interests: ['chess'] }),
    entry('text', { mode: 'text' }),
  ];
  const r = rankPartners(me, q, ctx(['blocked'], { recent: NOW - 60_000 })).map(e => e.uid);
  assert.deepEqual(r, ['fan', 'old']);
});

test('a waiter only claims NEWER waiters (no mutual-claim race)', () => {
  const me = entry('w1', { createdAt: NOW - 5000 });
  const r = rankPartners(me, [entry('older', { createdAt: NOW - 9000 }), entry('newer', { createdAt: NOW - 100 })], ctx(), true).map(e => e.uid);
  assert.deepEqual(r, ['newer']);
});

test('rate cap', () => {
  const times = Array.from({ length: RATE_MAX_MATCHES }, (_, i) => NOW - i * 1000);
  assert.equal(rateCheck(times, NOW).ok, false);
  assert.equal(rateCheck(times.map(t => t - 3600_000), NOW).ok, true);
});

// In-memory store with real version preconditions (stands in for Firestore updateTime).
function memStore(): ShuffleStore & { docs: Map<string, any> } {
  const docs = new Map<string, any>();
  const queue = new Map<string, { data: QueueEntry; version: string }>();
  let ver = 0;
  return {
    docs,
    async listQueue() { return [...queue.values()].map(v => ({ data: structuredClone(v.data), version: v.version })); },
    async getQueue(uid) { const v = queue.get(uid); return v ? { data: structuredClone(v.data), version: v.version } : null; },
    async casQueue(uid, data, version) {
      const cur = queue.get(uid);
      if (version === '' ? !!cur : cur?.version !== version) return null;
      const v = String(++ver); queue.set(uid, { data: structuredClone(data), version: v }); return v;
    },
    async deleteQueue(uid) { queue.delete(uid); },
    async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
    async set(p, d) { docs.set(p, structuredClone(d)); },
    async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); },
  };
}

function engine(store: ShuffleStore, profiles: Record<string, any> = {}) {
  let t = NOW;
  const e = createShuffleEngine({
    store,
    getProfile: async uid => profiles[uid] || {},
    standing: async uid => ({ ok: uid !== 'restricted' }),
    socialBlocked: async () => false,
    now: () => (t += 10),
  });
  return e;
}

test('end to end: two adults are matched to each other, with one shared session', async () => {
  const store = memStore();
  const e = engine(store);
  for (const u of ['alice', 'bob']) await e.attest(u, false, '1995-04-04');
  assert.equal((await e.join('alice', false, { name: 'Alice', interests: ['music'] })).status, 'waiting');
  const b = await e.join('bob', false, { name: 'Bob', interests: ['music', 'film'] });
  assert.equal(b.status, 'matched');
  const a = await e.poll('alice', false);
  assert.equal(a.status, 'matched');
  const am = (a as any).match, bm = (b as any).match;
  assert.equal(am.sessionId, bm.sessionId);
  assert.equal(am.peerUid, 'bob'); assert.equal(bm.peerUid, 'alice');
  assert.deepEqual(am.shared, ['music']);
  assert.notEqual(am.initiator, bm.initiator);
  assert.ok(store.docs.get(`shuffle_matches/${am.matchId}`));
});

test('two waiters who joined into an empty queue find each other on poll', async () => {
  const store = memStore();
  const e = engine(store);
  for (const u of ['x1', 'x2']) await e.attest(u, false, '1990-01-01');
  // Simulate both enqueueing before either could see the other.
  await e.join('x1', false, {});
  await store.casQueue('x2', { uid: 'x2', name: 'x2', interests: [], interestsOnly: false, mode: 'video', status: 'waiting', createdAt: NOW + 5000, heartbeatAt: NOW + 5000, match: null }, '');
  const p1 = await e.poll('x1', true);              // x1 is older → may claim the newer x2
  assert.equal(p1.status, 'matched');
  const p2 = await e.poll('x2', true);
  assert.equal(p2.status, 'matched');
  assert.equal((p1 as any).match.sessionId, (p2 as any).match.sessionId);
});

test('minors and missing DOB never enter the queue; the first DOB is locked', async () => {
  const store = memStore();
  const e = engine(store, { kid: { isChild: true } });
  await e.attest('kid', false, '1980-01-01');
  assert.equal((await e.join('kid', false, {})).status, 'ineligible');
  assert.equal((await e.join('nodob', false, {})).status, 'ineligible');
  await e.attest('teen', false, '2012-01-01');
  await e.attest('teen', false, '1990-01-01');        // can't "fix" it upward
  assert.equal((await e.join('teen', false, {})).status, 'ineligible');
  assert.equal(store.docs.get('shuffle_profiles/teen').dob, '2012-01-01');
  assert.equal((await store.listQueue()).length, 0);
});

test('a report blocks the pair forever and files a report; they are never matched again', async () => {
  const store = memStore();
  const filed: any[] = [];
  let t = NOW;
  const e = createShuffleEngine({ store, getProfile: async () => ({}), standing: async () => ({ ok: true }), socialBlocked: async () => false, now: () => (t += 10), fileReport: async r => { filed.push(r); } });
  for (const u of ['p', 'q']) await e.attest(u, false, '1990-01-01');
  await e.join('p', false, {});
  const m = (await e.join('q', false, {})) as any;
  assert.equal(m.status, 'matched');
  assert.equal((await e.end('q', m.match.matchId, 'report', { reason: 'harassment_hate' })).ok, true);
  assert.equal(filed[0].reportedId, 'p');
  assert.equal(filed[0].reason, 'harassment_hate');
  t += 7 * 3600_000;                                   // past the normal cooldown
  await e.poll('p', false);                            // clear p's matched entry
  await e.join('p', false, {});
  assert.equal((await e.join('q', false, {})).status, 'waiting');
  // A stranger can't end someone else's match.
  assert.equal((await e.end('mallory', m.match.matchId, 'next')).ok, false);
});

test('HTTP routes: auth required, bad match ids rejected, join → waiting', async () => {
  const express = (await import('express')).default;
  const { registerShuffleRoutes } = await import('../services/shuffle/shuffleServer');
  const app = express();
  const store = memStore();
  await store.set('shuffle_profiles/u1', { dob: '1990-01-01' });
  const authMiddleware = (req: any, res: any, next: any) => {
    const t = String(req.headers.authorization || '');
    if (!t.startsWith('Bearer u')) return res.status(401).json({ error: 'Unauthorized' });
    req.uid = t.slice(7); req.isAnonymous = false; next();
  };
  registerShuffleRoutes(app as any, { authMiddleware, deps: { store, getProfile: async () => ({}), standing: async () => ({ ok: true }), socialBlocked: async () => false } });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/shuffle`;
  const H = (uid?: string) => ({ 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) });
  assert.equal((await fetch(`${base}/eligibility`)).status, 401);
  assert.equal((await (await fetch(`${base}/eligibility`, { headers: H('u1') })).json()).ok, true);
  assert.equal((await fetch(`${base}/end`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ matchId: '../x', reason: 'next' }) })).status, 400);
  assert.equal((await fetch(`${base}/attest`, { method: 'POST', headers: H('u2'), body: JSON.stringify({ dob: '1990-01-01' }) })).status, 400); // must agree to rules
  const j = await (await fetch(`${base}/join`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ interests: ['music'] }) })).json();
  assert.equal(j.status, 'waiting');
  server.close();
});
