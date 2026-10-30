// Evaluates firestore.ops.rules (the plajah-ops back office) with the Firebase Rules REST `:test` API.
// Read-only: sends the rules text and test cases to Google for evaluation and DEPLOYS NOTHING.
// Runs against the compacted deploy artifact so what's tested is what ships:
//   node scripts/minifyRules.mjs firestore.ops.rules <tmp>/ops.min && node scripts/testOpsRules.mjs <tmp>/ops.min
// Auth: RULES_ACCESS_TOKEN (`gcloud auth print-access-token`), else a fresh firebase-tools login.
//
// Covers: access resolves through the MIRRORED organizations / businessPages / admins docs (the only
// prod docs these rules can see), and the mirrors themselves are closed to every client.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/testOpsRules.mjs <compacted ops rules>'); process.exit(2); }
const token = process.env.RULES_ACCESS_TOKEN || (() => {
  const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
  if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — set RULES_ACCESS_TOKEN or run `npx firebase-tools projects:list`.'); process.exit(2); }
  return tok.access_token;
})();
const src = fs.readFileSync(file, 'utf8');

const DB = '/databases/(default)/documents';
const ADM = 'adm', OWNER = 'owner', PASTOR = 'pastor', BOOKS = 'books', MEMBER = 'member', OTHER = 'other', SHOP = 'shop';
const ORG = { creatorId: OWNER, admins: [OWNER], pastorUids: [PASTOR], accountingViewUids: [BOOKS], staffUids: [], financeUids: [] };
const PAGE = { ownerId: SHOP };
const mocks = [
  ...[ADM, OWNER, PASTOR, BOOKS, MEMBER, OTHER, SHOP].map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: u === ADM } })),
  { function: 'exists', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: true } },
  { function: 'get', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: { data: ORG } } },
  { function: 'get', args: [{ exactValue: `${DB}/businessPages/b1` }], result: { value: { data: PAGE } } },
];

const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });

const P = `${DB}/chmsPeople/p1`;
const person = { orgId: 'o1', firstName: 'Ann', linkedUid: MEMBER };
t('org owner reads a ChMS person', 'ALLOW', OWNER, 'get', P, { existing: person });
t('pastor reads a ChMS person', 'ALLOW', PASTOR, 'get', P, { existing: person });
t('linked member reads their own record', 'ALLOW', MEMBER, 'get', P, { existing: person });
t('stranger cannot read a ChMS person', 'DENY', OTHER, 'get', P, { existing: person });
t('anonymous cannot read a ChMS person', 'DENY', null, 'get', P, { existing: person });
t('stranger cannot create a ChMS person', 'DENY', OTHER, 'create', P, { data: person });
t('org owner creates a ChMS person', 'ALLOW', OWNER, 'create', P, { data: person });

const J = `${DB}/acctJournals/j1`;
const journal = { orgId: 'o1', status: 'POSTED' };
t('accounting viewer reads a journal', 'ALLOW', BOOKS, 'get', J, { existing: journal });
t('accounting viewer cannot post a journal', 'DENY', BOOKS, 'create', J, { data: journal });
t('stranger cannot read a journal', 'DENY', OTHER, 'get', J, { existing: journal });

const G = `${DB}/chmsContributions/g1`;
const gift = { orgId: 'o1', amount: 50, linkedUid: MEMBER, enteredBy: OWNER };
t('giver reads their own gift', 'ALLOW', MEMBER, 'get', G, { existing: gift });
t('stranger cannot read a gift', 'DENY', OTHER, 'get', G, { existing: gift });

// Stripe payouts are server truth; clients only flip the reconciliation match.
const PO = `${DB}/chmsPayouts/po1`;
const payout = { orgId: 'o1', amount: 970, fees: 30, reconciled: false };
t('accounting writer marks a payout reconciled', 'ALLOW', OWNER, 'update', PO, { existing: payout, data: { ...payout, reconciled: true, bankTxnId: 't1' } });
t('accounting writer cannot change a payout amount', 'DENY', OWNER, 'update', PO, { existing: payout, data: { ...payout, amount: 1 } });
t('no client can create a payout', 'DENY', OWNER, 'create', PO, { data: payout });
t('accounting viewer cannot mark a payout reconciled', 'DENY', BOOKS, 'update', PO, { existing: payout, data: { ...payout, reconciled: true } });

