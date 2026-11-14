// Two people, one browser. Account A's device stores are invisible to B, A gets them back on return,
// and old stores with no owner on them stay on the device, unread.
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
(globalThis as any).sessionStorage = { store: new Map(), clear() { this.store.clear(); }, setItem(k: string, v: string) { this.store.set(k, v); }, getItem(k: string) { return this.store.get(k) ?? null; }, removeItem(k: string) { this.store.delete(k); } };
(globalThis as any).window ??= { dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, localStorage: (globalThis as any).localStorage };
(globalThis as any).document ??= { addEventListener() {}, visibilityState: 'visible' };
(globalThis as any).CustomEvent ??= class { constructor(public type: string, public init?: unknown) {} };

// ── a minimal Origin Private File System ──
class FakeDir {
  kind = 'directory' as const;
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    if (!this.dirs.has(name)) { if (!o?.create) throw new Error('NotFound'); this.dirs.set(name, new FakeDir(name)); }
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    if (!this.files.has(name)) { if (!o?.create) throw new Error('NotFound'); this.files.set(name, new FakeFile(name)); }
    return this.files.get(name)!;
  }
  async removeEntry(name: string) { this.files.delete(name); this.dirs.delete(name); }
  async *values() { yield* this.files.values(); yield* this.dirs.values(); }
}
class FakeFile {
  kind = 'file' as const;
  text_ = '';
  constructor(public name: string) {}
  async getFile() { const t = this.text_; return { text: async () => t }; }
  async createWritable() { const f = this; return { async write(s: string) { f.text_ = s; }, async close() {} }; }
}
const opfs = new FakeDir('root');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { getDirectory: async () => opfs }, userAgent: 'test', onLine: false } });

// ── a minimal IndexedDB, as much as idb-keyval uses ──
const idb = new Map<string, unknown>();
const request = (result?: unknown) => {
  const r: any = { result };
  queueMicrotask(() => { r.onsuccess?.({ target: r }); });
  return r;
};
const objectStore = (tx: any) => ({
  get: (k: string) => request(structuredClone(idb.get(k))),
  put: (v: unknown, k: string) => { idb.set(k, structuredClone(v)); return request(); },
  delete: (k: string) => { idb.delete(k); return request(); },
  getAllKeys: () => request([...idb.keys()]),
  getAll: () => request([...idb.values()]),
  transaction: tx,
});
(globalThis as any).indexedDB = {
  open() {
    const r: any = {};
    r.result = {
      createObjectStore() {},
      transaction() {
        const tx: any = { objectStore: () => objectStore(tx) };
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { tx.oncomplete?.(); })));
        return tx;
      },
    };
    queueMicrotask(() => { r.onupgradeneeded?.(); r.onsuccess?.(); });
    return r;
  },
};

const { auth } = await import('../services/firebase');
const { adoptOwnedIdbValue, adoptOwnedRows, forgetPageAccountForTests, noteAuthUser, purgeAccountResidue, scopedKey, userScopedKey } = await import('../services/userScope');
const telaStore = await import('../services/telaStore');
const curriculum = await import('../services/curriculumIngestionService');
const devo = await import('../services/churchDevotionalService');
const kinship = await import('../services/chmsKinshipAndStatements');
const clinic = await import('../services/clinicService');
const appts = await import('../services/appointmentService');
const mobilize = await import('../services/elevateMobilizeService');
const comic = await import('../services/comicProject/store');
const anima = await import('../services/anima/projectStore');
const ambo = await import('../services/ambo/amboStorageService');
const { createDefaultProject } = await import('../services/ambo/amboProjectModel');
const fabulaSync = await import('../services/fabula/fabulaSync');
const hub = await import('../services/home/plajahHubClient');
const audius = await import('../services/audiusAuth');
const offline = await import('../services/offlineStorageService');

// Sign in as someone, the way a reload after an account change would leave this page.
const signIn = (uid: string | null) => {
  forgetPageAccountForTests();
  Object.defineProperty(auth, 'currentUser', { configurable: true, value: uid ? { uid, isAnonymous: false, getIdToken: async () => 't', stsTokenManager: { accessToken: 't' } } : null });
};
(globalThis as any).fetch = async () => new Response('{}', { status: 200 });
// The real Firestore SDK can't use the stand-in signed-in user above, so its background calls fail;
// a cloud that's out of reach is exactly the case under test. Only that failure is ignored here.
process.on('unhandledRejection', (e: any) => { if (!/accessToken|FIRESTORE/.test(String(e?.message))) throw e; });
for (const level of ['warn', 'error'] as const) { const real = console[level]; console[level] = (...a: unknown[]) => { if (!/FIRESTORE|creativeCloud|fetchAppointments|telaStore/.test(a.map(String).join(' '))) real(...a); }; }

