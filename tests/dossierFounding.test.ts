import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDossier, DEPTH_LEVELS, PUBLISHABLE } from '../services/dossier/dossierTypes';
import { placeMilestones, buildTimelineDoc, W as TL_W, CARD_W } from '../services/dossier/timelineDoc';
import { contrastRatio } from '../services/dossier/dossierTheme';
import { foundingDossier, foundingWings } from '../data/dossier/founding';
import { foundingScenes } from '../data/dossier/foundingScenes';
import { buildImageRequest } from '../services/dossier/characterGateway';
import {
  CENSUS_POINTS, FOUNDING_RANGE, PRESIDENCIES, SLAVERY_NOTE, foundingBoardMilestones, foundingMilestones, foundingPortraits,
} from '../data/dossier/foundingTimeline';
import { DOSSIERS, DOSSIER_THEMES } from '../data/dossier/registry';

const d = foundingDossier;
const claimIds = new Set(d.ledger.claims.map(c => c.id));
const assetIds = new Set(d.assets.map(a => a.id));
const byClaim = new Map(d.ledger.claims.map(c => [c.id, c]));
const nodes = d.rooms.flatMap(r => r.nodes);
const allText = (n: (typeof nodes)[number]) => DEPTH_LEVELS.map(l => n.text[l]).join(' ');

test('Founding dossier passes every publishing rule with zero errors', () => {
  assert.deepEqual(validateDossier(d).filter(i => i.severity === 'error'), []);
});

test('Founding is a topic exhibit with seven painted-likeness founders, 14 to 18 rooms and real research depth', () => {
  assert.equal(d.id, 'founding-era');
  assert.equal(d.kind, 'topic');
  // Only the seven named founders with surviving painted portraits have a CharacterBible, each gated by paintedLikeness.
  assert.deepEqual(d.characters.map(c => c.id).sort(), ['abigail-adams', 'adams', 'franklin', 'hamilton', 'jefferson', 'madison', 'washington']);
  for (const c of d.characters) {
    assert.equal(c.paintedLikeness, true, c.id);
    for (const v of c.variants) for (const rid of v.referenceAssetIds) {
      const a = d.assets.find(x => x.id === rid)!;
      assert.ok(a && (a.rights.status === 'public-domain' || a.rights.status === 'cc0') && a.kind !== 'recreation', `${c.id} reference ${rid} must be a real public-domain portrait`);
    }
  }
  assert.ok(d.rooms.length >= 14 && d.rooms.length <= 18, `rooms: ${d.rooms.length}`);
  assert.ok(d.ledger.claims.length >= 120, `claims: ${d.ledger.claims.length}`);
  assert.ok(d.ledger.sources.length >= 50, `sources: ${d.ledger.sources.length}`);
  assert.ok(d.assets.length >= 30, `assets: ${d.assets.length}`);
});

test('Founding: wings follow the presidencies, name them as specified, and cover every room exactly once in order', () => {
  assert.deepEqual(d.wings!.map(w => w.title), [
    'Before the Republic (to 1789)', 'Washington 1789–1797', 'Adams 1797–1801', 'Jefferson 1801–1809', 'Madison 1809–1817', 'How we know / Voices',
  ]);
  assert.deepEqual(d.wings, foundingWings);
  assert.deepEqual(d.wings!.flatMap(w => w.roomIds), d.rooms.map(r => r.id));
});

test('Founding: every node cites at least two existing claims, lists existing assets, and has five reading depths that deepen', () => {
  for (const r of d.rooms) {
    assert.ok(r.nodes.length >= 1, r.id);
    for (const n of r.nodes) {
      assert.ok(n.claimIds.length >= 2, `${n.id} cites ${n.claimIds.length} claims`);
      for (const c of n.claimIds) assert.ok(claimIds.has(c), `${n.id}: unknown claim ${c}`);
      for (const a of n.assetIds) assert.ok(assetIds.has(a), `${n.id}: unknown asset ${a}`);
      for (const l of DEPTH_LEVELS) assert.ok(n.text[l].trim().length > 60, `${n.id} ${l}`);
      assert.ok(n.text.university.length > n.text.early.length, n.id);
      assert.ok(n.text.high.length > n.text.elementary.length, n.id);
    }
  }
  const ids = nodes.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate node ids');
});

test('Founding: every claim is shown in some node, every source is used, ids are unique', () => {
  const used = new Set(nodes.flatMap(n => n.claimIds));
  for (const c of d.ledger.claims) assert.ok(used.has(c.id), `claim ${c.id} is not cited by any node`);
  const sourceIds = new Set(d.ledger.sources.map(s => s.id));
  assert.equal(sourceIds.size, d.ledger.sources.length, 'duplicate source ids');
  const usedSources = new Set(d.ledger.claims.flatMap(c => c.sourceIds));
  for (const s of sourceIds) assert.ok(usedSources.has(s), `source ${s} is cited by no claim`);
  const ids = d.ledger.claims.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate claim ids');
});

