import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  allocate, buildStatement, dealProblem, parseCsvRows, parseDistributorCsv, releaseReadiness, statementForParty, toCsv, toMicros, toMonth,
  type CatalogEntry, type PriorStatement,
} from '../services/label/labelCore';
import { createLabelRouter } from '../routes/labels';
import { makeMemoryLabelBackend } from '../labs/label/memoryBackend';

const ISRC_A = 'USRC17607839', ISRC_B = 'GBAYE0601498', UPC = '036000291452';
const album = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  albumId: 'a1', title: 'First', upc: UPC, isrcs: [ISRC_A],
  parties: [{ id: 'label', name: 'Lbl', uid: 'boss', bps: 5000 }, { id: 'art', name: 'Artist', uid: 'art', bps: 5000 }],
  ...over,
});
const build = (over: Partial<Parameters<typeof buildStatement>[0]> = {}) =>
  buildStatement({ periodEnd: '2026-09', catalog: [album()], imports: [], earnings: [], recoupables: [], prior: [], ...over });
const asPrior = (d: ReturnType<typeof build>, paid: Record<string, number> = {}): PriorStatement => ({
  periodEnd: d.periodEnd, closedAt: 1, appliedImportMonths: d.appliedImportMonths, appliedRecoupableIds: d.appliedRecoupableIds,
  closing: Object.fromEntries(d.parties.map(p => [p.id, { balanceCents: p.closingCents, unrecoupedCents: p.unrecoupedCents, paidCents: paid[p.id] || 0 }])),
});
const imp = (micros: number, month = '2026-09', id = 'i1', isrc = ISRC_A) => ({ id, source: 'DistroKid', rows: [{ isrc, upc: '', month, micros }] });
const line = (d: ReturnType<typeof build>, id: string) => d.parties.find(p => p.id === id)!;

test('allocate always sums to the whole', () => {
  for (const cents of [0, 1, 2, 3, 99, 100, 101, 12345]) {
    const out = allocate(cents, [{ id: 'a', bps: 3333 }, { id: 'b', bps: 3333 }, { id: 'c', bps: 3334 }]);
    assert.equal(out.a + out.b + out.c, cents);
  }
});

test('deal validation', () => {
  assert.equal(dealProblem([{ id: 'label', name: 'L', bps: 10000 }]), null);
  assert.match(dealProblem([{ id: 'label', name: 'L', bps: 9000 }])!, /100%/);
  assert.match(dealProblem([{ id: 'x', name: 'X', bps: 10000 }])!, /include the label/);
  assert.match(dealProblem([{ id: 'label', name: 'L', bps: 5000 }, { id: 'label', name: 'L', bps: 5000 }])!, /once/);
  assert.match(dealProblem([{ id: 'label', name: 'L', bps: 100.5 }])!, /between/);
});

