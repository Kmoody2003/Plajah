// Plajah Build server routes: recall lookups, maker terms acceptance, live part prices, and the
// maker exchange (local shops and quote requests).
//
//   GET  /safety/recalls?q=charger      CPSC recalls (public API, no key), cached 6 h
//   GET  /terms                          { version, accepted } for the signed-in user
//   POST /terms        { version }       record acceptance (versioned)
//   GET  /supply/search?q=NE555P         DigiKey + Mouser offers when the operator set keys
//   GET  /shops?cap=laser-co2            public maker shops
//   PUT  /shops                          create/update the caller's shop
//   DELETE /shops                        remove the caller's shop
//   GET  /requests?cap=sewing            open quote requests (no contact details)
//   POST /requests                       post a request (signed in)
//   POST /requests/:id/quotes            a shop quotes (signed in, shop listed)
//   GET  /requests/:id/quotes            the requester reads quotes
//
// Money never passes through Plajah: a quote carries the maker's own payment link or contact and
// the parties pay each other directly. Firestore is written with the service account (rules do not
// apply), so every handler checks the caller itself. Mounted at /api/build.

import { Router, type Request, type Response } from 'express';
import { verifyIdToken, fsGet, fsSet, fsCreate, fsList, fsDelete } from '../services/firebaseAdminRest';
import { trimCpsc, type RecallHit } from '../services/safety/hazards';
import { BUILD_TERMS_VERSION } from '../services/safety/terms';
import { digikeyBody, digikeyOffers, mouserBody, mouserOffers, type Offer } from '../services/supply/sourcing';
import { SHOP_CAPABILITIES } from '../services/supply/directory';

export const makerBuildRouter = Router();

async function uidOf(req: Request): Promise<string | null> { const a = req.headers.authorization; return a?.startsWith('Bearer ') ? verifyIdToken(a.slice(7)) : null; }
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const CAPS = new Set(SHOP_CAPABILITIES.map(c => c.id));
const caps = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(c => CAPS.has(c)).slice(0, 20) : []);
const httpUrl = (v: unknown) => { const u = s(v, 400); return /^https:\/\//i.test(u) ? u : ''; };

// ---------------------------------------------------------------- recalls
const recallCache = new Map<string, { at: number; hits: RecallHit[] }>();
makerBuildRouter.get('/safety/recalls', async (req: Request, res: Response) => {
  const q = s(req.query.q, 60); if (q.length < 3) { res.status(400).json({ error: 'q must be at least 3 characters' }); return; }
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.since ?? '')) ? String(req.query.since) : `${new Date().getFullYear() - 5}-01-01`;
  const key = `${q.toLowerCase()}|${since}`; const hit = recallCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) { res.json({ source: 'CPSC', q, hits: hit.hits, cached: true }); return; }
  try {
    const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=${encodeURIComponent(q)}&RecallDateStart=${since}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) { res.status(502).json({ error: `CPSC answered ${r.status}` }); return; }
    const rows = (await r.json()) as any[];
    const hits = rows.map(trimCpsc).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    recallCache.set(key, { at: Date.now(), hits }); if (recallCache.size > 500) recallCache.delete(recallCache.keys().next().value!);
    res.json({ source: 'CPSC', q, hits });
  } catch (e: any) { res.status(502).json({ error: `Recall lookup failed: ${String(e?.message ?? e)}` }); }
});

// ---------------------------------------------------------------- terms
makerBuildRouter.get('/terms', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.json({ version: BUILD_TERMS_VERSION, accepted: null }); return; }
  const d = await fsGet(`buildTermsAcceptance/${uid}`); res.json({ version: BUILD_TERMS_VERSION, accepted: d?.version === BUILD_TERMS_VERSION ? d : null });
});
makerBuildRouter.post('/terms', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to record acceptance' }); return; }
  if (req.body?.version !== BUILD_TERMS_VERSION) { res.status(409).json({ error: 'Terms changed; reload and read the current version', version: BUILD_TERMS_VERSION }); return; }
  const row = { version: BUILD_TERMS_VERSION, at: Date.now(), userAgent: s(req.headers['user-agent'], 200) };
  await fsSet(`buildTermsAcceptance/${uid}`, row); res.json({ ok: true, accepted: row });
});