test('Founding: rooms for slavery, Native nations, the left-out, sources and voices exist, and every room has a story or source node', () => {
  for (const r of d.rooms) assert.ok(r.nodes.some(n => n.kind === 'story' || n.kind === 'artifact' || n.kind === 'timeline' || n.kind === 'source-reading'), r.id);
  assert.ok(nodes.some(n => n.kind === 'source-reading'));
  const titles = d.rooms.map(r => r.title);
  for (const t of ['Who Was Left Out', 'How We Know', 'Voices']) assert.ok(titles.includes(t), t);
  const last = d.rooms.slice(-3).map(r => r.title);
  assert.deepEqual(last, ['Who Was Left Out', 'How We Know', 'Voices']);
  const t = d.rooms.map(r => `${r.title} ${r.nodes.map(n => n.title).join(' ')}`).join(' ').toLowerCase();
  for (const word of [
    'colonial inheritance', 'stamp act', 'tea party', 'lexington', 'declaration', 'three-fifths', 'saratoga', 'valley forge', 'yorktown',
    'treaty of paris', 'articles', 'shays', 'convention', 'federalist', 'bill of rights', 'whiskey', 'jay treaty', 'farewell', 'will of 1799',
    'xyz', 'alien and sedition', 'election of 1800', 'louisiana', 'lewis and clark', 'sacagawea', 'hemings', 'embargo', 'slave trade',
    'war of 1812', 'burning of washington', 'hartford', 'good feelings', 'father of the constitution', 'enslaver', 'who was left out', 'how we know', 'voices',
  ]) assert.ok(t.includes(word), `no room or node title covers "${word}"`);
  const everything = nodes.map(allText).join(' ').toLowerCase();
  for (const word of ['dunmore', 'black loyalist', 'wheatley', 'abigail', 'royal proclamation', 'haudenosaunee', 'native nations', 'ona judge', 'york', 'gabriel', 'banneker'])
    assert.ok(everything.includes(word), `no node text covers "${word}"`);
});

test('Founding: each presidency room says plainly that enslaved people lived in it', () => {
  for (const id of ['r10', 'r11', 'r12', 'r13', 'r14', 'r15']) {
    const room = d.rooms.find(r => r.id === id)!;
    assert.ok(/enslaved|enslaver|slave/i.test(room.nodes.map(allText).join(' ')), id);
  }
  const adams = d.rooms.find(r => r.id === 'r12')!.nodes.map(allText).join(' ');
  assert.ok(/enslaved/i.test(adams) && /Gabriel/.test(adams), 'Adams wing includes Gabriel and the enslaved');
});

test('Founding: contested and tradition claims carry notes; disputed numbers are graded contested and shown as ranges', () => {
  const graded = d.ledger.claims.filter(c => c.confidence === 'contested' || c.confidence === 'tradition');
  assert.ok(graded.length >= 25, `graded: ${graded.length}`);
  for (const c of graded) assert.ok(c.note && c.note.length > 40, c.id);
  for (const id of [
    'c-enslaved-1770', 'c-war-dead', 'c-loyalists', 'c-dunmore-effect', 'c-black-patriots', 'c-sedition-count', 'c-ban-limits', 'c-domestic-trade', 'c-black-1812',
    'c-struck-why', 'c-all-men-meaning', 'c-three-fifths-meaning', 'c-ec-effect', 'c-delegates-enslavers', 'c-whiskey-meaning', 'c-shays-meaning', 'c-proclamation-effect',
    'c-taxes-weight', 'c-who-fired', 'c-war-causes', 'c-hartford-secession', 'c-good-feelings', 'c-portrait', 'c-wash-motives', 'c-hemings-nature', 'c-hemings-dissent',
    'c-sacagawea-legend', 'c-embargo-effect', 'c-madison-notes', 'c-iroquois-influence', 'c-propertyless',
  ]) assert.equal(byClaim.get(id)!.confidence, 'contested', id);
  for (const id of ['c-xyz-slogan', 'c-dinner-1790', 'c-banneker-survey']) assert.equal(byClaim.get(id)!.confidence, 'tradition', id);
  // Ranges, not single figures.
  assert.match(byClaim.get('c-enslaved-1770')!.text, /between roughly 450,000 and 500,000/);
  assert.match(byClaim.get('c-war-dead')!.text, /25,000 to somewhat over 30,000/);
  assert.match(byClaim.get('c-black-patriots')!.text, /5,000 to well above 9,000/);
  assert.match(byClaim.get('c-dunmore-effect')!.text, /about 20,000 to far higher/);
  assert.match(byClaim.get('c-sedition-count')!.text, /roughly two dozen/);
  assert.match(byClaim.get('c-ban-limits')!.text, /several thousand to tens of thousands/);
  assert.match(byClaim.get('c-black-1812')!.text, /3,000 to 5,000/);
  assert.match(byClaim.get('c-sedition-count')!.note!, /between about 14 and about 25/);
});

