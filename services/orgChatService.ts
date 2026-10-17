// orgChatService — native chat workspaces for the Organization backbone.
//
// MIRRORS services/productionChatService.ts: every organization the user belongs to
// (business pages, churches, labels, clubs — one Organization primitive) gets a
// governed chat Space with derived channels living in the SAME `chat_rooms`
// collection ChatWindow already renders. No bridging, no new message plumbing —
// org channels are ChatRooms with `workspaceType: 'ORGANIZATION'`.
//
// Governance reuses the EXACT fields ChatWindow already enforces for productions:
// `postingPolicy: 'PRODUCTION_LEADS'` + `productionLeadUids` (here: the org's
// owner/admins/leads). #announcements is therefore read-only for regular members
// with zero new enforcement code.
//
// Elevate layout (auto-configured the moment an org is created — setupElevateOrg):
//   #announcements, #general                       → everyone in the org
//   one TEAM channel per department / ministry     → that department's people (+ org leads)
//   ROOMS = sub-chats under a department           → Media › Sunday production, Media › Graphics …
//     (Ministry.rooms; seeded per template, leaders add more in MinistryManager)
//   LEADERS rooms                                  → department heads + org leads only
// Membership changes (claim, role edit, department move) call syncOrgChatForUser so a person's seats
// always match their departments. Everything is idempotent: deterministic room ids + merge writes.

