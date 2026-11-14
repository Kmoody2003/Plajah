// Copyright notices: DMCA takedowns, counter-notices and repeat infringers (17 U.S.C. § 512).
// Mounted in server.ts:  app.use('/api/copyright', createCopyrightRouter({ authMiddleware, requireVerifiedAdmin }))
//
// Safe harbor needs four things this route provides: a working intake for complete notices, removing
// or disabling the material expeditiously, a counter-notice path with the 10–14 business-day clock,
// and a repeat-infringer policy that is actually enforced. Pure rules: services/legal/copyrightCore.ts.
//
// Collections (all server-only — firestore.rules deny-all):
//   copyrightNotices/{id}          the notice as received + status timeline
//   copyrightNoticesPrivate/{id}   network address + user agent of the sender
//   copyrightHolds/{kind}_{id}     a disabled item: notice, uploader, revoked download tokens, prior visibility
//   copyrightStrikes/{uid}         { strikes: Strike[] }  one per notice, 12-month window
//
// Endpoints
//   POST /notice                 public    takedown or licensing dispute
//   POST /counter                signed in counter-notice from the account that posted the material
//   GET  /mine                   signed in holds on my content + my active strikes
//   GET  /queue                  admin     recent notices
//   POST /:id/decide             admin     { outcome: remove|reject|needs_info|closed, targets?, note }
//   POST /:id/restore            admin     { retracted?: boolean, note }  put material back (counter window or withdrawal)

import { Router } from 'express';
import express from 'express';
import nodeCrypto from 'node:crypto';
import { fsCreateOnce, fsGet, fsMerge, fsQueryStrict, gcsMeta, gcsRevokeToken, gcsSetToken, storagePathFromUrl } from '../services/safety/safetyServerIo';
import { sendViaResend } from '../services/notify/emailNotifyServer';
import { renderEmail } from '../services/notify/emailNotifyCore';
import { recordEnforcementAction } from './enforcement';
import {
  COPYRIGHT_AGENT_EMAIL, TARGET_COLLECTION, REPEAT_INFRINGER_RULE, REPEAT_INFRINGER_TEXT, STRIKES_TO_CLOSE,
  parseNotice, missingElements, targetsFromUrls, parseTargets, addStrike, clearStrike, activeStrikes, isRepeatInfringer, restoreWindow,
  type NoticeTarget, type Strike,
} from '../services/legal/copyrightCore';

const POLICY_URL = 'https://plajah.com/policies/dmca.html';
const newId = (p: string) => `${p}_${Date.now().toString(36)}${nodeCrypto.randomBytes(5).toString('hex')}`;
const holdId = (t: NoticeTarget) => `${t.kind}_${t.id}`;

// 6 notices an hour per network address: enough for a rights holder, not for a flood.
const recent = new Map<string, number[]>();
function allow(ip: string, now: number): boolean {
  const hits = (recent.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 6) return false;
  hits.push(now); recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return true;
}

async function mail(to: string, subject: string, heading: string, lines: string[], replyTo?: string): Promise<void> {
  if (!to) return;
  const m = renderEmail({ subject, heading, lines, ctaLabel: 'Plajah copyright policy', ctaUrl: POLICY_URL, footerNote: `Plajah copyright agent · ${COPYRIGHT_AGENT_EMAIL}` });
  try { await sendViaResend(to, m, undefined, undefined, replyTo); } catch (e) { console.warn('[copyright] mail failed', e); }
}

async function notifyUser(uid: string, title: string, message: string): Promise<void> {
  await fsCreateOnce('notifications', newId('n'), {
    userId: uid, senderId: 'plajah-copyright', senderName: 'Plajah Copyright', senderPhoto: '', type: 'SYSTEM',
    title: title.slice(0, 190), message: message.slice(0, 990), targetId: 'ACCOUNT_STANDING', isRead: false, timestamp: Date.now(),
  });
}

