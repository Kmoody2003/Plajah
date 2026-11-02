// Moves finance fields off the world-readable organizations/{id} doc into organizations/{id}/private/finance, sets the
// public canReceiveGiving / donorFeeCoverOff flags and builds stripeAccountOrgs/{acct}. Dry run unless --apply.
//
//   npx tsx --env-file=.env.local scripts/migrateOrgFinance.ts --phase=copy [--apply]
//   npx tsx --env-file=.env.local scripts/migrateOrgFinance.ts --phase=strip [--apply]
//
// Order: copy, deploy rules + server + client, copy again (catches writes made in between), strip.
// Copy never overwrites a value already on the private doc, because after the cutover that one is newer.
// Strip only removes a field once a value is confirmed on the private doc.
import { fsGetStrict, fsList, fsPatch } from '../services/firebaseAdminRest';
import { ORG_FINANCE_KEYS } from '../services/orgFinanceCore';

const apply = process.argv.includes('--apply');
const phase = (process.argv.find(a => a.startsWith('--phase=')) || '').split('=')[1];
if (phase !== 'copy' && phase !== 'strip') { console.error('Pass --phase=copy or --phase=strip'); process.exit(2); }

const LIMIT = 50000;
const orgs = await fsList('organizations', { strict: true, pageSize: 300, maxDocs: LIMIT });
let copied = 0, flagged = 0, indexed = 0, stripped = 0, skipped = 0, failed = 0;

for (const { id, data } of orgs) {
  const present = ORG_FINANCE_KEYS.filter(k => data[k] !== undefined);
  const priv = (await fsGetStrict(`organizations/${id}/private/finance`)) || {};
  if (phase === 'copy') {
    const next = Object.fromEntries(present.filter(k => priv[k] === undefined).map(k => [k, data[k]]));
    if (Object.keys(next).length) { copied++; if (apply && !(await fsPatch(`organizations/${id}/private/finance`, next))) failed++; }
    const acct = priv.stripeAccountId || data.stripeAccountId;
    const fees = (priv.financeSettings || data.financeSettings)?.donorCoversFees === false;
    const flags: Record<string, unknown> = {};
    if (acct && data.canReceiveGiving !== true) flags.canReceiveGiving = true;
    if (fees !== (data.donorFeeCoverOff === true)) flags.donorFeeCoverOff = fees;
    if (Object.keys(flags).length) { flagged++; if (apply && !(await fsPatch(`organizations/${id}`, flags))) failed++; }
    if (acct && (await fsGetStrict(`stripeAccountOrgs/${acct}`))?.orgId !== id) {
      indexed++;
      if (apply && !(await fsPatch(`stripeAccountOrgs/${acct}`, { orgId: id, at: Date.now() }))) failed++;
    }
  } else {
    if (!present.length) continue;
    const missing = present.filter(k => priv[k] === undefined);
    if (missing.length) { skipped++; console.log(`Skipping ${id}: not on private doc yet: ${missing.join(', ')}`); continue; }
    stripped++;
    // An updateMask naming a field with no value deletes it.
    if (apply && !(await fsPatch(`organizations/${id}`, Object.fromEntries(present.map(k => [k, undefined]))))) failed++;
  }
}
if (phase === 'copy') console.log(`${apply ? 'Copied' : 'Would copy'} ${copied}, ${apply ? 'flagged' : 'would flag'} ${flagged}, ${apply ? 'indexed' : 'would index'} ${indexed}, of ${orgs.length} orgs. Failed: ${failed}.`);
else console.log(`${apply ? 'Stripped' : 'Would strip'} ${stripped}, skipped ${skipped}, of ${orgs.length} orgs. Failed: ${failed}.`);
if (orgs.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
