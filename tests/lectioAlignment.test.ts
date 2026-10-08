import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalStrong, findStrongOccurrences, greekSourceForms, type AlignmentBook, type StrongIndex } from '../services/lectioAlignment';
const root = 'public/sacred/alignment';
const read = (name: string) => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
test('source word groups retain multiple lemmas, Greek forms and morphology', () => {
  const john = read('kjv-43.json') as AlignmentBook;
  const groups = john.verses['1:1'].filter(s => s.strong?.includes('G3056'));
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].strong, ['G3588', 'G3056']);
  assert.deepEqual(greekSourceForms(groups[0]), ['ο', 'λογος']);
  assert.match(groups[0].morph!, /robinson:N-NSM/);
  assert.equal(john.verses['1:1'].map(s => s.text).join(''), 'In the beginning was the Word, and the Word was with God, and the Word was God.');
  const genesis = read('kjv-1.json') as AlignmentBook;
  assert.deepEqual(genesis.verses['1:1'][0].strong, ['H7225']);
});
test('all 31,102 verse alignments have verified snapshots and index counts agree with every word group', () => {
  const metadata = read('metadata.json'), index = read('kjv-strong-index.json') as StrongIndex;
  const expected: Record<string, number> = {}; let verses = 0;
  for (const file of metadata.files) {
    const bytes = fs.readFileSync(`${root}/${file.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    const book = JSON.parse(bytes.toString()) as AlignmentBook;
    assert.equal(Object.keys(book.verses).length, file.verses);
    verses += file.verses;
    for (const [locator, segments] of Object.entries(book.verses)) {
      const [chapter, verse] = locator.split(':').map(Number);
      for (const segment of segments) for (const id of segment.strong || []) {
        assert.equal(canonicalStrong(id), id);
        const key = `${id}/${book.book}/${chapter}/${verse}`;
        expected[key] = (expected[key] || 0) + 1;
      }
    }
  }
  assert.equal(verses, 31102);
  for (const [id, rows] of Object.entries(index.index)) for (const row of rows) {
    const key = `${id}/${row[0]}/${row[1]}/${row[2]}`;
    assert.equal(row[3], expected[key], key); delete expected[key];
  }
  assert.equal(Object.keys(expected).length, 0);
  assert.equal(Object.keys(index.index).length, metadata.strongIds);
  assert.equal(createHash('sha256').update(fs.readFileSync(`${root}/kjv.osis.xml`)).digest('hex'), metadata.sourceSha256);
});
test('Strong search normalizes padding and filters without losing complete counts', () => {
  const index = read('kjv-strong-index.json') as StrongIndex;
  assert.equal(canonicalStrong('h07225'), 'H7225'); assert.equal(canonicalStrong('G0'), null);
  const hits = findStrongOccurrences(index, 'G03056', 43);
  assert.ok(hits.length > 20);
  assert.equal(hits.find(row => row[1] === 1 && row[2] === 1)?.[3], 3);
  assert.ok(hits.every(row => row[0] === 43));
  assert.deepEqual(findStrongOccurrences(index, 'invalid'), []);
});
