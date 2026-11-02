// Moves staffUids + staffSeats off public businessPages/{id} docs into private/staff, stripeAccountId into private/finance,
// and builds staffPageIndex/{uid}.pageIds. Dry run unless --apply.
//
//   npx tsx --env-file=.env.local scripts/migrateBusinessPrivate.ts --phase=copy [--apply]
//   npx tsx --env-file=.env.local scripts/migrateBusinessPrivate.ts --phase=strip [--apply]
//
// Order: copy, deploy rules + server + client, copy again, reconcile the ops mirror (/api/ops-mirror/sync or the
// 15-minute reconcile: the mirror must hold seats from private/staff before the strip), strip.
// Copy adds seats missing from the private doc and never changes one already there. The new server removes a seat
// from the public copy as well, so a removal can't come back.
import { fsGetStrict, fsList, fsPatch } from '../services/firebaseAdminRest';

const apply = process.argv.includes('--apply');
const phase = (process.argv.find(a => a.startsWith('--phase=')) || '').split('=')[1];
if (phase !== 'copy' && phase !== 'strip') { console.error('Pass --phase=copy or --phase=strip'); process.exit(2); }

const LIMIT = 50000;
const pages = await fsList('businessPages', { strict: true, pageSize: 300, maxDocs: LIMIT });
let copied = 0, indexed = 0, stripped = 0, skipped = 0, failed = 0;
const people = new Map<string, Set<string>>();

for (const { id, data } of pages) {
  const uids: string[] = Array.isArray(data.staffUids) ? data.staffUids : [];
  const staff = (await fsGetStrict(`businessPages/${id}/private/staff`)) || {};
  const fin = (await fsGetStrict(`businessPages/${id}/private/finance`)) || {};
  if (phase === 'copy') {
    const allUids = [...new Set([...(staff.staffUids || []), ...uids])];
    const allSeats = { ...(data.staffSeats || {}), ...(staff.staffSeats || {}) };
    if (uids.length && (allUids.length !== (staff.staffUids || []).length || Object.keys(allSeats).length !== Object.keys(staff.staffSeats || {}).length)) {
      copied++;
      if (apply && !(await fsPatch(`businessPages/${id}/private/staff`, { staffUids: allUids, staffSeats: allSeats }))) failed++;
    }
    if (data.stripeAccountId && !fin.stripeAccountId) {
      copied++;
      if (apply && !(await fsPatch(`businessPages/${id}/private/finance`, { stripeAccountId: data.stripeAccountId }))) failed++;
    }
    for (const u of allUids) { if (!people.has(u)) people.set(u, new Set()); people.get(u)!.add(id); }
  } else {
    const present = ['staffUids', 'staffSeats', 'stripeAccountId'].filter(k => data[k] !== undefined);
    if (!present.length) continue;
    const seatsMissing = uids.some(u => !(staff.staffUids || []).includes(u));
    const acctMissing = data.stripeAccountId && !fin.stripeAccountId;
    if (seatsMissing || acctMissing) { skipped++; console.log(`Skipping ${id}: not on private docs yet`); continue; }
    stripped++;
    if (apply && !(await fsPatch(`businessPages/${id}`, Object.fromEntries(present.map(k => [k, undefined]))))) failed++;
  }
}
if (phase === 'copy') {
  for (const [uid, ids] of people) {
    const cur = (await fsGetStrict(`staffPageIndex/${uid}`))?.pageIds || [];
    const next = [...new Set([...cur, ...ids])];
    if (next.length !== cur.length) { indexed++; if (apply && !(await fsPatch(`staffPageIndex/${uid}`, { pageIds: next, updatedAt: Date.now() }))) failed++; }
  }
  console.log(`${apply ? 'Copied' : 'Would copy'} ${copied}, ${apply ? 'indexed' : 'would index'} ${indexed} people, of ${pages.length} pages. Failed: ${failed}.`);
} else console.log(`${apply ? 'Stripped' : 'Would strip'} ${stripped}, skipped ${skipped}, of ${pages.length} pages. Failed: ${failed}.`);
if (pages.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
