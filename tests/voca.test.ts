import test from 'node:test';
import assert from 'node:assert/strict';
import { VOCA_PASSAGES, VOCA_LEVELS, passagesForLevel } from '../data/vocaPassages';
import { checkPassageSafety } from '../services/voca/vocaContentSafety';
import { createAlign, feedWord, summarize, wordsMatch, splitPassage, syllabify, markHelped, judge, moveOn } from '../services/voca/vocaAlign';
import { applySession, defaultProgress, decideLevel, dueReview, reviewResult, nextPassage, type VocaSession } from '../services/voca/vocaProgress';
import { STANDARDS } from '../data/educationStandards';

// ------------------------------------------------------------------ content
test('every passage passes the content-safety gate for its level', () => {
  for (const p of VOCA_PASSAGES) {
    const r = checkPassageSafety(p.text + ' ' + p.question.prompt + ' ' + p.question.choices.join(' '), p.level, p.kind);
    assert.ok(r.ok, `${p.id}: ${JSON.stringify(r.problems)}`);
  }
});

test('the safety gate rejects unsafe text and confines mature themes to high-school texts', () => {
  assert.equal(checkPassageSafety('The bear drank beer.', 4).ok, false);
  assert.equal(checkPassageSafety('He wanted to kill the bug.', 6).ok, false);
  assert.equal(checkPassageSafety('The soldiers fought in the war.', 5).ok, false);
  assert.equal(checkPassageSafety('The soldiers fought in the war.', 10, 'speech').ok, true);
  // whole-word matching: innocent words containing blocked substrings pass
  assert.equal(checkPassageSafety('The class sat on the grass to assess the grapes. High notes.', 3).ok, true);
});

test('every level has passages, sizes grow with level, and each passage has a valid question + source', () => {
  for (const L of VOCA_LEVELS) assert.ok(passagesForLevel(L.level).length >= 3, `level ${L.level}`);
  const avg = (l: number) => passagesForLevel(l).reduce((a, p) => a + splitPassage(p.text).length, 0) / passagesForLevel(l).length;
  for (let l = 2; l <= 10; l++) assert.ok(avg(l) >= avg(l - 1), `level ${l} avg ${avg(l)} < level ${l - 1} avg ${avg(l - 1)}`);
  for (const p of VOCA_PASSAGES) {
    assert.ok(p.source.length > 3, p.id);
    assert.ok([0, 1, 2].includes(p.question.answer), p.id);
    assert.equal(new Set(p.question.choices).size, 3, p.id);
  }
  assert.equal(new Set(VOCA_PASSAGES.map(p => p.id)).size, VOCA_PASSAGES.length, 'unique ids');
});

test('every level maps to a standard in the standards graph', () => {
  const ids = new Set(STANDARDS.map(s => s.id));
  for (const L of VOCA_LEVELS) assert.ok(ids.has(L.standardId), L.standardId);
});

// ------------------------------------------------------------------ matching
test('matching forgives recogniser artefacts, not reading errors', () => {
  assert.ok(wordsMatch('their', 'there', 6));
  assert.ok(wordsMatch('two', 'to', 6));
  assert.ok(wordsMatch('1903', '1903', 7));
  assert.ok(wordsMatch('digs', 'dig', 2), 'beginners get ending slips');
  assert.ok(!wordsMatch('digs', 'dig', 7), 'older readers do not');
  assert.ok(!wordsMatch('cat', 'cut', 2));
  assert.ok(wordsMatch('traveler', 'traveller', 6));
});

test('hyphenated compounds split into two readable words', () => {
  assert.deepEqual(splitPassage('a light-sensitive square'), ['a', 'light-', 'sensitive', 'square']);
});

// ------------------------------------------------------------------ alignment
const read = (text: string, heard: string[], level = 4) => {
  const s = createAlign(text, level); let t = 1000;
  const events = heard.flatMap(h => feedWord(s, h, [], (t += 400)));
  return { s, events };
};

test('a clean read marks every word good and finishes', () => {
  const { s, events } = read('The cat can run.', ['the', 'cat', 'can', 'run']);
  assert.equal(s.i, 4);
  assert.ok(events.some(e => e.type === 'done'));
  assert.equal(summarize(s).accuracy, 1);
});

test('noise and other voices never mark a word wrong', () => {
  const { s } = read('The cat can run.', ['the', 'um', 'banana', 'zebra', 'cat', 'can', 'run']);
  assert.equal(s.words.filter(w => w.status !== 'good').length, 0);
  assert.equal(s.noise, 3);
});

test('re-reading is never penalised', () => {
  const { s } = read('The big dog ran home.', ['the', 'big', 'dog', 'big', 'dog', 'ran', 'home']);
  assert.equal(summarize(s).accuracy, 1);
});

test('a dropped function word is inferred; a skipped content word is a miss', () => {
  const { s } = read('The big dog ran home.', ['big', 'dog', 'home']);
  assert.equal(s.words[0].status, 'good'); assert.ok(s.words[0].inferred);
  assert.equal(s.words[3].status, 'miss');
});

