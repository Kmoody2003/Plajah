// Removes every readable child password left by the old "parent can always see it" flow:
// users/{child}.parentalControls.savedChildPassword and learnerCredentials/{username}.savedPassword.
// Hashes stay, so children can still sign in. Dry run by default; nothing changes without --apply.
//   npx tsx --env-file=.env.local scripts/purgeChildPasswords.ts [--apply]
import { fsGet, fsPatch, fsQuery, fsSet } from '../services/firebaseAdminRest';

const apply = process.argv.includes('--apply');
const children = await fsQuery('users', [{ field: 'isChild', value: true }], 5000);
let profiles = 0, creds = 0, failed = 0;
for (const { id, data } of children) {
  const { savedChildPassword, ...controls } = data.parentalControls || {};
  if (savedChildPassword !== undefined) {
    profiles++;
    if (apply && !(await fsPatch(`users/${id}`, { parentalControls: controls }))) failed++;
  }
  const username = String(data.username || '').toLowerCase();
  const cred = username ? await fsGet(`learnerCredentials/${username}`) : null;
  if (cred && cred.savedPassword !== undefined) {
    creds++;
    const { savedPassword, ...rest } = cred;
    if (apply && !(await fsSet(`learnerCredentials/${username}`, rest))) failed++;
  }
}
console.log(`${apply ? 'Removed' : 'Would remove'}: ${profiles} from profiles, ${creds} from credentials, of ${children.length} child accounts. Failed: ${failed}.`);
if (children.length >= 5000) console.log('Hit the 5000 row limit: run again.');
process.exit(failed ? 1 : 0);
