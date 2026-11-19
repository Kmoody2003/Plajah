// "Send to slideshow" — from any photo browser (the Photos file explorer, the library grid):
// selected photos, or a whole folder, go to a new Themed Show or one of the recent shows.

import type { Photo } from '../../types';
import { listLocal } from './projectStore';
import { listAccountShows } from './cloudShows';

/** A show the menu can offer (this device or the account; account wins when both exist). */
export interface ShowTarget { id: string; title: string; photos?: number; savedAt: number; where: 'device' | 'account' }

export type SendTarget = { kind: 'new' } | { kind: 'show'; show: ShowTarget };

/** A photo as the studio takes it in. */
export interface ShowSendItem { id: string; url: string; title?: string; caption?: string; takenAt?: number; timeSource?: 'exif' | 'file' | 'user' }

let cache: { at: number; list: ShowTarget[] } | null = null;

/** Recent shows, newest first, de-duplicated across this device and the account. */
export async function recentShows(limit = 8, fresh = false): Promise<ShowTarget[]> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.list.slice(0, limit);
  const [local, account] = await Promise.all([listLocal().catch(() => []), listAccountShows().catch(() => [])]);
  const byId = new Map<string, ShowTarget>();
  for (const l of local) byId.set(l.id, { id: l.id, title: l.title, photos: l.photos, savedAt: l.savedAt, where: 'device' });
  for (const a of account) {
    const had = byId.get(a.localId);
    if (!had || a.updatedAt >= had.savedAt) byId.set(a.localId, { id: a.localId, title: a.title, photos: had?.photos, savedAt: a.updatedAt, where: 'account' });
  }
  const list = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  cache = { at: Date.now(), list };
  return list.slice(0, limit);
}

export function forgetRecentShows() { cache = null; }

/** Library / file-explorer photos → studio items (videos are skipped). */
export function toSendItems(photos: Photo[]): ShowSendItem[] {
  return photos
    .filter((p) => p.mediaType !== 'VIDEO' && !/\.(mp4|mov|webm|mkv|m4v|avi|mp3|wav|flac|m4a)$/i.test(p.url || p.title || ''))
    .map((p) => ({
      id: p.id, url: p.url, title: p.title?.replace(/\.[^.]+$/, ''),
      // a library photo's description is the owner's; a local file's "description" is its path — never a caption
      caption: p.ownerId === 'local' ? undefined : p.description,
      takenAt: p.timestamp, timeSource: 'file' as const,
    }));
}

/** The event any surface can fire; the Photos views host the studio and answer it. */
export const SEND_TO_SHOW_EVENT = 'plajah:sendToShow';
export interface SendToShowDetail { items: ShowSendItem[]; target: SendTarget; source?: string }

export function sendToShow(items: ShowSendItem[], target: SendTarget, source?: string) {
  if (!items.length) return;
  window.dispatchEvent(new CustomEvent<SendToShowDetail>(SEND_TO_SHOW_EVENT, { detail: { items, target, source } }));
}
