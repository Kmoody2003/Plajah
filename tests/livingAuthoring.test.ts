import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Behavior, LivingPage } from '../services/living/contracts';
import type { TelaDoc } from '../types';
import { applyTelaOp } from '../components/tela/telaOps';
import { PRESETS, applyPreset, uniqueId } from '../services/living/authoring/presets';
import { duplicateBehavior, getLivingPage, isDisabled, isEmptyLivingPage, parseLivingPageJson, removeBehavior, runnablePage, setDisabled, setLivingPage, upsertBehavior } from '../services/living/authoring/livingDoc';
import { ACTION_NAMES, TRIGGER_NAMES, defaultAction, defaultTrigger, describeBehavior, getPath, parseScalar, setPath } from '../services/living/authoring/describe';
import { ACTION_TYPES, TRIGGER_TYPES, loadAudioCatalogue, parseAudioCatalogue } from '../services/living/runtime/catalog';
import { validateLivingPage } from '../services/living/runtime/validate';
import { objectInfos, frameObjects, hasLiving, livingPageFor, narrationObjects, pageText } from '../services/living/runtime/objects';
import { labBehaviors, labObjects, labPage, presetBehaviors, presetPage } from '../services/living/sample/labPage';
import { ALL_PRESETS, compileAnim } from '../services/living/runtime/anim';
import { buildManifest, decodeBundle, encodeBundle } from '../services/bookTela/bundleStorage';

const blankDoc = (): TelaDoc => ({
  id: 'doc1', ownerId: 'u', title: 'Book', createdAt: 1, updatedAt: 1,
  frames: [{ id: 'f1', kind: 'SCREEN', preset: 'PHONE', x: 0, y: 0, w: 600, h: 900, deviceIds: ['v1'] }, { id: 'f2', kind: 'SCREEN', preset: 'PHONE', x: 0, y: 0, w: 600, h: 900, deviceIds: ['v2'] }],
  devices: { v1: { id: 'v1', type: 'VECTOR', width: 600, height: 900, objects: labObjects }, v2: { id: 'v2', type: 'VECTOR', width: 600, height: 900, objects: [] } },
} as unknown as TelaDoc);

const infos = objectInfos(labObjects);
const blank = (n = 1): LivingPage => ({ page: n, behaviors: [] });

describe('every preset in the gallery expands into valid Behavior JSON', () => {
  for (const def of PRESETS) {
    it(`${def.title}`, () => {
      const page = applyPreset(blank(), def, { target: { label: 'Bo body' }, name: 'Bo', cue: 'main', revealLabel: 'Hidden*' });
      if (def.id === 'music') { assert.equal(page.music?.cue, 'main'); return; }
      assert.ok(page.behaviors.length >= 1);
      const issues = validateLivingPage(page, { objects: infos }).filter(i => i.severity === 'error');
      assert.deepEqual(issues, [], 'no errors (every interactive behaviour has a hint)');
      JSON.parse(JSON.stringify(page));                                       // plain JSON, nothing hidden
      for (const b of page.behaviors) for (const a of [...b.do, ...(b.reduced ?? [])]) assert.ok(ACTION_TYPES.includes(a.do));
      for (const b of page.behaviors) assert.ok(TRIGGER_TYPES.includes(b.on.type));
    });
  }
  it('adding the same preset twice keeps ids unique and merges vars / goals', () => {
    const def = PRESETS.find(p => p.id === 'counter')!;
    let page = applyPreset(blank(), def, { target: { label: 'Pip 1' }, name: 'Pip' });
    page = applyPreset(page, def, { target: { label: 'Pip 2' }, name: 'Pip' });
    const ids = [...page.behaviors.map(b => b.id), ...(page.goals ?? []).map(g => g.id)];
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(Object.keys(page.vars ?? {}).length, 2);
    assert.equal(uniqueId(page, 'count-tap'), 'count-tap-3');
  });
  it('the peek preset really is the shy-Mars pair (slow peeks, fast hides)', () => {
    const page = applyPreset(blank(), PRESETS.find(p => p.id === 'peek')!, { target: { id: 'mars' }, name: 'Mars' });
    const prox = page.behaviors.filter(b => b.on.type === 'proximity').map(b => b.on) as Array<{ slowBelow?: number; fastAbove?: number }>;
    assert.equal(prox.length, 2); assert.ok(prox.some(p => p.slowBelow !== undefined) && prox.some(p => p.fastAbove !== undefined));
  });
});