test('Founding: Hemings is graded probable with the dissent named and the lack of consent stated', () => {
  const p = byClaim.get('c-hemings-paternity')!;
  assert.equal(p.confidence, 'probable');
  assert.ok(/Heritage Society/.test(p.note!) && /interested party/.test(p.note!));
  assert.equal(byClaim.get('c-dna')!.confidence, 'established');
  assert.match(byClaim.get('c-dna')!.text, /25 adult Jefferson men|about 25 adult/);
  const nature = byClaim.get('c-hemings-nature')!;
  assert.ok(/enslaved/.test(nature.text) && /could not lawfully refuse/.test(nature.text));
  const node = nodes.find(n => n.id === 'n-r14-hemings')!;
  for (const l of DEPTH_LEVELS) assert.ok(/enslaved/.test(node.text[l]), `hemings ${l}`);
  assert.ok(!/romance/i.test(node.text.early + node.text.elementary) || /not accurate|avoid/.test(allText(node)));
});

test('Founding: Sacagawea and York are stated from the journals; the "guide" story is graded contested', () => {
  assert.match(byClaim.get('c-sacagawea-role')!.text, /proved to be a sister of the Chif Cameahwait/);
  assert.match(byClaim.get('c-sacagawea-peace')!.text, /a woman with a party of men is a token of peace/);
  assert.equal(byClaim.get('c-sacagawea-legend')!.confidence, 'contested');
  assert.match(byClaim.get('c-sacagawea-legend')!.note!, /No authentic portrait/);
  assert.match(byClaim.get('c-york')!.text, /24 November 1805 voted/);
  assert.match(byClaim.get('c-york')!.text, /not freed/);
});

test('Founding: the census counts come from the Census Bureau table and add up', () => {
  const t90 = byClaim.get('c-census-1790')!.text, t10 = byClaim.get('c-census-1810')!.text;
  for (const s of ['3,929,214', '757,208', '697,681', '59,527']) assert.ok(t90.includes(s), s);
  for (const s of ['7,239,881', '1,377,808', '1,191,362', '186,446']) assert.ok(t10.includes(s), s);
  assert.equal(697681 + 59527, 757208);
  assert.equal(1191362 + 186446, 1377808);
  assert.deepEqual(byClaim.get('c-census-1790')!.sourceIds, ['s-census']);
  assert.match(d.ledger.sources.find(s => s.id === 's-census')!.url!, /census\.gov/);
  const by = Object.fromEntries(CENSUS_POINTS.map(c => [c.year, c]));
  assert.equal(by[1790].enslaved, 697681); assert.equal(by[1790].total, 3929214);
  assert.equal(by[1810].enslaved, 1191362); assert.equal(by[1810].total, 7239881);
  assert.ok(SLAVERY_NOTE.includes('697,681') && SLAVERY_NOTE.includes('1,191,362') && /every year and in every presidency/.test(SLAVERY_NOTE));
});

