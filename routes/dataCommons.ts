// Data Commons: Plajah's federal open-data layer (data.gov catalog, FEMA/Census/HUD/USGS place facts,
// Grants.gov matching, USAspending peer awards). All upstreams are keyless public APIs, so nothing
// secret lives here; the server exists for caching, timeouts, validation and one provenance format.
//
// GET  /api/data/catalog?q=&limit=&after=
// GET  /api/data/place?lat=&lng=
// GET  /api/data/geocode?address=
// POST /api/data/grants/match   { kind, topics[], keywords[], preferredAgencies?[] }
// GET  /api/data/grants/:id
// GET  /api/data/grants/peers?state=MI&county=163&keywords=housing,food
// GET  /api/data/financing?purpose=equipment&amount=120000   SBA loan programs ranked for a stated need
// GET  /api/data/contracts/options                            business types (NAICS) and certifications
import express from 'express';
import { searchCatalog } from '../services/dataCommons/catalog';
import { getFederalPlaceProfile, geocodeAddress } from '../services/dataCommons/place';
import { fetchOpportunity, matchGrants, peerAwards, TOPICS, ELIGIBILITY_BY_KIND, KIND_NOTES } from '../services/dataCommons/grants';
import { isValidLatLng } from '../services/dataCommons/core';
import { FINANCING_ASOF, FREE_HELP, PROGRAMS, recommendFinancing, type FinancePurpose } from '../services/dataCommons/financing';
import { BUSINESS_TYPES, CERTS } from '../services/dataCommons/contracts';

export function createDataCommonsRouter(opts: { limiter?: express.RequestHandler } = {}) {
  const router = express.Router();
  const limit = opts.limiter ?? ((_q, _r, n) => n());
  const fail = (res: express.Response, status: number, err: unknown) =>
    res.status(status).json({ error: String((err as any)?.message || err).slice(0, 240) });

  router.get('/api/data/catalog', limit, async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return fail(res, 400, 'q required');
    try {
      const page = await searchCatalog(q, {
        limit: Number(req.query.limit) || 12,
        after: typeof req.query.after === 'string' ? req.query.after : undefined,
      });
      res.set('Cache-Control', 'public, max-age=300').json(page);
    } catch (err) { fail(res, 502, err); }
  });

  router.get('/api/data/place', limit, async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!isValidLatLng(lat, lng)) return fail(res, 400, 'lat and lng (inside the United States) required');
    try {
      res.set('Cache-Control', 'public, max-age=600').json(await getFederalPlaceProfile(lat, lng));
    } catch (err) { fail(res, 502, err); }
  });

  router.get('/api/data/geocode', limit, async (req, res) => {
    try {
      const hit = await geocodeAddress(String(req.query.address ?? ''));
      if (!hit) return fail(res, 404, 'no match for that address');
      res.set('Cache-Control', 'public, max-age=3600').json(hit);
    } catch (err: any) {
      fail(res, /too short/.test(String(err?.message)) ? 400 : 502, err);
    }
  });

  // What the matcher accepts, so the UI never hard-codes the vocabulary.
  router.get('/api/data/grants/options', limit, (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').json({
      kinds: Object.keys(ELIGIBILITY_BY_KIND).map(k => ({ key: k, note: (KIND_NOTES as Record<string, string>)[k] })),
      topics: Object.entries(TOPICS).map(([key, t]) => ({ key, label: t.label })),
    });
  });

  router.post('/api/data/grants/match', limit, express.json({ limit: '8kb' }), async (req, res) => {
    try {
      res.json(await matchGrants(req.body));
    } catch (err: any) {
      // Bad input is the caller's; anything else is an upstream problem.
      const bad = /unknown applicant kind|pick at least one/.test(String(err?.message));
      fail(res, bad ? 400 : 502, err);
    }
  });

  router.get('/api/data/grants/peers', limit, async (req, res) => {
    try {
      const keywords = String(req.query.keywords ?? '').split(',').map(s => s.trim()).filter(Boolean);
      res.set('Cache-Control', 'public, max-age=600')
        .json(await peerAwards(String(req.query.state ?? '').toUpperCase(), String(req.query.county ?? ''), keywords));
    } catch (err: any) {
      fail(res, /required/.test(String(err?.message)) ? 400 : 502, err);
    }
  });

  const PURPOSES: FinancePurpose[] = ['working-capital', 'equipment', 'real-estate', 'refinance', 'startup', 'ownership-change'];
  router.get('/api/data/financing', limit, (req, res) => {
    const purpose = String(req.query.purpose || '') as FinancePurpose;
    if (!PURPOSES.includes(purpose)) return fail(res, 400, `purpose must be one of: ${PURPOSES.join(', ')}`);
    const raw = req.query.amount === undefined || req.query.amount === '' ? undefined : Number(req.query.amount);
    if (raw !== undefined && (!Number.isFinite(raw) || raw <= 0 || raw > 1e9)) return fail(res, 400, 'amount must be a positive number');
    res.set('Cache-Control', 'public, max-age=3600').json({
      asOf: FINANCING_ASOF, purpose, amount: raw, help: FREE_HELP,
      recommendations: recommendFinancing({ purpose, amount: raw, disaster: req.query.disaster === '1' }),
      programs: PROGRAMS.length,
      disclaimer: 'Guidance only, not a credit decision. Programs, limits and lenders change; confirm each on sba.gov and with the lender.',
    });
  });

  router.get('/api/data/contracts/options', limit, (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').json({ businessTypes: BUSINESS_TYPES, certifications: CERTS });
  });

  router.get('/api/data/grants/:id', limit, async (req, res) => {
    try {
      const detail = await fetchOpportunity(String(req.params.id));
      if (!detail) return fail(res, 404, 'not found');
      res.set('Cache-Control', 'public, max-age=600').json(detail);
    } catch (err: any) {
      fail(res, /numeric/.test(String(err?.message)) ? 400 : 502, err);
    }
  });

  return router;
}