// ---------------------------------------------------------------- live part prices
let dkToken: { token: string; until: number } | null = null;
async function digikey(q: string): Promise<Offer[] | null> {
  const id = process.env.DIGIKEY_CLIENT_ID, secret = process.env.DIGIKEY_CLIENT_SECRET; if (!id || !secret) return null;
  if (!dkToken || Date.now() > dkToken.until) {
    const t = await fetch('https://api.digikey.com/v1/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }), signal: AbortSignal.timeout(15_000) });
    if (!t.ok) throw new Error(`DigiKey token ${t.status}`); const j = await t.json() as any; dkToken = { token: j.access_token, until: Date.now() + (Number(j.expires_in ?? 600) - 60) * 1000 };
  }
  const r = await fetch('https://api.digikey.com/products/v4/search/keyword', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dkToken.token}`, 'X-DIGIKEY-Client-Id': id, 'X-DIGIKEY-Locale-Currency': 'USD' }, body: JSON.stringify(digikeyBody(q)), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`DigiKey ${r.status}`); return digikeyOffers(await r.json());
}
async function mouser(q: string): Promise<Offer[] | null> {
  const key = process.env.MOUSER_API_KEY; if (!key) return null;
  const r = await fetch(`https://api.mouser.com/api/v1/search/keyword?apiKey=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(mouserBody(q)), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Mouser ${r.status}`); return mouserOffers(await r.json());
}
const priceCache = new Map<string, { at: number; body: unknown }>();
makerBuildRouter.get('/supply/search', async (req: Request, res: Response) => {
  const q = s(req.query.q, 80); if (q.length < 2) { res.status(400).json({ error: 'q required' }); return; }
  const c = priceCache.get(q.toLowerCase()); if (c && Date.now() - c.at < 3600_000) { res.json(c.body); return; }
  const out: { q: string; offers: Offer[]; configured: { digikey: boolean; mouser: boolean }; errors: string[] } = { q, offers: [], configured: { digikey: !!process.env.DIGIKEY_CLIENT_ID, mouser: !!process.env.MOUSER_API_KEY }, errors: [] };
  const [a, b] = await Promise.allSettled([digikey(q), mouser(q)]);
  for (const r of [a, b]) { if (r.status === 'fulfilled') out.offers.push(...(r.value ?? [])); else out.errors.push(String(r.reason?.message ?? r.reason)); }
  out.offers.sort((x, y) => (x.price ?? 1e9) - (y.price ?? 1e9)); priceCache.set(q.toLowerCase(), { at: Date.now(), body: out }); res.json(out);
});

// ---------------------------------------------------------------- maker shops
makerBuildRouter.get('/shops', async (req: Request, res: Response) => {
  const cap = s(req.query.cap, 30); const rows = await fsList('makerShops', { maxDocs: 500 });
  const shops = rows.map(r => ({ id: r.id, ...r.data })).filter((x: any) => x.listed !== false && (!cap || (x.capabilities ?? []).includes(cap)));
  res.json({ shops: shops.map((x: any) => ({ id: x.id, name: x.name, about: x.about, city: x.city, region: x.region, country: x.country, capabilities: x.capabilities, machines: x.machines, materials: x.materials, leadDays: x.leadDays, website: x.website, contact: x.contact, shipping: x.shipping, updatedAt: x.updatedAt })) });
});
makerBuildRouter.put('/shops', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to list your shop' }); return; }
  const b = req.body ?? {}; const name = s(b.name, 80); const capabilities = caps(b.capabilities);
  if (!name || !capabilities.length) { res.status(400).json({ error: 'A shop needs a name and at least one capability' }); return; }
  const row = { ownerUid: uid, name, about: s(b.about, 1000), city: s(b.city, 60), region: s(b.region, 60), country: s(b.country, 60), capabilities, machines: s(b.machines, 400), materials: s(b.materials, 400),
    leadDays: Math.max(0, Math.min(365, Number(b.leadDays) || 0)), website: httpUrl(b.website), contact: s(b.contact, 120), shipping: !!b.shipping, listed: b.listed !== false, safetyAck: b.safetyAck === true, updatedAt: Date.now() };
  if (!row.safetyAck) { res.status(400).json({ error: 'Confirm that you run your machines safely and carry your own insurance' }); return; }
  await fsSet(`makerShops/${uid}`, row); res.json({ ok: true, shop: { id: uid, ...row } });
});
makerBuildRouter.delete('/shops', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in' }); return; }
  await fsDelete(`makerShops/${uid}`); res.json({ ok: true });
});

