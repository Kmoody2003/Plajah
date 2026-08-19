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
import type { TelaDoc, TelaDocMeta } from '../types';

const OPFS_DIR = 'tela';
const LS_PREFIX = 'tela_doc_';
const MANIFEST_COL = 'tela_docs';

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

/** Where docs are being kept on this device (for the save-state indicator). */
export async function telaStorageMode(): Promise<'opfs' | 'local'> {
  return (await opfsAvailable()) ? 'opfs' : 'local';
}

/** Persist a doc bundle locally (OPFS or localStorage) + mirror the manifest. */
export async function saveTelaDoc(doc: TelaDoc): Promise<{ ok: boolean; synced: boolean }> {
  const json = JSON.stringify(doc);
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
  return { ok, synced };
}

export async function loadTelaDoc(id: string): Promise<TelaDoc | null> {
  if (await opfsAvailable()) {
    try {
      const dir = await telaDir();
      const fh = await dir.getFileHandle(`${id}.json`);
      const file = await fh.getFile();
      return JSON.parse(await file.text()) as TelaDoc;
    } catch { /* not in OPFS — fall through to localStorage */ }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? (JSON.parse(raw) as TelaDoc) : null;
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
