import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatProduction } from '../services/chatProduction';
import { getAppOutputStream } from '../services/mediaEngine/bridge';

test('production revokes moderator media, respects call mute, and never stops call tracks', () => {
  let stopped = 0, connected = 0, disconnected = 0;
  const track = { kind: 'audio', enabled: true, stop: () => { stopped++; } };
  class Stream {
    constructor(private tracks: any[] = []) {}
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    addTrack(t: any) { this.tracks.push(t); }
  }
  class Audio {
    createMediaStreamDestination() { return { stream: new Stream([{ kind: 'audio', stop() {} }]) }; }
    createMediaStreamSource() { return { connect() { connected++; }, disconnect() { disconnected++; } }; }
    async resume() {} async close() {}
  }
  const fakeContext = { fillStyle: '', font: '', fillRect() {}, fillText() {}, drawImage() {} };
  const originals = Object.fromEntries(['AudioContext', 'MediaStream', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, (globalThis as any)[key]]));
  Object.assign(globalThis, {
    AudioContext: Audio, MediaStream: Stream,
    document: { createElement: (tag: string) => tag === 'canvas' ? { width: 0, height: 0, getContext: () => fakeContext, captureStream: () => new Stream([{ kind: 'video', stop() {} }]) } : { srcObject: null, readyState: 0, play: async () => {} } },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });
  let production: ChatProduction | undefined;
  try {
    production = new ChatProduction('lifecycle', 'Interview');
    const participant = { id: 'guest', name: 'Guest', stream: new Stream([track]) as unknown as MediaStream, moderator: false, allowed: true };
    production.update([participant]);
    const routed = getAppOutputStream('chat:lifecycle:guest');
    assert.ok(routed);
    assert.equal(routed.getAudioTracks()[0], track);
    track.enabled = false;
    assert.equal(routed.getAudioTracks()[0].enabled, false, 'muting the call must mute the production feed');
    production.update([participant]);
    assert.equal(connected, 1, 'unchanged feeds cannot duplicate mixer connections');
    assert.equal(production.show().slides.length, 2);
    production.update([{ ...participant, moderator: true }]);
    assert.equal(getAppOutputStream('chat:lifecycle:guest'), null);
    assert.equal(production.show().slides.length, 1);
    assert.equal(disconnected, 1);
    assert.equal(stopped, 0);
    production.dispose();
    assert.equal(getAppOutputStream('chat:lifecycle:group'), null);
    assert.equal(stopped, 0);
  } finally {
    production?.dispose();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value;
    }
  }
});
