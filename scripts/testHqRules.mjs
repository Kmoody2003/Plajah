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
const PAGE = 'page1';
const pages = { [PAGE]: { ownerId: 'bizOwner', staffUids: ['bizMgr', 'bizClerk'], staffSeats: { bizMgr: { role: 'MANAGER', perms: [] }, bizClerk: { role: 'STAFF', perms: [] } } } };
const bizFile = { id: 'biz1', scopeKind: 'business', scopeId: PAGE, uploadedByUid: 'bizMgr', name: 'b.pdf', storagePath: `protected-hq/business/${PAGE}/biz1/b.pdf`, scanStatus: 'CLEAN', scannedAt: 1 };
const assets = { open1: openFile, lock1: locked, mine1: personal, biz1: bizFile };

function mocks() {
  const m = [];
  for (const [id, data] of Object.entries(orgs)) {
    m.push({ function: 'get', args: [{ exactValue: `${DB}/organizations/${id}` }], result: { value: { data } } });
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/organizations/${id}` }], result: { value: true } });
  }
  for (const [id, data] of Object.entries(pages)) {
    m.push({ function: 'get', args: [{ exactValue: `${DB}/businessPages/${id}` }], result: { value: { data } } });
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/businessPages/${id}` }], result: { value: true } });
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
// Rules can't see departments, so department limits hold only if these people read through the server.
t('an org admin cannot read a record by exact id', 'DENY', ADMIN, 'get', A('open1'), { existing: openFile });
t('org staff cannot read a record by exact id', 'DENY', STAFF, 'get', A('open1'), { existing: openFile });
t('the owner reads a record directly', 'ALLOW', OWNER, 'get', A('open1'), { existing: openFile });
t('an IT Admin reads a record directly', 'ALLOW', IT, 'get', A('open1'), { existing: openFile });
t('the author reads their record directly', 'ALLOW', AUTHOR, 'get', A('open1'), { existing: openFile });
t('staff cannot read document text', 'DENY', STAFF, 'get', `${DB}/orgAssetText/open1`, { existing: { assetId: 'open1', scopeId: ORG } });
t('the owner cannot read document text directly either', 'DENY', OWNER, 'get', `${DB}/orgAssetText/open1`, { existing: { assetId: 'open1', scopeId: ORG } });
t('nobody writes document text from a client', 'DENY', OWNER, 'create', `${DB}/orgAssetText/x`, { data: { text: 'x' } });
t('a new record cannot carry document text', 'DENY', AUTHOR, 'create', A('bad9'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, rawContentText: 'x', storagePath: `protected-hq/user/${AUTHOR}/bad9/a.pdf` } });
t('text cannot be added to a record later', 'DENY', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, rawContentText: 'x' } });
for (const coll of ['hqAssetVersions', 'hqComments', 'hqActivity', 'hqGuestDecisions']) {
  t(`staff cannot read ${coll} directly`, 'DENY', STAFF, 'get', `${DB}/${coll}/x`, { existing: { assetId: 'open1' } });
  t(`the owner reads ${coll} directly`, 'ALLOW', OWNER, 'get', `${DB}/${coll}/x`, { existing: { assetId: 'open1' } });
}
t('staff can still comment on an open file', 'ALLOW', STAFF, 'create', `${DB}/hqComments/c8`, { data: { assetId: 'open1', authorUid: STAFF, body: 'hi' } });
t('staff can still write an open file', 'ALLOW', STAFF, 'update', A('open1'), { existing: openFile, data: { ...openFile, name: 'b.pdf' } });
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
t('an IT Admin cannot read the log directly either', 'DENY', IT, 'get', `${DB}/hqAuditLog/x`, { existing: { scopeId: ORG } });
t('nobody lists the log', 'DENY', OWNER, 'list', `${DB}/hqAuditLog`, {});
t('nobody writes the log', 'DENY', OWNER, 'create', `${DB}/hqAuditLog/x`, { data: { kind: 'ACCESS_DENIED', scopeId: ORG } });
t('nobody clears their own alert state from the client', 'DENY', OWNER, 'update', `${DB}/hqAlertState/x`, { existing: { seenAt: 1 }, data: { seenAt: 2 } });

