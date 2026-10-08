// amboVideoSync.test.ts — the single video clock: prediction, loop wrap, drift
// decisions, commands, a simulated follower converging on the authority, and the
// runtime registry (master / shadow / local) with fake elements.
// Run: npx tsx --test tests/amboVideoSync.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  predictedPosition, signedDrift, driftDecision, applyCommand, hasEnded, reanchor, positionJumped, transportChanged, formatClock,
  DEFAULT_DRIFT, type VideoTransport,
} from '../services/ambo/videoSyncMath';
import { attachVideo, command, getInfo, hasMaster, videoId, _resetVideoSyncForTests } from '../services/ambo/videoSync';

const T = (o: Partial<VideoTransport> = {}): VideoTransport => ({
  key: 'a.mp4', playing: true, rate: 1, pos: 10, anchorMs: 1_000_000, loop: false, duration: 60, volume: 1, muted: false, ...o,
});

describe('predictedPosition', () => {
  test('advances with wall clock at rate', () => {
    assert.equal(predictedPosition(T(), 1_002_000), 12);
    assert.equal(predictedPosition(T({ rate: 2 }), 1_002_000), 14);
  });
  test('paused does not advance', () => assert.equal(predictedPosition(T({ playing: false }), 1_009_000), 10));
  test('one-shot parks at duration', () => assert.equal(predictedPosition(T(), 1_100_000), 60));
  test('loop wraps', () => {
    assert.ok(Math.abs(predictedPosition(T({ loop: true, pos: 58 }), 1_005_000) - 3) < 1e-9);
    assert.ok(Math.abs(predictedPosition(T({ loop: true, pos: 0 }), 1_000_000 + 125_000) - 5) < 1e-9);
  });
  test('unknown duration never clamps', () => assert.equal(predictedPosition(T({ duration: 0 }), 1_100_000), 110));
  test('a stale anchor in the future does not rewind', () => assert.equal(predictedPosition(T(), 999_000), 10));
});

describe('hasEnded', () => {
  test('one-shot ends', () => { assert.equal(hasEnded(T(), 1_100_000), true); assert.equal(hasEnded(T(), 1_010_000), false); });
  test('loop never ends', () => assert.equal(hasEnded(T({ loop: true }), 1_900_000), false));
});

describe('signedDrift', () => {
  test('plain', () => assert.ok(Math.abs(signedDrift(10.2, 10, false, 60) - 0.2) < 1e-9));
  test('across the loop seam is short, not ~duration', () => {
    assert.ok(Math.abs(signedDrift(0.05, 59.98, true, 60) - 0.07) < 1e-9);
    assert.ok(Math.abs(signedDrift(59.97, 0.02, true, 60) - -0.05) < 1e-9);
  });
});

describe('driftDecision', () => {
  test('dead zone: nothing', () => assert.deepEqual(driftDecision(0.02, 5, 1), { action: 'none', rate: 1 }));
  test('ahead -> slow down, within +/-4%', () => {
    const d = driftDecision(0.08, 5, 1);
    assert.equal(d.action, 'nudge'); assert.ok(d.rate < 1 && d.rate >= 0.96);
  });
  test('behind -> speed up, within +/-4%', () => {
    const d = driftDecision(-0.08, 5, 1);
    assert.equal(d.action, 'nudge'); assert.ok(d.rate > 1 && d.rate <= 1.04);
  });
  test('nudge scales with the error', () => {
    assert.ok(driftDecision(-0.1, 5, 1).rate > driftDecision(-0.04, 5, 1).rate);
  });
  test('>= 120 ms hard seeks to the prediction', () => {
    assert.deepEqual(driftDecision(0.12, 7.5, 1), { action: 'seek', to: 7.5, rate: 1 });
    assert.equal(driftDecision(-3, 7.5, 1).action, 'seek');
  });
  test('NaN drift seeks', () => assert.equal(driftDecision(NaN, 1, 1).action, 'seek'));
  test('nudge keeps the nominal rate as its base', () => assert.ok(driftDecision(0.08, 5, 2).rate > 1.9));
});

