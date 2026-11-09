// services/drive/library.ts — browsing a Drive: folders, list, rename/move, trash, restore,
// delete forever, download links. SERVER ONLY. Uploads live in uploads.ts.
//
// Who sees what:
//   personal Drive  → only its owner
//   org Drive       → admins see everything; staff see files in departments they belong to,
//                     plus files filed under no department (the org's shared space)
// Trash keeps counting toward usage for 30 days (allocation.TRASH_DAYS); a nightly purge (later)
// deletes what's older. "Delete forever" does it now. Bytes move liveBytes ⇄ trashBytes on the
// owner's usage doc so the quota stays honest.
//
// Listing reads every record of an owner (one equality filter, no composite index) and filters in
// memory. Fine to a few thousand items; a folder index comes when a Drive outgrows that.

import { getUrl, deleteObjectServer, type S3Config } from '../objectStore/s3ops';
import { trashPurgeAt } from './allocation';
import { DriveError, type OrgAccess, type Scope, type UploadDeps } from './uploads';

type Doc = Record<string, any>;
export type Row = { id: string; data: Doc };

export interface LibraryDeps extends UploadDeps {
  query: (collection: string, field: string, value: string, limit: number) => Promise<Row[]>;
  remove: (path: string) => Promise<boolean>;
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\u0000-\u001f\u007f/\\]/;
const LIST_LIMIT = 5000;

export const ownerKeyOf = (o: { kind: 'u' | 'o'; id: string }) => `${o.kind}_${o.id}`;
const usagePath = (o: { kind: 'u' | 'o'; id: string }) => `driveUsage/${ownerKeyOf(o)}`;

export interface DriveItem {
  id: string; kind: 'file' | 'folder'; name: string; parentId: string | null; departmentId: string | null;
  size: number; mime: string | null; createdAt: number; updatedAt: number; trashedAt: number | null;
  purgeAt: number | null; uploadedBy: string | null; scan: string | null;
}

function toItem(kind: 'file' | 'folder', r: Row): DriveItem {
  const d = r.data;
  return {
    id: r.id, kind, name: String(d.name ?? ''), parentId: d.parentId ?? null, departmentId: d.departmentId ?? null,
    size: kind === 'file' ? Number(d.size ?? 0) : 0, mime: kind === 'file' ? (d.mime ?? null) : null,
    createdAt: Number(d.createdAt ?? 0), updatedAt: Number(d.updatedAt ?? d.createdAt ?? 0),
    trashedAt: d.trashedAt ?? null, purgeAt: d.trashedAt ? trashPurgeAt(d.trashedAt) : null,
    uploadedBy: d.uploadedBy ?? d.createdBy ?? null, scan: kind === 'file' ? (d.scan ?? null) : null,
  };
}

function checkName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (!name || name.length > 255 || BAD_NAME.test(name)) throw new DriveError('bad_name', 'Names can be 1–255 characters, without slashes.');
  return name;
}

interface Viewer {
  owner: { kind: 'u' | 'o'; id: string };
  access: 'owner' | Exclude<OrgAccess, null>;
  /** Departments a staff member belongs to (memoized check). */
  inDept: (dept: string) => Promise<boolean>;
}

async function viewer(uid: string, scope: Scope, deps: LibraryDeps): Promise<Viewer> {
  if (scope.kind === 'u') return { owner: { kind: 'u', id: uid }, access: 'owner', inDept: async () => true };
  if (!ID_RE.test(scope.orgId)) throw new DriveError('bad_scope', 'Unknown organization');
  const access = await deps.orgAccess(uid, scope.orgId);
  if (!access) throw new DriveError('forbidden', 'You can’t open this organization’s Drive.', 403);
  const memo = new Map<string, Promise<boolean>>();
  return {
    owner: { kind: 'o', id: scope.orgId }, access,
    inDept: dept => {
      if (!memo.has(dept)) memo.set(dept, deps.inDepartment(uid, scope.orgId, dept).catch(() => false));
      return memo.get(dept)!;
    },
  };
}

