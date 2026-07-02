// youtubeService.ts — resolve a search query to an embeddable YouTube video id
// via our server endpoint (/api/yt-search), which holds the private
// YOUTUBE_API_KEY. Returns null when no key is configured or nothing embeddable
// is found, so callers can fall back to opening YouTube in a new tab.
//
// Results are cached in localStorage (30 days) so repeat views don't burn quota.

const MEM = new Map<string, string | null>();
const LS_KEY = 'yt_resolve_v1';
const TTL = 30 * 24 * 3600_000;

function readLS(): Record<string, { t: number; id: string | null }> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function writeLS(q: string, id: string | null) {
  try {
    const all = readLS();
    all[q] = { t: Date.now(), id };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* ignore quota */ }
}

/** Extract the `search_query` from a youtube results URL, else return the input. */
export function queryFromYouTubeUrl(urlOrQuery: string): string {
  try {
    const u = new URL(urlOrQuery);
    return u.searchParams.get('search_query') || urlOrQuery;
  } catch { return urlOrQuery; }
}

/** Resolve a query → embeddable video id (or null). Cached. */
export async function resolveVideoId(query: string): Promise<string | null> {
  const q = (query || '').trim();
  if (!q) return null;
  if (MEM.has(q)) return MEM.get(q)!;
  const ls = readLS()[q];
  if (ls && Date.now() - ls.t < TTL) { MEM.set(q, ls.id); return ls.id; }
  try {
    const r = await fetch(`/api/yt-search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    const id: string | null = d?.videoId ?? null;
    MEM.set(q, id);
    writeLS(q, id);
    return id;
  } catch {
    return null;
  }
}
