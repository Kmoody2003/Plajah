// Marks publicly listed creator courses enrollment: 'open' so self-enrollment keeps working once the rules
// default every class to closed. Everything else stays closed and joins by teacher add or join code.
// A class is left closed if it is academic, a church class, or owned by an account that isn't listable
// (a child's class). Dry run prints what it would open: read that list. Unchanged without --apply.
// Run before deploying the rules.
//   npx tsx --env-file=.env.local scripts/migrateClassEnrollment.ts [--apply]
import { fsGet, fsList, fsPatch } from '../services/firebaseAdminRest';

const apply = process.argv.includes('--apply');
const LIMIT = 50000;
const classes = await fsList('classrooms', { pageSize: 300, maxDocs: LIMIT });
let opened = 0, failed = 0, kept = 0;
for (const { id, data } of classes) {
  if (data.enrollment) continue;
  const isCreator = data.track === 'CREATOR';
  const isChurch = (Array.isArray(data.tags) ? data.tags : []).some((t: unknown) => String(t).startsWith('church'));
  const owner = isCreator && !isChurch ? await fsGet(`users/${data.ownerId}`) : null;
  const ownerIsChild = !!owner && (owner.isChild === true || owner.accountType === 'CHILD');
  if (!isCreator || isChurch || ownerIsChild || data.status === 'DRAFT') { kept++; continue; }
  opened++;
  console.log(`open: ${id}  "${data.title}"  owner ${data.ownerId}  ${(data.enrolledStudents || []).length} enrolled`);
  if (apply && !(await fsPatch(`classrooms/${id}`, { enrollment: 'open' }))) failed++;
}
console.log(`${apply ? 'Opened' : 'Would open'} ${opened}; ${kept} stay closed, of ${classes.length} classes. Failed: ${failed}.`);
if (classes.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