async function canSee(v: Viewer, d: Doc): Promise<boolean> {
  if (v.access !== 'staff') return true;
  return !d.departmentId || v.inDept(d.departmentId);
}

/** Staff change only what's in their departments (or the shared space); admins and owners anything. */
const canEdit = canSee;

async function loadItem(v: Viewer, id: string, deps: LibraryDeps): Promise<{ kind: 'file' | 'folder'; path: string; doc: Doc }> {
  if (!ID_RE.test(id)) throw new DriveError('not_found', 'Item not found.', 404);
  for (const [kind, coll] of [['file', 'driveFiles'], ['folder', 'driveFolders']] as const) {
    const doc = await deps.store.get(`${coll}/${id}`);
    if (doc && doc.ownerKey === ownerKeyOf(v.owner)) {
      if (!(await canSee(v, doc))) break;
      return { kind, path: `${coll}/${id}`, doc };
    }
  }
  throw new DriveError('not_found', 'Item not found.', 404);
}

async function allRows(v: Viewer, deps: LibraryDeps) {
  const key = ownerKeyOf(v.owner);
  const [files, folders] = await Promise.all([
    deps.query('driveFiles', 'ownerKey', key, LIST_LIMIT),
    deps.query('driveFolders', 'ownerKey', key, LIST_LIMIT),
  ]);
  return { files, folders };
}

export interface ListResult { items: DriveItem[]; path: Array<{ id: string; name: string }> }

/** One folder's contents (parentId null = top), or everything in the trash. */
export async function listFolder(uid: string, scope: Scope, parentId: string | null, opts: { trash?: boolean }, deps: LibraryDeps): Promise<ListResult> {
  const v = await viewer(uid, scope, deps);
  if (parentId !== null && !ID_RE.test(parentId)) throw new DriveError('bad_parent', 'Unknown folder.');
  const { files, folders } = await allRows(v, deps);
  const byId = new Map(folders.map(f => [f.id, f.data]));
  const pick = (r: Row) => opts.trash ? !!r.data.trashedAt : (!r.data.trashedAt && (r.data.parentId ?? null) === parentId);
  const items: DriveItem[] = [];
  for (const r of folders) if (pick(r) && await canSee(v, r.data)) items.push(toItem('folder', r));
  for (const r of files) if (pick(r) && await canSee(v, r.data)) items.push(toItem('file', r));
  items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'folder' ? -1 : 1));
  const path: ListResult['path'] = [];
  for (let id = parentId, hops = 0; id && hops < 64; hops++) {
    const f = byId.get(id);
    if (!f) break;
    path.unshift({ id, name: String(f.name) });
    id = f.parentId ?? null;
  }
  return { items, path };
}

export async function createFolder(uid: string, scope: Scope, input: { name: unknown; parentId?: string | null; departmentId?: string | null }, deps: LibraryDeps): Promise<DriveItem> {
  const v = await viewer(uid, scope, deps);
  const name = checkName(input.name);
  const parentId = input.parentId ?? null;
  let departmentId = input.departmentId ?? null;
  if (parentId !== null) {
    const p = await loadItem(v, parentId, deps);
    if (p.kind !== 'folder' || p.doc.trashedAt) throw new DriveError('bad_parent', 'Unknown folder.');
    departmentId = departmentId ?? p.doc.departmentId ?? null; // folders inherit their parent's department
  }
  if (v.access === 'staff' && (!departmentId || !(await v.inDept(departmentId)))) {
    throw new DriveError('forbidden', 'You can only add folders to your own department.', 403);
  }
  const id = deps.newId(), now = deps.now();
  const doc = { owner: v.owner, ownerKey: ownerKeyOf(v.owner), name, parentId, departmentId, createdBy: uid, createdAt: now, updatedAt: now, trashedAt: null };
  await deps.store.set(`driveFolders/${id}`, doc);
  return toItem('folder', { id, data: doc });
}

