import test from 'node:test';
import assert from 'node:assert/strict';
import type { TelaDoc, TelaVectorObject } from '../types';
import type { DigitalWorksheet } from '../services/worksheetDigitizer';
import { autoFormatTelaAssignment } from '../services/telaAssignmentAutoFormat';
import { worksheetToTelaDoc } from '../services/worksheetTelaAdapter';

const path: TelaVectorObject = {
  id: 'bookbag_path', kind: 'PATH', x: 80, y: 220, w: 180, h: 160,
  fill: '#6B0099', stroke: '#1B1523', strokeWidth: 1, rotation: 0, opacity: 1,
  svgPathData: 'M 0 20 C 20 0 80 0 100 20 L 100 100 L 0 100 Z',
  pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100,
  semanticRole: 'ARTWORK', reconstructionLayer: 'ARTWORK', detectedLabel: 'hand drawn book bag',
};

test('Auto Format preserves artwork and builds native assignment fields', () => {
  const doc: TelaDoc = {
    id: 'doc', ownerId: 'teacher', title: 'Reading check', createdAt: 1, updatedAt: 1, bindings: [],
    frames: [{ id: 'page', kind: 'PAPER', preset: 'LETTER', x: 0, y: 0, w: 816, h: 1056, deviceIds: ['vector'] }],
    devices: { vector: { id: 'vector', type: 'VECTOR', width: 816, height: 1056, objects: [path, {
      id: 'question', kind: 'TEXT', x: 80, y: 430, w: 600, h: 40, text: '1. What belongs in the book bag?',
      fill: '#111', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, fontSize: 20,
      reconstructionLayer: 'TEXT', semanticRole: 'QUESTION',
    }] } },
  };
  const result = autoFormatTelaAssignment(doc, 'page');
  const vector = result.doc.devices.vector;
  assert.equal(vector.type, 'VECTOR');
  assert.ok(vector.objects.some(object => object.id === path.id && object.kind === 'PATH'));
  assert.ok(vector.objects.some(object => object.semanticRole === 'QUESTION'));
  assert.ok(vector.objects.some(object => object.semanticRole === 'RESPONSE_GUIDE'));
  assert.equal(result.report.questionsDetected, 1);
  assert.equal(Object.values(result.doc.devices).find(device => device.type === 'BASE')?.fields.length, 1);
  assert.ok(Object.values(result.doc.devices).some(device => device.type === 'FORM' && device.assignment?.enabled));
});

test('worksheet adapter retains layered vector artwork and editable OCR text', () => {
  const sheet: DigitalWorksheet = {
    id: 'sheet', title: 'Book bag worksheet', subject: 'ELA', objective: 'Identify details', standardIds: [],
    fields: [{ id: 'answer', label: 'What is in the bag?', type: 'short-text', box: { x: 12, y: 70, width: 60, height: 6 }, points: 1, needsManualGrade: true }],
    createdBy: 'teacher', createdAt: 1, status: 'draft', hasManualFields: true,
  };
  const reconstructionText: TelaVectorObject = {
    id: 'ocr', kind: 'TEXT', x: 100, y: 80, w: 500, h: 32, text: 'What is in the bag?',
    fill: '#111', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, fontSize: 24,
    fontFamily: 'Inter, sans-serif', reconstructionLayer: 'TEXT', semanticRole: 'QUESTION',
  };
  const doc = worksheetToTelaDoc(sheet, 'teacher', 'data:image/png;base64,source', {
    width: 816, height: 1056, objects: [path, reconstructionText], engine: 'test',
    layers: { layout: 0, artwork: 1, text: 1, interaction: 0 },
    understanding: { summary: 'A reading assignment about objects in a book bag.', classifiedAfterRebuild: true },
    stats: { regionCount: 1, vectorPathCount: 1 },
  });
  const vector = Object.values(doc.devices).find(device => device.type === 'VECTOR');
  assert.ok(vector && vector.type === 'VECTOR');
  assert.ok(vector.objects.some(object => object.kind === 'PATH' && object.detectedLabel === 'hand drawn book bag'));
  assert.ok(vector.objects.some(object => object.kind === 'TEXT' && object.text === 'What is in the bag?'));
  assert.equal(vector.trace?.artworkObjectCount, 1);
  assert.equal(vector.trace?.textObjectCount, 1);
});
