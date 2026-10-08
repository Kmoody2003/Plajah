// Evaluates firestore.phi.rules with the Firebase Rules REST `:test` API — read-only, deploys nothing.
// The test API can't express timestamps, so for the run only we swap `is timestamp`→`is string` and
// `request.time`→'NOW' (the logic under test is unchanged). Usage: node scripts/testPhiRules.mjs
import fs from 'node:fs';
import os from 'node:os';
const PROJECT = 'gen-lang-client-0665118474';
const cfgPath = os.homedir() + '/.config/configstore/firebase-tools.json';
const tok = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const src = fs.readFileSync(new URL('../firestore.phi.rules', import.meta.url), 'utf8')
  .replaceAll('is timestamp', 'is string').replaceAll('request.time', "'NOW'");

const DB = '/databases/(default)/documents';
const C = 'c1', OWN = 'own', ADM = 'adm', PRO = 'pro', STF = 'stf', BIL = 'bil', SUS = 'sus', OUT = 'out';
const mem = (uid, role, status = 'ACTIVE', extra = {}) => ({ uid, role, status, addedBy: OWN, createdAt: 't', updatedAt: 't', ...extra });
const members = { [OWN]: mem(OWN, 'OWNER'), [ADM]: mem(ADM, 'ADMIN'), [PRO]: mem(PRO, 'PROVIDER'), [STF]: mem(STF, 'STAFF'), [BIL]: mem(BIL, 'BILLER'), [SUS]: mem(SUS, 'STAFF', 'SUSPENDED') };
const KEYS = { pub: 'P'.repeat(90), wrappedPriv: { salt: 's', iter: 600000, iv: 'i', ct: 'c' } };
const mp = (u) => `${DB}/clinics/${C}/members/${u}`;
const ap = (id) => `${DB}/clinics/${C}/audit/${id}`;
const auditDoc = (uid, extra = {}) => ({ actorUid: uid, action: 'CREATE_RECORD', kind: 'soap', recordId: 'rec_000001', at: 'NOW', sid: 's1', seq: 1, prev: '', hash: 'h'.repeat(64), ...extra });

