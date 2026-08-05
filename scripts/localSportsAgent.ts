import { runSportsIngestionWorker, type SportsIngestionScope } from '../services/sportsIngestionWorker';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/backendService';

function readArg(name: string) {
  const exact = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? 'true' : undefined;
}

function readNumberArg(name: string) {
  const value = readArg(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const scope = (readArg('scope') || 'standard') as SportsIngestionScope;
const leagues = readArg('leagues')?.split(',').map(v => v.trim()).filter(Boolean);
const investigateEvents = readArg('investigate-events') !== 'false';
const includeHistory = readArg('history') !== 'false';

console.log('[Plajah Sports Local Agent] Starting research run', {
  scope,
  leagues: leagues?.length ? leagues : 'all',
  investigateEvents,
  includeHistory,
});

if (!auth.currentUser && process.env.PLAJAH_AGENT_EMAIL && process.env.PLAJAH_AGENT_PASSWORD) {
  await signInWithEmailAndPassword(auth, process.env.PLAJAH_AGENT_EMAIL, process.env.PLAJAH_AGENT_PASSWORD);
  console.log('[Plajah Sports Local Agent] Signed in as admin device agent');
}

const summary = await runSportsIngestionWorker({
  scope,
  leagues,
  investigateEvents,
  includeHistory,
  reason: readArg('device-local') ? 'local_device_agent' : 'local_agent',
  maxEventsPerLeague: readNumberArg('max-events'),
  maxTeamsPerLeague: readNumberArg('max-teams'),
  maxPlayersPerTeam: readNumberArg('max-players'),
});

console.log('[Plajah Sports Local Agent] Finished');
console.log(JSON.stringify(summary, null, 2));
