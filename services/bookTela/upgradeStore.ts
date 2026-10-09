// Browser I/O for the Book <-> Tela upgrade. Everything pure lives in upgrade.ts / bookToTela.ts; this file only
// moves bytes: the author's working Tela doc (telaStore, OPFS-first), the upgrade record incl. the original-chapters
// snapshot (IndexedDB, device-local and author-private), and the published reader bundle (Firestore
// albums/{id}/telaVersions/{versionId}, write-once, rule-gated for paid books).
//
// Offline for readers: published bundles are cached in IndexedDB (immutable per versionId, so the cache never
// goes stale) and are read from the cache first, so a book opened once keeps working without a network.

import type { TelaDoc } from '../../types';
import type { BookSource, BookTelaUpgrade } from './types';
import { createUpgrade, makeBundle, type BookTelaBundle, type VersionStamp } from './upgrade';
import { telaDocToBook } from './bookToTela';

export const MAX_BUNDLE_BYTES = 900_000;

// ── IndexedDB (tiny key/value) ───────────────────────────────────────────────

const IDB = 'plajah-book-tela';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('upgrades', { keyPath: 'bookId' }); r.result.createObjectStore('bundles', { keyPath: 'key' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kv<T>(store: 'upgrades' | 'bundles', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((res, rej) => { const rq = fn(db.transaction(store, mode).objectStore(store)); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  } catch { return undefined; }
}

export const saveUpgrade = (u: BookTelaUpgrade) => kv('upgrades', 'readwrite', s => s.put(u));
export const loadUpgrade = (bookId: string) => kv<BookTelaUpgrade | undefined>('upgrades', 'readonly', s => s.get(bookId));
export const deleteUpgrade = (bookId: string) => kv('upgrades', 'readwrite', s => s.delete(bookId));

// ── author flow ──────────────────────────────────────────────────────────────

/** Opt-in upgrade: build the doc, persist doc + record. Never touches the book's chapters. */
export async function upgradeBook(book: BookSource, opts: Parameters<typeof createUpgrade>[1] = {}): Promise<{ upgrade: BookTelaUpgrade; doc: TelaDoc }> {
  const { saveTelaDoc } = await import('../telaStore');
  const r = createUpgrade(book, { ...opts, ownerId: opts.ownerId ?? book.ownerId });
  await saveTelaDoc(r.doc);
  await saveUpgrade(r.upgrade);
  return { upgrade: r.upgrade, doc: r.doc };
}

/** Pull text edits made in Tela back into the book's chapters (the single source of truth is the Tela doc). */
export async function syncFromTela(book: BookSource, upgrade: BookTelaUpgrade) {
  const { loadTelaDoc } = await import('../telaStore');
  const doc = await loadTelaDoc(upgrade.docId);
  if (!doc) return null;
  return { doc, ...telaDocToBook(doc, book) };
}

/** Freeze a version, copy it to Firestore for readers on other devices, and flag the album. */
export async function publishBookTela(album: { id: string; ownerId: string; price?: number }, book: BookSource, upgrade: BookTelaUpgrade, label?: string): Promise<{ ok: boolean; versionId?: string; error?: string }> {
  const [{ loadTelaDoc, publishTelaVersion }, { doc: fsDoc, setDoc, updateDoc, arrayUnion }, { db, auth }] = await Promise.all([
    import('../telaStore'), import('firebase/firestore'), import('../backendService'),
  ]);
  const user = auth.currentUser;
  if (!user || user.uid !== album.ownerId) return { ok: false, error: 'Only the author can publish this book.' };
  const live = await loadTelaDoc(upgrade.docId);
  if (!live) return { ok: false, error: 'The Tela document for this book is not on this device. Open the book on the device where you upgraded it.' };
  const { ok, version } = await publishTelaVersion({ ...live, updatedAt: Date.now() }, label);
  if (!ok) return { ok: false, error: 'Could not store the Tela version on this device.' };
  const synced = telaDocToBook(version.bundle, book);
  const bundle: BookTelaBundle = makeBundle({ ...book, chapters: synced.chapters }, upgrade, version.bundle, version.versionId, Date.now(), label);
  const bundleJson = JSON.stringify(bundle);
  if (bundleJson.length > MAX_BUNDLE_BYTES) return { ok: false, error: 'This book is too large to publish as a Tela edition (embedded images?). Use uploaded image links instead of pasted image data.' };
  try {
    await setDoc(fsDoc(db, 'albums', album.id, 'telaVersions', version.versionId), { versionId: version.versionId, bookId: book.id, ownerId: user.uid, createdAt: bundle.createdAt, ...(label ? { label } : {}), bundleJson });
    // The album carries the (small) version list so readers can pick their version without downloading any bundle.
    await updateDoc(fsDoc(db, 'albums', album.id), {
      'bookTela.enabled': true, 'bookTela.docId': upgrade.docId, 'bookTela.versionId': version.versionId, 'bookTela.upgradedAt': upgrade.upgradedAt,
      'bookTela.layoutPreference': upgrade.layoutPreference ?? 'AUTO', 'bookTela.enhancementCount': upgrade.enhancements.length,
      'bookTela.versions': arrayUnion({ versionId: version.versionId, createdAt: bundle.createdAt }),
    });
    await saveUpgrade({ ...upgrade, publishedVersionId: version.versionId });
    return { ok: true, versionId: version.versionId };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Publish failed.' }; }
}

/** Turn the Tela edition off for readers (classic reader again). Versions stay: buyers pinned to them keep reading. */
export async function disableBookTela(albumId: string): Promise<void> {
  const [{ doc: fsDoc, updateDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('../backendService')]);
  await updateDoc(fsDoc(db, 'albums', albumId), { 'bookTela.enabled': false });
}

// ── reader side ──────────────────────────────────────────────────────────────

async function cacheBundle(albumId: string, versionId: string, json: string) { await kv('bundles', 'readwrite', s => s.put({ key: `${albumId}:${versionId}`, albumId, versionId, json, at: Date.now() })); }

/** Load one immutable bundle (network, then IndexedDB). Returns null when unavailable: caller falls back to the classic reader. */
export async function loadReaderBundle(albumId: string, versionId: string): Promise<BookTelaBundle | null> {
  const key = `${albumId}:${versionId}`;
  const cached = await kv<{ json: string }>('bundles', 'readonly', s => s.get(key));
  if (cached?.json) { try { return JSON.parse(cached.json) as BookTelaBundle; } catch { /* refetch */ } }
  try {
    const [{ doc: fsDoc, getDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('../backendService')]);
    const snap = await getDoc(fsDoc(db, 'albums', albumId, 'telaVersions', versionId));
    if (!snap.exists()) return null;
    const json = (snap.data() as { bundleJson?: string }).bundleJson;
    if (!json) return null;
    await cacheBundle(albumId, versionId, json);
    return JSON.parse(json) as BookTelaBundle;
  } catch { return null; }
}
