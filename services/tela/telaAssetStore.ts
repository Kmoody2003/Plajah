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
// reuses one copy.

const OPFS_DIR = 'tela-assets';
const LS_PREFIX = 'tela_asset_';
const LS_MAX = 3 * 1024 * 1024;

const memory = new Map<string, Blob>();
const urlCache = new Map<string, string>();

// One browser, many accounts: each person's assets live in their own folder. Files from before this split have no
// owner, so one moves across only when a document this account opened asks for it by id. Nothing lists them.
async function scopeOf(): Promise<string> {
  try { const { activeScopeUid } = await import('../userScope'); return activeScopeUid() || 'guest'; } catch { return 'guest'; }
}
async function legacyDir(): Promise<any | null> {
  try {
    const nav: any = navigator;
    if (!nav?.storage?.getDirectory) return null;
    const root = await nav.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch { return null; }
}
async function assetsDir(): Promise<any | null> {
  try {
    const base = await legacyDir();
    return base ? await base.getDirectoryHandle(`u_${(await scopeOf()).replace(/[^\w-]/g, '_')}`, { create: true }) : null;
  } catch { return null; }
}
const lsKey = async (assetId: string) => `${LS_PREFIX}${await scopeOf()}_${assetId}`;

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
      localStorage.setItem(await lsKey(assetId), dataUrl);
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
    // An unowned file from before the per-account split: this account's document named it, so it moves in.
    try {
      const old = await legacyDir();
      if (old) {
        const file: File = await (await old.getFileHandle(safeId(assetId))).getFile();
        const fh = await dir.getFileHandle(safeId(assetId), { create: true });
        if (typeof fh.createWritable === 'function') { const w = await fh.createWritable(); await w.write(file); await w.close(); await old.removeEntry(safeId(assetId)).catch(() => {}); }
        memory.set(assetId, file);
        return file;
      }
    } catch { /* not there either */ }
  }
  try {
    const dataUrl = localStorage.getItem(await lsKey(assetId)) ?? localStorage.getItem(LS_PREFIX + assetId);
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
