import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  parsePrice, parsePackages, normalizeOffers, normalizeQuotes, normalizeUrl, extractUrls, buildReport, buildArticleDraft,
  buildProductDraft, productHoldReason, autoNotice, muxClipStreamUrl, CLIP_MAX_SEC, CLIP_MIN_SEC,
} from '../services/reello/intel/core.ts';
import { applyTemplate, tidyFileName, sanitizePrefs, newTemplate, isVideoFile } from '../services/reello/uploadPrefs.ts';
import { createReelloIntelRouter, parseModelJson, type ReelloIntelStore } from '../routes/reelloIntel.ts';

// ── prices + packages ─────────────────────────────────────────────────────────

test('parsePrice reads symbols, words and thousands', () => {
  assert.deepEqual(parsePrice('only $19.99 today'), { amount: 19.99, currency: 'USD' });
  assert.deepEqual(parsePrice('€12'), { amount: 12, currency: 'EUR' });
  assert.deepEqual(parsePrice('it is 25 dollars'), { amount: 25, currency: 'USD' });
  assert.deepEqual(parsePrice('$1,200'), { amount: 1200, currency: 'USD' });
  assert.equal(parsePrice('free'), null);
});

test('parsePackages finds multi-item offers', () => {
  assert.deepEqual(parsePackages('3 for $50').map(p => [p.quantity, p.price]), [[3, 50]]);
  assert.deepEqual(parsePackages('grab the 2-pack $30 or a 6 pack: $80').map(p => [p.quantity, p.price]), [[2, 30], [6, 80]]);
  assert.deepEqual(parsePackages('bundle of four for $60').map(p => [p.quantity, p.price]), [[4, 60]]);
  assert.deepEqual(parsePackages('buy 2 get 1 free', 10).map(p => [p.quantity, p.price]), [[3, 20]]);
  assert.deepEqual(parsePackages('$24.99'), []);
});

test('normalizeOffers merges said+shown mentions and keeps packages', () => {
  const offers = normalizeOffers([
    { name: 'Lavender Candle', priceText: '$18', evidence: 'speech', tSec: 40, confidence: 0.9 },
    { name: 'lavender candle', priceText: '3 for $45', evidence: 'graphic', tSec: 12, url: 'shop.example.com/candle', confidence: 0.6 },
    { name: 'Gift box', priceText: '3 for $50', evidence: 'graphic', tSec: 90 },
  ], { durationSec: 120 });
  assert.equal(offers.length, 2);
  const c = offers[0];
  assert.equal(c.price, 18);
  assert.equal(c.evidence, 'both');
  assert.equal(c.tSec, 12);
  assert.equal(c.url, 'https://shop.example.com/candle');
  assert.deepEqual(c.packages.map(p => [p.quantity, p.price]), [[1, 18], [3, 45]]);
  // "3 for $50" alone is a package, not a $50 unit price.
  assert.equal(offers[1].price, null);
  assert.deepEqual(offers[1].packages.map(p => [p.quantity, p.price]), [[3, 50]]);
});

test('links: spoken forms, bare domains, description', () => {
  assert.equal(normalizeUrl('shop dot example dot com slash hats'), 'https://shop.example.com/hats');
  assert.equal(normalizeUrl('not a url'), null);
  assert.deepEqual(extractUrls('Merch at https://store.band.com/tour. Also band.shop!'), ['https://store.band.com/tour', 'https://band.shop']);
});

test('quote clips get lead-in, stay in range and never repeat a moment', () => {
  const q = normalizeQuotes([
    { text: 'You never stop learning.', startSec: 10, endSec: 12 },
    { text: 'You never stop learning — really.', startSec: 10.5, endSec: 13 },
    { text: 'A very long monologue', startSec: 50, endSec: 200 },
    { text: 'Last words', startSec: 118, endSec: 125 },
  ], 120);
  assert.equal(q.length, 3);
  assert.equal(q[0].startSec, 8.5);
  assert.ok(q[0].endSec - q[0].startSec >= CLIP_MIN_SEC);
  assert.ok(q[1].endSec - q[1].startSec <= CLIP_MAX_SEC);
  assert.ok(q[2].endSec <= 120);
  assert.match(muxClipStreamUrl('PID', q[0].startSec, q[0].endSec), /asset_start_time=8\.5&asset_end_time=/);
});

// ── drafts ────────────────────────────────────────────────────────────────────

