// Christian Ed answer keys, announcements (posts/flyers/polls/surveys) and the template library in
// firestore.ops.rules, evaluated with the Firebase Rules REST `:test` API. Read-only: DEPLOYS NOTHING.
// Runs against the compacted deploy artifact so what's tested is what ships:
//   node scripts/minifyRules.mjs firestore.ops.rules <tmp>/ops.min && node scripts/testEduAnnouncementRules.mjs <tmp>/ops.min
// Auth: RULES_ACCESS_TOKEN (`gcloud auth print-access-token`), else a fresh firebase-tools login.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/testEduAnnouncementRules.mjs <compacted ops rules>'); process.exit(2); }
const token = process.env.RULES_ACCESS_TOKEN || (() => {
  const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
  if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — set RULES_ACCESS_TOKEN or run `npx firebase-tools projects:list`.'); process.exit(2); }
  return tok.access_token;
})();
const src = fs.readFileSync(file, 'utf8');

const DB = '/databases/(default)/documents';
// OWNER runs the org; STAFF is on its staff list; TEACHER teaches class c1 (not org staff);
// STUDENT is enrolled in c1; MEMBER is a congregant addressed by a members-only post; OTHER is a stranger.
const OWNER = 'owner', STAFF = 'staff', TEACHER = 'teacher', STUDENT = 'student', MEMBER = 'member', OTHER = 'other';
const USERS = [OWNER, STAFF, TEACHER, STUDENT, MEMBER, OTHER];
const ORG = { creatorId: OWNER, admins: [OWNER], staffUids: [STAFF], pastorUids: [], leaderUids: [] };
const PROGRAM = { orgId: 'o1', teacherUids: [TEACHER], studentUids: [STUDENT] };

const ANN = {
  a1: { id: 'a1', orgId: 'o1', programId: 'c1', audience: 'class', authorUid: TEACHER, kind: 'POST', text: 'Bring your Bible' },
  a2: { id: 'a2', orgId: 'o1', audience: 'members', audienceUids: [MEMBER], authorUid: STAFF, kind: 'FLYER', text: 'Fall retreat' },
  a3: { id: 'a3', orgId: 'o1', audience: 'public', authorUid: STAFF, kind: 'POST', text: 'Trunk or treat' },
  a4: { id: 'a4', orgId: 'o1', audience: 'public', authorUid: STAFF, kind: 'POST', text: 'Pick a date', poll: { question: 'When?', options: ['Sat', 'Sun'], showResults: true } },
  a5: { id: 'a5', orgId: 'o1', audience: 'public', authorUid: STAFF, kind: 'POST', text: 'Feedback', survey: { questions: [{ id: 'q1', prompt: 'How was it?', type: 'long' }] } },
  a6: { id: 'a6', orgId: 'o1', audience: 'public', authorUid: STAFF, kind: 'POST', text: 'Secret ballot', poll: { question: 'Who?', options: ['A', 'B'], showResults: false } },
};
const POLICY = {
  off: { allowPlatformSharing: false, roles: { admin: true, staff: true, teacher: false, volunteer: false, member: false } },
  adminOnly: { allowPlatformSharing: true, roles: { admin: true, staff: false, teacher: false, volunteer: false, member: false } },
  staff: { allowPlatformSharing: true, roles: { admin: true, staff: true, teacher: false, volunteer: false, member: false } },
};

const baseMocks = [
  ...USERS.map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: false } })),
  { function: 'exists', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: true } },
  { function: 'get', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: { data: ORG } } },
  { function: 'get', args: [{ exactValue: `${DB}/churchPrograms/c1` }], result: { value: { data: PROGRAM } } },
  ...Object.entries(ANN).map(([id, a]) => ({ function: 'get', args: [{ exactValue: `${DB}/orgAnnouncements/${id}` }], result: { value: { data: a } } })),
];
const policyMocks = p => p
  ? [{ function: 'exists', args: [{ exactValue: `${DB}/orgTemplatePolicies/o1` }], result: { value: true } },
     { function: 'get', args: [{ exactValue: `${DB}/orgTemplatePolicies/o1` }], result: { value: { data: p } } }]
  : [{ function: 'exists', args: [{ exactValue: `${DB}/orgTemplatePolicies/o1` }], result: { value: false } }];

const cases = [];
const t = (name, expect, who, method, path, { data, existing, policy } = {}) => cases.push({ name, expect, who, method, path, data, existing, policy });