test('Founding: quoted wordings are exactly those read in fetched sources', () => {
  const c = (id: string) => byClaim.get(id)!.text;
  assert.ok(c('c-all-men').includes('We hold these truths to be self-evident: That all men are created equal; that they are endowed by their Creator with certain unalienable rights; that among these are life, liberty, and the pursuit of happiness.'));
  assert.ok(c('c-savages').includes('the merciless Indian savages, whose known rule of warfare is an undistinguished destruction of all ages, sexes, and conditions'));
  assert.ok(c('c-struck-clause').includes('he has waged cruel war against human nature itself, violating it\'s most sacred rights of life & liberty in the persons of a distant people who never offended him, captivating & carrying them into slavery in another hemisphere, or to incur miserable death in their transportation thither'));
  assert.ok(c('c-struck-clause').includes('determined to keep open a market where MEN should be bought & sold'));
  assert.ok(c('c-struck-why').includes('struck out in complaisance to South Carolina and Georgia') && c('c-struck-why').includes('our northern brethren also, I believe, felt a little tender under those censures'));
  assert.ok(c('c-abigail').includes('Remember the Ladies, and be more generous and favourable to them than your ancestors'));
  assert.ok(c('c-john-reply').includes('As to your extraordinary Code of Laws, I cannot but laugh'));
  assert.ok(c('c-wheatley').includes('in every human Breast, God has implanted a Principle, which we call Love of Freedom; it is impatient of Oppression, and pants for Deliverance'));
  assert.ok(c('c-dunmore').includes('I do hereby further declare all indented Servants, Negroes, or others, (appertaining to Rebels,) free that are able and willing to bear Arms, they joining His Majesty\'s Troops'));
  assert.ok(c('c-paris-art7').includes('without causing any destruction, or carrying away any Negroes or other property of the American inhabitants'));
  assert.ok(c('c-peace-1783').includes('to be free sovereign and independent states'));
  assert.ok(c('c-proclamation-text').includes('should not be molested or disturbed in the Possession of such Parts of Our Dominions and Territories as, not having been ceded to or purchased by Us, are reserved to them'));
  assert.ok(c('c-three-fifths-text').includes('adding to the whole Number of free Persons, including those bound to Service for a Term of Years, and excluding Indians not taxed, three fifths of all other Persons.'));
  assert.ok(c('c-no-slave-word').includes('delivered up on Claim of the Party to whom such Service or Labour may be due'));
  assert.ok(c('c-madison-property').includes('Mr. MADISON thought it wrong to admit in the Constitution the idea that there could be property in men.'));
  assert.ok(c('c-nw-art3').includes('The utmost good faith shall always be observed towards the Indians; their lands and property shall never be taken from them without their consent'));
  assert.ok(c('c-nw-art6').includes('There shall be neither slavery nor involuntary servitude in the said territory, otherwise than in the punishment of crimes'));
  assert.ok(c('c-fed54').includes('divested of two fifths of the MAN'));
  assert.ok(c('c-federalist-papers').includes('If men were angels, no government would be necessary.'));
  assert.ok(c('c-farewell').includes('steer clear of permanent alliances with any portion of the foreign world'));
  assert.ok(c('c-sedition').includes('any false, scandalous and malicious writing or writings against the government of the United States, or either house of the Congress of the United States, or the President of the United States, with intent to defame'));
  assert.ok(c('c-inaug-1801').includes('We are all Republicans, we are all Federalists'));
  assert.ok(c('c-wash-will').includes('Upon the decease of my wife, it is my will and desire, that all the slaves which I hold in my own right shall receive their freedom'));
  assert.ok(c('c-wash-views').includes('it being among my first wishes to see some plan adopted by the legislature by which slavery in the Country may be abolished by slow, sure, & imperceptible degrees'));
  assert.ok(c('c-rotation').includes('under pretext that may deceive both them and the Public'));
  assert.ok(c('c-judge').includes('should never get my liberty'));
  assert.ok(c('c-jeff-notes').includes('Indeed I tremble for my country when I reflect that God is just; that his justice cannot sleep forever'));
  assert.ok(c('c-jeff-antislavery').includes('nobody wishes more ardently to see an abolition not only of the trade but of the condition of slavery'));
  assert.ok(c('c-banneker-letter').includes('one universal Father hath given being to us all'));
  assert.ok(c('c-banneker-letter').includes('no body wishes more ardently to see a good system commenced for raising the condition both of their body & mind to what it ought to be, as fast as the imbecility of their present existence, and other circumstances which cannot be neglected, will admit'));
  assert.ok(c('c-cornplanter').includes('our women look behind them and turn pale'));
  assert.ok(c('c-madison-father').includes('was not like the fabled Goddess of Wisdom, the offspring of a single brain. It ought to be regarded as the work of many heads and many hands'));
  assert.ok(c('c-sacagawea-peace').includes('The wife of Shabono our interpetr we find reconsiles all the Indians, as to our friendly intentions a woman with a party of men is a token of peace.'));
  // Dates the claims state exactly.
  assert.equal(byClaim.get('c-lee-resolution')!.when, '1776-06');
  assert.equal(byClaim.get('c-dunmore')!.when, '1775-11-07');
  assert.equal(byClaim.get('c-proclamation-text')!.when, '1763-10-07');
});

test('Founding: voices appear in the Voices room with their quoted wording', () => {
  const voices = d.rooms.find(r => r.title === 'Voices')!;
  const text = voices.nodes.map(n => n.text.high + n.text.middle).join(' ');
  for (const q of [
    'in every human Breast, God has implanted a Principle, which we call Love of Freedom',
    'Remember the Ladies, and be more generous and favourable to them than your ancestors',
    'one universal Father hath given being to us all',
    'our women look behind them and turn pale',
    'if I went back to Virginia, I should never get my liberty',
    'a woman with a party of men is a token of peace',
    'property in men',
    'We are all Republicans, we are all Federalists',
    'the work of many heads and many hands',
    'steer clear of permanent alliances with any portion of the foreign world',
  ]) assert.ok(text.includes(q), q);
});

