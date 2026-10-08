// Shared notebook — Test Suite
// Run with: npm run test:notebook
//
// The contract: reader notes (verse notes, Sacred Library passage notes) and the
// Sacred Library research notebook all live in the ONE shared notebook
// (services/notebookService), and legacy device-only stores are imported once,
// never lost, never duplicated.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser surface: localStorage + window events. Signed out (guest), so
// nothing touches the network.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const storage = new MemoryStorage();
(globalThis as any).localStorage = storage;
if (!(globalThis as any).window) (globalThis as any).window = new EventTarget();

const { verseNotes, sacredReaderNotes } = await import('../services/readerNotes');
const { readNotebook, writeNotebook, pinResearchSource } = await import('../services/sacredResearch');
const { readCachedNotebook, notebookKey } = await import('../services/notebookService');

const source = (id: string) => ({ id, faith: 'christianity' as const, kind: 'passage' as const, title: 'John', locator: `John 1:${id.length}`,
  edition: 'KJV', text: 'In the beginning was the Word', sourceUrl: 'https://example.org/john' });

beforeEach(() => storage.clear());

describe('reader notes use the shared notebook', () => {
  test('verse notes are entries in the verseNotes bucket', () => {
    verseNotes.write('43:1:1', 'The Word');
    assert.deepEqual(verseNotes.read(), { '43:1:1': 'The Word' });
    const entries = readCachedNotebook(notebookKey('verseNotes'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, 'KEYED_NOTE');
    assert.equal(entries[0].key, '43:1:1');
    assert.equal(storage.getItem('plajah_bible_notes_v1'), null, 'nothing written to the old private map');
  });

  test('clearing a note removes its entry', () => {
    verseNotes.write('43:1:1', 'The Word');
    verseNotes.write('43:1:1', '   ');
    assert.deepEqual(verseNotes.read(), {});
    assert.equal(readCachedNotebook(notebookKey('verseNotes')).length, 0);
  });

  test('legacy verse-note map is imported once, without service receipts', () => {
    storage.setItem('plajah_bible_notes_v1', JSON.stringify({
      '45:8:28': 'All things',
      '19:23:1': 'Heard at 14:05 — Sunday service',
    }));
    assert.deepEqual(verseNotes.read(), { '45:8:28': 'All things' });
    verseNotes.write('45:8:28', 'Edited');
    assert.deepEqual(verseNotes.read(), { '45:8:28': 'Edited' }, 'legacy map does not re-import over edits');
  });

  test('sacred reader notes are a separate bucket of the same notebook', () => {
    storage.setItem('plajah_sacred_reader_notes_v1', JSON.stringify({ 'quran/1/x/3': 'Mercy' }));
    sacredReaderNotes.write('gita/2/y/47', 'Action without attachment');
    assert.deepEqual(sacredReaderNotes.read(), { 'quran/1/x/3': 'Mercy', 'gita/2/y/47': 'Action without attachment' });
    assert.deepEqual(verseNotes.read(), {}, 'buckets do not bleed into each other');
  });
});

describe('research notebook uses the shared notebook', () => {
  test('sources and comparisons are individual entries', () => {
    pinResearchSource(source('a'));
    pinResearchSource(source('bb'));
    const nb = readNotebook();
    writeNotebook({ ...nb, comparisons: [{ id: 'c1', left: 'a', right: 'bb', relation: 'shared wording', similarities: 's', differences: 'd', context: 'c', status: 'personal interpretation' }] });
    const entries = readCachedNotebook(notebookKey('sacredResearch'));
    assert.equal(entries.filter(e => e.type === 'RESEARCH_SOURCE').length, 2);
    assert.equal(entries.filter(e => e.type === 'RESEARCH_COMPARISON').length, 1);
    assert.equal(readNotebook().comparisons[0].id, 'c1');
    assert.equal(storage.getItem('plajah_sacred_research_v1'), null);
  });

  test('legacy research notebook is imported once', () => {
    storage.setItem('plajah_sacred_research_v1', JSON.stringify({ schema: 'plajah-sacred-research-v1', sources: [source('a')], comparisons: [] }));
    assert.equal(readNotebook().sources.length, 1);
    writeNotebook({ ...readNotebook(), sources: [] });
    assert.equal(readNotebook().sources.length, 0, 'a deleted source does not come back from the legacy store');
  });

  test('a comparison whose sources have not synced yet is held back, not an error', () => {
    pinResearchSource(source('a'));
    const key = notebookKey('sacredResearch');
    const list = JSON.parse(storage.getItem(key)!);
    list.push({ id: 'cmp:orphan', type: 'RESEARCH_COMPARISON', comparison: { id: 'orphan', left: 'a', right: 'missing', relation: 'shared wording', similarities: '', differences: '', context: '', status: 'personal interpretation' } });
    storage.setItem(key, JSON.stringify(list));
    assert.equal(readNotebook().comparisons.length, 0);
  });
});
