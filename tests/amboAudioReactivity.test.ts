// audioReactivity — generators must MOVE with the music at any master level.
// Run: npx tsx --test tests/amboAudioReactivity.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReactivityConditioner } from '../services/ambo/audioReactivity';

const N = 256, DT = 1 / 60;
// A spectrum like real music through an analyser: bass hovering high with a kick on top, mids almost constant.
function frame(t: number, gain = 1, kickHz = 2): Uint8Array {
  const f = new Uint8Array(N);
  const kick = Math.exp(-((t * kickHz) % 1) * 7);                       // decays 0.5s after each kick
  for (let i = 0; i < N; i++) {
    const bassy = i < 6 ? 0.72 + 0.2 * kick : 0;
    const mid = i >= 6 && i < 64 ? 0.49 + 0.03 * Math.sin(t * 3 + i) + 0.04 * kick : 0;
    const hi = i >= 64 ? 0.14 + 0.12 * (Math.sin(t * 9) > 0.8 ? 1 : 0) : 0;
    const v = bassy + mid + hi;
    f[i] = v === 0 ? 0 : Math.round(Math.min(1, Math.max(0, v - (1 - gain))) * 255);   // gain<1 = N dB down = a byte OFFSET
  }
  return f;
}
const avg = (f: Uint8Array, a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += f[i]; return s / (b - a) / 255; };
const sd = (v: number[]) => { const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };

function run(gain: number, strength: number) {
  const c = new ReactivityConditioner(); c.strength = strength;
  const bass: number[] = [], mid: number[] = []; let onsets = 0;
  for (let k = 0; k < 600; k++) {
    const f = frame(k * DT, gain);
    const b = c.apply(f, DT);
    if (k > 120) { bass.push(avg(f, 0, 6)); mid.push(avg(f, 6, 64)); }
    if (b.onset) onsets++;
  }
  return { bassSd: sd(bass), midSd: sd(mid), onsets };
}

test('conditioning widens the swing of every band', () => {
  const raw = run(1, 0), cond = run(1, 0.85);
  assert.ok(cond.bassSd > raw.bassSd * 1.8, `bass ${raw.bassSd} -> ${cond.bassSd}`);
  assert.ok(cond.midSd > raw.midSd * 2.5, `mid ${raw.midSd} -> ${cond.midSd}`);
});

test('it is level-independent: a master 18 dB down (offset 0.255) still swings as much', () => {
  const loud = run(1, 0.85), quiet = run(0.745, 0.85);
  assert.ok(quiet.bassSd > loud.bassSd * 0.6, `quiet ${quiet.bassSd} vs loud ${loud.bassSd}`);
});

test('one onset per kick, not one per frame', () => {
  const { onsets } = run(1, 0.85);                                      // 10 s at 2 kicks/s, minus the 2 s warm-up
  assert.ok(onsets >= 12 && onsets <= 22, `onsets ${onsets}`);
});

test('silence is not amplified into motion', () => {
  const c = new ReactivityConditioner(); c.strength = 1;
  for (let k = 0; k < 300; k++) {
    const f = new Uint8Array(N).fill(2);                                 // analyser noise floor
    const b = c.apply(f, DT);
    assert.ok(avg(f, 0, N) < 0.05, 'stays quiet');
    assert.equal(b.onset, false);
  }
});
