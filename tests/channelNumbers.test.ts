// Channel numbers are addresses, and these are the properties that make them addresses.
//
// The bug these replace: the lineup gave every unbound account "the smallest free positive
// integer" over whoever happened to be on air, so a channel's number changed when a DIFFERENT
// account went live. The fix is not a better formula — it is that numbers are GIVEN once and
// looked up thereafter. So most of what follows is about what must NOT move, and about the one
// rule that makes that possible: a retired number is never reissued.
//
//   npx tsx --test tests/channelNumbers.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAJAH_BAND, PLAJAH_CHANNELS, RESERVED_MAJORS, SCIENCE_BAND_START, UNNUMBERED,
  allTakenNumbers, canClaim, findPlajahChannel, guideSortKey, isAllocatableMajor, nextPlajahSub,
  nextUserMajor, numberFor, plajahNumber, type NumberRegistry,
} from '../services/fast/channelNumbers';

const reg = (
  byOwner: Record<string, number>,
  retired: Record<string, { ownerId: string; at: number }> = {},
): NumberRegistry => ({ byOwner, retired });

// ── Giving a number ──────────────────────────────────────────────────────────

test('the first account gets 1', () => {
  assert.equal(numberFor(reg({}), 'alice'), 1);
});

test('an account already holding a number is given the same one back', () => {
  // assignChannelNumber runs on every channel save. It must be idempotent, or a routine edit to
  // a channel's name would move its address.
  assert.equal(numberFor(reg({ alice: 4 }), 'alice'), 4);
});

test('an account never lands in a reserved band', () => {
  // Seven accounts hold 1-7, so the naive answer is 8 — which is Plajah's.
  const r = reg({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 });
  const n = numberFor(r, 'newcomer');
  assert.equal(n, 9);
  assert.ok(!RESERVED_MAJORS.has(n));
});

test('reserved and out-of-band majors are not allocatable', () => {
  assert.equal(isAllocatableMajor(PLAJAH_BAND), false);
  assert.equal(isAllocatableMajor(SCIENCE_BAND_START), false);
  assert.equal(isAllocatableMajor(0), false);
  assert.equal(isAllocatableMajor(2.5), false);
  assert.equal(isAllocatableMajor(7), true);
});

test('allocation is a pure function of the registry, not of arrival order', () => {
  // Firestore returns documents in whatever order it likes and two devices will not agree on it.
  const a = numberFor(reg({ x: 5, y: 1, z: 9 }), 'new');
  const b = numberFor(reg({ z: 9, y: 1, x: 5 }), 'new');
  assert.equal(a, b);
  assert.equal(a, 2);
});

test('a number stays held while its owner is off air', () => {
  // The registry is read whole, including accounts with nothing on right now. Filtering to live
  // channels before allocating is the original bug.
  assert.equal(numberFor(reg({ a: 1, b: 2, c: 3 }), 'new'), 4);
});

// ── Retirement: the rule that makes the rest work ────────────────────────────

test('a retired number is never given to anyone else', () => {
  // bob deleted his account holding 2. The next account must skip it — someone still has "2"
  // written down, and inheriting it is worse for them than a gap in the guide.
  const r = reg({ alice: 1 }, { '2': { ownerId: 'bob', at: 1 } });
  assert.equal(numberFor(r, 'carol'), 3);
});

test('an account that comes back gets its OWN number back', () => {
  // The tombstone records who held it, so returning is a restoration rather than a reallocation.
  // Someone who comes back to a different address has, from their side, lost their channel.
  const r = reg({ alice: 1 }, { '2': { ownerId: 'bob', at: 1 } });
  assert.equal(numberFor(r, 'bob'), 2);
});

test('retired numbers count as taken when the allocator looks for a gap', () => {
  const r = reg({ a: 1, c: 3 }, { '2': { ownerId: 'b', at: 1 } });
  assert.deepEqual(allTakenNumbers(r).sort((x, y) => x - y), [1, 2, 3]);
  assert.equal(numberFor(r, 'new'), 4);
});

test('deleting an account does not move anyone else', () => {
  // The property the whole design exists for. bob's departure retires 2; alice and carol are
  // untouched, because nothing about their numbers was ever derived from bob.
  const before = reg({ alice: 1, bob: 2, carol: 3 });
  const after = reg({ alice: 1, carol: 3 }, { '2': { ownerId: 'bob', at: 1 } });
  assert.equal(numberFor(after, 'alice'), numberFor(before, 'alice'));
  assert.equal(numberFor(after, 'carol'), numberFor(before, 'carol'));
});

