import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { Bridge, type AtemLike } from '../src/bridge.ts';
import { CameraLink } from '../src/cameraLink.ts';
import { buildStreams } from '../src/ingest.ts';
import { deviceFromService, pickIPv4 } from '../src/discovery.ts';
import { hmacHex } from '../../../services/mediaEngine/blackmagic/auth.ts';
import { classifyBlackmagic, deviceId, type AtemSnapshot } from '../../../services/mediaEngine/blackmagic/protocol.ts';

const SNAP: AtemSnapshot = { deviceId: 'atem:10.0.0.9', model: 'ATEM Mini', inputs: [], macros: [], me: [{ program: 1, preview: 2, inTransition: false, position: 0, style: 'mix', ftbBlack: false }] };

function fakeAtem(calls: string[], ev: any): AtemLike {
  return {
    async connect() { ev.link('connected'); ev.snapshot(SNAP); }, async close() {}, snapshot: () => SNAP,
    async cut() { calls.push('cut'); }, async auto() { calls.push('auto'); },
    async program(i) { calls.push(`pgm${i}`); }, async preview(i) { calls.push(`pvw${i}`); },
    async ftb() {}, async style() {}, async macro() {}, async aux() {},
  };
}

async function start(calls: string[] = []) {
  const bridge = new Bridge({ makeAtem: (_i, _h, ev) => fakeAtem(calls, ev), makeCamera: () => { throw new Error('unused'); } }, { token: 'secret', port: 0, host: '127.0.0.1' });
  const port = await bridge.listen();
  return { bridge, port };
}
function client(port: number, origin?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  const inbox: any[] = [];
  ws.on('message', m => inbox.push(JSON.parse(String(m))));
  const next = (pred: (m: any) => boolean) => new Promise<any>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), 2000);
    const poll = () => { const i = inbox.findIndex(pred); if (i >= 0) { clearTimeout(t); res(inbox.splice(i, 1)[0]); } else setTimeout(poll, 5); };
    poll();
  });
  let rid = 0;
  const call = async (body: any) => { const id = ++rid; ws.send(JSON.stringify({ rid: id, ...body })); return next(m => m.rid === id); };
  const pair = async (token: string) => { const h = await next(m => m.evt === 'hello'); return call({ op: 'hello', proof: await hmacHex(token, h.nonce), client: 't' }); };
  return { ws, call, next, pair, open: new Promise<void>((res, rej) => { ws.on('open', res); ws.on('error', rej); }) };
}

test('an unpaired client cannot drive anything; a paired one can', async () => {
  const calls: string[] = [];
  const { bridge, port } = await start(calls);
  bridge.upsertDevice({ id: deviceId('atem', '10.0.0.9'), kind: 'atem', name: 'ATEM', host: '10.0.0.9', origin: 'manual', link: 'discovered', lastSeen: 0 });
  await new Promise(r => setTimeout(r, 20));
  const c = client(port); await c.open;
  assert.equal((await c.call({ op: 'atem.cut', id: 'atem:10.0.0.9' })).ok, false);
  assert.equal(calls.length, 0);
  assert.equal((await c.pair('wrong')).ok, false);
  c.ws.close();
  const d = client(port); await d.open;
  assert.equal((await d.pair('secret')).ok, true);
  const snap = await d.next(m => m.evt === 'atem');
  assert.equal(snap.snapshot.model, 'ATEM Mini');
  assert.equal((await d.call({ op: 'atem.program', id: 'atem:10.0.0.9', input: 3 })).ok, true);
  assert.equal((await d.call({ op: 'atem.cut', id: 'atem:10.0.0.9' })).ok, true);
  assert.deepEqual(calls, ['pgm3', 'cut']);
  d.ws.close(); await bridge.close();
});

test('a web page from a foreign origin is refused even with the right token', async () => {
  const { bridge, port } = await start();
  const evil = client(port, 'https://evil.example');
  await assert.rejects(evil.open);
  const ok = client(port, 'https://plajah.com'); await ok.open; ok.ws.close();
  await bridge.close();
});

