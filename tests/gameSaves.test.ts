import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveHost, SAVE_MAX_BYTES, type CloudSaveDoc, type SaveStore, type StoreOutcome } from '../services/gameSaveCore';
import { CloudSave, type Transport } from '../packages/first-party-games/cloudSave';
import { attachCloud, mergeGarageJson, progressScore } from '../games/forth-horizon/src/garage/cloud';
import { Garage, type StorageLike } from '../games/forth-horizon/src/garage/progress';

/** an in-memory stand-in for the Firestore layer with the same optimistic-concurrency rule */
class MemStore implements SaveStore {
  docs = new Map<string, CloudSaveDoc>();
  async load(uid: string, g: string): Promise<CloudSaveDoc | null> { return this.docs.get(uid + '_' + g) ?? null; }
  async store(uid: string, g: string, baseRev: number, data: string): Promise<StoreOutcome> {
    const k = uid + '_' + g, cur = this.docs.get(k);
    if ((cur?.rev ?? 0) !== baseRev) return { ok: false, conflict: true, doc: cur ?? null };
    const d = { rev: baseRev + 1, data, updatedAt: 1 }; this.docs.set(k, d); return { ok: true, doc: d };
  }
}
/** game <-> host, wired together in memory */
function link(store: SaveStore, uid: string | null, gameId = 'apex-elohim', clock?: { t: number }): Transport {
  const host = uid ? new SaveHost(store, uid, gameId, 'test', () => clock?.t ?? Date.now()) : null;
  let cb: (m: unknown) => void = () => undefined;
  return {
    post: (m) => {
      void (async () => {
        if (!host) { if ((m as { type: string }).type === 'plajah.save.hello') cb({ type: 'plajah.save.hello.result', available: false }); return; }
        const r = await host.handle(m); if (r) cb(r);
      })();
    },
    listen: (f) => { cb = f; return () => undefined; },
  };
}
const mem = (): StorageLike => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };
type Any = Record<string, unknown>;

test('host: load and store with revisions, and a stale device gets the newer save back', async () => {
  const st = new MemStore(), h = new SaveHost(st, 'u1', 'apex-elohim', 'web', () => 1_000_000);
  const r0 = await h.handle({ type: 'plajah.save.load', gameId: 'apex-elohim', reqId: 'a' }) as Any;
  assert.equal(r0.ok, true); assert.equal(r0.rev, 0); assert.equal(r0.data, null);
  const s1 = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'b', baseRev: 0, data: '{"n":1}' }) as Any;
  assert.equal(s1.ok, true); assert.equal(s1.rev, 1);
  const h2 = new SaveHost(st, 'u1', 'apex-elohim', 'phone', () => 2_000_000);       // another device that still thinks there is no save
  const s2 = await h2.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'c', baseRev: 0, data: '{"n":2}' }) as Any;
  assert.equal(s2.ok, false); assert.equal(s2.conflict, true); assert.equal(s2.rev, 1); assert.equal(s2.data, '{"n":1}');
});

test('host: wrong game, bad data, oversize, and saving too fast are refused', async () => {
  const st = new MemStore(); let t = 1_000_000;
  const h = new SaveHost(st, 'u1', 'apex-elohim', 'web', () => t);
  assert.equal(await h.handle({ type: 'plajah.save.load', gameId: 'someone-elses', reqId: 'a' }), null, 'a game cannot reach another game\'s save');
  assert.equal(await h.handle({ type: 'plajah.xp', gameId: 'apex-elohim' }), null);
  const bad = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'b', baseRev: 0, data: 'not json' }) as Any; assert.equal(bad.ok, false);
  const big = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'c', baseRev: 0, data: JSON.stringify({ x: 'y'.repeat(SAVE_MAX_BYTES) }) }) as Any; assert.equal(big.ok, false);
  const neg = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'd', baseRev: -1, data: '{}' }) as Any; assert.equal(neg.ok, false);
  const ok = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'e', baseRev: 0, data: '{}' }) as Any; assert.equal(ok.ok, true);
  const fast = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'f', baseRev: 1, data: '{}' }) as Any; assert.equal(fast.ok, false, 'faster than every 2 s');
  t += 3000;
  const later = await h.handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'g', baseRev: 1, data: '{}' }) as Any; assert.equal(later.ok, true);
});

test('host: a player only ever touches their own save', async () => {
  const st = new MemStore();
  await new SaveHost(st, 'alice', 'apex-elohim').handle({ type: 'plajah.save.store', gameId: 'apex-elohim', reqId: 'a', baseRev: 0, data: '{"who":"alice"}' });
  const bob = await new SaveHost(st, 'bob', 'apex-elohim').handle({ type: 'plajah.save.load', gameId: 'apex-elohim', reqId: 'b' }) as Any;
  assert.equal(bob.data, null);
});

