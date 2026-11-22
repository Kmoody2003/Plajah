import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCuesToTrack, captionRate, cuesOfTrack, enforceGaps, mergeCues, snapCuesToFrames, splitCue, cpsOf } from '../components/Fabula/captions/captionClips.ts';

let n = 0; const id = () => `id${++n}`;
const clips = [
  { id: 'v', trackId: 'v1', kind: 'media', start: 0, duration: 10 },
  { id: 's1', trackId: 's1', kind: 'subtitle', start: 1, duration: 2, text: 'Hello', cap: { mode: 'rollup', rollRows: 2 } },
  { id: 's2', trackId: 's2', kind: 'subtitle', start: 1, duration: 2, text: 'Hola' },
];

test('a subtitle track reads as cues with its 608 presentation', () => {
  const cues = cuesOfTrack(clips, 's1');
  assert.deepEqual(cues, [{ id: 's1', startSec: 1, endSec: 3, text: 'Hello', mode: 'rollup', rollRows: 2 }]);
});

test('writing cues back touches only that track and keeps clip identity', () => {
  const cues = cuesOfTrack(clips, 's1').map((c) => ({ ...c, text: 'Hello there', mode: 'popon' as const }));
  const next = applyCuesToTrack(clips, 's1', [...cues, { id: 'cueNew', startSec: 4, endSec: 5, text: 'New' }], id, { op: 1 });
  assert.equal(next.find((c) => c.id === 'v'), clips[0]);
  assert.equal(next.find((c) => c.id === 's2'), clips[2]);
  const s1 = next.find((c) => c.id === 's1');
  assert.equal(s1.text, 'Hello there');
  assert.equal(s1.cap, undefined, 'pop-on/centre/row 15 are defaults, not stored');
  const added = next.find((c) => c.text === 'New');
  assert.ok(added && added.id.startsWith('id') && added.kind === 'subtitle' && added.trackId === 's1');
});

test('frame snapping and spec gaps', () => {
  const rate = captionRate(29.97, true);
  assert.equal(rate.id, '29.97df');
  assert.equal(captionRate(29.97, false).id, '29.97ndf');
  const snapped = snapCuesToFrames([{ id: 'a', startSec: 1.01, endSec: 2.01, text: 'x' }], captionRate(25, false));
  assert.deepEqual([snapped[0].startSec, snapped[0].endSec], [1, 2]);
  const r24 = captionRate(24, false);
  const gapped = enforceGaps([{ id: 'a', startSec: 0, endSec: 1, text: 'a' }, { id: 'b', startSec: 1 + 1 / 24, endSec: 2, text: 'b' }], r24, 2);
  assert.equal(gapped[0].endSec, 1 + 1 / 24, 'a 1-frame gap under a 2-frame rule closes up');
  const opened = enforceGaps([{ id: 'a', startSec: 0, endSec: 1, text: 'a' }, { id: 'b', startSec: 1 + 2 / 24, endSec: 2, text: 'b' }], r24, 3);
  assert.ok(Math.abs(opened[0].endSec - (1 - 1 / 24)) < 1e-9, 'a 2-frame gap under a 3-frame rule opens to 3');
});

test('split divides words by time, merge joins rows', () => {
  const [a, b] = splitCue({ id: 'c', startSec: 0, endSec: 4, text: 'one two three four' }, 2, id)!;
  assert.deepEqual([a.text, a.endSec, b.text, b.startSec], ['one two', 2, 'three four', 2]);
  assert.equal(splitCue({ id: 'c', startSec: 0, endSec: 4, text: 'x' }, 0.01, id), null);
  assert.equal(mergeCues(a, b).text, 'one two\nthree four');
  assert.equal(Math.round(cpsOf({ id: 'z', startSec: 0, endSec: 2, text: 'abcdefghij' })), 5);
});