/** Every download URL on our own storage anywhere in the document (audio, video, cover, stems). */
function storagePaths(d: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 6 || out.size >= 300) return out;
  if (typeof d === 'string') { const p = d.startsWith('http') ? storagePathFromUrl(d) : null; if (p) out.add(p); }
  else if (Array.isArray(d)) for (const x of d) storagePaths(x, out, depth + 1);
  else if (d && typeof d === 'object') for (const x of Object.values(d)) storagePaths(x, out, depth + 1);
  return out;
}

const ownerOf = (d: Record<string, any>) => String(d.ownerId || d.authorId || d.artistId || d.uid || '');

/** Disable one item: hide it, make it private, revoke its download tokens. Returns the uploader, or null if not found. */
async function disable(t: NoticeTarget, noticeId: string, by: string): Promise<string | null> {
  const path = `${TARGET_COLLECTION[t.kind]}/${t.id}`;
  const d = await fsGet(path);
  if (!d) return null;
  const existing = await fsGet(`copyrightHolds/${holdId(t)}`);
  if (existing && existing.active) return ownerOf(d) || null;
  const tokens: Record<string, string> = {};
  for (const sp of storagePaths(d)) {
    const tok = (await gcsMeta(sp))?.metadata?.firebaseStorageDownloadTokens;
    if (tok && await gcsRevokeToken(sp)) tokens[sp] = tok;
  }
  const now = Date.now();
  const prior = { moderationStatus: d.moderationStatus ?? null, isPrivate: d.isPrivate ?? null, isPublic: d.isPublic ?? null };
  await fsMerge(path, { moderationStatus: 'removed', isPrivate: true, ...(t.kind === 'album' ? { isPublic: false } : {}), copyrightHold: { noticeId, at: now } });
  // Hold docs are keyed by item, so the token map is a list of {path, token} (paths contain slashes).
  await fsMerge(`copyrightHolds/${holdId(t)}`, {
    active: true, target: t, path, noticeId, uid: ownerOf(d), at: now, by, prior,
    tokens: Object.entries(tokens).map(([p, token]) => ({ path: p, token })),
  });
  return ownerOf(d) || null;
}

async function enable(t: NoticeTarget, by: string): Promise<boolean> {
  const h = await fsGet(`copyrightHolds/${holdId(t)}`);
  if (!h || !h.active) return false;
  for (const x of Array.isArray(h.tokens) ? h.tokens : []) if (x?.path && x?.token) await gcsSetToken(x.path, x.token);
  const p = h.prior || {};
  await fsMerge(h.path, {
    moderationStatus: p.moderationStatus ?? null, isPrivate: p.isPrivate ?? false,
    ...(t.kind === 'album' ? { isPublic: p.isPublic ?? true } : {}), copyrightHold: null,
  });
  await fsMerge(`copyrightHolds/${holdId(t)}`, { active: false, restoredAt: Date.now(), restoredBy: by });
  return true;
}

async function readStrikes(uid: string): Promise<Strike[]> {
  const d = await fsGet(`copyrightStrikes/${uid}`);
  return Array.isArray(d?.strikes) ? d!.strikes : [];
}

function timeline(n: Record<string, any>, kind: string, by: string, note?: string) {
  return [...(Array.isArray(n.timeline) ? n.timeline : []), { at: Date.now(), kind, by, ...(note ? { note } : {}) }];
}

