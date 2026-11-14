import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { buildReport, normalizePeople, normalizeLore, normalizeDates } from '../services/reello/intel/core.ts';
import { findingsFromJob, matchEntry, mergeEntryFields, newEntryFields, stateOf, waitingCount, sourceRefFor } from '../services/storyIntel/findings.ts';
import { type ReelloIntelStore } from '../routes/reelloIntel.ts';
import { createStoryIntelRouter } from '../routes/storyIntelSources.ts';

// ── what the model reads → people, lore, dates ────────────────────────────────

test('people: only named people, merged across pieces, nobody identified from a face', () => {
  const p = normalizePeople([
    { name: 'Denise Walker', role: 'host', onScreen: true, moments: [42, 760], bestStillSec: 764 },
    { name: 'the man in the apron', role: 'guest', moments: [300] },
    { name: 'Speaker 2', role: 'guest', moments: [10] },
    { name: 'Marcus Hill', role: 'guest', named: false, moments: [310] },
    { name: 'denise walker', role: 'host', moments: [1500, 9999] },
    { name: 'Granddad Hill', role: 'mentioned', onScreen: true, moments: [318] },
  ], 1868);
  assert.deepEqual(p.map(x => x.name), ['Denise Walker', 'Granddad Hill']);
  assert.deepEqual(p[0].moments, [764, 42, 760, 1500], 'best still first, out-of-range dropped, pieces merged');
  assert.equal(p[1].onScreen, false, 'mentioned means never on screen');
});

test('lore and dates are cleaned and deduplicated', () => {
  const l = normalizeLore([{ title: 'Hill Street Smokehouse', kind: 'place', description: 'Opened 1974', tSec: 310 }, { title: 'hill street smokehouse', kind: 'thing' }, { title: 'Pecan smoke', kind: 'nonsense' }]);
  assert.deepEqual(l.map(x => [x.title, x.kind]), [['Hill Street Smokehouse', 'place'], ['Pecan smoke', 'idea']]);
  const d = normalizeDates([{ year: 1974, what: 'Hill Street opens', tSec: 318 }, { year: '1974', what: 'Hill Street opens' }, { year: 99999, what: 'nope' }, { year: 1951, what: 'Granddad starts smoking meat' }]);
  assert.deepEqual(d.map(x => x.year), [1951, 1974]);
});

const RAW = {
  summary: 'Aunt Dee cooks with Marcus Hill.', topics: ['barbecue'],
  chapters: [{ tSec: 0, title: 'Hello' }, { tSec: 310, title: 'Meet Marcus' }],
  quotes: [{ text: 'Low and slow or go home.', speaker: 'Marcus Hill', startSec: 1180, endSec: 1186 }],
  offers: [{ name: 'Hill Street Rub', priceText: '3 for $36', evidence: 'both', tSec: 1300, confidence: 0.9 }],
  people: [{ name: 'Marcus Hill', role: 'guest', onScreen: true, moments: [310, 840] }, { name: 'Denise Walker', role: 'host', onScreen: true, moments: [42] }],
  lore: [{ title: 'Hill Street Smokehouse', kind: 'place', description: 'Family smokehouse on the Eastside.', tSec: 310 }],
  dates: [{ year: 1974, what: 'Hill Street opens', tSec: 318 }],
};
const job = (over: any = {}) => ({
  videoId: 'v1', videoTitle: 'Kitchen Table, Ep. 4', ownerId: 'u1', createdAt: Date.UTC(2026, 10, 1), status: 'READY',
  report: buildReport(RAW, { durationSec: 1868, playbackId: 'PID' }), drafts: {}, ...over,
});

test('findings cover people, lore, timeline, the video, posted Shorts and products', () => {
  const j = job({ drafts: { [`clip:${'q1-1178'}`]: { status: 'POSTED', postedId: 'clip_v1_q1' } } });
  const f = findingsFromJob(j as any);
  const keys = f.map(x => x.key);
  assert.ok(keys.includes('person:p-marcus-hill'));
  assert.ok(keys.includes('lore:l-hill-street-smokehouse'));
  assert.ok(keys.includes('chapter:310'));
  assert.ok(keys.some(k => k.startsWith('date:d-1974')));
  assert.ok(keys.includes('asset:video'));
  assert.ok(keys.includes('asset:short-q1-1178'), 'a posted Short becomes an asset');
  const marcus = f.find(x => x.key === 'person:p-marcus-hill')!;
  assert.equal(marcus.kind, 'character');
  assert.ok(marcus.moments.some(m => /Low and slow/.test(m.text || '')), 'his quote is evidence');
  assert.deepEqual(marcus.moments.map(m => m.tSec), [...marcus.moments.map(m => m.tSec)].sort((x, y) => x - y), 'in time order');
  assert.ok(marcus.stillUrl?.includes('image.mux.com/PID'));
  assert.equal(f.find(x => x.kind === 'product')!.storeState, 'Draft listing');
  assert.equal(f.find(x => x.key === 'chapter:310')!.year, 2026, 'chapters land in the year the video was posted');
});

