// socialEngage — the "two-way" half of the Marketing Kit: a comments inbox (read + reply on Facebook Page posts and
// Instagram media) and a team approval flow for business/org accounts. Adds routes to the same /api/social router
// as routes/socialConnect.ts (imported for side effects from server.ts) and reuses its scope + access model.
//
//   GET  /api/social/inbox                       — recent comments across the scope's Facebook + Instagram accounts
//   POST /api/social/inbox/reply                 — { accountId, commentId, text }
//   GET  /api/social/approvals/settings          — { requireApproval, canManage }
//   PUT  /api/social/approvals/settings          — { requireApproval } (owner/admin)
//   POST /api/social/approvals/submit            — staff submit a post for review (when the org requires approval)
//   GET  /api/social/approvals                   — pending + recent decisions (managers: all; staff: their own)
//   POST /api/social/approvals/:id/decide        — { decision: 'approve'|'reject', note? } (owner/admin)
//
// Approval ENFORCEMENT lives in socialConnect.publishToSocialAccounts (server-side, at publish time): a post by a
// non-manager in an approval-required business only publishes if an owner/admin stamped `approvedBy` on it. The
// queue itself is written by the browser, so the gate has to be where the post actually goes out.

import nodeCrypto from 'node:crypto';
import { fsGet, fsSet, fsPatch, fsList, fsCreate } from '../services/firebaseAdminRest';
import {
  socialConnectRouter as router, accessFor, can, freshCreds, audit, callerUid, reqScope, ACCOUNTS, ACCOUNT, isSafeId,
  requiresApproval, SETTINGS, type Scope,
} from './socialConnect';

const GRAPH = 'https://graph.facebook.com/v21.0';
const APPROVALS = (s: Scope) => `orgSocialApprovals/${s.id}/posts`;

async function graph(url: string, init?: RequestInit): Promise<{ ok: boolean; json: any }> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

const permNote = (j: any) => {
  const code = Number(j?.error?.code);
  const perm = code === 10 || (code >= 200 && code <= 299) || code === 190;
  return { status: perm ? 'needs_permission' : 'error', note: String(j?.error?.message || 'Request failed').slice(0, 180) };
};

async function notify(userId: string, title: string, message: string) {
  try {
    await fsCreate('notifications', { userId, senderId: 'plajah-studio', senderName: 'Marketing', senderPhoto: '', type: 'SYSTEM', title, message, targetId: 'PLAJAH_STUDIO', isRead: false, timestamp: Date.now() });
  } catch { /* best effort */ }
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;
  accountId: string;
  network: 'facebook' | 'instagram';
  handle: string;
  postId: string;
  postText: string;
  postUrl?: string;
  author: string;
  text: string;
  createdAt: number;
  likes: number;
  /** Replies already on the thread (so staff don't answer twice). */
  replies: { author: string; text: string; createdAt: number }[];
}

router.get('/inbox', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    // Comments can be sensitive and replying speaks as the brand → publish-level access, not just view.
    if (!can(await accessFor(uid, scope), 'post')) return res.status(403).json({ error: 'You do not have access to this inbox.' });

    const rows = await fsList(ACCOUNTS(scope), { maxDocs: 50 });
    const items: InboxItem[] = [];
    const accounts: { accountId: string; network: string; handle: string; status: string; note?: string }[] = [];

    await Promise.all(rows.filter(r => r.data.network === 'facebook' || r.data.network === 'instagram').map(async ({ id, data }) => {
      const network = data.network as 'facebook' | 'instagram';
      const handle = String(data.handle || '');
      try {
        const creds = await freshCreds(scope, id, data);
        const t = encodeURIComponent(creds.accessToken);
        let r: { ok: boolean; json: any };
        if (network === 'facebook') {
          r = await graph(`${GRAPH}/${creds.pageId}/posts?fields=id,message,permalink_url,comments.limit(8).order(reverse_chronological){id,message,from,created_time,like_count,comments.limit(3){message,from,created_time}}&limit=8&access_token=${t}`);
        } else {
          r = await graph(`${GRAPH}/${creds.igUserId}/media?fields=id,caption,permalink,comments.limit(8){id,text,username,timestamp,like_count,replies{text,username,timestamp}}&limit=8&access_token=${t}`);
        }
        if (!r.ok) { const n = permNote(r.json); accounts.push({ accountId: id, network, handle, ...n }); return; }
        accounts.push({ accountId: id, network, handle, status: 'ok' });
        for (const post of r.json.data || []) {
          for (const c of post.comments?.data || []) {
            const replyList = network === 'facebook' ? (c.comments?.data || []) : (c.replies?.data || []);
            items.push({
              id: c.id, accountId: id, network, handle,
              postId: post.id, postText: String(post.message ?? post.caption ?? '').replace(/\s+/g, ' ').slice(0, 120), postUrl: post.permalink_url ?? post.permalink,
              author: String(c.from?.name ?? c.username ?? 'Someone'),
              text: String(c.message ?? c.text ?? ''),
              createdAt: Date.parse(c.created_time ?? c.timestamp) || 0,
              likes: Number(c.like_count) || 0,
              replies: replyList.map((x: any) => ({ author: String(x.from?.name ?? x.username ?? ''), text: String(x.message ?? x.text ?? ''), createdAt: Date.parse(x.created_time ?? x.timestamp) || 0 })),
            });
          }
        }
      } catch (e: any) {
        accounts.push({ accountId: id, network, handle, status: 'error', note: String(e?.message || e).slice(0, 180) });
      }
    }));

    items.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ items: items.slice(0, 60), accounts });
  } catch (e) {
    console.error('[social] inbox failed:', e);
    res.status(500).json({ error: 'Could not load the inbox.' });
  }
});

