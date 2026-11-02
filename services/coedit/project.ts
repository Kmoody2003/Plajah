// services/coedit/project.ts — who can work on a shared creative project, and its team chat.
//
// A project becomes shared the first time its owner invites someone. Membership lives on one doc in
// the plajah-ops database. Only the server changes it (routes/coeditSecurity.ts), so a name on the paper
// trail is the account's and an org's document stays in the org:
//
//   coedit/{projectId}            owner, members {uid: role}, memberIds, names, photos, chatRoomId…
//
// projectId is the creative-cloud id (`${kind}__${localId}`), so the owner's personal cloud copy and
// version history (services/creativeCloud) and the shared project line up. The team chat is an
// ordinary chat_rooms GROUP room, so it also shows up in everyone's Chat list and reuses the whole
// platform chat stack (reactions, voice notes, threads, calls).

import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, opsDb } from '../firebase';
import { cloudProjectId } from '../creativeCloud/cloudStore';

export const COEDIT = 'coedit';

export type CoRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface CoProject {
  id: string;
  kind: string;
  localId: string;
  title: string;
  ownerId: string;
  members: Record<string, CoRole>;
  memberIds: string[];
  names: Record<string, string>;
  photos?: Record<string, string>;
  /** uid -> when their access ends (ms). Rules close the content at that moment. */
  expires?: Record<string, number>;
  orgId?: string;
  /** The author, when this document came to its owner because the author left the org. */
  custodyFromUid?: string;
  /** Set by the owner: rules then refuse live edits from anyone else. */
  locked?: boolean;
  chatRoomId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CoPerson {
  uid: string;
  name: string;
  photo?: string | null;
}

export const coProjectId = cloudProjectId;
export const canEdit = (p: CoProject | null, uid: string | undefined) => !!p && !!uid && (p.members[uid] === 'owner' || p.members[uid] === 'editor');
export const canComment = (p: CoProject | null, uid: string | undefined) => !!p && !!uid && p.members[uid] != null && p.members[uid] !== 'viewer';

export const ROLE_LABEL: Record<CoRole, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  commenter: 'Can comment',
  viewer: 'Can view',
};

const projectRef = (id: string) => doc(opsDb, COEDIT, id);
const revocationRef = (id: string, uid: string) => doc(opsDb, COEDIT, id, 'revocations', uid);

export async function getCoProject(id: string): Promise<CoProject | null> {
  try {
    const snap = await getDoc(projectRef(id));
    return snap.exists() ? (snap.data() as CoProject) : null;
  } catch {
    return null; // not a member, or offline with nothing cached
  }
}

export function subscribeCoProject(id: string, cb: (p: CoProject | null) => void): () => void {
  return onSnapshot(
    projectRef(id),
    (s) => cb(s.exists() ? (s.data() as CoProject) : null),
    () => cb(null)
  );
}

/** Projects other people shared with the signed-in user (optionally one kind), newest first. */
export async function listSharedWithMe(kind?: string): Promise<CoProject[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(opsDb, COEDIT), where('memberIds', 'array-contains', uid)));
    return snap.docs
      .map((d) => d.data() as CoProject)
      .filter((p) => (p.ownerId !== uid || !!p.custodyFromUid) && (!kind || p.kind === kind))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export class CoAccessError extends Error {
  constructor(message: string, readonly code?: string, readonly canOverride?: boolean) { super(message); }
}