const telaDoc = (id: string, ownerId: string, title = id) => ({
  id, ownerId, title, createdAt: 1, updatedAt: 1, devices: {}, pages: [],
}) as any;

test('the key helper keeps accounts and guests apart', () => {
  assert.notEqual(userScopedKey('a', 'n'), userScopedKey('b', 'n'));
  assert.notEqual(userScopedKey(null, 'n'), userScopedKey('a', 'n'));
  signIn('a');
  assert.equal(scopedKey('n'), userScopedKey('a', 'n'));
  signIn(null);
  assert.equal(scopedKey('n'), userScopedKey(null, 'n'));
});

test('a late save after sign-out stays with the person who wrote it', () => {
  signIn('a');
  assert.equal(scopedKey('n'), userScopedKey('a', 'n'));
  Object.defineProperty(auth, 'currentUser', { configurable: true, value: null });
  assert.equal(scopedKey('n'), userScopedKey('a', 'n'));
});

test('Tela: B cannot list or open A’s doc, and A gets it back', async () => {
  signIn('alice');
  await telaStore.saveTelaDoc(telaDoc('tela_a', 'alice', 'Alice private'));
  assert.ok((await telaStore.listTelaDocs()).some(m => m.id === 'tela_a'));

  signIn('bob');
  assert.deepEqual((await telaStore.listTelaDocs()).map(m => m.id), []);
  assert.equal(await telaStore.loadTelaDoc('tela_a'), null);

  signIn('alice');
  assert.equal((await telaStore.loadTelaDoc('tela_a'))?.title, 'Alice private');
});

test('Tela: an old shared file moves to its owner, and unowned ones stay unread and intact', async () => {
  const legacy = await opfs.getDirectoryHandle('tela', { create: true });
  const write = async (name: string, value: unknown) => { const f = await legacy.getFileHandle(name, { create: true }); f.text_ = JSON.stringify(value); };
  await write('tela_owned.json', telaDoc('tela_owned', 'carol', 'Carol old'));
  await write('tela_local.json', telaDoc('tela_local', 'local', 'Nobody knows'));
  await write('tela_other.json', telaDoc('tela_other', 'dave', 'Dave old'));
  const versions = await (await legacy.getDirectoryHandle('versions', { create: true })).getDirectoryHandle('tela_owned', { create: true });
  (await versions.getFileHandle('v1.json', { create: true })).text_ = JSON.stringify({ versionId: 'v1', docId: 'tela_owned', createdAt: 1, bundle: telaDoc('tela_owned', 'carol') });

  signIn('carol');
  const ids = (await telaStore.listTelaDocs()).map(m => m.id);
  assert.deepEqual(ids, ['tela_owned']);
  assert.ok(legacy.files.has('tela_local.json') && legacy.files.has('tela_other.json'), 'nothing unowned is destroyed');
  assert.ok(!legacy.files.has('tela_owned.json'));
  assert.deepEqual((await telaStore.listTelaVersions('tela_owned')).map(v => v.versionId), ['v1']);

  signIn('erin');
  assert.deepEqual((await telaStore.listTelaDocs()).map(m => m.id), []);
  assert.equal(await telaStore.loadTelaDoc('tela_local'), null);
});

test('Tela: a private Notes block still opens for its owner, and the old label no longer says encrypted', async () => {
  signIn('nora');
  const device = { id: 'dev1', type: 'NOTES', name: 'Ora', entries: [{ id: 'e', blocks: [{ id: 'b', text: 'secret prayer' }] }], domainBinding: { label: 'Ora Longhand · encrypted', encryptedAtRest: true } };
  await telaStore.saveTelaDoc({ ...telaDoc('tela_notes', 'nora'), devices: { dev1: device } });
  const raw = await telaStore.serializeTelaDocForStore({ ...telaDoc('tela_notes', 'nora'), devices: { dev1: device } });
  assert.ok(!raw.includes('secret prayer'));
  const back: any = await telaStore.loadTelaDoc('tela_notes');
  assert.equal(back.devices.dev1.entries[0].blocks[0].text, 'secret prayer');
  assert.ok(!/encrypted/i.test(back.devices.dev1.domainBinding.label));
});

test('old localStorage rows move only when the owner field matches', () => {
  store.set('old_rows', JSON.stringify([{ o: 'a', v: 1 }, { o: 'b', v: 2 }, { v: 3 }]));
  adoptOwnedRows<{ o?: string }>('old_rows', 'mine', r => r.o === 'a');
  assert.deepEqual(JSON.parse(store.get('mine')!), [{ o: 'a', v: 1 }]);
  assert.deepEqual(JSON.parse(store.get('old_rows')!), [{ o: 'b', v: 2 }, { v: 3 }]);
});

