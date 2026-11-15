// Org media audiences — the pure rules shared by routes/orgMedia.ts, its tests and the client.
//
// Any organization (church, school, business, club) publishes media as itself — on Reello, Lorea or
// Chora — and every item says who it is for:
//   PUBLIC      anyone (plays from a public Mux playback id)
//   ORG         the org's active members, staff and leaders
//   DEPARTMENT  one department (org.ministries id): its members, its heads, and whole-org admins
//   CLASS       one class: its teachers and enrolled students, its department's members, whole-org admins
// Internal items (everything but PUBLIC) use SIGNED Mux playback: the server mints a short-lived token only
// after checking the viewer against these rules, so a shared link stops working for anyone outside.
//
// Who may publish: whole-org admins for any audience; department members/heads for their department (and
// its classes); a class's teachers for that class.

import { canPostToDepartment, postableDepartmentIds, postsForWholeOrg } from '../reello/orgChannelsCore';

export type OrgMediaAudience = 'PUBLIC' | 'ORG' | 'DEPARTMENT' | 'CLASS';
export type OrgMediaApp = 'reello' | 'lorea' | 'chora';
export const ORG_MEDIA_AUDIENCES: OrgMediaAudience[] = ['PUBLIC', 'ORG', 'DEPARTMENT', 'CLASS'];
export const ORG_MEDIA_APPS: OrgMediaApp[] = ['reello', 'lorea', 'chora'];

export interface OrgMediaTarget {
  orgId: string;
  audience: OrgMediaAudience;
  departmentId?: string;
  classId?: string;
}

export interface OrgMediaRecord extends OrgMediaTarget {
  id: string;
  app: OrgMediaApp;
  kind: 'video' | 'audio' | 'document';
  title: string;
  /** Playlist the item belongs to (e.g. the class name). Items without one sit in "Uploads". */
  playlist?: string;
  ownerUid: string;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERRORED' | 'DELETED';
  muxUploadId?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
  playbackPolicy: 'public' | 'signed';
  durationSec?: number;
  source?: 'class-live' | 'upload';
  createdAt: number;
  updatedAt: number;
}

type Org = Record<string, any>;
type Membership = Record<string, any> | null | undefined;
/** The class an item belongs to (Christian Ed churchPrograms today; any roster-shaped class later). */
export interface ClassRef { departmentId?: string; teacherUids?: string[]; studentUids?: string[]; createdBy?: string; orgId?: string }

export interface AccessCtx { org: Org | null; membership: Membership; cls?: ClassRef | null }

const activeMember = (m: Membership) => m?.status === 'ACTIVE';
/** Staff-style lists on the org doc that count as "inside the org" even without a membership row. */
function orgInsider(uid: string, org: Org): boolean {
  return ['admins', 'staffUids', 'pastorUids', 'leaderUids', 'itAdminUids'].some(k => Array.isArray(org[k]) && org[k].includes(uid));
}
function inDepartment(uid: string, org: Org, membership: Membership, departmentId?: string): boolean {
  if (!departmentId) return false;
  if (canPostToDepartment(uid, org, membership, departmentId)) return true;
  const deptUids = (org.departmentUids || {})[departmentId];
  return Array.isArray(deptUids) && deptUids.includes(uid);
}
function teachesClass(uid: string, cls: ClassRef | null | undefined): boolean {
  return !!cls && (cls.createdBy === uid || (cls.teacherUids || []).includes(uid));
}

/** May this person watch / read the item? */
export function canViewOrgMedia(uid: string, rec: OrgMediaTarget, ctx: AccessCtx): boolean {
  if (rec.audience === 'PUBLIC') return true;
  const { org, membership, cls } = ctx;
  if (!uid || !org) return false;
  if (postsForWholeOrg(uid, org, membership)) return true;
  switch (rec.audience) {
    case 'ORG':
      return activeMember(membership) || orgInsider(uid, org) || postableDepartmentIds(uid, org, membership).length > 0;
    case 'DEPARTMENT':
      return inDepartment(uid, org, membership, rec.departmentId);
    case 'CLASS':
      if (!cls || (cls.orgId && cls.orgId !== rec.orgId)) return false;
      return teachesClass(uid, cls) || (cls.studentUids || []).includes(uid) || inDepartment(uid, org, membership, cls.departmentId || rec.departmentId);
    default:
      return false;
  }
}

/** May this person publish to that audience? */
export function canPublishOrgMedia(uid: string, target: OrgMediaTarget, ctx: AccessCtx): boolean {
  const { org, membership, cls } = ctx;
  if (!uid || !org) return false;
  if (postsForWholeOrg(uid, org, membership)) return true;
  switch (target.audience) {
    case 'PUBLIC':
    case 'ORG':
      return false;
    case 'DEPARTMENT':
      return !!target.departmentId && canPostToDepartment(uid, org, membership, target.departmentId);
    case 'CLASS':
      if (!cls || (cls.orgId && cls.orgId !== target.orgId)) return false;
      return teachesClass(uid, cls) || (!!cls.departmentId && canPostToDepartment(uid, org, membership, cls.departmentId));
    default:
      return false;
  }
}

/** Validate and normalize a publish request body. Returns an error string or the clean target. */
export function parseTarget(body: Record<string, any>): OrgMediaTarget | string {
  const id = (v: unknown) => (typeof v === 'string' && v && v.length <= 128 && !/[\/]/.test(v) ? v : undefined);
  const orgId = id(body.orgId);
  if (!orgId) return 'Missing orgId.';
  const audience = body.audience as OrgMediaAudience;
  if (!ORG_MEDIA_AUDIENCES.includes(audience)) return 'Unknown audience.';
  const departmentId = id(body.departmentId);
  const classId = id(body.classId);
  if (audience === 'DEPARTMENT' && !departmentId) return 'Pick a department.';
  if (audience === 'CLASS' && !classId) return 'Pick a class.';
  return { orgId, audience, ...(departmentId ? { departmentId } : {}), ...(classId ? { classId } : {}) };
}

/** Does an item belong in a listing scoped to (departmentId?, classId?)? */
export function inScope(rec: OrgMediaTarget, scope: { departmentId?: string; classId?: string }): boolean {
  if (scope.classId) return rec.classId === scope.classId;
  if (scope.departmentId) return rec.departmentId === scope.departmentId;
  return true;
}

/** Group items into playlists (newest item first in each; playlists by newest item). */
export function groupPlaylists<T extends { playlist?: string; createdAt: number }>(items: T[]): { name: string; items: T[] }[] {
  const by = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => b.createdAt - a.createdAt)) {
    const name = (it.playlist || '').trim() || 'Uploads';
    if (!by.has(name)) by.set(name, []);
    by.get(name)!.push(it);
  }
  return [...by.entries()].map(([name, list]) => ({ name, items: list }));
}

/** A record as clients may see it (never the upload id or asset id). */
export function publicView(rec: OrgMediaRecord) {
  return {
    id: rec.id, orgId: rec.orgId, audience: rec.audience, departmentId: rec.departmentId, classId: rec.classId,
    app: rec.app, kind: rec.kind, title: rec.title, playlist: rec.playlist, ownerUid: rec.ownerUid, status: rec.status,
    playbackPolicy: rec.playbackPolicy, durationSec: rec.durationSec, source: rec.source, createdAt: rec.createdAt,
    // Public items can be played straight away; signed ones need GET /:id/play.
    ...(rec.playbackPolicy === 'public' && rec.muxPlaybackId ? { muxPlaybackId: rec.muxPlaybackId } : {}),
  };
}
