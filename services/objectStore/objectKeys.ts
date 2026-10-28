// services/objectStore/objectKeys.ts — where files live in the private bucket and who may touch them.
//
// One private bucket, folders by feature; lifecycle (auto-delete) rules are set per folder prefix:
//
//   collab/{projectId}/{uid}/{assetId}/{proxy|master}.{ext}   shared project media — kept
//   meetings/{free|plus}/{roomId}/{recId}/seg_NNNNN.webm      cloud recordings — deleted after 30 / 365 days
//
// Pure: the server route (routes/objectStore.ts) checks these against the project or chat room, the client
// (services/objectStore/client.ts) builds the same keys, and tests/objectStore.test.ts pins both.

export type ObjectOp = 'get' | 'put' | 'delete';

/** B2 takes up to 5 GB in one PUT; shared media stays under the old Storage rule's 2 GB. */
export const MAX_OBJECT_BYTES = 2 * 1024 * 1024 * 1024;
/** One ~10 s recording segment; 1080p VP9 runs ~3 MB, so this only stops abuse. */
export const MAX_SEGMENT_BYTES = 100 * 1024 * 1024;
/** Signed playback links per request (a 4-hour meeting is ~1,440 segments). */
export const MAX_BATCH_KEYS = 2000;

const PROJECT_RE = /^[\w.-]{1,160}$/;
const UID_RE = /^[\w-]{1,128}$/;
const ASSET_RE = /^a[0-9a-f]{32}$/;
const COLLAB_FILE_RE = /^(proxy|master)\.(webm|ogg|wav|flac|mp3|m4a|json|bin)$/;
const ROOM_RE = /^[\w-]{1,128}$/;
const SEG_RE = /^seg_(\d{5})\.webm$/;
const MIME_RE = /^[\w.+-]{1,40}\/[\w.+-]{1,80}$/;

export interface CollabKey {
  area: 'collab';
  projectId: string;
  uid: string;
  assetId: string;
  tier: 'proxy' | 'master';
}

/** Which folder a recording's segments go in; the lifecycle rule on it is the retention. */
export type RecordingPlan = 'free' | 'plus';

export interface MeetingKey {
  area: 'meetings';
  plan: RecordingPlan;
  roomId: string;
  recId: string;
  seg: number;
}

export type ObjectKey = CollabKey | MeetingKey;

/** The thing whose access decides a key: one check covers a whole batch with the same scope. */
export const keyScope = (k: ObjectKey) => (k.area === 'collab' ? `collab/${k.projectId}` : `meetings/${k.roomId}/${k.recId}`);

export function meetingSegmentKey(plan: RecordingPlan, roomId: string, recId: string, seg: number): string {
  return `meetings/${plan}/${roomId}/${recId}/seg_${String(seg).padStart(5, '0')}.webm`;
}

export function collabKey(projectId: string, uid: string, assetId: string, tier: 'proxy' | 'master', ext: string): string {
  return `collab/${projectId}/${uid}/${assetId}/${tier}.${ext}`;
}

export function parseObjectKey(key: unknown): ObjectKey | null {
  if (typeof key !== 'string' || key.length > 400) return null;
  const parts = key.split('/');
  if (parts[0] === 'collab' && parts.length === 5) {
    const [, projectId, uid, assetId, file] = parts;
    const m = COLLAB_FILE_RE.exec(file);
    if (!PROJECT_RE.test(projectId) || projectId.startsWith('.') || !UID_RE.test(uid) || !ASSET_RE.test(assetId) || !m) return null;
    return { area: 'collab', projectId, uid, assetId, tier: m[1] as 'proxy' | 'master' };
  }
  if (parts[0] === 'meetings' && parts.length === 5) {
    const [, plan, roomId, recId, file] = parts;
    const m = SEG_RE.exec(file);
    if ((plan !== 'free' && plan !== 'plus') || !ROOM_RE.test(roomId) || !ROOM_RE.test(recId) || !m) return null;
    return { area: 'meetings', plan, roomId, recId, seg: Number(m[1]) };
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

/** What the server read for a meetings/… key. */
export interface MeetingAccess {
  room: { participants?: unknown } | null;
  recording: { hostUid?: unknown; mode?: unknown; status?: unknown } | null;
  /** Caller has an active Plajah Plus subscription. */
  paid: boolean;
}

/** null when allowed, else the reason. Uploads only while the host's own cloud recording is running. */
export function meetingDecision(op: ObjectOp, k: MeetingKey, uid: string, a: MeetingAccess): string | null {
  const inRoom = Array.isArray(a.room?.participants) && a.room!.participants.includes(uid);
  if (!inRoom) return 'Only people in this chat can open its recordings.';
  if (op === 'get') return null;
  if (a.recording?.hostUid !== uid) return 'Only the person who recorded this can change it.';
  if (op === 'delete') return null;
  if (a.recording.mode !== 'CLOUD' || a.recording.status !== 'RECORDING') return 'This recording isn’t uploading to the cloud.';
  return k.plan === 'free' || a.paid ? null : 'A year of cloud storage comes with Plajah Plus.';
}
