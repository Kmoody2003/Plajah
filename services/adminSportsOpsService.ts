import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { auth, db } from './backendService';

export interface SportsAgentRunView {
  id: string;
  status: 'completed' | 'failed' | 'skipped';
  reason: string;
  scope: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  leagues: string[];
  counts: Record<string, number>;
  errors: { label: string; message: string }[];
  updatedAt?: number;
}

export interface SportsEventResearchView {
  id: string;
  league: string;
  eventId: string;
  name: string;
  shortName?: string;
  date?: string;
  status?: string;
  venue?: string;
  competitors?: { teamId?: string; teamName?: string; homeAway?: string; score?: string }[];
  investigatedTeams?: any[];
  researchFocus?: string[];
  updatedAt?: number;
}

const unwrapEnvelope = <T>(docSnap: any): T & { id: string; updatedAt?: number } => {
  const envelope = docSnap.data();
  return {
    id: docSnap.id,
    ...(envelope?.data ?? {}),
    updatedAt: envelope?.updatedAt,
  };
};

export async function fetchSportsAgentRuns(max = 12): Promise<SportsAgentRunView[]> {
  const snap = await getDocs(query(collection(db, 'sports_ingestion_runs'), orderBy('updatedAt', 'desc'), limit(max)));
  return snap.docs.map(docSnap => unwrapEnvelope<SportsAgentRunView>(docSnap));
}

export async function fetchSportsEventResearch(max = 18): Promise<SportsEventResearchView[]> {
  const snap = await getDocs(query(collection(db, 'sports_game_event_research'), orderBy('updatedAt', 'desc'), limit(max)));
  return snap.docs.map(docSnap => unwrapEnvelope<SportsEventResearchView>(docSnap));
}

export async function runCloudSportsResearchJob(options: {
  scope?: 'lite' | 'standard' | 'deep';
  leagues?: string[];
  investigateEvents?: boolean;
  includeHistory?: boolean;
  maxEventsPerLeague?: number;
  maxTeamsPerLeague?: number;
  maxPlayersPerTeam?: number;
}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Admin authentication required');
  const res = await fetch('/api/sports/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(options),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Sports research job failed');
  return json as SportsAgentRunView;
}

export const SPORTS_RESEARCH_WINDOWS = ['2:00 AM', '6:00 AM', '9:00 AM', '12:00 PM', '4:00 PM', '7:00 PM', '9:00 PM'];

export const LOCAL_AGENT_COMMAND = 'npm run sports:agent -- --scope=deep --investigate-events --device-local';