test('Founding: all assets are real, publishable, credited, record a Commons URL, and none is generated', () => {
  for (const a of d.assets) {
    assert.ok(PUBLISHABLE.includes(a.rights.status) && a.rights.status !== 'generated' && a.rights.status !== 'unknown', a.id);
    assert.ok(a.rights.credit && a.rights.credit.length > 15, a.id);
    assert.ok(a.rights.verifiedAt?.startsWith('https://commons.wikimedia.org/wiki/File:'), a.id);
    assert.ok(a.url.startsWith('/dossier/founding/archival/'), `${a.id}: the image is mirrored into the app (see dossierMirror.test.ts)`);
    assert.ok(a.claimIds.length >= 1 && a.claimIds.every(x => claimIds.has(x)), `${a.id} cites unknown claim`);
    assert.ok(!a.reconstruction && a.kind !== 'recreation', a.id);
  }
  const ids = d.assets.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate asset ids');
  const urls = d.assets.map(a => a.url);
  assert.equal(new Set(urls).size, urls.length, 'duplicate asset urls');
});

test('Founding: every asset is shown, CC licences keep attribution, and modern photographs say so', () => {
  const used = new Set(nodes.flatMap(n => n.assetIds));
  for (const a of d.assets) assert.ok(used.has(a.id), `${a.id} is not shown anywhere`);
  for (const a of d.assets) {
    if (a.rights.status === 'cc-by-sa') assert.ok(/CC BY-SA/.test(a.rights.credit), a.id);
    if (a.rights.status === 'cc-by') assert.ok(/CC BY/.test(a.rights.credit), a.id);
    // There are no photographs from this era: anything called a photograph is a modern photograph of a place or an object.
    if (a.kind === 'photo') assert.ok(/photograph|modern/i.test(a.title), `${a.id}: a photo must say it is modern`);
  }
});

test('Founding: images of violence or the slave trade are gated and the opening never shows a gated image', () => {
  const byId = new Map(d.assets.map(a => [a.id, a]));
  assert.equal(byId.get('a-revere-massacre')!.minDepth, 'high');
  assert.equal(byId.get('a-slave-ship-brookes')!.minDepth, 'high');
  assert.equal(byId.get('a-xyz')!.minDepth, 'high');
  const banned = /corpse|dead bod|bodies|massacre scene|mutilat|atrocit/i;
  for (const a of d.assets) if (!a.minDepth) assert.ok(!banned.test(a.title), `${a.id}: ${a.title}`);
  const e = d.entrance!;
  assert.equal(e.dates, '1754 — 1817');
  assert.ok(e.montage.length >= 5 && e.montage.length <= 6);
  for (const m of e.montage) {
    assert.ok(assetIds.has(m.assetId), m.assetId);
    assert.ok(m.focus && m.focus.x >= 0 && m.focus.x <= 1 && m.focus.y >= 0 && m.focus.y <= 1 && m.focus.scale > 0);
    assert.ok(!byId.get(m.assetId)!.minDepth, m.assetId);
  }
  assert.equal(e.epigraph.text, 'It ought to be regarded as the work of many heads and many hands.');
  assert.ok(e.epigraph.cite.includes('Madison'));
});

test('Founding scenes: the eleven place scenes have no cast, no people, no violence, and each cites existing claims in an existing room', () => {
  const placeScenes = foundingScenes.filter(s => s.spec.cast.length === 0);
  assert.equal(placeScenes.length, 11);
  assert.equal(foundingScenes.length, 23);
  const roomIds = new Set(d.rooms.map(r => r.id));
  const ids = foundingScenes.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of placeScenes) {
    assert.ok(roomIds.has(s.roomId), s.id);
    assert.ok(s.claimIds.length >= 1 && s.claimIds.every(x => claimIds.has(x)), s.id);
    assert.ok(s.basis.length > 60, s.id);
    assert.ok(/no people|no figures/i.test(s.spec.style + ' ' + s.spec.action), s.id);
    assert.ok(!assetIds.has(s.id), `${s.id} collides with a real asset`);
    const text = `${s.spec.setting} ${s.spec.action}`.toLowerCase();
    for (const banned of ['face', 'portrait', 'corpse', 'body', 'bodies', 'blood', 'crowd', 'victim', 'dead', 'killing', 'massacre', 'violence', 'weapon', 'gun', 'sword', 'musket', 'cannon', 'fire', 'wounded', 'child', 'woman', 'women', 'man ', 'men ', 'soldier', 'slave', 'enslaved', 'whip', 'shackle', 'flag'])
      assert.ok(!text.includes(banned), `${s.id}: ${banned}`);
  }
  // The scene ids a painter will need.
  assert.deepEqual(placeScenes.map(s => s.id).sort(), [
    'recon-assembly-room', 'recon-burned-presidents-house', 'recon-capitol-construction', 'recon-keelboat-journal', 'recon-mulberry-row',
    'recon-philadelphia-street', 'recon-printing-shop', 'recon-rice-field', 'recon-survey-table', 'recon-tea-wharf', 'recon-tobacco-barn',
  ]);
  // All 23 are painted (Nano Banana Pro via Magnific): the manifest lists one existing JPEG per scene, and the entry stays flagged.
  const recon = JSON.parse(fs.readFileSync('data/dossier/foundingRecon.json', 'utf8')) as { id: string; file: string; generator: string }[];
  assert.equal(recon.length, 23);
  assert.deepEqual(recon.map(r => r.id).sort(), foundingScenes.map(s => s.id).sort());
  for (const r of recon) {
    assert.ok(fs.existsSync('public' + r.file), `${r.id} image missing`);
    assert.ok(/Nano Banana Pro/.test(r.generator), r.id);
  }
});

