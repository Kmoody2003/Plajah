// telaStore — persistence for Tela docs (the unified document canvas), P0.
//
// OPFS-first: the full doc bundle (JSON) lives in the Origin Private File
// System under /tela/u/<uid>/<id>.json, one folder per account on this device.
// Fallback: a per-account localStorage key when OPFS is unavailable
// (older Safari, some webviews, private modes). Older builds kept every account's
// docs together in /tela and `tela_doc_<id>`: a doc moves into an account only when
// its ownerId matches, and the rest stay there unread.
//
// Firestore holds ONLY a small per-doc manifest ({id, title, ownerId,
// createdAt, updatedAt}) in `tela_docs` for listing/sync stubs — auth-guarded
// and a silent no-op for guests, mirroring backendService patterns.

import {
  collection,
  deleteDoc as fsDeleteDoc,
  doc as fsDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from './backendService';
import type { TelaDoc, TelaDocMeta, TelaVersion, TelaVersionMeta } from '../types';
import { decryptWith, encryptWith, isEncrypted } from './cryptoService';
import {
  deleteCloudProject,
  getCloudHead,
  isCloudNewer,
  listCloudProjects,
  loadCloudProject,
  nameCurrentVersion,
  scheduleCreativeSync,
  syncCreativeProject,
} from './creativeCloud/cloudStore';
import { cleanAndReport } from './tela/telaSecurity';
import { activeScopeUid, adoptOwnedValue, scopedKey, userScopedKey } from './userScope';

/** Cloud copies (services/creativeCloud) are filed under this kind. */
export const TELA_CLOUD_KIND = 'tela';

/** Gives up on the network after `ms` so an offline open/list never hangs. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

const OPFS_DIR = 'tela';
const VERSIONS_DIR = 'versions';
const LS_PREFIX = 'tela_doc_';
const LS_VER_PREFIX = 'tela_ver_'; // tela_ver_<docId>__<versionId>
const MANIFEST_COL = 'tela_docs';

/** Cross-instance sync signal — every embed of a doc listens for this so a Lock
 *  (or save) in one surface re-renders the same doc everywhere it is embedded.
 *  This is the "reference, never export" wire: one canonical doc, many views. */
export const TELA_DOC_CHANGED_EVENT = 'tela:doc-changed';
export interface TelaDocChangedDetail { docId: string; versionId?: string; kind: 'save' | 'publish' }
function emitDocChanged(detail: TelaDocChangedDetail): void {
  try { window.dispatchEvent(new CustomEvent(TELA_DOC_CHANGED_EVENT, { detail })); } catch { /* SSR/no-window */ }
}

// ── OPFS plumbing ─────────────────────────────────────────────────────────────

let opfsChecked = false;
let opfsOk = false;

/** OPFS available AND writable (createWritable missing on older Safari). */
async function opfsAvailable(): Promise<boolean> {
  if (opfsChecked) return opfsOk;
  opfsChecked = true;
  try {
    const nav: any = navigator;
    if (!nav?.storage?.getDirectory) { opfsOk = false; return false; }
    const root = await nav.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const probe = await dir.getFileHandle('.probe', { create: true });
    if (typeof (probe as any).createWritable !== 'function') { opfsOk = false; return false; }
    opfsOk = true;
  } catch {
    opfsOk = false;
  }
  return opfsOk;
}

const USERS_DIR = 'u';

/** The shared folder older builds used. Read only to hand docs back to their owners. */
async function legacyTelaDir(): Promise<any> {
  const root = await (navigator as any).storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

/** This account's folder on this device. */
async function telaDir(): Promise<any> {
  const uid = activeScopeUid();
  const users = await (await legacyTelaDir()).getDirectoryHandle(USERS_DIR, { create: true });
  const dir = await users.getDirectoryHandle(uid || 'guest', { create: true });
  if (uid) await adoptLegacyTelaFiles(uid, dir);
  return dir;
}

const adoptedTela = new Map<string, Promise<void>>();
function adoptLegacyTelaFiles(uid: string, dir: any): Promise<void> {
  let run = adoptedTela.get(uid);
  if (!run) { run = moveOwnedTelaFiles(uid, dir).catch(() => {}); adoptedTela.set(uid, run); }
  return run;
}

async function exists(dir: any, name: string): Promise<boolean> {
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}

async function moveFile(from: any, entry: any, to: any): Promise<void> {
  if (await exists(to, entry.name)) return; // this account already has its own copy: the old one stays
  const text = await (await entry.getFile()).text();
  const w = await (await to.getFileHandle(entry.name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
  await from.removeEntry(entry.name);
}

async function moveOwnedTelaFiles(uid: string, dir: any): Promise<void> {
  const legacy = await legacyTelaDir();
  const files: any[] = [];
  for await (const entry of legacy.values()) if (entry.kind === 'file' && entry.name.endsWith('.json')) files.push(entry);
  for (const entry of files) {
    try {
      const d = JSON.parse(await (await entry.getFile()).text()) as TelaDoc;
      if (d?.ownerId === uid) await moveFile(legacy, entry, dir);
    } catch { /* corrupt: stays */ }
  }
  let oldVersions: any;
  try { oldVersions = await legacy.getDirectoryHandle(VERSIONS_DIR); } catch { return; }
  for await (const docDir of oldVersions.values()) {
    if (docDir.kind !== 'directory') continue;
    const versionFiles: any[] = [];
    for await (const entry of docDir.values()) if (entry.kind === 'file' && entry.name.endsWith('.json')) versionFiles.push(entry);
    for (const entry of versionFiles) {
      try {
        const v = JSON.parse(await (await entry.getFile()).text()) as TelaVersion;
        if (v?.bundle?.ownerId !== uid) continue;
        const versions = await dir.getDirectoryHandle(VERSIONS_DIR, { create: true });
        await moveFile(docDir, entry, await versions.getDirectoryHandle(docDir.name, { create: true }));
      } catch { /* corrupt: stays */ }
    }
  }
}

// ── localStorage fallback ─────────────────────────────────────────────────────

const lsDocKey = (id: string) => scopedKey(LS_PREFIX + id);
const lsVersionKey = (docId: string, versionId: string) => scopedKey(`${LS_VER_PREFIX}${docId}__${versionId}`);

/** Moves this account's docs out of the old shared localStorage keys. */
function adoptLegacyLocalDocs(): void {
  const uid = activeScopeUid();
  if (!uid) return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      const isDoc = k.startsWith(LS_PREFIX);
      if (!isDoc && !k.startsWith(LS_VER_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k) || '');
        if ((isDoc ? parsed?.ownerId : parsed?.bundle?.ownerId) === uid) adoptOwnedValue(k, userScopedKey(uid, k));
      } catch { /* corrupt: stays */ }
    }
  } catch { /* private mode */ }
}

function lsList(): TelaDoc[] {
  adoptLegacyLocalDocs();
  const out: TelaDoc[] = [];
  const prefix = scopedKey(LS_PREFIX);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try { out.push(JSON.parse(localStorage.getItem(k) || '')); } catch { /* skip corrupt */ }
    }
  } catch { /* private mode */ }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const newTelaId = () => `tela_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// This scrambles private Notes against casual reading of the raw store; it is not encryption, since
// the secret is built from fields in the same file. The cloud copy must open on the owner's other
// devices, so a device-held key would lose notes. Don't describe it to people as encrypted.
function sensitiveSecret(doc: TelaDoc, deviceId: string) { return `${doc.ownerId}:tela:${doc.id}:${deviceId}`; }

/** Clone and protect sensitive Notes blocks without ever mutating the live document. */
async function protectSensitiveComponents(doc: TelaDoc): Promise<TelaDoc> {
  const clone: TelaDoc = JSON.parse(JSON.stringify(doc));
  for (const device of Object.values(clone.devices)) {
    if (device.type !== 'NOTES' || !device.domainBinding?.encryptedAtRest) continue;
    const secret = sensitiveSecret(clone, device.id);
    for (const entry of device.entries) for (const block of entry.blocks) if (block.text && !isEncrypted(block.text)) block.text = await encryptWith(block.text, secret);
  }
  return clone;
}

async function restoreSensitiveComponents(doc: TelaDoc): Promise<TelaDoc> {
  let changed = false; const devices = { ...doc.devices };
  for (const [deviceId, source] of Object.entries(devices)) {
    if (source.type !== 'NOTES' || !source.domainBinding?.encryptedAtRest) continue;
    const secret = sensitiveSecret(doc, source.id); const entries = [];
    for (const entry of source.entries) {
      const blocks = [];
      for (const block of entry.blocks) { const text = isEncrypted(block.text) ? await decryptWith(block.text, secret) : block.text; if (text !== block.text) changed = true; blocks.push({ ...block, text }); }
      entries.push({ ...entry, blocks });
    }
    const binding = source.domainBinding && { ...source.domainBinding, label: source.domainBinding.label?.replace(' · encrypted', ' · private') };
    devices[deviceId] = { ...source, entries, domainBinding: binding };
  }
  return cleanAndReport(changed ? { ...doc, devices } : doc);
}

/** A doc exactly as the store keeps it (sensitive Notes scrambled) — what cloud history holds. */
export async function serializeTelaDocForStore(doc: TelaDoc): Promise<string> {
  return JSON.stringify(await protectSensitiveComponents(doc));
}

/** Reads a stored / cloud-version JSON back into a live doc. */
export async function telaDocFromStoredJson(json: string): Promise<TelaDoc> {
  return restoreSensitiveComponents(JSON.parse(json) as TelaDoc);
}

/** Where docs are being kept on this device (for the save-state indicator). */
export async function telaStorageMode(): Promise<'opfs' | 'local'> {
  return (await opfsAvailable()) ? 'opfs' : 'local';
}

/** Persist a doc bundle locally (OPFS or localStorage) + mirror the manifest. */
export async function saveTelaDoc(doc: TelaDoc): Promise<{ ok: boolean; synced: boolean }> {
  const json = JSON.stringify(await protectSensitiveComponents(doc));
  let ok = false;
  if (await opfsAvailable()) {
    try {
      const dir = await telaDir();
      const fh = await dir.getFileHandle(`${doc.id}.json`, { create: true });
      const w = await fh.createWritable();
      await w.write(json);
      await w.close();
      ok = true;
    } catch (e) {
      console.warn('[telaStore] OPFS write failed, falling back to localStorage', e);
    }
  }
  if (!ok) {
    try { localStorage.setItem(lsDocKey(doc.id), json); ok = true; }
    catch (e) { console.error('[telaStore] saveTelaDoc failed (no storage available)', e); }
  }
  // A doc someone shared with you syncs through its live co-editing session (services/coedit);
  // your manifest and personal cloud copy are for docs you own.
  const uid = auth.currentUser?.uid;
  const sharedFromOthers = !!uid && !!doc.ownerId && doc.ownerId !== 'local' && doc.ownerId !== uid;
  const synced = ok && !sharedFromOthers ? await upsertManifest(doc) : false;
  if (ok) {
    emitDocChanged({ docId: doc.id, versionId: doc.currentVersionId, kind: 'save' });
    // Cloud copy + version history (throttled; sensitive Notes are already scrambled in `json`).
    if (!sharedFromOthers) scheduleCreativeSync({ kind: TELA_CLOUD_KIND, localId: doc.id, title: doc.title || 'Untitled canvas', json });
  }
  return { ok, synced };
}

/** Writes a doc fetched from the cloud into this device's store (no re-upload). */
async function cacheLocally(json: string, id: string): Promise<void> {
  if (await opfsAvailable()) {
    try {
      const dir = await telaDir();
      const w = await (await dir.getFileHandle(`${id}.json`, { create: true })).createWritable();
      await w.write(json);
      await w.close();
      return;
    } catch { /* fall back */ }
  }
  try { localStorage.setItem(lsDocKey(id), json); } catch { /* full: still opens this session */ }
}

/** Fetches the cloud copy of a doc, caches it on this device, and returns it decrypted. */
async function loadFromCloud(id: string): Promise<TelaDoc | null> {
  const cloud = await withTimeout(loadCloudProject(TELA_CLOUD_KIND, id), 15000, null);
  if (!cloud) return null;
  try {
    await cacheLocally(cloud.json, id);
    return restoreSensitiveComponents(JSON.parse(cloud.json) as TelaDoc);
  } catch { return null; }
}

/**
 * Opens a doc from wherever its newest copy is: this device, or the cloud when another device
 * saved after this one last saw it. Used when the author opens a canvas.
 */
export async function loadTelaDocFreshest(id: string): Promise<TelaDoc | null> {
  const local = await loadLocalTelaDoc(id);
  const head = await withTimeout(getCloudHead(TELA_CLOUD_KIND, id), 4000, null);
  if (head && (!local || isCloudNewer(head, local.updatedAt))) return (await loadFromCloud(id)) ?? local;
  return local;
}

/** This device's copy, falling back to the cloud copy when the doc was made elsewhere. */
export async function loadTelaDoc(id: string): Promise<TelaDoc | null> {
  return (await loadLocalTelaDoc(id)) ?? loadFromCloud(id);
}

async function loadLocalTelaDoc(id: string): Promise<TelaDoc | null> {
  if (await opfsAvailable()) {
    try {
      const dir = await telaDir();
      const fh = await dir.getFileHandle(`${id}.json`);
      const file = await fh.getFile();
      return restoreSensitiveComponents(JSON.parse(await file.text()) as TelaDoc);
    } catch { /* not in OPFS — fall through to localStorage */ }
  }
  try {
    adoptLegacyLocalDocs();
    const raw = localStorage.getItem(lsDocKey(id));
    return raw ? restoreSensitiveComponents(JSON.parse(raw) as TelaDoc) : null;
  } catch { return null; }
}

/** List every locally stored doc (meta only), newest first. */
export async function listTelaDocs(): Promise<TelaDocMeta[]> {
  const metas: TelaDocMeta[] = [];
  const seen = new Set<string>();
  if (await opfsAvailable()) {
    try {
      const dir = await telaDir();
      for await (const entry of (dir as any).values()) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        try {
          const file = await entry.getFile();
          const d = JSON.parse(await file.text()) as TelaDoc;
          if (d?.id) { metas.push(toMeta(d)); seen.add(d.id); }
        } catch { /* skip corrupt bundle */ }
      }
    } catch (e) { console.warn('[telaStore] listTelaDocs OPFS scan failed', e); }
  }
  for (const d of lsList()) {
    if (d?.id && !seen.has(d.id)) { metas.push(toMeta(d)); seen.add(d.id); }
  }
  // Docs saved from the user's other devices (open anywhere; content downloads on open).
  for (const head of await withTimeout(listCloudProjects(TELA_CLOUD_KIND), 4000, [])) {
    const local = metas.find((m) => m.id === head.localId);
    if (local) {
      if (head.updatedAt > local.updatedAt) { local.updatedAt = head.updatedAt; local.title = head.title; }
      continue;
    }
    metas.push({ id: head.localId, ownerId: head.ownerId, title: head.title, createdAt: head.createdAt, updatedAt: head.updatedAt });
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteTelaDoc(id: string): Promise<void> {
  if (await opfsAvailable()) {
    try { const dir = await telaDir(); await dir.removeEntry(`${id}.json`); }
    catch { /* wasn't there */ }
  }
  try { localStorage.removeItem(lsDocKey(id)); } catch { /* */ }
  await deleteManifest(id);
  // Owner only on the server. Someone else clearing their copy gets a refusal, and the document stays for its owner.
  await import('./coedit/project').then(p => p.deleteSharedDoc(TELA_CLOUD_KIND, id)).catch(() => {});
  await deleteCloudProject(TELA_CLOUD_KIND, id).catch(() => {});
}

/** Removes this device's copy of a document someone revoked; the owner's own copies are untouched. */
export async function purgeLocalTelaCopy(id: string): Promise<void> {
  if (await opfsAvailable()) {
    try { const dir = await telaDir(); await dir.removeEntry(`${id}.json`); } catch { /* wasn't there */ }
    try { const dir = await telaDir(); const versions = await dir.getDirectoryHandle(VERSIONS_DIR); await versions.removeEntry(id, { recursive: true }); } catch { /* none */ }
  }
  try {
    localStorage.removeItem(lsDocKey(id));
    const versionPrefix = scopedKey(`${LS_VER_PREFIX}${id}__`);
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(versionPrefix)) localStorage.removeItem(k); }
  } catch { /* private mode */ }
}

function toMeta(d: TelaDoc): TelaDocMeta {
  return {
    id: d.id,
    ownerId: d.ownerId || '',
    title: d.title || 'Untitled canvas',
    createdAt: d.createdAt || 0,
    updatedAt: d.updatedAt || 0,
    ...(d.orgOrigin?.orgId ? { orgId: d.orgOrigin.orgId, orgName: d.orgOrigin.orgName } : {}),
    ...(d.editedBy?.length ? { editedBy: d.editedBy } : {}),
  };
}

// ── Firestore manifest (listing/sync stub only — content stays local) ─────────

/** Auth-guarded manifest upsert. Returns true when the manifest is synced. */
async function upsertManifest(d: TelaDoc): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false; // guests: OPFS/local only, silently
  try {
    // No undefined fields (Firestore rejects them) — build the record explicitly.
    await setDoc(fsDoc(db, MANIFEST_COL, d.id), {
      id: d.id,
      ownerId: user.uid,
      title: d.title || 'Untitled canvas',
      createdAt: d.createdAt || Date.now(),
      updatedAt: d.updatedAt || Date.now(),
      // No undefined (Firestore rejects it) — omit when there's no version yet.
      ...(d.currentVersionId ? { latestVersionId: d.currentVersionId } : {}),
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[telaStore] manifest upsert failed (doc stays local)', e);
    return false;
  }
}

async function deleteManifest(id: string): Promise<void> {
  if (!auth.currentUser) return;
  try { await fsDeleteDoc(fsDoc(db, MANIFEST_COL, id)); }
  catch (e) { console.warn('[telaStore] manifest delete failed', e); }
}

/**
 * Sync stub: the signed-in user's manifests (docs that exist on other devices).
 * P0 lists local bundles only; this exists so P1 sync isn't a rewrite.
 * Deliberately no orderBy (where+orderBy silently needs a composite index) —
 * sorted client-side instead.
 */
export async function listMyManifests(): Promise<TelaDocMeta[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q = query(collection(db, MANIFEST_COL), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs
      .map(s => s.data() as TelaDocMeta)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.warn('[telaStore] listMyManifests failed', e);
    return [];
  }
}

// ── Versions — immutable published snapshots (P2b) ─────────────────────────────
// Lock = publish: freeze the bundle under a new versionId in /tela/versions/
// <docId>/<versionId>.json (localStorage fallback). follow-latest embeds resolve
// to the newest version; pinned copies keep reading the exact versionId they
// were sold at — never mutated under the reader. Version bundles are WRITE-ONCE.

export const newVersionId = () => `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function versionsDir(docId: string, create = false): Promise<any | null> {
  try {
    const tela = await telaDir();
    const versions = await tela.getDirectoryHandle(VERSIONS_DIR, { create });
    return await versions.getDirectoryHandle(docId, { create });
  } catch { return null; }
}

