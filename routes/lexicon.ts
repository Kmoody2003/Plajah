// Lorea Lexicon — Plajah's dictionary, thesaurus, etymology, slang and multilingual word API.
// The logic lives in services/lexicon/handler.ts (shared with the dev lab); this file wires the
// Firestore-backed stores and auth.
//
// Mounted in server.ts as: app.use('/api/lexicon', apiLimiter, express.json({ limit: '16kb' }), createLexiconRouter())
//
// Firestore (server-side REST, so no rules change — the rules file has no headroom):
//   lexiconCache/{key}               {json, at}   parsed Wiktionary entries, shared by every reader
//   lexiconSlang/{id}                community slang: word, meaning, example, region, explicit, votes, reports, status
//   lexiconSlang/{id}/votes/{uid}    one vote per member
//   users/{uid}/lexiconJournal/{w}   a member's saved words (synced across devices)

import { Router, type Request, type Response } from 'express';
import { handleLexicon, type JournalStore, type LexiconCtx, type SlangStore } from '../services/lexicon/handler';
import type { DurableCache } from '../services/lexicon/engine';
import type { SlangEntry } from '../services/lexicon/types';
import { verifyIdToken, fsGet, fsSet, fsPatch, fsDelete, fsQuery, fsCreate, fsList, fsGetUser, fsBumpCounter } from '../services/firebaseAdminRest';

const docId = (s: string) => encodeURIComponent(s).replace(/\./g, '%2E').slice(0, 700);

const firestoreCache: DurableCache = {
  async get(key) {
    const d = await fsGet(`lexiconCache/${docId(key)}`);
    if (!d?.json || Date.now() - Number(d.at ?? 0) > 30 * 86_400_000) return null;
    return String(d.json);
  },
  async set(key, json) { await fsSet(`lexiconCache/${docId(key)}`, { json, at: Date.now() }); },
};

const REPORT_HIDE = 3;

const firestoreSlang: SlangStore = {
  async list(word) {
    const rows = await fsQuery('lexiconSlang', [{ field: 'word', value: word }], 60);
    return rows
      .filter(r => r.data.status !== 'hidden' && Number(r.data.reports ?? 0) < REPORT_HIDE)
      .map(r => ({
        id: r.id, word: r.data.word, meaning: r.data.meaning, example: r.data.example || undefined, region: r.data.region || undefined,
        source: 'community' as const, explicit: !!r.data.explicit, votes: Number(r.data.votes ?? 0), byName: r.data.byName || undefined, createdAt: Number(r.data.createdAt ?? 0),
      } satisfies SlangEntry))
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  },
  async add(e) {
    return fsCreate('lexiconSlang', { ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)), reports: 0, status: 'live' });
  },
  async vote(id, uid, dir) {
    if (await fsGet(`lexiconSlang/${id}/votes/${uid}`)) return null;
    await fsSet(`lexiconSlang/${id}/votes/${uid}`, { dir, at: Date.now() });
    // Atomic tally in a side doc, mirrored onto the entry for sorting.
    const n = await fsBumpCounter(`lexiconSlang/${id}/meta/votes`, dir);
    if (n !== null) await fsPatch(`lexiconSlang/${id}`, { votes: n });
    return n;
  },
  async report(id, uid) {
    if (await fsGet(`lexiconSlang/${id}/reports/${uid}`)) return;
    await fsSet(`lexiconSlang/${id}/reports/${uid}`, { at: Date.now() });
    const d = await fsGet(`lexiconSlang/${id}`);
    const n = Number(d?.reports ?? 0) + 1;
    await fsPatch(`lexiconSlang/${id}`, { reports: n, ...(n >= REPORT_HIDE ? { status: 'hidden' } : {}) });
  },
};

const firestoreJournal: JournalStore = {
  async list(uid) {
    const rows = await fsList(`users/${uid}/lexiconJournal`, { maxDocs: 500 });
    return rows.map(r => ({ word: r.data.word, lang: r.data.lang, note: r.data.note, savedAt: Number(r.data.savedAt ?? 0) })).sort((a, b) => b.savedAt - a.savedAt);
  },
  async save(uid, row) { await fsSet(`users/${uid}/lexiconJournal/${docId(row.word)}`, { ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)), savedAt: Date.now() }); },
  async remove(uid, word) { await fsDelete(`users/${uid}/lexiconJournal/${docId(word)}`); },
};

export function createLexiconRouter(overrides: Partial<LexiconCtx> = {}) {
  const ctx: LexiconCtx = {
    cache: firestoreCache,
    slang: firestoreSlang,
    journal: firestoreJournal,
    async auth(header) {
      if (!header?.startsWith('Bearer ')) return null;
      const uid = await verifyIdToken(header.slice(7)).catch(() => null);
      if (!uid) return null;
      const u = await fsGetUser(uid).catch(() => null);
      return { uid, name: u?.displayName || u?.username || undefined };
    },
    ...overrides,
  };
  const r = Router();
  r.use(async (req: Request, res: Response) => {
    const out = await handleLexicon({
      method: req.method, path: req.path, query: req.query as Record<string, string>, body: req.body, authorization: req.headers.authorization,
    }, ctx);
    if (out.cacheSeconds && req.method === 'GET') res.set('Cache-Control', `public, max-age=${out.cacheSeconds}`);
    res.status(out.status).json(out.body);
  });
  return r;
}
