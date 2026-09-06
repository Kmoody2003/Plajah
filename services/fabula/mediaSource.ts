import { getBytes } from './mediaStore';
import { getFileFromFolder } from './syncFolders';

export type MediaSource = { url: string; release: () => void; local: boolean; blob?: Blob; origin: 'folder' | 'cache' | 'session' | 'cloud' };

/** Audio and video use readable local bytes first, including on recovery. */
export async function resolveMediaSource(asset: any, _recover = false): Promise<MediaSource> {
  const owned = (blob: Blob, origin: MediaSource['origin']): MediaSource => {
    const url = URL.createObjectURL(blob);
    return {url,blob,origin,local:true,release:()=>URL.revokeObjectURL(url)};
  };
  if (asset?.folderId) {
    try {
      const file = await getFileFromFolder(asset.folderId, asset.diskPath || asset.bin || '', asset.diskName || asset.name);
      if (file?.size) return owned(file,'folder');
    } catch { /* cache next */ }
  }
  if (asset?.id) {
    const cached = await getBytes('studio:blob:' + asset.id);
    if (cached?.size) return owned(cached,'cache');
  }
  // A blob URL may be expired after a reload. Validate it before mounting it.
  if (/^(blob:|data:)/i.test(asset?.url || '')) {
    try {
      const response = await fetch(asset.url);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size) return owned(blob,'session');
      }
    } catch { /* local reference expired */ }
  }
  const remote = [asset?.url,asset?.cloudUrl].find(url => /^https?:/i.test(url || ''));
  if (remote) return {url:remote,origin:'cloud',local:false,release(){}};
  throw new Error(asset?.folderId
    ? 'LOCAL FILE UNAVAILABLE — reconnect its folder or relink the file; no cloud copy is available'
    : 'MEDIA OFFLINE — relink the local file; no cloud copy is available');
}