/**
 * Publish an immutable version of `doc` (the Lock action). Writes a frozen
 * snapshot, stamps the doc with `locked: true` + `currentVersionId`, persists
 * the updated live doc, and signals every embed to re-resolve. Returns the new
 * version + the stamped live doc so the caller can adopt it into state.
 */
export async function publishTelaVersion(doc: TelaDoc, label?: string): Promise<{ ok: boolean; version: TelaVersion; doc: TelaDoc }> {
  const versionId = newVersionId();
  // Deep clone so the snapshot can never alias the mutable live doc.
  const bundle: TelaDoc = JSON.parse(JSON.stringify({ ...doc, locked: true, currentVersionId: versionId }));
  const version: TelaVersion = { versionId, docId: doc.id, createdAt: Date.now(), bundle, ...(label ? { label } : {}) };

  let ok = false;
  const storedVersion: TelaVersion = { ...version, bundle: await protectSensitiveComponents(bundle) };
  const json = JSON.stringify(storedVersion);
  if (await opfsAvailable()) {
    try {
      const dir = await versionsDir(doc.id, true);
      if (dir) {
        const fh = await dir.getFileHandle(`${versionId}.json`, { create: true });
        const w = await fh.createWritable();
        await w.write(json);
        await w.close();
        ok = true;
      }
    } catch (e) { console.warn('[telaStore] version OPFS write failed, falling back', e); }
  }
  if (!ok) {
    try { localStorage.setItem(lsVersionKey(doc.id, versionId), json); ok = true; }
    catch (e) { console.error('[telaStore] publishTelaVersion failed (no storage)', e); }
  }

  // Adopt the stamped fields onto the live doc + persist (saveTelaDoc emits 'save').
  const stamped: TelaDoc = { ...doc, locked: true, currentVersionId: versionId, updatedAt: Date.now() };
  if (ok) await saveTelaDoc(stamped);
  // Pin the published edition in the cloud history too (never thinned, opens on any device).
  if (ok) {
    const json = JSON.stringify(await protectSensitiveComponents(stamped));
    void syncCreativeProject({ kind: TELA_CLOUD_KIND, localId: doc.id, title: doc.title || 'Untitled canvas', json })
      .then((r) => (r.state === 'synced' ? nameCurrentVersion(TELA_CLOUD_KIND, doc.id, label || 'Published', 'publish') : null))
      .catch(() => {});
  }
  // Explicit publish signal (versionId set) so follow-latest embeds jump to it.
  if (ok) emitDocChanged({ docId: doc.id, versionId, kind: 'publish' });
  return { ok, version, doc: stamped };
}