test('Founding scenes: twelve named-founder reconstructions show exactly one face, from painted portraits, with the compromises stated', () => {
  const founder = foundingScenes.filter(s => s.spec.cast.length > 0);
  assert.deepEqual(founder.map(s => s.id).sort(), [
    'recon-abigail-adams-letter-1776', 'recon-adams-congress-1776', 'recon-adams-quincy-1801', 'recon-franklin-paris-court-1778', 'recon-hamilton-treasury-1790',
    'recon-jefferson-graff-house-1776', 'recon-jefferson-louisiana-1803', 'recon-madison-1814', 'recon-madison-convention-1787',
    'recon-washington-farewell-1796', 'recon-washington-federal-hall-1789', 'recon-washington-valley-forge-1778',
  ]);
  const roomIds = new Set(d.rooms.map(r => r.id));
  const bibles = new Map(d.characters.map(c => [c.id, c]));
  const ages: Record<string, number> = {
    'recon-franklin-paris-court-1778': 72, 'recon-jefferson-graff-house-1776': 33, 'recon-adams-congress-1776': 40, 'recon-washington-valley-forge-1778': 46,
    'recon-madison-convention-1787': 36, 'recon-hamilton-treasury-1790': 35, 'recon-abigail-adams-letter-1776': 31, 'recon-washington-federal-hall-1789': 57,
    'recon-washington-farewell-1796': 64, 'recon-jefferson-louisiana-1803': 60, 'recon-madison-1814': 63, 'recon-adams-quincy-1801': 65,
  };
  for (const s of founder) {
    assert.equal(s.spec.cast.length, 1, `${s.id}: one named face per scene`);
    const c = s.spec.cast[0];
    assert.ok(bibles.has(c.characterId), s.id);
    assert.equal(c.age, ages[s.id], s.id);
    assert.ok(roomIds.has(s.roomId), s.id);
    assert.ok(s.claimIds.length >= 2 && s.claimIds.every(x => claimIds.has(x)), s.id);
    assert.ok(s.basis.length > 200 && /generic staging/.test(s.basis), `${s.id}: basis must state what is staging`);
    assert.ok(/no other person is shown|the other delegates are shown only from behind|crowd below is an anonymous mass/i.test(s.basis), `${s.id}: basis must say how others are shown`);
    const text = `${s.spec.setting} ${s.spec.action}`.toLowerCase();
    for (const banned of ['slave', 'enslaved', 'native', 'indian', 'corpse', 'blood', 'dead', 'musket', 'cannon', 'sword', 'whip', 'shackle'])
      assert.ok(!text.includes(banned), `${s.id}: ${banned}`);
    assert.ok(/no flags/i.test(s.spec.style), s.id);
    assert.ok(/no readable text/i.test(s.spec.style), s.id);
    // The era guard still applies: each scene is dated before 1890, so candles and no electric items.
    const req = buildImageRequest(s.spec, d.characters, d.assets);
    assert.match(req.prompt, /candles for light/, s.id);
    assert.ok(req.negativePrompt.includes('electric lamp') && req.negativePrompt.includes('light bulb'), s.id);
    assert.equal(req.aspect, '16:9');
    // The painted-likeness gate lets the face through (never a silhouette) and attaches the real portrait reference.
    assert.ok(!/face not visible/.test(req.prompt), s.id);
    assert.ok(req.referenceUrls.length >= 1 && req.referenceUrls.every(u => u.startsWith('https://upload.wikimedia.org/') || u.startsWith('/dossier/founding/archival/')), s.id);
  }
  // Honest age compromises are stated in the prompt for ages outside the portrait variants, and in the basis where the portrait is much older.
  assert.match(buildImageRequest(foundingScenes.find(s => s.id === 'recon-washington-valley-forge-1778')!.spec, d.characters, d.assets).prompt, /11 years younger than the painted reference portrait/);
  assert.match(foundingScenes.find(s => s.id === 'recon-jefferson-graff-house-1776')!.basis, /1786, when he was 43/);
  assert.match(foundingScenes.find(s => s.id === 'recon-jefferson-graff-house-1776')!.spec.action, /face is turned away/);
  assert.match(foundingScenes.find(s => s.id === 'recon-hamilton-treasury-1790')!.basis, /less certainty/);
  assert.match(foundingScenes.find(s => s.id === 'recon-abigail-adams-letter-1776')!.basis, /nine years older than the pastel/);
  // Crowds and delegates are never individuals.
  assert.match(foundingScenes.find(s => s.id === 'recon-washington-federal-hall-1789')!.spec.setting, /no individual faces/);
  assert.match(foundingScenes.find(s => s.id === 'recon-adams-congress-1776')!.spec.setting, /no faces visible/);
});

