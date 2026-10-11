// speechIntents — action-word tagging + giving intent.
// Run with: npx tsx --test tests/amboSpeechIntents.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tagTokens, detectGivingIntent, createGivingListener } from '../services/ambo/speechIntents';

const tagged = (s: string) => {
  const toks = s.split(' ');
  const tags = tagTokens(toks);
  return toks.map((t, i) => (tags[i] ? `${t}<${tags[i]}>` : t)).join(' ');
};

describe('tagTokens', () => {
  test('a spoken reference lights up, book through verse', () => {
    assert.equal(tagged('so john three sixteen says'), 'so john<scripture> three<scripture> sixteen<scripture> says');
    assert.equal(tagged('romans chapter eight verse 28 today'), 'romans<scripture> chapter<scripture> eight<scripture> verse<scripture> 28<scripture> today');
    assert.equal(tagged('second peter 3:9'), 'second<scripture> peter<scripture> 3:9<scripture>');
  });
  test('a book name with no number stays plain', () => {
    assert.equal(tagged('mark my words'), 'mark my words');
    assert.equal(tagged('the acts of the apostles'), 'the acts of the apostles');
  });
  test('scripture cue phrases', () => {
    assert.equal(tagged('turn with me to psalm 23'), 'turn<cue> with<cue> me<cue> to<cue> psalm<scripture> 23<scripture>');
    assert.equal(tagged('open your bibles please'), 'open<cue> your<cue> bibles<cue> please');
  });
  test('giving words and phrases', () => {
    assert.equal(tagged('we bring our tithes and offerings'), 'we bring<giving> our<giving> tithes<giving> and<giving> offerings<giving>');
    assert.equal(tagged('a generous offering'), 'a generous offering<giving>');
  });
});

describe('detectGivingIntent', () => {
  test('fires on giving phrases', () => {
    for (const s of [
      "it's time for our tithes and offerings",
      'the ushers will come forward',
      "let's receive today's offering",
      'this is our time of giving',
      'you can text to give or give online',
      'now is the time to give',
    ]) assert.ok(detectGivingIntent(s), s);
  });
  test('does not fire on everyday giving language', () => {
    for (const s of [
      'give thanks to the lord',
      "let's give thanks",
      'offering our praise to god',
      "it's time to give thanks",
      'a time of giving praise',
      'the wise men bring gifts',
      'god gave his only son',
    ]) assert.equal(detectGivingIntent(s), null, s);
  });
});

describe('createGivingListener', () => {
  test('settles, fires once, then cools down', () => {
    const l = createGivingListener({ settleMs: 500, cooldownMs: 10_000 });
    l.feed("let's receive", 0);
    l.feed('the offering', 100);
    assert.ok(l.pending());
    assert.deepEqual(l.poll(400), []);
    assert.equal(l.poll(700).length, 1);
    l.feed('tithes and offerings', 1000);
    assert.deepEqual(l.poll(3000), []);
    l.feed('tithes and offerings', 12_000);
    assert.equal(l.poll(13_000).length, 1);
  });
  test('later words can take a pending trigger back', () => {
    const l = createGivingListener({ settleMs: 500 });
    l.feed("it's time to give", 0);
    assert.ok(l.pending());
    l.feed('thanks to god', 200);
    assert.equal(l.pending(), null);
    assert.deepEqual(l.poll(1000), []);
  });
});
