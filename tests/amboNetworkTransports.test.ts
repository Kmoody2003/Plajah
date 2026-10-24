// amboNetworkTransports.test.ts — TS-side routing for Stage's NDI / OMT / SRT outputs and SRT inputs.
// Run with: npx tsx --test tests/amboNetworkTransports.test.ts
//
// The native transports themselves are checked by windows-native/tools/TransportLoopback (real NDI,
// OMT and SRT sinks + receivers on this PC). These tests cover what the page decides: settings,
// validation, the commands it sends, status mapping, reconnect, passphrase handling, the feeder gate.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  NetworkOutputManager, parseSrtUrl, buildSrtUrl, validateSrt, startArgs, defaultOutput, OUTPUTS_KEY,
  type OutputBridge, type FrameFeeder, type NativeOutputStatus, type Clock,
} from '../services/ambo/networkOutputs';
import { isNativeLiveInput } from '../services/ambo/liveInputs';
import { SrtSupervisor, type DiscoveryBridge } from '../services/mediaEngine/sourceDiscovery';
import { nextSlot, toS16Stereo48k, FEED_SLOTS } from '../services/ambo/programFrameFeeder';

// ── fakes ────────────────────────────────────────────────────────────────────
class FakeClock implements Clock {
  t = 0; seq = 0;
  timers = new Map<number, { at: number; fn: () => void }>();
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = ++this.seq; this.timers.set(id, { at: this.t + ms, fn }); return id; }
  clearTimeout(h: unknown) { this.timers.delete(h as number); }
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.timers.delete(next[0]); this.t = next[1].at; next[1].fn();
      await flush();
    }
    this.t = end;
  }
}
const flush = () => new Promise(r => setImmediate(r));

