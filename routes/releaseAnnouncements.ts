// Server wiring for the release-announcement sweep (services/releases/releaseAnnouncer.ts): the Firestore REST implementation of
// ReleaseIo. Kept out of server.ts so it can be type-checked on its own. Mounted from server.ts as
//   POST /api/cron/release-announcements   header x-cron-key: <CRON_SECRET|ADMIN_SEED_KEY>   (Cloud Scheduler, every 5 min)
import { fsGet, fsPatch } from '../services/firebaseAdminRest';
import { fsQueryStrict, fsCreateOnce } from '../services/safety/safetyServerIo';
import type { ReleaseIo, ClaimDoc } from '../services/releases/releaseAnnouncer';

export interface ReleaseIoDeps {
  /** Push to one user's devices (server.ts owns the FCM plumbing). Optional: announcements work without it. */
  pushToUser?: (uid: string, msg: { title: string; body: string; link: string; targetId: string }) => Promise<void>;
}

export function createReleaseIo(deps: ReleaseIoDeps = {}): ReleaseIo {
  return {
    now: () => Date.now(),
    // Two range filters on ONE field: no composite index. Strict: a failed query must not look like "nothing to announce".
    queryByTime: async (collection, field, fromMs, toMs, limit) => (await fsQueryStrict(collection, {
      where: [{ field, op: 'GREATER_THAN_OR_EQUAL', value: fromMs }, { field, op: 'LESS_THAN', value: toMs }], limit,
    })).map(r => ({ id: r.id, data: r.data })),
    claim: (id, data) => fsCreateOnce('releaseAnnouncements', id, data),
    finish: async (id, patch) => { await fsPatch(`releaseAnnouncements/${id}`, patch); },
    listSending: async limit => (await fsQueryStrict('releaseAnnouncements', { where: [{ field: 'status', op: 'EQUAL', value: 'sending' }], limit }))
      .map(r => ({ id: r.id, data: r.data as unknown as ClaimDoc })),
    profile: async uid => { const u = await fsGet(`users/${uid}`); return u ? { displayName: u.displayName, photoURL: u.photoURL } : null; },
    // Ordered by followerId and strictly after the cursor so a fan-out can stop and resume. Needs the composite index
    // follows(followingId, followerId) in firestore.indexes.json (deploy it before launch). Strict: a missing index THROWS.
    followersPage: async (uid, after, limit) => (await fsQueryStrict('follows', {
      where: [{ field: 'followingId', op: 'EQUAL', value: uid }, ...(after ? [{ field: 'followerId', op: 'GREATER_THAN' as const, value: after }] : [])],
      orderBy: { field: 'followerId', direction: 'ASCENDING' }, limit,
    })).map(r => ({ followerId: String(r.data.followerId || ''), notifyLevel: r.data.notifyLevel })),
    // Deterministic ids: the same release can never post or notify twice, even across retries and resumed runs.
    postFeed: async (id, item) => { const st = await fsCreateOnce('feed', id, item); if (st === 'error') throw new Error('feed write failed'); },
    notifyOnce: async (id, n) => { const st = await fsCreateOnce('notifications', id, n); if (st === 'error') throw new Error('notification write failed'); return st; },
    push: deps.pushToUser,
    patchContent: async (collection, id, patch) => { await fsPatch(`${collection}/${id}`, patch); },
  };
}