export function createCopyrightRouter(deps: { authMiddleware: any; requireVerifiedAdmin: any }): Router {
  const r = Router();
  const json = express.json({ limit: '64kb' });

  const intake = async (req: any, res: any, uid: string | null) => {
    const now = Date.now();
    const ip = String(req.ip || req.socket?.remoteAddress || '');
    if (!allow(ip, now)) return res.status(429).json({ error: `Too many notices from this connection. Email ${COPYRIGHT_AGENT_EMAIL} instead.` });
    const n = parseNotice(req.body);
    if (uid == null && n.kind === 'counter') return res.status(401).json({ error: 'Sign in to the account that posted the material to send a counter-notice.' });
    const missing = missingElements(n);
    if (missing.length) return res.status(400).json({ error: 'The notice is missing required information.', missing });

    let targets = targetsFromUrls(n.urls);
    let answers: string | null = null;
    if (n.kind === 'counter') {
      // Tie the counter to the hold(s) on this account's material.
      const holds = (await Promise.all(targets.map((t) => fsGet(`copyrightHolds/${holdId(t)}`)))).filter((h) => h?.active);
      let noticeId = n.noticeId || holds[0]?.noticeId || null;
      if (noticeId && !holds.length) {
        const tk = await fsGet(`copyrightNotices/${noticeId}`);
        const tkTargets: NoticeTarget[] = Array.isArray(tk?.removedTargets) ? tk!.removedTargets : [];
        for (const t of tkTargets) { const h = await fsGet(`copyrightHolds/${holdId(t)}`); if (h?.active) holds.push(h); }
      }
      const mine = holds.filter((h) => h!.uid === uid);
      if (!mine.length) return res.status(403).json({ error: `We couldn't find removed material from your account at those links. Include the notice number from your removal message, or email ${COPYRIGHT_AGENT_EMAIL}.` });
      noticeId = mine[0]!.noticeId;
      targets = mine.map((h) => h!.target);
      answers = noticeId;
    }

    const id = newId(n.kind === 'counter' ? 'cn' : n.kind === 'dispute' ? 'ld' : 'tk');
    const rec = { ...n, id, uid, targets, answers, status: 'received', at: now, timeline: [{ at: now, kind: 'received', by: uid || 'public' }] };
    const c = await fsCreateOnce('copyrightNotices', id, rec);
    if (c === 'error') return res.status(503).json({ error: `Couldn't record the notice. Email ${COPYRIGHT_AGENT_EMAIL} instead.` });
    void fsCreateOnce('copyrightNoticesPrivate', id, { ip, ua: String(req.headers?.['user-agent'] || '').slice(0, 240), at: now });

    if (answers) {
      const tk = await fsGet(`copyrightNotices/${answers}`);
      if (tk) {
        const w = restoreWindow(now);
        await fsMerge(`copyrightNotices/${answers}`, { status: 'counter_received', counterId: id, counterAt: now, restoreEarliest: w.earliest, restoreLatest: w.latest, timeline: timeline(tk, 'counter_received', uid || '') });
        // § 512(g)(2)(B): the sender of the original notice gets a copy of the counter-notice.
        await mail(String(tk.email || ''), `Counter-notice for your copyright notice ${answers}`, 'A counter-notice was filed', [
          `The account that posted the material you reported has filed a counter-notice saying it was removed by mistake or misidentification.`,
          `From: ${n.name}, ${n.address}, ${n.country} · ${n.email} · ${n.phone}`,
          `Their statement: ${n.description}`,
          `They consent to the jurisdiction of the court and will accept service of process from you.`,
          `We will restore the material between ${new Date(w.earliest).toDateString()} and ${new Date(w.latest).toDateString()} unless you tell us, at ${COPYRIGHT_AGENT_EMAIL}, that you have filed a court action seeking to restrain the infringement.`,
        ], COPYRIGHT_AGENT_EMAIL);
      }
    }

    const label = n.kind === 'counter' ? 'Counter-notice' : n.kind === 'dispute' ? 'Licensing dispute' : 'Takedown notice';
    await mail(COPYRIGHT_AGENT_EMAIL, `${label} ${id}`, `${label} received`, [
      `${n.name}${n.org ? ` (${n.org})` : ''} · ${n.email} · ${n.phone}`,
      `Links: ${n.urls.join(' ') || '—'}`,
      `Matched items: ${targets.map((t) => `${t.kind}/${t.id}`).join(', ') || 'none — pick them in the queue'}`,
      n.description,
    ], n.email);
    await mail(n.email, `We received your ${label.toLowerCase()} (${id})`, `${label} received`, [
      `Reference: ${id}.`,
      n.kind === 'takedown' ? 'We review complete notices promptly and remove or disable access to material that a valid notice identifies. We will email you the outcome.'
        : n.kind === 'counter' ? 'We sent a copy to the person who filed the original notice. Unless they tell us they have gone to court, the material is restored 10 to 14 business days from today.'
        : 'This is not a DMCA notice. We will look into it and reply by email.',
    ], COPYRIGHT_AGENT_EMAIL);
    res.json({ ok: true, id, matched: targets.length });
  };

  r.post('/notice', json, (req, res) => intake(req, res, null));
  r.post('/counter', json, deps.authMiddleware, (req: any, res) => intake(req, res, req.uid));

  r.get('/mine', deps.authMiddleware, async (req: any, res) => {
    try {
      const holds = await fsQueryStrict('copyrightHolds', { where: [{ field: 'uid', op: 'EQUAL', value: req.uid }], limit: 50 });
      const strikes = activeStrikes(await readStrikes(req.uid), Date.now());
      res.json({
        holds: holds.filter((h) => h.data.active).map((h) => ({ target: h.data.target, noticeId: h.data.noticeId, at: h.data.at })),
        strikes: strikes.map((s) => ({ noticeId: s.noticeId, at: s.at })), strikesToClose: STRIKES_TO_CLOSE,
      });
    } catch { res.status(503).json({ error: 'Could not load copyright holds' }); }
  });

  r.get('/queue', deps.authMiddleware, deps.requireVerifiedAdmin, async (_req, res) => {
    try {
      const rows = await fsQueryStrict('copyrightNotices', { orderBy: { field: 'at', direction: 'DESCENDING' }, limit: 100 });
      res.json({ notices: rows.map((x) => x.data) });
    } catch { res.status(503).json({ error: 'Could not load the queue' }); }
  });

  r.post('/:id/decide', json, deps.authMiddleware, deps.requireVerifiedAdmin, async (req: any, res) => {
    const id = String(req.params.id);
    const n = await fsGet(`copyrightNotices/${id}`);
    if (!n) return res.status(404).json({ error: 'No such notice' });
    const outcome = String(req.body?.outcome || '');
    const note = String(req.body?.note || '').slice(0, 1000);
    if (outcome === 'needs_info' || outcome === 'reject' || outcome === 'closed') {
      if (outcome !== 'closed' && !note) return res.status(400).json({ error: 'Say what is missing or why — the sender is told.' });
      const status = outcome === 'needs_info' ? 'needs_info' : outcome === 'reject' ? 'rejected' : 'closed';
      await fsMerge(`copyrightNotices/${id}`, { status, decidedBy: req.uid, decidedAt: Date.now(), timeline: timeline(n, status, req.uid, note) });
      if (outcome !== 'closed') await mail(String(n.email), `Your copyright notice ${id}`, outcome === 'needs_info' ? 'We need a little more' : 'We could not act on your notice', [note], COPYRIGHT_AGENT_EMAIL);
      return res.json({ ok: true, status });
    }
    if (outcome !== 'remove') return res.status(400).json({ error: 'outcome must be remove | reject | needs_info | closed' });
    if (n.kind !== 'takedown') return res.status(400).json({ error: 'Only a takedown notice can remove material.' });
    const targets = [...parseTargets(req.body?.targets), ...parseTargets(n.targets)]
      .filter((t, i, a) => a.findIndex((x) => x.kind === t.kind && x.id === t.id) === i);
    if (!targets.length) return res.status(400).json({ error: 'Pick the items to remove (targets: [{kind, id}]).' });

    const removed: NoticeTarget[] = [];
    const uploaders = new Map<string, NoticeTarget[]>();
    for (const t of targets) {
      const uid = await disable(t, id, req.uid);
      if (uid === null) continue;
      removed.push(t);
      if (uid) uploaders.set(uid, [...(uploaders.get(uid) || []), t]);
    }
    if (!removed.length) return res.status(404).json({ error: 'None of those items exist.' });
    const now = Date.now();
    await fsMerge(`copyrightNotices/${id}`, { status: 'removed', removedTargets: removed, decidedBy: req.uid, decidedAt: now, timeline: timeline(n, 'removed', req.uid, note) });

    const closed: string[] = [];
    for (const [uid, items] of uploaders) {
      const strikes = addStrike(await readStrikes(uid), { noticeId: id, at: now, status: 'active', target: items[0] });
      await fsMerge(`copyrightStrikes/${uid}`, { strikes, updatedAt: now });
      const count = activeStrikes(strikes, now).length;
      await notifyUser(uid, 'Material was removed after a copyright notice',
        `We disabled ${items.length === 1 ? 'one item' : `${items.length} items`} on your account after a copyright notice (reference ${id}). This is strike ${count} of ${STRIKES_TO_CLOSE} in 12 months. If it was removed by mistake or misidentification, you can file a counter-notice from Help › Copyright with that reference.`);
      if (isRepeatInfringer(strikes, now)) {
        const a = await recordEnforcementAction({
          uid, level: 'RESTRICTED_MEDIA', rule: REPEAT_INFRINGER_RULE, ruleText: REPEAT_INFRINGER_TEXT,
          contentRef: { kind: items[0].kind, id: items[0].id }, durationHours: null, createdBy: req.uid, note: `copyright notice ${id}`,
        });
        if (a) closed.push(uid);
      }
    }
    await mail(String(n.email), `Your copyright notice ${id}`, 'Material removed', [
      `We removed or disabled access to ${removed.length === 1 ? 'the item' : `${removed.length} items`} your notice identified.`,
      'If the account that posted it files a valid counter-notice, we will send you a copy and restore the material 10 to 14 business days later unless you tell us you have filed a court action.',
    ], COPYRIGHT_AGENT_EMAIL);
    res.json({ ok: true, removed, repeatInfringers: closed });
  });

  r.post('/:id/restore', json, deps.authMiddleware, deps.requireVerifiedAdmin, async (req: any, res) => {
    const id = String(req.params.id);
    const n = await fsGet(`copyrightNotices/${id}`);
    if (!n) return res.status(404).json({ error: 'No such notice' });
    const retracted = req.body?.retracted === true;
    const now = Date.now();
    if (!retracted) {
      if (n.status !== 'counter_received') return res.status(409).json({ error: 'Restoring needs a counter-notice on file, or retracted:true if the sender withdrew.' });
      if (now < Number(n.restoreEarliest || Infinity)) return res.status(409).json({ error: `Too early: the law holds the material down until ${new Date(n.restoreEarliest).toDateString()}.` });
    }
    const targets: NoticeTarget[] = Array.isArray(n.removedTargets) ? n.removedTargets : [];
    const uids = new Set<string>();
    for (const t of targets) {
      const h = await fsGet(`copyrightHolds/${holdId(t)}`);
      if (await enable(t, req.uid) && h?.uid) uids.add(String(h.uid));
    }
    for (const uid of uids) {
      await fsMerge(`copyrightStrikes/${uid}`, { strikes: clearStrike(await readStrikes(uid), id, retracted ? 'retracted' : 'restored'), updatedAt: now });
      await notifyUser(uid, 'Your material is back', `The material removed under copyright notice ${id} is restored and the strike is cleared.`);
    }
    const status = retracted ? 'retracted' : 'restored';
    await fsMerge(`copyrightNotices/${id}`, { status, restoredAt: now, timeline: timeline(n, status, req.uid, String(req.body?.note || '').slice(0, 1000)) });
    res.json({ ok: true, status, restored: targets.length });
  });

  return r;
}
