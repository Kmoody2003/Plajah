import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDossier, DEPTH_LEVELS, PUBLISHABLE } from '../services/dossier/dossierTypes';
import { placeMilestones, buildTimelineDoc, W as TL_W, CARD_W } from '../services/dossier/timelineDoc';
import { persiaDossier } from '../data/dossier/persia';
import { persiaScenes } from '../data/dossier/persiaScenes';
import { persiaMilestones, persiaPortraits } from '../data/dossier/persiaTimeline';

const claimIds = new Set(persiaDossier.ledger.claims.map(c => c.id));
const assetIds = new Set(persiaDossier.assets.map(a => a.id));

test('Persia dossier passes every publishing rule with zero errors', () => {
  const errors = validateDossier(persiaDossier).filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
});

test('Persia dossier is a topic exhibit with no characters and enough research depth', () => {
  assert.equal(persiaDossier.kind, 'topic');
  assert.deepEqual(persiaDossier.characters, []);
  assert.ok(persiaDossier.ledger.claims.length >= 50, `claims: ${persiaDossier.ledger.claims.length}`);
  assert.ok(persiaDossier.rooms.length >= 8 && persiaDossier.rooms.length <= 9);
  assert.ok(persiaDossier.assets.length >= 24, `assets: ${persiaDossier.assets.length}`);
});

test('Persia: every node cites at least two existing claims and lists existing assets', () => {
  for (const r of persiaDossier.rooms) {
    assert.ok(r.nodes.length >= 1, r.id);
    for (const n of r.nodes) {
      assert.ok(n.claimIds.length >= 2, `${n.id} cites ${n.claimIds.length} claims`);
      for (const c of n.claimIds) assert.ok(claimIds.has(c), `${n.id}: unknown claim ${c}`);
      for (const a of n.assetIds) assert.ok(assetIds.has(a), `${n.id}: unknown asset ${a}`);
      for (const d of DEPTH_LEVELS) assert.ok(n.text[d].trim().length > 60, `${n.id} ${d}`);
    }
  }
});

test('Persia: there is a primary-source-reading node and every room has a story node', () => {
  const nodes = persiaDossier.rooms.flatMap(r => r.nodes);
  assert.ok(nodes.some(n => n.kind === 'source-reading'));
  for (const r of persiaDossier.rooms) assert.ok(r.nodes.some(n => n.kind === 'story' || n.kind === 'artifact'), r.id);
});

test('Persia: contested and tradition claims carry notes, and the early traditions are graded as such', () => {
  const graded = persiaDossier.ledger.claims.filter(c => c.confidence === 'contested' || c.confidence === 'tradition');
  assert.ok(graded.length >= 10, `graded: ${graded.length}`);
  for (const c of graded) assert.ok(c.note && c.note.length > 40, c.id);
  const byId = new Map(persiaDossier.ledger.claims.map(c => [c.id, c]));
  assert.equal(byId.get('c-acts-seed')!.confidence, 'tradition');
  assert.equal(byId.get('c-thomas-tradition')!.confidence, 'tradition');
  assert.equal(byId.get('c-sozomen')!.confidence, 'contested');
  assert.equal(byId.get('c-pop-estimates')!.confidence, 'contested');
});

test('Persia: every claim has a source and every source id is used or exists', () => {
  const sourceIds = new Set(persiaDossier.ledger.sources.map(s => s.id));
  for (const c of persiaDossier.ledger.claims) {
    assert.ok(c.sourceIds.length >= 1, c.id);
    for (const s of c.sourceIds) assert.ok(sourceIds.has(s), `${c.id}: ${s}`);
  }
  const ids = persiaDossier.ledger.claims.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate claim ids');
});

test('Persia: all assets are publishable, credited and carry a record URL; none shows an invented person', () => {
  for (const a of persiaDossier.assets) {
    assert.ok(PUBLISHABLE.includes(a.rights.status) && a.rights.status !== 'generated', a.id);
    assert.ok(a.rights.credit, a.id);
    assert.ok(a.rights.verifiedAt?.startsWith('https://commons.wikimedia.org/'), a.id);
    assert.ok(a.url.startsWith('https://upload.wikimedia.org/'), a.id);
    assert.ok(a.claimIds.every(c => claimIds.has(c)), `${a.id} cites unknown claim`);
    assert.ok(!a.reconstruction, a.id);
  }
});

