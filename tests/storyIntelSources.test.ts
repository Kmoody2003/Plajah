import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { filmFindings, albumFindings, filmStillUrl } from '../services/storyIntel/sources.ts';
import { createStoryIntelRouter, type StoryIntelStore } from '../routes/storyIntelSources.ts';

const REPORT = {
  themes: ['Survival', 'Trust'],
  structure: { acts: [{ number: 1, title: 'The cemetery', startSec: 0, endSec: 900, summary: 'Barbra flees.' }, { number: 2, title: 'The farmhouse', startSec: 900, endSec: 4000 }] },
  characters: [
    { refId: 'ch1', name: 'Barbra', tier: 'MAIN', description: 'Flees the cemetery.', confidence: 0.9, appearances: [{ sceneId: 's1', tSec: 30 }, { sceneId: 's2', tSec: 1000 }], stillIds: ['st1'] },
    { refId: 'ch2', name: 'Ben', tier: 'MAIN', description: 'Takes charge of the house.', confidence: 0.95, appearances: [{ sceneId: 's2', tSec: 1010 }] },
    { refId: 'ch3', name: 'Ghoul #3', tier: 'MINOR', confidence: 0.4, appearances: [{ sceneId: 's1', tSec: 40 }] },
  ],
  scenes: [
    { id: 's1', title: 'Cemetery', startSec: 20, characterRefIds: ['ch1', 'ch3'] },
    { id: 's2', title: 'Farmhouse arrival', startSec: 990, characterRefIds: ['ch1', 'ch2'] },
    { id: 's3', title: 'Boarding up', startSec: 1500, characterRefIds: ['ch1', 'ch2'] },
  ],
  locations: [{ refId: 'loc1', name: 'The farmhouse', description: 'Isolated house.', sceneIds: ['s2', 's3'], confidence: 0.9 }],
  macguffins: [{ refId: 'mg1', name: 'The radio', narrativeRole: 'KEY_PROP', sceneIds: ['s3'] }],
  stills: [{ id: 'st1', tSec: 30, path: 'stills/0001.jpg' }],
};

test('film report → characters, places, objects, themes, acts, who shares scenes, the film', () => {
  const f = filmFindings(REPORT, { albumId: 'film1', ownerId: 'u1', title: 'Night', year: 1968, bucket: 'b' });
  const by = (k: string) => f.find(x => x.key === k);
  assert.equal(by('person:c-ch1')!.title, 'Barbra');
  assert.equal(by('person:c-ch1')!.confidence, 'high');
  assert.equal(by('person:c-ch3')!.confidence, 'medium', 'minor characters wait');
  assert.match(by('person:c-ch1')!.stillUrl!, /firebasestorage.*taleoAnalysis%2Fu1%2Ffilm1%2Fstills%2F0001\.jpg/);
  assert.equal(by('lore:loc-loc1')!.loreType, 'LOCATION');
  assert.deepEqual(by('lore:loc-loc1')!.moments.map(m => m.tSec), [990, 1500]);
  assert.equal(by('lore:mg-mg1')!.loreType, 'ITEM');
  assert.ok(by('lore:t-survival'));
  assert.equal(by('chapter:900')!.title, 'Act 2: The farmhouse');
  assert.equal(by('chapter:900')!.year, 1968);
  const rel = f.filter(x => x.kind === 'relation');
  assert.deepEqual(rel.map(r => r.title), ['Barbra and Ben'], 'two shared scenes; the ghoul is minor');
  assert.deepEqual(rel[0].ends, ['person:c-ch1', 'person:c-ch2']);
  assert.equal(by('asset:film')!.assetCollection, 'albums');
  assert.equal(filmStillUrl('b', 'u1', 'film1', 'portraits/x.jpg'), undefined, 'only public stills are linked');
});

test('album → artist, threads, release, soundtrack link, the album', () => {
  const f = albumFindings(
    { title: 'Porchlight', artist: 'The Hills', coverImage: 'https://c/x.jpg', releaseDate: '2025-06-01' },
    { album: { overview: 'Songs about home.', throughlines: ['Leaving home and coming back'] }, film: { status: 'LINKED', filmTitle: 'Night', connection: 'Scores the farmhouse.' } },
    { albumId: 'al1' });
  const keys = f.map(x => x.key);
  assert.deepEqual(keys, ['person:a-the-hills', 'lore:th-leaving-home-and-coming-back', 'date:release', 'lore:soundtrack', 'asset:album']);
  assert.equal(f.find(x => x.key === 'date:release')!.year, 2025);
  assert.equal(f.find(x => x.key === 'person:a-the-hills')!.confidence, 'medium', 'the artist is a choice, not assumed');
});

