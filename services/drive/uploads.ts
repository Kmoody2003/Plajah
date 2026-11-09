// services/drive/uploads.ts — a Drive upload from "may I?" to a file record. SERVER ONLY.
//
//   begin     → who may upload where, quota check (allocation.checkUpload), RESERVE the bytes,
//               then a signed single PUT (size + type pinned) or a multipart upload id
//   parts     → signed links for the parts the browser is about to send (resumable)
//   complete  → finish multipart, HEAD the object for its TRUE size (never the client's number),
//               write the file record, move the reservation into usage
//   abort     → drop the object/parts, release the reservation
// Reservations stop parallel uploads from overshooting a quota together, and expire on their own
// after 24 h so an abandoned upload never holds space. Usage docs are read-modify-write; two
// uploads finishing in the same instant can race by one file — bounded, and the nightly recount
// (creativeStorage-style) corrects it. Every dependency is injected; tests run on fakes.

import { checkUpload, orgPoolBytes, personalAllowance, quotaState, usedBytes, type OrgPool, type PersonalAccount, type Usage } from './allocation';
import { driveKey, planUpload, MAX_PARTS } from './transfers';
import type { DrivePlan } from './plans';
import { abortMultipart, completeMultipart, createMultipart, deleteObjectServer, headSize, partUrl, putUrl, type S3Config } from '../objectStore/s3ops';

type Doc = Record<string, any>;
type Fetch = typeof fetch;

export interface DriveStore {
  get(path: string): Promise<Doc | null>;
  set(path: string, data: Doc): Promise<boolean>;
}

export type OrgAccess = 'admin' | 'staff' | null;

export interface UploadDeps {
  store: DriveStore;
  s3: () => S3Config | null;
  fetch?: Fetch;
  personal: (uid: string) => Promise<PersonalAccount>;
  orgPool: (orgId: string) => Promise<OrgPool | null>;
  /** admin = owner / org admin / IT admin (any department); staff = may upload to own departments. */
  orgAccess: (uid: string, orgId: string) => Promise<OrgAccess>;
  inDepartment: (uid: string, orgId: string, departmentId: string) => Promise<boolean>;
  now: () => number;
  newId: () => string;
  /** Fire-and-forget after a file lands (malware scan, thumbnails). */
  onUploaded?: (file: Doc) => void;
}

export class DriveError extends Error {
  constructor(public code: string, msg: string, public status = 400) { super(msg); }
}

export const RESERVATION_TTL_MS = 24 * 3600_000;
const PART_BATCH = 100;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MIME_RE = /^[\w.+-]{1,40}\/[\w.+-]{1,80}$/;
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\u0000-\u001f\u007f/\\]/;

export type Scope = { kind: 'u' } | { kind: 'o'; orgId: string; departmentId?: string };

interface UsageDoc extends Usage {
  reservations?: Record<string, { bytes: number; at: number; uid: string; dept?: string }>;
  members?: Record<string, number>;
  departments?: Record<string, number>;
}

const usagePath = (owner: { kind: 'u' | 'o'; id: string }) => `driveUsage/${owner.kind}_${owner.id}`;

function liveReservations(u: UsageDoc, now: number) {
  return Object.entries(u.reservations ?? {}).filter(([, r]) => now - r.at < RESERVATION_TTL_MS);
}

interface Resolved {
  owner: { kind: 'u' | 'o'; id: string };
  plan: DrivePlan;
  allowance: number;
  pool?: OrgPool;
  departmentId?: string;
}

