// Moves private fields off the world-readable users/{uid} doc into users/{uid}/private/profile, marks who
// may appear in list queries, and rebuilds each guardian's childUids. Dry run unless --apply.
//
//   npx tsx --env-file=.env.local scripts/migrateUserPrivate.ts --phase=copy [--apply]
//   npx tsx --env-file=.env.local scripts/migrateUserPrivate.ts --phase=strip [--apply]
//
// Order: copy, deploy indexes and wait for them to build, deploy rules + client, copy again (catches
// accounts made in between), strip. Copy leaves the public doc alone, so it is safe to rerun.
// Strip only removes a field once the same value is confirmed on the private doc.
import { fsGetStrict, fsList, fsPatch } from '../services/firebaseAdminRest';

const FIELDS = ['email', 'birthYear', 'dateOfBirth', 'guardianUid', 'coGuardianUids', 'provisionedByTeacherUid', 'childUids', 'parentalControls'];
const apply = process.argv.includes('--apply');
const phase = (process.argv.find(a => a.startsWith('--phase=')) || '').split('=')[1];
if (phase !== 'copy' && phase !== 'strip') { console.error('Pass --phase=copy or --phase=strip'); process.exit(2); }

const LIMIT = 200000;
const users = await fsList('users', { strict: true, pageSize: 300, maxDocs: LIMIT });
const isKid = (d: Record<string, any>) => {
  if (d.isChild === true || d.accountType === 'CHILD' || d.guardianUid || d.provisionedByTeacherUid || d.childState) return true;
  const year = typeof d.birthYear === 'number' ? d.birthYear : 0;
  return year > 0 && new Date().getFullYear() - year < 19;
};

let copied = 0, marked = 0, stripped = 0, skipped = 0, failed = 0;
const odd: string[] = [];

if (phase === 'copy') {
  const kidsByGuardian = new Map<string, Set<string>>();
  for (const { id, data } of users) {
    if (data.guardianUid) {
      if (!kidsByGuardian.has(data.guardianUid)) kidsByGuardian.set(data.guardianUid, new Set());
      kidsByGuardian.get(data.guardianUid)!.add(id);
      if (data.isChild !== true) odd.push(id);
    }
  }
  for (const { id, data } of users) {
    const existing = (await fsGetStrict(`users/${id}/private/profile`)) || {};
    const next: Record<string, unknown> = {};
    for (const k of FIELDS) if (data[k] !== undefined && existing[k] === undefined) next[k] = data[k];
    // A password must not follow the controls across (the trust branch purge may not have run yet).
    if (next.parentalControls && typeof next.parentalControls === 'object') {
      const { savedChildPassword: _gone, ...rest } = next.parentalControls as Record<string, unknown>;
      next.parentalControls = rest;
    }
    const kids = kidsByGuardian.get(id);
    if (kids) next.childUids = [...new Set([...(existing.childUids || []), ...((data.childUids as string[]) || []), ...kids])];
    if (Object.keys(next).length) {
      copied++;
      if (apply && !(await fsPatch(`users/${id}/private/profile`, next))) failed++;
    }
    if (data.listable === undefined) {
      marked++;
      if (apply && !(await fsPatch(`users/${id}`, { listable: !isKid(data) }))) failed++;
    }
  }
  console.log(`${apply ? 'Copied' : 'Would copy'} private fields for ${copied}; ${apply ? 'marked' : 'would mark'} listable on ${marked}, of ${users.length} users. Failed: ${failed}.`);
  if (odd.length) console.log(`Have a guardian but not isChild (review these): ${odd.slice(0, 50).join(', ')}`);
} else {
  for (const { id, data } of users) {
    const present = FIELDS.filter(k => data[k] !== undefined);
    if (!present.length) continue;
    const priv = (await fsGetStrict(`users/${id}/private/profile`)) || {};
    // savedChildPassword is dropped on purpose, so controls aren't compared key for key.
    const missing = present.filter(k => priv[k] === undefined && !(k === 'email' && data.email === ''));
    if (missing.length) { skipped++; console.log(`Skipping ${id}: not on private doc yet: ${missing.join(', ')}`); continue; }
    stripped++;
    // An updateMask naming a field with no value deletes it.
    if (apply && !(await fsPatch(`users/${id}`, Object.fromEntries(present.map(k => [k, undefined]))))) failed++;
  }
  console.log(`${apply ? 'Stripped' : 'Would strip'} ${stripped}, skipped ${skipped}, of ${users.length} users. Failed: ${failed}.`);
}
if (users.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
