// Music law library: the live "Latest" feed (CourtListener + Federal Register). Public, read-only,
// keyless upstreams; the server exists for caching and one labelled format.
//
// GET /api/music-law/updates?max=12   → UpdatesResult (services/musicLaw/updates.ts)
import express from 'express';
import { fetchMusicLawUpdates } from '../services/musicLaw/updates';

export function createMusicLawRouter(opts: { limiter?: express.RequestHandler } = {}) {
  const router = express.Router();
  const limit = opts.limiter ?? ((_q, _r, n) => n());
  router.get('/api/music-law/updates', limit, async (req, res) => {
    try {
      const max = Number(req.query.max) || undefined;
      res.set('Cache-Control', 'public, max-age=900');
      res.json(await fetchMusicLawUpdates({ max }));
    } catch (e: any) {
      res.status(502).json({ error: String(e?.message || e).slice(0, 240) });
    }
  });
  return router;
}
