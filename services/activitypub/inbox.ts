// Inbound federation: authenticate a POST to an inbox (HTTP Signature → remote actor key → owner check), then
// apply the activity. Supported: Follow (auto-Accept), Undo Follow/Like/Announce, Create (replies to Plajah posts
// only), Like, Announce, Delete (reply or whole remote actor), Update (edited reply). Everything else is accepted
// and ignored, as the protocol expects.
//
// We never store remote HTML: replies are reduced to plain text before they touch Firestore.

import { apUrls, postIdFromNoteUrl, handleFromActorUrl, actorKeyFor, INSTANCE_ACTOR_KEY } from './config';
import { precheckSignature, verifySignature, signRequest } from './httpSignature';
import { htmlToText } from './jsonld';
import { judgePost, postActorRef, acceptsRemoteReplies, isDomainBlocked } from './policy';
import { resolveLocalActor, resolveActorKey, signingKeyFor } from './actors';
import { sendAccept } from './delivery';
import { checkFederationUrl } from './remote';
import type { ReplyRecord } from './store';
import type { ApDeps } from './deps';

export interface RemoteActor {
  id: string;
  host: string;
  inbox: string;
  sharedInbox?: string;
  preferredUsername: string;
  name: string;
  iconUrl?: string;
  url?: string;
  publicKeyPem: string;
  keyId: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const actorCache = new Map<string, { at: number; actor: RemoteActor }>();
export const _clearActorCache = () => actorCache.clear();

const str = (v: unknown, max = 2048): string | undefined => (typeof v === 'string' && v && v.length <= max ? v : undefined);
const idOf = (v: unknown): string | undefined => (typeof v === 'string' ? str(v) : v && typeof v === 'object' ? str((v as any).id) : undefined);
const firstUrl = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstUrl(v[0]);
  if (v && typeof v === 'object') return str((v as any).href) || str((v as any).url);
  return undefined;
};
const httpsUrl = (v: unknown): string | undefined => { const s = firstUrl(v); return s && checkFederationUrl(s).ok ? s : undefined; };
const hostOf = (u: string): string | null => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };

/** Signed GET (as the instance actor) so servers running "authorized fetch" still answer. */
async function fetchJson(deps: ApDeps, url: string): Promise<{ status: number; json: any | null }> {
  const key = await signingKeyFor(deps, INSTANCE_ACTOR_KEY).catch(() => null);
  const headers = key ? signRequest({ method: 'GET', url, keyId: key.keyId, privateKeyPem: key.privateKeyPem, now: new Date(deps.now()), accept: 'application/activity+json' }) : {};
  return deps.http.getJson(url, headers);
}

/** Shape a fetched actor document. Null when it isn't a usable actor. */
export function parseRemoteActor(doc: any, expectedKeyId?: string): RemoteActor | null {
  if (!doc || typeof doc !== 'object') return null;
  const id = str(doc.id); const inbox = str(doc.inbox);
  const pk = doc.publicKey && typeof doc.publicKey === 'object' ? (Array.isArray(doc.publicKey) ? doc.publicKey.find((k: any) => !expectedKeyId || k?.id === expectedKeyId) ?? doc.publicKey[0] : doc.publicKey) : null;
  const pem = str(pk?.publicKeyPem, 10_000);
  if (!id || !inbox || !pem) return null;
  if (pk.owner && pk.owner !== id) return null;
  if (expectedKeyId && pk.id && pk.id !== expectedKeyId) return null;
  const host = hostOf(id);
  if (!host || !checkFederationUrl(id).ok || !checkFederationUrl(inbox).ok) return null;
  const shared = str(doc.endpoints?.sharedInbox);
  return {
    id, host, inbox,
    sharedInbox: shared && checkFederationUrl(shared).ok ? shared : undefined,
    preferredUsername: (str(doc.preferredUsername, 200) || host).replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 64),
    name: htmlToText(str(doc.name, 1000) || str(doc.preferredUsername, 200) || '', 100),
    iconUrl: httpsUrl(doc.icon?.url ?? doc.icon),
    url: httpsUrl(doc.url),
    publicKeyPem: pem,
    keyId: str(pk.id) || expectedKeyId || `${id}#main-key`,
  };
}

