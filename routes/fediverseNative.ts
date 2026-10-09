// fediverseNative — publish a NATIVE Plajah post out to Bluesky / Mastodon / Threads.
// Mounted in server.ts at POST /api/fediverse/crosspost-native.
//
// The server reads the stored post itself (never trusting the browser's copy of it), runs the same planner the composer
// uses for its live "what Bluesky sees" preview (services/fediverse/blueskyVersion.ts), publishes, and writes the
// resulting network post URIs back onto the Plajah post — so the feed can show where it went and, later, pull
// replies and likes back in.

import { Router } from 'express';
import { verifyIdToken, fsGet, fsPatch } from '../services/firebaseAdminRest';
import { decentralizedAuth } from '../services/fediverse/auth';
import { blueskyadapter } from '../services/fediverse/bluesky';
import { mastodonAdapter } from '../services/fediverse/mastodon';
import { threadsAdapter } from '../services/fediverse/threads';
import { planBlueskyVersion, planPlainVersion, type NativePostLike } from '../services/fediverse/blueskyVersion';
import type { FediverseAccount } from '../services/fediverse/types';

export const fediverseNativeRouter = Router();

const SAFE_ID = /^[A-Za-z0-9_-]{4,128}$/;
const appBase = () => (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
export const postShareUrl = (postId: string) => `${appBase()}/share?type=feed&id=${encodeURIComponent(postId)}`;

export interface CrosspostResult {
  accountId: string;
  protocol: string;
  handle: string;
  ok: boolean;
  url?: string;
  error?: string;
}

/** The stored post → the slice the planner needs. */
function toPlanInput(post: Record<string, any>): NativePostLike {
  return {
    text: String(post.text ?? ''),
    authorName: post.authorName,
    media: Array.isArray(post.media) ? post.media : [],
    poll: post.poll, dataViz: post.dataViz, albumEmbed: post.albumEmbed,
    assetEmbed: post.assetEmbed ?? null,
    sanctuaryGate: post.sanctuaryGate, exclusive: post.exclusive,
    isPublic: post.isPublic, authorIsPrivate: post.authorIsPrivate, orgAudience: post.orgAudience,
    contentLabels: post.contentLabels,
    postMode: post.postMode, threadChunks: post.threadChunks,
    quotedPost: post.quotedPost ?? null,
  };
}

export async function crosspostNativePost(
  uid: string, firebaseToken: string, postId: string, opts: { accountIds?: string[]; override?: string } = {},
): Promise<{ blocked?: string; results: CrosspostResult[] }> {
  const post = await fsGet(`posts/${postId}`);
  if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
  if (post.authorId !== uid) throw Object.assign(new Error('You can only share your own posts'), { status: 403 });

  const postUrl = postShareUrl(postId);
  const input = toPlanInput(post);
  const plan = planBlueskyVersion(input, { postUrl, override: opts.override });
  if (plan.blocked) return { blocked: plan.blocked, results: [] };

  const all = await decentralizedAuth.loadAccounts(uid, firebaseToken);
  const wanted = opts.accountIds?.length ? new Set(opts.accountIds) : null;
  const targets: FediverseAccount[] = all.filter(a => a.isActive && (wanted ? wanted.has(a.id) : a.protocol === 'bluesky'));
  if (!targets.length) return { results: [] };

  const results: CrosspostResult[] = await Promise.all(targets.map(async (acct): Promise<CrosspostResult> => {
    const base = { accountId: acct.id, protocol: acct.protocol, handle: acct.handle };
    try {
      if (acct.protocol === 'bluesky') {
        const p = await blueskyadapter.createPost(acct.credentials, plan.text, {
          images: plan.images.length ? plan.images : undefined,
          link: !plan.images.length && plan.card ? { uri: plan.card.uri, title: plan.card.title, description: plan.card.description, thumbUrl: plan.card.thumbUrl } : undefined,
          labels: plan.labels.length ? plan.labels : undefined,
        });
        return { ...base, ok: true, url: p.url, ...({ uri: p.uri, cid: p.id } as object) };
      }
      const plain = planPlainVersion(input, { postUrl, limit: 500, override: opts.override });
      if (plain.blocked) return { ...base, ok: false, error: plain.blocked };
      if (acct.protocol === 'mastodon') {
        const p = await mastodonAdapter.createPost(acct.credentials, plain.text, { visibility: 'public', images: plan.images.length ? plan.images : undefined });
        return { ...base, ok: true, url: p.url };
      }
      const p = await threadsAdapter.createPost(acct.credentials, plain.text);
      return { ...base, ok: true, url: p.url };
    } catch (e: any) {
      return { ...base, ok: false, error: String(e?.message || e).slice(0, 240) };
    }
  }));

  // Remember where it went (keeps earlier entries so a re-share doesn't erase history).
  const prior: any[] = Array.isArray(post.fediverse?.posts) ? post.fediverse.posts : [];
  const added = results.filter(r => r.ok).map((r: any) => ({
    protocol: r.protocol, accountId: r.accountId, handle: r.handle, url: r.url, ...(r.uri ? { uri: r.uri } : {}), ...(r.cid ? { cid: r.cid } : {}), at: Date.now(),
  }));
  if (added.length) await fsPatch(`posts/${postId}`, { fediverse: { posts: [...prior, ...added] } });
  return { results };
}

fediverseNativeRouter.post('/', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    const uid = auth?.startsWith('Bearer ') ? await verifyIdToken(auth.slice(7)) : null;
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const { postId, accountIds, override } = req.body ?? {};
    if (typeof postId !== 'string' || !SAFE_ID.test(postId)) return res.status(400).json({ error: 'postId required' });
    const ids = Array.isArray(accountIds) ? accountIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 10) : undefined;
    const ov = typeof override === 'string' && override.trim() ? override.slice(0, 2000) : undefined;
    res.json(await crosspostNativePost(uid, auth!.slice(7), postId, { accountIds: ids, override: ov }));
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    if (status === 500) console.error('[fediverse] crosspost-native failed:', e);
    res.status(status).json({ error: status === 500 ? 'Could not share this post.' : e.message });
  }
});
