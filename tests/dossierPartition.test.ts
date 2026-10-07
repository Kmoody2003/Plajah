import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDossier, DEPTH_LEVELS, PUBLISHABLE } from '../services/dossier/dossierTypes';
import { placeMilestones, buildTimelineDoc, W as TL_W, CARD_W } from '../services/dossier/timelineDoc';
import { partitionDossier } from '../data/dossier/partition';
import { partitionScenes } from '../data/dossier/partitionScenes';
import { partitionMilestones, partitionPortraits } from '../data/dossier/partitionTimeline';
import { DOSSIERS } from '../data/dossier/registry';

const claimIds = new Set(partitionDossier.ledger.claims.map(c => c.id));
const assetIds = new Set(partitionDossier.assets.map(a => a.id));
const byClaim = new Map(partitionDossier.ledger.claims.map(c => [c.id, c]));
const nodes = partitionDossier.rooms.flatMap(r => r.nodes);

test('Partition dossier passes every publishing rule with zero errors', () => {
  const errors = validateDossier(partitionDossier).filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
});

test('Partition dossier is a topic exhibit with no characters and enough research depth', () => {
  assert.equal(partitionDossier.id, 'partition-1947');
  assert.equal(partitionDossier.kind, 'topic');
  assert.deepEqual(partitionDossier.characters, []);
  assert.ok(partitionDossier.ledger.claims.length >= 70, `claims: ${partitionDossier.ledger.claims.length}`);
  assert.ok(partitionDossier.rooms.length >= 10 && partitionDossier.rooms.length <= 12, `rooms: ${partitionDossier.rooms.length}`);
  assert.ok(partitionDossier.assets.length >= 30, `assets: ${partitionDossier.assets.length}`);
});

test('Partition: every node cites at least two existing claims, lists existing assets, and has five reading depths', () => {
  for (const r of partitionDossier.rooms) {
    assert.ok(r.nodes.length >= 1, r.id);
    for (const n of r.nodes) {
      assert.ok(n.claimIds.length >= 2, `${n.id} cites ${n.claimIds.length} claims`);
      for (const c of n.claimIds) assert.ok(claimIds.has(c), `${n.id}: unknown claim ${c}`);
      for (const a of n.assetIds) assert.ok(assetIds.has(a), `${n.id}: unknown asset ${a}`);
      for (const d of DEPTH_LEVELS) assert.ok(n.text[d].trim().length > 60, `${n.id} ${d}`);
      // deeper levels say more than shallower ones
      assert.ok(n.text.university.length > n.text.early.length, n.id);
    }
  }
});

test('Partition: every room has a story or artifact node, there is a source-reading, a "How We Know" room and a "Voices" room', () => {
  for (const r of partitionDossier.rooms) assert.ok(r.nodes.some(n => n.kind === 'story' || n.kind === 'artifact'), r.id);
  assert.ok(nodes.some(n => n.kind === 'source-reading'));
  const titles = partitionDossier.rooms.map(r => r.title);
  assert.ok(titles.includes('How We Know'));
  assert.ok(titles.includes('Voices'));
});

test('Partition: the broad subject areas are all covered by a room', () => {
  const t = partitionDossier.rooms.map(r => `${r.title} ${r.nodes.map(n => n.title).join(' ')}`).join(' ').toLowerCase();
  for (const word of ['lahore resolution', 'cabinet mission', 'mountbatten', 'the line', 'princely', 'kashmir', 'migration', 'gandhi', 'afterlife', 'memory', 'how we know', 'voices'])
    assert.ok(t.includes(word), `no room covers "${word}"`);
});

test('Partition: contested and tradition claims carry notes; the headline numbers are graded contested', () => {
  const graded = partitionDossier.ledger.claims.filter(c => c.confidence === 'contested' || c.confidence === 'tradition');
  assert.ok(graded.length >= 14, `graded: ${graded.length}`);
  for (const c of graded) assert.ok(c.note && c.note.length > 40, c.id);
  for (const id of ['c-deaths', 'c-displaced', 'c-women', 'c-dad', 'c-bihar', 'c-noakhali', 'c-kashmir-status', 'c-date-reason', 'c-1971-deaths', 'c-divide-rule'])
    assert.equal(byClaim.get(id)!.confidence, 'contested', id);
  assert.equal(byClaim.get('c-date-tradition')!.confidence, 'tradition');
  assert.equal(byClaim.get('c-radcliffe-papers')!.confidence, 'tradition');
});

