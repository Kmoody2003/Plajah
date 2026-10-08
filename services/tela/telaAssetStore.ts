// telaAssetStore — on-device binary assets for Tela documents.
//
// Doc bundles (telaStore) hold JSON only; binaries such as .lottie archives or
// large Lottie JSON would bloat every save/version snapshot. Assets are written
// once here and referenced from the doc by id:
//
//   OPFS  /tela-assets/<id>              (preferred — no size pressure)
//   localStorage `tela_asset_<id>`       (fallback, data URL, ≤ LS_MAX bytes)
//   memory                               (last resort — session only)
//
// Ids are content-addressed-ish (size + FNV hash) so re-importing the same file
// reuses one copy. Pure browser module: no Firebase, safe for any surface.

const OPFS_DIR = 'tela-assets';
const LS_PREFIX = 'tela_asset_';
const LS_MAX = 3 * 1024 * 1024;

const memory = new Map<string, Blob>();
const urlCache = new Map<string, string>();

async function assetsDir(): Promise<any | null> {
  try {
    const nav: any = navigator;
    if (!nav?.storage?.getDirectory) return null;
    const root = await nav.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch { return null; }
}

function fnv(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  // Sample large files (every Nth byte) — ids only need to be stable, not cryptographic.
  const step = Math.max(1, Math.floor(bytes.length / 262144));
  for (let i = 0; i < bytes.length; i += step) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_.-]/g, '_');

export interface TelaAssetPutResult { assetId: string; persisted: 'opfs' | 'local' | 'memory' }

/** Store a blob on this device; returns its id. Idempotent for identical bytes. */
export async function putTelaAsset(blob: Blob, ext = 'bin'): Promise<TelaAssetPutResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const assetId = `asset_${bytes.length.toString(36)}_${fnv(bytes)}.${ext.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'}`;
  memory.set(assetId, blob);
  const dir = await assetsDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(safeId(assetId), { create: true });
      if (typeof fh.createWritable === 'function') {
        const w = await fh.createWritable();
        await w.write(blob); await w.close();
        return { assetId, persisted: 'opfs' };
      }
    } catch { /* fall through */ }
  }
  if (blob.size <= LS_MAX) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
      localStorage.setItem(LS_PREFIX + assetId, dataUrl);
      return { assetId, persisted: 'local' };
    } catch { /* quota */ }
  }
  return { assetId, persisted: 'memory' };
}

/** Read an asset's bytes, or null when this device has no copy. */
export async function getTelaAssetBlob(assetId: string): Promise<Blob | null> {
  const mem = memory.get(assetId);
  if (mem) return mem;
  const dir = await assetsDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(safeId(assetId));
      const file: File = await fh.getFile();
      memory.set(assetId, file);
      return file;
    } catch { /* not in OPFS */ }
  }
  try {
    const dataUrl = localStorage.getItem(LS_PREFIX + assetId);
    if (dataUrl) { const blob = await (await fetch(dataUrl)).blob(); memory.set(assetId, blob); return blob; }
  } catch { /* private mode */ }
  return null;
}

/** An object URL for the asset (cached per id), or null when missing. */
export async function getTelaAssetUrl(assetId: string): Promise<string | null> {
  const hit = urlCache.get(assetId);
  if (hit) return hit;
  const blob = await getTelaAssetBlob(assetId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(assetId, url);
  return url;
}

export async function hasTelaAsset(assetId: string): Promise<boolean> { return !!(await getTelaAssetBlob(assetId)); }

export async function deleteTelaAsset(assetId: string): Promise<void> {
  memory.delete(assetId);
  const url = urlCache.get(assetId); if (url) { URL.revokeObjectURL(url); urlCache.delete(assetId); }
  const dir = await assetsDir();
  if (dir) { try { await dir.removeEntry(safeId(assetId)); } catch { /* absent */ } }
  try { localStorage.removeItem(LS_PREFIX + assetId); } catch { /* */ }
}