async function coeditCall<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new CoAccessError('Sign in to share this project.');
  const res = await fetch(`/api/coedit/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Record<string, any>;
  if (!res.ok) throw new CoAccessError(json.error || 'That did not go through. Try again.', json.code, json.canOverride);
  return json as T;
}

const access = (project: CoProject, body: Record<string, unknown>) => coeditCall(`projects/${encodeURIComponent(project.id)}/access`, body);

/** Makes (or returns) the shared project for a doc. The server checks the organization and fills in the names. */
export async function ensureCoProject(input: { kind: string; localId: string; title: string; orgId?: string }): Promise<CoProject> {
  const existing = await getCoProject(coProjectId(input.kind, input.localId));
  if (existing) return existing;
  const { project } = await coeditCall<{ project: CoProject }>('projects', { kind: input.kind, localId: input.localId, title: input.title || 'Untitled', ...(input.orgId ? { orgId: input.orgId } : {}) });
  return project;
}

/** Invites people (or changes their role). The server keeps the team chat's participants in step.
 *  An org document's invite of someone outside the org fails with code OUTSIDE_ORG unless `outside` is set by its owner or an IT Admin. */
export async function addMembers(project: CoProject, people: CoPerson[], role: Exclude<CoRole, 'owner'>, outside = false): Promise<void> {
  if (!people.length) return;
  await access(project, { action: 'invite', role, uids: people.map((p) => p.uid), ...(outside ? { outside: true } : {}) });
  const memberIds = [...new Set([...project.memberIds, ...people.map((p) => p.uid)])];
  await syncTeamChat({ ...project, memberIds }).catch((e) => console.warn('[coedit] team chat sync failed', e));
}

export async function setRole(project: CoProject, uid: string, role: Exclude<CoRole, 'owner'>) {
  if (uid === project.ownerId) return;
  await access(project, { action: 'role', uid, role });
}

/** Removes someone (owner), or leaves (anyone but the owner). */
export async function removeMember(project: CoProject, uid: string) {
  if (uid === project.ownerId) return;
  await access(project, uid === auth.currentUser?.uid ? { action: 'leave' } : { action: 'revoke', uid });
}

export interface CoRevocation { at: number; by: string; byName: string; reason: string }

/** Ends someone's access (owner). Their app sees the notice below and removes its copy of the document. */
export async function revokeMember(project: CoProject, uid: string, reason = '') {
  if (uid === project.ownerId) return;
  await access(project, { action: 'revoke', uid, reason: reason.slice(0, 300) });
}

/** Ends access for everyone but the owner, for when a document needs locking down at once. */
export async function revokeEveryone(project: CoProject, reason = '') {
  await access(project, { action: 'revoke_all', reason: reason.slice(0, 300) });
}

/** Access that ends by itself on a date; null keeps it open. */
export async function setMemberExpiry(project: CoProject, uid: string, at: number | null) {
  if (uid === project.ownerId) return;
  await access(project, { action: 'expiry', uid, at });
}

/** This person's own access date has passed: take them off the project and its team chat now, not at the next sweep. */
export const reportMyAccessExpired = (project: CoProject) => access(project, { action: 'self_expire' }).catch(() => {});

/** Removes a document from the shared side: live log, snapshots, versions, drafts, media and team chat. Owner only;
 *  anyone else gets a refusal, and their own copy is still theirs to clear. */
export const deleteSharedDoc = (kind: string, localId: string) =>
  coeditCall(`projects/${encodeURIComponent(coProjectId(kind, localId))}/delete`, {});

/** Why the signed-in person lost this project, if the owner revoked them. */
export async function getMyRevocation(projectId: string): Promise<CoRevocation | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(revocationRef(projectId, uid));
    return snap.exists() ? (snap.data() as CoRevocation) : null;
  } catch {
    return null;
  }
}

export const accessExpired = (p: CoProject | null, uid: string | undefined) => !!p && !!uid && !!p.expires?.[uid] && p.expires[uid] <= Date.now();

export const setProjectLocked = (project: CoProject, locked: boolean) => updateDoc(projectRef(project.id), { locked, updatedAt: Date.now() });

export async function renameCoProject(project: CoProject, title: string) {
  await updateDoc(projectRef(project.id), { title: title.trim() || 'Untitled', updatedAt: Date.now() });
}

// ── team chat (platform chat stack) ─────────────────────────────────────────

export const teamChatRoomId = (projectId: string) => `coedit_${projectId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 140);

/** Creates or refreshes the project's chat room (a GROUP room whose participants are the members). */
export async function syncTeamChat(project: CoProject): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid || !project.memberIds.includes(uid)) throw new Error('Only members can open the team chat.');
  const roomId = project.chatRoomId || teamChatRoomId(project.id);
  const ref = doc(db, 'chat_rooms', roomId);
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists()) {
    await setDoc(ref, {
      id: roomId,
      type: 'GROUP',
      name: `${project.title} · team`.slice(0, 190),
      ownerId: project.ownerId === uid ? uid : project.ownerId,
      participants: project.memberIds.slice(0, 256),
      updatedAt: Date.now(),
      coeditProjectId: project.id,
    });
  } else {
    const have = new Set<string>((snap.data().participants as string[]) ?? []);
    const missing = project.memberIds.filter((m) => !have.has(m));
    if (missing.length) await updateDoc(ref, { participants: arrayUnion(...missing), updatedAt: Date.now() });
  }
  if (project.chatRoomId !== roomId) await updateDoc(projectRef(project.id), { chatRoomId: roomId }).catch(() => {});
  return roomId;
}

/** Stable, readable colour per collaborator (cursors, selection rings, avatars). */
export function personColor(uid: string): string {
  const palette = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595', '#748ffc', '#94d82d'];
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