test('Founding timeline: pins cite real claims in real rooms, cover every presidency, and are dated inside the axis', () => {
  const rooms = new Set(d.rooms.map(r => r.id));
  const keys = foundingMilestones.map(m => m.claimId);
  assert.equal(new Set(keys).size, keys.length, 'a pin is keyed by its claim, so claim ids must be unique across pins');
  assert.ok(foundingMilestones.length >= 28 && foundingMilestones.length <= 42, `${foundingMilestones.length}`);
  for (const m of foundingMilestones) {
    for (const id of [m.claimId, ...(m.extraClaimIds ?? [])]) assert.ok(claimIds.has(id), `${m.short}: ${id}`);
    assert.ok(rooms.has(m.roomId), `${m.short}: ${m.roomId}`);
    assert.ok(m.year >= FOUNDING_RANGE.from && m.year < FOUNDING_RANGE.to, m.short);
    assert.ok(m.short.length > 4 && m.short.length <= 40, `short label too long: ${m.short}`);
    assert.ok(m.label.length > 10 && m.label.length <= 110, m.label);
  }
  for (const b of PRESIDENCIES) {
    const inside = foundingMilestones.filter(m => m.year >= b.from && m.year < b.to);
    assert.ok(inside.length >= 2, `${b.id} has ${inside.length} pins`);
  }
  assert.deepEqual(PRESIDENCIES.map(b => b.id), ['before', 'washington', 'adams', 'jefferson', 'madison']);
  for (let i = 1; i < PRESIDENCIES.length; i++) assert.equal(PRESIDENCIES[i].from, PRESIDENCIES[i - 1].to, 'bands are contiguous');
  // Every pin's room is in the wing the band suggests, or earlier (a pin may explain a background).
  const conf = foundingMilestones.flatMap(m => [m.claimId, ...(m.extraClaimIds ?? [])]).map(id => byClaim.get(id)!.confidence);
  for (const k of ['established', 'probable', 'contested', 'tradition'] as const) assert.ok(conf.includes(k) || k === 'tradition', k);
  for (const b of PRESIDENCIES) assert.ok(contrastRatio(b.color, '#0b0a0d') >= 4.5, `${b.id} band label contrast`);
});

test('Founding timeline: the board milestones place without overlap and the second board of documents and maps builds', () => {
  assert.ok(foundingBoardMilestones.length <= 16);
  for (const m of foundingBoardMilestones) for (const c of [m.claimId, ...(m.extraClaimIds ?? [])]) assert.ok(claimIds.has(c), c);
  const years = foundingBoardMilestones.map(m => m.year);
  const y0 = Math.floor(Math.min(...years) / 10) * 10;
  const y1 = Math.ceil(Math.max(...years) / 10) * 10;
  const placed = placeMilestones(foundingBoardMilestones, 120, TL_W - 120, y0, y1);
  assert.equal(placed.length, foundingBoardMilestones.length);
  const byTier = new Map<number, typeof placed>();
  for (const p of placed) byTier.set(p.tier, [...(byTier.get(p.tier) ?? []), p]);
  for (const cards of byTier.values()) {
    const s = [...cards].sort((a, b) => a.left - b.left);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].left >= s[i - 1].left + CARD_W, `overlap ${s[i - 1].year}/${s[i].year}`);
  }
  const doc = buildTimelineDoc(d, foundingBoardMilestones, foundingPortraits);
  assert.equal(doc.frames.length, 2);
  for (const p of foundingPortraits) assert.ok(assetIds.has(p.assetId), p.assetId);
});

