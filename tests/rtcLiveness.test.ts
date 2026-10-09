import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// rtcCore liveness mode (Live Talk): per-join nonce, rebuild on rejoin, stale-signal rejection.
const compiled = ts.transpileModule(fs.readFileSync(new URL('../services/rtcCore.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(cfg: Record<string, unknown> = {}) {
  const writes: Array<{ path: string; data: any }> = [], subs = new Map<string, Function>(), conns: any[] = [];
  const firestore = {
    doc: (_db: unknown, ...p: string[]) => p.join('/'), collection: (_db: unknown, ...p: string[]) => p.join('/'),
    setDoc: async (path: string, data: any) => { writes.push({ path, data }); },
    updateDoc: async () => {}, addDoc: async () => {}, deleteDoc: async () => {},
    getDocs: async () => ({ docs: [] }), serverTimestamp: () => 1,
    onSnapshot: (path: string, cb: Function) => { subs.set(path, cb); return () => subs.delete(path); },
  };
  class Peer {
    closed = false; remoteSet: any[] = []; signalingState = 'stable'; remoteDescription: any = null; connectionState = 'new';
    constructor() { conns.push(this); }
    addTrack() {} addTransceiver() {} getTransceivers() { return []; } getSenders() { return []; }
    createDataChannel() { return { close() {}, readyState: 'connecting' }; }
    async setRemoteDescription(d: any) { this.remoteSet.push(d); this.remoteDescription = d; }
    async setLocalDescription() {} get localDescription() { return { toJSON: () => ({ type: 'answer', sdp: 'x' }) }; }
    async addIceCandidate() {}
    restartIce() {}
    close() { this.closed = true; }
  }
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, setInterval, clearInterval, setTimeout, clearTimeout,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [], getAudioTracks: () => [] }) } },
    RTCPeerConnection: Peer, Date, Math, JSON, Promise, Map, Set,
    require: (name: string) => {
      if (name === './backendService') return { db: {}, auth: { currentUser: { uid: 'me' } } };
      if (name === 'firebase/firestore') return firestore;
      if (name === './iceConfig') return { getIceServers: () => [], resolveIceServers: async () => [] };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const session = new module.exports.RtcSession({ sessionId: 'talk_x', role: 'viewer', topology: 'stage', liveness: true, ...cfg });
  return { session, writes, subs, conns };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('liveness: participant doc carries a nonce; a rejoin (new nonce) rebuilds the peer', async () => {
  const h = harness(); await h.session.join();
  const presence = h.writes.find(w => w.path.endsWith('participants/me'))!;
  assert.equal(typeof presence.data.nonce, 'string');
  const onP = h.subs.get('rtc_sessions/talk_x/participants')!;
  const snap = (nonce: string) => ({ docs: [
    { id: 'me', data: () => ({ role: 'viewer', nonce: h.session.nonce }) },
    { id: 'spk', data: () => ({ role: 'participant', nonce }) },
  ] });
  onP(snap('A')); assert.equal(h.conns.length, 1);
  onP(snap('A')); assert.equal(h.conns.length, 1, 'same join → same connection');
  onP(snap('B')); assert.equal(h.conns.length, 2); assert.ok(h.conns[0].closed, 'old join torn down');
  await h.session.leave();
});

test('liveness: offers from a previous join (wrong nonce) are ignored; fresh ones applied', async () => {
  const h = harness(); await h.session.join();
  h.subs.get('rtc_sessions/talk_x/participants')!({ docs: [{ id: 'spk', data: () => ({ role: 'participant', nonce: 'B' }) }] });
  const edge = h.subs.get('rtc_sessions/talk_x/signals/spk__me')!;
  await edge({ data: () => ({ description: { type: 'offer', sdp: 'old' }, nonce: 'A', to: 'zzz' }) }); await tick();
  assert.equal(h.conns[0].remoteSet.length, 0);
  await edge({ data: () => ({ description: { type: 'offer', sdp: 'new' }, nonce: 'B', to: h.session.nonce }) }); await tick();
  assert.equal(h.conns[0].remoteSet.length, 1);
  // A stray answer while stable is ignored instead of throwing "signaling failed".
  await edge({ data: () => ({ description: { type: 'answer', sdp: 'late' }, nonce: 'B', to: h.session.nonce }) }); await tick();
  assert.equal(h.conns[0].remoteSet.length, 1);
  await h.session.leave();
});

test('allow-list widening connects already-present peers without waiting for a snapshot', async () => {
  const h = harness({ liveness: false }); h.session.setAllowedPeers([]); await h.session.join();
  h.subs.get('rtc_sessions/talk_x/participants')!({ docs: [{ id: 'spk', data: () => ({ role: 'participant' }) }] });
  assert.equal(h.conns.length, 0);
  h.session.setAllowedPeers(['spk']);
  assert.equal(h.conns.length, 1);
  await h.session.leave();
});

test('leave is idempotent', async () => {
  const h = harness(); await h.session.join();
  const a = h.session.leave(), b = h.session.leave();
  assert.equal(a, b); await a;
});
