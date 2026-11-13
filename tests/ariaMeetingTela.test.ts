// Aria's notes page through Tela's real op reducer and story-backed Writer: Aria's own rewrites are
// recognised as hers (replace), a person's edit is recognised as theirs (append only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTelaOp } from '../components/tela/telaOps';
import { storyFromBlocks } from '../services/text/document';
import { EMPTY_NOTES, mergeIntoPage, notesToBlocks, NEW_FROM_ARIA } from '../services/meetings/ariaMeetingCore';
import type { TelaDoc, TelaWriterDevice } from '../types';

const meta = { title: 'Food drive', startedAt: 1_700_000_000_000, speakers: ['Dana', 'Marcus'], lane: 'cloud' as const, live: true };

test('Aria page round-trips through applyTelaOp + story', () => {
  const v1 = notesToBlocks({ ...EMPTY_NOTES, summary: 'Planning.', actions: [{ text: 'Call Gleaners', owner: 'Marcus' }] }, meta);
  const w: TelaWriterDevice = { id: 'dev_a', type: 'WRITER', blocks: v1, story: storyFromBlocks(v1) };
  let doc = { id: 'd', title: 't', frames: [], devices: {}, updatedAt: 0 } as unknown as TelaDoc;
  doc = applyTelaOp(doc, { type: 'ADD_FRAME', frame: { id: 'f', kind: 'PAPER', preset: 'LETTER', x: 0, y: 0, w: 816, h: 1056, deviceIds: ['dev_a'], label: 'Meeting notes · Aria' }, devices: [w] });
  const read = () => (doc.devices['dev_a'] as TelaWriterDevice).blocks;

  // Step 2: page untouched → Aria replaces it, and what lands reads back as hers.
  const v2 = notesToBlocks({ ...EMPTY_NOTES, summary: 'Planning the drive.', decisions: ['Saturday the 22nd'], actions: [{ text: 'Call Gleaners', owner: 'Marcus' }] }, meta);
  const m2 = mergeIntoPage(read(), v1, v2);
  assert.equal(m2.humanEdited, false);
  doc = applyTelaOp(doc, { type: 'SET_WRITER_BLOCKS', deviceId: 'dev_a', blocks: m2.blocks });
  assert.deepEqual(read().map(b => [b.kind, b.text]), v2.map(b => [b.kind, b.text]), 'story keeps kinds and text');

  // Step 3: still untouched → still a replace (story round-trip did not look like a human edit).
  const v3 = notesToBlocks({ ...EMPTY_NOTES, summary: 'Planning the drive.', decisions: ['Saturday the 22nd', 'East lot for pickups'], actions: [{ text: 'Call Gleaners', owner: 'Marcus' }] }, meta);
  const m3 = mergeIntoPage(read(), v2, v3);
  assert.equal(m3.humanEdited, false);
  doc = applyTelaOp(doc, { type: 'SET_WRITER_BLOCKS', deviceId: 'dev_a', blocks: m3.blocks });

  // A person edits a line in the page.
  doc = applyTelaOp(doc, { type: 'SET_WRITER_BLOCKS', deviceId: 'dev_a', blocks: read().map(b => b.text === 'Marcus: Call Gleaners' ? { ...b, text: 'Marcus: Call Gleaners Monday (truck at 8)' } : b) });

  // Step 4: Aria sees the edit, keeps it, appends only the new item.
  const v4 = notesToBlocks({ ...EMPTY_NOTES, summary: 'Rewritten summary.', decisions: ['Saturday the 22nd', 'East lot for pickups'], actions: [{ text: 'Call Gleaners', owner: 'Marcus' }, { text: 'Shift sheet by Thursday', owner: 'Keisha' }] }, meta);
  const m4 = mergeIntoPage(read(), v3, v4);
  assert.equal(m4.humanEdited, true);
  doc = applyTelaOp(doc, { type: 'SET_WRITER_BLOCKS', deviceId: 'dev_a', blocks: m4.blocks });
  const texts = read().map(b => b.text);
  assert.ok(texts.includes('Marcus: Call Gleaners Monday (truck at 8)'));
  assert.ok(texts.includes('Rewritten summary.'), 'untouched summary keeps updating');
  assert.equal(texts.filter(t => t === NEW_FROM_ARIA).length, 1);
  assert.equal(texts[texts.length - 1], 'Keisha: Shift sheet by Thursday');
});
