import test from 'node:test';
import assert from 'node:assert/strict';
import { asTranslation, ensureLibraryIndex, fetchLibraryChapter, isLibrarySlug, libraryUrl, librarySlug, type LibraryTranslation } from '../services/bibleLibrary';
import { editionBooks } from '../services/bibleCanon';

const files: Record<string, unknown> = {
  'eng-web-c/index.json': { id: 'eng-web-c', books: [{ num: 1, chapters: [1, 2] }, { num: 69, chapters: [1, 2, 3] }, { num: 43, chapters: [1, 2, 3] }] },
  'eng-web-c/43.json': { b: 43, c: { '3': [[16, 'For God so loved the world…'], [17, 'For God didn’t send…']] } },
};
globalThis.fetch = (async (url: string) => {
  const key = Object.keys(files).find(k => decodeURIComponent(url).includes(k));
  return key ? new Response(JSON.stringify(files[key])) : new Response('', { status: 404 });
}) as typeof fetch;

test('library files live under bible/v1 in Firebase Storage, path-encoded', () => {
  const url = libraryUrl('eng-web-c/43.json');
  assert.match(url, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.+\/o\/bible%2Fv1%2Feng-web-c%2F43\.json\?alt=media$/);
});

test('library slugs are prefixed and never collide with getbible slugs', () => {
  assert.equal(librarySlug('engbsb'), 'eb.engbsb');
  assert.ok(isLibrarySlug('eb.engbsb'));
  assert.ok(!isLibrarySlug('kjv') && !isLibrarySlug('web'));
});

test('a catalog entry becomes a reader translation with testament and direction', () => {
  const base = { id: 'arb-vd', title: 'Van Dyck', fullTitle: '', lang: 'arb', langName: 'العربية', langEnglish: 'Arabic', dialect: '', script: 'Arabic',
    dir: 'rtl', licence: 'Public domain', licenceUrl: '', copyright: 'public domain', source: '', ot: true, nt: true, dc: false, books: 66, updated: '' } satisfies LibraryTranslation;
  assert.deepEqual(asTranslation(base), { slug: 'eb.arb-vd', label: 'Van Dyck', lang: 'arb', rtl: true, testament: 'BOTH' });
  assert.equal(asTranslation({ ...base, ot: false, dir: 'ltr' }).testament, 'NT');
});

test('a library edition lists only its own books, in canon order, with its chapter counts', async () => {
  await ensureLibraryIndex('eb.eng-web-c');
  assert.deepEqual(editionBooks('eb.eng-web-c').map(b => [b.num, b.chapters]), [[1, 2], [69, 3], [43, 3]]);
});

test('chapters come from the book file, verses in order', async () => {
  const verses = await fetchLibraryChapter('eb.eng-web-c', 43, 3);
  assert.deepEqual(verses.map(v => v.verse), [16, 17]);
  assert.deepEqual(await fetchLibraryChapter('eb.eng-web-c', 43, 9), []);
  assert.deepEqual(await fetchLibraryChapter('eb.missing', 1, 1), []);
});
