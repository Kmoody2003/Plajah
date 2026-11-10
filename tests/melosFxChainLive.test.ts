// FX chains follow edits live without re-wiring the audio graph (FxChainHost.setChain): an edit
// pushes params only to the device that changed, and the chain is rewired only when the active
// devices or their order change. Runs on a fake AudioContext that counts connects/disconnects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FxChainHost, newInstance, type FxInstance } from '../services/melos/beats/fx/devices';

let connects = 0;
const param = () => ({ value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; }, exponentialRampToValueAtTime() { return this; } });
function fakeNode(): Record<string, unknown> {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'connect') return (dst: unknown) => { connects++; return dst; };
      if (k === 'disconnect') return () => undefined;
      if (k === 'getFloatFrequencyData' || k === 'getByteFrequencyData' || k === 'getFloatTimeDomainData' || k === 'getByteTimeDomainData' || k === 'start' || k === 'stop' || k === 'setPeriodicWave') return () => undefined;
      if (k === 'then') return undefined;
      if (!(k in t)) t[k] = param();
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const ctx = new Proxy({ sampleRate: 48000, currentTime: 0 } as Record<string, unknown>, {
  get(t, k) {
    if (k in t) return t[k as string];
    if (typeof k === 'string' && k.startsWith('create')) return () => fakeNode();
    return undefined;
  },
}) as unknown as BaseAudioContext;

test('a knob edit pushes params to that device only, and never rewires the chain', () => {
  const host = new FxChainHost(ctx);
  const a = newInstance('saturator')!; const b = newInstance('delay')!;
  let chain: FxInstance[] = [a, b];
  host.setChain(chain);
  const nodeA = host.nodeOf(a.id)!; const nodeB = host.nodeOf(b.id)!;
  let pushedA = 0, pushedB = 0;
  const origA = nodeA.setParams.bind(nodeA), origB = nodeB.setParams.bind(nodeB);
  nodeA.setParams = (p) => { pushedA++; origA(p); };
  nodeB.setParams = (p) => { pushedB++; origB(p); };

  // Edit device A (FxRack replaces only that instance), then an unrelated doc edit (same array).
  const before = connects;
  chain = [{ ...a, params: { ...a.params, drive: (a.params.drive ?? 0) + 0.1 } }, b];
  host.setChain(chain);
  host.setChain(chain);
  assert.equal(pushedA, 1, 'edited device gets its params once');
  assert.equal(pushedB, 0, 'untouched device is not re-set');
  assert.equal(connects, before, 'no rewiring for a param edit');
});

test('bypass, reorder and add rewire the chain; the rebuilt device is the one wired in', () => {
  const host = new FxChainHost(ctx);
  const a = newInstance('saturator')!; const b = newInstance('delay')!;
  host.setChain([a, b]);
  let before = connects;
  host.setChain([b, a]);
  assert.ok(connects > before, 'reorder rewires');
  before = connects;
  host.setChain([b, { ...a, on: false }]);
  assert.ok(connects > before, 'bypass rewires');
  assert.equal(host.nodeOf(a.id), undefined);
  before = connects;
  host.setChain([b, a]);
  assert.ok(connects > before, 're-enabling wires the new node in');
  assert.ok(host.nodeOf(a.id));
});