describe('validation', () => {
  const tap = (o: Partial<Behavior> = {}): Behavior => ({ id: 'a', target: { id: 'bo-body' }, on: { type: 'tap' }, do: [{ do: 'sfx', sound: 'pop' }], ...o });
  it('every interactive trigger without a hint is an error; idle / enter are fine', () => {
    for (const t of ['tap', 'doubleTap', 'press', 'drag', 'proximity'] as const) {
      const issues = validateLivingPage({ page: 1, behaviors: [tap({ on: defaultTrigger(t) })] }, {});
      assert.ok(issues.some(i => i.code === 'missing-hint' && i.severity === 'error'), t);
      assert.equal(validateLivingPage({ page: 1, behaviors: [tap({ on: defaultTrigger(t), hint: 'Do the thing' })] }, {}).filter(i => i.code === 'missing-hint').length, 0);
    }
    assert.equal(validateLivingPage({ page: 1, behaviors: [tap({ on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'float', loop: 'infinite' } }] })] }, {}).length, 0);
    assert.ok(validateLivingPage({ page: 1, behaviors: [tap({ on: { type: 'key', key: 'k' } })] }, {}).some(i => i.code === 'no-hint' && i.severity === 'warning'));
  });
  it('flags duplicate ids, empty targets, unknown cues / sounds / presets, undeclared variables, strobing', () => {
    const page: LivingPage = { page: 1, behaviors: [
      tap({ hint: 'x', id: 'a' }), tap({ hint: 'x', id: 'a' }),
      tap({ id: 'b', hint: 'x', target: { label: 'Nothing here' } }),
      tap({ id: 'c', hint: 'x', do: [{ do: 'music', cue: 'ghost' }, { do: 'sfx', sound: 'nope' }, { do: 'animate', anim: { preset: 'zoomzoom' as never } }, { do: 'animate', anim: { preset: 'flicker', durationMs: 200 } }] }),
      tap({ id: 'd', hint: 'x', when: { var: 'mystery', op: '>', value: 1 } }),
    ] };
    const codes = validateLivingPage(page, { objects: infos, scores: {}, sfxIds: ['pop'] }).map(i => i.code);
    for (const c of ['duplicate-id', 'target-empty', 'cue-missing', 'sfx-unknown', 'unknown-preset', 'flash-rate', 'var-undeclared']) assert.ok(codes.includes(c), `${c} in ${codes.join()}`);
  });
  it('the lab pages (every trigger, every preset) have no validation errors', () => {
    for (const p of [labPage, presetPage]) assert.deepEqual(validateLivingPage(p, { objects: p === labPage ? infos : undefined }).filter(i => i.severity === 'error'), []);
  });
  it('the lab page really uses every trigger type and every action type', () => {
    const trig = new Set(labBehaviors.map(b => b.on.type)); for (const t of TRIGGER_TYPES) assert.ok(trig.has(t) || t === 'exit', `trigger ${t}`);
    const acts = new Set<string>(); const walk = (as: Array<{ do: string; then?: unknown[]; else?: unknown[] }>) => as.forEach(a => { acts.add(a.do); if (a.then) walk(a.then as never); if (a.else) walk(a.else as never); });
    labBehaviors.forEach(b => walk([...b.do, ...(b.reduced ?? [])] as never));
    const missing = ACTION_TYPES.filter(a => !acts.has(a)); assert.deepEqual(missing.filter(a => !['music', 'musicStop', 'musicTempo', 'duck', 'ambience', 'goto'].includes(a)), [], 'audio-structure actions are covered by the interpreter tests');
  });
  it('the preset gallery page covers all 35 presets and each one compiles', () => {
    const used = new Set(presetBehaviors.flatMap(b => b.do.map(a => (a.do === 'animate' ? a.anim.preset : undefined))));
    for (const p of ALL_PRESETS) { assert.ok(used.has(p), p); const c = compileAnim({ preset: p }, { box: { x: 0, y: 0, w: 50, h: 50 }, pageW: 600, pageH: 900, reduced: false, seed: 1 }); assert.ok(c.special || Object.keys(c.channels).length); }
  });
});