const V = `${DB}/orgOnboardingVault/m1`;
t('member reads their own onboarding vault', 'ALLOW', MEMBER, 'get', V, { existing: { orgId: 'o1', userId: MEMBER } });
t('stranger cannot read an onboarding vault', 'DENY', OTHER, 'get', V, { existing: { orgId: 'o1', userId: MEMBER } });

const K = `${DB}/crmContacts/c1`;
t('business page owner reads a CRM contact', 'ALLOW', SHOP, 'get', K, { existing: { businessId: 'b1' } });
t('stranger cannot read a CRM contact', 'DENY', OTHER, 'get', K, { existing: { businessId: 'b1' } });

// The mirrors are server-written only.
t('mirror: org owner cannot read the ops copy of their org', 'DENY', OWNER, 'get', `${DB}/organizations/o1`, { existing: ORG });
t('mirror: org owner cannot rewrite the ops copy (would self-grant)', 'DENY', OWNER, 'update', `${DB}/organizations/o1`, { existing: ORG, data: { ...ORG, admins: [OWNER, OTHER] } });
t('mirror: no one can mint a platform admin', 'DENY', OTHER, 'create', `${DB}/admins/${OTHER}`, { data: {} });
t('mirror: business owner cannot rewrite the ops copy of a page', 'DENY', SHOP, 'update', `${DB}/businessPages/b1`, { existing: PAGE, data: { ownerId: OTHER } });

