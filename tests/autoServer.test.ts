// Route-level tests for services/autoServer.ts with in-memory stores and a fake express app (no network).
// NHTSA and the model are stubbed: these prove caching, graceful degradation, privacy rules and the AI guard rails,
// NOT that the live NHTSA / Gemini calls work.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registerAutoRoutes } from '../services/autoServer';
import { memoryCasStore } from '../services/casCore';
import { newTicket, serializeTicket, cleanLine, applyTransition } from '../services/ticketCore';
import { AUTO_TICKET } from '../services/verticalPacks/packs/ticketConfigs';
import { renderTicketPageExtras } from '../services/ticketPageHooks';
import { DECODE_OK, RECALLS_OK } from './fixtures/nhtsa-fixtures';

const VIN = '2HGFC2F69KH500000';

function harness(opts: { nhtsa?: (url: string) => any; model?: (a: any) => Promise<string> } = {}) {
  const stores = new Map<string, ReturnType<typeof memoryCasStore>>();
  const store = (c: string) => { if (!stores.has(c)) stores.set(c, memoryCasStore()); return stores.get(c)!; };
  const routes = new Map<string, any[]>();
  const app = { post: (p: string, ...h: any[]) => routes.set('POST ' + p, h), get: (p: string, ...h: any[]) => routes.set('GET ' + p, h) };
  const calls = { fetch: 0, model: 0, prompts: [] as string[] };
  const express: any = { json: () => (_q: any, _s: any, n: any) => n() };
  registerAutoRoutes({
    app, express, rateLimit: () => (_q: any, _s: any, n: any) => n(), authMiddleware: (_q: any, _s: any, n: any) => n(),
    resolveActor: async (req: any) => ({ ok: true, staffId: req.uid, staffName: 'Owner', role: 'OWNER', perms: new Set(['DISCOUNT_OVERRIDE', 'RING_SALES']) }),
    managerApproval: async () => null,
    restCas: (c: string) => store(c),
    fsQueryDocs: async (c: string, f: any[]) => [...store(c).docs.entries()].filter(([, v]) => f.every(x => String(v.data[x.field]) === String(x.value))).map(([id, v]) => ({ id, data: v.data })),
    firestoreRead: async () => null, firestoreGetDeep: async () => null, firestoreCreate: async () => ({}), sendFcmMulticast: async () => ({}),
    fetchImpl: async (url: string) => { calls.fetch++; const r = (opts.nhtsa || ((u: string) => (u.includes('DecodeVin') ? DECODE_OK : RECALLS_OK)))(url); if (r === 'FAIL') throw new Error('boom'); return { ok: true, status: 200, json: async () => r }; },
    callModel: opts.model ? async (a: any) => { calls.model++; calls.prompts.push(a.system + a.user); return opts.model!(a); } : undefined,
  } as any);
  const invoke = async (method: 'POST' | 'GET', path: string, body: any = {}, uid = 'biz1', params: any = {}) => {
    const chain = routes.get(`${method} ${path}`); assert.ok(chain, `route ${path}`);
    let status = 200, out: any, type = '';
    const res: any = { status(s: number) { status = s; return res; }, json(j: any) { out = j; return res; }, send(h: any) { out = h; return res; }, type(t: string) { type = t; return res; }, setHeader() { return res; } };
    const req: any = { body: { businessUid: 'biz1', ...body }, uid, params, protocol: 'https', get: () => 'plajah.test', ip: '1.1.1.1' };
    for (const h of chain) { let went = false; await h(req, res, () => { went = true; }); if (!went) break; }
    return { status, out, type };
  };
  return { invoke, store, calls };
}
const seedTicket = (h: ReturnType<typeof harness>, o: { uid?: string; done?: boolean } = {}) => {
  let t = newTicket(AUTO_TICKET, { id: 'tk_1', seq: 1042, businessUid: 'biz1', packId: 'auto_repair', customer: { name: 'Dana Cruz', phone: '5551234567', email: 'd@x.com', ...(o.uid ? { uid: o.uid } : {}) }, subject: { vin: VIN, year: 2019, make: 'Honda', model: 'Civic', mileage_in: 48210 }, by: 'Owner', now: 1000 });
  const l = cleanLine(AUTO_TICKET, { kind: 'SERVICE', description: 'Oil & filter change', qty: 1, unitPriceCents: 9500 }, 'l1');
  t = { ...t, lines: [{ ...l.line!, approval: 'APPROVED' }] };
  if (o.done) { t = applyTransition(t, AUTO_TICKET, 'estimate', 'o'); t = applyTransition(t, AUTO_TICKET, 'approved', 'o'); t = applyTransition(t, AUTO_TICKET, 'in_progress', 'o'); t = applyTransition(t, AUTO_TICKET, 'ready', 'o'); t = applyTransition(t, AUTO_TICKET, 'picked_up', 'o'); }
  h.store('tickets').docs.set('tk_1', { data: serializeTicket(t, AUTO_TICKET), v: 1 });
};

