/**
 * Social supercharge — the trusted server half.
 *
 * Plajah has no Cloud Functions; the backend is Express on Cloud Run. Firestore REST here runs with the
 * service account, which BYPASSES firestore.rules — so every route authorises for itself, and the rules
 * stay as strict as before (we do NOT loosen them).
 *
 *   GET  /api/link-preview?url=            unauthenticated, per-IP rate limited, SSRF-hardened unfurl
 *   POST /api/achievements/unlock          {achievementId}   (Bearer ID token)
 *   POST /api/debates/award-points         {debateId}        (Bearer ID token)
 *   POST /api/social/publish-due-posts     header x-scheduler-secret == env SCHEDULER_SECRET (503 if unset)
 *
 * Pure decisions live in services/socialServerCore.ts and services/linkPreviewCore.ts (unit tested).
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import http from 'node:http';
import https from 'node:https';
import nodeCrypto from 'node:crypto';
import { lookup as dnsLookupCb } from 'node:dns';
import { promisify } from 'node:util';
import { getAccessToken, verifyIdTokenDetailed, adminConfig } from '../services/firebaseAdminRest';
import {
  checkUrlShape, resolveRedirect, isBlockedIp, isHtmlContentType, parseLinkMeta, TtlLru,
  MAX_BODY_BYTES, MAX_REDIRECTS, FETCH_TIMEOUT_MS, type LinkPreview,
} from '../services/linkPreviewCore';
import {
  checkUnlockable, buildUserAchievementDoc, userAchievementDocId, planPublicAchievement, rateAllow,
  computeDebateAward, selectDue, claimFields, failureFields, planScheduledPost, PUBLISH_BATCH_LIMIT,
  type ScheduledRow,
} from '../services/socialServerCore';
import { normalizeHashtag } from '../services/postingLogic';
import { serverSpamCheck, profileCreatedMs } from '../services/trust/serverSpamGate';
import { recordSecurityEvent } from '../services/securityEvents';

export const socialServerRouter = Router();

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
const DB_ID = process.env.FIREBASE_DB_ID || 'plajah-prod';
const DOC_ROOT = `projects/${PROJECT_ID}/databases/${DB_ID}/documents`;
const FS = `https://firestore.googleapis.com/v1/${DOC_ROOT}`;

// ── Firestore REST (typed values; nulls kept, undefined dropped) ──────────────

function enc(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  return { stringValue: String(v) };
}
function encFields(o: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, x] of Object.entries(o)) if (x !== undefined) out[k] = enc(x);
  return out;
}
function dec(v: any): any {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(f)) out[k] = dec(v);
  return out;
}
async function hdrs(): Promise<Record<string, string>> {
  const t = await getAccessToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

interface DocRead { data: Record<string, any>; updateTime: string }

async function getDoc(path: string): Promise<DocRead | null> {
  try {
    const res = await fetch(`${FS}/${path}`, { headers: await hdrs() });
    if (!res.ok) return null;
    const j = await res.json() as any;
    return { data: decFields(j.fields || {}), updateTime: j.updateTime };
  } catch { return null; }
}

/** Create only if absent. 409 ALREADY_EXISTS ⇒ 'exists'. */
async function createOnce(collection: string, id: string, data: Record<string, any>): Promise<'created' | 'exists' | 'error'> {
  try {
    const res = await fetch(`${FS}/${collection}?documentId=${encodeURIComponent(id)}`, {
      method: 'POST', headers: await hdrs(), body: JSON.stringify({ fields: encFields(data) }),
    });
    if (res.ok) return 'created';
    if (res.status === 409) return 'exists';
    console.error(`[socialServer] createOnce ${collection}/${id} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return 'error';
  } catch { return 'error'; }
}

/**
 * Merge-patch named fields (updateMask) — optionally ONLY if the doc is unchanged since `updateTime`
 * (Firestore precondition). 'conflict' means someone else changed it first (we lost the claim).
 */
async function patch(path: string, data: Record<string, any>, ifUpdateTime?: string): Promise<'ok' | 'conflict' | 'error'> {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const pre = ifUpdateTime ? `&currentDocument.updateTime=${encodeURIComponent(ifUpdateTime)}` : '';
  try {
    const res = await fetch(`${FS}/${path}?${mask}${pre}`, { method: 'PATCH', headers: await hdrs(), body: JSON.stringify({ fields: encFields(data) }) });
    if (res.ok) return 'ok';
    if (res.status === 409 || res.status === 400 || res.status === 412) {
      const body = await res.text();
      if (/FAILED_PRECONDITION|ABORTED|precondition/i.test(body)) return 'conflict';
      console.error(`[socialServer] patch ${path} HTTP ${res.status} ${body.slice(0, 200)}`);
      return 'error';
    }
    console.error(`[socialServer] patch ${path} HTTP ${res.status}`);
    return 'error';
  } catch { return 'error'; }
}

async function runQuery(collectionId: string, filters: Array<{ field: string; op: string; value: any }>, limit: number): Promise<Array<{ id: string; updateTime: string; data: Record<string, any> }>> {
  const fieldFilters = filters.map(f => ({ fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: enc(f.value) } }));
  const where = fieldFilters.length === 1 ? fieldFilters[0] : { compositeFilter: { op: 'AND', filters: fieldFilters } };
  const body = { structuredQuery: { from: [{ collectionId }], where, orderBy: [{ field: { fieldPath: 'publishAt' }, direction: 'ASCENDING' }], limit } };
  const res = await fetch(`${FS}:runQuery`, { method: 'POST', headers: await hdrs(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`runQuery ${collectionId} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json() as any[];
  return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => ({
    id: String(r.document.name).split('/').pop() as string,
    updateTime: r.document.updateTime,
    data: decFields(r.document.fields || {}),
  }));
}

/** Atomic increment on an EXISTING doc (never creates it). */
async function incrementExisting(path: string, field: string, by: number): Promise<boolean> {
  try {
    const res = await fetch(`${FS}:commit`, {
      method: 'POST', headers: await hdrs(),
      body: JSON.stringify({ writes: [{
        update: { name: `${DOC_ROOT}/${path}`, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: field, increment: { integerValue: String(Math.round(by)) } }],
        currentDocument: { exists: true },
      }] }),
    });
    if (!res.ok) console.error(`[socialServer] increment ${path}.${field} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch { return false; }
}

/** Atomic increment that creates the doc when missing (hashtag rollups). */
async function incrementUpsert(path: string, field: string, by: number, set: Record<string, any>): Promise<void> {
  try {
    await fetch(`${FS}:commit`, {
      method: 'POST', headers: await hdrs(),
      body: JSON.stringify({ writes: [{
        update: { name: `${DOC_ROOT}/${path}`, fields: encFields(set) },
        updateMask: { fieldPaths: Object.keys(set) },
        updateTransforms: [{ fieldPath: field, increment: { integerValue: String(by) } }],
      }] }),
    });
  } catch { /* best-effort */ }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function registeredCaller(req: Request, res: Response): Promise<string | null> {
  if (!adminConfig.hasCredentials()) { res.status(503).json({ error: 'Server not configured.' }); return null; }
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Sign in required.' }); return null; }
  const t = await verifyIdTokenDetailed(auth.slice(7));
  if (!t) { res.status(401).json({ error: 'Invalid token.' }); return null; }
  if (t.isAnonymous) { res.status(403).json({ error: 'A registered account is required.', code: 'ANONYMOUS_NOT_ALLOWED' }); return null; }
  return t.uid;
}

function secretsEqual(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. LINK PREVIEW
// ════════════════════════════════════════════════════════════════════════════

const previewCache = new TtlLru<LinkPreview | { error: string }>(500, 10 * 60_000);
const previewRate = new Map<string, { start: number; n: number }>();
const dnsLookup = promisify(dnsLookupCb) as (host: string, opts: { all: true }) => Promise<Array<{ address: string; family: number }>>;

/**
 * http(s).request whose DNS `lookup` validates EVERY resolved address and pins the connection to a validated
 * one — so there is no resolve-then-connect gap for DNS rebinding.
 */
function safeLookup(host: string, options: any, cb: (err: Error | null, address?: any, family?: number) => void): void {
  dnsLookup(host, { all: true }).then(addrs => {
    if (!addrs.length || addrs.some(a => isBlockedIp(a.address))) return cb(new Error('blocked-address'));
    const a = addrs[0];
    if (options?.all) return cb(null, addrs.map(x => ({ address: x.address, family: x.family })));
    cb(null, a.address, a.family);
  }).catch(e => cb(e));
}

interface Fetched { status: number; location?: string; contentType?: string; body: string }

function fetchOnce(u: URL, deadline: number): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const remaining = Math.max(500, deadline - Date.now());
    const req = mod.request(u, {
      method: 'GET', lookup: safeLookup as any, timeout: remaining,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlajahLinkPreview/1.0; +https://plajah.com)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity', 'Accept-Language': 'en',
      },
    }, resp => {
      const status = resp.statusCode || 0;
      const location = resp.headers.location;
      const contentType = resp.headers['content-type'];
      if (status >= 300 && status < 400) { resp.resume(); return resolve({ status, location, contentType, body: '' }); }
      if (!isHtmlContentType(contentType)) { resp.destroy(); return resolve({ status, contentType, body: '' }); }
      const chunks: Buffer[] = []; let size = 0;
      resp.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) { chunks.push(c.subarray(0, c.length - (size - MAX_BODY_BYTES))); resp.destroy(); return; }
        chunks.push(c);
      });
      const done = () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') });
      resp.on('end', done); resp.on('close', done);
      resp.on('error', () => done());
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.setTimeout(remaining);
    req.end();
  });
}

async function unfurl(startUrl: string): Promise<LinkPreview | { error: string }> {
  const first = checkUrlShape(startUrl);
  if (!first.ok) return { error: first.reason };
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  let current = first.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() >= deadline) return { error: 'timeout' };
    let r: Fetched;
    try { r = await fetchOnce(current, deadline); } catch (e: any) {
      return { error: /blocked-address/.test(String(e?.message)) ? 'blocked-host' : 'fetch-failed' };
    }
    if (r.status >= 300 && r.status < 400) {
      const next = resolveRedirect(current, r.location);
      if (!next.ok) return { error: next.reason };   // every hop re-validated (scheme/host); DNS re-validated in safeLookup
      current = next.url;
      continue;
    }
    if (r.status < 200 || r.status >= 300) return { error: `http-${r.status}` };
    if (!isHtmlContentType(r.contentType)) return { error: 'not-html' };
    return parseLinkMeta(r.body, current.toString());
  }
  return { error: 'too-many-redirects' };
}

socialServerRouter.get('/link-preview', async (req: Request, res: Response) => {
  const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
  if (!rateAllow(previewRate, ip, 30, 60_000)) return res.status(429).json({ error: 'Too many requests.' });
  const raw = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const shape = checkUrlShape(raw);
  if (!shape.ok) return res.status(400).json({ error: shape.reason });

  const key = shape.url.toString();
  const hit = previewCache.get(key);
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (hit) {
    if ('error' in hit) return res.status(422).json({ error: hit.error });
    return res.json(hit);
  }
  const out = await unfurl(key);
  previewCache.set(key, out);
  if ('error' in out) return res.status(422).json({ error: out.error });
  res.json(out);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ACHIEVEMENT UNLOCK
// ════════════════════════════════════════════════════════════════════════════

const unlockRate = new Map<string, { start: number; n: number }>();

socialServerRouter.post('/achievements/unlock', express.json({ limit: '4kb' }), async (req: Request, res: Response) => {
  const uid = await registeredCaller(req, res);
  if (!uid) return;
  if (!rateAllow(unlockRate, uid, 30, 60_000)) return res.status(429).json({ error: 'Too many requests.' });

  const achievementId = (req.body ?? {}).achievementId;
  const catalog = typeof achievementId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(achievementId)
    ? await getDoc(`achievements/${achievementId}`) : null;
  const check = checkUnlockable(achievementId, catalog?.data);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  const id = userAchievementDocId(uid, achievementId);
  const now = Date.now();
  const doc = buildUserAchievementDoc(uid, achievementId, now);
  const created = await createOnce('userAchievements', id, doc);
  if (created === 'error') return res.status(500).json({ error: 'Could not unlock.' });

  const existing = created === 'exists' ? await getDoc(`userAchievements/${id}`) : null;
  const progress = created === 'exists' && existing ? { id, ...existing.data } : { id, ...doc };
  const earnedAt = Number((progress as any).unlockedAt) || now;

  // Public showcase copy (best-effort; honours shareAchievements + private accounts). Re-publishing on a repeat
  // call also backfills a showcase doc that failed the first time.
  let published = false;
  try {
    const profile = (await getDoc(`users/${uid}`))?.data ?? null;
    const plan = planPublicAchievement(uid, achievementId, catalog!.data, profile, earnedAt);
    if (plan) {
      const r = await createOnce('publicAchievements', plan.id, plan.data);
      published = r === 'created' || r === 'exists';
    }
  } catch { /* showcase is optional */ }

  res.json({ ok: true, alreadyUnlocked: created === 'exists', published, progress });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. DEBATE POINTS
// ════════════════════════════════════════════════════════════════════════════

const awardRate = new Map<string, { start: number; n: number }>();

socialServerRouter.post('/debates/award-points', express.json({ limit: '4kb' }), async (req: Request, res: Response) => {
  const uid = await registeredCaller(req, res);
  if (!uid) return;
  if (!rateAllow(awardRate, uid, 20, 60_000)) return res.status(429).json({ error: 'Too many requests.' });

  const debateId = (req.body ?? {}).debateId;
  if (typeof debateId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(debateId)) return res.status(400).json({ error: 'debateId is required.' });

  const snap = await getDoc(`debates/${debateId}`);
  const award = computeDebateAward(snap?.data, Date.now());
  // Already-awarded is a success for callers (everyone who views a judged debate fires this).
  if (!award.ok) {
    if (snap?.data?.pointsAwarded === true) return res.json({ ok: true, awarded: false, alreadyAwarded: true });
    return res.status(award.status).json({ error: award.error });
  }

  // Claim BEFORE paying out: the precondition makes exactly one concurrent caller win.
  const claim = await patch(`debates/${debateId}`, { pointsAwarded: true, pointsAwardedAt: Date.now() }, snap!.updateTime);
  if (claim === 'conflict') return res.json({ ok: true, awarded: false, alreadyAwarded: true });
  if (claim === 'error') return res.status(500).json({ error: 'Could not record award.' });

  const results = await Promise.all(award.awards.map(a => incrementExisting(`users/${a.uid}`, 'totalPoints', a.points)));
  if (results.some(r => !r)) {
    // A failed payout must not be lost forever: release the claim so a later call retries.
    // (Participants whose increment already landed would be paid twice on retry only if the OTHER one failed;
    // acceptable for a points counter and strictly better than silently dropping the award.)
    await patch(`debates/${debateId}`, { pointsAwarded: false });
    return res.status(500).json({ error: 'Could not credit points; try again.' });
  }
  res.json({ ok: true, awarded: true, winner: award.winner, awards: award.awards });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. SCHEDULED POSTS — server-side publisher
// ════════════════════════════════════════════════════════════════════════════

async function publishOne(row: ScheduledRow & { updateTime: string }, now: number): Promise<'published' | 'skipped' | 'failed'> {
  const path = `scheduled_posts/${row.id}`;
  // 1) Claim atomically. Precondition on updateTime: if the author's client (or another run) touched the doc
  //    since we read it, the patch is refused and we skip — exactly one publisher proceeds.
  const claim = claimFields(row, now);
  const c = await patch(path, claim, row.updateTime);
  if (c !== 'ok') return 'skipped';
  const attempts = claim.attempts;

  try {
    const profile = (await getDoc(`users/${row.authorId}`))?.data ?? null;
    const planned = planScheduledPost(row, profile, now);
    if (!planned.ok) {
      await patch(path, { status: 'FAILED', lastError: planned.error.slice(0, 300) });
      return 'failed';
    }
    const { plan } = planned;
    // Server-side spam gate (client heuristic + trust tier; services/trust/serverSpamGate.ts).
    const spam = serverSpamCheck(String((plan.data as any).text || ''), { accountCreatedMs: profileCreatedMs(profile), now });
    if (spam.block) {
      recordSecurityEvent('spam_blocked_server', { route: 'scheduled_posts', uid: row.authorId, detail: `${spam.tier} ${spam.reasons.join(',')}` });
      await patch(path, { status: 'FAILED', lastError: `Blocked by spam check: ${spam.reasons.join(', ')}`.slice(0, 300) });
      return 'failed';
    }
    // Deterministic id: a duplicate publish (client + server, or a retry) cannot create a second post.
    // Also check the sibling collection in case the author flipped private/public in between.
    const other = plan.collection === 'posts' ? 'private_posts' : 'posts';
    const dup = await getDoc(`${other}/${plan.id}`);
    const created = dup ? 'exists' : await createOnce(plan.collection, plan.id, plan.data);
    if (created === 'error') throw new Error('post write failed');
    if (created === 'created') {
      if (plan.feed) await createOnce('feed', plan.feed.id, plan.feed.data).catch(() => {});  // best-effort mirror
      const tags: unknown = (plan.data as any).hashtags;
      if (Array.isArray(tags) && plan.collection === 'posts') {
        for (const raw of tags.slice(0, 10)) {
          const tag = typeof raw === 'string' ? normalizeHashtag(raw) : null;
          if (tag) await incrementUpsert(`hashtags/${tag}`, 'count', 1, { tag, lastUsed: now });
        }
      }
    }
    await patch(path, { status: 'PUBLISHED', publishedPostId: plan.id, publishedAt: now });
    return 'published';
  } catch (e: any) {
    await patch(path, failureFields(attempts, e?.message || 'publish failed'));
    return 'failed';
  }
}

socialServerRouter.post('/social/publish-due-posts', async (req: Request, res: Response) => {
  const expected = process.env.SCHEDULER_SECRET || '';
  if (!expected) return res.status(503).json({ error: 'Scheduler is not configured.' });
  if (!secretsEqual(req.headers['x-scheduler-secret'], expected)) return res.status(401).json({ error: 'Unauthorized' });
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });

  const now = Date.now();
  try {
    // Two index-backed queries (status ASC, publishAt ASC): fresh PENDING, and PUBLISHING claims to test for staleness.
    const [pending, publishing] = await Promise.all([
      runQuery('scheduled_posts', [{ field: 'status', op: 'EQUAL', value: 'PENDING' }, { field: 'publishAt', op: 'LESS_THAN_OR_EQUAL', value: now }], PUBLISH_BATCH_LIMIT),
      runQuery('scheduled_posts', [{ field: 'status', op: 'EQUAL', value: 'PUBLISHING' }, { field: 'publishAt', op: 'LESS_THAN_OR_EQUAL', value: now }], PUBLISH_BATCH_LIMIT),
    ]);
    const rows = [...pending, ...publishing].map(r => ({ id: r.id, updateTime: r.updateTime, ...r.data } as ScheduledRow & { updateTime: string }));
    const due = selectDue(rows, now, PUBLISH_BATCH_LIMIT) as Array<ScheduledRow & { updateTime: string }>;

    let published = 0, failed = 0, skipped = 0;
    for (const row of due) {
      const r = await publishOne(row, now);
      if (r === 'published') published++; else if (r === 'failed') failed++; else skipped++;
    }
    res.json({ ok: true, due: due.length, published, failed, skipped });
  } catch (e: any) {
    console.error('[socialServer] publish-due-posts failed:', e?.message || e);
    res.status(500).json({ error: 'publish run failed' });
  }
});
