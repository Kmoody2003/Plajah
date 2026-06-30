// podcastRssReader.ts — inbound podcast RSS: fetch + parse an external feed into episodes.
// (Plajah already GENERATES RSS in podcastRSSService; this is the reader side.) Browser fetches
// route through /api/proxy to dodge CORS, mirroring the rest of the app. Parses RSS 2.0 + the
// iTunes podcast namespace.

export interface RssEpisode {
  id: string;
  title: string;
  description: string;
  audioUrl?: string;
  imageUrl?: string;
  duration?: string;   // raw itunes:duration (mm:ss / seconds)
  pubDate?: number;    // epoch ms
  link?: string;
}
export interface RssFeed {
  title: string;
  description: string;
  imageUrl?: string;
  link?: string;
  episodes: RssEpisode[];
}

const viaProxy = (url: string) => /^https?:\/\//i.test(url) ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const itunesAttr = (el: Element, tag: string, attr: string) => el.getElementsByTagName(`itunes:${tag}`)[0]?.getAttribute(attr) || '';
const itunesText = (el: Element, tag: string) => el.getElementsByTagName(`itunes:${tag}`)[0]?.textContent?.trim() || '';
const childText = (el: Element | Document, sel: string) => el.querySelector(sel)?.textContent?.trim() || '';

export function parsePodcastFeed(xml: string): RssFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('That feed is not valid RSS/XML.');
  const channel = doc.querySelector('channel') ?? doc.documentElement;

  const channelImg =
    childText(channel, 'image url') ||
    channel.querySelector('image')?.getAttribute('href') ||
    itunesAttr(channel as Element, 'image', 'href') || undefined;

  const episodes: RssEpisode[] = Array.from(doc.querySelectorAll('item')).map((item, i) => {
    const enclosure = item.querySelector('enclosure');
    const pub = childText(item, 'pubDate');
    return {
      id: childText(item, 'guid') || enclosure?.getAttribute('url') || `ep_${i}`,
      title: childText(item, 'title') || `Episode ${i + 1}`,
      description: stripHtml(childText(item, 'description') || itunesText(item, 'summary')),
      audioUrl: enclosure?.getAttribute('url') || undefined,
      imageUrl: itunesAttr(item, 'image', 'href') || undefined,
      duration: itunesText(item, 'duration') || undefined,
      pubDate: pub ? (Date.parse(pub) || undefined) : undefined,
      link: childText(item, 'link') || undefined,
    };
  });

  return {
    title: childText(channel, 'title') || 'Podcast',
    description: stripHtml(childText(channel, 'description') || itunesText(channel as Element, 'summary')),
    imageUrl: channelImg,
    link: childText(channel, 'link') || undefined,
    episodes,
  };
}

export async function fetchPodcastFeed(url: string, signal?: AbortSignal): Promise<RssFeed> {
  const res = await fetch(viaProxy(url), { signal });
  if (!res.ok) throw new Error(`Couldn't reach that feed (${res.status}).`);
  return parsePodcastFeed(await res.text());
}
