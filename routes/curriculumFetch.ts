// curriculumFetch router — reads a lesson link for the Lesson Library importer, server-side.
//
//   POST /  { url }  → the file as fetched (PDF bytes, a Doc's plain text, a Form's page), or an error
//
// Browsers can't read Google Drive / Docs / Forms directly (no CORS), and relaying org documents through
// public CORS proxies hands their links to third parties, so the importer asks here instead. Signed-in
// users only, Google Drive/Docs/Forms hosts only, one redirect hop at a time back onto those hosts,
// capped at 20 MB. A private file comes back as 403 so the importer can say "share it by link" rather
// than importing Google's sign-in page.
//
// Mounted in server.ts as:  app.use('/api/curriculum/fetch', express.json({ limit: '8kb' }), curriculumFetchRouter) (own rate limit)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed } from '../services/firebaseAdminRest';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = /^(drive|docs|drive\.usercontent)\.google\.com$/i;

/** Only Google Drive / Docs / Forms over https; rewrites share links to their downloadable form. */
export function resolveCurriculumUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) return null;
  const drive = u.pathname.match(/^\/file\/d\/([\w-]{10,})/);
  if (u.hostname === 'drive.google.com' && drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  const docMatch = u.pathname.match(/^\/document\/d\/([\w-]{10,})/);
  if (u.hostname === 'docs.google.com' && docMatch) {
    const tab = u.searchParams.get('tab');
    // Plain text by default; the HTML export when asked for (the importer reads tables from it).
    const format = u.searchParams.get('format') === 'html' ? 'html' : 'txt';
    return `https://docs.google.com/document/d/${docMatch[1]}/export?format=${format}${tab ? `&tab=${encodeURIComponent(tab)}` : ''}`;
  }
  const form = u.pathname.match(/^\/forms\/d\/(e\/)?([\w-]{10,})/);
  if (u.hostname === 'docs.google.com' && form) return `https://docs.google.com/forms/d/${form[1] || ''}${form[2]}/viewform`;
  return u.toString();
}

const looksLikeSignIn = (contentType: string, head: string) =>
  /text\/html/i.test(contentType) && /accounts\.google\.com\/(v3\/signin|ServiceLogin)|<title>[^<]*Sign in/i.test(head) && !/FB_PUBLIC_LOAD_DATA_/.test(head);

export interface CurriculumFetchDeps {
  verify: typeof verifyIdTokenDetailed;
  fetchImpl: typeof fetch;
}

export function createCurriculumFetchRouter({ verify, fetchImpl }: CurriculumFetchDeps = { verify: verifyIdTokenDetailed, fetchImpl: fetch }) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const t = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!t || t.isAnonymous) return res.status(401).json({ error: 'Sign in to import lessons.' });

    let target = resolveCurriculumUrl(String(req.body?.url || ''));
    if (!target) return res.status(400).json({ error: 'Only Google Drive, Docs and Forms links can be imported here.' });

    try {
      let r: Response | globalThis.Response | null = null;
      for (let hop = 0; hop < 5; hop++) {
        r = await fetchImpl(target, { redirect: 'manual', headers: { 'User-Agent': 'Plajah-Lesson-Import/1.0' } });
        const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
        if (!loc) break;
        const next = new URL(loc, target).toString();
        if (!ALLOWED.test(new URL(next).hostname) && !/^accounts\.google\.com$/i.test(new URL(next).hostname)) return res.status(502).json({ error: 'That link redirected somewhere we don’t import from.' });
        if (/^accounts\.google\.com$/i.test(new URL(next).hostname)) return res.status(403).json({ error: 'That file is private. Share it as “Anyone with the link”, then import again.', private: true });
        target = next;
      }
      if (!r || !('ok' in r) || !r.ok) {
        const status = r && 'status' in r ? r.status : 502;
        return res.status(status === 401 || status === 403 ? 403 : 502).json({ error: status === 401 || status === 403 ? 'That file is private. Share it as “Anyone with the link”, then import again.' : `Google answered ${status}.`, private: status === 401 || status === 403 });
      }
      const contentType = r.headers.get('content-type') || 'application/octet-stream';
      const declared = Number(r.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) return res.status(413).json({ error: 'That file is over 20 MB.' });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'That file is over 20 MB.' });
      if (looksLikeSignIn(contentType, buf.subarray(0, 200_000).toString('utf8'))) return res.status(403).json({ error: 'That file is private. Share it as “Anyone with the link”, then import again.', private: true });
      // Google's large-file "can't scan for viruses" page: follow its confirm form once.
      if (/text\/html/i.test(contentType) && /drive\.usercontent\.google\.com\/download/.test(buf.toString('utf8', 0, 50_000))) {
        const html = buf.toString('utf8');
        const action = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download)"/)?.[1];
        if (action) {
          const params = new URLSearchParams();
          for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) params.set(m[1], m[2]);
          const r2 = await fetchImpl(`${action}?${params}`, { headers: { 'User-Agent': 'Plajah-Lesson-Import/1.0' } });
          if (r2.ok) {
            const b2 = Buffer.from(await r2.arrayBuffer());
            if (b2.length > MAX_BYTES) return res.status(413).json({ error: 'That file is over 20 MB.' });
            res.setHeader('Content-Type', r2.headers.get('content-type') || 'application/octet-stream');
            return res.end(b2);
          }
        }
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    } catch (e) {
      return res.status(502).json({ error: e instanceof Error ? e.message : 'Couldn’t reach Google.' });
    }
  });

  return router;
}

export const curriculumFetchRouter = createCurriculumFetchRouter();