const RAW = {
  summary: 'A potter shows how she glazes mugs. She reveals the secret at the end.',
  topics: ['pottery'],
  chapters: [{ tSec: 0, title: 'Intro' }, { tSec: 60, title: 'Glazing' }],
  offers: [{ name: 'Speckled Mug', priceText: '$32 or 2-pack $55', evidence: 'both', tSec: 70, confidence: 0.9, url: 'clay.example.com/mug' }, { name: 'Glaze kit', evidence: 'speech', tSec: 80, confidence: 0.4 }],
  quotes: [{ text: 'Every crack tells you where the heat went.', startSec: 65, endSec: 69, speaker: 'Ana' }],
  links: [{ url: 'clay.example.com', evidence: 'graphic', tSec: 5 }],
};

test('article teases, quotes with timestamps, and sends readers to the video', () => {
  const report = buildReport(RAW, { durationSec: 180, playbackId: 'PID', description: 'More at clay.example.com/classes' });
  assert.ok(report.stills.length >= 2 && report.stills[0].url.includes('image.mux.com/PID'));
  assert.ok(report.links.some(l => l.url === 'https://clay.example.com/classes' && l.evidence === 'description'));
  const a = buildArticleDraft({ title: 'The crack that tells the story', dek: 'Ana glazes.', sections: [{ heading: 'Heat', body: 'Watch closely.' }], tease: 'And then the kiln opens.' }, report, { videoId: 'vid_1', videoTitle: 'Glazing mugs' });
  const quote = a.blocks.find(b => b.type === 'QUOTE')!;
  assert.match(quote.caption!, /1:03 in the video/);
  assert.match(quote.caption!, /t=63/);
  const last = a.blocks[a.blocks.length - 1];
  assert.equal(last.type, 'VIDEO');
  assert.ok(a.blocks.some(b => b.type === 'TEXT' && /Watch the full video/.test(b.content)));
  assert.ok(a.blocks.some(b => b.type === 'HEADING' && b.content === 'Featured in the video'));
});

test('product drafts: packages → variants, links sell externally, holds without a price', () => {
  const report = buildReport(RAW, { durationSec: 180, playbackId: 'PID' });
  const mug = report.offers.find(o => o.name === 'Speckled Mug')!;
  const p = buildProductDraft(mug, { sellerId: 'u1', sellerName: 'Ana', sellerType: 'USER', videoId: 'vid_1', videoTitle: 'Glazing mugs', notice: autoNotice('Ana', 'Glazing mugs'), now: 1, active: true });
  assert.equal(p.price, 32);
  assert.deepEqual(p.variants!.map(v => [v.name, v.priceModifier]), [['Single', 0], ['2-pack', 23]]);
  assert.equal(p.fulfillmentSource, 'external');
  assert.equal(p.externalStoreUrl, 'https://clay.example.com/mug');
  assert.match(p.description, /Ana may change this soon/);
  const kit = report.offers.find(o => o.name === 'Glaze kit')!;
  assert.ok(productHoldReason(kit));
  assert.equal(productHoldReason(mug), null);
});

// ── templates ─────────────────────────────────────────────────────────────────

test('templates fill titles from tokens and fall back to the account default', () => {
  assert.equal(tidyFileName('my_trip-to-lisbon_FINAL (2).mp4'), 'My trip to lisbon');
  const t = { ...newTemplate('Vlog'), titlePattern: '{folder} vlog #{n}: {name}', description: 'Shop: {account}.shop', visibility: null };
  const a = applyTemplate(t, { fileName: 'day_one.mov', folder: 'Japan', index: 4, account: 'ana' }, { defaultVisibility: 'PUBLIC' });
  assert.equal(a.title, 'Japan vlog #5: Day one');
  assert.equal(a.description, 'Shop: ana.shop');
  assert.equal(a.visibility, 'PUBLIC');
  assert.equal(applyTemplate({ ...t, visibility: 'PRIVATE' }, { fileName: 'x.mp4' }, { defaultVisibility: 'PUBLIC' }).visibility, 'PRIVATE');
  assert.ok(isVideoFile({ name: 'clip.MTS' }) && !isVideoFile({ name: 'notes.txt', type: 'text/plain' }));
  const clean = sanitizePrefs({ defaultVisibility: 'nope', templates: [{ name: 'x', intel: { publishMode: 'AUTO', merchTarget: { kind: 'ORG', orgId: 'o1' } } }] });
  assert.equal(clean.defaultVisibility, 'PRIVATE');
  assert.equal(clean.templates[0].intel.publishMode, 'AUTO');
  assert.equal(clean.templates[0].intel.merchTarget.orgId, 'o1');
});

