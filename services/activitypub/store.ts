// ActivityPub persistence. Everything lives in server-only `ap_*` collections written by the service account
// (which bypasses firestore.rules), so NO rules changes are needed — and no client can read or write them.
//
//   ap_actors/{actorKey}            ActorRecord (u_<uid> | o_<orgId> | instance) — private key encrypted
//   ap_handles/{handle}             { actorKey } — the federated handle, frozen at switch-on so the actor URL is stable
//   ap_followers/{actorKey}__{h}    FollowerRecord (remote follower + its inbox/sharedInbox)
//   ap_counts/{key}                 { count } — followers per actor, likes/announces/replies per post
//   ap_reactions/{kind}__{postId}__{h}  { remoteActor, activityId } — dedupe for Like/Announce
//   ap_replies/{h(noteId)}          ReplyRecord — remote replies to a Plajah post (plain text only)
//   ap_inbox/{h(activityId)}        { type, actor, at } — replay/duplicate guard
//   ap_published/{postId}           PublishedRecord — which actor federated a post (so Delete works after the post is gone)
//   ap_deliveries/{auto}            DeliveryRecord — failed deliveries awaiting retry
//   ap_config/blocklist             { domains: string[] } — instance-wide domain blocks (plus AP_BLOCKED_DOMAINS env)

import { createHash } from 'node:crypto';
import { fsGet, fsSet, fsPatch, fsDelete, fsCreate, fsQuery, fsBumpCounter } from '../firebaseAdminRest';

export interface ActorRecord {
  kind: 'user' | 'org' | 'instance';
  refId: string;
  handle: string;
  enabled: boolean;
  publicKeyPem: string;
  privateKeyEnc: string;
  createdAt: number;
  enabledAt?: number;
  disabledAt?: number;
  enabledBy?: string;
}
export interface FollowerRecord {
  actorKey: string;
  remoteActor: string;
  inbox: string;
  sharedInbox?: string;
  domain: string;
  followId?: string;
  at: number;
}
export interface ReplyRecord {
  postId: string;
  actorKey: string;
  noteId: string;
  url?: string;
  remoteActor: string;
  authorName: string;
  authorHandle: string;
  authorIcon?: string;
  authorUrl?: string;
  text: string;
  summary?: string;
  sensitive?: boolean;
  attachments?: { url: string; mediaType?: string; name?: string }[];
  published: number;
  receivedAt: number;
}
export interface DeliveryRecord {
  actorKey: string;
  inbox: string;
  activity: string;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'dead';
  lastError?: string;
  createdAt: number;
}
export interface PublishedRecord { postId: string; actorKey: string; handle: string; noteId: string; at: number; deletedAt?: number }
export type ReactionKind = 'like' | 'announce';

export interface ApStore {
  getActor(key: string): Promise<ActorRecord | null>;
  putActor(key: string, rec: ActorRecord): Promise<boolean>;
  patchActor(key: string, patch: Partial<ActorRecord>): Promise<boolean>;
  actorKeyForHandle(handle: string): Promise<string | null>;
  /** Reserve a handle for an actor. False when another actor holds it. */
  claimHandle(handle: string, key: string): Promise<boolean>;
  countEnabledActors(): Promise<number>;

  addFollower(f: FollowerRecord): Promise<'added' | 'exists' | 'error'>;
  removeFollower(actorKey: string, remoteActor: string): Promise<boolean>;
  removeRemoteActorEverywhere(remoteActor: string): Promise<number>;
  listFollowers(actorKey: string, limit: number): Promise<FollowerRecord[]>;
  followerCount(actorKey: string): Promise<number>;

  saveReply(r: ReplyRecord): Promise<boolean>;
  getReply(noteId: string): Promise<ReplyRecord | null>;
  deleteReply(noteId: string): Promise<boolean>;
  listReplies(postId: string, limit: number): Promise<ReplyRecord[]>;

  addReaction(kind: ReactionKind, postId: string, remoteActor: string, activityId: string): Promise<boolean>;
  removeReaction(kind: ReactionKind, postId: string, remoteActor: string): Promise<boolean>;
  postCounts(postId: string): Promise<{ likes: number; announces: number; replies: number }>;

