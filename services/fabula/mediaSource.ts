import { getBytes } from './mediaStore';
import { getFileFromFolder } from './syncFolders';
import {get as idbGet} from 'idb-keyval';

export type MediaSource = { url: string; release: () => void; local: boolean; blob?: Blob; origin: 'folder' | 'cache' | 'session' | 'cloud' | 'proxy' };

// Per-asset record of how it last RESOLVED — so the timeline can show a clip is playing from disk (a
// blue local-glow) vs streaming from the cloud. Written on every resolve; the editor subscribes.
export interface MediaOrigin { local: boolean; origin: MediaSource['origin']; }
const originByAsset = new Map<string, MediaOrigin>();
const originListeners = new Set<() => void>();
function recordOrigin(id: string | undefined, local: boolean, origin: MediaSource['origin']): void {
  if (!id) return;
  const prev = originByAsset.get(id);
  if (prev && prev.local === local && prev.origin === origin) return;
  originByAsset.set(id, { local, origin });
  originListeners.forEach((f) => { try { f(); } catch { /* */ } });
}
export function mediaOriginOf(id: string): MediaOrigin | null { return originByAsset.get(id) || null; }
export function subscribeMediaOrigin(cb: () => void): () => void { originListeners.add(cb); return () => originListeners.delete(cb); }

// When PROXY mode is on, audio playback prefers a lightweight AAC proxy (services/fabula/proxyBuilder
// buildAudioProxy) over the heavy WAV/FLAC original — small, low-memory, decodes fast. This resolver
// runs on the LIVE playback/preview path only; export reads the original url directly (fabulaRender),
// so delivery is always full-quality regardless of this flag.
let audioProxyPref = false;
export function setAudioProxyPreference(on: boolean): void { audioProxyPref = !!on; }

// "Switch to Local" master mode. When ON, resolveMediaSource NEVER falls back to the cloud: an asset
// with no on-device source (disk handle / folder / cache) is reported OFFLINE (relink it) instead of
// streaming — exactly how a native NLE behaves when its media drive is disconnected. Disk-first is
// always the default; this makes it absolute.
let localOnly = false;
export function setLocalOnly(on: boolean): void { localOnly = !!on; }
export function isLocalOnly(): boolean { return localOnly; }

/** Audio and video use readable local bytes first, including on recovery. */
export async function resolveMediaSource(asset: any, _recover = false, picture = false): Promise<MediaSource> {
  const owned = (blob: Blob, origin: MediaSource['origin']): MediaSource => {
    const url = URL.createObjectURL(blob);
    recordOrigin(asset?.id, true, origin);
    return {url,blob,origin,local:true,release:()=>URL.revokeObjectURL(url)};
  };
  // Preview/playback proxy: video only when the monitor asks (picture) and the asset is flagged;
  // audio whenever proxy mode is on (there's no "picture" for audio). Export never reaches here.
  if (asset?.id && ((picture && asset?.previewProxy) || (audioProxyPref && asset?.type === 'audio'))) {
    const proxy = await getBytes('studio:proxy:' + asset.id);
    if (proxy?.size) return owned(proxy,'proxy');
  }
  if (asset?.localFileHandle) {
    try {
      const handle:any = await idbGet('studio:handle:'+asset.id);
      if (handle && await handle.queryPermission({mode:'read'}) === 'granted') {
        const file=await handle.getFile();if(file.size)return owned(file,'folder');
      }
    } catch { /* cached original remains available when a handle loses permission */ }
  }
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
  // LAST-RESORT LOCAL fallback: even when proxy mode is OFF (so the preferred branch above was
  // skipped), a proxy sitting on disk still beats streaming the cloud. This is why "proxies off" now
  // keeps playing locally instead of going black/buffering — the proxy is just another on-device copy.
  if (asset?.id) {
    const proxy = await getBytes('studio:proxy:' + asset.id);
    if (proxy?.size) return owned(proxy,'proxy');
  }
  const remote = [asset?.url,asset?.cloudUrl].find(url => /^https?:/i.test(url || ''));
  if (remote && localOnly) throw new Error('LOCAL-ONLY MODE — this asset has no on-device copy; reconnect its drive, relink it, or Sync to Local. (Cloud streaming is off.)');
  if (remote) { recordOrigin(asset?.id, false, 'cloud'); return {url:remote,origin:'cloud',local:false,release(){}}; }
  throw new Error(asset?.folderId
    ? 'LOCAL FILE UNAVAILABLE — reconnect its folder or relink the file; no cloud copy is available'
    : 'MEDIA OFFLINE — relink the local file; no cloud copy is available');
}
