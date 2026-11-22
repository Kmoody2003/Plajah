// Prayer Call — the pure rules for a church's instant live prayer room (no I/O, shared by the server
// route routes/prayerCall.ts, its tests, and the lab's fake backend).
//
// A Prayer Call is a cut-down conference: one live room per ministry/department, a camera + mic grid
// on LiveKit, an optional prayer-request list, and a hard 60-minute end. It belongs to the ministry
// page only: it is never a post, never in a feed, never broadcast. The server is the only writer of
// prayerCalls/{orgId__ministryId} (no client rules exist for it), so everything here is enforced there.
//
//   Faith orgs only           isFaithOrg(org.orgType)
//   Who can start             org owner/admins, pastoral roles (Senior Pastor, Pastor, Minister),
//                             this ministry's heads/admins, and roster staff serving in this ministry
//   Who can see / join        members of this ministry (memberDepartmentIds), plus anyone who may start one
//   Length                    60 minutes at most, measured from the server's own start time

import type { Ministry, Organization, OrgMembership } from '../../types';
import { isFaithOrg } from '../elevateTemplates';
import { getElevateRole, memberDepartmentIds, memberRoleKeys } from '../elevateRoles';
import { isOrgOwner } from '../orgPermissions';

export const PRAYER_CALL_MAX_MS = 60 * 60 * 1000;
/** First warning: five minutes left. */
export const PRAYER_CALL_WARN_MS = 5 * 60 * 1000;
/** Last warning: one minute left. */
export const PRAYER_CALL_FINAL_WARN_MS = 60 * 1000;
/** A prayer room, not a meeting: small enough that everyone stays on screen. */
export const PRAYER_CALL_CAP = 25;
export const PRAYER_REQUEST_MAX = 60;
export const PRAYER_REQUEST_CHARS = 280;
/** Someone counts as "in the room" while their client has checked in this recently. */
export const PRESENCE_STALE_MS = 45_000;

export type PrayerCallStatus = 'LIVE' | 'ENDED';
export type PrayerCallEndReason = 'TIME' | 'LEADER';

export interface PrayerRequest {
  id: string;
  uid: string;
  name: string;
  text: string;
  at: number;
  /** Leaders mark a request prayed over; it stays on the list, greyed. */
  prayed?: boolean;
}

export interface PrayerCallDoc {
  key: string;
  /** Fresh per call; the LiveKit room is pc.<callId> so an old token never opens a new call. */
  callId: string;
  orgId: string;
  ministryId: string;
  ministryName: string;
  status: PrayerCallStatus;
  title: string;
  startedBy: string;
  startedByName: string;
  startedAt: number;
  endsAt: number;
  endedAt?: number;
  endedBy?: string;
  endReason?: PrayerCallEndReason;
  removedUids: string[];
  requestsOn: boolean;
  requests: PrayerRequest[];
  present: Record<string, { name: string; lastSeen: number }>;
}

type MemberLike = Pick<OrgMembership, 'role' | 'permissions' | 'userId' | 'status'> &
  Partial<Pick<OrgMembership, 'roleKey' | 'roleKeys' | 'ministryRoles' | 'ministryIds' | 'protectedRoles'>>;
type OrgLike = Pick<Organization, 'id' | 'orgType' | 'creatorId' | 'admins' | 'ministries'> & Partial<Pick<Organization, 'itAdminUids' | 'name'>>;

export const callKey = (orgId: string, ministryId: string) => `${orgId}__${ministryId}`;
export const roomNameFor = (callId: string) => `pc.${callId}`;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const validId = (s: unknown): s is string => typeof s === 'string' && ID_RE.test(s);

export function findMinistry(org: OrgLike | null | undefined, ministryId: string): Ministry | null {
  return org?.ministries?.find(m => m.id === ministryId) || null;
}

const active = (m: MemberLike | null | undefined): m is MemberLike => !!m && m.status === 'ACTIVE';

/** Holds a pastoral role (Senior Pastor, Pastor, Minister) on an active membership. */
export function isPastor(member: MemberLike | null | undefined): boolean {
  return active(member) && memberRoleKeys(member).some(k => !!getElevateRole(k)?.isPastoral);
}

/** Head or administrator of THIS ministry. */
export function leadsMinistry(member: MemberLike | null | undefined, ministry: Ministry): boolean {
  if (!active(member)) return false;
  if ((ministry.headUids || []).includes(member.userId) || ministry.leaderId === member.userId) return true;
  return (member.ministryRoles || []).some(r => r.ministryId === ministry.id && (r.roleKey === 'DEPARTMENT_HEAD' || r.roleKey === 'DEPARTMENT_ADMIN'));
}