async function resolve(uid: string, scope: Scope, deps: UploadDeps): Promise<Resolved> {
  if (scope.kind === 'u') {
    const acct = await deps.personal(uid);
    return { owner: { kind: 'u', id: uid }, plan: acct.plan, allowance: personalAllowance(acct) };
  }
  if (!ID_RE.test(scope.orgId)) throw new DriveError('bad_scope', 'Unknown organization');
  const access = await deps.orgAccess(uid, scope.orgId);
  if (!access) throw new DriveError('forbidden', 'You can’t add files to this organization’s Drive.', 403);
  const dept = scope.departmentId;
  if (dept !== undefined && !ID_RE.test(dept) && !/^[\w-]{1,64}$/.test(dept)) throw new DriveError('bad_scope', 'Unknown department');
  // Staff upload only into departments they belong to (org permission model); admins anywhere.
  if (access === 'staff' && (!dept || !(await deps.inDepartment(uid, scope.orgId, dept)))) {
    throw new DriveError('forbidden', 'You can only add files to your own department.', 403);
  }
  const pool = await deps.orgPool(scope.orgId);
  if (!pool) throw new DriveError('no_pool', 'This organization has no Drive storage yet.', 402);
  return { owner: { kind: 'o', id: scope.orgId }, plan: pool.plan ?? 'all_access', allowance: orgPoolBytes(pool), pool, departmentId: dept };
}

export interface BeginInput { scope: Scope; name: string; size: number; mime: string; parentId?: string }

export type BeginResult =
  | { uploadId: string; fileId: string; mode: 'single'; url: string; headers: Record<string, string>; expiresAt: number }
  | { uploadId: string; fileId: string; mode: 'multipart'; partSize: number; parts: number };

export async function beginUpload(uid: string, input: BeginInput, deps: UploadDeps): Promise<BeginResult> {
  const cfg = deps.s3();
  if (!cfg) throw new DriveError('not_configured', 'Drive storage isn’t set up on this server.', 503);
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 255 || BAD_NAME.test(name)) throw new DriveError('bad_name', 'File names can be 1–255 characters, without slashes.');
  if (!MIME_RE.test(String(input.mime))) throw new DriveError('bad_type', 'Unknown file type.');
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new DriveError('bad_size', 'Unknown file size.');
  if (input.parentId !== undefined && !ID_RE.test(input.parentId)) throw new DriveError('bad_parent', 'Unknown folder.');

  const now = deps.now();
  const r = await resolve(uid, input.scope, deps);
  const path = usagePath(r.owner);
  const usage = ((await deps.store.get(path)) ?? { liveBytes: 0, trashBytes: 0 }) as UsageDoc;
  const live = liveReservations(usage, now);
  const reserved = live.reduce((t, [, x]) => t + x.bytes, 0);
  const memberReserved = live.filter(([, x]) => x.uid === uid).reduce((t, [, x]) => t + x.bytes, 0);
  const deptReserved = r.departmentId ? live.filter(([, x]) => x.dept === r.departmentId).reduce((t, [, x]) => t + x.bytes, 0) : 0;

  const check = checkUpload({
    size: input.size, plan: r.plan, allowance: r.allowance, now,
    usage: { liveBytes: usage.liveBytes + reserved, trashBytes: usage.trashBytes, overSince: usage.overSince },
    member: r.pool ? { used: (usage.members?.[uid] ?? 0) + memberReserved, cap: r.pool.memberCaps[uid] } : undefined,
    department: r.pool && r.departmentId ? { used: (usage.departments?.[r.departmentId] ?? 0) + deptReserved, cap: r.pool.departmentCaps[r.departmentId] } : undefined,
  });
  if (!check.ok) {
    const msg: Record<string, string> = {
      too_large: 'That file is larger than your plan allows in one upload.',
      over_quota: 'Your Drive is full. Free up space or add storage to keep uploading.',
      department_cap: 'This department has used its share of the organization’s storage.',
      member_cap: 'You’ve used your share of the organization’s storage.',
    };
    throw new DriveError(check.reason, msg[check.reason], 413);
  }

  const uploadId = deps.newId(), fileId = deps.newId();
  const key = driveKey(r.owner, fileId, 1);
  const plan = planUpload(input.size);
  let multipartId: string | undefined;
  if (plan.mode === 'multipart') multipartId = await createMultipart(cfg, key, input.mime, deps.fetch);

  // Reserve before handing out the link: a parallel upload now sees these bytes as taken.
  const reservations = Object.fromEntries(live);
  reservations[uploadId] = { bytes: input.size, at: now, uid, ...(r.departmentId ? { dept: r.departmentId } : {}) };
  await deps.store.set(path, { ...usage, reservations });
  await deps.store.set(`driveUploads/${uploadId}`, {
    uid, owner: r.owner, fileId, key, name, mime: input.mime, size: input.size, parentId: input.parentId ?? null,
    departmentId: r.departmentId ?? null, mode: plan.mode, multipartId: multipartId ?? null,
    parts: plan.mode === 'multipart' ? plan.parts : 1, partSize: plan.mode === 'multipart' ? plan.partSize : input.size,
    status: 'pending', createdAt: now,
  });

  if (plan.mode === 'single') {
    return { uploadId, fileId, mode: 'single', url: putUrl(cfg, key, input.size, input.mime, 900, new Date(now)),
      headers: { 'Content-Type': input.mime }, expiresAt: now + 900_000 };
  }
  return { uploadId, fileId, mode: 'multipart', partSize: plan.partSize, parts: plan.parts };
}

