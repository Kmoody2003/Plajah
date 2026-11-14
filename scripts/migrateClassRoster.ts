// Moves enrolledStudents off the public classrooms/{id} doc into private/roster, writes a classMembers/{classId_uid}
// marker per student and a public enrolledCount. Dry run unless --apply.
//
//   npx tsx --env-file=.env.local scripts/migrateClassRoster.ts --phase=copy [--apply]
//   npx tsx --env-file=.env.local scripts/migrateClassRoster.ts --phase=strip [--apply]
//
// Order: copy (rules read the markers, so this comes BEFORE the rules deploy), deploy rules + server + client, copy
// again, strip. Copy only adds. Strip only removes the public list once every uid is on the private roster.
import { fsGetStrict, fsList, fsPatch } from '../services/firebaseAdminRest';

const apply = process.argv.includes('--apply');
const phase = (process.argv.find(a => a.startsWith('--phase=')) || '').split('=')[1];
if (phase !== 'copy' && phase !== 'strip') { console.error('Pass --phase=copy or --phase=strip'); process.exit(2); }

const LIMIT = 50000;
const classes = await fsList('classrooms', { strict: true, pageSize: 300, maxDocs: LIMIT });
let copied = 0, marked = 0, stripped = 0, skipped = 0, failed = 0;

for (const { id, data } of classes) {
  const pub: string[] = Array.isArray(data.enrolledStudents) ? data.enrolledStudents.filter((u: unknown) => typeof u === 'string' && u) : [];
  const roster = (await fsGetStrict(`classrooms/${id}/private/roster`)) || {};
  const have: string[] = Array.isArray(roster.enrolledStudents) ? roster.enrolledStudents : [];
  if (phase === 'copy') {
    const next = [...new Set([...have, ...pub])];
    if (next.length !== have.length) { copied++; if (apply && !(await fsPatch(`classrooms/${id}/private/roster`, { enrolledStudents: next }))) failed++; }
    for (const uid of next) {
      if (await fsGetStrict(`classMembers/${id}_${uid}`)) continue;
      marked++;
      if (apply && !(await fsPatch(`classMembers/${id}_${uid}`, { classId: id, uid, at: Date.now() }))) failed++;
    }
    if (data.enrolledCount !== next.length) { if (apply && !(await fsPatch(`classrooms/${id}`, { enrolledCount: next.length }))) failed++; }
  } else {
    if (data.enrolledStudents === undefined) continue;
    const missing = pub.filter(u => !have.includes(u));
    if (missing.length) { skipped++; console.log(`Skipping ${id}: ${missing.length} not on the private roster yet`); continue; }
    stripped++;
    if (apply && !(await fsPatch(`classrooms/${id}`, { enrolledStudents: undefined }))) failed++;
  }
}
if (phase === 'copy') console.log(`${apply ? 'Copied' : 'Would copy'} ${copied} rosters and ${apply ? 'wrote' : 'would write'} ${marked} markers, of ${classes.length} classes. Failed: ${failed}.`);
else console.log(`${apply ? 'Stripped' : 'Would strip'} ${stripped}, skipped ${skipped}, of ${classes.length} classes. Failed: ${failed}.`);
if (classes.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
