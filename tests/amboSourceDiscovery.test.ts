import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { SourceDiscovery, SrtSupervisor, srtLinkState, stableSourceId, mapNdiStatus, type Clock, type DiscoveryBridge, type DiscoveryEvent } from '../services/mediaEngine/sourceDiscovery';
import type { NativeSourceInfo } from '../services/mediaEngine/bridge';

function fakeClock() {
  let t = 1000; const q: Array<{ at: number; fn: () => void; id: number }> = []; let n = 0;
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { const id = ++n; q.push({ at: t + ms, fn, id }); return id; },
    clearTimeout: h => { const i = q.findIndex(x => x.id === h); if (i >= 0) q.splice(i, 1); },
  };
  return { clock, advance(ms: number) { t += ms; }, pending: () => q.length, runDue() { const due = q.filter(x => x.at <= t); due.forEach(d => { q.splice(q.indexOf(d), 1); d.fn(); }); } };
}
const src = (id: string, label = id, kind: any = 'ndi'): NativeSourceInfo => ({ id, label, kind, formats: [] });
function fakeBridge(over: Partial<DiscoveryBridge> & { ndi?: NativeSourceInfo[]; omt?: NativeSourceInfo[] } = {}) {
  const state = { ndi: over.ndi ?? [], omt: over.omt ?? [], ndiScans: 0, native: true,
    ndiInfo: { installed: true, finderRunning: true } as any, ndiFail: false, srtTransport: { hostAnswered: true, transportAvailable: true } as any };
  const stats = new Map<string, any>(); const started: string[] = [];
  const bridge: DiscoveryBridge = {
    hasNative: () => state.native,
    scanNdi: async () => { state.ndiScans++; if (state.ndiFail) throw new Error('boom'); return state.ndi; },
    scanOmt: async () => state.omt,
    ndiStatus: async () => state.ndiInfo,
    srtTransport: async () => state.srtTransport,
    srtListen: async a => { started.push(a.streamId); stats.set(a.streamId, { status: 'Listening' }); return { success: true }; },
    srtCall: async a => { started.push(a.streamId); stats.set(a.streamId, { status: 'Connected', bitrateMbps: 5 }); return { success: true }; },
    srtStop: async id => stats.delete(id),
    srtStats: async id => stats.get(id) ?? null,
  };
  return { bridge, state, stats, started };
}
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
function make(b = fakeBridge(), extra = {}) {
  const c = fakeClock();
  const d = new SourceDiscovery({ bridge: b.bridge, clock: c.clock, storage: mem(), isVisible: () => true, watchVisibility: undefined, ...extra });
  const events: DiscoveryEvent[] = []; d.onEvent(e => events.push(e));
  return { d, c, b, events, types: () => events.filter(e => e.type !== 'status').map(e => (e as any).type + ':' + (e as any).source.id) };
}
const tick = () => new Promise(r => setImmediate(r));

