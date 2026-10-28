// services/creativeCloud/cloudStore.ts — cloud copy + version history for every creative project.
//
// Tools keep their fast local save (OPFS / IndexedDB / localStorage) and hand the same JSON
// here. Each sync uploads an immutable gzipped revision to owner-only Storage and moves the
// project's head to it in a Firestore transaction:
//
//   creativeProjects/{kind}__{localId}             head: owner, kind, title, rev, headPath, size…
//   creativeProjects/{…}/versions/{versionId}       a pointer to an older revision (+ label, reason)
//   personal/{uid}/creative/{kind}/{localId}/r{rev}_{device}.json.gz
//
// The revision being replaced becomes a version when a checkpoint is due (history.ts), when it
// came from another device (so concurrent edits are never lost), or when the caller asks
// (before a restore). Otherwise it is deleted. Versions are pointers, so history costs no extra
// uploads; old autosave checkpoints are thinned by versionsToPrune.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { quotaClassOf, type QuotaClass } from './policy';
import {
  isPinned,
  shouldCheckpoint,
  versionsToPrune,
  type VersionReason,
  type VersionStub,
} from './history';
import { noteCloudBytes, quotaAllowsSave } from './usage';
import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import { merge3Json } from '../coedit/crdt';

const COL = 'creativeProjects';

export interface CloudHead {
  id: string;
  ownerId: string;
  kind: string;
  localId: string;
  title: string;
  rev: number;
  headPath: string;
  sizeBytes: number;
  /** A version points at the current head revision, so it must outlive the next sync. */
  headPinned?: boolean;
  lastVersionAt?: number;
  quotaClass: QuotaClass;
  updatedAt: number;
  createdAt: number;
  updatedByDevice: string;
  updatedByDeviceLabel?: string;
  coverUrl?: string;
}

