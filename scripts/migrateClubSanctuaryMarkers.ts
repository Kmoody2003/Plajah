// Writes the markers firestore.rules gate private clubs and gated sanctuary content on. Dry run unless --apply.
// Run before deploying the rules, and again after, for anything joined in between. Safe to rerun.
//   npx tsx --env-file=.env.local scripts/migrateClubSanctuaryMarkers.ts [--apply]
import { fsGetStrict, fsList, fsPatch, fsSet } from '../services/firebaseAdminRest';

const apply = process.argv.includes('--apply');
const opts = { pageSize: 300, maxDocs: 500000 };
const counts: Record<string, number> = {};
let failed = 0;
const write = async (kind: string, ok: () => Promise<boolean>) => {
  counts[kind] = (counts[kind] || 0) + 1;
  if (apply && !(await ok())) failed++;
};

// Clubs: every ACTIVE membership gets clubMemberIndex/{clubId}_{uid}.
for (const { data } of await fsList('clubMemberships', opts)) {
  if (data.status !== 'ACTIVE' || !data.clubId || !data.userId) continue;
  const id = `${data.clubId}_${data.userId}`;
  await write('club markers', () => fsSet(`clubMemberIndex/${id}`, { clubId: data.clubId, userId: data.userId, at: Number(data.joinedAt) || Date.now() }));
}

// Sanctuary memberships an older client created at a random id move to the {creator}_{member} id the rules read.
for (const { id, data } of await fsList('sanctuaryMemberships', opts)) {
  if (!data.creatorId || !data.memberId) continue;
  const want = `${data.creatorId}_${data.memberId}`;
  if (id === want || data.status !== 'ACTIVE') continue;
  if (await fsGetStrict(`sanctuaryMemberships/${want}`)) continue;
  await write('memberships re-keyed', () => fsSet(`sanctuaryMemberships/${want}`, { ...data, id: want }));
}

// Public previews say FREE, which is what the rules and a non-member's query look for.
for (const { id, data } of await fsList('sanctuaryContent', opts)) {
  if (data.isPublicPreview === true && data.accessType !== 'FREE') await write('previews marked FREE', () => fsPatch(`sanctuaryContent/${id}`, { accessType: 'FREE' }));
}

// One-time purchases become unlock markers.
for (const { data } of await fsList('sanctuaryPurchases', opts)) {
  if (!data.buyerId || !data.itemId) continue;
  await write('unlocks', () => fsSet(`sanctuaryUnlocks/${data.buyerId}_${data.itemId}`, { uid: data.buyerId, itemId: data.itemId, sanctuaryId: data.sanctuaryId || '', at: Number(data.purchasedAt) || Date.now() }));
}

// Public pledge totals from real pledges.
const totals = new Map<string, { raised: number; backers: number }>();
for (const { data } of await fsList('sanctuaryPledges', opts)) {
  if (!data.sanctuaryId) continue;
  const t = totals.get(data.sanctuaryId) || { raised: 0, backers: 0 };
  t.raised += Number(data.amount) || 0; t.backers++;
  totals.set(data.sanctuaryId, t);
}
for (const [id, t] of totals) await write('pledge totals', () => fsSet(`sanctuaryPledgeTotals/${id}`, { ...t, updatedAt: Date.now() }));

console.log(`${apply ? 'Wrote' : 'Would write'}:`, counts, `Failed: ${failed}.`);
process.exit(failed ? 1 : 0);
