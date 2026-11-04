import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { bookingStep, campaignProblem, venueProblem, otsProofFile, sponsorFeeCents, verifyRecord, DAY_MS, ORGANIZER_TERMS_VERSION, TERMS_VERSION, type RecordEntry } from '../services/backShow/backShowCore';
import { createBackShowRouter } from '../routes/backShow';
import { makeMemoryLabelBackend } from '../labs/label/memoryBackend';
import { makeFakeStripe } from '../labs/back-show/fakeStripe';

const ACCEPT = { acceptedOrganizerTerms: ORGANIZER_TERMS_VERSION };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const T0 = Date.UTC(2026, 10, 1);
const draft = (over: Record<string, unknown> = {}) => ({
  title: 'Night Owl Live', artistName: 'Sam Okafor', organizerName: 'Owl Nights LLC', organizerRole: 'promoter', venue: 'The Loft', city: 'Detroit', showDate: T0 + 40 * DAY_MS, ticketUrl: 'https://tickets.example/owl',
  tiers: [
    { id: 'presents', kind: 'sponsor', name: 'Presented by', description: 'Name on the show', cancellationTerms: 'Full refund within 14 days', priceCents: 80000, limit: 1 },
    { id: 'banner', kind: 'ad', name: 'Stage banner', description: 'A banner on stage', cancellationTerms: 'Full refund within 14 days', priceCents: 20000 },
  ],
  ...over,
});

test('show validation', () => {
  assert.equal(campaignProblem(draft() as any, T0), null);
  assert.match(campaignProblem(draft({ showDate: T0 - 1 }) as any, T0)!, /future/);
  assert.match(campaignProblem(draft({ ticketUrl: 'javascript:alert(1)' }) as any, T0)!, /https/);
  const tier = (over: object) => draft({ tiers: [{ ...draft().tiers[0], ...over }] }) as any;
  assert.match(campaignProblem(tier({ cancellationTerms: '' }), T0)!, /cancelled/);
  assert.match(campaignProblem(tier({ description: '' }), T0)!, /gets/);
  assert.match(campaignProblem(tier({ kind: 'ticket' }), T0)!, /Unknown package/);
});

test('fee is 5%', () => {
  assert.equal(sponsorFeeCents(80000), 4000);
});

test('ots proof file has the standard header', () => {
  const f = otsProofFile('ab'.repeat(32), new Uint8Array([1, 2, 3]));
  assert.equal(Buffer.from(f.slice(0, 31)).toString('hex'), '004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294');
  assert.equal(f[31], 1);
  assert.equal(f[32], 8);
  assert.equal(f.length, 31 + 2 + 32 + 3);
});