/** keyId → the actor who owns it. */
export async function fetchActorForKey(deps: ApDeps, keyId: string, opts: { fresh?: boolean } = {}): Promise<{ actor: RemoteActor | null; status: number }> {
  const docUrl = keyId.split('#')[0];
  const cached = actorCache.get(keyId);
  if (!opts.fresh && cached && deps.now() - cached.at < CACHE_TTL_MS) return { actor: cached.actor, status: 200 };
  if (!checkFederationUrl(docUrl).ok) return { actor: null, status: 0 };
  let r = await fetchJson(deps, docUrl);
  if (!r.json) return { actor: null, status: r.status };
  let doc = r.json;
  // keyId may point at a standalone Key document; follow its owner.
  if (!doc.inbox && typeof doc.owner === 'string' && doc.publicKeyPem) {
    const keyDoc = doc;
    if (hostOf(keyDoc.owner) !== hostOf(docUrl)) return { actor: null, status: 0 };
    r = await fetchJson(deps, keyDoc.owner);
    if (!r.json) return { actor: null, status: r.status };
    doc = { ...r.json, publicKey: { id: keyDoc.id ?? keyId, owner: keyDoc.owner, publicKeyPem: keyDoc.publicKeyPem } };
  }
  const actor = parseRemoteActor(doc, keyId);
  if (actor) {
    if (actorCache.size > 5000) actorCache.delete(actorCache.keys().next().value as string);
    actorCache.set(keyId, { at: deps.now(), actor });
  }
  return { actor, status: r.status };
}

export interface InboundRequest {
  method: string;
  path: string;                                       // originalUrl, with query
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  /** Hosts the client may have signed for (Host header, X-Forwarded-Host, the public host). */
  hostCandidates: string[];
}

export type AuthResult = { ok: true; actor: RemoteActor; status?: undefined; reason?: undefined } | { ok: false; status: number; reason: string };

export async function authenticateInbound(deps: ApDeps, req: InboundRequest, activity: any): Promise<AuthResult> {
  const actorId = idOf(activity?.actor);
  if (!actorId) return { ok: false, status: 400, reason: 'no-actor' };
  const pre = precheckSignature({ method: req.method, headers: req.headers, rawBody: req.rawBody, now: deps.now() });
  if (!pre.ok) return { ok: false, status: 401, reason: (pre as { reason?: string }).reason || 'bad-signature' };
  const keyHost = hostOf(pre.sig.keyId); const actorHost = hostOf(actorId);
  if (!keyHost || !actorHost) return { ok: false, status: 400, reason: 'bad-ids' };
  if (keyHost !== actorHost) return { ok: false, status: 401, reason: 'key-host-mismatch' };
  const blocked = await deps.store.blockedDomains();
  if (isDomainBlocked(actorHost, blocked)) return { ok: false, status: 403, reason: 'blocked-domain' };

  let { actor, status } = await fetchActorForKey(deps, pre.sig.keyId);
  if (!actor) {
    // A deleted remote account announces itself with a Delete we can no longer verify. Nothing to do; say OK.
    if (activity?.type === 'Delete' && idOf(activity.object) === actorId && (status === 404 || status === 410)) {
      return { ok: false, status: 202, reason: 'actor-gone' };
    }
    return { ok: false, status: 401, reason: 'key-unavailable' };
  }
  if (actor.id !== actorId) return { ok: false, status: 401, reason: 'key-owner-mismatch' };

  const tryVerify = (pem: string) => {
    for (const host of req.hostCandidates) {
      const headers = { ...req.headers, host };
      const v = verifySignature({ method: req.method, path: req.path, headers, rawBody: req.rawBody, publicKeyPem: pem, now: deps.now() });
      if (v.ok) return true;
    }
    return false;
  };
  if (tryVerify(actor.publicKeyPem)) return { ok: true, actor };
  // Key may have rotated: refetch once.
  const fresh = await fetchActorForKey(deps, pre.sig.keyId, { fresh: true });
  if (fresh.actor && fresh.actor.id === actorId && fresh.actor.publicKeyPem !== actor.publicKeyPem && tryVerify(fresh.actor.publicKeyPem)) {
    return { ok: true, actor: fresh.actor };
  }
  return { ok: false, status: 401, reason: 'bad-signature' };
}

