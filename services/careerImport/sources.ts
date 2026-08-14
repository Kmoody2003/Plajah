// careerImport/sources — the OPEN lane resolvers.
//
// Every source here is either an open API or a feed format that exists to be fetched. Nothing
// authenticates, nothing is scraped from behind a login, and media URLs are only ever attached
// where the format intends it (podcast enclosures, Audius streams). The gated and closed lanes —
// YouTube, Takeout archives, Spotify metadata — arrive with the ownership gate in P2.
//
// Each resolver is independently failure-tolerant: an unreachable source returns ok:false with a
// human-readable note rather than throwing, because one dead API must never abort a scan that
// four other sources answered.

import type { SourceResult, StagedItem, SourceId } from './types';

let seq = 0;
const nextId = (s: SourceId) => `${s}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const fail = (sourceId: SourceId, label: string, note: string): SourceResult =>
  ({ sourceId, label, items: [], ok: false, note });

const ok = (sourceId: SourceId, label: string, items: StagedItem[], note?: string): SourceResult =>
  ({ sourceId, label, items, ok: true, note });

/** Parse a date string to epoch ms, or undefined. Never guesses — a wrong release year is worse
 *  than a missing one, because a human will not think to check what looks plausible. */
function when(v?: string): number | undefined {
  if (!v) return undefined;
  const t = Date.parse(v.length === 4 ? `${v}-01-01` : v);
  return Number.isFinite(t) ? t : undefined;
}

// ── Audius ────────────────────────────────────────────────────────────────────
// Fully open API, already wired into Chora. Media is streamable, so these are OPEN lane.

export async function fromAudius(handleOrUrl: string): Promise<SourceResult> {
  const handle = (handleOrUrl.match(/audius\.co\/([^/?#]+)/i)?.[1] || handleOrUrl).replace(/^@/, '').trim();
  if (!handle) return fail('audius', 'Audius', 'No handle to look up.');
  try {
    const { audiusFetch, fetchAudiusArtistAlbums, fetchAudiusUserTracks } = await import('../audiusService');

    const userRes = await audiusFetch(`/users/handle/${encodeURIComponent(handle)}`).catch(() => null);
    const user = userRes?.data;
    if (!user?.id) return fail('audius', 'Audius', `No Audius profile for “${handle}”.`);

    const [albums, tracks] = await Promise.all([
      fetchAudiusArtistAlbums(user.id).catch(() => []),
      fetchAudiusUserTracks(handle, 100).catch(() => []),
    ]);

    const items: StagedItem[] = [];
    for (const a of albums as any[]) {
      items.push({
        id: nextId('audius'), kind: 'RELEASE', destination: 'CHORA', lane: 'OPEN', sourceId: 'audius',
        title: a.title || a.playlist_name || 'Untitled release',
        byline: a.artist || user.name || handle,
        artwork: a.coverImage || a.artwork,
        externalUrl: a.permalink ? `https://audius.co${a.permalink}` : undefined,
        releasedAt: when(a.releaseDate || a.created_at),
        // The artist's own profile is about as unambiguous as attribution gets.
        confidence: 0.95,
        meta: { audiusId: a.id, trackCount: a.trackCount },
      });
    }
    for (const t of tracks as any[]) {
      items.push({
        id: nextId('audius'), kind: 'TRACK', destination: 'CHORA', lane: 'OPEN', sourceId: 'audius',
        title: t.title || 'Untitled track',
        byline: t.artist || user.name || handle,
        artwork: t.coverImage || t.artwork,
        mediaUrl: t.audioUrl || t.streamUrl,
        durationSec: t.duration,
        externalUrl: t.permalink ? `https://audius.co${t.permalink}` : undefined,
        confidence: 0.95,
        meta: { audiusId: t.id },
      });
    }
    return ok('audius', 'Audius', items, items.length ? undefined : 'Profile found but it has no public releases.');
  } catch (e: any) {
    return fail('audius', 'Audius', e?.message || 'Audius could not be reached.');
  }
}

