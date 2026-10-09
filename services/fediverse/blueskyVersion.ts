// ─── "The Bluesky version" of a Plajah post ───────────────────────────────────
// Plajah posts can do more than a Bluesky post can: polls, data visualisations, embedded albums and videos, locked
// (Sanctuary) content, long-form threads, 3D models. This module is the single place that decides what a native post
// becomes on Bluesky. It is PURE (no SDK, no network) on purpose:
//   • the composer calls it on every keystroke to show "what Bluesky sees", with warnings and an editable override;
//   • the server calls the SAME function at publish time, so the preview is exactly what goes out.
//
// Rules, in plain English:
//   • Locked, private, or members-only posts never leave Plajah.
//   • Text over 300 characters is trimmed (never mid-link) and the post links back to the full version on Plajah.
//   • Up to 4 photos travel as images with their alt text; extra photos stay on Plajah.
//   • Anything Bluesky cannot show natively (poll, video, album, data viz, 3D, long thread) becomes a link card back
//     to the Plajah post, so people on Bluesky can click through and see/play/vote.
//   • Content warnings map onto Bluesky's self-labels so adult/graphic media is blurred there too.

export const BSKY_LIMIT = 300;

export interface NativeMedia {
  type: string;                 // PHOTO | VIDEO | AUDIO | ALBUM | LINK | GIF | STICKER | MODEL3D
  url?: string;
  thumbnail?: string;
  title?: string;
  alt?: string;
  muxPlaybackId?: string;
  linkPreview?: { title?: string; description?: string; image?: string; url: string };
}

/** The slice of a Post (or of composer state) the plan needs. */
export interface NativePostLike {
  text: string;
  authorName?: string;
  media?: NativeMedia[];
  poll?: unknown;
  dataViz?: unknown;
  albumEmbed?: unknown;
  assetEmbed?: { type?: string; title?: string; imageUrl?: string } | null;
  sanctuaryGate?: unknown;
  exclusive?: unknown;
  isPublic?: boolean;
  authorIsPrivate?: boolean;
  orgAudience?: string;
  contentLabels?: string[];
  /** Long-form modes: Bluesky only carries the opening, then points back. */
  postMode?: 'thread' | 'booklet';
  threadChunks?: string[];
  quotedPost?: { authorName?: string; text?: string } | null;
}

export type NoteLevel = 'info' | 'warn';
export interface PlanNote { level: NoteLevel; text: string }

export interface PreviewToken { kind: 'text' | 'link' | 'tag' | 'mention'; text: string }

export interface BlueskyVersion {
  /** Set when the post will NOT be shared (and why). */
  blocked?: string;
  /** Exactly the text Bluesky receives. */
  text: string;
  graphemes: number;
  truncated: boolean;
  images: { url: string; alt: string }[];
  droppedImages: number;
  /** Link card shown under the text (a pasted link, or the way back to the Plajah post). */
  card?: { uri: string; title: string; description?: string; thumbUrl?: string };
  /** Bluesky self-label values (`sexual`, `nudity`, `graphic-media`). */
  labels: string[];
  /** The text split into highlightable pieces (links, #tags, @mentions) for the preview. */
  tokens: PreviewToken[];
  notes: PlanNote[];
  /** Did the plan add the Plajah link to the text itself? */
  linkInText: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function graphemeCount(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let n = 0; for (const _ of (new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })).segment(text)) n++; return n;
  }
  return Array.from(text).length;
}
const graphemeSlice = (text: string, n: number): string => {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const out: string[] = []; for (const s of (new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })).segment(text)) { if (out.length >= n) break; out.push(s.segment); } return out.join('');
  }
  return Array.from(text).slice(0, n).join('');
};