// ── Answer keys: teachers only ─────────────────────────────────────────────
const K = `${DB}/churchEduAnswerKeys/as1`;
const key = { assignmentId: 'as1', programId: 'c1', orgId: 'o1', keys: { q1: { correctAnswer: 'B' } } };
t('teacher reads the answer key', 'ALLOW', TEACHER, 'get', K, { existing: key });
t('org owner reads the answer key', 'ALLOW', OWNER, 'get', K, { existing: key });
t('student cannot read the answer key', 'DENY', STUDENT, 'get', K, { existing: key });
t('stranger cannot read the answer key', 'DENY', OTHER, 'get', K, { existing: key });
t('signed out cannot read the answer key', 'DENY', null, 'get', K, { existing: key });
t('teacher writes the answer key', 'ALLOW', TEACHER, 'create', K, { data: key });
t('student cannot write an answer key', 'DENY', STUDENT, 'create', K, { data: key });
t('teacher cannot file a key under another assignment id', 'DENY', TEACHER, 'create', K, { data: { ...key, assignmentId: 'as2' } });
t('student cannot delete the answer key', 'DENY', STUDENT, 'delete', K, { existing: key });

const A = `${DB}/churchEduAssignments/as1`;
const classCopy = { id: 'as1', classroomId: 'c1', orgId: 'o1', answerKeyWithheld: true };
t('student reads the class copy of an assignment', 'ALLOW', STUDENT, 'get', A, { existing: classCopy });
t('stranger cannot read the class copy', 'DENY', OTHER, 'get', A, { existing: classCopy });

const S = `${DB}/churchEduSubmissions/as1__${STUDENT}`;
const sub = { assignmentId: 'as1', programId: 'c1', studentUid: STUDENT, status: 'TURNED_IN', percentage: 0, questionScores: { q1: { pending: true, earnedPoints: 0, maxPoints: 1 } } };
t('teacher returns work with final question scores', 'ALLOW', TEACHER, 'update', S,
  { existing: sub, data: { ...sub, status: 'RETURNED_WITH_FEEDBACK', percentage: 100, earnedPoints: 1, questionScores: { q1: { correct: true, earnedPoints: 1, maxPoints: 1, expected: 'B' } }, reviewedByUid: TEACHER, reviewedAt: 1, updatedAt: 1 } });
t('teacher cannot move a submission to another student', 'DENY', TEACHER, 'update', S, { existing: sub, data: { ...sub, studentUid: OTHER } });
t('student cannot write review verdicts', 'DENY', STUDENT, 'update', S, { existing: sub, data: { ...sub, reviewVerdicts: { q1: 'correct' } } });
t('student turns in their work', 'ALLOW', STUDENT, 'create', S, { data: sub });
t('student cannot turn in as already returned', 'DENY', STUDENT, 'create', S, { data: { ...sub, status: 'RETURNED_WITH_FEEDBACK', percentage: 100 } });
t('student re-turns-in before review', 'ALLOW', STUDENT, 'update', S, { existing: sub, data: { ...sub, updatedAt: 3 } });
t('student cannot mark their own work returned', 'DENY', STUDENT, 'update', S, { existing: sub, data: { ...sub, status: 'RETURNED_WITH_FEEDBACK', percentage: 100 } });
t('student cannot edit work after it is returned', 'DENY', STUDENT, 'update', S,
  { existing: { ...sub, status: 'RETURNED_WITH_FEEDBACK' }, data: { ...sub, status: 'RETURNED_WITH_FEEDBACK', percentage: 100 } });

