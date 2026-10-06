// Multi-session sync + output layouts. Run: npx tsx --test tests/amboSessionSync.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionSync, electLeader, livePeers, isNewer, mergeState, roleAllows, makeTabId, STALE_MS,
  type ChannelLike, type Peer, type SessionCommand,
} from '../services/ambo/sessionSync';
import {
  displayKey, captureLayout, resolvePlacements, applyResolved, diffScreens, planHotplug,
} from '../services/ambo/outputLayouts';

class Bus {
  chans: FakeChannel[] = [];
  channel() { const c = new FakeChannel(this); this.chans.push(c); return c; }
}
class FakeChannel implements ChannelLike {
  fns = new Set<(e: { data: any }) => void>();
  constructor(private bus: Bus) {}
  postMessage(m: any) { for (const c of this.bus.chans) if (c !== this) for (const f of c.fns) f({ data: JSON.parse(JSON.stringify(m)) }); }
  addEventListener(_t: 'message', fn: any) { this.fns.add(fn); }
  removeEventListener(_t: 'message', fn: any) { this.fns.delete(fn); }
  close() { this.bus.chans = this.bus.chans.filter(c => c !== this); }
}

const peer = (tabId: string, lastSeen: number): Peer => ({ tabId, joinedAt: 0, lastSeen, role: 'all' });

describe('election (pure)', () => {
  test('lowest id among live peers wins', () => {
    assert.equal(electLeader([peer('b', 100), peer('c', 100)], 'z', 100), 'b');
    assert.equal(electLeader([peer('b', 100)], 'a', 100), 'a');
  });
  test('stale peers are ignored', () => {
    assert.equal(electLeader([peer('a', 0), peer('b', 10_000)], 'c', 10_000), 'b');
    assert.equal(livePeers([peer('a', 0)], STALE_MS + 1).length, 0);
  });
  test('operator-only windows never lead', () => {
    assert.equal(electLeader([{ ...peer('a', 100), canLead: false }, peer('m', 100)], 'z', 100), 'm');
    assert.equal(electLeader([peer('m', 100)], 'a', 100, STALE_MS, false), 'm');
    assert.equal(electLeader([], 'a', 100, STALE_MS, false), '');
  });
  test('tab ids sort by creation time', () => {
    assert.ok(makeTabId(1000, 0.9) < makeTabId(2000, 0.1));
  });
  test('snapshot merge: epoch then seq', () => {
    assert.equal(isNewer({ epoch: 1, seq: 0 }, { epoch: 0, seq: 99 }), true);
    assert.equal(isNewer({ epoch: 1, seq: 3 }, { epoch: 1, seq: 3 }), false);
    const a = { epoch: 1, seq: 5, v: 'a' }; const b = { epoch: 1, seq: 4, v: 'b' };
    assert.equal(mergeState(a, b).v, 'a');
    assert.equal(mergeState(null as any, b).v, 'b');
  });
  test('roles gate commands', () => {
    assert.equal(roleAllows('scripture', { type: 'take-slide', slideId: 'x' }), false);
    assert.equal(roleAllows('scripture', { type: 'fire-scripture', reference: 'John 3:16' }), true);
    assert.equal(roleAllows('all', { type: 'next' }), true);
  });
});