test('csv: quotes, BOM, semicolons', () => {
  assert.deepEqual(parseCsvRows('﻿a,"b,c","d""e"\r\n1,2,3\r\n'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  assert.deepEqual(parseCsvRows('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('amount and month parsing', () => {
  assert.equal(toMicros('$1,234.56'), 1234560000);
  assert.equal(toMicros('(0.25)'), -250000);
  assert.equal(toMicros('0,25'), 250000);
  assert.equal(toMicros('0.00000342'), 3);
  assert.equal(toMicros('n/a'), null);
  assert.equal(toMonth('2026-09-14'), '2026-09');
  assert.equal(toMonth('Sep 2026'), '2026-09');
  assert.equal(toMonth('September-2026'), '2026-09');
  assert.equal(toMonth('09/2026'), '2026-09');
  assert.equal(toMonth('2026-13'), null);
});

test('distributor report rolls up by recording and month and counts what it skipped', () => {
  const csv = [
    'Sale Month,Store,Title,ISRC,Earnings (USD),Currency',
    `2026-09,Spotify,Song,${ISRC_A},0.004,USD`,
    `2026-09,Apple,Song,${ISRC_A},0.006,USD`,
    `2026-08,Spotify,Song,${ISRC_A},1.00,USD`,
    `2026-09,Spotify,Other,${ISRC_B},2.00,EUR`,
    '2026-09,Spotify,Nope,BAD,2.00,USD',
    `2026-09,Spotify,Song,${ISRC_B},oops,USD`,
  ].join('\n');
  const out = parseDistributorCsv(csv);
  assert.ok(!('error' in out));
  if ('error' in out) return;
  assert.equal(out.lineCount, 6);
  assert.deepEqual(out.rows.find(r => r.month === '2026-09')?.micros, 10000);
  assert.deepEqual(out.skipped, { noIdentifier: 1, badAmount: 1, otherCurrency: 1, noMonth: 0 });
  assert.ok('error' in parseDistributorCsv('just,some,columns\n1,2,3'));
});

test('a date-less report needs a month', () => {
  const csv = `ISRC,Royalty\n${ISRC_A},1.50`;
  const noMonth = parseDistributorCsv(csv);
  assert.ok(!('error' in noMonth) && noMonth.skipped.noMonth === 1);
  const withMonth = parseDistributorCsv(csv, '2026-08');
  assert.ok(!('error' in withMonth) && withMonth.rows[0].month === '2026-08');
});

test('fractions of a cent add up before rounding', () => {
  const d = build({ imports: [{ id: 'i1', source: 'D', rows: Array.from({ length: 1000 }, (_, i) => ({ isrc: ISRC_A, upc: '', month: '2026-09', micros: 3400 + (i % 1) })) }] });
  assert.equal(d.totals.externalCents, 340);
  assert.equal(line(d, 'art').earnedCents, 170);
});

test('direct Plajah money the artist already received is taken off what the label owes', () => {
  const d = build({
    imports: [imp(100_000_000)], // $100 reached the label
    earnings: [{ id: 'e1', albumId: 'a1', uid: 'art', netCents: 2000, at: Date.UTC(2026, 8, 5) }], // $20 reached the artist
  });
  assert.equal(d.totals.incomeCents, 12000);
  assert.equal(line(d, 'art').earnedCents, 6000);
  assert.equal(line(d, 'art').directReceivedCents, 2000);
  assert.equal(line(d, 'art').closingCents, 4000);
  assert.equal(line(d, 'label').closingCents, 6000);
});

test('advances recoup from earnings and carry forward, then pay out', () => {
  const adv = { id: 'r1', partyId: 'art', amountCents: 8000, date: '2026-08-01', note: 'advance' };
  const q1 = build({ imports: [imp(100_000_000)], recoupables: [adv] });
  assert.equal(line(q1, 'art').recoupedCents, 5000);
  assert.equal(line(q1, 'art').unrecoupedCents, 3000);
  assert.equal(line(q1, 'art').closingCents, 0);
  assert.equal(line(q1, 'label').closingCents, 10000);

  const q2 = build({ periodEnd: '2026-10', imports: [imp(100_000_000), imp(100_000_000, '2026-10', 'i2')], recoupables: [adv], prior: [asPrior(q1)] });
  assert.equal(line(q2, 'art').unrecoupedCents, 0, 'the advance is not counted twice');
  assert.equal(line(q2, 'art').recoupedCents, 3000);
  assert.equal(line(q2, 'art').closingCents, 2000);
  assert.equal(q2.totals.incomeCents, 10000, 'the september report is not counted twice');
});

test('late distributor lines land on the next statement', () => {
  const q1 = build({ imports: [imp(10_000_000)] });
  const late = imp(4_000_000, '2026-09', 'late');
  const q2 = build({ periodEnd: '2026-10', imports: [imp(10_000_000), late], prior: [asPrior(q1)] });
  assert.equal(q2.totals.incomeCents, 400);
});

test('recorded payments reduce the opening balance; a negative balance carries', () => {
  const q1 = build({ imports: [imp(100_000_000)] });
  const q2 = build({ periodEnd: '2026-10', prior: [asPrior(q1, { art: 3000 })] });
  assert.equal(line(q2, 'art').openingCents, 2000);
  const over = build({ earnings: [{ id: 'e', albumId: 'a1', uid: 'art', netCents: 1000, at: Date.UTC(2026, 8, 1) }] });
  assert.equal(line(over, 'art').closingCents, -500);
});

test('earnings in an earlier statement window are not counted again', () => {
  const earning = { id: 'e', albumId: 'a1', uid: 'art', netCents: 1000, at: Date.UTC(2026, 8, 1) };
  const q1 = build({ earnings: [earning] });
  const q2 = build({ periodEnd: '2026-10', earnings: [earning], prior: [asPrior(q1)] });
  assert.equal(q2.totals.directCents, 0);
});

test('unmatched income is reported, never silently allocated', () => {
  const d = build({ imports: [imp(5_000_000, '2026-09', 'i1', ISRC_B)] });
  assert.equal(d.totals.incomeCents, 0);
  assert.equal(d.unmatched[0].cents, 500);
  assert.equal(d.unmatched[0].key, ISRC_B);
});

test('unmatched income reaches a later statement once its code is fixed', () => {
  const report = { id: 'i1', source: 'D', rows: [
    { isrc: ISRC_A, upc: '', month: '2026-09', micros: 10_000_000 },
    { isrc: ISRC_B, upc: '', month: '2026-09', micros: 5_000_000 },
  ] };
  const q1 = build({ imports: [report] });
  assert.equal(q1.totals.incomeCents, 1000);
  assert.equal(q1.unmatched.length, 1);
  const q2 = build({ periodEnd: '2026-10', imports: [report], prior: [asPrior(q1)], catalog: [album({ isrcs: [ISRC_A, ISRC_B] })] });
  assert.equal(q2.totals.incomeCents, 500, 'only the newly matched row, not the one already paid');
  assert.equal(q2.unmatched.length, 0);
});

test('a sale paid to someone outside the deal raises a warning', () => {
  const d = build({ earnings: [{ id: 'e', albumId: 'a1', uid: 'stranger', netCents: 100, at: Date.UTC(2026, 8, 1) }] });
  assert.equal(d.warnings.length, 1);
});

test('an artist view hides the other parties', () => {
  const d = build({ imports: [imp(100_000_000)] });
  const v = statementForParty(d, ['art']);
  assert.deepEqual(v.parties.map(p => p.id), ['art']);
  assert.deepEqual(Object.keys(v.releases[0].shares), ['art']);
});

test('readiness flags what a distributor rejects', () => {
  const bad = releaseReadiness({ title: 'T', artist: 'A', tracks: [{ id: 't', title: 'x', trackMeta: { isrc: 'nope' } }], releaseMeta: { upc: '036000291453' } });
  assert.ok(bad.some(p => /Cover/.test(p.text)));
  assert.ok(bad.some(p => /UPC check digit/.test(p.text)));
  assert.ok(bad.some(p => /ISRC format/.test(p.text)));
  const good = releaseReadiness({ title: 'T', artist: 'A', coverUrl: 'c', releaseDate: 1, tracks: [{ id: 't', title: 'x', trackMeta: { isrc: ISRC_A } }], releaseMeta: { upc: UPC } });
  assert.deepEqual(good, []);
});

test('csv export neutralizes spreadsheet formulas', () => {
  assert.equal(toCsv([['=HYPERLINK("x")', 5, -5]]), `"'=HYPERLINK(""x"")",5,-5`);
});

test('a failed read aborts instead of finalizing an empty statement', async () => {
  const backend = makeMemoryLabelBackend();
  const app = express();
  const realQuery = backend.store.query;
  app.use(express.json(), createLabelRouter({ cas: backend.cas, store: { ...backend.store, query: async (c, f, l) => { if (c === 'labelImports') throw new Error('boom'); return realQuery(c, f, l); } }, verify: async () => ({ uid: 'boss' }), now: () => Date.UTC(2026, 10, 1) }));
  backend.docs.set('labels/L', { name: 'L', ownerUid: 'boss', memberUids: ['boss'], members: { boss: { role: 'owner' } }, artists: {}, artistUids: [] });
  const srv = app.listen(0);
  const log = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/L/statements`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: JSON.stringify({ through: '2026-09' }) });
    assert.equal(res.status, 503);
    assert.equal(backend.docs.has('labelStatements/L_2026-09'), false);
  } finally { console.error = log; srv.close(); }
});

// ── Router, end to end over HTTP with the in-memory backend ─────────────────

async function server(nowMs = Date.UTC(2026, 10, 1)) {
  const backend = makeMemoryLabelBackend();
  backend.docs.set('albums/alb', { ownerId: 'artist', title: 'Moon', artist: 'Moon Band', coverUrl: 'c', tracks: [{ id: 't1', title: 'One' }] });
  backend.docs.set('albums/other', { ownerId: 'stranger', title: 'Theirs', artist: 'S', tracks: [] });
  const app = express();
  app.use('/api/labels', express.json({ limit: '10mb' }), createLabelRouter({
    cas: backend.cas, store: backend.store, now: () => nowMs,
    verify: async t => (t.startsWith('lab:') ? { uid: t.slice(4) } : null),
  }));
  const srv = app.listen(0);
  const port = (srv.address() as AddressInfo).port;
  const call = async (uid: string | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/labels${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer lab:${uid}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() as any };
  };
  return { call, backend, close: () => new Promise(r => srv.close(r)) };
}

test('label flow: invite, consent, identifiers, import, statement, payment', async () => {
  const { call, backend, close } = await server();
  try {
    assert.equal((await call(null, 'GET', '/')).status, 401);
    const id = (await call('boss', 'POST', '/', { name: 'Night Owl' })).json.id;
    assert.ok(id);

    // Strangers learn nothing.
    assert.equal((await call('stranger', 'GET', `/${id}`)).status, 404);

    // Artist joins on stated terms; the code is single use.
    const code = (await call('boss', 'POST', `/${id}/invites`, { kind: 'artist', artistBps: 7000 })).json.code;
    assert.equal((await call('artist', 'POST', '/invites/lookup', { code })).json.artistBps, 7000);
    assert.equal((await call('artist', 'POST', '/invites/accept', { code })).status, 200);
    assert.equal((await call('other', 'POST', '/invites/accept', { code })).status, 404);

    // A label can't take an album its owner didn't link.
    assert.equal((await call('boss', 'POST', `/${id}/catalog`, { albumId: 'alb' })).status, 403);
    assert.equal((await call('artist', 'POST', `/${id}/catalog`, { albumId: 'other' })).status, 403);
    assert.equal((await call('artist', 'POST', `/${id}/catalog`, { albumId: 'alb' })).status, 200);
    assert.deepEqual(backend.docs.get('labelCatalog/alb')!.parties.map((p: any) => p.bps), [3000, 7000]);

    // One label per album.
    const second = (await call('rival', 'POST', '/', { name: 'Rival' })).json.id;
    const code2 = (await call('rival', 'POST', `/${second}/invites`, { kind: 'artist', artistBps: 9000 })).json.code;
    await call('artist', 'POST', '/invites/accept', { code: code2 });
    assert.equal((await call('artist', 'POST', `/${second}/catalog`, { albumId: 'alb' })).status, 409);

    // A deal change needs the other side; the proposer can't accept their own.
    const parties = [{ id: 'label', name: 'x', bps: 2000 }, { id: 'artist', name: 'Moon Band', uid: 'artist', bps: 8000 }];
    assert.equal((await call('boss', 'POST', `/${id}/catalog/alb/deal`, { parties: [{ id: 'label', name: 'x', bps: 1 }] })).status, 400);
    await call('artist', 'POST', `/${id}/catalog/alb/deal`, { parties });
    assert.equal(backend.docs.get('labelCatalog/alb')!.parties[0].bps, 3000);
    assert.equal((await call('artist', 'POST', `/${id}/catalog/alb/deal/accept`)).status, 400);
    assert.equal((await call('boss', 'POST', `/${id}/catalog/alb/deal/accept`)).status, 200);
    assert.equal(backend.docs.get('labelCatalog/alb')!.parties[0].bps, 2000);

    // Identifiers are checked and written on the artist's album without touching other fields.
    assert.equal((await call('boss', 'POST', `/${id}/catalog/alb/identifiers`, { upc: '036000291453' })).status, 400);
    assert.equal((await call('boss', 'POST', `/${id}/catalog/alb/identifiers`, { upc: UPC, isrcs: { t1: 'us-rc1-76-07839' } })).status, 200);
    const stored = backend.docs.get('albums/alb')!;
    assert.equal(stored.tracks[0].trackMeta.isrc, ISRC_A);
    assert.equal(stored.ownerId, 'artist');

    // Import once only; roles apply.
    const csv = `Sale Month,ISRC,Earnings (USD)\n2026-09,${ISRC_A},100.00`;
    assert.equal((await call('artist', 'POST', `/${id}/imports`, { csv, source: 'DistroKid' })).status, 403);
    assert.equal((await call('boss', 'POST', `/${id}/imports`, { csv, source: 'DistroKid' })).status, 200);
    assert.equal((await call('boss', 'POST', `/${id}/imports`, { csv, source: 'DistroKid' })).status, 409);

    // Plajah sale tied to the album.
    backend.docs.set('creatorEarnings/cs_1', { creatorUid: 'artist', workKind: 'track', workId: 'alb__t1', creatorNetCents: 1000, timestamp: Date.UTC(2026, 8, 2), status: 'transferred' });
    backend.docs.set('creatorEarnings/cs_2', { creatorUid: 'artist', workKind: 'track', workId: 'alb__t1', creatorNetCents: 500, timestamp: Date.UTC(2026, 8, 2), status: 'refunded' });

    const preview = (await call('boss', 'GET', `/${id}/statements/preview?through=2026-09`)).json;
    assert.equal(preview.blocked, null);
    assert.equal(preview.draft.totals.incomeCents, 11000);
    assert.equal((await call('boss', 'POST', `/${id}/statements`, { through: '2026-11' })).status, 400, 'open month');
    assert.equal((await call('artist', 'POST', `/${id}/statements`, { through: '2026-09' })).status, 403);
    const sid = (await call('boss', 'POST', `/${id}/statements`, { through: '2026-09' })).json.id;
    assert.ok(sid);
    assert.equal((await call('boss', 'POST', `/${id}/statements`, { through: '2026-09' })).status, 400, 'same period twice');

    // Artist sees their own line only: 80% of $110 less $10 received = $78.
    const seen = (await call('artist', 'GET', `/${id}/statements`)).json.statements;
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].parties.map((p: any) => p.id), ['artist']);
    assert.equal(seen[0].parties[0].closingCents, 7800);
    assert.equal(seen[0].closing, undefined);
    assert.equal((await call('artist', 'GET', `/${id}/imports`)).status, 403);

    // Payments can't exceed what's owed, and an applied report can't be removed.
    assert.equal((await call('boss', 'POST', `/${id}/statements/${sid}/payments`, { partyId: 'artist', amountCents: 7801 })).status, 400);
    assert.equal((await call('boss', 'POST', `/${id}/statements/${sid}/payments`, { partyId: 'artist', amountCents: 7800, reference: 'wire 1' })).status, 200);
    const imports = (await call('boss', 'GET', `/${id}/imports`)).json.imports;
    assert.equal((await call('boss', 'DELETE', `/${id}/imports/${imports[0].id}`)).status, 409);

    // The next statement opens at zero after that payment.
    const next = (await call('boss', 'GET', `/${id}/statements/preview?through=2026-10`)).json.draft;
    assert.equal(next.parties.find((p: any) => p.id === 'artist').openingCents, 0);

    // Team roles.
    const finance = (await call('boss', 'POST', `/${id}/invites`, { kind: 'team', role: 'finance' })).json.code;
    await call('kim', 'POST', '/invites/accept', { code: finance });
    assert.equal((await call('kim', 'POST', `/${id}/invites`, { kind: 'team', role: 'admin' })).status, 403);
    assert.equal((await call('kim', 'GET', `/${id}/imports`)).status, 200);
    assert.equal((await call('boss', 'DELETE', `/${id}/members/boss`)).status, 400);
    assert.equal((await call('boss', 'DELETE', `/${id}/artists/artist`)).status, 409);
  } finally { await close(); }
});
