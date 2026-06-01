import type { Album, Track } from '../types';

// ── RSS 2.0 + iTunes namespace feed generator ─────────────────────────────────
// Generates a valid podcast RSS feed from a Plajah album with podcast tracks.
// The XML string can be downloaded or submitted to podcast directories.

export interface PodcastFeedOptions {
  siteUrl?: string;       // e.g. https://plajah.com
  feedBaseUrl?: string;   // where the RSS feed would be hosted
  explicit?: boolean;
  language?: string;      // e.g. 'en-us'
}

function esc(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

export function generatePodcastRSS(album: Album, opts: PodcastFeedOptions = {}): string {
  const siteUrl    = opts.siteUrl    ?? 'https://plajah.com';
  const feedBase   = opts.feedBaseUrl ?? siteUrl;
  const language   = opts.language   ?? 'en-us';
  const explicit   = opts.explicit   ?? false;

  const podcastTracks = (album.tracks ?? []).filter(t => t.podcastMetadata || t.url);

  const items = podcastTracks.map((track: Track, idx: number) => {
    const meta   = track.podcastMetadata;
    const epNum  = meta?.episodeNumber ?? idx + 1;
    const season = meta?.seasonNumber;
    const expl   = meta?.isExplicit ? 'true' : 'false';
    const encUrl = esc(track.url ?? '');
    const dur    = durationStr(track.duration);
    const pubDate = formatRFC2822(album.createdAt ?? Date.now());

    return `
    <item>
      <title>${esc(track.title)}</title>
      <description><![CDATA[${track.lyrics ?? ''}]]></description>
      <enclosure url="${encUrl}" type="audio/mpeg" length="0"/>
      <guid isPermaLink="false">${esc(track.id ?? '')}</guid>
      <pubDate>${pubDate}</pubDate>
      <itunes:title>${esc(track.title)}</itunes:title>
      <itunes:duration>${dur}</itunes:duration>
      <itunes:episode>${epNum}</itunes:episode>
      ${season ? `<itunes:season>${season}</itunes:season>` : ''}
      <itunes:explicit>${expl}</itunes:explicit>
      ${album.coverImage ? `<itunes:image href="${esc(album.coverImage)}"/>` : ''}
    </item>`.trim();
  }).join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
>
  <channel>
    <title>${esc(album.title)}</title>
    <link>${siteUrl}</link>
    <description><![CDATA[${album.description ?? ''}]]></description>
    <language>${language}</language>
    <copyright>© ${new Date().getFullYear()} ${esc(album.artist)}</copyright>
    <lastBuildDate>${formatRFC2822(Date.now())}</lastBuildDate>

    <itunes:author>${esc(album.artist)}</itunes:author>
    <itunes:explicit>${explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    ${album.genre ? `<itunes:category text="${esc(album.genre)}"/>` : ''}
    ${album.coverImage ? `<itunes:image href="${esc(album.coverImage)}"/>` : ''}

    <image>
      <url>${esc(album.coverImage ?? '')}</url>
      <title>${esc(album.title)}</title>
      <link>${siteUrl}</link>
    </image>

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
