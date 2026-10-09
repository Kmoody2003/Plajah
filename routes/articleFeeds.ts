// Article syndication routes: RSS 2.0 / Atom per author or publication, plus per-article
// AMP-lite HTML, Apple News Format JSON and email HTML. Public read-only; only articles that are
// public AND not embargoed are ever emitted (see feedGenerators.publishable).
//
// Mounted in server.ts as:  app.use('/feeds', articleFeedsRouter)
//
//   GET /feeds/author/:authorId.rss            RSS 2.0
//   GET /feeds/author/:authorId.atom           Atom 1.0
//   GET /feeds/publication/:slug.rss           RSS for a publication (masthead)
//   GET /feeds/publication/:slug.atom
//   GET /feeds/article/:id/amp                 AMP-lite HTML (NOT validated AMP)
//   GET /feeds/article/:id/apple-news.json     Apple News Format document (not submitted to Apple)
//   GET /feeds/article/:id/email.html          Substack-style email render (placeholders for unsubscribe/address)
//
// Embargo: no scheduler and no release job. An embargoed article stays in place and every reader compares
// embargoUntil to the clock (services/journalist/embargo.ts), exactly like scheduled albums. Feeds below drop
// embargoed items until the moment passes, so a release is never late.
//
// Reads the whole `articles` collection through the admin REST helper and filters in memory with a
// 60 s cache. Fine for today's volume; switch to a structured query before this collection is big.

import { Router, Request, Response } from 'express';
import { fsList, fsGet } from '../services/firebaseAdminRest';
import { buildRss, buildAtom, buildAmpLiteHtml, buildAppleNewsArticle, buildEmailIssue, feedArticleFromRecord, type FeedArticle, type FeedMeta } from '../services/journalist/feedGenerators';

export const articleFeedsRouter = Router();

type Row = { id: string; data: Record<string, any> };
let cache: { at: number; rows: Row[] } | null = null;
const TTL = 60_000;

async function allArticles(force = false): Promise<Row[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.rows;
  const rows = await fsList('articles', { pageSize: 200, maxDocs: 2000 });
  cache = { at: Date.now(), rows };
  return rows;
}

function baseUrl(req: Request): string {
  const env = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (env) return env;
  const host = req.get('host') || 'plajah.com';
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}

export function rowToFeedArticle(r: Row, base: string): FeedArticle { return feedArticleFromRecord(r.id, r.data, base); }

const send = (res: Response, type: string, body: string) => {
  res.set('Content-Type', `${type}; charset=utf-8`).set('Cache-Control', 'public, max-age=300').send(body);
};

async function authorFeed(req: Request, res: Response, kind: 'rss' | 'atom') {
  try {
    const authorId = String(req.params.authorId);
    const base = baseUrl(req);
    const rows = (await allArticles()).filter(r => r.data.authorId === authorId);
    const name = rows[0]?.data.authorName || 'Plajah author';
    const meta: FeedMeta = {
      title: `${name} on Plajah`, link: `${base}/?type=user&id=${encodeURIComponent(authorId)}`,
      feedUrl: `${base}/feeds/author/${encodeURIComponent(authorId)}.${kind}`, description: `Articles by ${name}`, authorName: name,
    };
    const items = rows.map(r => rowToFeedArticle(r, base));
    send(res, kind === 'rss' ? 'application/rss+xml' : 'application/atom+xml', kind === 'rss' ? buildRss(meta, items) : buildAtom(meta, items));
  } catch (e: any) { res.status(500).type('text/plain').send('feed unavailable'); }
}

async function publicationFeed(req: Request, res: Response, kind: 'rss' | 'atom') {
  try {
    const slug = String(req.params.slug);
    const base = baseUrl(req);
    const pubs = await fsList('publications', { pageSize: 100, maxDocs: 500 });
    const pub = pubs.find(p => p.data.slug === slug);
    if (!pub) return void res.status(404).type('text/plain').send('no such publication');
    const rows = (await allArticles()).filter(r => r.data.publicationId === pub.id);
    const meta: FeedMeta = {
      title: String(pub.data.name || slug), link: `${base}/?type=publication&id=${encodeURIComponent(pub.id)}`,
      feedUrl: `${base}/feeds/publication/${encodeURIComponent(slug)}.${kind}`, description: String(pub.data.tagline || pub.data.name || ''), authorName: String(pub.data.name || ''),
    };
    const items = rows.map(r => {
      const a = rowToFeedArticle(r, base);
      return pub.data.access === 'SUBSCRIBERS' || pub.data.access === 'PAID_ISSUES' ? { ...a, paywalled: a.paywalled || r.data.access === 'SUBSCRIBERS' || r.data.access === 'PAID' } : a;
    });
    send(res, kind === 'rss' ? 'application/rss+xml' : 'application/atom+xml', kind === 'rss' ? buildRss(meta, items) : buildAtom(meta, items));
  } catch { res.status(500).type('text/plain').send('feed unavailable'); }
}

articleFeedsRouter.get('/author/:authorId.rss', (req, res) => void authorFeed(req, res, 'rss'));
articleFeedsRouter.get('/author/:authorId.atom', (req, res) => void authorFeed(req, res, 'atom'));
articleFeedsRouter.get('/publication/:slug.rss', (req, res) => void publicationFeed(req, res, 'rss'));
articleFeedsRouter.get('/publication/:slug.atom', (req, res) => void publicationFeed(req, res, 'atom'));

async function oneArticle(req: Request, res: Response): Promise<FeedArticle | null> {
  const id = String(req.params.id);
  await allArticles();                                  // runs lazy embargo release
  const data = await fsGet(`articles/${id}`);
  if (!data || data.isPublic === false) { res.status(404).type('text/plain').send('not found'); return null; }
  const a = rowToFeedArticle({ id, data }, baseUrl(req));
  if (a.embargoUntil && a.embargoUntil > Date.now()) { res.status(404).type('text/plain').send('not found'); return null; }
  return a;
}

articleFeedsRouter.get('/article/:id/amp', async (req, res) => { const a = await oneArticle(req, res); if (a) send(res, 'text/html', buildAmpLiteHtml(a)); });
articleFeedsRouter.get('/article/:id/apple-news.json', async (req, res) => { const a = await oneArticle(req, res); if (a) send(res, 'application/json', JSON.stringify(buildAppleNewsArticle(a), null, 2)); });
articleFeedsRouter.get('/article/:id/email.html', async (req, res) => {
  const a = await oneArticle(req, res);
  if (a) send(res, 'text/html', buildEmailIssue(a, { publicationName: a.authorName }).html);
});
