import { getBytes, putBytes, hasBytes } from './mediaStore';
import { getFileFromFolder } from './syncFolders';
import { get as idbGet } from 'idb-keyval';

export type MediaSource = {
  url: string;
  release: () => void;
  local: boolean;
  blob?: Blob;
  origin: 'folder' | 'cache' | 'session' | 'cloud' | 'proxy';
  downloading?: boolean;
};

// Per-asset record of how it last RESOLVED — so the timeline can show a clip is playing from disk (a
// blue local-glow) vs streaming from the cloud. Written on every resolve; the editor subscribes.
export interface MediaOrigin { local: boolean; origin: MediaSource['origin']; downloading?: boolean; }
const originByAsset = new Map<string, MediaOrigin>();
const originListeners = new Set<() => void>();

function recordOrigin(id: string | undefined, local: boolean, origin: MediaSource['origin'], downloading = false): void {
  if (!id) return;
  const prev = originByAsset.get(id);
  if (prev && prev.local === local && prev.origin === origin && prev.downloading === downloading) return;
  originByAsset.set(id, { local, origin, downloading });
  originListeners.forEach((f) => { try { f(); } catch { /* */ } });
}

export function mediaOriginOf(id: string): MediaOrigin | null { return originByAsset.get(id) || null; }
export function subscribeMediaOrigin(cb: () => void): () => void { originListeners.add(cb); return () => originListeners.delete(cb); }

// Listeners for when an asset has finished auto-downloading to local OPFS/IDB storage
const downloadListeners = new Set<(id: string) => void>();
export function onAssetDownloaded(cb: (id: string) => void): () => void {
  downloadListeners.add(cb);
  return () => downloadListeners.delete(cb);
}
function notifyDownloaded(id: string): void {
  downloadListeners.forEach((cb) => { try { cb(id); } catch { /* */ } });
}

// In-flight downloads cache to deduplicate simultaneous requests for the same asset
const inFlightDownloads = new Map<string, Promise<Blob | null>>();

// Safe object URL caching to prevent premature URL.revokeObjectURL during fast scrubbing/re-renders
interface CachedUrl { url: string; refCount: number; timer?: any; }
const blobUrlCache = new WeakMap<Blob, CachedUrl>();

function acquireBlobUrl(blob: Blob): { url: string; release: () => void } {
  let entry = blobUrlCache.get(blob);
  if (!entry) {
    const url = URL.createObjectURL(blob);
    entry = { url, refCount: 1 };
    blobUrlCache.set(blob, entry);
  } else {
    entry.refCount++;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
  }

  const url = entry.url;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const current = blobUrlCache.get(blob);
    if (!current) return;
    current.refCount--;
    if (current.refCount <= 0) {
      // Grace period before revoking: preserves video decoder during scrub/seek churn
      current.timer = setTimeout(() => {
        if (current.refCount <= 0) {
          URL.revokeObjectURL(current.url);
          blobUrlCache.delete(blob);
        }
      }, 6000);
    }
  };

  return { url, release };
}

// When PROXY mode is on, audio playback prefers a lightweight AAC proxy (services/fabula/proxyBuilder
// buildAudioProxy) over the heavy WAV/FLAC original — small, low-memory, decodes fast. This resolver
// runs on the LIVE playback/preview path only; export reads the original url directly (fabulaRender),
// so delivery is always full-quality regardless of this flag.
let audioProxyPref = false;
export function setAudioProxyPreference(on: boolean): void { audioProxyPref = !!on; }

// TWO distinct switches — never conflate them (Resolve/Premiere model):
//  • "Switch to Local" (localOnly): reads come off disk/OPFS ONLY. Nothing ever streams from the cloud;
//    an asset with no on-device copy reads OFFLINE (relink). Disk-first is ALWAYS the default order —
//    this just makes it absolute.
//  • "Sync to Local" (syncMode): explicit, opt-in DOWNLOAD of cloud-only assets, done by the
//    background prefetcher (which yields to playback/scrub). The resolver itself NEVER downloads —
//    a resolve on the live path must be a cheap read, not a second network stream.
let localOnly = false;
export function setLocalOnly(on: boolean): void { localOnly = !!on; }
export function isLocalOnly(): boolean { return localOnly; }
let syncMode = false;
export function setSyncMode(on: boolean): void { syncMode = !!on; }
export function isSyncMode(): boolean { return syncMode; }

