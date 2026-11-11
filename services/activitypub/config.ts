// ActivityPub — where Plajah's federated identities live, and the URL shapes everything else builds on.
// PURE: no network, no Firestore. Every builder takes the base URL so tests can pin it.
//
// The public host defaults to plajah.com (AP_BASE_URL overrides, then VITE_APP_URL). It must be the host people
// type after the second @ (@name@plajah.com) and must be served by this same Express app, or WebFinger breaks.

export const AP_CONTEXT = ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'] as const;
export const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
export const AP_CONTENT_TYPE = 'application/activity+json';
export const LD_CONTENT_TYPE = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

export function apBase(env: Record<string, string | undefined> = process.env): string {
  return (env.AP_BASE_URL || env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
}
export const apHost = (base: string = apBase()): string => new URL(base).host;

/** Mastodon's own rule for a username: letters, digits, _ ; dots/hyphens only in the middle. */
export const AP_HANDLE_RE = /^[a-z0-9_](?:[a-z0-9_.-]{0,62}[a-z0-9_])?$/;
export const normalizeHandle = (h: unknown): string | null => {
  if (typeof h !== 'string') return null;
  const v = h.trim().replace(/^@/, '').toLowerCase();
  return AP_HANDLE_RE.test(v) ? v : null;
};

/** Local actor key: users and orgs share one handle namespace on the wire, so the key carries the kind. */
export type ActorKind = 'user' | 'org';
export const actorKeyFor = (kind: ActorKind, id: string) => `${kind === 'user' ? 'u' : 'o'}_${id}`;
export const parseActorKey = (key: string): { kind: ActorKind; id: string } | null => {
  const m = /^([uo])_(.+)$/.exec(key);
  return m ? { kind: m[1] === 'u' ? 'user' : 'org', id: m[2] } : null;
};
export const INSTANCE_ACTOR_KEY = 'instance';

export function apUrls(base: string) {
  const actor = (handle: string) => `${base}/ap/users/${encodeURIComponent(handle)}`;
  return {
    actor,
    keyId: (handle: string) => `${actor(handle)}#main-key`,
    inbox: (handle: string) => `${actor(handle)}/inbox`,
    outbox: (handle: string) => `${actor(handle)}/outbox`,
    followers: (handle: string) => `${actor(handle)}/followers`,
    following: (handle: string) => `${actor(handle)}/following`,
    sharedInbox: () => `${base}/ap/inbox`,
    instanceActor: () => `${base}/ap/actor`,
    instanceKeyId: () => `${base}/ap/actor#main-key`,
    note: (postId: string) => `${base}/ap/posts/${encodeURIComponent(postId)}`,
    activity: (postId: string, verb: string) => `${base}/ap/posts/${encodeURIComponent(postId)}/${verb}`,
    /** Human pages (where a browser hitting an AP URL is sent). */
    userProfile: (uid: string) => `${base}/profile/${encodeURIComponent(uid)}`,
    orgProfile: (orgId: string) => `${base}/?org=${encodeURIComponent(orgId)}`,
    postPage: (postId: string) => `${base}/share?type=feed&id=${encodeURIComponent(postId)}`,
  };
}

/** The Plajah post id inside one of our Note URLs, or null when the URL isn't ours. */
export function postIdFromNoteUrl(base: string, url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const prefix = `${base}/ap/posts/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  if (!rest || rest.includes('/') || rest.includes('#') || rest.includes('?')) return null;
  try { const id = decodeURIComponent(rest); return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null; } catch { return null; }
}

/** The local handle inside one of our actor URLs, or null. */
export function handleFromActorUrl(base: string, url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const prefix = `${base}/ap/users/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  if (rest.includes('/') || rest.includes('#')) return null;
  try { return normalizeHandle(decodeURIComponent(rest)); } catch { return null; }
}

/** Does the client want ActivityPub JSON (vs a human page)? */
export function wantsActivityJson(accept: string | undefined): boolean {
  if (!accept) return false;
  return /application\/activity\+json|application\/ld\+json/i.test(accept);
}