// Live co-editing (services/coedit): membership on coedit/{pid}; viewers read only; owner manages people.
const CO = `${DB}/coedit/p1`;
const coProject = { ownerId: OWNER, kind: 'tela', title: 'Flyer', members: { [OWNER]: 'owner', [MEMBER]: 'editor', [BOOKS]: 'viewer' }, memberIds: [OWNER, MEMBER, BOOKS], names: {}, createdAt: 1, updatedAt: 1 };
mocks.push({ function: 'get', args: [{ exactValue: CO }], result: { value: { data: coProject } } });
t('co-edit: editor reads the project', 'ALLOW', MEMBER, 'get', CO, { existing: coProject });
t('co-edit: outsider cannot read the project', 'DENY', OTHER, 'get', CO, { existing: coProject });
t('co-edit: owner shares a doc they own', 'ALLOW', OWNER, 'create', `${DB}/coedit/tela__abc`, { data: { ...coProject, members: { [OWNER]: 'owner' }, memberIds: [OWNER] } });
t('co-edit: cannot create a project in someone else\'s name', 'DENY', OTHER, 'create', `${DB}/coedit/tela__abc`, { data: { ...coProject, members: { [OWNER]: 'owner' }, memberIds: [OWNER] } });
t('co-edit: owner invites someone', 'ALLOW', OWNER, 'update', CO, { existing: coProject, data: { ...coProject, members: { ...coProject.members, [PASTOR]: 'editor' }, memberIds: [...coProject.memberIds, PASTOR] } });
t('co-edit: editor cannot invite', 'DENY', MEMBER, 'update', CO, { existing: coProject, data: { ...coProject, members: { ...coProject.members, [OTHER]: 'editor' }, memberIds: [...coProject.memberIds, OTHER] } });
t('co-edit: editor cannot make themselves owner', 'DENY', MEMBER, 'update', CO, { existing: coProject, data: { ...coProject, members: { ...coProject.members, [MEMBER]: 'owner' } } });
t('co-edit: editor renames', 'ALLOW', MEMBER, 'update', CO, { existing: coProject, data: { ...coProject, title: 'Flyer v2', updatedAt: 2 } });
t('co-edit: viewer leaves', 'ALLOW', BOOKS, 'update', CO, { existing: coProject, data: { ...coProject, members: { [OWNER]: 'owner', [MEMBER]: 'editor' }, memberIds: [OWNER, MEMBER], updatedAt: 2 } });
t('co-edit: viewer cannot remove someone else', 'DENY', BOOKS, 'update', CO, { existing: coProject, data: { ...coProject, members: { [OWNER]: 'owner', [BOOKS]: 'viewer' }, memberIds: [OWNER, BOOKS] } });
t('co-edit: editor writes a snapshot', 'ALLOW', MEMBER, 'update', `${CO}/snap/head`, { existing: { gen: 'a' }, data: { gen: 'b', chunks: 1 } });
t('co-edit: viewer cannot write a snapshot', 'DENY', BOOKS, 'update', `${CO}/snap/head`, { existing: { gen: 'a' }, data: { gen: 'b', chunks: 1 } });
t('co-edit: viewer cannot send edits', 'DENY', BOOKS, 'create', `${CO}/ops/b1`, { data: { u: BOOKS, ops: '[]', n: 0 } });
t('co-edit: editor cannot send edits as someone else', 'DENY', MEMBER, 'create', `${CO}/ops/b1`, { data: { u: OWNER, ops: '[]', n: 0 } });
t('co-edit: viewer reads the live log', 'ALLOW', BOOKS, 'get', `${CO}/ops/b1`, { existing: { u: MEMBER, ops: '[]' } });
t('co-edit: shared version readable by members', 'ALLOW', BOOKS, 'get', `${CO}/versions/v1`, { existing: { by: MEMBER, private: false } });
t('co-edit: someone else\'s private copy is hidden', 'DENY', BOOKS, 'get', `${CO}/versions/v2`, { existing: { by: MEMBER, private: true } });
t('co-edit: viewer saves a private copy', 'ALLOW', BOOKS, 'create', `${CO}/versions/v3`, { data: { by: BOOKS, private: true, reason: 'personal' } });
t('co-edit: viewer cannot save a shared version', 'DENY', BOOKS, 'create', `${CO}/versions/v3`, { data: { by: BOOKS, private: false, reason: 'named' } });
t('co-edit: presence for yourself', 'ALLOW', MEMBER, 'create', `${CO}/presence/${MEMBER}_tab1`, { data: { uid: MEMBER, name: 'M' } });
t('co-edit: no presence for others', 'DENY', MEMBER, 'create', `${CO}/presence/${OWNER}_tab1`, { data: { uid: OWNER, name: 'O' } });
t('co-edit: drafts are private', 'DENY', OWNER, 'get', `${CO}/drafts/${MEMBER}`, { existing: { ops: '[]' } });
t('co-edit: your own draft', 'ALLOW', MEMBER, 'get', `${CO}/drafts/${MEMBER}`, { existing: { ops: '[]' } });
t('co-edit: editor contributes a take', 'ALLOW', MEMBER, 'create', `${CO}/assets/a1`, { data: { id: 'a1', owner: MEMBER, kind: 'take', status: 'local', tiers: {} } });
t('co-edit: viewer cannot contribute media', 'DENY', BOOKS, 'create', `${CO}/assets/a1`, { data: { id: 'a1', owner: BOOKS, kind: 'take' } });
t('co-edit: no contributing in someone else’s name', 'DENY', MEMBER, 'create', `${CO}/assets/a1`, { data: { id: 'a1', owner: OWNER, kind: 'take' } });
t('co-edit: contributor upgrades proxy → master', 'ALLOW', MEMBER, 'update', `${CO}/assets/a1`, { existing: { id: 'a1', owner: MEMBER, status: 'proxy' }, data: { id: 'a1', owner: MEMBER, status: 'master' } });
t('co-edit: others cannot rewrite your asset', 'DENY', OWNER, 'update', `${CO}/assets/a1`, { existing: { id: 'a1', owner: MEMBER, status: 'proxy' }, data: { id: 'a1', owner: MEMBER, status: 'master' } });
t('co-edit: viewer reads the media ledger', 'ALLOW', BOOKS, 'get', `${CO}/assets/a1`, { existing: { id: 'a1', owner: MEMBER } });
t('co-edit: publish your own rig', 'ALLOW', MEMBER, 'create', `${CO}/rigs/${MEMBER}_t1`, { data: { uid: MEMBER, shares: {} } });
t('co-edit: no rig for others', 'DENY', MEMBER, 'create', `${CO}/rigs/${OWNER}_t1`, { data: { uid: OWNER } });
t('co-edit: ask for a preset', 'ALLOW', MEMBER, 'create', `${CO}/requests/r1`, { data: { from: MEMBER, to: OWNER, status: 'pending' } });
t('co-edit: only the person asked answers', 'DENY', MEMBER, 'update', `${CO}/requests/r1`, { existing: { from: MEMBER, to: OWNER, status: 'pending' }, data: { from: MEMBER, to: OWNER, status: 'fulfilled' } });
t('co-edit: asked person fulfils', 'ALLOW', OWNER, 'update', `${CO}/requests/r1`, { existing: { from: MEMBER, to: OWNER, status: 'pending' }, data: { from: MEMBER, to: OWNER, status: 'fulfilled', assetId: 'a1' } });
t('co-edit: outsiders cannot read requests', 'DENY', OTHER, 'get', `${CO}/requests/r1`, { existing: { from: MEMBER, to: OWNER } });

