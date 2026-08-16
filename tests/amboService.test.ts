// amboService — Test Suite (text safety)
// Run with: npm run test:ambo
//
// The operator must never be the one deciding whether a verse fits on screen,
// so the splitter's contract is worth pinning down: never exceed the line
// budget, never break mid-phrase when a clause boundary was available, and
// never lose a word.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { wrapLines, splitForScreen, formatTC } from '../services/amboService';

const PSALM_119_LONGISH =
  'Thy word is a lamp unto my feet, and a light unto my path. I have sworn, and I will perform it, ' +
  'that I will keep thy righteous judgments. I am afflicted very much: quicken me, O LORD, according ' +
  'unto thy word. Accept, I beseech thee, the freewill offerings of my mouth, O LORD, and teach me thy judgments.';

const ROM_828 =
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.';

describe('wrapLines', () => {
  test('never exceeds the character budget', () => {
    for (const line of wrapLines(PSALM_119_LONGISH, 42)) {
      assert.ok(line.length <= 42, `"${line}" is ${line.length}`);
    }
  });

  test('loses no words', () => {
    const words = PSALM_119_LONGISH.split(/\s+/).length;
    assert.equal(wrapLines(PSALM_119_LONGISH, 42).join(' ').split(/\s+/).length, words);
  });

  test('a single over-long word still gets its own line rather than vanishing', () => {
    const lines = wrapLines('short Mahershalalhashbaz end', 10);
    assert.ok(lines.some(l => l.includes('Mahershalalhashbaz')));
    assert.equal(lines.join(' '), 'short Mahershalalhashbaz end');
  });
});

describe('splitForScreen', () => {
  test('a normal verse is one slide within budget', () => {
    const pages = splitForScreen(ROM_828, 'LOWER_THIRD');
    assert.equal(pages.length, 1);
    assert.ok(pages[0].length <= 3);
    for (const l of pages[0]) assert.ok(l.length <= 62);
  });

  test('a long passage pages, and every page stays within budget', () => {
    const pages = splitForScreen(PSALM_119_LONGISH, 'FULLSCREEN');
    assert.ok(pages.length > 1, 'should have paged');
    for (const page of pages) {
      assert.ok(page.length <= 6, `page had ${page.length} lines`);
      for (const l of page) assert.ok(l.length <= 42, `"${l}" is ${l.length}`);
    }
  });

  test('no word is lost across pages', () => {
    const before = PSALM_119_LONGISH.split(/\s+/).filter(Boolean).length;
    const after = splitForScreen(PSALM_119_LONGISH, 'FULLSCREEN')
      .flat().join(' ').split(/\s+/).filter(Boolean).length;
    assert.equal(after, before);
  });

  test('breaks at a clause boundary rather than mid-phrase', () => {
    const pages = splitForScreen(PSALM_119_LONGISH, 'FULLSCREEN');
    // Every page but the last should end on punctuation, not a stray word.
    for (const page of pages.slice(0, -1)) {
      const last = page[page.length - 1];
      assert.ok(/[.,;:—]$/.test(last.trim()), `page ended mid-phrase: "${last}"`);
    }
  });

  test('fullscreen fits fewer characters per line than a lower third', () => {
    const full = splitForScreen(ROM_828, 'FULLSCREEN');
    const lower = splitForScreen(ROM_828, 'LOWER_THIRD');
    assert.ok(full[0].length >= lower[0].length);
  });

  test('empty and whitespace input do not crash', () => {
    assert.deepEqual(splitForScreen('', 'LOWER_THIRD'), [[]]);
    assert.deepEqual(splitForScreen('   ', 'FULLSCREEN'), [[]]);
  });
});

describe('formatTC', () => {
  test('renders program timecode', () => {
    assert.equal(formatTC(0), '0:00');
    assert.equal(formatTC(9), '0:09');
    assert.equal(formatTC(1453), '24:13');
    assert.equal(formatTC(3600), '60:00');
  });
});