describe('SessionSync over a channel', () => {
  const mk = (bus: Bus, id: string, clock: { t: number }, role: any = 'all', onCommand?: any) =>
    new SessionSync({ tabId: id, role, clock: () => clock.t, channel: bus.channel(), autoBeat: false, onCommand });

  test('two operators: oldest leads, presence shows both', () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const a = mk(bus, '001-a', clock); const b = mk(bus, '002-b', clock);
    assert.equal(a.isLeader, true); assert.equal(b.isLeader, false);
    assert.equal(b.leader, '001-a');
    assert.equal(a.presence.length, 2); assert.equal(b.presence.length, 2);
  });

  test('leader snapshots reach followers; stale ones are ignored', () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const a = mk(bus, '001-a', clock); const b = mk(bus, '002-b', clock);
    a.publish({ slides: [{ id: 's1', label: 'V1' }], liveSlideId: 's1', showTitle: 'Amazing Grace' });
    assert.equal(b.snapshot?.liveSlideId, 's1');
    a.publish({ slides: [], liveSlideId: 's2' });
    assert.equal(b.snapshot?.liveSlideId, 's2');
    b.publish({ slides: [], liveSlideId: 'nope' }); // follower publish is a no-op
    assert.equal(a.snapshot?.liveSlideId, 's2');
  });

  test('late joiner receives the current snapshot', () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const a = mk(bus, '001-a', clock);
    a.publish({ slides: [], liveSlideId: 'live1' });
    const b = mk(bus, '002-b', clock);
    assert.equal(b.snapshot?.liveSlideId, 'live1');
  });

  test('follower command is executed by the leader and acked', async () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const got: SessionCommand[] = [];
    const a = mk(bus, '001-a', clock, 'all', (c: SessionCommand) => { got.push(c); });
    const b = mk(bus, '002-b', clock, 'lyrics');
    const r = await b.command({ type: 'take-slide', slideId: 's7' });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(got, [{ type: 'take-slide', slideId: 's7' }]);
    const denied = await b.command({ type: 'fire-scripture', reference: 'x' });
    assert.equal(denied.ok, false);
    assert.equal(got.length, 1);
  });

  test('leader errors come back as a failed ack', async () => {
    const bus = new Bus(); const clock = { t: 1000 };
    mk(bus, '001-a', clock, 'all', () => { throw new Error('no such slide'); });
    const b = mk(bus, '002-b', clock);
    const r = await b.command({ type: 'next' });
    assert.deepEqual(r, { ok: false, error: 'no such slide' });
  });

  test('leader closes: follower takes over with a higher epoch and republishes', async () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const a = mk(bus, '001-a', clock); const b = mk(bus, '002-b', clock);
    a.publish({ slides: [], liveSlideId: 'x' });
    b.publish({ slides: [], liveSlideId: 'x' }); // remembered for takeover
    a.close();
    assert.equal(b.isLeader, true);
    assert.ok(b.epoch > a.epoch);
    const r = await b.command({ type: 'clear' });
    assert.equal(r.ok, true);
  });

  test('crashed leader (no bye) is dropped after the stale window', () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const a = mk(bus, '001-a', clock); const b = mk(bus, '002-b', clock);
    assert.equal(b.leader, '001-a');
    clock.t += STALE_MS + 1;
    b.beat();
    assert.equal(b.isLeader, true);
    assert.equal(b.presence.length, 1);
    void a;
  });

  test('command with no leader reachable times out', async () => {
    const clock = { t: 1000 };
    const b = new SessionSync({ tabId: '002-b', clock: () => clock.t, channel: new Bus().channel(), autoBeat: false });
    // pretend a leader exists but never answers
    (b as any).peers = [peer('001-a', clock.t)];
    (b as any).recompute();
    const r = await b.command({ type: 'next' }, 30);
    assert.equal(r.ok, false);
  });
});

describe('thin operator window', () => {
  test('never becomes leader even when the main window dies', () => {
    const bus = new Bus(); const clock = { t: 1000 };
    const main = new SessionSync({ tabId: '001-main', clock: () => clock.t, channel: bus.channel(), autoBeat: false });
    const op = new SessionSync({ tabId: '002-op', canLead: false, clock: () => clock.t, channel: bus.channel(), autoBeat: false });
    assert.equal(op.leader, '001-main');
    main.close();
    assert.equal(op.isLeader, false);
  });
});