// ── Announcements ──────────────────────────────────────────────────────────
const AN = id => `${DB}/orgAnnouncements/${id}`;
t('class post: student reads', 'ALLOW', STUDENT, 'get', AN('a1'), { existing: ANN.a1 });
t('class post: stranger cannot read', 'DENY', OTHER, 'get', AN('a1'), { existing: ANN.a1 });
t('class post: member of the org (not in class) cannot read', 'DENY', MEMBER, 'get', AN('a1'), { existing: ANN.a1 });
t('class post: teacher posts', 'ALLOW', TEACHER, 'create', AN('a1'), { data: ANN.a1 });
t('class post: student cannot post', 'DENY', STUDENT, 'create', AN('a1'), { data: { ...ANN.a1, authorUid: STUDENT } });
t('class post: teacher cannot post as someone else', 'DENY', TEACHER, 'create', AN('a1'), { data: { ...ANN.a1, authorUid: OTHER } });
t('class post: id must match the document', 'DENY', TEACHER, 'create', AN('zz'), { data: ANN.a1 });
t('members post: addressed member reads', 'ALLOW', MEMBER, 'get', AN('a2'), { existing: ANN.a2 });
t('members post: staff reads', 'ALLOW', STAFF, 'get', AN('a2'), { existing: ANN.a2 });
t('members post: stranger cannot read', 'DENY', OTHER, 'get', AN('a2'), { existing: ANN.a2 });
t('members post: student not addressed cannot read', 'DENY', STUDENT, 'get', AN('a2'), { existing: ANN.a2 });
t('members post: staff posts', 'ALLOW', STAFF, 'create', AN('a2'), { data: ANN.a2 });
t('members post: class teacher (not staff) cannot post org-wide', 'DENY', TEACHER, 'create', AN('a2'), { data: { ...ANN.a2, authorUid: TEACHER } });
t('members post: member cannot post', 'DENY', MEMBER, 'create', AN('a2'), { data: { ...ANN.a2, authorUid: MEMBER } });
t('flyer over 700 KB is refused', 'DENY', STAFF, 'create', AN('a2'), { data: { ...ANN.a2, flyerJson: 'x'.repeat(700001) } });
t('public post: any signed-in user reads', 'ALLOW', OTHER, 'get', AN('a3'), { existing: ANN.a3 });
t('public post: signed out cannot read', 'DENY', null, 'get', AN('a3'), { existing: ANN.a3 });
t('public post: stranger cannot post', 'DENY', OTHER, 'create', AN('a3'), { data: { ...ANN.a3, authorUid: OTHER } });
t('owner pins a staff member\'s post', 'ALLOW', OWNER, 'update', AN('a2'), { existing: ANN.a2, data: { ...ANN.a2, pinned: true, updatedAt: 2 } });
t('owner cannot rewrite a staff member\'s post', 'DENY', OWNER, 'update', AN('a2'), { existing: ANN.a2, data: { ...ANN.a2, text: 'changed' } });
t('author edits their own post', 'ALLOW', STAFF, 'update', AN('a2'), { existing: ANN.a2, data: { ...ANN.a2, text: 'Fall retreat — new date' } });
t('author cannot widen a members post to public', 'DENY', STAFF, 'update', AN('a2'), { existing: ANN.a2, data: { ...ANN.a2, audience: 'public' } });
t('addressed member cannot edit the post', 'DENY', MEMBER, 'update', AN('a2'), { existing: ANN.a2, data: { ...ANN.a2, pinned: true } });
t('org owner deletes an org-wide post', 'ALLOW', OWNER, 'delete', AN('a2'), { existing: ANN.a2 });
t('student cannot delete a class post', 'DENY', STUDENT, 'delete', AN('a1'), { existing: ANN.a1 });

// ── Responses (poll votes, survey answers) ─────────────────────────────────
const R = (a, u) => `${DB}/announcementResponses/${a}__${u}`;
const resp = (a, u, extra = {}) => ({ id: `${a}__${u}`, annId: a, orgId: 'o1', uid: u, at: 1, ...extra });
t('addressed member answers a members post', 'ALLOW', MEMBER, 'create', R('a2', MEMBER), { data: resp('a2', MEMBER, { choices: [0] }) });
t('stranger cannot answer a members post', 'DENY', OTHER, 'create', R('a2', OTHER), { data: resp('a2', OTHER, { choices: [0] }) });
t('cannot answer as someone else', 'DENY', MEMBER, 'create', R('a2', OTHER), { data: resp('a2', OTHER) });
t('response id must be annId__uid', 'DENY', MEMBER, 'create', R('a3', 'x'), { data: resp('a3', MEMBER) });
t('student votes on a class post', 'ALLOW', STUDENT, 'create', R('a1', STUDENT), { data: resp('a1', STUDENT, { choices: [1] }) });
t('open-results poll: another voter reads a vote', 'ALLOW', OTHER, 'get', R('a4', MEMBER), { existing: resp('a4', MEMBER, { choices: [0] }) });
t('hidden-results poll: another voter cannot read a vote', 'DENY', OTHER, 'get', R('a6', MEMBER), { existing: resp('a6', MEMBER, { choices: [0] }) });
t('hidden-results poll: author reads the votes', 'ALLOW', STAFF, 'get', R('a6', MEMBER), { existing: resp('a6', MEMBER, { choices: [0] }) });
t('survey: another respondent cannot read answers', 'DENY', OTHER, 'get', R('a5', MEMBER), { existing: resp('a5', MEMBER, { answers: { q1: 'Great' } }) });
t('survey: author reads answers', 'ALLOW', STAFF, 'get', R('a5', MEMBER), { existing: resp('a5', MEMBER, { answers: { q1: 'Great' } }) });
t('survey: respondent reads their own answers', 'ALLOW', MEMBER, 'get', R('a5', MEMBER), { existing: resp('a5', MEMBER, { answers: { q1: 'Great' } }) });
t('cannot delete someone else\'s response', 'DENY', OTHER, 'delete', R('a4', MEMBER), { existing: resp('a4', MEMBER) });

