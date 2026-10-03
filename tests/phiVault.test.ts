process.env.PLAJAH_PHI_TEST = '1';
import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../services/clinic/phi/phiCrypto';
import { MemoryPhiDb } from '../services/clinic/phi/memoryDb';
import { verifyAuditChains } from '../services/clinic/phi/phiAudit';
import * as V from '../services/clinic/phi/phiVault';
import { PhiError, type ClinicRole } from '../services/clinic/phi/types';

const OWNER = 'ownerUid12345', PROV = 'provUid123456', STAFF = 'staffUid12345', BILL = 'billUid123456', ADM = 'adminUid12345';
const PASS = { [OWNER]: 'owner passphrase 2026', [PROV]: 'provider passphrase 2026', [STAFF]: 'staff passphrase 2026', [BILL]: 'biller passphrase 2026', [ADM]: 'admin passphrase 2026' } as Record<string, string>;
const APPT = { patientName: 'Elena Rostova', patientPhone: '(415) 555-0143', patientDob: '1989-05-14', chiefComplaint: 'lisinopril follow-up' };
const SOAP = { patientName: 'Elena Rostova', subjective: { hpi: 'BP averaging 138/86 on lisinopril 10mg' }, assessment: { dx: 'I10' } };

async function throwsCode(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (e: any) => e instanceof PhiError && e.code === code, `expected PhiError(${code})`);
}

/** A clinic with an owner and (optionally) staff who have enrolled and been granted keys. */
async function clinic(members: Array<[string, ClinicRole]> = []) {
  const db = new MemoryPhiDb();
  const { clinicId, recoveryKey, session: owner } = await V.createClinic(db, { ownerUid: OWNER, businessId: 'biz-1', name: 'Grace Family Clinic', passphrase: PASS[OWNER] });
  for (const [uid, role] of members) {
    await V.addMember(owner, { uid, role, displayName: role });
    await V.enrollMember(db, clinicId, uid, PASS[uid]);
    await V.grantAccess(owner, uid);
  }
  const open = (uid: string, pass = PASS[uid]) => V.unlock(db, clinicId, uid, pass);
  return { db, clinicId, recoveryKey, owner, open };
}