// A business's files
const newBiz = uid => ({ scopeKind: 'business', scopeId: PAGE, uploadedByUid: uid, storagePath: `protected-hq/business/${PAGE}/n/a.pdf` });
t('a customer cannot read a business file', 'DENY', OUT, 'get', A('biz1'), { existing: bizFile });
t('signed out cannot read a business file', 'DENY', null, 'get', A('biz1'), { existing: bizFile });
t('another org owner cannot read a business file', 'DENY', OWNER, 'get', A('biz1'), { existing: bizFile });
t('the business owner reads it directly', 'ALLOW', 'bizOwner', 'get', A('biz1'), { existing: bizFile });
t('a clerk reads through the server, not directly', 'DENY', 'bizClerk', 'get', A('biz1'), { existing: bizFile });
t('a customer cannot file into a business', 'DENY', OUT, 'create', A('bz2'), { data: newBiz(OUT) });
t('a clerk cannot file into a business', 'DENY', 'bizClerk', 'create', A('bz2'), { data: newBiz('bizClerk') });
t('a manager files into the business', 'ALLOW', 'bizMgr', 'create', A('bz2'), { data: newBiz('bizMgr') });
t('the owner files into the business', 'ALLOW', 'bizOwner', 'create', A('bz2'), { data: newBiz('bizOwner') });
t('a business record cannot claim an org object', 'DENY', 'bizMgr', 'create', A('bz3'), { data: { ...newBiz('bizMgr'), storagePath: `protected-hq/org/${ORG}/open1/a.pdf` } });
t('a clerk cannot change a business file', 'DENY', 'bizClerk', 'update', A('biz1'), { existing: bizFile, data: { ...bizFile, name: 'x' } });
t('a clerk cannot delete a business file', 'DENY', 'bizClerk', 'delete', A('biz1'), { existing: bizFile });
t('a manager changes a business file', 'ALLOW', 'bizMgr', 'update', A('biz1'), { existing: bizFile, data: { ...bizFile, name: 'x' } });
t('a manager cannot move it to another business', 'DENY', 'bizMgr', 'update', A('biz1'), { existing: bizFile, data: { ...bizFile, scopeId: 'page2' } });
t('a clerk comments on a business file', 'ALLOW', 'bizClerk', 'create', `${DB}/hqComments/bc1`, { data: { assetId: 'biz1', authorUid: 'bizClerk', body: 'hi' } });
t('a customer cannot comment on it', 'DENY', OUT, 'create', `${DB}/hqComments/bc2`, { data: { assetId: 'biz1', authorUid: OUT, body: 'hi' } });

// A file can't claim a check that didn't run
t('a client cannot claim antivirus on update', 'DENY', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, scanEngine: 'clamav' } });
t('a client cannot write the scan note', 'DENY', ADMIN, 'update', A('open1'), { existing: openFile, data: { ...openFile, scanEngineNote: 'Scanned by antivirus.' } });
t('a new record cannot claim antivirus', 'DENY', AUTHOR, 'create', A('bz8'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, scanEngine: 'clamav', storagePath: `protected-hq/user/${AUTHOR}/bz8/a.pdf` } });

// Org to org
t('nobody grants their org a file from a client', 'DENY', OWNER, 'update', A('open1'), { existing: openFile, data: { ...openFile, sharedOrgIds: [OTHER] } });
t('a new record cannot arrive already shared', 'DENY', AUTHOR, 'create', A('bz9'), { data: { scopeKind: 'user', scopeId: AUTHOR, uploadedByUid: AUTHOR, sharedOrgIds: [OTHER], storagePath: `protected-hq/user/${AUTHOR}/bz9/a.pdf` } });
const givenAway = { ...openFile, sharedOrgIds: [OTHER] };
t("the receiving org's admin has no direct read", 'DENY', 'otherAdmin', 'get', A('open1'), { existing: givenAway });
t("the receiving org's owner has no direct read", 'DENY', 'otherOwner', 'get', A('open1'), { existing: givenAway });
t("the receiving org's owner cannot change the file", 'DENY', 'otherOwner', 'update', A('open1'), { existing: givenAway, data: { ...givenAway, name: 'x' } });
t("the receiving org's owner cannot delete the file", 'DENY', 'otherOwner', 'delete', A('open1'), { existing: givenAway });

// The Media Library trash
t('nobody reads the media trash from a client', 'DENY', OWNER, 'get', `${DB}/mediaTrash/album_x`, { existing: { ownerUid: OWNER } });
t('nobody lists the media trash', 'DENY', OWNER, 'list', `${DB}/mediaTrash`, {});
t('nobody plants a trash row to get a file deleted', 'DENY', OUT, 'create', `${DB}/mediaTrash/album_x`, { data: { ownerUid: OUT, data: {} } });

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