/**
 * Automatically downloads a missing asset from its remote URL and persists it
 * to local mediaStore ('studio:blob:<id>'). Deduplicates in-flight calls.
 */
export async function downloadMissingAsset(id: string, remoteUrl: string): Promise<Blob | null> {
  if (!id || !remoteUrl || !/^https?:/i.test(remoteUrl)) return null;

  const key = 'studio:blob:' + id;
  if (await hasBytes(key)) {
    return await getBytes(key);
  }

  const inFlight = inFlightDownloads.get(id);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(remoteUrl, { mode: 'cors' });
      } catch {
        // Cross-origin fallback through internal proxy if direct fails
        res = await fetch(`/api/proxy?url=${encodeURIComponent(remoteUrl)}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        await putBytes(key, blob);
        recordOrigin(id, true, 'cache');
        notifyDownloaded(id);
        return blob;
      }
    } catch (err) {
      console.warn(`[mediaSource] auto-download for asset ${id} failed:`, err);
    } finally {
      inFlightDownloads.delete(id);
    }
    return null;
  })();

  inFlightDownloads.set(id, p);
  return p;
}

/** Audio and video use readable local bytes first, including on recovery. */
export async function resolveMediaSource(asset: any, _recover = false, picture = false): Promise<MediaSource> {
  const owned = (blob: Blob, origin: MediaSource['origin']): MediaSource => {
    const { url, release } = acquireBlobUrl(blob);
    recordOrigin(asset?.id, true, origin);
    return { url, blob, origin, local: true, release };
  };

  // Preview/playback proxy: video only when the monitor asks (picture) and the asset is flagged;
  // audio whenever proxy mode is on (there's no "picture" for audio). Export never reaches here.
  if (asset?.id && ((picture && asset?.previewProxy) || (audioProxyPref && asset?.type === 'audio'))) {
    const proxy = await getBytes('studio:proxy:' + asset.id);
    if (proxy?.size) return owned(proxy, 'proxy');
  }

  if (asset?.localFileHandle) {
    try {
      const handle: any = await idbGet('studio:handle:' + asset.id);
      if (handle && (await handle.queryPermission({ mode: 'read' })) === 'granted') {
        const file = await handle.getFile();
        if (file.size) return owned(file, 'folder');
      }
    } catch { /* cached original remains available when a handle loses permission */ }
  }

  if (asset?.folderId) {
    try {
      const file = await getFileFromFolder(asset.folderId, asset.diskPath || asset.bin || '', asset.diskName || asset.name);
      if (file?.size) return owned(file, 'folder');
    } catch { /* cache next */ }
  }

  if (asset?.id) {
    const cached = await getBytes('studio:blob:' + asset.id);
    if (cached?.size) return owned(cached, 'cache');
  }

  // A blob URL may be expired after a reload. Validate it before mounting it.
  if (/^(blob:|data:)/i.test(asset?.url || '')) {
    try {
      const response = await fetch(asset.url);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size) return owned(blob, 'session');
      }
    } catch { /* local reference expired */ }
  }

  // LAST-RESORT LOCAL fallback: even when proxy mode is OFF (so the preferred branch above was
  // skipped), a proxy sitting on disk still beats streaming the cloud.
  if (asset?.id) {
    const proxy = await getBytes('studio:proxy:' + asset.id);
    if (proxy?.size) return owned(proxy, 'proxy');
  }

  const remote = [asset?.url, asset?.cloudUrl].find((url) => /^https?:/i.test(url || ''));

  if (remote) {
    if (localOnly) throw new Error('LOCAL-ONLY MODE — this asset has no on-device copy; reconnect its drive, relink it, or Sync to Local. (Cloud streaming is off.)');
    recordOrigin(asset?.id, false, 'cloud');
    return { url: remote, origin: 'cloud', local: false, release() {} };
  }

  throw new Error(
    asset?.folderId
      ? 'LOCAL FILE UNAVAILABLE — reconnect its folder or relink the file; no cloud copy is available'
      : 'MEDIA OFFLINE — relink the local file; no cloud copy is available'
  );
}