test('an older reading falls back to quote speakers and topics', () => {
  const old = job({ report: { ...buildReport({ ...RAW, people: undefined, lore: undefined, dates: undefined }, { durationSec: 1868 }), people: undefined, lore: undefined, dates: undefined } });
  const f = findingsFromJob(old as any);
  assert.deepEqual(f.filter(x => x.kind === 'character').map(x => x.title), ['Marcus Hill']);
  assert.deepEqual(f.filter(x => x.kind === 'lore').map(x => x.title), ['barbecue']);
});

test('matching: its own earlier filing first, then the same name from any tool', () => {
  const f = findingsFromJob(job() as any).find(x => x.key === 'person:p-marcus-hill')!;
  const entries = [
    { id: 'c_lorea', name: 'Marcus  HILL', sourceApp: 'LOREA_BOOK', sourceRefId: 'x' },
    { id: 'c_old', name: 'Marcus Hill', sourceApp: 'STORY_INTEL', sourceRefId: sourceRefFor('v1', f.key) },
  ];
  assert.deepEqual(matchEntry(f, 'v1', entries), { id: 'c_old', by: 'source', name: 'Marcus Hill' });
  assert.deepEqual(matchEntry(f, 'v1', entries.slice(0, 1)), { id: 'c_lorea', by: 'name', name: 'Marcus  HILL' });
  assert.equal(matchEntry(f, 'v1', [{ ...entries[0], discarded: true }]), null, 'a merged-away entry is never a target');
  assert.equal(matchEntry(f, 'v2', [{ id: 'c_re', name: 'Marcus "Smoke" Hill', storyIntelNames: ['Marcus Hill'] }])?.id, 'c_re', 'renamed in Worlds, still found by the name it was filed under');
  const ch = findingsFromJob(job() as any).find(x => x.key === 'chapter:310')!;
  assert.equal(matchEntry(ch, 'v1', [{ id: 't', title: 'Meet Marcus' }]), null, 'timeline events only match their own filing');
});

test('merging into an entry the creator wrote never overwrites their words', () => {
  const f = findingsFromJob(job() as any).find(x => x.key === 'person:p-marcus-hill')!;
  const cur = { name: 'Marcus', bio: 'Pitmaster. Written by me.', appearanceAt: [{ projectId: 'other', timestamp: 5 }, { projectId: 'v1', timestamp: 1 }] };
  const p = mergeEntryFields(f, 'v1', cur, 'name');
  assert.equal(p.name, undefined, 'its own text never replaces the name');
  assert.equal(p.bio, undefined, 'or the bio');
  assert.equal(mergeEntryFields(f, 'v1', { ...cur, bio: '' }, 'name').bio, f.summary, 'but fills a blank');
  assert.equal(mergeEntryFields(f, 'v1', cur, 'name', { summary: 'Typed by the creator' }).bio, 'Typed by the creator', 'edits typed in the workspace apply');
  const app = p.appearanceAt as any[];
  assert.equal(app[0].projectId, 'other', 'keeps other videos');
  assert.ok(!app.some(a => a.projectId === 'v1' && a.timestamp === 1), "replaces this video's old moments");
  assert.equal(app.filter(a => a.projectId === 'v1').length, f.moments.length);
  const own = mergeEntryFields(f, 'v1', cur, 'source', { title: 'Marcus "Smoke" Hill' });
  assert.equal(own.name, 'Marcus "Smoke" Hill');
  const n = newEntryFields(f, 'v1');
  assert.equal(n.isPublished, false, 'new entries stay private until published in Worlds');
  assert.equal(n.sourceApp, 'STORY_INTEL');
});

// ── the router: filing into a World ──────────────────────────────────────────

