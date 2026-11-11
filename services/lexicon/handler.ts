/**
 * /api/lexicon request handling, framework-free so Express (routes/lexicon.ts) and the dev lab's
 * Vite middleware run the same code.
 *
 *   GET  /entry?w=&lang=            WordEntry (every language section on the page)
 *   GET  /thesaurus?w=&lang=        ThesaurusNode[]
 *   GET  /usage?w=&lang=            UsagePoint[] | null (Google Books Ngram)
 *   GET  /slang?w=&safe=1           SlangEntry[] — community + Wiktionary slang senses + Grose 1811
 *   POST /slang                     {word, meaning, example?, region?}       (signed in)
 *   POST /slang/vote                {id, dir: 1|-1}                           (signed in)
 *   POST /slang/report              {id}                                      (signed in)
 *   GET  /suggest?q=                titles
 *   GET  /today                     {word} word of the day (deterministic per UTC date)
 *   GET  /translate?w=&to=es,fr     per-sense translations, for other Plajah surfaces
 *   GET  /compare?a=&al=&b=&bl=     CompareResult
 *   GET  /journal                   saved words                              (signed in)
 *   POST /journal                   {word, lang?, note?, remove?: true}      (signed in)
 */
import type { SlangEntry, WordEntry } from './types';
import { getEntry, getThesaurus, getUsage, groseLookup, isExplicitText, suggest, type DurableCache } from './engine';
import { compareWords } from './compare';
import { SLANG_LABELS, EXPLICIT_LABELS, segText } from './wikitext';
import { WORDS_OF_THE_DAY } from './wordOfTheDay';

export interface SlangStore {
  list(word: string): Promise<SlangEntry[]>;
  add(e: Omit<SlangEntry, 'id'> & { byUid: string }): Promise<string | null>;
  vote(id: string, uid: string, dir: 1 | -1): Promise<number | null>;
  report(id: string, uid: string): Promise<void>;
}
export interface JournalStore {
  list(uid: string): Promise<{ word: string; lang?: string; note?: string; savedAt: number }[]>;
  save(uid: string, row: { word: string; lang?: string; note?: string }): Promise<void>;
  remove(uid: string, word: string): Promise<void>;
}

export interface LexiconCtx {
  cache?: DurableCache;
  slang: SlangStore;
  journal: JournalStore;
  /** Resolve the caller from a bearer token; null = signed out. */
  auth(header: string | undefined): Promise<{ uid: string; name?: string } | null>;
}

export interface LexReq { method: string; path: string; query: Record<string, string | undefined>; body?: any; authorization?: string }
export interface LexRes { status: number; body: unknown; cacheSeconds?: number }

const ok = (body: unknown, cacheSeconds?: number): LexRes => ({ status: 200, body, cacheSeconds });
const bad = (status: number, error: string): LexRes => ({ status, body: { error } });

