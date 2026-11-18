// Themed Shows in Plajah social posts — no render.
//
//   A post carries only a reference: assetEmbed { type: 'THEMED_SHOW', id, owner, title, imageUrl }.
//   The show itself stays at public-shows/<owner>/<id>/show.json (cloudShows.publishShow), so the post
//   document stays tiny and the existing post rules (isValidPost) accept it with no new rule code.
//   PostCard renders it with ShowPostCard (cover first; the player loads on tap).
//
//   Posting goes through the main feed composer, so the author's audience / org / Today controls apply.
//   openShowComposer() asks the app to open the feed with the composer prefilled.

import type { ShowRef } from './cloudShows';

export const SHOW_EMBED_TYPE = 'THEMED_SHOW';

export interface ShowAssetEmbed {
  type: typeof SHOW_EMBED_TYPE;
  /** the show id */
  id: string;
  /** the publishing owner's uid */
  owner: string;
  title: string;
  imageUrl?: string;
  subtitle?: string;
}

export function showAssetEmbed(r: ShowRef): ShowAssetEmbed {
  return {
    type: SHOW_EMBED_TYPE, id: r.id, owner: r.owner, title: r.title || 'Themed Show',
    ...(r.cover ? { imageUrl: r.cover } : {}), subtitle: 'Themed Show · plays right here',
  };
}

export function showRefFromEmbed(e: { id?: string; owner?: string; title?: string; imageUrl?: string } | null | undefined): ShowRef | null {
  if (!e?.id || !e.owner) return null;
  return { owner: e.owner, id: e.id, title: e.title, cover: e.imageUrl };
}

/** What the feed composer is prefilled with (FeedView reads it from the composePost event). */
export interface ComposePrefill {
  text?: string;
  assetEmbed?: { type: string; id: string; title: string; imageUrl?: string; subtitle?: string; owner?: string };
  attachments?: Array<{ type: 'VIDEO' | 'PHOTO'; url: string; title?: string; file?: File }>;
}

export const COMPOSE_EVENT = 'plajah:composePost';

/**
 * Open the feed composer prefilled. Works warm (feed mounted: event) and cold (the feed reads
 * window.__composePostPending when it mounts). App switches to the feed on NAVIGATE FEED.
 */
export function openComposer(prefill: ComposePrefill) {
  (window as any).__composePostPending = prefill;
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'FEED' } }));
  // after the view switch has had a frame to mount the feed
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(COMPOSE_EVENT, { detail: prefill })));
}

export function openShowComposer(r: ShowRef, text?: string) {
  openComposer({ text: text ?? (r.title ? `${r.title}` : ''), assetEmbed: showAssetEmbed(r) });
}

/** A rendered MP4/WebM of a show, posted as an ordinary video (the bug is already burned in). */
export function openRenderedVideoComposer(blob: Blob, name: string, text?: string) {
  const file = new File([blob], name, { type: blob.type || 'video/mp4' });
  openComposer({ text, attachments: [{ type: 'VIDEO', url: URL.createObjectURL(file), title: name, file }] });
}

/** `?show=<owner>/<id>[&mode=live]` → the ref + mode, or null. */
export function parseShowLink(search: string): { ref: ShowRef; mode: 'timeline' | 'interactive' } | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const raw = q.get('show');
  if (!raw) return null;
  const [owner, id] = raw.split('/');
  if (!owner || !id || !/^[\w-]{1,128}$/.test(owner) || !/^[\w.-]{1,128}$/.test(id)) return null;
  return { ref: { owner, id }, mode: q.get('mode') === 'live' ? 'interactive' : 'timeline' };
}