test('client: a guest or a standalone page has no cloud and the game carries on', async () => {
  const guest = new CloudSave('apex-elohim', link(new MemStore(), null), 200);
  assert.equal(await guest.available(), false);
  const r = await guest.sync('{"v":1}', (l) => ({ json: l!, source: 'local' }));
  assert.deepEqual(r, { json: '{"v":1}', source: 'none', available: false });
  const alone = new CloudSave('apex-elohim', null);
  assert.equal(await alone.available(), false); assert.equal(await alone.load(), null);
});

test('client: first device uploads, second device downloads, and they stay in step', async () => {
  const st = new MemStore(), clock = { t: 1_000_000 };
  const pick = (l: string | null, c: string) => ({ json: (JSON.parse(l ?? '{"n":-1}').n > JSON.parse(c).n ? l! : c), source: 'merged' as const });
  const a = new CloudSave('apex-elohim', link(st, 'u1', 'apex-elohim', clock), 500);
  const ra = await a.sync('{"n":5}', pick);
  assert.equal(ra.json, '{"n":5}'); assert.equal(a.rev, 1);
  const b = new CloudSave('apex-elohim', link(st, 'u1', 'apex-elohim', clock), 500);
  const rb = await b.sync(null, pick);
  assert.equal(rb.json, '{"n":5}'); assert.equal(rb.source, 'merged');
  clock.t += 5000; a.save('{"n":9}'); await a.flush();
  assert.equal(st.docs.get('u1_apex-elohim')!.data, '{"n":9}');
  const c = new CloudSave('apex-elohim', link(st, 'u1', 'apex-elohim', clock), 500);
  assert.equal((await c.sync('{"n":2}', pick)).json, '{"n":9}', 'the older device takes the newer save');
});

test('client: two devices saving at once merge instead of overwriting', async () => {
  const st = new MemStore();
  const sum = (l: string | null, c: string) => ({ json: JSON.stringify({ n: (l ? JSON.parse(l).n : 0) + JSON.parse(c).n }), source: 'merged' as const });
  const clock = { t: 1_000_000 };
  const a = new CloudSave('apex-elohim', link(st, 'u1', 'apex-elohim', clock), 500), b = new CloudSave('apex-elohim', link(st, 'u1', 'apex-elohim', clock), 500);
  await a.sync('{"n":1}', sum); await b.sync(null, sum);                  // both now at rev 1 with n = 1
  clock.t += 5000; a.save('{"n":10}'); await a.flush();                   // a stores rev 2
  clock.t += 5000; b.save('{"n":20}'); await b.flush();                   // b is stale: conflict, merges with a's save, retries
  const final = JSON.parse(st.docs.get('u1_apex-elohim')!.data).n;
  assert.equal(final, 30); assert.equal(st.docs.get('u1_apex-elohim')!.rev, 3);
});

test('garage: the save further along wins, the other is kept as a backup, and a fresh device gets the cloud save', async () => {
  const strong = new Garage(mem()); strong.grant(60000, 5000);
  strong.recordRun({ eventId: 'ironport_grand_circuit', timeSec: 112, parSec: 100, collisions: 0, topMph: 140, driftPoints: 0, distanceKm: 4, wetness: 0, assists: { line: true, brake: true, steer: true } });
  const fresh = new Garage(mem());
  assert.ok(progressScore(strong.save) > progressScore(fresh.save));
  assert.equal(mergeGarageJson(fresh.exportJson(), strong.exportJson()).source, 'cloud');
  assert.equal(mergeGarageJson(strong.exportJson(), fresh.exportJson()).source, 'local');
  assert.equal(mergeGarageJson(null, strong.exportJson()).source, 'cloud');
  assert.equal(mergeGarageJson('garbage', strong.exportJson()).source, 'cloud');
  // a brand-new device signs in: it takes the cloud progress
  const st = new MemStore(); st.docs.set('u1_apex-elohim', { rev: 4, data: strong.exportJson(), updatedAt: 1 });
  const device = new Garage(mem()), backup = mem();
  const cloud = attachCloud(device, new CloudSave('apex-elohim', link(st, 'u1'), 500), backup as Pick<Storage, 'setItem'>);
  await cloud.available(); await new Promise((r) => setTimeout(r, 80));
  assert.equal(device.save.xp, strong.save.xp);
  assert.ok(backup.getItem('apex.garage.backup'), 'what was replaced is kept');
  // a change on this device reaches the cloud
  device.grant(1000); await cloud.flush();
  assert.equal(JSON.parse(st.docs.get('u1_apex-elohim')!.data).credits, device.credits);
});
