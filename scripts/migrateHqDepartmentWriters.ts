// Stamps hqWriteUids on every open org file that belongs to a department, so rules can stop other staff writing or
// trashing it by exact id. Dry run unless --apply. Safe to rerun; the app keeps the stamps current afterwards.
//
//   npx tsx --env-file=.env.local scripts/migrateHqDepartmentWriters.ts [--apply]
//
// Run before deploying the ops rules: an unstamped file keeps the old staff-wide behavior, so order only affects how
// soon the gap closes.
import { fsList, fsPatch, fsQuery, fsGetStrict } from '../services/firebaseAdminRest';
import { hqWriteUidsFor } from '../services/hqAccessPolicy';

const apply = process.argv.includes('--apply');
const LIMIT = 200000;
const assets = await fsList('orgAssets', { strict: true, pageSize: 300, maxDocs: LIMIT });
const orgs = new Map<string, { org: Record<string, any> | null; members: Record<string, any>[] }>();
let stamped = 0, cleared = 0, kept = 0, failed = 0;

for (const { id, data } of assets) {
  if (data.scopeKind !== 'org' || !data.scopeId || (data.access || 'open') !== 'open') continue;
  if (!orgs.has(data.scopeId)) {
    const org = await fsGetStrict(`organizations/${data.scopeId}`);
    const members = org ? (await fsQuery('orgMemberships', [{ field: 'orgId', value: data.scopeId }], 5000)).map(r => r.data) : [];
    orgs.set(data.scopeId, { org, members });
  }
  const { org, members } = orgs.get(data.scopeId)!;
  if (!org) continue;
  const next = hqWriteUidsFor(data, org, members);
  if (next === null && data.hqWriteUids === undefined) { kept++; continue; }
  if (next && (data.hqWriteUids || []).join() === next.join()) { kept++; continue; }
  if (next) stamped++; else cleared++;
  if (apply && !(await fsPatch(`orgAssets/${id}`, { hqWriteUids: next ?? undefined }))) failed++;
}
console.log(`${apply ? 'Stamped' : 'Would stamp'} ${stamped}, ${apply ? 'cleared' : 'would clear'} ${cleared}, left ${kept}, of ${assets.length} files. Failed: ${failed}.`);
if (assets.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
