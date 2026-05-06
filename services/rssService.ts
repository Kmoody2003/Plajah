const RSS_FEEDS: Record<string, string[]> = {
  'GENERAL': [
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.theguardian.com/world/rss'
  ],
  'SPORTS_ALL': [
    'https://www.espn.com/espn/rss/news',
    'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml'
  ],
  'SPORTS_NBA': ['https://www.espn.com/espn/rss/nba/news'],
  'SPORTS_NFL': ['https://www.espn.com/espn/rss/nfl/news'],
  'SPORTS_NHL': ['https://www.espn.com/espn/rss/nhl/news'],
  'SPORTS_MLB': ['https://www.espn.com/espn/rss/mlb/news'],
  'SPORTS_NCAA': ['https://www.espn.com/espn/rss/ncb/news'],
  'SCIENCE': [
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    'https://www.wired.com/feed/category/science/latest/rss'
  ],
  'FINANCE': [
    'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'
  ]
};

const cache: Record<string, any> = {};

export const fetchNewsFromRSS = async (category: string) => {
  if (cache[category] && Date.now() - cache[category].timestamp < 1000 * 60 * 15) {
    return cache[category].data; // Return cached if < 15 mins
  }

  const feeds = RSS_FEEDS[category] || RSS_FEEDS['GENERAL'];
  let allItems: any[] = [];

  await Promise.all(feeds.map(async (feedUrl) => {
    try {
      // Proxy needed to bypass CORS
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(feedUrl)}`;
      const response = await fetch(proxyUrl);
      const text = await response.text();
      
      const domParser = new DOMParser();
      const doc = domParser.parseFromString(text, 'text/xml');
      const items = Array.from(doc.querySelectorAll('item'));
      const feedTitle = doc.querySelector('channel > title')?.textContent || 'News';
      
      allItems = allItems.concat(items.map((item: any) => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const guid = item.querySelector('guid')?.textContent || link;
        const pubDate = item.querySelector('pubDate')?.textContent || new Date().toISOString();
        let contentSnippet = item.querySelector('description')?.textContent || '';
        
        let imageUrl = '';
        const mediaContent = item.querySelector('media\\:content, content');
        if (mediaContent && mediaContent.getAttribute('url')) {
          imageUrl = mediaContent.getAttribute('url');
        } else if (item.querySelector('enclosure[type^="image"]')) {
          imageUrl = item.querySelector('enclosure[type^="image"]')?.getAttribute('url') || '';
        } else {
          const imgMatch = contentSnippet.match(/<img[^>]+src="([^">]+)"/);
          if (imgMatch && imgMatch[1]) {
             imageUrl = imgMatch[1];
          }
        }
        
        // clean up html from description
        const textContent = new DOMParser().parseFromString(contentSnippet, 'text/html').body.textContent || '';
        
        return {
          id: guid || link,
          headline: title,
          source: feedTitle,
          url: link,
          summary: textContent.substring(0, 200) + (textContent.length > 200 ? '...' : ''),
          imageUrl,
          pubDate: pubDate,
          date: new Date(pubDate).toLocaleDateString()
        };
      }));
    } catch (e) {
      console.error(`Error fetching RSS feed ${feedUrl}:`, e);
    }
  }));

  // Sort by date DESC
  allItems.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
  });
  
  const result = allItems.slice(0, 20); // Return top 20
  if (result.length > 0) {
    cache[category] = {
      timestamp: Date.now(),
      data: result
    };
  }
  return result;
};
