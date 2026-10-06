import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpeechText } from '../services/aria/ariaSpeech';

test('respells product names the way Plajah says them', () => {
  assert.equal(
    prepareSpeechText('Welcome to Plajah! Try Chora for music and Reello for video.'),
    'Welcome to Plah-yah! Try Koh-rah for music and Ree-loh for video.',
  );
  assert.equal(prepareSpeechText("Plajah's best, and Plajah+ is more."), "Plah-yah's best, and Plah-yah Plus is more.");
});

test('does not mangle words that merely contain a name', () => {
  assert.equal(prepareSpeechText('The chorale and a choral piece'), 'The chorale and a choral piece');
});

test('strips markdown, links, code and urls', () => {
  const out = prepareSpeechText('## Hi\n**Bold** and _soft_ with [a link](https://x.com) and https://y.com and `code`.\n- one\n- two');
  assert.equal(out, 'Hi Bold and soft with a link and and code. one two');
});

test('drops protocol blocks and fenced code', () => {
  const out = prepareSpeechText('Done — added it. <ARIA_ACTION>{"id":"x","params":{"t":"secret"}}</ARIA_ACTION>\n```js\nconst a=1\n```\nAnything else?');
  assert.equal(out, 'Done — added it. Anything else?');
});

test('removes emoji', () => {
  assert.equal(prepareSpeechText('Nice work 🎉✨ really'), 'Nice work really');
});

test('truncates on a sentence boundary', () => {
  const s = 'One sentence here. '.repeat(200);
  const out = prepareSpeechText(s, 100);
  assert.ok(out.length <= 100);
  assert.ok(out.endsWith('.'));
});

test('non-strings and empties give empty text', () => {
  assert.equal(prepareSpeechText(undefined), '');
  assert.equal(prepareSpeechText(42), '');
  assert.equal(prepareSpeechText('   '), '');
});