/** Rename and/or move. A folder can't move into itself or its own subfolders. */
export async function updateItem(uid: string, scope: Scope, id: string, patch: { name?: unknown; parentId?: string | null }, deps: LibraryDeps): Promise<DriveItem> {
  const v = await viewer(uid, scope, deps);
  const it = await loadItem(v, id, deps);
  if (!(await canEdit(v, it.doc))) throw new DriveError('forbidden', 'You can’t change this item.', 403);
  if (it.doc.trashedAt) throw new DriveError('trashed', 'Restore it from the trash first.', 409);
  const next: Doc = { ...it.doc, updatedAt: deps.now() };
  if (patch.name !== undefined) next.name = checkName(patch.name);
  if (patch.parentId !== undefined) {
    const to = patch.parentId;
    if (to !== null) {
      const p = await loadItem(v, to, deps);
      if (p.kind !== 'folder' || p.doc.trashedAt) throw new DriveError('bad_parent', 'Unknown folder.');
      if (it.kind === 'folder') {
        // Walk up from the target; meeting ourselves means a cycle.
        let cur: string | null = to;
        for (let hops = 0; cur && hops < 64; hops++) {
          if (cur === id) throw new DriveError('bad_parent', 'A folder can’t go inside itself.');
          const f: Doc | null = await deps.store.get(`driveFolders/${cur}`);
          cur = f?.parentId ?? null;
        }
      }
    }
    next.parentId = to;
  }
  await deps.store.set(it.path, next);
  return toItem(it.kind, { id, data: next });
}

/** Everything under a folder (inclusive), for trash/restore/purge cascades. */
async function subtree(v: Viewer, rootId: string, deps: LibraryDeps) {
  const { files, folders } = await allRows(v, deps);
  const ids = new Set([rootId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders) if (!ids.has(f.id) && f.data.parentId && ids.has(f.data.parentId)) { ids.add(f.id); grew = true; }
  }
  return { folders: folders.filter(f => ids.has(f.id)), files: files.filter(f => f.data.parentId && ids.has(f.data.parentId)) };
}

async function shiftUsage(owner: { kind: 'u' | 'o'; id: string }, toTrash: number, deps: LibraryDeps, purge = 0) {
  if (!toTrash && !purge) return;
  const path = usagePath(owner);
  const u = (await deps.store.get(path)) ?? { liveBytes: 0, trashBytes: 0 };
  await deps.store.set(path, {
    ...u,
    liveBytes: Math.max(0, (u.liveBytes ?? 0) - toTrash),
    trashBytes: Math.max(0, (u.trashBytes ?? 0) + toTrash - purge),
  });
}

export async function trashItem(uid: string, scope: Scope, id: string, deps: LibraryDeps): Promise<{ count: number; bytes: number }> {
  const v = await viewer(uid, scope, deps);
  const it = await loadItem(v, id, deps);
  if (!(await canEdit(v, it.doc))) throw new DriveError('forbidden', 'You can’t delete this item.', 403);
  if (it.doc.trashedAt) return { count: 0, bytes: 0 };
  const now = deps.now();
  let bytes = 0, count = 1;
  if (it.kind === 'file') {
    bytes = Number(it.doc.size ?? 0);
    await deps.store.set(it.path, { ...it.doc, trashedAt: now, trashRoot: true });
  } else {
    const t = await subtree(v, id, deps);
    for (const f of t.folders) if (!f.data.trashedAt) await deps.store.set(`driveFolders/${f.id}`, { ...f.data, trashedAt: now, trashRoot: f.id === id, trashedWith: f.id === id ? null : id });
    for (const f of t.files) if (!f.data.trashedAt) {
      bytes += Number(f.data.size ?? 0); count++;
      await deps.store.set(`driveFiles/${f.id}`, { ...f.data, trashedAt: now, trashRoot: false, trashedWith: id });
    }
  }
  await shiftUsage(v.owner, bytes, deps);
  return { count, bytes };
}