const WORD_RE = /^[\p{L}\p{M}\p{N}' .\-*]{1,80}$/u;
const cleanWord = (w: unknown) => (typeof w === 'string' && WORD_RE.test(w.trim()) ? w.trim() : null);
const cleanLang = (l: unknown) => (typeof l === 'string' && /^[a-z]{2,3}(-[a-z]{2,8})?$/i.test(l) ? l : 'en');

/** Slang senses Wiktionary labels on the entry itself. */
export function wiktionarySlang(entry: WordEntry | null, lang = 'en'): SlangEntry[] {
  if (!entry) return [];
  const L = entry.langs.find(l => l.lang === lang);
  if (!L) return [];
  const out: SlangEntry[] = [];
  for (const g of L.etymologies) for (const p of g.pos) for (const s of p.senses) {
    const slangLabels = s.labels.filter(l => SLANG_LABELS.test(l));
    if (!slangLabels.length) continue;
    const meaning = segText(s.text);
    const region = s.labels.find(l => /^(US|UK|British|American|Australia|Canada|Ireland|Scotland|Jamaica|Nigeria|South Africa|India|New Zealand|Singapore|AAVE|Cockney|MLE)/i.test(l));
    out.push({
      id: `wikt-${s.id}`, word: entry.title, meaning, example: s.examples[0], source: 'wiktionary',
      region, era: s.dated, explicit: s.labels.some(l => EXPLICIT_LABELS.test(l)) || isExplicitText(meaning),
    });
  }
  return out;
}

export function todayWord(date = new Date()): string {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  return WORDS_OF_THE_DAY[day % WORDS_OF_THE_DAY.length];
}

export async function handleLexicon(req: LexReq, ctx: LexiconCtx): Promise<LexRes> {
  const q = req.query;
  const path = req.path.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'GET' && path === '/entry') {
      const w = cleanWord(q.w); if (!w) return bad(400, 'Give a word.');
      const entry = await getEntry(w, ctx.cache);
      if (!entry) return { status: 404, body: { error: 'not-found', suggestions: await suggest(w) } };
      return ok(entry, 3600);
    }
    if (req.method === 'GET' && path === '/thesaurus') {
      const w = cleanWord(q.w); if (!w) return bad(400, 'Give a word.');
      const lang = cleanLang(q.lang);
      const entry = await getEntry(w, ctx.cache).catch(() => null);
      const L = entry?.langs.find(l => l.lang === lang);
      const senseSyn = L ? L.etymologies.flatMap(g => g.pos.flatMap(p => p.senses.flatMap(s => s.synonyms))) : [];
      const senseAnt = L ? L.etymologies.flatMap(g => g.pos.flatMap(p => p.senses.flatMap(s => s.antonyms))) : [];
      return ok(await getThesaurus(w, lang, { synonyms: [...new Set([...(L?.synonyms ?? []), ...senseSyn])], antonyms: [...new Set([...(L?.antonyms ?? []), ...senseAnt])] }), 3600);
    }
    if (req.method === 'GET' && path === '/usage') {
      const w = cleanWord(q.w); if (!w) return bad(400, 'Give a word.');
      return ok(await getUsage(w, cleanLang(q.lang)), 86400);
    }
    if (req.method === 'GET' && path === '/slang') {
      const w = cleanWord(q.w); if (!w) return bad(400, 'Give a word.');
      const safe = q.safe === '1';
      const [community, entry, grose] = await Promise.all([
        ctx.slang.list(w.toLowerCase()).catch(() => []),
        getEntry(w, ctx.cache).catch(() => null),
        groseLookup(w).catch(() => []),
      ]);
      let rows = [...community, ...wiktionarySlang(entry), ...grose];
      if (safe) rows = rows.filter(r => !r.explicit);
      return ok(rows);
    }
    if (req.method === 'GET' && path === '/suggest') return ok(await suggest(String(q.q ?? '').slice(0, 60)), 600);
    if (req.method === 'GET' && path === '/today') return ok({ word: todayWord() }, 600);
    if (req.method === 'GET' && path === '/translate') {
      const w = cleanWord(q.w); if (!w) return bad(400, 'Give a word.');
      const to = String(q.to ?? '').split(',').map(cleanLang).filter(Boolean).slice(0, 30);
      const entry = await getEntry(w, ctx.cache);
      const home = entry?.langs.find(l => l.lang === cleanLang(q.lang));
      if (!entry || !home) return bad(404, 'not-found');
      return ok({ word: entry.title, senses: home.translations.map(s => ({ gloss: s.gloss, items: to.length ? s.items.filter(i => to.includes(i.lang)) : s.items })) }, 3600);
    }
    if (req.method === 'GET' && path === '/compare') {
      const a = cleanWord(q.a); const b = cleanWord(q.b);
      if (!a || !b) return bad(400, 'Give two words.');
      const [ea, eb] = await Promise.all([getEntry(a, ctx.cache), getEntry(b, ctx.cache)]);
      if (!ea || !eb) return bad(404, `Couldn't find ${!ea ? a : b}.`);
      return ok(compareWords(ea, cleanLang(q.al), eb, cleanLang(q.bl)), 3600);
    }

    // ── signed-in ──
    const needAuth = path.startsWith('/journal') || (req.method === 'POST' && path.startsWith('/slang'));
    if (needAuth) {
      const who = await ctx.auth(req.authorization);
      if (!who) return bad(401, 'Sign in first.');
      const b = req.body ?? {};
      if (req.method === 'POST' && path === '/slang') {
        const word = cleanWord(b.word); const meaning = typeof b.meaning === 'string' ? b.meaning.trim().slice(0, 500) : '';
        if (!word || meaning.length < 4) return bad(400, 'A word and a meaning (4+ characters) are needed.');
        const example = typeof b.example === 'string' ? b.example.trim().slice(0, 300) : undefined;
        const region = typeof b.region === 'string' ? b.region.trim().slice(0, 60) : undefined;
        const id = await ctx.slang.add({
          word: word.toLowerCase(), meaning, example: example || undefined, region: region || undefined, source: 'community',
          explicit: isExplicitText(`${word} ${meaning} ${example ?? ''}`), votes: 0, byUid: who.uid, byName: who.name, createdAt: Date.now(),
        });
        return id ? ok({ id }) : bad(500, 'Could not save.');
      }
      if (req.method === 'POST' && path === '/slang/vote') {
        const dir = b.dir === -1 ? -1 : 1; if (typeof b.id !== 'string') return bad(400, 'id');
        const votes = await ctx.slang.vote(b.id, who.uid, dir);
        return votes === null ? bad(409, 'Already voted.') : ok({ votes });
      }
      if (req.method === 'POST' && path === '/slang/report') {
        if (typeof b.id !== 'string') return bad(400, 'id');
        await ctx.slang.report(b.id, who.uid); return ok({ ok: true });
      }
      if (req.method === 'GET' && path === '/journal') return ok(await ctx.journal.list(who.uid));
      if (req.method === 'POST' && path === '/journal') {
        const word = cleanWord(b.word); if (!word) return bad(400, 'word');
        if (b.remove) await ctx.journal.remove(who.uid, word);
        else await ctx.journal.save(who.uid, { word, lang: cleanLang(b.lang), note: typeof b.note === 'string' ? b.note.slice(0, 500) : undefined });
        return ok({ ok: true });
      }
    }
    return bad(404, 'Unknown lexicon route.');
  } catch (e) {
    return bad(502, `The dictionary sources didn't answer (${(e as Error).message}).`);
  }
}

