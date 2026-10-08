// scriptureListener — speech → scripture detection.
// Run with: npx tsx --test tests/amboScriptureListener.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createScriptureListener, detectSpoken } from '../services/ambo/scriptureListener';

const run = (chunks: Array<[string, number]>, end: number, opts = {}) => {
  const l = createScriptureListener(opts);
  const hits: string[] = [];
  let clock = 0;
  const tick = (to: number) => { for (; clock <= to; clock += 250) hits.push(...l.poll(clock).map(h => h.label)); };
  for (const [t, at] of chunks) { tick(at - 1); l.feed(t, at); hits.push(...l.poll(at).map(h => h.label)); }
  for (let t = clock; t <= end; t += 250) hits.push(...l.poll(t).map(h => h.label));
  return hits;
};

describe('detectSpoken', () => {
  test('spoken numbers', () => {
    assert.equal(detectSpoken('turn to john three sixteen')[0].ref.verse, 16);
    assert.equal(detectSpoken('Romans chapter eight verse twenty-eight')[0].ref.chapter, 8);
  });
  test('prose that merely sounds like a book is ignored', () => {
    assert.equal(detectSpoken('there are acts 2 ways to do this').length, 0);
    assert.equal(detectSpoken('i am 30 today').length, 0);
  });
  test('bare chapter needs a cue phrase', () => {
    assert.equal(detectSpoken('let us open to psalm 23').length, 1);
    assert.equal(detectSpoken('he read psalm 23 once').length, 0);
  });
});

describe('listener', () => {
  test('waits for the verse number instead of firing on the chapter', () => {
    const hits = run([['turn with me to john', 0], ['3', 400], ['16', 900]], 4000);
    assert.deepEqual(hits, ['John 3:16']);
  });
  test('does not refire inside the cooldown', () => {
    const hits = run([['open to romans 8:28', 0], ['and again romans 8:28', 3000]], 9000);
    assert.deepEqual(hits, ['Romans 8:28']);
  });
  test('a second, different reference fires', () => {
    const hits = run([['open to romans 8:28', 0], ['then turn to john 3:16', 6000]], 12000);
    assert.deepEqual(hits, ['Romans 8:28', 'John 3:16']);
  });
});
