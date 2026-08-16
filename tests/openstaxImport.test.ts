// openstaxImport tests — the HTML→text conversion and the chapter-heading contract.
//
// The heading format is the load-bearing part: BookReader rebuilds a textbook's table of
// contents by regex-matching `Chapter N` in the plain text. If buildBookText stops emitting
// exactly that shape, a 300-page textbook silently collapses into one giant "Complete Work"
// chapter — it still renders, so nothing errors, and the regression is invisible without this.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlToReadableText, decodeEntities, licenseFromCcUrl, flattenToc, buildBookText,
  chapterHeading, disguiseFalseHeadings,
  type OpenStaxBookRef, type OpenStaxPage,
} from '../services/openstaxImport';

// The regex BookReader.tsx uses. Kept in sync deliberately — see the note above.
const CHAPTER_RE = /^((?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume|ACT|Act|SECTION|Section)\s+(?:\d+|[IVXLCDM]+)(?:[.:—\s][^\n]*)?)\s*$/mg;

// ── Licence mapping ─────────────────────────────────────────────────────────────

test('the most specific Creative Commons variant wins', () => {
  // "by-nc-sa" contains "by-nc", which contains "by" — a loose matcher silently
  // relicenses NonCommercial material as CC BY, which is the whole exposure.
  assert.equal(licenseFromCcUrl('http://creativecommons.org/licenses/by-nc-sa/4.0/'), 'CC-BY-NC-SA');
  assert.equal(licenseFromCcUrl('http://creativecommons.org/licenses/by-nc/4.0/'), 'CC-BY-NC');
  assert.equal(licenseFromCcUrl('http://creativecommons.org/licenses/by-sa/4.0/'), 'CC-BY-SA');
  assert.equal(licenseFromCcUrl('http://creativecommons.org/licenses/by/4.0/'), 'CC-BY');
  assert.equal(licenseFromCcUrl(''), null);
  assert.equal(licenseFromCcUrl('https://example.com/some-other-terms'), null);
});

// ── HTML → text ─────────────────────────────────────────────────────────────────

test('style and script blocks are dropped entirely, not just untagged', () => {
  // Every OpenStax page opens with a STYLING_FOR_DEVS <style> block; stripping tags alone
  // would leave raw CSS as the first paragraph of every chapter.
  const html = '<style>/* STYLING_FOR_DEVS */ :target { background: #ffc; }</style><p>Real content.</p>';
  const out = htmlToReadableText(html);
  assert.equal(out, 'Real content.');
  assert.ok(!out.includes('STYLING_FOR_DEVS'));
  assert.ok(!out.includes('background'));
});

test('figure alt text is preserved rather than dropped', () => {
  const out = htmlToReadableText('<p>See below.</p><img src="x.png" alt="A pendulum at rest"/>');
  assert.match(out, /\[Figure: A pendulum at rest\]/);
});

test('block elements become paragraph breaks and list items get markers', () => {
  const out = htmlToReadableText('<h2>Newton’s Laws</h2><p>First.</p><ul><li>One</li><li>Two</li></ul>');
  assert.match(out, /Newton’s Laws\n\nFirst\.\n\n• One\n\n• Two/);
});

test('entities are decoded, including numeric and hex forms', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('5 &times; 3'), '5 × 3');
  assert.equal(decodeEntities('&#8212;'), '—');
  assert.equal(decodeEntities('&#x2264;'), '≤');
  assert.equal(decodeEntities('&nosuchentity;'), '&nosuchentity;');
});

test('runs of blank lines collapse and the result is trimmed', () => {
  const out = htmlToReadableText('<div></div><div></div><p>Only line.</p><div></div>');
  assert.equal(out, 'Only line.');
});

test('empty or missing HTML yields an empty string rather than throwing', () => {
  assert.equal(htmlToReadableText(''), '');
  assert.equal(htmlToReadableText(undefined as unknown as string), '');
});

// ── Table of contents ───────────────────────────────────────────────────────────

const TREE = {
  contents: [
    { id: 'preface@1', title: 'Preface' },
    {
      title: '1 <span>Whole Numbers</span>',
      contents: [
        { id: 'intro-1@1', title: 'Introduction' },
        { id: 'sec-1-1@1', title: '1.1 Place Value' },
      ],
    },
    {
      title: '2 Motion',
      contents: [{ id: 'sec-2-1@1', title: '2.1 Velocity' }],
    },
    { title: 'Appendix A', contents: [{ id: 'appA@1', title: 'Units' }] },
  ],
};