const URL_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;
const TAG_RE = /(^|\s)(#[^\d\s][^\s#]*)/g;
const MENTION_RE = /(^|\s)(@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+)/g;

/** Split text into link / #tag / @mention / plain pieces (mirrors what Bluesky will make clickable). */
export function tokenize(text: string): PreviewToken[] {
  const spans: { start: number; end: number; kind: PreviewToken['kind'] }[] = [];
  for (const m of text.matchAll(URL_RE)) spans.push({ start: m.index!, end: m.index! + m[0].length, kind: 'link' });
  for (const m of text.matchAll(TAG_RE)) spans.push({ start: m.index! + m[1].length, end: m.index! + m[0].length, kind: 'tag' });
  for (const m of text.matchAll(MENTION_RE)) spans.push({ start: m.index! + m[1].length, end: m.index! + m[0].length, kind: 'mention' });
  spans.sort((a, b) => a.start - b.start);
  const out: PreviewToken[] = []; let at = 0;
  for (const s of spans) {
    if (s.start < at) continue; // overlap (e.g. a #tag inside a URL) — the earlier span wins
    if (s.start > at) out.push({ kind: 'text', text: text.slice(at, s.start) });
    out.push({ kind: s.kind, text: text.slice(s.start, s.end) });
    at = s.end;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}

const LABEL_MAP: Record<string, string> = {
  GRAPHIC_VIOLENCE: 'graphic-media',
  MATURE_18: 'sexual',
  ARTISTIC_NUDITY: 'nudity',
};

const firstLine = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 90);

// ── the plan ──────────────────────────────────────────────────────────────────

export function planBlueskyVersion(
  post: NativePostLike,
  opts: { postUrl: string; /** The author's own edit of the Bluesky text. */ override?: string },
): BlueskyVersion {
  const empty = (blocked: string): BlueskyVersion => ({
    blocked, text: '', graphemes: 0, truncated: false, images: [], droppedImages: 0, labels: [], tokens: [], notes: [], linkInText: false,
  });

  // 1) Things that never leave Plajah.
  if (post.sanctuaryGate || post.exclusive) return empty('Locked posts stay on Plajah.');
  if (post.isPublic === false || post.authorIsPrivate || (post.orgAudience && post.orgAudience !== 'PUBLIC')) {
    return empty('Private and members-only posts stay on Plajah.');
  }

  const notes: PlanNote[] = [];
  const media = post.media ?? [];
  const photos = media.filter(m => m.type === 'PHOTO' && m.url);
  const linkMedia = media.find(m => m.type === 'LINK' && m.linkPreview?.url);

  // 2) What can't be shown natively on Bluesky → needs a way back to Plajah.
  const plajahOnly: string[] = [];
  if (post.poll) plajahOnly.push('poll');
  if (post.dataViz) plajahOnly.push('data visualisation');
  if (post.albumEmbed || post.assetEmbed) plajahOnly.push(String(post.assetEmbed?.type ?? 'album').toLowerCase() === 'track' ? 'track' : 'embedded media');
  if (media.some(m => m.type === 'VIDEO')) plajahOnly.push('video');
  if (media.some(m => m.type === 'AUDIO')) plajahOnly.push('audio');
  if (media.some(m => m.type === 'MODEL3D')) plajahOnly.push('3D model');
  if (media.some(m => m.type === 'GIF' || m.type === 'STICKER')) plajahOnly.push('GIF');
  const longForm = !!(post.postMode && (post.threadChunks?.length ?? 0) > 1);
  if (longForm) plajahOnly.push(post.postMode === 'booklet' ? 'multi-page post' : 'long thread');
  if (post.quotedPost) plajahOnly.push('quote of a Plajah post');

  let text = (opts.override ?? (longForm ? post.threadChunks![0] : post.text) ?? '').trim();
  const needsLinkBack = plajahOnly.length > 0;

  for (const what of [...new Set(plajahOnly)]) {
    notes.push({ level: 'info', text: `Bluesky can't show this ${what} — your post there links back to Plajah so people can open it.` });
  }
  if (post.poll) notes.push({ level: 'warn', text: 'Bluesky has no polls. Votes can only be cast on Plajah.' });

  // 3) Images: up to 4, alt text carried across.
  const images = photos.slice(0, 4).map(p => ({ url: p.url!, alt: (p.alt ?? '').trim() }));
  const droppedImages = Math.max(0, photos.length - 4);
  if (droppedImages) notes.push({ level: 'warn', text: `Bluesky takes 4 images; ${droppedImages} more ${droppedImages === 1 ? 'stays' : 'stay'} on Plajah.` });
  const missingAlt = images.filter(i => !i.alt).length;
  if (images.length && missingAlt) notes.push({ level: 'info', text: `${missingAlt} of ${images.length} image${images.length === 1 ? '' : 's'} on Bluesky ${missingAlt === 1 ? 'has' : 'have'} no description — add alt text so everyone can follow the post.` });

  // 4) Card: images win; otherwise a pasted link, otherwise the way back to Plajah.
  let card: BlueskyVersion['card'];
  let linkInText = false;
  const explicitLinkInText = (text.match(URL_RE) ?? []).length > 0;
  if (!images.length) {
    if (needsLinkBack) {
      const thumb = media.find(m => m.thumbnail)?.thumbnail ?? (post.assetEmbed?.imageUrl) ?? photos[0]?.url;
      card = { uri: opts.postUrl, title: post.authorName ? `${post.authorName} on Plajah` : 'Open on Plajah', description: firstLine(text) || undefined, thumbUrl: thumb };
    } else if (linkMedia?.linkPreview) {
      const lp = linkMedia.linkPreview;
      card = { uri: lp.url, title: lp.title || lp.url, description: lp.description, thumbUrl: lp.image };
    }
  } else if (needsLinkBack) {
    linkInText = true; // images occupy the embed slot, so the way back goes into the text itself
  }

  // 5) Fit to 300. The link back (when needed, or whenever we trim) is never the part that gets cut.
  const mustCarryLink = linkInText;
  const tail = mustCarryLink ? `\n\n${opts.postUrl}` : '';
  let truncated = false;
  if (graphemeCount(text + tail) > BSKY_LIMIT) {
    truncated = true;
    const readMore = tail || `\n\n${opts.postUrl}`;
    const budget = Math.max(0, BSKY_LIMIT - graphemeCount(readMore) - 1);
    text = `${graphemeSlice(text, budget).trimEnd()}…${readMore}`;
    linkInText = true;
    if (card && card.uri !== opts.postUrl) card = undefined; // the read-more link replaces a pasted-link card
    notes.push({ level: 'warn', text: `Trimmed to fit Bluesky's ${BSKY_LIMIT}-character limit — the full post is one tap away on Plajah.` });
  } else {
    text = text + tail;
  }
  if (!text && !images.length && !card) return empty('Nothing to share.');

  // 6) Content warnings → Bluesky self-labels.
  const labels = [...new Set((post.contentLabels ?? []).map(l => LABEL_MAP[l]).filter(Boolean))];
  if (labels.length && !images.length) labels.length = 0; // self-labels describe media; no media, nothing to blur
  if (labels.length) notes.push({ level: 'info', text: 'Your content warning travels with the post, so Bluesky blurs the media too.' });

  return { text, graphemes: graphemeCount(text), truncated, images, droppedImages, card, labels, tokens: tokenize(text), notes, linkInText };
}

/** Plain text + link for networks that aren't Bluesky (Mastodon/Threads allow 500 characters). */
export function planPlainVersion(post: NativePostLike, opts: { postUrl: string; limit?: number; override?: string }): { text: string; blocked?: string } {
  const bv = planBlueskyVersion(post, { postUrl: opts.postUrl, override: opts.override });
  if (bv.blocked) return { text: '', blocked: bv.blocked };
  const limit = opts.limit ?? 500;
  const base = (opts.override ?? post.text ?? '').trim();
  const withLink = (t: string) => (t.includes(opts.postUrl) ? t : `${t}\n\n${opts.postUrl}`);
  if (graphemeCount(withLink(base)) <= limit) return { text: withLink(base) };
  const budget = Math.max(0, limit - graphemeCount(`\n\n${opts.postUrl}`) - 1);
  return { text: withLink(`${graphemeSlice(base, budget).trimEnd()}…`) };
}
