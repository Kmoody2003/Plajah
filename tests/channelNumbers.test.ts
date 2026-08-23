// Channel numbers are addresses, and these are the properties that make them addresses.
//
// The bug these replace: the lineup gave every unbound account "the smallest free positive
// integer" over whoever happened to be on air, so a channel's number changed when a DIFFERENT
// account went live. Most of what follows is therefore about what must NOT move.
//
//   npx tsx --test tests/channelNumbers.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAJAH_BAND, PLAJAH_CHANNELS, RESERVED_MAJORS, SCIENCE_BAND_START, UNNUMBERED,
  findPlajahChannel, guideSortKey, isAllocatableMajor, nextPlajahSub, nextUserMajor, plajahNumber,
} from '../services/fast/channelNumbers';

// ── Allocation ───────────────────────────────────────────────────────────────

test('an account never lands in a reserved band', () => {
  // Seven accounts already hold 1-7, so the naive answer is 8 — which is Plajah's.
  const used = [1, 2, 3, 4, 5, 6, 7];
  const next = nextUserMajor(used);
  assert.equal(next, 9);
  assert.ok(!RESERVED_MAJORS.has(next));
});

test('allocation fills gaps rather than always appending', () => {
  // A retired number is still claimed, so this only fills gaps that were never handed out.
  assert.equal(nextUserMajor([1, 2, 4]), 3);
  assert.equal(nextUserMajor([]), 1);
});

test('allocation is a pure function of what is CLAIMED', () => {
  // The old bug in one line: the same account got a different number depending on who else was
  // in the list. Here the input is the claim registry, so the same claims always give the same
  // answer regardless of order.
  const claims = [5, 1, 9, 3];
  assert.equal(nextUserMajor(claims), nextUserMajor([...claims].reverse()));
});

test('a number stays claimed while its owner is off air', () => {
  // The registry is passed whole, including accounts with nothing on right now. If off-air
  // accounts were filtered out before this call, their numbers would be handed to someone else.
  const everyoneEverNumbered = [1, 2, 3];
  assert.equal(nextUserMajor(everyoneEverNumbered), 4);
});

test('reserved and out-of-band majors are not allocatable', () => {
  assert.equal(isAllocatableMajor(PLAJAH_BAND), false);
  assert.equal(isAllocatableMajor(SCIENCE_BAND_START), false);
  assert.equal(isAllocatableMajor(0), false);
  assert.equal(isAllocatableMajor(2.5), false);
  assert.equal(isAllocatableMajor(7), true);
});

// ── The Plajah band ──────────────────────────────────────────────────────────

test('The Endless Hour is 8.1', () => {
  const eh = findPlajahChannel('endless-hour');
  assert.ok(eh, 'The Endless Hour should be in the first-party lineup');
  assert.equal(plajahNumber(eh!), '8.1');
});

test('a first-party channel is never a bare major', () => {
  // This is the whole reason for sub-numbering a band that currently holds one channel: a bare
  // "8" would have to become "8.1" the day a second arrived, renumbering an address people
  // already have.
  for (const c of PLAJAH_CHANNELS) {
    assert.match(plajahNumber(c), /^8\.\d+$/, `${c.id} was ${plajahNumber(c)}`);
  }
});

test('first-party subs are unique', () => {
  const subs = PLAJAH_CHANNELS.map((c) => c.sub);
  assert.equal(new Set(subs).size, subs.length);
});

test('a new first-party channel takes max + 1, so retired numbers stay retired', () => {
  assert.equal(nextPlajahSub(), Math.max(...PLAJAH_CHANNELS.map((c) => c.sub)) + 1);
  // Specifically NOT length + 1, which would reissue the number of a removed channel.
  assert.ok(nextPlajahSub() > PLAJAH_CHANNELS.length - 1);
});

// ── The guide ────────────────────────────────────────────────────────────────

test('the guide sorts by number, with sub-channels under their major', () => {
  const order = ['2', '8.1', '10', '1.2', '1.1', '8.2'];
  const sorted = [...order].sort((a, b) => guideSortKey(a) - guideSortKey(b));
  assert.deepEqual(sorted, ['1.1', '1.2', '2', '8.1', '8.2', '10']);
});

test('numbers sort numerically, not as strings', () => {
  // "10" before "2" is the classic version of this bug.
  assert.ok(guideSortKey('2') < guideSortKey('10'));
});

test('unnumbered channels fall to the end and do not displace anyone', () => {
  const sorted = ['9', UNNUMBERED, '1'].sort((a, b) => guideSortKey(a) - guideSortKey(b));
  assert.deepEqual(sorted, ['1', '9', UNNUMBERED]);
});

test('an unnumbered channel shows no number rather than a provisional one', () => {
  // A number that will be different tomorrow teaches people the wrong address, so there is
  // deliberately no way to render a placeholder that looks like a channel number.
  assert.equal(UNNUMBERED, '—');
  assert.ok(!/\d/.test(UNNUMBERED));
});
