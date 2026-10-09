// Evaluates the creator-course rules in firestore.rules with the Firebase Rules REST `:test` API.
// Read-only: sends the rules text and test cases to Google for evaluation and DEPLOYS NOTHING.
// Same approach as scripts/testExperiencesRules.mjs. Usage: node scripts/testCourseRules.mjs
// Needs a live firebase-tools login (npx firebase-tools projects:list refreshes the token).
//
// Covers: self-enrollment (free only, exactly yourself, published, within seats), paid-course lockout,
// server-only courseEnrollments, owner gradebook reads via classroomId, and the studentGrades rule.
import fs from 'node:fs';
import os from 'node:os';
const PROJECT = 'gen-lang-client-0665118474';
const cfgPath = os.homedir() + '/.config/configstore/firebase-tools.json';
const tok = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }

// RULES_FILE lets the same cases run against any rules text (e.g. a candidate ruleset before release).
const full = process.env.RULES_FILE ? fs.readFileSync(process.env.RULES_FILE, 'utf8') : fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const grab = (startRe) => {
  const i = full.search(startRe);
  if (i < 0) throw new Error('not found in firestore.rules: ' + startRe);
  let depth = 0;
  const open = full.slice(i).search(/\{\r?\n/);
  for (let k = i + open; k < full.length; k++) {
    if (full[k] === '{') depth++;
    else if (full[k] === '}' && --depth === 0) return full.slice(i, k + 1);
  }
  throw new Error('unbalanced braces');
};
const src = [
  "rules_version = '2';", 'service cloud.firestore {', '  match /databases/{database}/documents {',
  grab(/function isAuthenticated\(\)/), grab(/function isAdmin\(\)/), grab(/function hasRequiredFields\(/),
  grab(/function isValidClassroom\(data\)/), grab(/function isValidSubmission\(data\)/),
  grab(/match \/classrooms\/\{classId\}/), grab(/match \/submissions\/\{subId\}/),
  grab(/match \/studentGrades\/\{gradeId\}/), grab(/match \/courseEnrollments\/\{enrollId\}/),
  '  }', '}', '',
].join('\n');

const DB = '/databases/(default)/documents';
const ADM = 'adm', OWNER = 'teach', LRN = 'learner', OTHER = 'other';
const classDoc = { ownerId: OWNER, price: 0 };
const mocks = [
  ...[ADM, OWNER, LRN, OTHER].map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: u === ADM } })),
  { function: 'get', args: [{ exactValue: `${DB}/classrooms/c1` }], result: { value: { data: classDoc } } },
];

const course = (o = {}) => ({ id: 'c1', ownerId: OWNER, ownerName: 'Kay', title: 'T', description: 'd', thumbnailUrl: 'u', price: 0, syllabus: '', lessons: [], assignments: [], enrolledStudents: [OWNER], category: 'Music', track: 'CREATOR', ...o });
const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });
const C = `${DB}/classrooms/c1`;