import {
  collection, doc, getDocs, onSnapshot, query, updateDoc, where, writeBatch, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import { isOrgOwner, permissionsForMember } from './orgPermissions';
import type { ChatRoom, Organization, OrgMembership, Ministry, MinistryRoom } from '../types';

export type OrgChannelKind = NonNullable<ChatRoom['orgChannelKind']>;

export interface OrgChannelBlueprint {
  key: string;
  name: string;
  description: string;
  kind: OrgChannelKind;
  /** For TEAM channels: the ministry / club-channel / team this room serves. */
  teamName?: string;
  /** For TEAM channels: the department (org.ministries[].id). */
  departmentId?: string;
  /** For ROOMS: the key of the department's main channel. */
  parentKey?: string;
  roomAudience?: 'DEPARTMENT' | 'LEADERS';
  postingPolicy: 'ALL_MEMBERS' | 'PRODUCTION_LEADS';
  reason: string;
}

const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
export const orgRoomId = (orgId: string, key: string) => `orgchat_${safe(orgId)}_${safe(key)}`;
export const classChatRoomId = (orgId: string, programId: string) => orgRoomId(orgId, `class-${programId}`);
export const deptChannelKey = (ministry: Pick<Ministry, 'id' | 'name'>) => `team-${safe(ministry.name)}`;
export const roomChannelKey = (ministry: Pick<Ministry, 'id' | 'name'>, room: Pick<MinistryRoom, 'id' | 'name'>) => `${deptChannelKey(ministry)}--${safe(room.name)}`;

const BASE_CHANNELS: OrgChannelBlueprint[] = [
  { key: 'announcements', name: 'Announcements', description: 'Official org-wide notices. Only owners and admins can post.', kind: 'ANNOUNCEMENTS', postingPolicy: 'PRODUCTION_LEADS', reason: 'Every org needs one authoritative broadcast lane.' },
  { key: 'general', name: 'General', description: 'Org-wide conversation and coordination.', kind: 'GENERAL', postingPolicy: 'ALL_MEMBERS', reason: 'Every org needs a shared room.' },
];

/** Default rooms a department is born with, by template (services/elevateTemplates). Leaders rename / add / remove. */
export const DEFAULT_DEPARTMENT_ROOMS: Record<string, Omit<MinistryRoom, 'id'>[]> = {
  finance:               [{ name: 'Counting team', audience: 'DEPARTMENT', description: 'Sunday count, deposits, batches.' }, { name: 'Leaders', audience: 'LEADERS', description: 'Budget and approvals — heads only.' }],
  media:                 [{ name: 'Sunday production', audience: 'DEPARTMENT', description: 'Run-of-show, slides, stream.' }, { name: 'Graphics & social', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  education:             [{ name: 'Teachers & Catechists', audience: 'DEPARTMENT', description: 'Curriculum planning, Sunday School & Academia classroom leads.' }, { name: 'Classrooms & Syllabus', audience: 'DEPARTMENT', description: 'Shared worksheets, Tela lessons & student progress.' }, { name: 'Leaders', audience: 'LEADERS' }],
  music:                 [{ name: 'Sunday Setlist & Rehearsal', audience: 'DEPARTMENT', description: 'Keys, BPMs, transitions & run-of-show.' }, { name: 'Chora Song Scratchpad', audience: 'DEPARTMENT', description: 'Hymn arrangements, chord charts & original songs.' }, { name: 'Leaders', audience: 'LEADERS' }],
  'music-worship-teams': [{ name: 'Vocalists & Worship Leaders', audience: 'DEPARTMENT', description: 'Lead assignments, harmonies & altar flow.' }, { name: 'Leaders', audience: 'LEADERS' }],
  'music-band':          [{ name: 'Rhythm, Keys & Horns', audience: 'DEPARTMENT', description: 'Charts, stems, click tracks & soundcheck.' }, { name: 'Leaders', audience: 'LEADERS' }],
  'music-choir':         [{ name: 'SATB Sectionals', audience: 'DEPARTMENT', description: 'Soprano, Alto, Tenor & Bass parts + robes/call times.' }, { name: 'Leaders', audience: 'LEADERS' }],
  'music-collective':    [{ name: 'Songwriters & Producers', audience: 'DEPARTMENT', description: 'Melos sessions, Chora lyric blocks & Tela songwriting.' }, { name: 'Leaders', audience: 'LEADERS' }],
  usher:                 [{ name: 'Sunday schedule', audience: 'DEPARTMENT', description: 'Who is on the door this week.' }, { name: 'Leaders', audience: 'LEADERS' }],
  youth:                 [{ name: 'Leaders & volunteers', audience: 'LEADERS', description: 'Adult leaders only.' }, { name: 'Events', audience: 'DEPARTMENT' }],
  women:                 [{ name: 'Events', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  men:                   [{ name: 'Events', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  deacons:               [{ name: 'Care visits', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  evangelism:            [{ name: 'Outreach days', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  seniors:               [{ name: 'Rides & visits', audience: 'DEPARTMENT' }],
  prayer:                [{ name: 'Urgent requests', audience: 'DEPARTMENT', description: 'Same-day prayer needs.' }],
  programs:              [{ name: 'Planning', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  volunteers:            [{ name: 'Schedule', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
  fundraising:           [{ name: 'Campaigns', audience: 'DEPARTMENT' }, { name: 'Leaders', audience: 'LEADERS' }],
};
const roomId = () => Math.random().toString(36).slice(2, 10);
/** Rooms a department should start with (its template's set, else one Leaders room). */
export function defaultRoomsFor(ministry: Pick<Ministry, 'templateKey' | 'kind'>): MinistryRoom[] {
  const seeds = (ministry.templateKey && DEFAULT_DEPARTMENT_ROOMS[ministry.templateKey]) || [{ name: 'Leaders', audience: 'LEADERS' as const }];
  return seeds.map(r => ({ id: roomId(), ...r }));
}
/** Give every department that has no rooms yet its default set (pure; used by setup + MinistryManager). */
export function withDefaultRooms(ministries: Ministry[]): Ministry[] {
  return ministries.map(m => (m.rooms && m.rooms.length ? m : { ...m, rooms: defaultRoomsFor(m) }));
}

/**
 * Derive the channel plan for an org: #announcements + #general always, plus one TEAM channel per
 * department / ministry the org declares (and a ROOM per Ministry.rooms entry), plus the org's club-style channels.
 */
export function deriveOrgChannels(org: Organization, _members: OrgMembership[] = []): OrgChannelBlueprint[] {
  const channels = [...BASE_CHANNELS];
  (org.ministries || []).forEach(ministry => {
    if (!ministry.name?.trim()) return;
    const key = deptChannelKey(ministry);
    channels.push({
      key, name: ministry.name,
      description: ministry.description || ministry.meetingTime || `${ministry.name} coordination`,
      kind: 'TEAM', teamName: ministry.name, departmentId: ministry.id,
      postingPolicy: 'ALL_MEMBERS',
      reason: `Ministry "${ministry.name}" declared on the org.`,
    });
    (ministry.rooms || []).forEach(room => {
      if (!room.name?.trim()) return;
      channels.push({
        key: roomChannelKey(ministry, room), name: room.name,
        description: room.description || `${ministry.name} › ${room.name}`,
        kind: 'TEAM', teamName: ministry.name, departmentId: ministry.id, parentKey: key,
        roomAudience: room.audience || 'DEPARTMENT',
        postingPolicy: 'ALL_MEMBERS',
        reason: `Room "${room.name}" inside "${ministry.name}".`,
      });
    });
  });
  (org.channels || []).forEach(clubChannel => {
    if (!clubChannel.name?.trim()) return;
    if (clubChannel.type === 'ANNOUNCEMENT') return; // #announcements already covers it
    channels.push({
      key: `team-${safe(clubChannel.name)}`,
      name: clubChannel.name,
      description: clubChannel.description || `${clubChannel.name} channel`,
      kind: 'TEAM',
      teamName: clubChannel.name,
      postingPolicy: clubChannel.isReadOnly ? 'PRODUCTION_LEADS' : 'ALL_MEMBERS',
      reason: `Club channel "${clubChannel.name}" declared on the org.`,
    });
  });
  return channels.filter((channel, index, all) => all.findIndex(row => row.key === channel.key) === index);
}

/** Uids allowed to post in leads-only channels: creator + admins + OWNER/ADMIN
 *  memberships + members explicitly granted MANAGE_EMPLOYEES/EDIT_PAGE. */
export function orgLeadUids(org: Organization, members: OrgMembership[]): string[] {
  const leads = new Set<string>([org.creatorId, ...(org.admins || [])]);
  members.filter(member => member.status === 'ACTIVE' && member.userId).forEach(member => {
    const perms = permissionsForMember(member);
    if (member.role === 'OWNER' || member.role === 'ADMIN' || perms.has('MANAGE_EMPLOYEES') || perms.has('EDIT_PAGE')) {
      leads.add(member.userId);
    }
  });
  return [...leads].filter(Boolean);
}

/** Department ids a membership belongs to: explicit ministryIds, ministryRoles, or being a head of it. */
export function memberDepartmentIds(org: Organization, m: OrgMembership): string[] {
  const ids = new Set<string>([...(m.ministryIds || []), ...(m.ministryRoles || []).map(r => r.ministryId)]);
  (org.ministries || []).forEach(x => { if (x.headUids?.includes(m.userId) || x.leaderId === m.userId) ids.add(x.id); });
  return [...ids];
}
const isDeptHead = (org: Organization, m: OrgMembership, deptId: string) => {
  const d = (org.ministries || []).find(x => x.id === deptId);
  return !!d && (d.headUids?.includes(m.userId) || d.leaderId === m.userId || (m.ministryRoles || []).some(r => r.ministryId === deptId && r.roleKey === 'DEPARTMENT_HEAD'));
};

/** Does this membership belong in this channel? (The rule every seat sync uses.) */
export function memberBelongsIn(org: Organization, channel: OrgChannelBlueprint, m: OrgMembership, leadUids: string[]): boolean {
  if (m.status !== 'ACTIVE' || !m.userId) return false;
  const lead = leadUids.includes(m.userId);
  if (!channel.departmentId) return true;                       // announcements / general / club channels
  if (lead) return true;                                        // org leads see every department
  const inDept = memberDepartmentIds(org, m).includes(channel.departmentId);
  if (!inDept) return false;
  if (channel.roomAudience === 'LEADERS') return isDeptHead(org, m, channel.departmentId);
  return true;
}

/** Participants for a channel. A department with nobody in it yet still gets the org leads, so it is never dead. */
export function participantsFor(org: Organization, channel: OrgChannelBlueprint, members: OrgMembership[], leadUids: string[]): string[] {
  const set = new Set<string>([org.creatorId, ...(org.admins || [])]);
  members.forEach(m => { if (memberBelongsIn(org, channel, m, leadUids)) set.add(m.userId); });
  return [...set].filter(Boolean);
}

export function canManageOrgChat(org: Organization, members: OrgMembership[], uid: string): boolean {
  if (isOrgOwner(uid, org)) return true;
  const membership = members.find(member => member.userId === uid && member.status === 'ACTIVE');
  if (!membership) return false;
  const perms = permissionsForMember(membership);
  return membership.role === 'OWNER' || membership.role === 'ADMIN' || perms.has('MANAGE_EMPLOYEES');
}

/**
 * Provision (or re-sync) the org's chat channels — the org-space mirror of
 * provisionProductionChat. Idempotent: rooms are keyed deterministically and
 * merged, and the org doc gets a `chatProvisionedAt` marker. Re-running after
 * departments / rooms / memberships change brings every seat list up to date.
 */
export async function provisionOrgChat(
  org: Organization,
  members: OrgMembership[],
  actorUid: string,
): Promise<OrgChannelBlueprint[]> {
  if (!canManageOrgChat(org, members, actorUid)) throw new Error('Only org owners and admins can set up the chat workspace.');
  const blueprints = deriveOrgChannels(org, members);
  const leadUids = orgLeadUids(org, members);
  const now = Date.now();
  // 500 writes per batch; each room is one write.
  for (let i = 0; i < blueprints.length; i += 450) {
    const batch = writeBatch(db);
    blueprints.slice(i, i + 450).forEach(channel => {
      const id = orgRoomId(org.id, channel.key);
      const room: ChatRoom = {
        id, participants: participantsFor(org, channel, members, leadUids), type: 'GROUP', name: channel.name, ownerId: org.creatorId, updatedAt: now,
        workspaceType: 'ORGANIZATION', orgId: org.id, orgName: org.name,
        orgChannelKey: channel.key, orgChannelKind: channel.kind,
        orgDepartmentId: channel.departmentId, orgParentChannelKey: channel.parentKey, orgRoomAudience: channel.roomAudience,
        channelDescription: channel.description,
        nibblesEnabled: false, postingPolicy: channel.postingPolicy, productionLeadUids: leadUids,
      };
      batch.set(doc(db, 'chat_rooms', id), JSON.parse(JSON.stringify(room)), { merge: true });
    });
    if (i === 0) batch.set(doc(db, 'organizations', org.id), { chatProvisionedAt: now, chatChannelKeys: blueprints.map(channel => channel.key), updatedAt: now }, { merge: true });
    await batch.commit();
  }
  return blueprints;
}

/** Re-sync after departments / rooms changed — only when the org's chat was already set up. */
export async function resyncOrgChatIfProvisioned(org: Organization, members: OrgMembership[], actorUid: string): Promise<void> {
  if (!org.chatProvisionedAt) return;
  if (!canManageOrgChat(org, members, actorUid)) return;
  await provisionOrgChat(org, members, actorUid).catch(() => {});
}

/**
 * Put ONE membership in exactly the channels it belongs to (and out of the ones it doesn't).
 * Used when a seat is provisioned, claimed, or its role / departments change. Rules let any current
 * participant edit a room's participants, so staff (who sit in every room as leads) can do this; the
 * server-side claim path does the same with admin credentials.
 */
export async function syncOrgChatForUser(org: Organization, m: OrgMembership, opts: { members?: OrgMembership[]; replaceUid?: string } = {}): Promise<void> {
  if (!org.chatProvisionedAt) return;
  const members = opts.members || [];
  const leadUids = orgLeadUids(org, members.length ? members : [m]);
  const blueprints = deriveOrgChannels(org, members);
  const updates: Promise<unknown>[] = [];
  blueprints.forEach(channel => {
    const ref = doc(db, 'chat_rooms', orgRoomId(org.id, channel.key));
    const belongs = memberBelongsIn(org, channel, m, leadUids);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (belongs) patch.participants = arrayUnion(m.userId);
    else patch.participants = arrayRemove(m.userId);
    updates.push(updateDoc(ref, patch).catch(() => { /* room may not exist yet — provisionOrgChat will seat them */ }));
    if (opts.replaceUid && opts.replaceUid !== m.userId) updates.push(updateDoc(ref, { participants: arrayRemove(opts.replaceUid) }).catch(() => {}));
  });
  await Promise.all(updates);
}

/** Add a room (sub-chat) to a department and return the new ministries list (caller saves + resyncs). */
export function addRoomToMinistry(ministries: Ministry[], ministryId: string, room: Omit<MinistryRoom, 'id'>): Ministry[] {
  return ministries.map(m => (m.id === ministryId ? { ...m, rooms: [...(m.rooms || []), { id: roomId(), ...room }] } : m));
}

/** Live channels of one org the user can see — modeled on subscribeProductionRooms. */
export function subscribeOrgRooms(orgId: string, uid: string, callback: (rooms: ChatRoom[]) => void): () => void {
  return onSnapshot(query(collection(db, 'chat_rooms'), where('participants', 'array-contains', uid)), snapshot => {
    callback(snapshot.docs
      .map(item => ({ id: item.id, ...item.data() } as ChatRoom))
      .filter(room => room.workspaceType === 'ORGANIZATION' && room.orgId === orgId)
      .sort((a, b) => (a.orgChannelKey || '').localeCompare(b.orgChannelKey || '')));
  });
}

/** All of an org's rooms (staff tooling: counts, seat audits). */
export async function fetchOrgRooms(orgId: string): Promise<ChatRoom[]> {
  const s = await getDocs(query(collection(db, 'chat_rooms'), where('orgId', '==', orgId), where('workspaceType', '==', 'ORGANIZATION')));
  return s.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom));
}

/** Group an org's rooms for the sidebar: top-level channels, then departments each with their rooms nested. */
export function groupOrgRooms(rooms: ChatRoom[]): { announcements: ChatRoom[]; channels: ChatRoom[]; departments: { id: string; name: string; main?: ChatRoom; rooms: ChatRoom[] }[] } {
  const announcements = rooms.filter(r => r.orgChannelKind === 'ANNOUNCEMENTS');
  const channels = rooms.filter(r => r.orgChannelKind === 'GENERAL' || !r.orgChannelKind);
  const teams = rooms.filter(r => r.orgChannelKind === 'TEAM');
  const byDept = new Map<string, { id: string; name: string; main?: ChatRoom; rooms: ChatRoom[] }>();
  teams.forEach(r => {
    const key = r.orgDepartmentId || r.orgChannelKey || r.id;
    const groupKey = r.orgParentChannelKey ? (teams.find(t => t.orgChannelKey === r.orgParentChannelKey)?.orgDepartmentId || r.orgParentChannelKey) : key;
    const g = byDept.get(groupKey) || { id: groupKey, name: r.orgParentChannelKey ? (teams.find(t => t.orgChannelKey === r.orgParentChannelKey)?.name || r.name || '') : (r.name || ''), rooms: [] };
    if (r.orgParentChannelKey) g.rooms.push(r); else { g.main = r; g.name = r.name || g.name; }
    byDept.set(groupKey, g);
  });
  const departments = [...byDept.values()].sort((a, b) => a.name.localeCompare(b.name));
  departments.forEach(d => d.rooms.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  return { announcements, channels, departments };
}

/** Touch helper used by staff tools after a membership is removed. */
export async function removeUserFromOrgChat(orgId: string, uid: string): Promise<void> {
  const rooms = await fetchOrgRooms(orgId).catch(() => [] as ChatRoom[]);
  await Promise.all(rooms.filter(r => r.participants.includes(uid)).map(r => updateDoc(doc(db, 'chat_rooms', r.id), { participants: arrayRemove(uid) }).catch(() => {})));
}