test('Partition: the death toll is shown as a range (200,000 to 2,000,000), never as one number', () => {
  const deaths = byClaim.get('c-deaths')!;
  assert.ok(/200,000/.test(deaths.text) && /two million/i.test(deaths.text));
  const nodeText = nodes.find(n => n.id === 'n-r7-numbers')!.text;
  for (const d of DEPTH_LEVELS) assert.ok(/200,000/.test(nodeText[d]) || /range|different|very different/i.test(nodeText[d]), `numbers node ${d}`);
  assert.ok(/no reliable count|nobody counted|no one counted/i.test(JSON.stringify(nodeText)));
});

test('Partition: every claim has a source, every source id exists, and claim ids are unique', () => {
  const sourceIds = new Set(partitionDossier.ledger.sources.map(s => s.id));
  assert.equal(sourceIds.size, partitionDossier.ledger.sources.length, 'duplicate source ids');
  for (const c of partitionDossier.ledger.claims) {
    assert.ok(c.sourceIds.length >= 1, c.id);
    for (const s of c.sourceIds) assert.ok(sourceIds.has(s), `${c.id}: ${s}`);
  }
  const ids = partitionDossier.ledger.claims.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate claim ids');
});

test('Partition: all assets are real, publishable, credited, record a Commons URL, and none is a generated image', () => {
  for (const a of partitionDossier.assets) {
    assert.ok(PUBLISHABLE.includes(a.rights.status) && a.rights.status !== 'generated' && a.rights.status !== 'unknown', a.id);
    assert.ok(a.rights.credit && a.rights.credit.length > 15, a.id);
    assert.ok(a.rights.verifiedAt?.startsWith('https://commons.wikimedia.org/wiki/File:'), a.id);
    assert.ok(a.url.startsWith('https://upload.wikimedia.org/') || a.url.startsWith('/dossier/partition/'), a.id); // a local copy of a Commons file is allowed
    assert.ok(a.claimIds.length >= 1 && a.claimIds.every(c => claimIds.has(c)), `${a.id} cites unknown claim`);
    assert.ok(!a.reconstruction, a.id);
    assert.ok(a.kind !== 'recreation', a.id);
  }
});

test('Partition: every asset is shown in some room and CC licences keep their attribution in the credit line', () => {
  const used = new Set(nodes.flatMap(n => n.assetIds));
  for (const a of partitionDossier.assets) assert.ok(used.has(a.id), `${a.id} is not shown anywhere`);
  for (const a of partitionDossier.assets) {
    if (a.rights.status === 'cc-by-sa') assert.ok(/CC BY-SA/.test(a.rights.credit), a.id);
    if (a.rights.status === 'cc-by') assert.ok(/CC BY/.test(a.rights.credit), a.id);
  }
});

test('Partition: distressing material is gated and no graphic imagery is included', () => {
  const byId = new Map(partitionDossier.assets.map(a => [a.id, a]));
  // crowd / refugee / mourning photographs are not shown at the youngest levels
  assert.equal(byId.get('a-direct-action-rally')!.minDepth, 'high');
  assert.equal(byId.get('a-delhi-station-1947')!.minDepth, 'middle');
  assert.equal(byId.get('a-ashti-special-1948')!.minDepth, 'middle');
  const banned = /corpse|dead bod|bodies|massacre|victim|killing|burnt|burning|wounded|mutilat|vulture|atrocit|train of the dead/i;
  for (const a of partitionDossier.assets) assert.ok(!banned.test(a.title), `${a.id}: ${a.title}`);
});

