/**
 * Lexicon engine — fetches the open sources, parses, caches. Isomorphic (global fetch only), so the
 * Express route and the dev lab's Vite middleware share it.
 *
 *   getEntry(word)        Wiktionary page → WordEntry (all language sections) + translations subpage
 *   getThesaurus(word)    Datamuse relations merged with Wiktionary synonyms/antonyms
 *   getUsage(word, lang)  Google Books Ngram frequency 1800–2019 (per million words)
 *   groseLookup(word)     Grose's 1811 Dictionary of the Vulgar Tongue (public domain)
 *   suggest(prefix)       Wiktionary title search
 *
 * Every fetch is cached: an in-memory LRU per process, plus an optional durable cache (Firestore on
 * the server) so a word is fetched from Wiktionary once, not once per reader.
 */
import type { SlangEntry, ThesaurusNode, ThesaurusRelation, UsagePoint, WordEntry } from './types';
import { parsePage, parseTranslations, splitSections } from './wikitext';
import { normalizeForMatch, PROFANITY_SET } from '../profanityLexicon';

const UA = (typeof process !== 'undefined' && process.env?.LEXICON_USER_AGENT) || 'PlajahLexicon/1.0';
const WIKT = 'https://en.wiktionary.org/w/api.php';
export const PARSER_VERSION = 6; // bump to invalidate durable caches after parser changes

export interface DurableCache { get(key: string): Promise<string | null>; set(key: string, json: string): Promise<void> }

class Lru<V> {
  private m = new Map<string, { v: V; at: number }>();
  constructor(private max: number, private ttlMs: number) {}
  get(k: string): V | undefined {
    const hit = this.m.get(k);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) { this.m.delete(k); return undefined; }
    this.m.delete(k); this.m.set(k, hit); return hit.v;
  }
  set(k: string, v: V) { this.m.set(k, { v, at: Date.now() }); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string); }
}

const DAY = 86_400_000;
const entryLru = new Lru<WordEntry | null>(600, 7 * DAY);
const thesLru = new Lru<ThesaurusNode[]>(600, 7 * DAY);
const usageLru = new Lru<UsagePoint[] | null>(600, 30 * DAY);
const inflight = new Map<string, Promise<unknown>>();

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key) as Promise<T> | undefined;
  if (cur) return cur;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function getJson(url: string, timeoutMs = 9000): Promise<any> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (typeof window === 'undefined') headers['User-Agent'] = UA; else headers['Api-User-Agent'] = UA;
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// Be a polite Wikimedia client: at most 4 page fetches in flight per process.
let wiktActive = 0; const wiktQueue: (() => void)[] = [];
async function wiktSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (wiktActive >= 4) await new Promise<void>(r => wiktQueue.push(r));
  wiktActive++;
  try { return await fn(); } finally { wiktActive--; wiktQueue.shift()?.(); }
}

/**
 * The page, or null when Wiktionary says it does not exist. Anything else (throttling, 5xx, timeouts)
 * THROWS after one retry — a transient failure must never be cached as "no such word".
 */
