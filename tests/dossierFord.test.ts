import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDossier, DEPTH_LEVELS } from '../services/dossier/dossierTypes';
import { buildImageRequest } from '../services/dossier/characterGateway';
import { placeMilestones, W as TL_W, CARD_W } from '../services/dossier/timelineDoc';
import { fordDossier, fordWings } from '../data/dossier/ford';
import { fordScenes } from '../data/dossier/fordScenes';
import { fordMilestones, fordPortraits } from '../data/dossier/fordTimeline';

test('Ford dossier passes every publishing rule', () => {
  const errors = validateDossier(fordDossier).filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
  const warns = validateDossier(fordDossier).filter(i => i.severity === 'warn');
  assert.deepEqual(warns, []);
});

test('Ford: size and structure targets are met', () => {
  assert.ok(fordDossier.ledger.claims.length >= 100, 'at least 100 claims');
  assert.ok(fordDossier.rooms.length === 8, 'eight rooms: five Motor City, War Effort, Beliefs and Morals, Legacy');
  for (const r of fordDossier.rooms) assert.ok(r.nodes.length >= 1, r.id);
  for (const r of fordDossier.rooms) for (const n of r.nodes) {
    assert.ok(n.claimIds.length >= 2, `${n.id} cites at least two claims`);
    assert.ok(new Set(n.claimIds).size === n.claimIds.length, `${n.id} has duplicate claim ids`);
  }
  assert.ok(fordDossier.rooms.some(r => r.nodes.some(n => n.kind === 'source-reading')), 'has a primary-source reading node');
});

test('Ford: every claim cited by a node exists and contested/tradition claims carry notes', () => {
  const ids = new Set(fordDossier.ledger.claims.map(c => c.id));
  for (const r of fordDossier.rooms) for (const n of r.nodes) for (const c of n.claimIds) assert.ok(ids.has(c), c);
  const flagged = fordDossier.ledger.claims.filter(c => c.confidence === 'contested' || c.confidence === 'tradition');
  assert.ok(flagged.length >= 6, 'honest record flags real disagreements');
  for (const c of flagged) assert.ok(c.note && c.note.length > 40, c.id);
  for (const c of fordDossier.ledger.claims) assert.ok(c.sourceIds.length >= 1, c.id);
});

test('Ford: every node has five depths, different texts, and listed assets resolve', () => {
  const assetIds = new Set(fordDossier.assets.map(a => a.id));
  for (const r of fordDossier.rooms) for (const n of r.nodes) {
    const texts = DEPTH_LEVELS.map(l => n.text[l]);
    for (const t of texts) assert.ok(t.trim().length > 60, n.id);
    assert.equal(new Set(texts).size, 5, `${n.id} depths must differ`);
    assert.ok(n.text.early.length < n.text.university.length, `${n.id} grows in depth`);
    for (const a of n.assetIds) assert.ok(assetIds.has(a), `${n.id} -> ${a}`);
    if (n.id !== 'n-r7-mylife') assert.ok(n.assetIds.length >= 1, `${n.id} lists assets`);
  }
});

test('Ford: all assets are cleared, have credit and a record URL, and cite real claims', () => {
  const claimIds = new Set(fordDossier.ledger.claims.map(c => c.id));
  for (const a of fordDossier.assets) {
    assert.ok(['public-domain', 'cc0', 'cc-by', 'cc-by-sa'].includes(a.rights.status), a.id);
    assert.ok(a.rights.credit && a.rights.verifiedAt, a.id);
    assert.ok(a.claimIds.length >= 1, a.id);
    for (const c of a.claimIds) assert.ok(claimIds.has(c), `${a.id} -> ${c}`);
  }
});

test('Ford: likeness variants cover documented ages 39-83 without gaps', () => {
  const b = fordDossier.characters[0];
  const sorted = [...b.variants].sort((x, y) => x.ageRange[0] - y.ageRange[0]);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i].ageRange[0], sorted[i - 1].ageRange[1] + 1);
  assert.equal(sorted[0].ageRange[0], 39);
  assert.equal(sorted.at(-1)!.ageRange[1], 83);
  const ids = new Set(fordDossier.assets.map(a => a.id));
  for (const v of b.variants) for (const r of v.referenceAssetIds) assert.ok(ids.has(r), r);
});

test('Ford: ages below the earliest photograph never produce a visible face', () => {
  const req = buildImageRequest({ action: 'x', setting: 'y', style: 'z', cast: [{ characterId: 'ford', age: 15 }] }, fordDossier.characters, fordDossier.assets);
  assert.ok(req.prompt.includes('face not visible'));
  assert.deepEqual(req.referenceUrls, []);
});

