// Refuses a release that would quietly undo work already shipped. A merge can resolve a conflict the wrong way,
// or a stale branch can bring old code back, and neither shows up as a failed build. Runs first in the deploy
// workflow and in scripts/hooks/pre-push.
//
//   node scripts/checkShippedWork.mjs            checks the files on disk
//   node scripts/checkShippedWork.mjs <commit>   checks a commit
//
// When a shipped behaviour is deliberately replaced, change its entry here in the same commit, and say why there.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const SHIPPED = [
  {
    name: 'Direct payments (Plajah holds no seller money)',
    files: ['services/payments/directRoute.ts', 'services/payments/saleFees.ts', 'services/splitPayouts.ts', 'tests/directRoute.test.ts', 'tests/splitPayouts.test.ts'],
    contains: {
      'server.ts': ['prepareSale(', 'recordCreatorSale(', 'readCreatorSplits(', 'stripeSessionsFulfilled', 'MERCH_PAUSED'],
      'routes/sponsorCopies.ts': ['paymentRouting(', 'reverse_transfer'],
      'routes/pod.ts': ['application_fee_amount', "status: 'paid_direct'"],
      'services/stripeService.ts': ['creatorShare: 2.99', 'creatorShare: 5.99', 'creatorShare: 9.99'],
    },
    absent: {
      // The abandoned payment path recorded renewals under this prefix, which would pay them twice.
      'server.ts': ['cs_inv_', 'payCreatorEarning(', 'payPendingCreatorEarnings('],
      'services/patronageAdService.ts': ['Zero-KYC Firestore Ledger fallback'],
    },
  },
  {
    name: 'Content HQ account wall and privacy',
    files: ['services/hqScopeWall.ts', 'services/hqAccessPolicy.ts', 'services/userScope.ts', 'services/userPrivate.ts', 'routes/elevateAccess.ts', 'routes/coeditSecurity.ts', 'docs/TRUST_ROLLOUT.md'],
    contains: { 'firestore.rules': ['userPrivateKeys()'] },
    absent: {},
  },
];

const ref = process.argv[2];
const read = (path) => {
  if (!ref) return existsSync(path) ? readFileSync(path, 'utf8') : null;
  try { return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
};

const problems = [];
for (const work of SHIPPED) {
  for (const file of work.files) if (read(file) === null) problems.push(`${work.name}: ${file} is missing`);
  for (const [file, needles] of Object.entries(work.contains)) {
    const text = read(file);
    for (const needle of needles) if (!text?.includes(needle)) problems.push(`${work.name}: ${file} no longer has "${needle}"`);
  }
  for (const [file, needles] of Object.entries(work.absent)) {
    const text = read(file) ?? '';
    for (const needle of needles) if (text.includes(needle)) problems.push(`${work.name}: ${file} brought back "${needle}"`);
  }
}

if (problems.length) {
  console.error(`This release would undo shipped work:\n${problems.map(p => `  - ${p}`).join('\n')}\nIf that is deliberate, update scripts/checkShippedWork.mjs in the same commit.`);
  process.exit(1);
}
console.log(`Shipped work intact: ${SHIPPED.map(w => w.name).join('; ')}.`);
