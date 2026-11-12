// Terra Law Library — public, read-only API over the ingested law data (data/terraLaw/<jurisdiction>).
//
// GET /api/terra/law/:j                       library index (chapters, constitution articles, source line)
// GET /api/terra/law/:j/search-index           all search rows (gzipped; the browser searches locally)
// GET /api/terra/law/:j/constitution           the Constitution
// GET /api/terra/law/:j/mcl/:chapter           one MCL chapter (acts → divisions → sections)
// GET /api/terra/law/:j/section/:id            one section with its breadcrumb (mcl-125.3201, const-IX-6)
//
// Everything here is public-domain law text served as an UNOFFICIAL copy (see the index's
// `source.notice`). The files are pre-gzipped by scripts/terra/ingestMichiganLaw.ts and served
// as-is with Content-Encoding: gzip, so the server does no work per request beyond a disk read
// (and a small in-memory cache for the section lookup).
import express from 'express';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Constitution, LawChapter, LawNode, LawSection } from '../services/terra/law/lawTypes';

const ROOT = join(process.cwd(), 'data', 'terraLaw');
const JURISDICTIONS = new Set(['mi']);
const CHAPTER_RE = /^[0-9]{1,4}[A-Za-z]?$/;
const ID_RE = /^(mcl-[0-9]{1,4}[A-Za-z]?\.[0-9A-Za-z.]{1,24}|const-[A-Za-z]{1,10}-[0-9a-z-]{1,16})$/;

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MAX = 64;

async function loadJson<T>(file: string): Promise<T | null> {
  const hit = cache.get(file);
  if (hit) return hit.value as T;
  if (!existsSync(file)) return null;
  const value = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(file, { at: Date.now(), value });
  return value;
}

async function sendGz(res: express.Response, file: string, maxAge = 3600) {
  if (!existsSync(file)) return res.status(404).json({ error: 'not found' });
  const buf = await readFile(file);
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Encoding': 'gzip',
    'Cache-Control': `public, max-age=${maxAge}`,
    Vary: 'Accept-Encoding',
  });
  return res.end(buf);
}

function findSection(nodes: LawNode[], id: string, path: string[] = []): { sec: LawSection; path: string[] } | null {
  for (const n of nodes) {
    if (n.k === 'sec') { if (n.id === id) return { sec: n, path }; continue; }
    const label = n.k === 'act' ? (n.shortTitle || n.heading || n.name) : [n.type, n.number].filter(Boolean).join(' ') + (n.title ? ` — ${n.title}` : '');
    const hit = findSection(n.children, id, [...path, label]);
    if (hit) return hit;
  }
  return null;
}

export function createTerraLawRouter(opts: { limiter?: express.RequestHandler } = {}) {
  const router = express.Router();
  const limit = opts.limiter ?? ((_q: any, _r: any, n: any) => n());

  router.use('/api/terra/law/:j', limit, (req, res, next) => {
    if (!JURISDICTIONS.has(String(req.params.j))) return res.status(404).json({ error: 'unknown jurisdiction' });
    next();
  });

  router.get('/api/terra/law/:j', (req, res) => { void sendGz(res, join(ROOT, req.params.j, 'index.json.gz'), 900); });
  router.get('/api/terra/law/:j/search-index', (req, res) => { void sendGz(res, join(ROOT, req.params.j, 'search.json.gz'), 3600); });
  router.get('/api/terra/law/:j/constitution', (req, res) => { void sendGz(res, join(ROOT, req.params.j, 'constitution.json.gz'), 3600); });

  router.get('/api/terra/law/:j/mcl/:chapter', (req, res) => {
    const ch = String(req.params.chapter);
    if (!CHAPTER_RE.test(ch)) return res.status(400).json({ error: 'bad chapter' });
    void sendGz(res, join(ROOT, req.params.j, 'mcl', `${ch}.json.gz`), 3600);
  });

  router.get('/api/terra/law/:j/section/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!ID_RE.test(id)) return res.status(400).json({ error: 'bad section id' });
    try {
      const dir = join(ROOT, req.params.j);
      if (id.startsWith('const-')) {
        const c = await loadJson<Constitution>(join(dir, 'constitution.json.gz'));
        for (const a of c?.articles ?? []) {
          const sec = a.sections.find((s) => s.id === id);
          if (sec) {
            res.set('Cache-Control', 'public, max-age=3600');
            return res.json({ section: sec, chapter: { n: 'const', title: c!.title }, path: [a.n === 'Schedule' ? 'Schedule' : `Article ${a.n} — ${a.title}`] });
          }
        }
        return res.status(404).json({ error: 'not found' });
      }
      const chapterNo = id.slice(4).split('.')[0];
      const ch = await loadJson<LawChapter>(join(dir, 'mcl', `${chapterNo}.json.gz`));
      const hit = ch ? findSection(ch.children, id) : null;
      if (!hit) return res.status(404).json({ error: 'not found' });
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({ section: hit.sec, chapter: { n: ch!.n, title: ch!.title }, path: hit.path });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'lookup failed' });
    }
  });

  return router;
}