describe('VIN decode + recalls (stubbed NHTSA)', () => {
  test('decode is cached forever; second call makes no NHTSA request', async () => {
    const h = harness();
    const a = await h.invoke('POST', '/api/auto/vin/decode', { vin: VIN.toLowerCase() });
    assert.equal(a.out.ok, true); assert.equal(a.out.vehicle.make, 'Honda'); assert.equal(a.out.cached, false);
    const b = await h.invoke('POST', '/api/auto/vin/decode', { vin: VIN });
    assert.equal(b.out.cached, true); assert.equal(h.calls.fetch, 1);
  });
  test('NHTSA down: graceful manual-entry message, no 500, and a brief negative cache', async () => {
    const h = harness({ nhtsa: () => 'FAIL' });
    const a = await h.invoke('POST', '/api/auto/vin/decode', { vin: VIN });
    assert.equal(a.status, 200); assert.equal(a.out.ok, false); assert.equal(a.out.manual, true); assert.match(a.out.error, /manually/);
    const n = h.calls.fetch; await h.invoke('POST', '/api/auto/vin/decode', { vin: VIN }); assert.equal(h.calls.fetch, n);
  });
  test('bad VIN is a 400 before any request', async () => { const h = harness(); const r = await h.invoke('POST', '/api/auto/vin/decode', { vin: 'NOPE' }); assert.equal(r.status, 400); assert.equal(h.calls.fetch, 0); });
  test('recalls cached 24h; stale cache is served when NHTSA fails', async () => {
    const h = harness();
    const a = await h.invoke('POST', '/api/auto/vin/recalls', { make: 'Honda', model: 'Civic', year: 2019 });
    assert.equal(a.out.ok, true); assert.equal(a.out.recalls.length, 2); assert.match(a.out.disclaimer, /Confirm by VIN/);
    await h.invoke('POST', '/api/auto/vin/recalls', { make: 'Honda', model: 'Civic', year: 2019 }); assert.equal(h.calls.fetch, 1);
    // age the cache past 24h and break NHTSA
    const doc = h.store('recallCache').docs.get('2019_honda_civic')!; doc.data.fetchedAt = Date.now() - 25 * 3_600_000;
    const h2 = harness({ nhtsa: () => 'FAIL' }); h2.store('recallCache').docs.set('2019_honda_civic', doc);
    const c = await h2.invoke('POST', '/api/auto/vin/recalls', { make: 'Honda', model: 'Civic', year: 2019 });
    assert.equal(c.out.ok, true); assert.equal(c.out.stale, true); assert.equal(c.out.recalls.length, 2);
    const d = await harness({ nhtsa: () => 'FAIL' }).invoke('POST', '/api/auto/vin/recalls', { make: 'Honda', model: 'Civic', year: 2019 });
    assert.equal(d.out.ok, false); assert.equal(d.out.manual, true);
  });
});

describe('vehicle records', () => {
  test('odometer cannot go backwards without override; override flags rollback', async () => {
    const h = harness();
    const v = { vin: VIN, make: 'Honda', model: 'Civic', year: 2019 };
    const a = await h.invoke('POST', '/api/auto/vehicle/save', { vehicle: v, odometer: 50000 }); assert.equal(a.status, 200);
    const b = await h.invoke('POST', '/api/auto/vehicle/save', { vehicle: v, odometer: 49000 }); assert.equal(b.status, 409); assert.equal(b.out.code, 'ODOMETER_LOWER');
    const c = await h.invoke('POST', '/api/auto/vehicle/save', { vehicle: v, odometer: 49000, odometerOverride: true }); assert.equal(c.status, 200);
    assert.equal(c.out.vehicle.mileage.some((m: any) => m.rollback), true);
  });
  test('same VIN upserts one record per business', async () => {
    const h = harness();
    await h.invoke('POST', '/api/auto/vehicle/save', { vehicle: { vin: VIN } }); await h.invoke('POST', '/api/auto/vehicle/save', { vehicle: { vin: VIN, make: 'Honda' } });
    assert.equal((await h.invoke('POST', '/api/auto/vehicle/list', {})).out.vehicles.length, 1);
  });
});

