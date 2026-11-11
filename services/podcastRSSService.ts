import type { Album, Track } from '../types';

import { cleanDescription } from '../utils/description';
import { cdata, xmlEsc } from './podcast20/xml';
import { channelTags, itemTags, liveItemsXml } from './podcast20/tags';
import type { AlternateEnclosure, Podcast20FeedContext } from './podcast20/types';
// ── RSS 2.0 + iTunes namespace feed generator ─────────────────────────────────
// Generates a valid podcast RSS feed from a Plajah album with podcast tracks.
// The XML string can be downloaded or submitted to podcast directories.
// Podcasting 2.0 tags (podcast:*) are added only when `podcast20` is passed and has data.

export interface PodcastFeedOptions {
  siteUrl?: string;       // e.g. https://plajah.com
  feedBaseUrl?: string;   // where the RSS feed would be hosted
  explicit?: boolean;
  language?: string;      // e.g. 'en-us'
  /** Canonical public URL of this feed: emits atom:link rel="self" and seeds podcast:guid. */
  feedUrl?: string;
  /** Podcasting 2.0 settings + URL builders (services/podcast20). Omit for a plain RSS/iTunes feed. */
  podcast20?: Podcast20FeedContext;
}

function esc(str: string): string {
  return xmlEsc(str ?? '');
}

function formatRFC2822(ts: number): string {
  return new Date(ts).toUTCString();
}

function durationStr(seconds?: number): string {
  if (!seconds) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Timestamps arrive as ms numbers, ISO strings or Firestore Timestamp-likes. */
function toMs(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? (v < 1e11 ? v * 1000 : v) : undefined;
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) return toMs(Number(v));
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === 'object') {
    const o = v as any;
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o.seconds === 'number') return o.seconds * 1000;
    if (typeof o._seconds === 'number') return o._seconds * 1000;
  }
  return undefined;
}

/** The track's own publish time if it has one, else the album's release/creation date. */
export function trackPubDate(album: Album, track: Track, override?: number): number {
  const t = track as any;
  return toMs(override) ?? toMs(t.publishedAt) ?? toMs(t.releaseDate) ?? toMs(t.createdAt) ?? toMs(t.uploadedAt)
    ?? toMs(album.releaseDate) ?? toMs(album.createdAt) ?? Date.now();
}

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', flac: 'audio/flac', wav: 'audio/wav', weba: 'audio/webm', webm: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', m3u8: 'application/x-mpegURL',
};

/** File extension of a URL path, decoding Firebase Storage's %2F-encoded object names. */
function urlExt(url: string): string | undefined {
  let path = url.split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? m[1].toLowerCase() : undefined;
}

const MIME_RE = /^[a-z]+\/[a-z0-9.+-]+$/i;

/** Enclosure MIME + byte length from what the track document knows; audio/mpeg + 0 when unknown. */
export function enclosureInfo(track: Track): { type: string; length: number } {
  const t = track as any;
  const declared = typeof t.mimeType === 'string' && MIME_RE.test(t.mimeType) ? t.mimeType
    : typeof t.contentType === 'string' && MIME_RE.test(t.contentType) ? t.contentType : undefined;
  const ext = urlExt(track.url ?? '');
  const type = declared ?? (ext && MIME_BY_EXT[ext]) ?? (track.mediaKind === 'VIDEO' ? 'video/mp4' : 'audio/mpeg');
  const len = [t.fileSize, t.sizeBytes, t.bytes, t.size].map(Number).find(n => Number.isFinite(n) && n > 0);
  return { type, length: len ? Math.round(len) : 0 };
}

/** Alternate renditions Plajah already has for a track (Mux HLS, the music video file). */
function autoAlternates(track: Track): AlternateEnclosure[] {
  const out: AlternateEnclosure[] = [];
  if (track.muxPlaybackId && /^[A-Za-z0-9]+$/.test(track.muxPlaybackId)) {
    out.push({ type: 'application/x-mpegURL', uri: `https://stream.mux.com/${track.muxPlaybackId}.m3u8`, title: 'Stream' });
  }
  if (track.videoUrl && /^https?:\/\//.test(track.videoUrl)) {
    const ext = urlExt(track.videoUrl);
    const t = ext && MIME_BY_EXT[ext]?.startsWith('video/') ? MIME_BY_EXT[ext] : 'video/mp4';
    out.push({ type: t, uri: track.videoUrl, title: 'Video' });
  }
  return out;
}

