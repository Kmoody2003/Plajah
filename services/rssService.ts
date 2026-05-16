const RSS_FEEDS: Record<string, string[]> = {
  // Global News sub-categories
  'GENERAL':              ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  'GENERAL_WORLD':        ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.theguardian.com/world/rss'],
  'GENERAL_POLITICS':     ['https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', 'https://feeds.bbci.co.uk/news/politics/rss.xml'],
  'GENERAL_TECH':         ['https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 'https://www.wired.com/feed/rss', 'https://feeds.arstechnica.com/arstechnica/index'],
  'GENERAL_ENTERTAINMENT':['https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  'GENERAL_HEALTH':       ['https://rss.nytimes.com/services/xml/rss/nyt/Health.xml', 'https://feeds.bbci.co.uk/news/health/rss.xml'],
  'GENERAL_BUSINESS':     ['https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664'],

  // Sports
  'SPORTS_ALL':    ['https://www.espn.com/espn/rss/news', 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml'],
  'SPORTS_NBA':    ['https://www.espn.com/espn/rss/nba/news'],
  'SPORTS_NFL':    ['https://www.espn.com/espn/rss/nfl/news'],
  'SPORTS_NHL':    ['https://www.espn.com/espn/rss/nhl/news'],
  'SPORTS_MLB':    ['https://www.espn.com/espn/rss/mlb/news'],
  'SPORTS_NCAA':   ['https://www.espn.com/espn/rss/ncb/news'],
  'SPORTS_F1':     ['https://www.espn.com/espn/rss/rpm/news', 'https://www.motorsport.com/rss/f1/news/'],
  'SPORTS_NASCAR': ['https://www.espn.com/espn/rss/rpm/news'],
  'SPORTS_INDYCAR':['https://www.espn.com/espn/rss/rpm/news'],

  // Other
  'SCIENCE': ['https://rss.nytimes.com/services/xml/rss/nyt/Science.xml', 'https://www.wired.com/feed/category/science/latest/rss'],
  'FINANCE': ['https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'],
};

// In-memory cache: category → { timestamp, data }
const cache: Record<string, { timestamp: number; data: any[] }> = {};
const TTL = 1000 * 60 * 15; // 15 min

function parseRSS(text: string): any[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const feedTitle = doc.querySelector('channel > title')?.textContent || 'News';
  return Array.from(doc.querySelectorAll('item')).map((item) => {
    const title    = item.querySelector('title')?.textContent || '';
    const link     = item.querySelector('link')?.textContent || '';
    const guid     = item.querySelector('guid')?.textContent || link;
    const pubDate  = item.querySelector('pubDate')?.textContent || new Date().toISOString();
    const desc     = item.querySelector('description')?.textContent || '';

    let imageUrl = '';
    const mc = item.querySelector('media\\:content, content');
    if (mc?.getAttribute('url')) imageUrl = mc.getAttribute('url')!;
    else if (item.querySelector('enclosure[type^="image"]'))
      imageUrl = item.querySelector('enclosure[type^="image"]')!.getAttribute('url') || '';
    else {
      const m = desc.match(/<img[^>]+src="([^">]+)"/);
      if (m) imageUrl = m[1];
    }

    const textContent = new DOMParser().parseFromString(desc, 'text/html').body.textContent || '';
    return {
      id: guid || link,
      headline: title,
      source: feedTitle,
      url: link,
      summary: textContent.substring(0, 220) + (textContent.length > 220 ? '…' : ''),
      imageUrl,
      pubDate,
      date: new Date(pubDate).toLocaleDateString(),
    };
  });
}

const fetchFeedXml = async (url: string): Promise<string> => {
  // Try allorigins first (returns JSON wrapper with raw content)
  try {
    const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (r.ok) {
      const data = await r.json();
      if (data.contents) return data.contents as string;
    }
  } catch (_) {}
  // Fallback: corsproxy.io returns raw content directly
  const r2 = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
  if (!r2.ok) throw new Error(`proxy failed: ${r2.status}`);
  return r2.text();
};

export const fetchNewsFromRSS = async (category: string): Promise<any[]> => {
  if (cache[category] && Date.now() - cache[category].timestamp < TTL)
    return cache[category].data;

  const feeds = RSS_FEEDS[category] || RSS_FEEDS['GENERAL_WORLD'];
  const results = await Promise.allSettled(
    feeds.map(url => fetchFeedXml(url).then(parseRSS))
  );

  let allItems: any[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allItems = allItems.concat(r.value);
  }

  allItems.sort((a, b) =>
    (isNaN(new Date(b.pubDate).getTime()) ? 0 : new Date(b.pubDate).getTime()) -
    (isNaN(new Date(a.pubDate).getTime()) ? 0 : new Date(a.pubDate).getTime())
  );

  const result = allItems.slice(0, 24);
  if (result.length > 0) cache[category] = { timestamp: Date.now(), data: result };
  return result;
};

/** Fire-and-forget background warm-up for common tabs */
export const prefetchNewsCategories = () => {
  const hot = ['GENERAL_WORLD', 'GENERAL_TECH', 'GENERAL_POLITICS', 'SPORTS_ALL', 'SCIENCE', 'FINANCE'];
  hot.forEach(cat => fetchNewsFromRSS(cat).catch(() => {}));
};
