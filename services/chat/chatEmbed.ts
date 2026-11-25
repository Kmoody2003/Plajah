// chatEmbed — Plajah content shared into a chat plays inline, the same as on the social feed.
//
// A message carries `embed` (a pointer: kind + id, plus a title/cover for the room list). The bubble
// resolves the live item through the viewer's own read access (album, video, film, transfer), so
// nothing playable is ever copied into the message. Older messages are covered too:
//   • `type: 'MEDIA'` + mediaId/mediaType (the old "Share from Library" picker)
//   • a pasted Plajah link (/share?type=album|track|video|reello|movie, /reello/:id, /video/:id,
//     /album/:id, /transfer/:id, ?view=transfer&id=) — the link itself becomes the player.

import { buildShareUrl } from '../deepLinkService';

export type ChatEmbedKind = 'ALBUM' | 'TRACK' | 'VIDEO' | 'REELLO' | 'MOVIE' | 'TRANSFER';

export interface ChatEmbed {
  kind: ChatEmbedKind;
  /** Album id (ALBUM/TRACK), video id (VIDEO/REELLO), title id (MOVIE), transfer id (TRANSFER). */
  id: string;
  /** The song within the album (TRACK). */
  trackId?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
}

const KINDS: ChatEmbedKind[] = ['ALBUM', 'TRACK', 'VIDEO', 'REELLO', 'MOVIE', 'TRANSFER'];

function isPlajahUrl(u: URL): boolean {
  const here = typeof window !== 'undefined' ? window.location.origin : '';
  return u.origin === here || /(^|\.)plajah\.(com|app)$/i.test(u.hostname);
}

/** Read a Plajah share link into an embed; null for anything else. */
export function parsePlajahUrl(raw: string): ChatEmbed | null {
  let u: URL;
  try { u = new URL(raw.trim(), typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com'); }
  catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !isPlajahUrl(u)) return null;
  const q = u.searchParams;
  const type = (q.get('type') || '').toLowerCase();
  const id = q.get('id') || '';
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (id && (type === 'album' || type === 'track')) {
    const track = q.get('track') || undefined;
    return track ? { kind: 'TRACK', id, trackId: track } : { kind: 'ALBUM', id };
  }
  if (id && type === 'video') return { kind: 'VIDEO', id };
  if (id && type === 'reello') return { kind: 'REELLO', id };
  if (id && type === 'movie') return { kind: 'MOVIE', id };
  if (q.get('view') === 'transfer' && id) return { kind: 'TRANSFER', id };
  if (q.get('reello')) return { kind: 'REELLO', id: q.get('reello')! };
  if (q.get('video') && !type) return { kind: 'VIDEO', id: q.get('video')! };
  if (parts.length === 2 && parts[1]) {
    if (parts[0] === 'transfer') return { kind: 'TRANSFER', id: parts[1] };
    if (parts[0] === 'reello') return { kind: 'REELLO', id: parts[1] };
    if (parts[0] === 'video') return { kind: 'VIDEO', id: parts[1] };
    if (parts[0] === 'album') return { kind: 'ALBUM', id: parts[1] };
  }
  return null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** The first Plajah share link in a text, with the URL it came from. */
export function firstPlajahLink(text?: string): { embed: ChatEmbed; url: string } | null {
  if (!text) return null;
  for (const m of text.match(URL_RE) || []) {
    const url = m.replace(/[.,;:!?]+$/, '');
    const embed = parsePlajahUrl(url);
    if (embed) return { embed, url };
  }
  return null;
}

/** Is this a usable embed (shape check — messages come from the network)? */
export function isChatEmbed(e: unknown): e is ChatEmbed {
  const x = e as ChatEmbed;
  return !!x && typeof x === 'object' && KINDS.includes(x.kind) && typeof x.id === 'string' && x.id.length > 0 && x.id.length < 300;
}

/** What a message should play inline, whichever way it was shared. */
export function embedForMessage(m: {
  embed?: unknown; type?: string; mediaId?: string; mediaType?: string; text?: string;
  linkPreview?: { url?: string } | null; attachment?: unknown;
}): { embed: ChatEmbed; url?: string } | null {
  if (isChatEmbed(m.embed)) return { embed: m.embed };
  if (m.attachment) return null;
  if (m.type === 'MEDIA' && m.mediaId && m.mediaType && m.mediaType !== 'TELA') {
    const kind = m.mediaType as ChatEmbedKind;
    if (KINDS.includes(kind)) return { embed: { kind, id: m.mediaId, title: m.text?.replace(/^Shared: /, '') } };
  }
  const fromText = firstPlajahLink(m.text);
  if (fromText) return fromText;
  const pv = m.linkPreview?.url ? parsePlajahUrl(m.linkPreview.url) : null;
  return pv ? { embed: pv, url: m.linkPreview!.url } : null;
}

const KIND_WORD: Record<ChatEmbedKind, string> = {
  ALBUM: 'Album', TRACK: 'Song', VIDEO: 'Video', REELLO: 'Reello', MOVIE: 'Cinema', TRANSFER: 'Files',
};
export const embedKindLabel = (k: ChatEmbedKind) => KIND_WORD[k] || 'Media';

/** Room-list / notification line for a shared item. */
export function embedPreviewLine(e: ChatEmbed): string {
  const icon = e.kind === 'ALBUM' || e.kind === 'TRACK' ? '🎵' : e.kind === 'TRANSFER' ? '📁' : '🎬';
  return `${icon} ${e.title || embedKindLabel(e.kind)}`;
}

/** The landable link for an embed (the "Open" button, and the fallback for anyone without access). */
export function embedShareUrl(e: ChatEmbed): string {
  switch (e.kind) {
    case 'TRACK': return buildShareUrl('track', e.id, { track: e.trackId });
    case 'ALBUM': return buildShareUrl('album', e.id);
    case 'VIDEO': return buildShareUrl('video', e.id);
    case 'REELLO': return buildShareUrl('reello', e.id);
    case 'MOVIE': return buildShareUrl('movie', e.id);
    case 'TRANSFER': {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://plajah.com';
      return `${origin}/?view=transfer&id=${encodeURIComponent(e.id)}`;
    }
  }
}

/** Strip undefined so Firestore accepts it, and cap the free-text fields. */
export function cleanEmbed(e: ChatEmbed): ChatEmbed {
  const out: ChatEmbed = { kind: e.kind, id: e.id };
  if (e.trackId) out.trackId = e.trackId;
  if (e.title) out.title = e.title.slice(0, 200);
  if (e.subtitle) out.subtitle = e.subtitle.slice(0, 200);
  if (e.imageUrl && /^https?:\/\//.test(e.imageUrl)) out.imageUrl = e.imageUrl.slice(0, 1000);
  return out;
}
