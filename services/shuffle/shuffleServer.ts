/**
 * Shuffle server — matchmaking for Omegle-style random 1:1 video (rules: services/shuffle/shuffleCore).
 *
 * Every collection here is SERVER-ONLY (default-deny in firestore.rules; Admin REST bypasses rules),
 * so no rules deploy is needed and clients can't forge a queue entry, a match, or their age:
 *   shuffle_queue/{uid}      waiting/claiming/matched entry, heartbeated by polling
 *   shuffle_matches/{id}     a, b, sessionId, timestamps, how it ended
 *   shuffle_profiles/{uid}   locked DOB attestation, recent partners (cooldown), match timestamps (rate)
 *   shuffle_pairs/{a__b}     { blocked: true } after a report — those two never meet again
 * Media runs on rtcCore 'mesh' at rtc_sessions/shuffle_<random> (existing rules), limited client-side
 * to the matched uid (allowedPeerIds). The random session id is only ever given to the two matched users.
 *
 * Matching is lock-free across Cloud Run instances via Firestore updateTime preconditions:
 *   joiner → claim the best WAITING candidate (precondition on its version); else enqueue.
 *   waiter (on poll) → lock its OWN entry ('claiming'), then claim a NEWER waiter; unlock if none.
 * A waiter only claims newer waiters, so two waiters never claim each other; locking its own entry
 * first means it can't be claimed by a joiner while it is claiming someone else.
 */
import nodeCrypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import express from 'express';
import {
  eligibility, normalizeInterests, rankPartners, rateCheck, pairKey, sharedInterests,
  REPORT_REASONS, type QueueEntry, type MatchInfo, type ShuffleMode,
} from './shuffleCore';

// ── Storage seam (REST in prod, in-memory in tests) ──────────────────────────
export interface Versioned<T> { data: T; version: string }
export interface ShuffleStore {
  listQueue(): Promise<Array<Versioned<QueueEntry>>>;
  getQueue(uid: string): Promise<Versioned<QueueEntry> | null>;
  /** Replace the entry iff it's still at `version` ('' = must not exist). Returns the new version or null. */
  casQueue(uid: string, data: QueueEntry, version: string): Promise<string | null>;
  deleteQueue(uid: string): Promise<void>;
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, any>): Promise<void>;
  patch(path: string, data: Record<string, any>): Promise<void>;
}

export interface ShuffleDeps {
  store: ShuffleStore;
  /** users/{uid} profile (minor flags). */
  getProfile: (uid: string) => Promise<Record<string, any> | null>;
  /** Standing gate — FAIL OPEN on infra errors (Fair Process). */
  standing: (uid: string) => Promise<{ ok: boolean; message?: string }>;
  /** Either side has blocked the other via Plajah's social block (blocks/{a_b}). */
  socialBlocked: (a: string, b: string) => Promise<boolean>;
  /** Hand a report to trust & safety (content_reports + escalation for minors). */
  fileReport?: (r: { reporterId: string; reportedId: string; matchId: string; reason: string; details: string }) => Promise<void>;
  now?: () => number;
}

const newId = () => nodeCrypto.randomBytes(16).toString('hex');

