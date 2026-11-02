// READ-ONLY audit: which collaborator shares from before the split ledger (services/splitPayouts.ts) were
// never paid? Old code skipped recipients without Connect and only logged failed transfers, so these sales
// left no record of the miss. Prints a CSV of lines with no matching Stripe transfer. Writes nothing and moves
// no money. Old transfers carry no earning id, so matches are by amount, parties and time: review before paying.
//
//   STRIPE_SECRET_KEY=... npx tsx scripts/auditLegacySplits.ts [--key service-account.json] > unpaid-splits.csv
import Stripe from 'stripe';
import { loadServiceAccount, preflightCredentials, CREDENTIAL_HELP } from './loadLocalEnv';
import { unmatchedLegacySplits, type SplitLine } from '../services/splitPayouts';

const creds = loadServiceAccount(process.argv.slice(2));
if (!creds.ok) { console.error(creds.error, CREDENTIAL_HELP); process.exit(1); }
const preflight = await preflightCredentials();
if (!preflight.ok) { console.error(preflight.message); process.exit(1); }
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('Set STRIPE_SECRET_KEY'); process.exit(1); }

const { fsGet, fsList } = await import('../services/firebaseAdminRest');
const stripe = new Stripe(key);

const parseSplits = (raw: unknown): SplitLine[] => {
  try { const v = JSON.parse(String(raw ?? '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
};

const earnings = await fsList('creatorEarnings', { pageSize: 300, maxDocs: 500_000 });
const legacy = earnings
  .filter(e => e.data.splitLedger !== true && e.data.status !== 'paid_direct' && parseSplits(e.data.splits).length > 0)
  .sort((a, b) => a.data.timestamp - b.data.timestamp);
const since = legacy[0]?.data.timestamp ?? Date.now();

const transfersByDestination = new Map<string, any[]>();
async function transfersTo(destination: string): Promise<any[]> {
  if (!transfersByDestination.has(destination)) {
    const all: any[] = [];
    for await (const t of stripe.transfers.list({ destination, created: { gte: Math.floor(since / 1000) - 3600 }, limit: 100 })) all.push(t);
    transfersByDestination.set(destination, all);
  }
  return transfersByDestination.get(destination)!;
}

console.log('earningId,timestamp,status,fromCreatorUid,recipientUid,amountCents,category,recipientHasConnect');
const used = new Set<string>();
let unpaid = 0, unpaidCents = 0;
for (const { id, data: e } of legacy) {
  for (const line of parseSplits(e.splits)) {
    const dest = (await fsGet(`users/${line.creatorUid}`))?.stripeConnectAccountId as string | undefined;
    const transfers = dest ? await transfersTo(dest) : [];
    if (!unmatchedLegacySplits({ creatorUid: e.creatorUid, category: e.category, timestamp: e.timestamp, splits: [line] }, transfers, used).length) continue;
    unpaid++; unpaidCents += line.amountCents;
    console.log([id, new Date(e.timestamp).toISOString(), e.status, e.creatorUid, line.creatorUid, line.amountCents, e.category, dest ? 'yes' : 'no'].join(','));
  }
}
console.error(`${earnings.length} earnings read, ${legacy.length} legacy sales with splits, ${unpaid} unpaid lines, $${(unpaidCents / 100).toFixed(2)} owed. Refunded sales still appear: check the status column.`);
