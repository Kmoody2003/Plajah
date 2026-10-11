// songFollow.test.ts — song follow aligner + detector, lyric parsing, typo text resolution.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/songFollow.test.ts --bundle --platform=node --format=esm --outfile=<tmp>/songFollow.test.mjs
//   node --test <tmp>/songFollow.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSongAligner, createSongDetector, wordsMatch, normWord } from '../services/ambo/songFollowCore';
import { parseLyricsText, songToText, sectionName } from '../services/ambo/songLibrary';
import { resolveTypoText, pickDataPath, dataBodyToText, type TypoTextState } from '../services/ambo/typoText';

const AMAZING = [
  'Amazing grace how sweet the sound',
  'That saved a wretch like me',
  'I once was lost but now am found',
  'Was blind but now I see',
];
const HOLY = [
  'Holy holy holy Lord God almighty',
  'Early in the morning our song shall rise to thee',
  'Holy holy holy merciful and mighty',
  'God in three persons blessed Trinity',
];
const BLESSED = [
  'Blessed assurance Jesus is mine',
  'O what a foretaste of glory divine',
  'Heir of salvation purchase of God',
  'Born of His Spirit washed in His blood',
];

describe('songFollowCore aligner', () => {
  test('words match with ASR drift', () => {
    assert.ok(wordsMatch('praise', 'praises'));
    assert.ok(wordsMatch('almighty', 'almighti'));
    assert.ok(!wordsMatch('god', 'good'));
    assert.equal(normWord("Lord's,"), normWord('lords'));
  });

  test('advances line by line as the song is sung', () => {
    const a = createSongAligner(AMAZING);
    a.feed('amazing grace how sweet the sound');
    assert.equal(a.position().line, 0);
    a.feed('that saved a wretch');
    assert.equal(a.position().line, 1);
    assert.equal(a.position().word, 3);
    assert.equal(a.position().offScript, false);
  });

  test('off script → adlib after N unmatched words, holds on last word, then resumes', () => {
    const a = createSongAligner(AMAZING, { adlibAfter: 3 });
    a.feed('amazing grace how sweet the sound that saved a wretch like me');
    const held = a.position();
    assert.equal(held.line, 1);
    const ev = a.feed('come on church lift your hands');
    assert.ok(ev.some(e => e.type === 'adlib-start'), 'adlib line starts');
    assert.equal(a.position().offScript, true);
    assert.equal(a.position().line, held.line, 'sync holds on the last sung line');
    const back = a.feed('i once was lost but now');
    assert.ok(back.some(e => e.type === 'resume'), 'picks the song back up');
    assert.equal(a.position().offScript, false);
    assert.equal(a.position().line, 2);
  });

  test('operator jump re-parks the follower', () => {
    const a = createSongAligner(AMAZING);
    a.jump(3);
    a.feed('was blind but now');
    assert.equal(a.position().line, 3);
  });
});

describe('songFollowCore detector', () => {
  const songs = [{ id: 'amazing', lines: AMAZING }, { id: 'holy', lines: HOLY }, { id: 'blessed', lines: BLESSED }];

  test('detects from the first line or two', () => {
    const d = createSongDetector(songs);
    d.feed('early in the morning our song shall rise');
    const hit = d.detect();
    assert.ok(hit, 'detected');
    assert.equal(hit!.songId, 'holy');
    assert.equal(hit!.line, 1);
  });

  test('stays quiet on unrelated speech', () => {
    const d = createSongDetector(songs);
    d.feed('good morning everyone please take your seats');
    assert.equal(d.detect(), null);
  });
});

describe('songLibrary parsing', () => {
  test('section markers become sections and round-trip', () => {
    const p = parseLyricsText('[Verse 1]\nLine a\nLine b\n\nChorus:\nLine c\n\n(Bridge)\nLine d');
    assert.deepEqual(p.lines, ['Line a', 'Line b', 'Line c', 'Line d']);
    assert.deepEqual(p.sections.map(s => s.name), ['Verse 1', 'Chorus', 'Bridge']);
    assert.deepEqual(parseLyricsText(songToText(p)), p);
  });
  test('sectionName', () => {
    assert.equal(sectionName('[Pre-Chorus]'), 'Pre-Chorus');
    assert.equal(sectionName('V2'), 'Verse 2');
    assert.equal(sectionName('Amazing grace'), null);
  });
});

describe('typo text', () => {
  const base = (over: Partial<TypoTextState['prefs']> = {}): TypoTextState => {
    const now = 1_000_000;
    return {
      prefs: {
        sendScripture: false, sendLyrics: false, customText: 'Custom words', dataUrl: '', dataPath: '', dataIntervalSec: 30,
        autoTranscribePlayback: true, ...over,
      },
      scripture: { text: 'For God so loved the world', at: now },
      lyrics: { text: 'Amazing grace', at: now },
      transcript: { text: '', at: 0 },
      data: { text: '42 people', at: now },
    };
  };
  const now = 1_000_000;

  test('explicit sources', () => {
    assert.equal(resolveTypoText('scripture', undefined, base(), now), 'For God so loved the world');
    assert.equal(resolveTypoText('custom', 'Hello', base(), now), 'Hello');
    assert.equal(resolveTypoText('data', undefined, base(), now), '42 people');
  });
  test('auto prefers sent lyrics, then sent scripture, then custom', () => {
    assert.equal(resolveTypoText('auto', undefined, base({ sendLyrics: true, sendScripture: true }), now), 'Amazing grace');
    assert.equal(resolveTypoText('auto', undefined, base({ sendScripture: true }), now), 'For God so loved the world');
    assert.equal(resolveTypoText('auto', undefined, base(), now), 'Custom words');
  });
  test('data path picking', () => {
    assert.equal(pickDataPath({ a: { b: [{ c: 'deep' }] } }, 'a.b.0.c'), 'deep');
    assert.equal(dataBodyToText('{"msg":"hi"}', 'msg'), 'hi');
    assert.equal(dataBodyToText('plain text', ''), 'plain text');
  });
});