test('parseModelJson survives fences and a cut-off answer', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  const cut = parseModelJson('{"summary":"ok","quotes":[{"text":"one","startSec":1},{"text":"tw');
  assert.equal(cut.summary, 'ok');
  assert.equal(cut.quotes.length, 1);
});

// ── the router, end to end on a fake store ───────────────────────────────────

function memStore(seed: Record<string, any>) {
  const docs = new Map<string, any>(Object.entries(seed));
  let n = 0;
  const store: ReelloIntelStore = {
    async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
    async set(p, d) { docs.set(p, structuredClone(d)); return true; },
    async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
    async create(c, d) { const id = `${c}_${++n}`; docs.set(`${c}/${id}`, structuredClone(d)); return id; },
    async query(c, f) { return [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split('/').length === 2 && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v })); },
  };
  return { store, docs };
}

async function withServer(router: express.Router, fn: (base: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use('/api/reello', router);
  const srv = app.listen(0);
  try { await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/reello`); } finally { srv.close(); }
}

const until = async (f: () => Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await f()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('timed out'); };

test('router: approve mode drafts, then posting makes real article / clip / listing', async () => {
  const { store, docs } = memStore({
    'videos/vid_1': { ownerId: 'u1', title: 'Glazing mugs', description: '', muxPlaybackId: 'PID', duration: 180 },
    'users/u1': { displayName: 'Ana Clay' },
  });
  const router = createReelloIntelRouter({
    store, callerUid: async req => (req.headers.authorization === 'Bearer u1' ? 'u1' : req.headers.authorization === 'Bearer u2' ? 'u2' : null),
    watch: async () => ({ raw: RAW, usage: { inTokens: 10, outTokens: 5, costUsd: 0.01 } }),
    write: async () => ({ raw: { title: 'Headline', sections: [{ heading: 'H', body: 'B' }], tease: 'T' }, usage: { inTokens: 1, outTokens: 1, costUsd: 0 } }),
    resolvePlayback: async v => v.muxPlaybackId || null,
  });
  await withServer(router, async base => {
    const H = (who: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${who}` });
    let r = await fetch(`${base}/intel/analyze`, { method: 'POST', headers: H('u2'), body: JSON.stringify({ videoId: 'vid_1' }) });
    assert.equal(r.status, 403, 'only the owner can analyze');
    r = await fetch(`${base}/intel/analyze`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ videoId: 'vid_1' }) });
    assert.equal(r.status, 200);
    await until(async () => docs.get('reelloIntel/vid_1')?.status === 'READY');
    const job = docs.get('reelloIntel/vid_1');
    assert.deepEqual(Object.values(job.drafts).map((d: any) => d.status), ['DRAFT', 'DRAFT', 'DRAFT', 'DRAFT']);
    assert.equal((await fetch(`${base}/intel/vid_1`, { headers: H('u2') })).status, 404, 'drafts are private');

    r = await fetch(`${base}/intel/vid_1/post`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ key: 'article', edits: { title: 'My headline' } }) });
    const art = (await r.json()).draft;
    assert.equal(art.status, 'POSTED');
    const article = docs.get(`articles/${art.postedId}`);
    assert.equal(article.title, 'My headline');
    assert.equal(article.status, 'PUBLISHED');
    assert.equal(article.notices.length, 0, 'an approved article carries no auto notice');
    assert.equal(article.disclosures.aiAssisted, true);

    const clipKey = Object.keys(job.drafts).find(k => k.startsWith('clip:'))!;
    r = await fetch(`${base}/intel/vid_1/post`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ key: clipKey }) });
    const clip = docs.get(`videos/${(await r.json()).draft.postedId}`);
    assert.ok(clip.isRello && /asset_start_time=63.5/.test(clip.url));

    r = await fetch(`${base}/intel/vid_1/post`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ key: 'product:glaze-kit' }) });
    assert.equal(r.status, 422, 'a listing with no price cannot go on sale');
    r = await fetch(`${base}/intel/vid_1/post`, { method: 'POST', headers: H('u1'), body: JSON.stringify({ key: 'product:glaze-kit', edits: { price: 24 } }) });
    const kit = docs.get(`storeProducts/${(await r.json()).draft.postedId}`);
    assert.equal(kit.price, 24);
    assert.equal(kit.sellerId, 'u1');
    assert.equal(docs.get('reelloIntel/vid_1').drafts['product:glaze-kit'].status, 'POSTED');
  });
});

