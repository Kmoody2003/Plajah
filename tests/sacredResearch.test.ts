import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotebook, validateNotebook, mergeNotebooks, researchMarkdown, safeSourceUrl, researchSourceId } from '../services/sacredResearch';
const source = { id: 'a', faith: 'islam', kind: 'passage', title: 'Quran', locator: '1:1', edition: 'Test edition', text: 'Test passage', sourceUrl: 'https://example.org/source' };
test('notebook round trips preserve sources and personal interpretations', () => {
  const notebook = validateNotebook({ ...emptyNotebook(), sources: [source, { ...source, id: 'b', faith: 'christianity' }], comparisons: [{ id: 'c', left: 'a', right: 'b', relation: 'ethical analogy', similarities: 'Test', differences: 'Different', context: 'Context', status: 'personal interpretation' }] });
  assert.deepEqual(validateNotebook(JSON.parse(JSON.stringify(notebook))), notebook);
  assert.match(researchMarkdown(notebook), /https:\/\/example.org\/source/);
  assert.match(researchMarkdown(notebook), /personal interpretation/);
});
test('invalid links, duplicate sources and unsupported assertions are rejected', () => {
  assert.equal(safeSourceUrl('javascript:alert(1)'), ''); assert.equal(safeSourceUrl('https://user:secret@example.org'), '');
  assert.throws(() => validateNotebook({ ...emptyNotebook(), sources: [{ ...source, sourceUrl: 'javascript:alert(1)' }] }));
  assert.throws(() => validateNotebook({ ...emptyNotebook(), sources: [source, source] }));
  assert.throws(() => validateNotebook({ ...emptyNotebook(), sources: [source], comparisons: [{ id: 'c', left: 'a', right: 'missing', relation: 'historical context', status: 'reviewed', similarities: '', differences: '', context: '' }] }));
});
test('imports merge without replacing existing research', () => {
  const current = validateNotebook({ ...emptyNotebook(), sources: [source] });
  const incoming = validateNotebook({ ...emptyNotebook(), sources: [{ ...source, text: 'Changed' }, { ...source, id: 'b' }] });
  const merged = mergeNotebooks(current, incoming);
  assert.equal(merged.sources.length, 2); assert.equal(merged.sources[0].text, 'Test passage');
  assert.equal(researchSourceId('islam', 'quran', '1:1', 'A'), researchSourceId('islam', 'quran', '1:1', 'A'));
  assert.notEqual(researchSourceId('islam', 'quran', '1:1', 'A'), researchSourceId('islam', 'quran', '1:1', 'B'));
});
