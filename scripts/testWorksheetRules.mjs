// Academia worksheet answer keys + grades in firestore.rules, evaluated with the Firebase Rules REST `:test`
// API. Read-only: DEPLOYS NOTHING. Runs against the compacted deploy artifact so what's tested is what ships:
//   node scripts/minifyRules.mjs firestore.rules <tmp>/rules.min && node scripts/testWorksheetRules.mjs <tmp>/rules.min
// Auth: RULES_ACCESS_TOKEN (`gcloud auth print-access-token`), else a fresh firebase-tools login.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/testWorksheetRules.mjs <compacted rules>'); process.exit(2); }
const token = process.env.RULES_ACCESS_TOKEN || (() => {
  const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
  if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — set RULES_ACCESS_TOKEN or run `npx firebase-tools projects:list`.'); process.exit(2); }
  return tok.access_token;
})();
const src = fs.readFileSync(file, 'utf8');

const DB = '/databases/(default)/documents';
const TEACHER = 'teacher', STUDENT = 'student', GUARDIAN = 'guardian', OTHER = 'other';
const USERS = [TEACHER, STUDENT, GUARDIAN, OTHER];
const WS = { createdBy: TEACHER, accessUids: [STUDENT, GUARDIAN], title: 'Addition', fields: [{ id: 'q1', label: '7 + 6 =', type: 'numeric', points: 1 }], answerKeyWithheld: true };
const ASSIGN = { teacherUid: TEACHER, worksheetId: 'w1', studentIds: [STUDENT] };
const mocks = [
  ...USERS.map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: false } })),
  { function: 'exists', args: [{ exactValue: `${DB}/digital_worksheets/w1` }], result: { value: true } },
  { function: 'get', args: [{ exactValue: `${DB}/digital_worksheets/w1` }], result: { value: { data: WS } } },
  { function: 'get', args: [{ exactValue: `${DB}/worksheet_assignments/a1` }], result: { value: { data: ASSIGN } } },
];

const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });

const K = `${DB}/digital_worksheet_keys/w1`;
const key = { worksheetId: 'w1', createdBy: TEACHER, keys: { q1: '13' } };
t('teacher reads their answer key', 'ALLOW', TEACHER, 'get', K, { existing: key });
t('student cannot read the answer key', 'DENY', STUDENT, 'get', K, { existing: key });
t('guardian cannot read the answer key', 'DENY', GUARDIAN, 'get', K, { existing: key });
t('stranger cannot read the answer key', 'DENY', OTHER, 'get', K, { existing: key });
t('signed out cannot read the answer key', 'DENY', null, 'get', K, { existing: key });
t('teacher writes the key for their worksheet', 'ALLOW', TEACHER, 'create', K, { data: key });
t('student cannot write a key', 'DENY', STUDENT, 'create', K, { data: { ...key, createdBy: STUDENT } });
t('teacher cannot file a key under another worksheet id', 'DENY', TEACHER, 'create', K, { data: { ...key, worksheetId: 'w2' } });
t('teacher updates their key', 'ALLOW', TEACHER, 'update', K, { existing: key, data: { ...key, keys: { q1: '14' } } });
t('student cannot delete the key', 'DENY', STUDENT, 'delete', K, { existing: key });

const W = `${DB}/digital_worksheets/w1`;
t('assigned student opens the worksheet copy', 'ALLOW', STUDENT, 'get', W, { existing: WS });
t('stranger cannot open the worksheet', 'DENY', OTHER, 'get', W, { existing: WS });

const S = `${DB}/worksheet_submissions/w1_${STUDENT}`;
const sub = { worksheetId: 'w1', assignmentId: 'a1', studentId: STUDENT, studentName: 'Sam', status: 'assigned' };
const turnedIn = { ...sub, status: 'turned-in', answers: { q1: '13' }, turnedInAt: 2 };
t('student opens their submission', 'ALLOW', STUDENT, 'update', S, { existing: sub, data: { ...sub, status: 'opened', openedAt: 1 } });
t('student turns in answers', 'ALLOW', STUDENT, 'update', S, { existing: sub, data: turnedIn });
t('student cannot give themselves a score', 'DENY', STUDENT, 'update', S, { existing: sub, data: { ...turnedIn, score: 1, maxScore: 1, percent: 100 } });
t('student cannot write a pre-assessment', 'DENY', STUDENT, 'update', S, { existing: sub, data: { ...turnedIn, preAssessment: { perField: [] } } });
t('student cannot change a score the grader wrote', 'DENY', STUDENT, 'update', S, { existing: { ...turnedIn, percent: 0 }, data: { ...turnedIn, percent: 100 } });
t('student cannot write teacher overrides', 'DENY', STUDENT, 'update', S, { existing: turnedIn, data: { ...turnedIn, teacherOverrides: { q1: { correct: true } } } });
t('student re-turns-in without touching the grade', 'ALLOW', STUDENT, 'update', S, { existing: { ...turnedIn, percent: 0, score: 0 }, data: { ...turnedIn, percent: 0, score: 0, answers: { q1: '12' } } });
t('student cannot create a submission with a score', 'DENY', STUDENT, 'create', S, { data: { ...turnedIn, percent: 100 } });
t('student creates a submission with answers only', 'ALLOW', STUDENT, 'create', S, { data: turnedIn });
t('teacher confirms a field grade', 'ALLOW', TEACHER, 'update', S, { existing: turnedIn, data: { ...turnedIn, teacherOverrides: { q1: { correct: true } }, teacherReviewedAt: 3 } });
t('stranger cannot touch a submission', 'DENY', OTHER, 'update', S, { existing: sub, data: turnedIn });
t('guardian reads their child\'s submission', 'ALLOW', GUARDIAN, 'get', S, { existing: { ...turnedIn, guardianUids: [GUARDIAN] } });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = { uid: c.who, token: { email: `${c.who}@example.test`, email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
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
console.log(`${results.length - bad}/${results.length} worksheet key / grade rules checks passed. No rules deployed.`);
process.exit(bad ? 1 : 0);
