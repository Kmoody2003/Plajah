import type { ImportedRssEpisode } from '../types';

// First-party proxy served from /api/fetch-rss. Falls back to allorigins on localhost dev.
const CORS_PROXY = window.location.hostname === 'localhost'
  ? 'https://api.allorigins.win/raw?url='
  : '/api/fetch-rss?url=';

export interface ParsedPodcastFeed {
  title: string;
  description: string;
  imageUrl?: string;
  language?: string;
  author?: string;
  category?: string;
  isExplicit?: boolean;
  episodes: ImportedRssEpisode[];
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function getText(el: Element, tag: string): string {
  return el.querySelector(tag)?.textContent?.trim() ?? '';
}

function getItunesText(el: Element, localName: string): string {
  const ns = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
  return el.getElementsByTagNameNS(ns, localName)[0]?.textContent?.trim() ?? '';
}

function getItunesAttr(el: Element, localName: string, attr: string): string {
  const ns = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
  return el.getElementsByTagNameNS(ns, localName)[0]?.getAttribute(attr) ?? '';
}

function parseDuration(raw: string): string {
  if (!raw) return '';
  // Raw could be seconds ("3600") or already formatted ("1:00:00")
  if (/^\d+$/.test(raw)) {
    const secs = parseInt(raw, 10);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  return raw;
}

// ── Core parser (works from raw XML string) ───────────────────────────────────

export function parseRssXml(xmlText: string): ParsedPodcastFeed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML — is this a valid RSS feed?');

  const channel = doc.querySelector('channel');
  if (!channel) throw new Error('No <channel> found — is this a valid RSS 2.0 podcast feed?');

  const title = getText(channel, 'title') || getItunesText(channel, 'title');
  const description = getText(channel, 'description') || getItunesText(channel, 'summary');
  const imageUrl = getItunesAttr(channel, 'image', 'href') || getText(channel, 'image > url');
  const language = getText(channel, 'language') || undefined;
  const author = getItunesText(channel, 'author') || getText(channel, 'managingEditor') || undefined;
  const category = getItunesAttr(channel, 'category', 'text') || undefined;
  const explicitRaw = getItunesText(channel, 'explicit').toLowerCase();
  const isExplicit = explicitRaw === 'true' || explicitRaw === 'yes';

  const items = Array.from(channel.querySelectorAll('item'));
  const episodes: ImportedRssEpisode[] = items
    .map((item, idx) => {
      const epTitle = getText(item, 'title') || getItunesText(item, 'title');
      const epDesc = getText(item, 'description') || getItunesText(item, 'summary') || undefined;
      const audioUrl = item.querySelector('enclosure')?.getAttribute('url') ?? '';
      if (!audioUrl) return null;

      const guid = getText(item, 'guid') || audioUrl;
      const epImageUrl = getItunesAttr(item, 'image', 'href') || undefined;
      const duration = parseDuration(getItunesText(item, 'duration')) || undefined;
      const pubDateStr = getText(item, 'pubDate');
      const pubDate = pubDateStr ? new Date(pubDateStr).getTime() : undefined;
      const epNumRaw = getItunesText(item, 'episode');
      const episodeNumber = epNumRaw ? parseInt(epNumRaw, 10) || undefined : undefined;
      const seasonRaw = getItunesText(item, 'season');
      const season = seasonRaw ? parseInt(seasonRaw, 10) || undefined : undefined;
      const epExplicitRaw = getItunesText(item, 'explicit').toLowerCase();
      const isEpExplicit = epExplicitRaw === 'true' || epExplicitRaw === 'yes' || undefined;

      return {
        id: guid.replace(/\s+/g, '_').slice(0, 120),
        title: epTitle || `Episode ${idx + 1}`,
        description: epDesc,
        audioUrl,
        imageUrl: epImageUrl || (imageUrl || undefined),
        duration,
        pubDate: Number.isNaN(pubDate) ? undefined : pubDate,
        episodeNumber,
        season,
        isExplicit: isEpExplicit,
        showTitle: title,
        importedAt: Date.now(),
      } as ImportedRssEpisode;
    })
    .filter((ep): ep is ImportedRssEpisode => ep !== null);

  return { title, description, imageUrl: imageUrl || undefined, language, author, category, isExplicit, episodes };
}

// ── Fetch + parse via CORS proxy ──────────────────────────────────────────────

export async function fetchAndParseRss(url: string): Promise<ParsedPodcastFeed> {
  const proxyUrl = CORS_PROXY + encodeURIComponent(url);
  let res: Response;
  try {
    res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20_000) });
  } catch (err: any) {
    throw new Error(`Network error fetching feed: ${err.message ?? err}`);
  }
  if (!res.ok) throw new Error(`Feed server returned ${res.status} — check the URL and try again`);
  const text = await res.text();
  return parseRssXml(text);
}

// ── Lightweight validate-only (returns preview info) ─────────────────────────

export async function validateRssUrl(url: string): Promise<{
  valid: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  episodeCount?: number;
  error?: string;
}> {
  try {
    const feed = await fetchAndParseRss(url);
    return {
      valid: true,
      title: feed.title,
      description: feed.description,
      imageUrl: feed.imageUrl,
      episodeCount: feed.episodes.length,
    };
  } catch (err: any) {
    return { valid: false, error: err.message ?? 'Unknown error' };
  }
}