function mocks(audit) {
  const m = [];
  for (const [u, d] of Object.entries(members)) {
    m.push({ function: 'get', args: [{ exactValue: mp(u) }], result: { value: { data: d } } });
    m.push({ function: 'exists', args: [{ exactValue: mp(u) }], result: { value: true } });
  }
  m.push({ function: 'exists', args: [{ exactValue: mp(OUT) }], result: { value: false } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/clinics/${C}` }], result: { value: { data: { ownerUid: OWN } } } });
  if (audit) m.push({ function: 'getAfter', args: [{ exactValue: ap('aud1') }], result: { value: { data: audit } } });
  return m;
}

const rec = (o = {}) => ({ kind: 'soap', rev: 1, keyId: 'key12345', iv: 'a'.repeat(16), ct: 'c'.repeat(40), authorUid: PRO, updatedBy: PRO, createdAt: 'NOW', updatedAt: 'NOW', locked: false, auditId: 'aud1', day: '2026-10-03', ...o });
const cases = [];
const t = (name, expect, uid, method, path, { data, existing, audit } = {}) => cases.push({ name, expect, uid, method, path, data, existing, audit });
const R = (id) => `${DB}/clinics/${C}/records/${id}`;

// reads
t('owner reads soap', 'ALLOW', OWN, 'get', R('rec_000001'), { existing: rec() });
t('provider reads soap', 'ALLOW', PRO, 'get', R('rec_000001'), { existing: rec() });
t('admin cannot read soap', 'DENY', ADM, 'get', R('rec_000001'), { existing: rec() });
t('staff cannot read soap', 'DENY', STF, 'get', R('rec_000001'), { existing: rec() });
t('biller cannot read soap', 'DENY', BIL, 'get', R('rec_000001'), { existing: rec() });
t('staff reads appointment', 'ALLOW', STF, 'get', R('rec_000001'), { existing: rec({ kind: 'appointment' }) });
t('staff cannot read superbill', 'DENY', STF, 'get', R('rec_000001'), { existing: rec({ kind: 'superbill' }) });
t('biller reads superbill', 'ALLOW', BIL, 'get', R('rec_000001'), { existing: rec({ kind: 'superbill' }) });
t('suspended cannot read appointment', 'DENY', SUS, 'get', R('rec_000001'), { existing: rec({ kind: 'appointment' }) });
t('outsider cannot read', 'DENY', OUT, 'get', R('rec_000001'), { existing: rec({ kind: 'appointment' }) });
t('anonymous cannot read', 'DENY', null, 'get', R('rec_000001'), { existing: rec({ kind: 'appointment' }) });

// creates
const okAudit = auditDoc(PRO);
t('provider creates soap', 'ALLOW', PRO, 'create', R('rec_000001'), { data: rec(), audit: okAudit });
t('staff cannot create soap', 'DENY', STF, 'create', R('rec_000001'), { data: rec({ authorUid: STF, updatedBy: STF }), audit: auditDoc(STF) });
t('staff creates appointment', 'ALLOW', STF, 'create', R('rec_000001'), { data: rec({ kind: 'appointment', authorUid: STF, updatedBy: STF }), audit: auditDoc(STF, { kind: 'appointment' }) });
t('biller cannot create appointment', 'DENY', BIL, 'create', R('rec_000001'), { data: rec({ kind: 'appointment', authorUid: BIL, updatedBy: BIL }), audit: auditDoc(BIL, { kind: 'appointment' }) });
t('create without matching audit recordId', 'DENY', PRO, 'create', R('rec_000001'), { data: rec(), audit: auditDoc(PRO, { recordId: 'other' }) });
t("create with someone else's audit", 'DENY', PRO, 'create', R('rec_000001'), { data: rec(), audit: auditDoc(OWN) });
t('create impersonating author', 'DENY', PRO, 'create', R('rec_000001'), { data: rec({ authorUid: OWN }), audit: okAudit });
t('create with rev 2', 'DENY', PRO, 'create', R('rec_000001'), { data: rec({ rev: 2 }), audit: okAudit });
t('create with extra field', 'DENY', PRO, 'create', R('rec_000001'), { data: rec({ patientName: 'Jane' }), audit: okAudit });
t('create with bad iv length', 'DENY', PRO, 'create', R('rec_000001'), { data: rec({ iv: 'x' }), audit: okAudit });
t('create locked w/o contentSha', 'DENY', PRO, 'create', R('rec_000001'), { data: rec({ locked: true }), audit: okAudit });
t('create locked with contentSha', 'ALLOW', PRO, 'create', R('rec_000001'), { data: rec({ locked: true, contentSha: 'a'.repeat(64) }), audit: okAudit });
t('bad record id', 'DENY', PRO, 'create', R('x'), { data: rec(), audit: auditDoc(PRO, { recordId: 'x' }) });

// updates
t('provider updates soap rev+1', 'ALLOW', PRO, 'update', R('rec_000001'), { data: rec({ rev: 2, updatedBy: PRO }), existing: rec(), audit: auditDoc(PRO, { action: 'UPDATE_RECORD' }) });
t('update rev+2', 'DENY', PRO, 'update', R('rec_000001'), { data: rec({ rev: 3 }), existing: rec(), audit: okAudit });
t('update same rev', 'DENY', PRO, 'update', R('rec_000001'), { data: rec({ rev: 1 }), existing: rec(), audit: okAudit });
t('update locked record', 'DENY', PRO, 'update', R('rec_000001'), { data: rec({ rev: 2 }), existing: rec({ locked: true, contentSha: 'a'.repeat(64) }), audit: okAudit });
t('update changes kind', 'DENY', PRO, 'update', R('rec_000001'), { data: rec({ rev: 2, kind: 'appointment' }), existing: rec(), audit: okAudit });
t('staff updates soap', 'DENY', STF, 'update', R('rec_000001'), { data: rec({ rev: 2, updatedBy: STF }), existing: rec(), audit: auditDoc(STF) });
t('update changes author', 'DENY', PRO, 'update', R('rec_000001'), { data: rec({ rev: 2, authorUid: OWN }), existing: rec(), audit: okAudit });
t('owner key-rotation write w/ KEY_ROTATE audit', 'ALLOW', OWN, 'update', R('rec_000001'), { data: rec({ rev: 2, updatedBy: OWN, keyId: 'newkey123' }), existing: rec(), audit: auditDoc(OWN, { action: 'KEY_ROTATE', recordId: '', kind: '' }) });
t('provider cannot piggyback KEY_ROTATE', 'DENY', PRO, 'update', R('rec_000001'), { data: rec({ rev: 2, updatedBy: PRO }), existing: rec(), audit: auditDoc(PRO, { action: 'KEY_ROTATE', recordId: '', kind: '' }) });
t('delete record', 'DENY', OWN, 'delete', R('rec_000001'), { existing: rec() });

// audit
const A = (id) => `${DB}/clinics/${C}/audit/${id}`;
t('owner reads audit', 'ALLOW', OWN, 'get', A('aud1'), { existing: auditDoc(PRO) });
t('admin reads audit', 'ALLOW', ADM, 'get', A('aud1'), { existing: auditDoc(PRO) });
t('provider cannot read audit', 'DENY', PRO, 'get', A('aud1'), { existing: auditDoc(PRO) });
t('provider creates own audit', 'ALLOW', PRO, 'create', A('aud2'), { data: auditDoc(PRO) });
t('audit as someone else', 'DENY', PRO, 'create', A('aud2'), { data: auditDoc(OWN) });
t('audit update', 'DENY', OWN, 'update', A('aud1'), { data: auditDoc(OWN), existing: auditDoc(OWN) });
t('audit delete', 'DENY', OWN, 'delete', A('aud1'), { existing: auditDoc(OWN) });
t('staff forges MEMBER_ADD audit', 'DENY', STF, 'create', A('aud2'), { data: auditDoc(STF, { action: 'MEMBER_ADD' }) });
t('audit with extra field', 'DENY', PRO, 'create', A('aud2'), { data: auditDoc(PRO, { note: 'x' }) });
t('audit with unknown action', 'DENY', OWN, 'create', A('aud2'), { data: auditDoc(OWN, { action: 'WHATEVER' }) });

// members
const M = (u) => `${DB}/clinics/${C}/members/${u}`;
const newMember = (uid, role, extra = {}) => ({ uid, role, status: 'ACTIVE', addedBy: OWN, createdAt: 'NOW', updatedAt: 'NOW', auditId: 'aud1', ...extra });
const addAudit = (uid) => auditDoc(uid, { action: 'MEMBER_ADD', kind: '', recordId: 'newu' });
t('owner invites staff', 'ALLOW', OWN, 'create', M('newu'), { data: newMember('newu', 'STAFF'), audit: addAudit(OWN) });
t('admin invites provider', 'ALLOW', ADM, 'create', M('newu'), { data: newMember('newu', 'PROVIDER', { addedBy: ADM }), audit: addAudit(ADM) });
t('admin cannot invite admin', 'DENY', ADM, 'create', M('newu'), { data: newMember('newu', 'ADMIN', { addedBy: ADM }), audit: addAudit(ADM) });
t('admin cannot invite owner', 'DENY', ADM, 'create', M('newu'), { data: newMember('newu', 'OWNER', { addedBy: ADM }), audit: addAudit(ADM) });
t('provider cannot invite', 'DENY', PRO, 'create', M('newu'), { data: newMember('newu', 'STAFF', { addedBy: PRO }), audit: addAudit(PRO) });
t('invite with keys pre-set', 'DENY', OWN, 'create', M('newu'), { data: newMember('newu', 'STAFF', KEYS), audit: addAudit(OWN) });
t('invite without audit', 'DENY', OWN, 'create', M('newu'), { data: newMember('newu', 'STAFF'), audit: auditDoc(PRO, { action: 'MEMBER_ADD' }) });
t('staff self-enrolls', 'ALLOW', STF, 'update', M(STF), { data: { ...members[STF], ...KEYS, updatedAt: 'NOW', auditId: 'aud1' }, existing: members[STF], audit: auditDoc(STF, { action: 'MEMBER_ENROLL', kind: '', recordId: STF }) });
t('staff cannot swap in a new key pair once keyed', 'DENY', STF, 'update', M(STF), { data: { ...members[STF], ...KEYS, pub: 'Q'.repeat(90), updatedAt: 'NOW', auditId: 'aud1' }, existing: { ...members[STF], ...KEYS }, audit: auditDoc(STF, { action: 'MEMBER_ENROLL', kind: '', recordId: STF }) });
t('staff escalates own role', 'DENY', STF, 'update', M(STF), { data: { ...members[STF], role: 'OWNER', updatedAt: 'NOW', auditId: 'aud1' }, existing: members[STF], audit: auditDoc(STF, { action: 'MEMBER_ROLE', kind: '', recordId: STF }) });
t('owner suspends staff', 'ALLOW', OWN, 'update', M(STF), { data: { ...members[STF], status: 'SUSPENDED', updatedAt: 'NOW', auditId: 'aud1' }, existing: members[STF], audit: auditDoc(OWN, { action: 'MEMBER_SUSPEND', kind: '', recordId: STF }) });
t('admin suspends owner', 'DENY', ADM, 'update', M(OWN), { data: { ...members[OWN], status: 'SUSPENDED', updatedAt: 'NOW', auditId: 'aud1' }, existing: members[OWN], audit: auditDoc(ADM, { action: 'MEMBER_SUSPEND', kind: '', recordId: OWN }) });
t('admin promotes staff to admin', 'DENY', ADM, 'update', M(STF), { data: { ...members[STF], role: 'ADMIN', updatedAt: 'NOW', auditId: 'aud1' }, existing: members[STF], audit: auditDoc(ADM, { action: 'MEMBER_ROLE', kind: '', recordId: STF }) });
t('owner cannot suspend self', 'DENY', OWN, 'update', M(OWN), { data: { ...members[OWN], status: 'SUSPENDED', updatedAt: 'NOW', auditId: 'aud1' }, existing: members[OWN], audit: auditDoc(OWN, { action: 'MEMBER_SUSPEND', kind: '', recordId: OWN }) });
t('suspended user cannot update', 'DENY', SUS, 'update', M(SUS), { data: { ...members[SUS], ...KEYS, updatedAt: 'NOW', auditId: 'aud1' }, existing: members[SUS], audit: auditDoc(SUS, { action: 'MEMBER_ENROLL', kind: '', recordId: SUS }) });
t('staff reads self', 'ALLOW', STF, 'get', M(STF), { existing: members[STF] });
t('suspended reads self', 'ALLOW', SUS, 'get', M(SUS), { existing: members[SUS] });
t('staff reads colleague', 'DENY', STF, 'get', M(PRO), { existing: members[PRO] });
t('admin reads member', 'ALLOW', ADM, 'get', M(STF), { existing: members[STF] });
t('delete member', 'DENY', OWN, 'delete', M(STF), { existing: members[STF] });

// founder bootstrap
const clinicPath = (id) => `${DB}/clinics/${id}`;
t('founder creates clinic', 'ALLOW', 'u1', 'create', clinicPath('u1__biz'), { data: { ownerUid: 'u1', name: 'X', createdAt: 'NOW', ver: 1 } });
t('cannot create clinic under another uid', 'DENY', 'u2', 'create', clinicPath('u1__biz'), { data: { ownerUid: 'u2', name: 'X', createdAt: 'NOW', ver: 1 } });
t('cannot claim other owner', 'DENY', 'u1', 'create', clinicPath('u1__biz'), { data: { ownerUid: 'u2', name: 'X', createdAt: 'NOW', ver: 1 } });
t('list clinics', 'DENY', OWN, 'list', `${DB}/clinics`);

// grants
const G = (u, d) => `${DB}/clinics/${C}/grants/${u}_${d}`;
const wrap = { keyId: 'k1', epk: 'e', salt: 's', iv: 'i', ct: 'c' };
const grant = (uid, domain, by, extra = {}) => ({ uid, domain, wraps: [wrap], grantedBy: by, updatedAt: 'NOW', auditId: 'aud1', ...extra });
const grantAudit = (uid) => auditDoc(uid, { action: 'KEY_GRANT', kind: '', recordId: 'x' });
t('member reads own grant', 'ALLOW', STF, 'get', G(STF, 'front'), { existing: grant(STF, 'front', OWN) });
t('member reads other grant', 'DENY', STF, 'get', G(PRO, 'front'), { existing: grant(PRO, 'front', OWN) });
t('owner grants clinical to provider', 'ALLOW', OWN, 'create', G(PRO, 'clinical'), { data: grant(PRO, 'clinical', OWN), audit: grantAudit(OWN) });
t('owner grants clinical to staff', 'DENY', OWN, 'create', G(STF, 'clinical'), { data: grant(STF, 'clinical', OWN), audit: grantAudit(OWN) });
t('admin grants front to staff', 'ALLOW', ADM, 'create', G(STF, 'front'), { data: grant(STF, 'front', ADM), audit: grantAudit(ADM) });
t('admin grants clinical to provider', 'DENY', ADM, 'create', G(PRO, 'clinical'), { data: grant(PRO, 'clinical', ADM), audit: grantAudit(ADM) });
t('staff grants itself clinical', 'DENY', STF, 'create', G(STF, 'clinical'), { data: grant(STF, 'clinical', STF), audit: grantAudit(STF) });
t('grant to suspended', 'DENY', OWN, 'create', G(SUS, 'front'), { data: grant(SUS, 'front', OWN), audit: grantAudit(OWN) });
t('grant id mismatch', 'DENY', OWN, 'create', G(PRO, 'front'), { data: grant(PRO, 'clinical', OWN), audit: grantAudit(OWN) });
t('owner deletes grant', 'ALLOW', OWN, 'delete', G(STF, 'front'), { existing: grant(STF, 'front', OWN) });
t('admin deletes clinical grant', 'DENY', ADM, 'delete', G(PRO, 'clinical'), { existing: grant(PRO, 'clinical', OWN) });
t('provider deletes grant', 'DENY', PRO, 'delete', G(STF, 'front'), { existing: grant(STF, 'front', OWN) });

t('later rotation batch re-uses earlier KEY_ROTATE audit', 'ALLOW', OWN, 'create', G(PRO, 'clinical'), { data: grant(PRO, 'clinical', OWN), audit: auditDoc(OWN, { action: 'KEY_ROTATE', kind: '', recordId: '', at: 'EARLIER' }) });
t('provider cannot reuse old audit entry for a grant', 'DENY', PRO, 'create', G(PRO, 'front'), { data: grant(PRO, 'front', PRO), audit: auditDoc(PRO, { action: 'KEY_ROTATE', kind: '', recordId: '', at: 'EARLIER' }) });
t('owner cannot reuse an old non-rotation audit entry', 'DENY', OWN, 'create', G(PRO, 'clinical'), { data: grant(PRO, 'clinical', OWN), audit: auditDoc(OWN, { action: 'KEY_GRANT', kind: '', recordId: '', at: 'EARLIER' }) });

// vault
const V = (d) => `${DB}/clinics/${C}/vault/${d}`;
t('owner reads recovery', 'ALLOW', OWN, 'get', V('recovery'), { existing: { pub: 'p' } });
t('staff reads recovery', 'DENY', STF, 'get', V('recovery'), { existing: { pub: 'p' } });
t('owner reads clinical recwrap', 'ALLOW', OWN, 'get', V('recwrap-clinical'), { existing: { domain: 'clinical' } });
t('admin reads clinical recwrap', 'DENY', ADM, 'get', V('recwrap-clinical'), { existing: { domain: 'clinical' } });
t('owner writes recovery', 'ALLOW', OWN, 'update', V('recovery'), { data: { pub: 'p', sealedPriv: { iv: 'i', ct: 'c' }, createdAt: 'NOW', updatedAt: 'NOW', auditId: 'aud1' }, existing: { pub: 'p' }, audit: auditDoc(OWN, { action: 'VAULT_RECOVER', kind: '', recordId: '' }) });
t('admin writes recovery', 'DENY', ADM, 'update', V('recovery'), { data: { pub: 'p', sealedPriv: { iv: 'i', ct: 'c' }, createdAt: 'NOW', updatedAt: 'NOW', auditId: 'aud1' }, existing: { pub: 'p' }, audit: auditDoc(ADM, { action: 'VAULT_RECOVER' }) });
t('admin writes front recwrap', 'ALLOW', ADM, 'update', V('recwrap-front'), { data: { domain: 'front', wraps: [wrap], updatedAt: 'NOW', auditId: 'aud1' }, existing: { domain: 'front' }, audit: auditDoc(ADM, { action: 'KEY_ROTATE', kind: '', recordId: '' }) });
t('admin writes clinical recwrap', 'DENY', ADM, 'update', V('recwrap-clinical'), { data: { domain: 'clinical', wraps: [wrap], updatedAt: 'NOW', auditId: 'aud1' }, existing: { domain: 'clinical' }, audit: auditDoc(ADM, { action: 'KEY_ROTATE' }) });

// default deny
t('unknown collection', 'DENY', OWN, 'get', `${DB}/secrets/x`, { existing: { a: 1 } });
t('unknown subcollection', 'DENY', OWN, 'get', `${DB}/clinics/${C}/notes/x`, { existing: { a: 1 } });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.uid) req.auth = { uid: c.uid, token: {} };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks(c.audit) };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
if (out.issues?.length) console.log('ISSUES', JSON.stringify(out.issues, null, 1).slice(0, 3000));
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
});
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
