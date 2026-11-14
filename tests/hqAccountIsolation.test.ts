// An outsider on a browser full of another org's data, and with a server response that wrongly
// includes another org's rows: they must see nothing of it.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
(globalThis as any).window ??= { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
(globalThis as any).document ??= { addEventListener() {}, visibilityState: 'visible' };
(globalThis as any).CustomEvent ??= class { constructor(public type: string) {} };

const { auth } = await import('../services/firebase');
const { listHqAssets, listHqAssetsDetailed, listHqSharedWithMe } = await import('../services/orgAssets');
const { listDeskAssignments } = await import('../services/universalStudentDeskService');

const signIn = (uid: string) => Object.defineProperty(auth, 'currentUser', { configurable: true, value: { uid, getIdToken: async () => 'token' } });
const serve = (body: unknown, status = 200) => { (globalThis as any).fetch = async () => new Response(JSON.stringify(body), { status }); };

const gfUnit = { id: 'u1', telaDocId: 't1', title: 'Revelation 2 Worksheet', kind: 'ASSIGNMENT', questions: [] };
const gfAsset = { id: 'gf1', name: 'Great Faith Budget.pdf', scopeKind: 'org', scopeId: 'great-faith-ministries', uploadedAt: 1 };

function pollute() {
  store.clear();
  for (const id of ['great-faith-ministries', 'teacher-personal-hq', 'unscoped']) {
    store.set(`plajah_org_assets_mirror_v1_${id}`, JSON.stringify([gfAsset]));
    store.set(`plajah_ingested_curriculum_units_v1_${id}`, JSON.stringify([gfUnit]));
    store.set(`plajah_vol_dept_uploads_v1_${id}`, JSON.stringify([{ id: 'up1', fileName: 'gf.pdf' }]));
  }
  store.set('plajah_universal_desk_assignments_v1', JSON.stringify([
    { id: 'seed', assignedByUid: 'instructor_great_faith', orgId: 'great-faith-ministries', title: 'Revelation 2' },
    { id: 'someone', assignedByUid: 'bob', orgId: 'org2', title: 'Bob class' },
  ]));
}

test("a person's Content HQ never shows another org's files from this browser", async () => {
  pollute();
  signIn('alice');
  serve({ assets: [], inScope: true });
  assert.deepEqual(await listHqAssets({ kind: 'user', id: 'alice' }), []);
  assert.deepEqual(await listHqAssets({ kind: 'user', id: 'teacher-alice' }), []);
});

test('an org they do not belong to shows nothing, even with its lessons on this browser', async () => {
  pollute();
  store.set('plajah_ingested_curriculum_units_v1_org9', JSON.stringify([gfUnit]));
  signIn('alice');
  serve({ assets: [], inScope: false });
  assert.deepEqual(await listHqAssets({ kind: 'org', id: 'org9', label: 'Org Nine' }), []);
});

test('another org id can no longer be opened through the old shared buckets', async () => {
  pollute();
  signIn('alice');
  serve({ assets: [gfAsset], inScope: true });
  const res = await listHqAssetsDetailed({ kind: 'org', id: 'great-faith-ministries' });
  assert.equal(res.status, 'denied');
  assert.deepEqual(res.assets, []);
});

test("rows outside the requested scope are dropped even if the server sends them", async () => {
  pollute();
  signIn('alice');
  serve({ assets: [gfAsset, { id: 'mine', name: 'Mine.pdf', scopeKind: 'org', scopeId: 'org1', uploadedAt: 2 }], inScope: true });
  assert.deepEqual((await listHqAssets({ kind: 'org', id: 'org1', label: 'One' })).map(a => a.id), ['mine']);
});

test("someone else's personal library is refused", async () => {
  pollute();
  signIn('alice');
  serve({ assets: [{ id: 'b', scopeKind: 'user', scopeId: 'bob' }], inScope: true });
  assert.equal((await listHqAssetsDetailed({ kind: 'user', id: 'bob' })).status, 'denied');
});

test('signed out sees nothing', async () => {
  pollute();
  Object.defineProperty(auth, 'currentUser', { configurable: true, value: null });
  assert.equal((await listHqAssetsDetailed({ kind: 'org', id: 'org1' })).status, 'denied');
});

test('the offline copy belongs to the account that saved it', async () => {
  pollute();
  signIn('alice');
  serve({ assets: [{ id: 'mine', name: 'Mine.pdf', scopeKind: 'org', scopeId: 'org1', uploadedAt: 2 }], inScope: true });
  await listHqAssets({ kind: 'org', id: 'org1', label: 'One' });
  (globalThis as any).fetch = async () => { throw new Error('offline'); };
  const alice = await listHqAssetsDetailed({ kind: 'org', id: 'org1', label: 'One' });
  assert.equal(alice.status, 'offline');
  assert.deepEqual(alice.assets.map(a => a.id), ['mine']);
  signIn('carol');
  assert.deepEqual((await listHqAssetsDetailed({ kind: 'org', id: 'org1', label: 'One' })).assets, []);
});

test("a desk holds no seeded course and nobody else's work", () => {
  pollute();
  signIn('alice');
  assert.deepEqual(listDeskAssignments(), []);
  signIn('bob');
  assert.deepEqual(listDeskAssignments().map(a => a.id), ['someone']);
});

test("a student keeps the work they started, in their own account", () => {
  pollute();
  store.set('plajah_universal_desk_workspace_v1_dana', JSON.stringify({ someone: { assignmentId: 'someone' } }));
  signIn('dana');
  assert.deepEqual(listDeskAssignments().map(a => a.id), ['someone']);
  signIn('erin');
  assert.deepEqual(listDeskAssignments(), []);
});

test('a personal account lists a shared file only through the explicit grant', async () => {
  pollute();
  signIn('alice');
  serve({ assets: [{ id: 'grant', name: 'Shared.pdf', scopeKind: 'org', scopeId: 'org2', access: 'restricted', accessUids: ['alice'] }] });
  assert.deepEqual((await listHqSharedWithMe()).map(a => a.id), ['grant']);
  serve({ assets: [], inScope: true });
  assert.deepEqual(await listHqAssets({ kind: 'user', id: 'alice' }), []);
});

test('a lesson in the trash stays in the trash', async () => {
  pollute();
  store.set('plajah_ingested_curriculum_units_v1_org1', JSON.stringify([gfUnit]));
  signIn('alice');
  serve({ assets: [{ id: 'hq_orig_t1', name: 'x', scopeKind: 'org', scopeId: 'org1', deletedAt: 5, uploadedAt: 1 }], inScope: true });
  const ids = (await listHqAssets({ kind: 'org', id: 'org1', label: 'One' })).map(a => a.id);
  assert.ok(!ids.includes('hq_orig_t1'));
});