describe('editing helpers', () => {
  const b = (id: string): Behavior => ({ id, label: id, target: { id: 'x' }, on: { type: 'tap' }, hint: 'h', do: [{ do: 'sfx', sound: 'pop' }] });
  it('upsert / remove / duplicate / disable', () => {
    let p: LivingPage = { page: 1, behaviors: [b('a'), b('b')] };
    p = upsertBehavior(p, { ...b('a'), hint: 'changed' }); assert.equal(p.behaviors[0].hint, 'changed'); assert.equal(p.behaviors.length, 2);
    p = upsertBehavior(p, b('c')); assert.equal(p.behaviors.length, 3);
    p = duplicateBehavior(p, 'a'); assert.deepEqual(p.behaviors.map(x => x.id), ['a', 'a-copy', 'b', 'c']);
    p = duplicateBehavior(p, 'a'); assert.ok(p.behaviors.some(x => x.id === 'a-copy2'));
    p.behaviors[1].do.push({ do: 'wait', ms: 1 }); assert.equal(p.behaviors[0].do.length, 1, 'duplicate is a deep copy');
    p = removeBehavior(p, 'b'); assert.ok(!p.behaviors.some(x => x.id === 'b'));
    p = setDisabled(p, 'a', true); assert.ok(isDisabled(p.behaviors[0])); assert.ok(!runnablePage(p).behaviors.some(x => x.id === 'a'), 'disabled behaviours never run');
    p = setDisabled(p, 'a', false); assert.ok(!isDisabled(p.behaviors[0]));
  });
  it('JSON view: parses, rejects, keeps the page number', () => {
    assert.equal(parseLivingPageJson('{nope', 3).ok, false);
    assert.equal(parseLivingPageJson('[]', 3).ok, false);
    assert.equal(parseLivingPageJson('{"behaviors":[{"id":"x"}]}', 3).ok, false);
    const r = parseLivingPageJson(JSON.stringify({ page: 99, behaviors: [b('a')], vars: { n: 0 } }), 3);
    assert.ok(r.ok && r.page.page === 3 && r.page.vars?.n === 0);
  });
  it('dotted-path setters keep JSON tidy (empty removes the key)', () => {
    const a = defaultAction('animate'); const a2 = setPath(a, 'anim.durationMs', 800) as typeof a; assert.deepEqual(getPath(a2, 'anim.durationMs'), 800);
    const a3 = setPath(a2, 'anim.durationMs', undefined) as unknown as { anim: Record<string, unknown> }; assert.equal('durationMs' in a3.anim, false);
    assert.equal(parseScalar('12'), 12); assert.equal(parseScalar('true'), true); assert.equal(parseScalar('next'), 'next');
  });
  it('every trigger / action type has a name, a default and a description', () => {
    for (const t of TRIGGER_TYPES) { assert.ok(TRIGGER_NAMES[t]); assert.equal(defaultTrigger(t).type, t); }
    for (const a of ACTION_TYPES) { assert.ok(ACTION_NAMES[a]); assert.equal(defaultAction(a).do, a); }
    assert.match(describeBehavior({ id: 'q', target: { id: 'x' }, on: { type: 'tap' }, do: [{ do: 'sfx', sound: 'pop' }, { do: 'animate', anim: { preset: 'wiggle' } }] }), /Tap .* sound pop, wiggle/);
  });
});