export interface CloudVersion {
  id: string;
  rev: number;
  path: string;
  sizeBytes: number;
  createdAt: number;
  reason: VersionReason;
  label?: string;
  pinned?: boolean;
  deviceId?: string;
  deviceLabel?: string;
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'guest' | 'over-quota' | 'error';

export interface SyncResult {
  state: SyncState;
  rev?: number;
  /** True when another device had saved since this device last synced (its edits are kept as a version). */
  savedOverOtherDevice?: boolean;
  /** When both devices had edits, the merged project that was uploaded (apply it to the open editor). */
  mergedJson?: string;
  /** This device's copy as it was handed to the sync, before merging (rebase base for the editor). */
  preMergeJson?: string;
  /** Places both devices changed; this device's change won (the other device's copy is in history). */
  conflicts?: number;
}

export const cloudProjectId = (kind: string, localId: string) => `${kind}__${localId}`.replace(/\//g, '_');

// ── Device identity (labels versions "from Kenne's laptop · Chrome") ─────────

let _device: { id: string; label: string } | null = null;
export function thisDevice(): { id: string; label: string } {
  if (_device) return _device;
  let id = '';
  try {
    id = localStorage.getItem('plajah.device.id') || '';
    if (!id) {
      id = `d${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('plajah.device.id', id);
    }
  } catch {
    id = `d${Math.random().toString(36).slice(2, 10)}`;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  _device = { id, label: `${os} · ${browser}` };
  return _device;
}

/** The head revision this device last saved or opened, per project. */
function knownRev(projectId: string): number | null {
  try {
    const v = localStorage.getItem(`plajah.creative.rev.${projectId}`);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}
function setKnownRev(projectId: string, rev: number) {
  try {
    localStorage.setItem(`plajah.creative.rev.${projectId}`, String(rev));
  } catch {
    /* storage blocked: conflict detection falls back to device id */
  }
}

// ── gzip ─────────────────────────────────────────────────────────────────────

async function gzip(text: string): Promise<{ bytes: Uint8Array; gz: boolean }> {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return { bytes: raw, gz: false };
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), gz: true };
}

async function gunzipToText(buf: ArrayBuffer): Promise<string> {
  const u8 = new Uint8Array(buf);
  const isGz = u8[0] === 0x1f && u8[1] === 0x8b;
  if (!isGz) return new TextDecoder().decode(u8);
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncInput {
  kind: string;
  localId: string;
  title: string;
  /** The project exactly as the tool stores it locally (already encrypted where the tool encrypts). */
  json: string;
  /** Force the replaced head into history with this reason (e.g. 'before-restore'). */
  versionReason?: VersionReason;
  coverUrl?: string;
}

export async function syncCreativeProject(input: SyncInput): Promise<SyncResult> {
  const user = auth.currentUser;
  if (!user) return { state: 'guest' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'offline' };

  const id = cloudProjectId(input.kind, input.localId);
  const device = thisDevice();
  // Another device saved since this one last synced: merge both sets of edits instead of picking one.
  let merge: { json: string; conflicts: number; pre: string } | null = null;
  const head0 = await getDoc(doc(db, COL, id)).catch(() => null);
  const known = knownRev(id);
  if (head0?.exists() && known != null && Number(head0.data().rev) !== known && head0.data().updatedByDevice !== device.id) {
    const m = await mergeWithCloud(id, head0.data() as CloudHead, input.json);
    merge = m ? { ...m, pre: input.json } : null;
    if (merge) input = { ...input, json: merge.json, versionReason: input.versionReason ?? 'other-device' };
  }
  const { bytes, gz } = await gzip(input.json);
  if (!(await quotaAllowsSave(input.kind, bytes.byteLength))) return { state: 'over-quota' };

  const headRef = doc(db, COL, id);
  const before = await getDoc(headRef).catch(() => null);
  const prevRev = before?.exists() ? Number(before.data().rev) || 0 : 0;
  const rev = prevRev + 1;
  const path = `personal/${user.uid}/creative/${input.kind}/${input.localId}/r${rev}_${device.id}.json${gz ? '.gz' : ''}`;

  try {
    await uploadBytes(ref(storage, path), bytes, {
      contentType: gz ? 'application/gzip' : 'application/json',
      customMetadata: { ownerUid: user.uid, kind: input.kind, projectId: id },
    });
  } catch (err) {
    console.warn('[creativeCloud] upload failed', err);
    return { state: 'error' };
  }

  const now = Date.now();
  const mine = knownRev(id);
  let replaced: CloudHead | null = null;
  let versionedAs: VersionReason | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(headRef);
      const prev = snap.exists() ? (snap.data() as CloudHead) : null;
      replaced = prev;
      versionedAs = null;
      if (prev && prev.rev >= rev) throw new Error('stale-rev'); // another save won the race; retry below

      if (prev) {
        const fromOtherDevice = prev.updatedByDevice !== device.id && mine !== prev.rev;
        // A pinned head is already in history (named); recording it again would double-reference its file.
        versionedAs = prev.headPinned
          ? null
          : input.versionReason ?? (fromOtherDevice ? 'other-device' : shouldCheckpoint(prev.lastVersionAt, now) ? 'checkpoint' : null);
        if (versionedAs) {
          const vRef = doc(collection(headRef, 'versions'));
          const v: Omit<CloudVersion, 'id'> = {
            rev: prev.rev,
            path: prev.headPath,
            sizeBytes: prev.sizeBytes,
            createdAt: prev.updatedAt,
            reason: versionedAs,
            pinned: versionedAs !== 'checkpoint',
            deviceId: prev.updatedByDevice,
            ...(prev.updatedByDeviceLabel ? { deviceLabel: prev.updatedByDeviceLabel } : {}),
          };
          tx.set(vRef, v);
        }
      }

      const head: CloudHead = {
        id,
        ownerId: user.uid,
        kind: input.kind,
        localId: input.localId,
        title: input.title || 'Untitled',
        rev,
        headPath: path,
        sizeBytes: bytes.byteLength,
        headPinned: false,
        lastVersionAt: versionedAs ? now : prev?.lastVersionAt ?? now,
        quotaClass: quotaClassOf(input.kind),
        updatedAt: now,
        createdAt: prev?.createdAt ?? now,
        updatedByDevice: device.id,
        updatedByDeviceLabel: device.label,
        ...(input.coverUrl ? { coverUrl: input.coverUrl } : prev?.coverUrl ? { coverUrl: prev.coverUrl } : {}),
      };
      tx.set(headRef, head);
    });
  } catch (err) {
    await deleteObject(ref(storage, path)).catch(() => {});
    if (err instanceof Error && err.message === 'stale-rev') return syncCreativeProject(input);
    console.warn('[creativeCloud] head commit failed', err);
    return { state: 'error' };
  }

  setKnownRev(id, rev);
  void idbSet(baseKey(id), input.json).catch(() => {});
  const prev = replaced as CloudHead | null;
  let freed = 0;
  if (prev && !versionedAs && !prev.headPinned) {
    // Plain autosave superseded: its revision isn't history, so drop it.
    await deleteObject(ref(storage, prev.headPath)).then(
      () => (freed = prev.sizeBytes),
      () => {}
    );
  }
  noteCloudBytes(input.kind, bytes.byteLength - freed);
  if (versionedAs === 'checkpoint') void pruneHistory(input.kind, input.localId);

  return {
    state: 'synced',
    rev,
    savedOverOtherDevice: versionedAs === 'other-device',
    ...(merge ? { mergedJson: merge.json, preMergeJson: merge.pre, conflicts: merge.conflicts } : {}),
  };
}

// ── Cross-device merge ───────────────────────────────────────────────────────

/** The JSON this device last synced or opened, per project: the common ancestor for merges. */
const baseKey = (id: string) => `creative-base:${id}`;

async function mergeWithCloud(id: string, head: CloudHead, mineJson: string): Promise<{ json: string; conflicts: number } | null> {
  try {
    const [baseJson, theirsJson] = await Promise.all([idbGet<string>(baseKey(id)), getBytes(ref(storage, head.headPath)).then(gunzipToText)]);
    if (!baseJson || theirsJson === mineJson) return null;
    const base = JSON.parse(baseJson);
    const mine = JSON.parse(mineJson);
    const theirs = JSON.parse(theirsJson);
    if (!base || typeof base !== 'object' || typeof mine !== 'object' || typeof theirs !== 'object') return null;
    const { merged, conflicts } = merge3Json(base, mine, theirs);
    return { json: JSON.stringify(merged), conflicts: conflicts.length };
  } catch (err) {
    console.warn('[creativeCloud] merge skipped; the other device’s copy is kept in history', err);
    return null;
  }
}

/** Thins old autosave checkpoints (pinned versions are never touched). */
async function pruneHistory(kind: string, localId: string) {
  try {
    const versions = await listVersions(kind, localId);
    const doomed = new Set(versionsToPrune(versions as VersionStub[], Date.now()));
    const headRef = doc(db, COL, cloudProjectId(kind, localId));
    for (const v of versions) {
      if (!doomed.has(v.id)) continue;
      await deleteDoc(doc(headRef, 'versions', v.id));
      await deleteObject(ref(storage, v.path)).catch(() => {});
      noteCloudBytes(kind, -v.sizeBytes);
    }
  } catch (err) {
    console.warn('[creativeCloud] prune failed', err);
  }
}

// ── Throttled background sync (what tools call on every local save) ────────

const SYNC_THROTTLE_MS = 5000;
const pending = new Map<string, { input: SyncInput; timer: ReturnType<typeof setTimeout> | null; running: boolean }>();
export const CREATIVE_SYNC_EVENT = 'creative-cloud:sync';
export interface CreativeSyncDetail {
  kind: string;
  localId: string;
  state: SyncState;
  savedOverOtherDevice?: boolean;
  /** Present when edits from another device were merged in: the editor should load this,
   *  rebasing anything typed since `preMergeJson` was handed to the sync. */
  mergedJson?: string;
  preMergeJson?: string;
  conflicts?: number;
}

// Saves that haven't reached the cloud yet survive offline spells, closed tabs and restarts:
// each pending sync is mirrored to IndexedDB and replayed when the network (or the app) returns.
const OUTBOX = 'creative-outbox:';
const RETRY_MS = 30_000;

function emit(detail: CreativeSyncDetail) {
  try {
    window.dispatchEvent(new CustomEvent(CREATIVE_SYNC_EVENT, { detail }));
  } catch {
    /* no window */
  }
}

/** Queue a cloud sync; repeated calls within 5 s coalesce into one upload of the latest JSON. */
export function scheduleCreativeSync(input: SyncInput) {
  if (!auth.currentUser) {
    emit({ kind: input.kind, localId: input.localId, state: 'guest' });
    return;
  }
  const key = cloudProjectId(input.kind, input.localId);
  const entry = pending.get(key) ?? { input, timer: null, running: false };
  entry.input = input;
  pending.set(key, entry);
  void idbSet(OUTBOX + key, { uid: auth.currentUser.uid, input }).catch(() => {});
  if (entry.timer || entry.running) return;
  emit({ kind: input.kind, localId: input.localId, state: 'syncing' });
  entry.timer = setTimeout(() => void runPending(key), SYNC_THROTTLE_MS);
}

async function runPending(key: string) {
  const entry = pending.get(key);
  if (!entry) return;
  entry.timer = null;
  entry.running = true;
  const input = entry.input;
  const result: SyncResult = await syncCreativeProject(input).catch(() => ({ state: 'error' as const }));
  entry.running = false;
  emit({
    kind: input.kind,
    localId: input.localId,
    state: result.state,
    savedOverOtherDevice: result.savedOverOtherDevice,
    ...(result.mergedJson ? { mergedJson: result.mergedJson, preMergeJson: result.preMergeJson, conflicts: result.conflicts } : {}),
  });
  if (entry.input !== input) {
    // Edited again while uploading: go again.
    entry.timer = setTimeout(() => void runPending(key), SYNC_THROTTLE_MS);
  } else if (result.state === 'offline' || result.state === 'error') {
    // Keep it queued (and in IndexedDB); 'online' or the retry timer sends it.
    entry.timer = setTimeout(() => void runPending(key), RETRY_MS);
  } else {
    pending.delete(key);
    if (result.state === 'synced' || result.state === 'over-quota') void idbDel(OUTBOX + key).catch(() => {});
  }
}

/** Re-queues saves left in IndexedDB by an earlier session (called once auth is known). */
export async function resumeCreativeOutbox() {
  if (!auth.currentUser) return;
  const all = await idbKeys().catch(() => [] as IDBValidKey[]);
  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(OUTBOX)) continue;
    const entry = await idbGet<{ uid: string; input: SyncInput }>(k).catch(() => undefined);
    // Only the account that made the edit may upload it.
    if (entry?.uid === auth.currentUser.uid && entry.input && !pending.has(k.slice(OUTBOX.length))) scheduleCreativeSync(entry.input);
  }
}

/** Starts every queued sync now (page hide / close). */
export function flushCreativeSyncs() {
  for (const [key, entry] of pending) {
    if (entry.running) continue;
    if (entry.timer) clearTimeout(entry.timer);
    void runPending(key);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushCreativeSyncs);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushCreativeSyncs());
  window.addEventListener('online', flushCreativeSyncs);
  auth.onAuthStateChanged((u) => u && void resumeCreativeOutbox());
}

// ── Open anywhere ────────────────────────────────────────────────────────────

export async function getCloudHead(kind: string, localId: string): Promise<CloudHead | null> {
  if (!auth.currentUser) return null;
  try {
    const snap = await getDoc(doc(db, COL, cloudProjectId(kind, localId)));
    return snap.exists() ? (snap.data() as CloudHead) : null;
  } catch {
    return null;
  }
}

/** The cloud copy of a project (null for guests, offline, or never synced). */
export async function loadCloudProject(kind: string, localId: string): Promise<{ json: string; head: CloudHead } | null> {
  const head = await getCloudHead(kind, localId);
  if (!head) return null;
  try {
    const json = await gunzipToText(await getBytes(ref(storage, head.headPath)));
    setKnownRev(head.id, head.rev);
    void idbSet(baseKey(head.id), json).catch(() => {});
    return { json, head };
  } catch (err) {
    console.warn('[creativeCloud] download failed', err);
    return null;
  }
}

/** The signed-in user's cloud projects, newest first (optionally one kind). */
export async function listCloudProjects(kind?: string): Promise<CloudHead[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const filters = [where('ownerId', '==', user.uid), ...(kind ? [where('kind', '==', kind)] : [])];
    const snap = await getDocs(query(collection(db, COL), ...filters));
    return snap.docs.map((d) => d.data() as CloudHead).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.warn('[creativeCloud] list failed', err);
    return [];
  }
}

/** Was the cloud copy saved by another device after this device last saw it? */
export function isCloudNewer(head: CloudHead | null, localUpdatedAt: number | undefined): boolean {
  if (!head) return false;
  return head.updatedByDevice !== thisDevice().id && head.updatedAt > (localUpdatedAt ?? 0) && knownRev(head.id) !== head.rev;
}

// ── Version history ──────────────────────────────────────────────────────────

export async function listVersions(kind: string, localId: string): Promise<CloudVersion[]> {
  if (!auth.currentUser) return [];
  const snap = await getDocs(collection(doc(db, COL, cloudProjectId(kind, localId)), 'versions'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CloudVersion, 'id'>) })).sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadVersionJson(version: Pick<CloudVersion, 'path'>): Promise<string> {
  return gunzipToText(await getBytes(ref(storage, version.path)));
}

/** Pins the current cloud head as a named version (it then survives future syncs). */
export async function nameCurrentVersion(
  kind: string,
  localId: string,
  label: string,
  reason: Extract<VersionReason, 'named' | 'publish' | 'before-restore'> = 'named'
): Promise<CloudVersion | null> {
  const headRef = doc(db, COL, cloudProjectId(kind, localId));
  const head = (await getDoc(headRef)).data() as CloudHead | undefined;
  if (!head) return null;
  const vRef = doc(collection(headRef, 'versions'));
  const device = thisDevice();
  const v: Omit<CloudVersion, 'id'> = {
    rev: head.rev,
    path: head.headPath,
    sizeBytes: head.sizeBytes,
    createdAt: head.updatedAt,
    reason,
    label: label.trim() || 'Named version',
    pinned: true,
    deviceId: head.updatedByDevice || device.id,
    ...(head.updatedByDeviceLabel ? { deviceLabel: head.updatedByDeviceLabel } : {}),
  };
  await setDoc(vRef, v);
  await updateDoc(headRef, { headPinned: true });
  return { id: vRef.id, ...v };
}

export async function renameVersion(kind: string, localId: string, versionId: string, label: string) {
  await updateDoc(doc(db, COL, cloudProjectId(kind, localId), 'versions', versionId), {
    label: label.trim(),
    pinned: true,
  });
}

export async function deleteVersion(kind: string, localId: string, version: CloudVersion) {
  const headRef = doc(db, COL, cloudProjectId(kind, localId));
  const head = (await getDoc(headRef)).data() as CloudHead | undefined;
  await deleteDoc(doc(headRef, 'versions', version.id));
  // The head revision itself is still live; only delete files no longer referenced.
  if (head?.headPath !== version.path) {
    await deleteObject(ref(storage, version.path)).catch(() => {});
    noteCloudBytes(kind, -version.sizeBytes);
  }
}

/** Removes the cloud copy and its whole history. */
export async function deleteCloudProject(kind: string, localId: string) {
  if (!auth.currentUser) return;
  const headRef = doc(db, COL, cloudProjectId(kind, localId));
  const head = (await getDoc(headRef).catch(() => null))?.data() as CloudHead | undefined;
  const versions = await listVersions(kind, localId).catch(() => [] as CloudVersion[]);
  for (const v of versions) {
    await deleteDoc(doc(headRef, 'versions', v.id)).catch(() => {});
    await deleteObject(ref(storage, v.path)).catch(() => {});
  }
  if (head) await deleteObject(ref(storage, head.headPath)).catch(() => {});
  await deleteDoc(headRef).catch(() => {});
  noteCloudBytes(kind, -((head?.sizeBytes ?? 0) + versions.reduce((n, v) => n + v.sizeBytes, 0)));
}

export { isPinned };