describe('SourceDiscovery diff + stale logic', () => {
  test('added, changed, then offline after N misses, then dropped', async () => {
    const t = make(fakeBridge({ ndi: [src('ndi:A')], omt: [src('omt:B', 'B', 'omt')] }), { offlineAfterMisses: 3, dropAfterMs: 60_000 });
    await t.d.scanNow();
    assert.deepEqual(t.types(), ['added:ndi:A', 'added:omt:B']);
    t.b.state.ndi = [{ ...src('ndi:A'), label: 'A renamed' }];
    await t.d.scanNow();
    assert.ok(t.types().includes('changed:ndi:A'));
    t.b.state.ndi = []; t.events.length = 0;
    await t.d.scanNow(); await t.d.scanNow();
    assert.equal(t.d.getSnapshot().sources.find(s => s.id === 'ndi:A')!.online, true, 'two misses is not offline yet');
    await t.d.scanNow();
    assert.deepEqual(t.types(), ['offline:ndi:A']);
    assert.equal(t.d.getSnapshot().sources.find(s => s.id === 'ndi:A')!.online, false);
    t.b.state.ndi = [src('ndi:A', 'A renamed')]; t.events.length = 0;
    await t.d.scanNow();
    assert.deepEqual(t.types(), ['online:ndi:A']);
    t.b.state.ndi = [];
    for (let i = 0; i < 3; i++) await t.d.scanNow();
    t.c.advance(61_000); await t.d.scanNow();
    assert.ok(!t.d.getSnapshot().sources.some(s => s.id === 'ndi:A'));
    assert.ok(t.types().includes('removed:ndi:A'));
  });

  test('a failed scan does not count as a miss', async () => {
    const t = make(fakeBridge({ ndi: [src('ndi:A')] }), { offlineAfterMisses: 1 });
    await t.d.scanNow();
    t.b.state.ndi = []; t.b.state.ndiFail = true;
    await t.d.scanNow();
    assert.equal(t.d.getSnapshot().sources[0].online, true);
    assert.equal(t.d.getSnapshot().status.ndi.state, 'error');
  });

  test('ids are stable and derived, never positional', () => {
    assert.equal(stableSourceId('ndi', { ...src(''), id: '', machineName: 'PC 1', streamName: 'Out' }), 'ndi:PC_1/Out');
    assert.equal(stableSourceId('omt', src('omt:x')), 'omt:x');
  });

  test('polling backs off while steady, resets on change, pauses when hidden', async () => {
    let visible = true; let vis: () => void = () => {};
    const t = make(fakeBridge({ ndi: [src('ndi:A')] }), { baseIntervalMs: 1000, maxIntervalMs: 4000, isVisible: () => visible, watchVisibility: (cb: () => void) => { vis = cb; return () => {}; } });
    t.d.start(); await tick();
    assert.equal(t.b.state.ndiScans, 1);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) { t.c.advance(t.d.currentIntervalMs); t.c.runDue(); await tick(); seen.push(t.d.currentIntervalMs); }
    assert.equal(seen[seen.length - 1], 4000, 'interval grows to the cap when nothing changes');
    t.b.state.ndi = [src('ndi:A'), src('ndi:Z')];
    t.c.advance(5000); t.c.runDue(); await tick();
    assert.equal(t.d.currentIntervalMs, 1000);
    visible = false; vis(); t.c.advance(100000);
    const n = t.b.state.ndiScans; t.c.runDue(); await tick();
    assert.equal(t.b.state.ndiScans, n, 'no scans while hidden');
    visible = true; vis(); await tick();
    assert.equal(t.b.state.ndiScans, n + 1, 'scans again on becoming visible');
    t.d.stop();
  });

  test('per-protocol status reflects missing runtime / finder off / browser', async () => {
    const t = make(fakeBridge());
    t.b.state.ndiInfo = { installed: false, finderRunning: false, diagnosis: 'Install NDI Tools' };
    await t.d.scanNow(); assert.equal(t.d.getSnapshot().status.ndi.state, 'not-installed');
    t.b.state.ndiInfo = { installed: true, finderRunning: false }; await t.d.scanNow();
    assert.equal(t.d.getSnapshot().status.ndi.state, 'finder-off');
    t.b.state.native = false; await t.d.scanNow();
    assert.equal(t.d.getSnapshot().status.ndi.state, 'unsupported');
    assert.equal(t.d.getSnapshot().status.omt.state, 'unsupported');
    assert.equal(mapNdiStatus(null, true, 0).state, 'unknown');
  });

  test('snapshot identity is stable until something changes', async () => {
    const t = make(fakeBridge({ ndi: [src('ndi:A')] }));
    await t.d.scanNow(); const a = t.d.getSnapshot(); assert.equal(t.d.getSnapshot(), a);
  });
});

