import test from 'node:test';
import assert from 'node:assert/strict';
import { readerNotesStructure, mergeReaderNotes, parseVerseKey, parseSacredKey, SCRIPTURE_NOTEBOOK, SCRIPTURE_SECTIONS } from '../services/notesScripture';
import { entriesToStructure, searchPages, UNFILED_NOTEBOOK } from '../services/notesStructure';
import type { ResearchNotebook } from '../services/sacredResearch';

test('verse and passage keys parse, including canon prefixes and slashes in titles', () => {
  assert.deepEqual(parseVerseKey('45:8:28'), { canon: '', book: 45, chapter: 8, verse: 28 });
  assert.deepEqual(parseVerseKey('catholic.27:3:1'), { canon: 'catholic', book: 27, chapter: 3, verse: 1 });
  assert.equal(parseVerseKey('heard-at-vespers'), null);
  assert.deepEqual(parseSacredKey('quran/Al-Fatiha/Sahih International/3'), { workId: 'quran', title: 'Al-Fatiha', edition: 'Sahih International', segment: '3' });
  assert.deepEqual(parseSacredKey('gita/Ch. 2/Arnold/1885/47'), { workId: 'gita', title: 'Ch. 2/Arnold', edition: '1885', segment: '47' });
  assert.equal(parseSacredKey('too/short'), null);
});

test('no reader notes → no Scripture notebook; sections appear only with content', () => {
  const empty = readerNotesStructure({ verse: {}, sacred: {}, research: null });
  assert.equal(empty.notebooks.length, 0); assert.equal(empty.sections.length, 0); assert.equal(empty.pages.length, 0);
  const onlyVerses = readerNotesStructure({ verse: { '43:3:16': 'Love' }, sacred: { 'x/y/z/1': '   ' }, research: { schema: 'plajah-sacred-research-v1', sources: [], comparisons: [] } });
  assert.deepEqual(onlyVerses.notebooks.map(n => n.id), [SCRIPTURE_NOTEBOOK]);
  assert.deepEqual(onlyVerses.sections.map(s => s.id), [SCRIPTURE_SECTIONS.verses]);
});

test('verse notes group by book (canon apart) and sort chapter → verse with readable refs', () => {
  const s = readerNotesStructure({
    verse: { '45:12:1': 'Living sacrifice', '45:8:28': 'All things', '1:1:1': 'Beginning', '45:8:3': 'Flesh', 'catholic.74:2:1': 'Sirach note', 'odd-key': 'Kept' },
    sacred: {},
  });
  const verses = s.pages.filter(p => p.sectionId === SCRIPTURE_SECTIONS.verses);
  assert.deepEqual(verses.map(p => p.title), ['Genesis', 'Romans', 'Sirach (Catholic canon)', 'Other verse notes']);
  const romans = verses[1];
  assert.equal(romans.reader?.kind, 'verse');
  assert.deepEqual(romans.reader?.items.map(i => i.label), ['Romans 8:3', 'Romans 8:28', 'Romans 12:1']);
  assert.deepEqual(romans.reader?.items.map(i => i.key), ['45:8:3', '45:8:28', '45:12:1']);
  assert.equal(romans.reader?.items[1].refId, '45.8.28');
  assert.ok(romans.reader?.items.every(i => i.editable));
  assert.equal(verses[2].reader?.items[0].key, 'catholic.74:2:1'); // the original key, so edits write back to the right note
  assert.ok(romans.notebookId === SCRIPTURE_NOTEBOOK && !romans.telaDocId);
});

test('Sacred Library notes group per work + edition in natural segment order', () => {
  const s = readerNotesStructure({ verse: {}, sacred: { 'quran/Al-Fatiha/Sahih/10': 'ten', 'quran/Al-Fatiha/Sahih/2': 'two', 'dhammapada/Dhammapada/Müller/1': 'mind' } });
  const pages = s.pages.filter(p => p.sectionId === SCRIPTURE_SECTIONS.sacred);
  assert.deepEqual(pages.map(p => p.title), ['Al-Fatiha (Sahih)', 'Dhammapada (Müller)']);
  assert.deepEqual(pages[0].reader?.items.map(i => i.key), ['quran/Al-Fatiha/Sahih/2', 'quran/Al-Fatiha/Sahih/10']);
  assert.equal(pages[0].reader?.kind, 'sacred');
});

test('research notebook maps to a read-only sources page plus one page per comparison', () => {
  const research: ResearchNotebook = {
    schema: 'plajah-sacred-research-v1',
    sources: [
      { id: 'a', faith: 'christianity' as any, kind: 'passage', title: 'Matthew', locator: '7:12', edition: 'KJV', text: 'Do unto others', sourceUrl: 'https://example.org/a' },
      { id: 'b', faith: 'judaism' as any, kind: 'passage', title: 'Shabbat', locator: '31a', edition: 'Soncino', text: 'What is hateful to you', sourceUrl: '' },
    ],
    comparisons: [{ id: 'c1', left: 'a', right: 'b', relation: 'ethical analogy', similarities: 'Golden rule', differences: 'Positive vs negative', context: '', status: 'personal interpretation' }],
  };
  const s = readerNotesStructure({ verse: {}, sacred: {}, research });
  assert.deepEqual(s.sections.map(x => x.title), ['Research notebook']);
  const pages = s.pages.filter(p => p.sectionId === SCRIPTURE_SECTIONS.research);
  assert.deepEqual(pages.map(p => p.title), ['Pinned sources', 'Matthew ↔ Shabbat']);
  assert.ok(pages.every(p => p.reader?.items.every(i => !i.editable)));
  assert.deepEqual(pages[1].reader?.items.map(i => i.label), ['Matthew 7:12 ↔ Shabbat 31a', 'Similarities', 'Differences']);
});

test('reader notes merge into the general structure, replace on refresh, and are searchable', () => {
  const base = entriesToStructure([{ id: 'p1', type: 'PAGE', title: 'Algebra', text: 'x squared', notebookId: UNFILED_NOTEBOOK, sectionId: 'sec_unfiled', updatedAt: 5 }]);
  const first = mergeReaderNotes(base, readerNotesStructure({ verse: { '45:8:28': 'all things work together' }, sacred: {} }));
  assert.ok(first.notebooks.some(n => n.id === SCRIPTURE_NOTEBOOK));
  assert.equal(first.pages.length, 2);
  assert.deepEqual(searchPages(first.pages, 'work together').map(p => p.title), ['Romans']);
  assert.deepEqual(searchPages(first.pages, 'romans 8:28').map(p => p.title), ['Romans']);
  // A later refresh replaces the old reader pages rather than stacking them.
  const second = mergeReaderNotes(first, readerNotesStructure({ verse: {}, sacred: {} }));
  assert.equal(second.notebooks.some(n => n.id === SCRIPTURE_NOTEBOOK), false);
  assert.deepEqual(second.pages.map(p => p.id), ['p1']);
});