// Lesson Library (services/lessonLibraryStore): admin lessons are locked for teachers; teachers copy them.
const TEACH = 'teach';
ORG.eduTeacherUids = [TEACH];
const LL = `${DB}/lessonLibrary/u1`;
const lesson = (o) => ({ id: 'u1', tier: 'org', scopeId: 'o1', orgId: 'o1', ownerUid: OWNER, ownerName: 'O', provisioned: 'admin', copiedFromId: '', title: 'Exam 1', unitJson: '{}', createdAt: 1, updatedAt: 1, ...o });
t('library: org teacher reads an admin lesson', 'ALLOW', TEACH, 'get', LL, { existing: lesson() });
t('library: org member who is not a teacher cannot read', 'DENY', MEMBER, 'get', LL, { existing: lesson() });
t('library: admin provisions a lesson', 'ALLOW', OWNER, 'create', LL, { data: lesson() });
t('library: teacher cannot provision an admin lesson', 'DENY', TEACH, 'create', LL, { data: lesson({ ownerUid: TEACH }) });
t('library: teacher cannot edit an admin lesson', 'DENY', TEACH, 'update', LL, { existing: lesson(), data: lesson({ title: 'Mine now' }) });
t('library: teacher cannot delete an admin lesson', 'DENY', TEACH, 'delete', LL, { existing: lesson() });
t('library: teacher cannot unlock an admin lesson', 'DENY', TEACH, 'update', LL, { existing: lesson(), data: lesson({ provisioned: 'teacher', ownerUid: TEACH }) });
t('library: teacher saves their own copy', 'ALLOW', TEACH, 'create', LL, { data: lesson({ provisioned: 'teacher', ownerUid: TEACH, copiedFromId: 'u0' }) });
t('library: teacher edits their own copy', 'ALLOW', TEACH, 'update', LL, { existing: lesson({ provisioned: 'teacher', ownerUid: TEACH }), data: lesson({ provisioned: 'teacher', ownerUid: TEACH, title: 'v2' }) });
t('library: teacher deletes their own copy', 'ALLOW', TEACH, 'delete', LL, { existing: lesson({ provisioned: 'teacher', ownerUid: TEACH }) });
t('library: teacher cannot save a copy in someone else’s name', 'DENY', TEACH, 'create', LL, { data: lesson({ provisioned: 'teacher', ownerUid: OTHER }) });
t('library: stranger cannot add to an org library', 'DENY', OTHER, 'create', LL, { data: lesson({ provisioned: 'teacher', ownerUid: OTHER }) });
t('library: pastor edits an admin lesson', 'ALLOW', PASTOR, 'update', LL, { existing: lesson(), data: lesson({ title: 'Exam 1 (rev)' }) });
t('library: own lessons stay private', 'DENY', OTHER, 'get', LL, { existing: lesson({ tier: 'user', scopeId: TEACH, orgId: '', ownerUid: TEACH, provisioned: 'teacher' }) });
t('library: a teacher with no org saves their own', 'ALLOW', OTHER, 'create', LL, { data: lesson({ tier: 'user', scopeId: OTHER, orgId: '', ownerUid: OTHER, provisioned: 'teacher' }) });
t('library: anyone signed in reads a platform lesson', 'ALLOW', OTHER, 'get', LL, { existing: lesson({ tier: 'platform', scopeId: 'platform', orgId: '', ownerUid: TEACH, provisioned: 'teacher' }) });
t('library: cannot share to the platform as someone else', 'DENY', OTHER, 'create', LL, { data: lesson({ tier: 'platform', scopeId: 'platform', orgId: '', ownerUid: TEACH, provisioned: 'teacher' }) });