router.post('/inbox/reply', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    if (!can(await accessFor(uid, scope), 'post')) return res.status(403).json({ error: 'You do not have access to reply for this identity.' });
    const { accountId, commentId, text } = req.body || {};
    if (!isSafeId(accountId) || typeof commentId !== 'string' || !/^[\w-]{3,80}$/.test(commentId)) return res.status(400).json({ error: 'accountId and commentId required.' });
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Reply text required.' });
    // Same approval gate as publishing: a reply speaks as the brand.
    if (scope.kind !== 'CREATOR' && (await accessFor(uid, scope)) !== 'manage' && (await requiresApproval(scope))) {
      return res.status(403).json({ error: 'This business requires approval — ask an owner or admin to reply.' });
    }

    const doc = await fsGet(ACCOUNT(scope, accountId));
    if (!doc?.creds) return res.status(404).json({ error: 'Account not connected.' });
    const creds = await freshCreds(scope, accountId, doc);
    const body = new URLSearchParams({ message: text.trim().slice(0, 2000), access_token: creds.accessToken }).toString();
    const edge = doc.network === 'instagram' ? 'replies' : 'comments';
    const r = await graph(`${GRAPH}/${commentId}/${edge}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) {
      const n = permNote(r.json);
      return res.status(n.status === 'needs_permission' ? 403 : 502).json({ error: n.status === 'needs_permission' ? 'Replying needs the comment-management permission — reconnect this account to grant it.' : n.note, needsPermission: n.status === 'needs_permission' });
    }
    await audit(scope, uid, 'SOCIAL_REPLIED', String(doc.handle || accountId), { commentId });
    res.json({ ok: true, id: r.json.id });
  } catch (e) {
    console.error('[social] reply failed:', e);
    res.status(500).json({ error: 'Could not send the reply.' });
  }
});

// ─── Approvals ────────────────────────────────────────────────────────────────

router.get('/approvals/settings', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    const access = await accessFor(uid, scope);
    if (!can(access, 'view')) return res.status(403).json({ error: 'No access.' });
    res.json({ requireApproval: scope.kind === 'CREATOR' ? false : await requiresApproval(scope), canManage: can(access, 'manage') });
  } catch { res.status(500).json({ error: 'Could not load settings.' }); }
});

router.put('/approvals/settings', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    if (scope.kind === 'CREATOR') return res.status(400).json({ error: 'Approvals apply to business and org accounts.' });
    if (!can(await accessFor(uid, scope), 'manage')) return res.status(403).json({ error: 'Only the owner or an admin can change this.' });
    const requireApproval = req.body?.requireApproval === true;
    await fsSet(SETTINGS(scope), { requireApproval, updatedBy: uid, updatedAt: Date.now() });
    await audit(scope, uid, 'SOCIAL_APPROVAL_SETTING', requireApproval ? 'on' : 'off');
    res.json({ requireApproval });
  } catch { res.status(500).json({ error: 'Could not save the setting.' }); }
});

const pickPost = (p: any, scope: Scope, uid: string) => {
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const out: Record<string, unknown> = {
    text: String(p?.text ?? '').slice(0, 5000),
    mediaUrls: arr(p?.mediaUrls, 10).filter(u => /^https:\/\//.test(u)),
    targetAccountIds: arr(p?.targetAccountIds, 25).filter(isSafeId),
    alsoPostToPlajah: p?.alsoPostToPlajah === true,
    shareToX: p?.shareToX === true,
    ownerId: scope.id, ownerKind: scope.kind, authorOrgId: scope.id,
    submittedBy: uid,
  };
  const link = str(p?.linkUri, 500); if (link && /^https?:\/\//.test(link)) out.linkUri = link;
  const lt = str(p?.linkTitle, 200); if (lt) out.linkTitle = lt;
  const ld = str(p?.linkDescription, 500); if (ld) out.linkDescription = ld;
  const tz = str(p?.timezone, 60); if (tz) out.timezone = tz;
  if (typeof p?.scheduledAt === 'number' && isFinite(p.scheduledAt)) out.scheduledAt = p.scheduledAt;
  return out;
};

router.post('/approvals/submit', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    if (scope.kind === 'CREATOR') return res.status(400).json({ error: 'Approvals apply to business and org accounts.' });
    if (!can(await accessFor(uid, scope), 'post')) return res.status(403).json({ error: 'You cannot submit posts for this identity.' });
    const post = pickPost(req.body?.post, scope, uid);
    if (!String(post.text).trim() && !(post.mediaUrls as string[]).length) return res.status(400).json({ error: 'Add some text or media first.' });
    const id = nodeCrypto.randomUUID();
    const now = Date.now();
    await fsSet(`${APPROVALS(scope)}/${id}`, { ...post, id, status: 'PENDING', submittedAt: now });
    const org = await fsGet(`organizations/${scope.id}`);
    const approvers = new Set<string>([org?.creatorId, ...(Array.isArray(org?.admins) ? org.admins : [])].filter((x): x is string => typeof x === 'string' && x !== uid));
    await Promise.all([...approvers].map(a => notify(a, 'Post waiting for approval', `${String(post.text).slice(0, 100) || 'A media post'} — review it in Marketing.`)));
    await audit(scope, uid, 'SOCIAL_POST_SUBMITTED', id);
    res.json({ id, status: 'PENDING' });
  } catch (e) {
    console.error('[social] submit failed:', e);
    res.status(500).json({ error: 'Could not submit for approval.' });
  }
});

router.get('/approvals', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    if (scope.kind === 'CREATOR') return res.json({ approvals: [], canManage: false });
    const access = await accessFor(uid, scope);
    if (!can(access, 'post')) return res.status(403).json({ error: 'No access.' });
    const manager = can(access, 'manage');
    const rows = (await fsList(APPROVALS(scope), { maxDocs: 200 }))
      .map(r => r.data)
      .filter(d => manager || d.submittedBy === uid)
      .sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0))
      .slice(0, 50);
    res.json({ approvals: rows, canManage: manager });
  } catch { res.status(500).json({ error: 'Could not load approvals.' }); }
});

router.post('/approvals/:id/decide', async (req, res) => {
  try {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const scope = reqScope(req, uid);
    if (scope.kind === 'CREATOR') return res.status(400).json({ error: 'Approvals apply to business and org accounts.' });
    if (!can(await accessFor(uid, scope), 'manage')) return res.status(403).json({ error: 'Only the owner or an admin can decide.' });
    if (!isSafeId(req.params.id)) return res.status(400).json({ error: 'Unknown approval.' });
    const doc = await fsGet(`${APPROVALS(scope)}/${req.params.id}`);
    if (!doc || doc.status !== 'PENDING') return res.status(404).json({ error: 'That post is no longer pending.' });
    const decision = req.body?.decision;
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 300) : '';
    const submitter = String(doc.submittedBy);
    const now = Date.now();

    if (decision === 'reject') {
      await fsPatch(`${APPROVALS(scope)}/${doc.id}`, { status: 'REJECTED', decidedBy: uid, decidedAt: now, note });
      await notify(submitter, 'Post not approved', note || 'An admin sent your post back.');
      await audit(scope, uid, 'SOCIAL_POST_REJECTED', String(doc.id));
      return res.json({ status: 'REJECTED' });
    }
    if (decision !== 'approve') return res.status(400).json({ error: 'decision must be approve or reject.' });

    // Approve = drop it into the SUBMITTER's normal queue, stamped approvedBy, so the existing cron publishes it
    // (and the publish-time gate lets it through). No time set (or already past) → send now.
    const scheduledAt = typeof doc.scheduledAt === 'number' && doc.scheduledAt > now ? doc.scheduledAt : now;
    const { submittedBy: _s, submittedAt: _a, status: _st, ...post } = doc;
    await fsSet(`users/${submitter}/scheduledPosts/${doc.id}`, {
      ...post, scheduledAt, status: 'SCHEDULED', approvedBy: uid, createdAt: now, updatedAt: now,
    });
    await fsPatch(`${APPROVALS(scope)}/${doc.id}`, { status: 'APPROVED', decidedBy: uid, decidedAt: now, note });
    await notify(submitter, 'Post approved', 'Your post was approved and is queued to publish.');
    await audit(scope, uid, 'SOCIAL_POST_APPROVED', String(doc.id));
    res.json({ status: 'APPROVED', scheduledAt });
  } catch (e) {
    console.error('[social] decide failed:', e);
    res.status(500).json({ error: 'Could not record the decision.' });
  }
});
