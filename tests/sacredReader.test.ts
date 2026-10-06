import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { worksForFaith, SACRED_WORKS } from '../data/sacredLibrary/readerCatalog';
import { plainText, parseQuran, parseGurbani, parseSefaria, parseArnoldGita, parseDhammapada } from '../services/sacredReaderCore';
import { searchLexicon, normalizeStrongToken } from '../services/lectioLexicon';
import { parseBundledKjv } from '../services/bundledBibleCore';

test('bundled Quran has 114 distinct surahs and 6236 correctly numbered ayahs', () => {
  const corpus = JSON.parse(readFileSync(new URL('../public/sacred/quran-pickthall.json', import.meta.url), 'utf8'));
  assert.equal(corpus.data.edition.identifier, 'en.pickthall');
  assert.equal(corpus.data.surahs.length, 114);
  assert.equal(corpus.data.surahs.reduce((n: number, s: any) => n + s.ayahs.length, 0), 6236);
  corpus.data.surahs.forEach((surah: any, i: number) => {
    const section = parseQuran(worksForFaith('islam')[0], i + 1, surah);
    assert.equal(section.segments.length, surah.ayahs.length);
    section.segments.forEach((segment, j) => { assert.equal(segment.locator, `${i + 1}:${j + 1}`); assert.ok(segment.text); });
  });
});
test('bundled KJV has every numbered chapter and verse and rejects an incomplete corpus', () => {
  const corpus = JSON.parse(readFileSync(new URL('../public/sacred/bible-kjv.json', import.meta.url), 'utf8'));
  const records = parseBundledKjv(corpus);
  assert.equal(records.length, 1189); assert.equal(records.reduce((n, c) => n + c.verses.length, 0), 31102);
  assert.equal(records.find(c => c.book === 43 && c.chapter === 3)!.verses.length, 36);
  assert.throws(() => parseBundledKjv({ ...corpus, books: corpus.books.slice(1) }));
});
test('complete Gita parses 18 chapters without license or chapter-end matter in reading passages', () => {
  const chapters = parseArnoldGita(readFileSync(new URL('../public/sacred/bhagavad-gita-arnold.txt', import.meta.url), 'utf8'));
  assert.equal(chapters.length, 18);
  assert.match(chapters[0], /Dhritirashtra/);
  for (const chapter of chapters) { assert.ok(chapter.length > 100); assert.doesNotMatch(chapter, /PROJECT GUTENBERG|HERE ENDETH CHAPTER|HERE ENDS CHAPTER/); }
});
test('complete Dhammapada contains all 423 ordered verses in 26 chapters', () => {
  const chapters = parseDhammapada(readFileSync(new URL('../public/sacred/dhammapada-muller.txt', import.meta.url), 'utf8'));
  assert.equal(chapters.length, 26); assert.equal(chapters.flatMap(c => c.verses).length, 414);
  assert.ok(chapters.flatMap(c => c.verses).some(verse => verse.id === '58-59'));
  assert.match(chapters[0].verses[0].text, /All that we are/);
  assert.equal(chapters.at(-1)!.verses.at(-1)!.id, '423');
  assert.doesNotMatch(chapters.at(-1)!.verses.at(-1)!.text, /PROJECT GUTENBERG/);
});
test('Jewish editions retain bilingual alignment, credits, and rights', () => {
  const section = parseSefaria(worksForFaith('judaism')[0], 1, { ref: 'Genesis 1', versions: [
    { language: 'en', versionTitle: 'Test English edition', license: 'Public Domain', text: ['First', 'Second'] },
    { language: 'he', versionTitle: 'Test Hebrew edition', license: 'CC-BY-SA', text: ['אחד', 'שני'] },
  ] });
  assert.equal(section.segments[1].original, 'שני');
  assert.equal(section.segments[1].text, 'Second'); assert.match(section.rights, /CC-BY-SA/);
  assert.equal(section.originalDirection, 'rtl');
  assert.throws(() => parseSefaria(worksForFaith('judaism')[0], 1, { error: 'missing' }));
});
test('Gurbani uses ang and source line IDs and rejects another source or page', () => {
  const work = worksForFaith('sikhism')[0];
  const source = { pageno: 1, source: { id: 1 }, page: [{ line: { id: 'abc', gurmukhi: { unicode: 'ੴ' }, translation: { english: { default: 'Test translation' } }, transliteration: { english: { text: 'test' } } } }] };
  assert.match(parseGurbani(work, 1, source).segments[0].locator, /Ang 1.*abc/);
  assert.throws(() => parseGurbani(work, 2, source));
  assert.throws(() => parseGurbani(work, 1, { ...source, source: { id: 2 } }));
});
test('provider markup becomes plain text and cannot execute scripts', () => {
  assert.equal(plainText('<script>evil()</script><b>word</b><br>one &amp; two'), 'word\none & two');
  assert.equal(plainText('&#999999999;'), '');
});
test('bundled lexicons match metadata counts and Hebrew token padding is preserved', () => {
  for (const id of ['strongsgreek', 'strongshebrew'] as const) {
    const raw = JSON.parse(readFileSync(new URL(`../public/sacred/lexicons/${id}.json`, import.meta.url), 'utf8'));
    const metadata = JSON.parse(readFileSync(new URL(`../public/sacred/lexicons/${id}-metadata.json`, import.meta.url), 'utf8'));
    assert.equal(metadata.license, 'Public Domain'); assert.equal(raw.entries.length, metadata.entry_count);
    assert.equal(new Set(raw.entries.map((e: any) => e.id)).size, raw.entries.length);
    const results = searchLexicon(raw, id === 'strongsgreek' ? 'G3056' : 'H7225');
    assert.equal(results.length, 1); assert.ok(results[0].text);
  }
  assert.equal(normalizeStrongToken('H00430', 'strongshebrew'), 'H0430');
  assert.equal(normalizeStrongToken('G00025', 'strongsgreek'), 'G25');
  assert.equal(normalizeStrongToken('H430', 'strongsgreek'), null);
});
test('all live non-Christian faiths have independently configured reader works', () => {
  for (const faith of ['buddhism','islam','judaism','hinduism','sikhism'] as const) assert.ok(worksForFaith(faith).length);
  assert.equal(new Set(SACRED_WORKS.map(work => work.id)).size, SACRED_WORKS.length);
});
test('every bundled edition agrees with its attributed integrity manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/sacred/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.schema, 'plajah-sacred-assets-v1');
  for (const asset of manifest.assets) {
    const bytes = readFileSync(new URL(`../public/sacred/${asset.file}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(asset.source && asset.rights && asset.edition);
  }
});
