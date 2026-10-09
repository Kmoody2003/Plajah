import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual RTC class with simulated browser media and Firestore I/O.
const compiled = ts.transpileModule(fs.readFileSync(new URL('../services/rtcCore.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function harness(capture?: Promise<any>, presence?: Promise<void>) {
  const writes: string[] = [], deletes: string[] = [], subscriptions = new Map<string, Function>(), connections: any[] = [];
  let stopped = 0, localEvents = 0;
  const stream = { getTracks: () => [{ kind: 'audio', stop: () => stopped++ }], getVideoTracks: () => [], getAudioTracks: () => [] };
  const firestore = {
    doc: (_db: unknown, ...path: string[]) => path.join('/'), collection: (_db: unknown, ...path: string[]) => path.join('/'),
    setDoc: async (path: string) => { writes.push(path); await presence; }, deleteDoc: async (path: string) => { deletes.push(path); },
    getDocs: async () => ({ docs: [] }), serverTimestamp: () => 1,
    onSnapshot: (path: string, callback: Function) => { subscriptions.set(path, callback); return () => subscriptions.delete(path); },
  };
  class Peer {
    closed = false;
    constructor() { connections.push(this); }
    addTrack() {} addTransceiver() {} getTransceivers() { return []; }
    createDataChannel() { return { close() {}, readyState: 'connecting' }; }
    close() { this.closed = true; }
  }
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, navigator: { mediaDevices: { getUserMedia: () => capture || Promise.resolve(stream) } }, RTCPeerConnection: Peer,
    require: (name: string) => {
      if (name === './backendService') return { db: {}, auth: { currentUser: { uid: 'host' } } };
      if (name === 'firebase/firestore') return firestore;
      if (name === './iceConfig') return { getIceServers: () => [], resolveIceServers: async () => [] };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const left: string[] = [];
  const session = new module.exports.RtcSession({ collectionName: 'chat_rooms/test/meeting_rtc', sessionId: 'main', role: 'participant', topology: 'mesh', media: { audio: true, video: false } }, { onLocalStream: () => localEvents++, onPeerLeft: (id: string) => left.push(id) });
  return { session, stream, writes, deletes, subscriptions, connections, left, stopped: () => stopped, localEvents: () => localEvents };
}
test('leaving during camera permission never publishes presence or leaks captured media', async () => {
  const media = deferred<any>(); const h = harness(media.promise);
  const joining = h.session.join(); await h.session.leave(); media.resolve(h.stream); await joining;
  assert.equal(h.stopped(), 1); assert.equal(h.localEvents(), 0); assert.deepEqual(h.writes, []); assert.equal(h.subscriptions.size, 0);
});
test('leaving during presence write cleans up without installing stale listeners', async () => {
  const pending = deferred<void>(); const h = harness(undefined, pending.promise);
  const joining = h.session.join(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.writes.length, 1); await h.session.leave(); pending.resolve(); await joining;
  assert.equal(h.subscriptions.size, 0); assert.ok(h.deletes.includes('chat_rooms/test/meeting_rtc/main/participants/host'));
});
test('moderation disconnects existing peers and stale presence cannot reconnect them', async () => {
  const h = harness(); await h.session.join();
  const snapshot = () => ({ docs: [{ id: 'guest', data: () => ({ role: 'participant' }) }] });
  const onParticipants = h.subscriptions.get('chat_rooms/test/meeting_rtc/main/participants')!;
  onParticipants(snapshot()); assert.equal(h.connections.length, 1);
  h.session.setExcludedPeers(['guest']); assert.ok(h.connections[0].closed); assert.deepEqual(h.left, ['guest']);
  onParticipants(snapshot()); assert.equal(h.connections.length, 1);
  h.session.setExcludedPeers([]); onParticipants(snapshot()); assert.equal(h.connections.length, 2);
  await h.session.leave(); assert.ok(h.connections[1].closed); assert.equal(h.stopped(), 1);
});
test('roster removal disconnects a peer and rejects stale presence without a moderator removal', async () => {
  const h = harness(); h.session.setAllowedPeers(['host', 'guest']); await h.session.join();
  const onParticipants = h.subscriptions.get('chat_rooms/test/meeting_rtc/main/participants')!;
  const snapshot = { docs: [{ id: 'guest', data: () => ({ role: 'participant' }) }, { id: 'outsider', data: () => ({ role: 'participant' }) }] };
  onParticipants(snapshot); assert.equal(h.connections.length, 1);
  h.session.setAllowedPeers(['host']); assert.ok(h.connections[0].closed);
  onParticipants(snapshot); assert.equal(h.connections.length, 1);
  await h.session.leave();
});
