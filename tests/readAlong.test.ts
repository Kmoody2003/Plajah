import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadAlong } from '../services/readAlong.ts';

// John 3:14-18 (KJV) as the panel shows it.
const LINES = [
  { id: '14', text: 'And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:' },
  { id: '15', text: 'That whosoever believeth in him should not perish, but have eternal life.' },
  { id: '16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
  { id: '17', text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
  { id: '18', text: 'He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God.' },
];

const say = (r: ReturnType<typeof createReadAlong>, text: string, chunk = 3) => {
  const w = text.split(' ');
  let last = null;
  for (let i = 0; i < w.length; i += chunk) last = r.feed(w.slice(i, i + chunk).join(' '), i) ?? last;
  return last;
};

test('follows verse 16 as it is read, word by word', () => {
  const r = createReadAlong();
  r.setLines(LINES, 2);
  const p1 = say(r, 'for god so loved the world that he gave');
  assert.ok(p1);
  assert.equal(p1!.line, 2);
  assert.equal(p1!.word, 8); // "gave"
  const p2 = say(r, 'his only begotten son that whosoever believes in him');
  assert.equal(p2!.line, 2);
  assert.equal(p2!.word, 17); // "him"
});

test('verse 15 and 16 share words; the reader is placed by context', () => {
  const r = createReadAlong();
  r.setLines(LINES, 2);
  say(r, 'for god so loved the world that he gave his only begotten son');
  const p = say(r, 'that whosoever believeth in him should not perish');
  assert.equal(p!.line, 2, 'stays in 16, not the identical words of 15');
});

test('moves on into the next verse', () => {
  const r = createReadAlong();
  r.setLines(LINES, 2);
  say(r, 'but have everlasting life for god sent not his son into the world');
  const p = r.position();
  assert.equal(p!.line, 3);
});

test('modern wording and transcriber slips still match (hath / believes / the for thee)', () => {
  const r = createReadAlong();
  r.setLines(LINES, 4);
  const p = say(r, 'he that believes on him is not condemned but he that believes not is condemned already because he has not believed');
  assert.equal(p!.line, 4);
  assert.ok(p!.word >= 18, `word ${p!.word}`);
});

test('the sermon around the reading does not move it', () => {
  const r = createReadAlong();
  r.setLines(LINES, 2);
  assert.equal(say(r, 'good morning church turn with me in your bibles this morning'), null);
  say(r, 'for god so loved the world that he gave his only begotten son');
  const before = r.position()!;
  say(r, 'now isnt that something friends think about what it means to give');
  assert.deepEqual(r.position(), before, 'holds where the reading stopped');
});

test('a few common words alone never lock on', () => {
  const r = createReadAlong();
  r.setLines(LINES, 0);
  assert.equal(say(r, 'and the world is not'), null);
});

// John 3:16-17 as the World English Bible words it.
const WEB = [
  { id: '16', text: 'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.' },
  { id: '17', text: 'For God didn’t send his Son into the world to judge the world, but that the world should be saved through him.' },
];

test('a reader using another edition scores clearly higher against that edition', async () => {
  const { matchStrength } = await import('../services/readAlong.ts');
  const heard = 'for god so loved the world that he gave his one and only son that whoever believes in him should not perish but have eternal life for god didnt send his son into the world to judge the world';
  const web = matchStrength(WEB, heard), kjv = matchStrength(LINES.slice(2, 4), heard);
  assert.ok(web >= kjv + 5, `web ${web} kjv ${kjv}`);
  // …and a KJV reading still prefers KJV.
  const kjvHeard = 'for god so loved the world that he gave his only begotten son that whosoever believeth in him should not perish but have everlasting life for god sent not his son into the world to condemn the world';
  assert.ok(matchStrength(LINES.slice(2, 4), kjvHeard) >= matchStrength(WEB, kjvHeard) + 5);
});
