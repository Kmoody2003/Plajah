// telaStore — persistence for Tela docs (the unified document canvas), P0.
//
// OPFS-first: the full doc bundle (JSON) lives in the Origin Private File
// System under /tela/<id>.json — content never leaves the device in P0.
// Fallback: localStorage (`tela_doc_<id>`) when OPFS is unavailable
// (older Safari, some webviews, private modes).
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

async function telaDir(): Promise<any> {
  const root = await (navigator as any).storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

// ── localStorage fallback ─────────────────────────────────────────────────────

function lsList(): TelaDoc[] {
  const out: TelaDoc[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      try { out.push(JSON.parse(localStorage.getItem(k) || '')); } catch { /* skip corrupt */ }
    }
  } catch { /* private mode */ }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const newTelaId = () => `tela_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
    devices[deviceId] = { ...source, entries };
  }
  return changed ? { ...doc, devices } : doc;
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
    try { localStorage.setItem(LS_PREFIX + doc.id, json); ok = true; }
    catch (e) { console.error('[telaStore] saveTelaDoc failed (no storage available)', e); }
  }
  const synced = ok ? await upsertManifest(doc) : false;
  if (ok) emitDocChanged({ docId: doc.id, versionId: doc.currentVersionId, kind: 'save' });
  return { ok, synced };
}

export async function loadTelaDoc(id: string): Promise<TelaDoc | null> {
  if (await opfsAvailable()) {
    try {
      const dir = await telaDir();
      const fh = await dir.getFileHandle(`${id}.json`);
      const file = await fh.getFile();
      return restoreSensitiveComponents(JSON.parse(await file.text()) as TelaDoc);
    } catch { /* not in OPFS — fall through to localStorage */ }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
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
    if (d?.id && !seen.has(d.id)) metas.push(toMeta(d));
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteTelaDoc(id: string): Promise<void> {
  if (await opfsAvailable()) {
    try { const dir = await telaDir(); await dir.removeEntry(`${id}.json`); }
    catch { /* wasn't there */ }
  }
  try { localStorage.removeItem(LS_PREFIX + id); } catch { /* */ }
  await deleteManifest(id);
}

function toMeta(d: TelaDoc): TelaDocMeta {
  return {
    id: d.id,
    ownerId: d.ownerId || '',
    title: d.title || 'Untitled canvas',
    createdAt: d.createdAt || 0,
    updatedAt: d.updatedAt || 0,
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
    const root = await (navigator as any).storage.getDirectory();
    const tela = await root.getDirectoryHandle(OPFS_DIR, { create: true });
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
    try { localStorage.setItem(`${LS_VER_PREFIX}${doc.id}__${versionId}`, json); ok = true; }
    catch (e) { console.error('[telaStore] publishTelaVersion failed (no storage)', e); }
  }

  // Adopt the stamped fields onto the live doc + persist (saveTelaDoc emits 'save').
  const stamped: TelaDoc = { ...doc, locked: true, currentVersionId: versionId, updatedAt: Date.now() };
  if (ok) await saveTelaDoc(stamped);
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
    const raw = localStorage.getItem(`${LS_VER_PREFIX}${docId}__${versionId}`);
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
    const pref = `${LS_VER_PREFIX}${docId}__`;
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
