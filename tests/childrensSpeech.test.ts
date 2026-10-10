import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childrensSpeechText } from '../services/aria/childrensSpeech';
import { isChildrensBook } from '../services/living/audio/audience';
import { createAriaClient } from '../services/living/audio/narration';

test('tone: trailing dots, dashes and drawn-out spellings are flattened', () => {
  assert.equal(childrensSpeechText('And then... the moon came up...'), 'And then, the moon came up.');
  assert.equal(childrensSpeechText('Bramble tucked in — snug as a bug.'), 'Bramble tucked in, snug as a bug.');
  assert.equal(childrensSpeechText('Mmmm, that was warm. Ooooh! Sooooo soft.'), 'Mm, that was warm. Oh! So soft.');
  assert.equal(childrensSpeechText('Shhhhh, now.'), 'Shh, now.');
  assert.equal(childrensSpeechText('What?! No!!!'), 'What? No!');
});

test('sound words in capitals read as words; short capitals and normal text are untouched', () => {
  assert.equal(childrensSpeechText('BEEP! said Bo. I am POP.'), 'Beep! said Boh. I am Pop.');
  assert.equal(childrensSpeechText('A big blue bus.'), 'A big blue bus.');
});

test('pronunciation: names the voice gets wrong', () => {
  assert.equal(childrensSpeechText('Lumi glowed and Mira smiled.'), 'Loo-mee glowed and Mee-rah smiled.');
  assert.match(childrensSpeechText('Zib played the kazoo.'), /Zibb played the kuh-ZOO\./);
});

test('plain sentences pass through unchanged and empty input is safe', () => {
  const s = 'The little fox walked home under the stars.';
  assert.equal(childrensSpeechText(s), s); assert.equal(childrensSpeechText(''), '');
});

test('isChildrensBook: clear signals only', () => {
  assert.equal(isChildrensBook({ showcase: { ageMax: 6 } }), true);
  assert.equal(isChildrensBook({ genre: "Children's Picture Books" }), true);
  assert.equal(isChildrensBook({ tags: ['bedtime', 'lullaby'] }), true);
  assert.equal(isChildrensBook({ genre: 'Thriller', tags: ['crime'] }), false);
  assert.equal(isChildrensBook({ showcase: { ageMax: 16 } }), false);
  assert.equal(isChildrensBook({ bookMeta: { audience: { maxAge: 8, adult: true } } }), false);
  assert.equal(isChildrensBook(null), false);
});

test('the client sends the storybook style only when asked, and caches the two voices separately', async () => {
  const bodies: any[] = []; let n = 0;
  const f = (async (_u: string, init: any) => { bodies.push(JSON.parse(init.body)); n++; return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(n) }; }) as any;
  const c = createAriaClient({ getToken: async () => 't', fetchImpl: f });
  const a = await c.fetchAudio('Hello', undefined);
  const b = await c.fetchAudio('Hello', undefined, 'storybook');
  const b2 = await c.fetchAudio('Hello', undefined, 'storybook');
  assert.deepEqual(bodies, [{ text: 'Hello' }, { text: 'Hello', style: 'storybook' }]);
  assert.notEqual(a!.byteLength, b!.byteLength); assert.equal(b!.byteLength, b2!.byteLength);
});