async function server() {
  const backend = makeMemoryLabelBackend();
  backend.docs.set('users/artist', { displayName: 'Sam' });
  const stripe = makeFakeStripe();
  let clock = T0;
  const anchored: string[] = [];
  const files = new Map<string, Buffer>();
  const app = express();
  app.use('/api/back-show', express.json(), createBackShowRouter({
    cas: backend.cas, store: backend.store, now: () => clock, getStripe: () => stripe,
    trustedRequestOrigin: () => 'http://app.test', cronKeyOk: req => req.headers['x-cron-key'] === 'k',
    verify: async t => (t.startsWith('lab:') ? { uid: t.slice(4) } : null),
    files: { put: async (p, d) => { files.set(p, d); return true; }, get: async p => files.get(p) || null },
    timestamp: async d => { anchored.push(d); return [{ calendar: 'cal', response: new Uint8Array([9]) }]; },
  }));
  const srv = app.listen(0);
  const port = (srv.address() as AddressInfo).port;
  const call = async (uid: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/back-show${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer lab:${uid}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() as any };
  };
  /** Up to Stripe's page: returns the ids without paying. */
  const startBuy = async (uid: string, id: string, tierId: string, publicName = 'Corner Bakery') => {
    const start = await call(uid, 'POST', `/${id}/sponsorships`, { tierId, publicName, acceptedTerms: TERMS_VERSION });
    assert.equal(start.status, 200, JSON.stringify(start.json));
    const u = new URL(start.json.url);
    return { sid: u.searchParams.get('sponsorship')!, session: u.searchParams.get('session_id')! };
  };
  const buy = async (uid: string, id: string, tierId: string, publicName?: string) => {
    const { sid, session } = await startBuy(uid, id, tierId, publicName);
    stripe.completeSession(session);
    assert.equal((await call(uid, 'POST', `/${id}/sponsorships/${sid}/confirm`)).status, 200);
    return sid;
  };
  const tick = () => call(null, 'POST', '/cron/tick', undefined, { 'x-cron-key': 'k' });
  const setClock = (t: number) => { clock = t; };
  const postContract = async (uid: string, id: string, bytes = '%PDF-1.7 contract') => {
    const res = await fetch(`http://127.0.0.1:${port}/api/back-show/${id}/contract?name=deal.pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer lab:${uid}` }, body: bytes });
    return { status: res.status, json: await res.json() as any };
  };
  /** A Stripe account that has finished setup. */
  const seller = async (uid: string) => {
    assert.equal((await call(uid, 'POST', '/seller', { returnTo: '/desk' })).status, 200);
    stripe.finishOnboarding(backend.docs.get(`backShowSellers/${uid}`)!.accountId);
    return backend.docs.get(`backShowSellers/${uid}`)!.accountId as string;
  };
  return { call, postContract, files, startBuy, buy, seller, tick, setClock, backend, stripe, anchored, close: () => new Promise(r => srv.close(r)) };
}
type S = Awaited<ReturnType<typeof server>>;
const live = async (s: S, over = {}) => {
  if (!s.backend.docs.get('backShowSellers/artist')) await s.seller('artist');
  const id = (await s.call('artist', 'POST', '', draft(over))).json.id;
  assert.equal((await s.call('artist', 'POST', `/${id}/publish`, ACCEPT)).status, 200);
  return id;
};
const statusOf = (s: S, id: string) => s.backend.docs.get(`backShowCampaigns/${id}`)!.status;
const VENUE = { name: 'The Loft', street: '1 Main St', city: 'Detroit', region: 'MI', postalCode: '48201', country: 'United States', contactName: 'Dana Reed', phones: [{ label: 'Booking', number: '313-555-0100' }] };
/** Venue on record and contract verified by both sides. */
const verifyBoth = async (s: S, id: string) => {
  assert.equal((await s.call('artist', 'PUT', `/${id}/venue`, VENUE)).status, 200);
  const { hash } = (await s.postContract('artist', id)).json;
  assert.equal((await s.call('artist', 'POST', `/${id}/contract/verify`, { name: 'Sam Okafor', agree: true, contractHash: hash })).status, 200);
  const token = new URL((await s.call('artist', 'POST', `/${id}/contract/verify-link`)).json.url).pathname.split('/')[3];
  assert.equal((await s.call(null, 'POST', `/verify/${token}`, { name: 'Dana Reed', title: 'Owner', agree: true, contractHash: hash })).status, 200);
  return { hash, token };
};
const onSale = async (s: S, over = {}) => { const id = await live(s, over); await verifyBoth(s, id); return id; };

test('seller account: organizer is the seller, Stripe covers losses, no publishing until set up', async () => {
  const s = await server();
  try {
    const id = (await s.call('artist', 'POST', '', draft())).json.id;
    assert.match((await s.call('artist', 'POST', `/${id}/publish`, ACCEPT)).json.error, /Stripe account/);
    assert.deepEqual((await s.call('artist', 'GET', '/seller')).json, { hasAccount: false, ready: false });
    const link = await s.call('artist', 'POST', '/seller', { returnTo: '//evil.example' });
    assert.equal(link.json.url, 'http://app.test/', 'never sends them to another site');
    assert.match((await s.call('artist', 'POST', `/${id}/publish`, ACCEPT)).json.error, /Stripe account/, 'setup not finished');
    await s.call('artist', 'POST', '/seller', {});
    assert.equal(s.stripe.createdAccounts.length, 1, 'one account per person');
    const c = s.stripe.createdAccounts[0].controller;
    assert.equal(c.losses.payments, 'stripe');
    assert.equal(c.fees.payer, 'account');
    assert.equal(c.stripe_dashboard.type, 'full');
    s.stripe.finishOnboarding(s.stripe.createdAccounts[0].id);
    assert.equal((await s.call('artist', 'POST', `/${id}/publish`, {})).status, 400, 'terms required');
    assert.equal((await s.call('artist', 'POST', `/${id}/publish`, ACCEPT)).status, 200);
    assert.equal(s.backend.docs.get(`backShowCampaigns/${id}`)!.organizerAcceptance.version, ORGANIZER_TERMS_VERSION);
  } finally { await s.close(); }
});

