// Reello Live → Mux relay: protocol, auth, reconnect-reuse and teardown, with a fake Mux + encoder.
// Run: npx tsx --test tests/liveMuxRelay.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
// @ts-ignore -- ws ships no types at the repo root
import WebSocket from 'ws';
import { attachLiveMuxRelay, ffmpegArgs, MUX_RELAY_PATH } from '../services/liveMuxRelayServer';

function fakeEncoder() {
  const proc: any = new EventEmitter();
  proc.stdin = new PassThrough();
  proc.stderr = new PassThrough();
  proc.received = 0;
  proc.stdin.on('data', (b: Buffer) => { proc.received += b.length; });
  proc.kill = () => { proc.emit('exit', 0); };
  proc.stdin.on('finish', () => setTimeout(() => proc.emit('exit', 0), 5));
  return proc;
}

async function setup(docs: Record<string, any>) {
  const created: string[] = []; const deleted: string[] = []; const spawned: any[] = []; const writes: any[] = [];
  const mux = {
    video: { liveStreams: {
      create: async () => { const id = `ls${created.length + 1}`; created.push(id); return { id, stream_key: `key-${id}`, playback_ids: [{ id: `pb-${id}` }] }; },
      retrieve: async (id: string) => ({ id, stream_key: `key-${id}`, status: 'idle', playback_ids: [{ id: `pb-${id}` }] }),
      delete: async (id: string) => { deleted.push(id); },
    } },
  };
  const server = http.createServer();
  attachLiveMuxRelay(server, {
    verifyToken: async t => (t.startsWith('tok-') ? { uid: t.slice(4) } : null),
    getDoc: async (_c, id) => docs[id] ?? null,
    patchDoc: async (_c, id, f) => { writes.push({ id, ...f }); docs[id] = { ...docs[id], ...f }; return true; },
    canGoLive: async uid => uid !== 'restricted',
  }, { mux: async () => mux, spawnEncoder: (args) => { const p = fakeEncoder(); p.args = args; spawned.push(p); return p; } });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;
  const open = (streamId: string) => new WebSocket(`ws://127.0.0.1:${port}${MUX_RELAY_PATH}?streamId=${streamId}`, { headers: { origin: 'https://plajah.com' } });
  const next = (ws: any) => new Promise<any>(r => ws.once('message', (d: any) => r(JSON.parse(String(d)))));
  return { server, open, next, created, deleted, spawned, writes, docs };
}

test('ffmpegArgs targets RTMPS with H.264/AAC and 2 s GOPs', () => {
  const a = ffmpegArgs('rtmps://global-live.mux.com:443/app/KEY');
  assert.equal(a.at(-1), 'rtmps://global-live.mux.com:443/app/KEY');
  assert.ok(a.includes('libx264') && a.includes('aac') && a.includes('flv'));
  assert.equal(a[a.indexOf('-g') + 1], '60');
});

test('host is relayed: ready → bytes reach the encoder → end tears the Mux stream down', async () => {
  const t = await setup({ stream1: { ownerUid: 'host', isLive: true } });
  const ws = t.open('stream1');
  await new Promise(r => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'hello', token: 'tok-host', mime: 'video/webm' }));
  const ready = await t.next(ws);
  assert.equal(ready.type, 'ready');
  assert.equal(ready.playbackId, 'pb-ls1');
  assert.equal(t.docs.stream1.muxLive.state, 'connecting');
  assert.match(t.spawned[0].args.at(-1), /key-ls1$/);
  ws.send(Buffer.alloc(5000, 1));
  await new Promise(r => setTimeout(r, 50));
  assert.equal(t.spawned[0].received, 5000);
  ws.send(JSON.stringify({ type: 'end' }));
  await new Promise(r => ws.once('close', r));
  await new Promise(r => setTimeout(r, 50));
  assert.equal(t.docs.stream1.muxLive.state, 'ended');
  assert.deepEqual(t.deleted, ['ls1']);
  t.server.close();
});

test('a reconnect reuses the same Mux live stream (one continuous live for viewers)', async () => {
  const t = await setup({ stream2: { ownerUid: 'host', isLive: true } });
  const a = t.open('stream2');
  await new Promise(r => a.once('open', r));
  a.send(JSON.stringify({ type: 'hello', token: 'tok-host' }));
  await t.next(a);
  a.terminate();                      // network drop / Cloud Run timeout
  await new Promise(r => setTimeout(r, 50));
  assert.equal(t.docs.stream2.muxLive.state, 'reconnecting');
  const b = t.open('stream2');
  await new Promise(r => b.once('open', r));
  b.send(JSON.stringify({ type: 'hello', token: 'tok-host' }));
  const ready = await t.next(b);
  assert.equal(ready.type, 'ready');
  assert.deepEqual(t.created, ['ls1']);          // no second Mux stream
  assert.equal(t.docs.stream2.muxLive.liveStreamId, 'ls1');
  b.send(JSON.stringify({ type: 'end' }));
  await new Promise(r => b.once('close', r));
  t.server.close();
});

test('non-owners, bad tokens and restricted accounts are refused', async () => {
  const t = await setup({ stream3: { ownerUid: 'host', isLive: true }, stream4: { ownerUid: 'restricted', isLive: true }, stream5: { ownerUid: 'host', isLive: false } });
  for (const [id, token, want] of [['stream3', 'tok-stranger', 'denied'], ['stream3', 'garbage', 'denied'], ['stream4', 'tok-restricted', 'denied'], ['stream5', 'tok-host', 'denied']] as const) {
    const ws = t.open(id);
    await new Promise(r => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'hello', token }));
    const msg = await t.next(ws);
    assert.equal(msg.type, want, `${id}/${token}`);
  }
  assert.equal(t.created.length, 0);
  assert.equal(t.spawned.length, 0);
  t.server.close();
});

test('foreign origins are rejected at upgrade', async () => {
  const t = await setup({});
  const port = (t.server.address() as any).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${MUX_RELAY_PATH}?streamId=abcdef`, { headers: { origin: 'https://evil.example' } });
  const err = await new Promise<any>(r => ws.once('error', r));
  assert.match(String(err?.message), /400/);
  t.server.close();
});
