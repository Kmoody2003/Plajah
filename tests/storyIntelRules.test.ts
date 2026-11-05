import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { buildReport, normalizeRelations } from '../services/reello/intel/core.ts';
import { autoFileKeys, findingsFromJob, sanitizeRules, DEFAULT_RULES } from '../services/storyIntel/findings.ts';
import { autoFileJob, type ReelloIntelStore } from '../routes/reelloIntel.ts';
import { createStoryIntelRouter } from '../routes/storyIntelSources.ts';

const RAW = {
  summary: 'x', topics: [],
  chapters: [{ tSec: 0, title: 'Hello' }, { tSec: 300, title: 'Meet Marcus' }],
  quotes: [], offers: [],
  people: [
    { name: 'Marcus Hill', role: 'guest', onScreen: true, moments: [310, 320] },
    { name: 'Denise Walker', role: 'host', onScreen: true, moments: [20, 330] },
    { name: 'Granddad Hill', role: 'mentioned', onScreen: false, moments: [318] },
  ],
  lore: [{ title: 'Hill Street Smokehouse', kind: 'place', description: 'Family smokehouse.', tSec: 310 }],
  relations: [
    { a: 'Marcus Hill', b: 'Granddad Hill', type: 'family', evidence: 'my granddad', tSec: 318 },
    { a: 'Granddad Hill', b: 'Hill Street Smokehouse', type: 'FOUNDED', tSec: 318 },
    { a: 'Marcus Hill', b: 'Someone Unlisted', type: 'FRIEND' },
    { a: 'marcus hill', b: 'GRANDDAD HILL', type: 'FAMILY' },
  ],
};
const job = (over: any = {}) => ({
  videoId: 'v1', videoTitle: 'Ep. 4', ownerId: 'u1', createdAt: Date.UTC(2026, 10, 1), status: 'READY',
  report: buildReport(RAW, { durationSec: 1800 }), drafts: {}, ...over,
});

test('relations: only between listed names, typed, deduplicated', () => {
  const r = normalizeRelations(RAW.relations, ['Marcus Hill', 'Granddad Hill', 'Hill Street Smokehouse']);
  assert.deepEqual(r.map(x => [x.a, x.b, x.type]), [['Marcus Hill', 'Granddad Hill', 'FAMILY'], ['Granddad Hill', 'Hill Street Smokehouse', 'FOUNDED']]);
});

test('relationship findings point at both sides; co-appearance is the fallback', () => {
  const f = findingsFromJob(job() as any).filter(x => x.kind === 'relation');
  assert.equal(f.length, 2);
  assert.deepEqual(f[0].ends, ['person:p-marcus-hill', 'person:p-granddad-hill']);
  assert.deepEqual(f[1].ends, ['person:p-granddad-hill', 'lore:l-hill-street-smokehouse']);
  const noRel = job({ report: buildReport({ ...RAW, relations: [] }, { durationSec: 1800 }) });
  const co = findingsFromJob(noRel as any).filter(x => x.kind === 'relation');
  assert.deepEqual(co.map(x => x.title), ['Marcus Hill and Denise Walker'], 'they share "Meet Marcus"; Granddad is never on screen');
  assert.equal(co[0].confidence, 'medium');
});

test('rules pick what to add on their own', () => {
  const fs = findingsFromJob(job() as any);
  const r = sanitizeRules({ enabled: true, worldId: 'w1', modes: { character: 'all', lore: 'ask', timeline: 'ask', asset: 'known', relation: 'known' } });
  const known = new Set(['person:p-denise-walker']);
  const keys = autoFileKeys(fs, {}, known, r);
  assert.ok(keys.includes('person:p-marcus-hill'), 'high confidence person');
  assert.ok(keys.includes('person:p-denise-walker'));
  assert.ok(!keys.includes('person:p-granddad-hill'), 'medium confidence waits');
  assert.ok(!keys.some(k => k.startsWith('lore:')), 'lore asks');
  assert.ok(!keys.includes('asset:video'), 'asset only when known');
  assert.deepEqual(autoFileKeys(fs, {}, known, { ...r, enabled: false }), []);
  assert.equal(sanitizeRules({ enabled: true }).enabled, false, 'no World, no rules');
  assert.equal(sanitizeRules({ modes: { lore: 'bogus' } }).modes.lore, DEFAULT_RULES.modes.lore);
});