test('selling: only after the contract is verified, charged on the organizer’s account, Plajah takes 5%, recorded once', async () => {
  const s = await server();
  try {
    const id = await live(s);
    const account = s.backend.docs.get('backShowSellers/artist')!.accountId;
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships`, { tierId: 'presents', publicName: 'X', acceptedTerms: TERMS_VERSION })).status, 409, 'no sales before the contract is verified');
    await verifyBoth(s, id);

    assert.equal((await s.call('artist', 'POST', `/${id}/sponsorships`, { tierId: 'presents', publicName: 'X', acceptedTerms: TERMS_VERSION })).status, 400, 'cannot sponsor your own show');
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships`, { tierId: 'presents', publicName: 'X' })).status, 400, 'terms required');
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships`, { tierId: 'presents', acceptedTerms: TERMS_VERSION })).status, 400, 'name required');

    const { sid, session } = await s.startBuy('biz', id, 'presents');
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships/${sid}/confirm`)).status, 409, 'not paid yet');
    s.stripe.completeSession(session);
    assert.equal((await s.call('other', 'POST', `/${id}/sponsorships/${sid}/confirm`)).status, 404);
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships/${sid}/confirm`)).status, 200);
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships/${sid}/confirm`)).status, 200);
    await s.tick();

    assert.deepEqual(s.stripe.charges.map((c: any) => [c.amount, c.applicationFee, c.stripeAccount]), [[80000, 4000, account]]);
    const pub = (await s.call(null, 'GET', `/${id}`)).json.campaign;
    assert.equal(pub.sponsoredCents, 80000);
    assert.deepEqual(pub.sponsors, [{ name: 'Corner Bakery', tier: 'Presented by' }]);
    assert.equal(pub.ticketUrl, 'https://tickets.example/owl');
    for (const hidden of ['ownerUid', 'sellerAccountId', 'organizerAcceptance', 'booking']) assert.equal(pub[hidden], undefined, hidden);

    s.setClock(T0 + 42 * DAY_MS);
    await s.tick();
    assert.equal(statusOf(s, id), 'completed');
    const rec = (await s.call(null, 'GET', `/${id}/record`)).json;
    assert.deepEqual(rec.entries.map((e: RecordEntry) => e.type), ['published', 'contract_verified', 'sponsored', 'completed']);
    const onRecord = rec.entries.find((e: RecordEntry) => e.type === 'contract_verified');
    assert.ok(!JSON.stringify(rec.entries).includes('555'), 'contact numbers stay off the public record');
    assert.equal(onRecord.data.name, 'The Loft');
    const check = await verifyRecord(rec.entries, sha);
    assert.ok(check.ok, check.problem);
    assert.equal(rec.anchors.at(-1).digest, check.head);
    const forged = structuredClone(rec.entries);
    forged[2].data.amountCents = 1;
    const bad = await verifyRecord(forged, sha);
    assert.equal(bad.ok, false);
    assert.equal(bad.atSeq, 3);
  } finally { await s.close(); }
});

test('limited packages: reserved at checkout, abandoned ones come back, a late payment is still counted', async () => {
  const s = await server();
  try {
    const id = await onSale(s);
    const first = await s.startBuy('biz', id, 'presents');
    assert.equal((await s.call('rival', 'POST', `/${id}/sponsorships`, { tierId: 'presents', publicName: 'Rival', acceptedTerms: TERMS_VERSION })).status, 409, 'reserved while they pay');

    // They abandon the page: it's closed, then the package comes back.
    await s.tick();
    assert.equal(s.backend.docs.get(`backShowSponsorships/${first.sid}`)!.status, 'pending', 'still inside the hold');
    s.setClock(T0 + 3600 * 1000);
    await s.tick();
    assert.equal(s.backend.docs.get(`backShowSponsorships/${first.sid}`)!.status, 'released');
    s.stripe.completeSession(first.session);
    assert.equal(s.stripe.charges.length, 0, 'a closed page can’t take payment');

    // They pay and never come back: the tick counts it.
    const second = await s.startBuy('rival', id, 'presents', 'Rival');
    s.stripe.completeSession(second.session);
    await s.tick();
    assert.equal(s.backend.docs.get(`backShowSponsorships/${second.sid}`)!.status, 'paid');
    await s.tick();
    assert.equal(s.backend.docs.get(`backShowCampaigns/${id}`)!.sponsoredCents, 80000, 'counted once');
    assert.equal((await s.call('third', 'POST', `/${id}/sponsorships`, { tierId: 'presents', publicName: 'T', acceptedTerms: TERMS_VERSION })).status, 409, 'sold out');
  } finally { await s.close(); }
});

