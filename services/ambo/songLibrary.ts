// songLibrary — every song Ambo can put lyrics up for.
//
// Three sources, one list:
//   chora    catalogue tracks the library has loaded (lyricFeed.rememberLyrics
//            hands them over, with their time-coded lyrics)
//   user     songs the operator typed or pasted (ProPresenter-style), saved
//            on this machine
//   built-in a few public-domain hymns so the tab is useful on first open
//
// A song is lines + sections. Pasted text understands the usual chart
// markers — "[Chorus]", "Verse 2:", "Bridge", "(Tag)" — as section headers.

import { ALL_SACRED_HYMNS_AND_PRAYERS, type SacredHymnOrPrayer } from '../../data/sacredHymnsAndPrayers';

export interface SongSection { name: string; start: number }
export interface Song {
  id: string;
  title: string;
  artist?: string;
  /** Lyric lines, in singing order (section headers removed). */
  lines: string[];
  sections: SongSection[];
  /** When the song has a synced recording (Chora), its line timings. */
  timeCodedLyrics?: Array<{ time: number; text: string }>;
  source: 'chora' | 'user' | 'builtin';
  /** Optional link to rich Lorea provenance, original language stanzas, and SATB accompaniment score */
  sacredMetaId?: string;
  sacredKind?: SacredHymnOrPrayer['kind'];
  ccli?: string;
  updatedAt?: number;
}

const KEY = 'ambo_songs_v1';
const SECTION_RE = /^\s*[[(]?\s*((?:verse|v|chorus|ch|pre[-\s]?chorus|bridge|tag|intro|outro|ending|refrain|interlude|vamp|hook|coda|stanza|antiphon)\s*\d*[a-z]?)\s*[\])]?\s*:?\s*$/i;

/** "[Chorus]" / "Verse 2:" / "(Bridge)" → "Chorus" / "Verse 2" / "Bridge"; anything else → null. */
export function sectionName(line: string): string | null {
  const m = line.match(SECTION_RE);
  if (!m) return null;
  const raw = m[1].replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  const num = raw.match(/\d+[a-z]?$/i)?.[0] ?? '';
  const base = lower.startsWith('pre') ? 'Pre-Chorus'
    : /^(v|verse)\b|^v\d/.test(lower) ? 'Verse'
    : /^(ch|chorus)/.test(lower) ? 'Chorus'
    : raw.replace(/\d+[a-z]?$/i, '').trim().replace(/^\w/, c => c.toUpperCase());
  return num ? `${base} ${num}` : base;
}

/** Pasted lyrics → lines + sections. Blank lines split stanzas (each becomes a section if unnamed). */
export function parseLyricsText(text: string): { lines: string[]; sections: SongSection[] } {
  const lines: string[] = [];
  const sections: SongSection[] = [];
  let pendingName: string | null = null;
  let stanza = 0;
  let inStanza = false;
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const t = rawLine.trim();
    if (!t) { inStanza = false; continue; }
    const name = sectionName(t);
    if (name) { pendingName = name; inStanza = false; continue; }
    if (!inStanza) {
      stanza++;
      sections.push({ name: pendingName ?? `Part ${stanza}`, start: lines.length });
      pendingName = null;
      inStanza = true;
    }
    lines.push(t);
  }
  return { lines, sections };
}

/** Lines + sections → editable text (round-trips through parseLyricsText). */
export function songToText(s: Pick<Song, 'lines' | 'sections'>): string {
  const out: string[] = [];
  const starts = new Map(s.sections.map(x => [x.start, x.name]));
  s.lines.forEach((l, i) => {
    const n = starts.get(i);
    if (n) { if (out.length) out.push(''); out.push(`[${n}]`); }
    out.push(l);
  });
  return out.join('\n');
}

function buildSacredBuiltinSong(item: SacredHymnOrPrayer, legacyId?: string): Song {
  const labelPrefix = item.kind === 'PUBLIC_DOMAIN_HYMN' ? 'Verse' : 'Stanza';
  const formattedText = item.stanzas
    .map((stanza, idx) => `[${labelPrefix} ${idx + 1}]\n${stanza}`)
    .join('\n\n');
  return {
    id: legacyId ?? `builtin_${item.id.replace(/-/g, '_')}`,
    title: item.title,
    artist: item.author,
    source: 'builtin',
    sacredMetaId: item.id,
    sacredKind: item.kind,
    ...parseLyricsText(formattedText),
  };
}

