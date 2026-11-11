// Podcasting 2.0 tag rendering (namespace https://podcastindex.org/namespace/1.0, prefix "podcast").
// Every function returns '' when it has nothing to say, so a feed without settings is unchanged.

import { attrs, cdata, el, xmlEsc } from './xml';
import { podcastGuidFor } from './guid';
import type {
  AlternateEnclosure, EpisodeExtras, LiveItemSettings, Podcast20FeedContext, Podcast20Settings,
  PodcastLocation, PodcastPerson, RemoteItem, ValueBlock,
} from './types';

/** licensingService ContentLicenseId → SPDX-style slug the spec expects. All Rights Reserved emits nothing. */
const LICENSE_SLUGS: Record<string, { slug: string; url: string }> = {
  CC_BY: { slug: 'cc-by-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  CC_BY_SA: { slug: 'cc-by-sa-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  CC_BY_ND: { slug: 'cc-by-nd-4.0', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  CC_BY_NC: { slug: 'cc-by-nc-4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  CC_BY_NC_SA: { slug: 'cc-by-nc-sa-4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  CC_BY_NC_ND: { slug: 'cc-by-nc-nd-4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  CC0: { slug: 'cc0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
};

const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000);

export const personTag = (p: PodcastPerson) =>
  el('podcast:person', { role: p.role, group: p.group, img: p.img, href: p.href }, p.name);

export const locationTag = (l?: PodcastLocation) =>
  l?.name ? el('podcast:location', { rel: l.rel, geo: l.geo, osm: l.osm }, l.name) : '';

export const remoteItemTag = (r: RemoteItem) =>
  el('podcast:remoteItem', { feedGuid: r.feedGuid, feedUrl: r.feedUrl, itemGuid: r.itemGuid, medium: r.medium, title: r.title });

/** podcast:value with its recipients. Payments go app → recipient address directly; no Plajah wallet is involved. */
export function valueTag(v?: ValueBlock, indent = '    '): string {
  if (!v?.recipients?.length) return '';
  const rows = v.recipients.map(r => `${indent}  ${el('podcast:valueRecipient', {
    name: r.name, type: r.type, address: r.address, split: fmtNum(r.split),
    customKey: r.customKey, customValue: r.customValue, fee: r.fee ? 'true' : undefined,
  })}`).join('\n');
  return `${indent}<podcast:value${attrs({ type: v.type || 'lightning', method: v.method || 'keysend', suggested: v.suggested })}>\n${rows}\n${indent}</podcast:value>`;
}

function socialTag(s: EpisodeExtras['socialInteract'], priority?: number): string {
  if (!s?.uri) return '';
  return el('podcast:socialInteract', { uri: s.uri, protocol: s.protocol || 'activitypub', accountId: s.accountId, accountUrl: s.accountUrl, priority });
}

function altEnclosureTag(a: AlternateEnclosure, indent: string): string {
  return `${indent}<podcast:alternateEnclosure${attrs({ type: a.type, length: a.length, bitrate: a.bitrate, height: a.height, lang: a.lang, title: a.title, rel: a.rel, default: a.default ? 'true' : undefined })}>\n${indent}  ${el('podcast:source', { uri: a.uri })}\n${indent}</podcast:alternateEnclosure>`;
}

/** The feed's guid: pinned value if the owner's settings have one, else derived from the feed URL. */
export function feedGuid(ctx: Pick<Podcast20FeedContext, 'settings' | 'feedUrl'>): string | undefined {
  if (ctx.settings.guid) return ctx.settings.guid;
  return ctx.feedUrl ? podcastGuidFor(ctx.feedUrl) : undefined;
}

/** Channel-level podcast:* tags (no live items — see liveItemsXml). */
export function channelTags(ctx: Podcast20FeedContext): string {
  const s: Podcast20Settings = ctx.settings || {};
  const i = '    ';
  const out: string[] = [];
  const guid = feedGuid(ctx);
  if (guid) out.push(`${i}${el('podcast:guid', {}, guid)}`);
  if (s.medium) out.push(`${i}${el('podcast:medium', {}, s.medium)}`);
  if (s.locked !== undefined) out.push(`${i}${el('podcast:locked', { owner: s.lockedOwner }, s.locked ? 'yes' : 'no')}`);
  for (const f of s.funding ?? []) out.push(`${i}${el('podcast:funding', { url: f.url }, f.label || 'Support the show')}`);
  for (const p of s.persons ?? []) out.push(`${i}${personTag(p)}`);
  const loc = locationTag(s.location); if (loc) out.push(`${i}${loc}`);
  if (s.license?.name) out.push(`${i}${el('podcast:license', { url: s.license.url }, s.license.name)}`);
  else if (ctx.albumLicenseId && LICENSE_SLUGS[ctx.albumLicenseId]) {
    const l = LICENSE_SLUGS[ctx.albumLicenseId];
    out.push(`${i}${el('podcast:license', { url: l.url }, l.slug)}`);
  }
  for (const t of s.txt ?? []) out.push(`${i}${el('podcast:txt', { purpose: t.purpose }, t.value)}`);
  if (s.podroll?.length) out.push(`${i}<podcast:podroll>\n${s.podroll.map(r => `${i}  ${remoteItemTag(r)}`).join('\n')}\n${i}</podcast:podroll>`);
  for (const r of s.remoteItems ?? []) out.push(`${i}${remoteItemTag(r)}`);
  const v = valueTag(s.value, i); if (v) out.push(v);
  return out.join('\n');
}

export interface ItemTagInput {
  trackId: string;
  episodeNumber?: number;
  seasonNumber?: number;
  /** Auto alternate enclosures (e.g. the track's video) added after the owner's own. */
  autoAlternates?: AlternateEnclosure[];
}

/** Item-level podcast:* tags for one episode. */
export function itemTags(ctx: Podcast20FeedContext, it: ItemTagInput): string {
  const s = ctx.settings || {};
  const e: EpisodeExtras = s.episodes?.[it.trackId] ?? {};
  const i = '      ';
  const out: string[] = [];
  if (it.seasonNumber !== undefined && it.seasonNumber !== null && Number.isFinite(it.seasonNumber)) out.push(`${i}${el('podcast:season', { name: e.seasonName }, it.seasonNumber)}`);
  if (it.episodeNumber !== undefined && it.episodeNumber !== null && Number.isFinite(it.episodeNumber)) out.push(`${i}${el('podcast:episode', { display: e.episodeDisplay }, it.episodeNumber)}`);
  const ch = ctx.chaptersUrl?.(it.trackId);
  if (ch) out.push(`${i}${el('podcast:chapters', { url: ch, type: 'application/json+chapters' })}`);
  const seen = new Set<string>();
  for (const t of [...(e.transcripts ?? []), ...(ctx.transcriptUrls?.(it.trackId) ?? [])]) {
    if (seen.has(t.url)) continue; seen.add(t.url);
    out.push(`${i}${el('podcast:transcript', { url: t.url, type: t.type, language: t.language, rel: t.captions ? 'captions' : undefined })}`);
  }
  for (const b of e.soundbites ?? []) out.push(`${i}${el('podcast:soundbite', { startTime: fmtNum(b.startTime), duration: fmtNum(b.duration) }, b.title)}`);
  for (const p of e.persons ?? []) out.push(`${i}${personTag(p)}`);
  const loc = locationTag(e.location); if (loc) out.push(`${i}${loc}`);
  const alts = [...(e.alternateEnclosures ?? []), ...(it.autoAlternates ?? []).filter(a => !(e.alternateEnclosures ?? []).some(x => x.uri === a.uri))];
  for (const a of alts) out.push(altEnclosureTag(a, i));
  const si = socialTag(e.socialInteract, 1); if (si) out.push(`${i}${si}`);
  const v = valueTag(e.value, i); if (v) out.push(v);
  return out.join('\n');
}

const iso = (ms: number) => new Date(ms).toISOString();

/** podcast:liveItem blocks. Each one carries its own enclosure + guid like a normal item. */
export function liveItemsXml(ctx: Podcast20FeedContext, fallbackImage?: string): string {
  const items: LiveItemSettings[] = ctx.settings?.liveItems ?? [];
  const i = '    ';
  return items.filter(l => l.streamUrl && l.start).map(l => {
    const type = l.streamType || (/\.m3u8(\?|$)/i.test(l.streamUrl) ? 'application/x-mpegURL' : 'audio/mpeg');
    const lines = [
      `${i}<podcast:liveItem${attrs({ status: l.status, start: iso(l.start), end: l.end ? iso(l.end) : undefined })}>`,
      `${i}  <title>${xmlEsc(l.title)}</title>`,
      l.description ? `${i}  <description>${cdata(l.description)}</description>` : '',
      `${i}  <guid isPermaLink="false">${xmlEsc(`plajah-live-${l.id}`)}</guid>`,
      // A live stream has no byte length; 0 is the usual "unknown".
      `${i}  ${el('enclosure', { url: l.streamUrl, type, length: '0' })}`,
      altEnclosureTag({ type, uri: l.streamUrl, default: true }, `${i}  `),
      (l.image || fallbackImage) ? `${i}  ${el('itunes:image', { href: l.image || fallbackImage })}` : '',
      ...(l.contentLinks ?? []).map(c => `${i}  ${el('podcast:contentLink', { href: c.href }, c.label || 'Watch live on Plajah')}`),
      ...(l.persons ?? []).map(p => `${i}  ${personTag(p)}`),
      l.socialInteract ? `${i}  ${socialTag(l.socialInteract, 1)}` : '',
      l.value ? valueTag(l.value, `${i}  `) : '',
      `${i}</podcast:liveItem>`,
    ];
    return lines.filter(Boolean).join('\n');
  }).join('\n');
}

export { LICENSE_SLUGS };
