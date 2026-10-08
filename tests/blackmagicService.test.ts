import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeClient, type WsLike } from '../services/mediaEngine/blackmagic/bridgeClient';
import { BlackmagicService, type BlackmagicEngine } from '../services/mediaEngine/blackmagic/blackmagicService';
import type { BridgeEvent } from '../services/mediaEngine/blackmagic/protocol';

class FakeWs implements WsLike {
  readyState = 0; sent: any[] = [];
  onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
  constructor(public url: string, private tokenOk = true) {}
  send(d: string) {
    const m = JSON.parse(d); this.sent.push(m);
    if (m.op === 'hello') this.reply(m.rid, this.tokenOk ? { ok: true } : { ok: false, error: 'Pairing token rejected' });
    else this.reply(m.rid, { ok: true, result: m.op });
  }
  reply(rid: number, body: object) { queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ rid, ...body }) })); }
  push(e: BridgeEvent) { this.onmessage?.({ data: JSON.stringify(e) }); }
  close() { this.readyState = 3; queueMicrotask(() => this.onclose?.({})); }
  open() { this.readyState = 1; this.onopen?.({}); }
}
const tick = () => new Promise(r => setTimeout(r, 0));

function rig(tokenOk = true) {
  const sockets: FakeWs[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const svc = new BlackmagicService(cfg => new BridgeClient(cfg, {
    makeSocket: u => { const w = new FakeWs(u, tokenOk); sockets.push(w); return w; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
  }));
  const added: string[] = [];
  const engine: BlackmagicEngine = {
    getState: () => ({ switcher: { program: 'sw1', preview: 'sw2', transition: { type: 'mix', position: 0 } } }),
    subscribe: () => () => {}, setProgram() {}, setPreview() {}, setTransitionPosition() {}, setTransition() {},
    async addWhepWithId(id) { added.push(id); return { id: 'src_' + id }; },
  };
  return { svc, sockets, timers, engine, added };
}

test('pairs with the token, then reports ready', async () => {
  const { svc, sockets } = rig();
  svc.connect({ url: 'ws://127.0.0.1:8787', token: 't' });
  sockets[0].open(); await tick(); await tick();
  assert.equal(svc.getSnapshot().client, 'ready');
  assert.equal(sockets[0].sent[0].token, 't');
});

test('a wrong token is reported and never retried in a loop', async () => {
  const { svc, sockets, timers } = rig(false);
  svc.connect({ url: 'ws://x', token: 'bad' });
  sockets[0].open(); await tick(); await tick(); await tick();
  assert.equal(svc.getSnapshot().client, 'rejected');
  timers.forEach(t => t.fn());
  await tick();
  assert.equal(sockets.length, 1, 'no reconnect attempt after a rejected token');
});

test('losing the bridge retries with backoff', async () => {
  const { svc, sockets, timers } = rig();
  svc.connect({ url: 'ws://x', token: 't' });
  sockets[0].open(); await tick(); await tick();
  sockets[0].close(); await tick();
  assert.equal(svc.getSnapshot().client, 'retrying');
  assert.equal(timers.at(-1)!.ms, 1000);
  timers.at(-1)!.fn();
  assert.equal(sockets.length, 2);
});

test('streams pushed by cameras become switcher sources once, even across repeated ingest events', async () => {
  const { svc, sockets, engine, added } = rig();
  svc.attachEngine(engine);
  svc.connect({ url: 'ws://x', token: 't' });
  sockets[0].open(); await tick(); await tick();
  const ev: BridgeEvent = { evt: 'ingest', info: { available: true }, streams: [{ id: 'ingest:cam-a', path: 'cam-a', whepUrl: 'http://h/cam-a/whep', label: 'URSA A' }] };
  sockets[0].push(ev); await tick(); sockets[0].push(ev); await tick();
  assert.deepEqual(added, ['ingest:cam-a']);
  assert.equal(svc.getSnapshot().registered['ingest:cam-a'], 'src_ingest:cam-a');
});

test('a failed subscribe is surfaced and retried on the next ingest event', async () => {
  const { svc, sockets, engine } = rig();
  let fail = true;
  const real = engine.addWhepWithId;
  engine.addWhepWithId = async (...a) => { if (fail) throw new Error('WHEP 404'); return real(...a); };
  svc.attachEngine(engine);
  svc.connect({ url: 'ws://x', token: 't' });
  sockets[0].open(); await tick(); await tick();
  const ev: BridgeEvent = { evt: 'ingest', info: { available: true }, streams: [{ id: 'ingest:p', path: 'p', whepUrl: 'http://h/p/whep', label: 'P' }] };
  sockets[0].push(ev); await tick();
  assert.equal(svc.getSnapshot().ingestErrors['ingest:p'], 'WHEP 404');
  fail = false; sockets[0].push(ev); await tick();
  assert.ok(svc.getSnapshot().registered['ingest:p']);
});

test('binding an ATEM as control surface routes its state into the engine and unbinds cleanly', async () => {
  const { svc, sockets, engine } = rig();
  const calls: string[] = [];
  engine.setProgram = d => { calls.push('pgm:' + d); };
  svc.attachEngine(engine);
  svc.connect({ url: 'ws://x', token: 't' });
  sockets[0].open(); await tick(); await tick();
  svc.bindSurface('atem:1');
  sockets[0].push({ evt: 'atem', snapshot: { deviceId: 'atem:1', model: 'Mini', inputs: [], macros: [], me: [{ program: 3, preview: 1, inTransition: false, position: 0, style: 'mix', ftbBlack: false }] } });
  assert.deepEqual(calls, ['pgm:sw3']);
  svc.unbindSurface();
  sockets[0].push({ evt: 'atem', snapshot: { deviceId: 'atem:1', model: 'Mini', inputs: [], macros: [], me: [{ program: 4, preview: 1, inTransition: false, position: 0, style: 'mix', ftbBlack: false }] } });
  assert.deepEqual(calls, ['pgm:sw3']);
});
