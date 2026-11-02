// Attacker cases for accounts, rosters, invites and child passwords, with the Rules REST `:test` API: read-only, deploys nothing.
// Note: `:test` checks single requests, so a query's constraints aren't exercised. Run rosters against an emulator or staging too.
//   node scripts/minifyRules.mjs firestore.rules <tmp>/rules.min && node scripts/testTrustRules.mjs <tmp>/rules.min
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired: run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }

const DB = '/databases/(default)/documents';
const ORG = 'org1';
const org = { creatorId: 'owner', admins: ['admin'], pastorUids: [], leaderUids: [], staffUids: [] };
const invite = { orgId: ORG, roleKey: 'MEMBER', baseRole: 'MEMBER', expiresAt: 9e15, uses: 0, maxUses: 1 };
function mocks(extra = []) {
  return [
    ...extra,
    { function: 'get', args: [{ exactValue: `${DB}/organizations/${ORG}` }], result: { value: { data: org } } },
    { function: 'exists', args: [{ exactValue: `${DB}/orgMemberIndex/${ORG}_member` }], result: { value: true } },
    { function: 'get', args: [{ exactValue: `${DB}/orgInvites/tok` }], result: { value: { data: invite } } },
    { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
    { function: 'get', args: [{ anyValue: {} }], result: { value: { data: {} } } },
  ];
}
const main = [], ops = [];
const t = (list, name, expect, uid, method, path, { data, existing, extra } = {}) => list.push({ name, expect, uid, method, path, data, existing, extra });

// Rosters
const row = { orgId: ORG, userId: 'someone', role: 'MEMBER', status: 'ACTIVE' };
t(main, 'an outsider cannot read a roster row', 'DENY', 'out', 'get', `${DB}/orgMemberships/m1`, { existing: row });
t(main, 'signed out cannot read a roster row', 'DENY', null, 'get', `${DB}/orgMemberships/m1`, { existing: row });
t(main, 'a member reads a roster row', 'ALLOW', 'member', 'get', `${DB}/orgMemberships/m1`, { existing: row });
t(main, 'an org admin reads a roster row', 'ALLOW', 'admin', 'get', `${DB}/orgMemberships/m1`, { existing: row });
t(main, 'a person reads their own row', 'ALLOW', 'someone', 'get', `${DB}/orgMemberships/m1`, { existing: row });
t(main, "an outsider cannot read the member marker", 'DENY', 'out', 'get', `${DB}/orgMemberIndex/${ORG}_someone`, { existing: { orgId: ORG, userId: 'someone' } });
t(main, 'a person reads their own marker', 'ALLOW', 'someone', 'get', `${DB}/orgMemberIndex/${ORG}_someone`, { existing: { orgId: ORG, userId: 'someone' } });
t(main, "an outsider cannot read another's follow", 'DENY', 'out', 'get', `${DB}/orgFollowers/${ORG}_someone`, { existing: { orgId: ORG, userId: 'someone' } });
t(main, 'a person checks their own follow, even if absent', 'ALLOW', 'someone', 'get', `${DB}/orgFollowers/${ORG}_someone`, {});

// Seats
const seat = { orgId: ORG, userId: 'prov_1', role: 'STAFF', roleKey: 'PASTOR', status: 'ACTIVE', isProvisioned: true };
t(main, 'nobody claims a seat from the client', 'DENY', 'out', 'update', `${DB}/orgMemberships/seat`, { existing: seat, data: { ...seat, userId: 'out', isProvisioned: false } });
t(main, 'a member cannot promote themselves', 'DENY', 'someone', 'update', `${DB}/orgMemberships/m1`, { existing: row, data: { ...row, role: 'ADMIN' } });

// Invites
const after = uses => [{ function: 'getAfter', args: [{ exactValue: `${DB}/orgInvites/tok` }], result: { value: { data: { ...invite, uses } } } }];
const joined = { orgId: ORG, userId: 'out', role: 'MEMBER', roleKey: 'MEMBER', status: 'ACTIVE', inviteToken: 'tok' };
t(main, 'an invite joins at its own role', 'ALLOW', 'out', 'create', `${DB}/orgMemberships/j1`, { data: joined, extra: after(1) });
t(main, 'an invite cannot be raised to staff', 'DENY', 'out', 'create', `${DB}/orgMemberships/j2`, { data: { ...joined, role: 'STAFF' }, extra: after(1) });
t(main, 'an invite cannot be used without counting it', 'DENY', 'out', 'create', `${DB}/orgMemberships/j3`, { data: joined, extra: after(0) });
t(main, 'nobody lists production invites', 'DENY', 'out', 'list', `${DB}/productionInvites`, {});
t(main, 'nobody lists nibble invites', 'DENY', 'out', 'list', `${DB}/nibbleInvites`, { existing: { inviterUid: 'someone' } });
t(main, "a stranger cannot rewrite a nibble invite's inviter", 'DENY', 'out', 'update', `${DB}/nibbleInvites/c`, { existing: { inviterUid: 'a', status: 'PENDING' }, data: { inviterUid: 'out', status: 'PENDING' } });

// Child passwords: controls moved to private/profile, and the public doc takes none at all (testPrivacyRules.mjs).
const child = { uid: 'child_a_1', displayName: 'K', photoURL: '', isChild: true, accountType: 'CHILD' };
const kidPriv = [{ function: 'get', args: [{ exactValue: `${DB}/users/child_a_1/private/profile` }], result: { value: { data: { guardianUid: 'parent' } } } }];
t(main, 'a guardian cannot store a password on the public doc', 'DENY', 'parent', 'update', `${DB}/users/child_a_1`, { existing: child, data: { ...child, parentalControls: { savedChildPassword: 'x' } }, extra: kidPriv });

// Feeds and recordings
t(main, "a stranger cannot edit a church's feed", 'DENY', 'out', 'update', `${DB}/program_feeds/f`, { existing: { churchId: ORG, createdByUid: 'a', status: 'LIVE' }, data: { churchId: ORG, createdByUid: 'a', status: 'ENDED' } });
t(main, 'the campus that opened a feed ends it', 'ALLOW', 'a', 'update', `${DB}/program_feeds/f`, { existing: { churchId: ORG, createdByUid: 'a', status: 'LIVE' }, data: { churchId: ORG, createdByUid: 'a', status: 'ENDED' } });
t(main, "a stranger cannot overwrite a recording manifest", 'DENY', 'out', 'update', `${DB}/liveRecordings/s`, { existing: { ownerUid: 'a' }, data: { ownerUid: 'out' } });
t(main, 'nobody claims another stream by creating as its owner', 'DENY', 'out', 'create', `${DB}/liveRecordings/s2`, { data: { ownerUid: 'a' } });

// Onboarding vault
const vault = { orgId: ORG, userId: 'someone', phone: '555' };
t(ops, 'nobody takes a vault by rewriting its owner', 'DENY', 'out', 'update', `${DB}/orgOnboardingVault/v`, { existing: vault, data: { ...vault, userId: 'out' } });
t(ops, 'the member edits their own vault', 'ALLOW', 'someone', 'update', `${DB}/orgOnboardingVault/v`, { existing: vault, data: { ...vault, phone: '556' } });
t(ops, 'an outsider cannot read a vault', 'DENY', 'out', 'get', `${DB}/orgOnboardingVault/v`, { existing: vault });

async function run(file, cases, srcPath) {
  const src = fs.readFileSync(srcPath || new URL('../' + file, import.meta.url), 'utf8');
  const body = {
    source: { files: [{ name: file, content: src }] },
    testSuite: {
      testCases: cases.map(c => {
        const request = { method: c.method, path: c.path, time: new Date().toISOString() };
        if (c.uid) request.auth = { uid: c.uid, token: { email: `${c.uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } } };
        if (c.data) request.resource = { data: c.data };
        const tc = { expectation: c.expect, request, functionMocks: mocks(c.extra) };
        if (c.existing) tc.resource = { data: c.existing };
        return tc;
      }),
    },
  };
  const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) { console.error(file, JSON.stringify(out).slice(0, 1500)); return cases.length; }
  let bad = 0;
  (out.testResults || []).forEach((r, i) => { if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].expect, '·', cases[i].name, '→', r.state, (r.debugMessages || []).join(' ').slice(0, 200)); } });
  console.log(`${file}: ${cases.length - bad}/${cases.length} passed`);
  return bad;
}
const failed = (await run('firestore.rules', main, process.argv[2])) + (await run('firestore.ops.rules', ops));
process.exitCode = failed ? 1 : 0;
