// motionCouncilStore — client-side persistence for the Motion Council: a short history of the questions you
// asked, and running counts of which director LED the plan you actually used. The art council keeps evolving
// profiles server-side; the motion council is client-only for now, so this lives in localStorage. Mirrors
// services/melos/council/musicCouncilStore.
import type { MotionBrief, MotionDeliberation, MotionPersonaId } from './motionCouncilTypes';

const KEY = 'plajah_motion_council_v1';
const MAX = 40;

export interface CouncilSession {
  id: string;
  at: number;
  ask: string;
  medium?: string;
  leadPersona?: MotionPersonaId;   // whose move topped the plan
  grounded: boolean;
  source: 'ai' | 'local';
  used?: boolean;                  // the user marked the plan as followed
}
interface Store { sessions: CouncilSession[]; leadCounts: Partial<Record<MotionPersonaId, number>>; }

function load(): Store {
  try { const s = JSON.parse(localStorage.getItem(KEY) || ''); if (s && Array.isArray(s.sessions)) return s; } catch { /* */ }
  return { sessions: [], leadCounts: {} };
}
function save(s: Store): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ } }

/** Record a deliberation. The lead is the director whose move heads the plan (else the first proposal). */
export function saveSession(brief: MotionBrief, del: MotionDeliberation): CouncilSession {
  const s = load();
  const lead = del.plan?.find(m => m.personaId)?.personaId || del.proposals?.[0]?.personaId;
  const sess: CouncilSession = {
    id: 'ms' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: Date.now(), ask: brief.ask, medium: brief.medium,
    leadPersona: lead, grounded: del.grounded, source: del.source,
  };
  s.sessions.unshift(sess);
  if (s.sessions.length > MAX) s.sessions = s.sessions.slice(0, MAX);
  save(s);
  return sess;
}

/** The user followed a plan — reflect it into the lead director's running count. Idempotent per session. */
export function markUsed(id: string): void {
  const s = load();
  const sess = s.sessions.find(x => x.id === id);
  if (!sess || sess.used) return;
  sess.used = true;
  if (sess.leadPersona) s.leadCounts[sess.leadPersona] = (s.leadCounts[sess.leadPersona] || 0) + 1;
  save(s);
}

export function listSessions(): CouncilSession[] { return load().sessions; }
export function leadCounts(): Partial<Record<MotionPersonaId, number>> { return load().leadCounts; }
export function totalUsed(): number { return load().sessions.filter(x => x.used).length; }
export function clearCouncilHistory(): void { save({ sessions: [], leadCounts: {} }); }