// Class discussion board (services/classForum): class members only; your own vote; teachers moderate.
const PROG = { orgId: 'o1', teacherUids: [TEACH], studentUids: [MEMBER] };
mocks.push({ function: 'get', args: [{ exactValue: `${DB}/churchPrograms/c1` }], result: { value: { data: PROG } } });
const TH = `${DB}/classThreads/t1`;
const thread = (o) => ({ id: 't1', orgId: 'o1', programId: 'c1', kind: 'discussion', title: 'Q', body: 'b', authorUid: MEMBER, authorName: 'M', attachments: [], upvoterUids: [], replyCount: 0, createdAt: 1, lastActivityAt: 1, ...o });
mocks.push({ function: 'get', args: [{ exactValue: TH }], result: { value: { data: thread() } } });
t('forum: student reads a class thread', 'ALLOW', MEMBER, 'get', TH, { existing: thread() });
t('forum: outsider cannot read', 'DENY', OTHER, 'get', TH, { existing: thread() });
t('forum: student starts a discussion', 'ALLOW', MEMBER, 'create', TH, { data: thread() });
t('forum: student cannot open a lesson thread', 'DENY', MEMBER, 'create', TH, { data: thread({ kind: 'lesson' }) });
t('forum: teacher opens a lesson thread', 'ALLOW', TEACH, 'create', TH, { data: thread({ kind: 'lesson', authorUid: TEACH }) });
t('forum: cannot post as someone else', 'DENY', MEMBER, 'create', TH, { data: thread({ authorUid: TEACH }) });
t('forum: student votes', 'ALLOW', MEMBER, 'update', TH, { existing: thread({ authorUid: TEACH }), data: thread({ authorUid: TEACH, upvoterUids: [MEMBER] }) });
t('forum: cannot vote for someone else', 'DENY', MEMBER, 'update', TH, { existing: thread({ authorUid: TEACH }), data: thread({ authorUid: TEACH, upvoterUids: [OTHER] }) });
t('forum: student cannot edit the teacher’s post', 'DENY', MEMBER, 'update', TH, { existing: thread({ authorUid: TEACH }), data: thread({ authorUid: TEACH, title: 'mine' }) });
t('forum: student cannot pin', 'DENY', MEMBER, 'update', TH, { existing: thread(), data: thread({ pinned: true }) });
t('forum: teacher pins', 'ALLOW', TEACH, 'update', TH, { existing: thread(), data: thread({ pinned: true }) });
t('forum: teacher removes a post', 'ALLOW', TEACH, 'delete', TH, { existing: thread() });
const RP = `${TH}/replies/r1`;
const reply = (o) => ({ id: 'r1', threadId: 't1', programId: 'c1', body: 'hi', authorUid: MEMBER, authorName: 'M', upvoterUids: [], createdAt: 1, ...o });
t('forum: student replies', 'ALLOW', MEMBER, 'create', RP, { data: reply() });
t('forum: outsider cannot reply', 'DENY', OTHER, 'create', RP, { data: reply({ authorUid: OTHER }) });
t('forum: cannot edit someone else’s reply', 'DENY', TEACH, 'update', RP, { existing: reply(), data: reply({ body: 'changed' }) });

const MD = `${DB}/classMedia/m1`;
const media = (o) => ({ id: 'm1', orgId: 'o1', programId: 'c1', kind: 'photo', title: 'Pageant', url: 'https://x/y.jpg', authorUid: TEACH, authorName: 'T', createdAt: 1, ...o });
t('media: student sees the class gallery', 'ALLOW', MEMBER, 'get', MD, { existing: media() });
t('media: outsider cannot', 'DENY', OTHER, 'get', MD, { existing: media() });
t('media: teacher adds a photo', 'ALLOW', TEACH, 'create', MD, { data: media() });
t('media: student cannot add', 'DENY', MEMBER, 'create', MD, { data: media({ authorUid: MEMBER }) });
t('media: teacher files it under a lesson', 'ALLOW', TEACH, 'update', MD, { existing: media(), data: media({ lessonId: 'u1', lessonTitle: 'Exam 1' }) });
t('media: no swapping the file', 'DENY', TEACH, 'update', MD, { existing: media(), data: media({ url: 'https://evil/z.jpg' }) });

