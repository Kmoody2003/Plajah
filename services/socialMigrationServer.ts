// socialMigrationServer — "move your conversation here" mechanics (server side). Registered from server.ts with ONE
// call (registerSocialMigrationRoutes); every server helper is injected, so this file never imports server.ts.
//
//   POST /api/social/find-people        Bluesky + Mastodon follow graph → Plajah users who linked the same account
//   POST /api/social/follow-batch       one-tap / "follow all" for the matches (server REST writes; private → request)
//   GET  /api/invite/me                 the caller's personal invite link (/join/:code), created on first call
//   POST /api/invite/redeem {code}      new account (≤7 days old) arriving via /join/:code → mutual follow + inviter credit
//   GET  /c/:id /room/:id /talk/:id /party/:id /live/:id /join/:code
//                                       SPA shell with a rich OG/Twitter card (club, room, live talk, party, live stream,
//                                       invite). index.html's inline boot script maps the path to the ?club=/?room=/…
//                                       params the app already handles, so humans land in the right place.
//
// Collections (all server-written; the browser never reads or writes them, so they need no client rules —
// default-deny keeps them private; see docs/rules-patches/social-perf.rules.snippet):
//   fediverse_handles/{bluesky_<did> | mastodon_<user@host>}   { uid, network, handle, updatedAt }
//   invites/{code}                                              { inviterUid, createdAt, redeemedCount }
//   invite_owners/{uid}                                         { code, createdAt }
//   invite_redemptions/{uid}                                    { code, inviterUid, at }   (one redemption per account, ever)
// Follow writes match the client's followUser(): follows/{a}_{b} {followerId, followingId, timestamp} + counters +
// a FOLLOW notification; private targets get follow_requests/{a}_{b} {status:'pending'} like requestFollow().
import {
  blueskyKey, mastodonKey, mastodonAddress, isInviteCode, makeInviteCode, canRedeemInvite,
  buildShareCard, type ShareKind,
} from './socialPerfCore';

type Row = Record<string, any>;
export interface SocialGraphDeps {
  firestoreAuthHeaders: () => Promise<Record<string, string>>;
  firestoreIncrement: (path: string, inc: Record<string, number>) => Promise<boolean>;
  now?: () => number;
}
export interface SocialMigrationDeps extends SocialGraphDeps {
  app: any; express: any; authMiddleware: any;
  /** server.ts: (await getFediverseAuth()).loadAccounts(uid, idToken) — decrypted creds, refreshed. */
  loadFediverseAccounts: (uid: string, idToken: string) => Promise<any[]>;
  /** dist/index.html (prod) or null. */
  readIndexHtml: () => Promise<string | null>;
  publicHost: (req: any) => string;
  htmlEscape: (s: string) => string;
  isProduction: boolean;
}

const BASE = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';
const DOC_NAME = (path: string) => `projects/gen-lang-client-0665118474/databases/plajah-prod/documents/${path}`;
const isUid = (u: unknown): u is string => typeof u === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(u);
const isDocId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_:-]{1,128}$/.test(s);
const CRAWLER_RE = /(bot|crawl|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|embedly|linkedinbot|pinterest|redditbot|googlebot|bingbot|applebot|skypeuripreview|vkshare|w3c_validator|iframely|mastodon|bluesky|cardyb)/i;

// ─── tiny typed Firestore REST layer ─────────────────────────────────────────

function toFs(x: any): any {
  if (x === null || x === undefined) return { nullValue: null };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toFs) } };
  if (typeof x === 'object') { const fields: Row = {}; for (const [k, v] of Object.entries(x)) if (v !== undefined) fields[k] = toFs(v); return { mapValue: { fields } }; }
  return { stringValue: String(x) };
}
function fromFs(v: any): any {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return Date.parse(v.timestampValue);
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fromFs);
  if (v.mapValue !== undefined) { const o: Row = {}; for (const [k, mv] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(mv); return o; }
  return undefined;
}
const fieldsOf = (data: Row) => { const f: Row = {}; for (const [k, v] of Object.entries(data)) if (v !== undefined) f[k] = toFs(v); return f; };

