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
