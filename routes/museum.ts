// Museum proxy: holds the Smithsonian / Europeana keys server-side so the browser never needs them.
// GET /api/museum/artifacts?q=&sources=smithsonian,europeana&limit=&only3d=1
import express from 'express';
import { REGIONS, type MuseumRegion } from '../services/museum/regions';
import { searchArtifacts, fetchArtifacts3D, type ArtifactSource } from '../services/artifactsService';

const ALLOWED: ArtifactSource[] = ['met', 'artic', 'cleveland', 'opencontext', 'smithsonian', 'europeana', 'commons', 'loc', 'harvard', 'rijks', 'nga', 'dpla', 'wellcome', 'jps', 'npm'];
const cache = new Map<string, { at: number; artifacts: unknown[] }>();
const TTL_MS = 10 * 60 * 1000;

export function createMuseumRouter(opts: { limiter?: express.RequestHandler } = {}) {
  const router = express.Router();
  // The NGA dataset takes ~20s to download and index on first use; warm it shortly after boot in production.
  if (process.env.NODE_ENV === 'production') setTimeout(() => { import('../services/museum/ngaIndex').then(m => m.searchNga('warm', 1)).catch(() => {}); }, 30_000).unref?.();
  router.get('/api/museum/artifacts', opts.limiter ?? ((_q, _r, n) => n()), async (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 200);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const sources = String(req.query.sources ?? '').split(',').filter((s): s is ArtifactSource => (ALLOWED as string[]).includes(s));
    const only3d = req.query.only3d === '1';
    const region = String(req.query.region ?? '') in REGIONS ? (String(req.query.region) as MuseumRegion) : undefined;
    const key = `${q}|${limit}|${sources.join(',')}|${only3d}|${region ?? ''}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.json({ artifacts: hit.artifacts });
    const artifacts = only3d
      ? await fetchArtifacts3D(q, { limit })
      : await searchArtifacts(q, { limit, sources: sources.length ? sources : undefined, region });
    if (artifacts.length) cache.set(key, { at: Date.now(), artifacts });
    res.set('Cache-Control', 'public, max-age=300').json({ artifacts });
  });
  return router;
}