function memStore(seed: Record<string, any>, files: Record<string, any> = {}) {
  const docs = new Map<string, any>(Object.entries(seed));
  const store: StoryIntelStore = {
    async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
    async set(p, d) { docs.set(p, structuredClone(d)); return true; },
    async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
    async query(c, f) { return [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split('/').length === 2 && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v })); },
    async list(c, max) {
      const depth = c.split('/').length + 1;
      return [...docs.entries()].filter(([k]) => k.startsWith(`${c}/`) && k.split('/').length === depth).slice(0, max).map(([k, v]) => ({ id: k.split('/').pop()!, data: v }));
    },
    async storageJson(p) { return files[p] ? structuredClone(files[p]) : null; },
  };
  return { store, docs };
}

test('router: films and albums list beside videos, file into a World, and run the rules once', async () => {
  const { store, docs } = memStore({
    'taleoAnalysis/film1': { ownerId: 'u1', status: 'READY', reportPath: 'taleoAnalysis/u1/film1/report.json', updatedAt: 10 },
    'albums/film1': { ownerId: 'u1', title: 'Night', releaseYear: 1968, tracks: [{ muxPlaybackId: 'FILMPID', duration: 5760 }] },
    'musicIntel/al1': { ownerId: 'u1', status: 'READY', album: { throughlines: ['Home'] }, updatedAt: 20 },
    'albums/al1': { ownerId: 'u1', title: 'Porchlight', artist: 'The Hills' },
    'taleoAnalysis/other': { ownerId: 'u2', status: 'READY', updatedAt: 5 },
    'worlds/w1': { creatorId: 'u1', name: 'Night World', assetIds: [] },
    'worlds/w1/characters/c_ben': { id: 'c_ben', name: 'Ben', bio: 'Mine.' },
    'storyIntelRules/u1': { enabled: true, worldId: 'w1', modes: { character: 'known', lore: 'ask', timeline: 'ask', asset: 'ask', relation: 'ask' } },
  }, { 'taleoAnalysis/u1/film1/report.json': REPORT });
  const app = express(); app.use(express.json()); app.use('/api/story-intel', createStoryIntelRouter({ store, callerUid: async () => 'u1', now: () => 100 }));
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/story-intel`;
  const post = (p: string, b: any) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  try {
    const { sources } = await fetch(`${base}/sources`).then(r => r.json());
    assert.deepEqual(sources.map((s: any) => `${s.kind}:${s.id}`).sort(), ['album:al1', 'film:film1'], 'only the account\'s own');
    const film = sources.find((s: any) => s.kind === 'film');
    assert.equal(film.playbackId, 'FILMPID');
    assert.equal(film.title, 'Night');
    // The "known" rule joined Ben (already in the World) on first listing, and only once.
    assert.equal(docs.get('taleoAnalysis/film1').worldFiling['person:c-ch2'].auto, true);
    assert.equal(docs.get('taleoAnalysis/film1').rulesCheckedAt, 100);
    assert.equal(docs.get('worlds/w1/characters/c_ben').bio, 'Mine.');

    // Accepting "Barbra and Ben" adds Barbra and one graph link.
    const relKey = film.findings.find((f: any) => f.kind === 'relation').key;
    const r = await post(`/film/film1/file`, { worldId: 'w1', items: [{ key: relKey }, { key: 'asset:film' }] });
    assert.ok(r.results.every((x: any) => x.ok));
    assert.equal(docs.get('worlds/w1').graphConnections.length, 1);
    assert.deepEqual(docs.get('worlds/w1').assetIds, ['film1']);
    assert.equal(docs.get('albums/film1').worldId, 'w1', 'the film shows with the World\'s content');

    const a = await post(`/album/al1/file`, { worldId: 'w1', items: [{ key: 'date:release' }] });
    assert.equal(a.results[0].ok, true);
    assert.equal(docs.get('musicIntel/al1').worldFiling['date:release'].status, 'FILED');

    assert.equal((await fetch(`${base}/film/other/world?worldId=w1`)).status, 404, 'someone else\'s film');
    assert.equal((await fetch(`${base}/book/x/world?worldId=w1`)).status, 404);
  } finally { srv.close(); }
});
