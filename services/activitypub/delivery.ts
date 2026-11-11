// Outbound delivery: sign each activity with the actor's key and POST it to every follower inbox (shared inboxes
// deduped), skipping blocked domains. Failures are queued in ap_deliveries with exponential backoff; call
// retryDueDeliveries() from a cron/interval to drain them.
//
// Exports the lead wires in:
//   deliverPostToFollowers(postId)  — call after a post is published (no-op when the post/author can't federate)
//   deliverDelete(postId)           — call after a post is deleted or made non-public (no-op if it never federated)
//   retryDueDeliveries()            — call every few minutes

import { apUrls, parseActorKey, actorKeyFor } from './config';
import { signRequest } from './httpSignature';
import { buildNote, buildCreate, buildDelete, buildAccept } from './jsonld';
import { judgePost, postActorRef, isDomainBlocked } from './policy';
import { resolveActorKey, signingKeyFor } from './actors';
import { checkFederationUrl } from './remote';
import type { FollowerRecord } from './store';
import { defaultDeps, type ApDeps } from './deps';

export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
export const PARKED = Number.MAX_SAFE_INTEGER;
const MAX_FOLLOWERS_PER_FANOUT = 5000;
const CONCURRENCY = 8;

/** When to try again after `attempts` failures; null = give up. */
export function nextAttemptAt(attempts: number, now: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return now + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
}

/** What a remote status means for us. */
export function classifyStatus(status: number): 'ok' | 'retry' | 'drop' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return 'retry';
  return 'drop'; // 4xx: bad signature on their side, gone, forbidden — retrying won't help
}