test('Ford: reconstruction scenes are valid, period-safe, and obey the likeness rules', () => {
  assert.ok(fordScenes.length >= 16 && fordScenes.length <= 20);
  const claimIds = new Set(fordDossier.ledger.claims.map(c => c.id));
  const roomIds = new Set(fordDossier.rooms.map(r => r.id));
  const earliest = Math.min(...fordDossier.characters[0].variants.map(v => v.ageRange[0]));
  for (const s of fordScenes) {
    assert.ok(roomIds.has(s.roomId), s.id);
    assert.ok(s.claimIds.length >= 1 && s.claimIds.every(c => claimIds.has(c)), s.id);
    for (const c of s.spec.cast) assert.equal(c.characterId, 'ford', `${s.id} depicts only characters with a bible`);
    const req = buildImageRequest(s.spec, fordDossier.characters, fordDossier.assets);
    for (const c of s.spec.cast) if (c.age < earliest) assert.ok(req.prompt.includes('face not visible'), s.id);
    assert.ok(!/(swastika|violence|blood)/i.test(s.spec.action + s.spec.setting), s.id);
  }
  assert.equal(new Set(fordScenes.map(s => s.id)).size, fordScenes.length);
});

test('Ford: the hall is organised in wings and the Dearborn Independent sits in Beliefs and Morals, not in the headline', () => {
  const room = (id: string) => fordDossier.rooms.find(r => r.id === id)!;
  const hasClaim = (id: string, c: string) => room(id).nodes.some(n => n.claimIds.includes(c));
  assert.ok(hasClaim('r7', 'c-series') && hasClaim('r7', 'c-retraction') && hasClaim('r7', 'c-eagle'));
  assert.ok(hasClaim('r6', 'c-willow') && hasClaim('r6', 'c-ww1-ford') && hasClaim('r2', 'c-piquette-plant'));
  for (const r of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r8']) assert.ok(!hasClaim(r, 'c-series'), `${r} must not carry the series`);
  assert.ok(!/hatred|antisemit|Jew/i.test(fordDossier.entrance!.tagline), 'entrance tagline leads with the cars and Detroit');
  assert.ok(/Detroit/.test(fordDossier.entrance!.tagline));
  const titles = fordDossier.rooms.map(r => r.title).join('|');
  assert.ok(/Beliefs and Morals/.test(titles) && /War Effort/.test(titles));
  const ids = new Set(fordDossier.rooms.map(r => r.id));
  for (const w of fordWings) for (const id of w.roomIds) assert.ok(ids.has(id));
  // every existing scene id from the first build is still present (fordRecon.json depends on them)
  for (const id of ['recon-ford-road-engine', 'recon-ford-watch-table', 'recon-ford-quadricycle', 'recon-ford-highland-line', 'recon-fiveday-gate', 'recon-ford-peaceship', 'recon-independent-press', 'recon-willow-run'])
    assert.ok(fordScenes.some(s => s.id === id), id);
});

test('Ford: printed pages shown as evidence are real documents with clearly sourced claims', () => {
  for (const id of ['doc-1920-international-jew-titlepage', 'doc-1921-dearborn-independent-cover', 'doc-1927-dearborn-independent-cover']) {
    const a = fordDossier.assets.find(x => x.id === id)!;
    assert.ok(a && a.kind === 'document' && a.rights.status === 'public-domain', id);
  }
});

test('Ford timeline: placement succeeds, no overlaps, stays inside the frame', () => {
  assert.ok(fordMilestones.length <= 16);
  const years = fordMilestones.map(m => m.year);
  const y0 = Math.floor(Math.min(...years) / 10) * 10, y1 = Math.ceil(Math.max(...years) / 10) * 10;
  const placed = placeMilestones(fordMilestones, 120, TL_W - 120, y0, y1);
  const byTier = new Map<number, typeof placed>();
  for (const p of placed) byTier.set(p.tier, [...(byTier.get(p.tier) ?? []), p]);
  for (const cards of byTier.values()) {
    const s = [...cards].sort((a, b) => a.left - b.left);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].left >= s[i - 1].left + CARD_W, `overlap ${s[i - 1].year}/${s[i].year}`);
  }
  for (const p of placed) { assert.ok(p.left >= 40 && p.left + CARD_W <= TL_W - 40); assert.ok(p.tier >= 0 && p.tier < 6); }
});

test('Ford timeline: milestones cite real claims and portraits are real assets', () => {
  const ids = new Set(fordDossier.ledger.claims.map(c => c.id));
  for (const m of fordMilestones) for (const c of [m.claimId, ...(m.extraClaimIds ?? [])]) assert.ok(ids.has(c), c);
  const assets = new Set(fordDossier.assets.map(a => a.id));
  for (const p of fordPortraits) assert.ok(assets.has(p.assetId), p.assetId);
});

test('Ford entrance: montage frames are real portraits with focus points, epigraph is cited', () => {
  const e = fordDossier.entrance!;
  const assets = new Map(fordDossier.assets.map(a => [a.id, a]));
  assert.ok(e.montage.length >= 5 && e.montage.length <= 6);
  for (const m of e.montage) {
    assert.ok(assets.has(m.assetId), m.assetId);
    assert.equal(assets.get(m.assetId)!.kind, 'photo');
    assert.ok(m.focus && m.focus.x > 0 && m.focus.x < 1 && m.focus.y > 0 && m.focus.y < 1 && m.focus.scale >= 100, m.assetId);
  }
  assert.equal(e.dates, '1863 — 1947');
  assert.equal(e.scoreUrl, '/dossier/ford/score.mp3');
  assert.ok(e.epigraph.text && e.epigraph.cite.includes('My Life and Work'));
});