const LEGACY_ID_MAP: Record<string, string> = {
  'pd-hymn-amazing-grace': 'builtin_amazing_grace',
  'pd-hymn-holy-holy-holy': 'builtin_holy_holy_holy',
  'pd-hymn-it-is-well': 'builtin_it_is_well',
  'pd-hymn-be-thou-my-vision': 'builtin_be_thou_my_vision',
};

const BUILTIN: Song[] = ALL_SACRED_HYMNS_AND_PRAYERS.map(item =>
  buildSacredBuiltinSong(item, LEGACY_ID_MAP[item.id])
);

function readUser(): Song[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(s => s && s.id && Array.isArray(s.lines)) : [];
  } catch { return []; }
}

let userSongs: Song[] = typeof localStorage !== 'undefined' ? readUser() : [];
const catalog = new Map<string, Song>();
const subs = new Set<() => void>();
let version = 0;
let cache: Song[] | null = null;
const emit = () => { version++; cache = null; subs.forEach(fn => { try { fn(); } catch { /* */ } }); };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(userSongs)); } catch { /* */ } };

export const subscribeSongs = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export const songsVersion = () => version;

/** User songs first, then the catalogue, then the built-ins. */
export function listSongs(): Song[] {
  if (!cache) cache = [...userSongs, ...catalog.values(), ...BUILTIN];
  return cache;
}
export const getSong = (id: string | null | undefined): Song | null => (id ? listSongs().find(s => s.id === id) ?? null : null);

/** Catalogue tracks with lyrics (from the library's Chora load). */
export function registerCatalogSongs(tracks: Array<{ id?: string; title?: string; artist?: string; timeCodedLyrics?: Array<{ time: number; text: string }> }>): void {
  let changed = false;
  for (const t of tracks) {
    if (!t.id || !t.title || !t.timeCodedLyrics?.length) continue;
    if (catalog.has(t.id)) continue;
    const timed = t.timeCodedLyrics.filter(l => l && (l.text || '').trim());
    if (!timed.length) continue;
    catalog.set(t.id, {
      id: t.id, title: t.title, artist: t.artist, source: 'chora',
      lines: timed.map(l => l.text.trim()), sections: [{ name: 'Song', start: 0 }], timeCodedLyrics: timed,
    });
    changed = true;
  }
  if (changed) emit();
}

export function saveUserSong(s: Omit<Song, 'source' | 'id'> & { id?: string }): Song {
  const song: Song = { ...s, id: s.id || `song_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, source: 'user', updatedAt: Date.now() };
  const i = userSongs.findIndex(x => x.id === song.id);
  userSongs = i >= 0 ? userSongs.map((x, k) => (k === i ? song : x)) : [song, ...userSongs];
  persist(); emit();
  return song;
}

export function deleteUserSong(id: string): void {
  userSongs = userSongs.filter(s => s.id !== id);
  persist(); emit();
}

const normTitle = (t: string) => t.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** A playing file's title → a library song (exact, then "contains"). */
export function findSongByTitle(title: string | undefined | null): Song | null {
  if (!title) return null;
  const n = normTitle(title.replace(/\.[a-z0-9]{2,4}$/i, ''));
  if (!n) return null;
  const all = listSongs();
  return all.find(s => normTitle(s.title) === n)
    ?? all.find(s => { const st = normTitle(s.title); return st.length >= 5 && (n.includes(st) || st.includes(n)); })
    ?? null;
}

export function searchSongs(q: string): Song[] {
  const n = q.toLowerCase().trim();
  if (!n) return listSongs();
  return listSongs().filter(s =>
    s.title.toLowerCase().includes(n) || (s.artist || '').toLowerCase().includes(n) || s.lines.some(l => l.toLowerCase().includes(n)));
}

/** Which section a line belongs to. */
export function sectionOf(s: Song, line: number): SongSection | null {
  let cur: SongSection | null = null;
  for (const sec of s.sections) { if (sec.start <= line) cur = sec; else break; }
  return cur;
}
