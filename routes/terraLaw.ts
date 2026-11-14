// Terra Law Library: Michigan Compiled Laws (legislature.mi.gov, ≤1 req/s per its policy)
// and federal regulations (eCFR). Public, keyless upstreams; the server exists to hold the
// rate gate and the cache, so a thousand residents asking about security deposits cost the
// Legislature one request.
//
// GET /api/terra/law/mcl/search?q=security deposit
// GET /api/terra/law/mcl/section/:id        (554.602 | mcl-554-602)
// GET /api/terra/law/cfr/search?q=food truck
import express from 'express';
import { searchMcl, fetchMclSection, searchCfr, MCL_NOTICE, CFR_NOTICE } from '../services/terra/law/lawLibrary';

export function createTerraLawRouter(opts: { limiter?: express.RequestHandler } = {}) {
  const router = express.Router();
  const limit = opts.limiter ?? ((_q, _r, n) => n());
  const fail = (res: express.Response, status: number, err: unknown) =>
    res.status(status).json({ error: String((err as any)?.message || err).slice(0, 240) });
  const q = (req: express.Request) => String(req.query.q ?? '').trim().slice(0, 120);

  router.get('/api/terra/law/mcl/search', limit, async (req, res) => {
    if (q(req).length < 2) return fail(res, 400, 'q required');
    try { res.set('Cache-Control', 'public, max-age=3600').json({ ...(await searchMcl(q(req))), notice: MCL_NOTICE }); }
    catch (err) { fail(res, 502, err); }
  });

  router.get('/api/terra/law/mcl/section/:id', limit, async (req, res) => {
    try { res.set('Cache-Control', 'public, max-age=21600').json({ section: await fetchMclSection(req.params.id), notice: MCL_NOTICE }); }
    catch (err) { fail(res, /not an mcl/i.test(String((err as any)?.message)) ? 400 : 502, err); }
  });

  router.get('/api/terra/law/cfr/search', limit, async (req, res) => {
    if (q(req).length < 2) return fail(res, 400, 'q required');
    try { res.set('Cache-Control', 'public, max-age=3600').json({ ...(await searchCfr(q(req))), notice: CFR_NOTICE }); }
    catch (err) { fail(res, 502, err); }
  });

  return router;
}