test('leaf pages are flattened and tagged with their chapter, front matter excluded', () => {
  const pages = flattenToc(TREE);
  assert.equal(pages.length, 5);

  const preface = pages[0];
  assert.equal(preface.title, 'Preface');
  assert.equal(preface.chapterNumber, null, 'front matter must not inherit a chapter');

  assert.equal(pages[1].chapterNumber, 1);
  assert.equal(pages[1].chapterTitle, '1 Whole Numbers', 'markup in the unit title must be stripped');
  assert.equal(pages[3].chapterNumber, 2);

  // An unnumbered unit is not a chapter — numbering it would invent structure.
  assert.equal(pages[4].chapterNumber, null);
});

test('page ids drop the @version suffix', () => {
  assert.equal(flattenToc(TREE)[0].id, 'preface');
});

// Biology for AP Courses nests unit → chapter → page. Keying chapters off depth alone found
// none of them, and the whole 5 MB book collapsed into a single unreadable chapter.
const UNIT_TREE = {
  contents: [
    { id: 'preface@1', title: 'Preface' },
    {
      title: 'Unit 1 The Chemistry of Life',
      contents: [
        { title: 'Chapter 1 The Study of Life', contents: [{ id: 'p1@1', title: '1.1 Themes' }] },
        { title: 'Chapter 2 The Chemical Foundation', contents: [{ id: 'p2@1', title: '2.1 Atoms' }] },
      ],
    },
    { title: 'Appendix A', contents: [{ id: 'appA@1', title: 'Periodic Table' }] },
  ],
};

test('chapters nested under a unit are still found', () => {
  const pages = flattenToc(UNIT_TREE);
  const byId = Object.fromEntries(pages.map(p => [p.id, p]));
  assert.equal(byId['p1'].chapterNumber, 1);
  assert.equal(byId['p2'].chapterNumber, 2);
  assert.equal(byId['preface'].chapterNumber, null);
  assert.equal(byId['appA'].chapterNumber, null, 'an appendix belongs to no chapter');
});

test('a unit heading is never itself treated as a chapter', () => {
  // "Unit 1 The Chemistry of Life" leading with a word means the bare-number rule must not fire.
  const text = buildBookText(BOOK, flattenToc(UNIT_TREE).map(p => ({ ...p, text: 'x' })));
  assert.ok(!/Chapter 1 — Unit 1/.test(text));
  assert.match(text, /Chapter 1 — Chapter 1 The Study of Life|Chapter 1 — The Study of Life/);
});

test('a book of units yields one heading per chapter, not per unit', () => {
  const text = buildBookText(BOOK, flattenToc(UNIT_TREE).map(p => ({ ...p, text: 'x' })));
  assert.equal((text.match(CHAPTER_RE) ?? []).length, 2);
});

// ── Book text assembly ──────────────────────────────────────────────────────────

const BOOK: OpenStaxBookRef = {
  slug: 'physics', title: 'Physics', bookId: 'abc', version: 'v1',
  archiveUrl: '/apps/archive/x', license: 'CC-BY',
  licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
};

const withText = (pages: OpenStaxPage[]): Array<OpenStaxPage & { text: string }> =>
  pages.map(p => ({ ...p, text: `Body of ${p.title}.` }));

test('emitted chapter headings match the regex BookReader splits on', () => {
  const text = buildBookText(BOOK, withText(flattenToc(TREE)));
  // The regex consumes the trailing newline via `\s*$`, so compare on the trimmed match.
  const found = (text.match(CHAPTER_RE) ?? []).map(m => m.trim());
  assert.equal(found.length, 2, `expected 2 chapter headings, got ${found.length}`);
  assert.equal(found[0], 'Chapter 1 — Whole Numbers');
  assert.equal(found[1], 'Chapter 2 — Motion');
});

test('the chapter heading does not repeat the leading number', () => {
  // OpenStax unit titles already start with the number ("1 Whole Numbers"); left in, the
  // heading reads "Chapter 1 — 1 Whole Numbers".
  const text = buildBookText(BOOK, withText(flattenToc(TREE)));
  assert.ok(!/Chapter 1 — 1 /.test(text));
});

test('attribution and the free-to-read policy are baked into the text itself', () => {
  const text = buildBookText(BOOK, withText(flattenToc(TREE)));
  assert.match(text, /Licence: CC-BY/);
  assert.match(text, /Access this book for free at openstax\.org\./);
  assert.match(text, /Plajah does not charge for textbooks\./);
});

