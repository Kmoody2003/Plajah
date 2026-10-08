// Tests for the kaiju side-audio signal: which source wins, the silent-analyser fallback, and the pseudo-beat.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_BPM, SilenceWatch, isAudible, pickKaijuSignal, stepSynthBeat, synthKick, urlTapSafe, type SideAudioState } from '../services/sideAudioSignal';
import { KaijuAudio } from '../components/kaiju/kaijuAudio';

const AN = {} as AnalyserNode, MAIN_AN = {} as AnalyserNode;
const main = { analyser: MAIN_AN, isPlaying: true };
const side = (o: Partial<SideAudioState> = {}): SideAudioState => ({ id: 3, analyser: AN, active: true, fallback: false, ...o });

test('main player passes through when no side audio is audibly playing', () => {
  assert.deepEqual(pickKaijuSignal(main, null), { ...main, key: 'main' });
  assert.deepEqual(pickKaijuSignal(main, side({ active: false })), { ...main, key: 'main' });
  const idle = pickKaijuSignal({ analyser: null, isPlaying: false }, null);
  assert.equal(idle.isPlaying, false);
  assert.equal(idle.fallbackBpm, undefined);
});

test('an audible side audio takes priority over the main player, with its own source key', () => {
  const s = pickKaijuSignal(main, side());
  assert.equal(s.analyser, AN);
  assert.equal(s.isPlaying, true);
  assert.equal(s.key, 'side:3');
  assert.equal(s.fallbackBpm, undefined);
  assert.equal(pickKaijuSignal({ analyser: null, isPlaying: false }, side()).isPlaying, true); // even with the main player stopped
  assert.notEqual(pickKaijuSignal(main, side({ id: 4 })).key, s.key); // a new preview resets the flywheel
});

test('fallback (or an untappable element) yields a synthetic-beat signal and no analyser', () => {
  for (const sd of [side({ fallback: true }), side({ analyser: null, fallback: true })]) {
    const s = pickKaijuSignal(main, sd);
    assert.equal(s.analyser, null);
    assert.equal(s.isPlaying, true);
    assert.equal(s.fallbackBpm, FALLBACK_BPM);
  }
});

test('SilenceWatch flags ~0.5s of zeros while playing, but never once real signal has been seen', () => {
  const w = new SilenceWatch(0.5);
  for (let i = 0; i < 4; i++) assert.equal(w.step(0, 0.1, true), false);
  assert.equal(w.step(0, 0.1, true), true); // 0.5s
  assert.equal(w.step(40, 0.1, true), false); // signal appears -> real analyser again
  for (let i = 0; i < 20; i++) assert.equal(w.step(0, 0.1, true), false); // later silence is a real rest, not a taint
  const p = new SilenceWatch(0.5);
  for (let i = 0; i < 10; i++) p.step(0, 0.1, false); // paused time doesn't count
  assert.equal(p.fallback, false);
});

test('synthetic beat ticks at the requested tempo', () => {
  const s = { phase: 0, count: 0 };
  let beats = 0;
  for (let i = 0; i < 600; i++) if (stepSynthBeat(s, 1 / 60, 120).beat) beats++; // 10 s @ 120 bpm
  assert.ok(beats >= 19 && beats <= 21, `got ${beats} beats`);
  assert.ok(synthKick(0) > synthKick(0.5));
});

test('KaijuAudio.sampleSignal nods to the fallback beat and resets the clock when the source changes', () => {
  const a = new KaijuAudio();
  let beats = 0, f = a.sampleSignal({ analyser: null, isPlaying: true, fallbackBpm: 120, key: 'side:1' }, 1 / 60);
  for (let i = 0; i < 300; i++) { f = a.sampleSignal({ analyser: null, isPlaying: true, fallbackBpm: 120, key: 'side:1' }, 1 / 60); if (f.beat) beats++; assert.equal(f.silent, false); }
  assert.ok(beats >= 8 && beats <= 11, `got ${beats} beats in 5 s`);
  assert.equal(f.bpm, 120);
  a.sampleSignal({ analyser: null, isPlaying: true, fallbackBpm: 120, key: 'side:2' }, 1 / 60); // new source
  const g = a.sampleSignal({ analyser: null, isPlaying: true, fallbackBpm: 120, key: 'side:2' }, 1 / 60);
  assert.ok(g.beatCount <= 1 && g.beatPhase < 0.1, 'synthetic clock restarts on a source change');
  assert.equal(a.sampleSignal({ analyser: null, isPlaying: false, key: 'main' }, 1 / 60).silent, true); // back to the (silent) main player
});

test('only taps elements whose audio Web Audio can actually read', () => {
  const o = 'https://plajah.app';
  assert.equal(urlTapSafe('blob:https://plajah.app/abc', null, o), true);
  assert.equal(urlTapSafe('/audio/a.mp3', null, o), true);
  assert.equal(urlTapSafe('https://plajah.app/a.mp3', null, o), true);
  assert.equal(urlTapSafe('https://cdn.example.com/a.mp3', null, o), false); // no CORS -> a tap would be SILENT
  assert.equal(urlTapSafe('https://cdn.example.com/a.mp3', 'anonymous', o), true);
});

test('isAudible ignores paused / muted / zero-volume elements (hover previews ramp up from 0)', () => {
  assert.equal(isAudible({ paused: false, ended: false, muted: false, volume: 0.5 }), true);
  assert.equal(isAudible({ paused: false, ended: false, muted: false, volume: 0 }), false);
  assert.equal(isAudible({ paused: true, ended: false, muted: false, volume: 0.5 }), false);
  assert.equal(isAudible({ paused: false, ended: false, muted: true, volume: 0.5 }), false);
});