describe('SRT honest auto-detection equivalents', () => {
  test('without a real transport nothing is shown as live and status says so', async () => {
    const t = make(fakeBridge());
    t.b.state.srtTransport = { hostAnswered: true, transportAvailable: false, reason: 'libsrt not linked' };
    t.d.srt.remember({ mode: 'listener', port: 9000, autoStart: true });
    await t.d.srt.tick();
    assert.equal(t.d.getSnapshot().status.srt.state, 'transport-missing');
    assert.match(t.d.getSnapshot().status.srt.detail!, /libsrt/);
    assert.deepEqual(t.b.started, [], 'must not pretend to start');
    assert.equal(t.d.getSnapshot().sources.find(s => s.protocol === 'srt')!.online, false);
  });

  test('browser/no host reports unsupported', async () => {
    const b = fakeBridge(); b.state.native = false; b.state.srtTransport = null;
    const t = make(b); await t.d.srt.tick();
    assert.equal(t.d.getSnapshot().status.srt.state, 'unsupported');
  });

  test('remembered endpoints persist, dedupe, and auto-start on launch; listener goes online when an encoder connects', async () => {
    const storage = mem(); const b = fakeBridge(); const c = fakeClock();
    const first = new SourceDiscovery({ bridge: b.bridge, clock: c.clock, storage });
    first.srt.remember({ mode: 'listener', port: 9000, autoStart: true });
    first.srt.remember({ mode: 'listener', port: 9000, autoStart: true });
    first.srt.remember({ mode: 'caller', host: '10.0.0.4', port: 9100, autoStart: false });
    assert.equal(first.srt.list().length, 2);
    const second = new SourceDiscovery({ bridge: b.bridge, clock: c.clock, storage });
    const ev: DiscoveryEvent[] = []; second.onEvent(e => ev.push(e));
    await second.srt.tick();
    assert.deepEqual(b.started, ['srt:listen:9000'], 'only the auto-start endpoint launches');
    let s = second.getSnapshot().sources.find(x => x.id === 'srt:listen:9000')!;
    assert.equal(s.online, false); assert.match(s.status!, /waiting/);
    b.stats.set('srt:listen:9000', { status: 'Listening', bitrateMbps: 8 });
    await second.srt.tick();
    s = second.getSnapshot().sources.find(x => x.id === 'srt:listen:9000')!;
    assert.equal(s.online, true);
    assert.ok(ev.some(e => e.type === 'online'));
    assert.equal(second.getSnapshot().status.srt.state, 'ok');
  });

  test('failed start retries with backoff, not in a tight loop', async () => {
    const b = fakeBridge(); const c = fakeClock();
    let calls = 0; b.bridge.srtListen = async () => { calls++; return { success: false, error: 'port busy' }; };
    const sup = new SrtSupervisor(b.bridge, c.clock, mem(), { setSources() {}, setStatus() {}, emit() {} });
    sup.remember({ mode: 'listener', port: 9000, autoStart: true });
    await sup.tick(); await sup.tick(); assert.equal(calls, 1, 'second tick is inside the backoff window');
    c.advance(2100); await sup.tick(); assert.equal(calls, 2);
    c.advance(2100); await sup.tick(); assert.equal(calls, 2, 'backoff doubled');
    assert.equal(sup.linkState('srt:listen:9000'), 'retrying');
  });

  test('encrypted endpoints are not auto-started and no passphrase is stored', async () => {
    const storage = mem(); const b = fakeBridge(); const c = fakeClock();
    const sup = new SrtSupervisor(b.bridge, c.clock, storage, { setSources() {}, setStatus() {}, emit() {} });
    sup.remember({ mode: 'caller', host: 'h', port: 1, autoStart: true, needsPassphrase: true });
    await sup.tick();
    assert.deepEqual(b.started, []); assert.equal(sup.linkState('srt:call:h:1'), 'needs-passphrase');
    assert.ok(!/"passphrase"/i.test(storage.getItem('ambo.srt.endpoints.v1')!));
  });

  test('srtLinkState never reads a registered-only session as up', () => {
    assert.equal(srtLinkState('caller', { status: 'Registered only - SRT transport not linked, not connected', bitrateMbps: 0 }), 'down');
    assert.equal(srtLinkState('listener', { status: 'Listening' }), 'waiting');
    assert.equal(srtLinkState('caller', null), 'down');
  });
});