export interface ProcessResult { status: number; handled: string }

/** Load a post addressed by one of our Note URLs, only if it is federated and its actor is switched on. */
async function federatedPost(deps: ApDeps, objectId: string | undefined): Promise<{ postId: string; post: Record<string, any>; actorKey: string } | null> {
  const postId = postIdFromNoteUrl(deps.base, objectId);
  if (!postId) return null;
  const post = await deps.loadPost(postId);
  if (!post) return null;
  if (!judgePost(post, apUrls(deps.base).postPage(postId), deps.now()).ok) return null;
  const ref = postActorRef(post);
  if (!ref) return null;
  const actorKey = actorKeyFor(ref.kind, ref.id);
  if (!(await resolveActorKey(deps, actorKey))) return null;
  return { postId, post, actorKey };
}

function replyFromNote(note: any, remote: RemoteActor, postId: string, actorKey: string, now: number): ReplyRecord | null {
  const noteId = str(note?.id);
  if (!noteId || hostOf(noteId) !== remote.host) return null;
  const attachments = (Array.isArray(note.attachment) ? note.attachment : note.attachment ? [note.attachment] : [])
    .slice(0, 4)
    .map((a: any) => ({ url: httpsUrl(a?.url), mediaType: str(a?.mediaType, 100), name: a?.name ? htmlToText(String(a.name), 1500) : undefined }))
    .filter((a: any) => a.url)
    .map((a: any) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) as { url: string; mediaType?: string; name?: string });
  const published = Date.parse(str(note.published) || '') || now;
  const rec: ReplyRecord = {
    postId, actorKey, noteId,
    remoteActor: remote.id,
    authorName: remote.name || remote.preferredUsername,
    authorHandle: `@${remote.preferredUsername}@${remote.host}`,
    text: htmlToText(str(note.content, 200_000) || ''),
    sensitive: note.sensitive === true,
    attachments,
    published: Math.min(published, now),
    receivedAt: now,
  };
  const url = httpsUrl(note.url); if (url) rec.url = url;
  if (remote.iconUrl) rec.authorIcon = remote.iconUrl;
  if (remote.url) rec.authorUrl = remote.url;
  if (note.summary) rec.summary = htmlToText(String(note.summary), 500);
  return rec;
}

/**
 * Apply an authenticated activity. `inboxHandle` is set for per-actor inboxes (then Follow must target that actor).
 */
