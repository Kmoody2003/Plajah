// Plajah ID phase 1 backfill (docs/plajah-id.md). Dry run unless --apply is passed.
//   npx tsx scripts/plajahIdBackfill.ts            count who would get an ID
//   npx tsx scripts/plajahIdBackfill.ts --apply    mint them (idempotent: existing IDs are kept)
// Needs GOOGLE_SERVICE_ACCOUNT_JSON (the same service account plajah-api uses).
//
// People: every users/{uid} that is a real sign-in (managed `prov_…` / `emp_…` profiles have no login and
// get their ID when the person claims the seat). Their `pjid` auth claim is set too.
// Orgs: every non-demo organizations/{id}; its creator's person ID becomes the first controller.
// Signed-in people are also minted live by POST /api/plajah-id/me, so running this twice — or while the
// app is minting — is safe: every create is precondition-guarded (services/plajahId/store.ts).

import { fsList, setCustomClaims, getCustomClaims } from '../services/firebaseAdminRest';
import { ensurePersonId, ensureOrgId, personIdForUid } from '../services/plajahId/store';

const APPLY = process.argv.includes('--apply');
const isLogin = (uid: string) => !!uid && !uid.startsWith('prov_') && !uid.startsWith('emp_');

async function main() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Set GOOGLE_SERVICE_ACCOUNT_JSON first.');
  const users = await fsList('users', { idsOnly: true, pageSize: 300, maxDocs: 500_000, strict: true });
  const orgs = await fsList('organizations', { pageSize: 300, maxDocs: 100_000, strict: true });
  const people = users.map(u => u.id).filter(isLogin);
  const realOrgs = orgs.filter(o => !o.data.isDemo);
  console.log(`${people.length} sign-in accounts, ${realOrgs.length} organizations${APPLY ? '' : ' (dry run — pass --apply to mint)'}`);

  let have = 0, made = 0, failed = 0;
  for (const uid of people) {
    try {
      if (!APPLY) { if (await personIdForUid(uid)) have++; continue; }
      const r = await ensurePersonId(uid, 'unknown', 'system');
      r.created ? made++ : have++;
      const claims = await getCustomClaims(uid);
      if (claims.pjid !== r.id) await setCustomClaims(uid, { pjid: r.id });
    } catch (e: any) { failed++; console.warn('person', uid, e?.message || e); }
  }
  console.log(`people: ${have} already had one, ${made} minted, ${failed} failed`);

  let oHave = 0, oMade = 0, oFailed = 0;
  for (const o of realOrgs) {
    try {
      if (!APPLY) continue;
      const creator = String(o.data.creatorId || o.data.accountUid || '');
      const controller = isLogin(creator) ? (await ensurePersonId(creator, 'unknown', 'system')).id : null;
      const r = await ensureOrgId(o.id, controller, 'system');
      r.created ? oMade++ : oHave++;
    } catch (e: any) { oFailed++; console.warn('org', o.id, e?.message || e); }
  }
  if (APPLY) console.log(`orgs: ${oHave} already had one, ${oMade} minted, ${oFailed} failed`);
}

main().catch(e => { console.error(e?.message || e); process.exit(1); });
