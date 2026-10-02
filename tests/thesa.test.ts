import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCard } from '../services/thesa/validate';
import { cardFromFactoid, cardsFromEduFactoids, cardsFromHistoryFigures } from '../services/thesa/adapters';
import { builtInCards, pickCards, isEligible, hashString } from '../services/thesa/catalog';
import { stash, unstash, annotate, mergeStash, liveEntries, stashIdsOf } from '../services/thesa/stashModel';
import { EDU_FACTOIDS } from '../data/eduFactoids';
import type { ThesaCard } from '../services/thesa/types';

const moment = (over: Partial<ThesaCard> & Record<string, unknown>): ThesaCard => ({
  id: 'thesa:test:m1', family: 'MOMENT', kind: 'BREATH', topic: 'wellbeing',
  source: { service: 'ora', label: 'Ora · Breathe' }, durationSec: 30, wellness: true, kidsSafe: true, status: 'LIVE',
  payload: { pattern: 'box' }, ...over,
} as ThesaCard);

test('every existing factoid and history figure becomes a valid card', () => {
  const cards = [...cardsFromEduFactoids(), ...cardsFromHistoryFigures()];
  assert.ok(cards.length >= EDU_FACTOIDS.length);
  const bad = cards.map(c => ({ id: c.id, r: validateCard(c) })).filter(x => !x.r.ok);
  assert.deepEqual(bad, [], JSON.stringify(bad.slice(0, 3)));
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length, 'ids must be unique');
});

test('adapter ids are stable and derived from the original id', () => {
  const c = cardFromFactoid(EDU_FACTOIDS[0]);
  assert.equal(c.id, `thesa:edu:${EDU_FACTOIDS[0].id}`);
  assert.equal(c.source.service, 'chora');
  assert.equal(c.kidsSafe, true);
});

test('history figures link back to their history view and are NOT kids-safe until reviewed', () => {
  const figs = cardsFromHistoryFigures();
  assert.ok(figs.every(c => c.kidsSafe === false));
  assert.ok(figs.every(c => c.deeper?.view === 'CHORA_HISTORY' || c.deeper?.view === 'TALEO_HISTORY'));
  assert.ok(figs.some(c => c.kind === 'PRINCIPLE'), 'quotes become PRINCIPLE cards');
});

test('validator enforces the Moment and wellness rules', () => {
  assert.ok(validateCard(moment({})).ok);
  assert.ok(!validateCard(moment({ wellness: false })).ok, 'BREATH must be wellness');
  assert.ok(!validateCard(moment({ durationSec: 60 })).ok, 'BREATH is 30 s');
  assert.ok(!validateCard(moment({ durationSec: undefined })).ok, 'a Moment needs a duration');
  assert.ok(!validateCard(moment({ family: 'IDEA' })).ok, 'family must match kind');
  const idea = { ...cardFromFactoid(EDU_FACTOIDS[0]), durationSec: 30 } as ThesaCard;
  assert.ok(!validateCard(idea).ok, 'only a Moment has a duration');
  assert.ok(!validateCard({ ...cardFromFactoid(EDU_FACTOIDS[0]), kidsSafe: undefined } as unknown as ThesaCard).ok, 'kidsSafe has no default');
});

test('word-game specs are validated', () => {
  const w = (payload: unknown, durationSec = 15) => moment({ id: 'thesa:test:w', kind: 'WORDPLAY', topic: 'language', wellness: false, durationSec, payload: payload as any });
  assert.ok(validateCard(w({ game: 'UNSCRAMBLE', answer: 'groove' })).ok);
  assert.ok(!validateCard(w({ game: 'UNSCRAMBLE', answer: 'no' })).ok);
  assert.ok(validateCard(w({ game: 'CLOZE', text: 'Bach composed in a ___.', answer: 'cell' }, 30)).ok);
  assert.ok(!validateCard(w({ game: 'CLOZE', text: 'no blank here', answer: 'x' })).ok);
  assert.ok(!validateCard(w({ game: 'CLOZE', text: 'two ___ and ___', answer: 'x' })).ok);
  assert.ok(!validateCard(w({ game: 'LADDER', from: 'cat', to: 'house' })).ok);
  assert.ok(!validateCard(w({ game: 'UNSCRAMBLE', answer: 'groove' }, 45)).ok, 'word games run 15 or 30 s');
});

test('built-in catalog is non-empty and fully valid', () => {
  const cards = builtInCards();
  assert.ok(cards.length > 30);
  assert.ok(cards.every(c => validateCard(c).ok));
});

test('daily pick is deterministic, per-user, advances daily and never uses engagement', () => {
  const a1 = pickCards({ uid: 'alice', dayIndex: 100, count: 3 }).map(c => c.id);
  const a2 = pickCards({ uid: 'alice', dayIndex: 100, count: 3 }).map(c => c.id);
  const b = pickCards({ uid: 'bob', dayIndex: 100, count: 3 }).map(c => c.id);
  const next = pickCards({ uid: 'alice', dayIndex: 101, count: 3 }).map(c => c.id);
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1, b);
  assert.equal(new Set([...a1, ...next]).size, 6, 'next day continues, no repeats');
  assert.notEqual(hashString('alice'), hashString('bob'));
});

test('kids-mode and wellness gating', () => {
  const pool = [...builtInCards(), moment({ id: 'thesa:test:breath' })];
  const kids = pickCards({ uid: 'k', dayIndex: 5, count: 200, kidsMode: true, pool });
  assert.ok(kids.length > 0 && kids.every(c => c.kidsSafe));
  const noOptIn = pickCards({ uid: 'u', dayIndex: 5, count: 500, pool });
  assert.ok(noOptIn.every(c => !c.wellness), 'wellness cards never appear without opt-in');
  const optIn = pickCards({ uid: 'u', dayIndex: 5, count: 500, pool, wellnessOptIn: true });
  assert.ok(optIn.some(c => c.wellness));
  assert.ok(!isEligible({ ...builtInCards()[0], status: 'DRAFT' }, {}), 'only LIVE cards are eligible');
  assert.deepEqual(pickCards({ uid: 'u', dayIndex: 1, count: 3, pool: [] }), []);
});

test('stash: add, idempotent, annotate, un-stash leaves a tombstone, re-stash revives', () => {
  const card = builtInCards()[0];
  let s = stash([], card, 1000);
  assert.equal(stash(s, card, 2000), s, 'stashing twice is a no-op');
  s = annotate(s, card.id, '  my take  ', 1500);
  assert.equal(s[0].note, 'my take');
  s = unstash(s, card.id, 2000);
  assert.equal(liveEntries(s).length, 0);
  assert.equal(s.length, 1, 'tombstone kept');
  assert.equal(s[0].note, undefined, 'a removed card keeps no private note');
  s = stash(s, card, 3000);
  assert.deepEqual([...stashIdsOf(s)], [card.id]);
  assert.equal(s[0].stashedAt, 3000);
});

test('merge: newest updatedAt wins, so a removal on one device beats a stale cache on another', () => {
  const card = builtInCards()[0];
  const device1 = stash([], card, 1000);
  const device2 = unstash(device1, card.id, 2000);
  const merged = mergeStash(device1, device2);
  assert.equal(liveEntries(merged).length, 0);
  assert.equal(liveEntries(mergeStash(device2, stash(device2, card, 3000))).length, 1, 'a later re-stash wins');
});
