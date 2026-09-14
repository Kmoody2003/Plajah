// musicEnrichment — best-effort, key-less enrichment for the private music locker
// from open sources. Lyrics via lrclib.net (CORS-friendly, no key). Cover art via
// MusicBrainz release-group search → Cover Art Archive. All calls are best-effort:
// any failure (offline, CORS, rate-limit, no match) resolves to null and the
// locker falls back to embedded art / a folder cover / a placeholder.

export interface FetchedLyrics {
  plain?: string;
  synced?: { time: number; text: string }[]; // seconds from start
}

/** Parse an LRC synced-lyrics string into {time,text} lines (seconds). */
function parseLrc(lrc: string): { time: number; text: string }[] {
  const out: { time: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(/^((?:\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])+)(.*)$/);
    if (!m) continue;
    const text = m[2].trim();
    const stamps = m[1].match(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g) || [];
    for (const s of stamps) {
      const mm = s.match(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/);
      if (mm) out.push({ time: parseInt(mm[1], 10) * 60 + parseFloat(mm[2]), text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Lyrics for a track from lrclib.net (synced when available, else plain). */
export async function fetchLyrics(opts: { artist?: string; title?: string; album?: string; durationSec?: number }): Promise<FetchedLyrics | null> {
  const { artist, title, album, durationSec } = opts;
  if (!artist || !title) return null;
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (album) params.set('album_name', album);
    if (durationSec && durationSec > 0) params.set('duration', String(Math.round(durationSec)));
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (!res.ok) return null;
    const j: any = await res.json();
    const out: FetchedLyrics = {};
    if (j.plainLyrics) out.plain = String(j.plainLyrics);
    if (j.syncedLyrics) out.synced = parseLrc(String(j.syncedLyrics));
    return out.plain || (out.synced && out.synced.length) ? out : null;
  } catch {
    return null;
  }
}

/** Basic artist info (bio-less: tags/type/area) from MusicBrainz — best-effort. */
export async function fetchArtistInfo(artist?: string): Promise<{ name: string; type?: string; area?: string; tags?: string[] } | null> {
  if (!artist) return null;
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${artist}"`)}&fmt=json&limit=1`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j: any = await res.json();
    const a = j.artists?.[0];
    if (!a) return null;
    return { name: a.name, type: a.type, area: a.area?.name, tags: (a.tags || []).map((t: any) => t.name).slice(0, 6) };
  } catch {
    return null;
  }
}

/** MusicBrainz release-group id for an artist+album (for Cover Art Archive). */
async function releaseGroupId(artist: string, album: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`releasegroup:"${album}" AND artist:"${artist}"`);
    const res = await fetch(`https://musicbrainz.org/ws/2/release-group/?query=${q}&fmt=json&limit=1`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j['release-groups']?.[0]?.id || null;
  } catch {
    return null;
  }
}

/** Cover art image for an album from the Cover Art Archive — returns a Blob to
 *  upload/own, or null. Verifies the image actually exists (no broken links). */
export async function fetchCoverArtBlob(artist?: string, album?: string): Promise<Blob | null> {
  if (!artist || !album) return null;
  const rgId = await releaseGroupId(artist, album);
  if (!rgId) return null;
  try {
    const res = await fetch(`https://coverartarchive.org/release-group/${rgId}/front-500`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob && blob.size > 1000 ? blob : null;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PersonalArtistPage — enrichment from Wikipedia, MusicBrainz, Google News
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ArtistSocial {
  platform: string;   // 'instagram' | 'x' | 'spotify' | 'appleMusic' | 'youtube' | 'website' | 'soundcloud' | 'bandcamp' | 'tiktok' | 'facebook'
  url: string;
  label: string;
}

export interface ArtistProfile {
  name: string;
  subtitle?: string;        // "Canadian rapper and singer"
  bio?: string;             // Wikipedia lead paragraph
  portrait?: string;        // Wikipedia full-res image
  thumbnail?: string;       // Wikipedia thumbnail
  mbid?: string;            // MusicBrainz artist ID
  type?: string;            // "Person" | "Group"
  area?: string;
  tags?: string[];          // Genre tags
  socials: ArtistSocial[];
  wikiUrl?: string;         // Full Wikipedia article URL
}

export interface ReleaseGroup {
  id: string;
  title: string;
  primaryType: string;      // "Album" | "Single" | "EP"
  secondaryTypes?: string[];
  firstReleaseDate?: string;
  coverUrl: string;         // Cover Art Archive front-500
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
}

/** Map MusicBrainz URL relation types → platform labels. */
function classifySocialUrl(url: string): { platform: string; label: string } | null {
  const u = url.toLowerCase();
  if (u.includes('instagram.com'))      return { platform: 'instagram', label: 'Instagram' };
  if (u.includes('twitter.com') || u.includes('x.com')) return { platform: 'x', label: 'X' };
  if (u.includes('facebook.com'))       return { platform: 'facebook', label: 'Facebook' };
  if (u.includes('tiktok.com'))         return { platform: 'tiktok', label: 'TikTok' };
  if (u.includes('open.spotify.com'))   return { platform: 'spotify', label: 'Spotify' };
  if (u.includes('music.apple.com'))    return { platform: 'appleMusic', label: 'Apple Music' };
  if (u.includes('youtube.com') || u.includes('youtu.be')) return { platform: 'youtube', label: 'YouTube' };
  if (u.includes('soundcloud.com'))     return { platform: 'soundcloud', label: 'SoundCloud' };
  if (u.includes('bandcamp.com'))       return { platform: 'bandcamp', label: 'Bandcamp' };
  return null;
}

// Session cache to avoid duplicate fetches during a page lifecycle.
const profileCache = new Map<string, Promise<ArtistProfile>>();

/** Composite artist profile from Wikipedia + MusicBrainz. Best-effort. */
export function fetchArtistProfile(artistName: string): Promise<ArtistProfile> {
  const key = artistName.trim().toLowerCase();
  const cached = profileCache.get(key);
  if (cached) return cached;

  const promise = _fetchArtistProfile(artistName);
  profileCache.set(key, promise);
  return promise;
}

async function _fetchArtistProfile(artistName: string): Promise<ArtistProfile> {
  const name = artistName.trim();
  const profile: ArtistProfile = { name, socials: [] };

  // ── Wikipedia (bio, portrait, subtitle) ─────────────────────────────
  const wikiP = (async () => {
    try {
      // Try the artist name directly, then with "(musician)" disambiguation
      for (const slug of [name, `${name} (musician)`, `${name} (rapper)`, `${name} (singer)`]) {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`);
        if (!res.ok) continue;
        const j: any = await res.json();
        // Skip disambiguation / non-article pages
        if (j.type === 'disambiguation' || !j.extract) continue;
        profile.bio = j.extract;
        profile.subtitle = j.description;
        profile.portrait = j.originalimage?.source;
        profile.thumbnail = j.thumbnail?.source;
        profile.wikiUrl = j.content_urls?.desktop?.page;
        break;
      }
    } catch { /* best-effort */ }
  })();

  // ── MusicBrainz (MBID, tags, area, social links) ───────────────────
  const mbP = (async () => {
    try {
      const searchRes = await fetch(
        `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=1`,
        { headers: { Accept: 'application/json' } },
      );
      if (!searchRes.ok) return;
      const artists = (await searchRes.json())?.artists;
      const a = artists?.[0];
      if (!a?.id) return;
      profile.mbid = a.id;
      profile.type = a.type;
      profile.area = a.area?.name;
      profile.tags = (a.tags || []).sort((x: any, y: any) => (y.count || 0) - (x.count || 0)).map((t: any) => t.name).slice(0, 8);

      // Fetch URL relations for social links (separate call due to MusicBrainz 1 req/s)
      await new Promise(r => setTimeout(r, 1100));
      const relRes = await fetch(
        `https://musicbrainz.org/ws/2/artist/${a.id}?inc=url-rels&fmt=json`,
        { headers: { Accept: 'application/json' } },
      );
      if (!relRes.ok) return;
      const relData = (await relRes.json())?.relations || [];
      const seen = new Set<string>();
      for (const rel of relData) {
        if (rel['target-type'] !== 'url') continue;
        const url: string = rel.url?.resource;
        if (!url) continue;

        // Official homepage
        if (rel.type === 'official homepage' && !seen.has('website')) {
          profile.socials.push({ platform: 'website', url, label: 'Website' });
          seen.add('website');
          continue;
        }
        const cls = classifySocialUrl(url);
        if (cls && !seen.has(cls.platform)) {
          profile.socials.push({ platform: cls.platform, url, label: cls.label });
          seen.add(cls.platform);
        }
      }
    } catch { /* best-effort */ }
  })();

  await Promise.all([wikiP, mbP]);
  return profile;
}

const discoCache = new Map<string, Promise<ReleaseGroup[]>>();

/** Full discography from MusicBrainz release groups + Cover Art Archive URLs. */
export function fetchDiscography(mbid: string): Promise<ReleaseGroup[]> {
  const cached = discoCache.get(mbid);
  if (cached) return cached;

  const promise = _fetchDiscography(mbid);
  discoCache.set(mbid, promise);
  return promise;
}

async function _fetchDiscography(mbid: string): Promise<ReleaseGroup[]> {
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/release-group?artist=${mbid}&fmt=json&limit=100`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const groups = (await res.json())?.['release-groups'] || [];
    return groups
      .map((g: any) => ({
        id: g.id,
        title: g.title || 'Untitled',
        primaryType: g['primary-type'] || 'Other',
        secondaryTypes: g['secondary-types'],
        firstReleaseDate: g['first-release-date'],
        coverUrl: `https://coverartarchive.org/release-group/${g.id}/front-500`,
      }))
      .sort((a: ReleaseGroup, b: ReleaseGroup) => {
        // Albums first, then EPs, then singles, then others
        const typeOrder: Record<string, number> = { Album: 0, EP: 1, Single: 2 };
        const ta = typeOrder[a.primaryType] ?? 3;
        const tb = typeOrder[b.primaryType] ?? 3;
        if (ta !== tb) return ta - tb;
        // Within same type, newest first
        return (b.firstReleaseDate || '').localeCompare(a.firstReleaseDate || '');
      });
  } catch {
    return [];
  }
}

/** Recent news from Google News RSS via the existing /api/fetch-rss proxy. */
export async function fetchArtistNews(artistName: string, limit = 5): Promise<NewsItem[]> {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(artistName + ' music')}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(`/api/fetch-rss?url=${encodeURIComponent(rssUrl)}`);
    if (!res.ok) return [];
    const xml = await res.text();

    // Simple XML → items parser (no external dependency)
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) && items.length < limit) {
      const block = match[1];
      const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim();
      const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      if (title && link) items.push({ title, link, pubDate: pubDate || '', source });
    }
    return items;
  } catch {
    return [];
  }
}