test('the coaching ladder climbs on plausible attempts, then a correct read is a comeback', () => {
  const s = createAlign('An enormous paw.', 6);
  feedWord(s, 'an');
  const e1 = feedWord(s, 'enormus'); assert.deepEqual(e1[0], { type: 'attempt', index: 1, attempt: 1 });
  const e2 = feedWord(s, 'enorm'); assert.equal((e2[0] as any).attempt, 2);
  markHelped(s);
  const e3 = feedWord(s, 'enormous'); assert.deepEqual(e3[0], { type: 'good', index: 1, comeback: true });
  const sum = summarize(s);
  assert.deepEqual(sum.comebacks, ['enormous']);
  assert.ok(sum.practice.includes('enormous'));
});

test('after four tries the word is coached and the reader moves on', () => {
  const s = createAlign('A volcano erupts.', 7);
  feedWord(s, 'a');
  for (const h of ['vol', 'volcan', 'volca', 'vulcano']) feedWord(s, h);
  assert.equal(s.words[1].status, 'coached'); assert.equal(s.i, 2);
});

test('listener mode and move-on work without audio', () => {
  const s = createAlign('Pip can dig.', 2);
  judge(s, true); judge(s, false); judge(s, true); moveOn(s);
  assert.equal(s.i, 3); assert.ok(s.endedAt !== null);
});

test('WCPM is correct words per minute of reading time', () => {
  const s = createAlign('one two three four five six', 5);
  ['one', 'two', 'three', 'four', 'five', 'six'].forEach((w, k) => feedWord(s, w, [], 1000 + k * 500));
  // 6 words read across 2.5 s → 144 WCPM
  assert.equal(summarize(s).wcpm, 144);
});

test('syllables: overrides first, sensible heuristic otherwise', () => {
  assert.deepEqual(syllabify('grasshopper', { grasshopper: ['grass', 'hop', 'per'] }), ['grass', 'hop', 'per']);
  assert.deepEqual(syllabify('cat'), ['cat']);
  assert.ok(syllabify('enormous').length >= 3);
  assert.deepEqual(syllabify('make'), ['make']);
});

// ------------------------------------------------------------------ progression
const sess = (o: Partial<VocaSession>): VocaSession => ({ passageId: 'p', level: 4, accuracy: 0.95, wcpm: 70, comebacks: 0, words: 50, understood: true, noisy: false, at: Date.now(), seconds: 40, ...o });

test('three learning-zone reads with comprehension move the reader up', () => {
  let p = defaultProgress(4);
  for (let k = 0; k < 3; k++) p = applySession(p, sess({ accuracy: 0.95, at: Date.now() + k }), { practice: [], comebacks: [] }).progress;
  assert.equal(p.level, 5);
});

test('two mastery reads move up; not understanding the story blocks advancement', () => {
  let p = defaultProgress(4);
  p = applySession(p, sess({ accuracy: 0.99 }), { practice: [], comebacks: [] }).progress;
  const r = applySession(p, sess({ accuracy: 0.99, understood: false }), { practice: [], comebacks: [] });
  assert.equal(r.progress.level, 4);
  const r2 = applySession(r.progress, sess({ accuracy: 0.99 }), { practice: [], comebacks: [] });
  assert.equal(r2.progress.level, 4, 'needs two consecutive understood mastery reads');
});

test('two frustration reads step down; noisy reads never count', () => {
  let p = defaultProgress(5);
  p = applySession(p, sess({ level: 5, accuracy: 0.7, noisy: true }), { practice: [], comebacks: [] }).progress;
  p = applySession(p, sess({ level: 5, accuracy: 0.8 }), { practice: [], comebacks: [] }).progress;
  assert.equal(p.level, 5);
  p = applySession(p, sess({ level: 5, accuracy: 0.85 }), { practice: [], comebacks: [] }).progress;
  assert.equal(p.level, 4);
  assert.equal(decideLevel(p, sess({ noisy: true })).change, 'stay');
});

test('fluency floor: accurate but very slow reads stay at the level', () => {
  let p = defaultProgress(6);
  for (let k = 0; k < 3; k++) p = applySession(p, sess({ level: 6, accuracy: 0.96, wcpm: 30 }), { practice: [], comebacks: [] }).progress;
  assert.equal(p.level, 6);
});

test('missed words enter spaced review and graduate after repeated success', () => {
  const now = Date.now();
  let p = applySession(defaultProgress(4), sess({ at: now }), { practice: ['enormous'], comebacks: [] }).progress;
  assert.deepEqual(dueReview(p, now + 2 * 86_400_000), ['enormous']);
  for (let k = 0; k < 4; k++) p = reviewResult(p, 'enormous', true, now);
  assert.equal(p.review['enormous'], undefined);
});

test('next passage prefers unread stories at the level', () => {
  let p = defaultProgress(4);
  const first = nextPassage(p);
  p = applySession(p, sess({ passageId: first.id, accuracy: 0.99 }), { practice: [], comebacks: [] }).progress;
  assert.notEqual(nextPassage(p).id, first.id);
});