/** Followers → unique inbox URLs (shared inbox preferred), blocked or unsafe hosts removed. */
export function inboxTargets(followers: FollowerRecord[], blocked: Set<string>): string[] {
  const out = new Set<string>();
  for (const f of followers) {
    const target = f.sharedInbox || f.inbox;
    const c = target ? checkFederationUrl(target) : null;
    if (!c || !c.ok) continue;
    if (isDomainBlocked(c.url.hostname, blocked)) continue;
    out.add(c.url.toString());
  }
  return [...out];
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function postSigned(deps: ApDeps, actorKey: string, inbox: string, body: string): Promise<{ status: number; body: string }> {
  const key = await signingKeyFor(deps, actorKey);
  if (!key) return { status: 0, body: 'no-signing-key' };
  const headers = signRequest({ method: 'POST', url: inbox, body, keyId: key.keyId, privateKeyPem: key.privateKeyPem, now: new Date(deps.now()) });
  return deps.http.post(inbox, body, { ...headers, accept: 'application/activity+json' });
}

export interface FanoutResult { sent: number; queued: number; dropped: number; skipped?: string }

/** Deliver one activity to many inboxes, queueing failures for retry. */
export async function deliverToInboxes(deps: ApDeps, actorKey: string, activity: Record<string, unknown>, inboxes: string[]): Promise<FanoutResult> {
  const body = JSON.stringify(activity);
  const res: FanoutResult = { sent: 0, queued: 0, dropped: 0 };
  await pool(inboxes, CONCURRENCY, async inbox => {
    const r = await postSigned(deps, actorKey, inbox, body);
    const kind = classifyStatus(r.status);
    if (kind === 'ok') { res.sent++; return; }
    if (kind === 'drop') { res.dropped++; deps.log('delivery refused', { inbox, status: r.status, body: r.body.slice(0, 200) }); return; }
    const when = nextAttemptAt(1, deps.now())!;
    await deps.store.putDelivery({ actorKey, inbox, activity: body, attempts: 1, nextAttemptAt: when, status: 'pending', lastError: `HTTP ${r.status} ${r.body.slice(0, 160)}`, createdAt: deps.now() });
    res.queued++;
  });
  return res;
}

/** Fan a newly published post out to the author's (or org's) followers as Create(Note). */
export async function deliverPostToFollowers(postId: string, depsIn?: ApDeps): Promise<FanoutResult> {
  const deps = depsIn ?? await defaultDeps();
  const post = await deps.loadPost(postId);
  if (!post) return { sent: 0, queued: 0, dropped: 0, skipped: 'not-found' };
  const ref = postActorRef(post);
  if (!ref) return { sent: 0, queued: 0, dropped: 0, skipped: 'no-actor' };
  const actorKey = actorKeyFor(ref.kind, ref.id);
  const actor = await resolveActorKey(deps, actorKey);
  if (!actor) return { sent: 0, queued: 0, dropped: 0, skipped: 'federation-off' };
  const u = apUrls(deps.base);
  const verdict = judgePost(post, u.postPage(postId), deps.now());
  if (!verdict.ok) return { sent: 0, queued: 0, dropped: 0, skipped: verdict.reason };

  const note = buildNote(deps.base, { ...post, id: postId }, actor.rec.handle);
  await deps.store.markPublished({ postId, actorKey, handle: actor.rec.handle, noteId: u.note(postId), at: deps.now() });
  const followers = await deps.store.listFollowers(actorKey, MAX_FOLLOWERS_PER_FANOUT);
  const inboxes = inboxTargets(followers, await deps.store.blockedDomains());
  if (!inboxes.length) return { sent: 0, queued: 0, dropped: 0, skipped: 'no-followers' };
  return deliverToInboxes(deps, actorKey, buildCreate(deps.base, note), inboxes);
}

/** Ask followers' servers to delete a post we federated. Works after the Plajah post itself is gone. */
export async function deliverDelete(postId: string, depsIn?: ApDeps): Promise<FanoutResult> {
  const deps = depsIn ?? await defaultDeps();
  const pub = await deps.store.getPublished(postId);
  if (!pub) return { sent: 0, queued: 0, dropped: 0, skipped: 'never-federated' };
  if (!parseActorKey(pub.actorKey)) return { sent: 0, queued: 0, dropped: 0, skipped: 'bad-actor' };
  // Deletes go out even if the identity was switched off since — that's the point of a delete.
  const followers = await deps.store.listFollowers(pub.actorKey, MAX_FOLLOWERS_PER_FANOUT);
  const inboxes = inboxTargets(followers, await deps.store.blockedDomains());
  await deps.store.markPublished({ ...pub, deletedAt: deps.now() });
  if (!inboxes.length) return { sent: 0, queued: 0, dropped: 0, skipped: 'no-followers' };
  return deliverToInboxes(deps, pub.actorKey, buildDelete(deps.base, postId, pub.handle), inboxes);
}

/** Accept a Follow (sent straight away; queued for retry if their server is down). */
export async function sendAccept(deps: ApDeps, actorKey: string, handle: string, follow: Record<string, any>, inbox: string): Promise<FanoutResult> {
  const nonce = Math.abs(hashCode(String(follow.id ?? '') + deps.now())).toString(36);
  return deliverToInboxes(deps, actorKey, buildAccept(deps.base, handle, follow, nonce), [inbox]);
}
function hashCode(s: string): number { let x = 0; for (let i = 0; i < s.length; i++) x = (Math.imul(31, x) + s.charCodeAt(i)) | 0; return x; }

/** Drain queued deliveries whose time has come. Returns counts. */
export async function retryDueDeliveries(depsIn?: ApDeps, limit = 50): Promise<{ sent: number; rescheduled: number; dead: number }> {
  const deps = depsIn ?? await defaultDeps();
  const due = await deps.store.dueDeliveries(deps.now(), limit);
  const out = { sent: 0, rescheduled: 0, dead: 0 };
  const blocked = await deps.store.blockedDomains();
  await pool(due, CONCURRENCY, async ({ id, rec }) => {
    const c = checkFederationUrl(rec.inbox);
    if (!c.ok || isDomainBlocked(c.url.hostname, blocked)) { await deps.store.deleteDelivery(id); out.dead++; return; }
    const r = await postSigned(deps, rec.actorKey, rec.inbox, rec.activity);
    const kind = classifyStatus(r.status);
    if (kind === 'ok') { await deps.store.deleteDelivery(id); out.sent++; return; }
    const attempts = rec.attempts + 1;
    const when = kind === 'retry' ? nextAttemptAt(attempts, deps.now()) : null;
    if (when === null) {
      await deps.store.patchDelivery(id, { attempts, status: 'dead', nextAttemptAt: PARKED, lastError: `HTTP ${r.status} ${r.body.slice(0, 160)}` });
      out.dead++;
    } else {
      await deps.store.patchDelivery(id, { attempts, nextAttemptAt: when, lastError: `HTTP ${r.status} ${r.body.slice(0, 160)}` });
      out.rescheduled++;
    }
  });
  return out;
}