export function createShuffleEngine(deps: ShuffleDeps) {
  const { store } = deps;
  const now = () => (deps.now ? deps.now() : Date.now());

  async function checkEligibility(uid: string, anonymous: boolean) {
    const [profile, sp, st] = await Promise.all([deps.getProfile(uid), store.get(`shuffle_profiles/${uid}`), deps.standing(uid)]);
    return eligibility({ anonymous, profile, attestedDob: sp?.dob || null, canUse: st.ok, restrictionMessage: st.message, now: now() });
  }

  /** First DOB wins and is locked (server-only doc). Returns the resulting eligibility. */
  async function attest(uid: string, anonymous: boolean, dob: string) {
    const sp = await store.get(`shuffle_profiles/${uid}`);
    if (!sp?.dob) await store.set(`shuffle_profiles/${uid}`, { ...(sp || {}), dob: String(dob).slice(0, 10), attestedAt: now() });
    return checkEligibility(uid, anonymous);
  }

  async function pairCtx(meUid: string, cands: QueueEntry[]) {
    const prof = await store.get(`shuffle_profiles/${meUid}`);
    const recent: Record<string, number> = (prof?.recent && typeof prof.recent === 'object') ? prof.recent : {};
    const blockedSet = new Set<string>();
    await Promise.all(cands.filter(c => c.uid !== meUid).slice(0, 25).map(async c => {
      const [pair, social] = await Promise.all([store.get(`shuffle_pairs/${pairKey(meUid, c.uid)}`), deps.socialBlocked(meUid, c.uid).catch(() => false)]);
      if (pair?.blocked || social) blockedSet.add(c.uid);
    }));
    return {
      blocked: (_a: string, b: string) => blockedSet.has(b),
      lastMet: (_a: string, b: string) => Number(recent[b] || 0),
      now: now(),
    };
  }

  function matchFor(me: QueueEntry, peer: QueueEntry, matchId: string, sessionId: string, t: number): [MatchInfo, MatchInfo] {
    const shared = sharedInterests(me.interests, peer.interests);
    const mine: MatchInfo = { matchId, sessionId, peerUid: peer.uid, peerName: peer.name, peerPhoto: peer.photo || '', shared, initiator: me.uid < peer.uid, createdAt: t };
    const theirs: MatchInfo = { matchId, sessionId, peerUid: me.uid, peerName: me.name, peerPhoto: me.photo || '', shared, initiator: peer.uid < me.uid, createdAt: t };
    return [mine, theirs];
  }

  async function recordMatch(a: string, b: string, matchId: string, sessionId: string, t: number) {
    await store.set(`shuffle_matches/${matchId}`, { a, b, sessionId, createdAt: t, endedAt: 0, endedBy: '', endReason: '' });
    for (const [x, y] of [[a, b], [b, a]]) {
      const p = await store.get(`shuffle_profiles/${x}`) || {};
      const recent = { ...(p.recent || {}) };
      recent[y] = t;
      // keep the cooldown map small
      const trimmed = Object.fromEntries(Object.entries(recent).sort((m, n) => Number(n[1]) - Number(m[1])).slice(0, 200));
      const r = rateCheck(p.matchTimes || [], t);
      await store.patch(`shuffle_profiles/${x}`, { recent: trimmed, matchTimes: [...r.times, t] });
    }
  }

  /** Try to claim a partner for `me`. `mine` = my current queue entry (+version) if I'm enqueued. */
  async function tryClaim(me: QueueEntry, mine: Versioned<QueueEntry> | null): Promise<MatchInfo | null> {
    const queue = await store.listQueue();
    const entries = queue.map(q => q.data);
    const ctx = await pairCtx(me.uid, entries);
    const ranked = rankPartners(me, entries, ctx, !!mine);
    if (!ranked.length) return null;
    let lockVersion: string | null = null;
    if (mine) {
      lockVersion = await store.casQueue(me.uid, { ...mine.data, status: 'claiming' }, mine.version);
      if (!lockVersion) return null; // someone claimed me (or I changed) — the caller re-reads
    }
    for (const cand of ranked.slice(0, 5)) {
      const v = queue.find(q => q.data.uid === cand.uid)!;
      const t = now();
      const matchId = newId();
      const sessionId = `shuffle_${newId()}`;
      const [mineInfo, theirs] = matchFor(me, cand, matchId, sessionId, t);
      const ok = await store.casQueue(cand.uid, { ...cand, status: 'matched', match: theirs }, v.version);
      if (!ok) continue;
      if (mine && lockVersion) await store.casQueue(me.uid, { ...mine.data, status: 'matched', match: mineInfo }, lockVersion);
      else await store.deleteQueue(me.uid).catch(() => {});
      await recordMatch(me.uid, cand.uid, matchId, sessionId, t);
      return mineInfo;
    }
    if (mine && lockVersion) await store.casQueue(me.uid, { ...mine.data, status: 'waiting' }, lockVersion);
    return null;
  }

  async function join(uid: string, anonymous: boolean, body: { name?: string; photo?: string; interests?: unknown; interestsOnly?: boolean; mode?: ShuffleMode }) {
    const el = await checkEligibility(uid, anonymous);
    if (!el.ok) return { status: 'ineligible' as const, eligibility: el };
    const prof = await store.get(`shuffle_profiles/${uid}`);
    if (!rateCheck(prof?.matchTimes || [], now()).ok) return { status: 'slow_down' as const, message: "You've met a lot of people in the last few minutes — take a short break and try again." };
    const t = now();
    const me: QueueEntry = {
      uid, name: String(body.name || 'Someone').slice(0, 60), photo: String(body.photo || '').slice(0, 500),
      interests: normalizeInterests(body.interests), interestsOnly: !!body.interestsOnly, mode: body.mode === 'text' ? 'text' : 'video',
      status: 'waiting', createdAt: t, heartbeatAt: t, match: null,
    };
    // Re-joining replaces any previous entry of mine (fresh createdAt → I'm the newest).
    await store.deleteQueue(uid).catch(() => {});
    const m = await tryClaim(me, null);
    if (m) return { status: 'matched' as const, match: m };
    const v = await store.casQueue(uid, me, '');
    if (!v) { // a concurrent join of mine — read what's there
      const cur = await store.getQueue(uid);
      if (cur?.data.status === 'matched' && cur.data.match) return { status: 'matched' as const, match: cur.data.match };
    }
    return { status: 'waiting' as const };
  }

  async function poll(uid: string, scan: boolean) {
    const cur = await store.getQueue(uid);
    if (!cur) return { status: 'idle' as const };
    if (cur.data.status === 'matched' && cur.data.match) {
      await store.deleteQueue(uid).catch(() => {});
      return { status: 'matched' as const, match: cur.data.match };
    }
    const hb = { ...cur.data, heartbeatAt: now(), status: 'waiting' as const };
    // 'claiming' = another request of mine is mid-claim; if that request died (instance gone) the
    // lock goes stale after a few seconds and we take the entry back.
    const busy = cur.data.status === 'claiming' && now() - cur.data.heartbeatAt < 8000;
    const v = busy ? null : await store.casQueue(uid, hb, cur.version);
    if (scan && v) {
      const m = await tryClaim(hb, { data: hb, version: v });
      if (m) { await store.deleteQueue(uid).catch(() => {}); return { status: 'matched' as const, match: m }; }
    }
    if (!v) { // claimed between read and heartbeat?
      const again = await store.getQueue(uid);
      if (again?.data.status === 'matched' && again.data.match) { await store.deleteQueue(uid).catch(() => {}); return { status: 'matched' as const, match: again.data.match }; }
    }
    return { status: 'waiting' as const };
  }

  async function leave(uid: string) { await store.deleteQueue(uid).catch(() => {}); }

  async function end(uid: string, matchId: string, reason: 'next' | 'left' | 'report', report?: { reason?: string; details?: string }) {
    const m = await store.get(`shuffle_matches/${matchId}`);
    if (!m || (m.a !== uid && m.b !== uid)) return { ok: false, error: 'Not your match.' };
    const peer = m.a === uid ? m.b : m.a;
    if (!m.endedAt) await store.patch(`shuffle_matches/${matchId}`, { endedAt: now(), endedBy: uid, endReason: reason });
    if (reason === 'report') {
      const r = REPORT_REASONS.includes(report?.reason as any) ? String(report!.reason) : 'other';
      await store.set(`shuffle_pairs/${pairKey(uid, peer)}`, { blocked: true, by: uid, reason: r, matchId, at: now() });
      await store.patch(`shuffle_matches/${matchId}`, { reported: true, reportReason: r, reportedBy: uid });
      await deps.fileReport?.({ reporterId: uid, reportedId: peer, matchId, reason: r, details: String(report?.details || '').slice(0, 1000) }).catch(() => {});
    }
    return { ok: true };
  }

  return { checkEligibility, attest, join, poll, leave, end };
}

