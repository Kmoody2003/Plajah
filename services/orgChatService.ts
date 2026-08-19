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

import {
  collection, doc, onSnapshot, query, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { isOrgOwner, permissionsForMember } from './orgPermissions';
import type { ChatRoom, Organization, OrgMembership } from '../types';

export type OrgChannelKind = NonNullable<ChatRoom['orgChannelKind']>;

export interface OrgChannelBlueprint {
  key: string;
  name: string;
  description: string;
  kind: OrgChannelKind;
  /** For TEAM channels: the ministry / club-channel / team this room serves. */
  teamName?: string;
  postingPolicy: 'ALL_MEMBERS' | 'PRODUCTION_LEADS';
  reason: string;
}

const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
export const orgRoomId = (orgId: string, key: string) => `orgchat_${safe(orgId)}_${safe(key)}`;

const BASE_CHANNELS: OrgChannelBlueprint[] = [
  { key: 'announcements', name: 'Announcements', description: 'Official org-wide notices. Only owners and admins can post.', kind: 'ANNOUNCEMENTS', postingPolicy: 'PRODUCTION_LEADS', reason: 'Every org needs one authoritative broadcast lane.' },
  { key: 'general', name: 'General', description: 'Org-wide conversation and coordination.', kind: 'GENERAL', postingPolicy: 'ALL_MEMBERS', reason: 'Every org needs a shared room.' },
];

/**
 * Derive the channel plan for an org: #announcements + #general always, plus one
 * TEAM channel per sub-unit the org model actually declares — church ministries
 * and the org's club-style channels. (The Organization model has no generic
 * "department" field; roleDefs are roles, not teams, so they don't spawn rooms.)
 */
export function deriveOrgChannels(org: Organization, _members: OrgMembership[] = []): OrgChannelBlueprint[] {
  const channels = [...BASE_CHANNELS];
  (org.ministries || []).forEach(ministry => {
    if (!ministry.name?.trim()) return;
    channels.push({
      key: `team-${safe(ministry.name)}`,
      name: ministry.name,
      description: ministry.description || ministry.meetingTime || `${ministry.name} coordination`,
      kind: 'TEAM',
      teamName: ministry.name,
      postingPolicy: 'ALL_MEMBERS',
      reason: `Ministry "${ministry.name}" declared on the org.`,
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
 * merged, and the org doc gets a `chatProvisionedAt` marker.
 */
export async function provisionOrgChat(
  org: Organization,
  members: OrgMembership[],
  actorUid: string,
): Promise<OrgChannelBlueprint[]> {
  if (!canManageOrgChat(org, members, actorUid)) throw new Error('Only org owners and admins can set up the chat workspace.');
  const blueprints = deriveOrgChannels(org, members);
  const participants = Array.from(new Set([
    org.creatorId,
    ...(org.admins || []),
    ...members.filter(member => member.status === 'ACTIVE' && member.userId).map(member => member.userId),
  ])).filter(Boolean);
  const leadUids = orgLeadUids(org, members);
  const batch = writeBatch(db);
  const now = Date.now();
  blueprints.forEach(channel => {
    const id = orgRoomId(org.id, channel.key);
    const room: ChatRoom = {
      id, participants, type: 'GROUP', name: channel.name, ownerId: org.creatorId, updatedAt: now,
      workspaceType: 'ORGANIZATION', orgId: org.id, orgName: org.name,
      orgChannelKey: channel.key, orgChannelKind: channel.kind,
      channelDescription: channel.description,
      nibblesEnabled: false, postingPolicy: channel.postingPolicy, productionLeadUids: leadUids,
    };
    batch.set(doc(db, 'chat_rooms', id), JSON.parse(JSON.stringify(room)), { merge: true });
  });
  batch.set(doc(db, 'organizations', org.id), { chatProvisionedAt: now, chatChannelKeys: blueprints.map(channel => channel.key), updatedAt: now }, { merge: true });
  await batch.commit();
  return blueprints;
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