test('curriculum: lessons and submissions are per account, and owned old rows come along', () => {
  store.set('plajah_ingested_curriculum_subs_v1_org1', JSON.stringify([
    { id: 's1', unitId: 'u', orgId: 'org1', studentUid: 'stu', submittedAt: 1 },
    { id: 's2', unitId: 'u', orgId: 'org1', studentUid: 'other', submittedAt: 2 },
  ]));
  signIn('stu');
  assert.deepEqual(curriculum.listUnitSubmissions('org1').map(s => s.id), ['s1']);
  signIn('other2');
  assert.deepEqual(curriculum.listUnitSubmissions('org1'), []);
  signIn('stu');
  assert.deepEqual(curriculum.listUnitSubmissions('org1').map(s => s.id), ['s1']);
});

test('devotional notes and Bible progress are per account, with no invented streak', () => {
  signIn('a');
  devo.saveDevotionalReflectionNote('d1', 'mine');
  devo.toggleBibleYearDayCompletion(5);
  signIn('b');
  assert.equal(devo.getDevotionalReflectionNote('d1'), '');
  assert.deepEqual(devo.getCompletedBibleYearDays(), []);
  signIn('a');
  assert.equal(devo.getDevotionalReflectionNote('d1'), 'mine');
  assert.deepEqual(devo.getCompletedBibleYearDays(), [5]);
});

test('kinship: choices are per account, and an old choice to hide is never undone', () => {
  signIn('a');
  kinship.setLocalExtendedKinshipOptIn('p1', false);
  signIn('b');
  assert.equal(kinship.getLocalExtendedKinshipOptIn('p1'), true);
  store.set('plajah_chms_extended_kinship_privacy_v1', JSON.stringify({ p2: false }));
  assert.equal(kinship.getLocalExtendedKinshipOptIn('p2'), false);
  signIn('a');
  assert.equal(kinship.getLocalExtendedKinshipOptIn('p1'), false);
});

test('clinic: a real business sees only its own records, and no demo patients', async () => {
  signIn('doc');
  assert.deepEqual(await clinic.fetchSoapNotesForBusiness('real-clinic'), []);
  assert.equal(await clinic.fetchIntakeByAppointmentId('nothing', 'real-clinic'), null);
  assert.equal(await clinic.fetchIntakeByAppointmentId('apt-002', 'real-clinic'), null);
  assert.ok(await clinic.fetchIntakeByAppointmentId('apt-002', 'demo-health-clinic'));
  await clinic.saveSoapNote({ id: 'n1', appointmentId: 'x1', businessId: 'real-clinic', patientName: 'P', providerId: 'doc', providerName: 'D' } as any);
  assert.equal((await clinic.getSoapNoteByAppointmentId('x1', 'real-clinic'))?.id, 'n1');
  assert.equal(await clinic.getSoapNoteByAppointmentId('x1', 'other-clinic'), null);
  assert.ok((await appts.fetchAppointmentsForBusiness('real-clinic')).every(a => a.businessId === 'real-clinic'));
  signIn('nurse-elsewhere');
  assert.deepEqual(await clinic.fetchSoapNotesForBusiness('real-clinic'), []);
});

test('mobilize: an org bundle is per account, the old copy goes only to the founder', () => {
  const org = { id: 'org7', name: 'Org', orgType: 'CHURCH', ministries: [], campuses: [], creatorId: 'founder' } as any;
  const bundle = { ...mobilize.getDefaultElevateMobilizeBundle(org), shiftDrives: [{ id: 'real-drive' }] } as any;
  store.set('plajah_elevate_mobilize_v1_org7', JSON.stringify(bundle));
  signIn('stranger');
  assert.deepEqual(mobilize.loadElevateMobilizeBundleLocal(org).shiftDrives, []);
  assert.ok(store.has('plajah_elevate_mobilize_v1_org7'), 'the old copy is untouched');
  signIn('founder');
  assert.deepEqual(mobilize.loadElevateMobilizeBundleLocal(org).shiftDrives.map((d: any) => d.id), ['real-drive']);
});

test('comic and Anima: lists, last-opened and the unload stash are per account', async () => {
  signIn('a');
  await comic.cacheLocally({ id: 'c1', title: 'A comic', format: 'comic', pages: [], updatedAt: 2, schema: 'plajah.comicProject' } as any);
  comic.setLastComicProjectId('c1');
  anima.stashPendingAnimaProject({ id: 'an1', name: 'n', layers: [], schema: 'x' } as any);
  anima.setLastAnimaProjectId('an1');
  signIn('b');
  assert.deepEqual(await comic.listComicProjects(), []);
  assert.equal(await comic.loadComicProject('c1'), null);
  assert.equal(comic.getLastComicProjectId(), null);
  assert.equal(anima.getLastAnimaProjectId(), null);
  assert.equal(localStorage.getItem(userScopedKey('b', 'plajah.anima.pending')), null);
  signIn('a');
  assert.deepEqual((await comic.listComicProjects()).map(s => s.id), ['c1']);
  assert.equal(comic.getLastComicProjectId(), 'c1');
  assert.equal(anima.getLastAnimaProjectId(), 'an1');
});