function rest(d: SocialGraphDeps) {
  const headers = async () => ({ ...(await d.firestoreAuthHeaders()), 'Content-Type': 'application/json' });
  return {
    async get(path: string): Promise<Row | null> {
      try {
        const r = await fetch(`${BASE}/${path}`, { headers: await headers() });
        if (!r.ok) return null;
        const j = await r.json() as any;
        const o: Row = {}; for (const [k, v] of Object.entries(j.fields || {})) o[k] = fromFs(v);
        return o;
      } catch { return null; }
    },
    /** Many docs in one round trip. Returns path → data (missing docs absent). */
    async batchGet(paths: string[]): Promise<Map<string, Row>> {
      const out = new Map<string, Row>();
      const uniq = [...new Set(paths)];
      for (let i = 0; i < uniq.length; i += 300) {
        const chunk = uniq.slice(i, i + 300);
        try {
          const r = await fetch(`${BASE}:batchGet`, { method: 'POST', headers: await headers(), body: JSON.stringify({ documents: chunk.map(DOC_NAME) }) });
          if (!r.ok) continue;
          const arr = await r.json() as any[];
          for (const e of Array.isArray(arr) ? arr : []) {
            if (!e.found) continue;
            const path = String(e.found.name).split('/documents/')[1];
            const o: Row = {}; for (const [k, v] of Object.entries(e.found.fields || {})) o[k] = fromFs(v);
            out.set(path, o);
          }
        } catch { /* partial results are fine */ }
      }
      return out;
    },
    async createOnce(collection: string, id: string, data: Row): Promise<'created' | 'exists' | 'error'> {
      try {
        const r = await fetch(`${BASE}/${collection}?documentId=${encodeURIComponent(id)}`, { method: 'POST', headers: await headers(), body: JSON.stringify({ fields: fieldsOf(data) }) });
        if (r.ok) return 'created';
        if (r.status === 409) return 'exists';
        console.error(`[socialMigration] createOnce ${collection}/${id} HTTP ${r.status}`);
        return 'error';
      } catch { return 'error'; }
    },
    async patch(path: string, data: Row): Promise<boolean> {
      const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      try {
        const r = await fetch(`${BASE}/${path}?${mask}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ fields: fieldsOf(data) }) });
        return r.ok;
      } catch { return false; }
    },
    async remove(path: string): Promise<void> {
      try { await fetch(`${BASE}/${path}`, { method: 'DELETE', headers: await headers() }); } catch { /* best effort */ }
    },
    async create(collection: string, data: Row): Promise<void> {
      try { await fetch(`${BASE}/${collection}`, { method: 'POST', headers: await headers(), body: JSON.stringify({ fields: fieldsOf(data) }) }); } catch { /* best effort */ }
    },
  };
}

// ─── follow writes (shared by find-people, invites, legacy follow-batch) ─────

export interface FollowBatchResult { followed: string[]; requested: string[]; already: string[]; skipped: string[] }
const MAX_REQUESTS_PER_BATCH = 20; // follow REQUESTS notify a private person — keep a batch from spamming

/**
 * Follow each target as `uid`, server-side, with the same semantics as the client's followUser():
 * blocked pairs skipped; private accounts get a follow REQUEST; public ones get follows/{uid}_{t} + counters +
 * a FOLLOW notification. Idempotent (createOnce), so retries never double-count.
 */
export async function serverFollowBatch(d: SocialGraphDeps, uid: string, rawTargets: string[], source = 'social_import'): Promise<FollowBatchResult> {
  const fs = rest(d);
  const targets = [...new Set(rawTargets.filter(t => isUid(t) && t !== uid))].slice(0, 200);
  const res: FollowBatchResult = { followed: [], requested: [], already: [], skipped: [] };
  if (!targets.length) return res;
  const paths = [`users/${uid}`];
  for (const t of targets) paths.push(`users/${t}`, `blocks/${uid}_${t}`, `blocks/${t}_${uid}`);
  const got = await fs.batchGet(paths);
  const me = got.get(`users/${uid}`) || {};
  const myName = String(me.displayName || me.username || 'Someone');
  const myPhoto = String(me.photoURL || '');
  const now = d.now?.() ?? Date.now();
  let requests = 0;
  for (const t of targets) {
    const target = got.get(`users/${t}`);
    if (!target || got.has(`blocks/${uid}_${t}`) || got.has(`blocks/${t}_${uid}`)) { res.skipped.push(t); continue; }
    if (target.isPrivate === true) {
      if (requests >= MAX_REQUESTS_PER_BATCH) { res.skipped.push(t); continue; }
      requests++;
      const r = await fs.createOnce('follow_requests', `${uid}_${t}`, {
        requesterId: uid, targetId: t, status: 'pending', requesterName: myName, requesterPhoto: myPhoto, createdAt: new Date(now), source,
      });
      if (r === 'created') {
        res.requested.push(t);
        await fs.create('notifications', { userId: t, senderId: uid, senderName: myName, senderPhoto: myPhoto, type: 'FOLLOW', title: 'Follow request', message: `${myName} wants to follow you`, link: 'USER_PROFILE', targetId: uid, isRead: false, timestamp: new Date(now) });
      } else if (r === 'exists') res.already.push(t); else res.skipped.push(t);
      continue;
    }
    const r = await fs.createOnce('follows', `${uid}_${t}`, { followerId: uid, followingId: t, timestamp: new Date(now), source });
    if (r === 'exists') { res.already.push(t); continue; }
    if (r !== 'created') { res.skipped.push(t); continue; }
    res.followed.push(t);
    await Promise.all([
      d.firestoreIncrement(`users/${t}`, { followerCount: 1 }),
      d.firestoreIncrement(`users/${uid}`, { followingCount: 1 }),
      fs.create('notifications', { userId: t, senderId: uid, senderName: myName, senderPhoto: myPhoto, type: 'FOLLOW', title: 'New Follower', message: `${myName} is now following you`, link: 'USER_PROFILE', targetId: uid, isRead: false, timestamp: new Date(now) }),
    ]);
  }
  return res;
}

// ─── follow graphs ───────────────────────────────────────────────────────────

export interface RemoteFollow { network: 'bluesky' | 'mastodon'; key: string; handle: string; displayName: string; avatarUrl?: string; profileUrl: string }
const MAX_FOLLOWS = 2000;

async function mastodonFollowing(creds: { accessToken: string; instanceUrl?: string }): Promise<RemoteFollow[]> {
  const base = String(creds.instanceUrl || '').replace(/\/$/, '');
  const host = base.replace(/^https?:\/\//, '');
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(base)) return [];
  const auth = { Authorization: `Bearer ${creds.accessToken}` };
  const me = await fetch(`${base}/api/v1/accounts/verify_credentials`, { headers: auth }).then(r => r.ok ? r.json() : null).catch(() => null) as any;
  if (!me?.id) return [];
  const out: RemoteFollow[] = [];
  let url: string | null = `${base}/api/v1/accounts/${encodeURIComponent(String(me.id))}/following?limit=80`;
  for (let page = 0; url && page < 30 && out.length < MAX_FOLLOWS; page++) {
    const r = await fetch(url, { headers: auth }).catch(() => null);
    if (!r || !r.ok) break;
    const arr = await r.json().catch(() => []) as any[];
    for (const a of Array.isArray(arr) ? arr : []) {
      const key = mastodonKey(String(a.acct || ''), host);
      if (!key) continue;
      out.push({ network: 'mastodon', key, handle: `@${mastodonAddress(String(a.acct), host)}`, displayName: String(a.display_name || a.username || a.acct), avatarUrl: a.avatar ? String(a.avatar) : undefined, profileUrl: String(a.url || '') });
    }
    // Link: <https://host/api/v1/accounts/1/following?max_id=…>; rel="next" — only follow it on the same host.
    const next = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link') || '')?.[1] || null;
    url = next && next.startsWith(`${base}/`) ? next : null;
  }
  return out.slice(0, MAX_FOLLOWS);
}

async function blueskyFollowing(creds: any): Promise<RemoteFollow[]> {
  const { bskyGetFollows } = await import('./fediverse/bluesky.js');
  const list = await bskyGetFollows(creds, MAX_FOLLOWS);
  return list.flatMap(f => {
    const key = blueskyKey(f.did);
    return key ? [{ network: 'bluesky' as const, key, handle: `@${f.handle}`, displayName: f.displayName, avatarUrl: f.avatarUrl, profileUrl: `https://bsky.app/profile/${f.handle}` }] : [];
  });
}

/** The fediverse_handles key for one of the caller's OWN connected accounts. */
function ownKey(a: any): { key: string; network: 'bluesky' | 'mastodon'; handle: string } | null {
  if (a?.protocol === 'bluesky') {
    const key = blueskyKey(a.credentials?.did || '');
    return key ? { key, network: 'bluesky', handle: String(a.handle || '') } : null;
  }
  if (a?.protocol === 'mastodon') {
    const host = String(a.instanceUrl || a.credentials?.instanceUrl || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const key = mastodonKey(String(a.handle || ''), host);
    return key ? { key, network: 'mastodon', handle: `@${mastodonAddress(String(a.handle), host)}` } : null;
  }
  return null;
}

/** Point fediverse_handles at `uid` for each connected Bluesky/Mastodon account (latest verified owner wins). */
export async function registerFediverseHandles(d: SocialGraphDeps, uid: string, accounts: any[]): Promise<string[]> {
  const fs = rest(d);
  const keys: string[] = [];
  for (const a of accounts) {
    if (a?.isActive === false) continue;
    const k = ownKey(a);
    if (!k) continue;
    keys.push(k.key);
    await fs.patch(`fediverse_handles/${k.key}`, { uid, network: k.network, handle: k.handle, updatedAt: d.now?.() ?? Date.now() });
  }
  return keys;
}

/** On disconnect: drop the mapping only if it still points at this user. */
export async function unregisterFediverseHandle(d: SocialGraphDeps, uid: string, account: any): Promise<void> {
  const k = ownKey(account);
  if (!k) return;
  const fs = rest(d);
  const cur = await fs.get(`fediverse_handles/${k.key}`);
  if (cur?.uid === uid) await fs.remove(`fediverse_handles/${k.key}`);
}

// ─── routes ──────────────────────────────────────────────────────────────────

const throttle = new Map<string, number[]>();
function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (throttle.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) { throttle.set(key, hits); return false; }
  hits.push(now); throttle.set(key, hits);
  if (throttle.size > 5000) for (const [k, v] of throttle) if (!v.some(t => now - t < windowMs)) throttle.delete(k);
  return true;
}

/** When the Firebase account was created (Identity Toolkit), or null. */
async function accountCreatedAt(idToken: string): Promise<number | null> {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    if (!r.ok) return null;
    const u = (await r.json() as any)?.users?.[0];
    const t = Number(u?.createdAt);
    return Number.isFinite(t) && t > 0 ? t : null;
  } catch { return null; }
}

export function registerSocialMigrationRoutes(d: SocialMigrationDeps) {
  const { app, express, authMiddleware } = d;
  const fs = rest(d);
  const bearer = (req: any) => String(req.headers.authorization || '').slice(7);

  // ── Find your people ──
  app.post('/api/social/find-people', express.json(), authMiddleware, async (req: any, res: any) => {
    if (req.isAnonymous) return res.status(403).json({ error: 'A registered account is required', code: 'ANONYMOUS_NOT_ALLOWED' });
    if (!allow(`fp:${req.uid}`, 6, 10 * 60_000)) return res.status(429).json({ error: 'Give it a few minutes before searching again.' });
    try {
      const accounts = (await d.loadFediverseAccounts(req.uid, bearer(req))).filter(a => (a.protocol === 'bluesky' || a.protocol === 'mastodon') && a.isActive !== false);
      if (!accounts.length) return res.json({ accounts: [], matches: [], unmatched: [], totals: { follows: 0, matched: 0 }, errors: [] });
      await registerFediverseHandles(d, req.uid, accounts);

      const errors: string[] = [];
      const follows: RemoteFollow[] = [];
      await Promise.all(accounts.map(async a => {
        try { follows.push(...(a.protocol === 'bluesky' ? await blueskyFollowing(a.credentials) : await mastodonFollowing(a.credentials))); }
        catch (e: any) { errors.push(`${a.protocol}: ${String(e?.message || 'could not read follows').slice(0, 160)}`); }
      }));
      const byKey = new Map<string, RemoteFollow>();
      for (const f of follows) if (!byKey.has(f.key)) byKey.set(f.key, f);

      const handleDocs = await fs.batchGet([...byKey.keys()].map(k => `fediverse_handles/${k}`));
      const matchedByUid = new Map<string, RemoteFollow>();
      for (const [k, f] of byKey) {
        const owner = handleDocs.get(`fediverse_handles/${k}`)?.uid;
        if (isUid(owner) && owner !== req.uid && !matchedByUid.has(owner)) matchedByUid.set(owner, f);
      }
      const uids = [...matchedByUid.keys()];
      const extra = await fs.batchGet(uids.flatMap(u => [`users/${u}`, `follows/${req.uid}_${u}`, `follow_requests/${req.uid}_${u}`, `blocks/${req.uid}_${u}`, `blocks/${u}_${req.uid}`]));
      const matches = uids.flatMap(u => {
        const p = extra.get(`users/${u}`);
        if (!p || extra.has(`blocks/${req.uid}_${u}`) || extra.has(`blocks/${u}_${req.uid}`)) return [];
        const f = matchedByUid.get(u)!;
        const reqDoc = extra.get(`follow_requests/${req.uid}_${u}`);
        return [{
          uid: u,
          displayName: String(p.displayName || p.username || f.displayName),
          username: p.username ? String(p.username) : '',
          photoURL: String(p.photoURL || f.avatarUrl || ''),
          isPrivate: p.isPrivate === true,
          network: f.network, externalHandle: f.handle,
          state: extra.has(`follows/${req.uid}_${u}`) ? 'following' : reqDoc?.status === 'pending' ? 'requested' : 'none',
        }];
      });
      const matchedKeys = new Set([...matchedByUid.values()].map(f => f.key));
      const unmatched = [...byKey.values()].filter(f => !matchedKeys.has(f.key)).slice(0, 300)
        .map(f => ({ network: f.network, handle: f.handle, displayName: f.displayName, avatarUrl: f.avatarUrl || '', profileUrl: f.profileUrl }));
      res.json({
        accounts: accounts.map(a => ({ network: a.protocol, handle: ownKey(a)?.handle || String(a.handle || '') })),
        matches, unmatched, totals: { follows: byKey.size, matched: matches.length }, errors,
      });
    } catch (e: any) {
      console.error('[find-people]', e?.message || e);
      res.status(500).json({ error: 'Could not search your networks right now.' });
    }
  });

  // ── Batch follow (Find-your-people "Follow all") ──
  app.post('/api/social/follow-batch', express.json(), authMiddleware, async (req: any, res: any) => {
    if (req.isAnonymous) return res.status(403).json({ error: 'A registered account is required', code: 'ANONYMOUS_NOT_ALLOWED' });
    const uids = Array.isArray(req.body?.uids) ? req.body.uids : [];
    if (!uids.length) return res.status(400).json({ error: 'uids required' });
    if (!allow(`fb:${req.uid}`, 10, 60 * 60_000)) return res.status(429).json({ error: 'Too many follow batches — try again later.' });
    try { res.json(await serverFollowBatch(d, req.uid, uids, 'find_people')); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'follow failed' }); }
  });

  // ── Invites ──
  app.get('/api/invite/me', authMiddleware, async (req: any, res: any) => {
    if (req.isAnonymous) return res.status(403).json({ error: 'A registered account is required', code: 'ANONYMOUS_NOT_ALLOWED' });
    try {
      const owner = await fs.get(`invite_owners/${req.uid}`);
      let code = isInviteCode(owner?.code) ? owner!.code as string : '';
      if (!code) {
        for (let i = 0; i < 5 && !code; i++) {
          const c = makeInviteCode();
          if (await fs.createOnce('invites', c, { inviterUid: req.uid, createdAt: Date.now(), redeemedCount: 0 }) === 'created') code = c;
        }
        if (!code) return res.status(500).json({ error: 'Could not create an invite code' });
        const claim = await fs.createOnce('invite_owners', req.uid, { code, createdAt: Date.now() });
        if (claim === 'exists') { // a concurrent call won — use its code, drop ours
          await fs.remove(`invites/${code}`);
          const again = await fs.get(`invite_owners/${req.uid}`);
          code = String(again?.code || code);
        }
      }
      const inv = await fs.get(`invites/${code}`);
      res.json({ code, url: `https://${d.publicHost(req)}/join/${code}`, redeemedCount: Number(inv?.redeemedCount || 0) });
    } catch (e: any) { res.status(500).json({ error: e?.message || 'invite failed' }); }
  });

  app.post('/api/invite/redeem', express.json(), authMiddleware, async (req: any, res: any) => {
    const code = String(req.body?.code || '').toLowerCase();
    if (!isInviteCode(code)) return res.status(400).json({ ok: false, reason: 'bad_code' });
    if (req.isAnonymous) return res.status(403).json({ ok: false, reason: 'anonymous' });
    if (!allow(`ir:${req.uid}`, 5, 60 * 60_000)) return res.status(429).json({ ok: false, reason: 'rate' });
    try {
      const inv = await fs.get(`invites/${code}`);
      const createdAt = await accountCreatedAt(bearer(req));
      const verdict = canRedeemInvite({ inviterUid: inv?.inviterUid, redeemerUid: req.uid, accountCreatedAt: createdAt, now: Date.now() });
      if (!verdict.ok) return res.json(verdict);
      // Sign-up writes the profile doc a moment after auth — don't burn the one-time claim before it exists.
      if (!(await fs.get(`users/${req.uid}`))) return res.json({ ok: false, reason: 'profile_pending' });
      const inviterUid = String(inv!.inviterUid);
      const claim = await fs.createOnce('invite_redemptions', req.uid, { code, inviterUid, at: Date.now() });
      if (claim !== 'created') return res.json({ ok: false, reason: claim === 'exists' ? 'already_redeemed' : 'error' });
      // Mutual follow, each direction respecting that side's privacy (private → request).
      const [mine, theirs] = await Promise.all([
        serverFollowBatch(d, req.uid, [inviterUid], 'invite'),
        serverFollowBatch(d, inviterUid, [req.uid], 'invite'),
      ]);
      await Promise.all([
        d.firestoreIncrement(`invites/${code}`, { redeemedCount: 1 }),
        d.firestoreIncrement(`users/${inviterUid}`, { invitedCount: 1 }), // credit = a counter, nothing else
      ]);
      const inviter = await fs.get(`users/${inviterUid}`);
      res.json({ ok: true, inviter: { uid: inviterUid, displayName: String(inviter?.displayName || inviter?.username || 'your friend') }, mine, theirs });
    } catch (e: any) { res.status(500).json({ ok: false, reason: 'error', error: e?.message }); }
  });

  // ── Rich share cards for path-style links ──
  const PREFIX: Record<string, ShareKind> = { c: 'club', room: 'room', talk: 'talk', party: 'party', live: 'live', join: 'join' };
  const loadCard = async (kind: ShareKind, id: string, host: string) => {
    const fallback = `https://${host}/og-default.png`;
    const userName = (u: Row | null) => String(u?.displayName || u?.artistName || u?.username || '');
    switch (kind) {
      case 'club': {
        const c = await fs.get(`clubs/${id}`); if (!c) return null;
        if (c.isPrivate === true) return buildShareCard('club', { name: String(c.name || ''), description: 'A private club on Plajah.' }, fallback);
        return buildShareCard('club', { name: String(c.name || ''), count: Number(c.memberCount || 0), description: String(c.description || ''), image: String(c.coverImage || c.iconImage || '') }, fallback);
      }
      case 'room': {
        const r = await fs.get(`rooms/${id}`); if (!r) return null;
        const live = !r.endedAt && (r.persistent === true || Number(r.endsAt || 0) > Date.now());
        return buildShareCard('room', { name: String(r.title || ''), host: String(r.hostName || ''), live, image: String(r.hostPhoto || '') }, fallback);
      }
      case 'talk': {
        const t = await fs.get(`liveTalks/${id}`); if (!t) return null;
        const count = (Array.isArray(t.speakers) ? t.speakers.length : 0) + (Array.isArray(t.listeners) ? t.listeners.length : 0);
        return buildShareCard('talk', { name: String(t.title || ''), host: String(t.hostName || ''), live: t.isActive !== false, count, image: String(t.hostPhoto || '') }, fallback);
      }
      case 'party': {
        const p = await fs.get(`parties/${id}`); if (!p) return null;
        return buildShareCard('party', { host: String(p.hostName || ''), contentTitle: String(p.content?.title || ''), live: p.isActive !== false, image: String(p.content?.thumbnail || p.hostPhoto || '') }, fallback);
      }
      case 'live': {
        const f = await fs.get(`live_feeds/${id}`); if (!f) return null;
        const image = f.muxPlaybackId ? `https://image.mux.com/${encodeURIComponent(String(f.muxPlaybackId))}/thumbnail.jpg?width=1200&height=630&fit_mode=smartcrop` : String(f.thumbnailUrl || f.ownerPhoto || '');
        return buildShareCard('live', { name: String(f.title || ''), host: String(f.ownerName || ''), live: f.status === 'LIVE', count: Number(f.viewerCount || 0), image }, fallback);
      }
      case 'join': {
        const inv = await fs.get(`invites/${id}`); if (!inv?.inviterUid) return null;
        const u = await fs.get(`users/${inv.inviterUid}`);
        return buildShareCard('join', { host: userName(u), image: String(u?.photoURL || '') }, fallback);
      }
    }
  };

  app.get(['/c/:id', '/room/:id', '/talk/:id', '/party/:id', '/live/:id', '/join/:id'], async (req: any, res: any, next: any) => {
    const crawler = CRAWLER_RE.test(String(req.headers['user-agent'] || ''));
    // Dev: Vite serves (and transforms) index.html; only crawlers need the server-rendered card.
    if (!d.isProduction && !crawler) return next();
    const m = /^\/(c|room|talk|party|live|join)\/([A-Za-z0-9_:-]{1,128})\/?$/.exec(req.path);
    if (!m || !isDocId(m[2])) return next();
    const kind = PREFIX[m[1]];
    const id = kind === 'join' ? m[2].toLowerCase() : m[2];
    let html = await d.readIndexHtml();
    if (!html) return next();
    const host = d.publicHost(req);
    let card = null as ReturnType<typeof buildShareCard> | null;
    try { if (kind !== 'join' || isInviteCode(id)) card = await loadCard(kind, id, host); } catch { card = null; }
    if (card) {
      const e = d.htmlEscape;
      const url = `https://${host}/${m[1]}/${encodeURIComponent(id)}`;
      html = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
      html = html.replace('</head>', `
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${e(card.title)}" />
    <meta name="twitter:description" content="${e(card.description)}" />
    <meta name="twitter:image" content="${e(card.image)}" />
    <meta property="og:site_name" content="Plajah" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${e(card.title)}" />
    <meta property="og:description" content="${e(card.description)}" />
    <meta property="og:image" content="${e(card.image)}" />
    <meta property="og:url" content="${e(url)}" />
</head>`).replace(/<title>[^<]*<\/title>/, `<title>${e(card.title)} | Plajah</title>`);
      res.set('Cache-Control', 'public, max-age=120');
    } else {
      res.set('Cache-Control', 'no-store, max-age=0'); // never let a CDN pin the generic card
    }
    res.type('html').send(html);
  });
}
