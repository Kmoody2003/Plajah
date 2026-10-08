import assert from 'node:assert/strict';
import test from 'node:test';
import { SHADER_CATALOG, SHADER_CATALOG_VERSION } from '../services/shaders/shaderCatalog.generated';
import { STARTER_LOOKS } from '../services/shaders/shaderLooks';
import { validateLook, isCouncilComponent, councilCatalog, COVER_TOKEN, LOOK_LIMITS } from '../services/shaders/shaderLookSchema';
import { HOUSE_LOOKS } from '../services/shaders/looksLibrary';
import { convene, proposeLook, localLook, synthesise, catalogDigest, lookFormatSpec, chooseLead, type LookBrief, type LookModel } from '../services/shaders/looksCouncil';
import { COUNCIL_DIRECTOR_IDS } from '../services/council/councilTypes';

const brief: LookBrief = { track: { title: 'Night Bus', artist: 'Kenne', genre: 'electro', bpm: 124 }, energy: 0.7, hasCover: true, palette: ['#22d3ee', '#ff8c00', '#f5f1e8'] };

test('catalog is generated from the pinned library and matches package.json', async () => {
  const pkg = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies.shaders, SHADER_CATALOG_VERSION, 'bump the library → rerun scripts/gen-shader-catalog.mjs');
  assert.ok(Object.keys(SHADER_CATALOG).length >= 190);
});

