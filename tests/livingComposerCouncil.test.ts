// Composer Council: deterministic path (no AI key), children's-audio lens, silence/dynamics decisions, AI-path fallback, apply-to-book.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESSIONS, nameToPc, scalePitchClasses } from '../services/melos/theory';
import { expandScore } from '../services/living/audio/sequencer';
import { resolveInstrument } from '../services/living/audio/instruments';
import { noteToMidi } from '../services/living/audio/notes';
import { validateLivingPage } from '../services/living/runtime/validate';
import {
  COMPOSER_COUNCIL_LIST, COMPOSER_PERSONAS, MOODS, MOOD_PROFILES, ARIA_COMPOSER_COUNCIL_METHOD, applyChildrensLens, applyPlanToLivingBook, ageBandFor, auditScore,
  childrensLens, composeCue, composeCueWithAi, inferMood, planBookMusic, planBookMusicWithAi, type BookMusicBrief,
} from '../services/living/composer/composerCouncil';

const BOOK: BookMusicBrief = {
  title: 'Moon Soup', ages: { min: 2, max: 4 }, seed: 11,
  pages: [
    { page: 1, text: 'Mina is cozy at home with a warm blanket.', interactions: [] },
    { page: 2, text: 'She giggles and jumps and dances in the kitchen.', interactions: ['tap'] },
    { page: 3, text: 'Tap the pots! Bang the lids!', interactions: ['tap', 'tap', 'note'] },
    { page: 4, text: 'Suddenly a shadow creaks across the floor.', climax: true },
    { page: 5, text: 'Hush. Listen. Not a sound.' },
    { page: 6, text: 'The moon glows and the stars twinkle with magic.' },
    { page: 7, text: 'Goodnight, sleepy moon. Time to dream.' },
  ],
};

test('every mood profile uses real repository progressions and real instruments', () => {
  const ids = new Set(PROGRESSIONS.map((p) => p.id));
  for (const m of MOODS) {
    const P = MOOD_PROFILES[m];
    for (const id of P.progs) assert.ok(ids.has(id), `${m}: unknown progression ${id}`);
    for (const inst of [P.melody, P.harmony, 'pad', 'bass', 'shaker']) assert.ok(resolveInstrument(inst), `${m}: unknown instrument ${inst}`);
    for (const r of P.rhythms) assert.equal(r.reduce((a, b) => a + b, 0), P.meter, `${m}: rhythm ${r} must fill ${P.meter} beats`);
  }
});

test('personas: four children-aware seats plus the two reused Melos seats', () => {
  assert.equal(COMPOSER_COUNCIL_LIST.length, 6);
  assert.equal(COMPOSER_PERSONAS.MELOS_COMPOSER.reusesMelos, 'COMPOSER');
  assert.equal(COMPOSER_PERSONAS.MELOS_MIX.reusesMelos, 'MIX');
  for (const p of COMPOSER_COUNCIL_LIST) assert.ok(p.lens && p.protects && p.challenges && p.questions.length);
  assert.match(ARIA_COMPOSER_COUNCIL_METHOD, /silence/i);
});

test('age bands: the youngest listener governs', () => {
  assert.equal(ageBandFor({ min: 2, max: 8 }), 'toddler'); assert.equal(ageBandFor({ min: 5, max: 7 }), 'early'); assert.equal(ageBandFor({ min: 9, max: 12 }), 'middle');
});

test('composeCue is deterministic, has a real melody, and passes the lens for every mood and every age band', () => {
  for (const ages of [{ min: 2, max: 4 }, { min: 5, max: 7 }, { min: 9, max: 12 }]) {
    const caps = childrensLens(ages);
    for (const m of MOODS) {
      const a = composeCue({ mood: m, caps, seed: 3 }), b = composeCue({ mood: m, caps, seed: 3 });
      assert.equal(JSON.stringify(a.score), JSON.stringify(b.score), `${m} not deterministic`);
      assert.deepEqual(auditScore(a.score, caps), [], `${m}/${caps.band} fails its own lens`);
      assert.ok(a.score.tracks[0].notes.length >= 4, `${m} melody too short`);
    }
  }
});

