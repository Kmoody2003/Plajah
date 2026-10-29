// Org + department feed rules: members-only (INTERNAL) and department-only (DEPARTMENT) posts — read, create,
// like, comment — plus the membership marker they trust (orgMemberIndex) and self-join (orgMemberships).
// Evaluated with the Firebase Rules REST `:test` API — read-only, deploys nothing.
// Runs against the compacted deploy artifact so what's tested is what ships.
//   node scripts/minifyRules.mjs firestore.rules <tmp>/firestore.rules.min && node scripts/testOrgFeedRules.mjs <tmp>/firestore.rules.min
import fs from 'node:fs';
import os from 'node:os';
const PROJECT = 'gen-lang-client-0665118474';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const file = process.argv[2] || new URL('../firestore.rules.min', import.meta.url);
const src = fs.readFileSync(file, 'utf8');

const DB = '/databases/(default)/documents';
const ORG = 'o1', YOUTH = 'youth', MEDIA = 'media';
// YOUTHM is in the Youth department; MEM is an org member in no department; FAN only follows; OUT is a stranger;
// PASTOR leads the org (pastorUids) and sees every department.
const YOUTHM = 'youthm', MEM = 'mem', FAN = 'fan', OUT = 'out', PASTOR = 'pastor';
const users = [YOUTHM, MEM, FAN, OUT, PASTOR];
const index = { [YOUTHM]: [YOUTH], [MEM]: [] };
const orgDoc = { creatorId: 'founder', admins: [], pastorUids: [PASTOR], leaderUids: [] };
const deptPost = { authorId: PASTOR, authorName: 'Grace', authorPhoto: '', text: 'youth only', timestamp: 1, authorOrgId: ORG, orgAudience: 'DEPARTMENT', orgDepartmentId: YOUTH, isPublic: false, likedBy: [], likesCount: 0 };
const internalPost = { ...deptPost, orgAudience: 'INTERNAL', text: 'members only' };
delete internalPost.orgDepartmentId;
const publicDeptPost = { ...deptPost, orgAudience: 'PUBLIC', isPublic: true, text: 'youth public' };

