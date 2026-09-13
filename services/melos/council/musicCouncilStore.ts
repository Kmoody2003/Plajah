// musicCouncilStore — client-side persistence for the Music Council: a short history of the questions
// you asked, and running counts of which expert LED the plan you actually used. The art council keeps
// evolving profiles server-side; the music council is client-only for now, so this lives in localStorage.
import type { MusicBrief, MusicDeliberation, MusicPersonaId } from './musicCouncilTypes';

const KEY = 'plajah_music_council_v1';
const MAX = 40;

export interface CouncilSession {
  id: string;
  at: number;
  ask: string;
  genre?: string;
  platform?: string;
  leadPersona?: MusicPersonaId;   // whose move topped the plan
  grounded: boolean;
  source: 'ai' | 'local';
  used?: boolean;                 // the user marked the plan as followed
}
interface Store { sessions: CouncilSession[]; leadCounts: Partial<Record<MusicPersonaId, number>>; }

function load(): Store {
  try { const s = JSON.parse(localStorage.getItem(KEY) || ''); if (s && Array.isArray(s.sessions)) return s; } catch { /* */ }
  return { sessions: [], leadCounts: {} };
}
function save(s: Store): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ } }

/** Record a deliberation. The lead is the persona whose move heads the plan (else the first proposal). */
export function saveSession(brief: MusicBrief, del: MusicDeliberation): CouncilSession {
  const s = load();
  const lead = del.plan?.find((m) => m.personaId)?.personaId || del.proposals?.[0]?.personaId;
  const sess: CouncilSession = {
    id: 'cs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: Date.now(), ask: brief.ask, genre: brief.genre, platform: brief.platform,
    leadPersona: lead, grounded: del.grounded, source: del.source,
  };
  s.sessions.unshift(sess);
  if (s.sessions.length > MAX) s.sessions = s.sessions.slice(0, MAX);
  save(s);
  return sess;
}

/** The user followed a plan — reflect it into the lead persona's running count. Idempotent per session. */
export function markUsed(id: string): void {
  const s = load();
  const sess = s.sessions.find((x) => x.id === id);
  if (!sess || sess.used) return;
  sess.used = true;
  if (sess.leadPersona) s.leadCounts[sess.leadPersona] = (s.leadCounts[sess.leadPersona] || 0) + 1;
  save(s);
}

export function listSessions(): CouncilSession[] { return load().sessions; }
export function leadCounts(): Partial<Record<MusicPersonaId, number>> { return load().leadCounts; }
export function totalUsed(): number { return load().sessions.filter((x) => x.used).length; }
export function clearCouncilHistory(): void { save({ sessions: [], leadCounts: {} }); }