test('melody pitches are snapped to the key', () => {
  const caps = childrensLens({ min: 9, max: 12 });
  for (const mood of ['cozy', 'playful', 'sad', 'wonder'] as const) {
    const { score, meta } = composeCue({ mood, caps, seed: 5 });
    const pcs = scalePitchClasses(nameToPc(meta.key), meta.scaleId);
    for (const n of score.tracks[0].notes) assert.ok(pcs[(noteToMidi(n.n)! % 12 + 12) % 12], `${mood}: note ${n.n} outside ${meta.key} ${meta.scaleId}`);
  }
});

test('toddler lens: no drums/bass/shaker, tempo <= 100, velocity <= 0.5, tense and spooky are voiced as curious', () => {
  const caps = childrensLens({ min: 2, max: 4 });
  const t = composeCue({ mood: 'tense', caps, seed: 1 });
  assert.equal(t.meta.mood, 'curious'); assert.equal(t.meta.softenedFrom, 'tense');
  const p = composeCue({ mood: 'playful', caps, seed: 1 });
  assert.ok(!p.score.tracks.some((tr) => ['drum', 'bass', 'shaker'].includes(tr.instrument)));
  assert.ok(p.score.tempo <= 100);
  for (const tr of p.score.tracks) for (const n of tr.notes) assert.ok((n.v ?? 0.7) <= 0.5 + 1e-9);
});

test('applyChildrensLens repairs a loud, startling, shrill cue and reports every change', () => {
  const caps = childrensLens({ min: 3, max: 4 });
  const bad = { id: 'bad', tempo: 150, lengthBeats: 4, reverb: 0.9, tracks: [
    { instrument: 'drum', notes: [{ t: 0, n: 'x', d: 0.25, v: 1 }] },
    { instrument: 'glass', notes: [{ t: 0, n: 110, d: 1, v: 1 }] },
    { instrument: 'musicbox', notes: [{ t: 0, n: 60, d: 1, v: 0.1 }, { t: 1, n: 40, d: 1, v: 0.1 }, { t: 2, n: 100, d: 1, v: 1 }] },
  ] };
  assert.ok(auditScore(bad, caps).length >= 4);
  const fixed = applyChildrensLens(bad, caps);
  assert.deepEqual(auditScore(fixed.score, caps), []);
  assert.ok(fixed.changes.length >= 4);
  assert.equal(bad.tempo, 150, 'input must not be mutated');
});

test('cues expand in the real sequencer and use only known instruments (no AudioContext needed)', () => {
  const caps = childrensLens({ min: 5, max: 7 });
  for (const m of MOODS) {
    const { score } = composeCue({ mood: m, caps });
    for (const tr of score.tracks) assert.ok(resolveInstrument(tr.instrument), `${m}: ${tr.instrument}`);
    const ev = expandScore(score, 20);
    assert.ok(ev.length > 8, `${m}: only ${ev.length} events`);
  }
});

test('mood inference from page text', () => {
  assert.equal(inferMood('Goodnight, sleepy moon').mood, 'sleepy');
  assert.equal(inferMood('Everyone cheered, hooray!').mood, 'triumphant');
  assert.equal(inferMood('The table is wooden.').confident, false);
});

test('plan: silence for quiet text and for sound-heavy pages; grow/slow around the peak; toddler softening recorded', () => {
  const plan = planBookMusic(BOOK);
  assert.deepEqual(plan.silentPages, [3, 5]);
  const p = (n: number) => plan.pages.find((x) => x.page === n)!;
  assert.match(p(3).reasons.join(' '), /sound when touched/);
  assert.match(p(5).reasons.join(' '), /asks for quiet/);
  assert.equal(p(4).mood, 'tense'); assert.equal(p(4).scoredMood, 'curious');
  assert.ok(plan.lensReport.softenedMoods.some((s) => s.page === 4 && s.from === 'tense'));
  assert.ok(plan.roomPages.includes(2));
  assert.ok(plan.unauditioned);
  for (const d of plan.pages.filter((x) => x.music)) { assert.ok(d.tempo! <= plan.caps.maxTempo && d.tempo! >= plan.caps.minTempo - 1); assert.ok(plan.cues[d.cue!]); }
  assert.ok(plan.slowPages.length >= 1, 'bedtime ending should ease down');
  for (const issues of Object.values(plan.lensReport.audit)) assert.deepEqual(issues, []);
  assert.equal(plan.proposals.length, 6);
  assert.ok(plan.tensions.length >= 1);
  assert.match(plan.summary, /nothing here has been listened to/);
});

