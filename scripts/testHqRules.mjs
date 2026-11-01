// Evaluates the Content HQ part of firestore.ops.rules with the Firebase Rules REST `:test` API — read-only,
// deploys nothing. Usage: node scripts/testHqRules.mjs
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const src = fs.readFileSync(new URL('../firestore.ops.rules', import.meta.url), 'utf8');

const DB = '/databases/(default)/documents';
const ORG = 'org1', OTHER = 'org2';
const OWNER = 'owner', ADMIN = 'admin', STAFF = 'staff', IT = 'it', AUTHOR = 'author', GRANTEE = 'grantee', OUT = 'outsider';
const orgs = {
  [ORG]: { creatorId: OWNER, admins: [ADMIN], staffUids: [STAFF], itAdminUids: [IT] },
  [OTHER]: { creatorId: 'otherOwner', admins: ['otherAdmin'], staffUids: [], itAdminUids: [] },
};
const openFile = { id: 'open1', scopeKind: 'org', scopeId: ORG, uploadedByUid: AUTHOR, name: 'a.pdf', storagePath: `protected-hq/org/${ORG}/open1/a.pdf`, scanStatus: 'CLEAN', scannedAt: 1 };
const locked = { ...openFile, id: 'lock1', access: 'restricted', accessUids: [GRANTEE] };
const personal = { id: 'mine1', scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, name: 'm.pdf', storagePath: `protected-hq/user/${AUTHOR}/mine1/m.pdf` };
const assets = { open1: openFile, lock1: locked, mine1: personal };

function mocks() {
  const m = [];
  for (const [id, data] of Object.entries(orgs)) {
    m.push({ function: 'get', args: [{ exactValue: `${DB}/organizations/${id}` }], result: { value: { data } } });
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/organizations/${id}` }], result: { value: true } });
  }
  for (const [id, data] of Object.entries(assets)) {
    m.push({ function: 'get', args: [{ exactValue: `${DB}/orgAssets/${id}` }], result: { value: { data } } });
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/orgAssets/${id}` }], result: { value: true } });
  }
  m.push({ function: 'exists', args: [{ anyValue: {} }], result: { value: false } });
  return m;
}

const cases = [];
const t = (name, expect, uid, method, path, { data, existing } = {}) => cases.push({ name, expect, uid, method, path, data, existing });
const A = id => `${DB}/orgAssets/${id}`;

// Reading
t('outsider cannot read an org file', 'DENY', OUT, 'get', A('open1'), { existing: openFile });
t('signed out cannot read an org file', 'DENY', null, 'get', A('open1'), { existing: openFile });
t("another org's admin cannot read it", 'DENY', 'otherAdmin', 'get', A('open1'), { existing: openFile });
t('org admin reads an open file', 'ALLOW', ADMIN, 'get', A('open1'), { existing: openFile });
t('org staff reads an open file', 'ALLOW', STAFF, 'get', A('open1'), { existing: openFile });
t('nobody can list orgAssets directly', 'DENY', ADMIN, 'list', `${DB}/orgAssets`, {});
t('an outsider cannot list orgAssets', 'DENY', OUT, 'list', `${DB}/orgAssets`, {});
t("someone else cannot read a person's file", 'DENY', OUT, 'get', A('mine1'), { existing: personal });
t("an org's owner cannot read a member's personal file", 'DENY', OWNER, 'get', A('mine1'), { existing: personal });
t('the person reads their own file', 'ALLOW', AUTHOR, 'get', A('mine1'), { existing: personal });

// Restricted files
t('grantee reads a restricted file', 'ALLOW', GRANTEE, 'get', A('lock1'), { existing: locked });
t('org admin cannot read a restricted file', 'DENY', ADMIN, 'get', A('lock1'), { existing: locked });
t('IT Admin reads a restricted file', 'ALLOW', IT, 'get', A('lock1'), { existing: locked });
t('outsider cannot read a restricted file', 'DENY', OUT, 'get', A('lock1'), { existing: locked });