describe('applyCommand', () => {
  const now = 1_004_000; // clip is at 14 s
  test('pause freezes at the current position', () => {
    const n = applyCommand(T(), { type: 'pause' }, now);
    assert.equal(n.playing, false); assert.equal(n.pos, 14); assert.equal(predictedPosition(n, now + 5000), 14);
  });
  test('play resumes from where it paused', () => {
    const p = applyCommand(T(), { type: 'pause' }, now);
    const r = applyCommand(p, { type: 'play' }, now + 3000);
    assert.equal(r.playing, true); assert.equal(predictedPosition(r, now + 5000), 16);
  });
  test('play on a finished one-shot restarts it', () => {
    const r = applyCommand(T({ playing: false, pos: 60, ended: true }), { type: 'play' }, now);
    assert.equal(r.pos, 0); assert.equal(r.playing, true);
  });
  test('seek / skip clamp to [0, duration]', () => {
    assert.equal(applyCommand(T(), { type: 'seek', sec: 500 }, now).pos, 60);
    assert.equal(applyCommand(T(), { type: 'skip', delta: -100 }, now).pos, 0);
    assert.equal(applyCommand(T(), { type: 'skip', delta: 10 }, now).pos, 24);
    assert.ok(applyCommand(T({ loop: true }), { type: 'seek', sec: 500 }, now).pos < 60);
  });
  test('restart goes to 0 and plays', () => {
    const r = applyCommand(T({ playing: false }), { type: 'restart' }, now);
    assert.equal(r.pos, 0); assert.equal(r.playing, true);
  });
  test('rate / loop / volume / mute', () => {
    assert.equal(applyCommand(T(), { type: 'rate', rate: 1.5 }, now).rate, 1.5);
    assert.equal(applyCommand(T(), { type: 'rate', rate: 99 }, now).rate, 4);
    assert.equal(applyCommand(T(), { type: 'loop', on: true }, now).loop, true);
    assert.equal(applyCommand(T(), { type: 'volume', volume: 0 }, now).muted, true);
    assert.equal(applyCommand(T(), { type: 'volume', volume: 0.4 }, now).muted, false);
    assert.equal(applyCommand(T(), { type: 'mute', muted: true }, now).muted, true);
  });
  test('rate change keeps position continuous', () => {
    const r = applyCommand(T(), { type: 'rate', rate: 2 }, now);
    assert.equal(predictedPosition(r, now), 14); assert.equal(predictedPosition(r, now + 1000), 16);
  });
  test('toggle', () => {
    assert.equal(applyCommand(T(), { type: 'toggle' }, now).playing, false);
    assert.equal(applyCommand(T({ playing: false }), { type: 'toggle' }, now).playing, true);
  });
});

describe('change detection', () => {
  test('transportChanged ignores position, sees state', () => {
    const a = T();
    assert.equal(transportChanged(a, { ...a, pos: 99, anchorMs: 5 }), false);
    assert.equal(transportChanged(a, { ...a, playing: false }), true);
    assert.equal(transportChanged(undefined, a), true);
  });
  test('positionJumped flags a seek but not normal playback', () => {
    const a = T();
    assert.equal(positionJumped(a, 12, 1_002_000), false);
    assert.equal(positionJumped(a, 40, 1_002_000), true);
  });
  test('reanchor keeps the position', () => assert.equal(predictedPosition(reanchor(T(), 1_003_000), 1_003_000), 13));
  test('formatClock', () => { assert.equal(formatClock(75), '01:15'); assert.equal(formatClock(3725), '1:02:05'); assert.equal(formatClock(NaN), '00:00'); });
});

// A follower whose element starts 0.9 s late, runs 0.3% fast, with a 40 ms seek
// latency, steered only by driftDecision every 250 ms heartbeat: must lock < 100 ms.
describe('follower convergence (simulation)', () => {
  function simulate(opts: { startOffset: number; speedErr: number; loop?: boolean; seconds: number }) {
    const dt = 0.01, hb = 0.25;
    const auth = T({ loop: !!opts.loop, duration: 20, pos: 0, anchorMs: 0 });
    let el = auth.pos + opts.startOffset, elRate = 1, seekUntil = -1, pendingSeek = 0;
    let worst = 0, lockedAt = -1;
    const skew = (tSec: number) => Math.abs(signedDrift(el, predictedPosition(auth, tSec * 1000), !!opts.loop, 20));
    for (let t = 0; t < opts.seconds; t += dt) {
      if (seekUntil >= 0 && t >= seekUntil) { el = pendingSeek; seekUntil = -1; }
      if (seekUntil < 0) el += dt * elRate * (1 + opts.speedErr);
      if (opts.loop && el >= 20) el -= 20;
      if (!opts.loop && el > 20) el = 20;
      if (Math.abs(t / hb - Math.round(t / hb)) < dt / hb / 2 && seekUntil < 0) {
        const pred = predictedPosition(auth, t * 1000);
        const dec = driftDecision(signedDrift(el, pred, !!opts.loop, 20), pred, 1);
        elRate = dec.rate;
        if (dec.action === 'seek') { pendingSeek = predictedPosition(auth, (t + 0.05) * 1000); seekUntil = t + 0.04; }
      }
      if (t > 3) { worst = Math.max(worst, skew(t)); if (lockedAt < 0) lockedAt = t; }
    }
    return { worst, lockedAt };
  }
  test('late start (0.9 s behind) locks inside 100 ms after 3 s', () => assert.ok(simulate({ startOffset: -0.9, speedErr: 0.003, seconds: 20 }).worst < 0.1));
  test('early start (+2 s ahead) locks inside 100 ms', () => assert.ok(simulate({ startOffset: 2, speedErr: -0.003, seconds: 20 }).worst < 0.1));
  test('looping clip across seams stays inside 100 ms', () => assert.ok(simulate({ startOffset: -0.4, speedErr: 0.004, loop: true, seconds: 60 }).worst < 0.1));
});