/** In-memory stores for the dev lab and tests. */
export function memoryStores(): { slang: SlangStore; journal: JournalStore } {
  const rows: (SlangEntry & { byUid: string; voters: Set<string>; reports: Set<string> })[] = [];
  const j = new Map<string, Map<string, { word: string; lang?: string; note?: string; savedAt: number }>>();
  return {
    slang: {
      async list(word) { return rows.filter(r => r.word === word && r.reports.size < 3).map(({ voters, reports, byUid, ...r }) => r).sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)); },
      async add(e) { const id = `c${rows.length + 1}`; rows.push({ ...e, id, voters: new Set(), reports: new Set() }); return id; },
      async vote(id, uid, dir) { const r = rows.find(x => x.id === id); if (!r || r.voters.has(uid)) return null; r.voters.add(uid); r.votes = (r.votes ?? 0) + dir; return r.votes; },
      async report(id, uid) { rows.find(x => x.id === id)?.reports.add(uid); },
    },
    journal: {
      async list(uid) { return [...(j.get(uid)?.values() ?? [])].sort((a, b) => b.savedAt - a.savedAt); },
      async save(uid, row) { if (!j.has(uid)) j.set(uid, new Map()); j.get(uid)!.set(row.word, { ...row, savedAt: Date.now() }); },
      async remove(uid, word) { j.get(uid)?.delete(word); },
    },
  };
}