test('Stage: projects are per account, own old projects come along, others stay unread', async () => {
  const old = createDefaultProject('Old A', 'USER', 'stageA');
  const other = createDefaultProject('Old Z', 'USER', 'stageZ');
  idb.set('pj.ambo.prj.' + old.id, old);
  idb.set('pj.ambo.prj.' + other.id, other);
  idb.set('pj.ambo.projects.index', [{ id: old.id, name: 'Old A', scope: 'USER', updatedAt: 1 }, { id: other.id, name: 'Old Z', scope: 'USER', updatedAt: 1 }]);
  signIn('stageA');
  assert.deepEqual((await ambo.listLocalProjects()).map(p => p.id), [old.id]);
  assert.equal((await ambo.loadProject(old.id))?.name, 'Old A');
  assert.equal(await ambo.loadProject(other.id), null);
  assert.ok(idb.has('pj.ambo.prj.' + other.id), 'nothing unowned is destroyed');
  ambo.setActiveProjectId(old.id);
  signIn('stageB');
  assert.equal(ambo.getActiveProjectId(), null);
  assert.deepEqual(await ambo.listLocalProjects(), []);
});

test('Fabula: an old production moves only when the cloud lists it, and queued saves never cross accounts', async () => {
  idb.set('studio:prod:p1', { id: 'p1', title: 'Mine' });
  idb.set('studio:prod:p2', { id: 'p2', title: 'Local only' });
  idb.set('fabula:sync:pending', ['p1', 'p2']);
  signIn('fab');
  assert.deepEqual(await fabulaSync.listPending(), []);
  await fabulaSync.adoptCloudListedProductions(['p1']);
  assert.deepEqual(idb.get(fabulaSync.studioKey('studio:prod:p1')), { id: 'p1', title: 'Mine' });
  assert.equal(idb.get(fabulaSync.studioKey('studio:prod:p2')), undefined);
  assert.ok(idb.has('studio:prod:p2'), 'a local-only backup stays on the device');
  assert.deepEqual(await fabulaSync.listPending(), ['p1']);
  signIn('other');
  assert.deepEqual(await fabulaSync.listPending(), []);
  assert.equal(fabulaSync.studioKey('studio:blob:x'), 'studio:blob:x');
});

test('an IndexedDB value never overwrites what an account already has', async () => {
  idb.set('old', 1); idb.set('new', 2);
  assert.equal(await adoptOwnedIdbValue('old', 'new'), true);
  assert.equal(idb.get('new'), 2);
  assert.equal(idb.get('old'), 1);
});

test('Audius and home hub connections stay with their account, old ones clear on sign-out', () => {
  signIn('a');
  localStorage.setItem(scopedKey('plajah_audius_session'), JSON.stringify({ userId: 'au1', handle: 'h' }));
  hub.setHubToken('hub-secret');
  assert.equal(audius.getAudiusSession()?.userId, 'au1');
  signIn('b');
  assert.equal(audius.getAudiusSession(), null);
  assert.equal(hub.getHubToken(), null);
  signIn('a');
  assert.equal(hub.getHubToken(), 'hub-secret');

  store.set('plajah_audius_session', '{"userId":"unowned"}');
  store.set('plajah_hub_token', 'unowned');
  store.set('plajah:activeOrgId', 'org-of-whoever');
  sessionStorage.setItem('x', '1');
  purgeAccountResidue();
  for (const k of ['plajah_audius_session', 'plajah_hub_token', 'plajah:activeOrgId']) assert.equal(store.has(k), false);
  assert.equal(sessionStorage.getItem('x'), null);
  assert.equal(hub.getHubToken(), 'hub-secret', 'per-account pairing survives the purge');
});

test('an account change purges, and a guest signing in does not', () => {
  forgetPageAccountForTests();
  store.set('plajah:activeOrgId', 'x');
  noteAuthUser({ uid: 'a' });
  assert.ok(store.has('plajah:activeOrgId'));
  noteAuthUser({ uid: 'b' });
  assert.equal(store.has('plajah:activeOrgId'), false);
  forgetPageAccountForTests();
  noteAuthUser({ uid: 'anon', isAnonymous: true });
  store.set('plajah:activeOrgId', 'y');
  noteAuthUser({ uid: 'real' });
  assert.ok(store.has('plajah:activeOrgId'));
  store.delete('plajah:activeOrgId');
});
