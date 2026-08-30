import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchScore, topVideoAffinities, emptyVector, facetsOf, addWeight,
  MIN_SIGNALS, FAMILY_WEIGHT, WEIGHT,
  type VideoTasteVector,
} from '../services/videoTasteScoring.ts';

// These tests exist because the thing they replace was a hash of the title dressed up as
// personalization. The point of the new model is not that it scores highly — it is that it
// REFUSES to score when it has nothing to go on. Most of what follows pins that refusal down.

const vec = (over: Partial<VideoTasteVector> = {}): VideoTasteVector => ({
  ...emptyVector(),
  count: MIN_SIGNALS,          // past the confidence gate unless a test says otherwise
  ...over,
});

// ── The confidence gate: no signal, no number ────────────────────────────────

test('a brand-new user gets NO score, not a default', () => {
  const fresh = emptyVector();
  assert.equal(fresh.count, 0);
  assert.equal(matchScore({ id: 'v1', genre: 'Horror' }, fresh), null);
});

test('the gate holds right up to MIN_SIGNALS, then opens', () => {
  const facets = { genres: { Horror: 4 } };
  const justUnder = vec({ ...facets, count: MIN_SIGNALS - 1 });
  const atThreshold = vec({ ...facets, count: MIN_SIGNALS });
  assert.equal(matchScore({ id: 'v', genre: 'Horror' }, justUnder), null, 'below threshold stays silent');
  assert.ok(matchScore({ id: 'v', genre: 'Horror' }, atThreshold), 'at threshold it can speak');
});

test('a known user still gets NO score for a title sharing nothing with them', () => {
  const known = vec({ genres: { Horror: 5 }, creators: { alice: 3 } });
  // Documentary by bob, no world, no tags — the vector has no opinion about any of it.
  const r = matchScore({ id: 'v', genre: 'Documentary', ownerId: 'bob' }, known);
  assert.equal(r, null, 'no overlap must not fall back to a neutral 50%');
});

test('an unknown facet is ignored rather than counted as neutral', () => {
  // Same loved creator; one title also carries a genre the user has never touched. If unknown
  // facets were folded in as 0 they would drag the score toward 50 and the two would differ.
  const v = vec({ creators: { alice: 6 } });
  const bare = matchScore({ id: 'a', ownerId: 'alice' }, v);
  const withUnknown = matchScore({ id: 'b', ownerId: 'alice', genre: 'NeverSeen' }, v);
  assert.ok(bare && withUnknown);
  assert.equal(bare.score, withUnknown.score);
});

// ── Direction and range ──────────────────────────────────────────────────────

test('a loved creator scores high and a disliked genre scores low', () => {
  const v = vec({ creators: { alice: 6 }, genres: { Horror: -6 } });
  const loved = matchScore({ id: 'a', ownerId: 'alice' }, v)!;
  const hated = matchScore({ id: 'b', genre: 'Horror' }, v)!;
  assert.equal(loved.score, 100, 'sole positive facet at full affinity maps to 100');
  assert.equal(hated.score, 0, 'sole negative facet at full affinity maps to 0');
  assert.ok(loved.score > hated.score);
});

test('scores stay inside 0-100 even with lopsided weights', () => {
  const v = vec({ creators: { alice: 999 }, genres: { Horror: -999 }, worlds: { w: 500 } });
  const r = matchScore({ id: 'a', ownerId: 'alice', genre: 'Horror', worldId: 'w' }, v)!;
  assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score} in range`);
});

test('normalization makes a heavy user and a light user comparable', () => {
  // Same shape of preference, wildly different volume. The badge must not read higher just
  // because someone has used the app longer.
  const light = vec({ genres: { Horror: 2, Comedy: -2 } });
  const heavy = vec({ genres: { Horror: 200, Comedy: -200 }, count: 400 });
  const a = matchScore({ id: 'x', genre: 'Horror' }, light)!;
  const b = matchScore({ id: 'x', genre: 'Horror' }, heavy)!;
  assert.equal(a.score, b.score);
});

// ── Family weighting ─────────────────────────────────────────────────────────

test('creator outweighs category when the two disagree', () => {
  assert.ok(FAMILY_WEIGHT.creators > FAMILY_WEIGHT.categories, 'precondition');
  const v = vec({ creators: { alice: 5 }, categories: { DOCUMENTARY: -5 } });
  const r = matchScore({ id: 'a', ownerId: 'alice', category: 'DOCUMENTARY' as any }, v)!;
  assert.ok(r.score > 50, `creator should win, got ${r.score}`);
});

test('many matching tags do not drown out a single genre', () => {
  // Tags are averaged within their family, so twelve of them still count once.
  const v = vec({
    genres: { Horror: 5 },
    tags: { a: -5, b: -5, c: -5, d: -5, e: -5, f: -5 },
  });
  const r = matchScore(
    { id: 'x', genre: 'Horror', tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    v,
  )!;
  // genre (1.0, +1) vs tags (0.6, -1) -> (1.0 - 0.6) / 1.6 = +0.25 -> 62-63
  assert.ok(r.score > 50, `genre should still carry it, got ${r.score}`);
  const tagEntry = r.basis.find(b => b.family === 'tags')!;
  assert.ok(tagEntry, 'tags appear once in the basis');
  assert.equal(tagEntry.affinity, -1, 'six tags averaged, not summed');
});

// ── The basis, which is what makes the number inspectable ────────────────────

test('basis names only the facets that actually contributed', () => {
  const v = vec({ creators: { alice: 4 }, genres: { Horror: 2 } });
  const r = matchScore({ id: 'a', ownerId: 'alice', genre: 'Horror', category: 'MOVIE' as any }, v)!;
  const families = r.basis.map(b => b.family).sort();
  assert.deepEqual(families, ['creators', 'genres'], 'category had no affinity, so it is absent');
});

test('basis is ordered by how strongly each facet pulled', () => {
  const v = vec({ creators: { alice: 1 }, genres: { Horror: 10 } });
  const r = matchScore({ id: 'a', ownerId: 'alice', genre: 'Horror' }, v)!;
  const strengths = r.basis.map(b => Math.abs(b.affinity));
  assert.deepEqual(strengths, [...strengths].sort((x, y) => y - x), 'strongest first');
});

// ── Facet extraction ─────────────────────────────────────────────────────────

test('facetsOf tolerates a missing video and empty fields', () => {
  assert.deepEqual(facetsOf(null).tags, []);
  assert.equal(facetsOf(undefined).genre, undefined);
  assert.equal(facetsOf({ id: 'v', genre: '' }).genre, undefined, 'empty string is not a facet');
});

test('facetsOf caps tags so one over-tagged upload cannot dominate', () => {
  const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
  assert.equal(facetsOf({ id: 'v', tags: many }).tags.length, 12);
});

test('addWeight ignores absent keys instead of creating an "undefined" bucket', () => {
  const rec: Record<string, number> = {};
  addWeight(rec, undefined, 5);
  addWeight(rec, '', 5);
  assert.deepEqual(rec, {});
});

// ── Aggregation helpers ──────────────────────────────────────────────────────

test('topVideoAffinities returns positives only, strongest first', () => {
  const v = vec({ genres: { Horror: 5, Comedy: -3, Drama: 9 } });
  assert.deepEqual(topVideoAffinities(v).genres, ['Drama', 'Horror'], 'disliked genre excluded');
});

test('a thumbs-down weighs more than a thumbs-up, matching the music model', () => {
  assert.ok(Math.abs(WEIGHT.DOWN) > WEIGHT.UP);
  assert.ok(WEIGHT.LOVE > WEIGHT.UP);
});