test('Partition entrance: dates, epigraph is Radcliffe verbatim, 5-6 montage frames from real assets', () => {
  const e = partitionDossier.entrance!;
  assert.equal(e.dates, '1857 — Today');
  assert.ok(e.montage.length >= 5 && e.montage.length <= 6);
  for (const m of e.montage) {
    assert.ok(assetIds.has(m.assetId), m.assetId);
    assert.ok(m.focus && m.focus.x >= 0 && m.focus.x <= 1 && m.focus.y >= 0 && m.focus.y <= 1 && m.focus.scale > 0);
    // the opening never shows a gated image
    assert.ok(!partitionDossier.assets.find(a => a.id === m.assetId)!.minDepth, m.assetId);
  }
  assert.equal(e.epigraph.text, 'I am conscious that there are legitimate criticisms to be made of it: as there are, I think, of any other line that might be chosen.');
  assert.ok(e.epigraph.cite.includes('Radcliffe'));
});

test('Partition: the quoted wordings are exactly those read in the fetched sources', () => {
  const claims = (id: string) => byClaim.get(id)!.text;
  assert.ok(claims('c-radcliffe-quote').includes('I am conscious that there are legitimate criticisms to be made of it: as there are, I think, of any other line that might be chosen.'));
  assert.ok(claims('c-terms').includes('demarcate the boundaries of the two parts of the Punjab on the basis of ascertaining the contiguous majority areas of Muslims and non-Muslims. In doing so, it will also take into account other factors.'));
  assert.ok(claims('c-act').includes('As from the fifteenth day of August, nineteen hundred and forty-seven, two independent Dominions shall be set up in India, to be known respectively as India and Pakistan.'));
  assert.ok(claims('c-lahore-text').includes(`the areas in which the Muslims are numerically in a majority as in the North Western and Eastern Zones of (British) India should be grouped to constitute 'independent states' in which the constituent units should be autonomous and sovereign.`));
  assert.ok(claims('c-14-15').includes('At the stroke of the midnight hour, when the world sleeps, India will awake to life and freedom.'));
  assert.ok(claims('c-nehru-speech').includes('Some of those pains continue even now'));
  assert.ok(claims('c-jinnah-speech').includes('You are free; you are free to go to your temples, you are free to go to your mosques or to any other place or worship [sic] in this State of Pakistan.'));
  assert.ok(claims('c-sylhet-award').includes('No other part of the Province of Assam shall be transferred.'));
  assert.ok(claims('c-lahore-amritsar').includes('the stubborn geographical fact of the respective situations of Lahore and Amritsar'));
  // dates the awards and the Act are given exactly
  assert.ok(claims('c-award-dates').includes('12 August') && claims('c-award-dates').includes('17 August'));
  assert.equal(byClaim.get('c-act')!.when, '1947-07-18');
  // the first-hand voices room uses the verified Radcliffe sentence at the higher depths
  const voices = nodes.find(n => n.id === 'n-r12-reading')!;
  for (const d of ['middle', 'high', 'university'] as const) assert.ok(voices.text[d].includes('legitimate criticisms to be made of it'), d);
});

test('Partition: no literary text, lyrics or poem lines are reproduced; works are cited by title only', () => {
  const lit = nodes.find(n => n.id === 'n-r10-story')!;
  for (const d of DEPTH_LEVELS) assert.ok(lit.text[d].length < 2000, d);
  assert.ok(/No lines are quoted|does not reproduce any lines|No lines are quoted here/i.test(JSON.stringify(lit.text)));
  // the poem and story titles appear, but none of Faiz's or Pritam's opening lines
  const all = JSON.stringify(lit.text) + JSON.stringify([byClaim.get('c-faiz'), byClaim.get('c-pritam'), byClaim.get('c-manto')]);
  assert.ok(!/daagh|ujala|gazida|sahar|Waris Shah,? uth|uth dard/i.test(all));
});

test('Partition is even-handed: all principal parties and communities are named in the ledger', () => {
  const text = partitionDossier.ledger.claims.map(c => c.text).join(' ');
  for (const w of ['Congress', 'Muslim League', 'Mountbatten', 'Sikh', 'Hindu', 'Muslim', 'Nizam', 'Hari Singh', 'Nawab'])
    assert.ok(text.includes(w), w);
  // violence is attributed to all communities, not one
  assert.ok(/Hindus, Muslims and Sikhs were all both victims and perpetrators/.test(byClaim.get('c-who-did')!.text));
  // Kashmir is marked contested and neither government's position is endorsed
  assert.ok(/does not take a position|takes no (side|position)/i.test(byClaim.get('c-kashmir-status')!.note!));
});

