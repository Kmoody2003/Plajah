// Jam timing + take encoding (services/melos/jam/clock.ts, wav.ts).
//   npx tsx --test tests/coeditJam.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestOffset, clockSample, localPlayTime } from '../services/melos/jam/clock';
import { concatBlocks, encodeWav } from '../services/melos/jam/wav';

test('clock sync: offset from a ping/pong, lowest round trip wins', () => {
  // their clock runs 500 ms ahead; one-way delay 20 ms
  const fast = clockSample(1000, 1520, 1040)!;
  assert.equal(fast.offset, 500);
  const slow = clockSample(2000, 2560, 2120)!; // congested sample: 120 ms rtt, skewed estimate
  assert.equal(bestOffset([slow, fast]), 500);
  assert.equal(clockSample(10, 0, 5), null); // negative rtt rejected
});

test('a remote note plays at its moment on this clock plus the jitter cushion, never in the past', () => {
  assert.equal(localPlayTime(10_500, 500, 9_990, 30), 10_030);
  assert.equal(localPlayTime(10_000, 500, 9_990, 30), 9_990);
});

test('takes encode to 24-bit stereo WAV with the right header and samples', async () => {
  const blocks = [
    [new Float32Array([0, 0.5]), new Float32Array([0, -0.5])],
    [new Float32Array([1, -1]), new Float32Array([0.25, 0])],
  ];
  const pcm = concatBlocks(blocks, 2);
  assert.equal(pcm[0].length, 4);
  const wav = encodeWav(pcm, 48000, 24);
  const v = new DataView(await wav.arrayBuffer());
  assert.equal(wav.size, 44 + 4 * 2 * 3);
  assert.equal(String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)), 'WAVE');
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(34, true), 24);
  const s24 = (o: number) => ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)));
  assert.equal(s24(44 + 3 * 1), 0); // frame 0, right
  assert.equal(s24(44 + 6 * 1), Math.round(0.5 * 0x7fffff)); // frame 1, left
  assert.equal(s24(44 + 6 * 2), 0x7fffff); // frame 2, left = 1.0
  assert.equal(s24(44 + 6 * 3), -0x800000); // frame 3, left = -1.0
});