  blockedDomains(): Promise<Set<string>>;
  /** True the first time an activity id is seen. */
  markActivitySeen(activityId: string, info: { type: string; actor: string }): Promise<boolean>;

  putDelivery(rec: DeliveryRecord): Promise<string | null>;
  patchDelivery(id: string, patch: Partial<DeliveryRecord>): Promise<boolean>;
  deleteDelivery(id: string): Promise<boolean>;
  dueDeliveries(now: number, limit: number): Promise<Array<{ id: string; rec: DeliveryRecord }>>;

  markPublished(rec: PublishedRecord): Promise<boolean>;
  getPublished(postId: string): Promise<PublishedRecord | null>;
}

export const h = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);
const followerId = (actorKey: string, remote: string) => `${actorKey}__${h(remote)}`;
const reactionId = (kind: ReactionKind, postId: string, remote: string) => `${kind}__${postId}__${h(remote)}`;
const countOf = (d: Record<string, any> | null) => Math.max(0, Number(d?.count) || 0);

/** Firestore-backed store (server only). */
export function createFirestoreStore(env: Record<string, string | undefined> = process.env): ApStore {
  let blockCache: { at: number; set: Set<string> } | null = null;
  const bump = (key: string, by: number) => fsBumpCounter(`ap_counts/${key}`, by).catch(() => null);
  return {
    async getActor(key) { return (await fsGet(`ap_actors/${key}`)) as ActorRecord | null; },
    putActor: (key, rec) => fsSet(`ap_actors/${key}`, rec as unknown as Record<string, unknown>),
    patchActor: (key, patch) => fsPatch(`ap_actors/${key}`, patch as Record<string, unknown>),
    async actorKeyForHandle(handle) { const d = await fsGet(`ap_handles/${handle}`); return typeof d?.actorKey === 'string' ? d.actorKey : null; },
    async claimHandle(handle, key) {
      const d = await fsGet(`ap_handles/${handle}`);
      if (d?.actorKey && d.actorKey !== key) return false;
      if (d?.actorKey === key) return true;
      return fsSet(`ap_handles/${handle}`, { actorKey: key, at: Date.now() });
    },
    async countEnabledActors() { return (await fsQuery('ap_actors', [{ field: 'enabled', value: true }], 5000)).filter(r => r.data.kind !== 'instance').length; },

    async addFollower(f) {
      const id = followerId(f.actorKey, f.remoteActor);
      const prior = await fsGet(`ap_followers/${id}`);
      const ok = await fsSet(`ap_followers/${id}`, f as unknown as Record<string, unknown>);
      if (!ok) return 'error';
      if (prior) return 'exists';
      await bump(`${f.actorKey}__followers`, 1);
      return 'added';
    },
    async removeFollower(actorKey, remoteActor) {
      const id = followerId(actorKey, remoteActor);
      if (!(await fsGet(`ap_followers/${id}`))) return false;
      const ok = await fsDelete(`ap_followers/${id}`);
      if (ok) await bump(`${actorKey}__followers`, -1);
      return ok;
    },
    async removeRemoteActorEverywhere(remoteActor) {
      const rows = await fsQuery('ap_followers', [{ field: 'remoteActor', value: remoteActor }], 500);
      let n = 0;
      for (const r of rows) if (await fsDelete(`ap_followers/${r.id}`)) { n++; await bump(`${r.data.actorKey}__followers`, -1); }
      return n;
    },
    async listFollowers(actorKey, limit) {
      return (await fsQuery('ap_followers', [{ field: 'actorKey', value: actorKey }], limit)).map(r => r.data as FollowerRecord);
    },
    async followerCount(actorKey) { return countOf(await fsGet(`ap_counts/${actorKey}__followers`)); },

    async saveReply(r) {
      const id = h(r.noteId);
      const prior = await fsGet(`ap_replies/${id}`);
      const ok = await fsSet(`ap_replies/${id}`, r as unknown as Record<string, unknown>);
      if (ok && !prior) await bump(`${r.postId}__replies`, 1);
      return ok;
    },
    async getReply(noteId) { return (await fsGet(`ap_replies/${h(noteId)}`)) as ReplyRecord | null; },
    async deleteReply(noteId) {
      const prior = await fsGet(`ap_replies/${h(noteId)}`);
      if (!prior) return false;
      const ok = await fsDelete(`ap_replies/${h(noteId)}`);
      if (ok) await bump(`${prior.postId}__replies`, -1);
      return ok;
    },
    async listReplies(postId, limit) {
      const rows = (await fsQuery('ap_replies', [{ field: 'postId', value: postId }], limit)).map(r => r.data as ReplyRecord);
      return rows.sort((a, b) => a.published - b.published);
    },

    async addReaction(kind, postId, remoteActor, activityId) {
      const id = reactionId(kind, postId, remoteActor);
      if (await fsGet(`ap_reactions/${id}`)) return false;
      if (!(await fsSet(`ap_reactions/${id}`, { kind, postId, remoteActor, activityId, at: Date.now() }))) return false;
      await bump(`${postId}__${kind}s`, 1);
      return true;
    },
    async removeReaction(kind, postId, remoteActor) {
      const id = reactionId(kind, postId, remoteActor);
      if (!(await fsGet(`ap_reactions/${id}`))) return false;
      const ok = await fsDelete(`ap_reactions/${id}`);
      if (ok) await bump(`${postId}__${kind}s`, -1);
      return ok;
    },
    async postCounts(postId) {
      const [l, a, r] = await Promise.all([fsGet(`ap_counts/${postId}__likes`), fsGet(`ap_counts/${postId}__announces`), fsGet(`ap_counts/${postId}__replies`)]);
      return { likes: countOf(l), announces: countOf(a), replies: countOf(r) };
    },

    async blockedDomains() {
      if (blockCache && Date.now() - blockCache.at < 60_000) return blockCache.set;
      const doc = await fsGet('ap_config/blocklist');
      const list = [
        ...(Array.isArray(doc?.domains) ? doc!.domains : []),
        ...String(env.AP_BLOCKED_DOMAINS || '').split(','),
      ].map((d: unknown) => String(d || '').trim().toLowerCase()).filter(Boolean);
      blockCache = { at: Date.now(), set: new Set(list) };
      return blockCache.set;
    },
    async markActivitySeen(activityId, info) {
      const id = h(activityId);
      if (await fsGet(`ap_inbox/${id}`)) return false;
      await fsSet(`ap_inbox/${id}`, { activityId: activityId.slice(0, 500), type: info.type, actor: info.actor.slice(0, 500), at: Date.now() });
      return true;
    },

    putDelivery: rec => fsCreate('ap_deliveries', rec as unknown as Record<string, unknown>),
    patchDelivery: (id, patch) => fsPatch(`ap_deliveries/${id}`, patch as Record<string, unknown>),
    deleteDelivery: id => fsDelete(`ap_deliveries/${id}`),
    async dueDeliveries(now, limit) {
      // Single-field inequality (auto-indexed). Dead rows park at MAX_SAFE_INTEGER so they never match.
      const rows = await fsQuery('ap_deliveries', [{ field: 'nextAttemptAt', value: now, op: 'LESS_THAN_OR_EQUAL' }], limit);
      return rows.filter(r => r.data.status === 'pending').map(r => ({ id: r.id, rec: r.data as DeliveryRecord }));
    },

    markPublished: rec => fsSet(`ap_published/${rec.postId}`, rec as unknown as Record<string, unknown>),
    async getPublished(postId) { return (await fsGet(`ap_published/${postId}`)) as PublishedRecord | null; },
  };
}