test('Partition scenes: 6-8 scenes, no cast, no people, no violence, each cites existing claims in an existing room', () => {
  assert.ok(partitionScenes.length >= 6 && partitionScenes.length <= 8, `${partitionScenes.length}`);
  const roomIds = new Set(partitionDossier.rooms.map(r => r.id));
  const ids = partitionScenes.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of partitionScenes) {
    assert.deepEqual(s.spec.cast, [], s.id);
    assert.ok(roomIds.has(s.roomId), s.id);
    assert.ok(s.claimIds.length >= 1 && s.claimIds.every(c => claimIds.has(c)), s.id);
    assert.ok(s.basis.length > 40, s.id);
    assert.ok(/no people|no figures/i.test(s.spec.style + ' ' + s.spec.action), s.id);
    const text = `${s.spec.setting} ${s.spec.action}`.toLowerCase();
    for (const banned of ['face', 'portrait', 'corpse', 'body', 'bodies', 'blood', 'crowd', 'victim', 'dead', 'killing', 'massacre', 'violence', 'weapon', 'gun', 'sword', 'fire', 'burning', 'wounded', 'child', 'woman', 'women', 'man ', 'men '])
      assert.ok(!text.includes(banned), `${s.id}: ${banned}`);
  }
});

test('Partition scenes: ids that need paintings do not collide with real assets', () => {
  for (const s of partitionScenes) assert.ok(!assetIds.has(s.id), s.id);
});

test('Partition timeline: milestones cite real claims, are sparse, and place without throwing', () => {
  assert.ok(partitionMilestones.length <= 16);
  for (const m of partitionMilestones) for (const c of [m.claimId, ...(m.extraClaimIds ?? [])]) assert.ok(claimIds.has(c), c);
  const years = partitionMilestones.map(m => m.year);
  const y0 = Math.floor(Math.min(...years) / 10) * 10;
  const y1 = Math.ceil(Math.max(...years) / 10) * 10;
  const placed = placeMilestones(partitionMilestones, 120, TL_W - 120, y0, y1);
  assert.equal(placed.length, partitionMilestones.length);
  const byTier = new Map<number, typeof placed>();
  for (const p of placed) byTier.set(p.tier, [...(byTier.get(p.tier) ?? []), p]);
  for (const cards of byTier.values()) {
    const s = [...cards].sort((a, b) => a.left - b.left);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].left >= s[i - 1].left + CARD_W, `overlap ${s[i - 1].year}/${s[i].year}`);
  }
  for (const p of placed) assert.ok(p.left >= 40 && p.left + CARD_W <= TL_W - 40);
});

test('Partition timeline: the full Tela document builds (both boards) and uses documents, not faces', () => {
  const doc = buildTimelineDoc(partitionDossier, partitionMilestones, partitionPortraits);
  assert.equal(doc.frames.length, 2);
  for (const p of partitionPortraits) assert.ok(assetIds.has(p.assetId), p.assetId);
});

test('Partition is registered with a lazy loader, lobby years and a verified real hero image, and is flagged as awaiting art', async () => {
  const entry = DOSSIERS.find(d => d.id === 'partition-1947')!;
  assert.ok(entry);
  assert.equal(entry.kind, 'topic');
  assert.equal(entry.years, '1857 — Today');
  assert.equal(entry.artPending, true);
  assert.equal(entry.telaTimeline, undefined);
  assert.equal(entry.fabulaFilm, undefined);
  assert.ok(partitionDossier.assets.some(a => a.url === entry.heroUrl), 'hero URL must be one of the cleared assets');
  const d = await entry.load();
  assert.equal(d.id, 'partition-1947');
  assert.equal(d.assets.filter(a => a.kind === 'recreation').length, 8, 'the eight people-free reconstructions are painted and registered');
  assert.deepEqual(validateDossier(d).filter(i => i.severity === 'error'), []);
});
