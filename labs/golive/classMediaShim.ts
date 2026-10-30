// Lab-only stand-ins for the private class media path: firebase/storage's upload and the server's
// /api/class-club routes, over an IndexedDB byte store every same-origin frame shares. The lab's
// "assets" store plays orgAssets, so window.classMediaLab can delete an original.
import { doc, getDoc } from 'firebase/firestore';

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('golive-lab-class-media', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('assets'); r.result.createObjectStore('bytes'); };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const tx = async <T,>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = work(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const getStorage = () => ({});
export const ref = (_s: unknown, path: string) => ({ path });
export const uploadBytesResumable = (r: { path: string }, file: Blob) => ({
  on(_e: string, _p: unknown, fail: (e: unknown) => void, done: () => void) {
    tx('bytes', 'readwrite', s => s.put(file, r.path)).then(done, fail);
  },
});

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const m = url.match(/^\/api\/class-club\/(\w+)\/([^/]+)\/(.+)$/);
  if (!m) return realFetch(input, init);
  const [, , classId, tail] = m;
  if (tail === 'media/prepare') {
    const body = JSON.parse(String(init?.body));
    const assetId = 'asset_' + Math.random().toString(36).slice(2);
    const uid = new URLSearchParams(location.search).get('who') === 'a' ? 'lab-host' : 'lab-viewer';
    const storagePath = `protected-hq/user/${uid}/${assetId}/${body.fileName}`;
    await tx('assets', 'readwrite', s => s.put({ storagePath, uploadedByUid: uid, mimeType: body.mimeType }, assetId));
    return new Response(JSON.stringify({ assetId, storagePath, scopeKind: 'user', scopeId: uid }));
  }
  if (/^media\/.+\/(finish|abort)$/.test(tail)) return new Response('{}');
  const file = tail.match(/^photos\/([^/]+)\/file$/);
  if (file) {
    const copy = await getDoc(doc({} as any, 'classrooms', classId, 'clubPhotos', file[1]));
    const assetId = (copy.data() as any)?.assetId;
    const asset: any = assetId && await tx('assets', 'readonly', s => s.get(assetId));
    if (!asset) return new Response('{}', { status: 410 });
    const bytes = await tx<Blob>('bytes', 'readonly', s => s.get(asset.storagePath));
    return new Response(bytes);
  }
  return new Response('{}', { status: 404 });
}) as typeof fetch;

(window as any).classMediaLab = {
  assets: () => tx('assets', 'readonly', s => s.getAllKeys()),
  deleteOriginal: (assetId: string) => tx('assets', 'readwrite', s => s.delete(assetId)),
};
