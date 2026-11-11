/**
 * Browser client for /api/lexicon — what Lorea's Lexicon and every other Plajah surface use.
 *
 *   import { lookup, translations, openLexicon } from '../services/lexicon/client';
 *   const words = await translations('home', ['es', 'fr']);   // per-sense translations
 *   openLexicon('serendipity', { tab: 'origins' });          // opens Lorea Lexicon anywhere in the app
 */
import type { CompareResult, LexiconTab, SlangEntry, ThesaurusNode, TranslationSense, UsagePoint, WordEntry } from './types';

let base = '/api/lexicon';
let tokenProvider: () => Promise<string | null> = async () => {
  try { const { auth } = await import('../firebase'); return (await auth.currentUser?.getIdToken()) ?? null; } catch { return null; }
};

/** Tests and the dev lab point the client elsewhere or supply a token. */
export function configureLexiconClient(opts: { base?: string; token?: () => Promise<string | null> }) {
  if (opts.base) base = opts.base;
  if (opts.token) tokenProvider = opts.token;
}

const memo = new Map<string, Promise<unknown>>();

async function get<T>(path: string, cache = true): Promise<T> {
  if (cache && memo.has(path)) return memo.get(path) as Promise<T>;
  const p = fetch(`${base}${path}`).then(async r => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e: any = new Error(body?.error || `HTTP ${r.status}`); e.status = r.status; e.body = body; throw e; }
    return body as T;
  });
  if (cache) { memo.set(path, p); p.catch(() => memo.delete(path)); }
  return p;
}

async function send<T>(method: string, path: string, body: unknown): Promise<T> {
  const tok = await tokenProvider();
  const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status });
  return j as T;
}

const enc = encodeURIComponent;

export const lookup = (w: string) => get<WordEntry>(`/entry?w=${enc(w)}`);
export const thesaurus = (w: string, lang = 'en') => get<ThesaurusNode[]>(`/thesaurus?w=${enc(w)}&lang=${lang}`);
export const usage = (w: string, lang = 'en') => get<UsagePoint[] | null>(`/usage?w=${enc(w)}&lang=${lang}`);
export const slang = (w: string, safe: boolean) => get<SlangEntry[]>(`/slang?w=${enc(w)}${safe ? '&safe=1' : ''}`, false);
export const suggestWords = (q: string) => get<string[]>(`/suggest?q=${enc(q)}`);
export const wordOfTheDay = () => get<{ word: string }>(`/today`);
export const compare = (a: string, al: string, b: string, bl: string) => get<CompareResult>(`/compare?a=${enc(a)}&al=${al}&b=${enc(b)}&bl=${bl}`);
export const translations = (w: string, to: string[] = [], lang = 'en') =>
  get<{ word: string; senses: TranslationSense[] }>(`/translate?w=${enc(w)}&lang=${lang}${to.length ? `&to=${to.join(',')}` : ''}`);

export const addSlang = (row: { word: string; meaning: string; example?: string; region?: string }) => send<{ id: string }>('POST', '/slang', row);
export const voteSlang = (id: string, dir: 1 | -1) => send<{ votes: number }>('POST', '/slang/vote', { id, dir });
export const reportSlang = (id: string) => send<{ ok: true }>('POST', '/slang/report', { id });

export async function journal(): Promise<{ word: string; lang?: string; note?: string; savedAt: number }[]> {
  const tok = await tokenProvider();
  if (!tok) return [];
  const r = await fetch(`${base}/journal`, { headers: { Authorization: `Bearer ${tok}` } });
  return r.ok ? r.json() : [];
}
export const saveWord = (word: string, lang = 'en', note?: string) => send('POST', '/journal', { word, lang, note });
export const unsaveWord = (word: string) => send('POST', '/journal', { word, remove: true });

/** Open the Lexicon from anywhere — App.tsx listens and switches to LOREA_LEXICON. */
export function openLexicon(word?: string, opts: { lang?: string; tab?: LexiconTab } = {}) {
  window.dispatchEvent(new CustomEvent('plajah:openLexicon', { detail: { word, ...opts } }));
}