async function fetchWikitext(title: string): Promise<{ title: string; wikitext: string; revid?: number } | null> {
  const url = `${WIKT}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext%7Crevid&redirects=1&format=json&formatversion=2&origin=*`;
  for (let attempt = 0; ; attempt++) {
    try {
      const j = await wiktSlot(() => getJson(url));
      if (j?.error) {
        if (j.error.code === 'missingtitle' || j.error.code === 'invalidtitle') return null;
        throw new Error(`Wiktionary: ${j.error.code}`);
      }
      if (!j?.parse?.wikitext) throw new Error('Wiktionary: empty response');
      return { title: j.parse.title, wikitext: j.parse.wikitext, revid: j.parse.revid };
    } catch (e) {
      if (attempt >= 1) throw e;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

/** Candidate page titles for what a reader typed: as typed, lower-case, Capitalised. */
export function titleCandidates(q: string): string[] {
  const t = q.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!t) return [];
  const out = [t, t.toLowerCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()];
  return [...new Set(out)];
}

export async function getEntry(word: string, durable?: DurableCache): Promise<WordEntry | null> {
  const cands = titleCandidates(word);
  if (!cands.length) return null;
  const key = `v${PARSER_VERSION}:${cands[0]}`;
  const mem = entryLru.get(key);
  if (mem !== undefined) return mem;
  return once(key, async () => {
    if (durable) {
      try { const hit = await durable.get(key); if (hit) { const e = JSON.parse(hit) as WordEntry; entryLru.set(key, e); return e; } } catch { /* fall through */ }
    }
    let page: Awaited<ReturnType<typeof fetchWikitext>> = null;
    // Try "as typed", then lower-case, then Capitalised — but only move on after a TRUE miss. A failed
    // fetch throws straight out (nothing cached), so "tycoon" can never fall through to "Tycoon".
    for (const c of cands) { page = await fetchWikitext(c); if (page) break; }
    if (!page) { entryLru.set(key, null); return null; }
    const parsed = parsePage(page.wikitext);
    if (parsed.translationsSubpage) {
      const sub = await fetchWikitext(`${page.title}/translations`).catch(() => null);
      const en = parsed.langs.find(l => l.lang === 'en');
      if (sub && en) for (const s of splitSections(sub.wikitext)) if (s.title === 'Translations') en.translations.push(...parseTranslations(s.body).senses);
    }
    const entry: WordEntry = {
      word, title: page.title, langs: parsed.langs,
      source: { wiktionaryUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, revision: page.revid, fetchedAt: Date.now() },
    };
    entryLru.set(key, entry);
    if (durable) { const json = JSON.stringify(entry); if (json.length < 900_000) durable.set(key, json).catch(() => {}); }
    return entry;
  });
}

// ─── thesaurus ───────────────────────────────────────────────────────────────

const DATAMUSE: [string, ThesaurusRelation, number][] = [
  ['rel_syn', 'synonym', 24], ['ml', 'similar', 24], ['rel_ant', 'antonym', 12], ['rel_spc', 'broader', 8],
  ['rel_gen', 'narrower', 10], ['rel_par', 'partOf', 6], ['rel_com', 'hasPart', 6], ['rel_trg', 'triggers', 10], ['rel_rhy', 'rhyme', 12],
];

export async function getThesaurus(word: string, lang = 'en', wikt?: { synonyms: string[]; antonyms: string[] }): Promise<ThesaurusNode[]> {
  const w = word.trim().toLowerCase();
  const key = `${lang}:${w}`;
  const hit = thesLru.get(key);
  const base = hit ?? await once(`th:${key}`, async () => {
    const nodes: ThesaurusNode[] = [];
    if (lang === 'en' || lang === 'es') {
      const v = lang === 'es' ? '&v=es' : '';
      const rows = await Promise.all(DATAMUSE.map(([q, rel, max]) =>
        getJson(`https://api.datamuse.com/words?${q}=${encodeURIComponent(w)}&md=pf&max=${max}${v}`).then((r: any[]) => ({ rel, r })).catch(() => ({ rel, r: [] as any[] }))));
      for (const { rel, r } of rows) for (const x of r) {
        if (!x?.word || x.word === w) continue;
        const tags: string[] = x.tags ?? [];
        const f = tags.find(t => t.startsWith('f:'));
        nodes.push({ word: x.word, relation: rel, score: x.score ?? 0, pos: tags.find(t => ['n', 'v', 'adj', 'adv'].includes(t)), freq: f ? Number(f.slice(2)) : undefined, source: 'datamuse' });
      }
    }
    thesLru.set(key, nodes);
    return nodes;
  });
  const out = [...base];
  const have = new Set(out.map(n => `${n.relation}|${n.word}`));
  for (const s of wikt?.synonyms ?? []) if (!have.has(`synonym|${s}`)) out.push({ word: s, relation: 'synonym', score: 99_999, source: 'wiktionary' });
  for (const a of wikt?.antonyms ?? []) if (!have.has(`antonym|${a}`)) out.push({ word: a, relation: 'antonym', score: 99_999, source: 'wiktionary' });
  // A word that is a synonym needn't also appear as merely "similar".
  const syn = new Set(out.filter(n => n.relation === 'synonym').map(n => n.word));
  return out.filter(n => !(n.relation === 'similar' && syn.has(n.word)));
}

// ─── usage over time ─────────────────────────────────────────────────────────

const NGRAM_CORPUS: Record<string, string> = { en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', ru: 'ru', he: 'iw', zh: 'zh', cmn: 'zh' };

export async function getUsage(word: string, lang = 'en'): Promise<UsagePoint[] | null> {
  const corpus = NGRAM_CORPUS[lang];
  if (!corpus) return null;
  const key = `${corpus}:${word.trim()}`;
  const hit = usageLru.get(key);
  if (hit !== undefined) return hit;
  return once(`ng:${key}`, async () => {
    try {
      const url = `https://books.google.com/ngrams/json?content=${encodeURIComponent(word.trim())}&year_start=1800&year_end=2019&corpus=${corpus}&smoothing=3&case_insensitive=true`;
      const j = await getJson(url, 15000) as { ngram: string; type: string; timeseries: number[] }[];
      const row = j.find(r => r.type === 'CASE_INSENSITIVE') ?? j[0];
      const pts = row ? row.timeseries.map((v, i) => ({ year: 1800 + i, perMillion: Math.round(v * 1e6 * 1000) / 1000 })) : null;
      usageLru.set(key, pts);
      return pts;
    } catch { return null; }
  });
}

// ─── Grose 1811 ──────────────────────────────────────────────────────────────

const GROSE_URL = 'https://www.gutenberg.org/cache/epub/5402/pg5402.txt';
let grose: Promise<Map<string, { head: string; meaning: string }[]>> | null = null;

const MATURE = /\b(bawd|brothel|whore|harlot|prostitut|venere|pox|clap|privities|privy parts|arse|breech|fart|piss|turd|cuckold|copulat|lewd|strumpet|trull|doxy|wench|buttock|bum|yard|tail|ballocks|bollocks|cods|gallows|hang(ed|ing)|sodom)/i;

export function isExplicitText(s: string): boolean {
  for (const w of s.split(/\s+/)) if (PROFANITY_SET.has(normalizeForMatch(w))) return true;
  return MATURE.test(s);
}

/** Parse Grose's text into headword → definitions. Exported for tests. */
export function parseGrose(text: string): Map<string, { head: string; meaning: string }[]> {
  const start = text.search(/\nABBESS,/);
  const endM = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  const body = text.slice(start > 0 ? start : 0, endM > 0 ? endM : undefined);
  const map = new Map<string, { head: string; meaning: string }[]>();
  for (const para of body.split(/\r?\n\s*\r?\n/)) {
    const p = para.replace(/\s+/g, ' ').trim();
    const m = p.match(/^([A-Z][A-Z'\-]*(?: [A-Z][A-Z'\-]*){0,5})((?:,? or [A-Z][A-Z'\- ]+?)?)[.,] (.{3,})$/);
    if (!m) continue;
    const heads = [m[1], ...(m[2] ? [m[2].replace(/^,? or /, '')] : [])].map(h => h.trim());
    const meaning = m[3].trim();
    for (const h of heads) {
      const k = h.toLowerCase();
      const row = { head: h.charAt(0) + h.slice(1).toLowerCase(), meaning };
      map.set(k, [...(map.get(k) ?? []), row]);
    }
  }
  return map;
}

export async function groseLookup(word: string): Promise<SlangEntry[]> {
  if (!grose) grose = (async () => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try { const r = await fetch(GROSE_URL, { headers: typeof window === 'undefined' ? { 'User-Agent': UA } : {}, signal: ctl.signal }); return parseGrose(await r.text()); }
    finally { clearTimeout(t); }
  })().catch(e => { grose = null; throw e; });
  let map: Map<string, { head: string; meaning: string }[]>;
  try { map = await grose; } catch { return []; }
  const w = word.trim().toLowerCase();
  const rows: { head: string; meaning: string }[] = [...(map.get(w) ?? [])];
  // Phrases that contain the word ("BUBBLE AND SQUEAK" for "bubble"), a few only.
  if (w.length > 2) for (const [k, v] of map) { if (rows.length >= 8) break; if (k !== w && new RegExp(`(^| )${w.replace(/[^a-z]/g, '')}( |$)`).test(k)) rows.push(...v.slice(0, 1)); }
  return rows.map((r, i) => ({ id: `grose-${w}-${i}`, word: r.head, meaning: r.meaning, source: 'grose1811' as const, era: '1811', region: 'London', explicit: isExplicitText(r.meaning) }));
}

// ─── suggestions ─────────────────────────────────────────────────────────────

export async function suggest(prefix: string): Promise<string[]> {
  const q = prefix.trim();
  if (q.length < 2) return [];
  try {
    const j = await getJson(`${WIKT}?action=opensearch&search=${encodeURIComponent(q)}&limit=8&namespace=0&format=json&origin=*`, 5000);
    return (j?.[1] ?? []).filter((t: string) => !t.includes('/'));
  } catch { return []; }
}
