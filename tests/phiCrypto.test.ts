process.env.PLAJAH_PHI_TEST = '1';
import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../services/clinic/phi/phiCrypto';
import { PhiError } from '../services/clinic/phi/types';

const CLINIC = 'uid1__biz1';
const PASS = 'correct horse battery staple';
const rec = (id = 'r1', kind = 'appointment', keyId = 'k1', rev = 1) => C.recordAad(CLINIC, id, kind, keyId, rev);
async function throwsCode(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (e: any) => e instanceof PhiError && e.code === code, `expected PhiError(${code})`);
}

describe('PHI crypto', () => {
  before(() => C.__useFastKdfForTests(1000));

  test('the fast-KDF switch refuses to work outside a test process', () => {
    const saved = process.env.PLAJAH_PHI_TEST; delete process.env.PLAJAH_PHI_TEST;
    assert.throws(() => C.__useFastKdfForTests(10));
    process.env.PLAJAH_PHI_TEST = saved;
  });

  describe('record encryption', () => {
    test('round-trips, and the ciphertext does not contain the plaintext', async () => {
      const dek = await C.generateDataKey(false);
      const data = { patientName: 'Elena Rostova', dob: '1989-05-14', note: 'lisinopril 10mg' };
      const s = await C.sealJson(dek, data, rec());
      assert.deepEqual(await C.openJson(dek, s, rec()), data);
      const wire = JSON.stringify(s);
      for (const secret of ['Elena', 'Rostova', '1989', 'lisinopril']) assert.ok(!wire.includes(secret), `leaked ${secret}`);
    });

    test('every encryption uses a fresh IV (same data → different ciphertext)', async () => {
      const dek = await C.generateDataKey(false);
      const a = await C.sealJson(dek, { x: 1 }, rec()), b = await C.sealJson(dek, { x: 1 }, rec());
      assert.notEqual(a.iv, b.iv); assert.notEqual(a.ct, b.ct);
    });

    test('tampering with a single byte is detected', async () => {
      const dek = await C.generateDataKey(false);
      const s = await C.sealJson(dek, { x: 'secret' }, rec());
      const bytes = C.b64.dec(s.ct); bytes[3] ^= 1;
      await throwsCode(() => C.openJson(dek, { ...s, ct: C.b64.enc(bytes) }, rec()), 'decrypt-failed');
    });

    test('a ciphertext cannot be moved to another record, kind, clinic, key id or revision', async () => {
      const dek = await C.generateDataKey(false);
      const s = await C.sealJson(dek, { x: 1 }, rec('r1', 'appointment', 'k1', 1));
      await throwsCode(() => C.openJson(dek, s, rec('r2', 'appointment', 'k1', 1)), 'decrypt-failed');      // other record
      await throwsCode(() => C.openJson(dek, s, rec('r1', 'intake', 'k1', 1)), 'decrypt-failed');           // other kind
      await throwsCode(() => C.openJson(dek, s, rec('r1', 'appointment', 'k2', 1)), 'decrypt-failed');      // other key id
      await throwsCode(() => C.openJson(dek, s, rec('r1', 'appointment', 'k1', 2)), 'decrypt-failed');      // other revision
      await throwsCode(() => C.openJson(dek, s, C.recordAad('other__clinic', 'r1', 'appointment', 'k1', 1)), 'decrypt-failed'); // other clinic
    });

    test('the wrong key never decrypts', async () => {
      const a = await C.generateDataKey(false), b = await C.generateDataKey(false);
      const s = await C.sealJson(a, { x: 1 }, rec());
      await throwsCode(() => C.openJson(b, s, rec()), 'decrypt-failed');
    });
  });

  describe('passphrases', () => {
    test('weak passphrases are rejected', () => {
      for (const weak of ['short', 'aaaaaaaaaaaaaaaa', 'password12345', '12345678901', 'qwertyuiop1234']) {
        assert.throws(() => C.checkPassphrase(weak), (e: any) => e.code === 'weak-passphrase', weak);
      }
      assert.doesNotThrow(() => C.checkPassphrase(PASS));
    });

    test('the right passphrase unlocks, the wrong one does not', async () => {
      const keys = await C.createMemberKeys(CLINIC, 'u1', PASS);
      const key = await C.unlockMemberKey(CLINIC, 'u1', keys.wrappedPriv, PASS);
      assert.ok(key);
      await throwsCode(() => C.unlockMemberKey(CLINIC, 'u1', keys.wrappedPriv, PASS + 'x'), 'wrong-passphrase');
      // sealed to this member and clinic: moving it to another uid or clinic fails
      await throwsCode(() => C.unlockMemberKey(CLINIC, 'u2', keys.wrappedPriv, PASS), 'wrong-passphrase');
      await throwsCode(() => C.unlockMemberKey('x__y', 'u1', keys.wrappedPriv, PASS), 'wrong-passphrase');
    });

    test('a stored key protected by a downgraded work factor is refused', async () => {
      const keys = await C.createMemberKeys(CLINIC, 'u1', PASS);
      await throwsCode(() => C.unlockMemberKey(CLINIC, 'u1', { ...keys.wrappedPriv, iter: 10 }, PASS), 'decrypt-failed');
    });

    test('changing the passphrase keeps the same key pair', async () => {
      const keys = await C.createMemberKeys(CLINIC, 'u1', PASS);
      const dek = await C.generateDataKey(true);
      const grant = await C.wrapDataKeyFor(CLINIC, 'front', 'k1', 'u1', keys.pub, dek);
      const next = await C.changeMemberPassphrase(CLINIC, 'u1', keys.wrappedPriv, PASS, 'a brand new passphrase!');
      await throwsCode(() => C.unlockMemberKey(CLINIC, 'u1', next, PASS), 'wrong-passphrase');
      const priv = await C.unlockMemberKey(CLINIC, 'u1', next, 'a brand new passphrase!');
      const opened = await C.unwrapDataKey(CLINIC, 'front', 'u1', grant, priv, false);   // the OLD grant still opens
      const s = await C.sealJson(dek, { ok: true }, rec());
      assert.deepEqual(await C.openJson(opened, s, rec()), { ok: true });
    });
  });

  describe('key grants', () => {
    test('a member opens a grant addressed to them and can read what the owner wrote', async () => {
      const owner = await C.createMemberKeys(CLINIC, 'owner', PASS);
      const nurse = await C.createMemberKeys(CLINIC, 'nurse', 'nurse passphrase 1234');
      const dek = await C.generateDataKey(true);
      const s = await C.sealJson(dek, { patientName: 'David Miller' }, rec());
      const grant = await C.wrapDataKeyFor(CLINIC, 'front', 'k1', 'nurse', nurse.pub, dek);
      const opened = await C.unwrapDataKey(CLINIC, 'front', 'nurse', grant, nurse.privateKey, false);
      assert.deepEqual(await C.openJson(opened, s, rec()), { patientName: 'David Miller' });
      void owner;
    });

    test('nobody else can open it, and it cannot be re-addressed', async () => {
      const nurse = await C.createMemberKeys(CLINIC, 'nurse', 'nurse passphrase 1234');
      const other = await C.createMemberKeys(CLINIC, 'other', 'other passphrase 1234');
      const dek = await C.generateDataKey(true);
      const grant = await C.wrapDataKeyFor(CLINIC, 'front', 'k1', 'nurse', nurse.pub, dek);
      await throwsCode(() => C.unwrapDataKey(CLINIC, 'front', 'nurse', grant, other.privateKey, false), 'decrypt-failed');   // wrong private key
      await throwsCode(() => C.unwrapDataKey(CLINIC, 'front', 'other', grant, nurse.privateKey, false), 'decrypt-failed');   // claimed for someone else
      await throwsCode(() => C.unwrapDataKey(CLINIC, 'clinical', 'nurse', grant, nurse.privateKey, false), 'decrypt-failed'); // a front grant is not a clinical grant
      await throwsCode(() => C.unwrapDataKey('x__y', 'front', 'nurse', grant, nurse.privateKey, false), 'decrypt-failed');    // another clinic
    });

    test('non-extractable unless the member may grant onward', async () => {
      const m = await C.createMemberKeys(CLINIC, 'm', PASS);
      const dek = await C.generateDataKey(true);
      const grant = await C.wrapDataKeyFor(CLINIC, 'front', 'k1', 'm', m.pub, dek);
      const sealedOnly = await C.unwrapDataKey(CLINIC, 'front', 'm', grant, m.privateKey, false);
      await assert.rejects(() => C.exportDataKey(sealedOnly));
      const grantor = await C.unwrapDataKey(CLINIC, 'front', 'm', grant, m.privateKey, true);
      assert.equal((await C.exportDataKey(grantor)).length, 32);
    });
  });

  describe('recovery key', () => {
    test('has the documented shape and is random', () => {
      const a = C.generateRecoveryKey(), b = C.generateRecoveryKey();
      assert.match(a, /^([A-HJ-NP-Z2-9]{4}-){12}[A-HJ-NP-Z2-9]{4}$/);
      assert.notEqual(a, b);
    });

    test('recovery opens the data key for the owner; a wrong or malformed key does not', async () => {
      const dek = await C.generateDataKey(true);
      const rec0 = await C.createRecovery(CLINIC);
      // An admin (who never sees the recovery key) can wrap a data key for recovery using only the public half…
      const grant = await C.wrapDataKeyFor(CLINIC, 'clinical', 'k9', C.RECOVERY_UID, rec0.pub, dek);
      // …and the owner, holding only the recovery key, can open it.
      const priv = await C.openRecoveryPrivateKey(CLINIC, rec0.sealedPriv, rec0.recoveryKey.toLowerCase().replace(/-/g, ' '));   // tolerant of case and spacing
      const back = await C.unwrapDataKey(CLINIC, 'clinical', C.RECOVERY_UID, grant, priv, true);
      const s = await C.sealJson(dek, { dx: 'I10' }, rec());
      assert.deepEqual(await C.openJson(back, s, rec()), { dx: 'I10' });
      await throwsCode(() => C.openRecoveryPrivateKey(CLINIC, rec0.sealedPriv, C.generateRecoveryKey()), 'bad-recovery-key');
      await throwsCode(() => C.openRecoveryPrivateKey(CLINIC, rec0.sealedPriv, 'not-a-key'), 'bad-recovery-key');
      await throwsCode(() => C.openRecoveryPrivateKey('x__y', rec0.sealedPriv, rec0.recoveryKey), 'bad-recovery-key');   // other clinic
    });

    test('a wrap added long after setup (e.g. after a key rotation) still opens with the original recovery key', async () => {
      const rec0 = await C.createRecovery(CLINIC);
      const newer = await C.generateDataKey(true);
      const later = await C.wrapDataKeyFor(CLINIC, 'front', 'k-after-rotation', C.RECOVERY_UID, rec0.pub, newer);
      const priv = await C.openRecoveryPrivateKey(CLINIC, rec0.sealedPriv, rec0.recoveryKey);
      const back = await C.unwrapDataKey(CLINIC, 'front', C.RECOVERY_UID, later, priv, false);
      const s = await C.sealJson(newer, { ok: 1 }, rec());
      assert.deepEqual(await C.openJson(back, s, rec()), { ok: 1 });
    });
  });

  test('sha256Hex is the standard digest', async () => {
    assert.equal(await C.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