test('a new account after a deletion does not inherit the gap', () => {
  const after = reg({ alice: 1, carol: 3 }, { '2': { ownerId: 'bob', at: 1 } });
  assert.equal(numberFor(after, 'dave'), 4, 'dave took a departed creator’s address');
});

// ── Claiming a specific number ───────────────────────────────────────────────

test('an unused number can be claimed', () => {
  assert.equal(canClaim(reg({ alice: 1 }), 7, 'bob'), true);
});

test('a number somebody holds cannot be claimed', () => {
  assert.equal(canClaim(reg({ alice: 5 }), 5, 'bob'), false);
});

test('a retired number cannot be claimed by anyone else, at any price', () => {
  // This is the alternative to an auction, and it only works if a gap in the guide is not
  // treated as an opening. Vanity numbers and dropped domains both became markets precisely
  // because dead addresses went back into circulation.
  const r = reg({ alice: 1 }, { '12': { ownerId: 'gone', at: 1 } });
  assert.equal(canClaim(r, 12, 'bob'), false);
  assert.equal(canClaim(r, 12, 'gone'), true, 'its own former owner may take it back');
});

test('reserved bands cannot be claimed', () => {
  assert.equal(canClaim(reg({}), PLAJAH_BAND, 'bob'), false);
  assert.equal(canClaim(reg({}), SCIENCE_BAND_START, 'bob'), false);
});

// ── The Plajah band ──────────────────────────────────────────────────────────

test('The Endless Hour is 8.1', () => {
  const eh = findPlajahChannel('endless-hour');
  assert.ok(eh, 'The Endless Hour should be in the first-party lineup');
  assert.equal(plajahNumber(eh!), '8.1');
});

test('a first-party channel is never a bare major', () => {
  // The whole reason for sub-numbering a band that holds one channel: a bare "8" would have to
  // become "8.1" the day a second arrived, renumbering an address people already have.
  for (const c of PLAJAH_CHANNELS) {
    assert.match(plajahNumber(c), /^8\.\d+$/, `${c.id} was ${plajahNumber(c)}`);
  }
});

test('first-party subs are unique', () => {
  const subs = PLAJAH_CHANNELS.map((c) => c.sub);
  assert.equal(new Set(subs).size, subs.length);
});

test('a new first-party channel takes max + 1, so retired subs stay retired', () => {
  assert.equal(nextPlajahSub(), Math.max(...PLAJAH_CHANNELS.map((c) => c.sub)) + 1);
  // Specifically NOT length + 1, which would reissue the number of a removed channel.
  assert.ok(nextPlajahSub() > PLAJAH_CHANNELS.length - 1);
});

test('the copy stays out of the loss register', () => {
  // Deliberate: an early draft leaned on "once it is gone it is gone", which reads as activating
  // rather than settling — the wrong nervous system response for this channel in particular.
  for (const c of PLAJAH_CHANNELS) {
    assert.doesNotMatch(c.tagline, /\bgone\b|never again|\blost\b/i, `${c.id}: ${c.tagline}`);
  }
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

test('gaps in the lineup are fine', () => {
  // A lineup full of holes is what a real channel guide looks like, and is the visible cost of
  // never reissuing an address. It sorts correctly, which is all it has to do.
  const sorted = ['14', '1', '9', '2'].sort((a, b) => guideSortKey(a) - guideSortKey(b));
  assert.deepEqual(sorted, ['1', '2', '9', '14']);
});

test('a channel awaiting its number falls to the end and displaces nobody', () => {
  const sorted = ['9', UNNUMBERED, '1'].sort((a, b) => guideSortKey(a) - guideSortKey(b));
  assert.deepEqual(sorted, ['1', '9', UNNUMBERED]);
});

test('there is no placeholder that looks like a channel number', () => {
  // A plausible-looking number that changes next week teaches the wrong address, so the waiting
  // state is deliberately not a number at all.
  assert.equal(UNNUMBERED, '—');
  assert.ok(!/\d/.test(UNNUMBERED));
});

// ── The low-level allocator ──────────────────────────────────────────────────

test('nextUserMajor fills gaps that were never handed out', () => {
  assert.equal(nextUserMajor([1, 2, 4]), 3);
  assert.equal(nextUserMajor([]), 1);
});

test('nextUserMajor must be given retired numbers too', () => {
  // The signature takes every number the registry has ever issued. Passing only live assignments
  // is the mistake that reissues a departed creator's address, so this is the shape of the
  // contract rather than an incidental detail.
  const r = reg({ a: 1 }, { '2': { ownerId: 'b', at: 1 } });
  assert.equal(nextUserMajor(allTakenNumbers(r)), 3);
  assert.equal(nextUserMajor(Object.values(r.byOwner)), 2, 'what going wrong looks like');
});