test('refunds: only the organizer, from their account, returns Plajah’s fee, and never twice', async () => {
  const s = await server();
  try {
    const id = await onSale(s);
    const account = s.backend.docs.get('backShowSellers/artist')!.accountId;
    const sid = await s.buy('biz', id, 'presents');
    assert.equal((await s.call('biz', 'POST', `/${id}/sponsorships/${sid}/refund`, {})).status, 404, 'a sponsor cannot refund themselves');
    s.stripe.failRefunds = true;
    assert.match((await s.call('artist', 'POST', `/${id}/sponsorships/${sid}/refund`, {})).json.error, /Stripe balance/);
    assert.equal(s.backend.docs.get(`backShowSponsorships/${sid}`)!.status, 'paid', 'a failed refund changes nothing');
    s.stripe.failRefunds = false;
    assert.equal((await s.call('artist', 'POST', `/${id}/sponsorships/${sid}/refund`, {})).status, 200);
    assert.equal((await s.call('artist', 'POST', `/${id}/sponsorships/${sid}/refund`, {})).status, 409);
    assert.deepEqual(s.stripe.refunds.map((x: any) => [x.stripeAccount, x.refund_application_fee]), [[account, true]]);
    const c = s.backend.docs.get(`backShowCampaigns/${id}`)!;
    assert.equal(c.sponsoredCents, 0);
    assert.equal(c.tiers[0].sold, 0, 'the package can be sold again');
    const listed = (await s.call('artist', 'GET', `/${id}/sponsors`)).json.sponsors;
    assert.equal(listed[0].status, 'refunded');
  } finally { await s.close(); }
});

test('cancelling: sales stop, it’s on the record, and refunds stay the organizer’s decision', async () => {
  const s = await server();
  try {
    const id = await onSale(s);
    const sid = await s.buy('biz', id, 'presents');
    assert.equal((await s.call('biz', 'POST', `/${id}/cancel`, {})).status, 404, 'a sponsor cannot cancel');
    assert.equal((await s.call('artist', 'POST', `/${id}/cancel`, { reason: 'Venue closed' })).status, 200);
    assert.equal(statusOf(s, id), 'cancelled');
    assert.equal(s.stripe.refunds.length, 0, 'Plajah refunds nobody on its own');
    assert.equal((await s.call('fan', 'POST', `/${id}/sponsorships`, { tierId: 'banner', publicName: 'F', acceptedTerms: TERMS_VERSION })).status, 409);
    assert.equal((await s.call('artist', 'POST', `/${id}/sponsorships/${sid}/refund`, {})).status, 200, 'can still refund after cancelling');
    const types = (await s.call(null, 'GET', `/${id}/record`)).json.entries.map((e: RecordEntry) => e.type);
    assert.deepEqual(types.slice(-2), ['cancelled', 'refunded']);
  } finally { await s.close(); }
});

test('no contract verified by the show date: the show closes and nobody was ever charged', async () => {
  const s = await server();
  try {
    const id = await live(s);
    s.setClock(T0 + 40 * DAY_MS);
    await s.tick();
    assert.equal(statusOf(s, id), 'cancelled');
    assert.equal(s.stripe.charges.length, 0);
  } finally { await s.close(); }
});

