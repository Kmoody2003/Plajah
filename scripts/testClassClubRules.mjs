// Class feed + photos (services/sharedClassroomService): Academia classrooms in plajah-prod and
// Christian Ed churchPrograms in plajah-ops. Members read; members post as themselves (students as
// STUDENT, never pinned); own like and own appended comment only; teachers pin and moderate.
// Evaluated with the Firebase Rules REST `:test` API — read-only, deploys nothing.
// Runs against the compacted deploy artifacts so what's tested is what ships:
//   node scripts/minifyRules.mjs firestore.rules <tmp>/main.min && node scripts/minifyRules.mjs firestore.ops.rules <tmp>/ops.min
//   node scripts/testClassClubRules.mjs <tmp>/main.min <tmp>/ops.min
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const [mainFile, opsFile] = process.argv.slice(2);
if (!mainFile || !opsFile) { console.error('usage: node scripts/testClassClubRules.mjs <main rules> <ops rules>'); process.exit(2); }
const token = process.env.RULES_ACCESS_TOKEN || (() => {
  const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
  if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — set RULES_ACCESS_TOKEN or run `npx firebase-tools projects:list`.'); process.exit(2); }
  return tok.access_token;
})();

const DB = '/databases/(default)/documents';
const TEACH = 'teach', STU = 'stu', STU2 = 'stu2', OUT = 'out', ORGADM = 'orgadm';
const users = [TEACH, STU, STU2, OUT, ORGADM];
const adminMocks = users.map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: false } }));

const post = (o = {}) => ({ id: 'p1', classId: 'k1', authorUid: STU, authorName: 'S', authorRole: 'STUDENT', text: 'hi', likes: [], comments: [], pinned: false, createdAt: 1, ...o });
const comment = (uid, role = 'STUDENT') => ({ id: 'c_' + uid, authorUid: uid, authorName: uid, authorRole: role, text: 'yes', createdAt: 2 });
const photo = (o = {}) => ({ id: 'ph1', classId: 'k1', assetId: 'a1', kind: 'image', ownerScope: 'user', caption: 'c', uploadedByUid: STU, uploadedByName: 'S', uploadedByRole: 'STUDENT', createdAt: 1, ...o });

function suite(label, base, mocks) {
  const cases = [];
  const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name: `${label}: ${name}`, expect, who, method, path, data, existing });
  const P = `${base}/clubPosts/p1`, F = `${base}/clubPhotos/ph1`;
  const existing = post({ comments: [comment(STU2)], likes: [STU2] });

  t('student reads the feed', 'ALLOW', STU, 'get', P, { existing });
  t('teacher reads the feed', 'ALLOW', TEACH, 'get', P, { existing });
  t('student lists the feed', 'ALLOW', STU, 'list', `${base}/clubPosts/p1`, {});
  t('stranger cannot read the feed', 'DENY', OUT, 'get', P, { existing });
  t('stranger cannot list the feed', 'DENY', OUT, 'list', `${base}/clubPosts/p1`, {});
  t('anonymous cannot read the feed', 'DENY', null, 'get', P, { existing });

  t('student posts as themselves', 'ALLOW', STU, 'create', P, { data: post() });
  t('student cannot post as someone else', 'DENY', STU, 'create', P, { data: post({ authorUid: STU2 }) });
  t('student cannot post as TEACHER', 'DENY', STU, 'create', P, { data: post({ authorRole: 'TEACHER' }) });
  t('student cannot pin their post', 'DENY', STU, 'create', P, { data: post({ pinned: true }) });
  t('post cannot start with likes', 'DENY', STU, 'create', P, { data: post({ likes: [STU2] }) });
  t('teacher posts pinned as TEACHER', 'ALLOW', TEACH, 'create', P, { data: post({ authorUid: TEACH, authorRole: 'TEACHER', pinned: true }) });
  t('stranger cannot post', 'DENY', OUT, 'create', P, { data: post({ authorUid: OUT }) });

  t('student likes', 'ALLOW', STU, 'update', P, { existing, data: { ...existing, likes: [STU2, STU] } });
  t('student unlikes only their own', 'DENY', STU, 'update', P, { existing, data: { ...existing, likes: [] } });
  t('student cannot like for someone else', 'DENY', STU, 'update', P, { existing, data: { ...existing, likes: [STU2, OUT] } });
  t('student comments', 'ALLOW', STU, 'update', P, { existing, data: { ...existing, comments: [...existing.comments, comment(STU)] } });
  t('student cannot comment as another', 'DENY', STU, 'update', P, { existing, data: { ...existing, comments: [...existing.comments, comment(STU2)] } });
  t('student cannot comment as TEACHER', 'DENY', STU, 'update', P, { existing, data: { ...existing, comments: [...existing.comments, comment(STU, 'TEACHER')] } });
  t('student cannot drop others\' comments', 'DENY', STU, 'update', P, { existing, data: { ...existing, comments: [comment(STU)] } });
  t('post edit must be signed by the editor', 'DENY', STU, 'update', P, { existing, data: { ...existing, text: 'changed' } });
  t('student cannot pin', 'DENY', STU, 'update', P, { existing, data: { ...existing, pinned: true } });
  t('teacher pins', 'ALLOW', TEACH, 'update', P, { existing, data: { ...existing, pinned: true } });
  t('teacher comments as TEACHER', 'ALLOW', TEACH, 'update', P, { existing, data: { ...existing, comments: [...existing.comments, comment(TEACH, 'TEACHER')] } });
  t('stranger cannot like', 'DENY', OUT, 'update', P, { existing, data: { ...existing, likes: [STU2, OUT] } });

  t('author deletes own post', 'ALLOW', STU, 'delete', P, { existing });
  t('classmate cannot delete it', 'DENY', STU2, 'delete', P, { existing });
  t('teacher removes a student post', 'ALLOW', TEACH, 'delete', P, { existing });

  t('student reads photos', 'ALLOW', STU, 'get', F, { existing: photo() });
  t('stranger cannot read photos', 'DENY', OUT, 'get', F, { existing: photo() });
  t('student uploads a photo', 'ALLOW', STU, 'create', F, { data: photo() });
  t('a copy must point at a private asset', 'DENY', STU, 'create', F, { data: { ...photo(), assetId: undefined } });
  t('a copy cannot carry a public link', 'DENY', STU, 'create', F, { data: photo({ url: 'https://storage/x.jpg' }) });
  t('student cannot upload as TEACHER', 'DENY', STU, 'create', F, { data: photo({ uploadedByRole: 'TEACHER' }) });
  const cap = (who) => photo({ caption: 'x', editedByUid: who, editedAt: 9 });
  t('owner edits their copy caption', 'ALLOW', STU, 'update', F, { existing: photo(), data: cap(STU) });
  t('teacher edits the class copy caption', 'ALLOW', TEACH, 'update', F, { existing: photo(), data: cap(TEACH) });
  t('classmate cannot edit it', 'DENY', STU2, 'update', F, { existing: photo(), data: cap(STU2) });
  t('stranger cannot edit it', 'DENY', OUT, 'update', F, { existing: photo(), data: cap(OUT) });
  t('edit cannot repoint the file', 'DENY', TEACH, 'update', F, { existing: photo(), data: { ...cap(TEACH), assetId: 'other' } });
  t('edit cannot claim someone else did it', 'DENY', TEACH, 'update', F, { existing: photo(), data: cap(STU) });
  t('owner removes their copy', 'ALLOW', STU, 'delete', F, { existing: photo() });
  const edited = (who) => ({ ...existing, text: 'fixed', editedByUid: who, editedAt: 9 });
  t('author edits own post', 'ALLOW', STU, 'update', P, { existing, data: edited(STU) });
  t('teacher edits a post', 'ALLOW', TEACH, 'update', P, { existing, data: edited(TEACH) });
  t('classmate cannot edit a post', 'DENY', STU2, 'update', P, { existing, data: edited(STU2) });
  t('classmate cannot remove it', 'DENY', STU2, 'delete', F, { existing: photo() });
  t('teacher removes a photo', 'ALLOW', TEACH, 'delete', F, { existing: photo() });
  return { cases, mocks };
}

