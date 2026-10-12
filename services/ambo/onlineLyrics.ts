// onlineLyrics — free online lyrics for a playing track (LRCLIB: no key, no cost, CORS-open).
//
//   1. IDENTIFY the song: embedded ID3/metadata tags first; the file name only as a fallback
//      ("Artist - Title.mp3", "01 Title (Official Video).mp3"). Junk like "Local Audio File" is ignored.
//   2. LOOK UP lrclib.net. Synced (LRC) lyrics are used as-is — exact timestamps.
//   3. Plain lyrics only → they are TIMED against what the speech model hears in the isolated vocals
//      (alignLyrics), so the words are the published ones and the timing is the track's own.
//
// Nothing here ever puts the title or file name on screen; it is only used for the lookup.

export interface TimedLine { time: number; text: string }
export interface SongId { title: string; artist: string }
export interface OnlineLyrics { synced: TimedLine[] | null; plain: string[] | null; source: string; match: SongId }

const JUNK_ARTIST = /^(?:local audio file|unknown(?: artist)?|various(?: artists)?|track|audio|n\/?a|-)?$/i;

/** Tidy a title for searching: drop extension, track numbers, "(Official Video)", "[Lyrics]", feat. credits. */
export function cleanTitle(raw: string): string {
  return (raw || '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/^\s*\d{1,3}\s*[-_.)]+\s*/, '')
    .replace(/\((?:[^)]*(?:official|video|audio|lyric|live|visuali[sz]er|hd|4k|remaster)[^)]*)\)/gi, ' ')
    .replace(/\[(?:[^\]]*)\]/g, ' ')
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best guess at {title, artist} from tags + file name. */
export function identifySong(meta: { title?: string; artist?: string; fileName?: string }): SongId | null {
  let title = cleanTitle(meta.title || '');
  let artist = (meta.artist || '').trim();
  if (JUNK_ARTIST.test(artist)) artist = '';
  if (!title && meta.fileName) title = cleanTitle(meta.fileName);
  // "Artist - Title" / "Artist – Title" / "Artist | Title" in a file-name style title
  if (!artist) {
    const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(title);
    if (m) { artist = m[1].trim(); title = cleanTitle(m[2]); }
  }
  return title.length >= 2 ? { title, artist } : null;
}