// self-enrollment
t('learner joins a free published course', 'ALLOW', LRN, 'update', C, { existing: course(), data: course({ enrolledStudents: [OWNER, LRN] }) });
t('learner CANNOT join a paid course by direct write', 'DENY', LRN, 'update', C, { existing: course({ price: 49 }), data: course({ price: 49, enrolledStudents: [OWNER, LRN] }) });
t('learner cannot enroll someone else', 'DENY', LRN, 'update', C, { existing: course(), data: course({ enrolledStudents: [OWNER, OTHER] }) });
t('learner cannot enroll two people at once', 'DENY', LRN, 'update', C, { existing: course(), data: course({ enrolledStudents: [OWNER, LRN, OTHER] }) });
t('learner cannot remove others while joining', 'DENY', LRN, 'update', C, { existing: course({ enrolledStudents: [OWNER, OTHER] }), data: course({ enrolledStudents: [LRN, OTHER] }) });
t('learner cannot join a draft', 'DENY', LRN, 'update', C, { existing: course({ status: 'DRAFT' }), data: course({ status: 'DRAFT', enrolledStudents: [OWNER, LRN] }) });
t('learner can join a published course (status set)', 'ALLOW', LRN, 'update', C, { existing: course({ status: 'PUBLISHED' }), data: course({ status: 'PUBLISHED', enrolledStudents: [OWNER, LRN] }) });
t('learner cannot join a full course', 'DENY', LRN, 'update', C, { existing: course({ capacity: 2, enrolledStudents: [OWNER, 'a', 'b'] }), data: course({ capacity: 2, enrolledStudents: [OWNER, 'a', 'b', LRN] }) });
t('learner can take the last seat', 'ALLOW', LRN, 'update', C, { existing: course({ capacity: 2, enrolledStudents: [OWNER, 'a'] }), data: course({ capacity: 2, enrolledStudents: [OWNER, 'a', LRN] }) });
t('learner cannot enroll while also changing the price', 'DENY', LRN, 'update', C, { existing: course({ price: 49 }), data: course({ price: 0, enrolledStudents: [OWNER, LRN] }) });
t('already-enrolled learner cannot re-add themselves', 'DENY', LRN, 'update', C, { existing: course({ enrolledStudents: [OWNER, LRN] }), data: course({ enrolledStudents: [OWNER, LRN, LRN] }) });
t('anonymous cannot enroll', 'DENY', null, 'update', C, { existing: course(), data: course({ enrolledStudents: [OWNER, LRN] }) });
t('owner edits own course', 'ALLOW', OWNER, 'update', C, { existing: course(), data: course({ title: 'New title', price: 99 }) });
t('non-owner cannot edit the course', 'DENY', OTHER, 'update', C, { existing: course(), data: course({ title: 'Hijack' }) });

// server-only enrollment receipts
const R = `${DB}/courseEnrollments/c1_${LRN}`;
const rec = { courseId: 'c1', uid: LRN, ownerUid: OWNER, amountCents: 4900 };
t('learner reads own receipt', 'ALLOW', LRN, 'get', R, { existing: rec });
t('instructor reads a receipt for their course', 'ALLOW', OWNER, 'get', R, { existing: rec });
t('stranger cannot read a receipt', 'DENY', OTHER, 'get', R, { existing: rec });
t('learner cannot forge a receipt', 'DENY', LRN, 'create', R, { data: rec });
t('instructor cannot forge a receipt', 'DENY', OWNER, 'create', R, { data: rec });
t('admin cannot forge a receipt from a client either', 'DENY', ADM, 'create', R, { data: rec });

// gradebook
const S = `${DB}/submissions/s1`;
const sub = { id: 's1', assignmentId: 'a1', studentId: LRN, studentName: 'L', timestamp: 1, classroomId: 'c1' };
t('learner reads own submission', 'ALLOW', LRN, 'get', S, { existing: sub });
t('course owner reads a submission via classroomId', 'ALLOW', OWNER, 'get', S, { existing: sub });
t('stranger cannot read a submission', 'DENY', OTHER, 'get', S, { existing: sub });
t('learner can submit work with classroomId', 'ALLOW', LRN, 'create', S, { data: sub });
t('learner cannot submit as someone else', 'DENY', LRN, 'create', S, { data: { ...sub, studentId: OTHER } });
t('course owner grades a submission', 'ALLOW', OWNER, 'update', S, { existing: sub, data: { ...sub, grade: 90, feedback: 'nice' } });
t('course owner cannot rewrite the submission body while grading', 'DENY', OWNER, 'update', S, { existing: sub, data: { ...sub, grade: 90, studentId: OTHER } });
t('learner cannot grade themselves', 'DENY', LRN, 'update', S, { existing: sub, data: { ...sub, grade: 100 } });

const G = `${DB}/studentGrades/c1_${LRN}_a1`;
const grade = { classroomId: 'c1', studentId: LRN, studentName: 'L', assignmentId: 'a1', grade: 90, maxPoints: 100, gradedBy: OWNER, gradedAt: 1 };
t('course owner writes a grade', 'ALLOW', OWNER, 'create', G, { data: grade });
t('learner cannot write a grade', 'DENY', LRN, 'create', G, { data: grade });
t('learner reads own grade', 'ALLOW', LRN, 'get', G, { existing: grade });
t('course owner reads the grade', 'ALLOW', OWNER, 'get', G, { existing: grade });
t('another learner cannot read the grade', 'DENY', OTHER, 'get', G, { existing: grade });

const claims = { [ADM]: {}, [OWNER]: {}, [LRN]: {}, [OTHER]: {} };
const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = { uid: c.who, token: claims[c.who] || {} };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks };
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