function memStore(seed: Record<string, any>) {
  const docs = new Map<string, any>(Object.entries(seed));
  const store: ReelloIntelStore = {
    async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
    async set(p, d) { docs.set(p, structuredClone(d)); return true; },
    async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
    async create() { return null; },
    async query(c, f) { return [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split('/').length === 2 && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v })); },
    async list(c, max) {
      const depth = c.split('/').length + 1;
      return [...docs.entries()].filter(([k]) => k.startsWith(`${c}/`) && k.split('/').length === depth).slice(0, max).map(([k, v]) => ({ id: k.split('/').pop()!, data: v }));
    },
  };
  return { store, docs };
}

test('accepting a relationship adds both sides and one graph link, never two', async () => {
  const { store, docs } = memStore({
    'reelloIntel/v1': job(),
    'worlds/w1': { creatorId: 'u1', name: 'Kitchen', assetIds: [], graphConnections: [] },
  });
  const router = createStoryIntelRouter({ store: { ...store, storageJson: async () => null }, callerUid: async () => 'u1' });
  const app = express(); app.use(express.json()); app.use('/api/story-intel', router);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/story-intel`;
  try {
    const relKey = findingsFromJob(job() as any).find(f => f.kind === 'relation')!.key;
    const file = () => fetch(`${base}/video/v1/file`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worldId: 'w1', items: [{ key: relKey }] }) }).then(r => r.json());
    const r1 = await file();
    assert.equal(r1.results[0].ok, true);
    assert.equal([...docs.keys()].filter(k => k.startsWith('worlds/w1/characters/')).length, 2, 'Marcus and Granddad added');
    assert.equal(docs.get('worlds/w1').graphConnections.length, 1);
    assert.equal(docs.get('worlds/w1').graphConnections[0].relationshipType, 'FAMILY');
    await file();
    assert.equal(docs.get('worlds/w1').graphConnections.length, 1, 'no duplicate link');

    // GET /intel/rules is not mistaken for a video id.
    const rules = await fetch(`${base}/rules`).then(r => r.json());
    assert.equal(rules.rules.enabled, false);
    const put = await fetch(`${base}/rules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, worldId: 'w9', modes: {} }) });
    assert.equal(put.status, 404, 'rules can only target your own World');
  } finally { srv.close(); }
});

test('auto-file runs the rules when a reading finishes', async () => {
  const { store, docs } = memStore({
    'reelloIntel/v1': job(),
    'worlds/w1': { creatorId: 'u1', name: 'Kitchen', assetIds: [] },
    'worlds/w1/characters/c_dee': { id: 'c_dee', name: 'Denise Walker', bio: 'Mine.' },
    'storyIntelRules/u1': { enabled: true, worldId: 'w1', modes: { character: 'known', lore: 'ask', timeline: 'ask', asset: 'all', relation: 'known' } },
  });
  const n = await autoFileJob(store, docs.get('reelloIntel/v1'), () => 1);
  const filing = docs.get('reelloIntel/v1').worldFiling;
  assert.equal(filing['person:p-denise-walker'].auto, true, 'Denise was already in the World');
  assert.equal(filing['person:p-marcus-hill'], undefined, 'Marcus is new, so he waits');
  assert.equal(filing['asset:video'].status, 'FILED');
  assert.equal(n, 2);
  assert.equal(docs.get('worlds/w1/characters/c_dee').bio, 'Mine.');
  // Someone else's World is never a target.
  docs.set('storyIntelRules/u1', { ...docs.get('storyIntelRules/u1'), worldId: 'w2' });
  docs.set('worlds/w2', { creatorId: 'u2' });
  assert.equal(await autoFileJob(store, { ...job(), worldFiling: {} } as any, () => 1), 0);
});