// A grant is read-only
t('grantee cannot change the file', 'DENY', GRANTEE, 'update', A('lock1'), { existing: locked, data: { ...locked, name: 'x.pdf' } });
t('grantee cannot delete the file', 'DENY', GRANTEE, 'delete', A('lock1'), { existing: locked });
t('grantee cannot add a version', 'DENY', GRANTEE, 'create', `${DB}/hqAssetVersions/v9`, { data: { assetId: 'lock1', uploadedByUid: GRANTEE, storagePath: `protected-hq/org/${ORG}/lock1/x` } });
t('grantee cannot make an outside share link', 'DENY', GRANTEE, 'create', `${DB}/hqShareLinks/s9`, { data: { assetId: 'lock1', createdByUid: GRANTEE } });
t('grantee can comment', 'ALLOW', GRANTEE, 'create', `${DB}/hqComments/c9`, { data: { assetId: 'lock1', authorUid: GRANTEE, body: 'hi' } });
t('author changes their restricted file', 'ALLOW', AUTHOR, 'update', A('lock1'), { existing: locked, data: { ...locked, name: 'y.pdf' } });

// Giving yourself access, or someone else's bytes
t('nobody can grant themselves access', 'DENY', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, accessUids: [ADMIN] } });
t('a file cannot be moved to another org', 'DENY', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, scopeId: OTHER } });
t("a record cannot claim another org's object", 'DENY', AUTHOR, 'create', A('evil1'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, storagePath: `protected-hq/org/${ORG}/open1/a.pdf` } });
t('a record cannot be repointed later', 'DENY', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, storagePath: `protected-hq/org/${OTHER}/x/y.pdf` } });
t('a person files into their own space', 'ALLOW', AUTHOR, 'create', A('ok1'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, storagePath: `protected-hq/user/${AUTHOR}/ok1/a.pdf` } });
t("nobody files into another person's space", 'DENY', OUT, 'create', A('bad1'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: OUT, storagePath: `protected-hq/user/${AUTHOR}/bad1/a.pdf` } });
t("an outsider cannot file into an org", 'DENY', OUT, 'create', A('bad2'), { data: { scopeKind: 'org', scopeId: ORG, uploadedByUid: OUT, storagePath: `protected-hq/org/${ORG}/bad2/a.pdf` } });
t("an upload cannot impersonate its author", 'DENY', STAFF, 'create', A('bad3'), { data: { scopeKind: 'org', scopeId: ORG, uploadedByUid: AUTHOR, storagePath: `protected-hq/org/${ORG}/bad3/a.pdf` } });

// The security scan
t('a client cannot mark a file clean', 'DENY', ADMIN, 'update', A('open1'), { existing: { ...openFile, scanStatus: 'QUARANTINED' }, data: { ...openFile, scanStatus: 'CLEAN' } });
t('a client cannot stamp a scan time', 'DENY', AUTHOR, 'create', A('bad4'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, scannedAt: 1, scanStatus: 'CLEAN', storagePath: `protected-hq/user/${AUTHOR}/bad4/a.pdf` } });
t('a new version goes back to scanning', 'ALLOW', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, scanStatus: 'PENDING' } });

// Everything attached to a file
for (const coll of ['hqAssetVersions', 'hqComments', 'hqActivity', 'hqShareLinks', 'hqGuestDecisions']) {
  t(`outsider cannot read ${coll}`, 'DENY', OUT, 'get', `${DB}/${coll}/x`, { existing: { assetId: 'open1' } });
}
t('share links are hidden from a grantee', 'DENY', GRANTEE, 'get', `${DB}/hqShareLinks/x`, { existing: { assetId: 'lock1' } });
t('the audit log is closed to everyone', 'DENY', OWNER, 'get', `${DB}/hqAuditLog/x`, { existing: { assetId: 'open1' } });

const body = {
  source: { files: [{ name: 'firestore.ops.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.uid) req.auth = { uid: c.uid, token: { email: `${c.uid}@example.test`, email_verified: true } };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks() };
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
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].expect, '·', cases[i].name, '→', r.state, r.errorPosition ? 'line ' + r.errorPosition.line : '', (r.debugMessages || []).join(' ').slice(0, 160)); }
});
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