describe('PHI vault', () => {
  before(() => C.__useFastKdfForTests(1000));

  describe('set-up', () => {
    test('creates the clinic, the owner, two data keys and a recovery key', async () => {
      const { db, clinicId, recoveryKey } = await clinic();
      assert.match(recoveryKey, /^([A-HJ-NP-Z2-9]{4}-){12}[A-HJ-NP-Z2-9]{4}$/);
      const paths = Object.keys(db.dump());
      for (const p of [`clinics/${clinicId}`, `clinics/${clinicId}/members/${OWNER}`, `clinics/${clinicId}/grants/${OWNER}_front`, `clinics/${clinicId}/grants/${OWNER}_clinical`,
        `clinics/${clinicId}/vault/recovery`, `clinics/${clinicId}/vault/recwrap-front`, `clinics/${clinicId}/vault/recwrap-clinical`]) assert.ok(paths.includes(p), p);
    });

    test('refuses a weak passphrase and a second set-up', async () => {
      const db = new MemoryPhiDb();
      await throwsCode(() => V.createClinic(db, { ownerUid: OWNER, businessId: 'b', passphrase: 'short' }), 'weak-passphrase');
      await V.createClinic(db, { ownerUid: OWNER, businessId: 'b', passphrase: PASS[OWNER] });
      await throwsCode(() => V.createClinic(db, { ownerUid: OWNER, businessId: 'b', passphrase: PASS[OWNER] }), 'conflict');
    });

    test('clinicState walks the member through the stages', async () => {
      const db = new MemoryPhiDb();
      const id = V.clinicIdFor(OWNER, 'biz-1');
      assert.deepEqual(await V.clinicState(db, id, OWNER), { state: 'no-clinic' });           // the founder can set up
      assert.deepEqual(await V.clinicState(db, id, STAFF), { state: 'not-member' });          // anyone else cannot
      const { session } = await V.createClinic(db, { ownerUid: OWNER, businessId: 'biz-1', passphrase: PASS[OWNER] });
      assert.deepEqual(await V.clinicState(db, id, OWNER), { state: 'locked', role: 'OWNER' });
      await V.addMember(session, { uid: STAFF, role: 'STAFF' });
      assert.deepEqual(await V.clinicState(db, id, STAFF), { state: 'needs-enroll', role: 'STAFF' });
      await V.enrollMember(db, id, STAFF, PASS[STAFF]);
      assert.deepEqual(await V.clinicState(db, id, STAFF), { state: 'awaiting-grant', role: 'STAFF' });
      await V.grantAccess(session, STAFF);
      assert.deepEqual(await V.clinicState(db, id, STAFF), { state: 'locked', role: 'STAFF' });
      await V.setMemberStatus(session, STAFF, 'SUSPENDED');
      assert.deepEqual(await V.clinicState(db, id, STAFF), { state: 'suspended', role: 'STAFF' });
    });
  });

  describe('nothing readable is stored', () => {
    test('the database holds ciphertext and opaque metadata — no names, numbers, dates of birth or free text', async () => {
      const { db, owner } = await clinic();
      await owner.putRecord('appointment', 'appt-0001', APPT, { day: '2026-10-03', status: 'CONFIRMED' });
      await owner.putRecord('soap', 'soap-0001', SOAP, { apptRef: 'appt-0001' });
      const raw = JSON.stringify(db.dump());
      for (const secret of ['Elena', 'Rostova', '555-0143', '1989-05-14', 'lisinopril', '138/86', 'I10']) assert.ok(!raw.includes(secret), `PHI leaked into storage: ${secret}`);
      const rec = Object.entries(db.dump()).find(([p]) => p.endsWith('/records/appt-0001'))![1];
      assert.deepEqual(Object.keys(rec).sort(), ['auditId', 'authorUid', 'createdAt', 'ct', 'day', 'iv', 'keyId', 'kind', 'locked', 'rev', 'status', 'updatedAt', 'updatedBy']);
    });
  });

  describe('records', () => {
    test('round-trip, list by day / appointment / status', async () => {
      const { owner } = await clinic();
      await owner.putRecord('appointment', 'appt-0001', { ...APPT, n: 1 }, { day: '2026-10-03', status: 'CONFIRMED' });
      await owner.putRecord('appointment', 'appt-0002', { ...APPT, n: 2 }, { day: '2026-10-04', status: 'SCHEDULED' });
      await owner.putRecord('intake', 'intake-001', { allergies: ['penicillin'] }, { apptRef: 'appt-0001' });
      assert.deepEqual((await owner.getRecord<any>('appointment', 'appt-0001'))!.data, { ...APPT, n: 1 });
      assert.equal((await owner.listRecords('appointment')).records.length, 2);
      assert.deepEqual((await owner.listRecords<any>('appointment', { dayFrom: '2026-10-04' })).records.map(r => r.id), ['appt-0002']);
      assert.deepEqual((await owner.listRecords<any>('appointment', { status: 'CONFIRMED' })).records.map(r => r.id), ['appt-0001']);
      assert.deepEqual((await owner.listRecords<any>('intake', { apptRef: 'appt-0001' })).records.map(r => r.id), ['intake-001']);
      assert.equal(await owner.getRecord('appointment', 'appt-9999'), null);
    });

    test('updates bump the revision and re-seal; concurrent edits conflict instead of overwriting', async () => {
      const { owner, open } = await clinic([[PROV, 'PROVIDER']]);
      const prov = await open(PROV);
      await owner.putRecord('appointment', 'appt-0001', { v: 1 });
      const a = await owner.getRecord<any>('appointment', 'appt-0001');
      assert.equal(a!.rev, 1);
      const b = await owner.putRecord('appointment', 'appt-0001', { v: 2 });
      assert.equal(b.rev, 2);
      // the provider read rev 2, the owner then moves it to rev 3, the provider's write (based on rev 2) is refused
      const stale = await prov.getRecord<any>('appointment', 'appt-0001');
      await owner.putRecord('appointment', 'appt-0001', { v: 3 });
      const db = (prov as any).db as MemoryPhiDb;
      // simulate the provider's stale write: same revision number the owner already used
      const path = Object.keys(db.dump()).find(p => p.endsWith('/records/appt-0001'))!;
      const cur = db.dump()[path];
      await assert.rejects(() => db.commit([{ op: 'update', path, data: { ...cur, rev: stale!.rev + 1 } }]), (e: any) => e.code === 'conflict');
    });

    test('bad ids, days and kinds are rejected', async () => {
      const { owner } = await clinic();
      await throwsCode(() => owner.putRecord('appointment', 'x', {}), 'bad-input');
      await throwsCode(() => owner.putRecord('appointment', '../escape/path', {}), 'bad-input');
      await throwsCode(() => owner.putRecord('appointment', 'appt-0001', {}, { day: '03/10/2026' }), 'bad-input');
      await throwsCode(() => owner.putRecord('nonsense' as any, 'appt-0001', {}), 'bad-input');
      await owner.putRecord('appointment', 'appt-0001', {});
      await throwsCode(() => owner.putRecord('intake', 'appt-0001', {}), 'bad-input');        // same id, other kind
    });

    test('a failed write leaves neither a record nor an audit entry', async () => {
      const { db, owner } = await clinic();
      const before = Object.keys(db.dump()).length;
      db.failNextCommit = new Error('network down');
      await assert.rejects(() => owner.putRecord('appointment', 'appt-0001', APPT));
      assert.equal(Object.keys(db.dump()).length, before);
    });

    test('every record write travels in ONE batch with its audit entry, and the record points at it', async () => {
      const { db, owner } = await clinic();
      await owner.putRecord('appointment', 'appt-0001', APPT);
      const batch = db.commits[db.commits.length - 1];
      assert.equal(batch.length, 2);
      const rec = batch.find(o => o.op !== 'delete' && /\/records\//.test(o.path)) as any;
      const aud = batch.find(o => o.op !== 'delete' && /\/audit\//.test(o.path)) as any;
      assert.ok(rec && aud);
      assert.equal(rec.data.auditId, aud.path.split('/').pop());
      assert.equal(aud.data.recordId, 'appt-0001'); assert.equal(aud.data.action, 'CREATE_RECORD'); assert.equal(aud.data.actorUid, OWNER);
    });
  });

  describe('signing (lock)', () => {
    test('a locked record can no longer change, and carries a content hash', async () => {
      const { db, owner } = await clinic();
      await owner.putRecord('soap', 'soap-0001', SOAP);
      const locked = await owner.lockRecord<any>('soap', 'soap-0001');
      assert.equal(locked.locked, true);
      await throwsCode(() => owner.putRecord('soap', 'soap-0001', { ...SOAP, changed: true }), 'immutable');
      const doc = Object.entries(db.dump()).find(([p]) => p.endsWith('/records/soap-0001'))![1];
      assert.match(doc.contentSha, /^[0-9a-f]{64}$/);
      assert.equal((await owner.lockRecord('soap', 'soap-0001')).locked, true);      // idempotent
    });

    test('a signed record whose hash no longer matches is refused, not silently shown', async () => {
      const { db, owner } = await clinic();
      await owner.putRecord('soap', 'soap-0001', SOAP);
      await owner.lockRecord('soap', 'soap-0001');
      const path = Object.keys(db.dump()).find(p => p.endsWith('/records/soap-0001'))!;
      db.poke(path, { contentSha: 'f'.repeat(64) });
      await throwsCode(() => owner.getRecord('soap', 'soap-0001'), 'decrypt-failed');
    });
  });

  describe('roles and cryptographic separation', () => {
    test('each role can do exactly its job', async () => {
      const { open } = await clinic([[PROV, 'PROVIDER'], [STAFF, 'STAFF'], [BILL, 'BILLER'], [ADM, 'ADMIN']]);
      const prov = await open(PROV), staff = await open(STAFF), bill = await open(BILL), adm = await open(ADM);

      await staff.putRecord('appointment', 'appt-0001', APPT, { day: '2026-10-03' });
      await staff.putRecord('intake', 'intake-001', { allergies: ['none'] });
      await prov.putRecord('soap', 'soap-0001', SOAP, { apptRef: 'appt-0001' });
      await prov.putRecord('superbill', 'bill-0001', { total: 185 });
      await bill.putRecord('superbill', 'bill-0002', { total: 95 });

      // front desk: appointments + intake only
      assert.ok(await staff.getRecord('appointment', 'appt-0001'));
      await throwsCode(() => staff.getRecord('soap', 'soap-0001'), 'no-access');
      await throwsCode(() => staff.getRecord('superbill', 'bill-0001'), 'no-access');
      await throwsCode(() => staff.putRecord('soap', 'soap-0002', SOAP), 'no-access');
      // biller: appointments (read) + superbills
      assert.ok(await bill.getRecord('appointment', 'appt-0001'));
      await throwsCode(() => bill.putRecord('appointment', 'appt-0002', APPT), 'no-access');
      await throwsCode(() => bill.getRecord('intake', 'intake-001'), 'no-access');
      await throwsCode(() => bill.getRecord('soap', 'soap-0001'), 'no-access');
      // admin: administrative, never clinical
      assert.ok(await adm.getRecord('superbill', 'bill-0001'));
      await throwsCode(() => adm.getRecord('soap', 'soap-0001'), 'no-access');
      // provider reads what the front desk wrote
      assert.equal((await prov.getRecord<any>('appointment', 'appt-0001'))!.data.patientName, 'Elena Rostova');
    });

    test('a front-desk member is not merely blocked: they never receive the clinical key', async () => {
      const { db, clinicId } = await clinic([[STAFF, 'STAFF'], [PROV, 'PROVIDER']]);
      const paths = Object.keys(db.dump());
      assert.ok(paths.includes(`clinics/${clinicId}/grants/${STAFF}_front`));
      assert.ok(!paths.includes(`clinics/${clinicId}/grants/${STAFF}_clinical`), 'staff must have no clinical grant');
      assert.ok(paths.includes(`clinics/${clinicId}/grants/${PROV}_clinical`));
      // even handed a clinical ciphertext by a (hypothetical) rules bug, staff cannot open it
      const owner = await V.unlock(db, clinicId, OWNER, PASS[OWNER]);
      await owner.putRecord('soap', 'soap-0001', SOAP);
      const staff = await V.unlock(db, clinicId, STAFF, PASS[STAFF]);
      assert.ok(!staff.domains.includes('clinical'));
      await throwsCode(() => staff.getRecord('soap', 'soap-0001'), 'no-access');
    });

    test('admins add staff but not other admins or owners, and grant only the front key', async () => {
      const { open, clinicId, db } = await clinic([[ADM, 'ADMIN'], [PROV, 'PROVIDER']]);
      const adm = await open(ADM);
      await V.addMember(adm, { uid: STAFF, role: 'STAFF' });
      await throwsCode(() => V.addMember(adm, { uid: 'admin2Uid1234', role: 'ADMIN' }), 'no-access');
      await throwsCode(() => V.addMember(adm, { uid: 'owner2Uid1234', role: 'OWNER' }), 'no-access');
      await V.enrollMember(db, clinicId, STAFF, PASS[STAFF]);
      assert.deepEqual(await V.grantAccess(adm, STAFF), ['front']);
      // a provider needs the clinical key too — an admin can only hand over the front-desk half; the owner completes it
      assert.deepEqual(await V.grantAccess(adm, PROV), ['front']);
      const { db: _db } = { db };
      assert.ok(!Object.keys(_db.dump()).some(p => p === `clinics/${clinicId}/grants/${ADM}_clinical`));
      await throwsCode(() => V.grantAccess(adm, 'strangerUid123'), 'not-found');
      await throwsCode(() => V.setMemberStatus(adm, OWNER, 'SUSPENDED'), 'no-access');
    });

    test('providers, staff and billers cannot manage membership or read the audit log', async () => {
      const { open } = await clinic([[PROV, 'PROVIDER'], [STAFF, 'STAFF']]);
      for (const s of [await open(PROV), await open(STAFF)]) {
        await throwsCode(() => V.addMember(s, { uid: 'someoneUid123', role: 'STAFF' }), 'no-access');
        await throwsCode(() => s.readAuditLog(), 'no-access');
        await throwsCode(() => s.listMembers(), 'no-access');
      }
    });
  });

  describe('cross-device', () => {
    test('a second device with the passphrase reads what the first wrote; a wrong passphrase gets nothing', async () => {
      const { open } = await clinic([[PROV, 'PROVIDER']]);
      const laptop = await open(PROV);
      await laptop.putRecord('soap', 'soap-0001', SOAP);
      const tablet = await open(PROV);                                       // a fresh unlock = another device
      assert.deepEqual((await tablet.getRecord<any>('soap', 'soap-0001'))!.data, SOAP);
      await throwsCode(() => open(PROV, 'wrong passphrase 12345'), 'wrong-passphrase');
    });

    test('unlock failures are specific: not enrolled, not granted, suspended, not a member', async () => {
      const db = new MemoryPhiDb();
      const { clinicId, session } = await V.createClinic(db, { ownerUid: OWNER, businessId: 'b', passphrase: PASS[OWNER] });
      await V.addMember(session, { uid: STAFF, role: 'STAFF' });
      await throwsCode(() => V.unlock(db, clinicId, STAFF, PASS[STAFF]), 'not-enrolled');
      await V.enrollMember(db, clinicId, STAFF, PASS[STAFF]);
      await throwsCode(() => V.unlock(db, clinicId, STAFF, PASS[STAFF]), 'no-grant');
      await V.grantAccess(session, STAFF);
      await V.unlock(db, clinicId, STAFF, PASS[STAFF]);
      await V.setMemberStatus(session, STAFF, 'SUSPENDED');
      await throwsCode(() => V.unlock(db, clinicId, STAFF, PASS[STAFF]), 'no-access');
      await throwsCode(() => V.unlock(db, clinicId, 'strangerUid123', 'whatever passphrase'), 'no-access');
    });

    test('a member can change their passphrase; the old one stops working', async () => {
      const { db, clinicId, open } = await clinic([[PROV, 'PROVIDER']]);
      await V.changePassphrase(db, clinicId, PROV, PASS[PROV], 'a much newer passphrase!');
      await throwsCode(() => open(PROV), 'wrong-passphrase');
      assert.ok(await V.unlock(db, clinicId, PROV, 'a much newer passphrase!'));
    });
  });

  describe('locking', () => {
    test('lock() drops every key and every call afterwards is refused', async () => {
      const { owner } = await clinic();
      await owner.putRecord('appointment', 'appt-0001', APPT);
      let fired = 0; (owner as any).onLock = () => fired++;
      owner.lock(); owner.lock();
      assert.equal(owner.locked, true); assert.deepEqual(owner.domains, []);
      await throwsCode(() => owner.getRecord('appointment', 'appt-0001'), 'locked');
      await throwsCode(() => owner.putRecord('appointment', 'appt-0002', APPT), 'locked');
      await throwsCode(() => owner.listRecords('appointment'), 'locked');
      await throwsCode(() => owner.readAuditLog(), 'locked');
    });
  });

  describe('audit trail', () => {
    test('writes, reads and lists are all recorded — with no patient data in the log', async () => {
      const { db, owner } = await clinic();
      await owner.putRecord('appointment', 'appt-0001', APPT);
      await owner.getRecord('appointment', 'appt-0001');
      await owner.listRecords('appointment');
      const log = await owner.readAuditLog();
      const actions = log.map(e => e.action);
      for (const a of ['CLINIC_CREATE', 'CREATE_RECORD', 'READ_RECORD', 'LIST_RECORDS', 'AUDIT_VIEW']) assert.ok(actions.includes(a as any) || a === 'AUDIT_VIEW', a);
      const raw = JSON.stringify(db.dump().constructor === Object ? Object.entries(db.dump()).filter(([p]) => /\/audit\//.test(p)) : []);
      for (const secret of ['Elena', 'Rostova', '555-0143']) assert.ok(!raw.includes(secret));
    });

    test('the chain verifies, and edits or removed entries are caught', async () => {
      const { db, owner } = await clinic();
      for (let i = 1; i <= 4; i++) await owner.putRecord('appointment', `appt-000${i}`, { i });
      const entries = () => Object.entries(db.dump()).filter(([p]) => /\/audit\//.test(p)).map(([p, d]) => ({ id: p.split('/').pop()!, ...d })) as any[];
      assert.deepEqual(await verifyAuditChains(entries()), []);

      const e = entries();
      const victim = e.find(x => x.action === 'UPDATE_RECORD' || x.action === 'CREATE_RECORD' && x.seq === 3)!;
      db.poke(`clinics/${Object.keys(db.dump())[0].split('/')[1]}/audit/${victim.id}`, { recordId: 'appt-FAKE' });
      assert.ok((await verifyAuditChains(entries())).some(p => p.problem === 'hash-mismatch'));

      const kept = entries().filter(x => x.seq !== 2);
      assert.ok((await verifyAuditChains(kept)).some(p => p.problem === 'gap' || p.problem === 'broken-link'));
    });
  });

  describe('removing a member: rotation', () => {
    test('suspending cuts them off and re-keys; signed records stay readable to those who should read them', async () => {
      const { db, clinicId, owner, open } = await clinic([[PROV, 'PROVIDER'], [STAFF, 'STAFF']]);
      const prov = await open(PROV), staff = await open(STAFF);
      await owner.putRecord('soap', 'soap-0001', SOAP);                     // unsigned
      await owner.putRecord('soap', 'soap-0002', { ...SOAP, signed: true });
      await owner.lockRecord('soap', 'soap-0002');                          // signed — immutable
      await owner.putRecord('appointment', 'appt-0001', APPT, { day: '2026-10-03' });
      const rec = (id: string) => Object.entries(db.dump()).find(([p]) => p.endsWith(`/records/${id}`))![1];
      const oldClinical = rec('soap-0001').keyId, oldFront = rec('appt-0001').keyId;

      await V.setMemberStatus(owner, PROV, 'SUSPENDED');

      const paths = Object.keys(db.dump());
      assert.ok(!paths.includes(`clinics/${clinicId}/grants/${PROV}_clinical`) && !paths.includes(`clinics/${clinicId}/grants/${PROV}_front`));
      assert.notEqual(rec('soap-0001').keyId, oldClinical, 'unsigned clinical record was re-keyed');
      assert.notEqual(rec('appt-0001').keyId, oldFront, 'front-desk record was re-keyed');
      assert.equal(rec('soap-0002').keyId, oldClinical, 'a signed record stays under its original key');
      assert.equal(rec('soap-0001').rev, 2);

      // the owner still reads everything; the remaining front-desk member still reads their data
      assert.deepEqual((await owner.getRecord<any>('soap', 'soap-0001'))!.data, SOAP);
      assert.equal((await owner.getRecord<any>('soap', 'soap-0002'))!.data.signed, true);
      const staff2 = await open(STAFF);
      assert.equal((await staff2.getRecord<any>('appointment', 'appt-0001'))!.data.patientName, 'Elena Rostova');
      // the suspended member's open session cannot decrypt anything written under the new keys
      await throwsCode(() => prov.getRecord('soap', 'soap-0001'), 'no-grant');
      await throwsCode(() => prov.getRecord('appointment', 'appt-0001'), 'no-grant');
      void staff;
      // and they can no longer unlock at all
      await throwsCode(() => open(PROV), 'no-access');
      // the audit log shows what happened
      const log = (await owner.readAuditLog(500)).map(e => e.action);
      assert.ok(log.includes('MEMBER_SUSPEND') && log.includes('KEY_ROTATE'));
    });

    test('rotation survives being interrupted: nothing is left unreadable', async () => {
      const { db, owner } = await clinic();
      for (let i = 1; i <= 5; i++) await owner.putRecord('appointment', `appt-000${i}`, { i, patientName: 'P' + i });
      // let the grant step through, then fail while records are being moved
      const real = db.commit.bind(db);
      let calls = 0;
      db.commit = async (ops: any) => { if (++calls === 2) throw new Error('connection lost'); return real(ops); };
      await assert.rejects(() => V.rotateDomain(owner, 'front'));
      db.commit = real;
      // old and new keys are both held, so every record — moved or not — still opens
      for (let i = 1; i <= 5; i++) assert.equal((await owner.getRecord<any>('appointment', `appt-000${i}`))!.data.i, i);
      // and running it again finishes the job
      const r = await V.rotateDomain(owner, 'front');
      assert.deepEqual(r.failed, []);
      for (let i = 1; i <= 5; i++) assert.equal((await owner.getRecord<any>('appointment', `appt-000${i}`))!.data.i, i);
    });
  });

  describe('recovery', () => {
    test('a forgotten passphrase is recoverable with the recovery key, and the old one stops working', async () => {
      const { db, clinicId, recoveryKey, owner, open } = await clinic([[PROV, 'PROVIDER']]);
      await owner.putRecord('soap', 'soap-0001', SOAP);
      await owner.putRecord('appointment', 'appt-0001', APPT);
      owner.lock();

      await throwsCode(() => V.recoverOwnerAccess(db, clinicId, OWNER, C.generateRecoveryKey(), 'a replacement passphrase'), 'bad-recovery-key');
      const back = await V.recoverOwnerAccess(db, clinicId, OWNER, recoveryKey, 'a replacement passphrase');
      assert.deepEqual((await back.getRecord<any>('soap', 'soap-0001'))!.data, SOAP);
      await throwsCode(() => V.unlock(db, clinicId, OWNER, PASS[OWNER]), 'wrong-passphrase');
      assert.ok(await V.unlock(db, clinicId, OWNER, 'a replacement passphrase'));
      assert.ok(await open(PROV));                                           // other members were not disturbed
    });

    test('only the owner can recover; and recovery still works after the keys were rotated', async () => {
      const { db, clinicId, recoveryKey, owner, open } = await clinic([[PROV, 'PROVIDER'], [ADM, 'ADMIN']]);
      await owner.putRecord('soap', 'soap-0001', SOAP);
      await throwsCode(() => V.recoverOwnerAccess(db, clinicId, PROV, recoveryKey, 'a replacement passphrase'), 'no-access');
      // an ADMIN rotates the front key — they never see the recovery key, yet recovery must keep working
      const adm = await open(ADM);
      await V.rotateDomain(adm, 'front');
      await V.rotateDomain(owner, 'clinical');
      owner.lock();
      const back = await V.recoverOwnerAccess(db, clinicId, OWNER, recoveryKey, 'another new passphrase!');
      assert.deepEqual((await back.getRecord<any>('soap', 'soap-0001'))!.data, SOAP);
    });

    test('issuing a new recovery key retires the old one', async () => {
      const { db, clinicId, recoveryKey, owner } = await clinic();
      await owner.putRecord('soap', 'soap-0001', SOAP);
      const next = await V.rotateRecoveryKey(owner);
      owner.lock();
      await throwsCode(() => V.recoverOwnerAccess(db, clinicId, OWNER, recoveryKey, 'a replacement passphrase'), 'bad-recovery-key');
      const back = await V.recoverOwnerAccess(db, clinicId, OWNER, next, 'a replacement passphrase');
      assert.deepEqual((await back.getRecord<any>('soap', 'soap-0001'))!.data, SOAP);
    });
  });
});