// ---------------------------------------------------------------- quote requests
makerBuildRouter.get('/requests', async (req: Request, res: Response) => {
  const cap = s(req.query.cap, 30); const rows = await fsList('makerRequests', { maxDocs: 300 });
  const open = rows.map(r => ({ id: r.id, ...r.data } as any)).filter(x => x.status === 'open' && (!cap || (x.processes ?? []).includes(cap)))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 100)
    .map(x => ({ id: x.id, title: x.title, details: x.details, processes: x.processes, qty: x.qty, city: x.city, country: x.country, needBy: x.needBy, files: x.files, hazards: x.hazards, createdAt: x.createdAt }));
  res.json({ requests: open });
});
makerBuildRouter.post('/requests', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to post a request' }); return; }
  const b = req.body ?? {}; const title = s(b.title, 120); const processes = caps(b.processes);
  if (!title || !processes.length) { res.status(400).json({ error: 'A request needs a title and at least one process' }); return; }
  const files = (Array.isArray(b.files) ? b.files : []).slice(0, 10).map((f: any) => ({ name: s(f?.name, 120), url: httpUrl(f?.url) })).filter((f: any) => f.url);
  const id = await fsCreate('makerRequests', { ownerUid: uid, title, details: s(b.details, 3000), processes, qty: Math.max(1, Math.min(100000, Number(b.qty) || 1)), city: s(b.city, 60), country: s(b.country, 60), needBy: s(b.needBy, 20), files,
    hazards: (Array.isArray(b.hazards) ? b.hazards : []).slice(0, 12).map((h: unknown) => s(h, 160)), status: 'open', createdAt: Date.now() });
  res.json({ ok: !!id, id });
});
makerBuildRouter.post('/requests/:id/quotes', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in to quote' }); return; }
  const shop = await fsGet(`makerShops/${uid}`); if (!shop) { res.status(403).json({ error: 'List your shop first' }); return; }
  const id = s(req.params.id, 60); const r = await fsGet(`makerRequests/${id}`); if (!r || r.status !== 'open') { res.status(404).json({ error: 'Request not found or closed' }); return; }
  const b = req.body ?? {}; const price = Number(b.price); if (!Number.isFinite(price) || price < 0) { res.status(400).json({ error: 'Price required' }); return; }
  const qid = await fsCreate(`makerRequests/${id}/quotes`, { shopUid: uid, shopName: shop.name, price, currency: s(b.currency || 'USD', 3).toUpperCase(), days: Math.max(0, Math.min(365, Number(b.days) || 0)), note: s(b.note, 1500), payLink: httpUrl(b.payLink), contact: s(b.contact || shop.contact, 120), createdAt: Date.now() });
  res.json({ ok: !!qid, id: qid });
});
makerBuildRouter.get('/requests/:id/quotes', async (req: Request, res: Response) => {
  const uid = await uidOf(req); if (!uid) { res.status(401).json({ error: 'Sign in' }); return; }
  const id = s(req.params.id, 60); const r = await fsGet(`makerRequests/${id}`); if (!r) { res.status(404).json({ error: 'Not found' }); return; }
  if (r.ownerUid !== uid) { res.status(403).json({ error: 'Only the requester can read quotes' }); return; }
  const rows = await fsList(`makerRequests/${id}/quotes`, { maxDocs: 100 }); res.json({ quotes: rows.map(q => ({ id: q.id, ...q.data })) });
});
