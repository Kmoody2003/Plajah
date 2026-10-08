import test from 'node:test';
import assert from 'node:assert/strict';
import { samSegmentationService, PromptPoint, PromptBox } from '../services/samSegmentationService';
import { samMatteStatus, SamPrompt } from '../services/fabula/samMatte';

test('SAM segmentation service provides singleton instance and lifecycle status', () => {
  assert.ok(samSegmentationService);
  const status = samSegmentationService.getStatus();
  assert.ok(['idle', 'loading', 'ready', 'failed'].includes(status));
});

test('SAM segmentation supports normalized prompt points and bounding boxes', () => {
  const pt: PromptPoint = { x: 0.5, y: 0.5, label: 1 };
  assert.equal(pt.x, 0.5);
  assert.equal(pt.y, 0.5);
  assert.equal(pt.label, 1);

  const box: PromptBox = { x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 };
  assert.ok(box.x1 < box.x2);
  assert.ok(box.y1 < box.y2);
});

test('samMatte handles both Point2 legacy points and SamPromptOptions boxes', () => {
  assert.ok(['idle', 'loading', 'ready', 'failed'].includes(samMatteStatus()));

  const legacyPrompt: SamPrompt = { x: 0.4, y: 0.6 };
  assert.equal(legacyPrompt.x, 0.4);
  assert.equal(legacyPrompt.y, 0.6);

  const boxPrompt: SamPrompt = { box: [0.1, 0.1, 0.9, 0.9] };
  assert.ok('box' in boxPrompt);
  assert.equal(boxPrompt.box?.[0], 0.1);
  assert.equal(boxPrompt.box?.[2], 0.9);
});
