// Sets isPrivate: false on videos that never had the field, so they stay in public lists once the rules
// require where isPrivate == false. A video with no flag has always been treated as public. Dry run unless
// --apply. Run before deploying the rules; rerun after, for videos created in between.
//   npx tsx --env-file=.env.local scripts/migrateVideoPrivacy.ts [--apply]
import { fsList, fsPatch } from '../services/firebaseAdminRest';

const apply = process.argv.includes('--apply');
const LIMIT = 200000;
const videos = await fsList('videos', { pageSize: 300, maxDocs: LIMIT });
let changed = 0, failed = 0;
for (const { id, data } of videos) {
  if (typeof data.isPrivate === 'boolean') continue;
  changed++;
  if (apply && !(await fsPatch(`videos/${id}`, { isPrivate: false }))) failed++;
}
console.log(`${apply ? 'Marked' : 'Would mark'} ${changed} of ${videos.length} videos public. Failed: ${failed}.`);
if (videos.length >= LIMIT) console.log(`Hit the ${LIMIT} row limit: raise it and run again.`);
process.exit(failed ? 1 : 0);
