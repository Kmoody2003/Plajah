import { getBytes } from './mediaStore';
import { getFileFromFolder } from './syncFolders';

/** Resolve before mounting a decoder. A source stays fixed for the mount's lifetime. */
export async function resolveMediaSource(asset: any, recover = false): Promise<{ url: string; release: () => void; local: boolean }> {
  let blob: Blob | null = null;
  if (asset?.folderId) {
    try { blob = await getFileFromFolder(asset.folderId, asset.diskPath || asset.bin || '', asset.diskName || asset.name); } catch { /* cache next */ }
  }
  // An existing object URL already references local bytes; don't duplicate its storage read.
  if (!blob && !recover && /^blob:|^data:/i.test(asset?.url || '')) return { url: asset.url, local: true, release() {} };
  if (!blob && asset?.id) blob = await getBytes('studio:blob:' + asset.id);
  if (blob?.size) {
    const url = URL.createObjectURL(blob);
    return { url, local: true, release: () => URL.revokeObjectURL(url) };
  }
  return { url: (recover ? asset?.cloudUrl : asset?.url) || asset?.cloudUrl || '', local: false, release() {} };
}