export async function processActivity(deps: ApDeps, activity: any, remote: RemoteActor, inboxHandle?: string): Promise<ProcessResult> {
  const type = str(activity?.type, 64) || '';
  const activityId = idOf(activity);
  if (activityId && hostOf(activityId) !== remote.host) return { status: 400, handled: 'foreign-activity-id' };
  if (activityId && ['Follow', 'Create', 'Like', 'Announce'].includes(type)) {
    if (!(await deps.store.markActivitySeen(activityId, { type, actor: remote.id }))) return { status: 202, handled: 'duplicate' };
  }
  switch (type) {
    case 'Follow': {
      const target = idOf(activity.object);
      const handle = handleFromActorUrl(deps.base, target);
      if (!handle || (inboxHandle && handle !== inboxHandle)) return { status: 404, handled: 'follow-unknown-target' };
      const local = await resolveLocalActor(deps, handle);
      if (!local) return { status: 404, handled: 'follow-actor-off' };
      const r = await deps.store.addFollower({
        actorKey: local.key, remoteActor: remote.id, inbox: remote.inbox, ...(remote.sharedInbox ? { sharedInbox: remote.sharedInbox } : {}),
        domain: remote.host, ...(activityId ? { followId: activityId } : {}), at: deps.now(),
      });
      if (r === 'error') return { status: 500, handled: 'follow-store-failed' };
      await sendAccept(deps, local.key, local.rec.handle, { id: activityId ?? `${remote.id}#follow`, actor: remote.id }, remote.inbox);
      return { status: 202, handled: r === 'added' ? 'follow-accepted' : 'follow-reaccepted' };
    }

    case 'Undo': {
      const inner = activity.object;
      const innerType = inner && typeof inner === 'object' ? str(inner.type, 64) : undefined;
      const innerActor = inner && typeof inner === 'object' ? idOf(inner.actor) : undefined;
      if (innerActor && innerActor !== remote.id) return { status: 403, handled: 'undo-not-yours' };
      if (innerType === 'Follow') {
        const handle = handleFromActorUrl(deps.base, idOf(inner.object));
        if (!handle) return { status: 202, handled: 'undo-follow-unknown' };
        const key = await deps.store.actorKeyForHandle(handle);
        if (key) await deps.store.removeFollower(key, remote.id);
        return { status: 202, handled: 'unfollowed' };
      }
      if (innerType === 'Like' || innerType === 'Announce') {
        const postId = postIdFromNoteUrl(deps.base, idOf(inner.object));
        if (postId) await deps.store.removeReaction(innerType === 'Like' ? 'like' : 'announce', postId, remote.id);
        return { status: 202, handled: `undo-${innerType.toLowerCase()}` };
      }
      return { status: 202, handled: 'undo-ignored' };
    }

    case 'Create':
    case 'Update': {
      const note = activity.object;
      if (!note || typeof note !== 'object' || !['Note', 'Article', 'Page', 'Question'].includes(String(note.type))) return { status: 202, handled: 'create-ignored' };
      if (idOf(note.attributedTo) !== remote.id) return { status: 403, handled: 'create-not-yours' };
      if (type === 'Update') {
        const prior = await deps.store.getReply(str(note.id) || '');
        if (!prior || prior.remoteActor !== remote.id) return { status: 202, handled: 'update-ignored' };
        const rec = replyFromNote(note, remote, prior.postId, prior.actorKey, deps.now());
        if (rec) await deps.store.saveReply({ ...rec, published: prior.published });
        return { status: 202, handled: 'reply-updated' };
      }
      const target = await federatedPost(deps, idOf(note.inReplyTo));
      if (!target) return { status: 202, handled: 'not-a-reply-to-us' };
      if (!acceptsRemoteReplies(target.post)) return { status: 202, handled: 'replies-closed' };
      const rec = replyFromNote(note, remote, target.postId, target.actorKey, deps.now());
      if (!rec || (!rec.text && !rec.attachments?.length)) return { status: 202, handled: 'empty-reply' };
      await deps.store.saveReply(rec);
      return { status: 202, handled: 'reply-stored' };
    }

    case 'Like':
    case 'Announce': {
      const target = await federatedPost(deps, idOf(activity.object));
      if (!target) return { status: 202, handled: `${type.toLowerCase()}-ignored` };
      await deps.store.addReaction(type === 'Like' ? 'like' : 'announce', target.postId, remote.id, activityId ?? '');
      return { status: 202, handled: type.toLowerCase() };
    }

    case 'Delete': {
      const objectId = idOf(activity.object);
      if (!objectId) return { status: 202, handled: 'delete-ignored' };
      if (objectId === remote.id) {
        await deps.store.removeRemoteActorEverywhere(remote.id);
        return { status: 202, handled: 'remote-actor-deleted' };
      }
      const reply = await deps.store.getReply(objectId);
      if (reply && reply.remoteActor === remote.id) {
        await deps.store.deleteReply(objectId);
        return { status: 202, handled: 'reply-deleted' };
      }
      return { status: 202, handled: 'delete-ignored' };
    }

    default:
      return { status: 202, handled: 'ignored' };
  }
}
