// Dependency bag for the ActivityPub services. Production wiring uses Firestore REST + the SSRF-safe client;
// tests pass fakes. Nothing in services/activitypub reaches the network except through these.

import type { ApStore } from './store';
import type { ApHttp } from './remote';

export interface PostRow { id: string; data: Record<string, any> }

export interface ApDeps {
  base: string;
  store: ApStore;
  http: ApHttp;
  now(): number;
  encKey(): Buffer;
  loadUser(uid: string): Promise<Record<string, any> | null>;
  loadOrg(orgId: string): Promise<Record<string, any> | null>;
  loadPost(postId: string): Promise<Record<string, any> | null>;
  /** Newest first, posts with timestamp <= beforeTs. */
  postsByUser(uid: string, beforeTs: number, limit: number): Promise<PostRow[]>;
  /** Newest first, posts with timestamp <= beforeTs, posted as the org. */
  postsByOrg(orgId: string, beforeTs: number, limit: number): Promise<PostRow[]>;
  /** Is this handle already used by a DIFFERENT Plajah user/org? (Keeps @x@plajah.com from impersonating @x on Plajah.) */
  handleTakenElsewhere(handle: string, self: { kind: 'user' | 'org'; id: string }): Promise<boolean>;
  log(msg: string, extra?: unknown): void;
}

export async function createDefaultDeps(): Promise<ApDeps> {
  const fs = await import('../firebaseAdminRest');
  const { createFirestoreStore } = await import('./store');
  const { createSafeHttp } = await import('./remote');
  const { apBase } = await import('./config');
  const { encryptionKey } = await import('./keys');
  return {
    base: apBase(),
    store: createFirestoreStore(),
    http: createSafeHttp(),
    now: () => Date.now(),
    encKey: () => encryptionKey(),
    loadUser: uid => fs.fsGetUser(uid),
    loadOrg: id => fs.fsGet(`organizations/${id}`),
    loadPost: id => fs.fsGet(`posts/${id}`),
    async postsByUser(uid, beforeTs, limit) {
      // Uses the existing posts (authorId ASC, timestamp DESC) composite index.
      return fs.fsQuery('posts', [
        { field: 'authorId', value: uid },
        { field: 'timestamp', value: beforeTs, op: 'LESS_THAN_OR_EQUAL' },
      ], limit, { field: 'timestamp', direction: 'DESCENDING' });
    },
    async postsByOrg(orgId, beforeTs, limit) {
      // No (authorOrgId, timestamp) index exists, so read a bounded window by equality and sort here.
      const rows = await fs.fsQuery('posts', [{ field: 'authorOrgId', value: orgId }], 300);
      return rows.filter(r => Number(r.data.timestamp) <= beforeTs)
        .sort((a, b) => Number(b.data.timestamp) - Number(a.data.timestamp)).slice(0, limit);
    },
    async handleTakenElsewhere(handle, self) {
      const [users, orgs] = await Promise.all([
        fs.fsQuery('users', [{ field: 'handle', value: handle }], 2),
        fs.fsQuery('organizations', [{ field: 'handle', value: handle }], 2),
      ]);
      return users.some(u => !(self.kind === 'user' && u.id === self.id)) || orgs.some(o => !(self.kind === 'org' && o.id === self.id));
    },
    log: (msg, extra) => console.warn(`[activitypub] ${msg}`, extra ?? ''),
  };
}

let _deps: Promise<ApDeps> | null = null;
/** Lazily-built production deps (one per process). */
export function defaultDeps(): Promise<ApDeps> {
  if (!_deps) _deps = createDefaultDeps();
  return _deps;
}