describe('AI advisor guard rails', () => {
  const setup = async (model?: (a: any) => Promise<string>) => {
    const h = harness({ model }); seedTicket(h);
    await h.invoke('POST', '/api/auto/inspection/save', { ticketId: 'tk_1', inspection: { items: { brk_front: { status: 'FAIL', measurement: 2, note: 'Customer Dana called from 555-123-4567 d@x.com' }, fl_oil: { status: 'WATCH' } }, techNotes: 'plate: KXT4410' } });
    return h;
  };
  test('good reply -> AI draft, prompt carries no PII or VIN', async () => {
    const h = await setup(async () => JSON.stringify({ items: [{ itemId: 'brk_front', explanation: 'Pads are very thin.', priority: 'SAFETY', hoursLow: 1, hoursHigh: 2, parts: ['pad set'] }] }));
    const r = await h.invoke('POST', '/api/auto/advisor/draft', { ticketId: 'tk_1' });
    assert.equal(r.out.source, 'AI'); assert.equal(r.out.draft.aiDraft, true); assert.match(r.out.label, /Review and edit/);
    const p = h.calls.prompts[0]; for (const bad of ['555-123-4567', 'd@x.com', VIN, 'KXT4410', 'Dana']) assert.ok(!p.includes(bad), bad);
    assert.match(p, /Honda/);
  });
  test('reply with a price is rejected -> standard wording, never the price', async () => {
    const h = await setup(async () => JSON.stringify({ items: [{ itemId: 'brk_front', explanation: 'This will cost $400 total.', priority: 'SAFETY' }] }));
    const r = await h.invoke('POST', '/api/auto/advisor/draft', { ticketId: 'tk_1' });
    assert.equal(r.out.source, 'TEMPLATE'); assert.ok(!JSON.stringify(r.out).includes('$400'));
  });
  test('no key / provider down -> template fallback, 200', async () => {
    const h = await setup(async () => { throw new Error('NO_KEY'); });
    const r = await h.invoke('POST', '/api/auto/advisor/draft', { ticketId: 'tk_1' }); assert.equal(r.status, 200); assert.equal(r.out.source, 'TEMPLATE'); assert.equal(r.out.unavailable, true);
    const h2 = await setup(async () => 'not json'); assert.equal((await h2.invoke('POST', '/api/auto/advisor/draft', { ticketId: 'tk_1' })).out.source, 'TEMPLATE');
  });
  test('nothing to explain is a 400; other business cannot read the ticket', async () => {
    const h = harness({ model: async () => '{}' }); seedTicket(h);
    await h.invoke('POST', '/api/auto/inspection/save', { ticketId: 'tk_1', inspection: { items: { brk_front: { status: 'PASS' } } } });
    assert.equal((await h.invoke('POST', '/api/auto/advisor/draft', { ticketId: 'tk_1' })).status, 400);
    assert.equal((await h.invoke('POST', '/api/auto/advisor/draft', { ticketId: 'tk_1', businessUid: 'someoneElse' }, 'someoneElse')).status, 404);
  });
});

describe('customer inspection report is gated on the advisor sharing it', () => {
  test('hidden until shared; tech notes never rendered', async () => {
    const h = harness(); seedTicket(h);
    await h.invoke('POST', '/api/auto/inspection/save', { ticketId: 'tk_1', inspection: { items: { brk_front: { status: 'FAIL', measurement: 2, note: 'INTERNAL gossip', customerNote: 'Pads are nearly gone.' } } } });
    const t = (await import('../services/ticketCore')).parseTicket(h.store('tickets').docs.get('tk_1')!.data);
    assert.equal(await renderTicketPageExtras(t, AUTO_TICKET), '');
    await h.invoke('POST', '/api/auto/inspection/share', { ticketId: 'tk_1', share: true });
    const html = await renderTicketPageExtras(t, AUTO_TICKET);
    assert.match(html, /Pads are nearly gone/); assert.ok(!html.includes('gossip'));
  });
});