test('router: auto mode posts with the notice, holds unsure listings, stocks an org store', async () => {
  const { store, docs } = memStore({
    'videos/vid_2': { ownerId: 'u1', title: 'Glazing mugs', muxPlaybackId: 'PID', duration: 180 },
    'users/u1': { displayName: 'Ana Clay' },
    'organizations/org1': { name: 'Clay Collective', creatorId: 'u9', admins: ['u1'], accountUid: 'orgacct' },
  });
  const router = createReelloIntelRouter({
    store, callerUid: async () => 'u1',
    watch: async () => ({ raw: RAW, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
    write: async () => ({ raw: { title: 'Headline' }, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
    resolvePlayback: async v => v.muxPlaybackId || null,
  });
  await withServer(router, async base => {
    const r = await fetch(`${base}/intel/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: JSON.stringify({ videoId: 'vid_2', options: { publishMode: 'AUTO', merchTarget: { kind: 'ORG', orgId: 'org1', orgName: 'Clay Collective' } } }) });
    assert.equal(r.status, 200);
    await until(async () => docs.get('reelloIntel/vid_2')?.status === 'READY');
    const d = docs.get('reelloIntel/vid_2').drafts;
    assert.equal(d.article.status, 'POSTED');
    assert.equal(d.article.auto, true);
    const article = docs.get(`articles/${d.article.postedId}`);
    assert.match(article.notices[0].text, /Ana Clay may change this soon/);
    assert.equal(d['product:speckled-mug'].status, 'POSTED');
    const mug = docs.get(`storeProducts/${d['product:speckled-mug'].postedId}`);
    assert.equal(mug.sellerId, 'orgacct');
    assert.equal(mug.sellerType, 'ORG');
    assert.equal(d['product:glaze-kit'].status, 'NEEDS_REVIEW');
  });
});

test('router: an upload still transcoding waits instead of failing', async () => {
  const { store, docs } = memStore({ 'videos/vid_3': { ownerId: 'u1', title: 'x', muxUploadId: 'up1' }, 'users/u1': {} });
  const router = createReelloIntelRouter({ store, callerUid: async () => 'u1', resolvePlayback: async () => null, watch: async () => { throw new Error('should not watch'); }, write: async () => ({ raw: {}, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }) });
  await withServer(router, async base => {
    await fetch(`${base}/intel/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: JSON.stringify({ videoId: 'vid_3' }) });
    await until(async () => docs.get('reelloIntel/vid_3')?.status === 'WAITING_MEDIA');
  });
});

test('router: nothing that sends people to a private video goes out', async () => {
  const { store, docs } = memStore({ 'videos/vid_4': { ownerId: 'u1', title: 'Secret', muxPlaybackId: 'PID', duration: 180, isPrivate: true }, 'users/u1': { displayName: 'Ana' } });
  const router = createReelloIntelRouter({
    store, callerUid: async () => 'u1', resolvePlayback: async v => v.muxPlaybackId,
    watch: async () => ({ raw: RAW, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
    write: async () => ({ raw: { title: 'H' }, usage: { inTokens: 0, outTokens: 0, costUsd: 0 } }),
  });
  await withServer(router, async base => {
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer x' };
    await fetch(`${base}/intel/analyze`, { method: 'POST', headers: H, body: JSON.stringify({ videoId: 'vid_4', options: { publishMode: 'AUTO' } }) });
    await until(async () => docs.get('reelloIntel/vid_4')?.status === 'READY');
    const d = docs.get('reelloIntel/vid_4').drafts;
    assert.equal(d.article.status, 'NEEDS_REVIEW');
    assert.match(d.article.heldReason, /private/);
    assert.equal(d[Object.keys(d).find(k => k.startsWith('clip:'))!].status, 'NEEDS_REVIEW');
    assert.equal(d['product:speckled-mug'].status, 'POSTED', 'a listing does not depend on the video being watchable');
    let r = await fetch(`${base}/intel/vid_4/post`, { method: 'POST', headers: H, body: JSON.stringify({ key: 'article' }) });
    assert.equal(r.status, 422);
    docs.set('videos/vid_4', { ...docs.get('videos/vid_4'), isPrivate: false });
    r = await fetch(`${base}/intel/vid_4/post`, { method: 'POST', headers: H, body: JSON.stringify({ key: 'article', edits: { title: 'Now public' } }) });
    const body = await r.json();
    assert.equal(body.draft.status, 'POSTED');
    assert.equal(body.article.title, 'Now public');
    assert.equal(docs.get('reelloIntel/vid_4').article.title, 'Now public');
  });
});