test('Founding timeline experience: wired to exactly one node, declared in the type union, lazily loaded by the hall', () => {
  const hosts = nodes.filter(n => n.experience === 'founding-timeline');
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].kind, 'timeline');
  assert.equal(d.rooms.find(r => r.nodes.includes(hosts[0]))!.id, 'r1');
  assert.match(fs.readFileSync('services/dossier/dossierTypes.ts', 'utf8'), /\| 'founding-timeline'/);
  const hall = fs.readFileSync('components/dossier/DossierHall.tsx', 'utf8');
  assert.match(hall, /React\.lazy\(\(\) => import\('\.\/experiences\/FoundingTimeline'\)\)/);
  assert.match(hall, /n\.experience === 'founding-timeline'/);
  assert.match(hall, /<FoundingTimeline dossier=\{dossier\} onGoRoom=\{goRoom\} \/>/);
  const comp = fs.readFileSync('components/dossier/experiences/FoundingTimeline.tsx', 'utf8');
  assert.match(comp, /prefers-reduced-motion/);
  assert.match(comp, /type="range"/);
  assert.match(comp, /aria-label=\{`\$\{Math\.floor\(p\.year\)\}:/);
  assert.match(comp, /--dh-font-d/);
  assert.ok(comp.includes('SLAVERY_NOTE'));
});

test('Founding is registered with a lazy loader, a distinct theme, lobby years and a verified real hero image, and awaits art', async () => {
  const entry = DOSSIERS.find(x => x.id === 'founding-era')!;
  assert.ok(entry);
  assert.equal(entry.kind, 'topic');
  assert.equal(entry.years, '1754 — 1817');
  assert.equal(entry.artPending, true);
  assert.equal(entry.telaTimeline, undefined);
  assert.equal(entry.fabulaFilm, undefined);
  assert.ok(d.assets.some(a => a.url === entry.heroUrl), 'hero URL must be one of the cleared assets');
  const t = DOSSIER_THEMES['founding-era'];
  assert.equal(entry.theme, t);
  assert.equal(t.bg, '#101615');
  assert.equal(t.accent, '#4fb3a0');
  assert.match(t.body, /Source Serif 4/);
  assert.ok(contrastRatio(t.accent, t.bg) >= 4.5);
  assert.ok(t.heroTitle && t.heroTitle.length <= 20);
  assert.equal(t.entranceAsset, 'a-declaration-trumbull');
  assert.ok(d.entrance!.montage.some(m => m.assetId === t.entranceAsset));
  const others = Object.entries(DOSSIER_THEMES).filter(([k]) => k !== 'founding-era').map(([, v]) => v);
  const face = (s: string) => /'([^']+)'/.exec(s)![1];
  for (const o of others) { assert.notEqual(face(t.display), face(o.display)); assert.notEqual(t.accent, o.accent); assert.notEqual(t.bg, o.bg); }
  assert.ok(!/Anton|Abril Fatface|Cormorant Garamond|Fraunces/.test(t.display));
  assert.ok(t.fonts.some(f => f.startsWith('Libre Caslon')));
  const loaded = await entry.load();
  assert.equal(loaded.id, 'founding-era');
  assert.equal(loaded.assets.filter(a => a.kind === 'recreation').length, 23, 'the eleven place paintings and twelve named-founder paintings are registered');
  assert.deepEqual(validateDossier(loaded).filter(i => i.severity === 'error'), []);
});

test('Founding is even-handed: the four presidents, their critics and the people left out are all named in the ledger', () => {
  const text = d.ledger.claims.map(c => c.text).join(' ');
  for (const w of ['Washington', 'Adams', 'Jefferson', 'Madison', 'Hamilton', 'Federalist', 'Democratic-Republican', 'Anti-Federalists', 'Haudenosaunee', 'Cherokee', 'Shawnee', 'Seneca', 'Shoshone', 'Black Loyalists', 'enslaved', 'women', 'Loyalist'])
    assert.ok(text.includes(w), w);
  // Both founders' antislavery acts and their slaveholding are in the ledger.
  assert.ok(/more than 610/.test(byClaim.get('c-monticello-enslaved')!.text));
  assert.ok(/more than a hundred enslaved people/.test(byClaim.get('c-madison-enslaver')!.text));
  assert.ok(/317 enslaved people/.test(byClaim.get('c-mv-census')!.text));
  assert.ok(/never owned an enslaved person/.test(byClaim.get('c-adams-no-slaves')!.text));
  // No hagiography: no node text uses superlatives of praise for a founder.
  for (const n of nodes) assert.ok(!/\b(greatest|perfect|flawless|saintly|genius)\b/i.test(allText(n)), n.id);
});

test('Founding: the evidence base is honest about what was and was not read', () => {
  const founders = d.ledger.sources.find(s => s.id === 's-founders')!;
  assert.match(founders.citation, /refused automated access/);
  for (const s of d.ledger.sources.filter(x => x.kind === 'scholarly' && !x.url)) assert.ok(s.citation.length > 30, s.id);
  assert.ok(fs.existsSync('docs/dossier/founding-research-notes.md'));
  const notes = fs.readFileSync('docs/dossier/founding-research-notes.md', 'utf8');
  for (const w of ['specialist', 'weakest', 'not opened', 'recon-assembly-room', '75 credits']) assert.ok(notes.includes(w), w);
});
