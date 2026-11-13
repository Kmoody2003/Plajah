// scripts/backfillEnrollments.mjs — gives everyone already in a class their Enrolled Student record
// (services/enrollmentCore.ts). New joins write it themselves; this covers rosters from before it existed.
//
//   node scripts/backfillEnrollments.mjs            dry run: prints what it would write
//   node scripts/backfillEnrollments.mjs --apply    writes missing records (never overwrites an existing one)
//
// Sources: Christian Ed classes (plajah-ops churchPrograms: studentUids + students[].uid) and Academia
// seats (plajah-prod classMembers markers, class title from classrooms). Auth: RULES_ACCESS_TOKEN, else gcloud.

import { execFileSync } from 'node:child_process';

const PROJECT = 'gen-lang-client-0665118474';
const APPLY = process.argv.includes('--apply');
const token = process.env.RULES_ACCESS_TOKEN
  || execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const docs = (db) => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${db}/documents`;

const val = (f) => f == null ? undefined : f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : undefined) ?? f.doubleValue ?? f.booleanValue
  ?? (f.arrayValue ? (f.arrayValue.values || []).map(val) : f.mapValue ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, val(v)])) : null);
const obj = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]));
const toVal = (v) => typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v ?? '') };

async function list(db, col) {
  const out = [];
  let page = '';
  do {
    const r = await fetch(`${docs(db)}/${col}?pageSize=300${page ? `&pageToken=${page}` : ''}`, { headers: H });
    const j = await r.json();
    if (!r.ok) throw new Error(`${col}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), ...obj(d) });
    page = j.nextPageToken || '';
  } while (page);
  return out;
}

const realUid = (u) => typeof u === 'string' && u.length > 0 && u.length <= 128 && !u.includes('/');
const enrollmentId = (kind, courseId, uid) => `${kind}_${courseId}_${uid}`.replace(/\//g, '_');

const want = new Map();
const add = (kind, courseId, uid, courseTitle, orgId, source) => {
  if (!realUid(uid)) return;
  const id = enrollmentId(kind, courseId, uid);
  const now = Date.now();
  want.set(id, { id, uid, kind, courseId, courseTitle: String(courseTitle || '').slice(0, 200), orgId: orgId || '', role: 'ENROLLED_STUDENT', status: 'active', source, enrolledAt: now, endedAt: 0, updatedAt: now });
};

for (const p of await list('plajah-ops', 'churchPrograms')) {
  const uids = new Set([...(p.studentUids || []), ...((p.students || []).map(s => s?.uid))]);
  for (const uid of uids) add('christian_ed', p.id, uid, p.name, p.orgId, 'backfill_roster');
}
const classes = new Map((await list('plajah-prod', 'classrooms')).map(c => [c.id, c]));
for (const m of await list('plajah-prod', 'classMembers')) {
  const cls = classes.get(m.classId);
  if (!cls) continue;
  add('academia', m.classId, m.uid, cls.title, cls.orgId, 'backfill_seat');
}

const existing = new Set((await list('plajah-ops', 'enrollments')).map(e => e.id));
const missing = [...want.values()].filter(e => !existing.has(e.id));
console.log(`${want.size} enrollments found, ${existing.size} already recorded, ${missing.length} to write${APPLY ? '' : ' (dry run)'}`);
for (const e of missing.slice(0, 15)) console.log(`  ${e.kind} ${e.courseTitle || e.courseId} ← ${e.uid}`);
if (missing.length > 15) console.log(`  … and ${missing.length - 15} more`);

if (APPLY) {
  let ok = 0;
  for (const e of missing) {
    // currentDocument.exists=false: never overwrites a record a live join wrote in the meantime.
    const r = await fetch(`${docs('plajah-ops')}/enrollments/${e.id}?currentDocument.exists=false`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, toVal(v)])) }),
    });
    if (r.ok || r.status === 409) ok++; else console.log(`  failed ${e.id}: ${r.status}`);
  }
  console.log(`wrote ${ok}/${missing.length}`);
}
