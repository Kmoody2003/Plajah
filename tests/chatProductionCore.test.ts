import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleProductionParticipants, talkingHeadLayout, publishProductionFeed, removeProductionFeed, watchProductionFeeds } from '../services/productionFeeds';
import { getAppOutputStream, onAppOutputRemoved } from '../services/mediaEngine/bridge';
import { executeProductionCommand, productionHotkey, productionMidi } from '../services/productionControl';
import { collaborationTela, serializeCollaborationTela } from '../services/collaborationTela';
import type { CollabProject } from '../types';

test('moderator exclusion overrides consent and all media feeds use explicit opt-in', () => {
  const stream = {} as MediaStream;
  const participants = [
    { id: 'moderator', name: 'Mod', stream, moderator: true, allowed: true },
    { id: 'private', name: 'Private', stream, moderator: false, allowed: false },
    { id: 'guest', name: 'Guest', stream, moderator: false, allowed: true },
  ];
  assert.deepEqual(eligibleProductionParticipants(participants).map(p => p.id), ['guest']);
});
test('talking-head geometry stays in frame without overlapping at every size', () => {
  for (let n = 1; n <= 32; n++) {
    const boxes = talkingHeadLayout(n);
    assert.equal(boxes.length, n);
    for (const a of boxes) assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1.000001 && a.y + a.h <= 1.000001);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => assert.ok(a.x + a.w <= b.x + 1e-8 || b.x + b.w <= a.x + 1e-8 || a.y + a.h <= b.y + 1e-8 || b.y + b.h <= a.y + 1e-8)));
  }
  assert.deepEqual(talkingHeadLayout(0), []);
});
test('revocation removes discovery and notifies Ambo without stopping originating tracks', () => {
  let stopped = false, removed = false; let ids: string[] = [];
  const stream = { getTracks: () => [{ stop: () => { stopped = true; } }] } as unknown as MediaStream;
  const unsubscribe = watchProductionFeeds(feeds => { ids = feeds.map(f => f.id); });
  const unremove = onAppOutputRemoved('chat:test:guest', () => { removed = true; });
  publishProductionFeed({ id: 'chat:test:guest', label: 'Guest', stream, kind: 'chat' });
  assert.equal(getAppOutputStream('chat:test:guest'), stream);
  assert.deepEqual(ids, ['chat:test:guest']);
  removeProductionFeed('chat:test:guest');
  assert.equal(getAppOutputStream('chat:test:guest'), null);
  assert.deepEqual(ids, []); assert.ok(removed); assert.equal(stopped, false);
  unsubscribe(); unremove();
});
test('hardware rejects invalid inputs and gain values, takes preview before cutting', () => {
  const calls: string[] = [];
  const target = { inputs: () => ['camera', 'ambo'], preview: (id: string) => calls.push(`preview:${id}`), cut: () => calls.push('cut'), auto: () => calls.push('auto'), gain: () => calls.push('gain') };
  assert.ok(executeProductionCommand(target, { action: 'take', input: 2 }));
  assert.deepEqual(calls, ['preview:ambo', 'cut']);
  assert.equal(executeProductionCommand(target, { action: 'take', input: 3 }), false);
  assert.equal(executeProductionCommand(target, { action: 'gain', input: 1, value: NaN }), false);
  assert.deepEqual(productionMidi([0x90, 36, 100]), { action: 'preview', input: 1 });
  assert.equal(productionMidi([0x90, 36, 0]), null);
  assert.deepEqual(productionHotkey({ ctrlKey: true, altKey: true, shiftKey: true, code: 'Enter', repeat: false }), { action: 'auto' });
  assert.equal(productionHotkey({ ctrlKey: true, altKey: true, shiftKey: true, code: 'Enter', repeat: true }), null);
});
test('legacy collaboration strokes migrate without mutating or deleting original board', () => {
  const project: CollabProject = { id: 'board', name: 'Board', chatRoomId: 'room', ownerId: 'owner', updatedAt: 1, assets: [], links: [], whiteboardData: JSON.stringify({ lines: [{ points: [1, 2, 3, 4], color: '#ff0000' }] }) };
  const doc = collaborationTela(project);
  const scene = doc.devices.scene;
  assert.equal(scene.type, 'VECTOR');
  if (scene.type === 'VECTOR') assert.deepEqual(scene.objects[0].points, [1, 2, 3, 4]);
  assert.ok(project.whiteboardData); assert.equal(project.telaDocument, undefined);
  assert.equal(JSON.parse(serializeCollaborationTela(doc)).id, 'tela_collab_board');
  assert.throws(() => serializeCollaborationTela({ ...doc, title: 'x'.repeat(710_000) }), /too large/);
});