test('every house look validates with ZERO issues (ranges are the library\'s own)', () => {
  for (const l of STARTER_LOOKS) {
    const v = validateLook(l);
    assert.ok(v.look, `${l.id} rejected: ${v.issues.join('; ')}`);
    assert.deepEqual(v.issues, [], `${l.id} needed fixing: ${v.issues.join('; ')}`);
  }
  assert.equal(HOUSE_LOOKS.length, STARTER_LOOKS.length);
  for (const l of HOUSE_LOOKS) assert.match(l.fallbackCss, /^linear-gradient\(160deg,#[0-9a-f]{3,8}(,#[0-9a-f]{3,8})*\)$/i, `${l.id} fallback`);
  assert.ok(HOUSE_LOOKS.some(l => l.needsCover) && HOUSE_LOOKS.some(l => !l.needsCover));
});

test('every director has house looks, and cover looks are flagged', () => {
  for (const id of COUNCIL_DIRECTOR_IDS) assert.ok(HOUSE_LOOKS.some(l => l.director === id), `${id} has no house look`);
  assert.ok(HOUSE_LOOKS.filter(l => l.needsCover).every(l => JSON.stringify(l.root).includes(COVER_TOKEN)));
});

test('validator: unknown components, props, and structure are rejected or repaired — never thrown', () => {
  const v = validateLook({ name: 'x', root: [{ type: 'Nope' }] });
  assert.equal(v.look, null);
  const w = validateLook({ name: 'x', root: [{ type: 'Plasma', props: { speed: 999, bogus: 1, colorA: 'red', colorB: '#112233' } }] });
  assert.ok(w.look);
  assert.equal((w.look!.root[0].props as any).speed, 5, 'clamped to the library range');
  assert.ok(!('bogus' in (w.look!.root[0].props as any)));
  assert.ok(!('colorA' in (w.look!.root[0].props as any)), 'non-hex colour dropped');
  assert.ok(w.issues.length >= 3);
  // effect with no children / only filters → nothing paints
  assert.equal(validateLook({ name: 'x', root: [{ type: 'Glitch' }] }).look, null);
  // generator with children → children dropped
  const g = validateLook({ name: 'x', root: [{ type: 'Plasma', children: [{ type: 'Voronoi' }] }] });
  assert.equal(g.look!.root[0].children, undefined);
  for (const bad of [null, 5, 'x', [], {}, { root: 3 }]) assert.doesNotThrow(() => validateLook(bad));
});

test('policy: no camera/video/text/network input, no arbitrary image URL, no pointer-only components', () => {
  for (const denied of ['WebcamTexture', 'VideoTexture', 'HTMLInCanvas', 'Text', 'CursorRipples', 'CursorTrail', 'Liquify', 'InkFlow', 'PixelSort', 'ChromaFlow']) {
    assert.equal(isCouncilComponent(denied), false, `${denied} must not be council-usable`);
  }
  assert.equal(validateLook({ name: 'x', root: [{ type: 'ImageTexture', props: { url: 'https://evil.example/x.png' } }] }).look, null);
  assert.equal(validateLook({ name: 'x', root: [{ type: 'ImageTexture' }] }).look, null, 'default url (shaders.com) must be unreachable');
  const ok = validateLook({ name: 'x', root: [{ type: 'Duotone', children: [{ type: 'ImageTexture', props: { url: COVER_TOKEN } }] }] });
  assert.ok(ok.look?.needsCover);
  // fallback can never be injected
  const inj = validateLook({ name: 'x', fallbackCss: 'url(https://evil)', root: [{ type: 'Plasma' }] });
  assert.ok(!/url\(/.test(inj.look!.fallbackCss));
  assert.ok(councilCatalog().length > 80);
});

test('validator: drives are range-checked against the prop, and limited', () => {
  const v = validateLook({ name: 'x', root: [{ type: 'Plasma', drive: [
    { prop: 'warp', from: 'kick', min: -5, max: 99 },     // clamped into 0..1
    { prop: 'colorA', from: 'kick', min: 0, max: 1 },     // not numeric → rejected
    { prop: 'warp', from: 'nonsense', min: 0, max: 1 },   // unknown feature → rejected
  ] }] });
  assert.equal(v.look!.root[0].drive!.length, 1);
  assert.deepEqual([v.look!.root[0].drive![0].min, v.look!.root[0].drive![0].max], [0, 1]);
});

test('validator: GPU budget caps nodes and weighted cost', () => {
  const heavy = { name: 'x', root: [{ type: 'Smoke' }, { type: 'Boids' }, { type: 'ReactionDiffusion' }, { type: 'Fog' }] };
  const v = validateLook(heavy);
  assert.ok(v.issues.some(i => /budget/.test(i)), 'over-budget node reported');
  const many = validateLook({ name: 'x', root: Array.from({ length: 14 }, () => ({ type: 'Grid' })) });
  assert.ok(many.look!.root.length <= LOOK_LIMITS.maxNodes);
});

test('prompt grounding: digest names real components with real ranges; format spec carries the cover rule', () => {
  const d = catalogDigest('REBEL');
  assert.match(d, /Glitch\*/);
  assert.match(d, /rgbShift 0\.\.20/);
  assert.doesNotMatch(d, /WebcamTexture|CursorRipples/);
  assert.match(lookFormatSpec(true), /\$cover/);
  assert.match(lookFormatSpec(false), /do NOT use ImageTexture/);
});

test('no model → six valid, director-attributed house looks, recoloured toward the cover palette', async () => {
  const d = await convene(brief);
  assert.equal(d.proposals.length, 6);
  for (const p of d.proposals) {
    assert.equal(p.source, 'local');
    assert.equal(validateLook(p.look).issues.length, 0, `${p.directorId}: ${validateLook(p.look).issues.join('; ')}`);
    assert.equal(p.look.director, p.directorId);
  }
  const colors = JSON.stringify(d.proposals.map(p => p.look.root));
  assert.ok(/#22d3ee|#ff8c00|#f5f1e8/i.test(colors), 'palette applied');
  assert.ok(d.tension && d.tension.line.length > 20, 'a real standing tension is named');
  assert.equal(validateLook(d.synthesis.look).issues.length, 0);
});

test('no cover → no proposal ever samples a cover', async () => {
  const d = await convene({ ...brief, hasCover: false });
  assert.ok(d.proposals.every(p => !p.look.needsCover));
  assert.ok(!d.synthesis.look.needsCover);
});

test('scripted model: valid drafts are kept; an invalid draft gets ONE repair turn with the exact issues', async () => {
  const calls: { system: string; user: string }[] = [];
  const good = { look: { name: 'Neon Rain', root: [{ type: 'Glitch', props: { intensity: 0.4 }, drive: [{ prop: 'rgbShift', from: 'kick', min: 1, max: 12 }], children: [{ type: 'Plasma', props: { colorA: '#ff2d6f', colorB: '#0a0414' } }] }] }, rationale: 'Rain on a cracked screen.' };
  const model: LookModel = async (system, user) => {
    calls.push({ system, user });
    if (system.includes('Rebellious')) return calls.filter(c => c.system.includes('Rebellious')).length === 1 ? '```json\n{"look":{"name":"bad","root":[{"type":"MadeUp"}]}}\n```' : JSON.stringify(good);
    return JSON.stringify({ look: { name: 'Calm', root: [{ type: 'Marble', props: { scale: 2 } }] }, rationale: 'steady' });
  };
  const rebel = await proposeLook('REBEL', brief, { model });
  assert.equal(rebel.source, 'ai');
  assert.equal(rebel.look.name, 'Neon Rain');
  assert.equal(rebel.rationale, 'Rain on a cracked screen.');
  const repair = calls.filter(c => c.system.includes('Rebellious'))[1];
  assert.match(repair.user, /MadeUp/, 'repair turn quotes the exact rejection');
  assert.match(calls[0].system, /Glitch\*/, 'prompt is grounded in the real catalog');
});

test('a model that never behaves still yields the director\'s house look (the room never goes quiet)', async () => {
  const p = await proposeLook('FUTURIST', brief, { model: async () => 'sorry, I cannot do that' });
  assert.equal(p.source, 'local');
  assert.ok(validateLook(p.look).look);
  const t = await proposeLook('FUTURIST', brief, { model: async () => { throw new Error('network'); } });
  assert.equal(t.source, 'local');
});

test('a model that uses the cover when there is none is treated as a rejection', async () => {
  const withCover = JSON.stringify({ look: { name: 'x', root: [{ type: 'Duotone', children: [{ type: 'ImageTexture', props: { url: COVER_TOKEN } }] }] } });
  const p = await proposeLook('CLASSICAL', { ...brief, hasCover: false }, { model: async () => withCover });
  assert.ok(!p.look.needsCover);
  assert.equal(p.source, 'local');
});

test('synthesis keeps both voices (counterpoint filter wraps the lead) and respects the budget', () => {
  const lead = { directorId: 'FUTURIST' as const, look: HOUSE_LOOKS.find(l => l.id === 'cell-lattice')!, rationale: '', source: 'local' as const, issues: [] };
  const counter = { directorId: 'REBEL' as const, look: HOUSE_LOOKS.find(l => l.id === 'signal-glitch')!, rationale: '', source: 'local' as const, issues: [] };
  const s = synthesise(lead, counter);
  assert.equal(s.look.root[0].type, 'Glitch', 'the counterpoint filter is outermost');
  assert.equal(s.look.root[0].children![0].type, 'Voronoi', 'the lead picture is intact underneath');
  assert.equal(validateLook(s.look).issues.length, 0);
  assert.match(s.note, /Neither averaged/);
  assert.equal(synthesise(lead, null).counterpoint, null);
});

test('lead choice: genre beats energy; always someone present', () => {
  const all = [...COUNCIL_DIRECTOR_IDS];
  assert.equal(chooseLead({ hasCover: true, track: { genre: 'Gospel choir' } }, all), 'BAROQUE');
  assert.equal(chooseLead({ hasCover: true, track: { genre: 'Techno' } }, all), 'FUTURIST');
  assert.equal(chooseLead({ hasCover: true, energy: 0.9 }, all), 'REBEL');
  assert.equal(chooseLead({ hasCover: true, energy: 0.1 }, ['BAROQUE']), 'BAROQUE');
  assert.ok(localLook('WORLD_ECLECTIC', brief).director === 'WORLD_ECLECTIC');
});

test('effects seen rendering BLANK over the cover are kept out of look output', () => {
  const COVER = { type: 'ImageTexture', props: { url: COVER_TOKEN } };
  for (const bad of ['FlutedGlass', 'VHS']) {
    const v = validateLook({ name: 'x', root: [{ type: bad, children: [COVER] }] });
    assert.equal(v.look, null, `${bad} over the cover must be rejected`);
    assert.ok(v.issues.some(i => /renders blank/.test(i)));
    // …but they are fine over a generator
    assert.ok(validateLook({ name: 'x', root: [{ type: bad, children: [{ type: 'Plasma' }] }] }).look, `${bad} over Plasma is fine`);
  }
  assert.ok(HOUSE_LOOKS.filter(l => l.needsCover).length >= 7);
});

test('copy: no model reply is silent; an invalid reply says the editor rejected it', async () => {
  const none = await proposeLook('CLASSICAL', brief, { model: async () => null });
  assert.doesNotMatch(none.rationale, /editor|could not/);
  const bad = await proposeLook('CLASSICAL', brief, { model: async () => 'not json at all' });
  assert.match(bad.rationale, /did not pass the editor/);
});
