import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { attachBmRelay, RELAY_PATH } from '../../../services/bmRelayServer.ts';
import { Bridge, type AtemLike } from '../src/bridge.ts';
import { RelayLink } from '../src/relayLink.ts';
import { BridgeClient, type WsLike } from '../../../services/mediaEngine/blackmagic/bridgeClient.ts';
import { roomIdFor } from '../../../services/mediaEngine/blackmagic/auth.ts';
import type { AtemSnapshot } from '../../../services/mediaEngine/blackmagic/protocol.ts';

const SNAP: AtemSnapshot = { deviceId: 'atem:1.2.3.4', model: 'ATEM Mini', inputs: [], macros: [], me: [{ program: 1, preview: 2, inTransition: false, position: 0, style: 'mix', ftbBlack: false }] };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(10); } }

async function rig(token = 'phone-token') {
  const server = http.createServer();
  const relay = attachBmRelay(server);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `ws://127.0.0.1:${(server.address() as any).port}${RELAY_PATH}`;
  const calls: string[] = [];
  const atem: AtemLike = {
    async connect() {}, async close() {}, snapshot: () => SNAP,
    async cut() { calls.push('cut'); }, async auto() {}, async program(i) { calls.push('pgm' + i); }, async preview() {}, async ftb() {}, async style() {}, async macro() {}, async aux() {},
  };
  const bridge = new Bridge({ makeAtem: () => atem, makeCamera: () => { throw new Error('x'); } }, { token, port: 0, host: '127.0.0.1' });
  bridge.upsertDevice({ id: 'atem:1.2.3.4', kind: 'atem', name: 'ATEM', host: '1.2.3.4', origin: 'manual', link: 'discovered', lastSeen: 0 });
  await sleep(20);
  const link = new RelayLink(bridge, base, token);
  await link.start();
  await until(() => link.state === 'up');
  const close = async () => { link.stop(); relay.close(); server.closeAllConnections?.(); server.close(); };
  return { base, bridge, link, relay, calls, close };
}
const phone = (base: string, token: string) => new BridgeClient({ url: base, token }, { makeSocket: u => new WebSocket(u) as unknown as WsLike });

test('a phone pairs through the relay and drives the ATEM; the token never reaches the relay', async () => {
  const r = await rig();
  const seenByRelay: string[] = [];
  r.relay.wss.on('connection', (ws: WebSocket) => ws.on('message', (m: unknown) => seenByRelay.push(String(m))));
  const c = phone(r.base, 'phone-token');
  const events: any[] = [];
  c.onEvent(e => events.push(e));
  c.connect();
  await until(() => c.state === 'ready');
  await until(() => events.some(e => e.evt === 'atem'));
  await c.request({ op: 'atem.program', id: 'atem:1.2.3.4', input: 3 });
  await c.request({ op: 'atem.cut', id: 'atem:1.2.3.4' });
  assert.deepEqual(r.calls, ['pgm3', 'cut']);
  assert.equal(seenByRelay.some(m => m.includes('phone-token')), false);
  c.disconnect(); await r.close();
});

test('the wrong token gets the relay room of a different bridge: nothing answers, and nothing is controlled', async () => {
  const r = await rig();
  const c = phone(r.base, 'not-the-token');
  c.connect();
  await until(() => c.state === 'waiting-bridge');
  await sleep(150);
  assert.equal(c.state, 'waiting-bridge');
  assert.deepEqual(r.calls, []);
  c.disconnect(); await r.close();
});

test('knowing the room id is not enough: a client with the room but a bad proof is rejected by the bridge', async () => {
  const r = await rig();
  const room = await roomIdFor('phone-token');
  const ws = new WebSocket(`${r.base}?room=${room}&role=app`);
  const msgs: any[] = [];
  ws.on('message', m => msgs.push(JSON.parse(String(m))));
  await new Promise(res => ws.on('open', res));
  await until(() => msgs.some(m => m.m && JSON.parse(m.m).evt === 'hello'));
  ws.send(JSON.stringify({ rid: 1, op: 'hello', proof: 'f'.repeat(64), client: 'x' }));
  ws.send(JSON.stringify({ rid: 2, op: 'atem.cut', id: 'atem:1.2.3.4' }));
  await sleep(200);
  assert.deepEqual(r.calls, []);
  ws.close(); await r.close();
});

test('the relay refuses malformed rooms, foreign origins, and a fifth app in a room', async () => {
  const r = await rig();
  const room = await roomIdFor('phone-token');
  await assert.rejects(new Promise((_, rej) => { const w = new WebSocket(`${r.base}?room=short&role=app`); w.on('error', rej); w.on('open', () => rej(new Error('opened'))); }));
  await assert.rejects(new Promise((_, rej) => { const w = new WebSocket(`${r.base}?room=${room}&role=app`, { origin: 'https://evil.example' }); w.on('error', rej); w.on('open', () => rej(new Error('opened'))); }));
  const socks: WebSocket[] = [];
  for (let i = 0; i < 4; i++) { const w = new WebSocket(`${r.base}?room=${room}&role=app`); socks.push(w); await new Promise(res => w.on('open', res)); }
  const fifth = new WebSocket(`${r.base}?room=${room}&role=app`);
  const code = await new Promise<number>(res => fifth.on('close', c => res(c)));
  assert.equal(code, 4003);
  socks.forEach(s => s.close()); await r.close();
});

test('a bridge restart is survived: apps are told it is down, and re-pair when it returns', async () => {
  const r = await rig();
  const c = phone(r.base, 'phone-token');
  c.connect(); await until(() => c.state === 'ready');
  r.link.stop();
  await until(() => c.state === 'waiting-bridge');
  const link2 = new RelayLink(r.bridge, r.base, 'phone-token'); await link2.start();
  await until(() => c.state === 'ready');
  link2.stop(); c.disconnect(); await r.close();
});
