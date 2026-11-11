// ─── What may go to Nostr, and what it looks like there ───────────────────────
// PURE (no network, no Firestore) so the route, the tests and a future composer preview share one answer.
//
//   • Nostr is opt-in and OFF by default.
//   • Never for child / under-18 accounts or managed employee profiles.
//   • Posts made AS a church / faith / school / nonprofit org stay home unless an org admin opted that org in.
//   • Locked, private, members-only, org-internal posts never leave Plajah (same judge as Bluesky: planBlueskyVersion).
//   • Paywalled / preview-only / exclusive / draft / unreleased music never leaves Plajah; priced tracks go out as a
//     link back (no direct audio URL), free tracks carry their audio URL.
//
// Music format: kind 1 note + NIP-92 `imeta` media tags (+ `r` link back). We do NOT emit kind 31337: the
// Wavlake / music-client track schemas are not a ratified NIP and we were not confident of the exact tag set.

import { planBlueskyVersion, type NativePostLike } from '../fediverse/blueskyVersion';
import { KIND, nowSec, type UnsignedEvent } from './event';

export const RESTRICTED_ORG_TYPES = new Set(['CHURCH', 'RELIGIOUS', 'NONPROFIT', 'OTHER', 'SCHOOL', 'CHARITY']);

export function isMinorProfile(p: Record<string, any> | null | undefined, now = new Date()): boolean {
  if (!p) return false;
  if (p.isChild === true || p.accountType === 'CHILD') return true;
  const by = Number(p.birthYear);
  if (by > 1900 && now.getFullYear() - by < 18) return true;
  if (typeof p.dateOfBirth === 'string' || typeof p.dateOfBirth === 'number') {
    const d = new Date(p.dateOfBirth);
    if (!isNaN(+d)) {
      const age = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
      if (age < 18) return true;
    }
  }
  return false;
}

/** Can this person use Nostr at all? null = yes, otherwise the reason. */
export function userIneligibleReason(p: Record<string, any> | null | undefined): string | null {
  if (!p) return 'Account not found.';
  if (isMinorProfile(p)) return 'Nostr is not available on under-18 accounts.';
  if (p.accountType === 'EMPLOYEE') return 'Managed employee profiles cannot link Nostr.';
  return null;
}

/** Can posts made AS this org go to Nostr? */
export function orgIneligibleReason(org: Record<string, any> | null | undefined, optIn: boolean): string | null {
  if (!org) return null;
  const t = String(org.orgType || '').toUpperCase();
  const restricted = RESTRICTED_ORG_TYPES.has(t) || org.isSchool === true;
  if (restricted && !optIn) return 'This organization has not turned on Nostr. An org admin can opt in.';
  return null;
}

const appBase = () => (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
export const postUrlFor = (postId: string) => `${appBase()}/share?type=feed&id=${encodeURIComponent(postId)}`;
export const trackUrlFor = (albumId: string, trackId: string) => `${appBase()}/share?type=album&id=${encodeURIComponent(albumId)}&track=${encodeURIComponent(trackId)}`;
export const profileUrlFor = (uid: string) => `${appBase()}/profile/${encodeURIComponent(uid)}`;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
};
export function guessMime(url: string): string | undefined {
  try { const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''; return MIME_BY_EXT[ext]; } catch { return undefined; }
}
const isHttpUrl = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u) && u.length < 2000;

function imeta(url: string, alt?: string, mime?: string): string[] {
  const t = ['imeta', `url ${url}`];
  const m = mime ?? guessMime(url);
  if (m) t.push(`m ${m}`);
  if (alt?.trim()) t.push(`alt ${alt.trim().slice(0, 500)}`);
  return t;
}
function hashtags(text: string): string[][] {
  const tags = new Set<string>();
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_]{2,40})/gu)) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 10).map(t => ['t', t]);
}
const CW: Record<string, string> = {
  GRAPHIC_VIOLENCE: 'Graphic violence', MATURE_18: 'Mature (18+)', ARTISTIC_NUDITY: 'Artistic nudity', SENSITIVE_OTHER: 'Sensitive content',
};

export function toPlanInput(post: Record<string, any>): NativePostLike {
  return {
    text: String(post.text ?? ''), authorName: post.authorName,
    media: Array.isArray(post.media) ? post.media : [],
    poll: post.poll, dataViz: post.dataViz, albumEmbed: post.albumEmbed, assetEmbed: post.assetEmbed ?? null,
    sanctuaryGate: post.sanctuaryGate, exclusive: post.exclusive,
    isPublic: post.isPublic, authorIsPrivate: post.authorIsPrivate, orgAudience: post.orgAudience,
    contentLabels: post.contentLabels, postMode: post.postMode, threadChunks: post.threadChunks,
    quotedPost: post.quotedPost ?? null, replyAudience: post.replyAudience,
  };
}