// ── Firestore REST store with updateTime preconditions ───────────────────────
export function createRestShuffleStore(opts: { base: string; docRoot: string; headers: () => Promise<Record<string, string>> }): ShuffleStore {
  const enc = (v: any): any => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
    return { stringValue: String(v) };
  };
  const encFields = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, enc(v)]));
  const dec = (v: any): any => {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
    return null;
  };
  const decDoc = (d: any) => Object.fromEntries(Object.entries(d?.fields || {}).map(([k, x]) => [k, dec(x)]));
  const url = (path: string) => `${opts.base}/${path}`;

  return {
    async listQueue() {
      const res = await fetch(`${url('shuffle_queue')}?pageSize=200`, { headers: await opts.headers() });
      if (!res.ok) return [];
      const j: any = await res.json();
      return (j.documents || []).map((d: any) => ({ data: decDoc(d) as QueueEntry, version: d.updateTime as string }));
    },
    async getQueue(uid) {
      const res = await fetch(url(`shuffle_queue/${uid}`), { headers: await opts.headers() });
      if (!res.ok) return null;
      const d: any = await res.json();
      return { data: decDoc(d) as QueueEntry, version: d.updateTime };
    },
    async casQueue(uid, data, version) {
      const pre = version ? `currentDocument.updateTime=${encodeURIComponent(version)}` : 'currentDocument.exists=false';
      const res = await fetch(`${url(`shuffle_queue/${uid}`)}?${pre}`, { method: 'PATCH', headers: await opts.headers(), body: JSON.stringify({ fields: encFields(data as any) }) });
      if (!res.ok) return null;   // 400 FAILED_PRECONDITION / 409 → lost the race
      const d: any = await res.json();
      return d.updateTime || null;
    },
    async deleteQueue(uid) { await fetch(url(`shuffle_queue/${uid}`), { method: 'DELETE', headers: await opts.headers() }); },
    async get(path) {
      const res = await fetch(url(path), { headers: await opts.headers() });
      if (!res.ok) return null;
      return decDoc(await res.json());
    },
    async set(path, data) {
      await fetch(url(path), { method: 'PATCH', headers: await opts.headers(), body: JSON.stringify({ fields: encFields(data) }) });
    },
    async patch(path, data) {
      const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      await fetch(`${url(path)}?${mask}`, { method: 'PATCH', headers: await opts.headers(), body: JSON.stringify({ fields: encFields(data) }) });
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────
export function registerShuffleRoutes(app: Express, opts: { authMiddleware: RequestHandler; limiter?: RequestHandler; deps: ShuffleDeps }) {
  const engine = createShuffleEngine(opts.deps);
  const json = express.json({ limit: '8kb' });
  const mw: RequestHandler[] = [opts.authMiddleware, ...(opts.limiter ? [opts.limiter] : [])];
  const who = (req: any) => ({ uid: String(req.uid || ''), anonymous: req.isAnonymous === true });
  const safe = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
    try { await fn(req, res); } catch (e: any) { console.error('[shuffle]', e?.message); res.status(500).json({ error: 'Shuffle hit a snag — try again.' }); }
  };

  app.get('/api/shuffle/eligibility', ...mw, safe(async (req, res) => {
    const { uid, anonymous } = who(req);
    res.json(await engine.checkEligibility(uid, anonymous));
  }));
  app.post('/api/shuffle/attest', ...mw, json, safe(async (req, res) => {
    const { uid, anonymous } = who(req);
    const dob = String(req.body?.dob || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return res.status(400).json({ error: 'Enter your date of birth.' });
    if (req.body?.agree !== true) return res.status(400).json({ error: 'Please agree to the Shuffle rules.' });
    res.json(await engine.attest(uid, anonymous, dob));
  }));
  app.post('/api/shuffle/join', ...mw, json, safe(async (req, res) => {
    const { uid, anonymous } = who(req);
    res.json(await engine.join(uid, anonymous, req.body || {}));
  }));
  app.post('/api/shuffle/poll', ...mw, json, safe(async (req, res) => {
    res.json(await engine.poll(who(req).uid, req.body?.scan === true));
  }));
  app.post('/api/shuffle/leave', ...mw, safe(async (req, res) => {
    await engine.leave(who(req).uid); res.json({ ok: true });
  }));
  app.post('/api/shuffle/end', ...mw, json, safe(async (req, res) => {
    const reason = ['next', 'left', 'report'].includes(req.body?.reason) ? req.body.reason : 'left';
    const matchId = String(req.body?.matchId || '');
    if (!/^[0-9a-f]{32}$/.test(matchId)) return res.status(400).json({ error: 'Bad match.' });
    const r = await engine.end(who(req).uid, matchId, reason, { reason: req.body?.reportReason, details: req.body?.details });
    res.status(r.ok ? 200 : 403).json(r);
  }));
}