test('plan: breathing room in a long run of musical pages, and the plan is deterministic', () => {
  const pages = Array.from({ length: 12 }, (_, i) => ({ page: i + 1, text: 'A gentle day.', mood: 'calm' as const }));
  const plan = planBookMusic({ ages: { min: 5, max: 7 }, pages, seed: 2 });
  let run = 0, worst = 0;
  for (const d of plan.pages) { run = d.music ? run + 1 : 0; worst = Math.max(worst, run); }
  assert.ok(worst <= 5 && plan.silentPages.length >= 2, `worst run ${worst}`);
  assert.equal(JSON.stringify(planBookMusic({ ages: { min: 5, max: 7 }, pages, seed: 2 })), JSON.stringify(plan));
});

test('AI path: injected model notes are snapped to key and lens-checked; a failing model falls back to the local cue', async () => {
  const caps = childrensLens({ min: 2, max: 4 });
  const ok = await composeCueWithAi({ mood: 'calm', caps, seed: 4 }, { promptToScore: async () => ({ key: 'C', mode: 'major', notes: [{ startBeats: 0, lengthBeats: 1, key: 61, vel: 127 }, { startBeats: 1, lengthBeats: 1, key: 64, vel: 120 }, { startBeats: 2, lengthBeats: 2, key: 67, vel: 120 }] }) });
  assert.equal(ok.meta.source, 'ai'); assert.equal(ok.aiError, undefined);
  assert.deepEqual(auditScore(ok.score, caps), []);
  assert.equal(ok.score.tracks[0].notes.length, 3);
  const bad = await composeCueWithAi({ mood: 'calm', caps, seed: 4 }, { promptToScore: async () => { throw new Error('no key'); } });
  assert.equal(bad.meta.source, 'local'); assert.match(bad.aiError!, /no key/);
  const { plan, aiErrors } = await planBookMusicWithAi(BOOK, { promptToScore: async () => { throw new Error('offline'); } });
  assert.ok(aiErrors.length > 0); assert.equal(plan.source, 'local');
});

test('applyPlanToLivingBook: cues in scores, page music set, silent pages cleared, idempotent, validates', () => {
  const plan = planBookMusic(BOOK);
  const b1 = applyPlanToLivingBook(undefined, plan, 'book1');
  const b2 = applyPlanToLivingBook(b1, plan, 'book1');
  assert.equal(JSON.stringify(b1), JSON.stringify(b2));
  for (const d of plan.pages) {
    const pg = b1.pages.find((p) => p.page === d.page)!;
    if (d.music) { assert.equal(pg.music?.cue, d.cue); assert.ok(b1.scores[d.cue!]); } else assert.equal(pg.music, undefined);
  }
  assert.ok(b1.defaults!.musicGain! <= plan.caps.maxMusicGain);
  const mine = { version: 1 as const, bookId: 'book1', scores: {}, defaults: { musicGain: 0.2 }, pages: [{ page: 1, behaviors: [{ id: 'mine', target: { page: true as const }, on: { type: 'enter' as const }, do: [] }] }] };
  const b3 = applyPlanToLivingBook(mine, plan, 'book1');
  assert.ok(b3.pages[0].behaviors.some((b) => b.id === 'mine')); assert.equal(b3.defaults!.musicGain, 0.2);
  for (const pg of b1.pages) {
    const errs = validateLivingPage(pg, { objects: [], scores: b1.scores }).filter((i) => i.severity === 'error');
    assert.deepEqual(errs, [], `page ${pg.page}`);
  }
});