// ── MusicBrainz ───────────────────────────────────────────────────────────────
// The best open source for rebuilding a discography: release groups, dates, catalogue numbers.
// Metadata only — MusicBrainz holds no audio. Rate-limited to ~1 req/sec, so this stays to two
// calls and never fans out per release.

export async function fromMusicBrainz(artistName: string): Promise<SourceResult> {
  const q = artistName.trim();
  if (!q) return fail('musicbrainz', 'MusicBrainz', 'No artist name given.');
  try {
    const aRes = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
      { headers: { Accept: 'application/json' } },
    );
    if (!aRes.ok) return fail('musicbrainz', 'MusicBrainz', `Lookup failed (${aRes.status}).`);
    const artists = (await aRes.json())?.artists || [];
    const artist = artists[0];
    if (!artist?.id) return fail('musicbrainz', 'MusicBrainz', `No artist matching “${q}”.`);

    // MusicBrainz returns a match score; a weak top hit means the name is ambiguous and the
    // whole result set deserves scepticism, so it is carried into every item's confidence.
    const score = Math.max(0, Math.min(100, Number(artist.score) || 0)) / 100;

    const rgRes = await fetch(
      `https://musicbrainz.org/ws/2/release-group?artist=${artist.id}&fmt=json&limit=100`,
      { headers: { Accept: 'application/json' } },
    );
    if (!rgRes.ok) return fail('musicbrainz', 'MusicBrainz', `Discography lookup failed (${rgRes.status}).`);
    const groups = (await rgRes.json())?.['release-groups'] || [];

    const items: StagedItem[] = groups.map((g: any) => ({
      id: nextId('musicbrainz'),
      kind: 'RELEASE' as const,
      destination: 'CHORA' as const,
      lane: 'METADATA_ONLY' as const,
      sourceId: 'musicbrainz' as const,
      title: g.title || 'Untitled release',
      byline: artist.name,
      description: g['primary-type'] ? `${g['primary-type']}${g['secondary-types']?.length ? ` · ${g['secondary-types'].join(', ')}` : ''}` : undefined,
      // Cover Art Archive 404s for plenty of releases; the <img> onError path handles the gap.
      artwork: `https://coverartarchive.org/release-group/${g.id}/front-250`,
      releasedAt: when(g['first-release-date']),
      externalUrl: `https://musicbrainz.org/release-group/${g.id}`,
      confidence: Math.round(score * 0.9 * 100) / 100,
      meta: { mbid: g.id, primaryType: g['primary-type'] },
    }));

    return ok('musicbrainz', 'MusicBrainz', items,
      score < 0.9 ? `Matched “${artist.name}” with moderate confidence — check these before accepting.` : undefined);
  } catch (e: any) {
    return fail('musicbrainz', 'MusicBrainz', e?.message || 'MusicBrainz could not be reached.');
  }
}

// ── Open Library ──────────────────────────────────────────────────────────────
// Open bibliography for a published author. Metadata only.