async function loadUpload(uid: string, uploadId: string, deps: UploadDeps): Promise<Doc> {
  if (!ID_RE.test(uploadId)) throw new DriveError('not_found', 'Upload not found.', 404);
  const up = await deps.store.get(`driveUploads/${uploadId}`);
  if (!up || up.uid !== uid) throw new DriveError('not_found', 'Upload not found.', 404);
  if (up.status !== 'pending') throw new DriveError('not_pending', 'This upload already finished.', 409);
  if (deps.now() - up.createdAt >= RESERVATION_TTL_MS) throw new DriveError('expired', 'This upload expired. Start it again.', 410);
  return up;
}

export async function signParts(uid: string, uploadId: string, partNumbers: number[], deps: UploadDeps): Promise<Array<{ partNumber: number; url: string }>> {
  const cfg = deps.s3();
  if (!cfg) throw new DriveError('not_configured', 'Drive storage isn’t set up on this server.', 503);
  const up = await loadUpload(uid, uploadId, deps);
  if (up.mode !== 'multipart') throw new DriveError('not_multipart', 'This upload is a single file.');
  if (!Array.isArray(partNumbers) || !partNumbers.length || partNumbers.length > PART_BATCH) throw new DriveError('bad_parts', `Ask for 1–${PART_BATCH} parts at a time.`);
  const max = Math.min(up.parts, MAX_PARTS);
  if (partNumbers.some(n => !Number.isInteger(n) || n < 1 || n > max)) throw new DriveError('bad_parts', 'Unknown part number.');
  const at = new Date(deps.now());
  return partNumbers.map(n => ({ partNumber: n, url: partUrl(cfg, up.key, up.multipartId, n, 3600, at) }));
}

async function releaseReservation(owner: { kind: 'u' | 'o'; id: string }, uploadId: string, deps: UploadDeps, add?: { bytes: number; uid: string; dept?: string; allowance: number }) {
  const path = usagePath(owner);
  const u = ((await deps.store.get(path)) ?? { liveBytes: 0, trashBytes: 0 }) as UsageDoc;
  const reservations = { ...(u.reservations ?? {}) };
  delete reservations[uploadId];
  const next: UsageDoc = { ...u, reservations };
  if (add) {
    next.liveBytes = (u.liveBytes ?? 0) + add.bytes;
    next.members = { ...(u.members ?? {}), [add.uid]: (u.members?.[add.uid] ?? 0) + add.bytes };
    if (add.dept) next.departments = { ...(u.departments ?? {}), [add.dept]: (u.departments?.[add.dept] ?? 0) + add.bytes };
    const over = usedBytes(next) > add.allowance;
    if (over && next.overSince === undefined) next.overSince = deps.now();
    if (!over) delete next.overSince;
  }
  await deps.store.set(path, next);
}

