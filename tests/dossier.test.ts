import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDossier, type Dossier, type CharacterBible, type DossierAsset } from '../services/dossier/dossierTypes';
import { buildImageRequest, generateScene, pickVariant, type ImageProvider } from '../services/dossier/characterGateway';

const ref: DossierAsset = {
  id: 'ref1', kind: 'photo', title: 'Portrait', url: 'https://example.org/p.jpg',
  rights: { status: 'public-domain', credit: 'Library of Congress' }, claimIds: ['c1'],
};
const bible: CharacterBible = {
  id: 'fd', name: 'Frederick Douglass', coreDescriptor: 'Black man with a strong brow and expressive eyes', seed: 1234,
  forbidden: ['smiling broadly'],
  variants: [
    { id: 'young', ageRange: [24, 35], descriptor: 'clean-shaven, dark hair', referenceAssetIds: ['ref1'] },
    { id: 'elder', ageRange: [55, 80], descriptor: 'full white mane and beard', referenceAssetIds: ['ref1'] },
  ],
  wardrobe: { 1860: 'dark frock coat and cravat' },
};

test('same character + same age -> identical locked descriptor, seed and refs', () => {
  const scene = { action: 'speaks to a crowd', setting: 'a hall', cast: [{ characterId: 'fd', age: 40 }], style: 'archival engraving' };
  const a = buildImageRequest(scene, [bible], [ref]);
  const b = buildImageRequest({ ...scene, action: 'reads a letter', setting: 'a study' }, [bible], [ref]);
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.referenceUrls, b.referenceUrls);
  assert.ok(a.prompt.includes(bible.coreDescriptor) && b.prompt.includes(bible.coreDescriptor));
});

test('age picks the nearest variant, never an unrelated one', () => {
  assert.equal(pickVariant(bible, 25).id, 'young');
  assert.equal(pickVariant(bible, 70).id, 'elder');
  assert.equal(pickVariant(bible, 45).id, 'young'); // 10 away from 35 vs 10 from 55 -> first stable
});

test('unknown character throws instead of free-texting a person', () => {
  assert.throws(() => buildImageRequest({ action: 'x', setting: 'y', style: 'z', cast: [{ characterId: 'nope', age: 1 }] }, [bible], [ref]));
});

test('generated scene is labelled as a reconstruction', async () => {
  const provider: ImageProvider = { name: 'fake', generate: async () => ({ url: 'https://x/y.png' }) };
  const asset = await generateScene(provider, { action: 'a', setting: 's', style: 'st', cast: [{ characterId: 'fd', age: 30 }] }, [bible], [ref],
    { id: 'g1', title: 'Scene', basis: 'Narrative of the Life, ch. 10', claimIds: ['c1'] });
  assert.equal(asset.kind, 'recreation');
  assert.equal(asset.rights.status, 'generated');
  assert.deepEqual(asset.reconstruction?.characterIds, ['fd']);
});

test('validator blocks unsourced claims, unknown rights and missing depths', () => {
  const d: Dossier = {
    id: 'd', subject: 's', kind: 'biography',
    ledger: { subjectId: 's', sources: [], claims: [{ id: 'c1', text: 't', confidence: 'contested', sourceIds: [] }] },
    assets: [{ ...ref, id: 'bad', rights: { status: 'unknown', credit: '' } }],
    characters: [{ ...bible, variants: [{ id: 'v', ageRange: [1, 2], descriptor: 'd', referenceAssetIds: [] }] }],
    rooms: [{ id: 'r', title: 'R', nodes: [{ id: 'n', title: 'N', kind: 'story', claimIds: ['zz'], assetIds: [], text: { early: 'x', elementary: '', middle: 'x', high: 'x', university: 'x' } }] }],
  };
  const msgs = validateDossier(d).map(i => i.message).join('|');
  for (const needle of ['no source', 'needs a note', 'not publishable', 'missing credit', 'missing elementary', 'unknown claim', 'no real reference'])
    assert.ok(msgs.includes(needle), needle);
});

import { douglassDossier } from '../data/dossier/douglass';

test('Douglass dossier passes every publishing rule', () => {
  const errors = validateDossier(douglassDossier).filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
});

test('Douglass: every claim cited by a node exists and contested claims carry notes', () => {
  const ids = new Set(douglassDossier.ledger.claims.map(c => c.id));
  for (const r of douglassDossier.rooms) for (const n of r.nodes) for (const c of n.claimIds) assert.ok(ids.has(c), c);
  for (const c of douglassDossier.ledger.claims.filter(c => c.confidence === 'contested')) assert.ok(c.note);
});

test('Douglass: likeness variants cover documented ages 24-80 without gaps', () => {
  const b = douglassDossier.characters[0];
  const sorted = [...b.variants].sort((x, y) => x.ageRange[0] - y.ageRange[0]);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i].ageRange[0], sorted[i - 1].ageRange[1] + 1);
  assert.equal(sorted[0].ageRange[0], 24);
  assert.equal(sorted.at(-1)!.ageRange[1], 80);
});

test('ages below the earliest photograph never produce a visible face', () => {
  const req = buildImageRequest({ action: 'hauls rope at a shipyard', setting: 'Baltimore docks 1832', style: 'archival engraving', cast: [{ characterId: 'fd', age: 14 }] }, [bible], [ref]);
  assert.ok(req.prompt.includes('face not visible'));
  assert.deepEqual(req.referenceUrls, []);
  assert.ok(req.negativePrompt.includes('visible face'));
});

import { magnificProvider } from '../services/dossier/magnificProvider';