/** Roster staff (STAFF role or paid-staff role key) who serve in THIS ministry. */
export function isMinistryStaff(member: MemberLike | null | undefined, org: OrgLike, ministry: Ministry): boolean {
  if (!active(member)) return false;
  const staff = member.role === 'STAFF' || member.role === 'ADMIN' || memberRoleKeys(member).some(k => getElevateRole(k)?.rosterGroup === 'STAFF');
  return staff && memberDepartmentIds(member, org).includes(ministry.id);
}

export type Refusal = 'NOT_FAITH_ORG' | 'NO_MINISTRY' | 'NOT_LEADER' | 'NOT_MEMBER' | 'REMOVED' | 'ENDED' | 'NO_CALL';

export interface Decision { ok: boolean; reason?: Refusal; message?: string }
const no = (reason: Refusal, message: string): Decision => ({ ok: false, reason, message });
const yes: Decision = { ok: true };

/** May this person start (and run: end, remove, manage requests) a Prayer Call in this ministry? */
export function canLeadPrayerCall(uid: string, member: MemberLike | null | undefined, org: OrgLike | null | undefined, ministryId: string): Decision {
  if (!org || !isFaithOrg(org.orgType)) return no('NOT_FAITH_ORG', 'Prayer Call is for churches and faith communities.');
  const ministry = findMinistry(org, ministryId);
  if (!ministry) return no('NO_MINISTRY', 'That ministry no longer exists.');
  if (isOrgOwner(uid, org)) return yes;
  if (member && member.userId !== uid) return no('NOT_LEADER', 'Only church leaders can start a Prayer Call.');
  if (isPastor(member) || leadsMinistry(member, ministry) || isMinistryStaff(member, org, ministry)) return yes;
  return no('NOT_LEADER', 'Only pastors, this ministry’s leaders and its staff can start a Prayer Call.');
}

/** May this person see that a call is live and join it? Members of the ministry, and its leaders. */
export function canJoinPrayerCall(uid: string, member: MemberLike | null | undefined, org: OrgLike | null | undefined, ministryId: string): Decision {
  const lead = canLeadPrayerCall(uid, member, org, ministryId);
  if (lead.ok || lead.reason === 'NOT_FAITH_ORG' || lead.reason === 'NO_MINISTRY') return lead;
  if (active(member) && member.userId === uid && memberDepartmentIds(member, org).includes(ministryId)) return yes;
  return no('NOT_MEMBER', 'Prayer Call is open to members of this ministry.');
}

/** Has the call run out of time (or been ended)? */
export function isOver(call: PrayerCallDoc | null | undefined, now: number): boolean {
  return !call || call.status !== 'LIVE' || now >= call.endsAt;
}

export function msLeft(call: Pick<PrayerCallDoc, 'endsAt'>, now: number): number {
  return Math.max(0, call.endsAt - now);
}

export type WarningLevel = 'none' | 'soon' | 'final';
export function warningLevel(leftMs: number): WarningLevel {
  if (leftMs <= PRAYER_CALL_FINAL_WARN_MS) return 'final';
  if (leftMs <= PRAYER_CALL_WARN_MS) return 'soon';
  return 'none';
}