test('Persia entrance: dates, scoreUrl, 5-6 montage frames from real assets', () => {
  const e = persiaDossier.entrance!;
  assert.equal(e.dates, 'c. 33 — Today');
  assert.equal(e.scoreUrl, '/dossier/persia/score.mp3');
  assert.ok(e.montage.length >= 5 && e.montage.length <= 6);
  for (const m of e.montage) {
    assert.ok(assetIds.has(m.assetId), m.assetId);
    assert.ok(m.focus && m.focus.x >= 0 && m.focus.x <= 1 && m.focus.y >= 0 && m.focus.y <= 1 && m.focus.scale > 0);
  }
  assert.ok(e.epigraph.cite.includes('Acts 2:9'));
});

test('Persia: the Acts 2:9 and Xi\'an Stele wordings used are the ones verified in fetched sources', () => {
  const nodes = persiaDossier.rooms.flatMap(r => r.nodes);
  const acts = nodes.find(n => n.id === 'n-r1-acts')!;
  assert.ok(acts.text.elementary.includes('Parthians, and Medes, and Elamites, and the dwellers in Mesopotamia'));
  const reading = nodes.find(n => n.id === 'n-r4-reading')!;
  assert.ok(reading.text.high.includes('bringing his scriptures and images from afar, has come and presented them at our High Capital'));
  assert.ok(reading.text.middle.includes('let it have free course throughout the empire'));
});

test('Persia scenes: 6-8 scenes, no cast, no faces, each cites existing claims in an existing room', () => {
  assert.ok(persiaScenes.length >= 6 && persiaScenes.length <= 8, `${persiaScenes.length}`);
  const roomIds = new Set(persiaDossier.rooms.map(r => r.id));
  for (const s of persiaScenes) {
    assert.deepEqual(s.spec.cast, [], s.id);
    assert.ok(roomIds.has(s.roomId), s.id);
    assert.ok(s.claimIds.length >= 1 && s.claimIds.every(c => claimIds.has(c)), s.id);
    const text = `${s.spec.setting} ${s.spec.action}`.toLowerCase();
    for (const banned of ['jesus', 'christ ', 'apostle', 'muhammad', 'prophet', 'saint ', 'face', 'portrait']) assert.ok(!text.includes(banned), `${s.id}: ${banned}`);
  }
});

test('Persia timeline: milestones cite real claims, are sparse, and place without throwing', () => {
  assert.ok(persiaMilestones.length <= 16);
  for (const m of persiaMilestones) for (const c of [m.claimId, ...(m.extraClaimIds ?? [])]) assert.ok(claimIds.has(c), c);
  const years = persiaMilestones.map(m => m.year);
  const y0 = Math.floor(Math.min(...years) / 10) * 10;
  const y1 = Math.ceil(Math.max(...years) / 10) * 10;
  const placed = placeMilestones(persiaMilestones, 120, TL_W - 120, y0, y1);
  assert.equal(placed.length, persiaMilestones.length);
  const byTier = new Map<number, typeof placed>();
  for (const p of placed) byTier.set(p.tier, [...(byTier.get(p.tier) ?? []), p]);
  for (const cards of byTier.values()) {
    const s = [...cards].sort((a, b) => a.left - b.left);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].left >= s[i - 1].left + CARD_W, `overlap ${s[i - 1].year}/${s[i].year}`);
  }
  for (const p of placed) assert.ok(p.left >= 40 && p.left + CARD_W <= TL_W - 40);
});

test('Persia timeline: the full Tela document builds (both boards)', () => {
  const doc = buildTimelineDoc(persiaDossier, persiaMilestones, persiaPortraits);
  assert.equal(doc.frames.length, 2);
  for (const p of persiaPortraits) assert.ok(assetIds.has(p.assetId), p.assetId);
});