export async function restoreItem(uid: string, scope: Scope, id: string, deps: LibraryDeps): Promise<{ count: number; bytes: number }> {
  const v = await viewer(uid, scope, deps);
  const it = await loadItem(v, id, deps);
  if (!(await canEdit(v, it.doc))) throw new DriveError('forbidden', 'You can’t restore this item.', 403);
  if (!it.doc.trashedAt) return { count: 0, bytes: 0 };
  // If its folder is gone or still in the trash, it comes back to the top level.
  let parentId = it.doc.parentId ?? null;
  if (parentId) {
    const p = await deps.store.get(`driveFolders/${parentId}`);
    if (!p || p.trashedAt) parentId = null;
  }
  let bytes = 0, count = 1;
  const clear = (d: Doc): Doc => { const n: Doc = { ...d, trashedAt: null }; delete n.trashRoot; delete n.trashedWith; return n; };
  if (it.kind === 'file') {
    bytes = Number(it.doc.size ?? 0);
    await deps.store.set(it.path, { ...clear(it.doc), parentId });
  } else {
    const t = await subtree(v, id, deps);
    for (const f of t.folders) {
      if (f.id === id) await deps.store.set(`driveFolders/${f.id}`, { ...clear(f.data), parentId });
      else if (f.data.trashedWith === id) await deps.store.set(`driveFolders/${f.id}`, clear(f.data));
    }
    for (const f of t.files) if (f.data.trashedWith === id) {
      bytes += Number(f.data.size ?? 0); count++;
      await deps.store.set(`driveFiles/${f.id}`, clear(f.data));
    }
  }
  await shiftUsage(v.owner, -bytes, deps);
  return { count, bytes };
}

/** Permanently remove something already in the trash: B2 objects, records, trash bytes. */
export async function deleteForever(uid: string, scope: Scope, id: string, deps: LibraryDeps): Promise<{ count: number; bytes: number }> {
  const v = await viewer(uid, scope, deps);
  const it = await loadItem(v, id, deps);
  if (!(await canEdit(v, it.doc))) throw new DriveError('forbidden', 'You can’t delete this item.', 403);
  if (!it.doc.trashedAt) throw new DriveError('not_trashed', 'Move it to the trash first.', 409);
  const cfg = deps.s3();
  if (!cfg) throw new DriveError('not_configured', 'Drive storage isn’t set up on this server.', 503);
  const files: Row[] = it.kind === 'file' ? [{ id, data: it.doc }] : (await subtree(v, id, deps)).files.filter(f => f.data.trashedWith === id);
  const folders: Row[] = it.kind === 'folder' ? (await subtree(v, id, deps)).folders.filter(f => f.id === id || f.data.trashedWith === id) : [];
  let bytes = 0;
  for (const f of files) {
    await deleteObjectServer(cfg as S3Config, f.data.key, deps.fetch);
    await deps.remove(`driveFiles/${f.id}`);
    bytes += Number(f.data.size ?? 0);
  }
  for (const f of folders) await deps.remove(`driveFolders/${f.id}`);
  await shiftUsage(v.owner, 0, deps, bytes);
  return { count: files.length + folders.length, bytes };
}

/** A short-lived signed download link. Bunny (signed pull) replaces the direct B2 link at launch. */
export async function downloadLink(uid: string, scope: Scope, id: string, opts: { inline?: boolean }, deps: LibraryDeps): Promise<{ url: string; expiresAt: number }> {
  const v = await viewer(uid, scope, deps);
  const it = await loadItem(v, id, deps);
  if (it.kind !== 'file') throw new DriveError('not_file', 'Folders download as a zip later.', 400);
  if (it.doc.scan === 'infected') throw new DriveError('blocked', 'This file was flagged by the malware scan.', 451);
  const cfg = deps.s3();
  if (!cfg) throw new DriveError('not_configured', 'Drive storage isn’t set up on this server.', 503);
  const safe = String(it.doc.name).replace(/["\r\n]/g, '_');
  const disp = `${opts.inline ? 'inline' : 'attachment'}; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
  const now = deps.now();
  return { url: getUrl(cfg, it.doc.key, 600, { 'response-content-disposition': disp }, new Date(now)), expiresAt: now + 600_000 };
}