test('NonCommercial and ShareAlike terms are stated for restricted titles', () => {
  const nc = buildBookText(
    { ...BOOK, license: 'CC-BY-NC-SA', licenseUrl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/' },
    withText(flattenToc(TREE)),
  );
  assert.match(nc, /NonCommercial: this text may not be used for commercial purposes\./);
  assert.match(nc, /ShareAlike: adaptations must be shared under the same licence\./);

  // A CC BY book must NOT carry restrictions it doesn't have.
  const by = buildBookText(BOOK, withText(flattenToc(TREE)));
  assert.ok(!by.includes('NonCommercial:'));
  assert.ok(!by.includes('ShareAlike:'));
});

// ── False headings ──────────────────────────────────────────────────────────────
// Textbook prose says things like "Chapter 1 reviews arithmetic operations…". Because the
// reader anchors on the start of a line, those parse as chapter headings: Elementary Algebra
// published with 175 "chapters" instead of 10. Only checking the FINISHED file caught it.

test('prose that begins like a heading does not become one', () => {
  const pages = flattenToc(TREE).map(p => ({
    ...p,
    text: 'Chapter 1 reviews arithmetic operations with whole numbers.\nOrdinary line.',
  }));
  const text = buildBookText(BOOK, pages);
  const found = (text.match(CHAPTER_RE) ?? []).map(m => m.trim());
  assert.equal(found.length, 2, `body prose leaked into the contents list: ${JSON.stringify(found)}`);
  assert.ok(found.every(h => /^Chapter \d+ — /.test(h)), 'only emitted headings should match');
});

test('the disguise is a single leading space, so the prose still reads normally', () => {
  const out = disguiseFalseHeadings('Chapter 4 explains motion.\nPlain line.');
  assert.equal(out, ' Chapter 4 explains motion.\nPlain line.');
  assert.equal(out.trim(), 'Chapter 4 explains motion.\nPlain line.'.trim().replace(/^/, ''));
  // Lines that were never at risk are left exactly alone.
  assert.equal(disguiseFalseHeadings('Plain line.'), 'Plain line.');
});

test('a keyword sitting above a number in a table is not a heading either', () => {
  // Real case: unit-conversion tables print "Volume" on its own line above "1 liter (L) = …".
  // The reader's `\s+` crosses newlines, so that parsed as a chapter — a per-line check alone
  // could not see it, because the keyword line has no number on it.
  const table = 'Volume\n1 liter (L) = 10-3 m3';
  assert.equal(disguiseFalseHeadings(table), ' Volume\n1 liter (L) = 10-3 m3');

  // Blank lines between the two must not hide it.
  assert.equal(disguiseFalseHeadings('Volume\n\n1 foot = 12 inches'), ' Volume\n\n1 foot = 12 inches');

  // A bare keyword NOT followed by a number is ordinary prose and must be left alone.
  assert.equal(disguiseFalseHeadings('Volume\nis measured in litres.'), 'Volume\nis measured in litres.');
});

test('published-shaped text yields only the headings we emitted', () => {
  const pages = flattenToc(TREE).map(p => ({
    ...p,
    text: 'Chapter 1 reviews arithmetic.\n\nVolume\n\n1 liter (L) = 10-3 m3\n\nSection 4 covers ratios.',
  }));
  const found = (buildBookText(BOOK, pages).match(CHAPTER_RE) ?? []).map(m => m.trim());
  assert.deepEqual(found, ['Chapter 1 — Whole Numbers', 'Chapter 2 — Motion']);
});

test('a chapter heading never repeats the number the source already carries', () => {
  assert.equal(chapterHeading(1, 'Chapter 1 Whole Numbers'), 'Chapter 1 — Whole Numbers');
  assert.equal(chapterHeading(3, '3 Motion'), 'Chapter 3 — Motion');
  assert.equal(chapterHeading(5, 'Chapter 5: Motion in Two Dimensions'), 'Chapter 5 — Motion in Two Dimensions');
  assert.equal(chapterHeading(2, null), 'Chapter 2');
});

test('every page body survives into the assembled text', () => {
  const pages = withText(flattenToc(TREE));
  const text = buildBookText(BOOK, pages);
  for (const p of pages) assert.ok(text.includes(p.text), `lost "${p.text}"`);
});
