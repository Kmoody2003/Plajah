// clockSync (cross-machine timebase) and the operator video role.
// Run: npx tsx --test tests/amboClockAndOperator.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClockEstimator, measure, MIN_OFFSET_MS, clockNow, setClockOffset, getClockOffset } from '../services/ambo/clockSync';

// Build the four NTP timestamps for a follower whose clock is `skew` ms BEHIND the master,
// with one-way delays `up` and `down` (ms) and `proc` ms of master processing.
const exchange = (t0: number, skew: number, up: number, down: number, proc = 1) => {
  const t1 = t0 + skew + up;          // master clock when the ping arrives
  const t2 = t1 + proc;
  const t3 = t0 + up + proc + down;   // follower clock when the pong arrives
  return { t0, t1, t2, t3 };
};

describe('clock estimator', () => {
  test('recovers the offset between two clocks', () => {
    const m = measure(exchange(1000, 2500, 20, 20))!;
    assert.ok(Math.abs(m.offset - 2500) < 1, `offset ${m.offset}`);
    assert.ok(Math.abs(m.rtt - 40) < 1.5);
  });

  test('asymmetric delay bounds the error by rtt/2', () => {
    const m = measure(exchange(0, 1000, 10, 90))!;               // 100 ms round trip, badly lopsided
    assert.ok(Math.abs(m.offset - 1000) <= m.rtt / 2 + 0.5);
  });

  test('uses the lowest-rtt sample, not the latest or the average', () => {
    const e = new ClockEstimator();
    e.add(exchange(0, 3000, 200, 200));                          // noisy
    e.add(exchange(1000, 3000, 8, 8));                           // clean
    e.add(exchange(2000, 3000, 150, 150));                       // noisy
    const b = e.best()!;
    assert.ok(Math.abs(b.offset - 3000) < 1.5 && b.error < 10);
  });

  test('garbage samples are rejected', () => {
    const e = new ClockEstimator();
    assert.equal(e.add({ t0: 10, t1: 0, t2: 0, t3: 5 }), false);          // negative rtt
    assert.equal(e.add({ t0: 0, t1: 0, t2: 0, t3: 60_000 }), false);      // 60 s round trip
    assert.equal(e.applied(), 0);
  });

  test('same-machine noise is NOT applied: clocks that agree stay on Date.now()', () => {
    const e = new ClockEstimator();
    for (let i = 0; i < 8; i++) e.add(exchange(i * 1000, (i % 3) - 1, 1 + i % 4, 1 + (i * 3) % 5));   // +-1 ms jitter
    assert.equal(e.applied(), 0);
  });

  test('a real skew IS applied', () => {
    const e = new ClockEstimator();
    for (let i = 0; i < 5; i++) e.add(exchange(i * 1000, -4200, 12 + i, 12));
    assert.ok(Math.abs(e.applied() + 4200) < 8, `applied ${e.applied()}`);
    assert.ok(Math.abs(e.applied()) > MIN_OFFSET_MS);
  });

  test('clockNow follows the offset', () => {
    setClockOffset(5000);
    assert.ok(Math.abs(clockNow() - (Date.now() + 5000)) < 5);
    setClockOffset(0); assert.equal(getClockOffset(), 0);
  });
});

describe('operator video role', () => {
  test('sees Program video from the studio and relays commands', async () => {
    const sync = await import('../services/ambo/videoSync');
    sync._resetVideoSyncForTests();
    sync.setVideoSyncRole('operator');

    const studio = new BroadcastChannel(sync.VIDEO_SYNC_CHANNEL);   // plays the main window
    (studio as any).unref?.();
    const seen: any[] = [];
    studio.onmessage = e => seen.push(e.data);

    const transport = { key: 'https://x/clip.mp4', playing: true, rate: 1, pos: 12, anchorMs: Date.now(), loop: false, duration: 90, volume: 1, muted: false, ended: false };
    studio.postMessage({ type: 'VSYNC', at: Date.now(), items: [transport] });
    await new Promise(r => setTimeout(r, 60));

    const vids = sync.remoteVideos();
    assert.equal(vids.length, 1);
    assert.equal(vids[0].id, 'program:https://x/clip.mp4');
    assert.equal(vids[0].transport.duration, 90);

    // an operator command reaches the studio side of the channel
    sync.command('program:https://x/clip.mp4', { type: 'restart' });
    await new Promise(r => setTimeout(r, 60));
    const cmd = seen.find(m => m.type === 'VCMD');
    assert.ok(cmd, 'VCMD relayed');
    assert.deepEqual(cmd.cmd, { type: 'restart' });
    assert.equal(cmd.id, 'program:https://x/clip.mp4');

    studio.close();
    sync._resetVideoSyncForTests();
  });

  test('a clip that stopped reporting drops out', async () => {
    const sync = await import('../services/ambo/videoSync');
    sync._resetVideoSyncForTests();
    sync.setVideoSyncRole('operator');
    assert.equal(sync.remoteVideos().length, 0);
    sync._resetVideoSyncForTests();
  });
});
