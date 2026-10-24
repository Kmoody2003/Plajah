// Stage clean speech — profanity is omitted (not blurred/masked) from on-screen transcription.
// Run: npx tsx --test tests/stageCleanSpeech.test.ts
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
const SETTINGS = 'plajah_safety_settings_v1', DEFAULT = 'plajah_stage_clean_default_v1';

const { cleanTranscript, cleanLines, stageCleanSpeechOn } = await import('../services/ambo/cleanSpeech');
const { getCaption, publishCaption } = await import('../services/ambo/liveCaptionStore');

describe('stage clean speech', () => {
  beforeEach(() => store.clear());

  test('off by default for a personal account; on when the account default says so', () => {
    assert.equal(stageCleanSpeechOn(), false);
    assert.equal(cleanTranscript('what the fuck'), 'what the fuck');
    store.set(DEFAULT, '1');
    assert.equal(stageCleanSpeechOn(), true);
    assert.equal(cleanTranscript('what the fuck'), 'what the');
  });

  test('explicit setting beats the church default', () => {
    store.set(DEFAULT, '1');
    store.set(SETTINGS, JSON.stringify({ stageCleanSpeech: false }));
    assert.equal(stageCleanSpeechOn(), false);
    store.set(DEFAULT, '0');
    store.set(SETTINGS, JSON.stringify({ stageCleanSpeech: true }));
    assert.equal(stageCleanSpeechOn(), true);
  });

  test('omits the word as if never said — no blur, no stars, punctuation kept', () => {
    const c = (t: string) => cleanTranscript(t, true);
    assert.equal(c('This is shit.'), 'This is.');
    assert.equal(c('Oh shit, he said'), 'Oh he said');
    assert.equal(c('Holy SH!T you guys'), 'Holy you guys');
    assert.equal(c('that was f***ing great'), 'that was great');
    assert.doesNotMatch(c('fuck this'), /★|\*/);
  });

  test('sermon words stay: hell, damnation, class, assist, Scunthorpe', () => {
    const t = 'Heaven and hell, damnation, the class will assist Scunthorpe.';
    assert.equal(cleanTranscript(t, true), t);
  });

  test('custom words and phrases are saved in settings and omitted', () => {
    store.set(SETTINGS, JSON.stringify({ stageCleanSpeech: true, stageCleanWords: ['crap', 'oh my god'] }));
    assert.equal(cleanTranscript('Oh my God that is crap'), 'that is');
    assert.equal(cleanTranscript('Crap!'), '');
  });

  test('a caption line made only of filtered words disappears', () => {
    assert.deepEqual(cleanLines(['Amen', 'fuck', 'and praise'], true), ['Amen', 'and praise']);
  });

  test('published captions (what output windows receive) are clean', () => {
    store.set(SETTINGS, JSON.stringify({ stageCleanSpeech: true }));
    publishCaption(['we shit you not', 'amen'], true);
    assert.deepEqual(getCaption().lines, ['we you not', 'amen']);
  });
});