// ── Template library ───────────────────────────────────────────────────────
const T = id => `${DB}/docTemplates/${id}`;
const tpl = (id, extra) => ({ id, name: 'Harvest flyer', bundleJson: '{}', uses: 0, ...extra });
t('platform template: anyone signed in reads', 'ALLOW', OTHER, 'get', T('t1'), { existing: tpl('t1', { tier: 'platform', ownerUid: STAFF }) });
t('org template: org staff reads', 'ALLOW', STAFF, 'get', T('t2'), { existing: tpl('t2', { tier: 'org', orgId: 'o1', ownerUid: OWNER }) });
t('org template: member cannot read', 'DENY', MEMBER, 'get', T('t2'), { existing: tpl('t2', { tier: 'org', orgId: 'o1', ownerUid: OWNER }) });
t('personal template: someone else cannot read', 'DENY', OTHER, 'get', T('t3'), { existing: tpl('t3', { tier: 'user', ownerUid: MEMBER }) });
t('save a personal template', 'ALLOW', MEMBER, 'create', T('t3'), { data: tpl('t3', { tier: 'user', ownerUid: MEMBER }) });
t('staff saves an org template', 'ALLOW', STAFF, 'create', T('t2'), { data: tpl('t2', { tier: 'org', orgId: 'o1', ownerUid: STAFF }) });
t('member cannot save an org template', 'DENY', MEMBER, 'create', T('t2'), { data: tpl('t2', { tier: 'org', orgId: 'o1', ownerUid: MEMBER }) });
const share = who => tpl('t4', { tier: 'platform', ownerUid: who, fromOrgId: 'o1', stripped: true });
t('share org doc: no policy set → refused', 'DENY', OWNER, 'create', T('t4'), { data: share(OWNER), policy: null });
t('share org doc: sharing off → refused', 'DENY', OWNER, 'create', T('t4'), { data: share(OWNER), policy: POLICY.off });
t('share org doc: on for admins, owner shares', 'ALLOW', OWNER, 'create', T('t4'), { data: share(OWNER), policy: POLICY.adminOnly });
t('share org doc: on for admins only, staff refused', 'DENY', STAFF, 'create', T('t4'), { data: share(STAFF), policy: POLICY.adminOnly });
t('share org doc: on for staff, staff shares', 'ALLOW', STAFF, 'create', T('t4'), { data: share(STAFF), policy: POLICY.staff });
t('share org doc: on for staff, member refused', 'DENY', MEMBER, 'create', T('t4'), { data: share(MEMBER), policy: POLICY.staff });
t('share org doc: unstripped copy refused', 'DENY', OWNER, 'create', T('t4'), { data: { ...share(OWNER), stripped: false }, policy: POLICY.adminOnly });
t('using a template counts +1', 'ALLOW', OTHER, 'update', T('t1'), { existing: tpl('t1', { tier: 'platform', ownerUid: STAFF }), data: tpl('t1', { tier: 'platform', ownerUid: STAFF, uses: 1 }) });
t('cannot bump uses by more than 1', 'DENY', OTHER, 'update', T('t1'), { existing: tpl('t1', { tier: 'platform', ownerUid: STAFF }), data: tpl('t1', { tier: 'platform', ownerUid: STAFF, uses: 50 }) });
t('cannot rename someone else\'s template', 'DENY', OTHER, 'update', T('t1'), { existing: tpl('t1', { tier: 'platform', ownerUid: STAFF }), data: tpl('t1', { tier: 'platform', ownerUid: STAFF, name: 'Mine now' }) });
t('owner cannot drop fromOrgId to dodge the policy', 'DENY', OWNER, 'update', T('t4'),
  { existing: tpl('t4', { tier: 'user', ownerUid: OWNER, fromOrgId: 'o1' }), data: tpl('t4', { tier: 'user', ownerUid: OWNER }) });
t('owner cannot promote a personal template to platform', 'DENY', MEMBER, 'update', T('t3'),
  { existing: tpl('t3', { tier: 'user', ownerUid: MEMBER }), data: tpl('t3', { tier: 'platform', ownerUid: MEMBER }) });
const PO = `${DB}/orgTemplatePolicies/o1`;
t('org owner sets the sharing policy', 'ALLOW', OWNER, 'update', PO, { existing: POLICY.off, data: POLICY.staff });
t('staff cannot change the sharing policy', 'DENY', STAFF, 'update', PO, { existing: POLICY.off, data: POLICY.staff });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = { uid: c.who, token: { email: `${c.who}@example.test`, email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: [...baseMocks, ...policyMocks(c.policy)] };
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
console.log(`${results.length - bad}/${results.length} answer-key / announcement / template rules checks passed. No rules deployed.`);
process.exit(bad ? 1 : 0);
