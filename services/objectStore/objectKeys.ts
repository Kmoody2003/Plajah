// services/objectStore/objectKeys.ts — where files live in the private bucket and who may touch them.
//
// One private bucket, folders by feature; lifecycle (auto-delete) rules are set per folder prefix:
//
//   collab/{projectId}/{uid}/{assetId}/{proxy|master}.{ext}   shared project media — kept
//
// Pure: the server route (routes/objectStore.ts) checks these against the project doc, the client
// (services/objectStore/client.ts) builds the same keys, and tests/objectStore.test.ts pins both.

export type ObjectOp = 'get' | 'put' | 'delete';

/** B2 takes up to 5 GB in one PUT; shared media stays under the old Storage rule's 2 GB. */
export const MAX_OBJECT_BYTES = 2 * 1024 * 1024 * 1024;

const PROJECT_RE = /^[\w.-]{1,160}$/;
const UID_RE = /^[\w-]{1,128}$/;
const ASSET_RE = /^a[0-9a-f]{32}$/;
const COLLAB_FILE_RE = /^(proxy|master)\.(webm|ogg|wav|flac|mp3|m4a|json|bin)$/;
const MIME_RE = /^[\w.+-]{1,40}\/[\w.+-]{1,80}$/;

export interface CollabKey {
  area: 'collab';
  projectId: string;
  uid: string;
  assetId: string;
  tier: 'proxy' | 'master';
}

export function collabKey(projectId: string, uid: string, assetId: string, tier: 'proxy' | 'master', ext: string): string {
  return `collab/${projectId}/${uid}/${assetId}/${tier}.${ext}`;
}

export function parseObjectKey(key: unknown): CollabKey | null {
  if (typeof key !== 'string' || key.length > 400) return null;
  const parts = key.split('/');
  if (parts[0] === 'collab' && parts.length === 5) {
    const [, projectId, uid, assetId, file] = parts;
    const m = COLLAB_FILE_RE.exec(file);
    if (!PROJECT_RE.test(projectId) || projectId.startsWith('.') || !UID_RE.test(uid) || !ASSET_RE.test(assetId) || !m) return null;
    return { area: 'collab', projectId, uid, assetId, tier: m[1] as 'proxy' | 'master' };
  }
  return null;
}

export const validMime = (m: unknown): m is string => typeof m === 'string' && MIME_RE.test(m);

/** The parts of a coedit/{projectId} doc the decision needs. */
export interface CollabProjectAccess {
  members?: Record<string, string>;
}

/** null when allowed, else the reason (shown to the person). */
export function collabDecision(op: ObjectOp, k: CollabKey, uid: string, project: CollabProjectAccess | null): string | null {
  const role = project?.members?.[uid];
  if (!role) return 'Only people on this project can open its media.';
  if (op === 'get') return null;
  if (op === 'put') {
    if (k.uid !== uid) return 'You can only upload into your own folder.';
    return role === 'owner' || role === 'editor' ? null : 'Viewers and commenters can’t add media.';
  }
  return k.uid === uid || role === 'owner' ? null : 'Only the person who added it or the project owner can remove it.';
}