export async function completeUpload(uid: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }> | undefined, deps: UploadDeps): Promise<Doc> {
  const cfg = deps.s3();
  if (!cfg) throw new DriveError('not_configured', 'Drive storage isn’t set up on this server.', 503);
  const up = await loadUpload(uid, uploadId, deps);
  if (up.mode === 'multipart') {
    if (!Array.isArray(parts) || parts.length !== up.parts || parts.some(p => !Number.isInteger(p.partNumber) || typeof p.etag !== 'string' || p.etag.length > 200)) {
      throw new DriveError('bad_parts', 'Some parts are missing.');
    }
    await completeMultipart(cfg, up.key, up.multipartId, parts, deps.fetch);
  }
  const size = await headSize(cfg, up.key, deps.fetch);
  if (size === null || size !== up.size) {
    // Missing or a different size than approved: remove it and give the space back.
    await deleteObjectServer(cfg, up.key, deps.fetch);
    await releaseReservation(up.owner, uploadId, deps);
    await deps.store.set(`driveUploads/${uploadId}`, { ...up, status: 'failed', error: size === null ? 'missing' : 'size_mismatch' });
    throw new DriveError('verify_failed', 'The upload didn’t arrive complete. Please try again.', 422);
  }
  const allowance = up.owner.kind === 'u'
    ? personalAllowance(await deps.personal(uid))
    : orgPoolBytes((await deps.orgPool(up.owner.id)) ?? { poolSkus: [], departmentCaps: {}, memberCaps: {} });
  await releaseReservation(up.owner, uploadId, deps, { bytes: size, uid, dept: up.departmentId ?? undefined, allowance });
  const now = deps.now();
  const file = {
    owner: up.owner, ownerKey: `${up.owner.kind}_${up.owner.id}`, name: up.name, mime: up.mime, size, parentId: up.parentId, departmentId: up.departmentId,
    key: up.key, version: 1, uploadedBy: uid, createdAt: now, updatedAt: now, trashedAt: null, scan: 'pending',
  };
  await deps.store.set(`driveFiles/${up.fileId}`, file);
  await deps.store.set(`driveUploads/${uploadId}`, { ...up, status: 'done', finishedAt: now });
  try { deps.onUploaded?.({ id: up.fileId, ...file }); } catch { /* never fail an upload on a side job */ }
  return { id: up.fileId, ...file };
}

export async function abortUpload(uid: string, uploadId: string, deps: UploadDeps): Promise<void> {
  const cfg = deps.s3();
  const up = await loadUpload(uid, uploadId, deps).catch(e => { if (e?.code === 'expired') return null; throw e; });
  if (!up) return;
  if (cfg) {
    if (up.mode === 'multipart' && up.multipartId) await abortMultipart(cfg, up.key, up.multipartId, deps.fetch);
    else await deleteObjectServer(cfg, up.key, deps.fetch);
  }
  await releaseReservation(up.owner, uploadId, deps);
  await deps.store.set(`driveUploads/${uploadId}`, { ...up, status: 'aborted' });
}

export async function usageSummary(uid: string, scope: Scope, deps: UploadDeps) {
  let r: { owner: { kind: 'u' | 'o'; id: string }; allowance: number };
  if (scope.kind === 'u') {
    r = { owner: { kind: 'u', id: uid }, allowance: personalAllowance(await deps.personal(uid)) };
  } else {
    // Anyone with org access (staff included, any department) may SEE the org's usage.
    if (!ID_RE.test(scope.orgId) || !(await deps.orgAccess(uid, scope.orgId))) throw new DriveError('forbidden', 'You can’t view this organization’s Drive.', 403);
    const pool = await deps.orgPool(scope.orgId);
    if (!pool) throw new DriveError('no_pool', 'This organization has no Drive storage yet.', 402);
    r = { owner: { kind: 'o', id: scope.orgId }, allowance: orgPoolBytes(pool) };
  }
  const now = deps.now();
  const u = ((await deps.store.get(usagePath(r.owner))) ?? { liveBytes: 0, trashBytes: 0 }) as UsageDoc;
  const reserved = liveReservations(u, now).reduce((t, [, x]) => t + x.bytes, 0);
  return {
    allowance: r.allowance, liveBytes: u.liveBytes, trashBytes: u.trashBytes, reservedBytes: reserved,
    state: quotaState(u, r.allowance, now),
  };
}