export function generatePodcastRSS(album: Album, opts: PodcastFeedOptions = {}): string {
  const siteUrl    = opts.siteUrl    ?? 'https://plajah.com';
  const language   = opts.language   ?? 'en-us';
  const explicit   = opts.explicit   ?? false;
  const p20: Podcast20FeedContext | undefined = opts.podcast20
    ? { ...opts.podcast20, feedUrl: opts.podcast20.feedUrl ?? opts.feedUrl, albumLicenseId: opts.podcast20.albumLicenseId ?? album.license }
    : undefined;
  const feedUrl    = opts.feedUrl ?? p20?.feedUrl;

  const podcastTracks = (album.tracks ?? []).filter(t => t.podcastMetadata || t.url);

  const items = podcastTracks.map((track: Track, idx: number) => {
    const meta   = track.podcastMetadata;
    const epNum  = meta?.episodeNumber ?? idx + 1;
    const season = meta?.seasonNumber;
    const expl   = meta?.isExplicit ? 'true' : 'false';
    const enc    = enclosureInfo(track);
    const dur    = durationStr(track.duration);
    const pubDate = formatRFC2822(trackPubDate(album, track, p20?.settings?.episodes?.[track.id]?.publishedAt));
    const extra  = p20 ? itemTags(p20, { trackId: track.id, episodeNumber: epNum, seasonNumber: season, autoAlternates: autoAlternates(track) }) : '';

    return `
    <item>
      <title>${esc(track.title)}</title>
      <description>${cdata(track.lyrics ?? '')}</description>
      <enclosure url="${esc(track.url ?? '')}" type="${esc(enc.type)}" length="${enc.length}"/>
      <guid isPermaLink="false">${esc(track.id ?? '')}</guid>
      <pubDate>${pubDate}</pubDate>
      <itunes:title>${esc(track.title)}</itunes:title>
      <itunes:duration>${dur}</itunes:duration>
      <itunes:episode>${epNum}</itunes:episode>
      ${season ? `<itunes:season>${season}</itunes:season>` : ''}
      <itunes:explicit>${expl}</itunes:explicit>
      ${album.coverImage ? `<itunes:image href="${esc(album.coverImage)}"/>` : ''}
${extra}
    </item>`.trim().replace(/\n\s*\n/g, '\n');
  }).join('\n\n');

  const p20Channel = p20 ? channelTags(p20) : '';
  const p20Live    = p20 ? liveItemsXml(p20, album.coverImage) : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
>
  <channel>
    <title>${esc(album.title)}</title>
    <link>${esc(siteUrl)}</link>
    <description>${cdata(cleanDescription(album.description))}</description>
    <language>${esc(language)}</language>
    <copyright>© ${new Date().getFullYear()} ${esc(album.artist)}</copyright>
    <lastBuildDate>${formatRFC2822(Date.now())}</lastBuildDate>
    ${feedUrl ? `<atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml"/>` : ''}

    <itunes:author>${esc(album.artist)}</itunes:author>
    <itunes:explicit>${explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    ${album.genre ? `<itunes:category text="${esc(album.genre)}"/>` : ''}
    ${album.coverImage ? `<itunes:image href="${esc(album.coverImage)}"/>` : ''}

    <image>
      <url>${esc(album.coverImage ?? '')}</url>
      <title>${esc(album.title)}</title>
      <link>${esc(siteUrl)}</link>
    </image>
${p20Channel ? `\n${p20Channel}\n` : ''}${p20Live ? `\n${p20Live}\n` : ''}
${items}

  </channel>
</rss>`;
}

// ── Directory submission links ────────────────────────────────────────────────

export interface PodcastDirectory {
  id: string;
  name: string;
  color: string;
  submitUrl: string;
  instructions: string;
}

export const PODCAST_DIRECTORIES: PodcastDirectory[] = [
  {
    id: 'apple',     name: 'Apple Podcasts',  color: '#9333ea',
    submitUrl: 'https://podcastsconnect.apple.com',
    instructions: 'Sign in → New Show → paste your RSS feed URL',
  },
  {
    id: 'spotify',   name: 'Spotify',         color: '#1db954',
    submitUrl: 'https://podcasters.spotify.com',
    instructions: 'Create account → Add podcast → paste RSS feed URL',
  },
  {
    id: 'amazon',    name: 'Amazon Music',    color: '#00A8E0',
    submitUrl: 'https://podcasters.amazon.com',
    instructions: 'Sign in → Submit podcast → paste your RSS feed URL',
  },
  {
    id: 'google',    name: 'Google Podcasts', color: '#4285f4',
    submitUrl: 'https://podcastsmanager.google.com',
    instructions: 'Submit your RSS feed via Podcast Manager',
  },
  {
    id: 'overcast',  name: 'Overcast',        color: '#fc7e0f',
    submitUrl: 'https://overcast.fm/submit',
    instructions: 'Paste your RSS feed URL directly',
  },
  {
    id: 'pocketcasts', name: 'Pocket Casts', color: '#f43f5e',
    submitUrl: 'https://pocketcasts.com/submit',
    instructions: 'Submit RSS feed for review',
  },
];
