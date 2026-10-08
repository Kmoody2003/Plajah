import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceSync, type SurfaceEngine, type SurfaceEngineState } from '../../../services/mediaEngine/blackmagic/surfaceSync.ts';
import type { AtemSnapshot, BridgeRequest } from '../../../services/mediaEngine/blackmagic/protocol.ts';

function fakeEngine() {
  let state: SurfaceEngineState = { switcher: { program: 'sw1', preview: 'sw2', transition: { type: 'mix', position: 0 } } };
  const subs = new Set<(s: SurfaceEngineState) => void>();
  const set = (patch: Partial<SurfaceEngineState['switcher']>) => { state = { switcher: { ...state.switcher, ...patch } }; subs.forEach(f => f(state)); };
  const eng: SurfaceEngine & { calls: string[]; set: typeof set } = {
    calls: [], set,
    getState: () => state,
    subscribe: cb => { subs.add(cb); return () => subs.delete(cb); },
    setProgram(d) { this.calls.push(`pgm:${d}`); set({ program: d }); },
    setPreview(d) { this.calls.push(`pvw:${d}`); set({ preview: d }); },
    setTransitionPosition(p) { this.calls.push(`pos:${p}`); set({ transition: { ...state.switcher.transition, position: p } }); },
    setTransition(t) { this.calls.push(`type:${t}`); set({ transition: { ...state.switcher.transition, type: t } }); },
  };
  return eng;
}
const snap = (over: Partial<AtemSnapshot['me'][0]> = {}): AtemSnapshot => ({
  deviceId: 'atem:1', model: 'ATEM Mini', inputs: [], macros: [],
  me: [{ program: 1, preview: 2, inTransition: false, position: 0, style: 'mix', ftbBlack: false, ...over }],
});
function setup(mode?: any) {
  const eng = fakeEngine();
  const sent: BridgeRequest[] = [];
  const timers: Array<() => void> = [];
  const sync = new SurfaceSync(eng, { send: async r => { sent.push(r); } }, {
    deviceId: 'atem:1', mode, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
  });
  sync.start();
  return { eng, sent, sync, timers };
}

test('an ATEM panel press moves Plajah and does not echo back', () => {
  const { eng, sent, sync } = setup();
  sync.onAtem(snap({ program: 3, preview: 4 }));
  assert.deepEqual(eng.calls, ['pgm:sw3', 'pvw:sw4']);
  assert.equal(sent.length, 0, 'no feedback loop');
});

test('a Plajah take is pushed to the ATEM once', () => {
  const { eng, sent, sync } = setup();
  sync.onAtem(snap());
  eng.set({ program: 'sw2', preview: 'sw1' });
  assert.deepEqual(sent.map(r => r.op), ['atem.program', 'atem.preview']);
  eng.set({ program: 'sw2' }); // unchanged -> nothing more
  assert.equal(sent.length, 2);
});

test('atem-leads never writes to the ATEM; plajah-leads never reads from it', () => {
  const a = setup('atem-leads');
  a.sync.onAtem(snap());
  a.eng.set({ program: 'sw3' });
  assert.equal(a.sent.length, 0);
  const b = setup('plajah-leads');
  b.sync.onAtem(snap({ program: 4 }));
  assert.equal(b.eng.calls.length, 0);
});

test('a Plajah AUTO becomes an ATEM AUTO and the mid-fade swap is not hard-cut onto the ATEM', async () => {
  const { eng, sent, sync } = setup();
  sync.onAtem(snap());
  eng.set({ transition: { type: 'mix', position: 0.2 } });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(sent.map(r => r.op), ['atem.program', 'atem.preview', 'atem.auto']);
  const n = sent.length;
  eng.set({ program: 'sw2', preview: 'sw1', transition: { type: 'mix', position: 0 } }); // engine finishes
  assert.equal(sent.length, n, 'no program/preview writes while the ATEM auto runs');
  sync.onAtem(snap({ inTransition: true, position: 0.5 }));
  sync.onAtem(snap({ program: 2, preview: 1, inTransition: false }));
  eng.set({ program: 'sw1' });
  assert.equal(sent.at(-1)?.op, 'atem.program', 'normal mirroring resumes once the ATEM finishes');
});

test('ATEM T-bar drives the engine transition position and the end resets it', () => {
  const { eng, sync } = setup();
  sync.onAtem(snap({ inTransition: true, position: 0.4 }));
  assert.ok(eng.calls.includes('pos:0.4'));
  sync.onAtem(snap({ program: 2, preview: 1, inTransition: false }));
  assert.ok(eng.calls.includes('pos:0'));
  assert.equal(eng.getState().switcher.program, 'sw2');
});

test('unmapped ATEM inputs (black, bars, media) are ignored, custom maps are honoured', () => {
  const { eng, sync } = setup();
  sync.onAtem(snap({ program: 1000 }));
  assert.equal(eng.calls.length, 0);
  sync.setInputMap({ 7: 'sw3' });
  sync.onAtem(snap({ program: 7, preview: 2 }));
  assert.ok(eng.calls.includes('pgm:sw3'));
});

test('snapshots from another device are ignored', () => {
  const { eng, sync } = setup();
  sync.onAtem({ ...snap({ program: 3 }), deviceId: 'atem:other' });
  assert.equal(eng.calls.length, 0);
});

test('an AUTO that the ATEM never confirms releases itself after the timeout', async () => {
  const { eng, sent, sync, timers } = setup();
  sync.onAtem(snap());
  eng.set({ transition: { type: 'mix', position: 0.1 } });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  timers.at(-1)!();
  eng.set({ program: 'sw3', transition: { type: 'mix', position: 0 } });
  assert.equal(sent.at(-1)?.op, 'atem.program');
});