test('device.add validates the host and a bad id fails cleanly', async () => {
  const { bridge, port } = await start();
  const c = client(port); await c.open; await c.pair('secret');
  assert.equal((await c.call({ op: 'device.add', host: 'a b;rm -rf' })).ok, false);
  assert.equal((await c.call({ op: 'atem.cut', id: 'nope' })).ok, false);
  c.ws.close(); await bridge.close();
});

test('camera link speaks the REST/WS protocol: subscribes to what the camera lists and tracks changes', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'PUT' && req.url === '/control/api/v1/transports/0/record') { puts.push('rec'); res.writeHead(204).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: req.url }));
  });
  const puts: string[] = [];
  const wss = new WebSocketServer({ server, path: '/control/api/v1/event/websocket' });
  const seen: any[] = [];
  wss.on('connection', ws => ws.on('message', m => {
    const req = JSON.parse(String(m)); seen.push(req.data);
    if (req.data.action === 'listProperties') ws.send(JSON.stringify({ type: 'response', data: { action: 'listProperties', properties: ['/video/iso', '/transports/0/record'] } }));
    if (req.data.action === 'subscribe') {
      ws.send(JSON.stringify({ type: 'response', data: { action: 'subscribe', values: { '/video/iso': { iso: 800 } } } }));
      ws.send(JSON.stringify({ type: 'event', data: { action: 'propertyValueChanged', property: '/transports/0/record', value: { recording: true } } }));
    }
  }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  const snaps: any[] = [];
  const cam = new CameraLink('camera:x', `127.0.0.1:${port}`, { snapshot: s => snaps.push(s), link: () => {} });
  await cam.connect();
  await new Promise(r => setTimeout(r, 250));
  const last = snaps.at(-1);
  assert.deepEqual(last.available, ['/video/iso', '/transports/0/record']);
  assert.equal(last.recording, true);
  assert.deepEqual(last.props['/video/iso'], { iso: 800 });
  assert.deepEqual(seen.find(d => d.action === 'subscribe').properties, ['/video/iso', '/transports/0/record']);
  assert.deepEqual(await cam.get('/system'), { ok: '/control/api/v1/system' });
  await cam.record(true); assert.deepEqual(puts, ['rec']);
  await assert.rejects(cam.get('/../etc'));
  cam.close(); wss.close(); server.close();
});

test('ingest: a pushed stream becomes a WHEP source labelled with the camera that sent it', () => {
  const devices = [{ id: 'camera:10.0.0.20', kind: 'camera' as const, name: 'URSA Cine A', host: '10.0.0.20', origin: 'mdns' as const, link: 'connected' as const, lastSeen: 0 }];
  const s = buildStreams(
    [{ name: 'cam-a', ready: true, source: { type: 'rtmpConn' } }, { name: 'idle', ready: false }],
    [{ path: 'cam-a', remoteAddr: '10.0.0.20:51234' }], devices, { publicHost: '10.0.0.5' });
  assert.equal(s.length, 1);
  assert.equal(s[0].whepUrl, 'http://10.0.0.5:8889/cam-a/whep');
  assert.equal(s[0].label, 'URSA Cine A');
  assert.equal(s[0].deviceId, 'camera:10.0.0.20');
});

test('mDNS records are classified, link-local addresses are deprioritised, unrelated http services ignored', () => {
  assert.equal(classifyBlackmagic('ATEM Mini Extreme ISO').kind, 'atem');
  assert.equal(classifyBlackmagic('URSA Cine 12K').kind, 'camera');
  assert.equal(classifyBlackmagic('HyperDeck Studio').kind, 'hyperdeck');
  assert.equal(pickIPv4(['fe80::1', '169.254.1.1', '192.168.1.8']), '192.168.1.8');
  assert.equal(deviceFromService({ name: 'Brother Printer', addresses: ['192.168.1.4'] }, 'http'), null);
  const d = deviceFromService({ name: 'URSA Cine 12K', addresses: ['192.168.1.30'], port: 80 }, 'http');
  assert.equal(d?.kind, 'camera');
  assert.equal(d?.id, 'camera:192.168.1.30');
});