describe('output layouts', () => {
  const scr = (index: number, label: string, w = 1920, h = 1080, primary = false) =>
    ({ index, left: index * w, top: 0, width: w, height: h, label, primary }) as any;
  const out = (id: string, screenIndex?: number) => ({ id, name: id, kind: 'PROGRAM', layers: [], enabled: true, screenIndex }) as any;
  const home = [scr(0, 'Laptop', 1920, 1080, true), scr(1, 'Epson Projector'), scr(2, 'Samsung Monitor')];

  test('capture only pins enabled outputs with a screen', () => {
    const lay = captureLayout('Sunday', [out('pgm', 1), out('stage', 2), out('none'), { ...out('off', 1), enabled: false }], home, 'L1');
    assert.deepEqual(lay.placements.map(p => p.outputId), ['pgm', 'stage']);
    assert.equal(lay.placements[0].displayKey, displayKey(home[1]));
  });

  test('restore matches by display key even when the index order changed', () => {
    const lay = captureLayout('Sunday', [out('pgm', 1), out('stage', 2)], home, 'L1');
    const reordered = [scr(0, 'Laptop', 1920, 1080, true), scr(1, 'Samsung Monitor'), scr(2, 'Epson Projector')];
    const r = resolvePlacements(lay, reordered);
    assert.deepEqual(r.map(x => [x.outputId, x.screenIndex, x.matchedBy]), [['pgm', 2, 'key'], ['stage', 1, 'key']]);
  });

  test('falls back to saved index when the monitor model changed', () => {
    const lay = captureLayout('Sunday', [out('pgm', 1)], home, 'L1');
    const swapped = [scr(0, 'Laptop', 1920, 1080, true), scr(1, 'Loaner Projector', 1280, 800)];
    const r = resolvePlacements(lay, swapped);
    assert.deepEqual([r[0].screenIndex, r[0].matchedBy], [1, 'index']);
  });

  test('missing monitor yields null, never double-booking another output', () => {
    const lay = captureLayout('Sunday', [out('pgm', 1), out('stage', 2)], home, 'L1');
    const r = resolvePlacements(lay, [scr(0, 'Laptop', 1920, 1080, true), scr(1, 'Epson Projector')]);
    assert.deepEqual(r.map(x => x.screenIndex), [1, null]);
  });

  test('applyResolved updates screenIndex and size for auto-detect outputs', () => {
    const lay = captureLayout('S', [out('pgm', 1)], home, 'L1');
    const r = resolvePlacements(lay, [home[0], scr(1, 'Epson Projector', 3840, 2160)]);
    const o = applyResolved([{ ...out('pgm'), autoDetectDisplay: true }], r, [home[0], scr(1, 'Epson Projector', 3840, 2160)]);
    assert.equal(o[0].screenIndex, 1);
  });

  test('hot-plug: diff and re-place only moved windows', () => {
    const lay = captureLayout('S', [out('pgm', 1), out('stage', 2)], home, 'L1');
    const unplugged = [home[0], home[1]];
    const d = diffScreens(home, unplugged);
    assert.equal(d.removed.length, 1); assert.equal(d.changed, true);
    let plan = planHotplug(lay, [out('pgm', 1), out('stage', 2)], unplugged);
    assert.deepEqual(plan.orphaned, ['stage']); assert.equal(plan.reopen.length, 0);
    // replug as a different enumeration order
    const replug = [home[0], scr(1, 'Samsung Monitor'), scr(2, 'Epson Projector')];
    assert.equal(diffScreens(unplugged, replug).added.length, 1);
    plan = planHotplug(lay, [out('pgm', 1), out('stage')], replug);
    assert.deepEqual(plan.reopen.sort((a, b) => a.outputId.localeCompare(b.outputId)), [{ outputId: 'pgm', screenIndex: 2 }, { outputId: 'stage', screenIndex: 1 }]);
  });

  test('identical re-enumeration is not a change', () => {
    assert.equal(diffScreens(home, home.map(s => ({ ...s }))).changed, false);
  });
});