class FakeStorage { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

class FakeFeeder implements FrameFeeder { running = false; starts = 0; start() { this.running = true; this.starts++; } stop() { this.running = false; } }

class FakeBridge implements OutputBridge {
  native = true;
  calls: Array<{ cmd: string; args?: any }> = [];
  running = new Map<string, NativeOutputStatus>();
  failNext: any = null;
  srtAvailable = true;
  private statusCb: ((m: any) => void) | null = null;
  hasNative() { return this.native; }
  onStatus(cb: (m: any) => void) { this.statusCb = cb; return () => { this.statusCb = null; }; }
  push(outputs: NativeOutputStatus[]) { this.statusCb?.({ outputs, srt: { transportAvailable: this.srtAvailable } }); }
  async invoke(cmd: string, args?: any) {
    this.calls.push({ cmd, args });
    if (cmd === 'srt_info') return { transportAvailable: this.srtAvailable, reason: this.srtAvailable ? null : 'No ffmpeg with libsrt' };
    if (cmd === 'program_out_start') {
      if (this.failNext) { const r = this.failNext; this.failNext = null; return r; }
      if (args.kind === 'srt' && !this.srtAvailable) return { success: false, transportAvailable: false, error: 'No ffmpeg with libsrt' };
      const st: NativeOutputStatus = { id: args.id, kind: args.kind, name: args.name, state: 'waiting', connections: 0 };
      this.running.set(args.id, st);
      return { success: true, status: st };
    }
    if (cmd === 'program_out_stop') return { success: this.running.delete(args.id) };
    if (cmd === 'program_out_status') return { outputs: [...this.running.values()] };
    return null;
  }
  starts() { return this.calls.filter(c => c.cmd === 'program_out_start'); }
}

function setup(opts: { storage?: FakeStorage } = {}) {
  const bridge = new FakeBridge(), feeder = new FakeFeeder(), clock = new FakeClock(), storage = opts.storage ?? new FakeStorage();
  const m = new NetworkOutputManager(bridge, feeder, storage, clock, 3000);
  return { bridge, feeder, clock, storage, m };
}
const view = (m: NetworkOutputManager, id: string) => m.getViews().find(v => v.config.id === id)!;

// ── SRT URL helpers ──────────────────────────────────────────────────────────
describe('SRT URLs', () => {
  test('parses a caller URL with ms latency, stream id and passphrase (passphrase kept apart)', () => {
    const r = parseSrtUrl('srt://192.168.1.40:9000?mode=caller&latency=200&streamid=pgm&passphrase=secretsecret');
    assert.ok(!('error' in r));
    assert.deepEqual(r.settings, { mode: 'caller', host: '192.168.1.40', port: 9000, latencyMs: 200, streamId: 'pgm', encrypted: true });
    assert.equal(r.passphrase, 'secretsecret');
  });
  test('ffmpeg-style microsecond latency is converted to ms', () => {
    const r = parseSrtUrl('srt://encoder.local:7001?mode=caller&latency=120000');
    assert.ok(!('error' in r)); assert.equal(r.settings.latencyMs, 120);
  });
  test('no mode: empty host means listener, a host means caller', () => {
    const a = parseSrtUrl('srt://:9000'), b = parseSrtUrl('srt://10.0.0.5:9000');
    assert.ok(!('error' in a) && !('error' in b));
    assert.equal(a.settings.mode, 'listener'); assert.equal(b.settings.mode, 'caller');
    assert.equal(a.settings.latencyMs, 120);
  });
  test('IPv6 host and bad URLs', () => {
    const r = parseSrtUrl('srt://[fe80::1]:9000?mode=caller');
    assert.ok(!('error' in r)); assert.equal(r.settings.host, 'fe80::1');
    assert.ok('error' in parseSrtUrl('rtmp://x/y'));
    assert.ok('error' in parseSrtUrl('srt://host-without-port'));
  });
  test('build never includes the passphrase unless asked, and round-trips', () => {
    const s = { mode: 'caller' as const, host: '10.1.1.1', port: 9001, latencyMs: 250, streamId: 'a b', encrypted: true };
    const url = buildSrtUrl(s);
    assert.ok(!url.includes('passphrase'));
    const back = parseSrtUrl(buildSrtUrl(s, 'hunter2hunter2'));
    assert.ok(!('error' in back));
    assert.equal(back.passphrase, 'hunter2hunter2');
    assert.deepEqual({ ...back.settings }, s);
    assert.match(buildSrtUrl({ mode: 'caller', host: 'fe80::1', port: 1, latencyMs: 20 }), /^srt:\/\/\[fe80::1\]:1\?/);
  });
  test('validation messages', () => {
    assert.deepEqual(validateSrt({ mode: 'listener', port: 9000, latencyMs: 120 }), []);
    assert.equal(validateSrt({ mode: 'caller', port: 9000, latencyMs: 120 }).length, 1);
    assert.equal(validateSrt({ mode: 'caller', host: 'a b', port: 9000, latencyMs: 120 }).length, 1);
    assert.equal(validateSrt({ mode: 'listener', port: 70000, latencyMs: 120 }).length, 1);
    assert.equal(validateSrt({ mode: 'listener', port: 9000, latencyMs: 5 }).length, 1);
    assert.equal(validateSrt({ mode: 'listener', port: 9000, latencyMs: 120 }, 'short').length, 1);
    assert.deepEqual(validateSrt({ mode: 'listener', port: 9000, latencyMs: 120 }, 'tenchars!!'), []);
  });
});

// ── command shape ────────────────────────────────────────────────────────────
describe('program_out_start arguments', () => {
  test('SRT carries mode/host/port/latency/passphrase; listener drops the host', () => {
    const fmt = { width: 1920, height: 1080, fps: 30, bitrateKbps: 8000 };
    const o = { id: 'x', kind: 'srt' as const, name: 'Truck', enabled: true, srt: { mode: 'caller' as const, host: ' 10.0.0.9 ', port: 9000, latencyMs: 300, streamId: 'pgm' } };
    assert.deepEqual(startArgs(o, fmt, 'passphrase123'), {
      id: 'x', kind: 'srt', name: 'Truck', fps: 30, bitrateKbps: 8000,
      srt: { mode: 'caller', host: '10.0.0.9', port: 9000, latencyMs: 300, streamId: 'pgm', passphrase: 'passphrase123' },
    });
    const l = startArgs({ ...o, srt: { ...o.srt, mode: 'listener' } }, fmt) as any;
    assert.equal(l.srt.host, ''); assert.equal(l.srt.passphrase, undefined);
  });
  test('NDI / OMT carry only the source name; blank names get a default', () => {
    assert.deepEqual(startArgs({ id: 'n', kind: 'ndi', name: '  ', enabled: true }, { width: 1280, height: 720, fps: 60, bitrateKbps: 6000 }),
      { id: 'n', kind: 'ndi', name: 'Stage Program', fps: 60, bitrateKbps: 6000 });
  });
  test('default outputs: unique ids, numbered names, SRT listeners on distinct ports', () => {
    const a = defaultOutput('srt', [], () => 0.1), b = defaultOutput('srt', [a], () => 0.2);
    assert.notEqual(a.id, b.id); assert.equal(b.name, 'Stage Program SRT 2');
    assert.equal(a.srt!.port, 9000); assert.equal(b.srt!.port, 9001);
  });
});

// ── manager behaviour ────────────────────────────────────────────────────────
describe('NetworkOutputManager', () => {
  test('turning an output on starts it natively and gates the frame feeder', async () => {
    const { m, bridge, feeder } = setup();
    const o = m.add('ndi');
    assert.equal(view(m, o.id).state, 'off');
    assert.equal(feeder.running, false);
    const r = await m.setEnabled(o.id, true);
    assert.ok(r.ok);
    assert.equal(bridge.starts().length, 1);
    assert.equal(feeder.running, true, 'frames flow once a sink runs');
    assert.equal(view(m, o.id).state, 'waiting');
    bridge.push([{ id: o.id, kind: 'ndi', name: o.name, state: 'live', connections: 2, detail: '2 receivers connected' }]);
    assert.equal(view(m, o.id).state, 'live');
    assert.equal(view(m, o.id).connections, 2);
    await m.setEnabled(o.id, false);
    assert.ok(bridge.calls.some(c => c.cmd === 'program_out_stop' && c.args.id === o.id));
    assert.equal(feeder.running, false, 'no outputs → no frame copies');
  });

  test('settings persist; passphrases never do; encrypted SRT waits for its passphrase after relaunch', async () => {
    const storage = new FakeStorage();
    const first = setup({ storage });
    const o = first.m.add('srt');
    await first.m.update(o.id, { srt: { mode: 'listener', port: 9100, latencyMs: 200 } }, 'correct-horse-battery');
    const r = await first.m.setEnabled(o.id, true);
    assert.ok(r.ok);
    assert.equal(first.bridge.starts().at(-1)!.args.srt.passphrase, 'correct-horse-battery');
    const saved = storage.getItem(OUTPUTS_KEY)!;
    assert.ok(!saved.includes('correct-horse-battery'), 'no passphrase in storage');
    assert.ok(saved.includes('"encrypted":true'));

    const second = setup({ storage });
    second.m.start();
    await flush();
    assert.equal(second.bridge.starts().length, 0, 'not auto-started without the passphrase');
    assert.equal(view(second.m, o.id).state, 'needs-passphrase');
    assert.equal(view(second.m, o.id).config.srt!.port, 9100);
    const r2 = await second.m.setEnabled(o.id, true, 'correct-horse-battery');
    assert.ok(r2.ok);
    assert.equal(second.bridge.starts().length, 1);
  });

  test('outputs left on resume at launch (unencrypted)', async () => {
    const storage = new FakeStorage();
    const a = setup({ storage });
    const n = a.m.add('ndi'); await a.m.setEnabled(n.id, true);
    const om = a.m.add('omt');
    const b = setup({ storage });
    b.m.start(); await flush();
    assert.deepEqual(b.bridge.starts().map(c => c.args.id), [n.id], 'only the enabled one');
    assert.ok(om);
  });

  test('invalid SRT settings are refused before anything is sent', async () => {
    const { m, bridge } = setup();
    const o = m.add('srt');
    await m.update(o.id, { srt: { mode: 'caller', host: '', port: 9000, latencyMs: 120 } });
    const r = await m.setEnabled(o.id, true);
    assert.equal(r.ok, false);
    assert.match(r.error!, /host/);
    assert.equal(bridge.starts().length, 0);
  });

  test('a refused start retries with backoff until it works', async () => {
    const { m, bridge, clock } = setup();
    const o = m.add('omt');
    bridge.failNext = { success: false, error: 'libvmx busy' };
    const r = await m.setEnabled(o.id, true);
    assert.equal(r.ok, false);
    assert.equal(view(m, o.id).state, 'restarting');
    assert.equal(view(m, o.id).error, 'libvmx busy');
    await clock.advance(999);
    assert.equal(bridge.starts().length, 1, 'waits the first backoff step');
    await clock.advance(2);
    assert.equal(bridge.starts().length, 2);
    assert.equal(view(m, o.id).state, 'waiting');
  });

  test('an enabled output the native side forgot (host restart) is started again', async () => {
    const { m, bridge, clock } = setup();
    const o = m.add('ndi');
    await m.setEnabled(o.id, true);
    bridge.running.clear();
    bridge.push([]);                       // status without our output
    assert.equal(view(m, o.id).state, 'restarting');
    await clock.advance(1000);
    assert.equal(bridge.starts().length, 2);
    assert.equal(view(m, o.id).state, 'waiting');
  });

  test('SRT without a transport shows why and does not loop', async () => {
    const { m, bridge, clock } = setup();
    bridge.srtAvailable = false;
    const o = m.add('srt');
    const r = await m.setEnabled(o.id, true);
    assert.equal(r.ok, false);
    assert.match(r.error!, /libsrt/);
    assert.equal(view(m, o.id).state, 'unsupported');
    await clock.advance(120000);
    assert.equal(bridge.starts().length, 1, 'no retry storm');
  });

  test('changing settings of a running output restarts it with the new settings', async () => {
    const { m, bridge } = setup();
    const o = m.add('srt');
    await m.setEnabled(o.id, true);
    await m.update(o.id, { srt: { mode: 'caller', host: '10.0.0.2', port: 9200, latencyMs: 400 } });
    const last = bridge.starts().at(-1)!.args;
    assert.deepEqual([last.srt.mode, last.srt.host, last.srt.port, last.srt.latencyMs], ['caller', '10.0.0.2', 9200, 400]);
  });

  test('outside the Windows app nothing is sent and the view says why', async () => {
    const { m, bridge } = setup();
    bridge.native = false;
    const o = m.add('ndi');
    const r = await m.setEnabled(o.id, true);
    assert.equal(r.ok, false);
    assert.equal(bridge.starts().length, 0);
    assert.equal(view(m, o.id).state, 'unsupported');
  });

  test('format changes are clamped and restart running outputs', async () => {
    const { m, bridge } = setup();
    const o = m.add('ndi'); await m.setEnabled(o.id, true);
    m.setFormat({ fps: 17, bitrateKbps: 10, width: 99999 });
    assert.deepEqual(m.getFormat(), { width: 3840, height: 1080, fps: 30, bitrateKbps: 500 });
    await flush();
    assert.equal(bridge.starts().length, 2);
  });

  test('removing an output stops it and drops it from storage', async () => {
    const { m, bridge, storage } = setup();
    const o = m.add('ndi'); await m.setEnabled(o.id, true);
    await m.remove(o.id);
    assert.ok(bridge.calls.some(c => c.cmd === 'program_out_stop'));
    assert.ok(!storage.getItem(OUTPUTS_KEY)!.includes(o.id));
    assert.equal(m.getViews().length, 0);
  });
});

// ── SRT inputs ───────────────────────────────────────────────────────────────
describe('SRT inputs', () => {
  test('srt: ids are native live inputs (put on any layer like NDI/OMT)', () => {
    assert.ok(isNativeLiveInput('srt:listen:9000'));
    assert.ok(isNativeLiveInput('srt:call:10.0.0.4:9000'));
    assert.ok(isNativeLiveInput('ndi:CAM (1)') && isNativeLiveInput('omt:x'));
    assert.ok(!isNativeLiveInput('switcher:pgm') && !isNativeLiveInput(null));
  });

  function supervisor() {
    const calls: any[] = [];
    let stats: any = null;
    const bridge: DiscoveryBridge = {
      hasNative: () => true, scanNdi: async () => [], scanOmt: async () => [], ndiStatus: async () => null,
      srtTransport: async () => ({ hostAnswered: true, transportAvailable: true }),
      srtListen: async a => { calls.push(['listen', a]); return { success: true }; },
      srtCall: async a => { calls.push(['call', a]); return { success: true }; },
      srtStop: async () => true,
      srtStats: async () => stats,
    };
    const clock = new FakeClock();
    let sources: any[] = [];
    const sup = new SrtSupervisor(bridge, clock, new FakeStorage(), { setSources: l => { sources = l; }, setStatus: () => {}, emit: () => {} }, 5000);
    return { sup, calls, setStats: (s: any) => { stats = s; }, clock, sources: () => sources };
  }

  test('latency and passphrase reach the native listener; passphrase kept for reconnects', async () => {
    const { sup, calls } = supervisor();
    const e = sup.remember({ mode: 'listener', port: 9300, latencyMs: 500, autoStart: true, passphrase: 'listenpass123' });
    assert.equal(e.needsPassphrase, true);
    assert.ok(sup.hasPassphrase(e.id));
    sup.start(); await flush(); await flush();
    assert.deepEqual(calls[0], ['listen', { streamId: 'srt:listen:9300', name: 'SRT listener :9300', port: 9300, latencyMs: 500, passphrase: 'listenpass123' }]);
  });

  test('encrypted endpoint without a passphrase waits; startNow with one opens it', async () => {
    const { sup, calls, sources } = supervisor();
    const e = sup.remember({ mode: 'caller', host: '10.0.0.7', port: 9400, needsPassphrase: true, autoStart: true });
    sup.start(); await flush(); await flush();
    assert.equal(calls.length, 0);
    assert.equal(sup.linkState(e.id), 'needs-passphrase');
    await sup.startNow(e.id, 'callerpass123');
    assert.equal(calls[0][0], 'call');
    assert.equal(calls[0][1].passphrase, 'callerpass123');
    assert.equal(calls[0][1].host, '10.0.0.7');
    assert.ok(sources().length === 1);
  });

  test('native stats with connected + decoder format mark the input online with its real format', async () => {
    const { sup, setStats, sources, clock } = supervisor();
    const e = sup.remember({ mode: 'listener', port: 9500, autoStart: true });
    sup.start(); await flush(); await flush();
    assert.equal(sup.linkState(e.id), 'listening');
    assert.equal(sources()[0].online, false);
    assert.deepEqual(sources()[0].formats, [], 'no format claimed before an encoder connects');
    setStats({ connected: true, status: 'Connected - receiving', width: 1920, height: 1080, fps: 29.97, bitrateMbps: 5.2 });
    await clock.advance(5000); await flush();
    assert.equal(sup.linkState(e.id), 'connected');
    assert.equal(sources()[0].online, true);
    assert.deepEqual(sources()[0].formats, [{ width: 1920, height: 1080, fps: 29.97, interlaced: false }]);
    setStats({ connected: false, status: 'Listening again', error: 'The SRT stream ended; waiting for it again.' });
    await clock.advance(5000); await flush();
    assert.equal(sup.linkState(e.id), 'listening');
    assert.equal(sources()[0].online, false);
  });
});

// ── feeder helpers ───────────────────────────────────────────────────────────
describe('program frame feeder helpers', () => {
  test('slot ring matches the native hub (3 slots, round robin)', () => {
    assert.equal(FEED_SLOTS, 3);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(nextSlot), [0, 1, 2, 0, 1, 2]);
  });
  test('audio: planar float → 48 kHz stereo s16, mono duplicated, 44.1 kHz resampled', () => {
    const s = toS16Stereo48k([new Float32Array([0, 0.5, -1, 1])], 48000);
    assert.deepEqual([...s], [0, 0, 16384, 16384, -32767, -32767, 32767, 32767]);
    const r = toS16Stereo48k([new Float32Array(441), new Float32Array(441)], 44100);
    assert.equal(r.length, 480 * 2);
  });
});