test('Magnific provider: Klein sends refs as base64 input_image fields, polls, returns URL', async () => {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  let polls = 0;
  const fake = (async (url: any, init: any = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    if (u.startsWith('https://ref.test/')) return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as any;
    if (init.method === 'POST') return { ok: true, status: 200, json: async () => ({ data: { task_id: 't-1', status: 'CREATED' } }) } as any;
    polls++;
    return { ok: true, status: 200, json: async () => ({ data: { task_id: 't-1', status: polls < 2 ? 'IN_PROGRESS' : 'COMPLETED', generated: ['https://out.test/a.png'] } }) } as any;
  }) as unknown as typeof fetch;
  const tasks: any[] = [];
  const p = magnificProvider({ apiKey: 'k', fetchImpl: fake, pollMs: 1, onTask: t => tasks.push(t) });
  const out = await p.generate({ prompt: 'p', negativePrompt: 'n', seed: 7, aspect: '16:9', providerCharacterIds: [],
    referenceUrls: ['https://ref.test/a.jpg', 'https://ref.test/b.jpg'] });
  assert.equal(out.url, 'https://out.test/a.png');
  const post = calls.find(c => c.method === 'POST')!;
  assert.ok(post.url.endsWith('/text-to-image/flux-2-klein'));
  assert.equal(post.body.aspect_ratio, 'widescreen_16_9');
  assert.equal(post.body.seed, 7);
  assert.equal(post.body.input_image, 'AQID');
  assert.equal(post.body.input_image_2, 'AQID');
  assert.equal(post.body.input_image_3, undefined);
  assert.deepEqual(tasks.map(t => [t.taskId, t.refs]), [['t-1', 2]]);
});

import { placeMilestones, W as TL_W, CARD_W } from '../services/dossier/timelineDoc';
import { douglassMilestones } from '../data/dossier/douglassTimeline';

test('timeline cards never overlap within a tier and stay inside the frame', () => {
  const placed = placeMilestones(douglassMilestones, 120, TL_W - 120, 1810, 1900);
  const byTier = new Map<number, typeof placed>();
  for (const p of placed) byTier.set(p.tier, [...(byTier.get(p.tier) ?? []), p]);
  for (const cards of byTier.values()) {
    const s = [...cards].sort((a, b) => a.left - b.left);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].left >= s[i - 1].left + CARD_W, `overlap ${s[i - 1].year}/${s[i].year}`);
  }
  for (const p of placed) { assert.ok(p.left >= 40 && p.left + CARD_W <= TL_W - 40); assert.ok(p.tier >= 0 && p.tier < 6); }
});

test('every timeline milestone cites a real ledger claim', () => {
  const ids = new Set(douglassDossier.ledger.claims.map(c => c.id));
  for (const m of douglassMilestones) for (const c of [m.claimId, ...(m.extraClaimIds ?? [])]) assert.ok(ids.has(c), c);
});

import fabulaProd from '../data/dossier/douglassFabula.json';
import douglassFilm from '../data/dossier/douglassFilm.json';

test('Fabula production: every clip resolves, tracks exist, no overlaps within a track', () => {
  const prod: any = fabulaProd;
  const media = new Set(prod.mediaPool.map((m: any) => m.id));
  const tracks = new Set(prod.tracks.map((t: any) => t.id));
  const clips = prod.edits[0].timeline.clips;
  for (const c of clips) {
    assert.ok(tracks.has(c.trackId), `track ${c.trackId}`);
    if (c.kind === 'media') assert.ok(media.has(c.assetId), `asset ${c.assetId}`);
    if (c.kind === 'subtitle') assert.ok(c.text && c.text.length > 5);
    assert.ok(c.duration > 0 && c.start >= 0);
  }
  for (const tr of ['s1', 'v1', 'a1']) {
    const on = clips.filter((c: any) => c.trackId === tr).sort((a: any, b: any) => a.start - b.start);
    for (let i = 1; i < on.length; i++) assert.ok(on[i].start >= on[i - 1].start + on[i - 1].duration - 0.02, `overlap on ${tr}: ${on[i - 1].id}/${on[i].id}`);
  }
  // subtitle text equals the film script, word for word
  const subs = clips.filter((c: any) => c.kind === 'subtitle').map((c: any) => c.text);
  assert.deepEqual(subs, (douglassFilm as any).beats.map((b: any) => b.text));
});

import { persiaDossier } from '../data/dossier/persia';

test('distressing Persia photographs are hidden at the youngest reading levels', () => {
  const byId = new Map(persiaDossier.assets.map(a => [a.id, a]));
  for (const id of ['a-refugees-1915', 'a-genocide-memorial-tehran', 'a-urmia-gate-1904']) {
    const a = byId.get(id)!;
    assert.ok(a.minDepth && a.minDepth !== 'early' && a.minDepth !== 'elementary', `${id} must be gated above elementary`);
  }
  assert.match(byId.get('a-urmia-gate-1904')!.title, /bodies/, 'caption must say what the photograph shows');
});

import { sceneYear } from '../services/dossier/characterGateway';

test('anachronism guard is era-aware: no electric light in 1847, electric light allowed in 1913', () => {
  const mk = (setting: string) => ({ action: 'a', setting, style: 's', cast: [] });
  const old = buildImageRequest(mk('a Rochester printing office in 1847'), [bible], [ref]);
  const mod = buildImageRequest(mk('the Highland Park factory floor in 1913'), [bible], [ref]);
  assert.ok(old.negativePrompt.includes('electric lamp') && old.prompt.includes('oil lamps and candles'));
  assert.ok(!mod.negativePrompt.includes('electric lamp') && !mod.prompt.includes('oil lamps and candles'));
  assert.ok(mod.prompt.includes('existed in 1913'));
  assert.equal(sceneYear(mk('Ctesiphon in the fifth century')), null);
  assert.equal(sceneYear(mk('a caravan in 1289')), 1289);
});