function mocks() {
  const m = [];
  for (const u of users) {
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: false } });
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/users/${u}` }], result: { value: true } });
    m.push({ function: 'get', args: [{ exactValue: `${DB}/users/${u}` }], result: { value: { data: { isPrivate: false } } } });
    const inIdx = u in index;
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/orgMemberIndex/${ORG}_${u}` }], result: { value: inIdx } });
    if (inIdx) m.push({ function: 'get', args: [{ exactValue: `${DB}/orgMemberIndex/${ORG}_${u}` }], result: { value: { data: { orgId: ORG, userId: u, ministryIds: index[u] } } } });
    m.push({ function: 'exists', args: [{ exactValue: `${DB}/orgFollowers/${ORG}_${u}` }], result: { value: u === FAN } });
  }
  m.push({ function: 'get', args: [{ exactValue: `${DB}/organizations/${ORG}` }], result: { value: { data: orgDoc } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/posts/pd` }], result: { value: { data: deptPost } } });
  m.push({ function: 'get', args: [{ exactValue: `${DB}/posts/pi` }], result: { value: { data: internalPost } } });
  return m;
}
const tokenFor = uid => ({ uid, token: { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'google.com' } } });

const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });
const PD = `${DB}/posts/pd`, PI = `${DB}/posts/pi`, PN = `${DB}/posts/pnew`;

// Reading
t('department member reads a department-only post', 'ALLOW', YOUTHM, 'get', PD, { existing: deptPost });
t('org member outside the department cannot', 'DENY', MEM, 'get', PD, { existing: deptPost });
t('follower cannot read a department-only post', 'DENY', FAN, 'get', PD, { existing: deptPost });
t('stranger cannot read a department-only post', 'DENY', OUT, 'get', PD, { existing: deptPost });
t('org leader reads every department', 'ALLOW', PASTOR, 'get', PD, { existing: deptPost });
t('org member reads members-only post', 'ALLOW', MEM, 'get', PI, { existing: internalPost });
t('follower cannot read members-only post', 'DENY', FAN, 'get', PI, { existing: internalPost });
t('stranger reads a department public post', 'ALLOW', OUT, 'get', `${DB}/posts/pp`, { existing: publicDeptPost });

// Writing
t('department member posts to their department', 'ALLOW', YOUTHM, 'create', PN, { data: { ...deptPost, authorId: YOUTHM } });
t('member posts to a department they are not in', 'DENY', YOUTHM, 'create', PN, { data: { ...deptPost, authorId: YOUTHM, orgDepartmentId: MEDIA } });
t('department post must be unlisted', 'DENY', YOUTHM, 'create', PN, { data: { ...deptPost, authorId: YOUTHM, isPublic: true } });
t('stranger posts into a department', 'DENY', OUT, 'create', PN, { data: { ...deptPost, authorId: OUT } });

// Likes — only people who can see the post
t('department member likes a department post', 'ALLOW', YOUTHM, 'update', PD, { existing: deptPost, data: { ...deptPost, likedBy: [YOUTHM], likesCount: 1 } });
t('outsider likes a department post by id', 'DENY', MEM, 'update', PD, { existing: deptPost, data: { ...deptPost, likedBy: [MEM], likesCount: 1 } });
t('follower likes a members-only post by id', 'DENY', FAN, 'update', PI, { existing: internalPost, data: { ...internalPost, likedBy: [FAN], likesCount: 1 } });

// Comments
const pc = (uid, o = {}) => ({ author: uid, text: 'hi', authorId: uid, authorName: uid, authorPhoto: '', uid, timestamp: 1, parentId: null, likedBy: [], likesCount: 0, ...o });
t('department member comments', 'ALLOW', YOUTHM, 'create', `${PD}/comments/c1`, { data: pc(YOUTHM) });
t('outsider comments on a department post', 'DENY', MEM, 'create', `${PD}/comments/c1`, { data: pc(MEM) });
t('outsider reads department comments', 'DENY', MEM, 'get', `${PD}/comments/c1`, { existing: pc(YOUTHM) });

// The membership marker and self-join
const IDX = `${DB}/orgMemberIndex/${ORG}_${OUT}`;
t('stranger cannot mint their own member marker', 'DENY', OUT, 'create', IDX, { data: { orgId: ORG, userId: OUT, ministryIds: [YOUTH] } });
t('member cannot add departments to their own marker', 'DENY', MEM, 'update', `${DB}/orgMemberIndex/${ORG}_${MEM}`, { existing: { orgId: ORG, userId: MEM, ministryIds: [] }, data: { orgId: ORG, userId: MEM, ministryIds: [YOUTH] } });
t('org leader writes a member marker', 'ALLOW', PASTOR, 'create', IDX, { data: { orgId: ORG, userId: OUT, ministryIds: [YOUTH] } });
t('member drops their own marker', 'ALLOW', MEM, 'delete', `${DB}/orgMemberIndex/${ORG}_${MEM}`, { existing: { orgId: ORG, userId: MEM, ministryIds: [] } });
const join = { orgId: ORG, userId: OUT, role: 'MEMBER', displayName: 'Out', joinedAt: 1 };
t('self-join request (PENDING)', 'ALLOW', OUT, 'create', `${DB}/orgMemberships/m1`, { data: { ...join, status: 'PENDING', roleKey: 'MEMBER' } });
t('self-join straight to ACTIVE without an invite', 'DENY', OUT, 'create', `${DB}/orgMemberships/m1`, { data: { ...join, status: 'ACTIVE', ministryIds: [YOUTH] } });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = tokenFor(c.who);
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks() };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
let res, out;
for (let attempt = 1; attempt <= 4; attempt++) {
  res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body),
  });
  out = await res.json();
  if (res.status !== 503) break;
  console.warn(`503 from the Rules API (attempt ${attempt}), retrying…`);
  await new Promise(r => setTimeout(r, 4000 * attempt));
}
if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
if (out.issues?.length) console.log('ISSUES', JSON.stringify(out.issues, null, 1).slice(0, 3000));
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
});
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