function memStore(seed: Record<string, any>) {
  const docs = new Map<string, any>(Object.entries(seed));
  const store: ReelloIntelStore = {
    async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
    async set(p, d) { docs.set(p, structuredClone(d)); return true; },
    async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
    async create() { return null; },
    async query() { return []; },
    async list(c, max) {
      const depth = c.split('/').length + 1;
      return [...docs.entries()].filter(([k]) => k.startsWith(`${c}/`) && k.split('/').length === depth).slice(0, max).map(([k, v]) => ({ id: k.split('/').pop()!, data: v }));
    },
  };
  return { store, docs };
}
async function withServer(router: express.Router, fn: (base: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use('/api/story-intel', router);
  const srv = app.listen(0);
  try { await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/story-intel`); } finally { srv.close(); }
}

test('router: file into a World, refile without copies, join an existing character, skip, guard', async () => {
  const { store, docs } = memStore({
    'reelloIntel/v1': job(),
    'videos/v1': { ownerId: 'u1', title: 'Kitchen Table, Ep. 4' },
    'worlds/w1': { creatorId: 'u1', name: 'The Kitchen Table', assetIds: [] },
    'worlds/w1/characters/c_dee': { id: 'c_dee', worldId: 'w1', name: 'Denise Walker', bio: 'Aunt Dee, our host.' },
    'worlds/w2': { creatorId: 'u2', name: 'Not yours' },
  });
  const router = createStoryIntelRouter({ store: { ...store, storageJson: async () => null }, callerUid: async req => (req.headers.authorization === 'Bearer u2' ? 'u2' : 'u1') });
  await withServer(router, async base => {
    const H = (who = 'u1') => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${who}` });
    const file = (body: any, who?: string) => fetch(`${base}/video/v1/file`, { method: 'POST', headers: H(who), body: JSON.stringify(body) });

    assert.equal((await file({ worldId: 'w2', items: [{ key: 'person:p-marcus-hill' }] })).status, 404, 'not your World');
    assert.equal((await file({ worldId: 'w1', items: [{ key: 'person:p-marcus-hill' }] }, 'u2')).status, 404, 'not your reading');
    assert.equal((await file({ worldId: 'w1', items: [{ key: 'bogus' }] })).status, 400);

    let m = await (await fetch(`${base}/video/v1/world?worldId=w1`, { headers: H() })).json();
    assert.equal(m.matches['person:p-denise-walker'].by, 'name', 'Denise is already in the World');

    let r = await (await file({ worldId: 'w1', items: [
      { key: 'person:p-marcus-hill' }, { key: 'person:p-denise-walker' }, { key: 'lore:l-hill-street-smokehouse' },
      { key: 'chapter:310', edits: { year: 2025 } }, { key: 'asset:video' }, { key: 'product:' + job().report.offers[0].id },
    ] })).json();
    assert.equal(r.results.filter((x: any) => x.ok).length, 5);
    assert.match(r.results[5].error, /store/);
    const chars = [...docs.keys()].filter(k => k.startsWith('worlds/w1/characters/'));
    assert.equal(chars.length, 2, 'Marcus is new; Denise was joined, not copied');
    assert.equal(docs.get('worlds/w1/characters/c_dee').bio, 'Aunt Dee, our host.', 'the creator\'s bio is untouched');
    assert.equal(docs.get('worlds/w1/characters/c_dee').appearanceAt[0].projectId, 'v1');
    const marcusId = r.results[0].entryId;
    assert.equal(docs.get(`worlds/w1/characters/${marcusId}`).isPublished, false);
    const ev = [...docs.entries()].find(([k]) => k.startsWith('worlds/w1/timeline/'))![1];
    assert.equal(ev.year, 2025);
    assert.deepEqual(docs.get('worlds/w1').assetIds, ['v1']);
    assert.equal(docs.get('videos/v1').worldId, 'w1');
    assert.equal(docs.get('reelloIntel/v1').worldFiling['person:p-denise-walker'].merged, true);

    // Filing Marcus again (an edit from the Desk) updates the same entry.
    r = await (await file({ worldId: 'w1', items: [{ key: 'person:p-marcus-hill', edits: { title: 'Marcus "Smoke" Hill' } }] })).json();
    assert.equal(r.results[0].entryId, marcusId);
    assert.equal([...docs.keys()].filter(k => k.startsWith('worlds/w1/characters/')).length, 2);
    assert.equal(docs.get(`worlds/w1/characters/${marcusId}`).name, 'Marcus "Smoke" Hill');
    await file({ worldId: 'w1', items: [{ key: 'asset:video' }] });
    assert.deepEqual(docs.get('worlds/w1').assetIds, ['v1'], 'assets are a set');

    // Skip and bring back; a filed finding can't be skipped.
    let s = await (await fetch(`${base}/video/v1/skip`, { method: 'POST', headers: H(), body: JSON.stringify({ keys: ['date:' + docs.get('reelloIntel/v1').report.dates[0].id, 'person:p-marcus-hill'] }) })).json();
    assert.equal(s.worldFiling['person:p-marcus-hill'].status, 'FILED');
    const dk = 'date:' + docs.get('reelloIntel/v1').report.dates[0].id;
    assert.equal(s.worldFiling[dk].status, 'SKIPPED');
    s = await (await fetch(`${base}/video/v1/skip`, { method: 'POST', headers: H(), body: JSON.stringify({ keys: [dk], undo: true }) })).json();
    assert.equal(s.worldFiling[dk], undefined);

    m = await (await fetch(`${base}/video/v1/world?worldId=w1`, { headers: H() })).json();
    assert.equal(m.matches['person:p-marcus-hill'].by, 'source');
    const left = waitingCount(docs.get('reelloIntel/v1'));
    const all = findingsFromJob(docs.get('reelloIntel/v1')).filter(f => f.kind !== 'product').length;
    assert.equal(left, all - 5);
    assert.equal(stateOf(findingsFromJob(docs.get('reelloIntel/v1')).find(f => f.kind === 'product')!, {}), 'STORE');
  });
});
