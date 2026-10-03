import test from 'node:test';
import assert from 'node:assert/strict';
import { chaikin, simplify, widthFor, strokeNear, strokeInBox, boundsOf, pathData, flatten, avgPressure } from '../services/inkMath';
import { entriesToStructure, searchPages, plainTextOf, makePageDoc, inkDeviceOf, notebookForSubject, UNFILED_SECTION, UNFILED_NOTEBOOK } from '../services/notesStructure';

test('ink smoothing keeps the endpoints and simplification removes collinear points', () => {
  const pts = [{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 4, p: 0.5 }, { x: 20, y: 0, p: 0.5 }, { x: 30, y: 4, p: 0.5 }];
  const s = chaikin(pts, 2); assert.deepEqual([s[0].x, s[0].y], [0, 0]); assert.deepEqual([s[s.length - 1].x, s[s.length - 1].y], [30, 4]); assert.ok(s.length > pts.length);
  const line = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: i * 2, p: 0.5 })); assert.equal(simplify(line, 0.5).length, 2);
  const corner = [{ x: 0, y: 0, p: 1 }, { x: 50, y: 0, p: 1 }, { x: 50, y: 50, p: 1 }]; assert.equal(simplify(corner, 1).length, 3);
});

test('pen width follows pressure; highlighter is wide and ignores pressure; mouse (0.5) is stable', () => {
  const pen = { color: '#000', size: 3, tool: 'pen' as const };
  assert.ok(widthFor(pen, 1) > widthFor(pen, 0.5) && widthFor(pen, 0.5) > widthFor(pen, 0.05));
  const hl = { color: '#ff0', size: 3, tool: 'highlighter' as const };
  assert.equal(widthFor(hl, 0.1), widthFor(hl, 0.9)); assert.ok(widthFor(hl, 0.5) > widthFor(pen, 0.5) * 3);
  assert.equal(avgPressure([{ x: 0, y: 0, p: 0.2 }, { x: 1, y: 1, p: 0.6 }]), 0.4);
});

test('eraser and lasso hit-testing', () => {
  const stroke = [0, 0, 100, 0]; // horizontal segment
  assert.ok(strokeNear(stroke, { x: 50, y: 4 }, 6)); assert.ok(!strokeNear(stroke, { x: 50, y: 20 }, 6)); assert.ok(!strokeNear(stroke, { x: 130, y: 0 }, 6)); assert.ok(strokeNear([5, 5], { x: 7, y: 5 }, 3));
  assert.ok(strokeInBox(stroke, { x: 40, y: -5, w: 20, h: 10 })); assert.ok(!strokeInBox(stroke, { x: 40, y: 20, w: 20, h: 10 }));
  assert.deepEqual(boundsOf([10, 20, 30, 50]), { x: 10, y: 20, w: 20, h: 30 });
  assert.ok(pathData(flatten([{ x: 0, y: 0, p: 1 }, { x: 5, y: 5, p: 1 }, { x: 10, y: 0, p: 1 }, { x: 15, y: 5, p: 1 }])).startsWith('M0,0'));
});

test('structure: legacy entries are filed under Unfiled; pages, sections and notebooks nest; search needs every word', () => {
  const entries = [
    { id: 'old1', type: 'NOTE', title: 'Pendulum idea', content: 'Longer string means longer period', tags: ['physics'], createdAt: 1, updatedAt: 5 },
    { id: 'nb1', type: 'NOTEBOOK', title: 'Science', color: '#06D6A0', order: 1 },
    { id: 'sec1', type: 'SECTION', notebookId: 'nb1', title: 'Unit 1: Forces', order: 0 },
    { id: 'p1', type: 'PAGE', notebookId: 'nb1', sectionId: 'sec1', title: 'Newton\'s laws', text: 'force equals mass times acceleration', template: 'cornell', telaDocId: 'tela1', updatedAt: 9, tags: [] },
    { id: 'p2', type: 'PAGE', sectionId: 'missing-section', title: 'Orphan', text: '', updatedAt: 3 },
  ];
  const s = entriesToStructure(entries);
  assert.equal(s.notebooks[0].id, UNFILED_NOTEBOOK); assert.ok(s.notebooks.some(n => n.id === 'nb1'));
  const old = s.pages.find(p => p.id === 'old1')!; assert.equal(old.legacy, true); assert.equal(old.sectionId, UNFILED_SECTION); assert.equal(old.text, 'Longer string means longer period');
  assert.equal(s.pages.find(p => p.id === 'p1')!.sectionId, 'sec1'); assert.equal(s.pages.find(p => p.id === 'p2')!.sectionId, UNFILED_SECTION);
  assert.equal(s.pages[0].id, 'p1'); // newest first
  assert.deepEqual(searchPages(s.pages, 'force mass').map(p => p.id), ['p1']); assert.equal(searchPages(s.pages, 'force banana').length, 0); assert.equal(searchPages(s.pages, '').length, s.pages.length);
  assert.equal(notebookForSubject('science'), 'nb_science'); assert.equal(notebookForSubject('nope'), UNFILED_NOTEBOOK);
});

test('a new page is a Tela document with an ink device; text is extracted for search', () => {
  const doc = makePageDoc({ ownerId: 'u1', title: 'Cells', template: 'cornell', heading: 'Cell structure', lines: ['Nucleus holds DNA'] });
  assert.ok(doc.id.startsWith('tela_page')); assert.equal(doc.ownerId, 'u1'); assert.ok(inkDeviceOf(doc));
  assert.ok(plainTextOf(doc).includes('Nucleus holds DNA')); assert.ok(plainTextOf(doc, 'handwritten words').includes('handwritten words'));
  const blank = makePageDoc({ ownerId: 'u1', title: 'x', template: 'blank' }); assert.equal(blank.frames.length, 1);
});
