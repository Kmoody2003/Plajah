// Server-only storage for Podcasting 2.0 settings: podcast20Feeds/{albumId}. No client rules needed;
// only the API (service account) reads or writes it. Fs functions are injected so tests run offline.

import type { Podcast20Settings } from './types';

export const PODCAST20_COLLECTION = 'podcast20Feeds';

export interface Podcast20Fs {
  fsGet(path: string): Promise<Record<string, any> | null>;
  fsSet(path: string, data: Record<string, unknown>): Promise<boolean>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isSafeAlbumId = (id: string) => SAFE_ID.test(id);

export async function loadPodcast20Settings(fs: Podcast20Fs, albumId: string): Promise<Podcast20Settings | null> {
  if (!isSafeAlbumId(albumId)) return null;
  const d = await fs.fsGet(`${PODCAST20_COLLECTION}/${albumId}`);
  return (d as Podcast20Settings) ?? null;
}

/** Firestore REST can't store `undefined`; drop it everywhere before a write. */
export function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = stripUndefined(x);
    return out as T;
  }
  return v;
}

export async function savePodcast20Settings(fs: Podcast20Fs, albumId: string, settings: Podcast20Settings): Promise<boolean> {
  if (!isSafeAlbumId(albumId)) return false;
  return fs.fsSet(`${PODCAST20_COLLECTION}/${albumId}`, stripUndefined(settings) as Record<string, unknown>);
}
