// services/coedit/project.ts — who can work on a shared creative project, and its team chat.
//
// A project becomes shared the first time its owner invites someone. Membership lives on one doc in
// the plajah-ops database, so its rules need nothing from plajah-prod:
//
//   coedit/{projectId}            owner, members {uid: role}, memberIds, names, photos, chatRoomId…
//
// projectId is the creative-cloud id (`${kind}__${localId}`), so the owner's personal cloud copy and
// version history (services/creativeCloud) and the shared project line up. The team chat is an
// ordinary chat_rooms GROUP room, so it also shows up in everyone's Chat list and reuses the whole
// platform chat stack (reactions, voice notes, threads, calls).

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
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
  orgId?: string;
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
      .filter((p) => p.ownerId !== uid && (!kind || p.kind === kind))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function me(): CoPerson | null {
  const u = auth.currentUser;
  return u ? { uid: u.uid, name: u.displayName || 'Me', photo: u.photoURL } : null;
}

/** Makes (or returns) the shared project for a doc the signed-in user owns. */
export async function ensureCoProject(input: { kind: string; localId: string; title: string; orgId?: string }): Promise<CoProject> {
  const owner = me();
  if (!owner) throw new Error('Sign in to share this project.');
  const id = coProjectId(input.kind, input.localId);
  const existing = await getCoProject(id);
  if (existing) return existing;
  const now = Date.now();
  const p: CoProject = {
    id,
    kind: input.kind,
    localId: input.localId,
    title: input.title || 'Untitled',
    ownerId: owner.uid,
    members: { [owner.uid]: 'owner' },
    memberIds: [owner.uid],
    names: { [owner.uid]: owner.name },
    ...(owner.photo ? { photos: { [owner.uid]: owner.photo } } : {}),
    ...(input.orgId ? { orgId: input.orgId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(projectRef(id), p);
  return p;
}

/** Invites people (or changes their role). Keeps the team chat's participants in step. */
export async function addMembers(project: CoProject, people: CoPerson[], role: Exclude<CoRole, 'owner'>): Promise<void> {
  if (!people.length) return;
  const patch: Record<string, unknown> = { updatedAt: Date.now(), memberIds: arrayUnion(...people.map((p) => p.uid)) };
  for (const p of people) {
    patch[`members.${p.uid}`] = role;
    patch[`names.${p.uid}`] = p.name || 'Collaborator';
    if (p.photo) patch[`photos.${p.uid}`] = p.photo;
  }
  await updateDoc(projectRef(project.id), patch);
  const memberIds = [...new Set([...project.memberIds, ...people.map((p) => p.uid)])];
  await syncTeamChat({ ...project, memberIds }).catch((e) => console.warn('[coedit] team chat sync failed', e));
}

export async function setRole(project: CoProject, uid: string, role: Exclude<CoRole, 'owner'>) {
  if (uid === project.ownerId) return;
  await updateDoc(projectRef(project.id), { [`members.${uid}`]: role, updatedAt: Date.now() });
}

/** Removes someone (owner), or leaves (anyone but the owner). */
export async function removeMember(project: CoProject, uid: string) {
  if (uid === project.ownerId) return;
  await updateDoc(projectRef(project.id), {
    [`members.${uid}`]: deleteField(),
    [`names.${uid}`]: deleteField(),
    [`photos.${uid}`]: deleteField(),
    memberIds: arrayRemove(uid),
    updatedAt: Date.now(),
  });
  if (project.chatRoomId) {
    await updateDoc(doc(db, 'chat_rooms', project.chatRoomId), { participants: arrayRemove(uid), updatedAt: Date.now() }).catch(() => {});
  }
}

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
