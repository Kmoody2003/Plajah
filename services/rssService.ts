import { cached } from '../src/lib/performanceCache';

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
  'SPORTS_ALL':    ['https://www.espn.com/espn/rss/news', 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml', 'https://www.theguardian.com/sport/rss'],
  'SPORTS_FIFA_WC': [
    'https://www.espn.com/espn/rss/soccer/news',
    'https://feeds.bbci.co.uk/sport/football/rss.xml',
    'https://www.theguardian.com/football/rss',
    'https://www.goal.com/feeds/en/news',
  ],
  'SPORTS_NBA':    ['https://www.espn.com/espn/rss/nba/news'],
  'SPORTS_NFL':    ['https://www.espn.com/espn/rss/nfl/news'],
  'SPORTS_NHL':    ['https://www.espn.com/espn/rss/nhl/news'],
  'SPORTS_MLB':    ['https://www.espn.com/espn/rss/mlb/news'],
  'SPORTS_NCAA':   ['https://www.espn.com/espn/rss/ncb/news'],
  'SPORTS_WNBA':   ['https://www.espn.com/espn/rss/wnba/news'],
  'SPORTS_UFC':    ['https://www.espn.com/espn/rss/mma/news'],
  'SPORTS_MMA':    ['https://www.espn.com/espn/rss/mma/news'],
  'SPORTS_BOXING': ['https://www.espn.com/espn/rss/boxing/news'],
  'SPORTS_MARTIAL_ARTS': ['https://www.espn.com/espn/rss/mma/news'],
  'SPORTS_FENCING':['https://www.insidethegames.biz/sports/summer/fencing/rss'],
  'SPORTS_TENNIS': ['https://www.espn.com/espn/rss/tennis/news'],
  'SPORTS_GOLF':   ['https://www.espn.com/espn/rss/golf/news'],
  'SPORTS_CRICKET':['https://www.espncricinfo.com/rss/content/story/feeds/0.xml'],
  'SPORTS_RUGBY':  ['https://www.espn.com/espn/rss/rugby/news'],
  'SPORTS_WRESTLING': ['https://www.ncaa.com/news/wrestling/rss.xml'],
  'SPORTS_VOLLEYBALL': ['https://www.ncaa.com/news/volleyball-women/rss.xml'],
  'SPORTS_LACROSSE': ['https://www.ncaa.com/news/lacrosse-men/rss.xml'],
  'SPORTS_F1':     ['https://www.espn.com/espn/rss/rpm/news', 'https://www.motorsport.com/rss/f1/news/'],
  'SPORTS_NASCAR': ['https://www.motorsport.com/rss/nascar-cup/news/', 'https://www.espn.com/espn/rss/rpm/news'],
  'SPORTS_INDYCAR':['https://www.motorsport.com/rss/indycar/news/', 'https://www.espn.com/espn/rss/rpm/news'],
  'SPORTS_ESPORTS':[
    'https://dotesports.com/feed',
    'https://www.dexerto.com/feed/',
    'https://www.oneesports.gg/feed/',
    'https://www.ign.com/rss/articles/esports',
  ],

  // Other
  'SCIENCE': ['https://rss.nytimes.com/services/xml/rss/nyt/Science.xml', 'https://www.wired.com/feed/category/science/latest/rss'],
  'FINANCE': ['https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'],
};

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

/** A real RSS/Atom/RDF feed, not (e.g.) the SPA index.html that static hosting
 *  returns for /api/* — which also contains '<' and was being wrongly accepted. */
const looksLikeFeed = (t: string) => /<rss[\s>]|<feed[\s>]|<\?xml|<rdf:RDF/i.test(t);

export const fetchFeedXml = async (url: string): Promise<string> => {
  // 1. Our own server proxy — accept ONLY when it returns an actual feed. In
  //    production (static Firebase Hosting) /api/fetch-rss returns index.html;
  //    the old `includes('<')` check accepted that HTML as "RSS", so news never
  //    fell through to a working proxy. Gate strictly on feed shape.
  try {
    const r0 = await fetch(`/api/fetch-rss?url=${encodeURIComponent(url)}`);
    if (r0.ok) {
      const text = await r0.text();
      if (looksLikeFeed(text)) return text;
    }
  } catch (_) {}
  // 2. corsproxy.io — raw content; currently the reliable public CORS proxy.
  try {
    const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (r.ok) { const t = await r.text(); if (looksLikeFeed(t)) return t; }
  } catch (_) {}
  // 3. codetabs — raw content; independent backbone from corsproxy.
  try {
    const r = await fetch(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`);
    if (r.ok) { const t = await r.text(); if (looksLikeFeed(t)) return t; }
  } catch (_) {}
  // 4. allorigins (JSON wrapper) — last resort; frequently rate-limited / down.
  try {
    const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (r.ok) { const data = await r.json(); if (data.contents && looksLikeFeed(data.contents)) return data.contents as string; }
  } catch (_) {}
  throw new Error('all RSS proxies failed');
};

export const fetchNewsFromRSS = async (category: string): Promise<any[]> => {
  return cached(`rss:${category}`, TTL, async () => {
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

    return allItems.slice(0, 24);
  });
};

/** Fire-and-forget background warm-up for common tabs */
export const prefetchNewsCategories = () => {
  const hot = ['GENERAL_WORLD', 'GENERAL_TECH', 'GENERAL_POLITICS', 'SPORTS_ALL', 'SCIENCE', 'FINANCE'];
  hot.forEach(cat => fetchNewsFromRSS(cat).catch(() => {}));
};
