// ActivityPub JSON-LD shapes: actor, Note, activities, collections, WebFinger, NodeInfo, host-meta. PURE.

import { AP_CONTEXT, AS_PUBLIC, apUrls } from './config';
import { planBlueskyVersion } from '../fediverse/blueskyVersion';
import { toPlanInput } from './policy';

export interface LocalActorProfile {
  handle: string;
  kind: 'user' | 'org';
  refId: string;
  name: string;
  summary?: string;
  iconUrl?: string;
  headerUrl?: string;
  publicKeyPem: string;
  /** Epoch ms the identity was switched on (Mastodon shows it as "joined"). */
  published?: number;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const URL_RE = /\bhttps?:\/\/[^\s<>()"']+[^\s<>().,;:!?'"]/g;

/** Plain text → minimal safe HTML: escaped, links clickable, paragraphs and line breaks kept. */
export function textToHtml(text: string): string {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  return paras.map(p => {
    let out = ''; let at = 0;
    for (const m of p.matchAll(URL_RE)) {
      out += escapeHtml(p.slice(at, m.index!));
      const u = escapeHtml(m[0]);
      out += `<a href="${u}" rel="nofollow noopener noreferrer" target="_blank">${u}</a>`;
      at = m.index! + m[0].length;
    }
    out += escapeHtml(p.slice(at));
    return `<p>${out.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

/** Remote HTML → plain text for storage (we never store or render remote HTML). */
export function htmlToText(html: string, max = 5000): string {
  const t = String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => { const n = Number(d); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })
    .replace(/&amp;/g, '&')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function buildActor(base: string, p: LocalActorProfile): Record<string, unknown> {
  const u = apUrls(base);
  const url = p.kind === 'user' ? u.userProfile(p.refId) : u.orgProfile(p.refId);
  return {
    '@context': [...AP_CONTEXT, {
      manuallyApprovesFollowers: 'as:manuallyApprovesFollowers',
      toot: 'http://joinmastodon.org/ns#',
      discoverable: 'toot:discoverable',
      indexable: 'toot:indexable',
    }],
    id: u.actor(p.handle),
    type: p.kind === 'org' ? 'Organization' : 'Person',
    preferredUsername: p.handle,
    name: p.name || p.handle,
    summary: p.summary ? textToHtml(p.summary.slice(0, 1000)) : '',
    url,
    inbox: u.inbox(p.handle),
    outbox: u.outbox(p.handle),
    followers: u.followers(p.handle),
    following: u.following(p.handle),
    endpoints: { sharedInbox: u.sharedInbox() },
    manuallyApprovesFollowers: false,
    discoverable: true,
    indexable: true,
    ...(p.published ? { published: new Date(p.published).toISOString() } : {}),
    ...(p.iconUrl ? { icon: { type: 'Image', url: p.iconUrl } } : {}),
    ...(p.headerUrl ? { image: { type: 'Image', url: p.headerUrl } } : {}),
    attachment: [{ type: 'PropertyValue', name: 'Plajah', value: `<a href="${escapeHtml(url)}" rel="me nofollow noopener noreferrer" target="_blank">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a>` }],
    publicKey: { id: u.keyId(p.handle), owner: u.actor(p.handle), publicKeyPem: p.publicKeyPem },
  };
}

export function buildInstanceActor(base: string, publicKeyPem: string): Record<string, unknown> {
  const u = apUrls(base);
  const host = new URL(base).host;
  return {
    '@context': [...AP_CONTEXT],
    id: u.instanceActor(),
    type: 'Application',
    preferredUsername: host,
    name: 'Plajah',
    url: base,
    inbox: u.sharedInbox(),
    outbox: `${u.instanceActor()}/outbox`,
    manuallyApprovesFollowers: true,
    publicKey: { id: u.instanceKeyId(), owner: u.instanceActor(), publicKeyPem },
  };
}

const LABEL_WARNINGS: Record<string, string> = {
  GRAPHIC_VIOLENCE: 'Graphic violence', MATURE_18: 'Mature (18+)', ARTISTIC_NUDITY: 'Artistic nudity', SENSITIVE_OTHER: 'Sensitive',
};

function guessMediaType(kind: 'image' | 'video' | 'audio', url: string): string {
  const ext = (/\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(url)?.[1] || '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', heic: 'image/heic',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  };
  return map[ext] || (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'audio/mpeg');
}

const isHttpUrl = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u) && u.length < 2048;

/** A public Plajah post → ActivityPub Note. Caller has already run judgePost(). */
export function buildNote(base: string, post: Record<string, any> & { id: string }, handle: string): Record<string, unknown> {
  const u = apUrls(base);
  const postUrl = u.postPage(post.id);
  const media: any[] = Array.isArray(post.media) ? post.media : [];
  const attachment: Record<string, unknown>[] = [];
  for (const m of media) {
    if (attachment.length >= 4) break;
    const alt = typeof m.alt === 'string' ? m.alt.slice(0, 1500) : undefined;
    if ((m.type === 'PHOTO' || m.type === 'GIF') && isHttpUrl(m.url)) {
      attachment.push({ type: 'Document', mediaType: guessMediaType('image', m.url), url: m.url, ...(alt ? { name: alt } : {}),
        ...(m.width ? { width: Number(m.width) } : {}), ...(m.height ? { height: Number(m.height) } : {}) });
    } else if (m.type === 'VIDEO' && isHttpUrl(m.url)) {
      attachment.push({ type: 'Document', mediaType: guessMediaType('video', m.url), url: m.url, ...(alt ? { name: alt } : {}) });
    } else if (m.type === 'AUDIO' && isHttpUrl(m.url)) {
      attachment.push({ type: 'Document', mediaType: guessMediaType('audio', m.url), url: m.url, ...(alt || m.title ? { name: alt || m.title } : {}) });
    }
  }
  // Things other networks can't play (polls, Mux-only video, albums, 3D, long threads, quotes) get the way back.
  const plan = planBlueskyVersion(toPlanInput(post), { postUrl });
  const droppedMedia = media.some(m => !['PHOTO', 'GIF', 'LINK'].includes(m.type) && !(['VIDEO', 'AUDIO'].includes(m.type) && isHttpUrl(m.url)))
    || media.filter(m => ['PHOTO', 'GIF', 'VIDEO', 'AUDIO'].includes(m.type)).length > 4;
  const needsLinkBack = plan.linkInText || plan.card?.uri === postUrl || droppedMedia;
  const text = String(post.text ?? '').trim();
  let content = textToHtml(text);
  if (needsLinkBack) content += `<p><a href="${escapeHtml(postUrl)}" rel="nofollow noopener noreferrer" target="_blank">Open on Plajah</a></p>`;

  const labels: string[] = Array.isArray(post.contentLabels) ? post.contentLabels : [];
  const warnings = labels.map(l => LABEL_WARNINGS[l]).filter(Boolean);
  const tags = (Array.isArray(post.hashtags) ? post.hashtags : []).filter((t: unknown) => typeof t === 'string' && /^[\p{L}\p{N}_]{1,64}$/u.test(t as string)).slice(0, 20)
    .map((t: string) => ({ type: 'Hashtag', name: `#${t}` }));
  const published = new Date(Number(post.timestamp) || Date.now()).toISOString();
  return {
    id: u.note(post.id),
    type: 'Note',
    attributedTo: u.actor(handle),
    to: [AS_PUBLIC],
    cc: [u.followers(handle)],
    published,
    ...(post.modifiedAt ? { updated: new Date(Number(post.modifiedAt)).toISOString() } : {}),
    url: postUrl,
    inReplyTo: null,
    content,
    sensitive: warnings.length > 0,
    summary: warnings.length ? `Content warning: ${warnings.join(', ')}` : null,
    attachment,
    tag: tags,
  };
}

export function buildCreate(base: string, note: Record<string, any>): Record<string, unknown> {
  return {
    '@context': [...AP_CONTEXT],
    id: `${note.id}/activity`,
    type: 'Create',
    actor: note.attributedTo,
    published: note.published,
    to: note.to,
    cc: note.cc,
    object: note,
  };
}

export function buildDelete(base: string, postId: string, handle: string): Record<string, unknown> {
  const u = apUrls(base);
  return {
    '@context': [...AP_CONTEXT],
    id: `${u.note(postId)}#delete`,
    type: 'Delete',
    actor: u.actor(handle),
    to: [AS_PUBLIC],
    cc: [u.followers(handle)],
    object: { id: u.note(postId), type: 'Tombstone' },
  };
}

export function buildAccept(base: string, handle: string, follow: Record<string, any>, nonce: string): Record<string, unknown> {
  const u = apUrls(base);
  return {
    '@context': [...AP_CONTEXT],
    id: `${u.actor(handle)}#accepts/follows/${nonce}`,
    type: 'Accept',
    actor: u.actor(handle),
    object: { id: follow.id, type: 'Follow', actor: follow.actor, object: u.actor(handle) },
  };
}

export function orderedCollection(id: string, totalItems: number | undefined, first?: string): Record<string, unknown> {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id, type: 'OrderedCollection',
    ...(totalItems !== undefined ? { totalItems } : {}),
    ...(first ? { first } : {}),
  };
}

export function orderedCollectionPage(id: string, partOf: string, items: unknown[], next?: string): Record<string, unknown> {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id, type: 'OrderedCollectionPage', partOf, orderedItems: items,
    ...(next ? { next } : {}),
  };
}

export function webfingerDoc(base: string, handle: string, profileUrl: string): Record<string, unknown> {
  const u = apUrls(base);
  return {
    subject: `acct:${handle}@${new URL(base).host}`,
    aliases: [u.actor(handle), profileUrl],
    links: [
      { rel: 'self', type: 'application/activity+json', href: u.actor(handle) },
      { rel: 'http://webfinger.net/rel/profile-page', type: 'text/html', href: profileUrl },
    ],
  };
}

/** acct:name@host / name@host / @name@host / an actor URL → { handle, host } */
export function parseWebfingerResource(resource: unknown, base: string): { handle: string; host: string } | null {
  if (typeof resource !== 'string' || resource.length > 300) return null;
  const host = new URL(base).host.toLowerCase();
  if (resource.startsWith(`${base}/ap/users/`)) {
    const h = resource.slice(`${base}/ap/users/`.length);
    return h && !h.includes('/') ? { handle: decodeURIComponent(h).toLowerCase(), host } : null;
  }
  const m = /^(?:acct:)?@?([^@\s]+)@([^@\s]+)$/i.exec(resource.trim());
  if (!m) return null;
  return { handle: m[1].toLowerCase(), host: m[2].toLowerCase() };
}

export function nodeinfoLinks(base: string) {
  return { links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${base}/nodeinfo/2.1` }] };
}

export function nodeinfoDoc(opts: { version: string; users?: number; openRegistrations?: boolean }) {
  return {
    version: '2.1',
    software: { name: 'plajah', version: opts.version, homepage: 'https://plajah.com' },
    protocols: ['activitypub'],
    services: { inbound: [], outbound: [] },
    openRegistrations: opts.openRegistrations ?? true,
    usage: { users: opts.users !== undefined ? { total: opts.users } : {} },
    metadata: { nodeName: 'Plajah' },
  };
}

export function hostMetaXml(base: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">\n  <Link rel="lrdd" template="${escapeHtml(base)}/.well-known/webfinger?resource={uri}"/>\n</XRD>\n`;
}
