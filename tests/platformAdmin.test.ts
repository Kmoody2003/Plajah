import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVerifiedAdmin, OWNER_EMAIL } from '../services/platformAdmin';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

test('platform admin = admins doc or the owner\'s VERIFIED email, nothing else', () => {
  const none = { isAdminDoc: false };
  assert.equal(isVerifiedAdmin({ ...none, email: OWNER_EMAIL, emailVerified: true }), true);
  assert.equal(isVerifiedAdmin({ ...none, email: OWNER_EMAIL.toUpperCase(), emailVerified: true }), true);
  assert.equal(isVerifiedAdmin({ ...none, email: OWNER_EMAIL, emailVerified: false }), false);
  assert.equal(isVerifiedAdmin({ ...none, email: 'org-admin@church.org', emailVerified: true }), false);
  assert.equal(isVerifiedAdmin({ isAdminDoc: true }), true);
  assert.equal(isVerifiedAdmin({ ...none }), false);
  assert.equal(isVerifiedAdmin({ ...none, email: 'x@y.com', emailVerified: true, extraAdminEmails: 'a@b.com, x@y.com' }), true);
});

test('self-asserted profile fields cannot make an admin (role/isAdmin/org admin are inert)', () => {
  const spoof: any = { isAdminDoc: false, role: 'admin', isAdmin: true, orgAdmin: true, email: 'someone@else.com', emailVerified: true };
  assert.equal(isVerifiedAdmin(spoof), false);
});

test('regression: threat-protection API stays behind auth + verified-admin', () => {
  const server = read('server.ts');
  const mount = server.split('\n').find(l => l.includes("app.use('/api/security/threat-protection'"));
  assert.ok(mount, 'mount line not found');
  assert.match(mount!, /authMiddleware,\s*requireVerifiedAdmin,/);
  assert.ok(!/x-admin-bypass/i.test(read('routes/threatProtection.ts').replace(/\/\/.*$/gm, '')), 'x-admin-bypass header must not gate anything');
});

test('regression: server admin checks never read the editable profile role/isAdmin', () => {
  const server = read('server.ts');
  assert.ok(!/me\.role === 'admin'/.test(server), 'server.ts must not trust users.role');
  assert.ok(!/const role = u\?\.role/.test(server), 'cxUsage must not trust users.role');
  const cora = read('routes/cora.ts').replace(/\/\/.*$/gm, '');
  assert.ok(!/user\?\.role/.test(cora), 'cora admin check must not trust users.role');
  const schools = read('routes/schools.ts').replace(/\/\/.*$/gm, '');
  assert.ok(!/caller\?\.(role|isAdmin)/.test(schools), 'schools provision must not trust users.role/isAdmin');
});

test('regression: firestore rules isAdmin() does not read users.role and owners cannot set role/isAdmin', () => {
  const rules = read('firestore.rules');
  const isAdmin = rules.slice(rules.indexOf('function isAdmin()'), rules.indexOf('function isAdmin()') + 700);
  assert.ok(!/users\/\$\(request\.auth\.uid\)\)\.data\.role/.test(isAdmin), 'isAdmin() must not read users.role');
  assert.match(rules, /noPlatformPrivilegeGrab\(request\.resource\.data\)\)/);
  assert.match(rules, /platformPrivilegeUnchanged\(request\.resource\.data, resource\.data\)\)/);
});
