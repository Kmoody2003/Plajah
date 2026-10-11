import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTelaOp, type TelaOp } from '../components/tela/telaOps';
import { emptyHistory, recordOp, undo, redo, sealStep, COALESCE_MS, HISTORY_LIMIT } from '../components/tela/telaHistory';
import type { TelaDoc } from '../types';

const base = (): TelaDoc => ({ id: 'd', ownerId: 'u', title: 'T', frames: [{ id: 'f', kind: 'PAPER', preset: 'LETTER', x: 0, y: 0, w: 816, h: 1056, deviceIds: ['g'] }], devices: { g: { id: 'g', type: 'GRID', rows: 4, cols: 4, cells: {} } }, createdAt: 0, updatedAt: 0 });

function run(doc: TelaDoc, h: ReturnType<typeof emptyHistory>, op: TelaOp, at: number) {
  const next = applyTelaOp(doc, op);
  return { doc: next, h: recordOp(h, doc, op, at) };
}

test('undo restores the previous doc and redo re-applies it', () => {
  let s = { doc: base(), h: emptyHistory() };
  s = run(s.doc, s.h, { type: 'SET_TITLE', title: 'A' }, 0);
  s = run(s.doc, s.h, { type: 'SET_GRID_CELL', deviceId: 'g', key: 'A1', value: '5' }, 5000);
  const u = undo(s.h, s.doc)!;
  assert.equal((u.doc.devices.g as any).cells.A1, undefined);
  assert.equal(u.doc.title, 'A');
  const r = redo(u.history, u.doc)!;
  assert.equal((r.doc.devices.g as any).cells.A1, '5');
});

test('a burst of the same edit coalesces into one step; sealing splits it', () => {
  let s = { doc: base(), h: emptyHistory() };
  for (let i = 0; i < 5; i++) s = run(s.doc, s.h, { type: 'SET_GRID_CELL', deviceId: 'g', key: 'A1', value: String(i) }, i * 100);
  assert.equal(s.h.past.length, 1);
  s.h = sealStep(s.h);
  s = run(s.doc, s.h, { type: 'SET_GRID_CELL', deviceId: 'g', key: 'A1', value: 'x' }, 600);
  assert.equal(s.h.past.length, 2);
  s = run(s.doc, s.h, { type: 'SET_GRID_CELL', deviceId: 'g', key: 'A1', value: 'y' }, 600 + COALESCE_MS + 1);
  assert.equal(s.h.past.length, 3);
});

test('publish state survives undo and is never recorded', () => {
  let s = { doc: base(), h: emptyHistory() };
  s = run(s.doc, s.h, { type: 'SET_TITLE', title: 'A' }, 0);
  s = run(s.doc, s.h, { type: 'SET_CURRENT_VERSION', versionId: 'v1', locked: true }, 5000);
  assert.equal(s.h.past.length, 1);
  const u = undo(s.h, s.doc)!;
  assert.equal(u.doc.title, 'T');
  assert.equal(u.doc.currentVersionId, 'v1');
  assert.equal(u.doc.locked, true);
});

test('a new edit clears redo, and history is capped', () => {
  let s = { doc: base(), h: emptyHistory() };
  for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = run(s.doc, s.h, { type: 'ADD_BINDING', binding: { id: 'b' + i, kind: 'ref', sourceDeviceId: 'g', sourceSelector: '', targetDeviceId: 'g', targetRole: '' } }, i);
  assert.equal(s.h.past.length, HISTORY_LIMIT);
  const u = undo(s.h, s.doc)!;
  assert.equal(u.history.future.length, 1);
  const after = recordOp(u.history, u.doc, { type: 'SET_TITLE', title: 'Z' }, 1e9);
  assert.equal(after.future.length, 0);
});