describe('vehicle passport privacy', () => {
  test('publish requires a closed ticket; unlinked customer gets a claim code; entry has no prices/contacts', async () => {
    const h = harness(); seedTicket(h);
    assert.equal((await h.invoke('POST', '/api/auto/passport/publish', { ticketId: 'tk_1' })).status, 409);
    seedTicket(h, { done: true });
    const r = await h.invoke('POST', '/api/auto/passport/publish', { ticketId: 'tk_1' });
    assert.equal(r.status, 200); assert.match(r.out.claimCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.equal(r.out.ownerLinked, false);
    const e = JSON.stringify([...h.store('passportEntries').docs.values()].map(d => d.data.entry));
    assert.ok(!/9500|5551234567|d@x\.com|Dana/.test(e));
    assert.equal((await h.invoke('POST', '/api/auto/passport/publish', { ticketId: 'tk_1' })).out.alreadyPublished, true);
  });
  test('claim: needs the code, then only the owner reads; strangers get 404; others cannot steal a claimed vehicle', async () => {
    const h = harness(); seedTicket(h, { done: true });
    const code = (await h.invoke('POST', '/api/auto/passport/publish', { ticketId: 'tk_1' })).out.claimCode;
    assert.equal((await h.invoke('POST', '/api/garage/claim', { vin: VIN }, 'cust1')).status, 403);
    assert.equal((await h.invoke('POST', '/api/garage/claim', { vin: VIN, code: 'WRONG-CODE' }, 'cust1')).status, 403);
    assert.equal((await h.invoke('POST', '/api/garage/claim', { vin: VIN, code }, 'cust1')).out.status, 'CLAIMED');
    assert.equal((await h.invoke('POST', '/api/garage/claim', { vin: VIN, code }, 'cust2')).status, 409);
    const key = `vin_${VIN}`;
    assert.equal((await h.invoke('POST', '/api/garage/entries', { key }, 'cust2')).status, 404);
    const mine = await h.invoke('POST', '/api/garage/entries', { key }, 'cust1'); assert.equal(mine.out.entries.length, 1); assert.equal(mine.out.entries[0].verified, true);
    assert.equal((await h.invoke('POST', '/api/garage/list', {}, 'cust1')).out.vehicles[0].entryCount, 1);
    assert.equal((await h.invoke('POST', '/api/garage/list', {}, 'cust2')).out.vehicles.length, 0);
  });
  test('customer linked on the ticket owns the passport immediately', async () => {
    const h = harness(); seedTicket(h, { done: true, uid: 'cust1' });
    const r = await h.invoke('POST', '/api/auto/passport/publish', { ticketId: 'tk_1' }); assert.equal(r.out.ownerLinked, true); assert.equal(r.out.claimCode, '');
    assert.equal((await h.invoke('POST', '/api/garage/entries', { key: `vin_${VIN}` }, 'cust1')).out.entries.length, 1);
  });
  test('share token lets another shop read the entries; a bad/foreign token does not; /v/:token prints', async () => {
    const h = harness(); seedTicket(h, { done: true, uid: 'cust1' });
    await h.invoke('POST', '/api/auto/passport/publish', { ticketId: 'tk_1' });
    const key = `vin_${VIN}`;
    assert.equal((await h.invoke('POST', '/api/garage/share', { key }, 'cust2')).status, 404);
    const shop = (await h.invoke('POST', '/api/garage/share', { key, scope: 'shop' }, 'cust1')).out;
    const view = (await h.invoke('POST', '/api/garage/share', { key, scope: 'view' }, 'cust1')).out;
    assert.ok(shop.token && view.url);
    const seen = await h.invoke('POST', '/api/auto/passport/viewShared', { token: shop.token, businessUid: 'otherShop' }, 'otherShop');
    assert.equal(seen.status, 200); assert.equal(seen.out.entries.length, 1);
    assert.equal((await h.invoke('POST', '/api/auto/passport/viewShared', { token: shop.token.slice(0, -3) + 'abc', businessUid: 'otherShop' }, 'otherShop')).status, 400);
    const page = await h.invoke('GET', '/v/:token', {}, '', { token: view.token });
    assert.equal(page.status, 200); assert.match(page.out, /service history/); assert.match(page.out, /Oil &amp; filter change/);
    assert.equal((await h.invoke('GET', '/v/:token', {}, '', { token: 'garbage' })).status, 404);
  });
});