/** mm:ss (or h:mm:ss) for the countdown. */
export function formatLeft(leftMs: number): string {
  const s = Math.max(0, Math.ceil(leftMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const cleanName = (s: unknown) => clean(s, 80) || 'Member';

/** "Youth Ministry Prayer Call", but "Intercessory Prayer Call" (no doubled word). */
export function defaultTitle(ministryName: string): string {
  const n = clean(ministryName, 100);
  return /(^|\s)prayer$/i.test(n) ? `${n} Call` : `${n} Prayer Call`;
}

/**
 * A new call. `minutes` lets a leader pick a shorter call; it is clamped to 5–60 so the server's
 * 60-minute ceiling can never be raised from the client.
 */
export function newCall(input: {
  org: OrgLike; ministry: Ministry; uid: string; name: string; now: number; callId: string;
  title?: string; minutes?: number; requestsOn?: boolean;
}): PrayerCallDoc {
  const minutes = Math.min(60, Math.max(5, Math.round(Number(input.minutes) || 60)));
  return {
    key: callKey(input.org.id, input.ministry.id),
    callId: input.callId,
    orgId: input.org.id,
    ministryId: input.ministry.id,
    ministryName: clean(input.ministry.name, 120),
    status: 'LIVE',
    title: clean(input.title, 120) || defaultTitle(input.ministry.name),
    startedBy: input.uid,
    startedByName: cleanName(input.name),
    startedAt: input.now,
    endsAt: input.now + Math.min(minutes * 60_000, PRAYER_CALL_MAX_MS),
    removedUids: [],
    requestsOn: input.requestsOn !== false,
    requests: [],
    present: { [input.uid]: { name: cleanName(input.name), lastSeen: input.now } },
  };
}

export function endCall(call: PrayerCallDoc, now: number, reason: PrayerCallEndReason, by?: string): PrayerCallDoc {
  if (call.status === 'ENDED') return call;
  return { ...call, status: 'ENDED', endedAt: Math.min(now, call.endsAt), endReason: reason, ...(by ? { endedBy: by } : {}), present: {} };
}

/** Checks in (heartbeat) — returns the updated presence map. */
export function touchPresence(call: PrayerCallDoc, uid: string, name: string, now: number): PrayerCallDoc['present'] {
  const out: PrayerCallDoc['present'] = {};
  for (const [id, p] of Object.entries(call.present || {})) if (now - p.lastSeen < PRESENCE_STALE_MS) out[id] = p;
  out[uid] = { name: cleanName(name), lastSeen: now };
  return out;
}

export function dropPresence(call: PrayerCallDoc, uid: string): PrayerCallDoc['present'] {
  const out = { ...(call.present || {}) };
  delete out[uid];
  return out;
}

export function addRequest(call: PrayerCallDoc, req: { id: string; uid: string; name: string; text: string; now: number }): { call: PrayerCallDoc; error?: string } {
  if (!call.requestsOn) return { call, error: 'The prayer-request list is off for this call.' };
  const text = clean(req.text, PRAYER_REQUEST_CHARS);
  if (!text) return { call, error: 'Write a short prayer request first.' };
  if (call.requests.length >= PRAYER_REQUEST_MAX) return { call, error: 'The prayer list is full for this call.' };
  const mine = call.requests.filter(r => r.uid === req.uid).length;
  if (mine >= 5) return { call, error: 'You can share up to five requests in one call.' };
  return { call: { ...call, requests: [...call.requests, { id: req.id, uid: req.uid, name: cleanName(req.name), text, at: req.now }] } };
}

/** Leaders can mark/unmark prayed or delete any request; members can delete their own. */
export function editRequest(call: PrayerCallDoc, id: string, op: 'prayed' | 'unprayed' | 'delete', uid: string, isLeader: boolean): { call: PrayerCallDoc; error?: string } {
  const r = call.requests.find(x => x.id === id);
  if (!r) return { call, error: 'That request is gone.' };
  if (op === 'delete') {
    if (!isLeader && r.uid !== uid) return { call, error: 'Only a leader or the person who shared it can remove a request.' };
    return { call: { ...call, requests: call.requests.filter(x => x.id !== id) } };
  }
  if (!isLeader) return { call, error: 'Only a leader can mark requests prayed over.' };
  return { call: { ...call, requests: call.requests.map(x => (x.id === id ? { ...x, prayed: op === 'prayed' } : x)) } };
}

/** What a member's client sees. Never includes other ministries or anything outside this call. */
export interface PrayerCallView {
  key: string;
  callId: string;
  orgId: string;
  ministryId: string;
  ministryName: string;
  title: string;
  status: PrayerCallStatus;
  startedBy: string;
  startedByName: string;
  startedAt: number;
  endsAt: number;
  endedAt?: number;
  endReason?: PrayerCallEndReason;
  serverNow: number;
  requestsOn: boolean;
  requests: PrayerRequest[];
  present: Array<{ uid: string; name: string }>;
  /** This viewer may end the call, remove people and manage requests. */
  youLead: boolean;
  removed: boolean;
}

export function viewFor(call: PrayerCallDoc, uid: string, youLead: boolean, now: number): PrayerCallView {
  return {
    key: call.key, callId: call.callId, orgId: call.orgId, ministryId: call.ministryId, ministryName: call.ministryName,
    title: call.title, status: isOver(call, now) ? 'ENDED' : 'LIVE',
    startedBy: call.startedBy, startedByName: call.startedByName, startedAt: call.startedAt, endsAt: call.endsAt,
    ...(call.endedAt ? { endedAt: call.endedAt } : {}), ...(call.endReason ? { endReason: call.endReason } : {}),
    serverNow: now, requestsOn: call.requestsOn, requests: call.requests,
    present: Object.entries(call.present || {}).filter(([, p]) => now - p.lastSeen < PRESENCE_STALE_MS).map(([id, p]) => ({ uid: id, name: p.name })),
    youLead, removed: call.removedUids.includes(uid),
  };
}