/** In-memory store with the same semantics — used by tests, handy for local dev. */
export function createMemoryStore(seed: { blocked?: string[] } = {}): ApStore & { _dump(): Record<string, Map<string, any>> } {
  const actors = new Map<string, ActorRecord>(), handles = new Map<string, string>(), followers = new Map<string, FollowerRecord>();
  const counts = new Map<string, number>(), reactions = new Map<string, any>(), replies = new Map<string, ReplyRecord>();
  const seen = new Map<string, any>(), deliveries = new Map<string, DeliveryRecord>(), published = new Map<string, PublishedRecord>();
  const blocked = new Set((seed.blocked ?? []).map(d => d.toLowerCase()));
  let seq = 0;
  const bump = (k: string, by: number) => counts.set(k, Math.max(0, (counts.get(k) ?? 0) + by));
  return {
    _dump: () => ({ actors, handles, followers, counts, reactions, replies, seen, deliveries, published }),
    async getActor(k) { return actors.get(k) ?? null; },
    async putActor(k, r) { actors.set(k, { ...r }); return true; },
    async patchActor(k, p) { const a = actors.get(k); if (!a) return false; actors.set(k, { ...a, ...p }); return true; },
    async actorKeyForHandle(hd) { return handles.get(hd) ?? null; },
    async claimHandle(hd, k) { const cur = handles.get(hd); if (cur && cur !== k) return false; handles.set(hd, k); return true; },
    async countEnabledActors() { return [...actors.values()].filter(a => a.enabled && a.kind !== 'instance').length; },
    async addFollower(f) { const id = followerId(f.actorKey, f.remoteActor); const had = followers.has(id); followers.set(id, { ...f }); if (!had) bump(`${f.actorKey}__followers`, 1); return had ? 'exists' : 'added'; },
    async removeFollower(k, r) { const id = followerId(k, r); if (!followers.delete(id)) return false; bump(`${k}__followers`, -1); return true; },
    async removeRemoteActorEverywhere(r) { let n = 0; for (const [id, f] of followers) if (f.remoteActor === r) { followers.delete(id); bump(`${f.actorKey}__followers`, -1); n++; } return n; },
    async listFollowers(k, limit) { return [...followers.values()].filter(f => f.actorKey === k).slice(0, limit); },
    async followerCount(k) { return counts.get(`${k}__followers`) ?? 0; },
    async saveReply(r) { const id = h(r.noteId); if (!replies.has(id)) bump(`${r.postId}__replies`, 1); replies.set(id, { ...r }); return true; },
    async getReply(n) { return replies.get(h(n)) ?? null; },
    async deleteReply(n) { const r = replies.get(h(n)); if (!r) return false; replies.delete(h(n)); bump(`${r.postId}__replies`, -1); return true; },
    async listReplies(p, limit) { return [...replies.values()].filter(r => r.postId === p).sort((a, b) => a.published - b.published).slice(0, limit); },
    async addReaction(kind, p, r, a) { const id = reactionId(kind, p, r); if (reactions.has(id)) return false; reactions.set(id, { a }); bump(`${p}__${kind}s`, 1); return true; },
    async removeReaction(kind, p, r) { const id = reactionId(kind, p, r); if (!reactions.delete(id)) return false; bump(`${p}__${kind}s`, -1); return true; },
    async postCounts(p) { return { likes: counts.get(`${p}__likes`) ?? 0, announces: counts.get(`${p}__announces`) ?? 0, replies: counts.get(`${p}__replies`) ?? 0 }; },
    async blockedDomains() { return blocked; },
    async markActivitySeen(id, info) { const k = h(id); if (seen.has(k)) return false; seen.set(k, info); return true; },
    async putDelivery(rec) { const id = `d${++seq}`; deliveries.set(id, { ...rec }); return id; },
    async patchDelivery(id, p) { const d = deliveries.get(id); if (!d) return false; deliveries.set(id, { ...d, ...p }); return true; },
    async deleteDelivery(id) { return deliveries.delete(id); },
    async dueDeliveries(now, limit) { return [...deliveries].filter(([, d]) => d.status === 'pending' && d.nextAttemptAt <= now).slice(0, limit).map(([id, rec]) => ({ id, rec })); },
    async markPublished(rec) { published.set(rec.postId, { ...rec }); return true; },
    async getPublished(p) { return published.get(p) ?? null; },
  };
}