/** A Plajah post → kind-1 note template (or why it stays home). */
export function postToNote(post: Record<string, any>, postId: string): { blocked?: string; template?: UnsignedEvent } {
  const postUrl = postUrlFor(postId);
  const input = toPlanInput(post);
  const plan = planBlueskyVersion(input, { postUrl });
  if (plan.blocked) return { blocked: plan.blocked };
  if (post.isDraft || post.status === 'DRAFT' || post.removed || post.isRemoved || post.moderationStatus === 'REMOVED') return { blocked: 'This post is not published.' };
  if (post.audience && !['PUBLIC', 'EVERYONE'].includes(String(post.audience).toUpperCase())) return { blocked: 'Only public posts can go to Nostr.' };

  const longForm = !!(post.postMode && Array.isArray(post.threadChunks) && post.threadChunks.length > 1);
  let text = String(longForm ? post.threadChunks.join('\n\n') : post.text ?? '').trim();
  const tags: string[][] = [];
  const media = (input.media ?? []).filter(m => isHttpUrl(m.url) && ['PHOTO', 'VIDEO', 'GIF'].includes(String(m.type)));
  const urls: string[] = [];
  for (const m of media.slice(0, 8)) { urls.push(m.url!); tags.push(imeta(m.url!, m.alt)); }
  if (urls.length) text += `\n\n${urls.join('\n')}`;
  text += `\n\n${postUrl}`;
  tags.push(...hashtags(text), ['r', postUrl], ['client', 'Plajah']);
  const labels = [...new Set((post.contentLabels ?? []) as string[])].map(l => CW[l]).filter(Boolean);
  if (labels.length) tags.push(['content-warning', labels.join(', ')]);
  return { template: { kind: KIND.NOTE, created_at: nowSec(), content: text.slice(0, 16_000), tags } };
}

/** A Chora track → kind-1 note with NIP-92 imeta (or why it stays home). */
export function trackToNote(album: Record<string, any>, track: Record<string, any>, albumId: string, now = Date.now()): { blocked?: string; template?: UnsignedEvent } {
  if (album.isDraft) return { blocked: 'Drafts stay on Plajah.' };
  if (album.isPublic === false || album.isPrivate || album.isIntimateOnly) return { blocked: 'Private releases stay on Plajah.' };
  if (album.isPaywalled || album.previewOnly || track.isPaywalled || track.isExclusive) return { blocked: 'Paywalled and members-only music stays on Plajah.' };
  if (track.isPersonalMedia) return { blocked: 'Personal uploads are not releases.' };
  if (album.releaseDate && Number(album.releaseDate) > now) return { blocked: 'This release is not out yet.' };
  const trackUrl = trackUrlFor(albumId, String(track.id));
  const priced = Number(album.price) > 0 || Number(track.price) > 0;
  const audio = !priced ? [track.url, track.browserCompatUrl].find(isHttpUrl) : undefined;
  const cover = [track.images?.[0], album.coverImage, album.coverThumb].find(isHttpUrl);
  const title = String(track.title || 'Untitled').slice(0, 200);
  const artist = String(track.artist || album.artist || '').slice(0, 200);
  const lines = [`🎵 ${title}${artist ? ` by ${artist}` : ''}`];
  if (album.title && album.title !== title) lines.push(`from ${String(album.title).slice(0, 200)}`);
  if (audio) lines.push('', audio);
  if (cover) lines.push(cover);
  lines.push('', `Listen on Plajah: ${trackUrl}`);
  const tags: string[][] = [['t', 'music'], ['t', 'nostrmusic'], ['r', trackUrl], ['client', 'Plajah'], ['subject', title]];
  if (album.genre || track.genre) tags.push(['t', String(track.genre || album.genre).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40)]);
  if (audio) tags.push(imeta(audio, `${title}${artist ? ` — ${artist}` : ''}`));
  if (cover) tags.push(imeta(cover, `Cover art for ${title}`));
  if ((track.trackMeta as any)?.explicit) tags.push(['content-warning', 'Explicit lyrics']);
  return { template: { kind: KIND.NOTE, created_at: nowSec(), content: lines.join('\n'), tags: tags.filter(t => t[1]) } };
}

/** Kind-0 profile metadata from the Plajah profile + Nostr settings. */
export function profileTemplate(p: Record<string, any>, uid: string, extra: { nip05?: string; lud16?: string }): UnsignedEvent {
  const meta: Record<string, string> = {};
  const name = String(p.displayName || p.name || '').trim();
  if (name) { meta.name = name.slice(0, 100); meta.display_name = meta.name; }
  const about = String(p.bio || p.about || '').trim();
  if (about) meta.about = about.slice(0, 1000);
  const pic = [p.photoURL, p.avatarUrl, p.profileImage].find(isHttpUrl);
  if (pic) meta.picture = pic;
  const banner = [p.bannerUrl, p.coverImage, p.headerImage].find(isHttpUrl);
  if (banner) meta.banner = banner;
  meta.website = profileUrlFor(uid);
  if (extra.nip05) meta.nip05 = extra.nip05;
  if (extra.lud16) meta.lud16 = extra.lud16;
  return { kind: KIND.METADATA, created_at: nowSec(), content: JSON.stringify(meta), tags: [['client', 'Plajah']] };
}

export function deleteTemplate(eventIds: string[], reason = 'Removed on Plajah'): UnsignedEvent {
  return { kind: KIND.DELETE, created_at: nowSec(), content: reason, tags: eventIds.slice(0, 50).map(id => ['e', id]) };
}

/** Link challenge: a NIP-42-style kind-22242 event the user signs to prove they hold the key. */
export function challengeTemplate(challenge: string): UnsignedEvent {
  return { kind: KIND.CLIENT_AUTH, created_at: nowSec(), content: 'Link this Nostr key to my Plajah account.', tags: [['challenge', challenge], ['relay', 'plajah']] };
}

const NIP05_NAME = /^[a-z0-9._-]{1,40}$/;
export function normalizeNip05Name(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!NIP05_NAME.test(s) || s === '_') return null;
  return s;
}