// ── runtime registry with fake <video> elements ─────────────────────────────
class FakeVideo extends EventTarget {
  paused = true; ended = false; readyState = 4; currentTime = 0; duration = 100; playbackRate = 1;
  loop = true; muted = false; volume = 1; seeking = false;
  play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
const asEl = (f: FakeVideo) => f as unknown as HTMLVideoElement;

describe('videoSync runtime', () => {
  test('master is controllable by id; commands drive the real element', () => {
    _resetVideoSyncForTests();
    const v = new FakeVideo(); v.paused = false; v.currentTime = 20;
    const off = attachVideo(asEl(v), { key: 'clip', master: true });
    const id = videoId('program', 'clip');
    assert.equal(hasMaster('clip'), true);
    assert.equal(getInfo(id).controllable, true);
    command(id, { type: 'seek', sec: 55 }); assert.equal(v.currentTime, 55);
    command(id, { type: 'pause' }); assert.equal(v.paused, true);
    command(id, { type: 'play' }); assert.equal(v.paused, false);
    command(id, { type: 'skip', delta: -10 }); assert.equal(v.currentTime, 45);
    command(id, { type: 'rate', rate: 1.5 }); assert.equal(v.playbackRate, 1.5);
    command(id, { type: 'loop', on: false }); assert.equal(v.loop, false);
    command(id, { type: 'mute', muted: true }); assert.equal(v.muted, true);
    command(id, { type: 'volume', volume: 0.3 }); assert.equal(v.volume, 0.3);
    command(id, { type: 'restart' }); assert.equal(v.currentTime, 0);
    off(); assert.equal(hasMaster('clip'), false);
    assert.equal(getInfo(id).controllable, false);
    _resetVideoSyncForTests();
  });
  test('a second audible renderer is a muted shadow that follows; promoted when master leaves', () => {
    _resetVideoSyncForTests();
    const a = new FakeVideo(), b = new FakeVideo(); a.paused = false; b.paused = false;
    const offA = attachVideo(asEl(a), { key: 'k', master: true });
    const offB = attachVideo(asEl(b), { key: 'k', master: true });
    assert.equal(b.muted, true); assert.equal(b.volume, 0); assert.equal(a.muted, false);
    offA();
    assert.equal(b.muted, false); assert.equal(b.volume, 1);
    offB(); _resetVideoSyncForTests();
  });
  test('preview clip is local: silent and commandable, never program', () => {
    _resetVideoSyncForTests();
    const p = new FakeVideo(); p.muted = true; p.volume = 0; p.paused = false;
    const off = attachVideo(asEl(p), { key: 'k', master: false });
    assert.equal(hasMaster('k'), false);
    const info = getInfo(videoId('preview', 'k'));
    assert.equal(info.controllable, true); assert.equal(info.audioControllable, false);
    command(videoId('preview', 'k'), { type: 'seek', sec: 30 }); assert.equal(p.currentTime, 30);
    assert.equal(getInfo(videoId('program', 'k')).transport, null);
    off(); _resetVideoSyncForTests();
  });
  test('live streams (infinite duration) are reported play/pause only, with a reason', () => {
    _resetVideoSyncForTests();
    const v = new FakeVideo(); v.duration = Infinity; v.paused = false;
    const off = attachVideo(asEl(v), { key: 'live', master: true });
    const info = getInfo(videoId('program', 'live'));
    assert.equal(info.controllable, false); assert.match(info.reason ?? '', /Live stream/);
    off(); _resetVideoSyncForTests();
  });
  test('DEFAULT_DRIFT matches the spec (120 ms seek, 4% nudge)', () => {
    assert.equal(DEFAULT_DRIFT.seekAt, 0.12); assert.equal(DEFAULT_DRIFT.maxNudge, 0.04);
  });
});
