// Plajah Sports Archive Agent — bulk-ingests historical league data from
// non-API repositories and official league sources into Firestore.
//
//   npm run sports:archive                       (default: recent decade)
//   npm run sports:archive -- --nfl=2000-2024 --f1=1950-2025 --mlb=1980,1986,2000 --pdfs
//
// Sign-in uses the same admin device agent env vars as the sports agent:
//   PLAJAH_AGENT_EMAIL / PLAJAH_AGENT_PASSWORD
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/backendService';
import { runArchiveIngestion } from '../services/sportsArchiveSourcesService';

function parseRange(arg?: string): number[] | undefined {
  if (!arg) return undefined;
  const out = new Set<number>();
  for (const part of arg.split(',')) {
    const m = part.match(/^(\d{4})-(\d{4})$/);
    if (m) for (let y = Number(m[1]); y <= Number(m[2]); y++) out.add(y);
    else if (/^\d{4}$/.test(part)) out.add(Number(part));
  }
  return out.size ? [...out].sort() : undefined;
}

function readArg(name: string) {
  const exact = process.argv.find(a => a.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? 'true' : undefined;
}

const thisYear = new Date().getFullYear();
const defaultDecade = Array.from({ length: 10 }, (_, i) => thisYear - 9 + i);

const options = {
  nflSeasons: parseRange(readArg('nfl')) ?? defaultDecade,
  mlbSeasons: parseRange(readArg('mlb')) ?? defaultDecade,
  nhlSeasons: parseRange(readArg('nhl')) ?? defaultDecade,
  f1Years:    parseRange(readArg('f1'))  ?? defaultDecade,
  ingestPdfs: readArg('pdfs') === 'true',
};

console.log('[Plajah Archive Agent] Starting ingestion', {
  nfl: `${options.nflSeasons[0]}–${options.nflSeasons[options.nflSeasons.length - 1]}`,
  mlb: `${options.mlbSeasons[0]}–${options.mlbSeasons[options.mlbSeasons.length - 1]}`,
  nhl: `${options.nhlSeasons[0]}–${options.nhlSeasons[options.nhlSeasons.length - 1]}`,
  f1:  `${options.f1Years[0]}–${options.f1Years[options.f1Years.length - 1]}`,
  pdfs: options.ingestPdfs,
});

if (!auth.currentUser && process.env.PLAJAH_AGENT_EMAIL && process.env.PLAJAH_AGENT_PASSWORD) {
  await signInWithEmailAndPassword(auth, process.env.PLAJAH_AGENT_EMAIL, process.env.PLAJAH_AGENT_PASSWORD);
  console.log('[Plajah Archive Agent] Signed in as admin device agent');
} else if (!auth.currentUser) {
  console.warn('[Plajah Archive Agent] No agent credentials — fetches will run but Firestore writes will be skipped.');
}

const summary = await runArchiveIngestion(options);
console.log('[Plajah Archive Agent] Finished');
for (const s of summary.steps) console.log(`  ${s.step}: ${s.count}`);
if (summary.errors.length) console.log('Errors:', summary.errors);
process.exit(0);