/** Read ID3/MP4/FLAC tags from a playable URL (blob: or http). Resolves {} when unreadable. */
export async function readTagsFromUrl(url: string): Promise<{ title?: string; artist?: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const blob = await res.blob();
    const { readAudioTags } = await import('../musicLocker');
    const t = await readAudioTags(new File([blob], 'track', { type: blob.type || 'audio/mpeg' }));
    return { title: t.title, artist: t.artist };
  } catch { return {}; }
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** "[mm:ss.xx] words" → seconds-timed lines. */
export function parseLrc(lrc: string): TimedLine[] {
  const out: TimedLine[] = [];
  for (const row of (lrc || '').split(/\r?\n/)) {
    const tags = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) continue;
    for (const t of tags) {
      const frac = t[3] ? Number(t[3]) / Math.pow(10, t[3].length) : 0;
      out.push({ time: Number(t[1]) * 60 + Number(t[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Look the song up on LRCLIB. `durationSec` picks the right recording when several exist. */
export async function fetchOnlineLyrics(id: SongId, durationSec?: number): Promise<OnlineLyrics | null> {
  const queries: string[] = [];
  if (id.artist) queries.push(`track_name=${encodeURIComponent(id.title)}&artist_name=${encodeURIComponent(id.artist)}`);
  queries.push(`q=${encodeURIComponent(`${id.artist} ${id.title}`.trim())}`);
  if (id.artist) queries.push(`q=${encodeURIComponent(id.title)}`);
  const wantT = norm(id.title), wantA = norm(id.artist);
  for (const q of queries) {
    let rows: any[] = [];
    try {
      const res = await fetch(`https://lrclib.net/api/search?${q}`);
      if (!res.ok) continue;
      rows = await res.json();
    } catch { return null; }                                  // offline: give up quietly
    if (!Array.isArray(rows) || !rows.length) continue;
    // score: title must actually match; artist and duration break ties; synced preferred
    const scored = rows.filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics)).map(r => {
      const t = norm(r.trackName), a = norm(r.artistName);
      let s = 0;
      if (t === wantT) s += 5; else if (t.includes(wantT) || (wantT.includes(t) && t.length > 3)) s += 3; else return { r, s: -1 };
      if (wantA) { if (a === wantA) s += 3; else if (a.includes(wantA) || wantA.includes(a)) s += 2; }
      if (durationSec && r.duration) { const d = Math.abs(r.duration - durationSec); s += d <= 2 ? 3 : d <= 6 ? 1.5 : d > 25 ? -3 : 0; }
      if (r.syncedLyrics) s += 1.5;
      return { r, s };
    }).filter(x => x.s >= 5).sort((a, b) => b.s - a.s);
    if (!scored.length) continue;
    const best = scored[0].r;
    const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : null;
    const plain = best.plainLyrics ? String(best.plainLyrics).split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean) : null;
    if (!synced?.length && !plain?.length) continue;
    return { synced: synced?.length ? synced : null, plain, source: 'lrclib.net', match: { title: best.trackName, artist: best.artistName } };
  }
  return null;
}

// ── timing plain lyrics against what was heard ─────────────────────────────

function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * Give each published lyric line a time from the speech model's timed transcript of the vocals.
 * Lines are matched in order (the song only moves forward); lines between two anchors are spread
 * between them. Lines after the last anchor are left out until the transcript gets there
 * (`heardUpTo`), so nothing is ever shown early or guessed.
 */
export function alignLyrics(lyrics: string[], heard: TimedLine[], heardUpTo: number, final = false): TimedLine[] {
  // heard words with estimated times (words of a chunk spread up to the next chunk)
  const words: Array<{ w: string; t: number }> = [];
  heard.forEach((h, i) => {
    const ws = norm(h.text).split(' ').filter(Boolean);
    const end = Math.min(heard[i + 1]?.time ?? h.time + ws.length * 0.45, h.time + ws.length * 0.6 + 0.5);
    ws.forEach((w, k) => words.push({ w, t: h.time + ((end - h.time) * k) / Math.max(1, ws.length) }));
  });
  const anchors: Array<number | null> = lyrics.map(() => null);
  let ptr = 0;
  for (let li = 0; li < lyrics.length; li++) {
    const lw = norm(lyrics[li]).split(' ').filter(Boolean);
    if (!lw.length) continue;
    const probe = lw.slice(0, Math.min(5, lw.length));
    let best = -1, bestScore = 0;
    const limit = Math.min(words.length, ptr + 80);            // look ahead ~80 heard words
    for (let s = ptr; s < limit; s++) {
      let score = 0;
      for (let k = 0; k < probe.length && s + k < words.length; k++) {
        // allow one skipped/extra heard word
        const a = wordSim(probe[k], words[s + k].w), b = s + k + 1 < words.length ? wordSim(probe[k], words[s + k + 1].w) * 0.85 : 0;
        score += Math.max(a, b) >= 0.6 ? Math.max(a, b) : 0;
      }
      score /= probe.length;
      if (score > bestScore + 1e-6) { bestScore = score; best = s; }
    }
    if (best >= 0 && bestScore >= (probe.length >= 3 ? 0.5 : 0.75)) { anchors[li] = words[best].t; ptr = best + Math.max(1, Math.floor(lw.length * 0.7)); }
  }
  // fill: interpolate between anchors; trailing lines only once the transcript has passed them
  const out: TimedLine[] = [];
  let lastIdx = -1;
  for (let i = 0; i < lyrics.length; i++) if (anchors[i] != null) lastIdx = i;
  if (lastIdx < 0) return [];
  const firstIdx = anchors.findIndex(a => a != null);
  for (let i = 0; i < lyrics.length; i++) {
    let t = anchors[i];
    if (t == null) {
      if (i < firstIdx) continue;                                // before the first heard line: unknown
      if (i > lastIdx) {
        if (!final) break;                                       // not reached yet
        const prevT = out.length ? out[out.length - 1].time : 0;
        t = Math.min(heardUpTo, prevT + 3.5);
      } else {
        let a = i - 1; while (a >= 0 && anchors[a] == null) a--;
        let b = i + 1; while (b < lyrics.length && anchors[b] == null) b++;
        const ta = anchors[a]!, tb = anchors[b]!;
        t = ta + ((tb - ta) * (i - a)) / (b - a);
      }
    }
    if (out.length && t <= out[out.length - 1].time) t = out[out.length - 1].time + 0.3;
    out.push({ time: t, text: lyrics[i] });
  }
  return out;
}
