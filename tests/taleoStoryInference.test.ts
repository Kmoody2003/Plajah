import test from 'node:test';
import assert from 'node:assert/strict';
import { inferStory, relatedScore, formatRuntime } from '../components/taleo/storyInference';

test('returns null without enough text', () => {
  assert.equal(inferStory({ title: 'X', description: 'Short.' }), null);
});

test('infers summary, themes, tone and facts', () => {
  const r = inferStory({
    title: 'Last Light', genre: 'Thriller', runtimeSec: 5400, castNames: ['A', 'B'],
    description: 'A mother searches for her missing son. But the truth about her family is darker than she feared. She must survive the night to find him.',
  })!;
  assert.ok(r.summary.startsWith('A mother'));
  assert.ok(r.themes.includes('Family & belonging'));
  assert.ok(r.tone.includes('Tense'));
  assert.ok(r.facts.includes('1h 30m'));
  assert.ok(r.keyMoments.length > 0);
});

test('related scoring prefers same world and excludes self', () => {
  const base = { id: 'a', worldId: 'w', genre: 'Drama', tags: ['x'] };
  assert.equal(relatedScore(base, { id: 'a' }), 0);
  assert.ok(relatedScore(base, { id: 'b', worldId: 'w' }) > relatedScore(base, { id: 'c', genre: 'drama' }));
  assert.equal(formatRuntime(0), null);
});