test('venue rules: record kept private, both sides verify the same contract, changes void it', async () => {
  const s = await server();
  try {
    const noPhone = { ...VENUE, phones: [] };
    assert.match(venueProblem(noPhone)!, /contact number/);
    assert.match(venueProblem({ ...VENUE, street: '' })!, /full address/);
    assert.match(venueProblem({ ...VENUE, phones: [{ label: '', number: '12' }] })!, /10 to 15/);
    assert.equal(bookingStep(null), 'venue');

    const id = await live(s);
    assert.equal((await s.call('artist', 'PUT', `/${id}/venue`, noPhone)).status, 400);
    assert.equal((await s.call('fan', 'PUT', `/${id}/venue`, VENUE)).status, 404, 'only the artist');
    assert.equal((await s.postContract('artist', id)).status, 409, 'venue comes first');
    const venueId = (await s.call('artist', 'PUT', `/${id}/venue`, VENUE)).json.venueId;
    assert.equal(s.backend.docs.get(`businessVenues/${venueId}`)!.phones[0].number, '313-555-0100');
    assert.equal(s.backend.docs.get(`businessVenues/${venueId}`)!.status, 'unverified');
    assert.equal((await s.postContract('artist', id, 'not a pdf')).status, 400);

    const { hash: first } = (await s.postContract('artist', id)).json;
    assert.equal((await s.call('artist', 'POST', `/${id}/contract/verify`, { name: 'Sam', agree: true, contractHash: 'old' })).status, 409, 'must sign what they saw');
    assert.equal((await s.call('artist', 'POST', `/${id}/contract/verify`, { name: 'Sam', agree: true, contractHash: first })).status, 200);
    const url1 = (await s.call('artist', 'POST', `/${id}/contract/verify-link`)).json.url;
    const url2 = (await s.call('artist', 'POST', `/${id}/contract/verify-link`)).json.url;
    const token = new URL(url2).pathname.split('/')[3];
    assert.equal((await s.call(null, 'GET', `/verify/${new URL(url1).pathname.split('/')[3]}`)).status, 404, 'a new link replaces the old one');
    const view = await s.call(null, 'GET', `/verify/${token}`);
    assert.equal(view.json.venue.name, 'The Loft');
    assert.ok(!JSON.stringify(view.json).includes('555'), 'the signing page has no contact numbers');
    const sig = { name: 'Dana', title: 'Owner', agree: true, contractHash: first };
    assert.equal((await s.call('artist', 'POST', `/verify/${token}`, sig)).status, 403, 'the artist cannot sign for the venue');
    assert.equal((await s.call(null, 'POST', `/verify/${token}`, { ...sig, title: '' })).status, 400);

    // Nothing private on the public page; the artist's view has no signer IP or link hash.
    const pub = JSON.stringify((await s.call(null, 'GET', `/${id}`)).json);
    assert.ok(!pub.includes('555') && !pub.includes('booking'));
    const mine = JSON.stringify((await s.call('artist', 'GET', '/mine')).json);
    assert.ok(!mine.includes('verifyLinkHash') && !mine.includes('"ip"') && !mine.includes('"path"'));
    assert.equal((await s.call(null, 'GET', `/${id}/contract`)).status, 401);
    assert.equal((await s.call('fan', 'GET', `/${id}/contract`)).status, 404);

    // Swapping the contract voids the artist's verification, and the venue can't verify the old one.
    const { hash: second } = (await s.postContract('artist', id, '%PDF-1.7 changed')).json;
    assert.notEqual(second, first);
    assert.equal((await s.call('artist', 'GET', '/mine')).json.campaigns[0].booking.step, 'artist_verify');
    assert.equal((await s.call(null, 'POST', `/verify/${token}`, sig)).status, 409);
    assert.equal(s.backend.docs.get(`backShowCampaigns/${id}`)!.contractVerified, undefined);

    await verifyBoth(s, id);
    assert.equal(s.backend.docs.get(`businessVenues/${venueId}`)!.status, 'verified');
    assert.deepEqual(s.backend.docs.get(`businessVenues/${venueId}`)!.verifiedContact, { name: 'Dana Reed', title: 'Owner' });
    assert.equal((await s.postContract('artist', id, '%PDF-1.7 after')).status, 409, 'locked once confirmed');
    assert.ok((await s.call(null, 'GET', `/${id}`)).json.campaign.contractVerified.contractHash);

    // A second artist can't rewrite a verified record's numbers.
    const other = (await s.call('artist2', 'POST', '', draft())).json.id;
    await s.call('artist2', 'PUT', `/${other}/venue`, { ...VENUE, phones: [{ label: 'x', number: '999-999-9999' }] });
    assert.equal(s.backend.docs.get(`businessVenues/${venueId}`)!.phones[0].number, '313-555-0100');
  } finally { await s.close(); }
});

test('rules: drafts private, terms locked, cron key required', async () => {
  const s = await server();
  try {
    const dr = (await s.call('artist', 'POST', '', draft())).json.id;
    assert.equal((await s.call(null, 'GET', `/${dr}`)).status, 404, 'drafts are private');
    const unnamed = (await s.call('artist', 'POST', '', draft({ organizerName: '' }))).json.id;
    assert.match((await s.call('artist', 'POST', `/${unnamed}/publish`, ACCEPT)).json.error, /putting on the show/);
    const id = await live(s);
    assert.equal((await s.call('artist', 'PATCH', `/${id}`, draft({ title: 'Changed' }))).status, 409);
    assert.equal((await s.call('fan', 'GET', `/${id}/sponsors`)).status, 404);
    assert.equal((await s.call(null, 'POST', '/cron/tick')).status, 403);
  } finally { await s.close(); }
});