const main = suite('classroom', `${DB}/classrooms/k1`, [
  ...adminMocks,
  { function: 'get', args: [{ exactValue: `${DB}/classrooms/k1` }], result: { value: { data: { ownerId: TEACH, enrolledStudents: [STU, STU2], price: 0 } } } },
]);
const ops = suite('churchProgram', `${DB}/churchPrograms/c1`, [
  ...adminMocks,
  { function: 'get', args: [{ exactValue: `${DB}/churchPrograms/c1` }], result: { value: { data: { orgId: 'o1', teacherUids: [TEACH], studentUids: [STU, STU2] } } } },
  { function: 'get', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: { data: { creatorId: 'founder', admins: [ORGADM] } } } },
]);
// An org admin moderates Christian Ed classes too.
// The original is the owner's: a teacher or org admin can never touch a student's file record.
const original = { scopeKind: 'user', scopeId: STU, uploadedByUid: STU, name: 'x.jpg', sizeBytes: 1 };
for (const who of [TEACH, ORGADM, STU2]) {
  ops.cases.push({ name: `original: ${who} cannot read it`, expect: 'DENY', who, method: 'get', path: `${DB}/orgAssets/a1`, existing: original });
  ops.cases.push({ name: `original: ${who} cannot delete it`, expect: 'DENY', who, method: 'delete', path: `${DB}/orgAssets/a1`, existing: original });
  ops.cases.push({ name: `original: ${who} cannot edit it`, expect: 'DENY', who, method: 'update', path: `${DB}/orgAssets/a1`, existing: original, data: { ...original, name: 'y.jpg' } });
}
ops.cases.push({ name: 'original: owner deletes it', expect: 'ALLOW', who: STU, method: 'delete', path: `${DB}/orgAssets/a1`, existing: original });
ops.cases.push({ name: 'churchProgram: org admin removes a post', expect: 'ALLOW', who: ORGADM, method: 'delete', path: `${DB}/churchPrograms/c1/clubPosts/p1`, existing: post() });

let bad = 0;
for (const [file, { cases, mocks }] of [[mainFile, main], [opsFile, ops]]) {
  const body = {
    source: { files: [{ name: 'firestore.rules', content: fs.readFileSync(file, 'utf8') }] },
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
  (out.testResults || []).forEach((r, i) => {
    if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
  });
  console.log(`${file}: ${cases.length} cases`);
}
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