export async function fromOpenLibrary(authorName: string): Promise<SourceResult> {
  const q = authorName.trim();
  if (!q) return fail('openlibrary', 'Open Library', 'No author name given.');
  try {
    const aRes = await fetch(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(q)}`);
    if (!aRes.ok) return fail('openlibrary', 'Open Library', `Lookup failed (${aRes.status}).`);
    const author = (await aRes.json())?.docs?.[0];
    if (!author?.key) return fail('openlibrary', 'Open Library', `No author matching “${q}”.`);

    const wRes = await fetch(`https://openlibrary.org/authors/${author.key}/works.json?limit=100`);
    if (!wRes.ok) return fail('openlibrary', 'Open Library', `Bibliography lookup failed (${wRes.status}).`);
    const works = (await wRes.json())?.entries || [];

    const items: StagedItem[] = works.map((w: any) => {
      const coverId = Array.isArray(w.covers) ? w.covers.find((c: number) => c > 0) : undefined;
      const desc = typeof w.description === 'string' ? w.description : w.description?.value;
      return {
        id: nextId('openlibrary'),
        kind: 'BOOK' as const,
        destination: 'LOREA' as const,
        lane: 'METADATA_ONLY' as const,
        sourceId: 'openlibrary' as const,
        title: w.title || 'Untitled work',
        byline: author.name,
        description: desc ? String(desc).slice(0, 600) : undefined,
        artwork: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
        releasedAt: when(w.first_publish_date),
        externalUrl: `https://openlibrary.org${w.key}`,
        // Author-name matching is genuinely ambiguous for common names — flagged accordingly so
        // these sort to the top of review rather than being quietly accepted.
        confidence: 0.7,
        meta: { olKey: w.key },
      };
    });

    return ok('openlibrary', 'Open Library', items,
      items.length ? `Matched author “${author.name}” — confirm these are yours.` : 'Author found but no works listed.');
  } catch (e: any) {
    return fail('openlibrary', 'Open Library', e?.message || 'Open Library could not be reached.');
  }
}

// ── Podcast RSS ───────────────────────────────────────────────────────────────
// The one lane that is open end to end: an RSS enclosure exists precisely to be downloaded.
// Fetched through the server, because arbitrary podcast hosts do not send CORS headers and the
// browser cannot read the feed directly.

export async function fromPodcastRss(feedUrl: string): Promise<SourceResult> {
  const url = feedUrl.trim();
  if (!/^https?:\/\//i.test(url)) return fail('podcast', 'Podcast feed', 'That does not look like a feed URL.');
  try {
    const { auth } = await import('../firebase');
    const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const res = await fetch(`/api/import/feed?url=${encodeURIComponent(url)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({})))?.error;
      return fail('podcast', 'Podcast feed', msg || `Feed could not be read (${res.status}).`);
    }
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return fail('podcast', 'Podcast feed', 'That feed is not valid XML.');

    const showTitle = doc.querySelector('channel > title')?.textContent?.trim() || 'Podcast';
    const showArt =
      doc.querySelector('channel > image > url')?.textContent?.trim() ||
      doc.querySelector('channel > *|image')?.getAttribute('href') || undefined;

    const items: StagedItem[] = [];
    doc.querySelectorAll('item').forEach(el => {
      const enclosure = el.querySelector('enclosure');
      const media = enclosure?.getAttribute('url') || undefined;
      const durRaw = el.getElementsByTagName('itunes:duration')[0]?.textContent?.trim();
      // itunes:duration is either seconds or hh:mm:ss depending on the publisher.
      let durationSec: number | undefined;
      if (durRaw) {
        durationSec = durRaw.includes(':')
          ? durRaw.split(':').reduce((acc, p) => acc * 60 + (parseInt(p, 10) || 0), 0)
          : parseInt(durRaw, 10) || undefined;
      }
      items.push({
        id: nextId('podcast'), kind: 'EPISODE', destination: 'PODCAST', lane: 'OPEN', sourceId: 'podcast',
        title: el.querySelector('title')?.textContent?.trim() || 'Untitled episode',
        byline: showTitle,
        description: el.querySelector('description')?.textContent?.trim()?.slice(0, 600) || undefined,
        artwork: showArt,
        mediaUrl: media,
        durationSec,
        releasedAt: when(el.querySelector('pubDate')?.textContent?.trim() || undefined),
        externalUrl: el.querySelector('link')?.textContent?.trim() || undefined,
        // A feed the creator handed us, listing their own episodes — no ambiguity to resolve.
        confidence: 0.97,
      });
    });

    return ok('podcast', showTitle, items, items.length ? undefined : 'Feed read, but it lists no episodes.');
  } catch (e: any) {
    return fail('podcast', 'Podcast feed', e?.message || 'Feed could not be read.');
  }
}
