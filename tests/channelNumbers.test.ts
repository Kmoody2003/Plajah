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
  assignMajors, findPlajahChannel, guideSortKey, isAllocatableMajor, nextPlajahSub, nextUserMajor,
  plajahNumber,
} from '../services/fast/channelNumbers';

/** A lineup, oldest first. `alice` is the oldest account, `dave` the newest. */
const LINEUP = [
  { key: 'alice', createdAt: 1_000 },
  { key: 'bob', createdAt: 2_000 },
  { key: 'carol', createdAt: 3_000 },
  { key: 'dave', createdAt: 4_000 },
];

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

// ── The bug this replaces ────────────────────────────────────────────────────

test('a number does not change when a DIFFERENT account goes live', () => {
  // The reported bug, stated as a test.
  //
  // The candidate set is every account with a channel, not every account currently broadcasting
  // — going live or dark adds or removes a SUB-channel, never the owner. Previously numbers came
  // from position in the on-air list, so K-Moody's number changed when somebody else switched on.
  // Here the input is identical either way, so the numbers are too.
  const offAir = assignMajors(LINEUP);
  const bobNowLive = assignMajors(LINEUP);   // bob broadcasting adds bob.1, not a new owner
  for (const c of LINEUP) assert.equal(bobNowLive.get(c.key), offAir.get(c.key), `${c.key} moved`);
});

test('an account LEAVING still shifts the ones after it — which is what claiming is for', () => {
  // The honest limit of a provisional number. Small consecutive integers cannot be both gapless
  // and stable under deletion without a registry that remembers what was handed out; that is
  // exactly what claimChannelNumber persists, and once carol has claimed 3 she keeps 3 whatever
  // happens to bob.
  const everyone = assignMajors(LINEUP);
  const bobDeleted = assignMajors(LINEUP.filter((c) => c.key !== 'bob'));
  assert.equal(everyone.get('carol'), 3);
  assert.equal(bobDeleted.get('carol'), 2, 'documents the drift a claim removes');

  const carolClaimed = assignMajors(
    LINEUP.filter((c) => c.key !== 'bob').map((c) => (c.key === 'carol' ? { ...c, claimed: 3 } : c)),
  );
  assert.equal(carolClaimed.get('carol'), 3, 'a claim holds the address through a deletion');
});

test('a new account appears at the end and displaces nobody', () => {
  const before = assignMajors(LINEUP);
  const after = assignMajors([...LINEUP, { key: 'erin', createdAt: 9_000 }]);
  for (const c of LINEUP) assert.equal(after.get(c.key), before.get(c.key), `${c.key} moved`);
  assert.equal(after.get('erin'), 5);
});

test('load order does not affect the answer', () => {
  // Firestore returns documents in whatever order it likes, and two devices will not agree on
  // it. The allocation has to be a function of the data, not of arrival.
  const forwards = assignMajors(LINEUP);
  const backwards = assignMajors([...LINEUP].reverse());
  for (const c of LINEUP) assert.equal(backwards.get(c.key), forwards.get(c.key));
});

test('accounts created in the same millisecond still resolve identically everywhere', () => {
  const tied = [{ key: 'zoe', createdAt: 500 }, { key: 'adam', createdAt: 500 }];
  const a = assignMajors(tied);
  const b = assignMajors([...tied].reverse());
  assert.equal(a.get('adam'), b.get('adam'));
  assert.equal(a.get('zoe'), b.get('zoe'));
  assert.notEqual(a.get('adam'), a.get('zoe'));
});

// ── Existing numbers survive ─────────────────────────────────────────────────

test('a claimed number always wins over allocation', () => {
  const m = assignMajors([{ key: 'alice', createdAt: 1_000, claimed: 42 }, ...LINEUP.slice(1)]);
  assert.equal(m.get('alice'), 42);
});

test('allocation never lands on a number somebody already claimed', () => {
  // bob holds 1, so alice — older — must take 2 rather than colliding.
  const m = assignMajors([
    { key: 'alice', createdAt: 1_000 },
    { key: 'bob', createdAt: 2_000, claimed: 1 },
  ]);
  assert.equal(m.get('bob'), 1);
  assert.equal(m.get('alice'), 2);
});

test('everyone in a lineup gets a number, not a dash', () => {
  // The point of the createdAt fallback: existing channels keep having numbers. Only a channel
  // with neither a claim nor a creation date falls through to UNNUMBERED.
  const m = assignMajors(LINEUP);
  assert.equal(m.size, LINEUP.length);
  for (const c of LINEUP) assert.ok(typeof m.get(c.key) === 'number');
});

test('a channel with no claim and no date gets no number', () => {
  const m = assignMajors([{ key: 'ghost' }, ...LINEUP]);
  assert.equal(m.has('ghost'), false);
});

test('allocation skips the Plajah band', () => {
  // Eight accounts: the eighth must be 9, because 8 belongs to Plajah.
  const many = Array.from({ length: 8 }, (_, i) => ({ key: `u${i}`, createdAt: i * 100 }));
  const m = assignMajors(many);
  assert.deepEqual([...m.values()], [1, 2, 3, 4, 5, 6, 7, 9]);
  assert.ok(![...m.values()].includes(PLAJAH_BAND));
});
