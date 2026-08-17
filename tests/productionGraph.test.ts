import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScriptElement } from '../types';
import { projectScriptScenes, reconcileSceneProjection, stableSceneId } from '../services/productionGraph';

const elements: ScriptElement[] = [
  { id: 'heading-a', type: 'SCENE_HEADING', text: 'INT. MAYA\'S APARTMENT - DAY' },
  { id: 'action-a', type: 'ACTION', text: 'Maya opens the evidence box.' },
  { id: 'maya-a', type: 'CHARACTER', text: 'MAYA' },
  { id: 'heading-b', type: 'SCENE_HEADING', text: 'EXT. RIVER WALK - NIGHT' },
  { id: 'action-b', type: 'ACTION', text: 'A figure waits under the bridge.' },
  { id: 'figure-b', type: 'CHARACTER', text: 'FIGURE' },
];

test('scene identity is stable across draft revisions', () => {
  assert.equal(stableSceneId('script-1', 'heading-a'), stableSceneId('script-1', 'heading-a'));
  assert.notEqual(stableSceneId('script-1', 'heading-a'), stableSceneId('script-1', 'heading-b'));
  const first = projectScriptScenes({ scriptId: 'script-1', draftId: 'draft-1', elements });
  const revised = projectScriptScenes({
    scriptId: 'script-1', draftId: 'draft-2',
    elements: elements.map(element => element.id === 'heading-a' ? { ...element, text: 'INT. MAYA\'S LOFT - NIGHT' } : element),
  });
  assert.equal(first[0].id, revised[0].id);
  assert.equal(revised[0].set, "MAYA'S LOFT");
  assert.equal(revised[0].dayNight, 'NIGHT');
});

test('projection extracts scene order, synopsis, and cast', () => {
  const scenes = projectScriptScenes({ scriptId: 'script-1', draftId: 'draft-1', elements });
  assert.equal(scenes.length, 2);
  assert.deepEqual(scenes[0].characters, ['MAYA']);
  assert.equal(scenes[1].sceneNum, '2');
  assert.equal(scenes[1].synopsis, 'A figure waits under the bridge.');
});

test('reconciliation preserves operational decisions while refreshing creative data', () => {
  const first = projectScriptScenes({ scriptId: 'script-1', draftId: 'draft-1', elements });
  first[0] = { ...first[0], shootDay: 4, status: 'PARTIAL', pages: 2.25, notes: 'Hold for rain', locationId: 'loc-7' };
  const revised = projectScriptScenes({
    scriptId: 'script-1', draftId: 'draft-2',
    elements: elements.map(element => element.id === 'action-a' ? { ...element, text: 'Maya burns the evidence.' } : element),
  });
  const merged = reconcileSceneProjection(revised, first);
  assert.equal(merged[0].synopsis, 'Maya burns the evidence.');
  assert.equal(merged[0].shootDay, 4);
  assert.equal(merged[0].status, 'PARTIAL');
  assert.equal(merged[0].pages, 2.25);
  assert.equal(merged[0].locationId, 'loc-7');
});