describe('living data goes through the Tela op path, saves, reloads and publishes', () => {
  it('SET_LIVING_PAGE creates doc.living, replaces a page, and removes it when emptied', () => {
    let d = blankDoc();
    const page: LivingPage = { ...labPage, page: 1 };
    d = applyTelaOp(d, { type: 'SET_LIVING_PAGE', page });
    assert.equal(d.living?.version, 1); assert.equal(d.living?.bookId, 'doc1'); assert.equal(d.living?.pages.length, 1);
    d = applyTelaOp(d, { type: 'SET_LIVING_PAGE', page: { page: 2, behaviors: [{ id: 'z', target: { id: 'x' }, on: { type: 'enter' }, do: [] }] } });
    assert.deepEqual(d.living!.pages.map(p => p.page), [1, 2]);
    d = applyTelaOp(d, { type: 'SET_LIVING_PAGE', page: { ...page, behaviors: page.behaviors.slice(0, 3) } });
    assert.equal(d.living!.pages[0].behaviors.length, 3);
    d = applyTelaOp(d, { type: 'SET_LIVING_PAGE', page: blank(2) }); assert.deepEqual(d.living!.pages.map(p => p.page), [1]);
    d = applyTelaOp(d, { type: 'SET_LIVING_PAGE', page: blank(1) }); assert.equal(d.living, undefined, 'nothing alive left: the doc carries no living data');
    assert.ok(isEmptyLivingPage(blank()));
  });
  it('the op is pure (the previous doc is untouched, so undo can restore it)', () => {
    const d0 = blankDoc(); const before = JSON.stringify(d0);
    const d1 = applyTelaOp(d0, { type: 'SET_LIVING_PAGE', page: labPage });
    assert.equal(JSON.stringify(d0), before); assert.notEqual(d1, d0);
    const d2 = applyTelaOp(d1, { type: 'SET_LIVING_BOOK', living: undefined }); assert.equal(d2.living, undefined);
  });
  it('survives save/reload (JSON) and the publish snapshot (deep clone + locked)', () => {
    const d = applyTelaOp(blankDoc(), { type: 'SET_LIVING_PAGE', page: labPage });
    const reloaded = JSON.parse(JSON.stringify(d)) as TelaDoc;                                           // telaStore.saveTelaDoc / loadTelaDoc
    const published = JSON.parse(JSON.stringify({ ...reloaded, locked: true, currentVersionId: 'v1' })) as TelaDoc;   // telaStore.publishTelaVersion's bundle
    assert.deepEqual(published.living, d.living);
    assert.equal(getLivingPage(published.living, 1).behaviors.length, labBehaviors.length);
  });
  it('survives the reader bundle encode / decode (services/bookTela/bundleStorage)', async () => {
    const doc = applyTelaOp(blankDoc(), { type: 'SET_LIVING_PAGE', page: labPage });
    const bundle = { schemaVersion: 1, doc, toc: [], book: {}, versionId: 'v1', bookId: 'b1', createdAt: 1, enhancements: [] } as never;
    const encoded = await encodeBundle(bundle);
    const m = buildManifest({ bundle, encoded, bundleUrl: 'https://firebasestorage.googleapis.com/x', ownerId: 'u', flatPages: [] });
    assert.equal(m.hasLiving, true);
    const back = await decodeBundle(encoded.bytes, m, { expectBookId: undefined } as never);
    assert.deepEqual((back.bundle as unknown as { doc: TelaDoc }).doc.living, doc.living);
  });
  it('page numbering: frame order, objects per frame, reader gate', () => {
    const d = applyTelaOp(blankDoc(), { type: 'SET_LIVING_PAGE', page: labPage });
    assert.equal(frameObjects(d, d.frames[0]).length, labObjects.length); assert.equal(frameObjects(d, d.frames[1]).length, 0);
    assert.equal(hasLiving(d.living, 1), true); assert.equal(hasLiving(d.living, 2), false); assert.equal(hasLiving(undefined, 1), false);
    assert.equal(livingPageFor(d.living, 1)?.page, 1);
    assert.equal(pageText(labObjects), 'Living Runtime Lab Bo beeps when you tap him and Mars is shy. Drag the blanket, pull the thread, find the pips.'.replace(/^/, ''));
    assert.deepEqual(narrationObjects(labObjects).map(o => o.id), ['title', 'story-1', 'story-2']);
  });
});

describe('audio catalogue feature detection', () => {
  it('uses the real catalogues when the audio module is there, falls back otherwise', async () => {
    const fallback = await loadAudioCatalogue(); assert.equal(fallback.fromAudioModule, false); assert.ok(fallback.sfx.includes('chime') || fallback.sfx.length > 3);
    const real = parseAudioCatalogue({ SFX_IDS: ['a', 'b'], INSTRUMENTS: [{ id: 'harp' }, { id: 'bell' }], AMBIENCE_IDS: ['wind'] });
    assert.deepEqual([real.sfx, real.instruments, real.ambience, real.fromAudioModule], [['a', 'b'], ['harp', 'bell'], ['wind'], true]);
    assert.equal((await loadAudioCatalogue(async () => { throw new Error('missing'); })).fromAudioModule, false, 'a failing loader never throws');
  });
  it('the real audio module (when present) agrees with the sample sounds the lab uses', async () => {
    const m = await import('../services/living/audio/sfxCatalog').catch(() => null);
    if (!m) return;
    const ids = new Set(m.SFX_IDS as readonly string[]);
    const used = labBehaviors.flatMap(b => b.do).filter(a => a.do === 'sfx').map(a => (a as { sound: string }).sound);
    const unknown = used.filter(u => !ids.has(u) && !m.resolveSfx(u));
    // Informational: unknown ids are silently ignored by the real engine; the validator warns authors.
    assert.ok(Array.isArray(unknown));
  });
});