/** Load one immutable version bundle (the pinned-copy read path). */
export async function loadTelaVersion(docId: string, versionId: string): Promise<TelaVersion | null> {
  const dir = await versionsDir(docId, false);
  if (dir) {
    try {
      const fh = await dir.getFileHandle(`${versionId}.json`);
      const file = await fh.getFile();
      const parsed = JSON.parse(await file.text()) as TelaVersion;
      return { ...parsed, bundle: await restoreSensitiveComponents(parsed.bundle) };
    } catch { /* not in OPFS — fall through */ }
  }
  try {
    adoptLegacyLocalDocs();
    const raw = localStorage.getItem(lsVersionKey(docId, versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TelaVersion;
    return { ...parsed, bundle: await restoreSensitiveComponents(parsed.bundle) };
  } catch { return null; }
}

/** List a doc's versions (meta only), newest first. */
export async function listTelaVersions(docId: string): Promise<TelaVersionMeta[]> {
  const metas: TelaVersionMeta[] = [];
  const seen = new Set<string>();
  const dir = await versionsDir(docId, false);
  if (dir) {
    try {
      for await (const entry of (dir as any).values()) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        try {
          const file = await entry.getFile();
          const v = JSON.parse(await file.text()) as TelaVersion;
          if (v?.versionId) { metas.push({ versionId: v.versionId, docId, createdAt: v.createdAt || 0, label: v.label }); seen.add(v.versionId); }
        } catch { /* skip corrupt */ }
      }
    } catch { /* dir vanished */ }
  }
  try {
    adoptLegacyLocalDocs();
    const pref = scopedKey(`${LS_VER_PREFIX}${docId}__`);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(pref)) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) || '') as TelaVersion;
        if (v?.versionId && !seen.has(v.versionId)) metas.push({ versionId: v.versionId, docId, createdAt: v.createdAt || 0, label: v.label });
      } catch { /* skip */ }
    }
  } catch { /* private mode */ }
  return metas.sort((a, b) => b.createdAt - a.createdAt);
}

/** The newest published version id for a doc, or null if never locked. */
export async function latestVersionId(docId: string): Promise<string | null> {
  const vs = await listTelaVersions(docId);
  return vs.length ? vs[0].versionId : null;
}

/**
 * Resolve the bundle an embed should render.
 *  - `pinned`  → the exact `versionId` snapshot (immutable; never mutates).
 *  - otherwise → the newest published version if any, else the LIVE doc
 *    (a doc that has never been Locked still shows its working content).
 */
export async function resolveEmbedDoc(
  docId: string,
  mode: 'follow-latest' | 'pinned',
  versionId?: string,
): Promise<{ doc: TelaDoc | null; versionId: string | null }> {
  if (mode === 'pinned' && versionId) {
    const v = await loadTelaVersion(docId, versionId);
    return { doc: v?.bundle ?? null, versionId };
  }
  const latest = await latestVersionId(docId);
  if (latest) {
    const v = await loadTelaVersion(docId, latest);
    if (v) return { doc: v.bundle, versionId: latest };
  }
  return { doc: await loadTelaDoc(docId), versionId: null };
}