const LS = `${DB}/liveSources/s1`;
const live = (o) => ({ id: 's1', hostUid: TEACH, hostName: 'T', title: 'Doc', docId: 'd1', active: true, mode: 'FOLLOW', audience: 'members', memberUids: [MEMBER], rev: 1, chunks: 1, updatedAt: 1, invitedUids: [], ...o });
t('live doc: nothing on yet reads as empty', 'ALLOW', OTHER, 'get', LS, {});
t('live doc: a member reads a members-only source', 'ALLOW', MEMBER, 'get', LS, { existing: live() });
t('live doc: an outsider cannot', 'DENY', OTHER, 'get', LS, { existing: live() });
t('live doc: anyone reads a public stream source, signed out too', 'ALLOW', null, 'get', LS, { existing: live({ audience: 'public' }) });
t('live doc: presenter starts', 'ALLOW', TEACH, 'create', LS, { data: live({ active: false }) });
t('live doc: no presenting as someone else', 'DENY', OTHER, 'create', LS, { data: live() });
t('live doc: nobody takes over a running source', 'DENY', OTHER, 'update', LS, { existing: live(), data: live({ hostUid: OTHER }) });
t('live doc: the next presenter claims a finished one', 'ALLOW', OTHER, 'update', LS, { existing: live({ active: false }), data: live({ hostUid: OTHER, active: false }) });
t('live doc: audience cannot change the mode', 'DENY', MEMBER, 'update', LS, { existing: live(), data: live({ mode: 'TOGETHER' }) });

const LR = `${LS}/responses/r1`;
const resp = (o) => ({ id: 'r1', rev: 1, uid: MEMBER, name: 'M', at: 1, mode: 'OWN_COPY', json: '{}', ...o });
t('live doc: a watcher cannot move the simulations', 'DENY', MEMBER, 'update', LS, { existing: live(), data: live({ figure: { values: {} } }) });
t('live doc: someone brought on can', 'ALLOW', MEMBER, 'update', LS, { existing: live({ invitedUids: [MEMBER] }), data: live({ invitedUids: [MEMBER], figure: { values: {} } }) });
t('live doc: someone brought on cannot change the mode', 'DENY', MEMBER, 'update', LS, { existing: live({ invitedUids: [MEMBER] }), data: live({ invitedUids: [MEMBER], mode: 'TOGETHER' }) });
t('live doc: nobody invites themselves', 'DENY', MEMBER, 'update', LS, { existing: live(), data: live({ invitedUids: [MEMBER] }) });
const HD = `${LS}/hands/${MEMBER}`;
t('live doc: a member raises a hand', 'ALLOW', MEMBER, 'create', HD, { data: { uid: MEMBER, name: 'M', rev: 1, at: 1 } });
t('live doc: not for someone else', 'DENY', OTHER, 'create', HD, { data: { uid: MEMBER, name: 'M', rev: 1, at: 1 } });
t('live doc: signed out cannot raise a hand', 'DENY', null, 'create', HD, { data: { uid: MEMBER, name: 'M', rev: 1, at: 1 } });
t('live doc: the presenter clears a hand', 'ALLOW', TEACH, 'delete', HD, { existing: { uid: MEMBER, rev: 1 } });
t('live doc: a student submits', 'ALLOW', MEMBER, 'create', LR, { data: resp() });
t('live doc: no submitting as someone else', 'DENY', MEMBER, 'create', LR, { data: resp({ uid: OTHER }) });
t('live doc: no sending yourself a result', 'DENY', MEMBER, 'create', LR, { data: resp({ returned: { percent: 100 } }) });
t('live doc: the student reads their own', 'ALLOW', MEMBER, 'get', LR, { existing: resp() });
t('live doc: another student cannot', 'DENY', OTHER, 'get', LR, { existing: resp() });
t('live doc: the presenter sends a result', 'ALLOW', TEACH, 'update', LR, { existing: resp(), data: resp({ returned: { percent: 90 } }) });
t('live doc: the presenter cannot rewrite the answers', 'DENY', TEACH, 'update', LR, { existing: resp(), data: resp({ json: '{"x":1}' }) });
t('live doc: a student cannot mark themselves', 'DENY', MEMBER, 'update', LR, { existing: resp(), data: resp({ returned: { percent: 100 } }) });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = { uid: c.who, token: { firebase: { sign_in_provider: 'google.com' } } };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
if (out.issues?.length) console.log('ISSUES', JSON.stringify(out.issues, null, 1).slice(0, 3000));
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
});
console.log(`${results.length - bad}/${results.length} ops rules checks passed. No rules deployed.`);
process.exit(bad ? 1 : 0);
